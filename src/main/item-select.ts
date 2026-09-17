import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import { asElement, asKeyboardEvent, isEditableElement } from '../platform/dom';
import { mainHost } from './host';

type NativeSelection = {
  pivot?: number;
  focused?: number;
  count?: number;
  select?(index: number, shouldDebounce?: boolean): boolean | void;
  shiftSelect?(index: number, augment: boolean, shouldDebounce?: boolean): void;
};

type ItemView = {
  rowCount?: number;
  selection?: NativeSelection;
  tree?: unknown;
  domEl?: unknown;
  ensureRowIsVisible?(index: number): void;
};

type ItemSelectDirection = 1 | -1 | 'first' | 'last';

type ItemSelectState = {
  readonly keydown: EventListener;
  active: boolean;
  countBuffer: string;
  keyBuffer: string;
  keyTimer: number | undefined;
  badge: HTMLElement | null;
  badgeTimer: number | undefined;
};

function containsTarget(root: unknown, node: unknown): boolean {
  if (!root || !node) return false;
  if (root === node) return true;
  if (typeof root !== 'object') return false;
  const contains = (root as { contains?: unknown }).contains;
  if (typeof contains !== 'function') return false;
  try {
    return Boolean(contains.call(root, node));
  } catch {
    return false;
  }
}

export function nextItemSelectIndex(
  current: number,
  rowCount: number,
  direction: ItemSelectDirection,
  count: number,
): number {
  const last = Math.max(0, rowCount - 1);
  if (direction === 'first') return 0;
  if (direction === 'last') return count > 0 ? Math.min(count - 1, last) : last;
  return Math.max(0, Math.min(last, current + direction * Math.max(1, count)));
}

/**
 * Thin Main-window Select layer over Zotero's native TreeSelection.
 * Neo owns only the modal lifetime; pivot/focus/selected rows stay native.
 */
export class MainItemSelect {
  readonly #logger: Logger;
  readonly #states = new Map<MainWindow, ItemSelectState>();

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  addWindow(window: MainWindow): void {
    if (this.#states.has(window)) return;
    const keydown: EventListener = (event) => this.onKeyDown(event, window);
    const state: ItemSelectState = {
      keydown,
      active: false,
      countBuffer: '',
      keyBuffer: '',
      keyTimer: undefined,
      badge: null,
      badgeTimer: undefined,
    };
    this.#states.set(window, state);
    window.document.addEventListener('keydown', keydown, true);
  }

  removeWindow(window: MainWindow): void {
    const state = this.#states.get(window);
    if (!state) return;
    this.#states.delete(window);
    window.document.removeEventListener('keydown', state.keydown, true);
    window.clearTimeout(state.keyTimer);
    window.clearTimeout(state.badgeTimer);
    state.badge?.remove();
  }

  shutdown(): void {
    for (const window of [...this.#states.keys()]) this.removeWindow(window);
  }

  private onKeyDown(rawEvent: Event, window: MainWindow): void {
    const event = asKeyboardEvent(rawEvent);
    const state = this.#states.get(window);
    if (!event || !state || event.defaultPrevented) return;
    if (isEditableElement(asElement(event.target))) return;

    const itemsFocused = this.treeFocused(window, 'items');
    const collectionsFocused = this.treeFocused(window, 'collections');

    if (!state.active) {
      if (!this.isPlainKey(event, 'v') || (!itemsFocused && !collectionsFocused)) return;
      this.consume(event);
      if (!itemsFocused) {
        this.showBadge(window, state, 'ITEM SELECT · focus items list', false);
        return;
      }
      this.enter(window, state);
      return;
    }

    if (!itemsFocused) {
      this.deactivate(window, state, true, false);
      return;
    }

    if (event.key === 'Escape') {
      this.consume(event);
      this.deactivate(window, state, false, true);
      return;
    }
    if (this.isPlainKey(event, 'v')) {
      this.consume(event);
      this.deactivate(window, state, true, true);
      return;
    }
    if (this.isPlainKey(event, 'o')) {
      this.consume(event);
      this.swapEnds(window, state);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key;
    if (/^[1-9]$/.test(key) || (key === '0' && state.countBuffer)) {
      this.consume(event);
      state.countBuffer += key;
      return;
    }
    if (key === 'g') {
      this.consume(event);
      if (state.keyBuffer === 'g') {
        this.extend(window, state, 'first', this.takeCount(state), event.repeat);
        this.resetInput(window, state);
      } else {
        state.keyBuffer = 'g';
        window.clearTimeout(state.keyTimer);
        state.keyTimer = window.setTimeout(() => this.resetInput(window, state), 800);
      }
      return;
    }
    if (key === 'G') {
      this.consume(event);
      const count = this.takeCount(state);
      this.extend(window, state, 'last', count, event.repeat);
      this.resetInput(window, state);
      return;
    }
    if (key === 'j' || key === 'k') {
      this.consume(event);
      const count = this.takeCount(state);
      this.extend(window, state, key === 'j' ? 1 : -1, count, event.repeat);
      this.resetInput(window, state);
      return;
    }

    this.resetInput(window, state);
  }

  private enter(window: MainWindow, state: ItemSelectState): void {
    const view = this.itemView(window);
    const selection = view?.selection;
    const rowCount = view?.rowCount ?? 0;
    if (!view || !selection?.select || !selection.shiftSelect || rowCount <= 0) {
      this.showBadge(window, state, 'ITEM SELECT · unavailable', false);
      return;
    }
    const focused = Math.max(0, Math.min(rowCount - 1, selection.focused ?? 0));
    selection.select(focused);
    view.ensureRowIsVisible?.(focused);
    state.active = true;
    this.resetInput(window, state);
    this.showBadge(window, state, this.modeLabel(selection), true);
    this.#logger.debug(`main item select entered row=${focused}`);
  }

  private deactivate(
    window: MainWindow,
    state: ItemSelectState,
    preserve: boolean,
    announce: boolean,
  ): void {
    if (!state.active) return;
    const view = this.itemView(window);
    const selection = view?.selection;
    if (!preserve && view && selection?.select) {
      const last = Math.max(0, (view.rowCount ?? 1) - 1);
      const focused = Math.max(0, Math.min(last, selection.focused ?? 0));
      selection.select(focused);
      view.ensureRowIsVisible?.(focused);
    }
    state.active = false;
    this.resetInput(window, state);
    if (announce) {
      const count = selection?.count ?? 0;
      this.showBadge(
        window,
        state,
        preserve
          ? `${count} item${count === 1 ? '' : 's'} selected`
          : 'Item selection cancelled',
        false,
      );
    } else {
      this.hideBadge(window, state);
    }
    this.#logger.debug(
      `main item select exited preserve=${preserve} count=${selection?.count ?? 0}`,
    );
  }

  private extend(
    window: MainWindow,
    state: ItemSelectState,
    direction: ItemSelectDirection,
    count: number,
    shouldDebounce: boolean,
  ): void {
    const view = this.itemView(window);
    const selection = view?.selection;
    const rowCount = view?.rowCount ?? 0;
    if (!view || !selection?.shiftSelect || rowCount <= 0) return;
    const current = Math.max(0, Math.min(rowCount - 1, selection.focused ?? 0));
    const next = nextItemSelectIndex(current, rowCount, direction, count);
    selection.shiftSelect(next, false, shouldDebounce);
    view.ensureRowIsVisible?.(next);
    this.showBadge(window, state, this.modeLabel(selection), true);
  }

  private swapEnds(window: MainWindow, state: ItemSelectState): void {
    const view = this.itemView(window);
    const selection = view?.selection;
    const pivot = selection?.pivot;
    const focused = selection?.focused;
    if (!view || !selection?.shiftSelect || pivot === undefined || focused === undefined) return;
    selection.pivot = focused;
    selection.shiftSelect(pivot, false);
    view.ensureRowIsVisible?.(pivot);
    this.showBadge(window, state, this.modeLabel(selection), true);
  }

  private itemView(window: MainWindow): ItemView | undefined {
    return mainHost(window).ZoteroPane?.itemsView as unknown as ItemView | undefined;
  }

  private treeFocused(window: MainWindow, panel: 'items' | 'collections'): boolean {
    const active = window.document.activeElement;
    if (!active) return false;
    const pane = mainHost(window).ZoteroPane;
    const view = panel === 'items' ? pane?.itemsView : pane?.collectionsView;
    const targets =
      panel === 'items'
        ? [
            view?.tree,
            view?.domEl,
            window.document.getElementById('item-tree-main-default'),
            window.document.getElementById('zotero-items-tree'),
            window.document.querySelector('#zotero-items-tree .virtualized-table'),
          ]
        : [
            view?.tree,
            view?.domEl,
            window.document.getElementById('collection-tree'),
            window.document.getElementById('zotero-collections-tree'),
            window.document.querySelector('#zotero-collections-tree .virtualized-table'),
          ];
    const id = active.id ?? '';
    return (
      targets.some((target) => containsTarget(target, active) || containsTarget(active, target)) ||
      (panel === 'items' ? id.includes('item-tree') : id.includes('collection'))
    );
  }

  private isPlainKey(event: KeyboardEvent, key: string): boolean {
    return (
      event.key === key && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    );
  }

  private takeCount(state: ItemSelectState): number {
    return state.countBuffer ? Number.parseInt(state.countBuffer, 10) : 0;
  }

  private resetInput(window: MainWindow, state: ItemSelectState): void {
    state.countBuffer = '';
    state.keyBuffer = '';
    window.clearTimeout(state.keyTimer);
    state.keyTimer = undefined;
  }

  private modeLabel(selection: NativeSelection): string {
    return `-- ITEM SELECT -- · ${selection.count ?? 0} item${selection.count === 1 ? '' : 's'}`;
  }

  private showBadge(
    window: MainWindow,
    state: ItemSelectState,
    text: string,
    persistent: boolean,
  ): void {
    window.clearTimeout(state.badgeTimer);
    state.badgeTimer = undefined;
    const doc = window.document;
    if (!state.badge) {
      const badge = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      badge.id = 'zotero-neo-item-select-status';
      badge.style.cssText =
        'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:99998;' +
        'font:bold 12px/1.4 monospace;padding:3px 9px;border-radius:3px;' +
        'background:Highlight;color:HighlightText;pointer-events:none;user-select:none';
      (doc.body ?? doc.documentElement).append(badge);
      state.badge = badge;
    }
    state.badge.textContent = text;
    state.badge.style.display = 'block';
    if (!persistent) {
      state.badgeTimer = window.setTimeout(() => this.hideBadge(window, state), 1200);
    }
  }

  private hideBadge(window: MainWindow, state: ItemSelectState): void {
    window.clearTimeout(state.badgeTimer);
    state.badgeTimer = undefined;
    state.badge?.remove();
    state.badge = null;
  }

  private consume(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation?.();
    event.stopPropagation();
  }
}
