import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { listZipMembers } from './zip.mjs';

const root = resolve(import.meta.dirname, '..');
const archive = resolve(root, 'zotero-neo.xpi');
const members = listZipMembers(archive);
const expected = [
  'bootstrap.js',
  'content/preferences/pane.js',
  'content/preferences/pane.xhtml',
  'content/zotero-neo.js',
  'icons/icon-128x128.png',
  'icons/icon-16x16.png',
  'icons/icon-256x256.png',
  'icons/icon-32x32.png',
  'icons/icon-48x48.png',
  'icons/icon-64x64.png',
  'icons/icon-96x96.png',
  'manifest.json',
].sort();

const sortedMembers = [...members].sort();
if (JSON.stringify(sortedMembers) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected XPI members:\n${sortedMembers.join('\n')}`);
}
for (const member of members) {
  if (member.includes('\\')) throw new Error(`Backslash in XPI member: ${member}`);
  if (/^(?:src|tests|node_modules|build)\//.test(member)) {
    throw new Error(`Development file packaged: ${member}`);
  }
  if (member.endsWith('.map') || member.endsWith('.ts')) {
    throw new Error(`Source artifact packaged: ${member}`);
  }
}

const manifest = JSON.parse(readFileSync(resolve(root, 'build/addon/manifest.json'), 'utf8'));
if (manifest.applications?.zotero?.id !== 'zotero-neo@zotero-neo') {
  throw new Error('Packaged manifest has the wrong extension ID');
}

for (const script of ['bootstrap.js', 'content/zotero-neo.js', 'content/preferences/pane.js']) {
  const source = readFileSync(resolve(root, 'build/addon', script), 'utf8');
  if (/^\s*(?:import|export)\s/m.test(source)) {
    throw new Error(`Unbundled module syntax in ${script}`);
  }
}

console.log(`[package] OK — ${members.length} deterministic POSIX-path members`);
