import { afterEach, describe, expect, it } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { mainIdentifierLookupOwnsInput, openMainIdentifierLookup } from '../../src/toolkit/main';

const originalZotero = Reflect.get(globalThis, 'Zotero');
afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function harness() {
  const scope = { libraryIDs: [1], collectionIDs: [11, 12] };
  const libraries = new Map([
    [1, { editable: true }],
    [2, { editable: true }],
  ]);
  const reader = { id: 'reader' };
  const document = {
    activeElement: reader as unknown,
    getElementById: (id: string): unknown => {
      if (id === 'zotero-lookup-panel') return panel;
      if (id === 'zotero-tb-lookup') return button;
      if (id === 'item-tree-main-default') return items;
      return null;
    },
  };
  const input = {
    value: '10.1038/171737a0',
    selectionStart: 3,
    selectionEnd: 9,
    focus: () => {
      document.activeElement = input;
    },
    select: () => {
      input.selectionStart = 0;
      input.selectionEnd = input.value.length;
      document.activeElement = input;
    },
  };
  const panel = { state: 'closed' };
  const button = { disabled: false, getAttribute: () => null };
  const items = {
    focus: () => {
      document.activeElement = items;
    },
  };
  const nativeFocusTasks: Array<() => void> = [];
  const tabs = {
    selectedID: 'reader',
    _tabs: [{ id: 'zotero-pane' }, { id: 'reader' }],
    select: (id: string, _reopening?: boolean, options?: { keepTabFocused?: boolean }) => {
      tabs.selectedID = id;
      if (!options?.keepTabFocused) nativeFocusTasks.push(items.focus);
    },
  };
  const nativeWindowState = { value: 3 };
  const lookup = {
    getActivePanel: () => ({ querySelector: () => input }),
    showPanel: () => {
      if (nativeWindowState.value === 2) return;
      panel.state = 'open';
      input.focus();
    },
  };
  const window = {
    document,
    Zotero_Tabs: tabs,
    ZoteroPane: {
      getSelectedLibraryIDs: () => scope.libraryIDs,
      itemsView: { tree: { _topDiv: items } },
    },
    Zotero_Lookup: lookup,
    STATE_MINIMIZED: 2,
    get windowState() {
      return nativeWindowState.value;
    },
    restore: () => {
      nativeWindowState.value = 3;
    },
    focus: () => {},
  } as unknown as MainWindow;
  Reflect.set(globalThis, 'Zotero', {
    Libraries: { get: (id: number) => libraries.get(id) ?? false },
  });
  return {
    window,
    document,
    input,
    panel,
    button,
    items,
    tabs,
    lookup,
    scope,
    libraries,
    reader,
    nativeWindowState,
    flushNativeFocus: () => {
      for (const focus of nativeFocusTasks.splice(0)) focus();
    },
  };
}

describe('native identifier entry', () => {
  it('opens the Library input from Reader without changing its collection scope', () => {
    const h = harness();
    const collections = [...h.scope.collectionIDs];
    expect(openMainIdentifierLookup(h.window)).toBe(true);
    h.flushNativeFocus();
    expect(h.tabs.selectedID).toBe('zotero-pane');
    expect(h.document.activeElement).toBe(h.input);
    expect(h.panel.state).toBe('open');
    expect(h.scope.collectionIDs).toEqual(collections);
    expect(h.input.value).toBe('10.1038/171737a0');
  });

  it('restores a minimized owner before opening its native input', () => {
    const h = harness();
    h.nativeWindowState.value = 2;
    expect(openMainIdentifierLookup(h.window)).toBe(true);
    expect(h.nativeWindowState.value).toBe(3);
    expect(h.document.activeElement).toBe(h.input);
    expect(h.panel.state).toBe('open');
  });

  it('refocuses an open draft without selecting or replacing its text', () => {
    const h = harness();
    h.panel.state = 'open';
    h.tabs.selectedID = 'zotero-pane';
    expect(openMainIdentifierLookup(h.window)).toBe(true);
    expect(h.document.activeElement).toBe(h.input);
    expect(h.input.value).toBe('10.1038/171737a0');
    expect([h.input.selectionStart, h.input.selectionEnd]).toEqual([3, 9]);
  });

  it('does not leave Reader or guess a destination for multiple libraries', () => {
    const h = harness();
    h.scope.libraryIDs = [1, 2];
    expect(openMainIdentifierLookup(h.window)).toBe(false);
    expect(h.tabs.selectedID).toBe('reader');
    expect(h.document.activeElement).toBe(h.reader);
    expect(h.panel.state).toBe('closed');
    expect(h.scope.collectionIDs).toEqual([11, 12]);
  });

  it('does not expose identifier entry in a read-only library or disabled native context', () => {
    const h = harness();
    h.libraries.set(1, { editable: false });
    expect(openMainIdentifierLookup(h.window)).toBe(false);
    expect(h.tabs.selectedID).toBe('reader');
    expect(h.panel.state).toBe('closed');

    h.libraries.set(1, { editable: true });
    h.button.disabled = true;
    expect(openMainIdentifierLookup(h.window)).toBe(false);
    expect(h.tabs.selectedID).toBe('reader');
    expect(h.panel.state).toBe('closed');
  });

  it('does not switch tabs when a selected library has been unloaded', () => {
    const h = harness();
    h.libraries.delete(1);
    expect(openMainIdentifierLookup(h.window)).toBe(false);
    expect(h.tabs.selectedID).toBe('reader');
    expect(h.document.activeElement).toBe(h.reader);
    expect(h.panel.state).toBe('closed');
  });

  it('does not fall back to a personal library when the native scope is empty', () => {
    const h = harness();
    h.scope.libraryIDs = [];
    expect(openMainIdentifierLookup(h.window)).toBe(false);
    expect(h.tabs.selectedID).toBe('reader');
    expect(h.panel.state).toBe('closed');
  });

  it('does not open against a Library tab that is no longer available', () => {
    const h = harness();
    h.tabs._tabs = [{ id: 'reader' }];
    expect(openMainIdentifierLookup(h.window)).toBe(false);
    expect(h.tabs.selectedID).toBe('reader');
    expect(h.document.activeElement).toBe(h.reader);
    expect(h.panel.state).toBe('closed');
  });

  it('keeps native input ownership through closing without reopening the popup', () => {
    const h = harness();
    h.panel.state = 'open';
    expect(mainIdentifierLookupOwnsInput(h.window)).toBe(true);
    h.panel.state = 'hiding';
    expect(mainIdentifierLookupOwnsInput(h.window)).toBe(true);
    expect(openMainIdentifierLookup(h.window)).toBe(false);
    expect(h.panel.state).toBe('hiding');
    h.panel.state = 'closed';
    expect(mainIdentifierLookupOwnsInput(h.window)).toBe(false);
  });
});
