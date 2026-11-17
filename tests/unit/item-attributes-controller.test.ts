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
import type { NativeItemAttribute } from '../../src/toolkit/main/item-attributes-types';
import type * as MainToolkit from '../../src/toolkit/main';
import type { NativeReactViewOptions } from '../../src/ui/react/types';

const boundary = vi.hoisted(() => ({ create: vi.fn(), classify: vi.fn(), mount: vi.fn() }));
vi.mock('../../src/toolkit/main', async (importOriginal) => ({
  ...(await importOriginal<typeof MainToolkit>()),
  createItemAttributeNativeHost: boundary.create,
  assertCustomExtraKey: boundary.classify,
}));
vi.mock('../../src/platform/native-ui', () => ({ mountNativeReactView: boundary.mount }));
import { ItemAttributesController } from '../../src/item-attributes/controller';

type ViewOptions = NativeReactViewOptions<ItemAttributesModel, ItemAttributesCommand>;
const views: {
  options: ViewOptions;
  dispose: Mock;
  update: Mock;
}[] = [];
const controllers: ItemAttributesController[] = [];

beforeEach(() => {
  boundary.create.mockReset();
  boundary.classify.mockReset();
  boundary.mount.mockReset();
  views.length = 0;
  vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
  vi.stubGlobal('Zotero', { initializationPromise: Promise.resolve() });
  boundary.mount.mockImplementation((options: ViewOptions) => {
    const view = { options, dispose: vi.fn(), update: vi.fn() };
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

function setup() {
  const observers = new Set<() => void>();
  const unobserve = vi.fn();
  const set = vi.fn();
  const preferences = {
    has: () => true,
    get: () =>
      JSON.stringify({
        version: 1,
        fields: [{ id: 'score', key: 'Research Score', label: 'Score', type: 'number' }],
      }),
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
