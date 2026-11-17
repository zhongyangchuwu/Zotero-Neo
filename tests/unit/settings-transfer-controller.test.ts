// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  SettingsTransferCommand,
  SettingsTransferModel,
} from '../../src/settings-transfer/react-model';
import {
  SettingsTransferError,
  type SettingsAdapter,
  type SettingsDocument,
  type SettingsFileCodec,
  type SettingsChange,
  type SettingsOperationContext,
} from '../../src/settings-transfer/contracts';
import type { SettingsTransferFiles } from '../../src/platform/settings-transfer-files';
const ui = vi.hoisted(() => ({
  view: null as null | {
    model: SettingsTransferModel;
    dispatch: (command: SettingsTransferCommand) => void;
    inputs: Map<string, HTMLInputElement>;
  },
  models: [] as SettingsTransferModel[],
}));
vi.mock('../../src/platform/native-ui', () => ({
  mountNativeReactView: (options: {
    root: HTMLElement;
    model: SettingsTransferModel;
    dispatch: (command: SettingsTransferCommand) => void;
  }) => {
    const inputs = new Map<string, HTMLInputElement>();
    for (const part of ['export-password', 'export-confirm', 'import-password']) {
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
      update: (model: SettingsTransferModel) => {
        view.model = model;
        ui.models.push(model);
      },
      getElement: (part: string) => inputs.get(part) ?? null,
      dispose: () => {},
    };
  },
}));
import { SettingsTransferController } from '../../src/settings-transfer/controller';
import { SettingsTransferService } from '../../src/settings-transfer/service';

const password = 'file-password-not-in-model',
  secret = 'api-key-not-in-model';
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
let controller: SettingsTransferController | undefined;
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
function setup() {
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
  const adapter: SettingsAdapter = {
    id: 'zotero-neo',
    label: 'Neo',
    sourceVersion: '2',
    schemaVersion: 1,
    capture: async () => ({ section: source.sections[0]!, issues: [] }),
    plan,
    apply,
  };
  const open = vi.fn<SettingsFileCodec['open']>(async () => source),
    seal = vi.fn<SettingsFileCodec['seal']>(
      async () => '-----BEGIN AGE ENCRYPTED FILE-----\nciphertext',
    );
  const codec: SettingsFileCodec = { open, seal, dispose: vi.fn() };
  const write = vi.fn<SettingsTransferFiles['write']>(async () => {
    order.push('backup');
  });
  const files: SettingsTransferFiles = {
    chooseOpen: async () => '/input.age',
    chooseSave: async () => ({ path: '/output.age', replace: false }),
    choosePath: async () => null,
    backupPath: () => `/before-${++backupSequence}.age`,
    read: async () => 'ciphertext',
    write,
  };
  const debug = vi.fn();
  controller = new SettingsTransferController(
    new SettingsTransferService([adapter], () => ({ neo: '2', zotero: '10' })),
    codec,
    files,
    debug,
  );
  controller.open({
    window,
    language: () => 'en',
    themeRoot: () => () => {},
    isCurrent: () => true,
  });
  return { apply, plan, open, seal, write, debug, order, files };
}
const dispatch = (command: SettingsTransferCommand) => ui.view!.dispatch(command);
async function chooseAndInspect() {
  dispatch({ type: 'mode', value: 'import' });
  dispatch({ type: 'choose-file' });
  await vi.waitFor(() => expect(ui.view!.model.busy).toBe(false));
  ui.view!.inputs.get('import-password')!.value = password;
  dispatch({ type: 'inspect' });
}
const idle = () => vi.waitFor(() => expect(ui.view!.model.busy).toBe(false));
function expectRedacted() {
  const models = JSON.stringify(ui.models);
  expect(models).not.toContain(password);
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
  expect(seal.mock.calls[0]?.[1]).toBe(password);
  expect(ui.view!.model.canApply).toBe(false);
  expect(ui.view!.model.receipts[0]).toContain('applied');
  expectRedacted();
});

it('never creates a plan or backup after an authentication failure', async () => {
  const { open, plan, seal, apply } = setup();
  open.mockRejectedValueOnce(
    new SettingsTransferError('authentication-failed', 'Wrong password or damaged file'),
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
  expect(document.querySelector('[data-neo-settings-transfer]')).toBeNull();
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
      throw new SettingsTransferError('file-exists', 'Backup already exists');
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
