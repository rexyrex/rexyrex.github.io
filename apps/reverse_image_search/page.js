/* Reverse Image Search — /apps/reverse_image_search/
   Dependency-free. Three pieces:
   1. Apertures (irises) drawn from geometry, the hero one opens once.
   2. The bench: a sample picture is resized, turned into a temporary
      link and fanned out to the four engines, in the order the app
      does it (lib/main.dart: pick → upload → searchEngines[0..3]).
      The timeline is a pure function of t, so pausing, resizing and
      reduced motion all just re-render a time.
   3. The results tabs: four real captures stacked like the app's
      IndexedStack, switched instantly. */
(() => {
    'use strict';

    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = reduceMQ.matches;

    const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    const seg = (t, a, b) => clamp01((t - a) / (b - a));
    const SVGNS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => {
        const el = document.createElementNS(SVGNS, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };

    /* ---------- 1. Irises ------------------------------------------ */

    // n blades tiling the ring between a regular n-gon of circumradius a
    // and the circle of radius R: each blade runs from one polygon vertex
    // along the extension of its edge out to the rim.
    function irisPaths(n, R, a, rot) {
        const V = [];
        for (let i = 0; i < n; i++) {
            const ang = rot + (2 * Math.PI * i) / n;
            V.push([a * Math.cos(ang), a * Math.sin(ang)]);
        }
        const W = [];
        for (let i = 0; i < n; i++) {
            const A = V[i];
            const P = V[(i + 1) % n];
            let dx = P[0] - A[0];
            let dy = P[1] - A[1];
            const l = Math.hypot(dx, dy) || 1;
            dx /= l; dy /= l;
            const pd = P[0] * dx + P[1] * dy;
            const pp = P[0] * P[0] + P[1] * P[1];
            const s = -pd + Math.sqrt(Math.max(0, pd * pd - (pp - R * R)));
            W.push([P[0] + s * dx, P[1] + s * dy]);
        }
        const f = (p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2);
        return V.map((_, i) => `M${f(V[(i + 1) % n])}L${f(W[i])}A${R} ${R} 0 0 1 ${f(W[(i + 1) % n])}Z`);
    }

    function drawIris(g, open) {
        const n = +g.dataset.iris;
        const R = +g.dataset.r;
        const rot = (+g.dataset.rot || 0) + open * 0.9; // blades turn as they open
        const ds = irisPaths(n, R, Math.max(0.02, open) * R, rot);
        while (g.childNodes.length < n) g.appendChild(mk('path', {}));
        ds.forEach((d, i) => g.childNodes[i].setAttribute('d', d));
    }

    document.querySelectorAll('.iris-blades').forEach((g) => drawIris(g, +g.dataset.open));

    const heroIris = document.querySelector('.ris-iris-hero .iris-blades');
    if (heroIris && !reduced) {
        const target = +heroIris.dataset.open;
        const from = 0.12;
        const dur = 1700;
        const delay = 120;
        let t0 = 0;
        drawIris(heroIris, from);
        const step = (now) => {
            if (!t0) t0 = now;
            const p = ease(seg(now - t0, delay, delay + dur));
            drawIris(heroIris, from + (target - from) * p);
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /* ---------- 2. The bench --------------------------------------- */

    const stage = document.querySelector('[data-stage]');
    if (stage) initBench(stage);

    function initBench(stage) {
        const bench = stage.closest('.ris-bench');
        const controls = bench.querySelector('.bench-controls');
        const radios = [...bench.querySelectorAll('input[name="sample"]')];
        const replay = bench.querySelector('[data-replay]');
        const svg = stage.querySelector('.beams');
        const photo = stage.querySelector('[data-photo]');
        const smp = photo.querySelector('[data-smp]');
        const loupe = photo.querySelector('.loupe');
        const loupeSvg = loupe.querySelector('svg');
        const uses = [smp.querySelector('use'), loupeSvg.querySelector('use')];
        const nodeResize = stage.querySelector('[data-node="resize"]');
        const nodeLink = stage.querySelector('[data-node="link"]');
        const nodeIris = nodeResize.querySelector('.iris-blades');
        const cards = [...stage.querySelectorAll('[data-engine]')];
        const statuses = cards.map((c) => c.querySelector('[data-status]'));
        const readout = bench.querySelector('[data-readout]');
        const cue = bench.querySelector('[data-cue]');

        controls.hidden = false;

        // Timeline (ms). Loading times differ per sample so runs feel live;
        // all four start together, as in the app.
        const T = { lock: 520, aStart: 260, aEnd: 980, irisStart: 520, irisEnd: 1200, bStart: 1080, bEnd: 1720, fanStart: 1820, fanEnd: 2480, load: 2380 };
        const DURATIONS = {
            lighthouse: [1500, 2500, 1950, 2900],
            plant: [2150, 1600, 2750, 1850],
            teapot: [1750, 2650, 1500, 2250],
        };
        const LINES = {
            resize: (label) => `Sample: ${label}. Resizing it so the longest side is at most 2048 px.`,
            upload: 'Uploading it to a temporary image host, with a 24-hour expiry requested.',
            fan: 'Sending the image link to Google Lens, TinEye, Yandex and Bing Visual Search, all at once.',
            done: 'All four are ready. In the app you’d now flip between four real result pages.',
            summary: (label) => `Sample: ${label}. Resized to at most 2048 px, uploaded with a 24-hour expiry requested, and sent to all four engines at once.`,
        };

        let sample = radios.find((r) => r.checked)?.value || 'lighthouse';
        let label = radios.find((r) => r.checked)?.dataset.label || 'a lighthouse at dusk';
        let dur = DURATIONS[sample];
        let end = T.load + Math.max(...dur) + 250;
        let t = -1;
        let running = false;
        let started = false;
        let inView = false;
        let raf = 0;
        let last = 0;
        let lineKey = '';
        let irisOpen = -1;

        /* --- beams: rails (always), glow + core (drawn), photons --- */
        const gRails = mk('g', {});
        const gBeams = mk('g', {});
        svg.append(gRails, gBeams);
        const makeBeam = (color) => {
            const rail = mk('path', { class: 'rail' });
            const glow = mk('path', { class: 'beam-glow', stroke: color });
            const core = mk('path', { class: 'beam-core', stroke: color });
            const photon = mk('circle', { class: 'photon', r: 3.4, fill: color });
            gRails.appendChild(rail);
            gBeams.append(glow, core, photon);
            return { rail, glow, core, photon, len: 0, lenA: 0, drawn: -1 };
        };
        const beamColor = (i) => `var(--beam-${i + 1})`;
        const main = makeBeam('var(--ris-cyan)');
        const branches = cards.map((_, i) => makeBeam(beamColor(i)));

        function setPath(b, d) {
            b.rail.setAttribute('d', d);
            b.glow.setAttribute('d', d);
            b.core.setAttribute('d', d);
            b.len = b.core.getTotalLength();
            b.glow.style.strokeDasharray = b.core.style.strokeDasharray = `${b.len} ${b.len + 2}`;
            b.drawn = -1;
        }

        function layout() {
            const sr = stage.getBoundingClientRect();
            if (!sr.width) return;
            svg.setAttribute('viewBox', `0 0 ${sr.width.toFixed(1)} ${sr.height.toFixed(1)}`);
            const rel = (el) => {
                const r = el.getBoundingClientRect();
                return { l: r.left - sr.left, t: r.top - sr.top, r: r.right - sr.left, b: r.bottom - sr.top, cx: r.left + r.width / 2 - sr.left, cy: r.top + r.height / 2 - sr.top };
            };
            const ph = rel(smp);
            const nr = rel(nodeResize.querySelector('.node-dot'));
            const nl = rel(nodeLink.querySelector('.node-dot'));
            const cr = cards.map(rel);
            const across = cr[0].l > nl.r; // cards to the right: horizontal bench

            const f = (n) => n.toFixed(1);
            if (across) {
                setPath(main, `M${f(ph.r)} ${f(ph.cy)} L${f(nr.cx)} ${f(nr.cy)} L${f(nl.cx)} ${f(nl.cy)}`);
                main.lenA = Math.hypot(nr.cx - ph.r, nr.cy - ph.cy);
                cr.forEach((c, i) => {
                    cards[i].removeAttribute('data-port');
                    const x0 = nl.cx, y0 = nl.cy, x1 = c.l, y1 = c.cy;
                    const mx = x0 + (x1 - x0) * 0.55;
                    setPath(branches[i], `M${f(x0)} ${f(y0)} C${f(mx)} ${f(y0)} ${f(mx)} ${f(y1)} ${f(x1)} ${f(y1)}`);
                });
            } else {
                setPath(main, `M${f(ph.cx)} ${f(ph.b)} L${f(nr.cx)} ${f(nr.cy)} L${f(nl.cx)} ${f(nl.cy)}`);
                main.lenA = Math.hypot(nr.cx - ph.cx, nr.cy - ph.b);
                const firstRowBottom = Math.min(...cr.map((c) => c.b));
                const gutter = (cr[0].r + (cr[1] ? cr[1].l : cr[0].r)) / 2;
                const yA = Math.min(...cr.map((c) => c.t)) - 16;
                cr.forEach((c, i) => {
                    const x0 = nl.cx, y0 = nl.cy;
                    if (c.t < firstRowBottom) {
                        // first row: land on the top edge
                        cards[i].setAttribute('data-port', 'top');
                        const x1 = c.cx, y1 = c.t;
                        const k = (y1 - y0) * 0.62;
                        setPath(branches[i], `M${f(x0)} ${f(y0)} C${f(x0)} ${f(y0 + k)} ${f(x1)} ${f(y1 - k * 0.7)} ${f(x1)} ${f(y1)}`);
                    } else {
                        // second row: run down the gutter, turn into the inner edge
                        const left = c.cx < gutter;
                        cards[i].setAttribute('data-port', left ? 'right' : 'left');
                        const lane = gutter + (left ? -5 : 5);
                        const x1 = left ? c.r : c.l, y1 = c.cy;
                        const r = Math.abs(lane - x1);
                        setPath(branches[i], `M${f(x0)} ${f(y0)} L${f(x0)} ${f(yA)} C${f(x0)} ${f(yA + 14)} ${f(lane)} ${f(yA + 14)} ${f(lane)} ${f(yA + 28)} L${f(lane)} ${f(y1 - r)} Q${f(lane)} ${f(y1)} ${f(x1)} ${f(y1)}`);
                    }
                });
            }
        }

        function setDraw(b, drawn) {
            if (Math.abs(drawn - b.drawn) < 0.25) return;
            b.drawn = drawn;
            const off = b.len - drawn;
            const vis = drawn > 0.5 ? 'visible' : 'hidden';
            b.core.style.strokeDashoffset = b.glow.style.strokeDashoffset = off;
            b.core.style.visibility = b.glow.style.visibility = vis;
        }

        function setPhoton(b, at, on) {
            if (!on) {
                b.photon.style.opacity = 0;
                return;
            }
            const p = b.core.getPointAtLength(Math.max(0, Math.min(b.len, at)));
            b.photon.setAttribute('cx', p.x.toFixed(1));
            b.photon.setAttribute('cy', p.y.toFixed(1));
            b.photon.style.opacity = 1;
        }

        // web pages load fast, then crawl, then finish
        const loadCurve = (x) => (x >= 1 ? 1 : Math.min(0.99, 1 - Math.pow(1 - x, 2.3)));

        function say(key) {
            if (key === lineKey) return;
            lineKey = key;
            const v = LINES[key];
            readout.textContent = typeof v === 'function' ? v(label) : v;
        }

        function render() {
            const lock = t < 0 ? 1 : ease(seg(t, 0, T.lock));
            photo.style.setProperty('--lock', lock.toFixed(3));
            smp.style.filter = t >= 0 && t < T.lock ? `blur(${((1 - lock) * 7).toFixed(2)}px)` : '';

            const pA = ease(seg(t, T.aStart, T.aEnd));
            const pB = ease(seg(t, T.bStart, T.bEnd));
            const drawn = pA * main.lenA + pB * (main.len - main.lenA);
            setDraw(main, drawn);
            setPhoton(main, drawn, t >= 0 && drawn > 1 && drawn < main.len - 1);

            const open = 0.2 + 0.48 * ease(seg(t, T.irisStart, T.irisEnd));
            if (Math.abs(open - irisOpen) > 0.002) {
                irisOpen = open;
                drawIris(nodeIris, open);
            }
            nodeResize.classList.toggle('is-lit', t >= T.irisStart);
            nodeLink.classList.toggle('is-lit', t >= T.bEnd);

            const pF = ease(seg(t, T.fanStart, T.fanEnd));
            let ready = 0;
            branches.forEach((b, i) => {
                const fanDrawn = pF * b.len;
                setDraw(b, fanDrawn);
                const card = cards[i];
                const x = seg(t, T.load, T.load + dur[i]);
                const p = t < T.load ? 0 : loadCurve(x);
                const state = t < T.load ? 'waiting' : p < 1 ? 'loading' : 'ready';
                if (state === 'ready') ready++;
                card.style.setProperty('--p', p.toFixed(3));
                card.classList.toggle('is-loading', state === 'loading');
                card.classList.toggle('is-ready', state === 'ready');
                const text = state === 'waiting' ? 'Waiting' : state === 'loading' ? `Loading ${Math.floor(p * 100)}%` : 'Ready';
                if (statuses[i].textContent !== text) statuses[i].textContent = text;
                // photons: the beam head while drawing, then packets while loading
                if (pF > 0 && pF < 1) setPhoton(b, fanDrawn, true);
                else if (state === 'loading') setPhoton(b, (((t - T.fanEnd) / 760 + i * 0.27) % 1) * b.len, true);
                else setPhoton(b, 0, false);
            });

            if (t >= 0) {
                if (reduced) say('summary');
                else if (ready === cards.length) say('done');
                else if (t >= T.fanStart) say('fan');
                else if (t >= T.bStart) say('upload');
                else say('resize');
            }
            cue.classList.toggle('is-shown', t >= 0 && ready === cards.length);
        }

        /* --- clock: runs only while on screen and the tab is visible --- */
        function frame(now) {
            raf = 0;
            if (!running) return;
            const dt = Math.min(64, now - last);
            last = now;
            t += dt;
            if (t >= end) {
                t = end;
                running = false;
            }
            render();
            if (running) raf = requestAnimationFrame(frame);
        }

        function resume() {
            if (raf || !running || !inView || document.hidden) return;
            last = performance.now();
            raf = requestAnimationFrame(frame);
        }

        function pause() {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        }

        function start() {
            started = true;
            dur = DURATIONS[sample];
            end = T.load + Math.max(...dur) + 250;
            lineKey = '';
            if (reduced) {
                t = end;
                running = false;
                pause();
                render();
                return;
            }
            t = 0;
            running = true;
            render();
            pause();
            resume();
        }

        function setSample(radio) {
            sample = radio.value;
            label = radio.dataset.label;
            uses.forEach((u) => u.setAttribute('href', `#smp-${sample}`));
            smp.setAttribute('aria-label', `Sample picture: ${label}`);
            start();
        }

        radios.forEach((r) => r.addEventListener('change', () => r.checked && setSample(r)));
        replay.addEventListener('click', start);

        reduceMQ.addEventListener?.('change', (e) => {
            reduced = e.matches;
            if (reduced && running) {
                running = false;
                pause();
                t = end;
                render();
            }
        });

        document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));

        // start once a fifth of the stage is showing; pause when it's gone
        new IntersectionObserver((entries) => {
            const e = entries[entries.length - 1];
            inView = e.isIntersecting;
            if (!inView) pause();
            else if (!started && e.intersectionRatio >= 0.2) start();
            else resume();
        }, { threshold: [0, 0.2] }).observe(stage);

        let raf2 = 0;
        new ResizeObserver(() => {
            if (raf2) return;
            raf2 = requestAnimationFrame(() => {
                raf2 = 0;
                layout();
                render();
            });
        }).observe(stage);

        layout();
        if (reduced) {
            t = end;
            started = true;
        }
        render();

        /* --- loupe: follows a mouse or pen, or a finger while pressed --- */
        const Z = 2.4;
        let touchId = null;
        const place = (e) => {
            const r = smp.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            if (x < 0 || y < 0 || x > r.width || y > r.height) {
                loupe.classList.remove('is-on');
                return;
            }
            const half = loupe.offsetWidth / 2;
            loupe.style.left = `${x}px`;
            loupe.style.top = `${y}px`;
            loupeSvg.style.width = `${r.width * Z}px`;
            loupeSvg.style.height = `${r.height * Z}px`;
            loupeSvg.style.transform = `translate(${(half - x * Z).toFixed(1)}px, ${(half - y * Z).toFixed(1)}px)`;
            loupe.classList.add('is-on');
        };
        const hide = () => {
            loupe.classList.remove('is-on');
            touchId = null;
        };
        photo.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') {
                touchId = e.pointerId;
                place(e);
            }
        });
        photo.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'touch' && e.pointerId !== touchId) return;
            place(e);
        });
        photo.addEventListener('pointerup', (e) => e.pointerType === 'touch' && hide());
        photo.addEventListener('pointercancel', hide);
        photo.addEventListener('pointerleave', hide);
    }

    /* ---------- 3. Results tabs ------------------------------------ */

    const tablist = document.querySelector('.results-tabs');
    if (tablist) {
        const tabs = [...tablist.querySelectorAll('[role="tab"]')];
        const panel = document.getElementById('results-panel');
        const imgs = [...panel.querySelectorAll('.app-device-screen > img')];
        const caption = panel.querySelector('[data-caption]');
        const CAPTIONS = [
            'Google Lens names the lamp and where it’s sold.',
            'TinEye found 0 matches for this photo. It happens, and it’s why there are three more.',
            'Yandex suggests what it might be and lines up similar images.',
            'Bing Visual Search names the lamp and lists visual matches.',
        ];
        tablist.hidden = false;

        const select = (i, focus) => {
            tabs.forEach((tab, j) => {
                const on = i === j;
                tab.setAttribute('aria-selected', String(on));
                tab.tabIndex = on ? 0 : -1;
            });
            imgs.forEach((img, j) => {
                img.classList.toggle('is-active', i === j);
                if (i === j) img.removeAttribute('aria-hidden');
                else img.setAttribute('aria-hidden', 'true');
            });
            panel.setAttribute('aria-labelledby', tabs[i].id);
            caption.textContent = CAPTIONS[i];
            if (focus) tabs[i].focus();
        };

        tabs.forEach((tab, i) => {
            tab.addEventListener('click', () => select(i, false));
            tab.addEventListener('keydown', (e) => {
                const n = tabs.length;
                const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
                if (next === undefined) return;
                e.preventDefault();
                select(next, true);
            });
        });
    }
})();
