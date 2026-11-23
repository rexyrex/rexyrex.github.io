/* Hangul ↔ keystrokes on the standard 두벌식 (2-set) layout.

   Every comparison the game makes for Korean goes through keys(): a string
   is turned into the letters a typist presses for it (한 → "gks"). That
   gives three things at once:
   - stroke counts (타수) that do not depend on how the IME reports keys;
   - a fair test for a syllable that is still being composed: 한 is a
     correct step toward 하나, because "gks" is a prefix of "gksk";
   - the next key to press, for the on-screen keyboard hint.

   Shifted keys are uppercase (ㄲ → "R"); a stroke is one letter either way. */

const CHO = ['r', 'R', 's', 'e', 'E', 'f', 'a', 'q', 'Q', 't', 'T', 'd', 'w', 'W', 'c', 'z', 'x', 'v', 'g'];
const JUNG = ['k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'];
const JONG = ['', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T', 'd', 'w', 'c', 'z', 'x', 'v', 'g'];

// Compatibility jamo (ㄱ U+3131 … ㅣ U+3163), as typed on their own.
const COMPAT = {
  'ㄱ': 'r', 'ㄲ': 'R', 'ㄳ': 'rt', 'ㄴ': 's', 'ㄵ': 'sw', 'ㄶ': 'sg', 'ㄷ': 'e', 'ㄸ': 'E', 'ㄹ': 'f',
  'ㄺ': 'fr', 'ㄻ': 'fa', 'ㄼ': 'fq', 'ㄽ': 'ft', 'ㄾ': 'fx', 'ㄿ': 'fv', 'ㅀ': 'fg', 'ㅁ': 'a', 'ㅂ': 'q',
  'ㅃ': 'Q', 'ㅄ': 'qt', 'ㅅ': 't', 'ㅆ': 'T', 'ㅇ': 'd', 'ㅈ': 'w', 'ㅉ': 'W', 'ㅊ': 'c', 'ㅋ': 'z',
  'ㅌ': 'x', 'ㅍ': 'v', 'ㅎ': 'g', 'ㅏ': 'k', 'ㅐ': 'o', 'ㅑ': 'i', 'ㅒ': 'O', 'ㅓ': 'j', 'ㅔ': 'p',
  'ㅕ': 'u', 'ㅖ': 'P', 'ㅗ': 'h', 'ㅘ': 'hk', 'ㅙ': 'ho', 'ㅚ': 'hl', 'ㅛ': 'y', 'ㅜ': 'n', 'ㅝ': 'nj',
  'ㅞ': 'np', 'ㅟ': 'nl', 'ㅠ': 'b', 'ㅡ': 'm', 'ㅢ': 'ml', 'ㅣ': 'l'
};

// The jamo printed on each letter key (lowercase = unshifted).
export const KEY_JAMO = {
  q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
  a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
  Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ'
};

export function isSyllable(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0xAC00 && c <= 0xD7A3;
}

export function isJamo(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x3131 && c <= 0x3163;
}

export function isHangul(ch) {
  return isSyllable(ch) || isJamo(ch);
}

export function hasHangul(str) {
  for (const ch of str) if (isHangul(ch)) return true;
  return false;
}

// Letters pressed for one character (Hangul → 두벌식 letters; anything else → itself).
export function charKeys(ch) {
  if (isSyllable(ch)) {
    const n = ch.charCodeAt(0) - 0xAC00;
    return CHO[Math.floor(n / 588)] + JUNG[Math.floor((n % 588) / 28)] + JONG[n % 28];
  }
  if (COMPAT[ch]) return COMPAT[ch];
  return ch;
}

export function keys(str) {
  let out = '';
  for (const ch of str) out += charKeys(ch);
  return out;
}

// Strokes for a string: one per letter pressed (Shift not counted, as in 타수).
export function strokes(str) {
  let n = 0;
  for (const ch of str) n += charKeys(ch).length;
  return n;
}

// True when `typed` (usually one composing syllable) is a correct step toward
// `target` (the rest of the word from that position).
export function isKeyPrefix(typed, target) {
  if (!typed) return true;
  return keys(target).startsWith(keys(typed));
}

// A Latin letter where Hangul is expected: the IME is probably in English mode.
export function looksLikeWrongIme(typedCh, expectedCh) {
  return /[a-zA-Z]/.test(typedCh) && isHangul(expectedCh || '');
}
