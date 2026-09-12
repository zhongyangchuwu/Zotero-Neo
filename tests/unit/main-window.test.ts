import { describe, expect, it, vi } from 'vitest';

import type { ActionId } from '../../src/input/actions';
import type { MainWindow, MainWindowControllerDependencies } from '../../src/core/contracts';
import { KEY_GUIDE_CONFIG } from '../../src/input/key-guide-config';
import { DEFAULT_BINDINGS } from '../../src/input/bindings';

import { NoteEditor } from '../../src/main/note-editor';
import { createMainWindowController } from '../../src/main/controller';
import { ReaderSession } from '../../src/reader/controller';
import type { PdfWindow, ReaderRuntime } from '../../src/reader/types';
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
function pickerMainWindow(): { window: MainWindow; bodyChildren: HTMLElement[] } {
  const bodyChildren: HTMLElement[] = [];
  let document: Document;
  const createElement = (tag: string): HTMLElement => {
    const children: HTMLElement[] = [];
    const listeners = new Map<string, EventListener[]>();
    let textContent = '';
    const element = {
      tagName: tag.toUpperCase(),
      localName: tag,
      ownerDocument: null as unknown as Document,
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
      append: (...nodes: HTMLElement[]) => children.push(...nodes),
      appendChild: (node: HTMLElement) => children.push(node),
      replaceChildren: (...nodes: HTMLElement[]) => {
        children.splice(0, children.length, ...nodes);
      },
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      removeEventListener: () => {},
      focus: () => {},
      select: vi.fn(),
      scrollBy: vi.fn(),
      scrollIntoView: vi.fn(),
      remove: () => {
        const index = bodyChildren.indexOf(element as unknown as HTMLElement);
        if (index >= 0) bodyChildren.splice(index, 1);
      },
    };
    element.ownerDocument = document;
    return element as unknown as HTMLElement;
  };
  document = {
    activeElement: null,
    createElementNS: (_namespace: string, tag: string) => createElement(tag),
    body: { append: (node: HTMLElement) => bodyChildren.push(node) },
    documentElement: { append: (node: HTMLElement) => bodyChildren.push(node) },
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
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
  return { window, bodyChildren };
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
        'main:dd': 'mainTrashItems',
        'main:x': 'mainTrashItems',
        'main:u': 'mainRestoreTrashedItems',
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
      'main:ctrl+h': 'focusReaderSplitLeft',
      'main:ctrl+j': 'focusReaderSplitDown',
      'main:ctrl+k': 'focusReaderSplitUp',
      'main:ctrl+l': 'focusReaderSplitRight',
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
    const session = { note: { mode: 'normal' } } as MainWindowSession;
    const editor = new NoteEditor(logger, new MainNavigation(logger, () => {}), () => ({}), {
      refresh: () => {},
      clear: () => {},
    });
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

describe('NoteEditor canonical main commands', () => {
  function harness(bindings: Readonly<Record<string, ActionId>>) {
    vi.useFakeTimers();
    const main = {
      setTimeout,
      clearTimeout,
      document: {},
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
        mainBuffer: '',
        mainTimer: undefined,
        mainRevision: 0,
        count: '',
        timer: undefined,
        yank: '',
      },
    } as unknown as MainWindowSession;
    const guide = { refresh: vi.fn(), clear: vi.fn() };
    const editor = new NoteEditor(
      logger,
      new MainNavigation(logger, () => {}),
      () => bindings,
      guide,
    );
    const actions: [ActionId, number][] = [];
    const press = (key: string) => {
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
        } as unknown as KeyboardEvent,
        main,
        session,
        (action, count) => actions.push([action, count]),
      );
      return { preventDefault, stopPropagation };
    };
    return { editor, session, target, main, actions, press };
  }

  it('resolves ambiguous leader remaps on continuation or timeout', () => {
    const test = harness({ 'main: f': 'mainNextTab', 'main: ff': 'mainPrevTab' });

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

  it('cancels, backspaces, and clears stale leader timers without dispatching', () => {
    const test = harness({ 'main: f': 'mainNextTab', 'main: ff': 'mainPrevTab' });

    test.press(' ');
    test.press('f');
    test.press('Escape');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);

    test.press(' ');
    test.press('f');
    test.press('Backspace');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);

    test.press(' ');
    test.press('f');
    test.editor.clear(test.session);
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);

    expect(test.actions).toEqual([]);
    vi.useRealTimers();
  });

  it('keeps custom Escape and Backspace bindings outside NoteEditor canonical eligibility', () => {
    const test = harness({
      'main:escape': 'mainNextTab',
      'main:backspace': 'mainPrevTab',
      'main: f': 'mainFuzzyAll',
      'main: ff': 'mainTabPick',
    });

    test.press('Escape');
    test.press('Backspace');
    test.press(' ');
    test.press('f');
    test.press('Escape');
    test.press(' ');
    test.press('f');
    test.press('Backspace');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);

    expect(test.actions).toEqual([]);
    vi.useRealTimers();
  });

  it('invalidates stale leader timeouts after newer canonical input and Insert transition', () => {
    const test = harness({ 'main: f': 'mainNextTab', 'main: ff': 'mainPrevTab' });

    test.press(' ');
    test.press('f');
    test.press('z');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(test.actions).toEqual([]);

    test.press(' ');
    test.press('f');
    test.press('i');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(test.session.note.mode).toBe('insert');
    expect(test.actions).toEqual([]);
    vi.useRealTimers();
  });

  it('keeps local commands and Insert input ahead of canonical main matching while J/K remain eligible', () => {
    const test = harness({ 'main:J': 'mainPrevTab', 'main:K': 'mainNextTab' });

    test.press('g');
    expect(test.session.note.buffer).toBe('g');
    expect(test.actions).toEqual([]);
    test.press('Escape');
    test.press('J');
    expect(test.actions).toEqual([['mainPrevTab', 0]]);

    const local = test.press('j');
    expect(local.preventDefault).not.toHaveBeenCalled();
    expect(test.actions).toEqual([['mainPrevTab', 0]]);

    test.session.note.mode = 'insert';
    const native = test.press('f');
    expect(native.preventDefault).not.toHaveBeenCalled();
    expect(native.stopPropagation).not.toHaveBeenCalled();
    vi.useRealTimers();
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
                    'main:x': 'mainNextTab',
                    'main:xy': 'mainPrevTab',
                    'main:q': 'focusReaderSplitLeft',
                    'main: f': 'mainNextTab',
                    'main: ff': 'mainPrevTab',
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
          delegateMain: (action: ActionId, count: number, ownerWindow: MainWindow | null) =>
            main.executeFromReader(action, count, ownerWindow),
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
  it('moves one row at a time while dropping only over-frequent auto-repeat events', () => {
    let keydown: EventListener | undefined;
    const selectedRows: number[] = [];
    const selection = {
      count: 1,
      focused: 0,
      select(index: number) {
        this.focused = index;
        selectedRows.push(index);
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
    const now = vi.spyOn(Date, 'now');
    const press = (timestamp: number, repeat: boolean): void => {
      now.mockReturnValue(timestamp);
      keydown?.({
        key: 'j',
        repeat,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as KeyboardEvent);
    };

    press(0, false);
    press(10, true);
    press(30, true);
    press(85, true);
    press(100, true);
    press(170, true);
    controller.shutdown();

    expect(selectedRows).toEqual([1, 2, 3]);
  });
});
