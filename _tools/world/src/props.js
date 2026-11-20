// The fixed furniture of the places: the stone keyboard, the balloons, the
// crater's lava and smoke, the outpost tower, the camp. Two of them are readouts
// of something real (see README): smoke only while the games portal answers, a
// fire that burns by how recently the site was committed to. What moves and
// acts at each stop lives in scenes.js.
import * as THREE from 'three/webgpu';
import {
    Fn, attribute, uniform, texture, vec2, vec3, vec4, float, mix, smoothstep, max, min, abs, clamp, normalize, dot, pow, sin, cos, length, fract, floor,
    positionLocal, normalLocal, positionGeometry, normalGeometry, positionWorld, cameraPosition, time, uv, saturate, instanceIndex, hash,
} from 'three/tsl';
import { mulberry32, lerp } from './noise.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SITES, VOLCANO } from './island.js';

const col = (h) => { const c = new THREE.Color(h); return vec3(c.r, c.g, c.b); };

export function createProps({ island, places, quality, atmosphere, terrain, noiseTex, rockTex }) {
    const group = new THREE.Group(); group.name = 'props';
    const rnd = mulberry32(31337);
    const updates = [];
    const uCamRight = uniform(new THREE.Vector3(1, 0, 0)), uCamUp = uniform(new THREE.Vector3(0, 1, 0));
    const clear = [];       // [x, z, r] kept free of plants
    let lavaAt = null;      // the middle of the lava lake, for whatever flies over it

    // ---- shared looks
    const stoneMat = (tint = '#6d675f') => {
        const m = new THREE.MeshStandardNodeMaterial();
        const P = positionWorld, n = normalLocal;
        const t = texture(rockTex, P.xz.mul(0.37)).mul(abs(n.y)).add(texture(rockTex, P.zy.mul(0.37)).mul(abs(n.x))).add(texture(rockTex, P.xy.mul(0.37)).mul(abs(n.z)));
        m.colorNode = col(tint).mul(mix(0.55, 1.2, t.b)).mul(mix(0.85, 1.1, texture(noiseTex, P.xz.mul(0.11)).r));
        m.roughnessNode = float(0.88);
        return m;
    };
    const woodMat = (tint = '#6b4f35') => {
        const m = new THREE.MeshStandardNodeMaterial();
        const g = texture(noiseTex, positionWorld.xy.mul(vec2(0.9, 0.12)).add(positionWorld.z.mul(0.31))).g;
        m.colorNode = col(tint).mul(mix(0.6, 1.15, g));
        m.roughnessNode = float(0.82);
        return m;
    };
    // sawn boards: each a slightly different tone, a dark joint between them, grain along the board,
    // grey where rain has run. `along` is the axis the boards run ("y" upright, "x"/"z" lying).
    const plankMat = (tint = '#7a6148', along = 'y', width = 0.2) => {
        const m = new THREE.MeshStandardNodeMaterial();
        const P = positionWorld, n = normalLocal;
        const across = along === 'y' ? mix(P.x, P.z, smoothstep(0.4, 0.6, abs(n.x))) : along === 'x' ? mix(P.z, P.y, smoothstep(0.4, 0.6, abs(n.y)).oneMinus().mul(0).add(0)) : P.x;
        const run = along === 'y' ? P.y : along === 'x' ? P.x : P.z;
        const u = across.div(width);
        const id = floor(u), f = fract(u);
        const tone = fract(sin(id.mul(12.9898)).mul(43758.5453));
        const joint = smoothstep(0.0, 0.07, f).mul(smoothstep(1.0, 0.93, f));
        const grain = texture(noiseTex, vec2(run.mul(0.55).add(id.mul(0.37)), across.mul(3.1))).g;
        const weather = texture(noiseTex, vec2(across.mul(0.4), run.mul(0.09))).r;
        const c = col(tint).mul(mix(0.72, 1.12, tone)).mul(mix(0.78, 1.08, grain));
        m.colorNode = mix(c, col('#7d7a72').mul(mix(0.7, 1.0, grain)), smoothstep(0.45, 0.8, weather).mul(0.5)).mul(mix(0.3, 1.0, joint));
        m.roughnessNode = float(0.86);
        return m;
    };
    const plain = (hex, rough = 0.7, extra = {}) => new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(hex), roughness: rough, ...extra });
    const add = (mesh, cast = true) => { mesh.castShadow = cast; mesh.receiveShadow = true; group.add(mesh); return mesh; };
    const ground = (x, z) => island.heightAt(x, z);

    // ---- particles: camera-facing puffs that rise, drift and fade ------------------
    const puffs = ({ count, origin, height, spread, drift, size0, size1, life, colorA, colorB, glow = 0, underglow = null, opacity = 0.6, amount, flame = false }) => {
        const geo = new THREE.InstancedBufferGeometry();
        const q = new THREE.PlaneGeometry(1, 1);
        geo.index = q.index; geo.setAttribute('position', q.attributes.position); geo.setAttribute('uv', q.attributes.uv);
        const seeds = new Float32Array(count * 4); for (let i = 0; i < count * 4; i++) seeds[i] = rnd();
        geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
        geo.instanceCount = count;
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(...origin), height * 2 + 200);
        const s = attribute('seed', 'vec4');
        const age = fract(time.div(life).add(s.x));
        const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const o = vec3(...origin);
        const rise = pow(age, 0.8).mul(height);
        const wob = vec3(sin(time.mul(0.31).add(s.y.mul(40))), 0, cos(time.mul(0.27).add(s.z.mul(40)))).mul(spread).mul(age.add(0.25));
        const centre = o.add(vec3(s.y.sub(0.5).mul(spread), rise, s.z.sub(0.5).mul(spread))).add(wob).add(vec3(drift[0], 0, drift[1]).mul(pow(age, 1.4)));
        const size = mix(float(size0), float(size1), age).mul(s.w.mul(0.6).add(0.7));
        m.positionNode = centre.add(uCamRight.mul(positionLocal.x.mul(size))).add(uCamUp.mul(positionLocal.y.mul(size)));
        const r = length(uv().sub(0.5)).mul(2.0);
        const body = texture(noiseTex, uv().mul(0.55).add(s.xy).add(vec2(0, time.mul(0.02)))).r;
        const a = smoothstep(1.0, 0.25, r.add(body.sub(0.5).mul(0.7))).mul(smoothstep(0.98, 0.7, r)).mul(smoothstep(0.0, 0.12, age)).mul(smoothstep(1.0, 0.55, age));
        const lit = mix(col(colorA), col(colorB), smoothstep(0.0, 0.55, age).mul(uv().y.mul(0.6).add(0.4)));
        // sunlit on the side facing the sun (the sprite's own left-to-right stands in for depth), sky-lit elsewhere
        const side = dot(normalize(uCamRight.mul(uv().x.sub(0.5)).add(uCamUp.mul(uv().y.sub(0.5)))), atmosphere.uSunDir).mul(0.5).add(0.5);
        let c = lit.mul(atmosphere.uSunColor.mul(mix(0.03, 0.16, side)).add(atmosphere.skyLookup(vec3(0, 1, 0)).mul(1.1))).add(col(colorA).mul(glow).mul(smoothstep(0.5, 0.0, age)));
        if (underglow) c = c.add(col(underglow).mul(smoothstep(0.16, 0.0, age)).mul(float(1).sub(uv().y)).mul(amount).mul(6.0));
        m.colorNode = c;
        if (flame) { m.colorNode = mix(col(colorA), col(colorB), smoothstep(0.1, 0.8, age)).mul(glow).mul(a).mul(amount); m.blending = THREE.AdditiveBlending; m.fog = false; }
        m.opacityNode = flame ? float(1) : a.mul(opacity).mul(amount);
        m.fog = true;
        const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = 20;
        group.add(mesh);
        return mesh;
    };

    // ==== stone keyboard ===========================================================
    const keys = [];
    let keyboard = null;
    {
        const s = SITES.typing, rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
        const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
        const cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, 1024, 512);
        cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = '600 88px "IBM Plex Mono", ui-monospace, Menlo, monospace';
        const letters = 'QWERTYUIOPASDFGHJKLZXCVBNM ';
        for (let i = 0; i < letters.length; i++) cx.fillText(letters[i], (i % 8) * 128 + 64, Math.floor(i / 8) * 128 + 68);
        const glyphs = new THREE.CanvasTexture(cv); glyphs.flipY = false; glyphs.colorSpace = THREE.NoColorSpace; glyphs.generateMipmaps = true; glyphs.minFilter = THREE.LinearMipmapLinearFilter; glyphs.anisotropy = 8;
        const list = [];
        const pitch = 2.05, pitchZ = 2.75, yaw = 0.67;          // the board's near edge faces the camera to the south-west
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        rows.forEach((row, r) => { for (let i = 0; i < row.length; i++) list.push({ ch: row[i], lx: (i - (row.length - 1) / 2 + r * 0.22) * pitch, lz: (r - 1) * pitchZ, w: 1 }); });
        list.push({ ch: ' ', lx: 0, lz: 2 * pitchZ, w: 5.2 });
        const geo = new RoundedBoxGeometry(1.6, 0.7, 1.6, 3, 0.1);
        const n = list.length;
        const inst = new THREE.InstancedMesh(geo, null, n);
        const gA = new Float32Array(n * 4);      // glyph cell x, y, glow, width
        const dummy = new THREE.Object3D();
        list.forEach((k, i) => {
            const x = s.x + k.lx * cy - k.lz * sy, z = s.z + k.lx * sy + k.lz * cy, y = ground(x, z);
            dummy.position.set(x, Math.min(y, ground(x + 0.8, z + 0.8), ground(x - 0.8, z - 0.8), ground(x + 0.8, z - 0.8), ground(x - 0.8, z + 0.8)) - 0.04 + (rnd() - 0.5) * 0.08, z);
            dummy.rotation.set((rnd() - 0.5) * 0.09, -yaw + (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.09);
            dummy.scale.set(k.w, 1, 1); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
            const gi = letters.indexOf(k.ch); gA[i * 4] = gi % 8; gA[i * 4 + 1] = Math.floor(gi / 8); gA[i * 4 + 2] = 0; gA[i * 4 + 3] = k.ch === ' ' ? 0 : k.w;
            keys.push({ ch: k.ch, glow: 0, target: 0, x, y, z });
            clear.push([x, z, 1.6]);
        });
        const attr = new THREE.InstancedBufferAttribute(gA, 4); attr.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('gl', attr);
        const m = new THREE.MeshStandardNodeMaterial();
        const gl = attribute('gl', 'vec4');
        const top = smoothstep(0.5, 0.9, normalGeometry.y);
        const guv = positionGeometry.xz.div(vec2(1.6, 1.6)).add(0.5);
        const cellUV = vec2(gl.x.add(guv.x.sub(0.5).mul(gl.w).add(0.5)), gl.y.add(guv.y)).div(vec2(8, 4));        // u runs with +x, v with +z: read from the south
        const glyph = texture(glyphs, cellUV).r.mul(top);
        const rt = texture(rockTex, positionGeometry.xz.mul(0.5).add(gl.xy.mul(0.37))), rs = texture(rockTex, positionGeometry.xy.mul(0.5).add(gl.yx.mul(0.21)).add(positionGeometry.z.mul(0.5)));
        const chisel = texture(noiseTex, positionGeometry.xz.mul(vec2(2.2, 9.0)).add(gl.xy.mul(0.13)).add(positionGeometry.y.mul(6.0))).g;
        const stone = col('#7a746a').mul(mix(0.55, 1.15, mix(rs.b, rt.b, top))).mul(mix(0.82, 1.08, chisel));
        const moss = smoothstep(0.5, 0.82, texture(noiseTex, positionGeometry.xz.mul(0.35).add(gl.xy.mul(0.21))).r.add(float(1).sub(top).mul(0.2))).mul(float(1).sub(top.mul(0.65)));
        // chipped corners show paler stone; soil has washed up the sides
        const edgeWear = smoothstep(0.62, 0.8, max(abs(positionGeometry.x), abs(positionGeometry.z))).mul(smoothstep(0.15, 0.33, positionGeometry.y)).mul(rt.a);
        const grime = smoothstep(0.08, -0.32, positionGeometry.y);
        m.colorNode = mix(mix(mix(mix(stone, col('#44512a'), moss.mul(0.7)), stone.mul(0.07), glyph.mul(0.96)), col('#a39c8f'), edgeWear.mul(0.6)), col('#3f3327'), grime.mul(0.75));
        m.roughnessNode = float(0.86);
        m.emissiveNode = col('#9be36f').mul(glyph).mul(gl.z).mul(7.0);
        inst.material = m; inst.frustumCulled = false; add(inst);
        clear.push([s.x, s.z, 12]);
        keyboard = { attr, gA };
        // types a line by itself; real key presses light their stone too
        const demo = 'REXYREX TYPES IN KOREAN AND ENGLISH ';
        let next = 0, di = 0;
        updates.push((t, dt) => {
            if (t > next) { const ch = demo[di++ % demo.length]; const k = keys.find((q) => q.ch === ch); if (k) k.glow = 1; next = t + 0.16 + Math.random() * 0.22; }
            let dirty = false;
            keys.forEach((k, i) => { if (k.glow > 0.001 || gA[i * 4 + 2] > 0.001) { k.glow *= Math.pow(0.07, dt); gA[i * 4 + 2] = k.glow; dirty = true; } });
            if (dirty) attr.needsUpdate = true;
        });
    }
    const pressKey = (ch) => { const k = keys.find((q) => q.ch === String(ch).toUpperCase()); if (k) k.glow = 1.4; return !!k; };

    // ==== balloons over the sea cliffs =============================================
    const balloons = [];
    {
        const s = SITES.balloons;
        const g = new THREE.SphereGeometry(1, 22, 16);
        { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = y < 0 ? 1 + y * 0.28 : 1; p.setXYZ(i, p.getX(i) * k, y * 1.16, p.getZ(i) * k); } g.computeVertexNormals(); }
        const knot = new THREE.ConeGeometry(0.16, 0.24, 8);
        const tints = ['#d8243a', '#e23b4c', '#c81d34', '#e8553f', '#f0b53d', '#3f8fd8'];
        const n = Math.round(26 * Math.min(1, quality.fauna + 0.3));
        const strings = [];
        for (let i = 0; i < n; i++) {
            const m = new THREE.MeshPhysicalNodeMaterial({ color: new THREE.Color(tints[i % 3 === 0 ? Math.floor(rnd() * tints.length) : Math.floor(rnd() * 3)]), roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.2 });
            const b = add(new THREE.Mesh(g, m));
            // spread through what the camera at this stop sees: out over the water, near and far, high and low
            const pl = places.find((q) => q.id === 'balloons');
            const fx0 = pl.look[0] - pl.cam[0], fz0 = pl.look[2] - pl.cam[2], fl = Math.hypot(fx0, fz0), fx = fx0 / fl, fz = fz0 / fl;
            const t = lerp(38, 190, Math.pow(rnd(), 0.8)), lat = (rnd() - 0.5) * 0.92 * t, r = lerp(1.1, 2.1, rnd());
            const x = pl.cam[0] + fx * t - fz * lat, z = pl.cam[2] + fz * t + fx * lat;
            const y = Math.max(Math.max(0, ground(x, z)) + 9, pl.cam[1] + t * lerp(-0.36, 0.2, rnd()));
            b.scale.setScalar(r); b.position.set(x, y, z);
            const k2 = new THREE.Mesh(knot, m); k2.position.y = -1.22; b.add(k2);
            balloons.push({ mesh: b, base: b.position.clone(), r, seed: rnd(), alive: true });
            strings.push(x, y - r * 1.3, z, x + (rnd() - 0.5) * 0.6, y - r * 1.3 - lerp(5, 9, rnd()), z + (rnd() - 0.5) * 0.6);
        }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(strings), 3));
        const lines = new THREE.LineSegments(sg, new THREE.LineBasicNodeMaterial({ color: 0xe8e2d2, transparent: true, opacity: 0.55 })); lines.frustumCulled = false; group.add(lines);
        updates.push((t) => {
            const p = sg.attributes.position;
            balloons.forEach((b, i) => {
                const dy = Math.sin(t * 0.5 + b.seed * 20) * 1.1, dx = Math.sin(t * 0.23 + b.seed * 9) * 1.6;
                b.mesh.position.set(b.base.x + dx, b.base.y + dy, b.base.z);
                p.setXYZ(i * 2, b.mesh.position.x, b.mesh.position.y - b.r * 1.3, b.mesh.position.z);
                if (!b.alive) p.setXYZ(i * 2 + 1, b.mesh.position.x, b.mesh.position.y - b.r * 1.3, b.mesh.position.z);
            });
            p.needsUpdate = true;
        });
    }
    // pop the balloon under a ray; returns true when one burst
    const ray = new THREE.Raycaster();
    const pop = (ndcX, ndcY, camera) => {
        ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
        let best = null, bd = 1e9;
        for (const b of balloons) { if (!b.alive) continue; const d = ray.ray.distanceToPoint(b.mesh.position); const along = b.mesh.position.clone().sub(ray.ray.origin).dot(ray.ray.direction); if (d < b.r * 1.5 && along > 0 && along < bd) { bd = along; best = b; } }
        if (!best) return false;
        best.alive = false; best.mesh.visible = false;
        return true;
    };

    // ==== volcano: lava in the crater, smoke above =================================
    const uActivity = uniform(0.35);         // 0.35 at rest; 1 while the games portal answers
    {
        let y = -1e9; for (let a = 0; a < 6.283; a += 0.4) for (const r of [0, 12, 24, 34]) y = Math.max(y, ground(VOLCANO.x + Math.cos(a) * r, VOLCANO.z + Math.sin(a) * r));
        y = -1e9; for (let a = 0; a < 6.283; a += 0.3) for (const r of [0, 10, 20, 30, 36]) y = Math.max(y, ground(VOLCANO.x + Math.cos(a) * r, VOLCANO.z + Math.sin(a) * r));
        y += 0.9;                                        // over the highest point of the floor: the lake covers it all and meets the walls
        const g = new THREE.CircleGeometry(58, 64); g.rotateX(-Math.PI / 2);
        const m = new THREE.MeshStandardNodeMaterial();
        m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4;
        const q = positionWorld.xz.sub(vec2(VOLCANO.x, VOLCANO.z));
        // how deep the lava stands over the crater floor here: it is drawn only where it covers the rock
        const cover = float(y).sub(terrain.gridHeight(positionWorld.xz));
        m.maskNode = cover.greaterThan(0.25);
        const shore = smoothstep(0.25, 1.4, cover);
        const stir = texture(noiseTex, q.mul(0.006).add(vec2(time.mul(0.003), time.mul(-0.002)))).rg.sub(0.5);
        const p1 = q.mul(0.024).add(stir.mul(0.5)).add(vec2(time.mul(0.0016), time.mul(0.0011)));
        const p2 = q.mul(0.075).add(stir.mul(0.9)).sub(vec2(time.mul(0.0024), 0));
        const plate = texture(noiseTex, p1).a, small = texture(noiseTex, p2).a;        // bright at a cell's middle
        const fissure = smoothstep(0.17, 0.02, plate), hair = smoothstep(0.12, 0.01, small).mul(0.35);
        const pool = smoothstep(0.7, 0.9, texture(noiseTex, q.mul(0.008).add(vec2(time.mul(0.002), 0))).r);
        // toward the walls the crust has cooled: the glow dies away and the lake ends in dark rock, not in a line
        const heat = saturate(fissure.add(hair).add(pool.mul(0.85)).mul(smoothstep(0.3, 3.2, cover)));
        const pulse = sin(time.mul(0.6).add(plate.mul(6.0))).mul(0.14).add(1.0);
        m.colorNode = mix(col('#070606'), col('#1a110e'), small.mul(0.6).add(plate.mul(0.4)));
        m.roughnessNode = mix(float(0.92), float(0.4), heat);
        m.emissiveNode = mix(col('#b81802'), col('#ffb646'), pow(heat, 2.2)).mul(pow(heat, 1.5)).mul(uActivity.mul(22).add(7)).mul(pulse);
        const lava = new THREE.Mesh(g, m); lava.position.set(VOLCANO.x, y, VOLCANO.z); lava.receiveShadow = false; group.add(lava);
        lavaAt = { x: VOLCANO.x, y, z: VOLCANO.z };
        const glowLight = new THREE.PointLight(0xff7a2a, 0, 170, 2); glowLight.position.set(VOLCANO.x, y + 14, VOLCANO.z); group.add(glowLight);
        updates.push((t) => { glowLight.intensity = (30000 + 3500 * Math.sin(t * 0.6)) * (0.3 + 0.7 * uActivity.value); });
        clear.push([VOLCANO.x, VOLCANO.z, 56]);
        puffs({ count: 70, origin: [VOLCANO.x - 6, y + 1, VOLCANO.z + 4], height: 120, spread: 13, drift: [26, 10], size0: 5, size1: 30, life: 15, colorA: '#4f4743', colorB: '#8f8983', glow: 0, underglow: '#ff5a1a', opacity: 0.42, amount: uActivity.mul(0.7).add(0.3) });
        const top = ground(VOLCANO.x, VOLCANO.z) + 8;
        puffs({ count: quality.post > 0 ? 110 : 40, origin: [VOLCANO.x, top, VOLCANO.z], height: 430, spread: 30, drift: [430, 170], size0: 34, size1: 210, life: 58, colorA: '#6d635c', colorB: '#a8a39c', glow: 0, underglow: '#ff6a2a', opacity: 0.62, amount: uActivity.mul(0.85).add(0.15) });
    }

    // ==== ranger outpost ===========================================================
    {
        const s = SITES.mac, y = ground(s.x, s.z);
        const post = woodMat('#5f4a36'), beam = woodMat('#6a543d'), boards = plankMat('#80684c', 'y', 0.19), deckM = plankMat('#6f5a43', 'z', 0.16), trim = woodMat('#3f3024');
        const box = (w, h, d, mat, x, yy, z, rx = 0, ry = 0, rz = 0) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(s.x + x, y + yy, s.z + z); m.rotation.set(rx, ry, rz); return m; };
        const H = 8.6, half = 1.7;
        // four posts, splayed a little, each on a stone
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.21, H + 0.3, 9), post));
            m.position.set(s.x + dx * (half + 0.12), ground(s.x + dx * half, s.z + dz * half) + H / 2, s.z + dz * (half + 0.12)); m.rotation.set(dz * 0.028, 0, -dx * 0.028);
            const f = add(new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.5, 0.9, 2, 0.08), stoneMat('#77726a'))); f.position.set(s.x + dx * (half + 0.24), ground(s.x + dx * half, s.z + dz * half) + 0.08, s.z + dz * (half + 0.24)); f.rotation.y = rnd() * 0.6;
        }
        // girts at two heights, and a pair of crossed braces in every bay
        for (const gy of [2.9, 5.8]) for (const [x, z, ry] of [[0, -half - 0.1, 0], [0, half + 0.1, 0], [-half - 0.1, 0, Math.PI / 2], [half + 0.1, 0, Math.PI / 2]]) box(half * 2 + 0.5, 0.15, 0.13, beam, x, gy, z, 0, ry);
        for (const [y0, y1] of [[0.3, 2.85], [2.95, 5.75], [5.85, H - 0.1]]) {
            const hh = y1 - y0, L = Math.hypot(hh, half * 2), ang = Math.atan2(hh, half * 2);
            for (const [x, z, ry] of [[0, -half - 0.16, 0], [0, half + 0.16, 0], [-half - 0.16, 0, Math.PI / 2], [half + 0.16, 0, Math.PI / 2]]) for (const sgn of [1, -1]) box(L, 0.1, 0.07, beam, x + (ry ? sgn * 0.04 : 0), (y0 + y1) / 2, z + (ry ? 0 : sgn * 0.04), 0, ry, sgn * ang);
        }
        // deck on joists, a railing with posts
        for (const dz of [-1.8, -0.6, 0.6, 1.8]) box(4.9, 0.18, 0.12, beam, 0, H - 0.02, dz);
        box(5.0, 0.09, 5.0, deckM, 0, H + 0.12, 0);
        for (const [x, z] of [[-2.4, -2.4], [0, -2.4], [2.4, -2.4], [-2.4, 0], [2.4, 0], [-2.4, 2.4], [2.4, 2.4]]) box(0.09, 1.05, 0.09, trim, x, H + 0.68, z);
        for (const [x, z, ry, len] of [[0, -2.4, 0, 4.9], [-2.4, 0, Math.PI / 2, 4.9], [2.4, 0, Math.PI / 2, 4.9], [-1.5, 2.4, 0, 1.9], [1.5, 2.4, 0, 1.9]]) for (const ry2 of [1.18, 0.66]) box(len, 0.07, 0.07, trim, x, H + ry2, z, 0, ry);
        // the cabin: board walls, a door, a glazed window that is lit from inside
        box(3.1, 2.3, 3.1, boards, 0, H + 1.32, 0);
        for (const [x, z] of [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]]) box(0.14, 2.34, 0.14, trim, x, H + 1.32, z);
        box(0.86, 1.8, 0.06, plankMat('#5d4a37', 'y', 0.21), 0.6, H + 1.08, 1.57);
        const glass = new THREE.MeshStandardNodeMaterial(); glass.colorNode = col('#141a1c'); glass.roughnessNode = float(0.08); glass.emissiveNode = col('#ffbf7a').mul(1.6).mul(smoothstep(0.75, 0.2, length(uv().sub(vec2(0.5, 0.35)))));
        for (const [x, z, ry] of [[-1.56, 0, -Math.PI / 2], [-0.55, 1.56, 0]]) {
            const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.8), glass); pane.position.set(s.x + x, y + H + 1.55, s.z + z); pane.rotation.y = ry; group.add(pane);
            const c = Math.cos(ry), sn = Math.sin(ry);
            for (const [ox, oy, w, h] of [[0, 0.44, 1.16, 0.09], [0, -0.44, 1.16, 0.09], [-0.54, 0, 0.09, 0.9], [0.54, 0, 0.09, 0.9], [0, 0, 0.05, 0.8], [0, 0, 1.0, 0.05]]) box(w, h, 0.08, trim, x + ox * c + 0.03 * sn, H + 1.55 + oy, z - ox * sn + 0.03 * c, 0, ry);
        }
        // roof: a low pyramid that overhangs, in dark shingle
        const shingle = new THREE.MeshStandardNodeMaterial(); { const row = fract(positionWorld.y.mul(7.0)), tab = fract(positionWorld.x.add(positionWorld.z).mul(2.6).add(floor(positionWorld.y.mul(7.0)).mul(0.5))); shingle.colorNode = col('#3a3029').mul(mix(0.6, 1.0, smoothstep(0.0, 0.25, row))).mul(mix(0.8, 1.05, smoothstep(0.0, 0.08, tab))).mul(mix(0.85, 1.1, texture(noiseTex, positionWorld.xz.mul(0.9)).g)); shingle.roughnessNode = float(0.9); }
        const roof = add(new THREE.Mesh(new THREE.ConeGeometry(3.25, 1.45, 4, 1), shingle)); roof.position.set(s.x, y + H + 3.2, s.z); roof.rotation.y = Math.PI / 4;
        // a ladder up the south side: two rails and its rungs
        { const lean = 0.11, len = H + 0.5; for (const dx of [-0.27, 0.27]) box(0.07, len, 0.07, beam, 1.5 + dx, H / 2 + 0.05, 2.62 + Math.sin(lean) * len / 2 - 0.2, lean, 0, 0); for (let i = 1; i < 23; i++) { const t = i / 23; box(0.5, 0.045, 0.045, trim, 1.5, t * len * Math.cos(lean) + 0.05, 2.62 + Math.sin(lean) * len * (1 - t) - 0.2 - Math.sin(lean) * len / 2 + Math.sin(lean) * len / 2); } }
        // instruments: a mast with a spinning anemometer, a small solar panel
        const steel = plain('#8b8f92', 0.45, { metalness: 0.7 });
        const mast = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 4.2, 6), steel)); mast.position.set(s.x + 2.2, y + H + 2.1, s.z - 2.2);
        const vane = new THREE.Group(); vane.position.set(s.x + 2.2, y + H + 4.25, s.z - 2.2);
        for (let i = 0; i < 3; i++) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.025, 0.025), steel); arm.position.set(0.3, 0, 0); const cup = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8, 0, Math.PI), steel); cup.position.set(0.6, 0, 0); const h2 = new THREE.Group(); h2.add(arm, cup); h2.rotation.y = (i / 3) * 6.283; vane.add(h2); }
        group.add(vane);
        updates.push((t) => { vane.rotation.y = t * 4.1; });
        clear.push([s.x, s.z, 6]);
    }

    // ==== base camp ================================================================
    const uFire = uniform(0.7);              // 0.25 embers .. 1 freshly fed
    {
        const s = SITES.contact, y = ground(s.x, s.z);
        const canvas = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
        { const weave = texture(noiseTex, positionWorld.xz.mul(1.3).add(positionWorld.y.mul(0.9))).g; const folds = sin(positionLocal.z.mul(7.0).add(positionLocal.y.mul(2.4))).mul(0.5).add(0.5); canvas.colorNode = col('#877a5c').mul(mix(0.72, 1.08, weave)).mul(mix(0.78, 1.04, folds)).mul(mix(0.66, 1.0, smoothstep(0.0, 0.5, positionLocal.y))); canvas.roughnessNode = float(0.93); }
        const rope = new THREE.LineBasicNodeMaterial({ color: 0xcfc6ac, transparent: true, opacity: 0.7 });
        const tent = (x, z, ry, sc) => {
            const g = new THREE.BufferGeometry();
            const w = 1.35, l = 2.0, h = 1.45, sag = 0.12;
            // two cloth panels that sag between ridge and ground, a back wall, door flaps left open
            const v = [-w, 0, -l, -w * 0.5, h * 0.5 - sag, -l, 0, h, -l, w * 0.5, h * 0.5 - sag, -l, w, 0, -l, -w, 0, l, -w * 0.5, h * 0.5 - sag, l, 0, h - 0.05, l, w * 0.5, h * 0.5 - sag, l, w, 0, l];
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
            g.setIndex([0, 1, 6, 0, 6, 5, 1, 2, 7, 1, 7, 6, 2, 3, 8, 2, 8, 7, 3, 4, 9, 3, 9, 8, 0, 2, 1, 0, 4, 2, 2, 4, 3]);
            g.computeVertexNormals();
            const cr = Math.cos(ry), sr = Math.sin(ry);
            let y0 = ground(x, z); for (const [lx, lz] of [[-w, -l], [w, -l], [-w, l], [w, l], [0, -l], [0, l]]) y0 = Math.min(y0, ground(x + (lx * cr + lz * sr) * sc, z + (-lx * sr + lz * cr) * sc));
            const m = add(new THREE.Mesh(g, canvas)); m.position.set(x, y0 - 0.03, z); m.rotation.y = ry; m.scale.setScalar(sc);
            const c = Math.cos(ry), sn = Math.sin(ry);
            const P = (lx, ly, lz) => [x + (lx * c + lz * sn) * sc, y0 + ly * sc, z + (-lx * sn + lz * c) * sc];
            for (const lz of [-l, l]) { const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, (h + 0.12) * sc, 6), woodMat('#5b4631'))); const q = P(0, (h + 0.12) / 2, lz); pole.position.set(q[0], q[1], q[2]); }
            const pts = []; for (const [ax, az, bx, bz] of [[0, l, 0, l + 1.7], [0, -l, 0, -l - 1.7], [-w, l, -w - 0.9, l + 0.5], [w, l, w + 0.9, l + 0.5], [-w, -l, -w - 0.9, -l - 0.5], [w, -l, w + 0.9, -l - 0.5]]) { pts.push(...P(ax, ax === 0 ? h : 0.02, az), ...P(bx, 0.0, bz)); }
            const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3)); group.add(new THREE.LineSegments(lg, rope));
            clear.push([x, z, 3.4 * sc]);
        };
        tent(s.x - 5.2, s.z - 2.6, 0.95, 1.1); tent(s.x - 10.4, s.z - 0.4, 0.55, 1.0);
        // fire ring
        const stone = stoneMat('#5d5852');
        for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283, m = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + rnd() * 0.1, 1), stone)); m.position.set(s.x + Math.cos(a) * 0.75, y + 0.08, s.z + Math.sin(a) * 0.75); m.scale.y = 0.7; }
        for (let i = 0; i < 4; i++) { const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 7), woodMat('#3a2c20'))); m.position.set(s.x, y + 0.28, s.z); m.rotation.set(1.05, (i / 4) * 6.283, 0); }
        puffs({ count: 64, origin: [s.x, y + 0.2, s.z], height: 2.3, spread: 0.36, drift: [0.4, 0.14], size0: 0.72, size1: 0.14, life: 0.8, colorA: '#ffb54a', colorB: '#d93a06', glow: 1.15, opacity: 1, amount: uFire, flame: true });
        puffs({ count: 18, origin: [s.x, y + 1.6, s.z], height: 22, spread: 0.6, drift: [16, 6], size0: 0.4, size1: 2.6, life: 9, colorA: '#55524e', colorB: '#7d7a75', glow: 0, opacity: 0.07, amount: uFire });
        const light = new THREE.PointLight(0xff9040, 0, 26, 1.6); light.position.set(s.x, y + 0.9, s.z); group.add(light);
        updates.push((t) => { light.intensity = (26 + 9 * Math.sin(t * 9.1) * Math.sin(t * 13.7)) * uFire.value; });
        // crates and a log to sit on
        const crate = new THREE.BoxGeometry(0.8, 0.6, 0.6);
        for (const [dx, dz, ry] of [[-2.4, -3.3, 0.4], [-3.3, -2.9, 1.1]]) { const m = add(new THREE.Mesh(crate, plankMat('#7b6243', 'x', 0.15))); m.position.set(s.x + dx, ground(s.x + dx, s.z + dz) + 0.3, s.z + dz); m.rotation.y = ry; }
        clear.push([s.x, s.z, 3.4]);
    }

    const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
    const update = (t, dt, camera) => {
        camera.matrixWorld.extractBasis(_r, _u, _f);
        uCamRight.value.copy(_r); uCamUp.value.copy(_u);
        for (const f of updates) f(t, dt);
    };

    return {
        group, update, clear, balloons, pressKey, pop, uActivity, uFire, lava: lavaAt,
        setActivity(v) { uActivity.value = v; }, setFire(v) { uFire.value = v; },
        balloonsLeft() { return balloons.filter((b) => b.alive).length; },
    };
}
