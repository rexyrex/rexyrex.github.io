// The set pieces: at each stop, something that is plainly about what the page
// says there. Standing stones that carry the app icons (the rex knocks them
// over), a laptop on a stump that the rex types at, a red roadster that flies
// the migration trail, a speaker stack in the lagoon that rings the water, and
// pterosaurs having a water fight in the crater.
import * as THREE from 'three/webgpu';
import {
    attribute, uniform, texture, vec2, vec3, float, mix, smoothstep, max, min, abs, sign, step, normalize, pow, sin, atan, length, floor, cross,
    positionLocal, positionGeometry, normalGeometry, cameraPosition, uv, saturate,
} from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, lerp, clamp as cl, catmull, smoothstep as ss } from './noise.js';
import { createFlock } from './fauna.js';
import { paintScreens, paintKeys, SCREEN } from './screens.js';

const col = (h) => { const c = new THREE.Color(h); return vec3(c.r, c.g, c.b); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// a closed Catmull-Rom loop through `pts`; u in [0, pts.length)
const loopAt = (pts, u, out) => {
    const n = pts.length, i = Math.floor(u), f = u - i;
    const p0 = pts[(i + n - 1) % n], p1 = pts[i % n], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < p1.length; k++) { const a = p0[k], b = p1[k], c = p2[k], d = p3[k]; out[k] = 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f); }
    return out;
};
const tinted = (geo, hex) => { const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };

export function createScenes({ island, places, quality, atmosphere, terrain, noiseTex, rockTex, water, apps = [] }) {
    const group = new THREE.Group(); group.name = 'scenes';
    const rnd = mulberry32(90210);
    const clear = [];            // [x, z, r] kept free of plants
    const sets = [];             // { x, z, range, show(near), run(t, dt, camera) }
    const systems = [];
    const uT = uniform(0), uCamRight = uniform(new THREE.Vector3(1, 0, 0)), uCamUp = uniform(new THREE.Vector3(0, 1, 0));
    let now = 0, fauna = null;
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
            shape = smoothstep(1.0, 0.15, abs(d.x)).mul(smoothstep(1.0, 0.4, abs(d.y))).mul(smoothstep(7.0, 17.0, length(cameraPosition.sub(centre))));
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
            spawn(x, y, z, vx, vy, vz, lifeScale = 1, ex = 0, ey = 0, ez = 0) { const i = cur * 4; A[i] = x; A[i + 1] = y; A[i + 2] = z; A[i + 3] = now; V[i] = vx; V[i + 1] = vy; V[i + 2] = vz; V[i + 3] = lifeScale; if (E) { E[cur * 3] = ex; E[cur * 3 + 1] = ey; E[cur * 3 + 2] = ez; } cur = (cur + 1) % count; dirty = true; },
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
            m.emissiveNode = icon.mul(inside).mul(a.z.mul(1.1).add(0.07));
        }
        const inst = new THREE.InstancedMesh(geo, m, n); inst.frustumCulled = false; inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); add(inst);
        // a horseshoe that opens toward the lens, so the icons on the far stones face it
        const R = 6.05, gap = 0.72, toCam = Math.atan2(pl.cam[2] - s.z, pl.cam[0] - s.x);
        const mM = new THREE.Matrix4(), mA = new THREE.Matrix4();
        const setStone = (i) => {
            const st = stones[i];
            mM.makeTranslation(st.x, st.y, st.z).multiply(mA.makeRotationY(st.phi)).multiply(mA.makeTranslation(0, BURY, st.hz)).multiply(mA.makeRotationX(st.alpha)).multiply(mA.makeTranslation(0, -BURY, -st.hz))
                .multiply(mA.makeRotationY(st.twist)).multiply(mA.makeRotationZ(st.lean)).multiply(mA.makeScale(st.sx, st.sy, st.sz));
            inst.setMatrixAt(i, mM);
        };
        for (let i = 0; i < n; i++) {
            const th = toCam + gap + ((i + 0.5) / n) * (Math.PI * 2 - 2 * gap), ox = Math.cos(th), oz = Math.sin(th);
            const x = s.x + ox * R, z = s.z + oz * R;
            const sz = lerp(0.9, 1.15, rnd());
            stones.push({ i, id: (apps[i] && apps[i].id) || '', x, z, y: Math.min(ground(x, z), ground(x + ox, z + oz), ground(x - ox, z - oz)) - BURY, ox, oz, phi: Math.PI / 2 - th, hz: SD * 0.5 * sz, alpha: 0, w: 0, state: 0, t: 0, rest: 0,
                lean: (rnd() - 0.5) * 0.09, twist: (rnd() - 0.5) * 0.24 + (rnd() < 0.5 ? Math.PI : 0), sx: lerp(0.86, 1.14, rnd()), sy: lerp(0.82, 1.1, rnd()), sz, glow: 0, glowTo: 0 });
            sc[i * 4] = i % COLS; sc[i * 4 + 1] = Math.floor(i / COLS); sc[i * 4 + 2] = 0; sc[i * 4 + 3] = rnd();
            setStone(i);
            clear.push([x, z, 1.5], [x + ox * 2.2, z + oz * 2.2, 2.0]);
        }
        clear.push([s.x, s.z, R + 0.6]);
        const dust = sprites({ count: 96, life: 1.7, accel: [0, 0.5, 0], size0: 0.6, size1: 2.8, tint: '#b6a487', opacity: 0.34 });
        const REST = 1.5;
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
            const ridge = texture(noiseTex, vec2(ang.mul(2.3), pg.y.mul(0.22))).g, fine = texture(noiseTex, vec2(ang.mul(7.0), pg.y.mul(1.1))).r;
            const bark = col('#4a3a2c').mul(mix(0.45, 1.2, ridge)).mul(mix(0.8, 1.1, fine));
            const moss = smoothstep(0.55, 0.8, texture(noiseTex, vec2(ang.mul(0.6), pg.y.mul(0.5))).a).mul(smoothstep(0.7, 0.1, pg.y));
            sm.colorNode = mix(mix(bark, col('#4a5a2a'), moss.mul(0.6)), cut, top);
            sm.roughnessNode = mix(float(0.92), float(0.7), top);
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
        const g = new THREE.Group(); g.scale.setScalar(SCALE); group.add(g);
        // body: rings lofted along the length. [x, half width, underside, belt line, crown]
        const ST = [[-2.0, 0.5, 0.44, 0.7, 0.0], [-1.92, 0.76, 0.32, 0.8, 0.02], [-1.6, 0.88, 0.22, 0.87, 0.04], [-1.1, 0.92, 0.2, 0.89, 0.05], [-0.6, 0.93, 0.2, 0.85, 0.02],
            [-0.1, 0.92, 0.2, 0.79, 0.0], [0.4, 0.91, 0.2, 0.77, 0.03], [0.9, 0.9, 0.2, 0.71, 0.06], [1.4, 0.86, 0.22, 0.61, 0.06], [1.75, 0.74, 0.27, 0.5, 0.04], [1.97, 0.5, 0.32, 0.42, 0.01]];
        const NS = 48, NR = 30, pos = [], idx = [], o = [0, 0, 0, 0, 0];
        for (let i = 0; i <= NS; i++) {
            catmull(ST, (i / NS) * (ST.length - 1), o);
            const x = o[0], w = o[1], yb = o[2], yt = o[3], crown = o[4];
            for (let j = 0; j < NR; j++) {
                const a = (j / NR) * 6.283, c = Math.cos(a), s = Math.sin(a);
                const z = w * Math.sign(c) * Math.pow(Math.abs(c), 0.42);
                let y = (yb + yt) / 2 + ((yt - yb) / 2) * Math.sign(s) * Math.pow(Math.abs(s), 0.5);
                if (s > 0) {
                    y += crown * (1 - (z / w) * (z / w)) * s;
                    y -= 0.2 * ss(-0.88, -0.7, x) * ss(0.36, 0.2, x) * ss(0.7, 0.5, Math.abs(z)) * ss(0.3, 0.7, s);      // the cockpit is open
                }
                // arches cut over the wheels
                for (const wx of [-1.22, 1.22]) { const dx = (x - wx) / 0.46; if (Math.abs(dx) < 1 && s < 0.2 && Math.abs(z) > 0.5) y = Math.max(y, 0.25 + 0.36 * Math.sqrt(1 - dx * dx) * ss(0.5, 0.75, Math.abs(z))); }
                pos.push(x, y, z);
            }
        }
        for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) { const a = i * NR + j, b = (i + 1) * NR + j, c = i * NR + (j + 1) % NR, d = (i + 1) * NR + (j + 1) % NR; idx.push(a, b, c, b, d, c); }
        const tail = pos.length / 3; pos.push(-2.02, 0.57, 0); const nose = tail + 1; pos.push(1.99, 0.37, 0);
        for (let j = 0; j < NR; j++) { idx.push(tail, j, (j + 1) % NR); idx.push(nose, NS * NR + (j + 1) % NR, NS * NR + j); }
        const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); bg.setIndex(idx); bg.computeVertexNormals();
        const paint = new THREE.MeshPhysicalNodeMaterial();
        {
            const p = positionGeometry, n = normalGeometry;
            const band = (v, a, b, e = 0.02) => smoothstep(a - e, a + e, v).mul(smoothstep(b + e, b - e, v));
            const cockpit = band(p.x, -0.86, 0.34, 0.03).mul(smoothstep(0.7, 0.62, abs(p.z))).mul(smoothstep(0.35, 0.75, n.y));
            const sill = smoothstep(0.31, 0.26, p.y);
            const intake = band(p.x, -1.0, -0.42).mul(band(p.y, 0.44, 0.6)).mul(smoothstep(0.55, 0.85, abs(n.z)));
            const grille = smoothstep(1.86, 1.92, p.x).mul(band(p.y, 0.3, 0.39)).mul(smoothstep(0.42, 0.34, abs(p.z)));
            const arch = max(smoothstep(0.43, 0.39, length(vec2(p.x.sub(1.22), p.y.sub(0.31)))), smoothstep(0.43, 0.39, length(vec2(p.x.add(1.22), p.y.sub(0.31))))).mul(smoothstep(0.5, 0.8, abs(n.z)).add(smoothstep(-0.3, -0.7, n.y))).mul(smoothstep(0.52, 0.2, p.y));
            const dark = saturate(max(max(cockpit, sill), max(max(intake, grille), arch)));
            const lamp = band(p.x, 1.4, 1.8, 0.03).mul(band(abs(p.z), 0.4, 0.72, 0.03)).mul(smoothstep(0.25, 0.6, n.y));
            const brake = smoothstep(-1.86, -1.92, p.x).mul(band(p.y, 0.63, 0.71, 0.012)).mul(band(abs(p.z), 0.28, 0.72, 0.02));
            const stripe = band(abs(p.z), 0.0, 0.07, 0.01).mul(smoothstep(0.3, 0.7, n.y)).mul(0.0);
            paint.colorNode = mix(mix(mix(col('#b3101c'), col('#e9e9ee'), stripe), vec3(0.012), dark), vec3(0.85), lamp);
            paint.roughnessNode = mix(float(0.32), float(0.75), dark);
            paint.metalnessNode = mix(float(0.45), float(0.0), dark);
            paint.clearcoatNode = float(1).sub(dark);
            paint.clearcoatRoughnessNode = float(0.05);
            paint.emissiveNode = vec3(1.0, 0.96, 0.88).mul(lamp).mul(5.0).add(vec3(1.0, 0.04, 0.02).mul(brake).mul(4.5));
        }
        add(new THREE.Mesh(bg, paint), g);
        // glass, seats, a driver
        {
            const gv = [], gi = [], NC = 10;
            for (let c = 0; c <= NC; c++) { const u = (c / NC) * 2 - 1; gv.push(0.4 - 0.12 * u * u, 0.77, 0.76 * u, 0.02 - 0.1 * u * u, 1.17, 0.63 * u); }
            for (let c = 0; c < NC; c++) { const a = c * 2; gi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
            const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(gv), 3)); wg.setIndex(gi); wg.computeVertexNormals();
            for (const sd of [1, -1]) { const b = gv.length / 3; gv.push(0.28, 0.77, 0.76 * sd, -0.08, 1.17, 0.63 * sd, -0.8, 1.08, 0.66 * sd, -0.86, 0.78, 0.76 * sd); gi.push(b, b + 1, b + 2, b, b + 2, b + 3); }
            wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(gv), 3)); wg.setIndex(gi); wg.computeVertexNormals();
            add(new THREE.Mesh(wg, new THREE.MeshPhysicalNodeMaterial({ color: new THREE.Color('#16242e'), roughness: 0.04, metalness: 0.9, clearcoat: 1, side: THREE.DoubleSide })), g);
            const leather = plain('#231312', 0.6);
            for (const sd of [-1, 1]) { const seat = add(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.5, 0.42, 3, 0.06), leather), g); seat.position.set(-0.76, 0.93, 0.37 * sd); seat.rotation.z = 0.22; }
            const helmet = add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), plain('#f1f1f1', 0.25)), g); helmet.position.set(-0.5, 1.1, -0.37);
            const visor = new THREE.Mesh(new THREE.SphereGeometry(0.172, 20, 10, -0.9, 1.8, 1.05, 0.7), plain('#07090c', 0.1, { metalness: 0.8 })); visor.rotation.y = Math.PI / 2; helmet.add(visor);
            const suit = add(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.3, 0.4, 3, 0.07), plain('#e6e6e6', 0.5)), g); suit.position.set(-0.52, 0.86, -0.37);
        }
        // wheels, a hoop behind the seats, a lip on the tail
        const tyre = plain('#0b0b0c', 0.9), rimM = new THREE.MeshStandardNodeMaterial();
        { const q = positionGeometry.xy, r = length(q), ang = atan(q.y, q.x); const spoke = smoothstep(0.34, 0.12, abs(sin(ang.mul(2.5)))).mul(smoothstep(0.05, 0.08, r)); const hubc = smoothstep(0.07, 0.05, r);
            rimM.colorNode = mix(vec3(0.015), col('#7f838a'), max(max(spoke, hubc), smoothstep(0.185, 0.2, r))); rimM.metalnessNode = float(0.9); rimM.roughnessNode = float(0.3); }
        const wheels = [];
        for (const [wx, wz] of [[1.22, 0.83], [1.22, -0.83], [-1.22, 0.85], [-1.22, -0.85]]) {
            const w = new THREE.Group(); w.position.set(wx, 0.31, wz); g.add(w);
            add(new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.085, 12, 30), tyre), w);
            add(new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.15, 26).rotateX(Math.PI / 2), rimM), w);
            wheels.push(w);
        }
        { const hoop = add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 20, Math.PI), plain('#141416', 0.4, { metalness: 0.6 })), g); hoop.position.set(-0.9, 0.86, 0.37); hoop.rotation.y = Math.PI / 2;
            const hoop2 = hoop.clone(); hoop2.position.z = -0.37; g.add(hoop2);
            const lip = add(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.035, 1.5, 2, 0.015), plain('#0d0d0e', 0.5)), g); lip.position.set(-1.9, 0.9, 0); lip.rotation.z = 0.2; }
        // what holds it up: a sheet of light under the floor
        const padM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        { const d = uv().sub(0.5).mul(2.0); padM.colorNode = col('#7cc4ff').mul(pow(smoothstep(1.0, 0.0, length(d)), 2.0).mul(0.2)); padM.fog = false; }
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3).rotateX(Math.PI / 2), padM); pad.position.y = 0.1; pad.renderOrder = 21; g.add(pad);
        const pads = [null, null, wheels[2], wheels[3]];
        const trail = sprites({ count: 300, life: 0.6, size0: 0.3, size1: 0.04, tint: '#9ad4ff', gain: 3.0, additive: true, lit: false, opacity: 0.5, order: 21 });

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
        let bank = 0, emit = 0;
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
                // light spilt from the rear pads, left behind as a trail
                emit += dt * 175;
                while (emit >= 1) { emit -= 1; for (const k of [2, 3]) { pads[k].getWorldPosition(wv); trail.spawn(wv.x, wv.y - 0.3, wv.z, 0, -0.3, 0, 1); } }
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

    // ==== the speaker in the lagoon ====================================================
    {
        const pl = P('music'), sp = pl.speaker;
        const g = new THREE.Group(); group.add(g);
        const bed = ground(sp.x, sp.z);
        // toward the lens
        const yaw = Math.atan2(pl.cam[0] - sp.x, pl.cam[2] - sp.z) + 0.18;
        // a rock to stand on
        const rg = new THREE.IcosahedronGeometry(1, 4);
        { const p = rg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + 0.16 * Math.sin(x * 3.1 + z * 2.3) + 0.1 * Math.sin(y * 5.0 + x * 4.1) + 0.07 * Math.sin(z * 7.3); const flat = y > 0.55 ? 0.55 + (y - 0.55) * 0.12 : y; p.setXYZ(i, x * k, flat, z * k); } rg.computeVertexNormals(); }
        const rm = new THREE.MeshStandardNodeMaterial();
        { const pg = positionGeometry, ng = normalGeometry; const t3 = texture(rockTex, pg.xz.mul(0.9)).b.mul(abs(ng.y)).add(texture(rockTex, pg.xy.mul(0.9)).b.mul(abs(ng.z))).add(texture(rockTex, pg.zy.mul(0.9)).b.mul(abs(ng.x)));
            const wet = smoothstep(0.32, 0.12, pg.y); rm.colorNode = mix(col('#6e695f').mul(mix(0.5, 1.2, t3)), col('#3d4a26'), smoothstep(0.5, 0.8, texture(noiseTex, pg.xz.mul(0.5)).r).mul(smoothstep(0.2, 0.6, ng.y)).mul(0.7)).mul(mix(1.0, 0.45, wet)); rm.roughnessNode = mix(float(0.9), float(0.3), wet); }
        const TOP = 0.62;                                 // how far the rock stands out of the water
        const rock = add(new THREE.Mesh(rg, rm), g); const rh = (TOP - bed + 0.6) / 0.6; rock.scale.set(4.9, rh, 4.2); rock.position.set(0, TOP - 0.6 * rh, 0);
        // the stack: a sub below, a two-way cabinet on top
        const stack = new THREE.Group(); stack.position.y = TOP - 0.03; stack.rotation.z = 0.02; stack.scale.setScalar(1.45); g.add(stack);
        const tolex = new THREE.MeshStandardNodeMaterial();
        { const pg = positionGeometry; tolex.colorNode = col('#0e0e10').mul(mix(0.7, 1.5, texture(noiseTex, pg.xy.mul(3.0).add(pg.z.mul(2.0))).g)); tolex.roughnessNode = float(0.62); }
        const steel = plain('#b9bcc0', 0.35, { metalness: 0.9 });
        const coneM = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide }), uBeat = uniform(0);
        { const r = length(positionGeometry.xy); coneM.emissiveNode = mix(col('#39d0ff'), col('#9be36f'), uBeat).mul(smoothstep(0.83, 0.86, r).mul(smoothstep(0.93, 0.9, r))).mul(uBeat.mul(4.0).add(1.4)).add(mix(col('#b9bdc6'), col('#5d6068').mul(mix(0.55, 1.2, smoothstep(0.26, 0.78, r))), smoothstep(0.2, 0.26, r)).mul(smoothstep(0.82, 0.76, r)).mul(1.5)); coneM.colorNode = mix(mix(mix(col('#c4c8cf'), col('#6f727b').mul(mix(0.7, 1.25, smoothstep(0.26, 0.78, r))), smoothstep(0.2, 0.26, r)), col('#101012'), smoothstep(0.78, 0.82, r)), col('#b4b7bc'), smoothstep(0.92, 0.95, r)); coneM.roughnessNode = mix(float(0.5), float(0.3), smoothstep(0.92, 0.95, r)); coneM.metalnessNode = smoothstep(0.92, 0.95, r).mul(0.9); }
        const coneG = new THREE.LatheGeometry([[0, -0.13], [0.1, -0.135], [0.2, -0.19], [0.23, -0.21], [0.5, -0.12], [0.79, -0.035], [0.84, 0.012], [0.9, -0.005], [0.93, 0.0], [1.0, 0.0]].map(([r, d]) => new THREE.Vector2(r, d)), 40); coneG.rotateX(Math.PI / 2);
        const cones = [];
        const cabinet = (w, h, d, y0, drivers) => {
            const c = add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.07), tolex), stack); c.position.y = y0 + h / 2;
            const baffle = add(new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, h - 0.2), plain('#060607', 0.8)), stack, false); baffle.position.set(0, y0 + h / 2, d / 2 + 0.003);
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const k = add(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.2, 0.2, 2, 0.04), steel), stack, false); k.position.set(sx * (w / 2 - 0.07), y0 + h / 2 + sy * (h / 2 - 0.07), sz * (d / 2 - 0.07)); }
            for (const [dx, dy, r, k] of drivers) { const cone = add(new THREE.Mesh(coneG, coneM), stack, false); cone.position.set(dx, y0 + h / 2 + dy, d / 2 + 0.012 + 0.22 * r); cone.scale.set(r, r, r); /* stood off the baffle by its own depth: the cone is a dish, and inside a solid box it would not be seen */ cones.push({ mesh: cone, r, k }); }
            return c;
        };
        cabinet(2.5, 2.3, 1.9, 0, [[0, 0, 0.98, 1]]);
        cabinet(2.3, 2.5, 1.6, 2.33, [[0, -0.52, 0.62, 0.7], [0, 0.72, 0.42, 0.45]]);
        // a strip of light that keeps the beat
        const ledM = new THREE.MeshBasicNodeMaterial(); ledM.colorNode = col('#9be36f').mul(uBeat.mul(5.0).add(0.6));
        const led = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.07), ledM); led.position.set(0, 2.33 + 2.5 - 0.2, 0.8 + 0.006); stack.add(led);
        g.position.set(sp.x, 0, sp.z); g.rotation.y = yaw;
        const spray = sprites({ count: 220, life: 0.95, accel: [0, -9.8, 0], size0: 0.13, size1: 0.07, stretch: 2.4, tint: '#dff1ff', gain: 1.15, opacity: 0.85 });
        if (water && water.uRipple) water.uRipple.value.set(sp.x, sp.z, 0.24, 0);
        const BPM = 104; let beatN = -1;
        sets.push({
            x: sp.x, z: sp.z, range: 700,
            show(near) { g.visible = near; },
            run(t) {
                const bt = t * BPM / 60, n = Math.floor(bt), f = bt - n;
                const kick = Math.exp(-7 * f) * (n % 4 === 2 ? 0.75 : 1), hat = Math.exp(-12 * ((bt * 2) % 1));
                uBeat.value = kick;
                for (const c of cones) c.mesh.scale.z = c.r * (1 - 0.9 * (c.k > 0.6 ? kick : hat) * c.k);
                if (n !== beatN) {
                    beatN = n;
                    // every beat shakes drops off the rock
                    for (let i = 0; i < 16; i++) { const a = rnd() * 6.283, r = lerp(4.0, 5.4, rnd()); spray.spawn(sp.x + Math.cos(a) * r, 0.03, sp.z + Math.sin(a) * r * 0.86, Math.cos(a) * lerp(0.2, 1.2, rnd()), lerp(2.2, 4.4, rnd()), Math.sin(a) * lerp(0.2, 1.2, rnd()), lerp(0.7, 1.1, rnd())); }
                }
            },
        });
    }

    // ==== the water fight over the crater =============================================
    {
        const pl = P('games');
        const fx = pl.fwd[0], fz = pl.fwd[1], rx = -fz, rz = fx;
        const C = [pl.cam[0] + fx * 40 + rx * 12, pl.cam[1] - 12, pl.cam[2] + fz * 40 + rz * 12];
        const NB = 5, SC = 2.5;
        const flock = createFlock(NB, { shadows: true }); group.add(flock.mesh);
        // toy water guns, in the colours such things come in
        const parts = [
            tinted(new THREE.BoxGeometry(0.7, 0.2, 0.13).translate(0.1, 0, 0), '#ff6a13'),
            tinted(new THREE.CylinderGeometry(0.115, 0.115, 0.42, 14).rotateZ(Math.PI / 2).translate(-0.04, 0.2, 0), '#a8ec2f'),
            tinted(new THREE.CylinderGeometry(0.04, 0.05, 0.52, 10).rotateZ(Math.PI / 2).translate(0.7, 0.03, 0), '#2a86ff'),
            tinted(new THREE.CylinderGeometry(0.06, 0.06, 0.07, 10).rotateZ(Math.PI / 2).translate(0.97, 0.03, 0), '#ffd23a'),
            tinted(new THREE.BoxGeometry(0.22, 0.09, 0.15).translate(0.5, -0.1, 0), '#ffd23a'),
            tinted(new THREE.BoxGeometry(0.11, 0.26, 0.1).rotateZ(0.3).translate(-0.14, -0.2, 0), '#ff6a13'),
        ];
        const gunM = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.32 });
        const guns = new THREE.InstancedMesh(mergeGeometries(parts), gunM, NB); guns.frustumCulled = false; guns.instanceMatrix.setUsage(THREE.DynamicDrawUsage); guns.castShadow = true; group.add(guns);
        const water2 = sprites({ count: 1500, life: 1.35, accel: [0, -9.8, 0], size0: 0.17, size1: 0.3, stretch: 7.0, tint: '#9fd0ff', gain: 1.3, opacity: 0.62, carried: true });
        const splash = sprites({ count: 260, life: 0.55, accel: [0, -9.8, 0], size0: 0.45, size1: 1.3, tint: '#cfe8ff', gain: 1.3, opacity: 0.4 });
        // where each one is at a given moment: all of it a function of time, so the fight can be replayed
        const path = (i, t, out) => {
            let r, f, u;
            if (i < 2) { const q = t - i * 1.05; r = 23 * Math.sin(0.6 * q); f = 18 * Math.sin(1.2 * q + 0.6) + 2; u = 7 * Math.sin(0.9 * q + 1.0) - 2; }             // one chases the other through a figure of eight
            else if (i < 4) { const a = (i === 2 ? 0.52 : -0.52) * t + (i === 2 ? 0.4 : 2.0); r = 25 * Math.cos(a); f = 17 * Math.sin(a) + 7; u = (i === 2 ? 1 : -1) * 2.6 + 5 * Math.sin(a * 2 + i) + 3; }   // two that keep meeting head on
            else { const a = 0.4 * t + 1.0; r = 29 * Math.cos(a) + 2; f = 19 * Math.sin(a) + 2; u = 6 + 5 * Math.sin(0.8 * t); }                                     // and one that circles wide and joins in
            out[0] = C[0] + rx * r + fx * f; out[1] = C[1] + u; out[2] = C[2] + rz * r + fz * f;
            return out;
        };
        const foe = [1, 0, 3, 2, 0];
        const st = []; for (let i = 0; i < NB; i++) st.push({ p: [0, 0, 0], v: [0, 0, 0], yaw: 0, bank: 0, emit: 0 });
        const a0 = [0, 0, 0], a1 = [0, 0, 0], a2 = [0, 0, 0], e = new THREE.Euler(0, 0, 0, 'YXZ'), mm = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
        sets.push({
            x: C[0], z: C[2], range: 520,
            show(near) { flock.mesh.visible = near; guns.visible = near; },
            run(t, dt) {
                const D = 0.06;
                for (let i = 0; i < NB; i++) {
                    const b = st[i]; path(i, t, a0); path(i, t + D, a1); path(i, t + 2 * D, a2);
                    b.p[0] = a0[0]; b.p[1] = a0[1]; b.p[2] = a0[2];
                    b.v[0] = (a1[0] - a0[0]) / D; b.v[1] = (a1[1] - a0[1]) / D; b.v[2] = (a1[2] - a0[2]) / D;
                    const sp = Math.hypot(b.v[0], b.v[2]) || 1;
                    b.yaw = Math.atan2(-b.v[2], b.v[0]);
                    const rate = wrap(Math.atan2(-(a2[2] - a1[2]), a2[0] - a1[0]) - b.yaw) / D;
                    b.bank = cl(-Math.atan(sp * rate / 9.8) * 0.85, -1.15, 1.15);
                    b.pitch = Math.atan2(b.v[1], sp) * 0.9;
                    // it beats harder on the way up
                    const effort = cl(0.45 + b.v[1] * 0.12, 0.2, 1);
                    flock.set(i, b.p[0], b.p[1], b.p[2], SC, b.yaw, b.bank, Math.sin(t * 4.4 + i * 1.9) * 0.5 * effort + 0.1, b.pitch);
                    e.set(b.bank, b.yaw, b.pitch); q4.setFromEuler(e);
                    v3.set(0.72, -0.34, 0).multiplyScalar(SC).applyQuaternion(q4);
                    mm.compose(v3.add(s3.set(b.p[0], b.p[1], b.p[2])), q4, s3.set(SC * 1.1, SC * 1.1, SC * 1.1)); guns.setMatrixAt(i, mm);
                    b.q = b.q || new THREE.Quaternion(); b.q.copy(q4);
                }
                flock.commit(); guns.instanceMatrix.needsUpdate = true;
                if (!dt) return;
                for (let i = 0; i < NB; i++) {
                    // whoever is most squarely in front, within range, gets it
                    const b = st[i], sp = Math.hypot(b.v[0], b.v[1], b.v[2]) || 1;
                    let o = null, best = 0.62, d = 0, tx = 0, ty = 0, tz = 0;
                    for (let k = 0; k < NB; k++) {
                        if (k === i) continue;
                        const q = st[k], qx = q.p[0] - b.p[0], qy = q.p[1] - b.p[1], qz = q.p[2] - b.p[2], qd = Math.hypot(qx, qy, qz) || 1;
                        if (qd < 7 || qd > 72) continue;
                        const ah = (qx * b.v[0] + qy * b.v[1] + qz * b.v[2]) / (qd * sp) - qd * 0.0015 + (k === foe[i] ? 0.08 : 0);
                        if (ah > best) { best = ah; o = q; d = qd; tx = qx; ty = qy; tz = qz; }
                    }
                    const burst = Math.sin(t * 1.3 + i * 2.4) > -0.55;
                    if (!o || !burst) { b.emit = 0; continue; }
                    // lead the target a little, and aim up for the drop on the way
                    const V0 = 34, T = d / V0;
                    let ax = tx + o.v[0] * T * 0.6, ay = ty + o.v[1] * T * 0.6 + 4.9 * T * T, az = tz + o.v[2] * T * 0.6; const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
                    v3.set(0.72 + 1.0 * 1.1, -0.3, 0).multiplyScalar(SC).applyQuaternion(b.q);
                    b.emit += dt * 120;
                    while (b.emit >= 1) { b.emit -= 1; const j = 0.3; water2.spawn(b.p[0] + v3.x, b.p[1] + v3.y, b.p[2] + v3.z, ax * V0 + b.v[0] * 0.35 + (rnd() - 0.5) * j, ay * V0 + b.v[1] * 0.35 + (rnd() - 0.5) * j, az * V0 + b.v[2] * 0.35 + (rnd() - 0.5) * j, lerp(0.75, 1.1, rnd()), b.v[0], b.v[1], b.v[2]); }
                    // and where it lands, on the one it was meant for, it bursts
                    b.hit = (b.hit || 0) + dt * 26;
                    while (b.hit >= 1) { b.hit -= 1; splash.spawn(o.p[0] + (rnd() - 0.5) * 2, o.p[1] + (rnd() - 0.5) * 1.2, o.p[2] + (rnd() - 0.5) * 2, o.v[0] * 0.6 + (rnd() - 0.5) * 7, o.v[1] * 0.6 + rnd() * 4, o.v[2] * 0.6 + (rnd() - 0.5) * 7, lerp(0.7, 1.1, rnd())); }
                }
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
        group, update, clear, ready, stones, car,
        attach(f) { fauna = f; laptopReady(); },
        hoverApp(id) { henge.hover(id); },
    };
}
