import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { BuiltinModuleRuntime, modulePreferenceKey } from '../../src/core/module-runtime';
import type { PreferenceReader } from '../../src/core/preferences';
import { validateBuiltinModules, type BuiltinModuleDescriptor } from '../../src/modules';
import { createCaptureModule } from '../../src/modules/capture';
import {
  createReaderCaptureModule,
  type ReaderCaptureModule,
} from '../../src/modules/capture/reader';
import { createNotesModule } from '../../src/modules/notes';
import {
  createReaderSelectionModule,
  type ReaderSelectionModulePorts,
} from '../../src/modules/reader-selection';
import type { ReaderRuntime } from '../../src/reader/types';

function setup(initial: Record<string, boolean> = {}) {
  const values = new Map(Object.entries(initial));
  const preferences = {
    get: (key: string, fallback: boolean | number | string) => values.get(key) ?? fallback,
  } as PreferenceReader;
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  return { values, logger, runtime: new BuiltinModuleRuntime(preferences, logger) };
}

function descriptor(
  id: BuiltinModuleDescriptor['id'],
  requires: BuiltinModuleDescriptor['requires'] = [],
): BuiltinModuleDescriptor {
  return {
    id,
    names: { en: id, 'zh-CN': id },
    hosts: ['main'],
    scopes: [],
    requires,
    optional: [],
    contributions: [],
    selectionActions: [],
    ui: [],
  };
}

describe('static module ownership', () => {
  it('rejects duplicate modules, missing hard and optional references, cycles and exact-context conflicts', () => {
    const library = descriptor('library');
    expect(() => validateBuiltinModules([library, library])).toThrow(/duplicate/i);
    expect(() => validateBuiltinModules([descriptor('capture', ['notes'])])).toThrow(/missing/i);
    expect(() => validateBuiltinModules([{ ...library, optional: ['notes'] }])).toThrow(/missing/i);
    expect(() =>
      validateBuiltinModules([descriptor('library', ['notes']), descriptor('notes', ['library'])]),
    ).toThrow(/cycle/i);
    const contribution = {
      host: 'main' as const,
      context: 'main-normal' as const,
      actions: ['openSearch' as const],
    };
    expect(() =>
      validateBuiltinModules([
        { ...library, contributions: [contribution] },
        { ...descriptor('notes'), contributions: [contribution] },
      ]),
    ).toThrow(/duplicate/i);
    expect(() =>
      validateBuiltinModules([
        { ...library, contributions: [contribution] },
        { ...descriptor('notes'), contributions: [{ ...contribution, context: 'reader-normal' }] },
      ]),
    ).not.toThrow();
  });
});

describe('module runtime lifecycle', () => {
  it('never calls disabled or blocked factories and freezes applied flags', () => {
    const { runtime, values } = setup({ [modulePreferenceKey('notes')]: false });
    const main = runtime.createScope('main', {}, () => true);
    const factory = vi.fn();
    expect(main.activate('notes', factory)).toBeNull();
    expect(main.activate('capture', factory)).toBeNull();
    expect(factory).not.toHaveBeenCalled();
    expect(runtime.blocked('capture')).toContain('notes');
    values.set(modulePreferenceKey('notes'), true);
    expect(runtime.requested().notes).toBe(true);
    expect(runtime.applied.notes).toBe(false);
    expect(main.canActivate('notes')).toBe(false);
    main.dispose();
  });

  it('isolates failures, rolls back real host resources and never retries a failed factory', () => {
    const { runtime } = setup();
    const first = runtime.createScope('main', {}, () => true);
    const second = runtime.createScope('main', {}, () => true);
    const cleanup = vi.fn();
    const failed = vi.fn(() =>
      first.host.activate('tags', (scope) => {
        scope.add(cleanup);
        first.host.bind(scope, 'main-normal', 'addTag', () => {});
        throw new Error('broken tags');
      }),
    );
    expect(first.activate('tags', failed)).toBeNull();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(first.host.hasAction('main-normal', 'addTag')).toBe(false);
    expect(first.state('tags').status).toBe('failed');
    expect(first.activate('tags', failed)).toBeNull();
    expect(failed).toHaveBeenCalledOnce();
    expect(
      second.activate('tags', () =>
        second.host.activate('tags', (scope) =>
          second.host.bind(scope, 'main-normal', 'addTag', () => {}),
        ),
      ),
    ).not.toBeNull();
    expect(second.available('main-normal', 'addTag')).toBe(true);
    expect(first.available('main-normal', 'addTag')).toBe(false);
    first.dispose();
    expect(second.available('main-normal', 'addTag')).toBe(true);
    second.dispose();
  });

  it('routes exact context through the associated host, never a different Main window', () => {
    const { runtime } = setup();
    const owner = {};
    const other = runtime.createScope('main', {}, () => true);
    const reader = runtime.createScope(
      'reader',
      {},
      () => true,
      () => owner,
    );
    other.activate('library', () =>
      other.host.activate('library', (scope) =>
        other.host.bind(scope, 'reader-normal', 'findAllItems', () => {}),
      ),
    );
    expect(reader.available('reader-normal', 'findAllItems')).toBe(false);
    const main = runtime.createScope('main', owner, () => true);
    main.activate('library', () =>
      main.host.activate('library', (scope) =>
        main.host.bind(scope, 'reader-normal', 'findAllItems', () => {}),
      ),
    );
    expect(reader.available('reader-normal', 'findAllItems')).toBe(true);
    expect(reader.available('reader-normal', 'mainYankCitekey')).toBe(false);
    main.dispose();
    expect(reader.available('reader-normal', 'findAllItems')).toBe(false);
    reader.dispose();
    other.dispose();
  });

  it('waits for the actual Main dependencies before activating real Reader capture and retires it with Main', async () => {
    const { runtime, logger } = setup();
    const owner = {};
    const reader = runtime.createScope(
      'reader',
      {},
      () => true,
      () => owner,
    );
    const selectionPorts: ReaderSelectionModulePorts = {
      reader: {} as ReaderRuntime,
      activeWindow: () => null,
      isViewCurrent: () => true,
      capturePresentation: () => () => true,
      captureView: () => () => true,
      mode: () => 'normal',
      setMode: () => {},
      enabled: () => true,
      invalidateNativeSelection: () => {},
      noteOwner: () => {},
      clearOwner: () => {},
      updateIndicator: () => {},
      scrollContainer: () => ({}) as HTMLElement,
      scrollBy: () => {},
      copyText: () => {},
      themeRoot: () => () => {},
      language: () => 'en',
      pluginID: () => null,
      contributedActions: () => [],
      registeredActions: () => [],
      showStatus: () => {},
      debug: () => {},
    };
    expect(
      reader.activate('reader-selection', () =>
        createReaderSelectionModule(reader.host, selectionPorts),
      ),
    ).not.toBeNull();
    const invokeCapture = vi.fn(async () => ({ noteID: 1, noteTitle: 'Note' }));
    const create = vi.fn(() => createReaderCaptureModule(reader.host, invokeCapture));
    let capture: ReaderCaptureModule | null = null;
    const unsubscribe = runtime.subscribe(() => {
      if (reader.canActivate('capture')) capture = reader.activate('capture', create);
    });
    expect(reader.activate('capture', create)).toBeNull();
    expect(create).not.toHaveBeenCalled();
    const main = runtime.createScope('main', owner, () => true);
    expect(
      main.activate('notes', () =>
        createNotesModule(main.host, {
          window: {} as MainWindow,
          logger,
          status: () => {},
          choose: () => null,
          selectNote: async () => ({ kind: 'unavailable', recorded: false }),
        }),
      ),
    ).not.toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(
      main.activate('capture', () =>
        createCaptureModule(main.host, {
          window: {} as MainWindow,
          logger,
          pickerBusy: () => false,
          status: () => {},
          choose: () => null,
        }),
      ),
    ).not.toBeNull();
    expect(create).toHaveBeenCalledOnce();
    const action = capture!.selectionAction('en');
    const selected = { text: 'text', itemID: 42, pageLabel: null, position: null };
    expect(action.isAvailable?.(selected)).toBe(true);
    main.dispose();
    expect(reader.state('capture').status).toBe('blocked');
    expect(action.isAvailable?.(selected)).toBe(false);
    expect(await action.run(selected)).toEqual({ retired: true });
    expect(invokeCapture).not.toHaveBeenCalled();
    unsubscribe();
    reader.dispose();
  });
});
