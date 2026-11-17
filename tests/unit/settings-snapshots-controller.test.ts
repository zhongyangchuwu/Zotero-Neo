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
import type { SettingsSnapshotFiles } from '../../src/platform/settings-snapshots-files';
import type {
  ManagedSettingsSnapshotsPort,
  SettingsTemplateCatalogPort,
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
    for (const part of [
      'export-password',
      'export-confirm',
      'import-password',
      'backup-password',
      'managed-password',
    ]) {
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
  backupPassword = 'independent-backup-password-not-in-model',
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
  } = {},
) {
  const order: string[] = [];
  let backupSequence = 0;
  const apply = vi.fn<SettingsAdapter['apply']>(
    async (changes: readonly SettingsChange[], _context: SettingsOperationContext) => {
      order.push('apply');
      return changes.map((change) => ({
        adapterID: 'zotero-neo',
        key: change.key,
        status: 'applied' as const,
      }));
    },
  );
  const plan = vi.fn(async () => ({
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
  const write = vi.fn<SettingsSnapshotFiles['write']>(async () => {
    order.push('backup');
  });
  const files: SettingsSnapshotFiles = {
    chooseOpen: async () => '/input.age',
    chooseSave: async () => ({ path: '/output.age', replace: false }),
    choosePath: async () => null,
    backupPath: () => `/before-${++backupSequence}.age`,
    read: async () => age,
    write,
  };
  const debug = vi.fn();
  controller = new SettingsSnapshotController(
    new SettingsSnapshotService([adapter], () => ({ neo: '2', zotero: '10' })),
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
  return { apply, plan, open, seal, capture, write, debug, order, files };
}
const dispatch = (command: SettingsSnapshotCommand) => ui.view!.dispatch(command);
async function chooseAndInspect() {
  dispatch({ type: 'mode', value: 'import' });
  dispatch({ type: 'choose-file' });
  await vi.waitFor(() => expect(ui.view!.model.busy).toBe(false));
  ui.view!.inputs.get('import-password')!.value = password;
  ui.view!.inputs.get('backup-password')!.value = backupPassword;
  dispatch({ type: 'inspect' });
}
const idle = () => vi.waitFor(() => expect(ui.view!.model.busy).toBe(false));
function expectRedacted() {
  const models = JSON.stringify(ui.models);
  expect(models).not.toContain(password);
  expect(models).not.toContain(backupPassword);
  expect(models).not.toContain(secret);
  expect(models).not.toContain('previous-secret');
}

it('keeps passwords out of models and commands, clears password DOM immediately, and encrypts the backup before any secret mutation', async () => {
  const { seal, apply, order } = setup();
  await chooseAndInspect();
  expect(ui.view!.inputs.get('import-password')!.value).toBe('');
  await idle();
  expectRedacted();
  expect(ui.view!.model.canApply).toBe(false);
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(order).toEqual(['backup', 'apply']);
  expect(apply).toHaveBeenCalledOnce();
  expect(seal.mock.calls[0]?.[1]).toBe(backupPassword);
  expect(seal.mock.calls[0]?.[3]).toBe('age');
  expect(ui.view!.model.canApply).toBe(false);
  expect(ui.view!.model.receipts[0]).toContain('applied');
  expectRedacted();
});

it('never creates a plan or backup after an authentication failure', async () => {
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

it('retains a retryable review but admits no settings when backup publication fails, without leaking native error details', async () => {
  const { write, apply, debug } = setup();
  await chooseAndInspect();
  await idle();
  write.mockRejectedValueOnce(new Error(`${password}:${secret}`));
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(apply).not.toHaveBeenCalled();
  expect(ui.view!.model.canApply).toBe(true);
  expect(ui.view!.model.error).toBe(true);
  expectRedacted();
  expect(JSON.stringify(debug.mock.calls)).not.toContain(password);
  expect(JSON.stringify(debug.mock.calls)).not.toContain(secret);
});

it('uses matching uncontrolled export passwords only after explicit confirmation and clears both fields', async () => {
  const { seal } = setup();
  ui.view!.inputs.get('export-password')!.value = password;
  ui.view!.inputs.get('export-confirm')!.value = 'different';
  dispatch({ type: 'export' });
  expect(seal).not.toHaveBeenCalled();
  expect(ui.view!.inputs.get('export-password')!.value).toBe('');
  expect(ui.view!.inputs.get('export-confirm')!.value).toBe('');
  ui.view!.inputs.get('export-password')!.value = password;
  ui.view!.inputs.get('export-confirm')!.value = password;
  dispatch({ type: 'export' });
  await idle();
  expect(seal.mock.calls[0]?.[1]).toBe(password);
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

it('keeps the previous backup intact and requires fresh overwrite consent on another inspection', async () => {
  const { apply, files, seal, write } = setup();
  const storage = new Map<string, string>();
  write.mockImplementation(async (choice, ciphertext) => {
    if (storage.has(choice.path) && !choice.replace)
      throw new SettingsSnapshotError('file-exists', 'Backup already exists');
    storage.set(choice.path, ciphertext);
  });
  files.chooseSave = async () => ({ path: '/chosen-before.age', replace: true });
  seal
    .mockResolvedValueOnce('encrypted-original-backup')
    .mockResolvedValueOnce('encrypted-next-backup');
  await chooseAndInspect();
  await idle();
  dispatch({ type: 'choose-backup' });
  await idle();
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(storage.get('/chosen-before.age')).toBe('encrypted-original-backup');
  ui.view!.inputs.get('import-password')!.value = password;
  ui.view!.inputs.get('backup-password')!.value = backupPassword;
  dispatch({ type: 'inspect' });
  await idle();
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(apply).toHaveBeenCalledTimes(2);
  expect(storage.get('/chosen-before.age')).toBe('encrypted-original-backup');
  const nextChoice = write.mock.calls[1]![0];
  expect(nextChoice.path).not.toBe('/chosen-before.age');
  expect(nextChoice.replace).toBe(false);
  expect(storage.get(nextChoice.path)).toBe('encrypted-next-backup');
  expectRedacted();
});

it('clears secret consent and password DOM when switching to JSON and passes actual container policy to capture and seal', async () => {
  const { capture, seal } = setup();
  dispatch({ type: 'include-secrets', checked: true });
  ui.view!.inputs.get('export-password')!.value = password;
  ui.view!.inputs.get('export-confirm')!.value = password;
  dispatch({ type: 'container', value: 'json' });
  expect(ui.view!.model.includeSecrets).toBe(false);
  expect(ui.view!.inputs.get('export-password')!.value).toBe('');
  expect(ui.view!.inputs.get('export-confirm')!.value).toBe('');
  dispatch({ type: 'include-secrets', checked: true });
  expect(ui.view!.model.includeSecrets).toBe(false);
  dispatch({ type: 'plugin-export', id: 'zotero-neo' });
  await idle();
  expect(capture.mock.calls[0]?.[0]).toMatchObject({ container: 'json', includeSecrets: false });
  expect(seal.mock.calls[0]?.[1]).toBe('');
  expect(seal.mock.calls[0]?.[3]).toBe('json');
  expect(seal.mock.calls[0]?.[0].sections[0]?.entries).toEqual([]);
  expectRedacted();
});

it('requires an independent backup password for plaintext imports and detects the source from contents, not its extension', async () => {
  const { files, open, plan } = setup();
  files.read = async () => JSON.stringify(source);
  dispatch({ type: 'mode', value: 'import' });
  dispatch({ type: 'choose-file' });
  await idle();
  dispatch({ type: 'inspect' });
  expect(open).not.toHaveBeenCalled();
  expect(plan).not.toHaveBeenCalled();
  expect(ui.view!.model.status).toContain('required even for plaintext');
  ui.view!.inputs.get('backup-password')!.value = backupPassword;
  dispatch({ type: 'inspect' });
  await idle();
  expect(ui.view!.inputs.get('backup-password')!.value).toBe('');
  expect(open.mock.calls[0]?.[1]).toBe('');
  expect(open.mock.calls[0]?.[2].container).toBe('json');
  expect(ui.view!.model.sourceContainer).toBe('json');
  expect(ui.view!.model.error).toBe(true);
  expect(ui.view!.model.groups).toEqual([]);
  expectRedacted();
});

it('invalidates the review without backup or mutation when a file changes after preview', async () => {
  const { files, seal, apply } = setup();
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
  expectRedacted();
});

it('rechecks source contents after publishing the backup and prevents restore if the source changed during encryption', async () => {
  const { files, seal, apply, write } = setup();
  await chooseAndInspect();
  await idle();
  seal.mockImplementationOnce(async () => {
    files.read = async () => `${age}\nchanged-during-backup`;
    return age;
  });
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(write).toHaveBeenCalledOnce();
  expect(apply).not.toHaveBeenCalled();
  expect(ui.view!.model.canApply).toBe(false);
  expectRedacted();
});

function managedFixture() {
  const source = { libraryID: 1, itemKey: 'SNAPSHOT', title: 'Plugin snapshot' };
  const target = {
    id: 'target-1',
    adapterID: 'zotero-neo',
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
  };
  const managed: ManagedSettingsSnapshotsPort = {
    start: vi.fn(() => () => {}),
    list: vi.fn(async () => [target]),
    locations: vi.fn(async () => [
      { libraryID: 1, label: 'Owned fixture library', writable: true, collections: [] },
    ]),
    sources: vi.fn(async () => [source]),
    read: vi.fn(async () => age),
    create: vi.fn(async () => target),
    update: vi.fn(async () => target),
    configure: vi.fn(async () => target),
    forget: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
  return { managed, source };
}

it('reads attachment sources through the same authenticated preview and encrypted backup barrier, including a fresh read before apply', async () => {
  const { managed, source } = managedFixture();
  const { apply, open, seal, order } = setup({ managed });
  await idle();
  dispatch({ type: 'source', libraryID: source.libraryID, itemKey: source.itemKey });
  ui.view!.inputs.get('import-password')!.value = password;
  ui.view!.inputs.get('backup-password')!.value = backupPassword;
  dispatch({ type: 'inspect' });
  await idle();
  expect(open).toHaveBeenCalledOnce();
  expect(apply).not.toHaveBeenCalled();
  expect(ui.view!.model.backupPath).toBe('');
  dispatch({ type: 'choose-backup' });
  await idle();
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(managed.read).toHaveBeenCalledTimes(3);
  expect(order).toEqual(['backup', 'apply']);
  expect(seal.mock.calls[0]?.[1]).toBe(backupPassword);
  expectRedacted();
});

it('does not apply an attachment that changed after preview', async () => {
  const { managed, source } = managedFixture();
  const { apply, seal } = setup({ managed });
  await idle();
  dispatch({ type: 'source', libraryID: source.libraryID, itemKey: source.itemKey });
  ui.view!.inputs.get('import-password')!.value = password;
  ui.view!.inputs.get('backup-password')!.value = backupPassword;
  dispatch({ type: 'inspect' });
  await idle();
  dispatch({ type: 'choose-backup' });
  await idle();
  managed.read = vi.fn(async () => `${age}\nexternal-change`);
  dispatch({ type: 'field', id: 'zotero-neo:secret:api', checked: true });
  dispatch({ type: 'apply' });
  await idle();
  expect(apply).not.toHaveBeenCalled();
  expect(seal).not.toHaveBeenCalled();
  expect(ui.view!.model.groups).toEqual([]);
});

it('clears automatic publication when choosing encryption and invokes the real managed creation, configuration and forget ports', async () => {
  const { managed } = managedFixture();
  setup({ managed });
  await idle();
  const form = ui.view!.model.targetForm;
  dispatch({
    type: 'target-form',
    value: { ...form, container: 'json', autoUpdate: true, consent: true },
  });
  expect(ui.view!.model.targetForm.autoUpdate).toBe(true);
  dispatch({ type: 'target-form', value: { ...ui.view!.model.targetForm, container: 'age' } });
  expect(ui.view!.model.targetForm.autoUpdate).toBe(false);
  ui.view!.inputs.get('managed-password')!.value = password;
  dispatch({ type: 'target-create' });
  await idle();
  expect(managed.create).toHaveBeenCalledWith(
    expect.objectContaining({ container: 'age', autoUpdate: false, consent: true }),
    password,
    expect.objectContaining({ container: 'age' }),
  );
  expect(ui.view!.inputs.get('managed-password')!.value).toBe('');
  dispatch({ type: 'target-edit', id: 'target-1' });
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
  dispatch({ type: 'target-forget', id: 'target-1' });
  await idle();
  expect(managed.forget).toHaveBeenCalledWith('target-1', expect.anything());
  expectRedacted();
});

it('restores a plaintext source only after publishing an age backup with the independent backup password', async () => {
  const { files, open, plan, capture, apply, seal, order } = setup();
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
  ui.view!.inputs.get('backup-password')!.value = backupPassword;
  dispatch({ type: 'inspect' });
  await idle();
  expect(ui.view!.model.canApply).toBe(true);
  dispatch({ type: 'apply' });
  await idle();
  expect(order).toEqual(['backup', 'apply']);
  expect(apply).toHaveBeenCalledOnce();
  expect(seal.mock.calls[0]?.[1]).toBe(backupPassword);
  expect(seal.mock.calls[0]?.[2].container).toBe('age');
  expect(seal.mock.calls[0]?.[3]).toBe('age');
  expectRedacted();
});

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
  const catalog: SettingsTemplateCatalogPort = {
    adapters: [],
    list: vi.fn(async () => [template]),
    scan: vi.fn(async () => template),
    review: vi.fn(async () => ({
      ...template,
      status: 'reviewed' as const,
      reviewedKeys: [template.fields[0]!.key],
    })),
    exportTemplate: vi.fn(async () => text),
    importTemplate: vi.fn(async () => template),
    dispose: vi.fn(),
  };
  const { files, write, capture, seal } = setup({ catalog });
  await idle();
  files.chooseSave = vi.fn(async () => ({ path: '/template.json', replace: false }));
  files.read = async () => text;
  dispatch({ type: 'scan', id: template.pluginID });
  await idle();
  expect(catalog.scan).toHaveBeenCalledWith(template.pluginID, expect.anything());
  dispatch({
    type: 'review-field',
    pluginID: template.pluginID,
    key: template.fields[0]!.key,
    portable: true,
    secret: true,
  });
  dispatch({
    type: 'review-field',
    pluginID: template.pluginID,
    key: template.fields[1]!.key,
    portable: true,
    secret: false,
  });
  dispatch({ type: 'review', id: template.pluginID });
  await idle();
  expect(catalog.review).toHaveBeenCalledWith(
    template.pluginID,
    template.revision,
    [{ key: template.fields[0]!.key, secret: true }],
    expect.anything(),
  );
  dispatch({ type: 'template-export', id: template.pluginID });
  await idle();
  expect(files.chooseSave).toHaveBeenCalledWith(window, 'zotero-neo-settings-template.json');
  expect(write).toHaveBeenCalledWith(
    { path: '/template.json', replace: false },
    text,
    expect.objectContaining({ container: 'json' }),
  );
  dispatch({ type: 'template-import' });
  await idle();
  expect(catalog.importTemplate).toHaveBeenCalledWith(text, expect.anything());
  expect(capture).not.toHaveBeenCalled();
  expect(seal).not.toHaveBeenCalled();
  expect(ui.view!.model.plugins[0]?.status).toBe('draft');
  expectRedacted();
});
