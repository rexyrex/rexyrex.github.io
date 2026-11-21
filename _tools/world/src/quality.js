// Detail tiers. One world, built with less in it on smaller machines.
//   ultra  desktop GPUs, WebGPU
//   high   laptops / integrated GPUs
//   medium recent phones and tablets
//   low    everything else that still gets the live world
export const TIERS = {
    ultra: {
        name: 'ultra', islandN: 1024, clipN: 256, clipLevels: 8, clipCell: 0.5, clipShadowTo: 3,
        skyW: 256, skyH: 128, texSize: 512, maxDpr: 2, maxPixels: 2560 * 1440 * 1.15, msaa: 4,
        shadowSize: 3072, cascades: 3, shadowFar: 380, flora: 1, fauna: 1, post: 3, photo: 768,
        light: { waves: 512, aniso: 8, dapple: 1, caustics: 2 }, shafts: 22, shaftRes: 0.4, ao: 9, dof: 1, blades: 1, motes: 7000,
    },
    high: {
        name: 'high', islandN: 1024, clipN: 192, clipLevels: 8, clipCell: 0.5, clipShadowTo: 3,
        skyW: 256, skyH: 128, texSize: 512, maxDpr: 1.5, maxPixels: 1920 * 1080 * 1.2, msaa: 4,
        shadowSize: 2048, cascades: 3, shadowFar: 300, flora: 0.6, fauna: 1, post: 2, photo: 768,
        light: { waves: 512, aniso: 8, dapple: 1, caustics: 2 }, shafts: 14, shaftRes: 0.34, ao: 6, dof: 1, blades: 0.6, motes: 4000,
    },
    medium: {
        name: 'medium', islandN: 768, clipN: 128, clipLevels: 8, clipCell: 0.75, clipShadowTo: 3,
        skyW: 192, skyH: 96, texSize: 256, maxDpr: 1.5, maxPixels: 1280 * 720 * 1.3, msaa: 1,
        shadowSize: 2048, cascades: 2, shadowFar: 200, flora: 0.33, fauna: 0.7, post: 1, photo: 384,
        light: { waves: 256, aniso: 4, dapple: 1, caustics: 1, waveEvery: 2 }, shafts: 8, shaftRes: 0.25, ao: 0, dof: 0, blades: 0.3, motes: 1500,
    },
    low: {
        name: 'low', islandN: 512, clipN: 96, clipLevels: 8, clipCell: 1, clipShadowTo: 2,
        skyW: 128, skyH: 64, texSize: 256, maxDpr: 1, maxPixels: 960 * 540 * 1.2, msaa: 1,
        shadowSize: 1024, cascades: 1, shadowFar: 160, flora: 0.16, fauna: 0.5, post: 0, photo: 0,
        light: { waves: 256, aniso: 1, dapple: 1, caustics: 1, waveEvery: 2 }, shafts: 0, ao: 0, dof: 0, blades: 0.08, motes: 0,
    },
};
export const ORDER = ['low', 'medium', 'high', 'ultra'];
