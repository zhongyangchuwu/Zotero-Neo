import { describe, expect, it, vi } from 'vitest';
import type { MainWindow, MainWindowControllerDependencies } from '../../src/core/contracts';
import { NOTE_EDITOR_ENABLED_PREFERENCE_KEY } from '../../src/core/preferences';
import { createMainWindowController } from '../../src/main/controller';

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

function harness() {
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
      get: (key, fallback) => (key === NOTE_EDITOR_ENABLED_PREFERENCE_KEY ? false : fallback),
      set: () => {},
    },
    logger: { debug: () => {}, diagnostic: () => {} },
    reader: { start: () => {}, shutdown: () => {}, rescan: () => {}, forwardKey },
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
      shiftKey: false,
      repeat: false,
      preventDefault,
      stopPropagation,
    } as unknown as KeyboardEvent);
    return { preventDefault, stopPropagation };
  };

  return {
    controller,
    press,
    clearSelection,
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

describe('Main Selection Escape grammar', () => {
  it('passes empty and collection-tree Escape through, but clears Selection from the item list', () => {
    const host = harness();

    const empty = host.press('Escape');
    expect(empty.preventDefault).not.toHaveBeenCalled();
    expect(empty.stopPropagation).not.toHaveBeenCalled();

    const toggle = host.press('s');
    expect(toggle.preventDefault).toHaveBeenCalledOnce();
    expect(host.focused()).toBe(1);
    const clear = host.press('Escape');
    expect(clear.preventDefault).toHaveBeenCalledOnce();
    expect(clear.stopPropagation).toHaveBeenCalledOnce();
    expect(host.clearSelection).not.toHaveBeenCalled();
    expect(host.focused()).toBe(1);

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
    expect(normalEscape.preventDefault).toHaveBeenCalledOnce();
    expect(host.clearSelection).not.toHaveBeenCalled();
    host.controller.shutdown();
  });

  it('keeps editable and Reader Escape routes ahead of Main Selection clearing', () => {
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
});
