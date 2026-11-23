/* rex/type — the typing game's controller: routes (#/test, #/meteor …),
   the test / daily / drill flow, results, leaderboards, stats, settings. */

import { store, levelProgress, ACHIEVEMENTS } from './store.js';
import { t, fmt, unit, setUi, getUi, applyI18n } from './i18n.js';
import { Session } from './engine.js';
import { Stage } from './stage.js';
import { Keyboard } from './keyboard.js';
import { makeSource, newSeed, dailyText, dailyNumber, textSource, dayKey } from './content.js';
import { CODE_LANGS } from '../data/code.js';
import { grade } from './grades.js';
import * as sound from './sound.js';
import * as board from './board.js';
import { DRILLS, drillItems } from './drills.js';
import { renderResult, shareGrid, drawChart, confetti } from './result.js';
import { Meteor } from './meteor.js';
import { Race } from './race.js';

store.load();
const S = () => store.settings;
setUi(S().ui);
sound.setVolume(S().volume);
sound.setMuted(S().mute);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const visitId = board.uuid();

/* ---------- Toasts -------------------------------------------- */

export function toast(msg, opts = {}) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (opts.kind ? ' toast-' + opts.kind : '');
  el.innerHTML = (opts.icon ? '<i class="fa-solid ' + opts.icon + '" aria-hidden="true"></i>' : '') +
    '<div><b>' + esc(msg) + '</b>' + (opts.sub ? '<span>' + esc(opts.sub) + '</span>' : '') + '</div>';
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, opts.ms || 3200);
}

function announce(outcome) {
  if (!outcome) return;
  for (const id of outcome.unlocked || []) {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    toast(t('ach.' + id), { icon: a ? a.icon : 'fa-medal', sub: t('toast.achievement'), kind: 'ach', ms: 4200 });
    if (S().sfx) sound.play('power');
  }
  if (outcome.levelAfter > outcome.levelBefore) {
    toast(fmt('toast.level', { n: outcome.levelAfter }), { icon: 'fa-arrow-up', kind: 'level' });
  }
}

/* ---------- Routing ------------------------------------------- */

const ROUTES = { '': 'home', test: 'test', daily: 'test', drills: 'test', result: 'result', meteor: 'meteor', race: 'race', ranks: 'ranks', stats: 'stats' };
const views = {};
$$('[data-view]').forEach((v) => { views[v.dataset.view] = v; });
let route = null;

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return name in ROUTES ? name : '';
}

function go() {
  const r = currentRoute();
  const prev = route;
  if (prev !== null) leave(prev, r);
  route = r;
  const view = ROUTES[r];
  for (const [k, el] of Object.entries(views)) el.hidden = k !== view;
  document.body.dataset.route = r || 'home';
  $$('.tg-tabs a').forEach((a) => {
    const on = a.dataset.route === r || (r === 'result' && a.dataset.route === (lastResult && lastResult.navRoute));
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (prev !== r) window.scrollTo({ top: 0, behavior: 'instant' });
  enter(r);
}

function enter(r) {
  switch (r) {
    case '': renderHome(); break;
    case 'test': openTest('test'); break;
    case 'daily': openTest('daily'); break;
    case 'drills': openTest('drill'); break;
    case 'result': if (!lastResult) location.replace('#/test'); else showResult(); break;
    case 'meteor': meteor.enter(); break;
    case 'race': race.enter(); break;
    case 'ranks': openRanks(); break;
    case 'stats': renderStats(); break;
  }
}

function leave(r, next) {
  if (r === 'test' || r === 'daily' || r === 'drills') {
    stage.stop();
    document.body.classList.remove('focus-mode');
  }
  if (r === 'meteor') meteor.leave();
  if (r === 'race') race.leave();
}

/* ---------- Test: settings ------------------------------------ */

const SOURCES = {
  ko: ['sentence', 'proverb', 'quote', 'words', 'passage', 'office'],
  en: ['words', 'quote', 'passage']
};
const COUNTS = {
  words: { opts: [10, 25, 50, 100], def: 25 },
  sentence: { opts: [5, 10, 20], def: 10 },
  proverb: { opts: [5, 10, 20], def: 10 },
  office: { opts: [5, 10, 20], def: 10 },
  quote: { opts: [1, 3, 5], def: 3 },
  passage: { opts: [1, 2, 3], def: 1 },
  code: { opts: [1, 2, 3, 5], def: 2 }
};
const TIMES = [15, 30, 60, 120];

function testCfg() {
  const c = S().test;
  const lang = c.lang;
  const src = lang === 'code' ? 'code' : c.src[lang];
  const ck = lang === 'code' ? 'code' : src;
  const count = c.kind === 'count' ? (c.count[ck] || COUNTS[ck].def) : 0;
  return {
    lang, src, codeLang: c.src.code, kind: c.kind,
    time: c.kind === 'time' ? c.time : 0, count,
    diff: c.diff, punct: c.punct, nums: c.nums, sudden: c.sudden, pace: c.pace
  };
}

const isWordsEn = (cfg) => cfg.lang === 'en' && cfg.src === 'words';

function isRanked(cfg) {
  if (cfg.kind !== 'time' || cfg.time !== 60 || cfg.sudden) return false;
  if (cfg.lang === 'ko') return cfg.src === 'sentence' || cfg.src === 'office';
  if (cfg.lang === 'en') return isWordsEn(cfg) && cfg.diff === 'normal' && !cfg.punct && !cfg.nums;
  return cfg.lang === 'code';
}

const category = (lang) => (lang === 'ko' ? 'kor' : lang === 'en' ? 'eng' : 'prg');

function cfgKey(cfg) {
  return [
    cfg.lang,
    cfg.lang === 'code' ? cfg.codeLang : cfg.src,
    cfg.kind === 'time' ? 't' + cfg.time : 'n' + cfg.count,
    isWordsEn(cfg) ? cfg.diff + (cfg.punct ? 'p' : '') + (cfg.nums ? 'n' : '') : '',
    cfg.sudden ? 'sd' : ''
  ].join('|');
}

function langName(lang) { return lang === 'ko' ? '한글' : lang === 'en' ? 'English' : t('lang.code'); }

function cfgLabel(cfg) {
  const parts = [langName(cfg.lang)];
  if (cfg.lang === 'code') parts.push((CODE_LANGS.find((l) => l.id === cfg.codeLang) || {}).label || cfg.codeLang);
  else parts.push(t('src.' + cfg.src) + (isWordsEn(cfg) ? ' (' + t('cfg.' + cfg.diff) + ')' : ''));
  if (cfg.kind === 'time') parts.push(fmt('cfg.sec', { n: cfg.time }));
  else parts.push(fmt('cfg.n.' + (cfg.lang === 'code' ? 'code' : cfg.src), { n: cfg.count }));
  if (isWordsEn(cfg) && cfg.punct) parts.push(t('cfg.punct'));
  if (isWordsEn(cfg) && cfg.nums) parts.push(t('cfg.nums'));
  if (cfg.sudden) parts.push(t('cfg.sudden'));
  return parts.join(' · ');
}

function renderCfg() {
  const c = S().test;
  const cfg = testCfg();
  const bar = $('#cfgBar');
  const setOn = (group, v) => $$('button', group).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  setOn($('[data-k="lang"]', bar), c.lang);
  const srcBox = $('#cfgSrc');
  const codeWrap = $('#cfgCodeWrap');
  if (c.lang === 'code') {
    srcBox.hidden = true;
    codeWrap.hidden = false;
    $('#cfgCode').value = c.src.code;
  } else {
    srcBox.hidden = false;
    codeWrap.hidden = true;
    srcBox.innerHTML = SOURCES[c.lang].map((s) => '<button type="button" data-v="' + s + '">' + esc(t('src.' + s)) + '</button>').join('');
    setOn(srcBox, c.src[c.lang]);
  }
  setOn($('[data-k="kind"]', bar), c.kind);
  const len = $('#cfgLen');
  if (c.kind === 'time') {
    len.innerHTML = TIMES.map((n) => '<button type="button" data-v="' + n + '">' + n + '</button>').join('');
    setOn(len, c.time);
  } else {
    const ck = c.lang === 'code' ? 'code' : c.src[c.lang];
    len.innerHTML = COUNTS[ck].opts.map((n) => '<button type="button" data-v="' + n + '">' + n + '</button>').join('');
    setOn(len, cfg.count);
  }
  const wordsEn = isWordsEn(cfg);
  $('#cfgOpts').hidden = !wordsEn;
  $('#cfgDiff').hidden = !wordsEn;
  $('#cfgOptSep').hidden = !wordsEn;
  setOn($('#cfgDiff'), c.diff);
  $$('[data-t]', bar).forEach((b) => b.setAttribute('aria-pressed', String(!!c[b.dataset.t])));
}

function bindCfg() {
  const bar = $('#cfgBar');
  const sel = $('#cfgCode');
  sel.innerHTML = CODE_LANGS.map((l) => '<option value="' + l.id + '">' + esc(l.label) + '</option>').join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const c = S().test;
    const group = b.closest('[data-k]');
    if (b.dataset.t) {
      c[b.dataset.t] = !c[b.dataset.t];
    } else if (group) {
      const k = group.dataset.k;
      const v = b.dataset.v;
      if (k === 'lang') c.lang = v;
      else if (k === 'src') c.src[c.lang] = v;
      else if (k === 'kind') c.kind = v;
      else if (k === 'len') {
        if (c.kind === 'time') c.time = +v;
        else c.count[c.lang === 'code' ? 'code' : c.src[c.lang]] = +v;
      } else if (k === 'diff') c.diff = v;
    } else return;
    store.save();
    renderCfg();
    newTest();
  });
  sel.addEventListener('change', () => {
    S().test.src.code = sel.value;
    store.save();
    newTest();
  });
}

/* ---------- Test: running ------------------------------------- */

const testKbd = new Keyboard($('#testKbd'));
const stage = new Stage($('#testStage'), {
  keyboard: testKbd,
  settings: S,
  onFinish: (s) => finishTest(s),
  onRestart: () => newTest(),
  onEscape: () => { const b = $('#cfgBar button'); if (b && !$('#cfgBar').hidden) b.focus(); },
  onStart: () => document.body.classList.add('focus-mode')
});

const testState = { mode: 'test', drill: null, seed: newSeed(), session: null, cfg: null, lang: 'ko' };

function measure(stageEl, lang) {
  const box = $('.stage-text', stageEl);
  stageEl.dataset.lang = lang;
  stageEl.dataset.size = S().size;
  const w = box.clientWidth;
  if (!w) return 0;
  const probe = document.createElement('span');
  probe.className = 'measure';
  probe.textContent = lang === 'ko' ? '가나다라마 바사아자차 카타파하.' : 'the quick brown fox jumps over a lazy dog';
  $('.stage-lines', box).appendChild(probe);
  const cw = probe.getBoundingClientRect().width / probe.textContent.length;
  probe.remove();
  return cw ? Math.max(12, Math.floor(w / cw) - 2) : 0;
}

function showKeyboard() {
  const k = S().keyboard;
  const on = k === 'always' || (k === 'drills' && testState.mode === 'drill');
  $('#testKbd').hidden = !on;
}

function openTest(mode) {
  testState.mode = mode;
  const view = views.test;
  view.dataset.mode = mode;
  $('#dailyBanner').hidden = mode !== 'daily';
  $('#drillPick').hidden = mode !== 'drill';
  $('#cfgBar').hidden = mode !== 'test';
  showKeyboard();
  if (mode === 'daily') renderDailyBanner();
  if (mode === 'drill') {
    renderDrills();
    if (!testState.drill || testState.drill.id.slice(0, 2) !== S().drillLang) testState.drill = DRILLS[S().drillLang][0];
    markDrill();
  }
  if (mode === 'test') renderCfg();
  const reuse = testState.reuse;
  testState.reuse = false;
  newTest(reuse);
}

function newTest(same) {
  if (!same) testState.seed = newSeed();
  const mode = testState.mode;
  const el = $('#testStage');
  let session;
  const opts = {};
  testState.cfg = null;
  if (mode === 'daily') {
    const lang = S().dailyLang;
    const budget = measure(el, lang);
    session = new Session({ source: textSource(dailyText(lang), budget || (lang === 'ko' ? 30 : 56)), lang, time: 0 });
    opts.tag = fmt('tag.daily', { n: dailyNumber() });
    opts.tagClass = 'tag-daily';
    testState.lang = lang;
  } else if (mode === 'drill') {
    const d = testState.drill;
    const lang = d.id.slice(0, 2);
    // "same text again" keeps the drill's words (weak keys shift after every run)
    let drill = same && testState.drillText && testState.drillText.id === d.id ? testState.drillText : null;
    if (!drill) {
      drill = drillItems(d, store, testState.seed);
      drill.id = d.id;
      testState.drillText = drill;
    }
    const { items, weak } = drill;
    if (!items || !items.length) {
      testState.drillText = null;
      toast(t('drill.needData'), { icon: 'fa-circle-info' });
      testState.drill = DRILLS[lang].find((x) => x.rows === 'all') || DRILLS[lang][0];
      markDrill();
      return newTest(true);
    }
    if (weak && weak.length) toast(fmt('drill.weakKeys', { k: weak.map((w) => w.k.toUpperCase()).join(' ') }), { icon: 'fa-crosshairs' });
    const budget = measure(el, lang);
    session = new Session({ source: textSource(items.join(' '), budget || (lang === 'ko' ? 30 : 56)), lang, time: 0 });
    opts.tag = t('drill.' + d.id);
    opts.tagClass = 'tag-drill';
    testState.lang = lang;
  } else {
    const cfg = testCfg();
    testState.cfg = cfg;
    const budget = measure(el, cfg.lang);
    session = new Session({ source: makeSource({ ...cfg, seed: testState.seed }, budget), lang: cfg.lang, time: cfg.time, sudden: cfg.sudden });
    const ranked = isRanked(cfg);
    opts.tag = ranked ? 'RANKED' : t('tag.practice');
    opts.tagClass = ranked ? 'tag-ranked' : 'tag-practice';
    if (cfg.sudden) { opts.tag = t('cfg.sudden'); opts.tagClass = 'tag-sudden'; }
    if (cfg.pace) {
      const b = store.best(cfgKey(cfg)) || store.recent(cfg.lang);
      opts.pace = b && b.cpm ? b.cpm : (cfg.lang === 'ko' ? 160 : 200);
    }
    testState.lang = cfg.lang;
  }
  testState.session = session;
  document.body.classList.remove('focus-mode');
  stage.load(session, opts);
  if (route === 'test' || route === 'daily' || route === 'drills') stage.focus();
}

function renderDailyBanner() {
  const n = dailyNumber();
  $('#dailyNo').textContent = '#' + n;
  const lang = S().dailyLang;
  $$('#dailyLang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  const mine = store.data.daily[dayKey() + ':' + lang];
  $('#dailyNote').textContent = mine
    ? fmt('daily.done', { v: Math.round(mine.s), u: unit(lang), a: Math.round(mine.a * 100) })
    : t('daily.note');
}

function renderDrills() {
  const lang = S().drillLang;
  $$('#drillLang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $('#drillList').innerHTML = DRILLS[lang].map((d) => {
    const best = store.best('drill|' + d.id);
    return '<button type="button" class="drill-card" data-id="' + d.id + '">' +
      '<i class="fa-solid ' + d.icon + '" aria-hidden="true"></i>' +
      '<b>' + esc(t('drill.' + d.id)) + '</b>' +
      '<span>' + esc(t('drill.' + d.id + '.d')) + '</span>' +
      (best ? '<small>' + Math.round(best.s) + ' ' + esc(unit(lang)) + '</small>' : '') +
      '</button>';
  }).join('');
}

function markDrill() {
  $$('#drillList .drill-card').forEach((b) => b.setAttribute('aria-pressed', String(testState.drill && b.dataset.id === testState.drill.id)));
}

function bindDailyDrill() {
  $('#dailyLang').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    store.set('dailyLang', b.dataset.lang);
    renderDailyBanner();
    newTest();
  });
  $('#drillLang').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    store.set('drillLang', b.dataset.lang);
    testState.drill = DRILLS[b.dataset.lang][0];
    renderDrills();
    markDrill();
    newTest();
  });
  $('#drillList').addEventListener('click', (e) => {
    const b = e.target.closest('.drill-card');
    if (!b) return;
    testState.drill = DRILLS[S().drillLang].find((d) => d.id === b.dataset.id);
    markDrill();
    newTest();
  });
}

/* ---------- Test: finished ------------------------------------ */

let lastResult = null;

// The record shape every version of the game has written to Firestore.
function legacyRecord(session, st, lang, src, g, keyMap) {
  const parts = session.results.slice();
  if (session.partial) parts.push(session.partial);
  return {
    score: Math.round(st.speed),
    accuracy: Math.round(st.acc * 1000) / 1000,
    correctWordCount: st.wordsOk,
    incorrectWordCount: st.words - st.wordsOk,
    givenSentenceList: parts.map((p) => p.target),
    typedSentenceList: parts.map((p) => p.typed),
    keyMap: Object.entries(keyMap || {}).map(([name, value]) => ({ name, value })),
    rank: g.titleKo,
    mode: lang === 'ko' ? (src === 'office' ? 2 : 1) : lang === 'en' ? 3 : 4,
    keyPressCount: Object.values(keyMap || {}).reduce((a, b) => a + b, 0)
  };
}

function finishTest(session) {
  document.body.classList.remove('focus-mode');
  const st = session.stats();
  if (!session.started || st.entries < 2 || st.ms < 1000) {
    newTest(true);
    return;
  }
  const mode = testState.mode;
  const lang = session.lang;
  const cfg = testState.cfg;
  const failed = session.reason === 'fail';
  const ranked = mode === 'test' && cfg && isRanked(cfg) && !failed;
  const key = mode === 'daily' ? 'daily|' + lang : mode === 'drill' ? 'drill|' + testState.drill.id : cfgKey(cfg);
  const best = store.best(key);
  const samples = session.samples;
  const outcome = store.addResult({
    kind: mode, lang, cfgKey: key, speed: st.speed, cpm: st.cpm, acc: st.acc, raw: st.raw, ms: st.ms,
    chars: st.correct, ranked, sudden: !!(cfg && cfg.sudden), failed,
    codeLang: lang === 'code' && cfg ? cfg.codeLang : null, keyStats: session.keyStats,
    grid: mode === 'daily' ? shareGrid(samples) : ''
  });
  const g = grade(lang, st.speed, 'ko');
  let label;
  if (mode === 'daily') label = fmt('tag.daily', { n: dailyNumber() }) + ' · ' + langName(lang);
  else if (mode === 'drill') label = t('nav.drills') + ' · ' + t('drill.' + testState.drill.id);
  else label = cfgLabel(cfg) + (ranked ? ' · RANKED' : '');
  lastResult = {
    kind: mode, lang, label, ranked, st, samples, failed, reason: session.reason,
    mistakes: session.mistakes(), keyStats: session.keyStats, outcome, best,
    canSave: ranked && Math.round(st.speed) > 0,
    navRoute: mode === 'daily' ? 'daily' : mode === 'drill' ? 'drills' : 'test',
    cat: category(lang),
    record: legacyRecord(session, st, lang, cfg && cfg.src, g, stage.keyMap),
    dailyNo: dailyNumber()
  };
  if (ranked && lastResult.canSave) lastResult.anon = board.submitAnon(lastResult.cat, visitId + '-' + Date.now(), lastResult.record);
  if (S().sfx) sound.play(failed ? 'fail' : 'finish');
  location.hash = '#/result';
  setTimeout(() => announce(outcome), 500);
}

function showResult() {
  const r = lastResult;
  const view = $('#result');
  const handle = renderResult(view, r, {
    next: () => again(false),
    retry: () => again(true),
    save: () => openSave({
      cat: r.cat,
      summary: r.label + ' — ' + Math.round(r.st.speed) + ' ' + unit(r.lang) + ' · ' + Math.round(r.st.acc * 100) + '%',
      record: r.record,
      anon: r.anon,
      onSaved: () => { r.saved = true; }
    }),
    share: () => share(r)
  });
  resultHandle = handle;
  fillStanding(r, handle.standing);
}

let resultHandle = null;

function again(same) {
  const r = lastResult;
  if (r && r.kind === 'race') { location.hash = '#/race'; return; }
  // openTest() reads this when the route changes
  testState.reuse = !!same;
  location.hash = '#/' + (r ? r.navRoute : 'test');
}

async function fillStanding(r, box) {
  if (r.kind === 'daily') {
    const mine = store.data.daily[dayKey() + ':' + r.lang];
    box.innerHTML = '<div class="daily-res"><span class="daily-no">#' + r.dailyNo + '</span>' +
      '<p>' + esc(mine ? fmt('daily.best', { v: Math.round(mine.s), u: unit(r.lang), a: Math.round(mine.a * 100) }) : '') + '</p>' +
      '<p class="share-grid">' + shareGrid(r.samples) + '</p>' +
      '<p class="muted">' + esc(t('daily.tomorrow')) + '</p></div>';
    return;
  }
  if (r.kind === 'drill') {
    const rows = Object.entries(r.keyStats || {}).filter(([, s]) => s[1] > 0).sort((a, b) => b[1][1] - a[1][1]).slice(0, 6);
    box.innerHTML = rows.length
      ? '<p>' + esc(t('res.drillWeak')) + '</p><div class="key-chips">' + rows.map(([k, s]) => '<kbd>' + esc(k === ' ' ? 'space' : k) + '<small>' + s[1] + '</small></kbd>').join('') + '</div>'
      : '<p class="empty-note"><i class="fa-solid fa-wand-magic-sparkles"></i> ' + esc(t('res.drillClean')) + '</p>';
    return;
  }
  if (!r.ranked) {
    box.innerHTML = '<p>' + esc(t('res.practiceNote')) + '</p>' +
      (r.best ? '<p class="muted">' + esc(fmt('res.bestIs', { v: Math.round(r.best.s), u: unit(r.lang) })) + '</p>' : '');
    return;
  }
  box.innerHTML = '<div class="standing-rows"><div><span>' + esc(t('res.today')) + '</span><b class="st-today"><i class="fa-solid fa-spinner fa-spin"></i></b></div>' +
    '<div><span>' + esc(t('res.allTime')) + '</span><b class="st-all"><i class="fa-solid fa-spinner fa-spin"></i></b></div></div>' +
    (board.LOCAL ? '<p class="muted">' + esc(t('res.localNote')) + '</p>' : '<p class="muted">' + esc(t('res.anonNote')) + '</p>');
  const score = Math.round(r.st.speed);
  const place = (rows) => 1 + rows.filter((x) => (x.score || 0) > score).length;
  try {
    const today = await board.top(r.cat, true);
    $('.st-today', box).textContent = fmt('res.place', { n: place(today) }) + ' / ' + Math.max(today.length, place(today));
  } catch (e) { $('.st-today', box).textContent = '—'; }
  try {
    const all = await board.top(r.cat, false);
    const p = place(all);
    $('.st-all', box).textContent = p <= 100 ? fmt('res.place', { n: p }) : t('res.outside');
  } catch (e) { $('.st-all', box).textContent = '—'; }
}

async function share(r) {
  const u = unit(r.lang);
  const speed = Math.round(r.st.speed);
  const acc = Math.round(r.st.acc * 100);
  let text;
  if (r.kind === 'daily') {
    text = 'rex/type ' + fmt('tag.daily', { n: r.dailyNo }) + ' (' + langName(r.lang) + ')\n' + shareGrid(r.samples) + '\n' + speed + ' ' + u + ' · ' + acc + '%\nhttps://rexyrex.github.io/typing/#/daily';
  } else {
    const g = grade(r.lang, r.st.speed, getUi());
    text = 'rex/type — ' + r.label + '\n' + speed + ' ' + u + ' · ' + acc + '% · ' + g.tier + ' "' + g.title + '"\nhttps://rexyrex.github.io/typing/';
  }
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast(t('toast.copied'), { icon: 'fa-clipboard-check', sub: text.split('\n')[0] });
  } catch (e) {
    toast(t('toast.copyFail'), { icon: 'fa-circle-exclamation' });
  }
}

/* ---------- Save to a leaderboard ----------------------------- */

let saveCtx = null;

export function openSave(ctx) {
  saveCtx = ctx;
  const dlg = $('#saveDialog');
  $('#saveSummary').textContent = ctx.summary;
  $('#saveName').value = S().name || '';
  $('#saveMsg').textContent = '';
  $('#saveMsg').className = 'save-msg';
  $('#saveSubmit').disabled = false;
  dlg.showModal();
  setTimeout(() => $('#saveName').select(), 30);
}

function bindSave() {
  const dlg = $('#saveDialog');
  $('#saveClose').addEventListener('click', () => dlg.close());
  $('#saveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#saveName').value.trim();
    const msg = $('#saveMsg');
    msg.className = 'save-msg';
    if (name.length < 2) { msg.textContent = t('save.short'); msg.classList.add('bad'); return; }
    if (name.length > 8) { msg.textContent = t('save.long'); msg.classList.add('bad'); return; }
    store.set('name', name);
    $('#saveSubmit').disabled = true;
    msg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + esc(t('save.saving'));
    const anon = saveCtx.anon ? await saveCtx.anon : null;
    const res = await board.saveNamed(saveCtx.cat, name, saveCtx.record, anon);
    $('#saveSubmit').disabled = false;
    if (res.status === 'new' || res.status === 'improved') {
      msg.textContent = res.status === 'new' ? t('save.new') : fmt('save.improved', { p: res.prev, s: saveCtx.record.score });
      msg.classList.add('good');
      sound.play('power');
      if (saveCtx.onSaved) saveCtx.onSaved();
      setTimeout(() => dlg.close(), 1600);
    } else if (res.status === 'lower') {
      msg.textContent = fmt('save.lower', { p: res.prev });
      msg.classList.add('bad');
    } else if (res.status === 'local') {
      msg.textContent = t('save.local');
    } else {
      msg.textContent = t('save.error');
      msg.classList.add('bad');
    }
  });
}

/* ---------- Home ---------------------------------------------- */

function renderHome() {
  const d = store.data;
  const n = dailyNumber();
  $('#homeDailyNo').textContent = '#' + n;
  $('#mcDailyNo').textContent = '#' + n;
  const lp = levelProgress(d.xp);
  const items = [];
  items.push('<li class="me-level"><span class="lv-ring" style="--p:' + (lp.into / lp.need) + '"><b>' + lp.level + '</b></span><span><b>' + t('stats.level') + ' ' + lp.level + '</b><small>' + lp.into + ' / ' + lp.need + ' XP</small></span></li>');
  const ko = store.bestFor('ko');
  const en = store.bestFor('en');
  items.push('<li><i class="fa-solid fa-language"></i><span><b>' + (ko ? Math.round(ko.s) : '—') + '</b><small>' + t('home.bestKo') + '</small></span></li>');
  items.push('<li><i class="fa-solid fa-earth-americas"></i><span><b>' + (en ? Math.round(en.s) : '—') + '</b><small>' + t('home.bestEn') + '</small></span></li>');
  items.push('<li><i class="fa-solid fa-fire"></i><span><b>' + store.streakNow() + '</b><small>' + t('home.streak') + '</small></span></li>');
  $('#homeMe').innerHTML = items.join('');
  loadMiniBoard();
}

let miniCat = 'kor';
async function loadMiniBoard() {
  const box = $('#homeBoard');
  $$('#homeBoardTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cat === miniCat)));
  box.innerHTML = '<li class="mb-state"><i class="fa-solid fa-spinner fa-spin"></i></li>';
  const cat = miniCat;
  try {
    const rows = await board.top(cat, true, 5);
    if (cat !== miniCat) return;
    if (!rows.length) { box.innerHTML = '<li class="mb-state">' + esc(t('ranks.emptyToday')) + '</li>'; return; }
    box.innerHTML = rows.map((r, i) => '<li><span class="mb-place p' + (i + 1) + '">' + (i + 1) + '</span><span class="mb-name">' + esc(r.id || t('ranks.anon')) + '</span><span class="mb-score">' + esc(r.score) + '</span></li>').join('');
  } catch (e) {
    box.innerHTML = '<li class="mb-state">' + esc(t('ranks.error')) + '</li>';
  }
}

/* ---------- Leaderboards -------------------------------------- */

const rankState = { cat: 'kor', range: 'daily' };

function openRanks() {
  $$('#rankCats button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cat === rankState.cat)));
  $$('#rankRange button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === rankState.range)));
  loadRanks();
}

async function loadRanks() {
  const { cat, range } = rankState;
  const body = $('#rankTable tbody');
  const state = $('#rankState');
  body.innerHTML = '';
  state.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + esc(t('ranks.loading'));
  state.hidden = false;
  $('#ranksNote').textContent = range === 'daily' ? fmt('ranks.noteToday', { d: board.day() }) : t('ranks.noteAll');
  try {
    const rows = await board.top(cat, range === 'daily');
    if (cat !== rankState.cat || range !== rankState.range) return;
    if (!rows.length) { state.textContent = t(range === 'daily' ? 'ranks.emptyToday' : 'ranks.empty'); return; }
    state.hidden = true;
    const me = S().name;
    body.innerHTML = rows.map((r, i) => {
      const gradeTxt = cat === 'meteor' ? 'Lv.' + (r.level || 1) : (r.rank || '');
      const date = String(r.date || '').slice(0, 10);
      return '<tr class="' + (me && r.id === me ? 'me' : '') + '"><td><span class="place p' + (i + 1) + '">' + (i + 1) + '</span></td>' +
        '<td class="rk-name">' + esc(r.id || t('ranks.anon')) + '</td><td class="rk-grade">' + esc(gradeTxt) + '</td>' +
        '<td class="num rk-score">' + esc(r.score) + '</td><td class="num rank-date">' + esc(date) + '</td></tr>';
    }).join('');
  } catch (e) {
    state.textContent = t('ranks.error');
  }
}

function bindRanks() {
  $('#rankCats').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    rankState.cat = b.dataset.cat;
    openRanks();
  });
  $('#rankRange').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    rankState.range = b.dataset.range;
    openRanks();
  });
  $('#homeBoardTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    miniCat = b.dataset.cat;
    loadMiniBoard();
  });
}

/* ---------- My stats ------------------------------------------ */

function renderStats() {
  const d = store.data;
  const lp = levelProgress(d.xp);
  const box = $('#statsBody');
  const hours = d.totals.ms / 3600000;
  const timeTxt = hours >= 1 ? hours.toFixed(1) + (getUi() === 'ko' ? '시간' : 'h') : Math.round(d.totals.ms / 60000) + (getUi() === 'ko' ? '분' : 'm');
  const cards = [
    ['fa-keyboard', d.totals.tests, t('stats.tests')],
    ['fa-clock', timeTxt, t('stats.time')],
    ['fa-font', d.totals.chars.toLocaleString(), t('stats.chars')],
    ['fa-fire', store.streakNow() + ' / ' + d.streak.best, t('stats.streak')],
    ['fa-meteor', d.meteor.best.toLocaleString(), t('stats.meteor')],
    ['fa-flag-checkered', d.race.wins + ' / ' + d.race.races, t('stats.race')]
  ];
  const bests = Object.entries(d.bests)
    .filter(([k]) => !k.startsWith('drill'))
    .sort((a, b) => b[1].t - a[1].t)
    .slice(0, 12);
  const got = Object.keys(d.achievements).length;
  box.innerHTML = `
    <div class="stats-profile tg-card">
      <span class="lv-ring lv-ring-lg" style="--p:${lp.into / lp.need}"><b>${lp.level}</b></span>
      <div class="sp-text">
        <span class="muted">${t('stats.level')}</span>
        <b>${esc(levelTitle(lp.level))}</b>
        <div class="xp-bar"><i style="width:${(lp.into / lp.need) * 100}%"></i></div>
        <small>${lp.into} / ${lp.need} XP · ${t('stats.total')} ${d.xp.toLocaleString()} XP</small>
      </div>
    </div>
    <div class="stat-cards">${cards.map((c) => '<div class="tg-card stat-card"><i class="fa-solid ' + c[0] + '"></i><b>' + c[1] + '</b><span>' + esc(c[2]) + '</span></div>').join('')}</div>
    <div class="res-cols">
      <section class="tg-card">
        <header class="tg-card-head"><h3>${t('stats.history')}</h3>
          <div class="seg seg-sm" id="histLang"><button type="button" data-l="ko">한글</button><button type="button" data-l="en">English</button><button type="button" data-l="code">${t('lang.code')}</button></div>
        </header>
        <div class="res-chart" id="histChart"></div>
      </section>
      <section class="tg-card">
        <header class="tg-card-head"><h3>${t('stats.bests')}</h3></header>
        ${bests.length ? '<table class="rank-table bests"><tbody>' + bests.map(([k, v]) => '<tr><td>' + esc(keyLabel(k)) + '</td><td class="num"><b>' + Math.round(v.s) + '</b> <small>' + esc(unit(keyLang(k))) + '</small></td><td class="num muted">' + Math.round(v.a * 100) + '%</td></tr>').join('') + '</tbody></table>' : '<p class="empty-note">' + esc(t('stats.noBests')) + '</p>'}
      </section>
    </div>
    <section class="tg-card stats-keys">
      <header class="tg-card-head"><h3>${t('stats.keys')}</h3>
        <div class="seg seg-sm" id="keysLang"><button type="button" data-l="ko">한글</button><button type="button" data-l="en">English</button></div>
      </header>
      <div id="statsKbd"></div>
      <p class="muted">${t('stats.keysNote')}</p>
    </section>
    <section class="tg-card">
      <header class="tg-card-head"><h3>${t('stats.ach')}</h3><span class="muted">${got} / ${ACHIEVEMENTS.length}</span></header>
      <ul class="ach-grid">${ACHIEVEMENTS.map((a) => {
        const on = d.achievements[a.id];
        return '<li class="' + (on ? 'on' : '') + '"><i class="fa-solid ' + a.icon + '"></i><b>' + esc(t('ach.' + a.id)) + '</b><span>' + esc(t('ach.' + a.id + '.d')) + '</span></li>';
      }).join('')}</ul>
    </section>`;
  const kb = new Keyboard($('#statsKbd'));
  const showKeys = (l) => {
    $$('#keysLang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === l)));
    kb.setLang(l);
    kb.heat(d.keyStats[l]);
  };
  $('#keysLang').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showKeys(b.dataset.l); });
  showKeys(getUi() === 'ko' ? 'ko' : 'en');
  const showHist = (l) => {
    $$('#histLang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === l)));
    const h = d.history.filter((x) => x.l === l && !x.f && x.k !== 'drill').slice(-60);
    const box2 = $('#histChart');
    if (h.length < 2) { box2.innerHTML = '<p class="empty-note">' + esc(t('stats.noHistory')) + '</p>'; return; }
    drawChart(box2, h.map((x, i) => ({ t: i + 1, speed: x.s, raw: x.s, errors: 0 })), l);
  };
  $('#histLang').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showHist(b.dataset.l); });
  const lastLang = (d.history[d.history.length - 1] || {}).l || 'ko';
  showHist(lastLang === 'code' || lastLang === 'en' ? lastLang : 'ko');
}

function levelTitle(lv) {
  const titles = ['stats.lv1', 'stats.lv2', 'stats.lv3', 'stats.lv4', 'stats.lv5', 'stats.lv6', 'stats.lv7'];
  return t(titles[Math.min(titles.length - 1, Math.floor((lv - 1) / 4))]);
}

// the language a personal-best key belongs to (daily|ko, race|en, ko|sentence|…)
const keyLang = (k) => { const p = k.split('|'); return p[0] === 'daily' || p[0] === 'race' ? p[1] : p[0]; };

function keyLabel(k) {
  const p = k.split('|');
  if (p[0] === 'daily') return t('nav.daily') + ' · ' + langName(p[1]);
  if (p[0] === 'race') return t('nav.race') + ' · ' + langName(p[1]);
  const lang = p[0];
  const what = lang === 'code' ? ((CODE_LANGS.find((l) => l.id === p[1]) || {}).label || p[1]) : t('src.' + p[1]);
  const len = p[2][0] === 't' ? fmt('cfg.sec', { n: +p[2].slice(1) }) : fmt('cfg.n.' + (lang === 'code' ? 'code' : p[1]), { n: +p[2].slice(1) });
  return langName(lang) + ' · ' + what + ' · ' + len + (p[3] ? ' · ' + t('cfg.' + p[3].replace(/[pn]+$/, '')) : '') + (p[4] ? ' · ' + t('cfg.sudden') : '');
}

/* ---------- Settings ------------------------------------------ */

const SETTING_ROWS = [
  { k: 'ui', opts: [['ko', '한국어'], ['en', 'English']] },
  { k: 'keySound', opts: [['off', 'set.off'], ['soft', 'set.soft'], ['typewriter', 'set.typewriter']] },
  { k: 'sfx', opts: [[true, 'set.on'], [false, 'set.off']] },
  { k: 'volume', range: true },
  { k: 'caret', opts: [['line', 'set.caretLine'], ['block', 'set.caretBlock'], ['under', 'set.caretUnder']] },
  { k: 'smooth', opts: [[true, 'set.on'], [false, 'set.off']] },
  { k: 'liveSpeed', opts: [[true, 'set.on'], [false, 'set.off']] },
  { k: 'keyboard', opts: [['always', 'set.kbAlways'], ['drills', 'set.kbDrills'], ['off', 'set.off']] },
  { k: 'size', opts: [['s', 'set.small'], ['m', 'set.medium'], ['l', 'set.large']] }
];

function renderSettings() {
  const s = S();
  $('#settingsRows').innerHTML = SETTING_ROWS.map((row) => {
    let ctl;
    if (row.range) {
      ctl = '<input type="range" min="0" max="1" step="0.05" value="' + s.volume + '" data-k="volume" aria-label="' + esc(t('set.volume')) + '">';
    } else {
      ctl = '<div class="seg seg-sm">' + row.opts.map(([v, label]) => '<button type="button" data-k="' + row.k + '" data-v="' + v + '" aria-pressed="' + (s[row.k] === v) + '">' + esc(label.startsWith('set.') ? t(label) : label) + '</button>').join('') + '</div>';
    }
    return '<div class="set-row"><span>' + esc(t('set.' + row.k)) + '</span>' + ctl + '</div>';
  }).join('');
}

function applySetting(k, v) {
  store.set(k, v);
  if (k === 'ui') { setUi(v); applyI18n(); refreshAfterUi(); }
  if (k === 'volume') { sound.setVolume(v); sound.play('soft'); }
  if (k === 'keySound' && v !== 'off') sound.play(v);
  if (k === 'keyboard') showKeyboard();
  if (k === 'caret' || k === 'smooth' || k === 'size' || k === 'liveSpeed') {
    if (route === 'test' || route === 'daily' || route === 'drills') newTest(true);
  }
  renderSettings();
}

function bindSettings() {
  const dlg = $('#settingsDialog');
  $('#settingsBtn').addEventListener('click', () => { renderSettings(); dlg.showModal(); });
  $('#settingsRows').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    const raw = b.dataset.v;
    applySetting(b.dataset.k, raw === 'true' ? true : raw === 'false' ? false : raw);
  });
  $('#settingsRows').addEventListener('input', (e) => {
    if (e.target.dataset.k === 'volume') {
      store.set('volume', +e.target.value);
      sound.setVolume(+e.target.value);
    }
  });
  $('#settingsRows').addEventListener('change', (e) => {
    if (e.target.dataset.k === 'volume') sound.play('soft');
  });
  $('#resetData').addEventListener('click', () => {
    if (!confirm(t('set.resetConfirm'))) return;
    store.reset();
    toast(t('set.resetDone'), { icon: 'fa-trash-can' });
    dlg.close();
    go();
  });
  dlg.addEventListener('close', () => {
    if (route === 'test' || route === 'daily' || route === 'drills') stage.focus();
  });
  $('#soundBtn').addEventListener('click', () => {
    const m = !S().mute;
    store.set('mute', m);
    sound.setMuted(m);
    paintSoundBtn();
    if (!m) sound.play('power');
  });
  $('#langBtn').addEventListener('click', () => applySetting('ui', getUi() === 'ko' ? 'en' : 'ko'));
}

function paintSoundBtn() {
  const m = S().mute;
  $('#soundBtn').innerHTML = '<i class="fa-solid ' + (m ? 'fa-volume-xmark' : 'fa-volume-high') + '" aria-hidden="true"></i>';
  $('#soundBtn').setAttribute('aria-pressed', String(!m));
}

function refreshAfterUi() {
  paintSoundBtn();
  document.documentElement.lang = getUi();
  if (route === 'test') renderCfg();
  if (route === 'drills') renderDrills();
  if (route === 'daily') renderDailyBanner();
  if (route === 'result' && lastResult) showResult();
  if (route === 'stats') renderStats();
  if (route === 'ranks') openRanks();
  if (route === '') renderHome();
  meteor.refresh();
  race.refresh();
  if (typingRoute() && stage.session && !stage.session.started) newTest(true);
}

/* ---------- Keys anywhere ------------------------------------- */

function typingRoute() { return route === 'test' || route === 'daily' || route === 'drills'; }

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const a = document.activeElement;
  const inField = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  const onControl = a && (a.tagName === 'BUTTON' || a.tagName === 'A');
  sound.unlock();
  // a held Enter (auto-repeat) must not skip the result screen
  if (e.key === 'Enter' && e.repeat && (route === '' || route === 'result' || route === 'meteor' || route === 'race')) return;
  if (route === '' && e.key === 'Enter' && !onControl && !inField) { location.hash = '#/test'; e.preventDefault(); return; }
  if (route === 'result' && e.key === 'Enter' && !onControl && !inField) { e.preventDefault(); again(false); return; }
  if (typingRoute() && !inField) {
    if (e.key === 'Tab' && !onControl) { e.preventDefault(); newTest(); return; }
    if ((e.key.length === 1 || e.key === 'Process') && !(onControl && (e.key === ' ' || e.key === 'Enter'))) stage.focus();
  }
  if (route === 'meteor' && !inField) {
    if (e.key === 'Enter' && !onControl) { e.preventDefault(); meteor.enterKey(); return; }
    if (e.key.length === 1 || e.key === 'Process') meteor.focus();
  }
  if (route === 'race' && !inField) {
    if (e.key === 'Enter' && !onControl) { e.preventDefault(); race.enterKey(); return; }
    if (e.key.length === 1 || e.key === 'Process') race.focus();
  }
});

// moving the mouse brings the settings back during a test
document.addEventListener('mousemove', (e) => {
  if (document.body.classList.contains('focus-mode') && Math.abs(e.movementX) + Math.abs(e.movementY) > 8) {
    document.body.classList.remove('focus-mode');
  }
});

window.addEventListener('resize', () => {
  clearTimeout(window.__tgResize);
  window.__tgResize = setTimeout(() => {
    if (route === 'result' && resultHandle) resultHandle.redraw();
    if (typingRoute() && stage.session && !stage.session.started) newTest(true);
  }, 200);
});

/* ---------- Version history (hold the brand mark) -------------- */

function bindVersion() {
  const mark = $('.tg-brand-mark');
  let timer = null;
  const startHold = () => {
    timer = setTimeout(async () => {
      const dlg = $('#versionDialog');
      $('#versionRows').innerHTML = '<tr><td colspan="2"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>';
      dlg.showModal();
      const rows = await board.versions();
      $('#versionRows').innerHTML = rows.map((r) => '<tr><td>' + esc(r.ver) + '</td><td>' + esc(r.desc) + '</td></tr>').join('') || '<tr><td colspan="2">—</td></tr>';
    }, 3000);
  };
  const cancel = () => clearTimeout(timer);
  mark.addEventListener('pointerdown', startHold);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => mark.addEventListener(ev, cancel));
}

/* ---------- Arcade modes -------------------------------------- */

const ctx = { store, t, fmt, unit, sound, toast, openSave, announce, getUi, Stage, Session, langName, confetti };
const meteor = new Meteor($('#meteor'), ctx);
const race = new Race($('#race'), ctx, (r) => { lastResult = r; location.hash = '#/result'; });

/* ---------- Boot ---------------------------------------------- */

applyI18n();
paintSoundBtn();
bindCfg();
bindDailyDrill();
bindSave();
bindRanks();
bindSettings();
bindVersion();
window.addEventListener('hashchange', go);
go();
document.documentElement.classList.add('tg-ready');
board.logVisit(visitId);
board.serverVersion().then((v) => {
  if (v && v > board.CLIENT_VERSION) toast(t('toast.update'), { icon: 'fa-rotate', ms: 8000 });
}).catch(() => {});
