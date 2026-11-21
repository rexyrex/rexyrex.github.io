// Photographs laid over the painted world: plant sprites and six kinds of ground
// (made by textures.py, kept in /assets/island/tex/). The animals' hide used to be a
// third; it is a formula now (fauna.js), and its file is no longer fetched.
// They are an improvement, never a requirement: a file that is missing, slow
// or undecodable leaves that part of the world painted the way it always was.
import * as THREE from 'three/webgpu';

const VERSION = 2;
const fetchImage = (url, ms) => new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image(); let done = false;
    const end = (v) => { if (!done) { done = true; resolve(v); } };
    img.decoding = 'async';
    img.onload = () => { (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => end(img)); };
    img.onerror = () => end(null);
    setTimeout(() => end(null), ms);
    img.src = url;
});
const pixels = (img, sx, sy, sw, sh, w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return x.getImageData(0, 0, w, h).data;
};
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

// base: where the files are; size: side of a ground square (0 = no photographs at all)
export async function loadPhotos({ base = '/assets/island/tex/', size = 768, onProgress = () => {} } = {}) {
    const out = { flora: null, ground: null, skin: null };
    if (!size || typeof document === 'undefined') return out;
    const q = '?v=' + VERSION;
    let got = 0; const tick = (v) => { got++; onProgress(got / 2); return v; };
    const [flora, ground] = await Promise.all([fetchImage(base + 'flora.webp' + q, 20000).then(tick), fetchImage(base + 'ground.webp' + q, 20000).then(tick)]);
    try {
        if (flora && flora.naturalWidth === flora.naturalHeight * 2) {
            const n = flora.naturalHeight;
            out.flora = { size: n, rgb: pixels(flora, 0, 0, n, n, n, n), mask: pixels(flora, n, 0, n, n, n, n) };
        }
    } catch (e) { out.flora = null; }
    try {
        if (ground && ground.naturalHeight % ground.naturalWidth === 0) {
            const src = ground.naturalWidth, layers = ground.naturalHeight / src, s = Math.min(size, src);
            const data = new Uint8Array(s * s * 4 * layers), mean = [];
            for (let i = 0; i < layers; i++) {
                const px = pixels(ground, 0, i * src, src, src, s, s);
                data.set(px, i * s * s * 4);
                let r = 0, g = 0, b = 0, k = 0;
                for (let j = 0; j < px.length; j += 4 * 37) { r += lin(px[j]); g += lin(px[j + 1]); b += lin(px[j + 2]); k++; }
                mean.push([r / k, g / k, b / k]);
            }
            const tex = new THREE.DataArrayTexture(data, s, s, layers);
            tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType; tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 8;
            tex.needsUpdate = true;
            out.ground = { tex, mean, layers };
        }
    } catch (e) { out.ground = null; }
    return out;
}
