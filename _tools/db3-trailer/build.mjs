#!/usr/bin/env node
// Generates video/index.html, the HyperFrames composition for the Deadly
// Balloons 3 trailer, from the edit list (edl.mjs). All motion is on one
// paused GSAP timeline; every random number comes from a seeded generator.
import { writeFileSync } from 'node:fs';
import { CUTS, HITS, END, DROP, BEAT } from './edl.mjs';

let seed = 20261122;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + (b - a) * rnd();
const f = (x) => Math.round(x * 1000) / 1000;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const C = {
  bg: '#07060d', ink: '#f4f1ff', dim: '#9a93c6', mint: '#5cffc8', cyan: '#7fd8ff', amber: '#ffb347',
  pink: '#ff5fd2', red: '#ff4d6d', gold: '#ffd23f', violet: '#a66bff', lime: '#9be34b', orange: '#ff8c42',
};
const html = [];
const js = [];
const T = (s) => js.push(s);
let uid = 0;
const id = (p) => `${p}${uid++}`;
// A timed scene: visible only inside [start, start + dur).
const scene = (start, dur, inner, cls = '', style = '') => {
  const i = id('s');
  html.push(`<div id="${i}" class="clip scene ${cls}" data-start="${f(start)}" data-duration="${f(dur)}" style="${style}">${inner}</div>`);
  return i;
};
// Splits a word into letter spans for staggered entrances.
const letters = (text, cls = 'ch') => [...text].map((c) => (c === ' ' ? '<span class="sp"> </span>' : `<span class="${cls}">${esc(c)}</span>`)).join('');

// ---------------------------------------------------------------- videos
const vids = [];
CUTS.forEach((c, k) => {
  const i = `v${k}`;
  const cls = ['clip', 'vid'];
  if (c.backdrop) cls.push('backdrop', typeof c.backdrop === 'string' ? `bd-${c.backdrop}` : '');
  html.push(`<video id="${i}" class="${cls.join(' ').trim()}" src="assets/clips/${c.clip}.mp4" data-start="${c.start}" data-duration="${c.dur}" data-media-start="${c.media}" muted playsinline></video>`);
  vids.push({ ...c, id: i });
  if (!c.backdrop && !c.flash) T(`tl.fromTo('#${i}', { scale: 1.075 }, { scale: 1, duration: 0.42, ease: 'power3.out' }, ${c.start});`);
  if (c.flash) T(`tl.fromTo('#${i}', { scale: 1.18 }, { scale: 1.05, duration: 0.12, ease: 'none' }, ${c.start});`);
});
const vidAt = (t) => vids.filter((v) => !v.flash && t >= v.start - 1e-6 && t < v.start + v.dur - 1e-6).map((v) => `#${v.id}`);
const shake = (targets, t, amp = 18, dur = 0.45) => {
  if (!targets.length) return;
  const n = Math.round(dur / 0.033);
  const kf = [];
  for (let i = 0; i < n; i++) {
    const k = 1 - i / n;
    kf.push(`{ x: ${f(rr(-1, 1) * amp * k)}, y: ${f(rr(-1, 1) * amp * k)}, duration: 0.033 }`);
  }
  kf.push('{ x: 0, y: 0, duration: 0.033 }');
  T(`tl.to(${JSON.stringify(targets.join(','))}, { keyframes: [${kf.join(',')}], ease: 'none' }, ${f(t)});`);
};
html.push(`<audio id="score" src="assets/trailer-audio.wav" data-start="0" data-duration="${END}" data-volume="1"></audio>`);

// ---------------------------------------------------------------- ACT I
// Dust drifting in the dark (a nod to the Deadly Balloons 2 trailer).
{
  let dots = '';
  const ds = [];
  for (let i = 0; i < 70; i++) {
    const s = rr(1.5, 4.5);
    dots += `<i class="dust" id="d${i}" style="left:${f(rr(0, 1920))}px;top:${f(rr(0, 1080))}px;width:${f(s)}px;height:${f(s)}px;opacity:${f(rr(0.15, 0.6))}"></i>`;
    ds.push(i);
  }
  scene(0, DROP, dots, 'dustfield');
  ds.forEach((i) => T(`tl.fromTo('#d${i}', { x: 0, y: 0 }, { x: ${f(rr(-60, 60))}, y: ${f(rr(-160, -40))}, duration: ${DROP}, ease: 'none' }, 0);`));
}

// 2013: the original, recreated as flat circles on blue.
{
  let w = '<div class="crt" id="crt13"><div class="oldworld">';
  const circles = [];
  for (let i = 0; i < 16; i++) {
    const r = rr(40, 120);
    w += `<i class="oc" id="oc${i}" style="width:${f(r * 2)}px;height:${f(r * 2)}px;left:${f(rr(-80, 1880))}px;top:${f(rr(-60, 760))}px"></i>`;
    circles.push(i);
  }
  for (let i = 0; i < 10; i++) w += `<i class="ob" id="ob${i}"></i>`;
  w += '<i class="oship" id="oship"></i></div><div class="scan"></div></div>';
  w += `<div class="year mono" id="y13"><b>2013</b> · Deadly Balloons</div>`;
  w += `<div class="act1 display" id="t13"><div class="l1">Popping balloons</div><div class="l2">used to be <span class="easy">easy.</span></div></div>`;
  scene(0.6, 3.5, w);
  T(`tl.fromTo('#crt13', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power1.out' }, 0.6);`);
  T(`tl.fromTo('#crt13 .oldworld', { scale: 1.0 }, { scale: 1.08, duration: 3.5, ease: 'none' }, 0.6);`);
  circles.forEach((i) => T(`tl.to('#oc${i}', { x: ${f(rr(-120, 120))}, y: ${f(rr(40, 200))}, duration: 3.5, ease: 'none' }, 0.6);`));
  T(`tl.fromTo('#oship', { x: -260 }, { x: 260, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0.6);`);
  for (let i = 0; i < 10; i++) {
    const t0 = 0.7 + i * 0.3;
    T(`tl.fromTo('#ob${i}', { x: ${f(Math.sin((t0 - 0.6) / 1.6 * Math.PI - Math.PI / 2) * 260)}, y: 0, opacity: 1 }, { y: -900, duration: 0.9, ease: 'none' }, ${f(t0)});`);
  }
  T(`tl.from('#y13', { opacity: 0, x: -30, duration: 0.4, ease: 'power2.out' }, 0.9);`);
  T(`tl.from('#t13 .l1', { opacity: 0, y: 40, duration: 0.45, ease: 'power3.out' }, 1.0);`);
  T(`tl.from('#t13 .l2', { opacity: 0, y: 40, duration: 0.45, ease: 'power3.out' }, 1.55);`);
  T(`tl.from('#t13 .easy', { scale: 1.4, duration: 0.5, ease: 'back.out(3)' }, 1.55);`);
  // Tape stop: the old set powers off like a CRT.
  T(`tl.to('#t13, #y13', { opacity: 0, duration: 0.2 }, 3.55);`);
  T(`tl.to('#crt13', { scaleY: 0.006, filter: 'brightness(3)', duration: 0.24, ease: 'power3.in' }, 3.6);`);
  T(`tl.to('#crt13', { scaleX: 0, duration: 0.14, ease: 'power2.in' }, 3.86);`);
}

// 2019: Deadly Balloons 2, from a frame of its trailer, breaking apart.
{
  let w = '<div class="crt" id="crt19"><div class="db2" id="db2"></div>';
  for (let i = 0; i < 9; i++) w += `<div class="db2slice" id="sl${i}" style="top:${i * 120}px;height:120px;background-position:center ${-i * 120}px"></div>`;
  w += '<div class="scan"></div><div class="tint"></div></div>';
  w += `<div class="year mono" id="y19"><b>2019</b> · Deadly Balloons 2</div>`;
  w += `<div class="act1 display" id="t19"><div class="l1">Then they</div><div class="l2 evolved">evolved.</div></div>`;
  scene(4.0, 4.0, w);
  T(`tl.fromTo('#crt19', { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1.0, duration: 0.35, ease: 'power3.out' }, 4.0);`);
  T(`tl.fromTo('#db2', { scale: 1.04 }, { scale: 1.16, duration: 4, ease: 'none' }, 4.0);`);
  T(`tl.from('#y19', { opacity: 0, x: -30, duration: 0.4, ease: 'power2.out' }, 4.15);`);
  T(`tl.from('#t19 .l1', { opacity: 0, y: 40, duration: 0.45, ease: 'power3.out' }, 4.3);`);
  T(`tl.from('#t19 .l2', { opacity: 0, scale: 1.5, filter: 'blur(14px)', duration: 0.5, ease: 'power3.out' }, 4.9);`);
  // Glitch out.
  for (let k = 0; k < 9; k++) {
    const t = 7.5 + k * 0.05;
    for (let i = 0; i < 9; i++) T(`tl.set('#sl${i}', { opacity: ${rnd() < 0.55 ? 1 : 0}, x: ${f(rr(-140, 140))} }, ${f(t)});`);
    T(`tl.set('#t19', { x: ${f(rr(-30, 30))}, skewX: ${f(rr(-12, 12))} }, ${f(t)});`);
  }
  T(`tl.set('#crt19 .tint', { opacity: 0.8 }, 7.5);`);
}

// 2026: now they want revenge.
{
  const w = `<div class="year mono hot" id="y26"><b>2026</b> · Deadly Balloons 3</div>
    <div class="act1 display center" id="t26"><div class="l1">Now they want</div><div class="rev" id="rev"><span class="rv r">REVENGE.</span><span class="rv c">REVENGE.</span><span class="rv main">REVENGE.</span></div></div>`;
  scene(8.0, 1.6, w);
  T(`tl.from('#y26', { opacity: 0, duration: 0.2 }, 8.0);`);
  T(`tl.from('#t26 .l1', { opacity: 0, y: 30, duration: 0.3, ease: 'power3.out' }, 8.0);`);
  T(`tl.fromTo('#rev', { scale: 2.4, opacity: 0, filter: 'blur(24px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.22, ease: 'power4.out' }, 8.12);`);
  T(`tl.fromTo('#rev .r', { x: -14 }, { x: -4, duration: 1.4, ease: 'none' }, 8.12);`);
  T(`tl.fromTo('#rev .c', { x: 14 }, { x: 4, duration: 1.4, ease: 'none' }, 8.12);`);
  T(`tl.to('#rev', { scale: 1.08, duration: 1.4, ease: 'none' }, 8.34);`);
  const ids = ['#rev'];
  for (let k = 0; k < 14; k++) T(`tl.set('#rev', { x: ${f(rr(-6, 6))}, y: ${f(rr(-6, 6))} }, ${f(8.34 + k * 0.09)});`);
}

// ---------------------------------------------------------------- overlays used throughout
html.push(`<div id="lbTop" class="lb top"></div><div id="lbBot" class="lb bot"></div>`);
html.push(`<div id="flash"></div><div id="ring" class="ring"></div><div id="vignette"></div><div id="grain"></div>`);
T(`tl.set('#lbTop, #lbBot', { scaleY: 1 }, 0);`);
T(`tl.set('#flash, #ring', { opacity: 0 }, 0);`);
// Flash on every subliminal cut.
CUTS.filter((c) => c.flash).forEach((c) => T(`tl.fromTo('#flash', { opacity: 0.55 }, { opacity: 0, duration: 0.09, ease: 'none' }, ${c.start});`));
// White-out into silence, then the drop.
T(`tl.fromTo('#flash', { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.in' }, 11.25);`);
T(`tl.set('#flash', { opacity: 0 }, 11.6);`);
T(`tl.fromTo('#flash', { opacity: 0.95 }, { opacity: 0, duration: 0.5, ease: 'power2.out' }, ${DROP});`);
T(`tl.to('#lbTop, #lbBot', { scaleY: 0, duration: 0.28, ease: 'power3.out' }, ${DROP});`);
const ring = (t, color = '#fff', size = 1) => T(`tl.fromTo('#ring', { scale: 0.05, opacity: 1, borderColor: '${color}' }, { scale: ${f(7 * size)}, opacity: 0, duration: 0.7, ease: 'power2.out' }, ${f(t)});`);
ring(DROP);
shake(vidAt(DROP + 0.01), DROP, 26, 0.5);

// ---------------------------------------------------------------- ACT II
// "POP EVERYTHING." / "DON'T GET POPPED."
const slam = (start, dur, lines, align, grad) => {
  const inner = `<div class="scrim ${align}"></div><div class="slam display ${align}">${lines.map((l, i) => `<div class="sl sl${i} ${grad}">${letters(l)}</div>`).join('')}</div>`;
  const s = scene(start, dur, inner);
  lines.forEach((_, i) => T(`tl.from('#${s} .sl${i} .ch', { y: 140, opacity: 0, rotation: (i) => RND[i % RND.length] * 14, scale: 1.4, duration: 0.32, ease: 'back.out(2.2)', stagger: 0.025 }, ${f(start + i * 0.18)});`));
  T(`tl.to('#${s} .slam', { x: ${align === 'left' ? -160 : 160}, opacity: 0, duration: 0.18, ease: 'power2.in' }, ${f(start + dur - 0.2)});`);
  T(`tl.fromTo('#${s} .scrim', { opacity: 0 }, { opacity: 1, duration: 0.2 }, ${f(start)});`);
  return s;
};
slam(13.6, 1.6, ['POP', 'EVERYTHING.'], 'left', 'grad');
slam(15.2, 1.6, ["DON'T GET", 'POPPED.'], 'right', 'gradhot');
shake(vidAt(13.61), 13.6, 10, 0.3);
shake(vidAt(15.21), 15.2, 12, 0.3);

// Move chips (key + name + what it does), lower left.
const chip = (start, dur, { key, icon, color, name, line }) => {
  const badge = key ? `<span class="kbd">${esc(key)}</span>` : `<span class="cap" style="--c:${color}"><img src="assets/icon-${icon}.png" alt=""></span>`;
  const inner = `<div class="lowscrim"></div><div class="mchip" style="--c:${color}">${badge}<div><div class="mname display">${esc(name)}</div><div class="mline mono">${esc(line)}</div></div></div>`;
  const s = scene(start, dur, inner);
  T(`tl.from('#${s} .mchip', { x: -90, opacity: 0, duration: 0.25, ease: 'power3.out' }, ${f(start + 0.02)});`);
  T(`tl.from('#${s} .mname', { scaleX: 1.25, transformOrigin: '0% 50%', duration: 0.35, ease: 'power3.out' }, ${f(start + 0.02)});`);
  T(`tl.to('#${s} .mchip', { x: -60, opacity: 0, duration: 0.15, ease: 'power2.in' }, ${f(start + dur - 0.16)});`);
  return s;
};
chip(16.8, 1.6, { key: 'SPACE', color: C.mint, name: 'DASH', line: 'invulnerable · slices balloons' });
chip(18.4, 1.6, { key: 'E', color: C.amber, name: 'BOMB', line: 'wipes every bullet off the screen' });
shake(vidAt(18.81), 18.8, 22, 0.5);
T(`tl.fromTo('#flash', { opacity: 0.6 }, { opacity: 0, duration: 0.35 }, 18.8);`);

// Big-number cards.
const numberCard = (start, dur, num, word1, word2, sub, extra = '', cls = '') => {
  const inner = `<div class="cardbg"></div><div class="numcard ${cls}"><div class="num display grad">${num}</div><div class="words"><div class="w1 display">${esc(word1)}</div><div class="w2 display">${esc(word2)}</div><div class="wsub mono">${esc(sub)}</div></div></div>${extra}`;
  const s = scene(start, dur, inner);
  T(`tl.fromTo('#${s} .num', { scale: 2.2, opacity: 0, filter: 'blur(20px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.2, ease: 'power4.out' }, ${f(start)});`);
  T(`tl.from('#${s} .w1', { x: 80, opacity: 0, duration: 0.25, ease: 'power3.out' }, ${f(start + 0.06)});`);
  T(`tl.from('#${s} .w2', { x: 80, opacity: 0, duration: 0.25, ease: 'power3.out' }, ${f(start + 0.12)});`);
  T(`tl.from('#${s} .wsub', { opacity: 0, duration: 0.3 }, ${f(start + 0.25)});`);
  T(`tl.to('#${s} .numcard', { scale: 1.04, duration: ${f(dur)}, ease: 'none' }, ${f(start)});`);
  T(`tl.to('#${s} .numcard, #${s} .extra', { opacity: 0, y: -30, duration: 0.14, ease: 'power2.in' }, ${f(start + dur - 0.15)});`);
  return s;
};
{
  const faces = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const extra = `<div class="extra brow">${faces.map((i) => `<img class="bface" src="assets/balloon-${i}.png" alt="">`).join('')}</div>`;
  const s = numberCard(HITS.card17, 1.6, '17', 'Balloon', 'types', 'chasers · tanks · ghosts · splitters · gunners · mothers', extra);
  T(`tl.from('#${s} .bface', { y: 320, opacity: 0, rotation: (i) => RND[(i + 7) % RND.length] * 25, duration: 0.4, ease: 'back.out(1.8)', stagger: 0.05 }, ${f(HITS.card17 + 0.1)});`);
  T(`tl.to('#${s} .bface', { y: -16, duration: 0.2, ease: 'power1.out', yoyo: true, repeat: 1, stagger: 0.03 }, ${f(HITS.card17 + 0.8)});`);
  shake(vidAt(HITS.card17 + 0.01), HITS.card17, 14, 0.35);
}
const PU = [
  ['rapid', '#ffd23f'], ['spread', '#48e8ff'], ['missiles', '#ff8c42'], ['turret', '#9be34b'], ['drones', '#5cffc8'], ['lightning', '#b9a8ff'], ['blackhole', '#a66bff'],
  ['freeze', '#7fd8ff'], ['shield', '#4da3ff'], ['laser', '#ff5fd2'], ['rage', '#ff4d6d'], ['heart', '#ff6b8b'], ['bomb', '#ffb347'],
];
{
  const extra = `<div class="extra prow">${PU.map(([k, c]) => `<span class="cap big" style="--c:${c}"><img src="assets/icon-${k}.png" alt=""></span>`).join('')}</div>`;
  const s = numberCard(HITS.card13, 0.8, '13', 'Power', 'ups', 'every one of them levels up', extra);
  T(`tl.from('#${s} .cap', { scale: 0, opacity: 0, duration: 0.22, ease: 'back.out(3)', stagger: 0.035 }, ${f(HITS.card13 + 0.05)});`);
}
chip(22.4, 0.8, { icon: 'laser', color: '#ff5fd2', name: 'MEGA LASER', line: 'melts everything in its path' });
chip(23.2, 0.8, { icon: 'blackhole', color: '#a66bff', name: 'BLACK HOLE', line: 'drags them in and crushes them' });
chip(24.0, 0.8, { icon: 'lightning', color: '#b9a8ff', name: 'CHAIN LIGHTNING', line: 'leaps from balloon to balloon' });
chip(24.8, 1.6, { icon: 'missiles', color: '#ff8c42', name: 'STACK THEM', line: 'missiles · drones · turret · five-way spread' });
{
  const cards = [[16, 392], [424, 392], [832, 392]];
  const extra = `<div class="extra drafts">${cards.map(([x, w], i) => `<div class="dcard" id="dc${i}" style="width:${w}px;background-position:${-x}px 0"></div>`).join('')}</div>`;
  const s = numberCard(HITS.card25, 1.6, '25', 'Upgrade', 'cards', 'draft one every few waves', extra, 'compact');
  cards.forEach((_, i) => T(`tl.fromTo('#dc${i}', { rotationY: -100, opacity: 0, y: 40 }, { rotationY: 0, opacity: 1, y: 0, duration: 0.3, ease: 'back.out(1.6)' }, ${f(HITS.card25 + 0.1 + i * BEAT)});`));
  T(`tl.to('#dc1', { scale: 1.06, duration: 0.2, yoyo: true, repeat: 1 }, ${f(HITS.card25 + 1.25)});`);
}
// Endless: mutators flash on the beat.
{
  const muts = [['BERSERK', C.red], ['HORDE', C.orange], ['TITANS', C.gold], ['ECLIPSE', C.violet]];
  const inner = `<div class="topscrim"></div><div class="endless"><div class="etitle display gradcool">ENDLESS</div><div class="esub mono">mutators · elites · a boss rush every 10 waves</div></div>
    ${muts.map(([m, c], i) => `<div class="mut display" id="mu${i}" style="--c:${c}">${m}</div>`).join('')}`;
  const s = scene(HITS.endless, 1.6, inner);
  T(`tl.from('#${s} .etitle', { x: -120, opacity: 0, duration: 0.25, ease: 'power3.out' }, ${HITS.endless});`);
  T(`tl.from('#${s} .esub', { opacity: 0, duration: 0.3 }, ${f(HITS.endless + 0.15)});`);
  muts.forEach((_, i) => {
    const t = HITS.endless + i * BEAT;
    T(`tl.fromTo('#mu${i}', { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.12, ease: 'power3.out' }, ${f(t)});`);
    T(`tl.to('#mu${i}', { opacity: 0, duration: 0.08 }, ${f(t + BEAT - 0.06)});`);
  });
  shake(vidAt(HITS.endless + 0.01), HITS.endless, 14, 0.3);
}
// Four campaigns, then four bosses.
{
  const camps = [['CANDY CLOUDS', C.pink], ['BALLOON UPRISING', C.red], ['THE SWARM', C.gold], ['GALACTIC GAUNTLET', C.violet]];
  const inner = `<div class="cardbg"></div><div class="camps"><div class="ctitle display"><span class="cnum grad">4</span> <span id="cword">CAMPAIGNS</span><span id="bword" class="hotword">BOSSES</span></div>
    ${camps.map(([n, c], i) => `<div class="cname mono" id="cn${i}" style="--c:${c}">${n}</div>`).join('')}</div>`;
  const s = scene(HITS.campaigns, 1.6, inner);
  T(`tl.fromTo('#${s} .ctitle', { scale: 1.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: 'power4.out' }, ${HITS.campaigns});`);
  camps.forEach((_, i) => {
    const t = HITS.campaigns + i * BEAT * 0.75;
    T(`tl.fromTo('#cn${i}', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.12, ease: 'power3.out' }, ${f(t)});`);
  });
  const tb = HITS.campaigns + BEAT * 3;
  T(`tl.set('#cword', { display: 'none' }, ${f(tb)});`);
  T(`tl.set('#bword', { display: 'inline' }, ${f(tb)});`);
  T(`tl.fromTo('#bword', { scale: 1.6 }, { scale: 1, duration: 0.15, ease: 'power3.out' }, ${f(tb)});`);
  T(`tl.to('#${s} .cname', { opacity: 0.25, duration: 0.1 }, ${f(tb)});`);
  for (let k = 0; k < 8; k++) T(`tl.set('#${s} .ctitle', { x: ${f(rr(-8, 8))}, y: ${f(rr(-6, 6))} }, ${f(tb + k * 0.05)});`);
}

// ---------------------------------------------------------------- ACT III: bosses
const BOSSES = [
  { name: 'KING GUMBALL', camp: 'Candy Clouds', line: 'Rings, spirals and royal guards.', color: C.pink, sprite: 'kingGumball' },
  { name: 'REXYREX', camp: 'Balloon Uprising', line: 'Hides behind shield pods. Then he blinks above you and slams.', color: C.lime, sprite: 'rexyrex' },
  { name: 'SWARM QUEEN', camp: 'The Swarm', line: 'Needle storms and a bullet curtain with one safe lane.', color: C.amber, sprite: 'queen' },
  { name: 'GALACTIC OVERLORD', camp: 'Galactic Gauntlet', line: 'Flower bursts, gravity wells and sweeping lasers.', color: C.violet, sprite: 'overlord' },
];
BOSSES.forEach((b, i) => {
  const t = HITS.bosses[i];
  const inner = `<div class="band" style="--c:${b.color}"></div>
    <div class="bosscard" style="--c:${b.color}">
      <img class="bport" src="assets/boss-${b.sprite}.png" alt="">
      <div class="btext">
        <div class="bwarn mono">⚠ Warning <span>· boss 0${i + 1} / 04 · ${esc(b.camp)}</span></div>
        <div class="bname display" style="font-size:${b.name.length > 12 ? 122 : 150}px">${letters(b.name)}</div>
        <div class="bline mono">${esc(b.line)}</div>
      </div>
    </div>`;
  const s = scene(t, 2.0, inner);
  T(`tl.fromTo('#${s} .band', { scaleX: 0 }, { scaleX: 1, duration: 0.22, ease: 'power3.out' }, ${f(t)});`);
  T(`tl.from('#${s} .bport', { x: -260, opacity: 0, rotation: -12, duration: 0.35, ease: 'back.out(1.6)' }, ${f(t + 0.04)});`);
  T(`tl.from('#${s} .bname .ch', { y: 90, opacity: 0, scale: 1.5, duration: 0.28, ease: 'back.out(2)', stagger: 0.02 }, ${f(t + 0.06)});`);
  T(`tl.from('#${s} .bline', { opacity: 0, y: 14, duration: 0.3 }, ${f(t + 0.4)});`);
  T(`tl.from('#${s} .bwarn', { opacity: 0, duration: 0.1 }, ${f(t)});`);
  for (let k = 0; k < 3; k++) T(`tl.set('#${s} .bwarn', { opacity: 0.2 }, ${f(t + 0.25 + k * 0.24)}); tl.set('#${s} .bwarn', { opacity: 1 }, ${f(t + 0.37 + k * 0.24)});`);
  T(`tl.to('#${s} .bosscard, #${s} .band', { x: 220, opacity: 0, duration: 0.2, ease: 'power2.in' }, ${f(t + 1.78)});`);
  shake(vidAt(t + 0.01), t, 24, 0.55);
  T(`tl.fromTo('#flash', { opacity: 0.5 }, { opacity: 0, duration: 0.3 }, ${f(t)});`);
});

// ---------------------------------------------------------------- ACT IV
CUTS.filter((c) => c.start >= 44 && c.start < 45.6).forEach((c) => T(`tl.fromTo('#flash', { opacity: 0.45 }, { opacity: 0, duration: 0.07, ease: 'none' }, ${c.start});`));
// Breakdown: you don't aim, you dodge.
{
  let bullets = '';
  for (let i = 0; i < 6; i++) bullets += `<i class="pb" id="pb${i}"></i>`;
  const inner = `<div class="black"></div><div class="aim display" id="aim1">YOU DON'T AIM.</div><div class="aim display mint" id="aim2">YOU DODGE.</div>
    <div class="shipwrap" id="shipw"><img class="ship" src="assets/ship.png" alt="">${bullets}</div>`;
  scene(HITS.breakdown, 1.6, inner);
  T(`tl.to('#lbTop, #lbBot', { scaleY: 1, duration: 0.2, ease: 'power3.out' }, ${HITS.breakdown});`);
  T(`tl.fromTo('#aim1', { opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1, duration: 0.18, ease: 'power3.out' }, ${HITS.breakdown});`);
  T(`tl.set('#aim1', { opacity: 0 }, ${f(HITS.breakdown + 0.8)});`);
  T(`tl.fromTo('#aim2', { opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1, duration: 0.18, ease: 'power3.out' }, ${f(HITS.breakdown + 0.8)});`);
  T(`tl.fromTo('#shipw', { x: 0 }, { keyframes: [{ x: -220, duration: 0.5, ease: 'sine.inOut' }, { x: 180, duration: 0.6, ease: 'sine.inOut' }, { x: 0, duration: 0.5, ease: 'sine.inOut' }] }, ${HITS.breakdown});`);
  for (let k = 0; k < 16; k++) {
    const i = k % 6;
    T(`tl.fromTo('#pb${i}', { y: 0, opacity: 1 }, { y: -700, opacity: 0.2, duration: 0.5, ease: 'none' }, ${f(HITS.breakdown + k * 0.1)});`);
  }
  T(`tl.to('#lbTop, #lbBot', { scaleY: 0, duration: 0.25, ease: 'power3.out' }, 47.2);`);
}
// The kill: white-out on the pop.
T(`tl.fromTo('#flash', { opacity: 1 }, { opacity: 0, duration: 0.75, ease: 'power2.out' }, ${HITS.kill});`);
ring(HITS.kill, '#fff', 1.3);
shake(vidAt(HITS.kill + 0.01), HITS.kill, 30, 0.7);

// Title.
const logo = (cls = '') => `<div class="logo ${cls}"><span class="lw">DEADLY</span><span class="lw">BALLOONS</span><em>3</em></div>`;
{
  let burst = '';
  const parts = [];
  for (let i = 0; i < 26; i++) {
    const src = i % 3 === 0 ? `plain-${i % 8}` : `balloon-${i % 10}`;
    burst += `<img class="bb" id="bb${i}" src="assets/${src}.png" alt="">`;
    const a = (i / 26) * Math.PI * 2 + rr(-0.2, 0.2);
    const d = rr(560, 1100);
    parts.push([i, Math.cos(a) * d, Math.sin(a) * d * 0.62, rr(-90, 90), rr(0.45, 0.9)]);
  }
  const inner = `<div class="titlebg"></div><div class="burst">${burst}</div>
    <div class="presents mono">rexyrex presents</div>${logo('big')}
    <div class="tagline mono">Pop everything. Don't get popped.</div>`;
  const s = scene(HITS.title, 3.2, inner);
  T(`tl.fromTo('#${s} .logo', { scale: 2.8, opacity: 0, filter: 'blur(22px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.2, ease: 'power4.out' }, ${HITS.title});`);
  T(`tl.to('#${s} .logo', { scale: 1.07, duration: 3, ease: 'none' }, ${f(HITS.title + 0.2)});`);
  T(`tl.from('#${s} .logo em', { scale: 0, rotation: -40, duration: 0.4, ease: 'back.out(3)' }, ${f(HITS.title + 0.18)});`);
  T(`tl.from('#${s} .presents', { opacity: 0, y: -20, duration: 0.4 }, ${f(HITS.title + 0.3)});`);
  T(`tl.from('#${s} .tagline', { opacity: 0, y: 24, scaleX: 1.25, duration: 0.6, ease: 'power3.out' }, ${f(HITS.title + 0.8)});`);
  parts.forEach(([i, x, y, rot, sc]) => T(`tl.fromTo('#bb${i}', { x: 0, y: 0, scale: 0.1, rotation: 0, opacity: 1 }, { x: ${f(x)}, y: ${f(y)}, scale: ${f(sc)}, rotation: ${f(rot)}, duration: 1.8, ease: 'expo.out' }, ${HITS.title}); tl.to('#bb${i}', { opacity: 0, duration: 0.8 }, ${f(HITS.title + 1.6 + rnd() * 0.6)});`));
  for (let k = 0; k < 8; k++) T(`tl.fromTo('#${s} .logo em', { filter: 'drop-shadow(0 0 36px rgba(92,255,200,1))' }, { filter: 'drop-shadow(0 0 12px rgba(92,255,200,0.5))', duration: ${BEAT}, ease: 'power1.out' }, ${f(HITS.title + k * BEAT)});`);
  shake([`#${s} .logo`], HITS.title + 0.18, 16, 0.4);
  ring(HITS.title, C.mint, 1.2);
  T(`tl.fromTo('#flash', { opacity: 0.85 }, { opacity: 0, duration: 0.45 }, ${HITS.title});`);
}

// End card.
{
  const inner = `<div class="endbg"></div><div class="endcard">
      ${logo('small')}
      <div class="play display"><span class="grad">Play free</span><br><span class="iyb">in your browser</span></div>
      <div class="pills mono"><span>PC</span><span>Phone</span><span>Gamepad</span><span>Plays offline</span></div>
      <div class="url mono"><span>rexyrex.github.io/deadlyBalloons</span></div>
      <div class="by mono"><img src="assets/rex.png" alt="">by rexyrex</div>
    </div>
    <img class="lastb" id="lastb" src="assets/balloon-2.png" alt="">
    ${Array.from({ length: 10 }, (_, i) => `<i class="shard" id="sh${i}"></i>`).join('')}<b class="plus" id="plus">+100</b>`;
  const s = scene(HITS.endcard, END - HITS.endcard, inner);
  const t = HITS.endcard;
  T(`tl.from('#${s} .logo', { opacity: 0, scale: 0.8, duration: 0.4, ease: 'power3.out' }, ${t});`);
  T(`tl.from('#${s} .play', { opacity: 0, y: 40, duration: 0.45, ease: 'power3.out' }, ${f(t + 0.15)});`);
  T(`tl.from('#${s} .pills span', { opacity: 0, y: 20, duration: 0.3, stagger: 0.08 }, ${f(t + 0.5)});`);
  T(`tl.from('#${s} .url', { opacity: 0, scale: 0.85, duration: 0.4, ease: 'back.out(2)' }, ${f(t + 0.9)});`);
  T(`tl.from('#${s} .by', { opacity: 0, duration: 0.5 }, ${f(t + 1.3)});`);
  T(`tl.fromTo('#${s} .url span', { boxShadow: '0 0 60px rgba(92,255,200,0.9)' }, { boxShadow: '0 0 18px rgba(92,255,200,0.35)', duration: 1.2, repeat: 2, ease: 'sine.inOut' }, ${f(t + 1.0)});`);
  // A last balloon drifts up and pops on the sound.
  T(`tl.fromTo('#lastb', { x: 0, y: 380, rotation: -8 }, { x: 40, y: 0, rotation: 6, duration: 3.2, ease: 'sine.out' }, ${f(t)});`);
  T(`tl.to('#lastb', { scale: 1.35, duration: 0.06 }, 55.14); tl.set('#lastb', { opacity: 0 }, 55.2);`);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rr(-0.3, 0.3);
    const d = rr(90, 170);
    T(`tl.fromTo('#sh${i}', { x: 0, y: 0, opacity: 1, rotation: 0, scale: 1 }, { x: ${f(Math.cos(a) * d)}, y: ${f(Math.sin(a) * d - 30)}, rotation: ${f(rr(-200, 200))}, opacity: 0, scale: 0.4, duration: 0.6, ease: 'power3.out' }, 55.2);`);
  }
  T(`tl.fromTo('#plus', { opacity: 0, y: 0, scale: 0.6 }, { opacity: 1, y: -60, scale: 1, duration: 0.3, ease: 'back.out(2)' }, 55.2); tl.to('#plus', { opacity: 0, y: -100, duration: 0.5 }, 55.8);`);
  T(`tl.to('#${s}', { opacity: 0, duration: 0.6, ease: 'power1.in' }, ${f(END - 0.65)});`);
  ring(HITS.endcard, C.pink, 1);
  T(`tl.fromTo('#flash', { opacity: 0.7 }, { opacity: 0, duration: 0.5 }, ${HITS.endcard});`);
}
// Video fades at the end (attract backdrop) to black with the card.
const lastVid = vids[vids.length - 1].id;
T(`tl.to('#${lastVid}', { opacity: 0, duration: 0.6, ease: 'power1.in' }, ${f(END - 0.65)});`);
// Film grain, stepped once per frame.
T(`tl.fromTo('#grain', { backgroundPosition: '0px 0px' }, { backgroundPosition: '-${Math.round(END * 60) * 173 % 4096}px -${Math.round(END * 60) * 97 % 4096}px', duration: ${END}, ease: 'steps(${Math.round(END * 30)})' }, 0);`);
T(`tl.set({}, {}, ${END});`);

const css = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:${C.bg}}
#root{position:relative;width:1920px;height:1080px;overflow:hidden;background:${C.bg};color:${C.ink};font-family:'IBM Plex Mono',monospace}
.display{font-family:'Inter Tight',sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:-0.03em;line-height:.88}
.mono{font-family:'IBM Plex Mono',monospace;font-weight:600;letter-spacing:.28em;text-transform:uppercase}
.grad{background:linear-gradient(95deg,${C.pink},${C.gold} 45%,${C.mint} 90%);-webkit-background-clip:text;background-clip:text;color:transparent}
.gradhot{background:linear-gradient(95deg,${C.red},${C.pink} 60%,#ffb0ec);-webkit-background-clip:text;background-clip:text;color:transparent}
.gradcool{background:linear-gradient(95deg,#fff 10%,${C.mint} 60%,${C.cyan});-webkit-background-clip:text;background-clip:text;color:transparent}
.grad .ch,.gradhot .ch,.gradcool .ch{background:inherit;-webkit-background-clip:text;background-clip:text;color:transparent}
.ch,.sp{display:inline-block;white-space:pre}
.vid{position:absolute;inset:0;width:1920px;height:1080px;object-fit:cover;z-index:1;transform-origin:50% 50%}
.vid.backdrop{filter:blur(18px) brightness(.38) saturate(1.3);transform:scale(1.12)}
.vid.bd-title{filter:blur(6px) brightness(.5) saturate(1.2)}
.vid.bd-end{filter:blur(12px) brightness(.34) saturate(1.2)}
.scene{position:absolute;inset:0;z-index:10;overflow:hidden}
.dustfield{z-index:9}
.dust{position:absolute;border-radius:50%;background:#e8e4ff;box-shadow:0 0 6px rgba(232,228,255,.6)}
.crt{position:absolute;inset:0;overflow:hidden;transform-origin:50% 50%}
.oldworld{position:absolute;inset:0;background:#1b4dff;transform-origin:50% 60%}
.oc{position:absolute;border-radius:50%;background:#1236c9;box-shadow:inset 0 0 0 6px #2a55ff;opacity:.95}
.oship{position:absolute;left:952px;top:900px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 0 14px #fff}
.ob{position:absolute;left:957px;top:880px;width:6px;height:6px;border-radius:50%;background:#fff;opacity:0}
.scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 2px,transparent 2px 5px);mix-blend-mode:multiply}
.db2,.db2slice{position:absolute;left:0;width:1920px;background:url(assets/db2.webp) center/1920px 1080px no-repeat;filter:saturate(.75) brightness(.7) contrast(1.1)}
.db2{inset:0}
.db2slice{opacity:0;background-size:1920px 1080px}
.tint{position:absolute;inset:0;background:linear-gradient(180deg,rgba(40,10,80,.35),rgba(7,6,13,.65));opacity:.55}
.year{position:absolute;left:120px;top:190px;font-size:26px;color:${C.dim};padding:12px 20px;border:1px solid rgba(244,241,255,.22);border-radius:999px;background:rgba(7,6,13,.6);z-index:3}
.year b{color:#fff;font-weight:700}
.year.hot{color:${C.pink};border-color:rgba(255,95,210,.55)}
.year.hot b{color:${C.pink}}
.act1{position:absolute;left:120px;bottom:210px;z-index:3;text-shadow:0 6px 40px rgba(0,0,0,.65)}
.act1 .l1{font-size:118px}
.act1 .l2{font-size:150px;margin-top:6px}
.act1 .easy{display:inline-block;color:#bfe0ff}
.act1 .evolved{color:#d6b3ff}
.act1.center{left:0;right:0;bottom:auto;top:300px;text-align:center}
.rev{position:relative;height:300px;margin-top:20px;opacity:0}
.rv{position:absolute;left:0;right:0;font-size:300px;letter-spacing:-0.04em}
.rv.main{background:linear-gradient(95deg,${C.red},${C.pink} 55%,${C.gold});-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 40px rgba(255,77,109,.55))}
.rv.r{color:rgba(255,40,80,.75);mix-blend-mode:screen}
.rv.c{color:rgba(60,240,255,.6);mix-blend-mode:screen}
.lb{position:absolute;left:0;width:1920px;height:138px;background:#000;z-index:60;transform-origin:50% 0}
.lb.top{top:0}
.lb.bot{bottom:0;transform-origin:50% 100%}
#flash{position:absolute;inset:0;background:#fff;opacity:0;z-index:70;pointer-events:none}
.ring{position:absolute;left:810px;top:390px;width:300px;height:300px;border-radius:50%;border:10px solid #fff;opacity:0;z-index:65}
#vignette{position:absolute;inset:0;z-index:55;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55) 100%)}
#grain{position:absolute;inset:0;z-index:58;opacity:.07;background:url(assets/grain.png);mix-blend-mode:overlay}
.scrim{position:absolute;top:0;bottom:0;width:1300px}
.scrim.left{left:0;background:linear-gradient(90deg,rgba(7,6,13,.82),rgba(7,6,13,.45) 55%,transparent)}
.scrim.right{right:0;background:linear-gradient(270deg,rgba(7,6,13,.82),rgba(7,6,13,.45) 55%,transparent)}
.slam{position:absolute;top:290px}
.slam.left{left:110px}
.slam.right{right:110px;text-align:right}
.slam .sl0{font-size:210px}
.slam .sl1{font-size:250px;margin-top:4px}
.slam .ch{filter:drop-shadow(0 8px 30px rgba(0,0,0,.5))}
.lowscrim{position:absolute;left:0;right:0;bottom:0;height:420px;background:linear-gradient(0deg,rgba(7,6,13,.85),transparent)}
.mchip{position:absolute;left:110px;bottom:110px;display:flex;align-items:center;gap:34px}
.kbd{display:inline-flex;align-items:center;justify-content:center;min-width:120px;height:120px;padding:0 30px;border-radius:22px;border:3px solid var(--c);background:rgba(7,6,13,.7);box-shadow:0 0 30px color-mix(in srgb,var(--c) 55%,transparent),inset 0 -8px 0 rgba(255,255,255,.08);font:700 40px 'IBM Plex Mono';letter-spacing:.12em;color:#fff}
.cap{display:inline-flex;align-items:center;justify-content:center;width:120px;height:120px;border-radius:50%;background:var(--c);box-shadow:0 0 34px var(--c),inset -10px -14px 0 rgba(0,0,0,.25),inset 8px 8px 0 rgba(255,255,255,.35)}
.cap img{width:62%;height:62%;object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
.cap.big{width:104px;height:104px}
.mname{font-size:120px;color:#fff;text-shadow:0 0 40px var(--c)}
.mline{font-size:26px;color:var(--c);margin-top:14px}
.cardbg{position:absolute;inset:0;background:radial-gradient(ellipse at 40% 45%,rgba(30,20,70,.55),rgba(7,6,13,.8) 70%)}
.numcard{position:absolute;left:130px;top:220px;display:flex;align-items:center;gap:56px;transform-origin:20% 50%}
.num{font-size:430px;letter-spacing:-0.06em;filter:drop-shadow(0 0 50px rgba(255,95,210,.45))}
.w1,.w2{font-size:150px}
.w2{color:${C.mint}}
.wsub{font-size:24px;color:${C.dim};margin-top:22px}
.extra{position:absolute}
.brow{left:0;right:0;bottom:70px;display:flex;justify-content:center;gap:26px}
.bface{width:142px;height:168px;object-fit:contain;filter:drop-shadow(0 10px 20px rgba(0,0,0,.5))}
.prow{left:0;right:0;bottom:110px;display:flex;justify-content:center;gap:24px}
.drafts{left:50%;top:455px;display:flex;gap:18px;perspective:1600px;transform:translateX(-50%) scale(.86);transform-origin:50% 0}
.numcard.compact{top:95px;gap:36px}
.numcard.compact .num{font-size:300px}
.numcard.compact .w1,.numcard.compact .w2{font-size:112px}
.numcard.compact .wsub{margin-top:14px}
.dcard{opacity:0;height:530px;background:url(assets/draft-cards.png) no-repeat;background-size:1240px 530px;border-radius:24px;box-shadow:0 30px 60px rgba(0,0,0,.5)}
.drafts ~ .x{display:none}
.topscrim{position:absolute;left:0;right:0;top:0;height:460px;background:linear-gradient(180deg,rgba(7,6,13,.85),transparent)}
.endless{position:absolute;left:110px;top:110px}
.etitle{font-size:200px}
.esub{font-size:26px;color:${C.mint};margin-top:18px}
.mut{position:absolute;left:0;right:0;bottom:140px;text-align:center;font-size:190px;color:var(--c);text-shadow:0 0 50px var(--c),0 6px 0 rgba(0,0,0,.4);opacity:0}
.camps{position:absolute;left:0;right:0;top:270px;text-align:center}
.ctitle{font-size:210px}
.hotword{display:none;color:${C.red};text-shadow:0 0 60px rgba(255,77,109,.8)}
.cname{opacity:0;display:inline-block;margin:56px 16px 0;font-size:30px;color:var(--c);text-shadow:0 0 24px var(--c)}
.band{position:absolute;left:0;right:0;bottom:120px;height:330px;transform-origin:0 50%;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 70%,#07060d) 0%,color-mix(in srgb,var(--c) 35%,#07060d) 45%,rgba(7,6,13,0) 95%);transform:skewY(-3deg);opacity:.92}
.bosscard{position:absolute;left:80px;bottom:140px;display:flex;align-items:center;gap:40px}
.bport{height:300px;width:auto;filter:drop-shadow(0 20px 40px rgba(0,0,0,.6))}
.bwarn{font-size:26px;color:#fff;font-weight:700;text-shadow:0 0 18px ${C.red}}
.bwarn span{color:#fff;opacity:.9;font-weight:600;text-shadow:none}
.bname{white-space:nowrap;font-size:150px;color:#fff;margin-top:10px;text-shadow:0 0 40px var(--c),0 8px 0 rgba(0,0,0,.35)}
.bline{font-size:30px;letter-spacing:.06em;color:#fff;margin-top:18px;text-transform:none;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.black{position:absolute;inset:0;background:#000}
.aim{opacity:0;position:absolute;left:0;right:0;top:330px;text-align:center;font-size:170px;color:#fff}
.aim.mint{color:${C.mint};text-shadow:0 0 50px rgba(92,255,200,.6)}
.shipwrap{position:absolute;left:910px;top:770px;width:100px;height:100px}
.ship{position:absolute;left:0;top:0;width:100px;height:100px;object-fit:contain}
.pb{position:absolute;left:46px;top:-10px;width:8px;height:30px;border-radius:4px;background:#bff9ff;box-shadow:0 0 12px #7fd8ff;opacity:0}
.titlebg{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(7,6,13,.25),rgba(7,6,13,.85) 75%)}
.burst{position:absolute;left:960px;top:540px}
.bb{position:absolute;left:-70px;top:-84px;width:140px;height:168px;object-fit:contain;opacity:0}
.presents{position:absolute;left:0;right:0;top:250px;text-align:center;font-size:24px;letter-spacing:.5em;color:${C.dim}}
.logo{position:absolute;left:50%;top:50%;display:flex;flex-direction:column;align-items:center;font:900 230px/.86 'Inter Tight',sans-serif;letter-spacing:-0.03em;text-transform:uppercase;transform:translate(-50%,-50%);padding-right:.5em}
.logo.big{margin-top:-10px}
.logo .lw{background:linear-gradient(95deg,${C.pink},${C.gold} 45%,${C.mint} 90%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 30px rgba(255,95,210,.45))}
.logo em{position:absolute;right:-.12em;bottom:-.1em;font-style:normal;font-size:1.25em;color:transparent;-webkit-text-stroke:7px ${C.mint};filter:drop-shadow(0 0 22px rgba(92,255,200,.8))}
.tagline{position:absolute;left:0;right:0;bottom:200px;text-align:center;font-size:34px;letter-spacing:.32em;color:#fff}
.endbg{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(7,6,13,.35),rgba(7,6,13,.9) 75%)}
.endcard{position:absolute;inset:0}
.logo.small{top:200px;font-size:86px;-webkit-text-stroke:0}
.logo.small em{-webkit-text-stroke:3px ${C.mint}}
.play{position:absolute;left:0;right:0;top:350px;text-align:center;font-size:150px}
.play .iyb{font-size:96px;color:#fff}
.pills{position:absolute;left:0;right:0;top:640px;display:flex;justify-content:center;gap:18px}
.pills span{padding:12px 24px;border:1px solid rgba(244,241,255,.3);border-radius:999px;font-size:24px;color:#fff;background:rgba(7,6,13,.5)}
.url{position:absolute;left:0;right:0;top:740px;text-align:center}
.url span{display:inline-block;padding:26px 54px;border-radius:999px;background:${C.mint};color:#07060d;font-size:44px;font-weight:700;letter-spacing:.06em;text-transform:none}
.by{position:absolute;left:0;right:0;top:900px;display:flex;justify-content:center;align-items:center;gap:14px;font-size:22px;color:${C.dim}}
.by img{width:44px;height:44px}
.lastb{position:absolute;left:1430px;top:560px;width:120px;height:142px;object-fit:contain}
.shard{position:absolute;left:1490px;top:612px;width:16px;height:22px;background:${C.gold};border-radius:2px 10px 2px 10px;opacity:0}
.plus{position:absolute;left:1452px;top:580px;font:800 44px 'Inter Tight';color:${C.gold};opacity:0;text-shadow:0 0 20px rgba(255,210,63,.8)}
`;

{
  const seen = new Set();
  for (let i = 0; i < js.length; i++) {
    js[i] = js[i].replace(/tl\.fromTo\(('[^']+'|"[^"]+"), (\{[^{}]*\}), \{/g, (m, tgt, from) => {
      return `tl.fromTo(${tgt}, ${from}, { immediateRender: false, `;
    });
  }
}
const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1920, height=1080">
<title>Deadly Balloons 3 — Trailer</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600;700&family=Inter+Tight:wght@800;900&display=block" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${END}" data-width="1920" data-height="1080" data-fps="60">
${html.join('\n')}
</div>
<script>
window.__timelines = window.__timelines || {};
const RND = ${JSON.stringify(Array.from({ length: 48 }, () => f(rr(-1, 1))))};
const tl = gsap.timeline({ paused: true });
${js.join('\n')}
window.__timelines['main'] = tl;
</script>
</body>
</html>
`;
writeFileSync(new URL('./video/index.html', import.meta.url), out);
console.log('wrote video/index.html:', html.length, 'elements,', js.length, 'timeline lines');
