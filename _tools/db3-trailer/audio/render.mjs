// Renders the score with headless Chrome: node audio/render.mjs out.wav
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open } from '../rec/cdp.mjs';
import * as E from '../edl.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const b = await open({ width: 400, height: 300, profile: 'chrome-audio' });
await b.goto('about:blank');
await b.evaluate(readFileSync(resolve(HERE, 'score.js'), 'utf8'), false);
const cfg = { BEAT: E.BEAT, DROP: E.DROP, END: E.END, HITS: E.HITS, CUTS: E.CUTS };
const t0 = Date.now();
const { wav, peak } = await b.evaluate(`renderScore(${JSON.stringify(cfg)})`);
writeFileSync(resolve(process.argv[2]), Buffer.from(wav, 'base64'));
console.log('score rendered in', (Date.now() - t0) / 1000, 's, raw peak', peak.toFixed(3));
b.close();
