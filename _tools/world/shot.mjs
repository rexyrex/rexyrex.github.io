#!/usr/bin/env node
/* Renders views of the island in a Chrome that is already running with
   --remote-debugging-port, and saves them. Node 22+, no packages.

   node shot.mjs --port 9666 --url 'http://localhost:8123/_tools/world/dev.html?tier=ultra&hud=0' \
        --out /tmp/shots/a --w 2560 --h 1440 --views 'overlook=-520,130,330,0,60,-200;sea=...'

   --views   name=px,py,pz,tx,ty,tz;…  camera position and look-at per shot
   --eval    name=<js>;…               instead of a view: run this, then shoot
   --settle  ms to let a view settle before the capture (default 900)
   --fps     also measure frames per second at every view
   --format  png | jpeg (default jpeg, quality 92)
   --world   name of the global holding the world: __world (dev.html, default) or rexWorld (the site)
   --mobile  phone metrics and touch
   --noworld the page has no live world (stills only): do not wait for one
   --reduced emulate prefers-reduced-motion
   Prints a JSON report with console errors and, with --fps, timings. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
const port = +opt('port', 9666), url = opt('url'), out = resolve(opt('out', './shot'));
const W = +opt('w', 1920), H = +opt('h', 1080), DPR = +opt('dpr', 1), settle = +opt('settle', 900);
const format = opt('format', 'jpeg');
const W_NAME = opt('world', '__world');      // global the page stores the world in (rexWorld on the real page)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(dirname(out), { recursive: true });

const wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
const ws = new WebSocket(wsUrl); await new Promise((r) => { ws.onopen = r; });
let id = 0, sessionId = null; const pending = new Map();
const report = { url, viewport: `${W}x${H}@${DPR}`, console: [], exceptions: [], shots: [], fps: {} };
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); return; }
    const p = m.params || {};
    if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) report.console.push(`${p.type}: ${(p.args || []).map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 700));
    else if (m.method === 'Runtime.exceptionThrown') report.exceptions.push(`${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`.slice(0, 900));
    else if (m.method === 'Log.entryAdded' && p.entry?.level === 'error') report.console.push(`log: ${p.entry.text} ${p.entry.url || ''}`.slice(0, 500));
};
const send = (method, params = {}) => { const i = ++id; const msg = { id: i, method, params }; if (sessionId) msg.sessionId = sessionId; ws.send(JSON.stringify(msg)); return new Promise((r) => pending.set(i, r)); };
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.value ?? (r.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : undefined); };

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
let code = 0;
try {
    await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Log.enable'), send('Network.enable')]);
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: flag('mobile') });
    if (flag('mobile')) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (flag('reduced')) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.navigate', { url });
    const t0 = Date.now();
    let state = null;
    if (flag('noworld')) { await sleep(settle); state = 'page'; }
    while (!state && Date.now() - t0 < +opt('timeout', 90000)) {
        state = await evaluate(`window.__error || window.rexWorldError ? "error" : (window.${W_NAME} ? "ready" : "")`);
        if (state) break;
        await sleep(250);
    }
    report.loadMs = Date.now() - t0;
    if (state === 'page') {
        // a page with no live world (the stills): just run the steps and shoot
        for (const v of (opt('eval', '') || '').split(';;').filter(Boolean)) { const k = v.indexOf('='); await evaluate(v.slice(k + 1)); await sleep(settle); const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: +opt('quality', 92) }); if (shot?.data) { const f = `${out}-${v.slice(0, k)}.jpg`; writeFileSync(f, Buffer.from(shot.data, 'base64')); report.shots.push(f); } }
    } else if (state !== 'ready') { report.error = (await evaluate('window.__error || window.rexWorldError')) || 'timed out waiting for the world'; code = 1; }
    else {
        report.backend = await evaluate(`window.${W_NAME}.backend + " " + window.${W_NAME}.quality.name`);
        const jobs = [];
        for (const v of (opt('views', '') || '').split(';').filter(Boolean)) { const [name, nums] = v.split('='); jobs.push({ name, js: `window.${W_NAME}.setView(${nums})` }); }
        for (const v of (opt('eval', '') || '').split(';;').filter(Boolean)) { const k = v.indexOf('='); jobs.push({ name: v.slice(0, k), js: v.slice(k + 1) }); }
        if (!jobs.length) jobs.push({ name: 'default', js: '0' });
        for (const j of jobs) {
            const r = await evaluate(j.js);
            if (typeof r === 'string' && r.startsWith('EXC')) report.exceptions.push(`${j.name}: ${r}`);
            await sleep(settle);
            if (flag('fps')) report.fps[j.name] = await evaluate(`new Promise((res) => { let n = 0, t0 = performance.now(), worst = 0, last = t0; const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < 2500) requestAnimationFrame(f); else res({ fps: +(n * 1000 / (t - t0)).toFixed(1), worstMs: +worst.toFixed(1), info: window.${W_NAME}.info ? window.${W_NAME}.info() : null }); }; requestAnimationFrame(f); })`);
            const shot = await send('Page.captureScreenshot', format === 'png' ? { format: 'png' } : { format: 'jpeg', quality: +opt('quality', 92) });
            if (shot?.data) { const f = `${out}-${j.name}.${format === 'png' ? 'png' : 'jpg'}`; writeFileSync(f, Buffer.from(shot.data, 'base64')); report.shots.push(f); }
        }
    }
} finally {
    sessionId = null;
    await send('Target.closeTarget', { targetId });
}
console.log(JSON.stringify(report, null, 1));
process.exit(code || (report.exceptions.length ? 1 : 0));
