// CPU-side noise, hashing and seeded randomness. Everything in the world that
// is placed, sculpted or baked at load comes from here, so one seed gives one
// island on every machine.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
// polynomial smooth min / max (k = blend width)
export const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };
export const smax = (a, b, k) => -smin(-a, -b, k);

export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// integer hash -> [0,1)
export function hash2(x, y, s = 0) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// ---- gradient noise (Perlin, 2D), optionally periodic ------------------------
const PERM = new Uint8Array(512);
const GX = new Float32Array(256), GY = new Float32Array(256);
{
    const r = mulberry32(1337);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
    for (let i = 0; i < 256; i++) { const a = (i / 256) * Math.PI * 2 + 0.1; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// period = 0: infinite. Otherwise the lattice wraps every `period` cells.
export function perlin2(x, y, period = 0) {
    let xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    let x1 = xi + 1, y1 = yi + 1;
    if (period) { xi = ((xi % period) + period) % period; yi = ((yi % period) + period) % period; x1 = (xi + 1) % period; y1 = (yi + 1) % period; }
    const a = PERM[(PERM[xi & 255] + yi) & 255], b = PERM[(PERM[x1 & 255] + yi) & 255];
    const c = PERM[(PERM[xi & 255] + y1) & 255], d = PERM[(PERM[x1 & 255] + y1) & 255];
    const u = fade(xf), v = fade(yf);
    const na = GX[a] * xf + GY[a] * yf;
    const nb = GX[b] * (xf - 1) + GY[b] * yf;
    const nc = GX[c] * xf + GY[c] * (yf - 1);
    const nd = GX[d] * (xf - 1) + GY[d] * (yf - 1);
    return (na + (nb - na) * u + ((nc + (nd - nc) * u) - (na + (nb - na) * u)) * v) * 1.5; // ~[-1,1]
}

export function fbm2(x, y, oct = 5, lac = 2, gain = 0.5, period = 0) {
    let s = 0, a = 1, n = 0, f = 1;
    for (let i = 0; i < oct; i++) {
        s += a * perlin2(x * f + i * 17.13, y * f - i * 9.71, period ? period * f : 0);
        n += a; a *= gain; f *= lac;
    }
    return s / n;
}

// ridged multifractal, [0,1]: sharp crests, good for rock and mountain spines
export function ridged2(x, y, oct = 5, lac = 2, gain = 0.5, period = 0) {
    let s = 0, a = 1, n = 0, f = 1, w = 1;
    for (let i = 0; i < oct; i++) {
        let v = 1 - Math.abs(perlin2(x * f + i * 31.7, y * f + i * 11.3, period ? period * f : 0));
        v *= v; v *= w; w = clamp(v * 2, 0, 1);
        s += a * v; n += a; a *= gain; f *= lac;
    }
    return s / n;
}

// cellular (Worley) F1 and cell id, optionally periodic. Returns [f1, f2, id]
const _w = [0, 0, 0];
export function worley2(x, y, period = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
            let cx = xi + i, cy = yi + j;
            let hx = cx, hy = cy;
            if (period) { hx = ((cx % period) + period) % period; hy = ((cy % period) + period) % period; }
            const px = cx + hash2(hx, hy, 11), py = cy + hash2(hx, hy, 23);
            const d = Math.hypot(px - x, py - y);
            if (d < f1) { f2 = f1; f1 = d; id = hash2(hx, hy, 37); } else if (d < f2) f2 = d;
        }
    }
    _w[0] = f1; _w[1] = f2; _w[2] = id;
    return _w;
}

// distance from point to segment, and the parameter along it
export function segDist(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
    const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz || 1), 0, 1);
    return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

// distance to a polyline [[x,z],...]; returns [dist, t along 0..1]
const _pl = [0, 0];
export function polyDist(px, pz, pts) {
    let best = 1e9, bt = 0, acc = 0, total = 0;
    for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
        const vx = bx - ax, vz = bz - az, L = Math.hypot(vx, vz);
        const t = clamp(((px - ax) * vx + (pz - az) * vz) / (L * L || 1), 0, 1);
        const d = Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
        if (d < best) { best = d; bt = (acc + L * t) / total; }
        acc += L;
    }
    _pl[0] = best; _pl[1] = bt;
    return _pl;
}

// Catmull-Rom through points (arrays of equal length), t in [0, n-1]
export function catmull(pts, t, out) {
    const n = pts.length;
    let i = Math.floor(t); if (i > n - 2) i = n - 2; if (i < 0) i = 0;
    const u = t - i;
    const p0 = pts[i > 0 ? i - 1 : 0], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 < n ? i + 2 : n - 1];
    for (let k = 0; k < p1.length; k++) {
        const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
        out[k] = 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
    }
    return out;
}
