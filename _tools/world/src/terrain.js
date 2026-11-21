// The ground. A geometry clipmap: nested square rings of triangles centred on
// the camera, each ring twice as coarse as the one inside it, so there is
// half-metre detail underfoot and the horizon still costs almost nothing. The
// rings carry no heights of their own; the vertex shader reads the island's
// height grid, and the outer rows of every ring slide onto the next ring's
// grid so no seam opens between them.
import * as THREE from 'three/webgpu';
import {
    Fn, uniform, texture, textureLoad, vec2, vec3, vec4, float, ivec2, floor, fract, mix, max, min, abs, clamp, normalize, dot, pow, sqrt,
    positionLocal, positionWorld, modelWorldMatrix, modelScale, cameraPosition, cameraViewMatrix, saturate, length, sin, varying, uniformArray, int, log2, atan, step,
} from 'three/tsl';
import { smoothstep } from './tsl.js';
import { WORLD, VOLCANO } from './island.js';
import { dataTexture, sampleWrap } from './textures.js';
import { smoothstep as sstep } from './noise.js';

const C = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };

// distances at which the fine relief is fully present / gone
const DETAIL_NEAR = 110, DETAIL_FAR = 320;
const D1 = 1 / 23.0, D2 = 1 / 6.1, A1 = 0.55, A2 = 0.16;

export function createTerrain({ island, rockTex, groundTex, noiseTex, atmosphere, quality, sunDir, photo = null, footprints = null }) {
    const N = island.N, half = WORLD / 2, cell = island.cell;

    // ---- textures from the baked island
    // The height grid and its coarser copies, side by side in one texture. Far rings
    // read a copy as coarse as they are, so a ridge does not flicker as rings shift.
    const pyr = buildPyramid(island.height, N, cell);
    const hTex = dataTexture(pyr.data, pyr.W, pyr.H, { format: THREE.RedFormat, type: THREE.FloatType, linear: false });
    const mipInfo = uniformArray(pyr.levels.map((l) => new THREE.Vector4(l.ox, l.oy, l.size, l.cell)));
    const MIPS = pyr.levels.length;
    const infoA = dataTexture(island.infoA, N, N);
    const infoB = dataTexture(island.infoB, N, N);

    // Which ground the low sun reaches, at island scale: one sweep away from the sun
    // carrying the height of the shadow edge. Covers what the shadow cascades cannot reach.
    const sweep = bakeSunVisibility(island, sunDir), sunVis = sweep.vis;
    const infoC = dataTexture(sunVis, N, N, { format: THREE.RedFormat });
    // The same sweep kept as heights: how high the shadow of the hills stands over every cell, and the
    // ground under it. With these, anything in the air can ask whether the sun reaches it: a treetop
    // above the shadow line, a pterosaur, the haze a sunbeam crosses.
    let shadowData = null;
    const shadowTex = (() => {
        // a: the shade of the trees, written by light.js once the forest is planted (one texture, not two: the
        // ground's shader already reads as many as a phone allows)
        // r: the shadow line, g: the ground, b: the shadow line smoothed over some forty metres. A beam in the
        // haze is cut by the smoothed one: a ridge's every tooth, drawn as a streak through the air, reads as
        // a fault in the picture and not as light.
        const toHalf = THREE.DataUtils.toHalfFloat, d = new Uint16Array(N * N * 4), R = Math.max(2, Math.round(18 / cell));
        const tmp = new Float32Array(N * N), soft = new Float32Array(N * N);
        for (let j = 0; j < N; j++) { let a = 0; for (let i = -R; i <= R; i++) a += sweep.edge[j * N + Math.min(N - 1, Math.max(0, i))]; for (let i = 0; i < N; i++) { tmp[j * N + i] = a / (2 * R + 1); a += sweep.edge[j * N + Math.min(N - 1, i + R + 1)] - sweep.edge[j * N + Math.max(0, i - R)]; } }
        for (let i = 0; i < N; i++) { let a = 0; for (let j = -R; j <= R; j++) a += tmp[Math.min(N - 1, Math.max(0, j)) * N + i]; for (let j = 0; j < N; j++) { soft[j * N + i] = a / (2 * R + 1); a += tmp[Math.min(N - 1, j + R + 1) * N + i] - tmp[Math.max(0, j - R) * N + i]; } }
        for (let i = 0; i < N * N; i++) { d[i * 4] = toHalf(sweep.edge[i]); d[i * 4 + 1] = toHalf(island.height[i]); d[i * 4 + 2] = toHalf(soft[i]); d[i * 4 + 3] = 0; }
        shadowData = d;
        return dataTexture(d, N, N, { format: THREE.RGBAFormat, type: THREE.HalfFloatType });
    })();

    // CPU twin of the fine relief the vertex shader adds
    const rd = rockTex.userData.data, rs = rockTex.userData.size, gd = groundTex.userData.data, gs = groundTex.userData.size;
    island.detailAt = (x, z) => {
        const h = island.gridAt(x, z);
        const land = sstep(-1.5, 0.8, h);
        if (land <= 0) return 0;
        return ((sampleWrap(rd, rs, 3, x * D1, z * D1) - 0.5) * A1 + (sampleWrap(gd, gs, 2, x * D2, z * D2) - 0.5) * A2) * land;
    };

    // ---- shader pieces
    const infoUV = (xz) => xz.add(half).div(cell).add(0.5).div(N);

    const mipHeight = Fn(([xz, m]) => {
        const info = mipInfo.element(m);
        const f = clamp(xz.add(half).div(info.w), 0.0, info.z.sub(1.001));
        const i = floor(f), u = f.sub(i);
        const ii = ivec2(i).add(ivec2(info.xy));
        const a = textureLoad(hTex, ii).r, b = textureLoad(hTex, ii.add(ivec2(1, 0))).r;
        const c = textureLoad(hTex, ii.add(ivec2(0, 1))).r, d = textureLoad(hTex, ii.add(ivec2(1, 1))).r;
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    });
    const gridHeight = Fn(([xz]) => mipHeight(xz, int(0)));

    // the height of the finished ground, fine relief included, for things that plant themselves in a vertex
    // shader (the ground cover): the same sum the rings below make
    // Not the height of the land but of the innermost ring's triangles: the fine relief is only known at the
    // ring's corners (it has grit and pebbles in it far smaller than a cell), and between corners the ground
    // that is actually drawn is flat. A plant rooted on the formula instead would stand a hand above its
    // own ground, or below it. The ring's diagonal alternates from cell to cell, so this does too.
    const groundHeight = Fn(([xz]) => {
        const S = quality.clipCell, g = xz.div(S), c = floor(g), f = g.sub(c);
        // each corner's whole height, as the ring's vertex shader makes it
        const corner = (ox, oz) => { const p = c.add(vec2(ox, oz)).mul(S), h = mipHeight(p, int(0)); return h.add(texture(rockTex, p.mul(D1)).level(0).a.sub(0.5).mul(A1).add(texture(groundTex, p.mul(D2)).level(0).b.sub(0.5).mul(A2)).mul(smoothstep(-1.5, 0.8, h))); };
        const r00 = corner(0, 0), r10 = corner(1, 0), r01 = corner(0, 1), r11 = corner(1, 1);
        const even = mix(r00.add(r10.sub(r00).mul(f.x)).add(r11.sub(r10).mul(f.y)), r00.add(r01.sub(r00).mul(f.y)).add(r11.sub(r01).mul(f.x)), step(f.x, f.y));
        const odd = mix(r00.add(r10.sub(r00).mul(f.x)).add(r01.sub(r00).mul(f.y)), r11.add(r01.sub(r11).mul(float(1).sub(f.x))).add(r10.sub(r11).mul(float(1).sub(f.y))), step(1.0, f.x.add(f.y)));
        return mix(even, odd, fract(c.x.add(c.y).mul(0.5)).mul(2.0));
    });

    const HALF_CELLS = quality.clipN / 2;
    const vHeight = varying(float(0), 'vTerrainH');

    const positionNode = Fn(() => {
        const g = positionLocal.xz;
        const d = max(abs(g.x), abs(g.y)).div(HALF_CELLS);
        const k = smoothstep(0.72, 0.92, d);
        const odd = fract(g.mul(0.5)).mul(2.0);
        const gm = g.sub(odd.mul(k));
        const w = modelWorldMatrix.mul(vec4(gm.x, 0, gm.y, 1)).xz;
        // the copy that matches this ring, blended into the next ring's where the two meet
        const m = clamp(floor(log2(max(modelScale.x.div(cell), 1.0)).add(0.001)), 0.0, MIPS - 1).toVar();
        // the next ring out is twice as coarse; it may still read the same copy
        const m1 = clamp(floor(log2(max(modelScale.x.mul(2.0).div(cell), 1.0)).add(0.001)), 0.0, MIPS - 1);
        const h = mix(mipHeight(w, int(m)), mipHeight(w, int(m1)), k).toVar();
        const dist = length(vec3(w.x, h, w.y).sub(cameraPosition));
        const land = smoothstep(-1.5, 0.8, h);
        const near = smoothstep(DETAIL_FAR, DETAIL_NEAR, dist);
        const rel = texture(rockTex, w.mul(D1)).level(0).a.sub(0.5).mul(A1).add(texture(groundTex, w.mul(D2)).level(0).b.sub(0.5).mul(A2));
        h.addAssign(rel.mul(land).mul(near));
        vHeight.assign(h);
        return vec3(gm.x, h, gm.y);
    })();

    // ---- surface
    const P = positionWorld;
    const xz = P.xz;
    const A = texture(infoA, infoUV(xz));
    const B = texture(infoB, infoUV(xz));
    const n0 = Fn(() => {
        const nx = A.r.mul(2).sub(1), nz = A.g.mul(2).sub(1);
        return normalize(vec3(nx, sqrt(max(float(0.02), float(1).sub(nx.mul(nx)).sub(nz.mul(nz)))), nz));
    })().toVar('n0');
    const veg = A.b, aoMacro = A.a;
    const volcanic = B.r, strata = B.g, trail = B.b, wet = B.a;
    const h = P.y;
    const dist = length(P.sub(cameraPosition));

    // (a close-up nicety: gone by the time a place is far enough off for another stop's square to take over)
    const contact = footprints ? footprints.at(xz).g.mul(smoothstep(120.0, 60.0, dist)) : null;
    const nBroad = texture(noiseTex, xz.mul(1 / 190)).r;
    const nMid = texture(noiseTex, xz.mul(1 / 31)).g;

    // triplanar weights from the large-scale normal
    const tw = Fn(() => { const w = pow(abs(n0), vec3(5.0)); return w.div(w.x.add(w.y).add(w.z)); })().toVar('tw');
    const RS = 1 / 8.5;
    const rkY = texture(rockTex, xz.mul(RS));
    const rkX = texture(rockTex, P.zy.mul(RS));
    const rkZ = texture(rockTex, P.xy.mul(RS));
    const rockH = rkY.b.mul(tw.y).add(rkX.b.mul(tw.x)).add(rkZ.b.mul(tw.z));
    const rkFar = texture(rockTex, xz.mul(1 / 47));
    // the same stone read small, for what the lens is close to: the grain a cliff face has at arm's length
    const FINE = quality.post >= 2, FS = 1 / 1.9;
    const fine = FINE ? texture(rockTex, xz.mul(FS)).mul(tw.y).add(texture(rockTex, P.zy.mul(FS)).mul(tw.x)).add(texture(rockTex, P.xy.mul(FS)).mul(tw.z)) : null;
    const fineK = FINE ? smoothstep(110.0, 12.0, dist) : null;
    const gr = texture(groundTex, xz.mul(1 / 2.6));
    const grFar = texture(groundTex, xz.mul(1 / 13));

    const slope = float(1).sub(n0.y);
    const rockW = smoothstep(0.17, 0.36, slope.add(rockH.sub(0.5).mul(0.16)).add(strata.mul(0.05))).toVar('rockW');
    const coast = smoothstep(540.0, 700.0, length(xz.mul(vec2(0.93, 1.04))));
    const beachW = float(1).sub(smoothstep(2.4, 5.2, h.add(nBroad.sub(0.5).mul(2.2)))).mul(float(1).sub(strata.mul(0.6))).mul(coast);
    const forest = smoothstep(0.34, 0.7, veg.add(nMid.sub(0.5).mul(0.18)));
    const cover = smoothstep(0.03, 0.22, veg.add(nMid.sub(0.5).mul(0.2))).mul(float(1).sub(strata.mul(0.75).mul(smoothstep(0.35, 0.6, nBroad).oneMinus().mul(0.6).add(0.4))));

    // strata: beds of uneven thickness that follow height and bend a little; each bed's lower
    // edge is shaded like the ledge it weathers into
    const strataColor = Fn(() => {
        const y = h.add(nBroad.mul(6.0)).add(rockH.mul(1.2));
        const u = y.div(11.0).add(sin(y.div(31.0)).mul(0.55));
        const band = fract(u);
        const beds = mix(mix(C('#a08a70'), C('#8a7260'), smoothstep(0.14, 0.32, band)), mix(C('#ae9d86'), C('#7e6b5c'), smoothstep(0.62, 0.84, band)), smoothstep(0.38, 0.56, band));
        const lam = sin(y.mul(3.7)).mul(0.5).add(0.5).mul(sin(y.mul(9.1).add(1.7)).mul(0.5).add(0.5));
        const ledge = smoothstep(0.0, 0.05, band).mul(smoothstep(0.26, 0.2, band).mul(0.25).add(0.75));
        return beds.mul(mix(0.82, 1.06, lam)).mul(mix(0.55, 1.0, ledge)).mul(mix(0.8, 1.1, nMid));
    });

    // the volcano's skin: old flows run down it as dark channels between paler ash, and the
    // rock near the rim has baked red
    const vAng = atan(P.z.sub(VOLCANO.z), P.x.sub(VOLCANO.x)).div(6.2832);
    const vDist = length(xz.sub(vec2(VOLCANO.x, VOLCANO.z)));
    const flows = texture(noiseTex, vec2(vAng.mul(7.0), vDist.mul(0.0011))).b;            // long down the slope, narrow across it
    const flows2 = texture(noiseTex, vec2(vAng.mul(19.0).add(0.3), vDist.mul(0.0032))).r;
    const volcanoRock = Fn(() => {
        const ashC = mix(C('#5d5650'), C('#7c7268'), nMid);
        const flowC = mix(C('#17161a'), C('#2c2a2c'), rockH);
        const outside = smoothstep(62.0, 100.0, vDist).mul(smoothstep(0.5, 0.25, slope));
        const k = mix(smoothstep(0.35, 0.7, rockH), smoothstep(0.3, 0.62, flows.mul(0.7).add(flows2.mul(0.3))), outside);
        const c = mix(ashC, flowC, k).toVar();
        c.assign(mix(c, C('#5a3428'), smoothstep(150.0, 60.0, vDist).mul(smoothstep(0.35, 0.7, flows2)).mul(0.7)));
        return c.mul(mix(0.78, 1.1, grFar.b));
    });

    const albedo = Fn(() => {
        const soil = mix(C('#43352a'), C('#62503a'), nMid);
        const dust = mix(C('#9c8669'), C('#b7a283'), nMid);
        const bare = mix(mix(soil, volcanoRock(), smoothstep(0.25, 0.7, volcanic)), dust, strata).toVar();
        const prairie = mix(C('#4c5527'), C('#7b733c'), nBroad.mul(0.55).add(nMid.mul(0.45)));
        // under the trees: leaf mould, darker where it stays damp, mossy in patches
        const under = mix(mix(C('#2b2a1c'), C('#4a3d27'), nMid), C('#2f4220'), smoothstep(0.45, 0.75, nBroad).mul(0.6));
        const col = mix(bare, prairie, cover.mul(float(1).sub(volcanic.mul(0.7)))).toVar();
        col.assign(mix(col, under, forest.mul(0.92)));
        // patches of drier and damper ground, wide enough to see from the air
        col.mulAssign(mix(0.8, 1.12, nBroad.mul(0.6).add(grFar.b.mul(0.4))));
        col.mulAssign(mix(0.92, 1.05, gr.b));
        // grain: soil is crumbs, not clay
        col.mulAssign(mix(1.0, mix(0.8, 1.12, texture(groundTex, xz.mul(1 / 0.47)).b), smoothstep(40.0, 6.0, dist)));
        // mud by fresh water, sand by the sea
        col.assign(mix(col, C('#4a4030'), wet.mul(smoothstep(4.0, 0.6, h)).mul(0.75).mul(float(1).sub(forest.mul(0.6)))));
        const sand = mix(C('#a8956f'), C('#c6b48e'), nMid.mul(0.5).add(grFar.b.mul(0.5))).mul(mix(0.9, 1.06, nBroad));
        col.assign(mix(col, sand, beachW));
        // the line the last tide left: darker, with weed
        col.assign(mix(col, C('#5d5440'), beachW.mul(smoothstep(0.12, 0.0, abs(h.sub(1.15).add(nMid.sub(0.5).mul(0.5))))).mul(0.55)));
        col.assign(mix(col, C('#8f7f61'), trail.mul(0.85)));
        // Photographs give the painted colour its texture: each is divided by its own average, so it
        // changes what the ground is made of and not how light or dark the island is painted.
        const PH = (layer, at) => texture(photo.tex, at).depth(int(layer)).rgb.div(vec3(...photo.mean[layer]));
        if (photo) {
            const near = smoothstep(900.0, 120.0, dist);
            const d = PH(0, xz.mul(1 / 3.3)).toVar();
            d.assign(mix(d, PH(1, xz.mul(1 / 2.9)), cover.mul(float(1).sub(volcanic.mul(0.7))).mul(float(1).sub(trail))));
            d.assign(mix(d, PH(2, xz.mul(1 / 3.7)), forest.mul(0.92)));
            d.assign(mix(d, PH(3, xz.mul(1 / 2.4)), beachW));
            col.mulAssign(mix(vec3(1.0), d, near.mul(0.9)));
        }
        // rock
        const stone = mix(C('#3d3935'), C('#77706a'), rockH.mul(0.75).add(rkFar.b.mul(0.25)));
        const rock = mix(mix(stone, volcanoRock(), smoothstep(0.2, 0.7, volcanic)), strataColor(), strata).toVar();
        rock.mulAssign(mix(0.74, 1.12, nBroad));
        if (photo) {
            // cliffs get rock, the volcano gets lava; laid on from three sides so it never smears down a face
            const layer = int(step(0.45, volcanic).add(4.0)), k = 1 / 5.3, m = vec3(1.0).div(mix(vec3(...photo.mean[4]), vec3(...photo.mean[5]), step(0.45, volcanic)));
            const R3 = (at) => texture(photo.tex, at).depth(layer).rgb;
            const d = R3(xz.mul(k)).mul(tw.y).add(R3(P.zy.mul(k)).mul(tw.x)).add(R3(P.xy.mul(k)).mul(tw.z)).mul(m);
            rock.mulAssign(mix(vec3(1.0), d, smoothstep(900.0, 120.0, dist).mul(0.85)));
        }
        // a cliff is built of beds: a shaded ledge under each, every bed its own tone; cut by joints
        // that run down the face, and stained where water follows them
        const face = float(1).sub(tw.y);
        const along = P.x.mul(tw.z).add(P.z.mul(tw.x));
        // (uneven in thickness, present only in patches, and never on the volcano: laid like courses of
        // brick they read as masonry)
        const bedU = h.div(5.2).add(nBroad.mul(5.5)).add(nMid.mul(1.6)).add(rockH.mul(0.5));
        const bedHere = smoothstep(0.38, 0.62, texture(noiseTex, xz.mul(1 / 83)).g).mul(float(1).sub(smoothstep(0.1, 0.4, volcanic)));
        const bedF = fract(bedU), bedTone = fract(sin(floor(bedU).mul(12.9898)).mul(43758.5453));
        const ledge = mix(0.7, 1.0, smoothstep(0.0, 0.16, bedF));
        const joints = texture(noiseTex, vec2(along.mul(0.013), h.mul(0.004))).b;
        const stain = texture(noiseTex, vec2(along.mul(0.023), h.mul(0.0018))).r;
        const structure = mix(float(1.0), ledge.mul(mix(0.88, 1.1, bedTone)), bedHere).mul(mix(1.0, 0.7, smoothstep(0.8, 0.95, joints))).mul(mix(0.72, 1.1, stain));
        rock.mulAssign(mix(float(1.0), structure, face.mul(float(1).sub(strata.mul(0.5)))));
        rock.assign(mix(rock, rock.mul(C('#7f8a5a')).mul(2.2), smoothstep(0.55, 0.9, nMid).mul(0.25).mul(float(1).sub(strata)).mul(float(1).sub(volcanic))));
        // sea cliffs and stacks are darker and wet where the swell reaches
        rock.mulAssign(mix(1.0, 0.5, smoothstep(3.5, 0.2, h).mul(coast)));
        col.assign(mix(col, rock, rockW));
        // seabed
        const bed = mix(C('#b3a27c'), C('#5f6a5e'), smoothstep(-1.0, -14.0, h));
        col.assign(mix(col, mix(bed, rock.mul(0.8), rockW), smoothstep(0.2, -0.6, h)));
        // the strip the water keeps wet
        const damp = smoothstep(0.75, 0.05, h).mul(smoothstep(-0.6, 0.0, h));
        col.mulAssign(mix(1.0, 0.58, damp));
        // crevices
        col.mulAssign(mix(0.86, 1.0, smoothstep(0.1, 0.6, mix(gr.b, rockH, rockW))));
        // and the shade that gathers round the foot of whatever has been stood on the ground
        if (footprints) col.mulAssign(float(1).sub(contact.mul(0.42)));
        if (FINE) col.mulAssign(mix(1.0, mix(0.66, 1.16, smoothstep(0.2, 0.75, fine.b)), fineK.mul(rockW)));
        return col;
    })();

    const roughness = Fn(() => {
        const damp = smoothstep(0.75, 0.0, h);
        return mix(mix(float(0.93), float(0.8), rockW), 0.32, damp.mul(0.8));
    })();

    // detail normals fade with distance (they would only shimmer out there)
    const normalWorld = Fn(() => {
        const fade = smoothstep(420.0, 60.0, dist);
        const g1 = gr.rg.mul(2).sub(1), g2 = grFar.rg.mul(2).sub(1), r0 = rkFar.rg.mul(2).sub(1);
        const flat = g1.mul(0.16).mul(fade).add(g2.mul(0.16)).add(r0.mul(0.22)).mul(float(1).sub(rockW.mul(0.6)));
        const ry = rkY.rg.mul(2).sub(1), rx = rkX.rg.mul(2).sub(1), rz = rkZ.rg.mul(2).sub(1);
        const s = rockW.mul(1.5).mul(mix(0.45, 1.0, fade));
        const n = vec3(n0).toVar();
        n.x.addAssign(flat.x.mul(tw.y)); n.z.addAssign(flat.y.mul(tw.y));
        n.x.addAssign(ry.x.mul(tw.y).mul(s)); n.z.addAssign(ry.y.mul(tw.y).mul(s));
        n.z.addAssign(rx.x.mul(tw.x).mul(s)); n.y.addAssign(rx.y.mul(tw.x).mul(s));
        n.x.addAssign(rz.x.mul(tw.z).mul(s)); n.y.addAssign(rz.y.mul(tw.z).mul(s));
        if (FINE) {
            // (each face tilts by the fine stone's own slope: across it, and up or along it)
            const f = fine.rg.mul(2).sub(1).mul(fineK).mul(rockW).mul(1.1);
            n.x.addAssign(f.x.mul(tw.y.add(tw.z))); n.z.addAssign(f.y.mul(tw.y).add(f.x.mul(tw.x))); n.y.addAssign(f.y.mul(tw.x.add(tw.z)));
        }
        // beds stand out as ledges: lit on top, shaded underneath
        const bu = h.div(5.2).add(nBroad.mul(5.5)).add(nMid.mul(1.6)).add(rockH.mul(0.5)), bf = fract(bu);
        const lip = smoothstep(0.16, 0.0, bf).sub(smoothstep(0.84, 1.0, bf));
        const bedsHere = smoothstep(0.38, 0.62, texture(noiseTex, xz.mul(1 / 83)).g).mul(float(1).sub(smoothstep(0.1, 0.4, volcanic)));
        n.y.addAssign(lip.mul(0.8).mul(bedsHere).mul(rockW).mul(float(1).sub(tw.y)).mul(mix(0.5, 1.0, fade)));
        // the mesas' coloured beds weather back at different rates: each is a step, lit on its tread and
        // shaded under its lip (the same bands the colour is painted in)
        const sy = h.add(nBroad.mul(6.0)).add(rockH.mul(1.2)), sb = fract(sy.div(11.0).add(sin(sy.div(31.0)).mul(0.55)));
        n.y.addAssign(smoothstep(0.12, 0.0, sb).sub(smoothstep(0.88, 1.0, sb)).mul(0.85).mul(strata).mul(rockW).mul(float(1).sub(tw.y)));
        return normalize(n);
    })();

    const mat = new THREE.MeshStandardNodeMaterial();
    mat.positionNode = positionNode;
    mat.colorNode = albedo;
    mat.roughnessNode = roughness;
    mat.metalnessNode = float(0);
    mat.normalNode = normalWorld.transformDirection(cameraViewMatrix);
    mat.aoNode = footprints ? aoMacro.mul(float(1).sub(contact.mul(0.5))) : aoMacro;
    mat.envMapIntensity = 1;

    // ---- rings
    const CN = quality.clipN;
    const full = ringGeometry(CN, false), ring = ringGeometry(CN, true);
    const group = new THREE.Group();
    group.name = 'terrain';
    const levels = [];
    for (let l = 0; l < quality.clipLevels; l++) {
        const size = quality.clipCell * Math.pow(2, l);
        const m = new THREE.Mesh(l === 0 ? full : ring, mat);
        m.scale.set(size, 1, size);
        m.frustumCulled = false;
        m.receiveShadow = true;
        m.castShadow = l >= 1 && l <= quality.clipShadowTo;   // far ground is shadowed by the baked sweep instead
        m.matrixAutoUpdate = false;
        group.add(m);
        levels.push({ mesh: m, size });
    }

    const update = (camera) => {
        for (const { mesh, size } of levels) {
            const snap = size * 2;
            mesh.position.set(Math.floor(camera.position.x / snap) * snap, 0, Math.floor(camera.position.z / snap) * snap);
            mesh.updateMatrix();
            mesh.updateMatrixWorld(true);
        }
    };

    // shared lookups for everything else that stands on the island
    const sunVisAt = (worldXZ) => texture(infoC, infoUV(worldXZ)).r;      // 0 in the long shadow of a hill
    const infoAAt = (worldXZ) => texture(infoA, infoUV(worldXZ));
    const infoBAt = (worldXZ) => texture(infoB, infoUV(worldXZ));

    const shadeAt = (x, z) => { const i = Math.min(N - 1, Math.max(0, Math.round((x + half) / cell))), j = Math.min(N - 1, Math.max(0, Math.round((z + half) / cell))); return sunVis[j * N + i] / 255; };
    return { group, update, material: mat, hTex, infoA, infoB, infoC, shadowTex, shadowData, gridHeight, groundHeight, sunVisAt, infoAAt, infoBAt, infoUV, shadeAt };
}

// (N+1)^2 vertices at integer coordinates centred on 0. `hole` leaves out the
// middle, which the next finer ring covers wherever the camera has snapped to.
function ringGeometry(N, hole) {
    const V = N + 1, pos = new Float32Array(V * V * 3);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) { const o = (j * V + i) * 3; pos[o] = i - N / 2; pos[o + 1] = 0; pos[o + 2] = j - N / 2; }
    const lo = N / 4 + 1, hi = (3 * N) / 4;
    const idx = [];
    for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
            if (hole && i >= lo && i < hi && j >= lo && j < hi) continue;
            const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
            // alternate the diagonal so no direction is favoured
            if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
}

// 0..255 visibility of the sun over the island. Sweeps the grid away from the
// sun along its dominant axis, each cell inheriting the shadow height of the
// cell before it, lowered by the sun's slope.
function bakeSunVisibility(island, sunDir) {
    const N = island.N, cell = island.cell, H = island.height;
    const out = new Uint8Array(N * N), edge = new Float32Array(N * N);
    const sx = sunDir.x, sz = sunDir.z, sy = sunDir.y;
    const horiz = Math.hypot(sx, sz) || 1e-6;
    const alongX = Math.abs(sx) >= Math.abs(sz);
    // step one cell along the major axis, away from the sun
    const major = alongX ? sx : sz, minor = alongX ? sz : sx;
    const dir = major > 0 ? -1 : 1;                       // walking direction along the major axis
    const lateral = (-minor / Math.abs(major)) * 1;       // cells moved sideways per step (away from sun)
    const stepLen = cell * Math.sqrt(1 + (minor / major) * (minor / major));
    const drop = stepLen * (sy / horiz);
    let prev = new Float32Array(N), cur = new Float32Array(N);
    const start = dir > 0 ? 0 : N - 1;
    for (let k = 0; k < N; k++) {
        const a = start + dir * k;
        for (let b = 0; b < N; b++) {
            const o = alongX ? b * N + a : a * N + b;
            const h = H[o];
            let sh = -1e9;
            if (k > 0) {
                const src = b - lateral;
                const i0 = Math.floor(src), f = src - i0;
                const p0 = prev[Math.min(N - 1, Math.max(0, i0))], p1 = prev[Math.min(N - 1, Math.max(0, i0 + 1))];
                sh = p0 + (p1 - p0) * f - drop;
            }
            cur[b] = Math.max(h, sh);
            edge[o] = cur[b];
            // soft edge: how far below the shadow line this ground is
            const below = sh - Math.max(h, 0);                // the sea surface, not its bed, catches the shadow
            const deep = Math.min(1, Math.max(0, -h / 6));
            out[o] = Math.round(255 * Math.max(deep * 0.75, 1 - Math.min(1, Math.max(0, below / 9))));
        }
        const t = prev; prev = cur; cur = t;
    }
    return { vis: out, edge };
}

// height grid + successively halved copies (1-2-1 filtered), packed left to right
function buildPyramid(base, N, cell) {
    const levels = [{ data: base, size: N, cell }];
    while (levels[levels.length - 1].size > 32 && levels.length < 6) {
        const p = levels[levels.length - 1], S = p.size, n = Math.ceil(S / 2);
        const d = new Float32Array(n * n);
        const at = (i, j) => p.data[Math.min(S - 1, Math.max(0, j)) * S + Math.min(S - 1, Math.max(0, i))];
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const x = i * 2, y = j * 2;
            d[j * n + i] = (4 * at(x, y) + 2 * (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) + at(x - 1, y - 1) + at(x + 1, y - 1) + at(x - 1, y + 1) + at(x + 1, y + 1)) / 16;
        }
        levels.push({ data: d, size: n, cell: p.cell * 2 });
    }
    let W = 0; for (const l of levels) { l.ox = W; l.oy = 0; W += l.size; }
    const H = N, data = new Float32Array(W * H);
    for (const l of levels) for (let j = 0; j < l.size; j++) data.set(l.data.subarray(j * l.size, (j + 1) * l.size), j * W + l.ox);
    return { data, W, H, levels };
}
