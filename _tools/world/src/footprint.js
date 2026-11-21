// What stands on the ground. Round every stop there is a square of the island
// (64 m, 25 cm cells) into which the footprint of each solid prop is drawn once
// everything has been put down: the stone keys, the standing stones, the tents,
// the stump. Two things read it. The ground cover leaves those cells bare, so
// nothing grows up through a stone; and the ground darkens a little round the
// edge of each footprint, the soft shade that seats a heavy thing on the earth.
import * as THREE from 'three/webgpu';
import { uniform, texture, vec2, float, int, step } from 'three/tsl';

const TILE = 256, SPAN = 64;

export function createFootprints({ island, count }) {
    const data = new Uint8Array(TILE * TILE * count * 2);       // r: taken, g: the shade round it
    const solid = new Uint8Array(TILE * TILE * count);          // what the shade is spread from: only what stands there for good
    const tex = new THREE.DataArrayTexture(data, TILE, TILE, count);
    tex.format = THREE.RGFormat; tex.type = THREE.UnsignedByteType; tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const uTile = uniform(new THREE.Vector3(0, 0, 0));          // the nearest stop's square: its corner (x, z) and its layer
    let tiles = [];

    // r: 1 where something stands, g: 1 right beside it, falling to 0 about a metre away. `vertex`: read from a vertex shader.
    const at = (xz, vertex = false) => {
        const tuv = xz.sub(uTile.xy).div(SPAN);
        const inTile = step(0.0, tuv.x).mul(step(tuv.x, 1.0)).mul(step(0.0, tuv.y)).mul(step(tuv.y, 1.0));
        const t = texture(tex, tuv).depth(int(uTile.z));
        return (vertex ? t.level(0) : t).rg.mul(inTile);
    };

    // each square is centred a little ahead of its stop's camera, on the ground the lens and the ground cover
    // actually take in (the site a stop is about can be two hundred metres from where its camera stands)
    const place = (places) => { tiles = places.map((p) => ({ x: p.cam[0] + p.fwd[0] * 16 - SPAN / 2, z: p.cam[2] + p.fwd[1] * 16 - SPAN / 2, aerial: p.aerial })); };
    // round things that are scattered rather than built (the plants' boulders and fallen trunks): [x, z, r]
    const loose = [];
    // `shade: false`: ground kept bare for something that only sometimes lies there (a stone that is knocked over)
    const add = (x, z, r, shade = true) => { loose.push([x, z, r, shade]); };
    // Things that are knocked over and stood up again (the standing stones). Each is drawn twice, upright and
    // lying, and its shade is spread from both; the ground then wears a mix of the two, by how far over the
    // thing is. The ground is kept bare under both.
    const movers = [], staticShade = new Map(), scratch = new Float32Array(TILE * TILE);
    let dirty = false;
    const mover = (geometry, upright, lying) => { movers.push({ geometry, upright: upright.clone(), lying: lying.clone(), f: 0, parts: [] }); return movers.length - 1; };
    const setFall = (i, f) => { const mv = movers[i]; if (mv && mv.f !== f && (f <= 0 || f >= 1 || Math.abs(mv.f - f) > 0.004)) { mv.f = f; dirty = true; } };
    const refresh = (force = false) => {
        if (!dirty && !force) return;
        dirty = false;
        const each = (fn) => { for (const mv of movers) for (const q of mv.parts) for (let j = 0; j < q.h; j++) for (let i = 0; i < q.w; i++) fn(mv, q, j * q.w + i, (q.j0 + j) * TILE + q.i0 + i); };
        // (a layer at a time would be tidier; there is only ever the one the stones stand in)
        for (const [layer, base] of staticShade) {
            each((mv, q, k, at) => { if (q.layer === layer) scratch[at] = base[at]; });
            each((mv, q, k, at) => { if (q.layer === layer) scratch[at] += q.a[k] * (1 - mv.f) + q.b[k] * mv.f; });
            each((mv, q, k, at) => { if (q.layer === layer) data[(layer * TILE * TILE + at) * 2 + 1] = Math.round(255 * Math.min(1, scratch[at] * 1.7)); });
            if (!force) tex.addLayerUpdate(layer);                // (only this square goes back to the GPU, not all of them)
        }
        if (staticShade.size || force) tex.needsUpdate = true;
    };

    // lay the footprint of everything solid that stands on the ground into each stop's square
    const mask = (roots, extra = []) => {
        const box = new THREE.Box3(), m = new THREE.Matrix4(), v3 = new THREE.Vector3();
        const quad = (pts, shade = true, put = null) => {
            // a convex four-sided footprint (x, z), drawn into every square it touches
            let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
            for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
            if (x1 - x0 > 24 || z1 - z0 > 24) return;
            let area = 0; for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
            if (Math.abs(area) < 0.02) return;                   // a sheet seen edge-on (a window pane) stands on nothing
            const turn = Math.sign(area), pad = 0.16, cell = SPAN / TILE;
            tiles.forEach((t, layer) => {
                if (t.aerial || x1 < t.x || x0 > t.x + SPAN || z1 < t.z || z0 > t.z + SPAN) return;
                const i0 = Math.max(0, Math.floor((x0 - pad - t.x) / cell)), i1 = Math.min(TILE - 1, Math.ceil((x1 + pad - t.x) / cell));
                const j0 = Math.max(0, Math.floor((z0 - pad - t.z) / cell)), j1 = Math.min(TILE - 1, Math.ceil((z1 + pad - t.z) / cell));
                for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                    const px = t.x + (i + 0.5) * cell, pz = t.z + (j + 0.5) * cell;
                    let inside = true;
                    for (let k = 0; k < pts.length && inside; k++) {
                        const a = pts[k], b = pts[(k + 1) % pts.length];
                        const el = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, cr = ((b[0] - a[0]) * (pz - a[1]) - (b[1] - a[1]) * (px - a[0])) / el;
                        if (cr * turn < -pad) inside = false;
                    }
                    if (inside) { data[(layer * TILE * TILE + j * TILE + i) * 2] = 255; if (put) put(layer, i, j); else if (shade) solid[layer * TILE * TILE + j * TILE + i] = 255; }
                }
            });
        };
        const stamp = (geometry, matrix, put = null) => {
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            box.copy(geometry.boundingBox);
            if (!isFinite(box.min.x) || box.isEmpty()) return;
            const P8 = [];
            for (let k = 0; k < 8; k++) { v3.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).applyMatrix4(matrix); P8.push([v3.x, v3.y, v3.z]); }
            let lo = 1e9, hi = -1e9, mx = 0, mz = 0; for (const q of P8) { lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); mx += q[0] / 8; mz += q[2] / 8; }
            const g = island.heightAt(mx, mz);
            if (lo > g + 0.55 || hi < g - 0.1) return;           // up in the air, or buried
            // every face of the box, as a four-sided shape on the ground: together, its whole shadow from above
            // (floor and lid alone lose anything lying on its side, a log, a fallen stone)
            for (const f of [[0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) quad(f.map((k) => [P8[k][0], P8[k][2]]), true, put);
        };
        for (const root of roots) {
            root.updateMatrixWorld(true);
            root.traverse((o) => {
                if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || o.isSkinnedMesh) return;
                if (o.userData.footprint === false) return;   // (it has registered itself as a mover)
                const mt = o.material; if (!mt || mt.transparent || mt.isMeshBasicNodeMaterial || mt.isLineBasicNodeMaterial) return;
                if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); stamp(o.geometry, m); } }
                else if (!o.geometry.isInstancedBufferGeometry) stamp(o.geometry, o.matrixWorld);
            });
        }
        for (const [x, z, r, shade = true] of extra.concat(loose)) { const n = 10, pts = []; for (let k = 0; k < n; k++) pts.push([x + Math.cos((k / n) * 6.283) * r, z + Math.sin((k / n) * 6.283) * r]); quad(pts, shade); }
        const R = 4;
        // the movers: each pose drawn into a window of its own and spread exactly as the rest is below
        // (past the edge of a window there is nothing; past the edge of the square itself the last cell repeats,
        // which is what the spreading of everything else does there)
        const soften = (src, w, h, i0, j0) => {
            const t1 = new Float32Array(w * h); let cur = src;
            const col = (q) => (q < 0 ? (i0 === 0 ? 0 : -1) : q >= w ? (i0 + w === TILE ? w - 1 : -1) : q), row = (q) => (q < 0 ? (j0 === 0 ? 0 : -1) : q >= h ? (j0 + h === TILE ? h - 1 : -1) : q);
            for (let pass = 0; pass < 2; pass++) {
                const out = new Float32Array(w * h);
                for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let a = 0; for (let k = -R; k <= R; k++) { const q = col(i + k); if (q >= 0) a += cur[j * w + q]; } t1[j * w + i] = a / (2 * R + 1); }
                for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let a = 0; for (let k = -R; k <= R; k++) { const q = row(j + k); if (q >= 0) a += t1[q * w + i]; } out[j * w + i] = a / (2 * R + 1); }
                cur = out;
            }
            return cur;
        };
        staticShade.clear();
        for (const mv of movers) {
            mv.parts.length = 0;
            const cells = [new Map(), new Map()];                // per pose: layer -> the cells it covers
            [mv.upright, mv.lying].forEach((mat, pose) => stamp(mv.geometry, mat, (layer, i, j) => { if (!cells[pose].has(layer)) cells[pose].set(layer, []); cells[pose].get(layer).push(i, j); }));
            for (const layer of new Set([...cells[0].keys(), ...cells[1].keys()])) {
                let i0 = TILE, i1 = -1, j0 = TILE, j1 = -1;
                for (const c of cells) { const l = c.get(layer) || []; for (let k = 0; k < l.length; k += 2) { i0 = Math.min(i0, l[k]); i1 = Math.max(i1, l[k]); j0 = Math.min(j0, l[k + 1]); j1 = Math.max(j1, l[k + 1]); } }
                i0 = Math.max(0, i0 - 2 * R); j0 = Math.max(0, j0 - 2 * R); i1 = Math.min(TILE - 1, i1 + 2 * R); j1 = Math.min(TILE - 1, j1 + 2 * R);
                const w = i1 - i0 + 1, h = j1 - j0 + 1;
                const [a, b] = cells.map((c) => { const src = new Float32Array(w * h), l = c.get(layer) || []; for (let k = 0; k < l.length; k += 2) src[(l[k + 1] - j0) * w + l[k] - i0] = 1; return soften(src, w, h, i0, j0); });
                mv.parts.push({ layer, i0, j0, w, h, a, b });
                if (!staticShade.has(layer)) staticShade.set(layer, null);
            }
        }
        // the shade beside each footprint: the footprint itself, spread about a metre and softened
        const tmp = new Float32Array(TILE * TILE), tmp2 = new Float32Array(TILE * TILE);
        tiles.forEach((t, layer) => {
            if (t.aerial) return;
            const o = layer * TILE * TILE;
            for (let pass = 0; pass < 2; pass++) {
                for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) { let a = 0; for (let k = -R; k <= R; k++) { const q = Math.min(TILE - 1, Math.max(0, i + k)); a += pass ? tmp2[j * TILE + q] : solid[o + j * TILE + q] / 255; } tmp[j * TILE + i] = a / (2 * R + 1); }
                for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) { let a = 0; for (let k = -R; k <= R; k++) a += tmp[Math.min(TILE - 1, Math.max(0, j + k)) * TILE + i]; tmp2[j * TILE + i] = a / (2 * R + 1); }
            }
            for (let i = 0; i < TILE * TILE; i++) data[(o + i) * 2 + 1] = Math.round(255 * Math.min(1, tmp2[i] * 1.7));
            if (staticShade.has(layer)) staticShade.set(layer, Float32Array.from(tmp2));
        });
        tex.needsUpdate = true;
        refresh(true);
    };

    const update = (camera) => {
        const e = camera.position;
        let best = -1, bd = 1e18;
        for (let i = 0; i < tiles.length; i++) { if (tiles[i].aerial) continue; const dx = tiles[i].x + SPAN / 2 - e.x, dz = tiles[i].z + SPAN / 2 - e.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
        if (best >= 0) uTile.value.set(tiles[best].x, tiles[best].z, best);
    };

    return { tex, at, place, add, mask, update, mover, setFall, refresh };
}
