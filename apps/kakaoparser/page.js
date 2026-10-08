/* /apps/kakaoparser/ — sample report interactions. Dependency-free.
   - ranking tabs (WAI-ARIA tabs): bars race in, figures count up
   - 대화 패턴 heat cells fill once on screen; hover / tap / arrow keys read a cell out
   - 인기 단어 words settle into place; pressing one names its top user
   Everything is rendered in the HTML at its final state, so the page reads
   fine without this script; it only adds html.kp-js and the motion. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('kp-js');

  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(motionQuery && motionQuery.matches); }

  /* ---------- Browser chrome colour follows this page's paper ---------- */
  var PAGE_COLORS = { light: '#f2f3f7', dark: '#121316' };
  function effectiveTheme() {
    var t = root.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute('content', PAGE_COLORS[effectiveTheme()]);
  }
  syncThemeColor();
  document.addEventListener('rex:theme', syncThemeColor);
  if (window.matchMedia) {
    var schemeQuery = window.matchMedia('(prefers-color-scheme: light)');
    if (schemeQuery.addEventListener) schemeQuery.addEventListener('change', syncThemeColor);
  }

  /* ---------- Helpers ---------- */
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function fmtInt(n) { return Math.round(n).toLocaleString('ko-KR'); }
  function fmtTime(sec) {
    sec = Math.round(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m > 0 ? m + '분 ' + s + '초' : s + '초';
  }
  // Fires once the element's top has climbed past the bottom inset of the
  // viewport (20% by default). Viewport-relative on purpose: the report is taller than a
  // landscape phone, so an element-relative threshold might never be met.
  function whenVisible(el, fn, bottomInset) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.disconnect(); fn(); }
      });
    }, { threshold: 0, rootMargin: '0px 0px -' + (bottomInset || 20) + '% 0px' });
    io.observe(el);
  }

  /* ---------- Counters ---------- */
  // [data-count] elements: .kp-lead-num (keeps its unit spans) and .kp-bar-val (plain text).
  function renderCounter(el, value) {
    var format = el.getAttribute('data-format');
    var isLead = el.classList.contains('kp-lead-num');
    if (format === 'time') {
      if (isLead) {
        var sec = Math.round(value);
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        el.innerHTML = '<span class="n">' + m + '</span><span class="u">분</span> <span class="n">' + s + '</span><span class="u">초</span>';
      } else {
        el.textContent = fmtTime(value);
      }
      return;
    }
    var text = format === 'dec1' ? value.toFixed(1) : fmtInt(value);
    if (isLead) {
      var n = el.querySelector('.n');
      if (n) n.textContent = text;
    } else {
      el.textContent = text + (el.getAttribute('data-unit') || '');
    }
  }

  /* ---------- Ranking tabs + race ---------- */
  var report = document.querySelector('[data-report]');
  if (report) {
    var tabs = Array.prototype.slice.call(report.querySelectorAll('[role="tab"]'));
    var raf = 0;
    var live = false;

    function panelOf(tab) { return document.getElementById(tab.getAttribute('aria-controls')); }

    function settle(panel) {
      cancelAnimationFrame(raf);
      panel.classList.remove('is-reset');
      each(panel.querySelectorAll('[data-count]'), function (el) {
        renderCounter(el, parseFloat(el.getAttribute('data-count')));
      });
    }

    function race(panel) {
      if (!live) return;
      if (reduced()) { settle(panel); return; }
      cancelAnimationFrame(raf);

      var rows = panel.querySelectorAll('.kp-bars li');
      var jobs = [];
      var longest = 0;
      each(rows, function (li) {
        var w = parseFloat(li.style.getPropertyValue('--w')) / 100 || 0;
        var dur = 450 + 1150 * w;
        longest = Math.max(longest, dur);
        li.querySelector('.kp-bar').style.setProperty('--dur', dur + 'ms');
        var val = li.querySelector('[data-count]');
        if (val) jobs.push({ el: val, to: parseFloat(val.getAttribute('data-count')), dur: dur });
      });
      var lead = panel.querySelector('.kp-lead-num[data-count]');
      if (lead) jobs.push({ el: lead, to: parseFloat(lead.getAttribute('data-count')), dur: longest });

      panel.classList.add('is-reset');
      jobs.forEach(function (j) { renderCounter(j.el, 0); });
      void panel.offsetWidth; // commit the empty state before the bars grow
      panel.classList.remove('is-reset');

      var start = performance.now();
      function frame(now) {
        var done = true;
        jobs.forEach(function (j) {
          var t = Math.min(1, (now - start) / j.dur);
          if (t < 1) done = false;
          renderCounter(j.el, j.to * easeOut(t));
        });
        if (!done) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }

    function select(tab, moveFocus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        panelOf(t).hidden = !on;
      });
      if (moveFocus) tab.focus();
      race(panelOf(tab));
    }

    // Initial state: first tab, others hidden, figures parked at zero until on screen.
    tabs.forEach(function (t, i) {
      panelOf(t).hidden = i !== 0;
      t.tabIndex = i === 0 ? 0 : -1;
      t.addEventListener('click', function () { select(t, false); });
    });
    var first = panelOf(tabs[0]);
    if (!reduced()) {
      each(first.querySelectorAll('[data-count]'), function (el) { renderCounter(el, 0); });
    }

    report.querySelector('[role="tablist"]').addEventListener('keydown', function (e) {
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); select(next, true); }
    });

    function goLive() {
      live = true;
      report.classList.add('is-live');
      var current = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
      race(panelOf(current));
    }
    if (reduced()) goLive();
    else whenVisible(report.querySelector('.kp-panels') || report, goLive, 30);
  }

  /* ---------- 대화 패턴 heat cells ---------- */
  var heat = document.querySelector('[data-heat]');
  if (heat) {
    var readout = heat.querySelector('[data-readout]');
    var strips = heat.querySelectorAll('.kp-strip');
    var current = null;

    function hourLabel(h) {
      if (h === 0) return '오전 12시';
      if (h < 12) return '오전 ' + h + '시';
      if (h === 12) return '오후 12시';
      return '오후 ' + (h - 12) + '시';
    }

    each(strips, function (strip) {
      var cells = Array.prototype.slice.call(strip.querySelectorAll('.kp-cell'));
      var total = parseFloat(strip.getAttribute('data-total')) || 1;
      var isHour = strip.classList.contains('kp-strip-hour');
      var cols = isHour ? 6 : cells.length;

      cells.forEach(function (cell, i) {
        var value = parseFloat(cell.getAttribute('data-value'));
        var name = isHour ? hourLabel(i) : cell.getAttribute('data-label');
        cell._kp = { name: name, value: value, share: (100 * value / total).toFixed(1) };
        cell.setAttribute('aria-label', name + ', 메시지 ' + fmtInt(value) + '개');
        cell.tabIndex = i === 0 ? 0 : -1;

        function show() {
          if (current) current.classList.remove('is-current');
          current = cell;
          cell.classList.add('is-current');
          readout.innerHTML = '<strong>' + cell._kp.name + '</strong>에 메시지 <strong>' + fmtInt(cell._kp.value) +
            '개</strong>, 전체의 ' + cell._kp.share + '%예요.';
        }
        cell._kpShow = show;
        cell.addEventListener('mouseenter', show);
        cell.addEventListener('focus', function () {
          cells.forEach(function (c) { c.tabIndex = c === cell ? 0 : -1; });
          show();
        });
        cell.addEventListener('click', show);
      });

      strip.addEventListener('keydown', function (e) {
        var i = cells.indexOf(document.activeElement);
        if (i < 0) return;
        var j = i;
        if (e.key === 'ArrowRight') j = Math.min(cells.length - 1, i + 1);
        else if (e.key === 'ArrowLeft') j = Math.max(0, i - 1);
        else if (e.key === 'ArrowDown' && isHour) j = Math.min(cells.length - 1, i + cols);
        else if (e.key === 'ArrowUp' && isHour) j = Math.max(0, i - cols);
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = cells.length - 1;
        else return;
        e.preventDefault();
        cells[i].tabIndex = -1;
        cells[j].tabIndex = 0;
        cells[j].focus();
        cells[j]._kpShow();
      });
    });

    function fill() {
      if (reduced()) { heat.classList.add('is-live'); return; }
      var all = heat.querySelectorAll('.kp-cell');
      each(all, function (cell, i) { cell.style.transitionDelay = (i * 28) + 'ms, 0ms'; });
      heat.classList.add('is-live');
      setTimeout(function () {
        each(all, function (cell) { cell.style.transitionDelay = ''; });
      }, all.length * 28 + 700);
    }
    if (reduced()) fill();
    else whenVisible(heat.querySelector('.kp-strip') || heat, fill, 25);
  }

  /* ---------- 인기 단어 cloud ---------- */
  var cloud = document.querySelector('[data-cloud]');
  if (cloud) {
    var words = Array.prototype.slice.call(cloud.querySelectorAll('.kp-word'));
    var cloudReadout = cloud.querySelector('[data-readout]');

    words.forEach(function (w, i) {
      // deterministic scatter so the settle looks the same on every visit
      var a = (i * 137.5) * Math.PI / 180;
      var r = 40 + (i % 4) * 18;
      w.style.setProperty('--dx', Math.round(Math.cos(a) * r) + 'px');
      w.style.setProperty('--dy', Math.round(Math.sin(a) * r * 0.7) + 'px');
      w.style.setProperty('--r', ((i % 5) - 2) * 6 + 'deg');
      w.setAttribute('aria-pressed', 'false');

      w.addEventListener('click', function () {
        words.forEach(function (o) { o.setAttribute('aria-pressed', o === w ? 'true' : 'false'); });
        var word = w.textContent.trim();
        cloudReadout.innerHTML = '‘<strong>' + word + '</strong>’ 전체 ' + fmtInt(parseFloat(w.getAttribute('data-count'))) +
          '회. 가장 많이 쓴 사람은 <strong>' + w.getAttribute('data-top') + '</strong>(' +
          fmtInt(parseFloat(w.getAttribute('data-top-count'))) + '회)예요.';
      });
    });

    function settleWords() {
      if (reduced()) { cloud.classList.add('is-live'); return; }
      // big words land first, then the small ones drift in around them
      var order = words.slice().sort(function (x, y) {
        return parseFloat(y.style.getPropertyValue('--s')) - parseFloat(x.style.getPropertyValue('--s'));
      });
      order.forEach(function (w, i) { w.style.transitionDelay = '0ms, 0ms, ' + (i * 45) + 'ms, ' + (i * 45) + 'ms'; });
      cloud.classList.add('is-live');
      setTimeout(function () {
        words.forEach(function (w) { w.style.transitionDelay = ''; });
      }, words.length * 45 + 1000);
    }
    if (reduced()) settleWords();
    else whenVisible(cloud.querySelector('.kp-words') || cloud, settleWords, 25);
  }
})();
