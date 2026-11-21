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

    // lay the footprint of everything solid that stands on the ground into each stop's square
    const mask = (roots, extra = []) => {
        const box = new THREE.Box3(), m = new THREE.Matrix4(), v3 = new THREE.Vector3();
        const quad = (pts, shade = true) => {
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
                    if (inside) { data[(layer * TILE * TILE + j * TILE + i) * 2] = 255; if (shade) solid[layer * TILE * TILE + j * TILE + i] = 255; }
                }
            });
        };
        const stamp = (geometry, matrix) => {
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
            for (const f of [[0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) quad(f.map((k) => [P8[k][0], P8[k][2]]));
        };
        for (const root of roots) {
            root.updateMatrixWorld(true);
            root.traverse((o) => {
                if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || o.isSkinnedMesh) return;
                const mt = o.material; if (!mt || mt.transparent || mt.isMeshBasicNodeMaterial || mt.isLineBasicNodeMaterial) return;
                if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); stamp(o.geometry, m); } }
                else if (!o.geometry.isInstancedBufferGeometry) stamp(o.geometry, o.matrixWorld);
            });
        }
        for (const [x, z, r, shade = true] of extra.concat(loose)) { const n = 10, pts = []; for (let k = 0; k < n; k++) pts.push([x + Math.cos((k / n) * 6.283) * r, z + Math.sin((k / n) * 6.283) * r]); quad(pts, shade); }
        // the shade beside each footprint: the footprint itself, spread about a metre and softened
        const tmp = new Float32Array(TILE * TILE), tmp2 = new Float32Array(TILE * TILE), R = 4;
        tiles.forEach((t, layer) => {
            if (t.aerial) return;
            const o = layer * TILE * TILE;
            for (let pass = 0; pass < 2; pass++) {
                for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) { let a = 0; for (let k = -R; k <= R; k++) { const q = Math.min(TILE - 1, Math.max(0, i + k)); a += pass ? tmp2[j * TILE + q] : solid[o + j * TILE + q] / 255; } tmp[j * TILE + i] = a / (2 * R + 1); }
                for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) { let a = 0; for (let k = -R; k <= R; k++) a += tmp[Math.min(TILE - 1, Math.max(0, j + k)) * TILE + i]; tmp2[j * TILE + i] = a / (2 * R + 1); }
            }
            for (let i = 0; i < TILE * TILE; i++) data[(o + i) * 2 + 1] = Math.round(255 * Math.min(1, tmp2[i] * 1.7));
        });
        tex.needsUpdate = true;
    };

    const update = (camera) => {
        const e = camera.position;
        let best = -1, bd = 1e18;
        for (let i = 0; i < tiles.length; i++) { if (tiles[i].aerial) continue; const dx = tiles[i].x + SPAN / 2 - e.x, dz = tiles[i].z + SPAN / 2 - e.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
        if (best >= 0) uTile.value.set(tiles[best].x, tiles[best].z, best);
    };

    return { tex, at, place, add, mask, update };
}
