import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceExtension } from '../../src/modules/extensions/workspace';
import type { SettingsTemplateHost } from '../../src/platform/settings-snapshot-templates';
import type { MainTemplatePlugin } from '../../src/toolkit/main';
import { createSettingsTemplateCatalog } from '../../src/settings-snapshots/catalog';
import type {
  SettingsAdapter,
  SettingsCryptoContext,
  SettingsDocument,
  SettingsOperationContext,
  SettingsSection,
  SettingState,
} from '../../src/settings-snapshots/contracts';
import { sameSettingState } from '../../src/settings-snapshots/document';
import { SettingsSnapshotService, settingsChangeID } from '../../src/settings-snapshots/service';
import {
  prepareWorkspacePreferences,
  restoreWorkspacePreferences,
} from '../../src/settings-snapshots/workspace-preferences';

const host = vi.hoisted(() => ({
  plugins: [] as MainTemplatePlugin[],
  preferences: new Map<string, SettingState>(),
  files: new Map<string, string>(),
  liveKeys: new Set<string>(),
  refused: new Set<string>(),
  invalidate: undefined as (() => void) | undefined,
}));
vi.mock('../../src/toolkit/main', () => ({ assertCustomExtraKey: () => {} }));
vi.mock('../../src/settings-snapshots/registry', () => ({ createSettingsAdapters: () => [] }));
vi.mock('../../src/platform/settings-snapshot-templates', async () => {
  // Vitest hoists the mock factory above ordinary static bindings.
  const { createHash } = await import('node:crypto');
  return {
    MAX_TEMPLATE_BYTES: 512 * 1024,
    settingsTemplateHost: {
      digest: (id) => createHash('sha256').update(id).digest('hex'),
      plugins: async () => host.plugins,
      preferenceType: (key) =>
        key.endsWith('.enabled') ? 'boolean' : key.endsWith('.count') ? 'number' : 'string',
      defaultPreferenceType: (key) => (key.endsWith('.enabled') ? 'boolean' : null),
      scanBindings: async () => host.liveKeys,
      readPreference: (key) => host.preferences.get(key) ?? { kind: 'reset' },
      writePreference: (key, state, admit) => {
        admit();
        if (host.refused.has(key)) throw new Error('Native preference writer rejected the change');
        host.preferences.set(key, state);
        return 'exact';
      },
      readFiles: async () => [...host.files].map(([name, text]) => ({ name, text })),
      writeFile: async (name, text) => void host.files.set(name, text),
      observePlugins: (invalidate) => {
        host.invalidate = invalidate;
        return () => void (host.invalidate = undefined);
      },
    } satisfies SettingsTemplateHost,
  };
});

const set = (value: boolean | number | string): SettingState => ({ kind: 'set', value });
const adapterID = (name: string) =>
  `plugin-${createHash('sha256').update(`${name}@test`).digest('hex')}`;
const context = (container: 'json' | 'age' = 'json'): SettingsCryptoContext => ({
  window: {} as Window,
  signal: new AbortController().signal,
  isCurrent: () => true,
  container,
});
const plugin = (name: string): MainTemplatePlugin => ({
  id: `${name}@test`,
  label: name,
  version: '1.0',
  available: true,
  defaults: [
    {
      source: 'prefs.js',
      text: `pref("extensions.${name}.enabled", true);
      pref("extensions.${name}.count", 5);
      pref("extensions.${name}.mode", "ordinary");
      pref("extensions.${name}.token", "");
      pref("extensions.${name}.path", "");`,
    },
  ],
  panes: [
    {
      source: 'preferences.xhtml',
      text: `<checkbox preference="extensions.${name}.enabled"/>
      <input type="number" data-preference="extensions.${name}.count" min="1" max="10"/>
      <input data-preference="extensions.${name}.mode"/>
      <input type="password" data-preference="extensions.${name}.token"/>
      <input data-preference="extensions.${name}.path"/>`,
    },
  ],
  issues: [],
});
const extension = (name: string, overrides?: Partial<WorkspaceExtension>): WorkspaceExtension => ({
  addonId: `${name}@test`,
  name,
  version: '1.0',
  enabled: true,
  source: null,
  ...overrides,
});
const section = (id: string, values: Record<string, SettingState>): SettingsSection => ({
  adapterID: id,
  schemaVersion: 1,
  sourceVersion: '1.0',
  entries: Object.entries(values).map(([key, state]) => ({ key, state })),
});
const documentFor = (
  sections: readonly SettingsSection[],
  addons: readonly WorkspaceExtension[],
): SettingsDocument => ({
  format: 'zotero-neo-settings',
  schemaVersion: 1,
  createdAt: '2026-11-17T00:00:00Z',
  producer: { name: 'Zotero Neo', version: '1.0' },
  zoteroVersion: '10',
  extensions: { version: 1, addons },
  sections,
});
const neo: SettingsAdapter = {
  id: 'zotero-neo',
  schemaVersion: 1,
  label: 'Neo',
  sourceVersion: '1.0',
  capture: async () => ({ section: section('zotero-neo', {}), issues: [] }),
  async plan(input) {
    const changes = [];
    for (const { key, state: after } of input.entries) {
      const before = host.preferences.get(key) ?? { kind: 'reset' as const };
      if (!sameSettingState(before, after))
        changes.push({
          adapterID: this.id,
          key,
          before,
          after,
          label: key,
          category: this.label,
          secret: false,
          selected: true,
          requiresRestart: false,
        });
    }
    return { adapterID: this.id, sourceVersion: this.sourceVersion, changes, issues: [] };
  },
  async apply(changes) {
    return changes.map(({ key, after }) => {
      host.preferences.set(key, after);
      return { adapterID: this.id, key, status: 'applied' };
    });
  },
};
function setup() {
  const catalog = createSettingsTemplateCatalog(() => '1.0');
  const service = new SettingsSnapshotService(
    () => [neo, ...catalog.adapters],
    () => ({ neo: '1.0', zotero: '10' }),
  );
  return { catalog, service };
}

beforeEach(() => {
  host.plugins = [];
  host.files.clear();
  host.preferences.clear();
  host.liveKeys.clear();
  host.refused.clear();
  host.invalidate = undefined;
});

it('admits only selected declared fresh-install fields while missing, rejected, and drifted settings stay isolated', async () => {
  const { catalog, service } = setup();
  const operation = context();
  const existing = plugin('existing');
  host.plugins = [existing];
  const existingTemplate = await catalog.scan(existing.id, operation);
  await catalog.review(
    existing.id,
    existingTemplate.revision,
    [
      { key: 'extensions.existing.enabled', secret: false },
      { key: 'extensions.existing.count', secret: false },
    ],
    operation,
  );
  host.preferences.set('extensions.existing.count', set(5));
  const original = documentFor(
    [
      section(adapterID('missing'), { 'extensions.missing.enabled': set(false) }),
      section(adapterID('reject'), { 'extensions.reject.enabled': set(false) }),
      section(adapterID('fresh'), {
        'extensions.fresh.enabled': set(false),
        'extensions.fresh.count': set(100),
        'extensions.fresh.mode': set('not selected'),
        'extensions.fresh.path': set('a path'),
        'extensions.fresh.unknown': set('not declared'),
      }),
      section(adapterID('existing'), {
        'extensions.existing.enabled': set(false),
        'extensions.existing.count': set(7),
      }),
      section('zotero-neo', { appearance: set('compact') }),
    ],
    ['missing', 'reject', 'fresh', 'existing'].map((name) => extension(name)),
  );
  const preview = await prepareWorkspacePreferences(original, catalog, operation);
  const reviewed = await service.plan(preview.document, operation);
  expect(reviewed.plans.flatMap(({ changes }) => changes.map(({ key }) => key))).toEqual([
    'extensions.existing.enabled',
    'extensions.existing.count',
    'appearance',
  ]);
  expect(JSON.stringify(preview.deferred)).not.toContain('not selected');
  expect(JSON.stringify(preview.deferred)).not.toContain('not declared');
  expect(preview.deferred.map(({ key }) => key)).not.toContain('extensions.fresh.path');

  // Native lifecycle events invalidate every originally issued adapter, not the user's review baseline.
  host.plugins.push(plugin('fresh'), plugin('reject'));
  host.invalidate?.();
  host.preferences.set('extensions.existing.count', set(6));
  host.refused.add('extensions.reject.enabled');
  const selected = new Set([
    ...preview.deferred.filter(({ key }) => key !== 'extensions.fresh.mode').map(({ id }) => id),
    settingsChangeID(adapterID('existing'), 'extensions.existing.enabled'),
    settingsChangeID(adapterID('existing'), 'extensions.existing.count'),
    settingsChangeID('zotero-neo', 'appearance'),
  ]);
  const verifySource = vi.fn(async () => {
    expect(host.preferences.has('extensions.fresh.enabled')).toBe(false);
    expect(host.preferences.has('appearance')).toBe(false);
  });
  const result = await restoreWorkspacePreferences(
    original,
    catalog,
    service,
    reviewed,
    preview.deferred,
    selected,
    operation,
    verifySource,
  );
  expect(result.receipt?.entries).toMatchObject([
    { key: 'extensions.reject.enabled', status: 'failed' },
    { key: 'extensions.fresh.enabled', status: 'applied' },
    { key: 'extensions.existing.enabled', status: 'applied' },
    { key: 'appearance', status: 'applied' },
  ]);
  expect(result.skipped).toEqual(
    expect.arrayContaining([
      settingsChangeID(adapterID('missing'), 'extensions.missing.enabled'),
      settingsChangeID(adapterID('fresh'), 'extensions.fresh.count'),
      settingsChangeID(adapterID('fresh'), 'extensions.fresh.unknown'),
      settingsChangeID(adapterID('existing'), 'extensions.existing.count'),
    ]),
  );
  expect(verifySource).toHaveBeenCalledOnce();
  expect(host.preferences).toEqual(
    new Map([
      ['extensions.existing.count', set(6)],
      ['extensions.fresh.enabled', set(false)],
      ['extensions.existing.enabled', set(false)],
      ['appearance', set('compact')],
    ]),
  );
  expect(
    (await catalog.list(operation)).find(({ pluginID }) => pluginID === 'fresh@test')?.reviewedKeys,
  ).toEqual([]);
  catalog.dispose();
});

it('keeps credential names value-free, preserves sticky sensitivity on opt-in, and never treats JSON as encrypted', async () => {
  const { catalog, service } = setup();
  const encrypted = context('age');
  host.plugins = [plugin('vault')];
  const template = await catalog.scan('vault@test', encrypted);
  const mode = 'extensions.vault.mode';
  const token = 'extensions.vault.token';
  await catalog.review('vault@test', template.revision, [{ key: mode, secret: false }], encrypted);
  const original = documentFor(
    [
      section(adapterID('vault'), {
        [mode]: set('portable secret'),
        [token]: set('unchecked secret'),
      }),
    ],
    [extension('vault', { sensitiveKeys: [mode] })],
  );
  const plaintext = await prepareWorkspacePreferences(original, catalog, context());
  expect(plaintext.document.sections).toEqual([]);
  expect(plaintext.deferred).toEqual([]);
  const preview = await prepareWorkspacePreferences(original, catalog, encrypted);
  expect(preview.document.sections).toEqual([]);
  expect(preview.deferred).toMatchObject([
    { key: mode, secret: true },
    { key: token, secret: true },
  ]);
  expect(JSON.stringify(preview.deferred)).not.toContain('portable secret');
  const selected = new Set([settingsChangeID(adapterID('vault'), mode)]);
  const reviewed = await service.plan(preview.document, encrypted);
  await expect(
    restoreWorkspacePreferences(
      original,
      catalog,
      service,
      reviewed,
      preview.deferred,
      selected,
      encrypted,
      async () => {
        throw new Error('Source changed');
      },
    ),
  ).rejects.toThrow('Source changed');
  expect(host.preferences.has(mode)).toBe(false);
  expect(
    (await catalog.list(encrypted))
      .find(({ pluginID }) => pluginID === 'vault@test')
      ?.fields.find(({ key }) => key === mode)?.secret,
  ).toBe(false);

  await restoreWorkspacePreferences(
    original,
    catalog,
    service,
    reviewed,
    preview.deferred,
    selected,
    encrypted,
    async () => {},
  );
  expect(host.preferences).toEqual(new Map([[mode, set('portable secret')]]));
  const local = (await catalog.list(encrypted)).find(({ pluginID }) => pluginID === 'vault@test');
  expect(local?.fields.find(({ key }) => key === mode)?.secret).toBe(true);
  expect(local?.reviewedKeys).toEqual([mode]);
  catalog.dispose();
});

it('cannot promote absent-template metadata into a newly discovered secret or a pending or mismatched plugin', async () => {
  const { catalog, service } = setup();
  const operation = context('age');
  const original = documentFor(
    [
      section(adapterID('upgrade'), { 'extensions.upgrade.mode': set('must not write') }),
      section(adapterID('pending'), { 'extensions.pending.enabled': set(false) }),
      section(adapterID('wrong'), { 'extensions.wrong.enabled': set(false) }),
    ],
    ['upgrade', 'pending', 'wrong'].map((name) => extension(name)),
  );
  const preview = await prepareWorkspacePreferences(original, catalog, operation);
  const reviewed = await service.plan(preview.document, operation);
  const upgrade = plugin('upgrade');
  host.plugins = [
    {
      ...upgrade,
      panes: [
        {
          source: 'preferences.xhtml',
          text: '<input type="password" data-preference="extensions.upgrade.mode"/>',
        },
      ],
    },
    { ...plugin('pending'), available: false },
    { ...plugin('wrong'), version: '2.0' },
  ];
  host.invalidate?.();
  const selected = new Set(preview.deferred.map(({ id }) => id));
  expect(selected.size).toBe(3);
  expect(
    await restoreWorkspacePreferences(
      original,
      catalog,
      service,
      reviewed,
      preview.deferred,
      selected,
      operation,
      async () => {},
    ),
  ).toEqual({ skipped: [...selected] });
  expect(host.preferences.size).toBe(0);
  catalog.dispose();
});

it('uses the live binding gate for newly discovered short declarations rather than trusting key names', async () => {
  const { catalog, service } = setup();
  const operation = context();
  const key = 'extensions.zotero.short.enabled';
  host.plugins = [
    {
      ...plugin('short'),
      defaults: [{ source: 'prefs.js', text: 'pref("enabled", true);' }],
      panes: [{ source: 'preferences.xhtml', text: `<checkbox preference="${key}"/>` }],
      nativePreferenceKeys: [],
    },
  ];
  const original = documentFor(
    [section(adapterID('short'), { [key]: set(false) })],
    [extension('short')],
  );
  const preview = await prepareWorkspacePreferences(original, catalog, operation);
  const reviewed = await service.plan(preview.document, operation);
  const selected = new Set([settingsChangeID(adapterID('short'), key)]);
  expect(preview.deferred).toMatchObject([{ key }]);
  expect(
    await restoreWorkspacePreferences(
      original,
      catalog,
      service,
      reviewed,
      preview.deferred,
      selected,
      operation,
      async () => {},
    ),
  ).toEqual({ skipped: [...selected] });
  host.liveKeys.add(key);
  const result = await restoreWorkspacePreferences(
    original,
    catalog,
    service,
    reviewed,
    preview.deferred,
    selected,
    operation,
    async () => {},
  );
  expect(result.skipped).toEqual([]);
  expect(result.receipt?.entries).toMatchObject([{ key, status: 'applied' }]);
  expect(host.preferences.get(key)).toEqual(set(false));
  catalog.dispose();
});

it('captures only selected reviewed plugin credential metadata and only with explicit inventory capture', async () => {
  const { catalog } = setup();
  const operation = { ...context(), includeSecrets: false, includeLibrarySettings: false };
  host.plugins = [plugin('first'), plugin('ignored')];
  const mode = 'extensions.first.mode';
  for (const name of ['first', 'ignored']) {
    const local = await catalog.scan(`${name}@test`, operation);
    await catalog.review(
      local.pluginID,
      local.revision,
      [
        { key: `extensions.${name}.mode`, secret: true },
        { key: `extensions.${name}.enabled`, secret: false },
      ],
      operation,
    );
  }
  host.preferences.set(mode, set('local secret'));
  const capture = vi.fn(
    async (_context: SettingsOperationContext, local: ReadonlyMap<string, readonly string[]>) => ({
      version: 1 as const,
      addons: [
        extension('first', { sensitiveKeys: local.get('first@test') }),
        extension('ignored'),
      ],
    }),
  );
  const service = new SettingsSnapshotService(
    () => catalog.adapters,
    () => ({ neo: '1.0', zotero: '10' }),
    capture,
  );
  const selected = new Set([adapterID('first')]);
  expect((await service.capture(selected, operation)).document.extensions).toBeUndefined();
  expect(capture).not.toHaveBeenCalled();
  const result = await service.capture(selected, operation, { includeExtensions: true });
  expect(capture.mock.calls[0]?.[1]).toEqual(new Map([['first@test', [mode]]]));
  expect(result.document.extensions?.addons[0]?.sensitiveKeys).toEqual([mode]);
  expect(JSON.stringify(result.document)).not.toContain('local secret');
  expect(JSON.stringify(result.document)).not.toContain('extensions.first.token');
  expect(JSON.stringify(result.document)).not.toContain('extensions.ignored.mode');
  catalog.dispose();
});
