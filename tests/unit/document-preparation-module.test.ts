import { describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import {
  createDocumentPreparationModule,
  DocumentPreparationController,
  type PreparationPresentation,
} from '../../src/modules/document-preparation';
import type { PreferenceStore } from '../../src/core/preference-store';
import type { PreparationRow } from '../../src/document-analysis/preparation';
import type { PreparationReactModel } from '../../src/modules/document-preparation/react-model';
import { t } from '../../src/i18n';
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
    listeners = new Set<() => void>();
    subscribe = vi.fn((listener: () => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    });
    emit = () => this.listeners.forEach((listener) => listener());
    stop = vi.fn();
    replace = vi.fn(async () => true);
    run = vi.fn(() => new Promise<void>(() => {}));
    dispose = vi.fn();
  },
}));

function preferences(initial = 'mineru') {
  let provider = initial;
  const listeners = new Set<() => void>();
  const store = {
    get: vi.fn((key: string, fallback: unknown) =>
      key === 'documentAnalysis.provider' ? provider : fallback,
    ),
    has: vi.fn(() => false),
    set: vi.fn(),
    clear: vi.fn(),
    observe: vi.fn((_key: string, listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  return {
    store: store as unknown as PreferenceStore,
    writes: store.set,
    change(value: string) {
      provider = value;
      listeners.forEach((listener) => listener());
    },
  };
}

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
    const service = new DocumentPreparationController(vi.fn(), preferences().store);
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
    const service = new DocumentPreparationController(vi.fn(), preferences().store);
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
  it.each(['mineru', 'oxr'])(
    'tracks the current Reader service independently of MinerU work started with %s selected',
    async (initial) => {
      const doc = new DocumentFixture();
      const window = {
        document: doc,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as Window;
      const prefs = preferences(initial);
      const service = new DocumentPreparationController(vi.fn(), prefs.store);
      const target = { itemID: 1, libraryID: 1, key: 'ABCDEFGH', title: 'Paper' };
      service.open({
        window,
        targets: [target],
        language: () => 'en',
        themeRoot: () => () => {},
        isCurrent: () => true,
      });
      const mount = native.mounts.at(-1)!;
      const model = () => mount.models.at(-1) as PreparationReactModel;
      const relation = (provider: string) =>
        t(`documentPreparation.${provider === 'mineru' ? 'readerMineru' : 'readerOxr'}`, 'en');
      await Promise.resolve();
      expect(model().help).toContain(relation(initial));
      expect(model().title).toContain('MinerU');
      expect(model().start).toContain('MinerU');
      expect(model().help).toContain(initial === 'mineru' ? 'MinerU' : 'OXR');
      expect(service.queue.run).not.toHaveBeenCalled();
      mount.dispatch({ type: 'start' });
      await Promise.resolve();
      expect(service.queue.run).toHaveBeenCalledOnce();

      const queue = service.queue as unknown as {
        rows: PreparationRow[];
        running: boolean;
        emit(): void;
      };
      queue.running = true;
      queue.rows = [{ target, state: 'running' }];
      queue.emit();
      const other = initial === 'mineru' ? 'oxr' : 'mineru';
      prefs.change(other);
      expect(model().help).toContain(relation(other));
      expect(model().help).not.toContain(relation(initial));
      queue.rows = [{ target, state: 'complete' }];
      queue.emit();
      expect(model().help).toContain(relation(other));
      expect(model().rows[0]!.text).toContain(t('documentPreparation.state.complete', 'en'));
      expect(model().status).toContain(t('documentPreparation.finished', 'en'));
      expect(model().rows[0]!.text).toContain('MinerU');
      expect(model().status).toContain('MinerU');

      queue.rows = [
        { target, state: 'cached' },
        { target: { ...target, key: 'FAILED' }, state: 'failed', failure: 'service' },
        { target: { ...target, key: 'PAUSED' }, state: 'paused' },
      ];
      queue.emit();
      expect(model().rows[0]!.text).toContain(t('documentPreparation.state.cached', 'en'));
      expect(model().rows[1]!.text).toContain(t('documentPreparation.failure.service', 'en'));
      expect(model().rows[2]!.text).toContain(t('documentPreparation.state.paused', 'en'));
      prefs.change(initial);
      expect(model().help).toContain(relation(initial));
      expect(prefs.writes).not.toHaveBeenCalled();
      mount.dispatch({ type: 'close' });
      const count = mount.models.length;
      prefs.change(other);
      queue.emit();
      expect(mount.models).toHaveLength(count);
      expect(service.queue.stop).not.toHaveBeenCalled();
    },
  );
});
