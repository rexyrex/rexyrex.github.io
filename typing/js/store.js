/* Everything the game remembers, in localStorage under "rex-type":
   settings, history, personal bests, per-key accuracy, XP, streaks,
   achievements and the arcade records. */

import { dayKey } from './content.js';

const KEY = 'rex-type';

function defaults() {
  return {
    v: 1,
    settings: {
      ui: (navigator.language || '').slice(0, 2) === 'ko' ? 'ko' : 'en',
      mute: false,
      keySound: 'off',
      sfx: true,
      volume: 0.6,
      caret: 'line',
      smooth: true,
      liveSpeed: true,
      keyboard: 'drills',
      size: 'm',
      name: '',
      test: {
        lang: 'ko',
        src: { ko: 'sentence', en: 'words', code: 'javascript' },
        kind: 'time',
        time: 60,
        count: {},
        diff: 'normal',
        punct: false,
        nums: false,
        sudden: false,
        pace: false
      },
      dailyLang: 'ko',
      drillLang: 'ko',
      meteorLang: 'ko',
      raceLang: 'ko'
    },
    history: [],
    bests: {},
    keyStats: { ko: {}, en: {} },
    xp: 0,
    achievements: {},
    streak: { last: '', count: 0, best: 0 },
    daily: {},
    meteor: { best: 0, bestLevel: 0, destroyed: 0, games: 0 },
    race: { races: 0, wins: 0, podiums: 0 },
    totals: { tests: 0, ms: 0, chars: 0, codeLangs: [] }
  };
}

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over)) {
    out[k] = base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

export const store = {
  data: defaults(),

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = merge(defaults(), JSON.parse(raw));
    } catch (e) { this.data = defaults(); }
    return this.data;
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* private mode: nothing persists */ }
  },

  reset() {
    const keep = this.data.settings;
    this.data = defaults();
    this.data.settings = keep;
    this.save();
  },

  get settings() { return this.data.settings; },

  set(k, v) {
    this.data.settings[k] = v;
    this.save();
  },

  /* r: { kind, lang ('ko'|'en'|'code'), cfgKey, speed, cpm, acc, raw, cons,
          ms, chars, ranked, sudden, failed, codeLang, keyStats, unitLang } */
  addResult(r) {
    const d = this.data;
    const before = levelOf(d.xp);
    const today = dayKey();
    d.history.push({
      t: Date.now(), k: r.kind, l: r.lang, c: r.cfgKey, s: round1(r.speed), cpm: round1(r.cpm),
      a: Math.round(r.acc * 1000) / 1000, ms: Math.round(r.ms), f: r.failed ? 1 : 0
    });
    if (d.history.length > 400) d.history.splice(0, d.history.length - 400);
    d.totals.tests++;
    d.totals.ms += r.ms;
    d.totals.chars += r.chars;
    if (r.codeLang && !d.totals.codeLangs.includes(r.codeLang)) d.totals.codeLangs.push(r.codeLang);
    const gained = Math.round(r.chars * Math.max(0.2, r.acc) * (r.sudden && !r.failed ? 1.5 : 1)) + 10;
    d.xp += gained;
    this.touchStreak(today);

    let pb = null;
    if (!r.failed && r.ms >= 5000) {
      const prev = d.bests[r.cfgKey];
      if (!prev || r.speed > prev.s) {
        d.bests[r.cfgKey] = { s: round1(r.speed), cpm: round1(r.cpm), a: r.acc, t: Date.now() };
        pb = { prev: prev ? prev.s : null };
      }
    }
    // per-key accuracy (Korean keys and Latin keys kept apart)
    if (r.keyStats) {
      const ks = d.keyStats[r.lang === 'ko' ? 'ko' : 'en'];
      for (const [k, [hit, miss]] of Object.entries(r.keyStats)) {
        const s = ks[k] || (ks[k] = [0, 0]);
        s[0] += hit;
        s[1] += miss;
      }
    }
    if (r.kind === 'daily') {
      const id = today + ':' + r.lang;
      const prev = d.daily[id];
      if (!prev || r.speed > prev.s) d.daily[id] = { s: round1(r.speed), a: r.acc, grid: r.grid || '' };
    }
    const unlocked = this.checkAchievements(r);
    this.save();
    return { pb, gained, levelBefore: before, levelAfter: levelOf(d.xp), unlocked };
  },

  addMeteor(m) {
    const d = this.data;
    const before = levelOf(d.xp);
    d.meteor.games++;
    d.meteor.destroyed += m.words;
    const pb = m.score > d.meteor.best;
    if (pb) d.meteor.best = m.score;
    d.meteor.bestLevel = Math.max(d.meteor.bestLevel, m.level);
    d.xp += Math.round(m.chars * 0.8) + 10;
    d.totals.chars += m.chars;
    d.totals.ms += m.ms;
    this.touchStreak(dayKey());
    const unlocked = this.checkAchievements({ kind: 'meteor' });
    this.save();
    return { pb, levelBefore: before, levelAfter: levelOf(d.xp), unlocked };
  },

  addRace(place) {
    const d = this.data;
    d.race.races++;
    if (place === 1) d.race.wins++;
    if (place <= 3) d.race.podiums++;
    const unlocked = this.checkAchievements({ kind: 'race' });
    this.save();
    return { unlocked };
  },

  touchStreak(today) {
    const s = this.data.streak;
    if (s.last === today) return;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    s.count = s.last === dayKey(y) ? s.count + 1 : 1;
    s.last = today;
    s.best = Math.max(s.best, s.count);
  },

  // An unbroken streak only counts while today or yesterday was played.
  streakNow() {
    const s = this.data.streak;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return s.last === dayKey() || s.last === dayKey(y) ? s.count : 0;
  },

  best(cfgKey) { return this.data.bests[cfgKey] || null; },

  // Best speed in a language across every test of it.
  bestFor(lang) {
    let best = null;
    for (const [k, v] of Object.entries(this.data.bests)) {
      if (k.split('|')[0] === lang && (!best || v.s > best.s)) best = v;
    }
    return best;
  },

  // Average of the last few results in a language (bots and pace use it).
  recent(lang, n = 10) {
    const h = this.data.history.filter((x) => x.l === lang && !x.f && x.ms > 10000).slice(-n);
    if (!h.length) return null;
    return {
      speed: h.reduce((a, x) => a + x.s, 0) / h.length,
      cpm: h.reduce((a, x) => a + (x.cpm || 0), 0) / h.length
    };
  },

  weakKeys(lang, n = 6) {
    const ks = this.data.keyStats[lang === 'ko' ? 'ko' : 'en'];
    const rows = Object.entries(ks)
      .filter(([k, [h, m]]) => h + m >= 8 && k.length === 1 && k !== ' ')
      .map(([k, [h, m]]) => ({ k, rate: (m + 0.5) / (h + m + 4), n: h + m }));
    rows.sort((a, b) => b.rate - a.rate);
    return rows.slice(0, n);
  },

  checkAchievements(r) {
    const d = this.data;
    const got = [];
    for (const a of ACHIEVEMENTS) {
      if (d.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.test(d, r || {}); } catch (e) { ok = false; }
      if (ok) {
        d.achievements[a.id] = Date.now();
        got.push(a.id);
      }
    }
    return got;
  }
};

const round1 = (x) => Math.round(x * 10) / 10;

/* ---------- Levels -------------------------------------------- */

// Level n → n+1 costs 100·n XP.
export function levelOf(xp) {
  let lv = 1;
  let need = 100;
  let left = xp;
  while (left >= need) { left -= need; lv++; need = 100 * lv; }
  return lv;
}

export function levelProgress(xp) {
  let lv = 1;
  let need = 100;
  let left = xp;
  while (left >= need) { left -= need; lv++; need = 100 * lv; }
  return { level: lv, into: left, need };
}

/* ---------- Achievements -------------------------------------- */

const timed = (r, s) => r.kind === 'test' && !r.failed && r.ms >= s * 1000;

export const ACHIEVEMENTS = [
  { id: 'first', icon: 'fa-flag', test: (d) => d.totals.tests >= 1 },
  { id: 'ten', icon: 'fa-fire', test: (d) => d.totals.tests >= 10 },
  { id: 'hundred', icon: 'fa-dumbbell', test: (d) => d.totals.tests >= 100 },
  { id: 'ko300', icon: 'fa-bolt', test: (d, r) => r.lang === 'ko' && timed(r, 30) && r.speed >= 300 },
  { id: 'ko500', icon: 'fa-bolt-lightning', test: (d, r) => r.lang === 'ko' && timed(r, 30) && r.speed >= 500 },
  { id: 'ko700', icon: 'fa-crown', test: (d, r) => r.lang === 'ko' && timed(r, 30) && r.speed >= 700 },
  { id: 'en50', icon: 'fa-feather', test: (d, r) => r.lang === 'en' && timed(r, 30) && r.speed >= 50 },
  { id: 'en80', icon: 'fa-wind', test: (d, r) => r.lang === 'en' && timed(r, 30) && r.speed >= 80 },
  { id: 'en100', icon: 'fa-rocket', test: (d, r) => r.lang === 'en' && timed(r, 30) && r.speed >= 100 },
  { id: 'en120', icon: 'fa-meteor', test: (d, r) => r.lang === 'en' && timed(r, 30) && r.speed >= 120 },
  { id: 'code60', icon: 'fa-terminal', test: (d, r) => r.lang === 'code' && timed(r, 30) && r.speed >= 60 },
  { id: 'perfect', icon: 'fa-bullseye', test: (d, r) => r.kind === 'test' && !r.failed && r.ms >= 30000 && r.acc >= 1 },
  { id: 'marathon', icon: 'fa-person-running', test: (d, r) => timed(r, 120) },
  { id: 'sudden', icon: 'fa-skull', test: (d, r) => r.sudden && timed(r, 60) },
  { id: 'polyglot', icon: 'fa-code', test: (d) => d.totals.codeLangs.length >= 3 },
  { id: 'daily', icon: 'fa-calendar-check', test: (d, r) => r.kind === 'daily' && !r.failed },
  { id: 'streak3', icon: 'fa-calendar-days', test: (d) => d.streak.count >= 3 },
  { id: 'streak7', icon: 'fa-star', test: (d) => d.streak.count >= 7 },
  { id: 'meteor100', icon: 'fa-explosion', test: (d) => d.meteor.destroyed >= 100 },
  { id: 'meteor10', icon: 'fa-shield-halved', test: (d) => d.meteor.bestLevel >= 10 },
  { id: 'race1', icon: 'fa-flag-checkered', test: (d) => d.race.wins >= 1 },
  { id: 'race10', icon: 'fa-trophy', test: (d) => d.race.wins >= 10 },
  { id: 'drill', icon: 'fa-hand', test: (d, r) => r.kind === 'drill' && !r.failed },
  { id: 'night', icon: 'fa-moon', test: (d, r) => r.kind && new Date().getHours() < 5 }
];
