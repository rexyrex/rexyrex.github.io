// One sheet of water at sea level serves the ocean, the lake and the river.
// It is shaded by hand: the sky reflected by Fresnel, the sun's glitter, and
// below the surface the real seabed, bent by the ripples and tinted by how
// much water the light crossed to reach it.
import * as THREE from 'three/webgpu';
import {
    Fn, uniform, texture, vec2, vec3, vec4, float, mix, smoothstep, max, min, abs, clamp, normalize, dot, pow, sqrt, exp, reflect, length, sin,
    positionWorld, positionView, cameraPosition, cameraViewMatrix, cameraProjectionMatrix, cameraNear, cameraFar, time, screenUV, screenCoordinate, viewportSharedTexture, viewportDepthTexture,
    saturate, getScreenPosition, perspectiveDepthToViewZ, interleavedGradientNoise, Loop, If, Break,
} from 'three/tsl';

const C = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };

export function createWater({ waterTex, terrain, atmosphere, quality }) {
    const { uSunDir, uSunColor, skyLookup } = atmosphere;
    const P = positionWorld;
    const xz = P.xz;
    const V = normalize(cameraPosition.sub(P));
    const dist = length(cameraPosition.sub(P));

    // open sea vs sheltered water: the lake and river lie well inside the coast
    const open = smoothstep(600.0, 790.0, length(xz.mul(vec2(0.93, 1.04))));
    const bed = terrain.gridHeight(xz);
    const depth = max(bed.negate(), 0.0).toVar('wDepth');

    const wind = vec2(1.0, 0.28);
    const t = time;
    const s1 = texture(waterTex, xz.mul(1 / 6.3).add(wind.mul(t.mul(0.075))));
    const s2 = texture(waterTex, xz.mul(1 / 19.0).add(vec2(-0.3, 1.0).mul(t.mul(0.03))));
    const s3 = texture(waterTex, xz.mul(1 / 71.0).add(wind.mul(t.mul(0.007))));
    const s4 = texture(waterTex, xz.mul(1 / 1.9).add(vec2(0.7, -0.6).mul(t.mul(0.11))));

    const normal = Fn(() => {
        // ripples lose their steepness with distance; what is left is the swell
        const near = smoothstep(180.0, 6.0, dist), mid = smoothstep(1500.0, 40.0, dist);
        const calm = mix(0.3, 1.0, open);
        const shallow = smoothstep(0.0, 1.2, depth);
        const n = s1.rg.mul(2).sub(1).mul(0.5).mul(mid)
            .add(s2.rg.mul(2).sub(1).mul(0.55).mul(mid))
            .add(s3.rg.mul(2).sub(1).mul(0.2))
            .add(s4.rg.mul(2).sub(1).mul(0.3).mul(near));
        const k = calm.mul(mix(0.4, 1.0, shallow)).mul(0.36).mul(mix(1.0, mix(0.3, 1.0, open), smoothstep(50.0, 300.0, cameraPosition.y)));
        return normalize(vec3(n.x.mul(k), 1.0, n.y.mul(k)));
    })().toVar('wN');

    // Reflections of the land: follow the mirrored view ray across the screen until it passes
    // behind something already drawn, and take that pixel. What the screen cannot show
    // (anything out of frame) falls back to the sky.
    const mirror = Fn(() => {
        const Nv = normalize(normal.transformDirection(cameraViewMatrix));
        const Rv = reflect(normalize(positionView), Nv);
        const hit = vec3(0.0).toVar();
        const t = float(1.2).toVar(), lo = float(0.0).toVar(), found = float(0.0).toVar();
        const N = quality.post >= 3 ? 26 : 18, grow = quality.post >= 3 ? 1.3 : 1.42;
        const zAt = (tt) => { const p = positionView.add(Rv.mul(tt)); const suv = getScreenPosition(p, cameraProjectionMatrix); return perspectiveDepthToViewZ(viewportDepthTexture(suv).r, cameraNear, cameraFar).sub(p.z); };
        Loop(N, () => {
            const p = positionView.add(Rv.mul(t));
            const suv = getScreenPosition(p, cameraProjectionMatrix);
            If(suv.x.lessThan(0.0).or(suv.x.greaterThan(1.0)).or(suv.y.lessThan(0.0)).or(suv.y.greaterThan(1.0)).or(p.z.greaterThan(-0.2)), () => { Break(); });
            const sz = perspectiveDepthToViewZ(viewportDepthTexture(suv).r, cameraNear, cameraFar);
            const behind = sz.sub(p.z);
            // behind something by less than its likely thickness: a hit. Behind it by more: the ray has
            // passed behind a thing nearer the camera (an animal's head, a trunk) and carries on to what is beyond
            If(behind.greaterThan(0.0).and(behind.lessThan(t.mul(0.3).add(1.2))).and(sz.greaterThan(cameraFar.mul(-0.9))), () => { found.assign(1.0); Break(); });
            lo.assign(t);
            t.mulAssign(grow);
        });
        // close in on the surface between the last miss and the hit, so the reflection has clean edges
        If(found.greaterThan(0.5), () => {
            const hi = float(t).toVar();
            Loop(5, () => { const mid = lo.add(hi).mul(0.5); If(zAt(mid).greaterThan(0.0), () => { hi.assign(mid); }).Else(() => { lo.assign(mid); }); });
            const suv = getScreenPosition(positionView.add(Rv.mul(hi)), cameraProjectionMatrix);
            const edge = smoothstep(0.0, 0.07, suv.x).mul(smoothstep(1.0, 0.93, suv.x)).mul(smoothstep(0.0, 0.07, suv.y));
            // at a true crossing the ray is now on the surface; if it is still well behind, it only slid past an edge
            const thick = hi.mul(0.3).add(1.2);
            // and the pixel it lands on must be something solid: never the sky just above a tree line
            const landed = perspectiveDepthToViewZ(viewportDepthTexture(suv).r, cameraNear, cameraFar).greaterThan(cameraFar.mul(-0.9));
            const onSurface = smoothstep(thick, thick.mul(0.35), zAt(hi)).mul(landed.select(1.0, 0.0));
            hit.assign(vec3(suv, edge.mul(onSurface)));
        });
        // from high up there is too little on screen to reflect: fade to the sky alone
        return vec3(hit.xy, hit.z.mul(smoothstep(260.0, 90.0, cameraPosition.y)));
    });

    const color = Fn(() => {
        const ndv = saturate(dot(normal, V));
        const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(ndv), 5.0)));

        // what lies under the surface: the rendered seabed, displaced by the ripples
        const bend = normal.xz.mul(0.04).mul(smoothstep(0.0, 1.5, depth)).div(max(dist.mul(0.06), 1.0));
        const under = viewportSharedTexture(screenUV.add(bend)).rgb;
        const path = depth.div(max(V.y, 0.22)).add(depth);           // down and back up
        const absorb = exp(vec3(0.42, 0.075, 0.05).mul(path).negate());
        const amb = skyLookup(vec3(0.0, 1.0, 0.0)).mul(1.6).add(uSunColor.mul(max(uSunDir.y, 0.0)).mul(0.32));
        const body = mix(C('#0c3a40'), C('#0a3554'), open).mul(amb).mul(mix(1.0, 0.72, smoothstep(2.0, 30.0, depth)));
        // fine silt near river mouths and the lake shore makes shallow water milky green
        const murk = float(1).sub(exp(depth.mul(mix(0.34, 0.2, open)).negate()));
        const below = under.mul(absorb).add(body.mul(float(1).sub(absorb.g))).toVar();
        below.assign(mix(below, body.mul(1.25), murk.mul(0.35)));

        // sky in the surface
        const R = reflect(V.negate(), normal);
        const Rs = normalize(vec3(R.x, max(R.y, 0.0).add(0.015), R.z));
        const sky = skyLookup(Rs).toVar();
        const amb0 = skyLookup(vec3(0.0, 1.0, 0.0));
        sky.assign(mix(sky, C('#2c3a22').mul(amb0).mul(2.2), float(1).sub(open).mul(smoothstep(0.2, 0.04, Rs.y)).mul(0.92)));
        if (quality.post >= 2) { const m = mirror(); sky.assign(mix(sky, min(viewportSharedTexture(m.xy).rgb, sky.mul(3.0).add(0.2)), m.z.mul(0.9).mul(smoothstep(0.012, 0.05, ndv)))); }

        // sun glitter: wide at a distance where many facets average together
        const H = normalize(V.add(uSunDir));
        const rough = mix(0.035, 0.16, smoothstep(30.0, 2500.0, dist)).mul(mix(0.55, 1.0, open));
        const a2 = rough.mul(rough);
        const ndh = saturate(dot(normal, H));
        const dnm = ndh.mul(ndh).mul(a2.sub(1.0)).add(1.0);
        const D = a2.div(dnm.mul(dnm).mul(3.14159));
        const shadow = terrain.sunVisAt(xz);
        const glint = uSunColor.mul(min(D, 40.0)).mul(fres.mul(0.9).add(0.02)).mul(saturate(dot(normal, uSunDir)).add(0.05)).mul(shadow).mul(0.3).mul(mix(0.12, 1.0, open));

        const col = mix(below, sky, fres).add(glint).toVar();

        // foam: a lace at the waterline that breathes with the swell, and a few whitecaps offshore
        const surge = sin(t.mul(0.55).add(xz.x.mul(0.05)).add(xz.y.mul(0.031))).mul(0.5).add(0.5);
        const lace = smoothstep(0.62, 0.0, depth.sub(surge.mul(0.22))).mul(smoothstep(0.3, 0.62, s1.a.mul(0.6).add(s4.a.mul(0.4)).add(surge.mul(0.12))));
        const caps = smoothstep(0.83, 0.93, s2.b.mul(0.55).add(s1.a.mul(0.45))).mul(open).mul(smoothstep(4.0, 12.0, depth)).mul(0.5);
        const foam = saturate(lace.mul(mix(0.06, 1.0, open)).add(caps));
        const foamCol = amb.mul(0.85).add(uSunColor.mul(max(uSunDir.y, 0.0)).mul(0.28).mul(shadow));
        col.assign(mix(col, foamCol, foam.mul(0.9)));

        // no hard line where water meets land
        const edge = smoothstep(0.0, 0.16, depth);
        return vec4(mix(under, col, edge), 1.0);
    })();

    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    mat.colorNode = color;
    mat.fog = true;

    const R = 9000;
    const geo = new THREE.PlaneGeometry(2 * R, 2 * R, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.name = 'water';
    const update = (camera) => { mesh.position.set(camera.position.x, 0, camera.position.z); };
    return { mesh, update, material: mat };
}
