// The trailer's edit decision list: one source of truth for the composition,
// the sound-effects bed and the score. 150 BPM: a beat is 0.4 s (24 frames).
export const BPM = 150;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const DROP = 12.0;
export const END = 57.0;

const r = (x) => Math.round(x * 1000) / 1000;

// Gameplay cuts: [start, duration, clip, mediaStart, opts]
export const CUTS = [];
const cut = (start, dur, clip, media, opts = {}) => CUTS.push({ start: r(start), dur: r(dur), clip, media: r(media), ...opts });

// Act I: subliminal flashes (eighth notes from 9.6 to 11.2)
const flashes = [
  ['boss_overlord', 0.3], ['reveal', 5.2], ['graze', 1.2], ['boss_rexyrex', 0.2],
  ['blackhole', 1.6], ['boss_queen', 0.4], ['laser', 2.2], ['arsenal', 2.6],
];
flashes.forEach(([c, m], i) => cut(9.6 + i * 0.2, 0.12, c, m, { flash: true, sfx: 0.5 }));

// Act II
cut(12.0, 3.2, 'reveal', 0.3);
cut(15.2, 1.6, 'graze', 0.6);
cut(16.8, 1.6, 'dash', 0.75);
cut(18.4, 1.6, 'bomb', 0.2);
cut(20.0, 1.6, 'blackhole', 3.0, { backdrop: true, sfx: 0.25 });
cut(21.6, 0.8, 'arsenal', 3.4, { backdrop: true, sfx: 0.25 });
cut(22.4, 0.8, 'laser', 1.3);
cut(23.2, 0.8, 'blackhole', 0.6);
cut(24.0, 0.8, 'lightning', 0.3);
cut(24.8, 1.6, 'arsenal', 0.4);
cut(26.4, 1.6, 'swarm', 1.0, { backdrop: true, sfx: 0.2 });
cut(28.0, 1.6, 'endless', 0.5);
cut(29.6, 1.6, 'reveal', 4.6, { backdrop: true, sfx: 0.25 });
// Act III: bosses
cut(31.2, 3.2, 'boss_gumball', 0.0);
cut(34.4, 3.2, 'boss_rexyrex', 0.0);
cut(37.6, 3.2, 'boss_queen', 0.0);
cut(40.8, 3.2, 'boss_overlord', 0.0);
// Act IV: montage, breakdown, the kill, the title
const montage = [
  ['bomb', 0.95], ['boss_overlord', 5.0], ['blackhole', 2.0], ['laser', 3.0],
  ['reveal', 6.0], ['graze', 3.5], ['boss_rexyrex', 6.0], ['arsenal', 3.0],
];
montage.forEach(([c, m], i) => cut(44.0 + i * 0.2, 0.2, c, m, { sfx: 0.7 }));
cut(47.2, 1.6, 'bossdown', 1.433 - 0.8, { sfx: 1 });
cut(48.8, 3.2, 'attract', 1.0, { backdrop: 'title', sfx: 0 });
cut(52.0, 5.0, 'attract', 4.2, { backdrop: 'end', sfx: 0 });

// Moments the music and the graphics both hit.
export const HITS = {
  card17: 20.0,
  card13: 21.6,
  card25: 26.4,
  endless: 28.0,
  campaigns: 29.6,
  bosses: [31.2, 34.4, 37.6, 40.8],
  breakdown: 45.6,
  kill: 48.0,
  title: 48.8,
  endcard: 52.0,
};
