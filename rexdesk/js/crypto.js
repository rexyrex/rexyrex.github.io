// The cryptography of protocol v1 (docs/PROTOCOL.md §3–5) on WebCrypto: P-256 ECDH and ECDSA,
// HKDF-SHA256, AES-256-GCM records, PBKDF2 + HMAC for the password proof. The same code runs in
// a page, in a worker and under Node (the vector tests).

import { concat, utf8, toHex, Writer } from './bytes.js';

const subtle = globalThis.crypto.subtle;
const P256 = { name: 'ECDH', namedCurve: 'P-256' };
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };

export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
export const sha256 = async (bytes) => new Uint8Array(await subtle.digest('SHA-256', bytes));

// MARK: Fingerprints (§3.1)

export const fingerprint = (publicKeyX963) => sha256(publicKeyX963);

/** "4F2A-9C1B-77D0-E3A8": the first 8 bytes, what people compare and what a Host ID is. */
export function shortFingerprint(fp) {
    const hex = (typeof fp === 'string' ? fp : toHex(fp)).slice(0, 16).toUpperCase();
    return hex.match(/.{4}/g).join('-');
}

/** A typed or pasted Host ID (any case, dashes, spaces, a "Host ID:" label) → 16 hex digits, or null. */
export function normalizeHostId(text) {
    const hex = String(text).replace(/host\s*id\s*:?/i, '').toLowerCase().replace(/[^0-9a-f]/g, '');
    return hex.length === 16 ? hex : null;
}

// MARK: Signatures

/** WebCrypto signs to r ‖ s (64 bytes); the protocol carries DER. */
export function derFromRaw(raw) {
    const int = (bytes) => {
        let i = 0;
        while (i < bytes.length - 1 && bytes[i] === 0) i++;
        let v = bytes.subarray(i);
        if (v[0] & 0x80) v = concat(Uint8Array.of(0), v);
        return concat(Uint8Array.of(0x02, v.length), v);
    };
    const body = concat(int(raw.subarray(0, 32)), int(raw.subarray(32, 64)));
    return concat(Uint8Array.of(0x30, body.length), body);
}

/** DER → r ‖ s, or null when it is not a P-256 signature. */
export function rawFromDer(der) {
    try {
        let at = 0;
        if (der[at++] !== 0x30) return null;
        let length = der[at++];
        if (length & 0x80) { const n = length & 0x7f; length = 0; for (let i = 0; i < n; i++) length = (length << 8) | der[at++]; }
        if (at + length !== der.length) return null;
        const out = new Uint8Array(64);
        for (let part = 0; part < 2; part++) {
            if (der[at++] !== 0x02) return null;
            const n = der[at++];
            let v = der.subarray(at, at + n);
            at += n;
            while (v.length > 32 && v[0] === 0) v = v.subarray(1);
            if (v.length > 32) return null;
            out.set(v, part * 32 + 32 - v.length);
        }
        return at === der.length ? out : null;
    } catch (_) {
        return null;
    }
}

export async function verify(publicKeyX963, message, signatureDer) {
    const raw = rawFromDer(signatureDer);
    if (!raw) return false;
    try {
        const key = await subtle.importKey('raw', publicKeyX963, ECDSA, false, ['verify']);
        return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, message);
    } catch (_) {
        return false;
    }
}

// MARK: Identity

/**
 * This device's long-term signing key. The private half is a non-extractable CryptoKey: the page
 * can sign with it and store it (IndexedDB keeps CryptoKeys), but never read it.
 */
export class Identity {
    constructor(privateKey, publicKeyX963, fp) {
        this.privateKey = privateKey;
        this.publicKey = publicKeyX963;
        this.fingerprint = fp;
    }
    static async generate() {
        const pair = await subtle.generateKey(ECDSA, false, ['sign', 'verify']);
        return Identity.from(pair.privateKey, pair.publicKey);
    }
    static async from(privateKey, publicKey) {
        const x963 = new Uint8Array(await subtle.exportKey('raw', publicKey));
        return new Identity(privateKey, x963, await fingerprint(x963));
    }
    /** From a PKCS#8 private key and its public key (tests). */
    static async importPkcs8(pkcs8, publicKeyX963) {
        const key = await subtle.importKey('pkcs8', pkcs8, ECDSA, false, ['sign']);
        return new Identity(key, publicKeyX963, await fingerprint(publicKeyX963));
    }
    async sign(message) {
        return derFromRaw(new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.privateKey, message)));
    }
}

// MARK: Key agreement (§3.3)

export async function generateEphemeral() {
    const pair = await subtle.generateKey(P256, false, ['deriveBits']);
    return { privateKey: pair.privateKey, publicKey: new Uint8Array(await subtle.exportKey('raw', pair.publicKey)) };
}

/** The 32-byte X coordinate. */
export async function sharedSecret(privateKey, peerPublicX963) {
    const peer = await subtle.importKey('raw', peerPublicX963, P256, false, []);
    return new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256));
}

export async function hkdf(ikm, salt, info, length) {
    const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// MARK: Sealed records (§4)

export const importRecordKey = (raw, usage) => subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);

/** nonce = 0x00000000 ‖ u64 counter. */
export function nonce(counter) {
    return new Writer(12).u32(0).u64(counter).bytes;
}

export const seal = (key, counter, plaintext) =>
    subtle.encrypt({ name: 'AES-GCM', iv: nonce(counter), tagLength: 128 }, key, plaintext);

export const open = (key, counter, record) =>
    subtle.decrypt({ name: 'AES-GCM', iv: nonce(counter), tagLength: 128 }, key, record);

// MARK: Password proof (§5.2)

export async function passwordKey(password, salt, iterations) {
    const base = await subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256));
}

export async function passwordProof(key, sessionHash) {
    const mac = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await subtle.sign('HMAC', mac, concat(utf8('RexDesk-v1 password'), sessionHash)));
}
