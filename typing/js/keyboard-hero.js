/* Typing page landing: a keyboard that types on its own.
   Draws a two-layout keyboard (QWERTY + 두벌식 Hangul labels), then types
   sample sentences key by key — Hangul syllables are decomposed into the
   jamo keystrokes a real typist would press, so the right keys light up.
   Real key presses light the keys too while the landing is on screen.
   Dependency-free; runs only while #heroDemo is visible (the game hides
   the hero section when a round starts) and pauses in background tabs. */
(function () {
    'use strict';

    var root = document.getElementById('heroDemo');
    var kb = document.getElementById('demoKeyboard');
    var typed = document.getElementById('demoTyped');
    var rest = document.getElementById('demoRest');
    var modeEl = document.getElementById('demoMode');
    var scoreEl = document.getElementById('demoScore');
    if (!root || !kb || !typed || !rest) return;

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- Layout ------------------------------------------- */

    var HANGUL = {
        q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
        a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
        z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ'
    };

    var ROWS = [
        ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', { k: 'Backspace', w: 2, label: '⌫' }],
        [{ k: 'Tab', w: 1.5, label: 'tab' }, 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', { k: '\\', w: 1.5, label: '\\' }],
        [{ k: 'CapsLock', w: 1.85, label: 'caps' }, 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", { k: 'Enter', w: 2.15, label: 'enter' }],
        [{ k: 'Shift', w: 2.4, label: 'shift' }, 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', { k: 'RShift', w: 2.6, label: 'shift' }],
        [{ k: 'Control', w: 1.4, label: 'ctrl' }, { k: 'Alt', w: 1.4, label: 'alt' }, { k: 'HangulMode', w: 1.5, label: '한/영' }, { k: ' ', w: 6.2, label: '' }, { k: 'RAlt', w: 1.4, label: 'alt' }, { k: 'RControl', w: 1.4, label: 'ctrl' }]
    ];

    var keys = {};

    ROWS.forEach(function (row) {
        var line = document.createElement('div');
        line.className = 'kbd-row';
        row.forEach(function (def) {
            var k = typeof def === 'string' ? def : def.k;
            var w = typeof def === 'string' ? 1 : def.w;
            var label = typeof def === 'string' ? def : def.label;
            var el = document.createElement('span');
            el.className = 'key' + (w > 1 ? ' key-wide' : '');
            el.style.setProperty('--w', String(w));
            el.setAttribute('data-k', k);
            var main = document.createElement('b');
            main.textContent = label;
            el.appendChild(main);
            if (HANGUL[k]) {
                var sub = document.createElement('i');
                sub.textContent = HANGUL[k];
                el.appendChild(sub);
            }
            line.appendChild(el);
            keys[k] = el;
        });
        kb.appendChild(line);
    });

    /* ---------- Hangul → keystrokes ------------------------------ */

    var CHO = ['r', 'R', 's', 'e', 'E', 'f', 'a', 'q', 'Q', 't', 'T', 'd', 'w', 'W', 'c', 'z', 'x', 'v', 'g'];
    var JUNG = ['k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'];
    var JONG = ['', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T', 'd', 'w', 'c', 'z', 'x', 'v', 'g'];
    var SHIFTED = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`' };

    // Expand one character into the keys pressed for it (Shift where needed).
    function keysFor(ch) {
        var code = ch.charCodeAt(0);
        var seq = [];
        if (code >= 0xAC00 && code <= 0xD7A3) {
            var n = code - 0xAC00;
            var raw = CHO[Math.floor(n / 588)] + JUNG[Math.floor((n % 588) / 28)] + JONG[n % 28];
            raw.split('').forEach(function (c) {
                if (c >= 'A' && c <= 'Z') seq.push('Shift', c.toLowerCase());
                else seq.push(c);
            });
            return seq;
        }
        if (ch === ' ') return [' '];
        if (ch >= 'A' && ch <= 'Z') return ['Shift', ch.toLowerCase()];
        if (SHIFTED[ch]) return ['Shift', SHIFTED[ch]];
        if (keys[ch]) return [ch];
        return [];
    }

    /* ---------- Demo loop ---------------------------------------- */

    var SETS = [
        { label: '한타', lines: ['가는 말이 고와야 오는 말이 곱다.', '천 리 길도 한 걸음부터.', '오늘 할 일을 내일로 미루지 말자.'] },
        { label: '영타', lines: ['The quick brown fox jumps over the lazy dog.', 'Practice a little every day.', 'Type fast, but type right.'] },
        { label: '개발자', lines: ['for (int i = 0; i < n; i++) sum += i;', 'if (user == null) return;', 'return list.stream().count();'] }
    ];

    var set = 0;
    var line = 0;
    var pos = 0;
    var score = 0;
    var timer = null;

    function render() {
        var text = SETS[set].lines[line];
        typed.textContent = text.slice(0, pos);
        rest.textContent = text.slice(pos);
        if (scoreEl) scoreEl.textContent = String(score);
        if (modeEl) modeEl.textContent = SETS[set].label;
    }

    function press(k, ms) {
        var el = keys[k];
        if (!el) return;
        el.classList.add('down');
        setTimeout(function () { el.classList.remove('down'); }, ms || 110);
    }

    function visible() {
        return !document.hidden && root.offsetParent !== null;
    }

    function wait(ms, fn) {
        timer = setTimeout(fn, ms);
    }

    // Types the next character: its keystrokes one after another, then the glyph.
    function typeNext() {
        if (!visible()) return wait(600, typeNext);
        var text = SETS[set].lines[line];
        if (pos >= text.length) return wait(1400, erase);
        var ch = text[pos];
        var seq = keysFor(ch);
        var i = 0;
        (function pressAll() {
            if (i < seq.length) {
                press(seq[i], 120);
                i++;
                return wait(70 + Math.random() * 50, pressAll);
            }
            pos++;
            score += 1;
            render();
            var pause = /[.,;!?]/.test(ch) ? 260 : (ch === ' ' ? 90 : 40);
            wait(pause + Math.random() * 40, typeNext);
        })();
    }

    function erase() {
        if (!visible()) return wait(600, erase);
        if (pos > 0) {
            press('Backspace', 60);
            pos = Math.max(0, pos - 2);
            render();
            return wait(26, erase);
        }
        line = (line + 1) % SETS[set].lines.length;
        if (line === 0) {
            set = (set + 1) % SETS.length;
            press('HangulMode', 200);
        }
        score = 0;
        render();
        wait(500, typeNext);
    }

    render();

    if (reduce) {
        // Static: show the first sentence complete.
        pos = SETS[0].lines[0].length;
        score = pos;
        render();
    } else {
        wait(700, typeNext);
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                clearTimeout(timer);
            } else {
                clearTimeout(timer);
                wait(300, pos >= SETS[set].lines[line].length ? erase : typeNext);
            }
        });
    }

    /* ---------- Real keystrokes light the keys too --------------- */

    document.addEventListener('keydown', function (e) {
        if (!visible() || e.metaKey || e.ctrlKey) return;
        var k = e.key;
        if (k.length === 1) {
            k = k.toLowerCase();
            if (SHIFTED[e.key]) k = SHIFTED[e.key];
        }
        if (k === 'Shift' && e.location === 2) k = 'RShift';
        if (k === 'Alt' && e.location === 2) k = 'RAlt';
        if (k === 'Control' && e.location === 2) k = 'RControl';
        press(k, 140);
    });
})();
