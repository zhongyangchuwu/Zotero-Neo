import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewedPreferenceAdapter } from '../../src/settings-snapshots/adapters/preferences';
import { discoverPluginTemplates } from '../../src/settings-snapshots/templates/scanner';
import { SettingsSnapshotService, settingsChangeID } from '../../src/settings-snapshots/service';
import type { SettingState, SettingsDocument } from '../../src/settings-snapshots/contracts';
import type { SettingsTemplateHost } from '../../src/platform/settings-snapshot-templates';
import {
  readTransferPreference,
  writeTransferPreference,
} from '../../src/platform/settings-snapshots-host';
import { settingsSnapshotHostFixture } from './settings-snapshots-host-fixture';

const set = (value: boolean | number | string): SettingState => ({ kind: 'set', value });
const reset: SettingState = { kind: 'reset' };
const count = 'extensions.sample.count',
  mode = 'extensions.sample.mode',
  choice = 'extensions.sample.choice';
function fixture() {
  const values = new Map<string, SettingState>([
    [count, set(5)],
    [mode, set('a')],
    [choice, set(1)],
  ]);
  const host: SettingsTemplateHost = {
    digest: (text) => createHash('sha256').update(text).digest('hex'),
    preferenceType: (key) => (key === mode ? 'string' : 'number'),
    defaultPreferenceType: (key) => (key === mode ? 'string' : 'number'),
    readPreference: (key) => values.get(key) ?? reset,
    writePreference: vi.fn<SettingsTemplateHost['writePreference']>((key, state, admit) => {
      admit();
      values.set(key, state);
      return 'exact';
    }),
    plugins: async () => [],
    scanBindings: async () => new Set<string>(),
    readFiles: async () => [],
    writeFile: async () => {
      throw new Error('Not part of reviewed preference operations');
    },
    observePlugins: () => () => {},
  };
  const [draft] = discoverPluginTemplates(
    [
      {
        id: 'sample@test',
        label: 'Sample',
        version: '1.0',
        available: true,
        issues: [],
        defaults: [
          {
            source: 'prefs.js',
            text: `pref("${count}", 5); pref("${mode}", "a"); pref("${choice}", 1);`,
          },
        ],
        panes: [
          {
            source: 'preferences.xhtml',
            text:
              `<input type="number" data-preference="${count}" min="1" max="10"/>` +
              `<select data-preference="${mode}"><option value="a">A</option><option value="b">B</option></select>` +
              `<radiogroup preference="${choice}"><radio value="1"/><radio value="2"/></radiogroup>`,
          },
        ],
      },
    ],
    host,
  );
  const template = { ...draft!, status: 'reviewed' as const, reviewedKeys: [count, mode, choice] };
  const adapter = new ReviewedPreferenceAdapter(
    template,
    host,
    async () => {},
    () => true,
  );
  const service = new SettingsSnapshotService([adapter], () => ({ neo: '1', zotero: '10' }));
  const context = {
    window: {} as Window,
    signal: new AbortController().signal,
    isCurrent: () => true,
    container: 'age' as const,
    includeSecrets: false,
    includeLibrarySettings: false,
  };
  const document = (entries: Record<string, SettingState>): SettingsDocument => ({
    format: 'zotero-neo-settings',
    schemaVersion: 1,
    createdAt: '2026-11-17T00:00:00Z',
    producer: { name: 'Zotero Neo', version: '1' },
    zoteroVersion: '10',
    sections: [
      {
        adapterID: adapter.id,
        schemaVersion: 1,
        sourceVersion: '1.0',
        entries: Object.entries(entries).map(([key, state]) => ({ key, state })),
      },
    ],
  });
  const selected = (...keys: string[]) =>
    new Set(keys.map((key) => settingsChangeID(adapter.id, key)));
  return { values, host, adapter, service, context, document, selected, template };
}

afterEach(() => vi.unstubAllGlobals());

describe('locally reviewed preference control constraints', () => {
  it.each([
    [count, 0],
    [count, 11],
    [mode, 'unlisted'],
    [choice, 3],
  ] as const)('never plans or writes out-of-policy values: %s = %s', async (key, value) => {
    const f = fixture(),
      verifySource = vi.fn(async () => {});
    const plan = await f.service.plan(f.document({ [key]: set(value) }), f.context);
    expect(plan.plans[0]!.changes).toEqual([]);
    expect(plan.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid-field' })]),
    );
    await expect(
      f.service.apply(plan, f.selected(key), f.context, verifySource),
    ).rejects.toMatchObject({
      code: 'empty-selection',
    });
    expect(f.host.writePreference).not.toHaveBeenCalled();
    expect(verifySource).not.toHaveBeenCalled();
  });

  it.each([1, 10])(
    'keeps inclusive numeric bounds and listed enum values writable: %s',
    async (value) => {
      const f = fixture();
      const plan = await f.service.plan(
        f.document({ [count]: set(value), [mode]: set('b'), [choice]: set(2) }),
        f.context,
      );
      const receipt = await f.service.apply(
        plan,
        f.selected(count, mode, choice),
        f.context,
        async () => {},
      );
      expect(receipt.entries.map((entry) => entry.status)).toEqual([
        'applied',
        'applied',
        'applied',
      ]);
      expect(f.values.get(count)).toEqual(set(value));
      expect(f.values.get(mode)).toEqual(set('b'));
      expect(f.values.get(choice)).toEqual(set(2));
    },
  );

  it('restores the effective default of a reviewed preference without stopping later writes', async () => {
    const { defaults, user } = settingsSnapshotHostFixture();
    defaults.set(count, 5);
    defaults.set(mode, 'a');
    const f = fixture();
    f.host.readPreference = readTransferPreference;
    f.host.writePreference = writeTransferPreference;
    const plan = await f.service.plan(f.document({ [count]: set(5), [mode]: set('b') }), f.context);
    const receipt = await f.service.apply(plan, f.selected(count, mode), f.context, async () => {});
    expect(receipt.entries).toMatchObject([
      { key: count, status: 'unchanged' },
      { key: mode, status: 'applied' },
    ]);
    expect(user.has(count)).toBe(false);
    expect(user.get(mode)).toBe('b');
  });

  it('preserves resets for bounded numbers and enumerations, including invalid existing overrides', async () => {
    const f = fixture();
    f.values.set(count, set(99));
    f.values.set(mode, set('obsolete'));
    const plan = await f.service.plan(
      f.document({ [count]: reset, [mode]: reset, [choice]: reset }),
      f.context,
    );
    const receipt = await f.service.apply(
      plan,
      f.selected(count, mode, choice),
      f.context,
      async () => {},
    );
    expect(receipt.entries.map((entry) => entry.status)).toEqual(['applied', 'applied', 'applied']);
    for (const key of [count, mode, choice]) expect(f.values.get(key)).toEqual(reset);
  });

  it('allows replacing an invalid override with a valid value but omits it from capture', async () => {
    const f = fixture();
    f.values.set(count, set(99));
    const captured = await f.adapter.capture(f.context);
    expect(captured.section.entries.some((entry) => entry.key === count)).toBe(false);
    expect(captured.issues).toEqual([expect.objectContaining({ code: 'invalid-field' })]);
    const plan = await f.service.plan(f.document({ [count]: set(10) }), f.context);
    const receipt = await f.service.apply(plan, f.selected(count), f.context, async () => {});
    expect(receipt.entries[0]!.status).toBe('applied');
    expect(f.values.get(count)).toEqual(set(10));
  });

  it('rejects a changed live template at final admission after source verification', async () => {
    const f = fixture();
    let current = true;
    const adapter = new ReviewedPreferenceAdapter(
      f.template,
      f.host,
      async () => {},
      () => current,
    );
    const service = new SettingsSnapshotService([adapter], () => ({ neo: '1', zotero: '10' }));
    const plan = await service.plan(f.document({ [count]: set(10) }), f.context);
    const receipt = await service.apply(plan, f.selected(count), f.context, async () => {
      current = false;
    });
    expect(receipt.entries[0]!.status).toBe('conflict');
    expect(f.host.writePreference).not.toHaveBeenCalled();
  });

  it('does not admit a forged out-of-range change after a valid adapter preview', async () => {
    const f = fixture();
    const plan = await f.adapter.plan(f.document({ [count]: set(10) }).sections[0]!, f.context);
    const [change] = plan.changes;
    const receipt = await f.adapter.apply(
      [{ ...change!, selected: true, after: set(11) }],
      f.context,
    );
    expect(receipt[0]!.status).toBe('skipped');
    expect(f.host.writePreference).not.toHaveBeenCalled();
    const valid = await f.adapter.apply([{ ...change!, selected: true }], f.context);
    expect(valid[0]!.status).toBe('applied');
    expect(f.values.get(count)).toEqual(set(10));
  });
});
