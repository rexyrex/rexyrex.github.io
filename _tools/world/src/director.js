// The camera. It is either tied to the page's scroll position (a continuous
// "stop index": 2.5 is halfway between the third and fourth stops) or flying
// to a stop because a button was pressed. Both use the same hop: ease out of
// one view, rise, cross, and settle into the next, never closer to the ground
// than a few metres.
import * as THREE from 'three/webgpu';
import { clamp, lerp, smootherstep, smoothstep } from './noise.js';

export function createDirector({ camera, places, island, onStop = () => {} }) {
    const N = places.length;
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    const A = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 }, B = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
    let sTarget = 0, s = 0, flight = null, stop = 0, motion = 1, aspect = 1.6, frameY = 0.5, frameWant = 0.5;
    // (an upright screen sees a narrower slice of each place: some places turn the lens a little for it)
    const poseOf = (i, out) => { const p = places[clamp(i, 0, N - 1)], k = clamp((1.25 - aspect) / 0.5, 0, 1), a = p.look, b = p.lookTall || a, c = p.cam, e = p.camTall || c; out.pos.set(lerp(c[0], e[0], k), lerp(c[1], e[1], k), lerp(c[2], e[2], k)); out.look.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)); out.fov = p.fov; return out; };
    let pointerX = 0, pointerY = 0, px = 0, py = 0;
    const out = { fov: 40 };

    // between two views: u in 0..1
    const hop = (a, b, u, big) => {
        const e = smootherstep(0, 1, u), el = smootherstep(0, 1, Math.min(1, u * 1.12));
        pos.lerpVectors(a.pos, b.pos, e); look.lerpVectors(a.look, b.look, el);
        const d = a.pos.distanceTo(b.pos);
        const arc = clamp(d * (big ? 0.2 : 0.16), 4, 230) * Math.sin(Math.PI * e);
        pos.y += arc;
        // look ahead and down a little while travelling, so the land passes under the lens
        look.y -= arc * 0.1;
        const floor = island.heightAt(pos.x, pos.z) + lerp(2.0, 16, Math.sin(Math.PI * e));
        if (pos.y < floor) pos.y = floor;
        out.fov = lerp(a.fov, b.fov, e) + 5 * Math.sin(Math.PI * e) * Math.min(1, d / 300);
    };

    const api = {
        // scroll position, as a fractional stop index
        setProgress(v) { sTarget = clamp(v, 0, N - 1); },
        // jump with no travel (first frame, posters, reduced motion)
        jumpTo(i) { flight = null; s = sTarget = clamp(i, 0, N - 1); stop = Math.round(s); onStop(stop, true); },
        // glide to a stop; the page moves its scroll position there at the same moment
        flyTo(i) {
            i = clamp(i, 0, N - 1);
            A.pos.copy(camera.position); A.look.copy(look); A.fov = out.fov;
            poseOf(i, B);
            const d = A.pos.distanceTo(B.pos);
            if (d < 1) { api.jumpTo(i); return 0; }
            const dur = clamp(1.7 + d / 380, 1.9, 3.8);
            flight = { to: i, t: 0, dur, swapped: false };
            sTarget = i;
            return dur;
        },
        // for stills of a journey: the view a fraction `u` of the way from stop i to stop j
        preview(i, j, u) { flight = null; poseOf(i, A); poseOf(j, B); hop(A, B, u, true); return { pos: pos.clone(), look: look.clone() }; },
        setAspect(a) { aspect = a; },
        // Where on the screen the subject belongs, as a fraction of its height from the top. On a phone
        // the page's content takes the lower half, so the page asks for the middle of what is left.
        setFrame(y, now = false) { frameWant = clamp(y, 0.12, 0.5); if (now) frameY = frameWant; },
        setMotion(m) { motion = m; },
        setPointer(x, y) { pointerX = x; pointerY = y; },
        get flying() { return !!flight; },
        get stop() { return stop; },
        get progress() { return s; },
        update(dt, t) {
            if (flight) {
                flight.t += dt;
                const u = Math.min(1, flight.t / flight.dur);
                hop(A, B, u, true);
                if (!flight.swapped && u > 0.45) { flight.swapped = true; stop = flight.to; onStop(stop, false); }
                if (u >= 1) { s = sTarget = Math.max(sTarget, 0) === flight.to ? flight.to : sTarget; s = flight.to; flight = null; }
            } else {
                s += (sTarget - s) * (1 - Math.exp(-dt * 5.5));
                if (Math.abs(sTarget - s) < 1e-4) s = sTarget;
                const i = Math.min(N - 2, Math.floor(s)), u = s - i;
                poseOf(i, A); poseOf(i + 1, B);
                hop(A, B, u, false);
                const near = Math.round(s);
                if (near !== stop) { stop = near; onStop(stop, false); }
            }
            // a held camera is never perfectly still; and it leans a little toward the pointer
            px += (pointerX - px) * Math.min(1, dt * 2.5); py += (pointerY - py) * Math.min(1, dt * 2.5);
            const sway = motion * (flight ? 0.3 : 1);
            const dir = look.clone().sub(pos); const dist = dir.length(); dir.normalize();
            const right = new THREE.Vector3().crossVectors(dir, THREE.Object3D.DEFAULT_UP).normalize();
            const k = Math.min(dist, 60) * 0.012 * sway;
            pos.addScaledVector(right, Math.sin(t * 0.21) * 0.22 * sway + px * 0.5 * sway).y += (Math.sin(t * 0.17 + 1.3) * 0.1 - py * 0.25) * sway;
            look.addScaledVector(right, px * k * 6 + Math.sin(t * 0.13) * k).y += (Math.cos(t * 0.11) * k * 0.6 - py * k * 3);
            camera.position.copy(pos);
            // keep the horizontal view on narrow screens by opening the lens
            const hf = 2 * Math.atan(Math.tan((out.fov * Math.PI) / 360) * 1.6);
            const vf = aspect >= 1.6 ? out.fov : clamp((2 * Math.atan(Math.tan(hf / 2) / Math.max(aspect, 0.42)) * 180) / Math.PI, out.fov, aspect < 1 ? 86 : 74);
            if (Math.abs(camera.fov - vf) > 0.01) { camera.fov = vf; camera.updateProjectionMatrix(); }
            // Tip the lens down until the subject sits where the page has room for it. This is the last thing
            // done and it is kept out of `look`, so it is the same in a flight as at rest: nothing snaps when
            // a flight ends.
            // It turns about the camera's own right-hand axis, so it works the same looking across a clearing as
            // looking straight down at the whole island.
            frameY += (frameWant - frameY) * (1 - Math.exp(-dt * 4));
            camera.lookAt(look);
            if (frameY < 0.499) camera.rotateX(-Math.atan((0.5 - frameY) * 2 * Math.tan((vf * Math.PI) / 360)));
        },
    };
    api.jumpTo(0);
    return api;
}
