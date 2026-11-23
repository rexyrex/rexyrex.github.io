/* An on-screen keyboard: QWERTY with the 두벌식 jamo on it. It can show
   the next key (and which finger presses it), flash keys as they are
   pressed, and colour keys by how often they were missed. */

import { KEY_JAMO } from './hangul.js';
import { baseKey } from './engine.js';

const ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', ['Backspace', 2, '⌫']],
  [['Tab', 1.5, 'tab'], 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', ['\\', 1.5, '\\']],
  [['CapsLock', 1.8, 'caps'], 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", ['Enter', 2.2, 'enter']],
  [['ShiftLeft', 2.35, 'shift'], 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', ['ShiftRight', 2.65, 'shift']],
  [[' ', 7, '']]
];

// finger: 1–4 left pinky→index, 5 thumbs, 6–9 right index→pinky
const FINGER = {};
const assign = (keys, f) => keys.split('').forEach((k) => { FINGER[k] = f; });
assign('`1qaz', 1); assign('2wsx', 2); assign('3edc', 3); assign('45rtfgvb', 4);
assign('67yuhjnm', 6); assign('8ik,', 7); assign('9ol.', 8); assign("0-=p[]\\;'/", 9);
FINGER[' '] = 5; FINGER.Tab = 1; FINGER.CapsLock = 1; FINGER.ShiftLeft = 1; FINGER.ShiftRight = 9; FINGER.Enter = 9; FINGER.Backspace = 9;

const SHIFT_SYMBOLS = '~!@#$%^&*()_+{}|:"<>?';

export class Keyboard {
  constructor(el) {
    this.el = el;
    this.keys = {};
    this.lang = 'en';
    el.classList.add('vkb');
    el.setAttribute('aria-hidden', 'true');
    for (const row of ROWS) {
      const line = document.createElement('div');
      line.className = 'vkb-row';
      for (const def of row) {
        const [id, w, label] = Array.isArray(def) ? def : [def, 1, def];
        const k = document.createElement('span');
        k.className = 'vkb-key';
        k.style.setProperty('--w', w);
        k.dataset.finger = FINGER[id] || 0;
        const main = document.createElement('b');
        main.textContent = label;
        k.appendChild(main);
        if (KEY_JAMO[id]) {
          const sub = document.createElement('i');
          sub.textContent = KEY_JAMO[id];
          k.appendChild(sub);
          k.classList.add('has-jamo');
        }
        if (id === 'f' || id === 'j') k.classList.add('vkb-bump');
        line.appendChild(k);
        this.keys[id] = k;
      }
      el.appendChild(line);
    }
    const legend = document.createElement('div');
    legend.className = 'vkb-legend';
    el.appendChild(legend);
    this.legend = legend;
  }

  setLang(lang) {
    this.lang = lang;
    this.el.classList.toggle('vkb-ko', lang === 'ko');
  }

  clearHint() {
    for (const k of Object.values(this.keys)) k.classList.remove('hint', 'hint-shift');
    this.el.removeAttribute('data-finger');
  }

  // Light the key(s) for the next character: k is a key letter from
  // engine.linePosition (uppercase = shifted), ' ', 'Enter' or 'Backspace'.
  hint(k) {
    this.clearHint();
    if (!k) return;
    let id = k;
    let shift = false;
    if (k === ' ' || k === 'Enter' || k === 'Backspace') id = k;
    else if (/[A-Z]/.test(k)) { id = k.toLowerCase(); shift = true; }
    else if (SHIFT_SYMBOLS.includes(k)) { id = baseKey(k); shift = true; }
    const el = this.keys[id];
    if (!el) return;
    el.classList.add('hint');
    const finger = FINGER[id] || 0;
    this.el.setAttribute('data-finger', finger);
    if (shift) {
      // the other hand holds Shift
      const side = finger >= 6 ? 'ShiftLeft' : 'ShiftRight';
      this.keys[side].classList.add('hint-shift');
    }
  }

  // Flash a key for a KeyboardEvent.
  press(e, bad) {
    let id;
    if (e.key === ' ' || e.code === 'Space') id = ' ';
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Enter' || e.code === 'Backspace' || e.code === 'Tab' || e.code === 'CapsLock') id = e.code;
    else if (/^Key[A-Z]$/.test(e.code)) id = e.code.slice(3).toLowerCase();
    else if (/^Digit\d$/.test(e.code)) id = e.code.slice(5);
    else id = baseKey(e.key);
    const el = this.keys[id];
    if (!el) return;
    el.classList.remove('down', 'down-bad');
    void el.offsetWidth;
    el.classList.add(bad ? 'down-bad' : 'down');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('down', 'down-bad'), 160);
  }

  // stats: { key: [hits, misses] } → colour by miss rate.
  heat(stats) {
    this.el.classList.add('vkb-heat');
    for (const [id, k] of Object.entries(this.keys)) {
      const s = stats[id];
      k.style.removeProperty('--heat');
      k.removeAttribute('title');
      k.classList.remove('heat-none');
      if (!s || s[0] + s[1] === 0) { k.classList.add('heat-none'); continue; }
      const rate = s[1] / (s[0] + s[1]);
      k.style.setProperty('--heat', Math.min(1, rate * 6).toFixed(3));
      k.title = Math.round((1 - rate) * 100) + '% (' + (s[0] + s[1]) + ')';
    }
  }
}
