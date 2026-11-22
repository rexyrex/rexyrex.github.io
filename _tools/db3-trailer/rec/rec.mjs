#!/usr/bin/env node
// Records Deadly Balloons 3 gameplay shots frame by frame through headless
// Chrome (DevTools protocol, no packages). Each shot becomes clips/<name>.mp4
// (60 fps, exact timing) plus clips/<name>.wav (its sound effects).
//
//   node rec.mjs [--url URL] [--test] shot1 shot2 ...   (no shots = all)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'clips');
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const URL_ = opt('--url', 'http://localhost:8123/deadlyBalloons/play/?nopause');
const TEST = args.includes('--test');
const wanted = args.filter((a) => !a.startsWith('--'));
const W = 1920;
const H = 1080;

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9800 + Math.floor(Math.random() * 150);
const profile = resolve(HERE, '..', '.chrome-rec');
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
  '--enable-gpu', '--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--window-size=${W},${H}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('exit', () => chrome.kill());

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); }
}
if (!wsUrl) throw new Error('Chrome did not start');
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) rej(new Error(JSON.stringify(m.error)));
    else res(m.result);
  } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
    console.log('[page]', m.params.type, m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
  } else if (m.method === 'Runtime.exceptionThrown') {
    console.log('[page exception]', JSON.stringify(m.params.exceptionDetails).slice(0, 400));
  }
};
let sessionId = null;
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  const msg = { id: i, method, params };
  if (sessionId) msg.sessionId = sessionId;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify(msg));
});
const evaluate = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(resolve(HERE, 'shim.js'), 'utf8') });
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 240; i++) {
  await sleep(250);
  try { if (await evaluate('!!(window.db3 && window.db3.world)')) break; } catch { /* page still loading */ }
}
// Let the sound synthesis (prepare()) finish.
await sleep(2500);
const shots = await evaluate(readFileSync(resolve(HERE, 'harness.js'), 'utf8'));
const list = wanted.length ? wanted : shots;
console.log('shots:', list.join(' '));

for (const name of list) {
  const t0 = Date.now();
  let frames = await evaluate(`__rec.begin(${JSON.stringify(name)})`);
  if (TEST) frames = Math.min(frames, 5);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', '60', resolve(OUT, `${name}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < frames; i++) {
    await evaluate(`__rec.frame(${i})`);
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96, optimizeForSpeed: false });
    const buf = Buffer.from(data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (TEST && i === frames - 1) writeFileSync(resolve(OUT, `${name}-test.jpg`), buf);
    if (i % 60 === 0) process.stdout.write(`\r${name} ${i}/${frames} ${JSON.stringify(await evaluate('__rec.stats()'))}   `);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  const wav = await evaluate(`__rec.sfxWav(${frames / 60})`, true);
  writeFileSync(resolve(OUT, `${name}.wav`), Buffer.from(wav, 'base64'));
  console.log(`\n${name}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
ws.close();
chrome.kill();
process.exit(0);
