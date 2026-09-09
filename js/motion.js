/* Shared scroll reveals for the hand-written sub-pages (see /css/motion.css).
   Dependency-free. Marks the document motion-ready only when it can
   actually reveal things, so content is never left hidden. Browsers with
   CSS scroll-driven animations handle the reveal in the stylesheet alone,
   so this file does nothing there. */
(function () {
    'use strict';

    var root = document.documentElement;
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.CSS && CSS.supports &&
        CSS.supports('animation-timeline: view()') &&
        CSS.supports('animation-range: entry 0% entry 40%')) {
        return;
    }

    var singles = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    var groups = Array.prototype.slice.call(document.querySelectorAll('[data-reveal-group]'));
    if (!singles.length && !groups.length) return;

    // Children of a group stagger by their index.
    groups.forEach(function (group) {
        Array.prototype.forEach.call(group.children, function (child, i) {
            child.style.setProperty('--rd', Math.min(i, 8) * 70 + 'ms');
        });
    });

    root.classList.add('motion-ready');

    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    singles.concat(groups).forEach(function (el) { io.observe(el); });
})();
