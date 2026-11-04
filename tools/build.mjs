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
cpSync(resolve(root, 'LICENSE'), resolve(buildRoot, 'LICENSE'));
const licenseDirectory = resolve(buildRoot, 'licenses');
mkdirSync(licenseDirectory, { recursive: true });
cpSync(resolve(root, 'vendor/fuzzysort/LICENSE'), resolve(licenseDirectory, 'fuzzysort-LICENSE'));
for (const name of ['ai-sdk', 'react']) {
  cpSync(resolve(root, `vendor/${name}/NOTICE`), resolve(licenseDirectory, `${name}-NOTICE`));
  cpSync(
    resolve(root, `vendor/${name}/provenance.json`),
    resolve(licenseDirectory, `${name}-provenance.json`),
  );
}
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

for (const [entry, output] of [
  ['src/ai/runtime.ts', 'content/ai-runtime.js'],
  ['src/ai-qa/ui/index.tsx', 'content/ai-qa-ui.js'],
]) {
  await build({
    ...common,
    entryPoints: [resolve(root, entry)],
    outfile: resolve(buildRoot, output),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
}

zipDirectory(buildRoot, outputXpi);
console.log(`Built ${outputXpi}`);
