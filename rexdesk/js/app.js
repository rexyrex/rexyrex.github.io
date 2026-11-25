// The page: the connect screen, the password prompt, and the session view around the picture.
// Everything heavy (the connection, decryption, decoding, drawing) is the engine's, in a worker;
// this file turns what the person does into commands and what the engine reports into the UI.

import { encode } from './protocol.js';
import { shortFingerprint } from './crypto.js';
import { normalizeService, DEFAULT_SERVICE } from './rendezvous.js';
import { APP_VERSION } from './session.js';
import { savedHosts, saveHost, forgetHost, prefs, setPrefs } from './store.js';
import { Input } from './input.js';
import { localIsApple } from './keymap.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const touchDevice = matchMedia('(pointer: coarse)').matches;
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
// "Remember this browser" leaves a key here that signs in without the password. Every page on the
// same origin could use it, and on *.github.io that is the whole site, so there it is not offered:
// the password is asked each time. On an address of its own (or localhost) it is.
const sharedOrigin = /\.github\.io$/i.test(location.hostname);

// MARK: Settings

function defaultDeviceName() {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /CriOS|Chrome\//.test(ua) ? 'Chrome'
        : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Mac/.test(platform) && navigator.maxTouchPoints > 1) ? 'iPad'
        : /Android/.test(ua) ? 'Android' : /CrOS/.test(ua) ? 'ChromeOS' : /Win/i.test(platform) ? 'Windows'
            : /Mac/i.test(platform) ? 'Mac' : /Linux/i.test(platform) ? 'Linux' : '';
    return os ? `${browser} on ${os}` : browser;
}

/** The service to use: the setting, or (on this machine only, for tests) `?rendezvous=ws://…`. */
function serviceUrl() {
    const override = local ? params.get('rendezvous') : null;
    return normalizeService(override || prefs().service) || DEFAULT_SERVICE;
}

const deviceName = () => prefs().deviceName.trim() || defaultDeviceName();

// MARK: The engine

let post = () => {};
let engineInfo = null;      // the engine's `ready` event

async function startEngine() {
    const canvas = $('picture');
    // `?codecs=h264` narrows what is asked for, on this machine only (tests).
    const only = local ? params.get('codecs') : null;
    const init = { t: 'init', service: serviceUrl(), deviceName: deviceName(), only: only ? only.split(',') : null };
    // A browser that knows module workers reads `type`; one that does not would run the file as a
    // classic script and fail, so the worker is dropped before the canvas is handed to it.
    let modules = false;
    let worker = null;
    if (!params.has('mainthread') && canvas.transferControlToOffscreen && typeof Worker !== 'undefined') {
        try {
            worker = new Worker(new URL('./engine.worker.js', import.meta.url), { get type() { modules = true; return 'module'; } });
        } catch (_) { worker = null; }
        if (worker && !modules) { worker.terminate(); worker = null; }
    }
    if (worker) {
        worker.onmessage = (event) => onEngine(event.data);
        worker.onerror = (event) => showNotice(`RexDesk could not start (${event.message || 'the engine failed to load'}).`);
        post = (command, transfer) => worker.postMessage(command, transfer || []);
        const offscreen = canvas.transferControlToOffscreen();
        post({ ...init, canvas: offscreen }, [offscreen]);
    } else {
        // No module workers or OffscreenCanvas: the same engine, on this thread.
        const { Engine } = await import('./engine.js');
        const engine = new Engine((event) => onEngine(event));
        post = (command) => engine.handle(command);
        post({ ...init, canvas });
    }
}

function onEngine(event) {
    const handler = engineEvents[event.t];
    if (handler) handler(event);
}

// MARK: Connect screen

const state = {
    phase: 'idle',          // idle | connecting | session
    target: null,           // { fingerprint, name }
    connectId: 0,           // the connect whose events count; anything older is ignored
    lookupId: 0,
    passwordError: null,
    online: new Map(),
};

function showNotice(text) {
    const notice = $('notice');
    notice.textContent = text || '';
    notice.hidden = !text;
}

function setBusy(text) {
    $('busy').hidden = !text;
    if (text) $('busy-text').textContent = text;
}

function renderSaved() {
    const hosts = savedHosts();
    $('saved').hidden = hosts.length === 0;
    const list = $('saved-list');
    list.replaceChildren(...hosts.map((host) => {
        const li = document.createElement('li');
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'saved-open';
        const online = state.online.get(host.fingerprint);
        const dot = document.createElement('span');
        dot.className = 'dot' + (online === true ? ' on' : online === false ? ' off' : '');
        const name = document.createElement('b');
        name.textContent = host.name;
        const id = document.createElement('code');
        id.textContent = shortFingerprint(host.fingerprint);
        const status = document.createElement('i');
        status.textContent = online === true ? 'Online' : online === false ? 'Offline' : '';
        open.append(dot, name, id, status);
        open.addEventListener('click', () => connectTo(host.fingerprint, host.name));
        const forget = document.createElement('button');
        forget.type = 'button';
        forget.className = 'saved-forget';
        forget.setAttribute('aria-label', `Forget ${host.name}`);
        forget.textContent = '×';
        forget.addEventListener('click', () => { forgetHost(host.fingerprint); renderSaved(); });
        li.append(open, forget);
        return li;
    }));
}

function refreshOnline() {
    const fingerprints = savedHosts().map((h) => h.fingerprint);
    if (fingerprints.length && engineInfo) post({ t: 'status', fingerprints });
}

function lookupAndConnect(text) {
    showNotice('');
    setBusy('Looking for that Mac…');
    state.phase = 'connecting';
    post({ t: 'lookup', id: ++state.lookupId, hostId: text });
}

function connectTo(fingerprint, name) {
    showNotice('');
    state.phase = 'connecting';
    state.target = { fingerprint, name: name || 'Mac' };
    state.passwordError = null;
    setBusy(`Connecting to ${state.target.name}…`);
    startAudio();
    post({ t: 'config', service: serviceUrl(), deviceName: deviceName() });
    post({ t: 'connect', id: ++state.connectId, fingerprint, request: streamRequest() });
    // A tab opened in the background connects paused: nothing is streamed until someone looks.
    post({ t: 'pause', paused: document.visibilityState === 'hidden' });
}

/** Ends whatever is connecting or connected; its late events no longer count. */
function disconnect() {
    state.connectId++;
    state.lookupId++;
    post({ t: 'disconnect' });
}

function backToConnect(message) {
    state.phase = 'idle';
    setBusy('');
    closePassword();
    leaveSession();
    showNotice(message || '');
    renderSaved();
    refreshOnline();
}

function cancel() {
    disconnect();
    backToConnect('');
}

// MARK: Password

function askPassword(methods) {
    const dialog = $('password-dialog');
    const canPassword = methods.includes('password');
    const canApprove = methods.includes('approval');
    setBusy('');
    // The same test hook: `&password=` answers the first prompt. Never honoured off localhost.
    if (local && canPassword && params.get('password') !== null && !state.passwordError && !state.autoAnswered) {
        state.autoAnswered = true;
        setBusy('Signing in…');
        return post({ t: 'answer', method: 'password', password: params.get('password'), remember: false });
    }
    if (!canPassword && !canApprove) {
        disconnect();
        return backToConnect('That Mac has no access password set, and nobody can approve this device from here. Set a password in RexDesk Host’s settings.');
    }
    $('password-title').textContent = `Sign in to ${state.target?.name || 'the Mac'}`;
    $('password').hidden = !canPassword;
    $('password-submit').hidden = !canPassword;
    $('password-text').textContent = canPassword
        ? 'Type the access password set in RexDesk Host on that Mac. It never leaves this device.'
        : 'This Mac has no access password. Someone at the Mac can allow this device.';
    $('password-approval').hidden = !canApprove;
    $('password-approval').textContent = canPassword ? 'Ask at the Mac instead' : 'Ask at the Mac';
    const canRemember = !sharedOrigin && engineInfo?.persistent !== false;
    $('remember').checked = canRemember;
    $('remember').closest('label').hidden = !canRemember;
    $('remember-note').hidden = !sharedOrigin;
    const error = $('password-error');
    error.textContent = state.passwordError || '';
    error.hidden = !state.passwordError;
    $('password').value = '';
    if (!dialog.open) dialog.showModal();
    if (canPassword) $('password').focus();
}

function closePassword() {
    const dialog = $('password-dialog');
    $('password').value = '';
    if (dialog.open) dialog.close();
}

$('password-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const password = $('password').value;
    if (!password) return;
    closePassword();
    setBusy('Signing in…');
    post({ t: 'answer', method: 'password', password, remember: !sharedOrigin && $('remember').checked });
});
$('password-approval').addEventListener('click', () => {
    closePassword();
    setBusy('Waiting for someone at the Mac to allow this device…');
    post({ t: 'answer', method: 'approval', remember: !sharedOrigin && $('remember').checked });
});
$('password-cancel').addEventListener('click', cancel);
$('password-dialog').addEventListener('cancel', (event) => { event.preventDefault(); cancel(); });

// MARK: Sound

const audio = { context: null, node: null, bufferedMs: -1 };

/** Called from the Connect click: a browser only starts sound from a gesture. */
async function startAudio() {
    if (!window.AudioContext || !window.AudioWorkletNode) return;
    try {
        if (audio.context) { audio.context.resume(); return; }
        const context = audio.context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
        await context.audioWorklet.addModule(new URL('./audio-worklet.js', import.meta.url));
        const node = audio.node = new AudioWorkletNode(context, 'rexdesk-player', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        node.connect(context.destination);
        node.port.onmessage = (event) => { audio.bufferedMs = event.data.bufferedMs; };
        // The engine's worker writes samples straight to the audio thread through this channel.
        const channel = new MessageChannel();
        node.port.postMessage({ port: channel.port1 }, [channel.port1]);
        post({ t: 'audio', port: channel.port2 }, [channel.port2]);
        context.resume();
    } catch (_) {
        audio.context = null;   // no sound in this browser; the picture does not depend on it
    }
}

// MARK: The session view

const session = {
    stream: null,           // the last STREAM_STARTED
    size: null,             // the picture's pixels
    displays: [],
    zoom: { scale: 1, x: 0, y: 0, startScale: 1 },
    box: { left: 0, top: 0, width: 0, height: 0 },
    cursors: new Map(),     // cursorId → { url, width, height, hotX, hotY, scale }
    cursorId: null,
    wakeLock: null,
    clipboardSeen: null,
    toolbarTimer: null,
    resizeTimer: null,
};

const input = new Input({
    surface: $('surface'), picture: $('picture'), soft: $('soft'),
    send: (bytes) => post({ t: 'input', bytes: bytes.buffer }, [bytes.buffer]),
    move: (x, y) => post({ t: 'move', x, y }),
    hooks: {
        cursor: (x, y) => { placePointer(x, y); followPointer(x, y); },
        zoom: pinch,
        zoomEnd: () => requestTarget(),
        sticky: (set) => {
            for (const button of $('keys-row').querySelectorAll('[data-sticky]')) {
                button.setAttribute('aria-pressed', String(set.has(Number(button.dataset.sticky))));
            }
        },
    },
});

/** The size to ask the host for: the pixels the picture will really cover, zoom included. */
function targetSize() {
    const dpr = window.devicePixelRatio || 1;
    const zoom = session.zoom.scale;
    return { targetWidth: Math.round(window.innerWidth * dpr * zoom), targetHeight: Math.round(window.innerHeight * dpr * zoom) };
}

function streamRequest() {
    const p = prefs();
    return { displayId: 0, quality: p.quality, audio: p.sound, maxFps: 60, localCursor: true, ...targetSize() };
}

function requestTarget() {
    clearTimeout(session.resizeTimer);
    session.resizeTimer = setTimeout(() => {
        if (state.phase === 'session') post({ t: 'stream', changes: targetSize() });
    }, 300);
}

/**
 * Fits the picture in the window. When the stream was made for this window (the usual case) one
 * stream pixel lands on one device pixel: nothing is resampled.
 */
function layout() {
    const size = session.size;
    if (!size) return;
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth, H = window.innerHeight;
    let scale = Math.min(W / size.width, H / size.height);
    const exact = 1 / dpr;
    if (size.width * exact <= W + 0.5 && size.height * exact <= H + 0.5 && scale / exact < 1.35) scale = exact;
    const width = size.width * scale, height = size.height * scale;
    session.box = { left: Math.round((W - width) / 2), top: Math.round((H - height) / 2), width, height };
    const stage = $('stage');
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    applyZoom();
}

function applyZoom() {
    const { box, zoom } = session;
    const W = window.innerWidth, H = window.innerHeight;
    // Zoomed in, the picture may not leave a gap at an edge it could cover.
    const w = box.width * zoom.scale, h = box.height * zoom.scale;
    const clampAxis = (value, size, view, rest) => (size <= view ? rest : Math.min(0, Math.max(view - size, value)));
    if (zoom.scale <= 1.001) { zoom.scale = 1; zoom.x = box.left; zoom.y = box.top; }
    else {
        zoom.x = clampAxis(zoom.x, w, W, (W - w) / 2);
        zoom.y = clampAxis(zoom.y, h, H, (H - h) / 2);
    }
    $('stage').style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
    sizePointer();
}

/** Two fingers spreading or closing: zooms about the point between them, and pans with it. */
function pinch(factor, cx, cy, dx, dy, first) {
    const zoom = session.zoom;
    if (first) zoom.startScale = zoom.scale;
    const next = Math.min(8, Math.max(1, zoom.startScale * factor));
    const k = next / zoom.scale;
    zoom.x = cx - (cx - zoom.x) * k + dx;
    zoom.y = cy - (cy - zoom.y) * k + dy;
    zoom.scale = next;
    applyZoom();
}

/** Zoomed in, the view follows the drawn pointer so it never leaves the screen. */
function followPointer(x, y) {
    const { box, zoom } = session;
    if (zoom.scale <= 1.001) return;
    const px = zoom.x + x * box.width * zoom.scale, py = zoom.y + y * box.height * zoom.scale;
    const margin = 48;
    const W = window.innerWidth, H = window.innerHeight;
    let moved = false;
    if (px < margin) { zoom.x += margin - px; moved = true; } else if (px > W - margin) { zoom.x -= px - (W - margin); moved = true; }
    if (py < margin) { zoom.y += margin - py; moved = true; } else if (py > H - margin) { zoom.y -= py - (H - margin); moved = true; }
    if (moved) applyZoom();
}

// MARK: The pointer

const ARROW = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 17 23"><path d="M1 1v17.5l4.2-3.9 2.9 6.7 2.6-1.1-2.9-6.6H13z" fill="#111" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>');

/** On a touch screen the Mac's pointer is drawn on the picture; with a mouse the real pointer wears its shape. */
function placePointer(x, y) {
    if (!touchDevice) return;
    const pointer = $('pointer');
    pointer.style.left = `${x * 100}%`;
    pointer.style.top = `${y * 100}%`;
    pointer.hidden = false;
}

function sizePointer() {
    if (!touchDevice) return;
    const shape = session.cursors.get(session.cursorId);
    const pointer = $('pointer');
    // Host points → this screen: as large as it would look on the Mac at this zoom, never tiny.
    const pointsWide = session.stream?.displayWidth || 1920;
    const k = Math.max(session.box.width / pointsWide, 0.75 / session.zoom.scale);
    const w = (shape?.width || 17) * k, h = (shape?.height || 23) * k;
    pointer.style.width = `${w}px`;
    pointer.style.height = `${h}px`;
    pointer.style.marginLeft = `${-(shape?.hotX || 1) * k}px`;
    pointer.style.marginTop = `${-(shape?.hotY || 1) * k}px`;
    const src = shape?.url || ARROW;
    if (pointer.src !== src) pointer.src = src;
}

function useCursor(cursorId) {
    if (cursorId === session.cursorId && session.cursors.has(cursorId)) return;
    const shape = session.cursors.get(cursorId);
    if (!shape) return;
    session.cursorId = cursorId;
    if (touchDevice) return sizePointer();
    // CSS cursors: the image at its real density, the hot spot in CSS pixels.
    const hx = Math.max(0, Math.min(Math.round(shape.hotX), Math.ceil(shape.width) - 1));
    const hy = Math.max(0, Math.min(Math.round(shape.hotY), Math.ceil(shape.height) - 1));
    $('surface').style.cursor = `image-set(url("${shape.url}") ${shape.scale}x) ${hx} ${hy}, default`;
}

async function addCursor(event) {
    let blob = new Blob([event.png], { type: 'image/png' });
    let scale = 2;
    try {
        const bitmap = await createImageBitmap(blob);
        scale = Math.max(1, bitmap.width / Math.max(1, event.width));
        // Browsers ignore cursor images above 128 px: larger shapes are drawn down to fit.
        if (bitmap.width > 128 || bitmap.height > 128) {
            const k = 128 / Math.max(bitmap.width, bitmap.height);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(bitmap.width * k);
            canvas.height = Math.round(bitmap.height * k);
            canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            scale = Math.max(1, canvas.width / Math.max(1, event.width));
        }
        bitmap.close();
    } catch (_) { /* an image this browser cannot read: the default pointer stays */ }
    const old = session.cursors.get(event.cursorId);
    if (old) URL.revokeObjectURL(old.url);
    session.cursors.set(event.cursorId, { url: URL.createObjectURL(blob), width: event.width, height: event.height, hotX: event.hotX, hotY: event.hotY, scale: Math.round(scale * 100) / 100 });
    if (session.pendingCursor === event.cursorId || session.cursorId === event.cursorId || session.cursorId === null) {
        session.cursorId = null;
        useCursor(event.cursorId);
    }
}

// MARK: Clipboard

/** Text copied on this device goes to the Mac when the page gets focus (a browser shows its text only then). */
async function pushClipboard() {
    if (state.phase !== 'session' || !prefs().clipboard || !navigator.clipboard?.readText || !document.hasFocus()) return;
    try {
        const text = await navigator.clipboard.readText();
        if (text && text !== session.clipboardSeen && text.length <= 1 << 20) {
            session.clipboardSeen = text;
            post({ t: 'clipboard', text });
        }
    } catch (_) { /* not allowed (yet): the browser asks the first time, or the person said no */ }
}

async function pullClipboard(text) {
    if (!prefs().clipboard || !navigator.clipboard?.writeText) return;
    session.clipboardSeen = text;
    try { await navigator.clipboard.writeText(text); } catch (_) { /* the page is not in front */ }
}

// MARK: Toolbar

function showToolbar(show) {
    const toolbar = $('toolbar');
    toolbar.hidden = !show;
    $('handle').setAttribute('aria-expanded', String(show));
    clearTimeout(session.toolbarTimer);
    if (!show) { $('keys-menu').hidden = true; $('tool-keys').setAttribute('aria-expanded', 'false'); }
}

function armToolbarHide() {
    clearTimeout(session.toolbarTimer);
    session.toolbarTimer = setTimeout(() => {
        if (!$('toolbar').matches(':hover') && !$('keys-menu').matches(':hover') && !$('toolbar').contains(document.activeElement)) showToolbar(false);
        else armToolbarHide();
    }, 3500);
}

$('handle').addEventListener('click', () => { const show = $('toolbar').hidden; showToolbar(show); if (show) armToolbarHide(); });
$('handle').addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') { showToolbar(true); armToolbarHide(); } });
$('surface').addEventListener('pointerdown', () => showToolbar(false));

$('tool-quality').addEventListener('change', (event) => {
    setPrefs({ quality: event.target.value });
    post({ t: 'stream', changes: { quality: event.target.value } });
    $('surface').focus();
});
$('tool-display').addEventListener('change', (event) => {
    post({ t: 'stream', changes: { displayId: Number(event.target.value) } });
    $('surface').focus();
});
$('tool-sound').addEventListener('click', () => {
    const on = !prefs().sound;
    setPrefs({ sound: on });
    $('tool-sound').setAttribute('aria-pressed', String(on));
    if (on) startAudio();
    post({ t: 'stream', changes: { audio: on } });
});
$('tool-keys').addEventListener('click', () => {
    const menu = $('keys-menu');
    menu.hidden = !menu.hidden;
    $('tool-keys').setAttribute('aria-expanded', String(!menu.hidden));
});
$('keys-menu').addEventListener('click', (event) => {
    const combo = event.target.closest('[data-combo]')?.dataset.combo;
    if (!combo) return;
    input.combo(combo.split(',').map(Number));
    showToolbar(false);
    $('surface').focus();
});
$('tool-keyboard').addEventListener('click', () => {
    showToolbar(false);
    $('keys-row').hidden = false;
    input.openKeyboard();
});
$('keys-row').addEventListener('pointerdown', (event) => event.preventDefault());   // keep the keyboard up
$('keys-row').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'keys-row-close') { $('keys-row').hidden = true; input.closeKeyboard(); }
    else if (button.dataset.sticky) input.toggleSticky(Number(button.dataset.sticky));
    else if (button.dataset.key) input.tap(Number(button.dataset.key));
});
$('tool-mode').addEventListener('click', () => {
    const mode = prefs().touchMode === 'trackpad' ? 'touch' : 'trackpad';
    setPrefs({ touchMode: mode });
    applyTouchMode();
});
$('tool-stats').addEventListener('click', () => {
    const on = !prefs().stats;
    setPrefs({ stats: on });
    $('tool-stats').setAttribute('aria-pressed', String(on));
    $('stats').hidden = !on;
});
$('tool-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    showToolbar(false);
    $('surface').focus();
});
$('tool-disconnect').addEventListener('click', cancel);

function applyTouchMode() {
    const mode = prefs().touchMode;
    input.setTouchMode(mode);
    $('tool-mode').textContent = mode === 'trackpad' ? 'Trackpad' : 'Touch';
    $('tool-mode').title = mode === 'trackpad' ? 'One finger moves the pointer. Tap to switch to touching the screen directly.' : 'A tap clicks where you touch. Tap to switch to trackpad.';
}

document.addEventListener('fullscreenchange', () => {
    const full = !!document.fullscreenElement;
    $('tool-fullscreen').textContent = full ? 'Exit full screen' : 'Full screen';
    // In full screen the browser can hand over Esc, ⌘/Ctrl shortcuts and the rest.
    if (full) navigator.keyboard?.lock?.().catch(() => {}); else navigator.keyboard?.unlock?.();
});

// MARK: Entering and leaving a session

function enterSession(event) {
    state.phase = 'session';
    setBusy('');
    closePassword();
    showNotice('');
    saveHost(state.target.fingerprint, event.host?.name || state.target.name);
    state.target.name = event.host?.name || state.target.name;
    navigator.storage?.persist?.().catch(() => {});     // keep the identity key: the Mac remembers it
    $('connect').hidden = true;
    $('session').hidden = false;
    $('host-name').textContent = state.target.name;
    $('banner').hidden = true;
    setDisplays(event.displays);
    const p = prefs();
    $('tool-quality').value = p.quality;
    $('tool-sound').setAttribute('aria-pressed', String(p.sound));
    $('tool-sound').hidden = !engineInfo?.sound || !audio.context;
    $('tool-stats').setAttribute('aria-pressed', String(p.stats));
    $('stats').hidden = !p.stats;
    $('tool-fullscreen').hidden = !document.documentElement.requestFullscreen;
    input.ctrlIsCommand = p.ctrlIsCommand && !localIsApple();
    applyTouchMode();
    input.setEnabled(true);
    $('surface').focus({ preventScroll: true });
    if (touchDevice) placePointer(0.5, 0.5);
    showToolbar(true);
    armToolbarHide();
    keepAwake();
    pushClipboard();
    document.title = `${state.target.name} — RexDesk`;
}

/** The screen stays on while the Mac is on it. One lock: a new one replaces the old. */
function keepAwake() {
    navigator.wakeLock?.request('screen').then((lock) => {
        session.wakeLock?.release?.().catch(() => {});
        if (state.phase === 'session') session.wakeLock = lock; else lock.release().catch(() => {});
    }).catch(() => {});
}

function leaveSession() {
    input.setEnabled(false);
    $('session').hidden = true;
    $('connect').hidden = false;
    $('keys-row').hidden = true;
    $('pointer').hidden = true;
    $('surface').style.cursor = '';
    showToolbar(false);
    session.stream = null;
    session.zoom = { scale: 1, x: 0, y: 0, startScale: 1 };
    for (const shape of session.cursors.values()) URL.revokeObjectURL(shape.url);
    session.cursors.clear();
    session.cursorId = null;
    session.wakeLock?.release?.().catch(() => {});
    session.wakeLock = null;
    if (document.fullscreenElement) document.exitFullscreen?.();
    document.title = 'RexDesk — connect to your Mac';
}

function setDisplays(displays) {
    session.displays = displays || [];
    const select = $('tool-display');
    select.hidden = session.displays.length < 2;
    select.replaceChildren(...session.displays.map((display) => {
        const option = document.createElement('option');
        option.value = display.id;
        option.textContent = display.name || `Display ${display.id}`;
        return option;
    }));
    if (session.stream) select.value = session.stream.displayId;
}

function renderStats(s) {
    const host = s.host || {};
    const lines = [
        `${s.width || '?'}×${s.height || '?'} ${s.codec === 'hevc444' ? 'HEVC 4:4:4' : (s.codec || '').toUpperCase()} · ${s.fps} fps`,
        `decode ${s.decodeMs.toFixed(1)} ms · round trip ${s.rttMs.toFixed(0)} ms · relay`,
        `${(s.kbps / 1000).toFixed(1)} Mbps in` + (host.targetKbps ? ` · target ${(host.targetKbps / 1000).toFixed(0)}` : '') + (host.encodeMs ? ` · encode ${host.encodeMs.toFixed(1)} ms` : ''),
    ];
    const extra = [];
    if (s.queue > 1) extra.push(`decoder queue ${s.queue}`);
    if (s.dropped) extra.push(`dropped ${s.dropped}`);
    if (audio.bufferedMs >= 0 && prefs().sound) extra.push(`sound ${audio.bufferedMs} ms`);
    if (extra.length) lines.push(extra.join(' · '));
    $('stats').textContent = lines.join('\n');
}

const ENDINGS = {
    replaced: 'Another device connected to this Mac, so this session ended.',
    decoder: 'This browser could not decode the video. A current Chrome or Edge can.',
};

const engineEvents = {
    ready(event) {
        engineInfo = event;
        $('my-fingerprint').textContent = event.shortFingerprint;
        $('set-fingerprint').textContent = event.shortFingerprint;
        if (event.codecs.length === 0) {
            showNotice('This browser cannot decode the video here (it has no WebCodecs video decoder). A current Chrome, Edge or Safari can.');
            $('connect-button').disabled = true;
            return;
        }
        refreshOnline();
        const wanted = params.get('host') || decodeURIComponent(location.hash.slice(1));
        if (wanted) $('host-id').value = wanted;
        // On this machine only, for testing browsers nothing can drive: `&auto` connects at once.
        if (local && wanted && params.has('auto')) lookupAndConnect(wanted);
    },
    lookup(event) {
        if (event.id !== state.lookupId || state.phase !== 'connecting') return;
        if (event.error) return backToConnect(event.error);
        connectTo(event.fingerprint, event.name);
    },
    online(event) {
        if (event.unreachable) return;
        state.online.set(event.fingerprint, event.online);
        if (state.phase !== 'session') renderSaved();
    },
    progress(event) {
        if (event.id === state.connectId && state.phase === 'connecting') setBusy(event.text);
    },
    challenge(event) {
        if (event.id !== state.connectId || state.phase === 'idle') return;
        askPassword(event.methods);
    },
    authenticated(event) {
        if (event.id !== state.connectId || state.phase === 'idle') return;
        if (state.phase === 'session') {
            // Back after a dropped connection: the view is already up.
            $('banner').hidden = true;
            setBusy('');
            closePassword();
            setDisplays(event.displays);
            return;
        }
        enterSession(event);
    },
    started(event) {
        session.stream = event.stream;
        input.displayWidth = event.stream.displayWidth || 1920;
        $('tool-display').value = event.stream.displayId;
        $('banner').hidden = true;
        sizePointer();
    },
    size(event) {
        session.size = { width: event.width, height: event.height };
        layout();
    },
    displays(event) {
        setDisplays(event.displays);
    },
    stats(event) {
        if (!$('stats').hidden) renderStats(event);
    },
    cursorShape(event) {
        addCursor(event);
    },
    cursorPosition(event) {
        session.pendingCursor = event.cursorId;
        useCursor(event.cursorId);
        const onPicture = event.visible && event.x >= 0 && event.x <= 1 && event.y >= 0 && event.y <= 1;
        if (touchDevice && onPicture && input.hostCursor(event.x, event.y)) placePointer(event.x, event.y);
    },
    clipboard(event) {
        pullClipboard(event.text);
    },
    reconnecting(event) {
        if (event.id !== state.connectId) return;
        const banner = $('banner');
        banner.textContent = `Connection lost. Reconnecting… (${event.attempt})`;
        banner.hidden = false;
        if (state.phase === 'connecting') setBusy('Reconnecting…');
    },
    ended(event) {
        if (event.id !== state.connectId || state.phase === 'idle') return;
        // A wrong password ends the connection (§5.2): connect again and ask again.
        if (event.kind === 'auth' && event.error === 'bad_password' && state.target) {
            const target = state.target;
            connectTo(target.fingerprint, target.name);
            state.passwordError = 'That password was not right.';
            return;
        }
        let message = ENDINGS[event.kind] || event.message || 'The session ended.';
        if (event.kind === 'auth' && event.error === 'rate_limited') {
            message = `Too many wrong passwords. Try again in ${Math.max(1, Math.ceil((event.retryAfterSec || 60) / 60))} min.`;
        } else if (event.kind === 'auth' && event.error === 'denied') {
            message = 'The request was declined at the Mac.';
        } else if (event.kind === 'auth' && event.error === 'timeout') {
            message = 'Nobody at the Mac answered the request.';
        }
        backToConnect(message);
    },
    log(event) {
        (event.level === 'error' ? console.error : console.warn)('[rexdesk]', event.text);
    },
};

// MARK: Wiring

$('connect-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = $('host-id').value.trim();
    if (!text) return $('host-id').focus();
    startAudio();
    lookupAndConnect(text);
});
$('busy-cancel').addEventListener('click', cancel);

$('open-settings').addEventListener('click', () => {
    const p = prefs();
    $('set-name').value = p.deviceName;
    $('set-name').placeholder = defaultDeviceName();
    $('set-service').value = p.service;
    $('set-ctrl').checked = p.ctrlIsCommand;
    $('set-ctrl').closest('label').hidden = localIsApple();
    $('set-clipboard').checked = p.clipboard;
    $('settings-error').hidden = true;
    $('settings-dialog').showModal();
});
$('settings-cancel').addEventListener('click', () => $('settings-dialog').close());
$('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const service = $('set-service').value.trim();
    const normalized = service ? normalizeService(service) : '';
    const insecure = normalized && normalized.startsWith('ws://') && !local;
    if (normalized === null || insecure) {
        const error = $('settings-error');
        error.textContent = insecure ? 'From this page the service has to be a wss:// address.' : 'That is not a service address. It looks like wss://rexdesk.rexy.win.';
        error.hidden = false;
        return;
    }
    setPrefs({ deviceName: $('set-name').value.trim(), service: normalized === DEFAULT_SERVICE ? '' : normalized,
        ctrlIsCommand: $('set-ctrl').checked, clipboard: $('set-clipboard').checked });
    post({ t: 'config', service: serviceUrl(), deviceName: deviceName() });
    $('settings-dialog').close();
    state.online.clear();
    renderSaved();
    refreshOnline();
});

window.addEventListener('resize', () => { if (state.phase === 'session') { layout(); requestTarget(); } });
window.addEventListener('focus', pushClipboard);
document.addEventListener('visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden';
    if (state.phase === 'idle') { if (!hidden) refreshOnline(); return; }
    // Nobody is looking: the Mac stops capturing, and resumes with a fresh keyframe.
    post({ t: 'pause', paused: hidden });
    if (state.phase !== 'session') return;
    if (hidden) input.releaseAll();
    else {
        keepAwake();
        audio.context?.resume();
        pushClipboard();
    }
});
window.addEventListener('pagehide', disconnect);
// ⌘W, ⌘R and friends are usually meant for the Mac: closing the tab mid-session asks first.
window.addEventListener('beforeunload', (event) => { if (state.phase === 'session') event.preventDefault(); });

$('version').textContent = `Version ${APP_VERSION}`;
document.documentElement.classList.toggle('touch', touchDevice);
renderSaved();
if (window.top !== window.self) {
    // Framed by another page, a click meant for that page could land here. It does not run.
    showNotice('RexDesk does not run inside another page. Open it in a tab of its own.');
    $('connect-button').disabled = true;
    $('saved').hidden = true;
} else if (!window.isSecureContext || !crypto.subtle) {
    showNotice('This page has to be opened over https for its encryption to work.');
    $('connect-button').disabled = true;
} else {
    startEngine().catch((error) => showNotice(`RexDesk could not start (${error.message}).`));
}
