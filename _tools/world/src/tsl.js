// `smoothstep(a, b, x)` with a > b ("one at a, falling to nothing at b") is written all over this world, and
// it is undefined in both shading languages: GLSL ES and WGSL only promise a result when the first edge
// is the lower one. Every desktop driver tried gives the obvious answer; a phone's need not. So a fade
// written downhill is built uphill and turned over, which is the same curve.
import { smoothstep as rise } from 'three/tsl';

export const smoothstep = (a, b, x) => (typeof a === 'number' && typeof b === 'number' && a > b ? rise(b, a, x).oneMinus() : rise(a, b, x));
