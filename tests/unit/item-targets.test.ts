import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { mainCursorItem, mainEffectiveItems } from '../../src/main/item-targets';
import { SelectionStore } from '../../src/main/selection-store';

function item(id: number, libraryID = 1): Zotero.Item {
  return { id, libraryID } as Zotero.Item;
}

function host(items: readonly Zotero.Item[], focused = 1, nativeSelected = [items[0]]) {
  const rows = items.map((ref) => ({ ref }));
  const window = {
    ZoteroPane: {
      itemsView: {
        rowCount: rows.length,
        getRow: (index: number) => rows[index],
        selection: { focused },
      },
      getSelectedItems: () => nativeSelected.filter((value): value is Zotero.Item => !!value),
    },
  } as unknown as MainWindow;
  return { window };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Main item target contracts', () => {
  it('resolves Cursor independently from native selected rows', () => {
    const a = item(10);
    const b = item(11);
    const c = item(12);
    const h = host([a, b, c], 1, [a, c]);
    vi.stubGlobal('Zotero', {
      Items: { get: (id: number) => [a, b, c].find((value) => value.id === id) ?? false },
    });

    expect(mainCursorItem(h.window)).toBe(b);
  });

  it('uses Cursor when the explicit Selection workset is empty', () => {
    const a = item(10);
    const b = item(11);
    const c = item(12);
    const h = host([a, b, c], 1, [a, c]);
    vi.stubGlobal('Zotero', {
      Items: { get: (id: number) => [a, b, c].find((value) => value.id === id) ?? false },
    });
    const selection = new SelectionStore();

    expect(mainEffectiveItems(h.window, selection)).toEqual([b]);
  });

  it('uses stable explicit workset identities instead of Cursor when Selection is non-empty', () => {
    const a = item(10);
    const b = item(11);
    const c = item(12);
    const h = host([a, b, c], 1, [b]);
    vi.stubGlobal('Zotero', {
      Items: { get: (id: number) => [a, b, c].find((value) => value.id === id) ?? false },
    });
    const selection = new SelectionStore();
    selection.replace([
      { libraryID: 1, itemID: 10 },
      { libraryID: 1, itemID: 12 },
    ]);

    expect(mainEffectiveItems(h.window, selection)).toEqual([a, c]);
  });

  it('keeps native selection only as a compatibility path for callers without a workset', () => {
    const a = item(10);
    const b = item(11);
    const c = item(12);
    const h = host([a, b, c], 1, [a, c]);

    expect(mainEffectiveItems(h.window, undefined)).toEqual([a, c]);
  });
});
