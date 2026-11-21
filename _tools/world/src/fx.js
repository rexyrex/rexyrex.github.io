// Small bright things: motes in the air, sparks, a flame. All of them are drawn
// as quads that face the lens and add their light to the picture, and none of
// them is moved by the CPU: where a particle is and how bright it burns is a
// function of the clock and of a few random numbers it was born with.
//
// Motes follow Abyssal Garden's marine snow (MIT): a cube of them that wraps
// round the camera, each lit by whatever sunlight reaches it, so they flare as
// they drift through a beam; and none is ever drawn smaller than a pixel (it is
// drawn dimmer instead), which is what stops a field of specks from flickering.
import * as THREE from 'three/webgpu';
import {
    Fn, attribute, uniform, texture, vec2, vec3, vec4, float, mix, max, min, abs, clamp, normalize, dot, pow, sin, cos, exp, length, fract, saturate,
    positionGeometry, positionView, normalView, cameraPosition, cameraViewMatrix, cameraProjectionMatrix, uv, varying, dFdx, dFdy, cross, sign,
} from 'three/tsl';
import { smoothstep, time } from './tsl.js';
import { mulberry32 } from './noise.js';

const quads = (count, seedOf) => {
    const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(2, 2);
    g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seed[i] = seedOf();
    g.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
};
// a quad of half-size `size` (metres) that faces the lens, centred on `centre`
const facing = (centre, size) => { const mv = cameraViewMatrix.mul(vec4(centre, 1.0)); return cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(size)), mv.zw)); };
// what a hot thing glows as it cools: white-yellow, orange, a dull red, out
const ember = (heat) => mix(mix(vec3(0.9, 0.06, 0.0), vec3(1.0, 0.36, 0.03), smoothstep(0.1, 0.5, heat)), vec3(1.0, 0.86, 0.5), smoothstep(0.55, 1.0, heat));
// how many metres one pixel spans at a metre's distance (set every frame)
const uPixel = uniform(0.001);

// ---- motes: pollen, dust and midges, wherever the lens is ---------------------------------------
export function createMotes({ quality, atmosphere, sunlight, island = null }) {
    const group = new THREE.Group(); group.name = 'motes';
    const count = quality.motes;
    if (!count) return { group, update() {} };
    const rnd = mulberry32(424242), B = 26;
    const g = quads(count, rnd), a = attribute('seed', 'vec4');
    const uEye = uniform(new THREE.Vector3());
    const t = time;
    // adrift on the wind, sinking very slowly, each wandering a little by itself
    const home = a.xyz.mul(B).add(vec3(t.mul(0.31), t.mul(-0.022), t.mul(0.13)))
        .add(vec3(sin(t.mul(0.31).add(a.x.mul(60))), sin(t.mul(0.23).add(a.y.mul(50))).mul(0.6), cos(t.mul(0.27).add(a.z.mul(70)))).mul(0.45));
    const p = uEye.add(fract(home.sub(uEye).div(B).add(0.5)).sub(0.5).mul(B));
    const d = length(p.sub(uEye));
    const sz = a.w.mul(a.w).mul(a.w).mul(0.016).add(0.005);
    const px = d.mul(uPixel).mul(1.5);                                   // never smaller than a pixel and a half: a soft dot, not a hot pixel
    const air = sunlight.inAir(p);                                       // x: how much sun reaches it, y: height above the ground
    const dir = p.sub(uEye).div(max(d, 1e-3));
    // lit from behind it blazes, lit from the front it is barely there
    const mu = dot(dir, atmosphere.uSunDir);
    const phase = atmosphere.hg(mu, float(0.62)).mul(3.2).add(0.05);
    const twinkle = sin(t.mul(a.w.mul(2.0).add(1.0)).add(a.x.mul(100.0))).mul(0.35).add(0.65);
    // (and only against the land: a speck in front of the open sky reads as dirt on the lens)
    const fade = smoothstep(B * 0.5, B * 0.34, d).mul(smoothstep(1.8, 5.0, d)).mul(min(float(1), sz.div(px)).pow(2.0)).mul(smoothstep(0.05, 0.6, air.y)).mul(smoothstep(45.0, 18.0, air.y)).mul(smoothstep(0.1, -0.04, dir.y));
    const m = new THREE.NodeMaterial();
    m.transparent = true; m.depthWrite = false; m.blending = THREE.AdditiveBlending; m.fog = false;
    m.vertexNode = facing(p, max(sz, px));
    const lit = atmosphere.uSunColor.mul(air.x).mul(phase).add(atmosphere.skyLookup(vec3(0, 1, 0)).mul(0.05)).mul(vec3(1.0, 0.93, 0.74)).mul(fade).mul(twinkle).mul(0.3);
    const r = length(uv().sub(0.5).mul(2.0));
    m.fragmentNode = vec4(varying(lit).mul(exp(r.mul(r).mul(-4.5))).mul(smoothstep(1.0, 0.7, r)), 1.0);
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 24; mesh.name = 'motes';
    group.add(mesh);
    // (from high over the island there is no air near the lens for them to be in)
    const update = (camera) => { const e = camera.position; uEye.value.copy(e); mesh.visible = !island || e.y - Math.max(0, island.heightAt(e.x, e.z)) < 70; };
    return { group, update };
}

// ---- sparks: thrown up from something hot, cooling as they climb ---------------------------------
// origin [x, y, z]; they start on a disc of `radius`, rise `height` in `life` seconds and wander `spread`
export function createSparks({ count, origin, radius, height, life, size, spread, drift = [0, 0], gain = 1, amount = float(1), seed = 7 }) {
    const rnd = mulberry32(seed);
    const g = quads(count, rnd), a = attribute('seed', 'vec4');
    const age = fract(time.div(a.w.mul(0.8).add(0.6).mul(life)).add(a.x));
    const ang = a.y.mul(6.2831853), r0 = a.z.sqrt().mul(radius);
    // a spark is flung, then carried: fast at first, slowing, turning on the hot air
    const up = age.pow(0.72).mul(height).mul(a.z.mul(0.7).add(0.5));
    const swirl = vec3(sin(time.mul(0.9).add(a.x.mul(40.0)).add(age.mul(7.0))), 0, cos(time.mul(0.7).add(a.y.mul(40.0)).add(age.mul(5.0)))).mul(spread).mul(age.mul(0.9).add(0.1));
    const p = vec3(origin[0], origin[1], origin[2]).add(vec3(cos(ang).mul(r0), up, sin(ang).mul(r0))).add(swirl).add(vec3(drift[0], 0, drift[1]).mul(age.mul(age)));
    const d = length(p.sub(cameraPosition));
    const sz = float(size).mul(a.w.mul(0.8).add(0.5)).mul(float(1).sub(age.mul(0.55)));
    const px = d.mul(uPixel).mul(0.8);
    const heat = float(1).sub(age).pow(1.3);
    const flick = sin(time.mul(23.0).add(a.x.mul(300.0))).mul(0.25).add(0.75);
    const m = new THREE.NodeMaterial();
    m.transparent = true; m.depthWrite = false; m.blending = THREE.AdditiveBlending; m.fog = false;
    m.vertexNode = facing(p, max(sz, px));
    const lit = ember(heat).mul(heat).mul(flick).mul(smoothstep(0.0, 0.04, age)).mul(min(float(1), sz.div(px)).pow(2.0)).mul(amount).mul(gain);
    const r = length(uv().sub(0.5).mul(2.0));
    m.fragmentNode = vec4(varying(lit).mul(exp(r.mul(r).mul(-5.0))).mul(smoothstep(1.0, 0.7, r)), 1.0);
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 23; mesh.name = 'sparks';
    return mesh;
}

// ---- a flame: one sheet that turns to the lens, the fire drawn on it ------------------------------
export function createFlame({ origin, width, height, noiseTex, amount = float(1), gain = 1 }) {
    const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0);
    const m = new THREE.NodeMaterial();
    m.transparent = true; m.depthWrite = false; m.blending = THREE.AdditiveBlending; m.fog = false; m.side = THREE.DoubleSide;
    const o = vec3(origin[0], origin[1], origin[2]);
    const to = cameraPosition.sub(o), right = normalize(vec3(to.z, 0, to.x.negate()));
    m.positionNode = o.add(right.mul(positionGeometry.x.mul(width))).add(vec3(0, positionGeometry.y.mul(height).mul(amount.mul(0.45).add(0.55)), 0));
    m.fragmentNode = Fn(() => {
        const q = uv(), y = q.y, t = time;
        // the air it heats rises and wavers, and takes the flame with it
        const n1 = texture(noiseTex, vec2(q.x.mul(0.55), y.mul(0.5).sub(t.mul(0.62)))).r, n2 = texture(noiseTex, vec2(q.x.mul(1.3).add(0.3), y.mul(1.1).sub(t.mul(1.25)))).g;
        const n3 = texture(noiseTex, vec2(q.x.mul(2.9).add(0.7), y.mul(2.6).sub(t.mul(2.1)))).g;
        const x = q.x.sub(0.5).mul(2.0).add(n1.sub(0.5).mul(1.1).mul(y)).add(n2.sub(0.5).mul(0.45).mul(y));
        // broad over the wood, drawn up to tongues that tear off
        const w = mix(0.62, 0.05, pow(y, 0.62)).add(n2.sub(0.5).mul(0.3).mul(y));
        const body = saturate(float(1).sub(abs(x).div(max(w, 0.01))));
        const lick = smoothstep(0.0, 0.5, n3.add(n1).sub(y.mul(1.25)).add(0.25));
        const heat = body.pow(0.8).mul(lick).mul(smoothstep(0.0, 0.06, y)).mul(float(1).sub(y).pow(0.5));
        // hottest low in the middle, where it is nearly white
        const core = heat.mul(heat).mul(float(1).sub(y.mul(0.8)));
        const c = ember(saturate(core.mul(1.25).add(heat.mul(0.35)))).mul(heat.mul(1.6).add(core.mul(5.0)));
        return vec4(c.mul(amount.mul(0.7).add(0.3)).mul(smoothstep(0.0, 0.2, amount)).mul(gain), 1.0);
    })();
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 22; mesh.name = 'flame';
    return mesh;
}

// A surface normal bent by a height (in metres) that exists only as a formula: no texture, no tangents, just
// how the height changes from one pixel to the next. For relief that is larger than a pixel (a carved
// letter, bark); finer than that it turns to speckle.
// `k`: how much of the relief is left at this distance, when it is faded out by how big it is on the
// screen. It scales the slope after the slope is taken, and is never folded into the height: a fade
// worked out from `fwidth` and then differentiated again is a derivative of a derivative, which neither
// shading language defines (a phone may show sparkle exactly where the detail is meant to be going quiet).
export const reliefNormal = (h, k = null) => Fn(() => {
    const dpdx = dFdx(positionView), dpdy = dFdy(positionView);
    const r1 = cross(dpdy, normalView), r2 = cross(normalView, dpdx);
    const det = dot(dpdx, r1);
    const slope = sign(det).mul(dFdx(h).mul(r1).add(dFdy(h).mul(r2))), grad = k ? slope.mul(k) : slope;
    return normalize(abs(det).mul(normalView).sub(grad));
})();

// call once a frame: how big a pixel is, so nothing is drawn smaller than one
const _v2 = new THREE.Vector2();
export function setPixel(camera, renderer) { renderer.getDrawingBufferSize(_v2); uPixel.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, _v2.y); }
export { ember };
