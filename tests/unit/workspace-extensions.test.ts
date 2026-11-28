import { afterEach, expect, it, vi } from 'vitest';
import { ZOTERO_NEO_PLUGIN_ID } from '../../src/modules/extensions/host';
import type { ExtensionSource } from '../../src/modules/extensions/sources';
import {
  applyWorkspaceExtensions,
  captureWorkspaceExtensions,
  inspectWorkspaceExtensions,
  resolveWorkspaceExtensionInput,
  workspaceExtensionCandidateLabel,
  validateWorkspaceExtensionManifest,
  type WorkspaceExtension,
} from '../../src/modules/extensions/workspace';
import { SettingsSnapshotError } from '../../src/settings-snapshots/contracts';

const permission = { uninstall: 1, enable: 2, disable: 4 };
const sourcePref = 'extensions.zotero-neo.extensionSources';
const url = (id: string) => `https://packages.example.org/${id}.xpi`;
const direct = (id: string): ExtensionSource => ({ kind: 'xpi', url: url(id) });
const translateID = 'zoteropdftranslate@euclpts.com';
const translateURL =
  'https://github.com/windingwind/zotero-pdf-translate/releases/latest/download/translate-for-zotero.xpi';
const retiredTranslateSource = {
  kind: 'xpi',
  url: translateURL,
  hash: `sha256:${'ab'.repeat(32)}`,
  expectedVersion: '2.4.8',
} as const;
const context = (signal = new AbortController().signal) => ({ signal, isCurrent: () => true });
const verify = async () => {};

function entry(
  addonId: string,
  source: ExtensionSource | null = null,
  enabled = true,
): WorkspaceExtension {
  return { addonId, name: addonId, version: '1.0', source, enabled };
}

function manifest(...addons: WorkspaceExtension[]) {
  return { version: 1 as const, addons };
}

function addon(id: string, active = true, canUninstall = true) {
  return {
    id,
    name: id,
    version: '2.0',
    type: 'extension',
    isActive: active,
    isCompatible: true,
    permissions: (canUninstall ? permission.uninstall : 0) | permission.enable | permission.disable,
    pendingOperations: 0,
    homepageURL: 'https://github.com/not/the-install-source',
    enable: vi.fn(),
    disable: vi.fn(),
    uninstall: vi.fn(),
  };
}

type NativeAddon = ReturnType<typeof addon>;
type DownloadListener = {
  onDownloadEnded(install: unknown): boolean;
  onDownloadCancelled(): void;
  onDownloadFailed(install: unknown): void;
  onInstallStarted(install: unknown): boolean;
  onInstallEnded(install: unknown, addOn: NativeAddon): void;
  onInstallPostponed(): void;
};

function host(...plugins: NativeAddon[]) {
  const installed = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const prefs = new Map<string, string>();
  const events: string[] = [];
  const downloads = new Map<string, ReturnType<typeof download>>();
  function stateChanges(plugin: NativeAddon): void {
    plugin.enable.mockImplementation(async () => {
      events.push(`enable:${plugin.id}`);
      plugin.isActive = true;
    });
    plugin.disable.mockImplementation(async () => {
      events.push(`disable:${plugin.id}`);
      plugin.isActive = false;
    });
  }
  function download(
    source: string,
    plugin: NativeAddon,
    when: 'now' | 'hold' | 'restart' | 'network' = 'now',
  ) {
    let listener: DownloadListener | undefined;
    const started = Promise.withResolvers<void>();
    const native = {
      addon: plugin,
      sourceURI: { spec: source },
      state: 0,
      error: 0,
      addListener(value: DownloadListener) {
        listener = value;
      },
      removeListener() {
        listener = undefined;
      },
      cancel: vi.fn(() => listener?.onDownloadCancelled()),
      install() {
        started.resolve();
        if (when === 'hold') return;
        if (when === 'network') {
          native.error = -1;
          listener?.onDownloadFailed(native);
          return;
        }
        native.state = 3;
        if (!listener?.onDownloadEnded(native)) return;
        if (when === 'restart') {
          listener?.onInstallPostponed();
          return;
        }
        if (!listener?.onInstallStarted(native)) return;
        stateChanges(plugin);
        installed.set(plugin.id, plugin);
        listener?.onInstallEnded(native, plugin);
      },
    };
    const result = { native, started: started.promise };
    downloads.set(source, result);
    return result;
  }
  for (const plugin of plugins) stateChanges(plugin);
  const manager = {
    PERM_CAN_UNINSTALL: permission.uninstall,
    PERM_CAN_ENABLE: permission.enable,
    PERM_CAN_DISABLE: permission.disable,
    PENDING_ENABLE: 1,
    PENDING_DISABLE: 2,
    PENDING_UNINSTALL: 4,
    PENDING_INSTALL: 8,
    PENDING_UPGRADE: 16,
    STATE_AVAILABLE: 0,
    STATE_DOWNLOADED: 3,
    ERROR_NETWORK_FAILURE: -1,
    getAddonByID: async (id: string) => installed.get(id),
    getAddonsByTypes: vi.fn(async () => [...installed.values()]),
    getInstallForURL: vi.fn(async (source: string) => {
      events.push(`install:${source}`);
      return downloads.get(source)?.native;
    }),
  };
  const read = vi.fn((key: string) => prefs.get(key));
  const save = vi.fn((key: string, value: string) => prefs.set(key, value));
  vi.stubGlobal('ChromeUtils', { importESModule: () => ({ AddonManager: manager }) });
  vi.stubGlobal('Zotero', { PreferencePanes: {} });
  vi.stubGlobal('Services', {
    prefs: {
      getPrefType: (key: string) => (prefs.has(key) ? 32 : 0),
      getStringPref: read,
      setStringPref: save,
    },
  });
  return { download, events, installed, manager, prefs, read, save };
}

afterEach(() => vi.unstubAllGlobals());

it('captures all manageable third-party extensions, reading local sources once without copying signed links', async () => {
  const github = {
    kind: 'github',
    owner: 'PubLisher',
    repo: 'AddON',
    assetName: 'release.xpi',
  } as const;
  const runtime = host(
    addon('signed'),
    addon('path'),
    addon('manual', false),
    addon('github'),
    addon('direct'),
    addon(translateID),
    addon('system', true, false),
    addon(ZOTERO_NEO_PLUGIN_ID),
  );
  runtime.prefs.set(
    sourcePref,
    JSON.stringify({
      version: 1,
      sources: {
        github,
        direct: direct('direct'),
        signed: { kind: 'xpi', url: `${url('signed')}?token=local-value` },
        path: { kind: 'xpi', url: 'https://packages.example.org/%74oken/local-value/plugin.xpi' },
        [translateID]: retiredTranslateSource,
      },
    }),
  );
  const inventory = await captureWorkspaceExtensions(
    context(),
    new Map([['manual', ['z.secret', 'a.token']]]),
  );
  expect(runtime.read).toHaveBeenCalledExactlyOnceWith(sourcePref);
  expect(inventory).toEqual(
    manifest(
      { ...entry('direct', direct('direct')), version: '2.0' },
      { ...entry('github', { ...github, owner: 'publisher', repo: 'addon' }), version: '2.0' },
      { ...entry('manual', null, false), version: '2.0', sensitiveKeys: ['a.token', 'z.secret'] },
      { ...entry('path'), version: '2.0' },
      { ...entry('signed'), version: '2.0' },
      { ...entry(translateID), version: '2.0' },
    ),
  );
  expect(JSON.stringify(inventory)).not.toContain('local-value');
  expect(JSON.parse(runtime.prefs.get(sourcePref)!).sources[translateID]).toEqual(
    retiredTranslateSource,
  );
});

it('still captures installed inventory for a broken source store and honors independent cancellation', async () => {
  const runtime = host(addon('manual'));
  runtime.prefs.set(sourcePref, '{bad store');
  await expect(captureWorkspaceExtensions(context(), new Map())).resolves.toEqual(
    manifest({ ...entry('manual'), version: '2.0' }),
  );
  const controller = new AbortController();
  runtime.manager.getAddonsByTypes.mockImplementationOnce(async () => {
    controller.abort();
    return [addon('manual')];
  });
  await expect(
    captureWorkspaceExtensions(context(controller.signal), new Map()),
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(runtime.read).toHaveBeenCalledTimes(1);
});

it('previews install, repair, state, same and protected rows without proposing device-only changes or upgrades', async () => {
  const noEnable = addon('denied', false);
  noEnable.permissions = permission.uninstall;
  host(
    addon('extra'),
    addon('same'),
    addon('state', false),
    addon('system', true, false),
    noEnable,
  );
  const plan = await inspectWorkspaceExtensions(
    manifest(
      entry('install', direct('install')),
      entry('missing', { kind: 'xpi', url: `${url('missing')}?signature=local-only` }),
      entry('same', direct('same')),
      entry('state'),
      entry('system'),
      entry('denied'),
      entry(ZOTERO_NEO_PLUGIN_ID, direct('neo')),
    ),
    context(),
  );
  expect(Object.fromEntries(plan.rows.map(({ entry, status }) => [entry.addonId, status]))).toEqual(
    {
      denied: 'blocked',
      install: 'install',
      missing: 'missing',
      same: 'same',
      state: 'state',
      system: 'blocked',
      [ZOTERO_NEO_PLUGIN_ID]: 'blocked',
    },
  );
  expect(plan.rows.find(({ status }) => status === 'install')?.sourceLabel).toBe(
    'packages.example.org',
  );
  expect(plan.rows.find(({ status }) => status === 'missing')).toMatchObject({
    entry: { source: null },
  });
  expect(plan.rows.find(({ status }) => status === 'state')?.currentEnabled).toBe(false);
  expect(JSON.stringify(plan)).not.toContain('local-only');
});

it('keeps existing Translate for Zotero inventory but treats its old Neo pin as manual provenance', async () => {
  const runtime = host(addon(translateID));
  const backup = validateWorkspaceExtensionManifest(
    manifest({ ...entry(translateID, retiredTranslateSource), version: '2.4.8' }),
  );
  expect(backup.addons).toEqual([{ ...entry(translateID), version: '2.4.8' }]);
  expect((await inspectWorkspaceExtensions(backup, context())).rows).toMatchObject([
    { status: 'same', entry: { addonId: translateID, source: null } },
  ]);
  expect(runtime.manager.getInstallForURL).not.toHaveBeenCalled();
});

it('uses the generic XPI path for explicit replacements, including Translate for Zotero', async () => {
  const signal = context().signal;
  await expect(resolveWorkspaceExtensionInput(translateID, translateURL, signal)).resolves.toEqual([
    {
      url: translateURL,
      name: 'translate-for-zotero.xpi',
      expectedID: translateID,
      source: { kind: 'xpi', url: translateURL },
    },
  ]);
  const [directCandidate] = await resolveWorkspaceExtensionInput(
    'other',
    `${url('other')}?signature=local-only`,
    signal,
  );
  expect(directCandidate?.expectedID).toBe('other');
  expect(workspaceExtensionCandidateLabel(directCandidate!)).toBe('packages.example.org');
});

it('reinstalls Zotero Bases from portable provenance without requesting another source', async () => {
  const id = 'zotero-bases@zhongyangchuwu.github.io';
  const source = {
    kind: 'github',
    owner: 'zhongyangchuwu',
    repo: 'zotero-bases',
    assetName: 'zotero-bases.xpi',
  } as const;
  const publisher = host(addon(id));
  publisher.prefs.set(sourcePref, JSON.stringify({ version: 1, sources: { [id]: source } }));
  const ctx = context();
  const backup = await captureWorkspaceExtensions(ctx, new Map());
  expect(backup.addons).toMatchObject([{ addonId: id, source }]);

  const receiver = host();
  const download =
    'https://github.com/zhongyangchuwu/Zotero-Bases/releases/download/v2.0/zotero-bases.xpi';
  receiver.download(download, addon(id));
  vi.stubGlobal('fetch', async () =>
    Response.json({
      tag_name: 'v2.0',
      assets: [{ name: source.assetName, state: 'uploaded', browser_download_url: download }],
    }),
  );
  const plan = await inspectWorkspaceExtensions(backup, ctx);
  expect(plan.rows).toMatchObject([{ status: 'install' }]);
  const result = await applyWorkspaceExtensions(plan, new Set([id]), new Map(), ctx, verify);
  expect(result).toEqual({ installed: 1, aligned: 0, pendingRestart: false, skipped: [] });
  expect(receiver.installed.get(id)?.isActive).toBe(true);
  expect(receiver.prefs.get(sourcePref)).toBe(
    JSON.stringify({ version: 1, sources: { [id]: source } }),
  );
});

it('installs before changing any states, isolates refusal and storage failure, and never mutates Neo or device-only add-ons', async () => {
  const extra = addon('extra');
  const neo = addon(ZOTERO_NEO_PLUGIN_ID);
  const system = addon('system', true, false);
  const runtime = host(extra, neo, system, addon('0-existing'));
  const wrong = runtime.download(url('b-wrong'), addon('wrong-actual-id'));
  runtime.download(url('a-storage'), addon('a-storage'));
  runtime.download(url('b-network'), addon('b-network'), 'network');
  runtime.download(url('c-repair'), addon('c-repair'));
  runtime.save.mockImplementationOnce(() => {
    throw new Error('private storage detail');
  });
  const backup = manifest(
    entry('0-existing', null, false),
    entry('a-storage', direct('a-storage'), false),
    entry('b-network', direct('b-network')),
    entry('b-wrong', direct('b-wrong')),
    entry('c-repair', null, false),
    entry('system', direct('system'), false),
    entry(ZOTERO_NEO_PLUGIN_ID, direct('neo'), false),
  );
  const ctx = context();
  const plan = await inspectWorkspaceExtensions(backup, ctx);
  const [replacement] = await resolveWorkspaceExtensionInput(
    'c-repair',
    url('c-repair'),
    ctx.signal,
  );
  const receipt = await applyWorkspaceExtensions(
    plan,
    new Set(backup.addons.map(({ addonId }) => addonId)),
    new Map([['c-repair', replacement!]]),
    ctx,
    verify,
  );
  expect(runtime.events).toEqual([
    `install:${url('a-storage')}`,
    `install:${url('b-network')}`,
    `install:${url('b-wrong')}`,
    `install:${url('c-repair')}`,
    'disable:0-existing',
    'disable:a-storage',
    'disable:c-repair',
  ]);
  expect(wrong.native.cancel).toHaveBeenCalledOnce();
  expect([...runtime.installed.keys()]).not.toContain('wrong-actual-id');
  expect([...runtime.installed.keys()]).toEqual(
    expect.arrayContaining([extra.id, neo.id, system.id]),
  );
  expect(
    [extra, neo, system].every((plugin) => plugin.isActive && !plugin.uninstall.mock.calls.length),
  ).toBe(true);
  expect(receipt).toMatchObject({ installed: 2, aligned: 3, pendingRestart: false });
  expect(receipt.skipped).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        addonId: 'a-storage',
        reason: expect.stringContaining('could not be saved'),
      }),
      expect.objectContaining({
        addonId: 'b-wrong',
        reason: expect.stringContaining('does not match'),
        needsSource: true,
      }),
      expect.objectContaining({ addonId: 'system' }),
      expect.objectContaining({ addonId: neo.id }),
    ]),
  );
  const downloadFailure = receipt.skipped.find(({ addonId }) => addonId === 'b-network');
  expect(downloadFailure?.reason).toContain('Could not download');
  expect(downloadFailure?.needsSource).toBeUndefined();
  expect(JSON.stringify(receipt)).not.toContain('private storage detail');
});

it('selects the recorded GitHub asset from the verified release and lets a rate-limited row fail independently', async () => {
  const downloaded = 'https://github.com/owner/repo/releases/download/v2.0/selected.xpi';
  const github = (repo: string): ExtensionSource => ({
    kind: 'github',
    owner: 'owner',
    repo,
    assetName: 'selected.xpi',
  });
  const runtime = host();
  runtime.download(downloaded, addon('b-release'));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (endpoint: string) =>
      endpoint.includes('/unavailable/')
        ? new Response(null, { status: 429 })
        : Response.json({
            tag_name: 'v2.0',
            assets: [
              {
                name: 'another.xpi',
                state: 'uploaded',
                browser_download_url: downloaded.replace('selected', 'another'),
              },
              { name: 'selected.xpi', state: 'uploaded', browser_download_url: downloaded },
            ],
          }),
    ),
  );
  const ctx = context();
  const plan = await inspectWorkspaceExtensions(
    manifest(entry('a-limited', github('unavailable')), entry('b-release', github('repo'))),
    ctx,
  );
  const receipt = await applyWorkspaceExtensions(
    plan,
    new Set(['a-limited', 'b-release']),
    new Map(),
    ctx,
    verify,
  );
  expect(runtime.events).toEqual([`install:${downloaded}`]);
  expect(receipt).toMatchObject({
    installed: 1,
    skipped: [{ addonId: 'a-limited', reason: expect.stringContaining('rate limit') }],
  });
});

it('stops on source changes between mutations and refuses stale state or newly installed targets', async () => {
  const existing = addon('state');
  const runtime = host(existing);
  runtime.download(url('a-first'), addon('a-first'));
  runtime.download(url('b-second'), addon('b-second'));
  const ctx = context();
  const plan = await inspectWorkspaceExtensions(
    manifest(
      entry('a-first', direct('a-first')),
      entry('b-second', direct('b-second')),
      entry('state', null, false),
    ),
    ctx,
  );
  const verifySource = vi
    .fn(async () => {})
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new SettingsSnapshotError('stale-source', 'Source changed'));
  await expect(
    applyWorkspaceExtensions(
      plan,
      new Set(['a-first', 'b-second', 'state']),
      new Map(),
      ctx,
      verifySource,
    ),
  ).rejects.toMatchObject({ code: 'stale-source' });
  expect(runtime.events).toEqual([`install:${url('a-first')}`]);
  existing.permissions = 0;
  const receipt = await applyWorkspaceExtensions(
    plan,
    new Set(['a-first', 'state']),
    new Map(),
    ctx,
    verify,
  );
  expect(receipt).toMatchObject({
    installed: 0,
    aligned: 0,
    skipped: [{ addonId: 'a-first' }, { addonId: 'state' }],
  });
  expect(runtime.events).toEqual([`install:${url('a-first')}`]);
});

it('reports one restart without crediting deferred, unconfirmed native work', async () => {
  const existing = addon('state');
  const runtime = host(existing);
  runtime.download(url('deferred'), addon('deferred'), 'restart');
  existing.disable.mockImplementation(async () => {
    existing.pendingOperations = 2;
  });
  const ctx = context();
  const plan = await inspectWorkspaceExtensions(
    manifest(entry('deferred', direct('deferred')), entry('state', null, false)),
    ctx,
  );
  const receipt = await applyWorkspaceExtensions(
    plan,
    new Set(['deferred', 'state']),
    new Map(),
    ctx,
    verify,
  );
  expect(receipt).toMatchObject({
    installed: 0,
    aligned: 0,
    pendingRestart: true,
    skipped: [
      { addonId: 'deferred', reason: expect.stringContaining('restart') },
      { addonId: 'state', reason: expect.stringContaining('restart') },
    ],
  });
});

it('wires cancellation to the native download and does not start the next package', async () => {
  const runtime = host();
  const held = runtime.download(url('a-held'), addon('a-held'), 'hold');
  runtime.download(url('b-next'), addon('b-next'));
  const controller = new AbortController();
  const ctx = context(controller.signal);
  const plan = await inspectWorkspaceExtensions(
    manifest(entry('a-held', direct('a-held')), entry('b-next', direct('b-next'))),
    ctx,
  );
  const applying = applyWorkspaceExtensions(
    plan,
    new Set(['a-held', 'b-next']),
    new Map(),
    ctx,
    verify,
  );
  await held.started;
  controller.abort();
  await expect(applying).rejects.toMatchObject({ code: 'cancelled' });
  expect(held.native.cancel).toHaveBeenCalledOnce();
  expect(runtime.events).toEqual([`install:${url('a-held')}`]);
  expect(runtime.save).not.toHaveBeenCalled();
});
