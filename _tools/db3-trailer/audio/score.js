// The trailer score, synthesised with Web Audio in an OfflineAudioContext.
// Instruments follow Deadly Balloons 3's own music engine (src/audio/music.ts:
// kick, snare, hats, saw bass, square arp, saw pad, triangle lead, and the
// boss track's E Phrygian changes), plus trailer sound design: booms, braams,
// risers, whooshes, a music box and a tape stop. Returns { wav (base64), peak }.
window.renderScore = async (cfg) => {
  const { BEAT, DROP, END, HITS, CUTS } = cfg;
  const SR = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * (END + 0.5)), SR);
  const BAR = BEAT * 4;
  const S16 = BEAT / 4;
  const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

  // Deterministic noise and randomness.
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const noise = ctx.createBuffer(2, SR * 2, SR);
  for (let c = 0; c < 2; c++) {
    const d = noise.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
  }
  // Reverb: exponentially decaying stereo noise.
  const irLen = Math.floor(SR * 3.8);
  const ir = ctx.createBuffer(2, irLen, SR);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < irLen; i++) {
      const t = i / SR;
      d[i] = (rnd() * 2 - 1) * Math.exp(-t * 1.6) * (t < 0.01 ? t / 0.01 : 1);
    }
  }

  // ---- Buses -------------------------------------------------------------------
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 8;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  master.connect(comp);
  comp.connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = ir;
  const verbIn = ctx.createGain();
  verbIn.gain.value = 0.55;
  verbIn.connect(verb);
  verb.connect(master);
  // Music sits on its own bus so the big hits can duck it.
  const music = ctx.createGain();
  music.gain.value = 0;
  music.connect(master);
  const musicVerb = ctx.createGain();
  musicVerb.gain.value = 0.25;
  music.connect(musicVerb);
  musicVerb.connect(verbIn);
  const echo = ctx.createDelay(1);
  echo.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  echo.connect(fb);
  fb.connect(echo);
  echo.connect(wet);
  wet.connect(music);
  const fx = ctx.createGain();
  fx.gain.value = 1;
  fx.connect(master);
  const fxVerb = ctx.createGain();
  fxVerb.gain.value = 0.6;
  fx.connect(fxVerb);
  fxVerb.connect(verbIn);

  const shaper = (amount) => {
    const ws = ctx.createWaveShaper();
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    ws.curve = curve;
    return ws;
  };

  const env = (dest, time, peak, attack, decay) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
    g.connect(dest);
    return g;
  };
  const osc = (type, hz, t0, t1) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    o.start(t0);
    o.stop(t1);
    return o;
  };
  const noiseSrc = (t0, t1, rate = 1) => {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    n.playbackRate.value = rate;
    n.start(t0, rnd() * 1.5);
    n.stop(t1);
    return n;
  };
  const panner = (p, dest) => {
    const s = ctx.createStereoPanner();
    s.pan.value = p;
    s.connect(dest);
    return s;
  };

  // ---- Game instruments (from music.ts) ----------------------------------------------
  const kick = (t, g = 0.95) => {
    const o = osc('sine', 150, t, t + 0.4);
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const d = shaper(2.2);
    o.connect(d);
    d.connect(env(music, t, g, 0.002, 0.32));
    const c = noiseSrc(t, t + 0.02, 2);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    c.connect(hp);
    hp.connect(env(music, t, 0.25 * g, 0.001, 0.012));
  };
  const snare = (t, g = 1) => {
    const n = noiseSrc(t, t + 0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.8;
    n.connect(f);
    f.connect(env(music, t, 0.5 * g, 0.001, 0.18));
    const o = osc('triangle', 200, t, t + 0.12);
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    o.connect(env(music, t, 0.3 * g, 0.001, 0.09));
  };
  const hat = (t, peak, open = false) => {
    const n = noiseSrc(t, t + (open ? 0.3 : 0.07), 1.3);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    n.connect(f);
    f.connect(env(panner((rnd() - 0.5) * 0.5, music), t, peak * 0.34, 0.001, open ? 0.22 : 0.035));
  };
  const bass = (t, hz, len, bright = 0.6) => {
    const o = osc('sawtooth', hz, t, t + len + 0.05);
    const o2 = osc('square', hz / 2, t, t + len + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(260 + bright * 1000, t);
    f.frequency.exponentialRampToValueAtTime(120, t + len);
    o.connect(f);
    const sub = ctx.createGain();
    sub.gain.value = 0.5;
    o2.connect(sub);
    sub.connect(f);
    f.connect(env(music, t, 0.36, 0.004, len));
  };
  const pluck = (t, hz, len, bright = 0.6) => {
    const o = osc('square', hz, t, t + len + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1200 + bright * 3500, t);
    f.frequency.exponentialRampToValueAtTime(400, t + len);
    o.connect(f);
    const g = env(panner((rnd() - 0.5) * 0.6, music), t, 0.075, 0.002, len);
    f.connect(g);
    g.connect(echo);
  };
  const pad = (t, notes, len, bright = 0.6, peak = 0.06, dest = music) => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + bright * 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + len * 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    f.connect(g);
    g.connect(dest);
    for (const hz of notes) {
      for (const det of [-9, 9]) {
        const o = osc('sawtooth', hz, t, t + len + 0.05);
        o.detune.value = det;
        o.connect(panner(det / 20, f));
      }
    }
  };
  const lead = (t, hz, len, bright = 0.6, peak = 0.09) => {
    const o = osc('triangle', hz, t, t + len + 0.05);
    const o2 = osc('square', hz, t, t + len + 0.05);
    o2.detune.value = 6;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500 + bright * 2500;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    o.connect(f);
    o2.connect(mix);
    mix.connect(f);
    const g = env(music, t, peak, 0.01, len);
    f.connect(g);
    g.connect(echo);
  };

  // ---- Trailer sound design ---------------------------------------------------------------
  const boom = (t, size = 1) => {
    const o = osc('sine', 70, t, t + 3);
    o.frequency.setValueAtTime(75, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 1.4);
    const d = shaper(1.6);
    o.connect(d);
    d.connect(env(fx, t, 0.9 * size, 0.004, 2.4 * size));
    const n = noiseSrc(t, t + 1.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.8);
    n.connect(lp);
    lp.connect(env(fx, t, 0.55 * size, 0.002, 0.9));
  };
  const braam = (t, dur = 2.2, root = 28, peak = 0.32) => {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(peak, t + 0.06);
    out.gain.setValueAtTime(peak, t + dur * 0.35);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(2200, t + 0.12);
    lp.frequency.exponentialRampToValueAtTime(350, t + dur);
    const d = shaper(3);
    lp.connect(d);
    d.connect(out);
    out.connect(fx);
    for (const [semi, g] of [[0, 1], [12, 0.8], [19, 0.5], [24, 0.35], [-12, 0.6]]) {
      for (const det of [-14, -5, 5, 14]) {
        const o = osc('sawtooth', midiHz(root + 12 + semi), t, t + dur + 0.1);
        o.detune.value = det;
        const gg = ctx.createGain();
        gg.gain.value = g * 0.18;
        o.connect(gg);
        gg.connect(panner(det / 20, lp));
      }
    }
  };
  const hit = (t, g = 1, tone = 90) => {
    const n = noiseSrc(t, t + 0.8);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.7;
    n.connect(bp);
    bp.connect(env(fx, t, 0.6 * g, 0.001, 0.45));
    const o = osc('triangle', tone, t, t + 0.6);
    o.frequency.setValueAtTime(tone * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(tone * 0.6, t + 0.3);
    o.connect(env(fx, t, 0.7 * g, 0.001, 0.4));
    kick(t, 0.8 * g);
  };
  const crash = (t, g = 1) => {
    const n = noiseSrc(t, t + 3);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    n.connect(hp);
    hp.connect(env(fx, t, 0.28 * g, 0.002, 2.2));
  };
  const riser = (t0, t1, peak = 0.35) => {
    const n = noiseSrc(t0, t1 + 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(7000, t1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t1);
    g.gain.setValueAtTime(0.0001, t1 + 0.01);
    n.connect(bp);
    bp.connect(g);
    g.connect(fx);
    for (const m of [0, 7, 12]) {
      const o = osc('sawtooth', 80, t0, t1 + 0.02);
      o.frequency.setValueAtTime(midiHz(40 + m), t0);
      o.frequency.exponentialRampToValueAtTime(midiHz(76 + m), t1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2500;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.exponentialRampToValueAtTime(peak * 0.25, t1);
      og.gain.setValueAtTime(0.0001, t1 + 0.01);
      o.connect(lp);
      lp.connect(og);
      og.connect(fx);
    }
  };
  const whoosh = (t, dur = 0.35, g = 0.35, up = false) => {
    const n = noiseSrc(t, t + dur + 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(up ? 400 : 3500, t);
    bp.frequency.exponentialRampToValueAtTime(up ? 4000 : 300, t + dur);
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0.0001, t);
    gg.gain.exponentialRampToValueAtTime(g, t + dur * 0.5);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp);
    bp.connect(gg);
    gg.connect(panner(up ? -0.3 : 0.3, fx));
  };
  const reverseSwell = (tEnd, dur, g = 0.4) => {
    const t0 = tEnd - dur;
    const n = noiseSrc(t0, tEnd + 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(800, t0);
    hp.frequency.exponentialRampToValueAtTime(3000, tEnd);
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0.0001, t0);
    gg.gain.exponentialRampToValueAtTime(g, tEnd - 0.01);
    gg.gain.setValueAtTime(0.0001, tEnd);
    n.connect(hp);
    hp.connect(gg);
    gg.connect(fx);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.0001, t0);
    pg.gain.exponentialRampToValueAtTime(g * 0.6, tEnd - 0.01);
    pg.gain.setValueAtTime(0.0001, tEnd);
    pg.connect(fx);
    for (const m of [40, 47, 52, 55]) {
      for (const det of [-8, 8]) {
        const o = osc('sawtooth', midiHz(m + 12), t0, tEnd + 0.02);
        o.detune.value = det;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(400, t0);
        lp.frequency.exponentialRampToValueAtTime(5000, tEnd);
        o.connect(lp);
        const v = ctx.createGain();
        v.gain.value = 0.12;
        lp.connect(v);
        v.connect(pg);
      }
    }
  };
  const heartbeat = (t, g = 1) => {
    for (const [dt, a] of [[0, 1], [0.16, 0.7]]) {
      const o = osc('sine', 60, t + dt, t + dt + 0.4);
      o.frequency.setValueAtTime(70, t + dt);
      o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.2);
      o.connect(env(fx, t + dt, 0.75 * g * a, 0.003, 0.3));
    }
  };
  const glitch = (t0, t1) => {
    let t = t0;
    while (t < t1) {
      const len = 0.02 + rnd() * 0.05;
      const o = osc(rnd() < 0.5 ? 'square' : 'sawtooth', 80 + rnd() * 1400, t, t + len);
      o.connect(env(panner(rnd() * 2 - 1, fx), t, 0.12, 0.001, len));
      if (rnd() < 0.5) {
        const n = noiseSrc(t, t + len);
        n.connect(env(fx, t, 0.15, 0.001, len));
      }
      t += len + rnd() * 0.04;
    }
  };
  const pop = (t, g = 0.5) => {
    const n = noiseSrc(t, t + 0.12, 1.4);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    n.connect(hp);
    hp.connect(env(fx, t, g, 0.001, 0.07));
    const o = osc('sine', 900, t, t + 0.1);
    o.frequency.setValueAtTime(1300, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.06);
    o.connect(env(fx, t, g * 0.6, 0.001, 0.06));
  };
  // A music box (bells) with an optional tape stop.
  const box = ctx.createGain();
  box.gain.value = 1;
  box.connect(fx);
  const boxNotes = [];
  const bell = (t, hz, peak = 0.12) => {
    for (const [mult, a, dec] of [[1, 1, 1.4], [2, 0.35, 0.6], [3, 0.12, 0.3], [4.2, 0.06, 0.15]]) {
      const o = osc(mult === 1 ? 'triangle' : 'sine', hz * mult, t, t + dec + 0.1);
      o.connect(env(panner(0.15, box), t, peak * a, 0.002, dec));
      boxNotes.push(o);
    }
  };
  const tapeStop = (t0, dur) => {
    for (const o of boxNotes) {
      o.detune.setValueAtTime(0, t0);
      o.detune.linearRampToValueAtTime(-2400, t0 + dur);
    }
    box.gain.setValueAtTime(1, t0);
    box.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  };
  const drone = (t0, t1, peak = 0.12) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 2.5);
    g.gain.setValueAtTime(peak, t1 - 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    g.connect(fx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.connect(g);
    for (const [m, a] of [[28, 1], [35, 0.6], [40, 0.4]]) {
      for (const det of [-6, 6]) {
        const o = osc('sawtooth', midiHz(m), t0, t1 + 0.1);
        o.detune.value = det;
        const v = ctx.createGain();
        v.gain.value = a * 0.5;
        o.connect(v);
        v.connect(lp);
      }
    }
  };
  const tremolo = (t0, t1, notes, peak = 0.05) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.8);
    g.gain.setValueAtTime(peak, t1 - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = osc('square', 12, t0, t1);
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg);
    lg.connect(trem.gain);
    trem.connect(g);
    g.connect(fx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.connect(trem);
    for (const m of notes) {
      for (const det of [-7, 7]) {
        const o = osc('sawtooth', midiHz(m), t0, t1 + 0.05);
        o.detune.value = det;
        o.connect(lp);
      }
    }
  };

  // ---- The boss track, arranged ------------------------------------------------------------
  // E Phrygian; one chord per bar (bass octave root E2 = 40).
  const ROOT = 40;
  const CHORDS = [[0, 3, 7], [1, 4, 8], [0, 3, 7], [-1, 3, 6]];
  const KICK = 'x...x...x...x.x.';
  const SNARE = '....x.......x...';
  const HAT = 'xxxxxxxxxxxxxxxx';
  const BASS = 'xxxxoxxxxxxxoxfx';
  const ARP = '0120120120120123';
  // Generated lead, as in the game's makeLead (boss seed 71).
  const makeLead = () => {
    let s = 71 * 9301 + 49297;
    const rn = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const scale = [0, 1, 3, 5, 7, 8, 10];
    const rhythm = [0, 3, 6, 8, 10, 12, 14, 16, 19, 22, 24, 27, 28];
    const out = [];
    let degree = 4;
    for (const step of rhythm) {
      if (rn() < 0.22 && step % 8 !== 0) continue;
      degree = Math.max(0, Math.min(scale.length + 4, degree + Math.round((rn() - 0.5) * 4)));
      const oct = Math.floor(degree / scale.length);
      out.push({ step, note: scale[degree % scale.length] + oct * 12 + 24, len: rn() < 0.3 ? 4 : 2 });
    }
    return out;
  };
  const LEAD = makeLead();

  // play(t0, t1, layers): the track from t0 to t1 with the chosen layers.
  const play = (t0, t1, L) => {
    const steps = Math.round((t1 - t0) / S16);
    for (let i = 0; i < steps; i++) {
      const t = t0 + i * S16;
      const gstep = Math.round((t - DROP) / S16);
      const s16 = ((gstep % 16) + 16) % 16;
      const bar = Math.floor(gstep / 16);
      const chord = CHORDS[((bar % 4) + 4) % 4];
      if (L.kick && KICK[s16] === 'x') kick(t);
      if (L.four && s16 % 4 === 0) kick(t);
      if (L.snare && SNARE[s16] === 'x') snare(t);
      if (L.hat) hat(t, s16 % 4 === 2 ? 0.6 : 0.3, s16 === 14);
      const b = BASS[s16];
      if (L.bass && b !== '.') bass(t, midiHz(ROOT + chord[0] + (b === 'o' ? 12 : b === 'f' ? 7 : 0) - 12), S16 * 1.6, 0.6);
      const a = ARP[s16];
      if (L.arp && a !== '-') {
        const idx = Number(a);
        pluck(t, midiHz(ROOT + chord[idx % chord.length] + (idx >= chord.length ? 12 : 0) + 24), S16 * 0.9, 0.6);
      }
      if (L.pad && s16 === 0) pad(t, chord.map((c) => midiHz(ROOT + c + 12)), BAR, 0.6);
      if (L.lead) {
        const phrase = ((gstep % 32) + 32) % 32;
        const half = ((gstep % 64) + 64) % 64 >= 32;
        for (const n of LEAD) if (n.step === phrase) lead(t, midiHz(ROOT + n.note + (half ? -12 : 0)), S16 * n.len, 0.6);
      }
    }
  };
  const roll = (t0, t1, from = 4, to = 16, g0 = 0.3, g1 = 1) => {
    let t = t0;
    while (t < t1 - 0.001) {
      const p = (t - t0) / (t1 - t0);
      const div = from + (to - from) * p * p;
      snare(t, g0 + (g1 - g0) * p);
      t += BEAT / (div / 4);
    }
  };
  const duck = (t, depth = 0.55, back = 0.6) => {
    music.gain.setValueAtTime(1, t);
    music.gain.linearRampToValueAtTime(depth, t + 0.005);
    music.gain.setValueAtTime(depth, t + 0.35);
    music.gain.linearRampToValueAtTime(1, t + 0.35 + back);
  };
  const setMusic = (t, v) => music.gain.setValueAtTime(v, t);

  // ================= ACT I: then and now =================
  drone(0.2, 8.1, 0.1);
  // "Popping balloons used to be easy": a music box in E major.
  const BOX = [76, 80, 83, 88, 87, 83, 80, 83, 85, 81, 78, 81, 83, 80, 76, 80, 83, 88, 87, 83, 85, 88, 92, 88];
  BOX.forEach((m, i) => bell(0.8 + i * 0.13, midiHz(m), i % 4 === 0 ? 0.13 : 0.09));
  tapeStop(3.55, 0.45);
  whoosh(3.6, 0.4, 0.25);
  // "Then they evolved": the drone darkens, a heartbeat.
  boom(4.0, 0.8);
  pad(4.0, [midiHz(40), midiHz(43), midiHz(47)], 4.2, 0.2, 0.07, fx);
  [4.8, 5.6, 6.4, 7.0, 7.5].forEach((t, i) => heartbeat(t, 0.6 + i * 0.1));
  glitch(7.55, 8.0);
  // "Now they want revenge."
  boom(8.0, 1.2);
  braam(8.0, 2.6, 28, 0.36);
  hit(8.0, 1);
  tremolo(8.4, 9.6, [64, 65, 71], 0.05);
  [8.8, 9.2].forEach((t) => heartbeat(t, 0.9));
  // Subliminal flashes, one hit per eighth, then the riser.
  for (let i = 0; i < 8; i++) hit(9.6 + i * 0.2, 0.55 + i * 0.06, 70 + i * 12);
  roll(9.6, 11.2, 4, 24, 0.2, 0.9);
  riser(9.6, 11.6, 0.4);
  crash(11.2, 0.6);
  reverseSwell(12.0, 0.4, 0.3);

  // ================= ACT II: the drop =================
  setMusic(0, 0);
  setMusic(DROP, 1);
  boom(DROP, 1.3);
  braam(DROP, 1.6, 28, 0.3);
  crash(DROP, 1);
  play(DROP, 29.6, { kick: 1, snare: 1, hat: 1, bass: 1, arp: 1, pad: 1, lead: 0 });
  // Lead comes in for the second half of the montage.
  play(21.6, 29.6, { lead: 1 });
  hit(13.6, 0.8);
  hit(15.2, 0.9);
  [16.8, 18.4, 22.4, 23.2, 24.0, 24.8].forEach((t) => whoosh(t - 0.15, 0.3, 0.28));
  boom(HITS.card17, 0.8);
  crash(HITS.card17, 0.6);
  hit(HITS.card13, 0.9);
  hit(HITS.card25, 0.9);
  crash(HITS.card25, 0.5);
  hit(HITS.endless, 1);
  // Four campaigns: drums thin to the kick, a roll and a riser into the bosses.
  play(29.6, 31.2, { four: 1, bass: 1, pad: 1, hat: 1 });
  hit(HITS.campaigns, 0.8);
  roll(30.0, 31.2, 4, 16, 0.25, 1);
  riser(29.6, 31.2, 0.3);

  // ================= ACT III: bosses =================
  play(31.2, 44.0, { kick: 1, snare: 1, hat: 1, bass: 1, arp: 1, pad: 1, lead: 1 });
  HITS.bosses.forEach((t, i) => {
    boom(t, 1.1);
    braam(t, 1.4, 28 + [0, 1, 0, -1][i], 0.3);
    crash(t, 0.7);
    duck(t);
  });

  // ================= ACT IV =================
  play(44.0, 45.6, { kick: 1, snare: 1, hat: 1, bass: 1, arp: 1, pad: 1, lead: 1 });
  for (let i = 0; i < 8; i++) hit(44.0 + i * 0.2, 0.5 + i * 0.05, 80 + i * 10);
  riser(44.0, 45.6, 0.3);
  // Breakdown: everything stops. "You don't aim." "You dodge."
  setMusic(45.6, 0);
  boom(45.6, 1);
  boom(46.4, 1);
  heartbeat(46.0, 0.8);
  reverseSwell(47.2, 0.8, 0.45);
  // The kill: a fill, then the boss pops on 48.0.
  setMusic(47.2, 1);
  play(47.2, 48.0, { kick: 1, hat: 1, bass: 1 });
  roll(47.2, 48.0, 8, 24, 0.4, 1);
  setMusic(48.0, 0);
  boom(HITS.kill, 1.5);
  hit(HITS.kill, 1.2, 60);
  crash(HITS.kill, 1);
  tremolo(48.0, 48.8, [76, 83, 88], 0.035);
  reverseSwell(HITS.title, 0.6, 0.35);
  // Title: the biggest hit, and the full track for two bars.
  setMusic(HITS.title, 1);
  boom(HITS.title, 1.6);
  braam(HITS.title, 3.0, 28, 0.38);
  crash(HITS.title, 1.2);
  hit(HITS.title, 1.2);
  play(HITS.title, HITS.endcard, { kick: 1, snare: 1, hat: 1, bass: 1, arp: 1, pad: 1, lead: 1 });
  // End card: final chord and a long tail, then one balloon pops.
  setMusic(HITS.endcard, 0);
  boom(HITS.endcard, 1.4);
  braam(HITS.endcard, 4.2, 28, 0.3);
  crash(HITS.endcard, 1);
  pad(HITS.endcard, [midiHz(52), midiHz(56), midiHz(59), midiHz(64)], 4.6, 0.5, 0.08, fx);
  pop(55.2, 0.55);

  const out = await ctx.startRendering();
  const n = out.length;
  const L0 = out.getChannelData(0);
  const R0 = out.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L0[i]), Math.abs(R0[i]));
  const k = peak > 0 ? 0.89 / peak : 1;
  const bytes = new Uint8Array(44 + n * 4);
  const dv = new DataView(bytes.buffer);
  const str = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L0[i] * k)) * 32767, true);
    dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R0[i] * k)) * 32767, true);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { wav: btoa(bin), peak };
};
