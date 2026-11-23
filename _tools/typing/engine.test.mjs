import assert from 'node:assert/strict';
import { imeStates } from './ime.mjs';
const R = new URL('../../typing/js/', import.meta.url).href;
const { keys, strokes } = await import(R + 'hangul.js');
const { Session, scoreLine, linePosition } = await import(R + 'engine.js');

const src = (lines) => ({ line: (i) => (lines[i] ? { text: lines[i] } : null) });
let pass = 0; const ok = (name, fn) => { fn(); pass++; console.log('ok -', name); };

ok('ime automaton reproduces text', () => {
  for (const s of ['한글 타자.', '하나 둘 셋', '괜찮아요?', '읽었다', '값이 싸다', '없어요', '꽃밭에 앉아']) {
    const st = imeStates(keys(s));
    assert.equal(st[st.length - 1], s, s + ' -> ' + st.at(-1));
  }
});

ok('strokes', () => {
  assert.equal(strokes('한글'), 6);
  assert.equal(strokes('괜찮아요?'), 4 + 4 + 2 + 2 + 1); // ㄱㅗㅐㄴ ㅊㅏㄴㅎ ㅇㅏ ㅇㅛ ?
  assert.equal(strokes('abc d'), 5);
});

// Type a Korean session perfectly, one key every `ms`.
function typeKo(sess, text, t0, ms, enter = true) {
  let t = t0; let r;
  for (const v of imeStates(keys(text))) { t += ms; r = sess.input(v, t); }
  if (enter) { t += ms; r = sess.commit('enter', t); }
  return { t, r };
}

ok('korean perfect: 타수 and accuracy', () => {
  const lines = ['한글 타자.', '하나 둘 셋'];
  const s = new Session({ source: src(lines), lang: 'ko', time: 0 });
  let t = 1000;
  // first key starts the clock at t0+ms
  let res = typeKo(s, lines[0], t, 100, false); // auto-commits on '.'
  assert.equal(s.idx, 1, 'auto advance after period');
  // user habitually presses Enter on the empty next line: ignored
  assert.equal(s.commit('enter', res.t + 50).type, 'ignored');
  res = typeKo(s, lines[1], res.t, 100, true);
  assert.equal(s.done, true);
  const st = s.stats();
  const expectStrokes = strokes(lines[0]) + 1 /*break*/ + strokes(lines[1]);
  assert.equal(st.cStrokes, expectStrokes);
  assert.equal(st.errors, 0);
  assert.equal(st.acc, 1);
  // elapsed: from first key to the final Enter
  const keysTotal = keys(lines[0]).length + keys(lines[1]).length + 1;
  assert.equal(Math.round(st.ms), (keysTotal - 1) * 100);
  const kpm = expectStrokes / (st.ms / 60000);
  assert.ok(Math.abs(st.kpm - kpm) < 1e-9);
  console.log('   kpm', st.kpm.toFixed(1), 'strokes', st.cStrokes, 'ms', st.ms);
});

ok('korean composing char is pending, not an error', () => {
  const r = scoreLine('하나 둘', '한', 'cut');
  assert.equal(r.incorrect, 0);
  assert.equal(r.correct, 0);
  const r2 = scoreLine('하나 둘', '핟', 'cut');
  assert.equal(r2.incorrect, 1);
  const p = linePosition('하나 둘', '한');
  assert.equal(p.next, 'k');
});

ok('korean mistake then correction counts in accuracy only', () => {
  const s = new Session({ source: src(['가나다 라마']), lang: 'ko', time: 0 });
  let t = 0;
  for (const v of ['ㄱ', '가', '가ㄴ', '가너', '가넏']) s.input(v, (t += 100));
  // committed '가' ok; '너' becomes stable when ㄷ typed after it? (가너 + ㄷ = 가넏, still composing)
  for (const v of ['가너', '가', '가ㄴ', '가나', '가낟', '가나다', '가나다 ']) s.input(v, (t += 100));
  for (const v of imeStates(keys('라마'))) s.input('가나다 ' + v, (t += 100));
  s.commit('enter', (t += 100));
  const st = s.stats();
  assert.equal(st.incorrect, 0);
  assert.equal(st.correct, '가나다 라마'.length);
  assert.equal(st.errors, 0, 'composing mistakes fixed before commit are not judged');
  assert.equal(st.acc, 1);
});

ok('english with a corrected and an uncorrected error', () => {
  const s = new Session({ source: src(['the cat sat', 'on the mat']), lang: 'en', time: 0 });
  let t = 0; let v = '';
  const type = (str) => { for (const ch of str) { v += ch; s.input(v, (t += 100)); } };
  const back = (n) => { for (let i = 0; i < n; i++) { v = v.slice(0, -1); s.input(v, (t += 100)); } };
  type('thw'); back(1); type('e cat sat'); // auto-commit at exact match
  assert.equal(s.idx, 1); v = '';
  assert.equal(s.input(' ', (t += 100)).type, 'reset'); // swallowed
  assert.equal(s.value, '');
  type('on teh mat');
  assert.equal(s.done, false);
  s.commit('enter', (t += 100));
  const st = s.stats();
  assert.equal(s.done, true);
  // errors: 'w' (corrected) + 'e','h' swapped in teh
  assert.equal(st.errors, 3);
  assert.equal(st.incorrect, 2);
  // correct chars: "the cat sat" (11) + break (1) + "on" "mat" (5) + 2 spaces
  assert.equal(st.correct, 11 + 1 + 2 + 1 + 1 + 1 + 3);
  console.log('   entries', st.entries, 'errors', st.errors, 'acc', st.acc.toFixed(3));
});

ok('timed test stops at the limit and ignores later input', () => {
  const s = new Session({ source: { line: (i) => ({ text: 'aaaa bbbb cccc' }) }, lang: 'en', time: 1 });
  let v = '';
  let t = 0;
  for (let i = 0; i < 30; i++) {
    const ch = 'aaaa bbbb cccc '[v.length % 15] || 'a';
    v += ch; const r = s.input(v, (t += 50));
    if (r.type === 'commit') v = '';
    if (r.type === 'finish') break;
  }
  assert.equal(s.done, true);
  assert.equal(s.stats().ms, 1000);
  assert.equal(s.reason, 'time');
});

ok('sudden death ends at the first error', () => {
  const s = new Session({ source: src(['abc def']), lang: 'en', time: 0, sudden: true });
  s.input('a', 10); s.input('ab', 20);
  const r = s.input('abx', 30);
  assert.equal(r.type, 'finish');
  assert.equal(s.reason, 'fail');
});

ok('enter refused while most of the line is untyped', () => {
  const s = new Session({ source: src(['one two three four', 'x']), lang: 'en', time: 0 });
  s.input('o', 10); s.input('on', 20);
  assert.equal(s.commit('enter', 30).type, 'blocked');
});

ok('space at the end of a korean line commits it', () => {
  const s = new Session({ source: src(['먹었다', '다음']), lang: 'ko', time: 0 });
  let t = 0; for (const v of imeStates(keys('먹었다'))) s.input(v, (t += 100));
  const r = s.input('먹었다 ', (t += 100));
  assert.equal(r.type, 'commit');
  assert.equal(s.idx, 1);
  const st = s.stats();
  assert.equal(st.cStrokes, strokes('먹었다') + 1);
});

ok('a missed space still lets space end the line', () => {
  const s = new Session({ source: src(['ab cd ef', 'next']), lang: 'en', time: 0 });
  let t = 0; let v = '';
  for (const ch of 'abxcd ef') { v += ch; s.input(v, (t += 100)); }
  assert.equal(s.input(v + ' ', (t += 100)).type, 'commit');
  assert.equal(s.idx, 1);
  // but extra letters mid-line do not end it early
  const s2 = new Session({ source: src(['ab cd ef', 'next']), lang: 'en', time: 0 });
  v = '';
  for (const ch of 'abxxxxxxx') { v += ch; s2.input(v, (t += 100)); }
  assert.equal(s2.input(v + ' ', (t += 100)).type, 'update');
});

ok('spaces on an empty word are ignored (doubled, leading)', () => {
  const s = new Session({ source: src(['the cat sat on the mat', 'x y']), lang: 'en', time: 0 });
  let t = 0; let v = '';
  assert.equal(s.input(' ', (t += 100)).type, 'revert');
  for (const ch of 'the ') { v += ch; s.input(v, (t += 100)); }
  assert.equal(s.input(v + ' ', (t += 100)).type, 'revert');
  for (const ch of 'cat sat on the mat') { v += ch; s.input(v, (t += 100)); }
  assert.equal(s.idx, 1, 'the line ends on the exact match, not a word early');
  assert.equal(s.stats().errors, 0);
});

ok('ran-together words: omitted space still ends the line; extra letters do not', () => {
  const a = new Session({ source: src(['the cat sat', 'x']), lang: 'en', time: 0 });
  let t = 0; let v = '';
  for (const ch of 'the catsat') { v += ch; a.input(v, (t += 100)); }
  assert.equal(a.input(v + ' ', (t += 100)).type, 'commit');
  const b = new Session({ source: src(['aa bb cc', 'x']), lang: 'en', time: 0 });
  v = '';
  for (const ch of 'aaxxx bb') { v += ch; b.input(v, (t += 100)); }
  assert.equal(b.input(v + ' ', (t += 100)).type, 'update');
});

ok('an auto-advanced line earns its break only when the break is typed', () => {
  const lines = ['ab cd', 'ef gh', 'ij'];
  const run = (typeBreak) => {
    const s = new Session({ source: src(lines), lang: 'en', time: 0 });
    let t = 0;
    for (const line of lines.slice(0, 2)) {
      let v = '';
      for (const ch of line) { v += ch; s.input(v, (t += 100)); }
      if (typeBreak) s.input(' ', (t += 100));
    }
    return s.stats().correct;
  };
  assert.equal(run(true) - run(false), 2);
});

ok('korean raw speed is even for an even typist', () => {
  const lines = ['가나다라 마바사 아자차카 타파하.', '오늘도 좋은 하루 보내세요.', '하늘이 맑고 바람이 시원해요.'];
  const s = new Session({ source: src(lines), lang: 'ko', time: 0 });
  let t = 0;
  for (const line of lines) {
    for (const v of imeStates(keys(line))) s.input(v, (t += 100));
    s.commit('enter', (t += 100));
  }
  const raws = s.samples.slice(0, -1).map((x) => x.raw);
  const cons = s.stats().consistency;
  assert.ok(Math.min(...raws) >= 540 && Math.max(...raws) <= 660, 'per-second raw ' + raws.join(','));
  assert.ok(cons > 95, 'consistency ' + cons);
});

ok('missed-key map blames the letter a premature space replaced', () => {
  const s = new Session({ source: src(['abc def', 'x']), lang: 'en', time: 0 });
  let t = 0;
  s.input('a', (t += 100)); s.input('ab', (t += 100)); s.input('ab ', (t += 100));
  assert.deepEqual(s.keyStats.c, [0, 1]);
  assert.equal(s.keyStats[' '], undefined);
});

console.log(pass, 'passed');
