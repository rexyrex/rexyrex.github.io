#!/usr/bin/env node
/* Renders the still of every stop (the page's fallback and first paint) and the
   minimap, from the live world, into /assets/island/. Needs a Chrome with
   --remote-debugging-port and the repo served on localhost.

   node posters.mjs --port 9666 --base http://localhost:8123 [--tier ultra] [--only top,apps]
   Then: python3 posters.py   (PNG -> WebP) */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const port = opt('port', '9666'), base = opt('base', 'http://localhost:8123'), tier = opt('tier', 'ultra');
const out = resolve(here, 'out'); mkdirSync(out, { recursive: true });
const ids = ['top', 'typing', 'balloons', 'apps', 'games', 'mac', 'tesla', 'music', 'log', 'index', 'contact'];
const only = opt('only', '') ? opt('only').split(',') : ids;
const T = 7.5;      // a fixed moment, so stills are reproducible
const jobs = ids.map((id, i) => ({ id, i })).filter((j) => only.includes(j.id)).map((j) => `${j.id}=(()=>{const w=window.__world;w.freeze(${T});return w.setPlace(${j.i})})()`).join(';;');
const run = (args) => { const r = execFileSync('node', [resolve(here, 'shot.mjs'), ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }); const j = JSON.parse(r); if (j.exceptions.length || j.error) { console.error(r); process.exit(1); } return j; };
if (jobs) { const r = run(['--port', port, '--url', `${base}/_tools/world/dev.html?tier=${tier}&hud=0`, '--out', resolve(out, 'still'), '--w', '1600', '--h', '900', '--dpr', '1', '--settle', '1800', '--format', 'png', '--eval', jobs]); console.log(r.backend, r.shots.length, 'stills'); }
if (!opt('only') || only.includes('map')) {
    const r = run(['--port', port, '--url', `${base}/_tools/world/dev.html?tier=${tier}&hud=0&post=0`, '--out', resolve(out, 'still'), '--w', '768', '--h', '768', '--settle', '1500', '--format', 'png', '--eval', `map=(()=>{const w=window.__world;w.freeze(${T});w.camera.fov=42.08;w.camera.updateProjectionMatrix();w.setView(0,2600,0.5,0,0,0);return JSON.stringify(Object.fromEntries(Object.entries(w.SITES).map(([k,v])=>[k,[Math.round(v.x),Math.round(v.z)]])))})()`]);
    console.log('map', r.shots.length);
}
