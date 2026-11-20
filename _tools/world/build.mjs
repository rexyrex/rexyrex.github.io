#!/usr/bin/env node
/* Bundles _tools/world/src/main.js (and three.js) into /js/world.js.
       cd _tools/world && npm install && npm run build
   --dev writes an unminified bundle with an inline source map. */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const out = resolve(here, '../../js/world.js');
await build({
    entryPoints: [resolve(here, 'src/main.js')],
    outfile: out,
    bundle: true,
    format: 'esm',
    target: ['es2022'],
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    legalComments: 'none',
    banner: { js: '/* rexyrex.github.io island — built from _tools/world/src by _tools/world/build.mjs. three.js (MIT) is bundled. */' },
    logLevel: 'warning',
});
const raw = statSync(out).size;
const gz = gzipSync(readFileSync(out)).length;
console.log(`js/world.js  ${(raw / 1024).toFixed(0)} KB  (${(gz / 1024).toFixed(0)} KB gzip)${dev ? '  [dev]' : ''}`);
