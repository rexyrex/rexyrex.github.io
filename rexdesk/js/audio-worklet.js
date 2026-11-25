// The jitter buffer on the audio thread (docs/PROTOCOL.md §10): about 40 ms of sound is held
// before playing, so packets that arrive in bursts still play evenly; when more than about
// 120 ms has piled up the oldest is skipped, so sound never drifts behind the picture.

const TARGET = 0.04;
const TRIM = 0.12;
const CAPACITY = 1;   // seconds

class RexDeskPlayer extends AudioWorkletProcessor {
    constructor() {
        super();
        this.size = Math.round(sampleRate * CAPACITY);
        this.left = new Float32Array(this.size);
        this.right = new Float32Array(this.size);
        this.read = 0;
        this.level = 0;
        this.buffering = true;
        this.source = null;
        this.blocks = 0;
        this.underruns = 0;
        this.port.onmessage = (event) => {
            // The engine's own port arrives here once; samples then come straight from the worker.
            if (event.data.port) {
                this.source = event.data.port;
                this.source.onmessage = (e) => this.receive(e.data);
            } else {
                this.receive(event.data);
            }
        };
    }

    receive(message) {
        if (message.reset) {
            this.level = 0;
            this.buffering = true;
            return;
        }
        const { left, right } = message;
        let n = left.length;
        if (n > this.size) return;
        // Too far behind: keep the newest TARGET's worth.
        if (this.level + n > TRIM * sampleRate) {
            const keep = Math.max(0, Math.round(TARGET * sampleRate) - n);
            this.read = (this.read + (this.level - Math.min(this.level, keep))) % this.size;
            this.level = Math.min(this.level, keep);
        }
        let write = (this.read + this.level) % this.size;
        for (let i = 0; i < n; i++) {
            this.left[write] = left[i];
            this.right[write] = right[i];
            if (++write === this.size) write = 0;
        }
        this.level += n;
        if (this.buffering && this.level >= TARGET * sampleRate) this.buffering = false;
    }

    process(_inputs, outputs) {
        const out = outputs[0];
        const l = out[0], r = out[1] || out[0];
        const n = l.length;
        if (this.buffering || this.level < n) {
            // Silence while the buffer fills (or refills after running dry).
            if (!this.buffering && this.level > 0) this.underruns++;
            if (this.level < n) this.buffering = true;
        } else {
            let read = this.read;
            for (let i = 0; i < n; i++) {
                l[i] = this.left[read];
                r[i] = this.right[read];
                if (++read === this.size) read = 0;
            }
            this.read = read;
            this.level -= n;
        }
        if (++this.blocks % 256 === 0) this.port.postMessage({ bufferedMs: Math.round(this.level / sampleRate * 1000), underruns: this.underruns });
        return true;
    }
}

registerProcessor('rexdesk-player', RexDeskPlayer);
