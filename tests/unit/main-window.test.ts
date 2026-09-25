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
import { MainItemSelect } from '../../src/main/item-select';
import { createMainWindowController } from '../../src/main/controller';
import { MainFocusOwnership } from '../../src/main/focus-ownership';
import { ReaderSession, createReaderController } from '../../src/reader/controller';
import type { InternalReaderRuntime, PdfWindow, ReaderRuntime } from '../../src/reader/types';
import {
  MainNavigation,
  selectedCollection,
  selectedCollectionID,
  type TreeView,
} from '../../src/main/navigation';
import type { MainWindowSession } from '../../src/main/session';
import { SelectionStore } from '../../src/main/selection-store';
import { createCommandsProvider } from '../../src/main/picker/providers/commands';

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
  let focusin: EventListener | undefined;
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
      getAttribute: (name: string) => (Reflect.get(element, name) as string | undefined) ?? null,
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
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((entry) => entry !== listener),
        );
      },
      listenerCount: (type: string) => listeners.get(type)?.length ?? 0,
      closest: (selector: string) => {
        if (selector === '[data-zv-picker-row="1"]' && element.dataset.zvPickerRow === '1')
          return element as unknown as HTMLElement;
        return element.parentElement?.closest?.(selector) ?? null;
      },
      contains: (node: Node) => {
        let current = node as (Node & { parentElement?: HTMLElement | null }) | null;
        while (current) {
          if (current === (element as unknown as Node)) return true;
          current = current.parentElement ?? null;
        }
        return false;
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
        focusin?.({ target: element } as unknown as Event);
      },
      select: vi.fn(),
      scrollBy: vi.fn(),
      scrollIntoView: vi.fn(),
      remove: () => {
        const index = bodyChildren.indexOf(element as unknown as HTMLElement);
        if (index >= 0) bodyChildren.splice(index, 1);
        Reflect.set(element, 'isConnected', false);
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
      append: (...nodes: HTMLElement[]) => bodyChildren.push(...nodes),
      appendChild: (node: HTMLElement) => bodyChildren.push(node),
    },
    documentElement: {
      append: (...nodes: HTMLElement[]) => bodyChildren.push(...nodes),
      appendChild: (node: HTMLElement) => bodyChildren.push(node),
    },
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'keydown') keydown = listener;
      if (type === 'focusin') focusin = listener;
    },
    removeEventListener: (type: string, listener: EventListener) => {
      if (type === 'keydown' && keydown === listener) keydown = undefined;
      if (type === 'focusin' && focusin === listener) focusin = undefined;
    },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  } as unknown as Document;
  const window = {
    document,
    innerWidth: 1200,
    Zotero_Tabs: { _tabs: [{ id: 'tab-b', title: 'Reader B' }], selectedID: 'tab-b' },
    focus: vi.fn(),
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

  it('preserves a native multi-scope selection while moving only ScopeCursor', () => {
    let focused = 2;
    const selected = new Set([1, 2]);
    const select = vi.fn();
    const moveFocused = vi.fn((index: number) => {
      focused = index;
    });
    const active = { id: 'collection-tree-row-2' } as Element;
    const view = {
      tree: { focus: () => {}, _onSelection: moveFocused },
      domEl: { contains: (node: unknown) => node === active } as HTMLElement,
      rowCount: 6,
      selection: {
        count: 2,
        selected,
        get focused() {
          return focused;
        },
        select,
      },
      ensureRowIsVisible: vi.fn(),
    } as unknown as TreeView;
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

    expect(select).not.toHaveBeenCalled();
    expect(moveFocused).toHaveBeenCalledWith(3, false, false, true, false);
    expect([...selected]).toEqual([1, 2]);
    expect(focused).toBe(3);
  });

  it('pins a single native scope with s semantics and can add the detached ScopeCursor', () => {
    let focused = 2;
    const selected = new Set([2]);
    const toggleSelect = vi.fn((index: number) => {
      if (selected.has(index)) selected.delete(index);
      else selected.add(index);
    });
    const moveFocused = vi.fn((index: number) => {
      focused = index;
    });
    const active = { id: 'collection-tree-row-2' } as Element;
    const view = {
      tree: { focus: () => {}, _onSelection: moveFocused },
      domEl: { contains: (node: unknown) => node === active } as HTMLElement,
      rowCount: 6,
      selection: {
        get count() {
          return selected.size;
        },
        selected,
        get focused() {
          return focused;
        },
        toggleSelect,
        select: vi.fn(),
      },
      ensureRowIsVisible: vi.fn(),
    } as unknown as TreeView;
    const window = {
      document: {
        activeElement: active,
        getElementById: () => null,
        querySelector: () => null,
      },
      ZoteroPane: { collectionsView: view },
    } as unknown as MainWindow;
    const session = {
      window: { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() },
      activePanel: 'collections',
      status: { textContent: '', style: {} },
      cleanup: { add: vi.fn() },
    } as unknown as MainWindowSession;
    const navigation = new MainNavigation(logger, () => {});

    expect(navigation.toggleScope(window, session)).toBe(true);
    expect(toggleSelect).not.toHaveBeenCalled();
    expect([...selected]).toEqual([2]);
    expect(focused).toBe(3);

    expect(navigation.toggleScope(window, session)).toBe(true);
    expect(toggleSelect).toHaveBeenCalledWith(3, false);
    expect([...selected]).toEqual([2, 3]);
    expect(focused).toBe(4);
  });

  it('collapses ScopeSet to ScopeCursor before Enter moves into items', () => {
    let focused = 4;
    const selected = new Set([1, 2]);
    const select = vi.fn((index: number) => {
      selected.clear();
      selected.add(index);
    });
    const collectionActive = { id: 'collection-tree-row-4' } as Element;
    const itemActive = { id: 'item-tree-row-0' } as Element;
    let active: Element = collectionActive;
    const collectionTree = {
      focus: () => {
        active = collectionActive;
      },
      _onSelection: vi.fn((index: number) => {
        focused = index;
      }),
    };
    const itemTree = {
      focus: () => {
        active = itemActive;
      },
    };
    const collectionsView = {
      tree: collectionTree,
      domEl: { contains: (node: unknown) => node === collectionActive } as HTMLElement,
      rowCount: 6,
      selection: {
        get count() {
          return selected.size;
        },
        selected,
        get focused() {
          return focused;
        },
        select,
      },
    } as unknown as TreeView;
    const itemsView = {
      tree: itemTree,
      domEl: { contains: (node: unknown) => node === itemActive } as HTMLElement,
      rowCount: 1,
      selection: { focused: 0, count: 1, select: vi.fn() },
    } as unknown as TreeView;
    const document = {
      get activeElement() {
        return active;
      },
      getElementById: () => null,
      querySelector: () => null,
    } as unknown as Document;
    const window = {
      document,
      ZoteroPane: { collectionsView, itemsView },
    } as unknown as MainWindow;
    const session = {
      window: { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() },
      activePanel: 'collections',
      status: { textContent: '', style: {} },
      cleanup: { add: vi.fn() },
    } as unknown as MainWindowSession;
    const navigation = new MainNavigation(logger, () => {});
    const beforeNavigate = vi.fn();

    navigation.activate(window, session, beforeNavigate);

    expect(beforeNavigate).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith(4, false);
    expect([...selected]).toEqual([4]);
    expect(session.activePanel).toBe('items');
  });

  it('moves item Cursor with one select-only native anchor', () => {
    const active = { id: 'item-tree-main-default-row-2' } as Element;
    let focused = 2;
    let selected = new Set([1, 2, 4]);
    const select = vi.fn((index: number) => {
      focused = index;
      selected = new Set([index]);
    });
    const ensureRowIsVisible = vi.fn();
    const itemsView = {
      rowCount: 6,
      selection: {
        get focused() {
          return focused;
        },
        select,
      },
      ensureRowIsVisible,
    };
    const window = {
      document: {
        activeElement: active,
        getElementById: () => null,
        querySelector: () => null,
      },
      ZoteroPane: { itemsView },
    } as unknown as MainWindow;
    const session = { activePanel: 'items' } as MainWindowSession;
    const navigation = new MainNavigation(logger, () => {});

    navigation.navigate(window, session, 1, 1, true);

    expect(select).toHaveBeenCalledWith(3, true);
    expect([...selected]).toEqual([3]);
    expect(focused).toBe(3);
    expect(ensureRowIsVisible).toHaveBeenCalledWith(3);
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
    const selected = [
      { id: 41, libraryID: 1 },
      { id: 42, libraryID: 1 },
    ] as Zotero.Item[];
    const rows = selected.map((ref) => ({ isObjectRow: true, ref }));
    const trashTx = vi.fn(async () => {});
    const undo = vi.fn(async () => true);
    const window = {
      document: {
        activeElement: active,
        getElementById: () => null,
        querySelector: () => null,
      },
      ZoteroPane: {
        itemsView: {
          domEl: itemsRoot,
          rowCount: rows.length,
          getRow: (index: number) => rows[index],
          getRowIndexByID: (id: number) => {
            const index = rows.findIndex((row) => row.ref.id === id);
            return index < 0 ? false : index;
          },
        },
      },
    } as unknown as MainWindow;
    const selection = new SelectionStore();
    for (const item of selected) selection.add({ libraryID: item.libraryID, itemID: item.id });
    const session = {
      window: { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() },
      activePanel: 'items',
      selection,
      trashedItemIDs: [],
      status: { textContent: '', style: {} },
      cleanup: { add: () => {} },
    } as unknown as MainWindowSession;
    const navigation = new MainNavigation(logger, () => {});
    try {
      Reflect.set(globalThis, 'Zotero', {
        Items: { trashTx, get: (id: number) => selected.find((item) => item.id === id) ?? false },
        UndoHistory: { getUndoAction: () => ({ action: 'undo-action-trash' }), undo },
      });

      await navigation.trashSelectedItems(window, session);
      expect(trashTx).toHaveBeenCalledWith([41, 42]);
      expect(session.trashedItemIDs).toEqual([41, 42]);
      expect(session.selection.empty).toBe(true);
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
      'main-normal:<C-h>': 'focusReaderSplitLeft',
      'main-normal:<C-j>': 'focusReaderSplitDown',
      'main-normal:<C-k>': 'focusReaderSplitUp',
      'main-normal:<C-l>': 'focusReaderSplitRight',
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
      'note-normal:<Space>f': 'nextTab',
      'note-normal:<Space>ff': 'previousTab',
    });

    test.press(' ');
    test.press('f');
    test.press('f');
    expect(test.actions).toEqual([['previousTab', 0]]);
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(test.actions).toEqual([['previousTab', 0]]);

    test.press(' ');
    test.press('f');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(test.actions).toEqual([
      ['previousTab', 0],
      ['nextTab', 0],
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
    expect(test.actions).toEqual([['previousTab', 0]]);

    const retired = test.press('J');
    expect(retired.preventDefault).not.toHaveBeenCalled();
    expect(test.actions).toEqual([['previousTab', 0]]);
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

  it('leaves IME-owned Insert keydowns native, including Escape during composition', () => {
    const test = harness();

    test.press('i');
    expect(test.session.note.mode).toBe('insert');

    const composingEscape = test.press('Escape', { isComposing: true });
    expect(test.session.note.mode).toBe('insert');
    expect(composingEscape.preventDefault).not.toHaveBeenCalled();
    expect(composingEscape.stopPropagation).not.toHaveBeenCalled();

    const process = test.press('Process', { keyCode: 229 });
    expect(test.session.note.mode).toBe('insert');
    expect(process.preventDefault).not.toHaveBeenCalled();
    expect(process.stopPropagation).not.toHaveBeenCalled();
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
    Reflect.set(test.main, 'Zotero_Tabs', { selectedID: 'reader-tab' });
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

describe('Main startup focus handoff', () => {
  it('marks the explicit Space-f-q Quick Search focus as intentional', () => {
    const originalZotero = Reflect.get(globalThis, 'Zotero');
    const originalServices = Reflect.get(globalThis, 'Services');
    Reflect.set(globalThis, 'Services', { focus: { focusedWindow: null } });
    Reflect.set(globalThis, 'Zotero', { initialized: false });
    const mark = vi.spyOn(MainFocusOwnership.prototype, 'markQuickSearchIntent');
    const host = pickerMainWindow();
    Reflect.set(host.window, 'Zotero_Tabs', {
      selectedID: 'zotero-pane',
      _tabs: [{ id: 'zotero-pane', type: 'library' }],
    });
    const select = vi.fn();
    Reflect.set(host.window.document, 'getElementById', (id: string) =>
      id === 'zotero-tb-search' ? { searchTextbox: { select, value: '' } } : null,
    );
    const controller = createMainWindowController({
      preferences: { has: () => false, get: (_key, fallback) => fallback, set: () => {} },
      logger,
      reader: { rescan: () => {}, forwardKey: () => {} },
    } as MainWindowControllerDependencies);
    try {
      controller.addWindow(host.window);
      for (const key of [' ', 'f', 'q']) {
        host.keydown({
          key,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        } as unknown as KeyboardEvent);
      }
      expect(select).toHaveBeenCalledOnce();
      expect(mark).toHaveBeenCalledOnce();
    } finally {
      controller.shutdown();
      mark.mockRestore();
      if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
      else Reflect.set(globalThis, 'Zotero', originalZotero);
      if (originalServices === undefined) Reflect.deleteProperty(globalThis, 'Services');
      else Reflect.set(globalThis, 'Services', originalServices);
    }
  });
});

function settingsMainHost() {
  vi.stubGlobal('Services', { focus: { focusedWindow: null } });
  const host = pickerMainWindow();
  const values = new Map<string, boolean | number | string>();
  const writes: Array<[string, boolean | number | string]> = [];
  const observers = new Map<string, Set<() => void>>();
  const controller = createMainWindowController({
    preferences: {
      has: (key: string) => values.has(key),
      get: (key: string, fallback: boolean | number | string) => values.get(key) ?? fallback,
      set: (key: string, value: boolean | number | string) => {
        values.set(key, value);
        writes.push([key, value]);
        for (const listener of observers.get(key) ?? []) listener();
      },
      observe: (key: string, listener: () => void) => {
        const group = observers.get(key) ?? new Set<() => void>();
        group.add(listener);
        observers.set(key, group);
        return () => group.delete(listener);
      },
    },
    logger,
    reader: { rescan: () => {}, forwardKey: () => {} },
  } as MainWindowControllerDependencies);
  controller.addWindow(host.window);
  const press = (key: string, target?: EventTarget): KeyboardEvent => {
    const event = {
      key,
      target,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    host.keydown(event);
    return event;
  };
  const drawer = () => host.bodyChildren.find((child) => child.id === 'zotero-neo-settings-center');
  const backdrop = () =>
    host.bodyChildren.find((child) => child.id === 'zotero-neo-settings-backdrop');
  return { ...host, controller, press, drawer, backdrop, values, writes };
}

describe('Main Settings Center shell', () => {
  it('opens centered once, remembers section, and removes backdrop and panel on close', () => {
    const host = settingsMainHost();
    const prior = host.window.document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
    host.window.document.body?.append(prior);
    prior.focus();
    host.press(' ');
    host.press('p');
    host.press('s');
    const panel = host.drawer();
    const backdrop = host.backdrop() as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
      listenerCount(type: string): number;
    };
    expect(panel?.style.cssText).toContain('left:50%;top:50%;transform:translate(-50%,-50%)');
    expect(panel?.style.cssText).toContain('width:min(820px,calc(100vw - 48px))');
    expect(panel?.style.cssText).toContain('height:min(760px,calc(100vh - 64px))');
    expect(panel?.style.cssText).not.toContain('right:12px');
    expect(panel?.style.cssText).toContain('font:inherit');
    expect(panel?.style.cssText).not.toContain('sans-serif');
    expect(backdrop.style.cssText).toContain('inset:0');
    const navigation = panel?.children[1] as HTMLElement;
    expect(navigation.children).toHaveLength(5);
    for (const button of Array.from(navigation.children) as HTMLElement[]) {
      expect(button.style.cssText).toContain(
        'display:inline-flex;align-items:center;justify-content:center',
      );
      expect(button.style.cssText).toContain('appearance:none');
      expect(button.style.cssText).toContain('box-sizing:border-box');
      expect(button.style.cssText).toContain('font:inherit');
      expect(button.tabIndex).toBe(-1);
    }
    expect((panel?.children[0]?.children[1] as HTMLElement).tabIndex).toBe(-1);
    expect((panel?.children[0]?.children[1] as HTMLElement).style.cssText).toContain(
      'display:inline-flex',
    );
    expect((navigation.children[0] as HTMLElement).style.background).toBe(
      'var(--zotero-neo-selected)',
    );
    const reader = navigation.children[2] as HTMLElement & { emit(type: string): void };
    reader.emit('click');
    expect(reader.style.background).toBe('var(--zotero-neo-selected)');
    expect(panel?.children[2]?.children[0]?.textContent).toBe('Reader');
    expect(host.controller.openSettings(host.window)).toBe(true);
    expect(host.drawer()).toBe(panel);
    expect(
      host.bodyChildren.filter((node) => node.id === 'zotero-neo-settings-center'),
    ).toHaveLength(1);
    expect(
      host.bodyChildren.filter((node) => node.id === 'zotero-neo-settings-backdrop'),
    ).toHaveLength(1);
    backdrop.emit('click', { target: panel });
    expect(host.drawer()).toBe(panel);
    backdrop.emit('click');
    expect(host.drawer()).toBeUndefined();
    expect(host.backdrop()).toBeUndefined();
    expect(backdrop.listenerCount('click')).toBe(0);
    expect(host.window.document.activeElement).toBe(prior);
    host.controller.openSettings(host.window);
    expect(host.drawer()?.children[2]?.children[0]?.textContent).toBe('Reader');
    host.controller.shutdown();
    expect(host.drawer()).toBeUndefined();
    expect(host.backdrop()).toBeUndefined();
  });

  it('keeps unexpected outside focus when closed by the Close button', () => {
    const host = settingsMainHost();
    const outside = host.window.document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
    host.window.document.body?.append(outside);
    host.controller.openSettings(host.window);
    outside.focus();
    const close = host.drawer()?.children[0]?.children[1] as HTMLElement & {
      emit(type: string): void;
    };
    close.emit('click');
    expect(host.window.document.activeElement).toBe(outside);
    expect(host.backdrop()).toBeUndefined();
    host.controller.shutdown();
  });

  it('discards unadded themes on Close, backdrop, and Escape', () => {
    const host = settingsMainHost();
    const all = (node: HTMLElement): HTMLElement[] => [
      node,
      ...Array.from(node.children).flatMap((child) => all(child as HTMLElement)),
    ];
    try {
      for (const method of ['Close', 'backdrop', 'Escape'] as const) {
        host.controller.openSettings(host.window);
        const addCustom = all(host.drawer()!).find(
          (node) => node.localName === 'button' && node.textContent === '+ Custom',
        ) as HTMLElement & { emit(type: string): void };
        addCustom.emit('click');
        expect(host.values.has('appearance.interaction.customThemes')).toBe(false);
        if (method === 'Close') {
          (
            host.drawer()?.children[0]?.children[1] as HTMLElement & { emit(type: string): void }
          ).emit('click');
        } else if (method === 'backdrop') {
          (host.backdrop() as HTMLElement & { emit(type: string): void }).emit('click');
        } else host.press('Escape');
        expect(host.drawer()).toBeUndefined();
        expect(host.values.has('appearance.interaction.customThemes')).toBe(false);
        host.controller.openSettings(host.window);
        expect(
          all(host.drawer()!).some(
            (node) => node.localName === 'button' && node.textContent === '+ Custom',
          ),
        ).toBe(true);
        expect(
          all(host.drawer()!).some(
            (node) => node.localName === 'button' && node.textContent === 'Add',
          ),
        ).toBe(false);
        host.press('Escape');
      }
    } finally {
      host.controller.shutdown();
    }
  });

  it('closes on Escape before Selection or Visual and suppresses Main keys while open', () => {
    const host = settingsMainHost();
    const clear = vi.spyOn(MainItemSelect.prototype, 'clearSelection');
    const enter = vi.spyOn(MainItemSelect.prototype, 'enter');
    const itemsFocused = vi.spyOn(MainItemSelect.prototype, 'itemsFocused').mockReturnValue(true);
    const notEmpty = vi.spyOn(SelectionStore.prototype, 'empty', 'get').mockReturnValue(false);
    try {
      host.controller.openSettings(host.window);
      const outside = host.window.document.createElementNS(
        'http://www.w3.org/1999/xhtml',
        'button',
      );
      host.window.document.body?.append(outside);
      outside.focus();
      const blocked = host.press('v', outside);
      host.press('j', outside);
      host.press(':', outside);
      expect(blocked.preventDefault).toHaveBeenCalledOnce();
      expect(enter).not.toHaveBeenCalled();
      expect(host.bodyChildren.some((node) => node.id === 'zv-picker-overlay')).toBe(false);
      const inside = host.drawer()?.children[0]?.children[1] as HTMLElement;
      const tab = host.press('Tab', inside);
      expect(tab.preventDefault).not.toHaveBeenCalled();
      const escape = host.press('Escape', outside);
      expect(escape.preventDefault).toHaveBeenCalledOnce();
      expect(clear).not.toHaveBeenCalled();
      expect(host.drawer()).toBeUndefined();
    } finally {
      host.controller.shutdown();
      clear.mockRestore();
      enter.mockRestore();
      itemsFocused.mockRestore();
      notEmpty.mockRestore();
    }
  });

  it('retains persisted custom editor and Dark tab across navigation and close', () => {
    const host = settingsMainHost();
    const all = (node: HTMLElement): HTMLElement[] => [
      node,
      ...Array.from(node.children).flatMap((child) => all(child as HTMLElement)),
    ];
    const click = (text: string): void => {
      const button = all(host.drawer()!).find(
        (node) => node.localName === 'button' && node.textContent === text,
      ) as HTMLElement & { emit(type: string): void };
      expect(button).toBeDefined();
      button.emit('click');
    };
    try {
      host.controller.openSettings(host.window);
      click('+ Custom');
      expect(host.values.get('appearance.interaction.customThemes')).toBeUndefined();
      click('Dark');
      const field = all(host.drawer()!).find(
        (node) => node.localName === 'input' && node.getAttribute('aria-label') === 'Yellow hex',
      ) as HTMLInputElement & { emit(type: string): void };
      field.focus();
      const typed = host.press('a', field);
      expect(typed.preventDefault).not.toHaveBeenCalled();
      field.value = '#123456';
      field.emit('input');
      expect(all(host.drawer()!)).toContain(field);
      expect(host.window.document.activeElement).toBe(field);
      click('Add');
      expect(host.values.get('appearance.interaction.customThemes')).toBeDefined();
      click('Edit');
      (host.drawer()?.children[1]?.children[2] as HTMLElement & { emit(type: string): void }).emit(
        'click',
      );
      expect(host.drawer()?.children[2]?.children[0]?.textContent).toBe('Reader');
      (host.drawer()?.children[1]?.children[0] as HTMLElement & { emit(type: string): void }).emit(
        'click',
      );
      const restored = all(host.drawer()!).find(
        (node) => node.localName === 'input' && node.getAttribute('aria-label') === 'Yellow hex',
      ) as HTMLInputElement;
      expect(restored.value).toBe('#123456');
      click('Close');
      expect(host.backdrop()).toBeUndefined();
      host.controller.openSettings(host.window);
      const reopened = all(host.drawer()!).find(
        (node) => node.localName === 'input' && node.getAttribute('aria-label') === 'Yellow hex',
      ) as HTMLInputElement;
      expect(reopened.value).toBe('#123456');
    } finally {
      host.controller.shutdown();
    }
  });

  it('rejects ambiguous ownerless opens and uses only an attached owner or sole fallback', () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const first = pickerMainWindow();
    const second = pickerMainWindow();
    const controller = createMainWindowController({
      preferences: { has: () => false, get: (_key, fallback) => fallback, set: () => {} },
      logger,
      reader: { rescan: () => {}, forwardKey: () => {} },
    } as MainWindowControllerDependencies);
    expect(controller.openSettings()).toBe(false);
    controller.addWindow(first.window);
    controller.addWindow(second.window);
    expect(controller.openSettings()).toBe(false);
    expect(controller.openSettings({} as Window)).toBe(false);
    expect(controller.openSettings(second.window)).toBe(true);
    expect(first.bodyChildren.some((node) => node.id === 'zotero-neo-settings-center')).toBe(false);
    expect(second.bodyChildren.some((node) => node.id === 'zotero-neo-settings-center')).toBe(true);
    controller.removeWindow(second.window);
    expect(controller.openSettings()).toBe(true);
    expect(first.bodyChildren.some((node) => node.id === 'zotero-neo-settings-center')).toBe(true);
    controller.shutdown();
    expect(first.bodyChildren.some((node) => node.id === 'zotero-neo-settings-center')).toBe(false);
  });

  it('includes the canonical Neo Settings action in Main Command Palette candidates', async () => {
    const commands = createCommandsProvider({
      mode: 'main',
      bindingMode: 'main-normal',
      actions: ['openNeoSettings'],
      bindings: resolveBindings(''),
      language: 'en',
      execute: () => {},
    });
    expect(await commands.load()).toContainEqual(
      expect.objectContaining({
        id: 'openNeoSettings',
        title: 'Neo: Settings',
        meta: '<Space>ps',
      }),
    );
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

  it('keeps Main shortcuts attached when Reader rescan fails during startup', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const host = pickerMainWindow();
    const debug = vi.fn();
    const controller = createMainWindowController({
      preferences: {
        has: () => false,
        get: (_key, fallback) => fallback,
        set: () => {},
      },
      logger: { debug, diagnostic: vi.fn() },
      reader: {
        start: () => {},
        shutdown: () => {},
        rescan: () => {
          throw new Error('missing Reader view');
        },
        forwardKey: () => {},
      },
    } as MainWindowControllerDependencies);

    expect(() => controller.addWindow(host.window)).not.toThrow();

    host.keydown({
      key: ':',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    await vi.waitFor(() =>
      expect(host.bodyChildren.some((child) => child.id === 'zv-picker-overlay')).toBe(true),
    );
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining('Reader rescan failed during Main window scan'),
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
    press(',');
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
      captureReaderSelectionToNote: (context, ownerWindow) =>
        main?.captureReaderSelectionToNote(context, ownerWindow) ?? Promise.resolve(false),
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

    controller.executeFromReader('nextTab', 1, window);
    controller.executeFromReader('nextTab', 1, window);
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

    controller.executeFromReader('nextTab', 1, second);
    controller.removeWindow(second);
    controller.executeFromReader('nextTab', 1, second);
    controller.executeFromReader('nextTab', 1, null);
    controller.shutdown();

    expect(firstCount).toBe(0);
    expect(secondCount).toBe(1);
  });
});

describe('main pending-prefix key guide', () => {
  describe('main engine dispatch', () => {
    it('waits for ambiguous custom bindings, leaves unavailable focus native, and consumes Space as leader', () => {
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
                    'main-normal:x': 'nextTab',
                    'main-normal:xy': 'previousTab',
                    'main-normal:q': 'focusReaderSplitLeft',
                    'main-normal:f': 'nextTab',
                    'main-normal:ff': 'previousTab',
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
      const leaderSpace = press(' ');
      expect(leaderSpace.preventDefault).toHaveBeenCalledOnce();
      expect(leaderSpace.stopPropagation).toHaveBeenCalledOnce();
      press('Escape');

      press('f');
      vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
      expect(next).toBe(1);

      press('f');
      press('z');
      vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
      expect(next).toBe(1);

      press('f');
      press('Escape');
      vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
      expect(next).toBe(1);

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
    press(',');
    await Promise.resolve();
    expect(second.bodyChildren.length).toBeGreaterThan(secondBodyCount);
    expect(first.bodyChildren).toHaveLength(firstBodyCount);

    main.removeWindow(second.window);
    press(' ');
    press('f');
    press('t');
    await Promise.resolve();
    main.executeFromReader('switchTab', 1, null);
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
