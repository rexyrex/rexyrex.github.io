// Plants. Late Cretaceous: conifers, broadleaf trees, palms, tree ferns, cycads
// and ferns where grass would be today (grass had barely appeared).
//
// Foliage is drawn once into an atlas with the 2D canvas, then every plant is a
// handful of textured cards and tubes, instanced by the thousand. Trees cover
// the whole island in two levels of detail; the dense understorey is only grown
// where a camera will stand.
import * as THREE from 'three/webgpu';
import {
    Fn, attribute, uniform, texture, vec2, vec3, vec4, float, mix, smoothstep, max, min, abs, clamp, normalize, dot, pow, sin, cos, length, fract, log2,
    positionLocal, normalLocal, positionWorld, cameraPosition, cameraViewMatrix, time, uv, saturate, fwidth,
} from 'three/tsl';
import { mulberry32, hash2, clamp as cl, lerp, smoothstep as sstep, fbm2, perlin2 } from './noise.js';
import { WORLD } from './island.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---- atlas ---------------------------------------------------------------------
const AT = 2048;
const SPR = {
    fern: [0, 0, 384, 1024], palm: [384, 0, 384, 1024], needle: [768, 0, 512, 1024], leaf: [1280, 0, 768, 768],
    tuft: [0, 1024, 512, 512], reed: [512, 1024, 256, 1024], bark: [768, 1024, 256, 1024], big: [1024, 1024, 512, 512], crown: [1024, 1536, 512, 512],
    pine: [1536, 1024, 512, 1024], cone: [1280, 768, 768, 256], moss: [0, 1536, 512, 512],
};
const rectUV = (name) => { const [x, y, w, h] = SPR[name]; return [x / AT, y / AT, w / AT, h / AT]; };

function paintAtlas() {
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = AT; return c; };
    const colC = mk(), maskC = mk();
    const c = colC.getContext('2d'), m = maskC.getContext('2d');
    c.fillStyle = '#35501f'; c.fillRect(0, 0, AT, AT);         // colour under the mask: no dark fringes in the mips
    m.fillStyle = '#000'; m.fillRect(0, 0, AT, AT);
    const rnd = mulberry32(77);
    const R = (a, b) => a + (b - a) * rnd();

    // a lanceolate blade from (x,y) along angle a
    const blade = (x, y, a, len, wid, fill, rib) => {
        const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
        const mx = x + dx * len * 0.45, my = y + dy * len * 0.45, ex = x + dx * len, ey = y + dy * len;
        for (const k of [c, m]) {
            k.beginPath(); k.moveTo(x, y);
            k.quadraticCurveTo(mx + nx * wid, my + ny * wid, ex, ey);
            k.quadraticCurveTo(mx - nx * wid, my - ny * wid, x, y);
            k.fillStyle = k === c ? fill : '#fff'; k.fill();
        }
        if (rib) { c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.strokeStyle = rib; c.lineWidth = Math.max(1, wid * 0.14); c.stroke(); }
    };
    const stroke = (pts, w, color) => {
        for (const k of [c, m]) {
            k.beginPath(); k.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) k.lineTo(pts[i][0], pts[i][1]);
            k.strokeStyle = k === c ? color : '#fff'; k.lineWidth = w; k.lineCap = 'round'; k.lineJoin = 'round'; k.stroke();
        }
    };
    const hsl = (h, s, l) => `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
    // a closed outline, filled: pts on the left edge bottom-to-top, mirrored for the right
    const body = (cx, pts, fill) => { for (const k of [c, m]) { k.beginPath(); k.moveTo(cx, pts[0][1]); for (const [dx, y] of pts) k.lineTo(cx - dx, y); for (let i = pts.length - 1; i >= 0; i--) k.lineTo(cx + pts[i][0], pts[i][1]); k.closePath(); k.fillStyle = k === c ? fill : '#fff'; k.fill(); } };
    const clip = (name, fn) => { const [x, y, w, h] = SPR[name]; for (const k of [c, m]) { k.save(); k.beginPath(); k.rect(x, y, w, h); k.clip(); k.translate(x, y); } fn(w, h); for (const k of [c, m]) k.restore(); };

    // fern frond: twice pinnate, widest a third of the way up
    clip('fern', (w, h) => {
        const cx = w / 2, N = 34;
        // a filled silhouette under the pinnae: only the outline is cut out (fine see-through detail turns into a dotted screen far off)
        { const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([w * 0.47 * 0.42 * Math.pow(Math.sin(Math.PI * Math.pow(0.06 + 0.94 * t, 0.62)), 0.85), h - 30 - t * (h - 60) - 18]); } body(cx, pts, '#3a5a26'); }
        stroke([[cx, h - 6], [cx, 14]], 5, '#3f4a22');
        for (let i = 0; i < N; i++) {
            const t = i / (N - 1), y = h - 30 - t * (h - 60);
            const prof = Math.pow(Math.sin(Math.PI * Math.pow(0.06 + 0.94 * t, 0.62)), 0.85);
            const len = (w * 0.47) * prof * R(0.92, 1.04);
            for (const side of [-1, 1]) {
                const a0 = -Math.PI / 2 + side * (1.12 - 0.35 * t) + R(-0.05, 0.05);
                const ex = cx + Math.cos(a0) * len, ey = y + Math.sin(a0) * len;
                stroke([[cx, y], [ex, ey]], 2.2, '#465224');
                const n = Math.max(3, Math.round(len / 9));
                for (let j = 1; j <= n; j++) {
                    const u = j / n, px = cx + (ex - cx) * u, py = y + (ey - y) * u;
                    const pl = 15 * Math.sin(Math.PI * Math.pow(u, 0.7)) * (0.6 + 0.4 * prof) + 3;
                    const g = hsl(R(84, 104), R(42, 56), R(24, 36) - 8 * (1 - u));
                    blade(px, py, a0 + 1.15, pl, 3.4, g); blade(px, py, a0 - 1.15, pl, 3.4, g);
                }
            }
        }
    });

    // cycad / palm frond: stiff, narrow leaflets, darker and bluer
    clip('palm', (w, h) => {
        const cx = w / 2, N = 46;
        { const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([w * 0.48 * 0.4 * Math.pow(Math.sin(Math.PI * Math.pow(0.1 + 0.9 * t, 0.75)), 0.6), h - 26 - t * (h - 50) - 30 * (1 - t)]); } body(cx, pts, '#2c4420'); }
        stroke([[cx, h - 4], [cx, 10]], 8, '#4a4b26');
        for (let i = 0; i < N; i++) {
            const t = i / (N - 1), y = h - 26 - t * (h - 50);
            const prof = Math.pow(Math.sin(Math.PI * Math.pow(0.1 + 0.9 * t, 0.75)), 0.6);
            for (const side of [-1, 1]) {
                const a = -Math.PI / 2 + side * (1.05 - 0.5 * t) + R(-0.06, 0.06);
                blade(cx, y, a, w * 0.48 * prof * R(0.9, 1.05), 7.5, hsl(R(96, 118), R(34, 46), R(19, 29)), 'hsla(80 40% 46% / 0.5)');
            }
        }
    });

    // conifer bough seen from above: forward-swept twigs, densely needled, widest past the middle
    clip('needle', (w, h) => {
        const cx = w / 2;
        { const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([w * 0.56 * 0.6 * Math.pow(Math.sin(Math.PI * Math.pow(0.12 + 0.88 * t, 1.25)), 0.7) * 0.72, h - 30 - t * (h - 70) - 60 * (1 - t)]); } body(cx, pts, '#17251a'); }
        stroke([[cx, h - 4], [cx, 26]], 7, '#3a2f20');
        const needles = (x0, y0, a, len, shade) => {
            const n = Math.max(2, Math.round(len / 3.4));
            for (let j = 0; j <= n; j++) {
                const u = j / n, px = x0 + Math.cos(a) * len * u, py = y0 + Math.sin(a) * len * u;
                const nl = 11 * (1 - 0.4 * u) + 2;
                const g = hsl(R(112, 140), R(24, 38), R(12, 20) + shade + 6 * u);
                blade(px, py, a + 0.95, nl, 1.9, g); blade(px, py, a - 0.95, nl, 1.9, g);
            }
        };
        const N = 21;
        for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
            const t = (i + (pass ? 0.5 : 0)) / N, y = h - 30 - t * (h - 70);
            const prof = Math.pow(Math.sin(Math.PI * Math.pow(0.12 + 0.88 * t, 1.25)), 0.7);
            const len = w * 0.56 * prof * R(0.8, 1.08);
            for (const side of [-1, 1]) {
                const a = -Math.PI / 2 + side * R(0.6, 0.86);
                const ex = cx + Math.cos(a) * len, ey = y + Math.sin(a) * len;
                stroke([[cx, y], [ex, ey]], 2.6, '#352b1d');
                needles(cx, y, a, len, pass * 5);
                for (const q of [0.3, 0.52, 0.74]) { if (len * (1 - q) < 26) continue; const bx = cx + (ex - cx) * q, by = y + (ey - y) * q; needles(bx, by, a - side * 0.6, len * 0.36 * (1 - q * 0.4), pass * 5 + 2); needles(bx, by, a + side * 0.5, len * 0.22, pass * 5 + 2); }
            }
        }
        needles(cx, h - 30, -Math.PI / 2, h - 60, 4);
    });

    // broadleaf twig: ovate leaves with a midrib
    const twig = (name, n, lenK, hue) => clip(name, (w, h) => {
        stroke([[w * 0.5, h - 4], [w * 0.48, h * 0.55], [w * 0.52, h * 0.16]], 7, '#463a28');
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1), y = h * (0.94 - 0.82 * t), x = w * (0.5 + 0.02 * Math.sin(t * 5));
            const side = i % 2 ? 1 : -1, a = -Math.PI / 2 + side * R(0.75, 1.25) * (1 - 0.3 * t);
            const L = w * lenK * R(0.8, 1.1) * (0.75 + 0.25 * Math.sin(Math.PI * t));
            const l = R(24, 36);
            blade(x, y, a, L, L * 0.27, hsl(R(hue - 12, hue + 12), R(36, 52), l), hsl(hue - 14, 40, l + 18));
            // side veins
            for (let v = 0.25; v < 0.9; v += 0.16) { const px = x + Math.cos(a) * L * v, py = y + Math.sin(a) * L * v; c.strokeStyle = 'hsla(80 45% 52% / 0.3)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a + 0.9) * L * 0.13, py + Math.sin(a + 0.9) * L * 0.13); c.moveTo(px, py); c.lineTo(px + Math.cos(a - 0.9) * L * 0.13, py + Math.sin(a - 0.9) * L * 0.13); c.stroke(); }
        }
        blade(w * 0.52, h * 0.17, -Math.PI / 2, w * lenK, w * lenK * 0.27, hsl(hue, 44, 31), hsl(hue - 14, 40, 48));
    });
    // a clump of foliage seen from outside the crown: three layers, darkest first
    clip('leaf', (w, h) => {
        const nodes = []; for (let i = 0; i < 7; i++) { const a = R(0, 6.283), r = Math.sqrt(rnd()) * w * 0.24; nodes.push([w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r]); }
        for (let layer = 0; layer < 3; layer++) {
            const n = [300, 340, 240][layer];
            for (let i = 0; i < n; i++) {
                const nd = nodes[i % nodes.length];
                const a = R(0, 6.283), L = w * R(0.032, 0.055), d = R(0, w * 0.36) * (0.6 + 0.2 * layer);
                let x = nd[0] + Math.cos(a) * d, y = nd[1] + Math.sin(a) * d;
                const rr = Math.hypot(x - w / 2, y - h / 2); if (rr > w * 0.42) { x = w / 2 + (x - w / 2) * (w * 0.42 / rr); y = h / 2 + (y - h / 2) * (w * 0.42 / rr); }
                const l = [12, 19, 26][layer] + R(-4, 5);
                blade(x, y, a + R(-0.5, 0.5), L, L * 0.36, hsl(R(82, 116), R(26, 40), l));
            }
        }
    });

    // a whole araucaria from the side, for trees too far away to build from boughs
    clip('pine', (w, h) => {
        const cx = w / 2;
        stroke([[cx, h - 2], [cx, h * 0.03]], 9, '#2e261b');
        const T = 20;
        for (let pass = 0; pass < 2; pass++) for (let i = 0; i < T; i++) {
            const t = i / (T - 1), y = h * (0.8 - 0.77 * Math.pow(t, 0.92));
            const half = w * 0.47 * Math.pow(1 - t, 0.72) + 10;
            for (const side of [-1, 1]) for (let k = 0; k < 13; k++) {
                const a = (side > 0 ? 0 : Math.PI) + side * R(-0.12, 0.5 - 0.6 * t), L = half * R(0.45, 1.02);
                const l = (pass ? R(11, 18) : R(6, 10)) + 4 * t;
                blade(cx + side * R(0, 6), y + R(-6, 10) - pass * 5, a, L, R(5, 9), hsl(R(112, 138), R(22, 34), l));
            }
        }
    });

    // big simple leaf (a magnolia / fig relative), for the understorey
    clip('big', (w, h) => {
        stroke([[w / 2, h - 4], [w / 2, h * 0.72]], 9, '#4a4a26');
        for (const k of [c, m]) {
            k.beginPath(); k.moveTo(w / 2, h * 0.76);
            k.bezierCurveTo(w * 0.2, h * 0.62, w * 0.24, h * 0.16, w / 2, 12);
            k.bezierCurveTo(w * 0.76, h * 0.16, w * 0.8, h * 0.62, w / 2, h * 0.76);
            if (k === c) { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#2f4a1c'); g.addColorStop(0.5, '#47692a'); g.addColorStop(1, '#2c4519'); k.fillStyle = g; } else k.fillStyle = '#fff';
            k.fill();
        }
        c.strokeStyle = 'hsla(78 46% 56% / 0.75)'; c.lineWidth = 5; c.beginPath(); c.moveTo(w / 2, h * 0.76); c.lineTo(w / 2, 22); c.stroke();
        c.lineWidth = 2;
        for (let v = 0.12; v < 0.95; v += 0.075) { const y = h * 0.76 - (h * 0.74) * v, s = Math.sin(Math.PI * Math.pow(v, 0.8)) * w * 0.24; c.beginPath(); c.moveTo(w / 2, y); c.quadraticCurveTo(w / 2 + s * 0.6, y - 18, w / 2 + s, y - 46); c.moveTo(w / 2, y); c.quadraticCurveTo(w / 2 - s * 0.6, y - 18, w / 2 - s, y - 46); c.stroke(); }
    });

    // ground tuft: young ferns and blades fanning from the root
    // a whole broadleaf tree from the side: trunk, a few limbs, masses of leaves lit from the upper left
    clip('crown', (w, h) => {
        stroke([[w * 0.5, h - 2], [w * 0.49, h * 0.62], [w * 0.52, h * 0.42]], 13, '#33291d');
        for (const [ex, ey] of [[0.24, 0.42], [0.76, 0.4], [0.36, 0.26], [0.66, 0.24]]) stroke([[w * 0.5, h * 0.6], [w * (0.5 + (ex - 0.5) * 0.5), h * (ey + 0.14)], [w * ex, h * ey]], 6, '#33291d');
        const blobs = [[0.5, 0.2, 0.2], [0.3, 0.3, 0.2], [0.7, 0.29, 0.2], [0.2, 0.44, 0.15], [0.8, 0.43, 0.15], [0.5, 0.38, 0.22], [0.36, 0.5, 0.13], [0.64, 0.5, 0.13]];
        for (let pass = 0; pass < 3; pass++) for (const [bx, by, br] of blobs) for (let i = 0; i < 120; i++) {
            const a = R(0, 6.283), r = Math.sqrt(rnd()) * br * w * (0.7 + 0.15 * pass);
            const x = bx * w + Math.cos(a) * r - pass * 5, y = by * h + Math.sin(a) * r * 0.85 - pass * 6;
            blade(x, y, R(0, 6.283), R(9, 17), R(3.5, 6), hsl(R(84, 114), R(24, 38), [10, 17, 25][pass] + R(-3, 4)));
        }
    });

    clip('tuft', (w, h) => {
        // broad young blades and seedling fronds from one root, with real leaf area
        for (let i = 0; i < 30; i++) {
            const a = -Math.PI / 2 + R(-1.15, 1.15), L = h * R(0.4, 0.92), x0 = w / 2 + R(-30, 30);
            const g = hsl(R(72, 110), R(30, 50), R(18, 34));
            blade(x0, h - 4, a + R(-0.08, 0.08), L, i % 3 === 0 ? L * 0.16 : R(8, 14), g);
        }
    });

    // what hangs under a conifer bough: sprays of needles falling away from the branch (the branch runs
    // down the left edge of this sprite)
    clip('reed', (w, h) => {
        for (const k of [c, m]) { k.fillStyle = k === c ? '#16241a' : '#fff'; k.beginPath(); k.moveTo(0, 8); for (let y = 8; y <= h - 8; y += 16) k.lineTo(26 + 30 * Math.abs(Math.sin(y * 0.071)) + R(0, 14), y); k.lineTo(0, h - 8); k.closePath(); k.fill(); }
        for (let y = 14; y < h - 10; y += R(11, 19)) {
            const L = R(70, w - 14), a = R(-0.22, 0.22), n = Math.round(L / 3.6);
            stroke([[4, y], [4 + Math.cos(a) * L, y + Math.sin(a) * L]], 2.4, '#33291c');
            for (let j = 0; j <= n; j++) { const u = j / n, px = 4 + Math.cos(a) * L * u, py = y + Math.sin(a) * L * u, nl = 12 * (1 - 0.4 * u) + 2; const g = hsl(R(112, 140), R(22, 36), R(11, 21) + 6 * u); blade(px, py, a + 0.9, nl, 1.9, g); blade(px, py, a - 0.9, nl, 1.9, g); }
        }
    });

    // bark: fibrous furrows, lichen low down. Fully opaque.
    clip('bark', (w, h) => {
        for (const k of [c, m]) { k.fillStyle = k === c ? '#4a3b2c' : '#fff'; k.fillRect(0, 0, w, h); }
        for (let i = 0; i < 900; i++) {
            const x = R(0, w), y = R(-40, h), L = R(30, 190), l = R(14, 40);
            c.strokeStyle = hsl(R(18, 34), R(14, 30), l); c.lineWidth = R(1, 4.5); c.beginPath(); c.moveTo(x, y);
            c.bezierCurveTo(x + R(-7, 7), y + L * 0.3, x + R(-7, 7), y + L * 0.7, x + R(-5, 5), y + L); c.stroke();
        }
        for (let i = 0; i < 180; i++) { c.fillStyle = `hsla(${R(70, 110)} 30% ${R(26, 40)}% / ${R(0.1, 0.35)})`; c.beginPath(); c.ellipse(R(0, w), R(0, h), R(4, 22), R(4, 16), R(0, 3), 0, 7); c.fill(); }
    });

    // moss cushion / low creeping leaves: fills most of its square
    clip('moss', (w, h) => {
        for (let i = 0; i < 420; i++) { const a = R(0, 6.28), r = Math.sqrt(rnd()) * w * 0.46, x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r; blade(x, y, R(0, 6.28), R(14, 34), R(4, 9), hsl(R(72, 112), R(34, 54), R(20, 36))); }
    });

    // litter: fallen leaves, bits of frond and twig, seen from above
    clip('cone', (w, h) => {
        for (let i = 0; i < 150; i++) {
            const x = R(10, w - 10), y = R(8, h - 8), a = R(0, 6.283), L = R(16, 44);
            if (i % 5 === 0) stroke([[x, y], [x + Math.cos(a) * L * 1.6, y + Math.sin(a) * L * 1.6]], R(1.5, 3.5), hsl(R(22, 34), R(18, 28), R(12, 20)));
            else blade(x, y, a, L, L * R(0.2, 0.38), hsl(R(24, 44), R(16, 30), R(12, 24)));
        }
    });

    const cd = c.getImageData(0, 0, AT, AT), md = m.getImageData(0, 0, AT, AT);
    const out = cd.data, mk2 = md.data;
    for (let i = 0; i < out.length; i += 4) out[i + 3] = mk2[i];
    const tex = new THREE.DataTexture(out, AT, AT, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.anisotropy = 8; tex.flipY = false; tex.premultiplyAlpha = false;
    tex.needsUpdate = true;
    return tex;
}

// ---- geometry ------------------------------------------------------------------
class Builder {
    constructor() { this.p = []; this.n = []; this.uv = []; this.aux = []; this.idx = []; this.centerY = 1; }
    get count() { return this.p.length / 3; }
    vert(x, y, z, nx, ny, nz, u, v, sway, ao, wood) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.aux.push(sway, ao, wood); return this.count - 1; }

    // a card strip along a curve. spine(t) -> [x,y,z]; width(t); `up` biases the normal.
    strip(spine, width, segs, rect, { swayA = 0, swayB = 1, aoA = 0.5, aoB = 1, fold = 0, flip = false, v0 = 0, v1 = 1 } = {}) {
        const [ru, rv, rw, rh] = rect;
        const base = this.count;
        let prev = spine(0);
        for (let s = 0; s <= segs; s++) {
            const t = s / segs, p = spine(t), q = spine(Math.min(1, t + 0.02));
            let tx = q[0] - p[0], ty = q[1] - p[1], tz = q[2] - p[2];
            if (s === segs) { tx = p[0] - prev[0]; ty = p[1] - prev[1]; tz = p[2] - prev[2]; }
            const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
            // side = tangent x up
            let sx = tz, sy = 0, sz = -tx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
            // normal = side x tangent
            let nx = sy * tz - sz * ty, ny = sz * tx - sx * tz, nz = sx * ty - sy * tx;
            if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
            const w = width(t) * 0.5;
            const vv = rv + rh * (1 - (v0 + (v1 - v0) * t));       // t = 0 at the bottom of the sprite
            const sway = swayA + (swayB - swayA) * t, ao = aoA + (aoB - aoA) * t;
            const drop = fold * w;
            this.vert(p[0] - sx * w, p[1] - drop, p[2] - sz * w, nx - sx * 0.35, ny, nz - sz * 0.35, flip ? ru + rw : ru, vv, sway, ao, 0);
            this.vert(p[0], p[1], p[2], nx, ny, nz, ru + rw * 0.5, vv, sway, ao, 0);
            this.vert(p[0] + sx * w, p[1] - drop, p[2] + sz * w, nx + sx * 0.35, ny, nz + sz * 0.35, flip ? ru : ru + rw, vv, sway, ao, 0);
            prev = p;
        }
        for (let s = 0; s < segs; s++) {
            const a = base + s * 3;
            this.idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
        }
    }

    // a flat card with no centre fold (for distant foliage)
    card(spine, width, segs, rect, opt = {}) {
        const [ru, rv, rw, rh] = rect;
        const { swayA = 0, swayB = 1, aoA = 0.5, aoB = 1 } = opt;
        const base = this.count;
        for (let s = 0; s <= segs; s++) {
            const t = s / segs, p = spine(t), q = spine(Math.min(1, t + 0.02)), r = spine(Math.max(0, t - 0.02));
            let tx = q[0] - r[0], ty = q[1] - r[1], tz = q[2] - r[2];
            const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
            let sx = tz, sz = -tx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
            let nx = -sz * ty, ny = sz * tx - sx * tz, nz = sx * ty;
            if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
            const w = width(t) * 0.5, vv = rv + rh * (1 - t);
            const sway = swayA + (swayB - swayA) * t, ao = aoA + (aoB - aoA) * t;
            this.vert(p[0] - sx * w, p[1], p[2] - sz * w, nx, ny, nz, ru, vv, sway, ao, 0);
            this.vert(p[0] + sx * w, p[1], p[2] + sz * w, nx, ny, nz, ru + rw, vv, sway, ao, 0);
        }
        for (let s = 0; s < segs; s++) { const a = base + s * 2; this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }

    // a curtain hanging under a spine: its top edge follows the spine, the sprite's left edge is the top
    hang(spine, depth, segs, rect, { swayA = 0.3, swayB = 1, ao = 0.5 } = {}) {
        const [ru, rv, rw, rh] = rect;
        const base = this.count;
        for (let s = 0; s <= segs; s++) {
            const t = s / segs, p = spine(t), q = spine(Math.min(1, t + 0.02)), r = spine(Math.max(0, t - 0.02));
            let tx = q[0] - r[0], tz = q[2] - r[2]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
            const d = depth * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.9)));
            const vv = rv + rh * t, sw = swayA + (swayB - swayA) * t;
            this.vert(p[0], p[1], p[2], tz, 0.5, -tx, ru, vv, sw * 0.6, ao + 0.3, 0);
            this.vert(p[0] + tz * 0.06, p[1] - d, p[2] - tx * 0.06, tz, 0.2, -tx, ru + rw, vv, sw, ao, 0);
        }
        for (let s = 0; s < segs; s++) { const a = base + s * 2; this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }

    // a flat square plate facing `n`, rolled about it; for clumps of foliage
    plate(cx, cy, cz, nx, ny, nz, size, roll, rect, sway, ao) {
        const [ru, rv, rw, rh] = rect;
        let ux = 0, uy = 1, uz = 0; if (Math.abs(ny) > 0.92) { ux = 1; uy = 0; }
        let tx = uy * nz - uz * ny, ty = uz * nx - ux * nz, tz = ux * ny - uy * nx; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        let bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
        const c = Math.cos(roll), s2 = Math.sin(roll), h = size / 2;
        const ax = (tx * c + bx * s2) * h, ay = (ty * c + by * s2) * h, az = (tz * c + bz * s2) * h;
        const ex = (bx * c - tx * s2) * h, ey = (by * c - ty * s2) * h, ez = (bz * c - tz * s2) * h;
        const v = (dx, dy, u, w) => this.vert(cx + ax * dx + ex * dy, cy + ay * dx + ey * dy, cz + az * dx + ez * dy, nx, ny, nz, ru + rw * u, rv + rh * w, sway, ao, 0);
        const a = v(-1, -1, 0, 1), b = v(1, -1, 1, 1), d = v(-1, 1, 0, 0), e = v(1, 1, 1, 0);
        this.idx.push(a, b, d, b, e, d);
    }

    // two vertical boards crossed at right angles, carrying a painted tree
    cross(hT, width, rect, y0 = 0) {
        const [ru, rv, rw, rh] = rect;
        for (let k = 0; k < 2; k++) {
            const dx = k ? 0 : 1, dz = k ? 1 : 0, w = width / 2;
            const a = this.vert(-dx * w, y0, -dz * w, -dx * 0.5, 0.6, -dz * 0.5, ru, rv + rh, 0, 0.5, 0), b = this.vert(dx * w, y0, dz * w, dx * 0.5, 0.6, dz * 0.5, ru + rw, rv + rh, 0, 0.5, 0);
            const c = this.vert(-dx * w, y0 + hT, -dz * w, -dx * 0.4, 0.8, -dz * 0.4, ru, rv, 0.8, 1, 0), d = this.vert(dx * w, y0 + hT, dz * w, dx * 0.4, 0.8, dz * 0.4, ru + rw, rv, 0.8, 1, 0);
            this.idx.push(a, b, c, b, d, c);
        }
    }

    // a tapering tube through points; uv wraps the bark sprite
    tube(pts, radii, sides, { swayA = 0, swayB = 0.3, vScale = 1 } = {}) {
        const [ru, rv, rw, rh] = rectUV('bark');
        const base = this.count, n = pts.length;
        let acc = 0;
        for (let i = 0; i < n; i++) {
            const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
            let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
            // frame
            let ux = 1, uy = 0, uz = 0; if (Math.abs(tx) > 0.9) { ux = 0; uz = 1; }
            let bx = ty * uz - tz * uy, by = tz * ux - tx * uz, bz = tx * uy - ty * ux; const bl = Math.hypot(bx, by, bz); bx /= bl; by /= bl; bz /= bl;
            const cx = by * tz - bz * ty, cy = bz * tx - bx * tz, cz = bx * ty - by * tx;
            if (i > 0) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
            const t = i / (n - 1), sway = swayA + (swayB - swayA) * t * t;
            for (let s = 0; s <= sides; s++) {
                const a2 = (s / sides) * Math.PI * 2, ca = Math.cos(a2), sa = Math.sin(a2);
                const nx = bx * ca + cx * sa, ny = by * ca + cy * sa, nz = bz * ca + cz * sa;
                this.vert(p[0] + nx * radii[i], p[1] + ny * radii[i], p[2] + nz * radii[i], nx, ny, nz, ru + rw * (0.04 + 0.92 * (s / sides)), rv + rh * (0.02 + 0.96 * ((acc * vScale) % 1)), sway, 0.55 + 0.45 * t, 1);
            }
        }
        const V = sides + 1;
        for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) { const a = base + i * V + s; this.idx.push(a, a + V, a + 1, a + 1, a + V, a + V + 1); }
    }

    // round the leaf normals toward "away from the crown's centre": soft, volumetric light
    puff(cx, cy, cz, amount, from = 0) {
        for (let i = from; i < this.count; i++) {
            if (this.aux[i * 3 + 2] > 0.5) continue;
            let x = this.p[i * 3] - cx, y = this.p[i * 3 + 1] - cy, z = this.p[i * 3 + 2] - cz;
            const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
            let nx = this.n[i * 3] * (1 - amount) + x * amount, ny = this.n[i * 3 + 1] * (1 - amount) + y * amount + 0.25, nz = this.n[i * 3 + 2] * (1 - amount) + z * amount;
            const nl = Math.hypot(nx, ny, nz) || 1;
            this.n[i * 3] = nx / nl; this.n[i * 3 + 1] = ny / nl; this.n[i * 3 + 2] = nz / nl;
        }
    }

    geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
        g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(this.aux), 3));
        g.setIndex(this.count > 65535 ? new THREE.BufferAttribute(new Uint32Array(this.idx), 1) : new THREE.BufferAttribute(new Uint16Array(this.idx), 1));
        g.userData.tris = this.idx.length / 3;
        return g;
    }
}

// an arching frond: rises at `rise` radians, droops with gravity
const frond = (ox, oy, oz, az, len, rise, droop) => (t) => {
    const r = len * t, cz = Math.cos(az), sz = Math.sin(az);
    const out = r * Math.cos(rise) * (1 - 0.12 * t), y = r * Math.sin(rise) - droop * len * t * t;
    return [ox + cz * out, oy + y, oz + sz * out];
};

function buildSpecies(seed) {
    const S = {};
    const rnd = mulberry32(seed), R = (a, b) => a + (b - a) * rnd();
    const fernR = rectUV('fern'), palmR = rectUV('palm'), needleR = rectUV('needle'), leafR = rectUV('leaf'), tuftR = rectUV('tuft'), curtainR = rectUV('reed');
    const bigR = rectUV('big'), mossR = rectUV('moss'), pineR = rectUV('pine'), litterR = rectUV('cone');

    // ---- ground fern (about 1 m): a shuttlecock of fronds
    const fern = (n, segs) => { const b = new Builder(); for (let i = 0; i < n; i++) { const az = (i / n) * 6.283 + R(-0.3, 0.3), L = R(0.8, 1.3); b.strip(frond(0, 0.04, 0, az, L, R(0.75, 1.15), R(0.55, 0.95)), () => L * 0.4, segs, fernR, { swayA: 0.05, swayB: 1, aoA: 0.3, aoB: 1, fold: 0.18 }); } b.puff(0, 0.1, 0, 0.45); return b.geometry(); };
    S.fern = [fern(11, 4), fern(9, 4)]; S.fernFar = [fern(6, 2)];

    // ---- tuft: three crossed cards of young growth (0.4 m)
    const tuft = (n) => { const b = new Builder(); for (let i = 0; i < n; i++) { const az = (i / n) * Math.PI + R(-0.2, 0.2), lean = R(-0.12, 0.12); b.card((t) => [Math.cos(az + 1.57) * lean * t, 0.42 * t, Math.sin(az + 1.57) * lean * t], () => 0.62, 1, tuftR, { swayA: 0, swayB: 1, aoA: 0.6, aoB: 1 }); } for (let i = 0; i < b.count; i++) { b.n[i * 3] *= 0.35; b.n[i * 3 + 1] = 0.9; b.n[i * 3 + 2] *= 0.35; } return b.geometry(); };
    S.tuft = [tuft(3)]; S.tuftFar = [tuft(2)];
    // fernlet: a hand-high fern, the plant that covers most of the forest floor
    const fernlet = (n) => { const b = new Builder(); for (let i = 0; i < n; i++) { const az = (i / n) * 6.283 + R(-0.5, 0.5), L = R(0.3, 0.62); b.card(frond(0, 0.01, 0, az, L, R(0.65, 1.2), R(0.4, 0.95)), () => L * 0.44, 2, fernR, { swayA: 0.05, swayB: 1, aoA: 0.6, aoB: 1 }); } for (let i = 0; i < b.count; i++) { b.n[i * 3] *= 0.4; b.n[i * 3 + 1] = 0.9; b.n[i * 3 + 2] *= 0.4; } return b.geometry(); };
    S.fernlet = [fernlet(5), fernlet(4)];

    // ---- moss / creeping leaves: a low disc
    { const b = new Builder(); const r = 0.5; const a = b.vert(-r, 0.03, -r, 0, 1, 0, mossR[0], mossR[1], 0, 0.8, 0), c2 = b.vert(r, 0.03, -r, 0, 1, 0, mossR[0] + mossR[2], mossR[1], 0, 0.8, 0), d = b.vert(-r, 0.03, r, 0, 1, 0, mossR[0], mossR[1] + mossR[3], 0, 0.8, 0), e = b.vert(r, 0.03, r, 0, 1, 0, mossR[0] + mossR[2], mossR[1] + mossR[3], 0, 0.8, 0); b.idx.push(a, d, c2, c2, d, e); S.moss = [b.geometry()]; }

    // ---- big-leaf shrub (1.5 m)
    const shrub = (n) => { const b = new Builder(); for (let i = 0; i < n; i++) { const az = (i / n) * 6.283 * 2.39, L = R(0.55, 0.95), el = R(0.6, 1.35); b.strip(frond(0, 0.02, 0, az, L, el, R(0.12, 0.38)), () => L * 0.52, 3, bigR, { swayA: 0.05, swayB: 0.8, aoA: 0.35, aoB: 1, fold: 0.2 }); } b.puff(0, 0.5, 0, 0.5); return b.geometry(); };
    S.shrub = [shrub(17), shrub(13)];

    // ---- cycad: squat scaly trunk, stiff crown
    const cycad = (hT, n, segs) => { const b = new Builder(); b.tube([[0, 0, 0], [0.03, hT * 0.5, 0.02], [0, hT, 0]], [0.3, 0.34, 0.26], 7, { swayB: 0.05, vScale: 0.6 }); for (let i = 0; i < n; i++) { const az = (i / n) * 6.283 * 2.39 + R(-0.2, 0.2), L = R(1.5, 2.1), up = i / n; b.strip(frond(0, hT, 0, az, L, 1.25 - 1.1 * up, 0.28 + 0.3 * up), () => L * 0.36, segs, palmR, { swayA: 0.05, swayB: 0.7, aoA: 0.3, aoB: 1, fold: 0.22 }); } b.puff(0, hT + 0.4, 0, 0.5); return b.geometry(); };
    S.cycad = [cycad(0.35, 16, 4), cycad(1.3, 24, 4)];

    // ---- tree fern: slender fibrous trunk, a wide parasol, a skirt of dead fronds
    const treeFern = (hT, n, segs, skirt = 6) => { const b = new Builder(); const lean = R(-0.5, 0.5), lz = R(-0.5, 0.5); b.tube([[0, 0, 0], [lean * 0.4, hT * 0.5, lz * 0.4], [lean, hT, lz]], [0.3, 0.19, 0.24], segs > 2 ? 7 : 4, { swayB: 0.2, vScale: 0.35 }); for (let i = 0; i < n; i++) { const az = (i / n) * 6.283 * 2.39, L = R(2.6, 3.6), up = i / n; b.strip(frond(lean, hT, lz, az, L, 1.05 - 1.0 * up, 0.4 + 0.34 * up), () => L * 0.44, segs, fernR, { swayA: 0.15, swayB: 1, aoA: 0.35, aoB: 1, fold: 0.16 }); } for (let i = 0; i < skirt; i++) { const az = R(0, 6.283), L = R(1.4, 2.1); b.strip(frond(lean, hT - 0.2, lz, az, L, -0.9, 0.5), () => L * 0.36, 2, fernR, { swayA: 0.15, swayB: 0.5, aoA: 0.2, aoB: 0.45 }); } b.puff(lean, hT + 0.3, lz, 0.5); return b.geometry(); };
    S.treeFern = [treeFern(3.4, 22, 5), treeFern(5.6, 24, 5)]; S.treeFernMid = [treeFern(4.5, 11, 2, 2)];

    // ---- palm
    const palm = (hT, n, segs) => { const b = new Builder(); const lx = R(-1.6, 1.6), lz = R(-1.6, 1.6); b.tube([[0, 0, 0], [lx * 0.2, hT * 0.33, lz * 0.2], [lx * 0.6, hT * 0.7, lz * 0.6], [lx, hT, lz]], [0.42, 0.26, 0.21, 0.24], segs > 2 ? 7 : 4, { swayB: 0.35, vScale: 0.3 }); for (let i = 0; i < n; i++) { const az = (i / n) * 6.283 * 2.39, L = R(3.2, 4.4), up = i / n; b.strip(frond(lx, hT, lz, az, L, 1.0 - 1.35 * up, 0.46 + 0.4 * up), () => L * 0.36, segs, palmR, { swayA: 0.2, swayB: 1, aoA: 0.35, aoB: 1, fold: 0.25 }); } b.puff(lx, hT + 0.4, lz, 0.5); return b.geometry(); };
    S.palm = [palm(9, 24, 5), palm(13, 26, 5)]; S.palmMid = [palm(11, 11, 2)];

    // ---- conifer (araucaria / dawn redwood stock): a straight bole with a flared foot, boughs in
    // loose tiers. No two boughs share a height or a length, some are missing, the low ones sag
    // and carry hanging sprays; that is what keeps the crown from reading as stacked discs.
    const conifer = (hT, tiers, per, lod, spread = 1) => {
        const b = new Builder(); const bole = hT * R(0.16, 0.26), base = hT * 0.018 + 0.3;
        const lx = R(-0.6, 0.6), lz = R(-0.6, 0.6);
        b.tube([[0, -0.3, 0], [0, 0.9, 0], [lx * 0.25, hT * 0.4, lz * 0.25], [lx * 0.7, hT * 0.8, lz * 0.7], [lx, hT, lz]], [base * 2.1, base * 1.25, base * 0.66, base * 0.26, 0.03], lod ? 5 : 8, { swayB: 0.25, vScale: 0.18 });
        const leaf0 = b.count; const gap = (hT - bole) / tiers;
        for (let w = 0; w < tiers; w++) {
            const t = w / (tiers - 1), y0 = bole + (hT - bole) * (0.99 * Math.pow(t, 0.9));
            const reach = (hT * 0.22 * Math.pow(1 - t, 0.75) * (0.8 + 0.2 * Math.sin(t * 13 + seed + hT)) + 0.9) * spread;
            const cnt = Math.max(4, Math.round(per * (1 - 0.3 * t)));
            const ox = lx * t * t, oz = lz * t * t;
            for (let i = 0; i < cnt; i++) {
                if (!lod && rnd() < 0.1) continue;
                const az = (i / cnt) * 6.283 + w * 2.4 + R(-0.4, 0.4), L = reach * R(0.6, 1.2);
                const y = y0 + R(-0.48, 0.48) * gap;
                const rise = -0.42 + 1.0 * t + R(-0.2, 0.2);
                const opt = { swayA: 0.1 + 0.3 * t, swayB: 0.55 + 0.45 * t, aoA: 0.2, aoB: 1, fold: 0.18 };
                const wid = () => L * (lod ? 1.0 : 0.58);
                const sp = frond(ox, y, oz, az, L, rise, R(-0.28, 0.08) * (1 - t));
                if (lod) b.card(sp, wid, 1, needleR, opt); else if (w < 9) b.strip(sp, wid, 2, needleR, opt); else b.card(sp, wid, 2, needleR, opt);
                // the mass under the bough: a curtain of sprays, so no bough is ever seen as one thin plane
                if (lod < 2 && t < 0.9 && (!lod || i % 2 === 0)) b.hang(sp, L * R(0.26, 0.4), lod ? 1 : 2, curtainR, { swayA: 0.2, swayB: 0.9, ao: 0.46 });
                if (!lod && t < 0.8 && rnd() < 0.4) b.card(frond(ox, y - 0.3, oz, az + R(-0.5, 0.5), L * R(0.5, 0.75), rise - R(0.4, 0.7), 0.3), () => L * 0.42, 2, needleR, { swayA: 0.2, swayB: 0.8, aoA: 0.12, aoB: 0.62 });
            }
        }
        // the leader: a few short upright sprays, so the top is a point of foliage and not a bare pole
        for (let i = 0; i < 3; i++) b.card(frond(lx, hT - 1.0, lz, (i / 3) * 6.283 + 0.3, 1.4 * spread, 1.25, 0.05), () => 0.9, 1, needleR, { swayA: 0.7, swayB: 1, aoA: 0.8, aoB: 1 });
        b.puff(lx * 0.3, bole + (hT - bole) * 0.3, lz * 0.3, 0.5, leaf0);
        if (lod) b.cross(hT * 1.02, hT * 0.5 * spread, pineR);
        return b.geometry();
    };
    S.conifer = [conifer(27, 21, 11, 0), conifer(36, 25, 11, 0), conifer(20, 16, 10, 0, 1.4)];
    S.coniferMid = [conifer(27, 9, 5, 1), conifer(36, 10, 5, 1), conifer(20, 8, 5, 1, 1.4)];

    // ---- broadleaf (ginkgo / plane / magnolia stock): a flared trunk, limbs that bend as they
    // rise and fork again, each fork carrying a rounded mass of foliage with a dark inside
    const broadleaf = (hT, limbs, perBlob, lod) => {
        const b = new Builder(); const fork = hT * R(0.24, 0.36), r0 = hT * 0.016 + 0.14;
        const tx = R(-0.5, 0.5), tz = R(-0.5, 0.5);
        b.tube([[0, -0.3, 0], [0, 0.7, 0], [tx * 0.6, fork * 0.55, tz * 0.6], [tx, fork, tz]], [r0 * 2.0, r0 * 1.25, r0 * 0.9, r0 * 0.78], lod ? 5 : 8, { swayB: 0.1, vScale: 0.25 });
        const blobs = [];
        for (let i = 0; i < limbs; i++) {
            const az = (i / limbs) * 6.283 + R(-0.4, 0.4), el = i === 0 ? 1.35 : R(0.45, 1.05), L = (hT - fork) * (i === 0 ? 0.8 : R(0.55, 0.9));
            const ex = tx + Math.cos(az) * Math.cos(el) * L, ey = fork + Math.sin(el) * L, ez = tz + Math.sin(az) * Math.cos(el) * L;
            // the limb leaves the trunk low and outward, then turns up
            const q1 = [tx + (ex - tx) * 0.3 + R(-0.3, 0.3), fork + (ey - fork) * 0.18, tz + (ez - tz) * 0.3 + R(-0.3, 0.3)];
            const mid = [tx + (ex - tx) * 0.62 + R(-0.5, 0.5), fork + (ey - fork) * 0.56, tz + (ez - tz) * 0.62 + R(-0.5, 0.5)];
            b.tube([[tx, fork - 0.3, tz], q1, mid, [ex, ey, ez]], [r0 * 0.5, r0 * 0.36, r0 * 0.22, r0 * 0.06], lod ? 4 : 6, { swayA: 0.1, swayB: 0.45, vScale: 0.3 });
            blobs.push([ex, ey, ez, hT * R(0.13, 0.22)]);
            blobs.push([q1[0] * 1.15, q1[1] + hT * 0.05, q1[2] * 1.15, hT * R(0.09, 0.14)]);      // leaves low on the limb: the fork is never bare
            if (!lod) for (let k = 0; k < 3; k++) {
                const a2 = az + R(-1.2, 1.2), l2 = L * R(0.32, 0.55), e2 = R(0.15, 0.9);
                const fx = mid[0] + Math.cos(a2) * Math.cos(e2) * l2, fy = mid[1] + Math.sin(e2) * l2, fz = mid[2] + Math.sin(a2) * Math.cos(e2) * l2;
                b.tube([mid, [(mid[0] + fx) / 2 + R(-0.2, 0.2), (mid[1] + fy) / 2 - 0.15, (mid[2] + fz) / 2 + R(-0.2, 0.2)], [fx, fy, fz]], [r0 * 0.24, r0 * 0.15, r0 * 0.05], 4, { swayA: 0.25, swayB: 0.55, vScale: 0.3 });
                blobs.push([fx, fy, fz, hT * R(0.11, 0.17)]);
            } else blobs.push([tx + (mid[0] - tx) * 1.5, mid[1], tz + (mid[2] - tz) * 1.5, hT * R(0.14, 0.2)]);
        }
        const leaf0 = b.count; let cy = 0; for (const q of blobs) cy += q[1] / blobs.length;
        const crownR = hT - cy + 2;
        for (const [bx, by, bz, br] of blobs) {
            for (let i = 0; i < perBlob; i++) {
                let nx = R(-1, 1), ny = R(-0.85, 1), nz = R(-1, 1); const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
                const inner = !lod && i % 4 === 3;                       // plates set inside the mass: its shaded heart
                const rr = br * (inner ? R(0.15, 0.5) : R(0.6, 1.02));
                const px = bx + nx * rr, py = by + ny * rr * 0.8, pz = bz + nz * rr;
                const depth = cl(Math.hypot(px - tx, py - cy, pz - tz) / crownR, 0, 1);
                b.plate(px, py, pz, nx * 0.75 + R(-0.35, 0.35), ny * 0.75 + 0.35, nz * 0.75 + R(-0.35, 0.35), br * (lod ? 2.3 : 1.4) * R(0.7, 1.25), R(0, 6.283), leafR, R(0.45, 1), inner ? 0.12 : 0.3 + 0.7 * depth * depth);
            }
        }
        for (let i = leaf0; i < b.count; i++) { const l = Math.hypot(b.n[i * 3], b.n[i * 3 + 1], b.n[i * 3 + 2]) || 1; b.n[i * 3] /= l; b.n[i * 3 + 1] /= l; b.n[i * 3 + 2] /= l; }
        b.puff(tx, cy - 1, tz, 0.6, leaf0);
        return b.geometry();
    };
    S.broadleaf = [broadleaf(16, 5, 13, 0), broadleaf(21, 6, 13, 0), broadleaf(11, 4, 13, 0)];
    S.broadleafMid = [broadleaf(16, 4, 4, 1), broadleaf(21, 4, 4, 1), broadleaf(11, 3, 4, 1)];

    // ---- a fallen trunk, and the litter that collects on the ground
    { const b = new Builder(); const L = 6.5; b.tube([[-L / 2, 0.28, 0], [-L / 6, 0.32, 0.1], [L / 6, 0.28, -0.06], [L / 2, 0.22, 0.05]], [0.4, 0.36, 0.32, 0.26], 8, { swayA: 0, swayB: 0, vScale: 0.3 }); S.log = [b.geometry()]; }
    { const b = new Builder(); const w = 0.85, h = 0.29; const a0 = b.vert(-w, 0.025, -h, 0, 1, 0, litterR[0], litterR[1], 0, 0.85, 0), c0 = b.vert(w, 0.025, -h, 0, 1, 0, litterR[0] + litterR[2], litterR[1], 0, 0.85, 0), d0 = b.vert(-w, 0.025, h, 0, 1, 0, litterR[0], litterR[1] + litterR[3], 0, 0.85, 0), e0 = b.vert(w, 0.025, h, 0, 1, 0, litterR[0] + litterR[2], litterR[1] + litterR[3], 0, 0.85, 0); b.idx.push(a0, d0, c0, c0, d0, e0); S.litter = [b.geometry()]; }

    // ---- the cheapest stand-ins, for trees a long way off
    const stub = (hT, kind) => {
        const b = new Builder();
        if (kind === 'palm' || kind === 'treeFern') b.tube([[0, 0, 0], [0, hT * 0.6, 0]], [hT * 0.02 + 0.2, 0.05], 3, { swayB: 0.1, vScale: 0.2 });
        if (kind === 'conifer') { b.cross(hT * 1.02, hT * 0.5, pineR); for (const t of [0.15, 0.5]) { const y = hT * (0.24 + 0.7 * t), L = hT * 0.22 * Math.pow(1 - t, 0.75) + 1; b.plate(0, y, 0, 0, 1, 0, L * 2, t * 3, needleR, 0.5, 0.8); } }
        else if (kind === 'broadleaf') { b.cross(hT * 1.02, hT * 0.98, rectUV('crown')); b.plate(0, hT * 0.74, 0, 0, 1, 0, hT * 0.72, 0.5, leafR, 0.6, 0.9); }
        else for (let i = 0; i < 5; i++) { const az = (i / 5) * 6.283, L = kind === 'palm' ? 4 : 3.2; b.card(frond(0, hT * 0.6, 0, az, L, 0.4, 0.5), () => L * 0.5, 1, kind === 'palm' ? palmR : fernR, { swayA: 0.3, swayB: 1, aoA: 0.5, aoB: 1 }); }
        b.puff(0, hT * 0.6, 0, 0.6);
        return b.geometry();
    };
    S.coniferFar = [stub(30, 'conifer')]; S.broadleafFar = [stub(18, 'broadleaf')]; S.palmFar = [stub(18, 'palm')]; S.treeFernFar = [stub(7.5, 'treeFern')];
    return S;
}

// ---- rocks: their own geometry and the terrain's stone
function rockGeometry(seed, detail = 3) {
    let g = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);              // shared corners, so the normals come out smooth
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 1 + 0.34 * fbm2(x * 1.3 + seed, y * 1.3 + z * 1.7, 3) + 0.16 * perlin2(x * 4 + seed, z * 4 - y * 3);
        p.setXYZ(i, x * n, Math.max(-0.35, y * n * 0.72), z * n);
    }
    g.computeVertexNormals();
    g.userData.tris = g.index ? g.index.count / 3 : p.count / 3;
    return g;
}

// ---- the system ----------------------------------------------------------------
export function createFlora({ island, places, quality, atmosphere, terrain, noiseTex, rockTex, keepClear = [], bare = false }) {
    const group = new THREE.Group(); group.name = 'flora';
    const atlas = paintAtlas();
    const species = buildSpecies(4242);
    const density = quality.flora;

    // ---- material shared by every plant
    const uWind = uniform(1.0);
    const windDir = vec2(0.92, 0.39);
    const iA = attribute('iA', 'vec4'), iB = attribute('iB', 'vec4'), aux = attribute('aux', 'vec3');
    const ca = cos(iB.x), sa = sin(iB.x);
    const rotY = (v) => vec3(v.x.mul(ca).add(v.z.mul(sa)), v.y, v.z.mul(ca).sub(v.x.mul(sa)));

    const makeMaterial = ({ windK = 1, shadowCut = 0.4, twoSided = true, from = 0, to = 0 } = {}) => {
        const mat = new THREE.MeshSSSNodeMaterial({ side: twoSided ? THREE.DoubleSide : THREE.FrontSide });
        const base = iA.xyz;
        mat.positionNode = Fn(() => {
            const lp = rotY(positionLocal.mul(iA.w));
            const gust = texture(noiseTex, base.xz.mul(1 / 140).add(windDir.mul(time.mul(0.02)))).level(0).r;
            const ph = iB.w.mul(6.283).add(time.mul(float(0.55).add(iB.w.mul(0.4))));
            const bend = aux.x.mul(aux.x).mul(uWind).mul(windK).mul(gust.mul(1.5).add(0.15));
            const lean = sin(ph).mul(0.5).add(0.6).mul(bend).mul(0.22);
            const flutter = vec3(sin(ph.mul(2.7).add(lp.x.mul(3.1))), cos(ph.mul(2.1).add(lp.z.mul(2.3))).mul(0.5), sin(ph.mul(3.3).add(lp.y.mul(2.7)))).mul(aux.x).mul(bend).mul(0.016);
            const p = lp.add(vec3(windDir.x, -0.15, windDir.y).mul(lean).mul(iA.w.mul(0.35).add(0.65))).add(flutter);
            if (from > 0 || to > 0) {
                const d = length(base.xz.sub(cameraPosition.xz)).add(max(cameraPosition.y.sub(base.y).sub(60), 0).mul(0.8));
                let k = float(1);
                if (from > 0) k = k.mul(smoothstep(from - from * 0.06, from + from * 0.06, d));
                if (to > 0) k = k.mul(float(1).sub(smoothstep(to - to * 0.06, to + to * 0.06, d)));
                return p.mul(k).add(base);
            }
            return p.add(base);
        })();
        const tx = texture(atlas, uv());
        const dist = length(positionWorld.sub(cameraPosition));
        // keep leaves from thinning away in the distance as the mips blur their edges
        const araw = tx.a.mul(float(1).add(clamp(log2(max(dist, 1).div(30)), 0, 4).mul(0.3)));
        const alpha = saturate(araw.sub(0.38).div(max(fwidth(araw), 0.0005)).add(0.5));
        const wood = aux.z;
        const tint = Fn(() => {
            const warm = vec3(1.18, 1.04, 0.62), cool = vec3(0.8, 1.0, 0.86);
            const c = tx.rgb.mul(mix(cool, warm, iB.y)).mul(iB.z);
            // large patches of forest differ a little in colour
            const patch = texture(noiseTex, base.xz.mul(1 / 260)).r;
            const lum = dot(c, vec3(0.3, 0.55, 0.15));
            const calm = mix(vec3(lum), c, 0.72);                     // real leaves are greyer than paint
            const leaf = calm.mul(mix(vec3(0.72, 0.78, 0.7), vec3(0.98, 0.95, 0.8), patch));
            return mix(leaf, tx.rgb.mul(mix(1.1, 1.6, iB.z.sub(0.6))), wood);
        })();
        const occl = mix(0.52, 1.0, aux.y);
        mat.colorNode = vec4(tint.mul(mix(occl, 1.0, 0.25)), 1);
        mat.opacityNode = alpha;
        if (quality.msaa > 1) { mat.alphaToCoverage = true; mat.maskNode = alpha.greaterThan(0.02); } else mat.maskNode = araw.greaterThan(0.4);
        mat.maskShadowNode = araw.greaterThan(shadowCut);
        mat.roughnessNode = mix(float(0.78), float(0.92), wood);
        mat.specularIntensity = 0.35;
        mat.metalnessNode = float(0);
        mat.aoNode = occl;
        mat.normalNode = normalize(rotY(normalLocal)).transformDirection(cameraViewMatrix);
        // light coming through the leaf from behind
        mat.thicknessColorNode = tint.mul(vec3(0.95, 1.0, 0.42)).mul(float(1).sub(wood)).mul(mix(0.25, 1.0, aux.y));
        mat.thicknessDistortionNode = float(0.35);
        mat.thicknessAmbientNode = float(0.0);
        mat.thicknessAttenuationNode = float(0.9);
        mat.thicknessPowerNode = float(4.0);
        mat.thicknessScaleNode = float(0.9);
        mat.envMapIntensity = 0.85;
        return mat;
    };
    const NEAR = 100, MID = 400;
    const leafMat = makeMaterial();                                   // shrubs, cycads, specimens: no distance rule
    const nearMat = makeMaterial({ to: NEAR });
    const midMat = makeMaterial({ from: NEAR, to: MID, windK: 0.8 });
    const farMat = makeMaterial({ from: MID, windK: 0.6 });
    const groundMat = makeMaterial({ windK: 1.4 });
    const tuftMat = makeMaterial({ windK: 1.4, to: 62 });
    const fernNearMat = makeMaterial({ windK: 1.4, to: 36 });
    const fernFarMat = makeMaterial({ windK: 1.2, from: 36 });

    // rocks reuse the island's stone look, triplanar in world space
    const rockMat = new THREE.MeshStandardNodeMaterial();
    {
        const P = positionWorld, n = normalLocal;
        const w = pow(abs(n), vec3(4.0)), ws = w.x.add(w.y).add(w.z);
        const s = 1 / 3.1;
        const tY = texture(rockTex, P.xz.mul(s)), tX = texture(rockTex, P.zy.mul(s)), tZ = texture(rockTex, P.xy.mul(s));
        const hgt = tY.b.mul(w.y).add(tX.b.mul(w.x)).add(tZ.b.mul(w.z)).div(ws);
        const c0 = new THREE.Color('#5a544c'), c1 = new THREE.Color('#8f877c'), mossC = new THREE.Color('#4a5a2a');
        const pale = new THREE.Color('#a39478');
        const stone = mix(mix(vec3(c0.r, c0.g, c0.b), vec3(c1.r, c1.g, c1.b), hgt), vec3(pale.r, pale.g, pale.b).mul(mix(0.7, 1.1, hgt)), iB.w).mul(iB.z);
        const mossy = smoothstep(0.35, 0.8, n.y.mul(0.6).add(texture(noiseTex, P.xz.mul(1 / 9)).g.mul(0.6)));
        rockMat.positionNode = rotY(positionLocal.mul(iA.w)).add(iA.xyz);
        rockMat.colorNode = mix(stone, vec3(mossC.r, mossC.g, mossC.b).mul(0.8), mossy.mul(0.7).mul(iB.y)).mul(mix(0.5, 1.0, smoothstep(-0.3, 0.5, positionLocal.y)));
        rockMat.roughnessNode = float(0.86);
        rockMat.normalNode = normalize(rotY(normalLocal).add(vec3(tY.r.sub(0.5), 0, tY.g.sub(0.5)).mul(0.9))).transformDirection(cameraViewMatrix);
    }
    const rocks = [rockGeometry(1), rockGeometry(7), rockGeometry(19, 2)];

    // ---- batches: an instanced mesh with a centre and a distance range in which it is drawn
    const batches = [];
    const addBatch = (geo, mat, list, { near = 0, far = 1e9, cast = true, receive = true, always = false, shadowTo = 1e9 } = {}) => {
        if (!list.length) return;
        const n = list.length / 8;
        const g = new THREE.InstancedBufferGeometry();
        g.index = geo.index;
        for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
        const A = new Float32Array(n * 4), B = new Float32Array(n * 4);
        let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, miny = 1e9, maxy = -1e9, maxs = 0;
        for (let i = 0; i < n; i++) {
            for (let k = 0; k < 4; k++) { A[i * 4 + k] = list[i * 8 + k]; B[i * 4 + k] = list[i * 8 + 4 + k]; }
            const x = A[i * 4], y = A[i * 4 + 1], z = A[i * 4 + 2];
            if (x < minx) minx = x; if (x > maxx) maxx = x; if (z < minz) minz = z; if (z > maxz) maxz = z; if (y < miny) miny = y; if (y > maxy) maxy = y;
            if (A[i * 4 + 3] > maxs) maxs = A[i * 4 + 3];
        }
        g.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
        g.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 4));
        g.instanceCount = n;
        const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, cz = (minz + maxz) / 2;
        const rad = Math.hypot(maxx - minx, maxy - miny + 45 * maxs, maxz - minz) / 2 + 45 * maxs;
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy + 10, cz), rad);
        g.boundingBox = new THREE.Box3(new THREE.Vector3(minx - 30, miny - 5, minz - 30), new THREE.Vector3(maxx + 30, maxy + 60, maxz + 30));
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = cast; mesh.receiveShadow = receive;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
        if (always) mesh.frustumCulled = false;
        batches.push({ mesh, x: cx, z: cz, r: Math.hypot(maxx - minx, maxz - minz) / 2, near, far, always, cast, shadowTo, count: n, tris: n * geo.userData.tris });
    };

    // ---- scatter
    const clear = keepClear.slice();       // [x, z, r]
    for (const p of places) if (!p.aerial) clear.push([p.cam[0], p.cam[2], 4.2]);
    const rexSpots = places.filter((p) => p.rex).map((p) => [p.rex.x, p.rex.z]);
    // nothing tall directly behind the rex as its stop's camera sees it: a frond there grows out of its head
    const rexLines = places.filter((p) => p.rex).map((p) => { const dx = p.rex.x - p.cam[0], dz = p.rex.z - p.cam[2], l = Math.hypot(dx, dz) || 1; return [p.rex.x, p.rex.z, dx / l, dz / l]; });
    const behindRex = (x, z) => { for (const q of rexLines) { const px = x - q[0], pz = z - q[1], t = px * q[2] + pz * q[3]; if (t < -4 || t > 60) continue; if (Math.abs(px * q[3] - pz * q[2]) < 5 + t * 0.16) return true; } return false; };
    const nearRex = (x, z, r) => { for (const q of rexSpots) { const dx = x - q[0], dz = z - q[1]; if (dx * dx + dz * dz < r * r) return true; } return false; };
    const nearCam = (x, z, r) => { for (const p of places) { if (p.aerial) continue; const dx = x - p.cam[0], dz = z - p.cam[2]; if (dx * dx + dz * dz < r * r) return true; } return false; };
    // no tree may stand in a camera's line of sight: a widening corridor from each camera toward its subject
    const vistas = places.filter((p) => !p.aerial).map((p) => { const dx = p.look[0] - p.cam[0], dz = p.look[2] - p.cam[2], l = Math.hypot(dx, dz) || 1; const wide = p.id === 'top' || p.id === 'balloons' || p.id === 'log'; const len = wide ? 190 : 75; return { x: p.cam[0], z: p.cam[2], dx: dx / l, dz: dz / l, len, r0: wide ? 12 : 5, r1: wide ? 70 : 22 }; });
    const inVista = (x, z) => { for (const v of vistas) { const px = x - v.x, pz = z - v.z, t = px * v.dx + pz * v.dz; if (t < -6 || t > v.len) continue; const d = Math.abs(px * v.dz - pz * v.dx); if (d < v.r0 + (v.r1 - v.r0) * Math.max(0, t) / v.len) return true; } return false; };
    const blocked = (x, z, pad = 0) => { for (const c2 of clear) { const dx = x - c2[0], dz = z - c2[1]; if (dx * dx + dz * dz < (c2[2] + pad) * (c2[2] + pad)) return true; } return false; };
    const push = (arr, x, y, z, s, rot, hue, bright, seed) => { arr.push(x, y, z, s, rot, hue, bright, seed); };
    const _nn = [0, 0, 0];

    // trees over the whole island, grouped in square cells so each cell can swap detail by distance
    const CELL = 128, half = WORLD / 2;
    const cells = new Map();
    const cellOf = (x, z) => { const k = Math.floor((x + half) / CELL) + 64 * Math.floor((z + half) / CELL); let c2 = cells.get(k); if (!c2) { c2 = {}; cells.set(k, c2); } return c2; };
    const put = (cell, key, variant, ...v) => { const k = key + variant; (cell[k] || (cell[k] = [])).push(...v); };
    if (!bare) {
        const step = 7.4 / Math.sqrt(Math.max(0.3, density));
        const rnd = mulberry32(9001);
        const n = Math.floor(1700 / step);
        for (let j = -n; j <= n; j++) {
            for (let i = -n; i <= n; i++) {
                const x = (i + rnd() * 1.4 - 0.2) * step, z = (j + rnd() * 1.4 - 0.2) * step;
                const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
                if (Math.abs(x) > half - 20 || Math.abs(z) > half - 20) continue;
                const veg = island.vegAt(x, z);
                const patch = 0.5 + 0.5 * fbm2(x / 75 + 11, z / 75 - 4, 3);       // stands and glades
                if (veg < 0.12 || r1 > veg * (0.3 + 1.7 * sstep(0.25, 0.75, patch))) continue;
                const h = island.heightAt(x, z);
                if (h < 1.5) continue;
                if (blocked(x, z, 2.5) || inVista(x, z) || nearCam(x, z, 24) || nearRex(x, z, 11) || behindRex(x, z)) continue;
                if (island.strataAt(x, z) > 0.45) continue;          // the mesas are bare: a tree up there only throws a stray shadow down the cliff
                const wet = island.wetAt(x, z);
                const coast = h < 9 && Math.hypot(x * 0.93, z * 1.04) > 640;
                let kind;
                if (coast) kind = r2 < 0.7 ? 'palm' : 'broadleaf';
                else if (wet > 0.3) kind = r2 < 0.4 ? 'treeFern' : r2 < 0.62 ? 'palm' : 'broadleaf';
                else kind = r2 < (h > 70 ? 0.86 : 0.56) ? 'conifer' : r2 < 0.92 ? 'broadleaf' : 'treeFern';
                if ((kind === 'conifer' || kind === 'broadleaf') && nearCam(x, z, 52)) kind = r3 < 0.6 ? 'treeFern' : 'palm';
                const nvar = species[kind].length, variant = Math.floor(r3 * nvar) % nvar;
                const core = sstep(0.3, 0.9, veg);
                // mostly grown trees, some saplings, a few giants
                const age = r4 < 0.16 ? lerp(0.28, 0.55, r4 / 0.16) : lerp(0.6, 1.32, Math.pow((r4 - 0.16) / 0.84, 1.3));
                const s = age * (0.8 + 0.3 * core);
                const cell = cellOf(x, z);
                put(cell, kind, variant, x, h - 0.15, z, s, r1 * 6.283, cl(0.5 + 0.9 * (r2 - 0.5) + 0.25 * (wet - 0.3), 0, 1), lerp(0.74, 1.12, r3), r4);
            }
        }
        const far = { conifer: [], broadleaf: [], palm: [], treeFern: [] };
        for (const cell of cells.values()) {
            for (const k of Object.keys(cell)) {
                const kind = k.slice(0, -1), variant = +k.slice(-1), list = cell[k];
                addBatch(species[kind][variant], nearMat, list, { near: 0, far: NEAR + 10, shadowTo: 1e9 });
                const mv = species[kind + 'Mid']; addBatch(mv[variant % mv.length], midMat, list, { near: 0, far: MID + 30, shadowTo: 300 });
                const ref = { conifer: 30, broadleaf: 18, palm: 11, treeFern: 4.5 }[kind] / ({ conifer: [27, 36, 20], broadleaf: [16, 21, 11], palm: [9, 13], treeFern: [3.4, 5.6] }[kind][variant]);
                for (let i = 0; i < list.length; i += 8) far[kind].push(list[i], list[i + 1], list[i + 2], list[i + 3] / ref * ({ palm: 0.61, treeFern: 0.6 }[kind] || 1), list[i + 4], list[i + 5], list[i + 6], list[i + 7]);
            }
        }
        for (const kind of Object.keys(far)) addBatch(species[kind + 'Far'][0], farMat, far[kind], { near: 0, far: 1e9, cast: false, always: true });
    }

    // understorey and ground cover, only around the stops
    for (const pl of places) {
        if (bare || !pl.focus || !pl.zone) continue;
        const rnd = mulberry32(100 + pl.index * 31);
        const zx = pl.focus.x, zz = pl.focus.z, ZR = pl.zone;
        const lists = { log: [], litter: [], tuft: [], fernlet0: [], fernlet1: [], moss: [], fern0: [], fern1: [], shrub0: [], shrub1: [], cycad0: [], cycad1: [], rock0: [], rock1: [], rock2: [], fernFar: [] };
        const ring = (step, radius, fn) => { const n = Math.ceil(radius / step); for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) { const x = zx + (i + rnd() - 0.5) * step, z = zz + (j + rnd() - 0.5) * step; const d = Math.hypot(x - zx, z - zz); if (d > radius) continue; fn(x, z, d); } };
        const patchy = (x, z, s) => 0.5 + 0.5 * fbm2(x / s + pl.index * 7, z / s, 3);

        // tufts: the carpet. Thick near the camera, thinning outward.
        ring(0.5 / Math.sqrt(density), Math.min(ZR, 46), (x, z, d) => {
            const veg = island.vegAt(x, z), h = island.heightAt(x, z);
            if (h < 0.35 || island.slopeAt(x, z) > 0.4) return;
            const keep = (0.25 + 0.9 * veg) * (1 - 0.75 * sstep(18, 46, d)) * (0.08 + 1.5 * sstep(0.36, 0.62, patchy(x, z, 6))) * (1 - 0.8 * island.trailAt(x, z)) * (1 - 0.7 * island.strataAt(x, z)) * (1 - 0.85 * island.volcanicAt(x, z));
            const beach = h < 5.5 && Math.hypot(x * 0.93, z * 1.04) > 600 ? 0.12 : 1;
            if (rnd() > keep * beach * (1 - 0.6 * island.strataAt(x, z)) || blocked(x, z, -2.4)) return;
            const big = rnd(), pick = rnd();
            push(pick < 0.14 ? lists.tuft : pick < 0.6 ? lists.fernlet0 : lists.fernlet1, x, h - 0.03, z, (pick < 0.14 ? lerp(0.4, 1.3, big * big) : lerp(0.55, 2.6, big * big)) * (0.8 + 0.5 * veg), rnd() * 6.283, rnd(), lerp(0.72, 1.15, rnd()), rnd());
            if (rnd() < 0.22) push(lists.moss, x + rnd() - 0.5, h, z + rnd() - 0.5, lerp(0.5, 1.5, rnd()), rnd() * 6.283, rnd(), lerp(0.7, 1.05, rnd()), rnd());
        });
        // litter under the trees and along the banks, and now and then a trunk that came down
        ring(0.85, Math.min(ZR, 52), (x, z, d) => {
            const h = island.heightAt(x, z); if (h < 0.3 || island.slopeAt(x, z) > 0.35) return;
            const veg = island.vegAt(x, z);
            if (rnd() > (0.12 + 0.75 * veg) * (0.4 + 0.9 * patchy(x, z, 5)) * (1 - 0.85 * island.strataAt(x, z)) * (1 - 0.7 * island.volcanicAt(x, z)) || blocked(x, z, -1)) return;
            push(lists.litter, x, h, z, lerp(0.6, 1.7, rnd()), rnd() * 6.283, lerp(0.55, 1, rnd()), lerp(0.7, 1.15, rnd()), rnd());
        });
        ring(15, ZR, (x, z) => {
            const h = island.heightAt(x, z); if (h < 0.8 || island.slopeAt(x, z) > 0.05 || island.vegAt(x, z) < 0.25 || blocked(x, z, 4) || nearCam(x, z, 14) || inVista(x, z)) return;
            if (rnd() < 0.55) push(lists.log, x, h - 0.08, z, lerp(0.7, 1.3, rnd()), rnd() * 6.283, 0.5, lerp(0.8, 1.1, rnd()), rnd());
        });
        // ferns
        ring(1.25 / Math.sqrt(density), ZR, (x, z, d) => {
            const veg = island.vegAt(x, z), h = island.heightAt(x, z);
            if (h < 0.5 || island.slopeAt(x, z) > 0.45) return;
            const keep = (0.08 + 1.1 * veg) * (0.05 + 1.6 * sstep(0.4, 0.66, patchy(x, z, 12))) * (1 - 0.6 * sstep(ZR * 0.55, ZR, d)) * (1 - 0.9 * island.trailAt(x, z));
            if (rnd() > keep || blocked(x, z, -1.2)) return;
            push(rnd() < 0.5 ? lists.fern0 : lists.fern1, x, h - 0.04, z, lerp(0.75, 1.55, rnd()) * (0.85 + 0.4 * veg), rnd() * 6.283, rnd(), lerp(0.72, 1.12, rnd()), rnd());
        });
        // shrubs, cycads, horsetails
        ring(3.4 / Math.sqrt(density), ZR + 20, (x, z) => {
            const veg = island.vegAt(x, z), h = island.heightAt(x, z);
            if (h < 0.45 || island.slopeAt(x, z) > 0.4) return;
            const wet = island.wetAt(x, z);
            const clump = patchy(x, z, 23);
            if (behindRex(x, z) || nearRex(x, z, 7)) return;
            if (rnd() > (0.06 + veg) * sstep(0.5, 0.74, clump) * 1.3 || blocked(x, z, 0.6)) return;
            const r = rnd();
            if (r < 0.38) push(rnd() < 0.5 ? lists.shrub0 : lists.shrub1, x, h - 0.05, z, lerp(0.6, 1.5, rnd()), rnd() * 6.283, rnd(), lerp(0.75, 1.1, rnd()), rnd());
            else push(rnd() < 0.72 ? lists.cycad0 : lists.cycad1, x, h - 0.08, z, lerp(0.6, 1.3, rnd()), rnd() * 6.283, rnd(), lerp(0.75, 1.1, rnd()), rnd());
        });
        // rocks: more on steep and bare ground
        ring(1.9, Math.min(ZR, 40), (x, z) => {
            const h = island.heightAt(x, z); if (h < -0.3 || island.slopeAt(x, z) > 0.22 || rnd() > 0.2 + 0.5 * island.strataAt(x, z) + 0.4 * island.volcanicAt(x, z) || blocked(x, z, 0)) return;
            const q = rnd(), sz = lerp(0.05, 0.3, q * q); push(lists.rock2, x, h - sz * 0.3, z, sz, rnd() * 6.283, cl(island.vegAt(x, z) * 1.5, 0, 1), lerp(0.8, 1.15, rnd()), Math.max(island.strataAt(x, z), h < 7 && Math.hypot(x * 0.93, z * 1.04) > 620 ? 0.9 : 0));
        });
        ring(5.2, ZR + 10, (x, z) => {
            const h = island.heightAt(x, z); if (h < -0.4 || nearRex(x, z, 8)) return;
            const slope = island.slopeAt(x, z);
            if (slope > 0.24) return;
            if (rnd() > 0.1 + slope * 1.6 + 0.25 * island.strataAt(x, z) + 0.25 * island.volcanicAt(x, z) || blocked(x, z, 1)) return;
            const big = rnd() < 0.12;
            const s = big ? lerp(1.2, 3.0, rnd()) : lerp(0.18, 0.9, rnd() * rnd());
            const sandy = Math.max(island.strataAt(x, z), h < 7 && Math.hypot(x * 0.93, z * 1.04) > 620 ? 0.9 : 0);
            push(lists['rock' + Math.floor(rnd() * 3)], x, h - s * 0.38, z, s, rnd() * 6.283, cl(island.vegAt(x, z) * 1.5, 0, 1), lerp(0.8, 1.15, rnd()), sandy);
        });

        const range = { near: 0, far: 150, shadowTo: 70 };
        addBatch(species.litter[0], tuftMat, lists.litter, { ...range, far: 70, cast: false });
        addBatch(species.log[0], leafMat, lists.log, range);
        addBatch(species.tuft[0], tuftMat, lists.tuft, { ...range, far: 70, cast: false });
        addBatch(species.fernlet[0], tuftMat, lists.fernlet0, { ...range, far: 70, cast: false });
        addBatch(species.fernlet[1], tuftMat, lists.fernlet1, { ...range, far: 70, cast: false });
        addBatch(species.moss[0], tuftMat, lists.moss, { ...range, far: 70, cast: false });
        addBatch(species.fern[0], fernNearMat, lists.fern0, { ...range, far: 44, cast: quality.post >= 2, shadowTo: 30 });
        addBatch(species.fern[1], fernNearMat, lists.fern1, { ...range, far: 44, cast: quality.post >= 2, shadowTo: 30 });
        addBatch(species.fernFar[0], fernFarMat, lists.fern0.concat(lists.fern1), { ...range, cast: false });
        addBatch(species.shrub[0], leafMat, lists.shrub0, range); addBatch(species.shrub[1], leafMat, lists.shrub1, range);
        addBatch(species.cycad[0], leafMat, lists.cycad0, range); addBatch(species.cycad[1], leafMat, lists.cycad1, range);
        for (let k = 0; k < 3; k++) addBatch(rocks[k], rockMat, lists['rock' + k], range);
    }

    // a row of one of everything, for looking at the plants themselves
    const specimens = (x0, z0, dx, dz) => {
        let t = 0; const out = [];
        const row = (name, geos, mat, gap) => geos.forEach((g, i) => { const x = x0 + dx * t, z = z0 + dz * t; addBatch(g, mat, [x, island.heightAt(x, z), z, 1, 0.6, 0.5, 1, 0.3], { cast: true }); out.push({ name: name + i, x, z, tris: g.userData.tris }); t += gap; });
        row('tuft', species.tuft, groundMat, 1.5); row('moss', species.moss, groundMat, 1.5); row('fern', species.fern, groundMat, 2.5); row('fernFar', species.fernFar, groundMat, 2.5);
        row('shrub', species.shrub, leafMat, 3.5); row('cycad', species.cycad, leafMat, 5);
        row('treeFern', species.treeFern, leafMat, 8); row('treeFernMid', species.treeFernMid, leafMat, 8); row('treeFernFar', species.treeFernFar, leafMat, 8); row('palm', species.palm, leafMat, 10); row('palmMid', species.palmMid, leafMat, 10); row('palmFar', species.palmFar, leafMat, 10);
        row('broadleaf', species.broadleaf, leafMat, 18); row('broadleafMid', species.broadleafMid, leafMat, 18); row('broadleafFar', species.broadleafFar, leafMat, 16); row('conifer', species.conifer, leafMat, 18); row('coniferMid', species.coniferMid, leafMat, 18); row('coniferFar', species.coniferFar, leafMat, 18);
        rocks.forEach((g, i) => { const x = x0 + dx * t, z = z0 + dz * t; addBatch(g, rockMat, [x, island.heightAt(x, z), z, 1.2, 0.3, 0.7, 1, 0.3], {}); t += 4; });
        return out;
    };

    let totalTris = 0, totalInst = 0;
    for (const b of batches) { totalTris += b.tris; totalInst += b.count; }

    const update = (camera) => {
        const cx = camera.position.x, cz = camera.position.z, cy = camera.position.y;
        for (const b of batches) {
            const d = Math.max(0, Math.hypot(b.x - cx, b.z - cz) - b.r);
            const dd = Math.hypot(d, Math.max(0, cy - 120) * 0.6);
            b.mesh.visible = b.always || (dd >= b.near && dd < b.far);
            if (b.cast) b.mesh.castShadow = dd < b.shadowTo;
        }
    };

    return { group, update, atlas, uWind, specimens, stats: { batches: batches.length, instances: totalInst, tris: totalTris }, leafMat };
}
