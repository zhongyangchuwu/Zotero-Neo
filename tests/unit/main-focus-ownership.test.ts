import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { focusMainItemsImmediately } from '../../src/main/host';
import { MainFocusOwnership } from '../../src/main/focus-ownership';
import type { MainWindowSession } from '../../src/main/session';

function harness(
  options: { mayClaimInitialLibraryFocus?: boolean; initial?: 'search' | 'editor' | 'items' } = {},
) {
  const listeners = new Map<string, Set<EventListener>>();
  const timers = new Map<number, { dueAt: number; run: () => void }>();
  let now = 0;
  let nextTimer = 0;
  const body = { localName: 'body' };
  const editor = { localName: 'input' };
  const searchTextbox = {
    value: '',
    matches: (selector: string) =>
      selector === ':focus-within' && document.activeElement === searchTextbox,
  };
  const search = {
    searchTextbox,
    contains: (target: unknown) => target === searchTextbox,
  };
  const items = {
    id: 'item-tree-main-default',
    localName: 'div',
    focus: vi.fn(() => {
      document.activeElement = items;
      emit('focusin', items);
    }),
  };
  const document = {
    body,
    documentElement: { localName: 'window' },
    activeElement: body as unknown,
    getElementById: (id: string) =>
      id === 'zotero-tb-search' ? search : id === items.id ? items : null,
    addEventListener: (type: string, listener: EventListener) => {
      const set = listeners.get(type) ?? new Set<EventListener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: EventListener) =>
      listeners.get(type)?.delete(listener),
  };
  const emit = (type: string, target: unknown): void => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener({ target } as Event);
  };
  const window = {
    document,
    Zotero_Tabs: { selectedID: 'zotero-pane' },
    ZoteroPane: { loaded: true, itemsView: {} },
    setTimeout: (callback: () => void, delay = 0) => {
      const id = ++nextTimer;
      timers.set(id, { dueAt: now + delay, run: callback });
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  } as unknown as MainWindow;
  const session = { activePanel: 'collections' } as MainWindowSession;
  if (options.initial === 'search') document.activeElement = searchTextbox;
  if (options.initial === 'editor') document.activeElement = editor;
  if (options.initial === 'items') document.activeElement = items;
  const owner = new MainFocusOwnership(
    window,
    session,
    options.mayClaimInitialLibraryFocus ?? true,
  );
  return {
    owner,
    window,
    document,
    items,
    editor,
    searchTextbox,
    listeners,
    timers,
    advance: (elapsed: number) => {
      now += elapsed;
      for (const [id, timer] of [...timers]) {
        if (timer.dueAt > now) continue;
        timers.delete(id);
        timer.run();
      }
    },
    session,
    focusSearch: () => {
      document.activeElement = searchTextbox;
      emit('focusin', searchTextbox);
    },
    intent: (type: string, target: unknown = searchTextbox) => emit(type, target),
    selectedTab: (id: string) => {
      (window as MainWindow & { Zotero_Tabs: { selectedID: string } }).Zotero_Tabs.selectedID = id;
    },
  };
}

describe('synchronous Items focus host adapter', () => {
  it('uses the live Items view tree even when the fallback DOM id is absent', () => {
    const h = harness();
    const topDiv = {
      isConnected: true,
      focus: vi.fn(() => {
        h.document.activeElement = topDiv;
      }),
    };
    Reflect.set(h.window.ZoteroPane as object, 'itemsView', { tree: { _topDiv: topDiv } });
    const getElementById = h.document.getElementById;
    h.document.getElementById = (id: string) =>
      id === 'item-tree-main-default' ? null : getElementById(id);
    expect(focusMainItemsImmediately(h.window)).toBe(true);
    expect(topDiv.focus).toHaveBeenCalledOnce();
    expect(h.items.focus).not.toHaveBeenCalled();
  });

  it('skips a detached view target and focuses the live domEl table synchronously', () => {
    const h = harness();
    const detached = { isConnected: false, focus: vi.fn() };
    const rendered = {
      isConnected: true,
      focus: vi.fn(() => {
        h.document.activeElement = rendered;
      }),
    };
    Reflect.set(h.window.ZoteroPane as object, 'itemsView', {
      tree: { _topDiv: detached },
      domEl: { querySelector: () => rendered },
    });
    expect(focusMainItemsImmediately(h.window)).toBe(true);
    expect(detached.focus).not.toHaveBeenCalled();
    expect(rendered.focus).toHaveBeenCalledOnce();
    expect(h.items.focus).not.toHaveBeenCalled();
  });
});

describe('Main startup focus ownership', () => {
  it('moves only observed native empty Quick Search startup focus to Items once', () => {
    const h = harness();
    h.owner.start();
    expect(h.timers.size).toBe(0);
    h.focusSearch();
    expect(h.items.focus).toHaveBeenCalledOnce();
    expect(h.document.activeElement).toBe(h.items);
    expect(h.session.activePanel).toBe('items');
    expect(h.timers.size).toBe(0);
    h.focusSearch();
    expect(h.items.focus).toHaveBeenCalledOnce();
    h.owner.dispose();
  });

  it('still claims a native search focus after an arbitrarily long idle startup', () => {
    const h = harness();
    h.owner.start();
    h.advance(60_000);
    expect(h.timers.size).toBe(0);
    expect(h.listeners.get('focusin')?.size).toBe(1);
    h.focusSearch();
    expect(h.document.activeElement).toBe(h.items);
    expect(h.items.focus).toHaveBeenCalledOnce();
    h.advance(60_000);
    h.focusSearch();
    expect(h.items.focus).toHaveBeenCalledOnce();
  });

  it('honors direct keyboard or pointer intent even after a long idle', () => {
    for (const type of ['keydown', 'pointerdown']) {
      const h = harness();
      h.owner.start();
      h.advance(60_000);
      expect(h.listeners.get('focusin')?.size).toBe(1);
      h.intent(type);
      h.focusSearch();
      expect(h.items.focus).not.toHaveBeenCalled();
      expect([...h.listeners.values()].every((set) => set.size === 0)).toBe(true);
    }
  });

  it('claims an already-focused empty Quick Search after deferred APP_STARTUP attachment', () => {
    const h = harness({ initial: 'search' });
    h.owner.start();
    expect(h.items.focus).not.toHaveBeenCalled();
    expect(h.timers.size).toBe(1);
    h.advance(0);
    expect(h.items.focus).toHaveBeenCalledOnce();
    expect(h.document.activeElement).toBe(h.items);
    expect(h.session.activePanel).toBe('items');
    h.focusSearch();
    expect(h.items.focus).toHaveBeenCalledOnce();
  });

  it('cancels a pending APP_STARTUP prefocus claim on direct user intent', () => {
    for (const type of ['pointerdown', 'keydown', 'beforeinput', 'input', 'compositionstart']) {
      const h = harness({ initial: 'search' });
      h.owner.start();
      h.intent(type);
      expect(h.timers.size).toBe(0);
      expect(h.items.focus).not.toHaveBeenCalled();
    }
  });

  it.each(['pointerdown', 'keydown', 'beforeinput', 'input', 'compositionstart'])(
    'preserves search focus after %s intent',
    (type) => {
      const h = harness();
      h.owner.start();
      h.intent(type);
      h.focusSearch();
      expect(h.items.focus).not.toHaveBeenCalled();
      expect(h.timers.size).toBe(0);
    },
  );

  it('preserves explicit Neo Quick Search intent even without an earlier input event', () => {
    const h = harness();
    h.owner.start();
    h.owner.markQuickSearchIntent();
    h.focusSearch();
    expect(h.items.focus).not.toHaveBeenCalled();
  });

  it.each(['ADDON_INSTALL (RDP reload)', 'ADDON_ENABLE', 'ADDON_UPGRADE'] as const)(
    'preserves pre-existing and newly focused Quick Search for %s',
    (_reason) => {
      const preFocused = harness({ initial: 'search', mayClaimInitialLibraryFocus: false });
      preFocused.owner.start();
      expect(preFocused.timers.size).toBe(0);
      preFocused.focusSearch();
      expect(preFocused.items.focus).not.toHaveBeenCalled();
      const later = harness({ mayClaimInitialLibraryFocus: false });
      later.owner.start();
      later.focusSearch();
      expect(later.items.focus).not.toHaveBeenCalled();
    },
  );

  it('preserves a nonempty pre-focused search even in cold lifecycle', () => {
    const h = harness({ initial: 'search' });
    h.searchTextbox.value = 'deliberate query';
    h.owner.start();
    expect(h.timers.size).toBe(0);
    expect(h.items.focus).not.toHaveBeenCalled();
  });

  it('does not steal existing or newly focused unrelated editors or Reader tabs', () => {
    const editor = harness({ initial: 'editor' });
    editor.owner.start();
    editor.focusSearch();
    expect(editor.items.focus).not.toHaveBeenCalled();

    const h = harness();
    h.owner.start();
    h.document.activeElement = h.editor;
    h.intent('focusin', h.editor);
    h.focusSearch();
    expect(h.items.focus).not.toHaveBeenCalled();

    const reader = harness();
    reader.owner.start();
    reader.selectedTab('reader-tab');
    reader.focusSearch();
    expect(reader.items.focus).not.toHaveBeenCalled();
  });

  it('preserves a typed Quick Search query instead of claiming its focus', () => {
    const h = harness();
    h.owner.start();
    h.searchTextbox.value = 'intentional query';
    h.focusSearch();
    expect(h.items.focus).not.toHaveBeenCalled();
  });

  it('cancels every listener on session cleanup', () => {
    const h = harness();
    h.owner.start();
    expect(h.listeners.get('focusin')?.size).toBe(1);
    expect(h.timers.size).toBe(0);
    h.owner.dispose();
    expect([...h.listeners.values()].every((set) => set.size === 0)).toBe(true);
    h.focusSearch();
    expect(h.items.focus).not.toHaveBeenCalled();
  });

  it('cleans up an unexecuted deferred claim on session disposal', () => {
    const h = harness({ initial: 'search' });
    h.owner.start();
    const pending = [...h.timers.values()][0]!;
    h.owner.dispose();
    expect(h.timers.size).toBe(0);
    expect([...h.listeners.values()].every((set) => set.size === 0)).toBe(true);
    pending.run();
    expect(h.items.focus).not.toHaveBeenCalled();
  });
});
