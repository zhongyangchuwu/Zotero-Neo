import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function extractFlatObject(source, startPattern, endPattern, pairPattern) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) throw new Error(`Object start not found: ${startPattern}`);
  let end = -1;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (endPattern.test(lines[index])) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error(`Object end not found: ${endPattern}`);

  const object = {};
  for (const match of lines.slice(start, end).join('\n').matchAll(pairPattern)) {
    object[match[1]] = match[2];
  }
  return object;
}

function controllerMethods(source) {
  return [...source.matchAll(/^  (?:async )?([A-Za-z_$][A-Za-z0-9_$]*)\([^\n]*\) \{/gm)].map(
    (match) => match[1],
  );
}

const core = read('content/core.js');
const reader = read('content/reader.js');
const main = read('content/main.js');
const preferences = read('content/preferences/pane.js');
const i18n = read('content/preferences/i18n.js');
const manifest = JSON.parse(read('manifest.json'));
const xpi = readFileSync(resolve(root, 'zotero-neo.xpi'));

const bindings = extractFlatObject(
  core,
  /DEFAULT_BINDINGS\s*:\s*\{/,
  /^\s*\},\s*$/,
  /'([^']+)'\s*:\s*'([^']+)'/g,
);
const actionLabels = extractFlatObject(
  preferences,
  /ZV_ACTION_LABELS\s*=\s*\{/,
  /^\s*\};\s*$/,
  /^\s*(\w+)\s*:\s*"([^"]+)"/gm,
);
const zhActionLabels = extractFlatObject(
  i18n,
  /ZV_I18N_ACTION_LABELS\s*=\s*\{/,
  /^\s*\};\s*$/,
  /^\s*(\w+)\s*:\s*"([^"]+)"/gm,
);

const contract = {
  capturedAt: '2026-09-08',
  identity: {
    id: manifest.applications.zotero.id,
    version: manifest.version,
    preferencePrefix: 'extensions.zotero-neo',
    paneId: 'zotero-neo-prefs',
    controller: 'ZoteroNeo',
    xpi: 'zotero-neo.xpi',
  },
  build: {
    sha256: createHash('sha256').update(xpi).digest('hex'),
    members: execFileSync('unzip', ['-Z1', resolve(root, 'zotero-neo.xpi')], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n'),
  },
  lifecycleFunctions: [
    'install',
    'startup',
    'onMainWindowLoad',
    'onMainWindowUnload',
    'shutdown',
    'uninstall',
  ],
  preferences: {
    bindings: '',
    language: 'en',
    'mode.visual.enabled': true,
    'mode.insert.enabled': true,
    'noteEditor.enabled': true,
    'marks.persist': false,
    'scroll.mode': 'follow',
    scrollStep: 60,
    'smoothScroll.followSpeed': 2000,
    'smoothScroll.initialSpeed': 2000,
    'smoothScroll.maxSpeed': 2000,
    'smoothScroll.acceleration': 2600,
    'smoothScroll.deceleration': 4200,
    'smoothScroll.stopOnRelease': false,
    defaultHighlightColor: 'yellow',
  },
  persistence: {
    markPayloadVersion: 1,
    markExtraPrefix: 'zv-marks-<attachment-key>: ',
  },
  counts: {
    bindings: Object.keys(bindings).length,
    actionLabels: Object.keys(actionLabels).length,
    zhActionLabels: Object.keys(zhActionLabels).length,
    coreMethods: controllerMethods(core).length,
    readerMethods: controllerMethods(reader).length,
    mainMethods: controllerMethods(main).length,
  },
  bindings,
  actionLabels,
  zhActionLabels,
  controllerMethods: {
    core: controllerMethods(core),
    reader: controllerMethods(reader),
    main: controllerMethods(main),
  },
};

const output = resolve(root, 'tests/fixtures/legacy-contract.json');
writeFileSync(output, `${JSON.stringify(contract, null, 2)}\n`);
console.log(`Captured legacy contract: ${output}`);
console.log(JSON.stringify(contract.counts));
