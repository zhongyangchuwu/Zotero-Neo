import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { listZipMembers, readZipMember } from './zip.mjs';

const root = resolve(import.meta.dirname, '..');
const archive = resolve(root, 'zotero-neo.xpi');
const members = listZipMembers(archive);
const expected = [
  'LICENSE',
  'bootstrap.js',
  'content/ai-runtime.js',
  'content/ai-qa-ui.js',
  'content/ai-qa-window.xhtml',
  'content/literature-table-window.xhtml',
  'content/literature-ui.js',
  'content/native-ui.js',
  'content/react-runtime.js',
  'content/settings-snapshots-crypto.js',
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
  'licenses/fuzzysort-LICENSE',
  'licenses/ai-sdk-NOTICE',
  'licenses/ai-sdk-provenance.json',
  'licenses/react-NOTICE',
  'licenses/react-provenance.json',
  'licenses/age-encryption-NOTICE',
  'licenses/age-encryption-provenance.json',
  'licenses/base-ui-NOTICE',
  'licenses/base-ui-provenance.json',
  'locale/en-US/zotero-neo-ai-qa.ftl',
  'locale/zh-CN/zotero-neo-ai-qa.ftl',
  'manifest.json',
].sort();

const sortedMembers = [...members].sort();
if (JSON.stringify(sortedMembers) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected XPI members:\n${sortedMembers.join('\n')}`);
}
for (const member of members) {
  if (member.includes('\\')) throw new Error(`Backslash in XPI member: ${member}`);
  if (/^(?:src|tests|node_modules|vendor|build)\//.test(member)) {
    throw new Error(`Development file packaged: ${member}`);
  }
  if (member.endsWith('.map') || member.endsWith('.ts')) {
    throw new Error(`Source artifact packaged: ${member}`);
  }
}
for (const [member, source] of [
  ['LICENSE', resolve(root, 'LICENSE')],
  ['licenses/fuzzysort-LICENSE', resolve(root, 'vendor/fuzzysort/LICENSE')],
  ['licenses/ai-sdk-NOTICE', resolve(root, 'vendor/ai-sdk/NOTICE')],
  ['licenses/ai-sdk-provenance.json', resolve(root, 'vendor/ai-sdk/provenance.json')],
  ['licenses/react-NOTICE', resolve(root, 'vendor/react/NOTICE')],
  ['licenses/react-provenance.json', resolve(root, 'vendor/react/provenance.json')],
  ['licenses/age-encryption-NOTICE', resolve(root, 'vendor/age-encryption/NOTICE')],
  [
    'licenses/age-encryption-provenance.json',
    resolve(root, 'vendor/age-encryption/provenance.json'),
  ],
  ['licenses/base-ui-NOTICE', resolve(root, 'vendor/base-ui/NOTICE')],
  ['licenses/base-ui-provenance.json', resolve(root, 'vendor/base-ui/provenance.json')],
]) {
  if (!readZipMember(archive, member).equals(readFileSync(source))) {
    throw new Error(`Packaged license notice differs from authoritative source: ${member}`);
  }
}

const manifest = JSON.parse(readFileSync(resolve(root, 'build/addon/manifest.json'), 'utf8'));
if (manifest.applications?.zotero?.id !== 'zotero-neo@zotero-neo') {
  throw new Error('Packaged manifest has the wrong extension ID');
}

for (const script of [
  'bootstrap.js',
  'content/zotero-neo.js',
  'content/preferences/pane.js',
  'content/ai-runtime.js',
  'content/ai-qa-ui.js',
  'content/native-ui.js',
  'content/literature-ui.js',
  'content/react-runtime.js',
  'content/settings-snapshots-crypto.js',
]) {
  const source = readFileSync(resolve(root, 'build/addon', script), 'utf8');
  if (/^\s*(?:import|export)\s/m.test(source)) {
    throw new Error(`Unbundled module syntax in ${script}`);
  }
  if (
    script === 'content/settings-snapshots-crypto.js' &&
    /\b(?:importScripts|eval)\s*\(|\bimport\s*\(/u.test(source)
  ) {
    throw new Error(
      'Settings crypto worker must be statically bundled without dynamic code loading',
    );
  }
}

console.log(`[package] OK — ${members.length} deterministic POSIX-path members`);

const adapterArchive = resolve(root, 'build/zotero-neo-translate.xpi');
const adapterMembers = listZipMembers(adapterArchive).sort();
if (adapterMembers.join(',') !== 'LICENSE,bootstrap.js,manifest.json') {
  throw new Error(`Unexpected Translate Adapter XPI members: ${adapterMembers.join(', ')}`);
}
const adapterManifest = JSON.parse(readZipMember(adapterArchive, 'manifest.json').toString('utf8'));
const adapterId = 'zotero-neo-translate@zotero-neo';
const adapterFeedPath = 'adapters/translate/updates.json';
const adapterFeedUrl = `https://raw.githubusercontent.com/zhongyangchuwu/Zotero-Neo/main/${adapterFeedPath}`;
const adapterFeed = JSON.parse(readFileSync(resolve(root, adapterFeedPath), 'utf8'));
if (
  adapterManifest.applications?.zotero?.id !== adapterId ||
  adapterManifest.browser_specific_settings?.gecko?.id !== adapterId ||
  adapterManifest.applications?.zotero?.update_url !== adapterFeedUrl ||
  adapterManifest.browser_specific_settings?.gecko?.update_url !== adapterFeedUrl ||
  !Array.isArray(adapterFeed.addons?.[adapterId]?.updates)
) {
  throw new Error('Packaged Translate Adapter has an invalid extension ID or update feed');
}
console.log(
  `[package] OK — Translate Adapter is a separate XPI (${adapterMembers.length} members)`,
);
