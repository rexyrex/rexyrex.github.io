// Sunlight, as a function of where a thing is.
//
// The sun is one directional light, but what arrives is never uniform: the hills
// throw a shadow a kilometre long, clouds drift over, a canopy lets it through
// in flecks, and under water the ripples gather it into a net of bright lines.
// All four are worked out here from a world position, so the ground, the plants,
// the animals, the haze in the air and the motes drifting in it agree about
// where the light is.
//
// The pattern tricks come from Noniv's Abyssal Garden (MIT, (c) 2026 Maksymilian
// Dendura): a tileable sheet of animated caustics and wave slopes drawn once a
// frame, and patterns slid along the sunbeam so that a beam in the air and the
// fleck it makes on the ground are the same piece of light.
import * as THREE from 'three/webgpu';
import {
    Fn, If, uniform, texture, vec2, vec3, vec4, float, mix, max, min, abs, clamp, log2, saturate, sin, cos, sqrt, pow, length, time, uv, cameraPosition,
} from 'three/tsl';
import { smoothstep } from './tsl.js';

const TAU = 6.283185307179586;

// Wave trains of the sheet: whole numbers of crests across it, so it tiles. Mostly down the wind (+x).
const TRAINS = [[1, 0], [1, 1], [2, -1], [3, 1], [2, 3], [4, -2], [5, 2], [6, -1], [4, 5], [7, 3], [9, -4], [11, 2], [8, -9], [13, 6]];

export function createSunlight({ atmosphere, terrain, island, noiseTex, quality, world = 2560 }) {
    const { uSunDir, uSunColor } = atmosphere;
    const L = quality.light;
    const sunV = uSunDir.value, sunH = Math.hypot(sunV.x, sunV.z) || 1, azX = sunV.x / sunH, azZ = sunV.z / sunH;

    // ---- the shade of the trees ---------------------------------------------------------------
    // No tree is drawn into a shadow map (a forest of cards in three cascades costs more than the rest of
    // the island). Instead every tree lays its shadow into one map of the island as it is planted: a long
    // soft shape running down-sun from its foot. The flecks below are cut out of that shade.
    // The map holds heights, not darkness: how high above the ground the shade stands at each spot.
    // (it is kept on the island's own grid and stored in the fourth channel of the terrain's shadow texture)
    const CN = island.N, cells = new Float32Array(CN * CN), cc = island.cell, half = world / 2;
    // how far a shadow runs for each metre of height. (The true figure with the sun this low is over three:
    // then every clearing lies in the dark. A photographer would wait an hour less; so does this.)
    const RUN = Math.min(sunV.y > 0.01 ? sunH / sunV.y : 3, 1.9);
    const SHAPES = {
        conifer: (t) => (t < 0.18 ? 0.16 : Math.max(0.1, Math.pow(1 - (t - 0.18) / 0.82, 0.75))),
        broadleaf: (t) => (t < 0.3 ? 0.1 : Math.sqrt(Math.sin(Math.PI * Math.min(1, (t - 0.3) / 0.7 + 0.04)))),
        palm: (t) => (t < 0.78 ? 0.07 : 1),
        treeFern: (t) => (t < 0.7 ? 0.1 : 1),
    };
    const addTree = (x, z, kind, h, r) => {
        const len = h * RUN, n = Math.max(2, Math.ceil(len / (cc * 0.8))), shape = SHAPES[kind] || SHAPES.broadleaf;
        for (let k = 0; k <= n; k++) {
            const t = k / n, w = Math.max(cc * 0.6, r * shape(t));
            const cx = (x - azX * len * t + half) / cc, cz = (z - azZ * len * t + half) / cc, wr = w / cc;
            const i0 = Math.max(0, Math.floor(cx - wr)), i1 = Math.min(CN - 1, Math.ceil(cx + wr)), j0 = Math.max(0, Math.floor(cz - wr)), j1 = Math.min(CN - 1, Math.ceil(cz + wr));
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                const d = Math.hypot(i - cx, j - cz) / wr;
                // what is kept is how high the shade stands here: the beam that lands this far from the foot
                // crossed the tree this far up it. Whatever is below that is in shade; a crown above it is in the sun.
                if (d < 1) { const o = j * CN + i, v = t * h * Math.sqrt(1 - d * d); if (v > cells[o]) cells[o] = v; }
            }
        }
    };
    // `pools`: [x, z, inner radius, outer radius] of places the light is let into, the way a film crew would
    // cut a branch: what each stop is about stands in the sun, with the shade beginning around it
    const bakeCanopy = (pools = []) => {
        const out = terrain.shadowData, toHalf = THREE.DataUtils.toHalfFloat, shade = new Float32Array(CN * CN);
        // one pass of softening
        for (let j = 1; j < CN - 1; j++) for (let i = 1; i < CN - 1; i++) {
            const o = j * CN + i;
            shade[o] = (cells[o] * 4 + cells[o - 1] + cells[o + 1] + cells[o - CN] + cells[o + CN]) / 8;
        }
        for (const [px, pz, r0, r1] of pools) {
            const i0 = Math.max(1, Math.floor((px - r1 + half) / cc)), i1 = Math.min(CN - 2, Math.ceil((px + r1 + half) / cc)), j0 = Math.max(1, Math.floor((pz - r1 + half) / cc)), j1 = Math.min(CN - 2, Math.ceil((pz + r1 + half) / cc));
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                const d = Math.hypot(i * cc - half - px, j * cc - half - pz);
                if (d < r1) { const k = Math.min(1, Math.max(0, (d - r0) / (r1 - r0))); shade[j * CN + i] *= 0.12 + 0.88 * k * k * (3 - 2 * k); }
            }
        }
        for (let o = 0; o < CN * CN; o++) out[o * 4 + 3] = toHalf(shade[o]);
        terrain.shadowTex.needsUpdate = true;
    };

    // ---- the wave sheet: r, g = two caustic nets, b, a = slope of the water surface --------------
    const S = L.waves;
    const rt = new THREE.RenderTarget(S, S, {
        type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: L.aniso,
    });
    // light gathered by a rippling surface: the classic folded-sine net, sharpened
    const net = Fn(([q, t]) => {
        const p = q.mul(TAU).toVar();
        const i = vec2(p).toVar();
        const c = float(0).toVar();
        for (let n = 1; n <= 5; n++) {
            const tt = t.mul(1 - 3.5 / n);
            i.assign(p.add(vec2(cos(tt.sub(i.x)).add(sin(tt.add(i.y))), sin(tt.sub(i.y)).add(cos(tt.add(i.x))))));
            const s = sin(i.x.add(tt)), k = cos(i.y.add(tt));
            c.addAssign(abs(s.mul(k)).div(sqrt(s.mul(s).add(k.mul(k))).mul(1.25).add(1e-4)));
        }
        return pow(abs(float(1.17).sub(pow(c.div(5), 1.4))), 8.0);
    });
    const sheet = new THREE.NodeMaterial();
    sheet.fragmentNode = Fn(() => {
        const q = uv();
        let sx = float(0), sy = float(0), norm = 0;
        TRAINS.forEach(([kx, ky], j) => {
            const k = Math.hypot(kx, ky), a = Math.pow(k, -1.3), w = 1.25 * Math.sqrt(k) * (1 + 0.13 * Math.sin(j * 7.1));
            norm += (a * k) * (a * k) * 0.5;
            const s = sin(q.x.mul(TAU * kx).add(q.y.mul(TAU * ky)).sub(time.mul(w)).add(j * 2.399)).mul(-a);
            sx = sx.add(s.mul(kx)); sy = sy.add(s.mul(ky));
        });
        const k = 0.5 / Math.sqrt(norm);         // slopes come out with an r.m.s. of a half
        return vec4(net(q, time.mul(0.45).add(23.0)), net(q.yx.add(vec2(0.37, 0.11)), time.mul(0.36).add(71.0)), sx.mul(k), sy.mul(k));
    })();
    const quad = new THREE.QuadMesh(sheet);
    quad.name = 'waves';
    const waveTex = rt.texture;
    // the visitor's eye, for passes that have no camera of their own (a full-screen pass looks through a flat one)
    const uEye = uniform(new THREE.Vector3());
    let tick = 0;
    const update = (renderer, camera) => {
        uEye.value.copy(camera.position);
        // (on the small tiers the sheet is redrawn every other frame: water at thirty steps a second still flows)
        if (tick++ % (L.waveEvery || 1)) return;
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(rt);
        quad.render(renderer);
        renderer.setRenderTarget(prev);
    };

    // the sunbeam after it has bent into the water (n = 1.33)
    const sunRefr = (() => { const h = Math.hypot(uSunDir.value.x, uSunDir.value.z), k = 1 / 1.33, y = Math.sqrt(1 - h * h * k * k); return vec3(uSunDir.value.x * k, y, uSunDir.value.z * k); })();

    // `air`: for a point in mid-air seen from a full-screen pass, where there are no screen derivatives to
    // pick a mip from: the patterns are read a little blurred, which is also what a beam in haze looks like
    const build = (air) => {
        const S2 = (tex, at, lod) => (air ? texture(tex, at).level(lod) : texture(tex, at));

        // 1 above the hills' shadow, 0 well inside it, and the height above the ground
        const terrainShade = (P) => {
            const sg = S2(terrain.shadowTex, terrain.infoUV(P.xz), 0);
            // (measured from the ground as it really is, if that is higher than where this was drawn: far rings draw
            // a smoothed island, and a crest drawn a few metres low must not read as a few metres into shadow)
            const vis = float(1).sub(saturate((air ? sg.b : sg.r).sub(max(P.y, max(sg.g, 0.0))).div(air ? 16.0 : 9.0)));
            // (the sea's surface catches the shadow, not its bed: deep water is never quite dark)
            return { vis: max(vis, saturate(P.y.negate().div(6.0)).mul(0.75)), above: P.y.sub(sg.g) };
        };

        // Flecks under the trees. The pattern is constant along a sunbeam, so the bright patches on the
        // ground, on a trunk, on an animal's back and in the haze between them line up as shafts.
        // (Patterns are only looked up where there is shade to cut them from, and at a size picked from the
        // distance: a lookup inside a branch has no screen derivatives to pick one from.)
        const dapple = (P, above, dist) => {
            const k = float(1).toVar();
            if (!L.dapple) return k;
            // follow the sunbeam through this point down to the ground: is that spot in a tree's shade?
            const foot = P.xz.sub(vec2(azX, azZ).mul(max(above, 0.0).mul(RUN)));
            // (in shade if the shade there stands higher than this point does: so the forest floor, a trunk and an
            // animal under the trees are, and the crowns that cast it are not)
            const forest = saturate(texture(terrain.shadowTex, terrain.infoUV(foot)).level(0).a.sub(max(above, 0.0)).div(5.0));
            // (beyond a few hundred metres the flecks have averaged out: the shade is simply partial)
            k.assign(mix(float(1), 0.4, forest));
            If(forest.greaterThan(0.004).and(dist.lessThan(260.0)), () => {
                const q = P.xz.sub(uSunDir.xz.mul(P.y.div(uSunDir.y)));
                const drift = vec2(time.mul(0.011), time.mul(0.007));
                const a = texture(noiseTex, q.mul(1 / 23).add(drift)).level(clamp(log2(dist.mul(0.012)), air ? 1.5 : 0.0, 6.0)).r;
                const b = texture(noiseTex, q.mul(1 / 6.1).sub(drift.mul(1.7))).level(clamp(log2(dist.mul(0.045)), air ? 1.0 : 0.0, 6.0)).g;
                // leaves stir: the gaps open and close a little
                const breathe = sin(time.mul(0.7).add(a.mul(9.0))).mul(0.018);
                const gaps = smoothstep(0.5, 0.62, a.mul(0.6).add(b.mul(0.4)).add(breathe));
                // far off the flecks are smaller than a pixel: what is left is their average
                const lit = mix(gaps, 0.34, smoothstep(70.0, 260.0, dist));
                k.assign(mix(float(1), lit.add(0.06), forest));
            });
            return k;
        };

        // The bright net on anything under water, slid along the bent sunbeam and split a little by colour.
        const caustics = (P, dist) => {
            const k = vec3(1).toVar();
            if (!L.caustics) return k;
            If(P.y.lessThan(0.02).and(P.y.greaterThan(-22.0)).and(dist.lessThan(170.0)), () => {
                const depth = P.y.negate();
                const q = P.xz.sub(sunRefr.xz.mul(P.y.div(sunRefr.y)));
                const o = vec2(0.0045, 0.0028), at = q.mul(1 / 3.4);
                const lod = clamp(log2(dist.mul(0.11)), 0.0, 6.0);
                const a = L.caustics > 1 ? vec3(texture(waveTex, at.add(o)).level(lod).r, texture(waveTex, at).level(lod).r, texture(waveTex, at.sub(o)).level(lod).r) : vec3(texture(waveTex, at).level(lod).r);
                const b = texture(waveTex, q.yx.mul(1 / 7.3).add(0.37)).level(lod.add(0.5)).g;
                const c = min(pow(a, vec3(2.1)).mul(5.0).mul(b.mul(1.3).add(0.45)), vec3(3.0));
                // ripples focus best a little way down; deeper the net spreads out, and far away it would only shimmer
                // (and in the last hand's depth at the very edge there is no room for it to form)
                const sharp = smoothstep(0.08, 1.1, depth).mul(smoothstep(22.0, 3.0, depth)).mul(smoothstep(170.0, 35.0, dist));
                // (and none of it above the surface)
                k.assign(mix(vec3(1.0), mix(vec3(1.0), c.mul(1.1).add(0.62), sharp), smoothstep(-0.02, 0.06, depth)));
            });
            return k;
        };

        // everything that stands between the sun and P
        return Fn(([P]) => {
            const dist = length(P.sub(air ? uEye : cameraPosition));
            const t = terrainShade(P);
            // (a hill's shadow never takes all of it: light scattered in the haze still gets in)
            const shade = air ? t.vis : t.vis.mul(0.86).add(0.14);
            const k = shade.mul(air ? atmosphere.cloudShadowAir(P) : atmosphere.cloudShadow(P)).mul(dapple(P, t.above, dist));
            // (in the air: how much sun, and how high over the ground this is)
            return air ? vec3(k, t.above, 0.0) : caustics(P, dist).mul(k);
        });
    };

    const at = build(false), inAir = build(true);
    return {
        waveTex, update, at, inAir, sunRefr, addTree, bakeCanopy,
        // what the sun light itself is: its colour, less everything in the way
        colorNode: (P) => uSunColor.mul(at(P)),
    };
}
