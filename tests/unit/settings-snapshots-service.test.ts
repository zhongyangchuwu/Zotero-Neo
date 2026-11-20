import { expect, it, vi } from 'vitest';
import type {
  SettingsAdapter,
  SettingsChange,
  SettingsCryptoContext,
  SettingsDocument,
  SettingState,
} from '../../src/settings-snapshots/contracts';
import {
  parseSettingsDocument,
  sameSettingState,
  serializeSettingsDocument,
  settingStateText,
} from '../../src/settings-snapshots/document';
import { SettingsSnapshotService, settingsChangeID } from '../../src/settings-snapshots/service';

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
  new SettingsSnapshotService(adapters, () => ({ neo: '2', zotero: '10' }));
const selected = (id: string, ...keys: string[]) =>
  new Set(keys.map((key) => settingsChangeID(id, key)));

it('restores selected false, zero and explicit resets without touching unselected values', async () => {
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
  const receipt = await service.apply(
    plan,
    selected(adapter.id, 'flag', 'count', 'default'),
    ctx,
    async () => {},
  );
  expect(values.get('flag')).toEqual(set(false));
  expect(values.get('count')).toEqual(set(0));
  expect(values.get('default')).toEqual(reset);
  expect(values.get('empty')).toEqual(set('old'));
  expect(receipt.entries.map((entry) => entry.status)).toEqual(['applied', 'applied', 'applied']);
  const repeated = await service.plan(input, ctx);
  const again = await service.apply(
    repeated,
    selected(adapter.id, 'flag', 'count', 'default'),
    ctx,
    async () => {},
  );
  expect(again.entries.map((entry) => entry.status)).toEqual([
    'unchanged',
    'unchanged',
    'unchanged',
  ]);
});

it('admits no settings if final source verification rejects', async () => {
  const { adapter, apply, values } = fixture(),
    service = serviceFor(adapter),
    ctx = context();
  const plan = await service.plan(documentFor(adapter.id, { flag: set(false) }), ctx);
  await expect(
    service.apply(plan, selected(adapter.id, 'flag'), ctx, async () => {
      throw new Error('Source contents changed');
    }),
  ).rejects.toThrow('Source contents changed');
  expect(apply).not.toHaveBeenCalled();
  expect(values.get('flag')).toEqual(set(true));
});

it('rejects a changed review baseline before verifying the source for admission', async () => {
  const { adapter, values, apply } = fixture(),
    service = serviceFor(adapter),
    ctx = context(),
    verifySource = vi.fn(async () => {});
  const plan = await service.plan(documentFor(adapter.id, { count: set(0) }), ctx);
  values.set('count', set(9));
  await expect(
    service.apply(plan, selected(adapter.id, 'count'), ctx, verifySource),
  ).rejects.toMatchObject({ code: 'stale-plan' });
  expect(verifySource).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  expect(values.get('count')).toEqual(set(9));
});

it('cancels admission during final source verification and holds the application-wide operation slot until then', async () => {
  const { adapter, apply } = fixture(),
    service = serviceFor(adapter),
    abort = new AbortController(),
    ctx = context(abort);
  const plan = await service.plan(documentFor(adapter.id, { flag: set(false) }), ctx);
  const gate = Promise.withResolvers<void>();
  const verifySource = vi.fn(() => gate.promise);
  const pending = service.apply(plan, selected(adapter.id, 'flag'), ctx, verifySource);
  await vi.waitFor(() => expect(verifySource).toHaveBeenCalledOnce());
  await expect(
    service.capture(new Set([adapter.id]), {
      ...ctx,
      includeSecrets: false,
      includeLibrarySettings: false,
    }),
  ).rejects.toMatchObject({ code: 'busy' });
  abort.abort();
  gate.resolve();
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
    async () => {},
  );
  expect(first.values.get('flag')).toEqual(set(false));
  expect(second.apply).not.toHaveBeenCalled();
  expect(receipt.entries.map((entry) => entry.status)).toEqual(['failed', 'skipped']);
  expect(receipt.entries[0]!.message).toContain('review the current value');
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

it('uses newly reviewed plugin adapters and invalidates their previews on replacement before any mutation', async () => {
  const original = fixture('plugin.example');
  const available: SettingsAdapter[] = [];
  const service = new SettingsSnapshotService(
    () => available,
    () => ({ neo: '2', zotero: '10' }),
  );
  const document = documentFor(original.adapter.id, { flag: set(false) });
  expect((await service.plan(document, context())).issues[0]?.code).toBe('unsupported-adapter');
  available.push(original.adapter);
  const captured = await service.capture(new Set([original.adapter.id]), {
    ...context(),
    container: 'json',
    includeSecrets: false,
    includeLibrarySettings: false,
  });
  expect(captured.document.sections.map(({ adapterID }) => adapterID)).toEqual([
    original.adapter.id,
  ]);
  const reviewed = await service.plan(document, context());
  available[0] = fixture(original.adapter.id).adapter;
  const verifySource = vi.fn(async () => {});
  await expect(
    service.apply(reviewed, selected(original.adapter.id, 'flag'), context(), verifySource),
  ).rejects.toMatchObject({ code: 'stale-plan' });
  expect(verifySource).not.toHaveBeenCalled();
  expect(original.values.get('flag')).toEqual(set(true));
});

it('does not apply a stale template when replacement occurs during source verification', async () => {
  const original = fixture('plugin.example');
  const available = [original.adapter];
  const service = new SettingsSnapshotService(
    () => available,
    () => ({ neo: '2', zotero: '10' }),
  );
  const plan = await service.plan(
    documentFor(original.adapter.id, { flag: set(false) }),
    context(),
  );
  await expect(
    service.apply(plan, selected(original.adapter.id, 'flag'), context(), async () => {
      available[0] = fixture(original.adapter.id).adapter;
    }),
  ).rejects.toMatchObject({ code: 'stale-plan' });
  expect(original.values.get('flag')).toEqual(set(true));
  expect(original.apply).not.toHaveBeenCalled();
});

it('rejects credentials in plaintext capture and restore independently of file claims or UI checks', async () => {
  const source = fixture();
  const service = serviceFor(source.adapter);
  const capture = vi.spyOn(source.adapter, 'capture');
  const json = { ...context(), container: 'json' as const };
  await expect(
    service.capture(new Set([source.adapter.id]), {
      ...json,
      includeSecrets: true,
      includeLibrarySettings: false,
    }),
  ).rejects.toMatchObject({ code: 'plaintext-secrets' });
  expect(capture).not.toHaveBeenCalled();
  const input = documentFor(source.adapter.id, { secret: set('private-fixture') });
  await expect(service.plan(input, json)).rejects.toMatchObject({ code: 'plaintext-secrets' });
  const encryptedPlan = await service.plan(input, context());
  const verifySource = vi.fn(async () => {});
  await expect(
    service.apply(encryptedPlan, selected(source.adapter.id, 'secret'), json, verifySource),
  ).rejects.toMatchObject({ code: 'plaintext-secrets' });
  expect(verifySource).not.toHaveBeenCalled();
  expect(source.apply).not.toHaveBeenCalled();
});

it('captures valid selections once while omitting unavailable, failed, and malformed adapter sections', async () => {
  const neo = fixture();
  const plugin = fixture('plugin-reviewed');
  const failing = fixture('plugin-failing');
  const foreign = fixture('plugin-foreign');
  const unsafe = fixture('plugin-unsafe');
  const capture = vi.spyOn(plugin.adapter, 'capture');
  vi.spyOn(failing.adapter, 'capture').mockRejectedValue(new Error('private error detail'));
  vi.spyOn(foreign.adapter, 'capture').mockResolvedValue({
    section: documentFor(neo.adapter.id, {}).sections[0]!,
    issues: [],
  });
  vi.spyOn(unsafe.adapter, 'capture').mockResolvedValue({
    section: documentFor(unsafe.adapter.id, { constructor: set('unsafe') }).sections[0]!,
    issues: [],
  });
  const service = serviceFor(
    neo.adapter,
    plugin.adapter,
    failing.adapter,
    foreign.adapter,
    unsafe.adapter,
  );
  const ctx = {
    ...context(),
    container: 'json' as const,
    includeSecrets: false,
    includeLibrarySettings: false,
  };
  const options = { skipFailedAdapters: true } as const;
  const lost = ['plugin-unavailable', failing.adapter.id, foreign.adapter.id, unsafe.adapter.id];
  const result = await service.capture(
    new Set([neo.adapter.id, ...lost, plugin.adapter.id]),
    ctx,
    options,
  );
  expect(result.document.sections.map((section) => section.adapterID)).toEqual([
    neo.adapter.id,
    plugin.adapter.id,
  ]);
  expect(capture).toHaveBeenCalledTimes(1);
  expect(result.issues).toMatchObject(
    lost.map((adapterID) => ({ adapterID, code: 'adapter-skipped' })),
  );
  expect(JSON.stringify(result.issues)).not.toContain('private error detail');
  await expect(service.capture(new Set(lost), ctx, options)).rejects.toMatchObject({
    code: 'capture-failed',
  });
  await expect(service.capture(new Set([foreign.adapter.id]), ctx)).rejects.toMatchObject({
    code: 'invalid-adapter',
  });
});

it('fails closed on plaintext credentials or cancellation during an otherwise partial capture', async () => {
  const neo = fixture();
  const plugin = fixture('plugin-reviewed');
  const capture = vi.spyOn(plugin.adapter, 'capture');
  const abort = new AbortController();
  const ctx = {
    ...context(abort),
    container: 'json' as const,
    includeSecrets: false,
    includeLibrarySettings: false,
  };
  const options = { skipFailedAdapters: true } as const;
  const selected = new Set([neo.adapter.id, plugin.adapter.id]);
  const captureNeo = vi.spyOn(neo.adapter, 'capture');
  await expect(
    serviceFor(neo.adapter, plugin.adapter).capture(
      selected,
      { ...ctx, includeSecrets: true },
      options,
    ),
  ).rejects.toMatchObject({ code: 'plaintext-secrets' });
  expect(captureNeo).not.toHaveBeenCalled();
  captureNeo.mockImplementationOnce(async () => {
    abort.abort();
    throw new Error('Adapter stopped');
  });
  await expect(
    serviceFor(neo.adapter, plugin.adapter).capture(selected, ctx, options),
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(capture).not.toHaveBeenCalled();
});
