/* The result screen: grade, the numbers, a speed-over-time chart, where the
   score stands, the words that went wrong and a heat map of missed keys. */

import { t, unit, fmt, getUi } from './i18n.js';
import { grade } from './grades.js';
import { Keyboard } from './keyboard.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const clockText = (ms) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + (getUi() === 'ko' ? '초' : 's');
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/* ---------- Chart -------------------------------------------- */

function niceMax(v) {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

export function drawChart(box, samples, lang) {
  box.innerHTML = '';
  if (!samples.length) return;
  const W = Math.max(280, box.clientWidth || 700);
  const H = W < 520 ? 170 : 210;
  const pad = { l: 40, r: 14, t: 14, b: 26 };
  const maxT = Math.max(1, samples[samples.length - 1].t);
  const maxV = niceMax(Math.max(...samples.map((s) => Math.max(s.speed, s.raw))) * 1.08);
  const X = (tt) => pad.l + (tt / maxT) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - Math.min(v, maxV) / maxV) * (H - pad.t - pad.b);
  const pts = [{ t: 0, speed: samples[0].speed, raw: samples[0].raw }].concat(samples);
  const line = (key) => pts.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p[key]).toFixed(1)).join(' ');
  const speedPath = line('speed');
  const area = speedPath + ' L' + X(maxT).toFixed(1) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + ' Z';
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = (maxV / 4) * i;
    const y = Y(v).toFixed(1);
    grid += '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '" class="ch-grid"/>';
    grid += '<text x="' + (pad.l - 8) + '" y="' + (+y + 4) + '" class="ch-label" text-anchor="end">' + Math.round(v) + '</text>';
  }
  const stepT = maxT <= 20 ? 2 : maxT <= 45 ? 5 : maxT <= 90 ? 10 : maxT <= 180 ? 20 : 60;
  for (let tt = stepT; tt < maxT + 0.01; tt += stepT) {
    grid += '<text x="' + X(tt).toFixed(1) + '" y="' + (H - 6) + '" class="ch-label" text-anchor="middle">' + tt + '</text>';
  }
  let errs = '';
  for (const s of samples) {
    if (!s.errors) continue;
    const x = X(s.t - 0.5).toFixed(1);
    const y = (pad.t + 2).toFixed(1);
    const r = Math.min(6, 2.5 + s.errors);
    errs += '<g class="ch-err" transform="translate(' + x + ' ' + y + ')"><line x1="-' + r + '" y1="-' + r + '" x2="' + r + '" y2="' + r + '"/><line x1="' + r + '" y1="-' + r + '" x2="-' + r + '" y2="' + r + '"/></g>';
  }
  box.innerHTML =
    '<svg class="chart" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t('res.chartLabel')) + '">' +
    '<defs><linearGradient id="chFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="ch-stop-a"/><stop offset="1" class="ch-stop-b"/></linearGradient></defs>' +
    grid +
    '<path d="' + area + '" class="ch-area"/>' +
    '<path d="' + line('raw') + '" class="ch-raw"/>' +
    '<path d="' + speedPath + '" class="ch-speed"/>' +
    errs +
    '<line class="ch-cursor" x1="0" x2="0" y1="' + pad.t + '" y2="' + (H - pad.b) + '" visibility="hidden"/>' +
    '<circle class="ch-dot" r="4" visibility="hidden"/>' +
    '</svg><div class="ch-tip" hidden></div>';
  const svg = box.querySelector('svg');
  const tip = box.querySelector('.ch-tip');
  const cur = svg.querySelector('.ch-cursor');
  const dot = svg.querySelector('.ch-dot');
  const u = unit(lang);
  svg.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = samples[0];
    for (const s of samples) if (Math.abs(X(s.t) - px) < Math.abs(X(best.t) - px)) best = s;
    const x = X(best.t);
    cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x); dot.setAttribute('cy', Y(best.speed)); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = '<b>' + Math.round(best.t) + (getUi() === 'ko' ? '초' : 's') + '</b>' +
      '<span><i class="k-speed"></i>' + Math.round(best.speed) + ' ' + u + '</span>' +
      '<span><i class="k-raw"></i>' + t('res.raw') + ' ' + Math.round(best.raw) + '</span>' +
      (best.errors ? '<span><i class="k-err"></i>' + fmt('res.errorsN', { n: best.errors }) + '</span>' : '');
    const left = Math.min(W - tip.offsetWidth - 4, Math.max(4, x + 12));
    tip.style.transform = 'translate(' + left + 'px, 8px)';
  });
  svg.addEventListener('pointerleave', () => {
    tip.hidden = true;
    cur.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
  });
}

/* ---------- Count-up numbers --------------------------------- */

function countUp(el, to, decimals = 0) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.textContent = to.toFixed(decimals); return; }
  const t0 = performance.now();
  const dur = 700;
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = (to * e).toFixed(decimals);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

/* ---------- Confetti for a personal best --------------------- */

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  const colors = ['var(--accent)', 'var(--c-gold)', 'var(--c-race)', 'var(--c-daily)', 'var(--c-meteor)', 'var(--c-drills)'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
    p.style.setProperty('--dx', ((Math.random() - 0.5) * 240).toFixed(0) + 'px');
    p.style.setProperty('--r', ((Math.random() - 0.5) * 1440).toFixed(0) + 'deg');
    p.style.setProperty('--d', (Math.random() * 0.5).toFixed(2) + 's');
    p.style.setProperty('--t', (1.8 + Math.random() * 1.4).toFixed(2) + 's');
    p.style.setProperty('--c', colors[i % colors.length]);
    if (i % 3 === 0) p.style.borderRadius = '50%';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

/* ---------- Share text --------------------------------------- */

export function shareGrid(samples) {
  if (!samples.length) return '';
  const n = 10;
  const out = [];
  const per = samples.length / n;
  for (let i = 0; i < n; i++) {
    const part = samples.slice(Math.floor(i * per), Math.max(Math.floor((i + 1) * per), Math.floor(i * per) + 1));
    const e = part.reduce((a, s) => a + s.errors, 0);
    out.push(e === 0 ? '🟩' : e <= 2 ? '🟨' : '🟥');
  }
  return out.join('');
}

/* ---------- The screen --------------------------------------- */

/* r = { lang, kind, label, ranked, st, samples, mistakes, keyStats, outcome,
         failed, reason, best, daily, share } */
export function renderResult(root, r, actions) {
  const ui = getUi();
  const st = r.st;
  const g = grade(r.lang, st.speed, ui);
  const u = unit(r.lang);
  const toNext = g.next ? Math.ceil(g.next - st.speed) : 0;
  const o = r.outcome || {};
  const flags = [];
  if (r.failed) flags.push('<span class="chip chip-bad"><i class="fa-solid fa-skull"></i>' + t('res.failed') + '</span>');
  if (o.pb) flags.push('<span class="chip chip-pb"><i class="fa-solid fa-crown"></i>' + t('res.pb') + (o.pb.prev != null ? ' <small>' + fmt('res.pbPrev', { v: Math.round(o.pb.prev) }) + '</small>' : '') + '</span>');
  if (o.gained) flags.push('<span class="chip chip-xp">+' + o.gained + ' XP</span>');
  if (o.levelAfter > o.levelBefore) flags.push('<span class="chip chip-lv"><i class="fa-solid fa-arrow-up"></i>' + fmt('res.levelUp', { n: o.levelAfter }) + '</span>');

  const bestLine = r.best && !o.pb ? fmt('res.bestIs', { v: Math.round(r.best.s), u }) : '';

  root.innerHTML = `
    <div class="res-top">
      <div class="res-badge${r.failed ? ' res-badge-fail' : ''}" style="--tier:${g.index / (g.of - 1)}">
        <svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,4 92,27 92,73 50,96 8,73 8,27"/></svg>
        <span class="res-tier">${r.failed ? '✕' : esc(g.tier)}</span>
      </div>
      <div class="res-headline">
        <span class="res-kicker">${esc(r.label)}</span>
        <h2 class="res-title">${r.failed ? esc(t('res.failedTitle')) : esc(g.title)}</h2>
        <p class="res-sub">${r.failed ? esc(t('res.failedSub')) : g.next ? esc(fmt('res.toNext', { n: toNext, u })) : esc(t('res.top'))}${bestLine ? ' · ' + esc(bestLine) : ''}</p>
      </div>
      <div class="res-flags">${flags.join('')}</div>
    </div>

    <div class="res-nums">
      <div class="res-num res-num-main"><b data-count="${st.speed.toFixed(1)}">0</b><span>${esc(u)}</span></div>
      <div class="res-num res-num-main"><b><span data-count="${(st.acc * 100).toFixed(1)}" data-dec="1">0</span><small>%</small></b><span>${t('res.acc')}</span></div>
      <div class="res-num"><b>${Math.round(st.raw)}</b><span>${t('res.raw')}</span></div>
      <div class="res-num"><b>${Math.round(st.consistency)}<small>%</small></b><span>${t('res.cons')}</span></div>
      <div class="res-num"><b>${clockText(st.ms)}</b><span>${t('res.time')}</span></div>
      <div class="res-num"><b>${r.lang === 'ko' ? Math.round(st.cpm) : Math.round(st.cpm)}</b><span>${t('res.cpm')}</span></div>
    </div>

    <div class="tg-card res-chart-card">
      <header class="tg-card-head">
        <h3>${t('res.chart')}</h3>
        <div class="ch-legend"><span><i class="k-speed"></i>${esc(u)}</span><span><i class="k-raw"></i>${t('res.raw')}</span><span><i class="k-err"></i>${t('res.errors')}</span></div>
      </header>
      <div class="res-chart"></div>
    </div>

    <div class="res-cols">
      <div class="tg-card res-chars">
        <header class="tg-card-head"><h3>${t('res.chars')}</h3><span class="muted">${fmt('res.entries', { n: st.entries, e: st.errors })}</span></header>
        ${charBars(st)}
      </div>
      <div class="tg-card res-standing" id="resStanding">
        <header class="tg-card-head"><h3>${r.kind === 'daily' ? t('res.daily') : t('res.standing')}</h3>${r.ranked ? '<span class="chip chip-ranked">RANKED</span>' : ''}</header>
        <div class="standing-body"></div>
      </div>
    </div>

    <div class="res-actions">
      <button type="button" class="tg-btn tg-btn-primary tg-btn-lg" data-act="next"><i class="fa-solid fa-forward"></i><span>${t(r.kind === 'race' ? 'res.raceAgain' : 'res.next')}</span><kbd>enter</kbd></button>
      ${r.kind === 'race' ? '' : '<button type="button" class="tg-btn tg-btn-ghost" data-act="retry"><i class="fa-solid fa-rotate-left"></i><span>' + t('res.retry') + '</span></button>'}
      ${r.canSave ? '<button type="button" class="tg-btn tg-btn-ghost" data-act="save"><i class="fa-solid fa-trophy"></i><span>' + t('res.save') + '</span></button>' : ''}
      <button type="button" class="tg-btn tg-btn-ghost" data-act="share"><i class="fa-solid fa-share-nodes"></i><span>${t('res.share')}</span></button>
    </div>

    <div class="res-cols res-cols-more">
      <div class="tg-card res-mistakes">
        <header class="tg-card-head"><h3>${t('res.mistakes')}</h3><span class="muted">${r.mistakes.length}</span></header>
        ${r.mistakes.length ? '<ul class="miss-list">' + r.mistakes.slice(0, 60).map((m) => '<li><span class="miss-t">' + (esc(m.t) || '∅') + '</span><span class="miss-y">' + (esc(m.y) || '∅') + '</span></li>').join('') + '</ul>' : '<p class="empty-note"><i class="fa-solid fa-wand-magic-sparkles"></i> ' + t('res.noMistakes') + '</p>'}
      </div>
      <div class="tg-card res-heat">
        <header class="tg-card-head"><h3>${t('res.heat')}</h3><span class="muted">${t('res.heatNote')}</span></header>
        <div class="res-kbd"></div>
      </div>
    </div>`;

  root.querySelectorAll('[data-count]').forEach((el) => countUp(el, parseFloat(el.dataset.count), +(el.dataset.dec || 0)));
  if (o.pb && !r.confettiShown) { r.confettiShown = true; setTimeout(confetti, 350); }
  const chartBox = root.querySelector('.res-chart');
  requestAnimationFrame(() => drawChart(chartBox, r.samples, r.lang));
  const kb = new Keyboard(root.querySelector('.res-kbd'));
  kb.setLang(r.lang === 'ko' ? 'ko' : 'en');
  kb.heat(r.keyStats || {});
  root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act] && actions[b.dataset.act](b)));
  return { chartBox, standing: root.querySelector('.standing-body'), redraw: () => drawChart(chartBox, r.samples, r.lang) };
}

function charBars(st) {
  const total = Math.max(1, st.correct + st.incorrect + st.extra + st.missed);
  const seg = (n, cls) => (n ? '<i class="' + cls + '" style="flex:' + n + '"></i>' : '');
  return '<div class="char-bar">' + seg(st.correct, 'cb-ok') + seg(st.incorrect, 'cb-bad') + seg(st.extra, 'cb-extra') + seg(st.missed, 'cb-miss') + '</div>' +
    '<dl class="char-legend">' +
    '<div><dt><i class="cb-ok"></i>' + t('res.correct') + '</dt><dd>' + st.correct + '</dd></div>' +
    '<div><dt><i class="cb-bad"></i>' + t('res.incorrect') + '</dt><dd>' + st.incorrect + '</dd></div>' +
    '<div><dt><i class="cb-extra"></i>' + t('res.extra') + '</dt><dd>' + st.extra + '</dd></div>' +
    '<div><dt><i class="cb-miss"></i>' + t('res.missed') + '</dt><dd>' + st.missed + '</dd></div>' +
    '</dl>' +
    '<p class="char-acc">' + fmt('res.charAcc', { v: (st.charAcc * 100).toFixed(1), w: st.wordsOk, n: st.words }) + '</p>' +
    (total ? '' : '');
}
