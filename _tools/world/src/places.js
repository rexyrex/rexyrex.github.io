// The stops of the tour: where the camera stands, what it looks at, where the
// rex waits. Every stop is one section of the page (`id` is the section's id).
// Positions are given relative to the site and resolved against the terrain,
// so the island can be reshaped without redoing them.
import { SITES, VOLCANO } from './island.js';

// cam / look: [east, up, south] offsets from the site; `up` is above the ground there
// rex: [east, south, heading in degrees (0 = north, clockwise)]
const DEFS = [
    { id: 'top', site: 'overlook', name: 'Overlook', cam: [-13, 5.4, 15], look: [330, -34, -420], fov: 40, rex: [0, -1.5, -78], zone: 95 },
    { id: 'typing', site: 'typing', name: 'Stone keyboard', cam: [-10.5, 6.2, 13.8], look: [2.2, -0.4, 1.6], fov: 46, rex: [9, -12, -125], zone: 80 },
    { id: 'balloons', site: 'balloons', name: 'Pterosaur cliffs', cam: [0, 3.4, 0], look: [-150, -15, -40], fov: 46, rex: [0, 0, -60], zone: 85, edge: true },
    { id: 'apps', site: 'apps', name: 'Standing stones', cam: [-14, 4.6, -9.5], look: [-2.5, 1.6, 3.7], fov: 42, rex: [0, 0, 100], zone: 75, pose: 'henge' },
    { id: 'games', site: 'games', name: 'Volcano', cam: [0, 7, 0], look: [-40, 10, -9], fov: 62, rex: null, zone: 60, rim: true },
    { id: 'mac', site: 'mac', name: 'Ranger outpost', cam: [-10.1, 6.2, -1.4], look: [-5.3, 3.8, 9.3], fov: 44, rex: [-12, 6, 116], zone: 80, pose: 'typing' },
    { id: 'tesla', site: 'tesla', name: 'Migration trail', cam: [-34, 3.4, 30], look: [44, 7, -34], fov: 40, rex: [-10, 12, 250], rexView: [56, 21, 205], zone: 90 },
    { id: 'music', site: 'music', name: 'Singing lagoon', cam: [11.7, 3.3, -13.4], look: [45.7, -4, -177.4], fov: 40, rex: [-13, 2, 20], rexView: [26, -11.5], zone: 85 },
    { id: 'log', site: 'log', name: 'Strata cliff', cam: [-196, 11, 14], look: [-30, 24, 0], fov: 42, rex: [-170, 6, 290], zone: 80 },
    { id: 'index', site: 'index', name: 'The whole island', cam: [-70, 1820, 940], look: [0, 0, 70], fov: 40, rex: null, zone: 0, aerial: true },
    { id: 'contact', site: 'contact', name: 'Base camp', cam: [-14, 3.8, 10], look: [6, 2.4, -4], fov: 44, rex: [7, 1.6, -75], zone: 80 },
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
        return { index, id: d.id, name: d.name, site: { x: s.x, z: s.z, y: ground }, cam, look, fov: d.fov, rex, zone: d.zone, focus, aerial: !!d.aerial, pose: d.pose || null, speaker, at, fwd: [fx, fz] };
    });
}

export { SITES, VOLCANO };
