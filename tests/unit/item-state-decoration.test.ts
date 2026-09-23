import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import {
  MainItemStateDecoration,
  itemDecorationClasses,
  type MainVisualRange,
} from '../../src/main/item-state-decoration';
import { SelectionStore } from '../../src/main/selection-store';
import type { ThemeManager } from '../../src/ui/theme';

type TestRow = HTMLElement & { readonly classes: Set<string> };

type ObservedMutation = {
  readonly target: Node;
  readonly options: MutationObserverInit;
  readonly callback: MutationCallback;
  disconnected: boolean;
};

function rowElement(index: number): TestRow {
  const classes = new Set<string>();
  return {
    id: `item-tree-main-default-row-${index}`,
    classes,
    classList: {
      toggle: (name: string, force: boolean) => {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
    },
  } as unknown as TestRow;
}

function decorationHarness(
  renderedIndexes: readonly number[],
  visual: MainVisualRange | undefined,
) {
  let focused = renderedIndexes[0] ?? 0;
  let currentRoot: HTMLElement;
  const body = {} as HTMLElement;
  const parent = {} as HTMLElement;
  const style = { id: '', textContent: '', remove: vi.fn() } as unknown as HTMLStyleElement;
  const mutations: ObservedMutation[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const getRow = vi.fn((index: number) => ({
    isObjectRow: true,
    ref: { id: index + 1, libraryID: 1 },
  }));

  const makeRoot = (indexes: readonly number[]) => {
    const rows = indexes.map(rowElement);
    const root = {
      parentElement: parent,
      rows,
      querySelectorAll: () => rows,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement & { readonly rows: TestRow[] };
    return root;
  };
  currentRoot = makeRoot(renderedIndexes);

  class FakeMutationObserver {
    readonly callback: MutationCallback;
    readonly record: ObservedMutation;
    constructor(callback: MutationCallback) {
      this.callback = callback;
      this.record = {
        target: null as unknown as Node,
        options: {},
        callback,
        disconnected: false,
      };
      mutations.push(this.record);
    }
    observe(target: Node, options: MutationObserverInit): void {
      Reflect.set(this.record, 'target', target);
      Reflect.set(this.record, 'options', options);
    }
    disconnect(): void {
      this.record.disconnected = true;
    }
  }

  const window = {
    document: {
      body,
      head: { append: vi.fn() },
      documentElement: {},
      createElementNS: () => style,
      getElementById: (id: string) => (id === 'item-tree-main-default' ? currentRoot : null),
    },
    ZoteroPane: {
      itemsView: {
        rowCount: 10_000,
        selection: {
          get focused() {
            return focused;
          },
        },
        getRow,
      },
    },
    MutationObserver: FakeMutationObserver,
    setTimeout: (callback: () => void) => {
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id: number | undefined) => {
      if (id !== undefined) timers.delete(id);
    },
  } as unknown as MainWindow;
  const selection = new SelectionStore();
  const theme = {
    theme: 'light',
    observe: () => () => {},
  } as unknown as ThemeManager;
  const decoration = new MainItemStateDecoration();

  const flush = (): void => {
    const pending = [...timers.values()];
    timers.clear();
    for (const callback of pending) callback();
  };
  const emit = (target: Node, type: 'attributes' | 'childList', attributeName?: string): void => {
    for (const mutation of [...mutations]) {
      if (mutation.disconnected || mutation.target !== target) continue;
      if (type === 'childList' && !mutation.options.childList) continue;
      if (type === 'attributes') {
        if (!mutation.options.attributes) continue;
        if (
          mutation.options.attributeFilter &&
          (!attributeName || !mutation.options.attributeFilter.includes(attributeName))
        )
          continue;
      }
      mutation.callback(
        [{ type, attributeName: attributeName ?? null } as MutationRecord],
        {} as MutationObserver,
      );
    }
  };

  return {
    window,
    body,
    parent,
    style,
    selection,
    theme,
    decoration,
    mutations,
    timers,
    getRow,
    flush,
    emit,
    root: () => currentRoot as HTMLElement & { readonly rows: TestRow[] },
    replaceRoot: (indexes: readonly number[]) => {
      const previous = currentRoot as HTMLElement & { readonly rows: TestRow[] };
      currentRoot = makeRoot(indexes);
      return previous;
    },
    setFocused: (index: number) => {
      focused = index;
    },
    visual: () => visual,
  };
}

describe('Main item state decoration', () => {
  it('composes Cursor, persistent Selection, and transient Visual markers', () => {
    expect(
      itemDecorationClasses({
        cursor: true,
        selection: true,
        visual: true,
        visualFirst: true,
        visualLast: false,
      }),
    ).toEqual([
      'zotero-neo-cursor',
      'zotero-neo-selection',
      'zotero-neo-visual',
      'zotero-neo-visual-first',
    ]);
  });

  it('marks both range boundaries for a one-row Visual target', () => {
    expect(
      itemDecorationClasses({
        cursor: true,
        selection: false,
        visual: true,
        visualFirst: true,
        visualLast: true,
      }),
    ).toEqual([
      'zotero-neo-cursor',
      'zotero-neo-visual',
      'zotero-neo-visual-first',
      'zotero-neo-visual-last',
    ]);
  });

  it('never emits Visual boundary classes outside Visual', () => {
    expect(
      itemDecorationClasses({
        cursor: false,
        selection: true,
        visual: false,
        visualFirst: true,
        visualLast: true,
      }),
    ).toEqual(['zotero-neo-selection']);
  });

  it('uses fixed marker lanes without styling row fill, foreground, or Cursor', () => {
    const host = decorationHarness([0], { first: 0, last: 0, count: 1 });
    host.selection.add({ libraryID: 1, itemID: 1 });
    host.decoration.addWindow(host.window, host.selection, host.visual, host.theme);
    host.flush();

    const css = host.style.textContent;
    expect(css).toContain('--zotero-neo-item-selection: #eab308');
    expect(css).toContain('--zotero-neo-item-visual: #22c55e');
    expect(css).toMatch(/\.row\.zotero-neo-selection::before\s*\{[^}]*left: 2px/s);
    expect(css).toMatch(/\.row\.zotero-neo-visual::after\s*\{[^}]*left: 6px/s);
    expect(css).not.toContain('.zotero-neo-selection.zotero-neo-visual::after');
    expect(css).not.toContain('.row.zotero-neo-selection {');
    expect(css).not.toContain('.row.zotero-neo-visual {');
    expect(css).not.toContain('.row.zotero-neo-cursor');
    expect(css).not.toMatch(/(^|[;{]\s*)color\s*:/m);
    expect(css).not.toMatch(/(^|[;{]\s*)outline\s*:/m);

    expect(host.root().rows[0]!.classes).toEqual(
      new Set([
        'zotero-neo-cursor',
        'zotero-neo-selection',
        'zotero-neo-visual',
        'zotero-neo-visual-first',
        'zotero-neo-visual-last',
      ]),
    );
  });

  it('keeps large Visual renders proportional to rendered rows and coalesces relevant mutations', () => {
    const host = decorationHarness([0, 4_999, 9_999], { first: 0, last: 9_999, count: 10_000 });
    host.setFocused(4_999);
    host.decoration.addWindow(host.window, host.selection, host.visual, host.theme);
    host.flush();

    expect(host.getRow).toHaveBeenCalledTimes(4);
    expect(host.root().rows[0]!.classes).toContain('zotero-neo-visual-first');
    expect(host.root().rows[2]!.classes).toContain('zotero-neo-visual-last');
    expect(host.mutations.some((mutation) => mutation.target === host.body)).toBe(false);

    host.getRow.mockClear();
    host.emit(host.body, 'childList');
    host.emit(host.root(), 'attributes', 'class');
    expect(host.timers.size).toBe(0);

    host.emit(host.root(), 'childList');
    host.emit(host.root(), 'attributes', 'id');
    host.emit(host.root(), 'childList');
    expect(host.timers.size).toBe(1);
    host.flush();
    expect(host.getRow).toHaveBeenCalledTimes(4);
  });

  it('rebinds replacement roots and disconnects every observer during cleanup', () => {
    const host = decorationHarness([0, 1], { first: 0, last: 1, count: 2 });
    host.selection.add({ libraryID: 1, itemID: 1 });
    host.decoration.addWindow(host.window, host.selection, host.visual, host.theme);
    host.flush();
    const previous = host.replaceRoot([1, 2]);
    const previousRows = previous.rows;
    const previousObservers = host.mutations.filter(
      (mutation) => mutation.target === previous || mutation.target === host.parent,
    );

    host.emit(host.parent, 'childList');
    host.flush();

    expect(previous.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    expect(previousRows.every((row) => row.classes.size === 0)).toBe(true);
    expect(previousObservers.every((mutation) => mutation.disconnected)).toBe(true);
    expect(host.root().addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), true);

    const currentRoot = host.root();
    host.decoration.removeWindow(host.window);
    expect(currentRoot.removeEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      true,
    );
    expect(currentRoot.rows.every((row) => row.classes.size === 0)).toBe(true);
    expect(host.mutations.every((mutation) => mutation.disconnected)).toBe(true);
    expect(host.style.remove).toHaveBeenCalledOnce();
  });
});
