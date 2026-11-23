/* Dino race: type a paragraph against three dinosaurs. The bots run at
   speeds set around your own recent pace (or a fixed level), with a little
   wobble and the odd stumble, so every race is close. */

import { raceText, textSource, makeRng, newSeed } from './content.js';
import { strokes } from './hangul.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// characters per minute for each bot, per level
const LEVELS = {
  easy: { ko: [70, 90, 110], en: [90, 115, 140] },
  normal: { ko: [130, 155, 180], en: [170, 205, 240] },
  hard: { ko: [200, 235, 270], en: [270, 320, 370] },
  insane: { ko: [290, 330, 380], en: [400, 460, 520] }
};

const BOTS = [
  { id: 'raptor', hue: 'orange' },
  { id: 'stego', hue: 'blue' },
  { id: 'trike', hue: 'purple' }
];

export class Race {
  constructor(root, ctx, onResult) {
    this.root = root;
    this.ctx = ctx;
    this.onResult = onResult;
    this.track = root.querySelector('#rcTrack');
    this.overlayEl = root.querySelector('#rcOverlay');
    this.state = 'menu';
    this.stage = new ctx.Stage(root.querySelector('#raceStage'), {
      settings: () => ctx.store.settings,
      onFinish: (s) => this.playerDone(s),
      onRestart: () => this.menu(),
      onEscape: () => {}
    });
    this.overlayEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'lang') { ctx.store.set('raceLang', b.dataset.lang); this.menu(); }
      else if (act === 'level') { ctx.store.set('raceLevel', b.dataset.level); this.menu(); }
      else if (act === 'start') this.start();
      else if (act === 'result') this.showResult();
      else if (act === 'again') this.start();
    });
  }

  get s() { return this.ctx.store.settings; }
  t(k) { return this.ctx.t(k); }

  enter() {
    this.active = true;
    if (this.state !== 'done') this.menu();
  }

  leave() {
    this.active = false;
    clearInterval(this.cdT);
    cancelAnimationFrame(this.raf);
    this.stage.stop();
    if (this.state === 'run' || this.state === 'countdown') this.state = 'menu';
  }

  refresh() { if (this.active && this.state === 'menu') this.menu(); }

  focus() { if (this.state === 'run') this.stage.focus(); }

  enterKey() {
    if (this.state === 'menu' || this.state === 'done') this.start();
    else this.focus();
  }

  overlay(html) {
    this.overlayEl.innerHTML = html ? '<div class="rc-card">' + html + '</div>' : '';
    this.overlayEl.classList.toggle('show', !!html);
    const btn = this.overlayEl.querySelector('.tg-btn-primary');
    if (btn) setTimeout(() => btn.focus({ preventScroll: true }), 30);
  }

  /* ---------- Setup -------------------------------------------- */

  botSpeeds(lang) {
    const level = this.s.raceLevel || 'auto';
    const key = lang === 'ko' ? 'ko' : 'en';
    if (level !== 'auto') return LEVELS[level][key].slice();
    const mine = this.ctx.store.recent(lang, 8);
    const base = mine && mine.cpm ? mine.cpm : LEVELS.normal[key][1];
    return [base * 0.84, base * 0.98, base * 1.12];
  }

  menu() {
    this.state = 'menu';
    cancelAnimationFrame(this.raf);
    clearInterval(this.cdT);
    this.stage.stop();
    this.track.classList.remove('running');
    const lang = this.s.raceLang || 'ko';
    const level = this.s.raceLevel || 'auto';
    this.lang = lang;
    this.prepare(false);
    const levels = ['auto', 'easy', 'normal', 'hard', 'insane'];
    this.overlay(`
      <span class="mt-eyebrow"><i class="fa-solid fa-flag-checkered"></i> ${esc(this.t('nav.race'))}</span>
      <h2>${esc(this.t('rc.title'))}</h2>
      <p>${esc(this.t('rc.how'))}</p>
      <div class="rc-opts">
        <div class="seg" role="group">
          <button type="button" data-act="lang" data-lang="ko" aria-pressed="${lang === 'ko'}">한글</button>
          <button type="button" data-act="lang" data-lang="en" aria-pressed="${lang === 'en'}">English</button>
        </div>
        <div class="seg seg-sm" role="group">
          ${levels.map((l) => '<button type="button" data-act="level" data-level="' + l + '" aria-pressed="' + (level === l) + '">' + esc(this.t('rc.' + l)) + '</button>').join('')}
        </div>
      </div>
      <p class="muted rc-level-note">${esc(level === 'auto' ? this.t('rc.autoNote') : this.t('rc.fixedNote'))}</p>
      <button type="button" class="tg-btn tg-btn-primary tg-btn-lg" data-act="start"><i class="fa-solid fa-flag-checkered"></i><span>${esc(this.t('rc.start'))}</span><kbd>enter</kbd></button>
      ${this.ctx.store.data.race.races ? '<p class="mt-best">' + esc(this.ctx.fmt('rc.record', { w: this.ctx.store.data.race.wins, n: this.ctx.store.data.race.races })) + '</p>' : ''}`);
  }

  // A fresh paragraph and fresh bots, drawn on the track.
  prepare(load) {
    const lang = this.lang;
    const r = makeRng(newSeed());
    this.text = raceText(lang, r);
    this.total = this.text.length;
    this.ratio = strokes(this.text) / this.text.length;
    const speeds = this.botSpeeds(lang);
    this.bots = BOTS.map((b, i) => ({
      ...b,
      cpm: speeds[i] * (0.94 + r() * 0.12),
      pos: 0,
      phase: r() * 6.28,
      stumble: 0,
      done: 0
    }));
    this.drawTrack();
    if (load) {
      const el = this.root.querySelector('#raceStage');
      el.dataset.lang = lang;
      const box = el.querySelector('.stage-text');
      const w = box.clientWidth;
      const cw = lang === 'ko' ? 26 : 15;
      const budget = w ? Math.max(16, Math.floor(w / cw)) : (lang === 'ko' ? 28 : 52);
      this.session = new this.ctx.Session({ source: textSource(this.text, budget), lang, time: 0 });
      this.stage.load(this.session, { tag: this.t('nav.race'), tagClass: 'tag-race', locked: true, placeholder: this.t('rc.placeholder') });
    }
  }

  drawTrack() {
    const lanes = [{ id: 'you', hue: 'green', you: true }].concat(this.bots);
    this.track.innerHTML = lanes.map((l) => `
      <div class="lane${l.you ? ' lane-you' : ''}" data-id="${l.id}">
        <span class="lane-name">${esc(l.you ? this.t('rc.you') : this.t('rc.bot.' + l.id))}</span>
        <div class="lane-run">
          <span class="lane-dust"></span>
          <img class="dino hue-${l.hue}" src="/assets/rexGreenSmall.png" alt="" width="256" height="256">
          <span class="lane-speed"></span>
        </div>
        <span class="lane-flag" aria-hidden="true"><i class="fa-solid fa-flag-checkered"></i></span>
        <span class="lane-place"></span>
      </div>`).join('');
    this.laneEls = {};
    this.track.querySelectorAll('.lane').forEach((el) => {
      this.laneEls[el.dataset.id] = { el, dino: el.querySelector('.dino'), speed: el.querySelector('.lane-speed'), place: el.querySelector('.lane-place') };
    });
  }

  /* ---------- Race --------------------------------------------- */

  start() {
    this.overlay('');
    this.prepare(true);
    this.state = 'countdown';
    this.placeDone = [];
    let n = 3;
    const lights = (k) => this.overlay(`<div class="rc-lights">${[3, 2, 1].map((i) => '<i class="' + (k <= i ? 'on' : '') + '"></i>').join('')}<i class="${k === 0 ? 'go' : ''}"></i></div><b class="rc-count">${k || 'GO!'}</b>`);
    lights(n);
    if (this.s.sfx) this.ctx.sound.play('beep');
    clearInterval(this.cdT);
    this.cdT = setInterval(() => {
      n--;
      if (n > 0) { lights(n); if (this.s.sfx) this.ctx.sound.play('beep'); return; }
      clearInterval(this.cdT);
      lights(0);
      if (this.s.sfx) this.ctx.sound.play('go');
      setTimeout(() => { if (this.state === 'run') this.overlay(''); }, 450);
      this.go();
    }, 750);
  }

  go() {
    this.state = 'run';
    this.t0 = performance.now();
    this.session.begin(this.t0);
    this.stage.unlock();
    this.track.classList.add('running');
    this.lastT = this.t0;
    const loop = (now) => {
      if (this.state !== 'run' && this.state !== 'finishing') return;
      const dt = Math.min(0.1, (now - this.lastT) / 1000);
      this.lastT = now;
      this.tick(dt, now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  tick(dt, now) {
    const el = (now - this.t0) / 1000;
    for (const b of this.bots) {
      if (b.done) continue;
      if (b.stumble > 0) { b.stumble -= dt; continue; }
      if (Math.random() < dt * 0.12) { b.stumble = 0.25 + Math.random() * 0.6; continue; }
      const wobble = 1 + 0.22 * Math.sin(b.phase + el * 1.7) + 0.08 * Math.sin(b.phase * 2 + el * 4.3);
      b.pos += (b.cpm / 60) * wobble * dt;
      if (b.pos >= this.total) { b.pos = this.total; b.done = el; this.finishOrder(b.id); }
    }
    const st = this.session.stats();
    const youPos = this.session.done ? this.total : Math.min(this.total - 1, st.correct);
    this.paint('you', youPos / this.total, this.ctx.unit(this.lang), st.ms > 1500 ? Math.round(st.speed) : '');
    for (const b of this.bots) {
      const sp = this.botSpeed(b);
      this.paint(b.id, b.pos / this.total, '', b.done ? '' : Math.round(sp));
    }
  }

  paint(id, f, unitTxt, speed) {
    const l = this.laneEls[id];
    if (!l) return;
    l.dino.style.setProperty('--f', Math.min(1, f).toFixed(4));
    l.speed.style.setProperty('--f', Math.min(1, f).toFixed(4));
    l.speed.textContent = speed === '' ? '' : speed + (unitTxt ? ' ' + unitTxt : '');
  }

  finishOrder(id) {
    if (this.placeDone.includes(id)) return;
    this.placeDone.push(id);
    const l = this.laneEls[id];
    if (l) {
      l.el.classList.add('finished');
      l.place.textContent = this.ordinal(this.placeDone.length);
    }
  }

  // a bot's pace in the player's unit (타/분 or WPM)
  botSpeed(b) { return this.lang === 'ko' ? b.cpm * this.ratio : b.cpm / 5; }

  ordinal(n) { return this.ctx.fmt('rc.place', { n }); }

  playerDone(session) {
    if (this.state !== 'run') return;
    this.state = 'finishing';
    this.finishOrder('you');
    const st = session.stats();
    const youTime = st.ms / 1000;
    // bots still running: their finish time at their own pace
    const times = [{ id: 'you', time: youTime, speed: st.speed, you: true }];
    for (const b of this.bots) {
      const time = b.done || (youTime + (this.total - b.pos) / (b.cpm / 60));
      times.push({ id: b.id, time, speed: this.botSpeed(b) });
    }
    times.sort((a, b) => a.time - b.time);
    const finalPlace = times.findIndex((x) => x.you) + 1;
    this.track.classList.remove('running');
    setTimeout(() => { cancelAnimationFrame(this.raf); this.state = 'done'; }, 1200);
    if (this.s.sfx) this.ctx.sound.play(finalPlace === 1 ? 'win' : 'finish');
    if (finalPlace === 1 && this.ctx.confetti) setTimeout(this.ctx.confetti, 250);
    const raceOutcome = this.ctx.store.addRace(finalPlace);
    const outcome = this.ctx.store.addResult({
      kind: 'race', lang: this.lang, cfgKey: 'race|' + this.lang, speed: st.speed, cpm: st.cpm, acc: st.acc, raw: st.raw, ms: st.ms,
      chars: st.correct, ranked: false, sudden: false, failed: false, keyStats: session.keyStats
    });
    outcome.unlocked = (outcome.unlocked || []).concat(raceOutcome.unlocked || []);
    setTimeout(() => this.ctx.announce(outcome), 900);
    this.result = {
      kind: 'race', lang: this.lang, ranked: false, st, samples: session.samples, failed: false,
      mistakes: session.mistakes(), keyStats: session.keyStats, outcome, best: null, canSave: false,
      navRoute: 'race', label: this.t('nav.race') + ' · ' + this.ordinal(finalPlace) + ' / 4'
    };
    const u = this.ctx.unit(this.lang);
    this.overlay(`
      <span class="mt-eyebrow"><i class="fa-solid fa-flag-checkered"></i> ${esc(this.t('rc.finished'))}</span>
      <h2>${esc(finalPlace === 1 ? this.t('rc.win') : this.ctx.fmt('rc.placed', { n: finalPlace }))}</h2>
      <ol class="podium">${times.map((x, i) => `
        <li class="${x.you ? 'you' : ''}"><span class="pd-place">${i + 1}</span><img class="dino hue-${x.you ? 'green' : BOTS.find((b) => b.id === x.id).hue}" src="/assets/rexGreenSmall.png" alt="" width="256" height="256">
        <b>${esc(x.you ? this.t('rc.you') : this.t('rc.bot.' + x.id))}</b><span>${x.time.toFixed(1)}${this.ctx.getUi() === 'ko' ? '초' : 's'} · ${Math.round(x.speed)} ${esc(u)}</span></li>`).join('')}
      </ol>
      <div class="mt-actions">
        <button type="button" class="tg-btn tg-btn-primary" data-act="again"><i class="fa-solid fa-rotate-right"></i><span>${esc(this.t('rc.again'))}</span><kbd>enter</kbd></button>
        <button type="button" class="tg-btn tg-btn-ghost" data-act="result"><i class="fa-solid fa-chart-line"></i><span>${esc(this.t('rc.details'))}</span></button>
      </div>`);
  }

  showResult() {
    if (this.result) this.onResult(this.result);
  }
}
