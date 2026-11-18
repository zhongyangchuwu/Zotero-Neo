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
}));
vi.mock('../../src/toolkit/main', () => ({ assertCustomExtraKey: () => {} }));
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
      preferenceType: (key: string) => (key.endsWith('.enabled') ? 'boolean' : 'string'),
      readPreference: (key: string) => {
        state.reads++;
        return state.preferences.get(key) ?? { kind: 'reset' };
      },
      writePreference: (key: string, value: SettingState, admit: () => void) => {
        admit();
        state.writes.push(key);
        if (state.persistWrites) state.preferences.set(key, value);
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
import { settingStateText } from '../../src/settings-snapshots/document';

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
});

describe('locally reviewed template catalog', () => {
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

  it('imports data only as a freshly validated draft, never imported write authority', async () => {
    const catalog = await reviewedCatalog();
    const text = await catalog.exportTemplate('sample@test', context());
    const source = JSON.parse(text);
    expect(source.format).toBe('zotero-neo-settings-template');
    source.status = 'reviewed';
    const imported = await catalog.importTemplate(JSON.stringify(source), context());
    expect(imported).toMatchObject({ status: 'draft', reviewedKeys: [] });
    expect(catalog.adapters).toHaveLength(2);
    expect([...state.files.values()].every((file) => JSON.parse(file).status === 'draft')).toBe(
      true,
    );
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
    const jsonPlan = await adapter.plan(section, { ...context(), container: 'json' });
    expect(jsonPlan.changes.find((change) => change.key === token)).toMatchObject({
      secret: true,
      selected: false,
      blocked: expect.any(String),
    });
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

  it('honors explicitly reviewed secret flags even when the field name is not sensitive', async () => {
    state.preferences.set(key, set(true));
    const catalog = createSettingsTemplateCatalog(() => '1.0');
    const draft = await catalog.scan('sample@test', context());
    await catalog.review(draft.pluginID, draft.revision, [{ key, secret: true }], context());
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
    expect(encrypted.section.entries).toEqual([{ key, state: set(true) }]);
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
        const plan = await adapter.plan(
          {
            adapterID: adapter.id,
            schemaVersion: 1,
            sourceVersion: '1.0',
            entries: [{ key: bland, state: set('replacement-private-value') }],
          },
          { ...context(), container: 'json' },
        );
        expect(plan.changes).toHaveLength(1);
        const change = plan.changes[0]!;
        expect(change).toMatchObject({
          secret: true,
          selected: false,
          blocked: expect.any(String),
        });
        expect(settingStateText(change.before, change.secret)).toBe('⟨set / 已设置⟩');
        expect(settingStateText(change.after, change.secret)).toBe('⟨set / 已设置⟩');
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
