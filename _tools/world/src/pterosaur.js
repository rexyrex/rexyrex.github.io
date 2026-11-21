// Pterosaurs. A Pteranodon built from its measurements rather than sculpted: the
// body, neck and head are one skin lofted along the spine; the crest is a blade
// lofted the same way; the wing is the arm (upper arm, forearm, the long wing
// metacarpal and the four bones of the wing finger) with a membrane stretched
// from it back to the ankle and a smaller one forward to the neck. Each animal
// is one instance; its flight is a handful of numbers written by the caller.
//
// Model space: +x forward (beak), +y up, +z the animal's right. Metres; the
// half span is about 3.9 m at scale 1.
import * as THREE from 'three/webgpu';
import {
    attribute, texture, vec2, vec3, vec4, float, mix, max, min, abs, sign, normalize, pow, sin, cos, length, dot, select, saturate,
    positionGeometry, normalGeometry, positionWorld, normalWorld, cameraViewMatrix, lights,
} from 'three/tsl';
import { smoothstep } from './tsl.js';
import { catmull, clamp as cl, lerp } from './noise.js';

// where the wing hinges, and where the hand begins (the fold of the outer wing)
const Z0 = 0.17, YS = 0.1, ZW = 1.42;

// parts, for the material: aux = (part, u, v, shade)
const BODY = 0, MEMBRANE = 1, ARM = 2, BEAK = 3, CREST = 4, LEG = 5, CLAW = 6;

function pterosaurGeometry(detail = 1) {
    const pos = [], aux = [], idx = [];
    const v = (x, y, z, part, u, w, shade = 1) => { pos.push(x, y, z); aux.push(part, u, w, shade); return pos.length / 3 - 1; };
    const quad = (a, b, c, d, flip) => { if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); };
    // join two rings of the same size
    const band = (r0, r1, flip) => { const n = r0.length; for (let k = 0; k < n; k++) quad(r0[k], r0[(k + 1) % n], r1[k], r1[(k + 1) % n], flip); };
    const N = (n) => Math.max(3, Math.round(n * detail));

    // ---- body, neck, skull and beak: one skin along the spine ----------------------
    // [x, y, radius up, radius down, radius to the side]
    const SPINE = [
        [-0.9, 0.035, 0.008, 0.008, 0.008], [-0.74, 0.035, 0.038, 0.038, 0.035], [-0.56, 0.025, 0.09, 0.098, 0.092], [-0.36, 0.015, 0.135, 0.165, 0.145],
        [-0.12, 0.01, 0.17, 0.218, 0.182], [0.1, 0.02, 0.19, 0.262, 0.206], [0.28, 0.045, 0.186, 0.228, 0.212], [0.41, 0.09, 0.14, 0.158, 0.146],   // hips, the keel of the breastbone, shoulders
        [0.52, 0.17, 0.126, 0.142, 0.118], [0.64, 0.27, 0.112, 0.124, 0.1], [0.76, 0.37, 0.102, 0.11, 0.09], [0.86, 0.45, 0.098, 0.102, 0.086],         // neck
        [0.95, 0.505, 0.102, 0.096, 0.088], [1.05, 0.53, 0.11, 0.1, 0.092], [1.18, 0.525, 0.1, 0.092, 0.078], [1.36, 0.5, 0.08, 0.076, 0.054],          // skull
        [1.62, 0.465, 0.058, 0.056, 0.033], [1.93, 0.42, 0.037, 0.036, 0.021], [2.2, 0.38, 0.019, 0.019, 0.011], [2.38, 0.352, 0.003, 0.003, 0.002],    // beak
    ];

    {
        const SUB = N(4), SIDES = N(14), rings = [], q = [0, 0, 0, 0, 0], q1 = [0, 0, 0, 0, 0], last = (SPINE.length - 1) * SUB;
        for (let i = 0; i <= last; i++) {
            const t = i / SUB; catmull(SPINE, t, q); catmull(SPINE, Math.min(SPINE.length - 1, t + 0.02), q1);
            let tx = q1[0] - q[0], ty = q1[1] - q[1]; if (i === last) { catmull(SPINE, t - 0.02, q1); tx = q[0] - q1[0]; ty = q[1] - q1[1]; }
            const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
            const part = q[0] > 1.32 ? BEAK : BODY, u = (q[0] + 0.9) / 3.28, ring = [];
            for (let k = 0; k < SIDES; k++) {
                const a = (k / SIDES) * 6.2832, c = Math.cos(a), s = Math.sin(a);
                // a ridge along the top of the beak and a keel under the chest: the section is pinched top and bottom
                const pinch = part === BEAK ? Math.pow(Math.abs(s), 0.75) * Math.sign(s) : s;
                const up = c * (c > 0 ? q[2] : q[3]);
                ring.push(v(q[0] - ty * up, q[1] + tx * up, pinch * q[4], part, u, c, 1));
            }
            rings.push(ring);
        }
        for (let i = 0; i < rings.length - 1; i++) band(rings[i], rings[i + 1], false);
    }

    // ---- the crest: a blade sweeping up and back from the skull ---------------------
    {
        const STEPS = N(12), SIDES = N(10), rings = [];
        const P0 = [1.1, 0.565], P1 = [0.78, 0.8], P2 = [0.3, 1.04];
        for (let i = 0; i <= STEPS; i++) {
            const s = i / STEPS, a = 1 - s;
            const x = a * a * P0[0] + 2 * a * s * P1[0] + s * s * P2[0], y = a * a * P0[1] + 2 * a * s * P1[1] + s * s * P2[1];
            let tx = 2 * a * (P1[0] - P0[0]) + 2 * s * (P2[0] - P1[0]), ty = 2 * a * (P1[1] - P0[1]) + 2 * s * (P2[1] - P1[1]); const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
            const w = 0.15 * Math.pow(1 - Math.pow(s, 2.4), 0.8) + 0.004, th = 0.022 * (1 - 0.65 * s) + 0.002, ring = [];
            for (let k = 0; k < SIDES; k++) { const an = (k / SIDES) * 6.2832, c = Math.cos(an); ring.push(v(x - ty * c * w, y + tx * c * w, Math.sin(an) * th, CREST, s, c, 1)); }
            rings.push(ring);
        }
        for (let i = 0; i < rings.length - 1; i++) band(rings[i], rings[i + 1], false);
    }

    // a tube through points in space, round in section; radii per point. Its frame is worked out from the
    // points themselves, so a mirrored tube still faces outward
    const tube = (pts, radii, sides, part, shade = 1) => {
        const rings = [], n = pts.length;
        let ux = 0, uy = 1, uz = 0;
        for (let i = 0; i < n; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
            let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
            // carry the frame along: take what is left of the last "up" once the new direction is removed
            const d = ux * tx + uy * ty + uz * tz; ux -= tx * d; uy -= ty * d; uz -= tz * d; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
            const wx = ty * uz - tz * uy, wy = tz * ux - tx * uz, wz = tx * uy - ty * ux, ring = [];
            for (let k = 0; k < sides; k++) { const an = (k / sides) * 6.2832, c = Math.cos(an) * radii[i], s = Math.sin(an) * radii[i]; ring.push(v(pts[i][0] + ux * c + wx * s, pts[i][1] + uy * c + wy * s, pts[i][2] + uz * c + wz * s, part, i / (n - 1), Math.cos(an), shade)); }
            rings.push(ring);
        }
        for (let i = 0; i < n - 1; i++) band(rings[i], rings[i + 1], false);
    };
    // points and radii along a chain of bones: straight shafts, swollen at the joints
    const chain = (joints, shaft, knob, per) => {
        const pts = [], radii = [];
        for (let j = 0; j < joints.length - 1; j++) {
            const a = joints[j], b = joints[j + 1];
            for (let i = j ? 1 : 0; i <= per; i++) {
                const t = i / per; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
                const r = lerp(shaft[j], shaft[j + 1], t), end = Math.min(t, 1 - t) * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
                radii.push(r + (j + 1 < joints.length - 1 || t < 0.5 ? knob * r * Math.exp(-end * end / (r * r * 6)) : 0));
            }
        }
        return [pts, radii];
    };

    // ---- one side: arm, wing, leg. Built on the right (+z) and mirrored -------------
    const ARM_J = [[0.28, 0.1, 0.16], [0.22, 0.13, 0.66], [0.62, 0.15, 1.42], [0.66, 0.15, 2.02], [0.42, 0.13, 2.72], [0.05, 0.105, 3.28], [-0.38, 0.075, 3.68], [-0.8, 0.045, 3.92]];
    const ARM_R = [0.075, 0.05, 0.038, 0.03, 0.024, 0.018, 0.012, 0.004];
    const boneAt = (z, out) => { let j = 0; while (j < ARM_J.length - 2 && ARM_J[j + 1][2] < z) j++; const a = ARM_J[j], b = ARM_J[j + 1], t = cl((z - a[2]) / (b[2] - a[2]), 0, 1); out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); return out; };
    // the trailing edge: from the ankle out to the tip, hollowed the way a taut membrane is  [z, x, y]
    const TRAIL = [[0.06, -0.8, 0.0], [0.3, -1.18, -0.035], [0.62, -0.84, -0.005], [1.0, -0.56, 0.02], [1.5, -0.35, 0.04], [2.0, -0.26, 0.05], [2.6, -0.33, 0.05], [3.2, -0.53, 0.047], [3.7, -0.74, 0.045], [3.92, -0.8, 0.045]];
    // the forward membrane's edge: neck to wrist, held taut by the pteroid bone
    const LEAD = [[0.06, 0.4, 0.1], [0.4, 0.5, 0.115], [0.8, 0.585, 0.135], [1.15, 0.63, 0.15], [1.42, 0.62, 0.15]];
    const curveAt = (C, z, out) => { let j = 0; while (j < C.length - 2 && C[j + 1][0] < z) j++; const t = j + cl((z - C[j][0]) / (C[j + 1][0] - C[j][0]), 0, 1); catmull(C, t, out); return out; };
    const side = (sg) => {
        // (a membrane's front face is its top, on either wing)
        const top = sg > 0, P = (p) => [p[0], p[1], p[2] * sg];
        // span stations, closer together where the arm bends
        const ZS = []; { const marks = [0.06, 0.17, 0.3, 0.66, 1.42, 2.02, 2.72, 3.28, 3.68, 3.92], per = [1, 2, N(3), N(5), N(4), N(4), N(3), N(3), N(2)]; for (let j = 0; j < marks.length - 1; j++) for (let i = 0; i < per[j]; i++) ZS.push(lerp(marks[j], marks[j + 1], i / per[j])); ZS.push(3.92); }
        const b = [0, 0], tr = [0, 0, 0], le = [0, 0, 0];
        // the main membrane, arm to trailing edge
        const CH = N(9), rows = [];
        for (const z of ZS) {
            boneAt(Math.max(z, 0.16), b); curveAt(TRAIL, z, tr);
            const chord = b[0] - tr[1], f = (z - 0.06) / 3.86, row = [];
            for (let c = 0; c <= CH; c++) {
                const u = c / CH;
                // it bellies upward under load, most just behind the arm
                const belly = Math.sin(Math.PI * Math.pow(u, 0.62)) * chord * 0.055 * (1 - 0.5 * f);
                row.push(v(lerp(b[0], tr[1], u), lerp(b[1], tr[2], u) + belly, z * sg, MEMBRANE, f, u, 0.72 + 0.28 * Math.min(1, z / 0.7)));
            }
            rows.push(row);
        }
        for (let i = 0; i < rows.length - 1; i++) for (let c = 0; c < CH; c++) quad(rows[i][c], rows[i + 1][c], rows[i][c + 1], rows[i + 1][c + 1], top);
        // the forward membrane, from the edge back to the arm
        const CF = N(4), front = [];
        for (const z of ZS) {
            if (z > 1.421) break;
            boneAt(Math.max(z, 0.16), b); curveAt(LEAD, z, le);
            const row = []; for (let c = 0; c <= CF; c++) { const u = c / CF; row.push(v(lerp(le[1], b[0], u), lerp(le[2], b[1], u) + Math.sin(Math.PI * u) * 0.012, z * sg, MEMBRANE, (z - 0.06) / 3.86, -1 + u, 0.8 + 0.2 * Math.min(1, z / 0.7))); }
            front.push(row);
        }
        for (let i = 0; i < front.length - 1; i++) for (let c = 0; c < CF; c++) quad(front[i][c], front[i + 1][c], front[i][c + 1], front[i + 1][c + 1], top);
        // the arm and the wing finger
        { const [pts, radii] = chain(ARM_J, ARM_R, 0.42, N(5)); tube(pts.map(P), radii, N(8), ARM); }
        // the muscle of the upper arm and forearm
        tube([[0.3, 0.1, 0.1], [0.27, 0.115, 0.3], [0.23, 0.13, 0.52], [0.24, 0.135, 0.7], [0.4, 0.145, 1.0], [0.6, 0.15, 1.38]].map(P), [0.12, 0.105, 0.075, 0.062, 0.05, 0.036], N(9), ARM);
        // three small clawed fingers where the hand ends and the wing finger begins
        for (let k = 0; k < 3; k++) {
            const a = [0.67, 0.14, 1.98 + k * 0.03], m = [0.8 + k * 0.012, 0.12 - k * 0.006, 1.96 + k * 0.055], e = [0.9 + k * 0.015, 0.07 - k * 0.01, 1.95 + k * 0.075];
            tube([a, m, e].map(P), [0.014, 0.011, 0.002], N(5), CLAW);
        }
        // the leg trails behind and out; the membrane runs to its ankle
        tube([[-0.42, -0.02, 0.09], [-0.56, -0.04, 0.24], [-0.68, -0.045, 0.37], [-0.92, -0.04, 0.345], [-1.18, -0.035, 0.3], [-1.3, -0.04, 0.3]].map(P), [0.085, 0.07, 0.048, 0.034, 0.024, 0.02], N(8), LEG);
        for (let k = 0; k < 4; k++) tube([[-1.28, -0.04, 0.3], [-1.42, -0.045, 0.265 + k * 0.026], [-1.56, -0.05, 0.245 + k * 0.04]].map(P), [0.014, 0.01, 0.002], N(4), CLAW);
    };
    side(1); side(-1);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(aux), 4));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    g.computeVertexNormals();
    // both wings are lit from above: a membrane has one normal, and the back face turns it over
    { const n = g.attributes.normal, A = g.attributes.aux; for (let i = 0; i < n.count; i++) if (A.getX(i) === MEMBRANE && n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
    g.userData.tris = idx.length / 3;
    return g;
}

// A set of instanced pterosaurs whose places are written by the caller each frame.
//   set(i, x, y, z, scale, yaw, bank, flap, pitch, curl, fold, tint)
//   flap  the wing's angle at the shoulder, radians, up positive
//   curl  how much further the wing bends toward the tip, radians per metre (the tip lags the stroke)
//   fold  the outer wing swung back about the wrist, radians (the upstroke, a stoop)
//   lights  the lights this flock answers to (default: all of the scene's)
//   glow    { x, y, z, color, strength }: light from a wide bright surface below, such as a lake of lava. A point
//           light standing in for one burns anything that flies close to it; this falls off the way a broad
//           source does, and lights only what faces down
export function createFlock(count, { shadows = false, noiseTex = null, detail = 1, lights: lit = null, glow = null } = {}) {
    const key = 'geo' + detail;
    const pgeo = createFlock[key] || (createFlock[key] = pterosaurGeometry(detail));
    const A = new Float32Array(count * 4), B = new Float32Array(count * 4), C = new Float32Array(count * 4);
    const g = new THREE.InstancedBufferGeometry();
    g.index = pgeo.index; for (const k of Object.keys(pgeo.attributes)) g.setAttribute(k, pgeo.attributes[k]);
    const aA = new THREE.InstancedBufferAttribute(A, 4), aB = new THREE.InstancedBufferAttribute(B, 4), aC = new THREE.InstancedBufferAttribute(C, 4);
    aA.setUsage(THREE.DynamicDrawUsage); aB.setUsage(THREE.DynamicDrawUsage); aC.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', aA); g.setAttribute('iB', aB); g.setAttribute('iC', aC); g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    // (a material is made for each flock and never kept between worlds: it holds this world's lights and textures)
    let material;
    {
        const iA = attribute('iA', 'vec4'), iB = attribute('iB', 'vec4'), iC = attribute('iC', 'vec4'), ax = attribute('aux', 'vec4');
        const yaw = iB.x, bank = iB.y, flap = iB.z, pitch = iB.w, curl = iC.x, fold = iC.y, tint = iC.z;
        // The wing: first the hand swings back about the wrist, then the whole of it bends along an arc
        // from the shoulder. An arc keeps every bone its own length, which scaling the tip upward does not.
        const wing = (p, n) => {
            const sg = sign(p.z), az = abs(p.z);
            const hand = max(az.sub(ZW), 0.0);
            const azF = az.sub(hand.mul(float(1).sub(cos(fold)))), xF = p.x.sub(hand.mul(sin(fold)));
            const s = max(azF.sub(Z0), 0.0);
            const k = curl.add(select(curl.greaterThanEqual(0.0), float(1e-3), float(-1e-3)));
            const phi = flap.add(k.mul(s));
            const out = sin(phi).sub(sin(flap)).div(k), up = cos(flap).sub(cos(phi)).div(k);
            const turn = phi.mul(smoothstep(0.0, 0.16, s)), ct = cos(turn), st = sin(turn);
            const yr = p.y.sub(YS), nz = n.z.mul(sg);
            return [
                vec3(xF, float(YS).add(up).add(yr.mul(ct)), sg.mul(min(azF, Z0).add(out).sub(yr.mul(st)))),
                vec3(n.x, n.y.mul(ct).add(nz.mul(st)), nz.mul(ct).sub(n.y.mul(st)).mul(sg)),
            ];
        };
        const tf = (p) => {
            const cp = cos(pitch), sp = sin(pitch);                           // nose up or down
            const p1 = vec3(p.x.mul(cp).sub(p.y.mul(sp)), p.x.mul(sp).add(p.y.mul(cp)), p.z);
            const cb = cos(bank), sb = sin(bank);                             // roll about the body
            const p2 = vec3(p1.x, p1.y.mul(cb).sub(p1.z.mul(sb)), p1.y.mul(sb).add(p1.z.mul(cb)));
            const cy = cos(yaw), sy = sin(yaw);
            return vec3(p2.x.mul(cy).add(p2.z.mul(sy)), p2.y, p2.z.mul(cy).sub(p2.x.mul(sy)));
        };
        // (from the geometry's own attributes: by the time the normal is worked out, positionLocal already holds the
        // animal's place in the world)
        const [wp, wn] = wing(positionGeometry, normalGeometry);
        const m = new THREE.MeshSSSNodeMaterial({ side: THREE.DoubleSide });
        m.positionNode = tf(wp.mul(iA.w)).add(iA.xyz);
        m.normalNode = normalize(tf(wn)).transformDirection(cameraViewMatrix);

        // ---- skin, all of it in the rest pose so it moves with the animal
        const K = (h) => { const c = new THREE.Color(h); return vec3(c.r, c.g, c.b); };
        const P = positionGeometry, part = ax.x, u = ax.y, w = ax.z;
        // 1 below `lo`, 0 above `hi` (smoothstep with its edges the wrong way round is undefined in GLSL)
        const fall = (hi, lo, x) => float(1).sub(smoothstep(lo, hi, x));
        const is = (id) => fall(0.5, 0.4, abs(part.sub(id)));
        const noise = noiseTex ? (uvn) => texture(noiseTex, uvn) : () => vec4(0.5);
        const grain = noise(vec2(P.x.add(P.y), P.z.add(tint.mul(3.0))).mul(0.55)), fine = noise(vec2(P.x, P.z.add(P.y)).mul(2.6));
        // body: dark along the back, pale underneath, the way most things that fly are
        const back = mix(K('#3a3027'), K('#2b241e'), tint), flank = mix(K('#62523f'), K('#55483a'), tint), belly = K('#9d8f76');
        let body = mix(mix(belly, flank, smoothstep(-0.75, -0.05, w.add(grain.r.sub(0.5).mul(0.5)))), back, smoothstep(0.0, 0.8, w.add(grain.g.sub(0.5).mul(0.6))));
        body = body.mul(mix(0.7, 1.15, fine.r)).mul(mix(0.85, 1.1, grain.b));     // the short fur pterosaurs wore
        // the head: a dark eye in a pale ring, and bare skin toward the beak
        const eyeD = length(vec3(P.x, P.y, abs(P.z)).sub(vec3(1.06, 0.552, 0.087)));
        const eye = fall(0.032, 0.022, eyeD), ring = fall(0.066, 0.036, eyeD);
        body = mix(body, K('#a89878'), ring.mul(0.55));
        // beak: horn, pale at the root and dark at the tip, with the line of the mouth along it
        const along = saturate(P.x.sub(1.32).div(1.06));
        let beak = mix(K('#a08d68'), K('#2e231b'), smoothstep(0.25, 1.0, along)).mul(mix(0.8, 1.1, fine.g));
        beak = mix(beak, K('#b9a878'), fall(-0.25, -0.9, w).mul(0.4));
        const mouth = fall(0.075, 0.02, abs(w.add(0.22))).mul(smoothstep(0.98, 1.18, P.x)).mul(fall(0.985, 0.9, along));
        // crest: the one bright thing on the animal, streaked along its length and dark at the rim
        const streak = noise(vec2(u.mul(0.9), w.mul(2.3).add(tint))).r;
        let crest = mix(K('#6b4a35'), mix(K('#9c3620'), K('#a85420'), tint), smoothstep(0.02, 0.4, u)).mul(mix(0.6, 1.2, streak));
        crest = mix(crest, K('#211812'), smoothstep(0.55, 1.0, abs(w)).mul(smoothstep(0.2, 0.9, u)).mul(0.8));
        // arm and leg: skin over bone
        const limb = mix(K('#5a4b3c'), K('#3d332a'), smoothstep(-0.2, 0.7, w)).mul(mix(0.78, 1.12, fine.r));
        // membrane: thin skin, darker where it thickens along the arm and at the hem, faintly ribbed by
        // the fibres that stiffened it (they fan out from the arm toward the trailing edge), with veins
        const chordV = saturate(w), spanU = u;
        const fibres = sin(spanU.mul(210.0).add(chordV.mul(chordV).mul(46.0)).add(grain.r.mul(9.0))).mul(0.5).add(0.5).mul(smoothstep(0.1, 0.5, chordV));
        const veins = smoothstep(0.8, 0.96, noise(vec2(spanU.mul(1.9).add(tint), chordV.mul(0.75))).b);
        let skin = mix(mix(K('#574536'), K('#4b3b2f'), tint), K('#6c5743'), smoothstep(0.05, 0.5, chordV).mul(fall(1.0, 0.72, chordV)));
        skin = mix(skin, K('#33291f'), fall(0.2, 0.0, chordV).mul(0.8));                           // along the arm
        skin = mix(skin, K('#2b221b'), smoothstep(0.88, 1.0, chordV).mul(0.65));                         // the hem
        skin = mix(skin, K('#40342a'), fall(0.0, -1.0, w).mul(0.6));                               // the forward membrane, a little thicker
        skin = skin.mul(mix(0.94, 1.04, fibres)).mul(mix(1.0, 0.68, veins)).mul(mix(0.74, 1.16, grain.g)).mul(mix(0.9, 1.08, fine.b));
        const mMem = is(MEMBRANE), mBeak = is(BEAK), mCrest = is(CREST), mLimb = max(is(ARM), is(LEG)), mClaw = is(CLAW);
        let c = body;
        c = mix(c, beak, mBeak); c = mix(c, c.mul(0.2), mouth.mul(max(mBeak, is(BODY))));
        c = mix(c, crest, mCrest); c = mix(c, limb, mLimb); c = mix(c, K('#1c1713'), mClaw); c = mix(c, skin, mMem);
        c = mix(c, vec3(0.01, 0.008, 0.006), eye.mul(is(BODY)));
        c = c.mul(ax.w);
        m.colorNode = c;
        m.roughnessNode = mix(mix(mix(float(0.9), 0.46, mBeak), 0.66, mMem), 0.12, eye.mul(is(BODY)));
        m.metalnessNode = float(0);
        m.specularIntensity = 0.45;
        // a little light catches in the fur along the edges of the body
        m.sheenNode = vec3(0.1, 0.085, 0.065).mul(is(BODY)).mul(float(1).sub(ring));
        m.sheenRoughnessNode = float(0.6);
        // the sun comes through the membrane: warm, with the arm and the veins dark against it
        const thin = mMem.mul(smoothstep(0.04, 0.34, chordV.add(fall(0.0, -1.0, w).mul(0.2)))).mul(mix(1.0, 0.35, veins)).mul(mix(0.82, 1.0, fibres));
        m.thicknessColorNode = K('#b8602c').mul(thin).add(K('#8a3a20').mul(mCrest).mul(0.4));
        m.thicknessDistortionNode = float(0.2);
        m.thicknessAmbientNode = float(0.0);
        m.thicknessAttenuationNode = float(0.8);
        m.thicknessPowerNode = float(4.0);
        m.thicknessScaleNode = float(0.9);
        if (lit) m.lightsNode = lights(lit);
        if (glow) {
            const gc = new THREE.Color(glow.color || '#ff6a22');
            const d = positionWorld.sub(vec3(glow.x, glow.y, glow.z)), h = max(d.y, 0.0), wide = length(d.xz);
            const reach = float(1).div(float(1).add(h.mul(h).div(26 * 26))).mul(fall(glow.radius || 60, (glow.radius || 60) * 0.35, wide));
            // what faces the lake is lit by it, and the membrane lets a little through to its upper side
            const facing = saturate(normalWorld.y.negate().mul(0.9).add(0.1)).add(thin.mul(saturate(normalWorld.y)).mul(0.22));
            m.emissiveNode = vec3(gc.r, gc.g, gc.b).mul(c).mul(facing).mul(reach).mul(glow.strength || 1);
        }
        material = m;
    }
    const mesh = new THREE.Mesh(g, material); mesh.castShadow = shadows; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.name = 'pterosaurs';
    const set = (i, x, y, z, scale, yaw, bank, flap, pitch = 0, curl = 0, fold = 0, tint = 0.5) => {
        A[i * 4] = x; A[i * 4 + 1] = y; A[i * 4 + 2] = z; A[i * 4 + 3] = scale; B[i * 4] = yaw; B[i * 4 + 1] = bank; B[i * 4 + 2] = flap; B[i * 4 + 3] = pitch; C[i * 4] = curl; C[i * 4 + 1] = fold; C[i * 4 + 2] = tint;
    };
    const commit = () => { aA.needsUpdate = true; aB.needsUpdate = true; aC.needsUpdate = true; };
    return { mesh, set, commit, count, tris: pgeo.userData.tris };
}

// The wing stroke as the three numbers a flock takes: `phase` in radians, `power` 0 (gliding) to 1 (hard flapping).
// The downstroke is the quick half; the tip lags the stroke; the hand folds back on the way up.
export function wingStroke(phase, power, out = {}) {
    const ph = phase + 0.35 * Math.sin(phase);
    const sn = Math.sin(ph), cs = Math.cos(ph);
    out.flap = 0.1 + 0.05 * (1 - power) + power * (0.62 * sn + 0.06);
    out.curl = 0.022 * (1 - power) - power * 0.2 * cs;
    out.fold = 0.05 + power * 0.42 * Math.max(0, cs);
    return out;
}
