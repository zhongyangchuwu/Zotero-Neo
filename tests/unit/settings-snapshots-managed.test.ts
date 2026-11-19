import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  SettingsAdapter,
  SettingsCryptoContext,
  SettingsFileCodec,
} from '../../src/settings-snapshots/contracts';
import { SettingsSnapshotError } from '../../src/settings-snapshots/contracts';
import type {
  CreateManagedSnapshot,
  SettingsTemplateCatalogPort,
  SnapshotPluginTemplate,
} from '../../src/settings-snapshots/ports';
import { SettingsSnapshotService } from '../../src/settings-snapshots/service';
import { createManagedSettingsSnapshots } from '../../src/settings-snapshots/managed';
import { serializeSettingsDocument } from '../../src/settings-snapshots/document';

const host = vi.hoisted(() => ({
  initialize: vi.fn<() => Promise<void>>(),
  readBindings: vi.fn<() => unknown>(),
  writeBindings: vi.fn(),
  report: vi.fn(),
  attachments: {
    create: vi.fn(),
    publish: vi.fn(),
    configure: vi.fn(),
    inspect: vi.fn(),
    read: vi.fn(),
    sources: vi.fn(),
    locations: vi.fn(),
  },
}));
vi.mock('../../src/platform/settings-snapshot-managed-profile', () => ({
  initializeManagedSnapshots: host.initialize,
  readManagedSnapshotBindings: host.readBindings,
  writeManagedSnapshotBindings: host.writeBindings,
  // The native digest is an implementation detail; deterministic identity is enough at this boundary.
  managedSnapshotSemanticIdentity: (text: string) => text,
  reportManagedSnapshotFailure: host.report,
}));
vi.mock('../../src/platform/settings-snapshot-attachments', () => ({
  createSnapshotAttachments: () => host.attachments,
}));
const request: CreateManagedSnapshot = {
  adapterID: 'test-plugin',
  libraryID: 2,
  collectionID: null,
  title: 'Plugin settings',
  container: 'json',
  autoUpdate: false,
  includeSecrets: false,
  includeLibrarySettings: false,
  consent: true,
};
const source = { libraryID: 2, itemKey: 'ABCD1234', title: request.title };
const identity = {
  path: '/owned/storage/settings.json',
  digest: 'content-1',
  title: request.title,
  collections: [],
};
const context = (): SettingsCryptoContext => ({
  signal: new AbortController().signal,
  isCurrent: () => true,
  window: { setTimeout, clearTimeout, AbortController } as unknown as Window,
});
function fixture() {
  let value = 1;
  const capture = vi.fn(async () => ({
    section: {
      adapterID: request.adapterID,
      schemaVersion: 1,
      sourceVersion: '1',
      entries: [{ key: 'flag', state: { kind: 'set' as const, value } }],
    },
    issues: [],
  }));
  const adapter: SettingsAdapter = {
    id: request.adapterID,
    label: 'Plugin',
    schemaVersion: 1,
    sourceVersion: '1',
    capture,
    plan: vi.fn(),
    apply: vi.fn(),
  };
  const template: SnapshotPluginTemplate = {
    pluginID: 'plugin@test',
    adapterID: adapter.id,
    label: adapter.label,
    version: '1',
    revision: 'review-1',
    status: 'reviewed',
    fields: [],
    reviewedKeys: ['flag'],
    issues: [],
  };
  const list = vi.fn(async () => [template]);
  const catalog: SettingsTemplateCatalogPort = {
    adapters: [adapter],
    list,
    scan: vi.fn(),
    review: vi.fn(),
    exportTemplate: vi.fn(),
    importTemplate: vi.fn(),
    dispose: vi.fn(),
  };
  const codec: SettingsFileCodec = {
    seal: vi.fn(async (document) => serializeSettingsDocument(document)),
    open: vi.fn(),
    dispose: vi.fn(),
  };
  const service = new SettingsSnapshotService([adapter], () => ({ neo: '1', zotero: '10' }));
  const managed = createManagedSettingsSnapshots(service, codec, catalog);
  return {
    managed,
    codec,
    capture,
    list,
    template,
    value: (next: number) => {
      value = next;
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  host.initialize.mockResolvedValue(undefined);
  host.readBindings.mockReturnValue([]);
  host.attachments.create.mockImplementation(async (_request, text) => ({
    source,
    identity,
    text,
  }));
  host.attachments.publish.mockImplementation(async (currentSource, expected, text) => ({
    source: currentSource,
    identity: { ...expected, digest: 'content-2' },
    text,
  }));
  host.attachments.configure.mockImplementation(async (_source, _identity, options) => ({
    source: { ...source, title: options.title },
    identity: { ...identity, title: options.title },
    text: 'untouched',
  }));
  host.attachments.inspect.mockImplementation(async (currentSource, expected) => ({
    source: { ...currentSource, title: expected.title },
    identity: expected,
    text: '',
  }));
  host.attachments.read.mockResolvedValue({ source, identity, text: 'exact source bytes\n' });
  host.attachments.sources.mockResolvedValue([source]);
});
afterEach(() => {
  vi.useRealTimers();
});

it('requires consent and rejects encrypted auto-update or plaintext secrets before capture/publication', async () => {
  const { managed, capture, codec } = fixture();
  for (const [change, code] of [
    [{ consent: false }, 'consent-required'],
    [{ container: 'age', autoUpdate: true }, 'encrypted-auto-update'],
    [{ includeSecrets: true }, 'plaintext-secrets'],
  ] as const)
    await expect(
      managed.create({ ...request, ...change }, 'not-persisted', context()),
    ).rejects.toMatchObject({ code });
  expect(capture).not.toHaveBeenCalled();
  expect(codec.seal).not.toHaveBeenCalled();
  expect(host.attachments.create).not.toHaveBeenCalled();
  managed.dispose();
});

it('hydrates reviewed templates before common capture, passes the actual codec container and keeps credentials out of profile state', async () => {
  const { managed, codec, list, capture } = fixture();
  const target = await managed.create(
    { ...request, container: 'age', includeSecrets: true },
    'ephemeral-password',
    context(),
  );
  expect(list.mock.invocationCallOrder[0]).toBeLessThan(capture.mock.invocationCallOrder[0]!);
  expect(codec.seal).toHaveBeenCalledWith(
    expect.any(Object),
    'ephemeral-password',
    expect.any(Object),
    'age',
  );
  expect(JSON.stringify(host.writeBindings.mock.calls)).not.toContain('ephemeral-password');
  expect(JSON.stringify(host.writeBindings.mock.calls)).not.toContain('"sections"');
  await expect(
    managed.configure(
      target.id,
      { title: 'New title', collectionID: null, autoUpdate: true, expected: target },
      context(),
    ),
  ).rejects.toMatchObject({ code: 'encrypted-auto-update' });
  managed.dispose();
});

it('discovers and reads a library source with no local binding and forgets only the local target', async () => {
  const { managed } = fixture();
  expect(await managed.sources(2, context())).toEqual([source]);
  expect(await managed.read(source, context())).toBe('exact source bytes\n');
  const target = await managed.create(request, '', context());
  await managed.forget(target.id, context());
  expect(await managed.list(context())).toEqual([]);
  expect(host.attachments.publish).not.toHaveBeenCalled();
  expect(host.attachments.configure).not.toHaveBeenCalled();
  managed.dispose();
});

it.each(['external-change', 'missing-attachment', 'read-only'])(
  'pauses on %s without overwriting or resurrecting data',
  async (code) => {
    const { managed } = fixture();
    const target = await managed.create({ ...request, autoUpdate: true }, '', context());
    managed.start(context().window);
    expect(vi.getTimerCount()).toBe(1);
    host.attachments.inspect.mockRejectedValue(
      new SettingsSnapshotError(code, 'Existing attachment data preserved.'),
    );
    await expect(managed.update(target.id, '', context())).rejects.toMatchObject({ code });
    expect(vi.getTimerCount()).toBe(0);
    expect((await managed.list(context()))[0]).toMatchObject({ status: 'paused' });
    await expect(managed.update(target.id, '', context())).rejects.toMatchObject({
      code: 'paused-target',
    });
    expect(host.attachments.publish).not.toHaveBeenCalled();
    expect(host.attachments.create).toHaveBeenCalledTimes(1);
    managed.dispose();
  },
);

it('keeps idle windows quiet and schedules only while auto-update is enabled', async () => {
  const { managed, list, capture } = fixture();
  managed.start(context().window);
  await vi.advanceTimersByTimeAsync(600_000);
  expect(host.readBindings).toHaveBeenCalledTimes(1);
  expect(list).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);

  const manual = await managed.create(request, '', context());
  expect(list).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  const enabled = await managed.configure(
    manual.id,
    { title: manual.title, collectionID: null, autoUpdate: true, expected: manual },
    context(),
  );
  expect(vi.getTimerCount()).toBe(1);
  const disabled = await managed.configure(
    enabled.id,
    { title: enabled.title, collectionID: null, autoUpdate: false, expected: enabled },
    context(),
  );
  expect(disabled.autoUpdate).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  await managed.forget(disabled.id, context());

  const automatic = await managed.create({ ...request, autoUpdate: true }, '', context());
  expect(vi.getTimerCount()).toBe(1);
  await managed.forget(automatic.id, context());
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(600_000);
  expect(host.attachments.publish).not.toHaveBeenCalled();
  managed.dispose();
});

it('resumes a persisted auto-update binding without hydrating the catalog before the first check', async () => {
  const previous = fixture().managed;
  await previous.create({ ...request, autoUpdate: true }, '', context());
  previous.dispose();
  host.readBindings.mockReturnValue(host.writeBindings.mock.lastCall![0]);
  host.readBindings.mockClear();
  const ready = Promise.withResolvers<void>();
  host.initialize.mockReturnValue(ready.promise);
  const { managed, list, value } = fixture();
  const releaseFirst = managed.start(context().window);
  const active = context().window;
  const releaseActive = managed.start(active);
  releaseFirst();
  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.readBindings).not.toHaveBeenCalled();
  expect(list).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);

  ready.resolve();
  value(2);
  await vi.advanceTimersByTimeAsync(299_999);
  expect(host.readBindings).toHaveBeenCalledTimes(1);
  expect(list).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(host.attachments.publish).toHaveBeenCalledWith(
    source,
    identity,
    expect.any(String),
    expect.any(Object),
  );
  expect(host.attachments.publish.mock.lastCall![3].window).toBe(active);
  releaseActive();
  expect(vi.getTimerCount()).toBe(0);
  managed.dispose();
});

it('schedules from confirmed bindings when a local write fails', async () => {
  const { managed, value } = fixture();
  const automatic = { ...request, autoUpdate: true };
  const failure = new SettingsSnapshotError('binding-storage', 'Local state could not be saved.');
  managed.start(context().window);
  host.writeBindings.mockImplementationOnce(() => {
    throw failure;
  });
  await expect(managed.create(automatic, '', context())).rejects.toBe(failure);
  expect(vi.getTimerCount()).toBe(0);

  const target = await managed.create(automatic, '', context());
  host.writeBindings.mockImplementationOnce(() => {
    throw failure;
  });
  await expect(managed.forget(target.id, context())).rejects.toBe(failure);
  expect(vi.getTimerCount()).toBe(1);
  value(2);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.publish).toHaveBeenCalledTimes(1);
  await managed.forget(target.id, context());
  expect(vi.getTimerCount()).toBe(0);
  managed.dispose();
});

it('drops a queued check if auto-update is disabled and re-enabled before it starts', async () => {
  const { managed, value } = fixture();
  const target = await managed.create({ ...request, autoUpdate: true }, '', context());
  managed.start(context().window);
  value(2);
  const stored = { source, identity, text: 'unchanged' };
  const pending = Promise.withResolvers<typeof stored>();
  host.attachments.configure.mockReturnValueOnce(pending.promise);
  const disabled = { title: target.title, collectionID: null, autoUpdate: false };
  const disabling = managed.configure(target.id, { ...disabled, expected: target }, context());
  const enabling = managed.configure(
    target.id,
    { ...disabled, autoUpdate: true, expected: { ...target, ...disabled } },
    context(),
  );

  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.configure).toHaveBeenCalledTimes(1);
  pending.resolve(stored);
  await disabling;
  await enabling;
  await vi.advanceTimersByTimeAsync(299_999);
  expect(host.attachments.publish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(host.attachments.publish).toHaveBeenCalledTimes(1);
  managed.dispose();
});

it('updates a changed snapshot after five minutes, preserving its timestamp on unchanged checks', async () => {
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  const { managed, value } = fixture();
  const target = await managed.create({ ...request, autoUpdate: true }, '', context());
  const first = managed.start(context().window);
  const second = managed.start(context().window);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.publish).not.toHaveBeenCalled();
  expect((await managed.list(context()))[0]?.updatedAt).toBe(target.updatedAt);

  value(2);
  await vi.advanceTimersByTimeAsync(299_999);
  expect(host.attachments.publish).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(host.attachments.publish).toHaveBeenCalledTimes(1);
  const updatedAt = '2026-01-01T00:10:00.000Z';
  const published = host.attachments.publish.mock.calls[0]!;
  expect(published[0]).toEqual(source);
  expect(JSON.parse(published[2])).toMatchObject({
    createdAt: updatedAt,
    sections: [{ entries: [{ key: 'flag', state: { kind: 'set', value: 2 } }] }],
  });
  expect((await managed.list(context()))[0]?.updatedAt).toBe(updatedAt);

  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.publish).toHaveBeenCalledTimes(1);
  expect((await managed.list(context()))[0]?.updatedAt).toBe(updatedAt);
  first();
  second();
  value(3);
  await vi.advanceTimersByTimeAsync(900_000);
  expect(host.attachments.publish).toHaveBeenCalledTimes(1);
  managed.dispose();
});

it('pauses automatic publication when the reviewed template changes and reports the failure', async () => {
  const { managed, template } = fixture();
  const target = await managed.create({ ...request, autoUpdate: true }, '', context());
  Object.assign(template, { revision: 'review-2' });
  managed.start(context().window);
  await vi.advanceTimersByTimeAsync(300_000);
  expect((await managed.list(context()))[0]).toMatchObject({ id: target.id, status: 'paused' });
  expect(host.report).toHaveBeenCalled();
  expect(host.attachments.publish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  managed.dispose();
});

it('updates another eligible binding even when the first pauses during the same check', async () => {
  const { managed, value } = fixture();
  const automatic = { ...request, autoUpdate: true };
  const first = await managed.create(automatic, '', context());
  const anotherSource = { ...source, itemKey: 'DCBA4321' };
  const anotherIdentity = { ...identity, path: '/owned/second/settings.json' };
  host.attachments.create.mockResolvedValueOnce({
    source: anotherSource,
    identity: anotherIdentity,
    text: 'second attachment',
  });
  const second = await managed.create(automatic, '', context());
  const changed = new SettingsSnapshotError('external-change', 'Attachment changed.');
  host.attachments.inspect.mockRejectedValueOnce(changed);
  managed.start(context().window);
  value(2);

  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.publish).toHaveBeenCalledExactlyOnceWith(
    anotherSource,
    anotherIdentity,
    expect.any(String),
    expect.any(Object),
  );
  expect(await managed.list(context())).toMatchObject([
    { id: first.id, status: 'paused' },
    { id: second.id, status: 'ready' },
  ]);
  expect(vi.getTimerCount()).toBe(1);
  host.attachments.inspect.mockRejectedValueOnce(changed);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(vi.getTimerCount()).toBe(0);
  expect(host.report).toHaveBeenCalledTimes(2);
  managed.dispose();
});

it('ignores a retired timer callback without disturbing the replacement window', async () => {
  const { managed, list, value } = fixture();
  await managed.create({ ...request, autoUpdate: true }, '', context());
  const first = context().window;
  const firstTimer = vi.spyOn(first, 'setTimeout');
  const releaseFirst = managed.start(first);
  const stale = firstTimer.mock.calls[0]![0] as () => void;
  const active = context().window;
  const releaseActive = managed.start(active);
  releaseFirst();
  stale();
  await vi.advanceTimersByTimeAsync(0);
  expect(list).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(1);

  value(2);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.publish).toHaveBeenCalledExactlyOnceWith(
    source,
    identity,
    expect.any(String),
    expect.any(Object),
  );
  expect(host.attachments.publish.mock.lastCall![3].window).toBe(active);
  releaseActive();
  expect(vi.getTimerCount()).toBe(0);
  managed.dispose();
});

it('fences an in-flight check on owner retirement and continues under the new window', async () => {
  const { managed, list, template, value } = fixture();
  await managed.create({ ...request, autoUpdate: true }, '', context());
  value(2);
  const pending = Promise.withResolvers<SnapshotPluginTemplate[]>();
  list.mockReturnValueOnce(pending.promise);
  const releaseFirst = managed.start(context().window);
  const active = context().window;
  managed.start(active);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(list).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  releaseFirst();
  pending.resolve([template]);
  await vi.advanceTimersByTimeAsync(0);
  expect(host.attachments.inspect).not.toHaveBeenCalled();
  expect(host.attachments.publish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);

  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.publish).toHaveBeenCalledExactlyOnceWith(
    source,
    identity,
    expect.any(String),
    expect.any(Object),
  );
  expect(host.attachments.publish.mock.lastCall![3].window).toBe(active);
  managed.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['release', 'dispose'] as const)(
  'does not load bindings or schedule after window %s during initialization',
  async (retire) => {
    const ready = Promise.withResolvers<void>();
    host.initialize.mockReturnValue(ready.promise);
    const { managed, list } = fixture();
    const release = managed.start(context().window);
    await vi.advanceTimersByTimeAsync(0);
    expect(host.initialize).toHaveBeenCalledTimes(1);
    if (retire === 'release') release();
    else managed.dispose();
    ready.resolve();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(host.readBindings).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    managed.dispose();
  },
);

it('fences a capture that completes after disposal before codec or attachment publication', async () => {
  const { managed, capture, codec } = fixture();
  const original = await capture();
  const pending = Promise.withResolvers<typeof original>();
  capture.mockImplementationOnce(() => pending.promise);
  const creating = managed.create(request, '', context());
  const failure = expect(creating).rejects.toMatchObject({ code: 'cancelled' });
  for (let turn = 0; turn < 10 && capture.mock.calls.length < 2; turn++) await Promise.resolve();
  managed.dispose();
  pending.resolve(original);
  await failure;
  expect(codec.seal).not.toHaveBeenCalled();
  expect(host.attachments.create).not.toHaveBeenCalled();
});

it('follows native metadata and verified file relocation by item key, and preserves them on the next automatic publication', async () => {
  const { managed, value } = fixture();
  const target = await managed.create({ ...request, autoUpdate: true }, '', context());
  const movedSource = { ...source, title: 'Native renamed settings' };
  let currentIdentity = {
    ...identity,
    title: movedSource.title,
    path: '/owned/storage/renamed.json',
    collections: [7, 9],
  };
  host.attachments.inspect.mockImplementation(async () => ({
    source: movedSource,
    identity: currentIdentity,
    text: '',
  }));
  host.attachments.publish.mockImplementation(async (actualSource, expected, text) => {
    currentIdentity = { ...expected, digest: 'content-2' };
    return { source: actualSource, identity: currentIdentity, text };
  });
  expect((await managed.list(context()))[0]).toMatchObject({
    id: target.id,
    status: 'ready',
    title: movedSource.title,
    collectionID: 7,
    source: movedSource,
  });
  managed.start(context().window);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.publish).not.toHaveBeenCalled();
  value(2);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.publish).toHaveBeenCalledWith(
    movedSource,
    expect.objectContaining({
      path: '/owned/storage/renamed.json',
      title: movedSource.title,
      collections: [7, 9],
      digest: 'content-1',
    }),
    expect.any(String),
    expect.any(Object),
  );
  expect((await managed.list(context()))[0]).toMatchObject({
    id: target.id,
    status: 'ready',
    title: movedSource.title,
    collectionID: 7,
    source: movedSource,
  });
  expect(host.attachments.configure).not.toHaveBeenCalled();
  expect(host.attachments.create).toHaveBeenCalledTimes(1);
  managed.dispose();
});

it.each([false, true])(
  'rejects stale edit-time metadata even when an intervening list refresh is %s',
  async (refreshBeforeSave) => {
    const { managed } = fixture();
    const opened = await managed.create(request, '', context());
    const changed = { ...identity, title: 'Native rename', collections: [9] };
    host.attachments.inspect.mockResolvedValue({
      source: { ...source, title: changed.title },
      identity: changed,
      text: '',
    });
    if (refreshBeforeSave) await managed.list(context());
    await expect(
      managed.configure(
        opened.id,
        {
          title: opened.title,
          collectionID: opened.collectionID,
          autoUpdate: true,
          expected: opened,
        },
        context(),
      ),
    ).rejects.toMatchObject({ code: 'stale-target' });
    expect(host.attachments.configure).not.toHaveBeenCalled();
    expect((await managed.list(context()))[0]).toMatchObject({
      title: 'Native rename',
      collectionID: 9,
      autoUpdate: false,
      status: 'ready',
    });
    managed.dispose();
  },
);

it.each(['title', 'auto-update'] as const)(
  'keeps additional native collections during a %s-only binding edit',
  async (edit) => {
    const { managed } = fixture();
    await managed.create(request, '', context());
    let native = { ...identity, collections: [7, 9] };
    host.attachments.inspect.mockImplementation(async () => ({
      source: { ...source, title: native.title },
      identity: native,
      text: '',
    }));
    host.attachments.configure.mockImplementation(async (_source, expected, options) => {
      native = {
        ...expected,
        title: options.title,
        collections:
          options.collectionID === undefined
            ? expected.collections
            : options.collectionID === null
              ? []
              : [options.collectionID],
      };
      return { source: { ...source, title: native.title }, identity: native, text: '' };
    });
    const opened = (await managed.list(context()))[0]!;
    const saved = await managed.configure(
      opened.id,
      {
        title: edit === 'title' ? 'User rename' : opened.title,
        collectionID: opened.collectionID,
        autoUpdate: edit === 'auto-update',
        expected: opened,
      },
      context(),
    );
    expect(native.collections).toEqual([7, 9]);
    expect(saved.title).toBe(edit === 'title' ? 'User rename' : identity.title);
    expect(saved.autoUpdate).toBe(edit === 'auto-update');
    managed.dispose();
  },
);

it('keeps an encrypted target ready after an empty password and permits a later manual update', async () => {
  const { managed } = fixture();
  const target = await managed.create(
    { ...request, container: 'age' },
    'initial password',
    context(),
  );
  await expect(managed.update(target.id, '', context())).rejects.toMatchObject({
    code: 'invalid-password',
  });
  expect(host.attachments.publish).not.toHaveBeenCalled();
  expect((await managed.list(context()))[0]).toMatchObject({
    id: target.id,
    status: 'ready',
    autoUpdate: false,
  });
  expect(await managed.update(target.id, 'new password', context())).toMatchObject({
    id: target.id,
    status: 'ready',
  });
  expect(host.writeBindings.mock.lastCall![0][0].expected.digest).toBe('content-2');
  managed.dispose();
});
