// The set pieces: at each stop, something that is plainly about what the page
// says there. Standing stones that carry the app icons (the rex knocks them
// over), a laptop on a stump that the rex types at, a red roadster that flies
// the migration trail, a speaker stack in the lagoon that rings the water, and
// pterosaurs wheeling on the heat over the crater.
import * as THREE from 'three/webgpu';
import {
    dot, reflect, exp, fract, fwidth, dFdx, dFdy, normalWorld, positionWorld,
    attribute, uniform, texture, vec2, vec3, float, mix, max, min, abs, sign, step, normalize, pow, sin, atan, length, floor, cross,
    positionLocal, positionGeometry, normalGeometry, cameraPosition, uv, saturate,
} from 'three/tsl';
import { smoothstep } from './tsl.js';
import * as TSL from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32, lerp, clamp as cl, catmull, smoothstep as ss } from './noise.js';
import { createFlock, wingStroke } from './pterosaur.js';
import { paintScreens, paintKeys, SCREEN } from './screens.js';
import { reliefNormal } from './fx.js';

const col = (h) => { const c = new THREE.Color(h); return vec3(c.r, c.g, c.b); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// a closed Catmull-Rom loop through `pts`; u in [0, pts.length)
const loopAt = (pts, u, out) => {
    const n = pts.length, i = Math.floor(u), f = u - i;
    const p0 = pts[(i + n - 1) % n], p1 = pts[i % n], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < p1.length; k++) { const a = p0[k], b = p1[k], c = p2[k], d = p3[k]; out[k] = 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f); }
    return out;
};

export function createScenes({ island, places, quality, atmosphere, terrain, noiseTex, rockTex, water, apps = [], skyLights = null, lava = null, footprints = null }) {
    const group = new THREE.Group(); group.name = 'scenes';
    const rnd = mulberry32(90210);
    const clear = [];            // [x, z, r] kept free of plants
    const sets = [];             // { x, z, range, show(near), run(t, dt, camera) }
    const systems = [];
    const uT = uniform(0), uCamRight = uniform(new THREE.Vector3(1, 0, 0)), uCamUp = uniform(new THREE.Vector3(0, 1, 0));
    let now = 0, fauna = null, kettle = null;
    const ground = (x, z) => island.heightAt(x, z);
    const add = (mesh, parent = group, cast = true) => { mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
    const P = (id) => places.find((p) => p.id === id);
    const daylight = atmosphere.uSunColor.mul(0.15).add(atmosphere.skyLookup(vec3(0, 1, 0)).mul(1.25));
    const plain = (hex, rough = 0.7, extra = {}) => new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(hex), roughness: rough, ...extra });

    // ---- sprites that are thrown: each has a start, a velocity and a birth time, and the
    // shader does the rest (so nothing is walked on the CPU after the throw)
    const sprites = ({ count, life, accel = [0, 0, 0], size0, size1, stretch = 0, tint = '#ffffff', gain = 1, additive = false, opacity = 1, lit = true, order = 22, carried = false }) => {
        const geo = new THREE.InstancedBufferGeometry();
        const q = new THREE.PlaneGeometry(1, 1);
        geo.index = q.index; geo.setAttribute('position', q.attributes.position); geo.setAttribute('uv', q.attributes.uv);
        const A = new Float32Array(count * 4), V = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) { A[i * 4 + 3] = -1e6; V[i * 4 + 3] = 1; }
        const aA = new THREE.InstancedBufferAttribute(A, 4), aV = new THREE.InstancedBufferAttribute(V, 4);
        aA.setUsage(THREE.DynamicDrawUsage); aV.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('pA', aA); geo.setAttribute('pV', aV); geo.instanceCount = count;
        // `carried`: thrown from something that is itself moving; pE is that thing's velocity
        const E = carried ? new Float32Array(count * 3) : null, aE = carried ? new THREE.InstancedBufferAttribute(E, 3) : null;
        if (carried) { aE.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('pE', aE); }
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
        const pA = attribute('pA', 'vec4'), pV = attribute('pV', 'vec4');
        const el = uT.sub(pA.w), age = el.div(pV.w.mul(life));
        const on = step(0.0, age).mul(step(age, 1.0));
        const g = vec3(accel[0], accel[1], accel[2]);
        const centre = pA.xyz.add(pV.xyz.mul(el)).add(g.mul(el.mul(el).mul(0.5)));
        const size = mix(float(size0), float(size1), saturate(age)).mul(on);
        const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const d = uv().sub(0.5).mul(2.0);
        let shape;
        if (stretch) {
            const along = normalize(pV.xyz.add(g.mul(el)).sub(carried ? attribute('pE', 'vec3') : vec3(0, 0, 0)).add(vec3(0, 1e-4, 0)));
            const side = normalize(cross(along, cameraPosition.sub(centre)));
            m.positionNode = centre.add(side.mul(positionLocal.x.mul(size))).add(along.mul(positionLocal.y.mul(size).mul(stretch)));
            // a jet that crosses right in front of the lens would be a row of bars: it thins away there
            // (a drop drawn out by its own speed: round at both ends)
            shape = smoothstep(1.0, 0.25, length(d)).mul(smoothstep(7.0, 17.0, length(cameraPosition.sub(centre))));
        } else {
            m.positionNode = centre.add(uCamRight.mul(positionLocal.x.mul(size))).add(uCamUp.mul(positionLocal.y.mul(size)));
            shape = smoothstep(1.0, 0.0, length(d));
        }
        const a = shape.mul(smoothstep(0.0, 0.08, age)).mul(smoothstep(1.0, 0.5, age)).mul(on);
        const c = lit ? col(tint).mul(daylight).mul(gain) : col(tint).mul(gain);
        if (additive) { m.blending = THREE.AdditiveBlending; m.colorNode = c.mul(a).mul(opacity); m.opacityNode = float(1); } else { m.colorNode = c; m.opacityNode = a.mul(opacity); }
        m.fog = true;
        const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = order; group.add(mesh);
        let cur = 0, dirty = false;
        const sys = {
            mesh,
            spawn(x, y, z, vx, vy, vz, lifeScale = 1, ex = 0, ey = 0, ez = 0, ago = 0) { const i = cur * 4; A[i] = x; A[i + 1] = y; A[i + 2] = z; A[i + 3] = now - ago; V[i] = vx; V[i + 1] = vy; V[i + 2] = vz; V[i + 3] = lifeScale; if (E) { E[cur * 3] = ex; E[cur * 3 + 1] = ey; E[cur * 3 + 2] = ez; } cur = (cur + 1) % count; dirty = true; },
            flush() { if (dirty) { aA.needsUpdate = true; aV.needsUpdate = true; if (aE) aE.needsUpdate = true; dirty = false; } },
        };
        systems.push(sys);
        return sys;
    };

    // ---- the app icons, loaded once and shared by the stones and the laptop's dock
    const icons = apps.map(() => null), onIcon = [];
    const ready = new Promise((resolve) => {
        let pending = 0;
        const done = () => { if (--pending <= 0) resolve(); };
        apps.forEach((a, i) => {
            if (!a.icon || typeof Image === 'undefined') return;
            pending++;
            const img = new Image(); img.decoding = 'async';
            img.onload = () => { icons[i] = img; for (const f of onIcon) f(i, img); done(); };
            img.onerror = done; img.src = a.icon;
        });
        if (!pending) resolve();
        setTimeout(resolve, 6000);
    });

    // ==== standing stones: one per app, its icon set into both faces =================
    const stones = [];
    const henge = { phase: 'idle', until: 0, target: -1, wanted: -1, next: 0, hit: false, t0: 0 };
    {
        const pl = P('apps'), s = pl.site, n = Math.max(apps.length, 1);
        const COLS = 4, ROWS = Math.ceil(n / COLS), CELL = 256, PAD = 10;
        const cv = document.createElement('canvas'); cv.width = COLS * CELL; cv.height = ROWS * CELL;
        const cx = cv.getContext('2d');
        const drawCell = (i, img) => {
            const x = (i % COLS) * CELL, y = Math.floor(i / COLS) * CELL, a = apps[i] || { id: '?', tint: '#cfc6ad' };
            cx.fillStyle = a.tint || '#cfc6ad'; cx.fillRect(x, y, CELL, CELL);
            if (img) cx.drawImage(img, x + PAD, y + PAD, CELL - 2 * PAD, CELL - 2 * PAD);
            else { cx.fillStyle = '#00000050'; cx.font = '800 150px system-ui, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(String(a.id || '?')[0].toUpperCase(), x + CELL / 2, y + CELL / 2 + 8); }
        };
        for (let i = 0; i < n; i++) drawCell(i, icons[i]);
        const iconTex = new THREE.CanvasTexture(cv); iconTex.flipY = false; iconTex.colorSpace = THREE.SRGBColorSpace; iconTex.generateMipmaps = true; iconTex.minFilter = THREE.LinearMipmapLinearFilter; iconTex.anisotropy = 8;
        onIcon.push((i, img) => { if (i < n) { drawCell(i, img); iconTex.needsUpdate = true; } });

        const SW = 1.62, SH = 3.25, SD = 0.52, BURY = 0.32, ICON = 1.16, ICON_Y = 2.12;
        const geo = new RoundedBoxGeometry(SW, SH, SD, 9, 0.2); geo.translate(0, SH / 2, 0);
        {
            // a menhir, not a slab: shouldered, leaning into one corner, thick at the foot, its edges bitten
            const p = geo.attributes.position, nz = (a, b2) => Math.sin(a * 2.3 + b2) * 0.5 + Math.sin(a * 5.1 + b2 * 1.7) * 0.3 + Math.sin(a * 11.3 + b2 * 0.6) * 0.2;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i), z = p.getZ(i), v = y / SH, u = x / (SW / 2), side = Math.max(0, Math.abs(u) - 0.72) / 0.28;
                const wide = 1.04 + 0.08 * Math.sin(v * 2.6 + 0.4) - 0.3 * v * v * v;
                const bite = 0.09 * nz(v * 3.0, u > 0 ? 1.0 : 4.0) * side;
                const top = Math.max(0, v - 0.72) / 0.28;
                p.setXYZ(i, x * wide + bite + 0.07 * Math.sin(v * 3.2),
                    y + top * top * (0.26 * u - 0.2 * u * u) * SH * 0.3 + 0.03 * nz(u * 2.0, 2.0) * top,
                    z * (1.32 - 0.5 * v) * (1 + 0.1 * nz(u * 1.5 + v * 2.0, 6.0) * side));
            }
        }
        const sc = new Float32Array(n * 4);          // icon cell x, y, glow, seed
        const scAttr = new THREE.InstancedBufferAttribute(sc, 4); scAttr.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('sc', scAttr);
        const m = new THREE.MeshStandardNodeMaterial();
        {
            const a = attribute('sc', 'vec4'), pg = positionGeometry, ng = normalGeometry;
            const tri = texture(rockTex, pg.xy.mul(0.42).add(a.w.mul(7.3))).b.mul(abs(ng.z)).add(texture(rockTex, pg.zy.mul(0.42).add(a.w.mul(3.1))).b.mul(abs(ng.x))).add(texture(rockTex, pg.xz.mul(0.42).add(a.w.mul(5.7))).b.mul(abs(ng.y)));
            const grain = texture(noiseTex, pg.xy.mul(vec2(1.7, 0.45)).add(a.w.mul(11.0))).g;
            const blotch = texture(noiseTex, pg.xy.mul(0.27).add(a.w.mul(4.0)));
            let stone = col('#7f786b').mul(mix(0.5, 1.2, tri)).mul(mix(0.84, 1.1, grain));
            stone = mix(stone, col('#b9b39f').mul(mix(0.7, 1.0, grain)), smoothstep(0.62, 0.8, blotch.g).mul(0.45));                 // lichen
            stone = mix(stone, col('#465229').mul(mix(0.6, 1.1, grain)), smoothstep(0.5, 0.78, blotch.r).mul(smoothstep(1.7, 0.4, pg.y)).mul(0.7));   // moss low down
            stone = mix(stone, col('#3c3126'), smoothstep(0.75, 0.3, pg.y).mul(0.7));                                              // soil at the foot
            // the icon: a tile let into the face, the right way round from either side
            const face = smoothstep(0.6, 0.9, abs(ng.z));
            const q = vec2(pg.x.mul(sign(ng.z)).div(ICON), float(ICON_Y).sub(pg.y).div(ICON));
            const b = abs(q).sub(0.5 - 0.2);
            const dist = length(max(b, 0.0)).add(min(max(b.x, b.y), 0.0)).sub(0.2);
            const inside = smoothstep(0.012, -0.012, dist).mul(face);
            const recess = smoothstep(0.07, 0.0, abs(dist.sub(0.02))).mul(face);
            const inner = (CELL - 2 * PAD) / CELL;
            const iuv = vec2(a.x, a.y).add(q.add(0.5).mul(inner).add(PAD / CELL)).div(vec2(COLS, ROWS));
            const icon = texture(iconTex, iuv).rgb.mul(mix(0.82, 1.0, grain));
            m.colorNode = mix(stone.mul(float(1).sub(recess.mul(0.6))), icon, inside);
            m.roughnessNode = mix(float(0.9), float(0.42), inside);
            // hewn, not cast: the stone's own pits and the tile let a finger's depth into the face
            // (only its broad dents: relief finer than a pixel, lit this way, breaks up into speckle)
            m.normalNode = reliefNormal(texture(noiseTex, pg.xy.mul(0.085).add(a.w.mul(3.0))).r.mul(0.09).sub(inside.mul(0.025)));
            m.emissiveNode = icon.mul(inside).mul(a.z.mul(1.1).add(0.15));
        }
        const inst = new THREE.InstancedMesh(geo, m, n); inst.frustumCulled = false; inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); add(inst);
        // a horseshoe that opens toward the lens, so the icons on the far stones face it
        const R = 6.05, gap = 0.72, toCam = Math.atan2(pl.cam[2] - s.z, pl.cam[0] - s.x);
        const mM = new THREE.Matrix4(), mA = new THREE.Matrix4();
        const poseOf = (st, alpha) => mM.makeTranslation(st.x, st.y, st.z).multiply(mA.makeRotationY(st.phi)).multiply(mA.makeTranslation(0, BURY, st.hz)).multiply(mA.makeRotationX(alpha)).multiply(mA.makeTranslation(0, -BURY, -st.hz))
            .multiply(mA.makeRotationY(st.twist)).multiply(mA.makeRotationZ(st.lean)).multiply(mA.makeScale(st.sx, st.sy, st.sz));
        const setStone = (i) => { const st = stones[i]; inst.setMatrixAt(i, poseOf(st, st.alpha)); if (footprints && st.mover >= 0) footprints.setFall(st.mover, st.alpha / REST); };
        const REST = 1.5;
        inst.userData.footprint = false;                         // (each stone lays its own, upright and fallen: see below)
        for (let i = 0; i < n; i++) {
            const th = toCam + gap + ((i + 0.5) / n) * (Math.PI * 2 - 2 * gap), ox = Math.cos(th), oz = Math.sin(th);
            const x = s.x + ox * R, z = s.z + oz * R;
            const sz = lerp(0.9, 1.15, rnd());
            stones.push({ i, id: (apps[i] && apps[i].id) || '', x, z, y: Math.min(ground(x, z), ground(x + ox, z + oz), ground(x - ox, z - oz)) - BURY, ox, oz, phi: Math.PI / 2 - th, hz: SD * 0.5 * sz, alpha: 0, w: 0, state: 0, t: 0, rest: 0,
                lean: (rnd() - 0.5) * 0.09, twist: (rnd() - 0.5) * 0.24 + (rnd() < 0.5 ? Math.PI : 0), sx: lerp(0.86, 1.14, rnd()), sy: lerp(0.82, 1.1, rnd()), sz, glow: 0, glowTo: 0 });
            sc[i * 4] = i % COLS; sc[i * 4 + 1] = Math.floor(i / COLS); sc[i * 4 + 2] = 0; sc[i * 4 + 3] = rnd();
            setStone(i);
            clear.push([x, z, 1.5], [x + ox * 2.2, z + oz * 2.2, 2.0]);
            // (its shade goes over with it, and the ground is kept bare where it stands and where it comes down)
            { const st = stones[i]; st.mover = footprints ? footprints.mover(geo, poseOf(st, 0).clone(), poseOf(st, REST).clone()) : -1; }
        }
        clear.push([s.x, s.z, R + 0.6]);
        const dust = sprites({ count: 96, life: 1.7, accel: [0, 0.5, 0], size0: 0.6, size1: 2.8, tint: '#b6a487', opacity: 0.34 });
        const standing = (i) => i >= 0 && i < n && stones[i].state === 0;
        const push = (i) => { const st = stones[i]; if (st.state !== 0) return; st.state = 1; st.w = 1.5; };
        const thud = (st) => { for (let k = 0; k < 12; k++) { const d = lerp(1.2, 3.0, rnd()), l = (rnd() - 0.5) * 1.6; dust.spawn(st.x + st.ox * d - st.oz * l, st.y + BURY + 0.2, st.z + st.oz * d + st.ox * l, st.ox * lerp(0.4, 1.6, rnd()) - st.oz * l * 0.5, lerp(0.3, 1.0, rnd()), st.oz * lerp(0.4, 1.6, rnd()) + st.ox * l * 0.5, lerp(0.7, 1.2, rnd())); } };
        const order = stones.map((q) => q.i); for (let i = order.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }
        const run = (t, dt) => {
            let any = false, glowed = false;
            for (const st of stones) {
                let moved = false;
                if (st.state === 1) {              // going over: a pendulum the wrong way up
                    st.w += 7.5 * Math.sin(st.alpha + 0.12) * dt; st.alpha += st.w * dt; moved = true;
                    if (st.alpha >= REST) { st.alpha = REST; if (st.w > 1.1) { st.w *= -0.2; thud(st); } else { st.w = 0; st.state = 2; st.t = t; st.rest = 5.5 + rnd() * 3; } }
                } else if (st.state === 2) { if (t - st.t > st.rest) { st.state = 3; st.t = t; } }
                else if (st.state === 3) { const u = (t - st.t) / 1.9; st.alpha = REST * (1 - ss(0, 1, u)); moved = true; if (u >= 1) { st.alpha = 0; st.state = 0; } }
                if (moved) { setStone(st.i); any = true; }
                if (Math.abs(st.glowTo - st.glow) > 0.002) { st.glow += (st.glowTo - st.glow) * Math.min(1, dt * 6); sc[st.i * 4 + 2] = st.glow; glowed = true; }
            }
            if (any) inst.instanceMatrix.needsUpdate = true;
            if (glowed) scAttr.needsUpdate = true;
            // the rex: picks a stone, turns to it, puts its head down and shoves
            const rex = fauna && fauna.rex, h = henge;
            if (!rex || fauna.rexPlace !== pl.index || !rex.act) { h.phase = 'idle'; h.until = 0; h.hit = false; return; }
            const act = rex.act;
            if (h.phase === 'idle') {
                act.step += (0 - act.step) * Math.min(1, dt * 8); act.lunge = Math.max(0, act.lunge - dt * 1.5);
                if (!h.until) h.until = t + 1.1;
                const eager = standing(h.wanted);
                if (t >= h.until || eager) {
                    let pick = eager ? h.wanted : -1;
                    for (let k = 0; k < n && pick < 0; k++) { const c = order[(h.next + k) % n]; if (standing(c)) { pick = c; h.next = (h.next + k + 1) % n; } }
                    if (pick >= 0) { h.target = pick; h.phase = 'turn'; } else h.until = t + 0.5;
                }
            } else if (h.phase === 'turn') {
                const st = stones[h.target];
                const d = wrap(Math.atan2(st.x - rex.x, -(st.z - rex.z)) - rex.heading);
                rex.turnTo(rex.heading + Math.sign(d) * Math.min(Math.abs(d), 1.75 * dt));
                act.step += ((Math.abs(d) > 0.05 ? 1 : 0) - act.step) * Math.min(1, dt * 8);
                if (Math.abs(d) < 0.02) { h.phase = 'lunge'; h.t0 = t; h.hit = false; }
            } else if (h.phase === 'lunge') {
                const u = (t - h.t0) / 0.36;
                act.step *= Math.pow(0.002, dt);
                act.lunge = u < 1 ? u * u : 1;
                if (u >= 0.8 && !h.hit) { h.hit = true; push(h.target); }
                if (u >= 1.4) { h.phase = 'back'; h.t0 = t; }
            } else {
                const u = (t - h.t0) / 0.95; act.lunge = 1 - ss(0, 1, u);
                if (u >= 1) { act.lunge = 0; h.phase = 'idle'; h.until = t + 0.8 + rnd() * 1.5; }
            }
        };
        sets.push({ x: s.x, z: s.z, range: 420, run });
        henge.hover = (id) => { h2(id); };
        const h2 = (id) => { let w = -1; for (const st of stones) { const on = id != null && st.id === id; st.glowTo = on ? 1 : 0; if (on) w = st.i; } henge.wanted = w; };
    }

    // ==== the laptop on the stump: the rex types at it ================================
    let laptopReady = () => {};
    {
        const pl = P('mac');
        const Wd = 3.0, Dp = 2.0, LH = 2.0, BT = 0.1;
        const F = [Math.sin(pl.rex.heading), -Math.cos(pl.rex.heading)];
        const desk = new THREE.Group(), laptop = new THREE.Group();
        group.add(desk); group.add(laptop);
        // where it will stand, near enough: the exact spot comes from the rex's own hands (see attach)
        const guess = [pl.rex.x + F[0] * 4.7, pl.rex.z + F[1] * 4.7];
        clear.push([guess[0], guess[1], 4.4], [pl.rex.x + F[0] * 2, pl.rex.z + F[1] * 2, 3.2]);

        // the stump: a felled giant, bark on its sides and rings on top
        const sg = new THREE.CylinderGeometry(1, 1, 1, 44, 8, false); sg.translate(0, 0.5, 0);
        {
            const p = sg.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z); if (r < 1e-4) continue;
                const a = Math.atan2(z, x), low = 1 - y;
                const k = 1 + 0.26 * low * low * low + 0.05 * Math.sin(a * 9 + 2 * Math.sin(a * 3)) * (0.5 + low) + 0.5 * Math.pow(Math.max(0, Math.cos(a * 2.5 + 0.7)), 8) * Math.pow(low, 4);
                p.setX(i, x * k); p.setZ(i, z * k);
            }
            sg.computeVertexNormals();
        }
        const sm = new THREE.MeshStandardNodeMaterial();
        {
            const pg = positionGeometry, top = smoothstep(0.75, 0.97, normalGeometry.y), r = length(pg.xz), ang = atan(pg.z, pg.x);
            const rings = sin(r.mul(52.0).add(texture(noiseTex, pg.xz.mul(0.7)).r.mul(6.0))).mul(0.5).add(0.5);
            const cut = mix(col('#b79466'), col('#8a6842'), rings).mul(mix(0.78, 1.06, texture(noiseTex, pg.xz.mul(2.6)).g)).mul(mix(1.0, 0.72, smoothstep(0.82, 1.0, r)));
            // Bark: plates standing between furrows that wander down the trunk, each plate cracked across at
            // its own heights. All of it is a formula of where on the trunk a point is. (Read from the noise
            // texture instead, whose finest grain is about a pixel across from here, every texel put its own
            // kink in the furrows and the bark was drawn in little blocks.)
            const y = pg.y;
            const wander = sin(y.mul(3.1).add(ang.mul(4.0))).mul(2.6).add(sin(y.mul(7.3).sub(ang.mul(7.0)).add(1.7)).mul(1.5)).add(sin(y.mul(13.7).add(ang.mul(13.0)).add(0.6)).mul(0.8)).add(sin(y.mul(27.0).sub(ang.mul(23.0))).mul(0.35));
            const ph = ang.mul(46.0).add(wander).div(3.14159265), rid = floor(ph), across = fract(ph);               // which plate, and where across it
            const rnd1 = fract(sin(rid.mul(12.9898)).mul(43758.5453)), rnd2 = fract(sin(rid.mul(78.233)).mul(24634.6345));
            const edge = min(across, across.oneMinus()).mul(2.0);                                                  // 0 in a furrow, 1 on a plate's crown
            const crossAt = fract(y.mul(rnd1.mul(7.0).add(5.0)).add(rnd2).add(across.mul(rnd2.sub(0.5)).mul(0.5))), crack = smoothstep(0.07, 0.0, min(crossAt, crossAt.oneMinus()));
            // (far enough off that a plate is a pixel or two wide, the pattern goes flat instead of shimmering)
            const seen = smoothstep(0.7, 0.25, fwidth(ph));
            const plateH = smoothstep(0.0, rnd2.mul(0.3).add(0.16), edge).mul(crack.mul(0.8).oneMinus());
            const mottle = texture(noiseTex, vec2(ang.mul(0.32), y.mul(0.22))).g, broad = texture(noiseTex, vec2(ang.mul(0.16), y.mul(0.11))).r;
            let bark = mix(col('#3d2f24'), col('#6b543f'), rnd1.mul(0.5).add(mottle.mul(0.5))).mul(mix(0.8, 1.12, broad));
            bark = bark.mul(mix(float(1.0), mix(0.32, 1.08, plateH), seen));                                         // furrows and cracks hold the dark
            bark = mix(bark, col('#8a7458'), smoothstep(0.75, 1.0, edge).mul(rnd2).mul(0.35).mul(seen));          // crowns weathered pale
            const moss = smoothstep(0.55, 0.8, texture(noiseTex, vec2(ang.mul(0.6), y.mul(0.5))).a).mul(smoothstep(0.7, 0.1, y));
            sm.colorNode = mix(mix(bark, col('#4a5a2a'), moss.mul(0.6)), cut, top);
            sm.roughnessNode = mix(float(0.92), float(0.7), top);
            // bark stands in ridges; the cut face keeps the saw's marks and has checked as it dried
            const checks = smoothstep(0.75, 0.9, texture(noiseTex, vec2(ang.mul(1.9), r.mul(0.35))).b);
            sm.normalNode = reliefNormal(mix(plateH.mul(0.045), rings.mul(0.004).sub(checks.mul(0.02)), top), mix(seen, float(1.0), top));
        }
        const stump = add(new THREE.Mesh(sg, sm), desk);

        // the machine: an aluminium slab, black keys in a well, a wide trackpad, a lid on a hinge
        const alu = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color('#c4c7cc'), roughness: 0.34, metalness: 0.92 });
        const base = add(new THREE.Mesh(new RoundedBoxGeometry(Wd, BT, Dp, 4, 0.04), alu), laptop); base.position.y = BT / 2;
        const kcv = document.createElement('canvas'); paintKeys(kcv);
        const keysTex = new THREE.CanvasTexture(kcv); keysTex.colorSpace = THREE.SRGBColorSpace; keysTex.anisotropy = 8;
        const deckM = new THREE.MeshStandardNodeMaterial();
        { const k = texture(keysTex, uv()).rgb, lum = k.r.add(k.g).add(k.b).div(3.0); deckM.colorNode = k; deckM.metalnessNode = smoothstep(0.25, 0.55, lum).mul(0.9); deckM.roughnessNode = mix(float(0.5), float(0.34), smoothstep(0.25, 0.55, lum)); }
        deckM.polygonOffset = true; deckM.polygonOffsetFactor = -2; deckM.polygonOffsetUnits = -4;
        const dg = new THREE.PlaneGeometry(Wd - 0.1, Dp - 0.1); dg.rotateX(-Math.PI / 2);
        const deck = add(new THREE.Mesh(dg, deckM), laptop, false); deck.position.y = BT + 0.004;
        const lid = new THREE.Group(); lid.position.set(0, BT * 0.6, -Dp / 2 + 0.03); lid.rotation.x = -0.36; laptop.add(lid);
        const lidM = new THREE.MeshStandardNodeMaterial();
        { const front = smoothstep(0.5, 0.9, normalGeometry.z); lidM.colorNode = mix(col('#c4c7cc'), col('#050506'), front); lidM.metalnessNode = mix(float(0.92), float(0.0), front); lidM.roughnessNode = mix(float(0.34), float(0.25), front); }
        const lg = new RoundedBoxGeometry(Wd, LH, 0.06, 4, 0.028); lg.translate(0, LH / 2, 0);
        add(new THREE.Mesh(lg, lidM), lid);
        // the picture: four screens in one sheet, cross-faded
        const scv = document.createElement('canvas'); paintScreens(scv, apps, icons);
        const screenTex = new THREE.CanvasTexture(scv); screenTex.flipY = false; screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.generateMipmaps = true; screenTex.minFilter = THREE.LinearMipmapLinearFilter; screenTex.anisotropy = 8;
        let repaint = 0;
        onIcon.push(() => { clearTimeout(repaint); repaint = setTimeout(() => { paintScreens(scv, apps, icons); screenTex.needsUpdate = true; }, 60); });
        const uScreen = uniform(new THREE.Vector3(0, 1, 0));        // showing, coming, how far along
        const scrM = new THREE.MeshBasicNodeMaterial();
        {
            const suv = vec2(uv().x, float(1).sub(uv().y)).mul(0.992).add(0.004);
            const cell = (i) => texture(screenTex, suv.add(vec2(i.mod(2.0), floor(i.mul(0.5)))).div(vec2(SCREEN.cols, SCREEN.rows))).rgb;
            const glass = smoothstep(0.9, 0.2, length(uv().sub(vec2(0.2, 1.1)))).mul(0.035);         // a little sky caught in the glass
            scrM.colorNode = mix(cell(uScreen.x), cell(uScreen.y), uScreen.z).mul(2.3).add(daylight.mul(glass));
        }
        scrM.polygonOffset = true; scrM.polygonOffsetFactor = -2; scrM.polygonOffsetUnits = -4;
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(Wd - 0.14, LH - 0.16), scrM); screen.position.set(0, LH / 2 + 0.01, 0.034); lid.add(screen);
        // (no lamp for the screen's glow: a light that comes and goes with its prop changes the lighting
        // every shader in view was compiled for, and each of them is then compiled again on the spot)

        // an enamel mug, for scale and company
        const mug = new THREE.Group(); desk.add(mug);
        { const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.62, 22, 1, true), plain('#e9e4d6', 0.35, { side: THREE.DoubleSide })), mug); body.position.y = 0.31;
            const bottom = add(new THREE.Mesh(new THREE.CircleGeometry(0.3, 22).rotateX(-Math.PI / 2), plain('#e9e4d6', 0.35)), mug, false); bottom.position.y = 0.02;
            const tea = new THREE.Mesh(new THREE.CircleGeometry(0.325, 22).rotateX(-Math.PI / 2), plain('#3a2415', 0.15)); tea.position.y = 0.52; mug.add(tea);
            const rim = add(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.022, 8, 28).rotateX(Math.PI / 2), plain('#27456b', 0.4)), mug, false); rim.position.y = 0.62;
            const handle = add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.045, 8, 18, Math.PI), plain('#e9e4d6', 0.35)), mug); handle.position.set(0.33, 0.31, 0); handle.rotation.z = -Math.PI / 2; }

        // Seat everything where the rex's hands actually are when it rears up to type.
        laptopReady = () => {
            const rex = fauna.rex, prev = fauna.rexPlace, tips = [];
            fauna.setRex(pl.index);
            for (const tt of [0, Math.PI / 22]) {
                rex.animate(tt, 0); if (!rex.grounded) { rex.settle(); rex.animate(tt, 0); }
                rex.mesh.updateMatrixWorld(true);
                for (const sd of ['L', 'R']) { const b = rex.species.bones.find((q) => q.name === 'hand' + sd); tips.push(new THREE.Vector3(b.tip[0] - b.x, b.tip[1] - b.y, b.tip[2] - b.z).applyMatrix4(rex.bone['hand' + sd].matrixWorld)); }
            }
            fauna.setRex(prev);
            let hx = 0, hz = 0, hy = 1e9; for (const v of tips) { hx += v.x / tips.length; hz += v.z / tips.length; hy = Math.min(hy, v.y); }
            const top = hy - 0.05 - BT;                                    // the keys sit just under the fingertips
            // hands over the near rows of keys: the machine's middle lies a little beyond them
            const lx = hx + F[0] * 0.2, lz = hz + F[1] * 0.2;
            laptop.position.set(lx, top, lz); laptop.rotation.y = Math.atan2(-F[0], -F[1]) - 0.4;      // turned a little toward the lens
            const sx = lx + F[0] * 1.35, sz2 = lz + F[1] * 1.35;
            let g0 = 1e9; for (let a = 0; a < 6.283; a += 0.7) g0 = Math.min(g0, ground(sx + Math.cos(a) * 2.2, sz2 + Math.sin(a) * 2.2));
            g0 -= 0.35;
            stump.position.set(sx, g0, sz2); stump.scale.set(2.25, top - g0, 2.25); stump.rotation.y = 0.8;
            mug.position.set(sx + F[0] * 0.9 + F[1] * 1.3, top, sz2 + F[1] * 0.9 - F[0] * 1.3); mug.rotation.y = 2.2;
            desk.updateMatrixWorld(true); laptop.updateMatrixWorld(true);
        };
        sets.push({
            x: pl.rex.x, z: pl.rex.z, range: 520,
            show(near) { desk.visible = near; laptop.visible = near; },
            run(t) {
                // a new app every few seconds, cross-faded
                const HOLD = 4.2, FADE = 0.6, k = Math.floor(t / HOLD);
                uScreen.value.set(k % SCREEN.count, (k + 1) % SCREEN.count, 0);
                if (t - k * HOLD > HOLD - FADE) uScreen.value.z = ss(0, 1, (t - k * HOLD - (HOLD - FADE)) / FADE);
            },
        });
    }

    // ==== the roadster: flies the trail, low past the lens ============================
    const car = { pos: new THREE.Vector3(), near: false };
    {
        const pl = P('tesla'), SCALE = 1.5;
        const g = new THREE.Group(); g.scale.setScalar(SCALE); group.add(g); car.group = g;
        const Q = quality.post;                              // 3 ultra, 2 high, 1 medium, 0 low: how finely everything here is cut
        const lin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
        const at = (px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, order = 'XYZ') => new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)), new THREE.Vector3(sx, sy, sz));
        const set3 = (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; };
        // ---- a mesh being put together out of many parts: at every corner a position, a normal, a tint and
        // [roughness, metalness, glow], so that everything of one kind is drawn in one go
        const bag = () => {
            const p = [], n = [], c = [], m = [], ix = [], v3 = new THREE.Vector3(), a3 = [0, 0, 0], b3 = [0, 0, 0], d3 = [0, 0, 0];
            const o = {
                p, ix,
                count: () => p.length / 3,
                vert(x, y, z, nx, ny, nz, tint, pbr) { p.push(x, y, z); n.push(nx, ny, nz); c.push(tint[0], tint[1], tint[2]); m.push(pbr[0], pbr[1], pbr[2] || 0); return p.length / 3 - 1; },
                quad(a, b, e, f) { ix.push(a, b, e, a, e, f); },
                // any geometry of three's, moved into place
                put(geo, mat, tint, pbr) {
                    const gp = geo.attributes.position, gn = geo.attributes.normal, base = p.length / 3, nm = new THREE.Matrix3().getNormalMatrix(mat), back = mat.determinant() < 0;
                    for (let i = 0; i < gp.count; i++) {
                        v3.fromBufferAttribute(gp, i).applyMatrix4(mat); p.push(v3.x, v3.y, v3.z);
                        v3.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize(); n.push(v3.x, v3.y, v3.z);
                        c.push(tint[0], tint[1], tint[2]); m.push(pbr[0], pbr[1], pbr[2] || 0);
                    }
                    const gi = geo.index, nt = gi ? gi.count : gp.count;
                    for (let i = 0; i < nt; i += 3) { const a = base + (gi ? gi.getX(i) : i), b = base + (gi ? gi.getX(i + 1) : i + 1), e = base + (gi ? gi.getX(i + 2) : i + 2); if (back) ix.push(a, e, b); else ix.push(a, b, e); }
                    geo.dispose();
                    return o;
                },
                // a surface given as a function of two parameters in [0, 1]; its normals come from its own slopes
                surf(fn, nu, nv, tint, pbr, flip = false) {
                    const base = p.length / 3, e = 1e-3;
                    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
                        const u = i / nu, v = j / nv;
                        fn(Math.min(1, u + e), v, b3); fn(Math.max(0, u - e), v, d3); const ux = b3[0] - d3[0], uy = b3[1] - d3[1], uz = b3[2] - d3[2];
                        fn(u, Math.min(1, v + e), b3); fn(u, Math.max(0, v - e), d3); const vx = b3[0] - d3[0], vy = b3[1] - d3[1], vz = b3[2] - d3[2];
                        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, k = (flip ? -1 : 1) / (Math.hypot(nx, ny, nz) || 1);
                        fn(u, v, a3);
                        o.vert(a3[0], a3[1], a3[2], nx * k, ny * k, nz * k, typeof tint === 'function' ? tint(u, v) : tint, pbr);
                    }
                    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const q = base + i * (nv + 1) + j, r = q + nv + 1; if (flip) ix.push(q, q + 1, r, q + 1, r + 1, r); else ix.push(q, r, q + 1, q + 1, r, r + 1); }
                    return o;
                },
                // a round bar along a line of points
                tube(pts, r, sides, tint, pbr) {
                    const base = p.length / 3, np = pts.length, T = new THREE.Vector3(), N = new THREE.Vector3(0, 1, 0), B = new THREE.Vector3();
                    for (let i = 0; i < np; i++) {
                        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(np - 1, i + 1)];
                        T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
                        if (i === 0 && Math.abs(T.y) > 0.9) N.set(1, 0, 0);
                        N.addScaledVector(T, -N.dot(T)).normalize(); B.crossVectors(T, N);            // the frame is carried along, never re-made: no twist
                        const rr = typeof r === 'function' ? r(i / (np - 1)) : r;
                        for (let k = 0; k < sides; k++) { const an = (k / sides) * 6.2832, cs = Math.cos(an), sn = Math.sin(an), nx = N.x * cs + B.x * sn, ny = N.y * cs + B.y * sn, nz = N.z * cs + B.z * sn; o.vert(pts[i][0] + nx * rr, pts[i][1] + ny * rr, pts[i][2] + nz * rr, nx, ny, nz, tint, pbr); }
                    }
                    for (let i = 0; i < np - 1; i++) for (let k = 0; k < sides; k++) { const a = base + i * sides + k, b = base + i * sides + (k + 1) % sides, e = a + sides, f = b + sides; ix.push(a, b, e, b, f, e); }
                    return o;
                },
                // a flat plate cut to an outline in the x-y plane, standing at z
                plate(poly, z, th, tint, pbr) {
                    let area = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
                    const pts = area < 0 ? poly.slice().reverse() : poly, np = pts.length;
                    for (const sd of [1, -1]) { const base = p.length / 3; for (const q of pts) o.vert(q[0], q[1], z + (sd * th) / 2, 0, 0, sd, tint, pbr); for (let i = 1; i < np - 1; i++) { if (sd > 0) ix.push(base, base + i, base + i + 1); else ix.push(base, base + i + 1, base + i); } }
                    for (let i = 0; i < np; i++) {
                        const a = pts[i], b = pts[(i + 1) % np], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1, nx = ey / l, ny = -ex / l, base = p.length / 3;
                        o.vert(a[0], a[1], z + th / 2, nx, ny, 0, tint, pbr); o.vert(b[0], b[1], z + th / 2, nx, ny, 0, tint, pbr); o.vert(b[0], b[1], z - th / 2, nx, ny, 0, tint, pbr); o.vert(a[0], a[1], z - th / 2, nx, ny, 0, tint, pbr);
                        o.quad(base, base + 3, base + 2, base + 1);
                    }
                    return o;
                },
                // normals of everything from vertex v0 / index t0 on, from the faces that meet at each corner
                smooth(v0, t0) {
                    for (let i = v0 * 3; i < n.length; i++) n[i] = 0;
                    for (let t = t0; t < ix.length; t += 3) {
                        const a = ix[t] * 3, b = ix[t + 1] * 3, e = ix[t + 2] * 3;
                        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[e] - p[a], vy = p[e + 1] - p[a + 1], vz = p[e + 2] - p[a + 2];
                        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                        for (const k of [a, b, e]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
                    }
                    for (let i = v0 * 3; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]); if (l > 1e-12) { n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; } else n[i + 1] = 1; }
                },
                build() {
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n), 3));
                    geo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(c), 3)); geo.setAttribute('pbr', new THREE.BufferAttribute(new Float32Array(m), 3));
                    geo.setIndex(ix); return geo;
                },
            };
            return o;
        };

        // ---- the body: one skin drawn through rings of control points, a cubic B-spline both along the car and
        // round it, so that a highlight runs the length of a wing without a kink. Stations from nose to tail:
        // [x, half width, top on the centre line, crown of the wing, floor]
        const KEY = [[2.0, 0, 0.36, 0.36, 0.36], [1.985, 0.46, 0.45, 0.445, 0.25], [1.93, 0.7, 0.505, 0.515, 0.185], [1.79, 0.825, 0.555, 0.6, 0.155], [1.57, 0.875, 0.6, 0.7, 0.14],
            [1.25, 0.9, 0.645, 0.765, 0.14], [0.9, 0.885, 0.71, 0.775, 0.14], [0.5, 0.865, 0.8, 0.78, 0.14], [0, 0.86, 0.8, 0.755, 0.14], [-0.5, 0.885, 0.82, 0.78, 0.14],
            [-0.9, 0.92, 0.855, 0.845, 0.14], [-1.25, 0.945, 0.86, 0.885, 0.15], [-1.58, 0.925, 0.855, 0.865, 0.2], [-1.82, 0.865, 0.845, 0.835, 0.27], [-1.93, 0.74, 0.815, 0.795, 0.34],
            [-1.975, 0.46, 0.72, 0.705, 0.43], [-1.99, 0, 0.57, 0.57, 0.57]];
        const NK = KEY.length, NR = 22, net = [], FLOOR = 0.14;
        for (const [x, w, yc, ys, yb] of KEY) {
            const H = ys - yb;
            // half a ring, from the middle of the top round the wing and the flank to the middle of the floor
            const half = [[0, yc], [0.32 * w, yc], [0.58 * w, lerp(yc, ys, 0.35)], [0.8 * w, ys], [0.955 * w, ys - 0.06 * H], [w, ys - 0.28 * H], [0.995 * w, ys - 0.6 * H], [0.96 * w, yb + 0.14 * H], [0.915 * w, yb + 0.02 * H], [0.8 * w, yb], [0.4 * w, yb], [0, yb]];
            const ring = half.map(([z, y]) => [x, y, z]);
            for (let k = 10; k >= 1; k--) ring.push([x, half[k][1], -half[k][0]]);
            net.push(ring);
        }
        // (past each end the skin carries on through the tip and out the other side: that is what rounds it off)
        const ghost = (tip, ring) => ring.map(([x, y, z]) => [x, 2 * tip[0][1] - y, -z]);
        net.unshift(ghost(net[0], net[1])); net.push(ghost(net[NK], net[NK - 1]));
        const wS = [0, 0, 0, 0], wV = [0, 0, 0, 0];
        const basis = (t, w) => { const t2 = t * t, t3 = t2 * t; w[0] = (1 - 3 * t + 3 * t2 - t3) / 6; w[1] = (4 - 6 * t2 + 3 * t3) / 6; w[2] = (1 + 3 * t + 3 * t2 - 3 * t3) / 6; w[3] = t3 / 6; };
        const skin = (s, v, o) => {
            const i = Math.min(NK - 2, Math.max(0, Math.floor(s))), j = Math.floor(v);
            basis(s - i, wS); basis(v - j, wV);
            let x = 0, y = 0, z = 0;
            for (let a = 0; a < 4; a++) { const ring = net[i + a]; for (let b = 0; b < 4; b++) { const c = ring[(((j - 1 + b) % NR) + NR) % NR], k = wS[a] * wV[b]; x += c[0] * k; y += c[1] * k; z += c[2] * k; } }
            return set3(o, x, y, z);
        };
        const ARCH = [{ x: 1.22, y: 0.33, r: 0.383 }, { x: -1.22, y: 0.345, r: 0.405 }], ZIN = 0.6;
        const body = (s, v, o) => {
            skin(s, v, o);
            const x = o[0], y = o[1], az = Math.abs(o[2]), sg = o[2] < 0 ? -1 : 1;
            let dz = 0, dy = 0;
            // the wings roll outward into a lip round each wheel
            for (const A of ARCH) { const d = Math.hypot(x - A.x, y - A.y) - A.r; if (d < 0.12) dz += 0.02 * ss(0.12, 0, d) * ss(0.6, 0.8, az); }
            // a scallop along the door that deepens into the intake ahead of the rear wheel
            dz -= 0.055 * ss(0.5, -0.5, x) * ss(-0.74, -0.66, x) * ss(0.27, 0.42, y) * ss(0.68, 0.52, y) * ss(0.6, 0.8, az);
            // a fairing behind each seat
            dy += 0.07 * Math.exp(-(((az - 0.37) / 0.19) ** 2)) * ss(-0.8, -0.95, x) * ss(-1.8, -1.05, x) * ss(0.6, 0.75, y);
            // and the deck kicks up into a lip at the tail
            dy += 0.03 * ss(-1.5, -1.9, x) * ss(0.62, 0.76, y);
            o[1] = y + dy; o[2] = (az + dz) * sg; return o;
        };
        const PER = Q ? 4 : 3, KV = Q >= 2 ? 3 : 2;          // stations from one ring to the next, steps round each span of a ring
        const NS = (NK - 1) * PER, NV = NR * KV;
        const sv = [], sp = [], sn = [], o3 = [0, 0, 0], oa = [0, 0, 0], ob = [0, 0, 0];
        const vertAt = (s, v) => {
            let nx, ny, nz;
            if (s < 1e-4) { nx = 1; ny = 0; nz = 0; } else if (s > NK - 1 - 1e-4) { nx = -1; ny = 0; nz = 0; } else {
                const e = 2e-3;
                body(s + e, v, oa); body(s - e, v, ob); const ax = oa[0] - ob[0], ay = oa[1] - ob[1], az = oa[2] - ob[2];
                body(s, v + e, oa); body(s, v - e, ob); const bx = oa[0] - ob[0], by = oa[1] - ob[1], bz = oa[2] - ob[2];
                nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
            }
            body(s, v, o3);
            sv.push(s, v); sp.push(o3[0], o3[1], o3[2]); sn.push(nx, ny, nz);
            return sp.length / 3 - 1;
        };
        let tris = [];
        for (let i = 0; i <= NS; i++) for (let j = 0; j < NV; j++) vertAt(i / PER, j / KV);
        for (let i = 0; i < NS; i++) for (let j = 0; j < NV; j++) { const q = i * NV + j, r = q + NV, q1 = i * NV + (j + 1) % NV, r1 = q1 + NV; if (i > 0) tris.push(q, r, q1); if (i < NS - 1) tris.push(q1, r, r1); }
        // Openings are cut out of the skin: whatever lies inside `gone` is taken away, and the new edge is put on the
        // boundary itself (found along each crossed edge, in the skin's own parameters). What comes back is that edge,
        // as [from, to] pairs with the skin that is left on their left.
        const cut = (gone) => {
            const state = new Map(), cross = new Map(), out = [], rim = [];
            const isIn = (k) => { let v = state.get(k); if (v === undefined) { v = gone(sp[k * 3], sp[k * 3 + 1], sp[k * 3 + 2]); state.set(k, v); } return v; };
            const meet = (a, b) => {                     // a stays, b goes
                const key = a < b ? a * 1e6 + b : b * 1e6 + a; let k = cross.get(key); if (k !== undefined) return k;
                const s0 = sv[a * 2], v0 = sv[a * 2 + 1], ds = sv[b * 2] - s0; let dv = sv[b * 2 + 1] - v0; if (dv > NR / 2) dv -= NR; else if (dv < -NR / 2) dv += NR;
                let lo = 0, hi = 1;
                for (let n = 0; n < 14; n++) { const t = (lo + hi) / 2; body(s0 + ds * t, v0 + dv * t, o3); if (gone(o3[0], o3[1], o3[2])) hi = t; else lo = t; }
                k = vertAt(s0 + ds * lo, v0 + dv * lo); cross.set(key, k); return k;
            };
            for (let t = 0; t < tris.length; t += 3) {
                const a = tris[t], b = tris[t + 1], c = tris[t + 2], n = (isIn(a) ? 1 : 0) + (isIn(b) ? 1 : 0) + (isIn(c) ? 1 : 0);
                if (n === 0) { out.push(a, b, c); continue; }
                if (n === 3) continue;
                let p = a, q = b, r = c;                  // turned so that the odd corner comes first
                if (n === 2) { if (!isIn(b)) { p = b; q = c; r = a; } else if (!isIn(c)) { p = c; q = a; r = b; } const pq = meet(p, q), pr = meet(p, r); out.push(p, pq, pr); rim.push([pq, pr]); }
                else { if (isIn(b)) { p = b; q = c; r = a; } else if (isIn(c)) { p = c; q = a; r = b; } const qp = meet(q, p), rp = meet(r, p); out.push(q, r, rp, q, rp, qp); rim.push([rp, qp]); }
            }
            tris = out; return rim;
        };
        // a wall let down from a cut edge, level by level: `to(level, x, y, z, out)` says where a point of the edge goes
        const skirt = (dst, rim, levels, to, tint, pbr) => {
            const colOf = new Map(), v0 = dst.count(), t0 = dst.ix.length;
            const id = (k) => { let b = colOf.get(k); if (b === undefined) { b = dst.count(); colOf.set(k, b); for (let l = 0; l <= levels; l++) { to(l, sp[k * 3], sp[k * 3 + 1], sp[k * 3 + 2], o3); dst.vert(o3[0], o3[1], o3[2], 0, 0, 0, tint, pbr); } } return b; };
            for (const [p, q] of rim) { const a = id(p), b = id(q); for (let l = 0; l < levels; l++) dst.quad(b + l, a + l, a + l + 1, b + l + 1); }
            dst.smooth(v0, t0);
        };
        // the windscreen: `a` across it (-1 to 1), `b` from its foot (0) to the header (1); its top corners are rounded
        const screenX = (z) => 0.5 - 0.2 * Math.pow(Math.abs(z) / 0.74, 2.2);
        const screenTop = (a) => { const k = Math.abs(a) - 0.88; return k > 0 ? 0.88 + 0.12 * Math.sqrt(Math.max(0, 1 - (k / 0.12) ** 2)) : 1; };
        const screenAt = (a, b, o) => {
            const k = Math.pow(Math.abs(a), 2.2), bow = 0.024 * Math.sin(Math.PI * b);
            return set3(o, lerp(0.5 - 0.2 * k, -0.08 - 0.1 * k, b) + bow * 0.5, lerp(0.775 - 0.02 * a * a, 1.14 - 0.02 * a * a, b) + bow * 0.85, lerp(0.74, 0.6, b) * a);
        };
        const CX = -0.18;                                 // the middle of the cockpit, which is open from the foot of the screen back to the deck
        const rimWell = ARCH.map((A) => cut((x, y, z) => Math.abs(z) > ZIN && Math.hypot(x - A.x, y - A.y) < A.r));
        const rimPit = cut((x, y, z) => { if (y < 0.5) return false; const xf = screenX(z) - 0.03, xr = -0.86, u = (2 * (x - xr)) / (xf - xr) - 1; return Math.pow(Math.abs(u), 5) + Math.pow(Math.abs(z / 0.705), 5) < 1; });
        const shell = bag(), chassis = bag(), NONE = [0, 0, 0];
        { const map = new Map(); for (let t = 0; t < tris.length; t++) { const k = tris[t]; let b = map.get(k); if (b === undefined) { b = shell.vert(sp[k * 3], sp[k * 3 + 1], sp[k * 3 + 2], sn[k * 3], sn[k * 3 + 1], sn[k * 3 + 2], NONE, NONE); map.set(k, b); } shell.ix.push(b); } }
        const BLACK = lin('#0d0d0f'), VOID = [0.002, 0.002, 0.002], HOLE = [1, 1, 0], TRIM = lin('#17171a'), LEATHER = lin('#7b4a2a'), SUIT = lin('#e6e6e8'), ALLOY = lin('#c6c9ce'), STEEL = lin('#3a3c40'), MATT = [0.9, 0, 0], SATIN = [0.45, 0, 0], BRIGHT = [0.22, 1, 0];
        const RB = (w, h, d, r, fine = Q >= 2 ? 2 : 1) => new RoundedBoxGeometry(w, h, d, fine, r);
        // the lip of each arch turned in; behind it the liner, the inner wall of the wheel well, a wishbone and a shaft
        const lipTo = (l, x, y, z, o) => set3(o, x, y, z - (z < 0 ? -1 : 1) * 0.025 * l);
        ARCH.forEach((A, k) => {
            skirt(shell, rimWell[k], 1, lipTo, NONE, NONE);
            skirt(chassis, rimWell[k], 1, (l, x, y, z, o) => set3(o, x, y, l ? (z < 0 ? -1 : 1) * ZIN : z - (z < 0 ? -1 : 1) * 0.025), VOID, HOLE);
            for (const sd of [1, -1]) {
                const a0 = Math.asin((FLOOR - A.y) / A.r), n = 14, c0 = chassis.vert(A.x, A.y, sd * ZIN, 0, 0, sd, VOID, HOLE);
                for (let i = 0; i <= n; i++) { const a = lerp(a0, Math.PI - a0, i / n); chassis.vert(A.x + Math.cos(a) * A.r, A.y + Math.sin(a) * A.r, sd * ZIN, 0, 0, sd, VOID, HOLE); }
                for (let i = 0; i < n; i++) { if (sd > 0) chassis.ix.push(c0, c0 + 1 + i, c0 + 2 + i); else chassis.ix.push(c0, c0 + 2 + i, c0 + 1 + i); }
                if (sd > 0) chassis.ix.push(c0, c0 + 1 + n, c0 + 1); else chassis.ix.push(c0, c0 + 1, c0 + 1 + n);
                const hub = [A.x, A.y - 0.07, sd * 0.7];
                if (Q >= 1) for (const dx of [-0.2, 0.17]) chassis.tube([[A.x + dx, 0.2, sd * (ZIN - 0.02)], hub], 0.017, 6, STEEL, [0.5, 0.8, 0]);
                chassis.tube([[A.x, A.y, sd * (ZIN - 0.02)], [A.x, A.y, sd * 0.74]], 0.032, 8, STEEL, [0.5, 0.8, 0]);
                // the caliper, which stays where it is while the disc turns in it
                chassis.put(RB(0.075, 0.15, 0.05, 0.02, 1), at(A.x - 0.15 * Math.cos(0.5) * (k ? -1 : 1), A.y + 0.15 * Math.sin(0.5), sd * (k ? 0.812 : 0.784), 0, 0, k ? 0.5 : -0.5), lin('#b98a1e'), [0.4, 0.5, 0]);
            }
        });
        // the cockpit's edge rolled over, and the tub inside it
        const pitTo = (k, drop, level) => (x, y, z, o) => set3(o, CX + (x - CX) * k, level === undefined ? y - drop : level, z * k);
        const PIT = [pitTo(1, 0), pitTo(0.988, 0.01), pitTo(0.972, 0.045), pitTo(0.95, 0, 0.5), pitTo(0.93, 0, 0.27)];
        skirt(shell, rimPit, 2, (l, x, y, z, o) => PIT[l](x, y, z, o), NONE, NONE);
        skirt(chassis, rimPit, 2, (l, x, y, z, o) => PIT[l + 2](x, y, z, o), TRIM, MATT);
        chassis.put(new THREE.PlaneGeometry(1.34, 1.36).rotateX(-Math.PI / 2), at(-0.15, 0.27, 0), lin('#111113'), MATT);
        // the dashboard under the glass, with a cowl over the dials and a screen in the middle
        const DASH = [[-0.02, 0.77], [0.1, 0.798], [0.2, 0.802], [0.275, 0.775], [0.26, 0.68], [0.2, 0.48]];
        chassis.surf((u, v, o) => { const z = (u * 2 - 1) * 0.67, cowl = 0.045 * Math.exp(-(((z + 0.37) / 0.16) ** 2)) * ss(0.1, 0.45, v) * ss(0.85, 0.6, v); catmull(DASH, v * (DASH.length - 1), o); return set3(o, screenX(z) - 0.03 - o[0], o[1] + cowl - 0.012 * z * z, z); }, 14, 10, TRIM, [0.75, 0, 0], true);
        chassis.put(new THREE.PlaneGeometry(0.24, 0.14), at(screenX(0) - 0.03 - 0.268, 0.69, 0.02, 0, -Math.PI / 2, -0.16, 1, 1, 1, 'ZYX'), lin('#8fc4ff'), [0.3, 0, 1.6]);
        chassis.put(RB(1.0, 0.17, 0.17, 0.05, 1), at(-0.3, 0.35, 0), TRIM, [0.6, 0, 0]);
        // two seats
        for (const sd of [1, -1]) {
            const z = sd * 0.37;
            chassis.put(RB(0.5, 0.12, 0.44, 0.05), at(-0.37, 0.37, z, 0, 0, 0.1), LEATHER, [0.55, 0, 0]);
            chassis.put(RB(0.12, 0.62, 0.44, 0.055), at(-0.71, 0.7, z, 0, 0, 0.28), LEATHER, [0.55, 0, 0]);
            chassis.put(RB(0.1, 0.19, 0.25, 0.045), at(-0.835, 1.03, z, 0, 0, 0.28), LEATHER, [0.55, 0, 0]);
            for (const e of [1, -1]) chassis.put(RB(0.16, 0.5, 0.07, 0.03, 1), at(-0.655, 0.7, z + e * 0.21, 0, 0, 0.28), LEATHER, [0.5, 0, 0]);
            // and a hoop behind each
            const hoop = []; for (let i = 0; i <= 18; i++) { const a = (i / 18) * Math.PI, y = 0.95 + 0.14 * Math.sin(a); if (!i) hoop.push([-0.84, 0.76, z - 0.15]); hoop.push([-0.87 - 0.22 * (y - 0.85), y, z - 0.15 * Math.cos(a)]); if (i === 18) hoop.push([-0.84, 0.76, z + 0.15]); }
            chassis.tube(hoop, 0.021, Q >= 2 ? 10 : 6, ALLOY, BRIGHT);
        }
        // the frame of the windscreen: up one pillar, across the header, down the other
        { const fr = [], q = [0, 0, 0]; const push = (a, b) => { screenAt(a, b, q); fr.push([q[0], q[1], q[2]]); };
            for (let i = 0; i <= 4; i++) push(-1.015, lerp(-0.08, 0.86, i / 4));
            for (let i = 0; i <= 30; i++) { const a = -1.015 + 2.03 * (0.5 - 0.5 * Math.cos((i / 30) * Math.PI)); push(a, screenTop(a / 1.015) * 1.012); }
            for (let i = 0; i <= 4; i++) push(1.015, lerp(0.86, -0.08, i / 4));
            chassis.tube(fr, (t) => lerp(0.019, 0.027, ss(0.2, 0.09, t) + ss(0.8, 0.91, t)), Q >= 2 ? 8 : 6, BLACK, [0.3, 0.2, 0]);
        }
        // the driver: white helmet, dark visor, harness, hands on the wheel
        {
            const z = -0.37, WHITE = lin('#f6f6f6'), GLOVE = lin('#141416');
            chassis.put(RB(0.19, 0.44, 0.34, 0.085), at(-0.6, 0.7, z, 0, 0, 0.28), SUIT, [0.6, 0, 0]);
            for (const e of [1, -1]) chassis.put(RB(0.02, 0.36, 0.045, 0.006, 1), at(-0.512, 0.745, z + e * 0.075, 0, 0, 0.28), lin('#16202e'), [0.55, 0, 0]);
            chassis.put(new THREE.SphereGeometry(0.135, Q >= 2 ? 24 : 16, Q >= 2 ? 16 : 10), at(-0.61, 1.035, z, 0, 0, 0, 1.1, 1, 0.96), WHITE, [0.16, 0, 0]);
            chassis.put(RB(0.15, 0.1, 0.2, 0.045, 1), at(-0.545, 0.955, z), WHITE, [0.16, 0, 0]);
            chassis.put(new THREE.SphereGeometry(0.1385, 20, 6, Math.PI - 1.25, 2.5, 1.12, 0.5), at(-0.61, 1.035, z, 0, 0, 0, 1.1, 1, 0.96), lin('#050608'), [0.08, 0.9, 0]);
            // the wheel, on its column
            const WX = 0.06, WY = 0.8;
            chassis.put(new THREE.TorusGeometry(0.155, 0.015, 8, Q >= 2 ? 28 : 18), at(WX, WY, z, 0, -Math.PI / 2, -0.38, 1, 1, 1, 'ZYX'), GLOVE, [0.5, 0, 0]);
            chassis.put(RB(0.02, 0.05, 0.3, 0.008, 1), at(WX + 0.005, WY, z, 0, 0, -0.38), GLOVE, [0.5, 0, 0]);
            chassis.tube([[WX, WY, z], [WX + 0.2, WY - 0.08, z]], 0.028, 8, GLOVE, [0.5, 0, 0]);
            for (const e of [1, -1]) {
                const arm = [], sh = [-0.575, 0.885, z + e * 0.17], el = [-0.3, 0.66, z + e * 0.235], ha = [WX - 0.005, WY + 0.02, z + e * 0.15];
                for (let i = 0; i <= 8; i++) { const t = i / 8, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; arm.push([sh[0] * a + el[0] * b + ha[0] * c, sh[1] * a + el[1] * b + ha[1] * c, sh[2] * a + el[2] * b + ha[2] * c]); }
                chassis.put(new THREE.SphereGeometry(0.062, 10, 8), at(sh[0], sh[1], sh[2]), SUIT, [0.6, 0, 0]);
                chassis.tube(arm, (t) => lerp(0.05, 0.03, t), 8, SUIT, [0.6, 0, 0]);
                chassis.put(new THREE.SphereGeometry(0.04, 10, 8), at(ha[0], ha[1], ha[2]), GLOVE, [0.6, 0, 0]);
                chassis.tube([[-0.52, 0.46, z + e * 0.09], [-0.05, 0.53, z + e * 0.11], [0.2, 0.42, z + e * 0.1]], 0.07, 8, SUIT, [0.6, 0, 0]);
            }
        }
        // mirrors on the doors: polished bullets on thin stalks, as an old racing roadster wears them
        for (const sd of [1, -1]) {
            const mx = 0.36, my = 0.868, mz = sd * 0.885;
            chassis.put(new THREE.LatheGeometry([[0.043, -0.006], [0.044, 0], [0.04, 0.03], [0.028, 0.062], [0.012, 0.084], [0, 0.09]].map(([r, y]) => new THREE.Vector2(r, y)), Q >= 2 ? 14 : 10), at(mx - 0.03, my, mz, 0, 0, -Math.PI / 2), ALLOY, [0.12, 1, 0]);
            chassis.put(new THREE.CircleGeometry(0.043, Q >= 2 ? 14 : 10), at(mx - 0.036, my, mz, 0, -Math.PI / 2, 0), lin('#1a2026'), [0.05, 1, 0]);
            chassis.tube([[mx - 0.01, 0.74, sd * 0.8], [mx - 0.005, 0.8, sd * 0.85], [mx, my - 0.03, mz]], 0.011, 6, ALLOY, [0.2, 1, 0]);
        }
        // under the tail, the fins of the diffuser; under the nose, a splitter
        for (const z of [0, 0.25, -0.25, 0.5, -0.5]) chassis.plate([[-1.46, 0.185], [-1.9, 0.35], [-1.905, 0.245], [-1.66, 0.165]], z, 0.016, BLACK, SATIN);
        {
            const edge = (u, k, y, o) => { const t = u * 2 - 1, a = Math.abs(t); skin(3.7 * a, t < 0 ? NR - 8.3 : 8.3, o); const e = ss(0.6, 1, a), f = lerp(lerp(0.82, 1, e), 1 + 0.035 * (1 - e), k); return set3(o, 1 + (o[0] - 1) * f, y, o[2] * f); };
            const NU = Q >= 2 ? 32 : 20;
            chassis.surf((u, v, o) => edge(u, v, 0.152, o), NU, 2, BLACK, SATIN);
            chassis.surf((u, v, o) => edge(u, v, 0.134, o), NU, 2, BLACK, SATIN, true);
            chassis.surf((u, v, o) => edge(u, 1, lerp(0.134, 0.152, v), o), NU, 1, BLACK, SATIN, true);
        }

        // ---- What the clear coat and the glass mirror: the sky with its low clouds, a line of forest standing on the
        // horizon and the ground under it (the scene's own environment is the clear sky alone, and too coarse to be
        // seen in a mirror), and the sun itself as a glint.
        const uTrees = uniform(0.1);                      // how high the tree line stands, seen from where the car is
        const sunLit = skyLights && skyLights[0] && skyLights[0].colorNode ? skyLights[0].colorNode : atmosphere.uSunColor;
        const gloss = (F0, rough, most) => {
            const V = normalize(cameraPosition.sub(positionWorld)), N = normalize(normalWorld), NdV = saturate(dot(N, V)), R = reflect(V.negate(), N);
            const fres = float(1).sub(NdV).pow(5.0).mul(1 - F0).add(F0);
            const dir = normalize(vec3(R.x, max(R.y, 0.03), R.z)), far = float(2300).sub(positionWorld.y).div(dir.y), over = positionWorld.xz.add(dir.xz.mul(far));
            // (the low cloud deck, read through the function that casts its shadow)
            const cloud = float(1).sub(atmosphere.cloudShadow(vec3(over.x, 2300, over.y))).div(0.55).mul(exp(far.mul(-0.000085))).mul(smoothstep(0.0, 0.07, dir.y)).mul(0.5);
            const sky = mix(atmosphere.skyLookup(dir), atmosphere.uSunColor.mul(0.1).add(atmosphere.skyLookup(vec3(0, 1, 0)).mul(1.7)), cloud);
            const az = atan(R.z, R.x.add(1e-6)), trees = uTrees.add(sin(az.mul(9.0)).mul(0.02)).add(sin(az.mul(23.0).add(1.7)).mul(0.012));
            let c = mix(col('#222b1a').mul(daylight).mul(0.5), sky, smoothstep(-0.03, 0.03, R.y.sub(trees)));
            c = mix(col('#5c6a30').mul(daylight).mul(0.45), c, smoothstep(-0.1, -0.02, R.y));
            // the sun in it: a small hard highlight, widened where the surface turns faster than a pixel can show
            const H = normalize(atmosphere.uSunDir.add(V)), NdH = saturate(dot(N, H)), dx = dFdx(N), dy = dFdy(N);
            const a2 = min(dot(dx, dx).add(dot(dy, dy)).mul(0.5), 0.2).add(rough ** 4);
            const D = a2.div(NdH.mul(NdH).mul(a2.sub(1)).add(1).pow(2.0).mul(3.1416));
            const glint = min(sunLit.mul(D).mul(float(1).sub(saturate(dot(V, H))).pow(5.0).mul(1 - F0).add(F0)).mul(0.25).div(max(NdV, 0.3)).mul(smoothstep(0.0, 0.08, dot(N, atmosphere.uSunDir))), atmosphere.uSunColor.mul(most));
            return { fres, shine: c.mul(fres).add(glint) };
        };
        // ---- paint: a red metallic under that clear coat, and everything that is let into the skin (lamps, grilles,
        // shut lines, the tray underneath) drawn on it by where a point is
        const paint = new THREE.MeshStandardNodeMaterial();
        {
            const p = positionGeometry, n = normalGeometry, az = abs(p.z);
            const band = (v, a, b, e = 0.01) => smoothstep(a - e, a + e, v).mul(smoothstep(b + e, b - e, v));
            // a line that goes faint, not ragged, when it is thinner than a pixel
            const line = (d, w) => { const aa = max(fwidth(d), 1e-5); return saturate(float(w).sub(abs(d)).div(aa).add(0.5)).mul(saturate(float(2 * w).div(aa))); };
            const down = smoothstep(-0.5, -0.8, n.y), aft = smoothstep(-0.1, -0.45, n.x), fore = smoothstep(0.3, 0.5, n.x), up = smoothstep(0.25, 0.5, n.y), flank = smoothstep(0.66, 0.7, az);
            // underneath: a tray of dark metal, the battery's ribbed cover let into it, and round that the loop of
            // light that holds the car up
            const floor = down.mul(smoothstep(0.45, 0.4, p.y));
            const fq = vec2(abs(p.x.sub(0.03)).sub(0.6), az.sub(0.2));
            const loopD = length(max(fq, 0.0)).add(min(max(fq.x, fq.y), 0.0)).sub(0.26);
            const loop = smoothstep(0.034, 0.024, abs(loopD)).mul(floor), halo = exp(abs(loopD).mul(-11.0)).mul(floor);
            const pack = smoothstep(-0.075, -0.09, loopD).mul(floor);
            const ribs = smoothstep(0.3, 0.4, abs(fract(p.x.mul(7.0)).sub(0.5)));
            const trayLines = max(max(line(p.x.sub(1.02), 0.004), line(p.x.add(1.0), 0.004)), line(loopD.sub(0.07), 0.004)).mul(floor);
            // the sills, rising into a valance under the tail; the mouth under the nose; the intake in each flank
            const sill = smoothstep(0.012, -0.012, p.y.sub(smoothstep(-1.4, -1.92, p.x).mul(0.2).add(0.215)));
            const mouth = fore.mul(smoothstep(1.0, 0.86, pow(az.div(0.52), 4.0).add(pow(abs(p.y.sub(0.272)).div(0.062), 4.0))));
            const intake = band(p.x, -0.75, -0.655, 0.008).mul(band(p.y, 0.33, 0.63, 0.02)).mul(flank);                // (a hole: it takes no light)
            // head lamps: a slim leaf of dark glass along each wing, a line of light down it and three small lamps
            const hx = p.x.sub(1.66), hz = az.sub(0.615), hu = hx.mul(0.866).sub(hz.mul(0.5)), hv = hx.mul(0.5).add(hz.mul(0.866));
            const hq = hu.div(0.26), leaf = float(1).sub(hq.mul(hq)).max(0.0);       // (squared by hand: `pow` of a negative number has no defined answer in a shader)
            const lamp = smoothstep(1.0, 0.88, abs(hv).div(leaf.mul(0.072).add(1e-4))).mul(smoothstep(0.26, 0.25, abs(hu))).mul(smoothstep(0.42, 0.46, p.y)).mul(smoothstep(0.0, 0.12, n.y));
            const brow = line(hv.add(leaf.mul(0.03)), 0.007).mul(smoothstep(0.235, 0.2, abs(hu))).mul(lamp);
            const dots = min(min(length(vec2(hu.sub(0.11), hv.sub(leaf.mul(0.022)))), length(vec2(hu.sub(0.03), hv.sub(leaf.mul(0.022))))), length(vec2(hu.add(0.05), hv.sub(leaf.mul(0.022)))));
            const ring = band(dots, 0.015, 0.021, 0.002).mul(lamp), beam = smoothstep(0.014, 0.002, dots).mul(lamp);
            // (and a dash of light either side of the mouth, which is what shows of its face from below)
            const dash = fore.mul(band(az, 0.57, 0.7, 0.008)).mul(band(p.y, 0.266, 0.284, 0.004));
            // the tail lamp: one strip of red across the back and a little way round each corner
            const lensR = band(p.y, 0.68, 0.775, 0.006).mul(aft).mul(smoothstep(-1.55, -1.62, p.x));
            const bar = band(p.y, 0.712, 0.745, 0.006).mul(lensR);
            const fog = aft.mul(band(az, -0.1, 0.035, 0.004)).mul(band(p.y, 0.33, 0.4, 0.006)).mul(smoothstep(-1.8, -1.85, p.x));
            // shut lines: the doors, the bonnet, the lid over the tail
            const doorF = p.x.sub(0.43).sub(p.y.sub(0.5).mul(0.07)), doorR = p.x.add(0.57).add(p.y.sub(0.5).mul(0.1));
            const door = max(max(line(doorF, 0.004), line(doorR, 0.004)).mul(smoothstep(0.255, 0.265, p.y)), line(p.y.sub(0.262), 0.004).mul(smoothstep(0.0, 0.01, doorF.negate())).mul(smoothstep(0.0, 0.01, doorR))).mul(flank);
            const bonnet = line(pow(pow(abs(p.x.sub(1.14)).div(0.6), 4.0).add(pow(az.div(p.x.sub(0.54).mul(-0.13).add(0.58)), 4.0)), 0.25).sub(1.0).mul(0.52), 0.004).mul(up).mul(smoothstep(0.52, 0.56, p.x));
            const lid = line(pow(pow(abs(p.x.add(1.42)).div(0.4), 4.0).add(pow(az.div(0.6), 4.0)), 0.25).sub(1.0).mul(0.5), 0.004).mul(up);
            const lines = saturate(max(max(door, bonnet), lid));
            const plastic = saturate(max(sill, max(mouth, intake))).mul(float(1).sub(floor)), dark = saturate(plastic.add(floor)), coat = float(1).sub(dark);
            const slats = smoothstep(-0.2, 0.5, sin(p.y.mul(6.2832 / 0.03))).mul(smoothstep(0.33, 0.24, p.y));
            const gl = gloss(0.05, 0.17, 1.4);
            let c = col('#96091a');
            c = mix(c, vec3(0.07, 0.002, 0.003), lensR);
            c = mix(c, vec3(0.014), lamp);
            c = mix(c, vec3(0.6, 0.62, 0.65), ring);
            c = mix(c, vec3(0.006), lines.mul(0.92));
            c = c.mul(float(1).sub(gl.fres));                                              // what the coat throws back never reaches the paint
            c = mix(c, mix(vec3(0.014), mix(vec3(0.002), vec3(0.05), slats), mouth), plastic);
            c = mix(c, vec3(0.002), intake);
            const tunnel = smoothstep(-1.28, -1.4, p.x);
            const tray = mix(mix(mix(vec3(0.045), mix(vec3(0.03), vec3(0.075), ribs), pack), vec3(0.008), trayLines), vec3(0.008), tunnel);
            c = mix(c, tray, floor);
            paint.colorNode = c;
            paint.roughnessNode = mix(mix(mix(float(0.42), float(0.2), max(lamp, lensR)), float(0.62), plastic), mix(float(0.5), float(0.9), tunnel), floor);
            paint.metalnessNode = mix(mix(mix(float(0.55), float(0.9), lamp), intake, plastic), mix(float(0.5), float(0.0), tunnel), floor);
            paint.emissiveNode = vec3(0.92, 0.96, 1.0).mul(beam.mul(1.6).add(brow.mul(3.2)).add(dash.mul(2.6))).add(vec3(1.0, 0.014, 0.01).mul(bar.mul(2.3).add(fog.mul(1.6)))).add(col('#7cc4ff').mul(loop.mul(1.1).add(halo.mul(0.1)).add(tray.x.mul(exp(abs(loopD).mul(-4.5))).mul(floor).mul(1.6)))).add(gl.shine.mul(coat));
        }
        add(new THREE.Mesh(shell.build(), paint), g);
        // everything that is not paint or glass: one material, told what it is at every corner
        const parts = new THREE.MeshStandardNodeMaterial();
        { const t = attribute('tint', 'vec3'), k = attribute('pbr', 'vec3'); parts.colorNode = t; parts.roughnessNode = k.x; parts.metalnessNode = k.y; parts.emissiveNode = t.mul(k.z); }
        add(new THREE.Mesh(chassis.build(), parts), g);
        // the glass: tinted, darker along its top; what is behind it shows through square on, and the sky lies on it
        // seen along it (its light is added to what is behind, which the tint has dimmed)
        {
            const pane = bag();
            pane.surf((u, v, o) => { const a = u * 2 - 1; return screenAt(a, v * screenTop(a), o); }, Q >= 2 ? 20 : 12, Q >= 2 ? 6 : 4, NONE, NONE, true);
            const glass = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
            // (and along its foot the black band a screen is bonded by, which also hides where it meets the body)
            const gl = gloss(0.08, 0.1, 0.6), frit = smoothstep(0.83, 0.812, positionGeometry.y), through = mix(float(0.62), float(0.3), smoothstep(1.02, 1.13, positionGeometry.y)).mul(float(1).sub(frit));
            glass.colorNode = gl.shine.add(vec3(0.012, 0.02, 0.024).mul(daylight).mul(float(1).sub(frit)));
            glass.opacityNode = float(1).sub(through.mul(float(1).sub(gl.fres)));
            const m = new THREE.Mesh(pane.build(), glass); m.renderOrder = 20; add(m, g, false);
        }

        // ---- a wheel: tyre, rim, ten spokes, a disc behind them. Its outer face looks along +z.
        const wheelGeo = (() => {
            const b = bag(), SEG = [18, 22, 26, 28][Q], R = 0.32, HW = 0.108, RR = 0.214, up = new THREE.Matrix4().makeRotationX(Math.PI / 2);
            const lathe = (pts, seg = SEG) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
            const rubber = lin('#1c1c1e'), iron = lin('#84878c');
            const wall = [[RR + 0.004, -HW + 0.03], [RR + 0.006, -HW + 0.006], [RR + 0.03, -HW - 0.002], [RR + 0.06, -HW - 0.006], [R - 0.045, -HW - 0.002], [R - 0.016, -HW + 0.014], [R - 0.003, -HW + 0.04], [R, -HW * 0.45]];
            b.put(lathe(wall.concat([[R + 0.001, 0]], wall.slice().reverse().map(([r, y]) => [r, -y]))), up, rubber, [0.82, 0, 0]);
            b.put(lathe([[RR + 0.012, HW - 0.03], [RR + 0.014, HW - 0.006], [RR + 0.006, HW + 0.002], [RR - 0.006, HW - 0.004], [RR - 0.012, HW - 0.024], [RR - 0.02, HW - 0.05], [RR - 0.026, 0], [RR - 0.026, -HW + 0.02], [RR - 0.01, -HW + 0.004]]), up, ALLOY, [0.28, 1, 0]);
            const ZH = HW - 0.046, r0 = 0.05, r1 = RR - 0.014;
            for (let k = 0; k < 10; k++) {
                const th = (k / 10) * 6.2832, cx = Math.cos(th), sx = Math.sin(th);
                const rail = (u, side, back, out) => { const r = lerp(r0, r1, u), w = lerp(0.038, 0.022, u) + 0.012 * u ** 6, z = lerp(HW - 0.05, HW - 0.018, u ** 1.7) - back * lerp(0.04, 0.02, u); return set3(out, cx * r - (sx * side * w) / 2, sx * r + (cx * side * w) / 2, z); };
                b.surf((u, v, out) => rail(u, v * 2 - 1, 0, out), 4, 1, ALLOY, [0.26, 1, 0]);
                b.surf((u, v, out) => rail(u, 1, v, out), 4, 1, ALLOY, [0.34, 1, 0]);
                b.surf((u, v, out) => rail(u, -1, v, out), 4, 1, ALLOY, [0.34, 1, 0], true);
            }
            b.put(lathe([[0.07, ZH - 0.035], [0.068, ZH - 0.004], [0.06, ZH], [0.03, ZH + 0.006], [0, ZH + 0.008]], 20), up, ALLOY, [0.26, 1, 0]);
            if (Q >= 2) for (let k = 0; k < 5; k++) { const th = (k / 5) * 6.2832 + 0.3; b.put(new THREE.CylinderGeometry(0.008, 0.008, 0.014, 6), at(Math.cos(th) * 0.042, Math.sin(th) * 0.042, ZH + 0.008, Math.PI / 2), STEEL, [0.4, 1, 0]); }
            const ZD = HW - 0.09;
            b.put(lathe([[0.176, ZD - 0.014], [0.176, ZD - 0.0005], [0.1755, ZD], [0.09, ZD], [0.075, ZD + 0.02]], Math.max(16, SEG - 8)), up, iron, [0.38, 1, 0]);
            // (and a shield behind the disc, so that the wheel is closed when it is seen from under the car)
            b.put(lathe([[0, ZD - 0.03], [0.186, ZD - 0.03], [0.186, ZD - 0.018], [0, ZD - 0.018]], 16), up, BLACK, [0.7, 0.3, 0]);
            return b.build();
        })();
        const wheels = [];
        for (const [wx, wz, wy, k, kw] of [[1.22, 0.765, 0.33, 1.03, 1], [1.22, -0.765, 0.33, 1.03, 1], [-1.22, 0.79, 0.345, 1.078, 1.16], [-1.22, -0.79, 0.345, 1.078, 1.16]]) {
            const w = new THREE.Group(); w.position.set(wx, wy, wz); g.add(w);
            const m = add(new THREE.Mesh(wheelGeo, parts), w); m.scale.set(k, k, kw); if (wz < 0) m.rotation.x = Math.PI;
            wheels.push(w);
        }
        // what holds it up: a sheet of light under the floor
        const padM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        { const d = uv().sub(0.5).mul(2.0); padM.colorNode = col('#7cc4ff').mul(pow(smoothstep(1.0, 0.0, length(d)), 2.0).mul(0.1)); padM.fog = false; }
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.9).rotateX(Math.PI / 2), padM); pad.position.set(0.03, 0.1, 0); pad.renderOrder = 21; g.add(pad);
        const pads = [null, null, wheels[2], wheels[3]];
        const RATE = quality.post >= 2 ? 340 : 175;
        const trail = sprites({ count: quality.post >= 2 ? 560 : 300, life: 0.62, size0: 0.36, size1: 0.2, tint: '#9ad4ff', gain: 3.0, additive: true, lit: false, opacity: 0.5, order: 21 });

        // the loop it flies, given as [ahead, to the right, above the eye] of this stop's camera
        // (a lap it can be watched all the way round: out to the far side high, back past the lens low and slow)
        const ctrl = [[66, 5, 9], [59, 21, 8], [41, 28, 5], [25, 21, 2.2], [15, 5, 0.3], [22, -11, 1.3], [40, -17, 4.4], [58, -11, 8]];
        const pts = ctrl.map(([f, r, h]) => { const q = pl.at(f, r); return [q.x, Math.max(ground(q.x, q.z) + 3.4, pl.cam[1] + h), q.z]; });
        const N = 720, tab = new Float32Array(N + 1), a = [0, 0, 0], b = [0, 0, 0];
        loopAt(pts, 0, a);
        for (let i = 1; i <= N; i++) {
            loopAt(pts, (i / N) * pts.length, b);
            const ds = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
            // unhurried where it can be seen well, quick round the back
            const v = lerp(9.5, 27, ss(18, 58, Math.hypot(b[0] - pl.cam[0], b[2] - pl.cam[2])));
            tab[i] = tab[i - 1] + ds / v;
            if (b[1] - ground(b[0], b[2]) < 22 && i % 12 === 0) clear.push([b[0], b[2], 8.5]);
            a[0] = b[0]; a[1] = b[1]; a[2] = b[2];
        }
        const period = tab[N];
        const uAt = (time) => { const tt = ((time % period) + period) % period; let lo = 0, hi = N; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tab[mid] <= tt) lo = mid; else hi = mid; } return ((lo + (tt - tab[lo]) / (tab[hi] - tab[lo] || 1)) / N) * pts.length; };
        const p0 = [0, 0, 0], p1 = [0, 0, 0], p2 = [0, 0, 0], e = new THREE.Euler(0, 0, 0, 'YXZ'), wv = new THREE.Vector3();
        let bank = 0, emit = 0; const padPrev = {};
        const START = period * 0.86;                 // so that it is already on its way in when the stop is reached
        sets.push({
            x: pl.cam[0], z: pl.cam[2], range: 900,
            show(near) { g.visible = near; car.near = near; },
            run(t, dt) {
                const u = uAt(t + START);
                loopAt(pts, u, p0); loopAt(pts, u + 0.02, p1); loopAt(pts, u + 0.04, p2);
                const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], hl = Math.hypot(dx, dz) || 1;
                const yaw = Math.atan2(-dz, dx), yaw2 = Math.atan2(-(p2[2] - p1[2]), p2[0] - p1[0]);
                const turn = wrap(yaw2 - yaw) / 0.02;                       // per unit of the loop: enough to tell which way and how hard
                bank += (cl(-turn * 0.5, -0.75, 0.75) - bank) * Math.min(1, (dt || 0.016) * 3);
                const bob = 0.12 * Math.sin(t * 2.3);
                g.position.set(p0[0], p0[1] + bob, p0[2]);
                e.set(bank, yaw, Math.atan2(dy, hl) * 0.8 + 0.03 * Math.sin(t * 1.7));
                g.quaternion.setFromEuler(e);
                car.pos.copy(g.position);
                uTrees.value = cl((14 - (p0[1] - ground(p0[0], p0[2]))) / 45, -0.12, 0.3);      // from up high the forest is below the horizon
                // light spilt from the rear pads, left behind as a trail
                // (each frame's share is laid along the way the pads came since the last one, each born at its
                // own moment: at thirty frames a second they would otherwise leave the car in clumps)
                emit += dt * RATE;
                const nNew = Math.floor(emit); emit -= nNew;
                for (const k of [2, 3]) {
                    pads[k].getWorldPosition(wv);
                    const pv = padPrev[k] || (padPrev[k] = wv.clone()), jump = pv.distanceTo(wv) > 6;
                    for (let j = 1; j <= nNew; j++) { const f = jump ? 1 : j / nNew; trail.spawn(pv.x + (wv.x - pv.x) * f, pv.y + (wv.y - pv.y) * f - 0.3, pv.z + (wv.z - pv.z) * f, 0, -0.3, 0, 1, 0, 0, 0, jump ? 0 : dt * (1 - f)); }
                    pv.copy(wv);
                }
                for (const w of wheels) w.rotation.z = -t * 9;
                // the rex watches it go by
                const rex = fauna && fauna.rex;
                if (rex && rex.act && fauna.rexPlace === pl.index) {
                    const rel = wrap(Math.atan2(p0[0] - rex.x, -(p0[2] - rex.z)) - rex.heading), el = Math.atan2(p0[1] - (rex.mesh.position.y + 4.5), Math.hypot(p0[0] - rex.x, p0[2] - rex.z));
                    const gz = rex.act.gaze || (rex.act.gaze = [0, 0]);
                    const k = Math.min(1, (dt || 0.016) * 4);
                    gz[0] += (cl(-rel, -1.0, 1.0) - gz[0]) * k; gz[1] += (cl(el, -0.2, 0.55) - gz[1]) * k;
                }
            },
        });
    }

    car.group.traverse((o) => { o.userData.footprint = false; });   // (it flies: it stands on nothing, wherever it is parked while the footprints are drawn)

    // ==== the speaker in the lagoon ====================================================
    // A stage stack on a boulder: a sub below, a three-way cabinet on it. One count runs all of it. The rings on
    // the water are a wave that water.js sends out from here at a fixed rate; a bar of the music is one of those
    // rings, counted from the moment its crest comes out from under the rock, and the cones, the light round
    // them, the meter and the drops thrown off the water are all read from that count. So sound and water agree,
    // and everything is a function of the clock: a still can be replayed.
    {
        const pl = P('music'), sp = pl.speaker;
        const g = new THREE.Group(); group.add(g);
        // toward the lens
        const yaw = Math.atan2(pl.cam[0] - sp.x, pl.cam[2] - sp.z) + 0.18;
        const HI = quality.post >= 2, MID = quality.post === 1;          // ultra and high; medium; otherwise low
        const TAU = Math.PI * 2, DEG = Math.PI / 180;
        const TOP = 0.62, SC = 1.45;                      // how far the rock stands out of the water; how large the stack is built
        const lin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
        // the beat. water.js tilts the water by sin(RING_K * r - RING_W * t), so a crest stands wherever that phase is a whole
        // turn: the count of bars is the count of crests that have come out from under the rock's rim, BORN metres from the
        // middle, where a ring first shows. (That also puts the stills, taken at seven seconds, a moment after a kick.)
        const RING_W = 5.6, RING_K = 2.1, BORN = 3.29, BAR = TAU / RING_W, BAR0 = (-RING_K * BORN) / TAU;
        const uKick = uniform(0), uSnare = uniform(0), uGlow = uniform(0), uLevel = uniform(0);

        // ---- how the parts are made: a profile carried round a path (a circle for anything turned, a rounded
        // rectangle for anything boxed), gathered into one geometry with what its material needs to know at
        // each vertex: `col`, `fin` (four numbers) and `aux` (two)
        const bag = () => ({ p: [], n: [], c: [], f: [], x: [], i: [] });
        const vert = (b, px, py, pz, nx, ny, nz, c, f, x) => { b.p.push(px, py, pz); b.n.push(nx, ny, nz); b.c.push(c[0], c[1], c[2]); b.f.push(f[0], f[1], f[2], f[3]); b.x.push(x ? x[0] : 1, x ? x[1] : 0); return b.p.length / 3 - 1; };
        // (a triangle is wound to face the way its corners' normals do, so no builder has to think about it)
        const tri = (b, i0, i1, i2) => {
            const p = b.p, n = b.n, a = i0 * 3, e = i1 * 3, c = i2 * 3;
            const ux = p[e] - p[a], uy = p[e + 1] - p[a + 1], uz = p[e + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
            const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
            if (fx * fx + fy * fy + fz * fz < 1e-16) return;
            if (fx * (n[a] + n[e] + n[c]) + fy * (n[a + 1] + n[e + 1] + n[c + 1]) + fz * (n[a + 2] + n[e + 2] + n[c + 2]) < 0) b.i.push(i0, i2, i1); else b.i.push(i0, i1, i2);
        };
        const circle = (M) => (o) => { const xy = [], out = []; for (let k = 0; k < M; k++) { const a = (k / M) * TAU, c = Math.cos(a), s = Math.sin(a); out.push(c, s); xy.push(o * c, o * s); } return { xy, out }; };
        const rounded = (hw, hh, r0, nc) => (o, rc = Math.max(0, r0 + o)) => {
            const xy = [], out = [], w = hw + o, h = hh + o; rc = Math.min(rc, w, h);
            for (let q = 0; q < 4; q++) { const sx = q === 0 || q === 3 ? 1 : -1, sy = q < 2 ? 1 : -1; for (let k = 0; k <= nc; k++) { const a = ((q + k / nc) * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a); out.push(c, s); xy.push(sx * (w - rc) + rc * c, sy * (h - rc) + rc * s); } }
            return { xy, out };
        };
        const val = (v, i, pt) => (typeof v === 'function' ? v(i, pt) : v);
        // runs: [{ pts: [[out from the path, along the axis, the normal's angle?, the path's corner radius?], …], c, f, x }].
        // A run is shaded smooth; two runs share no vertices, so the edge between them stays crisp.
        const skin = (b, path, runs) => {
            for (const run of runs) {
                const pts = run.pts; let prev = -1;
                for (let i = 0; i < pts.length; i++) {
                    const [o, z, na, rc] = pts[i];
                    let no = 0, nz = 0;
                    if (na !== undefined && na !== null) { no = Math.cos(na); nz = Math.sin(na); }
                    else { if (i > 0) { no += z - pts[i - 1][1]; nz -= o - pts[i - 1][0]; } if (i < pts.length - 1) { no += pts[i + 1][1] - z; nz -= pts[i + 1][0] - o; } const l = Math.hypot(no, nz) || 1; no /= l; nz /= l; }
                    const r = path(o, rc === null ? undefined : rc), M = r.xy.length / 2, base = b.p.length / 3;
                    const c = val(run.c, i, pts[i]), f = val(run.f, i, pts[i]), x = val(run.x, i, pts[i]);
                    for (let k = 0; k < M; k++) vert(b, r.xy[k * 2], r.xy[k * 2 + 1], z, r.out[k * 2] * no, r.out[k * 2 + 1] * no, nz, c, f, x);
                    if (prev >= 0) for (let k = 0; k < M; k++) { const k1 = (k + 1) % M; tri(b, prev + k, base + k, prev + k1); tri(b, prev + k1, base + k, base + k1); }
                    prev = base;
                }
            }
            return b;
        };
        const cap = (b, r, z, nz, fin) => { const M = r.xy.length / 2, c0 = vert(b, 0, 0, z, 0, 0, nz, fin.c, fin.f, fin.x); for (let k = 0; k < M; k++) vert(b, r.xy[k * 2], r.xy[k * 2 + 1], z, 0, 0, nz, fin.c, fin.f, fin.x); for (let k = 0; k < M; k++) tri(b, c0, c0 + 1 + k, c0 + 1 + ((k + 1) % M)); return b; };
        const _v = new THREE.Vector3(), _m3 = new THREE.Matrix3();
        const put = (dst, src, m) => {
            const base = dst.p.length / 3; if (m) _m3.getNormalMatrix(m);
            for (let k = 0; k < src.p.length; k += 3) {
                _v.set(src.p[k], src.p[k + 1], src.p[k + 2]); if (m) _v.applyMatrix4(m); dst.p.push(_v.x, _v.y, _v.z);
                _v.set(src.n[k], src.n[k + 1], src.n[k + 2]); if (m) _v.applyMatrix3(_m3).normalize(); dst.n.push(_v.x, _v.y, _v.z);
            }
            for (const v of src.c) dst.c.push(v); for (const v of src.f) dst.f.push(v); for (const v of src.x) dst.x.push(v); for (const v of src.i) dst.i.push(base + v);
            return dst;
        };
        const raw = (geo, fin) => { const b = bag(), gp = geo.attributes.position, gn = geo.attributes.normal, ix = geo.index; for (let k = 0; k < gp.count; k++) vert(b, gp.getX(k), gp.getY(k), gp.getZ(k), gn.getX(k), gn.getY(k), gn.getZ(k), fin.c, fin.f, fin.x); for (let k = 0; k < (ix ? ix.count : gp.count); k++) b.i.push(ix ? ix.getX(k) : k); return b; };
        // normals from the faces, for shapes that are not a profile round a path
        const smooth = (b) => {
            const p = b.p, n = b.n; n.fill(0);
            for (let k = 0; k < b.i.length; k += 3) {
                const a = b.i[k] * 3, e = b.i[k + 1] * 3, c = b.i[k + 2] * 3;
                const ux = p[e] - p[a], uy = p[e + 1] - p[a + 1], uz = p[e + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
                const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
                for (const q of [a, e, c]) { n[q] += fx; n[q + 1] += fy; n[q + 2] += fz; }
            }
            for (let k = 0; k < n.length; k += 3) { const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1; n[k] /= l; n[k + 1] /= l; n[k + 2] /= l; }
            return b;
        };
        const solid = (b, names = ['col', 'fin']) => {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
            if (names.includes('col')) geo.setAttribute('col', new THREE.Float32BufferAttribute(b.c, 3));
            if (names.includes('fin')) geo.setAttribute('fin', new THREE.Float32BufferAttribute(b.f, 4));
            if (names.includes('aux')) geo.setAttribute('aux', new THREE.Float32BufferAttribute(b.x, 2));
            geo.setIndex(b.i);
            return geo;
        };
        const arc = (co, cz, r, a0, a1, n) => { const a = []; for (let i = 0; i <= n; i++) { const t = (a0 + ((a1 - a0) * i) / n) * DEG; a.push([co + r * Math.cos(t), cz + r * Math.sin(t), t]); } return a; };
        const steps = (n, f) => { const a = []; for (let i = 0; i <= n; i++) a.push(f(i / n)); return a; };
        const T = (x, y, z, s = 1) => new THREE.Matrix4().makeTranslation(x, y, z).scale(_v.set(s, s, s));
        const rpath = (q, cx, cy, hw, hh, r) => { q.moveTo(cx + hw - r, cy - hh); q.absarc(cx + hw - r, cy - hh + r, r, -90 * DEG, 0); q.absarc(cx + hw - r, cy + hh - r, r, 0, 90 * DEG); q.absarc(cx - hw + r, cy + hh - r, r, 90 * DEG, 180 * DEG); q.absarc(cx - hw + r, cy - hh + r, r, 180 * DEG, 270 * DEG); q.closePath(); return q; };
        const round = (x, y, r) => new THREE.Path().absarc(x, y, r, 0, TAU, true);

        // ---- the stack: a sub below, a three-way cabinet on top, their fronts in one plane
        const stack = new THREE.Group(); stack.position.y = TOP - 0.03; stack.rotation.z = 0.02; stack.scale.setScalar(SC); g.add(stack);
        const body = bag(), live = bag();                 // what stands still; what the sound moves or lights
        const NC = HI ? 6 : MID ? 4 : 3, NA = HI ? 5 : 3, SEG = HI ? 64 : MID ? 48 : 36;
        const RHO = 0.09, LIP = 0.14, BEV = 0.035, REC = 0.1, RIN = 0.12, FOOT = 0.07;
        // fin of what stands still: roughness, metalness, what it is (0 plain, 1 tolex, 2 the baffle's board, 3 plain and set
        // into the front, where the sun never comes), how much sky reaches it
        const TOLEX = { c: lin('#1b1b1e'), f: [0.56, 0, 1, 1] }, BOARD = { c: lin('#18181b'), f: [0.82, 0, 2, 1] };
        const CHROME = { c: lin('#cfd2d6'), f: [0.27, 1, 0, 1] }, ALU = { c: lin('#9fa3aa'), f: [0.36, 1, 3, 1] }, TRIM = { c: lin('#74777d'), f: [0.3, 1, 3, 1] };
        const CAST = { c: lin('#2b2d31'), f: [0.5, 0.6, 0, 1] }, RUBBER = { c: lin('#0c0c0d'), f: [0.85, 0, 0, 1] }, BLACK = { c: lin('#08080a'), f: [0.36, 0, 3, 1] }, BOLT = { c: lin('#18191c'), f: [0.42, 0.8, 3, 1] };
        const PAPER = lin('#74777e'), DOME = lin('#c3c6cc');
        const shaded = (fin, ao) => ({ c: fin.c, f: [fin.f[0], fin.f[1], fin.f[2], ao] });
        const SUB = { w: 2.5, h: 2.3, d: 1.9, y: FOOT, z: 0, grip: 0.42 }, TOPC = { w: 2.3, h: 2.5, d: 1.6, y: FOOT + 2.3 + 0.05, z: 0.15, grip: 0.5 };       // (its feet sit in cups in the top of the sub)
        for (const c of [SUB, TOPC]) { c.yc = c.y + c.h / 2; c.zb = c.z + c.d / 2 - REC; }

        // a corner protector: a steel cap pressed to fit the corner, three rounded legs with a boss at the point, its
        // edge rolled under, a screw through each leg
        const corner = (b, H, S) => {
            const n = HI ? 7 : MID ? 5 : 4, L = 0.22, seen = new Map(), cb = bag(), SCREW = { c: BOLT.c, f: [0.42, 0.8, 0, 1] };
            // a point of the cabinet's own surface pushed out by `e`: on face A, `a` and `c` from the corner along its two edges
            const on = (A, a, c, e) => {
                const B = (A + 1) % 3, C = (A + 2) % 3, p = [0, 0, 0]; p[A] = S[A] * H[A]; p[B] = S[B] * (H[B] - a); p[C] = S[C] * (H[C] - c);
                const q = p.map((v, k) => cl(v, -(H[k] - RHO), H[k] - RHO)), d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], dl = Math.hypot(d[0], d[1], d[2]) || 1;
                return { p, n: d.map((v) => v / dl), at: q.map((v, k) => v + (d[k] / dl) * (RHO + e)) };
            };
            const at = (A, i, j) => {
                const k = Math.max(i, j), l = Math.hypot(i, j) || 1, m = k > n ? 1.07 : k / n, e = k > n ? -0.004 : 0.011 + 0.014 * (1 - m) * (1 - m);
                const v = on(A, (L * m * i) / l, (L * m * j) / l, e), key = v.p.map((x) => Math.round(x * 2e4)).join();
                if (seen.has(key)) return seen.get(key);
                let nr = v.n;
                if (k > n) {
                    // the rolled edge faces half outward
                    const u = on(A, (L * i) / l, (L * j) / l, 0.011), t = v.at.map((x, q) => x - u.at[q]), dn = t[0] * nr[0] + t[1] * nr[1] + t[2] * nr[2], tt = t.map((x, q) => x - nr[q] * dn), tl = Math.hypot(tt[0], tt[1], tt[2]) || 1;
                    nr = nr.map((x, q) => x + tt[q] / tl); const nl = Math.hypot(nr[0], nr[1], nr[2]); nr = nr.map((x) => x / nl);
                }
                const id = vert(cb, v.at[0], v.at[1], v.at[2], nr[0], nr[1], nr[2], CHROME.c, CHROME.f);
                seen.set(key, id); return id;
            };
            for (let A = 0; A < 3; A++) for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { const a = at(A, i, j), e = at(A, i + 1, j), c = at(A, i, j + 1), d = at(A, i + 1, j + 1); tri(cb, a, e, c); tri(cb, e, d, c); }
            for (let A = 0; A < 3; A++) {
                const v = on(A, 0.132, 0.132, 0.017), B = (A + 1) % 3, C = (A + 2) % 3, ax = [0, 0, 0], NB = HI ? 10 : 6; ax[A] = S[A];
                const c0 = vert(cb, v.at[0], v.at[1], v.at[2], ax[0], ax[1], ax[2], SCREW.c, SCREW.f);
                for (let k = 0; k < NB; k++) { const t = (k / NB) * TAU, q = [0, 0, 0], r = [0, 0, 0]; q[B] = Math.cos(t); q[C] = Math.sin(t); for (let h = 0; h < 3; h++) r[h] = ax[h] + q[h] * 0.7; const rl = Math.hypot(r[0], r[1], r[2]); vert(cb, v.at[0] + q[0] * 0.022 - ax[0] * 0.007, v.at[1] + q[1] * 0.022 - ax[1] * 0.007, v.at[2] + q[2] * 0.022 - ax[2] * 0.007, r[0] / rl, r[1] / rl, r[2] / rl, SCREW.c, SCREW.f); }
                for (let k = 0; k < NB; k++) tri(cb, c0, c0 + 1 + k, c0 + 1 + ((k + 1) % NB));
            }
            put(b, cb);
        };
        // a cabinet: a shell with every edge rounded, a lip round the front, a bevelled trim, and the baffle set back behind
        // it with a hole cut for whatever is mounted (`holes`: paths in the baffle's own x and y)
        const cabinet = (K, holes) => {
            const hw = K.w / 2, hh = K.h / 2, hd = K.d / 2, b = bag(), path = rounded(hw, hh, RHO, NC);
            skin(b, path, [
                { ...TOLEX, pts: [...arc(-RHO, -hd + RHO, RHO, -90, 0, NA), ...arc(-RHO, hd - RHO, RHO, 0, 90, NA), [-LIP, hd, 90 * DEG, RIN]] },
                { ...TRIM, pts: [[-LIP, hd, null, RIN], [-LIP - BEV, hd - BEV, null, RIN - BEV]] },
                { c: BLACK.c, f: (i) => [0.7, 0, 3, i ? 0.35 : 0.8], pts: [[-LIP - BEV, hd - BEV, null, RIN - BEV], [-LIP - BEV, hd - REC, null, RIN - BEV]] },
            ]);
            cap(b, path(-RHO), -hd, -1, TOLEX);
            const sh = rpath(new THREE.Shape(), 0, 0, hw - LIP - BEV + 0.01, hh - LIP - BEV + 0.01, RIN - BEV);
            for (const h of holes) sh.holes.push(h);
            put(b, raw(new THREE.ShapeGeometry(sh, HI ? 12 : 7), BOARD), T(0, 0, hd - REC));
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corner(b, [hw, hh, hd], [sx, sy, sz]);
            // rubber feet
            const foot = skin(bag(), circle(HI ? 20 : 12), [{ ...RUBBER, pts: [[0.12, 0], [0.115, 0.045], ...arc(0.09, 0.045, 0.025, 0, 90, 2), [0, 0.07, 90 * DEG]] }]);
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(b, foot, T(sx * (hw - 0.3), -hh, sz * (hd - 0.3)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
            // a handle let into each side: a cast dish with a bar across it (the shell's material leaves the hole)
            const hp = rounded(0.3, 0.17, 0.07, NC), dish = bag();
            skin(dish, hp, [
                { ...CAST, pts: [[0.055, -0.004, null, 0.125], [0.048, 0.012, null, 0.118], [0.004, 0.012, null, 0.074], [-0.012, 0.0, null, 0.058]] },
                { c: CAST.c, f: (i) => [0.5, 0.6, 3, i ? 0.3 : 0.9], pts: [[-0.012, 0.0, null, 0.058], [-0.02, -0.12, null, 0.05]] },
            ]);
            cap(dish, hp(-0.02, 0.05), -0.12, 1, { c: CAST.c, f: [0.5, 0.6, 3, 0.25] });
            put(dish, raw(new THREE.CylinderGeometry(0.024, 0.024, 0.58, HI ? 14 : 8).rotateZ(Math.PI / 2), shaded(CAST, 0.7)), T(0, 0.01, -0.035));
            for (const s of [-1, 1]) put(b, dish, T(s * hw, K.grip, 0).multiply(new THREE.Matrix4().makeRotationY((s * Math.PI) / 2)));
            put(body, b, T(0, K.yc, K.z));
        };
        // a driver, written for a radius of one: the basket's rim and its bolts, the channel the light sits in, the rolled
        // surround, the cone, the dust cap. fin of what the sound moves or lights: roughness, how near the light it is, how
        // far it travels on the kick, and on the snare; aux: how much sky reaches it, and the cone's rings (or -1: bare metal)
        const driver = (K, R, dy, kick, snare, bolts) => {
            const path = circle(SEG), m = T(0, K.yc + dy, K.zb, R), rim = bag(), lv = bag(), NS = HI ? 10 : 6;
            skin(rim, path, [{ ...ALU, pts: [[1.0, -0.004], [0.984, 0.022]] }, { ...ALU, pts: [[0.984, 0.022], [0.936, 0.022]] }, { ...ALU, pts: [[0.936, 0.022], [0.918, 0.008]] }]);
            const hex = new THREE.CylinderGeometry(0.021, 0.021, 0.02, 6).rotateX(Math.PI / 2).toNonIndexed(); hex.computeVertexNormals();
            for (let k = 0; k < bolts; k++) { const a = ((k + 0.5) / bolts) * TAU; put(rim, raw(hex, BOLT), T(0.96 * Math.cos(a), 0.96 * Math.sin(a), 0.03)); }
            put(body, rim, m);
            const CAPR = 0.27, CAPH = 0.1, RS = (CAPR * CAPR + CAPH * CAPH) / (2 * CAPH), cz = (t) => -0.04 - 0.32 * Math.pow(t, 1.4);
            skin(lv, path, [
                { c: BOLT.c, f: [0.4, 0.8, 0, 0], x: [0.9, 0], pts: [[0.918, 0.008], [0.915, -0.055]] },
                { c: BLACK.c, f: [0.5, 1, 0, 0], x: [1, 0], pts: [[0.915, -0.055], [0.882, -0.055]] },
                { c: RUBBER.c, x: [0.9, 0], pts: [[0.882, -0.055], [0.88, -0.04], ...arc(0.802, -0.04, 0.06, 0, 180, NS)], f: (i) => { const w = i < 2 ? 0 : (1 - Math.cos(((i - 2) / NS) * Math.PI)) / 2; return [0.4, lerp(0.75, 0.62, w), kick * R * w, snare * R * w]; } },
                { c: PAPER, pts: steps(HI ? 12 : 7, (t) => [lerp(0.742, CAPR, t), cz(t)]), f: (i, p) => [0.62, 0.62 * Math.exp(-(0.742 - p[0]) * 4.2), kick * R, snare * R], x: (i, p) => [lerp(0.5, 0.95, (p[0] - CAPR) / (0.742 - CAPR)), p[0] * 22] },
                { c: DOME, pts: arc(0, cz(1) + CAPH - RS, RS, 90 - Math.asin(CAPR / RS) / DEG, 90, HI ? 8 : 5), f: [0.26, 0.04, kick * R, snare * R], x: (i, p) => [lerp(0.85, 0.65, p[0] / CAPR), -1] },
            ]);
            put(live, lv, m);
            return round(0, dy, R * 0.97);
        };
        // a bass port: a flared mouth and the dark of the tube behind it
        const port = (K, R, dx, dy) => {
            const path = circle(HI ? 28 : MID ? 20 : 16);
            const b = skin(bag(), path, [{ ...BLACK, pts: [[1.24, -0.01], [1.2, 0.03], [1.08, 0.03]] }, { c: BLACK.c, f: (i, p) => [0.36, 0, 3, cl(1 + p[1] * 0.9, 0.03, 1)], pts: [...arc(1.08, -0.27, 0.3, 90, 180, HI ? 6 : 4), [0.78, -2.6]] }]);
            cap(b, path(0.78), -2.6, 1, shaded(BLACK, 0.02));
            put(body, b, T(dx, K.yc + dy, K.zb, R));
            return round(dx, dy, R * 1.15);
        };
        // the horn: a flare drawn in to a slot, with a little of the same light down its throat
        const horn = (K, dy) => {
            const hw = 0.74, hh = 0.3, path = rounded(hw, hh, 0.11, NC), b = bag();
            skin(b, path, [
                { c: BLACK.c, f: [0.3, 0, 0, 0], x: [1, 0], pts: [[0.012, -0.004, null, 0.12], [0, 0.02, null, 0.11], [-0.07, 0.02, null, 0.09]] },
                { c: BLACK.c, pts: steps(HI ? 12 : 7, (t) => { const u = Math.pow(t, 1.3); return [-0.07 - 0.185 * (1 - Math.pow(1 - u, 2.4)), 0.02 - 0.44 * u, null, lerp(0.09, 0.04, u)]; }), f: (i, p) => [0.28, 0.9 * Math.pow((0.02 - p[1]) / 0.44, 2), 0, 0], x: (i, p) => [lerp(1, 0.4, (0.02 - p[1]) / 0.44), 0] },
            ]);
            cap(b, path(-0.255, 0.04), -0.42, 1, { c: BLACK.c, f: [0.5, 0.9, 0, 0], x: [0.3, 0] });
            put(live, b, T(0, K.yc + dy, K.zb));
            const hex = new THREE.CylinderGeometry(0.018, 0.018, 0.016, 6).rotateX(Math.PI / 2).toNonIndexed(); hex.computeVertexNormals();
            for (const [x, y] of [[-0.46, hh - 0.035], [0.46, hh - 0.035], [-0.46, 0.035 - hh], [0.46, 0.035 - hh], [hw - 0.035, 0], [0.035 - hw, 0]]) put(body, raw(hex, BOLT), T(x, K.yc + dy + y, K.zb + 0.026));
            return rpath(new THREE.Path(), 0, dy, hw - 0.02, hh - 0.02, 0.09);
        };
        // the meter: a strip of lamps behind glass at the bottom of a shallow well
        const meterM = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color('#050506'), roughness: 0.16 });
        {
            const u = uv(), N = 25, k = floor(u.x.mul(N)), cell = u.x.mul(N).sub(k), d = abs(k.add(0.5).div(N).sub(0.5)).mul(2.0);      // 0 in the middle, 1 at either end
            // (too far off to tell one lamp from the next, they run together rather than flicker)
            const lamp = mix(smoothstep(0.1, 0.22, cell).mul(smoothstep(0.9, 0.78, cell)), float(0.72), smoothstep(0.25, 0.7, TSL.fwidth(u.x.mul(N)))).mul(smoothstep(0.1, 0.24, u.y)).mul(smoothstep(0.9, 0.76, u.y));
            const hue = mix(mix(col('#4fe06a'), col('#ffd24a'), smoothstep(0.56, 0.62, d)), col('#ff4a3a'), smoothstep(0.8, 0.86, d));
            meterM.emissiveNode = hue.mul(lamp).mul(mix(2.4, 0.07, smoothstep(-0.02, 0.02, d.sub(uLevel))));
        }
        const meter = (K, dy) => {
            const hw = 0.62, hh = 0.05, path = rounded(hw, hh, 0.03, NC), b = bag();
            skin(b, path, [{ ...TRIM, pts: [[0.022, -0.004, null, 0.05], [0.016, 0.012, null, 0.045], [0, 0.012, null, 0.03]] }, { ...shaded(BLACK, 0.5), pts: [[0, 0.012, null, 0.03], [-0.008, -0.02, null, 0.022]] }]);
            put(body, b, T(0, K.yc + dy, K.zb));
            const face = new THREE.Mesh(new THREE.PlaneGeometry((hw - 0.004) * 2, (hh - 0.004) * 2), meterM); face.position.set(0, K.yc + dy, K.zb - 0.02); stack.add(face);
            return rpath(new THREE.Path(), 0, dy, hw + 0.008, hh + 0.008, 0.035);
        };
        {
            const holes = [driver(SUB, 0.86, 0, 0.1, 0.02, 8)];
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) holes.push(port(SUB, 0.115, sx * 0.89, sy * 0.79));
            cabinet(SUB, holes);
            cabinet(TOPC, [driver(TOPC, 0.51, -0.5, 0.04, 0.085, 6), horn(TOPC, 0.42), meter(TOPC, 0.89)]);
        }
        // (the whole shell is in the shadow map, the faces toward the sun too: with only the far ones in it the sun
        // would come in through the back and out at every hole in the baffle)
        const bodyM = new THREE.MeshStandardNodeMaterial({ shadowSide: THREE.DoubleSide });
        {
            const pg = positionGeometry, ng = normalGeometry, cA = attribute('col', 'vec3'), fA = attribute('fin', 'vec4');
            const tol = saturate(float(1).sub(abs(fA.z.sub(1.0)))), board = saturate(fA.z.sub(1.0));
            // tolex: a pebbled grain, worked out rather than looked up so that it shades cleanly close to, and let go of
            // before a pebble is as small as a pixel
            const q = pg.mul(SC * 240.0), w3 = pow(abs(ng), vec3(8.0));
            const pebble = (u, v) => { const a = u.mul(0.5).add(v.mul(0.87)), c = u.mul(0.87).sub(v.mul(0.5)); return sin(u.add(sin(v.mul(0.37).add(1.3)).mul(1.7))).mul(sin(v.mul(0.93).add(sin(u.mul(0.41)).mul(1.7)))).mul(0.6).add(sin(a.mul(1.31).add(sin(c.mul(0.33)).mul(2.1))).mul(sin(c.mul(1.19).add(1.2))).mul(0.5)); };
            const grain = pebble(q.z, q.y).mul(w3.x).add(pebble(q.x, q.z).mul(w3.y)).add(pebble(q.x, q.y).mul(w3.z)).div(w3.x.add(w3.y).add(w3.z));
            const close = smoothstep(0.95, 0.35, length(TSL.fwidth(q))).mul(tol);
            const scuff = texture(noiseTex, vec2(pg.x.add(pg.z), pg.y.add(pg.x.sub(pg.z).mul(0.5))).mul(0.31)), speck = texture(noiseTex, pg.xy.mul(2.3)).g;
            bodyM.colorNode = cA.mul(mix(float(1), mix(0.82, 1.2, scuff.g).mul(grain.mul(0.12).mul(close).add(1.0)), tol)).mul(mix(float(1), mix(0.8, 1.25, speck), board));
            bodyM.roughnessNode = fA.x.add(scuff.r.sub(0.5).mul(0.16).mul(tol));
            bodyM.metalnessNode = fA.y;
            bodyM.normalNode = reliefNormal(grain.mul(0.0008), close);
            // the lip keeps the sky off the edges of the baffle, and the cabinet above keeps it off the top of the one below
            const up = step((SUB.y + SUB.h + TOPC.y) / 2, pg.y);
            const dq = abs(pg.xy.sub(vec2(0, mix(float(SUB.yc), float(TOPC.yc), up)))).sub(vec2(mix(float(SUB.w / 2), float(TOPC.w / 2), up), mix(float(SUB.h / 2), float(TOPC.h / 2), up)).sub(LIP + BEV));
            const recess = mix(float(1), smoothstep(0.0, 0.2, max(dq.x, dq.y).negate()).mul(0.5).add(0.5), board);
            const fp = max(abs(pg.x).sub(TOPC.w / 2), abs(pg.z.sub(TOPC.z)).sub(TOPC.d / 2));
            const band = smoothstep(SUB.y + SUB.h - 0.03, SUB.y + SUB.h - 0.01, pg.y).mul(smoothstep(TOPC.y + 0.03, TOPC.y + 0.01, pg.y));
            const gap = mix(float(1), smoothstep(-0.3, 0.06, fp).mul(0.8).add(0.2), band);
            bodyM.aoNode = fA.w.mul(recess).mul(gap);
            // (and the sun: the shadow map is too coarse for a gap a hand deep, and would let it in)
            const sunny = step(fA.z, 1.5).mul(mix(float(1), smoothstep(0.06, 0.2, fp), band));
            bodyM.receivedShadowNode = TSL.Fn(([shadow]) => shadow.mul(sunny));
            // where a handle is let in, the shell is not drawn
            const hole = (K) => { const d = abs(vec2(pg.z.sub(K.z), pg.y.sub(K.yc + K.grip))).sub(vec2(0.325 - 0.09, 0.195 - 0.09)); return length(max(d, 0.0)).add(min(max(d.x, d.y), 0.0)).sub(0.09); };
            bodyM.maskNode = tol.mul(step(0.9, abs(ng.x))).mul(step(min(hole(SUB), hole(TOPC)), 0.0)).lessThan(0.5);
        }
        const liveM = new THREE.MeshStandardNodeMaterial();
        {
            const cA = attribute('col', 'vec3'), fA = attribute('fin', 'vec4'), xA = attribute('aux', 'vec2');
            // the cone, its cap and the inner edge of the surround go out and back along the driver's axis with the beat
            liveM.positionNode = positionLocal.add(vec3(0, 0, fA.z.mul(uKick).add(fA.w.mul(uSnare))));
            const ph = xA.y.mul(TAU), ringed = step(0.5, xA.y).mul(smoothstep(1.6, 0.6, TSL.fwidth(ph)));
            liveM.colorNode = cA.mul(sin(ph).mul(0.07).mul(ringed).add(1.0));
            liveM.roughnessNode = fA.x; liveM.metalnessNode = step(xA.y, -0.5);
            liveM.normalNode = reliefNormal(sin(ph).mul(0.0015), ringed);
            liveM.aoNode = xA.x;
            liveM.receivedShadowNode = TSL.Fn(([shadow]) => shadow.mul(0.0));           // set into the front: the sun never comes here
            // a strip of light in the channel behind the surround: seen directly only down the channel, and everywhere
            // else as what it throws on the rubber and the cone
            const led = mix(col('#2fc8ff'), col('#66dcf6'), uGlow);
            liveM.emissiveNode = led.mul(smoothstep(0.93, 0.97, fA.y).mul(uGlow.mul(1.5).add(1.5)).add(fA.y.mul(fA.y).mul(uGlow.mul(0.75).add(0.7)).mul(cA.g.mul(2.2).add(0.07))));
        }
        add(new THREE.Mesh(solid(body), bodyM), stack);
        add(new THREE.Mesh(solid(live, ['col', 'fin', 'aux']), liveM), stack, false);

        // ---- the rock: a wave-worn boulder with a level seat for the stack, and a few smaller ones beside it
        const cyw = Math.cos(yaw), syw = Math.sin(yaw);
        const bedAt = (x, z) => ground(sp.x + x * cyw + z * syw, sp.z - x * syw + z * cyw);
        const h2 = (i, j) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
        const vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10); return lerp(lerp(h2(i, j), h2(i + 1, j), u), lerp(h2(i, j + 1), h2(i + 1, j + 1), u), v) * 2 - 1; };
        const fbm = (x, y, oct) => { let s = 0, a = 0.5; for (let o = 0; o < oct; o++) { s += a * vn(x, y); const t = x * 1.62 + y * 1.22 + 17.1; y = y * 1.62 - x * 1.22 - 9.3; x = t; a *= 0.5; } return s; };
        // weathered rock parts along its joints: the surface is a patchwork of nearly flat faces, each set and tilted its
        // own way, and the edges between them are worn round
        const facet = (x, z, cell, seed) => {
            const gx = x / cell, gz = z / cell, ix = Math.floor(gx), iz = Math.floor(gz);
            let d1 = 1e9, d2 = 1e9, v1 = 0, v2 = 0;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const cx = ix + i, cz = iz + j, dx = gx - (cx + 0.15 + 0.7 * h2(cx + seed, cz)), dz = gz - (cz + 0.15 + 0.7 * h2(cx, cz + seed + 31)), d = Math.hypot(dx, dz);
                const v = h2(cx + seed + 7, cz - 13) - 0.5 + dx * (h2(cx - 5, cz + seed + 3) - 0.5) * 1.5 + dz * (h2(cx + 11, cz - seed - 9) - 0.5) * 1.5;
                if (d < d1) { d2 = d1; v2 = v1; d1 = d; v1 = v; } else if (d < d2) { d2 = d; v2 = v; }
            }
            return lerp((v1 + v2) / 2, v1, ss(0, 0.22, d2 - d1));
        };
        const stone = bag(), ROCK = { c: [1, 1, 1], f: [0, 0, 0, 1] };
        // a boulder as a dome over an outline that wanders: `top(x, z)` is how high it stands, and its skirt goes down into the bed
        const boulder = (cx, cz, rx, rz, NR, NS, seed, top) => {
            const c0 = vert(stone, cx, top(cx, cz), cz, 0, 1, 0, ROCK.c, ROCK.f);
            for (let j = 1; j <= NR; j++) {
                const u = Math.pow(j / NR, 0.8), base = Math.pow(Math.max(0, 1 - Math.pow(u, 4.2)), 0.62);
                for (let i = 0; i < NS; i++) {
                    const a = (i / NS) * TAU, R = (1 + 0.1 * Math.sin(2 * a + seed) + 0.07 * Math.sin(3 * a + seed * 2.3) + 0.04 * Math.sin(5 * a + seed * 4.1)) / Math.hypot(Math.cos(a) / rx, Math.sin(a) / rz);
                    const x = cx + Math.cos(a) * R * u, z = cz + Math.sin(a) * R * u;
                    vert(stone, x, lerp(bedAt(x, z) - 0.5, top(x, z), base), z, 0, 1, 0, ROCK.c, ROCK.f);
                }
            }
            for (let i = 0; i < NS; i++) tri(stone, c0, c0 + 1 + i, c0 + 1 + ((i + 1) % NS));
            for (let j = 1; j < NR; j++) for (let i = 0; i < NS; i++) { const a = c0 + 1 + (j - 1) * NS + i, e = c0 + 1 + (j - 1) * NS + ((i + 1) % NS); tri(stone, a, a + NS, e); tri(stone, e, a + NS, e + NS); }
        };
        const SEATW = (SUB.w / 2) * SC, SEATD = (SUB.d / 2) * SC;
        boulder(0, 0, 5.2, 4.5, HI ? 46 : MID ? 32 : 24, HI ? 120 : MID ? 80 : 56, 0.7, (x, z) => {
            const rough = 0.4 * facet(x, z, 1.9, 3) + 0.14 * facet(x + 40, z - 17, 0.8, 11) + 0.2 * fbm(x * 0.3 + 3.7, z * 0.3 - 1.2, 3);
            const hump = 0.6 * Math.exp(-(((x + 3.3) / 1.5) ** 2 + ((z + 1.4) / 1.8) ** 2)) + 0.28 * Math.exp(-(((x - 3.5) / 1.2) ** 2 + ((z + 2.2) / 1.2) ** 2)) - 0.25 * Math.exp(-(((x - 1.5) / 2.2) ** 2 + ((z - 3.4) / 1.2) ** 2));
            // level where the stack stands
            const seat = 1 - ss(0, 1.3, Math.hypot(Math.max(0, Math.abs(x) - SEATW - 0.25), Math.max(0, Math.abs(z) - SEATD - 0.25)));
            return lerp(TOP + 0.05 + rough + hump, TOP, seat);
        });
        for (const [cx, cz, rx, rz, h, seed] of [[-6.0, 2.3, 1.7, 1.25, 0.5, 2], [5.1, 3.6, 1.1, 0.85, 0.22, 5], [6.3, -1.7, 1.4, 1.0, 0.56, 8]])
            boulder(cx, cz, rx, rz, HI ? 16 : 10, HI ? 40 : MID ? 28 : 20, seed, (x, z) => h * (1 + 0.5 * facet(x, z, 1.0, seed * 5)) + 0.1 * fbm(x * 0.7 + seed, z * 0.7 - seed, 3) + 0.12 * (x - cx) * Math.cos(seed) + 0.12 * (z - cz) * Math.sin(seed));
        const rockM = new THREE.MeshStandardNodeMaterial();
        {
            const pg = positionGeometry, ng = normalGeometry;                    // (the rock only turns about the vertical: its heights are the world's)
            const w = pow(abs(ng), vec3(4.0)), ws = w.x.add(w.y).add(w.z);
            // the island's stone at two sizes: joints a stride apart, and the grain between them
            const tri3 = (s) => { const tY = texture(rockTex, pg.xz.mul(s)), tX = texture(rockTex, pg.zy.mul(s)), tZ = texture(rockTex, pg.xy.mul(s)); return { h: tY.b.mul(w.y).add(tX.b.mul(w.x)).add(tZ.b.mul(w.z)).div(ws), m: tY.a.mul(w.y).add(tX.a.mul(w.x)).add(tZ.a.mul(w.z)).div(ws), n: vec3(tY.r.sub(0.5), 0, tY.g.sub(0.5)).mul(w.y).add(vec3(0, tX.g.sub(0.5), tX.r.sub(0.5)).mul(w.x)).add(vec3(tZ.r.sub(0.5), tZ.g.sub(0.5), 0).mul(w.z)).div(ws) }; };
            const wide = tri3(1 / 7.3), fine = tri3(1 / 1.9);
            const slow = texture(noiseTex, pg.xz.mul(0.06)), fleck = texture(noiseTex, pg.xz.mul(0.9).add(pg.y.mul(0.5)));
            const bare = mix(col('#6e675d'), col('#b3aa9a'), wide.h.mul(0.55).add(fine.h.mul(0.45))).mul(mix(0.82, 1.14, wide.m)).mul(mix(0.88, 1.1, slow.r));
            // lichen in patches on what faces the sky and stays dry
            const lichen = smoothstep(0.5, 0.7, slow.g.mul(0.55).add(fleck.g.mul(0.45))).mul(smoothstep(0.45, 0.8, ng.y)).mul(smoothstep(0.32, 0.6, pg.y));
            // wet as far up as the rings wash it, and green at the line the water keeps
            const line = slow.b.sub(0.5).mul(0.22).add(fleck.r.sub(0.5).mul(0.08)).add(0.2);
            const wet = smoothstep(line.sub(0.05), line.add(0.08), pg.y).oneMinus();
            const tide = smoothstep(line.add(0.06), line.add(0.12), pg.y).mul(smoothstep(line.add(0.16), line.add(0.34), pg.y).oneMinus()).mul(fleck.b.mul(0.6).add(0.4));
            const algae = smoothstep(-0.7, -0.05, pg.y).mul(smoothstep(line.sub(0.16), line.sub(0.02), pg.y).oneMinus());
            // the stack keeps the sky, and the sun, off the rock under it
            const d = abs(pg.xz).sub(vec2(SEATW, SEATD)), sd = length(max(d, 0.0)).add(min(max(d.x, d.y), 0.0));
            rockM.colorNode = mix(mix(bare, col('#8f8f60'), lichen.mul(0.35)).mul(tide.mul(0.22).add(1.0)), col('#39431f'), algae.mul(0.6)).mul(mix(float(1), float(0.4), wet)).mul(smoothstep(-1.1, 0.0, pg.y).mul(0.6).add(0.4)).mul(smoothstep(-0.12, 0.3, sd).mul(0.55).add(0.45));
            rockM.roughnessNode = mix(float(0.9), float(0.2), wet).sub(fine.h.mul(0.08));
            rockM.aoNode = smoothstep(-0.3, 1.0, sd).mul(0.8).add(0.2);
            rockM.normalNode = TSL.transformNormalToView(normalize(TSL.normalLocal.add(wide.n.mul(0.4)).add(fine.n.mul(mix(float(0.4), float(0.15), wet)))));
        }
        // (they stand in open water: nothing grows there to be kept off them, and one box round all four of them
        // would lay its shade on the lagoon's bed across the gaps between them)
        add(new THREE.Mesh(solid(smooth(stone), []), rockM), g).userData.footprint = false;

        // ---- drops: every bar the bass slaps the water against the rock in a handful of places and throws a fan of
        // drops from each, and the snare a few more. Where a drop is, is worked out from the count alone: thrown, it
        // rises and falls back to the water. A bead with a glint on it, drawn out a little while it is fast and never
        // drawn smaller than a pixel (dimmer instead).
        const NDROP = HI ? 168 : MID ? 98 : 56, JETS = 7;
        const dg = new THREE.InstancedBufferGeometry(), dq = new THREE.PlaneGeometry(2, 2);
        dg.index = dq.index; dg.setAttribute('position', dq.attributes.position); dg.setAttribute('uv', dq.attributes.uv);
        { const rs = mulberry32(5150), s = new Float32Array(NDROP * 4); for (let i = 0; i < s.length; i++) s[i] = rs(); dg.setAttribute('seed', new THREE.InstancedBufferAttribute(s, 4)); }
        dg.instanceCount = NDROP; dg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
        const dropM = new THREE.NodeMaterial(); dropM.transparent = true; dropM.depthWrite = false; dropM.blending = THREE.AdditiveBlending; dropM.fog = false;
        {
            const a = attribute('seed', 'vec4'), weak = step(0.64, a.w);
            const ph = uT.mul(RING_W / TAU).add(BAR0).sub(weak.mul(0.5)).sub(a.z.mul(0.03)), n = floor(ph), age = ph.sub(n).mul(BAR);
            const jet = floor(a.x.mul(JETS)), h1 = a.x.mul(JETS).sub(jet), h2 = TSL.fract(a.y.add(n.mul(0.75488))), h3 = TSL.fract(a.z.mul(7.13).add(n.mul(0.56984))), h4 = TSL.fract(a.w.mul(13.7).add(n.mul(0.31)));
            const th = TSL.fract(jet.mul(0.7548).add(n.mul(0.61803)).add(weak.mul(0.37))).mul(TAU).add(h1.sub(0.5).mul(0.4)), cs = TSL.cos(th), sn = sin(th);
            const vy = mix(1.6, 5.2, h3.mul(h3).mul(0.5).add(h3.mul(0.5))).mul(mix(1.0, 0.6, weak)), vr = mix(0.15, 1.5, h4), vt = h2.sub(0.5).mul(1.3), life = age.div(vy.mul(2 / 9.81)), on = step(life, 1.0);
            const vel = vec3(cs.mul(vr).sub(sn.mul(vt)), vy.sub(age.mul(9.81)), sn.mul(vr).add(cs.mul(vt)));
            const far = h2.mul(h4).mul(0.1).add(1.0);
            const p = vec3(cs.mul(4.5).mul(far).add(vel.x.mul(age)), vy.mul(age).sub(age.mul(age).mul(4.905)).add(0.03), sn.mul(3.9).mul(far).add(vel.z.mul(age)));
            const mv = TSL.modelViewMatrix.mul(TSL.vec4(p, 1.0)), vv = TSL.modelViewMatrix.mul(TSL.vec4(vel, 0.0)).xy;
            const big = TSL.fract(a.w.mul(7.9)), sz = mix(0.024, 0.07, big.mul(big)).mul(life.mul(-0.3).add(1.0));
            const px = mv.z.negate().mul(2.8).div(TSL.cameraProjectionMatrix.element(1).y.mul(TSL.screenSize.y));      // a pixel and a half, in metres, that far off
            const along = normalize(vv.add(vec2(1e-4, 1e-3))), reach = min(length(vel).mul(0.28), 1.5).add(1.0);
            const off = along.mul(positionGeometry.y.mul(reach)).add(vec2(along.y, along.x.negate()).mul(positionGeometry.x)).mul(max(sz, px)).mul(on);
            dropM.vertexNode = TSL.cameraProjectionMatrix.mul(TSL.vec4(mv.xy.add(off), mv.zw));
            const lit = daylight.mul(smoothstep(0.0, 0.05, life)).mul(smoothstep(1.0, 0.75, life)).mul(pow(saturate(sz.div(max(px, 1e-5))), 1.4)).mul(on);
            // the body of the drop is faint; what shows is the sky caught in it
            const q = uv().sub(0.5).mul(2.0), r = length(q);
            const bead = TSL.exp(r.mul(r).mul(-5.0)).mul(0.2).add(TSL.exp(length(q.sub(vec2(-0.2, 0.24))).pow(2.0).mul(-16.0)).mul(0.75));
            dropM.fragmentNode = TSL.vec4(TSL.varying(lit).mul(bead).mul(smoothstep(1.0, 0.7, r)), 1.0);
        }
        { const drops = new THREE.Mesh(dg, dropM); drops.frustumCulled = false; drops.renderOrder = 22; g.add(drops); }

        g.position.set(sp.x, 0, sp.z); g.rotation.y = yaw;
        if (water && water.uRipple) water.uRipple.value.set(sp.x, sp.z, 0.24, 0);
        // a drum hit: up in a hundredth of a bar, away at its own rate; scaled to peak at one
        const hit = (f, fall) => (Math.exp(-fall * f) * (1 - Math.exp(-90 * f))) / (Math.pow(fall / (fall + 90), fall / 90) * (90 / (fall + 90)));
        sets.push({
            x: sp.x, z: sp.z, range: 700,
            show(near) { g.visible = near; },
            run(t) {
                // the kick lands as a crest comes out from under the rock, the snare half way to the next
                const bars = (RING_W * t) / TAU + BAR0, f = bars - Math.floor(bars), f2 = (f + 0.5) % 1;
                const kick = hit(f, 9), snare = hit(f2, 15);
                uKick.value = kick - 0.08; uSnare.value = snare - 0.05; uGlow.value = Math.max(kick, 0.55 * snare);
                uLevel.value = 0.14 + 0.86 * Math.max(hit(f, 4.5), 0.6 * hit(f2, 6));
            },
        });
    }

    // ==== the kettle over the crater ===================================================
    // Pterosaurs on the heat that comes off the lava: three wheeling the same way round on the rising
    // air, a pair chasing each other through them, and one that drops across the lake and climbs out.
    {
        const pl = P('games');
        const fx = pl.fwd[0], fz = pl.fwd[1], rx = -fz, rz = fx;
        const C = [pl.cam[0] + fx * 36, pl.cam[1] - 11, pl.cam[2] + fz * 36];
        const NB = quality.fauna >= 1 ? 6 : 4, SC = 2.0;
        // (lit by the sky alone, plus the lake's glow worked out for them: the lamp that lights the crater's walls is a
        // single point, and would burn out anything that flew close to it)
        const flock = createFlock(NB, { shadows: true, noiseTex, detail: quality.fauna >= 1 ? 1.25 : 0.8, lights: skyLights, glow: lava ? { x: lava.x, y: lava.y, z: lava.z, radius: 62, strength: 4 } : null }); group.add(flock.mesh);
        const KETTLE = [[19, 9.5, 0.4], [26, 3.5, 2.6], [31, 14, 4.6]];      // radius, height, where on the circle it starts
        // where each one is at a given moment (right, forward, up of the lake's middle): all of it a
        // function of time, so a still can be replayed
        // `wide` is 1 on a wide screen, where the page's panel takes the left of the view and the kettle stands
        // off to the right, and 0 on an upright one, where it draws in to stay inside a narrow frame
        const path = (i, t, out, wide = 1) => {
            let r, f, u;
            if (i < 3) { const k = KETTLE[i], a = (7.2 / k[0]) * t + k[2]; r = k[0] * Math.cos(a) + 2; f = k[0] * 0.72 * Math.sin(a) + 4; u = k[1] + 2.4 * Math.sin(0.23 * t + i * 2.1); }
            else if (i === 3) { const a = 0.4 * t + 2.2; r = 30 * Math.cos(a) + 1; f = 20 * Math.sin(a) + 2; u = 1.5 - 7.5 * Math.cos(a - 0.5) + 2.5 * Math.sin(2 * a); }            // the stoop: low over the lava on the near side
            else { const q = t - (i - 4) * 1.25; r = 22 * Math.sin(0.5 * q); f = 15 * Math.sin(1.0 * q + 0.6) + 4; u = 6 * Math.sin(0.75 * q + 1.0) + 1; }                       // tag, through a figure of eight
            r = r * lerp(0.5, 1, wide) + 11 * wide; f = f * lerp(0.8, 1, wide) - 9 * (1 - wide);
            out[0] = C[0] + rx * r + fx * f; out[1] = C[1] + u; out[2] = C[2] + rz * r + fz * f;
            return out;
        };
        const a0 = [0, 0, 0], a1 = [0, 0, 0], a2 = [0, 0, 0], stroke = {};
        let wideNow = 1;
        kettle = { count: NB, at: (i, t) => path(i, t, [0, 0, 0], wideNow) };
        sets.push({
            x: C[0], z: C[2], range: 520,
            show(near) { flock.mesh.visible = near; },
            run(t, dt, camera) {
                const D = 0.06, wide = cl((camera.aspect - 0.6) / 0.8, 0, 1);
                wideNow = wide;
                for (let i = 0; i < NB; i++) {
                    path(i, t, a0, wide); path(i, t + D, a1, wide); path(i, t + 2 * D, a2, wide);
                    const vx = (a1[0] - a0[0]) / D, vy = (a1[1] - a0[1]) / D, vz = (a1[2] - a0[2]) / D, sp = Math.hypot(vx, vz) || 1;
                    const yaw = Math.atan2(-vz, vx);
                    const rate = wrap(Math.atan2(-(a2[2] - a1[2]), a2[0] - a1[0]) - yaw) / D;
                    const bank = cl(-Math.atan(sp * rate / 9.8) * 0.9, -1.1, 1.1);
                    const pitch = Math.atan2(vy, sp) * 0.9;
                    // they flap to climb and to keep up, and hold their wings out the rest of the time
                    const climb = cl(0.1 + vy * 0.24, 0, 1), now_and_then = Math.pow(Math.max(0, Math.sin(t * 0.37 + i * 2.3)), 6) * 0.7;
                    const power = i < 3 ? Math.max(now_and_then, climb * 0.5) : Math.max(climb, now_and_then * 0.6);
                    wingStroke(t * 3.3 + i * 1.9, power, stroke);
                    // dropping fast, the wings come in
                    const tuck = cl(-vy * 0.06 - 0.1, 0, 0.45);
                    flock.set(i, a0[0], a0[1], a0[2], SC * (0.9 + 0.2 * ((i * 0.37) % 1)), yaw, bank, stroke.flap - tuck * 0.25, pitch, stroke.curl, stroke.fold + tuck, (i * 0.31) % 1);
                }
                flock.commit();
            },
        });
    }

    const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
    const update = (t, dt, camera) => {
        now = t; uT.value = t;
        camera.matrixWorld.extractBasis(_r, _u, _f); uCamRight.value.copy(_r); uCamUp.value.copy(_u);
        const cx = camera.position.x, cz = camera.position.z;
        for (const s of sets) { const near = Math.hypot(s.x - cx, s.z - cz) < s.range; if (s.show) s.show(near); if (near) s.run(t, dt, camera); }
        for (const s of systems) s.flush();
    };

    return {
        group, update, clear, ready, stones, car, get kettle() { return kettle; },
        attach(f) { fauna = f; laptopReady(); },
        hoverApp(id) { henge.hover(id); },
    };
}
