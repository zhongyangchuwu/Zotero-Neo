import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

import { zipDirectory } from './zip.mjs';

const root = resolve(import.meta.dirname, '..');
const packageAssets = resolve(root, 'assets/package');
const buildRoot = resolve(root, 'build/addon');
const outputXpi = resolve(root, 'zotero-neo.xpi');

rmSync(resolve(root, 'build'), { recursive: true, force: true });
rmSync(outputXpi, { force: true });
mkdirSync(buildRoot, { recursive: true });
cpSync(packageAssets, buildRoot, { recursive: true });
cpSync(resolve(root, 'manifest.json'), resolve(buildRoot, 'manifest.json'));

const common = {
  target: ['firefox115'],
  charset: 'utf8',
  legalComments: 'none',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: [resolve(root, 'src/bootstrap.ts')],
  outfile: resolve(buildRoot, 'bootstrap.js'),
  bundle: false,
});

await build({
  ...common,
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: resolve(buildRoot, 'content/zotero-neo.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
});

await build({
  ...common,
  entryPoints: [resolve(root, 'src/preferences/index.ts')],
  outfile: resolve(buildRoot, 'content/preferences/pane.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
});

zipDirectory(buildRoot, outputXpi);
console.log(`Built ${outputXpi}`);
