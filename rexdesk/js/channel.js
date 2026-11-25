// The secure channel of protocol v1 over any ordered byte stream (docs/PROTOCOL.md §2–4): length-
// prefixed frames, a plaintext hello each way, then AES-256-GCM records with a counter nonce.
// In a browser the stream is the rendezvous service's relay WebSocket (docs/RENDEZVOUS.md §2).

import { concat, Writer, toHex } from './bytes.js';
import * as crypto from './crypto.js';
import { clientHello, deriveSession, MAX_FRAME, MAX_HANDSHAKE_FRAME } from './protocol.js';

/**
 * Cuts a byte stream into `u32 length ‖ body` frames. Chunks arrive in any sizes; a frame that
 * lies inside one chunk is returned as a view of it (video frames are not copied here).
 */
export class FrameParser {
    constructor() {
        this.chunks = [];
        this.length = 0;
    }
    push(chunk) {
        if (chunk.length === 0) return;
        this.chunks.push(chunk);
        this.length += chunk.length;
    }
    /** The next whole frame, or null. Throws on a frame longer than `limit`. */
    next(limit = MAX_FRAME) {
        if (this.length < 4) return null;
        const head = this.peek(4);
        const size = ((head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3]) >>> 0;
        if (size === 0 || size > limit) throw new Error('The connection sent a frame of an impossible size.');
        if (this.length < 4 + size) return null;
        this.skip(4);
        return this.take(size);
    }
    peek(n) {
        const first = this.chunks[0];
        if (first.length >= n) return first;
        const out = new Uint8Array(n);
        let at = 0;
        for (const c of this.chunks) {
            const part = c.subarray(0, n - at);
            out.set(part, at);
            at += part.length;
            if (at === n) break;
        }
        return out;
    }
    skip(n) {
        this.length -= n;
        while (n > 0) {
            const first = this.chunks[0];
            if (first.length > n) { this.chunks[0] = first.subarray(n); return; }
            n -= first.length;
            this.chunks.shift();
        }
    }
    take(n) {
        const first = this.chunks[0];
        if (first.length >= n) {
            this.length -= n;
            if (first.length === n) this.chunks.shift(); else this.chunks[0] = first.subarray(n);
            return first.subarray(0, n);
        }
        const out = new Uint8Array(n);
        let at = 0;
        while (at < n) {
            const c = this.chunks[0];
            const part = c.subarray(0, n - at);
            out.set(part, at);
            at += part.length;
            if (part.length === c.length) this.chunks.shift(); else this.chunks[0] = c.subarray(part.length);
        }
        this.length -= n;
        return out;
    }
}

function framed(body) {
    return new Writer(4 + body.length).u32(body.length).put(body).bytes;
}

/**
 * A signed-in-to-nothing-yet channel: the handshake is done, the host's key is verified and its
 * fingerprint known, and messages go both ways sealed. Callers set `onmessage(type, body)` and
 * `onclose(error)`; `body` is a view of a buffer nobody else holds.
 *
 * `transport`: `{ send(Uint8Array), close(), ondata, onclose, bufferedAmount }`.
 */
export class SecureChannel {
    /**
     * Runs the handshake. `expectFingerprint` (32 bytes), when given, must be the host's: a host
     * with another key is refused before anything else is sent (§5.1).
     */
    static async handshake(transport, { expectFingerprint = null, timeoutMs = 10_000 } = {}) {
        const parser = new FrameParser();
        let wake = null;
        let failure = null;
        transport.ondata = (chunk) => { parser.push(chunk); wake?.(); };
        transport.onclose = (error) => { failure = new Error(error || 'The connection closed during the handshake.'); wake?.(); };
        const timer = setTimeout(() => { failure = new Error('The Mac did not answer in time.'); wake?.(); }, timeoutMs);
        try {
            const ephemeral = await crypto.generateEphemeral();
            const hello = clientHello(ephemeral.publicKey, crypto.randomBytes(32));
            transport.send(framed(hello));
            let serverHello = null;
            for (;;) {
                if (failure) throw failure;
                serverHello = parser.next(MAX_HANDSHAKE_FRAME);
                if (serverHello) break;
                await new Promise((resolve) => { wake = resolve; });
            }
            const session = await deriveSession(hello, serverHello, ephemeral.privateKey);
            if (expectFingerprint && toHex(session.hostFingerprint) !== toHex(expectFingerprint)) {
                throw new Error("This is not the Mac you asked for: its identity is different. Nothing was sent to it.");
            }
            const sendKey = await crypto.importRecordKey(session.viewerToHostKey, 'encrypt');
            const receiveKey = await crypto.importRecordKey(session.hostToViewerKey, 'decrypt');
            if (failure) throw failure;
            return new SecureChannel(transport, parser, sendKey, receiveKey, session);
        } catch (error) {
            transport.ondata = transport.onclose = null;
            transport.close();
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    constructor(transport, parser, sendKey, receiveKey, session) {
        this.transport = transport;
        this.parser = parser;
        this.sendKey = sendKey;
        this.receiveKey = receiveKey;
        this.sessionHash = session.sessionHash;
        this.hostFingerprint = session.hostFingerprint;
        this.hostIdentity = session.hostIdentity;
        this.sendCounter = 0;
        this.receiveCounter = 0;
        this.sendTail = Promise.resolve();
        this.receiveTail = Promise.resolve();
        this.closed = false;
        this.onmessage = null;
        this.onclose = null;
        this.lastReceived = performance.now();
        this.bytesReceived = 0;
        transport.ondata = (chunk) => this.receive(chunk);
        transport.onclose = (error) => this.fail(error || null);
        // Anything that arrived with the ServerHello.
        this.receive(new Uint8Array(0));
    }

    /** Bytes handed to the socket that it has not sent yet: what a slow uplink looks like. */
    get bufferedAmount() { return this.transport.bufferedAmount || 0; }

    /**
     * Seals and sends one message. Records are sealed in parallel but leave in counter order: the
     * nonce is taken here, synchronously, and each send waits for the one before it.
     */
    send(plaintext) {
        if (this.closed) return;
        const sealed = crypto.seal(this.sendKey, this.sendCounter++, plaintext);
        this.sendTail = this.sendTail.then(() => sealed).then((record) => {
            if (this.closed) return;
            const frame = new Uint8Array(4 + record.byteLength);
            new DataView(frame.buffer).setUint32(0, record.byteLength);
            frame.set(new Uint8Array(record), 4);
            this.transport.send(frame);
        }).catch((error) => this.fail(String(error?.message || error)));
    }

    receive(chunk) {
        if (this.closed) return;
        this.bytesReceived += chunk.length;
        this.parser.push(chunk);
        try {
            for (let record = this.parser.next(); record; record = this.parser.next()) {
                // Same shape as send: opened in parallel, delivered in order.
                const opened = crypto.open(this.receiveKey, this.receiveCounter++, record);
                this.receiveTail = this.receiveTail.then(() => opened).then((plain) => {
                    if (this.closed || plain.byteLength === 0) return;
                    this.lastReceived = performance.now();
                    const bytes = new Uint8Array(plain);
                    this.onmessage?.(bytes[0], bytes.subarray(1));
                }).catch((error) => {
                    // §4: a record that fails to open ends the connection; a throwing handler does too.
                    this.fail(error?.name === 'OperationError' ? 'The connection was corrupted.' : String(error?.message || error));
                });
            }
        } catch (error) {
            this.fail(error.message);
        }
    }

    fail(error) {
        if (this.closed) return;
        this.closed = true;
        this.transport.ondata = this.transport.onclose = null;
        this.transport.close();
        this.onclose?.(error);
    }

    /** Closes quietly (no `onclose`), after whatever was already sealed has left. */
    close() {
        if (this.closed) return;
        const finish = () => {
            this.closed = true;
            this.transport.ondata = this.transport.onclose = null;
            this.transport.close();
        };
        this.onmessage = this.onclose = null;
        this.sendTail.then(finish, finish);
    }
}

export { framed, concat };
