// Ground cover: the low green that grows on everything not trodden bare. Young
// fern fronds and the narrow blades of rushes and horsetails (grass had barely
// appeared), by the hundred thousand.
//
// None of it is placed. One square of blades and fronds is kept wrapped round
// the camera, like a tablecloth that follows it, and each plant finds out in the
// vertex shader where it has landed: how high the ground is there, whether it
// is soil or sand or rock or a path, whether a stone stands on it (footprint.js). So the whole
// island is covered and only the part in front of the lens is ever drawn.
//
// The way of making a plant from nothing but its index (a ribbon bent along an
// arc, its outline cut analytically, no texture) and of thinning a field with
// distance by drawing fewer, wider plants is Noniv's Abyssal Garden kelp (MIT).
import * as THREE from 'three/webgpu';
import {
    Fn, attribute, uniform, texture, vec2, vec3, vec4, float, int, mix, max, min, abs, clamp, normalize, dot, pow, sin, cos, length, fract, step, saturate,
    positionGeometry, cameraViewMatrix, time, varying, fwidth, screenCoordinate,
} from 'three/tsl';
import { smoothstep } from './tsl.js';
import { mulberry32 } from './noise.js';

export function createCover({ island, quality, atmosphere, terrain, noiseTex, footprints }) {
    const group = new THREE.Group(); group.name = 'cover';
    const amount = quality.blades;
    if (!amount) return { group, update() {}, stats: { blades: 0 } };

    const B = amount >= 0.6 ? 46 : 36;               // side of the square that follows the camera
    const COUNT = Math.round(250000 * amount * (B * B) / (46 * 46));
    const ROWS = amount >= 0.6 ? 4 : amount >= 0.25 ? 3 : 2;

    // ---- one ribbon: `ROWS` segments, x = which edge (-1, 1), y = how far up (0..1)
    const geo = new THREE.InstancedBufferGeometry();
    {
        const pos = [], idx = [];
        for (let r = 0; r <= ROWS; r++) { pos.push(-1, r / ROWS, 0, 1, r / ROWS, 0); }
        for (let r = 0; r < ROWS; r++) { const a = r * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        geo.setIndex(idx);
        const rnd = mulberry32(60606), seed = new Float32Array(COUNT * 4);
        for (let i = 0; i < COUNT * 4; i++) seed[i] = rnd();
        geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 4));
        geo.instanceCount = COUNT;
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    }

    const uEye = uniform(new THREE.Vector3()), uMid = uniform(new THREE.Vector2());
    const windDir = vec2(0.92, 0.39);
    const s = attribute('seed', 'vec4');
    const side = positionGeometry.x, v = positionGeometry.y;

    // everything a plant learns about its spot, once per vertex
    const plant = () => {
        // where this plant has landed in the square round the camera
        const w = uMid.add(fract(s.xy.sub(uMid.div(B)).add(0.5)).sub(0.5).mul(B));
        const h = terrain.groundHeight(w);
        const A = texture(terrain.infoA, terrain.infoUV(w)).level(0), Bi = texture(terrain.infoB, terrain.infoUV(w)).level(0);
        const nx = A.r.mul(2).sub(1), nz = A.g.mul(2).sub(1), slope = float(1).sub(max(float(1).sub(nx.mul(nx)).sub(nz.mul(nz)), 0.0).sqrt());
        const veg = A.b, volcanic = Bi.r, strata = Bi.g, trail = Bi.b, wet = Bi.a;
        const patch = texture(noiseTex, w.mul(1 / 9.5)).level(0).r, fine = texture(noiseTex, w.mul(1 / 2.3)).level(0).g;
        // soil grows it; sand, ash, bare rock, a beaten path and a steep bank do not
        // (the beach is wherever the terrain paints sand: the same rule as its shader)
        const coast = smoothstep(540.0, 700.0, length(w.mul(vec2(0.93, 1.04))));
        const sand = float(1).sub(smoothstep(2.6, 5.8, h.add(texture(noiseTex, w.mul(1 / 190)).level(0).r.sub(0.5).mul(2.2)))).mul(float(1).sub(strata.mul(0.6))).mul(coast);
        const soil = smoothstep(0.02, 0.3, veg.add(patch.sub(0.5).mul(0.24))).mul(0.5).add(0.5)
            .mul(float(1).sub(trail.mul(0.97))).mul(float(1).sub(strata.mul(0.62))).mul(float(1).sub(smoothstep(0.25, 0.7, volcanic)))
            .mul(smoothstep(0.42, 0.2, slope)).mul(smoothstep(0.25, 0.9, h)).mul(float(1).sub(sand.mul(0.985)));
        // it comes in drifts, with bare earth between
        const drift = smoothstep(0.3, 0.56, patch.mul(0.7).add(fine.mul(0.3)));
        // nothing grows through a stone
        const taken = footprints.at(w, true).r;
        const grow = soil.mul(drift.mul(0.86).add(0.14)).mul(float(1).sub(smoothstep(0.15, 0.4, taken)));
        // further off there are fewer, and each is wider: the field keeps its weight and loses its cost
        const d = length(vec3(w.x, h, w.y).sub(uEye));
        const thin = smoothstep(B * 0.14, B * 0.8, d);
        const alive = step(s.z, grow);
        // The field ends in a circle round the middle of its square (so all of the square is used, and it
        // reaches twice as far ahead of the lens as behind it), and nothing in it changes size to come or go:
        // a plant dissolves, at the rim, right under the lens, and when it is one of those thinned away.
        // (and all of it, as the lens climbs away: the whole field has dissolved before it stops being drawn)
        const fade = smoothstep(B * 0.5, B * 0.41, length(w.sub(uMid))).mul(smoothstep(0.5, 1.6, d)).mul(saturate(s.w.sub(thin.mul(0.86)).mul(14.0))).mul(smoothstep(B * 0.5, B * 0.34, uEye.y.sub(h)));
        // by fresh water it stands tall (rushes); under trees and on dry ground it stays low
        const kind = step(0.62, fract(s.z.mul(31.7)));        // 0 blade, 1 frond
        const tall = mix(0.13, 0.5, pow(fract(s.w.mul(17.3)), 2.0)).mul(veg.mul(0.55).add(0.6)).mul(wet.mul(float(1).sub(kind)).mul(1.5).add(1.0)).mul(drift.mul(0.5).add(0.6)).mul(mix(1.0, 0.72, kind));
        return { w, h, grow, thin, alive, fade, kind, tall, wet, veg, patch, d, dry: strata };
    };

    const P = plant();
    const vAlive = varying(P.alive.mul(P.fade)), vKind = varying(P.kind), vPatch = varying(P.patch), vWet = varying(P.wet), vDry = varying(P.dry);
    const yaw = s.x.mul(40.0).add(s.y.mul(17.0));
    const dir = vec2(cos(yaw), sin(yaw));

    const mat = new THREE.MeshSSSNodeMaterial({ side: THREE.DoubleSide });
    mat.positionNode = Fn(() => {
        const H = P.tall.mul(P.alive).mul(step(0.004, P.fade));          // (gone entirely: folded to a point, no pixels)
        // a blade is a hand wide at most; a frond is a third as wide as it is long
        const wide = mix(mix(0.012, 0.022, fract(s.x.mul(91.0))), P.tall.mul(0.36), P.kind).mul(P.thin.mul(1.6).add(1.0));
        // the wind arrives in waves that cross the field, and every plant nods a little out of step
        const gust = texture(noiseTex, P.w.mul(1 / 120).add(windDir.mul(time.mul(0.025)))).level(0).r;
        const wave = sin(dot(P.w, windDir).mul(0.42).sub(time.mul(1.7)).add(s.y.mul(2.4))).mul(0.5).add(0.5);
        const blow = gust.mul(1.4).add(0.12).mul(wave.mul(0.75).add(0.25)).mul(0.5);
        const arch = mix(0.25, 0.85, fract(s.y.mul(53.0))).mul(mix(1.0, 1.25, P.kind));
        const out = dir.mul(arch).add(windDir.mul(blow)).mul(v.mul(v)).mul(H);
        const up = H.mul(v).mul(float(1).sub(arch.add(blow).mul(0.3).mul(v)));
        // the outline is cut in the fragment shader; a blade also tapers here, to save the pixels
        const taper = mix(pow(float(1).sub(v), 0.6).mul(0.85).add(0.15), 1.0, P.kind);
        const across = vec2(dir.y.negate(), dir.x).mul(side).mul(wide).mul(taper);
        return vec3(P.w.x.add(out.x).add(across.x), P.h.sub(0.04).add(up), P.w.y.add(out.y).add(across.y));
    })();

    // the outline: a blade runs to a point, a frond is a comb of pinnae, widest a third of the way up
    const outline = Fn(() => {
        const u = abs(side);
        const blade = float(1).sub(u);
        const prof = pow(max(sin(pow(v.mul(0.94).add(0.06), 0.62).mul(3.14159)), 0.0), 0.8);
        const pinna = abs(fract(v.mul(13.0).add(s.x.mul(7.0))).sub(0.5)).mul(2.0);
        const frond = prof.mul(mix(0.34, 1.0, pow(float(1).sub(pinna), 0.7))).sub(u);
        return mix(blade, frond, vKind);
    })();
    const edge = fwidth(outline).mul(0.75).add(1e-4);
    const alpha = saturate(outline.div(edge).add(0.5));
    mat.opacityNode = alpha;
    // (the same screen pattern the trees dissolve with)
    const grainN = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))));
    if (quality.msaa > 1) { mat.alphaToCoverage = true; mat.maskNode = alpha.greaterThan(0.02).and(vAlive.greaterThan(grainN)); } else mat.maskNode = outline.greaterThan(0.0).and(vAlive.greaterThan(grainN));

    const tint = Fn(() => {
        const hue = fract(s.y.mul(7.0).add(s.z.mul(3.0)));
        // olive in the open and when dry, deep green in the damp and the shade
        const young = mix(vec3(0.085, 0.16, 0.022), vec3(0.2, 0.24, 0.045), hue.mul(0.6).add(vPatch.mul(0.4)));
        const deep = mix(vec3(0.03, 0.085, 0.022), vec3(0.06, 0.15, 0.03), hue);
        const c = mix(young, deep, saturate(vWet.mul(0.8).add(vKind.mul(0.55)))).toVar();
        // on the dry mesas it has gone to straw
        c.assign(mix(c, mix(vec3(0.3, 0.24, 0.085), vec3(0.42, 0.34, 0.13), hue), vDry.mul(0.85)));
        // a midrib on the frond, a paler keel on the blade, tips a little sere
        c.mulAssign(mix(1.0, 1.35, smoothstep(0.14, 0.0, abs(side)).mul(vKind)));
        c.assign(mix(c, vec3(0.26, 0.21, 0.07), smoothstep(0.7, 1.0, v).mul(hue).mul(0.35).mul(float(1).sub(vKind))));
        return c;
    })();
    // dark at the root where the others crowd it, bright where it stands clear
    const occl = mix(0.3, 1.0, smoothstep(0.0, 0.75, v));
    mat.colorNode = vec4(tint.mul(mix(occl, 1.0, 0.2)), 1);
    mat.aoNode = occl;
    mat.roughnessNode = mix(float(0.5), float(0.78), vKind);
    mat.specularIntensity = 0.5;
    mat.metalnessNode = float(0);
    // lit as a field, not as a hundred thousand facets: mostly the sky above it, a little its own lean
    mat.normalNode = normalize(vec3(dir.x.mul(0.22).add(dir.y.negate().mul(side).mul(0.28)), 1.0, dir.y.mul(0.22).add(dir.x.mul(side).mul(0.28)))).transformDirection(cameraViewMatrix);
    // held up against the sun it glows
    mat.thicknessColorNode = tint.mul(vec3(1.25, 1.35, 0.5)).mul(occl);
    mat.thicknessDistortionNode = float(0.4);
    mat.thicknessAmbientNode = float(0.0);
    mat.thicknessAttenuationNode = float(1.0);
    mat.thicknessPowerNode = float(3.0);
    mat.thicknessScaleNode = float(1.5);
    mat.envMapIntensity = 0.8;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    mesh.name = 'cover';
    group.add(mesh);

    const fwd = new THREE.Vector3();
    const update = (camera) => {
        const e = camera.position;
        uEye.value.copy(e);
        // the square sits ahead of the lens, where it can be seen
        camera.getWorldDirection(fwd); const fl = Math.hypot(fwd.x, fwd.z) || 1;
        uMid.value.set(e.x + (fwd.x / fl) * B * 0.36, e.z + (fwd.z / fl) * B * 0.36);
        // from higher than its own reach there is nothing of it to see, and no reason to plant it
        mesh.visible = e.y - Math.max(0, island.heightAt(e.x, e.z)) < B * 0.8;
    };

    return { group, update, material: mat, stats: { blades: COUNT, tris: COUNT * ROWS * 2 } };
}
