// Entry point of /js/world.js: builds the island and runs it.
//
//   const world = await createWorld({ canvas, tier, apps, onProgress });
//   world.start();
//   world.setProgress(2.4);     // scroll-bound: between the third and fourth stops
//   world.flyTo(5);             // glide to a stop
import * as THREE from 'three/webgpu';
import { positionWorld } from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { TIERS, ORDER } from './quality.js';
import { createIsland, SITES, WORLD } from './island.js';
import { makeRockTexture, makeGroundTexture, makeNoiseTexture, makeWaterTexture } from './textures.js';
import { createAtmosphere } from './atmosphere.js';
import { createTerrain } from './terrain.js';
import { createWater } from './water.js';
import { definePlaces } from './places.js';
import { createFlora } from './flora.js';
import { createFauna } from './fauna.js';
import { createProps } from './props.js';
import { createDirector } from './director.js';
import { createPost } from './post.js';

const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

export async function createWorld({ canvas, tier = 'high', forceWebGL = false, onProgress = () => {}, apps = [], flags = {}, onStop = () => {} } = {}) {
    const q = TIERS[tier] || TIERS.high;
    const say = async (label, p) => { onProgress(label, p); await nextFrame(); };

    await say('Waking the renderer', 0.02);
    const usePost = q.post > 0 && !flags.nopost;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: !usePost && q.msaa > 1, samples: !usePost && q.msaa > 1 ? q.msaa : 0, forceWebGL, powerPreference: 'high-performance' });
    await renderer.init();
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 0.36;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 14000);

    // ---- island
    const island = createIsland(q.islandN);
    const ROWS = 48;
    for (let r = 0; r < island.N; r += ROWS) {
        island.fillRows(r, Math.min(island.N, r + ROWS));
        if ((r / ROWS) % 3 === 0) await say('Raising the island', 0.05 + 0.4 * (r / island.N));
    }
    await say('Weathering the rock', 0.46);
    // the camp belongs on the beach, wherever the coast turned out to be: walk south to the tide line
    { const c = island.findLevel(150, 470, 0, 1, 3.1, 700, 2); SITES.contact.x = c[0]; SITES.contact.z = c[1]; }
    island.finish();

    await say('Mixing pigments', 0.56);
    const rockTex = makeRockTexture(q.texSize);
    const groundTex = makeGroundTexture(q.texSize);
    await say('Mixing pigments', 0.62);
    const noiseTex = makeNoiseTexture(256);
    const waterTex = makeWaterTexture(q.texSize);

    // ---- light
    await say('Lighting the sky', 0.66);
    const sunDir = new THREE.Vector3(-0.86, 0.3, -0.36).normalize();
    const atmosphere = createAtmosphere({ sunDir, noiseTex, quality: q });
    scene.add(atmosphere.dome);
    scene.fogNode = atmosphere.fogNode;
    scene.environment = atmosphere.env.tex;
    scene.environmentIntensity = 0.9;
    // What reaches ground the sun does not: blue from the whole sky above, warm green-brown
    // bounced off the land below. Without it a shadow is a hole.
    {
        const si = atmosphere.env.skyIrradiance, ti = atmosphere.env.irradiance;
        const sky = new THREE.Color(si[0], si[1], si[2]), bounce = new THREE.Color(ti[0] * 0.2, ti[1] * 0.19, ti[2] * 0.12);
        const hemi = new THREE.HemisphereLight(sky, bounce, 0.85);
        scene.add(hemi);
    }

    const terrain = createTerrain({ island, rockTex, groundTex, noiseTex, atmosphere, quality: q, sunDir });
    scene.add(terrain.group);

    const sun = new THREE.DirectionalLight(0xffffff, 1);
    // light.colorNode replaces color * intensity: sunlight, minus what the hills block far away
    // (a hill's shadow never takes all of it: light scattered in the haze still gets in)
    sun.colorNode = atmosphere.uSunColor.mul(terrain.sunVisAt(positionWorld.xz).mul(0.86).add(0.14)).mul(atmosphere.cloudShadow(positionWorld));
    sun.castShadow = true;
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.35;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 3000;
    const csm = new CSMShadowNode(sun, { cascades: q.cascades, maxFar: q.shadowFar, mode: 'practical', lightMargin: 600 });
    csm.fade = true;
    sun.shadow.shadowNode = csm;
    scene.add(sun); scene.add(sun.target);

    const water = createWater({ waterTex, terrain, atmosphere, quality: q });
    scene.add(water.mesh);

    const places = definePlaces(island);
    await say('Setting the scene', 0.72);
    const props = createProps({ island, places, quality: q, atmosphere, terrain, noiseTex, rockTex, apps });
    scene.add(props.group);
    await say('Planting the forest', 0.78);
    const flora = createFlora({ island, places, quality: q, atmosphere, terrain, noiseTex, rockTex, keepClear: props.clear, bare: !!flags.bare });
    scene.add(flora.group);
    await say('Waking the animals', 0.88);
    const fauna = createFauna({ island, places, quality: q, noiseTex, groundTex, sites: SITES });
    scene.add(fauna.group);

    const director = createDirector({ camera, places, island, onStop: (i, instant) => { fauna.setRex(i); onStop(i, places[i].id, instant); } });
    const post = usePost ? createPost({ renderer, scene, camera, quality: q, atmosphere }) : null;

    // ---- frame
    let width = 0, height = 0, pixelScale = 1, manual = null;
    const resize = () => {
        const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
        if (!w || !h) return;
        const dpr = Math.min(globalThis.devicePixelRatio || 1, q.maxDpr);
        const want = Math.sqrt(Math.min(1, q.maxPixels / (w * h * dpr * dpr))) * dpr * pixelScale;
        if (w === width && h === height && Math.abs(renderer.getPixelRatio() - want) < 1e-3) return;
        width = w; height = h;
        renderer.setPixelRatio(want);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        director.setAspect(w / h);
    };

    // Holds the frame rate by trading resolution: below 45 fps the picture gets
    // smaller, above 57 it grows back. `perf.struggling` tells the page when even
    // the smallest picture cannot keep up.
    const perf = { fps: 60, scale: 1, struggling: false, frames: 0, failed: null, warm: false };
    let quick = 0;
    // A graphics error after start-up (a browser whose WebGPU differs from the ones this was built on)
    // must not leave a broken picture over the page: flag it, stop, and let the page fall back.
    const fail = (e) => { if (perf.failed) return; perf.failed = String((e && (e.message || e.reason)) || e); perf.struggling = true; try { renderer.setAnimationLoop(null); } catch (x) { /* already stopped */ } };
    if (renderer.backend && renderer.backend.device && renderer.backend.device.addEventListener) renderer.backend.device.addEventListener('uncapturederror', (ev) => fail(ev.error));
    let accT = 0, accN = 0, slow = 0;
    const tune = (dt) => {
        accT += dt; accN++;
        if (accT < 1.2) return;
        perf.fps = accN / accT; accT = 0; accN = 0; perf.frames++;
        if (perf.frames < 3 || flags.fixed) return;          // let shaders compile first
        if (perf.fps < 45 && pixelScale > 0.5) { pixelScale = Math.max(0.5, pixelScale * (perf.fps < 30 ? 0.78 : 0.9)); width = 0; }
        else if (perf.fps > 57 && pixelScale < 1) { pixelScale = Math.min(1, pixelScale * 1.06); width = 0; }
        slow = perf.fps < 22 && pixelScale <= 0.5 ? slow + 1 : 0;
        perf.struggling = slow >= 3;
        perf.scale = pixelScale;
    };

    let last = performance.now(), clockT = 0, running = false, frozen = false;
    const target = new THREE.Vector3(), _dir = new THREE.Vector3();
    const frame = () => {
        const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (!frozen) clockT += dt;
        resize();
        if (manual) { camera.position.copy(manual.pos); camera.lookAt(manual.look); } else director.update(dt, clockT);
        camera.updateMatrixWorld();
        atmosphere.dome.position.copy(camera.position);
        atmosphere.dome.scale.setScalar(camera.far * 0.9);
        terrain.update(camera);
        water.update(camera);
        flora.update(camera);
        fauna.update(clockT, frozen ? 0 : dt, camera);
        props.update(clockT, frozen ? 0 : dt, camera);
        sun.target.position.copy(camera.position);
        sun.position.copy(camera.position).addScaledVector(sunDir, 1500);
        if (post) {
            // how much of what the lens sees lies in the long shadow of a hill: here, and where it is pointed
            camera.getWorldDirection(_dir);
            const sh = 0.4 * terrain.shadeAt(camera.position.x, camera.position.z) + 0.6 * terrain.shadeAt(camera.position.x + _dir.x * 140, camera.position.z + _dir.z * 140);
            post.update(sunDir, sh); post.render();
        } else renderer.render(scene, camera);
        if (running) {
            tune(dt);
            // warm once a run of frames has come in on time
            if (!perf.warm) { quick = dt < 0.05 ? quick + 1 : 0; if (quick >= 24) perf.warm = true; }
        }
    };

    await say('First light', 0.92);
    resize();
    frame();
    // Visit every stop once, unseen, so each one's shaders are compiled before anyone flies there,
    // and let the GPU finish that work: the first thing a visitor sees should already be smooth.
    for (let i = 0; i < places.length; i++) {
        director.jumpTo(i); frame();
        await say('Walking the island', 0.92 + 0.07 * ((i + 1) / places.length));
    }
    director.jumpTo(0); frame();
    try { const dev = renderer.backend && renderer.backend.device; if (dev && dev.queue && dev.queue.onSubmittedWorkDone) await dev.queue.onSubmittedWorkDone(); } catch (e) { /* not WebGPU */ }
    await say('Ready', 1);

    const world = {
        renderer, scene, camera, island, atmosphere, terrain, water, sun, quality: q, SITES, places, flora, fauna, props, director, perf,
        backend: renderer.backend && renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2',
        frame,
        start() { if (running || perf.failed) return; running = true; last = performance.now(); renderer.setAnimationLoop(() => { try { frame(); } catch (e) { fail(e); } }); },
        stop() { running = false; renderer.setAnimationLoop(null); },
        get running() { return running; },
        // travel
        setProgress(v) { manual = null; director.setProgress(v); },
        flyTo(i) { manual = null; return director.flyTo(i); },
        jumpTo(i) { manual = null; director.jumpTo(i); },
        setMotion(m) { director.setMotion(m); },
        setPointer(x, y) { director.setPointer(x, y); },
        // the places' own controls
        pressKey: (ch) => props.pressKey(ch),
        pop: (x, y) => props.pop(x, y, camera),
        balloonsLeft: () => props.balloonsLeft(),
        hoverApp: (id) => props.hoverEgg(id),
        setActivity: (v) => props.setActivity(v),
        setFire: (v) => props.setFire(v),
        // development and stills
        setView(px, py, pz, tx, ty, tz) { manual = { pos: new THREE.Vector3(px, py, pz), look: new THREE.Vector3(tx, ty, tz) }; },
        setPlace(i) { manual = null; director.setMotion(0); director.jumpTo(i); return places[i].id; },
        freeze(t) { frozen = true; if (t !== undefined) clockT = t; },
        setJourney(i, j, u) { const v = director.preview(i, j, u); manual = v; },
        specimens(x, z, dx, dz) { return flora.specimens(x, z, dx, dz); },
        info() { const r = renderer.info.render; return { calls: r.drawCalls, tris: r.triangles, fps: +perf.fps.toFixed(1), scale: +perf.scale.toFixed(2), flora: flora.stats, fauna: fauna.stats }; },
        dispose() { world.stop(); renderer.dispose(); },
    };
    return world;
}

export { TIERS, ORDER, SITES, WORLD };
