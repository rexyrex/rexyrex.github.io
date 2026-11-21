// `smoothstep(a, b, x)` with a > b ("one at a, falling to nothing at b") is written all over this world, and
// it is undefined in both shading languages: GLSL ES and WGSL only promise a result when the first edge
// is the lower one. Every desktop driver tried gives the obvious answer; a phone's need not. So a fade
// written downhill is built uphill and turned over, which is the same curve.
import { smoothstep as rise, uniform, renderGroup } from 'three/tsl';

export const smoothstep = (a, b, x) => (typeof a === 'number' && typeof b === 'number' && a > b ? rise(b, a, x).oneMinus() : rise(a, b, x));

// The island's own clock, in seconds. Everything that moves in a shader reads this one and not three's
// `time`, which runs on whatever the browser's clock says: a still asked for at a given moment has to
// find every wave, spark and cloud where that moment put it.
// (one value for the whole frame, as three's is: left in each object's own block it was uploaded again for
// every batch of plants every frame)
export const time = uniform(0).setGroup(renderGroup);
