// Trailer harness for Deadly Balloons 3, evaluated in the game page after boot.
// Drives the game with a bot, moves an in-engine camera, and logs every sound
// effect so each shot can get its own synced effects track.
(() => {
  const d3 = window.db3;
  const W = d3.world;
  const R = d3.renderer;
  const VW = innerWidth;
  const VH = innerHeight;
  const FPS = 60;

  const css = document.createElement('style');
  css.textContent = '#hud,#overlay,#touch,#perf,#insets,#boot{display:none!important}';
  document.head.appendChild(css);

  // Silence live audio (we render effects offline) and make the ship unkillable.
  W.sfx.unlock = () => {};
  W.sfx.music.play = () => {};
  W.hurtPlayer = function () {};
  d3.tuning.render.bloom = true;

  // ---- Sound log ----------------------------------------------------------
  let clock = -1e9;
  let log = [];
  const realPlay = W.sfx.play.bind(W.sfx);
  W.sfx.play = (id, rate = 1, gain = 1, pan = 0) => {
    if (clock >= 0) log.push([clock, id, rate, gain, pan]);
  };

  // ---- Bot ----------------------------------------------------------------
  const bot = { on: true, yHome: 820, tx: null, ty: null, mx: 0, my: 0, dash: false, push: false, bomb: false, focus: false, agility: 1, lockX: null };
  d3.input.fill = (out) => {
    out.dragX = out.dragY = 0;
    out.fire = true;
    out.focus = bot.focus;
    out.dash = bot.dash;
    out.push = bot.push;
    out.bomb = bot.bomb;
    bot.dash = bot.push = bot.bomb = false;
    if (!bot.on) {
      out.moveX = out.moveY = 0;
      return out;
    }
    const p = W.player;
    let tx = 500;
    let best = -1e9;
    const boss = W.boss && W.boss.hp > 0 ? W.boss : null;
    if (boss) tx = boss.x + Math.sin(W.time * 1.7) * 40;
    else {
      for (const e of W.enemies.list) {
        if (e.hp <= 0 || e.y > p.y - 60 || e.y < 0) continue;
        const s = -Math.abs(e.x - p.x) * 0.7 + e.y * 0.35 + e.r * 2;
        if (s > best) {
          best = s;
          tx = e.x;
        }
      }
    }
    if (bot.tx != null) tx = bot.tx;
    const ty = bot.ty != null ? bot.ty : bot.yHome;
    let mx = (tx - p.x) / 90;
    let my = (ty - p.y) / 120;
    // Dodge: push away from bullets that will be near us shortly, and from balloons.
    const B = W.enemyBullets;
    let rx = 0;
    let ry = 0;
    for (let i = 0; i < B.n; i++) {
      for (const look of [0.06, 0.16]) {
        const bx = B.x[i] + B.vx[i] * look;
        const by = B.y[i] + B.vy[i] * look;
        const dx = p.x - bx;
        const dy = p.y - by;
        const d2 = dx * dx + dy * dy;
        if (d2 < 95 * 95) {
          const d = Math.sqrt(d2) + 1;
          const k = (95 - d) / 95;
          rx += (dx / d) * k * k * 5;
          ry += (dy / d) * k * k * 5;
        }
      }
    }
    for (const e of W.enemies.list) {
      if (e.hp <= 0) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) + 1;
      const r0 = e.r + 80;
      if (d < r0) {
        const k = (r0 - d) / r0;
        rx += (dx / d) * k * 3;
        ry += (dy / d) * k * 3;
      }
    }
    mx += rx * bot.agility;
    my += ry * bot.agility;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    bot.mx += (mx - bot.mx) * 0.22;
    bot.my += (my - bot.my) * 0.22;
    out.moveX = bot.lockX != null ? bot.lockX : bot.mx;
    out.moveY = bot.my;
    return out;
  };

  // ---- Camera ---------------------------------------------------------------
  // cx, cy: arena point at the centre of the frame; size: arena width in px.
  const cam = { cx: 500, cy: 500, size: 1080 };
  const S = { px: 500, py: 820, bx: 500, by: 300 };
  const applyCam = () => {
    R.layout.arena = { x: VW / 2 - (cam.cx * cam.size) / 1000, y: VH / 2 - (cam.cy * cam.size) / 1000, size: cam.size };
  };
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const easeOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3);
  const easeInOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const WIDE = { cx: 500, cy: 500, size: 1080 };
  const FILL = { cx: 500, cy: 500, size: 1920 };
  const clampCy = (cy, size) => {
    const half = (VH / 2) * (1000 / size);
    return Math.max(half - 40, Math.min(1040 - half, cy));
  };
  const clampCx = (cx, size) => {
    const half = (VW / 2) * (1000 / size);
    if (half >= 500) return 500;
    return Math.max(half - 20, Math.min(1020 - half, cx));
  };
  const follow = (size, oy = -80, ox = 0) => ({ cx: clampCx(S.px + ox, size), cy: clampCy(S.py + oy, size), size });
  const mix = (a, b, t) => ({ cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), size: 1 / lerp(1 / a.size, 1 / b.size, t) });

  // ---- Setup helpers -------------------------------------------------------------
  const L = (i) => d3.levels[i];
  const jump = (wave) => {
    const d = W.director;
    d.wave = wave;
    d.beginWave(d.host);
    d.timer = 0.01;
  };
  const campaign = (li, wave) => {
    d3.startRun('campaign', L(li));
    if (wave != null) jump(wave);
  };
  const boss = (li) => campaign(li, L(li).waves.length - 1);
  const endless = (wave, mut) => {
    d3.startRun('endless', null);
    jump(wave);
    if (mut) W.director.mutator = mut;
  };
  const sandbox = (n) => {
    d3.tuning.balloons.target = n;
    d3.startRun('sandbox', null);
  };
  const grant = (kind, n = 1) => {
    for (let i = 0; i < n; i++) W.collect({ kind, x: W.player.x, y: W.player.y });
  };
  const tick = () => {
    W.player.iframes = 0;
    window.__vt.advance(1000 / FPS);
    S.px += (W.player.x - S.px) * 0.12;
    S.py += (W.player.y - S.py) * 0.12;
    if (W.boss) {
      S.bx += (W.boss.x - S.bx) * 0.08;
      S.by += (W.boss.y - S.by) * 0.08;
    }
  };
  const warm = (sec) => {
    const n = Math.round(sec * FPS);
    for (let i = 0; i < n; i++) tick();
  };
  const warmUntil = (pred, maxSec = 20) => {
    for (let i = 0; i < maxSec * FPS && !pred(); i++) tick();
  };
  const bossReady = () => W.boss && W.boss.state >= 0 && !W.boss.entering;
  const resetBot = () => Object.assign(bot, { on: true, yHome: 820, tx: null, ty: null, dash: false, push: false, bomb: false, focus: false, agility: 1, lockX: null });
  const MUT = {
    eclipse: { id: 'eclipse', name: 'Eclipse', text: 'Lights out', count: 1, hp: 1, speed: 1.12, drops: 1.3, rank: 0, dark: true },
    horde: { id: 'horde', name: 'Horde', text: 'Twice as many, half as tough', count: 2, hp: 0.5, speed: 1, drops: 0.7, rank: 0, dark: false },
    titans: { id: 'titans', name: 'Titans', text: 'Fewer, bigger, meaner', count: 0.5, hp: 1.7, speed: 0.9, drops: 1.5, rank: 1, dark: false },
    berserk: { id: 'berserk', name: 'Berserk', text: 'Everything moves faster', count: 1, hp: 1, speed: 1.4, drops: 1, rank: 0, dark: false },
  };
  const atBoss = (size, oy = 40) => ({ cx: clampCx(S.bx, size), cy: clampCy(S.by + oy, size), size });

  // ---- Shots ------------------------------------------------------------------------
  // setup(): put the game in place (warm-up frames are not recorded).
  // cam(t): camera for time t. events: [t, fn] run at the start of frame t.
  const SHOTS = {
    reveal: {
      dur: 7,
      setup() {
        sandbox(150);
        W.run.power = 4;
        bot.yHome = 840;
        warm(6);
        grant('drones');
        grant('missiles');
        warm(0.6);
      },
      cam: (t) => mix(follow(3600, -30), { cx: 500, cy: 500, size: 1500 }, easeInOut((t - 0.5) / 4.6)),
    },
    laser: {
      dur: 5,
      setup() {
        sandbox(130);
        W.run.power = 2;
        bot.yHome = 860;
        warm(6);
      },
      events: [[0.0, () => (bot.tx = 260)], [0.3, () => grant('laser')], [0.35, () => grant('rage')], [1.2, () => (bot.tx = 760)], [2.7, () => (bot.tx = 330)], [4.0, () => (bot.tx = 640)]],
      cam: (t) => mix(follow(1650, -300), follow(1350, -280), ease(t / 5)),
    },
    blackhole: {
      dur: 5,
      setup() {
        sandbox(80);
        W.run.power = 2;
        bot.yHome = 860;
        warm(5);
      },
      events: [[0.4, () => grant('blackhole')], [2.4, () => grant('blackhole')]],
      cam: (t) => mix({ cx: 500, cy: 470, size: 1500 }, { cx: 500, cy: 480, size: 1250 }, ease(t / 5)),
    },
    lightning: {
      dur: 4,
      setup() {
        sandbox(130);
        W.run.power = 2;
        bot.yHome = 800;
        warm(6);
      },
      events: [0.2, 0.8, 1.4, 2.0, 2.6, 3.2].map((t) => [t, () => grant('lightning')]),
      cam: (t) => mix(follow(1800, -260), follow(1500, -250), ease(t / 4)),
    },
    arsenal: {
      dur: 5,
      setup() {
        endless(13, MUT.horde);
        W.run.power = 5;
        W.run.damage = 2;
        warm(4);
        grant('missiles', 3);
        grant('drones', 3);
        grant('rapid', 3);
        grant('turret');
      },
      cam: (t) => mix(follow(1700, -200), WIDE, easeInOut(t / 5)),
    },
    dash: {
      dur: 4.5,
      setup() {
        sandbox(70);
        W.run.power = 2;
        bot.yHome = 700;
        warm(4);
      },
      events: [
        [0.0, () => (bot.tx = 140)],
        [1.05, () => {
          bot.tx = 900;
          bot.lockX = 1;
          bot.agility = 0;
        }],
        [1.15, () => {
          bot.dash = true;
          W.fx.juice.slowMo(0.3, 1.1);
        }],
        [2.6, () => {
          bot.lockX = null;
          bot.agility = 1;
          bot.tx = null;
        }],
        [2.9, () => (bot.dash = true)],
      ],
      cam: (t) => follow(2300, -60),
    },
    bomb: {
      dur: 5.5,
      setup() {
        boss(2);
        W.run.damage = 0.15;
        warmUntil(bossReady);
        W.boss.hp = W.boss.maxHp * 0.3;
        bot.agility = 1.3;
        warmUntil(() => W.enemyBullets.n > 600, 16);
      },
      events: [[1.0, () => {
        bot.bomb = true;
      }]],
      cam: (t) => mix({ cx: 500, cy: 560, size: 1500 }, { cx: 500, cy: 520, size: 1200 }, easeOut((t - 0.9) / 1.6)),
    },
    graze: {
      dur: 5,
      setup() {
        boss(3);
        W.run.damage = 0.1;
        warmUntil(bossReady);
        W.boss.hp = W.boss.maxHp * 0.55;
        bot.focus = true;
        bot.agility = 1.6;
        warmUntil(() => W.enemyBullets.n > 250, 12);
      },
      cam: (t) => follow(2000, -120),
    },
    boss_gumball: {
      dur: 8,
      setup() {
        boss(0);
        W.run.damage = 0.25;
        W.run.power = 3;
        warmUntil(bossReady);
        warm(1.5);
      },
      cam: (t) => mix(atBoss(2300, 60), WIDE, easeInOut((t - 1.2) / 2.6)),
    },
    boss_rexyrex: {
      dur: 8,
      setup() {
        boss(1);
        W.run.damage = 0.4;
        W.run.power = 3;
        warmUntil(bossReady);
        warm(2);
      },
      cam: (t) => mix(atBoss(2300, 60), WIDE, easeInOut((t - 1.2) / 2.6)),
    },
    boss_queen: {
      dur: 8,
      setup() {
        boss(2);
        W.run.damage = 0.2;
        W.run.power = 3;
        warmUntil(bossReady);
        W.boss.hp = W.boss.maxHp * 0.6;
        warm(2);
      },
      cam: (t) => mix(atBoss(2300, 60), WIDE, easeInOut((t - 1.2) / 2.6)),
    },
    boss_overlord: {
      dur: 8,
      setup() {
        boss(3);
        W.run.damage = 0.15;
        W.run.power = 3;
        warmUntil(bossReady);
        W.boss.hp = W.boss.maxHp * 0.3;
        warm(2.5);
      },
      cam: (t) => mix(atBoss(2300, 60), WIDE, easeInOut((t - 1.2) / 2.6)),
    },
    bossdown: {
      dur: 6,
      setup() {
        boss(3);
        W.run.power = 5;
        W.run.damage = 0.2;
        warmUntil(bossReady);
        W.boss.hp = W.boss.maxHp * 0.2;
        warm(1);
        grant('laser');
        grant('rage');
        W.run.damage = 0.02;
      },
      events: [[1.1, () => (W.boss.hp = 1)]],
      cam: (t) => mix(atBoss(1700, 120), { cx: 500, cy: 470, size: 1300 }, easeOut((t - 2.2) / 3)),
    },
    eclipse: {
      dur: 4,
      setup() {
        endless(16, MUT.eclipse);
        W.run.power = 3;
        warm(5);
      },
      cam: (t) => mix(follow(1500, -220), follow(1300, -200), ease(t / 4)),
    },
    titans: {
      dur: 4,
      setup() {
        endless(17, MUT.titans);
        W.run.power = 4;
        warm(5);
      },
      cam: (t) => mix(follow(1400, -240), follow(1250, -220), ease(t / 4)),
    },
    endless: {
      dur: 5,
      setup() {
        endless(19, MUT.horde);
        W.run.power = 4;
        W.run.damage = 0.35;
        warm(7);
        grant('missiles');
      },
      cam: (t) => mix(follow(1600, -260), follow(1350, -240), ease(t / 5)),
    },
    swarm: {
      dur: 5,
      setup() {
        campaign(2, 10);
        W.run.power = 4;
        warm(6);
        grant('rapid', 2);
      },
      cam: (t) => mix(WIDE, { cx: 500, cy: 480, size: 1300 }, easeInOut(t / 5)),
    },
    attract: {
      dur: 12,
      setup() {
        d3.toMenu();
        W.reset('attract');
        warm(3);
      },
      cam: (t) => ({ cx: 500, cy: lerp(560, 440, t / 12), size: 1920 }),
    },
  };

  let shot = null;
  let evIdx = 0;
  window.__rec = {
    shots: Object.keys(SHOTS),
    begin(name) {
      shot = SHOTS[name];
      if (!shot) throw new Error('no shot ' + name);
      window.__vt.setAuto(false);
      resetBot();
      d3.tuning.balloons.target = 30;
      Object.assign(cam, WIDE);
      applyCam();
      clock = -1e9;
      shot.setup();
      S.px = W.player.x;
      S.py = W.player.y;
      if (W.boss) {
        S.bx = W.boss.x;
        S.by = W.boss.y;
      }
      log = [];
      evIdx = 0;
      return Math.round(shot.dur * FPS);
    },
    frame(i) {
      const t = i / FPS;
      const evs = shot.events || [];
      while (evIdx < evs.length && evs[evIdx][0] <= t + 1e-6) evs[evIdx++][1]();
      Object.assign(cam, shot.cam(t));
      applyCam();
      clock = t;
      tick();
      return 0;
    },
    stats() {
      return { enemies: W.enemies.count, bullets: W.enemyBullets.n, boss: W.boss ? [W.boss.kind, Math.round(W.boss.hp), W.boss.state] : null, sfx: log.length, player: [Math.round(W.player.x), Math.round(W.player.y)] };
    },
    // Mixes the logged effects offline with the game's own synthesised sounds.
    async sfxWav(dur) {
      clock = -1e9;
      const sr = 48000;
      const ctx = new OfflineAudioContext(2, Math.ceil(sr * (dur + 1.5)), sr);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      comp.connect(ctx.destination);
      const bus = ctx.createGain();
      bus.gain.value = 0.8;
      bus.connect(comp);
      const bufs = W.sfx.buffers;
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const active = new Map();
      const all = [];
      for (const [t, id, rate, gain, pan] of log) {
        const list = bufs.get(id);
        if (!list || !list.length) continue;
        const ends = (active.get(id) || []).filter((e) => e > t);
        const live = all.filter((e) => e > t);
        all.length = 0;
        all.push(...live);
        if (ends.length >= 6 || all.length >= 32) {
          active.set(id, ends);
          continue;
        }
        const buf = list[Math.floor(rnd() * list.length)];
        const r = rate * (1 + (rnd() - 0.5) * 0.08);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = r;
        const g = ctx.createGain();
        g.gain.value = gain;
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        src.connect(g);
        g.connect(p);
        p.connect(bus);
        src.start(t);
        const end = t + buf.duration / r;
        ends.push(end);
        all.push(end);
        active.set(id, ends);
      }
      const out = await ctx.startRendering();
      const n = out.length;
      const L0 = out.getChannelData(0);
      const R0 = out.getChannelData(1);
      const bytes = new Uint8Array(44 + n * 4);
      const dv = new DataView(bytes.buffer);
      const str = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF');
      dv.setUint32(4, 36 + n * 4, true);
      str(8, 'WAVE');
      str(12, 'fmt ');
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true);
      dv.setUint16(22, 2, true);
      dv.setUint32(24, sr, true);
      dv.setUint32(28, sr * 4, true);
      dv.setUint16(32, 4, true);
      dv.setUint16(34, 16, true);
      str(36, 'data');
      dv.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L0[i])) * 32767, true);
        dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R0[i])) * 32767, true);
      }
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
  };
  return window.__rec.shots;
})();
