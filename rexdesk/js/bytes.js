// Bytes: hex, base64, concatenation, and big-endian readers and writers (docs/PROTOCOL.md:
// "All integers are big-endian").

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (text) => encoder.encode(text);
export const fromUtf8 = (bytes) => decoder.decode(bytes);

export function toHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return out;
}

export function fromHex(hex) {
    const out = new Uint8Array(hex.length >> 1);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}

export function toBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

export function fromBase64(text) {
    const s = atob(text);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

export function concat(...parts) {
    let length = 0;
    for (const p of parts) length += p.length;
    const out = new Uint8Array(length);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}

export function equal(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

/** Reads big-endian fields from a Uint8Array without copying it. */
export class Reader {
    constructor(bytes) {
        this.bytes = bytes;
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.at = 0;
    }
    get left() { return this.bytes.length - this.at; }
    u8() { return this.view.getUint8(this.at++); }
    u16() { const v = this.view.getUint16(this.at); this.at += 2; return v; }
    u32() { const v = this.view.getUint32(this.at); this.at += 4; return v; }
    /** A u64 as a Number: exact up to 2^53, which a microsecond clock reaches after 285 years. */
    u64() { const v = this.view.getUint32(this.at) * 4294967296 + this.view.getUint32(this.at + 4); this.at += 8; return v; }
    f32() { const v = this.view.getFloat32(this.at); this.at += 4; return v; }
    take(n) { const v = this.bytes.subarray(this.at, this.at + n); this.at += n; return v; }
    rest() { return this.take(this.left); }
}

/** A fixed-size big-endian writer: the caller knows the length of what it writes. */
export class Writer {
    constructor(length) {
        this.bytes = new Uint8Array(length);
        this.view = new DataView(this.bytes.buffer);
        this.at = 0;
    }
    u8(v) { this.view.setUint8(this.at++, v); return this; }
    u16(v) { this.view.setUint16(this.at, v); this.at += 2; return this; }
    u32(v) { this.view.setUint32(this.at, v >>> 0); this.at += 4; return this; }
    u64(v) { this.view.setUint32(this.at, Math.floor(v / 4294967296)); this.view.setUint32(this.at + 4, v >>> 0); this.at += 8; return this; }
    f32(v) { this.view.setFloat32(this.at, v); this.at += 4; return this; }
    put(bytes) { this.bytes.set(bytes, this.at); this.at += bytes.length; return this; }
}
