/* Hero particles: the rex mascot as a point cloud.
   Samples the opaque pixels (and their colours) of /assets/rexGreenSmall.png
   and renders them as ~7k points with Three.js on the fixed #heroCanvas.

   Timeline, driven by window.rexHero (written by /js/landing.js):
     load            scattered cloud  →  assembles into the rex
     t 0.00–0.60     the rex holds its spot, turns, drifts to the screen centre
     t 0.60–1.00     collapses into a single dot ("…by one developer")
     burst 0.00–1.00 (the statement is pinned) charges, then bursts outward
                     with a swirl and fades; rendering pauses at 1

   `three` resolves through the import map in index.html. Reports back
   with the rexhero:ready / rexhero:failed events so the page can show
   the plain PNG when WebGL or the CDN is unavailable. */
import * as THREE from 'three';

const state = window.rexHero || (window.rexHero = { t: 0, burst: 0, excite: 0, ready: false, failed: false });
const canvas = document.getElementById('heroCanvas');
const visual = document.getElementById('heroVisual');
const root = document.documentElement;

const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const saveData = !!(navigator.connection && navigator.connection.saveData);

function fail(reason) {
    state.failed = true;
    state.ready = false;
    document.dispatchEvent(new CustomEvent('rexhero:failed', { detail: String(reason) }));
}

function webglAvailable() {
    try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) {
        return false;
    }
}

if (!canvas || !visual || reduce || saveData || root.classList.contains('motion-off') || !webglAvailable()) {
    fail('disabled');
} else {
    boot().catch((err) => {
        console.warn('[rex particles]', err);
        fail((err && err.message) || err);
    });
}

/* ---------- Helpers ------------------------------------------------ */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInQuad = (x) => x * x;

function prng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image failed: ' + src));
        img.src = src;
    });
}

// Opaque pixels of the mascot: [x, y, r, g, b] per pixel.
function samplePixels(img) {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const px = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            if (data[i + 3] > 120) px.push(x, y, data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
        }
    }
    return { size, px, count: px.length / 5 };
}

/* ---------- Shaders ------------------------------------------------ */

const vertexShader = /* glsl */ `
attribute vec3 aTo;
attribute vec3 aColor;
attribute float aSeed;
uniform float uMix;
uniform float uTime;
uniform float uSize;
uniform float uExcite;
uniform float uPixelRatio;
uniform float uFocal;
uniform float uDrift;
uniform float uSwirl;
varying vec3 vColor;

void main() {
    // Each point starts its move a little later than the last one.
    float delay = aSeed * 0.45;
    float m = smoothstep(delay, delay + 0.55, uMix);
    vec3 p = mix(position, aTo, m);

    float arc = m * (1.0 - m);
    float ph = aSeed * 6.28318;

    // idle breathing
    p += vec3(sin(uTime * 0.9 + ph), cos(uTime * 0.7 + ph * 1.7), sin(uTime * 0.5 + ph * 0.6)) * uDrift;
    // swirl while in transit
    p += vec3(cos(ph * 3.0 + uTime * 0.5), sin(ph * 5.0 - uTime * 0.5), cos(ph * 7.0)) * arc * uSwirl;
    // buzz while the rex is being held
    p += vec3(sin(uTime * 23.0 + ph * 9.0), cos(uTime * 19.0 + ph * 7.0), sin(uTime * 17.0 + ph * 5.0)) * uExcite * 7.0;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (uFocal / max(1.0, -mv.z));
    vColor = aColor;
}
`;

const fragmentShader = /* glsl */ `
uniform float uOpacity;
uniform float uTint;
varying vec3 vColor;

void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c);
    if (r2 > 0.25) discard;
    float a = smoothstep(0.25, 0.06, r2);
    gl_FragColor = vec4(vColor * uTint, a * uOpacity);
}
`;

/* ---------- Scene -------------------------------------------------- */

async function boot() {
    const img = await loadImage('/assets/rexGreenSmall.png');
    const sample = samplePixels(img);
    if (sample.count < 100) throw new Error('mascot has no opaque pixels');

    const BUDGET = coarse ? 3400 : 7000;
    const N = Math.min(BUDGET, sample.count);
    const rnd = prng(20260908);

    // Random subset of the mascot's pixels (Fisher–Yates on an index list).
    const idx = new Uint32Array(sample.count);
    for (let i = 0; i < sample.count; i++) idx[i] = i;
    for (let i = sample.count - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }

    // Per-point constants: colour, seed, sub-pixel jitter, random direction/radii.
    const colors = new Float32Array(N * 3);
    const seeds = new Float32Array(N);
    const jitter = new Float32Array(N * 3);
    const dirs = new Float32Array(N * 3);
    const rad1 = new Float32Array(N);
    const rad2 = new Float32Array(N);
    for (let k = 0; k < N; k++) {
        const p = idx[k] * 5;
        colors[k * 3] = sample.px[p + 2];
        colors[k * 3 + 1] = sample.px[p + 3];
        colors[k * 3 + 2] = sample.px[p + 4];
        seeds[k] = rnd();
        jitter[k * 3] = rnd();
        jitter[k * 3 + 1] = rnd();
        jitter[k * 3 + 2] = rnd() - 0.5;
        // uniform direction on the sphere
        const u = rnd() * 2 - 1;
        const phi = rnd() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        dirs[k * 3] = s * Math.cos(phi);
        dirs[k * 3 + 1] = s * Math.sin(phi);
        dirs[k * 3 + 2] = u;
        rad1[k] = Math.cbrt(rnd());
        rad2[k] = rnd();
    }

    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const FOV = 35;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);
    const group = new THREE.Group();
    scene.add(group);

    const fromArr = new Float32Array(N * 3);
    const toArr = new Float32Array(N * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(fromArr, 3));
    geometry.setAttribute('aTo', new THREE.BufferAttribute(toArr, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const baseSize = coarse ? 2.6 : 2.4;
    const uniforms = {
        uMix: { value: 0 },
        uTime: { value: 0 },
        uSize: { value: baseSize },
        uExcite: { value: 0 },
        uOpacity: { value: 1 },
        uTint: { value: 1 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uFocal: { value: 1 },
        uDrift: { value: 1.2 },
        uSwirl: { value: 40 }
    };
    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.NormalBlending
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);

    // The sampled greens are lifted for dark surfaces; on the light theme
    // the cloud is darkened a little so it keeps its contrast.
    function syncTint() {
        const theme = root.getAttribute('data-theme')
            || ((window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark');
        uniforms.uTint.value = theme === 'light' ? 0.74 : 1;
    }
    syncTint();
    document.addEventListener('rex:theme', syncTint);
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: light)');
        if (mq.addEventListener) mq.addEventListener('change', syncTint);
    }

    /* Shapes — rebuilt on resize because the rex is sized to the hero box. */
    const shapes = { cloud: new Float32Array(N * 3), rex: new Float32Array(N * 3), dot: new Float32Array(N * 3), burst: new Float32Array(N * 3) };
    let S = 300;

    function buildShapes() {
        const rect = visual.getBoundingClientRect();
        S = Math.max(160, Math.min(rect.width, rect.height) * 0.92);
        const scale = S / sample.size;
        const half = sample.size / 2;
        for (let k = 0; k < N; k++) {
            const p = idx[k] * 5;
            const i3 = k * 3;
            shapes.rex[i3] = (sample.px[p] + jitter[i3] - half) * scale;
            shapes.rex[i3 + 1] = (half - (sample.px[p + 1] + jitter[i3 + 1])) * scale;
            shapes.rex[i3 + 2] = jitter[i3 + 2] * S * 0.14;

            const rc = S * 0.95 * rad1[k];
            shapes.cloud[i3] = dirs[i3] * rc;
            shapes.cloud[i3 + 1] = dirs[i3 + 1] * rc;
            shapes.cloud[i3 + 2] = dirs[i3 + 2] * rc;

            const rd = 1.6 * rad2[k];
            shapes.dot[i3] = dirs[i3] * rd;
            shapes.dot[i3 + 1] = dirs[i3 + 1] * rd;
            shapes.dot[i3 + 2] = dirs[i3 + 2] * rd;

            const rb = S * 1.8 + rad2[k] * S * 3.4;
            shapes.burst[i3] = dirs[i3] * rb;
            shapes.burst[i3 + 1] = dirs[i3 + 1] * rb;
            shapes.burst[i3 + 2] = dirs[i3 + 2] * rb * 1.5;
        }
    }

    const SEGMENTS = {
        rex: ['cloud', 'rex'],
        collapse: ['rex', 'dot'],
        burst: ['dot', 'burst']
    };
    let segment = null;

    function setSegment(name, force) {
        if (segment === name && !force) return;
        segment = name;
        const pair = SEGMENTS[name];
        fromArr.set(shapes[pair[0]]);
        toArr.set(shapes[pair[1]]);
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.aTo.needsUpdate = true;
    }

    /* Camera: 1 world unit = 1 CSS pixel on the z = 0 plane. */
    let W = 1;
    let H = 1;
    const home = new THREE.Vector3();
    const centre = new THREE.Vector3(0, 0, 0);

    function layout() {
        W = window.innerWidth;
        H = window.innerHeight;
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        const focal = (H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
        camera.position.set(0, 0, focal);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        uniforms.uFocal.value = focal;
        uniforms.uPixelRatio.value = renderer.getPixelRatio();

        // Where the hero box sits when the page is scrolled to the top.
        const rect = visual.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cyPage = rect.top + rect.height / 2 + (window.scrollY || 0);
        home.set(cx - W / 2, H / 2 - cyPage, 0);

        buildShapes();
        setSegment(segment || 'rex', true);
    }

    /* Pointer parallax (fine pointers only). */
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    if (!coarse) {
        window.addEventListener('pointermove', (e) => {
            pointer.tx = (e.clientX / W - 0.5) * 2;
            pointer.ty = (e.clientY / H - 0.5) * 2;
        }, { passive: true });
    }

    /* Frame loop */
    const t0 = performance.now();
    const INTRO_MS = 2200;
    let introStart = -1;
    let introDone = false;
    let ts = clamp(state.t, 0, 1);
    let bs = clamp(state.burst || 0, 0, 1);
    let excite = 0;
    let running = false;

    function tick() {
        const now = performance.now();
        const time = (now - t0) / 1000;
        const target = clamp(state.t, 0, 1);
        const burstTarget = clamp(state.burst || 0, 0, 1);

        ts += (target - ts) * 0.14;
        if (Math.abs(target - ts) < 0.0005) ts = target;
        bs += (burstTarget - bs) * 0.14;
        if (Math.abs(burstTarget - bs) < 0.0005) bs = burstTarget;
        excite += (state.excite - excite) * 0.2;
        pointer.x += (pointer.tx - pointer.x) * 0.06;
        pointer.y += (pointer.ty - pointer.y) * 0.06;

        let mix;
        let opacity = 1;
        let size = baseSize;
        let drift = 1.2;
        let swirl = 40;
        let extraSpin = 0;
        let extraScale = 0;

        if (bs > 0.0005) {
            // The statement is pinned: the dot charges up, then blows apart.
            introDone = true;
            setSegment('burst');
            const charge = smoothstep(0, 0.12, bs);
            const fly = smoothstep(0.1, 1, bs);
            mix = fly;
            opacity = 1 - smoothstep(0.62, 1, bs);
            size = baseSize * (3.2 + charge * 2.4 - fly * 3.2);
            drift = 0;
            swirl = 40 + fly * 110;
            extraSpin = fly * 1.8;
            extraScale = fly * 0.9;
        } else if (ts < 0.6) {
            setSegment('rex');
            if (!introDone) {
                if (introStart < 0) introStart = now;
                const k = Math.min(1, (now - introStart) / INTRO_MS);
                mix = easeOutCubic(k);
                if (k >= 1) introDone = true;
            } else {
                mix = 1;
            }
        } else {
            introDone = true;
            setSegment('collapse');
            mix = (ts - 0.6) / 0.4;
            size = baseSize * (1 + mix * 2.2);
            drift = 1.2 * (1 - mix);
        }

        uniforms.uMix.value = mix;
        uniforms.uOpacity.value = opacity;
        uniforms.uSize.value = size;
        uniforms.uDrift.value = drift;
        uniforms.uSwirl.value = swirl;
        uniforms.uTime.value = time;
        uniforms.uExcite.value = excite;

        // From its spot in the hero to the middle of the screen, growing a little.
        const k = smoothstep(0, 0.5, ts);
        group.position.lerpVectors(home, centre, k);
        group.position.y += Math.sin(time * 0.9) * 4 * (1 - k);
        group.scale.setScalar(1 + 0.15 * k + extraScale);
        group.rotation.y = pointer.x * 0.35 + Math.sin(time * 0.35) * 0.06 + ts * 1.3 + extraSpin;
        group.rotation.x = -pointer.y * 0.22 + Math.sin(time * 0.27) * 0.04 + extraSpin * 0.25;

        renderer.render(scene, camera);

        if (!state.ready) {
            state.ready = true;
            state.failed = false;
            document.dispatchEvent(new CustomEvent('rexhero:ready'));
        }
        if (bs >= 1 && burstTarget >= 1) stop();
    }

    function start() {
        if (running) return;
        running = true;
        renderer.setAnimationLoop(tick);
    }

    function stop() {
        if (!running) return;
        running = false;
        renderer.setAnimationLoop(null);
    }

    const offScreen = () => (state.burst || 0) >= 1;

    window.addEventListener('scroll', () => {
        if (!running && !document.hidden && !offScreen()) start();
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else if (!offScreen()) start();
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(layout, 150);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        stop();
        fail('context lost');
    });

    layout();
    start();
}
