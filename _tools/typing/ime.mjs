// A 두벌식 IME automaton: feeds keys, yields the input value after each key.
const KJ = { q:'ㅂ',w:'ㅈ',e:'ㄷ',r:'ㄱ',t:'ㅅ',y:'ㅛ',u:'ㅕ',i:'ㅑ',o:'ㅐ',p:'ㅔ',a:'ㅁ',s:'ㄴ',d:'ㅇ',f:'ㄹ',g:'ㅎ',h:'ㅗ',j:'ㅓ',k:'ㅏ',l:'ㅣ',z:'ㅋ',x:'ㅌ',c:'ㅊ',v:'ㅍ',b:'ㅠ',n:'ㅜ',m:'ㅡ',Q:'ㅃ',W:'ㅉ',E:'ㄸ',R:'ㄲ',T:'ㅆ',O:'ㅒ',P:'ㅖ' };
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
const VC = { 'ㅗㅏ':'ㅘ','ㅗㅐ':'ㅙ','ㅗㅣ':'ㅚ','ㅜㅓ':'ㅝ','ㅜㅔ':'ㅞ','ㅜㅣ':'ㅟ','ㅡㅣ':'ㅢ' };
const FC = { 'ㄱㅅ':'ㄳ','ㄴㅈ':'ㄵ','ㄴㅎ':'ㄶ','ㄹㄱ':'ㄺ','ㄹㅁ':'ㄻ','ㄹㅂ':'ㄼ','ㄹㅅ':'ㄽ','ㄹㅌ':'ㄾ','ㄹㅍ':'ㄿ','ㄹㅎ':'ㅀ','ㅂㅅ':'ㅄ' };
const FS = Object.fromEntries(Object.entries(FC).map(([k,v])=>[v,[k[0],k[1]]]));
const isV = (j) => JUNG.includes(j);
function compose(c, v, f) {
  if (c && v) return String.fromCharCode(0xAC00 + CHO.indexOf(c)*588 + JUNG.indexOf(v)*28 + (f ? JONG.indexOf(f) : 0));
  return c || v || '';
}
// keysStr: 2-set letters, spaces and other chars pass through
export function imeStates(keysStr) {
  let done = ''; let c='', v='', f='';
  const states = [];
  const cur = () => done + compose(c, v, f);
  const flush = () => { done += compose(c, v, f); c=''; v=''; f=''; };
  for (const k of keysStr) {
    const j = KJ[k];
    if (!j) { flush(); done += k; states.push(cur()); continue; }
    if (isV(j)) {
      if (f) { // jong migrates
        let keep = '', move = f;
        if (FS[f]) { keep = FS[f][0]; move = FS[f][1]; }
        f = keep; flush(); c = move; v = j;
      } else if (c && v) {
        if (VC[v + j]) v = VC[v + j]; else { flush(); v = j; }
      } else if (c) v = j;
      else if (v) { if (VC[v + j]) v = VC[v + j]; else { flush(); v = j; } }
      else v = j;
    } else {
      if (c && v && !f) {
        if (JONG.includes(j) && j !== ' ') f = j; else { flush(); c = j; }
      } else if (c && v && f) {
        if (FC[f + j]) f = FC[f + j]; else { flush(); c = j; }
      } else if (c && !v) { flush(); c = j; }
      else if (!c && v) { flush(); c = j; }
      else c = j;
    }
    states.push(cur());
  }
  return states;
}
