import { describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import {
  createDocumentPreparationModule,
  DocumentPreparationController,
  type PreparationPresentation,
} from '../../src/modules/document-preparation';
import { DocumentFixture } from '../fixtures/dialog-dom';

const native = vi.hoisted(() => ({
  mounts: [] as Array<{
    dispatch: (command: { type: string }) => void;
    models: unknown[];
    input: { value: string; focus(): void };
  }>,
}));
const credentials = vi.hoisted(() => ({
  read: vi.fn(() => 'saved-secret'),
  save: vi.fn(async (_value: string) => {}),
}));
vi.mock('../../src/platform/document-credentials', () => ({
  readMinerUToken: credentials.read,
  saveMinerUToken: credentials.save,
}));
vi.mock('../../src/platform/native-ui', () => ({
  mountNativeReactView: (options: { dispatch: (command: { type: string }) => void }) => {
    const mount = {
      dispatch: options.dispatch,
      models: [] as unknown[],
      input: { value: '', focus: vi.fn() },
    };
    native.mounts.push(mount);
    return {
      ready: new Promise<void>(() => {}),
      update: (model: unknown) => mount.models.push(model),
      getElement: (part: string) => (part === 'token' ? mount.input : null),
      dispose: vi.fn(),
    };
  },
}));

vi.mock('../../src/platform/cross-compartment', () => ({ isDeadObject: () => false }));
vi.mock('../../src/platform/document-preparation', () => ({
  documentPreparationHost: () => ({}),
  documentPreparationAbort: () => {},
}));
vi.mock('../../src/document-analysis/preparation', () => ({
  MAX_PREPARATION_FILES: 100,
  DocumentPreparationQueue: class {
    rows = [];
    running = false;
    storageFailed = false;
    init = vi.fn(async () => {});
    subscribe = vi.fn(() => () => {});
    stop = vi.fn();
    replace = vi.fn(async () => true);
    run = vi.fn(() => new Promise<void>(() => {}));
    dispose = vi.fn();
  },
}));

describe('document preparation capability', () => {
  it('retires only its own presentation when another reader replaces it in the same window', () => {
    const doc = new DocumentFixture();
    const window = {
      document: doc,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const presentation: PreparationPresentation = {
      window,
      targets: [],
      language: () => 'en',
      themeRoot: () => () => {},
      isCurrent: () => true,
    };
    const logger = { debug: vi.fn(), diagnostic: vi.fn() };
    const service = new DocumentPreparationController(vi.fn());
    const firstHost = new ModuleHost(logger, () => true);
    const secondHost = new ModuleHost(logger, () => true);
    const first = createDocumentPreparationModule(firstHost, 'reader-normal', service);
    const second = createDocumentPreparationModule(secondHost, 'reader-normal', service);

    expect(first.open(presentation)).toBe(true);
    const firstDialog = doc.find('section');
    expect(second.open(presentation)).toBe(true);
    const secondDialog = doc.find('section');
    expect(firstDialog.isConnected).toBe(false);
    expect(secondDialog.isConnected).toBe(true);
    firstHost.dispose();
    expect(secondDialog.isConnected).toBe(true);
    expect(first.open(presentation)).toBe(false);
    secondHost.dispose();
    expect(secondDialog.isConnected).toBe(false);
    expect(service.queue.stop).not.toHaveBeenCalled();
    expect(service.queue.dispose).not.toHaveBeenCalled();
  });

  it('keeps credentials out of presentation models and leaves admitted work running on close', async () => {
    const doc = new DocumentFixture();
    const window = {
      document: doc,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const service = new DocumentPreparationController(vi.fn());
    credentials.read.mockClear();
    credentials.save.mockClear();
    service.open({
      window,
      targets: [{ itemID: 1, libraryID: 1, key: 'ABCDEFGH', title: 'Paper' }],
      language: () => 'en',
      themeRoot: () => () => {},
      isCurrent: () => true,
    });
    const mount = native.mounts.at(-1)!;
    await Promise.resolve();
    expect(credentials.read).not.toHaveBeenCalled();
    mount.input.value = 'explicit-secret';
    mount.dispatch({ type: 'save' });
    await Promise.resolve();
    await Promise.resolve();
    expect(credentials.save).toHaveBeenCalledWith('explicit-secret');
    expect(JSON.stringify(mount.models)).not.toContain('explicit-secret');
    mount.input.value = '';
    mount.dispatch({ type: 'start' });
    await Promise.resolve();
    expect(credentials.read).toHaveBeenCalledOnce();
    expect(service.queue.run).toHaveBeenCalledWith('saved-secret', expect.any(Function));
    expect(JSON.stringify(mount.models)).not.toContain('saved-secret');
    mount.dispatch({ type: 'close' });
    expect(service.queue.stop).not.toHaveBeenCalled();
    expect(service.queue.dispose).not.toHaveBeenCalled();
  });
});
