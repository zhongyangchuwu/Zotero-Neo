import type * as CredentialChecks from '../../src/platform/credential-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    input: HTMLInputElement;
  }>,
}));
const credentials = vi.hoisted(() => ({
  read: vi.fn(() => 'saved-secret'),
  readSettled: vi.fn<() => Promise<string>>(),
  save: vi.fn(async (_value: string) => {}),
  check: vi.fn<(...args: [string, string, AbortSignal]) => Promise<string>>(),
  help: vi.fn(),
}));
vi.mock('../../src/platform/document-credentials', () => ({
  readSettledMinerUToken: credentials.readSettled,
  saveMinerUToken: credentials.save,
}));
vi.mock('../../src/platform/credential-check', async (importOriginal) => ({
  ...(await importOriginal<typeof CredentialChecks>()),
  checkCredential: credentials.check,
  CREDENTIAL_HELP_URLS: { mineru: 'https://mineru.net' },
  openCredentialHelp: credentials.help,
}));
beforeEach(() => {
  native.mounts.length = 0;
  credentials.read.mockReset().mockReturnValue('saved-secret');
  credentials.readSettled.mockReset().mockImplementation(async () => credentials.read());
  credentials.save.mockReset().mockImplementation(async (value) => {
    credentials.read.mockReturnValue(value);
  });
  credentials.check.mockReset().mockResolvedValue('valid');
  credentials.help.mockReset();
});
vi.mock('../../src/platform/native-ui', () => ({
  mountNativeReactView: (options: {
    root: HTMLElement;
    dispatch: (command: { type: string }) => void;
  }) => {
    const input = options.root.ownerDocument.createElementNS(
      'http://www.w3.org/1999/xhtml',
      'input',
    ) as HTMLInputElement;
    options.root.append(input);
    const mount = {
      dispatch: options.dispatch,
      models: [] as unknown[],
      input,
    };
    native.mounts.push(mount);
    return {
      ready: Promise.resolve(),
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

  it('prefills and autosaves without secret models, and leaves admitted parsing running on close', async () => {
    const fixture = credentialFixture();
    const { service, open } = fixture;
    let mount = await open();
    expect(mount.input.value).toBe('saved-secret');
    expect(credentials.check).not.toHaveBeenCalled();
    expect(service.queue.run).not.toHaveBeenCalled();
    mount.input.value = 'explicit-secret';
    mount.dispatch({ type: 'credential-change' });
    await Promise.resolve();
    expect(credentials.save).toHaveBeenLastCalledWith('explicit-secret');
    mount.dispatch({ type: 'close' });
    mount = await open();
    expect(mount.input.value).toBe('explicit-secret');
    expect(JSON.stringify(mount.models)).not.toMatch(/saved-secret|explicit-secret/);
    mount.input.value = '';
    mount.dispatch({ type: 'credential-change' });
    await Promise.resolve();
    expect(credentials.save).toHaveBeenLastCalledWith('');
    expect((mount.models.at(-1) as PreparationReactModel).credentialStatus).toBe('');
    mount.dispatch({ type: 'start' });
    await Promise.resolve();
    expect(service.queue.run).toHaveBeenCalledWith('', expect.any(Function));
    expect(credentials.check).not.toHaveBeenCalled();
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

function credentialFixture() {
  const doc = new DocumentFixture();
  const window = {
    document: doc,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Window;
  const prefs = preferences();
  const service = new DocumentPreparationController(vi.fn(), prefs.store);
  const open = async () => {
    service.open({
      window,
      targets: [{ itemID: 1, libraryID: 1, key: 'ABCDEFGH', title: 'Paper' }],
      language: () => 'en',
      themeRoot: () => () => {},
      isCurrent: () => true,
    });
    await Promise.resolve();
    await Promise.resolve();
    return native.mounts.at(-1)!;
  };
  return { service, prefs, open };
}

describe('preparation credential lifecycle', () => {
  it('admits rapid edits and deletion while storage is pending, including edits accepted before close', async () => {
    const slow = Promise.withResolvers<void>();
    credentials.save.mockReturnValue(slow.promise);
    const { service, open } = credentialFixture();
    const mount = await open();
    for (const value of ['first-secret', 'second-secret', '']) {
      mount.input.value = value;
      mount.dispatch({ type: 'credential-change' });
      expect((mount.models.at(-1) as PreparationReactModel).busy).toBe(false);
    }
    expect(credentials.save.mock.calls.map(([value]) => value)).toEqual([
      'first-secret',
      'second-secret',
      '',
    ]);
    const count = mount.models.length;
    service.close();
    slow.resolve();
    await Promise.resolve();
    expect(mount.models).toHaveLength(count);
    expect(credentials.check).not.toHaveBeenCalled();
  });

  it.each(['edit', 'close', 'replace', 'service'] as const)(
    'retires explicit verification after %s',
    async (action) => {
      const late = Promise.withResolvers<string>();
      credentials.check.mockReturnValue(late.promise);
      const { service, prefs, open } = credentialFixture();
      const mount = await open();
      mount.dispatch({ type: 'credential-verify' });
      expect(credentials.check).toHaveBeenCalledWith(
        'mineru',
        'saved-secret',
        expect.any(AbortSignal),
      );
      const signal = credentials.check.mock.calls[0]![2];
      if (action === 'edit') {
        mount.input.value = 'replacement-secret';
        mount.dispatch({ type: 'credential-change' });
      } else if (action === 'close') {
        service.close();
      } else if (action === 'replace') {
        await open();
      } else {
        prefs.change('oxr');
      }
      expect(signal.aborted).toBe(true);
      const count = mount.models.length;
      late.resolve('invalid');
      await Promise.resolve();
      await Promise.resolve();
      expect(mount.models).toHaveLength(count);
      expect(
        (native.mounts.at(-1)!.models.at(-1) as PreparationReactModel).credentialStatus,
      ).not.toBe(t('credentials.validation.invalid', 'en'));
      expect(service.queue.run).not.toHaveBeenCalled();
      service.close();
    },
  );

  it('persists completed composition and checks only the explicitly requested visible value', async () => {
    const { service, open } = credentialFixture();
    const mount = await open();
    mount.input.value = 'composing-secret';
    mount.dispatch({ type: 'credential-composition' });
    mount.dispatch({ type: 'credential-verify' });
    expect(credentials.save).not.toHaveBeenCalled();
    expect(credentials.check).not.toHaveBeenCalled();
    mount.input.value = 'completed-secret';
    mount.dispatch({ type: 'credential-change' });
    expect(credentials.save).toHaveBeenLastCalledWith('completed-secret');
    expect(credentials.check).not.toHaveBeenCalled();
    mount.dispatch({ type: 'credential-verify' });
    await vi.waitFor(() =>
      expect((mount.models.at(-1) as PreparationReactModel).credentialStatus).toBe(
        t('credentials.validation.valid', 'en'),
      ),
    );
    expect(service.queue.run).not.toHaveBeenCalled();
    mount.dispatch({ type: 'credential-help' });
    expect(credentials.help).toHaveBeenCalledWith('mineru');
    service.close();
  });
});

describe('preparation settled credential storage', () => {
  it.each(['new-secret', ''])(
    'prefills another presentation from shared pending storage value %j',
    async (value) => {
      const first = credentialFixture();
      const mount = await first.open();
      const gate = Promise.withResolvers<void>();
      const committed = gate.promise.then(() => {
        credentials.read.mockReturnValue(value);
      });
      credentials.save.mockReturnValue(committed);
      credentials.readSettled.mockImplementation(async () => {
        await committed;
        return credentials.read();
      });
      mount.input.value = value;
      mount.dispatch({ type: 'credential-change' });
      first.service.close();
      const second = credentialFixture();
      const reopened = await second.open();
      expect(reopened.input.value).toBe('');
      gate.resolve();
      await committed;
      await vi.waitFor(() => expect(reopened.input.value).toBe(value));
      expect((reopened.models.at(-1) as PreparationReactModel).credentialStatus).toBe('');
      expect(credentials.check).not.toHaveBeenCalled();
      second.service.close();
    },
  );

  it.each(['edit', 'close', 'replace', 'service'] as const)(
    'does not publish a settled prefill after %s',
    async (action) => {
      const settled = Promise.withResolvers<string>();
      credentials.readSettled.mockReturnValue(settled.promise);
      const { service, prefs, open } = credentialFixture();
      const mount = await open();
      if (action === 'edit') {
        mount.input.value = 'fresh-secret';
        mount.dispatch({ type: 'credential-change' });
      } else if (action === 'close') {
        service.close();
      } else if (action === 'replace') {
        await open();
        native.mounts.at(-1)!.input.value = 'replacement-secret';
        native.mounts.at(-1)!.dispatch({ type: 'credential-change' });
      } else {
        prefs.change('oxr');
      }
      settled.resolve('stale-secret');
      await settled.promise;
      await Promise.resolve();
      expect(mount.input.value).toBe(action === 'edit' ? 'fresh-secret' : '');
      if (action === 'replace')
        expect(native.mounts.at(-1)!.input.value).toBe('replacement-secret');
      expect(credentials.check).not.toHaveBeenCalled();
      service.close();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'waits for the current save to %s before processing one explicit verification',
    async (outcome) => {
      const { service, open } = credentialFixture();
      const mount = await open();
      const write = Promise.withResolvers<void>();
      credentials.save.mockReturnValue(write.promise);
      mount.input.value = 'unsaved-secret';
      mount.dispatch({ type: 'credential-change' });
      mount.dispatch({ type: 'credential-verify' });
      mount.dispatch({ type: 'credential-verify' });
      expect((mount.models.at(-1) as PreparationReactModel).busy).toBe(false);
      expect(credentials.check).not.toHaveBeenCalled();
      if (outcome === 'resolve') {
        write.resolve();
        await vi.waitFor(() =>
          expect((mount.models.at(-1) as PreparationReactModel).credentialStatus).toBe(
            t('credentials.validation.valid', 'en'),
          ),
        );
        expect(credentials.check).toHaveBeenCalledOnce();
      } else {
        write.reject(new Error('storage locked'));
        await vi.waitFor(() =>
          expect((mount.models.at(-1) as PreparationReactModel).credentialStatus).toBe(
            t('documentCredentials.unavailable', 'en'),
          ),
        );
        mount.dispatch({ type: 'credential-verify' });
        expect(credentials.check).not.toHaveBeenCalled();
        expect((mount.models.at(-1) as PreparationReactModel).credentialStatus).toBe(
          t('documentCredentials.unavailable', 'en'),
        );
      }
      expect(service.queue.run).not.toHaveBeenCalled();
      expect(JSON.stringify(mount.models)).not.toContain('unsaved-secret');
      service.close();
    },
  );

  it.each(['edit', 'close', 'replace', 'service'] as const)(
    'retires verification waiting on storage after %s',
    async (action) => {
      const { service, prefs, open } = credentialFixture();
      const mount = await open();
      const write = Promise.withResolvers<void>();
      credentials.save.mockReturnValue(write.promise);
      mount.input.value = 'pending-secret';
      mount.dispatch({ type: 'credential-change' });
      mount.dispatch({ type: 'credential-verify' });
      if (action === 'edit') {
        mount.input.value = 'fresh-secret';
        mount.dispatch({ type: 'credential-change' });
      } else if (action === 'close') {
        service.close();
      } else if (action === 'replace') {
        await open();
      } else {
        prefs.change('oxr');
      }
      write.resolve();
      await write.promise;
      await Promise.resolve();
      expect(credentials.check).not.toHaveBeenCalled();
      service.close();
    },
  );
});
