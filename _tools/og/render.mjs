#!/usr/bin/env node
/* Renders the social cards (/assets/og/*.png, 1200×630) and the app icons
   (/assets/icons/*.png) from the HTML templates next to this file, using
   headless Google Chrome over the DevTools protocol. No dependencies beyond
   Node 22 (built-in fetch + WebSocket) and Chrome.

     node _tools/og/render.mjs            # everything
     node _tools/og/render.mjs typing 404 # only these cards

   Add a page: one entry in CARDS below, then reference
   /assets/og/<name>.png from the page's og:image / twitter:image.
   The directory starts with an underscore so GitHub Pages (Jekyll)
   leaves it out of the published site. */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const IMG = pathToFileURL(resolve(ROOT, 'assets/rexGreenSmall.png')).href;

const CARDS = {
    home:     { path: '/', eyebrow: 'rexyrex.github.io', file: '/index.html', title: 'Apps, games, and music, built by one person.', desc: 'Apps on Google Play and the App Store, multiplayer browser games, a typing game, and a few tracks.' },
    typing:   { path: '/typing/', file: '/typing/index.html', title: 'Typing Speed Test', desc: 'Korean, English and programmer modes, with daily and all-time leaderboards.' },
    balloons: { path: '/deadlyBalloons/', file: '/deadlyBalloons/index.html', title: 'Deadly Balloons 2', desc: 'A desktop balloon-popping game written in Java. Trailer, download and source.' },
    music:    { path: '/music/', file: '/music/showcase.html', title: 'Music', desc: 'SuperPose streams from SoundCloud. More tracks on SoundCloud and Newgrounds.' },
    lab:      { path: '/animation.html', file: '/animation.html', title: 'Animation lab', desc: 'A scratchpad of CSS text effects on Vue 3. Pick one, or let it shuffle.' },
    support:  { path: '/support/', file: '/support/index.html', title: 'Support', desc: 'How to reach the developer about any of the apps, and where each privacy policy lives.' },
    parser:   { path: '/parser/', file: '/parser/index.html', title: 'KakaoParser', desc: 'Companion pages for the KakaoTalk chat analyzer: tools and help documents.' },
    404:      { path: '/404', file: '/404.html', title: 'File not found', desc: 'That path does not exist here. The rex looked everywhere.' },
    log:      { path: '/log/', file: '/log/index.html', title: 'Devlog', desc: 'Notes on how the things on this site are built.' }
};

const ICONS = [
    { name: 'icon-192', size: 192, rex: 146 },
    { name: 'icon-512', size: 512, rex: 390 },
    { name: 'icon-maskable-512', size: 512, rex: 300 },
    { name: 'apple-touch-icon', size: 180, rex: 138 }
];

const only = process.argv.slice(2);
const jobs = [];
for (const [name, c] of Object.entries(CARDS)) {
    if (only.length && !only.includes(name)) continue;
    const q = new URLSearchParams({ img: IMG, ...c });
    jobs.push({ w: 1200, h: 630, out: resolve(ROOT, 'assets/og', name + '.png'), url: pathToFileURL(resolve(HERE, 'card.html')).href + '?' + q });
}
if (!only.length || only.includes('icons')) {
    for (const i of ICONS) {
        const q = new URLSearchParams({ img: IMG, size: i.size, rex: i.rex });
        jobs.push({ w: i.size, h: i.size, out: resolve(ROOT, 'assets/icons', i.name + '.png'), url: pathToFileURL(resolve(HERE, 'icon.html')).href + '?' + q });
    }
}
mkdirSync(resolve(ROOT, 'assets/og'), { recursive: true });
mkdirSync(resolve(ROOT, 'assets/icons'), { recursive: true });

const PORT = 9400 + Math.floor(Math.random() * 400);
const profile = resolve(HERE, '.chrome-profile');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--allow-file-access-from-files', `--user-data-dir=${profile}`, '--window-size=1400,800', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); }
}
if (!wsUrl) { chrome.kill(); throw new Error('Chrome did not start (set CHROME=/path/to/chrome)'); }

const ws = new WebSocket(wsUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); } };
let sessionId = null;
const send = (method, params = {}) => { const i = ++id; const msg = { id: i, method, params }; if (sessionId) msg.sessionId = sessionId; ws.send(JSON.stringify(msg)); return new Promise((r) => pending.set(i, r)); };

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
await send('Page.enable');
await send('Runtime.enable');
for (const job of jobs) {
    await send('Emulation.setDeviceMetricsOverride', { width: job.w, height: job.h, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: job.url });
    for (let i = 0; i < 50; i++) {
        const r = await send('Runtime.evaluate', { expression: 'window.__rexDone === true && document.fonts.status === "loaded"', returnByValue: true });
        if (r.result && r.result.value) break;
        await sleep(200);
    }
    await sleep(400);
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: job.w, height: job.h, scale: 1 } });
    writeFileSync(job.out, Buffer.from(data, 'base64'));
    console.log('wrote', job.out.replace(ROOT + '/', ''));
}
ws.close();
chrome.kill();
