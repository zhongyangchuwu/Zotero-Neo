import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
const inventory = vi.hoisted(() => [
  { id: 'sample@test', name: 'Sample', version: '1.0', enabled: true, pendingRestart: false },
]);
vi.mock('../../src/toolkit/main/plugins', () => ({ mainInstalledPlugins: async () => inventory }));
import {
  mainSettingsTemplatePlugins,
  mainSettingsTemplateDigest,
} from '../../src/toolkit/main/settings-snapshot-templates';
const HostTextEncoder = TextEncoder,
  HostTextDecoder = TextDecoder,
  HostResponse = Response;

let root: string;
let paneSource: string;
let compatible: boolean;
let nativeSource: string;
let request: Mock<(url: string) => Promise<Response>>;
beforeEach(() => {
  root = 'file:///owned/plugin/';
  paneSource = 'preferences.xhtml';
  compatible = true;
  nativeSource = `
    /* Concatenated Firefox defaults and native Zotero defaults. */
    pref("browser.example", true);
    pref("extensions.zotero.purge.items", true);
    pref(
      'extensions.zotero.cite.useCiteprocRs',
      (() => { throw new Error("Native values must never execute"); })(),
    );
    // pref("extensions.zotero.ZoteroPDFTranslate.enableAuto", false);
    pref("extensions.zotero.commentText", "/* pref('fake', true) */");
  `;
  const readValue = vi.fn(() => {
    throw new Error('Scanner must not read user preferences');
  });
  const addon = {
    id: 'sample@test',
    get isCompatible() {
      return compatible;
    },
    appDisabled: false,
    getResourceURI: (path: string) => ({ spec: root + path }),
  };
  vi.stubGlobal('ChromeUtils', {
    importESModule: () => ({ AddonManager: { getAddonByID: async () => addon } }),
  });
  vi.stubGlobal('Services', {
    io: { newURI: (spec: string) => ({ spec, scheme: spec.split(':')[0] }) },
    prefs: { getStringPref: readValue, getBoolPref: readValue, getIntPref: readValue },
  });
  const preferences = new HostResponse('pref("extensions.sample.enabled", true);');
  const pane = new HostResponse(
    '<checkbox preference="extensions.sample.enabled"/><script src="https://foreign.invalid/code.js">throw new Error("Must not execute")</script>',
  );
  const missing = new HostResponse('', { status: 404 });
  request = vi.fn(async (url: string) => {
    if (url === 'resource://app/defaults/preferences/zotero.js')
      return new HostResponse(nativeSource);
    if (url === root + 'prefs.js') return preferences;
    if (url === root + 'preferences.xhtml') return pane;
    return missing;
  });
  vi.stubGlobal('Components', {
    interfaces: { nsICryptoHash: {} },
    classes: {
      '@mozilla.org/security/hash;1': {
        createInstance: () => {
          const hash = createHash('sha256');
          return {
            SHA256: 1,
            init: () => {},
            update: (bytes: Uint8Array) => hash.update(bytes),
            finish: () => hash.digest().toString('latin1'),
          };
        },
      },
    },
  });
  const mainWindow = { TextEncoder: HostTextEncoder, TextDecoder: HostTextDecoder, fetch: request };
  vi.stubGlobal('Zotero', {
    getMainWindow: () => mainWindow,
    PreferencePanes: {
      get pluginPanes() {
        return [{ pluginID: 'sample@test', src: paneSource }];
      },
    },
  });
  // Model Bootstrap: capabilities exist only on the named native Main window.
  vi.stubGlobal('fetch', undefined);
  vi.stubGlobal('TextEncoder', undefined);
  vi.stubGlobal('TextDecoder', undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('installed plugin bundled template source boundary', () => {
  it('hashes exact UTF-8 identity through the live Main window without global DOM constructors', () => {
    const id = 'Plugin-插件@Example.test';
    expect(mainSettingsTemplateDigest(id)).toBe(createHash('sha256').update(id).digest('hex'));
    expect(mainSettingsTemplateDigest(id)).not.toBe(mainSettingsTemplateDigest(id.toLowerCase()));
  });

  it('reads only bundled defaults and registered inert markup, resolving relative sources locally', async () => {
    const [plugin] = await mainSettingsTemplatePlugins();
    expect(plugin).toMatchObject({ id: 'sample@test', version: '1.0', available: true });
    expect(plugin!.panes[0]!.source).toBe('preferences.xhtml');
    expect(plugin!.panes[0]!.text).toContain('Must not execute');
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      'resource://app/defaults/preferences/zotero.js',
      root + 'prefs.js',
      root + 'defaults/preferences/prefs.js',
      root + 'preferences.xhtml',
    ]);
  });

  it('derives exact native ownership from app defaults independently of exportable snapshot fields', async () => {
    const [plugin] = await mainSettingsTemplatePlugins();
    expect(plugin!.nativePreferenceKeys).toEqual([
      'browser.example',
      'extensions.zotero.cite.useCiteprocRs',
      'extensions.zotero.commentText',
      'extensions.zotero.purge.items',
    ]);
    expect(plugin!.nativePreferenceKeys).not.toContain(
      'extensions.zotero.ZoteroPDFTranslate.enableAuto',
    );
    expect(request.mock.calls.some(([url]) => url.startsWith('resource://gre/'))).toBe(false);
  });

  it.each([
    '',
    'pref("extensions.zotero.purge.items", true); pref(prefix + ".native", false);',
    '/* too large */' + ' '.repeat(512 * 1024),
  ])(
    'leaves native ownership unavailable when bounded exact inventory cannot be established',
    async (source) => {
      nativeSource = source;
      const [plugin] = await mainSettingsTemplatePlugins();
      expect(plugin!.nativePreferenceKeys).toBeNull();
      expect(plugin!.issues.join(' ')).toContain('ownership inventory is unavailable');
    },
  );

  it('keeps ownership unavailable if the fixed app resource cannot be fetched', async () => {
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (url) => {
      if (url === 'resource://app/defaults/preferences/zotero.js') throw new Error('NetworkError');
      return original(url);
    });
    const [plugin] = await mainSettingsTemplatePlugins();
    expect(plugin!.nativePreferenceKeys).toBeNull();
    expect(plugin!.defaults).toHaveLength(1);
  });

  it.each([
    'https://foreign.invalid/pane.xhtml',
    'file:///owned/other/pane.xhtml',
    'file:///owned/plugin/%2e%2e/other.xhtml',
  ])('rejects foreign or traversal pane sources without loading them: %s', async (source) => {
    paneSource = source;
    const [plugin] = await mainSettingsTemplatePlugins();
    expect(plugin!.panes).toEqual([]);
    expect(plugin!.issues.join(' ')).toContain('not a local owned bundle source');
    expect(request.mock.calls.some(([url]) => url === source)).toBe(false);
  });

  it('does not load network-backed jar roots even when supplied as bundle metadata', async () => {
    root = 'jar:https://foreign.invalid/plugin.xpi!/';
    const [plugin] = await mainSettingsTemplatePlugins();
    expect(plugin!.panes).toEqual([]);
    expect(plugin!.defaults).toEqual([]);
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      'resource://app/defaults/preferences/zotero.js',
    ]);
  });

  it('keeps incompatible plugin defaults as ownership evidence but never admits its template', async () => {
    compatible = false;
    const [plugin] = await mainSettingsTemplatePlugins();
    expect(plugin!.available).toBe(false);
    expect(plugin!.defaults).toHaveLength(1);
  });
});
