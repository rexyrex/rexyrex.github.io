// Minimal headless Chrome over the DevTools protocol (Node 22, no packages).
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function open({ width = 1920, height = 1080, dpr = 1, profile = 'chrome-tool', init } = {}) {
  const port = 9300 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
    '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--mute-audio', '--hide-scrollbars', '--allow-file-access-from-files',
    `--window-size=${width},${height}`, `--user-data-dir=${resolve(HERE, '..', '.' + profile)}`, 'about:blank',
  ], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); }
  }
  if (!wsUrl) { chrome.kill(); throw new Error('Chrome did not start'); }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') console.log('[page exception]', JSON.stringify(m.params.exceptionDetails).slice(0, 400));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('[page error]', m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
  };
  let sessionId = null;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    const msg = { id: i, method, params };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify(msg));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
  if (init) await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
  const evaluate = async (expression, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
    return r.result.value;
  };
  const goto = async (url, ready) => {
    await send('Page.navigate', { url });
    for (let i = 0; i < 240; i++) {
      await sleep(250);
      try { if (await evaluate(ready || 'document.readyState === "complete"', false)) return; } catch { /* loading */ }
    }
    throw new Error('page not ready: ' + url);
  };
  const shot = async (opts = {}) => Buffer.from((await send('Page.captureScreenshot', { format: 'png', ...opts })).data, 'base64');
  const close = () => { try { ws.close(); } catch { /* */ } chrome.kill(); };
  return { send, evaluate, goto, shot, close };
}
