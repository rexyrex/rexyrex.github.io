/* Meteor defense: words fall on the island; type one and press Enter (or
   Space) to blow it up before it lands. Five lives, faster every level,
   combos multiply points, and a few special meteors change the sky. */

import { arcadeWords } from './content.js';
import { strokes, isHangul, isKeyPrefix } from './hangul.js';

const MAX_LIVES = 5;
const PER_LEVEL = 8;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Meteor {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.el = {
      sky: root.querySelector('#mtSky'),
      field: root.querySelector('#mtField'),
      input: root.querySelector('#mtInput'),
      score: root.querySelector('#mtScore'),
      level: root.querySelector('#mtLevel'),
      combo: root.querySelector('#mtCombo'),
      lives: root.querySelector('#mtLives'),
      pause: root.querySelector('#mtPause'),
      banner: root.querySelector('#mtBanner'),
      overlay: root.querySelector('#mtOverlay'),
      rex: root.querySelector('#mtRex')
    };
    this.state = 'menu';
    this.meteors = [];
    this.raf = 0;
    this.pools = {};
    this.bind();
  }

  get s() { return this.ctx.store.settings; }
  t(k) { return this.ctx.t(k); }

  bind() {
    const inp = this.el.input;
    inp.addEventListener('input', () => this.onInput());
    inp.addEventListener('compositionstart', () => {
      if (this.pendingEnter) this.submitNow();
      this.composing = true;
    });
    inp.addEventListener('compositionend', () => {
      this.composing = false;
      if (this.pendingEnter) setTimeout(() => this.submitNow(), 0);
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.togglePause(); return; }
      if (this.state !== 'play') return;
      if (this.pendingEnter && e.key !== 'Enter') this.submitNow();
      if (e.key === 'Enter') {
        if (e.isComposing || this.composing) {
          this.pendingEnter = true;
          clearTimeout(this.enterT);
          this.enterT = setTimeout(() => this.submitNow(), 90);
        } else if (e.keyCode === 229) {
          this.pendingEnter = true;
          clearTimeout(this.enterT);
          this.enterT = setTimeout(() => this.submitNow(), 0);
        } else {
          e.preventDefault();
          this.submitNow();
        }
      }
    });
    inp.addEventListener('paste', (e) => e.preventDefault());
    this.el.pause.addEventListener('click', () => this.togglePause());
    this.el.overlay.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'start') this.countdown();
      else if (act === 'resume') this.resume();
      else if (act === 'menu') this.menu();
      else if (act === 'save') this.save();
      else if (act === 'lang') { this.ctx.store.set('meteorLang', b.dataset.lang); this.menu(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
  }

  /* ---------- Screens ------------------------------------------ */

  enter() {
    this.active = true;
    if (this.state === 'play') this.pause();
    else if (this.state !== 'paused' && this.state !== 'over') this.menu();
    this.paintHud();
  }

  leave() {
    this.active = false;
    if (this.state === 'play' || this.state === 'countdown') {
      clearInterval(this.cdT);
      if (this.state === 'countdown') { this.state = 'menu'; }
      else this.pause();
    }
    cancelAnimationFrame(this.raf);
  }

  refresh() {
    if (this.state === 'menu') this.menu();
    else if (this.state === 'paused') this.pause();
    else if (this.state === 'over') this.gameOver(true);
  }

  focus() { if (this.state === 'play') this.el.input.focus({ preventScroll: true }); }

  // Enter with nothing focused: start from the menu or the game-over card
  enterKey() {
    if (this.state === 'menu' || this.state === 'over') this.countdown();
    else if (this.state === 'paused') this.resume();
    else this.focus();
  }

  overlay(html) {
    const o = this.el.overlay;
    o.innerHTML = html ? '<div class="mt-card">' + html + '</div>' : '';
    o.classList.toggle('show', !!html);
    if (html) {
      const btn = o.querySelector('.tg-btn-primary');
      if (btn) setTimeout(() => btn.focus({ preventScroll: true }), 30);
    }
  }

  menu() {
    this.state = 'menu';
    this.clearField();
    this.resetGame();
    this.paintHud();
    const lang = this.s.meteorLang;
    const m = this.ctx.store.data.meteor;
    this.overlay(`
      <span class="mt-eyebrow"><i class="fa-solid fa-meteor"></i> ${esc(this.t('nav.meteor'))}</span>
      <h2>${esc(this.t('mt.title'))}</h2>
      <p>${esc(this.t('mt.how'))}</p>
      <div class="seg" role="group">
        <button type="button" data-act="lang" data-lang="ko" aria-pressed="${lang === 'ko'}">한글</button>
        <button type="button" data-act="lang" data-lang="en" aria-pressed="${lang === 'en'}">English</button>
      </div>
      <ul class="mt-legend">
        <li><span class="mt-chip k-gold"><i class="fa-solid fa-star"></i></span>${esc(this.t('mt.gold'))}</li>
        <li><span class="mt-chip k-ice"><i class="fa-solid fa-snowflake"></i></span>${esc(this.t('mt.ice'))}</li>
        <li><span class="mt-chip k-bomb"><i class="fa-solid fa-bomb"></i></span>${esc(this.t('mt.bomb'))}</li>
        <li><span class="mt-chip k-heart"><i class="fa-solid fa-heart"></i></span>${esc(this.t('mt.heart'))}</li>
      </ul>
      <button type="button" class="tg-btn tg-btn-primary tg-btn-lg" data-act="start"><i class="fa-solid fa-play"></i><span>${esc(this.t('mt.start'))}</span><kbd>enter</kbd></button>
      ${m.games ? '<p class="mt-best">' + esc(this.ctx.fmt('mt.bestLine', { s: m.best.toLocaleString(), l: m.bestLevel })) + '</p>' : ''}`);
  }

  resetGame() {
    this.score = 0;
    this.level = 1;
    this.lives = MAX_LIVES;
    this.combo = 0;
    this.bestCombo = 0;
    this.words = 0;
    this.chars = 0;
    this.misses = 0;
    this.landed = 0;
    this.playMs = 0;
    this.spawnIn = 0.6;
    this.frozen = 0;
    this.saved = false;
  }

  countdown() {
    this.resetGame();
    this.clearField();
    this.paintHud();
    this.overlay('');
    this.state = 'countdown';
    this.lang = this.s.meteorLang;
    this.pool = this.pools[this.lang] || (this.pools[this.lang] = arcadeWords(this.lang));
    let n = 3;
    const show = () => {
      this.banner(String(n), 'count');
      if (this.s.sfx) this.ctx.sound.play('beep');
    };
    show();
    this.el.input.value = '';
    this.el.input.focus({ preventScroll: true });
    clearInterval(this.cdT);
    this.cdT = setInterval(() => {
      n--;
      if (n > 0) return show();
      clearInterval(this.cdT);
      this.banner('GO!', 'count go');
      if (this.s.sfx) this.ctx.sound.play('go');
      this.play();
    }, 650);
  }

  play() {
    this.state = 'play';
    this.overlay('');
    this.el.input.focus({ preventScroll: true });
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    const loop = (now) => {
      if (this.state !== 'play') return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    if (this.state !== 'play' && this.state !== 'paused') return;
    this.state = 'paused';
    cancelAnimationFrame(this.raf);
    this.overlay(`
      <h2>${esc(this.t('mt.paused'))}</h2>
      <p>${esc(this.ctx.fmt('mt.pausedLine', { s: this.score.toLocaleString(), l: this.level }))}</p>
      <div class="mt-actions">
        <button type="button" class="tg-btn tg-btn-primary" data-act="resume"><i class="fa-solid fa-play"></i><span>${esc(this.t('mt.resume'))}</span></button>
        <button type="button" class="tg-btn tg-btn-ghost" data-act="menu"><i class="fa-solid fa-xmark"></i><span>${esc(this.t('mt.quit'))}</span></button>
      </div>`);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.play();
  }

  togglePause() {
    if (this.state === 'play') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  /* ---------- Simulation --------------------------------------- */

  fallSeconds() { return Math.max(3.4, 10 - (this.level - 1) * 0.55); }
  spawnGap() { return Math.max(0.45, 1.9 - (this.level - 1) * 0.12); }
  maxOnScreen() { return Math.min(14, 4 + this.level); }

  pickWord() {
    const lv = this.level;
    let lo;
    let hi;
    if (this.lang === 'ko') { lo = 1; hi = lv < 3 ? 2 : lv < 6 ? 3 : 4; if (lv >= 4) lo = 2; }
    else { lo = 2; hi = lv < 3 ? 5 : lv < 6 ? 7 : lv < 9 ? 9 : 12; if (lv >= 5) lo = 4; }
    const onScreen = new Set(this.meteors.map((m) => m.word));
    for (let i = 0; i < 40; i++) {
      const w = this.pool[Math.floor(Math.random() * this.pool.length)];
      if (w.length >= lo && w.length <= hi && !onScreen.has(w)) return w;
    }
    return this.pool[Math.floor(Math.random() * this.pool.length)];
  }

  spawn() {
    const field = this.el.field;
    const W = field.clientWidth;
    const word = this.pickWord();
    const r = Math.random();
    let kind = 'rock';
    if (r < 0.06) kind = 'gold';
    else if (r < 0.10) kind = 'ice';
    else if (r < 0.13 && this.level >= 3) kind = 'bomb';
    else if (r < 0.16 && this.lives < MAX_LIVES) kind = 'heart';
    const el = document.createElement('div');
    el.className = 'meteor k-' + kind;
    const icon = { gold: 'fa-star', ice: 'fa-snowflake', bomb: 'fa-bomb', heart: 'fa-heart' }[kind];
    el.innerHTML = '<span class="mt-trail"></span><span class="mt-rock">' + (icon ? '<i class="fa-solid ' + icon + '"></i>' : '') + '</span><span class="mt-word" lang="' + this.lang + '">' + esc(word) + '</span>';
    field.appendChild(el);
    const w = el.offsetWidth;
    // keep away from the meteors near the top
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < 8; i++) {
      const x = 8 + Math.random() * Math.max(10, W - w - 16);
      let d = Infinity;
      for (const m of this.meteors) if (m.y < 140) d = Math.min(d, Math.abs(m.x - x));
      if (d > bestD) { bestD = d; best = x; }
    }
    const H = this.groundY();
    const m = { word, kind, el, x: best, y: -40, w, speed: (H + 40) / this.fallSeconds() * (0.85 + Math.random() * 0.3), wobble: Math.random() * 6.28 };
    this.meteors.push(m);
    this.place(m);
  }

  groundY() { return this.el.field.clientHeight - this.el.field.clientHeight * 0.16; }

  place(m) {
    m.el.style.transform = 'translate3d(' + m.x.toFixed(1) + 'px,' + m.y.toFixed(1) + 'px,0)';
  }

  step(dt) {
    this.playMs += dt * 1000;
    if (this.frozen > 0) {
      this.frozen -= dt;
      if (this.frozen <= 0) this.el.sky.classList.remove('frozen');
    }
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.meteors.length < this.maxOnScreen()) {
      this.spawn();
      this.spawnIn = this.spawnGap() * (0.7 + Math.random() * 0.6);
    }
    const ground = this.groundY();
    for (const m of this.meteors.slice()) {
      if (this.frozen <= 0) m.y += m.speed * dt;
      this.place(m);
      if (m.y + 24 >= ground) this.land(m);
    }
    if (this.lives <= 0) this.gameOver();
  }

  land(m) {
    this.remove(m);
    if (m.kind === 'heart' || m.kind === 'gold') {
      // a missed bonus costs nothing but the bonus
      this.fx(m, 'fizzle');
      return;
    }
    this.lives--;
    this.landed++;
    this.combo = 0;
    this.fx(m, 'impact');
    this.el.sky.classList.remove('quake');
    void this.el.sky.offsetWidth;
    this.el.sky.classList.add('quake');
    this.el.rex.classList.remove('ouch');
    void this.el.rex.offsetWidth;
    this.el.rex.classList.add('ouch');
    if (this.s.sfx) this.ctx.sound.play('hit');
    this.paintHud();
  }

  remove(m) {
    const i = this.meteors.indexOf(m);
    if (i >= 0) this.meteors.splice(i, 1);
    m.el.remove();
  }

  clearField() {
    for (const m of this.meteors) m.el.remove();
    this.meteors = [];
    this.el.field.querySelectorAll('.boom, .impact').forEach((n) => n.remove());
    this.el.sky.classList.remove('frozen', 'quake');
    this.el.banner.className = 'mt-banner';
  }

  fx(m, kind) {
    const el = document.createElement('div');
    el.className = kind === 'impact' ? 'impact' : 'boom boom-' + m.kind + (kind === 'fizzle' ? ' fizzle' : '');
    const cx = m.x + m.w / 2;
    const cy = kind === 'impact' ? this.groundY() + 8 : m.y + 10;
    el.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
    if (kind !== 'impact') {
      for (let i = 0; i < 10; i++) {
        const p = document.createElement('i');
        const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
        const d = 30 + Math.random() * 40;
        p.style.setProperty('--dx', (Math.cos(a) * d).toFixed(1) + 'px');
        p.style.setProperty('--dy', (Math.sin(a) * d).toFixed(1) + 'px');
        el.appendChild(p);
      }
    }
    this.el.field.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  floatText(m, text, cls) {
    const el = document.createElement('div');
    el.className = 'mt-float ' + (cls || '');
    el.textContent = text;
    el.style.transform = 'translate3d(' + (m.x + m.w / 2) + 'px,' + m.y + 'px,0)';
    this.el.field.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  banner(text, cls) {
    const b = this.el.banner;
    b.textContent = text;
    b.className = 'mt-banner';
    void b.offsetWidth;
    b.className = 'mt-banner show ' + (cls || '');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.remove('show'), cls && cls.includes('count') ? 640 : 1100);
  }

  /* ---------- Typing ------------------------------------------- */

  onInput() {
    if (this.state !== 'play') { if (this.state !== 'countdown') this.el.input.value = ''; return; }
    const v = this.el.input.value;
    if (/\s$/.test(v) && v.trim()) { this.submit(v.trim()); return; }
    if (/^\s+$/.test(v)) { this.el.input.value = ''; return; }
    this.highlight(v);
  }

  highlight(v) {
    let primary = null;
    for (const m of this.meteors) {
      const wEl = m.el.querySelector('.mt-word');
      let n = 0;
      let pend = false;
      if (v) {
        while (n < v.length && n < m.word.length && v[n] === m.word[n]) n++;
        if (n < v.length) {
          // the last letter may still be composing (한 on the way to 하나)
          if (n === v.length - 1 && isHangul(v[n]) && isKeyPrefix(v[n], m.word.slice(n))) pend = true;
          else n = -1;
        }
      }
      const on = v && n >= 0;
      m.el.classList.toggle('targeted', !!on);
      if (on) {
        const k = n + (pend ? 1 : 0);
        wEl.innerHTML = '<b>' + esc(m.word.slice(0, n)) + '</b>' + (pend ? '<u>' + esc(m.word[n]) + '</u>' : '') + esc(m.word.slice(k));
        if (!primary || m.y > primary.y) primary = m;
      } else if (wEl.firstElementChild) {
        wEl.textContent = m.word;
      }
      m.el.classList.remove('primary');
    }
    if (primary) primary.el.classList.add('primary');
  }

  submitNow() {
    this.pendingEnter = false;
    clearTimeout(this.enterT);
    const v = this.el.input.value.trim();
    if (v) this.submit(v);
  }

  submit(word) {
    this.el.input.value = '';
    if (this.state !== 'play') return;
    let hit = null;
    for (const m of this.meteors) if (m.word === word && (!hit || m.y > hit.y)) hit = m;
    if (!hit) {
      this.misses++;
      this.combo = 0;
      if (this.s.sfx) this.ctx.sound.play('miss');
      const inp = this.el.input.parentElement;
      inp.classList.remove('shake');
      void inp.offsetWidth;
      inp.classList.add('shake');
      clearTimeout(this.shakeT);
      this.shakeT = setTimeout(() => inp.classList.remove('shake'), 400);
      this.highlight('');
      this.paintHud();
      return;
    }
    this.destroy(hit, true);
    if (hit.kind === 'bomb') {
      for (const m of this.meteors.slice()) this.destroy(m, false);
      this.banner(this.t('mt.bombHit'), 'power');
    } else if (hit.kind === 'ice') {
      this.frozen = 3.2;
      this.el.sky.classList.add('frozen');
      this.banner(this.t('mt.iceHit'), 'power ice');
    } else if (hit.kind === 'heart') {
      this.lives = Math.min(MAX_LIVES, this.lives + 1);
      this.banner(this.t('mt.heartHit'), 'power heart');
    }
    this.highlight('');
    this.paintHud();
  }

  destroy(m, typed) {
    this.remove(m);
    const mult = this.mult();
    let pts = Math.round((10 + strokes(m.word) * 4) * (1 + (this.level - 1) * 0.1) * (typed ? mult : 0.5));
    if (m.kind === 'gold') pts *= 3;
    this.score += pts;
    if (typed) {
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.words++;
      this.chars += m.word.length;
      if (this.words % PER_LEVEL === 0) this.levelUp();
    }
    this.fx(m, 'boom');
    this.floatText(m, '+' + pts, m.kind === 'gold' ? 'gold' : '');
    if (this.s.sfx) this.ctx.sound.play(m.kind === 'rock' ? 'boom' : 'power');
  }

  mult() { return 1 + Math.min(this.combo, 20) * 0.1; }

  levelUp() {
    this.level++;
    this.banner(this.ctx.fmt('mt.levelUp', { n: this.level }), 'level');
    if (this.s.sfx) this.ctx.sound.play('level');
  }

  paintHud() {
    this.el.score.textContent = (this.score || 0).toLocaleString();
    this.el.level.textContent = this.level || 1;
    this.el.combo.textContent = 'x' + this.mult().toFixed(1);
    this.el.combo.parentElement.classList.toggle('hot', this.combo >= 5);
    let h = '';
    for (let i = 0; i < MAX_LIVES; i++) h += '<i class="fa-solid fa-heart' + (i < this.lives ? '' : ' lost') + '"></i>';
    this.el.lives.innerHTML = h;
    this.el.lives.setAttribute('aria-label', this.lives + ' / ' + MAX_LIVES);
  }

  /* ---------- Game over ---------------------------------------- */

  gameOver(repaint) {
    if (!repaint) {
      this.state = 'over';
      cancelAnimationFrame(this.raf);
      this.clearField();
      this.el.input.value = '';
      this.el.input.blur();
      if (this.s.sfx) this.ctx.sound.play('fail');
      this.outcome = this.ctx.store.addMeteor({ score: this.score, level: this.level, words: this.words, chars: this.chars, ms: this.playMs });
      setTimeout(() => this.ctx.announce(this.outcome), 600);
      if (this.outcome.pb && this.score > 0 && this.ctx.confetti) setTimeout(this.ctx.confetti, 300);
    }
    const tries = this.words + this.misses + this.landed;
    const acc = tries ? this.words / tries : 0;
    const cpm = this.playMs > 0 ? this.chars / (this.playMs / 60000) : 0;
    this.lastAcc = acc;
    const pb = this.outcome && this.outcome.pb;
    this.overlay(`
      <span class="mt-eyebrow"><i class="fa-solid fa-meteor"></i> ${esc(this.t('mt.over'))}</span>
      <div class="mt-final"><b>${this.score.toLocaleString()}</b><span>${esc(this.t('mt.score'))}</span></div>
      ${pb ? '<span class="chip chip-pb"><i class="fa-solid fa-crown"></i>' + esc(this.t('res.pb')) + '</span>' : ''}
      <dl class="mt-stats">
        <div><dt>${esc(this.t('mt.level'))}</dt><dd>${this.level}</dd></div>
        <div><dt>${esc(this.t('mt.words'))}</dt><dd>${this.words}</dd></div>
        <div><dt>${esc(this.t('mt.bestCombo'))}</dt><dd>${this.bestCombo}</dd></div>
        <div><dt>${esc(this.t('mt.accuracy'))}</dt><dd>${Math.round(acc * 100)}%</dd></div>
        <div><dt>${esc(this.t('res.cpm'))}</dt><dd>${Math.round(cpm)}</dd></div>
        <div><dt>${esc(this.t('res.time'))}</dt><dd>${Math.round(this.playMs / 1000)}${this.ctx.getUi() === 'ko' ? '초' : 's'}</dd></div>
      </dl>
      <div class="mt-actions">
        <button type="button" class="tg-btn tg-btn-primary" data-act="start"><i class="fa-solid fa-rotate-right"></i><span>${esc(this.t('mt.again'))}</span><kbd>enter</kbd></button>
        ${this.score > 0 && !this.saved ? '<button type="button" class="tg-btn tg-btn-ghost" data-act="save"><i class="fa-solid fa-trophy"></i><span>' + esc(this.t('res.save')) + '</span></button>' : ''}
        <button type="button" class="tg-btn tg-btn-ghost" data-act="menu"><i class="fa-solid fa-list"></i><span>${esc(this.t('mt.menu'))}</span></button>
      </div>`);
  }

  save() {
    this.ctx.openSave({
      cat: 'meteor',
      summary: this.ctx.t('nav.meteor') + ' — ' + this.score.toLocaleString() + ' · Lv.' + this.level,
      record: {
        score: this.score,
        level: this.level,
        words: this.words,
        accuracy: Math.round((this.lastAcc || 0) * 1000) / 1000,
        rank: 'Lv.' + this.level,
        lang: this.lang,
        mode: 5
      },
      onSaved: () => { this.saved = true; this.gameOver(true); }
    });
  }
}

