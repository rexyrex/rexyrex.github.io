#!/usr/bin/env node
// Captures stills of Deadly Balloons 3's own screens (title, level select,
// upgrade draft) at 1920x1080 for the trailer.  node stills.mjs <outdir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { open, sleep } from './cdp.mjs';

const out = resolve(process.argv[2]);
mkdirSync(out, { recursive: true });
const b = await open({ width: 1920, height: 1080, dpr: 2, profile: 'chrome-stills' });
await b.goto('http://localhost:8123/deadlyBalloons/play/?nopause', '!!(window.db3 && window.db3.world)');
await sleep(2500);
writeFileSync(resolve(out, 'title.png'), await b.shot());
await b.evaluate('db3.toMenu()');
await sleep(1500);
writeFileSync(resolve(out, 'menu.png'), await b.shot());
// A draft: start a run, skip the tutorial hints, and ask for one.
await b.evaluate(`(() => { db3.startRun('campaign', db3.levels[2]); const d = db3.world.director; d.wave = 6; d.beginWave(d.host); d.timer = 0.01; return 1; })()`);
await sleep(4000);
await b.evaluate(`(() => { document.querySelectorAll('#hud .hint, .hint').forEach((e) => e.remove()); db3.world.emit({ type: 'draft' }); return 1; })()`);
await sleep(1800);
writeFileSync(resolve(out, 'draft.png'), await b.shot());
console.log(await b.evaluate(`document.getElementById('overlay').innerText.slice(0, 400)`));
b.close();
