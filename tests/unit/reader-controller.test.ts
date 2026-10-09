import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CommandPaletteContext,
  ReaderControllerDependencies,
  ReaderMainOperations,
} from '../../src/core/contracts';
import { NavigationCoordinator } from '../../src/navigation/coordinator';
import { NavigationHistoryState } from '../../src/navigation/history';
import type { NavigationIntent, NavigationPort } from '../../src/navigation/types';
import {
  ReaderController,
  ReaderSession,
  createReaderController,
} from '../../src/reader/controller';
import { ReaderJumpHostAdapter } from '../../src/reader/jump-host';
import { DEFAULT_BINDINGS, resolveBindings, type BindingMap } from '../../src/input/bindings';
import type {
  InternalReaderRuntime,
  PdfWindow,
  ReaderEventRuntime,
  ReaderLinkOverlay,
  ReaderLinkPosition,
  ReaderPdfHistoryLocationRuntime,
  ReaderRuntime,
  ReaderViewRuntime,
} from '../../src/reader/types';
import { KEY_GUIDE_CONFIG } from '../../src/input/key-guide-config';
import { ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY } from '../../src/core/preferences';

const originalZotero = Reflect.get(globalThis, 'Zotero');
const originalServices = Reflect.get(globalThis, 'Services');
const originalComponents = Reflect.get(globalThis, 'Components');
const noopReaderMainOperations: ReaderMainOperations = {
  openAllItemsPicker: () => {},
  openCollectionItemsPicker: () => {},
  openNotesPicker: () => {},
  openPluginManager: () => {},
  openSettingsFromReader: () => {},
  navigateBackFromReader: () => {},
  navigateForwardFromReader: () => {},
  navigationForReader: () => null,
  openTabPicker: () => {},
  closeReaderTab: () => {},
  cycleReaderTab: () => {},
  showReaderItemInLibrary: () => {},
  openReaderTagPicker: () => {},
  openReaderCollectionPicker: () => {},
  openCommandPalette: () => {},
  captureReaderSelectionToNote: async () => false,
};

beforeEach(() => {
  Reflect.set(globalThis, 'Components', { utils: { isDeadWrapper: () => false } });
});

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
  vi.useRealTimers();
  if (originalServices === undefined) Reflect.deleteProperty(globalThis, 'Services');
  else Reflect.set(globalThis, 'Services', originalServices);
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

function readerPreferences(initial: Readonly<Record<string, boolean | number | string>> = {}) {
  const values = new Map<string, boolean | number | string>(Object.entries(initial));
  return {
    has: (key: string) => values.has(key),
    get: <T extends boolean | number | string>(key: string, fallback: T): T =>
      (values.get(key) ?? fallback) as T,
    set: (key: string, value: boolean | number | string) => {
      values.set(key, value);
    },
    clear: (key: string) => {
      values.delete(key);
    },
  };
}

function createReaderRegistryHarness() {
  const service = {
    _readers: [] as ReaderRuntime[],
    _registeredListeners: [] as {
      type: string;
      handler: (event: ReaderEventRuntime) => void;
      pluginID: string;
    }[],
    registerEventListener(
      type: string,
      handler: (event: ReaderEventRuntime) => void,
      pluginID: string,
    ) {
      this._registeredListeners.push({ type, handler, pluginID });
    },
    unregisterEventListener(type: string, handler: (event: ReaderEventRuntime) => void) {
      this._registeredListeners = this._registeredListeners.filter(
        (entry) => !(entry.type === type && entry.handler === handler),
      );
    },
    dispatch(type: string, event: ReaderEventRuntime) {
      for (const entry of this._registeredListeners.filter((entry) => entry.type === type))
        entry.handler(event);
    },
  };
  Reflect.set(globalThis, 'Zotero', { Reader: service });
  const dependencies = {
    preferences: readerPreferences(),
    logger: { debug: () => {}, diagnostic: () => {} },
    main: noopReaderMainOperations,
  } as ReaderControllerDependencies;
  return { service, dependencies };
}

describe('Reader failure diagnostics', () => {
  it('retains inventory failure identity without reading the failed host again', () => {
    const { service, dependencies } = createReaderRegistryHarness();
    const original = new TypeError('native inventory failure');
    const inventory = vi.fn(() => {
      throw original;
    });
    Object.defineProperty(service, '_readers', { configurable: true, get: inventory });
    const controller = new ReaderController(dependencies);
    try {
      controller.rescan({} as _ZoteroTypes.MainWindow);
      throw new Error('Expected inventory failure');
    } catch (error) {
      expect(error).toMatchObject({
        message: expect.stringContaining('stage=inventory'),
        cause: original,
      });
      expect(inventory).toHaveBeenCalledOnce();
    } finally {
      controller.shutdown();
    }
  });

  it('retains injection failure identity and the known Reader instance', () => {
    const { service, dependencies } = createReaderRegistryHarness();
    const original = new TypeError('native iframe failure');
    const reader = { _instanceID: 'fault-reader', itemID: 42 } as ReaderRuntime;
    const internalReader = vi.fn(() => {
      throw original;
    });
    Object.defineProperty(reader, '_internalReader', { get: internalReader });
    service._readers = [reader];
    const controller = new ReaderController(dependencies);
    controller.start('zotero-neo@zotero-neo');
    try {
      controller.rescan({ Zotero_Tabs: { _tabs: [] } } as unknown as _ZoteroTypes.MainWindow);
      throw new Error('Expected injection failure');
    } catch (error) {
      expect(error).toMatchObject({
        message: expect.stringContaining('stage=ensure'),
        cause: { message: expect.stringContaining('instanceID=fault-reader'), cause: original },
      });
      expect(internalReader).toHaveBeenCalledOnce();
    } finally {
      controller.shutdown();
    }
  });

  it('persists a delayed injection failure before preserving its propagation', () => {
    vi.useFakeTimers();
    const { service, dependencies } = createReaderRegistryHarness();
    const diagnostic = vi.fn();
    const original = new TypeError('delayed native iframe failure');
    const reader = { _instanceID: 'delayed-reader', itemID: 42 } as ReaderRuntime;
    let failed = false;
    Object.defineProperty(reader, '_internalReader', {
      get: () => {
        if (failed) throw original;
        return undefined;
      },
    });
    service._readers = [reader];
    const controller = new ReaderController({
      ...dependencies,
      logger: { debug: () => {}, diagnostic },
    });
    controller.start('zotero-neo@zotero-neo');
    try {
      controller.rescan({ Zotero_Tabs: { _tabs: [] } } as unknown as _ZoteroTypes.MainWindow);
      failed = true;
      try {
        vi.advanceTimersByTime(100);
        throw new Error('Expected delayed injection failure');
      } catch (error) {
        expect(error).toMatchObject({
          message: expect.stringContaining('instanceID=delayed-reader attempt=1'),
          cause: original,
        });
      }
      const report = diagnostic.mock.calls.map(([message]) => message).join('\n');
      expect(report).toContain(original.stack);
      expect(report).toContain('instanceID=delayed-reader attempt=1');
    } finally {
      controller.shutdown();
    }
  });

  it('retains disposal failure identity and the cached Reader instance', () => {
    const closed = createHistorySession();
    const { service, dependencies } = createReaderRegistryHarness();
    Reflect.set(closed.reader, '_instanceID', 'retired-reader');
    service._readers = [closed.reader];
    const controller = new ReaderController(dependencies);
    controller.start('zotero-neo@zotero-neo');
    controller.rescan(closed.ownerWindow);
    service._readers = [];
    const original = new TypeError('native disposal failure');
    const dispose = vi.spyOn(ReaderSession.prototype, 'dispose').mockImplementationOnce(() => {
      throw original;
    });
    try {
      controller.rescan(closed.ownerWindow);
      throw new Error('Expected disposal failure');
    } catch (error) {
      expect(error).toMatchObject({
        message: expect.stringContaining('stage=reconcile'),
        cause: { message: expect.stringContaining('instanceID=retired-reader'), cause: original },
      });
    } finally {
      dispose.mockRestore();
      controller.shutdown();
    }
  });
});

describe('Reader event lifecycle', () => {
  it.each(['restart', 'replacement'] as const)(
    'retires native selection callbacks across %s without changing the current input',
    (operation) => {
      const { service, dependencies } = createReaderRegistryHarness();
      const retired = new ReaderController(dependencies);
      retired.start('zotero-neo@zotero-neo');
      const queued = service._registeredListeners.find(
        (entry) => entry.type === 'renderTextSelectionPopup',
      )!.handler;
      const oldParams = { annotation: { text: 'old selection' }, onAddAnnotation: () => {} };
      service.dispatch('renderTextSelectionPopup', { params: oldParams });
      expect(retired.selection()).toBe(oldParams);
      retired.shutdown();
      expect(retired.selection()).toBeNull();

      const current = operation === 'restart' ? retired : new ReaderController(dependencies);
      try {
        current.start('zotero-neo@zotero-neo');
        const newParams = { annotation: { text: 'current selection' }, onAddAnnotation: () => {} };
        service.dispatch('renderTextSelectionPopup', { params: newParams });
        expect(current.selection()).toBe(newParams);
        if (operation === 'replacement') expect(retired.selection()).toBeNull();

        queued({ params: oldParams });
        expect(current.selection()).toBe(newParams);
        if (operation === 'replacement') expect(retired.selection()).toBeNull();
      } finally {
        current.shutdown();
      }
    },
  );

  it.each(['indicator', 'secondary view'] as const)(
    'restores live Reader native keys after a dead %s wrapper',
    (deadOwner) => {
      const closed = createHistorySession();
      const live = createHistorySession();
      const secondary = deadOwner === 'secondary view' ? createHistorySession() : null;
      if (secondary)
        Reflect.set(closed.reader._internalReader!, '_secondaryView', {
          _iframeWindow: secondary.pdfWindow,
        });
      const { service, dependencies } = createReaderRegistryHarness();
      Reflect.set(closed.reader, '_instanceID', 'closed-reader');
      Reflect.set(live.reader, '_instanceID', 'live-reader');
      const nativeKey = vi.fn();
      const view = live.reader._internalReader!._primaryView!;
      Reflect.set(view, '_onKeyDown', nativeKey);
      let deadTarget: object | undefined;
      Reflect.set(globalThis, 'Components', {
        utils: {
          cloneInto: <T>(value: T) => value,
          unwaiveXrays: <T>(value: T) => value,
          waiveXrays: <T>(value: T) => value,
          isDeadWrapper: (value: object) => value === deadTarget,
        },
      });
      service._readers = [closed.reader, live.reader];
      const controller = createReaderController(dependencies);
      controller.start('zotero-neo@zotero-neo');
      controller.rescan({ Zotero_Tabs: { _tabs: [] } } as unknown as _ZoteroTypes.MainWindow);
      deadTarget =
        secondary?.pdfWindow ??
        closed.bodyChildren.find((node) => node.id === 'zotero-vim-mode-indicator');
      if (!deadTarget) throw new Error('Expected native cleanup target');
      const method = secondary ? 'removeEventListener' : 'remove';
      Reflect.set(deadTarget, method, () => {
        throw new TypeError("can't access dead object");
      });
      try {
        controller.shutdown();
        const event = readerKey('j').event;
        view._onKeyDown!(event);
        expect(nativeKey).toHaveBeenCalledExactlyOnceWith(event);
        expect(live.bodyChildren.some((node) => node.id === 'zotero-vim-mode-indicator')).toBe(
          false,
        );
      } finally {
        Reflect.set(deadTarget, method, () => {});
        controller.shutdown();
      }
    },
  );

  it('disposes sessions that disappear from Zotero Reader inventory', () => {
    const addWindowListener = vi.fn();
    const removeWindowListener = vi.fn();
    const addDocumentListener = vi.fn();
    const removeDocumentListener = vi.fn();
    const originalOnKeyDown = vi.fn();
    const originalTextFocused = vi.fn(() => false);
    const pdfWindow = {
      document: {
        getElementById: () => null,
        querySelector: () => null,
        addEventListener: addDocumentListener,
        removeEventListener: removeDocumentListener,
        documentElement: { removeAttribute: vi.fn() },
      },
      addEventListener: addWindowListener,
      removeEventListener: removeWindowListener,
      setInterval: vi.fn(() => 1),
      focus: vi.fn(),
    } as unknown as PdfWindow;
    const primaryView = {
      _iframeWindow: pdfWindow,
      _onKeyDown: originalOnKeyDown,
      _textAnnotationFocused: originalTextFocused,
    } as ReaderViewRuntime;
    const reader = {
      _instanceID: 'reader-1',
      itemID: 42,
      _internalReader: { _primaryView: primaryView },
    } as unknown as ReaderRuntime;
    const readerService = {
      _readers: [reader] as ReaderRuntime[],
      registerEventListener: () => {},
      unregisterEventListener: () => {},
      getByTabID: () => null,
    };
    Reflect.set(globalThis, 'Zotero', { Reader: readerService });
    const dependencies = {
      preferences: readerPreferences(),
      logger: { debug: () => {}, diagnostic: () => {} },
      main: noopReaderMainOperations,
    } as ReaderControllerDependencies;
    const controller = createReaderController(dependencies);
    const window = { Zotero_Tabs: { _tabs: [] } } as unknown as _ZoteroTypes.MainWindow;

    controller.start('zotero-neo@zotero-neo');
    controller.rescan(window);
    expect(primaryView._onKeyDown).not.toBe(originalOnKeyDown);
    expect(primaryView._textAnnotationFocused).not.toBe(originalTextFocused);

    readerService._readers = [];
    controller.rescan(window);

    expect(primaryView._onKeyDown).toBe(originalOnKeyDown);
    expect(primaryView._textAnnotationFocused).toBe(originalTextFocused);
    expect(removeWindowListener).toHaveBeenCalled();
    expect(removeDocumentListener).toHaveBeenCalled();
    controller.shutdown();
  });

  it('releases a destroyed Reader view before Main activation and keeps the live Reader keys', () => {
    const closed = createHistorySession();
    const live = createHistorySession();
    const { service, dependencies } = createReaderRegistryHarness();
    const closedView = closed.reader._internalReader!._primaryView!;
    const liveView = live.reader._internalReader!._primaryView!;
    const nativeNavigate = vi.fn(() => Promise.resolve());
    const nativeKey = vi.fn();
    Reflect.set(closedView, 'navigate', nativeNavigate);
    Reflect.set(liveView, '_onKeyDown', nativeKey);
    Reflect.set(closed.reader, '_instanceID', 'closed-reader');
    Reflect.set(live.reader, '_instanceID', 'live-reader');
    Reflect.set(closed.reader, '_window', live.ownerWindow);
    service._readers = [closed.reader, live.reader];
    const controller = createReaderController(dependencies);
    let destroyed = false;
    Object.defineProperty(closedView, '_iframeWindow', {
      configurable: true,
      get: () => {
        if (destroyed) throw new TypeError("can't access dead object");
        return closed.pdfWindow;
      },
    });
    Reflect.set(globalThis, 'Components', {
      utils: {
        cloneInto: <T>(value: T) => value,
        unwaiveXrays: <T>(value: T) => value,
        waiveXrays: <T>(value: T) => value,
        isDeadWrapper: (value: object) =>
          destroyed && (value === closedView || value === closed.pdfWindow),
      },
    });
    try {
      controller.start('zotero-neo@zotero-neo');
      controller.rescan(live.ownerWindow);
      destroyed = true;
      service._readers = [live.reader];

      controller.rescan(live.ownerWindow);
      controller.deactivateInactive(live.ownerWindow, null);
      expect(closedView.navigate).toBe(nativeNavigate);
      expect(liveView._onKeyDown).not.toBe(nativeKey);

      controller.shutdown();
      const event = readerKey('j').event;
      liveView._onKeyDown!(event);
      expect(nativeKey).toHaveBeenCalledExactlyOnceWith(event);
    } finally {
      destroyed = false;
      controller.shutdown();
    }
  });

  it('keeps the active Reader runtime and deactivates sibling Reader runtimes', () => {
    const ownerWindow = { Zotero_Tabs: { _tabs: [] } } as unknown as _ZoteroTypes.MainWindow;
    const pdfWindow = () =>
      ({
        document: {
          getElementById: () => null,
          querySelector: () => null,
          addEventListener: () => {},
          removeEventListener: () => {},
          documentElement: { removeAttribute: () => {} },
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        setInterval: () => 1,
        focus: () => {},
      }) as unknown as PdfWindow;
    const reader = (instanceID: string, itemID: number): ReaderRuntime =>
      ({
        _instanceID: instanceID,
        itemID,
        _window: ownerWindow,
        _internalReader: { _primaryView: { _iframeWindow: pdfWindow() } },
      }) as unknown as ReaderRuntime;
    const first = reader('reader-a', 41);
    const second = reader('reader-b', 42);
    const readerService = {
      _readers: [first, second] as ReaderRuntime[],
      registerEventListener: () => {},
      unregisterEventListener: () => {},
      getByTabID: (tabID: string) => (tabID === 'reader-b-tab' ? second : null),
    };
    Reflect.set(globalThis, 'Zotero', { Reader: readerService });
    const dependencies = {
      preferences: readerPreferences(),
      logger: { debug: () => {}, diagnostic: () => {} },
      main: noopReaderMainOperations,
    } as ReaderControllerDependencies;
    const controller = createReaderController(dependencies);
    const deactivate = vi.spyOn(ReaderSession.prototype, 'deactivateInteraction');

    try {
      controller.start('zotero-neo@zotero-neo');
      controller.rescan(ownerWindow);
      controller.deactivateInactive(ownerWindow, 'reader-b-tab');

      expect(deactivate).toHaveBeenCalledOnce();
      expect((deactivate.mock.instances[0] as ReaderSession | undefined)?.reader).toBe(first);

      controller.deactivateInactive(ownerWindow, null);
      expect(deactivate).toHaveBeenCalledTimes(3);
    } finally {
      controller.shutdown();
      deactivate.mockRestore();
    }
  });
});

function createHistorySession(
  internal: InternalReaderRuntime = {},
  mainOperations: Partial<ReaderMainOperations> = {},
  bindings: BindingMap = DEFAULT_BINDINGS,
  openCommandPalette: ReaderMainOperations['openCommandPalette'] = () => {},
  preferenceValues: Readonly<Record<string, boolean | number | string>> = {},
  captureReaderSelectionToNote: ReaderMainOperations['captureReaderSelectionToNote'] = async () =>
    false,
  openReaderTagPicker: ReaderMainOperations['openReaderTagPicker'] = () => {},
  openReaderCollectionPicker: ReaderMainOperations['openReaderCollectionPicker'] = () => {},
) {
  const debug: string[] = [];
  const diagnostics: string[] = [];
  const nodes = new Map<string, { id: string }>();
  const intervalTasks: (() => void)[] = [];
  const animationFrameTasks: (() => void)[] = [];
  const bodyChildren: HTMLElement[] = [];
  const document = {
    defaultView: null as Window | null,
    head: {
      appendChild: (node: { id: string }) => nodes.set(node.id, node),
    },
    body: {
      appendChild: (node: HTMLElement) => bodyChildren.push(node),
    },
    documentElement: {
      clientWidth: 800,
      clientHeight: 600,
      appendChild: (node: { id: string }) => nodes.set(node.id, node),
    },
    getElementById: (id: string) => nodes.get(id) ?? null,
    querySelector: () => null,
    createDocumentFragment: () => {
      const childNodes: HTMLElement[] = [];
      return {
        childNodes,
        appendChild: (node: HTMLElement) => {
          childNodes.push(node);
          return node;
        },
      };
    },
    createElement: () => {
      const attributes = new Map<string, string>();
      const children: HTMLElement[] = [];
      const element = {
        id: '',
        ownerDocument: document,
        textContent: '',
        hidden: false,
        dataset: {} as Record<string, string>,
        style: {
          cssText: '',
          display: '',
          left: '',
          top: '',
          color: '',
          background: '',
          width: '',
          height: '',
          borderRadius: '',
          colorScheme: '',
          getPropertyValue: () => '',
          setProperty: () => {},
        },
        focus: vi.fn(),
        children,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        scrollIntoView: vi.fn(),
        append: (...nodes: HTMLElement[]) => children.push(...nodes),
        appendChild: (node: HTMLElement | { childNodes: HTMLElement[] }) => {
          if ('childNodes' in node)
            children.push(...(Array.from(node.childNodes) as HTMLElement[]));
          else children.push(node);
          return node;
        },
        replaceChildren: (...nodes: HTMLElement[]) => {
          children.splice(0, children.length, ...nodes);
        },
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        remove: vi.fn(() => {
          const index = bodyChildren.indexOf(element as unknown as HTMLElement);
          if (index >= 0) bodyChildren.splice(index, 1);
        }),
      };
      return element;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const pdfWindow = {
    document,
    innerWidth: 800,
    innerHeight: 600,
    focus: vi.fn(),
    getSelection: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (task: () => void) => {
      animationFrameTasks.push(task);
      return animationFrameTasks.length;
    },
    cancelAnimationFrame: vi.fn(),
    setInterval: (task: () => void) => {
      intervalTasks.push(task);
      return 1;
    },
  } as unknown as PdfWindow;
  document.defaultView = pdfWindow;
  const readerWindow = { document } as unknown as Window;
  const cloneInto = vi.fn(<T>(value: T, _targetWindow?: Window) => value);
  Reflect.set(globalThis, 'Components', {
    utils: {
      cloneInto,
      unwaiveXrays: <T>(value: T) => value,
      waiveXrays: <T>(value: T) => value,
      isDeadWrapper: () => false,
    },
  });
  Reflect.set(globalThis, 'Services', { focus: { focusedWindow: pdfWindow } });
  const confirm = vi.fn(() => true);
  const ownerWindow = { confirm } as unknown as _ZoteroTypes.MainWindow;
  const reader = {
    _iframeWindow: readerWindow,
    _window: ownerWindow,
    _internalReader: {
      ...internal,
      _primaryView: internal._primaryView ?? { _iframeWindow: pdfWindow },
    },
  } as ReaderRuntime;
  const preferences = readerPreferences(preferenceValues);
  const controller = {
    dependencies: {
      preferences,
      logger: {
        debug: (message: string) => debug.push(message),
        diagnostic: (message: string) => diagnostics.push(message),
      },
      main: {
        ...noopReaderMainOperations,
        ...mainOperations,
        openReaderTagPicker,
        openReaderCollectionPicker,
        openCommandPalette,
        captureReaderSelectionToNote,
      },
    },
  };
  const session = new ReaderSession({
    controller,
    reader,
    firstPdfWindow: pdfWindow,
    bindings: () => bindings,
    release: () => {},
    jumpHost: new ReaderJumpHostAdapter(),
  } as unknown as ConstructorParameters<typeof ReaderSession>[0]);
  const indicator = {
    style: { display: '', color: '', background: '' },
    textContent: '',
    remove: vi.fn(),
  } as unknown as HTMLElement;
  session.state.indicator = indicator;
  return {
    session,
    preferences,
    indicator,
    debug,
    diagnostics,
    pdfWindow,
    readerWindow,
    reader,
    ownerWindow,
    confirm,
    cloneInto,
    bodyChildren,
    animationFrameTasks,
    intervalTasks,
  };
}
function navigationHistoryPort() {
  const history = new NavigationHistoryState();
  const intents: NavigationIntent[] = [];
  const coordinator = new NavigationCoordinator(history, {
    capture: (operation) => operation.capture?.() ?? null,
    isCurrent: () => true,
  });
  const navigation = coordinator.port();
  const port: NavigationPort = {
    execute: (intent, operation) => {
      intents.push(intent);
      return navigation.execute(intent, operation);
    },
    observeNative: (receipt) => navigation.observeNative(receipt),
  };
  return { history, intents, port };
}

interface ReaderHistoryHarness {
  readonly reader: ReaderRuntime;
  readonly pdfWindow: PdfWindow;
  readonly ownerWindow: _ZoteroTypes.MainWindow;
}

function attachNativeReaderHistory(created: ReaderHistoryHarness) {
  const view = created.reader._internalReader?._primaryView;
  if (!view) throw new Error('Expected a primary Reader view');
  const container = {
    clientHeight: 100,
    scrollHeight: 2_000,
    scrollTop: 500,
    scrollBy: (_x: number, y: number) => {
      container.scrollTop += y;
    },
    scrollTo: (left: number | ScrollToOptions, top?: number) => {
      container.scrollTop = typeof left === 'number' ? (top ?? 0) : (left.top ?? 0);
    },
  };
  const page = { offsetTop: 0, offsetHeight: 1_000 };
  const viewer = {
    currentPageNumber: 1,
    _location: { pageNumber: 1, top: 500, left: 0 },
    container,
    update: vi.fn(() => {
      viewer._location = {
        pageNumber: viewer.currentPageNumber,
        top: container.scrollTop,
        left: 0,
      };
    }),
  };
  const nativeLocation = (pageIndex: number, top: number): ReaderPdfHistoryLocationRuntime => ({
    dest: [pageIndex, { name: 'XYZ' }, 0, top, null],
  });
  const nativeHistory: {
    _currentLocation: ReaderPdfHistoryLocationRuntime;
    save: (location: ReaderPdfHistoryLocationRuntime, transient?: boolean) => unknown;
  } = {
    _currentLocation: nativeLocation(0, 500),
    save: vi.fn((location) => {
      nativeHistory._currentLocation = location;
      return 'native-save';
    }),
  };
  Reflect.set(view, '_history', nativeHistory);
  Reflect.set(view, '_pushHistoryPoint', () => {
    const position = viewer._location;
    return nativeHistory.save(nativeLocation(position.pageNumber - 1, position.top), false);
  });
  Reflect.set(created.pdfWindow, 'PDFViewerApplication', { pdfViewer: viewer });
  Reflect.set(created.pdfWindow.document, 'querySelector', (selector: string) =>
    selector.startsWith('.page[') ? page : null,
  );
  Reflect.set(created.reader, 'itemID', 42);
  Reflect.set(created.reader, 'tabID', 'reader-test-tab');
  Reflect.set(created.ownerWindow, 'Zotero_Tabs', { selectedID: 'reader-test-tab' });
  const attachment = { id: 42, libraryID: 1, isAttachment: () => true };
  Reflect.set(globalThis, 'Zotero', {
    Items: { get: (id: number) => (id === 42 ? attachment : false) },
  });
  return { container, nativeHistory, nativeLocation, viewer, view };
}
async function settleReaderMicrotasks(): Promise<void> {
  for (let cycle = 0; cycle < 8; cycle += 1) await Promise.resolve();
}

function readerKey(
  key: string,
  options: {
    readonly ctrl?: boolean;
    readonly target?: EventTarget | null;
    readonly isComposing?: boolean;
    readonly keyCode?: number;
  } = {},
) {
  const preventDefault = vi.fn();
  const stopImmediatePropagation = vi.fn();
  return {
    event: {
      key,
      ctrlKey: options.ctrl ?? false,
      isComposing: options.isComposing ?? false,
      keyCode: options.keyCode ?? 0,
      metaKey: false,
      altKey: false,
      target: options.target ?? null,
      preventDefault,
      stopImmediatePropagation,
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent,
    preventDefault,
    stopImmediatePropagation,
    stopPropagation: vi.fn(),
  };
}

function controlKey(key: string, target: EventTarget | null = null) {
  return readerKey(key, { ctrl: true, target });
}

type SmoothMode = 'step' | 'follow' | 'trapezoid';
const smoothPreferences = (
  mode: SmoothMode,
): Readonly<Record<string, boolean | number | string>> => ({
  'scroll.mode': mode,
  'smoothScroll.followSpeed': 1200,
  'smoothScroll.initialSpeed': 900,
  'smoothScroll.maxSpeed': 2400,
  'smoothScroll.acceleration': 1000,
  'smoothScroll.deceleration': 500,
  'smoothScroll.stopOnRelease': false,
});

function smoothSession(
  mode: SmoothMode,
  internal: InternalReaderRuntime = {},
  bindings: BindingMap = DEFAULT_BINDINGS,
  mainOperations: Partial<ReaderMainOperations> = {},
) {
  const created = createHistorySession(
    internal,
    mainOperations,
    bindings,
    () => {},
    smoothPreferences(mode),
  );
  const container = { scrollBy: vi.fn() } as unknown as HTMLElement;
  Reflect.set(created.pdfWindow, 'PDFViewerApplication', { pdfViewer: { container } });
  return { ...created, container };
}

type SmoothTestSession = {
  readonly session: ReaderSession;
  readonly pdfWindow: PdfWindow;
  readonly animationFrameTasks: (() => void)[];
};

function releaseSmoothHold(created: SmoothTestSession, key: string) {
  const event = readerKey(key);
  const session = created.session as unknown as {
    handleKeyUp(event: KeyboardEvent): void;
  };
  session.handleKeyUp.call(created.session, event.event);
  return event;
}

function runSmoothFrame(created: SmoothTestSession, timestamp: number): void {
  const frame = created.animationFrameTasks.shift() as ((timestamp: number) => void) | undefined;
  frame?.(timestamp);
}

type ActionExecutorSession = {
  executeAction: (action: string, count: number, window: PdfWindow) => void;
};

function executeReaderAction(session: ReaderSession, action: string, pdfWindow: PdfWindow): void {
  const executable = session as unknown as ActionExecutorSession;
  executable.executeAction(action, 1, pdfWindow);
}
type ViewReleaseSession = {
  releaseViewTheme: (pdfWindow: PdfWindow) => void;
};

function releaseReaderView(session: ReaderSession, pdfWindow: PdfWindow): void {
  const releaser = session as unknown as ViewReleaseSession;
  releaser.releaseViewTheme(pdfWindow);
}
function linkPosition(rect: readonly number[], pageIndex = 0): ReaderLinkPosition {
  return { pageIndex, rects: [rect] };
}

function internalLink(
  rect: readonly number[],
  destinationPage = 1,
): Extract<ReaderLinkOverlay, { readonly type: 'internal-link' }> {
  return {
    type: 'internal-link',
    position: linkPosition(rect),
    destinationPosition: linkPosition([0, 0, 0, 0], destinationPage),
  };
}

function citationLink(
  rect: readonly number[],
  destinationPage = 1,
  destinationRect: readonly number[] = [0, 0, 0, 0],
): Extract<ReaderLinkOverlay, { readonly type: 'citation' }> {
  return {
    type: 'citation',
    position: linkPosition(rect),
    references: [{ position: linkPosition(destinationRect, destinationPage) }],
  };
}
function externalLink(
  rect: readonly number[],
  url: string,
): Extract<ReaderLinkOverlay, { readonly type: 'external-link' }> {
  return {
    type: 'external-link',
    position: linkPosition(rect),
    url,
  };
}

function configureLinkView(
  created: ReturnType<typeof createHistorySession>,
  overlays: readonly unknown[],
) {
  const view = created.reader._internalReader?._primaryView;
  if (!view) throw new Error('Expected a primary reader view');
  const navigate = vi.fn();
  const openLink = vi.fn();
  Reflect.set(view, '_pdfPages', { 0: { overlays } });
  Reflect.set(view, 'getClientRectForPopup', (position: ReaderLinkPosition) => position.rects[0]);
  Reflect.set(view, 'navigate', navigate);
  Reflect.set(view, '_onOpenLink', openLink);
  return { view, navigate, openLink };
}

function linkHintElements(created: ReturnType<typeof createHistorySession>): HTMLElement[] {
  return created.bodyChildren.filter((node) => node.dataset.zoteroNeoLinkHint === '1');
}

function destinationCueElement(
  created: ReturnType<typeof createHistorySession>,
): HTMLElement | null {
  return created.bodyChildren.find((node) => node.dataset.zoteroNeoDestinationCue === '1') ?? null;
}

describe('Reader global history actions', () => {
  it('routes counted Ctrl-o and Ctrl-i to Main with the Reader owner window', () => {
    const navigateBackFromReader = vi.fn();
    const navigateForwardFromReader = vi.fn();
    const created = createHistorySession({}, { navigateBackFromReader, navigateForwardFromReader });
    created.session.focusAndHandle(readerKey('3').event);
    const back = controlKey('o');
    created.session.focusAndHandle(back.event);
    created.session.focusAndHandle(readerKey('2').event);
    const forward = controlKey('i');
    created.session.focusAndHandle(forward.event);

    expect(navigateBackFromReader).toHaveBeenCalledWith(created.reader._window, 3);
    expect(navigateForwardFromReader).toHaveBeenCalledWith(created.reader._window, 2);
    expect(back.preventDefault).toHaveBeenCalledOnce();
    expect(forward.preventDefault).toHaveBeenCalledOnce();
    created.session.dispose();
  });

  it('leaves global history chords untouched during native passthrough and in editable controls', () => {
    const navigateBackFromReader = vi.fn();
    const created = createHistorySession(
      {},
      { navigateBackFromReader },
      DEFAULT_BINDINGS,
      () => {},
      { [ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY]: false },
    );
    created.session.focusAndHandle(readerKey('i').event);
    const insert = controlKey('o');
    created.session.focusAndHandle(insert.event);

    const input = { tagName: 'INPUT', localName: 'input' } as unknown as EventTarget;
    created.session.focusAndHandle(readerKey('Escape').event);
    const editable = controlKey('o', input);
    created.session.focusAndHandle(editable.event);

    expect(navigateBackFromReader).not.toHaveBeenCalled();
    expect(insert.preventDefault).not.toHaveBeenCalled();
    expect(editable.preventDefault).not.toHaveBeenCalled();
    created.session.dispose();
  });

  it('suppresses Zotero key forwarding only for bound Reader commands', () => {
    const originalKeyDown = vi.fn();
    const created = createHistorySession();
    const view = created.reader._internalReader?._primaryView;
    if (!view) throw new Error('Expected a primary reader view');
    view._onKeyDown = originalKeyDown;

    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();

    view._onKeyDown?.(controlKey('o').event);
    view._onKeyDown?.(readerKey('f').event);
    view._onKeyDown?.(readerKey('3').event);

    created.session.focusAndHandle(readerKey(' ').event);
    view._onKeyDown?.(readerKey('t').event);
    view._onKeyDown?.(controlKey('x').event);
    view._onKeyDown?.(controlKey('h').event);
    expect(originalKeyDown).toHaveBeenCalledTimes(2);
    expect(originalKeyDown).toHaveBeenNthCalledWith(1, expect.objectContaining({ key: 'x' }));
    expect(originalKeyDown).toHaveBeenNthCalledWith(2, expect.objectContaining({ key: 'h' }));
    created.session.dispose();
  });

  it('forwards composing keys rather than claiming bound Reader shortcuts', () => {
    const originalKeyDown = vi.fn();
    const created = createHistorySession({}, {}, DEFAULT_BINDINGS, () => {}, {
      [ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY]: false,
    });
    const view = created.reader._internalReader?._primaryView;
    if (!view) throw new Error('Expected Reader PDF view');
    view._onKeyDown = originalKeyDown;
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();

    view._onKeyDown?.(readerKey('j', { isComposing: true }).event);
    created.session.focusAndHandle(readerKey('i').event);
    view._onKeyDown?.(readerKey('Escape', { keyCode: 229 }).event);
    expect(originalKeyDown).toHaveBeenCalledTimes(2);
    created.session.dispose();
  });
});
describe('reader keymap forwarding', () => {
  it('consumes new tab and pan chords while forwarding retired J/K keys', () => {
    const originalKeyDown = vi.fn();
    const cycleReaderTab = vi.fn();
    const created = createHistorySession({}, { cycleReaderTab });
    const container = { scrollBy: vi.fn() } as unknown as HTMLElement;
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', { pdfViewer: { container } });
    const view = created.reader._internalReader?._primaryView;
    if (!view) throw new Error('Expected a primary reader view');
    view._onKeyDown = originalKeyDown;
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();

    const press = (key: string) => {
      const event = readerKey(key);
      view._onKeyDown?.(event.event);
      created.session.focusAndHandle(event.event);
      return event;
    };
    const previous = press('H');
    const next = press('L');
    const oldPrevious = press('J');
    const oldNext = press('K');
    press('z');
    press('h');

    expect(cycleReaderTab).toHaveBeenNthCalledWith(1, created.reader._window, -1);
    expect(cycleReaderTab).toHaveBeenNthCalledWith(2, created.reader._window, 1);
    expect(previous.preventDefault).toHaveBeenCalledOnce();
    expect(next.preventDefault).toHaveBeenCalledOnce();
    expect(originalKeyDown).toHaveBeenCalledTimes(2);
    expect(container.scrollBy).toHaveBeenCalledWith(-2000 / 120, 0);
    expect(originalKeyDown).toHaveBeenNthCalledWith(1, expect.objectContaining({ key: 'J' }));
    expect(originalKeyDown).toHaveBeenNthCalledWith(2, expect.objectContaining({ key: 'K' }));
    expect(created.session.input.keyBuffer).toBe('');
    created.session.dispose();
  });
});
describe('Reader Selection Actions capture', () => {
  it('passes a Visual selection snapshot to the Main note-capture owner', async () => {
    vi.stubGlobal('Zotero', {});
    const capture = vi.fn<ReaderMainOperations['captureReaderSelectionToNote']>(async () => true);
    const created = createHistorySession({}, {}, DEFAULT_BINDINGS, () => {}, {}, capture);
    Reflect.set(created.reader, 'itemID', 42);
    Reflect.set(created.pdfWindow, 'getSelection', () => ({
      isCollapsed: false,
      rangeCount: 0,
      toString: () => 'snapshot text',
      removeAllRanges: vi.fn(),
    }));
    created.session.acceptSelectionParams({ annotation: {} });

    created.session.focusAndHandle(readerKey('a').event);
    created.session.focusAndHandle(readerKey('1').event);
    await Promise.resolve();
    await Promise.resolve();

    expect(capture).toHaveBeenCalledWith(
      {
        text: 'snapshot text',
        itemID: 42,
        pageLabel: null,
        position: null,
      },
      created.reader._window,
    );
    expect(
      created.bodyChildren.some((node) => node.dataset.zoteroNeoSelectionActions === '1'),
    ).toBe(false);
    expect(created.indicator.textContent).toBe('✓ captured to note');
    created.session.dispose();
  });

  it('claims popup input only in its captured view when Zotero forwards split keys', () => {
    vi.stubGlobal('Zotero', {});
    const created = createHistorySession();
    const primary = created.reader._internalReader?._primaryView;
    if (!primary) throw new Error('Expected primary Reader PDF view');
    const primaryHost = vi.fn();
    primary._onKeyDown = primaryHost;
    const secondaryHost = vi.fn();
    const secondaryWindow = {
      document: {
        getElementById: () => null,
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      focus: vi.fn(),
      getSelection: () => null,
    } as unknown as PdfWindow;
    const secondary = { _iframeWindow: secondaryWindow, _onKeyDown: secondaryHost };
    Reflect.set(created.reader._internalReader ?? {}, '_secondaryView', secondary);
    Reflect.set(created.reader, '_iframeWindow', undefined);
    Reflect.set(created.pdfWindow, 'getSelection', () => ({
      isCollapsed: false,
      rangeCount: 0,
      toString: () => 'captured selection',
      removeAllRanges: vi.fn(),
    }));
    created.session.start();
    created.session.acceptSelectionParams({ annotation: {} });
    created.session.focusAndHandle(readerKey('a').event);
    expect(
      created.bodyChildren.some((node) => node.dataset.zoteroNeoSelectionActions === '1'),
    ).toBe(true);
    const ownKey = readerKey('x');
    primary._onKeyDown?.(ownKey.event);
    expect(primaryHost).not.toHaveBeenCalled();
    const otherKey = readerKey('x');
    secondary._onKeyDown(otherKey.event);
    expect(secondaryHost).toHaveBeenCalledWith(otherKey.event);
    expect(
      created.bodyChildren.some((node) => node.dataset.zoteroNeoSelectionActions === '1'),
    ).toBe(true);
    created.session.dispose();
  });
});

function createFlashSession() {
  const created = createHistorySession();
  const text = {
    nodeType: 3,
    data: 'target text',
    length: 11,
    isConnected: true,
  } as unknown as Text;
  const span = {
    firstChild: text,
    getBoundingClientRect: () => ({
      left: 20,
      right: 120,
      top: 20,
      bottom: 36,
      width: 100,
      height: 16,
    }),
  };
  Reflect.set(created.pdfWindow.document, 'querySelectorAll', (selector: string) =>
    selector === '.textLayer span' ? [span] : [],
  );
  return created;
}

describe('Reader Flash input ownership', () => {
  it('keeps Flash open when native focus moves from the PDF body into its query input', () => {
    const created = createFlashSession();
    const blur: { listener: EventListener | null } = { listener: null };
    Reflect.set(created.pdfWindow, 'addEventListener', (type: string, listener: EventListener) => {
      if (type === 'blur') blur.listener = listener;
    });
    const createElement = created.pdfWindow.document.createElement.bind(created.pdfWindow.document);
    Reflect.set(created.pdfWindow.document, 'createElement', (tag: string) => {
      const element = createElement(tag);
      if (tag === 'input')
        Reflect.set(element, 'focus', () => {
          blur.listener?.({
            target: created.pdfWindow.document.body,
            relatedTarget: element,
          } as unknown as FocusEvent);
        });
      return element;
    });
    try {
      created.session.start();
      created.session.focusAndHandle(readerKey('v').event);
      expect(
        created.bodyChildren.some((element) => element.dataset.zoteroNeoFlashInput === '1'),
      ).toBe(true);
      blur.listener?.({ target: created.pdfWindow, relatedTarget: null } as unknown as FocusEvent);
      expect(
        created.bodyChildren.some((element) => element.dataset.zoteroNeoFlashInput === '1'),
      ).toBe(false);
    } finally {
      created.session.dispose();
    }
  });

  it('claims Flash host input only in the pane that owns its query', () => {
    const created = createFlashSession();
    const primary = created.reader._internalReader!._primaryView!;
    const primaryHost = vi.fn();
    const secondaryHost = vi.fn();
    primary._onKeyDown = primaryHost;
    const secondaryWindow = {
      document: {
        getElementById: () => null,
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as PdfWindow;
    const secondary = { _iframeWindow: secondaryWindow, _onKeyDown: secondaryHost };
    Reflect.set(created.reader._internalReader!, '_secondaryView', secondary);
    try {
      created.session.start();
      created.session.focusAndHandle(readerKey('v').event);
      const own = readerKey('x').event;
      primary._onKeyDown?.(own);
      expect(primaryHost).not.toHaveBeenCalled();
      const other = readerKey('x').event;
      secondary._onKeyDown(other);
      expect(secondaryHost).toHaveBeenCalledExactlyOnceWith(other);
    } finally {
      created.session.dispose();
    }
  });
});

describe('reader zoom shortcuts', () => {
  it('dispatches zoom commands and repeats count prefixes', () => {
    const zoomIn = vi.fn();
    const zoomOut = vi.fn();
    const created = createHistorySession({ zoomIn, zoomOut });
    const zoomInKey = readerKey('+');
    created.session.focusAndHandle(zoomInKey.event);
    created.session.focusAndHandle(readerKey('3').event);
    const zoomOutKey = readerKey('-');
    created.session.focusAndHandle(zoomOutKey.event);

    expect(zoomIn).toHaveBeenCalledOnce();
    expect(zoomOut).toHaveBeenCalledTimes(3);
    expect(zoomInKey.preventDefault).toHaveBeenCalledOnce();
    expect(zoomOutKey.preventDefault).toHaveBeenCalledOnce();
    created.session.dispose();
  });

  it('supports Zathura zoom aliases and resets once regardless of count', () => {
    const zoomIn = vi.fn();
    const zoomOut = vi.fn();
    const zoomReset = vi.fn();
    const created = createHistorySession({ zoomIn, zoomOut, zoomReset });
    const press = (key: string): void => created.session.focusAndHandle(readerKey(key).event);

    press('3');
    press('z');
    press('I');
    press('2');
    press('z');
    press('O');
    press('4');
    press('=');
    press('3');
    press('z');
    press('0');

    expect(zoomIn).toHaveBeenCalledTimes(3);
    expect(zoomOut).toHaveBeenCalledTimes(2);
    expect(zoomReset).toHaveBeenCalledTimes(2);
    created.session.dispose();
  });

  it('fails closed when the host zoom APIs are unavailable or throw', () => {
    vi.useFakeTimers();
    const missing = createHistorySession();
    const missingKey = readerKey('+');
    expect(() => missing.session.focusAndHandle(missingKey.event)).not.toThrow();
    expect(missing.indicator.textContent).toBe('Zoom unavailable');

    const missingReset = createHistorySession();
    const missingResetKey = readerKey('=');
    expect(() => missingReset.session.focusAndHandle(missingResetKey.event)).not.toThrow();
    expect(missingReset.indicator.textContent).toBe('Zoom unavailable');

    const failed = createHistorySession({
      zoomOut: () => {
        throw new Error('reader reloaded');
      },
    });
    expect(() => failed.session.focusAndHandle(readerKey('-').event)).not.toThrow();
    expect(failed.indicator.textContent).toBe('Zoom unavailable');
    expect(failed.debug).toEqual(['reader zoom out failed: Error: reader reloaded']);

    const failedReset = createHistorySession({
      zoomReset: () => {
        throw new Error('reader reloaded');
      },
    });
    expect(() => failedReset.session.focusAndHandle(readerKey('=').event)).not.toThrow();
    expect(failedReset.indicator.textContent).toBe('Zoom unavailable');
    expect(failedReset.debug).toEqual(['reader zoom reset failed: Error: reader reloaded']);
    expect(missingKey.preventDefault).toHaveBeenCalledOnce();
    expect(missingResetKey.preventDefault).toHaveBeenCalledOnce();
    missing.session.dispose();
    missingReset.session.dispose();
    failed.session.dispose();
    failedReset.session.dispose();
    vi.clearAllTimers();
  });

  it('leaves zoom keys native during passthrough and in editable controls', () => {
    const zoomIn = vi.fn();
    const zoomReset = vi.fn();
    const created = createHistorySession({ zoomIn, zoomReset }, {}, DEFAULT_BINDINGS, () => {}, {
      [ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY]: false,
    });
    created.session.focusAndHandle(readerKey('i').event);
    const insert = readerKey('+');
    created.session.focusAndHandle(insert.event);

    const input = { tagName: 'INPUT', localName: 'input' } as unknown as EventTarget;
    created.session.focusAndHandle(readerKey('Escape').event);
    const editable = readerKey('=', { target: input });
    created.session.focusAndHandle(editable.event);

    expect(zoomIn).not.toHaveBeenCalled();
    expect(zoomReset).not.toHaveBeenCalled();
    expect(insert.preventDefault).not.toHaveBeenCalled();
    expect(editable.preventDefault).not.toHaveBeenCalled();
    created.session.dispose();
  });

  it('keeps zoom inside the Outline overlay until Escape closes it', () => {
    const zoomIn = vi.fn();
    const zoomOut = vi.fn();
    const zoomReset = vi.fn();
    const created = createHistorySession({ zoomIn, zoomOut, zoomReset });
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);

    const plusWhileOpen = readerKey('+');
    const minusWhileOpen = readerKey('-');
    const resetWhileOpen = readerKey('=');
    created.session.focusAndHandle(plusWhileOpen.event);
    created.session.focusAndHandle(minusWhileOpen.event);
    created.session.focusAndHandle(resetWhileOpen.event);

    expect(zoomIn).not.toHaveBeenCalled();
    expect(zoomOut).not.toHaveBeenCalled();
    expect(zoomReset).not.toHaveBeenCalled();
    expect(plusWhileOpen.preventDefault).toHaveBeenCalledOnce();
    expect(plusWhileOpen.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(minusWhileOpen.preventDefault).toHaveBeenCalledOnce();
    expect(minusWhileOpen.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(resetWhileOpen.preventDefault).toHaveBeenCalledOnce();
    expect(resetWhileOpen.stopImmediatePropagation).toHaveBeenCalledOnce();

    const modifier = readerKey('Control');
    created.session.focusAndHandle(modifier.event);
    expect(modifier.preventDefault).not.toHaveBeenCalled();

    const escape = readerKey('Escape');
    created.session.focusAndHandle(escape.event);
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');

    created.session.focusAndHandle(readerKey('+').event);
    created.session.focusAndHandle(readerKey('-').event);
    created.session.focusAndHandle(readerKey('=').event);
    expect(zoomIn).toHaveBeenCalledOnce();
    expect(zoomOut).toHaveBeenCalledOnce();
    expect(zoomReset).toHaveBeenCalledOnce();
    created.session.dispose();
  });

  it('consumes zoom shortcuts before Zotero reader forwarding', () => {
    const originalKeyDown = vi.fn();
    const zoomIn = vi.fn();
    const zoomOut = vi.fn();
    const zoomReset = vi.fn();
    const created = createHistorySession({ zoomIn, zoomOut, zoomReset });
    const view = created.reader._internalReader?._primaryView;
    if (!view) throw new Error('Expected a primary reader view');
    view._onKeyDown = originalKeyDown;
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();

    view._onKeyDown?.(readerKey('+').event);
    view._onKeyDown?.(readerKey('-').event);
    view._onKeyDown?.(readerKey('=').event);
    view._onKeyDown?.(readerKey(':').event);
    view._onKeyDown?.(readerKey('J').event);
    view._onKeyDown?.(readerKey('K').event);
    const advanceThroughReader = (key: string): void => {
      const press = readerKey(key);
      view._onKeyDown?.(press.event);
      created.session.focusAndHandle(press.event);
    };
    advanceThroughReader('z');
    advanceThroughReader('I');
    advanceThroughReader('z');
    advanceThroughReader('O');
    advanceThroughReader('z');
    advanceThroughReader('0');

    expect(zoomIn).toHaveBeenCalledOnce();
    expect(zoomOut).toHaveBeenCalledOnce();
    expect(zoomReset).toHaveBeenCalledOnce();
    expect(originalKeyDown).toHaveBeenCalledTimes(2);
    created.session.dispose();
  });
  it('leaves colon native when a custom resolved map removes the default binding', () => {
    const originalKeyDown = vi.fn();
    const bindings = Object.fromEntries(
      Object.entries(DEFAULT_BINDINGS).filter(([key]) => key !== 'reader-normal::'),
    ) as BindingMap;
    const created = createHistorySession({}, {}, bindings);
    const view = created.reader._internalReader?._primaryView;
    if (!view) throw new Error('Expected a primary reader view');
    view._onKeyDown = originalKeyDown;
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();

    view._onKeyDown?.(readerKey(':').event);

    expect(originalKeyDown).toHaveBeenCalledOnce();
    created.session.dispose();
  });
});

describe('Reader Main surface operations', () => {
  it('passes the Reader owner to the item picker capability', () => {
    const openAllItemsPicker = vi.fn();
    const created = createHistorySession({}, { openAllItemsPicker });

    created.session.focusAndHandle(readerKey(' ').event);
    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('f').event);

    expect(openAllItemsPicker).toHaveBeenCalledWith(created.reader._window);
    created.session.dispose();
  });

  it('routes settings by name without leaving the Reader owner window', () => {
    const openSettingsFromReader = vi.fn();
    const created = createHistorySession({}, { openSettingsFromReader });

    const leader = readerKey(' ');
    const prefix = readerKey('p');
    const settings = readerKey('s');
    created.session.focusAndHandle(leader.event);
    created.session.focusAndHandle(prefix.event);
    created.session.focusAndHandle(settings.event);

    expect(leader.preventDefault).toHaveBeenCalledOnce();
    expect(prefix.preventDefault).toHaveBeenCalledOnce();
    expect(settings.preventDefault).toHaveBeenCalledOnce();
    expect(openSettingsFromReader).toHaveBeenCalledWith(created.reader._window);
    created.session.dispose();
  });
});

describe('Reader item-tag operation', () => {
  it('opens add and remove for the Reader item without delegating a Main action', () => {
    const item = {
      id: 23,
      libraryID: 1,
      isAttachment: () => false,
      isNote: () => false,
    } as Zotero.Item;
    vi.stubGlobal('Zotero', { Items: { get: (id: number) => (id === item.id ? item : false) } });
    const openTag = vi.fn<ReaderMainOperations['openReaderTagPicker']>();
    const created = createHistorySession(
      {},
      {},
      DEFAULT_BINDINGS,
      () => {},
      {},
      async () => false,
      openTag,
    );
    Reflect.set(created.reader, 'itemID', item.id);

    for (const key of [' ', 't', 'a', ' ', 't', 'r'])
      created.session.focusAndHandle(readerKey(key).event);

    const targets = { source: 'reader', items: [item], total: 1, missing: 0 };
    expect(openTag).toHaveBeenNthCalledWith(1, created.reader._window, targets, true);
    expect(openTag).toHaveBeenNthCalledWith(2, created.reader._window, targets, false);
    expect(created.session.input.keyBuffer).toBe('');
    created.session.dispose();
  });
});

describe('Reader collection membership operation', () => {
  it('keeps the active Reader target and refuses a later tab switch', () => {
    const item = { id: 24, libraryID: 1, isTopLevelItem: () => true } as Zotero.Item;
    const openCollection = vi.fn<ReaderMainOperations['openReaderCollectionPicker']>();
    const created = createHistorySession(
      {},
      {},
      DEFAULT_BINDINGS,
      () => {},
      {},
      async () => false,
      () => {},
      openCollection,
    );
    Reflect.set(created.reader, 'itemID', item.id);
    const ownerWindow = created.reader._window;
    if (!ownerWindow) throw new Error('Expected a Reader owner window');
    const tabs = { selectedID: 'reader-tab' };
    Reflect.set(ownerWindow, 'Zotero_Tabs', tabs);
    vi.stubGlobal('Zotero', {
      Items: { get: (id: number) => (id === item.id ? item : false) },
      Reader: { getByTabID: (tabID: string) => (tabID === 'reader-tab' ? created.reader : null) },
    });

    for (const key of [' ', 'c', 'a']) created.session.focusAndHandle(readerKey(key).event);
    const current = openCollection.mock.calls[0]?.[2];
    expect(current?.().items).toEqual([item]);

    tabs.selectedID = 'other-tab';
    expect(current?.().items).toEqual([]);
    created.session.dispose();
  });
});

describe('Reader citekey output', () => {
  it('copies its item key from Space y y without delegating Main Selection', () => {
    const copied: string[] = [];
    const item = {
      id: 25,
      libraryID: 1,
      isAttachment: () => false,
      isNote: () => false,
      getField: () => 'Reader2026',
    } as unknown as Zotero.Item;
    const created = createHistorySession();
    Reflect.set(created.reader, 'itemID', item.id);
    vi.stubGlobal('Zotero', { Items: { get: (id: number) => (id === item.id ? item : false) } });
    vi.stubGlobal('Components', {
      utils: {
        cloneInto: created.cloneInto,
        unwaiveXrays: <T>(value: T) => value,
        waiveXrays: <T>(value: T) => value,
        isDeadWrapper: () => false,
      },
      classes: {
        '@mozilla.org/widget/clipboardhelper;1': {
          getService: () => ({ copyString: (text: string) => copied.push(text) }),
        },
      },
      interfaces: { nsIClipboardHelper: {} },
    });

    for (const key of [' ', 'y', 'y']) created.session.focusAndHandle(readerKey(key).event);

    expect(copied).toEqual(['Reader2026']);
    expect(created.indicator.textContent).toBe('✓ @Reader2026');
    created.session.dispose();
  });
});

describe('Reader annotation deletion safety', () => {
  function createDeletion(confirmed: boolean, fail = false, hostLocale = '') {
    const events: string[] = [];
    const eraseTx = vi.fn(async () => {
      events.push('erase');
      if (fail) throw new Error('blocked');
    });
    const annotation = { key: 'ANN-1', annotationType: 'highlight', eraseTx };
    const annotations = [annotation];
    const item = { getAnnotations: () => annotations };
    const clearHostSelection = vi.fn((keys: readonly string[]) => {
      events.push(keys.length ? 'select' : 'clear');
    });
    const created = createHistorySession({
      _state: { selectedAnnotationIDs: [annotation.key] },
      setSelectedAnnotations: clearHostSelection,
    });
    Reflect.set(created.reader, 'itemID', 41);
    created.confirm.mockReturnValue(confirmed);
    vi.stubGlobal('Zotero', {
      locale: hostLocale,
      Items: { get: (id: number) => (id === 41 ? item : false) },
    });
    return { created, annotation, annotations, eraseTx, events, clearHostSelection };
  }

  function pressDelete(session: ReaderSession): void {
    session.focusAndHandle(readerKey('d').event);
    session.focusAndHandle(readerKey('d').event);
  }

  it('keeps the annotation selected and untouched when confirmation is cancelled', () => {
    const h = createDeletion(false);

    pressDelete(h.created.session);

    expect(h.created.confirm).toHaveBeenCalledWith(
      'Delete Reader annotation · 1 permanently? This cannot be undone.',
    );
    expect(h.eraseTx).not.toHaveBeenCalled();
    expect(h.clearHostSelection).not.toHaveBeenCalled();
    expect(h.created.reader._internalReader?._state?.selectedAnnotationIDs).toEqual(['ANN-1']);
    expect(h.created.indicator.textContent).toBe(
      '→ Cancelled · Reader annotation · 1 left unchanged',
    );
    h.created.session.dispose();
  });

  it('localizes permanent deletion confirmation for a Simplified Chinese host', () => {
    const h = createDeletion(false, false, 'zh-CN');

    pressDelete(h.created.session);

    expect(h.created.confirm).toHaveBeenCalledWith('永久删除阅读器标注 · 1 项？此操作无法撤销。');
    expect(h.eraseTx).not.toHaveBeenCalled();
    expect(h.created.indicator.textContent).toBe('→ 已取消 · 阅读器标注 · 1 项未更改');
    h.created.session.dispose();
  });

  it('clears Reader selection through the cloned host seam after confirmed deletion', async () => {
    const h = createDeletion(true);
    const clonedEmptySelection: readonly string[] = [];
    h.created.cloneInto.mockImplementation(<T>(value: T): T => {
      if (Array.isArray(value) && value.length === 0) return clonedEmptySelection as T;
      return value;
    });
    h.clearHostSelection.mockImplementation((keys) => {
      h.events.push('clear');
      if (keys !== clonedEmptySelection) throw new Error('host rejected an un-cloned array');
    });

    pressDelete(h.created.session);
    await vi.waitFor(() =>
      expect(h.created.indicator.textContent).toBe('✓ Deleted Reader annotation · 1'),
    );

    expect(h.created.confirm).toHaveBeenCalledOnce();
    expect(h.events).toEqual(['erase', 'clear']);
    expect(h.created.cloneInto).toHaveBeenCalledWith([], h.created.readerWindow);
    expect(h.clearHostSelection).toHaveBeenCalledOnce();
    expect(h.clearHostSelection.mock.calls[0]?.[0]).toBe(clonedEmptySelection);
    h.created.session.dispose();
  });

  it('keeps permanent deletion successful when host selection cleanup throws', async () => {
    const h = createDeletion(true);
    h.clearHostSelection.mockImplementation(() => {
      h.events.push('clear');
      throw new Error('host selection cleanup rejected');
    });

    pressDelete(h.created.session);
    await vi.waitFor(() =>
      expect(h.created.indicator.textContent).toBe('✓ Deleted Reader annotation · 1'),
    );

    expect(h.events).toEqual(['erase', 'clear']);
    expect(h.created.debug).not.toContain(
      'delete Reader annotation failed: Error: host selection cleanup rejected',
    );
    h.created.session.dispose();
  });

  it('preserves a newer Zotero-selected annotation when deletion is pending', async () => {
    const h = createDeletion(true);
    const newerAnnotation = { ...h.annotation, key: 'ANN-2' };
    h.annotations.push(newerAnnotation);
    let finishErase!: () => void;
    h.eraseTx.mockImplementation(() => {
      h.events.push('erase');
      return new Promise<void>((resolve) => {
        finishErase = () => resolve();
      });
    });

    pressDelete(h.created.session);
    const state = h.created.reader._internalReader?._state;
    if (!state) throw new Error('Expected Reader selection state');
    Reflect.set(state, 'selectedAnnotationIDs', [newerAnnotation.key]);
    finishErase();

    await vi.waitFor(() =>
      expect(h.created.indicator.textContent).toBe('✓ Deleted Reader annotation · 1'),
    );

    expect(h.clearHostSelection).not.toHaveBeenCalled();
    expect(state.selectedAnnotationIDs).toEqual([newerAnnotation.key]);
    h.created.session.dispose();
  });

  it('preserves a newer Neo fallback annotation when deletion is pending', async () => {
    const h = createDeletion(true);
    const newerAnnotation = { ...h.annotation, key: 'ANN-2' };
    h.annotations.push(newerAnnotation);
    const state = h.created.reader._internalReader?._state;
    if (!state) throw new Error('Expected Reader selection state');
    h.created.session.focusAndHandle(readerKey('[').event);
    Reflect.set(state, 'selectedAnnotationIDs', []);
    h.created.session.focusAndHandle(readerKey(']').event);
    expect(h.clearHostSelection).toHaveBeenLastCalledWith([h.annotation.key]);

    let finishErase!: () => void;
    h.eraseTx.mockImplementation(() => {
      h.events.push('erase');
      return new Promise<void>((resolve) => {
        finishErase = () => resolve();
      });
    });
    pressDelete(h.created.session);
    h.created.session.focusAndHandle(readerKey(']').event);
    expect(h.clearHostSelection).toHaveBeenLastCalledWith([newerAnnotation.key]);
    const callsAfterSelectingNewer = h.clearHostSelection.mock.calls.length;
    finishErase();

    await vi.waitFor(() =>
      expect(h.created.indicator.textContent).toBe('✓ Deleted Reader annotation · 1'),
    );

    expect(h.clearHostSelection).toHaveBeenCalledTimes(callsAfterSelectingNewer);
    h.created.session.focusAndHandle(readerKey('[').event);
    expect(h.clearHostSelection).toHaveBeenLastCalledWith([h.annotation.key]);
    h.created.session.dispose();
  });

  it('preserves Reader selection if Zotero rejects annotation deletion', async () => {
    const h = createDeletion(true, true);
    pressDelete(h.created.session);
    await vi.waitFor(() =>
      expect(h.created.indicator.textContent).toBe('✗ Unable to delete Reader annotation · 1'),
    );

    expect(h.events).toEqual(['erase']);
    expect(h.clearHostSelection).not.toHaveBeenCalled();
    expect(h.created.debug).toContain('delete Reader annotation failed: Error: blocked');
    h.created.session.dispose();
  });
});

describe('reader Space-leader key guide', () => {
  it('updates nested prefixes, returns with Backspace, and closes on invalid input or Escape', () => {
    vi.useFakeTimers();
    const created = createHistorySession();

    created.session.focusAndHandle(readerKey(' ').event);
    expect(created.bodyChildren).toHaveLength(0);
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.defaultDelayMs);
    expect(created.bodyChildren).toHaveLength(1);
    expect(created.bodyChildren[0]?.id).toBe('zotero-neo-key-guide');

    created.session.focusAndHandle(readerKey('f').event);
    expect(created.bodyChildren).toHaveLength(1);
    const backspace = readerKey('Backspace');
    created.session.focusAndHandle(backspace.event);
    expect(created.bodyChildren).toHaveLength(1);
    expect(backspace.preventDefault).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('x').event);
    expect(created.bodyChildren).toHaveLength(0);

    created.session.focusAndHandle(readerKey(' ').event);
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.defaultDelayMs);
    const escape = readerKey('Escape');
    created.session.focusAndHandle(escape.event);
    expect(created.bodyChildren).toHaveLength(0);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    created.session.dispose();
  });
});
describe('Reader command palette', () => {
  it('opens from Reader Normal and preserves owner-specific operations', () => {
    const openAllItemsPicker = vi.fn();
    const zoomIn = vi.fn(function (this: InternalReaderRuntime) {
      expect(this._lastViewPrimary).toBe(false);
    });
    const paletteRef: { value: CommandPaletteContext | null } = { value: null };
    const created = createHistorySession(
      { _lastViewPrimary: false, zoomIn },
      { openAllItemsPicker },
      DEFAULT_BINDINGS,
      (_window, context) => {
        paletteRef.value = context;
      },
    );
    const secondary = { ...created.pdfWindow, focus: vi.fn() } as unknown as PdfWindow;
    Reflect.set(created.reader._internalReader, '_secondaryView', { _iframeWindow: secondary });

    created.session.focusAndHandle(readerKey('3').event);
    const colon = readerKey(':');
    created.session.focusAndHandle(colon.event);
    expect(colon.preventDefault).toHaveBeenCalledOnce();
    const palette = paletteRef.value;
    if (!palette) throw new Error('Expected a Reader command palette context');
    expect(palette.mode).toBe('normal');
    expect(palette.actions).toContain('switchTab');
    expect(palette.actions).toContain('navigateBack');
    expect(palette.actions).toContain('navigateForward');
    expect(palette.actions).not.toContain('mainTrashItems');
    expect(palette.actions).not.toContain('mainOpenPDF');
    expect(palette.actions).not.toContain('mainActivate');

    palette.execute('zoomIn', 123);
    expect(zoomIn).toHaveBeenCalledOnce();
    palette.execute('mainTrashItems', 123);
    palette.execute('findAllItems', 123);
    expect(openAllItemsPicker).toHaveBeenCalledWith(created.reader._window);

    Reflect.set(created.reader._internalReader, '_primaryView', undefined);
    Reflect.set(created.reader._internalReader, '_secondaryView', undefined);
    palette.execute('zoomIn', 123);
    expect(zoomIn).toHaveBeenCalledOnce();
    expect(openAllItemsPicker).toHaveBeenCalledOnce();
    Reflect.set(created.reader._internalReader, '_primaryView', {
      _iframeWindow: created.pdfWindow,
    });
    created.session.dispose();
    palette.execute('zoomIn', 123);
    palette.execute('switchTab', 123);
    expect(zoomIn).toHaveBeenCalledOnce();
    expect(openAllItemsPicker).toHaveBeenCalledOnce();
  });
});
describe('Reader leader timer guards', () => {
  it('executes only current ambiguous leader transitions', () => {
    vi.useFakeTimers();
    const openAllItemsPicker = vi.fn();
    const bindings: BindingMap = {
      'reader-normal:<Space>f': 'findAllItems',
      'reader-normal:<Space>ff': 'switchTab',
    };
    const created = createHistorySession({}, { openAllItemsPicker }, bindings);
    const press = (key: string): void => created.session.focusAndHandle(readerKey(key).event);

    press(' ');
    press('f');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(openAllItemsPicker).toHaveBeenCalledOnce();
    expect(openAllItemsPicker).toHaveBeenLastCalledWith(created.reader._window);

    press(' ');
    press('f');
    press('z');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(openAllItemsPicker).toHaveBeenCalledOnce();

    press(' ');
    press('f');
    press('Escape');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(openAllItemsPicker).toHaveBeenCalledOnce();

    press(' ');
    press('f');
    press('Backspace');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(openAllItemsPicker).toHaveBeenCalledOnce();

    press(' ');
    press('f');
    created.session.dispose();
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(openAllItemsPicker).toHaveBeenCalledOnce();
  });
  it('keeps counted leader cancellation while invalidating timed Reader commands on mode change', () => {
    vi.useFakeTimers();
    const cycleReaderTab = vi.fn();
    const bindings = resolveBindings('{"reader-normal:g":"nextTab"}');
    const created = createHistorySession({}, { cycleReaderTab }, bindings);
    Reflect.set(created.pdfWindow, 'getSelection', () => null);
    const press = (key: string): void => created.session.focusAndHandle(readerKey(key).event);
    press('3');
    press(' ');
    press('f');
    press('Backspace');
    press('Escape');
    expect(created.session.input.keyBuffer).toBe('');
    expect(created.session.input.countBuffer).toBe('3');
    press('L');
    expect(cycleReaderTab).toHaveBeenCalledWith(created.reader._window, 1);

    press('3');
    press('g');
    expect(created.session.input.keyBuffer).toBe('g');
    created.session.acceptSelectionParams({ annotation: {} });
    expect(created.session.mode).toBe('visual');
    expect(created.session.input.keyBuffer).toBe('');
    expect(created.session.input.countBuffer).toBe('');
    vi.advanceTimersByTime(800);
    expect(cycleReaderTab).toHaveBeenCalledOnce();
    const visualDigit = readerKey('3');
    created.session.focusAndHandle(visualDigit.event);
    expect(visualDigit.preventDefault).not.toHaveBeenCalled();
    expect(created.session.input.countBuffer).toBe('');
    created.session.dispose();
  });

  it('expires pending Reader mark keys without leaving input or timers behind', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    const press = (key: string): void => created.session.focusAndHandle(readerKey(key).event);
    press('m');
    expect(created.session.input.keyBuffer).toBe('m');
    vi.advanceTimersByTime(1200);
    expect(created.session.input.keyBuffer).toBe('');
    press('d');
    press('m');
    expect(created.session.input.keyBuffer).toBe('dm');
    vi.advanceTimersByTime(1200);
    expect(created.session.input.keyBuffer).toBe('');
    expect(created.session.input.countBuffer).toBe('');
    created.session.dispose();
  });

  it('preserves m, backtick, and dm mark grammar across a superseded d timeout', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    const press = (key: string): void => created.session.focusAndHandle(readerKey(key).event);
    press('m');
    press('a');
    expect(created.session.marks.a).toBeDefined();
    expect(created.session.input.keyBuffer).toBe('');
    press('`');
    expect(created.session.input.keyBuffer).toBe('`');
    press('z');
    expect(created.indicator.textContent).toBe('✗ mark z not set');
    expect(created.session.input.keyBuffer).toBe('');

    press('d');
    vi.advanceTimersByTime(600);
    press('m');
    vi.advanceTimersByTime(600);
    expect(created.session.input.keyBuffer).toBe('dm');
    press('a');
    expect(created.session.marks.a).toBeUndefined();
    expect(created.session.input.keyBuffer).toBe('');
    vi.advanceTimersByTime(1200);
    expect(created.session.input.keyBuffer).toBe('');
    created.session.dispose();
  });

  it('deactivates Reader interaction back to Normal and clears pending input', () => {
    const created = createHistorySession();
    created.session.acceptSelectionParams({ annotation: {} });
    created.session.focusAndHandle(readerKey('z').event);
    expect(created.session.input.keyBuffer).toBe('z');

    created.session.deactivateInteraction();

    expect(created.session.mode).toBe('normal');
    expect(created.session.input.keyBuffer).toBe('');
    expect(created.session.input.countBuffer).toBe('');
    created.session.dispose();
  });

  it('keeps bare passthrough native and Escape releases input back to Surface commands', async () => {
    const originalKeyDown = vi.fn();
    const created = createHistorySession({}, {}, DEFAULT_BINDINGS, () => {}, {
      [ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY]: false,
    });
    const view = created.reader._internalReader?._primaryView;
    if (!view) throw new Error('Expected Reader PDF view');
    view._onKeyDown = originalKeyDown;
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();
    created.session.state.indicator = created.indicator;
    created.session.focusAndHandle(readerKey('i').event);
    expect(created.session.mode).toBe('normal');
    expect(created.indicator.textContent).toBe('-- NATIVE --');
    const native = readerKey('f');
    created.session.focusAndHandle(native.event);
    expect(native.preventDefault).not.toHaveBeenCalled();
    view._onKeyDown?.(native.event);
    expect(originalKeyDown).toHaveBeenCalledWith(native.event);
    view._onKeyDown?.(readerKey('Escape').event);
    expect(originalKeyDown).toHaveBeenCalledOnce();
    const escape = readerKey('Escape');
    created.session.focusAndHandle(escape.event);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    const prefix = readerKey(' ');
    created.session.focusAndHandle(prefix.event);
    expect(prefix.preventDefault).toHaveBeenCalledOnce();
    created.session.focusAndHandle(readerKey('Escape').event);
    await Promise.resolve();
    await Promise.resolve();
    expect(created.session.mode).toBe('normal');
    expect(created.session.input.keyBuffer).toBe('');
    expect(created.session.input.countBuffer).toBe('');
    created.session.dispose();
  });
  it('keeps composing Escape and Backspace outside Reader prefix and native-owner commands', () => {
    const created = createHistorySession({}, {}, DEFAULT_BINDINGS, () => {}, {
      [ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY]: false,
    });
    created.session.focusAndHandle(readerKey(' ').event);
    const escape = readerKey('Escape', { isComposing: true });
    const backspace = readerKey('Backspace', { keyCode: 229 });
    created.session.focusAndHandle(escape.event);
    created.session.focusAndHandle(backspace.event);
    expect(escape.preventDefault).not.toHaveBeenCalled();
    expect(backspace.preventDefault).not.toHaveBeenCalled();
    expect(created.session.input.keyBuffer).toBe(' ');
    created.session.focusAndHandle(readerKey('Escape').event);
    expect(created.session.input.keyBuffer).toBe('');

    created.session.focusAndHandle(readerKey('i').event);
    const insertEscape = readerKey('Escape', { isComposing: true });
    created.session.focusAndHandle(insertEscape.event);
    expect(insertEscape.preventDefault).not.toHaveBeenCalled();
    const native = readerKey('j');
    created.session.focusAndHandle(native.event);
    expect(native.preventDefault).not.toHaveBeenCalled();
    created.session.dispose();
  });
});

describe('Reader native passthrough ownership', () => {
  it('stops smooth motion and excludes grammar, overlays and direct commands while native input owns keys', () => {
    const zoomIn = vi.fn();
    const navigateBackFromReader = vi.fn();
    const openCommandPalette = vi.fn();
    const created = createHistorySession(
      { zoomIn },
      { navigateBackFromReader },
      DEFAULT_BINDINGS,
      openCommandPalette,
      {
        ...smoothPreferences('follow'),
        [ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY]: false,
      },
    );
    const container = { scrollBy: vi.fn() } as unknown as HTMLElement;
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', { pdfViewer: { container } });
    created.session.focusAndHandle(readerKey('j').event);
    runSmoothFrame(created, 100);
    runSmoothFrame(created, 200);
    expect(container.scrollBy).toHaveBeenCalled();

    created.session.focusAndHandle(readerKey('i').event);
    const scrollCount = vi.mocked(container.scrollBy).mock.calls.length;
    for (const key of ['j', ' ', '3', 'f', '+']) {
      const native = readerKey(key);
      created.session.focusAndHandle(native.event);
      expect(native.preventDefault).not.toHaveBeenCalled();
      expect(native.stopImmediatePropagation).not.toHaveBeenCalled();
    }
    const history = controlKey('o');
    created.session.focusAndHandle(history.event);
    expect(history.preventDefault).not.toHaveBeenCalled();
    executeReaderAction(created.session, 'zoomIn', created.pdfWindow);
    executeReaderAction(created.session, 'openCommandPalette', created.pdfWindow);
    created.session.acceptSelectionParams({ annotation: { text: 'native selection' } });
    runSmoothFrame(created, 300);
    expect(container.scrollBy).toHaveBeenCalledTimes(scrollCount);
    expect(zoomIn).not.toHaveBeenCalled();
    expect(navigateBackFromReader).not.toHaveBeenCalled();
    expect(openCommandPalette).not.toHaveBeenCalled();
    expect(created.session.input.keyBuffer).toBe('');
    expect(created.session.input.countBuffer).toBe('');
    expect(created.bodyChildren).toEqual([]);
    created.session.dispose();
  });

  it('owns both split views but not another Reader and releases through Escape in either view', () => {
    const sibling = createHistorySession();
    const created = createHistorySession({}, {}, DEFAULT_BINDINGS, () => {}, {
      [ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY]: false,
    });
    const primary = created.reader._internalReader?._primaryView;
    if (!primary) throw new Error('Expected primary Reader PDF view');
    const primaryHost = vi.fn();
    primary._onKeyDown = primaryHost;
    const secondaryHost = vi.fn();
    const secondaryListeners = new Map<string, EventListener>();
    const secondaryWindow = {
      document: {
        getElementById: () => null,
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      addEventListener: (type: string, listener: EventListener) =>
        secondaryListeners.set(type, listener),
      removeEventListener: (type: string) => secondaryListeners.delete(type),
      focus: vi.fn(),
      getSelection: () => null,
    } as unknown as PdfWindow;
    const secondary = { _iframeWindow: secondaryWindow, _onKeyDown: secondaryHost };
    Reflect.set(created.reader._internalReader ?? {}, '_secondaryView', secondary);
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();
    created.session.focusAndHandle(readerKey('i').event);

    const primaryNative = readerKey(' ');
    primary._onKeyDown?.(primaryNative.event);
    created.session.focusAndHandle(primaryNative.event);
    expect(primaryNative.preventDefault).not.toHaveBeenCalled();
    expect(primaryHost).toHaveBeenCalledWith(primaryNative.event);
    const secondaryNative = readerKey(' ');
    secondary._onKeyDown(secondaryNative.event);
    secondaryListeners.get('keydown')?.(secondaryNative.event);
    expect(secondaryNative.preventDefault).not.toHaveBeenCalled();
    expect(secondaryHost).toHaveBeenCalledWith(secondaryNative.event);
    const siblingPrefix = readerKey(' ');
    sibling.session.focusAndHandle(siblingPrefix.event);
    expect(siblingPrefix.preventDefault).toHaveBeenCalledOnce();

    const composing = readerKey('Escape', { keyCode: 229 });
    secondary._onKeyDown(composing.event);
    secondaryListeners.get('keydown')?.(composing.event);
    expect(composing.preventDefault).not.toHaveBeenCalled();
    expect(secondaryHost).toHaveBeenCalledWith(composing.event);
    const escape = readerKey('Escape');
    secondaryListeners.get('keydown')?.(escape.event);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    const resumed = readerKey(' ');
    created.session.focusAndHandle(resumed.event);
    expect(resumed.preventDefault).toHaveBeenCalledOnce();
    created.session.dispose();
    sibling.session.dispose();
    expect(primary._onKeyDown).toBe(primaryHost);
    expect(secondary._onKeyDown).toBe(secondaryHost);
    expect(secondaryListeners.size).toBe(0);
  });

  it.each(['deactivate', 'dispose'] as const)(
    'releases native ownership on %s without registering extra listeners or leaving host patches',
    (operation) => {
      const created = createHistorySession({}, {}, DEFAULT_BINDINGS, () => {}, {
        [ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY]: false,
      });
      const addListener = vi.fn();
      const removeListener = vi.fn();
      Reflect.set(created.pdfWindow, 'addEventListener', addListener);
      Reflect.set(created.pdfWindow, 'removeEventListener', removeListener);
      const primary = created.reader._internalReader?._primaryView;
      if (!primary) throw new Error('Expected primary Reader PDF view');
      const nativeHost = vi.fn();
      primary._onKeyDown = nativeHost;
      Reflect.set(created.reader, '_iframeWindow', undefined);
      created.session.start();
      const listenerCount = addListener.mock.calls.length;
      created.session.focusAndHandle(readerKey('i').event);
      expect(addListener).toHaveBeenCalledTimes(listenerCount);

      if (operation === 'deactivate') {
        created.session.deactivateInteraction();
        const resumed = readerKey(' ');
        created.session.focusAndHandle(resumed.event);
        expect(resumed.preventDefault).toHaveBeenCalledOnce();
      }
      created.session.dispose();
      expect(removeListener).toHaveBeenCalledTimes(listenerCount);
      expect(primary._onKeyDown).toBe(nativeHost);
      const native = readerKey('j');
      primary._onKeyDown?.(native.event);
      expect(nativeHost).toHaveBeenCalledWith(native.event);
      expect(native.preventDefault).not.toHaveBeenCalled();
    },
  );
});

describe('Reader annotation comment input ownership', () => {
  function createCommentSession(
    loadDataType: () => Promise<void> = async () => {},
    preferenceValues: Readonly<Record<string, boolean | number | string>> = {},
  ) {
    const annotation = {
      id: 51,
      key: 'ANN-1',
      libraryID: 1,
      annotationComment: 'saved comment',
      annotationText: 'selected text',
      loadDataType,
      saveTx: vi.fn(async () => {}),
    };
    const attachment = { id: 41, libraryID: 1, getAnnotations: () => [annotation] };
    vi.stubGlobal('Zotero', {
      Items: {
        get: (id: number) => (id === 41 ? attachment : id === 51 ? annotation : false),
      },
      Item: vi.fn(function () {
        return annotation;
      }),
    });
    const created = createHistorySession(
      {
        _state: { selectedAnnotationIDs: [annotation.key] },
        navigate: vi.fn(),
      },
      {},
      DEFAULT_BINDINGS,
      () => {},
      preferenceValues,
    );
    Reflect.set(created.reader, 'itemID', attachment.id);
    return { ...created, annotation };
  }

  it('keeps disabled Normal Enter a no-op while disabled i admits native input', async () => {
    const created = createCommentSession(async () => {}, {
      [ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY]: false,
    });
    created.session.focusAndHandle(readerKey('Enter').event);
    await settleReaderMicrotasks();
    expect(created.bodyChildren).toEqual([]);
    expect(created.annotation.saveTx).not.toHaveBeenCalled();
    const normalPrefix = readerKey(' ');
    created.session.focusAndHandle(normalPrefix.event);
    expect(normalPrefix.preventDefault).toHaveBeenCalledOnce();
    created.session.focusAndHandle(readerKey('Escape').event);

    created.session.focusAndHandle(readerKey('i').event);
    const nativePrefix = readerKey(' ');
    created.session.focusAndHandle(nativePrefix.event);
    expect(nativePrefix.preventDefault).not.toHaveBeenCalled();
    expect(created.bodyChildren).toEqual([]);
    created.session.dispose();
  });

  it('owns pending comment input without changing Surface mode and Escape retires a late open', async () => {
    const loading = Promise.withResolvers<void>();
    const created = createCommentSession(() => loading.promise);
    created.session.focusAndHandle(readerKey('3').event);
    created.session.focusAndHandle(readerKey('i').event);

    expect(created.session.mode).toBe('normal');
    expect(created.indicator.textContent).toBe('-- COMMENT --');
    expect(created.session.input.countBuffer).toBe('');
    const native = readerKey('+');
    created.session.focusAndHandle(native.event);
    expect(native.preventDefault).not.toHaveBeenCalled();
    expect(created.session.input.keyBuffer).toBe('');
    const composingEscape = readerKey('Escape', { keyCode: 229 });
    created.session.focusAndHandle(composingEscape.event);
    expect(composingEscape.preventDefault).not.toHaveBeenCalled();
    created.session.acceptSelectionParams({ annotation: { text: 'owned selection' } });
    const blockedPrefix = readerKey(' ');
    created.session.focusAndHandle(blockedPrefix.event);
    expect(blockedPrefix.preventDefault).not.toHaveBeenCalled();

    const escape = readerKey('Escape');
    created.session.focusAndHandle(escape.event);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(created.session.mode).toBe('normal');
    loading.resolve();
    await settleReaderMicrotasks();
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-annotation-comment');
    expect(created.annotation.saveTx).not.toHaveBeenCalled();
    created.session.dispose();
  });

  it.each(['deactivate', 'release'] as const)(
    'releases pending comment ownership on %s without replacing a newer Select context',
    async (operation) => {
      const loading = Promise.withResolvers<void>();
      const created = createCommentSession(() => loading.promise);
      created.session.focusAndHandle(readerKey('i').event);
      const blocked = readerKey(' ');
      created.session.focusAndHandle(blocked.event);
      expect(blocked.preventDefault).not.toHaveBeenCalled();

      if (operation === 'deactivate') created.session.deactivateInteraction();
      else releaseReaderView(created.session, created.pdfWindow);
      expect(created.session.mode).toBe('normal');
      created.session.acceptSelectionParams({ annotation: { text: 'new selection' } });
      expect(created.session.mode).toBe('visual');
      loading.resolve();
      await settleReaderMicrotasks();

      expect(created.session.mode).toBe('visual');
      expect(created.indicator.textContent).toMatch(/^SELECT ·/);
      expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-annotation-comment');
      created.session.dispose();
    },
  );

  it.each([true, false])(
    'keeps Select Add note independent of comment entry preference %s and retains native Enter',
    async (enabled) => {
      const loading = Promise.withResolvers<void>();
      const created = createCommentSession(() => loading.promise, {
        [ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY]: enabled,
      });
      created.session.acceptSelectionParams({ annotation: { text: 'snapshot text' } });
      created.session.focusAndHandle(readerKey('i').event);
      await settleReaderMicrotasks();
      loading.resolve();
      await settleReaderMicrotasks();
      const overlay = created.bodyChildren.find((node) => node.id === 'zv-annotation-comment');
      const input = Array.from(overlay?.children ?? []).find(
        (node) => node.id === 'zv-annotation-comment-input',
      );
      expect(input).toBeDefined();
      expect(created.annotation.saveTx).toHaveBeenCalledOnce();
      const enter = readerKey('Enter', { target: input ?? null });
      created.session.focusAndHandle(enter.event);
      expect(enter.preventDefault).not.toHaveBeenCalled();
      expect(enter.stopImmediatePropagation).toHaveBeenCalledOnce();

      created.session.focusAndHandle(readerKey('Escape', { target: input ?? null }).event);
      expect(created.session.mode).toBe('normal');
      await settleReaderMicrotasks();
      expect(created.indicator.textContent).toBe('✓ saved');
      created.session.dispose();
    },
  );

  it.each(['selection', 'outline', 'native'] as const)(
    'saves the closing draft without resetting newer %s ownership or stealing focus',
    async (owner) => {
      const saving = Promise.withResolvers<void>();
      const loadDataType = vi
        .fn<() => Promise<void>>()
        .mockResolvedValueOnce(undefined)
        .mockImplementation(() => saving.promise);
      const created = createCommentSession(loadDataType);
      created.session.focusAndHandle(readerKey('i').event);
      await settleReaderMicrotasks();
      const overlay = created.bodyChildren.find((node) => node.id === 'zv-annotation-comment');
      const input = Array.from(overlay?.children ?? []).find(
        (node) => node.id === 'zv-annotation-comment-input',
      );
      if (!input) throw new Error('Expected mounted comment textarea');
      Reflect.set(input, 'value', 'captured draft');
      created.session.focusAndHandle(readerKey('Escape', { target: input }).event);
      expect(created.session.mode).toBe('normal');
      if (owner === 'selection') {
        created.session.acceptSelectionParams({ annotation: { text: 'new selection' } });
        created.session.focusAndHandle(readerKey('z').event);
      } else if (owner === 'native') {
        created.preferences.set(ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY, false);
        created.session.focusAndHandle(readerKey('i').event);
      } else {
        executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
        await settleReaderMicrotasks();
      }
      const focusCount = vi.mocked(created.pdfWindow.focus).mock.calls.length;
      const status = created.indicator.textContent;
      saving.resolve();
      await settleReaderMicrotasks();

      expect(created.annotation.annotationComment).toBe('captured draft');
      expect(created.annotation.saveTx).toHaveBeenCalledOnce();
      expect(created.session.mode).toBe(owner === 'selection' ? 'visual' : 'normal');
      expect(created.session.input.keyBuffer).toBe(owner === 'selection' ? 'z' : '');
      if (owner === 'outline')
        expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
      expect(created.indicator.textContent).toBe(status);
      expect(created.pdfWindow.focus).toHaveBeenCalledTimes(focusCount);
      if (owner === 'native') {
        const native = readerKey(' ');
        created.session.focusAndHandle(native.event);
        expect(native.preventDefault).not.toHaveBeenCalled();
      }
      created.session.dispose();
    },
  );

  it('routes comment forwarding to its actual split view while the other view keeps Surface commands', async () => {
    const created = createCommentSession();
    const primary = created.reader._internalReader?._primaryView;
    if (!primary) throw new Error('Expected primary Reader PDF view');
    const primaryHost = vi.fn();
    primary._onKeyDown = primaryHost;
    const secondaryHost = vi.fn();
    const secondaryListeners = new Map<string, EventListener>();
    const secondaryWindow = {
      document: {
        getElementById: () => null,
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      addEventListener: (type: string, listener: EventListener) =>
        secondaryListeners.set(type, listener),
      removeEventListener: () => {},
      focus: vi.fn(),
      getSelection: () => null,
    } as unknown as PdfWindow;
    const secondary = { _iframeWindow: secondaryWindow, _onKeyDown: secondaryHost };
    Reflect.set(created.reader._internalReader ?? {}, '_secondaryView', secondary);
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();
    created.session.state.indicator = created.indicator;
    created.session.focusAndHandle(readerKey('i').event);
    await settleReaderMicrotasks();

    const native = readerKey('x');
    primary._onKeyDown?.(native.event);
    secondary._onKeyDown(native.event);
    expect(primaryHost).not.toHaveBeenCalled();
    expect(secondaryHost).toHaveBeenCalledWith(native.event);
    const composing = readerKey('Escape', { isComposing: true });
    primary._onKeyDown?.(composing.event);
    expect(primaryHost).toHaveBeenCalledWith(composing.event);

    const prefix = readerKey(' ');
    secondaryListeners.get('keydown')?.(prefix.event);
    expect(prefix.preventDefault).toHaveBeenCalledOnce();
    expect(created.session.input.keyBuffer).toBe(' ');
    created.session.dispose();
  });
});

describe('reader H/L tab and zh/zl pan defaults', () => {
  it('switches tabs horizontally, pans with counts, and leaves J/K native', () => {
    const cycleReaderTab = vi.fn();
    const created = createHistorySession({}, { cycleReaderTab });
    const container = { scrollBy: vi.fn() } as unknown as HTMLElement;
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfViewer: { container },
    });

    const previousTab = readerKey('H');
    const nextTab = readerKey('L');
    created.session.focusAndHandle(previousTab.event);
    created.session.focusAndHandle(nextTab.event);
    expect(cycleReaderTab).toHaveBeenNthCalledWith(1, created.reader._window, -1);
    expect(cycleReaderTab).toHaveBeenNthCalledWith(2, created.reader._window, 1);
    expect(container.scrollBy).not.toHaveBeenCalled();

    created.session.focusAndHandle(readerKey('3').event);
    created.session.focusAndHandle(readerKey('z').event);
    const left = readerKey('h');
    created.session.focusAndHandle(left.event);
    expect(container.scrollBy).toHaveBeenCalledWith(-180, 0);
    expect(left.preventDefault).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('2').event);
    created.session.focusAndHandle(readerKey('z').event);
    const right = readerKey('l');
    created.session.focusAndHandle(right.event);
    expect(container.scrollBy).toHaveBeenCalledWith(120, 0);
    expect(right.preventDefault).toHaveBeenCalledOnce();

    const oldPrevious = readerKey('J');
    const oldNext = readerKey('K');
    created.session.focusAndHandle(oldPrevious.event);
    created.session.focusAndHandle(oldNext.event);
    expect(oldPrevious.preventDefault).not.toHaveBeenCalled();
    expect(oldNext.preventDefault).not.toHaveBeenCalled();
    expect(cycleReaderTab).toHaveBeenCalledTimes(2);
    created.session.dispose();
  });
});

describe('Reader smooth horizontal pan', () => {
  it('starts follow holds for zh/zl and consumes continuation repeats until keyup', () => {
    for (const [continuation, direction] of [
      ['h', -1],
      ['l', 1],
    ] as const) {
      const previousPage = vi.fn();
      const nextPage = vi.fn();
      const created = smoothSession('follow', {
        navigateToPreviousPage: previousPage,
        navigateToNextPage: nextPage,
      });

      created.session.focusAndHandle(readerKey('z').event);
      const first = readerKey(continuation);
      created.session.focusAndHandle(first.event);
      expect(created.container.scrollBy).toHaveBeenCalledWith(direction * 10, 0);
      expect(created.animationFrameTasks).toHaveLength(1);

      const repeat = readerKey(continuation);
      created.session.focusAndHandle(repeat.event);
      expect(repeat.preventDefault).toHaveBeenCalledOnce();
      expect(created.container.scrollBy).toHaveBeenCalledTimes(1);
      expect(previousPage).not.toHaveBeenCalled();
      expect(nextPage).not.toHaveBeenCalled();

      releaseSmoothHold(created, continuation);
      runSmoothFrame(created, 16);
      expect(created.container.scrollBy).toHaveBeenCalledTimes(1);
      created.session.dispose();
    }
  });

  it('invalidates an intervening leader timeout when a smooth hold repeats', () => {
    vi.useFakeTimers();
    const openTabPicker = vi.fn();
    const bindings: BindingMap = { ...DEFAULT_BINDINGS, 'reader-normal:<Space>f': 'switchTab' };
    const created = smoothSession('follow', {}, bindings, { openTabPicker });
    created.session.focusAndHandle(readerKey('j').event);
    created.session.focusAndHandle(readerKey(' ').event);
    created.session.focusAndHandle(readerKey('f').event);
    expect(created.session.input.keyBuffer).toBe(' f');
    const repeat = readerKey('j');
    created.session.focusAndHandle(repeat.event);
    expect(repeat.preventDefault).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(openTabPicker).not.toHaveBeenCalled();
    expect(created.session.input.keyBuffer).toBe(' f');
    releaseSmoothHold(created, 'j');
    created.session.dispose();
  });

  it('keeps trapezoid release moving while repeat keydown does not restart the curve', () => {
    const created = smoothSession('trapezoid');
    created.session.focusAndHandle(readerKey('z').event);
    created.session.focusAndHandle(readerKey('l').event);
    expect(created.container.scrollBy).toHaveBeenNthCalledWith(1, 7.5, 0);

    runSmoothFrame(created, 16);
    expect(created.container.scrollBy).toHaveBeenCalledTimes(2);

    const repeat = readerKey('l');
    created.session.focusAndHandle(repeat.event);
    expect(repeat.preventDefault).toHaveBeenCalledOnce();
    expect(created.container.scrollBy).toHaveBeenCalledTimes(2);

    releaseSmoothHold(created, 'l');
    runSmoothFrame(created, 32);
    expect(created.container.scrollBy).toHaveBeenCalledTimes(3);
    created.session.dispose();
  });

  it('keeps counted chords and step mode as immediate discrete pan', () => {
    const counted = smoothSession('follow');
    counted.session.focusAndHandle(readerKey('3').event);
    counted.session.focusAndHandle(readerKey('z').event);
    counted.session.focusAndHandle(readerKey('h').event);
    expect(counted.container.scrollBy).toHaveBeenCalledWith(-180, 0);
    expect(counted.animationFrameTasks).toHaveLength(0);
    counted.session.focusAndHandle(readerKey('2').event);
    counted.session.focusAndHandle(readerKey('z').event);
    counted.session.focusAndHandle(readerKey('l').event);
    expect(counted.container.scrollBy).toHaveBeenCalledWith(120, 0);
    expect(counted.animationFrameTasks).toHaveLength(0);
    counted.session.dispose();

    const step = smoothSession('step');
    step.session.focusAndHandle(readerKey('z').event);
    step.session.focusAndHandle(readerKey('h').event);
    expect(step.container.scrollBy).toHaveBeenCalledWith(-60, 0);
    expect(step.animationFrameTasks).toHaveLength(0);
    step.session.focusAndHandle(readerKey('z').event);
    step.session.focusAndHandle(readerKey('l').event);
    expect(step.container.scrollBy).toHaveBeenCalledWith(60, 0);
    expect(step.animationFrameTasks).toHaveLength(0);
    step.session.dispose();
  });

  it('derives direct j/k and custom H/L scroll holds from their actions', () => {
    for (const [key, direction] of [
      ['j', 1],
      ['k', -1],
    ] as const) {
      const created = smoothSession('follow');
      const press = readerKey(key);
      created.session.focusAndHandle(press.event);
      expect(created.container.scrollBy).toHaveBeenCalledWith(0, direction * 10);
      expect(created.animationFrameTasks).toHaveLength(1);
      const repeat = readerKey(key);
      created.session.focusAndHandle(repeat.event);
      expect(repeat.preventDefault).toHaveBeenCalledOnce();
      expect(created.container.scrollBy).toHaveBeenCalledTimes(1);
      releaseSmoothHold(created, key);
      created.session.dispose();
    }

    const customBindings = {
      ...DEFAULT_BINDINGS,
      'reader-normal:H': 'scrollLeft',
      'reader-normal:L': 'scrollRight',
    } as BindingMap;
    for (const [key, direction] of [
      ['H', -1],
      ['L', 1],
    ] as const) {
      const created = smoothSession('follow', {}, customBindings);
      const press = readerKey(key);
      created.session.focusAndHandle(press.event);
      expect(created.container.scrollBy).toHaveBeenCalledWith(direction * 10, 0);
      expect(created.animationFrameTasks).toHaveLength(1);
      releaseSmoothHold(created, key);
      created.session.dispose();
    }

    const namedBindings = {
      ...DEFAULT_BINDINGS,
      'reader-normal:<Down>': 'scrollDown',
    } as BindingMap;
    const named = smoothSession('follow', {}, namedBindings);
    const down = readerKey('ArrowDown');
    named.session.focusAndHandle(down.event);
    expect(named.container.scrollBy).toHaveBeenCalledWith(0, 10);
    expect(named.animationFrameTasks).toHaveLength(1);
    releaseSmoothHold(named, 'ArrowDown');
    named.session.dispose();
  });
});
describe('reader split shortcuts', () => {
  it('uses the current Zotero reader split methods for Space-minus and Space-pipe', () => {
    const toggleHorizontalSplit = vi.fn();
    const toggleVerticalSplit = vi.fn();
    const created = createHistorySession({ toggleHorizontalSplit, toggleVerticalSplit });

    created.session.focusAndHandle(readerKey(' ').event);
    created.session.focusAndHandle(readerKey('-').event);
    created.session.focusAndHandle(readerKey(' ').event);
    created.session.focusAndHandle(readerKey('|').event);

    expect(toggleHorizontalSplit).toHaveBeenCalledOnce();
    expect(toggleVerticalSplit).toHaveBeenCalledOnce();
    created.session.dispose();
  });

  it('routes motions through Zotero active split state even when Gecko focus stays primary', () => {
    const zoomOut = vi.fn(function (this: InternalReaderRuntime) {
      expect(this._lastViewPrimary).toBe(true);
    });
    const zoomReset = vi.fn(function (this: InternalReaderRuntime) {
      expect(this._lastViewPrimary).toBe(false);
    });
    const created = createHistorySession({
      _state: { primary: true },
      _lastViewPrimary: true,
      zoomOut,
      zoomReset,
    });
    const internal = created.reader._internalReader ?? {};
    const focusView = vi.fn((primary = true) => {
      Reflect.set(internal, '_lastViewPrimary', primary);
      Reflect.set(internal, '_state', { primary });
    });
    Reflect.set(internal, 'focusView', focusView);
    const primaryScrollTo = vi.fn();
    const secondaryScrollTo = vi.fn();
    const primaryScrollBy = vi.fn();
    const secondaryScrollBy = vi.fn();
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfViewer: {
        container: {
          clientHeight: 600,
          scrollHeight: 2400,
          scrollTo: primaryScrollTo,
          scrollBy: primaryScrollBy,
        } as unknown as HTMLElement,
      },
    });
    const secondary = {
      ...created.pdfWindow,
      focus: vi.fn(),
      PDFViewerApplication: {
        pdfViewer: {
          container: {
            clientHeight: 600,
            scrollHeight: 2400,
            scrollTo: secondaryScrollTo,
            scrollBy: secondaryScrollBy,
          } as unknown as HTMLElement,
        },
      },
    } as unknown as PdfWindow;
    Reflect.set(internal, '_secondaryView', { _iframeWindow: secondary });
    Reflect.set(internal, 'splitType', 'vertical');

    const right = controlKey('l');
    created.session.focusAndHandle(right.event);
    expect(focusView).toHaveBeenLastCalledWith(false);
    expect(right.preventDefault).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('z').event);
    created.session.focusAndHandle(readerKey('0').event);
    expect(zoomReset).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('G').event);
    expect(secondaryScrollTo).toHaveBeenCalledWith(0, 1800);
    expect(primaryScrollTo).not.toHaveBeenCalled();

    created.session.focusAndHandle(readerKey('j').event);
    created.session.focusAndHandle(readerKey('k').event);
    created.session.focusAndHandle(controlKey('d').event);
    created.session.focusAndHandle(controlKey('u').event);
    expect(secondaryScrollBy).toHaveBeenCalledTimes(4);
    expect(primaryScrollBy).not.toHaveBeenCalled();

    const rightEdge = controlKey('l');
    created.session.focusAndHandle(rightEdge.event);
    expect(focusView).toHaveBeenCalledTimes(1);
    expect(rightEdge.preventDefault).not.toHaveBeenCalled();

    created.session.focusAndHandle(controlKey('h').event);
    expect(focusView).toHaveBeenLastCalledWith(true);
    created.session.focusAndHandle(readerKey('-').event);
    expect(zoomOut).toHaveBeenCalledOnce();

    Reflect.set(internal, 'splitType', 'horizontal');
    created.session.focusAndHandle(controlKey('j').event);
    expect(focusView).toHaveBeenLastCalledWith(false);
    created.session.focusAndHandle(controlKey('k').event);
    expect(focusView).toHaveBeenLastCalledWith(true);
    created.session.dispose();
  });

  it('moves right from the reader into Zotero context notes when no split target exists', () => {
    const focusContext = vi.fn();
    const created = createHistorySession();
    Reflect.set(created.reader, '_window', { ZoteroContextPane: { focus: focusContext } });
    const right = controlKey('l');

    created.session.focusAndHandle(right.event);

    expect(focusContext).toHaveBeenCalledOnce();
    expect(right.preventDefault).toHaveBeenCalledOnce();
    const left = controlKey('h');
    created.session.focusAndHandle(left.event);
    expect(left.preventDefault).not.toHaveBeenCalled();
    created.session.dispose();
  });
});

function configureOutline(created: ReaderHistoryHarness, count = 2) {
  const setHash = vi.fn();
  Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
    pdfViewer: { currentPageNumber: 1 },
    pdfDocument: {
      getOutline: async () =>
        Array.from({ length: count }, (_, index) => ({
          title: `Chapter ${index + 1}`,
          dest: [index, { name: 'Fit' }],
        })),
    },
    pdfLinkService: {
      getDestinationHash: (destination: readonly [number]) => `#page=${destination[0] + 1}`,
      setHash,
    },
  });
  return { setHash };
}

describe('reader sidebar coordination', () => {
  it('replaces Outline with Marks and restores focus once on close', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');

    created.session.focusAndHandle(readerKey('Escape').event);
    vi.advanceTimersByTime(30);
    expect(created.pdfWindow.focus).toHaveBeenCalledTimes(2);
    created.session.dispose();
  });

  it('reopens Marks immediately after Escape closes the explorer', () => {
    const created = createHistorySession();
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');

    created.session.focusAndHandle(readerKey('Escape').event);
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-marks-explorer');

    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');
    created.session.dispose();
  });

  it('toggles open Outline and Marks with their default Space-leader shortcuts', () => {
    for (const [key, overlayID] of [
      ['e', 'zv-outline-explorer'],
      ['m', 'zv-marks-explorer'],
    ] as const) {
      const created = createHistorySession();
      created.session.focusAndHandle(readerKey(' ').event);
      created.session.focusAndHandle(readerKey(key).event);
      expect(created.bodyChildren.map((node) => node.id)).toContain(overlayID);

      const prefix = readerKey(' ');
      created.session.focusAndHandle(prefix.event);
      expect(prefix.preventDefault).toHaveBeenCalledOnce();
      expect(created.bodyChildren.map((node) => node.id)).toContain(overlayID);

      const close = readerKey(key);
      created.session.focusAndHandle(close.event);
      expect(close.preventDefault).toHaveBeenCalledOnce();
      expect(created.bodyChildren.map((node) => node.id)).not.toContain(overlayID);
      created.session.dispose();
    }
  });

  it('uses remapped toggle bindings while a Reader sidebar owns input', () => {
    const bindings = {
      ...Object.fromEntries(
        Object.entries(DEFAULT_BINDINGS).filter(
          ([binding]) =>
            binding !== 'reader-normal:<Space>e' && binding !== 'reader-normal:<Space>m',
        ),
      ),
      'reader-normal:q': 'toggleReaderSidebarOutline',
      'reader-normal:w': 'toggleMarksExplorer',
    } as BindingMap;
    const created = createHistorySession({}, {}, bindings);

    created.session.focusAndHandle(readerKey('q').event);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    created.session.focusAndHandle(readerKey('q').event);
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');

    created.session.focusAndHandle(readerKey('w').event);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');
    created.session.focusAndHandle(readerKey('w').event);
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-marks-explorer');
    created.session.dispose();
  });

  it('returns a failed sidebar toggle prefix to local sidebar input', () => {
    const scrollBy = vi.fn();
    const created = createHistorySession();
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfViewer: { container: { scrollBy } },
    });
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);

    created.session.focusAndHandle(readerKey(' ').event);
    created.session.focusAndHandle(readerKey('j').event);

    expect(scrollBy).not.toHaveBeenCalled();
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    created.session.dispose();
  });
  it.each([
    { key: 'Escape', isComposing: true },
    { key: 'Process', keyCode: 229 },
    { key: ' ', keyCode: 229 },
  ])('leaves native composition $key outside Outline commands and toggle prefixes', (input) => {
    const created = createHistorySession();
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    const overlay = created.bodyChildren.find((node) => node.id === 'zv-outline-explorer');
    const key = readerKey(input.key, input);
    created.session.focusAndHandle(key.event);
    expect(key.preventDefault).not.toHaveBeenCalled();
    expect(created.bodyChildren.find((node) => node.id === 'zv-outline-explorer')).toBe(overlay);
    created.session.dispose();
  });

  it('yields another pane to its host and retires the Outline without restoring old focus', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    const secondary = createHistorySession();
    const native = vi.fn();
    const view = { _iframeWindow: secondary.pdfWindow, _onKeyDown: native };
    Reflect.set(created.reader._internalReader!, '_secondaryView', view);
    created.session.start();
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    const hostKey = readerKey('x').event;
    view._onKeyDown(hostKey);
    expect(native).toHaveBeenCalledExactlyOnceWith(hostKey);
    Reflect.set(created.reader._internalReader!, '_lastViewPrimary', false);
    const key = readerKey('x');
    created.session.focusAndHandle(key.event);
    expect(key.preventDefault).not.toHaveBeenCalled();
    expect(created.bodyChildren.some((node) => node.id === 'zv-outline-explorer')).toBe(false);
    vi.advanceTimersByTime(30);
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
    created.session.dispose();
    secondary.session.dispose();
  });

  it('hands editable input back instead of running Outline or its remapped toggle', () => {
    const bindings: BindingMap = {
      ...DEFAULT_BINDINGS,
      'reader-normal:q': 'toggleReaderSidebarOutline',
    };
    const created = createHistorySession({}, {}, bindings);
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    const target = { tagName: 'INPUT', localName: 'input' } as unknown as EventTarget;
    const key = readerKey('q', { target });
    created.session.focusAndHandle(key.event);
    expect(key.preventDefault).not.toHaveBeenCalled();
    expect(created.bodyChildren.some((node) => node.id === 'zv-outline-explorer')).toBe(false);
    created.session.dispose();
  });

  it('releases dead Outline DOM without reading its owner or blocking host restoration', () => {
    const created = createHistorySession();
    const view = created.reader._internalReader!._primaryView!;
    const native = vi.fn();
    view._onKeyDown = native;
    created.session.start();
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    const overlay = created.bodyChildren.find((node) => node.id === 'zv-outline-explorer')!;
    const dead = new Set<object>([created.pdfWindow, overlay]);
    Reflect.get(globalThis, 'Components').utils.isDeadWrapper = (value: object) => dead.has(value);
    for (const property of ['ownerDocument', 'remove'])
      Object.defineProperty(overlay, property, {
        configurable: true,
        get: () => {
          throw new Error('cannot access dead Outline');
        },
      });
    Reflect.set(created.reader._internalReader!, '_primaryView', undefined);
    created.intervalTasks[0]?.();
    const key = readerKey('x').event;
    view._onKeyDown?.(key);
    expect(native).toHaveBeenCalledExactlyOnceWith(key);
    created.session.dispose();
  });

  it('keeps live close failures observable while retiring sidebar coordination', () => {
    const created = createHistorySession();
    const secondary = createHistorySession();
    const native = vi.fn();
    const view = { _iframeWindow: secondary.pdfWindow, _onKeyDown: native };
    Reflect.set(created.reader._internalReader!, '_secondaryView', view);
    created.session.start();
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    const overlay = created.bodyChildren.find((node) => node.id === 'zv-outline-explorer')!;
    vi.mocked(overlay.remove).mockImplementationOnce(() => {
      throw new Error('live Outline removal failed');
    });
    expect(() => created.session.focusAndHandle(readerKey('Escape').event)).toThrow(
      'live Outline removal failed',
    );
    overlay.remove();
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', secondary.pdfWindow);
    Reflect.set(created.reader._internalReader!, '_secondaryView', undefined);
    created.intervalTasks[0]?.();
    expect(secondary.bodyChildren.some((node) => node.id === 'zv-outline-explorer')).toBe(false);
    const key = readerKey('x').event;
    view._onKeyDown(key);
    expect(native).toHaveBeenCalledExactlyOnceWith(key);
    created.session.dispose();
    secondary.session.dispose();
  });

  it('moves focus-only Outline ownership to the requested split pane', async () => {
    const created = createHistorySession();
    const secondary = createHistorySession();
    Reflect.set(created.reader._internalReader!, '_secondaryView', {
      _iframeWindow: secondary.pdfWindow,
    });
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    executeReaderAction(created.session, 'focusReaderSidebar', secondary.pdfWindow);
    await settleReaderMicrotasks();
    expect(created.bodyChildren.some((node) => node.id === 'zv-outline-explorer')).toBe(false);
    expect(secondary.bodyChildren.some((node) => node.id === 'zv-outline-explorer')).toBe(true);
    created.session.dispose();
    secondary.session.dispose();
  });

  it.each(['hint', 'command'] as const)(
    'keeps retired %s expiry from changing a new Outline selection',
    async (kind) => {
      vi.useFakeTimers();
      const timers = vi.spyOn(globalThis, 'setTimeout');
      const created = createHistorySession();
      const { setHash } = configureOutline(created, 32);
      executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
      await settleReaderMicrotasks();
      created.session.focusAndHandle(readerKey(kind === 'hint' ? 'a' : 'g').event);
      const oldTimer = timers.mock.calls.find(
        ([, delay]) => delay === (kind === 'hint' ? 1200 : 700),
      )![0] as () => void;
      created.session.focusAndHandle(readerKey('Escape').event);
      executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
      await settleReaderMicrotasks();
      if (kind === 'command') created.session.focusAndHandle(readerKey('G').event);
      created.session.focusAndHandle(readerKey(kind === 'hint' ? 'a' : 'g').event);
      oldTimer();
      created.session.focusAndHandle(readerKey(kind === 'hint' ? 's' : 'g').event);
      created.session.focusAndHandle(readerKey('Enter').event);
      expect(setHash).toHaveBeenCalledExactlyOnceWith(kind === 'hint' ? 'page=2' : 'page=1');
      created.session.dispose();
      timers.mockRestore();
    },
  );

  it('does not refocus a retired pane after a newer sidebar opens', () => {
    vi.useFakeTimers();
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const created = createHistorySession();
    const secondary = createHistorySession();
    Reflect.set(created.reader._internalReader!, '_secondaryView', {
      _iframeWindow: secondary.pdfWindow,
    });
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    created.session.focusAndHandle(readerKey('Escape').event);
    const oldTimer = timers.mock.calls.find(([, delay]) => delay === 30)![0] as () => void;
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', secondary.pdfWindow);
    vi.mocked(created.pdfWindow.focus).mockClear();
    oldTimer();
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
    created.session.dispose();
    secondary.session.dispose();
    timers.mockRestore();
  });

  it('retires pending Outline navigation errors when a new invocation replaces it', async () => {
    const created = createHistorySession();
    configureOutline(created);
    const pending = Promise.withResolvers<void>();
    const application = created.pdfWindow.PDFViewerApplication!;
    Reflect.set(application, 'pdfLinkService', { goToDestination: () => pending.promise });
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    await settleReaderMicrotasks();
    created.session.focusAndHandle(readerKey('Enter').event);
    created.session.focusAndHandle(readerKey('Escape').event);
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    const current = created.bodyChildren.find((node) => node.id === 'zv-outline-explorer');
    pending.reject(new Error('retired outline navigation'));
    await settleReaderMicrotasks();
    expect(created.debug).toEqual([]);
    expect(created.bodyChildren.find((node) => node.id === 'zv-outline-explorer')).toBe(current);
    created.session.dispose();
  });

  it('waits for the captured view initialization instead of caching an empty early Outline', async () => {
    const created = createHistorySession();
    const { setHash } = configureOutline(created);
    const application = created.pdfWindow.PDFViewerApplication!;
    const document = application.pdfDocument;
    const initialized = Promise.withResolvers<void>();
    Reflect.set(
      created.reader._internalReader!._primaryView!,
      'initializedPromise',
      initialized.promise,
    );
    Reflect.set(application, 'pdfDocument', undefined);
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    await settleReaderMicrotasks();
    Reflect.set(application, 'pdfDocument', document);
    initialized.resolve();
    await vi.waitFor(() => {
      const overlay = created.bodyChildren.find((node) => node.id === 'zv-outline-explorer');
      if (!overlay?.children[1]?.children[1]) throw new Error('Outline entries are not ready');
    });
    created.session.focusAndHandle(readerKey('j').event);
    created.session.focusAndHandle(readerKey('Enter').event);
    expect(setHash).toHaveBeenCalledExactlyOnceWith('page=2');
    created.session.dispose();
  });

  it('does not confirm a cached Outline before its new pane is initialized', async () => {
    const created = createHistorySession();
    const secondary = createHistorySession();
    configureOutline(created);
    const { setHash } = configureOutline(secondary);
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    await settleReaderMicrotasks();
    created.session.focusAndHandle(readerKey('Escape').event);
    const initialized = Promise.withResolvers<void>();
    Reflect.set(created.reader._internalReader!, '_secondaryView', {
      _iframeWindow: secondary.pdfWindow,
      initializedPromise: initialized.promise,
    });
    Reflect.set(created.reader._internalReader!, '_lastViewPrimary', false);
    const application = secondary.pdfWindow.PDFViewerApplication!;
    const document = application.pdfDocument;
    Reflect.set(application, 'pdfDocument', undefined);
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', secondary.pdfWindow);
    created.session.focusAndHandle(readerKey('Enter').event);
    expect(setHash).not.toHaveBeenCalled();
    Reflect.set(application, 'pdfDocument', document);
    initialized.resolve();
    await vi.waitFor(() => {
      const overlay = secondary.bodyChildren.find((node) => node.id === 'zv-outline-explorer');
      if (!overlay?.children[1]?.children[1]) throw new Error('Outline entries are not ready');
    });
    created.session.focusAndHandle(readerKey('j').event);
    created.session.focusAndHandle(readerKey('Enter').event);
    expect(setHash).toHaveBeenCalledExactlyOnceWith('page=2');
    created.session.dispose();
    secondary.session.dispose();
  });

  it('retires an old initialization wait before a replacement view owns Outline', async () => {
    const created = createHistorySession();
    const secondary = createHistorySession();
    configureOutline(created);
    const { setHash } = configureOutline(secondary);
    const oldView = created.reader._internalReader!._primaryView!;
    const initialized = Promise.withResolvers<void>();
    Reflect.set(oldView, 'initializedPromise', initialized.promise);
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    created.session.focusAndHandle(readerKey('Escape').event);
    Reflect.set(created.reader._internalReader!, '_primaryView', {
      _iframeWindow: secondary.pdfWindow,
    });
    Object.defineProperty(oldView, '_iframeWindow', {
      get: () => {
        throw new Error('retired native view');
      },
    });
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', secondary.pdfWindow);
    await settleReaderMicrotasks();
    initialized.resolve();
    await settleReaderMicrotasks();
    created.session.focusAndHandle(readerKey('j').event);
    created.session.focusAndHandle(readerKey('Enter').event);
    expect(setHash).toHaveBeenCalledExactlyOnceWith('page=2');
    expect(created.debug).toEqual([]);
    created.session.dispose();
    secondary.session.dispose();
  });

  it('clears Outline on Reader deactivation and cancels an already pending focus restore', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    created.session.deactivateInteraction();
    expect(created.bodyChildren.some((node) => node.id === 'zv-outline-explorer')).toBe(false);
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    created.session.focusAndHandle(readerKey('Escape').event);
    vi.mocked(created.pdfWindow.focus).mockClear();
    created.session.deactivateInteraction();
    vi.advanceTimersByTime(30);
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
    created.session.dispose();
  });

  it('coordinates Marks replacement when focusing Outline and restores focus on disposal', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');
    executeReaderAction(created.session, 'focusReaderSidebar', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-marks-explorer');

    created.session.dispose();
    vi.advanceTimersByTime(30);
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
    expect(created.bodyChildren).toHaveLength(0);
  });
});

describe('Reader Marks input lifetime', () => {
  it.each([
    { key: 'Escape', isComposing: true },
    { key: 'Process', keyCode: 229 },
    { key: ' ', keyCode: 229 },
  ])('leaves native composition $key outside Marks commands and toggle prefixes', (input) => {
    const created = createHistorySession();
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    const overlay = created.bodyChildren.find((node) => node.id === 'zv-marks-explorer');
    const key = readerKey(input.key, input);
    created.session.focusAndHandle(key.event);
    expect(key.preventDefault).not.toHaveBeenCalled();
    expect(created.bodyChildren.find((node) => node.id === 'zv-marks-explorer')).toBe(overlay);
    created.session.dispose();
  });

  it('yields another pane to its host without clearing Marks or restoring old focus', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    const secondary = createHistorySession();
    const native = vi.fn();
    const view = { _iframeWindow: secondary.pdfWindow, _onKeyDown: native };
    Reflect.set(created.reader._internalReader!, '_secondaryView', view);
    created.session.start();
    created.session.focusAndHandle(readerKey('m').event);
    created.session.focusAndHandle(readerKey('a').event);
    vi.mocked(created.pdfWindow.focus).mockClear();
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    const hostKey = readerKey('x').event;
    view._onKeyDown(hostKey);
    expect(native).toHaveBeenCalledExactlyOnceWith(hostKey);
    Reflect.set(created.reader._internalReader!, '_lastViewPrimary', false);
    const key = readerKey('x');
    created.session.focusAndHandle(key.event);
    expect(key.preventDefault).not.toHaveBeenCalled();
    expect(created.session.marks.a).toBeDefined();
    expect(created.bodyChildren.some((node) => node.id === 'zv-marks-explorer')).toBe(false);
    vi.advanceTimersByTime(30);
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
    created.session.dispose();
    secondary.session.dispose();
  });

  it('hands editable input back instead of running Marks or its remapped toggle', () => {
    const bindings: BindingMap = {
      ...DEFAULT_BINDINGS,
      'reader-normal:q': 'toggleMarksExplorer',
    };
    const created = createHistorySession({}, {}, bindings);
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    const target = { tagName: 'INPUT', localName: 'input' } as unknown as EventTarget;
    const key = readerKey('q', { target });
    created.session.focusAndHandle(key.event);
    expect(key.preventDefault).not.toHaveBeenCalled();
    expect(created.bodyChildren.some((node) => node.id === 'zv-marks-explorer')).toBe(false);
    created.session.dispose();
  });

  it('releases dead Marks DOM without reading its owner or blocking native key restoration', () => {
    const created = createHistorySession();
    const view = created.reader._internalReader!._primaryView!;
    const native = vi.fn();
    view._onKeyDown = native;
    created.session.start();
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    const overlay = created.bodyChildren.find((node) => node.id === 'zv-marks-explorer')!;
    const dead = new Set<object>([created.pdfWindow, overlay]);
    Reflect.get(globalThis, 'Components').utils.isDeadWrapper = (value: object) => dead.has(value);
    for (const property of ['ownerDocument', 'remove'])
      Object.defineProperty(overlay, property, {
        configurable: true,
        get: () => {
          throw new Error('cannot access dead Marks');
        },
      });
    Reflect.set(created.reader._internalReader!, '_primaryView', undefined);
    created.intervalTasks[0]?.();
    const key = readerKey('x').event;
    view._onKeyDown?.(key);
    expect(native).toHaveBeenCalledExactlyOnceWith(key);
    created.session.dispose();
  });

  it('keeps live close failures observable while retiring Marks coordination', () => {
    const created = createHistorySession();
    const secondary = createHistorySession();
    const native = vi.fn();
    const view = { _iframeWindow: secondary.pdfWindow, _onKeyDown: native };
    Reflect.set(created.reader._internalReader!, '_secondaryView', view);
    created.session.start();
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    const overlay = created.bodyChildren.find((node) => node.id === 'zv-marks-explorer')!;
    vi.mocked(overlay.remove).mockImplementationOnce(() => {
      throw new Error('live Marks removal failed');
    });
    expect(() => created.session.focusAndHandle(readerKey('Escape').event)).toThrow(
      'live Marks removal failed',
    );
    overlay.remove();
    executeReaderAction(created.session, 'toggleMarksExplorer', secondary.pdfWindow);
    Reflect.set(created.reader._internalReader!, '_secondaryView', undefined);
    created.intervalTasks[0]?.();
    expect(secondary.bodyChildren.some((node) => node.id === 'zv-marks-explorer')).toBe(false);
    const key = readerKey('x').event;
    view._onKeyDown(key);
    expect(native).toHaveBeenCalledExactlyOnceWith(key);
    created.session.dispose();
    secondary.session.dispose();
  });

  it('clears transient Marks and pending focus on Reader deactivation but preserves saved marks', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    created.session.focusAndHandle(readerKey('m').event);
    created.session.focusAndHandle(readerKey('a').event);
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    created.session.deactivateInteraction();
    expect(created.bodyChildren.some((node) => node.id === 'zv-marks-explorer')).toBe(false);
    expect(created.session.marks.a).toBeDefined();
    vi.mocked(created.pdfWindow.focus).mockClear();
    vi.advanceTimersByTime(30);
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    created.session.focusAndHandle(readerKey('Escape').event);
    created.session.deactivateInteraction();
    vi.mocked(created.pdfWindow.focus).mockClear();
    vi.advanceTimersByTime(30);
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
    created.session.dispose();
  });

  it('keeps a retired toggle-prefix expiry from cancelling a newer Marks toggle', () => {
    vi.useFakeTimers();
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const created = createHistorySession();
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    created.session.focusAndHandle(readerKey(' ').event);
    const oldTimer = timers.mock.calls.find(([, delay]) => delay === 1200)![0] as () => void;
    created.session.focusAndHandle(readerKey('Escape').event);
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    created.session.focusAndHandle(readerKey(' ').event);
    oldTimer();
    created.session.focusAndHandle(readerKey('m').event);
    expect(created.bodyChildren.some((node) => node.id === 'zv-marks-explorer')).toBe(false);
    created.session.dispose();
    timers.mockRestore();
  });

  it('keeps the remaining mark selected and jumpable after deleting the selected last row', async () => {
    const execution = navigationHistoryPort();
    const created = createHistorySession({}, { navigationForReader: () => execution.port });
    const native = attachNativeReaderHistory(created);
    created.session.start();
    created.session.focusAndHandle(readerKey('m').event);
    created.session.focusAndHandle(readerKey('a').event);
    native.container.scrollTop = 800;
    created.session.focusAndHandle(readerKey('m').event);
    created.session.focusAndHandle(readerKey('b').event);
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    created.session.focusAndHandle(readerKey('G').event);
    created.session.focusAndHandle(readerKey('d').event);
    expect(Object.keys(created.session.marks)).toEqual(['a']);
    native.container.scrollTop = 100;
    created.session.focusAndHandle(readerKey('Enter').event);
    await vi.waitFor(() => {
      created.animationFrameTasks.shift()?.();
      expect(
        execution.history.locations.map((location) =>
          location.kind === 'reader' ? location.position?.top : null,
        ),
      ).toEqual([100, 1_045]);
    });
    created.session.dispose();
  });
});

describe('reader outline load invalidation', () => {
  it('does not resurrect a closed Outline after pending load resolves', async () => {
    vi.useFakeTimers();
    const { promise: pending, resolve: resolveOutline } = Promise.withResolvers<unknown[]>();
    const created = createHistorySession();
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfDocument: { getOutline: () => pending },
    });

    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    created.session.focusAndHandle(readerKey('Escape').event);
    vi.advanceTimersByTime(30);
    const focusCount = vi.mocked(created.pdfWindow.focus).mock.calls.length;
    resolveOutline([]);
    await Promise.resolve();
    await Promise.resolve();

    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');
    expect(created.pdfWindow.focus).toHaveBeenCalledTimes(focusCount);
    created.session.dispose();
  });

  it('does not resurrect a released PDF view Outline after pending load resolves', async () => {
    vi.useFakeTimers();
    const { promise: pending, resolve: resolveOutline } = Promise.withResolvers<unknown[]>();
    const created = createHistorySession();
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfDocument: { getOutline: () => pending },
    });

    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    releaseReaderView(created.session, created.pdfWindow);
    resolveOutline([]);
    await Promise.resolve();
    await Promise.resolve();

    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');
    vi.advanceTimersByTime(30);
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
    created.session.dispose();
  });
});

describe('Reader outline navigation execution', () => {
  it('closes on host success even when the actual hard destination is not appended', async () => {
    const execution = navigationHistoryPort();
    const created = createHistorySession({}, { navigationForReader: () => execution.port });
    const native = attachNativeReaderHistory(created);
    const goToDestination = vi.fn(async () => {
      await native.view._pushHistoryPoint?.();
    });
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfViewer: native.viewer,
      pdfDocument: {
        getOutline: async () => [
          { title: 'Current page', dest: [0, { name: 'XYZ' }, 0, 500, null] },
        ],
      },
      pdfLinkService: { goToDestination },
    });
    created.session.start();
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    await settleReaderMicrotasks();

    created.session.focusAndHandle(readerKey('Enter').event);
    for (let turn = 0; turn < 12; turn += 1) {
      await Promise.resolve();
      created.animationFrameTasks.shift()?.();
    }
    await vi.waitFor(() =>
      expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer'),
    );

    expect(goToDestination).toHaveBeenCalledOnce();
    expect(execution.intents[0]).toMatchObject({
      cause: { kind: 'event', event: 'reader-outline.confirm' },
      surface: 'reader',
      context: { readerPath: 'outline' },
    });
    expect(execution.history.locations).toHaveLength(0);
    created.session.dispose();
  });

  it('keeps Outline open when a selected row has no host destination', async () => {
    const created = createHistorySession();
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfDocument: { getOutline: async () => [{ title: 'No destination' }] },
    });
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    await settleReaderMicrotasks();

    created.session.focusAndHandle(readerKey('Enter').event);
    await settleReaderMicrotasks();

    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    created.session.dispose();
  });

  it('keeps a reopened Outline when an older confirmed destination finishes late', async () => {
    const created = createHistorySession();
    const { promise: pending, resolve: resolveDestination } = Promise.withResolvers<void>();
    const goToDestination = vi.fn(() => pending);
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfDocument: {
        getOutline: async () => [
          { title: 'Pending page', dest: [1, { name: 'XYZ' }, 0, 500, null] },
        ],
      },
      pdfLinkService: { goToDestination },
    });
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    await settleReaderMicrotasks();
    created.session.focusAndHandle(readerKey('Enter').event);
    expect(goToDestination).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('Escape').event);
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    await settleReaderMicrotasks();
    resolveDestination();
    await settleReaderMicrotasks();

    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    created.session.dispose();
  });

  it.each(['attached', 'detached'] as const)(
    'keeps the newer %s confirmation in the same Outline invocation',
    async (owner) => {
      const execution = navigationHistoryPort();
      const created = createHistorySession(
        {},
        owner === 'attached' ? { navigationForReader: () => execution.port } : {},
      );
      const native = attachNativeReaderHistory(created);
      const first = Promise.withResolvers<void>();
      const second = Promise.withResolvers<void>();
      Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
        pdfViewer: native.viewer,
        pdfDocument: {
          getOutline: async () => [
            { title: 'First', dest: [1, { name: 'XYZ' }, 0, 700, null] },
            { title: 'Second', dest: [2, { name: 'XYZ' }, 0, 700, null] },
          ],
        },
        pdfLinkService: {
          goToDestination: (destination: readonly unknown[]) => {
            const pageIndex = Number(destination[0]);
            return (pageIndex === 1 ? first.promise : second.promise).then(() => {
              native.viewer.currentPageNumber = pageIndex + 1;
              native.container.scrollTop = 700;
              native.viewer.update();
            });
          },
        },
      });
      created.session.start();
      executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
      await settleReaderMicrotasks();
      created.session.focusAndHandle(readerKey('Enter').event);
      created.session.focusAndHandle(readerKey('j').event);
      created.session.focusAndHandle(readerKey('Enter').event);
      const overlay = created.bodyChildren.find((node) => node.id === 'zv-outline-explorer');
      if (!overlay) throw new Error('Expected the open Outline');
      const status = overlay.children[overlay.children.length - 1];
      if (!status) throw new Error('Expected the Outline status');
      const currentStatus = status.textContent;
      first.resolve();
      for (let turn = 0; turn < 16; turn += 1) {
        await Promise.resolve();
        created.animationFrameTasks.shift()?.();
      }
      expect(created.bodyChildren).toContain(overlay);
      expect(status.textContent).toBe(currentStatus);
      second.resolve();
      for (let turn = 0; turn < 16; turn += 1) {
        await Promise.resolve();
        created.animationFrameTasks.shift()?.();
      }
      await vi.waitFor(() => expect(created.bodyChildren).not.toContain(overlay));
      expect(native.viewer.currentPageNumber).toBe(3);
      created.session.dispose();
    },
  );

  it('keeps Outline open and reports a failed destination instead of closing', async () => {
    const created = createHistorySession();
    const goToDestination = vi.fn(async () => {
      throw new Error('destination failed');
    });
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfDocument: {
        getOutline: async () => [
          { title: 'Rejected page', dest: [1, { name: 'XYZ' }, 0, 500, null] },
        ],
      },
      pdfLinkService: { goToDestination },
    });
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    await settleReaderMicrotasks();
    created.session.focusAndHandle(readerKey('Enter').event);
    await settleReaderMicrotasks();

    expect(goToDestination).toHaveBeenCalledOnce();
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    expect(created.debug).toContain('outline navigation failed: Error: destination failed');
    created.session.dispose();
  });
});

describe('Reader mark history execution', () => {
  it('records one managed-final location for the completed scroll excursion', async () => {
    const execution = navigationHistoryPort();
    const created = createHistorySession({}, { navigationForReader: () => execution.port });
    const native = attachNativeReaderHistory(created);
    created.session.start();
    created.session.focusAndHandle(readerKey('m').event);
    created.session.focusAndHandle(readerKey('a').event);
    expect(created.session.marks.a).toBeDefined();
    native.container.scrollTop = 100;

    created.session.focusAndHandle(readerKey('`').event);
    created.session.focusAndHandle(readerKey('a').event);
    for (let turn = 0; turn < 8; turn += 1) {
      await Promise.resolve();
      created.animationFrameTasks.shift()?.();
    }
    await vi.waitFor(() => expect(execution.history.locations).toHaveLength(2));

    expect(execution.intents).toHaveLength(1);
    expect(execution.intents[0]).toMatchObject({
      cause: { kind: 'event', event: 'reader-mark.jump' },
      surface: 'reader',
      context: { readerPath: 'mark' },
    });
    expect(
      execution.history.locations.map((location) =>
        location.kind === 'reader' ? location.position?.top : null,
      ),
    ).toEqual([100, 1_045]);
    expect(native.nativeHistory._currentLocation).toEqual(native.nativeLocation(0, 500));
    created.session.dispose();
  });

  it.each(['x', ' '])(
    'retires a pending annotation mark after ordinary/prefix input %j',
    async (key) => {
      const execution = navigationHistoryPort();
      const created = createHistorySession({}, { navigationForReader: () => execution.port });
      const native = attachNativeReaderHistory(created);
      const annotation = {
        key: 'ANN-1',
        annotationPosition: JSON.stringify({ pageIndex: 0, rects: [[0, 0, 0, 200]] }),
      };
      const attachment = {
        id: 42,
        libraryID: 1,
        isAttachment: () => true,
        getAnnotations: () => [annotation],
      };
      Reflect.set(globalThis, 'Zotero', {
        Items: { get: (id: number) => (id === 42 ? attachment : false) },
      });
      Reflect.set(created.reader._internalReader ?? {}, '_state', {
        selectedAnnotationIDs: [annotation.key],
      });
      const { promise: pendingPage, resolve: resolvePage } = Promise.withResolvers<{
        getViewport: () => { width: number; height: number };
      }>();
      Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
        pdfViewer: native.viewer,
        pdfDocument: { getPage: () => pendingPage },
      });
      created.session.start();
      created.session.focusAndHandle(readerKey('m').event);
      created.session.focusAndHandle(readerKey('a').event);
      const mark = created.session.marks.a;
      if (!mark) throw new Error('Expected the saved mark');
      Reflect.set(mark, 'pageIndex', null);
      native.container.scrollTop = 100;

      created.session.focusAndHandle(readerKey('`').event);
      created.session.focusAndHandle(readerKey('a').event);
      const revision = execution.history.revision;
      created.session.focusAndHandle(readerKey(key).event);
      expect(execution.history.revision).toBe(revision);

      resolvePage({ getViewport: () => ({ width: 800, height: 1_000 }) });
      await settleReaderMicrotasks();

      expect(native.container.scrollTop).toBe(100);
      expect(execution.history.locations).toHaveLength(0);
      expect(native.nativeHistory._currentLocation).toEqual(native.nativeLocation(0, 500));
      created.session.dispose();
    },
  );
});

describe('PDF follow-link hints', () => {
  it('leaves composing Escape and label keys native without changing hints', () => {
    const created = createHistorySession();
    const { navigate } = configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    created.session.focusAndHandle(readerKey('f').event);
    const hints = [...linkHintElements(created)];
    for (const event of [
      readerKey('Escape', { isComposing: true }),
      readerKey('a', { keyCode: 229 }),
      readerKey('Process'),
    ]) {
      created.session.focusAndHandle(event.event);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
      expect(linkHintElements(created)).toEqual(hints);
    }
    expect(navigate).not.toHaveBeenCalled();
    created.session.focusAndHandle(readerKey('a').event);
    expect(navigate).toHaveBeenCalledWith({ position: linkPosition([0, 0, 0, 0], 1) });
    created.session.dispose();
  });

  it("claims only its captured pane and never activates that pane's badge in another view", () => {
    const created = createHistorySession();
    const primary = configureLinkView(created, [internalLink([10, 10, 80, 30], 7)]);
    const primaryHost = vi.fn();
    const secondaryHost = vi.fn();
    const secondaryNavigate = vi.fn();
    primary.view._onKeyDown = primaryHost;
    const secondaryWindow = {
      document: {
        getElementById: () => null,
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      focus: vi.fn(),
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as PdfWindow;
    const secondary = {
      _iframeWindow: secondaryWindow,
      _onKeyDown: secondaryHost,
      navigate: secondaryNavigate,
      getClientRectForPopup: (position: ReaderLinkPosition) => position.rects[0],
    };
    Reflect.set(created.reader._internalReader!, '_secondaryView', secondary);
    created.session.start();
    created.session.focusAndHandle(readerKey('f').event);
    primary.view._onKeyDown?.(readerKey('x').event);
    expect(primaryHost).not.toHaveBeenCalled();
    const native = readerKey('x').event;
    secondary._onKeyDown(native);
    expect(secondaryHost).toHaveBeenCalledExactlyOnceWith(native);

    Reflect.set(created.reader._internalReader!, '_lastViewPrimary', false);
    const other = readerKey('a');
    created.session.focusAndHandle(other.event);
    expect(other.preventDefault).not.toHaveBeenCalled();
    expect(primary.navigate).not.toHaveBeenCalled();
    expect(secondaryNavigate).not.toHaveBeenCalled();
    expect(linkHintElements(created)).toEqual([]);
    created.session.dispose();
  });

  it('retires hint ownership even when a live badge cannot be removed', () => {
    const created = createHistorySession();
    const { view } = configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    const native = vi.fn();
    view._onKeyDown = native;
    created.session.start();
    created.session.focusAndHandle(readerKey('f').event);
    const badge = linkHintElements(created)[0]!;
    vi.mocked(badge.remove).mockImplementationOnce(() => {
      throw new Error('live badge removal failed');
    });
    expect(() => created.session.focusAndHandle(readerKey('Escape').event)).toThrow(
      'live badge removal failed',
    );
    const key = readerKey('x').event;
    view._onKeyDown?.(key);
    expect(native).toHaveBeenCalledExactlyOnceWith(key);
    badge.remove();
    created.session.dispose();
  });

  it('releases a destroyed view without touching its dead badges, cue or RAF boundary', () => {
    const created = createHistorySession();
    const { view } = configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    const originalKey = vi.fn();
    view._onKeyDown = originalKey;
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();
    Reflect.set(created.reader, '_iframeWindow', created.readerWindow);
    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('a').event);
    const cue = destinationCueElement(created)!;
    created.session.focusAndHandle(readerKey('f').event);
    const badge = linkHintElements(created)[0]!;
    const dead = new Set<object>([created.pdfWindow, cue, badge]);
    const utils = Reflect.get(globalThis, 'Components').utils;
    utils.isDeadWrapper = (value: object) => dead.has(value);
    for (const node of [cue, badge]) {
      Object.defineProperty(node, 'remove', {
        get: () => {
          throw new Error('cannot access dead object');
        },
      });
    }
    Object.defineProperty(created.pdfWindow, 'cancelAnimationFrame', {
      get: () => {
        throw new Error('cannot access dead object');
      },
    });
    Reflect.set(created.reader._internalReader!, '_primaryView', undefined);
    created.intervalTasks[0]?.();
    const key = readerKey('x').event;
    view._onKeyDown?.(key);
    expect(originalKey).toHaveBeenCalledExactlyOnceWith(key);
    created.session.dispose();
    expect(view._onKeyDown).toBe(originalKey);
  });

  it('ignores a retired destination RAF and timer while a new cue awaits its own frame', () => {
    vi.useFakeTimers();
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const created = createHistorySession();
    const second = {
      ...internalLink([60, 10, 90, 30], 2),
      destinationPosition: linkPosition([220, 240, 260, 280], 2),
    };
    configureLinkView(created, [internalLink([10, 10, 40, 30]), second]);
    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('a').event);
    const retiredFrame = created.animationFrameTasks.shift()!;
    const retiredTimer = timers.mock.calls.find(([, delay]) => delay === 2000)![0] as () => void;
    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('s').event);
    const currentCue = destinationCueElement(created)!;
    expect(currentCue.hidden).toBe(true);
    retiredFrame();
    expect(currentCue.hidden).toBe(true);
    retiredTimer();
    expect(destinationCueElement(created)).toBe(currentCue);
    created.animationFrameTasks.shift()?.();
    expect(currentCue.style.left).toBe('220px');
    expect(currentCue.hidden).toBe(false);
    created.session.dispose();
    timers.mockRestore();
  });

  it('does not report a retired navigation failure into a newer hint invocation', async () => {
    const created = createHistorySession();
    const configured = configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    const pending = Promise.withResolvers<void>();
    configured.navigate.mockReturnValue(pending.promise);
    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('a').event);
    created.session.focusAndHandle(readerKey('f').event);
    const current = [...linkHintElements(created)];
    pending.reject(new Error('retired navigation failed'));
    await settleReaderMicrotasks();
    expect(created.debug).toEqual([]);
    expect(created.indicator.textContent).not.toBe('Link unavailable');
    expect(linkHintElements(created)).toEqual(current);
    created.session.dispose();
  });

  it('retires an activated link when its view is released after its badges were removed', async () => {
    const created = createHistorySession();
    const configured = configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    const pending = Promise.withResolvers<void>();
    configured.navigate.mockReturnValue(pending.promise);
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();
    Reflect.set(created.reader, '_iframeWindow', created.readerWindow);
    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('a').event);
    Reflect.set(created.reader._internalReader!, '_primaryView', undefined);
    created.intervalTasks[0]?.();
    pending.reject(new Error('released navigation failed'));
    await settleReaderMicrotasks();
    expect(created.debug).not.toContain(
      'reader follow link activation failed: Error: released navigation failed',
    );
    expect(created.indicator.textContent).not.toBe('Link unavailable');
    expect(destinationCueElement(created)).toBeNull();
    created.session.dispose();
  });

  it('clears the cue and retires pending activation on Reader deactivation', async () => {
    const created = createHistorySession();
    const configured = configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    const pending = Promise.withResolvers<void>();
    configured.navigate.mockReturnValue(pending.promise);
    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('a').event);
    expect(destinationCueElement(created)).not.toBeNull();
    created.session.deactivateInteraction();
    expect(destinationCueElement(created)).toBeNull();
    pending.reject(new Error('deactivated navigation failed'));
    await settleReaderMicrotasks();
    expect(created.debug).toEqual([]);
    created.session.focusAndHandle(readerKey('f').event);
    expect(linkHintElements(created).map((badge) => badge.textContent)).toEqual(['A']);
    created.session.dispose();
  });

  it('follows visible links and shows Zotero-preview-style point and rectangle cues', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    const internal = internalLink([20, 30, 80, 50], 4);
    const external = externalLink([100, 120, 180, 140], 'https://example.com');
    const citation = citationLink([200, 200, 260, 220], 8, [300, 320, 380, 340]);
    const configured = configureLinkView(created, [
      internal,
      internal,
      external,
      citation,
      internalLink([900, 30, 950, 50]),
    ]);
    const open = readerKey('f');

    created.session.focusAndHandle(open.event);

    expect(linkHintElements(created).map((badge) => badge.textContent)).toEqual(['A', 'S', 'D']);
    expect(created.bodyChildren).toHaveLength(3);
    expect(open.preventDefault).toHaveBeenCalledOnce();
    expect(open.stopImmediatePropagation).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('a').event);
    expect(created.cloneInto).toHaveBeenNthCalledWith(
      1,
      { position: internal.destinationPosition },
      created.readerWindow,
    );
    expect(configured.navigate).toHaveBeenNthCalledWith(1, {
      position: internal.destinationPosition,
    });
    created.animationFrameTasks.shift()?.();
    const pointCue = destinationCueElement(created);
    expect(pointCue?.style.cssText).toContain('background:#f57b7b');
    expect(pointCue?.style.cssText).toContain('mix-blend-mode:multiply');
    expect(pointCue?.style.width).toBe('14px');
    expect(pointCue?.style.height).toBe('14px');
    expect(pointCue?.style.borderRadius).toBe('50%');

    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('s').event);
    expect(configured.openLink).toHaveBeenCalledWith('https://example.com');
    expect(destinationCueElement(created)).toBeNull();

    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('d').event);
    expect(created.cloneInto).toHaveBeenNthCalledWith(
      2,
      { position: citation.references[0]!.position },
      created.readerWindow,
    );
    expect(configured.navigate).toHaveBeenNthCalledWith(2, {
      position: citation.references[0]!.position,
    });
    created.animationFrameTasks.shift()?.();
    const rectangleCue = destinationCueElement(created);
    expect(rectangleCue?.style.left).toBe('300px');
    expect(rectangleCue?.style.top).toBe('320px');
    expect(rectangleCue?.style.width).toBe('80px');
    expect(rectangleCue?.style.height).toBe('20px');
    expect(rectangleCue?.style.borderRadius).toBe('0');

    vi.advanceTimersByTime(2000);
    expect(destinationCueElement(created)).toBeNull();
    expect(created.bodyChildren).toHaveLength(0);
    created.session.dispose();
  });

  it('records confirmed internal links under followLink origin and leaves external links unrecorded', async () => {
    const execution = navigationHistoryPort();
    const created = createHistorySession({}, { navigationForReader: () => execution.port });
    const native = attachNativeReaderHistory(created);
    const internal = internalLink([20, 30, 80, 50], 4);
    const external = externalLink([100, 120, 180, 140], 'https://example.com');
    const configured = configureLinkView(created, [internal, external]);
    const navigate = vi.fn((location: { readonly position: ReaderLinkPosition }) => {
      const pageNumber = location.position.pageIndex + 1;
      native.viewer.currentPageNumber = pageNumber;
      native.container.scrollTop = 700;
      native.viewer._location = { pageNumber, top: 700, left: 0 };
      return native.view._pushHistoryPoint?.();
    });
    const openLink = vi.fn();
    Reflect.set(configured.view, 'navigate', navigate);
    Reflect.set(configured.view, '_onOpenLink', openLink);
    created.session.start();

    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('a').event);
    for (let turn = 0; turn < 12; turn += 1) {
      await Promise.resolve();
      created.animationFrameTasks.shift()?.();
    }
    await vi.waitFor(() => expect(execution.history.locations).toHaveLength(2));

    expect(navigate).toHaveBeenCalledOnce();
    expect(execution.intents[0]).toMatchObject({
      cause: { kind: 'action', action: 'followLink' },
      surface: 'reader',
      context: { readerPath: 'internal-link' },
    });
    expect(Object.isFrozen(execution.intents[0]?.cause)).toBe(true);
    expect(
      execution.history.locations.map((location) =>
        location.kind === 'reader' ? location.position?.pageIndex : null,
      ),
    ).toEqual([0, 4]);

    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('s').event);

    expect(openLink).toHaveBeenCalledWith('https://example.com');
    expect(execution.intents[1]).toMatchObject({
      cause: { kind: 'action', action: 'followLink' },
      surface: 'reader',
      context: { readerPath: 'external-link' },
    });
    expect(execution.history.locations).toHaveLength(2);
    created.session.dispose();
  });
  it('keeps a newer destination cue after an older confirmation rejects late', async () => {
    const created = createHistorySession();
    const first = internalLink([10, 10, 40, 30], 1);
    const second = {
      ...internalLink([60, 10, 90, 30], 2),
      destinationPosition: linkPosition([220, 240, 260, 280], 2),
    };
    const configured = configureLinkView(created, [first, second]);
    const { promise: pendingFirst, reject: rejectFirst } = Promise.withResolvers<void>();
    configured.navigate.mockReturnValueOnce(pendingFirst).mockResolvedValueOnce(undefined);

    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('a').event);
    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('s').event);
    const newerCue = destinationCueElement(created);
    expect(newerCue).not.toBeNull();
    while (created.animationFrameTasks.length) created.animationFrameTasks.shift()?.();
    expect(newerCue?.style.left).toBe('220px');

    rejectFirst(new Error('late old rejection'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(destinationCueElement(created)).toBe(newerCue);
    expect(created.debug).toEqual([]);
    expect(created.indicator.textContent).not.toBe('Link unavailable');
    created.session.dispose();
  });
  it('uses the active secondary PDF view for split-reader navigation', () => {
    const created = createHistorySession();
    const primary = created.reader._internalReader?._primaryView;
    const internal = created.reader._internalReader;
    if (!primary || !internal) throw new Error('Expected reader views');
    Reflect.set(primary, '_iframeWindow', {} as Window);
    const navigate = vi.fn();
    const secondary = {
      _iframeWindow: created.pdfWindow,
      _pdfPages: { 0: { overlays: [internalLink([10, 10, 40, 30], 7)] } },
      getClientRectForPopup: (position: ReaderLinkPosition) => position.rects[0],
      navigate,
    } as ReaderViewRuntime;
    Reflect.set(internal, '_secondaryView', secondary);

    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('a').event);

    expect(navigate).toHaveBeenCalledWith({
      position: linkPosition([0, 0, 0, 0], 7),
    });
  });

  it('keeps more than one alphabet of hints reachable and cleans up on Backspace and Escape', () => {
    const created = createHistorySession();
    const overlays = Array.from({ length: 27 }, (_, index) =>
      internalLink(
        [
          10 + (index % 9) * 70,
          20 + Math.floor(index / 9) * 80,
          50 + (index % 9) * 70,
          40 + Math.floor(index / 9) * 80,
        ],
        index + 1,
      ),
    );
    const { navigate } = configureLinkView(created, overlays);

    created.session.focusAndHandle(readerKey('f').event);

    expect(new Set(linkHintElements(created).map((badge) => badge.textContent)).size).toBe(27);
    expect(linkHintElements(created).every((badge) => (badge.textContent ?? '').length === 2)).toBe(
      true,
    );

    created.session.focusAndHandle(readerKey('a').event);
    expect(navigate).not.toHaveBeenCalled();
    expect(linkHintElements(created).filter((badge) => !badge.hidden)).toHaveLength(26);

    created.session.focusAndHandle(readerKey('Backspace').event);
    expect(linkHintElements(created).every((badge) => !badge.hidden)).toBe(true);

    const escape = readerKey('Escape');
    created.session.focusAndHandle(escape.event);
    expect(linkHintElements(created)).toHaveLength(0);
    expect(created.bodyChildren).toHaveLength(0);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
  });
  it('removes link hints when Zotero replaces their PDF view', () => {
    const created = createHistorySession();
    configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();
    created.session.focusAndHandle(readerKey('f').event);
    expect(linkHintElements(created)).toHaveLength(1);

    Reflect.set(created.reader._internalReader ?? {}, '_primaryView', undefined);
    created.intervalTasks[0]?.();

    expect(linkHintElements(created)).toHaveLength(0);
    expect(created.bodyChildren).toHaveLength(0);
    created.session.dispose();
  });

  it('contains missing, empty, and throwing private link seams', async () => {
    vi.useFakeTimers();
    const missing = createHistorySession();
    const missingView = missing.reader._internalReader?._primaryView;
    if (!missingView) throw new Error('Expected a primary reader view');
    Object.defineProperty(missingView, '_pdfPages', {
      configurable: true,
      get: () => {
        throw new Error('reader reloaded');
      },
    });
    expect(() => missing.session.focusAndHandle(readerKey('f').event)).not.toThrow();
    expect(missing.indicator.textContent).toBe('Link hints unavailable');
    expect(missing.debug).toEqual(['reader follow link discovery failed: Error: reader reloaded']);
    expect(missing.diagnostics).toEqual([
      'reader follow link discovery failed: Error: reader reloaded',
    ]);

    const empty = createHistorySession();
    configureLinkView(empty, []);
    empty.session.focusAndHandle(readerKey('f').event);
    expect(empty.indicator.textContent).toBe('No visible links');

    const failed = createHistorySession();
    const configured = configureLinkView(failed, [
      externalLink([10, 10, 80, 30], 'https://example.com'),
    ]);
    Reflect.set(configured.view, '_onOpenLink', () => {
      throw new Error('blocked URI');
    });
    failed.session.focusAndHandle(readerKey('f').event);
    expect(() => failed.session.focusAndHandle(readerKey('a').event)).not.toThrow();
    await settleReaderMicrotasks();
    expect(failed.indicator.textContent).toBe('Link unavailable');
    expect(failed.debug).toEqual(['reader follow link activation failed: Error: blocked URI']);
    expect(failed.diagnostics).toEqual([
      'reader follow link activation failed: Error: blocked URI',
    ]);

    const rejected = createHistorySession();
    const rejectedView = configureLinkView(rejected, [internalLink([10, 10, 80, 30])]);
    Reflect.set(rejectedView.view, 'navigate', async () => {
      throw new Error('navigation rejected');
    });
    rejected.session.focusAndHandle(readerKey('f').event);
    rejected.session.focusAndHandle(readerKey('a').event);
    await settleReaderMicrotasks();
    expect(rejected.indicator.textContent).toBe('Link unavailable');
    expect(rejected.debug).toEqual([
      'reader follow link activation failed: Error: navigation rejected',
    ]);
    expect(rejected.diagnostics).toEqual([
      'reader follow link activation failed: Error: navigation rejected',
    ]);
    vi.clearAllTimers();
  });

  it('leaves native ownership and editable controls native and drops stale link hints on focus change', () => {
    const created = createHistorySession({}, {}, DEFAULT_BINDINGS, () => {}, {
      [ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY]: false,
    });
    configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    created.session.focusAndHandle(readerKey('i').event);
    const insert = readerKey('f');
    created.session.focusAndHandle(insert.event);
    expect(linkHintElements(created)).toHaveLength(0);
    expect(insert.preventDefault).not.toHaveBeenCalled();

    created.session.focusAndHandle(readerKey('Escape').event);
    const input = { tagName: 'INPUT', localName: 'input' } as unknown as EventTarget;
    const editable = readerKey('f', { target: input });
    created.session.focusAndHandle(editable.event);
    expect(linkHintElements(created)).toHaveLength(0);
    expect(editable.preventDefault).not.toHaveBeenCalled();

    created.session.focusAndHandle(readerKey('f').event);
    const focusedInput = readerKey('a', { target: input });
    created.session.focusAndHandle(focusedInput.event);
    expect(linkHintElements(created)).toHaveLength(0);
    expect(focusedInput.preventDefault).not.toHaveBeenCalled();
  });
});
