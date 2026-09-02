/* Site-wide chrome loader: theme, fonts, navbar + status bar.
   Dependency-free on purpose — the generated /apps/ privacy-policy pages
   load this file too (with jQuery present), the typing game loads it with
   Bootstrap 4, and the main pages load it with nothing. Only vanilla DOM
   APIs may be assumed. */
(function () {
    'use strict';

    var FA_HREF = 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/css/all.min.css';
    var FA_INTEGRITY = 'sha384-nRgPTkuX86pH8yjPJUAFuASXQSSl2/bBUiNV47vSYpKFxHJhbcrGnmlYpYJMeD7a';
    var FONTS_HREF = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap';
    var THEME_KEY = 'rex-theme';

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

    applyTheme(readTheme());

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
                var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
                applyTheme(next);
                writeTheme(next);
                renderTheme();
            });
        }

        if (window.matchMedia) {
            var mq = window.matchMedia('(prefers-color-scheme: light)');
            var onChange = function () { renderTheme(); };
            if (mq.addEventListener) mq.addEventListener('change', onChange);
            else if (mq.addListener) mq.addListener(onChange);
        }

        renderTheme();
    }

    /* ---------- Boot --------------------------------------------- */

    ready(function () {
        ensureAssets();

        var placeholder = document.getElementById('nav-placeholder');
        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.id = 'nav-placeholder';
            document.body.insertBefore(placeholder, document.body.firstChild);
        }

        // Absolute path: works at any directory depth (/, /typing/, /apps/<id>/privacy-policy/, ...).
        fetch('/navbar.html')
            .then(function (resp) {
                if (!resp.ok) throw new Error('navbar fetch failed: ' + resp.status);
                return resp.text();
            })
            .then(function (html) {
                placeholder.innerHTML = html;
                placeholder.classList.add('loaded');
                initNavbar(placeholder);
                initStatusbar(placeholder);
            })
            .catch(function () {
                // The chrome is an enhancement; the page stays usable without it.
            });
    });
})();
