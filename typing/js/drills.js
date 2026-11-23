/* Key drills: short texts that use only the keys being learnt, row by row,
   plus a drill built from the keys a player misses most. */

import { keys as keysOf, KEY_JAMO } from './hangul.js';
import { LISTS, makeRng } from './content.js';

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';

// 두벌식 letter → jamo, both cases
const J = KEY_JAMO;
const isVowelKey = (k) => 'yuiophjklbnmOP'.includes(k);

export const DRILLS = {
  ko: [
    { id: 'ko-home', icon: 'fa-house', keys: 'asdfghjkl', rows: 'home' },
    { id: 'ko-top', icon: 'fa-arrow-up', keys: 'qwertyuiop', rows: 'top', base: 'asdfghjkl' },
    { id: 'ko-bottom', icon: 'fa-arrow-down', keys: 'zxcvbnm', rows: 'bottom', base: 'asdfghjkl' },
    { id: 'ko-shift', icon: 'fa-arrow-up-from-bracket', keys: 'QWERTOP', rows: 'shift', base: 'asdfghjklqwertyuiopzxcvbnm' },
    { id: 'ko-words', icon: 'fa-font', keys: '', rows: 'all' },
    { id: 'ko-weak', icon: 'fa-crosshairs', keys: '', rows: 'weak' }
  ],
  en: [
    { id: 'en-home', icon: 'fa-house', keys: 'asdfghjkl;', rows: 'home' },
    { id: 'en-top', icon: 'fa-arrow-up', keys: 'qwertyuiop', rows: 'top', base: 'asdfghjkl' },
    { id: 'en-bottom', icon: 'fa-arrow-down', keys: 'zxcvbnm,.', rows: 'bottom', base: 'asdfghjkl' },
    { id: 'en-nums', icon: 'fa-hashtag', keys: '1234567890', rows: 'nums' },
    { id: 'en-syms', icon: 'fa-code', keys: '', rows: 'syms' },
    { id: 'en-weak', icon: 'fa-crosshairs', keys: '', rows: 'weak' }
  ]
};

function shuffle(r, a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pickN = (r, list, n) => {
  const out = [];
  if (!list.length) return out;
  for (let i = 0; i < n; i++) out.push(list[Math.floor(r() * list.length)]);
  return out;
};

function syllable(cho, jung) {
  const c = CHO.indexOf(cho);
  const v = JUNG.indexOf(jung);
  if (c < 0 || v < 0) return '';
  return String.fromCharCode(0xAC00 + (c * 21 + v) * 28);
}

// Korean: jamo on their own, then syllables, then real words, using only `allowed` keys.
function koDrill(r, focus, base) {
  const allowed = new Set((focus + (base || '')).split(''));
  const cons = [...allowed].filter((k) => !isVowelKey(k) && J[k]).map((k) => J[k]);
  const vows = [...allowed].filter((k) => isVowelKey(k) && J[k]).map((k) => J[k]);
  const focusJamo = focus.split('').map((k) => J[k]).filter(Boolean);
  const items = [];
  items.push(...pickN(r, focusJamo, 8));
  const sylls = [];
  const fc = focus.split('').filter((k) => J[k]);
  for (const k of fc) {
    const j = J[k];
    if (isVowelKey(k)) for (const c of cons) sylls.push(syllable(c, j));
    else for (const v of vows) sylls.push(syllable(j, v));
  }
  items.push(...pickN(r, sylls.filter(Boolean), 10));
  const words = LISTS.KO_WORDS.filter((w) => {
    const ks = keysOf(w);
    return [...ks].every((k) => allowed.has(k)) && [...ks].some((k) => focus.includes(k));
  });
  items.push(...pickN(r, words, 14));
  return items;
}

function enDrill(r, focus, base) {
  const allowed = new Set((focus + (base || '')).split(''));
  const items = [];
  const letters = focus.split('');
  for (let i = 0; i < 8; i++) items.push(letters[Math.floor(r() * letters.length)].repeat(1 + Math.floor(r() * 3)));
  const pool = englishPool().filter((w) => [...w].every((c) => allowed.has(c)) && [...w].some((c) => focus.includes(c)));
  items.push(...pickN(r, pool, 22));
  return items;
}

function englishPool() {
  const simple = (typeof window !== 'undefined' && window.simpleWords) || [];
  return LISTS.EN_TOP200.concat(simple.filter((w) => /^[a-z]+$/.test(w)));
}

const SYMS = ['()', '{}', '[]', '<>', ';', ':', '=', '==', '!=', '=>', '->', '+=', '&&', '||', '"', "'", '_', '-', '/', '\\', '|', '!', '@', '#', '$', '%', '^', '&', '*', '?'];
const SYM_WORDS = ['f(x);', 'a[i]', '{ }', 'x => x', 'i++;', 'a != b', '"ok"', "'id'", 'user_id', '#main', '$el', '50%', 'a && b', 'x || y', '<div>', 'a->b', 'n += 1;', 'v[0]', '@param', 'a ? b : c'];

/* → { items: [...], weak: [{k, rate}] | null } */
export function drillItems(drill, store, seed) {
  const r = makeRng(seed);
  const lang = drill.id.slice(0, 2);
  if (drill.rows === 'weak') {
    // letters only: words can train them (digits and symbols have their own drills)
    const weak = store.weakKeys(lang, 12).filter((w) => /^[a-z]$/.test(w.k)).slice(0, 6);
    if (weak.length < 2) return { items: null, weak: [] };
    const wk = weak.map((w) => w.k);
    let pool;
    if (lang === 'ko') pool = LISTS.KO_WORDS.map((w) => ({ w, k: keysOf(w).toLowerCase() }));
    else pool = englishPool().map((w) => ({ w, k: w }));
    const scored = pool.map((x) => ({ w: x.w, s: [...x.k].filter((c) => wk.includes(c)).length / Math.sqrt(x.k.length) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 160);
    if (scored.length < 8) return { items: null, weak: [] };
    return { items: shuffle(r, scored.map((x) => x.w)).slice(0, 30), weak };
  }
  if (lang === 'ko') {
    if (drill.rows === 'all') return { items: pickN(r, LISTS.KO_WORDS, 30) };
    return { items: koDrill(r, drill.keys, drill.base) };
  }
  if (drill.rows === 'nums') {
    const items = [];
    for (let i = 0; i < 30; i++) items.push(String(Math.floor(r() * Math.pow(10, 1 + Math.floor(r() * 4)))));
    return { items };
  }
  if (drill.rows === 'syms') return { items: shuffle(r, SYMS.concat(SYM_WORDS)).slice(0, 30) };
  return { items: enDrill(r, drill.keys, drill.base) };
}
