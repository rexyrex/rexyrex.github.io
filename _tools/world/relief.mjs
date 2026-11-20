#!/usr/bin/env node
/* Shaded-relief preview of the island (no GPU): node relief.mjs [out.png] [N]
   Sea in blue by depth, land hillshaded by vegetation, sites as dots. */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { createIsland, SITES, WORLD, RIVER, TRAIL } from './src/island.js';

const out = process.argv[2] || 'relief.png';
const N = +(process.argv[3] || 768);
const t0 = performance.now();
const isl = createIsland(N);
isl.fillRows(0, N); isl.finish();
const t1 = performance.now();
const px = new Uint8Array(N * N * 3);
const sun = [-0.7, 0.45, -0.25]; { const l = Math.hypot(...sun); sun[0] /= l; sun[1] /= l; sun[2] /= l; }
let hmax = -1e9, land = 0;
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = j * N + i, h = isl.height[o];
    if (h > hmax) hmax = h; if (h > 0) land++;
    const nx = isl.infoA[o * 4] / 127.5 - 1, nz = isl.infoA[o * 4 + 1] / 127.5 - 1, ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
    const veg = isl.infoA[o * 4 + 2] / 255, ao = isl.infoA[o * 4 + 3] / 255;
    const volc = isl.infoB[o * 4] / 255, strata = isl.infoB[o * 4 + 1] / 255, trail = isl.infoB[o * 4 + 2] / 255;
    let r, g, b;
    if (h <= 0) { const d = Math.min(1, -h / 30); r = 60 - 45 * d; g = 170 - 110 * d; b = 190 - 80 * d; }
    else {
        const sh = Math.max(0, nx * sun[0] + ny * sun[1] + nz * sun[2]) * 1.5 * ao + 0.25;
        let cr = 150, cg = 135, cb = 105;                                  // bare ground
        cr = cr + (70 - cr) * veg; cg = cg + (120 - cg) * veg; cb = cb + (55 - cb) * veg;
        cr = cr + (60 - cr) * volc; cg = cg + (55 - cg) * volc; cb = cb + (58 - cb) * volc;
        cr = cr + (190 - cr) * strata * 0.6; cg = cg + (120 - cg) * strata * 0.6; cb = cb + (80 - cb) * strata * 0.6;
        if (h < 2.2) { cr = 225; cg = 205; cb = 160; }
        if (trail > 0.4) { cr = 240; cg = 230; cb = 120; }
        r = cr * sh; g = cg * sh; b = cb * sh;
    }
    px[o * 3] = Math.min(255, r); px[o * 3 + 1] = Math.min(255, g); px[o * 3 + 2] = Math.min(255, b);
}
const dot = (x, z, c, rad = 4) => { const ci = Math.round((x + WORLD / 2) / WORLD * (N - 1)), cj = Math.round((z + WORLD / 2) / WORLD * (N - 1)); for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) { if (i * i + j * j > rad * rad) continue; const a = ci + i, b = cj + j; if (a < 0 || b < 0 || a >= N || b >= N) continue; px.set(c, (b * N + a) * 3); } };
for (const [k, s] of Object.entries(SITES)) dot(s.x, s.z, [255, 40, 40]);
const raw = Buffer.alloc((N * 3 + 1) * N);
for (let j = 0; j < N; j++) { raw[j * (N * 3 + 1)] = 0; Buffer.from(px.buffer, j * N * 3, N * 3).copy(raw, j * (N * 3 + 1) + 1); }
const crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${out}: ${N}x${N}, bake ${(t1 - t0).toFixed(0)} ms, max height ${hmax.toFixed(0)} m, land ${(100 * land / (N * N)).toFixed(0)}%`);
for (const [k, s] of Object.entries(SITES)) console.log(k.padEnd(9), 'h=' + isl.gridAt(s.x, s.z).toFixed(1).padStart(6), 'veg=' + isl.vegAt(s.x, s.z).toFixed(2));
