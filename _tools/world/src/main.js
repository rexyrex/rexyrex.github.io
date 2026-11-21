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
import { definePlaces, STOPS } from './places.js';
import { createFootprints } from './footprint.js';
import { createFlora } from './flora.js';
import { createFauna } from './fauna.js';
import { createProps } from './props.js';
import { createScenes } from './scenes.js';
import { createDirector } from './director.js';
import { createPost } from './post.js';
import { loadPhotos } from './photos.js';
import { createSunlight } from './light.js';
import { createCover } from './cover.js';
import { createMotes, setPixel } from './fx.js';
import { time as islandClock } from './tsl.js';

const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

export async function createWorld({ canvas, tier = 'high', forceWebGL = false, onProgress = () => {}, apps = [], flags = {}, onStop = () => {}, assets = '/assets/island/tex/' } = {}) {
    // (`flags.q` overrides single fields of the tier, for measuring what each one costs)
    const q = { ...(TIERS[tier] || TIERS.high), ...(flags.q || {}) };
    const say = async (label, p) => { onProgress(label, p); await nextFrame(); };

    await say('Waking the renderer', 0.02);
    // the photographs come down while the island is being raised
    const photosP = loadPhotos({ base: assets, size: flags.nophoto ? 0 : q.photo }).catch(() => ({ flora: null, ground: null, skin: null }));
    const usePost = q.post > 0 && !flags.nopost;
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: !usePost && q.msaa > 1, samples: !usePost && q.msaa > 1 ? q.msaa : 0, forceWebGL, powerPreference: 'high-performance' });
    await renderer.init();
    const pipes = { sync: 0, async: 0, labels: {} };
    if (flags.trace && renderer.backend.device) { const dv = renderer.backend.device, s0 = dv.createRenderPipeline.bind(dv), a0 = dv.createRenderPipelineAsync.bind(dv); dv.createRenderPipeline = (d) => { pipes.sync++; const k = String(d.label || '?').replace(/_?\d+$/, ''); pipes.labels[k] = (pipes.labels[k] || 0) + 1; return s0(d); }; dv.createRenderPipelineAsync = (d) => { pipes.async++; return a0(d); }; }
    // (the filmic curve keeps the colour of the sky, the water and the lava where a flatter one greys them)
    renderer.toneMapping = flags.tm === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
    // (with no grade to open the shadows, the smallest tier is simply exposed a little more)
    renderer.toneMappingExposure = flags.exp || (usePost ? 0.3 : 0.4);
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
    const atmosphere = createAtmosphere({ sunDir, noiseTex, quality: q, salt: +flags.salt || 0 });
    scene.add(atmosphere.dome);
    scene.fogNode = atmosphere.fogNode;
    scene.environment = atmosphere.env.tex;
    scene.environmentIntensity = 0.9;
    // What reaches ground the sun does not: blue from the whole sky above, warm green-brown
    // bounced off the land below. Without it a shadow is a hole.
    let hemi;
    {
        const si = atmosphere.env.skyIrradiance, ti = atmosphere.env.irradiance;
        const sky = new THREE.Color(si[0], si[1], si[2]), bounce = new THREE.Color(ti[0] * 0.2, ti[1] * 0.19, ti[2] * 0.12);
        hemi = new THREE.HemisphereLight(sky, bounce, 1.0);
        scene.add(hemi);
        // And what comes back off the sea and the sunlit land on the far side: low, warm, weak, from opposite
        // the sun. It casts no shadow; it is there so that a flank turned away from the sun still has a shape.
        const fill = new THREE.DirectionalLight(new THREE.Color(ti[0] * 0.2, ti[1] * 0.17, ti[2] * 0.12), 1.0);
        fill.position.set(-sunDir.x, 0.3, -sunDir.z).normalize(); fill.castShadow = false;
        scene.add(fill); scene.add(fill.target);
    }

    await say('Developing the photographs', 0.68);
    const photos = await photosP;
    // (what stands on the ground is not known yet, but the ground's shader needs the map it will be drawn into)
    const footprints = createFootprints({ island, count: STOPS });
    const terrain = createTerrain({ island, rockTex, groundTex, noiseTex, atmosphere, quality: q, sunDir, photo: photos.ground, footprints });
    scene.add(terrain.group);

    const sun = new THREE.DirectionalLight(0xffffff, 1);
    // light.colorNode replaces color * intensity: sunlight, minus what the hills and clouds block, let
    // through gaps in the canopy, and gathered into a bright net under water: see light.js)
    const sunlight = createSunlight({ atmosphere, terrain, island, noiseTex, quality: q, world: WORLD });
    sun.colorNode = sunlight.colorNode(positionWorld);
    sun.castShadow = true;
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = +flags.nbias || 0.35;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 3000;
    const csm = new CSMShadowNode(sun, { cascades: q.cascades, maxFar: q.shadowFar, mode: 'practical', lightMargin: 600 });
    csm.fade = true;
    sun.shadow.shadowNode = csm;
    scene.add(sun); scene.add(sun.target);

    const water = createWater({ waterTex, terrain, atmosphere, quality: q, sunlight });
    scene.add(water.mesh);

    const places = definePlaces(island);
    footprints.place(places);
    await say('Setting the scene', 0.72);
    const props = createProps({ island, places, quality: q, atmosphere, terrain, noiseTex, rockTex, skyLights: [sun, hemi] });
    scene.add(props.group);
    const scenes = createScenes({ island, places, quality: q, atmosphere, terrain, noiseTex, rockTex, water, apps, skyLights: [sun, hemi], lava: props.lava, footprints });
    scene.add(scenes.group);
    await say('Planting the forest', 0.78);
    const flora = createFlora({ island, places, quality: q, atmosphere, terrain, noiseTex, rockTex, keepClear: props.clear.concat(scenes.clear), bare: !!flags.bare, photo: photos.flora, sunlight, footprints });
    scene.add(flora.group);
    sunlight.bakeCanopy(places.filter((p) => !p.aerial).map((p) => [p.site.x, p.site.z, 16, 38]));
    await say('Waking the animals', 0.88);
    const fauna = createFauna({ island, places, quality: q, noiseTex, groundTex, sites: SITES, shadowNormalBias: sun.shadow.normalBias });
    scene.add(fauna.group);
    scenes.attach(fauna);
    await say('Carving the stones', 0.89);
    await scenes.ready;
    // the low green over everything; it grows round whatever has been stood on the ground, so it comes last
    footprints.mask([props.group, scenes.group], [[SITES.contact.x, SITES.contact.z, 1.3]]);
    const cover = createCover({ island, quality: flags.nocover ? { ...q, blades: 0 } : q, atmosphere, terrain, noiseTex, footprints });
    scene.add(cover.group);
    // and what drifts in the air over it
    const motes = createMotes({ quality: q, atmosphere, sunlight, island });
    scene.add(motes.group);

    const director = createDirector({ camera, places, island, onStop: (i, instant) => { fauna.setRex(i); onStop(i, places[i].id, instant); } });
    const post = usePost ? createPost({ renderer, scene, camera, quality: q, atmosphere, sunlight, director }) : null;

    // ---- frame
    let width = 0, height = 0, pixelScale = 1, manual = null;
    const resize = () => {
        const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
        if (w < 16 || h < 16) return;                         // hidden, or mid-collapse: nothing a pass could be sized for
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
    const baseExposure = renderer.toneMappingExposure; let evNow = 0;
    const frame = () => {
        const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (!frozen) clockT += dt;
        islandClock.value = clockT;
        resize();
        if (manual) { camera.position.copy(manual.pos); camera.lookAt(manual.look); } else director.update(dt, clockT);
        camera.updateMatrixWorld();
        atmosphere.dome.position.copy(camera.position);
        atmosphere.dome.scale.setScalar(camera.far * 0.9);
        terrain.update(camera);
        water.update(camera);
        flora.update(camera);
        footprints.update(camera); cover.update(camera);
        motes.update(camera); setPixel(camera, renderer);
        scenes.update(clockT, frozen ? 0 : dt, camera);
        footprints.refresh();
        if (props.lava) terrain.uLava.value.set(props.lava.y, 2.4 * (0.45 + 0.55 * props.uActivity.value));
        fauna.update(clockT, frozen ? 0 : dt, camera);
        props.update(clockT, frozen ? 0 : dt, camera);
        sun.target.position.copy(camera.position);
        sun.position.copy(camera.position).addScaledVector(sunDir, 1500);
        sunlight.update(renderer, camera);
        if (post) {
            // how much of what the lens sees lies in the long shadow of a hill: here, and where it is pointed
            camera.getWorldDirection(_dir);
            const sh = 0.4 * terrain.shadeAt(camera.position.x, camera.position.z) + 0.6 * terrain.shadeAt(camera.position.x + _dir.x * 140, camera.position.z + _dir.z * 140);
            post.update(sunDir, sh, frozen ? 0 : dt, !!manual); post.render();
        } else {
            // (no grade on this path: the stop's own exposure goes straight to the film curve)
            const settled = !manual && !director.flying && Math.abs(director.progress - Math.round(director.progress)) < 0.04;
            evNow += ((settled ? director.lensOf(director.stop)[2] || 0 : 0) - evNow) * 0.06;
            renderer.toneMappingExposure = baseExposure * Math.pow(2, evNow);
            renderer.render(scene, camera);
        }
        if (running) {
            tune(dt);
            // warm once a run of frames has come in on time
            if (!perf.warm) { quick = dt < 0.05 ? quick + 1 : 0; if (quick >= 24) perf.warm = true; }
        }
    };

    await say('First light', 0.9);
    resize();
    // Every stop's shaders are compiled before anyone sees the world: first off the main thread where the
    // renderer can do that (so the loading screen stays alive), then by drawing each stop once, unseen,
    // which also warms shadows and the post chain. Then the GPU is given time to finish.
    const pose = (i) => {
        director.jumpTo(i); director.update(0, clockT); camera.updateMatrixWorld();
        atmosphere.dome.position.copy(camera.position); atmosphere.dome.scale.setScalar(camera.far * 0.9);
        terrain.update(camera); water.update(camera); flora.update(camera); footprints.update(camera); cover.update(camera); motes.update(camera); scenes.update(clockT, 0, camera); fauna.update(clockT, 0, camera); props.update(clockT, 0, camera);
    };
    if (post && post.compile && !flags.syncwarm) {
        // First everything at once, hidden or not, in view or not: anything left out here would be
        // compiled the moment it first shows, and that stalls the whole browser, loading screen included.
        {
            const hidden = [], culled = [];
            // (only what is drawn: showing a hidden light would change the lighting every shader is built for)
            for (const g of [flora.group, fauna.group, props.group, scenes.group]) g.traverse((o) => { if (o.isLight) return; if (!o.visible) { hidden.push(o); o.visible = true; } if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
            const t0 = performance.now();
            try { await post.compile(); } catch (e) { /* the stops below still get their turn */ }
            for (const o of hidden) o.visible = false; for (const o of culled) o.frustumCulled = true;
            if (flags.trace) console.warn('warm everything', Math.round(performance.now() - t0), 'async', pipes.async);
            await say('Walking the island', 0.9);
        }
        for (let i = 0; i < places.length; i++) {
            pose(i);
            const t0 = performance.now();
            try { await post.compile(); } catch (e) { break; }
            if (flags.trace) console.warn('warm async', places[i].id, Math.round(performance.now() - t0));
            await say('Walking the island', 0.9 + 0.05 * ((i + 1) / places.length));
        }
    }
    for (let i = 0; i < places.length; i++) {
        const t0 = performance.now();
        director.jumpTo(i); frame();
        if (flags.trace) { console.warn('warm frame', places[i].id, Math.round(performance.now() - t0), 'sync', pipes.sync, 'async', pipes.async, JSON.stringify(pipes.labels)); pipes.labels = {}; }
        await say('Walking the island', 0.95 + 0.04 * ((i + 1) / places.length));
    }
    { const t0 = performance.now(); director.jumpTo(0); frame(); if (flags.trace) console.warn('warm last', Math.round(performance.now() - t0)); }
    try { const t0 = performance.now(); const dev = renderer.backend && renderer.backend.device; if (dev && dev.queue && dev.queue.onSubmittedWorkDone) await dev.queue.onSubmittedWorkDone(); if (flags.trace) console.warn('warm gpu', Math.round(performance.now() - t0)); } catch (e) { /* not WebGPU */ }
    if (flags.trace) console.warn('pipelines', JSON.stringify(pipes));
    await say('Ready', 1);

    const world = {
        renderer, scene, camera, island, atmosphere, terrain, water, sun, sunlight, cover, quality: q, SITES, places, flora, fauna, props, scenes, director, perf, photos: { flora: !!photos.flora, ground: !!photos.ground, skin: !!photos.skin },
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
        setFrame(y, now) { director.setFrame(y, now); },
        // the places' own controls
        pressKey: (ch) => props.pressKey(ch),
        pop: (x, y) => props.pop(x, y, camera),
        balloonsLeft: () => props.balloonsLeft(),
        hoverApp: (id) => scenes.hoverApp(id),
        setActivity: (v) => props.setActivity(v),
        setFire: (v) => props.setFire(v),
        // development and stills
        setView(px, py, pz, tx, ty, tz) { manual = { pos: new THREE.Vector3(px, py, pz), look: new THREE.Vector3(tx, ty, tz) }; },
        setPlace(i) { manual = null; director.setMotion(0); director.jumpTo(i); return places[i].id; },
        freeze(t) { frozen = true; if (t !== undefined) clockT = t; },
        thaw() { frozen = false; },
        // for stills: let the clock run from one moment to another (so what is thrown, knocked or sprayed is in flight), then hold it
        play(from, to) { clockT = from; frozen = false; return new Promise((done) => { const tick = () => { if (clockT >= to) { frozen = true; clockT = to; done(to); } else setTimeout(tick, 16); }; tick(); }); },
        setJourney(i, j, u) { const v = director.preview(i, j, u); manual = v; },
        specimens(x, z, dx, dz) { return flora.specimens(x, z, dx, dz); },
        info() { const r = renderer.info.render; return { calls: r.drawCalls, tris: r.triangles, fps: +perf.fps.toFixed(1), scale: +perf.scale.toFixed(2), flora: flora.stats, fauna: fauna.stats, cover: cover.stats }; },
        dispose() { world.stop(); renderer.dispose(); },
    };
    return world;
}

export { TIERS, ORDER, SITES, WORLD };
