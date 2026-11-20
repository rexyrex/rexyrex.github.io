#!/usr/bin/env node
/* Renders the set of images an independent visual critic reviews: every stop
   at 2560x1440 on the highest tier, a few frames of journeys between stops,
   and a frame pair a moment apart (to show shimmer).
   node critic-set.mjs <out-dir> [--port 9666] [--base http://localhost:8123] */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const out = resolve(argv[0] || 'critic'); mkdirSync(out, { recursive: true });
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const port = opt('port', '9666'), base = opt('base', 'http://localhost:8123');
const ids = ['top', 'typing', 'balloons', 'apps', 'games', 'mac', 'tesla', 'music', 'log', 'index', 'contact'];
const W = 'window.__world';
const jobs = [];
ids.forEach((id, i) => jobs.push(`${String(i + 1).padStart(2, '0')}-${id}=(()=>{${W}.freeze(7.5);return ${W}.setPlace(${i})})()`));
[[0, 7, 0.25], [0, 7, 0.5], [0, 7, 0.75], [3, 4, 0.5], [8, 10, 0.4]].forEach(([a, b, u], k) => jobs.push(`2${k}-journey-${ids[a]}-to-${ids[b]}-${Math.round(u * 100)}=(()=>{${W}.setJourney(${a},${b},${u});return 1})()`));
jobs.push(`30-pair-music-a=(()=>{${W}.freeze(7.5);return ${W}.setPlace(7)})()`, `31-pair-music-b=(()=>{${W}.freeze(7.7);return 1})()`);
const r = execFileSync('node', [resolve(here, 'shot.mjs'), '--port', port, '--url', `${base}/_tools/world/dev.html?tier=ultra&hud=0`, '--out', resolve(out, 'v'), '--w', '2560', '--h', '1440', '--settle', '1700', '--quality', '90', '--eval', jobs.join(';;')], { encoding: 'utf8', maxBuffer: 1 << 26 });
const j = JSON.parse(r);
console.log(j.backend, j.shots.length, 'images', j.exceptions.length ? j.exceptions : '', j.console.slice(0, 3));
