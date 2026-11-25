// The rendezvous service (docs/RENDEZVOUS.md), from a browser: the control socket that finds a
// host and asks for an introduction, and the relay socket that then carries protocol v1.
// A browser cannot open UDP sockets, so it offers no candidates and always takes the relay.

import { concat, utf8, toBase64, fromBase64, toHex } from './bytes.js';

export const DEFAULT_SERVICE = 'wss://rexdesk.rexy.win';
const SIG_LABEL = utf8('RexDesk-rdv-v1');

export class ServiceError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

/** "wss://host" (or https://, or bare "host") → "wss://host" without a trailing slash; null when it is not a URL. */
export function normalizeService(text) {
    let s = String(text || '').trim();
    if (!s) return DEFAULT_SERVICE;
    if (!/^[a-z]+:\/\//i.test(s)) s = 'wss://' + s;
    s = s.replace(/^http(s?):\/\//i, 'ws$1://');
    try {
        const url = new URL(s);
        if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return null;
        return url.origin.replace(/^http/, 'ws') + url.pathname.replace(/\/+$/, '');
    } catch (_) {
        return null;
    }
}

export const relayUrl = (service, session) => `${service}/v1/relay/${session}?role=viewer`;

/** The control socket, signed in as a viewer with this device's identity. */
export class RendezvousClient {
    constructor(service, identity, name) {
        this.service = service;
        this.identity = identity;
        this.name = name;
        this.ws = null;
        this.waiters = [];      // { match(message) → value | undefined, resolve, reject }
        this.closedReason = null;
        this.keepAlive = null;
        this.observed = null;
    }

    /** Resolves once the service has verified our key. */
    open(timeoutMs = 10_000) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const done = (error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (error) { this.close(); reject(error); } else resolve();
            };
            const timer = setTimeout(() => done(new ServiceError('The rendezvous service did not answer.', 'timeout')), timeoutMs);
            let ws;
            try {
                ws = this.ws = new WebSocket(`${this.service}/v1/connect`);
            } catch (_) {
                return done(new ServiceError('The rendezvous service address cannot be opened from this page.', 'bad_url'));
            }
            ws.onmessage = async (event) => {
                if (typeof event.data !== 'string') return;
                let m;
                try { m = JSON.parse(event.data); } catch (_) { return; }
                if (m.type === 'challenge') {
                    try {
                        const sig = await this.identity.sign(concat(SIG_LABEL, fromBase64(m.nonce)));
                        ws.send(JSON.stringify({ type: 'hello', role: 'viewer', key: toBase64(this.identity.publicKey), sig: toBase64(sig), name: this.name }));
                    } catch (error) {
                        done(new ServiceError(String(error.message || error), 'sign'));
                    }
                } else if (m.type === 'welcome') {
                    this.observed = m.observed || null;
                    // Browsers cannot send WebSocket pings; the service answers this instead (and
                    // an idle socket through a proxy would otherwise be closed).
                    this.keepAlive = setInterval(() => this.sendJSON({ type: 'ping', t: Date.now() }), 20_000);
                    done();
                } else {
                    this.dispatch(m);
                }
            };
            ws.onerror = () => done(new ServiceError('Could not reach the rendezvous service.', 'unreachable'));
            ws.onclose = (event) => {
                this.closedReason = event.code === 4003 ? 'bad_signature' : 'closed';
                done(new ServiceError('Could not reach the rendezvous service.', 'unreachable'));
                clearInterval(this.keepAlive);
                for (const w of this.waiters.splice(0)) w.reject(new ServiceError('The rendezvous service closed the connection.', 'closed'));
            };
        });
    }

    sendJSON(object) {
        if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(object));
    }

    dispatch(m) {
        for (let i = 0; i < this.waiters.length; i++) {
            let value;
            try { value = this.waiters[i].match(m); } catch (error) {
                this.waiters.splice(i, 1)[0].reject(error);
                return;
            }
            if (value !== undefined) {
                this.waiters.splice(i, 1)[0].resolve(value);
                return;
            }
        }
    }

    wait(match, timeoutMs, what) {
        return new Promise((resolve, reject) => {
            const waiter = { match };
            const timer = setTimeout(() => {
                const i = this.waiters.indexOf(waiter);
                if (i >= 0) this.waiters.splice(i, 1);
                reject(new ServiceError(what, 'timeout'));
            }, timeoutMs);
            waiter.resolve = (v) => { clearTimeout(timer); resolve(v); };
            waiter.reject = (e) => { clearTimeout(timer); reject(e); };
            this.waiters.push(waiter);
        });
    }

    /**
     * Looks a host up by full fingerprint (64 hex) or Host ID (16 hex).
     * → `{ fingerprint | null, online, name }`. An answer to a Host ID must start with the typed
     * digits; the handshake then checks the key itself.
     */
    lookup(hex, timeoutMs = 8_000) {
        this.sendJSON({ type: 'lookup', host: hex });
        return this.wait((m) => {
            if (m.type === 'error' && m.code === 'rate_limited' && !m.session) throw new ServiceError('Too many lookups. Try again in a minute.', 'rate_limited');
            if (m.type !== 'host') return undefined;
            if (hex.length === 64 ? m.host !== hex : m.query !== hex) return undefined;
            const found = typeof m.host === 'string' && m.host.length === 64 && m.host.startsWith(hex) ? m.host : null;
            return { fingerprint: found, online: !!m.online && !!found, name: m.name || null };
        }, timeoutMs, 'The rendezvous service did not answer.');
    }

    /** Asks the host for an introduction; resolves when it accepts. */
    connect(fingerprintHex, session, timeoutMs = 10_000) {
        this.sendJSON({ type: 'connect', host: fingerprintHex, session, candidates: [] });
        return this.wait((m) => {
            if (m.type === 'accepted' && m.session === session) return m;
            if (m.type === 'error' && (!m.session || m.session === session)) {
                throw new ServiceError(
                    m.code === 'offline' ? 'That Mac is not online. Is RexDesk Host running, with internet access on?'
                        : m.code === 'rate_limited' ? 'Too many connection attempts. Try again in a minute.'
                            : `The rendezvous service said ${m.code}.`, m.code);
            }
            return undefined;
        }, timeoutMs, 'The Mac did not answer the introduction. Is RexDesk Host running?');
    }

    requestRelay(session) {
        this.sendJSON({ type: 'relay', session });
    }

    close() {
        clearInterval(this.keepAlive);
        const ws = this.ws;
        this.ws = null;
        if (ws) {
            ws.onmessage = ws.onerror = ws.onclose = null;
            try { ws.close(); } catch (_) { /* already closed */ }
        }
        for (const w of this.waiters.splice(0)) w.reject(new ServiceError('Cancelled.', 'cancelled'));
    }
}

/**
 * The relay socket as a byte-stream transport for SecureChannel. Text messages ("paired") are
 * the service's own; every binary message carries some bytes of the v1 stream.
 */
export function openRelay(url, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
        let ws;
        try { ws = new WebSocket(url); } catch (_) { return reject(new ServiceError('The relay address cannot be opened from this page.', 'bad_url')); }
        ws.binaryType = 'arraybuffer';
        const transport = {
            ondata: null,
            onclose: null,
            pending: [],
            get bufferedAmount() { return ws.bufferedAmount; },
            send(bytes) { if (ws.readyState === 1) ws.send(bytes); },
            close() { ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(); } catch (_) { /* closed */ } },
        };
        const timer = setTimeout(() => { transport.close(); reject(new ServiceError('The relay did not open.', 'timeout')); }, timeoutMs);
        ws.onopen = () => { clearTimeout(timer); resolve(transport); };
        ws.onerror = () => { clearTimeout(timer); reject(new ServiceError('Could not reach the relay.', 'unreachable')); };
        ws.onmessage = (event) => {
            if (typeof event.data === 'string') return;
            transport.ondata?.(new Uint8Array(event.data));
        };
        ws.onclose = (event) => {
            clearTimeout(timer);
            const why = { 4005: 'Another viewer took this connection.', 4006: 'The relay lost the connection.', 4007: 'The Mac did not join the relay.' }[event.code];
            transport.onclose?.(why || 'The connection closed.');
        };
    });
}

/** A fresh 16-byte session id, hex. */
export const newSession = () => toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
