/* Site-wide navbar loader + behavior. Dependency-free: works with or without
   jQuery/Bootstrap on the host page (generated /apps/ privacy-policy pages load
   this file too, so it must never assume anything beyond vanilla DOM APIs). */
(function () {
    'use strict';

    var FA_HREF = 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/css/all.min.css';
    var FA_INTEGRITY = 'sha384-nRgPTkuX86pH8yjPJUAFuASXQSSl2/bBUiNV47vSYpKFxHJhbcrGnmlYpYJMeD7a';

    function ready(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    // Some pages (e.g. generated privacy-policy pages) only link /css/index.css.
    // Make sure the navbar's own stylesheet and icon font are present.
    function ensureStylesheet(href, integrity) {
        var links = document.querySelectorAll('link[rel="stylesheet"]');
        var name = href.split('/').pop();
        for (var i = 0; i < links.length; i++) {
            var existing = links[i].getAttribute('href') || '';
            if (existing.indexOf(name) !== -1 ||
                (name === 'all.min.css' && /font-?awesome/i.test(existing))) {
                return;
            }
        }
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        if (integrity) {
            link.integrity = integrity;
            link.crossOrigin = 'anonymous';
        }
        document.head.appendChild(link);
    }

    function highlightActiveLink(root) {
        var path = window.location.pathname;
        var id = null;
        if (path.indexOf('/typing/') !== -1 || path.indexOf('/deadlyBalloons/') !== -1) {
            id = 'gamesDropdown';
        } else if (path.indexOf('/music/') !== -1) {
            id = 'musicDropdown';
        } else if (path.indexOf('/parser/') !== -1) {
            id = 'parserDropdown';
        } else if (path.indexOf('/animation.html') !== -1) {
            id = 'testDropdown';
        } else if (path.indexOf('/apps/') !== -1) {
            id = 'appsLink';
        } else if (path.indexOf('/support/') !== -1) {
            id = 'supportLink';
        }
        if (id) {
            var el = root.querySelector('#' + id);
            if (el) el.classList.add('active');
        }
    }

    function initNavbar(root) {
        var nav = root.querySelector('.site-navbar');
        if (!nav) return;

        var toggler = nav.querySelector('.navbar-toggler');
        var links = nav.querySelector('.navbar-links');
        var dropdowns = Array.prototype.slice.call(nav.querySelectorAll('.nav-item.dropdown'));
        var desktop = window.matchMedia('(min-width: 992px)');
        var closeTimer = null;

        function setOpen(dropdown, open) {
            dropdown.classList.toggle('open', open);
            var toggle = dropdown.querySelector('.dropdown-toggle');
            if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        function closeAll(except) {
            dropdowns.forEach(function (d) {
                if (d !== except) setOpen(d, false);
            });
        }

        dropdowns.forEach(function (dropdown) {
            var toggle = dropdown.querySelector('.dropdown-toggle');

            // Click toggles everywhere (mobile accordion, touch devices, keyboard).
            if (toggle) {
                toggle.addEventListener('click', function (e) {
                    e.preventDefault();
                    var open = !dropdown.classList.contains('open');
                    closeAll(dropdown);
                    setOpen(dropdown, open);
                });
            }

            // Desktop hover: CSS opens instantly; JS keeps it open with a 500ms grace.
            dropdown.addEventListener('pointerenter', function () {
                if (!desktop.matches) return;
                clearTimeout(closeTimer);
                closeAll(dropdown);
                setOpen(dropdown, true);
            });
            dropdown.addEventListener('pointerleave', function () {
                if (!desktop.matches) return;
                clearTimeout(closeTimer);
                closeTimer = setTimeout(function () {
                    setOpen(dropdown, false);
                }, 500);
            });
        });

        document.addEventListener('click', function (e) {
            if (!nav.contains(e.target)) closeAll(null);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                var open = dropdowns.filter(function (d) { return d.classList.contains('open'); });
                closeAll(null);
                if (open.length) {
                    var toggle = open[0].querySelector('.dropdown-toggle');
                    if (toggle) toggle.focus();
                }
            }
        });

        if (toggler && links) {
            toggler.addEventListener('click', function () {
                var open = links.classList.toggle('open');
                toggler.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        }

        highlightActiveLink(root);
    }

    ready(function () {
        ensureStylesheet('/css/navbar.css');
        ensureStylesheet(FA_HREF, FA_INTEGRITY);

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
            })
            .catch(function () {
                // Navbar is an enhancement; the page stays usable without it.
            });
    });
})();
