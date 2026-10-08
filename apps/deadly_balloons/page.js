/* /apps/deadly_balloons/ — page script. Dependency-free.
   1. Arsenal readout: pick an ability to read its in-game Wiki line.
   2. Boss HP bars fill once their campaign scrolls into view; the hero's
      bullet rings stop turning while off-screen.
   3. The arcade teaser: a dodge-only canvas game drawn from the real
      roster (enemy_type.dart, config.dart). Nothing runs until Start;
      it pauses when the screen scrolls away, the tab hides or focus
      leaves for another control. Best time in localStorage. */
(function () {
    'use strict';

    var doc = document;
    var root = doc.documentElement;
    root.classList.add('js');

    var hasIO = 'IntersectionObserver' in window;
    var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
    var media = function (q) {
        return window.matchMedia ? window.matchMedia(q) : { matches: false };
    };
    var mqLight = media('(prefers-color-scheme: light)');

    function onMediaChange(mq, fn) {
        if (mq.addEventListener) mq.addEventListener('change', fn);
        else if (mq.addListener) mq.addListener(fn);
    }

    function effectiveTheme() {
        var t = root.getAttribute('data-theme');
        if (t === 'light' || t === 'dark') return t;
        return mqLight.matches ? 'light' : 'dark';
    }

    /* ---------- 1. Arsenal readout -------------------------------- */

    (function () {
        var box = doc.getElementById('db-readout');
        if (!box) return;
        var famEl = doc.getElementById('db-readout-fam');
        var nameEl = doc.getElementById('db-readout-name');
        var lineEl = doc.getElementById('db-readout-line');
        var buttons = doc.querySelectorAll('.db-ab');
        var current = null;

        function select(btn) {
            if (btn === current) return;
            if (current) current.setAttribute('aria-pressed', 'false');
            current = btn;
            btn.setAttribute('aria-pressed', 'true');
            var fam = btn.closest('.db-fam');
            famEl.textContent = fam.querySelector('h3').textContent;
            nameEl.textContent = btn.textContent;
            lineEl.textContent = btn.getAttribute('data-line');
            box.style.setProperty('--fam', fam.style.getPropertyValue('--fam'));
            box.style.setProperty('--fam-l', fam.style.getPropertyValue('--fam-l'));
        }

        each(buttons, function (b) {
            if (b.getAttribute('aria-pressed') === 'true') current = b;
            else b.setAttribute('aria-pressed', 'false');
            b.addEventListener('click', function () { select(b); });
            b.addEventListener('pointerenter', function (e) {
                if (e.pointerType === 'mouse') select(b);
            });
        });
        if (current) {
            var fam = current.closest('.db-fam');
            box.style.setProperty('--fam', fam.style.getPropertyValue('--fam'));
            box.style.setProperty('--fam-l', fam.style.getPropertyValue('--fam-l'));
        }
    })();

    /* ---------- 2. Boss bars + hero rings -------------------------- */

    (function () {
        var camps = doc.querySelectorAll('.db-camp');
        var rings = doc.querySelector('.db-rings');
        if (!hasIO) {
            each(camps, function (c) { c.classList.add('is-in'); });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('is-in');
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.3 });
        each(camps, function (c) { io.observe(c); });

        if (rings) {
            new IntersectionObserver(function (entries) {
                rings.classList.toggle('is-paused', !entries[entries.length - 1].isIntersecting);
            }).observe(rings);
        }
    })();

    /* ---------- 3. Arcade teaser ----------------------------------- */

    (function () {
        var cab = doc.getElementById('arcade');
        var canvas = doc.getElementById('db-canvas');
        if (!cab || !canvas || !canvas.getContext) return;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        var screen = doc.getElementById('db-screen');
        var elTime = doc.getElementById('db-time');
        var elBest = doc.getElementById('db-best');
        var elWave = doc.getElementById('db-wave');
        var elLive = doc.getElementById('db-live');
        var elCause = doc.getElementById('db-cause');
        var elResult = doc.getElementById('db-result');
        var elNewBest = doc.getElementById('db-newbest');
        var panels = {
            idle: cab.querySelector('[data-panel="idle"]'),
            paused: cab.querySelector('[data-panel="paused"]'),
            over: cab.querySelector('[data-panel="over"]')
        };
        var btnPause = cab.querySelector('[data-act="pause"]');
        var btnRestart = cab.querySelector('[data-act="restart"]');

        /* World: the game's arena is 400 units wide; this one is a
           400 × 560 window onto it. */
        var W = 400;
        var H = 560;
        var TAU = Math.PI * 2;
        var BEST_KEY = 'rex-deadly-balloons-teaser-best';

        // Straight from config.dart: every shot is telegraphed for
        // enemyShootWindup, Shotgun spreads three shots 25° apart, enemy
        // bullets fly at 200. The Rexyrex numbers are its blink timings.
        var WINDUP = 1.05;
        var SPREAD = 25 * Math.PI / 180;
        var BULLET_SPEED = 200;
        var BOSS_AT = 40;

        // Body / highlight colours from enemy_type.dart.
        var TYPES = {
            shooter: { name: 'Shooter', body: '#708090', hi: '#a0b0c0', r: 13, sp: 46, every: 2.9, shots: 1 },
            stinger: { name: 'Stinger', body: '#ff5522', hi: '#ffaa66', r: 11, sp: 64, every: 1.45, shots: 1 },
            shotgun: { name: 'Shotgun', body: '#506070', hi: '#8090a0', r: 16, sp: 38, every: 3.6, shots: 3 },
            charger: { name: 'Charger', body: '#9b9bff', hi: '#ccccff', r: 14, sp: 0, every: 0, shots: 0 },
            gnat: { name: 'Gnat', body: '#aeea00', hi: '#e6ff8a', r: 7.8, sp: 0, every: 0, shots: 0 }
        };
        Object.keys(TYPES).forEach(function (k) { TYPES[k].dark = mix(TYPES[k].body, '#000000', 0.42); });
        var BOSS = { name: 'Rexyrex', body: '#8844cc', hi: '#aa66ff', dark: mix('#8844cc', '#000000', 0.42) };

        var state = 'idle';
        var t = 0;
        var wave = 1;
        var best = readBest();
        var player, enemies, bullets, pops, banners, boss, bossDone, spawnT, killer, finalT;
        var keys = {};
        var mouse = null;
        var drag = null;
        var dragDX = 0;
        var dragDY = 0;
        var raf = 0;
        var last = 0;
        var hudAt = 0;
        var sx = 1;
        var sy = 1;
        var pal = null;
        var sky = null;
        var sprite = null;
        var stars = [];
        var clouds = [];

        for (var i = 0; i < 64; i++) {
            stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() < 0.18 ? 2 : 1, a: 0.35 + Math.random() * 0.55, v: 6 + Math.random() * 14, c: ['#ffffff', '#ffffff', '#bfd8ff', '#ffe9c0'][i % 4] });
        }
        for (i = 0; i < 6; i++) {
            clouds.push({ x: Math.random() * W, y: Math.random() * H, r: 70 + Math.random() * 80, v: 8 + Math.random() * 8, c: ['rgba(190,232,255,', 'rgba(255,214,165,', 'rgba(255,255,255,'][i % 3] });
        }

        /* ----- helpers ----- */

        function mix(a, b, k) {
            var pa = parseInt(a.slice(1), 16);
            var pb = parseInt(b.slice(1), 16);
            var r = Math.round(((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k);
            var g = Math.round(((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k);
            var bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
            return 'rgb(' + r + ',' + g + ',' + bl + ')';
        }

        function rgba(hex, a) {
            var p = parseInt(hex.slice(1), 16);
            return 'rgba(' + ((p >> 16) & 255) + ',' + ((p >> 8) & 255) + ',' + (p & 255) + ',' + a + ')';
        }

        function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

        function readBest() {
            try {
                var v = parseFloat(localStorage.getItem(BEST_KEY));
                return isFinite(v) && v > 0 ? v : 0;
            } catch (e) { return 0; }
        }

        function writeBest(v) {
            try { localStorage.setItem(BEST_KEY, (Math.floor(v * 100 + 1e-6) / 100).toFixed(2)); } catch (e) { /* storage off: keep it in memory */ }
        }

        function fmt(s) {
            var cs = Math.floor(s * 100 + 1e-6);
            var m = Math.floor(cs / 6000);
            var rest = ((cs % 6000) / 100).toFixed(2);
            if (rest.length < 5) rest = '0' + rest;
            return m ? m + ':' + rest : rest;
        }

        function live(msg) {
            elLive.textContent = '';
            window.setTimeout(function () { elLive.textContent = msg; }, 30);
        }

        /* ----- theme + sizing ----- */

        function palette() {
            var light = effectiveTheme() === 'light';
            pal = {
                light: light,
                // Real skies: the flight-training sky by day, the twilight
                // carnival by night (background.dart).
                sky: light ? ['#0c254f', '#205b8a', '#67a7bd', '#d99076'] : ['#090618', '#170b2e', '#3a143e', '#5e1f30'],
                stops: light ? [0, 0.35, 0.72, 1] : [0, 0.4, 0.75, 1],
                blend: light ? 'source-over' : 'lighter'
            };
            sky = ctx.createLinearGradient(0, 0, 0, H);
            for (var k = 0; k < 4; k++) sky.addColorStop(pal.stops[k], pal.sky[k]);
            buildSprite();
        }

        // One pre-rendered enemy bullet: a red shard with a pale rim and a
        // white core, the shape the game reserves for enemy fire.
        function buildSprite() {
            var px = Math.max(1, sx);
            var size = 36;
            var c = doc.createElement('canvas');
            c.width = Math.ceil(size * px);
            c.height = Math.ceil(size * px);
            var g = c.getContext('2d');
            g.scale(px, px);
            g.translate(size / 2, size / 2);
            var glow = g.createRadialGradient(0, 0, 0, 0, 0, 13);
            glow.addColorStop(0, 'rgba(255,42,54,0.55)');
            glow.addColorStop(1, 'rgba(255,42,54,0)');
            g.fillStyle = glow;
            g.beginPath();
            g.arc(0, 0, 13, 0, TAU);
            g.fill();
            g.beginPath();
            g.moveTo(-8, 0); g.lineTo(0, -3.8); g.lineTo(8.5, 0); g.lineTo(0, 3.8); g.closePath();
            g.fillStyle = '#ff2a36';
            g.fill();
            g.lineWidth = 0.9;
            g.strokeStyle = '#ffc6cc';
            g.stroke();
            g.beginPath();
            g.moveTo(-4, 0); g.lineTo(0, -1.5); g.lineTo(4.5, 0); g.lineTo(0, 1.5); g.closePath();
            g.fillStyle = '#ffffff';
            g.fill();
            sprite = { c: c, size: size };
        }

        function resize() {
            var rect = canvas.getBoundingClientRect();
            if (!rect.width) return;
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
            sx = canvas.width / W;
            sy = canvas.height / H;
            buildSprite();
            if (state !== 'running') draw();
        }

        /* ----- run state ----- */

        function reset() {
            t = 0;
            wave = 1;
            spawnT = 0.8;
            boss = null;
            bossDone = false;
            killer = null;
            player = { x: W / 2, y: H - 86, tilt: 0 };
            enemies = [];
            bullets = [];
            pops = [];
            banners = [];
            keys = {};
            mouse = null;
            drag = null;
            dragDX = 0;
            dragDY = 0;
            banner('WAVE 1', false);
        }

        // A still frame for the idle screen: a slice of a real wave.
        function demo() {
            reset();
            banners = [];
            player.x = 204;
            player.y = 478;
            var sh = mk('shooter', 86, 98);
            sh.phase = 'roam';
            sh.wind = 0.8;
            sh.ang = Math.atan2(player.y - sh.y, player.x - sh.x);
            var st = mk('stinger', 206, 58);
            st.phase = 'roam';
            var sg = mk('shotgun', 318, 112);
            sg.phase = 'roam';
            var a = Math.atan2(player.y - sg.y, player.x - sg.x);
            for (var k = -1; k <= 1; k++) {
                var aa = a + k * SPREAD;
                bullets.push({ x: sg.x + Math.cos(aa) * 46, y: sg.y + Math.sin(aa) * 46, vx: Math.cos(aa), vy: Math.sin(aa), from: 'Shotgun' });
            }
            var ch = mk('charger', 48, 404);
            ch.phase = 'aim';
            ch.aimT = 0.7;
            ch.ang = Math.atan2(player.y - 6 - ch.y, player.x - ch.x);
            [[336, 420], [354, 436], [322, 446], [348, 458], [330, 470]].forEach(function (p) {
                var g = mk('gnat', p[0], p[1]);
                g.phase = 'swarm';
            });
            [[150, 412], [262, 448], [232, 398], [118, 470]].forEach(function (p) {
                var ang = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
                bullets.push({ x: p[0], y: p[1], vx: Math.cos(ang), vy: Math.sin(ang), from: 'Shooter' });
            });
        }

        function mk(kind, x, y) {
            var T = TYPES[kind];
            var e = {
                kind: kind, T: T, r: T.r, x: x, y: y,
                homeY: 58 + Math.random() * 150, phase: 'enter',
                dir: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * TAU,
                life: 9 + Math.random() * 6, shootT: T.every * (0.3 + Math.random() * 0.4),
                wind: -1, ang: 0, vx: 0, vy: 0, bob: 0, wait: 0.8 + Math.random() * 1.2, aimT: 0, dead: false
            };
            enemies.push(e);
            return e;
        }

        function spawn(kind) {
            var T = TYPES[kind];
            var e = mk(kind, 40 + Math.random() * (W - 80), -T.r - 6);
            if (kind === 'charger') e.homeY = 64 + Math.random() * 110;
        }

        function spawnGnats() {
            var n = 4 + Math.floor(Math.random() * 3) + Math.min(3, Math.floor(t / 25));
            var cx = 60 + Math.random() * (W - 120);
            var drift = (Math.random() - 0.5) * 50;
            for (var k = 0; k < n; k++) {
                var g = mk('gnat', cx + (Math.random() - 0.5) * 70, -10 - Math.random() * 70);
                g.phase = 'swarm';
                g.vx = drift + (Math.random() - 0.5) * 24;
                g.vy = 82 + Math.random() * 30 + Math.min(40, t * 0.6);
            }
        }

        function banner(text, isBoss) {
            banners.push({ text: text, boss: isBoss, t: 0, dur: isBoss ? 2.4 : 1.5 });
        }

        function speedMult() { return 1 + Math.min(0.3, t / 240); }
        function fireMult() { return Math.max(0.62, 1 - t / 190); }

        function shoot(x, y, a, spd, from) {
            bullets.push({ x: x, y: y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, from: from });
        }

        function canFire(e) {
            // The game's fire discipline: only from the top half, never point-blank.
            var dx = player.x - e.x;
            var dy = player.y - e.y;
            return e.y < H * 0.5 && dx * dx + dy * dy >= 120 * 120;
        }

        /* ----- director ----- */

        function pick() {
            var opts = [['shooter', 3]];
            if (t > 6) opts.push(['stinger', 2]);
            if (t > 10) opts.push(['gnat', 1.3]);
            if (t > 15) opts.push(['shotgun', 2.2]);
            if (t > 22) opts.push(['charger', 1.7]);
            var sum = 0;
            opts.forEach(function (o) { sum += o[1]; });
            var r = Math.random() * sum;
            for (var k = 0; k < opts.length; k++) {
                r -= opts[k][1];
                if (r <= 0) return opts[k][0];
            }
            return 'shooter';
        }

        function director(dt) {
            var w = 1 + Math.floor(t / 12);
            if (w !== wave) {
                wave = w;
                elWave.textContent = String(w);
                if (!(boss && boss.phase === 'enter')) banner('WAVE ' + w, false);
            }
            if (!boss && !bossDone && t >= BOSS_AT) spawnBoss();

            spawnT -= dt;
            if (spawnT > 0) return;
            var alive = 0;
            var gnats = 0;
            enemies.forEach(function (e) { if (e.kind === 'gnat') gnats++; else alive++; });
            var cap = Math.min(8, 3 + Math.floor(t / 8)) - (boss ? 2 : 0);
            var kind = pick();
            if (kind === 'gnat') {
                if (gnats === 0) spawnGnats();
            } else if (alive < Math.max(1, cap)) {
                spawn(kind);
            }
            spawnT = Math.max(0.7, 2.1 - t * 0.022) * (boss ? 1.4 : 1) * (0.8 + Math.random() * 0.4);
        }

        /* ----- enemies ----- */

        function updEnemy(e, dt) {
            if (e.kind === 'gnat') {
                e.seed += dt * 6;
                e.x += (e.vx + Math.sin(e.seed) * 46) * dt;
                e.y += e.vy * dt;
                if (e.y > H + 20 || e.x < -30 || e.x > W + 30) e.dead = true;
                return;
            }
            if (e.phase === 'enter') {
                e.y += 92 * dt;
                if (e.y >= e.homeY) e.phase = e.kind === 'charger' ? 'hover' : 'roam';
                return;
            }
            if (e.kind === 'charger') {
                if (e.phase === 'hover') {
                    e.wait -= dt;
                    e.x += Math.sin(t * 2 + e.seed) * 14 * dt;
                    if (e.wait <= 0) {
                        e.phase = 'aim';
                        e.aimT = 0;
                        e.ang = Math.atan2(player.y - e.y, player.x - e.x);
                    }
                } else if (e.phase === 'aim') {
                    e.aimT += dt;
                    if (e.aimT >= 1.05) {
                        e.phase = 'dash';
                        var v = 430 * speedMult();
                        e.vx = Math.cos(e.ang) * v;
                        e.vy = Math.sin(e.ang) * v;
                    }
                } else if (e.phase === 'dash') {
                    e.x += e.vx * dt;
                    e.y += e.vy * dt;
                    if (e.x < -40 || e.x > W + 40 || e.y < -40 || e.y > H + 40) e.dead = true;
                }
                return;
            }

            var braced = e.kind === 'shotgun' && e.wind >= 0;
            if (!braced) {
                e.x += e.dir * e.T.sp * dt;
                if (e.x < e.r + 6) { e.x = e.r + 6; e.dir = 1; }
                else if (e.x > W - e.r - 6) { e.x = W - e.r - 6; e.dir = -1; }
            }
            e.bob += dt;
            if (e.phase === 'leave') {
                e.y -= 74 * dt;
                if (e.y < -e.r - 14) e.dead = true;
                return;
            }
            var ty = e.homeY + Math.sin(e.bob * 0.9 + e.seed) * 16;
            e.y += (ty - e.y) * Math.min(1, dt * 2);
            e.life -= dt;

            if (e.wind >= 0) {
                e.wind += dt;
                if (e.wind >= WINDUP) {
                    var n = e.T.shots;
                    var spd = BULLET_SPEED * speedMult();
                    for (var k = 0; k < n; k++) shoot(e.x, e.y, e.ang + (n > 1 ? (k - (n - 1) / 2) * SPREAD : 0), spd, e.T.name);
                    pops.push({ x: e.x, y: e.y, r: e.r, t: 0, dur: 0.25, color: '#ff6a6a' });
                    e.wind = -1;
                    e.shootT = 0;
                }
                return;
            }
            if (e.life <= 0) { e.phase = 'leave'; return; }
            e.shootT += dt;
            if (e.shootT >= e.T.every * fireMult() && canFire(e)) {
                e.wind = 0;
                e.ang = Math.atan2(player.y - e.y, player.x - e.x);
            }
        }

        /* ----- Rexyrex ----- */

        function spawnBoss() {
            boss = { x: W / 2, y: -50, homeY: 96, r: 31, phase: 'enter', alpha: 1, volleyT: 1, volleyN: 0, blinkT: 0, subT: 0, sway: 0, baseX: W / 2, blinks: 0, destX: W / 2 };
            banner('BOSS — REXYREX', true);
        }

        function updBoss(dt) {
            var b = boss;
            b.subT += dt;
            if (b.phase === 'enter') {
                b.y += 64 * dt;
                if (b.y >= b.homeY) { b.y = b.homeY; b.phase = 'fight'; b.subT = 0; }
                return;
            }
            if (b.phase === 'fight') {
                b.sway += dt;
                b.x = clamp(b.baseX + Math.sin(b.sway * 0.7) * 70, b.r + 8, W - b.r - 8);
                b.volleyT -= dt;
                if (b.volleyT <= 0) {
                    b.volleyT = 1.8 * Math.max(0.75, fireMult());
                    volley(b);
                }
                b.blinkT += dt;
                if (b.blinkT >= 6.5) {
                    b.blinkT = 0;
                    b.phase = 'charge';
                    b.subT = 0;
                    // The landing spot locks above your column when the charge starts.
                    b.destX = clamp(player.x, b.r + 10, W - b.r - 10);
                }
            } else if (b.phase === 'charge') {
                if (b.subT >= 1.4) { b.phase = 'vanish'; b.subT = 0; }
            } else if (b.phase === 'vanish') {
                b.alpha = Math.max(0, 1 - b.subT / 0.18);
                if (b.subT >= 0.18) {
                    b.x = b.destX;
                    b.baseX = b.destX;
                    b.sway = 0;
                    b.phase = 'land';
                    b.subT = 0;
                }
            } else if (b.phase === 'land') {
                b.alpha = Math.min(1, b.subT / 0.15);
                if (b.subT >= 0.6) {
                    var off = Math.random() * TAU;
                    for (var k = 0; k < 10; k++) shoot(b.x, b.y, off + k * TAU / 10, 150 * speedMult(), 'Rexyrex');
                    pops.push({ x: b.x, y: b.y, r: b.r, t: 0, dur: 0.5, color: '#aa66ff', ring: true });
                    b.phase = 'recover';
                    b.subT = 0;
                }
            } else if (b.phase === 'recover') {
                b.alpha = 1;
                if (b.subT >= 0.35) {
                    b.blinks++;
                    b.phase = b.blinks % 2 === 0 ? 'rest' : 'fight';
                    b.subT = 0;
                }
            } else if (b.phase === 'rest') {
                // Every boss fights in a rhythm: it powers down and glows green.
                if (b.subT >= 2.6) { b.phase = 'fight'; b.subT = 0; b.volleyT = 0.6; }
            }
        }

        function volley(b) {
            b.volleyN++;
            var a = Math.atan2(player.y - b.y, player.x - b.x);
            if (b.volleyN % 2) {
                shoot(b.x, b.y, a - 0.11, 190 * speedMult(), 'Rexyrex');
                shoot(b.x, b.y, a + 0.11, 190 * speedMult(), 'Rexyrex');
            } else {
                var n = t > 80 ? 8 : 6;
                var off = Math.random() * TAU;
                for (var k = 0; k < n; k++) shoot(b.x, b.y, off + k * TAU / n, 140 * speedMult(), 'Rexyrex');
            }
        }

        /* ----- player ----- */

        function movePlayer(dt) {
            var px = player.x;
            var kx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
            var ky = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
            if (kx || ky) {
                var n = Math.sqrt(kx * kx + ky * ky);
                player.x += kx / n * 255 * dt;
                player.y += ky / n * 255 * dt;
                mouse = null;
            }
            if (dragDX || dragDY) {
                player.x += dragDX;
                player.y += dragDY;
                dragDX = 0;
                dragDY = 0;
            } else if (mouse && !(kx || ky)) {
                var dx = mouse.x - player.x;
                var dy = mouse.y - player.y;
                var d = Math.sqrt(dx * dx + dy * dy);
                var max = 560 * dt;
                if (d > max) { dx *= max / d; dy *= max / d; }
                player.x += dx;
                player.y += dy;
            }
            player.x = clamp(player.x, 12, W - 12);
            player.y = clamp(player.y, 18, H - 14);
            var vx = dt > 0 ? (player.x - px) / dt : 0;
            player.tilt += (clamp(vx / 900, -0.32, 0.32) - player.tilt) * Math.min(1, dt * 10);
        }

        /* ----- the step ----- */

        function update(dt) {
            t += dt;
            movePlayer(dt);
            director(dt);
            for (var k = 0; k < enemies.length; k++) updEnemy(enemies[k], dt);
            if (boss) updBoss(dt);
            for (k = 0; k < bullets.length; k++) {
                var b = bullets[k];
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                if (b.x < -24 || b.x > W + 24 || b.y < -24 || b.y > H + 24) b.dead = true;
            }
            for (k = 0; k < pops.length; k++) { pops[k].t += dt; if (pops[k].t >= pops[k].dur) pops[k].dead = true; }
            for (k = 0; k < banners.length; k++) { banners[k].t += dt; if (banners[k].t >= banners[k].dur) banners[k].dead = true; }
            hits();
            enemies = enemies.filter(alive);
            bullets = bullets.filter(alive);
            pops = pops.filter(alive);
            banners = banners.filter(alive);
        }

        function alive(o) { return !o.dead; }

        var HIT = 4.6; // the ship's forgiving hitbox

        function hits() {
            if (state !== 'running') return;
            var px = player.x;
            var py = player.y;
            for (var k = 0; k < bullets.length; k++) {
                var b = bullets[k];
                var dx = b.x - px;
                var dy = b.y - py;
                var rr = 3.6 + HIT;
                if (dx * dx + dy * dy < rr * rr) {
                    return die({ kind: 'bullet', ref: b, x: b.x, y: b.y, r: 8, color: '#ff4d5e', from: b.from });
                }
            }
            for (k = 0; k < enemies.length; k++) {
                var e = enemies[k];
                var ex = e.x - px;
                var ey = e.y - py;
                var er = e.r * 0.86 + HIT;
                if (ex * ex + ey * ey < er * er) {
                    return die({ kind: 'enemy', ref: e, x: e.x, y: e.y, r: e.r + 6, color: e.T.hi, from: e.T.name });
                }
            }
            if (boss && boss.alpha > 0.5) {
                var bx = boss.x - px;
                var by = boss.y - py;
                var br = boss.r * 0.86 + HIT;
                if (bx * bx + by * by < br * br) {
                    return die({ kind: 'boss', ref: boss, x: boss.x, y: boss.y, r: boss.r + 8, color: BOSS.hi, from: 'Rexyrex' });
                }
            }
        }

        /* ----- drawing ----- */

        function draw() {
            ctx.setTransform(sx, 0, 0, sy, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, H);
            drawBackdrop();
            drawTelegraphs();
            for (var k = 0; k < enemies.length; k++) drawEnemy(enemies[k]);
            if (boss) drawBoss();
            drawPlayer();
            drawBullets();
            drawPops();
            drawBanners();
            if (state === 'over' && killer) drawDeathCam();
        }

        function drawBackdrop() {
            var k;
            if (pal.light) {
                for (k = 0; k < clouds.length; k++) {
                    var c = clouds[k];
                    var cy = ((c.y + t * c.v) % (H + 2 * c.r)) - c.r;
                    var g = ctx.createRadialGradient(c.x, cy, 0, c.x, cy, c.r);
                    g.addColorStop(0, c.c + '0.16)');
                    g.addColorStop(1, c.c + '0)');
                    ctx.fillStyle = g;
                    ctx.fillRect(c.x - c.r, cy - c.r, c.r * 2, c.r * 2);
                }
            }
            for (k = 0; k < stars.length; k++) {
                var s = stars[k];
                if (pal.light && k % 3) continue;
                var y = (s.y + t * s.v) % H;
                ctx.globalAlpha = s.a * (pal.light ? 0.6 : 1);
                ctx.fillStyle = s.c;
                ctx.fillRect(s.x, y, s.s * 0.9, s.s * 0.9);
            }
            ctx.globalAlpha = 1;
        }

        function drawTelegraphs() {
            ctx.save();
            ctx.lineCap = 'round';
            for (var k = 0; k < enemies.length; k++) {
                var e = enemies[k];
                if (e.wind >= 0) {
                    var p = Math.min(1, e.wind / WINDUP);
                    var lines = e.kind === 'shotgun' ? [-SPREAD, 0, SPREAD] : [0];
                    for (var j = 0; j < lines.length; j++) {
                        var a = e.ang + lines[j];
                        ctx.strokeStyle = 'rgba(255,106,106,' + (0.18 + 0.5 * p) * (lines[j] ? 0.6 : 1) + ')';
                        ctx.lineWidth = lines[j] ? 1 : 1.2 + p;
                        ctx.beginPath();
                        ctx.moveTo(e.x + Math.cos(a) * (e.r + 4), e.y + Math.sin(a) * (e.r + 4));
                        ctx.lineTo(e.x + Math.cos(a) * 640, e.y + Math.sin(a) * 640);
                        ctx.stroke();
                    }
                    // the lock reticle closes in as the shot gets near
                    ctx.strokeStyle = 'rgba(255,106,106,' + (0.35 + 0.5 * p) + ')';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, e.r + 4 + (1 - p) * 12, 0, TAU);
                    ctx.stroke();
                } else if (e.kind === 'charger' && e.phase === 'aim') {
                    var q = Math.min(1, e.aimT / 1.05);
                    ctx.setLineDash([7, 7]);
                    ctx.lineDashOffset = -t * 40;
                    ctx.strokeStyle = 'rgba(204,204,255,' + (0.3 + 0.5 * q) + ')';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y);
                    ctx.lineTo(e.x + Math.cos(e.ang) * 640, e.y + Math.sin(e.ang) * 640);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
            if (boss && boss.phase === 'charge') {
                var bp = Math.min(1, boss.subT / 1.4);
                ctx.setLineDash([6, 6]);
                ctx.lineDashOffset = -t * 30;
                ctx.strokeStyle = 'rgba(170,102,255,0.85)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(boss.destX, boss.homeY, boss.r, 0, TAU);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.strokeStyle = '#d9b8ff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(boss.destX, boss.homeY, boss.r + 6, -Math.PI / 2, -Math.PI / 2 + bp * TAU);
                ctx.stroke();
            }
            if (boss && boss.phase === 'land') {
                var lp = Math.min(1, boss.subT / 0.6);
                ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 + 0.5 * lp) + ')';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(boss.x, boss.y, boss.r + 6 + lp * 18, 0, TAU);
                ctx.stroke();
            }
            ctx.restore();
        }

        function balloon(x, y, r, T, alpha, glow) {
            ctx.globalAlpha = alpha;
            if (glow) {
                ctx.globalCompositeOperation = pal.blend;
                var gg = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2);
                gg.addColorStop(0, rgba(T.hi, pal.light ? 0.25 : 0.35));
                gg.addColorStop(1, rgba(T.hi, 0));
                ctx.fillStyle = gg;
                ctx.beginPath();
                ctx.arc(x, y, r * 2, 0, TAU);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
            // string + knot
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y + r * 1.12);
            ctx.quadraticCurveTo(x + r * 0.3, y + r * 1.45, x - r * 0.1, y + r * 1.8);
            ctx.stroke();
            ctx.fillStyle = T.dark;
            ctx.beginPath();
            ctx.moveTo(x - r * 0.2, y + r * 1.2);
            ctx.lineTo(x + r * 0.2, y + r * 1.2);
            ctx.lineTo(x, y + r * 1.02);
            ctx.closePath();
            ctx.fill();
            // body
            var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.15);
            g.addColorStop(0, T.hi);
            g.addColorStop(0.55, T.body);
            g.addColorStop(1, T.dark);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(x, y, r, r * 1.1, 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = 1;
            ctx.stroke();
            // shine
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.ellipse(x - r * 0.38, y - r * 0.45, r * 0.22, r * 0.13, -0.7, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        function drawEnemy(e) {
            if (e.kind === 'gnat') {
                ctx.globalCompositeOperation = pal.blend;
                ctx.fillStyle = rgba('#aeea00', 0.28);
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r * 1.8, 0, TAU);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
                var g = ctx.createRadialGradient(e.x - 2, e.y - 2, 1, e.x, e.y, e.r);
                g.addColorStop(0, '#f4ffc0');
                g.addColorStop(1, '#7fb000');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.r * 0.85, 0, TAU);
                ctx.fill();
                // wings flick
                ctx.strokeStyle = 'rgba(230,255,138,0.7)';
                ctx.lineWidth = 1;
                var f = Math.sin(e.seed * 3) * 2;
                ctx.beginPath();
                ctx.moveTo(e.x - e.r * 0.6, e.y - 2);
                ctx.lineTo(e.x - e.r * 1.4, e.y - 4 - f);
                ctx.moveTo(e.x + e.r * 0.6, e.y - 2);
                ctx.lineTo(e.x + e.r * 1.4, e.y - 4 - f);
                ctx.stroke();
                return;
            }
            balloon(e.x, e.y, e.r, e.T, 1, true);
            if (e.kind === 'charger') {
                // a chevron on the body points where it will dash
                var a = e.phase === 'aim' || e.phase === 'dash' ? e.ang : Math.PI / 2;
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.rotate(a);
                ctx.fillStyle = 'rgba(30,24,80,0.85)';
                ctx.beginPath();
                ctx.moveTo(e.r * 0.6, 0);
                ctx.lineTo(-e.r * 0.25, -e.r * 0.42);
                ctx.lineTo(-e.r * 0.05, 0);
                ctx.lineTo(-e.r * 0.25, e.r * 0.42);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            } else if (e.kind === 'shotgun' || e.kind === 'shooter' || e.kind === 'stinger') {
                // the muzzle: a dark port that turns toward you on lock
                var m = e.wind >= 0 ? e.ang : Math.PI / 2;
                ctx.fillStyle = 'rgba(10,12,24,0.7)';
                ctx.beginPath();
                ctx.arc(e.x + Math.cos(m) * e.r * 0.45, e.y + Math.sin(m) * e.r * 0.45, e.kind === 'shotgun' ? 4 : 3, 0, TAU);
                ctx.fill();
            }
        }

        function drawBoss() {
            var b = boss;
            var a = b.alpha;
            if (b.phase === 'charge') a *= 0.65 + 0.35 * Math.abs(Math.sin(b.subT * 18));
            if (a <= 0.01) return;
            var resting = b.phase === 'rest';
            balloon(b.x, b.y, b.r, BOSS, a, true);
            ctx.globalAlpha = a;
            if (resting) {
                var pulse = 0.5 + 0.5 * Math.sin(b.subT * 6);
                ctx.fillStyle = 'rgba(91,255,143,' + (0.22 + 0.18 * pulse) + ')';
                ctx.beginPath();
                ctx.ellipse(b.x, b.y, b.r, b.r * 1.1, 0, 0, TAU);
                ctx.fill();
                ctx.strokeStyle = 'rgba(91,255,143,' + (0.5 + 0.4 * pulse) + ')';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r + 7, 0, TAU);
                ctx.stroke();
            }
            // angry eyes
            ctx.fillStyle = '#ffffff';
            [-1, 1].forEach(function (s) {
                ctx.beginPath();
                ctx.ellipse(b.x + s * b.r * 0.34, b.y - b.r * 0.06, b.r * 0.2, b.r * 0.13, s * 0.35, 0, TAU);
                ctx.fill();
            });
            ctx.fillStyle = '#1a0b2e';
            [-1, 1].forEach(function (s) {
                ctx.beginPath();
                ctx.arc(b.x + s * b.r * 0.3, b.y - b.r * 0.03, b.r * 0.07, 0, TAU);
                ctx.fill();
            });
            ctx.strokeStyle = '#1a0b2e';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(b.x - b.r * 0.58, b.y - b.r * 0.36);
            ctx.lineTo(b.x - b.r * 0.14, b.y - b.r * 0.2);
            ctx.moveTo(b.x + b.r * 0.58, b.y - b.r * 0.36);
            ctx.lineTo(b.x + b.r * 0.14, b.y - b.r * 0.2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(b.x - b.r * 0.3, b.y + b.r * 0.42);
            ctx.quadraticCurveTo(b.x, b.y + b.r * 0.25, b.x + b.r * 0.3, b.y + b.r * 0.42);
            ctx.stroke();
            // name tag, like the game's boss label
            ctx.font = '8px "Press Start 2P", ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = resting ? '#5bff8f' : 'rgba(255,255,255,0.9)';
            ctx.fillText(resting ? 'VULNERABLE' : 'REXYREX', b.x, b.y - b.r * 1.1 - 9);
            ctx.globalAlpha = 1;
        }

        function drawPlayer() {
            var p = player;
            var r = 10;
            ctx.save();
            ctx.translate(p.x, p.y);
            // locator ring
            ctx.strokeStyle = 'rgba(102,224,255,0.32)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(0, 0, 19, 0, TAU);
            ctx.stroke();
            ctx.rotate(-Math.PI / 2 + p.tilt);
            ctx.scale(r, r);
            ctx.globalCompositeOperation = pal.blend;
            ctx.fillStyle = 'rgba(102,224,255,0.2)';
            ctx.beginPath();
            ctx.arc(0, 0, 1.5, 0, TAU);
            ctx.fill();
            var fl = state === 'running' ? 0.75 + Math.random() * 0.4 : 0.9;
            ctx.save();
            ctx.translate(-0.45, 0);
            ctx.scale(fl, 1);
            ctx.fillStyle = 'rgba(102,224,255,0.65)';
            ctx.beginPath();
            ctx.moveTo(0, 0.34); ctx.lineTo(-1, 0); ctx.lineTo(0, -0.34); ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(234,251,255,0.6)';
            ctx.beginPath();
            ctx.moveTo(0, 0.18); ctx.lineTo(-0.62, 0); ctx.lineTo(0, -0.18); ctx.closePath();
            ctx.fill();
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
            // hull (player_ship_painter.dart geometry)
            ctx.beginPath();
            ctx.moveTo(1.55, 0); ctx.lineTo(-0.85, 1); ctx.lineTo(-0.45, 0); ctx.lineTo(-0.85, -1); ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineJoin = 'round';
            ctx.lineWidth = 0.16;
            ctx.strokeStyle = 'rgba(10,18,32,0.9)';
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(1.05, 0); ctx.lineTo(-0.28, 0.42); ctx.lineTo(-0.12, 0); ctx.lineTo(-0.28, -0.42); ctx.closePath();
            ctx.fillStyle = 'rgba(102,224,255,0.95)';
            ctx.fill();
            ctx.restore();
        }

        function drawBullet(b) {
            var s = sprite.size;
            var len = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
            var c = b.vx / len;
            var sn = b.vy / len;
            ctx.setTransform(sx * c, sy * sn, -sx * sn, sy * c, sx * b.x, sy * b.y);
            ctx.drawImage(sprite.c, -s / 2, -s / 2, s, s);
        }

        function drawBullets() {
            for (var k = 0; k < bullets.length; k++) drawBullet(bullets[k]);
            ctx.setTransform(sx, 0, 0, sy, 0, 0);
        }

        function drawPops() {
            for (var k = 0; k < pops.length; k++) {
                var p = pops[k];
                var q = p.t / p.dur;
                ctx.strokeStyle = rgba(p.color, (1 - q) * 0.8);
                ctx.lineWidth = p.ring ? 3 : 2;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r + (p.ring ? 40 : 10) * q, 0, TAU);
                ctx.stroke();
            }
        }

        function drawBanners() {
            if (!banners.length) return;
            var b = banners[banners.length - 1];
            var q = b.t / b.dur;
            var a = q < 0.15 ? q / 0.15 : q > 0.75 ? (1 - q) / 0.25 : 1;
            ctx.globalAlpha = Math.max(0, a);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = (b.boss ? '24px' : '30px') + ' Bungee, "Rubik", sans-serif';
            ctx.lineWidth = 5;
            ctx.strokeStyle = 'rgba(9,6,24,0.55)';
            ctx.strokeText(b.text, W / 2, H * 0.36);
            ctx.fillStyle = b.boss ? '#ff6573' : '#ffffff';
            ctx.fillText(b.text, W / 2, H * 0.36);
            ctx.globalAlpha = 1;
        }

        // The game's death cam, still: everything dims, the killer and
        // you get a ring each, and a line ties them together.
        function drawDeathCam() {
            ctx.fillStyle = 'rgba(6,3,16,0.5)';
            ctx.fillRect(0, 0, W, H);
            var k = killer;
            if (k.kind === 'enemy') drawEnemy(k.ref);
            else if (k.kind === 'boss') drawBoss();
            drawPlayer();
            if (k.kind === 'bullet') {
                drawBullet(k.ref);
                ctx.setTransform(sx, 0, 0, sy, 0, 0);
            }
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(k.x, k.y);
            ctx.lineTo(player.x, player.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = k.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(k.x, k.y, k.r + 6, 0, TAU);
            ctx.stroke();
            ctx.strokeStyle = '#66e0ff';
            ctx.beginPath();
            ctx.arc(player.x, player.y, 24, 0, TAU);
            ctx.stroke();
        }

        /* ----- loop + states ----- */

        function frame(now) {
            raf = 0;
            if (state !== 'running') return;
            var dt = (now - last) / 1000;
            last = now;
            if (dt > 0.1) dt = 0.1;
            if (dt < 0) dt = 0;
            var steps = Math.max(1, Math.ceil(dt / 0.02));
            var h = dt / steps;
            for (var k = 0; k < steps && state === 'running'; k++) update(h);
            draw();
            if (state === 'running') {
                if (now - hudAt > 60) { hudAt = now; elTime.textContent = fmt(t); }
                raf = window.requestAnimationFrame(frame);
            }
        }

        function startLoop() {
            if (raf) return;
            last = performance.now();
            raf = window.requestAnimationFrame(frame);
        }

        function stopLoop() {
            if (raf) window.cancelAnimationFrame(raf);
            raf = 0;
        }

        function show(name) {
            Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== name; });
        }

        function syncControls() {
            var running = state === 'running';
            cab.classList.toggle('is-running', running);
            btnPause.disabled = !(running || state === 'paused');
            btnPause.textContent = state === 'paused' ? 'Resume' : 'Pause';
            btnRestart.disabled = state === 'idle';
            screen.setAttribute('tabindex', running ? '0' : '-1');
        }

        function focusScreen() {
            try { screen.focus({ preventScroll: true }); } catch (e) { screen.focus(); }
        }

        function start() {
            stopLoop();
            reset();
            elWave.textContent = '1';
            elTime.textContent = fmt(0);
            state = 'running';
            show(null);
            syncControls();
            focusScreen();
            live('Run started. Dodge everything.');
            startLoop();
        }

        function pause() {
            if (state !== 'running') return;
            state = 'paused';
            stopLoop();
            keys = {};
            drag = null;
            show('paused');
            syncControls();
            if (cab.contains(doc.activeElement)) panels.paused.querySelector('button').focus({ preventScroll: true });
            live('Paused.');
        }

        function resume() {
            if (state !== 'paused') return;
            state = 'running';
            show(null);
            syncControls();
            focusScreen();
            live('Resumed.');
            startLoop();
        }

        function die(k) {
            state = 'over';
            killer = k;
            finalT = t;
            banners = [];
            stopLoop();
            var isBest = finalT > best;
            if (isBest) { best = finalT; writeBest(best); }
            elTime.textContent = fmt(finalT);
            elBest.textContent = best > 0 ? fmt(best) : '--.--';
            var title;
            var text;
            if (k.kind === 'bullet') {
                title = 'Shot down';
                text = (k.from === 'Rexyrex' ? 'Rexyrex' : 'A ' + k.from) + ' got you at ' + fmt(finalT) + '\u00a0s.';
            } else if (k.kind === 'boss') {
                title = 'Slain by Rexyrex';
                text = 'You lasted ' + fmt(finalT) + '\u00a0s.';
            } else {
                title = 'Rammed by a ' + k.from;
                text = 'You lasted ' + fmt(finalT) + '\u00a0s.';
            }
            elCause.textContent = title;
            elResult.textContent = text;
            elNewBest.hidden = !isBest;
            show('over');
            syncControls();
            if (cab.contains(doc.activeElement) || doc.activeElement === doc.body) {
                panels.over.querySelector('button').focus({ preventScroll: true });
            }
            live(title + '. ' + text + (isBest ? ' New best.' : ''));
        }

        /* ----- input ----- */

        var CODES = { KeyA: 'l', KeyD: 'r', KeyW: 'u', KeyS: 'd' };
        var ARROWS = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' };

        function dirOf(e) { return ARROWS[e.key] || CODES[e.code] || null; }

        function typingTarget(el) {
            if (!el) return false;
            var tag = el.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
        }

        doc.addEventListener('keydown', function (e) {
            if (state !== 'running' || e.altKey || e.ctrlKey || e.metaKey || typingTarget(e.target)) return;
            var d = dirOf(e);
            if (d) {
                keys[d] = true;
                e.preventDefault();
            } else if (e.code === 'KeyP' || e.key === 'Escape') {
                e.preventDefault();
                pause();
            } else if (e.key === ' ' && e.target === screen) {
                e.preventDefault();
            }
        });

        doc.addEventListener('keyup', function (e) {
            var d = dirOf(e);
            if (d) keys[d] = false;
        });

        cab.addEventListener('keydown', function (e) {
            if (state === 'paused' && e.code === 'KeyP') { e.preventDefault(); resume(); }
        });

        function toWorld(e) {
            var rect = canvas.getBoundingClientRect();
            return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
        }

        screen.addEventListener('pointerdown', function (e) {
            if (state !== 'running' || (e.target.closest && e.target.closest('button'))) return;
            if (e.pointerType === 'mouse') { mouse = toWorld(e); return; }
            // Touch and pen move the ship relative to the finger, so the
            // finger can sit anywhere and the ship stays in view.
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
            try { screen.setPointerCapture(e.pointerId); } catch (err) { /* older engines */ }
            e.preventDefault();
        });

        screen.addEventListener('pointermove', function (e) {
            if (state !== 'running') return;
            if (e.pointerType === 'mouse') { mouse = toWorld(e); return; }
            if (!drag || e.pointerId !== drag.id) return;
            var rect = canvas.getBoundingClientRect();
            var k = W / rect.width;
            dragDX += (e.clientX - drag.x) * k;
            dragDY += (e.clientY - drag.y) * k;
            drag.x = e.clientX;
            drag.y = e.clientY;
        });

        function endDrag(e) {
            if (drag && e.pointerId === drag.id) drag = null;
        }
        screen.addEventListener('pointerup', endDrag);
        screen.addEventListener('pointercancel', endDrag);

        cab.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-act]') : null;
            if (!b || b.disabled) return;
            var act = b.getAttribute('data-act');
            if (act === 'start' || act === 'restart') start();
            else if (act === 'resume') resume();
            else if (act === 'pause') { if (state === 'paused') resume(); else pause(); }
        });

        // Pause whenever the screen is out of sight or attention moves on.
        doc.addEventListener('visibilitychange', function () { if (doc.hidden) pause(); });
        window.addEventListener('blur', function () { pause(); });
        window.addEventListener('pagehide', function () { pause(); });
        doc.addEventListener('focusin', function (e) {
            if (state === 'running' && !cab.contains(e.target)) pause();
        });
        if (hasIO) {
            new IntersectionObserver(function (entries) {
                var en = entries[entries.length - 1];
                if (!en.isIntersecting || en.intersectionRatio < 0.3) pause();
            }, { threshold: [0, 0.3, 0.6] }).observe(screen);
        }

        // Theme follows the site toggle and the system setting.
        function retheme() {
            palette();
            if (state !== 'running') draw();
        }
        doc.addEventListener('rex:theme', retheme);
        onMediaChange(mqLight, retheme);

        if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
        else window.addEventListener('resize', resize);

        /* ----- first frame ----- */

        elBest.textContent = best > 0 ? fmt(best) : '--.--';
        palette();
        demo();
        resize();
        draw();
        syncControls();
        if (doc.fonts && doc.fonts.load) {
            doc.fonts.load('8px "Press Start 2P"').then(function () { if (state !== 'running') draw(); }, function () {});
        }
    })();
})();
