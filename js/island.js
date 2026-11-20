/* The home page's controller.

   The page is complete without it: eleven stacked sections, each with a still
   of its place and its content. This script adds two things.

   1. Travel. The dock, the minimap and any link to a stop glide there. With
      the live world that is a camera flight; without it, a smooth scroll.
   2. The live world (/js/world.js, an ES module loaded on demand): only on
      devices that can run it. Scroll position is the camera's position, so
      scrolling, the dock and deep links (/#apps) are one mechanism.

   localStorage
     rex-island          the visitor's detail choice: auto | ultra | high | medium | low | off
     rex-island-cap      a ceiling set when a tier crashed or could not keep up
     rex-island-loading  set while the world is being built; still set on the
                         next visit means that load died, so start a tier lower
     rex-island-gl       "1" once WebGPU failed here: use the WebGL 2 path from then on */
(function () {
    'use strict';

    var d = document, root = d.documentElement;
    var stops = Array.prototype.slice.call(d.querySelectorAll('.stop[data-stop]'));
    if (!stops.length) return;
    var dockItems = Array.prototype.slice.call(d.querySelectorAll('.dock-item'));
    var pins = Array.prototype.slice.call(d.querySelectorAll('.map-pin'));
    var statusEl = d.getElementById('worldStatus');
    var detailCtl = d.getElementById('detailCtl'), detailSel = d.getElementById('detailSel');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ORDER = ['off', 'low', 'medium', 'high', 'ultra'];
    var world = null, flying = false, here = -1, flyTimer = 0;
    var settled = false, userMoved = false;      // the address bar is left alone until the first position is known

    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
    function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function say(t) { if (statusEl) statusEl.textContent = t || ''; }

    /* ---------- where we are ----------------------------------------- */

    var tops = [], vh = window.innerHeight;
    function measure() { vh = window.innerHeight; tops = stops.map(function (s) { return s.offsetTop; }); }

    // scroll position as a fractional stop index: hold at a stop while its
    // section is on screen, cross to the next during the last screenful
    function progress() {
        var y = window.scrollY, n = stops.length, i = n - 1;
        while (i > 0 && y < tops[i] - 1) i--;
        if (i >= n - 1) return n - 1;
        var start = Math.max(tops[i], tops[i + 1] - vh);
        return i + clamp((y - start) / Math.max(1, tops[i + 1] - start), 0, 1);
    }

    function setHere(i) {
        if (i === here) return;
        here = i;
        dockItems.forEach(function (el) { var on = +el.getAttribute('data-go') === i; el.classList.toggle('is-here', on); if (on) { el.setAttribute('aria-current', 'true'); if (el.scrollIntoView && el.parentNode.scrollWidth > el.parentNode.clientWidth) el.parentNode.scrollTo({ left: el.offsetLeft - el.parentNode.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' }); } else el.removeAttribute('aria-current'); });
        pins.forEach(function (el) { el.classList.toggle('is-here', +el.getAttribute('data-go') === i); });
        // keep the address shareable without filling the history
        if (!settled) return;
        if (i === 0 && location.hash && stopOfHash(location.hash) < 0) return;      // someone else's hash: leave it
        var id = stops[i].id, want = i === 0 ? location.pathname + location.search : '#' + id;
        try { if ((i === 0 && location.hash) || (i > 0 && location.hash !== want)) history.replaceState(null, '', want); } catch (e) { /* file:// */ }
    }

    var ticking = false;
    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            ticking = false;
            var s = progress();
            if (world && !flying) world.setProgress(s);
            if (!flying) setHere(Math.round(s));
            if (world) for (var i = 0; i < stops.length; i++) stops[i].style.setProperty('--near', clamp(1.9 - Math.abs(s - i) * 3.4, 0, 1).toFixed(3));
        });
    }

    function go(i) {
        i = clamp(i, 0, stops.length - 1);
        measure();
        if (world && !reduce) {
            // the camera flies; the page jumps underneath while the panels are away
            flying = true;
            root.classList.add('world-flying');
            var dur = world.flyTo(i);
            window.scrollTo({ top: tops[i], behavior: 'instant' });
            setHere(i);
            clearTimeout(flyTimer);
            flyTimer = setTimeout(function () { flying = false; root.classList.remove('world-flying'); onScroll(); }, Math.max(300, dur * 1000 * 0.84));
        } else {
            window.scrollTo({ top: tops[i], behavior: reduce ? 'auto' : 'smooth' });
        }
    }

    function stopOfHash(hash) {
        var id = (hash || '').replace(/^#/, '');
        if (!id) return -1;
        for (var i = 0; i < stops.length; i++) if (stops[i].id === id) return i;
        return -1;
    }

    d.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var i = -1;
        if (a.hasAttribute('data-go')) i = +a.getAttribute('data-go');
        else if (a.origin === location.origin && a.pathname === location.pathname && a.hash) i = stopOfHash(a.hash);
        if (i < 0) return;
        e.preventDefault();
        go(i);
        if (a.blur && a.classList.contains('dock-item')) a.blur();
    });
    window.addEventListener('hashchange', function () { var i = stopOfHash(location.hash); if (i >= 0 && i !== here) go(i); });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { measure(); onScroll(); });

    // Arriving on a deep link (/#apps from an app's page, /#mac from the palette): go to that stop, and
    // again once everything has loaded and the sections have their final heights, unless the visitor
    // has already started moving.
    var initial = stopOfHash(location.hash);
    ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach(function (t) { window.addEventListener(t, function () { userMoved = true; }, { passive: true, once: true }); });
    function arrive() {
        measure();
        if (initial > 0 && !userMoved) window.scrollTo({ top: tops[initial], behavior: 'instant' });
        var s = progress();
        here = -1;
        setHere(Math.round(s));
        onScroll();
    }
    arrive();
    window.addEventListener('load', function () { arrive(); settled = true; here = -1; setHere(Math.round(progress())); });

    /* ---------- things the page shows with or without the world ------- */

    var pill = d.getElementById('gamesNet'), pillLabel = d.getElementById('gamesNetLabel'), gamesUp = null;
    if (window.rexChrome && window.rexChrome.pingGames) {
        window.rexChrome.pingGames().then(function (up) {
            if (up === null) return;
            gamesUp = up;
            if (pill) pill.setAttribute('data-state', up ? 'up' : 'down');
            if (pillLabel) pillLabel.textContent = up ? 'games · up' : 'games · offline';
            if (world) world.setActivity(up ? 1 : 0.12);
        });
    }

    // how long ago the site was last committed to (common.js fetches it for the status bar)
    function commitAge() {
        try { var c = JSON.parse(sessionStorage.getItem('rex-deploy') || 'null'); if (c && c.date) return (Date.now() - new Date(c.date).getTime()) / 36e5; } catch (e) { /* no cache */ }
        return null;
    }
    function feedFire() {
        var h = commitAge(), note = d.getElementById('campNote');
        if (h === null) return false;
        var fire = h < 24 ? 1 : h < 24 * 7 ? 0.7 : h < 24 * 30 ? 0.45 : 0.25;
        if (world) world.setFire(fire);
        if (note) {
            var ago = h < 1 ? 'under an hour ago' : h < 24 ? Math.round(h) + ' h ago' : Math.round(h / 24) + ' d ago';
            note.textContent = 'The fire burns by how recently this site was committed to: ' + ago + '.';
            note.hidden = false;
        }
        return true;
    }

    /* ---------- the live world ---------------------------------------- */

    function supports() {
        if (navigator.gpu) return true;
        try { return !!d.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
    }

    // What the graphics chip is, as far as the browser will say. WebGPU names a vendor and an
    // architecture; WebGL's debug string usually names the model.
    function gpuHint() {
        var hint = { vendor: '', arch: '', name: '' };
        try {
            var gl = d.createElement('canvas').getContext('webgl2');
            var ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) hint.name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
            var lose = gl && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
        } catch (e) { /* no WebGL */ }
        if (!navigator.gpu) return Promise.resolve(hint);
        return navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).then(function (a) {
            if (a && a.info) { hint.vendor = String(a.info.vendor || '').toLowerCase(); hint.arch = String(a.info.architecture || '').toLowerCase(); }
            return hint;
        }).catch(function () { return hint; });
    }

    // A first guess at what this machine can hold at a good frame rate. The world then
    // trades resolution to keep it, and the visitor can overrule the guess.
    function autoTier() {
        if (reduce) return Promise.resolve('off');
        if (navigator.connection && navigator.connection.saveData) return Promise.resolve('off');
        if (!supports()) return Promise.resolve('off');
        var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        var mem = navigator.deviceMemory || (coarse ? 4 : 8), cores = navigator.hardwareConcurrency || 4;
        if (coarse) return Promise.resolve(mem >= 8 && cores >= 8 ? 'medium' : mem >= 4 && cores >= 6 ? 'low' : 'off');
        if (mem <= 4 || cores <= 4) return Promise.resolve('medium');
        return gpuHint().then(function (g) {
            var n = g.name.toLowerCase(), top = navigator.gpu ? 'ultra' : 'high';
            if (/swiftshader|llvmpipe|software|basic render/.test(n)) return 'low';
            if (g.vendor === 'nvidia' || /nvidia|geforce|rtx|gtx|quadro/.test(n)) return /gtx 9|gtx 10[0-5]|mx\d|gt \d/.test(n) ? 'high' : top;
            if (g.vendor === 'apple' || /apple/.test(n)) return /m\d+ (max|ultra)/.test(n) ? top : 'high';
            if (g.vendor === 'amd' || /radeon|amd/.test(n)) return /rx [5-9]\d{3}|rx\d{4}/.test(n) ? top : 'high';
            if (g.vendor === 'intel' || /intel/.test(n)) return /hpg|arc\(tm\) [ab]\d|arc [ab]\d/.test(g.arch + ' ' + n) ? 'high' : 'medium';
            return 'medium';
        });
    }

    function chooseTier() {
        var q = new URLSearchParams(location.search).get('island');
        var pick = q || read('rex-island') || 'auto';
        var known = ORDER.indexOf(pick) >= 0;
        return (known ? Promise.resolve(pick) : autoTier()).then(function (tier) {
            var cap = read('rex-island-cap');
            // the last visit never finished loading: assume it was too much and step down
            if (read('rex-island-loading')) { cap = ORDER[Math.max(0, ORDER.indexOf(read('rex-island-loading')) - 1)]; store('rex-island-cap', cap); store('rex-island-loading', null); }
            if (!q && cap && ORDER.indexOf(cap) >= 0 && ORDER.indexOf(tier) > ORDER.indexOf(cap)) tier = cap;
            if (tier !== 'off' && !supports()) tier = 'off';
            return { pick: known ? pick : 'auto', tier: tier };
        });
    }

    function showDetail(choice) {
        if (!detailCtl || !detailSel) return;
        if (!supports()) return;
        detailCtl.hidden = false;
        detailSel.value = choice.pick;
        detailSel.addEventListener('change', function () {
            store('rex-island', detailSel.value === 'auto' ? null : detailSel.value);
            store('rex-island-cap', null);
            store('rex-island-gl', null);           // an explicit choice gets a clean try
            location.reload();
        });
    }

    function wire() {
        root.classList.add('world-on');
        world.jumpTo(progress());
        world.setMotion(reduce ? 0 : 1);
        world.start();
        onScroll();
        if (gamesUp !== null) world.setActivity(gamesUp ? 1 : 0.12);
        if (!feedFire()) setTimeout(feedFire, 3500);
        watchWorld();
        if (wired) return;          // the listeners below look at `world`, whichever one is current
        wired = true;

        d.addEventListener('visibilitychange', function () { if (!world) return; if (d.hidden) world.stop(); else world.start(); });

        if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
            window.addEventListener('pointermove', function (e) { if (world) world.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1); }, { passive: true });
        }

        // letters light the stones of the keyboard
        d.addEventListener('keydown', function (e) {
            if (!world || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
            var t = e.target;
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || (t.closest && t.closest('dialog')))) return;
            if (/^[a-z]$/i.test(e.key)) world.pressKey(e.key);
        });

        // a click on the open view pops the balloon under it
        var score = d.getElementById('skyScore'), popped = d.getElementById('skyPopped'), nPop = 0;
        d.querySelector('.tour').addEventListener('click', function (e) {
            if (!world || e.target.closest('.panel, .hero-copy, a, button')) return;
            if (world.pop((e.clientX / window.innerWidth) * 2 - 1, 1 - (e.clientY / window.innerHeight) * 2)) {
                nPop++;
                if (popped) popped.textContent = String(nPop);
                if (score) score.textContent = String(nPop * 100);
            }
        });

        // an app's egg stirs while its name is pointed at
        var list = d.getElementById('appsBento');
        if (list) {
            var over = function (e) { var a = e.target.closest && e.target.closest('[data-app]'); if (world) world.hoverApp(a ? a.getAttribute('data-app') : null); };
            list.addEventListener('pointerover', over); list.addEventListener('focusin', over);
            list.addEventListener('pointerleave', function () { if (world) world.hoverApp(null); });
            list.addEventListener('focusout', function () { if (world) world.hoverApp(null); });
        }
    }

    // If the world reports a graphics failure, try once more on WebGL 2 before giving up; if even
    // the smallest picture cannot keep up, go back to the stills and remember a lower ceiling.
    function watchWorld() {
        var checks = 0, timer = 0;
        function check() {
            if (!world) return;
            checks++;
            if (!world.perf.struggling) { timer = setTimeout(check, checks < 20 ? 500 : 2500); return; }
            var tier = world.quality.name, failed = world.perf.failed, wasGPU = world.backend === 'webgpu';
            try { world.stop(); world.dispose(); } catch (e) { /* already gone */ }
            world = null; window.rexWorld = null;
            root.classList.remove('world-on', 'world-flying');
            if (failed && wasGPU && !usedGL) {
                store('rex-island-gl', '1');
                var old = d.getElementById('worldCanvas'), fresh = old.cloneNode(false);
                old.parentNode.replaceChild(fresh, old);
                start({ pick: 'auto', tier: tier === 'ultra' ? 'high' : tier }, true);
                return;
            }
            store('rex-island-cap', ORDER[Math.max(0, ORDER.indexOf(tier) - 1)]);
            say('stills on this device');
        }
        timer = setTimeout(check, 500);
    }

    function boot() { chooseTier().then(function (c) { showDetail(c); start(c, false); }); }

    var usedGL = false, wired = false;
    function start(choice, forceGL) {
        if (choice.tier === 'off') return;
        var canvas = d.getElementById('worldCanvas');
        if (!canvas) return;
        var apps = Array.prototype.map.call(d.querySelectorAll('#appsBento [data-app]'), function (a) { return { id: a.getAttribute('data-app'), tint: (a.style.getPropertyValue('--t-dark') || '#cfc6ad').trim() }; });
        var q = new URLSearchParams(location.search);
        store('rex-island-loading', choice.tier);
        // leaving while it loads is not a crash: only a tab that died never gets to say goodbye
        window.addEventListener('pagehide', function () { if (!world) store('rex-island-loading', null); });
        say('waking the island…');
        import('/js/world.js').then(function (m) {
            return m.createWorld({
                canvas: canvas, tier: choice.tier, apps: apps, forceWebGL: (usedGL = forceGL || q.get('webgl') === '1' || read('rex-island-gl') === '1'),
                onProgress: function (label, p) { say(label.toLowerCase() + ' · ' + Math.round(p * 100) + '%'); }
            });
        }).then(function (w) {
            world = w;
            window.rexWorld = w;
            store('rex-island-loading', null);
            say('');
            wire();
            d.dispatchEvent(new CustomEvent('rex:world', { detail: { tier: w.quality.name, backend: w.backend } }));
        }).catch(function (err) {
            // the stills are already there; note the failure and never retry this tier unasked
            store('rex-island-loading', null);
            store('rex-island-cap', ORDER[Math.max(0, ORDER.indexOf(choice.tier) - 1)]);
            say('');
            window.rexWorldError = String(err && (err.stack || err));
            if (window.console) console.warn('island: live world unavailable, showing stills.', err);
        });
    }

    // let the page paint and settle first: the world is an enhancement
    if (d.readyState === 'complete') setTimeout(boot, 60);
    else window.addEventListener('load', function () { setTimeout(boot, 60); });
})();
