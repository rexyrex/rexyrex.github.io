/* Command palette: ⌘K (Ctrl+K elsewhere) on every page.
   Dependency-free; /js/common.js injects it after the chrome mounts, and
   any [data-palette-open] button opens it. The site index below is also
   published as window.rexSiteIndex — /404.html uses it for suggestions. */
(function () {
    'use strict';

    if (window.rexPalette) return;

    var EMAIL = 'rexyrex.dev@gmail.com';
    var REPO_URL = 'https://github.com/rexyrex/rexyrex.github.io';

    var INDEX = {
        pages: [
            { title: 'Home', path: '/', hint: 'rexyrex.github.io', keys: 'index start landing rex home' },
            { title: 'Typing Speed Test', path: '/typing/index.html', hint: '/typing/', keys: 'typing 한타 영타 타자 keyboard wpm leaderboard game' },
            { title: 'Deadly Balloons 2', path: '/deadlyBalloons/index.html', hint: '/deadlyBalloons/', keys: 'balloons java desktop game download trailer' },
            { title: 'Music', path: '/music/showcase.html', hint: '/music/', keys: 'music soundcloud superpose newgrounds tracks audio' },
            { title: 'Animation lab', path: '/animation.html', hint: '/animation.html', keys: 'lab css text effects vue scratchpad animation' },
            { title: 'Apps & privacy policies', path: '/apps/', hint: '/apps/', keys: 'apps privacy policy store google play app store' },
            { title: 'Devlog', path: '/log/', hint: '/log/', keys: 'log blog devlog notes writing how it works' },
            { title: 'Support', path: '/support/', hint: '/support/', keys: 'support contact email help bug feedback' },
            { title: 'KakaoParser help', path: '/parser/index.html', hint: '/parser/', keys: 'kakaoparser kakaotalk 카카오톡 faq 이용약관 help docs' }
        ],
        games: [
            { title: 'Rexy Arcade', path: 'https://crazy.rexy.win', hint: 'Bomberman-style dino party · 1–8 players', keys: 'rexy arcade crazy bomberman party' },
            { title: 'FRONTLINE', path: 'https://fps.rexy.win', hint: '3D multiplayer arena shooter', keys: 'frontline fps shooter arena 3d' },
            { title: 'OVERCLOCK', path: 'https://overclock.rexy.win', hint: 'Circuit-board real-time strategy', keys: 'overclock rts strategy circuit' },
            { title: 'SPOOKY FRIENDS', path: 'https://spooky.rexy.win', hint: 'Cute horror adventure · solo', keys: 'spooky friends horror cute adventure 호러' },
            { title: 'DOODLINGS', path: 'https://draw.rexy.win', hint: 'Draw & guess party · 2–12 players', keys: 'doodlings draw pictionary guess party drawing' },
            { title: 'CHESSLINGS', path: 'https://chess.rexy.win', hint: '3D chess with tiny champions', keys: 'chesslings chess 3d strategy' }
        ],
        apps: [
            { title: 'Age Calculator', path: '/apps/age_calculator/privacy-policy/', hint: 'Google Play · privacy policy', keys: 'age calculator birthday' },
            { title: 'QR Scanner', path: '/apps/qr_scanner/privacy-policy/', hint: 'Google Play · privacy policy', keys: 'qr barcode scanner' },
            { title: 'Reverse Image Search', path: '/apps/reverse_image_search/privacy-policy/', hint: 'Google Play · privacy policy', keys: 'reverse image search google bing yandex tineye' },
            { title: 'Photo Exif Metadata Editor', path: 'https://play.google.com/store/apps/details?id=com.rexyrex.exif', hint: 'Google Play', keys: 'exif metadata photo editor remover' },
            { title: 'Deadly Balloons (mobile)', path: '/apps/deadly_balloons/privacy-policy/', hint: 'Google Play · privacy policy', keys: 'deadly balloons mobile android' },
            { title: '카카오톡 대화 분석기 (KakaoParser)', path: '/apps/kakaoparser/privacy-policy/', hint: 'Google Play · App Store · privacy policy', keys: 'kakaoparser kakaotalk 카카오톡 대화 분석기 chat analyzer' },
            { title: '카톡 연애 분석기', path: '/apps/kakao_love_analyzer/privacy-policy/', hint: 'Google Play · App Store · privacy policy', keys: 'kakao love analyzer 연애 분석기 궁합' },
            { title: '사주 분석기', path: 'https://play.google.com/store/apps/details?id=com.rexyrex.saju', hint: 'Google Play', keys: 'saju 사주 운세 fortune' }
        ],
        links: [
            { title: 'games.rexy.win', path: 'https://games.rexy.win', hint: 'the game portal', keys: 'games portal arcade play' },
            { title: 'GitHub', path: 'https://github.com/rexyrex', hint: 'github.com/rexyrex', keys: 'github code repos source' },
            { title: 'YouTube', path: 'https://www.youtube.com/channel/UCq3yY-SCoglG8xm6Z1_udaw', hint: 'videos and trailers', keys: 'youtube video channel' },
            { title: 'SoundCloud', path: 'https://soundcloud.com/rexyrex-1', hint: 'tracks', keys: 'soundcloud music stream' },
            { title: 'Newgrounds', path: 'https://rexyrex.newgrounds.com/', hint: 'audio portfolio', keys: 'newgrounds audio portfolio' }
        ]
    };

    window.rexSiteIndex = INDEX;
    if (typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('rex:site-index', { detail: INDEX }));

    /* ---------- Items ------------------------------------------- */

    function sourceUrlForThisPage() {
        var p = window.location.pathname || '/';
        if (p.charAt(p.length - 1) === '/') p += 'index.html';
        return REPO_URL + '/blob/master' + p;
    }

    var items = [];
    function addGroup(kind, list) {
        list.forEach(function (it) {
            items.push({ kind: kind, title: it.title, hint: it.hint, keys: it.keys, url: it.path, external: /^https?:/i.test(it.path) });
        });
    }
    addGroup('page', INDEX.pages);
    addGroup('game', INDEX.games);
    addGroup('app', INDEX.apps);

    var actions = [
        { kind: 'action', title: 'Toggle theme', hint: 'light ↔ dark', keys: 'theme dark light mode toggle switch', run: function () {
            if (window.rexChrome) window.rexChrome.toggleTheme();
            return 'stay';
        } },
        { kind: 'action', title: 'Copy e-mail address', hint: EMAIL, keys: 'copy email mail address contact clipboard', run: function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(EMAIL).then(function () { toast('copied ' + EMAIL); }, function () { toast(EMAIL); });
            } else {
                toast(EMAIL);
            }
            return 'stay';
        } },
        { kind: 'action', title: 'Write an e-mail', hint: 'mailto:' + EMAIL, keys: 'email mail write contact support message', run: function () {
            window.location.href = 'mailto:' + EMAIL + '?subject=App%20support';
        } },
        { kind: 'action', title: 'Scroll to top', hint: 'Ln 1', keys: 'top scroll up beginning', run: function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } },
        { kind: 'action', title: 'View this page on GitHub', hint: 'source', keys: 'source code github view page repo', run: function () {
            window.open(sourceUrlForThisPage(), '_blank', 'noopener');
        } }
    ];
    items = items.concat(actions);
    addGroup('link', INDEX.links);

    var KIND_LABEL = { page: 'page', game: 'game', app: 'app', action: 'action', link: 'link' };
    var GROUP_TITLE = { page: 'Pages', game: 'Games · games.rexy.win', app: 'Apps', action: 'Actions', link: 'Elsewhere' };

    /* ---------- Search ------------------------------------------ */

    function norm(s) { return String(s || '').toLowerCase(); }

    function subsequence(str, t) {
        var j = 0;
        for (var i = 0; i < str.length && j < t.length; i++) if (str.charAt(i) === t.charAt(j)) j++;
        return j === t.length;
    }

    function score(item, tokens) {
        var title = norm(item.title);
        var hint = norm(item.hint);
        var keys = norm(item.keys);
        var total = 0;
        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            var s = 0;
            if (title.indexOf(t) === 0) s = 100;
            else if (title.indexOf(' ' + t) !== -1) s = 80;
            else if (title.indexOf(t) !== -1) s = 60;
            else if (hint.indexOf(t) !== -1) s = 40;
            else if (keys.indexOf(t) !== -1) s = 30;
            else if (t.length >= 3 && subsequence(title.replace(/\s+/g, ''), t)) s = 12;
            else return 0;
            total += s;
        }
        return total;
    }

    function search(q) {
        var tokens = norm(q).trim().split(/\s+/).filter(Boolean);
        if (!tokens.length) return items.slice();
        return items
            .map(function (it, i) { return { it: it, s: score(it, tokens), i: i }; })
            .filter(function (r) { return r.s > 0; })
            .sort(function (a, b) { return b.s - a.s || a.i - b.i; })
            .map(function (r) { return r.it; });
    }

    /* ---------- Dialog ------------------------------------------ */

    var dialog = null;
    var input = null;
    var list = null;
    var countEl = null;
    var results = [];
    var active = 0;
    var lastFocus = null;
    var toastTimer = null;

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function build() {
        if (dialog) return true;
        if (typeof HTMLDialogElement !== 'function') return false;
        dialog = document.createElement('dialog');
        dialog.className = 'rex-palette';
        dialog.setAttribute('aria-label', 'Command palette');

        var box = el('div', 'rex-palette-box');
        var head = el('div', 'rex-palette-head');
        head.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.3"/><path d="M10.2 10.2 14 14"/></svg>';
        input = el('input', 'rex-palette-input');
        input.type = 'text';
        input.placeholder = 'Jump to a page, a game, an app…';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('aria-label', 'Search this site');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-expanded', 'true');
        input.setAttribute('aria-controls', 'rexPaletteList');
        input.setAttribute('aria-autocomplete', 'list');
        head.appendChild(input);
        head.appendChild(el('kbd', null, 'esc'));

        list = el('ul', 'rex-palette-list');
        list.id = 'rexPaletteList';
        list.setAttribute('role', 'listbox');

        var foot = el('div', 'rex-palette-foot');
        foot.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span>';
        countEl = el('span', 'rex-palette-count');
        foot.appendChild(countEl);

        box.appendChild(head);
        box.appendChild(list);
        box.appendChild(foot);
        dialog.appendChild(box);
        document.body.appendChild(dialog);

        input.addEventListener('input', function () { render(input.value); });

        // Keys inside the palette must not reach page-level handlers
        // (the typing game counts every keydown on the document).
        dialog.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
            else if (e.key === 'Home' && !input.value) { e.preventDefault(); setActive(0); }
            else if (e.key === 'End' && !input.value) { e.preventDefault(); setActive(results.length - 1); }
            else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
            else if (e.key === 'Tab') { e.preventDefault(); move(e.shiftKey ? -1 : 1); }
        });
        dialog.addEventListener('keyup', function (e) { e.stopPropagation(); });
        dialog.addEventListener('keypress', function (e) { e.stopPropagation(); });

        // Click on the dimmed area (the dialog itself, outside the box) closes.
        dialog.addEventListener('click', function (e) {
            if (e.target === dialog) close();
        });
        list.addEventListener('click', function (e) {
            var li = e.target.closest ? e.target.closest('.rex-palette-item') : null;
            if (!li) return;
            go(results[parseInt(li.getAttribute('data-i'), 10)]);
        });
        list.addEventListener('pointermove', function (e) {
            var li = e.target.closest ? e.target.closest('.rex-palette-item') : null;
            if (!li) return;
            var i = parseInt(li.getAttribute('data-i'), 10);
            if (i !== active) setActive(i, true);
        });
        dialog.addEventListener('close', function () {
            document.documentElement.classList.remove('rex-palette-open');
            if (lastFocus && lastFocus.focus) {
                try { lastFocus.focus({ preventScroll: true }); } catch (err) { /* gone */ }
            }
            lastFocus = null;
        });
        return true;
    }

    function render(q) {
        results = search(q);
        active = 0;
        list.innerHTML = '';
        if (!results.length) {
            list.appendChild(el('li', 'rex-palette-empty', 'Nothing here for "' + q.trim() + '". Try a page, a game or an app name.'));
            countEl.textContent = '0 results';
            return;
        }
        var grouped = !norm(q).trim();
        var frag = document.createDocumentFragment();
        var lastKind = null;
        results.forEach(function (it, i) {
            if (grouped && it.kind !== lastKind) {
                var h = el('li', 'rex-palette-group', GROUP_TITLE[it.kind] || it.kind);
                h.setAttribute('role', 'presentation');
                frag.appendChild(h);
                lastKind = it.kind;
            }
            var li = el('li', 'rex-palette-item');
            li.setAttribute('role', 'option');
            li.setAttribute('data-i', String(i));
            li.id = 'rexPaletteItem' + i;
            li.appendChild(el('span', 'rex-palette-kind', KIND_LABEL[it.kind] || it.kind));
            li.appendChild(el('span', 'rex-palette-title', it.title));
            li.appendChild(el('span', 'rex-palette-hint', it.hint || ''));
            li.appendChild(el('span', 'rex-palette-go', it.external ? '↗' : '↵'));
            frag.appendChild(li);
        });
        list.appendChild(frag);
        countEl.textContent = results.length + (results.length === 1 ? ' result' : ' results');
        setActive(0);
    }

    function setActive(i, noScroll) {
        if (!results.length) return;
        active = Math.max(0, Math.min(results.length - 1, i));
        var rows = list.querySelectorAll('.rex-palette-item');
        for (var k = 0; k < rows.length; k++) {
            var on = parseInt(rows[k].getAttribute('data-i'), 10) === active;
            rows[k].setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) {
                input.setAttribute('aria-activedescendant', rows[k].id);
                if (!noScroll && rows[k].scrollIntoView) rows[k].scrollIntoView({ block: 'nearest' });
            }
        }
    }

    function move(delta) {
        if (!results.length) return;
        setActive((active + delta + results.length) % results.length);
    }

    function toast(text) {
        if (!countEl) return;
        countEl.textContent = text;
        countEl.classList.add('is-toast');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            countEl.classList.remove('is-toast');
            countEl.textContent = results.length + ' results';
        }, 1800);
    }

    function go(item) {
        if (!item) return;
        if (item.run) {
            var r = item.run();
            if (r !== 'stay') close();
            return;
        }
        close();
        if (item.external) window.open(item.url, '_blank', 'noopener');
        else window.location.href = item.url;
    }

    function open() {
        if (!build()) return;
        if (dialog.open) {
            input.focus();
            return;
        }
        lastFocus = document.activeElement;
        document.documentElement.classList.add('rex-palette-open');
        dialog.showModal();
        input.value = '';
        render('');
        input.focus();
    }

    function close() {
        if (dialog && dialog.open) dialog.close();
    }

    function toggle() {
        if (dialog && dialog.open) close();
        else open();
    }

    /* ---------- Triggers ---------------------------------------- */

    document.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-palette-open]') : null;
        if (!b) return;
        e.preventDefault();
        open();
    });

    document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            toggle();
        }
    });

    // Coming back through the bfcache with the palette open would be odd.
    window.addEventListener('pageshow', function (e) { if (e.persisted) close(); });

    window.rexPalette = { open: open, close: close, toggle: toggle, search: search, items: items };
})();
