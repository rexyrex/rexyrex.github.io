// The stops of the tour: where the camera stands, what it looks at, where the
// rex waits. Every stop is one section of the page (`id` is the section's id).
// Positions are given relative to the site and resolved against the terrain,
// so the island can be reshaped without redoing them.
import { SITES, VOLCANO } from './island.js';

// cam / look: [east, up, south] offsets from the site; `up` is above the ground there
// rex: [east, south, heading in degrees (0 = north, clockwise)]
// tall: where the look moves to on an upright screen, which sees a narrower slice ([east, up, south] added to look)
// tallCam: the same for the camera (the whole island only fits an upright screen from further up)
// lens: what is in focus ('rex', 'look', or a distance in metres), how wide the lens is open (0 keeps
//       everything sharp, 0.08 leaves a forest sixty metres behind the subject soft), and how many stops
//       brighter than the open ridge this place is exposed
const DEFS = [
    { id: 'top', site: 'overlook', name: 'Overlook', cam: [-13, 5.4, 15], look: [330, -34, -420], fov: 40, rex: [5.4, 1.3, -78], zone: 95, lens: ['rex', 0.02, 0] },      // the rex stands right of the middle: the page's headline has the left
    { id: 'typing', site: 'typing', name: 'Stone keyboard', cam: [-10.5, 6.2, 13.8], look: [2.2, -0.4, 1.6], fov: 46, rex: [9, -12, -125], zone: 80, lens: [17, 0.05, 0.38] },
    { id: 'balloons', site: 'balloons', name: 'Pterosaur cliffs', cam: [0, 3.4, 0], look: [-150, -15, -40], fov: 46, rex: [0, 0, -60], zone: 85, edge: true, lens: [70, 0.02, 0] },
    { id: 'apps', site: 'apps', name: 'Standing stones', cam: [-14, 4.6, -9.5], look: [-2.5, 1.6, 3.7], fov: 42, rex: [0, 0, 100], zone: 75, pose: 'henge', lens: ['look', 0.075, 0.2] },
    { id: 'games', site: 'games', name: 'Volcano', cam: [0, 7, 0], look: [-40, 10, -9], fov: 62, rex: null, zone: 60, rim: true, lens: [80, 0.0, 0] },
    { id: 'mac', site: 'mac', name: 'Ranger outpost', cam: [-10.1, 6.2, -1.4], look: [-5.3, 3.8, 9.3], fov: 44, rex: [-12, 6, 116], zone: 80, pose: 'typing', tall: [-2.6, 0.3, 1.2], lens: ['look', 0.03, 0.25] },
    { id: 'tesla', site: 'tesla', name: 'Migration trail', cam: [-34, 3.4, 30], look: [44, 7, -34], fov: 40, rex: [-10, 12, 250], rexView: [56, 21, 205], zone: 90, lens: [34, 0.02, 0.1] },
    { id: 'music', site: 'music', name: 'Singing lagoon', cam: [11.7, 3.3, -13.4], look: [45.7, -4, -177.4], fov: 40, rex: [-13, 2, 20], rexView: [26, -11.5], zone: 85, lens: [40, 0.03, 0] },
    { id: 'log', site: 'log', name: 'Strata cliff', cam: [-196, 11, 14], look: [-30, 24, 0], fov: 42, rex: [-170, 6, 290], zone: 80, lens: ['rex', 0.02, 0.05] },
    { id: 'index', site: 'index', name: 'The whole island', cam: [-70, 1820, 940], look: [0, 0, 70], fov: 40, rex: null, zone: 0, aerial: true, tallCam: [-45, 1150, 600], lens: [400, 0, 0.12] },
    { id: 'contact', site: 'contact', name: 'Base camp', cam: [-14, 3.8, 10], look: [6, 2.4, -4], fov: 44, rex: [7, 1.6, -75], zone: 80, lens: ['rex', 0.05, 0.1] },
];

export function definePlaces(island) {
    return DEFS.map((d, index) => {
        const s = SITES[d.site];
        const ground = island.heightAt(s.x, s.z);
        let cx = s.x + d.cam[0], cz = s.z + d.cam[2];
        let rexAt = d.rex ? [s.x + d.rex[0], s.z + d.rex[1]] : null;
        if (d.edge) {
            // stand at the cliff's edge: walk seaward from the site until the ground falls away
            const dir = [-0.93, -0.37];
            let t = 0; while (t < 200 && island.heightAt(s.x + dir[0] * t, s.z + dir[1] * t) > ground * 0.8) t += 1.5;
            cx = s.x + dir[0] * (t - 9); cz = s.z + dir[1] * (t - 9);
            rexAt = [s.x + dir[0] * (t - 13) + 9, s.z + dir[1] * (t - 13) - 13];
        }
        if (d.rim) {
            // stand on the crater's rim: the highest ground going east from the middle, a step inside it
            let best = 0, bh = -1e9; for (let t = 30; t < 130; t += 1.5) { const h = island.heightAt(s.x + t * 0.97, s.z + t * 0.24); if (h > bh) { bh = h; best = t; } }
            cx = s.x + (best - 5) * 0.97; cz = s.z + (best - 5) * 0.24;
        }
        const camGround = d.aerial ? 0 : Math.max(0, island.heightAt(cx, cz));
        const cam = [cx, camGround + d.cam[1], cz];
        const look = d.aerial ? [s.x + d.look[0], d.look[1], s.z + d.look[2]] : [s.x + d.look[0], ground + d.look[1], s.z + d.look[2]];
        let rex = null;
        if (d.rex) {
            const rx = rexAt[0], rz = rexAt[1];
            rex = { x: rx, z: rz, y: island.heightAt(rx, rz), heading: (d.rex[2] * Math.PI) / 180 };
        }
        // where the eye rests: used to centre the dense planting
        const focus = d.aerial ? null : { x: cam[0] + (look[0] - cam[0]) * Math.min(1, 34 / Math.hypot(look[0] - cam[0], look[2] - cam[2])), z: cam[2] + (look[2] - cam[2]) * Math.min(1, 34 / Math.hypot(look[0] - cam[0], look[2] - cam[2])) };
        // anchors that set pieces and animals share
        const fl = Math.hypot(look[0] - cam[0], look[2] - cam[2]) || 1, fx = (look[0] - cam[0]) / fl, fz = (look[2] - cam[2]) / fl;
        const at = (fwd, right) => ({ x: cam[0] + fx * fwd - fz * right, z: cam[2] + fz * fwd + fx * right });
        let speaker = null;
        if (d.id === 'music') {
            // out in the lagoon, left of the middle of the view, where the water is shallow enough for a rock to show
            let best = 1e9;
            for (let f = 30; f <= 50; f += 1.5) for (let r = -11; r <= 1; r += 1.5) { const q = at(f, r), h = island.heightAt(q.x, q.z); if (h > -0.7) continue; const cost = Math.abs(h + 1.35) * 5 + Math.abs(f - 39) * 0.4 + Math.abs(r + 4.5) * 0.4; if (cost < best) { best = cost; speaker = q; } }
            if (!speaker) speaker = at(39, -4.5);
        }
        // a rex placed in the camera's own terms ([ahead, to the right]), facing the speaker if there is one
        if (d.rexView) { const q = at(d.rexView[0], d.rexView[1]); rex = { x: q.x, z: q.z, y: island.heightAt(q.x, q.z), heading: speaker ? Math.atan2(speaker.x - q.x, -(speaker.z - q.z)) : Math.atan2(fx, -fz) + ((d.rexView[2] || 0) * Math.PI) / 180 }; }
        const lookTall = d.tall ? [look[0] + d.tall[0], look[1] + d.tall[1], look[2] + d.tall[2]] : look;
        const camTall = d.tallCam ? [cam[0] + d.tallCam[0], cam[1] + d.tallCam[1], cam[2] + d.tallCam[2]] : cam;
        const far = (q) => Math.hypot(q[0] - cam[0], q[1] - cam[1], q[2] - cam[2]);
        const ln = d.lens || [400, 0, 0], lens = [ln[0] === 'rex' && rex ? far([rex.x, rex.y + 3, rex.z]) : ln[0] === 'look' ? far(look) : typeof ln[0] === 'number' ? ln[0] : 400, ln[1], ln[2] || 0];
        const lensAt = ln[0] === 'rex' && rex ? [rex.x, rex.y + 3, rex.z] : ln[0] === 'look' ? look : null;
        return { index, lens, lensAt, id: d.id, name: d.name, site: { x: s.x, z: s.z, y: ground }, cam, camTall, look, lookTall, fov: d.fov, rex, zone: d.zone, focus, aerial: !!d.aerial, pose: d.pose || null, speaker, at, fwd: [fx, fz] };
    });
}

export const STOPS = DEFS.length;
export { SITES, VOLCANO };
