// Protocol v1 (docs/PROTOCOL.md): the handshake, and every message a viewer sends or receives.
// Pure functions over bytes; no sockets here.

import { concat, utf8, fromUtf8, equal, Reader, Writer } from './bytes.js';
import * as crypto from './crypto.js';

export const VERSION = 1;
export const MAX_FRAME = 16 << 20;
export const MAX_HANDSHAKE_FRAME = 4 << 10;
const MAGIC = utf8('RXDK');

export const Type = Object.freeze({
    CLIENT_AUTH: 0x01, AUTH_CHALLENGE: 0x02, AUTH_RESPONSE: 0x03, AUTH_RESULT: 0x04,
    START_STREAM: 0x10, STREAM_STARTED: 0x11, UPDATE_STREAM: 0x12, HOST_INFO: 0x13, STREAM_STATS: 0x14,
    CLIPBOARD: 0x20, DISCONNECT: 0x2f,
    VIDEO_FRAME: 0x40, REQUEST_KEYFRAME: 0x41, FRAME_ACK: 0x42,
    CURSOR_SHAPE: 0x48, CURSOR_POSITION: 0x49,
    POINTER_MOVE: 0x50, POINTER_BUTTON: 0x51, SCROLL: 0x52, KEY: 0x53, TEXT: 0x54, RELEASE_ALL: 0x55,
    PING: 0x60, PONG: 0x61,
    AUDIO_CONFIG: 0x70, AUDIO_PACKET: 0x71,
});

/** KEY's modifier bits (§8). */
export const Mod = Object.freeze({ SHIFT: 1, CONTROL: 2, OPTION: 4, COMMAND: 8, CAPS: 16, FN: 32 });
/** POINTER_BUTTON's buttons (§8). */
export const Button = Object.freeze({ LEFT: 0, RIGHT: 1, MIDDLE: 2, BACK: 3, FORWARD: 4 });

// MARK: Handshake (§3)

/** `u8[4] "RXDK", u16 version, u8[65] ephemeral key, u8[32] random`. */
export function clientHello(ephemeralPublic, random) {
    return new Writer(4 + 2 + 65 + 32).put(MAGIC).u16(VERSION).put(ephemeralPublic).put(random).bytes;
}

export function parseServerHello(bytes) {
    if (bytes.length < 4 + 2 + 65 + 32 + 65 + 2) throw new Error('The Mac sent a short handshake.');
    const r = new Reader(bytes);
    if (!equal(r.take(4), MAGIC)) throw new Error('That is not a RexDesk host.');
    const version = r.u16();
    if (version !== VERSION) throw new Error(`The Mac speaks protocol ${version}; this viewer speaks ${VERSION}.`);
    const hostEphemeral = r.take(65);
    const random = r.take(32);
    const hostIdentity = r.take(65);
    const core = bytes.subarray(0, r.at);
    const signature = r.take(r.u16());
    if (r.left !== 0) throw new Error('The Mac sent a malformed handshake.');
    return { hostEphemeral, random, hostIdentity, signature, core };
}

/**
 * Everything the ServerHello settles: the host's key is checked against its signature over the
 * transcript, then the record keys and the session hash (th2) are derived. Throws when the
 * signature does not verify.
 */
export async function deriveSession(clientHelloBytes, serverHelloBytes, ephemeralPrivate) {
    const hello = parseServerHello(serverHelloBytes);
    const th1 = await crypto.sha256(concat(clientHelloBytes, hello.core));
    if (!await crypto.verify(hello.hostIdentity, concat(utf8('RexDesk-v1 host'), th1), hello.signature)) {
        throw new Error("The Mac's identity could not be verified.");
    }
    const secret = await crypto.sharedSecret(ephemeralPrivate, hello.hostEphemeral);
    const okm = await crypto.hkdf(secret, th1, utf8('RexDesk-v1 keys'), 64);
    return {
        hostIdentity: hello.hostIdentity,
        hostFingerprint: await crypto.fingerprint(hello.hostIdentity),
        viewerToHostKey: okm.subarray(0, 32),
        hostToViewerKey: okm.subarray(32, 64),
        sessionHash: await crypto.sha256(concat(th1, hello.signature)),
        th1,
    };
}

/** What the viewer's identity key signs in CLIENT_AUTH. */
export const clientSignatureMessage = (sessionHash) => concat(utf8('RexDesk-v1 client'), sessionHash);

// MARK: Messages the viewer sends

function json(type, object) {
    const body = utf8(JSON.stringify(object));
    return new Writer(1 + body.length).u8(type).put(body).bytes;
}

export const encode = Object.freeze({
    clientAuth: (o) => json(Type.CLIENT_AUTH, o),
    authResponse: (o) => json(Type.AUTH_RESPONSE, o),
    startStream: (o) => json(Type.START_STREAM, o),
    updateStream: (o) => json(Type.UPDATE_STREAM, o),
    clipboard: (text) => json(Type.CLIPBOARD, { text }),
    disconnect: (reason, message) => json(Type.DISCONNECT, message ? { reason, message } : { reason }),
    requestKeyframe: () => Uint8Array.of(Type.REQUEST_KEYFRAME),
    frameAck: (frameId, decodeUs) => new Writer(9).u8(Type.FRAME_ACK).u32(frameId).u32(decodeUs).bytes,
    pointerMove: (x, y) => new Writer(9).u8(Type.POINTER_MOVE).f32(x).f32(y).bytes,
    pointerButton: (button, down, x, y) => new Writer(11).u8(Type.POINTER_BUTTON).u8(button).u8(down ? 1 : 0).f32(x).f32(y).bytes,
    scroll: (dx, dy, precise, phase = 0, momentum = 0) =>
        new Writer(12).u8(Type.SCROLL).f32(dx).f32(dy).u8(precise ? 1 : 0).u8(phase).u8(momentum).bytes,
    key: (keyCode, down, modifiers) => new Writer(5).u8(Type.KEY).u16(keyCode).u8(down ? 1 : 0).u8(modifiers).bytes,
    text: (text) => { const b = utf8(text); return new Writer(1 + b.length).u8(Type.TEXT).put(b).bytes; },
    releaseAll: () => Uint8Array.of(Type.RELEASE_ALL),
    ping: (id, sendTimeUs) => new Writer(13).u8(Type.PING).u32(id).u64(sendTimeUs).bytes,
    pong: (id, echoedUs, responderUs) => new Writer(21).u8(Type.PONG).u32(id).u64(echoedUs).u64(responderUs).bytes,
});

// MARK: Messages the viewer receives

const JSON_TYPES = new Set([Type.AUTH_CHALLENGE, Type.AUTH_RESULT, Type.STREAM_STARTED, Type.HOST_INFO,
    Type.STREAM_STATS, Type.CLIPBOARD, Type.DISCONNECT, Type.AUDIO_CONFIG]);

/**
 * One message's body, decoded. Binary payloads (`data`, `png`) are views into `body`, not copies.
 * Unknown types return null (§4: "a receiver ignores message types it does not know").
 */
export function decode(type, body) {
    if (JSON_TYPES.has(type)) return JSON.parse(fromUtf8(body));
    const r = new Reader(body);
    switch (type) {
        case Type.VIDEO_FRAME:
            return { streamId: r.u16(), frameId: r.u32(), flags: r.u8(), captureTimeUs: r.u64(), data: r.rest() };
        case Type.CURSOR_SHAPE:
            return { cursorId: r.u32(), width: r.f32(), height: r.f32(), hotX: r.f32(), hotY: r.f32(), png: r.rest() };
        case Type.CURSOR_POSITION:
            return { x: r.f32(), y: r.f32(), cursorId: r.u32(), visible: (r.u8() & 1) !== 0 };
        case Type.PING:
            return { id: r.u32(), sendTimeUs: r.u64() };
        case Type.PONG:
            return { id: r.u32(), echoedUs: r.u64(), responderUs: r.u64() };
        case Type.AUDIO_PACKET:
            return { seq: r.u32(), captureTimeUs: r.u64(), data: r.rest() };
        default:
            return null;
    }
}
