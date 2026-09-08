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

    /* ---------- Decorative builders (no GSAP needed) ------------- */

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

    buildQr();
    buildWave();

    /* ---------- Shared state with the particle module ------------ */

    var hero = window.rexHero = { t: 0, excite: 0, ready: false, failed: false };

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
    var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
    var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
    var vh = function () { return window.innerHeight; };
    var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

    function splitInto(el, vars) {
        if (!SplitText || !el) return null;
        try {
            return typeof SplitText.create === 'function' ? SplitText.create(el, vars) : new SplitText(el, vars);
        } catch (e) {
            return null;
        }
    }

    /* ---------- One-time preparation -------------------------------- */

    // Statement words are split once; the scrub tween is rebuilt per breakpoint.
    var statementText = document.getElementById('statementText');
    var statementSplit = statementText ? splitInto(statementText, { type: 'words', wordsClass: 'st-word' }) : null;
    var statementWords = (statementSplit && statementSplit.words && statementSplit.words.length)
        ? statementSplit.words
        : (statementText ? [statementText] : []);

    // The typing editor: scroll progress → how much of the passage is typed.
    var typing = (function () {
        var typed = document.getElementById('typingTyped');
        var rest = document.getElementById('typingRest');
        if (!typed || !rest) return null;

        var lnEl = document.getElementById('typingLn');
        var colEl = document.getElementById('typingCol');
        var scoreEl = document.getElementById('typingScore');
        var modeEl = document.getElementById('typingMode');
        var body = document.getElementById('typingBody');
        var tabs = $$('#typingEditor .editor-tab');

        var passages = [
            { label: '한타', text: '키스의 고유조건은 입술끼리 만나야 하고 특별한 기술은 필요치 않다.', peak: 612 },
            { label: '영타', text: 'The quick brown fox jumps over the lazy dog.', peak: 118 },
            { label: '개발자', text: 'public String getUserEmail(int id) {\n    return userMapper.selectEmail(id);\n}', peak: 84 }
        ];
        var SEG = 1 / passages.length;
        var current = -1;

        function render(p) {
            var seg = clamp(Math.floor(p / SEG), 0, passages.length - 1);
            var s = (p - seg * SEG) / SEG;                 // 0..1 inside this passage
            var u = clamp((s - 0.06) / 0.78, 0, 1);         // settle, type, hold
            var pass = passages[seg];
            var n = Math.round(u * pass.text.length);

            typed.textContent = pass.text.slice(0, n);
            rest.textContent = pass.text.slice(n);

            var lines = pass.text.slice(0, n).split('\n');
            if (lnEl) lnEl.textContent = String(lines.length);
            if (colEl) colEl.textContent = String(lines[lines.length - 1].length + 1);
            if (scoreEl) scoreEl.textContent = String(Math.round(pass.peak * (1 - Math.pow(1 - u, 2))));

            if (seg !== current) {
                current = seg;
                tabs.forEach(function (tab, i) { tab.classList.toggle('is-active', i === seg); });
                if (modeEl) modeEl.textContent = pass.label;
                if (body) gsap.fromTo(body, { opacity: 0.3 }, { opacity: 1, duration: 0.35, ease: 'power2.out', overwrite: true });
            }
        }

        render(0);
        return { render: render };
    })();

    /* ---------- Hero intro (plays once on load) --------------------- */

    function heroIntro() {
        var title = $('.hero-title');
        var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        tl.fromTo('.hero-eyebrow', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7 }, 0.15);

        var split = title ? splitInto(title, { type: 'words,chars', wordsClass: 'word', charsClass: 'char' }) : null;
        if (split && split.chars && split.chars.length) {
            gsap.set(title, { opacity: 1 });
            tl.fromTo(split.chars,
                { opacity: 0, yPercent: 70, rotateX: -55, transformPerspective: 700 },
                { opacity: 1, yPercent: 0, rotateX: 0, duration: 1, stagger: { each: 0.016 }, ease: 'power4.out',
                  onComplete: function () { split.revert(); } },
                0.2);
        } else if (title) {
            tl.fromTo(title, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9 }, 0.2);
        }

        tl.fromTo('.hero-lede', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.9 }, 0.75)
          .fromTo('.hero-actions', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8 }, 0.9)
          .fromTo('.hero-cue', { opacity: 0 }, { opacity: 1, duration: 0.8 }, 1.4);
    }

    /* ---------- Scroll story ---------------------------------------- */
    /* ScrollTrigger measures pinned sections in creation order, so every
       trigger is created here, top to bottom, and the whole set is rebuilt
       together when the breakpoint changes. */

    mm.add({ desktop: '(min-width: 861px)', mobile: '(max-width: 860px)', tall: '(min-height: 701px)' }, function (ctx) {
        var desktop = ctx.conditions.desktop;
        var tall = ctx.conditions.tall;

        // 00 · Hero: the copy drifts up and fades while the particle rex stays put.
        gsap.to('.hero-copy', {
            opacity: 0,
            yPercent: -14,
            scale: 0.96,
            ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: '38% top', scrub: true }
        });

        // Master progress for the particles: page top → statement lit.
        ScrollTrigger.create({
            trigger: '.hero',
            start: 'top top',
            endTrigger: '#statementText',
            end: 'center 40%',
            onUpdate: function (self) { hero.t = self.progress; },
            onRefresh: function (self) { hero.t = self.progress; }
        });

        // 01 · Statement: words light up one by one.
        if (statementWords.length) {
            gsap.fromTo(statementWords, { opacity: 0.13 }, {
                opacity: 1,
                ease: 'none',
                stagger: statementSplit ? 0.1 : 0,
                scrollTrigger: { trigger: statementText, start: 'top 82%', end: 'center 36%', scrub: 0.35 }
            });
        }

        // 02 · /typing/: pinned on desktop, scrubbed through the viewport on mobile.
        if (typing) {
            var proxy = { p: 0 };
            gsap.to(proxy, {
                p: 1,
                ease: 'none',
                onUpdate: function () { typing.render(proxy.p); },
                scrollTrigger: {
                    trigger: '#typingStage',
                    start: desktop ? 'top top' : 'top 75%',
                    end: desktop ? '+=220%' : 'bottom 25%',
                    pin: desktop,
                    scrub: 0.5,
                    anticipatePin: 1
                }
            });
        }

        // 03 · /deadlyBalloons/: pinned sky, balloons rise with parallax, one pops.
        var stage = document.getElementById('balloonStage');
        if (stage) {
            var balloons = $$('.bl', stage);
            var green = $('.sky-rex-green', stage);
            var red = $('.sky-rex-red', stage);
            var pop = document.getElementById('popBalloon');

            var sky = gsap.timeline({
                scrollTrigger: {
                    trigger: stage,
                    start: 'top top',
                    end: '+=170%',
                    pin: true,
                    scrub: 0.6,
                    anticipatePin: 1,
                    invalidateOnRefresh: true
                }
            });

            balloons.forEach(function (el) {
                var depth = parseFloat(el.getAttribute('data-depth')) || 0.5;
                sky.fromTo(el,
                    { y: function () { return depth * vh() * 0.2; } },
                    { y: function () { return -depth * vh() * 1.65; }, ease: 'none', duration: 1 },
                    0);
            });

            if (green) sky.fromTo(green, { yPercent: 125 }, { yPercent: 0, duration: 0.16, ease: 'power2.out' }, 0.16);
            if (red) sky.fromTo(red, { yPercent: 125, scaleX: -1 }, { yPercent: 0, scaleX: -1, duration: 0.16, ease: 'power2.out' }, 0.48);

            if (pop) {
                var img = $('img', pop);
                var shards = $$('.shard', pop);
                var count = shards.length || 1;
                sky.to(img, { scale: 1.18, duration: 0.05, ease: 'power2.in' }, 0.4)
                   .set(img, { opacity: 0 }, 0.45)
                   .fromTo(shards,
                       { opacity: 1, x: 0, y: 0, scale: 0.5, rotation: 0 },
                       {
                           opacity: 0,
                           scale: 1.1,
                           duration: 0.18,
                           ease: 'power2.out',
                           x: function (i) { return Math.cos((i / count) * Math.PI * 2) * 170; },
                           y: function (i) { return Math.sin((i / count) * Math.PI * 2) * 150 - 30; },
                           rotation: function (i) { return 40 + i * 53; }
                       },
                       0.45);
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

        // 05 · /music/: the waveform grows in.
        var wave = document.getElementById('wave');
        var bars = $$('#waveBars i');
        if (wave && bars.length) {
            gsap.fromTo(bars, { scaleY: 0.04 }, {
                scaleY: 1,
                ease: 'power2.out',
                stagger: { each: 0.02, from: 'random' },
                scrollTrigger: { trigger: wave, start: 'top 85%', end: 'top 30%', scrub: 0.5 }
            });
        }

        // Reveals, created last so they measure against the pinned layout.
        $$('[data-reveal]').forEach(function (el) {
            gsap.fromTo(el, { opacity: 0, y: 26 }, {
                opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
                scrollTrigger: { trigger: el, start: 'top 88%', once: true }
            });
        });

        $$('[data-reveal-group]').forEach(function (group) {
            var items = Array.prototype.slice.call(group.children);
            if (!items.length) return;
            gsap.fromTo(items, { opacity: 0, y: 26 }, {
                opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08,
                scrollTrigger: { trigger: group, start: 'top 86%', once: true }
            });
        });

        return function () {
            phones.forEach(function (ph) { ph.style.transform = ''; });
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
