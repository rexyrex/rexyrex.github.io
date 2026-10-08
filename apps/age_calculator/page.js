/* /apps/age_calculator/: the reaction booth and the hearing sweep.
   Dependency-free. Ages come from the app's own tables
   (lib/utils/age_calculator.dart); nothing here leaves the tab. */
(() => {
    'use strict';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Same piecewise-linear interpolation as AgeCalculator._interpolate.
    function interpolate(value, inputs, ages) {
        if (value <= inputs[0]) return ages[0];
        if (value >= inputs[inputs.length - 1]) return ages[ages.length - 1];
        for (let i = 0; i < inputs.length - 1; i++) {
            if (value >= inputs[i] && value <= inputs[i + 1]) {
                const t = (value - inputs[i]) / (inputs[i + 1] - inputs[i]);
                return Math.round(ages[i] + t * (ages[i + 1] - ages[i]));
            }
        }
        return ages[ages.length - 1];
    }

    /* ---------------- Reaction booth ---------------- */

    const REACTION_MS = [240, 290, 350, 400, 460, 530, 620, 730];
    const REACTION_AGE = [14, 24, 30, 34, 44, 55, 68, 85];
    const ROUNDS = 5;

    // AgeCalculator._emojiForAge
    function emojiFor(age) {
        if (age < 15) return '\u{1F476}';
        if (age < 25) return '\u{1F60E}';
        if (age < 35) return '\u{1F4AA}';
        if (age < 45) return '\u{1F9D0}';
        if (age < 55) return '\u{1F3C6}';
        return '\u{1F451}';
    }

    // reactionMsg1..5 from lib/l10n/app_en.arb, picked like _reactionMessageKey
    function messageFor(age) {
        if (age < 20) return 'Are you even human?! That was faster than autocorrect ruining your texts!';
        if (age < 30) return "You'd dodge a dodgeball like a movie hero! Slow motion not needed.";
        if (age < 40) return "Solid speed! You'd survive the first round of any game show, probably.";
        if (age < 50) return "Hey, slow and steady wins the race... said the tortoise, and he wasn't wrong!";
        return "You react like you're savoring a fine wine \u2014 thoughtfully, gracefully, eventually.";
    }

    const booth = document.querySelector('.booth');
    if (booth) initBooth(booth);

    function initBooth(boothEl) {
        const pad = boothEl.querySelector('.pad');
        const icon = pad.querySelector('.pad-icon use');
        const title = pad.querySelector('.pad-title');
        const sub = pad.querySelector('.pad-sub');
        const card = boothEl.querySelector('.rcard');
        const cardNum = card.querySelector('.rcard-num');
        const cardEmoji = card.querySelector('.rcard-emoji');
        const cardMsg = card.querySelector('.rcard-msg');
        const cardMeta = card.querySelector('.rcard-meta');
        const confetti = card.querySelector('.rcard-confetti');
        const again = card.querySelector('.btn-again');
        const rows = Array.from(document.querySelectorAll('.rounds li'));
        const live = document.querySelector('[data-booth-live]');
        const ctaLine = document.querySelector('[data-cta-line]');
        const svg = boothEl.querySelector('.bulbs');
        const rects = svg ? svg.querySelectorAll('rect') : [];

        let state = 'idle';
        let times = [];
        let timer = 0;
        let flashAt = 0;
        let lastHandled = -1e9;
        let countRaf = 0;

        const say = (text) => { live.textContent = ''; window.setTimeout(() => { live.textContent = text; }, 30); };

        function setPad(iconId, titleText, subText) {
            if (iconId) icon.setAttribute('href', '#' + iconId);
            title.textContent = titleText;
            sub.textContent = subText || '';
        }

        function setState(next) {
            state = next;
            boothEl.dataset.state = next;
        }

        function paintRows() {
            rows.forEach((li, i) => {
                const ms = li.querySelector('.r-ms');
                const done = i < times.length;
                li.classList.toggle('is-done', done);
                li.classList.toggle('is-now', !done && i === times.length && state !== 'idle' && state !== 'done');
                li.classList.remove('is-dropped');
                ms.innerHTML = done ? '<span>' + times[i] + ' ms</span>' : '\u2013';
            });
        }

        function clearTimer() {
            window.clearTimeout(timer);
            timer = 0;
        }

        function startWaiting() {
            clearTimer();
            setState('waiting');
            setPad('i-glass', 'Wait for it...', 'Round ' + (times.length + 1) + ' of ' + ROUNDS);
            paintRows();
            // the app waits 1000 + random(3000) ms
            const delay = 1000 + Math.floor(Math.random() * 3000);
            timer = window.setTimeout(showFlash, delay);
        }

        function showFlash() {
            timer = 0;
            flashAt = 0;
            setState('flash');
            setPad(null, 'TAP!', '');
            // stamp the frame that paints the green
            window.requestAnimationFrame((now) => { if (state === 'flash') flashAt = now; });
            say('Green! Go.');
        }

        function tooEarly() {
            clearTimer();
            setState('early');
            setPad('i-warn', 'Too early!', 'Wait for the green flash');
            say('Too early. The round starts again.');
            timer = window.setTimeout(startWaiting, 1100);
        }

        function record(stamp) {
            const ms = Math.max(1, Math.round(stamp - flashAt));
            times.push(ms);
            paintRows();
            if (times.length >= ROUNDS) {
                finish();
                return;
            }
            setState('rest');
            setPad(null, ms + ' ms', 'Round ' + times.length + ' of ' + ROUNDS + ' done');
            say('Round ' + times.length + ': ' + ms + ' milliseconds.');
            timer = window.setTimeout(startWaiting, 1100);
        }

        function pause() {
            clearTimer();
            setState('paused');
            setPad('i-pause', 'Paused', times.length ? 'Press to carry on from round ' + (times.length + 1) : 'Press to start again');
            paintRows();
        }

        function finish() {
            clearTimer();
            // ReactionTestScreen._finishTest: drop fastest + slowest, median of the rest
            const sorted = times.slice().sort((a, b) => a - b);
            const trimmed = sorted.slice(1, sorted.length - 1);
            const mid = Math.floor(trimmed.length / 2);
            const median = trimmed.length % 2 ? trimmed[mid] : (trimmed[mid - 1] + trimmed[mid]) / 2;
            const age = interpolate(median, REACTION_MS, REACTION_AGE);

            const fast = times.indexOf(sorted[0]);
            let slow = times.lastIndexOf(sorted[sorted.length - 1]);
            if (slow === fast) slow = times.indexOf(sorted[sorted.length - 1], fast + 1);
            rows.forEach((li, i) => {
                if (i === fast || i === slow) {
                    li.classList.add('is-dropped');
                    li.querySelector('.r-ms').insertAdjacentHTML('beforeend', '<small>dropped</small>');
                }
            });

            setState('done');
            rows.forEach((li) => li.classList.remove('is-now'));
            cardEmoji.textContent = emojiFor(age);
            cardMsg.textContent = messageFor(age);
            cardMeta.textContent = 'Median tap: ' + Math.round(median) + ' ms, read off the app\u2019s reaction table.';
            card.hidden = false;
            countUp(age);
            burst();
            card.focus({ preventScroll: true });
            say('Your age is ' + age + '. Median tap ' + Math.round(median) + ' milliseconds. ' + messageFor(age));
            if (ctaLine) ctaLine.textContent = 'The booth says ' + age + '. For a second opinion, the app has the full eight-round test and four more, free on Google Play and the App Store.';
        }

        function countUp(age) {
            window.cancelAnimationFrame(countRaf);
            if (reduceMotion.matches) {
                cardNum.textContent = age;
                return;
            }
            const start = performance.now();
            const dur = 1100;
            const step = (now) => {
                const t = Math.min(1, (now - start) / dur);
                const eased = 1 - Math.pow(1 - t, 3);
                cardNum.textContent = Math.round(age * eased);
                if (t < 1) countRaf = window.requestAnimationFrame(step);
            };
            countRaf = window.requestAnimationFrame(step);
        }

        function burst() {
            confetti.textContent = '';
            if (reduceMotion.matches) return;
            const colors = ['var(--coral)', 'var(--teal)', 'var(--amber)', 'var(--lavender)', 'var(--pink)', 'var(--green)'];
            const frag = document.createDocumentFragment();
            for (let i = 0; i < 28; i++) {
                const p = document.createElement('i');
                const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.4;
                const dist = 120 + Math.random() * 140;
                p.style.setProperty('--c', colors[i % colors.length]);
                p.style.setProperty('--x', Math.round(Math.cos(angle) * dist * 1.3) + 'px');
                p.style.setProperty('--y', Math.round(Math.sin(angle) * dist - 60) + 'px');
                p.style.setProperty('--r', Math.round(Math.random() * 720 - 360) + 'deg');
                p.style.setProperty('--d', Math.round(Math.random() * 120) + 'ms');
                frag.appendChild(p);
            }
            confetti.appendChild(frag);
            window.setTimeout(() => { confetti.textContent = ''; }, 2000);
        }

        function reset() {
            clearTimer();
            window.cancelAnimationFrame(countRaf);
            times = [];
            card.hidden = true;
            confetti.textContent = '';
        }

        // One entry point for every kind of press.
        function press(stamp, kind) {
            switch (state) {
                case 'idle':
                case 'paused':
                    // starting needs a deliberate click/key, so a scroll gesture never starts it
                    if (kind === 'pointer') return false;
                    if (state === 'idle') times = [];
                    startWaiting();
                    return true;
                case 'waiting':
                    tooEarly();
                    return true;
                case 'flash':
                    if (!flashAt) { tooEarly(); return true; }
                    record(stamp);
                    return true;
                default:
                    return false;
            }
        }

        pad.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            if (press(e.timeStamp, 'pointer')) lastHandled = performance.now();
        });

        pad.addEventListener('keydown', (e) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            if (e.repeat) return;
            if (press(e.timeStamp, 'key')) lastHandled = performance.now();
        });

        pad.addEventListener('keyup', (e) => {
            if (e.key === ' ') e.preventDefault();
        });

        // clicks without a pointerdown/keydown first (assistive tech), plus starting
        pad.addEventListener('click', (e) => {
            if (performance.now() - lastHandled < 700) return;
            if (press(e.timeStamp, 'click')) lastHandled = performance.now();
        });

        again.addEventListener('click', () => {
            reset();
            setState('idle');
            paintRows();
            pad.focus({ preventScroll: true });
            startWaiting();
            lastHandled = performance.now();
        });

        // Looking away mid-round would skew the time, so the round is set aside.
        const busy = () => state === 'waiting' || state === 'flash' || state === 'rest' || state === 'early';
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && busy()) pause();
        });
        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    boothEl.classList.toggle('is-offscreen', !entry.isIntersecting);
                    if (!entry.isIntersecting && busy()) pause();
                });
            }, { threshold: 0.35 }).observe(boothEl);
        }

        // Bulbs: an even number spaced round the frame, so the chase never doubles up.
        function layoutBulbs() {
            if (!svg) return;
            const w = boothEl.clientWidth;
            const h = boothEl.clientHeight;
            const inset = w < 520 ? 7 : 10;
            const rw = w - inset * 2;
            const rh = h - inset * 2;
            const r = Math.min(parseFloat(getComputedStyle(boothEl).borderTopLeftRadius) - inset, rw / 2, rh / 2);
            const perimeter = 2 * (rw + rh) - 8 * r + 2 * Math.PI * r;
            const target = w < 520 ? 19 : 22;
            let n = Math.round(perimeter / target);
            if (n % 2) n += 1;
            const gap = perimeter / n;
            rects.forEach((rect) => {
                rect.setAttribute('x', inset);
                rect.setAttribute('y', inset);
                rect.setAttribute('width', rw);
                rect.setAttribute('height', rh);
                rect.setAttribute('rx', r);
            });
            boothEl.style.setProperty('--gap', gap.toFixed(3) + 'px');
        }
        layoutBulbs();
        if ('ResizeObserver' in window) new ResizeObserver(layoutBulbs).observe(boothEl);

        paintRows();
    }

    /* ---------------- Hearing sweep ---------------- */

    const HEAR_HZ = [5500, 6500, 7500, 8500, 9500, 10500, 11500, 13000, 14500, 16000, 17500, 19000, 20000];
    const HEAR_AGE = [73, 68, 64, 59, 54, 50, 46, 41, 34, 27, 21, 16, 11];
    const MIN_HZ = 200;
    const MAX_HZ = 18000;
    const SWEEP_S = 30;
    const CURVE = 0.65; // SineWaveSweepParams.sweepCurve
    const RAMP = ['#ff6b6b', '#ff85a2', '#d66be7', '#a78bfa', '#7c83fd'];

    const sweep = document.querySelector('.sweep');
    if (sweep) initSweep(sweep);

    function initSweep(root) {
        const range = root.querySelector('.sweep-range');
        const clip = root.querySelector('.sweep-clip');
        const head = root.querySelector('.wave-head');
        const hzOut = root.querySelector('[data-sweep-hz]');
        const ageOut = root.querySelector('[data-sweep-age]');
        const toggle = root.querySelector('.sweep-toggle');
        const toggleUse = toggle.querySelector('use');
        const toggleText = toggle.querySelector('span');

        const hzAt = (p) => MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, p);
        const label = (hz) => (hz >= 1000 ? (hz / 1000).toFixed(1) + ' kHz' : Math.round(hz) + ' Hz');

        function rampColor(p) {
            const scaled = Math.min(Math.max(p, 0), 1) * (RAMP.length - 1);
            const i = Math.min(Math.floor(scaled), RAMP.length - 2);
            const f = scaled - i;
            const a = RAMP[i].match(/\w\w/g).map((x) => parseInt(x, 16));
            const b = RAMP[i + 1].match(/\w\w/g).map((x) => parseInt(x, 16));
            return 'rgb(' + a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',') + ')';
        }

        function show(p) {
            const hz = hzAt(p);
            const age = interpolate(hz, HEAR_HZ, HEAR_AGE);
            const x = (p * 600).toFixed(1);
            clip.setAttribute('width', x);
            head.setAttribute('x1', x);
            head.setAttribute('x2', x);
            hzOut.textContent = label(hz);
            ageOut.textContent = 'Stop here and the app guesses ' + age + '.';
            range.setAttribute('aria-valuetext', label(hz) + ', the app guesses ' + age);
            root.style.setProperty('--knob', rampColor(p));
        }

        // auto sweep: the app's 30 s curve, a short hold at the top, then again
        let playing = false;
        let raf = 0;
        let t0 = 0;
        let last = 0;
        let visible = false;
        const HOLD = 1.8;

        function frame(now) {
            raf = 0;
            if (!playing || !visible || document.hidden) return;
            // after a rest off-screen, carry on from the same spot
            if (last && now - last > 250) t0 += now - last - 16;
            last = now;
            let s = (now - t0) / 1000;
            if (s > SWEEP_S + HOLD) { t0 = now; s = 0; }
            const p = Math.pow(Math.min(s, SWEEP_S) / SWEEP_S, CURVE);
            range.value = Math.round(p * 1000);
            show(p);
            raf = window.requestAnimationFrame(frame);
        }

        function kick() {
            if (!raf && playing && visible && !document.hidden) raf = window.requestAnimationFrame(frame);
        }

        function setPlaying(on) {
            playing = on;
            toggle.setAttribute('aria-pressed', String(on));
            toggleUse.setAttribute('href', on ? '#i-pause' : '#i-play');
            toggleText.textContent = on ? 'Pause sweep' : 'Play sweep';
            if (on) {
                // resume from wherever the knob is
                const p = range.value / 1000;
                const s = Math.pow(p, 1 / CURVE) * SWEEP_S;
                t0 = performance.now() - s * 1000;
                if (p >= 0.999) t0 = performance.now();
                last = 0;
                kick();
            } else if (raf) {
                window.cancelAnimationFrame(raf);
                raf = 0;
            }
        }

        range.addEventListener('input', () => {
            if (playing) setPlaying(false);
            show(range.value / 1000);
        });
        toggle.addEventListener('click', () => setPlaying(!playing));
        toggle.hidden = false;

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) kick();
        });
        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                visible = entries[entries.length - 1].isIntersecting;
                if (visible) kick();
            }).observe(root);
        } else {
            visible = true;
        }

        show(range.value / 1000);
        setPlaying(!reduceMotion.matches);
    }

    /* ---------------- Hero: rest the bobbing tokens off-screen ---------------- */

    const hero = document.querySelector('.hero');
    if (hero && 'IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
            hero.classList.toggle('hero-paused', !entries[entries.length - 1].isIntersecting);
        }).observe(hero);
    }
})();
