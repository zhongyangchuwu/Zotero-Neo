// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Cleanup } from '../../src/core/cleanup';
import type { MainWindow } from '../../src/core/contracts';
import type { PreferenceStore } from '../../src/core/preference-store';
import type {
  ItemAttributesPort,
  ItemAttributesPresentation,
} from '../../src/item-attributes/contracts';
import type {
  ItemAttributesCommand,
  ItemAttributesModel,
} from '../../src/item-attributes/react-model';
import type { ItemAttributeDefinition } from '../../src/item-attributes/types';
import type { NativeItemAttribute } from '../../src/toolkit/main/item-attributes-types';
import type * as MainToolkit from '../../src/toolkit/main';
import type { NativeReactViewOptions } from '../../src/ui/react/types';

const boundary = vi.hoisted(() => ({
  create: vi.fn(),
  classify: vi.fn(),
  mount: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('../../src/toolkit/main', async (importOriginal) => ({
  ...(await importOriginal<typeof MainToolkit>()),
  createItemAttributeNativeHost: boundary.create,
  assertCustomExtraKey: boundary.classify,
  executeCollectionTransaction: boundary.transaction,
  captureItemExtraRecovery: () => ({ saved: vi.fn(), restore: vi.fn() }),
}));
vi.mock('../../src/platform/native-ui', () => ({ mountNativeReactView: boundary.mount }));
import { ItemAttributesController } from '../../src/item-attributes/controller';

type ViewOptions = NativeReactViewOptions<ItemAttributesModel, ItemAttributesCommand>;
const views: {
  options: ViewOptions;
  dispose: Mock;
  update: Mock<(model: ItemAttributesModel) => void>;
}[] = [];
const controllers: ItemAttributesController[] = [];

beforeEach(() => {
  boundary.create.mockReset();
  boundary.classify.mockReset();
  boundary.mount.mockReset();
  boundary.transaction.mockReset();
  boundary.transaction.mockImplementation(async (run: () => Promise<number>) => run());
  views.length = 0;
  vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
  vi.stubGlobal('Zotero', { initializationPromise: Promise.resolve() });
  boundary.mount.mockImplementation((options: ViewOptions) => {
    const view = {
      options,
      dispose: vi.fn(),
      update: vi.fn<(model: ItemAttributesModel) => void>(),
    };
    views.push(view);
    return {
      ready: Promise.resolve(),
      update: view.update,
      dispose: view.dispose,
      getElement: () => null,
    };
  });
});

afterEach(() => {
  for (const controller of controllers) controller.dispose();
  controllers.length = 0;
  document
    .querySelectorAll('[data-neo-item-attributes]')
    .forEach((root) => root.parentElement?.remove());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(fields?: readonly ItemAttributeDefinition[]) {
  const observers = new Set<() => void>();
  const unobserve = vi.fn();
  let raw = JSON.stringify({
    version: fields ? 2 : 1,
    fields: fields ?? [{ id: 'score', key: 'Research Score', label: 'Score', type: 'number' }],
  });
  const set = vi.fn((_key: string, value: string) => {
    raw = value;
    for (const observer of observers) observer();
  });
  const preferences = {
    has: () => true,
    get: () => raw,
    set,
    clear: vi.fn(),
    observe: (_key: string, listener: () => void) => {
      observers.add(listener);
      return () => {
        observers.delete(listener);
        unobserve();
      };
    },
  } as unknown as PreferenceStore;
  const activeWindows = new Set<MainWindow>();
  const releases = new Map<MainWindow, Mock<Cleanup>>();
  let definitions: readonly NativeItemAttribute[] = [];
  const registrations = new Set<string>();
  const native = {
    replace: vi.fn((fields: readonly NativeItemAttribute[]) => {
      definitions = fields;
      registrations.clear();
      for (const field of fields) registrations.add(field.id);
    }),
    attachWindow: vi.fn((owner: MainWindow) => {
      activeWindows.add(owner);
      const release = vi.fn(() => {
        activeWindows.delete(owner);
      });
      releases.set(owner, release);
      return release;
    }),
    dispose: vi.fn(() => {
      activeWindows.clear();
      registrations.clear();
    }),
  };
  boundary.create.mockReturnValue(native);
  const controller = new ItemAttributesController(preferences, vi.fn());
  controllers.push(controller);
  const port: ItemAttributesPort = controller;
  const owner = window as unknown as MainWindow;
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  const added = vi.spyOn(window, 'addEventListener');
  const removed = vi.spyOn(window, 'removeEventListener');
  const untheme = vi.fn();
  const host: ItemAttributesPresentation = {
    window: owner,
    mode: 'definitions',
    items: [],
    language: () => 'en',
    isCurrent: () => true,
    themeRoot: () => untheme,
  };
  return {
    controller,
    port,
    owner,
    host,
    native,
    releases,
    activeWindows,
    registrations,
    observers,
    unobserve,
    set,
    untheme,
    alert,
    added,
    removed,
    definitions: () => definitions,
    start: async () => {
      controller.start('test-plugin');
      await vi.waitFor(() => expect(native.replace).toHaveBeenCalledOnce());
    },
    expectViewReleased: (view = views[0]!) => {
      expect(view.options.isCurrent()).toBe(false);
      expect(view.options.root.isConnected).toBe(false);
      expect(view.options.root.parentElement?.isConnected ?? false).toBe(false);
      expect(document.querySelector('[data-neo-item-attributes]')).toBeNull();
      for (const [type, listener, options] of added.mock.calls) {
        if (type === 'keydown' || type === 'focusin')
          expect(removed).toHaveBeenCalledWith(type, listener, options);
        // Unload listener options do not affect listener identity on removal.
        if (type === 'unload') expect(removed).toHaveBeenCalledWith(type, listener);
      }
    },
  };
}

it('closes the owner after React and theme teardown fail, preserving the first error and retiring stale commands', async () => {
  const h = setup();
  await h.start();
  h.port.open(h.host);
  const view = views[0]!;
  const removed = vi.spyOn(view.options.root, 'removeEventListener');
  const reactError = new Error('React teardown failed');
  view.dispose.mockImplementationOnce(() => {
    throw reactError;
  });
  h.untheme.mockImplementationOnce(() => {
    throw new Error('Theme teardown failed');
  });

  expect(() => h.port.closeOwner(window)).toThrow(reactError);
  h.expectViewReleased();
  expect(h.untheme).toHaveBeenCalledOnce();
  expect(removed).toHaveBeenCalledWith('compositionstart', expect.any(Function));
  expect(removed).toHaveBeenCalledWith('compositionend', expect.any(Function));
  view.options.dispatch({ type: 'new-definition' });
  view.options.dispatch({ type: 'save-definition' });
  expect(view.update).not.toHaveBeenCalled();
  expect(h.set).not.toHaveBeenCalled();
  expect(h.port.open(h.host)).toBeTypeOf('function');
});

it('detaches the window lease despite a throwing dialog teardown', async () => {
  const h = setup();
  const detach = h.port.attachWindow(h.owner);
  await h.start();
  h.port.open(h.host);
  const error = new Error('Theme teardown failed');
  h.untheme.mockImplementationOnce(() => {
    throw error;
  });

  expect(detach).toThrow(error);
  h.expectViewReleased();
  expect(h.releases.get(h.owner)).toHaveBeenCalledOnce();
  expect(h.activeWindows.size).toBe(0);
  expect(detach).not.toThrow();
});

it('retires shutdown first, attempts every owner and store release, and retains failed native cleanup for explicit disposal', async () => {
  const h = setup();
  h.port.attachWindow(h.owner);
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const secondOwner = frame.contentWindow as unknown as MainWindow;
  h.port.attachWindow(secondOwner);
  await h.start();
  h.port.open(h.host);
  const view = views[0]!;
  const fields = h.definitions();
  const reactError = new Error('React teardown failed');
  view.dispose.mockImplementationOnce(() => {
    expect(h.port.open(h.host)).toBeNull();
    expect(h.port.attachWindow(h.owner)).toBeTypeOf('function');
    throw reactError;
  });
  h.untheme.mockImplementationOnce(() => {
    throw new Error('Theme teardown failed');
  });
  const failedRelease = h.releases.get(h.owner)!;
  failedRelease.mockImplementationOnce(() => {
    throw new Error('Window detach failed');
  });
  h.native.dispose.mockImplementationOnce(() => {
    throw new Error('Native unregister failed');
  });

  expect(() => h.controller.dispose()).toThrow(reactError);
  h.expectViewReleased();
  expect(h.releases.get(secondOwner)).toHaveBeenCalledOnce();
  expect(h.native.dispose).toHaveBeenCalledOnce();
  expect(h.unobserve).toHaveBeenCalledOnce();
  expect(h.observers.size).toBe(0);
  expect(h.registrations.size).toBe(1);
  expect(h.activeWindows.has(h.owner)).toBe(true);
  const item = { id: 1, setField: vi.fn(), save: vi.fn() } as unknown as Zotero.Item;
  view.options.dispatch({ type: 'new-definition' });
  view.options.dispatch({ type: 'save-definition' });
  view.options.dispatch({ type: 'set-value' });
  expect(fields[0]!.canEdit(item)).toBe(false);
  expect(fields[0]!.read(item)).toBe('');
  await expect(fields[0]!.write(item, '2', '', () => true)).rejects.toThrow('no longer current');
  expect(item.setField).not.toHaveBeenCalled();
  expect(item.save).not.toHaveBeenCalled();
  expect(h.set).not.toHaveBeenCalled();
  expect(h.port.open(h.host)).toBeNull();

  expect(() => h.controller.dispose()).not.toThrow();
  expect(failedRelease).toHaveBeenCalledTimes(2);
  expect(h.releases.get(secondOwner)).toHaveBeenCalledOnce();
  expect(h.native.dispose).toHaveBeenCalledTimes(2);
  expect(h.activeWindows.size).toBe(0);
  expect(h.registrations.size).toBe(0);
  expect(h.unobserve).toHaveBeenCalledOnce();
  expect(() => h.controller.dispose()).not.toThrow();
  expect(h.native.dispose).toHaveBeenCalledTimes(2);
});

it('releases attached peers on startup failure, reports the original failure, and retains unsuccessful releases for disposal', async () => {
  const h = setup();
  h.port.attachWindow(h.owner);
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const secondOwner = frame.contentWindow as unknown as MainWindow;
  vi.spyOn(secondOwner, 'alert').mockImplementation(() => {});
  h.port.attachWindow(secondOwner);
  const attach = h.native.attachWindow.getMockImplementation()!;
  const startupError = new Error('Startup attachment failed');
  h.native.attachWindow.mockImplementation((owner) => {
    if (owner === secondOwner) throw startupError;
    const release = attach(owner);
    release.mockImplementationOnce(() => {
      throw new Error('Detach failed during startup');
    });
    return release;
  });
  h.native.dispose.mockImplementationOnce(() => {
    throw new Error('Startup unregister failed');
  });
  h.controller.start('test-plugin');

  await vi.waitFor(() =>
    expect(h.alert).toHaveBeenCalledWith(expect.stringContaining(startupError.message)),
  );
  expect(h.native.dispose).toHaveBeenCalledOnce();
  expect(h.releases.get(h.owner)).toHaveBeenCalledOnce();
  expect(h.definitions()[0]!.canEdit({} as Zotero.Item)).toBe(false);
  expect(h.observers.size).toBe(1);
  expect(h.unobserve).not.toHaveBeenCalled();
  expect(h.port.open(h.host)).toBeTypeOf('function');
  expect(views[0]!.options.model.available).toBe(false);
  expect(views[0]!.options.model.status).toContain('not ready');
  expect(() => h.controller.dispose()).not.toThrow();
  expect(h.releases.get(h.owner)).toHaveBeenCalledTimes(2);
  expect(h.native.dispose).toHaveBeenCalledTimes(2);
  expect(h.activeWindows.size).toBe(0);
  expect(h.registrations.size).toBe(0);
  expect(h.observers.size).toBe(0);
});

it('removes the backdrop and listeners after a mounting failure even when theme teardown throws', async () => {
  const h = setup();
  await h.start();
  const mountError = new Error('React mount failed');
  boundary.mount.mockImplementationOnce(() => {
    throw mountError;
  });
  h.untheme.mockImplementationOnce(() => {
    throw new Error('Theme teardown failed');
  });

  expect(h.port.open(h.host)).toBeNull();
  expect(document.querySelector('[data-neo-item-attributes]')).toBeNull();
  expect(h.untheme).toHaveBeenCalledOnce();
  expect(h.alert).toHaveBeenCalledWith(expect.stringContaining(mountError.message));
  for (const [type, listener] of h.added.mock.calls)
    expect(
      h.removed.mock.calls.some(
        ([removedType, removedListener]) => removedType === type && removedListener === listener,
      ),
    ).toBe(true);
});

it('does not acquire native resources after disposal while initialization is pending', async () => {
  // The project's ES2022 target does not provide Promise.withResolvers.
  let initialized!: () => void;
  vi.stubGlobal('Zotero', {
    initializationPromise: new Promise<void>((resolve) => {
      initialized = resolve;
    }),
  });
  const h = setup();
  h.port.attachWindow(h.owner);
  h.controller.start('test-plugin');
  h.controller.dispose();
  initialized();
  await Promise.resolve();
  await Promise.resolve();

  expect(boundary.create).not.toHaveBeenCalled();
  expect(h.observers.size).toBe(0);
  expect(h.unobserve).toHaveBeenCalledOnce();
  expect(h.port.open(h.host)).toBeNull();
});

it('generates distinct stable keys for matching Chinese names and skips occupied normalized keys', async () => {
  const reservedKey = `Neo Attribute ${'A'.repeat(20)}`;
  const randomString = vi
    .fn()
    .mockReturnValueOnce('M'.repeat(20))
    .mockReturnValueOnce('a'.repeat(20))
    .mockReturnValueOnce('B'.repeat(20))
    .mockReturnValueOnce('b'.repeat(20))
    .mockReturnValueOnce('C'.repeat(20))
    .mockReturnValueOnce('D'.repeat(20));
  vi.stubGlobal('Zotero', { ...Zotero, Utilities: { randomString } });
  const h = setup();
  await h.start();
  h.port.open(h.host);
  const view = views[0]!;
  const { dispatch } = view.options;
  const create = (label: string, key?: string) => {
    dispatch({ type: 'new-definition' });
    dispatch({ type: 'draft-label', value: label });
    if (key !== undefined) dispatch({ type: 'draft-key', value: key });
    dispatch({ type: 'save-definition' });
  };

  create('Existing key', reservedKey);
  create('阅读进度');
  create('阅读进度');
  const [first, second] = view.update.mock.lastCall![0].definitions.filter(
    ({ label }) => label === '阅读进度',
  );
  expect(first!.key).toMatch(/^neo-attribute-[a-z0-9]+$/);
  expect(second!.key).toMatch(/^neo-attribute-[a-z0-9]+$/);
  expect(first!.key).not.toBe(second!.key);
  expect(first!.key).not.toBe(`neo-attribute-${'a'.repeat(20)}`);
  expect(view.update.mock.lastCall![0].definitions).toContainEqual(
    expect.objectContaining({ label: 'Existing key', key: reservedKey }),
  );

  dispatch({ type: 'edit-definition', id: first!.id });
  dispatch({ type: 'draft-label', value: '阅读阶段' });
  dispatch({ type: 'draft-key', value: 'Attempted replacement' });
  dispatch({ type: 'save-definition' });
  expect(view.update.mock.lastCall![0].definitions).toContainEqual({
    ...first,
    label: '阅读阶段',
  });

  dispatch({ type: 'remove-definition', id: first!.id });
  dispatch({ type: 'confirm-remove' });
  create('恢复阅读阶段', first!.key);
  const restored = view.update.mock.lastCall![0].definitions.find(
    ({ label }) => label === '恢复阅读阶段',
  )!;
  const item = {
    isRegularItem: () => true,
    getField: () => `${first!.key}: 已读`,
  } as unknown as Zotero.Item;
  expect(
    h
      .definitions()
      .find(({ id }) => id === restored.id)
      ?.read(item),
  ).toBe('已读');
});

it('keeps or discards a dirty definition on explicit close and Escape without saving', async () => {
  const h = setup();
  await h.start();
  h.port.open(h.host);
  const view = views[0]!;
  const { dispatch, root } = view.options;
  const model = () => view.update.mock.lastCall![0];
  const escape = () =>
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  dispatch({ type: 'edit-definition', id: 'score' });
  dispatch({ type: 'draft-label', value: 'Reading score' });
  dispatch({ type: 'close' });
  expect(model().discard).toBe('close');
  expect(root.isConnected).toBe(true);
  dispatch({ type: 'keep-editing' });
  expect(model().discard).toBeNull();
  expect(model().draft?.label).toBe('Reading score');

  escape();
  expect(model().discard).toBe('close');
  escape();
  expect(model().discard).toBeNull();
  expect(model().draft?.label).toBe('Reading score');
  escape();
  dispatch({ type: 'confirm-discard' });
  h.expectViewReleased();
  expect(h.set).not.toHaveBeenCalled();
});

it('protects staged batch actions and dirty values on mode switches without retargeting', async () => {
  const items = [1, 2, 3].map(
    (id) =>
      ({
        id,
        libraryID: 1,
        isRegularItem: () => true,
        isEditable: () => true,
        getField: (field: string) => (field === 'extra' ? `Research Score: ${id}` : `Item ${id}`),
        setField: vi.fn(),
      }) as unknown as Zotero.Item,
  );
  vi.stubGlobal('Zotero', {
    ...Zotero,
    Items: { get: (id: number) => items.find((item) => item.id === id) },
    Libraries: { get: () => ({ editable: true, libraryType: 'user' }) },
  });
  const h = setup();
  await h.start();
  const selection = items.slice(0, 2);
  h.port.open({ ...h.host, mode: 'values', items: selection });
  selection.splice(0, 2, items[2]!);
  const view = views[0]!;
  const { dispatch } = view.options;
  const model = () => view.update.mock.lastCall![0];

  dispatch({ type: 'clear-value' });
  expect(model().review).toEqual({ value: null });
  dispatch({ type: 'mode', value: 'definitions' });
  expect(model().discard).toBe('definitions');
  expect(model().mode).toBe('values');
  dispatch({ type: 'keep-editing' });
  expect(model().review).toEqual({ value: null });
  expect(model().targets.map(({ id, value }) => [id, value])).toEqual([
    [1, '1'],
    [2, '2'],
  ]);

  dispatch({ type: 'input', value: '8' });
  expect(model().review).toBeNull();
  dispatch({ type: 'mode', value: 'definitions' });
  expect(model().discard).toBe('definitions');
  dispatch({ type: 'confirm-discard' });
  expect(model().mode).toBe('definitions');
  expect(model().discard).toBeNull();
  dispatch({ type: 'mode', value: 'values' });
  expect(model().input).toBe('');
  expect(model().targets.map(({ id, value }) => [id, value])).toEqual([
    [1, '1'],
    [2, '2'],
  ]);
  for (const item of items) expect(item.setField).not.toHaveBeenCalled();
});

it('keeps option IDs on rename, detects option-only drafts, and leaves stored values on removal', async () => {
  const randomString = vi
    .fn()
    .mockReturnValueOnce('a'.repeat(20))
    .mockReturnValueOnce('b'.repeat(20))
    .mockReturnValueOnce('c'.repeat(20));
  vi.stubGlobal('Zotero', { ...Zotero, Utilities: { randomString } });
  const h = setup();
  await h.start();
  h.port.open(h.host);
  const view = views[0]!;
  const { dispatch } = view.options;
  const model = () => view.update.mock.lastCall![0];

  dispatch({ type: 'new-definition' });
  dispatch({ type: 'draft-label', value: 'Stage' });
  dispatch({ type: 'draft-type', value: 'single-select' });
  dispatch({ type: 'draft-add-option' });
  const planned = model().draft!.options[0]!.id;
  dispatch({ type: 'draft-rename-option', id: planned, value: 'Planned' });
  dispatch({ type: 'draft-add-option' });
  const done = model().draft!.options[1]!.id;
  dispatch({ type: 'draft-rename-option', id: done, value: 'Done' });
  dispatch({ type: 'save-definition' });
  const stage = model().definitions.find(({ label }) => label === 'Stage')!;
  expect(stage.type).toBe('single-select');
  expect(stage.options).toEqual([
    { id: planned, label: 'Planned' },
    { id: done, label: 'Done' },
  ]);

  const extra = `${stage.key}: ${JSON.stringify([planned])}`;
  const item = {
    isRegularItem: () => true,
    getField: () => extra,
    setField: vi.fn(),
  } as unknown as Zotero.Item;
  const readNative = () =>
    h
      .definitions()
      .find(({ id }) => id === stage.id)!
      .read(item);
  expect(readNative()).toBe('Planned');

  dispatch({ type: 'edit-definition', id: stage.id });
  dispatch({ type: 'draft-rename-option', id: planned, value: 'To read' });
  dispatch({ type: 'close' });
  expect(model().discard).toBe('close');
  dispatch({ type: 'keep-editing' });
  dispatch({ type: 'draft-type', value: 'multi-select' });
  expect(model().draft?.type).toBe('single-select');
  dispatch({ type: 'draft-type', value: 'text' });
  expect(model().draft?.type).toBe('single-select');
  dispatch({ type: 'save-definition' });
  expect(model().definitions.find(({ id }) => id === stage.id)?.options?.[0]).toEqual({
    id: planned,
    label: 'To read',
  });
  expect(readNative()).toBe('To read');

  dispatch({ type: 'edit-definition', id: stage.id });
  dispatch({ type: 'draft-remove-option', id: planned });
  dispatch({ type: 'save-definition' });
  expect(model().definitions.find(({ id }) => id === stage.id)?.options).toEqual([
    { id: done, label: 'Done' },
  ]);
  expect(readNative()).toBe(`Contains unavailable options: [${planned}]`);
  expect(item.setField).not.toHaveBeenCalled();
  expect(randomString).toHaveBeenCalledTimes(3);

  dispatch({ type: 'edit-definition', id: 'score' });
  dispatch({ type: 'draft-type', value: 'single-select' });
  expect(model().draft?.type).toBe('number');
  dispatch({ type: 'draft-type', value: 'text' });
  dispatch({ type: 'save-definition' });
  expect(model().definitions.find(({ id }) => id === 'score')?.type).toBe('text');
});

const STAGE_OPTIONS = [
  { id: 'queued', label: 'Queued' },
  { id: 'read', label: 'Read' },
];

it('does not overwrite a newer option list with a stale definition draft', async () => {
  const stage: ItemAttributeDefinition = {
    id: 'stage',
    key: 'Neo Stage',
    label: 'Stage',
    type: 'multi-select',
    options: STAGE_OPTIONS,
  };
  const h = setup([stage]);
  await h.start();
  h.port.open(h.host);
  const view = views[0]!;
  const { dispatch } = view.options;
  dispatch({ type: 'edit-definition', id: stage.id });
  dispatch({ type: 'draft-rename-option', id: 'queued', value: 'Local rename' });

  const remote = { ...stage, options: [{ id: 'read', label: 'Already read' }] };
  h.set('itemAttributes.fields.v1', JSON.stringify({ version: 2, fields: [remote] }));
  h.set.mockClear();
  dispatch({ type: 'save-definition' });

  const model = view.update.mock.lastCall![0];
  expect(model.definitions).toEqual([remote]);
  expect(model.draft?.options[0]?.label).toBe('Local rename');
  expect(model.status).toMatch(/revision changed/);
  expect(h.set).not.toHaveBeenCalled();
});

function writableItems(initial: readonly string[]): Zotero.Item[] {
  const items = initial.map((value, index) => {
    let extra = value;
    return {
      id: index + 1,
      libraryID: 1,
      isRegularItem: () => true,
      isEditable: () => true,
      hasChanged: () => false,
      getField: (field: string) => (field === 'extra' ? extra : `Item ${index + 1}`),
      setField: vi.fn((_field: string, next: string) => {
        extra = next;
        return true;
      }),
      save: vi.fn(async () => true),
    } as unknown as Zotero.Item;
  });
  const library = { editable: true, libraryType: 'user' };
  vi.stubGlobal('Zotero', {
    ...Zotero,
    Items: { get: (id: number) => items[id - 1] },
    Libraries: { get: () => library },
  });
  return items;
}

it('can replace an unavailable single selection and writes only after saving', async () => {
  const [item] = writableItems(['Neo Stage: ["removed"]']);
  const h = setup([
    {
      id: 'stage',
      key: 'Neo Stage',
      label: 'Stage',
      type: 'single-select',
      options: STAGE_OPTIONS,
    },
  ]);
  await h.start();
  h.port.open({ ...h.host, mode: 'values', items: [item!] });
  const view = views[0]!;
  const { dispatch } = view.options;
  const model = () => view.update.mock.lastCall![0];

  dispatch({ type: 'set-value' });
  expect(model().error).toBe(true);
  dispatch({ type: 'select-choice', id: 'queued' });
  expect(item!.setField).not.toHaveBeenCalled();
  dispatch({ type: 'set-value' });
  await vi.waitFor(() => expect(model().busy).toBe(false));
  expect(model().error).toBe(false);
  expect(item!.getField('extra')).toBe('Neo Stage: ["queued"]');
});

it('retains unavailable multi selections while toggling and confirms only an explicit batch repair', async () => {
  const initial = 'Neo Stage: ["old","read"]';
  const items = writableItems([initial, initial, initial]);
  const h = setup([
    {
      id: 'stage',
      key: 'Neo Stage',
      label: 'Stage',
      type: 'multi-select',
      options: STAGE_OPTIONS,
    },
  ]);
  await h.start();
  h.port.open({ ...h.host, mode: 'values', items: items.slice(0, 2) });
  const view = views[0]!;
  const { dispatch } = view.options;
  const model = () => view.update.mock.lastCall![0];

  dispatch({ type: 'toggle-choice', id: 'queued' });
  expect(model().input).toBe('["old","queued","read"]');
  dispatch({ type: 'set-value' });
  expect(model().error).toBe(true);
  expect(model().review).toBeNull();

  dispatch({ type: 'repair-choices' });
  dispatch({ type: 'set-value' });
  expect(model().review).toEqual({ value: '["queued","read"]' });
  expect(boundary.transaction).not.toHaveBeenCalled();
  expect(items.map((item) => item.getField('extra'))).toEqual([initial, initial, initial]);

  dispatch({ type: 'confirm-values' });
  await vi.waitFor(() => expect(model().busy).toBe(false));
  const replacement = 'Neo Stage: ["queued","read"]';
  expect(items.map((item) => item.getField('extra'))).toEqual([replacement, replacement, initial]);
  expect(boundary.transaction).toHaveBeenCalledOnce();
});
