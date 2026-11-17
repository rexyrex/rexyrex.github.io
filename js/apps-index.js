/* /apps/ — search and filter the app cards. Dependency-free. Without JS
   every card simply shows. A filter chip (All / App Store / Google Play /
   한국어 / Global) and the search box combine; ?q= and ?show= are kept in
   the address bar so a filtered view can be shared. */
(function () {
    'use strict';

    var grid = document.getElementById('dirGrid');
    var search = document.getElementById('dirSearch');
    var empty = document.getElementById('dirEmpty');
    var reset = document.getElementById('dirReset');
    var count = document.getElementById('dirCount');
    if (!grid || !search) return;

    var cards = Array.prototype.slice.call(grid.querySelectorAll('.dir-card'));
    var chips = Array.prototype.slice.call(document.querySelectorAll('.dir-chip'));
    var filter = 'all';

    function norm(s) {
        return (s || '').toLowerCase().normalize('NFC').trim();
    }

    function apply(push) {
        var q = norm(search.value);
        var shown = 0;
        cards.forEach(function (card) {
            var tags = ' ' + (card.getAttribute('data-tags') || '') + ' ';
            var keys = norm(card.getAttribute('data-keys') + ' ' + card.textContent);
            var ok = (filter === 'all' || tags.indexOf(' ' + filter + ' ') >= 0) &&
                (!q || q.split(/\s+/).every(function (w) { return keys.indexOf(w) >= 0; }));
            card.hidden = !ok;
            if (ok) shown++;
        });
        chips.forEach(function (c) {
            c.setAttribute('aria-pressed', c.getAttribute('data-filter') === filter ? 'true' : 'false');
        });
        if (empty) empty.hidden = shown !== 0;
        if (count) count.textContent = shown === cards.length ? '' : shown + ' / ' + cards.length;
        if (push) {
            try {
                var url = new URL(location.href);
                if (q) url.searchParams.set('q', search.value.trim()); else url.searchParams.delete('q');
                if (filter !== 'all') url.searchParams.set('show', filter); else url.searchParams.delete('show');
                history.replaceState(null, '', url.pathname + url.search + url.hash);
            } catch (e) { /* file:// or an old browser: the filter still works */ }
        }
    }

    chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
            filter = chip.getAttribute('data-filter') || 'all';
            apply(true);
        });
    });

    search.addEventListener('input', function () { apply(true); });
    search.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && search.value) {
            search.value = '';
            apply(true);
        }
    });

    if (reset) {
        reset.addEventListener('click', function () {
            search.value = '';
            filter = 'all';
            apply(true);
            search.focus();
        });
    }

    // Start from a shared link's ?q= / ?show=.
    try {
        var params = new URLSearchParams(location.search);
        var show = params.get('show');
        if (show && chips.some(function (c) { return c.getAttribute('data-filter') === show; })) filter = show;
        if (params.get('q')) search.value = params.get('q');
    } catch (e) { /* ignore */ }
    apply(false);
})();
