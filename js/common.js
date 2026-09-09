/* Site-wide chrome loader: theme, fonts, navbar + status bar, palette.
   Dependency-free on purpose — the generated /apps/ privacy-policy pages
   load this file too (with jQuery present), the typing game loads it with
   Bootstrap 4, and the main pages load it with nothing. Only vanilla DOM
   APIs may be assumed.

   What it does on every page:
   - applies the remembered theme and keeps <meta name="theme-color"> in sync
   - injects /css/navbar.css, the icon font, the site typefaces and
     /js/palette.js when the host page lacks them
   - mounts /navbar.html (skip link, top bar, status bar) into
     #nav-placeholder — from a sessionStorage copy first, so the bars are
     already in the DOM when a cross-document view transition captures the
     new page, then refreshes the copy from the network
   - wires the status bar: current path, Ln/Col, scroll %, the theme
     toggle, the last-commit age from the GitHub API and a reachability
     ping for games.rexy.win */
(function () {
    'use strict';

    var FA_HREF = 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/css/all.min.css';
    var FA_INTEGRITY = 'sha384-nRgPTkuX86pH8yjPJUAFuASXQSSl2/bBUiNV47vSYpKFxHJhbcrGnmlYpYJMeD7a';
    var FONTS_HREF = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap';
    var THEME_KEY = 'rex-theme';
    var NAV_CACHE_KEY = 'rex-navbar-html';
    var DEPLOY_CACHE_KEY = 'rex-deploy';
    var DEPLOY_TTL = 10 * 60 * 1000;
    var REPO = 'rexyrex/rexyrex.github.io';
    var GAMES_STATUS_URL = 'https://games.rexy.win/api/status';
    var THEME_COLORS = { dark: '#0f1214', light: '#f5f7f4' };

    /* ---------- Theme -------------------------------------------- */
    // Hand-written pages also run a copy of applyTheme() inline in <head>
    // so the first paint is already right; generated pages get it here.

    function readTheme() {
        try {
            var t = localStorage.getItem(THEME_KEY);
            return (t === 'light' || t === 'dark') ? t : null;
        } catch (e) {
            return null;
        }
    }

    function writeTheme(t) {
        try {
            if (t) localStorage.setItem(THEME_KEY, t);
            else localStorage.removeItem(THEME_KEY);
        } catch (e) { /* storage unavailable: theme just won't persist */ }
    }

    function applyTheme(t) {
        var root = document.documentElement;
        if (t) root.setAttribute('data-theme', t);
        else root.removeAttribute('data-theme');
    }

    function effectiveTheme() {
        var t = document.documentElement.getAttribute('data-theme');
        if (t) return t;
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }

    // Browser chrome (mobile address bar, PWA title bar) follows the page.
    // A theme-color meta without a media query, placed first, wins over the
    // two media-gated ones hand-written pages ship for the first paint.
    function syncThemeColor() {
        var t = effectiveTheme();
        var meta = document.querySelector('meta[name="theme-color"]:not([media])');
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            var first = document.querySelector('meta[name="theme-color"]');
            if (first && first.parentNode) first.parentNode.insertBefore(meta, first);
            else document.head.appendChild(meta);
        }
        meta.setAttribute('content', THEME_COLORS[t] || THEME_COLORS.dark);
    }

    function emit(name, detail) {
        if (typeof CustomEvent !== 'function') return;
        document.dispatchEvent(new CustomEvent(name, { detail: detail }));
    }

    function setTheme(t) {
        applyTheme(t);
        writeTheme(t);
        syncThemeColor();
        emit('rex:theme', effectiveTheme());
    }

    applyTheme(readTheme());
    syncThemeColor();

    /* ---------- Helpers ------------------------------------------ */

    function ready(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }

    function hasStylesheet(test) {
        var links = document.querySelectorAll('link[rel="stylesheet"]');
        for (var i = 0; i < links.length; i++) {
            if (test(links[i].getAttribute('href') || '')) return true;
        }
        return false;
    }

    function addStylesheet(href, integrity) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        if (integrity) {
            link.integrity = integrity;
            link.crossOrigin = 'anonymous';
        }
        document.head.appendChild(link);
    }

    function addScript(src) {
        var scripts = document.querySelectorAll('script[src]');
        for (var i = 0; i < scripts.length; i++) {
            if ((scripts[i].getAttribute('src') || '').indexOf(src) !== -1) return;
        }
        var s = document.createElement('script');
        s.src = src;
        s.defer = true;
        document.head.appendChild(s);
    }

    // Pages that only link /css/index.css (the generated ones) still need
    // the chrome stylesheet, the icon font and the site's typefaces.
    function ensureAssets() {
        if (!hasStylesheet(function (h) { return h.indexOf('navbar.css') !== -1; })) {
            addStylesheet('/css/navbar.css');
        }
        if (!hasStylesheet(function (h) { return /font-?awesome/i.test(h) || h.indexOf('all.min.css') !== -1; })) {
            addStylesheet(FA_HREF, FA_INTEGRITY);
        }
        if (!hasStylesheet(function (h) { return h.indexOf('IBM+Plex') !== -1; })) {
            addStylesheet(FONTS_HREF);
        }
        addScript('/js/palette.js');
    }

    function isApple() {
        return /Mac|iPhone|iPad|iPod/.test(navigator.platform || '') || /Mac OS X/.test(navigator.userAgent || '');
    }

    /* ---------- Navbar ------------------------------------------- */

    function dirOf(pathname) {
        return pathname.slice(0, pathname.lastIndexOf('/') + 1);
    }

    // A link is "active" when it points into the directory the visitor is
    // in (so /typing/index.html lights up for any page under /typing/), or
    // to this exact root-level file (animation.html).
    function highlightActiveLinks(nav) {
        var here = window.location.pathname;
        var hereDir = dirOf(here);
        var links = nav.querySelectorAll('a.site-nav-link[href], a.site-dropdown-item[href]');
        for (var i = 0; i < links.length; i++) {
            var a = links[i];
            var url;
            try { url = new URL(a.getAttribute('href'), window.location.href); } catch (e) { continue; }
            if (url.origin !== window.location.origin) continue;
            var target = url.pathname;
            var targetDir = dirOf(target);
            var active = false;
            if (targetDir !== '/' && targetDir === hereDir) active = true;
            else if (targetDir === '/' && target === here) active = true;
            if (active) {
                a.classList.add('active');
                a.setAttribute('aria-current', 'page');
                var parent = a.closest('.site-nav-item');
                if (parent) {
                    var toggle = parent.querySelector('.site-dropdown-toggle');
                    if (toggle) toggle.classList.add('active');
                }
            }
        }
    }

    function initNavbar(root) {
        var nav = root.querySelector('.site-navbar');
        if (!nav) return;

        var toggler = nav.querySelector('.site-nav-toggle');
        var links = nav.querySelector('.site-nav-links');
        var dropdowns = Array.prototype.slice.call(nav.querySelectorAll('.site-nav-item'));
        var desktop = window.matchMedia('(min-width: 861px)');
        var closeTimer = null;

        function setOpen(dropdown, open) {
            dropdown.classList.toggle('open', open);
            var toggle = dropdown.querySelector('.site-dropdown-toggle');
            if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        function closeAll(except) {
            dropdowns.forEach(function (d) { if (d !== except) setOpen(d, false); });
        }

        dropdowns.forEach(function (dropdown) {
            var toggle = dropdown.querySelector('.site-dropdown-toggle');
            if (toggle) {
                toggle.addEventListener('click', function (e) {
                    e.preventDefault();
                    var open = !dropdown.classList.contains('open');
                    closeAll(dropdown);
                    setOpen(dropdown, open);
                });
            }
            dropdown.addEventListener('pointerenter', function () {
                if (!desktop.matches) return;
                clearTimeout(closeTimer);
                closeAll(dropdown);
                setOpen(dropdown, true);
            });
            dropdown.addEventListener('pointerleave', function () {
                if (!desktop.matches) return;
                clearTimeout(closeTimer);
                closeTimer = setTimeout(function () { setOpen(dropdown, false); }, 400);
            });
        });

        document.addEventListener('click', function (e) {
            if (!nav.contains(e.target)) {
                closeAll(null);
                if (links && links.classList.contains('open')) {
                    links.classList.remove('open');
                    if (toggler) toggler.setAttribute('aria-expanded', 'false');
                }
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            var open = dropdowns.filter(function (d) { return d.classList.contains('open'); });
            closeAll(null);
            if (open.length) {
                var t = open[0].querySelector('.site-dropdown-toggle');
                if (t) t.focus();
            }
            if (links && links.classList.contains('open')) {
                links.classList.remove('open');
                if (toggler) {
                    toggler.setAttribute('aria-expanded', 'false');
                    toggler.focus();
                }
            }
        });

        if (toggler && links) {
            toggler.addEventListener('click', function () {
                var open = links.classList.toggle('open');
                toggler.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        }

        highlightActiveLinks(nav);
    }

    /* ---------- Skip link ---------------------------------------- */
    // Points at <main> (given an id if it has none). Pages without a <main>
    // — the typing game, the generated policies — get their first content
    // block instead. tabindex=-1 lets the target take focus.

    function initSkipLink(root) {
        var link = root.querySelector('.skip-link');
        if (!link) return;
        var target = document.getElementById('main') || document.querySelector('main');
        if (!target) {
            var n = root.nextElementSibling;
            while (n && /^(SCRIPT|STYLE|TEMPLATE|LINK)$/.test(n.tagName)) n = n.nextElementSibling;
            target = n;
        }
        if (!target) return;
        if (!target.id) target.id = 'main';
        link.setAttribute('href', '#' + target.id);
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        link.addEventListener('click', function (e) {
            e.preventDefault();
            target.focus({ preventScroll: true });
            target.scrollIntoView();
        });
    }

    /* ---------- Palette buttons ---------------------------------- */
    // /js/palette.js owns the dialog; the chrome only labels its buttons
    // with the right modifier key. Touch devices get the plain glyph.

    function initPaletteHints(root) {
        var label = isApple() ? '⌘K' : 'Ctrl K';
        var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        var kbds = root.querySelectorAll('[data-palette-kbd]');
        for (var i = 0; i < kbds.length; i++) {
            kbds[i].textContent = label;
            if (coarse) kbds[i].setAttribute('data-coarse', '');
        }
    }

    /* ---------- Live bits ---------------------------------------- */

    function relTime(iso) {
        var d = (Date.now() - new Date(iso).getTime()) / 1000;
        if (!(d >= 0)) return null;
        if (d < 90) return 'just now';
        if (d < 3600) return Math.round(d / 60) + 'm ago';
        if (d < 172800) return Math.round(d / 3600) + 'h ago';
        if (d < 2592000) return Math.round(d / 86400) + 'd ago';
        return null;
    }

    // "master · 3h ago": the age of the last commit on the repo, from the
    // public GitHub API. Cached per tab for ten minutes; silent on failure.
    function initDeploy(root) {
        var el = root.querySelector('.statusbar-deploy');
        if (!el || !window.fetch) return;

        function render(info) {
            if (!info || !info.date) return;
            el.textContent = '· ' + (relTime(info.date) || info.date.slice(0, 10));
            el.title = 'Last commit: ' + info.message + ' · ' + info.date.replace('T', ' ').slice(0, 16) + ' UTC';
            el.hidden = false;
        }

        var cached = null;
        try { cached = JSON.parse(sessionStorage.getItem(DEPLOY_CACHE_KEY) || 'null'); } catch (e) { cached = null; }
        if (cached && cached.at && Date.now() - cached.at < DEPLOY_TTL) {
            render(cached);
            return;
        }

        fetch('https://api.github.com/repos/' + REPO + '/commits?per_page=1', {
            headers: { Accept: 'application/vnd.github+json' }
        })
            .then(function (r) {
                if (!r.ok) throw new Error('github ' + r.status);
                return r.json();
            })
            .then(function (list) {
                var c = list && list[0] && list[0].commit;
                if (!c || !c.committer) return;
                var info = {
                    at: Date.now(),
                    date: c.committer.date,
                    message: String(c.message || '').split('\n')[0].slice(0, 90)
                };
                try { sessionStorage.setItem(DEPLOY_CACHE_KEY, JSON.stringify(info)); } catch (e) { /* fine */ }
                render(info);
            })
            .catch(function () { /* rate-limited or offline: the bar just says master */ });
    }

    // Reachability of the games portal. The status API sends no CORS
    // header yet, so this is an opaque (no-cors) request: it resolves when
    // the server answers at all and rejects when it doesn't — a coarse but
    // honest "up" signal that never logs a CORS error.
    var gamesPing = null;
    function pingGames() {
        if (gamesPing) return gamesPing;
        if (!window.fetch || navigator.onLine === false) {
            gamesPing = Promise.resolve(null);
            return gamesPing;
        }
        var ctrl = window.AbortController ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6000) : null;
        gamesPing = fetch(GAMES_STATUS_URL, { mode: 'no-cors', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
            .then(function () { return true; })
            .catch(function () { return false; })
            .then(function (up) {
                if (timer) clearTimeout(timer);
                return up;
            });
        return gamesPing;
    }

    function initGames(root) {
        var el = root.querySelector('.statusbar-games');
        if (!el) return;
        var label = el.querySelector('.statusbar-games-label');
        pingGames().then(function (up) {
            if (up === null) return;
            el.classList.add(up ? 'is-up' : 'is-down');
            if (label) label.textContent = up ? 'games up' : 'games down';
            var a = el.querySelector('a');
            if (a) a.title = 'games.rexy.win is ' + (up ? 'reachable' : 'not answering right now');
            el.hidden = false;
        });
    }

    /* ---------- Status bar --------------------------------------- */

    function initStatusbar(root) {
        var bar = root.querySelector('.site-statusbar');
        if (!bar) return;

        // Current "file": ~ is the site root.
        var pathEl = bar.querySelector('.statusbar-path');
        if (pathEl) {
            var p = window.location.pathname || '/';
            if (p === '/' || p === '') p = '/index.html';
            pathEl.innerHTML = '<b>~</b>' + p.replace(/&/g, '&amp;').replace(/</g, '&lt;');
            pathEl.title = window.location.host + p;
        }

        // Ln follows the scroll position (one "line" per 24px), Col follows
        // the pointer on devices that have one. Both are rAF-throttled.
        var lnEl = bar.querySelector('.statusbar-ln');
        var colEl = bar.querySelector('.statusbar-col');
        var pctEl = bar.querySelector('.statusbar-pct');
        var LINE_PX = 24;
        var COL_PX = 8;
        var scrollTick = false;
        var pointerTick = false;
        var lastX = null;

        function updateScroll() {
            scrollTick = false;
            var y = window.scrollY || window.pageYOffset || 0;
            var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            var pct = max > 0 ? Math.round(Math.min(1, y / max) * 100) : 100;
            if (lnEl) lnEl.textContent = 'Ln ' + (Math.floor(y / LINE_PX) + 1);
            if (pctEl) pctEl.textContent = pct + '%';
        }

        function updatePointer() {
            pointerTick = false;
            if (colEl && lastX !== null) colEl.textContent = 'Col ' + (Math.floor(lastX / COL_PX) + 1);
        }

        window.addEventListener('scroll', function () {
            if (!scrollTick) {
                scrollTick = true;
                requestAnimationFrame(updateScroll);
            }
        }, { passive: true });
        window.addEventListener('resize', function () {
            if (!scrollTick) {
                scrollTick = true;
                requestAnimationFrame(updateScroll);
            }
        });

        if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
            document.addEventListener('pointermove', function (e) {
                lastX = e.clientX;
                if (!pointerTick) {
                    pointerTick = true;
                    requestAnimationFrame(updatePointer);
                }
            }, { passive: true });
        }

        updateScroll();

        // Theme toggle: explicit light/dark, remembered per browser.
        var themeBtn = bar.querySelector('.statusbar-theme');
        var themeLabel = bar.querySelector('.statusbar-theme-label');
        var themeIcon = bar.querySelector('.statusbar-theme-icon');

        function renderTheme() {
            var t = effectiveTheme();
            if (themeLabel) themeLabel.textContent = t;
            if (themeIcon) themeIcon.textContent = t === 'dark' ? '◐' : '◑';
            if (themeBtn) themeBtn.setAttribute('aria-label', 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' theme');
        }

        if (themeBtn) {
            themeBtn.addEventListener('click', function () {
                setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
            });
        }

        document.addEventListener('rex:theme', renderTheme);

        if (window.matchMedia) {
            var mq = window.matchMedia('(prefers-color-scheme: light)');
            var onChange = function () { syncThemeColor(); renderTheme(); };
            if (mq.addEventListener) mq.addEventListener('change', onChange);
            else if (mq.addListener) mq.addListener(onChange);
        }

        renderTheme();
        initDeploy(root);
        initGames(root);
    }

    /* ---------- Public surface ----------------------------------- */
    // Used by /js/palette.js (theme action) and /js/landing.js (games pill).

    window.rexChrome = {
        effectiveTheme: effectiveTheme,
        setTheme: setTheme,
        toggleTheme: function () { setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'); },
        pingGames: pingGames,
        isApple: isApple
    };

    /* ---------- Boot --------------------------------------------- */

    function readNavCache() {
        try { return sessionStorage.getItem(NAV_CACHE_KEY); } catch (e) { return null; }
    }

    function writeNavCache(html) {
        try { sessionStorage.setItem(NAV_CACHE_KEY, html); } catch (e) { /* fine */ }
    }

    function mount(placeholder, html) {
        placeholder.innerHTML = html;
        placeholder.classList.add('loaded');
        initSkipLink(placeholder);
        initPaletteHints(placeholder);
        initNavbar(placeholder);
        initStatusbar(placeholder);
        emit('rex:chrome', placeholder);
    }

    ready(function () {
        ensureAssets();

        var placeholder = document.getElementById('nav-placeholder');
        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.id = 'nav-placeholder';
            document.body.insertBefore(placeholder, document.body.firstChild);
        }

        // Mount the copy from the last page straight away (no flash, and
        // the bars exist when a view transition snapshots this page), then
        // refresh it from the network for the next page.
        var cached = readNavCache();
        var mounted = false;
        if (cached && cached.indexOf('site-statusbar') !== -1) {
            mount(placeholder, cached);
            mounted = true;
        }

        // Absolute path: works at any directory depth (/, /typing/, /apps/<id>/privacy-policy/, ...).
        fetch('/navbar.html')
            .then(function (resp) {
                if (!resp.ok) throw new Error('navbar fetch failed: ' + resp.status);
                return resp.text();
            })
            .then(function (html) {
                if (html !== cached) writeNavCache(html);
                if (!mounted) mount(placeholder, html);
            })
            .catch(function () {
                // The chrome is an enhancement; the page stays usable without it.
            });
    });
})();
