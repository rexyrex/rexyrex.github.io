// Sky, sun, haze and clouds.
//
// The sky is computed once, on the CPU, by marching sunlight through a model
// atmosphere (Rayleigh + Mie + ozone, single scattering plus an isotropic
// multiple-scattering term). The result is a small HDR table that three things
// read: the sky dome, the distance haze, and the image-based ambient light. One
// source, so the horizon, the haze in front of it and the light on the ground
// always agree.
import * as THREE from 'three/webgpu';
import {
    Fn, uniform, texture, vec2, vec3, vec4, float, normalize, max, min, sqrt, exp, pow, dot, mix, clamp, abs, atan, length,
    positionWorld, cameraPosition, modelViewProjection, fog, saturate, select, step,
} from 'three/tsl';
import { smoothstep, time } from './tsl.js';
import { dataTexture } from './textures.js';

const KM = 1000;
const RG = 6360, RT = 6430;                     // planet and atmosphere radii, km
const BETA_R = [5.802e-3, 13.558e-3, 33.1e-3];  // per km
const BETA_M = 3.996e-3, BETA_M_EXT = 4.44e-3;
const BETA_O = [0.650e-3, 1.881e-3, 0.085e-3];
const HR = 8, HM = 1.2;
const G = 0.76;

function raySphere(ox, oy, oz, dx, dy, dz, r) {
    const b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    const t1 = -b + s;
    return t1;
}
function rayGround(ox, oy, oz, dx, dy, dz) {
    const b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - RG * RG;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : -1;
}

// optical depth (rayleigh, mie, ozone) from a point toward a direction, to the top of the atmosphere
const _od = [0, 0, 0];
function opticalDepth(px, py, pz, dx, dy, dz, steps) {
    const tmax = raySphere(px, py, pz, dx, dy, dz, RT);
    const ds = tmax / steps;
    let r = 0, m = 0, o = 0;
    for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) * ds;
        const x = px + dx * t, y = py + dy * t, z = pz + dz * t;
        const h = Math.sqrt(x * x + y * y + z * z) - RG;
        r += Math.exp(-h / HR) * ds; m += Math.exp(-h / HM) * ds;
        o += Math.max(0, 1 - Math.abs(h - 25) / 15) * ds;
    }
    _od[0] = r; _od[1] = m; _od[2] = o;
    return _od;
}

export function createSkyModel({ sunDir, altitude = 120, turbidity = 1.6, strength = 20 }) {
    const sx = sunDir.x, sy = sunDir.y, sz = sunDir.z;
    const cy = RG + altitude / KM;
    const bm = BETA_M * turbidity, bme = BETA_M_EXT * turbidity;

    // radiance from direction (dx,dy,dz); `disc` false leaves the sun itself out
    const radiance = (dx, dy, dz, out) => {
        const tg = rayGround(0, cy, 0, dx, dy, dz);
        const tmax = tg > 0 ? tg : raySphere(0, cy, 0, dx, dy, dz, RT);
        const N = 32;
        // more samples near the eye, where density is highest
        let odR = 0, odM = 0, odO = 0, tPrev = 0;
        let r0 = 0, r1 = 0, r2 = 0, m0 = 0, m1 = 0, m2 = 0;
        for (let i = 0; i < N; i++) {
            const u = (i + 1) / N, t = tmax * u * u;
            const ds = t - tPrev, tm = (t + tPrev) * 0.5; tPrev = t;
            const x = dx * tm, y = cy + dy * tm, z = dz * tm;
            const h = Math.max(0, Math.sqrt(x * x + y * y + z * z) - RG);
            const dR = Math.exp(-h / HR) * ds, dM = Math.exp(-h / HM) * ds, dO = Math.max(0, 1 - Math.abs(h - 25) / 15) * ds;
            odR += dR * 0.5; odM += dM * 0.5; odO += dO * 0.5;
            if (rayGround(x, y, z, sx, sy, sz) < 0) {
                const l = opticalDepth(x, y, z, sx, sy, sz, 8);
                const a0 = Math.exp(-(BETA_R[0] * (odR + l[0]) + bme * (odM + l[1]) + BETA_O[0] * (odO + l[2])));
                const a1 = Math.exp(-(BETA_R[1] * (odR + l[0]) + bme * (odM + l[1]) + BETA_O[1] * (odO + l[2])));
                const a2 = Math.exp(-(BETA_R[2] * (odR + l[0]) + bme * (odM + l[1]) + BETA_O[2] * (odO + l[2])));
                r0 += a0 * dR; r1 += a1 * dR; r2 += a2 * dR;
                m0 += a0 * dM; m1 += a1 * dM; m2 += a2 * dM;
            }
            odR += dR * 0.5; odM += dM * 0.5; odO += dO * 0.5;
        }
        const mu = dx * sx + dy * sy + dz * sz;
        const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
        const pM = ((1 - G * G) / (4 * Math.PI)) / Math.pow(1 + G * G - 2 * G * mu, 1.5);
        const ms = 0.55 / (4 * Math.PI);   // isotropic stand-in for higher scattering orders
        out[0] = strength * (BETA_R[0] * r0 * (pR + ms) + bm * m0 * (pM + ms));
        out[1] = strength * (BETA_R[1] * r1 * (pR + ms) + bm * m1 * (pM + ms));
        out[2] = strength * (BETA_R[2] * r2 * (pR + ms) + bm * m2 * (pM + ms));
        return out;
    };

    // direct sunlight reaching the ground
    const l = opticalDepth(0, cy, 0, sx, sy, sz, 48);
    const sun = [0, 1, 2].map((k) => strength * Math.exp(-(BETA_R[k] * l[0] + bme * l[1] + BETA_O[k] * l[2])));

    return { radiance, sun, sunDir };
}

const half = THREE.DataUtils.toHalfFloat;

// table for the dome and the haze: u = azimuth, v = sqrt(elevation)
export function bakeSkyTable(model, W = 256, H = 128) {
    const data = new Uint16Array(W * H * 4), c = [0, 0, 0];
    const lin = new Float32Array(W * H * 3);
    for (let j = 0; j < H; j++) {
        const v = (j + 0.5) / H, y = v * v, rxy = Math.sqrt(Math.max(0, 1 - y * y));
        for (let i = 0; i < W; i++) {
            const a = ((i + 0.5) / W - 0.5) * Math.PI * 2;
            model.radiance(Math.cos(a) * rxy, y, Math.sin(a) * rxy, c);
            const o = (j * W + i) * 4;
            data[o] = half(Math.min(c[0], 60000)); data[o + 1] = half(Math.min(c[1], 60000)); data[o + 2] = half(Math.min(c[2], 60000)); data[o + 3] = half(1);
            lin.set(c, (j * W + i) * 3);
        }
    }
    const tex = dataTexture(data, W, H, { type: THREE.HalfFloatType });
    tex.wrapS = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return { tex, lin, W, H };
}

// A normal equirectangular panorama for the ambient light: sky above, a dim
// ground below so that undersides are lit by bounce, not by more sky.
export function bakeEnvPanorama(model, table, ground = [0.05, 0.055, 0.03], W = 192, H = 96) {
    const data = new Uint16Array(W * H * 4), c = [0, 0, 0];
    // hemisphere irradiance, to light the stand-in ground
    let e0 = 0, e1 = 0, e2 = 0, wsum = 0;
    for (let j = 0; j < 16; j++) {
        for (let i = 0; i < 32; i++) {
            const y = (j + 0.5) / 16, a = (i / 32) * Math.PI * 2, r = Math.sqrt(1 - y * y);
            model.radiance(Math.cos(a) * r, y, Math.sin(a) * r, c);
            e0 += c[0] * y; e1 += c[1] * y; e2 += c[2] * y; wsum += 1;
        }
    }
    const k = (2 * Math.PI) / wsum;   // uniform-in-y sampling of the hemisphere
    const irr = [e0 * k + model.sun[0] * model.sunDir.y, e1 * k + model.sun[1] * model.sunDir.y, e2 * k + model.sun[2] * model.sunDir.y];
    for (let j = 0; j < H; j++) {
        const phi = ((j + 0.5) / H) * Math.PI, y = Math.cos(phi), r = Math.sin(phi);
        for (let i = 0; i < W; i++) {
            const th = ((i + 0.5) / W) * Math.PI * 2;
            // three's equirect: u = atan2(z, x) / 2pi + 0.5
            const a = th - Math.PI, dx = Math.cos(a) * r, dz = Math.sin(a) * r;
            if (y > 0) model.radiance(dx, Math.max(y, 0.004), dz, c);
            else {
                const t = Math.min(1, -y * 6);
                model.radiance(dx, 0.004, dz, c);
                for (let q = 0; q < 3; q++) c[q] = c[q] * (1 - t) * 0.6 + (ground[q] * irr[q] / Math.PI) * (0.4 + 0.6 * t);
            }
            const o = (j * W + i) * 4;
            data[o] = half(c[0]); data[o + 1] = half(c[1]); data[o + 2] = half(c[2]); data[o + 3] = half(1);
        }
    }
    const tex = dataTexture(data, W, H, { type: THREE.HalfFloatType });
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    return { tex, irradiance: irr, skyIrradiance: [e0 * k, e1 * k, e2 * k] };
}

// ---- GPU side ------------------------------------------------------------------
export function createAtmosphere({ sunDir, noiseTex, quality, salt = 0 }) {
    const model = createSkyModel({ sunDir });
    const table = bakeSkyTable(model, quality.skyW, quality.skyH);
    const env = bakeEnvPanorama(model, table);

    const uSunDir = uniform(new THREE.Vector3(sunDir.x, sunDir.y, sunDir.z));
    const uSunColor = uniform(new THREE.Vector3(model.sun[0], model.sun[1], model.sun[2]));
    const uCloudCover = uniform(0.46);
    const uHaze = uniform(1.0);

    const TWO_PI = 6.283185307179586;
    // radiance of the clear sky in a direction
    const skyLookup = Fn(([dir]) => {
        // (straight up has no bearing, and atan(0, 0) no defined answer: nudged, it has one, and every bearing reads
        // the same sky at the zenith anyway)
        const u = atan(dir.z, dir.x.add(1e-6)).div(TWO_PI).add(0.5);
        const v = sqrt(clamp(dir.y, 0.0, 1.0));
        return texture(table.tex, vec2(u, v)).level(0).rgb;
    });

    const hg = Fn(([mu, g]) => {
        const g2 = g.mul(g);
        return float(1).sub(g2).div(pow(float(1).add(g2).sub(g.mul(2).mul(mu)), 1.5).mul(12.566));
    });

    // Clouds: two flat decks sampled where the view ray meets them. Each is lit
    // by stepping its own density toward the sun, which gives bright edges and
    // shaded bellies without marching a volume.
    const cloudDensity = Fn(([p, cover]) => {
        const a = texture(noiseTex, p).r;
        const b = texture(noiseTex, p.mul(3.7).add(vec2(0.31, 0.17))).g;
        const c = texture(noiseTex, p.mul(0.23).add(vec2(0.7, 0.2))).r;
        const n = a.mul(0.62).add(b.mul(0.2)).add(c.mul(0.34));
        return smoothstep(float(1.05).sub(cover), float(1.34).sub(cover), n);
    });

    const cloudLayer = Fn(([dir, altitude, scale, speed, cover, sky]) => {
        const t = altitude.div(max(dir.y, 0.012));
        const drift = vec2(time.mul(speed), time.mul(speed).mul(0.37));
        // anchored to the world, not the camera, so the shadows on the ground belong to these clouds
        const p = cameraPosition.xz.add(dir.xz.mul(t)).mul(scale).add(drift);
        const d = cloudDensity(p, cover);
        const toSun = normalize(uSunDir.xz).mul(0.022);
        const d1 = cloudDensity(p.add(toSun), cover);
        const d2 = cloudDensity(p.add(toSun.mul(2.6)), cover);
        const shade = exp(d1.mul(1.5).add(d2.mul(1.1)).negate());
        const mu = dot(dir, uSunDir);
        const fwd = hg(mu, float(0.72)).mul(5.0).add(hg(mu, float(0.2)).mul(8.0));
        const powder = float(1).sub(exp(d.mul(-2.2)));
        const lit = uSunColor.mul(shade).mul(fwd.add(0.42)).mul(mix(0.55, 1.0, powder));
        const amb = skyLookup(normalize(vec3(dir.x.mul(0.3), 0.75, dir.z.mul(0.3)))).mul(1.5).add(sky.mul(0.25));
        // (thick cloud is bright where the sun strikes it and grey underneath: the contrast is what gives it a body)
        const col = lit.mul(0.17).add(amb.mul(mix(1.0, 0.42, d)));
        // dissolve into the horizon haze
        const far = exp(t.mul(-0.000085));
        const alpha = d.mul(far).mul(smoothstep(0.0, 0.07, dir.y));
        return vec4(col, alpha);
    });

    const skyColor = Fn(([dirIn]) => {
        const dir = normalize(dirIn);
        const sky = skyLookup(dir).toVar();
        const mu = dot(dir, uSunDir);
        // the disc itself, limb darkened; bloom turns it into the sun
        const disc = smoothstep(0.99985, 0.99996, mu);
        // (and round it the aureole: tight and fierce at the limb, falling away over a hand's breadth of sky)
        const base = sky.add(uSunColor.mul(disc).mul(30.0)).add(uSunColor.mul(pow(saturate(mu), 900.0).mul(0.5).add(pow(saturate(mu), 190.0).mul(0.14)).add(pow(saturate(mu), 36.0).mul(0.018)))).toVar();
        const high = cloudLayer(dir, float(9000), float(0.000045), float(0.0016), uCloudCover.mul(0.82), sky);
        base.assign(mix(base, high.rgb, high.a.mul(0.75)));
        const low = cloudLayer(dir, float(2300), float(0.00016), float(0.0042), uCloudCover, sky);
        base.assign(mix(base, low.rgb, low.a));
        return base;
    });

    // the shade the low cloud deck casts on a point of the world
    const cloudShadow = Fn(([P]) => {
        const alt = float(2300), scale = float(0.00016), speed = float(0.0042);
        const drift = vec2(time.mul(speed), time.mul(speed).mul(0.37));
        const q = P.xz.add(uSunDir.xz.mul(alt.sub(P.y).div(max(uSunDir.y, 0.05)))).mul(scale).add(drift);
        return float(1).sub(cloudDensity(q, uCloudCover).mul(0.55));
    });

    // the same shade for a point in the haze, where only its broad shape matters: one sample, read coarsely
    const cloudShadowAir = Fn(([P]) => {
        const alt = float(2300), scale = float(0.00016), speed = float(0.0042);
        const drift = vec2(time.mul(speed), time.mul(speed).mul(0.37));
        // (a point above the deck is in no cloud's shade)
        const q = P.xz.add(uSunDir.xz.mul(max(alt.sub(P.y), 0.0).div(max(uSunDir.y, 0.05)))).mul(scale).add(drift);
        const n = texture(noiseTex, q).level(0).r.mul(0.62).add(texture(noiseTex, q.mul(0.23).add(vec2(0.7, 0.2))).level(0).r.mul(0.34)).add(0.1);
        return float(1).sub(smoothstep(float(1.05).sub(uCloudCover), float(1.34).sub(uCloudCover), n).mul(0.55).mul(step(P.y, alt)));
    });

    // ---- dome
    const domeMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
    domeMat.vertexNode = Fn(() => { const p = modelViewProjection; p.z.assign(p.w); return p; })();
    domeMat.colorNode = Fn(() => vec4(skyColor(positionWorld.sub(cameraPosition)), 1))();
    domeMat.toneMapped = true;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), domeMat);
    dome.frustumCulled = false;
    dome.renderOrder = -1000;
    dome.name = 'sky';

    // ---- haze. Extinction thins with height; its colour is the sky near the horizon in that direction.
    const uFogBase = uniform(0.000052);      // uniform aerial perspective, per metre
    const uFogLow = uniform(0.00062);        // extra near the ground
    const uFogHeight = uniform(70.0);
    const hazeAmount = Fn(() => {
        const v = positionWorld.sub(cameraPosition);
        const d = length(v);
        const dy = v.y;
        const a = cameraPosition.y.div(uFogHeight).negate();
        const b = positionWorld.y.div(uFogHeight).negate();
        // integral of exp(-y/H) along the ray
        const slab = select(abs(dy).greaterThan(0.01), exp(a).sub(exp(b)).mul(uFogHeight).div(dy), exp(a)).mul(d);
        // `salt` changes nothing visible; a different value makes every shader text new, which is how a
        // cold shader cache is reproduced when measuring load times (?salt=n)
        const tau = d.mul(uFogBase).add(max(slab, 0.0).mul(uFogLow)).mul(uHaze).add(float(salt * 1e-9).mul(1e-9));
        return float(1).sub(exp(tau.negate()));
    });
    const hazeColor = Fn(() => {
        const v = normalize(positionWorld.sub(cameraPosition));
        const flat = normalize(vec3(v.x, max(v.y, 0.0).mul(0.35).add(0.035), v.z));
        const mu = dot(v, uSunDir);
        return skyLookup(flat).mul(0.92).add(uSunColor.mul(hg(mu, float(0.68))).mul(0.055));
    });
    const fogNode = fog(hazeColor(), hazeAmount());

    return {
        model, table, env, dome, fogNode, skyColor, skyLookup, hg, cloudShadow, cloudShadowAir,
        uSunDir, uSunColor, uCloudCover, uHaze, uFogBase, uFogLow, uFogHeight,
        sunColor: new THREE.Color(model.sun[0], model.sun[1], model.sun[2]),
    };
}
