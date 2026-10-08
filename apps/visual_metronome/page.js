/* Visual Metronome — /apps/visual_metronome/
   Dependency-free. Three jobs:
     1. a working metronome on the stage (#try): a lookahead scheduler
        that books every click on the AudioContext clock once sound is on
        (performance.now() until then), and visuals drawn from that same
        timeline, so a beat is drawn when its click is heard;
     2. the feature tour: one sticky phone whose screen follows the
        section in view (wide screens);
     3. keeping the browser's theme-color on this page's own stage color.
   Visualizers are ports of three of the app's scenes (Pulse Orb, Bar Map,
   Meter Bars). Large areas never flash: brightness pulses fade out between
   2 and 3 beats a second and are gone above that (size and position carry
   the beat), a flash needs two beats so it stays under 3 a second even at
   300 BPM, and reduced motion swaps every pulse for a plain state change. */
(function () {
    'use strict';

    const root = document.documentElement;
    // Layout that depends on this script (sticky tour, live stage) keys off this class.
    root.classList.add('vm-js');
    const reducedMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const lightMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
    const listen = (mq, fn) => { if (!mq) return; if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); };

    /* ---------- theme-color follows the stage ------------------- */

    function syncThemeMeta() {
        const bg = getComputedStyle(root).getPropertyValue('--vm-stage').trim();
        const meta = document.querySelector('meta[name="theme-color"]:not([media])');
        if (meta && bg) meta.setAttribute('content', bg);
    }
    syncThemeMeta();

    /* ---------- feature tour: sticky phone ---------------------- */

    (function initTour() {
        const shots = document.querySelectorAll('.vm-tour-device img[data-screen]');
        const feats = document.querySelectorAll('.vm-feat[data-screen]');
        if (!shots.length || !feats.length || !('IntersectionObserver' in window)) return;
        const wideMQ = window.matchMedia ? window.matchMedia('(min-width: 980px)') : null;
        const wide = () => !wideMQ || wideMQ.matches;
        // The sticky phone only exists on wide screens, so its screens load on demand there.
        const load = (i) => {
            const img = shots[i];
            if (img && img.dataset.src && wide()) { img.src = img.dataset.src; delete img.dataset.src; }
        };
        let current = shots[0].getAttribute('data-screen');
        const show = (name) => {
            let at = 0;
            shots.forEach((img, i) => { if (img.getAttribute('data-screen') === name) at = i; });
            load(at);
            load(at + 1);
            if (name === current) return;
            current = name;
            shots.forEach((img) => img.classList.toggle('is-on', img.getAttribute('data-screen') === name));
        };
        const tour = document.querySelector('.vm-tour');
        new IntersectionObserver((entries, obs) => {
            if (!entries[entries.length - 1].isIntersecting || !wide()) return;
            show(current);
            obs.disconnect();
        }, { rootMargin: '100% 0px 100% 0px' }).observe(tour);
        listen(wideMQ, () => { if (wide()) show(current); });
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => { if (e.isIntersecting) show(e.target.getAttribute('data-screen')); });
        }, { rootMargin: '-48% 0px -48% 0px', threshold: 0 });
        feats.forEach((f) => io.observe(f));
    })();

    /* ---------- the metronome ----------------------------------- */

    const rig = document.querySelector('.vm-rig');
    if (!rig) return;

    const MIN_BPM = 30;
    const MAX_BPM = 300;
    const LOOKAHEAD = 0.12;   // seconds booked ahead of the clock
    const TICK_MS = 25;       // scheduler cadence
    const START_LEAD = 0.06;  // silence before the first beat
    const FRAME_LEAD = 0.008; // a frame reaches the screen a little after it is drawn

    const el = {
        stage: rig.querySelector('.vm-stage'),
        canvas: rig.querySelector('.vm-canvas'),
        status: rig.querySelector('.vm-status-text'),
        led: rig.querySelector('.vm-led'),
        pips: rig.querySelector('.vm-pips'),
        bpm: rig.querySelector('.vm-bpm-n'),
        term: rig.querySelector('.vm-term'),
        range: rig.querySelector('#vm-tempo'),
        nudges: rig.querySelectorAll('.vm-nudge'),
        tap: rig.querySelector('.vm-tap'),
        play: rig.querySelector('.vm-play'),
        playLabel: rig.querySelector('.vm-play-label'),
        sound: rig.querySelector('.vm-sound'),
        live: document.getElementById('vm-live')
    };
    const g = el.canvas.getContext('2d');
    if (!g) return;

    const state = {
        bpm: 120,
        beats: 4,
        sub: 1,
        accents: [2, 1, 1, 1],
        vis: 'pulse_orb',
        sound: false,
        running: false
    };

    // Same bands as the app (lib/core/tempo_terms.dart).
    function tempoTerm(bpm) {
        if (bpm < 40) return 'Grave';
        if (bpm < 60) return 'Largo';
        if (bpm < 66) return 'Larghetto';
        if (bpm < 76) return 'Adagio';
        if (bpm < 108) return 'Andante';
        if (bpm < 120) return 'Moderato';
        if (bpm < 156) return 'Allegro';
        if (bpm < 176) return 'Vivace';
        if (bpm < 200) return 'Presto';
        return 'Prestissimo';
    }

    let liveTimer = 0;
    function announce(msg, delay) {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(() => { el.live.textContent = msg; }, delay || 0);
    }

    /* ----- clocks -----
       Until sound is switched on the timeline runs on performance.now().
       Once the AudioContext is running, every booked time is moved onto
       ctx.currentTime and clicks are scheduled there, sample-accurate. */

    let actx = null;
    let master = null;
    let noise = null;
    let clock = 'performance';
    let voices = [];

    const perfNow = () => performance.now() / 1000;
    const audioReady = () => !!actx && actx.state === 'running';
    const now = () => (clock === 'audio' ? actx.currentTime : perfNow());

    // What the listener hears right now, on the timeline's clock.
    function heardNow() {
        if (clock === 'audio') {
            const ts = actx.getOutputTimestamp ? actx.getOutputTimestamp() : null;
            if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
                return ts.contextTime + (performance.now() - ts.performanceTime) / 1000 + FRAME_LEAD;
            }
            return actx.currentTime - (actx.outputLatency || actx.baseLatency || 0) + FRAME_LEAD;
        }
        return perfNow() + FRAME_LEAD;
    }

    function syncClock() {
        const want = audioReady() ? 'audio' : 'performance';
        if (want === clock) return;
        const from = clock === 'audio' ? actx.currentTime : perfNow();
        const to = want === 'audio' ? actx.currentTime : perfNow();
        const d = to - from;
        nextTime += d;
        for (let i = 0; i < steps.length; i++) steps[i].t += d;
        clock = want;
        rig.setAttribute('data-clock', clock);
    }

    /* ----- scheduler ----- */

    let timer = 0;
    let nextTime = 0;
    let steps = [];
    const pos = { bar: 0, beat: 0, sub: 0, spb: 1, beats: 4 };

    function schedule() {
        if (!state.running) return;
        syncClock();
        const horizon = now() + LOOKAHEAD;
        while (nextTime < horizon) {
            if (pos.sub === 0) {
                // Meter and subdivision changes land on the next beat.
                pos.spb = state.sub;
                pos.beats = state.beats;
                if (pos.beat >= pos.beats) { pos.beat = 0; pos.bar++; }
            }
            const level = state.accents[pos.beat] == null ? 1 : state.accents[pos.beat];
            const dur = 60 / state.bpm / pos.spb;
            const s = { t: nextTime, dur: dur, bar: pos.bar, beat: pos.beat, sub: pos.sub, spb: pos.spb, beats: pos.beats, level: level };
            steps.push(s);
            if (steps.length > 96) steps.shift();
            if (state.sound && clock === 'audio') voice(s);
            nextTime += dur;
            pos.sub++;
            if (pos.sub >= pos.spb) {
                pos.sub = 0;
                pos.beat++;
                if (pos.beat >= pos.beats) { pos.beat = 0; pos.bar++; }
            }
        }
    }

    /* ----- sound: a short wooden click, synthesised ----- */

    function makeNoise() {
        const len = Math.floor(actx.sampleRate * 0.03);
        const buf = actx.createBuffer(1, len, actx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        return buf;
    }

    // Gains follow the app: accent 1.0, beat 0.8, subdivision 0.4; silent beats stay quiet.
    function voice(s) {
        let gain;
        let freq;
        if (s.sub > 0) { gain = 0.4; freq = 1180; }
        else if (s.level === 0) return;
        else if (s.level === 2) { gain = 1; freq = 1560; }
        else { gain = 0.8; freq = 1180; }
        const t = Math.max(s.t, actx.currentTime);
        const peak = 0.55 * gain;

        const o = actx.createOscillator();
        const og = actx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, t);
        o.frequency.exponentialRampToValueAtTime(freq * 0.82, t + 0.05);
        og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(peak, t + 0.0015);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        o.connect(og).connect(master);
        o.start(t);
        o.stop(t + 0.07);

        const n = actx.createBufferSource();
        const bp = actx.createBiquadFilter();
        const ng = actx.createGain();
        n.buffer = noise;
        bp.type = 'bandpass';
        bp.frequency.value = freq * 2.2;
        bp.Q.value = 3;
        ng.gain.value = peak * 0.7;
        n.connect(bp).connect(ng).connect(master);
        n.start(t);

        voices.push({ t: t, nodes: [o, n] });
        if (voices.length > 64) voices.splice(0, voices.length - 64);
    }

    function silenceBooked() {
        if (!actx) return;
        const t0 = actx.currentTime;
        voices.forEach((v) => {
            if (v.t > t0) v.nodes.forEach((node) => { try { node.stop(); } catch (e) { /* already stopped */ } });
        });
        voices = [];
    }

    function ensureAudio() {
        if (!actx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            try { actx = new AC({ latencyHint: 'interactive' }); } catch (e) {
                try { actx = new AC(); } catch (e2) { actx = null; return null; }
            }
            master = actx.createGain();
            master.gain.value = 0.7;
            master.connect(actx.destination);
            noise = makeNoise();
            actx.onstatechange = () => { if (state.running) schedule(); };
        }
        return actx;
    }

    /* ----- transport ----- */

    function begin() {
        if (state.running) return;
        syncClock();
        state.running = true;
        steps = [];
        pos.bar = 0; pos.beat = 0; pos.sub = 0;
        nextTime = now() + START_LEAD;
        rig.setAttribute('data-state', 'running');
        el.playLabel.textContent = 'Stop';
        schedule();
        timer = setInterval(schedule, TICK_MS);
        announce('Playing at ' + state.bpm + ' BPM');
        startLoop();
    }

    function start() {
        if (state.running) return;
        if (state.sound && ensureAudio() && actx.state !== 'running') {
            actx.resume().then(begin, begin);
            return;
        }
        begin();
    }

    function stop(quiet) {
        if (!state.running) return;
        state.running = false;
        clearInterval(timer);
        timer = 0;
        silenceBooked();
        rig.setAttribute('data-state', 'stopped');
        el.playLabel.textContent = 'Start';
        setNow(-1, false, 0, true);
        el.status.textContent = 'Ready';
        if (actx && actx.state === 'running') actx.suspend().catch(() => {});
        if (!quiet) announce('Stopped');
        draw();
    }

    const toggle = () => (state.running ? stop() : start());

    /* ----- settings ----- */

    function setTempo(v, source) {
        const bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(v)));
        if (bpm === state.bpm && source !== 'init') return;
        state.bpm = bpm;
        const term = tempoTerm(bpm);
        el.bpm.textContent = String(bpm);
        el.term.textContent = term;
        if (source !== 'range') el.range.value = String(bpm);
        el.range.setAttribute('aria-valuetext', bpm + ' BPM, ' + term);
        if (source === 'tap' || source === 'nudge') announce(bpm + ' BPM, ' + term, 700);
        if (!state.running) draw();
    }

    const LEVEL_NAMES = ['silent', 'normal', 'accent'];

    function renderPips() {
        const n = state.beats;
        while (el.pips.children.length > n) el.pips.lastElementChild.remove();
        while (el.pips.children.length < n) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'vm-pip';
            b.appendChild(document.createElement('i'));
            el.pips.appendChild(b);
        }
        Array.prototype.forEach.call(el.pips.children, (b, i) => {
            const lv = state.accents[i];
            b.setAttribute('data-level', String(lv));
            b.setAttribute('aria-label', 'Beat ' + (i + 1) + ': ' + LEVEL_NAMES[lv]);
            b.disabled = false;
        });
    }

    function setMeter(n) {
        // Keep the accents already set, fill new beats as normal (app: normalizedBeatAccents).
        const next = [];
        for (let i = 0; i < n; i++) next.push(i < state.accents.length ? state.accents[i] : 1);
        state.accents = next;
        state.beats = n;
        renderPips();
        if (!state.running) draw();
    }

    function cycleAccent(i) {
        const cur = state.accents[i];
        state.accents[i] = cur === 1 ? 2 : cur === 2 ? 0 : 1; // normal → accent → silent
        renderPips();
        lastBeatKey = '';
        if (!state.running) draw();
    }

    /* ----- tap tempo: the average of the last taps (max 6, within 2.2 s), like the app ----- */

    let taps = [];
    let tapFlash = 0;
    function tap() {
        const t = performance.now();
        taps = taps.filter((x) => t - x <= 2200);
        taps.push(t);
        while (taps.length > 6) taps.shift();
        el.tap.classList.add('is-hit');
        clearTimeout(tapFlash);
        tapFlash = setTimeout(() => el.tap.classList.remove('is-hit'), 110);
        if (taps.length < 2) return;
        const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
        if (avg > 0) setTempo(60000 / avg, 'tap');
    }

    /* ----- rendering ----- */

    let colors = {};
    function hex(c) {
        c = c.trim();
        if (c[0] === '#' && c.length === 7) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
        if (c[0] === '#' && c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
        return [128, 128, 128];
    }
    function readColors() {
        const cs = getComputedStyle(root);
        colors = {
            ink: hex(cs.getPropertyValue('--vm-ink')),
            dim: hex(cs.getPropertyValue('--vm-dim')),
            brass: hex(cs.getPropertyValue('--vm-brass')),
            ice: hex(cs.getPropertyValue('--vm-ice')),
            shade: hex(cs.getPropertyValue('--vm-shade')),
            white: [255, 255, 255]
        };
    }
    const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
    const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
    const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    const impulse = (since, life) => (since < 0 || since >= life ? 0 : Math.pow(1 - since / life, 2));
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const easeInCubic = (t) => t * t * t;
    const anticipation = (phase, lead) => (phase <= 1 - lead ? 0 : easeInCubic(clamp01((phase - (1 - lead)) / lead)));

    let W = 0;
    let H = 0;
    let calm = !!(reducedMQ && reducedMQ.matches);

    function resize() {
        const r = el.stage.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = Math.max(1, Math.round(r.width));
        H = Math.max(1, Math.round(r.height));
        el.canvas.width = Math.round(W * dpr);
        el.canvas.height = Math.round(H * dpr);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    // Where the timeline is at time t: current step, beat and bar phases.
    function frameAt(t) {
        const f = { live: false, beats: state.beats, spb: state.sub };
        if (!state.running || !steps.length || t < steps[0].t) return f;
        let i = steps.length - 1;
        while (i > 0 && steps[i].t > t) i--;
        const s = steps[i];
        if (s.t > t) return f;
        let j = i;
        while (j > 0 && steps[j].sub !== 0) j--;
        const beatStart = steps[j].sub === 0 ? steps[j].t : s.t - s.sub * s.dur;
        let p = j - 1;
        while (p > 0 && steps[p].sub !== 0) p--;
        f.live = true;
        f.step = s;
        f.beats = s.beats;
        f.spb = s.spb;
        f.beat = s.beat;
        f.sub = s.sub;
        f.bar = s.bar;
        f.level = s.level;
        f.prevLevel = p >= 0 && steps[p] && steps[p].sub === 0 && p !== j ? steps[p].level : 1;
        f.stepDur = s.dur;
        f.beatDur = s.dur * s.spb;
        f.sinceStep = t - s.t;
        f.sinceBeat = t - beatStart;
        f.stepPhase = clamp01(f.sinceStep / s.dur);
        f.beatPhase = clamp01(f.sinceBeat / f.beatDur);
        f.barPhase = clamp01((s.beat + f.beatPhase) / s.beats);
        f.stepInBar = s.beat * s.spb + s.sub;
        return f;
    }

    function draw(t) {
        if (!W || !H) return;
        const f = frameAt(t == null ? heardNow() : t);
        g.clearRect(0, 0, W, H);
        // Brightness pulses fade out between 2 and 3 beats a second (120-180 BPM);
        // above that the beat is carried by size and position alone.
        const bps = state.bpm / 60;
        f.kBeat = bps <= 2 ? 1 : Math.max(0, 3 - bps);
        const sps = bps * (f.spb || 1);
        f.kStep = sps <= 2 ? 1 : Math.max(0, 3 - sps);
        if (state.vis === 'bar_map') drawBarMap(f);
        else if (state.vis === 'eq_bars') drawMeterBars(f);
        else drawOrb(f);
        if (f.live) setNow(f.beat, f.level === 2, f.bar);
        return f;
    }

    /* Pulse Orb: draws breath through the last third of each beat and pops on it. */
    function drawOrb(f) {
        const cx = W / 2;
        const cy = H * 0.52;
        const base = Math.min(W, H) * 0.19;
        let pop = 0;
        let tick = 0;
        let inhale = 0;
        if (f.live && !calm) {
            pop = impulse(f.sinceBeat, Math.min(f.beatDur * 0.55, 0.32));
            tick = impulse(f.sinceStep, Math.min(f.stepDur * 0.5, 0.18));
            inhale = anticipation(f.beatPhase, 0.34);
        }
        // Calm mode keeps one color; the deck's pips carry the accent.
        const accent = f.live && f.level === 2 && !calm;
        const core = accent ? colors.brass : colors.ice;
        const glow = pop * f.kBeat;
        const r = base * (1 + 0.17 * pop + 0.04 * tick - 0.07 * inhale);

        // Stage wash: the color of the beat, low and wide.
        let gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
        gr.addColorStop(0, rgba(core, 0.12 + 0.12 * glow));
        gr.addColorStop(1, rgba(core, 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);

        // Shock rings from the last two beats.
        if (f.live && !calm) {
            for (let k = 0; k < 2; k++) {
                const since = f.sinceBeat + k * f.beatDur;
                const life = Math.min(f.beatDur * 1.6, 1.4);
                const tt = since / life;
                if (tt >= 1) continue;
                const ringR = r * (1 + 1.6 * easeOutCubic(tt));
                const was = k === 0 ? f.level === 2 : f.prevLevel === 2;
                g.beginPath();
                g.arc(cx, cy, ringR, 0, Math.PI * 2);
                g.strokeStyle = rgba(was ? colors.brass : colors.ice, 0.5 * (1 - tt));
                g.lineWidth = 2.2 * (1 - tt) + 0.6;
                g.stroke();
            }
            // Anticipation ring closing in on the next beat.
            const gap = base * (0.9 * (1 - inhale) + 0.12);
            g.beginPath();
            g.arc(cx, cy, r + gap, 0, Math.PI * 2);
            g.strokeStyle = rgba(colors.ink, 0.1 + 0.35 * inhale);
            g.lineWidth = 1.2;
            g.stroke();
        }

        // Halo.
        gr = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.9);
        gr.addColorStop(0, rgba(core, 0.24 + 0.3 * glow));
        gr.addColorStop(1, rgba(core, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
        g.fill();

        // Body.
        gr = g.createRadialGradient(cx - r * 0.32, cy - r * 0.36, 0, cx - r * 0.32, cy - r * 0.36, r * 1.35);
        gr.addColorStop(0, rgba(mix(core, colors.white, 0.5 + 0.3 * glow), 1));
        gr.addColorStop(0.45, rgba(core, 1));
        gr.addColorStop(1, rgba(mix(core, colors.shade, 0.55), 1));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();

        // Subdivision pips round the rim: small, so they may tick fast.
        if (f.spb > 1) {
            for (let i = 0; i < f.spb; i++) {
                const a = -Math.PI / 2 + (i * Math.PI * 2) / f.spb;
                const lit = f.live && i === f.sub ? (calm ? 1 : Math.max(tick, 0.35)) : 0;
                g.beginPath();
                g.arc(cx + Math.cos(a) * (r + 18), cy + Math.sin(a) * (r + 18), 2.4 + 2.2 * lit, 0, Math.PI * 2);
                g.fillStyle = rgba(colors.ink, 0.3 + 0.6 * lit);
                g.fill();
            }
        }

        // Beat count.
        const label = f.live ? String(f.beat + 1) : String(f.beats);
        g.font = '600 ' + Math.round(r * 0.9) + 'px Unbounded, Outfit, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = rgba(colors.shade, 0.72);
        g.fillText(label, cx, cy + r * 0.04);
    }

    /* Bar Map: one pip per beat, a cursor sweeping the bar, a big count. */
    function drawBarMap(f) {
        const n = f.beats;
        const margin = W * 0.12;
        const span = W - margin * 2;
        const slot = span / n;
        const rowY = H * 0.66;
        const railY = rowY + Math.min(40, H * 0.08);
        const strike = f.live && !calm ? impulse(f.sinceStep, Math.min(f.stepDur * 0.6, 0.25)) : 0;
        const beatPop = f.live && !calm ? impulse(f.sinceBeat, Math.min(f.beatDur * 0.5, 0.3)) : 0;

        g.strokeStyle = rgba(colors.ink, 0.16);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(margin, railY);
        g.lineTo(W - margin, railY);
        g.stroke();
        if (f.spb > 1) {
            g.strokeStyle = rgba(colors.dim, 0.7);
            g.beginPath();
            for (let i = 0; i < n; i++) {
                for (let s = 1; s < f.spb; s++) {
                    const x = margin + slot * (i + s / f.spb);
                    g.moveTo(x, railY - 3);
                    g.lineTo(x, railY + 3);
                }
            }
            g.stroke();
        }
        g.strokeStyle = rgba(colors.ink, 0.38);
        g.lineWidth = 1.2;
        g.beginPath();
        for (let i = 0; i <= n; i++) {
            const x = margin + slot * i;
            g.moveTo(x, railY - 6);
            g.lineTo(x, railY + 6);
        }
        g.stroke();

        for (let i = 0; i < n; i++) {
            const level = state.accents[i] == null ? 1 : state.accents[i];
            const current = f.live && i === f.beat;
            const col = level === 2 ? colors.brass : colors.ink;
            const baseR = level === 2 ? 13 : 9.5;
            const r = baseR + (current ? 6 * beatPop : 0);
            const x = margin + slot * (i + 0.5);
            if (current && beatPop > 0.02) {
                g.beginPath();
                g.arc(x, rowY, r + 22 * (1 - beatPop), 0, Math.PI * 2);
                g.strokeStyle = rgba(col, 0.5 * beatPop);
                g.lineWidth = 2 * beatPop + 0.5;
                g.stroke();
                const gl = g.createRadialGradient(x, rowY, r * 0.5, x, rowY, r * 2.2);
                gl.addColorStop(0, rgba(col, 0.45 * beatPop * f.kBeat));
                gl.addColorStop(1, rgba(col, 0));
                g.fillStyle = gl;
                g.beginPath();
                g.arc(x, rowY, r * 2.2, 0, Math.PI * 2);
                g.fill();
            }
            g.beginPath();
            g.arc(x, rowY, r, 0, Math.PI * 2);
            if (level === 0) {
                g.strokeStyle = rgba(col, current ? 0.9 : 0.45);
                g.lineWidth = 1.6;
                g.stroke();
            } else {
                g.fillStyle = rgba(col, current ? 1 : 0.36);
                g.fill();
            }
        }

        // Cursor: continuous with the bar phase (in calm mode it steps per beat).
        if (f.live) {
            const phase = calm ? f.beat / n : f.barPhase;
            const x = margin + span * phase;
            const col = f.level === 2 ? colors.brass : colors.ink;
            g.strokeStyle = rgba(col, 0.9);
            g.lineWidth = 2 + 2 * strike;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(x, railY - 12);
            g.lineTo(x, railY + 12);
            g.stroke();
            g.lineCap = 'butt';
            g.beginPath();
            g.arc(x, railY, 3 + 3 * strike, 0, Math.PI * 2);
            g.fillStyle = rgba(col, 1);
            g.fill();
        }

        // Big count.
        const label = f.live ? String(f.beat + 1) : String(f.beats);
        const size = Math.round(Math.min(H * 0.3, W * 0.26));
        const col = f.live && f.level === 2 ? colors.brass : colors.ink;
        g.font = '500 ' + size + 'px Unbounded, Outfit, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillStyle = rgba(col, f.live ? 0.62 + 0.38 * beatPop * f.kBeat : 1);
        g.fillText(label, W / 2, rowY - Math.max(34, H * 0.07));
    }

    /* Meter Bars: one bar per step; each shoots up on its click and decays. */
    function drawMeterBars(f) {
        const spb = f.spb;
        const n = f.beats * spb;
        const baseY = H * 0.74;
        const maxH = H * 0.44;
        const margin = W * 0.08;
        const slotW = (W - margin * 2) / n;
        const barW = Math.max(5, slotW * (n > 12 ? 0.55 : 0.62));
        const rad = Math.min(barW * 0.25, 6);

        for (let i = 0; i < n; i++) {
            const beat = Math.floor(i / spb);
            const isMain = i % spb === 0;
            const level = state.accents[beat] == null ? 1 : state.accents[beat];
            const col = isMain ? (level === 2 ? colors.brass : colors.ice) : colors.dim;
            const capH = (isMain ? (level === 2 ? 1 : 0.78) : 0.42) * maxH;
            const cx = margin + slotW * (i + 0.5);
            let h;
            let alpha;
            if (f.live) {
                g.fillStyle = rgba(col, 0.06);
                roundRect(cx - barW / 2, baseY - capH, barW, capH, rad);
                g.fill();
                if (calm) {
                    const on = i === f.stepInBar;
                    h = on ? capH : capH * 0.06;
                    alpha = on ? 0.9 : 0.25;
                } else {
                    const back = ((f.stepInBar - i) % n + n) % n;
                    const since = f.sinceStep + back * f.stepDur;
                    const e = impulse(since, Math.min(f.stepDur * 2.2, 1.6));
                    h = capH * (0.06 + 0.94 * e);
                    alpha = 0.25 + 0.7 * e * (0.55 + 0.45 * f.kStep);
                }
                if (level === 0 && isMain) { h = capH * 0.06; alpha = 0.25; }
            } else {
                // At rest: the bar's outline, so the meter reads before it plays.
                g.fillStyle = rgba(col, 0.1);
                roundRect(cx - barW / 2, baseY - capH, barW, capH, rad);
                g.fill();
                h = capH * 0.06;
                alpha = 0.35;
            }
            g.fillStyle = rgba(col, alpha);
            roundRect(cx - barW / 2, baseY - h, barW, h, Math.min(rad, h / 2));
            g.fill();

            // Ghost cap rising toward the next click.
            if (f.live && !calm && i === (f.stepInBar + 1) % n) {
                const rise = easeInCubic(f.stepPhase);
                g.fillStyle = rgba(colors.ink, 0.25 + 0.55 * rise);
                roundRect(cx - barW / 2, baseY - capH * rise - 3, barW, 3, 1.5);
                g.fill();
            }

            if (isMain) {
                g.font = '600 12px Unbounded, Outfit, sans-serif';
                g.textAlign = 'center';
                g.textBaseline = 'top';
                g.fillStyle = rgba(colors.ink, 0.55);
                g.fillText(String(beat + 1), cx, baseY + 10);
            }
        }
        g.strokeStyle = rgba(colors.ink, 0.2);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(margin, baseY + 0.5);
        g.lineTo(W - margin, baseY + 0.5);
        g.stroke();
    }

    function roundRect(x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
    }

    /* ----- the beat in the DOM: pip, LED, bar count (only on change) ----- */

    let lastBeatKey = '';
    function setNow(beat, accent, bar, force) {
        const key = beat + ':' + bar + ':' + accent;
        if (key === lastBeatKey && !force) return;
        lastBeatKey = key;
        Array.prototype.forEach.call(el.pips.children, (b, i) => b.classList.toggle('is-now', i === beat));
        el.led.classList.toggle('is-accent', !!accent);
        if (beat >= 0) el.status.textContent = 'Bar ' + (bar + 1);
    }

    /* ----- the frame loop: only while running, on screen and visible ----- */

    let raf = 0;
    let onScreen = false;
    function frame() {
        raf = 0;
        if (!state.running) return;
        schedule();
        draw();
        if (onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function startLoop() {
        if (!raf && state.running && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    }

    /* ----- wiring ----- */

    function wire() {
        // Controls ship disabled so they read as inert without JavaScript.
        rig.querySelectorAll('button, input').forEach((c) => { c.disabled = false; });

        el.play.addEventListener('click', toggle);

        el.sound.addEventListener('click', () => {
            const on = el.sound.getAttribute('aria-checked') !== 'true';
            if (on) {
                if (!ensureAudio()) { announce('Sound is not available in this browser'); return; }
                state.sound = true;
                if (actx.state !== 'running' && state.running) actx.resume().then(() => schedule(), () => {});
                else if (actx.state !== 'running') actx.resume().catch(() => {});
            } else {
                state.sound = false;
                silenceBooked();
                if (!state.running && actx && actx.state === 'running') actx.suspend().catch(() => {});
            }
            el.sound.setAttribute('aria-checked', on ? 'true' : 'false');
            announce(on ? 'Sound on' : 'Sound off');
        });

        el.range.addEventListener('input', () => setTempo(+el.range.value, 'range'));

        // − / +: one step per press, hold to repeat and speed up (as the app's steppers do).
        el.nudges.forEach((b) => {
            const dir = +b.getAttribute('data-nudge');
            let hold = 0;
            let rep = 0;
            let ticks = 0;
            const end = () => { clearTimeout(hold); clearInterval(rep); hold = 0; rep = 0; };
            b.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                setTempo(state.bpm + dir, 'nudge');
                ticks = 0;
                end();
                hold = setTimeout(() => {
                    rep = setInterval(() => {
                        ticks++;
                        setTempo(state.bpm + dir * (ticks > 30 ? 5 : ticks > 11 ? 2 : 1), 'nudge');
                    }, 90);
                }, 380);
            });
            ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((ev) => b.addEventListener(ev, end));
            b.addEventListener('contextmenu', (e) => e.preventDefault());
            // Keyboard activation arrives as a click with no pointer behind it.
            b.addEventListener('click', (e) => { if (e.detail === 0) setTempo(state.bpm + dir, 'nudge'); });
        });

        el.tap.addEventListener('pointerdown', (e) => { if (e.button === 0) tap(); });
        el.tap.addEventListener('click', (e) => { if (e.detail === 0) tap(); });
        el.tap.addEventListener('contextmenu', (e) => e.preventDefault());

        el.pips.addEventListener('click', (e) => {
            const b = e.target.closest('.vm-pip');
            if (!b) return;
            const i = Array.prototype.indexOf.call(el.pips.children, b);
            cycleAccent(i);
            announce('Beat ' + (i + 1) + ': ' + LEVEL_NAMES[state.accents[i]], 150);
        });

        rig.addEventListener('change', (e) => {
            const t = e.target;
            if (t.name === 'vm-meter') setMeter(+t.value);
            else if (t.name === 'vm-sub') { state.sub = +t.value; if (!state.running) draw(); }
            else if (t.name === 'vm-vis') { state.vis = t.value; draw(); }
        });

        // Space starts and stops anywhere on the rig, except where Space already means something.
        rig.addEventListener('keydown', (e) => {
            if (e.key !== ' ' && e.code !== 'Space') return;
            const t = e.target;
            if (t.closest('button') || (t.tagName === 'INPUT' && t.type === 'radio')) return;
            e.preventDefault();
            if (!e.repeat) toggle();
        });

        // T taps the tempo while the metronome is on screen.
        document.addEventListener('keydown', (e) => {
            if ((e.key !== 't' && e.key !== 'T') || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
            const t = e.target;
            if (t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
                (t.tagName === 'INPUT' && !/^(range|radio|checkbox|button)$/.test(t.type)) || t.closest('dialog'))) return;
            if (!rigInView) return;
            tap();
        });

        // Stop when the tab is hidden; stop for good once the rig is far off screen.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stop(true);
            else startLoop();
        });

        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                onScreen = entries[entries.length - 1].isIntersecting;
                if (onScreen) startLoop();
            }, { threshold: 0 }).observe(el.stage);
            new IntersectionObserver((entries) => {
                rigInView = entries[entries.length - 1].isIntersecting;
            }, { threshold: 0 }).observe(rig);
            new IntersectionObserver((entries) => {
                if (!entries[entries.length - 1].isIntersecting) stop(false);
            }, { rootMargin: '60% 0px 60% 0px', threshold: 0 }).observe(rig);
        } else {
            onScreen = true;
            rigInView = true;
        }

        const redraw = () => { readColors(); syncThemeMeta(); draw(); };
        document.addEventListener('rex:theme', redraw);
        listen(lightMQ, redraw);
        listen(reducedMQ, () => { calm = !!reducedMQ.matches; draw(); });

        if ('ResizeObserver' in window) new ResizeObserver(resize).observe(el.stage);
        else window.addEventListener('resize', resize);
        if (document.fonts && document.fonts.load) {
            document.fonts.load('600 40px Unbounded').then(() => draw(), () => {});
        }
    }

    let rigInView = false;

    readColors();
    renderPips();
    setTempo(state.bpm, 'init');
    wire();
    resize();
    rig.setAttribute('data-clock', clock);

    // A small handle for checking the timing from the console.
    window.vmMetronome = {
        start: start,
        stop: () => stop(),
        setTempo: (v) => setTempo(v, 'api'),
        snapshot: () => ({
            running: state.running,
            bpm: state.bpm,
            beats: state.beats,
            subdivision: state.sub,
            sound: state.sound,
            clock: clock,
            audioState: actx ? actx.state : null,
            drawing: !!raf,
            now: now(),
            steps: steps.slice(-16).map((s) => ({ t: +s.t.toFixed(6), bar: s.bar, beat: s.beat, sub: s.sub, dur: +s.dur.toFixed(6) }))
        })
    };
})();
