/* Text to type. Every source is a `line(i)` function over lines
   { text, indent?, note? } — finite sources return null past the end.
   Randomness comes from a seeded generator, so "same text again" and the
   daily challenge reproduce exactly. */

import { KO_PROVERBS, KO_QUOTES, KO_SENTENCES, KO_PASSAGES, KO_WORDS } from '../data/ko.js';
import { EN_TOP200, EN_QUOTES, EN_PASSAGES, EN_HARD } from '../data/en.js';
import { CODE } from '../data/code.js';

/* ---------- Random -------------------------------------------- */

export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function newSeed() {
  return (Math.random() * 4294967296) >>> 0;
}

const pick = (r, list) => list[Math.floor(r() * list.length)];

// Draw without repeats until the list is used up.
function bag(r, list) {
  let order = [];
  let last;
  return function () {
    if (!order.length) {
      order = list.slice();
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      if (order.length > 1 && order[order.length - 1] === last) order.unshift(order.pop());
    }
    last = order.pop();
    return last;
  };
}

/* ---------- Text shaping -------------------------------------- */

const clean = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/\s+/g, ' ').trim();

function greedy(words, max) {
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= max) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Word wrap to at most `max` characters per line, with the lines evened
// out (no lone word left dangling on a line of its own).
export function wrap(text, max) {
  const t = clean(text);
  const words = t.split(' ');
  const first = greedy(words, max);
  if (first.length < 2) return first;
  for (let m = Math.ceil(t.length / first.length); m < max; m++) {
    const lines = greedy(words, m);
    if (lines.length <= first.length) return lines;
  }
  return first;
}

/* ---------- Korean: the original silly sentence machine ------- */

function hasBatchim(word) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xAC00 || c > 0xD7A3) return false;
  return (c - 0xAC00) % 28 !== 0;
}

const FAMILY = ['김', '박', '이', '장', '임', '양', '한', '서', '안', '최', '정', '조', '윤', '강', '오', '신'];
const GIVEN = ['형', '민', '희', '주', '성', '호', '광', '천', '세', '훈', '석', '영', '은', '연', '경', '고', '운', '소', '정', '하', '준', '서', '윤', '지', '우', '현', '수', '진'];
const THINGS = ['감자', '과자', '사탕', '낙타', '컴퓨터', '키보드', '다람쥐', '공룡', '핸드폰', '사진기', '물컵', '모니터', '창고', '강아지', '고양이', '냉장고', '다리미', '포크', '숟가락', '명함', '곰', '거북이', '토끼', '빗자루', '쇳덩어리', '구슬', '마사지 의자', '블루투스 이어폰', '유선 전화기', '명품 가방', '하이힐', '체리', '서버', '야구 방망이', '원숭이', '생쥐', '친구', '모닥불', '아이스크림', '스테이크', '살아있는 한우', '수박', '떡볶이', '김밥', '라면', '마우스', '프린터', '선풍기', '에어컨', '자전거', '우산', '양말', '베개', '이불', '화분', '선인장', '펭귄', '코끼리', '기린', '티라노사우루스', '운석', '도넛', '피자', '치킨', '붕어빵', '호떡', '택배 상자', '로봇 청소기', '전기밥솥', '보조 배터리'];
const MANNER = ['맛있게', '힘차게', '겨우', '천천히', '멋있게', '예쁘게', '빠르게', '뜨겁게', '이상하게', '귀엽게', '따끈하게', '얄밉게', '차갑게', '어중간하게', '어색하게', '똑똑하게', '천재처럼', '할 듯 말 듯', '찰지게', '무섭게', '조용히', '몰래', '당당하게', '정성껏', '대충', '열심히', '살금살금', '우아하게', '느긋하게', '갑자기', '진지하게', '신나게', '수줍게', '과감하게'];
const VERBS = ['먹었다', '째려봤다', '걷어찼다', '싫어한다', '좋아한다', '공격했다', '돌려버렸다', '시도했다', '박살 냈다', '반토막 냈다', '쳐다봤다', '상상해 봤다', '뿌리쳤다', '깨물어 버렸다', '개발했다', '해킹했다', '망가뜨렸다', '위조했다', '기부했다', '밀어냈다', '잡아당겼다', '안아 줬다', '칭찬했다', '분해했다', '조립했다', '포장했다', '청소했다', '수리했다', '훔쳐 갔다', '숨겨 뒀다', '선물했다', '연구했다', '그려 봤다', '노래로 불렀다', '업어 줬다', '발견했다', '구출했다', '예약했다', '주문했다', '배달했다'];

function sillySentence(r, names) {
  const who = names ? pick(r, names) : pick(r, FAMILY) + pick(r, GIVEN) + pick(r, GIVEN);
  const what = pick(r, THINGS);
  const how = pick(r, names ? MANNER.concat(['임희주답게']) : MANNER);
  const did = pick(r, VERBS);
  return who + (hasBatchim(who) ? '은 ' : '는 ') + what + (hasBatchim(what) ? '을 ' : '를 ') + how + ' ' + did + '.';
}

// The company mode: names from the office this game was first written for.
const OFFICE = ['이소희 사원님', '전하영 사원님', '장주환 주임님', '김석주 주임님', '김민형', '양세훈', '임희주 주임님', '서영은 과장님', '안상준 대리님', '박성호 소장님', '김광천 이사님', '한세훈 이사님', '박연경 차장님', '이미주'];

/* ---------- English words ------------------------------------- */

function englishWords(diff) {
  if (diff === 'easy') return EN_TOP200;
  if (diff === 'hard') return EN_HARD;
  const list = (typeof window !== 'undefined' && window.simpleWords) || [];
  const ok = list.filter((w) => /^[a-z]+$/.test(w));
  return ok.length > 200 ? ok : EN_TOP200;
}

// Punctuation and numbers turn a word stream into something sentence-like.
function decorate(r, words, punct, nums) {
  const out = [];
  let sentence = 0;
  let target = 4 + Math.floor(r() * 8);
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    if (nums && r() < 0.12) w = String(Math.floor(r() * (r() < 0.5 ? 100 : 10000)));
    if (punct) {
      if (sentence === 0 && /^[a-z]/.test(w)) w = w[0].toUpperCase() + w.slice(1);
      sentence++;
      if (sentence >= target) {
        const end = r();
        w += end < 0.75 ? '.' : end < 0.9 ? '?' : '!';
        sentence = 0;
        target = 4 + Math.floor(r() * 8);
      } else {
        const p = r();
        if (p < 0.1) w += ',';
        else if (p < 0.12) w += ';';
        else if (p < 0.135) w += ':';
        else if (p < 0.15) w = '"' + w + '"';
        else if (p < 0.16) w = '(' + w + ')';
        else if (p < 0.175 && w.length > 2) w = w + "'s";
      }
    }
    out.push(w);
  }
  if (punct && out.length && !/[.?!]$/.test(out[out.length - 1])) out[out.length - 1] += '.';
  return out;
}

/* ---------- Sources ------------------------------------------- */

function stream(items) {
  // items: function → array of lines; called until enough lines exist
  const lines = [];
  return function line(i) {
    while (lines.length <= i) {
      const more = items();
      if (!more) return lines[i] || null;
      for (const l of more) lines.push(l);
    }
    return lines[i];
  };
}

function finite(all) {
  return function line(i) { return all[i] || null; };
}

/* cfg: { lang: 'ko'|'en'|'code', src, count (0 = endless), diff, punct, nums, codeLang, seed }
   budget: characters per line that fit the stage. */
export function makeSource(cfg, budget) {
  const r = makeRng(cfg.seed >>> 0);
  const max = Math.max(16, budget || (cfg.lang === 'ko' ? 30 : 56));
  const count = cfg.count || 0;

  if (cfg.lang === 'code') {
    const list = CODE[cfg.codeLang] || CODE.javascript;
    const next = bag(r, list);
    const snippetLines = () => next().split('\n').map((s) => {
      const indent = s.length - s.trimStart().length;
      return { text: s.trim().replace(/\s+/g, ' '), indent };
    }).filter((l) => l.text);
    if (count) {
      let all = [];
      for (let k = 0; k < count; k++) all = all.concat(snippetLines());
      return { line: finite(all) };
    }
    return { line: stream(snippetLines) };
  }

  if (cfg.lang === 'ko') {
    switch (cfg.src) {
      case 'words': {
        const next = bag(r, KO_WORDS);
        return { line: wordLinesFor(next, max, count) };
      }
      case 'proverb': return itemSource(bag(r, KO_PROVERBS), max, count);
      case 'quote': {
        const next = bag(r, KO_QUOTES);
        return quoteSource(() => next(), max, count);
      }
      case 'passage': return itemSource(bag(r, KO_PASSAGES), max, count);
      case 'office': return itemSource(() => sillySentence(r, OFFICE), max, count);
      case 'sentence':
      default: {
        const next = bag(r, KO_SENTENCES);
        return itemSource(() => (r() < 0.3 ? sillySentence(r) : next()), max, count);
      }
    }
  }

  // English
  switch (cfg.src) {
    case 'quote': {
      const next = bag(r, EN_QUOTES);
      return quoteSource(() => next(), max, count);
    }
    case 'passage': return itemSource(bag(r, EN_PASSAGES), max, count);
    case 'words':
    default: {
      const list = englishWords(cfg.diff);
      const draw = bag(r, list);
      let prev = '';
      const raw = () => {
        let w = draw();
        if (w === prev) w = draw();
        prev = w;
        return w;
      };
      if (!cfg.punct && !cfg.nums) return { line: wordLinesFor(raw, max, count) };
      // decorate in batches so sentences span lines naturally
      let queue = [];
      const next = () => {
        if (!queue.length) {
          const batch = [];
          for (let k = 0; k < 40; k++) batch.push(raw());
          queue = decorate(r, batch, cfg.punct, cfg.nums);
        }
        return queue.shift();
      };
      return { line: wordLinesFor(next, max, count) };
    }
  }
}

// Lines from an endless stream of words (or exactly `total` words).
function wordLinesFor(nextWord, max, total) {
  const lines = [];
  let produced = 0;
  let carry = null;
  return function line(i) {
    while (lines.length <= i) {
      let cur = '';
      while (!(total && produced >= total)) {
        const w = carry !== null ? carry : nextWord();
        carry = null;
        if (cur && cur.length + 1 + w.length > max) { carry = w; break; }
        cur = cur ? cur + ' ' + w : w;
        produced++;
      }
      if (!cur) return null;
      lines.push({ text: cur });
    }
    return lines[i];
  };
}

// One item (sentence, proverb, paragraph) → one or more wrapped lines.
function itemSource(next, max, count) {
  const make = () => wrap(next(), max).map((text) => ({ text }));
  if (count) {
    let all = [];
    for (let k = 0; k < count; k++) all = all.concat(make());
    return { line: finite(all) };
  }
  return { line: stream(make) };
}

function quoteSource(next, max, count) {
  const make = () => {
    const q = next();
    const lines = wrap(q.t, max).map((text) => ({ text }));
    lines[lines.length - 1].note = q.a;
    return lines;
  };
  if (count) {
    let all = [];
    for (let k = 0; k < count; k++) all = all.concat(make());
    return { line: finite(all) };
  }
  return { line: stream(make) };
}

/* ---------- Daily challenge ----------------------------------- */

const DAY0 = Date.UTC(2026, 10, 23); // challenge #1

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export function dailyNumber(d = new Date()) {
  const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((local - DAY0) / 86400000) + 1;
}

// The same paragraph for everyone on the same day.
export function dailyText(lang, d = new Date()) {
  const n = dailyNumber(d);
  const list = lang === 'ko' ? KO_PASSAGES : EN_PASSAGES;
  const r = makeRng(hashSeed('rex-type-daily-' + lang));
  const order = list.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const idx = order[((n % order.length) + order.length) % order.length];
  return clean(list[idx]);
}

export function textSource(text, max) {
  return { line: finite(wrap(text, max).map((t) => ({ text: t }))) };
}

/* ---------- Word pools for the arcade modes ------------------- */

export function arcadeWords(lang) {
  if (lang === 'ko') return KO_WORDS.slice();
  const list = englishWords('normal');
  return EN_TOP200.concat(list).filter((w) => w.length >= 2);
}

export function raceText(lang, r) {
  if (lang === 'ko') return clean(pick(r, KO_PASSAGES));
  return clean(pick(r, EN_PASSAGES));
}

export const LISTS = { KO_WORDS, EN_TOP200, KO_SENTENCES };
