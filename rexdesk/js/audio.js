// Sound, engine side: Opus packets (docs/PROTOCOL.md §10) are decoded with WebCodecs and the
// samples go straight to the audio thread's jitter buffer (audio-worklet.js) over a MessagePort,
// without passing through the page's main thread.

export const audioSupported = () => typeof AudioDecoder !== 'undefined';

export class AudioPipeline {
    constructor(port) {
        this.port = port;
        this.decoder = null;
        this.timestamp = 0;
        this.broken = false;    // this browser cannot decode the sound: stop trying until a new AUDIO_CONFIG
    }

    config(config) {
        this.close();
        if (!audioSupported() || config.codec !== 'opus') return;
        const decoder = new AudioDecoder({
            output: (data) => this.output(data),
            error: () => { if (this.decoder === decoder) { this.decoder = null; this.broken = true; } },
        });
        try {
            decoder.configure({ codec: 'opus', sampleRate: config.sampleRate || 48000, numberOfChannels: config.channels || 2 });
        } catch (_) {
            this.broken = true;
            return;
        }
        this.broken = false;
        this.decoder = decoder;
        this.frameUs = (config.frameMs || 10) * 1000;
    }

    packet(packet) {
        if (this.broken) return;
        if (!this.decoder) this.config({ codec: 'opus', sampleRate: 48000, channels: 2, frameMs: 10 });
        const decoder = this.decoder;
        if (!decoder || packet.data.length === 0) return;
        try {
            decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: this.timestamp, data: packet.data }));
            this.timestamp += this.frameUs;
        } catch (_) {
            this.decoder = null;
            this.broken = true;
        }
    }

    output(data) {
        const frames = data.numberOfFrames;
        const left = new Float32Array(frames);
        const right = new Float32Array(frames);
        try {
            data.copyTo(left, { planeIndex: 0, format: 'f32-planar' });
            if (data.numberOfChannels > 1) data.copyTo(right, { planeIndex: 1, format: 'f32-planar' }); else right.set(left);
        } catch (_) {
            data.close();
            return;
        }
        data.close();
        this.port.postMessage({ left, right }, [left.buffer, right.buffer]);
    }

    close() {
        const d = this.decoder;
        this.decoder = null;
        if (d && d.state !== 'closed') { try { d.close(); } catch (_) { /* closed */ } }
        this.port.postMessage({ reset: true });
    }
}
