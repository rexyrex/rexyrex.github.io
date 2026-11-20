// Animals. Nothing is modelled by hand or loaded: each species is a skeleton
// plus a list of rounded cones ("flesh") around it. At load the cones are
// blended into one implicit surface, that surface is turned into a mesh, the
// mesh is bound to the skeleton by distance, and from then on the bones are
// driven by a few sine waves per gait.
//
// Model space: +x is forward (nose), +y up, +z the animal's left. Metres.
import * as THREE from 'three/webgpu';
import {
    Fn, uniform, texture, vec2, vec3, vec4, float, mix, smoothstep, max, min, abs, clamp, normalize, dot, pow, sin, cos, length, cross, sign, dFdx, dFdy,
    positionGeometry, normalGeometry, positionView, normalView, saturate, attribute, uv,
} from 'three/tsl';
import { mulberry32, clamp as cl, lerp, smoothstep as sstep, catmull } from './noise.js';

// ---- implicit surface ----------------------------------------------------------
// flesh: { a:[x,y,z], b:[x,y,z], ra, rb, sq (lateral squash, 1 = round), k (blend width) }
function makeField(flesh) {
    const F = flesh.map((f) => {
        const sq = f.sq || 1;
        const ax = f.a[0], ay = f.a[1], az = f.a[2] / sq, bx = f.b[0], by = f.b[1], bz = f.b[2] / sq;
        const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz || 1e-9;
        const R = Math.max(f.ra, f.rb) + (f.k || 0.25) + 0.3;
        return { ax, ay, az, dx, dy, dz, l2, ra: f.ra, rb: f.rb, sq, k: f.k || 0.25, sy: f.sy || 1,
            minx: Math.min(f.a[0], f.b[0]) - R, maxx: Math.max(f.a[0], f.b[0]) + R, miny: Math.min(f.a[1], f.b[1]) - R, maxy: Math.max(f.a[1], f.b[1]) + R, minz: Math.min(f.a[2], f.b[2]) - R * sq, maxz: Math.max(f.a[2], f.b[2]) + R * sq };
    });
    return (x, y, z) => {
        let d = 1e9;
        for (let i = 0; i < F.length; i++) {
            const f = F[i];
            if (x < f.minx || x > f.maxx || y < f.miny || y > f.maxy || z < f.minz || z > f.maxz) continue;
            const zz = z / f.sq;
            const px = x - f.ax, py = (y - f.ay), pz = zz - f.az;
            let t = (px * f.dx + py * f.dy + pz * f.dz) / f.l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = px - f.dx * t, qy = (py - f.dy * t) / f.sy, qz = pz - f.dz * t;
            const di = (Math.sqrt(qx * qx + qy * qy + qz * qz) - (f.ra + (f.rb - f.ra) * t)) * Math.min(1, f.sq);
            if (d > 1e8) d = di;
            else { const h = cl(0.5 + 0.5 * (di - d) / f.k, 0, 1); d = di + (d - di) * h - f.k * h * (1 - h); }
        }
        return d;
    };
}

// naive surface nets over a box; returns positions, normals, indices
function surfaceNets(field, box, cell) {
    const nx = Math.ceil((box[3] - box[0]) / cell) + 2, ny = Math.ceil((box[4] - box[1]) / cell) + 2, nz = Math.ceil((box[5] - box[2]) / cell) + 2;
    const V = new Float32Array(nx * ny * nz);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[(k * ny + j) * nx + i] = field(box[0] + i * cell, box[1] + j * cell, box[2] + k * cell);
    const id = new Int32Array(nx * ny * nz).fill(-1);
    const pos = [], idx = [];
    const at = (i, j, k) => V[(k * ny + j) * nx + i];
    const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const c = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let q = 0; q < 8; q++) { const v = at(i + (q & 1), j + ((q >> 1) & 1), k + ((q >> 2) & 1)); c[q] = v; if (v < 0) mask |= 1 << q; }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of EDGES) {
            if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
            const t = c[a] / (c[a] - c[b]);
            sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; n++;
        }
        id[(k * ny + j) * nx + i] = pos.length / 3;
        pos.push(box[0] + (i + sx / n) * cell, box[1] + (j + sy / n) * cell, box[2] + (k + sz / n) * cell);
    }
    const cid = (i, j, k) => id[(k * ny + j) * nx + i];
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const v0 = at(i, j, k) < 0;
        // one quad per sign-changing grid edge leaving (i,j,k) along +x, +y, +z
        if (v0 !== (at(i + 1, j, k) < 0)) { const a = cid(i, j - 1, k - 1), b = cid(i, j, k - 1), d = cid(i, j - 1, k), e = cid(i, j, k); if (v0) idx.push(a, b, e, a, e, d); else idx.push(a, e, b, a, d, e); }
        if (v0 !== (at(i, j + 1, k) < 0)) { const a = cid(i - 1, j, k - 1), b = cid(i, j, k - 1), d = cid(i - 1, j, k), e = cid(i, j, k); if (v0) idx.push(a, e, b, a, d, e); else idx.push(a, b, e, a, e, d); }
        if (v0 !== (at(i, j, k + 1) < 0)) { const a = cid(i - 1, j - 1, k), b = cid(i, j - 1, k), d = cid(i - 1, j, k), e = cid(i, j, k); if (v0) idx.push(a, b, e, a, e, d); else idx.push(a, e, b, a, d, e); }
    }
    const P = new Float32Array(pos), N = new Float32Array(pos.length), e = cell * 0.6;
    for (let i = 0; i < P.length; i += 3) {
        const x = P[i], y = P[i + 1], z = P[i + 2];
        let gx = field(x + e, y, z) - field(x - e, y, z), gy = field(x, y + e, z) - field(x, y - e, z), gz = field(x, y, z + e) - field(x, y, z - e);
        const l = Math.hypot(gx, gy, gz) || 1; N[i] = gx / l; N[i + 1] = gy / l; N[i + 2] = gz / l;
    }
    return { P, N, idx };
}

// ---- species -------------------------------------------------------------------
const mirror = (list) => list.flatMap((b) => { const name = b[0]; if (!name.endsWith('L')) return [b]; const r = b.slice(); r[0] = name.slice(0, -1) + 'R'; if (r[1] && r[1].endsWith('L')) r[1] = r[1].slice(0, -1) + 'R'; r[4] = -r[4]; if (r[5]) r[5] = [r[5][0], r[5][1], -r[5][2]]; return [b, r]; });
const mirrorFlesh = (list) => list.flatMap((f) => (f.m ? [f, { ...f, a: [f.a[0], f.a[1], -f.a[2]], b: [f.b[0], f.b[1], -f.b[2]] }] : [f]));
const C = (a, b, ra, rb, o = {}) => ({ a, b, ra, rb, ...o });

// bones: [name, parent, x, y, z, tip?]. tip closes a leaf bone's segment.
const SPECIES = {
    rex: {
        cell: 0.058, len: 12.2, hip: 3.6,
        bones: mirror([
            ['root', null, 0, 3.72, 0], ['tail1', 'root', -1.0, 3.68, 0], ['tail2', 'tail1', -2.3, 3.6, 0], ['tail3', 'tail2', -3.6, 3.5, 0], ['tail4', 'tail3', -4.9, 3.4, 0], ['tail5', 'tail4', -5.9, 3.34, 0, [-6.9, 3.3, 0]],
            ['chest', 'root', 1.3, 3.62, 0], ['neck', 'chest', 2.5, 3.66, 0], ['neck2', 'neck', 3.08, 4.14, 0], ['head', 'neck2', 3.52, 4.36, 0, [5.02, 4.2, 0]], ['jaw', 'head', 3.62, 4.02, 0, [4.84, 3.84, 0]],
            ['thighL', 'root', 0.05, 3.55, 0.6], ['shinL', 'thighL', 0.78, 2.45, 0.7], ['footL', 'shinL', 0.02, 1.26, 0.68], ['toeL', 'footL', 0.5, 0.2, 0.7, [1.3, 0.1, 0.7]],
            ['armL', 'chest', 2.36, 3.0, 0.5], ['handL', 'armL', 2.3, 2.52, 0.54, [2.68, 2.3, 0.5]],
        ]),
        flesh: mirrorFlesh([
            // trunk: deep and narrow, heaviest over the hips
            C([-0.25, 3.74, 0], [1.3, 3.66, 0], 0.9, 0.88, { sq: 0.7, sy: 1.12, k: 0.45 }), C([1.3, 3.66, 0], [2.45, 3.58, 0], 0.88, 0.66, { sq: 0.72, sy: 1.1, k: 0.45 }),
            C([0.5, 3.12, 0], [1.9, 3.06, 0], 0.56, 0.5, { sq: 0.78, k: 0.4 }),
            C([2.2, 3.34, 0], [2.5, 3.42, 0], 0.62, 0.5, { sq: 0.82, k: 0.35 }),
            C([2.05, 3.5, 0.42], [2.4, 3.15, 0.5], 0.4, 0.28, { m: 1, k: 0.22 }), C([2.7, 3.95, 0.26], [3.3, 4.3, 0.24], 0.28, 0.24, { m: 1, k: 0.18 }), C([3.52, 4.28, 0.3], [3.74, 4.12, 0.3], 0.2, 0.17, { m: 1, k: 0.1 }),
            // tail: thick with muscle at the base, a long taper
            C([-0.25, 3.72, 0], [-2.3, 3.6, 0], 0.84, 0.52, { sq: 0.62, sy: 1.08, k: 0.45 }), C([-2.3, 3.6, 0], [-4.6, 3.44, 0], 0.52, 0.24, { sq: 0.66, k: 0.35 }), C([-4.6, 3.44, 0], [-6.9, 3.3, 0], 0.24, 0.035, { sq: 0.72, k: 0.25 }),
            // neck: an S, slimmer than the chest
            C([2.45, 3.62, 0], [3.08, 4.14, 0], 0.5, 0.38, { sq: 0.66, k: 0.32 }), C([3.08, 4.14, 0], [3.56, 4.36, 0], 0.38, 0.37, { sq: 0.72, k: 0.24 }),
            // skull: a deep box behind, a long snout, ridges over it
            C([3.52, 4.44, 0], [4.08, 4.42, 0], 0.4, 0.37, { sq: 0.86, sy: 1.04, k: 0.18 }), C([4.08, 4.4, 0], [4.98, 4.26, 0], 0.35, 0.2, { sq: 0.7, k: 0.16 }),
            C([3.7, 4.2, 0.28], [3.98, 4.16, 0.26], 0.2, 0.15, { m: 1, k: 0.12 }),
            C([4.14, 4.66, 0.1], [4.82, 4.44, 0.07], 0.085, 0.06, { m: 1, k: 0.07 }),
            C([3.74, 4.78, 0.27], [3.98, 4.74, 0.25], 0.11, 0.08, { m: 1, k: 0.09 }), C([3.56, 4.6, 0.3], [3.72, 4.7, 0.3], 0.1, 0.09, { m: 1, k: 0.09 }),
            // lower jaw: its own bone, hanging a little open
            C([3.62, 4.0, 0], [4.2, 3.9, 0], 0.19, 0.16, { sq: 1.25, k: 0.05 }), C([4.2, 3.9, 0], [4.84, 3.82, 0], 0.16, 0.1, { sq: 1.1, k: 0.05 }),
            C([3.62, 4.04, 0.25], [3.9, 4.0, 0.24], 0.15, 0.11, { m: 1, k: 0.06 }),
            // hind leg: drumstick thigh, lean shank, long foot, three toes
            C([0.05, 3.55, 0.6], [0.78, 2.45, 0.7], 0.62, 0.36, { m: 1, sq: 0.62, k: 0.36 }), C([-0.5, 3.5, 0.34], [0.3, 2.9, 0.62], 0.52, 0.4, { m: 1, sq: 0.7, k: 0.36 }),
            C([0.78, 2.45, 0.7], [0.02, 1.26, 0.68], 0.36, 0.2, { m: 1, k: 0.16 }), C([0.62, 2.3, 0.7], [0.26, 1.75, 0.69], 0.36, 0.26, { m: 1, sq: 0.85, k: 0.14 }),
            C([0.02, 1.26, 0.68], [0.5, 0.24, 0.7], 0.2, 0.19, { m: 1, k: 0.12 }), C([0.02, 1.26, 0.68], [-0.08, 1.32, 0.68], 0.21, 0.19, { m: 1, k: 0.08 }),
            C([0.44, 0.24, 0.7], [0.62, 0.2, 0.7], 0.24, 0.22, { m: 1, sq: 1.25, k: 0.1 }),
            C([0.5, 0.2, 0.7], [1.26, 0.13, 0.7], 0.17, 0.11, { m: 1, k: 0.07 }), C([0.5, 0.2, 0.7], [1.08, 0.13, 1.1], 0.155, 0.1, { m: 1, k: 0.07 }), C([0.5, 0.2, 0.7], [1.08, 0.13, 0.32], 0.155, 0.1, { m: 1, k: 0.07 }),
            C([0.4, 0.3, 0.66], [0.18, 0.2, 0.5], 0.07, 0.05, { m: 1, k: 0.06 }),
            // arm: small, two fingers
            C([2.36, 3.0, 0.5], [2.3, 2.52, 0.54], 0.14, 0.1, { m: 1, k: 0.12 }), C([2.3, 2.52, 0.54], [2.6, 2.34, 0.5], 0.09, 0.06, { m: 1, k: 0.07 }),
        ]),
        // hard parts added as their own little cones: [base x,y,z, tip x,y,z, radius, bone]
        extras: (() => {
            const e = [];
            for (let i = 0; i < 12; i++) { const t = i / 11, x = 4.04 + 0.9 * t, z = 0.275 - 0.13 * t, y = 4.08 + 0.03 * t, L = (0.13 - 0.06 * Math.abs(t - 0.4)) * (0.65 + 0.5 * ((i * 7) % 5) / 4); e.push([x, y, z, x + 0.035, y - L, z + 0.012, 0.03, 'head'], [x, y, -z, x + 0.035, y - L, -z - 0.012, 0.03, 'head']); }
            for (let i = 0; i < 10; i++) { const t = i / 9, x = 4.0 + 0.8 * t, z = 0.215 - 0.1 * t, y = 4.02 - 0.12 * t, L = 0.085 * (0.6 + 0.5 * ((i * 3) % 4) / 3); e.push([x, y, z, x, y + L, z, 0.026, 'jaw'], [x, y, -z, x, y + L, -z, 0.026, 'jaw']); }
            for (const sd of [1, -1]) {
                const b = sd > 0 ? 'toeL' : 'toeR';
                e.push([1.22, 0.16, 0.7 * sd, 1.62, 0.02, 0.7 * sd, 0.1, b], [1.04, 0.16, 1.08 * sd, 1.4, 0.02, 1.22 * sd, 0.09, b], [1.04, 0.16, 0.33 * sd, 1.4, 0.02, 0.2 * sd, 0.09, b], [0.2, 0.2, 0.5 * sd, 0.08, 0.06, 0.4 * sd, 0.05, b]);
                const h = sd > 0 ? 'handL' : 'handR';
                e.push([2.6, 2.34, 0.5 * sd, 2.74, 2.2, 0.5 * sd, 0.04, h], [2.58, 2.36, 0.56 * sd, 2.7, 2.24, 0.62 * sd, 0.035, h]);
            }
            return e;
        })(),
        eyes: [[3.9, 4.6, 0.345]], eyeR: 0.062, nostril: [4.84, 4.4, 0.115], mouth: [3.7, 4.95, 3.9, 4.12],
        look: { base: '#4d4a30', belly: '#a39a79', back: '#231f17', stripe: [2.6, 0.62], scale: 15, face: '#5a3a2a' },
        stance: { L: [0.36, -0.24, -0.06, -0.02], R: [-0.32, 0.04, 0.22, -0.02] },
    },
    sauropod: {
        cell: 0.17, len: 24, hip: 4.3,
        bones: mirror([
            ['root', null, 0, 4.3, 0], ['tail1', 'root', -1.6, 4.1, 0], ['tail2', 'tail1', -3.4, 3.6, 0], ['tail3', 'tail2', -5.3, 3.0, 0], ['tail4', 'tail3', -7.2, 2.4, 0], ['tail5', 'tail4', -9.2, 1.9, 0, [-11.6, 1.5, 0]],
            ['chest', 'root', 3.9, 4.75, 0], ['neck1', 'chest', 5.3, 5.5, 0], ['neck2', 'neck1', 6.9, 6.9, 0], ['neck3', 'neck2', 8.4, 8.4, 0], ['neck4', 'neck3', 9.8, 9.8, 0], ['head', 'neck4', 10.9, 10.7, 0, [11.9, 10.6, 0]],
            ['thighL', 'root', 0.0, 3.7, 1.05], ['shinL', 'thighL', 0.15, 2.0, 1.1], ['footL', 'shinL', -0.05, 0.42, 1.1, [0.1, 0.0, 1.1]],
            ['armL', 'chest', 3.9, 4.0, 1.0], ['foreL', 'armL', 4.05, 2.1, 1.02], ['handL', 'foreL', 3.95, 0.42, 1.02, [4.05, 0.0, 1.02]],
        ]),
        flesh: mirrorFlesh([
            C([-0.3, 4.3, 0], [2.0, 4.45, 0], 1.75, 1.85, { sq: 0.82, k: 0.8 }), C([2.0, 4.45, 0], [4.2, 4.75, 0], 1.85, 1.35, { sq: 0.8, k: 0.8 }),
            C([-0.3, 4.3, 0], [-3.4, 3.6, 0], 1.45, 0.72, { sq: 0.8, k: 0.8 }), C([-3.4, 3.6, 0], [-7.2, 2.4, 0], 0.72, 0.3, { k: 0.5 }), C([-7.2, 2.4, 0], [-11.6, 1.5, 0], 0.3, 0.04, { k: 0.3 }),
            C([4.2, 4.75, 0], [6.9, 6.9, 0], 1.2, 0.66, { sq: 0.85, k: 0.7 }), C([6.9, 6.9, 0], [9.8, 9.8, 0], 0.66, 0.44, { k: 0.4 }), C([9.8, 9.8, 0], [10.9, 10.7, 0], 0.44, 0.36, { k: 0.3 }),
            C([10.8, 10.75, 0], [11.9, 10.58, 0], 0.4, 0.26, { sq: 0.85, k: 0.25 }),
            C([0.0, 3.7, 1.05], [0.15, 2.0, 1.1], 0.86, 0.54, { m: 1, k: 0.5 }), C([0.15, 2.0, 1.1], [-0.05, 0.42, 1.1], 0.52, 0.5, { m: 1, k: 0.3 }), C([-0.05, 0.42, 1.1], [0.12, 0.2, 1.1], 0.52, 0.5, { m: 1, k: 0.2 }),
            C([3.9, 4.0, 1.0], [4.05, 2.1, 1.02], 0.66, 0.44, { m: 1, k: 0.45 }), C([4.05, 2.1, 1.02], [3.95, 0.42, 1.02], 0.42, 0.4, { m: 1, k: 0.3 }), C([3.95, 0.42, 1.02], [4.05, 0.2, 1.02], 0.42, 0.4, { m: 1, k: 0.2 }),
        ]),
        eyes: [[11.15, 10.86, 0.3]], eyeR: 0.07,
        look: { base: '#6b5a44', belly: '#93826a', back: '#3a2f25', stripe: [0.7, 0.6], scale: 9 },
    },
    trike: {
        cell: 0.1, len: 8.5, hip: 2.3,
        bones: mirror([
            ['root', null, 0, 2.3, 0], ['tail1', 'root', -1.1, 2.1, 0], ['tail2', 'tail1', -2.2, 1.75, 0, [-3.5, 1.3, 0]],
            ['chest', 'root', 2.3, 2.3, 0], ['neck', 'chest', 3.0, 2.35, 0], ['head', 'neck', 3.5, 2.35, 0, [5.0, 1.55, 0]],
            ['thighL', 'root', 0.05, 1.9, 0.72], ['shinL', 'thighL', 0.3, 1.0, 0.78], ['footL', 'shinL', 0.0, 0.3, 0.78, [0.15, 0, 0.78]],
            ['armL', 'chest', 2.35, 1.7, 0.74], ['foreL', 'armL', 2.5, 0.9, 0.8], ['handL', 'foreL', 2.4, 0.28, 0.8, [2.55, 0, 0.8]],
        ]),
        flesh: mirrorFlesh([
            C([-0.3, 2.3, 0], [1.3, 2.4, 0], 1.2, 1.32, { sq: 0.9, k: 0.6 }), C([1.3, 2.4, 0], [2.7, 2.3, 0], 1.32, 1.05, { sq: 0.88, k: 0.6 }),
            C([-0.3, 2.3, 0], [-2.2, 1.75, 0], 0.95, 0.38, { k: 0.5 }), C([-2.2, 1.75, 0], [-3.5, 1.3, 0], 0.38, 0.06, { k: 0.3 }),
            C([2.7, 2.3, 0], [3.6, 2.3, 0], 0.9, 0.72, { k: 0.4 }),
            C([3.5, 2.35, 0], [4.4, 1.95, 0], 0.66, 0.46, { sq: 0.85, k: 0.3 }), C([4.4, 1.95, 0], [5.0, 1.52, 0], 0.4, 0.17, { sq: 0.7, k: 0.2 }),
            // frill: a broad shield sweeping up and back from the skull
            C([3.3, 2.75, 0], [2.75, 3.55, 0], 0.5, 0.2, { sq: 2.7, k: 0.3 }), C([3.3, 2.75, 0.55], [2.7, 3.45, 0.9], 0.3, 0.14, { m: 1, sq: 1.6, k: 0.3 }),
            // horns
            C([3.75, 2.75, 0.36], [4.25, 3.3, 0.48], 0.17, 0.09, { m: 1, k: 0.12 }), C([4.25, 3.3, 0.48], [4.85, 3.72, 0.56], 0.09, 0.015, { m: 1, k: 0.06 }),
            C([4.5, 2.05, 0], [4.72, 2.42, 0], 0.13, 0.02, { k: 0.08 }),
            C([0.05, 1.9, 0.72], [0.3, 1.0, 0.78], 0.62, 0.36, { m: 1, k: 0.4 }), C([0.3, 1.0, 0.78], [0.0, 0.3, 0.78], 0.33, 0.28, { m: 1, k: 0.2 }), C([0.0, 0.3, 0.78], [0.15, 0.16, 0.78], 0.3, 0.28, { m: 1, k: 0.15 }),
            C([2.35, 1.7, 0.74], [2.5, 0.9, 0.8], 0.48, 0.3, { m: 1, k: 0.35 }), C([2.5, 0.9, 0.8], [2.4, 0.28, 0.8], 0.28, 0.25, { m: 1, k: 0.2 }), C([2.4, 0.28, 0.8], [2.55, 0.15, 0.8], 0.27, 0.25, { m: 1, k: 0.15 }),
        ]),
        eyes: [[4.02, 2.42, 0.44]], eyeR: 0.07,
        look: { base: '#6b543c', belly: '#998667', back: '#372a20', stripe: [1.0, 0.5], scale: 12, frill: [2.95, 3.25, '#a04d28'] },
    },
    hadro: {
        cell: 0.095, len: 10, hip: 3.0,
        bones: mirror([
            ['root', null, 0, 3.0, 0], ['tail1', 'root', -1.1, 2.95, 0], ['tail2', 'tail1', -2.4, 2.85, 0], ['tail3', 'tail2', -3.7, 2.75, 0], ['tail4', 'tail3', -4.9, 2.65, 0, [-6.1, 2.55, 0]],
            ['chest', 'root', 1.9, 2.9, 0], ['neck1', 'chest', 2.5, 3.15, 0], ['neck2', 'neck1', 3.0, 3.75, 0], ['head', 'neck2', 3.35, 4.2, 0, [4.55, 3.85, 0]],
            ['thighL', 'root', 0.05, 2.7, 0.62], ['shinL', 'thighL', 0.6, 1.6, 0.68], ['footL', 'shinL', -0.15, 0.78, 0.68], ['toeL', 'footL', 0.2, 0.14, 0.7, [0.8, 0.08, 0.72]],
            ['armL', 'chest', 1.95, 2.25, 0.5], ['foreL', 'armL', 2.1, 1.3, 0.52], ['handL', 'foreL', 2.2, 0.4, 0.52, [2.3, 0.05, 0.52]],
        ]),
        flesh: mirrorFlesh([
            C([-0.2, 3.0, 0], [1.2, 3.0, 0], 0.98, 1.0, { sq: 0.78, k: 0.5 }), C([1.2, 3.0, 0], [2.3, 2.95, 0], 1.0, 0.7, { sq: 0.8, k: 0.5 }),
            C([-0.2, 3.0, 0], [-2.4, 2.85, 0], 0.9, 0.62, { sq: 0.55, sy: 1.15, k: 0.5 }), C([-2.4, 2.85, 0], [-4.9, 2.65, 0], 0.62, 0.36, { sq: 0.42, sy: 1.3, k: 0.4 }), C([-4.9, 2.65, 0], [-6.1, 2.55, 0], 0.36, 0.14, { sq: 0.4, sy: 1.3, k: 0.3 }),
            C([2.3, 2.95, 0], [3.0, 3.75, 0], 0.6, 0.36, { sq: 0.85, k: 0.4 }), C([3.0, 3.75, 0], [3.4, 4.2, 0], 0.36, 0.33, { k: 0.3 }),
            C([3.35, 4.22, 0], [4.0, 4.05, 0], 0.34, 0.27, { sq: 0.85, k: 0.2 }), C([4.0, 4.05, 0], [4.55, 3.84, 0], 0.25, 0.17, { sq: 1.35, sy: 0.6, k: 0.15 }),
            // the crest: a hollow tube sweeping back over the neck
            C([3.5, 4.45, 0], [2.7, 5.05, 0], 0.19, 0.14, { k: 0.14 }), C([2.7, 5.05, 0], [1.95, 5.3, 0], 0.14, 0.08, { k: 0.1 }),
            C([0.05, 2.7, 0.62], [0.6, 1.6, 0.68], 0.62, 0.36, { m: 1, sq: 0.75, k: 0.4 }), C([0.6, 1.6, 0.68], [-0.15, 0.78, 0.68], 0.42, 0.25, { m: 1, k: 0.2 }), C([-0.15, 0.78, 0.68], [0.2, 0.18, 0.7], 0.25, 0.21, { m: 1, k: 0.15 }), C([0.2, 0.16, 0.7], [0.8, 0.12, 0.72], 0.21, 0.14, { m: 1, sq: 1.5, k: 0.1 }),
            C([1.95, 2.25, 0.5], [2.1, 1.3, 0.52], 0.3, 0.2, { m: 1, k: 0.25 }), C([2.1, 1.3, 0.52], [2.2, 0.4, 0.52], 0.19, 0.15, { m: 1, k: 0.15 }), C([2.2, 0.4, 0.52], [2.3, 0.14, 0.52], 0.17, 0.16, { m: 1, k: 0.1 }),
        ]),
        eyes: [[3.72, 4.28, 0.27]], eyeR: 0.06,
        look: { base: '#6a5c40', belly: '#948869', back: '#352c1f', stripe: [1.7, 0.7], scale: 13, crest: [2.9, 4.8, '#8e3f28'] },
    },
};

function buildSpecies(def, quality, noiseTex, groundTex, key) {
    const cell = def.cell / Math.max(0.55, Math.sqrt(quality.fauna));
    const field = makeField(def.flesh);
    let box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const f of def.flesh) for (const p of [f.a, f.b]) { const r = Math.max(f.ra, f.rb) * Math.max(1, f.sq || 1) + 0.5; box[0] = Math.min(box[0], p[0] - r); box[1] = Math.min(box[1], p[1] - r); box[2] = Math.min(box[2], p[2] - r); box[3] = Math.max(box[3], p[0] + r); box[4] = Math.max(box[4], p[1] + r); box[5] = Math.max(box[5], p[2] + r); }
    const net = surfaceNets(field, box, cell);
    // hard parts (teeth, claws): small cones, each rigid on one bone
    const xp = [], xn = [], xi = [], xb = [];
    const base0 = net.P.length / 3;
    for (const e of def.extras || []) {
        const ax = e[0], ay = e[1], az = e[2], dx = e[3] - ax, dy = e[4] - ay, dz = e[5] - az, L = Math.hypot(dx, dy, dz) || 1e-6, r = e[6];
        let ux = dy, uy = -dx, uz = 0; if (Math.abs(ux) + Math.abs(uy) < 1e-4) { ux = 1; uy = 0; } const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul;
        const vx = (dy * uz - dz * uy) / L, vy = (dz * ux - dx * uz) / L, vz = (dx * uy - dy * ux) / L;
        const o = base0 + xp.length / 3, S = 6;
        for (let k = 0; k < S; k++) { const a = (k / S) * 6.283, c = Math.cos(a), sn = Math.sin(a); const nx = ux * c + vx * sn, ny = uy * c + vy * sn, nz = uz * c + vz * sn; xp.push(ax + nx * r, ay + ny * r, az + nz * r); xn.push(nx, ny, nz); xb.push(e[7]); }
        xp.push(e[3], e[4], e[5]); xn.push(dx / L, dy / L, dz / L); xb.push(e[7]);
        for (let k = 0; k < S; k++) xi.push(o + k, o + ((k + 1) % S), o + S);
    }
    const P = new Float32Array(net.P.length + xp.length), N = new Float32Array(P.length);
    P.set(net.P); P.set(xp, net.P.length); N.set(net.N); N.set(xn, net.N.length);
    const idx = net.idx.concat(xi);
    const hard = new Float32Array(P.length / 3); for (let i = base0; i < hard.length; i++) hard[i] = 1;

    // bones as segments: each runs to the mean of its children, or to its tip
    const bones = def.bones.map((b) => ({ name: b[0], parent: b[1], x: b[2], y: b[3], z: b[4], tip: b[5] || null }));
    const index = new Map(bones.map((b, i) => [b.name, i]));
    for (const b of bones) {
        const kids = bones.filter((k) => k.parent === b.name);
        if (b.tip) b.end = b.tip;
        else if (kids.length) {
            // follow the child that continues the chain (same side), not a limb branching off
            const main = kids.find((k) => Math.abs(k.z - b.z) < 0.2) || kids[0];
            b.end = [main.x, main.y, main.z];
        } else b.end = [b.x, b.y, b.z];
    }
    const nV = P.length / 3;
    const skinIndex = new Uint16Array(nV * 4), skinWeight = new Float32Array(nV * 4);
    const wj = new Float32Array(bones.length);
    for (let v = 0; v < nV; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
        for (let j = 0; j < bones.length; j++) {
            const b = bones[j], dx = b.end[0] - b.x, dy = b.end[1] - b.y, dz = b.end[2] - b.z, l2 = dx * dx + dy * dy + dz * dz || 1e-9;
            const t = cl(((x - b.x) * dx + (y - b.y) * dy + (z - b.z) * dz) / l2, 0, 1);
            const d2 = (x - b.x - dx * t) ** 2 + (y - b.y - dy * t) ** 2 + (z - b.z - dz * t) ** 2;
            wj[j] = 1 / (d2 * d2 + 1e-5);
        }
        if (v >= base0) { const j = index.get(xb[v - base0]); skinIndex[v * 4] = j; skinWeight[v * 4] = 1; continue; }
        let sum = 0;
        for (let q = 0; q < 4; q++) { let best = -1, bw = 0; for (let j = 0; j < bones.length; j++) if (wj[j] > bw) { bw = wj[j]; best = j; } skinIndex[v * 4 + q] = Math.max(0, best); skinWeight[v * 4 + q] = bw; sum += bw; if (best >= 0) wj[best] = 0; }
        for (let q = 0; q < 4; q++) skinWeight[v * 4 + q] /= sum || 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    geo.setAttribute('hard', new THREE.BufferAttribute(hard, 1));
    geo.setIndex(nV > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, def.hip, 0), def.len);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-def.len, -1, -def.len), new THREE.Vector3(def.len, def.len, def.len));

    return { def, geo, bones, index, material: skinMaterial(def, noiseTex, groundTex), tris: idx.length / 3, key };
}

// Skin, all in the animal's rest pose so it moves with the hide: scales as fine
// relief with larger scutes along the back, a pale belly, a dark back, broken
// vertical bars, a darker mask round the eye, the inside of the mouth, and the
// ivory of teeth and claws.
function skinMaterial(def, noiseTex, groundTex) {
    const L = def.look, col = (h) => { const c = new THREE.Color(h); return vec3(c.r, c.g, c.b); };
    const p = positionGeometry, n = normalGeometry;
    const hard = attribute('hard', 'float');
    const mat = new THREE.MeshStandardNodeMaterial();
    const w = pow(abs(n), vec3(4.0)), ws = w.x.add(w.y).add(w.z);
    const s = L.scale / def.len;
    const tri = (tex, k) => texture(tex, p.zy.mul(k)).mul(w.x).add(texture(tex, p.xz.mul(k)).mul(w.y)).add(texture(tex, p.xy.mul(k)).mul(w.z)).div(ws);
    const fineS = tri(noiseTex, s * 3.0);           // a: small scales
    const scute = tri(noiseTex, s * 1.5);           // a: larger plates
    const grit = tri(groundTex, s * 7.0);
    const broad = tri(noiseTex, s * 0.22);
    const up = n.y;
    const dorsal = smoothstep(0.35, 0.9, up);
    // scale relief: every cell a low dome with a dark groove round it
    const cellH = mix(fineS.a, scute.a, dorsal.mul(0.7));
    const lumps = tri(groundTex, s * 0.9);            // b: soft swellings a hand or two across
    const folds = sin(p.x.mul(def.len * 0.75).add(broad.r.mul(9.0)).add(p.y.mul(2.0))).mul(0.5).add(0.5).mul(smoothstep(0.25, -0.5, up));   // creases across belly and throat
    const height = cellH.mul(0.5).add(grit.b.mul(0.12)).add(lumps.b.mul(0.9)).add(folds.mul(0.5));
    const groove = smoothstep(0.08, 0.42, cellH);

    const bars = smoothstep(0.35, 0.8, sin(p.x.mul(L.stripe[0]).add(broad.r.mul(7.0)).add(p.y.mul(0.9))).mul(0.5).add(0.5)).mul(smoothstep(-0.35, 0.5, up)).mul(L.stripe[1]);
    let c = mix(col(L.belly), col(L.base), smoothstep(-0.8, -0.05, up.add(broad.g.sub(0.5).mul(0.6))));
    c = mix(c, col(L.back), smoothstep(0.3, 0.95, up.add(broad.r.sub(0.5).mul(0.7))).mul(0.8));
    c = mix(c, col(L.back).mul(0.8), bars);
    c = c.mul(mix(0.82, 1.14, broad.g)).mul(mix(0.8, 1.05, groove));
    if (L.face) c = mix(c, col(L.face), smoothstep(def.eyes[0][0] - 0.5, def.eyes[0][0] + 0.9, p.x).mul(smoothstep(def.eyes[0][1] - 0.75, def.eyes[0][1] - 0.2, p.y)).mul(0.55));
    if (L.crest) c = mix(c, col(L.crest[2]), smoothstep(L.crest[1] - 0.4, L.crest[1] + 0.2, p.y).mul(float(1).sub(smoothstep(L.crest[0], L.crest[0] + 0.9, p.x))).mul(0.8));
    if (L.frill) c = mix(c, col(L.frill[2]), smoothstep(L.frill[1] - 0.35, L.frill[1] + 0.25, p.y).mul(smoothstep(L.frill[0] + 0.7, L.frill[0] - 0.1, p.x)).mul(smoothstep(0.3, 0.75, broad.r.add(grit.a.mul(0.3)))).mul(0.85));
    // dust and mud up the legs
    c = mix(c, col('#5a4d3c'), smoothstep(def.hip * 0.34, 0.0, p.y).mul(0.6));
    // the eye: a dark mask, an amber iris, a black pupil
    let eye = float(0), mask = float(0), iris = float(0);
    for (const e of def.eyes) {
        const d = length(vec3(p.x, p.y, abs(p.z)).sub(vec3(e[0], e[1], e[2])));
        eye = max(eye, smoothstep(def.eyeR, def.eyeR * 0.8, d));
        iris = max(iris, smoothstep(def.eyeR * 0.55, def.eyeR * 0.4, d));
        mask = max(mask, smoothstep(def.eyeR * 4.2, def.eyeR * 1.3, d));
    }
    c = mix(c, c.mul(0.45), mask.mul(0.7));
    c = mix(c, col('#b98a2e'), eye);
    c = mix(c, vec3(0.008, 0.007, 0.006), iris);
    if (def.nostril) c = mix(c, vec3(0.02, 0.015, 0.012), smoothstep(0.05, 0.028, length(vec3(p.x, p.y, abs(p.z)).sub(vec3(...def.nostril)))));
    // inside the mouth: what faces the gap between the jaws
    let mouth = float(0);
    if (def.mouth) {
        const [x0, x1, y0, y1] = def.mouth;
        const inGap = smoothstep(x0, x0 + 0.2, p.x).mul(smoothstep(x1 + 0.1, x1 - 0.1, p.x)).mul(smoothstep(y0 - 0.06, y0 + 0.04, p.y)).mul(smoothstep(y1 + 0.06, y1 - 0.04, p.y));
        mouth = inGap.mul(smoothstep(0.35, 0.75, abs(n.y))).mul(smoothstep(0.3, 0.12, abs(p.z)));
        c = mix(c, col('#5c2a2a'), mouth.mul(0.9));
    }
    // teeth and claws
    const ivory = mix(col('#b9ac84'), col('#5a4f3a'), smoothstep(0.4, 0.0, p.y)).mul(mix(0.7, 1.0, grit.b));      // claws are horn, teeth are stained ivory
    mat.colorNode = mix(c, ivory, hard);
    mat.roughnessNode = mix(mix(mix(mix(float(0.46), float(0.8), groove.oneMinus().mul(0.6).add(lumps.b.mul(0.4))), 0.22, mouth), 0.06, eye), 0.3, hard);
    mat.metalnessNode = float(0);
    mat.specularIntensity = 0.7;
    // bump from the scale relief, without needing a parameterisation
    const bumpH = height.mul(def.len * 0.0019).mul(float(1).sub(hard));
    mat.normalNode = Fn(() => {
        const dpdx = dFdx(positionView), dpdy = dFdy(positionView);
        const r1 = cross(dpdy, normalView), r2 = cross(normalView, dpdx);
        const det = dot(dpdx, r1);
        const grad = sign(det).mul(dFdx(bumpH).mul(r1).add(dFdy(bumpH).mul(r2)));
        return normalize(abs(det).mul(normalView).sub(grad.mul(float(1).sub(eye))));
    })();
    mat.envMapIntensity = 1.0;
    return mat;
}

// ---- an individual -------------------------------------------------------------
class Animal {
    constructor(species, scale = 1, seed = 1) {
        this.species = species; this.scale = scale; this.seed = seed;
        const bones = species.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; return o; });
        species.bones.forEach((b, i) => {
            const par = b.parent ? species.bones[species.index.get(b.parent)] : null;
            bones[i].position.set(b.x - (par ? par.x : 0), b.y - (par ? par.y : 0), b.z - (par ? par.z : 0));
            if (par) bones[species.index.get(b.parent)].add(bones[i]);
        });
        this.bone = {}; species.bones.forEach((b, i) => { this.bone[b.name] = bones[i]; });
        this.rest = species.bones.map((b, i) => bones[i].position.clone());
        this.mesh = new THREE.SkinnedMesh(species.geo, species.material);
        this.mesh.add(bones[0]);
        this.mesh.bind(new THREE.Skeleton(bones));
        this.mesh.castShadow = true; this.mesh.receiveShadow = true;
        this.mesh.scale.setScalar(scale);
        this.mesh.frustumCulled = false;
        this.root = bones[0]; this.rootRest = this.rest[0].clone();
        this.phase = seed * 6.283; this.speed = 0; this.gait = 'idle';
        this.x = 0; this.z = 0; this.heading = 0; this.drop = 0;
        // a soft pool of shade under the body: the contact the cast shadow alone does not give
        const d = species.def;
        const bm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
        const r = length(uv().sub(0.5).mul(2.0));
        bm.colorNode = vec3(0.0); bm.opacityNode = smoothstep(1.0, 0.1, r).mul(0.2);
        const bg = new THREE.PlaneGeometry(d.len * 0.5 * scale, d.len * 0.17 * scale); bg.rotateX(-Math.PI / 2);
        this.blob = new THREE.Mesh(bg, bm); this.blob.renderOrder = 5;
    }

    // place the animal on the ground at (x, z), facing `heading` (0 = north / -z, clockwise)
    place(island, x, z, heading, sink = 0) {
        this.x = x; this.z = z; this.heading = heading;
        const m = this.mesh;
        // model +x is forward; a heading of 0 must face -z
        m.rotation.set(0, Math.PI / 2 - heading, 0);
        const fx = Math.sin(heading), fz = -Math.cos(heading);
        const L = this.species.def.len * 0.18 * this.scale;
        const hf = island.heightAt(x + fx * L, z + fz * L), hb = island.heightAt(x - fx * L, z - fz * L), hc = island.heightAt(x, z);
        const y = Math.max(Math.min(hf, hb, hc), -this.species.def.hip * this.scale * 0.55);
        m.position.set(x, y - sink, z);
        this.pitch = Math.atan2(hf - hb, 2 * L) * 0.6;
        this.grounded = false;
        if (this.blob) {
            island.normalAt(x, z, _n3, 3);
            _nv.set(_n3[0], _n3[1], _n3[2]);
            this.blob.quaternion.setFromUnitVectors(_up, _nv).multiply(_q.setFromAxisAngle(_up, m.rotation.y));
            this.blob.position.set(x, hc - sink, z).addScaledVector(_nv, 0.07);
        }
    }

    // after a pose is set: lower or raise the body until the lowest toe is on the ground
    settle() {
        const d = this.species.def;
        this.mesh.updateMatrixWorld(true);
        let low = 1e9;
        for (const b of this.species.bones) {
            if (!b.tip || !/^(toe|foot|hand)/.test(b.name)) continue;
            if (/^hand/.test(b.name) && this.species.key === 'rex') continue;
            const bone = this.bone[b.name];
            _v.set(b.tip[0] - b.x, b.tip[1] - b.y, b.tip[2] - b.z).applyMatrix4(bone.matrixWorld);
            low = Math.min(low, (_v.y - this.mesh.position.y) / this.scale);
        }
        if (low < 1e8) this.drop = (this.drop || 0) + (low - 0.1);
        this.grounded = true;
    }

    animate(t, dt) {
        const B = this.bone, d = this.species.def, key = this.species.key, s = this.seed;
        const walking = this.gait === 'walk';
        const f = walking ? this.freq : 0;
        this.phase += dt * f * 6.283;
        const ph = this.phase;
        const a = walking ? 1 : 0;
        const breath = Math.sin(t * 0.9 + s * 9);
        const slow = Math.sin(t * 0.23 + s * 17), slow2 = Math.sin(t * 0.37 + s * 5.3);
        // body
        this.root.position.copy(this.rootRest); this.root.position.y += a * 0.035 * d.hip * Math.sin(ph * 2) + 0.004 * d.hip * breath - (walking ? 0 : (this.drop || 0));
        this.root.rotation.set(a * 0.035 * Math.sin(ph), a * 0.05 * Math.sin(ph), (this.pitch || 0) + a * 0.012 * Math.sin(ph * 2));
        // tail: a travelling wave
        for (let i = 1; i <= 5; i++) { const b = B['tail' + i]; if (!b) break; b.rotation.set(0, (0.06 + 0.05 * a) * Math.sin(ph - i * 0.8 + (a ? 0 : t * 0.5 + s * 3)) * (1 + i * 0.25) + 0.05 * slow + (this.seed > 0.5 ? 0.07 : -0.07), 0.03 * Math.sin(t * 0.4 + i + s) - (key === 'sauropod' ? 0.0 : 0.035)); }
        if (B.chest) B.chest.rotation.set(0, -a * 0.04 * Math.sin(ph), 0.012 * breath);

        const leg = (side, phase, thigh, shin, foot, toe) => {
            const p = ph + phase, sn = Math.sin(p), cs = Math.cos(p);
            const swing = Math.max(0, cs);                 // lifted while moving forward
            if (key === 'sauropod' || key === 'trike') {
                B[thigh + side].rotation.z = a * (0.26 * sn);
                B[shin + side].rotation.z = -a * (0.34 * swing) - 0.03;
                if (B[foot + side]) B[foot + side].rotation.z = a * (0.22 * swing - 0.12 * sn);
            } else {
                B[thigh + side].rotation.z = a * (0.42 * sn) + 0.04;
                B[shin + side].rotation.z = -a * (0.55 * swing + 0.1 * (1 - sn)) - 0.06;
                B[foot + side].rotation.z = a * (0.5 * swing - 0.22 * sn) + 0.05;
                if (B[toe + side]) B[toe + side].rotation.z = -a * (0.55 * swing) + a * 0.18 * Math.max(0, -cs);
            }
        };
        if (key === 'rex') {
            leg('L', 0, 'thigh', 'shin', 'foot', 'toe'); leg('R', Math.PI, 'thigh', 'shin', 'foot', 'toe');
            if (!walking && d.stance) for (const sd of ['L', 'R']) { const q = d.stance[sd]; B['thigh' + sd].rotation.z += q[0]; B['shin' + sd].rotation.z += q[1]; B['foot' + sd].rotation.z += q[2]; B['toe' + sd].rotation.z += q[3] - (q[0] + q[1] + q[2]); }
            if (B.neck2) B.neck2.rotation.set(0, 0.1 * slow2, 0.04 * slow);
            B.neck.rotation.set(0, 0.16 * slow + a * 0.03 * Math.sin(ph + 1), -0.14 + 0.05 * slow2 - a * 0.03 * Math.sin(ph * 2));
            B.head.rotation.set(0.04 * slow2, 0.22 * slow2 + 0.1 * slow, 0.06 * Math.sin(t * 0.31 + s) + 0.03);
            // now and then the jaw drops: a long, slow gape
            const gape = Math.pow(Math.max(0, Math.sin(t * 0.17 + s * 11)), 24);
            B.jaw.rotation.z = -0.03 - 0.42 * gape + 0.012 * breath;
            for (const sd of ['L', 'R']) { B['arm' + sd].rotation.z = 0.2 + 0.08 * Math.sin(t * 0.7 + s + (sd === 'L' ? 0 : 2)); B['hand' + sd].rotation.z = -0.3 + 0.1 * Math.sin(t * 0.9 + s); }
        } else if (key === 'sauropod') {
            leg('L', 0, 'thigh', 'shin', 'foot'); leg('R', Math.PI, 'thigh', 'shin', 'foot');
            leg('L', Math.PI * 0.5, 'arm', 'fore', 'hand'); leg('R', Math.PI * 1.5, 'arm', 'fore', 'hand');
            const reach = this.reach || 0;                 // > 0 lowers the neck to browse or drink
            for (let i = 1; i <= 4; i++) B['neck' + i].rotation.set(0, 0.07 * Math.sin(t * 0.19 + i * 0.6 + s * 7) + a * 0.012 * Math.sin(ph + i), -reach * 0.3 + 0.025 * Math.sin(t * 0.27 + i + s * 3));
            B.head.rotation.set(0, 0.2 * slow, reach * 0.9 + 0.12 * slow2);
        } else if (key === 'trike') {
            leg('L', 0, 'thigh', 'shin', 'foot'); leg('R', Math.PI, 'thigh', 'shin', 'foot');
            leg('L', Math.PI * 0.5, 'arm', 'fore', 'hand'); leg('R', Math.PI * 1.5, 'arm', 'fore', 'hand');
            const graze = this.reach || 0;
            B.neck.rotation.set(0, 0.12 * slow, -graze * 0.25 + 0.04 * slow2);
            B.head.rotation.set(0.05 * slow2, 0.22 * slow2, -graze * 0.35 + 0.06 * slow);
        } else if (key === 'hadro') {
            leg('L', 0, 'thigh', 'shin', 'foot', 'toe'); leg('R', Math.PI, 'thigh', 'shin', 'foot', 'toe');
            leg('L', Math.PI * 0.5, 'arm', 'fore', 'hand'); leg('R', Math.PI * 1.5, 'arm', 'fore', 'hand');
            const drink = this.reach || 0;
            B.neck1.rotation.set(0, 0.1 * slow, -drink * 0.55 + 0.05 * slow2); B.neck2.rotation.set(0, 0.12 * slow2, -drink * 0.35);
            B.head.rotation.set(0.04 * slow, 0.2 * slow2, drink * 0.25 + 0.08 * slow);
        }
    }
}

// ---- pterosaurs: simple enough to model directly -------------------------------
function pterosaurGeometry() {
    const pos = [], nor = [], aux = [], idx = [];
    const v = (x, y, z, flap, dark) => { pos.push(x, y, z); nor.push(0, 1, 0); aux.push(flap, dark); return pos.length / 3 - 1; };
    // wing: leading edge shoulder -> elbow -> wrist -> tip; trailing edge runs to the ankle
    const lead = [[0.35, 0.05, 0.25], [0.75, 0.12, 1.1], [0.25, 0.1, 1.9], [-0.55, 0.0, 3.6]];
    const trail = [[-0.9, -0.02, 0.2], [-0.75, 0.0, 0.9], [-0.7, 0.02, 1.7], [-0.62, 0.0, 3.5]];
    for (const side of [1, -1]) {
        const base = pos.length / 3;
        for (let i = 0; i < 4; i++) { const f = i / 3; v(lead[i][0], lead[i][1], lead[i][2] * side, f, 0.25 + 0.6 * f); v((lead[i][0] + trail[i][0]) / 2, (lead[i][1] + trail[i][1]) / 2 - 0.03, ((lead[i][2] + trail[i][2]) / 2) * side, f, 0.1 + 0.5 * f); v(trail[i][0], trail[i][1], trail[i][2] * side, f, 0.2 + 0.7 * f); }
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const a = base + i * 3 + j, b = a + 3; if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    // body, neck, head with a long beak and a back-swept crest: a lofted diamond section
    const ring = (x, y, r, flap, dark) => [v(x, y + r, 0, flap, dark), v(x, y, r * 0.8, flap, dark), v(x, y - r * 0.8, 0, flap, dark + 0.2), v(x, y, -r * 0.8, flap, dark)];
    const rings = [ring(-1.0, 0, 0.03, 0, 0.5), ring(-0.5, 0, 0.16, 0, 0.3), ring(0.2, 0.02, 0.2, 0, 0.3), ring(0.65, 0.12, 0.12, 0, 0.3), ring(1.05, 0.34, 0.09, 0, 0.3), ring(1.3, 0.42, 0.13, 0, 0.35), ring(1.75, 0.36, 0.07, 0, 0.6), ring(2.45, 0.22, 0.012, 0, 0.8)];
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < 4; j++) { const a = rings[i][j], b = rings[i][(j + 1) % 4], c = rings[i + 1][j], d = rings[i + 1][(j + 1) % 4]; idx.push(a, c, b, b, c, d); }
    const c0 = v(1.2, 0.5, 0, 0, 0.9), c1 = v(0.55, 0.78, 0, 0, 1.0), c2 = v(1.42, 0.5, 0, 0, 0.9);
    idx.push(c0, c1, c2, c0, c2, c1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(aux), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    { const n = g.attributes.normal; for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
    return g;
}

// ---- the menagerie -------------------------------------------------------------
export function createFauna({ island, places, quality, noiseTex, groundTex, sites }) {
    const group = new THREE.Group(); group.name = 'fauna';
    const sp = {};
    const rnd = mulberry32(555);
    const animals = [];
    const build = (key) => { if (!sp[key]) sp[key] = buildSpecies(SPECIES[key], quality, noiseTex, groundTex, key); return sp[key]; };
    const spawn = (key, scale, opt = {}) => { const a = new Animal(build(key), scale, rnd()); Object.assign(a, opt); group.add(a.mesh); group.add(a.blob); animals.push(a); return a; };

    // the rex: one animal, moved to wherever the visitor is going
    const rex = spawn('rex', 1, { gait: 'idle', home: null });
    let rexPlace = -1;
    const setRex = (i) => {
        const p = places[i];
        if (!p || !p.rex) { rex.mesh.visible = false; rex.blob.visible = false; rexPlace = i; return; }
        rex.mesh.visible = true; rex.blob.visible = true; rex.drop = 0; rex.place(island, p.rex.x, p.rex.z, p.rex.heading); rexPlace = i;
    };

    // herds that walk a loop
    const herds = [];
    const addHerd = (key, n, path, { speed, scaleMin = 0.8, scaleMax = 1.1, spread = 14, range = 900 }) => {
        let total = 0; const seg = [0];
        for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length]; total += Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(total); }
        const members = [];
        for (let i = 0; i < n; i++) { const s = lerp(scaleMin, scaleMax, rnd()); const a = spawn(key, s, { gait: 'walk' }); const stride = SPECIES[key].len * 0.3 * s; a.freq = speed / stride * 0.5; members.push({ a, off: (i / n) * Math.min(total * 0.5, n * SPECIES[key].len * 0.9) + rnd() * 6, lat: (rnd() - 0.5) * spread, sp: speed * lerp(0.92, 1.06, rnd()) }); }
        herds.push({ path, total, seg, members, cx: path.reduce((s, p) => s + p[0], 0) / path.length, cz: path.reduce((s, p) => s + p[1], 0) / path.length, range });
    };
    const P4 = [0, 0];
    const along = (h, dist, out) => {
        let d = ((dist % h.total) + h.total) % h.total, n = h.path.length, i = 0;
        while (i < n - 1 && h.seg[i + 1] < d) i++;
        const u = (d - h.seg[i]) / (h.seg[i + 1] - h.seg[i] || 1);
        const p0 = h.path[(i + n - 1) % n], p1 = h.path[i], p2 = h.path[(i + 1) % n], p3 = h.path[(i + 2) % n];
        for (let k = 0; k < 2; k++) { const a = p0[k], b = p1[k], c = p2[k], e = p3[k]; out[k] = 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - e) * u * u + (3 * b - a - 3 * c + e) * u * u * u); }
        return out;
    };

    // sauropods on the plain, along the trail
    addHerd('sauropod', quality.fauna >= 1 ? 5 : 3, [[-190, 196], [-90, 150], [20, 172], [130, 190], [210, 150], [150, 96], [20, 110], [-110, 120]], { speed: 1.5, scaleMin: 0.72, scaleMax: 1.08, spread: 22 });
    // ceratopsians near the nesting ground
    addHerd('trike', quality.fauna >= 1 ? 4 : 2, [[-235, 300], [-196, 232], [-120, 214], [-84, 262], [-110, 318], [-180, 334]], { speed: 1.0, scaleMin: 0.8, scaleMax: 1.05, spread: 9 });

    // hadrosaurs wading in the shallows, set in front of the lagoon stop's camera: side-on to the
    // lens, at different depths, heads going down to drink and up again
    const waders = [];
    {
        const pl = places.find((q) => q.id === 'music');
        const dx0 = pl.look[0] - pl.cam[0], dz0 = pl.look[2] - pl.cam[2], dl = Math.hypot(dx0, dz0), fx = dx0 / dl, fz = dz0 / dl;
        const want = quality.fauna >= 1 ? 5 : 3, spots = [];
        for (let i = 0; i < 400 && spots.length < want; i++) {
            const t = lerp(16, 85, rnd()), lat = lerp(-0.5, 0.5, rnd()) * t;
            const x = pl.cam[0] + fx * t - fz * lat, z = pl.cam[2] + fz * t + fx * lat, h = island.heightAt(x, z);
            if (h > -0.12 || h < -1.05) continue;
            if (spots.some((q) => Math.hypot(q[0] - x, q[1] - z) < 17)) continue;
            spots.push([x, z]);
        }
        for (const [x, z] of spots) {
            const a = spawn('hadro', lerp(0.82, 1.08, rnd()), { gait: 'idle' });
            a.place(island, x, z, Math.atan2(-fz, -fx) + (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.9); waders.push(a);
        }
    }
    // a few sauropods browsing at the forest edge by the lake, for scale
    const browsers = [];
    for (const [x, z, hd, s] of [[sites.music.x + 150, sites.music.z - 190, 2.2, 1.05], [sites.music.x + 190, sites.music.z - 205, 2.8, 0.85]]) { if (island.heightAt(x, z) < 0.6) continue; const a = spawn('sauropod', s, { gait: 'idle' }); a.place(island, x, z, hd); browsers.push(a); }

    // ---- pterosaurs: instanced gliders circling the sea cliffs and drifting over the island
    const pgeo = pterosaurGeometry();
    const NP = Math.round(22 * Math.min(1, quality.fauna + 0.2));
    const pmat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
    const uFlapT = uniform(0);
    const pA = new Float32Array(NP * 4), pB = new Float32Array(NP * 4);
    const flock = [];
    for (let i = 0; i < NP; i++) {
        const near = i < NP * 0.62;
        const c = near ? [sites.balloons.x - 70 + (rnd() - 0.5) * 220, sites.balloons.z - 20 + (rnd() - 0.5) * 220] : [(rnd() - 0.5) * 1100, (rnd() - 0.5) * 1100];
        flock.push({ cx: c[0], cz: c[1], r: lerp(30, 120, rnd()) * (near ? 1 : 2.2), h: (near ? lerp(55, 130, rnd()) : lerp(150, 330, rnd())), w: lerp(0.05, 0.12, rnd()) * (rnd() < 0.5 ? 1 : -1) / (near ? 1 : 2), ph: rnd() * 6.283, s: lerp(0.8, 1.3, rnd()) });
    }
    {
        const g = new THREE.InstancedBufferGeometry();
        g.index = pgeo.index; for (const k of Object.keys(pgeo.attributes)) g.setAttribute(k, pgeo.attributes[k]);
        const aA = new THREE.InstancedBufferAttribute(pA, 4), aB = new THREE.InstancedBufferAttribute(pB, 4);
        aA.setUsage(THREE.DynamicDrawUsage); aB.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('iA', aA); g.setAttribute('iB', aB); g.instanceCount = NP;
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
        const { positionLocal, normalLocal, cameraViewMatrix } = TSL;
        const iA = attribute('iA', 'vec4'), iB = attribute('iB', 'vec4'), ax = attribute('aux', 'vec2');
        const yaw = iB.x, bank = iB.y, flap = iB.z;
        const tf = (v) => {
            // flap: wings hinge at the shoulder, more toward the tip
            const lift = ax.x.mul(ax.x).mul(flap).mul(1.7);
            const p0 = vec3(v.x, v.y.add(abs(v.z).mul(lift).mul(0.5)), v.z.mul(float(1).sub(abs(lift).mul(0.12))));
            // bank about the body axis, then yaw
            const cb = cos(bank), sb = sin(bank);
            const p1 = vec3(p0.x, p0.y.mul(cb).sub(p0.z.mul(sb)), p0.y.mul(sb).add(p0.z.mul(cb)));
            const cy = cos(yaw), sy = sin(yaw);
            return vec3(p1.x.mul(cy).add(p1.z.mul(sy)), p1.y, p1.z.mul(cy).sub(p1.x.mul(sy)));
        };
        pmat.positionNode = tf(positionLocal.mul(iA.w)).add(iA.xyz);
        pmat.normalNode = normalize(tf(normalLocal)).transformDirection(cameraViewMatrix);
        const body = new THREE.Color('#8d8573'), tip = new THREE.Color('#2b2620'), crest = new THREE.Color('#a8492a');
        pmat.colorNode = mix(mix(vec3(body.r, body.g, body.b), vec3(tip.r, tip.g, tip.b), smoothstep(0.3, 0.8, ax.y)), vec3(crest.r, crest.g, crest.b), smoothstep(0.85, 0.95, ax.y));
        pmat.roughnessNode = float(0.75);
        const m = new THREE.Mesh(g, pmat); m.castShadow = false; m.frustumCulled = false; m.name = 'pterosaurs';
        group.add(m);
        flock.attrA = aA; flock.attrB = aB;
    }

    const update = (t, dt, camera) => {
        const cx = camera.position.x, cz = camera.position.z;
        for (const h of herds) {
            const vis = Math.hypot(h.cx - cx, h.cz - cz) < h.range;
            for (const m of h.members) {
                m.a.mesh.visible = vis; m.a.blob.visible = vis; if (!vis) continue;
                const d = m.off + t * m.sp;
                along(h, d, P4); const x0 = P4[0], z0 = P4[1]; along(h, d + 2.5, P4);
                const hx = P4[0] - x0, hz = P4[1] - z0, hl = Math.hypot(hx, hz) || 1;
                const x = x0 + (-hz / hl) * m.lat, z = z0 + (hx / hl) * m.lat;
                m.a.place(island, x, z, Math.atan2(hx, -hz));
                m.a.animate(t, dt);
            }
        }
        for (const a of waders) { a.reach = 0.5 + 0.5 * Math.sin(t * 0.21 + a.seed * 20); a.animate(t, dt); }
        for (const a of browsers) { a.reach = 0.25 + 0.25 * Math.sin(t * 0.13 + a.seed * 20); a.animate(t, dt); }
        if (rex.mesh.visible) { rex.animate(t, dt); if (!rex.grounded) { rex.settle(); rex.animate(t, 0); } }
        for (let i = 0; i < flock.length; i++) {
            const f = flock[i], a = f.ph + t * f.w * (60 / f.r) * 0.6;
            const x = f.cx + Math.cos(a) * f.r, z = f.cz + Math.sin(a) * f.r * 0.8;
            const dirx = -Math.sin(a) * Math.sign(f.w), dirz = Math.cos(a) * 0.8 * Math.sign(f.w);
            pA[i * 4] = x; pA[i * 4 + 1] = f.h + 6 * Math.sin(t * 0.21 + f.ph * 3); pA[i * 4 + 2] = z; pA[i * 4 + 3] = f.s;
            // model +x forward: yaw so that +x maps to (dirx, dirz)
            pB[i * 4] = Math.atan2(-dirz, dirx); pB[i * 4 + 1] = -Math.sign(f.w) * 0.38;
            // mostly gliding; a few slow beats now and then
            const beat = Math.max(0, Math.sin(t * 0.33 + f.ph * 5)); pB[i * 4 + 2] = Math.sin(t * 5.2 + f.ph * 7) * 0.5 * beat * beat + 0.12;
        }
        flock.attrA.needsUpdate = true; flock.attrB.needsUpdate = true;
    };

    let tris = 0; for (const k of Object.keys(sp)) tris += sp[k].tris;
    return { group, update, setRex, rex, animals, stats: { animals: animals.length, pterosaurs: NP, meshTris: tris, species: Object.fromEntries(Object.keys(sp).map((k) => [k, sp[k].tris])) }, get rexPlace() { return rexPlace; } };
}

import * as TSL from 'three/tsl';
const _v = new THREE.Vector3(), _nv = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _n3 = [0, 1, 0];
