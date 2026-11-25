// Video: WebCodecs decodes the host's Annex B stream in hardware and each picture is drawn the
// moment it comes out (docs/PROTOCOL.md §6: "every frame is meant to be shown as soon as it is
// decoded"). Runs in the engine's worker on an OffscreenCanvas, or on the page's own canvas.

import { h264Codec, hevcCodec, PROBE } from './h26x.js';

const now = () => performance.now();

async function supported(config) {
    try {
        return (await VideoDecoder.isConfigSupported(config)).supported === true;
    } catch (_) {
        return false;
    }
}

/**
 * What this browser can decode, in the order to ask the host for it: HEVC before H.264 (sharper
 * at the same bitrate), 4:4:4 first where the hardware has it. `max` is the largest picture to
 * ask for.
 */
export async function capabilities() {
    if (typeof VideoDecoder === 'undefined') return { codecs: [], maxWidth: 0, maxHeight: 0 };
    const at = (codec, w, h, hw) => supported({ codec, codedWidth: w, codedHeight: h, optimizeForLatency: true, ...(hw ? { hardwareAcceleration: 'prefer-hardware' } : {}) });
    const [hevc444, hevc, h264] = await Promise.all([
        at(PROBE.hevc444, 1920, 1080, true), at(PROBE.hevc, 1920, 1080, true), at(PROBE.h264, 1920, 1080, false),
    ]);
    const codecs = [];
    if (hevc && hevc444) codecs.push('hevc444');
    if (hevc) codecs.push('hevc');
    if (h264) codecs.push('h264');
    // 5K only where the decoder says it takes it (level 6.x); 4K otherwise.
    const big = codecs.length > 0 && await at(hevc ? 'hev1.1.6.L183.B0' : 'avc1.64003c', 5120, 2880, hevc);
    return { codecs, maxWidth: big ? 5120 : 3840, maxHeight: big ? 2880 : 2160 };
}

export class VideoPipeline {
    /**
     * `hooks`: `needKeyframe()`, `size(width, height)`, `failed(codec, message)` (the decoder
     * cannot play this codec), `shown()` (a picture reached the canvas).
     */
    constructor(canvas, hooks) {
        this.canvas = canvas;
        // Not `desynchronized`: that trades a frame of latency for tearing on some systems, which
        // the Mac viewer also leaves off unless asked.
        this.context = canvas.getContext('2d', { alpha: false });
        this.hooks = hooks;
        this.decoder = null;
        this.stream = null;          // the STREAM_STARTED being decoded
        this.configured = null;      // codec string the decoder is set up for
        this.waitingForKeyframe = true;
        this.keyframeAskedAt = 0;
        this.submitted = new Map();  // frameId → time handed to the decoder
        this.errors = 0;
        this.lastDecodeUs = 0;
        this.stats = { shown: 0, decodeMsTotal: 0, decoded: 0, dropped: 0 };
    }

    /** A new STREAM_STARTED: its first frame is a keyframe, which configures the decoder. */
    start(started) {
        this.stream = started;
        this.waitingForKeyframe = true;
        this.submitted.clear();
    }

    stop() {
        this.stream = null;
        this.close();
    }

    close() {
        const d = this.decoder;
        this.decoder = null;
        this.configured = null;
        if (d && d.state !== 'closed') { try { d.close(); } catch (_) { /* already closed */ } }
    }

    askForKeyframe() {
        this.waitingForKeyframe = true;
        if (now() - this.keyframeAskedAt < 500) return;
        this.keyframeAskedAt = now();
        this.hooks.needKeyframe();
    }

    /** One VIDEO_FRAME (already acknowledged). `frame.data` is copied by the decoder, not kept. */
    frame(frame) {
        const stream = this.stream;
        if (!stream || frame.streamId !== stream.streamId) return;
        const key = (frame.flags & 1) !== 0;
        if (this.waitingForKeyframe) {
            if (!key) { this.stats.dropped++; this.askForKeyframe(); return; }
            if (!this.configure(stream, frame.data)) return;
            this.waitingForKeyframe = false;
        }
        const decoder = this.decoder;
        // Far behind (a stalled tab, a slow decoder): start over from a fresh keyframe rather than
        // play a growing backlog late.
        if (decoder.decodeQueueSize > 12) {
            this.stats.dropped += decoder.decodeQueueSize;
            try { decoder.reset(); } catch (_) { /* closed */ }
            this.configured = null;
            this.askForKeyframe();
            return;
        }
        this.submitted.set(frame.frameId, now());
        if (this.submitted.size > 240) this.submitted.delete(this.submitted.keys().next().value);
        try {
            decoder.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: frame.frameId, data: frame.data }));
        } catch (error) {
            this.decoderFailed(String(error.message || error));
        }
    }

    configure(stream, keyframe) {
        const hevc = stream.codec !== 'h264';
        const codec = (hevc ? hevcCodec(keyframe) : h264Codec(keyframe)) || (hevc ? (stream.chroma444 ? PROBE.hevc444 : PROBE.hevc) : PROBE.h264);
        if (this.decoder && this.decoder.state === 'configured' && this.configured === codec) return true;
        this.close();
        const decoder = new VideoDecoder({
            output: (picture) => this.output(decoder, picture),
            error: (error) => { if (this.decoder === decoder) this.decoderFailed(String(error.message || error)); },
        });
        try {
            // No `description`: the stream is Annex B and carries its parameter sets in every keyframe.
            decoder.configure({ codec, optimizeForLatency: true, hardwareAcceleration: hevc ? 'prefer-hardware' : 'no-preference' });
        } catch (error) {
            this.decoder = decoder;
            this.decoderFailed(String(error.message || error));
            return false;
        }
        this.decoder = decoder;
        this.configured = codec;
        return true;
    }

    output(decoder, picture) {
        if (decoder !== this.decoder) { picture.close(); return; }
        const t0 = this.submitted.get(picture.timestamp);
        if (t0 !== undefined) {
            this.submitted.delete(picture.timestamp);
            const ms = now() - t0;
            this.lastDecodeUs = Math.min(0xffffffff, Math.round(ms * 1000));
            this.stats.decodeMsTotal += ms;
            this.stats.decoded++;
        }
        const w = picture.displayWidth, h = picture.displayHeight;
        const canvas = this.canvas;
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            this.hooks.size(w, h);
        }
        this.context.drawImage(picture, 0, 0, w, h);
        picture.close();
        this.errors = 0;
        this.stats.shown++;
        this.hooks.shown?.();
    }

    decoderFailed(message) {
        const codec = this.stream?.chroma444 ? 'hevc444' : this.stream?.codec;
        this.close();
        this.errors++;
        // Twice in a row without a picture in between: this decoder cannot play this codec.
        if (this.errors >= 2 && codec) {
            this.errors = 0;
            this.hooks.failed(codec, message);
        }
        this.keyframeAskedAt = 0;
        this.askForKeyframe();
    }

    /** Counters since the last call. */
    takeStats() {
        const s = this.stats;
        this.stats = { shown: 0, decodeMsTotal: 0, decoded: 0, dropped: 0 };
        return { shown: s.shown, decodeMs: s.decoded ? s.decodeMsTotal / s.decoded : 0, dropped: s.dropped, queue: this.decoder?.decodeQueueSize || 0 };
    }
}
