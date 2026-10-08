/* QR Scanner landing page (/apps/qr_scanner/). Dependency-free.

   - A QR encoder written for this page (byte / numeric / alphanumeric modes,
     versions 1–40, all four error-correction levels, mask scoring).
   - The live generator: the app's nine templates, eight colors, error
     correction, shape and file format; downloads the same export the app
     saves (1024 px symbol + quiet zone, PNG or JPG).
   - The hero viewfinder: its CSS loop paused while off screen.
   - Section tabs that follow the scroll, and the History screen switcher.
   Nothing here talks to the network. */
(function () {
    'use strict';

/* QR:BEGIN */
    /* ---- QR Code encoder (ISO/IEC 18004, model 2) ------------------------
       Versions 1–40, levels L/M/Q/H, numeric / alphanumeric / byte (UTF-8)
       modes, Reed–Solomon over GF(256), all eight masks scored by the four
       penalty rules. Like the app (qr_flutter, QrVersions.auto) it picks the
       smallest version that fits at the chosen level and never raises the
       level on its own. */
    var QR = (function () {
        var ECC_PER_BLOCK = [
            [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
            [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
            [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
            [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
        ];
        var NUM_BLOCKS = [
            [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
            [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
            [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
            [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
        ];
        // index = level (0 L, 1 M, 2 Q, 3 H); value = the 2-bit format code
        var FORMAT_BITS = [1, 0, 3, 2];
        var ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

        function rawDataModules(ver) {
            var r = (16 * ver + 128) * ver + 64;
            if (ver >= 2) {
                var n = Math.floor(ver / 7) + 2;
                r -= (25 * n - 10) * n - 55;
                if (ver >= 7) r -= 36;
            }
            return r;
        }

        function dataCodewords(ver, ecl) {
            return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
        }

        function gfMul(x, y) {
            var z = 0;
            for (var i = 7; i >= 0; i--) {
                z = (z << 1) ^ ((z >>> 7) * 0x11d);
                z ^= ((y >>> i) & 1) * x;
            }
            return z;
        }

        function rsDivisor(degree) {
            var res = [];
            for (var i = 0; i < degree - 1; i++) res.push(0);
            res.push(1);
            var root = 1;
            for (i = 0; i < degree; i++) {
                for (var j = 0; j < res.length; j++) {
                    res[j] = gfMul(res[j], root);
                    if (j + 1 < res.length) res[j] ^= res[j + 1];
                }
                root = gfMul(root, 0x02);
            }
            return res;
        }

        function rsRemainder(data, divisor) {
            var res = divisor.map(function () { return 0; });
            data.forEach(function (b) {
                var factor = b ^ res.shift();
                res.push(0);
                divisor.forEach(function (coef, i) { res[i] ^= gfMul(coef, factor); });
            });
            return res;
        }

        function utf8(text) {
            if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
            return Array.from(unescape(encodeURIComponent(text)), function (c) { return c.charCodeAt(0); });
        }

        // One segment in the most compact mode that holds the whole string.
        function segment(text) {
            var bits = [];
            var push = function (val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
            var i;
            if (/^[0-9]*$/.test(text)) {
                for (i = 0; i < text.length; i += 3) {
                    var chunk = text.substr(i, 3);
                    push(parseInt(chunk, 10), chunk.length * 3 + 1);
                }
                return { mode: 0x1, cc: [10, 12, 14], count: text.length, bits: bits };
            }
            if (/^[0-9A-Z $%*+\-.\/:]*$/.test(text)) {
                for (i = 0; i + 2 <= text.length; i += 2) push(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
                if (i < text.length) push(ALNUM.indexOf(text[i]), 6);
                return { mode: 0x2, cc: [9, 11, 13], count: text.length, bits: bits };
            }
            var bytes = utf8(text);
            bytes.forEach(function (b) { push(b, 8); });
            return { mode: 0x4, cc: [8, 16, 16], count: bytes.length, bits: bits };
        }

        function ccBits(seg, ver) { return seg.cc[ver <= 9 ? 0 : ver <= 26 ? 1 : 2]; }

        // Smallest version that fits, or 0 when nothing does.
        function fitVersion(seg, ecl) {
            for (var v = 1; v <= 40; v++) {
                var cc = ccBits(seg, v);
                if (seg.count >= (1 << cc)) continue;
                if (4 + cc + seg.bits.length <= dataCodewords(v, ecl) * 8) return v;
            }
            return 0;
        }

        function encode(text, ecl) {
            var seg = segment(text);
            var ver = fitVersion(seg, ecl);
            if (!ver) return null;

            // ---- data codewords
            var cap = dataCodewords(ver, ecl) * 8;
            var bb = [];
            var push = function (val, len) { for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); };
            push(seg.mode, 4);
            push(seg.count, ccBits(seg, ver));
            bb = bb.concat(seg.bits);
            push(0, Math.min(4, cap - bb.length));
            push(0, (8 - bb.length % 8) % 8);
            for (var pad = 0xec; bb.length < cap; pad ^= 0xec ^ 0x11) push(pad, 8);
            var data = [];
            for (var i = 0; i < bb.length; i += 8) {
                var byte = 0;
                for (var j = 0; j < 8; j++) byte = (byte << 1) | bb[i + j];
                data.push(byte);
            }

            // ---- error correction + interleaving
            var nBlocks = NUM_BLOCKS[ecl][ver];
            var eccLen = ECC_PER_BLOCK[ecl][ver];
            var raw = Math.floor(rawDataModules(ver) / 8);
            var nShort = nBlocks - raw % nBlocks;
            var shortLen = Math.floor(raw / nBlocks);
            var div = rsDivisor(eccLen);
            var blocks = [];
            for (i = 0, j = 0; i < nBlocks; i++) {
                var dat = data.slice(j, j + shortLen - eccLen + (i < nShort ? 0 : 1));
                j += dat.length;
                var ecc = rsRemainder(dat, div);
                if (i < nShort) dat.push(0);
                blocks.push(dat.concat(ecc));
            }
            var words = [];
            for (i = 0; i < blocks[0].length; i++) {
                for (j = 0; j < blocks.length; j++) {
                    if (i !== shortLen - eccLen || j >= nShort) words.push(blocks[j][i]);
                }
            }

            // ---- matrix
            var size = ver * 4 + 17;
            var mod = [], fn = [];
            for (i = 0; i < size; i++) {
                mod.push(new Array(size).fill(false));
                fn.push(new Array(size).fill(false));
            }
            var set = function (x, y, dark) { mod[y][x] = dark; fn[y][x] = true; };

            for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
            var finder = function (cx, cy) {
                for (var dy = -4; dy <= 4; dy++) {
                    for (var dx = -4; dx <= 4; dx++) {
                        var d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
                        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
                    }
                }
            };
            finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

            var align = [];
            if (ver > 1) {
                var nAlign = Math.floor(ver / 7) + 2;
                var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (nAlign * 2 - 2)) * 2;
                align = [6];
                for (var pos = size - 7; align.length < nAlign; pos -= step) align.splice(1, 0, pos);
            }
            var last = align.length - 1;
            align.forEach(function (ay, a) {
                align.forEach(function (ax, b) {
                    if ((a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0)) return;
                    for (var dy = -2; dy <= 2; dy++) {
                        for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
                    }
                });
            });

            var drawFormat = function (mask) {
                var d = FORMAT_BITS[ecl] << 3 | mask, rem = d;
                for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
                var bits = (d << 10 | rem) ^ 0x5412;
                var bit = function (n) { return ((bits >>> n) & 1) !== 0; };
                for (k = 0; k <= 5; k++) set(8, k, bit(k));
                set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
                for (k = 9; k < 15; k++) set(14 - k, 8, bit(k));
                for (k = 0; k < 8; k++) set(size - 1 - k, 8, bit(k));
                for (k = 8; k < 15; k++) set(8, size - 15 + k, bit(k));
                set(8, size - 8, true);
            };
            drawFormat(0);

            if (ver >= 7) {
                var rem = ver;
                for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
                var vbits = ver << 12 | rem;
                for (i = 0; i < 18; i++) {
                    var vb = ((vbits >>> i) & 1) !== 0, a2 = size - 11 + i % 3, b2 = Math.floor(i / 3);
                    set(a2, b2, vb); set(b2, a2, vb);
                }
            }

            // zigzag placement
            var n = 0, total = words.length * 8;
            for (var right = size - 1; right >= 1; right -= 2) {
                if (right === 6) right = 5;
                for (var vert = 0; vert < size; vert++) {
                    for (j = 0; j < 2; j++) {
                        var x = right - j;
                        var up = ((right + 1) & 2) === 0;
                        var y = up ? size - 1 - vert : vert;
                        if (!fn[y][x] && n < total) {
                            mod[y][x] = ((words[n >>> 3] >>> (7 - (n & 7))) & 1) !== 0;
                            n++;
                        }
                    }
                }
            }

            var maskFn = [
                function (x, y) { return (x + y) % 2 === 0; },
                function (x, y) { return y % 2 === 0; },
                function (x) { return x % 3 === 0; },
                function (x, y) { return (x + y) % 3 === 0; },
                function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
                function (x, y) { return x * y % 2 + x * y % 3 === 0; },
                function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
                function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
            ];
            var applyMask = function (m) {
                for (var y = 0; y < size; y++) {
                    for (var x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x];
                }
            };

            var P3A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], P3B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
            var penalty = function () {
                var score = 0, dark = 0, x, y, k;
                var line = function (get) {
                    var s = 0, run = 1;
                    for (var k2 = 1; k2 <= size; k2++) {
                        if (k2 < size && get(k2) === get(k2 - 1)) { run++; continue; }
                        if (run >= 5) s += 3 + run - 5;
                        run = 1;
                    }
                    for (k2 = 0; k2 + 11 <= size; k2++) {
                        var a = true, b = true;
                        for (var t = 0; t < 11; t++) {
                            var v = get(k2 + t) ? 1 : 0;
                            if (v !== P3A[t]) a = false;
                            if (v !== P3B[t]) b = false;
                        }
                        if (a) s += 40;
                        if (b) s += 40;
                    }
                    return s;
                };
                for (y = 0; y < size; y++) score += line(function (k) { return mod[y][k]; });
                for (x = 0; x < size; x++) score += line(function (k) { return mod[k][x]; });
                for (y = 0; y < size - 1; y++) {
                    for (x = 0; x < size - 1; x++) {
                        var c = mod[y][x];
                        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3;
                    }
                }
                for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
                var all = size * size;
                k = Math.ceil(Math.abs(dark * 20 - all * 10) / all) - 1;
                return score + k * 10;
            };

            var best = 0, bestScore = Infinity;
            for (var m = 0; m < 8; m++) {
                applyMask(m);
                drawFormat(m);
                var sc = penalty();
                if (sc < bestScore) { best = m; bestScore = sc; }
                applyMask(m);
            }
            applyMask(best);
            drawFormat(best);

            return { version: ver, size: size, mask: best, modules: mod, mode: seg.mode, bytes: seg.count };
        }

        return { encode: encode, dataCodewords: dataCodewords };
    })();
/* QR:END */

    /* QR:RENDER:BEGIN */
    /* ---- Rendering -------------------------------------------------------
       Mirrors the app's two module styles (qr_flutter): "square" = square
       modules and eyes; "rounded" = dot modules and ring-and-dot eyes. Both
       sit on white with a four-module quiet zone, as the app exports them. */
    var QUIET = 4;

    function inEye(x, y, n) {
        return (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    }

    function eyes(n) { return [[0, 0], [n - 7, 0], [0, n - 7]]; }

    function svgMarkup(code, color, shape, label) {
        var n = code.size, dim = n + QUIET * 2, d = '', x, y;
        if (shape === 'rounded') {
            for (y = 0; y < n; y++) {
                for (x = 0; x < n; x++) {
                    if (code.modules[y][x] && !inEye(x, y, n)) d += 'M' + (x + QUIET) + ' ' + (y + QUIET + 0.5) + 'a.5 .5 0 1 0 1 0a.5 .5 0 1 0-1 0';
                }
            }
        } else {
            for (y = 0; y < n; y++) {
                for (x = 0; x < n; x++) {
                    if (!code.modules[y][x]) continue;
                    var run = 1;
                    while (x + run < n && code.modules[y][x + run]) run++;
                    d += 'M' + (x + QUIET) + ' ' + (y + QUIET) + 'h' + run + 'v1h-' + run + 'z';
                    x += run - 1;
                }
            }
        }
        var eyeMarkup = '';
        if (shape === 'rounded') {
            eyes(n).forEach(function (e) {
                var cx = e[0] + QUIET + 3.5, cy = e[1] + QUIET + 3.5;
                eyeMarkup += '<circle cx="' + cx + '" cy="' + cy + '" r="3" fill="none" stroke="' + color + '" stroke-width="1"/>' +
                    '<circle cx="' + cx + '" cy="' + cy + '" r="1.5" fill="' + color + '"/>';
            });
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" role="img" aria-label="' + label + '"' +
            (shape === 'rounded' ? '' : ' shape-rendering="crispEdges"') + '>' +
            '<rect width="' + dim + '" height="' + dim + '" fill="#fff"/>' +
            '<path fill="' + color + '" d="' + d + '"/>' + eyeMarkup + '</svg>';
    }

    // The export the app makes: a `size`-pixel symbol plus a quiet zone of
    // ceil(size / modules × 4) pixels on every side, on solid white.
    function drawCanvas(code, color, shape, size) {
        var n = code.size, s = size / n, q = Math.ceil(s * QUIET), full = size + q * 2;
        var cv = document.createElement('canvas');
        cv.width = cv.height = full;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, full, full);
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        var px = function (i) { return Math.round(q + i * s); };
        for (var y = 0; y < n; y++) {
            for (var x = 0; x < n; x++) {
                if (!code.modules[y][x]) continue;
                if (shape === 'rounded') {
                    if (inEye(x, y, n)) continue;
                    ctx.beginPath();
                    ctx.arc(q + (x + 0.5) * s, q + (y + 0.5) * s, s / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(px(x), px(y), px(x + 1) - px(x), px(y + 1) - px(y));
                }
            }
        }
        if (shape === 'rounded') {
            eyes(n).forEach(function (e) {
                var cx = q + (e[0] + 3.5) * s, cy = q + (e[1] + 3.5) * s;
                ctx.lineWidth = s;
                ctx.beginPath();
                ctx.arc(cx, cy, 3 * s, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx, cy, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        return cv;
    }
    /* QR:RENDER:END */

    // Exposed for checking the encoder from the console (and the page's own
    // decode test); nothing else reads it.
    window.qrScannerPage = { QR: QR, svgMarkup: svgMarkup, drawCanvas: drawCanvas };

    var doc = document;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ---- Hero viewfinder ------------------------------------------------- */
    // The lock-on moment itself is CSS (it plays without JS too); this only
    // pauses the scan line and the pulse while the hero is off screen or the
    // tab is hidden.
    function initViewfinder() {
        var vf = doc.querySelector('.vf');
        if (!vf || !('IntersectionObserver' in window)) return;
        var visible = true;
        var sync = function () { vf.classList.toggle('is-paused', !visible || doc.hidden); };
        new IntersectionObserver(function (entries) {
            visible = entries[0].isIntersecting;
            sync();
        }).observe(vf);
        doc.addEventListener('visibilitychange', sync);
    }

    /* ---- Section tabs (mirror the app's bottom bar) ---------------------- */
    // The tab whose section crosses the upper third of the screen is current;
    // above Scan or below Generate, none is.
    function initTabs() {
        var tabs = Array.prototype.slice.call(doc.querySelectorAll('.tabs a[href^="#"]'));
        var marks = ['scan', 'history', 'generate', 'privacy'].map(function (id) { return doc.getElementById(id); });
        if (!tabs.length || marks.indexOf(null) !== -1) return;
        var current, queued = false;
        var update = function () {
            queued = false;
            var line = window.innerHeight * 0.35, id = null;
            marks.forEach(function (el) { if (el.getBoundingClientRect().top <= line) id = el.id; });
            if (id === 'privacy') id = null;
            if (id === current) return;
            current = id;
            tabs.forEach(function (a) {
                if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true');
                else a.removeAttribute('aria-current');
            });
        };
        var queue = function () { if (!queued) { queued = true; requestAnimationFrame(update); } };
        window.addEventListener('scroll', queue, { passive: true });
        window.addEventListener('resize', queue);
        update();
    }

    /* ---- History screen switcher ----------------------------------------- */
    function initHistory() {
        var group = doc.querySelector('.hist-demo');
        var img = doc.getElementById('hist-img');
        var cap = doc.getElementById('hist-cap');
        if (!group || !img || !cap) return;
        var buttons = Array.prototype.slice.call(group.querySelectorAll('button'));
        buttons.forEach(function (b) {
            // warm the cache so the swap is instant
            var pre = function () { if (!b._pre) { b._pre = new Image(); b._pre.src = b.dataset.src; } };
            b.addEventListener('pointerenter', pre);
            b.addEventListener('focus', pre);
            b.addEventListener('click', function () {
                buttons.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
                img.src = b.dataset.src;
                img.alt = b.dataset.alt;
                cap.textContent = b.dataset.cap;
            });
        });
    }

    /* ---- Generator -------------------------------------------------------- */
    // The app's templates (lib/features/generator/data/qr_template.dart),
    // fields, hints and encoders, one for one. `ask` only rewords the
    // "Enter … to generate" hint where the field label reads oddly in it.
    var esc = function (s) { return s.replace(/([\;,":])/g, '\\$1'); };
    var val = function (v, k) { return (v[k] || '').trim(); };
    var dartDouble = function (s) {
        if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
        var n = Number(s);
        if (!isFinite(n)) return null;
        var t = String(n);
        return Number.isInteger(n) && Math.abs(n) < 1e21 ? t + '.0' : t;
    };
    var TEMPLATES = [
        { id: 'text', name: 'Text', icon: 'text',
            fields: [{ key: 'text', label: 'Text', hint: 'Any text or JSON', multiline: true, required: true }],
            encode: function (v) { return val(v, 'text'); } },
        { id: 'url', name: 'Link', icon: 'link',
            fields: [{ key: 'url', label: 'URL', hint: 'example.com', required: true, mode: 'url' }],
            encode: function (v) {
                var u = val(v, 'url');
                if (!u) return '';
                return /^[a-z][a-z0-9+.\-]*:\/\//i.test(u) ? u : 'https://' + u;
            } },
        { id: 'contact', name: 'Contact', icon: 'contact',
            fields: [
                { key: 'name', label: 'Name', required: true },
                { key: 'phone', label: 'Phone', mode: 'tel' },
                { key: 'email', label: 'Email', mode: 'email' },
                { key: 'org', label: 'Company' },
                { key: 'url', label: 'Website', mode: 'url' }
            ],
            encode: function (v) {
                var name = esc(val(v, 'name'));
                if (!name) return '';
                var out = 'MECARD:N:' + name + ';';
                [['phone', 'TEL'], ['email', 'EMAIL'], ['org', 'ORG'], ['url', 'URL']].forEach(function (p) {
                    var x = esc(val(v, p[0]));
                    if (x) out += p[1] + ':' + x + ';';
                });
                return out + ';';
            } },
        { id: 'phone', name: 'Phone', icon: 'phone',
            fields: [{ key: 'phone', label: 'Phone number', hint: '+1 555 123 4567', required: true, mode: 'tel' }],
            encode: function (v) { var p = val(v, 'phone'); return p ? 'tel:' + p : ''; } },
        { id: 'sms', name: 'SMS', icon: 'sms',
            fields: [
                { key: 'phone', label: 'Phone number', required: true, mode: 'tel' },
                { key: 'message', label: 'Message', multiline: true }
            ],
            encode: function (v) {
                var p = val(v, 'phone');
                if (!p) return '';
                var m = val(v, 'message');
                return m ? 'SMSTO:' + p + ':' + m : 'SMSTO:' + p;
            } },
        { id: 'whatsapp', name: 'WhatsApp', icon: 'chat',
            fields: [
                { key: 'phone', label: 'Phone (with country code)', ask: 'phone number', hint: '15551234567', required: true, mode: 'tel' },
                { key: 'message', label: 'Pre-filled message', multiline: true }
            ],
            encode: function (v) {
                var digits = val(v, 'phone').replace(/[^0-9]/g, '');
                if (!digits) return '';
                var m = val(v, 'message');
                return 'https://wa.me/' + digits + (m ? '?text=' + encodeURIComponent(m) : '');
            } },
        { id: 'geo', name: 'Location', icon: 'pin',
            fields: [
                { key: 'lat', label: 'Latitude', hint: '37.4220', required: true, mode: 'decimal' },
                { key: 'lng', label: 'Longitude', hint: '-122.0841', required: true, mode: 'decimal' }
            ],
            encode: function (v) {
                var lat = dartDouble(val(v, 'lat')), lng = dartDouble(val(v, 'lng'));
                return lat === null || lng === null ? '' : 'geo:' + lat + ',' + lng;
            } },
        { id: 'wifi', name: 'Wi-Fi', icon: 'wifi',
            fields: [
                { key: 'ssid', label: 'Network name (SSID)', ask: 'network name', required: true },
                { key: 'password', label: 'Password', obscure: true }
            ],
            encode: function (v) {
                var ssid = esc(val(v, 'ssid'));
                if (!ssid) return '';
                var pw = esc(val(v, 'password'));
                return 'WIFI:T:' + (pw ? 'WPA' : 'nopass') + ';S:' + ssid + ';P:' + pw + ';;';
            } },
        { id: 'email', name: 'Email', icon: 'email',
            fields: [
                { key: 'email', label: 'To', ask: 'an email address', required: true, mode: 'email' },
                { key: 'subject', label: 'Subject' },
                { key: 'body', label: 'Body', multiline: true }
            ],
            encode: function (v) {
                var to = val(v, 'email');
                if (!to) return '';
                var q = [], s = val(v, 'subject'), b = val(v, 'body');
                if (s) q.push('subject=' + encodeURIComponent(s));
                if (b) q.push('body=' + encodeURIComponent(b));
                return 'mailto:' + to + (q.length ? '?' + q.join('&') : '');
            } }
    ];

    // lib/features/generator/data/qr_style.dart
    var COLORS = [
        ['Ink', '#14171F'], ['Indigo', '#4433E0'], ['Teal', '#0B6E73'], ['Forest', '#1F6E3A'],
        ['Crimson', '#A82348'], ['Plum', '#6A1B9A'], ['Navy', '#14227A'], ['Slate', '#334155']
    ];
    var LEVELS = [['Low', 'Smallest code'], ['Medium', 'Recommended'], ['Quartile', 'More durable'], ['High', 'Survives damage']];
    // Below this ratio against the white background a phone camera starts to
    // struggle; the generator refuses to export rather than hand over a code
    // that may not scan. (Every preset clears it comfortably.)
    var MIN_CONTRAST = 4.5;

    function luminance(hex) {
        var c = [1, 3, 5].map(function (i) {
            var v = parseInt(hex.substr(i, 2), 16) / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    function contrastOnWhite(hex) { return 1.05 / (luminance(hex) + 0.05); }

    function initGenerator() {
        var gen = doc.getElementById('gen');
        if (!gen) return;
        var form = gen.querySelector('.gen-form');
        var fieldsEl = gen.querySelector('.gen-fields');
        var fieldsTitle = gen.querySelector('.gen-fields-title');
        var qrEl = gen.querySelector('.gen-qr');
        var statusEl = gen.querySelector('.gen-status');
        var statusText = statusEl.querySelector('span');
        var statusUse = statusEl.querySelector('use');
        var blurbEl = gen.querySelector('.gen-blurb');
        var summaryEl = gen.querySelector('.gen-summary');
        var metaVer = gen.querySelector('[data-meta="version"]');
        var metaMod = gen.querySelector('[data-meta="modules"]');
        var metaCon = gen.querySelector('[data-meta="contrast"]');
        var dlBtn = gen.querySelector('.gen-download');
        var dlLabel = dlBtn.querySelector('span');
        var copyBtn = gen.querySelector('.gen-copy');
        var toast = gen.querySelector('.gen-toast');
        var clearBtn = gen.querySelector('.gen-clear');

        var state = {
            t: 1,
            values: { url: { url: 'rexyrex.github.io/apps/qr_scanner/' } },
            color: 0, level: 1, shape: 'square', format: 'png'
        };
        // Pick up whatever the static markup has checked (and anything the
        // browser restored on back/forward).
        var checked = function (name) { var el = form.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : null; };
        var t0 = checked('qr-type');
        if (t0 !== null) state.t = TEMPLATES.findIndex(function (t) { return t.id === t0; });
        state.color = +(checked('qr-color') || 0);
        state.level = +(checked('qr-level') || 1);
        state.shape = checked('qr-shape') || 'square';
        state.format = checked('qr-format') || 'png';

        var current = null; // { payload, code }
        var toastTimer = 0;
        var say = function (msg) {
            toast.textContent = msg;
            toast.classList.add('is-on');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2600);
        };

        function renderFields() {
            var tpl = TEMPLATES[state.t];
            var vals = state.values[tpl.id] || (state.values[tpl.id] = {});
            fieldsTitle.textContent = tpl.name + ' details';
            fieldsEl.textContent = '';
            tpl.fields.forEach(function (f) {
                var id = 'qr-f-' + tpl.id + '-' + f.key;
                var wrap = doc.createElement('div');
                wrap.className = 'field';
                var label = doc.createElement('label');
                label.htmlFor = id;
                label.textContent = f.label + (f.required ? ' *' : '');
                var input = doc.createElement(f.multiline ? 'textarea' : 'input');
                input.id = id;
                input.name = f.key;
                if (f.multiline) input.rows = 3;
                else input.type = f.obscure ? 'password' : 'text';
                if (f.obscure) input.autocomplete = 'new-password';
                else input.autocomplete = 'off';
                if (f.mode) input.inputMode = f.mode;
                if (f.mode === 'url' || f.mode === 'email' || f.obscure) {
                    input.autocapitalize = 'off';
                    input.spellcheck = false;
                }
                if (f.required) input.setAttribute('aria-required', 'true');
                if (f.hint) input.placeholder = f.hint;
                input.value = vals[f.key] || '';
                input.addEventListener('input', function () {
                    vals[f.key] = input.value;
                    schedule();
                });
                wrap.appendChild(label);
                wrap.appendChild(input);
                fieldsEl.appendChild(wrap);
            });
        }

        var raf = 0;
        function schedule() {
            if (raf) return;
            raf = requestAnimationFrame(function () { raf = 0; update(); });
        }

        function update() {
            var tpl = TEMPLATES[state.t];
            var vals = state.values[tpl.id] || {};
            var payload = tpl.encode(vals);
            var color = COLORS[state.color][1];
            var ratio = contrastOnWhite(color);
            var code = payload ? QR.encode(payload, state.level) : null;
            var tooLong = !!payload && !code;
            var lowContrast = ratio < MIN_CONTRAST;

            // the app's status line (_StatusHint)
            var icon, text, tone;
            if (tooLong) { icon = 'error'; tone = 'error'; text = 'Too much content · ' + payload.length + ' characters'; }
            else if (payload && lowContrast) { icon = 'error'; tone = 'error'; text = 'This color is too light to scan reliably'; }
            else if (payload) { icon = 'check'; tone = 'ready'; text = 'Ready · ' + payload.length + ' characters'; }
            else {
                var miss = null;
                tpl.fields.some(function (f) { if (f.required && !val(vals, f.key)) { miss = f.ask || f.label; return true; } return false; });
                icon = 'edit'; tone = 'idle';
                text = miss ? 'Enter ' + miss.toLowerCase() + ' to generate' : 'Fill in the details to generate';
            }
            statusEl.dataset.tone = tone;
            statusText.textContent = text;
            statusUse.setAttribute('href', '#i-' + icon);

            if (code) {
                qrEl.innerHTML = svgMarkup(code, color, state.shape, 'QR code for: ' + payload.replace(/"/g, '&quot;').replace(/</g, '&lt;'));
                metaVer.textContent = String(code.version);
                metaMod.textContent = code.size + ' × ' + code.size;
            } else {
                qrEl.innerHTML = '<p class="gen-empty">' + (tooLong ? 'Too much content to fit in one QR code.' : 'Fill in the fields to preview your QR code') + '</p>';
                metaVer.textContent = '–';
                metaMod.textContent = '–';
            }
            metaCon.textContent = ratio.toFixed(1) + ' : 1';
            gen.classList.toggle('is-empty', !code);

            current = code && !lowContrast ? { payload: payload, code: code } : null;
            dlBtn.disabled = !current;
            copyBtn.disabled = !payload || tooLong;
            dlLabel.textContent = 'Download ' + state.format.toUpperCase();
            blurbEl.textContent = LEVELS[state.level][1];
            summaryEl.textContent = COLORS[state.color][0] + ' · ' + LEVELS[state.level][0] + ' · ' +
                (state.shape === 'rounded' ? 'Rounded' : 'Square') + ' · ' + state.format.toUpperCase();
            clearBtn.disabled = !Object.keys(vals).some(function (k) { return vals[k]; });
        }

        form.addEventListener('submit', function (e) { e.preventDefault(); });
        form.addEventListener('change', function (e) {
            var el = e.target;
            if (el.name === 'qr-type') {
                state.t = TEMPLATES.findIndex(function (t) { return t.id === el.value; });
                renderFields();
            } else if (el.name === 'qr-color') state.color = +el.value;
            else if (el.name === 'qr-level') state.level = +el.value;
            else if (el.name === 'qr-shape') state.shape = el.value;
            else if (el.name === 'qr-format') state.format = el.value;
            else return;
            update();
        });

        clearBtn.addEventListener('click', function () {
            state.values[TEMPLATES[state.t].id] = {};
            renderFields();
            update();
            var first = fieldsEl.querySelector('input, textarea');
            if (first) first.focus();
        });

        dlBtn.addEventListener('click', function () {
            if (!current) return;
            var color = COLORS[state.color][1];
            var cv = drawCanvas(current.code, color, state.shape, 1024);
            var type = state.format === 'jpg' ? 'image/jpeg' : 'image/png';
            var name = 'qr-' + TEMPLATES[state.t].id + '.' + state.format;
            cv.toBlob(function (blob) {
                if (!blob) { say('Could not create the image'); return; }
                var url = URL.createObjectURL(blob);
                var a = doc.createElement('a');
                a.href = url;
                a.download = name;
                doc.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
                say('Downloaded ' + name);
            }, type, 0.95);
        });

        copyBtn.addEventListener('click', function () {
            var tpl = TEMPLATES[state.t];
            var payload = tpl.encode(state.values[tpl.id] || {});
            if (!payload) return;
            var done = function () { say('Copied QR content'); };
            var legacy = function () {
                var ta = doc.createElement('textarea');
                ta.value = payload;
                ta.setAttribute('readonly', '');
                ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
                doc.body.appendChild(ta);
                ta.select();
                var ok = false;
                try { ok = doc.execCommand('copy'); } catch (err) { ok = false; }
                ta.remove();
                copyBtn.focus();
                if (ok) done();
                else say('Could not copy. Your browser blocked the clipboard.');
            };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(payload).then(done, legacy);
            else legacy();
        });

        // Arrow keys along the type strip keep the chosen card in view.
        gen.querySelector('.gen-types').addEventListener('focusin', function (e) {
            var card = e.target.closest('label, .type');
            if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });

        renderFields();
        update();
        gen.classList.add('is-live');
    }

    initViewfinder();
    initTabs();
    initHistory();
    initGenerator();
})();
