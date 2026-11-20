// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  SettingsSnapshotCommand,
  SettingsSnapshotModel,
} from '../../src/settings-snapshots/react-model';
import {
  SettingsSnapshotError,
  type SettingsAdapter,
  type SettingsDocument,
  type SettingsFileCodec,
  type SettingsChange,
  type SettingsOperationContext,
} from '../../src/settings-snapshots/contracts';
import type { ExtensionCandidate } from '../../src/modules/extensions/sources';
import type {
  WorkspaceExtensionManifest,
  WorkspaceExtensionPlan,
  workspaceExtensionEngine,
} from '../../src/modules/extensions/workspace';
import type { SettingsSnapshotFiles } from '../../src/platform/settings-snapshots-files';
import type {
  ManagedSettingsSnapshotsPort,
  ManagedSnapshotTarget,
  SettingsTemplateCatalogPort,
  SnapshotPluginTemplate,
} from '../../src/settings-snapshots/ports';
const ui = vi.hoisted(() => ({
  view: null as null | {
    model: SettingsSnapshotModel;
    dispatch: (command: SettingsSnapshotCommand) => void;
    inputs: Map<string, HTMLInputElement>;
  },
  models: [] as SettingsSnapshotModel[],
}));
vi.mock('../../src/platform/native-ui', () => ({
  mountNativeReactView: (options: {
    root: HTMLElement;
    model: SettingsSnapshotModel;
    dispatch: (command: SettingsSnapshotCommand) => void;
  }) => {
    const inputs = new Map<string, HTMLInputElement>();
    for (const part of ['export-password', 'import-password', 'managed-password']) {
      const input = document.createElement('input');
      input.type = 'password';
      options.root.append(input);
      inputs.set(part, input);
    }
    const view = { model: options.model, dispatch: options.dispatch, inputs };
    ui.view = view;
    ui.models.push(view.model);
    return {
      ready: Promise.resolve(),
      update: (model: SettingsSnapshotModel) => {
        view.model = model;
        ui.models.push(model);
      },
      getElement: (part: string) => inputs.get(part) ?? null,
      dispose: () => {},
    };
  },
}));
import { SettingsSnapshotController } from '../../src/settings-snapshots/controller';
import { SettingsSnapshotService } from '../../src/settings-snapshots/service';

const password = 'file-password-not-in-model',
  exportPassword = 'separate-export-password-not-in-model',
  secret = 'api-key-not-in-model',
  age = '-----BEGIN AGE ENCRYPTED FILE-----\nciphertext';
const source: SettingsDocument = {
  format: 'zotero-neo-settings',
  schemaVersion: 1,
  createdAt: '2026-11-17T00:00:00Z',
  producer: { name: 'Zotero Neo', version: '1' },
  zoteroVersion: '10',
  sections: [
    {
      adapterID: 'zotero-neo',
      schemaVersion: 1,
      sourceVersion: '1',
      entries: [{ key: 'secret:api', state: { kind: 'set', value: secret } }],
    },
  ],
};
let controller: SettingsSnapshotController | undefined;
beforeEach(() => {
  ui.view = null;
  ui.models = [];
  vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
});
afterEach(() => {
  controller?.dispose();
  controller = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function setup(
  dependencies: {
    catalog?: SettingsTemplateCatalogPort;
    managed?: ManagedSettingsSnapshotsPort;
    extensions?: typeof workspaceExtensionEngine;
  } = {},
) {
  const otherAdapterID = 'zotero';
  const apply = vi.fn<SettingsAdapter['apply']>(
    async (changes: readonly SettingsChange[], _context: SettingsOperationContext) => {
      return changes.map((change) => ({
        adapterID: 'zotero-neo',
        key: change.key,
        status: 'applied' as const,
      }));
    },
  );
  const plan = vi.fn<SettingsAdapter['plan']>(async () => ({
    adapterID: 'zotero-neo',
    sourceVersion: '2',
    issues: [],
    changes: [
      {
        adapterID: 'zotero-neo',
        key: 'secret:api',
        label: 'API credential',
        category: 'Credentials',
        secret: true,
        before: { kind: 'set' as const, value: 'previous-secret' },
        after: { kind: 'set' as const, value: secret },
        selected: false,
        requiresRestart: false,
      },
    ],
  }));
  const capture = vi.fn<SettingsAdapter['capture']>(async (context) => ({
    section: {
      ...source.sections[0]!,
      entries: context.includeSecrets ? source.sections[0]!.entries : [],
    },
    issues: [],
  }));
  const adapter: SettingsAdapter = {
    id: 'zotero-neo',
    label: 'Neo',
    sourceVersion: '2',
    schemaVersion: 1,
    capture,
    plan,
    apply,
  };
  const open = vi.fn<SettingsFileCodec['open']>(async () => source),
    seal = vi.fn<SettingsFileCodec['seal']>(
      async () => '-----BEGIN AGE ENCRYPTED FILE-----\nciphertext',
    );
  const codec: SettingsFileCodec = { open, seal, dispose: vi.fn() };
  const write = vi.fn<SettingsSnapshotFiles['write']>(async () => {});
  const files: SettingsSnapshotFiles = {
    chooseOpen: async () => '/input.age',
    chooseSave: async () => ({ path: '/output.age', replace: false }),
    choosePath: async () => null,
    read: async () => age,
    write,
  };
  const debug = vi.fn();
  controller = new SettingsSnapshotController(
    new SettingsSnapshotService(
      [
        adapter,
        {
          ...adapter,
          id: otherAdapterID,
          label: 'Zotero',
          capture: async () => ({
            section: { ...source.sections[0]!, adapterID: otherAdapterID, entries: [] },
            issues: [],
          }),
        },
      ],
      () => ({ neo: '2', zotero: '10' }),
      dependencies.extensions?.capture,
    ),
    codec,
    files,
    debug,
    dependencies,
  );
  controller.open({
    window,
    language: () => 'en',
    themeRoot: () => () => {},
    isCurrent: () => true,
  });
  return { apply, plan, open, seal, capture, write, debug, files };
}
const dispatch = (command: SettingsSnapshotCommand) => ui.view!.dispatch(command);
async function chooseAndInspect() {
  dispatch({ type: 'mode', value: 'import' });
  dispatch({ type: 'choose-file' });
  await vi.waitFor(() => expect(ui.view!.model.busy).toBe(false));
  const input = ui.view!.inputs.get('import-password')!;
  input.value = password;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}
const idle = () => vi.waitFor(() => expect(ui.view!.model.busy).toBe(false));
function expectRedacted() {
  const models = JSON.stringify(ui.models);
  expect(models).not.toContain(password);
  expect(models).not.toContain(exportPassword);
  expect(models).not.toContain(secret);
  expect(models).not.toContain('previous-secret');
}

it('uses the source password only for preview and restores selected secrets without an export', async () => {
  const { open, seal, write, apply } = setup();
  await chooseAndInspect();
  expect(ui.view!.inputs.get('import-password')!.value).toBe('');
  await idle();
  expectRedacted();
  expect(ui.view!.model.canApply).toBe(false);
  dispatch({ type: 'apply' });
  expect(apply).not.toHaveBeenCalled();
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(apply).toHaveBeenCalledOnce();
  expect(open.mock.calls[0]?.[1]).toBe(password);
  expect(seal).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(ui.view!.model.canApply).toBe(false);
  expect(ui.view!.model.receipts[0]).toContain('applied');
  expectRedacted();
});

it('never creates a plan or writes after an authentication failure', async () => {
  const { open, plan, seal, apply } = setup();
  open.mockRejectedValueOnce(
    new SettingsSnapshotError('authentication-failed', 'Wrong password or damaged file'),
  );
  await chooseAndInspect();
  await idle();
  expect(ui.view!.model.groups).toEqual([]);
  expect(ui.view!.model.error).toBe(true);
  expect(plan).not.toHaveBeenCalled();
  expect(seal).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  expectRedacted();
});

it('does not plan or resurrect secrets after closing a pending decryption', async () => {
  const { open, plan, apply } = setup(),
    gate = Promise.withResolvers<SettingsDocument>();
  open.mockImplementationOnce(() => gate.promise);
  await chooseAndInspect();
  expect(ui.view!.model.busy).toBe(true);
  controller!.close();
  gate.resolve(source);
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
  await Promise.resolve();
  await Promise.resolve();
  expect(plan).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  expect(document.querySelector('[data-neo-settings-snapshots]')).toBeNull();
  expectRedacted();
});

it('retains a retryable export after a save failure without admitting settings or leaking error details', async () => {
  const { write, apply, debug } = setup();
  await chooseAndInspect();
  await idle();
  write.mockRejectedValueOnce(new Error(`${password}:${secret}`));
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'export-current' });
  dispatch({ type: 'container', value: 'json' });
  dispatch({ type: 'export' });
  await idle();
  expect(apply).not.toHaveBeenCalled();
  expect(ui.view!.model.exportFromReview).toBe(true);
  expect(ui.view!.model.error).toBe(true);
  dispatch({ type: 'return-to-preview' });
  expect(ui.view!.model.canApply).toBe(true);
  expect(ui.view!.model.selectedCount).toBe(1);
  expectRedacted();
  expect(JSON.stringify(debug.mock.calls)).not.toContain(password);
  expect(JSON.stringify(debug.mock.calls)).not.toContain(secret);
});

it('uses one ephemeral password for explicit encryption and includes credentials only when selected', async () => {
  const { capture, seal } = setup();
  dispatch({ type: 'container', value: 'age' });
  dispatch({ type: 'export' });
  expect(seal).not.toHaveBeenCalled();
  expect(ui.view!.model.status).toContain('Enter a backup password');
  dispatch({ type: 'include-secrets', checked: true });
  ui.view!.inputs.get('export-password')!.value = password;
  dispatch({ type: 'export' });
  expect(ui.view!.inputs.get('export-password')!.value).toBe('');
  await idle();
  expect(capture.mock.calls[0]?.[0]).toMatchObject({ container: 'age', includeSecrets: true });
  expect(seal.mock.calls[0]?.[1]).toBe(password);
  expect(seal.mock.calls[0]?.[0].sections[0]?.entries).toEqual(source.sections[0]!.entries);
  expectRedacted();
});

it('warns prominently before using settings whose stored state needs full restart activation', async () => {
  const { apply } = setup();
  await chooseAndInspect();
  await idle();
  apply.mockResolvedValueOnce([
    { adapterID: 'zotero-neo', key: 'secret:api', status: 'applied', requiresRestart: true },
  ]);
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(ui.view!.model.status).toContain('Completely restart Zotero');
  expect(ui.view!.model.receipts[0]).toContain('restart required');
  expectRedacted();
});

it('returns to the same preview when cancelling the optional export file picker', async () => {
  const { files, apply, seal, write } = setup();
  files.chooseSave = async () => null;
  await chooseAndInspect();
  await idle();
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  const groups = ui.view!.model.groups;
  dispatch({ type: 'export-current' });
  expect(ui.view!.model.adapters.filter(({ selected }) => selected).map(({ id }) => id)).toEqual([
    'zotero-neo',
  ]);
  dispatch({ type: 'container', value: 'json' });
  dispatch({ type: 'export' });
  await idle();
  expect(ui.view!.model.mode).toBe('import');
  expect(ui.view!.model.groups).toEqual(groups);
  expect(apply).not.toHaveBeenCalled();
  expect(seal).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});

it('defaults to plaintext and clears credentials and password when encryption is disabled', async () => {
  const { capture, seal } = setup();
  expect(ui.view!.model.container).toBe('json');
  dispatch({ type: 'include-secrets', checked: true });
  expect(ui.view!.model.container).toBe('age');
  expect(ui.view!.model.includeSecrets).toBe(true);
  ui.view!.inputs.get('export-password')!.value = password;
  dispatch({ type: 'container', value: 'json' });
  expect(ui.view!.model.includeSecrets).toBe(false);
  expect(ui.view!.inputs.get('export-password')!.value).toBe('');
  dispatch({ type: 'export' });
  await idle();
  expect(capture.mock.calls[0]?.[0]).toMatchObject({ container: 'json', includeSecrets: false });
  expect(seal.mock.calls[0]?.[1]).toBe('');
  expect(seal.mock.calls[0]?.[3]).toBe('json');
  expect(seal.mock.calls[0]?.[0].sections[0]?.entries).toEqual([]);
  expectRedacted();
});

it('detects plaintext from contents rather than the extension and refuses plaintext credentials', async () => {
  const { files, open, plan } = setup();
  files.read = async () => JSON.stringify(source);
  dispatch({ type: 'mode', value: 'import' });
  dispatch({ type: 'choose-file' });
  await idle();
  expect(open.mock.calls[0]?.[1]).toBe('');
  expect(open.mock.calls[0]?.[2].container).toBe('json');
  expect(ui.view!.model.awaitingUnlock).toBe(false);
  expect(ui.view!.model.error).toBe(true);
  expect(ui.view!.model.groups).toEqual([]);
  expectRedacted();
});

it('invalidates the review without writing when a file changes after preview', async () => {
  const { files, seal, open, apply } = setup();
  await chooseAndInspect();
  await idle();
  files.read = async () => `${age}\nchanged`;
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(seal).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  expect(ui.view!.model.groups).toEqual([]);
  expect(ui.view!.model.status).toContain('Source contents changed');
  expect(ui.view!.model.needsDiffRefresh).toBe(true);
  expect(ui.view!.model.sourceLabel).toBe('/input.age');
  dispatch({ type: 'refresh-diff' });
  await idle();
  expect(ui.view!.model.awaitingUnlock).toBe(true);
  expect(open).toHaveBeenCalledOnce();
  ui.view!.inputs.get('import-password')!.value = password;
  dispatch({ type: 'inspect' });
  await idle();
  expect(ui.view!.model.selectedCount).toBe(1);
  expect(ui.view!.model.needsDiffRefresh).toBe(false);
  expect(ui.view!.model.awaitingUnlock).toBe(false);
  expect(open).toHaveBeenCalledTimes(2);
  expect(apply).not.toHaveBeenCalled();
  expectRedacted();
});

it('rechecks source contents after revalidating local baselines', async () => {
  const { files, plan, apply, write } = setup();
  await chooseAndInspect();
  await idle();
  const replan = await plan.mock.results[0]!.value;
  plan.mockImplementationOnce(async () => {
    files.read = async () => `${age}\nchanged-during-replan`;
    return replan;
  });
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(write).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  expect(ui.view!.model.canApply).toBe(false);
  expectRedacted();
});

it('refreshes a stale local baseline on the same unlock and keeps only intersecting chosen fields', async () => {
  const { plan, open, apply } = setup();
  const fields: readonly SettingsChange[] = [
    {
      adapterID: 'zotero-neo',
      key: 'safe:theme',
      label: 'Theme',
      category: 'Appearance',
      secret: false,
      before: { kind: 'set', value: 'old' },
      after: { kind: 'set', value: 'new' },
      selected: true,
      requiresRestart: false,
    },
  ];
  const result = { adapterID: 'zotero-neo', sourceVersion: '2', issues: [], changes: fields };
  plan.mockResolvedValue(result);
  await chooseAndInspect();
  await idle();
  const changed = { ...fields[0]!, before: { kind: 'set' as const, value: 'edited locally' } };
  plan.mockResolvedValue({
    ...result,
    changes: [changed, { ...changed, key: 'safe:new-field', label: 'New field' }],
  });
  dispatch({ type: 'apply' });
  await idle();
  expect(apply).not.toHaveBeenCalled();
  expect(ui.view!.model.needsDiffRefresh).toBe(true);
  dispatch({ type: 'refresh-diff' });
  await idle();
  expect(open).toHaveBeenCalledOnce();
  expect(ui.view!.model.awaitingUnlock).toBe(false);
  expect(ui.view!.model.groups[0]?.fields).toMatchObject([
    { label: 'Theme', before: 'edited locally', selected: true },
    { label: 'New field', selected: false },
  ]);
  expectRedacted();
});

function managedFixture(overrides: Partial<ManagedSnapshotTarget> = {}) {
  const source = { libraryID: 1, itemKey: 'SNAPSHOT', title: 'Plugin snapshot' };
  const target: ManagedSnapshotTarget = {
    id: 'target-1',
    kind: 'legacy',
    adapterIDs: ['zotero-neo'],
    source,
    title: source.title,
    collectionID: null,
    container: 'json' as const,
    autoUpdate: false,
    includeSecrets: false,
    includeLibrarySettings: false,
    status: 'ready' as const,
    message: '',
    updatedAt: '2026-11-18T00:00:00Z',
    ...overrides,
  };
  const managed: ManagedSettingsSnapshotsPort = {
    start: vi.fn(() => () => {}),
    list: vi.fn(async () => [target]),
    locations: vi.fn(async () => [
      { libraryID: 2, label: 'My Library', writable: true, collections: [] },
      { libraryID: 1, label: 'Personal fixture', personal: true, writable: true, collections: [] },
    ]),
    sources: vi.fn(async () => [source]),
    read: vi.fn(async () => age),
    create: vi.fn(async () => target),
    update: vi.fn(async () => target),
    overwrite: vi.fn(async () => target),
    adoptCloud: vi.fn(async () => target),
    configure: vi.fn(async () => target),
    forget: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
  return { managed, source, target };
}

it('ignores retired settings in a library workspace and restores selected extensions before live preferences', async () => {
  const { managed } = managedFixture();
  const workspace = { libraryID: 1, itemKey: 'WORK06', title: '[Zotero-Neo] 工作区同步' };
  managed.sources = vi.fn(async () => [workspace]);
  const direct = { kind: 'xpi', url: 'https://plugins.example/auto.xpi' } as const;
  const manifest: WorkspaceExtensionManifest = {
    version: 1,
    addons: [
      { addonId: 'auto@test', name: 'Auto', version: '1', enabled: true, source: direct },
      { addonId: 'manual@test', name: 'Manual', version: '1', enabled: true, source: null },
      { addonId: 'state@test', name: 'State', version: '1', enabled: false, source: null },
      { addonId: 'same@test', name: 'Same', version: '1', enabled: true, source: null },
    ],
  };
  const extensionPlan: WorkspaceExtensionPlan = {
    rows: [
      { entry: manifest.addons[0]!, status: 'install', sourceLabel: 'plugins.example' },
      { entry: manifest.addons[1]!, status: 'missing' },
      { entry: manifest.addons[2]!, status: 'state', currentEnabled: true },
      { entry: manifest.addons[3]!, status: 'same', currentEnabled: true },
    ],
  };
  const candidate: ExtensionCandidate = {
    name: 'manual.xpi',
    source: { kind: 'xpi', url: 'https://repair.example/manual.xpi' },
    url: 'https://repair.example/manual.xpi',
    expectedID: 'manual@test',
  };
  const mutationOrder: string[] = [];
  const applyExtensions = vi.fn<typeof workspaceExtensionEngine.apply>(
    async (_plan, _selected, _sources, _context, verify) => {
      await verify();
      mutationOrder.push('extensions');
      return {
        installed: 1,
        aligned: 1,
        skipped: [{ addonId: 'auto@test', name: 'Auto', reason: 'Zotero rejected the package' }],
        pendingRestart: true,
      };
    },
  );
  const resolveInput = vi.fn(async () => [candidate]);
  const { open, apply, plan, seal } = setup({
    managed,
    extensions: {
      capture: async () => manifest,
      inspect: async () => extensionPlan,
      resolveInput,
      apply: applyExtensions,
    },
  });
  const neo = source.sections[0]!;
  open.mockResolvedValue({
    ...source,
    extensions: manifest,
    sections: [
      { adapterID: 'itemAttributes', schemaVersion: 99, sourceVersion: '1', entries: [] },
      {
        ...neo,
        entries: [
          ...neo.entries,
          { key: 'itemAttributes.fields.v1', state: { kind: 'set', value: 'old-definitions' } },
          { key: 'modules.item-attributes.enabled', state: { kind: 'reset' } },
        ],
      },
    ],
  });
  apply.mockImplementation(async ([change]) => {
    mutationOrder.push('preferences');
    return [{ adapterID: change!.adapterID, key: change!.key, status: 'applied' }];
  });
  await idle();
  expect(ui.view!.model.preferredLibrarySource).toEqual(workspace);
  dispatch({ type: 'mode', value: 'import' });
  dispatch({ type: 'source', libraryID: workspace.libraryID, itemKey: workspace.itemKey });
  await idle();
  ui.view!.inputs.get('import-password')!.value = password;
  dispatch({ type: 'inspect' });
  await idle();
  expect(plan.mock.calls[0]?.[0]).toEqual(neo);
  expect(ui.view!.model.issues).toEqual([]);
  expect(ui.view!.model.extensionDiff).toMatchObject({
    sameCount: 1,
    rows: [
      { id: 'auto@test', status: 'install', checked: true, source: 'plugins.example' },
      { id: 'manual@test', status: 'missing', checked: false },
      { id: 'state@test', status: 'state', checked: true, fromEnabled: true, toEnabled: false },
    ],
  });
  expect(ui.view!.model.selectedCount).toBe(2);
  dispatch({ type: 'extension-source-open', id: 'manual@test' });
  dispatch({ type: 'extension-source-lookup', id: 'manual@test', value: candidate.url });
  await idle();
  expect(resolveInput).toHaveBeenCalledWith('manual@test', candidate.url, expect.any(AbortSignal));
  expect(ui.view!.model.extensionDiff?.rows[1]).toMatchObject({
    status: 'install',
    checked: false,
    source: 'repair.example',
  });
  dispatch({ type: 'extension-toggle', id: 'manual@test', checked: true });
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  expect(ui.view!.model.selectedCount).toBe(4);
  dispatch({ type: 'apply' });
  await idle();
  expect(applyExtensions.mock.calls[0]?.[1]).toEqual(
    new Set(['auto@test', 'manual@test', 'state@test']),
  );
  expect(applyExtensions.mock.calls[0]?.[2]).toEqual(new Map([['manual@test', candidate]]));
  expect(mutationOrder).toEqual(['extensions', 'preferences']);
  expect(ui.view!.model).toMatchObject({
    extensionRestart: true,
    status: expect.stringContaining(
      'Installed 1 add-ons, aligned 1 states, and restored 1 settings.',
    ),
    issues: expect.arrayContaining(['Auto · Zotero rejected the package']),
    needsDiffRefresh: true,
  });
  expect(seal).not.toHaveBeenCalled();
  expectRedacted();
});

it('reads attachment sources through the same authenticated preview and rechecks them before restoring', async () => {
  const { managed, source } = managedFixture();
  const { apply, open, seal, write } = setup({ managed });
  await idle();
  dispatch({ type: 'source', libraryID: source.libraryID, itemKey: source.itemKey });
  await idle();
  ui.view!.inputs.get('import-password')!.value = password;
  dispatch({ type: 'inspect' });
  await idle();
  expect(open).toHaveBeenCalledOnce();
  expect(apply).not.toHaveBeenCalled();
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(managed.read).toHaveBeenCalledTimes(3);
  expect(apply).toHaveBeenCalledOnce();
  expect(seal).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expectRedacted();
});

it('does not apply an attachment that changed after preview', async () => {
  const { managed, source } = managedFixture();
  const { apply, seal } = setup({ managed });
  await idle();
  dispatch({ type: 'source', libraryID: source.libraryID, itemKey: source.itemKey });
  await idle();
  ui.view!.inputs.get('import-password')!.value = password;
  dispatch({ type: 'inspect' });
  await idle();
  managed.read = vi.fn(async () => `${age}\nexternal-change`);
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(apply).not.toHaveBeenCalled();
  expect(seal).not.toHaveBeenCalled();
  expect(ui.view!.model.groups).toEqual([]);
});

it('offers same-source Refresh when an attachment is pending download after preview', async () => {
  const { managed, source } = managedFixture();
  const { apply, open } = setup({ managed });
  await idle();
  dispatch({ type: 'source', libraryID: source.libraryID, itemKey: source.itemKey });
  await idle();
  ui.view!.inputs.get('import-password')!.value = password;
  dispatch({ type: 'inspect' });
  await idle();
  vi.mocked(managed.read).mockRejectedValueOnce(
    new SettingsSnapshotError('download-pending', 'Download the attachment in Zotero first.'),
  );
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(apply).not.toHaveBeenCalled();
  expect(ui.view!.model).toMatchObject({
    needsDiffRefresh: true,
    hasPreview: false,
    sourceLabel: source.title,
  });
  expect(ui.view!.model.status).toContain('Download the attachment in Zotero first.');
  dispatch({ type: 'refresh-diff' });
  await idle();
  expect(open).toHaveBeenCalledOnce();
  expect(ui.view!.model.selectedCount).toBe(1);
});

it('creates one ordinary workspace with all selected adapters in the flagged personal library', async () => {
  const { managed } = managedFixture();
  setup({ managed });
  await idle();
  expect(ui.view!.model.targets[0]?.kind).toBe('legacy');
  dispatch({ type: 'mode', value: 'managed' });
  dispatch({ type: 'target-create' });
  await idle();
  expect(managed.create).toHaveBeenCalledOnce();
  expect(managed.create).toHaveBeenCalledWith(
    {
      adapterIDs: ['zotero-neo', 'zotero'],
      libraryID: 1,
      collectionID: null,
      title: '[Zotero-Neo] 工作区同步',
      container: 'json',
      autoUpdate: true,
      includeSecrets: false,
      includeLibrarySettings: false,
    },
    '',
    expect.objectContaining({ container: 'json' }),
  );
});

it('does not default to a writable group library even when its title is My Library', async () => {
  const { managed } = managedFixture();
  managed.locations = vi.fn(async () => [
    { libraryID: 2, label: 'My Library', writable: true, collections: [] },
  ]);
  setup({ managed });
  await idle();
  expect(ui.view!.model.targetForm.libraryID).toBe(0);
  dispatch({ type: 'target-create' });
  expect(managed.create).not.toHaveBeenCalled();
});

it('creates an encrypted, manual-only workspace and keeps legacy scope immutable', async () => {
  const { managed } = managedFixture();
  setup({ managed });
  await idle();
  const form = ui.view!.model.targetForm;
  dispatch({ type: 'target-form', value: { ...form, includeSecrets: true } });
  expect(ui.view!.model.targetForm.autoUpdate).toBe(false);
  dispatch({ type: 'target-create' });
  expect(managed.create).not.toHaveBeenCalled();
  ui.view!.inputs.get('managed-password')!.value = password;
  dispatch({ type: 'target-create' });
  await idle();
  expect(managed.create).toHaveBeenCalledWith(
    expect.objectContaining({ container: 'age', autoUpdate: false, includeSecrets: true }),
    password,
    expect.objectContaining({ container: 'age' }),
  );
  expect(ui.view!.inputs.get('managed-password')!.value).toBe('');
  dispatch({ type: 'target-edit', id: 'target-1' });
  dispatch({ type: 'target-adapter', id: 'zotero', checked: true });
  dispatch({
    type: 'target-form',
    value: { ...ui.view!.model.targetForm, title: 'Renamed snapshot' },
  });
  dispatch({ type: 'target-save' });
  await idle();
  expect(managed.configure).toHaveBeenCalledWith(
    'target-1',
    expect.objectContaining({ title: 'Renamed snapshot' }),
    expect.anything(),
  );
  expect(vi.mocked(managed.configure).mock.calls[0]?.[1]).not.toHaveProperty('adapterIDs');
  dispatch({ type: 'target-forget', id: 'target-1' });
  await idle();
  expect(managed.forget).toHaveBeenCalledWith('target-1', expect.anything());
  expectRedacted();
});

it('changes a paused workspace scope without creating or updating attachments implicitly', async () => {
  const { managed, target } = managedFixture({
    kind: 'workspace',
    status: 'paused',
    adapterIDs: ['zotero-neo', 'unavailable-plugin'],
  });
  setup({ managed });
  await idle();
  dispatch({ type: 'target-edit', id: target.id });
  dispatch({ type: 'target-adapter', id: 'unavailable-plugin', checked: false });
  dispatch({ type: 'target-adapter', id: 'zotero', checked: true });
  dispatch({ type: 'target-save' });
  await idle();
  expect(managed.configure).toHaveBeenCalledWith(
    target.id,
    expect.objectContaining({ adapterIDs: ['zotero-neo', 'zotero'], expected: target }),
    expect.anything(),
  );
  expect(managed.create).not.toHaveBeenCalled();
  expect(managed.update).not.toHaveBeenCalled();
});

it('guards overwrite with the exact observed revision and refreshes on a cloud race', async () => {
  const { managed, target } = managedFixture({
    kind: 'workspace',
    status: 'conflict',
    conflictRevision: 'cloud-old',
  });
  setup({ managed });
  await idle();
  dispatch({ type: 'target-update', id: target.id });
  dispatch({ type: 'target-overwrite', id: target.id, revision: 'not-observed' });
  expect(managed.update).not.toHaveBeenCalled();
  expect(managed.overwrite).not.toHaveBeenCalled();
  vi.mocked(managed.overwrite).mockRejectedValueOnce(
    new SettingsSnapshotError('external-change', 'Cloud changed before overwrite'),
  );
  vi.mocked(managed.list).mockResolvedValueOnce([{ ...target, conflictRevision: 'cloud-new' }]);
  dispatch({ type: 'target-overwrite', id: target.id, revision: 'cloud-old' });
  await idle();
  expect(managed.overwrite).toHaveBeenCalledWith(target.id, 'cloud-old', '', expect.anything());
  expect(ui.view!.model.targets[0]?.conflictRevision).toBe('cloud-new');
  expect(ui.view!.model.status).toContain('status was refreshed');
  dispatch({ type: 'target-overwrite', id: target.id, revision: 'cloud-old' });
  expect(managed.overwrite).toHaveBeenCalledOnce();
  vi.mocked(managed.overwrite).mockResolvedValueOnce({ ...target, status: 'ready' });
  dispatch({ type: 'target-overwrite', id: target.id, revision: 'cloud-new' });
  await idle();
  expect(managed.overwrite).toHaveBeenLastCalledWith(target.id, 'cloud-new', '', expect.anything());
  expect(ui.view!.model.targets[0]?.status).toBe('ready');
});

it('requests the password for the particular encrypted overwrite and clears it immediately', async () => {
  const { managed, target } = managedFixture({
    kind: 'workspace',
    container: 'age',
    status: 'conflict',
    conflictRevision: 'current',
  });
  setup({ managed });
  await idle();
  const overwrite = { type: 'target-overwrite', id: target.id, revision: 'current' } as const;
  dispatch(overwrite);
  expect(managed.overwrite).not.toHaveBeenCalled();
  expect(ui.view!.model.targetPasswordAction).toEqual(overwrite);
  const input = ui.view!.inputs.get('managed-password')!;
  input.value = password;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(input.value).toBe('');
  await idle();
  expect(managed.overwrite).toHaveBeenCalledWith(
    target.id,
    'current',
    password,
    expect.objectContaining({ container: 'age' }),
  );
  expect(ui.view!.model.targetPasswordAction).toBeUndefined();
  expectRedacted();
});

it.each(['complete', 'unchanged', 'unchecked', 'blocked', 'skipped', 'failed', 'drift'] as const)(
  'only adopts a cloud version whose restore is complete (%s)',
  async (scenario) => {
    const { managed, target } = managedFixture({
      kind: 'workspace',
      container: 'age',
      status: 'conflict',
      conflictRevision: 'current',
    });
    const { open, apply, plan } = setup({ managed });
    const state = { kind: 'set', value: 'new' } as const;
    const section = {
      ...source.sections[0]!,
      entries: [...source.sections[0]!.entries, { key: 'theme', state }],
    };
    open.mockResolvedValue({
      ...source,
      sections:
        scenario === 'skipped'
          ? [section, { ...section, adapterID: 'unsupported-plugin' }]
          : [section],
    });
    const written = new Set(scenario === 'unchanged' ? ['secret:api', 'theme'] : []);
    const change: SettingsChange = {
      adapterID: 'zotero-neo',
      key: 'secret:api',
      label: 'API credential',
      category: 'Credentials',
      secret: true,
      before: { kind: 'reset' },
      after: { kind: 'set', value: secret },
      selected: false,
      requiresRestart: false,
    };
    const theme: SettingsChange = {
      ...change,
      key: 'theme',
      label: 'Theme',
      secret: false,
      after: state,
      ...(scenario === 'blocked' ? { blocked: 'Choose a local value' } : {}),
    };
    plan.mockImplementation(async () => ({
      adapterID: 'zotero-neo',
      sourceVersion: '2',
      issues: [],
      changes: [change, theme].map((field) =>
        written.has(field.key) ? { ...field, before: field.after } : field,
      ),
    }));
    apply.mockImplementation(async (changes) => {
      expect(managed.adoptCloud).not.toHaveBeenCalled();
      return changes.map(({ adapterID, key }) => {
        if (scenario !== 'drift' || key !== 'theme') written.add(key);
        return { adapterID, key, status: scenario === 'failed' ? 'failed' : 'applied' };
      });
    });
    vi.mocked(managed.adoptCloud).mockResolvedValue({ ...target, status: 'ready' });
    await idle();
    dispatch({ type: 'target-preview', id: target.id });
    await idle();
    expect(ui.view!.model).toMatchObject({ reviewingConflict: true, awaitingUnlock: true });
    expect(managed.read).toHaveBeenCalledWith(target.source, expect.anything());
    ui.view!.inputs.get('import-password')!.value = password;
    dispatch({ type: 'inspect' });
    await idle();
    if (scenario === 'unchanged') {
      expect(ui.view!.model.canAdoptUnchanged).toBe(true);
    } else {
      dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
      if (scenario !== 'unchecked')
        dispatch({ type: 'field', id: 'zotero-neo:theme', checked: true });
    }
    dispatch({ type: 'apply' });
    await idle();
    if (scenario === 'unchanged') expect(apply).not.toHaveBeenCalled();
    else expect(apply).toHaveBeenCalledOnce();
    if (scenario === 'complete' || scenario === 'unchanged') {
      expect(managed.adoptCloud).toHaveBeenCalledWith(
        target.id,
        age,
        expect.objectContaining({ container: 'age' }),
      );
      expect(ui.view!.model.targets[0]?.status).toBe('ready');
    } else {
      expect(managed.adoptCloud).not.toHaveBeenCalled();
      expect(ui.view!.model.targets[0]?.status).toBe('conflict');
      expect(ui.view!.model.status).toContain('Sync stays paused');
      expect(ui.view!.model.needsDiffRefresh).toBe(true);
    }
    expect(managed.update).not.toHaveBeenCalled();
    expect(managed.overwrite).not.toHaveBeenCalled();
    expectRedacted();
  },
);

it.each(['no export', 'JSON', 'age'] as const)(
  'previews plaintext without passwords and can restore after %s',
  async (format) => {
    const { files, open, plan, capture, apply, seal, write } = setup();
    const current = { key: 'safe:theme', state: { kind: 'set' as const, value: 'old' } };
    const document: SettingsDocument = {
      ...source,
      sections: [
        {
          ...source.sections[0]!,
          entries: [{ key: 'safe:theme', state: { kind: 'set', value: 'new' } }],
        },
      ],
    };
    files.read = async () => JSON.stringify(document);
    open.mockResolvedValue(document);
    plan.mockResolvedValue({
      adapterID: 'zotero-neo',
      sourceVersion: '2',
      issues: [],
      changes: [
        {
          adapterID: 'zotero-neo',
          key: current.key,
          label: 'Theme',
          category: 'Appearance',
          secret: false,
          before: current.state,
          after: { kind: 'set', value: 'new' },
          selected: true,
          requiresRestart: false,
        },
      ],
    });
    capture.mockResolvedValue({
      section: { ...source.sections[0]!, entries: [current] },
      issues: [],
    });
    dispatch({ type: 'mode', value: 'import' });
    dispatch({ type: 'choose-file' });
    await idle();
    expect(open.mock.calls[0]?.[1]).toBe('');
    expect(open.mock.calls[0]?.[2].container).toBe('json');
    expect(ui.view!.model.groups[0]?.fields[0]).toMatchObject({ before: 'old', after: 'new' });
    expect(ui.view!.model.canApply).toBe(true);
    if (format !== 'no export') {
      dispatch({ type: 'export-current' });
      expect(
        ui.view!.model.adapters.filter(({ selected }) => selected).map(({ id }) => id),
      ).toEqual(['zotero-neo']);
      dispatch({ type: 'container', value: format === 'age' ? 'age' : 'json' });
      if (format === 'age') {
        ui.view!.inputs.get('export-password')!.value = exportPassword;
      }
      dispatch({ type: 'export' });
      await idle();
      expect(apply).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledOnce();
      expect(seal.mock.calls[0]?.[0].sections[0]?.entries).toEqual([current]);
      expect(seal.mock.calls[0]?.[1]).toBe(format === 'age' ? exportPassword : '');
      expect(ui.view!.model.mode).toBe('import');
      expect(ui.view!.model.selectedCount).toBe(1);
    }
    dispatch({ type: 'apply' });
    await idle();
    expect(apply).toHaveBeenCalledOnce();
    expect(seal).toHaveBeenCalledTimes(format === 'no export' ? 0 : 1);
    expect(write).toHaveBeenCalledTimes(format === 'no export' ? 0 : 1);
    expectRedacted();
  },
);

it('exports and imports data-only template JSON through native file ports and requires explicit review of supported local fields', async () => {
  const template = {
    pluginID: 'fixture@example.test',
    adapterID: 'plugin-fixture',
    label: 'Fixture plugin',
    version: '1',
    revision: 'a'.repeat(64),
    status: 'draft' as const,
    fields: [
      {
        key: 'extensions.fixture.theme',
        label: 'Theme',
        type: 'string' as const,
        secret: false,
        supported: true,
        requiresRestart: false,
        source: 'fixture.xhtml',
      },
      {
        key: 'extensions.fixture.dynamic',
        label: 'Dynamic',
        type: 'string' as const,
        secret: false,
        supported: false,
        reason: 'Dynamic control',
        requiresRestart: true,
        source: 'fixture.xhtml',
      },
    ],
    reviewedKeys: [],
    issues: ['Draft, not proof of full support'],
  };
  const text = JSON.stringify({
    format: 'zotero-neo-settings-template',
    schemaVersion: 1,
    pluginID: template.pluginID,
    version: '1',
    revision: template.revision,
    fields: [{ key: template.fields[0]!.key, type: 'string', secret: true }],
    status: 'draft',
  });
  let installed: SnapshotPluginTemplate = template;
  const catalog: SettingsTemplateCatalogPort = {
    adapters: [],
    list: vi.fn(async () => [installed]),
    scan: vi.fn(async () => installed),
    review: vi.fn<SettingsTemplateCatalogPort['review']>(async (_id, _revision, choices) => {
      const reviewedKeys = choices
        .filter(({ portable }) => portable !== false)
        .map(({ key }) => key);
      installed = {
        ...template,
        status: reviewedKeys.length ? 'reviewed' : 'draft',
        reviewedKeys,
        fields: installed.fields.map((field) => ({
          ...field,
          secret: field.secret || choices.some(({ key, secret }) => key === field.key && secret),
        })),
      };
      return installed;
    }),
    exportTemplate: vi.fn(async () => text),
    importTemplate: vi.fn(async () => (installed = template)),
    dispose: vi.fn(),
  };
  const { files, write, capture, seal } = setup({ catalog });
  await idle();
  files.chooseSave = vi.fn(async () => ({ path: '/template.json', replace: false }));
  files.read = async () => text;
  dispatch({ type: 'scan', id: template.pluginID });
  await idle();
  expect(catalog.scan).toHaveBeenCalledWith(template.pluginID, expect.anything());
  dispatch({ type: 'template-import' });
  await idle();
  expect(catalog.importTemplate).toHaveBeenCalledWith(text, expect.anything());
  expect(catalog.review).not.toHaveBeenCalled();
  expect(ui.view!.model.plugins[0]?.review[0]?.portable).toBe(false);
  dispatch({
    type: 'review-field',
    pluginID: template.pluginID,
    key: template.fields[1]!.key,
    portable: true,
    secret: false,
  });
  expect(catalog.review).not.toHaveBeenCalled();
  dispatch({
    type: 'review-field',
    pluginID: template.pluginID,
    key: template.fields[0]!.key,
    portable: false,
    secret: true,
  });
  await idle();
  expect(catalog.review).toHaveBeenLastCalledWith(
    template.pluginID,
    template.revision,
    [{ key: template.fields[0]!.key, secret: true, portable: false }],
    expect.anything(),
  );
  expect(ui.view!.model.plugins[0]?.review[0]?.portable).toBe(false);
  dispatch({
    type: 'review-field',
    pluginID: template.pluginID,
    key: template.fields[0]!.key,
    portable: true,
    secret: true,
  });
  await idle();
  expect(catalog.review).toHaveBeenLastCalledWith(
    template.pluginID,
    template.revision,
    [{ key: template.fields[0]!.key, secret: true }],
    expect.anything(),
  );
  expect(ui.view!.model.plugins[0]?.review[0]?.portable).toBe(true);
  dispatch({ type: 'template-export', id: template.pluginID });
  await idle();
  expect(files.chooseSave).toHaveBeenCalledWith(window, 'zotero-neo-settings-template.json');
  expect(write).toHaveBeenCalledWith(
    { path: '/template.json', replace: false },
    text,
    expect.objectContaining({ container: 'json' }),
  );
  expect(capture).not.toHaveBeenCalled();
  expect(seal).not.toHaveBeenCalled();
  expectRedacted();
});
