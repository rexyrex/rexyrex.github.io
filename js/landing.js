/* Landing page scroll story.
   Needs GSAP 3.15 + ScrollTrigger (SplitText is optional) loaded before
   this file. Shares `window.rexHero` with /js/hero-particles.js, which
   draws the particle rex and reads the scroll progress written here.
   If GSAP is missing or the visitor prefers reduced motion, the page
   falls back to a static layout (html.motion-off, see landing.css). */
(function () {
    'use strict';

    var root = document.documentElement;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
    var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
    var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

    /* ---------- Builders (no GSAP needed) ------------------------- */

    // Deterministic pseudo-random so the mockups look the same every load.
    function prng(seed) {
        var s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    // A QR-looking matrix: three finder patterns + noise.
    function buildQr() {
        var grid = document.getElementById('qrGrid');
        if (!grid) return;
        var n = 21;
        var rnd = prng(7);
        var frag = document.createDocumentFragment();

        function finder(x, y, i, j) {
            var dx = i - x;
            var dy = j - y;
            if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
            var ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
            return ring === 3 || ring <= 1;
        }

        for (var j = 0; j < n; j++) {
            for (var i = 0; i < n; i++) {
                var on = finder(0, 0, i, j);
                if (on === null) on = finder(n - 7, 0, i, j);
                if (on === null) on = finder(0, n - 7, i, j);
                if (on === null) on = rnd() < 0.44;
                var cell = document.createElement('i');
                if (on) cell.className = 'on';
                frag.appendChild(cell);
            }
        }
        grid.appendChild(frag);
    }

    // Waveform bars with a musical-looking envelope.
    function buildWave() {
        var wrap = document.getElementById('waveBars');
        if (!wrap) return;
        var n = 56;
        var rnd = prng(3);
        var frag = document.createDocumentFragment();
        for (var i = 0; i < n; i++) {
            var env = 0.3 + 0.7 * Math.abs(Math.sin((i / n) * Math.PI * 2.3 + 0.5));
            var h = Math.min(1, Math.max(0.08, env * (0.5 + rnd() * 0.65)));
            var bar = document.createElement('i');
            bar.style.setProperty('--h', h.toFixed(3));
            bar.style.setProperty('--d', (rnd() * -1.6).toFixed(2) + 's');
            bar.appendChild(document.createElement('b'));
            frag.appendChild(bar);
        }
        wrap.appendChild(frag);
    }

    // The sky: thirty balloons at random depths. Nearer ones are bigger,
    // move faster and sit on top; far ones are small, dim and soft.
    var SHARD = { blue: '#2456c4', red: '#c11c1c', green: '#22a52d' };

    function buildSky() {
        var sky = document.getElementById('sky');
        if (!sky) return [];
        var rnd = prng(11);
        var colors = ['blue', 'red', 'green'];
        var anchor = sky.querySelector('.sky-rex');
        var list = [];
        for (var i = 0; i < 30; i++) {
            var depth = 0.3 + rnd() * 1.05;
            var color = colors[Math.floor(rnd() * 3)];
            var el = document.createElement('div');
            el.className = 'bl' + (depth < 0.55 ? ' bl-far' : '');
            el.setAttribute('data-depth', depth.toFixed(2));
            el.setAttribute('data-y0', String(Math.round(60 + rnd() * 80)));
            el.style.cssText =
                '--x:' + Math.round(rnd() * 104 - 6) + '%;' +
                '--y:' + el.getAttribute('data-y0') + '%;' +
                '--w:' + Math.round(64 + depth * 200) + 'px;' +
                '--sd:' + (-(rnd() * 6)).toFixed(1) + 's;' +
                '--b:' + Math.round(rnd() * 60) + '%;' +
                '--shard:' + SHARD[color] + ';' +
                'z-index:' + Math.round(depth * 10);
            el.innerHTML = '<span class="bl-sway"><img src="/assets/img/balloon-' + color + '.png" alt="" width="256" height="256" loading="lazy" decoding="async"></span>';
            sky.insertBefore(el, anchor);
            list.push(el);
        }
        return list;
    }

    buildQr();
    buildWave();
    var balloons = buildSky();

    /* ---------- Typing demo (time-based, needs no GSAP) ------------ */

    var typing = (function () {
        var el = document.getElementById('typingEditor');
        var typed = document.getElementById('typingTyped');
        var rest = document.getElementById('typingRest');
        if (!el || !typed || !rest) return null;

        var colEl = document.getElementById('typingCol');
        var scoreEl = document.getElementById('typingScore');
        var modeEl = document.getElementById('typingMode');
        var tabs = $$('.editor-tab', el);
        var rnd = prng(5);

        var sets = [
            { label: '한타', peak: 540, lines: ['가는 말이 고와야 오는 말이 곱다.', '천 리 길도 한 걸음부터.', '오늘 할 일을 내일로 미루지 말자.'] },
            { label: '영타', peak: 96, lines: ['The quick brown fox jumps over the lazy dog.', 'Practice a little every day.', 'Type fast, but type right.'] },
            { label: '개발자', peak: 72, lines: ['for (int i = 0; i < n; i++) sum += i;', 'if (user == null) return;', 'return list.stream().count();'] }
        ];
        var set = 0;
        var line = 0;
        var pos = 0;
        var phase = 'type';
        var timer = null;
        var running = false;
        var visible = false;

        function current() { return sets[set].lines[line]; }

        function render() {
            var text = current();
            typed.textContent = text.slice(0, pos);
            rest.textContent = text.slice(pos);
            if (colEl) colEl.textContent = String(pos + 1);
            if (scoreEl) scoreEl.textContent = String(Math.round(sets[set].peak * pos / text.length));
        }

        function switchSet(n) {
            set = n;
            line = 0;
            tabs.forEach(function (tab, i) { tab.classList.toggle('is-active', i === n); });
            if (modeEl) modeEl.textContent = sets[n].label;
        }

        // Human-ish rhythm: slower after punctuation, a beat after spaces,
        // a little more for a Hangul syllable (several keystrokes each).
        function delayFor(ch) {
            var d = 55 + rnd() * 70;
            if (/[.,;!?]/.test(ch)) d += 240;
            else if (ch === ' ') d += 70;
            else if (ch >= '가' && ch <= '힣') d += 45;
            return d;
        }

        function step() {
            if (!running) return;
            var text = current();
            if (phase === 'type') {
                pos++;
                render();
                if (pos >= text.length) {
                    phase = 'hold';
                    timer = setTimeout(step, 1500);
                } else {
                    timer = setTimeout(step, delayFor(text[pos - 1]));
                }
            } else if (phase === 'hold') {
                phase = 'erase';
                timer = setTimeout(step, 30);
            } else {
                pos = Math.max(0, pos - 2);
                render();
                if (pos === 0) {
                    line = (line + 1) % sets[set].lines.length;
                    if (line === 0) switchSet((set + 1) % sets.length);
                    phase = 'type';
                    render();
                    timer = setTimeout(step, 600);
                } else {
                    timer = setTimeout(step, 24);
                }
            }
        }

        function update() {
            var should = visible && !document.hidden;
            if (should && !running) {
                running = true;
                timer = setTimeout(step, 400);
            } else if (!should && running) {
                running = false;
                clearTimeout(timer);
            }
        }

        render();
        return {
            el: el,
            setVisible: function (v) { visible = v; update(); },
            update: update,
            showStatic: function () { pos = current().length; render(); }
        };
    })();

    /* ---------- Shared state with the particle module ------------ */

    var hero = window.rexHero = { t: 0, burst: 0, excite: 0, ready: false, failed: false };

    var fallback = document.getElementById('heroRexFallback');
    function showFallback() { if (fallback) fallback.classList.add('is-visible'); }
    function hideFallback() { if (fallback) fallback.classList.remove('is-visible'); }
    document.addEventListener('rexhero:failed', showFallback);
    document.addEventListener('rexhero:ready', hideFallback);

    // If the module never reports in (blocked CDN, no WebGL), show the PNG.
    // A background tab gets no animation frames, so wait until it is visible.
    function checkFallback() {
        if (hero.ready || hero.failed) return;
        if (document.hidden) {
            document.addEventListener('visibilitychange', function onVisible() {
                if (document.hidden) return;
                document.removeEventListener('visibilitychange', onVisible);
                setTimeout(checkFallback, 1500);
            });
            return;
        }
        showFallback();
    }
    setTimeout(checkFallback, 6000);

    // Holding the rex (the easter egg from index.js) makes the particles buzz.
    var logo = document.getElementById('rexLogo');
    if (logo) {
        logo.addEventListener('pointerdown', function () { hero.excite = 1; });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
            logo.addEventListener(type, function () { hero.excite = 0; });
        });
        document.addEventListener('pointerup', function () { hero.excite = 0; });
    }

    /* ---------- Things that run without GSAP ----------------------- */

    var hasIO = 'IntersectionObserver' in window;

    // The editor types while it is on screen.
    if (typing) {
        if (reduce || !hasIO) {
            typing.showStatic();
        } else {
            new IntersectionObserver(function (entries) {
                entries.forEach(function (e) { typing.setVisible(e.isIntersecting); });
            }, { threshold: 0.25 }).observe(typing.el);
            document.addEventListener('visibilitychange', typing.update);
        }
    }

    // Mockups come alive (bars fill, rings draw, the rex gallops, the
    // route draws) once on screen: the phones, the Mac desktops, the car.
    (function () {
        var phones = $$('.phone, .mac, .car');
        if (!phones.length) return;
        if (reduce || !hasIO) {
            phones.forEach(function (p) { p.classList.add('is-live'); });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('is-live');
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.3 });
        phones.forEach(function (p) { io.observe(p); });
    })();

    // The car screen: the speed counts up once it is on screen. With
    // reduced motion the number is just set, and the dot on the map stays
    // put (animateMotion is SMIL, so CSS cannot switch it off).
    (function () {
        var car = document.getElementById('carScreen');
        var speed = document.getElementById('carSpeed');
        if (!car || !speed) return;
        var target = parseInt(speed.getAttribute('data-to'), 10) || 0;
        if (reduce) {
            speed.textContent = String(target);
            $$('animateMotion', car).forEach(function (a) { a.parentNode.removeChild(a); });
            return;
        }
        var started = false;
        function run() {
            if (started) return;
            started = true;
            var t0 = null;
            function step(now) {
                if (t0 === null) t0 = now;
                var p = Math.min(1, (now - t0) / 1500);
                var e = 1 - Math.pow(1 - p, 3);
                speed.textContent = String(Math.round(target * e));
                if (p < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }
        if (!hasIO) { run(); return; }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    run();
                    io.unobserve(car);
                }
            });
        }, { threshold: 0.3 });
        io.observe(car);
    })();

    // games.rexy.win pill: "games · up" once the portal answers a ping
    // (common.js does the opaque request; see rexChrome.pingGames).
    (function () {
        var pill = document.getElementById('gamesNet');
        var label = document.getElementById('gamesNetLabel');
        if (!pill || !window.rexChrome || !window.rexChrome.pingGames) return;
        window.rexChrome.pingGames().then(function (up) {
            if (up === null) return;
            pill.setAttribute('data-state', up ? 'up' : 'down');
            if (label) label.textContent = up ? 'games · up' : 'games · offline';
        });
    })();

    /* ---------- Motion gate ---------------------------------------- */

    if (!window.gsap || !window.ScrollTrigger || reduce) {
        root.classList.add('motion-off');
        return;
    }

    var gsap = window.gsap;
    var ScrollTrigger = window.ScrollTrigger;
    var SplitText = window.SplitText || null;

    gsap.registerPlugin(ScrollTrigger);
    if (SplitText) gsap.registerPlugin(SplitText);
    ScrollTrigger.config({ ignoreMobileResize: true });
    root.classList.add('motion-on');

    var mm = gsap.matchMedia();
    var vh = function () { return window.innerHeight; };

    function splitInto(el, vars) {
        if (!SplitText || !el) return null;
        try {
            return typeof SplitText.create === 'function' ? SplitText.create(el, vars) : new SplitText(el, vars);
        } catch (e) {
            return null;
        }
    }

    /* ---------- Balloon pops --------------------------------------- */

    function decoratePop(el) {
        if (el.querySelector('.pop-ring')) return;
        var frag = document.createDocumentFragment();
        var ring = document.createElement('i');
        ring.className = 'pop-ring';
        frag.appendChild(ring);
        for (var i = 0; i < 10; i++) {
            var s = document.createElement('i');
            s.className = 'shard';
            frag.appendChild(s);
        }
        var score = document.createElement('b');
        score.className = 'pop-score';
        score.textContent = '+100';
        frag.appendChild(score);
        el.appendChild(frag);
    }

    // Adds one pop to a timeline at time t: the balloon swells and vanishes,
    // a ring flashes, shards fly out and fall, "+100" floats up.
    function addPop(el, tl, t) {
        var img = el.querySelector('img');
        var ring = el.querySelector('.pop-ring');
        var shards = $$('.shard', el);
        var score = el.querySelector('.pop-score');
        var n = shards.length || 1;
        tl.to(img, { scale: 1.22, duration: 0.03, ease: 'power2.in' }, t)
          .set(img, { opacity: 0 }, t + 0.03)
          .fromTo(ring, { opacity: 1, scale: 0.35 }, { opacity: 0, scale: 2.4, duration: 0.08, ease: 'power2.out' }, t + 0.03)
          .fromTo(shards,
              { opacity: 1, x: 0, y: 0, scale: 0.5, rotation: 0 },
              {
                  x: function (i) { return Math.cos((i / n) * Math.PI * 2 + 0.4) * 150; },
                  y: function (i) { return Math.sin((i / n) * Math.PI * 2 + 0.4) * 120 - 40; },
                  rotation: function (i) { return 60 + i * 47; },
                  scale: 1.1,
                  duration: 0.05,
                  ease: 'power2.out'
              },
              t + 0.03)
          .to(shards, { y: '+=180', opacity: 0, duration: 0.1, ease: 'power1.in' }, t + 0.08)
          .fromTo(score, { opacity: 1, y: 0, scale: 0.6 }, { y: -90, scale: 1.1, opacity: 0, duration: 0.14, ease: 'power2.out' }, t + 0.03);
    }

    /* ---------- One-time preparation -------------------------------- */

    // Statement words are split once; the scrub tween is rebuilt per breakpoint.
    var statementText = document.getElementById('statementText');
    var statementSplit = statementText ? splitInto(statementText, { type: 'words', wordsClass: 'st-word' }) : null;
    var statementWords = (statementSplit && statementSplit.words && statementSplit.words.length)
        ? statementSplit.words
        : (statementText ? [statementText] : []);

    /* ---------- Hero intro (plays once on load) --------------------- */

    function heroIntro() {
        var eyebrow = $('.hero-eyebrow');
        var title = $('.hero-title');
        var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        // The path types itself, like a prompt.
        var eb = eyebrow ? splitInto(eyebrow, { type: 'chars', charsClass: 'char' }) : null;
        if (eyebrow) tl.set(eyebrow, { opacity: 1 }, 0.1);
        if (eb && eb.chars && eb.chars.length) {
            tl.fromTo(eb.chars, { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.045, ease: 'none' }, 0.15);
        } else if (eyebrow) {
            tl.fromTo(eyebrow, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7 }, 0.15);
        }

        var split = title ? splitInto(title, { type: 'words,chars', wordsClass: 'word', charsClass: 'char' }) : null;
        if (split && split.chars && split.chars.length) {
            gsap.set(title, { opacity: 1 });
            tl.fromTo(split.chars,
                { opacity: 0, yPercent: 70, rotateX: -55, transformPerspective: 700 },
                { opacity: 1, yPercent: 0, rotateX: 0, duration: 1, stagger: { each: 0.016 }, ease: 'power4.out',
                  onComplete: function () { split.revert(); } },
                0.55);
        } else if (title) {
            tl.fromTo(title, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9 }, 0.55);
        }

        tl.fromTo('.hero-lede', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.9 }, 1.05)
          .fromTo('.hero-actions', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8 }, 1.2)
          .fromTo('.hero-cue', { opacity: 0 }, { opacity: 1, duration: 0.8 }, 1.7);
    }

    /* ---------- Scroll story ---------------------------------------- */
    /* ScrollTrigger measures pinned sections in creation order, so every
       trigger is created here, top to bottom, and the whole set is rebuilt
       together when the breakpoint changes. */

    mm.add({ desktop: '(min-width: 861px)', mobile: '(max-width: 860px)', tall: '(min-height: 701px)' }, function (ctx) {
        var desktop = ctx.conditions.desktop;
        var tall = ctx.conditions.tall;
        var splits = [];

        // 00 · Hero: the copy drifts up and fades while the particle rex stays put.
        gsap.to('.hero-copy', {
            opacity: 0,
            yPercent: -14,
            scale: 0.96,
            ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: '38% top', scrub: true }
        });

        gsap.to('#aurora', {
            opacity: 0,
            ease: 'none',
            scrollTrigger: { trigger: '.hero', start: '40% top', end: 'bottom top', scrub: true }
        });

        // Progress for the particles: page top → statement centred (assemble, turn, collapse).
        ScrollTrigger.create({
            trigger: '.hero',
            start: 'top top',
            endTrigger: '#statementText',
            end: 'center center',
            onUpdate: function (self) { hero.t = self.progress; },
            onRefresh: function (self) { hero.t = self.progress; }
        });

        // 01 · Statement: words light up one by one as it rises…
        if (statementWords.length) {
            gsap.fromTo(statementWords, { opacity: 0.13, y: 10 }, {
                opacity: 1,
                y: 0,
                ease: 'none',
                stagger: statementSplit ? 0.1 : 0,
                scrollTrigger: { trigger: statementText, start: 'top 82%', end: 'center 50%', scrub: 0.35 }
            });
        }

        // …then the section holds while the rex bursts (hero.burst 0→1 over the pin).
        var burst = gsap.timeline({
            scrollTrigger: {
                trigger: '#statement',
                start: 'center center',
                end: '+=130%',
                pin: true,
                scrub: 0.5,
                anticipatePin: 1,
                onUpdate: function (self) { hero.burst = self.progress; },
                onRefresh: function (self) { hero.burst = self.progress; }
            }
        });
        burst.fromTo('#heroFlash', { opacity: 0, scale: 0.25 }, { opacity: 1, scale: 1.1, duration: 0.07, ease: 'power2.out' }, 0.1)
             .to('#heroFlash', { opacity: 0, scale: 3.2, duration: 0.33, ease: 'power2.out' }, 0.17)
             .to('#statementText', { scale: 1.04, duration: 0.5, ease: 'none' }, 0.5);

        // 03 · /deadlyBalloons/: pinned sky. Balloons rise with parallax, a dozen
        // pop on their own along the way, and the rest pop when clicked.
        var stage = document.getElementById('balloonStage');
        if (stage && balloons.length) {
            var scoreEl = document.getElementById('skyScore');
            var poppedEl = document.getElementById('skyPopped');
            var green = $('.sky-rex-green', stage);
            var red = $('.sky-rex-red', stage);
            var clicks = 0;
            var popTimes = [];

            function updateHud(p) {
                var n = 0;
                for (var i = 0; i < popTimes.length; i++) if (popTimes[i] <= p) n++;
                var total = n + clicks;
                if (scoreEl) scoreEl.textContent = String(total * 100);
                if (poppedEl) poppedEl.textContent = String(total);
            }

            var sky = gsap.timeline({
                scrollTrigger: {
                    trigger: stage,
                    start: 'top top',
                    end: '+=190%',
                    pin: true,
                    scrub: 0.6,
                    anticipatePin: 1,
                    invalidateOnRefresh: true,
                    onUpdate: function (self) { updateHud(self.progress); },
                    onRefresh: function (self) { updateHud(self.progress); }
                }
            });

            balloons.forEach(function (el) {
                var depth = parseFloat(el.getAttribute('data-depth')) || 0.5;
                sky.fromTo(el,
                    { y: function () { return depth * vh() * 0.15; } },
                    { y: function () { return -depth * vh() * 1.7; }, ease: 'none', duration: 1 },
                    0);
            });

            // Scripted pops: nearer balloons, each while it is well inside the viewport.
            var rnd = prng(23);
            balloons.filter(function (b) { return parseFloat(b.getAttribute('data-depth')) > 0.62; })
                .slice(0, 12)
                .forEach(function (el) {
                    var d = parseFloat(el.getAttribute('data-depth'));
                    var y0 = parseFloat(el.getAttribute('data-y0')) / 100;
                    var p1 = (y0 + 0.15 * d - 0.75) / (1.85 * d);
                    var p2 = (y0 + 0.15 * d - 0.15) / (1.85 * d);
                    var time = clamp(p1 + (p2 - p1) * (0.3 + rnd() * 0.5), 0.06, 0.94);
                    el.setAttribute('data-scripted', '1');
                    decoratePop(el);
                    addPop(el, sky, time);
                    popTimes.push(time);
                });

            if (green) sky.fromTo(green, { yPercent: 125 }, { yPercent: 0, duration: 0.14, ease: 'power2.out' }, 0.12);
            if (red) sky.fromTo(red, { yPercent: 125, scaleX: -1 }, { yPercent: 0, scaleX: -1, duration: 0.14, ease: 'power2.out' }, 0.42);

            if (!stage.hasAttribute('data-pops')) {
                stage.setAttribute('data-pops', '1');
                stage.addEventListener('pointerdown', function (e) {
                    var img = e.target && e.target.closest ? e.target.closest('.bl img') : null;
                    if (!img) return;
                    var bl = img.closest('.bl');
                    if (!bl || bl.hasAttribute('data-scripted') || bl.hasAttribute('data-popped')) return;
                    e.preventDefault();
                    bl.setAttribute('data-popped', '1');
                    decoratePop(bl);
                    var tl = gsap.timeline();
                    addPop(bl, tl, 0);
                    tl.timeScale(0.32);
                    clicks++;
                    updateHud(sky.scrollTrigger ? sky.scrollTrigger.progress : 0);
                });
            }
        }

        // 04 · /apps/: horizontal track pinned on desktop; native snap scrolling
        // on mobile and in short windows (landing.css switches the layout too).
        var track = document.getElementById('appsTrack');
        var appsStage = document.getElementById('appsStage');
        var phones = track ? $$('.phone', track) : [];
        if (desktop && tall && track && appsStage) {
            var dist = function () { return Math.max(0, track.offsetWidth - window.innerWidth); };

            var tilt = function () {
                var cx = window.innerWidth / 2;
                phones.forEach(function (ph) {
                    var r = ph.getBoundingClientRect();
                    var rel = (r.left + r.width / 2 - cx) / window.innerWidth;
                    ph.style.transform = 'perspective(1000px) rotateY(' + (rel * -12).toFixed(2) + 'deg) translateZ(' + (-Math.abs(rel) * 70).toFixed(1) + 'px)';
                });
            };

            gsap.to(track, {
                x: function () { return -dist(); },
                ease: 'none',
                scrollTrigger: {
                    trigger: appsStage,
                    start: 'top top',
                    end: function () { return '+=' + (dist() + vh() * 0.4); },
                    pin: true,
                    scrub: 0.7,
                    anticipatePin: 1,
                    invalidateOnRefresh: true,
                    onUpdate: tilt,
                    onRefresh: tilt
                }
            });
            tilt();
        }

        // Phones tilt toward the pointer and catch a glare (fine pointers only).
        if (desktop && !coarse) {
            phones.forEach(function (ph) {
                if (ph.hasAttribute('data-tilt')) return;
                var frame = $('.phone-frame', ph);
                if (!frame) return;
                ph.setAttribute('data-tilt', '1');
                gsap.set(frame, { transformPerspective: 900 });
                var toY = gsap.quickTo(frame, 'rotationY', { duration: 0.5, ease: 'power2.out' });
                var toX = gsap.quickTo(frame, 'rotationX', { duration: 0.5, ease: 'power2.out' });
                ph.addEventListener('pointermove', function (e) {
                    var r = frame.getBoundingClientRect();
                    var px = (e.clientX - r.left) / r.width - 0.5;
                    var py = (e.clientY - r.top) / r.height - 0.5;
                    toY(px * 18);
                    toX(-py * 14);
                    frame.style.setProperty('--gx', (px * 100 + 50).toFixed(1) + '%');
                    frame.style.setProperty('--gy', (py * 100 + 50).toFixed(1) + '%');
                });
                ph.addEventListener('pointerleave', function () {
                    toY(0);
                    toX(0);
                });
            });
        }

        // 05 · /music/: the waveform grows in, and rises under the pointer.
        var wave = document.getElementById('wave');
        var barsWrap = document.getElementById('waveBars');
        var bars = $$('#waveBars i');
        if (wave && bars.length) {
            gsap.fromTo(bars, { scaleY: 0.04 }, {
                scaleY: 1,
                ease: 'power2.out',
                stagger: { each: 0.02, from: 'random' },
                scrollTrigger: { trigger: wave, start: 'top 85%', end: 'top 30%', scrub: 0.5 }
            });

            if (barsWrap && !coarse && !barsWrap.hasAttribute('data-boost')) {
                barsWrap.setAttribute('data-boost', '1');
                var n = bars.length;
                barsWrap.addEventListener('pointermove', function (e) {
                    var r = barsWrap.getBoundingClientRect();
                    var x = (e.clientX - r.left) / r.width;
                    bars.forEach(function (bar, i) {
                        var d = Math.abs((i + 0.5) / n - x);
                        var boost = 1 + Math.max(0, 1 - d * 9) * 1.1;
                        bar.style.setProperty('--boost', boost.toFixed(2));
                    });
                });
                barsWrap.addEventListener('pointerleave', function () {
                    bars.forEach(function (bar) { bar.style.removeProperty('--boost'); });
                });
            }
        }

        // Reveals, created last so they measure against the pinned layout.
        $$('[data-reveal]').forEach(function (el) {
            gsap.fromTo(el, { opacity: 0, y: 26 }, {
                opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
                scrollTrigger: { trigger: el, start: 'top 88%', once: true }
            });
        });

        $$('[data-reveal-group]').forEach(function (group) {
            var items = Array.prototype.slice.call(group.children).filter(function (c) {
                return !c.hasAttribute('data-lines') && !c.hasAttribute('data-chars');
            });
            if (!items.length) return;
            gsap.fromTo(items, { opacity: 0, y: 26 }, {
                opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08,
                scrollTrigger: { trigger: group, start: 'top 86%', once: true }
            });
        });

        // Headlines slide up line by line out of a mask.
        $$('[data-lines]').forEach(function (el) {
            var split = splitInto(el, { type: 'lines', mask: 'lines', linesClass: 'line' });
            if (!split || !split.lines || !split.lines.length) return;
            splits.push(split);
            gsap.fromTo(split.lines, { yPercent: 110 }, {
                yPercent: 0, duration: 1, ease: 'power4.out', stagger: 0.1,
                scrollTrigger: { trigger: el, start: 'top 88%', once: true }
            });
        });

        // The e-mail address rises letter by letter.
        $$('[data-chars]').forEach(function (el) {
            var split = splitInto(el, { type: 'chars', mask: 'chars', charsClass: 'char' });
            if (!split || !split.chars || !split.chars.length) return;
            splits.push(split);
            gsap.fromTo(split.chars, { yPercent: 110 }, {
                yPercent: 0, duration: 0.8, ease: 'power3.out', stagger: 0.025,
                scrollTrigger: { trigger: el, start: 'top 92%', once: true }
            });
        });

        return function () {
            phones.forEach(function (ph) { ph.style.transform = ''; });
            splits.forEach(function (s) { try { s.revert(); } catch (e) { /* already gone */ } });
        };
    });

    /* ---------- Boot ------------------------------------------------ */

    function start() {
        heroIntro();
        ScrollTrigger.refresh();
    }

    if (document.fonts && document.fonts.ready) {
        var started = false;
        var go = function () { if (!started) { started = true; start(); } };
        document.fonts.ready.then(go);
        setTimeout(go, 900);
    } else {
        start();
    }

    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
