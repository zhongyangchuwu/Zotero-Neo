import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettingsAdapters } from '../../src/settings-snapshots/registry';
import { BINDING_SCHEMA_VERSION } from '../../src/core/preferences';
import type {
  SettingsChange,
  SettingsEntry,
  SettingsOperationContext,
  SettingsSection,
  SettingsValue,
} from '../../src/settings-snapshots/contracts';
import {
  assertSettingsCurrent,
  parseSettingsDocument,
  serializeSettingsDocument,
} from '../../src/settings-snapshots/document';
import { SettingsSnapshotService, settingsChangeID } from '../../src/settings-snapshots/service';
import { saveMinerUToken } from '../../src/platform/document-credentials';
import { changeReferenceKey } from '../../src/platform/reference-credentials';
import { settingsSnapshotHostFixture } from './settings-snapshots-host-fixture';

const context = () => {
  const controller = new AbortController();
  return { controller, signal: controller.signal, isCurrent: () => true };
};
const set = (key: string, value: SettingsValue): SettingsEntry => ({
  key,
  state: { kind: 'set', value },
});
const reset = (key: string): SettingsEntry => ({ key, state: { kind: 'reset' } });
const section = (adapterID: string, entries: readonly SettingsEntry[]): SettingsSection => ({
  adapterID,
  schemaVersion: 1,
  sourceVersion: 'source-old',
  entries,
});
const selected = (changes: readonly SettingsChange[]) =>
  changes.map((change) => ({ ...change, selected: true }));
const captureContext = () => ({
  ...context(),
  includeSecrets: false,
  includeLibrarySettings: false,
});
type TransferStyle = {
  id: string;
  title: string;
  source: string;
  hidden: boolean;
  text: string;
};
interface FixtureInstalledStyle {
  styleID: string;
  title: string;
  source: string;
  hidden: boolean;
  path: string;
}
interface StyleFixtureTarget {
  files: Map<string, string>;
  native: { Styles: { getAll(): Record<string, FixtureInstalledStyle> } };
}
const customStyle = (id = 'https://example.org/styles/custom'): TransferStyle => ({
  id,
  title: 'Custom',
  source: '',
  hidden: false,
  text: `<style xmlns="http://purl.org/net/xbiblio/csl" version="1.0"><info><id>${id}</id><title>Custom</title></info></style>`,
});
function installFixtureStyle(
  target: StyleFixtureTarget,
  style: TransferStyle,
  path = `/fixture-data/styles/${encodeURIComponent(style.id)}.csl`,
): void {
  target.files.set(path, style.text);
  target.native.Styles.getAll()[style.id] = {
    styleID: style.id,
    title: style.title,
    source: style.source,
    hidden: style.hidden,
    path,
  };
}
afterEach(() => vi.unstubAllGlobals());

describe('standalone built-in settings adapters at the native OS boundary', () => {
  it('constructs exactly two adapters without accessing the host or Neo version', () => {
    const version = vi.fn(() => 'neo-target');
    const adapters = createSettingsAdapters(version);
    expect(adapters.map((adapter) => adapter.id)).toEqual(['zotero', 'zotero-neo']);
    expect(version).not.toHaveBeenCalled();
    settingsSnapshotHostFixture();
    expect(adapters[1]!.sourceVersion).toBe('neo-target');
  });

  it('captures user overrides rather than defaults/profile state, including every registered native shortcut', async () => {
    const t = settingsSnapshotHostFixture();
    t.user.set('extensions.zotero.automaticTags', false);
    t.user.set('extensions.zotero.fulltext.pdfMaxPages', 0);
    t.user.set('extensions.zotero.openURL.resolver', '');
    t.user.set('browser.theme.toolbar-theme', 0);
    for (const key of t.defaults.keys())
      if (key.startsWith('extensions.zotero.keys.')) t.user.set(key, 'Z');
    t.user.set('extensions.zotero.sync.server.username', 'do-not-clone-account');
    t.user.set('extensions.zotero.sync.storage.verified', true);
    t.user.set('extensions.zotero.thirdParty.password', 'do-not-export-secret');
    t.user.set('extensions.other-addon.private', 'foreign');
    const [adapter] = createSettingsAdapters(() => 'neo-target');
    const captured = await adapter!.capture(captureContext());
    const entries = Object.fromEntries(
      captured.section.entries.map((entry) => [entry.key, entry.state]),
    );
    expect(entries.automaticTags).toEqual({ kind: 'set', value: false });
    expect(entries['fulltext.pdfMaxPages']).toEqual({ kind: 'set', value: 0 });
    expect(entries['openURL.resolver']).toEqual({ kind: 'set', value: '' });
    expect(entries['pref:browser.theme.toolbar-theme']).toEqual({ kind: 'set', value: 0 });
    expect(entries.fontSize).toBeUndefined();
    expect(Object.keys(entries).filter((key) => key.startsWith('keys.'))).toHaveLength(11);
    expect(JSON.stringify(captured)).not.toMatch(
      /do-not-clone-account|do-not-export-secret|source-device/,
    );
    expect(captured.issues.some((issue) => issue.code === 'excluded-or-unknown')).toBe(true);
  });

  it('captures Neo settings, canonical binding schema, module and appearance options but no per-document state', async () => {
    const t = settingsSnapshotHostFixture();
    const values: Record<string, string | number | boolean> = {
      language: 'zh-CN',
      'tags.separator': '',
      'keyGuide.delayMs': 0,
      'smoothScroll.stopOnRelease': false,
      'modules.references.enabled': false,
      'appearance.preset': 'terminal',
      'documentAnalysis.provider': 'mineru',
      'documentAnalysis.local.rules': '{"version":1,"rules":{"unruledTables":{"enabled":false}}}',
      bindings: '{"reader-normal:x":"scrollDown"}',
      'bindings.schemaVersion': BINDING_SCHEMA_VERSION,
    };
    for (const [key, value] of Object.entries(values))
      t.user.set(`extensions.zotero-neo.${key}`, value);
    t.user.set('extensions.zotero-neo.tabEnhancements.side', 'right');
    t.user.set('extensions.zotero-neo.modules.tab-enhancements.enabled', true);
    t.user.set('extensions.zotero-neo.marks.document.123', 'private-marks');
    t.user.set('extensions.zotero-neo.runtime.trace', 'private-trace');
    const adapter = createSettingsAdapters(() => 'neo-target')[1]!;
    const captured = await adapter.capture(captureContext());
    expect(captured.section.sourceVersion).toBe('neo-target');
    const entries = Object.fromEntries(
      captured.section.entries.map((entry) => [entry.key, entry.state]),
    );
    expect(entries.bindings).toEqual({
      kind: 'set',
      value: { schemaVersion: BINDING_SCHEMA_VERSION, overrides: values.bindings },
    });
    expect(entries['tags.separator']).toEqual({ kind: 'set', value: '' });
    expect(entries['keyGuide.delayMs']).toEqual({ kind: 'set', value: 0 });
    expect(entries['modules.references.enabled']).toEqual({ kind: 'set', value: false });
    expect(entries['appearance.preset']).toEqual({ kind: 'set', value: 'terminal' });
    expect(entries['tabEnhancements.side']).toBeUndefined();
    expect(entries['modules.tab-enhancements.enabled']).toBeUndefined();
    expect(t.user.get('extensions.zotero-neo.tabEnhancements.side')).toBe('right');
    expect(t.user.get('extensions.zotero-neo.modules.tab-enhancements.enabled')).toBe(true);
    expect(JSON.stringify(captured)).not.toMatch(/private-marks|private-trace/);
  });

  it.each(['.neo-settings {\n  --neo-radius: 3px; /* 自定义 */\n}\n', ''])(
    'round-trips the global preset and its exact CSS string (%j) through a local snapshot',
    async (css) => {
      const t = settingsSnapshotHostFixture();
      const prefix = 'extensions.zotero-neo.';
      const adapter = createSettingsAdapters(() => 'neo-target')[1]!;
      const service = new SettingsSnapshotService([adapter], () => ({
        neo: 'neo-target',
        zotero: '8',
      }));
      const operation = { ...captureContext(), container: 'json' as const, window: {} as Window };
      t.user.set(prefix + 'appearance.preset', 'terminal');
      t.user.set(prefix + 'appearance.customCss', css);
      t.user.set(prefix + 'picker.theme', 'modern');
      t.user.set(prefix + 'picker.customCss', 'retired styles');

      const captured = await service.capture(new Set([adapter.id]), operation);
      const document = parseSettingsDocument(serializeSettingsDocument(captured.document));
      const entries = [set('appearance.preset', 'terminal'), set('appearance.customCss', css)];
      expect(document.sections[0]?.entries).toEqual(entries);
      expect(captured.issues.map(({ code }) => code)).not.toContain('excluded-or-unknown');

      t.user.set(prefix + 'appearance.preset', 'classic');
      t.user.set(prefix + 'appearance.customCss', '.neo-settings { color: purple; }');
      t.user.set(prefix + 'appearance.theme', 'dark');
      const plan = await service.plan(document, operation);
      const receipt = await service.apply(
        plan,
        new Set(entries.map(({ key }) => settingsChangeID(adapter.id, key))),
        operation,
        async () => {},
      );
      expect(receipt.entries).toMatchObject(entries.map(({ key }) => ({ key, status: 'applied' })));
      expect(t.user.get(prefix + 'appearance.preset')).toBe('terminal');
      expect(t.user.get(prefix + 'appearance.customCss')).toBe(css);
      expect(t.user.get(prefix + 'appearance.theme')).toBe('dark');
    },
  );

  it('rejects unsupported preset and non-string custom CSS values', async () => {
    settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[1]!;
    const plan = await adapter.plan(
      section(adapter.id, [set('appearance.preset', 'dark'), set('appearance.customCss', true)]),
      context(),
    );
    expect(plan.changes).toEqual([]);
    expect(plan.issues.map(({ code }) => code)).toEqual(['invalid-field', 'invalid-field']);
  });

  it('restores live Neo settings and shortcuts without writing or backing up retired preferences', async () => {
    const t = settingsSnapshotHostFixture();
    const definitions = 'itemAttributes.fields.v1';
    const moduleFlag = 'modules.item-attributes.enabled';
    const legacyPreset = 'picker.theme';
    const legacyCss = 'picker.customCss';
    const prefix = 'extensions.zotero-neo.';
    t.user.set(prefix + definitions, '{"version":1,"fields":[]}');
    t.user.set(prefix + moduleFlag, true);
    t.user.set(prefix + legacyPreset, 'classic');
    t.user.set(prefix + legacyCss, 'local retired styles');
    const retired = {
      'modules.translation.enabled': true,
      'extras.translation.enabled': true,
      'modules.ai-qa.enabled': false,
      'modules.reader-ai.enabled': true,
      'pdf-translate.targetLanguage': 'de-DE',
      'reader-ai.enabled': true,
      'ai.configuration': JSON.stringify({
        api: 'openai-responses',
        endpoint: 'https://api.example/v1',
        model: 'local-only',
        maxOutputTokens: 2048,
        sendImages: false,
      }),
    };
    for (const [key, value] of Object.entries(retired)) t.user.set(prefix + key, value);
    const adapter = createSettingsAdapters(() => 'neo-target')[1]!;
    const service = new SettingsSnapshotService([adapter], () => ({
      neo: 'neo-target',
      zotero: '8',
    }));
    const operation = { ...context(), container: 'json' as const, window: {} as Window };
    const document = parseSettingsDocument(
      JSON.stringify({
        format: 'zotero-neo-settings',
        schemaVersion: 1,
        createdAt: '2026-11-17T00:00:00.000Z',
        producer: { name: 'Zotero Neo', version: 'source-old' },
        zoteroVersion: '8',
        sections: [
          section('zotero-neo', [
            set(definitions, '{"version":999,"fields":null}'),
            reset(moduleFlag),
            set(legacyPreset, 'modern'),
            reset(legacyCss),
            ...Object.keys(retired).map(reset),
            reset(prefix + 'extras.translation.enabled'),
            reset(prefix + 'reader-ai.enabled'),
            set('secret:ai:https://api.example/v1', 'old credential'),
            set('language', 'zh-CN'),
            set('bindings', {
              schemaVersion: 22,
              overrides: JSON.stringify({
                'reader-normal:x': 'scrollDown',
                'reader-normal:aq': 'openReaderAI',
                'reader-normal:<Space>aa': 'openAIQA',
                'main-normal:<Space>pa': 'manageItemAttributes',
                'main-normal:<Space>ia': 'editItemAttributes',
              }),
            }),
          ]),
        ],
      }),
    );
    const plan = await service.plan(document, operation);
    expect(plan.issues.map(({ code }) => code)).toEqual(['binding-migration']);
    expect(plan.plans.flatMap(({ changes }) => changes.map(({ key }) => key))).toEqual([
      'language',
      'bindings',
    ]);
    const receipt = await service.apply(
      plan,
      new Set(
        [
          'language',
          'bindings',
          definitions,
          moduleFlag,
          legacyPreset,
          legacyCss,
          ...Object.keys(retired),
          'secret:ai:https://api.example/v1',
        ].map((key) => settingsChangeID(adapter.id, key)),
      ),
      operation,
      async () => {},
    );
    expect(receipt.entries).toMatchObject([
      { key: 'language', status: 'applied' },
      { key: 'bindings', status: 'applied' },
    ]);
    expect(t.mutations).not.toContain(prefix + definitions);
    expect(t.mutations).not.toContain(prefix + moduleFlag);
    expect(t.mutations).not.toContain(prefix + legacyPreset);
    expect(t.mutations).not.toContain(prefix + legacyCss);
    for (const [key, value] of Object.entries(retired)) {
      expect(t.mutations).not.toContain(prefix + key);
      expect(t.user.get(prefix + key)).toBe(value);
    }
    expect(t.records).toEqual([]);
    expect(t.user.get(prefix + definitions)).toBe('{"version":1,"fields":[]}');
    expect(t.user.get(prefix + moduleFlag)).toBe(true);
    expect(t.user.get(prefix + 'language')).toBe('zh-CN');
    expect(JSON.parse(String(t.user.get(prefix + 'bindings')))).toEqual({
      'reader-normal:x': 'scrollDown',
    });
    const captured = await adapter.capture({ ...captureContext(), includeSecrets: true });
    expect(captured.section.entries.map(({ key }) => key).sort()).toEqual(['bindings', 'language']);
    expect(captured.issues.map(({ code }) => code)).not.toContain('excluded-or-unknown');
  });

  it('plans target versions, defaults conflicts unselected, preserves false/zero/empty/reset, and imports idempotently', async () => {
    const t = settingsSnapshotHostFixture();
    t.user.set('extensions.zotero.automaticTags', true);
    t.user.set('extensions.zotero.fontSize', '1.5');
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const input = section('zotero', [
      set('automaticTags', false),
      set('fulltext.pdfMaxPages', 0),
      set('openURL.resolver', ''),
      reset('fontSize'),
      set('pref:browser.theme.toolbar-theme', 0),
    ]);
    const plan = await adapter.plan(input, context());
    expect(plan.sourceVersion).toBe('8.0.2');
    expect(plan.changes.find((change) => change.key === 'automaticTags')!.selected).toBe(false);
    const receipts = await adapter.apply(selected(plan.changes), context());
    expect(receipts.every((receipt) => receipt.status === 'applied')).toBe(true);
    expect(t.user.get('extensions.zotero.automaticTags')).toBe(false);
    expect(t.user.get('extensions.zotero.fulltext.pdfMaxPages')).toBe(0);
    expect(t.user.get('extensions.zotero.openURL.resolver')).toBe('');
    expect(t.user.has('extensions.zotero.fontSize')).toBe(false);
    expect(t.user.get('browser.theme.toolbar-theme')).toBe(0);
    const count = t.mutations.length;
    const repeated = await adapter.plan(input, context());
    expect(
      (await adapter.apply(selected(repeated.changes), context())).every(
        (receipt) => receipt.status === 'unchanged',
      ),
    ).toBe(true);
    expect(t.mutations).toHaveLength(count);
  });

  it.each([
    ['hideContextAnnotationRows', true, false],
    ['fulltext.pdfMaxPages', 0, 4],
    ['openURL.resolver', '', 'https://example.org/resolver'],
  ] as const)(
    'uses the target default for %s without stopping later entries',
    async (key, value, other) => {
      const t = settingsSnapshotHostFixture();
      const pref = `extensions.zotero.${key}`;
      t.defaults.set(pref, value);
      const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
      const input = section('zotero', [set(key, value), set('showTrashWhenEmpty', true)]);

      const apply = async (source: SettingsSection) =>
        adapter.apply(selected((await adapter.plan(source, context())).changes), context());

      expect(await apply(input)).toMatchObject([
        { key, status: 'unchanged' },
        { key: 'showTrashWhenEmpty', status: 'applied' },
      ]);
      expect(t.user.has(pref)).toBe(false);
      expect(t.user.get('extensions.zotero.showTrashWhenEmpty')).toBe(true);

      t.user.set(pref, other);
      expect(await apply(section('zotero', [set(key, value)]))).toMatchObject([
        { key, status: 'applied' },
      ]);
      expect(t.user.has(pref)).toBe(false);

      t.defaults.set(pref, other);
      expect(await apply(section('zotero', [set(key, value)]))).toMatchObject([
        { key, status: 'applied' },
      ]);
      expect(t.user.get(pref)).toBe(value);
      await apply(section('zotero', [reset(key)]));
      expect(t.user.has(pref)).toBe(false);
    },
  );

  it('still stops the adapter if a write does not produce the requested value', async () => {
    const t = settingsSnapshotHostFixture();
    t.defaults.set('extensions.zotero.hideContextAnnotationRows', false);
    vi.spyOn(Services.prefs, 'setBoolPref').mockImplementation(() => {});
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const plan = await adapter.plan(
      section('zotero', [set('hideContextAnnotationRows', true), set('showTrashWhenEmpty', true)]),
      context(),
    );
    expect(await adapter.apply(selected(plan.changes), context())).toMatchObject([
      { key: 'hideContextAnnotationRows', status: 'failed' },
      { key: 'showTrashWhenEmpty', status: 'skipped' },
    ]);
    expect(t.user.has('extensions.zotero.showTrashWhenEmpty')).toBe(false);
  });

  it('does not invalidate WebDAV verification when the restored preference is already the default', async () => {
    const t = settingsSnapshotHostFixture();
    const key = 'sync.storage.scheme';
    const verified = 'extensions.zotero.sync.storage.verified';
    t.defaults.set(`extensions.zotero.${key}`, 'https');
    t.user.set(verified, true);
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const plan = await adapter.plan(section('zotero', [set(key, 'https')]), context());
    expect(await adapter.apply(selected(plan.changes), context())).toMatchObject([
      { key, status: 'unchanged' },
    ]);
    expect(t.user.get(verified)).toBe(true);
  });

  it('rejects foreign keys and unsupported schemas without exposing their values', async () => {
    settingsSnapshotHostFixture();
    const [native, neo] = createSettingsAdapters(() => 'neo-target');
    const nativePlan = await native!.plan(
      section('zotero', [
        set('extensions.foreign.password', 'sensitive-value'),
        set('sync.server.apiKey', 'sensitive-value'),
        set('sync.storage.verified', true),
      ]),
      context(),
    );
    expect(nativePlan.changes).toEqual([]);
    expect(nativePlan.issues).toHaveLength(3);
    expect(JSON.stringify(nativePlan.issues)).not.toContain('sensitive-value');
    const neoPlan = await neo!.plan(
      section('zotero-neo', [
        set('bindings.schemaVersion', 99),
        set('bindings', { schemaVersion: BINDING_SCHEMA_VERSION + 1, overrides: '{}' }),
        set('ai.configuration', '{"endpoint":"https://api.example","apiKey":"sensitive-value"}'),
      ]),
      context(),
    );
    expect(neoPlan.changes).toEqual([]);
    const retiredPlan = await neo!.plan(
      // Direct adapter callers also ignore retired fields before entry validation.
      section('zotero-neo', [
        set('tabEnhancements.side', 'right'),
        set('modules.tab-enhancements.enabled', true),
        { key: 'ai.configuration' } as SettingsEntry,
        set('ai.configuration', 'legacy duplicate'),
        set('secret:ai:not-an-endpoint', 'retired credential'),
      ]),
      context(),
    );
    expect(retiredPlan.changes).toEqual([]);
    expect(retiredPlan.issues.map(({ code }) => code)).toEqual(['foreign-field', 'foreign-field']);
    await expect(
      native!.plan({ ...section('zotero', []), schemaVersion: 2 }, context()),
    ).rejects.toMatchObject({ code: 'unsupported-schema' });
    expect(JSON.stringify(neoPlan.issues)).not.toContain('sensitive-value');
    const inheritedAction = await neo!.plan(
      section('zotero-neo', [
        set('bindings', {
          schemaVersion: BINDING_SCHEMA_VERSION,
          overrides: '{"reader-normal:x":"constructor"}',
        }),
      ]),
      context(),
    );
    expect(inheritedAction.changes).toEqual([]);
  });

  it('requires mapping only from context.paths, keeps system/internal handlers portable, and blocks code/data-directory mutation', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const input = section('zotero', [
      set('fileHandler.pdf', '/source-device/viewer'),
      set('fileHandler.epub', 'system'),
      set('fileHandler.snapshot', ''),
      set('dataDir', '/do-not-write'),
      set('baseAttachmentPath', '/old-base'),
      set('annotations.noteTemplates.highlight', '{{dangerous()}}'),
    ]);
    const initial = await adapter.plan(input, context());
    expect(
      initial.changes.find((change) => change.key === 'fileHandler.pdf')!.blocked,
    ).toBeTruthy();
    expect(
      initial.changes.find((change) => change.key === 'fileHandler.epub')!.blocked,
    ).toBeUndefined();
    const plan = await adapter.plan(input, {
      ...context(),
      paths: {
        'zotero:fileHandler.pdf': '/target-device/viewer',
        'fileHandler.snapshot': '/wrong-map-key',
      },
    });
    expect(plan.changes.find((change) => change.key === 'fileHandler.pdf')!.after).toEqual({
      kind: 'set',
      value: '/target-device/viewer',
    });
    const receipts = await adapter.apply(selected(plan.changes), context());
    expect(receipts.filter((receipt) => receipt.status === 'applied')).toHaveLength(3);
    expect(t.user.get('extensions.zotero.fileHandler.pdf')).toBe('/target-device/viewer');
    expect(t.user.get('extensions.zotero.fileHandler.epub')).toBe('system');
    expect(t.user.get('extensions.zotero.fileHandler.snapshot')).toBe('');
    expect(t.user.has('extensions.zotero.dataDir')).toBe(false);
    expect(t.user.has('extensions.zotero.annotations.noteTemplates.highlight')).toBe(false);
  });

  it('does not report a matching manual-only data directory as an unresolved difference', async () => {
    const t = settingsSnapshotHostFixture();
    t.user.set('extensions.zotero.dataDir', '/this-device/zotero-data');
    const native = createSettingsAdapters(() => 'neo-target')[0]!;
    const input = (value: string) =>
      section('zotero', [set('dataDir', value), set('fileHandler.epub', 'system')]);

    const matching = await native.plan(input('/this-device/zotero-data'), context());
    expect(matching.changes.map(({ key }) => key)).toEqual(['fileHandler.epub']);
    expect(matching.issues).toEqual([]);

    const different = await native.plan(input('/another-device/zotero-data'), context());
    expect(different.issues).toContainEqual(
      expect.objectContaining({ key: 'dataDir', code: 'manual-required' }),
    );
  });

  it('does not apply unchecked or forged preview changes, stale baselines, or retired contexts', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const plan = await adapter.plan(
      section('zotero', [set('automaticTags', false), set('fontSize', '1.1')]),
      context(),
    );
    t.user.set('extensions.zotero.automaticTags', true);
    const receipts = await adapter.apply(
      [
        { ...plan.changes[0]!, selected: true },
        { ...plan.changes[1]!, selected: true, after: { kind: 'set', value: 'forged' } },
      ],
      context(),
    );
    expect(receipts.map((receipt) => receipt.status)).toEqual(
      expect.arrayContaining(['conflict', 'skipped']),
    );
    expect(t.mutations).toEqual([]);
    const retired: SettingsOperationContext = {
      signal: new AbortController().signal,
      isCurrent: () => false,
    };
    expect(
      (await adapter.apply(selected(plan.changes), retired)).every(
        (receipt) => receipt.status === 'cancelled',
      ),
    ).toBe(true);
  });

  it('round-trips named owned secrets only on explicit secret capture, never puts secret values into labels/issues/receipts', async () => {
    const t = settingsSnapshotHostFixture();
    await saveMinerUToken('source-mineru');
    await changeReferenceKey('source-reference');
    const adapter = createSettingsAdapters(() => 'neo-target')[1]!;
    const excluded = await adapter.capture(captureContext());
    expect(excluded.section.entries.some((entry) => entry.key.startsWith('secret:'))).toBe(false);
    const included = await adapter.capture({ ...captureContext(), includeSecrets: true });
    expect(
      included.section.entries.filter((entry) => entry.key.startsWith('secret:')),
    ).toHaveLength(2);
    await saveMinerUToken('');
    await changeReferenceKey(null);
    const plan = await adapter.plan(included.section, context());
    const secretChanges = plan.changes.filter((change) => change.secret);
    const receipts = await adapter.apply(selected(secretChanges), context());
    expect(receipts.every((receipt) => receipt.status === 'applied')).toBe(true);
    expect(
      JSON.stringify({
        labels: secretChanges.map(({ label, category, blocked }) => ({ label, category, blocked })),
        issues: plan.issues,
        receipts,
      }),
    ).not.toMatch(/source-mineru|source-reference/);
    expect(t.records.map((login) => login.password)).toEqual(
      expect.arrayContaining(['source-mineru', 'source-reference']),
    );
    const repeated = await adapter.plan(included.section, context());
    expect(
      (
        await adapter.apply(selected(repeated.changes.filter((change) => change.secret)), context())
      ).every((receipt) => receipt.status === 'unchanged'),
    ).toBe(true);
  });

  it('checks cancellation and stale values inside queued credential admission, preserving normal writer semantics', async () => {
    const t = settingsSnapshotHostFixture();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = t.logins.addLoginAsync.getMockImplementation()!;
    t.logins.addLoginAsync.mockImplementationOnce(async (login) => {
      await pending;
      await original(login);
    });
    const first = saveMinerUToken('admitted-first');
    const c = context();
    const cancelled = saveMinerUToken('must-not-be-written', () => assertSettingsCurrent(c));
    c.controller.abort();
    release();
    await first;
    await expect(cancelled).rejects.toMatchObject({ code: 'cancelled' });
    expect(t.records.map((login) => login.password)).toEqual(['admitted-first']);
  });

  it('guards DB-backed library settings at transaction admission and binds them to account/library identity', async () => {
    const t = settingsSnapshotHostFixture();
    t.synced.set('1:tagColors', [{ name: 'old', color: '#000000' }]);
    t.synced.set('1:attachmentRenameTemplate', '{{ title }}');
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    expect(
      (await adapter.capture(captureContext())).section.entries.some((entry) =>
        entry.key.startsWith('library:'),
      ),
    ).toBe(false);
    const captured = await adapter.capture({ ...captureContext(), includeLibrarySettings: true });
    expect(
      captured.section.entries.some((entry) => entry.key === 'library:user:42:tagColors'),
    ).toBe(true);
    const plan = await adapter.plan(
      section('zotero', [
        set('library:user:42:tagColors', [{ name: 'new', color: '#ffffff' }]),
        set('library:user:42:attachmentRenameTemplate', '{{ firstCreator }} - {{ title }}'),
      ]),
      context(),
    );
    expect(plan.changes.every((change) => !change.selected && !change.blocked)).toBe(true);
    t.native.DB.executeTransaction.mockImplementationOnce(async (task) => {
      t.synced.set('1:tagColors', [{ name: 'manual', color: '#ff0000' }]);
      await task();
    });
    const receipts = await adapter.apply(selected(plan.changes), context());
    expect(receipts.find((receipt) => receipt.key.endsWith('tagColors'))!.status).toBe('conflict');
    expect(
      receipts.find((receipt) => receipt.key.endsWith('attachmentRenameTemplate'))!.status,
    ).toBe('skipped');
    expect(t.synced.get('1:attachmentRenameTemplate')).toBe('{{ title }}');
    const retry = await adapter.plan(
      section('zotero', [
        set('library:user:42:attachmentRenameTemplate', '{{ firstCreator }} - {{ title }}'),
      ]),
      context(),
    );
    expect((await adapter.apply(selected(retry.changes), context()))[0]!.status).toBe('applied');
    expect(t.synced.get('1:attachmentRenameTemplate')).toBe('{{ firstCreator }} - {{ title }}');
    t.native.Users.userID = 99;
    const otherAccount = await adapter.plan(
      section('zotero', [set('library:user:42:tagColors', [])]),
      context(),
    );
    expect(otherAccount.changes[0]!.blocked).toBeTruthy();
    expect((await adapter.apply(selected(otherAccount.changes), context()))[0]!.status).toBe(
      'skipped',
    );
  });

  it('writes real native per-site rows, portable Locate JSON, and CSL source metadata/text without fetching code or icons', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const style = customStyle();
    const locate = [
      {
        _name: 'Custom search',
        _alias: 'Custom',
        _hidden: false,
        _urlTemplate: 'https://search.example/?q={searchTerms}',
        _urlParams: {},
        _urlNamespaces: {},
      },
    ];
    const input = section('zotero', [
      set('quickCopy:sites', [
        {
          domainPath: 'example.org/path',
          format: 'bibliography=https://example.org/styles/custom',
        },
      ]),
      set('locate:engines', locate),
      set(`csl:${style.id}`, style),
    ]);
    const plan = await adapter.plan(input, context());
    expect(
      (await adapter.apply(selected(plan.changes), context())).every(
        (receipt) => receipt.status === 'applied',
      ),
    ).toBe(true);
    expect(t.sites).toEqual([
      { domainPath: 'example.org/path', format: 'bibliography=https://example.org/styles/custom' },
    ]);
    const locateState = plan.changes.find((change) => change.key === 'locate:engines')!.after;
    expect(locateState.kind).toBe('set');
    if (locateState.kind === 'set')
      expect(JSON.parse(t.files.get('/fixture-data/locate/engines.json')!)).toEqual(
        locateState.value,
      );
    expect(t.native.Styles.init).not.toHaveBeenCalled();
    expect(t.native.Styles.reinit).not.toHaveBeenCalled();
    expect(t.native.QuickCopy.loadSiteSettings).not.toHaveBeenCalled();
    expect(t.native.QuickCopy.uninit).not.toHaveBeenCalled();
    expect(t.liveSites).toEqual([]);
    expect([...t.files.values()]).toContain(style.text);
    const count = t.mutations.length;
    const repeated = await adapter.plan(input, context());
    expect(
      (await adapter.apply(selected(repeated.changes), context())).every(
        (receipt) => receipt.status === 'unchanged',
      ),
    ).toBe(true);
    expect(t.mutations).toHaveLength(count);
    const resetPlan = await adapter.plan(section('zotero', [reset('quickCopy:sites')]), context());
    expect((await adapter.apply(selected(resetPlan.changes), context()))[0]!.status).toBe(
      'applied',
    );
    expect(t.sites).toEqual([]);
  });

  it('rechecks a manually changed style after asynchronous validation and rejects code-bearing CSL', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const style = customStyle();
    const initial = await adapter.plan(
      section('zotero', [set(`csl:${style.id}`, style)]),
      context(),
    );
    await adapter.apply(selected(initial.changes), context());
    const updated = {
      ...style,
      text: style.text.replace('Custom', 'Imported edit'),
      title: 'Imported edit',
    };
    const plan = await adapter.plan(
      section('zotero', [set(`csl:${style.id}`, updated)]),
      context(),
    );
    t.native.Styles.validate.mockImplementationOnce(async () => {
      const path = [...t.files.keys()].find((entry) => entry.endsWith('.csl'))!;
      t.files.set(path, style.text.replace('Custom', 'Manual edit'));
    });
    expect((await adapter.apply(selected(plan.changes), context()))[0]!.status).toBe('conflict');
    const blocked = await adapter.plan(
      section('zotero', [
        set(`csl:${style.id}`, {
          ...style,
          text: '<!DOCTYPE style><script>doNotExecute()</script>',
        }),
      ]),
      context(),
    );
    expect(blocked.changes).toEqual([]);
  });

  it('stores WebDAV passwords for the exact named identity, invalidates verification, and guards async encryption cancellation', async () => {
    const t = settingsSnapshotHostFixture();
    t.user.set('extensions.zotero.sync.storage.username', 'dav-user');
    t.user.set('extensions.zotero.sync.storage.verified', true);
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const key = 'webdav:password:dav-user';
    const input = section('zotero', [
      set('sync.storage.scheme', 'https'),
      set('sync.storage.url', 'dav.example/storage'),
      set('sync.storage.username', 'dav-user'),
      set(key, 'dav-secret'),
    ]);
    const plan = await adapter.plan(input, context());
    const receipt = await adapter.apply(selected(plan.changes), context());
    expect(receipt.find((entry) => entry.key === key)!.status).toBe('applied');
    expect(t.user.get('extensions.zotero.sync.storage.verified')).toBe(false);
    expect(t.records[0]).toMatchObject({
      hostname: 'chrome://zotero',
      httpRealm: 'Zotero Storage Server (encrypted)',
      username: 'dav-user',
      password: 'encrypted:dav-secret',
    });
    const captured = await adapter.capture({ ...captureContext(), includeSecrets: true });
    expect(captured.section.entries.find((entry) => entry.key === key)!.state).toEqual({
      kind: 'set',
      value: 'dav-secret',
    });
    const c = context();
    const changed = await adapter.plan(section('zotero', [set(key, 'must-not-write')]), c);
    t.native.OSKeyStore.encrypt.mockImplementationOnce(async (text) => {
      c.controller.abort();
      return `encrypted:${text}`;
    });
    expect((await adapter.apply(selected(changed.changes), c))[0]!.status).toBe('cancelled');
    expect(t.records[0]!.password).toBe('encrypted:dav-secret');
    expect(
      JSON.stringify({
        labels: plan.changes.map((change) => change.label),
        issues: plan.issues,
        receipt,
      }),
    ).not.toContain('dav-secret');
  });

  it('stops remaining writes after a partial failure without disabling the owning module', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[1]!;
    const plan = await adapter.plan(
      section('zotero-neo', [
        set('modules.references.enabled', false),
        set('language', 'en'),
        set('keyGuide.delayMs', 0),
        set('secret:mineru', 'new-token'),
      ]),
      context(),
    );
    t.logins.addLoginAsync.mockRejectedValueOnce(
      new Error('secret-bearing-native-error-new-token'),
    );
    const receipts = await adapter.apply(selected(plan.changes), context());
    expect(receipts.find((receipt) => receipt.key === 'secret:mineru')!.status).toBe('failed');
    expect(receipts.find((receipt) => receipt.key === 'modules.references.enabled')).toMatchObject({
      status: 'skipped',
    });
    expect(t.user.has('extensions.zotero-neo.modules.references.enabled')).toBe(false);
    expect(t.mutations).not.toContain('extensions.zotero-neo.modules.references.enabled');
    expect(JSON.stringify(receipts)).not.toContain('new-token');
    expect(t.user.get('extensions.zotero-neo.language')).toBe('en');
  });

  it('migrates historical bindings with the owned migrator and retains admission across the service re-plan', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[1]!;
    const raw = JSON.stringify({
      'reader-normal:j': 'scrollDown',
      'reader-normal:H': 'scrollRight',
      'main-normal:x': 'mainActivate',
    });
    const input = section('zotero-neo', [set('bindings', { schemaVersion: 6, overrides: raw })]);
    const reviewed = await adapter.plan(input, context());
    expect(reviewed.sourceVersion).toBe('neo-target');
    expect(reviewed.issues.some((issue) => issue.code === 'binding-migration')).toBe(true);
    const change = reviewed.changes[0]!;
    expect(change.after.kind).toBe('set');
    if (
      change.after.kind !== 'set' ||
      change.after.value === null ||
      typeof change.after.value !== 'object' ||
      !('overrides' in change.after.value)
    )
      throw new Error('Expected canonical bindings');
    const migrated = JSON.parse(String(change.after.value.overrides)) as Record<string, string>;
    expect(migrated['reader-normal:j']).toBeUndefined();
    expect(migrated['main-normal:x']).toBe('mainActivate');
    await adapter.plan(
      section(
        'zotero-neo',
        reviewed.changes.map((entry) => ({ key: entry.key, state: entry.after })),
      ),
      context(),
    );
    expect((await adapter.apply(selected(reviewed.changes), context()))[0]!.status).toBe('applied');
    expect(t.user.get('extensions.zotero-neo.bindings.schemaVersion')).toBe(BINDING_SCHEMA_VERSION);
    expect(JSON.parse(String(t.user.get('extensions.zotero-neo.bindings')))).toEqual(migrated);
  });

  it('keeps custom theme references opt-in and restores their selected identity-bound themes before using them', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const theme = {
      id: 'custom-transfer',
      label: 'Custom',
      background: '#ffffff',
      foreground: '#000000',
    };
    const missing = await adapter.plan(
      section('zotero', [set('reader.lightTheme', theme.id)]),
      context(),
    );
    expect(missing.changes[0]!.blocked).toBeTruthy();
    const input = section('zotero', [
      set('reader.lightTheme', theme.id),
      set('library:user:42:readerCustomThemes', [theme]),
    ]);
    const plan = await adapter.plan(input, context());
    expect(plan.changes.every((change) => !change.selected && !change.blocked)).toBe(true);
    const receipts = await adapter.apply(selected(plan.changes), context());
    expect(receipts.every((receipt) => receipt.status === 'applied')).toBe(true);
    expect(t.user.get('extensions.zotero.reader.lightTheme')).toBe(theme.id);
    expect(t.mutations.indexOf('library:1:readerCustomThemes')).toBeLessThan(
      t.mutations.indexOf('extensions.zotero.reader.lightTheme'),
    );
  });

  it('orders selected CSL parents before children and rejects mismatched CSL metadata instead of claiming success', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const parent = customStyle('https://example.org/styles/parent');
    const child = { ...customStyle('https://example.org/styles/child'), source: parent.id };
    child.text = child.text.replace(
      '</info>',
      `<link rel="independent-parent" href="${parent.id}"/></info>`,
    );
    const plan = await adapter.plan(
      section('zotero', [set(`csl:${child.id}`, child), set(`csl:${parent.id}`, parent)]),
      context(),
    );
    expect(
      (await adapter.apply(selected(plan.changes), context())).every(
        (receipt) => receipt.status === 'applied',
      ),
    ).toBe(true);
    const paths = [...t.files.keys()];
    expect(t.files.get(paths[0]!)).toBe(parent.text);
    expect([...t.files.values()]).toContain(child.text);
    const captured = await adapter.capture(captureContext());
    expect(
      captured.section.entries.find((entry) => entry.key === `csl:${child.id}`)!.state,
    ).toEqual({
      kind: 'set',
      value: child,
    });
    expect(t.native.Styles.reinit).not.toHaveBeenCalled();
    const bad = { ...customStyle('https://example.org/styles/bad'), title: 'Forged metadata' };
    const badPlan = await adapter.plan(section('zotero', [set(`csl:${bad.id}`, bad)]), context());
    expect((await adapter.apply(selected(badPlan.changes), context()))[0]!.status).toBe('failed');
    expect(t.native.Styles.getAll()[bad.id]).toBeUndefined();
  });
  it('keeps planning read-only even when native style initialization would migrate preferences or delete renamed files', async () => {
    const t = settingsSnapshotHostFixture();
    const oldStyle = customStyle('http://www.zotero.org/styles/old-name');
    const newStyle = customStyle('http://www.zotero.org/styles/new-name');
    t.renamed['old-name'] = 'new-name';
    installFixtureStyle(t, oldStyle);
    installFixtureStyle(t, newStyle);
    t.user.set('extensions.zotero.export.bibliographyLocale', 'fr-FR');
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const count = t.files.size;
    await adapter.capture(captureContext());
    const plan = await adapter.plan(
      section('zotero', [set(`csl:${oldStyle.id}`, oldStyle)]),
      context(),
    );
    expect(plan.changes[0]!.blocked).toMatch(/Renamed/u);
    expect(t.native.Styles.init).not.toHaveBeenCalled();
    expect(t.native.Styles.reinit).not.toHaveBeenCalled();
    expect(t.files.size).toBe(count);
    expect(t.mutations).toEqual([]);
    expect(t.user.get('extensions.zotero.export.bibliographyLocale')).toBe('fr-FR');
  });

  it('blocks mutually renamed selected CSL styles and collisions appearing after preview without deleting either file', async () => {
    const t = settingsSnapshotHostFixture();
    t.renamed['old-name'] = 'new-name';
    const oldStyle = customStyle('http://www.zotero.org/styles/old-name');
    const newStyle = customStyle('http://www.zotero.org/styles/new-name');
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const collision = await adapter.plan(
      section('zotero', [set(`csl:${oldStyle.id}`, oldStyle), set(`csl:${newStyle.id}`, newStyle)]),
      context(),
    );
    expect(collision.changes.every((change) => !!change.blocked)).toBe(true);
    expect(
      (await adapter.apply(selected(collision.changes), context())).every(
        (receipt) => receipt.status === 'skipped',
      ),
    ).toBe(true);
    const plan = await adapter.plan(
      section('zotero', [set(`csl:${oldStyle.id}`, oldStyle), set('fontSize', '1.2')]),
      context(),
    );
    installFixtureStyle(t, newStyle);
    const receipts = await adapter.apply(selected(plan.changes), context());
    expect(receipts.map((receipt) => receipt.status)).toEqual(['failed', 'skipped']);
    expect([...t.files.values()]).toEqual([newStyle.text]);
    expect(t.native.Styles.reinit).not.toHaveBeenCalled();
  });

  it('persists selected CSL and its Quick Copy consumers in one import and defers native activation until restart', async () => {
    const t = settingsSnapshotHostFixture();
    const style = customStyle();
    const format = JSON.stringify({ mode: 'bibliography', contentType: 'html', id: style.id });
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const plan = await adapter.plan(
      section('zotero', [
        set('export.quickCopy.setting', format),
        set('quickCopy:sites', [{ domainPath: 'example.org', format }]),
        set(`csl:${style.id}`, style),
      ]),
      context(),
    );
    const receipts = await adapter.apply(selected(plan.changes), context());
    expect(
      receipts.every((receipt) => receipt.status === 'applied' && receipt.requiresRestart),
    ).toBe(true);
    expect(t.user.get('extensions.zotero.export.quickCopy.setting')).toBe(format);
    expect(t.sites).toEqual([{ domainPath: 'example.org', format }]);
    expect(t.native.Styles.getAll()[style.id]).toBeUndefined();
    expect(t.liveSites).toEqual([]);
    expect(t.preloaded).toEqual([]);
    expect(t.native.Styles.reinit).not.toHaveBeenCalled();
    expect(t.mutations.findIndex((entry) => entry.endsWith('.csl'))).toBeLessThan(
      t.mutations.indexOf('extensions.zotero.export.quickCopy.setting'),
    );
    // Model a subsequent native startup: persisted XML is loaded before consumers preload.
    await t.native.Styles.reinit();
    await t.native.QuickCopy.init();
    expect(t.preloaded).toContain(style.id);
    expect(t.liveSites).toEqual(t.sites);
    expect(t.files.get(t.native.Styles.getAll()[style.id]!.path)).toBe(style.text);
  });

  it('rejects missing or unselected Quick Copy style dependencies before any DB or preference mutation', async () => {
    const t = settingsSnapshotHostFixture();
    const style = customStyle();
    const format = `bibliography=${style.id}`;
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const consumers = [
      set('quickCopy:sites', [{ domainPath: 'example.org', format }]),
      set('export.quickCopy.setting', format),
    ];
    const missing = await adapter.plan(section('zotero', consumers), context());
    expect(missing.changes.every((change) => !!change.blocked)).toBe(true);
    const plan = await adapter.plan(
      section('zotero', [...consumers, set(`csl:${style.id}`, style)]),
      context(),
    );
    const receipts = await adapter.apply(
      selected(plan.changes.filter((change) => !change.key.startsWith('csl:'))),
      context(),
    );
    expect(receipts.map((receipt) => receipt.status)).toEqual(['failed', 'skipped']);
    expect(t.native.DB.executeTransaction).not.toHaveBeenCalled();
    expect(t.mutations).toEqual([]);
  });

  it('does not report CSL success if native file persistence fails after the write', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const style = customStyle();
    const plan = await adapter.plan(
      section('zotero', [set(`csl:${style.id}`, style), set('fontSize', '1.2')]),
      context(),
    );
    t.fileIO.writeUTF8.mockImplementationOnce(async () => {});
    const receipts = await adapter.apply(selected(plan.changes), context());
    expect(receipts.map((receipt) => receipt.status)).toEqual(['failed', 'skipped']);
    expect(t.native.Styles.reinit).not.toHaveBeenCalled();
    expect(t.mutations).toEqual([]);
  });

  it('canonicalizes native Locate constructor defaults and empty associative parameters across repeated imports', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const input = section('zotero', [
      set('locate:engines', [
        {
          _urlTemplate: 'https://search.example/?q={searchTerms}',
          _urlParams: [],
        },
      ]),
    ]);
    const plan = await adapter.plan(input, context());
    expect((await adapter.apply(selected(plan.changes), context()))[0]!.status).toBe('applied');
    const captured = await adapter.capture(captureContext());
    expect(captured.section.entries.find((entry) => entry.key === 'locate:engines')!.state).toEqual(
      {
        kind: 'set',
        value: [
          {
            _alias: 'Untitled',
            _name: 'Untitled',
            _description: null,
            _hidden: false,
            _urlTemplate: 'https://search.example/?q={searchTerms}',
            _urlParams: {},
          },
        ],
      },
    );
    const count = t.mutations.length;
    const repeat = await adapter.plan(input, context());
    expect((await adapter.apply(selected(repeat.changes), context()))[0]!.status).toBe('unchanged');
    expect(t.mutations).toHaveLength(count);
    expect(t.native.LocateManager.init).toHaveBeenCalledTimes(1);
  });

  it('rejects signed-32-bit overflow before the native integer conversion can narrow the value', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const rejected = await adapter.plan(
      section('zotero', [set('backup.interval', 4294967296), set('backup.numBackups', 2147483648)]),
      context(),
    );
    expect(rejected.changes).toEqual([]);
    expect(rejected.issues).toHaveLength(2);
    expect(t.mutations).toEqual([]);
  });

  it('captures and plans current binding overrides with retired actions without discarding usable binds', async () => {
    const t = settingsSnapshotHostFixture();
    const adapter = createSettingsAdapters(() => 'neo-target')[1]!;
    const prefix = 'extensions.zotero-neo.';
    const retained = { 'reader-normal:<Space>aa': 'scrollDown', 'reader-normal:j': null };
    const overrides = JSON.stringify({
      'reader-normal:aq': 'openReaderAI',
      'reader-normal:ax': 'openAIQA',
      ...retained,
    });
    t.user.set(prefix + 'bindings.schemaVersion', BINDING_SCHEMA_VERSION);
    t.user.set(prefix + 'bindings', overrides);
    const input = { schemaVersion: BINDING_SCHEMA_VERSION, overrides };
    const canonical = { ...input, overrides: JSON.stringify(retained) };
    const captured = await adapter.capture(captureContext());
    expect(captured.section.entries).toEqual([set('bindings', canonical)]);
    expect(captured.issues.map(({ code }) => code)).not.toContain('invalid-field');
    const plan = await adapter.plan(section(adapter.id, [set('bindings', input)]), context());
    expect(plan.changes).toMatchObject([
      { key: 'bindings', after: { kind: 'set', value: canonical } },
    ]);
    expect(plan.issues).toEqual([]);
    expect(t.user.get(prefix + 'bindings')).toBe(overrides);
    expect(t.mutations).toEqual([]);
  });

  it('blocks a replacement that would delete an earlier staged renamed style at native restart', async () => {
    const t = settingsSnapshotHostFixture();
    t.renamed['old-name'] = 'new-name';
    const oldStyle = customStyle('http://www.zotero.org/styles/old-name');
    const newStyle = customStyle('http://www.zotero.org/styles/new-name');
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const first = await adapter.plan(
      section('zotero', [set(`csl:${oldStyle.id}`, oldStyle)]),
      context(),
    );
    expect((await adapter.apply(selected(first.changes), context()))[0]).toMatchObject({
      status: 'applied',
      requiresRestart: true,
    });
    const collision = await adapter.plan(
      section('zotero', [set(`csl:${newStyle.id}`, newStyle)]),
      context(),
    );
    expect(collision.changes[0]!.blocked).toMatch(/Renamed/u);
    expect((await adapter.apply(selected(collision.changes), context()))[0]!.status).toBe(
      'skipped',
    );
    expect([...t.files.values()]).toEqual([oldStyle.text]);
  });

  it('keeps restart required after an admitted Quick Copy observer retirement fails to persist its preference', async () => {
    const t = settingsSnapshotHostFixture();
    const style = customStyle();
    const adapter = createSettingsAdapters(() => 'neo-target')[0]!;
    const plan = await adapter.plan(
      section('zotero', [
        set(`csl:${style.id}`, style),
        set('export.quickCopy.setting', `bibliography=${style.id}`),
        set('fontSize', '1.2'),
      ]),
      context(),
    );
    t.native.QuickCopy.uninit.mockImplementationOnce(() => {
      throw new Error('Native observer retirement failed');
    });
    const receipts = await adapter.apply(selected(plan.changes), context());
    expect(receipts.map((receipt) => receipt.status)).toEqual(['applied', 'failed', 'skipped']);
    expect(receipts[1]!.requiresRestart).toBe(true);
    expect(t.user.has('extensions.zotero.export.quickCopy.setting')).toBe(false);
    expect(t.mutations).not.toContain('extensions.zotero.fontSize');
  });

  it('stops after a late conflict or cancellation and reports every unadmitted entry', async () => {
    for (const cancel of [false, true]) {
      const t = settingsSnapshotHostFixture();
      const adapter = createSettingsAdapters(() => 'neo-target')[1]!;
      const c = context();
      const plan = await adapter.plan(
        section('zotero-neo', [
          set('language', 'en'),
          set('keyGuide.delayMs', 0),
          set('modules.references.enabled', false),
        ]),
        c,
      );
      if (cancel) c.controller.abort();
      else t.user.set('extensions.zotero-neo.language', 'manual');
      const receipts = await adapter.apply(selected(plan.changes), c);
      expect(receipts.map((receipt) => receipt.status)).toEqual([
        cancel ? 'cancelled' : 'conflict',
        cancel ? 'cancelled' : 'skipped',
        cancel ? 'cancelled' : 'skipped',
      ]);
      expect(t.mutations).toEqual([]);
    }
  });
});
