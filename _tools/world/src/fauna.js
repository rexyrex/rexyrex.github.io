// Animals. Nothing is modelled by hand or loaded: each species is a skeleton
// plus a list of rounded cones ("flesh") around it. At load the cones are
// blended into one implicit surface (some of them cut into it instead: the
// mouth, the eye sockets, the nostrils), that surface is turned into a mesh
// (a finer one over the head, the hands and the feet), the mesh is bound to the
// skeleton, and from then on the bones are driven by a few sine waves per gait.
// Teeth, claws, eyeballs and eyelids are small meshes of their own, each rigid
// on one bone.
//
// Model space: +x is forward (nose), +y up, +z the animal's left. Metres.
import * as THREE from 'three/webgpu';
import {
    Fn, texture, vec2, vec3, float, mix, max, abs, normalize, dot, cross, sin, cos, sqrt, atan, step, length, dFdx, dFdy,
    positionGeometry, normalGeometry, positionView, normalView, positionWorld, normalWorld, normalWorldGeometry, attribute, uv,
} from 'three/tsl';
import { smoothstep } from './tsl.js';
import { mulberry32, clamp as cl, lerp, smoothstep as sstep } from './noise.js';
import { createFlock, wingStroke } from './pterosaur.js';

const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---- implicit surface ----------------------------------------------------------
// flesh: { a:[x,y,z], b:[x,y,z], ra, rb, sq (lateral squash, 1 = round), sy (the same, upward), k (blend width),
//          neg (cut out of what came before it instead of added), bone (what it is rigid on), mat (what it is painted as) }
// The list is worked through in order, so a cut only removes what stands before it in the list.
// rig: { bones (as segments), only (bones that take no flesh but what names them), S }. With it, every piece of
// flesh is put in a group by the bones it hangs on: the one it names (`bone`: rigid on it), the ones it lists
// (`bones`), or else the ones that run through it. The hide is then bound to the bones of the flesh under it, and
// not simply to whichever bones are nearest: bound that way the skin under the belly followed both thighs at once,
// and tore between them as they swung.
function makeField(flesh, rig = null) {
    const tags = [...new Set(flesh.filter((f) => !f.neg && f.bone).map((f) => f.bone))], mats = [...new Set(flesh.filter((f) => f.mat).map((f) => f.mat))];
    const groups = tags.map((t) => ({ bones: [t], rigid: true })), gkey = new Map();
    const F = flesh.map((f) => {
        const sq = f.sq || 1, sy = f.sy || 1, k = f.k || 0.25;
        const ax = f.a[0], ay = f.a[1], az = f.a[2] / sq, bx = f.b[0], by = f.b[1], bz = f.b[2] / sq;
        const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz || 1e-9;
        const rm = Math.max(f.ra, f.rb), slack = f.neg ? 0.02 : Math.min(0.3, rm * 1.5 + 0.05);          // how far out a cone still matters
        const R = rm + k + slack, Ry = rm * Math.max(1, sy) + k + slack;
        return { ax, ay, az, dx, dy, dz, l2, ra: f.ra, rb: f.rb, sq, k, sy, neg: !!f.neg, tag: f.neg ? -1 : f.bone ? tags.indexOf(f.bone) : tags.length, mat: f.mat ? mats.indexOf(f.mat) : -1, mt: f.mt || 0.03,
            minx: Math.min(f.a[0], f.b[0]) - R, maxx: Math.max(f.a[0], f.b[0]) + R, miny: Math.min(f.a[1], f.b[1]) - Ry, maxy: Math.max(f.a[1], f.b[1]) + Ry, minz: Math.min(f.a[2], f.b[2]) - R * sq, maxz: Math.max(f.a[2], f.b[2]) + R * sq };
    });
    const dist = (f, x, y, z) => {
        const px = x - f.ax, py = y - f.ay, pz = z / f.sq - f.az;
        let t = (px * f.dx + py * f.dy + pz * f.dz) / f.l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px - f.dx * t, qy = (py - f.dy * t) / f.sy, qz = pz - f.dz * t;
        return (Math.sqrt(qx * qx + qy * qy + qz * qz) - (f.ra + (f.rb - f.ra) * t)) * Math.min(1, f.sq);
    };
    // The groups. Flesh that names no bone hangs on the bones that run through it (most of their length inside
    // it), or failing that on the one that comes nearest; and flesh on the midline (trunk, belly, neck, tail) is
    // never hung on a limb, however much of the limb's bone lies in it.
    F.forEach((f, i) => {
        if (f.neg || f.tag < tags.length) return;
        let set = flesh[i].bones || null;
        if (!set && rig) {
            const axial = flesh[i].a[2] === 0 && flesh[i].b[2] === 0;
            const score = rig.bones.filter((b) => !rig.only.has(b.name) && !(axial && Math.abs(b.z) > 0.02 * rig.S)).map((b) => {
                let inside = 0, near = 1e9;
                for (let q = 0; q < 5; q++) { const u = q / 4, d = dist(f, b.x + (b.end[0] - b.x) * u, b.y + (b.end[1] - b.y) * u, b.z + (b.end[2] - b.z) * u); if (d < 0.06 * rig.S) inside++; if (d < near) near = d; }
                return [inside, near, b.name];
            });
            set = score.filter((q) => q[0] >= 3).map((q) => q[2]);
            if (!set.length) set = [score.reduce((a, b) => (b[0] > a[0] || (b[0] === a[0] && b[1] < a[1]) ? b : a))[2]];
        }
        const key = set ? set.join(',') : '*';
        if (!gkey.has(key)) { gkey.set(key, groups.length); groups.push({ bones: set, rigid: false }); }
        f.tag = gkey.get(key);
    });
    // slabs along the animal's length, each with the cones that reach into it (in their order)
    let x0 = 1e9, x1 = -1e9; for (const f of F) { x0 = Math.min(x0, f.minx); x1 = Math.max(x1, f.maxx); }
    const NB = 96, inv = NB / (x1 - x0 || 1);
    const slabs = (list) => { const bins = []; for (let b = 0; b < NB; b++) { const lo = x0 + b / inv, hi = x0 + (b + 1) / inv; bins.push(list.filter((f) => f.maxx >= lo && f.minx <= hi)); } return bins; };
    const bins = slabs(F);
    const fieldIn = (bins) => (x, y, z) => {
        let d = 1e9;
        const bi = Math.floor((x - x0) * inv); if (bi < 0 || bi >= NB) return d;
        const B = bins[bi];
        for (let i = 0; i < B.length; i++) {
            const f = B[i];
            if (x < f.minx || x > f.maxx || y < f.miny || y > f.maxy || z < f.minz || z > f.maxz) continue;
            const di = dist(f, x, y, z);
            if (f.neg) { if (d < 1e8) { const h = cl(0.5 - 0.5 * (d + di) / f.k, 0, 1); d = d + (-di - d) * h + f.k * h * (1 - h); } }
            else if (d > 1e8) d = di;
            else { const h = cl(0.5 + 0.5 * (di - d) / f.k, 0, 1); d = di + (d - di) * h - f.k * h * (1 - h); }
        }
        return d;
    };
    const field = fieldIn(bins);
    // the animal without the flesh that is rigid on other bones than this one: what a jaw is shut in by when the mouth is open
    const fieldOf = (tag) => fieldIn(slabs(F.filter((f) => f.neg || f.tag === tag || f.tag >= tags.length)));
    // whose flesh a point belongs to (dTag: distance to each group) and what it is painted as
    const probe = (x, y, z, dTag, mMat) => {
        dTag.fill(1e9); mMat.fill(0);
        const bi = Math.floor((x - x0) * inv); if (bi < 0 || bi >= NB) return;
        const B = bins[bi];
        for (let i = 0; i < B.length; i++) {
            const f = B[i];
            if (x < f.minx || x > f.maxx || y < f.miny || y > f.maxy || z < f.minz || z > f.maxz) continue;
            const di = dist(f, x, y, z);
            if (f.tag >= 0 && di < dTag[f.tag]) dTag[f.tag] = di;
            if (f.mat >= 0) { const m = 1 - sstep(0, f.mt, di); if (m > mMat[f.mat]) mMat[f.mat] = m; }
        }
    };
    return { field, fieldOf, probe, tags, mats, groups };
}

// naive surface nets over a box; returns positions and indices. `skip(x, y, z)` leaves a hole where another,
// finer net will stand.
function surfaceNets(field, box, cell, skip = null) {
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
        if (skip && skip(box[0] + (i + 0.5) * cell, box[1] + (j + 0.5) * cell, box[2] + (k + 0.5) * cell)) continue;
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
    const quad = (a, b, d, e, flip) => { if (a < 0 || b < 0 || d < 0 || e < 0) return; if (flip) idx.push(a, e, b, a, d, e); else idx.push(a, b, e, a, e, d); };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const v0 = at(i, j, k) < 0;
        // one quad per sign-changing grid edge leaving (i,j,k) along +x, +y, +z
        if (v0 !== (at(i + 1, j, k) < 0)) quad(cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j - 1, k), cid(i, j, k), !v0);
        if (v0 !== (at(i, j + 1, k) < 0)) quad(cid(i - 1, j, k - 1), cid(i, j, k - 1), cid(i - 1, j, k), cid(i, j, k), v0);
        if (v0 !== (at(i, j, k + 1) < 0)) quad(cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i - 1, j, k), cid(i, j, k), !v0);
    }
    return { pos, idx };
}

// ---- hard and separate parts: teeth, claws, eyeballs, eyelids ------------------------
// One list of vertices for all of them. A: kind (0 hide, 1 tooth, 2 claw or horn, 3 eyeball), -, occlusion, -.
// C: grain, gum, darkening, how far along a tooth or claw. `soft` marks what is hide (the eyelids, the cuffs round
// claws and teeth); for those an occlusion or a grain of -1 means: whatever the hide has there.
const KIND = { hide: 0, tooth: 1, claw: 2, eye: 3 };
const newParts = () => ({ P: [], N: [], I: [], bone: [], A: [], C: [], soft: [] });
// turn every triangle of a part to face away from (or toward) a point
function orient(X, i0, ref, toward = false) {
    const P = X.P, I = X.I;
    for (let i = i0; i < I.length; i += 3) {
        const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
        const n = cross3([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
        const d = n[0] * ((P[a] + P[b] + P[c]) / 3 - ref[0]) + n[1] * ((P[a + 1] + P[b + 1] + P[c + 1]) / 3 - ref[1]) + n[2] * ((P[a + 2] + P[b + 2] + P[c + 2]) / 3 - ref[2]);
        if ((d < 0) !== toward) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
    }
}
// smooth normals for the vertices from v0 on, from the triangles from i0 on
function smoothNormals(X, v0, i0) {
    const P = X.P, I = X.I, N = X.N;
    for (let i = v0 * 3; i < P.length; i++) N[i] = 0;
    for (let i = i0; i < I.length; i += 3) {
        const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
        const n = cross3([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
        for (const q of [a, b, c]) { N[q] += n[0]; N[q + 1] += n[1]; N[q + 2] += n[2]; }
    }
    for (let i = v0 * 3; i < P.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
}
// a tapering horn of round section that curves as it goes: a tooth, a claw.
// cuff: [from, to, width, gum, dark]: a collar of skin (or gum) hugging it over that stretch of its length, `width`
// times as thick as the horn at its buried end and closing onto the horn at the other. It is what seats a claw in
// its toe: without it the horn simply pierces the hide, along a ragged line.
function horn(X, base, dir, len, r, bone, kind, bend, sides, rings, taper = 0.72, cuff = null) {
    const d = norm3(dir), v0 = X.P.length / 3, i0 = X.I.length;
    const u = norm3(cross3(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross3(d, u);
    const put = (x, y, z, t) => { X.P.push(x, y, z); X.N.push(0, 0, 0); X.bone.push(bone); X.A.push(kind, 0, 1, 0); X.C.push(0, 0, 0, t); X.soft.push(0); };
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < rings; i++) {
        const t = i / rings, rr = r * Math.pow(1 - t, taper);
        const cx = base[0] + (d[0] * t + bend[0] * t * t) * len, cy = base[1] + (d[1] * t + bend[1] * t * t) * len, cz = base[2] + (d[2] * t + bend[2] * t * t) * len;
        for (let k = 0; k < sides; k++) { const a = (k / sides) * 6.2832, ca = Math.cos(a) * rr, sa = Math.sin(a) * rr; put(cx + u[0] * ca + v[0] * sa, cy + u[1] * ca + v[1] * sa, cz + u[2] * ca + v[2] * sa, t); }
        sx += cx; sy += cy; sz += cz;
    }
    put(base[0] + (d[0] + bend[0]) * len, base[1] + (d[1] + bend[1]) * len, base[2] + (d[2] + bend[2]) * len, 1);
    for (let i = 0; i < rings - 1; i++) for (let k = 0; k < sides; k++) { const a = v0 + i * sides + k, b = v0 + i * sides + ((k + 1) % sides); X.I.push(a, b, a + sides, b, b + sides, a + sides); }
    for (let k = 0; k < sides; k++) X.I.push(v0 + (rings - 1) * sides + k, v0 + (rings - 1) * sides + ((k + 1) % sides), v0 + rings * sides);
    orient(X, i0, [sx / rings, sy / rings, sz / rings]);
    smoothNormals(X, v0, i0);
    if (cuff) {
        const c0 = X.P.length / 3, j0 = X.I.length, T = [cuff[0], cuff[0] * 0.45 + cuff[1] * 0.55, cuff[1] * 0.92 + cuff[0] * 0.08, cuff[1]], W = [cuff[2], 1 + (cuff[2] - 1) * 0.8, 1 + (cuff[2] - 1) * 0.42, 1.015];
        let mx = 0, my = 0, mz = 0;
        for (let i = 0; i < 4; i++) {
            const t = T[i], rr = r * Math.pow(1 - t, taper) * W[i];
            const cx = base[0] + (d[0] * t + bend[0] * t * t) * len, cy = base[1] + (d[1] * t + bend[1] * t * t) * len, cz = base[2] + (d[2] * t + bend[2] * t * t) * len;
            for (let k = 0; k < sides; k++) { const a = (k / sides) * 6.2832, ca = Math.cos(a) * rr, sa = Math.sin(a) * rr; X.P.push(cx + u[0] * ca + v[0] * sa, cy + u[1] * ca + v[1] * sa, cz + u[2] * ca + v[2] * sa); X.N.push(0, 0, 0); X.bone.push(bone); X.A.push(KIND.hide, 0, -1, 0); X.C.push(-1, cuff[3], cuff[4] * [0, 0.15, 0.7, 1][i], 0); X.soft.push(1); }
            mx += cx / 4; my += cy / 4; mz += cz / 4;
        }
        for (let i = 0; i < 3; i++) for (let k = 0; k < sides; k++) { const a = c0 + i * sides + k, b = c0 + i * sides + ((k + 1) % sides); X.I.push(a, b, a + sides, b, b + sides, a + sides); }
        orient(X, j0, [mx, my, mz]);
        smoothNormals(X, c0, j0);
    }
}
// An eye: the front of a ball, and over it a shell of hide with the opening between the lids cut in it. The
// shell's own edge is turned in to meet the ball, so the lid has a thickness; its outer edge is buried in the head.
// E: { c centre, A axis (out of the head), Rv (forward across the eye), U (up across it), R }
// o: { wide, up, down: half-angles of the opening seen from the centre of the ball; tilt; seg }
function addEye(X, E, sd, bone, o) {
    const m = (q) => [q[0], q[1], q[2] * sd], c = m(E.c), A = m(E.A), Rv = m(E.Rv), U = m(E.U), R = E.R;
    const pt = (rho, psi, rad) => { const sr = Math.sin(rho) * rad, cr = Math.cos(rho) * rad, cp = Math.cos(psi), sp = Math.sin(psi); return [c[0] + A[0] * cr + (Rv[0] * cp + U[0] * sp) * sr, c[1] + A[1] * cr + (Rv[1] * cp + U[1] * sp) * sr, c[2] + A[2] * cr + (Rv[2] * cp + U[2] * sp) * sr]; };
    const open = (psi) => { const q = psi - o.tilt, cq = Math.abs(Math.cos(q)), sq = Math.abs(Math.sin(q)), b = Math.sin(q) > 0 ? o.up : o.down; return Math.pow(Math.pow(cq / o.wide, 1.45) + Math.pow(sq / b, 1.45), -1 / 1.45); };
    const put = (q, kind, ao, fine, dark, soft) => { X.P.push(q[0], q[1], q[2]); X.N.push(0, 0, 0); X.bone.push(bone); X.A.push(kind, 0, ao, 0); X.C.push(fine, 0, dark, 0); X.soft.push(soft); return X.P.length / 3 - 1; };
    const SEG = o.seg, band = (r0, r1) => { for (let k = 0; k < SEG; k++) { const k1 = (k + 1) % SEG; X.I.push(r0 + k, r0 + k1, r1 + k, r0 + k1, r1 + k1, r1 + k); } };
    // the ball
    {
        const v0 = X.P.length / 3, i0 = X.I.length, NB = 5, lim = o.wide + 0.28;
        put(pt(0, 0, R), KIND.eye, 1, 0, 0, 0);
        for (let j = 1; j <= NB; j++) for (let k = 0; k < SEG; k++) put(pt((j / NB) * lim, (k / SEG) * 6.2832, R), KIND.eye, 1, 0, 0, 0);
        for (let k = 0; k < SEG; k++) X.I.push(v0, v0 + 1 + k, v0 + 1 + ((k + 1) % SEG));
        for (let j = 0; j < NB - 1; j++) band(v0 + 1 + j * SEG, v0 + 1 + (j + 1) * SEG);
        orient(X, i0, c); smoothNormals(X, v0, i0);
    }
    // the lids
    {
        const v0 = X.P.length / 3, i0 = X.I.length, NL = 5, out = 1.85;
        for (let k = 0; k < SEG; k++) { const psi = (k / SEG) * 6.2832; put(pt(open(psi) * 0.93, psi, R * 1.004), KIND.hide, 0.55, 1, 0.9, 1); }           // the lid's edge, down on the ball
        for (let j = 0; j <= NL; j++) for (let k = 0; k < SEG; k++) {
            const psi = (k / SEG) * 6.2832, f = j / NL, heavy = Math.sin(psi - o.tilt);
            put(pt(lerp(open(psi), out, Math.pow(f, 1.25)), psi, R * (1.06 + 0.03 * Math.max(0, heavy) + 0.04 * f * (1 - f))), KIND.hide, lerp(0.72, 1, f), 1, lerp(0.7, 0, sstep(0, 0.6, f)), 1);
        }
        band(v0, v0 + SEG);
        orient(X, i0, pt(0, 0, R * 0.9), true);
        const i1 = X.I.length;
        for (let j = 0; j < NL; j++) band(v0 + SEG + j * SEG, v0 + SEG + (j + 1) * SEG);
        orient(X, i1, c); smoothNormals(X, v0, i0);
    }
}
const along = (pts, t) => {
    let total = 0; const seg = [0];
    for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); seg.push(total); }
    const d = t * total; let i = 1; while (i < pts.length - 1 && seg[i] < d) i++;
    const u = (d - seg[i - 1]) / (seg[i] - seg[i - 1] || 1);
    return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u), lerp(pts[i - 1][2], pts[i][2], u)];
};

// ---- species -------------------------------------------------------------------
const mirror = (list) => list.flatMap((b) => { const name = b[0]; if (!name.endsWith('L')) return [b]; const r = b.slice(); r[0] = name.slice(0, -1) + 'R'; if (r[1] && r[1].endsWith('L')) r[1] = r[1].slice(0, -1) + 'R'; r[4] = -r[4]; if (r[5]) r[5] = [r[5][0], r[5][1], -r[5][2]]; return [b, r]; });
const other = (n) => (n.endsWith('L') ? n.slice(0, -1) + 'R' : n);
const mirrorFlesh = (list) => list.flatMap((f) => (f.m ? [f, { ...f, a: [f.a[0], f.a[1], -f.a[2]], b: [f.b[0], f.b[1], -f.b[2]], ...(f.bone ? { bone: other(f.bone) } : {}), ...(f.bones ? { bones: f.bones.map(other) } : {}) }] : [f]));
const C = (a, b, ra, rb, o = {}) => ({ a, b, ra, rb, ...o });
// a run of cones through points
const chain = (pts, r0, r1, o = {}) => pts.slice(1).map((p, i) => C(pts[i], p, lerp(r0, r1, i / (pts.length - 1)), lerp(r0, r1, (i + 1) / (pts.length - 1)), o));
const lift = (pts, dy) => pts.map((p) => [p[0], p[1] + dy, p[2]]);
const H = { bone: 'head' }, J = { bone: 'jaw' };

// the rex's tooth rows, back to front along the left side (the gums are raised along the same lines)
const REX_UP = [[4.03, 4.112, 0.266], [4.3, 4.112, 0.226], [4.6, 4.115, 0.172], [4.84, 4.125, 0.116], [4.94, 4.135, 0.07], [4.985, 4.142, 0.028]];
const REX_LO = [[4.07, 4.066, 0.165], [4.15, 4.058, 0.155], [4.45, 4.045, 0.105], [4.76, 4.04, 0.055], [4.86, 4.032, 0.02]];

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
            C([2.05, 3.5, 0.42], [2.4, 3.15, 0.5], 0.4, 0.28, { m: 1, k: 0.22, bones: ['chest'] }), C([2.7, 3.95, 0.26], [3.3, 4.3, 0.24], 0.28, 0.24, { m: 1, k: 0.18 }),
            // tail: thick with muscle at the base, a long taper
            C([-0.25, 3.72, 0], [-2.3, 3.6, 0], 0.84, 0.52, { sq: 0.62, sy: 1.08, k: 0.45 }), C([-2.3, 3.6, 0], [-4.6, 3.44, 0], 0.52, 0.24, { sq: 0.66, k: 0.35 }), C([-4.6, 3.44, 0], [-6.9, 3.3, 0], 0.24, 0.035, { sq: 0.72, k: 0.25 }),
            // neck: an S, slimmer than the chest, with a loose throat under it
            C([2.45, 3.62, 0], [3.08, 4.14, 0], 0.5, 0.38, { sq: 0.66, k: 0.32 }), C([3.08, 4.14, 0], [3.56, 4.36, 0], 0.38, 0.37, { sq: 0.72, k: 0.24 }),
            C([3.2, 4.03, 0], [3.7, 3.94, 0], 0.26, 0.17, { sq: 0.8, k: 0.14 }), C([3.36, 4.06, 0.19], [3.64, 3.99, 0.235], 0.17, 0.115, { m: 1, k: 0.12 }),
            // hind leg: drumstick thigh, lean shank, long foot, three toes
            C([0.05, 3.55, 0.6], [0.78, 2.45, 0.7], 0.62, 0.36, { m: 1, sq: 0.62, k: 0.36 }), C([-0.5, 3.5, 0.34], [0.3, 2.9, 0.62], 0.52, 0.4, { m: 1, sq: 0.7, k: 0.36 }),
            C([0.78, 2.45, 0.7], [0.02, 1.26, 0.68], 0.36, 0.2, { m: 1, k: 0.16 }), C([0.62, 2.3, 0.7], [0.26, 1.75, 0.69], 0.36, 0.26, { m: 1, sq: 0.85, k: 0.14 }),
            C([0.02, 1.26, 0.68], [0.5, 0.24, 0.7], 0.2, 0.19, { m: 1, k: 0.12 }), C([0.02, 1.26, 0.68], [-0.08, 1.32, 0.68], 0.21, 0.19, { m: 1, k: 0.08 }),
            C([0.44, 0.24, 0.7], [0.62, 0.2, 0.7], 0.24, 0.22, { m: 1, sq: 1.25, k: 0.1, bones: ['footL', 'toeL'] }),
            C([0.5, 0.2, 0.7], [1.26, 0.13, 0.7], 0.17, 0.11, { m: 1, k: 0.07 }), C([0.5, 0.2, 0.7], [1.08, 0.13, 1.1], 0.155, 0.1, { m: 1, k: 0.07 }), C([0.5, 0.2, 0.7], [1.08, 0.13, 0.32], 0.155, 0.1, { m: 1, k: 0.07 }),
            C([0.4, 0.3, 0.66], [0.18, 0.2, 0.5], 0.07, 0.05, { m: 1, k: 0.06, bones: ['toeL'] }),
            // arm: small, two fingers
            C([2.36, 3.0, 0.5], [2.3, 2.52, 0.54], 0.14, 0.1, { m: 1, k: 0.12 }), C([2.3, 2.52, 0.54], [2.6, 2.34, 0.5], 0.09, 0.06, { m: 1, k: 0.07 }),

            // ---- the skull, rigid on the head bone: a box of a braincase, flaring cheeks, a deep snout that
            // narrows upward, bosses over and behind the eye, a rough ridge along the nose
            C([3.5, 4.5, 0], [3.96, 4.53, 0], 0.3, 0.29, { sq: 1.08, k: 0.14, ...H }),
            C([3.56, 4.3, 0.3], [3.94, 4.26, 0.29], 0.16, 0.13, { m: 1, k: 0.1, ...H }),
            C([3.96, 4.44, 0], [4.84, 4.33, 0], 0.3, 0.185, { sq: 0.78, k: 0.14, ...H }),
            C([3.98, 4.21, 0.235], [4.86, 4.205, 0.085], 0.105, 0.075, { m: 1, k: 0.07, ...H }),
            C([4.84, 4.29, 0], [4.93, 4.265, 0], 0.14, 0.12, { k: 0.08, ...H }),
            C([4.15, 4.7, 0.07], [4.78, 4.5, 0.055], 0.075, 0.05, { m: 1, k: 0.05, ...H }),
            C([3.72, 4.7, 0.2], [3.98, 4.72, 0.19], 0.12, 0.11, { m: 1, k: 0.08, ...H }),            // the boss over the eye
            C([3.74, 4.705, 0.33], [4.0, 4.695, 0.315], 0.04, 0.04, { m: 1, k: 0.04, ...H }),          // its edge, which overhangs the eye
            C([4.02, 4.69, 0.2], [4.22, 4.62, 0.15], 0.095, 0.075, { m: 1, k: 0.07, ...H }),               // the horn in front of it
            C([3.72, 4.62, 0.3], [3.74, 4.42, 0.34], 0.07, 0.07, { m: 1, k: 0.06, ...H }),             // the bar behind the eye
            C([4.05, 4.62, 0.265], [4.03, 4.42, 0.3], 0.06, 0.06, { m: 1, k: 0.06, ...H }),            // and the one before it
            C([3.5, 4.66, 0.12], [3.62, 4.7, 0.14], 0.09, 0.09, { m: 1, k: 0.08, ...H }),
            C([3.56, 4.16, 0.3], [3.8, 4.1, 0.3], 0.14, 0.11, { m: 1, k: 0.08, ...H }),
            // ---- the lower jaw, rigid on its own bone: two deep bars meeting at the chin, skin slung between them
            C([3.62, 3.96, 0.23], [4.15, 3.93, 0.16], 0.09, 0.075, { m: 1, sy: 1.8, k: 0.05, ...J }),
            C([4.15, 3.93, 0.16], [4.78, 3.95, 0.055], 0.075, 0.062, { m: 1, sy: 1.5, k: 0.05, ...J }),
            C([4.74, 3.93, 0], [4.84, 3.94, 0], 0.105, 0.09, { sq: 1.1, k: 0.05, ...J }),
            C([3.66, 3.88, 0], [4.6, 3.87, 0], 0.2, 0.1, { sq: 1.3, sy: 0.55, k: 0.08, ...J }),
            // ---- cut into them: the hollow in front of the eye, the nostrils, the roof of the mouth, the trough of the jaw
            C([4.14, 4.5, 0.3], [4.42, 4.45, 0.255], 0.1, 0.07, { m: 1, neg: 1, k: 0.07 }),
            C([4.8, 4.43, 0.135], [4.86, 4.42, 0.125], 0.032, 0.024, { m: 1, neg: 1, k: 0.02, mat: 'dark', mt: 0.015 }),
            // (both narrow toward the tip with the tooth rows, so that neither breaks out through a lip)
            C([3.8, 4.13, 0], [4.3, 4.14, 0], 0.1, 0.082, { neg: 1, sq: 2.25, k: 0.03, mat: 'wet', mt: 0.014 }), C([4.3, 4.14, 0], [4.8, 4.15, 0], 0.082, 0.04, { neg: 1, sq: 2.2, k: 0.03, mat: 'wet', mt: 0.014 }), C([4.8, 4.15, 0], [4.92, 4.165, 0], 0.04, 0.022, { neg: 1, sq: 2.0, k: 0.02, mat: 'wet', mt: 0.014 }),
            C([3.8, 4.04, 0], [4.62, 3.995, 0], 0.066, 0.028, { neg: 1, sq: 1.85, k: 0.03, mat: 'wet', mt: 0.012 }),
            // ---- and put back inside: the gums the teeth stand in, the tongue
            ...chain(lift(REX_UP, 0.014), 0.038, 0.03, { m: 1, k: 0.02, mat: 'gum', mt: 0.012, ...H }),
            ...chain(lift(REX_LO, -0.016), 0.034, 0.026, { m: 1, k: 0.02, mat: 'gum', mt: 0.012, ...J }),
            C([3.78, 3.985, 0], [4.46, 3.975, 0], 0.056, 0.03, { sq: 1.7, sy: 0.75, k: 0.02, mat: 'tongue', mt: 0.01, ...J }),
            // ---- last, the line of the mouth, which parts the lips from its corner to the tip
            C([4.0, 4.085, 0], [5.2, 4.06, 0], 0.022, 0.022, { neg: 1, sq: 22, k: 0.02 }),
        ]),
        tagOnly: ['jaw'],
        // where the mesh is made finer: [x0, y0, z0, x1, y1, z1, cell factor, mirrored]
        fine: [[3.22, 3.5, -0.66, 5.25, 5.02, 0.66, 0.36], [2.05, 2.05, 0.3, 2.95, 3.15, 0.82, 0.5, 1], [-0.25, -0.12, 0.12, 1.75, 0.62, 1.32, 0.42, 1]],
        teeth: [
            { row: REX_UP, n: 15, bone: 'head', dir: (t) => [0.06 + 0.3 * t * t * t, -1, 0.12], bend: [-0.28, 0, -0.04], len: (t) => (t < 0.84 ? 0.06 + 0.085 * Math.pow(Math.sin(Math.PI * Math.min(1, (t + 0.04) / 0.86)), 0.8) : 0.075), seed: 5 },
            { row: REX_LO, n: 12, bone: 'jaw', dir: (t) => [0.04 + 0.15 * t * t, 1, 0.05], bend: [-0.22, 0, 0], len: (t) => 0.045 + 0.05 * Math.sin(Math.PI * Math.pow(t, 0.85)), seed: 9 },
        ],
        // [base, direction, length, radius, bone, bend]
        claws: [
            [[1.19, 0.15, 0.7], [1, -0.1, 0], 0.44, 0.094, 'toeL', [0, -0.32, 0]], [[1.02, 0.15, 1.058], [0.82, -0.1, 0.56], 0.4, 0.086, 'toeL', [0, -0.32, 0]], [[1.02, 0.15, 0.362], [0.82, -0.1, -0.56], 0.4, 0.086, 'toeL', [0, -0.32, 0]],
            [[0.21, 0.21, 0.52], [-0.7, -0.5, -0.5], 0.16, 0.042, 'toeL', [0, -0.3, 0]],
            [[2.57, 2.36, 0.5], [0.72, -0.7, 0], 0.2, 0.04, 'handL', [-0.25, -0.2, 0]], [[2.55, 2.38, 0.56], [0.66, -0.66, 0.36], 0.17, 0.035, 'handL', [-0.25, -0.2, 0]],
        ],
        eyes: [[3.9, 4.6, 0.3]], eyeR: 0.07, eyeAxis: [0.3, 0.04, 1], eyeSink: 0.9, eyeLid: { wide: 0.98, up: 0.27, down: 0.44, tilt: -0.22 },
        mouth: 3.98,
        // where the scales differ from what the bone under them would have: [from, to, radius, falloff, grain (-1: as it was), creases, darkening]
        paint: [
            ...REX_UP.slice(1).map((p, i) => [REX_UP[i], p, 0.06, 0.05, 0.86, 0.9]), ...REX_LO.slice(1).map((p, i) => [REX_LO[i], p, 0.08, 0.04, 0.86, 0.9]),
            [[4.12, 4.74, 0], [4.86, 4.5, 0], 0.09, 0.08, 0.27, 0], [[3.72, 4.82, 0.24], [4.0, 4.82, 0.22], 0.07, 0.07, 0.3, 0],
            // the skin a claw grows out of
            [[1.3, 0.12, 0.7], [1.36, 0.11, 0.7], 0.05, 0.07, 0.95, 0, 0.55], [[1.11, 0.12, 1.12], [1.16, 0.11, 1.155], 0.05, 0.07, 0.95, 0, 0.55], [[1.11, 0.12, 0.3], [1.16, 0.11, 0.265], 0.05, 0.07, 0.95, 0, 0.55],
            [[2.6, 2.34, 0.52], [2.64, 2.3, 0.54], 0.03, 0.05, 0.95, 0, 0.5],
        ],
        look: { base: '#4d4a30', belly: '#a39a79', back: '#231f17', stripe: [2.6, 0.62], face: '#5a3a2a', iris: ['#9a6218', '#3a1808'] },
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
            C([10.8, 10.75, 0], [11.9, 10.58, 0], 0.4, 0.26, { sq: 0.85, k: 0.25, ...H }),
            C([0.0, 3.7, 1.05], [0.15, 2.0, 1.1], 0.86, 0.54, { m: 1, k: 0.5 }), C([0.15, 2.0, 1.1], [-0.05, 0.42, 1.1], 0.52, 0.5, { m: 1, k: 0.3 }), C([-0.05, 0.42, 1.1], [0.12, 0.2, 1.1], 0.52, 0.5, { m: 1, k: 0.2 }),
            C([3.9, 4.0, 1.0], [4.05, 2.1, 1.02], 0.66, 0.44, { m: 1, k: 0.45 }), C([4.05, 2.1, 1.02], [3.95, 0.42, 1.02], 0.42, 0.4, { m: 1, k: 0.3 }), C([3.95, 0.42, 1.02], [4.05, 0.2, 1.02], 0.42, 0.4, { m: 1, k: 0.2 }),
        ]),
        fine: [[10.2, 9.9, -0.75, 12.4, 11.45, 0.75, 0.36]],
        eyes: [[11.15, 10.86, 0.3]], eyeR: 0.07, eyeSink: 0.5, eyeLid: { wide: 0.8, up: 0.5, down: 0.52, tilt: 0 },
        look: { base: '#6b5a44', belly: '#93826a', back: '#3a2f25', stripe: [0.7, 0.6], iris: ['#8c6a34', '#3a2613'] },
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
            C([3.5, 2.35, 0], [4.4, 1.95, 0], 0.66, 0.46, { sq: 0.85, k: 0.3, ...H }), C([4.4, 1.95, 0], [5.0, 1.52, 0], 0.4, 0.17, { sq: 0.7, k: 0.2, ...H }),
            // frill: a broad shield sweeping up and back from the skull
            C([3.3, 2.75, 0], [2.75, 3.55, 0], 0.5, 0.2, { sq: 2.7, k: 0.3, ...H }), C([3.3, 2.75, 0.55], [2.7, 3.45, 0.9], 0.3, 0.14, { m: 1, sq: 1.6, k: 0.3, ...H }),
            // horns
            C([3.75, 2.75, 0.36], [4.25, 3.3, 0.48], 0.17, 0.09, { m: 1, k: 0.12, ...H }), C([4.25, 3.3, 0.48], [4.85, 3.72, 0.56], 0.09, 0.015, { m: 1, k: 0.06, ...H }),
            C([4.5, 2.05, 0], [4.72, 2.42, 0], 0.13, 0.02, { k: 0.08, ...H }),
            C([0.05, 1.9, 0.72], [0.3, 1.0, 0.78], 0.62, 0.36, { m: 1, k: 0.4 }), C([0.3, 1.0, 0.78], [0.0, 0.3, 0.78], 0.33, 0.28, { m: 1, k: 0.2 }), C([0.0, 0.3, 0.78], [0.15, 0.16, 0.78], 0.3, 0.28, { m: 1, k: 0.15 }),
            C([2.35, 1.7, 0.74], [2.5, 0.9, 0.8], 0.48, 0.3, { m: 1, k: 0.35 }), C([2.5, 0.9, 0.8], [2.4, 0.28, 0.8], 0.28, 0.25, { m: 1, k: 0.2 }), C([2.4, 0.28, 0.8], [2.55, 0.15, 0.8], 0.27, 0.25, { m: 1, k: 0.15 }),
        ]),
        fine: [[2.4, 1.2, -1.55, 5.3, 4.0, 1.55, 0.45]],
        eyes: [[4.02, 2.42, 0.44]], eyeR: 0.07, eyeSink: 0.5, eyeLid: { wide: 0.8, up: 0.46, down: 0.52, tilt: -0.1 },
        look: { base: '#6b543c', belly: '#998667', back: '#372a20', stripe: [1.0, 0.5], frill: [2.95, 3.25, '#a04d28'], iris: ['#9a6a2c', '#3f2612'] },
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
            C([3.35, 4.22, 0], [4.0, 4.05, 0], 0.34, 0.27, { sq: 0.85, k: 0.2, ...H }), C([4.0, 4.05, 0], [4.55, 3.84, 0], 0.25, 0.17, { sq: 1.35, sy: 0.6, k: 0.15, ...H }),
            // the crest: a hollow tube sweeping back over the neck
            C([3.5, 4.45, 0], [2.7, 5.05, 0], 0.19, 0.14, { k: 0.14, ...H }), C([2.7, 5.05, 0], [1.95, 5.3, 0], 0.14, 0.08, { k: 0.1, ...H }),
            C([0.05, 2.7, 0.62], [0.6, 1.6, 0.68], 0.62, 0.36, { m: 1, sq: 0.75, k: 0.4 }), C([0.6, 1.6, 0.68], [-0.15, 0.78, 0.68], 0.42, 0.25, { m: 1, k: 0.2 }), C([-0.15, 0.78, 0.68], [0.2, 0.18, 0.7], 0.25, 0.21, { m: 1, k: 0.15 }), C([0.2, 0.16, 0.7], [0.8, 0.12, 0.72], 0.21, 0.14, { m: 1, sq: 1.5, k: 0.1 }),
            C([1.95, 2.25, 0.5], [2.1, 1.3, 0.52], 0.3, 0.2, { m: 1, k: 0.25 }), C([2.1, 1.3, 0.52], [2.2, 0.4, 0.52], 0.19, 0.15, { m: 1, k: 0.15 }), C([2.2, 0.4, 0.52], [2.3, 0.14, 0.52], 0.17, 0.16, { m: 1, k: 0.1 }),
        ]),
        fine: [[1.7, 3.35, -0.62, 4.95, 5.6, 0.62, 0.4]],
        eyes: [[3.72, 4.28, 0.27]], eyeR: 0.06, eyeSink: 0.5, eyeLid: { wide: 0.82, up: 0.48, down: 0.54, tilt: -0.05 },
        look: { base: '#6a5c40', belly: '#948869', back: '#352c1f', stripe: [1.7, 0.7], crest: [2.9, 4.8, '#8e3f28'], iris: ['#a8742e', '#40260f'] },
    },
};

// what each stretch of the skeleton is covered in: how fine the scales are there (0 plates .. 1 the finest grain), and how
// deeply the hide creases where that bone meets its parent
const REGION = (name) => {
    if (/^(head|jaw)/.test(name)) return { fine: 0.62, fold: 0.75 };
    if (/^neck/.test(name)) return { fine: name === 'neck' || name === 'neck1' ? 0.42 : 0.55, fold: 1 };
    if (/^chest/.test(name)) return { fine: 0.33, fold: 0.3 };
    if (/^tail/.test(name)) return { fine: name < 'tail3' ? 0.3 : name < 'tail4' ? 0.45 : 0.6, fold: name === 'tail1' ? 0.55 : 0.2 };
    if (/^thigh/.test(name)) return { fine: 0.33, fold: 0.5 };
    if (/^shin/.test(name)) return { fine: 0.45, fold: 1 };
    if (/^(foot|toe)/.test(name)) return { fine: 0.64, fold: 1, rings: /^toe/.test(name) ? 0.8 : 0.45 };
    if (/^arm/.test(name)) return { fine: 0.6, fold: 0.8 };
    if (/^fore/.test(name)) return { fine: 0.55, fold: 0.9 };
    if (/^hand/.test(name)) return { fine: 0.72, fold: 0.8, rings: 0.5 };
    return { fine: 0.3, fold: 0 };
};

function buildSpecies(def, quality, noiseTex, hideTex, key, shadowBias) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const tier = quality.post, S = def.len / 12.2;
    const cell = def.cell / Math.max(0.55, Math.sqrt(quality.fauna));
    const flesh = def.flesh.slice(), tagged = flesh.some((f) => f.bone);
    // bones as segments: each runs to the mean of its children, or to its tip
    const bones = def.bones.map((b) => ({ name: b[0], parent: b[1], x: b[2], y: b[3], z: b[4], tip: b[5] || null }));
    const index = new Map(bones.map((b, i) => [b.name, i]));
    for (const b of bones) {
        const kids = bones.filter((k) => k.parent === b.name);
        b.kids = kids; b.main = null;
        if (b.tip) b.end = b.tip;
        else if (kids.length) {
            // follow the child that continues the chain (same side), not a limb branching off
            b.main = kids.find((k) => Math.abs(k.z - b.z) < 0.2) || kids[0];
            b.end = [b.main.x, b.main.y, b.main.z];
        } else b.end = [b.x, b.y, b.z];
    }

    // ---- eyes: find where the hide is, sink a ball into it, hollow the socket round it
    let eye = null;
    if (def.eyes) {
        const f0 = makeField(flesh).field, R = def.eyeR, A = norm3(def.eyeAxis || [0.16, 0.05, 1]), e = def.eyes[0];
        const at = (s) => f0(e[0] + A[0] * s, e[1] + A[1] * s, e[2] + A[2] * s);
        let s1 = 0.7 * S; while (s1 > -0.6 * S && at(s1) > 0) s1 -= 0.01 * S;
        let s0 = s1 + 0.01 * S; for (let i = 0; i < 14; i++) { const sm = (s0 + s1) / 2; if (at(sm) < 0) s1 = sm; else s0 = sm; }
        const sink = def.eyeSink === undefined ? 0.5 : def.eyeSink, sp = [e[0] + A[0] * s0, e[1] + A[1] * s0, e[2] + A[2] * s0];
        const c = [sp[0] - A[0] * R * sink, sp[1] - A[1] * R * sink, sp[2] - A[2] * R * sink];
        const Rv = norm3(cross3([0, 1, 0], A)), U = cross3(A, Rv);
        eye = { c, A, U, Rv, R, iris: 0.66, up: (def.eyeLid || {}).up || 0.4 };
        for (const sd of [1, -1]) {
            const d = [sp[0] + A[0] * R * 1.5, sp[1] + A[1] * R * 1.5, (sp[2] + A[2] * R * 1.5) * sd];
            flesh.push({ a: d, b: d, ra: R * 1.85, rb: R * 1.85, neg: 1, k: R * 0.6 });
            const q = [c[0], c[1], c[2] * sd];
            flesh.push({ a: q, b: q, ra: R * 0.94, rb: R * 0.94, k: R * 0.3, bone: tagged ? 'head' : undefined, mat: 'dark', mt: R * 0.6 });
        }
    }
    const only = new Set(def.tagOnly || []);
    const { field, fieldOf, probe, tags, mats, groups } = makeField(flesh, { bones, only, S }), alone = tags.map((t, i) => fieldOf(i));

    // ---- the hide: one coarse net over the whole animal, finer nets where it is looked at closely
    let box = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const f of def.flesh) { if (f.neg) continue; for (const p of [f.a, f.b]) { const r = Math.max(f.ra, f.rb) * Math.max(1, f.sq || 1) + 0.5; box[0] = Math.min(box[0], p[0] - r); box[1] = Math.min(box[1], p[1] - r); box[2] = Math.min(box[2], p[2] - r); box[3] = Math.max(box[3], p[0] + r); box[4] = Math.max(box[4], p[1] + r); box[5] = Math.max(box[5], p[2] + r); } }
    // (the small tiers are phones: their screens show less of the fine net, and the animals are built on the main
    // thread while the page loads, several times slower there than on a desk. So it is less fine for them.)
    const fk = tier === 0 ? 1.6 : tier === 1 ? 1.25 : 1;
    const fine = (def.fine || []).flatMap((b0) => { const b = b0.slice(); b[6] = Math.min(1, b[6] * fk); return b[7] ? [b, [b[0], b[1], -b[5], b[3], b[4], -b[2], b[6]]] : [b]; });
    const mrg = cell * 1.3;
    const depthIn = (x, y, z) => { let best = -1; for (const b of fine) { const d = Math.min(x - b[0], b[3] - x, y - b[1], b[4] - y, z - b[2], b[5] - z); if (d > best) best = d; } return best; };
    const nets = [{ net: surfaceNets(field, box, cell, fine.length ? (x, y, z) => depthIn(x, y, z) > mrg : null), cell, body: true }];
    for (const b of fine) nets.push({ net: surfaceNets(field, b, cell * b[6]), cell: cell * b[6], body: false });
    let nSoft = 0; for (const q of nets) nSoft += q.net.pos.length / 3;
    const cellMin = nets.reduce((m, q) => Math.min(m, q.cell), cell), eN = cellMin * 0.5;

    // ---- the parts that are not hide
    const X = newParts(), hiDetail = tier >= 2;
    for (const row of def.teeth || []) {
        const rnd = mulberry32(row.seed || 1);
        for (let i = 0; i < row.n; i++) {
            const t = (i + 0.5) / row.n, q = along(row.row, t), grown = rnd() < 0.2 ? 0.55 : 1;      // now and then a young tooth, half grown
            const L = row.len(t) * (0.82 + 0.3 * rnd()) * grown, r = cl(L * 0.34, 0.019, 0.04) * (grown < 1 ? 0.85 : 1), d = row.dir(t);
            const dn = norm3(d), sunk = 0.035;                                                              // the root is in the gum
            for (const sd of [1, -1]) horn(X, [q[0] - dn[0] * sunk, q[1] - dn[1] * sunk, (q[2] - dn[2] * sunk) * sd], [d[0], d[1], d[2] * sd], L + sunk, r, row.bone, KIND.tooth, [row.bend[0], row.bend[1], row.bend[2] * sd], hiDetail ? 8 : 6, hiDetail ? 4 : 3, 0.62, tier >= 2 ? [(sunk - 0.014) / (L + sunk), (sunk + 0.012) / (L + sunk), 1.25, 1, 0] : null);
        }
    }
    for (const c of def.claws || []) for (const sd of [1, -1]) horn(X, [c[0][0], c[0][1], c[0][2] * sd], [c[1][0], c[1][1], c[1][2] * sd], c[2], c[3], sd > 0 ? c[4] : c[4].slice(0, -1) + 'R', KIND.claw, [c[5][0], c[5][1], c[5][2] * sd], hiDetail ? 10 : 7, hiDetail ? 5 : 4, 0.6, [0.06, 0.42, 1.34, 0, 0.75]);
    if (eye) for (const sd of [1, -1]) addEye(X, eye, sd, 'head', { ...def.eyeLid, seg: hiDetail ? 28 : 18 });
    const nX = X.P.length / 3, nV = nSoft + nX;

    // ---- every net onto the true surface, with the surface's own normal
    const P = new Float32Array(nV * 3), N = new Float32Array(nV * 3), idx = [], sunk = new Float32Array(nV);
    {
        let o = 0;
        for (const q of nets) {
            const src = q.net.pos, step = q.cell * 0.7;
            for (let i = 0; i < src.length; i += 3) {
                let x = src[i], y = src[i + 1], z = src[i + 2], gx = 0, gy = 1, gz = 0;
                for (let it = 0; it < 2; it++) {
                    const f = it ? 0 : field(x, y, z);
                    gx = (field(x + eN, y, z) - field(x - eN, y, z)) / (2 * eN); gy = (field(x, y + eN, z) - field(x, y - eN, z)) / (2 * eN); gz = (field(x, y, z + eN) - field(x, y, z - eN)) / (2 * eN);
                    if (it === 1) break;
                    const g2 = gx * gx + gy * gy + gz * gz; if (g2 < 1e-6) break;
                    const s = cl(f / g2, -step, step); x -= gx * s; y -= gy * s; z -= gz * s;
                }
                let l = Math.hypot(gx, gy, gz); if (l < 1e-6) { gx = 0; gy = 1; gz = 0; l = 1; } gx /= l; gy /= l; gz /= l;
                // Where two nets overlap they must not fight for the same pixels: from the rim of the fine one inward
                // the coarse one sinks under it, a little at first. (The fine one stays where it is: a rim that dipped
                // showed along every silhouette. Applied at the very end, so that both nets are painted and bound
                // from the same true surface.)
                if (q.body && fine.length) sunk[o + i / 3] = cell * 0.2 * sstep(-cell * 0.3, mrg * 0.8, depthIn(x, y, z));
                const v = (o + i / 3) * 3; P[v] = x; P[v + 1] = y; P[v + 2] = z; N[v] = gx; N[v + 1] = gy; N[v + 2] = gz;
            }
            for (const j of q.net.idx) idx.push(j + o);
            o += src.length / 3;
        }
        P.set(X.P, nSoft * 3); N.set(X.N, nSoft * 3);
        for (const j of X.I) idx.push(j + nSoft);
    }

    // a coordinate that runs along the animal: metres from the hips, forward along the spine and down each limb,
    // backward (negative) along the tail. The hide's creases and its bars are drawn across it.
    const segs = [];
    for (const b of bones) {
        const par = b.parent ? bones[index.get(b.parent)] : null, back = /^tail/.test(b.name) ? -1 : 1;
        b.s = par ? par.s + back * Math.hypot(b.x - par.x, b.y - par.y, b.z - par.z) : 0;
    }
    const addSeg = (a, e, s0, s1, name) => {
        const d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]); if (l < 1e-5) return;
        const sg = s1 < s0 ? -1 : 1, reg = REGION(name);
        segs.push({ a, d, l2: l * l, s0, s1, ax: [d[0] / l * sg, d[1] / l * sg, d[2] / l * sg], fine: reg.fine, rings: reg.rings || 0 });
    };
    for (const b of bones) {
        const st = [b.x, b.y, b.z], back = /^tail/.test(b.name) ? -1 : 1;
        addSeg(st, b.end, b.s, b.main ? b.main.s : b.s + back * Math.hypot(b.end[0] - b.x, b.end[1] - b.y, b.end[2] - b.z), b.name);
        for (const k of b.kids) if (k !== b.main) addSeg(st, [k.x, k.y, k.z], b.s, k.s, b.name);
    }
    // where the hide creases: every joint, as far round it as the limb is thick there
    const joints = [];
    for (const b of bones) { const reg = REGION(b.name); if (!b.parent || !reg.fold) continue; const d = field(b.x, b.y, b.z); joints.push({ x: b.x, y: b.y, z: b.z, r: Math.max(0.09 * S, d < 0 ? -d * 1.5 : 0), k: reg.fold }); }

    // ---- binding and painting, vertex by vertex
    const skinIndex = new Uint16Array(nV * 4), skinWeight = new Float32Array(nV * 4);
    const aA = new Float32Array(nV * 4), aB = new Float32Array(nV * 4), aC = new Float32Array(nV * 4);
    const wj = new Float32Array(bones.length), wd = new Float32Array(bones.length), dTag = new Float64Array(groups.length), mMat = new Float64Array(mats.length);
    // between flesh rigid on a bone and its neighbour the hide is shared out over a few centimetres; between two limbs of the body over more
    const gBones = groups.map((g) => (g.bones ? g.bones.map((n) => index.get(n)) : bones.map((b, j) => j).filter((j) => !only.has(bones[j].name)))), gSoft = groups.map((g) => (g.rigid ? 0.035 : 0.09) * S);
    const mi = (name) => mats.indexOf(name), mWet = mi('wet'), mGum = mi('gum'), mDark = mi('dark'), mTongue = mi('tongue');
    const AOH = [0.035 * S, 0.09 * S, 0.22 * S], AOW = [0.45, 0.35, 0.3];
    const paints = (def.paint || []).slice();
    if (eye) paints.push([eye.c, eye.c, eye.R * 1.5, eye.R * 1.6, 1, 0]);                  // the skin round an eye is the finest on the animal
    let mine = -1;
    for (let v = 0; v < nV; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], hard = v >= nSoft, xi = v - nSoft;
        // bones
        if (hard) { skinIndex[v * 4] = index.get(X.bone[xi]); skinWeight[v * 4] = 1; mine = tags.indexOf(X.bone[xi]); }
        else {
            for (let j = 0; j < bones.length; j++) {
                const b = bones[j], dx = b.end[0] - b.x, dy = b.end[1] - b.y, dz = b.end[2] - b.z, l2 = dx * dx + dy * dy + dz * dz || 1e-9;
                const t = cl(((x - b.x) * dx + (y - b.y) * dy + (z - b.z) * dz) / l2, 0, 1);
                const d2 = (x - b.x - dx * t) ** 2 + (y - b.y - dy * t) ** 2 + (z - b.z - dz * t) ** 2;
                wd[j] = 1 / (d2 * d2 + 1e-5); wj[j] = 0;
            }
            probe(x, y, z, dTag, mMat); mine = -1;
            // whose flesh is under this spot (shared out where two kinds meet), and within that flesh, which of its bones is nearest
            let lo = 1e9, es = 0; for (let q = 0; q < groups.length; q++) lo = Math.min(lo, dTag[q]);
            for (let q = 0; q < groups.length; q++) { dTag[q] = Math.exp(-(dTag[q] - lo) / gSoft[q]); es += dTag[q]; }
            for (let q = 0; q < groups.length; q++) {
                const own = dTag[q] / es; if (own < 0.003) continue;
                const B = gBones[q]; let sb = 0; for (let k = 0; k < B.length; k++) sb += wd[B[k]];
                for (let k = 0; k < B.length; k++) wj[B[k]] += own * wd[B[k]] / (sb || 1);
                if (q < tags.length && own > 0.5) mine = q;
            }
            let sum = 0;
            for (let q = 0; q < 4; q++) { let best = -1, bw = 0; for (let j = 0; j < bones.length; j++) if (wj[j] > bw) { bw = wj[j]; best = j; } skinIndex[v * 4 + q] = Math.max(0, best); skinWeight[v * 4 + q] = bw; sum += bw; if (best >= 0) wj[best] = 0; }
            for (let q = 0; q < 4; q++) skinWeight[v * 4 + q] /= sum || 1;
        }
        if (hard && !X.soft[xi]) { for (let q = 0; q < 4; q++) { aA[v * 4 + q] = X.A[xi * 4 + q]; aC[v * 4 + q] = X.C[xi * 4 + q]; } aB[v * 4] = 1; continue; }
        // where along the animal, and what covers it there
        let sw = 0, s = 0, s2 = 0, ax = 0, ay = 0, az = 0, fn = 0, rings = 0;
        for (const g of segs) {
            const px = x - g.a[0], py = y - g.a[1], pz = z - g.a[2], t = cl((px * g.d[0] + py * g.d[1] + pz * g.d[2]) / g.l2, 0, 1);
            const d2 = (px - g.d[0] * t) ** 2 + (py - g.d[1] * t) ** 2 + (pz - g.d[2] * t) ** 2, w = 1 / (d2 * d2 + 1e-5);
            const sg = g.s0 + (g.s1 - g.s0) * t; sw += w; s += w * sg; s2 += w * sg * sg; ax += w * g.ax[0]; ay += w * g.ax[1]; az += w * g.ax[2]; fn += w * g.fine; rings += w * g.rings;
        }
        const al = Math.hypot(ax, ay, az) || 1, ny = N[v * 3 + 1];
        let fold = 0; for (const j of joints) { const d2 = (x - j.x) ** 2 + (y - j.y) ** 2 + (z - j.z) ** 2; fold += j.k * Math.exp(-d2 / (j.r * j.r)); }
        // (where a limb leaves the body the coordinate along the animal is torn between the two: no creases there)
        const torn = Math.max(0, s2 / sw - (s / sw) * (s / sw));
        fold = (Math.min(1.1, fold) + rings / sw + 0.22 * sstep(0.1, -0.7, ny)) / (1 + torn / (0.02 * S * S));
        let grain = fn / sw + 0.25 * sstep(0.0, -0.8, ny) - 0.25 * sstep(0.3, 0.9, ny), shade = 0;
        for (const q of paints) {
            const a = q[0], b = q[1], az2 = Math.abs(z), dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz || 1e-9;
            const t = cl(((x - a[0]) * dx + (y - a[1]) * dy + (az2 - a[2]) * dz) / l2, 0, 1);
            const w = 1 - sstep(0, q[3], Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t, az2 - a[2] - dz * t) - q[2]);
            if (w > 0) { if (q[4] >= 0) grain = lerp(grain, q[4], w); fold += q[5] * w; if (q[6]) shade = Math.max(shade, q[6] * w); }
        }
        const fineness = cl(grain, 0, 1);
        // how shut in the spot is: how soon the hide is met again, going out from it
        let occ = 0;
        const own = !hard || X.A[xi * 4 + 2] < 0;
        // (measured against how fast the field itself rises going out from here: where the flesh is a squashed
        // cone it rises slower than a metre a metre, and taken at face value that read as something in the way,
        // which put a dark stripe down the open top of a tail)
        if (own) {
            const nx = N[v * 3], nz = N[v * 3 + 2], fa = mine >= 0 ? alone[mine] : field, e = 0.012 * S;
            const f0 = fa(x, y, z), rise = cl((fa(x + nx * e, y + ny * e, z + nz * e) - f0) / e, 0.2, 1.5);
            for (let q = 0; q < 3; q++) occ += AOW[q] * (1 - cl((fa(x + nx * AOH[q], y + ny * AOH[q], z + nz * AOH[q]) - f0) / (AOH[q] * rise), 0, 1));
        }
        const m = (q) => (q >= 0 && !hard ? mMat[q] : 0);
        aA[v * 4] = 0; aA[v * 4 + 1] = Math.max(m(mWet), m(mTongue)); aA[v * 4 + 2] = own ? cl(1 - occ, 0.12, 1) : X.A[xi * 4 + 2]; aA[v * 4 + 3] = hard ? 0 : fold;
        aB[v * 4] = ax / al; aB[v * 4 + 1] = ay / al; aB[v * 4 + 2] = az / al; aB[v * 4 + 3] = s / sw;
        aC[v * 4] = hard && X.C[xi * 4] >= 0 ? X.C[xi * 4] : fineness; aC[v * 4 + 1] = hard ? X.C[xi * 4 + 1] : m(mGum); aC[v * 4 + 2] = hard ? Math.max(X.C[xi * 4 + 2], own ? shade : 0) : Math.max(m(mDark), shade); aC[v * 4 + 3] = m(mTongue);
    }
    for (let v = 0; v < nSoft; v++) if (sunk[v]) { P[v * 3] -= N[v * 3] * sunk[v]; P[v * 3 + 1] -= N[v * 3 + 1] * sunk[v]; P[v * 3 + 2] -= N[v * 3 + 2] * sunk[v]; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    geo.setAttribute('aA', new THREE.BufferAttribute(aA, 4));
    geo.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
    geo.setAttribute('aC', new THREE.BufferAttribute(aC, 4));
    geo.setIndex(nV > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, def.hip, 0), def.len);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-def.len, -1, -def.len), new THREE.Vector3(def.len, def.len, def.len));

    return { def, geo, bones, index, material: skinMaterial(def, noiseTex, hideTex, tier, eye, shadowBias), tris: idx.length / 3, verts: nV, key, eye, ms: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0 };
}

// ---- the hide ------------------------------------------------------------------
// One tileable sheet of scales, made at load: every scale a low dome with a groove round it. It holds the
// slope of that relief (rg), how far down in a groove a spot is (b: kept as that and not as a height, so that
// seen from far off, many scales to a pixel, the hide is as dark on average as it is close to) and a number per scale (a). Slopes, not heights, are what the
// light needs: a slope can be read straight out of a texture, magnified or far off, where the difference
// between two heights read a pixel apart breaks up into blocks and speckle.
const HIDE_N = 24, HIDE_SLOPE = 8.5 * HIDE_N;
function makeHideTexture(S, aniso) {
    const N = HIDE_N, rnd = mulberry32(9127);
    const px = new Float32Array(N * N), py = new Float32Array(N * N), pid = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) { px[i] = (i % N) + 0.5 + (rnd() - 0.5) * 0.9; py[i] = ((i / N) | 0) + 0.5 + (rnd() - 0.5) * 0.9; pid[i] = rnd(); }
    const hf = new Float32Array(S * S), out = new Uint8Array(S * S * 4);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const x = ((i + 0.5) / S) * N, y = ((j + 0.5) / S) * N, cx = Math.floor(x), cy = Math.floor(y);
        let d1 = 1e9, i1 = 0, x1 = 0, y1 = 0;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
            const gx = cx + a, gy = cy + b, wx = (gx + N) % N, wy = (gy + N) % N, q = wy * N + wx;
            const qx = px[q] + gx - wx, qy = py[q] + gy - wy, d = (qx - x) * (qx - x) + (qy - y) * (qy - y);
            if (d < d1) { d1 = d; x1 = qx; y1 = qy; i1 = q; }
        }
        // how far to the nearest wall of this scale, the corners between walls rounded off: a cushion, not a chipped flint
        let edge = 1e9;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
            const gx = cx + a, gy = cy + b, wx = (gx + N) % N, wy = (gy + N) % N, q = wy * N + wx; if (q === i1) continue;
            const qx = px[q] + gx - wx, qy = py[q] + gy - wy, d = ((qx - x) * (qx - x) + (qy - y) * (qy - y) - d1) / (2 * Math.hypot(qx - x1, qy - y1) + 1e-6);
            const h = Math.max(0.12 - Math.abs(edge - d), 0) / 0.12; edge = Math.min(edge, d) - h * h * 0.03;
        }
        // a narrow groove with a soft floor and a soft shoulder, and over the top of the scale a low dome about its
        // middle. (The distance to the walls alone makes every scale a pyramid of flat faces: chipped flint.)
        const e = cl(edge / 0.19, 0, 1);
        hf[j * S + i] = e * e * (3 - 2 * e) * (1 - 0.3 * Math.min(1, d1 / 0.42));
        out[(j * S + i) * 4 + 3] = Math.round(pid[i1] * 255);
    }
    let mean = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const o = (j * S + i) * 4;
        const du = (hf[j * S + ((i + 1) % S)] - hf[j * S + ((i + S - 1) % S)]) * S * 0.5, dv = (hf[((j + 1) % S) * S + i] - hf[((j + S - 1) % S) * S + i]) * S * 0.5;
        out[o] = Math.round(cl(0.5 + 0.5 * du / HIDE_SLOPE, 0, 1) * 255); out[o + 1] = Math.round(cl(0.5 + 0.5 * dv / HIDE_SLOPE, 0, 1) * 255); const cav = 1 - sstep(0, 0.6, hf[j * S + i]); out[o + 2] = Math.round(cav * 255); mean += cav / (S * S);
    }
    const t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = aniso; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    t.userData.cavity = mean;
    return t;
}

// Skin, all in the animal's rest pose so it moves with the hide. Scales of three sizes (fine on the face, the
// throat, the hands and feet; pebbles on the flank; plates along the back), laid on from three sides and lit
// through their slopes; creases across every joint and rings round the toes; soft swellings; a pale belly, a
// dark back and broken bars across it; the inside of the mouth, the gums, the tongue; the ivory of teeth, the
// horn of claws, and an eye with an iris and a pupil under a wet surface.
function skinMaterial(def, noiseTex, hideTex, tier, eye, shadowBias) {
    const rich = tier >= 2, L = def.look, S = def.len / 12.2, Z = Math.sqrt(S);
    const col = (h) => { const c = new THREE.Color(h); return vec3(c.r, c.g, c.b); };
    // (`rich`: the sheen and the wet coat below need the costlier material; phones keep the plain one)
    const mat = rich ? new THREE.MeshPhysicalNodeMaterial() : new THREE.MeshStandardNodeMaterial();
    const p = positionGeometry, n = normalize(normalGeometry), up = n.y, side = vec3(p.x, p.y, abs(p.z));
    const aA = attribute('aA', 'vec4'), aB = attribute('aB', 'vec4'), aC = attribute('aC', 'vec4');
    const kind = aA.x, ao = aA.z, arc = aB.w, tt = aC.w;
    const hard = step(0.5, kind), eyeM = step(2.5, kind), tooth = hard.mul(step(kind, 1.5)), claw = step(1.5, kind).mul(eyeM.oneMinus()), soft = hard.oneMinus();
    const wet = aA.y.mul(soft), foldA = aA.w.mul(soft), gum = aC.y.mul(soft), dark = aC.z.mul(soft), tongue = tt.mul(soft);

    // three projections, the one the hide faces most squarely nearly alone: where two shared a spot the
    // scales of one were smeared along the other
    // (Where the net bridges a crease, between a thigh and the belly, a triangle can stand nearly square to the
    // normals at its corners; there the triangle's own facing, read from how the rest pose crosses the screen, decides.)
    const fc = cross(dFdx(p), dFdy(p)), fl = dot(fc, fc), nf = fc.div(sqrt(max(fl, 1e-24))), agree = max(smoothstep(0.55, 0.85, abs(dot(nf, n))), step(fl, 1e-22));
    const an = mix(abs(nf), abs(n), agree), w2 = an.mul(an), w4 = w2.mul(w2), w8 = w4.mul(w4), w = w8.div(w8.x.add(w8.y).add(w8.z).add(1e-5));
    const tri = (tex, k) => texture(tex, p.zy.mul(k)).mul(w.x).add(texture(tex, p.xz.mul(k)).mul(w.y)).add(texture(tex, p.xy.mul(k)).mul(w.z));
    const broad = tri(noiseTex, 0.27 / Z);
    // scales of one size: the slope of their relief as a vector in the rest pose, how deep in a groove, a number per scale
    const pix = max(length(dFdx(p)), length(dFdy(p)));                 // metres of hide under one pixel
    const hide = (size, o, rel = 1) => {
        const k = 1 / (HIDE_N * size), far = smoothstep(0.6, 0.2, pix.div(size)).mul(rel);
        const tx = texture(hideTex, p.zy.mul(k).add(o)), ty = texture(hideTex, p.xz.mul(k).add(o + 0.37)), tz = texture(hideTex, p.xy.mul(k).add(o + 0.71));
        const g = vec3(0, tx.y.sub(0.5), tx.x.sub(0.5)).mul(w.x).add(vec3(ty.x.sub(0.5), 0, ty.y.sub(0.5)).mul(w.y)).add(vec3(tz.x.sub(0.5), tz.y.sub(0.5), 0).mul(w.z));
        const q = tx.zw.mul(w.x).add(ty.zw.mul(w.y)).add(tz.zw.mul(w.z));
        return { g: g.mul(far), h: mix(float(hideTex.userData.cavity), q.x, far), id: mix(float(0.5), q.y, far) };
    };
    // four sizes, and a grain (0 plates .. 1 the finest) painted on the animal that picks between them; the
    // boundary between two sizes is ragged, not a fade, so no stretch of hide shows two sizes at once
    const grain = aC.x.add(broad.g.sub(0.5).mul(0.1)), over = (a, b, t) => ({ g: mix(a.g, b.g, t), h: mix(a.h, b.h, t), id: mix(a.id, b.id, t) });
    let sc = hide(0.042 * Z, 0.41);
    if (tier >= 1) sc = over(hide(0.074 * Z, 0.77), sc, smoothstep(0.14, 0.24, grain));
    const sFine = hide(0.021 * Z, 0.13);
    sc = over(sc, sFine, smoothstep(0.45, 0.55, grain));
    if (tier >= 2) sc = over(sc, hide(0.0105 * Z, 0.29, 0.9), smoothstep(0.76, 0.86, grain));
    const g = sc.g, hh = sc.h, id = sc.id;
    // creases across the limb, the neck, the tail: ridges with a sharp valley between, two spacings
    const f1 = Math.PI / (0.05 * Z), f2 = Math.PI / (0.027 * Z);
    const crease = (ph) => { const s = sin(ph), q = sqrt(s.mul(s).add(0.04)); return { h: q, d: s.mul(cos(ph)).div(q) }; };
    const c1 = crease(arc.mul(f1).add(broad.r.mul(9.0)).add(broad.b.mul(4.0))), c2 = crease(arc.mul(f2).add(broad.g.mul(11.0)));
    const far1 = smoothstep(0.45, 0.12, pix.mul(f1 / Math.PI)), far2 = smoothstep(0.45, 0.12, pix.mul(f2 / Math.PI));
    const gFold = aB.xyz.mul(c1.d.mul(f1 * 0.0045 * Z).mul(far1).add(c2.d.mul(f2 * 0.002 * Z).mul(far2))).mul(foldA);
    // soft swellings a hand or two across
    const swell = (kx, ky, kz, ph) => { const kv = vec3(kx / Z, ky / Z, kz / Z); return kv.mul(cos(dot(p, kv).add(ph))); };
    const gSwell = swell(5.1, 7.3, 3.9, 0.3).add(swell(-6.7, 4.1, 8.3, 1.9)).add(swell(3.3, -8.9, -6.1, 4.2)).mul(0.0045 * Z);
    const G = g.mul(2 * (HIDE_SLOPE / HIDE_N) * 0.062).mul(dark.mul(0.9).oneMinus()).add(gSwell).add(gFold).mul(soft).mul(wet.mul(0.8).oneMinus());

    // ---- colour
    // bars across the back, drawn across the coordinate that runs along the animal (so they ring the tail and turn
    // with the neck), broad on top and running out to points down the flank
    const reach = smoothstep(-0.5, 0.5, up), wave = sin(arc.mul(L.stripe[0]).add(broad.r.mul(7.0)).add(p.y.mul(0.9))).mul(0.5).add(0.5);
    const bars = smoothstep(reach.mul(-0.42).add(0.66), reach.mul(-0.2).add(1.08), wave).mul(reach).mul(Math.min(1, L.stripe[1] * 1.3));
    let c = mix(col(L.belly), col(L.base), smoothstep(-0.8, -0.05, up.add(broad.g.sub(0.5).mul(0.6))));
    c = mix(c, col(L.back), smoothstep(0.3, 0.95, up.add(broad.r.sub(0.5).mul(0.7))).mul(0.8));
    c = mix(c, col(L.back).mul(0.8), bars);
    // blotches a hand across, and freckles of a few scales, darker along the back
    const mid = tri(noiseTex, 1.15 / Z);
    c = c.mul(mix(0.84, 1.12, broad.g)).mul(mix(0.82, 1.13, mid.r));
    // (their edges ragged and soft: cut clean, from across a clearing they were the patches on a cow)
    c = mix(c, col(L.back).mul(0.9), smoothstep(0.52, 0.9, mid.g.add(up.mul(0.12)).add(broad.b.sub(0.5).mul(0.25))).mul(0.32));
    // and a grain finer than the blotches that the distance does not take away: when the scales themselves have
    // gone below a pixel the hide must still not be clay
    const grit = tri(noiseTex, 4.7 / Z);
    c = c.mul(mix(0.8, 1.16, grit.b)).mul(mix(1.0, 0.82, smoothstep(0.6, 0.85, grit.r).mul(smoothstep(-0.4, 0.6, up))));
    if (L.face) c = mix(c, col(L.face), smoothstep(def.eyes[0][0] - 0.5, def.eyes[0][0] + 0.9, p.x).mul(smoothstep(def.eyes[0][1] - 0.75, def.eyes[0][1] - 0.2, p.y)).mul(0.55));
    if (L.crest) c = mix(c, col(L.crest[2]), smoothstep(L.crest[1] - 0.4, L.crest[1] + 0.2, p.y).mul(float(1).sub(smoothstep(L.crest[0], L.crest[0] + 0.9, p.x))).mul(0.8));
    if (L.frill) c = mix(c, col(L.frill[2]), smoothstep(L.frill[1] - 0.35, L.frill[1] + 0.25, p.y).mul(smoothstep(L.frill[0] + 0.7, L.frill[0] - 0.1, p.x)).mul(smoothstep(0.3, 0.75, broad.r.add(broad.a.mul(0.3)))).mul(0.85));
    // every scale its own shade, the grooves between them dark with dirt, the creases too
    c = c.mul(mix(0.84, 1.14, id)).mul(float(1).sub(hh.mul(0.48)));
    c = c.mul(float(1).sub(foldA.mul(0.3).mul(float(1).sub(c1.h)).mul(far1)));
    // dust and mud up the legs
    c = mix(c, col('#5a4d3c'), smoothstep(def.hip * 0.34, 0.0, p.y).mul(0.6));
    // dark skin round the eye, darker still at the edge of the lids, in the nostril and the ear
    let eyeCol = vec3(0.01, 0.008, 0.006);
    if (eye) {
        const q = side.sub(vec3(eye.c[0], eye.c[1], eye.c[2])), dq = length(q), d = q.div(dq);
        c = mix(c, c.mul(0.42), smoothstep(eye.R * 3.2, eye.R * 1.2, dq).mul(0.55));
        // the eye itself: an iris of fibres round a round pupil, a dark ring where it meets the white, which is not white
        const ex = dot(d, vec3(eye.Rv[0], eye.Rv[1], eye.Rv[2])), ey = dot(d, vec3(eye.U[0], eye.U[1], eye.U[2]));
        const rr = length(vec2(ex, ey)).div(Math.sin(eye.iris)), ang = atan(ey, ex.add(1e-6));       // (on the pupil's own axis there is no bearing: nudged, atan has an answer)
        const fibre = sin(ang.mul(31.0).add(sin(ang.mul(9.0)).mul(2.5))).mul(0.5).add(0.5).mul(sin(ang.mul(73.0).add(rr.mul(5.0))).mul(0.25).add(0.75));
        let ic = mix(col(L.iris[0]), col(L.iris[1]), smoothstep(0.46, 0.8, rr)).mul(mix(0.6, 1.25, fibre));
        ic = ic.mul(smoothstep(1.0, 0.78, rr).mul(0.9).add(0.1));
        ic = mix(ic, vec3(0.003, 0.003, 0.003), smoothstep(0.5, 0.44, rr));
        eyeCol = mix(vec3(0.02, 0.012, 0.008), ic, smoothstep(1.03, 0.98, rr));
        eyeCol = eyeCol.mul(mix(1.0, 0.35, smoothstep(Math.sin(eye.up) * 0.1, Math.sin(eye.up) * 1.05, ey)));          // the upper lid's shade
        // a window of sky caught in it, wherever it is seen from: what says the eye is wet when the sun is not placed to say so
        eyeCol = mix(eyeCol, vec3(0.8, 0.88, 1.0), smoothstep(0.986, 0.997, dot(normalView, normalize(vec3(-0.24, 0.2, 0.95)))).mul(0.6));
    }
    c = mix(c, c.mul(0.22), dark);
    // inside the mouth: pale wet flesh, darker down the throat; gums; the tongue
    if (def.mouth) {
        const deep = smoothstep(def.mouth + 0.3, def.mouth - 0.1, p.x);
        c = mix(c, mix(col('#8f4a50'), col('#200a0c'), deep), wet);
        c = mix(c, col('#7a4850').mul(mix(0.7, 1.1, sFine.id)), tongue.mul(float(1).sub(deep.mul(0.6))));
        c = mix(c, col('#5a3534'), gum.mul(0.9));
    }
    const grime = texture(noiseTex, p.xy.mul(7.0).add(p.z.mul(3.1))).g;
    const ivory = mix(col('#3b2a18'), col('#bfb38e'), smoothstep(0.1, 0.62, tt.add(grime.sub(0.5).mul(0.4)))).mul(mix(0.8, 1.05, grime));      // stained where it leaves the gum
    const horny = mix(col('#15110c'), col('#3f352a'), smoothstep(0.15, 1.0, tt)).mul(mix(0.75, 1.15, grime));
    mat.colorNode = mix(mix(mix(c.mul(vec3(1.05, 1.01, 0.88)).mul(mix(0.68, 1.0, smoothstep(0.1, 0.8, ao))), ivory, tooth), horny, claw), eyeCol, eyeM);
    const groove = hh;
    mat.roughnessNode = mix(mix(mix(mix(mix(mix(float(0.5), float(0.84), groove.mul(0.7).add(broad.b.mul(0.3))), 0.4, gum.mul(0.7)), 0.3, wet), 0.3, tooth), 0.36, claw), 0.045, eyeM);
    mat.metalnessNode = float(0);
    mat.aoNode = ao;
    if (rich) mat.specularIntensity = 0.6;
    // The relief, without a parameterisation: the slope is a vector in the rest pose, and how far the rest pose
    // moves from one pixel to the next says how much of it this pixel sees. No height is ever differenced
    // across pixels, so nothing breaks into speckle at a glancing angle.
    mat.normalNode = Fn(() => {
        // the slope's part along the hide, written in the two directions the rest pose moves across the screen...
        const rx = dFdx(p), ry = dFdy(p), E = dot(rx, rx), F = dot(rx, ry), H2 = dot(ry, ry), u = dot(G, rx), v = dot(G, ry);
        const D = max(E.mul(H2).sub(F.mul(F)), 1e-16);
        // ...is the same amounts of the two directions the posed animal moves across it
        const grad = dFdx(positionView).mul(H2.mul(u).sub(F.mul(v)).div(D)).add(dFdy(positionView).mul(E.mul(v).sub(F.mul(u)).div(D)));
        return normalize(normalView.sub(grad.div(length(grad).mul(1.7).add(1.0))));
    })();
    // The sun's shadow is looked up a little way out along the normal, and three takes the normal the light sees:
    // the one with every scale on it. Each scale then read the shadow somewhere else, and a shadow's edge on the
    // hide came out hatched. Step back along the scaled normal and out along the smooth one instead.
    mat.receivedShadowPositionNode = positionWorld.add(normalWorldGeometry.sub(normalWorld).mul(shadowBias));
    mat.envMapIntensity = 1.0;
    if (rich) {
        // Hide catches light along its edge: the sky on a flank turned away, the sun along a back. It is what
        // lifts an animal off the ground behind it when the light is flat.
        mat.sheenNode = mix(vec3(0.13, 0.125, 0.11), vec3(0.08, 0.068, 0.05), smoothstep(-0.2, 0.6, up)).mul(soft).mul(wet.oneMinus());
        mat.sheenRoughnessNode = float(0.42);
        // and what is wet has a second, smooth surface over it: the eye above all, the mouth, a little on the teeth
        mat.clearcoatNode = eyeM.add(wet.mul(0.3)).add(tooth.mul(0.3));
        mat.clearcoatRoughnessNode = mix(float(0.22), float(0.03), eyeM);
    }
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
            (this.blobN || (this.blobN = new THREE.Vector3())).copy(_nv);
            this.blob.quaternion.setFromUnitVectors(_up, _nv).multiply(_q.setFromAxisAngle(_up, m.rotation.y));
            this.blob.position.set(x, hc - sink, z).addScaledVector(_nv, 0.07);
        }
    }

    // turn on the spot without re-seating the animal
    turnTo(heading) {
        this.heading = heading; this.mesh.rotation.y = Math.PI / 2 - heading;
        if (this.blob && this.blobN) this.blob.quaternion.setFromUnitVectors(_up, this.blobN).multiply(_q.setFromAxisAngle(_up, this.mesh.rotation.y));
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
            // ---- set pieces (scenes.js sets these)
            const act = this.act;
            if (act) {
                if (act.gaze) {                             // following something with its head: [left, up]
                    B.neck.rotation.y = B.neck.rotation.y * 0.4 + act.gaze[0] * 0.42; B.head.rotation.y = B.head.rotation.y * 0.4 + act.gaze[0] * 0.5;
                    B.neck.rotation.z += act.gaze[1] * 0.5; B.head.rotation.z += act.gaze[1] * 0.45;
                }
                if (act.step > 0.01) {                      // stepping on the spot while it turns
                    const k = Math.min(1, act.step);
                    for (const [sd, off] of [['L', 0], ['R', Math.PI]]) { const sw = Math.max(0, Math.sin(t * 7.5 + off)); B['thigh' + sd].rotation.z += 0.22 * k * sw; B['shin' + sd].rotation.z -= 0.34 * k * sw; B['foot' + sd].rotation.z += 0.22 * k * sw; }
                    this.root.position.y += 0.05 * k * Math.abs(Math.sin(t * 7.5));
                }
                if (act.lunge > 0.001) {                    // head down and forward, to shove something
                    const k = act.lunge;
                    this.root.rotation.z -= 0.2 * k; this.root.position.x += 0.55 * k; this.root.position.y -= 0.22 * k;
                    B.neck.rotation.z -= 0.34 * k; B.neck2.rotation.z -= 0.12 * k; B.head.rotation.z += 0.3 * k; B.head.rotation.y *= 1 - k; B.neck.rotation.y *= 1 - k;
                    B.jaw.rotation.z -= 0.1 * k; B.tail1.rotation.z += 0.16 * k; B.tail2.rotation.z += 0.1 * k;
                    for (const sd of ['L', 'R']) { B['thigh' + sd].rotation.z += 0.2 * k; }
                }
                if (act.typing > 0.001) {                   // reared up at a desk, tapping
                    const k = act.typing;
                    this.root.rotation.z += 0.3 * k; this.root.position.y += 0.18 * k;
                    for (const sd of ['L', 'R']) { B['thigh' + sd].rotation.z -= 0.3 * k; }
                    B.tail1.rotation.z -= 0.3 * k; B.tail2.rotation.z -= 0.16 * k; B.tail3.rotation.z += 0.12 * k;
                    B.chest.rotation.z -= 0.06 * k;
                    B.neck.rotation.set(0, (-0.74 + 0.03 * slow) * k + B.neck.rotation.y * (1 - k), -0.36 * k + B.neck.rotation.z * (1 - k));
                    B.neck2.rotation.set(0.1 * k, (-0.22 + 0.03 * slow2) * k, -0.28 * k);
                    B.head.rotation.set(0.2 * k + 0.02 * slow2, (0.5 + 0.04 * Math.sin(t * 0.8)) * k, -0.3 * k + 0.04 * Math.sin(t * 1.3));
                    const tapL = Math.pow(Math.max(0, Math.sin(t * 11.0)), 2), tapR = Math.pow(Math.max(0, Math.sin(t * 11.0 + 2.4 + Math.sin(t * 1.7))), 2);
                    B.armL.rotation.z = lerp(B.armL.rotation.z, 0.72 + 0.2 * tapL, k); B.handL.rotation.z = lerp(B.handL.rotation.z, -0.75 - 0.3 * tapL, k);
                    B.armR.rotation.z = lerp(B.armR.rotation.z, 0.72 + 0.2 * tapR, k); B.handR.rotation.z = lerp(B.handR.rotation.z, -0.75 - 0.3 * tapR, k);
                    B.jaw.rotation.z = -0.02;
                }
            }
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

// ---- the menagerie -------------------------------------------------------------
// (shadowNormalBias: the sun's shadow.normalBias, as main.js sets it)
export function createFauna({ island, places, quality, noiseTex, groundTex, sites, skin = null, shadowNormalBias = 0.35 }) {
    const group = new THREE.Group(); group.name = 'fauna';
    const sp = {};
    const rnd = mulberry32(555);
    const animals = [];
    // one sheet of scales for all of them (the photograph of skin is no longer used: enlarged over an animal this size it was a blur)
    const hideTex = makeHideTexture(quality.post >= 2 ? 768 : 512, quality.light ? quality.light.aniso : 4);
    const build = (key) => { if (!sp[key]) sp[key] = buildSpecies(SPECIES[key], quality, noiseTex, hideTex, key, shadowNormalBias); return sp[key]; };
    const spawn = (key, scale, opt = {}) => { const a = new Animal(build(key), scale, rnd()); Object.assign(a, opt); group.add(a.mesh); group.add(a.blob); animals.push(a); return a; };

    // the rex: one animal, moved to wherever the visitor is going
    const rex = spawn('rex', 1, { gait: 'idle', home: null });
    let rexPlace = -1;
    const setRex = (i) => {
        const p = places[i];
        if (!p || !p.rex) { rex.mesh.visible = false; rex.blob.visible = false; rexPlace = i; return; }
        rex.mesh.visible = true; rex.blob.visible = true; rex.drop = 0; rex.act = { typing: p.pose === 'typing' ? 1 : 0, lunge: 0, step: 0 }; rex.place(island, p.rex.x, p.rex.z, p.rex.heading); rexPlace = i;
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
            const t = lerp(30, 92, rnd()), lat = lerp(-0.5, 0.5, rnd()) * t;
            const x = pl.cam[0] + fx * t - fz * lat, z = pl.cam[2] + fz * t + fx * lat, h = island.heightAt(x, z);
            if (h > -0.12 || h < -1.05) continue;
            if (spots.some((q) => Math.hypot(q[0] - x, q[1] - z) < 17)) continue;
            if (pl.speaker && Math.hypot(pl.speaker.x - x, pl.speaker.z - z) < 13) continue;
            if (pl.rex && Math.hypot(pl.rex.x - x, pl.rex.z - z) < 15) continue;
            spots.push([x, z]);
        }
        for (const [x, z] of spots) {
            const a = spawn('hadro', lerp(0.82, 1.08, rnd()), { gait: 'idle' });
            const sp = pl.speaker;        // they have turned toward the sound
            a.place(island, x, z, sp ? Math.atan2(sp.x - x, -(sp.z - z)) + (rnd() - 0.5) * 0.5 : Math.atan2(-fz, -fx) + (rnd() - 0.5) * 0.9); waders.push(a);
        }
    }
    // a few sauropods browsing at the forest edge by the lake, for scale
    const browsers = [];
    for (const [x, z, hd, s] of [[sites.music.x + 150, sites.music.z - 190, 2.2, 1.05], [sites.music.x + 190, sites.music.z - 205, 2.8, 0.85]]) { if (island.heightAt(x, z) < 0.6) continue; const a = spawn('sauropod', s, { gait: 'idle' }); a.place(island, x, z, hd); browsers.push(a); }

    // ---- pterosaurs gliding round the sea cliffs and drifting over the island
    const NP = Math.round(22 * Math.min(1, quality.fauna + 0.2));
    const birds = createFlock(NP, { noiseTex, detail: quality.fauna >= 1 ? 1 : 0.7 });
    const stroke = {};
    group.add(birds.mesh);
    const flock = [];
    for (let i = 0; i < NP; i++) {
        const near = i < NP * 0.62;
        const c = near ? [sites.balloons.x - 70 + (rnd() - 0.5) * 220, sites.balloons.z - 20 + (rnd() - 0.5) * 220] : [(rnd() - 0.5) * 1100, (rnd() - 0.5) * 1100];
        flock.push({ cx: c[0], cz: c[1], r: lerp(30, 120, rnd()) * (near ? 1 : 2.2), h: (near ? lerp(55, 130, rnd()) : lerp(150, 330, rnd())), w: lerp(0.05, 0.12, rnd()) * (rnd() < 0.5 ? 1 : -1) / (near ? 1 : 2), ph: rnd() * 6.283, s: lerp(0.8, 1.3, rnd()) });
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
            // mostly gliding; a few slow beats now and then
            const beat = Math.max(0, Math.sin(t * 0.33 + f.ph * 5));
            wingStroke(t * 3.6 + f.ph * 7, beat * beat * 0.8, stroke);
            // too far off they are only specks of dirt in the sky
            birds.set(i, x, f.h + 6 * Math.sin(t * 0.21 + f.ph * 3), z, Math.hypot(x - cx, z - cz) > 560 ? 0 : f.s, Math.atan2(-dirz, dirx), Math.sign(f.w) * 0.38, stroke.flap, 0.03 * Math.cos(t * 0.21 + f.ph * 3), stroke.curl, stroke.fold, (f.ph * 0.159) % 1);
        }
        birds.commit();
    };

    let tris = 0; for (const k of Object.keys(sp)) tris += sp[k].tris;
    return { group, update, setRex, rex, animals, stats: { animals: animals.length, pterosaurs: NP, meshTris: tris, species: Object.fromEntries(Object.keys(sp).map((k) => [k, sp[k].tris])), buildMs: Object.fromEntries(Object.keys(sp).map((k) => [k, sp[k].ms])) }, get rexPlace() { return rexPlace; } };
}

const _v = new THREE.Vector3(), _nv = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _n3 = [0, 1, 0];
