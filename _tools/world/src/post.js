// The picture after the scene is drawn: bloom on what is truly bright, shafts
// of light when the sun itself is in view, a grade, the film curve, and a
// little vignette and grain in display space.
import * as THREE from 'three/webgpu';
import {
    Fn, pass, uniform, vec2, vec3, vec4, float, mix, smoothstep, max, min, clamp, dot, pow, length, screenUV, renderOutput, Loop, saturate, texture, time, fract, sin,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export function createPost({ renderer, scene, camera, quality, atmosphere }) {
    const pipeline = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera, { samples: quality.msaa > 1 ? quality.msaa : 0 });
    const color = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');

    const uSunUV = uniform(new THREE.Vector2(0.5, 0.5));
    const uShafts = uniform(0);                    // 0 when the sun is behind the camera
    const uExposure = uniform(1.0);
    const uWarm = uniform(new THREE.Vector3(1.06, 1.0, 0.92));

    let hdr = color.rgb;

    if (quality.post >= 2) {
        // radial light shafts: how much open sky lies between this pixel and the sun
        const shafts = Fn(() => {
            const acc = float(0).toVar();
            const N = 28;
            const step = uSunUV.sub(screenUV).div(N).mul(0.92);
            const p = vec2(screenUV).toVar();
            const w = float(1).toVar();
            Loop(N, () => {
                p.addAssign(step);
                const q = clamp(p, 0.001, 0.999);
                const sky = smoothstep(0.99995, 1.0, texture(depth, q).r);
                const lum = dot(texture(color, q).rgb, vec3(0.3, 0.5, 0.2));
                acc.addAssign(sky.mul(min(lum, 6.0)).mul(w));
                w.mulAssign(0.955);
            });
            const fall = smoothstep(1.25, 0.1, length(uSunUV.sub(screenUV).mul(vec2(1.6, 1.0))));
            return atmosphere.uSunColor.mul(acc.div(N)).mul(fall).mul(uShafts).mul(0.0045);
        });
        hdr = hdr.add(shafts());
    }
    if (quality.post >= 1) {
        const glow = bloom(vec4(hdr, 1), quality.post >= 2 ? 0.32 : 0.25, 0.55, 4.5);
        hdr = hdr.add(glow.rgb);
    }

    // grade in scene-linear light, then the film curve
    const graded = Fn(() => {
        const c = vec3(hdr).mul(uExposure).mul(uWarm).toVar();
        const l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c.assign(mix(vec3(l), c, 1.04));
        // lift nothing, but give shadows a cool cast and highlights a warm one
        const tone = smoothstep(0.0, 1.4, l);
        c.mulAssign(mix(vec3(0.94, 0.99, 1.07), vec3(1.05, 1.0, 0.94), tone));
        return c;
    })();
    const mapped = renderOutput(vec4(graded, 1), renderer.toneMapping, renderer.outputColorSpace);
    const final = Fn(() => {
        const c = vec3(mapped.rgb).toVar();
        const d = length(screenUV.sub(0.5).mul(vec2(1.0, 0.82)));
        c.mulAssign(mix(1.0, 0.86, smoothstep(0.45, 0.98, d)));
        // contrast with a soft shoulder, in display space
        c.assign(mix(c, c.mul(c).mul(float(3).sub(c.mul(2))), 0.3));
        const n = fract(sin(dot(screenUV.mul(vec2(1920, 1080)).add(time.mul(60).floor().mul(7.1)), vec2(12.9898, 78.233))).mul(43758.5453));
        c.addAssign(n.sub(0.5).mul(0.012));
        return vec4(saturate(c), 1);
    })();
    pipeline.outputColorTransform = false;
    pipeline.outputNode = final;

    const v = new THREE.Vector3(), f = new THREE.Vector3();
    const update = (sunDir, shade = 1) => {
        // where the sun is on screen, and whether it is in front of the lens at all
        v.copy(camera.position).addScaledVector(sunDir, 1e5).project(camera);
        camera.getWorldDirection(f);
        const facing = f.dot(sunDir);
        uSunUV.value.set(v.x * 0.5 + 0.5, renderer.backend && renderer.backend.isWebGPUBackend ? 0.5 - v.y * 0.5 : 0.5 - v.y * 0.5);
        const onScreen = Math.max(0, 1 - Math.max(0, Math.max(Math.abs(v.x), Math.abs(v.y)) - 1) / 0.8);
        uShafts.value = facing > 0.05 ? Math.min(1, (facing - 0.05) * 4) * onScreen : 0;
        // looking into the sun, the eye (and the camera) stops down
        const want = (1 - 0.34 * Math.min(1, Math.max(0, (facing - 0.35) / 0.55)) * onScreen) * (1 + 1.0 * (1 - shade));
        uExposure.value += (want - uExposure.value) * 0.06;
    };
    // compiles the scene's pipelines for this pass without blocking the thread
    const compile = () => scenePass.compileAsync(renderer);
    return { pipeline, update, uExposure, uWarm, compile, render: () => pipeline.render() };
}
