// Landing page behavior. The page-load reveal is pure CSS (.reveal);
// this file only handles the footer year and the logo easter egg.
(function () {
    'use strict';

    var year = document.getElementById('footer-year');
    if (year) year.textContent = String(new Date().getFullYear());

    // Easter egg: hold the rex logo for two seconds.
    var logo = document.getElementById('rexLogo');
    var dialog = document.getElementById('romanticModal');
    if (!logo || !dialog || typeof dialog.showModal !== 'function') return;

    var HOLD_MS = 2000;
    var timer = null;

    function cancel() {
        clearTimeout(timer);
        timer = null;
        logo.classList.remove('long-press-active');
    }

    function restartAnimations() {
        var animated = dialog.querySelectorAll(
            '.floating-hearts i, .sparkle, .particle, .glow-ring, ' +
            '.romantic-message, .name-container, .main-heart, .radiant-light, .romantic-content'
        );
        animated.forEach(function (el) { el.style.animation = 'none'; });
        if (animated[0]) void animated[0].offsetHeight; // force reflow
        animated.forEach(function (el) { el.style.animation = ''; });
    }

    logo.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        cancel();
        logo.classList.add('long-press-active');
        timer = setTimeout(function () {
            cancel();
            restartAnimations();
            dialog.showModal();
        }, HOLD_MS);
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
        logo.addEventListener(type, cancel);
    });
    document.addEventListener('pointerup', cancel);

    logo.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    dialog.addEventListener('click', function (e) {
        if (e.target.closest('[data-close]') || e.target === dialog) dialog.close();
    });
})();
