/* Sounds, synthesised with Web Audio (no files to download). */

let ctx = null;
let master = null;
let volume = 0.6;
let muted = false;
let noiseBuf = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

export function setMuted(m) { muted = m; }

function noise(t, dur, freq, q, gain, type = 'bandpass') {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.02);
}

function tone(t, freq, dur, gain, type = 'sine', slideTo) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SOUNDS = {
  // key clicks
  soft(t) { noise(t, 0.035, 2600 + Math.random() * 600, 1.2, 0.35); },
  typewriter(t) { noise(t, 0.05, 1800 + Math.random() * 300, 3, 0.6); tone(t, 140, 0.04, 0.12, 'square'); },
  space(t) { noise(t, 0.06, 900, 1, 0.35); },
  // feedback
  error(t) { tone(t, 220, 0.12, 0.18, 'triangle', 150); },
  line(t) { tone(t, 880, 0.08, 0.06); tone(t + 0.05, 1320, 0.1, 0.05); },
  finish(t) { [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.08, f, 0.3, 0.12, 'triangle')); },
  fail(t) { [392, 330, 262].forEach((f, i) => tone(t + i * 0.12, f, 0.25, 0.14, 'sawtooth')); },
  // arcade
  boom(t) { noise(t, 0.45, 500, 0.7, 0.9, 'lowpass'); tone(t, 120, 0.3, 0.3, 'sine', 40); },
  zap(t) { tone(t, 1200, 0.12, 0.12, 'square', 300); noise(t, 0.12, 3000, 2, 0.2); },
  miss(t) { tone(t, 180, 0.18, 0.15, 'square', 110); },
  hit(t) { noise(t, 0.6, 300, 0.5, 1, 'lowpass'); tone(t, 90, 0.5, 0.4, 'sine', 30); },
  level(t) { [440, 554, 659, 880].forEach((f, i) => tone(t + i * 0.07, f, 0.22, 0.12, 'square')); },
  power(t) { [660, 880, 1320].forEach((f, i) => tone(t + i * 0.05, f, 0.18, 0.1, 'triangle')); },
  beep(t) { tone(t, 660, 0.15, 0.15, 'square'); },
  go(t) { tone(t, 1320, 0.35, 0.16, 'square'); },
  win(t) { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.09, f, 0.35, 0.12, 'triangle')); }
};

export function play(name) {
  if (muted || volume <= 0) return;
  const c = ac();
  if (!c || !SOUNDS[name]) return;
  try { SOUNDS[name](c.currentTime + 0.005); } catch (e) { /* audio is best-effort */ }
}

// Unlock audio on the first gesture (browsers block it before one).
export function unlock() { if (!muted) ac(); }
