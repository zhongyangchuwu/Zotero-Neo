import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { resolveMainEffectiveTargets } from '../../src/main/action-targets';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function item(id: number, libraryID = 1): Zotero.Item {
  return { id, libraryID } as Zotero.Item;
}

function harness(visible: readonly Zotero.Item[], focused = 0) {
  const byID = new Map(visible.map((value) => [value.id, value]));
  const all = new Map(byID);
  vi.stubGlobal('Zotero', {
    Items: { get: (id: number) => all.get(id) ?? false },
  });

  const rows = visible.map((ref) => ({ isObjectRow: true, ref }));
  const window = {
    ZoteroPane: {
      itemsView: {
        rowCount: rows.length,
        selection: { focused },
        getRow: (index: number) => rows[index],
        getRowIndexByID: (id: number) => {
          const index = rows.findIndex((row) => row.ref.id === id);
          return index < 0 ? false : index;
        },
      },
    },
  } as unknown as MainWindow;
  const session = { selection: new SelectionStore() } as unknown as MainWindowSession;

  return {
    window,
    session,
    install: (...items: Zotero.Item[]) => {
      for (const value of items) all.set(value.id, value);
    },
  };
}

describe('Main action targets', () => {
  it('falls back to Cursor when the explicit Selection is empty', () => {
    const first = item(10);
    const second = item(11);
    const h = harness([first, second], 1);

    expect(resolveMainEffectiveTargets(h.window, h.session)).toMatchObject({
      source: 'cursor',
      refs: [{ libraryID: 1, itemID: 11 }],
      items: [second],
      total: 1,
      visible: 1,
      hidden: 0,
      missing: 0,
    });
  });

  it('uses the explicit Selection even when Cursor is elsewhere', () => {
    const first = item(10);
    const cursor = item(11);
    const hidden = item(12);
    const h = harness([first, cursor], 1);
    h.install(hidden);
    h.session.selection.add({ libraryID: 1, itemID: first.id });
    h.session.selection.add({ libraryID: 1, itemID: hidden.id });

    expect(resolveMainEffectiveTargets(h.window, h.session)).toMatchObject({
      source: 'selection',
      items: [first, hidden],
      total: 2,
      visible: 1,
      hidden: 1,
      missing: 0,
    });
  });

  it('reports stale identities without resolving an item from the wrong library', () => {
    const visible = item(10, 1);
    const h = harness([visible]);
    h.session.selection.add({ libraryID: 2, itemID: 10 });
    h.session.selection.add({ libraryID: 1, itemID: 99 });

    expect(resolveMainEffectiveTargets(h.window, h.session)).toMatchObject({
      source: 'selection',
      items: [],
      total: 2,
      visible: 0,
      hidden: 2,
      missing: 2,
    });
  });
});
