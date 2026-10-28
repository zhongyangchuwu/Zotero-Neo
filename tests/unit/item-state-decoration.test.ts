import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import {
  MainItemStateDecoration,
  itemDecorationClasses,
  type MainVisualRange,
  type MainItemDecorationRegistration,
} from '../../src/main/item-state-decoration';
import { SelectionStore } from '../../src/modules/worksets/selection-store';
import {
  resolveInteractionAppearance,
  type InteractionAppearanceSource,
} from '../../src/main/interaction-appearance';
import type { PreferenceReader } from '../../src/core/preferences';
import { installMainRenderedItemDecoration } from '../../src/toolkit/main';

type TestRow = HTMLElement & { readonly classes: Set<string> };
type TestRoot = HTMLElement & {
  readonly rows: TestRow[];
  readonly scrollListeners: ReadonlySet<EventListenerOrEventListenerObject>;
};

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
  const styles: HTMLStyleElement[] = [];
  const makeStyle = (): HTMLStyleElement => {
    const style = {
      id: '',
      textContent: '',
      isConnected: true,
      remove: vi.fn((): void => {
        Reflect.set(style, 'isConnected', false);
      }),
    } as unknown as HTMLStyleElement;
    styles.push(style);
    return style;
  };
  const style = makeStyle();
  let firstStyle = true;
  const mutations: ObservedMutation[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const getRow = vi.fn((index: number) => ({
    isObjectRow: true,
    ref: { id: index + 1, libraryID: 1 },
  }));

  const makeRoot = (indexes: readonly number[]) => {
    const rows = indexes.map(rowElement);
    const scrollListeners = new Set<EventListenerOrEventListenerObject>();
    const root = {
      parentElement: parent,
      rows,
      scrollListeners,
      querySelectorAll: () => rows,
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        scrollListeners.add(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        scrollListeners.delete(listener);
      }),
    } as unknown as TestRoot;
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
      createElementNS: () => {
        if (firstStyle) {
          firstStyle = false;
          return style;
        }
        return makeStyle();
      },
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
  const preferences = {
    get: ((_key: string, fallback: boolean | number | string) =>
      fallback) as PreferenceReader['get'],
  };
  const appearance = {
    appearance: resolveInteractionAppearance(preferences, 'light'),
    observe: () => () => {},
  } as InteractionAppearanceSource;
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
    styles,
    selection,
    appearance,
    decoration,
    mutations,
    timers,
    getRow,
    flush,
    emit,
    root: () => currentRoot as TestRoot,
    replaceRoot: (indexes: readonly number[]) => {
      const previous = currentRoot as TestRoot;
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

  it('releases an appearance observer returned after its owner is replaced', () => {
    const host = decorationHarness([0, 1], undefined);
    let current = true;
    const replacement: { current?: MainItemDecorationRegistration } = {};
    const release = vi.fn();
    const appearance = {
      appearance: host.appearance.appearance,
      observe: () => {
        current = false;
        replacement.current = host.decoration.addWindow(
          host.window,
          () => ({ has: (ref) => ref.itemID === 2, visualRange: () => undefined }),
          host.appearance,
          () => true,
        );
        return release;
      },
    } as InteractionAppearanceSource;
    host.decoration.addWindow(
      host.window,
      () => null,
      appearance,
      () => current,
    );
    host.flush();
    expect(release).toHaveBeenCalledOnce();
    expect(host.root().rows[1]!.classes.has('zotero-neo-selection')).toBe(true);
    expect(host.mutations.filter((mutation) => !mutation.disconnected)).toHaveLength(2);
    replacement.current?.dispose();
  });

  it('releases a renderer returned after replacement during native installation', () => {
    const host = decorationHarness([0, 1], undefined);
    let current = true;
    const replacement: { current?: MainItemDecorationRegistration } = {};
    const root = host.root();
    vi.mocked(root.addEventListener).mockImplementationOnce(() => {
      current = false;
      replacement.current = host.decoration.addWindow(
        host.window,
        () => ({ has: (ref) => ref.itemID === 2, visualRange: () => undefined }),
        host.appearance,
        () => true,
      );
    });
    host.decoration.addWindow(
      host.window,
      () => null,
      host.appearance,
      () => current,
    );
    host.flush();
    expect(root.rows[1]!.classes.has('zotero-neo-selection')).toBe(true);
    expect(root.scrollListeners.size).toBe(1);
    expect(host.mutations.filter((mutation) => !mutation.disconnected)).toHaveLength(2);
    expect(host.styles[0]!.isConnected).toBe(false);
    expect(host.styles[1]!.isConnected).toBe(true);
    replacement.current?.dispose();
  });

  it('keeps Cursor live when a projection retires', () => {
    const host = decorationHarness([0, 1], { first: 0, last: 1, count: 2 });
    host.selection.add({ libraryID: 1, itemID: 1 });
    let live = true;
    const registration = host.decoration.addWindow(
      host.window,
      () => (live ? { has: (ref) => host.selection.has(ref), visualRange: host.visual } : null),
      host.appearance,
      () => true,
    );
    host.flush();
    expect(host.root().rows[0]!.classes.has('zotero-neo-selection')).toBe(true);
    live = false;
    host.setFocused(1);
    host.decoration.refresh(host.window);
    host.flush();
    expect(host.root().rows[0]!.classes.has('zotero-neo-selection')).toBe(false);
    expect(host.root().rows[0]!.classes.has('zotero-neo-visual')).toBe(false);
    expect(host.root().rows[1]!.classes.has('zotero-neo-cursor')).toBe(true);
    registration.dispose();
  });

  it('keeps large Visual renders proportional to rendered rows and coalesces relevant mutations', () => {
    const host = decorationHarness([0, 4_999, 9_999], { first: 0, last: 9_999, count: 10_000 });
    host.setFocused(4_999);
    host.decoration.addWindow(
      host.window,
      () => ({ has: (ref) => host.selection.has(ref), visualRange: host.visual }),
      host.appearance,
      () => true,
    );
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
    const registration = host.decoration.addWindow(
      host.window,
      () => ({ has: (ref) => host.selection.has(ref), visualRange: host.visual }),
      host.appearance,
      () => true,
    );
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
    registration.dispose();
    expect(currentRoot.removeEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      true,
    );
    expect(currentRoot.rows.every((row) => row.classes.size === 0)).toBe(true);
    expect(host.mutations.every((mutation) => mutation.disconnected)).toBe(true);
    expect(host.style.remove).toHaveBeenCalledOnce();
  });

  it('leaves current Selection rows untouched by retired renders, observers and scroll callbacks', () => {
    const host = decorationHarness([0, 1], undefined);
    host.selection.add({ libraryID: 1, itemID: 1 });
    const oldRegistration = host.decoration.addWindow(
      host.window,
      () => ({ has: (ref) => host.selection.has(ref), visualRange: host.visual }),
      host.appearance,
      () => true,
    );
    const queued = [...host.timers.values()][0]!;
    const callbacks = host.mutations.map((mutation) => mutation.callback);
    const scroll = vi.mocked(host.root().addEventListener).mock.calls[0]![1] as EventListener;
    oldRegistration.dispose();
    const selection = new SelectionStore();
    selection.add({ libraryID: 1, itemID: 2 });
    const registration = host.decoration.addWindow(
      host.window,
      () => ({ has: (ref) => selection.has(ref), visualRange: host.visual }),
      host.appearance,
      () => true,
    );
    host.flush();
    queued();
    for (const callback of callbacks) callback([], {} as MutationObserver);
    scroll({} as Event);
    expect(host.root().rows[0]!.classes.has('zotero-neo-selection')).toBe(false);
    expect(host.root().rows[1]!.classes.has('zotero-neo-selection')).toBe(true);
    expect(host.timers.size).toBe(0);
    registration.dispose();
  });

  it('releases acquired resources and retires callbacks after an initial installation failure', () => {
    const host = decorationHarness([0, 1], undefined);
    const installationFailure = new Error('Initial row observation failed');
    const cleanupFailure = new Error('Observer disconnect reported failure');
    const prototype = host.window.MutationObserver.prototype;
    const nativeObserve = prototype.observe;
    const nativeDisconnect = prototype.disconnect;
    const observe = vi.spyOn(prototype, 'observe').mockImplementation(function (
      this: MutationObserver,
      target,
      options,
    ) {
      nativeObserve.call(this, target, options);
      if (target === host.root()) throw installationFailure;
    });
    const disconnect = vi.spyOn(prototype, 'disconnect').mockImplementationOnce(function (
      this: MutationObserver,
    ) {
      nativeDisconnect.call(this);
      throw cleanupFailure;
    });
    let notifications = 0;
    let observed: unknown;
    try {
      installMainRenderedItemDecoration(
        host.window,
        host.appearance.appearance,
        ['zotero-neo-selection'],
        () => {
          notifications += 1;
        },
      );
    } catch (error) {
      observed = error;
    }

    expect(observed).toBe(installationFailure);
    expect(host.style.isConnected).toBe(false);
    expect(host.mutations).toHaveLength(2);
    expect(host.mutations.every((mutation) => mutation.disconnected)).toBe(true);
    expect(host.root().scrollListeners.size).toBe(0);
    const scroll = vi.mocked(host.root().addEventListener).mock.calls[0]![1] as EventListener;
    for (const mutation of host.mutations) mutation.callback([], {} as MutationObserver);
    scroll({} as Event);
    expect(notifications).toBe(0);
    expect(host.timers.size).toBe(0);
    expect(host.getRow).not.toHaveBeenCalled();
    observe.mockRestore();
    disconnect.mockRestore();
  });

  it.each(['observer', 'scroll listener'] as const)(
    'retires decoration and finishes independent cleanup after a live %s failure',
    (boundary) => {
      const host = decorationHarness([0, 1], { first: 0, last: 1, count: 2 });
      host.selection.add({ libraryID: 1, itemID: 1 });
      const registration = host.decoration.addWindow(
        host.window,
        () => ({ has: (ref) => host.selection.has(ref), visualRange: host.visual }),
        host.appearance,
        () => true,
      );
      host.flush();
      const failure = new Error('live decoration cleanup failed');
      const failing =
        boundary === 'observer'
          ? vi.spyOn(host.window.MutationObserver.prototype, 'disconnect')
          : vi.mocked(host.root().removeEventListener);
      failing.mockImplementationOnce(() => {
        throw failure;
      });
      let observed: unknown;
      try {
        registration.dispose();
      } catch (error) {
        observed = error;
      }
      expect(observed).toBe(failure);
      expect(host.style.isConnected).toBe(false);
      expect(host.root().rows.map((row) => [...row.classes])).toEqual([[], []]);
      expect(host.mutations.filter((mutation) => !mutation.disconnected)).toHaveLength(
        boundary === 'observer' ? 1 : 0,
      );
      for (const mutation of host.mutations) mutation.callback([], {} as MutationObserver);
      host.selection.add({ libraryID: 1, itemID: 2 });
      expect(host.timers.size).toBe(0);
      failing.mockRestore();
    },
  );
});
