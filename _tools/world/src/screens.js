// What the laptop at the outpost shows: four made-up screens, one for each Mac
// app on the page, painted once into a 2 x 2 sheet. Nothing here is a screenshot;
// they are drawn so they read from across a clearing.

const W = 800, H = 500;
const FONT = '-apple-system, "SF Pro Display", "Inter", "IBM Plex Sans", "Segoe UI", system-ui, sans-serif';
const MONO = '"SF Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace';

const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
const fillRR = (c, x, y, w, h, r, fill) => { rr(c, x, y, w, h, r); c.fillStyle = fill; c.fill(); };
const text = (c, s, x, y, size, fill, weight = 600, font = FONT, align = 'left') => { c.font = `${weight} ${size}px ${font}`; c.fillStyle = fill; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(s, x, y); };
const ring = (c, x, y, r, w, frac, colour, track = '#ffffff18') => {
    c.lineWidth = w; c.lineCap = 'round';
    c.strokeStyle = track; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.stroke();
    c.strokeStyle = colour; c.beginPath(); c.arc(x, y, r, -1.5708, -1.5708 + 6.2832 * frac); c.stroke();
};
const spark = (c, x, y, w, h, seed, colour, fill = true) => {
    const n = 26, v = []; let s = seed * 9301 + 49297;
    for (let i = 0; i < n; i++) { s = (s * 9301 + 49297) % 233280; v.push(0.25 + 0.6 * (s / 233280) * (0.6 + 0.4 * Math.sin(i * 0.5 + seed))); }
    c.beginPath(); v.forEach((q, i) => { const px = x + (i / (n - 1)) * w, py = y + h - q * h; if (i) c.lineTo(px, py); else c.moveTo(px, py); });
    c.strokeStyle = colour; c.lineWidth = 3; c.lineJoin = 'round'; c.stroke();
    if (fill) { c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.globalAlpha = 0.16; c.fillStyle = colour; c.fill(); c.globalAlpha = 1; }
};

function desktop(c, name, apps, icons) {
    // wallpaper: the lagoon at dusk
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#12343b'); g.addColorStop(0.55, '#1f5a52'); g.addColorStop(1, '#d98a4a');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = '#00000030'; c.beginPath(); c.moveTo(0, H); c.lineTo(0, 330); c.lineTo(150, 250); c.lineTo(260, 320); c.lineTo(420, 215); c.lineTo(560, 310); c.lineTo(700, 260); c.lineTo(W, 330); c.lineTo(W, H); c.fill();
    // menu bar
    c.fillStyle = '#0b1113cc'; c.fillRect(0, 0, W, 30);
    fillRR(c, 12, 7, 16, 16, 4, '#9be36f');
    text(c, name, 38, 21, 15, '#fff', 700);
    let x = 38 + c.measureText(name).width + 18;
    for (const m of ['File', 'Edit', 'View', 'Window', 'Help']) { text(c, m, x, 21, 14, '#ffffffc8', 500); x += c.measureText(m).width + 16; }
    text(c, 'Fri 9:41', W - 14, 21, 14, '#ffffffd8', 600, FONT, 'right');
    // dock
    const n = Math.min(7, Math.max(4, apps.length)), dw = n * 46 + 14, dx = (W - dw) / 2;
    fillRR(c, dx, H - 56, dw, 48, 14, '#ffffff2c');
    for (let i = 0; i < n; i++) {
        const ix = dx + 10 + i * 46, iy = H - 51, a = apps[i];
        if (a && icons[i]) { c.save(); rr(c, ix, iy, 38, 38, 9); c.clip(); c.drawImage(icons[i], ix, iy, 38, 38); c.restore(); } else fillRR(c, ix, iy, 38, 38, 9, (a && a.tint) || '#8fb7a0');
    }
}

function windowFrame(c, x, y, w, h, title) {
    c.shadowColor = '#000000a0'; c.shadowBlur = 34; c.shadowOffsetY = 12;
    fillRR(c, x, y, w, h, 14, '#191c21'); c.shadowColor = 'transparent';
    c.save(); rr(c, x, y, w, h, 14); c.clip(); c.fillStyle = '#262a31'; c.fillRect(x, y, w, 38); c.restore();
    for (const [i, col] of [[0, '#ff5f57'], [1, '#febc2e'], [2, '#28c840']]) { c.fillStyle = col; c.beginPath(); c.arc(x + 22 + i * 22, y + 19, 7, 0, 6.2832); c.fill(); }
    text(c, title, x + w / 2, y + 25, 16, '#e9edf2', 700, FONT, 'center');
}

function rexBoing(c, apps, icons) {
    desktop(c, 'Rex Boing', apps, icons);
    const x = 46, y = 46, w = 708, h = 386; windowFrame(c, x, y, w, h, 'Rex Boing — this Mac');
    const tile = (tx, ty, tw, th, label) => { fillRR(c, tx, ty, tw, th, 12, '#22262d'); text(c, label, tx + 16, ty + 28, 15, '#9aa4b1', 600); };
    tile(x + 18, y + 54, 216, 150, 'PROCESSOR'); text(c, '37%', x + 34, y + 142, 54, '#9be36f', 800); spark(c, x + 34, y + 150, 184, 40, 3, '#9be36f');
    tile(x + 246, y + 54, 216, 150, 'GPU'); text(c, '22%', x + 262, y + 142, 54, '#6fd3ff', 800); spark(c, x + 262, y + 150, 184, 40, 8, '#6fd3ff');
    tile(x + 474, y + 54, 216, 150, 'MEMORY'); ring(c, x + 582, y + 140, 44, 13, 0.61, '#ffb84d'); text(c, '61%', x + 582, y + 150, 26, '#fff', 800, FONT, 'center');
    tile(x + 18, y + 216, 216, 150, 'THERMALS'); text(c, '54°', x + 34, y + 306, 54, '#ff8f6b', 800); fillRR(c, x + 34, y + 326, 184, 12, 6, '#ffffff14'); fillRR(c, x + 34, y + 326, 104, 12, 6, '#ff8f6b');
    tile(x + 246, y + 216, 216, 150, 'NETWORK'); text(c, '↓ 12.4 MB/s', x + 262, y + 286, 26, '#fff', 700); spark(c, x + 262, y + 300, 184, 50, 5, '#c59bff');
    tile(x + 474, y + 216, 216, 150, 'BUSIEST'); let ry = y + 272; for (const [n, v] of [['Xcode', 0.82], ['Safari', 0.5], ['Simulator', 0.34]]) { text(c, n, x + 490, ry, 17, '#e9edf2', 600); fillRR(c, x + 590, ry - 12, 84, 10, 5, '#ffffff14'); fillRR(c, x + 590, ry - 12, 84 * v, 10, 5, '#9be36f'); ry += 32; }
}

function appManager(c, apps, icons) {
    desktop(c, 'App Manager', apps, icons);
    const x = 46, y = 46, w = 708, h = 386; windowFrame(c, x, y, w, h, 'App Manager');
    c.fillStyle = '#1f2329'; c.fillRect(x, y + 38, 210, h - 38 - 14); fillRR(c, x, y + h - 30, 210, 30, 14, '#1f2329');
    const names = apps.length ? apps : [{ id: 'app' }, { id: 'app' }, { id: 'app' }, { id: 'app' }, { id: 'app' }, { id: 'app' }];
    for (let i = 0; i < Math.min(7, names.length); i++) {
        const iy = y + 52 + i * 46;
        if (i === 1) fillRR(c, x + 8, iy - 4, 194, 42, 9, '#3a6df033');
        if (icons[i]) { c.save(); rr(c, x + 16, iy, 34, 34, 8); c.clip(); c.drawImage(icons[i], x + 16, iy, 34, 34); c.restore(); } else fillRR(c, x + 16, iy, 34, 34, 8, names[i].tint || '#8fb7a0');
        const label = String(names[i].id || 'app').replace(/_/g, ' '); text(c, label.length > 15 ? label.slice(0, 14) + '…' : label, x + 60, iy + 23, 15, i === 1 ? '#fff' : '#c7cfd9', 600);
    }
    const mx = x + 228;
    text(c, 'Release 3.2.0', mx, y + 78, 26, '#fff', 800); fillRR(c, mx + 200, y + 56, 136, 30, 15, '#28c84026'); text(c, 'Ready for sale', mx + 268, y + 77, 14, '#5fe07f', 700, FONT, 'center');
    // store screenshots
    for (let i = 0; i < 4; i++) { const sx = mx + i * 78, g = c.createLinearGradient(sx, y + 100, sx, y + 236); g.addColorStop(0, ['#ff9b6b', '#6fd3ff', '#c59bff', '#9be36f'][i]); g.addColorStop(1, '#1b2028'); fillRR(c, sx, y + 100, 66, 136, 10, g); fillRR(c, sx + 10, y + 114, 46, 8, 4, '#ffffffb0'); fillRR(c, sx + 10, y + 128, 30, 6, 3, '#ffffff70'); }
    // revenue
    fillRR(c, mx + 322, y + 100, 140, 136, 12, '#22262d'); text(c, 'REVENUE', mx + 336, y + 124, 13, '#9aa4b1', 600); text(c, '+18%', mx + 336, y + 164, 30, '#5fe07f', 800); spark(c, mx + 336, y + 176, 112, 46, 11, '#5fe07f');
    // deploy log
    fillRR(c, mx, y + 250, 462, 118, 10, '#0f1215');
    let ly = y + 276; for (const [s, col] of [['$ fastlane deploy --all', '#e9edf2'], ['✓ build 412 uploaded', '#5fe07f'], ['✓ metadata + screenshots synced', '#5fe07f'], ['→ waiting for review…', '#ffb84d']]) { text(c, s, mx + 14, ly, 16, col, 500, MONO); ly += 25; }
}

function projectManager(c, apps, icons) {
    desktop(c, 'Project Manager', apps, icons);
    const x = 46, y = 46, w = 708, h = 386; windowFrame(c, x, y, w, h, 'Project Manager');
    const stat = (sx, n, label, col) => { fillRR(c, sx, y + 52, 216, 72, 12, '#22262d'); text(c, n, sx + 16, y + 102, 40, col, 800); text(c, label, sx + 76, y + 98, 16, '#b3bcc8', 600); };
    stat(x + 18, '14', 'projects', '#fff'); stat(x + 246, '6', 'running', '#5fe07f'); stat(x + 474, '2', 'duplicates', '#ffb84d');
    const rows = [['games-portal', 'running', ':3000', 'clean', '#5fe07f'], ['island', 'running', ':8123', '3 changed', '#5fe07f'], ['admin-hub', 'running', ':8877', 'clean', '#5fe07f'], ['rex-boing', 'idle', '—', 'ahead 2', '#6b7480'], ['typing-test', 'duplicate', ':5173 ×2', 'clean', '#ffb84d'], ['otel-lens', 'running', ':4318', 'clean', '#5fe07f']];
    rows.forEach((r, i) => {
        const ry = y + 138 + i * 39;
        if (i % 2 === 0) fillRR(c, x + 14, ry, w - 28, 36, 8, '#ffffff08');
        c.fillStyle = r[4]; c.beginPath(); c.arc(x + 34, ry + 18, 7, 0, 6.2832); c.fill();
        text(c, r[0], x + 54, ry + 24, 17, '#e9edf2', 700); text(c, r[1], x + 232, ry + 24, 15, r[4], 600); text(c, r[2], x + 344, ry + 24, 15, '#b3bcc8', 500, MONO);
        fillRR(c, x + 456, ry + 6, 96, 24, 12, r[3] === 'clean' ? '#28c84022' : '#3a6df030'); text(c, r[3], x + 504, ry + 23, 13, r[3] === 'clean' ? '#5fe07f' : '#8fb4ff', 700, FONT, 'center');
        fillRR(c, x + 574, ry + 5, 54, 26, 8, '#3a6df0'); text(c, 'Build', x + 601, ry + 23, 13, '#fff', 700, FONT, 'center');
        fillRR(c, x + 636, ry + 5, 56, 26, 8, '#ffffff16'); text(c, 'Install', x + 664, ry + 23, 13, '#e9edf2', 600, FONT, 'center');
    });
}

function usageTracker(c, apps, icons) {
    desktop(c, 'AI Usage Tracker', apps, icons);
    const x = 150, y = 46, w = 500, h = 386; windowFrame(c, x, y, w, h, 'AI Usage');
    const dial = (cx, name, frac, col, left) => {
        ring(c, cx, y + 148, 70, 20, frac, col);
        // the slice used since the last refresh, in amber
        c.strokeStyle = '#ffb84d'; c.lineWidth = 20; c.lineCap = 'butt'; c.beginPath(); c.arc(cx, y + 148, 70, -1.5708 + 6.2832 * (frac - 0.07), -1.5708 + 6.2832 * frac); c.stroke();
        text(c, Math.round((1 - frac) * 100) + '%', cx, y + 152, 36, '#fff', 800, FONT, 'center'); text(c, 'left', cx, y + 176, 15, '#9aa4b1', 600, FONT, 'center');
        text(c, name, cx, y + 256, 22, '#fff', 800, FONT, 'center'); text(c, left, cx, y + 280, 14, '#9aa4b1', 500, FONT, 'center');
    };
    dial(x + 136, 'Claude', 0.38, '#5fc9b5', 'resets in 2 h 14 m'); dial(x + 364, 'Codex', 0.71, '#ff7a59', 'resets in 41 m');
    let by = y + 306; for (const [n, v, col] of [['5-hour window', 0.38, '#5fc9b5'], ['Weekly', 0.56, '#ffb84d']]) { text(c, n, x + 28, by + 13, 15, '#c7cfd9', 600); fillRR(c, x + 170, by, 300, 14, 7, '#ffffff14'); fillRR(c, x + 170, by, 300 * v, 14, 7, col); by += 32; }
}

// Paints all four into `canvas` (2 x 2 cells of 800 x 500). Call again when icons arrive.
export function paintScreens(canvas, apps, icons) {
    canvas.width = W * 2; canvas.height = H * 2;
    const c = canvas.getContext('2d');
    [rexBoing, appManager, projectManager, usageTracker].forEach((f, i) => {
        c.save(); c.translate((i % 2) * W, Math.floor(i / 2) * H); c.beginPath(); c.rect(0, 0, W, H); c.clip();
        f(c, apps, icons); c.restore();
    });
}

// the keyboard deck: black keys in a well, a wide trackpad below
export function paintKeys(canvas) {
    canvas.width = 1024; canvas.height = 640;
    const c = canvas.getContext('2d');
    c.fillStyle = '#b9bcc2'; c.fillRect(0, 0, 1024, 640);
    fillRR(c, 44, 30, 936, 330, 14, '#101114');
    const rows = [14, 14, 13, 12, 11];
    rows.forEach((n, r) => { const kw = (916 - (n - 1) * 8) / n; for (let i = 0; i < n; i++) fillRR(c, 54 + i * (kw + 8), 40 + r * 54, kw, 46, 7, '#1b1c20'); });
    for (const [kx, kw] of [[54, 60], [122, 60], [190, 60], [258, 76], [342, 300], [650, 76], [734, 60]]) fillRR(c, kx, 310, kw, 42, 7, '#1b1c20');
    for (const [kx, ky] of [[802, 332], [866, 332], [930, 332], [866, 310]]) fillRR(c, kx, ky, 46, 20, 5, '#1b1c20');
    // a faint glow under the keys
    c.globalAlpha = 0.5; c.strokeStyle = '#cfe6ff'; c.lineWidth = 1;
    rows.forEach((n, r) => { const kw = (916 - (n - 1) * 8) / n; for (let i = 0; i < n; i++) { rr(c, 54 + i * (kw + 8), 40 + r * 54, kw, 46, 7); c.stroke(); } });
    c.globalAlpha = 1;
    fillRR(c, 322, 396, 380, 218, 16, '#aeb1b7'); c.strokeStyle = '#8f9298'; c.lineWidth = 2; rr(c, 322, 396, 380, 218, 16); c.stroke();
}

export const SCREEN = { cols: 2, rows: 2, count: 4, w: W, h: H };
