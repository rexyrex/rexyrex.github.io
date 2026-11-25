/* RexDesk — /apps/rexdesk/
   Dependency-free. Two small jobs:
   1. Language: the EN / 한국어 toggle. <head> already picked the language
      before first paint (?lang= → last choice → browser); this keeps the
      URL's ?lang= in step so the address bar is always shareable.
   2. The packet-loss simulation under "Bad Wi-Fi": frames arrive as pieces
      plus spares, the slider loses some on the way, and each frame is
      either complete, rebuilt from its spares, or asks again for what is
      missing. It illustrates the idea; it measures nothing. */
(function () {
    'use strict';

    var root = document.documentElement;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

    /* ---------- 1. Language ------------------------------------- */

    var TITLES = {
        en: 'RexDesk — Rexyrex',
        ko: 'RexDesk — Mac 원격 제어 · Rexyrex'
    };
    var DESCRIPTIONS = {
        en: 'Control a Mac from another Mac: hardware video on both ends, sharp text, a pointer with no lag, end-to-end encrypted. On your network or over the internet.',
        ko: '다른 Mac에서 Mac을 제어하세요. 양쪽 모두 하드웨어 영상 처리로 선명한 글자와 지연 없는 포인터, 종단 간 암호화. 같은 네트워크에서도 인터넷 너머에서도.'
    };

    function currentLang() {
        return root.getAttribute('data-lang') === 'ko' ? 'ko' : 'en';
    }

    function syncUrl(lang) {
        if (!window.history || !history.replaceState) return;
        try {
            var url = new URL(window.location.href);
            if (url.searchParams.get('lang') === lang) return;
            url.searchParams.set('lang', lang);
            history.replaceState(history.state, '', url.pathname + url.search + url.hash);
        } catch (e) { /* old browser: the toggle still works */ }
    }

    function applyLang(lang, opts) {
        opts = opts || {};
        root.setAttribute('lang', lang);
        root.setAttribute('data-lang', lang);
        document.title = TITLES[lang];
        var desc = document.querySelector('meta[name="description"]');
        if (desc) desc.setAttribute('content', DESCRIPTIONS[lang]);
        each(document.querySelectorAll('[data-set-lang]'), function (btn) {
            btn.setAttribute('aria-pressed', String(btn.getAttribute('data-set-lang') === lang));
        });
        if (opts.remember) {
            try { localStorage.setItem('rex-lang', lang); } catch (e) { /* private mode */ }
        }
        if (opts.url !== false) syncUrl(lang);
    }

    // Only write ?lang= into the address bar when it was already there or the
    // visitor picks one; a plain visit keeps the clean URL.
    var hadParam = false;
    try { hadParam = new URLSearchParams(window.location.search).has('lang'); } catch (e) { /* noop */ }
    applyLang(currentLang(), { url: hadParam });

    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('[data-set-lang]');
        if (!btn) return;
        var lang = btn.getAttribute('data-set-lang');
        if (lang === currentLang()) return;
        applyLang(lang, { remember: true });
    });

    /* ---------- 2. Packet loss ---------------------------------- */

    var sim = document.querySelector('[data-sim]');
    if (!sim) return;
    var range = sim.querySelector('.rd-range');
    var out = sim.querySelector('output');
    var frames = sim.querySelector('[data-frames]');
    var fecOut = sim.querySelector('[data-fec]');
    var rebuiltOut = sim.querySelector('[data-rebuilt]');
    var askedOut = sim.querySelector('[data-asked]');
    var shownOut = sim.querySelector('[data-shown]');
    if (!range || !frames) return;

    var PIECES = 12;        // data pieces drawn per frame
    var ROWS = 6;           // frames kept on screen
    var LABELS = {
        complete: '<span lang="en">complete</span><span lang="ko">완전함</span>',
        rebuilt: '<span lang="en">rebuilt</span><span lang="ko">복원됨</span>',
        asked: '<span lang="en">asked again</span><span lang="ko">다시 요청</span>'
    };
    var counts = { rebuilt: 0, asked: 0, shown: 0 };

    // Spares follow the loss: 5% on a clean network, up to 50%.
    function spareRate(loss) {
        return Math.min(0.5, Math.max(0.05, loss * 2 + 0.05));
    }

    function addFrame() {
        var loss = Number(range.value) / 100;
        var spares = Math.max(1, Math.round(PIECES * spareRate(loss)));
        var lost = 0;
        var html = '';
        var cells = [];
        for (var i = 0; i < PIECES + spares; i++) {
            var gone = Math.random() < loss;
            if (gone) lost++;
            cells.push({ spare: i >= PIECES, gone: gone });
        }
        // Any PIECES of the pieces-plus-spares rebuild the frame.
        var state = lost === 0 ? 'complete' : (lost <= spares ? 'rebuilt' : 'asked');
        cells.forEach(function (cell) {
            var cls = [];
            if (cell.spare) cls.push('spare');
            if (cell.gone) cls.push(state === 'asked' && !cell.spare ? 'again' : 'lost');
            html += '<i' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '></i>';
        });

        var row = document.createElement('div');
        row.className = 'rd-row is-new ' + (state === 'asked' ? 'is-asked' : 'is-ok');
        row.innerHTML = '<span class="rd-shards">' + html + '</span><em>' + LABELS[state] + '</em>';
        frames.insertBefore(row, frames.firstChild);
        while (frames.children.length > ROWS) frames.removeChild(frames.lastChild);

        counts.shown++;
        if (state === 'rebuilt') counts.rebuilt++;
        if (state === 'asked') counts.asked++;
        render();
    }

    function render() {
        var loss = Number(range.value);
        if (out) out.textContent = loss + '%';
        if (fecOut) fecOut.textContent = Math.round(spareRate(loss / 100) * 100) + '%';
        if (rebuiltOut) rebuiltOut.textContent = counts.rebuilt;
        if (askedOut) askedOut.textContent = counts.asked;
        if (shownOut) shownOut.textContent = counts.shown;
    }

    function reset() {
        counts = { rebuilt: 0, asked: 0, shown: 0 };
        frames.innerHTML = '';
        for (var i = 0; i < ROWS; i++) addFrame();
        each(frames.children, function (row) { row.classList.remove('is-new'); });
    }

    range.addEventListener('input', reset);
    reset();

    // Frames keep arriving while the demo is on screen (never under reduced motion:
    // the slider still redraws the six rows).
    if (reduced) return;
    var timer = null;
    function start() { if (!timer) timer = window.setInterval(addFrame, 650); }
    function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) { if (entry.isIntersecting) start(); else stop(); });
        }, { threshold: 0.2 }).observe(sim);
    } else {
        start();
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
})();
