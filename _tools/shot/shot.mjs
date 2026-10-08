#!/usr/bin/env node
/* Screenshot + console sweep for one page, in headless Google Chrome over
   the DevTools protocol. Node 22, no npm. Serve the repo first:
       python3 -m http.server 8123

   node _tools/shot/shot.mjs http://localhost:8123/apps/qr_scanner/ \
        --out /tmp/qr --w 1440 --h 900 --theme dark --at 0,0.25,0.5,0.75,1

   Flags
     --out <prefix>   screenshots go to <prefix>-<n>.png (default ./shot)
     --w / --h        viewport (default 1440×900)
     --dpr <n>        device pixel ratio (default 1)
     --mobile         390×844 @2x, touch + mobile UA
     --theme <t>      light | dark → prefers-color-scheme
     --reduced        prefers-reduced-motion: reduce
     --at <list>      scroll positions to capture: fractions of the page
                      (0,0.5,1) or, above 1, pixels (6000,7200); default 0
     --full           one full-page capture (scrolls through first so
                      IntersectionObserver reveals fire)
     --wait <ms>      settle time after load (default 2500)
     --step <ms>      settle time per scroll step (default 900)
     --eval <js>      expression evaluated after load; result is printed
     --ignore <s>     drop report lines containing this substring (repeatable),
                      e.g. --ignore api.github.com when the status bar's
                      commit lookup is rate-limited

   Prints a JSON report: console errors/warnings, uncaught exceptions,
   failed requests and HTTP ≥ 400 responses. Exit code 1 if any. */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.slice(2);
const url = argv.find((a) => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.match(/^--(out|w|h|dpr|theme|at|wait|step|eval|ignore)$/));
if (!url) { console.error('usage: shot.mjs <url> [--out p] [--w n --h n] [--mobile] [--theme light|dark] [--reduced] [--at 0,0.5,1] [--full] [--eval js]'); process.exit(2); }
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);

const mobile = flag('mobile');
const W = +opt('w', mobile ? 390 : 1440);
const H = +opt('h', mobile ? 844 : 900);
const DPR = +opt('dpr', mobile ? 2 : 1);
const out = resolve(opt('out', './shot'));
const settle = +opt('wait', 2500);
const step = +opt('step', 900);
const at = opt('at', '0').split(',').map(Number);
mkdirSync(dirname(out), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'shot-'));
const PORT = 9500 + Math.floor(Math.random() * 450);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${profile}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); }
}
if (!wsUrl) { cleanup(); throw new Error('Chrome did not start (set CHROME=/path/to/chrome)'); }

const ws = new WebSocket(wsUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
let sessionId = null;
const pending = new Map();
const report = { url, viewport: `${W}x${H}@${DPR}`, theme: opt('theme', 'default'), reduced: flag('reduced'), console: [], exceptions: [], failed: [], http: [], shots: [] };
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); return; }
    const p = m.params || {};
    if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning' || p.type === 'assert')) {
        report.console.push(`${p.type}: ${(p.args || []).map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 400));
    } else if (m.method === 'Runtime.exceptionThrown') {
        const d = p.exceptionDetails || {};
        report.exceptions.push(`${d.exception?.description || d.text} @${d.url || ''}:${d.lineNumber}`.slice(0, 600));
    } else if (m.method === 'Log.entryAdded' && (p.entry?.level === 'error' || p.entry?.level === 'warning')) {
        report.console.push(`log.${p.entry.level}: ${p.entry.text} ${p.entry.url || ''}`.slice(0, 400));
    } else if (m.method === 'Network.loadingFailed' && !p.canceled) {
        report.failed.push(`${p.errorText} ${requests.get(p.requestId) || p.requestId}`);
    } else if (m.method === 'Network.requestWillBeSent') {
        requests.set(p.requestId, p.request.url);
    } else if (m.method === 'Network.responseReceived' && p.response.status >= 400) {
        report.http.push(`${p.response.status} ${p.response.url}`);
    }
};
const requests = new Map();
const send = (method, params = {}) => { const i = ++id; const msg = { id: i, method, params }; if (sessionId) msg.sessionId = sessionId; ws.send(JSON.stringify(msg)); return new Promise((r) => pending.set(i, r)); };
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
    await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Log.enable'), send('Network.enable')]);
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile });
    if (mobile) {
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
    }
    const features = [];
    if (opt('theme')) features.push({ name: 'prefers-color-scheme', value: opt('theme') });
    if (flag('reduced')) features.push({ name: 'prefers-reduced-motion', value: 'reduce' });
    if (features.length) await send('Emulation.setEmulatedMedia', { features });

    await send('Page.navigate', { url });
    await sleep(settle);
    if (opt('eval')) report.eval = await evaluate(opt('eval'));

    const shoot = async (file, extra = {}) => {
        const r = await send('Page.captureScreenshot', { format: 'png', ...extra });
        if (r?.data) { writeFileSync(file, Buffer.from(r.data, 'base64')); report.shots.push(file); }
    };

    if (flag('full')) {
        const total = await evaluate('document.documentElement.scrollHeight');
        for (let y = 0; y < total; y += Math.round(H * 0.6)) { await evaluate(`window.scrollTo(0, ${y})`); await sleep(160); }
        await evaluate('window.scrollTo(0, 0)');
        await sleep(step);
        const h = await evaluate('document.documentElement.scrollHeight');
        await shoot(`${out}-full.png`, { captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: Math.min(h, 16000), scale: 1 } });
    } else {
        for (let i = 0; i < at.length; i++) {
            await evaluate(at[i] > 1 ? `window.scrollTo(0, ${at[i]})` : `window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * ${at[i]}))`);
            await sleep(i === 0 && at[i] === 0 ? 200 : step);
            await shoot(`${out}-${i}.png`);
        }
    }
} finally {
    ws.close();
    cleanup();
}

const ignores = argv.flatMap((a, i) => (a === '--ignore' ? [argv[i + 1]] : []));
if (ignores.length) for (const k of ['console', 'exceptions', 'failed', 'http']) report[k] = report[k].filter((l) => !ignores.some((s) => l.includes(s)));
const bad = report.console.length + report.exceptions.length + report.failed.length + report.http.length;
console.log(JSON.stringify(report, null, 2));
process.exit(bad ? 1 : 0);
