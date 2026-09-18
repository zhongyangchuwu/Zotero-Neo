import { describe, expect, it, vi } from 'vitest';

import type { ActionId } from '../../src/input/actions';
import type { ReaderDelegableMainAction } from '../../src/main/action-capabilities';
import type {
  MainWindow,
  MainWindowControllerApi,
  MainWindowControllerDependencies,
} from '../../src/core/contracts';
import { KEY_GUIDE_CONFIG } from '../../src/input/key-guide-config';
import { DEFAULT_BINDINGS, resolveBindings } from '../../src/input/bindings';

import { NoteEditor } from '../../src/main/note-editor';
import { createMainWindowController } from '../../src/main/controller';
import { ReaderSession, createReaderController } from '../../src/reader/controller';
import type { InternalReaderRuntime, PdfWindow, ReaderRuntime } from '../../src/reader/types';
import {
  MainNavigation,
  selectedCollection,
  selectedCollectionID,
  type TreeView,
} from '../../src/main/navigation';
import type { MainWindowSession } from '../../src/main/session';

const logger = { debug: () => {}, diagnostic: () => {} };

function statusElement() {
  return {
    style: {
      cssText: '',
      display: '',
      background: '',
      color: '',
      colorScheme: '',
      getPropertyValue: () => '',
      setProperty: () => {},
    },
    getAttribute: () => null,
    setAttribute: () => {},
    remove: () => {},
  };
}
function pickerMainWindow(): {
  window: MainWindow;
  bodyChildren: HTMLElement[];
  keydown: (event: Event) => void;
} {
  const bodyChildren: HTMLElement[] = [];
  let document: Document;
  let keydown: EventListener | undefined;
  const createElement = (tag: string): HTMLElement => {
    const children: HTMLElement[] = [];
    const listeners = new Map<string, EventListener[]>();
    let textContent = '';
    const element = {
      tagName: tag.toUpperCase(),
      localName: tag,
      ownerDocument: null as unknown as Document,
      parentElement: null as HTMLElement | null,
      style: {
        getPropertyValue: () => '',
        setProperty: () => {},
      } as unknown as CSSStyleDeclaration,
      children,
      dataset: {} as DOMStringMap,
      value: '',
      type: '',
      placeholder: '',
      tabIndex: 0,
      clientHeight: 400,
      isConnected: true,
      get textContent() {
        return textContent;
      },
      set textContent(value: string) {
        textContent = value;
      },
      set innerHTML(value: string) {
        textContent = value.replace(/<[^>]*>/g, '');
      },
      setAttribute: (name: string, value: string) => Reflect.set(element, name, value),
      getAttribute: () => null,
      append: (...nodes: HTMLElement[]) => {
        for (const node of nodes) Reflect.set(node, 'parentElement', element);
        children.push(...nodes);
      },
      appendChild: (node: HTMLElement) => {
        Reflect.set(node, 'parentElement', element);
        children.push(node);
      },
      replaceChildren: (...nodes: HTMLElement[]) => {
        for (const child of children) Reflect.set(child, 'parentElement', null);
        for (const node of nodes) Reflect.set(node, 'parentElement', element);
        children.splice(0, children.length, ...nodes);
      },
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      removeEventListener: () => {},
      closest: (selector: string) => {
        if (selector === '[data-zv-picker-row="1"]' && element.dataset.zvPickerRow === '1')
          return element as unknown as HTMLElement;
        return element.parentElement?.closest?.(selector) ?? null;
      },
      emit: (type: string, event: Partial<Event> = {}) => {
        let stopped = false;
        const synthetic = {
          ...event,
          target: event.target ?? element,
          preventDefault: () => event.preventDefault?.(),
          stopPropagation: () => {
            stopped = true;
            event.stopPropagation?.();
          },
          stopImmediatePropagation: () => {
            stopped = true;
            event.stopImmediatePropagation?.();
          },
        } as Event;
        for (const listener of listeners.get(type) ?? []) listener(synthetic);
        if (!stopped)
          (
            element.parentElement as
              | (HTMLElement & { emit?: (type: string, event?: Event) => void })
              | null
          )?.emit?.(type, synthetic);
      },
      focus: () => {
        Reflect.set(document, 'activeElement', element);
      },
      select: vi.fn(),
      scrollBy: vi.fn(),
      scrollIntoView: vi.fn(),
      remove: () => {
        const index = bodyChildren.indexOf(element as unknown as HTMLElement);
        if (index >= 0) bodyChildren.splice(index, 1);
      },
    };
    element.ownerDocument = document;
    return element as unknown as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
  };
  document = {
    defaultView: null,
    activeElement: null,
    createElement: (tag: string) => createElement(tag),
    createElementNS: (_namespace: string, tag: string) => createElement(tag),
    head: { appendChild: (node: HTMLElement) => bodyChildren.push(node) },
    body: {
      append: (node: HTMLElement) => bodyChildren.push(node),
      appendChild: (node: HTMLElement) => bodyChildren.push(node),
    },
    documentElement: {
      append: (node: HTMLElement) => bodyChildren.push(node),
      appendChild: (node: HTMLElement) => bodyChildren.push(node),
    },
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'keydown') keydown = listener;
    },
    removeEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  } as unknown as Document;
  const window = {
    document,
    innerWidth: 1200,
    Zotero_Tabs: { _tabs: [{ id: 'tab-b', title: 'Reader B' }], selectedID: 'tab-b' },
    addEventListener: () => {},
    removeEventListener: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout,
    clearTimeout,
  } as unknown as MainWindow;
  Reflect.set(document, 'defaultView', window);
  return { window, bodyChildren, keydown: (event) => keydown?.(event) };
}

describe('current Zotero collection APIs', () => {
  it('uses plural collection selection methods for object and ID lookup', () => {
    const collection = { id: 42 } as Zotero.Collection;
    const view = {
      getSelectedCollections: (idOnly?: boolean) => (idOnly ? [42] : [collection]),
    } as TreeView;

    expect(selectedCollection(view)).toBe(collection);
    expect(selectedCollectionID(view)).toBe(42);
  });

  it('navigates a collection tree whose React tree object has no contains method', () => {
    let selected = 2;
    const active = { id: 'collection-tree-row-2' } as Element;
    const view: TreeView = {
      tree: { focus: () => {} },
      domEl: { contains: (node: unknown) => node === active } as HTMLElement,
      rowCount: 6,
      selection: {
        count: 1,
        focused: selected,
        select: (index) => {
          selected = index;
        },
      },
      ensureRowIsVisible: () => {},
    };
    const window = {
      document: {
        activeElement: active,
        getElementById: () => null,
        querySelector: () => null,
      },
      ZoteroPane: { collectionsView: view },
    } as unknown as MainWindow;
    const session = { activePanel: 'items' } as MainWindowSession;
    const navigation = new MainNavigation(logger, () => {});

    navigation.navigate(window, session, 1, 1);

    expect(selected).toBe(3);
    expect(session.activePanel).toBe('collections');
  });

  it('uses Zotero repeat debouncing and native selection scrolling for held j/k', () => {
    const active = { id: 'collection-tree-row-2' } as Element;
    const select = vi.fn();
    const ensureRowIsVisible = vi.fn();
    const view: TreeView = {
      tree: { focus: () => {} },
      domEl: { contains: (node: unknown) => node === active } as HTMLElement,
      rowCount: 6,
      selection: { count: 1, focused: 2, select },
      ensureRowIsVisible,
    };
    const window = {
      document: {
        activeElement: active,
        getElementById: () => null,
        querySelector: () => null,
      },
      ZoteroPane: { collectionsView: view },
    } as unknown as MainWindow;
    const session = { activePanel: 'items' } as MainWindowSession;
    const navigation = new MainNavigation(logger, () => {});

    navigation.navigate(window, session, 1, 1, true);

    expect(select).toHaveBeenCalledWith(3, true);
    expect(ensureRowIsVisible).not.toHaveBeenCalled();
    expect(session.activePanel).toBe('collections');
  });
});

describe('main item trash and restore', () => {
  it('maps dd/x to trash and u to the matching native undo step', async () => {
    const originalZotero = Reflect.get(globalThis, 'Zotero');
    const active = { id: 'item-tree-row-1' } as Element;
    const itemsRoot = { contains: (node: unknown) => node === active } as HTMLElement;
    const selected = [{ id: 41 }, { id: 42 }] as Zotero.Item[];
    const trashTx = vi.fn(async () => {});
    const undo = vi.fn(async () => true);
    const window = {
      document: {
        activeElement: active,
        getElementById: () => null,
        querySelector: () => null,
      },
      ZoteroPane: {
        itemsView: { domEl: itemsRoot },
        getSelectedItems: () => selected,
      },
    } as unknown as MainWindow;
    const session = {
      window: { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() },
      activePanel: 'items',
      trashedItemIDs: [],
      status: { textContent: '', style: {} },
      cleanup: { add: () => {} },
    } as unknown as MainWindowSession;
    const navigation = new MainNavigation(logger, () => {});
    try {
      Reflect.set(globalThis, 'Zotero', {
        Items: { trashTx, get: () => false },
        UndoHistory: { getUndoAction: () => ({ action: 'undo-action-trash' }), undo },
      });

      await navigation.trashSelectedItems(window, session);
      expect(trashTx).toHaveBeenCalledWith([41, 42]);
      expect(session.trashedItemIDs).toEqual([41, 42]);
      await navigation.restoreLastTrashedItems(session);

      expect(undo).toHaveBeenCalledOnce();
      expect(session.trashedItemIDs).toEqual([]);
      Reflect.set(window.document, 'activeElement', { id: 'zotero-item-pane' });
      await navigation.trashSelectedItems(window, session);
      expect(trashTx).toHaveBeenCalledTimes(1);
      expect(session.status.textContent).toBe('✗ Focus the items list first');
      expect(DEFAULT_BINDINGS).toMatchObject({
        'main-normal:dd': 'mainTrashItems',
        'main-normal:x': 'mainTrashItems',
        'main-normal:u': 'mainRestoreTrashedItems',
      });
    } finally {
      if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
      else Reflect.set(globalThis, 'Zotero', originalZotero);
    }
  });
});
describe('directional pane focus', () => {
  it('uses Ctrl-h/j/k/l defaults to select the nearest visible pane without wrapping', () => {
    let active: Element | null = null;
    const pane = (left: number, top: number, right: number, bottom: number) => {
      const element = {
        hidden: false,
        getAttribute: () => null,
        getBoundingClientRect: () => ({
          left,
          top,
          right,
          bottom,
          width: right - left,
          height: bottom - top,
        }),
        contains: (node: unknown) => node === element,
        querySelector: () => null,
        focus: () => {
          active = element as unknown as Element;
        },
      };
      return element as unknown as HTMLElement;
    };
    const collections = pane(0, 0, 100, 300);
    const items = pane(150, 0, 350, 180);
    const details = pane(150, 220, 350, 420);
    const context = pane(400, 220, 600, 420);
    active = collections;
    const document = {
      get activeElement() {
        return active;
      },
      getElementById: (id: string) =>
        id === 'zotero-item-pane' ? details : id === 'zotero-context-pane' ? context : null,
      querySelector: () => null,
    } as unknown as Document;
    const window = {
      document,
      ZoteroPane: {
        collectionsView: { domEl: collections },
        itemsView: { domEl: items },
      },
      ZoteroContextPane: { focus: () => context.focus() },
    } as unknown as MainWindow;
    const session = { activePanel: 'collections' } as MainWindowSession;
    const navigation = new MainNavigation(logger, () => {});

    expect(DEFAULT_BINDINGS).toMatchObject({
      'main-normal:ctrl+h': 'focusReaderSplitLeft',
      'main-normal:ctrl+j': 'focusReaderSplitDown',
      'main-normal:ctrl+k': 'focusReaderSplitUp',
      'main-normal:ctrl+l': 'focusReaderSplitRight',
    });
    expect(navigation.focusDirection(window, session, 'right')).toBe(true);
    expect(active).toBe(items);
    expect(navigation.focusDirection(window, session, 'down')).toBe(true);
    expect(active).toBe(details);
    expect(navigation.focusDirection(window, session, 'right')).toBe(true);
    expect(active).toBe(context);
    expect(navigation.focusDirection(window, session, 'left')).toBe(true);
    expect(active).toBe(details);
    expect(navigation.focusDirection(window, session, 'up')).toBe(true);
    expect(active).toBe(items);
    expect(navigation.focusDirection(window, session, 'up')).toBe(false);
    expect(active).toBe(items);
  });

  it('leaves Ctrl-h native when no reader target exists and consumes it after reader focus succeeds', () => {
    const originalZotero = Reflect.get(globalThis, 'Zotero');
    const focusReader = vi.fn();
    const document = {
      activeElement: null,
      getElementById: () => null,
      querySelector: () => null,
    } as unknown as Document;
    const window = {
      document,
      Zotero_Tabs: { selectedID: 'reader-tab' },
    } as unknown as MainWindow;
    const session = {
      note: { mode: 'normal', buffer: '', count: '', timer: undefined, inputRevision: 0, yank: '' },
    } as MainWindowSession;
    const editor = new NoteEditor(
      logger,
      new MainNavigation(logger, () => {}),
      () => DEFAULT_BINDINGS,
      {
        refresh: () => {},
        clear: () => {},
      },
    );
    const target = {
      tagName: 'DIV',
      localName: 'div',
      isContentEditable: true,
      parentElement: null,
    } as unknown as EventTarget;
    const keyEvent = () => {
      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      return {
        event: {
          key: 'h',
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
          target,
          preventDefault,
          stopPropagation,
        } as unknown as KeyboardEvent,
        preventDefault,
        stopPropagation,
      };
    };
    try {
      Reflect.set(globalThis, 'Zotero', { Reader: { getByTabID: () => null } });
      const missing = keyEvent();
      editor.onKeyDown(missing.event, window, session, () => {});
      expect(missing.preventDefault).not.toHaveBeenCalled();

      Reflect.set(globalThis, 'Zotero', {
        Reader: { getByTabID: () => ({ focus: focusReader }) },
      });
      const available = keyEvent();
      editor.onKeyDown(available.event, window, session, () => {});
      expect(focusReader).toHaveBeenCalledOnce();
      expect(available.preventDefault).toHaveBeenCalledOnce();
      expect(available.stopPropagation).toHaveBeenCalledOnce();
    } finally {
      if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
      else Reflect.set(globalThis, 'Zotero', originalZotero);
    }
  });
});

describe('NoteEditor shared binding input', () => {
  function harness(overrides: Readonly<Record<string, ActionId | null>> = {}) {
    vi.useFakeTimers();
    const main = {
      setTimeout,
      clearTimeout,
      document: {
        activeElement: null,
        querySelector: () => null,
        getElementById: () => null,
      },
    } as unknown as MainWindow;
    const document = {
      getSelection: () => null,
      getElementById: () => null,
      createElement: () => ({ id: '', textContent: '' }),
      head: { append: () => {} },
      documentElement: { append: () => {}, classList: { toggle: () => {} } },
    } as unknown as Document;
    const target = {
      tagName: 'DIV',
      localName: 'div',
      isContentEditable: true,
      parentElement: null,
      ownerDocument: document,
    } as unknown as HTMLElement;
    const session = {
      window: main,
      status: { textContent: '', style: { display: '', color: '', background: '' } },
      cleanup: { add: () => {} },
      note: {
        editorWindow: null,
        editorDocument: null,
        handler: null,
        mode: 'normal',
        buffer: '',
        count: '',
        timer: undefined,
        inputRevision: 0,
        yank: '',
      },
    } as unknown as MainWindowSession;
    const bindings = resolveBindings(JSON.stringify(overrides));
    const guide = { refresh: vi.fn(), clear: vi.fn() };
    const editor = new NoteEditor(
      logger,
      new MainNavigation(logger, () => {}),
      () => bindings,
      guide,
    );
    const actions: [ActionId, number][] = [];
    const press = (key: string, modifiers: Partial<KeyboardEvent> = {}) => {
      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      editor.onKeyDown(
        {
          key,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          target,
          preventDefault,
          stopPropagation,
          ...modifiers,
        } as unknown as KeyboardEvent,
        main,
        session,
        (action, count) => {
          actions.push([action, count]);
          return true;
        },
      );
      return { preventDefault, stopPropagation };
    };
    return { editor, session, target, main, actions, press, guide };
  }

  it('resolves Note-scoped ambiguous leader remaps on continuation or timeout', () => {
    const test = harness({
      'note-normal: f': 'mainNextTab',
      'note-normal: ff': 'mainPrevTab',
    });

    test.press(' ');
    test.press('f');
    test.press('f');
    expect(test.actions).toEqual([['mainPrevTab', 0]]);
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(test.actions).toEqual([['mainPrevTab', 0]]);

    test.press(' ');
    test.press('f');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(test.actions).toEqual([
      ['mainPrevTab', 0],
      ['mainNextTab', 0],
    ]);
    vi.useRealTimers();
  });

  it('uses one reducer state for local prefixes and counts', () => {
    const test = harness();

    test.press('3');
    test.press('g');
    expect(test.session.note.count).toBe('3');
    expect(test.session.note.buffer).toBe('g');

    test.press('Escape');
    expect(test.session.note.count).toBe('');
    expect(test.session.note.buffer).toBe('');
    expect(test.actions).toEqual([]);
    vi.useRealTimers();
  });

  it('keeps Note-local keys local while explicit global Note bindings dispatch externally', () => {
    const test = harness();

    const lowerH = test.press('h');
    expect(lowerH.preventDefault).not.toHaveBeenCalled();
    expect(test.actions).toEqual([]);

    test.press('H');
    expect(test.actions).toEqual([['mainPrevTab', 0]]);

    const retired = test.press('J');
    expect(retired.preventDefault).not.toHaveBeenCalled();
    expect(test.actions).toEqual([['mainPrevTab', 0]]);
    vi.useRealTimers();
  });

  it('keeps unbound Insert text native while Escape returns to Note Normal', () => {
    const test = harness();

    test.press('i');
    expect(test.session.note.mode).toBe('insert');

    const native = test.press('f');
    expect(native.preventDefault).not.toHaveBeenCalled();
    expect(native.stopPropagation).not.toHaveBeenCalled();

    const escape = test.press('Escape');
    expect(test.session.note.mode).toBe('normal');
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('launches the Note command palette action without propagating a count', () => {
    const test = harness();
    test.press('3');
    const colon = test.press(':');

    expect(test.actions).toEqual([['openCommandPalette', 0]]);
    expect(colon.preventDefault).toHaveBeenCalledOnce();
    expect(test.session.note.count).toBe('');
    vi.useRealTimers();
  });

  it('keeps Ctrl-h native when no reader target exists and consumes after reader focus succeeds', () => {
    const originalZotero = Reflect.get(globalThis, 'Zotero');
    const focusReader = vi.fn();
    const test = harness();
    try {
      Reflect.set(globalThis, 'Zotero', { Reader: { getByTabID: () => null } });
      const missing = test.press('h', { ctrlKey: true });
      expect(missing.preventDefault).not.toHaveBeenCalled();

      Reflect.set(globalThis, 'Zotero', {
        Reader: { getByTabID: () => ({ focus: focusReader }) },
      });
      const available = test.press('h', { ctrlKey: true });
      expect(focusReader).toHaveBeenCalledOnce();
      expect(available.preventDefault).toHaveBeenCalledOnce();
    } finally {
      if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
      else Reflect.set(globalThis, 'Zotero', originalZotero);
      vi.useRealTimers();
    }
  });
});

describe('Main command palette', () => {
  it('opens through the canonical ActionId path in the owner window', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const host = pickerMainWindow();
    const controller = createMainWindowController({
      preferences: {
        has: () => false,
        get: (_key, fallback) => fallback,
        set: () => {},
      },
      logger,
      reader: { start: () => {}, shutdown: () => {}, rescan: () => {}, forwardKey: () => {} },
    } as MainWindowControllerDependencies);
    controller.addWindow(host.window);

    const colon = {
      key: ':',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    host.keydown(colon);
    await vi.waitFor(() =>
      expect(host.bodyChildren.some((child) => child.id === 'zv-picker-overlay')).toBe(true),
    );
    controller.shutdown();
  });
});

describe('Main tab picker routing', () => {
  it('opens the Tabs picker from the Main owner binding', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const host = pickerMainWindow();
    Reflect.set(host.window, 'Zotero_Tabs', {
      _tabs: [
        { id: 'library', title: 'Library', type: 'library' },
        { id: 'reader', title: 'Reader', type: 'reader' },
      ],
      selectedID: 'library',
    });
    const controller = createMainWindowController({
      preferences: {
        has: () => false,
        get: (_key, fallback) => fallback,
        set: () => {},
      },
      logger,
      reader: { start: () => {}, shutdown: () => {}, rescan: () => {}, forwardKey: () => {} },
    } as MainWindowControllerDependencies);
    controller.addWindow(host.window);

    const press = (key: string): void =>
      host.keydown({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      } as unknown as KeyboardEvent);

    press(' ');
    press('f');
    press('t');
    await vi.waitFor(() =>
      expect(host.bodyChildren.some((child) => child.id === 'zv-picker-overlay')).toBe(true),
    );
    const overlay = host.bodyChildren.find((child) => child.id === 'zv-picker-overlay');
    const title =
      overlay?.children[0]?.children[0]?.children[0]?.children[0]?.children[0]?.textContent;
    expect(title).toBe('Tabs');
    controller.shutdown();
  });
});

describe('Reader to Main command palette integration', () => {
  it('keeps Reader ownership, active split execution, and picker chaining end to end', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const owner = pickerMainWindow();
    const other = pickerMainWindow();
    Reflect.set(owner.window, 'Zotero_Tabs', {
      _tabs: [{ id: 'reader-tab', title: 'Reader', type: 'reader' }],
      selectedID: 'reader-tab',
    });
    Reflect.set(other.window, 'Zotero_Tabs', {
      _tabs: [{ id: 'other-tab', title: 'Other', type: 'library' }],
      selectedID: 'other-tab',
    });

    const primary = {
      document: owner.window.document,
      innerWidth: 800,
      innerHeight: 600,
      focus: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: () => 0,
      clearInterval: () => {},
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      getSelection: () => ({ isCollapsed: true }),
    } as unknown as PdfWindow;
    const secondary = {
      ...primary,
      focus: vi.fn(),
    } as unknown as PdfWindow;
    const primaryOriginal = vi.fn();
    const secondaryOriginal = vi.fn();
    const zoomIn = vi.fn(function (this: InternalReaderRuntime) {
      expect(this._lastViewPrimary).toBe(false);
    });
    const internal = {
      _primaryView: { _iframeWindow: primary, _onKeyDown: primaryOriginal },
      _secondaryView: { _iframeWindow: secondary, _onKeyDown: secondaryOriginal },
      _lastViewPrimary: false,
      zoomIn,
    } as unknown as InternalReaderRuntime;
    const reader = {
      _instanceID: 'reader-owner',
      itemID: 17,
      _window: owner.window,
      _iframeWindow: owner.window,
      _internalReader: internal,
    } as unknown as ReaderRuntime;
    const readerService = {
      _readers: [reader],
      registerEventListener: vi.fn(() => Symbol('reader-listener')),
      unregisterEventListener: vi.fn(),
      getByTabID: vi.fn((tabID: string) => (tabID === 'reader-tab' ? reader : null)),
    };
    const preferences = {
      has: () => false,
      get: (_key: string, fallback: boolean | number | string) => fallback,
      set: () => {},
    } as unknown as MainWindowControllerDependencies['preferences'];
    Reflect.set(globalThis, 'Zotero', {
      Reader: readerService,
      Items: { get: () => false, getAll: async () => [] },
      Libraries: { userLibraryID: 1 },
      locale: 'en-US',
    });

    let main: MainWindowControllerApi | null = null;
    const readerController = createReaderController({
      preferences,
      logger,
      delegateMain: (action, count, ownerWindow) =>
        main?.executeFromReader(action, count, ownerWindow),
      openCommandPalette: (window, context) => main?.openCommandPalette(window, context),
    });
    main = createMainWindowController({ preferences, logger, reader: readerController });
    readerController.start('zotero-neo@zotero-neo');
    main.addWindow(owner.window);
    main.addWindow(other.window);

    const overlayFor = (host: { bodyChildren: HTMLElement[] }): HTMLElement | null =>
      host.bodyChildren.find((child) => child.id === 'zv-picker-overlay') ?? null;
    const pickerParts = (host: { bodyChildren: HTMLElement[] }) => {
      const overlay = overlayFor(host);
      const left = overlay?.children[0]?.children[0]?.children[0];
      if (!left) throw new Error('Expected mounted picker left pane');
      return {
        input: left.children[1] as HTMLElement & {
          value: string;
          emit(type: string, event?: Partial<Event>): void;
        },
        results: left.children[3] as HTMLElement,
        title: left.children[0]?.children[0]?.textContent ?? '',
      };
    };
    const key = (value: string, target: EventTarget | null = null): KeyboardEvent =>
      ({
        key: value,
        target,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      }) as unknown as KeyboardEvent;

    owner.keydown(key(':'));
    await vi.waitFor(() => expect(overlayFor(owner)).not.toBeNull());
    await vi.waitFor(() => expect(pickerParts(owner).results.children.length).toBeGreaterThan(0));
    const readerCommands = pickerParts(owner);
    readerCommands.input.value = 'Zoom in';
    readerCommands.input.emit('input');
    owner.keydown(key('Enter', readerCommands.results));
    await vi.waitFor(() => expect(zoomIn).toHaveBeenCalledOnce());
    expect(overlayFor(owner)).toBeNull();
    expect(overlayFor(other)).toBeNull();

    owner.keydown(key(':'));
    await vi.waitFor(() => expect(overlayFor(owner)).not.toBeNull());
    const mainCommands = pickerParts(owner);
    mainCommands.input.value = 'all items';
    mainCommands.input.emit('input');
    owner.keydown(key('Enter', mainCommands.results));
    await vi.waitFor(() => expect(pickerParts(owner).title).toBe('All items'));
    expect(overlayFor(other)).toBeNull();

    main.removeWindow(owner.window);
    expect(overlayFor(owner)).toBeNull();
    owner.keydown(key(':'));
    await Promise.resolve();
    expect(overlayFor(owner)).toBeNull();
    expect(overlayFor(other)).toBeNull();

    readerController.shutdown();
    main.shutdown();
  });
});
describe('Main H/L tab defaults', () => {
  it('switches tabs with H/L and leaves retired J/K native', () => {
    const host = pickerMainWindow();
    const previous = vi.fn();
    const next = vi.fn();
    Reflect.set(host.window, 'Zotero_Tabs', {
      _tabs: [{ id: 'library', title: 'Library', type: 'library' }],
      selectedID: 'library',
      selectPrev: previous,
      selectNext: next,
    });
    const controller = createMainWindowController({
      preferences: {
        has: () => false,
        get: (_key, fallback) => fallback,
        set: () => {},
      },
      logger,
      reader: { start: () => {}, shutdown: () => {}, rescan: () => {}, forwardKey: () => {} },
    } as MainWindowControllerDependencies);
    controller.addWindow(host.window);

    const press = (key: string): KeyboardEvent => {
      const event = {
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as KeyboardEvent;
      host.keydown(event);
      return event;
    };
    press('H');
    press('L');
    const oldPrevious = press('J');
    const oldNext = press('K');
    controller.shutdown();

    expect(previous).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    expect(oldPrevious.preventDefault).not.toHaveBeenCalled();
    expect(oldNext.preventDefault).not.toHaveBeenCalled();
  });
});
describe('repeated tab switching', () => {
  it('applies every rapid tab-switch command instead of time-deduplicating it', () => {
    let selectedIndex = 0;
    const status = statusElement();
    const document = {
      body: { append: () => {} },
      documentElement: { append: () => {} },
      createElementNS: () => status,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    let timer = 0;
    const window = {
      document,
      Zotero_Tabs: {
        selectNext: () => {
          selectedIndex += 1;
        },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      setInterval: () => ++timer,
      clearInterval: () => {},
      setTimeout: () => ++timer,
      clearTimeout: () => {},
    } as unknown as MainWindow;
    const dependencies = {
      preferences: {
        has: () => false,
        get: (key: string, fallback: boolean | number | string) =>
          key === 'noteEditor.enabled' ? false : fallback,
        set: () => {},
      },
      logger,
      reader: {
        start: () => {},
        shutdown: () => {},
        rescan: () => {},
        forwardKey: () => {},
      },
    } as MainWindowControllerDependencies;
    const controller = createMainWindowController(dependencies);
    controller.addWindow(window);

    controller.executeFromReader('mainNextTab', 1, window);
    controller.executeFromReader('mainNextTab', 1, window);
    controller.shutdown();

    expect(selectedIndex).toBe(2);
  });

  it('routes Reader actions to the attached owner and never falls back after detach', () => {
    let firstCount = 0;
    let secondCount = 0;
    let timer = 0;
    const document = {
      body: { append: () => {} },
      documentElement: { append: () => {} },
      createElementNS: () => statusElement(),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const makeWindow = (selectNext: () => void): MainWindow =>
      ({
        document,
        Zotero_Tabs: { selectNext },
        addEventListener: () => {},
        removeEventListener: () => {},
        setInterval: () => ++timer,
        clearInterval: () => {},
        setTimeout: () => ++timer,
        clearTimeout: () => {},
      }) as unknown as MainWindow;
    const first = makeWindow(() => {
      firstCount += 1;
    });
    const second = makeWindow(() => {
      secondCount += 1;
    });
    const dependencies = {
      preferences: {
        has: () => false,
        get: (key: string, fallback: boolean | number | string) =>
          key === 'noteEditor.enabled' ? false : fallback,
        set: () => {},
      },
      logger,
      reader: {
        start: () => {},
        shutdown: () => {},
        rescan: () => {},
        forwardKey: () => {},
      },
    } as MainWindowControllerDependencies;
    const controller = createMainWindowController(dependencies);
    controller.addWindow(first);
    controller.addWindow(second);

    controller.executeFromReader('mainNextTab', 1, second);
    controller.removeWindow(second);
    controller.executeFromReader('mainNextTab', 1, second);
    controller.executeFromReader('mainNextTab', 1, null);
    controller.shutdown();

    expect(firstCount).toBe(0);
    expect(secondCount).toBe(1);
  });
});

describe('main Space-leader key guide', () => {
  describe('main engine dispatch', () => {
    it('waits for an ambiguous direct binding and leaves unavailable focus native', () => {
      vi.useFakeTimers();
      let keydown: EventListener | undefined;
      let next = 0;
      let previous = 0;
      const document = {
        activeElement: { localName: 'div', tagName: 'DIV' },
        body: { append: () => {}, appendChild: () => {} },
        documentElement: { append: () => {}, appendChild: () => {} },
        createElementNS: () => statusElement(),
        createElement: () => ({
          ...statusElement(),
          append: () => {},
          appendChild: () => {},
          replaceChildren: () => {},
        }),
        getElementById: () => null,
        querySelector: () => null,
        addEventListener: (type: string, listener: EventListener) => {
          if (type === 'keydown') keydown = listener;
        },
        removeEventListener: () => {},
      };
      const window = {
        document,
        Zotero_Tabs: { selectNext: () => (next += 1), selectPrev: () => (previous += 1) },
        addEventListener: () => {},
        removeEventListener: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        setTimeout,
        clearTimeout,
      } as unknown as MainWindow;
      const controller = createMainWindowController({
        preferences: {
          has: () => false,
          get: (key, fallback) =>
            key === 'noteEditor.enabled'
              ? false
              : key === 'bindings'
                ? JSON.stringify({
                    'main-normal:x': 'mainNextTab',
                    'main-normal:xy': 'mainPrevTab',
                    'main-normal:q': 'focusReaderSplitLeft',
                    'main-normal: f': 'mainNextTab',
                    'main-normal: ff': 'mainPrevTab',
                  })
                : fallback,
          set: () => {},
        },
        logger,
        reader: { start: () => {}, shutdown: () => {}, rescan: () => {}, forwardKey: () => {} },
      } as MainWindowControllerDependencies);
      controller.addWindow(window);
      const press = (key: string) => {
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        keydown?.({
          key,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          preventDefault,
          stopPropagation,
        } as unknown as KeyboardEvent);
        return { preventDefault, stopPropagation };
      };

      const pending = press('x');
      expect(pending.preventDefault).toHaveBeenCalledOnce();
      expect(next).toBe(0);
      press('z');
      vi.advanceTimersByTime(1_000);
      expect(next).toBe(0);
      press('x');
      press('y');
      expect(previous).toBe(1);
      const unavailable = press('q');
      expect(unavailable.preventDefault).not.toHaveBeenCalled();
      expect(unavailable.stopPropagation).not.toHaveBeenCalled();
      press(' ');
      press('f');
      vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
      expect(next).toBe(1);

      press(' ');
      press('f');
      press('z');
      vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
      expect(next).toBe(1);

      press(' ');
      press('f');
      press('Escape');
      vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
      expect(next).toBe(1);

      press(' ');
      press('f');
      press('Backspace');
      vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
      expect(next).toBe(1);
      controller.shutdown();
      vi.useRealTimers();
    });
  });

  it('renders a delayed guide from main bindings and cancels it on Escape', () => {
    vi.useFakeTimers();
    let keydown: EventListener | undefined;
    const children: HTMLElement[] = [];
    const element = () => {
      const attributes = new Map<string, string>();
      const childNodes: HTMLElement[] = [];
      const node = {
        id: '',
        ownerDocument: null as unknown as Document,
        textContent: '',
        style: {
          cssText: '',
          display: '',
          background: '',
          color: '',
          colorScheme: '',
          getPropertyValue: () => '',
          setProperty: () => {},
        },
        append: (...nodes: HTMLElement[]) => childNodes.push(...nodes),
        appendChild: (child: HTMLElement) => childNodes.push(child),
        replaceChildren: (...nodes: HTMLElement[]) =>
          childNodes.splice(0, childNodes.length, ...nodes),
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        remove: () => {
          const index = children.indexOf(node as unknown as HTMLElement);
          if (index >= 0) children.splice(index, 1);
        },
      };
      return node;
    };
    const active = { localName: 'div', tagName: 'DIV' } as unknown as Element;
    const document = {
      activeElement: active,
      body: {
        append: (...nodes: HTMLElement[]) => children.push(...nodes),
        appendChild: (node: HTMLElement) => children.push(node),
      },
      documentElement: {
        append: (...nodes: HTMLElement[]) => children.push(...nodes),
        appendChild: (node: HTMLElement) => children.push(node),
      },
      createElementNS: () => statusElement(),
      createElement: () => element(),
      getElementById: () => null,
      querySelector: () => null,
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'keydown') keydown = listener;
      },
      removeEventListener: () => {},
    };
    const window = {
      document,
      addEventListener: () => {},
      removeEventListener: () => {},
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout,
      clearTimeout,
    } as unknown as MainWindow;
    const controller = createMainWindowController({
      preferences: {
        has: () => false,
        get: (key, fallback) =>
          key === 'noteEditor.enabled' ? false : key === 'keyGuide.fontSizePx' ? 18 : fallback,
        set: () => {},
      },
      logger,
      reader: { start: () => {}, shutdown: () => {}, rescan: () => {}, forwardKey: () => {} },
    } as MainWindowControllerDependencies);
    controller.addWindow(window);

    const press = (key: string): void =>
      keydown?.({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as KeyboardEvent);
    press(' ');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.defaultDelayMs);
    expect(children.some((child) => child.id === 'zotero-neo-key-guide')).toBe(true);
    expect(children.find((child) => child.id === 'zotero-neo-key-guide')?.style.fontSize).toBe(
      '18px',
    );

    press('Escape');
    expect(children.some((child) => child.id === 'zotero-neo-key-guide')).toBe(false);
    controller.shutdown();
    vi.useRealTimers();
  });
});
describe('Reader owner picker routing', () => {
  it('opens the picker only in the Reader owner window and never falls back', async () => {
    const originalServices = Reflect.get(globalThis, 'Services');
    Reflect.set(globalThis, 'Services', { focus: { focusedWindow: null } });
    const first = pickerMainWindow();
    const second = pickerMainWindow();
    const dependencies = {
      preferences: {
        has: () => false,
        get: (key: string, fallback: boolean | number | string) =>
          key === 'noteEditor.enabled' ? false : fallback,
        set: () => {},
      },
      logger,
      reader: {
        start: () => {},
        shutdown: () => {},
        rescan: () => {},
        forwardKey: () => {},
      },
    } as MainWindowControllerDependencies;
    const main = createMainWindowController(dependencies);
    main.addWindow(first.window);
    main.addWindow(second.window);
    const firstBodyCount = first.bodyChildren.length;
    const secondBodyCount = second.bodyChildren.length;

    const readerDocument = { defaultView: null as Window | null } as unknown as Document;
    const pdfWindow = {
      document: readerDocument,
      focus: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      setInterval: () => 0,
      clearInterval: () => {},
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      },
      cancelAnimationFrame: () => {},
    } as unknown as PdfWindow;
    const readerWindow = { document: readerDocument } as unknown as Window;
    Reflect.set(readerDocument, 'defaultView', pdfWindow);
    const reader = {
      _window: second.window,
      _iframeWindow: readerWindow,
      _internalReader: { _primaryView: { _iframeWindow: pdfWindow } },
    } as ReaderRuntime;
    const readerSession = new ReaderSession({
      controller: {
        dependencies: {
          preferences: dependencies.preferences,
          logger,
          delegateMain: (
            action: ReaderDelegableMainAction,
            count: number,
            ownerWindow: MainWindow | null,
          ) => main.executeFromReader(action, count, ownerWindow),
        },
      },
      reader,
      firstPdfWindow: pdfWindow,
      bindings: () => DEFAULT_BINDINGS,
      release: () => {},
    } as unknown as ConstructorParameters<typeof ReaderSession>[0]);
    const press = (key: string): void =>
      readerSession.focusAndHandle({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: null,
        preventDefault: () => {},
        stopImmediatePropagation: () => {},
      } as unknown as KeyboardEvent);

    press(' ');
    press('f');
    press('t');
    await Promise.resolve();
    expect(second.bodyChildren.length).toBeGreaterThan(secondBodyCount);
    expect(first.bodyChildren).toHaveLength(firstBodyCount);

    main.removeWindow(second.window);
    press(' ');
    press('f');
    press('t');
    await Promise.resolve();
    main.executeFromReader('mainTabPick', 1, null);
    expect(first.bodyChildren).toHaveLength(firstBodyCount);

    readerSession.dispose();
    main.shutdown();
    if (originalServices === undefined) Reflect.deleteProperty(globalThis, 'Services');
    else Reflect.set(globalThis, 'Services', originalServices);
  });
});

describe('collection navigation repeat pacing', () => {
  it('keeps every repeat movement while debouncing Zotero selection work', () => {
    let keydown: EventListener | undefined;
    const selections: Array<{ index: number; shouldDebounce: boolean | undefined }> = [];
    const selection = {
      count: 1,
      focused: 0,
      select(index: number, shouldDebounce?: boolean) {
        this.focused = index;
        selections.push({ index, shouldDebounce });
      },
    };
    const active = {
      id: 'collection-tree-row-0',
      localName: 'div',
      shadowRoot: null,
    } as unknown as Element;
    const collectionView: TreeView = {
      tree: { focus: () => {} },
      domEl: { contains: (node: unknown) => node === active } as HTMLElement,
      rowCount: 20,
      selection,
      ensureRowIsVisible: () => {},
    };
    const status = statusElement();
    const document = {
      activeElement: active,
      body: { append: () => {} },
      documentElement: { append: () => {} },
      createElementNS: () => status,
      getElementById: () => null,
      querySelector: () => null,
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'keydown') keydown = listener;
      },
      removeEventListener: () => {},
    };
    let timer = 0;
    const window = {
      document,
      ZoteroPane: { collectionsView: collectionView },
      addEventListener: () => {},
      removeEventListener: () => {},
      setInterval: () => ++timer,
      clearInterval: () => {},
      setTimeout: () => ++timer,
      clearTimeout: () => {},
    } as unknown as MainWindow;
    const dependencies = {
      preferences: {
        has: () => false,
        get: (key: string, fallback: boolean | number | string) =>
          key === 'noteEditor.enabled' ? false : fallback,
        set: () => {},
      },
      logger,
      reader: {
        start: () => {},
        shutdown: () => {},
        rescan: () => {},
        forwardKey: () => {},
      },
    } as MainWindowControllerDependencies;
    const controller = createMainWindowController(dependencies);
    controller.addWindow(window);
    const press = (repeat: boolean): void => {
      keydown?.({
        key: 'j',
        repeat,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as KeyboardEvent);
    };

    press(false);
    press(true);
    press(true);
    press(true);
    press(true);
    press(true);
    controller.shutdown();

    expect(selections).toEqual([
      { index: 1, shouldDebounce: false },
      { index: 2, shouldDebounce: true },
      { index: 3, shouldDebounce: true },
      { index: 4, shouldDebounce: true },
      { index: 5, shouldDebounce: true },
      { index: 6, shouldDebounce: true },
    ]);
  });
});
