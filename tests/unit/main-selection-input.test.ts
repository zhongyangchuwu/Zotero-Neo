import { describe, expect, it, vi } from 'vitest';
import type { MainWindow, MainWindowControllerDependencies } from '../../src/core/contracts';
import { NOTE_EDITOR_ENABLED_PREFERENCE_KEY } from '../../src/core/preferences';
import { createMainWindowController as composeMainWindowController } from '../../src/main/controller';
import { BuiltinModuleRuntime } from '../../src/core/module-runtime';

function createController(dependencies: Omit<MainWindowControllerDependencies, 'modules'>) {
  return composeMainWindowController({
    ...dependencies,
    modules: new BuiltinModuleRuntime(dependencies.preferences, dependencies.logger),
  });
}

import { MainNavigation } from '../../src/main/navigation';
function themedElement(id = ''): HTMLElement {
  const attributes = new Map<string, string>();
  const styleValues = new Map<string, string>();
  return {
    id,
    localName: 'div',
    tagName: 'DIV',
    style: {
      colorScheme: '',
      display: '',
      cssText: '',
      getPropertyValue: (name: string) => styleValues.get(name) ?? '',
      setProperty: (name: string, value: string) => styleValues.set(name, value),
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    append: () => {},
    appendChild: () => null,
    replaceChildren: () => {},
    remove: vi.fn(),
  } as unknown as HTMLElement;
}

function harness(
  bindingOverrides = '',
  initialSelection?: { readonly focused: number; readonly selected: readonly number[] },
) {
  const rows = [
    { isObjectRow: true, ref: { id: 10, libraryID: 1 } },
    { isObjectRow: true, ref: { id: 11, libraryID: 1 } },
  ];
  let focused = initialSelection?.focused ?? 0;
  let pivot = 0;
  let selected = new Set(initialSelection?.selected ?? [0]);
  let active = themedElement('item-tree-main-default-row-0') as Element;
  const keydown = new Set<EventListener>();
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const elements: HTMLElement[] = [];
  let onDocumentListener: (() => void) | undefined;
  const forwardKey = vi.fn();
  const confirm = vi.fn(() => false);
  const itemRoot = themedElement('item-tree-main-default');
  Reflect.set(
    itemRoot,
    'contains',
    (node: unknown) => node === active && active.id.includes('item-tree'),
  );
  const rowClasses = rows.map(() => new Set<string>());
  const renderedRows = rows.map((_row, index) => ({
    id: `item-tree-main-default-row-${index}`,
    classList: {
      toggle: (name: string, force: boolean) => {
        if (force) rowClasses[index]!.add(name);
        else rowClasses[index]!.delete(name);
      },
      remove: (...names: string[]) => names.forEach((name) => rowClasses[index]!.delete(name)),
    },
  }));
  Reflect.set(itemRoot, 'querySelectorAll', () => renderedRows);
  Reflect.set(itemRoot, 'addEventListener', () => {});
  Reflect.set(itemRoot, 'removeEventListener', () => {});
  const collectionRoot = themedElement('collection-tree');
  Reflect.set(
    collectionRoot,
    'contains',
    (node: unknown) => node === active && active.id.includes('collection-tree'),
  );

  const clearSelection = vi.fn(() => selected.clear());
  const selection = {
    get focused() {
      return focused;
    },
    get count() {
      return selected.size;
    },
    select: (index: number) => {
      pivot = index;
      focused = index;
      selected = new Set([index]);
    },
    shiftSelect: (index: number) => {
      focused = index;
      const first = Math.min(pivot, index);
      const last = Math.max(pivot, index);
      selected = new Set(Array.from({ length: last - first + 1 }, (_, offset) => first + offset));
    },
    toggleSelect: (index: number) => {
      if (selected.has(index)) selected.delete(index);
      else selected.add(index);
    },
    clearSelection,
  };
  const itemsView = {
    domEl: itemRoot,
    tree: {
      _onSelection: (index: number, _shift: boolean, _toggle: boolean, moveFocused: boolean) => {
        if (moveFocused) focused = index;
      },
    },
    rowCount: rows.length,
    selection,
    getRow: (index: number) => rows[index],
    getRowIndexByID: (id: number) => {
      const index = rows.findIndex((row) => row.ref.id === id);
      return index < 0 ? false : index;
    },
    ensureRowIsVisible: () => {},
  };
  const body = themedElement('body');
  const documentElement = themedElement('html');
  const head = themedElement('head');
  const document = {
    get activeElement() {
      return active;
    },
    body,
    head,
    documentElement,
    createElementNS: () => {
      const element = themedElement();
      elements.push(element);
      return element;
    },
    createElement: () => themedElement(),
    getElementById: (id: string) => (id === 'item-tree-main-default' ? itemRoot : null),
    querySelector: () => null,
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'keydown') keydown.add(listener);
      onDocumentListener?.();
    },
    removeEventListener: (type: string, listener: EventListener) => {
      if (type === 'keydown') keydown.delete(listener);
    },
  } as unknown as Document;
  const window = {
    confirm,
    document,
    ZoteroPane: {
      itemsView,
      collectionsView: { domEl: collectionRoot },
      getSelectedItems: () => [...selected].flatMap((row) => rows[row]?.ref ?? []),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (callback: () => void) => {
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  } as unknown as MainWindow;
  const controller = createController({
    preferences: {
      has: () => false,
      get: (key, fallback) =>
        key === NOTE_EDITOR_ENABLED_PREFERENCE_KEY
          ? false
          : key === 'bindings'
            ? bindingOverrides
            : fallback,
      set: () => {},
      clear: () => {},
    },
    logger: { debug: () => {}, diagnostic: () => {} },
    reader: {
      start: () => {},
      shutdown: () => {},
      rescan: () => {},
      deactivateInactive: () => {},
      forwardKey,
      captureJumpLocation: () => null,
      restoreJumpLocation: async () => null,
    },
  } as Omit<MainWindowControllerDependencies, 'modules'>);
  controller.addWindow(window);

  const press = (key: string, options: Partial<KeyboardEvent> = {}) => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const event = {
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      preventDefault,
      stopPropagation,
      ...options,
    } as unknown as KeyboardEvent;
    for (const listener of [...keydown]) listener(event);
    return { preventDefault, stopPropagation };
  };

  return {
    controller,
    window,
    setBadgeRemoval: (callback: () => void) => {
      const badge = elements.find((element) => element.id === 'zotero-neo-item-select-status');
      if (!badge) throw new Error('Expected worksets badge');
      vi.mocked(badge.remove).mockImplementationOnce(callback);
    },
    elements,
    rowClasses,
    flush: () => {
      const pending = [...timers.values()];
      timers.clear();
      for (const callback of pending) callback();
    },
    onDocumentListener: (callback: (() => void) | undefined) => {
      onDocumentListener = callback;
    },
    press,
    clearSelection,
    confirm,
    forwardKey,
    focused: () => focused,
    selectedRows: () => [...selected].sort((a, b) => a - b),
    focusItems: () => {
      active = themedElement(`item-tree-main-default-row-${focused}`) as Element;
    },
    focusCollections: () => {
      active = themedElement('collection-tree-row-0') as Element;
    },
    focusEditable: () => {
      const editable = themedElement('quick-search');
      Reflect.set(editable, 'localName', 'input');
      Reflect.set(editable, 'tagName', 'INPUT');
      Reflect.set(editable, 'blur', vi.fn());
      active = editable;
      return editable;
    },
    focusReader: () => {
      const browser = themedElement('reader-browser');
      Reflect.set(browser, 'localName', 'browser');
      Reflect.set(browser, 'tagName', 'BROWSER');
      active = browser;
    },
  };
}

describe('Main window reentrant ownership', () => {
  it('keeps replacement input and row marks when module cleanup reopens the window', () => {
    const host = harness();
    host.press('s');
    host.flush();
    host.setBadgeRemoval(() => host.controller.addWindow(host.window));
    host.controller.removeWindow(host.window);
    expect(host.focused()).toBe(1);

    expect(host.press('s').preventDefault).toHaveBeenCalledOnce();
    host.flush();
    expect(host.rowClasses[0]!.has('zotero-neo-selection')).toBe(false);
    expect(host.rowClasses[1]!.has('zotero-neo-selection')).toBe(true);
    expect(host.rowClasses[1]!.has('zotero-neo-cursor')).toBe(true);
    host.controller.shutdown();
  });

  it('preserves replacement input and row marks when an older attachment fails', () => {
    const host = harness();
    host.controller.removeWindow(host.window);
    const failure = new Error('old attachment failed');
    host.onDocumentListener(() => {
      host.onDocumentListener(undefined);
      host.controller.removeWindow(host.window);
      host.controller.addWindow(host.window);
      throw failure;
    });
    expect(() => host.controller.addWindow(host.window)).toThrow(failure);
    expect(host.focused()).toBe(0);
    expect(host.press('s').preventDefault).toHaveBeenCalledOnce();
    host.flush();
    expect(host.rowClasses[0]!.has('zotero-neo-selection')).toBe(true);
    expect(host.rowClasses[0]!.has('zotero-neo-cursor')).toBe(false);
    expect(host.rowClasses[1]!.has('zotero-neo-cursor')).toBe(true);
    host.controller.shutdown();
  });
});

describe('Main transient-target Escape grammar', () => {
  it.each([
    { focused: 1, selected: [], expected: [1] },
    { focused: 1, selected: [0, 1], expected: [0, 1] },
    { focused: -1, selected: [], expected: [] },
  ])('anchors only an initially empty valid native Cursor: $focused / $selected', (initial) => {
    const host = harness('', initial);
    expect(host.selectedRows()).toEqual(initial.expected);
    expect(host.focused()).toBe(initial.focused);
    host.controller.shutdown();
  });

  it('collapses a native multi-target to its Cursor on Escape without clearing native selection', () => {
    const host = harness('', { focused: 1, selected: [0, 1] });
    const escape = host.press('Escape');
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(host.selectedRows()).toEqual([1]);
    expect(host.focused()).toBe(1);
    expect(host.clearSelection).not.toHaveBeenCalled();
    expect(host.press('Escape').preventDefault).not.toHaveBeenCalled();
    host.controller.shutdown();
  });

  it('passes Escape through without a transient target and keeps persistent clear on Space-s-c', () => {
    const host = harness();

    const empty = host.press('Escape');
    expect(empty.preventDefault).not.toHaveBeenCalled();
    expect(empty.stopPropagation).not.toHaveBeenCalled();

    const toggle = host.press('s');
    expect(toggle.preventDefault).toHaveBeenCalledOnce();
    expect(host.focused()).toBe(1);
    const normalEscape = host.press('Escape');
    expect(normalEscape.preventDefault).not.toHaveBeenCalled();
    expect(normalEscape.stopPropagation).not.toHaveBeenCalled();
    expect(host.focused()).toBe(1);

    host.press(' ');
    host.press('s');
    host.press('c');

    host.press('s');
    host.focusCollections();
    const collection = host.press('Escape');
    expect(collection.preventDefault).not.toHaveBeenCalled();
    expect(collection.stopPropagation).not.toHaveBeenCalled();
    expect(host.clearSelection).not.toHaveBeenCalled();

    host.controller.shutdown();
  });
  it('lets Visual Escape cancel the range while preserving persistent Selection', () => {
    const host = harness();
    host.press('s');
    host.press('v');
    const clearCalls = host.clearSelection.mock.calls.length;

    const visualEscape = host.press('Escape');
    expect(visualEscape.preventDefault).toHaveBeenCalledOnce();
    expect(visualEscape.stopPropagation).toHaveBeenCalledOnce();
    expect(host.clearSelection).toHaveBeenCalledTimes(clearCalls);

    const normalEscape = host.press('Escape');
    expect(normalEscape.preventDefault).not.toHaveBeenCalled();
    expect(normalEscape.stopPropagation).not.toHaveBeenCalled();
    expect(host.clearSelection).not.toHaveBeenCalled();
    host.controller.shutdown();
  });

  it('keeps editable and Reader Escape routes ahead of Main transient-target cancel', () => {
    const editableHost = harness();
    editableHost.press('s');
    const editable = editableHost.focusEditable();
    const editableEscape = editableHost.press('Escape');
    expect(editableEscape.preventDefault).toHaveBeenCalledOnce();
    expect(editable.blur).toHaveBeenCalledOnce();
    expect(editableHost.clearSelection).not.toHaveBeenCalled();
    editableHost.focusItems();
    editableHost.press('Escape');
    expect(editableHost.clearSelection).not.toHaveBeenCalled();
    editableHost.controller.shutdown();

    const readerHost = harness();
    readerHost.press('s');
    readerHost.focusReader();
    const readerEscape = readerHost.press('Escape');
    expect(readerHost.forwardKey).toHaveBeenCalledOnce();
    expect(readerHost.clearSelection).not.toHaveBeenCalled();
    expect(readerEscape.preventDefault).not.toHaveBeenCalled();
    readerHost.focusItems();
    readerHost.press('Escape');
    expect(readerHost.clearSelection).not.toHaveBeenCalled();
    readerHost.controller.shutdown();
  });

  it('keeps persistent Selection unchanged when Main Trash is cancelled', async () => {
    const originalZotero = Reflect.get(globalThis, 'Zotero');
    const items = [
      { id: 10, libraryID: 1 },
      { id: 11, libraryID: 1 },
    ] as Zotero.Item[];
    const trashTx = vi.fn(async () => {});
    const host = harness();
    Reflect.set(globalThis, 'Zotero', {
      Items: { get: (id: number) => items.find((item) => item.id === id) ?? false, trashTx },
    });
    try {
      host.press('s');
      host.press('x');
      await Promise.resolve();

      expect(host.confirm).toHaveBeenCalledOnce();
      expect(trashTx).not.toHaveBeenCalled();
      host.confirm.mockReturnValue(true);
      host.press('x');
      await vi.waitFor(() => expect(trashTx).toHaveBeenCalledWith([10]));
    } finally {
      host.controller.shutdown();
      if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
      else Reflect.set(globalThis, 'Zotero', originalZotero);
    }
  });
  it('preserves a newer Visual range after asynchronous Trash succeeds', async () => {
    const originalZotero = Reflect.get(globalThis, 'Zotero');
    const items = [
      { id: 10, libraryID: 1 },
      { id: 11, libraryID: 1 },
    ] as Zotero.Item[];
    let resolveFirstTrash: (() => void) | undefined;
    const trashTx = vi.fn(async (_ids: readonly number[]) => {});
    trashTx.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstTrash = resolve;
        }),
    );
    const host = harness(JSON.stringify({ 'main-select:x': 'mainTrashItems' }));
    host.confirm.mockReturnValue(true);
    Reflect.set(globalThis, 'Zotero', {
      Items: {
        get: (id: number) => items.find((item) => item.id === id) ?? false,
        trashTx,
      },
    });
    const status = vi.spyOn(MainNavigation.prototype, 'status');

    try {
      host.press('v');
      host.press('j');
      host.press('x');
      await vi.waitFor(() => expect(trashTx).toHaveBeenCalledOnce());
      expect(trashTx).toHaveBeenCalledWith([10, 11]);

      host.press('Escape');
      host.press('v');
      host.press('k');
      if (!resolveFirstTrash) throw new Error('Expected deferred Trash operation');
      resolveFirstTrash();
      await vi.waitFor(() =>
        expect(status.mock.calls.some(([, message]) => message.startsWith('✓'))).toBe(true),
      );

      host.press('x');
      await vi.waitFor(() => expect(trashTx).toHaveBeenCalledTimes(2));
      expect(trashTx).toHaveBeenNthCalledWith(2, [10, 11]);
    } finally {
      host.controller.shutdown();
      status.mockRestore();
      if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
      else Reflect.set(globalThis, 'Zotero', originalZotero);
    }
  });
  it('leaves IME-owned Escape and nested contenteditable keys native', () => {
    const host = harness();
    host.press(' ');
    const composingEscape = host.press('Escape', { isComposing: true });
    const processBackspace = host.press('Backspace', { keyCode: 229 });
    expect(composingEscape.preventDefault).not.toHaveBeenCalled();
    expect(processBackspace.preventDefault).not.toHaveBeenCalled();
    expect(host.press('Escape').preventDefault).toHaveBeenCalledOnce();

    const editor = themedElement('nested-editor');
    Reflect.set(editor, 'isContentEditable', true);
    const native = host.press('j', { target: editor });
    expect(native.preventDefault).not.toHaveBeenCalled();
    expect(host.focused()).toBe(0);
    host.controller.shutdown();
  });
});
