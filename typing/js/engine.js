/* The typing test itself: what was typed, what it should have been, and the
   numbers that come out of it. No DOM in here, so it can be tested in Node.

   How a line is judged
   - Target and typed text are split into words on spaces and compared word
     by word, character by character (a skipped letter costs one word, not
     the rest of the line).
   - The last character of the input is *tentative* while it is Hangul: the
     IME may still turn 하 into 한 or 한 into 하+나. It counts as on track
     ("pend") when its keystrokes are a prefix of the target's.

   What is measured
   - entries / errors: every character the moment it is committed, right or
     wrong, including mistakes that were later corrected → accuracy.
   - correct / incorrect / extra / missed: the final text → speed.
   - speed: correct characters ÷ 5 per minute (WPM) for English and code,
     correct keystrokes per minute (타수) for Korean. Spaces and line breaks
     that are typed correctly count as one character / one stroke.
   - time runs from the first keystroke, to the limit for timed tests, or to
     the moment the last line is finished. */

import { strokes, charKeys, keys, isHangul, isKeyPrefix } from './hangul.js';

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Physical key for a character (for key statistics and the heat map).
const SHIFTED = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`' };
export function baseKey(k) {
  if (!k) return '';
  if (SHIFTED[k]) return SHIFTED[k];
  return k.toLowerCase();
}

// Compare one word. mode 'done': the word is finished (untyped letters are
// missed). mode 'live': the word is being typed (untyped letters are still to
// come; the last letter may be composing).
export function compareWord(target, typed, mode) {
  const out = [];
  const n = Math.max(target.length, typed.length);
  for (let i = 0; i < n; i++) {
    const t = target[i];
    const y = typed[i];
    if (y === undefined) {
      out.push({ ch: t, st: mode === 'done' ? 'miss' : 'todo' });
    } else if (t === undefined) {
      const tentative = mode === 'live' && i === typed.length - 1 && isHangul(y);
      out.push({ ch: y, st: tentative ? 'xpend' : 'extra' });
    } else if (y === t) {
      out.push({ ch: t, st: 'ok' });
    } else if (mode === 'live' && i === typed.length - 1 && isHangul(y) && isKeyPrefix(y, target.slice(i))) {
      out.push({ ch: t, st: 'pend', y });
    } else {
      out.push({ ch: t, st: 'bad', y });
    }
  }
  return out;
}

// Score a whole line. mode 'done' = committed; 'cut' = time ran out (or the
// line is still in progress): its last word is live, later words untouched.
export function scoreLine(target, typed, mode) {
  const tw = target.split(' ');
  const yw = typed.length ? typed.split(' ') : [];
  const r = { correct: 0, incorrect: 0, extra: 0, missed: 0, cStrokes: 0, yChars: 0, yStrokes: 0, words: [] };
  const n = mode === 'done' ? Math.max(tw.length, yw.length) : yw.length;
  for (let i = 0; i < n; i++) {
    const t = tw[i] === undefined ? '' : tw[i];
    const y = yw[i] === undefined ? '' : yw[i];
    const live = mode !== 'done' && i === yw.length - 1;
    const chars = compareWord(t, y, live ? 'live' : 'done');
    let pend = 0;
    for (const c of chars) {
      if (c.st === 'ok') { r.correct++; r.cStrokes += strokes(c.ch); }
      else if (c.st === 'bad') r.incorrect++;
      else if (c.st === 'extra') r.extra++;
      else if (c.st === 'miss') r.missed++;
      else if (c.st === 'pend' || c.st === 'xpend') pend++;
    }
    r.yChars += y.length - pend;
    r.yStrokes += strokes(pend ? y.slice(0, -1) : y);
    // the space typed after this word
    if (i < yw.length - 1) {
      r.yChars++; r.yStrokes++;
      if (i + 1 < tw.length) { r.correct++; r.cStrokes++; } else r.extra++;
    }
    if (i < yw.length || mode === 'done') {
      r.words.push({ t, y, ok: y === t, live });
    }
  }
  return r;
}

// Where the caret sits and which key comes next, for a line in progress.
export function linePosition(target, typed) {
  const tw = target.split(' ');
  const yw = typed.split(' ');
  const wi = yw.length - 1;
  const y = yw[wi];
  const t = tw[wi] === undefined ? '' : tw[wi];
  let next;
  const ky = keys(y);
  const kt = keys(t);
  if (wi >= tw.length) next = 'Backspace';
  else if (!kt.startsWith(ky)) next = 'Backspace';
  else if (ky.length < kt.length) next = kt[ky.length];
  else next = wi < tw.length - 1 ? ' ' : 'Enter';
  return { word: wi, char: y.length, next };
}

/* ---------- Session ---------------------------------------------- */

export class Session {
  /* opts:
       source   { line(i) → { text, indent?, note? } | null }
       lang     'ko' | 'en' | 'code'
       time     seconds (0 = until the text runs out)
       sudden   end the test at the first mistake */
  constructor(opts) {
    this.source = opts.source;
    this.lang = opts.lang;
    this.unit = opts.lang === 'ko' ? 'kpm' : 'wpm';
    this.limit = opts.time || 0;
    this.sudden = !!opts.sudden;
    this.lines = [];
    this.results = [];
    this.idx = 0;
    this.value = '';
    this.evalLen = 0;
    this.entries = 0;
    this.errors = 0;
    this.log = [];
    this.raw = [];
    this.samples = [];
    this.keyStats = {};
    this.startAt = 0;
    this.endAt = 0;
    this.finishAt = 0;
    this.done = false;
    this.reason = '';
    this.partial = null;
    this.swallowSpace = false;
    this.ensure(3);
  }

  ensure(n) {
    while (this.lines.length <= n) {
      const l = this.source.line(this.lines.length);
      if (!l) break;
      this.lines.push(l);
    }
  }

  line(i) {
    this.ensure(i);
    return this.lines[i] || null;
  }

  get current() { return this.line(this.idx); }
  get target() { const l = this.current; return l ? l.text : ''; }
  get started() { return this.startAt > 0; }
  get finite() { return !this.limit; }

  // Start the clock now instead of at the first keystroke (races).
  begin(t = clock()) {
    if (this.startAt) return;
    this.startAt = t;
    this.endAt = t + this.limit * 1000;
  }

  elapsed(t = clock()) {
    if (!this.startAt) return 0;
    let e = (this.done ? this.finishAt : t) - this.startAt;
    if (this.limit) e = Math.min(e, this.limit * 1000);
    return Math.max(0, e);
  }

  remaining(t = clock()) {
    if (!this.limit) return 0;
    return Math.max(0, this.limit * 1000 - this.elapsed(t));
  }

  // Judge one committed character at position i of the current line.
  judge(v, i, t) {
    const target = this.target;
    const before = v.slice(0, i);
    const wi = before.split(' ').length - 1;
    const ci = i - (before.lastIndexOf(' ') + 1);
    const tw = target.split(' ');
    const word = tw[wi];
    const y = v[i];
    let ok;
    let expect;
    if (y === ' ') {
      // a space is right once the word is complete; early, it stood in for
      // the letter that was due
      ok = word !== undefined && ci >= word.length;
      expect = ok ? ' ' : word === undefined ? undefined : word[ci];
    } else {
      // past the end of a word, the space was due
      expect = word === undefined ? undefined : ci < word.length ? word[ci] : ' ';
      ok = expect === y;
    }
    this.entries++;
    if (!ok) this.errors++;
    this.log.push({ t: t - this.startAt, ok });
    this.countKeys(expect, y, ok);
    return ok;
  }

  countKeys(expect, y, ok) {
    if (expect === undefined) return;
    const ek = charKeys(expect);
    const bump = (k, miss) => {
      const id = baseKey(k);
      const s = this.keyStats[id] || (this.keyStats[id] = [0, 0]);
      if (miss) s[1]++; else s[0]++;
    };
    if (ok) { for (const k of ek) bump(k, false); return; }
    const yk = charKeys(y || '');
    let j = 0;
    while (j < ek.length && ek[j] === yk[j]) { bump(ek[j], false); j++; }
    bump(ek[Math.min(j, ek.length - 1)], true);
  }

  // Judge every character that can no longer change.
  settle(v, t, all) {
    const stable = all ? v.length : v.length - (v.length && isHangul(v[v.length - 1]) ? 1 : 0);
    let fresh = 0;
    for (let i = this.evalLen; i < stable; i++) {
      if (!this.judge(v, i, t)) fresh++;
    }
    this.evalLen = Math.max(this.evalLen, stable);
    return fresh;
  }

  /* Feed the input's whole value after every change. Returns what happened:
     { type: 'update' | 'commit' | 'finish' | 'reset' | 'ignored', hint? } */
  input(raw, t = clock()) {
    if (this.done || !this.current) return { type: 'ignored' };
    if (this.limit && this.startAt && t >= this.endAt) {
      this.finish('time', this.endAt);
      return { type: 'finish' };
    }
    const v = raw.replace(/[\u00a0\t\r\n]/g, ' ');
    if (this.swallowSpace) {
      this.swallowSpace = false;
      // the space after an auto-advanced line is that line's break
      if (v === ' ') { this.creditBreak(t); return { type: 'reset' }; }
    }
    // a space on an empty word (leading or doubled) is ignored
    if (v.startsWith(' ') || v.includes('  ')) return { type: 'revert' };
    if (!this.startAt) {
      if (!v.length) return { type: 'ignored' };
      this.startAt = t;
      this.endAt = t + this.limit * 1000;
    }
    this.countRaw(this.value, v, t);

    // characters that were replaced or deleted are judged again when retyped
    let p = 0;
    const prev = this.value;
    while (p < prev.length && p < v.length && prev[p] === v[p]) p++;
    if (p < this.evalLen) this.evalLen = p;

    const target = this.target;
    const tw = target.split(' ');
    const yw = v.split(' ');

    // Space after the last word: next line. Also when one space was missed
    // or mistyped (two words ran together) and the line's end was typed.
    const lastWord = yw[yw.length - 2] || '';
    const merged = yw.length === tw.length && v.length - 1 >= target.length - 1 &&
      lastWord[lastWord.length - 1] === target[target.length - 1];
    if (v.endsWith(' ') && v.trim() && (yw.length - 1 >= tw.length || merged)) {
      this.value = v;
      const errs = this.settle(v, t, true);
      if (this.sudden && errs) { this.finish('fail', t); return { type: 'finish' }; }
      return this.commit('space', t);
    }

    this.value = v;
    const errs = this.settle(v, t, false);
    if (this.sudden && errs) { this.finish('fail', t); return { type: 'finish' }; }

    // Typed exactly, and nothing left composing: next line on its own.
    if (v === target && !isHangul(v[v.length - 1])) {
      const res = this.commit('auto', t);
      this.swallowSpace = true;
      return res;
    }

    let hint;
    const last = v[v.length - 1];
    const pos = linePosition(target, v);
    const expect = (tw[pos.word] || '')[Math.max(0, pos.char - 1)];
    if (last && /[a-zA-Z]/.test(last) && expect && isHangul(expect)) hint = 'toKo';
    else if (last && isHangul(last) && expect && /[a-zA-Z]/.test(expect)) hint = 'toEn';
    return { type: 'update', hint };
  }

  /* Enter, a space after the last word, or an exact match ends the line.
     Enter is refused while most of the line is still untyped. */
  commit(via, t = clock()) {
    if (this.done || !this.current) return { type: 'ignored' };
    const typed = this.value.replace(/ +$/, '');
    if (!typed.trim()) {
      // Enter on the empty line right after an auto-advance is its break
      if (via === 'enter' && this.swallowSpace) { this.swallowSpace = false; this.creditBreak(t); }
      return { type: 'ignored' };
    }
    const target = this.target;
    const reached = typed.split(' ').length >= target.split(' ').length;
    if (via === 'enter' && !reached && typed.length < target.length * 0.6) return { type: 'blocked' };
    if (via === 'enter' && this.limit && t >= this.endAt) {
      this.finish('time', this.endAt);
      return { type: 'finish' };
    }

    // whatever was still composing is final now
    const errs = this.settle(typed, t, true);
    if (via === 'enter') {
      // the Enter key is the line break: right if every word was reached
      this.entries++;
      if (!reached) this.errors++;
      this.log.push({ t: t - this.startAt, ok: reached });
      this.raw.push({ t: t - this.startAt, n: 1 });
    }
    if (this.sudden && (errs || (via === 'enter' && !reached))) {
      this.finish('fail', t);
      return { type: 'finish' };
    }

    const hasNext = !!this.line(this.idx + 1);
    const res = scoreLine(target, typed, 'done');
    res.target = target;
    res.typed = typed;
    // an auto-advanced line earns its break only when the player types it
    res.brk = reached && hasNext && via !== 'auto' ? 1 : 0;
    this.results.push(res);
    this.idx++;
    this.value = '';
    this.evalLen = 0;
    this.ensure(this.idx + 3);
    if (this.sudden && res.incorrect + res.extra + res.missed > 0) {
      this.finish('fail', t);
      return { type: 'finish' };
    }
    if (!hasNext) {
      this.finish('end', t);
      return { type: 'finish' };
    }
    return { type: 'commit' };
  }

  // The break of the line just auto-advanced, typed after the fact.
  creditBreak(t) {
    const r = this.results[this.results.length - 1];
    if (!r || r.brk || !this.startAt || this.done) return;
    r.brk = 1;
    this.entries++;
    this.log.push({ t: t - this.startAt, ok: true });
    this.raw.push({ t: t - this.startAt, n: 1 });
  }

  // Keystrokes as they happen (for the per-second raw speed): the growth of
  // the input in letters pressed, never negative.
  countRaw(prev, v, t) {
    const n = this.unit === 'kpm' ? keys(v).length - keys(prev).length : v.length - prev.length;
    if (n > 0) this.raw.push({ t: t - this.startAt, n });
  }

  // Called by the UI's clock: records a sample each second, ends timed tests.
  tick(t = clock()) {
    if (this.done || !this.startAt) return false;
    if (this.limit && t >= this.endAt) {
      this.finish('time', this.endAt);
      return true;
    }
    const sec = Math.floor((t - this.startAt) / 1000);
    while (this.samples.length < sec) this.sample(this.samples.length + 1, t);
    return false;
  }

  sample(sec, t) {
    const s = this.stats(t);
    const from = (sec - 1) * 1000;
    const to = Math.min(sec * 1000, s.ms);
    const span = Math.max(1, to - from) / 1000;
    let pressed = 0;
    let errs = 0;
    for (const e of this.raw) if (e.t >= from && e.t < to) pressed += e.n;
    for (const e of this.log) if (e.t >= from && e.t < to && !e.ok) errs++;
    // 타/분: keystrokes per minute; WPM: characters ÷ 5 per minute
    const rawInst = this.unit === 'kpm' ? pressed * 60 / span : pressed * 12 / span;
    this.samples.push({ t: Math.min(sec, s.ms / 1000), speed: s.speed, raw: rawInst, errors: errs });
  }

  finish(reason, at = clock()) {
    if (this.done) return;
    if (this.startAt) {
      // a test ended by the clock judges what was typed up to the limit
      if (this.value) {
        this.settle(this.value, at, false);
        const p = scoreLine(this.target, this.value, 'cut');
        p.target = this.target;
        p.typed = this.value;
        p.brk = 0;
        this.partial = p;
      }
    }
    this.done = true;
    this.reason = reason;
    this.finishAt = this.startAt ? at : clock();
    if (!this.startAt) return;
    const total = this.elapsed();
    const full = Math.floor(total / 1000);
    while (this.samples.length < full) this.sample(this.samples.length + 1, this.startAt + (this.samples.length + 1) * 1000);
    if (total - full * 1000 > 250 || !this.samples.length) this.sample(full + 1, this.finishAt);
  }

  stats(t = clock()) {
    const parts = this.results.slice();
    if (this.done) { if (this.partial) parts.push(this.partial); }
    else if (this.value && this.current) parts.push(scoreLine(this.target, this.value, 'cut'));
    const s = { correct: 0, incorrect: 0, extra: 0, missed: 0, cStrokes: 0, yChars: 0, yStrokes: 0, words: 0, wordsOk: 0 };
    for (const r of parts) {
      s.correct += r.correct + (r.brk || 0);
      s.cStrokes += r.cStrokes + (r.brk || 0);
      s.incorrect += r.incorrect;
      s.extra += r.extra;
      s.missed += r.missed;
      s.yChars += r.yChars + (r.brk || 0);
      s.yStrokes += r.yStrokes + (r.brk || 0);
      for (const w of r.words) {
        if (w.live) continue;
        s.words++;
        if (w.ok) s.wordsOk++;
      }
    }
    const ms = this.elapsed(t);
    const min = ms / 60000;
    s.ms = ms;
    s.wpm = min > 0 ? s.correct / 5 / min : 0;
    s.rawWpm = min > 0 ? s.yChars / 5 / min : 0;
    s.kpm = min > 0 ? s.cStrokes / min : 0;
    s.rawKpm = min > 0 ? s.yStrokes / min : 0;
    s.cpm = min > 0 ? s.correct / min : 0;
    s.speed = this.unit === 'kpm' ? s.kpm : s.wpm;
    s.raw = this.unit === 'kpm' ? s.rawKpm : s.rawWpm;
    s.entries = this.entries;
    s.errors = this.errors;
    s.acc = this.entries ? (this.entries - this.errors) / this.entries : 1;
    const judged = s.correct + s.incorrect + s.extra + s.missed;
    s.charAcc = judged ? s.correct / judged : 1;
    s.consistency = consistency(this.samples.map((x) => x.raw));
    return s;
  }

  // Words that ended up wrong: [{ t: expected, y: typed }]
  mistakes() {
    const out = [];
    const parts = this.results.slice();
    if (this.partial) parts.push(this.partial);
    for (const r of parts) {
      for (const w of r.words) {
        if (!w.ok && !w.live && (w.t || w.y)) out.push({ t: w.t, y: w.y });
      }
    }
    return out;
  }
}

// 100 = perfectly even pace; based on the coefficient of variation of the
// per-second raw speed.
export function consistency(values) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return 100;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  if (mean <= 0) return 0;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / v.length);
  return Math.max(0, Math.min(100, 100 * (1 - sd / mean)));
}
