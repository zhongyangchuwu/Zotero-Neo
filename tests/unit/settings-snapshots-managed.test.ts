import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type {
  WorkspaceExtension,
  WorkspaceExtensionManifest,
} from '../../src/modules/extensions/workspace';
import type {
  SettingsAdapter,
  SettingsCaptureContext,
  SettingsCryptoContext,
  SettingsFileCodec,
} from '../../src/settings-snapshots/contracts';
import { SettingsSnapshotError } from '../../src/settings-snapshots/contracts';
import type {
  CreateManagedSnapshot,
  SettingsTemplateCatalogPort,
  SnapshotPluginTemplate,
} from '../../src/settings-snapshots/ports';
import { SettingsSnapshotService, settingsChangeID } from '../../src/settings-snapshots/service';
import { createManagedSettingsSnapshots } from '../../src/settings-snapshots/managed';
import {
  parseSettingsDocument,
  serializeSettingsDocument,
} from '../../src/settings-snapshots/document';
import { createSettingsAdapters } from '../../src/settings-snapshots/registry';
import {
  prepareWorkspacePreferences,
  restoreWorkspacePreferences,
} from '../../src/settings-snapshots/workspace-preferences';
import { settingsSnapshotHostFixture } from './settings-snapshots-host-fixture';

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
  managedSnapshotSemanticIdentity: (text: string) =>
    createHash('sha256').update(text).digest('hex'),
  reportManagedSnapshotFailure: host.report,
}));
vi.mock('../../src/platform/settings-snapshot-attachments', () => ({
  createSnapshotAttachments: () => host.attachments,
}));
const pluginID = 'test-plugin';
const neoID = 'zotero-neo';
const request: CreateManagedSnapshot = {
  adapterIDs: [pluginID],
  libraryID: 2,
  collectionID: null,
  title: 'Plugin settings',
  container: 'json',
  autoUpdate: false,
  includeSecrets: false,
  includeLibrarySettings: false,
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
function fixture(
  extensions?: () => Promise<WorkspaceExtensionManifest>,
  neoAdapter?: SettingsAdapter,
) {
  let value = 1;
  const capture = vi.fn(async (ctx?: SettingsCaptureContext) => ({
    section: {
      adapterID: pluginID,
      schemaVersion: 1,
      sourceVersion: '1',
      entries: [
        { key: 'flag', state: { kind: 'set' as const, value } },
        ...(ctx?.container === 'age' && ctx.includeSecrets
          ? [{ key: 'secret', state: { kind: 'set' as const, value: 'local credential' } }]
          : []),
      ],
    },
    issues: [],
  }));
  const adapter: SettingsAdapter = {
    id: pluginID,
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
  const neo: SettingsAdapter = neoAdapter ?? {
    ...adapter,
    id: neoID,
    label: 'Zotero Neo',
    capture: vi.fn(async () => ({
      section: {
        adapterID: neoID,
        schemaVersion: 1,
        sourceVersion: '1',
        entries: [{ key: 'reader.zoom', state: { kind: 'set' as const, value: 2 } }],
      },
      issues: [],
    })),
  };
  const neoTemplate: SnapshotPluginTemplate = {
    ...template,
    pluginID: 'neo@test',
    adapterID: neoID,
    label: neo.label,
    status: 'builtin',
    reviewedKeys: [],
  };
  const list = vi.fn(async () => [template, neoTemplate]);
  const catalog: SettingsTemplateCatalogPort = {
    adapters: [adapter, neo],
    list,
    scan: vi.fn(),
    review: vi.fn(),
    exportTemplate: vi.fn(),
    importTemplate: vi.fn(),
    dispose: vi.fn(),
  };
  const codec: SettingsFileCodec = {
    seal: vi.fn(async (document, _password, _context, container) =>
      container === 'age'
        ? 'simulated armor from codec boundary'
        : serializeSettingsDocument(document),
    ),
    open: vi.fn(),
    dispose: vi.fn(),
  };
  const service = new SettingsSnapshotService(
    [adapter, neo],
    () => ({ neo: '1', zotero: '10' }),
    extensions,
  );
  const managed = createManagedSettingsSnapshots(service, codec, catalog);
  return {
    managed,
    codec,
    catalog,
    capture,
    list,
    template,
    neoTemplate,
    service,
    value: (next: number) => {
      value = next;
    },
  };
}
function changeStoredFile(initialText: string, initialRevision: string) {
  let current = { source, identity: { ...identity, digest: initialRevision }, text: initialText };
  host.attachments.inspect.mockImplementation(async () => current);
  host.attachments.read.mockImplementation(async () => current);
  host.attachments.publish.mockImplementation(async (_source, expected, text) => {
    if (expected.digest !== current.identity.digest)
      throw new SettingsSnapshotError('external-change', 'The file changed before publication.');
    current = { ...current, identity: { ...current.identity, digest: 'our-publication' }, text };
    return current;
  });
  return (text: string, digest: string) => {
    current = { ...current, identity: { ...current.identity, digest }, text };
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
  vi.unstubAllGlobals();
});

it('rejects encrypted auto-update or plaintext secrets before capture/publication', async () => {
  const { managed, capture, codec } = fixture();
  for (const [change, code] of [
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
    expect.objectContaining({
      sections: [
        expect.objectContaining({
          entries: expect.arrayContaining([
            { key: 'secret', state: { kind: 'set', value: 'local credential' } },
          ]),
        }),
      ],
    }),
    'ephemeral-password',
    expect.any(Object),
    'age',
  );
  expect(JSON.stringify(host.writeBindings.mock.calls)).not.toContain('ephemeral-password');
  expect(JSON.stringify(host.writeBindings.mock.calls)).not.toContain('local credential');
  expect(JSON.stringify(host.writeBindings.mock.calls)).not.toContain('"sections"');
  expect(host.attachments.create.mock.lastCall?.[1]).not.toContain('local credential');
  await expect(
    managed.configure(
      target.id,
      { title: 'New title', collectionID: null, autoUpdate: true, expected: target },
      context(),
    ),
  ).rejects.toMatchObject({ code: 'encrypted-auto-update' });
  managed.dispose();
});

it('creates one workspace and common JSON snapshot for Neo and a locally reviewed plugin', async () => {
  const { managed, service } = fixture();
  const capture = vi.spyOn(service, 'capture');
  const target = await managed.create({ ...request, adapterIDs: [neoID, pluginID] }, '', context());
  expect(target).toMatchObject({
    kind: 'workspace',
    status: 'ready',
    adapterIDs: [neoID, pluginID],
  });
  expect(capture).toHaveBeenCalledTimes(1);
  expect(host.attachments.create).toHaveBeenCalledTimes(1);
  expect(JSON.parse(host.attachments.create.mock.lastCall![1])).toMatchObject({
    sections: [
      { adapterID: neoID, entries: [{ key: 'reader.zoom', state: { kind: 'set', value: 2 } }] },
      { adapterID: pluginID, entries: [{ key: 'flag', state: { kind: 'set', value: 1 } }] },
    ],
  });
  managed.dispose();
});

it('publishes and restores global appearance through a Zotero library workspace', async () => {
  const t = settingsSnapshotHostFixture();
  const prefix = 'extensions.zotero-neo.';
  const css = '.neo-picker {\n  --neo-accent: teal;\n}\n';
  t.user.set(prefix + 'appearance.preset', 'modern');
  t.user.set(prefix + 'appearance.customCss', css);
  t.user.set(prefix + 'picker.theme', 'terminal');
  t.user.set(prefix + 'picker.customCss', 'old styles');
  const adapter = createSettingsAdapters(() => '1')[1]!;
  const { managed, service, catalog } = fixture(async () => ({ version: 1, addons: [] }), adapter);
  const operation = { ...context(), container: 'json' as const };

  const target = await managed.create({ ...request, adapterIDs: [neoID] }, '', operation);
  expect(target).toMatchObject({ kind: 'workspace', status: 'ready' });
  const document = parseSettingsDocument(host.attachments.create.mock.lastCall![1]);
  expect(document.extensions).toEqual({ version: 1, addons: [] });
  expect(document.sections[0]?.entries).toEqual([
    { key: 'appearance.preset', state: { kind: 'set', value: 'modern' } },
    { key: 'appearance.customCss', state: { kind: 'set', value: css } },
  ]);

  t.user.delete(prefix + 'appearance.preset');
  t.user.delete(prefix + 'appearance.customCss');
  const preview = await prepareWorkspacePreferences(document, catalog, operation);
  const plan = await service.plan(preview.document, operation);
  const selected = new Set(
    ['appearance.preset', 'appearance.customCss'].map((key) => settingsChangeID(neoID, key)),
  );
  const result = await restoreWorkspacePreferences(
    document,
    catalog,
    service,
    plan,
    preview.deferred,
    selected,
    operation,
    async () => {},
  );
  expect(result.skipped).toEqual([]);
  expect(result.receipt?.entries).toMatchObject([
    { key: 'appearance.preset', status: 'applied' },
    { key: 'appearance.customCss', status: 'applied' },
  ]);
  expect(t.user.get(prefix + 'appearance.preset')).toBe('modern');
  expect(t.user.get(prefix + 'appearance.customCss')).toBe(css);
  managed.dispose();
});

it('keeps valid sections when some selected plugins were unavailable or failed during creation', async () => {
  const { managed, capture } = fixture();
  capture.mockRejectedValueOnce(new Error('private details not suitable for display'));
  const target = await managed.create(
    { ...request, adapterIDs: [neoID, pluginID, 'missing-plugin'] },
    '',
    context(),
  );
  expect(target).toMatchObject({
    status: 'ready',
    adapterIDs: [neoID, pluginID, 'missing-plugin'],
  });
  expect(target.message).toContain('Not captured: Plugin, missing-plugin.');
  expect(target.message).not.toContain('private details');
  const document = JSON.parse(host.attachments.create.mock.lastCall![1]);
  expect(document.sections.map((section: { adapterID: string }) => section.adapterID)).toEqual([
    neoID,
  ]);
  managed.dispose();
});

it.each(['missing-template', 'capture-failed'] as const)(
  'preserves prior sections after %s until a deliberate scope edit',
  async (cause) => {
    const { managed, capture, list, neoTemplate } = fixture();
    const target = await managed.create(
      { ...request, adapterIDs: [neoID, pluginID], autoUpdate: true },
      '',
      context(),
    );
    if (cause === 'missing-template') list.mockResolvedValue([neoTemplate]);
    else capture.mockRejectedValue(new Error('Transient adapter failure'));
    managed.start(context().window);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(host.attachments.publish).not.toHaveBeenCalled();
    const paused = (await managed.list(context()))[0]!;
    expect(paused).toMatchObject({ id: target.id, status: 'paused' });
    expect(paused.message).toMatch(/stored file was not overwritten/);
    expect(vi.getTimerCount()).toBe(1); // Auto-update retries safely without publishing a partial replacement.

    const saved = await managed.configure(
      target.id,
      { ...paused, expected: paused, adapterIDs: [neoID] },
      context(),
    );
    expect(saved).toMatchObject({ status: 'ready', adapterIDs: [neoID] });
    expect(host.attachments.publish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(JSON.parse(host.attachments.publish.mock.lastCall![2]).sections).toMatchObject([
      { adapterID: neoID },
    ]);
    managed.dispose();
  },
);

it('extends an existing workspace only with explicit selected scope and rejects a stale scope editor', async () => {
  const { managed } = fixture();
  const one = await managed.create({ ...request, adapterIDs: [neoID] }, '', context());
  const scope = [neoID, pluginID];
  const both = await managed.configure(
    one.id,
    { ...one, adapterIDs: scope, expected: one },
    context(),
  );
  expect(both.adapterIDs).toEqual(scope);
  await expect(
    managed.configure(one.id, { ...one, expected: one }, context()),
  ).rejects.toMatchObject({ code: 'stale-target' });
  expect(host.attachments.publish).not.toHaveBeenCalled();
  await managed.update(one.id, '', context());
  expect(JSON.parse(host.attachments.publish.mock.lastCall![2]).sections).toMatchObject([
    { adapterID: neoID },
    { adapterID: pluginID },
  ]);
  managed.dispose();
});

it('normalizes an old persisted single-plugin binding without changing its scope or replacing its attachment', async () => {
  const extensions = vi.fn(async () => ({ version: 1 as const, addons: [] }));
  const { managed, template } = fixture(extensions);
  const { adapterIDs: _adapterIDs, libraryID: _libraryID, ...oldPolicy } = request;
  host.readBindings.mockReturnValue([
    {
      target: {
        ...oldPolicy,
        id: `${source.libraryID}:${source.itemKey}`,
        source,
        adapterID: pluginID,
        updatedAt: new Date().toISOString(),
        message: 'Stored locally',
        status: 'ready',
        password: 'never retained',
      },
      expected: identity,
      semantic: null,
      template: template.revision,
    },
  ]);
  const legacy = (await managed.list(context()))[0]!;
  expect(legacy).toMatchObject({ kind: 'legacy', adapterIDs: [pluginID], source });
  await expect(
    managed.configure(
      legacy.id,
      { ...legacy, adapterIDs: [neoID, pluginID], expected: legacy },
      context(),
    ),
  ).rejects.toMatchObject({ code: 'immutable-scope' });
  await managed.update(legacy.id, '', context());
  expect(host.attachments.create).not.toHaveBeenCalled();
  expect(JSON.parse(host.attachments.publish.mock.lastCall![2]).sections).toMatchObject([
    { adapterID: pluginID },
  ]);
  expect(JSON.parse(host.attachments.publish.mock.lastCall![2])).not.toHaveProperty('extensions');
  expect(extensions).not.toHaveBeenCalled();
  expect(JSON.stringify(host.writeBindings.mock.lastCall![0])).not.toContain('never retained');
  Object.assign(template, { revision: 'different-legacy-template' });
  expect((await managed.list(context()))[0]).toMatchObject({ status: 'paused' });
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

it('records observed conflict without rebasing the original file and publishes only after exact reviewed overwrite', async () => {
  const { managed, value } = fixture();
  const target = await managed.create({ ...request, autoUpdate: true }, '', context());
  managed.start(context().window);
  changeStoredFile('reviewable cloud bytes\r\n', 'cloud-a');
  await vi.advanceTimersByTimeAsync(300_000);
  const conflicted = (await managed.list(context()))[0]!;
  expect(conflicted).toMatchObject({ status: 'conflict', conflictRevision: 'cloud-a' });
  expect(await managed.read(conflicted.source, context())).toBe('reviewable cloud bytes\r\n');
  expect(host.writeBindings.mock.lastCall![0][0].expected.digest).toBe('content-1');
  expect(vi.getTimerCount()).toBe(0);
  await expect(managed.update(target.id, '', context())).rejects.toMatchObject({
    code: 'paused-target',
  });
  await expect(managed.overwrite(target.id, 'unseen', '', context())).rejects.toMatchObject({
    code: 'stale-conflict',
  });
  expect(host.attachments.publish).not.toHaveBeenCalled();

  value(2);
  const saved = await managed.overwrite(target.id, conflicted.conflictRevision!, '', context());
  expect(saved.status).toBe('ready');
  expect(saved.conflictRevision).toBeUndefined();
  expect(host.attachments.publish).toHaveBeenCalledExactlyOnceWith(
    source,
    { ...identity, digest: 'cloud-a' },
    expect.any(String),
    expect.any(Object),
  );
  expect(host.writeBindings.mock.lastCall![0][0].expected.digest).toBe('our-publication');
  expect(vi.getTimerCount()).toBe(1);
  managed.dispose();
});

it.each(['before overwrite', 'during sealing'] as const)(
  'preserves a newer external version arriving %s',
  async (timing) => {
    const { managed, codec } = fixture();
    const target = await managed.create(request, '', context());
    const change = changeStoredFile('first cloud bytes', 'cloud-a');
    const opened = (await managed.list(context()))[0]!;
    if (timing === 'before overwrite') change('the next external bytes', 'cloud-b');
    else
      vi.mocked(codec.seal).mockImplementationOnce(async (document) => {
        change('the next external bytes', 'cloud-b');
        return serializeSettingsDocument(document);
      });

    await expect(
      managed.overwrite(target.id, opened.conflictRevision!, '', context()),
    ).rejects.toMatchObject({ code: 'external-change' });
    expect(host.attachments.publish).toHaveBeenCalledTimes(timing === 'before overwrite' ? 0 : 1);
    expect(host.writeBindings.mock.lastCall![0][0].expected.digest).toBe('content-1');
    const current = (await managed.list(context()))[0]!;
    expect(current).toMatchObject({ status: 'conflict', conflictRevision: 'cloud-b' });
    expect(await managed.read(current.source, context())).toBe('the next external bytes');
    managed.dispose();
  },
);

it('does not recreate a conflicting snapshot removed between review and overwrite', async () => {
  const { managed } = fixture();
  const target = await managed.create(request, '', context());
  changeStoredFile('first cloud bytes', 'cloud-a');
  const opened = (await managed.list(context()))[0]!;
  host.attachments.inspect.mockRejectedValue(
    new SettingsSnapshotError(
      'missing-attachment',
      'The snapshot attachment was deleted. It will not be recreated.',
    ),
  );
  await expect(
    managed.overwrite(target.id, opened.conflictRevision!, '', context()),
  ).rejects.toMatchObject({ code: 'missing-attachment' });
  expect(host.attachments.create).toHaveBeenCalledTimes(1);
  expect(host.attachments.publish).not.toHaveBeenCalled();
  const current = (await managed.list(context()))[0]!;
  expect(current.status).toBe('paused');
  expect(current.conflictRevision).toBeUndefined();
  managed.dispose();
});

it.each([false, true])(
  'rechecks the original baseline after a native sync block (changed: %s)',
  async (changed) => {
    const { managed } = fixture();
    const target = await managed.create({ ...request, autoUpdate: true }, '', context());
    managed.start(context().window);
    host.attachments.inspect.mockRejectedValue(
      new SettingsSnapshotError(
        'download-pending',
        'Resolve native sync before reading the backup.',
      ),
    );
    expect((await managed.list(context()))[0]).toMatchObject({ status: 'paused' });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(host.attachments.publish).not.toHaveBeenCalled();

    changeStoredFile(
      changed ? 'new bytes after native sync' : host.attachments.create.mock.lastCall![1],
      changed ? 'new-external-content' : 'content-1',
    );
    const current = (await managed.list(context()))[0]!;
    expect(current.id).toBe(target.id);
    expect(current.status).toBe(changed ? 'conflict' : 'ready');
    expect(current.conflictRevision).toBe(changed ? 'new-external-content' : undefined);
    expect(host.writeBindings.mock.lastCall![0][0].expected.digest).toBe('content-1');
    await vi.advanceTimersByTimeAsync(300_000);
    expect(host.attachments.publish).not.toHaveBeenCalled();
    managed.dispose();
  },
);

it('adopts only the exact restored cloud bytes and resumes only after a real local change', async () => {
  const { managed, value } = fixture();
  const target = await managed.create({ ...request, autoUpdate: true }, '', context());
  managed.start(context().window);
  const cloud = 'externally stored snapshot\r\n';
  changeStoredFile(cloud, 'cloud-a');
  expect((await managed.list(context()))[0]).toMatchObject({ status: 'conflict' });
  value(7); // Local state after the separately verified restore.
  await expect(managed.adoptCloud(target.id, cloud.trimEnd(), context())).rejects.toMatchObject({
    code: 'stale-conflict',
  });
  expect(host.writeBindings.mock.lastCall![0][0].expected.digest).toBe('content-1');

  const adopted = await managed.adoptCloud(target.id, cloud, context());
  expect(adopted.status).toBe('ready');
  expect(adopted.conflictRevision).toBeUndefined();
  expect(host.writeBindings.mock.lastCall![0][0].expected.digest).toBe('cloud-a');
  expect(await managed.read(adopted.source, context())).toBe(cloud);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.publish).not.toHaveBeenCalled();
  value(8);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.publish).toHaveBeenCalledExactlyOnceWith(
    source,
    { ...identity, digest: 'cloud-a' },
    expect.any(String),
    expect.any(Object),
  );
  managed.dispose();
});

it('cannot adopt a cloud version displaced while the restored local baseline is being captured', async () => {
  const { managed, list, template, neoTemplate } = fixture();
  const target = await managed.create(request, '', context());
  const change = changeStoredFile('reviewed and restored', 'cloud-a');
  expect((await managed.list(context()))[0]).toMatchObject({ status: 'conflict' });
  list.mockImplementationOnce(async () => {
    change('new cloud version', 'cloud-b');
    return [template, neoTemplate];
  });
  await expect(
    managed.adoptCloud(target.id, 'reviewed and restored', context()),
  ).rejects.toMatchObject({ code: 'external-change' });
  expect(host.writeBindings.mock.lastCall![0][0]).toMatchObject({
    expected: { digest: 'content-1' },
    target: { status: 'conflict', conflictRevision: 'cloud-b' },
  });
  expect(host.attachments.publish).not.toHaveBeenCalled();
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

it('publishes workspace inventory by default and detects change without treating order as a change', async () => {
  const manual: WorkspaceExtension = {
    addonId: 'manual@test',
    name: 'Manual',
    enabled: true,
    version: '1',
    source: null,
  };
  const github: WorkspaceExtension = {
    addonId: 'github@test',
    name: 'GitHub',
    enabled: false,
    version: '1',
    source: { kind: 'github', owner: 'publisher', repo: 'add-on', assetName: 'add-on.xpi' },
    sensitiveKeys: ['otherSecret', 'apiToken'],
  };
  let addons = [manual, github];
  const { managed } = fixture(async () => ({ version: 1, addons }));
  await managed.create({ ...request, autoUpdate: true }, '', context());
  expect(JSON.parse(host.attachments.create.mock.lastCall![1]).extensions).toEqual({
    version: 1,
    addons: [{ ...github, sensitiveKeys: ['apiToken', 'otherSecret'] }, manual],
  });
  managed.start(context().window);
  addons = [{ ...github, sensitiveKeys: ['apiToken', 'otherSecret'] }, manual];
  await vi.advanceTimersByTimeAsync(300_000);
  expect(host.attachments.publish).not.toHaveBeenCalled();

  const altered = [
    { ...manual, enabled: false },
    {
      ...manual,
      enabled: false,
      source: { kind: 'xpi' as const, url: 'https://example.org/add-on.xpi' },
    },
    { ...manual, version: '2' },
    { ...manual, version: '2', name: 'Renamed' },
    { ...manual, version: '2', name: 'Renamed', sensitiveKeys: ['apiToken'] },
  ];
  for (const [index, changed] of altered.entries()) {
    addons = [github, changed];
    await vi.advanceTimersByTimeAsync(300_000);
    expect(host.attachments.publish).toHaveBeenCalledTimes(index + 1);
    expect(JSON.parse(host.attachments.publish.mock.lastCall![2]).extensions.addons[1]).toEqual(
      changed,
    );
  }
  addons = [github];
  await vi.advanceTimersByTimeAsync(300_000);
  expect(JSON.parse(host.attachments.publish.mock.lastCall![2]).extensions.addons).toHaveLength(1);
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

it('keeps the existing workspace unchanged until a new plugin revision is locally reviewed', async () => {
  const { managed, template, value } = fixture();
  const target = await managed.create({ ...request, autoUpdate: true }, '', context());
  Object.assign(template, { revision: 'review-2', status: 'needs-review' });
  managed.start(context().window);
  await vi.advanceTimersByTimeAsync(300_000);
  expect((await managed.list(context()))[0]).toMatchObject({ id: target.id, status: 'paused' });
  expect(host.report).toHaveBeenCalled();
  expect(host.attachments.publish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);

  Object.assign(template, { status: 'reviewed' });
  value(7);
  await vi.advanceTimersByTimeAsync(300_000);
  expect((await managed.list(context()))[0]).toMatchObject({
    id: target.id,
    status: 'ready',
    adapterIDs: [pluginID],
  });
  expect(host.attachments.publish).toHaveBeenCalledTimes(1);
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

it('adopts an exact restored encrypted backup without recapturing or storing credentials', async () => {
  const { managed, capture } = fixture();
  const target = await managed.create(
    { ...request, container: 'age', includeSecrets: true },
    'ephemeral password',
    context(),
  );
  changeStoredFile('new externally encrypted bytes', 'cloud-age');
  await managed.list(context());
  const adopted = await managed.adoptCloud(target.id, 'new externally encrypted bytes', context());
  expect(adopted).toMatchObject({ status: 'ready', container: 'age', autoUpdate: false });
  expect(capture).toHaveBeenCalledTimes(1);
  expect(host.attachments.publish).not.toHaveBeenCalled();
  const saved = host.writeBindings.mock.lastCall![0][0];
  expect(saved).toMatchObject({ expected: { digest: 'cloud-age' }, semantic: null });
  expect(JSON.stringify(saved)).not.toMatch(/ephemeral password|local credential/);
  managed.dispose();
});
