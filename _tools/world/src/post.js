// The picture after the scene is drawn.
//
//   scene (HDR, multisampled)
//     x  ambient occlusion          contact shade where things meet (half size)
//     +  sunbeams                   sunlight scattered by the haze, marched through the same
//                                   shadows and flecks the ground is lit by (half size, then
//                                   blurred and enlarged without crossing depth edges)
//     ~  depth of field             a lens that is focused on what the stop is about
//     +  glare                      a little of the blurred picture laid over itself: no threshold,
//                                   so the sun, the lava and a glint glow and the rest only softens
//     grade, film curve, and in display space a vignette, an S-curve and dither
//
// Sunbeams, the unthresholded glare and the order of the grade follow Noniv's Abyssal
// Garden (MIT); the rest of the chain is three's own nodes.
import * as THREE from 'three/webgpu';
import {
    Fn, pass, uniform, vec2, vec3, vec4, float, mix, max, min, clamp, dot, pow, length, normalize, abs, exp, sqrt, sin, cos, floor, fract, saturate,
    screenUV, screenCoordinate, renderOutput, Loop, If, texture, time, rtt, perspectiveDepthToViewZ, interleavedGradientNoise,
} from 'three/tsl';
import { smoothstep } from './tsl.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';

const LUMA = vec3(0.2126, 0.7152, 0.0722);

export function createPost({ renderer, scene, camera, quality, atmosphere, sunlight, director = null }) {
    const pipeline = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera, { samples: quality.msaa > 1 ? quality.msaa : 0 });
    const color = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');

    const uExposure = uniform(1.0);
    const uWarm = uniform(new THREE.Vector3(1.035, 1.0, 0.95));

    // ---- the lens, for passes that rebuild where a pixel is in the world
    const uEye = uniform(new THREE.Vector3()), uFwd = uniform(new THREE.Vector3(0, 0, -1)), uRight = uniform(new THREE.Vector3(1, 0, 0)), uUp = uniform(new THREE.Vector3(0, 1, 0));
    const uTan = uniform(new THREE.Vector2(1, 1));               // tan(half the field of view): across, up
    const uNear = uniform(camera.near), uFar = uniform(camera.far);
    const uHalf = uniform(new THREE.Vector2(1, 1));              // size of the sunbeams' own, smaller targets, in pixels
    const SR = quality.shaftRes || 0.5;
    const rayOf = (suv) => normalize(uFwd.add(uRight.mul(suv.x.mul(2).sub(1).mul(uTan.x))).add(uUp.mul(float(1).sub(suv.y.mul(2)).mul(uTan.y))));
    // how far along its ray the thing drawn at a pixel is
    const reach = (suv, dir) => perspectiveDepthToViewZ(texture(depth, suv).r, uNear, uFar).negate().div(max(dot(dir, uFwd), 0.05));

    let lit = color.rgb;

    // ---- ambient occlusion: creases and contact, at half size
    if (quality.ao) {
        const aoPass = ao(depth, null, camera);
        aoPass.resolutionScale = 0.5; aoPass.samples.value = quality.ao;
        aoPass.radius.value = 1.1; aoPass.thickness.value = 1.4; aoPass.distanceExponent.value = 1.4; aoPass.distanceFallOff.value = 0.6; aoPass.scale.value = 1.15;
        const occ = aoPass.getTextureNode().r;
        // (shade takes more from dim surfaces than from sunlit ones: it is skylight that a crease loses)
        const sunlit = smoothstep(1.2, 6.0, dot(color.rgb, LUMA));
        lit = lit.mul(mix(occ, 1.0, sunlit.mul(0.55)));
    }

    // ---- sunbeams
    if (quality.shafts) {
        const N = quality.shafts, REACH = 1400;
        const { uSunDir, uSunColor, uFogBase, uFogLow, uFogHeight, uHaze, hg } = atmosphere;
        const TOP = 300;                                         // above this the air is too thin to show a beam
        const march = Fn(() => {
            const dir = rayOf(screenUV);
            const far = reach(screenUV, dir);
            // The march covers only the part of the ray that lies in the low air, between the sea and TOP: from
            // high up it begins where the ray comes down into it, from below it ends where the ray climbs out,
            // and a ray that never enters it is not marched at all.
            const over = uEye.y.sub(TOP);
            const start = max(over, 0.0).div(max(dir.y.negate(), 1e-4));
            const end = min(far, start.add(REACH)).toVar();
            If(dir.y.lessThan(-1e-4), () => { end.assign(min(end, uEye.y.div(dir.y.negate()))); });       // nothing to light under the sea
            If(dir.y.greaterThan(1e-4), () => { end.assign(min(end, over.negate().div(dir.y))); });         // (negative from above TOP: the ray is empty)
            const len = max(end.sub(start), 0.0).mul(over.lessThanEqual(0.0).or(dir.y.lessThan(-1e-4)).select(1.0, 0.0));
            const jitter = interleavedGradientNoise(screenCoordinate.xy);
            // (the thin air crossed on the way down to the layer has already dimmed what comes back through it)
            const acc = float(0).toVar(), tau = float(start.mul(uFogBase).mul(uHaze)).toVar();
            Loop(N, ({ i }) => {
                // steps grow with distance: the flecks under the trees are near, the hills' shadows far. Each step
                // owns a fixed stretch of the ray and is sampled at an even chance anywhere inside it, so every ray
                // adds up to its own length whatever its jitter.
                const k = float(i), a = k.div(N).pow(2.0), b = k.add(1).div(N).pow(2.0);
                const t = start.add(len.mul(mix(a, b, jitter))), dt = len.mul(b.sub(a));
                const P = uEye.add(dir.mul(t));
                // (it is the low, damp air that shows a beam; the thin haze higher up is already in the fog's own colour)
                const low = uFogLow.mul(exp(max(P.y, 0.0).div(uFogHeight).negate()));
                acc.addAssign(sunlight.inAir(P).x.mul(low.add(uFogBase.mul(0.2))).mul(uHaze).mul(exp(tau.negate())).mul(dt));
                tau.addAssign(low.add(uFogBase).mul(uHaze).mul(dt));
            });
            // haze throws most of what it scatters forward, so beams blaze looking toward the sun
            const mu = dot(dir, uSunDir);
            const phase = hg(mu, float(0.76)).mul(0.75).add(hg(mu, float(0.3)).mul(0.3)).add(0.006);
            return vec4(uSunColor.mul(acc).mul(phase).mul(1.1), min(far, 4000.0));
        });
        const raw = rtt(march(), null, null, { resolutionScale: SR, depthBuffer: false });
        // soften the grain of the march without letting a beam bleed over an edge in depth
        const soft = rtt(Fn(() => {
            const c = raw.sample(screenUV);
            const sum = vec3(c.rgb).mul(1 / 0.03).toVar(), ws = float(1 / 0.03).toVar();
            for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
                const s = raw.sample(screenUV.add(vec2(dx, dy).div(uHalf)));
                const w = float(1).div(abs(s.a.sub(c.a)).div(max(c.a, 1.0)).add(0.03));
                sum.addAssign(s.rgb.mul(w)); ws.addAssign(w);
            }
            return vec4(sum.div(ws), c.a);
        })(), null, null, { resolutionScale: SR, depthBuffer: false });
        // enlarge to full size the same way
        const beams = Fn(() => {
            const dir = rayOf(screenUV), z = min(reach(screenUV, dir), 4000.0);
            const p = screenUV.mul(uHalf).sub(0.5), f = fract(p), base = floor(p).add(0.5).div(uHalf);
            const sum = vec3(0).toVar(), ws = float(0).toVar();
            for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                const s = soft.sample(base.add(vec2(dx, dy).div(uHalf)));
                const bl = (dx ? f.x : float(1).sub(f.x)).mul(dy ? f.y : float(1).sub(f.y));
                const w = bl.add(0.02).div(abs(s.a.sub(z)).div(max(z, 1.0)).add(0.02));
                // (a twig in front of open sky finds no neighbour at its own depth: it takes a neighbour's beam
                // cut down to the short way the light has to come to reach it, not the whole sky's; and a gap in the
                // leaves, which shows what is further off, takes more. Both lengths counted only as far as the march goes)
                sum.addAssign(s.rgb.mul(clamp(min(z, REACH).div(max(min(s.a, REACH), 1.0)), 0.0, 2.5)).mul(w)); ws.addAssign(w);
            }
            return sum.div(ws);
        });
        lit = lit.add(beams());
    }

    // ---- depth of field
    const uFocus = uniform(new THREE.Vector2(1 / 400, 0.0));     // 1 / distance in focus, aperture
    let image = lit, dofBlur = null;
    if (quality.dof) {
        const TAPS = quality.post >= 3 ? 22 : 12, MAXC = 0.0085, NEARC = 0.0011;
        // radius of the blur disc, as a fraction of the picture's height. What is nearer than the subject is
        // left all but sharp: a foreground blurred to blobs is a third of the picture thrown away.
        const cocOf = (d) => { const k = float(1).div(max(d, 0.3)).sub(uFocus.x).mul(uFocus.y); return max(min(k, NEARC), min(k.negate(), MAXC)); };
        // (a lens is focused on a plane, not on a sphere: depth along its axis, not distance along the ray)
        const base = rtt(Fn(() => vec4(lit, cocOf(perspectiveDepthToViewZ(texture(depth, screenUV).r, uNear, uFar).negate())))(), null, null, { depthBuffer: false });
        const aspect = uTan.x.div(uTan.y);
        const blurred = rtt(Fn(() => {
            const c = base.sample(screenUV);
            const sum = vec3(c.rgb).toVar(), ws = float(1).toVar();
            const turn = interleavedGradientNoise(screenCoordinate.xy).mul(6.2831853);
            Loop(TAPS, ({ i }) => {
                const k = float(i).add(0.5).div(TAPS), r = sqrt(k), a = float(i).mul(2.39996323).add(turn);
                const s = base.sample(screenUV.add(vec2(cos(a).div(aspect), sin(a)).mul(r).mul(c.a)));
                // a neighbour only spills here if its own disc is wide enough to reach
                const w = saturate(s.a.sub(r.mul(c.a)).div(0.0009).add(1.0));
                sum.addAssign(s.rgb.mul(w)); ws.addAssign(w);
            });
            return vec4(sum.div(ws), c.a);
        })(), null, null, { resolutionScale: 0.5, depthBuffer: false });
        dofBlur = blurred;
        image = Fn(() => {
            const c = base.sample(screenUV);
            return mix(c.rgb, blurred.sample(screenUV).rgb, smoothstep(0.0007, 0.0026, c.a));
        })();
    }

    // ---- glare
    let hdr = image;
    if (quality.post >= 1) {
        const glow = bloom(vec4(min(image, vec3(170.0)), 1), 1, quality.post >= 2 ? 0.86 : 0.7, 0);
        hdr = image.add(glow.rgb.mul(quality.post >= 2 ? 0.025 : 0.022));
    }

    // grade in scene-linear light, then the film curve
    const graded = Fn(() => {
        const c = vec3(hdr).mul(uExposure).mul(uWarm).toVar();
        const l = dot(c, LUMA);
        // richer where the light is good, a little cooler in shade and warmer in the sun
        c.assign(mix(vec3(l), c, 1.12));
        // open the shadows: the film curve below has a long dark toe, and a forest floor must not drown in it
        c.mulAssign(mix(1.45, 1.0, smoothstep(0.0, 0.9, l)));
        const tone = smoothstep(0.0, 1.4, l);
        c.mulAssign(mix(vec3(0.93, 0.99, 1.09), vec3(1.04, 1.0, 0.95), tone));
        return max(c, vec3(0.0));
    })();
    const mapped = renderOutput(vec4(graded, 1), renderer.toneMapping, renderer.outputColorSpace);
    const final = Fn(() => {
        const c = vec3(mapped.rgb).toVar();
        const q = screenUV.sub(0.5).mul(vec2(1.0, 0.82));
        c.mulAssign(float(1).sub(smoothstep(0.42, 1.0, length(q)).mul(0.2)));
        // an S-curve on the brightness alone, so contrast does not shift the colours
        const l0 = dot(c, LUMA), l1 = mix(l0, l0.mul(l0).mul(float(3).sub(l0.mul(2))), 0.12);
        c.mulAssign(l1.div(max(l0, 1e-4)));
        // the brightest things lose a little colour, as on film
        c.assign(mix(c, vec3(l1), smoothstep(0.62, 1.0, l1).mul(0.12)));
        // triangular dither: no bands in the sky or the haze
        const n = interleavedGradientNoise(screenCoordinate.xy.add(fract(time.mul(13.0)).mul(97.0))).add(interleavedGradientNoise(screenCoordinate.xy.add(37.0))).sub(1.0);
        c.addAssign(n.mul(1.6 / 255));
        return vec4(saturate(c), 1);
    })();
    pipeline.outputColorTransform = false;
    pipeline.outputNode = final;

    const f = new THREE.Vector3(), size = new THREE.Vector2();
    // what each stop's lens is set to: [distance in focus, aperture]
    const lens = (i) => (director && director.lensOf ? director.lensOf(i) : [400, 0.0, 0]);
    let focusNow = 1 / 400, apertureNow = 0;
    const update = (sunDir, shade = 1, dt = 0.016, manual = false) => {
        camera.matrixWorld.extractBasis(uRight.value, uUp.value, f);
        uFwd.value.copy(f).negate(); uEye.value.copy(camera.position);
        const ty = Math.tan((camera.fov * Math.PI) / 360);
        uTan.value.set(ty * camera.aspect, ty);
        uNear.value = camera.near; uFar.value = camera.far;
        renderer.getDrawingBufferSize(size);
        uHalf.value.set(Math.max(1, Math.floor(size.x * SR)), Math.max(1, Math.floor(size.y * SR)));
        // where the sun is on screen, and whether it is in front of the lens at all
        const facing = uFwd.value.dot(sunDir);
        f.copy(camera.position).addScaledVector(sunDir, 1e5).project(camera);
        const onScreen = Math.max(0, 1 - Math.max(0, Math.max(Math.abs(f.x), Math.abs(f.y)) - 1) / 0.8);
        // looking into the sun, the eye (and the camera) stops down
        // (and each stop is exposed for what it is about: a clearing in a forest wants more than an open ridge)
        // (`manual`: the camera has been put somewhere by hand, and no stop's lens applies)
        const settled = !manual && !!director && !director.flying && Math.abs(director.progress - Math.round(director.progress)) < 0.04;
        const stopEv = settled ? lens(director.stop)[2] || 0 : 0;
        const want = (1 - 0.5 * Math.min(1, Math.max(0, (facing - 0.35) / 0.55)) * onScreen) * (1 + 1.0 * (1 - shade)) * Math.pow(2, stopEv);
        uExposure.value += (want - uExposure.value) * 0.06;
        // the lens pulls focus to the stop it has arrived at, and opens up; in flight it sees everything sharp
        if (quality.dof && director) {
            let [dist, ap] = settled ? lens(director.stop) : [400, 0];
            // (focused on a thing, not on a range: how far along the lens's own axis that thing is now)
            const at = settled && director.focusOf ? director.focusOf(director.stop) : null;
            if (at) dist = Math.max(1, (at[0] - camera.position.x) * uFwd.value.x + (at[1] - camera.position.y) * uFwd.value.y + (at[2] - camera.position.z) * uFwd.value.z);
            // a camera put somewhere by hand is a cut, not a move: nothing of the last stop's lens comes with it
            if (manual) apertureNow = 0;
            const k = dt > 0 ? 1 - Math.exp(-dt * 2.2) : 1;
            focusNow += (1 / dist - focusNow) * k; apertureNow += (ap - apertureNow) * k;
            uFocus.value.set(focusNow, apertureNow);
            // with the lens shut there is nothing to blur: the gather is not run at all
            dofBlur.autoUpdate = apertureNow > 0.0004;
        }
    };
    // compiles the scene's pipelines for this pass without blocking the thread
    const compile = () => scenePass.compileAsync(renderer);
    return { pipeline, update, uExposure, uWarm, uFocus, compile, render: () => pipeline.render() };
}
