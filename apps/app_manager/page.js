/* App Manager — /apps/app_manager/
   Dependency-free. Eight small jobs:
   1. Language: the EN / 한국어 toggles. <head> already picked the language
      before first paint (?lang= → last choice → browser); this keeps the
      URL's ?lang= in step so the address bar is always shareable.
   2. Downloads: the button for the visitor's OS becomes the primary one,
      and the product bar's Download points at that installer.
   3. The drawn window: ARIA tabs, auto-cycling while on screen until the
      visitor touches it, and a fastlane log that streams on Deploy.
   4. The agent session plays once when it scrolls into view.
   5. The product bar slides in once the hero's download buttons have
      scrolled away, and marks the section being read.
   6. Cards marked data-spot get a soft light under a fine pointer.
   7. Bento vignettes (data-live) play once, on arrival.
   8. The "works with" row becomes a slow belt. */
(function () {
    'use strict';

    var root = document.documentElement;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hasIO = 'IntersectionObserver' in window;
    var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

    // Styles that hide things for a later reveal are scoped to this class,
    // so nothing stays hidden if the script never runs.
    root.classList.add('am-js');

    /* ---------- 1. Language ------------------------------------- */

    var TITLES = {
        en: 'App Manager — Rexyrex',
        ko: 'App Manager — Flutter 앱 출시 도우미 · Rexyrex'
    };
    var DESCRIPTIONS = {
        en: 'Build and publish Flutter apps to Google Play and the App Store from one window: listings, screenshots, questionnaires, signing, deploys and reviews, with Claude Code built in.',
        ko: 'Flutter 앱을 Google Play와 App Store에 창 하나로 출시하세요. 등록정보, 스크린샷, 설문, 서명, 배포, 리뷰까지. Claude Code 내장.'
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

    /* ---------- 2. Downloads ------------------------------------ */

    var ua = navigator.userAgent || '';
    var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    var os = /win/i.test(platform) || /Windows/i.test(ua) ? 'win' : 'mac';
    var osHref = null;
    each(document.querySelectorAll('.am-dl[data-os]'), function (a) {
        var mine = a.getAttribute('data-os') === os;
        a.classList.toggle('is-primary', mine);
        if (!mine) return;
        osHref = osHref || a.getAttribute('href');
        // the primary button comes first in its row
        if (a.previousElementSibling) a.parentNode.insertBefore(a, a.parentNode.firstElementChild);
    });
    if (osHref) {
        each(document.querySelectorAll('[data-dl-auto]'), function (a) { a.setAttribute('href', osHref); });
    }

    /* ---------- 3. The drawn window ----------------------------- */

    var win = document.querySelector('[data-demo]');
    if (win) {
        var tabs = Array.prototype.slice.call(win.querySelectorAll('[role="tab"]'));
        var CYCLE_MS = 5500;
        var timer = null;
        var userTook = false;
        var onScreen = false;

        function select(tab, focus) {
            tabs.forEach(function (t) {
                var on = t === tab;
                t.setAttribute('aria-selected', String(on));
                t.tabIndex = on ? 0 : -1;
                var pane = document.getElementById(t.getAttribute('aria-controls'));
                if (pane) pane.hidden = !on;
            });
            if (focus) tab.focus();
            if (tab.id === 't-deploy') startConsole(); else stopConsole();
        }

        function next() {
            var i = tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; });
            select(tabs[(i + 1) % tabs.length]);
            // restart the progress line
            win.classList.remove('is-cycling');
            void win.offsetWidth;
            win.classList.add('is-cycling');
        }

        function startCycle() {
            if (reduced || userTook || timer) return;
            win.style.setProperty('--cycle', CYCLE_MS + 'ms');
            win.classList.add('is-cycling');
            timer = setInterval(next, CYCLE_MS);
        }

        function stopCycle() {
            clearInterval(timer);
            timer = null;
            win.classList.remove('is-cycling');
        }

        function takeOver() {
            userTook = true;
            stopCycle();
        }

        tabs.forEach(function (tab, i) {
            tab.addEventListener('click', function () { takeOver(); select(tab); });
            tab.addEventListener('keydown', function (e) {
                var to = null;
                if (e.key === 'ArrowRight') to = tabs[(i + 1) % tabs.length];
                else if (e.key === 'ArrowLeft') to = tabs[(i - 1 + tabs.length) % tabs.length];
                else if (e.key === 'Home') to = tabs[0];
                else if (e.key === 'End') to = tabs[tabs.length - 1];
                if (!to) return;
                e.preventDefault();
                takeOver();
                select(to, true);
            });
        });

        // Pause while the pointer rests on the window; resume when it leaves.
        win.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') stopCycle(); });
        win.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && onScreen) startCycle(); });

        if (hasIO) {
            new IntersectionObserver(function (entries) {
                onScreen = entries[0].isIntersecting;
                if (onScreen) startCycle(); else stopCycle();
            }, { threshold: 0.35 }).observe(win);
        }

        /* fastlane log */
        var LOG = [
            ['dim', '$ fastlane android beta'],
            ['', '[✔] Preflight: version 1.2.1+15 > live 1.2.0+14'],
            ['', '[12:30:04] flutter build appbundle --release'],
            ['dim', '[12:30:41] Running Gradle task \'bundleRelease\'…'],
            ['', '[12:31:52] ✓ Built app-release.aab (18.4MB)'],
            ['', '[12:31:53] upload_to_play_store track: beta'],
            ['dim', '[12:32:20] Uploading AAB… 100%'],
            ['', '[12:32:31] Release notes: en-US, ko-KR, ja-JP'],
            ['ok', '[12:32:34] ✓ 1.2.1 (15) is live on the beta track'],
            ['hi', 'fastlane.tools finished successfully 🎉']
        ];
        var pre = win.querySelector('[data-console] code');
        var logTimer = null;

        function line(cls, text) {
            var span = document.createElement('span');
            if (cls) span.className = cls;
            span.textContent = text + '\n';
            return span;
        }

        function stopConsole() {
            clearTimeout(logTimer);
            logTimer = null;
        }

        function startConsole() {
            if (!pre) return;
            stopConsole();
            pre.textContent = '';
            if (reduced) {
                LOG.forEach(function (l) { pre.appendChild(line(l[0], l[1])); });
                return;
            }
            var caret = document.createElement('span');
            caret.className = 'caret';
            var i = 0;
            (function step() {
                if (caret.parentNode) caret.parentNode.removeChild(caret);
                if (i < LOG.length) {
                    pre.appendChild(line(LOG[i][0], LOG[i][1]));
                    i++;
                    pre.appendChild(caret);
                    logTimer = setTimeout(step, i === 1 ? 500 : 380 + Math.random() * 320);
                }
            })();
        }
    }

    /* ---------- 4. The agent session ---------------------------- */

    var chat = document.querySelector('[data-chat]');
    if (chat && !reduced && hasIO) {
        var items = Array.prototype.slice.call(chat.querySelectorAll('.am-chat-log li'));
        var state = chat.querySelector('[data-chat-state]');
        chat.classList.add('is-playing');

        function setState(done) {
            if (!state) return;
            state.innerHTML = done
                ? '<span lang="en">done</span><span lang="ko">완료</span>'
                : '<span lang="en">working</span><span lang="ko">작업 중</span>';
        }

        function play() {
            var t = 200;
            items.forEach(function (li) {
                var isTool = li.classList.contains('tool');
                setTimeout(function () {
                    li.classList.add('is-in');
                    if (isTool) li.classList.add('is-running');
                }, t);
                if (isTool) {
                    t += 520;
                    setTimeout(function () { li.classList.remove('is-running'); }, t);
                    t += 120;
                } else {
                    t += 900;
                }
            });
            setTimeout(function () { setState(true); }, t);
        }

        var io = new IntersectionObserver(function (entries) {
            if (!entries[0].isIntersecting) return;
            io.disconnect();
            play();
        }, { threshold: 0.4 });
        io.observe(chat);
    }

    /* ---------- 5. The product bar ------------------------------ */

    var bar = document.querySelector('[data-bar]');
    var heroDl = document.getElementById('download');
    if (bar && heroDl && hasIO) {
        var setBar = function (on) {
            bar.classList.toggle('is-on', on);
            if (on) bar.removeAttribute('inert'); else bar.setAttribute('inert', '');
        };

        // On once the hero's buttons have left through the top of the viewport.
        new IntersectionObserver(function (entries) {
            var entry = entries[0];
            setBar(!entry.isIntersecting && entry.boundingClientRect.bottom < 120);
        }, { rootMargin: '-110px 0px 0px 0px' }).observe(heroDl);

        var links = {};
        each(bar.querySelectorAll('.am-bar-links a[href^="#"]'), function (a) {
            links[a.getAttribute('href').slice(1)] = a;
        });
        var seen = {};
        var mark = function () {
            var current = null;
            Object.keys(links).forEach(function (id) { if (seen[id]) current = current || id; });
            Object.keys(links).forEach(function (id) {
                if (id === current) links[id].setAttribute('aria-current', 'true');
                else links[id].removeAttribute('aria-current');
            });
        };
        // A section is "being read" while it crosses the middle of the viewport.
        var spy = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) { seen[entry.target.id] = entry.isIntersecting; });
            mark();
        }, { rootMargin: '-45% 0px -50% 0px' });
        Object.keys(links).forEach(function (id) {
            var section = document.getElementById(id);
            if (section) spy.observe(section);
        });
    }

    /* ---------- 6. Pointer light on cards ----------------------- */

    if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        var spotFrame = 0;
        var spotEvent = null;
        document.addEventListener('pointermove', function (e) {
            spotEvent = e;
            if (spotFrame) return;
            spotFrame = requestAnimationFrame(function () {
                spotFrame = 0;
                var card = spotEvent.target.closest && spotEvent.target.closest('[data-spot]');
                if (!card) return;
                var r = card.getBoundingClientRect();
                card.style.setProperty('--mx', (spotEvent.clientX - r.left) + 'px');
                card.style.setProperty('--my', (spotEvent.clientY - r.top) + 'px');
            });
        }, { passive: true });
    }

    /* ---------- 7. Bento vignettes ------------------------------ */

    var live = document.querySelectorAll('[data-live]');
    if (hasIO && !reduced) {
        var liveIO = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-live');
                liveIO.unobserve(entry.target);
            });
        }, { threshold: 0.4 });
        each(live, function (el) { liveIO.observe(el); });
    } else {
        each(live, function (el) { el.classList.add('is-live'); });
    }

    /* ---------- 8. The "works with" belt ------------------------ */

    var belt = document.querySelector('[data-marquee]');
    if (belt && !reduced) {
        var track = belt.querySelector('.am-marquee-track');
        // A second copy of the row, hidden from assistive tech, makes the loop seamless.
        each(track.querySelectorAll('li'), function (li) {
            var copy = li.cloneNode(true);
            copy.setAttribute('aria-hidden', 'true');
            track.appendChild(copy);
        });
        belt.classList.add('is-on');
    }
})();
