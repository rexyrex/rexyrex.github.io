// Pterosaurs. A Pteranodon built from its measurements rather than sculpted: the
// body, neck and head are one skin lofted along the spine; the crest is a blade
// lofted the same way; the wing is the arm (upper arm, forearm, the long wing
// metacarpal and the four bones of the wing finger) with a membrane stretched
// from it back to the ankle and a smaller one forward to the neck. Each animal
// is one instance; its flight is a handful of numbers written by the caller.
//
// The membrane is skin, not card. Its mesh follows the stiffening fibres that
// fan out from the arm toward the trailing edge, so the cloth billows between
// them and the edge is drawn into a shallow scallop where each bundle ends. It
// is shaded from both sides: what is seen is the light that falls on the near
// face plus the light that falls on the far face and comes through, coloured
// by how thick the skin is there, with the fibres and the blood vessels dark
// against it. Lit from the front it is leather; lit from behind it glows.
//
// Model space: +x forward (beak), +y up, +z the animal's right. Metres; the
// half span is about 3.9 m at scale 1.
import * as THREE from 'three/webgpu';
import {
    attribute, texture, uniform, varying, vec2, vec3, vec4, float, mix, max, min, abs, sign, normalize, pow, sin, cos, length, dot, cross, select, saturate, clamp, floor,
    dFdx, dFdy, fwidth, reflect, faceDirection,
    positionGeometry, normalGeometry, positionWorld, positionView, positionViewDirection, normalView, normalWorld, cameraPosition, cameraViewMatrix, lights,
} from 'three/tsl';
import { smoothstep } from './tsl.js';
import { catmull, clamp as cl, lerp } from './noise.js';

// where the wing hinges, and where the hand begins (the fold of the outer wing)
const Z0 = 0.17, YS = 0.1, ZW = 1.42;
// the span of one wing, and how far apart the bundles of fibres leave the arm (thirteen panels to a wing)
const TIP = 3.92, ROOT = 0.06, ARC = (TIP - ROOT) / 13;

// parts, for the material: aux = (part, u, v, shade)
const BODY = 0, MEMBRANE = 1, ARM = 2, CREST = 4, LEG = 5, CLAW = 6;

function pterosaurGeometry(detail = 1) {
    const pos = [], aux = [], web = [], idx = [];
    // web = (lift, tilt, fibre, chord): how far the stroke moves this point of the membrane and how it tips it,
    // where along the arm its fibre begins (metres), and the wing's chord there
    const v = (x, y, z, part, u, w, shade = 1, lift = 0, tilt = 0, fibre = 0, chord = 0) => { pos.push(x, y, z); aux.push(part, u, w, shade); web.push(lift, tilt, fibre, chord); return pos.length / 3 - 1; };
    const quad = (a, b, c, d, flip) => { if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); };
    // join two rings of the same size
    const band = (r0, r1, flip) => { const n = r0.length; for (let k = 0; k < n; k++) quad(r0[k], r0[(k + 1) % n], r1[k], r1[(k + 1) % n], flip); };
    const N = (n) => Math.max(3, Math.round(n * detail));
    const ease = (t) => { t = cl(t, 0, 1); return t * t * (3 - 2 * t); };

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
            // (the whole skin is one part: where the horn of the beak begins is painted, so nothing is blended across it)
            const u = (q[0] + 0.9) / 3.28, horn = ease((q[0] - 1.2) / 0.16), ring = [];
            for (let k = 0; k < SIDES; k++) {
                const a = (k / SIDES) * 6.2832, c = Math.cos(a), s = Math.sin(a);
                // a ridge along the top of the beak and a keel under it: the section is pinched top and bottom
                const pinch = Math.pow(Math.abs(s), lerp(1, 0.75, horn)) * Math.sign(s);
                const up = c * (c > 0 ? q[2] : q[3]);
                ring.push(v(q[0] - ty * up, q[1] + tx * up, pinch * q[4], BODY, u, c, 1));
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
    const ARM_R = [0.075, 0.05, 0.04, 0.033, 0.027, 0.02, 0.013, 0.005];
    const boneAt = (z, out) => { let j = 0; while (j < ARM_J.length - 2 && ARM_J[j + 1][2] < z) j++; const a = ARM_J[j], b = ARM_J[j + 1], t = cl((z - a[2]) / (b[2] - a[2]), 0, 1); out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); return out; };
    // the trailing edge: from the ankle out to the tip, hollowed the way a taut membrane is  [z, x, y]
    const TRAIL = [[0.06, -0.8, 0.0], [0.3, -1.18, -0.035], [0.62, -0.84, -0.005], [1.0, -0.56, 0.02], [1.5, -0.35, 0.04], [2.0, -0.26, 0.05], [2.6, -0.33, 0.05], [3.2, -0.53, 0.047], [3.7, -0.74, 0.045], [3.92, -0.8, 0.045]];
    // the forward membrane's edge: neck to wrist, held taut by the pteroid bone
    const LEAD = [[0.06, 0.4, 0.1], [0.4, 0.5, 0.115], [0.8, 0.585, 0.135], [1.15, 0.63, 0.15], [1.42, 0.62, 0.15]];
    const curveAt = (C, z, out) => { let j = 0; while (j < C.length - 2 && C[j + 1][0] < z) j++; const t = j + cl((z - C[j][0]) / (C[j + 1][0] - C[j][0]), 0, 1); catmull(C, t, out); return out; };
    const b = [0, 0], tr = [0, 0, 0], le = [0, 0, 0];
    const chordAt = (z) => { boneAt(Math.max(z, 0.16), b); curveAt(TRAIL, z, tr); return b[0] - tr[1]; };
    // The fibres leave the arm and run back and outward. `g` is where one leaves the arm (its span there); this is
    // how far out it has got by the time it is `u` of the way across the chord. (Near the body there are none,
    // and the skin simply runs straight back.)
    const sweepOf = (g) => 0.55 * ease((g - 0.15) / 0.9);
    const spanOf = (g, u) => {
        const s = sweepOf(g) * u; if (s < 1e-5) return g;
        let lo = g, hi = TIP;
        for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (mid - g - s * chordAt(mid) < 0) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
    };
    // stations along the arm: so many to a panel, and one at every joint so the skin keeps to the bone
    const GS = [];
    {
        const per = detail >= 1.2 ? 4 : detail >= 1 ? 3 : 2, step = ARC / per, joints = [0.17, 0.3, 0.66, 1.42, 2.02, 2.72, 3.28, 3.68];
        for (let i = 0; i <= 13 * per; i++) { const g = ROOT + i * step; if (!joints.some((j) => Math.abs(j - g) < step * 0.3)) GS.push(g); }
        for (const j of joints) GS.push(j);
        GS.sort((p, q) => p - q); GS[GS.length - 1] = TIP;
    }
    const side = (sg) => {
        // (a membrane's front face is its top, on either wing)
        const top = sg > 0, P = (p) => [p[0], p[1], p[2] * sg];
        // the main membrane, arm to trailing edge: each row of the mesh is a fibre
        const CH = N(10), rows = [];
        for (const g of GS) {
            // where in its panel this fibre is: 0 at a bundle, where the edge is held back; between them the skin
            // lifts and the edge is drawn in
            const ph = (g - ROOT) / ARC, fr = Math.sin(Math.PI * (ph - Math.floor(ph + 1e-6))), slack = ease((g - 0.35) / 0.6), row = [];
            for (let c = 0; c <= CH; c++) {
                const u = c / CH, z = spanOf(g, u);
                boneAt(Math.max(z, 0.16), b); curveAt(TRAIL, z, tr);
                const chord = b[0] - tr[1], f = (z - ROOT) / (TIP - ROOT);
                // it bellies upward under load, most just behind the arm
                const B = Math.sin(Math.PI * Math.pow(u, 0.62)), dB = u > 0.02 ? Math.PI * 0.62 * Math.pow(u, -0.38) * Math.cos(Math.PI * Math.pow(u, 0.62)) : 0;
                const belly = B * chord * 0.06 * (1 - 0.5 * f) + fr * fr * slack * 0.02 * chord * Math.pow(u, 1.5);
                const scallop = fr * slack * 0.04 * chord * u * u * u;
                // (and near the body it does not answer the stroke: it is fast to the flank and the leg)
                const free = ease((z - 0.2) / 0.8);
                row.push(v(lerp(b[0], tr[1], u) + scallop, lerp(b[1], tr[2], u) + belly, z * sg, MEMBRANE, f, u, 0.72 + 0.28 * Math.min(1, z / 0.7),
                    chord * (0.1 * u * u + 0.05 * B) * free, (0.2 * u + 0.05 * dB) * free, g, chord));
            }
            rows.push(row);
        }
        for (let i = 0; i < rows.length - 1; i++) for (let c = 0; c < CH; c++) quad(rows[i][c], rows[i + 1][c], rows[i][c + 1], rows[i + 1][c + 1], top);
        // the forward membrane, from the edge back to the arm
        const CF = N(4), front = [];
        for (const z of GS) {
            if (z > 1.421) break;
            boneAt(Math.max(z, 0.16), b); curveAt(LEAD, z, le);
            const row = []; for (let c = 0; c <= CF; c++) { const u = c / CF; row.push(v(lerp(le[1], b[0], u), lerp(le[2], b[1], u) + Math.sin(Math.PI * u) * 0.012, z * sg, MEMBRANE, (z - ROOT) / (TIP - ROOT), -1 + u, 0.8 + 0.2 * Math.min(1, z / 0.7), 0, 0, z, b[0] - le[1])); }
            front.push(row);
        }
        for (let i = 0; i < front.length - 1; i++) for (let c = 0; c < CF; c++) quad(front[i][c], front[i + 1][c], front[i][c + 1], front[i + 1][c + 1], top);
        // the arm and the wing finger
        { const [pts, radii] = chain(ARM_J, ARM_R, 0.42, N(5)); tube(pts.map(P), radii, N(10), ARM); }
        // the muscle of the upper arm and forearm
        tube([[0.3, 0.1, 0.1], [0.27, 0.115, 0.3], [0.23, 0.13, 0.52], [0.24, 0.135, 0.7], [0.4, 0.145, 1.0], [0.6, 0.15, 1.38]].map(P), [0.12, 0.105, 0.075, 0.062, 0.05, 0.036], N(11), ARM);
        // the pteroid: the small bone that points in from the wrist and holds the forward membrane taut
        tube([[0.635, 0.152, 1.4], [0.64, 0.153, 1.2], [0.62, 0.148, 1.02], [0.595, 0.142, 0.9]].map(P), [0.016, 0.013, 0.009, 0.003], N(5), ARM);
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
    g.setAttribute('web', new THREE.BufferAttribute(new Float32Array(web), 4));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    g.computeVertexNormals();
    // a membrane has one normal, its upper one; whichever face is looked at turns it to the eye
    { const n = g.attributes.normal, A = g.attributes.aux; for (let i = 0; i < n.count; i++) if (A.getX(i) === MEMBRANE && n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
    g.userData.tris = idx.length / 3;
    return g;
}

// A set of instanced pterosaurs whose places are written by the caller each frame.
//   set(i, x, y, z, scale, yaw, bank, flap, pitch, curl, fold, tint)
//   flap  the wing's angle at the shoulder, radians, up positive
//   curl  how much further the wing bends toward the tip, radians per metre (the tip lags the stroke)
//   fold  the outer wing swung back about the wrist, radians (the upstroke, a stoop)
//   detail  1 and over: every fibre, vessel and grain of the skin. Under 1 (the small tiers): the same animal
//           with fewer triangles and a shader that keeps what shows from far off
//   lights  the lights this flock answers to (default: all of the scene's)
//   glow    { x, y, z, color, strength }: light from a wide bright surface below, such as a lake of lava. A point
//           light standing in for one burns anything that flies close to it; this falls off the way a broad
//           source does, and lights only what faces down
export function createFlock(count, { shadows = false, noiseTex = null, detail = 1, lights: lit = null, glow = null } = {}) {
    const key = 'geo' + detail, rich = detail >= 1;
    const pgeo = createFlock[key] || (createFlock[key] = pterosaurGeometry(detail));
    const A = new Float32Array(count * 4), B = new Float32Array(count * 4), C = new Float32Array(count * 4);
    const g = new THREE.InstancedBufferGeometry();
    g.index = pgeo.index; for (const k of Object.keys(pgeo.attributes)) g.setAttribute(k, pgeo.attributes[k]);
    const aA = new THREE.InstancedBufferAttribute(A, 4), aB = new THREE.InstancedBufferAttribute(B, 4), aC = new THREE.InstancedBufferAttribute(C, 4);
    aA.setUsage(THREE.DynamicDrawUsage); aB.setUsage(THREE.DynamicDrawUsage); aC.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', aA); g.setAttribute('iB', aB); g.setAttribute('iC', aC); g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    // what the open sky sheds on a level surface (read from the scene's own sky light the first time this is drawn)
    const uSky = uniform(new THREE.Color(0.3, 0.42, 0.62));
    // (a material is made for each flock and never kept between worlds: it holds this world's lights and textures)
    let material;
    {
        const iA = attribute('iA', 'vec4'), iB = attribute('iB', 'vec4'), iC = attribute('iC', 'vec4'), ax = attribute('aux', 'vec4'), wb = attribute('web', 'vec4');
        const yaw = iB.x, bank = iB.y, flap = iB.z, pitch = iB.w, curl = iC.x, fold = iC.y, tint = iC.z;
        // The wing: the skin answers the stroke; then the hand swings back about the wrist, then the whole of it
        // bends along an arc from the shoulder. An arc keeps every bone its own length, which scaling the tip
        // upward does not.
        const wing = (p, n) => {
            const sg = sign(p.z), az = abs(p.z);
            // Pressed from below on the downstroke (when the tip lags upward) the membrane fills and its trailing
            // edge is left behind, higher; on the upstroke it empties and hangs
            const load = clamp(curl.mul(10.0), -1.0, 1.5);
            const py = p.y.add(wb.x.mul(load)), nx = n.x.add(n.y.mul(wb.y).mul(load));
            const hand = max(az.sub(ZW), 0.0);
            const azF = az.sub(hand.mul(float(1).sub(cos(fold)))), xF = p.x.sub(hand.mul(sin(fold)));
            const s = max(azF.sub(Z0), 0.0);
            const k = curl.add(select(curl.greaterThanEqual(0.0), float(1e-3), float(-1e-3)));
            const phi = flap.add(k.mul(s));
            const out = sin(phi).sub(sin(flap)).div(k), up = cos(flap).sub(cos(phi)).div(k);
            const turn = phi.mul(smoothstep(0.0, 0.16, s)), ct = cos(turn), st = sin(turn);
            const yr = py.sub(YS), nz = n.z.mul(sg);
            return [
                vec3(xF, float(YS).add(up).add(yr.mul(ct)), sg.mul(min(azF, Z0).add(out).sub(yr.mul(st)))),
                vec3(nx, n.y.mul(ct).add(nz.mul(st)), nz.mul(ct).sub(n.y.mul(st)).mul(sg)),
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
        const m = new THREE.MeshPhysicalNodeMaterial({ side: THREE.DoubleSide });
        m.positionNode = tf(wp.mul(iA.w)).add(iA.xyz);

        // ---- skin, all of it in the rest pose so it moves with the animal
        const K = (h) => { const c = new THREE.Color(h); return vec3(c.r, c.g, c.b); };
        const P = positionGeometry, part = ax.x, u = ax.y, w = ax.z, TAU = 6.2832;
        // 1 below `lo`, 0 above `hi` (smoothstep with its edges the wrong way round is undefined in GLSL)
        const fall = (hi, lo, x) => float(1).sub(smoothstep(lo, hi, x));
        const is = (id) => fall(0.5, 0.4, abs(part.sub(id)));
        const noise = noiseTex ? (uvn) => texture(noiseTex, uvn) : () => vec4(0.5);
        const grain = noise(vec2(P.x.add(P.y), P.z.add(tint.mul(3.0))).mul(0.55));
        const fine = rich ? noise(vec2(P.x, P.z.add(P.y)).mul(2.6)) : grain.gbra;
        const mMem = is(MEMBRANE), mCrest = is(CREST), mLimb = max(is(ARM), is(LEG)), mClaw = is(CLAW), mBody = is(BODY);

        // ---- body: dark along the back, pale underneath, the way most things that fly are
        const back = mix(K('#35373b'), K('#292a2d'), tint), flank = mix(K('#77736c'), K('#68645e'), tint), belly = K('#d8d0c0');
        const round = w.add(grain.g.sub(0.5).mul(0.5));
        let body = mix(mix(belly, flank, smoothstep(-0.72, -0.1, round)), back, smoothstep(0.02, 0.7, round));
        body = mix(body, back, smoothstep(0.55, 0.8, fine.a).mul(smoothstep(-0.5, 0.0, round)).mul(fall(0.6, 0.1, round)).mul(0.55));    // flecked where the back meets the flank
        // the head: a dark cap, a pale face, a dark line through the eye
        const head = smoothstep(0.84, 0.98, P.x);
        body = mix(body, K('#dcd2bc'), head.mul(fall(0.55, 0.1, round)).mul(0.85));
        const eyeD = length(vec3(P.x, P.y, abs(P.z)).sub(vec3(1.06, 0.552, 0.087)));
        const stripe = fall(0.05, 0.02, abs(P.y.sub(0.556).add(P.x.sub(1.06).mul(0.16)))).mul(smoothstep(0.9, 0.99, P.x)).mul(fall(1.3, 1.16, P.x));
        body = mix(body, K('#26211d'), stripe.mul(0.9));
        body = body.mul(mix(0.72, 1.15, fine.r)).mul(mix(0.86, 1.1, grain.b));     // the short fur pterosaurs wore
        // the eye: bare yellow skin round a dark lid, an amber iris, the pupil
        const bare = fall(0.07, 0.036, eyeD), lid = fall(0.039, 0.031, eyeD), iris = fall(0.03, 0.026, eyeD), pupil = fall(0.02, 0.015, eyeD);
        body = mix(body, K('#c9ad6a'), bare.mul(0.6));
        body = mix(body, K('#17120e'), lid);
        body = mix(body, mix(K('#b87a22'), K('#5a2e0c'), smoothstep(0.018, 0.029, eyeD)), iris);
        body = mix(body, vec3(0.006, 0.005, 0.004), pupil);
        // beak: horn, yellow at the root and dark at the tip, a dark ridge along the top, the lower jaw paler
        const horn = smoothstep(1.2, 1.36, P.x).mul(float(1).sub(bare)), along = saturate(P.x.sub(1.25).div(1.13));
        let beak = mix(mix(K('#d0a548'), K('#94794a'), smoothstep(0.0, 0.4, along)), K('#2b211a'), smoothstep(0.45, 1.0, along));
        beak = mix(beak, K('#dcc691'), fall(-0.3, -0.9, w).mul(0.5).mul(fall(0.95, 0.5, along)));
        beak = mix(beak, K('#3a2c21'), smoothstep(0.72, 1.0, w).mul(0.55));
        beak = beak.mul(mix(0.84, 1.08, fine.g)).mul(sin(P.x.mul(140.0).add(w.mul(3.0))).mul(0.04).add(1.0));
        body = mix(body, beak, horn);
        // (the line of the mouth, from under the eye to the tip)
        const mouth = fall(0.07, 0.02, abs(w.add(0.22))).mul(smoothstep(1.0, 1.16, P.x)).mul(fall(0.985, 0.9, along));
        body = mix(body, body.mul(0.18), mouth);

        // ---- crest: the one bright thing on the animal, streaked along its length and dark at the rim
        const streak = rich ? noise(vec2(u.mul(0.9), w.mul(2.3).add(tint))).r : sin(w.mul(17.0).add(sin(u.mul(7.0)).mul(1.5))).mul(0.2).add(0.5);
        let crest = mix(K('#a8301a'), K('#d07a1e'), fall(0.1, -0.9, w).mul(mix(0.5, 1.0, tint)));           // red, running to orange at its upper edge
        crest = mix(K('#4a3528'), crest, smoothstep(0.0, 0.3, u)).mul(mix(0.5, 1.3, streak)).mul(sin(w.mul(26.0).add(sin(u.mul(8.0)).mul(2.0))).mul(0.1).add(0.95));
        crest = mix(crest, K('#1d1512'), max(smoothstep(0.62, 1.0, w).mul(smoothstep(0.15, 0.6, u)), smoothstep(0.78, 1.0, u)).mul(0.85));

        // ---- arm and leg: skin over bone, pale where it faces down
        const limb = mix(K('#8a7f72'), K('#5f5e5c'), smoothstep(-0.4, 0.55, w)).mul(mix(0.78, 1.12, fine.r));

        // ---- membrane
        const chordV = saturate(w), gF = wb.z, span = saturate(abs(P.z).div(TIP));
        const fore = smoothstep(0.0, 0.08, w.negate());                         // the forward membrane, a little thicker
        const under = faceDirection.mul(-0.5).add(0.5);                         // its lower face is the one being looked at
        // The fibres that stiffen it. From far off they are streaks of paler and darker skin along their run (a
        // sheet of noise drawn out along them); close to, each is a fine ridge. Three trains of ridges that never
        // fall into step, so no two neighbours are alike, and only where a ridge is wider than a pixel
        const fibrous = smoothstep(0.03, 0.22, chordV).mul(smoothstep(0.2, 0.75, gF)).mul(float(1).sub(fore));
        const lay = rich ? noise(vec2(gF.mul(2.3).add(tint.mul(5.0)), chordV.mul(0.13).add(gF.mul(0.05)))) : grain;
        const grainLay = mix(float(0.5), lay.g.mul(0.65).add(lay.r.mul(0.35)), fibrous);
        let ridge = float(0), see = float(0);
        if (rich) {
            const ph = gF.mul(TAU * 44).add(sin(chordV.mul(5.0).add(gF.mul(2.1))).mul(1.3)).add(grain.r.mul(5.0));
            see = fall(2.2, 0.9, fwidth(ph).mul(1.62)).mul(fibrous).mul(sin(gF.mul(3.1).add(chordV.mul(2.0)).add(tint.mul(9.0))).mul(0.3).add(0.7));
            ridge = sin(ph).add(sin(ph.mul(1.618).add(1.3)).mul(0.6)).add(sin(ph.mul(0.382).add(0.7)).mul(0.5)).mul(0.24).add(0.5);
        }
        // and the bundles themselves, one to each point of the hem: thicker skin, a faint ray from arm to edge
        // (no two alike: some are plain, some barely there)
        const rq = gF.sub(ROOT).div(ARC).add(0.5), ray = abs(rq.fract().sub(0.5)).mul(ARC), rpx = fwidth(gF).add(2e-3);
        const bundle = saturate(float(0.009).sub(ray).div(rpx).add(0.5)).mul(saturate(float(0.03).div(rpx))).mul(smoothstep(0.1, 0.45, chordV)).mul(smoothstep(0.5, 0.9, gF)).mul(float(1).sub(fore))
            .mul(sin(floor(rq).mul(2.7).add(tint.mul(9.0))).mul(0.42).add(0.55));
        // Blood vessels: a trunk leaves the arm in each stretch of wing and wanders back across the fibres,
        // thinning; two branches part from it. (lines of a set width, softened by the size of a pixel)
        const px = fwidth(gF).add(1.5e-3);
        const wander = sin(P.x.mul(3.1).add(abs(P.z).mul(1.7)).add(tint.mul(20.0))).mul(0.16).add(sin(abs(P.z).mul(4.3).sub(P.x.mul(2.2)).add(1.3)).mul(0.09)).add(sin(P.x.mul(9.7).add(abs(P.z).mul(6.1))).mul(0.035));
        const vessels = (period, wide, seed) => {
            const q = gF.div(period).add(wander), k = floor(q), x = q.sub(k).sub(0.5), kk = k.mul(seed).add(tint.mul(40.0));
            const trunk = (v) => sin(v.mul(4.2).add(kk.mul(2.4))).mul(0.14).add(sin(v.mul(13.0).add(kk.mul(4.1))).mul(0.025)).add(v.sub(0.4).mul(sin(kk.mul(3.7))).mul(0.2));
            const line = (at, half) => saturate(half.sub(abs(x.sub(at)).mul(period)).div(px).add(0.5)).mul(saturate(half.mul(2.0).div(px)));
            const uA = sin(kk.mul(5.3)).mul(0.07).add(0.2), uB = sin(kk.mul(7.1)).mul(0.08).add(0.42);
            const tA = saturate(chordV.sub(uA).div(0.5)), tB = saturate(chordV.sub(uB).div(0.45));
            const main = line(trunk(chordV), mix(float(wide), float(wide * 0.22), chordV)).mul(fall(0.92, 0.7, chordV));
            const a = line(trunk(uA).add(pow(tA, 0.8).mul(0.3)), mix(float(wide * 0.5), float(wide * 0.1), tA)).mul(smoothstep(0.0, 0.03, tA)).mul(fall(1.0, 0.75, tA));
            const b = line(trunk(uB).sub(pow(tB, 0.8).mul(0.26)), mix(float(wide * 0.42), float(wide * 0.1), tB)).mul(smoothstep(0.0, 0.03, tB)).mul(fall(1.0, 0.75, tB));
            return max(main, max(a, b));
        };
        let vein = vessels(0.74, 0.015, 1.0);
        if (rich) vein = max(vein, vessels(0.29, 0.0045, 2.3).mul(smoothstep(0.18, 0.4, chordV)).mul(0.7));
        vein = vein.mul(smoothstep(0.02, 0.09, chordV)).mul(float(1).sub(fore));
        // how thick the skin is: muscle and tendon behind the arm, flesh near the body, a cord in the hem
        const thick = max(max(fall(0.3, 0.02, chordV).add(fall(0.9, 0.3, chordV).mul(0.22)), fall(0.9, 0.2, gF).mul(0.85)), max(smoothstep(0.92, 1.0, chordV).mul(0.8), fore.mul(mix(0.82, 1.0, fall(-0.8, -1.0, w)))));
        const tipDark = smoothstep(0.5, 1.0, span);
        const mottle = mix(0.74, 1.18, grain.g).mul(mix(0.9, 1.08, fine.b)).mul(mix(0.76, 1.22, grainLay)).mul(bundle.mul(-0.12).add(1.0));
        // above: leather, darker along the arm, at the hem and toward the tip (a warm grey, and no darker: seen
        // from the crater's rim it is this side that has to stand off the dark red wall behind it)
        let above = mix(K('#6f685d'), K('#5f5a52'), tint);
        above = mix(above, K('#8f8778'), smoothstep(0.1, 0.5, chordV).mul(fall(1.0, 0.7, chordV)).mul(0.6));
        above = mix(above, K('#46423b'), smoothstep(0.5, 0.75, grain.r).mul(0.5));                          // clouded, the way hide is
        above = mix(above, K('#2c2a27'), tipDark.mul(0.7));
        above = mix(above, K('#34312c'), max(fall(0.2, 0.0, chordV), smoothstep(0.9, 1.0, chordV)).mul(0.7));
        above = mix(above, K('#3d3a34'), fore.mul(0.6));
        // below: paler, the colour of the flank it joins
        let below = mix(K('#85735f'), K('#766757'), tint);
        below = mix(below, K('#4a3d33'), tipDark.mul(0.7));
        below = mix(below, K('#5a4a3d'), smoothstep(0.92, 1.0, chordV).mul(0.6));
        below = mix(below, K('#927d66'), fall(0.16, 0.0, chordV).mul(0.4));
        let skin = mix(above, below, under).mul(mottle);
        skin = skin.mul(mix(1.0, ridge.mul(0.14).add(0.93), see));
        skin = skin.mul(float(1).sub(vein.mul(mix(0.16, 0.3, under))));
        // what comes through it: thin skin lets the light through gold, thick skin a little of it and red; the
        // fibres, the vessels and the pigment of the tip hold it back
        let through = mix(vec3(0.66, 0.34, 0.185), vec3(0.075, 0.01, 0.003), saturate(thick));
        through = through.mul(mix(0.5, 1.28, grainLay)).mul(bundle.mul(-0.4).add(1.0)).mul(mix(1.0, ridge.mul(-0.3).add(1.15), see));
        through = through.mul(mix(vec3(1.0), vec3(0.34, 0.07, 0.03), vein)).mul(mix(1.0, 0.35, tipDark)).mul(mix(0.8, 1.12, grain.g));
        through = through.mul(mMem).add(K('#b0421c').mul(mCrest).mul(0.3)).mul(ax.w);

        let c = body;
        c = mix(c, crest, mCrest); c = mix(c, limb, mLimb); c = mix(c, K('#1c1713'), mClaw); c = mix(c, skin, mMem);
        c = c.mul(ax.w);
        m.colorNode = c;
        const eyeShine = iris.mul(mBody);
        m.roughnessNode = mix(mix(mix(mix(mix(float(0.88), 0.4, horn.mul(mBody)), 0.5, mCrest), 0.4, mClaw), mix(float(0.58), 0.62, under).add(grainLay.sub(0.5).mul(0.16)), mMem), 0.06, eyeShine);
        m.metalnessNode = float(0);
        m.specularIntensityNode = mix(float(0.5), 0.28, mMem);
        if (rich) {
            // a little light catches in the fur along the edges of the body, and on the bloom of the skin
            m.sheenNode = vec3(0.1, 0.085, 0.065).mul(mBody).mul(float(1).sub(bare)).mul(float(1).sub(horn)).add(vec3(0.014, 0.015, 0.017).mul(mMem));
            m.sheenRoughnessNode = float(0.6);
        }

        // ---- the normal: the upper one for a membrane, turned to whichever face is seen, and ridged by its fibres
        let nV = normalize(varying(normalize(tf(wn)))).mul(faceDirection).transformDirection(cameraViewMatrix);
        if (rich) {
            // (a height that exists only as a formula of the wing's own coordinates: see reliefNormal in fx.js)
            // (`see` fades the ridges by their size on the screen: it scales the slope, and is kept out of the height)
            const h = ridge.mul(0.0006).mul(mMem).mul(iA.w);
            const dpdx = dFdx(positionView), dpdy = dFdy(positionView), r1 = cross(dpdy, nV), r2 = cross(nV, dpdx), det = dot(dpdx, r1);
            nV = normalize(nV.mul(abs(det).add(1e-9)).sub(sign(det).mul(dFdx(h).mul(r1).add(dFdy(h).mul(r2))).mul(see)));
        }
        m.normalNode = nV;

        // ---- light that falls on the far face of thin skin and comes through it. Every lamp gets the term: it is
        // strongest where the far face is square to the light, and stronger again looking up the beam
        {
            const model = m.setupLightingModel.bind(m);
            m.setupLightingModel = (builder) => {
                const lm = model(builder), direct = lm.direct.bind(lm);
                lm.direct = (input, b) => {
                    const { lightDirection, lightColor, reflectedLight } = input;
                    const far = saturate(dot(normalView, lightDirection).mul(-0.95).add(0.05));
                    const beam = pow(saturate(dot(positionViewDirection, lightDirection).negate()), 6.0);
                    reflectedLight.directDiffuse.addAssign(lightColor.mul(through).mul(far.mul(beam.mul(2.4).add(1.0)).mul(1 / Math.PI)));
                    direct(input, b);
                };
                return lm;
            };
        }
        if (lit) m.lightsNode = lights(lit);
        // and the sky does the same for a wing seen from below
        let shine = through.mul(uSky).mul(saturate(normalWorld.y.negate())).mul(0.6 / Math.PI);
        if (glow) {
            const gc = new THREE.Color(glow.color || '#ff6a22');
            const d = positionWorld.sub(vec3(glow.x, glow.y, glow.z)), ht = max(d.y, 0.0), wide = length(d.xz);
            const reach = float(1).div(float(1).add(ht.mul(ht).div(26 * 26))).mul(fall(glow.radius || 60, (glow.radius || 60) * 0.35, wide));
            // what faces the lake is lit by it; the membrane lets it through to its upper side; and skin seen at a
            // glancing angle mirrors it, which draws a bright line along the underside of everything
            const facing = saturate(normalWorld.y.negate().mul(0.9).add(0.1)), farFacing = saturate(normalWorld.y.mul(0.9).add(0.1));
            const eye = normalize(cameraPosition.sub(positionWorld)), bounce = reflect(eye.negate(), normalWorld);
            const glance = pow(float(1).sub(saturate(dot(normalWorld, eye))), 4.0).mul(0.5).add(0.03);
            const mirror = saturate(bounce.y.negate().mul(1.5)).mul(glance);
            shine = shine.add(vec3(gc.r, gc.g, gc.b).mul(reach).mul(glow.strength || 1).mul(c.mul(facing).add(through.mul(farFacing).mul(0.34)).add(mirror)));
        }
        m.emissiveNode = shine;
        material = m;
    }
    const mesh = new THREE.Mesh(g, material); mesh.castShadow = shadows; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.name = 'pterosaurs';
    {
        const read = (l) => { if (l && l.isHemisphereLight) { uSky.value.copy(l.color).multiplyScalar(l.intensity); return true; } return false; };
        let known = !!(lit && lit.some(read));
        mesh.onBeforeRender = (renderer, scene) => { if (known) return; known = true; scene.traverse(read); };
    }
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
