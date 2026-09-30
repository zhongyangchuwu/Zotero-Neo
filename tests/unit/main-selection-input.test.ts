import { describe, expect, it, vi } from 'vitest';
import type { MainWindow, MainWindowControllerDependencies } from '../../src/core/contracts';
import { NOTE_EDITOR_ENABLED_PREFERENCE_KEY } from '../../src/core/preferences';
import { createMainWindowController } from '../../src/main/controller';
import { MainItemSelect } from '../../src/main/item-select';

import { SelectionStore } from '../../src/main/selection-store';
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

function harness(bindingOverrides = '') {
  const rows = [
    { isObjectRow: true, ref: { id: 10, libraryID: 1 } },
    { isObjectRow: true, ref: { id: 11, libraryID: 1 } },
  ];
  let focused = 0;
  let pivot = 0;
  let selected = new Set([0]);
  let active = themedElement('item-tree-main-default-row-0') as Element;
  let keydown: EventListener | undefined;
  const forwardKey = vi.fn();
  const confirm = vi.fn(() => false);
  const itemRoot = themedElement('item-tree-main-default');
  Reflect.set(
    itemRoot,
    'contains',
    (node: unknown) => node === active && active.id.includes('item-tree'),
  );
  Reflect.set(itemRoot, 'querySelectorAll', () => []);
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
    createElementNS: () => themedElement(),
    createElement: () => themedElement(),
    getElementById: (id: string) => (id === 'item-tree-main-default' ? itemRoot : null),
    querySelector: () => null,
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'keydown') keydown = listener;
    },
    removeEventListener: () => {},
  } as unknown as Document;
  const window = {
    confirm,
    document,
    ZoteroPane: { itemsView, collectionsView: { domEl: collectionRoot } },
    addEventListener: () => {},
    removeEventListener: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
  } as unknown as MainWindow;
  const controller = createMainWindowController({
    preferences: {
      has: () => false,
      get: (key, fallback) =>
        key === NOTE_EDITOR_ENABLED_PREFERENCE_KEY
          ? false
          : key === 'bindings'
            ? bindingOverrides
            : fallback,
      set: () => {},
    },
    logger: { debug: () => {}, diagnostic: () => {} },
    reader: {
      start: () => {},
      shutdown: () => {},
      rescan: () => {},
      deactivateInactive: () => {},
      forwardKey,
    },
  } as MainWindowControllerDependencies);
  controller.addWindow(window);

  const press = (key: string, options: Partial<KeyboardEvent> = {}) => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    keydown?.({
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      preventDefault,
      stopPropagation,
      ...options,
    } as unknown as KeyboardEvent);
    return { preventDefault, stopPropagation };
  };

  return {
    controller,
    press,
    clearSelection,
    confirm,
    forwardKey,
    focused: () => focused,
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

describe('Main transient-target Escape grammar', () => {
  it('passes Escape through without a transient target and keeps persistent clear on Space-s-c', () => {
    const clearPersistent = vi.spyOn(MainItemSelect.prototype, 'clearSelection');
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
    expect(clearPersistent).not.toHaveBeenCalled();
    expect(host.focused()).toBe(1);

    host.press(' ');
    host.press('s');
    host.press('c');
    expect(clearPersistent).toHaveBeenCalledOnce();

    host.press('s');
    host.focusCollections();
    const collection = host.press('Escape');
    expect(collection.preventDefault).not.toHaveBeenCalled();
    expect(collection.stopPropagation).not.toHaveBeenCalled();
    expect(host.clearSelection).not.toHaveBeenCalled();

    host.controller.shutdown();
    clearPersistent.mockRestore();
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

  it('uses the exact Normal or Visual keymap after commit, cancel, and focus loss', () => {
    const enter = vi.spyOn(MainItemSelect.prototype, 'enter');
    const finish = vi.spyOn(MainItemSelect.prototype, 'finish');
    const cancel = vi.spyOn(MainItemSelect.prototype, 'cancel');
    const leave = vi.spyOn(MainItemSelect.prototype, 'leave');
    const toggle = vi.spyOn(MainItemSelect.prototype, 'toggleCurrentTarget');
    const host = harness();
    try {
      expect(host.press('v').preventDefault).toHaveBeenCalledOnce();
      host.press('j');
      expect(host.focused()).toBe(1);
      host.press('s');
      expect(finish).toHaveBeenCalledOnce();
      expect(toggle).not.toHaveBeenCalled();

      host.press('v');
      host.press('Escape');
      expect(cancel).toHaveBeenCalledOnce();
      host.press('v');
      host.focusCollections();
      const focusLoss = host.press('j');
      expect(leave).toHaveBeenCalledOnce();
      expect(focusLoss.preventDefault).not.toHaveBeenCalled();
      host.focusItems();
      host.press('s');
      expect(toggle).toHaveBeenCalledOnce();
      expect(finish).toHaveBeenCalledOnce();
      host.press('v');
      expect(enter).toHaveBeenCalledTimes(4);
    } finally {
      host.controller.shutdown();
      enter.mockRestore();
      finish.mockRestore();
      cancel.mockRestore();
      leave.mockRestore();
      toggle.mockRestore();
    }
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
    const item = { id: 10, libraryID: 1 } as Zotero.Item;
    const trashTx = vi.fn(async () => {});
    const remove = vi.spyOn(SelectionStore.prototype, 'remove');
    const host = harness();
    Reflect.set(globalThis, 'Zotero', {
      Items: { get: (id: number) => (id === item.id ? item : false), trashTx },
    });
    try {
      host.press('s');
      host.press('x');
      await Promise.resolve();

      expect(host.confirm).toHaveBeenCalledWith(
        'Move Neo Selection · 1 item to Zotero Trash? You can restore it with Zotero Undo.',
      );
      expect(trashTx).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    } finally {
      host.controller.shutdown();
      remove.mockRestore();
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
