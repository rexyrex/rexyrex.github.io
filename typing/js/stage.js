/* The typing surface: four lines of text (one done, the current one, two to
   come), a caret, a live HUD and a visible prompt that holds the real
   <input> — the IME composes there, so Korean works on every platform.

   The stage only shows and forwards; the Session judges. */

import { compareWord, linePosition } from './engine.js';
import { play } from './sound.js';
import { t, unit } from './i18n.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* One line as HTML. mode: 'done' (committed), 'live' (being typed), 'todo'. */
export function lineHTML(line, typed, mode) {
  const tw = line.text.split(' ');
  const yw = typed == null || mode === 'todo' ? [] : typed.split(' ');
  const cur = mode === 'live' ? yw.length - 1 : -1;
  let html = '';
  for (let i = 0; i < tw.length; i++) {
    const tgt = tw[i];
    const y = yw[i];
    let chars;
    if (y === undefined) chars = Array.from(tgt, (ch) => ({ ch, st: mode === 'done' ? 'miss' : 'todo' }));
    else chars = compareWord(tgt, y, i === cur ? 'live' : 'done');
    const finished = y !== undefined && i !== cur;
    html += '<span class="w' + (finished && y !== tgt ? ' w-bad' : '') + '">';
    for (let c = 0; c < chars.length; c++) {
      const ch = chars[c];
      let cls = 'c ' + ch.st;
      if (i === cur) {
        if (c === y.length) cls += ' at';
        else if (c === chars.length - 1 && y.length >= chars.length) cls += ' at-end';
      }
      html += '<span class="' + cls + '">' + esc(ch.ch) + '</span>';
    }
    if (i === cur && chars.length === 0) html += '<span class="c todo at"></span>';
    html += '</span>';
    if (i < tw.length - 1) {
      const st = yw.length - 1 > i ? 'ok' : mode === 'done' ? 'miss' : 'todo';
      html += '<span class="c sp ' + st + '"> </span>';
    }
  }
  // whole extra words typed past the end of the line
  for (let i = tw.length; i < yw.length; i++) {
    html += '<span class="c sp extra"> </span><span class="w w-bad">';
    const y = yw[i];
    for (let c = 0; c < y.length; c++) {
      html += '<span class="c extra' + (i === cur && c === y.length - 1 ? ' at-end' : '') + '">' + esc(y[c]) + '</span>';
    }
    if (i === cur && !y.length) html += '<span class="c todo at"></span>';
    html += '</span>';
  }
  if (line.note) html += '<span class="ln-note">— ' + esc(line.note) + '</span>';
  return html;
}

const fmtClock = (ms) => {
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

export class Stage {
  /* opts: { onFinish(session), onRestart(), onEscape(), onStart(), onCommit(),
             keyboard (Keyboard), settings () → settings object } */
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    root.classList.add('stage');
    root.innerHTML = `
      <div class="stage-progress"><i></i></div>
      <div class="stage-hud">
        <div class="hud-clock"><b class="hud-big">0</b><span class="hud-small"></span></div>
        <div class="hud-live">
          <span class="hud-speed"><b>0</b><small></small></span>
          <span class="hud-acc"><b>100</b><small>%</small></span>
        </div>
        <div class="hud-tags">
          <span class="hud-tag"></span>
          <button type="button" class="tg-icon-btn hud-restart"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>
        </div>
      </div>
      <div class="stage-text">
        <div class="stage-lines"></div>
      </div>
      <label class="stage-prompt">
        <span class="prompt-mark" aria-hidden="true">›</span>
        <input class="stage-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next">
      </label>
      <button type="button" class="stage-focus"><i class="fa-solid fa-arrow-pointer" aria-hidden="true"></i> <span></span></button>
      <div class="stage-toast" role="status"></div>`;
    this.el = {
      bar: root.querySelector('.stage-progress i'),
      big: root.querySelector('.hud-big'),
      small: root.querySelector('.hud-small'),
      live: root.querySelector('.hud-live'),
      speed: root.querySelector('.hud-speed b'),
      speedUnit: root.querySelector('.hud-speed small'),
      acc: root.querySelector('.hud-acc b'),
      tag: root.querySelector('.hud-tag'),
      restart: root.querySelector('.hud-restart'),
      text: root.querySelector('.stage-text'),
      lines: root.querySelector('.stage-lines'),
      input: root.querySelector('.stage-input'),
      focus: root.querySelector('.stage-focus'),
      toast: root.querySelector('.stage-toast')
    };
    this.caret = document.createElement('div');
    this.caret.className = 'caret';
    this.ghost = document.createElement('div');
    this.ghost.className = 'caret ghost';
    this.el.lines.append(this.caret, this.ghost);
    this.session = null;
    this.raf = 0;
    this.active = false;
    this.pendingEnter = false;
    this.bind();
  }

  bind() {
    const inp = this.el.input;
    inp.addEventListener('input', () => this.onInput());
    inp.addEventListener('keydown', (e) => this.onKey(e));
    inp.addEventListener('compositionstart', () => {
      // a new syllable must not land on a line whose Enter is still pending
      if (this.pendingEnter) this.doEnter();
      this.composing = true;
    });
    inp.addEventListener('compositionend', () => {
      this.composing = false;
      if (this.pendingEnter) setTimeout(() => this.doEnter(), 0);
    });
    inp.addEventListener('paste', (e) => e.preventDefault());
    inp.addEventListener('drop', (e) => e.preventDefault());
    inp.addEventListener('focus', () => this.root.classList.remove('blurred'));
    inp.addEventListener('blur', () => {
      // a short delay: clicks inside the stage refocus straight away
      setTimeout(() => { if (document.activeElement !== inp && this.active) this.root.classList.add('blurred'); }, 120);
    });
    this.el.focus.addEventListener('click', () => this.focus());
    this.el.text.addEventListener('mousedown', (e) => { e.preventDefault(); this.focus(); });
    this.el.restart.addEventListener('click', () => this.opts.onRestart && this.opts.onRestart());
  }

  get settings() { return this.opts.settings(); }

  /* opts: { tag, tagClass, pace (chars per minute) | null, showLive } */
  load(session, opts = {}) {
    this.session = session;
    this.loadOpts = opts;
    this.pendingEnter = false;
    this.composing = false;
    this.lastErrors = 0;
    this.finished = false;
    this.lastHud = 0;
    this.keyMap = {};
    this.locked = !!opts.locked;
    this.el.input.readOnly = this.locked;
    const s = this.settings;
    this.root.dataset.lang = session.lang;
    this.root.dataset.caret = s.caret;
    this.root.dataset.size = s.size;
    this.root.classList.toggle('smooth', !!s.smooth);
    this.root.classList.remove('running', 'done', 'failed');
    this.root.classList.toggle('timed', !!session.limit);
    this.el.input.value = '';
    this.el.input.lang = session.lang === 'ko' ? 'ko' : 'en';
    this.el.input.setAttribute('aria-label', t('stage.aria'));
    this.el.input.placeholder = opts.placeholder || t(session.lang === 'ko' ? 'stage.placeholderKo' : 'stage.placeholder');
    this.el.text.lang = session.lang === 'ko' ? 'ko' : 'en';
    this.el.tag.textContent = opts.tag || '';
    this.el.tag.className = 'hud-tag ' + (opts.tagClass || '');
    this.el.tag.hidden = !opts.tag;
    this.el.restart.setAttribute('aria-label', t('hint.restart'));
    this.el.speedUnit.textContent = unit(session.lang);
    this.el.focus.querySelector('span').textContent = t('stage.focus');
    this.el.live.classList.toggle('hidden', s.liveSpeed === false || opts.showLive === false);
    this.el.toast.classList.remove('show');
    this.ghost.hidden = !opts.pace;
    if (this.opts.keyboard) this.opts.keyboard.setLang(session.lang === 'ko' ? 'ko' : 'en');
    this.render(false);
    this.hud(true);
    this.start();
  }

  start() {
    this.active = true;
    cancelAnimationFrame(this.raf);
    const loop = () => {
      if (!this.active) return;
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.root.classList.remove('blurred');
  }

  unlock() {
    this.locked = false;
    this.el.input.readOnly = false;
    this.focus();
  }

  focus() {
    if (this.finished) return;
    this.el.input.focus({ preventScroll: true });
  }

  frame() {
    const s = this.session;
    if (!s || this.finished) return;
    if (s.started && !s.done) {
      if (s.tick()) return this.finish();
      if (!this.root.classList.contains('running')) this.root.classList.add('running');
    }
    const now = performance.now();
    if (now - this.lastHud > 100) { this.hud(false); this.lastHud = now; }
    if (this.loadOpts.pace) this.placeGhost();
  }

  hud(force) {
    const s = this.session;
    const el = this.el;
    if (s.limit) {
      const left = s.started ? s.remaining() : s.limit * 1000;
      el.big.textContent = Math.ceil(left / 1000);
      el.small.textContent = t('stage.secLeft');
      el.bar.style.transform = 'scaleX(' + (s.started ? 1 - left / (s.limit * 1000) : 0) + ')';
      this.root.classList.toggle('hurry', s.started && left < 10000 && left > 0);
    } else {
      const total = this.totalLines();
      el.big.textContent = fmtClock(s.elapsed());
      el.small.textContent = (Math.min(s.idx + 1, total)) + ' / ' + total;
      el.bar.style.transform = 'scaleX(' + (total ? s.idx / total : 0) + ')';
    }
    if (s.started && (force || true)) {
      const st = s.stats();
      el.speed.textContent = st.ms > 1500 ? Math.round(st.speed) : '–';
      el.acc.textContent = Math.round(st.acc * 100);
    } else {
      el.speed.textContent = '–';
      el.acc.textContent = '100';
    }
  }

  totalLines() {
    const s = this.session;
    if (s.limit) return 0;
    if (this._total && this._totalFor === s) return this._total;
    let n = 0;
    while (s.line(n)) n++;
    this._total = n;
    this._totalFor = s;
    return n;
  }

  /* ---------- Rendering ---------------------------------------- */

  render(animate) {
    const s = this.session;
    const box = this.el.lines;
    let shift = 0;
    const oldCur = box.querySelector('.ln.cur');
    const oldTop = oldCur ? oldCur.getBoundingClientRect().top : 0;
    const oldIdx = oldCur ? +oldCur.dataset.i : -1;

    for (const n of Array.from(box.querySelectorAll('.ln'))) n.remove();
    const frag = document.createDocumentFragment();
    for (let i = s.idx - 1; i <= s.idx + 2; i++) {
      const div = document.createElement('div');
      div.className = 'ln';
      div.dataset.i = i;
      const line = i >= 0 ? s.line(i) : null;
      if (!line) {
        div.classList.add('ln-empty');
        div.innerHTML = '&nbsp;';
      } else {
        if (line.indent) div.style.setProperty('--indent', line.indent);
        if (i < s.idx) {
          const r = s.results[i];
          div.classList.add('prev');
          div.innerHTML = lineHTML(line, r ? r.typed : '', 'done');
        } else if (i === s.idx) {
          div.classList.add('cur');
          div.innerHTML = lineHTML(line, s.value, 'live');
        } else {
          div.classList.add('next');
          div.innerHTML = lineHTML(line, null, 'todo');
        }
      }
      frag.appendChild(div);
    }
    box.insertBefore(frag, this.caret);

    if (animate && oldIdx >= 0) {
      const same = box.querySelector('.ln[data-i="' + oldIdx + '"]');
      if (same) shift = oldTop - same.getBoundingClientRect().top;
      if (shift) {
        box.style.transition = 'none';
        box.style.transform = 'translateY(' + shift + 'px)';
        void box.offsetHeight;
        box.style.transition = '';
        box.style.transform = '';
      }
    }
    this.placeCaret();
    this.hintKey();
  }

  renderCurrent() {
    const s = this.session;
    const cur = this.el.lines.querySelector('.ln.cur');
    if (!cur || !s.current) return this.render(false);
    cur.innerHTML = lineHTML(s.current, s.value, 'live');
    this.placeCaret();
    this.hintKey();
  }

  placeCaret() {
    const cur = this.el.lines.querySelector('.ln.cur');
    const c = this.caret;
    if (!cur) { c.hidden = true; return; }
    c.hidden = false;
    let span = cur.querySelector('.at');
    let after = false;
    if (!span) { span = cur.querySelector('.at-end'); after = true; }
    if (!span) span = cur.querySelector('.c');
    if (!span) return;
    const x = span.offsetLeft + (after ? span.offsetWidth : 0);
    const y = span.offsetTop;
    c.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    c.style.height = span.offsetHeight + 'px';
    c.style.width = this.settings.caret === 'line' ? '' : Math.max(8, span.offsetWidth || 10) + 'px';
    this.root.classList.add('typing');
    clearTimeout(this.idleT);
    this.idleT = setTimeout(() => this.root.classList.remove('typing'), 700);
  }

  placeGhost() {
    const s = this.session;
    const g = this.ghost;
    if (!s.started || s.done) { g.style.opacity = s.started ? '0' : '0.0'; return; }
    let chars = (this.loadOpts.pace / 60000) * s.elapsed();
    let li = 0;
    while (true) {
      const line = s.line(li);
      if (!line) { g.style.opacity = '0'; return; }
      if (chars < line.text.length + 1) break;
      chars -= line.text.length + 1;
      li++;
    }
    const el = this.el.lines.querySelector('.ln[data-i="' + li + '"]');
    if (!el) { g.style.opacity = '0'; return; }
    const spans = el.querySelectorAll('.c:not(.extra):not(.xpend)');
    const k = Math.floor(chars);
    const span = spans[Math.min(k, spans.length - 1)];
    if (!span) return;
    const after = k >= spans.length;
    g.style.opacity = '';
    g.style.transform = 'translate(' + (span.offsetLeft + (after ? span.offsetWidth : 0)) + 'px,' + span.offsetTop + 'px)';
    g.style.height = span.offsetHeight + 'px';
  }

  hintKey() {
    const kb = this.opts.keyboard;
    if (!kb || !this.session.current) return;
    kb.hint(linePosition(this.session.target, this.session.value).next);
  }

  toast(msg) {
    const el = this.el.toast;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---------- Input -------------------------------------------- */

  onInput() {
    const s = this.session;
    if (!s || this.finished) return;
    const wasStarted = s.started;
    const r = s.input(this.el.input.value);
    if (!wasStarted && s.started) {
      this.root.classList.add('running');
      if (this.opts.onStart) this.opts.onStart();
    }
    this.handle(r);
  }

  handle(r) {
    const s = this.session;
    if (r.type === 'reset') { this.el.input.value = ''; return; }
    if (r.type === 'revert') { this.el.input.value = s.value; return; }
    if (r.type === 'ignored') return;
    if (s.errors > this.lastErrors) {
      this.lastErrors = s.errors;
      if (this.settings.keySound !== 'off') play('error');
      this.root.classList.remove('shake');
      void this.root.offsetWidth;
      this.root.classList.add('shake');
    }
    if (r.type === 'blocked') {
      this.toast(t('stage.notYet'));
      return;
    }
    if (r.type === 'commit') {
      this.el.input.value = '';
      if (this.settings.keySound !== 'off') play('line');
      this.render(true);
      this.hud(true);
      if (this.opts.onCommit) this.opts.onCommit();
      return;
    }
    if (r.type === 'finish') {
      this.el.input.value = '';
      this.finish();
      return;
    }
    this.renderCurrent();
    if (r.hint === 'toKo') this.toast(t('stage.imeKo'));
    else if (r.hint === 'toEn') this.toast(t('stage.imeEn'));
  }

  onKey(e) {
    const s = this.session;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (this.opts.onRestart) this.opts.onRestart();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.el.input.blur();
      if (this.opts.onEscape) this.opts.onEscape();
      return;
    }
    if (!s || this.finished) return;
    if (this.locked) { if (e.key.length === 1 || e.key === 'Process') e.preventDefault(); return; }
    // the next key arrived before a pending Enter ran: finish that line first
    if (this.pendingEnter && e.key !== 'Enter') this.doEnter();
    this.keyMap[e.code || e.key] = (this.keyMap[e.code || e.key] || 0) + 1;
    if (this.opts.keyboard) this.opts.keyboard.press(e);
    if (!e.repeat && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Process')) {
      const ks = this.settings.keySound;
      if (ks !== 'off') play(e.key === ' ' ? 'space' : ks);
    }
    if (e.key === 'Enter') {
      if (e.isComposing || this.composing) {
        // let the IME finish the syllable first (compositionend runs it)
        this.pendingEnter = true;
        clearTimeout(this.enterT);
        this.enterT = setTimeout(() => this.doEnter(), 90);
      } else if (e.keyCode === 229) {
        // Safari: the syllable is already final; take it on the next tick
        this.pendingEnter = true;
        clearTimeout(this.enterT);
        this.enterT = setTimeout(() => this.doEnter(), 0);
      } else {
        e.preventDefault();
        this.doEnter();
      }
    }
  }

  doEnter() {
    if (!this.pendingEnter && this.composing) return;
    this.pendingEnter = false;
    clearTimeout(this.enterT);
    const s = this.session;
    if (!s || this.finished) return;
    // the IME may have changed the value after the last input event
    if (this.el.input.value !== s.value) {
      const r0 = s.input(this.el.input.value);
      if (r0.type !== 'update') return this.handle(r0);
    }
    this.handle(s.commit('enter'));
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    const s = this.session;
    if (!s.done) s.finish('end');
    this.root.classList.remove('running');
    this.root.classList.add('done');
    if (s.reason === 'fail') this.root.classList.add('failed');
    this.hud(true);
    this.el.input.blur();
    this.stop();
    if (this.opts.keyboard) this.opts.keyboard.clearHint();
    if (this.opts.onFinish) this.opts.onFinish(s);
  }
}
