import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { MainLocalFind, findVisibleMainItemRow } from '../../src/main/local-find';
import { SelectionStore } from '../../src/main/selection-store';
import type { MainWindowSession } from '../../src/main/session';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function item(
  id: number,
  title: string,
  options: {
    libraryID?: number;
    author?: string;
    year?: string;
    citekey?: string;
  } = {},
): Zotero.Item {
  const libraryID = options.libraryID ?? 1;
  return {
    id,
    libraryID,
    getDisplayTitle: () => title,
    getField: (field: string) => {
      if (field === 'title') return title;
      if (field === 'year') return options.year ?? '';
      if (field === 'citationKey') return options.citekey ?? '';
      return '';
    },
    getCreators: () =>
      options.author ? [{ firstName: '', lastName: options.author, creatorType: 'author' }] : [],
    isRegularItem: () => true,
  } as unknown as Zotero.Item;
}

function harness(items: readonly Zotero.Item[], visibleIDs: readonly number[], initialFocused = 0) {
  const byID = new Map(items.map((value) => [value.id, value]));
  vi.stubGlobal('Zotero', {
    Items: { get: (id: number) => byID.get(id) ?? false },
  });

  const rows = visibleIDs.map((id) => ({
    isObjectRow: true,
    ref: byID.get(id),
  }));
  let focused = initialFocused;
  const nativeSelected = new Set([0, Math.max(0, rows.length - 1)]);
  const select = vi.fn((index: number) => {
    focused = index;
    nativeSelected.clear();
    nativeSelected.add(index);
  });
  const ensureRowIsVisible = vi.fn();

  const window = {
    ZoteroPane: {
      itemsView: {
        get rowCount() {
          return rows.length;
        },
        selection: {
          get focused() {
            return focused;
          },
          select,
        },
        getRow: (index: number) => rows[index],
        ensureRowIsVisible,
      },
    },
  } as unknown as MainWindow;

  const selection = new SelectionStore();
  for (const id of visibleIDs.slice(0, 2)) {
    const value = byID.get(id);
    if (value) selection.add({ libraryID: value.libraryID, itemID: value.id });
  }

  const session = {
    window,
    selection,
    localFind: {
      open: false,
      query: '',
      overlay: null,
      input: null,
      previousElement: null,
      themeCleanup: null,
    },
  } as unknown as MainWindowSession;

  const statuses: string[] = [];
  const find = new MainLocalFind((_session, text) => statuses.push(text));

  return {
    window,
    session,
    find,
    statuses,
    select,
    ensureRowIsVisible,
    nativeSelected,
    focused: () => focused,
  };
}

function key(value: string, composing = false): KeyboardEvent {
  return {
    key: value,
    isComposing: composing,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe('Main local find', () => {
  it('searches visible rows forward by metadata and wraps once', () => {
    const alpha = item(1, 'Alpha systems', { author: 'Smith', year: '2020' });
    const beta = item(2, 'Beta methods');
    const gamma = item(3, 'Gamma paper', { citekey: 'gamma2024' });
    const delta = item(4, 'Delta systems', { author: 'Smith', year: '2024' });
    const h = harness([alpha, beta, gamma, delta], [1, 2, 3, 4], 1);

    expect(findVisibleMainItemRow(h.window, 'smith 2024', 1)).toBe(3);
    expect(findVisibleMainItemRow(h.window, '@gamma2024', 1)).toBe(2);

    const wrapped = harness([alpha, beta, gamma, delta], [1, 2, 3, 4], 3);
    expect(findVisibleMainItemRow(wrapped.window, 'alpha', 1)).toBe(0);
  });

  it('searches backward and ignores items hidden from the current View', () => {
    const alpha = item(1, 'Alpha');
    const beta = item(2, 'Beta');
    const hidden = item(3, 'Hidden target');
    const delta = item(4, 'Delta target');
    const h = harness([alpha, beta, hidden, delta], [1, 2, 4], 0);

    expect(findVisibleMainItemRow(h.window, 'target', -1)).toBe(2);
    expect(findVisibleMainItemRow(h.window, 'hidden', 1)).toBeUndefined();
  });

  it('moves only Cursor on repeat and leaves Selection unchanged on match or miss', () => {
    const alpha = item(1, 'Alpha');
    const beta = item(2, 'Beta');
    const gamma = item(3, 'Gamma');
    const h = harness([alpha, beta, gamma], [1, 2, 3], 0);
    const before = h.session.selection.values();

    h.session.localFind.query = 'gamma';
    expect(h.find.repeat(h.window, h.session, 1)).toBe(true);
    expect(h.focused()).toBe(2);
    expect(h.select).toHaveBeenCalledWith(2, false);
    expect([...h.nativeSelected]).toEqual([2]);
    expect(h.ensureRowIsVisible).toHaveBeenCalledWith(2);
    expect(h.session.selection.values()).toEqual(before);

    h.session.localFind.query = 'missing';
    expect(h.find.repeat(h.window, h.session, 1)).toBe(false);
    expect(h.focused()).toBe(2);
    expect(h.session.selection.values()).toEqual(before);
    expect(h.statuses.at(-1)).toContain('No visible match');
  });

  it('commits Enter from the prompt and Esc preserves the previous committed query', () => {
    const alpha = item(1, 'Alpha');
    const beta = item(2, 'Beta');
    const h = harness([alpha, beta], [1, 2], 0);

    h.session.localFind.open = true;
    h.session.localFind.query = 'alpha';
    h.session.localFind.input = { value: 'beta' } as HTMLInputElement;
    h.session.localFind.overlay = { remove: vi.fn() } as unknown as HTMLElement;
    h.find.handleKey(key('Enter'), h.window, h.session);

    expect(h.session.localFind.query).toBe('beta');
    expect(h.session.localFind.open).toBe(false);
    expect(h.focused()).toBe(1);

    h.session.localFind.open = true;
    h.session.localFind.query = 'beta';
    h.session.localFind.input = { value: 'alpha' } as HTMLInputElement;
    h.session.localFind.overlay = { remove: vi.fn() } as unknown as HTMLElement;
    h.find.handleKey(key('Escape'), h.window, h.session);

    expect(h.session.localFind.query).toBe('beta');
    expect(h.session.localFind.open).toBe(false);
  });

  it('does not commit Enter while IME composition is active', () => {
    const alpha = item(1, 'Alpha');
    const h = harness([alpha], [1], 0);
    h.session.localFind.open = true;
    h.session.localFind.query = 'old';
    h.session.localFind.input = { value: 'new' } as HTMLInputElement;

    h.find.handleKey(key('Enter', true), h.window, h.session);

    expect(h.session.localFind.query).toBe('old');
    expect(h.session.localFind.open).toBe(true);
  });
});
