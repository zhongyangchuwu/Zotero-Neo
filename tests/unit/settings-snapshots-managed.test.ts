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
    const target = await managed.create(request, '', context());
    host.attachments.inspect.mockRejectedValue(
      new SettingsSnapshotError(code, 'Existing attachment data preserved.'),
    );
    await expect(managed.update(target.id, '', context())).rejects.toMatchObject({ code });
    expect((await managed.list(context()))[0]).toMatchObject({ status: 'paused' });
    await expect(managed.update(target.id, '', context())).rejects.toMatchObject({
      code: 'paused-target',
    });
    expect(host.attachments.publish).not.toHaveBeenCalled();
    expect(host.attachments.create).toHaveBeenCalledTimes(1);
    managed.dispose();
  },
);

it('uses one shared bounded scheduler, ignores createdAt-only churn, publishes changed settings once and stops with the last window', async () => {
  const { managed, value } = fixture();
  await managed.create({ ...request, autoUpdate: true }, '', context());
  const first = managed.start(context().window);
  const second = managed.start(context().window);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(host.attachments.publish).not.toHaveBeenCalled();
  value(2);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(host.attachments.publish).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(host.attachments.publish).toHaveBeenCalledTimes(1);
  first();
  second();
  value(3);
  await vi.advanceTimersByTimeAsync(180_000);
  expect(host.attachments.publish).toHaveBeenCalledTimes(1);
  managed.dispose();
});

it('pauses automatic publication when the reviewed template changes and reports the failure', async () => {
  const { managed, template } = fixture();
  const target = await managed.create({ ...request, autoUpdate: true }, '', context());
  Object.assign(template, { revision: 'review-2' });
  managed.start(context().window);
  await vi.advanceTimersByTimeAsync(60_000);
  expect((await managed.list(context()))[0]).toMatchObject({ id: target.id, status: 'paused' });
  expect(host.report).toHaveBeenCalled();
  expect(host.attachments.publish).not.toHaveBeenCalled();
  managed.dispose();
});

it('does not schedule late initialization after window release or application disposal', async () => {
  const ready = Promise.withResolvers<void>();
  host.initialize.mockReturnValue(ready.promise);
  const { managed, list, capture } = fixture();
  const release = managed.start(context().window);
  await Promise.resolve();
  release();
  managed.dispose();
  ready.resolve();
  await vi.advanceTimersByTimeAsync(180_000);
  expect(list).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  expect(host.attachments.publish).not.toHaveBeenCalled();
});

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
  await vi.advanceTimersByTimeAsync(60_000);
  expect(host.attachments.publish).not.toHaveBeenCalled();
  value(2);
  await vi.advanceTimersByTimeAsync(60_000);
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
