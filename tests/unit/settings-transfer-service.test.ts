import { expect, it, vi } from 'vitest';
import type {
  SettingsAdapter,
  SettingsChange,
  SettingsCryptoContext,
  SettingsDocument,
  SettingState,
} from '../../src/settings-transfer/contracts';
import {
  parseSettingsDocument,
  sameSettingState,
  serializeSettingsDocument,
  settingStateText,
} from '../../src/settings-transfer/document';
import { SettingsTransferService, settingsChangeID } from '../../src/settings-transfer/service';

const set = (value: boolean | number | string): SettingState => ({ kind: 'set', value });
const reset: SettingState = { kind: 'reset' };
function documentFor(id: string, values: Record<string, SettingState>): SettingsDocument {
  return {
    format: 'zotero-neo-settings',
    schemaVersion: 1,
    createdAt: '2026-11-17T00:00:00Z',
    producer: { name: 'Zotero Neo', version: '1' },
    zoteroVersion: '10',
    sections: [
      {
        adapterID: id,
        schemaVersion: 1,
        sourceVersion: '1',
        entries: Object.entries(values).map(([key, state]) => ({ key, state })),
      },
    ],
  };
}
function fixture(id = 'zotero-neo') {
  const values = new Map<string, SettingState>([
    ['flag', set(true)],
    ['count', set(5)],
    ['empty', set('old')],
    ['default', set('override')],
  ]);
  const apply = vi.fn(async (changes: readonly SettingsChange[]) =>
    changes.map((change) => {
      if (!change.selected) throw new Error('Unselected setting admitted');
      const before = values.get(change.key) ?? reset;
      if (!sameSettingState(before, change.before))
        return { adapterID: id, key: change.key, status: 'conflict' as const };
      const unchanged = sameSettingState(before, change.after);
      values.set(change.key, change.after);
      return {
        adapterID: id,
        key: change.key,
        status: unchanged ? ('unchanged' as const) : ('applied' as const),
      };
    }),
  );
  const adapter: SettingsAdapter = {
    id,
    label: id,
    schemaVersion: 1,
    sourceVersion: '2',
    capture: async () => ({
      section: documentFor(id, Object.fromEntries(values)).sections[0]!,
      issues: [],
    }),
    plan: async (section) => ({
      adapterID: id,
      sourceVersion: '2',
      issues: [],
      changes: section.entries.map(({ key, state }) => ({
        adapterID: id,
        key,
        label: key,
        category: 'preferences',
        secret: key === 'secret',
        before: values.get(key) ?? reset,
        after: state,
        selected: false,
        requiresRestart: false,
      })),
    }),
    apply,
  };
  return { adapter, values, apply };
}
function context(abort = new AbortController()): SettingsCryptoContext {
  return { window: {} as Window, signal: abort.signal, isCurrent: () => true };
}
const serviceFor = (...adapters: SettingsAdapter[]) =>
  new SettingsTransferService(adapters, () => ({ neo: '2', zotero: '10' }));
const selected = (id: string, ...keys: string[]) =>
  new Set(keys.map((key) => settingsChangeID(id, key)));

it('preserves false, zero, empty strings and explicit resets, and keeps absent fields out of the backup and restore', async () => {
  const { adapter, values } = fixture(),
    service = serviceFor(adapter),
    ctx = context();
  const input = documentFor(adapter.id, {
    flag: set(false),
    count: set(0),
    empty: set(''),
    default: reset,
  });
  const parsed = parseSettingsDocument(serializeSettingsDocument(input));
  const plan = await service.plan(parsed, ctx);
  let backup: SettingsDocument | undefined;
  const receipt = await service.apply(
    plan,
    selected(adapter.id, 'flag', 'count', 'default'),
    ctx,
    async (value) => {
      backup = value;
      return '/backup.age';
    },
  );
  expect(values.get('flag')).toEqual(set(false));
  expect(values.get('count')).toEqual(set(0));
  expect(values.get('default')).toEqual(reset);
  expect(values.get('empty')).toEqual(set('old'));
  expect(backup?.sections[0]).toEqual({
    adapterID: adapter.id,
    schemaVersion: 1,
    sourceVersion: '2',
    entries: [
      { key: 'flag', state: set(true) },
      { key: 'count', state: set(5) },
      { key: 'default', state: set('override') },
    ],
  });
  expect(receipt.entries.map((entry) => entry.status)).toEqual(['applied', 'applied', 'applied']);
  const repeated = await service.plan(input, ctx);
  const again = await service.apply(
    repeated,
    selected(adapter.id, 'flag', 'count', 'default'),
    ctx,
    async () => '/backup-2.age',
  );
  expect(again.entries.map((entry) => entry.status)).toEqual([
    'unchanged',
    'unchanged',
    'unchanged',
  ]);
});

it('never admits changes if encrypted backup publication fails or returns no acknowledged path', async () => {
  const { adapter, apply, values } = fixture(),
    service = serviceFor(adapter),
    ctx = context();
  const plan = await service.plan(documentFor(adapter.id, { flag: set(false) }), ctx);
  await expect(
    service.apply(plan, selected(adapter.id, 'flag'), ctx, async () => {
      throw new Error('Disk is full');
    }),
  ).rejects.toThrow('Disk is full');
  await expect(
    service.apply(plan, selected(adapter.id, 'flag'), ctx, async () => ''),
  ).rejects.toMatchObject({ code: 'backup-unavailable' });
  expect(apply).not.toHaveBeenCalled();
  expect(values.get('flag')).toEqual(set(true));
});

it('rejects a changed review baseline before creating a backup', async () => {
  const { adapter, values, apply } = fixture(),
    service = serviceFor(adapter),
    ctx = context(),
    backup = vi.fn(async () => '/backup.age');
  const plan = await service.plan(documentFor(adapter.id, { count: set(0) }), ctx);
  values.set('count', set(9));
  await expect(
    service.apply(plan, selected(adapter.id, 'count'), ctx, backup),
  ).rejects.toMatchObject({ code: 'stale-plan' });
  expect(backup).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  expect(values.get('count')).toEqual(set(9));
});

it('cancels admission after awaiting the backup and holds the application-wide operation slot until then', async () => {
  const { adapter, apply } = fixture(),
    service = serviceFor(adapter),
    abort = new AbortController(),
    ctx = context(abort);
  const plan = await service.plan(documentFor(adapter.id, { flag: set(false) }), ctx);
  const gate = Promise.withResolvers<string>();
  const backup = vi.fn(() => gate.promise);
  const pending = service.apply(plan, selected(adapter.id, 'flag'), ctx, backup);
  await vi.waitFor(() => expect(backup).toHaveBeenCalledOnce());
  await expect(
    service.capture(new Set([adapter.id]), {
      ...ctx,
      includeSecrets: false,
      includeLibrarySettings: false,
    }),
  ).rejects.toMatchObject({ code: 'busy' });
  abort.abort();
  gate.resolve('/backup.age');
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  expect(apply).not.toHaveBeenCalled();
});

it('keeps an unacknowledged partial write visible and skips later adapters instead of claiming rollback or success', async () => {
  const first = fixture('zotero'),
    second = fixture(),
    service = serviceFor(first.adapter, second.adapter),
    ctx = context();
  first.apply.mockImplementation(async (changes) => {
    first.values.set(changes[0]!.key, changes[0]!.after);
    return [];
  });
  const input = documentFor(first.adapter.id, { flag: set(false) });
  const combined = {
    ...input,
    sections: [...input.sections, ...documentFor(second.adapter.id, { count: set(0) }).sections],
  };
  const plan = await service.plan(combined, ctx);
  const receipt = await service.apply(
    plan,
    new Set([...selected(first.adapter.id, 'flag'), ...selected(second.adapter.id, 'count')]),
    ctx,
    async () => '/backup.age',
  );
  expect(first.values.get('flag')).toEqual(set(false));
  expect(second.apply).not.toHaveBeenCalled();
  expect(receipt.entries.map((entry) => entry.status)).toEqual(['failed', 'skipped']);
  expect(receipt.entries[0]!.message).toContain('review the current value');
  expect(receipt.backupPath).toBe('/backup.age');
});

it('reports unknown adapters without executing them and refuses unknown envelope versions and unsafe nested keys', async () => {
  const { adapter, apply } = fixture(),
    service = serviceFor(adapter);
  const unknown = documentFor('other-plugin', { flag: set(false) });
  const plan = await service.plan(unknown, context());
  expect(plan.plans).toEqual([]);
  expect(plan.issues[0]?.code).toBe('unsupported-adapter');
  expect(apply).not.toHaveBeenCalled();
  expect(() => parseSettingsDocument(JSON.stringify({ ...unknown, schemaVersion: 2 }))).toThrow(
    'version is not supported',
  );
  const hostile = JSON.stringify(documentFor(adapter.id, { flag: set(false) })).replace(
    '"value":false',
    '"value":{"__proto__":{"polluted":true}}',
  );
  expect(() => parseSettingsDocument(hostile)).toThrow('unsafe object key');
  expect({}).not.toHaveProperty('polluted');
});

it('bounds nesting, rejects duplicate fields and invalid operations, and never exposes secret values in previews', () => {
  const input = documentFor('zotero', { flag: set(false) });
  const duplicate = {
    ...input,
    sections: [
      {
        ...input.sections[0]!,
        entries: [...input.sections[0]!.entries, ...input.sections[0]!.entries],
      },
    ],
  };
  expect(() => parseSettingsDocument(JSON.stringify(duplicate))).toThrow(
    'duplicate settings entry',
  );
  let nested: unknown = 'leaf';
  for (let depth = 0; depth < 34; depth++) nested = [nested];
  const deep = JSON.stringify(input).replace('"value":false', `"value":${JSON.stringify(nested)}`);
  expect(() => parseSettingsDocument(deep)).toThrow('deeply nested');
  const invalid = JSON.stringify(input).replace(
    '"kind":"set","value":false',
    '"kind":"execute","value":"script"',
  );
  expect(() => parseSettingsDocument(invalid)).toThrow('Unknown settings operation');
  expect(settingStateText(set('private-password'), true)).not.toContain('private-password');
  expect(sameSettingState(set(false), reset)).toBe(false);
  expect(sameSettingState(set(0), set(''))).toBe(false);
});
