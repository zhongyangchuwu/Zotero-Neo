import { describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { MainNavigation } from '../../src/main/navigation';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';

const logger = { debug: vi.fn(), diagnostic: vi.fn() };

function navigationHost() {
  const active = { id: 'item-tree-row-0' } as unknown as Element;
  const selection = {
    focused: 0,
    pivot: 0,
    count: 2,
    selected: new Set([0, 2]),
    select: vi.fn(),
  };
  const rows = [
    { ref: { id: 10, libraryID: 1 } },
    { ref: { id: 11, libraryID: 1 } },
    { ref: { id: 12, libraryID: 1 } },
  ];
  const onSelection = vi.fn(
    (index: number, _shiftSelect: boolean, _toggleSelection: boolean, moveFocused: boolean) => {
      if (!moveFocused) return;
      selection.focused = index;
      selection.pivot = index;
    },
  );
  const itemsView = {
    rowCount: rows.length,
    domEl: { contains: (node: unknown) => node === active },
    selection,
    tree: { _onSelection: onSelection },
    getRow: (index: number) => rows[index],
  };
  const document = {
    activeElement: active,
    getElementById: () => null,
    querySelector: () => null,
  } as unknown as Document;
  const window = {
    document,
    ZoteroPane: { itemsView },
  } as unknown as MainWindow;
  const session = {
    activePanel: 'items',
    selection: new SelectionStore(),
    selectionIndicator: null,
  } as unknown as MainWindowSession;
  return { window, session, selection, onSelection };
}

describe('MainNavigation v0.2 item cursor', () => {
  it('moves item Cursor without collapsing native multi-selection', () => {
    const host = navigationHost();
    const navigation = new MainNavigation(logger, () => {});
    const selectedBefore = [...host.selection.selected];

    navigation.navigate(host.window, host.session, 1, 1, true);

    expect(host.onSelection).toHaveBeenCalledWith(1, false, false, true, true);
    expect(host.selection.focused).toBe(1);
    expect([...host.selection.selected]).toEqual(selectedBefore);
    expect(host.selection.select).not.toHaveBeenCalled();
  });

  it('keeps item counts and workset membership independent from Cursor motion', () => {
    const host = navigationHost();
    host.session.selection.replace([
      { libraryID: 1, itemID: 10 },
      { libraryID: 1, itemID: 12 },
    ]);
    const indicator = {
      id: '',
      textContent: '',
      style: { cssText: '' },
      remove: vi.fn(),
    } as unknown as HTMLElement;
    const append = vi.fn();
    Reflect.set(host.window, 'document', {
      ...host.window.document,
      activeElement: host.window.document.activeElement,
      createElementNS: () => indicator,
      body: { append },
      documentElement: { append },
    });
    Reflect.set(host.session, 'theme', { add: vi.fn() });

    const navigation = new MainNavigation(logger, () => {});
    navigation.navigate(host.window, host.session, 1, 1);

    expect(host.session.selection.values()).toEqual([
      { libraryID: 1, itemID: 10 },
      { libraryID: 1, itemID: 12 },
    ]);
    expect(indicator.textContent).toBe('Selection 2 · 2 visible');
    expect(append).toHaveBeenCalledWith(indicator);
  });
});
