// A viewer's connection to one host, from "find it" to "signed in" (docs/RENDEZVOUS.md §1–2,
// docs/PROTOCOL.md §5): the rendezvous introduction, the relay, the handshake against the pinned
// fingerprint, CLIENT_AUTH, and the password or approval the host asks for.

import { toBase64, fromBase64, fromHex, toHex } from './bytes.js';
import * as crypto from './crypto.js';
import { SecureChannel } from './channel.js';
import { RendezvousClient, ServiceError, relayUrl, openRelay, newSession } from './rendezvous.js';
import { Type, encode, decode, clientSignatureMessage } from './protocol.js';

export const APP_VERSION = '0.5.0';
const SILENCE_MS = 10_000;     // §9: either side closes a connection that has been silent for 10 s

/** Why a session ended, for the UI: `kind` picks the wording and whether to retry. */
export class SessionEnd {
    constructor(kind, message, detail = null) {
        this.kind = kind;       // 'cancelled' | 'unreachable' | 'offline' | 'identity' | 'auth' | 'replaced' | 'host' | 'lost'
        this.message = message;
        this.detail = detail;   // AUTH_RESULT for 'auth'
    }
}

export class ViewerSession {
    /**
     * `handlers`: `progress(text)`, `challenge({ methods })`, `authenticated(result)`,
     * `message(type, body)` (everything after sign-in), `ended(SessionEnd)`.
     */
    constructor({ identity, service, deviceName, platform = 'web', handlers }) {
        this.identity = identity;
        this.service = service;
        this.deviceName = deviceName;
        this.platform = platform;
        this.handlers = handlers;
        this.channel = null;
        this.rendezvous = null;
        this.challenge = null;
        this.result = null;
        this.done = false;
        this.pingTimer = null;
        this.pingId = 0;
    }

    get authenticated() { return !!this.result?.ok; }

    /**
     * Connects to the host with this fingerprint (64 hex). Resolves once CLIENT_AUTH is on its way.
     * `open`: a control socket that is already signed in (the one a Host ID lookup just used),
     * which saves opening another.
     */
    async connect(fingerprintHex, open = null) {
        const session = newSession();
        const reuse = open && open.ws?.readyState === 1;
        if (open && !reuse) open.close();
        const rendezvous = this.rendezvous = reuse ? open : new RendezvousClient(this.service, this.identity, this.deviceName);
        try {
            if (this.done) throw new SessionEnd('cancelled', 'Cancelled.');
            if (!reuse) {
                this.handlers.progress?.('Contacting the rendezvous service…');
                await rendezvous.open();
            }
            this.check();
            this.handlers.progress?.('Finding the Mac…');
            await rendezvous.connect(fingerprintHex, session);
            this.check();
            this.handlers.progress?.('Connecting through the relay…');
            rendezvous.requestRelay(session);
            const transport = await openRelay(relayUrl(this.service, session));
            if (this.done) { transport.close(); return; }
            let channel;
            try {
                channel = await SecureChannel.handshake(transport, { expectFingerprint: fromHex(fingerprintHex) });
            } catch (error) {
                throw /identity/.test(error.message) ? new SessionEnd('identity', error.message) : error;
            }
            if (this.done) { channel.close(); return; }
            this.adopt(channel);
        } catch (error) {
            if (error instanceof SessionEnd) this.end(error);
            else if (error instanceof ServiceError && error.code === 'cancelled') this.end(new SessionEnd('cancelled', 'Cancelled.'));
            else if (error instanceof ServiceError && error.code === 'offline') this.end(new SessionEnd('offline', error.message));
            else this.end(new SessionEnd('unreachable', error.message || 'Could not connect.'));
        } finally {
            // The control socket has done its job once the relay carries the session.
            rendezvous.close();
            if (this.rendezvous === rendezvous) this.rendezvous = null;
        }
    }

    check() {
        if (this.done) throw new SessionEnd('cancelled', 'Cancelled.');
    }

    adopt(channel) {
        this.channel = channel;
        channel.onmessage = (type, body) => this.receive(type, body);
        channel.onclose = (error) => this.end(new SessionEnd('lost', error || 'The connection closed.'));
        // §9: a ping a second from the handshake on, not from sign-in: the host closes a
        // connection that is silent for 10 s, and a password can take longer than that to type.
        // The same clock notices a host that has gone quiet.
        this.pingTimer = setInterval(() => {
            if (performance.now() - channel.lastReceived > SILENCE_MS) {
                this.fail(new SessionEnd('lost', 'The connection went silent.'));
                return;
            }
            channel.send(encode.ping(++this.pingId >>> 0, Math.round(performance.now() * 1000)));
        }, 1000);
        // CLIENT_AUTH holds nothing secret; the host's key was already checked against the pin.
        this.handlers.progress?.('Signing in…');
        this.identity.sign(clientSignatureMessage(channel.sessionHash)).then((signature) => {
            channel.send(encode.clientAuth({
                deviceName: this.deviceName, platform: this.platform, appVersion: APP_VERSION,
                identityKey: toBase64(this.identity.publicKey), signature: toBase64(signature),
            }));
        }, (error) => this.fail(new SessionEnd('lost', String(error.message || error))));
    }

    receive(type, body) {
        if (this.done) return;
        if (!this.authenticated) {
            if (type === Type.AUTH_CHALLENGE) {
                this.challenge = decode(type, body);
                this.handlers.challenge?.({ methods: this.challenge.methods || [] });
            } else if (type === Type.AUTH_RESULT) {
                const result = decode(type, body);
                if (result.ok) {
                    this.result = result;
                    this.handlers.authenticated?.(result);
                } else {
                    this.fail(new SessionEnd('auth', result.message || 'The Mac refused the connection.', result));
                }
            } else if (type === Type.DISCONNECT) {
                this.disconnected(decode(type, body));
            }
            return;
        }
        if (type === Type.DISCONNECT) return this.disconnected(decode(type, body));
        this.handlers.message?.(type, body);
    }

    disconnected(info) {
        const kind = info.reason === 'replaced' ? 'replaced' : 'host';
        const message = info.reason === 'replaced' ? 'Another device connected to this Mac.'
            : info.reason === 'host_shutdown' ? 'RexDesk Host was quit on the Mac.'
                : info.message || 'The Mac ended the session.';
        this.fail(new SessionEnd(kind, message));
    }

    /** Answers the host's challenge: `{ method: 'password', password, remember }` or `{ method: 'approval', remember }`. */
    async answer({ method, password, remember }) {
        const channel = this.channel;
        const challenge = this.challenge;
        if (!channel || !challenge || this.done) return;
        if (method === 'approval') {
            channel.send(encode.authResponse({ method: 'approval', remember: !!remember }));
            return;
        }
        // The password never leaves this device: PBKDF2, then an HMAC bound to this session.
        const key = await crypto.passwordKey(password, fromBase64(challenge.salt), challenge.iterations);
        const proof = await crypto.passwordProof(key, channel.sessionHash);
        key.fill(0);
        if (!this.done) channel.send(encode.authResponse({ method: 'password', proof: toBase64(proof), remember: !!remember }));
    }

    send(bytes) {
        if (this.authenticated) this.channel.send(bytes);
    }

    /** The person left: tells the host, then closes. Never calls `ended`. */
    close() {
        if (this.done) return;
        this.done = true;
        clearInterval(this.pingTimer);
        this.rendezvous?.close();
        const channel = this.channel;
        if (channel) {
            if (!channel.closed) channel.send(encode.disconnect('user'));
            channel.close();
        }
    }

    fail(end) {
        const channel = this.channel;
        if (channel) channel.close();
        this.end(end);
    }

    end(end) {
        if (this.done) return;
        this.done = true;
        clearInterval(this.pingTimer);
        this.rendezvous?.close();
        this.handlers.ended?.(end);
    }
}

export { toHex };
