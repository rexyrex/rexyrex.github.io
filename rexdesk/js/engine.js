// The engine: everything between the socket and the canvas. It owns the connection, opens and
// seals records, decodes and draws video, decodes sound, pings, reconnects, and paces pointer
// moves. It normally runs in a worker (engine.worker.js), so none of that waits for the page,
// and a page in a background tab keeps its connection alive. The page talks to it in small
// messages: commands in (`handle`), events out (`emit`).

import { toHex } from './bytes.js';
import * as crypto from './crypto.js';
import { Type, encode, decode } from './protocol.js';
import { RendezvousClient, DEFAULT_SERVICE } from './rendezvous.js';
import { ViewerSession } from './session.js';
import { VideoPipeline, capabilities } from './video.js';
import { AudioPipeline, audioSupported } from './audio.js';
import { loadIdentity } from './store.js';

const now = () => performance.now();
const nowUs = () => Math.round(performance.now() * 1000);

const RECONNECT_FOR_MS = 30_000;
const MOVE_INTERVAL_MS = 8;         // pointer moves: newest wins, at most one per 8 ms
const CONGESTED_BYTES = 64 << 10;   // unsent bytes that mean the uplink is behind

export class Engine {
    constructor(emit) {
        this.emit = emit;
        this.identity = null;
        this.caps = { codecs: [], maxWidth: 0, maxHeight: 0 };
        this.codecs = [];
        this.service = DEFAULT_SERVICE;
        this.deviceName = 'Browser';
        this.video = null;
        this.audio = null;
        this.session = null;
        this.target = null;
        this.request = {};
        this.password = null;
        this.remember = false;
        this.reconnect = null;      // { until, attempt, timer }
        this.stream = null;
        this.hostStats = null;
        this.rttMs = 0;
        this.connectId = 0;         // the page's number for this connect: its events carry it
        this.lastSentMove = null;
        this.statsTimer = null;
        this.bytesAt = 0;
        this.pendingMove = null;
        this.lastMoveAt = 0;
        this.moveTimer = null;
        this.paused = false;
        this.ready = null;
        this.warm = null;           // { client, service, timer }: a control socket a lookup left open
    }

    /** One command from the page. Never throws: failures come back as events. */
    handle(command) {
        const handler = this['on_' + command.t];
        if (!handler) return;
        try {
            const result = handler.call(this, command);
            if (result?.catch) result.catch((error) => this.log('error', `${command.t}: ${error?.message || error}`));
        } catch (error) {
            this.log('error', `${command.t}: ${error?.message || error}`);
        }
    }

    log(level, text) {
        this.emit({ t: 'log', level, text });
    }

    // MARK: Setup

    on_init({ canvas, service, deviceName, only }) {
        if (service) this.service = service;
        if (deviceName) this.deviceName = deviceName;
        this.ready = (async () => {
            const [{ identity, persistent }, caps] = await Promise.all([loadIdentity(), capabilities()]);
            this.identity = identity;
            if (only) caps.codecs = caps.codecs.filter((c) => only.includes(c));
            this.caps = caps;
            this.codecs = caps.codecs.slice();
            if (canvas && caps.codecs.length) {
                this.video = new VideoPipeline(canvas, {
                    needKeyframe: () => this.session?.send(encode.requestKeyframe()),
                    size: (width, height) => this.emit({ t: 'size', width, height }),
                    failed: (codec, message) => this.codecFailed(codec, message),
                });
            }
            this.emit({
                t: 'ready', fingerprint: toHex(identity.fingerprint), shortFingerprint: crypto.shortFingerprint(identity.fingerprint),
                persistent, codecs: caps.codecs, sound: audioSupported(),
            });
        })();
        return this.ready;
    }

    on_config({ service, deviceName }) {
        if (service) this.service = service;
        if (deviceName) this.deviceName = deviceName;
    }

    /** The MessagePort that leads to the audio thread's jitter buffer. */
    on_audio({ port }) {
        this.audio?.close();
        this.audio = port ? new AudioPipeline(port) : null;
        // Sign-in can win the race with the audio thread starting: ask for sound now.
        if (this.audio && this.request.audio && this.session?.authenticated && audioSupported()) {
            this.session.send(encode.updateStream(this.paused ? { audio: true, paused: true } : { audio: true }));
        }
    }

    // MARK: Finding hosts

    async on_lookup({ id, hostId }) {
        await this.ready;
        const hex = crypto.normalizeHostId(hostId);
        if (!hex) return this.emit({ t: 'lookup', id, error: 'That is not a Host ID. It looks like 4F2A-9C1B-77D0-E3A8, in RexDesk Host’s menu.' });
        const client = new RendezvousClient(this.service, this.identity, this.deviceName);
        try {
            await client.open();
            const found = await client.lookup(hex);
            if (found.fingerprint) {
                // The connect that follows a found Host ID uses this same socket.
                this.dropWarm();
                this.warm = { client, service: this.service, timer: setTimeout(() => this.dropWarm(), 5000) };
                this.emit({ t: 'lookup', id, fingerprint: found.fingerprint, name: found.name });
                return;
            }
            this.emit({ t: 'lookup', id, error: 'No Mac with that Host ID is online. Is RexDesk Host running, with internet access on?' });
        } catch (error) {
            this.emit({ t: 'lookup', id, error: error.message });
        }
        client.close();
    }

    dropWarm() {
        const warm = this.warm;
        this.warm = null;
        if (warm) { clearTimeout(warm.timer); warm.client.close(); }
    }

    takeWarm() {
        const warm = this.warm;
        this.warm = null;
        if (!warm) return null;
        clearTimeout(warm.timer);
        if (warm.service === this.service) return warm.client;
        warm.client.close();
        return null;
    }

    /** Which saved Macs are online right now. */
    async on_status({ fingerprints }) {
        await this.ready;
        if (!fingerprints?.length) return;
        const client = new RendezvousClient(this.service, this.identity, this.deviceName);
        try {
            await client.open();
            await Promise.all(fingerprints.map(async (fingerprint) => {
                const found = await client.lookup(fingerprint);
                this.emit({ t: 'online', fingerprint, online: found.online, name: found.name });
            }));
        } catch (_) {
            this.emit({ t: 'online', unreachable: true });
        } finally {
            client.close();
        }
    }

    // MARK: Connecting

    async on_connect({ fingerprint, request, id }) {
        await this.ready;
        this.teardown();
        this.connectId = id || 0;
        this.target = fingerprint;
        this.request = { ...request };
        this.password = null;
        this.remember = false;
        this.reconnect = null;
        this.codecs = this.caps.codecs.slice();
        this.open();
    }

    open() {
        const session = this.session = new ViewerSession({
            identity: this.identity, service: this.service, deviceName: this.deviceName,
            handlers: {
                progress: (text) => this.emit({ t: 'progress', id: this.connectId, text, reconnecting: !!this.reconnect }),
                challenge: (challenge) => {
                    // Reconnecting after a drop: the password typed for this session answers again.
                    if (this.reconnect && this.password !== null && challenge.methods.includes('password')) {
                        session.answer({ method: 'password', password: this.password, remember: this.remember });
                    } else {
                        this.emit({ t: 'challenge', id: this.connectId, methods: challenge.methods });
                    }
                },
                authenticated: (result) => this.authenticated(session, result),
                message: (type, body) => this.message(session, type, body),
                ended: (end) => this.ended(session, end),
            },
        });
        session.connect(this.target, this.takeWarm());
    }

    on_answer({ method, password, remember }) {
        if (!this.session) return;
        this.password = method === 'password' ? password : null;
        this.remember = !!remember;
        return this.session.answer({ method, password, remember });
    }

    on_disconnect() {
        this.connectId = 0;
        this.dropWarm();
        this.teardown();
        this.target = null;
        this.password = null;
    }

    /** Ends the session quietly: timers off, decoder closed, the host told. */
    teardown() {
        clearInterval(this.statsTimer);
        clearTimeout(this.moveTimer);
        clearTimeout(this.reconnect?.timer);
        this.statsTimer = this.moveTimer = null;
        this.pendingMove = null;
        this.reconnect = null;
        this.stream = null;
        this.hostStats = null;
        const session = this.session;
        this.session = null;
        session?.close();
        this.video?.stop();
        this.audio?.close();
    }

    authenticated(session, result) {
        if (session !== this.session) return;
        this.reconnect = null;
        this.emit({ t: 'authenticated', id: this.connectId, host: result.host || {}, displays: result.displays || [], codecs: result.codecs || [], trusted: !!result.trusted });
        session.send(encode.startStream(this.streamRequest()));
        if (this.paused) session.send(encode.updateStream({ paused: true }));
        this.bytesAt = session.channel.bytesReceived;
        this.statsTimer = setInterval(() => this.stats(session), 1000);
    }

    streamRequest() {
        const r = this.request;
        return {
            displayId: r.displayId || 0,
            codecs: this.codecs,
            maxWidth: this.caps.maxWidth, maxHeight: this.caps.maxHeight,
            targetWidth: r.targetWidth || 0, targetHeight: r.targetHeight || 0,
            maxFps: r.maxFps || 60,
            quality: r.quality || 'auto',
            maxBitrateKbps: 0,
            localCursor: r.localCursor !== false,
            audio: !!r.audio && !!this.audio && audioSupported(),
        };
    }

    /** Changes to the stream: a display, a quality, a new size, sound on or off. */
    on_stream({ changes }) {
        Object.assign(this.request, changes);
        const update = { ...changes };
        if ('audio' in update) update.audio = !!update.audio && !!this.audio && audioSupported();
        if (!update.audio && 'audio' in update) this.audio?.close();
        // While nobody is looking, a change must not restart the stream (an UPDATE_STREAM without
        // `paused` does): the host notes it and stays paused.
        if (this.paused) update.paused = true;
        this.session?.send(encode.updateStream(update));
    }

    /** The page is hidden (or back): the host stops capturing while nobody is looking. */
    on_pause({ paused }) {
        if (paused === this.paused) return;
        this.paused = paused;
        if (paused) this.audio?.close();
        this.session?.send(encode.updateStream(paused ? { paused: true } : {}));
    }

    codecFailed(codec, message) {
        this.log('warn', `this browser could not decode ${codec} (${message})`);
        this.codecs = this.codecs.filter((c) => c !== codec);
        if (this.codecs.length === 0) {
            const session = this.session;
            this.teardown();
            if (session) this.emit({ t: 'ended', id: this.connectId, kind: 'decoder', message: 'This browser could not decode the video.' });
            return;
        }
        this.session?.send(encode.updateStream({ codecs: this.codecs }));
    }

    // MARK: The session's messages

    message(session, type, body) {
        if (session !== this.session) return;
        switch (type) {
            case Type.VIDEO_FRAME: {
                const frame = decode(type, body);
                // §6: acknowledged on arrival, before decoding; the host paces itself on these.
                session.send(encode.frameAck(frame.frameId, this.video?.lastDecodeUs || 0));
                this.video?.frame(frame);
                break;
            }
            case Type.AUDIO_PACKET:
                if (!this.paused) this.audio?.packet(decode(type, body));
                break;
            case Type.CURSOR_POSITION:
                this.emit({ t: 'cursorPosition', ...decode(type, body) });
                break;
            case Type.CURSOR_SHAPE: {
                const shape = decode(type, body);
                const png = shape.png.slice().buffer;
                this.emit({ t: 'cursorShape', ...shape, png }, [png]);
                break;
            }
            case Type.PONG: {
                const rtt = (nowUs() - decode(type, body).echoedUs) / 1000;
                this.rttMs = this.rttMs ? this.rttMs * 0.7 + rtt * 0.3 : rtt;
                break;
            }
            case Type.PING: {
                const ping = decode(type, body);
                session.send(encode.pong(ping.id, ping.sendTimeUs, nowUs()));
                break;
            }
            case Type.STREAM_STARTED:
                this.stream = decode(type, body);
                this.video?.start(this.stream);
                this.emit({ t: 'started', stream: this.stream });
                break;
            case Type.STREAM_STATS:
                this.hostStats = decode(type, body);
                break;
            case Type.HOST_INFO:
                this.emit({ t: 'displays', displays: decode(type, body).displays || [] });
                break;
            case Type.CLIPBOARD:
                this.emit({ t: 'clipboard', text: String(decode(type, body).text ?? '') });
                break;
            case Type.AUDIO_CONFIG:
                this.audio?.config(decode(type, body));
                break;
            default:
                break;
        }
    }

    stats(session) {
        if (session !== this.session || !session.channel) return;
        const bytes = session.channel.bytesReceived;
        const video = this.video?.takeStats() || { shown: 0, decodeMs: 0, dropped: 0, queue: 0 };
        this.emit({
            t: 'stats', fps: video.shown, decodeMs: video.decodeMs, dropped: video.dropped, queue: video.queue,
            rttMs: this.rttMs, kbps: Math.round((bytes - this.bytesAt) * 8 / 1000),
            codec: this.stream?.chroma444 ? 'hevc444' : this.stream?.codec, width: this.stream?.width, height: this.stream?.height,
            host: this.hostStats, unsent: session.channel.bufferedAmount,
        });
        this.bytesAt = bytes;
    }

    ended(session, end) {
        if (session !== this.session) return;
        const wasLive = session.authenticated;
        clearInterval(this.statsTimer);
        clearTimeout(this.moveTimer);
        this.statsTimer = this.moveTimer = null;
        this.pendingMove = null;
        this.session = null;
        this.video?.stop();
        this.audio?.close();
        // A session that was up and dropped is tried again for a while, as the other viewers do.
        const dropped = end.kind === 'lost' || end.kind === 'unreachable' || end.kind === 'offline';
        if (dropped && (wasLive || this.reconnect)) {
            const state = this.reconnect || { until: now() + RECONNECT_FOR_MS, attempt: 0 };
            if (now() < state.until) {
                state.attempt++;
                this.reconnect = state;
                this.emit({ t: 'reconnecting', id: this.connectId, attempt: state.attempt, message: end.message });
                state.timer = setTimeout(() => this.open(), Math.min(4000, 400 * state.attempt));
                return;
            }
        }
        this.reconnect = null;
        this.password = null;
        this.emit({
            t: 'ended', id: this.connectId, kind: end.kind, message: end.message,
            error: end.detail?.error || null, retryAfterSec: end.detail?.retryAfterSec || 0,
        });
    }

    // MARK: Input

    /** Any input message the page has already encoded (keys, buttons, scrolls, text). */
    on_input({ bytes }) {
        if (!this.session?.authenticated) return;
        this.flushMove();
        this.session.send(new Uint8Array(bytes));
    }

    /**
     * Pointer moves are newest-wins: the latest position replaces one still waiting, at most one
     * leaves per 8 ms, and none while the uplink is behind (a queue of old positions is lag).
     */
    on_move({ x, y }) {
        const sent = this.lastSentMove;
        if (!this.pendingMove && sent && sent[0] === x && sent[1] === y) return;
        this.pendingMove = [x, y];
        if (this.moveTimer) return;
        const wait = MOVE_INTERVAL_MS - (now() - this.lastMoveAt);
        if (wait <= 0 && !this.congested()) this.flushMove();
        else this.moveTimer = setTimeout(() => this.moveTick(), Math.max(1, wait));
    }

    moveTick() {
        this.moveTimer = null;
        if (!this.pendingMove) return;
        if (this.congested()) this.moveTimer = setTimeout(() => this.moveTick(), 4);
        else this.flushMove();
    }

    congested() {
        return (this.session?.channel?.bufferedAmount || 0) > CONGESTED_BYTES;
    }

    flushMove() {
        const move = this.pendingMove;
        if (!move || !this.session?.authenticated) return;
        this.pendingMove = null;
        this.lastMoveAt = now();
        this.lastSentMove = move;
        this.session.send(encode.pointerMove(move[0], move[1]));
    }

    on_clipboard({ text }) {
        this.session?.send(encode.clipboard(text));
    }

    on_keyframe() {
        this.session?.send(encode.requestKeyframe());
    }
}
