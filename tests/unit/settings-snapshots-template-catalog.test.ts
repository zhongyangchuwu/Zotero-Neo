import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SettingsOperationContext,
  SettingsValue,
  SettingState,
} from '../../src/settings-snapshots/contracts';
import type { MainTemplatePlugin } from '../../src/toolkit/main';

const state = vi.hoisted(() => ({
  plugins: [] as MainTemplatePlugin[],
  files: new Map<string, string>(),
  preferences: new Map<string, SettingState>(),
  reads: 0,
  writes: [] as string[],
  persistWrites: true,
  invalidate: undefined as (() => void) | undefined,
  liveKeys: new Set<string>(),
}));
vi.mock('../../src/settings-snapshots/registry', () => ({
  createSettingsAdapters: () => [
    { id: 'zotero', label: 'Zotero', sourceVersion: '9.0', schemaVersion: 1 },
    { id: 'zotero-neo', label: 'Neo', sourceVersion: '1.0', schemaVersion: 1 },
  ],
}));
vi.mock('../../src/platform/settings-snapshot-templates', async () => {
  const { createHash } = await import('node:crypto');
  return {
    MAX_TEMPLATE_BYTES: 512 * 1024,
    settingsTemplateHost: {
      digest: (text: string) => createHash('sha256').update(text).digest('hex'),
      // node:crypto loads inside this hoisted mock because ordinary static bindings are not initialized yet.
      plugins: vi.fn(async () => state.plugins),
      scanBindings: async () => new Set(state.liveKeys),
      preferenceType: (key: string) => (key.endsWith('.enabled') ? 'boolean' : 'string'),
      defaultPreferenceType: (key: string) => (key.endsWith('.enabled') ? 'boolean' : null),
      readPreference: (key: string) => {
        state.reads++;
        return state.preferences.get(key) ?? { kind: 'reset' };
      },
      writePreference: (key: string, value: SettingState, admit: () => void) => {
        admit();
        state.writes.push(key);
        if (state.persistWrites) state.preferences.set(key, value);
        return 'exact';
      },
      readFiles: async () => [...state.files].map(([name, text]) => ({ name, text })),
      writeFile: async (name: string, text: string, context: SettingsOperationContext) => {
        if (context.signal.aborted || !context.isCurrent()) throw new Error('cancelled');
        state.files.set(name, text);
      },
      observePlugins: (invalidate: () => void) => {
        state.invalidate = invalidate;
        return () => {
          state.invalidate = undefined;
        };
      },
    },
  };
});
import { createSettingsTemplateCatalog } from '../../src/settings-snapshots/catalog';
import { settingsTemplateHost } from '../../src/platform/settings-snapshot-templates';
import { SettingsSnapshotService, settingsChangeID } from '../../src/settings-snapshots/service';

const context = (): SettingsOperationContext => ({
  signal: new AbortController().signal,
  isCurrent: () => true,
  container: 'age',
});
const key = 'extensions.sample.enabled',
  token = 'extensions.sample.token',
  bland = 'extensions.sample.displayMode';
function plugin(id = 'sample@test', prefix = 'sample'): MainTemplatePlugin {
  return {
    id,
    label: 'Sample',
    version: '1.0',
    available: true,
    defaults: [
      {
        source: 'prefs.js',
        text: `pref("extensions.${prefix}.enabled", true);\npref("extensions.${prefix}.token", "");`,
      },
    ],
    panes: [
      {
        source: 'preferences.xhtml',
        text: `<checkbox preference="extensions.${prefix}.enabled"/><input type="password" data-preference="extensions.${prefix}.token"/>`,
      },
    ],
    issues: [],
  };
}
function blandPlugin(secret = false): MainTemplatePlugin {
  return {
    ...plugin(),
    defaults: [{ source: 'prefs.js', text: `pref("${bland}", "ordinary");` }],
    panes: [
      {
        source: 'preferences.xhtml',
        text: `<input type="${secret ? 'password' : 'text'}" data-preference="${bland}"/>`,
      },
    ],
  };
}
const set = (value: SettingsValue): SettingState => ({ kind: 'set', value });
async function reviewedCatalog() {
  const catalog = createSettingsTemplateCatalog(() => '1.0');
  const draft = await catalog.scan('sample@test', context());
  await catalog.review(
    draft.pluginID,
    draft.revision,
    [
      { key, secret: false },
      { key: token, secret: false },
    ],
    context(),
  );
  return catalog;
}
beforeEach(() => {
  state.plugins = [plugin()];
  state.files.clear();
  state.preferences.clear();
  state.writes = [];
  state.reads = 0;
  state.persistWrites = true;
  state.invalidate = undefined;
  state.liveKeys.clear();
});

describe('local template field selection', () => {
  it('constructs builtins without touching the host and discovers without reading user preferences', async () => {
    const catalog = createSettingsTemplateCatalog(() => {
      throw new Error('Not initialized');
    });
    expect(catalog.adapters.map((adapter) => adapter.id)).toEqual(['zotero', 'zotero-neo']);
    expect(settingsTemplateHost.plugins).not.toHaveBeenCalled();
    const draft = await catalog.scan('sample@test', context());
    expect(draft.status).toBe('draft');
    expect(state.reads).toBe(0);
    expect(catalog.adapters).toHaveLength(2);
    catalog.dispose();
  });

  it('exposes global appearance fields but excludes retired Neo preferences from the template', async () => {
    const catalog = createSettingsTemplateCatalog(() => '1.0');
    const neo = (await catalog.list(context())).find(({ adapterID }) => adapterID === 'zotero-neo');
    const keys = neo?.fields.map(({ key }) => key);
    expect(neo?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'appearance.theme', type: 'string', supported: true }),
        expect.objectContaining({ key: 'appearance.preset', type: 'string', supported: true }),
        expect.objectContaining({ key: 'appearance.customCss', type: 'string', supported: true }),
      ]),
    );
    expect(keys).toContain('language');
    expect(keys).not.toContain('itemAttributes.fields.v1');
    expect(keys).not.toContain('modules.item-attributes.enabled');
    expect(keys).not.toContain('picker.theme');
    expect(keys).not.toContain('picker.customCss');
    expect(keys?.some((key) => key.startsWith('documentAnalysis.'))).toBe(false);
    catalog.dispose();
  });

  it('admits a directly selected field, then revokes access when the last field is cleared', async () => {
    state.preferences.set(key, set(true));
    const catalog = createSettingsTemplateCatalog(() => '1.0');
    const draft = await catalog.scan('sample@test', context());
    expect(catalog.adapters).toHaveLength(2);
    const selected = await catalog.review(
      draft.pluginID,
      draft.revision,
      [{ key, secret: false }],
      context(),
    );
    expect(selected.reviewedKeys).toEqual([key]);
    expect(state.reads).toBe(0);
    expect(state.writes).toEqual([]);

    const adapter = catalog.adapters.find((entry) => entry.id === selected.adapterID)!;
    const captureContext = { ...context(), includeSecrets: true, includeLibrarySettings: false };
    expect((await adapter.capture(captureContext)).section.entries).toEqual([
      { key, state: set(true) },
    ]);
    const section = {
      adapterID: adapter.id,
      schemaVersion: 1,
      sourceVersion: '1.0',
      entries: [
        { key, state: set(false) },
        { key: token, state: set('not-authorized') },
      ],
    };
    const plan = await adapter.plan(section, context());
    expect(plan.changes.map((change) => change.key)).toEqual([key]);
    expect(plan.issues).toMatchObject([{ code: 'unreviewed-field' }]);
    expect(await adapter.apply(plan.changes, context())).toMatchObject([{ status: 'applied' }]);
    expect(state.preferences.get(key)).toEqual(set(false));
    const stale = await adapter.plan(
      { ...section, entries: [{ key, state: set(true) }] },
      context(),
    );

    const cleared = await catalog.review(draft.pluginID, draft.revision, [], context());
    expect(cleared).toMatchObject({ status: 'draft', reviewedKeys: [] });
    expect(catalog.adapters).toHaveLength(2);
    await expect(adapter.capture(captureContext)).rejects.toMatchObject({ code: 'stale-template' });
    expect(await adapter.apply(stale.changes, context())).toMatchObject([{ status: 'conflict' }]);
    expect(state.writes).toEqual([key]);
    catalog.dispose();

    const hydrated = createSettingsTemplateCatalog(() => '1.0');
    await hydrated.list(context());
    expect(hydrated.adapters).toHaveLength(2);
    hydrated.dispose();
  });

  it('does not admit an adapter from a legacy local record with no selected fields', async () => {
    const catalog = createSettingsTemplateCatalog(() => '1.0');
    const draft = await catalog.scan('sample@test', context());
    catalog.dispose();
    const filename = `plugin-${settingsTemplateHost.digest(draft.pluginID)}.json`;
    state.files.set(
      filename,
      JSON.stringify({
        format: 'zotero-neo-settings-template',
        schemaVersion: 1,
        pluginID: draft.pluginID,
        version: draft.version,
        revision: draft.revision,
        status: 'reviewed',
        fields: [],
      }),
    );

    const hydrated = createSettingsTemplateCatalog(() => '1.0');
    expect(await hydrated.scan(draft.pluginID, context())).toMatchObject({
      status: 'draft',
      reviewedKeys: [],
    });
    expect(hydrated.adapters).toHaveLength(2);
    hydrated.dispose();
  });

  it('requires a local native binding before review and revokes it when rescanning no longer finds it', async () => {
    state.plugins[0] = {
      ...plugin(),
      defaults: [{ source: 'prefs.js', text: 'pref("enabled", true);' }],
    };
    let catalog = createSettingsTemplateCatalog(() => '1.0');
    const find = (templates: Awaited<ReturnType<typeof catalog.list>>) =>
      templates.find((template) => template.pluginID === 'sample@test')!;
    const pending = find(await catalog.list(context()));
    const selection = [{ key, secret: false }];
    expect(pending.fields.find((field) => field.key === key)?.supported).toBe(false);
    await expect(
      catalog.review(pending.pluginID, pending.revision, selection, context()),
    ).rejects.toThrow();
    state.liveKeys.add(key);
    const scanned = await catalog.scan(pending.pluginID, context());
    expect(scanned.reviewedKeys).toEqual([]);
    expect(catalog.adapters).toHaveLength(2);
    await catalog.review(scanned.pluginID, scanned.revision, selection, context());
    const exported = await catalog.exportTemplate(scanned.pluginID, context());
    catalog.dispose();

    state.preferences.set(key, set(false));
    state.liveKeys.clear();
    catalog = createSettingsTemplateCatalog(() => '1.0');
    await catalog.list(context());
    const adapter = catalog.adapters.find((entry) => entry.id === scanned.adapterID)!;
    const captured = await adapter.capture({
      ...context(),
      includeSecrets: false,
      includeLibrarySettings: false,
    });
    expect(captured.section.entries).toEqual([{ key, state: set(false) }]);

    const changed = await catalog.scan(scanned.pluginID, context());
    expect(changed.status).toBe('needs-review');
    await expect(
      adapter.capture({ ...context(), includeSecrets: false, includeLibrarySettings: false }),
    ).rejects.toThrow();
    await expect(catalog.importTemplate(exported, context())).rejects.toThrow();
    expect(state.writes).toEqual([]);
    catalog.dispose();
  });

  it('persists independent plugin files and hydrates only current local reviews', async () => {
    state.plugins.push(plugin('second@test', 'second'));
    const catalog = await reviewedCatalog();
    const second = await catalog.scan('second@test', context());
    await catalog.review(
      second.pluginID,
      second.revision,
      [{ key: 'extensions.second.enabled', secret: false }],
      context(),
    );
    expect(state.files.size).toBe(2);
    const serialized = [...state.files.values()].map((text) => JSON.parse(text));
    expect(serialized.map((record) => record.pluginID).sort()).toEqual([
      'sample@test',
      'second@test',
    ]);
    const sampleFile = [...state.files].find(
      ([, text]) => JSON.parse(text).pluginID === 'sample@test',
    )!;
    const existing = catalog.adapters.find((adapter) => adapter.id === second.adapterID);
    await catalog.list(context());
    expect(catalog.adapters.find((adapter) => adapter.id === second.adapterID)).toBe(existing);
    catalog.dispose();
    const hydrated = createSettingsTemplateCatalog(() => '1.0');
    await hydrated.list(context());
    expect(hydrated.adapters).toHaveLength(4);
    state.plugins[0] = { ...state.plugins[0]!, version: '2.0' };
    expect(
      (await hydrated.list(context())).find((template) => template.pluginID === 'sample@test')!
        .status,
    ).toBe('needs-review');
    expect(hydrated.adapters).toHaveLength(3);
    expect(state.files.get(sampleFile[0])).not.toBe(sampleFile[1]);
    hydrated.dispose();
  });

  it.each(['version', 'source', 'ownership', 'unavailable'] as const)(
    'invalidates capture and stale reviews after %s changes',
    async (change) => {
      const catalog = await reviewedCatalog();
      const draft = await catalog.scan('sample@test', context());
      const adapter = catalog.adapters.find((candidate) => candidate.id === draft.adapterID)!;
      if (change === 'version') state.plugins[0] = { ...state.plugins[0]!, version: '2.0' };
      if (change === 'source')
        state.plugins[0] = {
          ...state.plugins[0]!,
          panes: [
            {
              source: 'preferences.xhtml',
              text: '<checkbox preference="extensions.sample.enabled"/>',
            },
          ],
        };
      if (change === 'ownership') state.plugins.push({ ...plugin('other@test'), label: 'Other' });
      if (change === 'unavailable') state.plugins[0] = { ...state.plugins[0]!, available: false };
      await expect(
        adapter.capture({ ...context(), includeSecrets: false, includeLibrarySettings: false }),
      ).rejects.toThrow();
      await expect(
        catalog.review(draft.pluginID, draft.revision, [{ key, secret: false }], context()),
      ).rejects.toThrow();
      expect(state.writes).toEqual([]);
      catalog.dispose();
    },
  );

  it('invalidates issued adapters immediately on installed-plugin lifecycle changes', async () => {
    const catalog = await reviewedCatalog();
    const adapter = catalog.adapters[2]!;
    state.invalidate!();
    expect(catalog.adapters).toHaveLength(2);
    await expect(
      adapter.capture({ ...context(), includeSecrets: false, includeLibrarySettings: false }),
    ).rejects.toThrow();
    expect((await catalog.scan('sample@test', context())).status).toBe('needs-review');
    catalog.dispose();
  });

  it('never authorizes capture or restore from imported selection claims, even after hydration', async () => {
    let catalog = createSettingsTemplateCatalog(() => '1.0');
    const draft = await catalog.scan('sample@test', context());
    const source = JSON.parse(await catalog.exportTemplate(draft.pluginID, context()));
    expect(source.format).toBe('zotero-neo-settings-template');
    expect(source.fields).toContainEqual({ key, type: 'boolean', secret: false });
    source.status = 'reviewed';
    const imported = await catalog.importTemplate(JSON.stringify(source), context());
    expect(imported).toMatchObject({ status: 'draft', reviewedKeys: [] });
    expect(catalog.adapters).toHaveLength(2);
    catalog.dispose();

    catalog = createSettingsTemplateCatalog(() => '1.0');
    await catalog.scan(draft.pluginID, context());
    const service = new SettingsSnapshotService(
      () => catalog.adapters,
      () => ({ neo: '1.0', zotero: '9.0' }),
    );
    await expect(
      service.capture(new Set([draft.adapterID]), {
        ...context(),
        includeSecrets: false,
        includeLibrarySettings: false,
      }),
    ).rejects.toMatchObject({ code: 'unsupported-adapter' });
    const plan = await service.plan(
      {
        format: 'zotero-neo-settings',
        schemaVersion: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        producer: { name: 'Zotero Neo', version: '1.0' },
        zoteroVersion: '9.0',
        sections: [
          {
            adapterID: draft.adapterID,
            schemaVersion: 1,
            sourceVersion: '1.0',
            entries: [{ key, state: set(false) }],
          },
        ],
      },
      context(),
    );
    expect(plan.plans).toEqual([]);
    expect(plan.issues).toMatchObject([{ code: 'unsupported-adapter' }]);
    expect(state.reads).toBe(0);
    expect(state.writes).toEqual([]);
    catalog.dispose();
  });

  it('validates and hydrates bounded template JSON without Bootstrap DOM constructors', async () => {
    const catalog = await reviewedCatalog();
    const text = await catalog.exportTemplate('sample@test', context());
    vi.stubGlobal('TextEncoder', undefined);
    vi.stubGlobal('TextDecoder', undefined);
    try {
      expect((await catalog.importTemplate(text, context())).status).toBe('draft');
      await expect(
        catalog.importTemplate(' '.repeat(512 * 1024 + 1), context()),
      ).rejects.toMatchObject({ code: 'resource-limit' });
      catalog.dispose();
      const hydrated = createSettingsTemplateCatalog(() => '1.0');
      expect(
        (await hydrated.list(context())).find((template) => template.pluginID === 'sample@test')!
          .status,
      ).toBe('draft');
      hydrated.dispose();
    } finally {
      catalog.dispose();
      vi.unstubAllGlobals();
    }
  });

  it('rejects malformed, foreign and stale imported/review fields without writes', async () => {
    const catalog = await reviewedCatalog();
    const draft = await catalog.scan('sample@test', context());
    const original = JSON.parse(await catalog.exportTemplate('sample@test', context()));
    for (const incoming of [
      { ...original, schemaVersion: 2 },
      { ...original, version: 'unknown' },
      { ...original, revision: '0'.repeat(64) },
      { ...original, script: 'execute()' },
      { ...original, sensitiveKeys: ['extensions.other.enabled'] },
      {
        ...original,
        fields: [{ key: 'extensions.other.enabled', type: 'boolean', secret: false }],
      },
    ])
      await expect(catalog.importTemplate(JSON.stringify(incoming), context())).rejects.toThrow();
    await expect(
      catalog.review(
        draft.pluginID,
        draft.revision,
        [{ key: 'extensions.zotero.automaticTags', secret: false }],
        context(),
      ),
    ).rejects.toThrow();
    expect(state.writes).toEqual([]);
    catalog.dispose();
  });
});

describe('consumer-visible reviewed preference behavior', () => {
  it('excludes locally secret fields from JSON, preserves reset semantics and applies only selected previews', async () => {
    state.preferences.set(key, set(true));
    state.preferences.set(token, set('private-credential'));
    const catalog = await reviewedCatalog();
    const adapter = catalog.adapters[2]!;
    const service = new SettingsSnapshotService(
      () => catalog.adapters,
      () => ({ neo: '1.0', zotero: '9.0' }),
    );
    const captured = await service.capture(new Set([adapter.id]), {
      ...context(),
      container: 'json',
      includeSecrets: false,
      includeLibrarySettings: false,
    });
    expect(captured.document.sections[0]!.entries).toEqual([{ key, state: set(true) }]);
    expect(JSON.stringify(captured.document)).not.toContain('private-credential');
    const section = {
      adapterID: adapter.id,
      schemaVersion: 1,
      sourceVersion: '1.0',
      entries: [
        { key, state: { kind: 'reset' } as const },
        { key: token, state: set('replacement') },
      ],
    };
    const plan = await adapter.plan(section, context());
    const receipts = await adapter.apply(
      plan.changes.map((change) => ({ ...change, selected: change.key === key })),
      context(),
    );
    expect(receipts.map((receipt) => receipt.status)).toEqual(['applied', 'skipped']);
    expect(state.preferences.get(key)).toEqual({ kind: 'reset' });
    expect(state.preferences.get(token)).toEqual(set('private-credential'));
    const reads = state.reads;
    await expect(adapter.plan(section, { ...context(), container: 'json' })).rejects.toMatchObject({
      code: 'plaintext-secrets',
    });
    expect(state.reads).toBe(reads);
    catalog.dispose();
  });

  it('rechecks values and metadata before actual mutation and reports failed real writes', async () => {
    state.preferences.set(key, set(true));
    const catalog = await reviewedCatalog(),
      adapter = catalog.adapters[2]!;
    const section = {
      adapterID: adapter.id,
      schemaVersion: 1,
      sourceVersion: '1.0',
      entries: [{ key, state: set(false) }],
    };
    const plan = await adapter.plan(section, context());
    state.preferences.set(key, { kind: 'reset' });
    expect((await adapter.apply(plan.changes, context()))[0]!.status).toBe('conflict');
    expect(state.writes).toEqual([]);
    state.preferences.set(key, set(true));
    const retry = await adapter.plan(section, context());
    state.persistWrites = false;
    expect((await adapter.apply(retry.changes, context()))[0]!.status).toBe('failed');
    state.persistWrites = true;
    const stale = await adapter.plan(section, context());
    state.plugins[0] = { ...state.plugins[0]!, version: '2.0' };
    expect((await adapter.apply(stale.changes, context()))[0]!.status).toBe('conflict');
    expect(state.writes).toHaveLength(1);
    catalog.dispose();
  });

  it('persists sensitivity without granting access until the same field is selected separately', async () => {
    state.plugins = [blandPlugin()];
    state.preferences.set(bland, set('unmarked-private-value'));
    let catalog = createSettingsTemplateCatalog(() => '1.0');
    const draft = await catalog.scan('sample@test', context());
    const classified = await catalog.review(
      draft.pluginID,
      draft.revision,
      [{ key: bland, secret: true, portable: false }],
      context(),
    );
    expect(classified.reviewedKeys).toEqual([]);
    expect(classified.fields[0]!.secret).toBe(true);
    expect(catalog.adapters).toHaveLength(2);
    expect(state.reads).toBe(0);
    catalog.dispose();

    catalog = createSettingsTemplateCatalog(() => '1.0');
    const reloaded = await catalog.scan(draft.pluginID, context());
    expect(reloaded.fields[0]!.secret).toBe(true);
    expect(reloaded.reviewedKeys).toEqual([]);
    await catalog.review(
      reloaded.pluginID,
      reloaded.revision,
      [{ key: bland, secret: false, portable: true }],
      context(),
    );
    const adapter = catalog.adapters[2]!;
    const plain = await adapter.capture({
      ...context(),
      container: 'json',
      includeSecrets: false,
      includeLibrarySettings: false,
    });
    expect(plain.section.entries).toEqual([]);
    const encrypted = await adapter.capture({
      ...context(),
      includeSecrets: true,
      includeLibrarySettings: false,
    });
    expect(encrypted.section.entries).toEqual([
      { key: bland, state: set('unmarked-private-value') },
    ]);
    catalog.dispose();
  });

  it('keeps a previously marked preference sensitive when another installed plugin owns its key', async () => {
    state.plugins = [blandPlugin()];
    state.preferences.set(bland, set('previous-plugin-secret'));
    const catalog = createSettingsTemplateCatalog(() => '1.0');
    const first = await catalog.scan('sample@test', context());
    await catalog.review(
      first.pluginID,
      first.revision,
      [{ key: bland, secret: true, portable: false }],
      context(),
    );
    state.plugins = [{ ...blandPlugin(), id: 'replacement@test' }];
    state.invalidate!();
    const replacement = await catalog.scan('replacement@test', context());
    expect(replacement.fields[0]).toMatchObject({ supported: true, secret: true });
    expect(replacement.reviewedKeys).toEqual([]);
    expect(catalog.adapters).toHaveLength(2);
    await catalog.review(
      replacement.pluginID,
      replacement.revision,
      [{ key: bland, secret: false }],
      context(),
    );
    const adapter = catalog.adapters.find((entry) => entry.id === replacement.adapterID)!;
    const plain = await adapter.capture({
      ...context(),
      container: 'json',
      includeSecrets: false,
      includeLibrarySettings: false,
    });
    expect(plain.section.entries).toEqual([]);
    expect(state.reads).toBe(0);
    catalog.dispose();
  });

  it.each(['downgraded', 'omitted'] as const)(
    'keeps local string sensitivity after a %s import, omitted review and catalog restarts',
    async (incomingField) => {
      state.plugins = [blandPlugin()];
      state.preferences.set(bland, set('actual-private-value'));
      let catalog = createSettingsTemplateCatalog(() => '1.0');
      const draft = await catalog.scan('sample@test', context());
      expect(draft.fields.find((field) => field.key === bland)?.secret).toBe(false);
      await catalog.review(
        draft.pluginID,
        draft.revision,
        [{ key: bland, secret: true }],
        context(),
      );
      const oldAdapter = catalog.adapters[2]!;
      const exported = await catalog.exportTemplate(draft.pluginID, context());
      expect(exported).not.toContain('sensitiveKeys');
      expect(exported).not.toContain('actual-private-value');
      const incoming = JSON.parse(exported);
      incoming.fields =
        incomingField === 'omitted' ? [] : [{ key: bland, type: 'string', secret: false }];
      incoming.status = 'reviewed';
      const imported = await catalog.importTemplate(JSON.stringify(incoming), context());
      expect(imported).toMatchObject({ status: 'draft', reviewedKeys: [] });
      expect(imported.fields.find((field) => field.key === bland)?.secret).toBe(true);
      expect(catalog.adapters).toHaveLength(2);
      await expect(
        oldAdapter.capture({ ...context(), includeSecrets: true, includeLibrarySettings: false }),
      ).rejects.toThrow();
      await catalog.review(imported.pluginID, imported.revision, [], context());
      expect(state.reads).toBe(0);
      catalog.dispose();

      catalog = createSettingsTemplateCatalog(() => '1.0');
      const reloaded = await catalog.scan(draft.pluginID, context());
      expect(reloaded.reviewedKeys).toEqual([]);
      expect(reloaded.fields.find((field) => field.key === bland)?.secret).toBe(true);
      await catalog.review(
        reloaded.pluginID,
        reloaded.revision,
        [{ key: bland, secret: false }],
        context(),
      );
      expect(state.reads).toBe(0);
      expect([...state.files.values()].join('')).not.toContain('actual-private-value');

      const expectProtectedConsumer = async () => {
        const adapter = catalog.adapters[2]!;
        const service = new SettingsSnapshotService(
          () => catalog.adapters,
          () => ({ neo: '1.0', zotero: '9.0' }),
        );
        const captured = await service.capture(new Set([adapter.id]), {
          ...context(),
          container: 'json',
          includeSecrets: false,
          includeLibrarySettings: false,
        });
        expect(captured.document.sections[0]!.entries).toEqual([]);
        expect(JSON.stringify(captured.document)).not.toContain('actual-private-value');
        const reads = state.reads;
        await expect(
          adapter.plan(
            {
              adapterID: adapter.id,
              schemaVersion: 1,
              sourceVersion: '1.0',
              entries: [{ key: bland, state: set('replacement-private-value') }],
            },
            { ...context(), container: 'json' },
          ),
        ).rejects.toMatchObject({ code: 'plaintext-secrets' });
        expect(state.reads).toBe(reads);
      };
      await expectProtectedConsumer();
      catalog.dispose();
      catalog = createSettingsTemplateCatalog(() => '1.0');
      expect(
        (await catalog.scan(draft.pluginID, context())).fields.find((field) => field.key === bland)
          ?.secret,
      ).toBe(true);
      await expectProtectedConsumer();
      expect(state.writes).toEqual([]);
      catalog.dispose();
    },
  );

  it('persists discovered password metadata before review even after its source annotation disappears', async () => {
    state.plugins = [blandPlugin(true)];
    let catalog = createSettingsTemplateCatalog(() => '1.0');
    const discovered = await catalog.scan('sample@test', context());
    expect(discovered.fields.find((field) => field.key === bland)?.secret).toBe(true);
    expect(catalog.adapters).toHaveLength(2);
    catalog.dispose();
    state.plugins = [{ ...blandPlugin(), panes: [] }];
    catalog = createSettingsTemplateCatalog(() => '1.0');
    expect((await catalog.scan(discovered.pluginID, context())).fields).toEqual([]);
    expect(catalog.adapters).toHaveLength(2);
    catalog.dispose();
    state.plugins = [blandPlugin()];
    catalog = createSettingsTemplateCatalog(() => '1.0');
    const rescanned = await catalog.scan(discovered.pluginID, context());
    expect(rescanned.revision).not.toBe(discovered.revision);
    expect(rescanned.fields.find((field) => field.key === bland)?.secret).toBe(true);
    await catalog.review(rescanned.pluginID, rescanned.revision, [], context());
    catalog.dispose();
    catalog = createSettingsTemplateCatalog(() => '1.0');
    const omitted = await catalog.scan(discovered.pluginID, context());
    await catalog.review(
      omitted.pluginID,
      omitted.revision,
      [{ key: bland, secret: false }],
      context(),
    );
    expect((await catalog.scan(discovered.pluginID, context())).fields[0]!.secret).toBe(true);
    expect(state.reads).toBe(0);
    catalog.dispose();
  });

  it('hydrates legacy v1 sensitivity and lets imported flags strengthen but never weaken it', async () => {
    state.plugins = [blandPlugin()];
    let catalog = createSettingsTemplateCatalog(() => '1.0');
    const draft = await catalog.scan('sample@test', context());
    const portable = JSON.parse(await catalog.exportTemplate(draft.pluginID, context()));
    portable.fields[0].secret = true;
    const imported = await catalog.importTemplate(JSON.stringify(portable), context());
    expect(imported.status).toBe('draft');
    expect(imported.fields[0]!.secret).toBe(true);
    expect(catalog.adapters).toHaveLength(2);
    // A pre-metadata v1 file retains only selected field flags and its local review.
    const fileName = [...state.files.keys()][0]!;
    state.files.set(fileName, JSON.stringify({ ...portable, status: 'reviewed' }));
    catalog.dispose();
    catalog = createSettingsTemplateCatalog(() => '1.0');
    const legacy = await catalog.scan(draft.pluginID, context());
    expect(legacy.status).toBe('reviewed');
    expect(legacy.fields[0]!.secret).toBe(true);
    await catalog.review(legacy.pluginID, legacy.revision, [], context());
    portable.fields[0].secret = false;
    expect(
      (await catalog.importTemplate(JSON.stringify(portable), context())).fields[0]!.secret,
    ).toBe(true);
    catalog.dispose();
    catalog = createSettingsTemplateCatalog(() => '1.0');
    expect((await catalog.scan(draft.pluginID, context())).fields[0]!.secret).toBe(true);
    expect(catalog.adapters).toHaveLength(2);
    expect(state.reads).toBe(0);
    catalog.dispose();
  });

  it('rejects incompatible snapshot versions, unsafe value types and forged previews', async () => {
    state.preferences.set(key, set(true));
    const catalog = await reviewedCatalog(),
      adapter = catalog.adapters[2]!;
    const section = {
      adapterID: adapter.id,
      schemaVersion: 1,
      sourceVersion: '1.0',
      entries: [{ key, state: set(false) }],
    };
    await expect(adapter.plan({ ...section, sourceVersion: '0.9' }, context())).rejects.toThrow();
    const invalid = await adapter.plan(
      { ...section, entries: [{ key, state: set({ nested: true }) }] },
      context(),
    );
    expect(invalid.changes).toEqual([]);
    expect(invalid.issues).toHaveLength(1);
    const plan = await adapter.plan(section, context());
    const forged = plan.changes.map((change) => ({ ...change, after: set('invalid-boolean') }));
    expect((await adapter.apply(forged, context()))[0]!.status).toBe('skipped');
    expect(state.writes).toEqual([]);
    catalog.dispose();
  });

  it('preserves reviewed adapter identity across a catalog refresh and verifies the source before writing', async () => {
    state.preferences.set(key, set(true));
    const catalog = await reviewedCatalog(),
      adapter = catalog.adapters[2]!;
    const service = new SettingsSnapshotService(
      () => catalog.adapters,
      () => ({ neo: '1.0', zotero: '9.0' }),
    );
    const captured = await service.capture(new Set([adapter.id]), {
      ...context(),
      includeSecrets: false,
      includeLibrarySettings: false,
    });
    const document = {
      ...captured.document,
      sections: [{ ...captured.document.sections[0]!, entries: [{ key, state: set(false) }] }],
    };
    const plan = await service.plan(document, context());
    await catalog.list(context());
    expect(catalog.adapters[2]).toBe(adapter);
    const verifySource = vi.fn(async () => {
      expect(state.writes).toEqual([]);
    });
    const receipt = await service.apply(
      plan,
      new Set([settingsChangeID(adapter.id, key)]),
      { ...context(), window: {} as Window },
      verifySource,
    );
    expect(verifySource).toHaveBeenCalledOnce();
    expect(receipt.entries[0]!.status).toBe('applied');
    catalog.dispose();
  });
});
