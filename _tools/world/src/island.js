// The island as data: where things are, and how high the ground is. Pure CPU,
// no three.js, so it also runs in Node (see ../relief.mjs).
//
// Axes: +x east, +z south, +y up, metres. Sea level is y = 0.
import { clamp, lerp, smoothstep, smin, smax, fbm2, ridged2, perlin2, polyDist, hash2 } from './noise.js';

export const WORLD = 2560;          // side of the square the heightmap covers
export const SEA_FLOOR = -62;

// ---- designed features --------------------------------------------------------
export const VOLCANO = { x: 70, z: -380, rim: 66, top: 262, floor: 196 };
export const LAKE = { x: 430, z: 120, r: 150 };
export const RIDGE = [[150, -250], [215, -180], [262, -112], [300, -40]];
export const RIVER = [[96, -118], [20, -70], [-46, 4], [-18, 78], [70, 128], [190, 138], [300, 118], [430, 120], [575, 150], [690, 172], [800, 196], [960, 230]];
export const TRAIL = [[-250, 210], [-170, 150], [-80, 150], [10, 176], [96, 196], [176, 190], [250, 168]];
export const CANYON = [[352, 486], [420, 462], [490, 470], [556, 486], [628, 506], [730, 540]];
export const STACKS = [[-748, -404, 30, 58], [-790, -322, 21, 40], [-716, -486, 36, 66], [-822, -430, 15, 26], [-694, -292, 13, 22]];

// Named places. `at` is the ground point the place is about; cameras, props and
// planting are all derived from it (see places.js).
export const SITES = {
    overlook: { x: -508, z: 318 },
    typing: { x: -332, z: -84 },
    balloons: { x: -604, z: -352 },
    apps: { x: -152, z: 262 },
    games: { x: 70, z: -380 },
    mac: { x: 262, z: -112 },
    tesla: { x: 10, z: 176 },
    music: { x: 372, z: 268 },
    log: { x: 490, z: 470 },
    index: { x: 0, z: 0 },
    contact: { x: 150, z: 700 },
};

const coastNoise = (x, z) => {
    const a = Math.atan2(z, x);
    // big lobes (bays and headlands), then smaller coves
    return 150 * fbm2(Math.cos(a) * 1.15 + 3.1, Math.sin(a) * 1.15 - 1.3, 4) + 64 * fbm2(x / 300 + 9.2, z / 300 + 4.4, 4);
};

// signed distance to the coast, + inland (before features move it)
function shoreDist(x, z) {
    const r = Math.hypot(x * 0.93, z * 1.04);
    return 770 + coastNoise(x, z) - r;
}

// The height of the island's large shapes at (x, z). Everything else in the
// world reads the baked grid (heightAt), not this.
export function shapeHeight(x, z) {
    if (Math.hypot(x * 0.93, z * 1.04) > 1410) return SEA_FLOOR;
    const s = shoreDist(x, z);
    let h;
    if (s < 0) {
        const o = -s;
        h = -(0.05 * Math.min(o, 60) + 0.11 * Math.max(0, Math.min(o, 160) - 60) + (SEA_FLOOR * -1 - 14) * smoothstep(120, 520, o));
    } else {
        // beaches of uneven width; here and there no beach at all, just rock rising from the water
        const bw = 12 + 46 * smoothstep(-0.2, 0.5, fbm2(x / 210 + 20, z / 210 - 7, 3));
        const rocky = smoothstep(0.18, 0.5, fbm2(x / 160 - 31, z / 160 + 12, 3));
        h = 2.6 * clamp(s / bw, 0, 1) + 15 * smoothstep(bw * 0.6, 250, s) + 7 * rocky * smoothstep(0, 16, s);
    }
    const inland = smoothstep(30, 330, s);

    // rolling hills, a few rocky spines
    if (s > 6) {
        const hills = fbm2(x / 290 + 1.7, z / 290 - 2.9, 5);
        h += inland * (30 * hills + 14 * Math.max(0, hills) * ridged2(x / 150, z / 150, 4));
        h += inland * 3.2 * fbm2(x / 46, z / 46, 3) + smoothstep(8, 60, s) * 0.7 * fbm2(x / 11, z / 11, 2);
    }

    // volcano: concave cone, flattened summit, crater bowl, radial gullies
    {
        const dx = x - VOLCANO.x, dz = z - VOLCANO.z, d = Math.hypot(dx, dz);
        if (d < 520) {
            const a = Math.atan2(dz, dx);
            const gully = 1 + 0.10 * ridged2(Math.cos(a) * 3.2 + 5, Math.sin(a) * 3.2 + d / 420, 3) * smoothstep(30, 200, d) - 0.05;
            let cone = (330 * Math.pow(clamp(1 - d / 470, 0, 1), 2.25) + 46 * Math.exp(-(d * d) / (250 * 250))) * gully;
            cone = smin(cone, VOLCANO.top + 7 * fbm2(x / 30, z / 30, 2), 26);
            // the pit: a wall in two steps with a bench between them, down to a level floor
            const wob = 3.5 * perlin2(x / 9, z / 9);
            cone -= (VOLCANO.top - VOLCANO.floor) * (0.52 * smoothstep(VOLCANO.rim, 57, d + wob) + 0.48 * smoothstep(50, 41, d + wob));
            // a notch in the south-west rim, where lava once left
            const notch = Math.exp(-Math.pow((a - 2.25) / 0.33, 2)) * smoothstep(120, 55, d) * smoothstep(20, 50, d);
            cone -= 24 * notch;
            h += cone * smoothstep(520, 300, d);
        }
    }

    // the spur the outpost stands on
    {
        const d = polyDist(x, z, RIDGE)[0];
        if (d < 260) h += 74 * Math.exp(-(d * d) / (62 * 62)) * (0.86 + 0.2 * fbm2(x / 60, z / 60, 3));
    }

    // overlook headland: a high shoulder that drops away to the north-east
    {
        const dx = x - (SITES.overlook.x - 26), dz = z - (SITES.overlook.z + 22);
        const d = Math.hypot(dx * 0.9, dz * 1.1);
        if (d < 380) {
            const lean = (dx - dz) * 0.0016; // steeper where the view is
            h += 108 * smoothstep(300 - lean * 300, 26, d) * (0.9 + 0.12 * fbm2(x / 70, z / 70, 3)) * smoothstep(-14, 46 + 14 * perlin2(x / 31, z / 31), s);
        }
    }

    // sea cliffs in the north-west, and stacks off them
    {
        const dx = x - SITES.balloons.x, dz = z - SITES.balloons.z, d = Math.hypot(dx, dz);
        if (d < 420) {
            const m = smoothstep(400, 150, d);
            const cliff = (84 + 16 * fbm2(x / 90, z / 90, 3)) * smoothstep(-6, 34 + 10 * perlin2(x / 23, z / 23), s);
            h = lerp(h, Math.max(h, cliff * (0.55 + 0.45 * smoothstep(-40, 160, s))), m * smoothstep(-12, 6, s));
        }
        for (const [sx, sz, r, top] of STACKS) {
            const ds = Math.hypot(x - sx, z - sz);
            if (ds < r * 3.4) {
                const an = Math.atan2(z - sz, x - sx);
                const wob = 1 + 0.3 * fbm2(Math.cos(an) * 1.6 + sx, Math.sin(an) * 1.6 + sz, 3) + 0.08 * perlin2(x / 3.1, z / 3.1);
                const q = ds / (r * wob) * (1 + 0.1 * perlin2(x / 2.9 + sz, z / 2.9));
                // three steps up: a broad foot, a shoulder, the head
                // sheer sides, a broken top that leans, a shoulder part-way up one side
                const lean = 1 + 0.25 * Math.cos(an - sx);
                const pillar = top * lean * (0.78 * smoothstep(1.0, 0.8, q) + 0.22 * smoothstep(0.62, 0.42, q)) + 4 * fbm2(x / 9 + sx, z / 9, 3) * smoothstep(1.0, 0.7, q);
                // a low broken shelf at its foot, awash
                const apron = 5.2 * smoothstep(1.9, 1.0, q + 0.25 * perlin2(x / 7, z / 7)) - 5.5;
                h = Math.max(h, pillar + apron);
            }
        }
    }

    // keyboard terrace: a levelled shelf
    {
        const d0 = Math.hypot(x - SITES.typing.x, z - SITES.typing.z);
        if (d0 < 170) { const d = d0 + 26 * fbm2(x / 55 + 3, z / 55, 3); h = lerp(h, 47 + 0.5 * fbm2(x / 16, z / 16, 2), smoothstep(112, 50, d)); }
    }

    // nesting ground: a sandy hollow
    {
        const d0 = Math.hypot(x - SITES.apps.x, z - SITES.apps.z);
        if (d0 < 150) { const d = d0 + 22 * fbm2(x / 48 - 6, z / 48, 3); h = lerp(h, 8.4 + 0.5 * fbm2(x / 13, z / 13, 2), smoothstep(92, 32, d)); }
    }

    // strata country: stepped mesas and a gorge cut through them
    {
        const dx = x - SITES.log.x, dz = z - SITES.log.z, d = Math.hypot(dx, dz);
        if (d < 290) {
            const m = smoothstep(270, 120, d) * smoothstep(-20, 50, s);
            const mesa = 30 + 62 * smoothstep(-0.35, 0.5, fbm2(x / 170 + 4, z / 170, 4));
            const step = 13;
            const q = mesa / step, f = q - Math.floor(q);
            const terraced = (Math.floor(q) + smoothstep(0.62, 0.92, f)) * step + 1.6 * fbm2(x / 20, z / 20, 2);
            h = lerp(h, terraced, m);
            const dc = polyDist(x, z, CANYON)[0];
            const wall = 20 + 7 * perlin2(x / 37, z / 37);
            h = lerp(h, Math.min(h, 3.2 + 0.9 * fbm2(x / 12, z / 12, 2) + 0.03 * dc), m * smoothstep(wall + 9, wall - 4, dc));
        }
    }

    // lake, and the river that feeds and drains it. Both sit at sea level, so
    // the one water surface serves the sea, the river and the lake.
    {
        const dl = Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.25) + 18 * fbm2(x / 95 + 7, z / 95, 3);
        const lake = -5.2 * smoothstep(LAKE.r, LAKE.r * 0.25, dl) - 0.9 + 3.2 * smoothstep(LAKE.r * 0.82, LAKE.r * 1.25, dl) + 0.05 * Math.max(0, dl - LAKE.r * 1.25);
        const pr = polyDist(x, z, RIVER);
        const dr = pr[0] + 9 * perlin2(x / 46, z / 46) + 3 * perlin2(x / 13, z / 13);
        const tr = Math.min(1, pr[1] / 0.42);                       // 0 at the spring, 1 by the lake
        const half = 0.6 + 9.5 * Math.pow(tr, 0.8) * (0.75 + 0.5 * (0.5 + 0.5 * perlin2(x / 60 + 5, z / 60)));
        const bank = 5 + 8 * tr;
        const bed = -(0.25 + 1.5 * tr) + (2.3 + 1.5 * tr) * smoothstep(half, half + bank, dr) + 0.024 * Math.pow(Math.max(0, dr - half - bank), 1.28);
        // each only reshapes the ground near it, so hills further off keep their height
        const wl = smoothstep(LAKE.r * 2.3, LAKE.r * 1.15, dl), wr = smoothstep(200, 70, dr);
        if (wl > 0) h = lerp(h, smin(h, lake, 7), wl);
        if (wr > 0) h = lerp(h, smin(h, bed, 7), wr);
    }

    // outpost: a levelled shoulder on the spur, room for a tower and for someone to stand back from it
    {
        const d = Math.hypot(x - SITES.mac.x, z - SITES.mac.z) + 6 * perlin2(x / 19, z / 19);
        if (d < 80) h = lerp(h, 99 + 0.4 * fbm2(x / 14, z / 14, 2), smoothstep(66, 24, d));
    }
    return h;
}

// ---- the baked island ---------------------------------------------------------
// height: Float32 N*N (row = z). info A: normal.x, normal.z, vegetation, ao.
// info B: volcanic, strata, trail, wet.
export function createIsland(N = 1024) {
    const height = new Float32Array(N * N);
    const cell = WORLD / (N - 1);
    const half = WORLD / 2;
    const island = { N, cell, height, infoA: null, infoB: null, ready: false };

    island.fillRows = (r0, r1) => {
        for (let j = r0; j < r1; j++) {
            const z = -half + j * cell;
            for (let i = 0; i < N; i++) height[j * N + i] = shapeHeight(-half + i * cell, z);
        }
    };

    // bilinear height of the baked grid
    const gridAt = (x, z) => {
        let fx = (x + half) / cell, fz = (z + half) / cell;
        if (fx < 0 || fz < 0 || fx > N - 1 || fz > N - 1) return SEA_FLOOR;
        let i = Math.floor(fx), j = Math.floor(fz);
        if (i > N - 2) i = N - 2; if (j > N - 2) j = N - 2;
        const u = fx - i, v = fz - j, o = j * N + i;
        const a = height[o], b = height[o + 1], c = height[o + N], d = height[o + N + 1];
        return a + (b - a) * u + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    };
    island.gridAt = gridAt;
    // set by terrain.js once the detail texture exists; adds the fine relief the GPU adds
    island.detailAt = () => 0;
    island.heightAt = (x, z) => gridAt(x, z) + island.detailAt(x, z);

    island.normalAt = (x, z, out, e = 2.5) => {
        const hx = island.heightAt(x + e, z) - island.heightAt(x - e, z);
        const hz = island.heightAt(x, z + e) - island.heightAt(x, z - e);
        const l = Math.hypot(hx, 2 * e, hz);
        out[0] = -hx / l; out[1] = (2 * e) / l; out[2] = -hz / l;
        return out;
    };
    island.slopeAt = (x, z) => { const n = island.normalAt(x, z, _n); return 1 - n[1]; };

    island.finish = () => {
        const A = new Uint8Array(N * N * 4), B = new Uint8Array(N * N * 4);
        // blurred height for large-scale occlusion (two box blurs)
        const blur = boxBlur(boxBlur(height, N, 7), N, 7);
        const blur2 = boxBlur(blur, N, 16);
        for (let j = 0; j < N; j++) {
            const z = -half + j * cell;
            for (let i = 0; i < N; i++) {
                const x = -half + i * cell, o = j * N + i;
                const h = height[o];
                const hl = height[j * N + Math.max(0, i - 1)], hr = height[j * N + Math.min(N - 1, i + 1)];
                const hu = height[Math.max(0, j - 1) * N + i], hd = height[Math.min(N - 1, j + 1) * N + i];
                let nx = -(hr - hl), nz = -(hd - hu), ny = 2 * cell;
                const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                const slope = 1 - ny;

                const ao = clamp(1 - Math.max(0, blur[o] - h) * 0.085 - Math.max(0, blur2[o] - h) * 0.03, 0.25, 1);

                // moisture: lowlands, river and lake margins, sheltered ground
                const dr = polyDist(x, z, RIVER)[0];
                const dl = Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.25) - LAKE.r;
                const wet = clamp(Math.max(smoothstep(110, 8, dr), smoothstep(90, 0, dl)) * smoothstep(-3, 0.4, h), 0, 1);

                const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
                const volcanic = clamp(smoothstep(250, 120, dv) * (0.75 + 0.5 * fbm2(x / 60, z / 60, 3)) + smoothstep(110, 190, h) * 0.35, 0, 1);
                const dlog = Math.hypot(x - SITES.log.x, z - SITES.log.z);
                const strata = smoothstep(275, 130, dlog);
                const dt = polyDist(x, z, TRAIL)[0];
                const trail = smoothstep(4.6, 1.2, dt + 1.6 * perlin2(x / 9, z / 9));

                // vegetation: wants soil, water and shelter; hates salt, ash and steep rock
                const patches = 0.5 + 0.5 * fbm2(x / 120 + 30, z / 120 - 8, 4);
                let veg = smoothstep(lerp(1.6, 0.25, wet), lerp(6, 1.4, wet), h) * smoothstep(0.42, 0.16, slope) * (0.3 + 0.75 * smoothstep(0.28, 0.62, patches) + 0.5 * wet);
                veg *= 1 - smoothstep(0.35, 0.8, volcanic) * 0.95;
                veg *= 1 - strata * 0.82;
                veg *= 1 - smoothstep(150, 250, h);
                // clearings where something stands
                veg *= clearing(x, z, SITES.typing, 34, 64);
                veg *= clearing(x, z, SITES.apps, 30, 58);
                veg *= clearing(x, z, SITES.contact, 26, 60);
                veg *= 1 - smoothstep(26, 6, dt) * 0.85;
                // the open plain the herds use
                veg *= 1 - 0.8 * smoothstep(170, 60, Math.hypot(x - 40, (z - 150) * 1.5));
                veg = clamp(veg, 0, 1);

                A[o * 4] = clamp(Math.round((nx * 0.5 + 0.5) * 255), 0, 255);
                A[o * 4 + 1] = clamp(Math.round((nz * 0.5 + 0.5) * 255), 0, 255);
                A[o * 4 + 2] = Math.round(veg * 255);
                A[o * 4 + 3] = Math.round(ao * 255);
                B[o * 4] = Math.round(volcanic * 255);
                B[o * 4 + 1] = Math.round(strata * 255);
                B[o * 4 + 2] = Math.round(trail * 255);
                B[o * 4 + 3] = Math.round(wet * 255);
            }
        }
        island.infoA = A; island.infoB = B;
        island.ready = true;
    };

    const sampleInfo = (arr, ch, x, z) => {
        const i = clamp(Math.round((x + half) / cell), 0, N - 1), j = clamp(Math.round((z + half) / cell), 0, N - 1);
        return arr[(j * N + i) * 4 + ch] / 255;
    };
    island.vegAt = (x, z) => sampleInfo(island.infoA, 2, x, z);
    island.aoAt = (x, z) => sampleInfo(island.infoA, 3, x, z);
    island.volcanicAt = (x, z) => sampleInfo(island.infoB, 0, x, z);
    island.strataAt = (x, z) => sampleInfo(island.infoB, 1, x, z);
    island.trailAt = (x, z) => sampleInfo(island.infoB, 2, x, z);
    island.wetAt = (x, z) => sampleInfo(island.infoB, 3, x, z);

    // walk from (x, z) along (dx, dz) until the ground crosses `level`
    island.findLevel = (x, z, dx, dz, level, max = 900, step = 2) => {
        const l = Math.hypot(dx, dz); dx /= l; dz /= l;
        let prev = gridAt(x, z) - level;
        for (let t = step; t < max; t += step) {
            const cur = gridAt(x + dx * t, z + dz * t) - level;
            if ((prev > 0) !== (cur > 0)) { const k = prev / (prev - cur); return [x + dx * (t - step + step * k), z + dz * (t - step + step * k)]; }
            prev = cur;
        }
        return [x, z];
    };
    return island;
}

const _n = [0, 0, 0];
const clearing = (x, z, site, r0, r1) => smoothstep(r0, r1, Math.hypot(x - site.x, z - site.z) + 20 * fbm2(x / 44 + site.x, z / 44, 3));

function boxBlur(src, N, r) {
    const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
    const w = 2 * r + 1;
    for (let j = 0; j < N; j++) {
        let acc = 0; const row = j * N;
        for (let i = -r; i <= r; i++) acc += src[row + clamp(i, 0, N - 1)];
        for (let i = 0; i < N; i++) {
            tmp[row + i] = acc / w;
            acc += src[row + Math.min(N - 1, i + r + 1)] - src[row + Math.max(0, i - r)];
        }
    }
    for (let i = 0; i < N; i++) {
        let acc = 0;
        for (let j = -r; j <= r; j++) acc += tmp[clamp(j, 0, N - 1) * N + i];
        for (let j = 0; j < N; j++) {
            out[j * N + i] = acc / w;
            acc += tmp[Math.min(N - 1, j + r + 1) * N + i] - tmp[Math.max(0, j - r) * N + i];
        }
    }
    return out;
}

export { hash2 };
