// Textures made at load, on the CPU. No image files anywhere in the world.
import * as THREE from 'three/webgpu';
import { clamp, fbm2, ridged2, worley2, perlin2 } from './noise.js';

function finish(tex, { srgb = false, aniso = 8, mips = true } = {}) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    tex.generateMipmaps = mips;
    tex.anisotropy = aniso;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
}

// height field (Float32 S*S, tileable) -> RGBA8: rg = normal.xy, b = height, a = extra
function packHeight(hf, extra, S, strength) {
    const out = new Uint8Array(S * S * 4);
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < hf.length; i++) { if (hf[i] < lo) lo = hf[i]; if (hf[i] > hi) hi = hf[i]; }
    const inv = 1 / (hi - lo || 1);
    for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
            const o = j * S + i;
            const l = hf[j * S + ((i + S - 1) % S)], r = hf[j * S + ((i + 1) % S)];
            const u = hf[((j + S - 1) % S) * S + i], d = hf[((j + 1) % S) * S + i];
            let nx = -(r - l) * strength, ny = -(d - u) * strength;
            const k = 1 / Math.hypot(nx, ny, 1); nx *= k; ny *= k;
            out[o * 4] = clamp(Math.round((nx * 0.5 + 0.5) * 255), 0, 255);
            out[o * 4 + 1] = clamp(Math.round((ny * 0.5 + 0.5) * 255), 0, 255);
            out[o * 4 + 2] = Math.round((hf[o] - lo) * inv * 255);
            out[o * 4 + 3] = extra ? Math.round(clamp(extra[o], 0, 1) * 255) : 255;
        }
    }
    return out;
}

// Ground and rock relief: fractured, weathered stone. rg normal, b height, a = soft mottling.
export function makeRockTexture(S = 512) {
    const hf = new Float32Array(S * S), mot = new Float32Array(S * S);
    const P = 8;
    for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
            const x = (i / S) * P, y = (j / S) * P;
            const wx = x + 0.35 * fbm2(x + 3.1, y + 7.7, 3, 2, 0.5, P), wy = y + 0.35 * fbm2(x - 5.2, y + 1.3, 3, 2, 0.5, P);
            const w = worley2(wx * 1.5, wy * 1.5, P * 1.5);
            const cracks = clamp((w[1] - w[0]) * 3.2, 0, 1);                 // 0 in the crack
            const body = 0.55 * ridged2(wx, wy, 5, 2, 0.55, P) + 0.45 * (0.5 + 0.5 * fbm2(wx * 2, wy * 2, 5, 2, 0.5, P * 2));
            hf[j * S + i] = body * (0.55 + 0.45 * cracks) + 0.16 * w[2];
            mot[j * S + i] = 0.5 + 0.5 * fbm2(x * 0.75 + 11, y * 0.75 - 4, 5, 2, 0.55, P * 0.75);
        }
    }
    const data = packHeight(hf, mot, S, 9);
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.userData.data = data; t.userData.size = S;
    return finish(t);
}

// Loose ground: grit, small stones, soft bumps. rg normal, b height, a = pebble mask.
export function makeGroundTexture(S = 512) {
    const hf = new Float32Array(S * S), peb = new Float32Array(S * S);
    const P = 10;
    for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
            const x = (i / S) * P, y = (j / S) * P;
            const w = worley2(x * 2.2 + 0.2 * perlin2(x * 3, y * 3, P * 3), y * 2.2, P * 2.2);
            const stone = clamp(1 - w[0] * 2.4, 0, 1) * (w[2] > 0.62 ? 1 : 0);
            const grit = 0.5 + 0.5 * fbm2(x * 6, y * 6, 4, 2, 0.6, P * 6);
            const soft = 0.5 + 0.5 * fbm2(x, y, 4, 2, 0.5, P);
            hf[j * S + i] = 0.5 * soft + 0.16 * grit + 0.55 * Math.sqrt(stone);
            peb[j * S + i] = stone;
        }
    }
    const data = packHeight(hf, peb, S, 7);
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.userData.data = data; t.userData.size = S;
    return finish(t);
}

// Four unrelated tileable noises in one texture: r broad fbm, g fine fbm, b ridged, a cellular.
export function makeNoiseTexture(S = 256) {
    const out = new Uint8Array(S * S * 4);
    for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
            const x = i / S, y = j / S, o = (j * S + i) * 4;
            out[o] = Math.round(clamp(0.5 + 0.62 * fbm2(x * 4, y * 4, 6, 2, 0.55, 4), 0, 1) * 255);
            out[o + 1] = Math.round(clamp(0.5 + 0.62 * fbm2(x * 16 + 9, y * 16 + 3, 4, 2, 0.5, 16), 0, 1) * 255);
            out[o + 2] = Math.round(clamp(ridged2(x * 5 + 2, y * 5 + 6, 5, 2, 0.5, 5), 0, 1) * 255);
            out[o + 3] = Math.round(clamp(1 - worley2(x * 9, y * 9, 9)[0] * 1.25, 0, 1) * 255);
        }
    }
    const t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.userData.data = out; t.userData.size = S;
    return finish(t);
}

// bilinear, wrapping sample of one channel of an RGBA8 array (CPU twin of texture())
export function sampleWrap(data, S, ch, u, v) {
    let x = (u - Math.floor(u)) * S - 0.5, y = (v - Math.floor(v)) * S - 0.5;
    let i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j;
    const i0 = ((i % S) + S) % S, i1 = (i0 + 1) % S, j0 = ((j % S) + S) % S, j1 = (j0 + 1) % S;
    const a = data[(j0 * S + i0) * 4 + ch], b = data[(j0 * S + i1) * 4 + ch], c = data[(j1 * S + i0) * 4 + ch], d = data[(j1 * S + i1) * 4 + ch];
    return (a + (b - a) * fx + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy) / 255;
}

export function dataTexture(data, w, h, { format = THREE.RGBAFormat, type = THREE.UnsignedByteType, linear = true, repeat = false, mips = false, srgb = false } = {}) {
    const t = new THREE.DataTexture(data, w, h, format, type);
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
    t.minFilter = mips ? THREE.LinearMipmapLinearFilter : (linear ? THREE.LinearFilter : THREE.NearestFilter);
    t.generateMipmaps = mips;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
}

export function canvasTexture(canvas, { srgb = true, aniso = 8, repeat = false } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = aniso;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
}

// Water ripples: rg normal, b height, a = foam breakup.
export function makeWaterTexture(S = 512) {
    const hf = new Float32Array(S * S), foam = new Float32Array(S * S);
    const P = 6;
    for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
            const x = (i / S) * P, y = (j / S) * P;
            const wx = x + 0.25 * fbm2(x * 1.3 + 2.2, y * 1.3 + 5.1, 3, 2, 0.5, P * 1.3);
            // crests run across the wind (x), so stretch along y
            const swell = fbm2(wx * 1.6, y * 0.8, 4, 2, 0.55, P * 0.8);
            const chop = 1 - Math.abs(fbm2(wx * 4.2 + 7, y * 2.6 + 1, 4, 2, 0.55, P * 2.6));
            hf[j * S + i] = 0.6 * swell + 0.32 * chop * chop;
            foam[j * S + i] = clamp(0.5 + 0.7 * fbm2(x * 3 + 4, y * 3 + 8, 5, 2, 0.6, P * 3), 0, 1);
        }
    }
    const data = packHeight(hf, foam, S, 5);
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    return finish(t);
}
