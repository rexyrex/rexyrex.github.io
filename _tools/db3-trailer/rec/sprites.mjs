#!/usr/bin/env node
// Exports Deadly Balloons 3's procedural sprites (balloons with faces, bosses,
// power-up icons, the ship) from the running game's texture atlases.
//   node sprites.mjs <site balloon dir> <trailer asset dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { open } from './cdp.mjs';

const [siteDir, trailerDir] = process.argv.slice(2).map((p) => resolve(p));
mkdirSync(siteDir, { recursive: true });
mkdirSync(trailerDir, { recursive: true });
const b = await open({ width: 1280, height: 800 });
await b.goto('http://localhost:8123/deadlyBalloons/play/?nopause', '!!(window.db3 && window.db3.renderer && window.db3.renderer.atlas)');
const out = await b.evaluate(`(() => {
  const R = db3.renderer, a = R.atlas, ba = R.bossAtlas;
  const crop = (t, scale = 1) => {
    const src = t.source.resource; const f = t.frame;
    const c = document.createElement('canvas'); c.width = Math.round(f.width * scale); c.height = Math.round(f.height * scale);
    c.getContext('2d').drawImage(src, f.x, f.y, f.width, f.height, 0, 0, c.width, c.height); return c;
  };
  const stack = (...ts) => { const base = crop(ts[0]); const g = base.getContext('2d'); for (const t of ts.slice(1)) g.drawImage(crop(t), 0, 0); return base; };
  const res = {};
  const site = [[0,'angry'],[4,'armor'],[3,'spikes'],[0,'skull'],[2,'gift'],[7,'seams'],[1,'angry'],[5,'visor'],[3,'dots'],[6,'stripes']];
  site.forEach(([c, look], i) => { res['site/b' + i + '.webp'] = stack(a.balloons[c], a.looks[look]).toDataURL('image/webp', 0.92); });
  site.forEach(([c, look], i) => { res['trailer/balloon-' + i + '.png'] = stack(a.balloons[c], a.looks[look]).toDataURL('image/png'); });
  for (let c = 0; c < 8; c++) res['trailer/plain-' + c + '.png'] = crop(a.balloons[c]).toDataURL('image/png');
  const HATS = { kingGumball: 'crown', rexyrex: 'spines', queen: 'tiara' };
  for (const kind of Object.keys(ba.body)) {
    const body = crop(ba.body[kind]); const face = crop(ba.face[kind]);
    const hatName = HATS[kind]; const hat = hatName ? crop(ba.hats[hatName]) : null;
    const pad = hat ? hat.height : 0;
    const c = document.createElement('canvas'); c.width = Math.max(body.width, hat ? hat.width : 0); c.height = body.height + pad;
    const g = c.getContext('2d'); const ox = (c.width - body.width) / 2;
    g.drawImage(body, ox, pad); g.drawImage(face, ox, pad);
    if (hat) { const r = ba.radiusPx; const cy = pad + body.height * a.balloonAnchorY; const top = cy - r * (100 / 92) + r * 0.08; g.drawImage(hat, c.width / 2 - hat.width / 2, top - hat.height); }
    res['trailer/boss-' + kind + '.png'] = c.toDataURL('image/png');
  }
  for (const k of Object.keys(a.icons)) res['trailer/icon-' + k + '.png'] = crop(a.icons[k], 2).toDataURL('image/png');
  res['trailer/capsule.png'] = crop(a.capsule, 2).toDataURL('image/png');
  res['trailer/ship.png'] = crop(a.ship, 3).toDataURL('image/png');
  const sizes = {}; for (const k in res) sizes[k] = res[k].length;
  return { res, sizes, colors: [0xff4d6d,0xff8c42,0xffd23f,0xff5fd2,0xa66bff,0x4da3ff,0x3ee0c0,0x9be34b] };
})()`);
for (const [k, url] of Object.entries(out.res)) {
  const [where, name] = k.split('/');
  writeFileSync(resolve(where === 'site' ? siteDir : trailerDir, name), Buffer.from(url.split(',')[1], 'base64'));
}
console.log(Object.keys(out.res).length, 'sprites');
b.close();
