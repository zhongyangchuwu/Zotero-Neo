import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
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
export type ItemSelectEnterResult = 'entered' | 'focus-items' | 'unavailable' | 'pass';
type ItemSelectUi = { badge: HTMLElement | null; timer: number | undefined };

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

/** Thin host adapter over Zotero's native TreeSelection; input routing belongs to Main. */
export class MainItemSelect {
  readonly #logger: Logger;
  readonly #ui = new Map<MainWindow, ItemSelectUi>();
  constructor(logger: Logger) {
    this.#logger = logger;
  }

  entryRelevant(window: MainWindow): boolean {
    return this.treeFocused(window, 'items') || this.treeFocused(window, 'collections');
  }
  itemsFocused(window: MainWindow): boolean {
    return this.treeFocused(window, 'items');
  }

  enter(window: MainWindow): ItemSelectEnterResult {
    if (this.treeFocused(window, 'collections')) {
      this.show(window, 'ITEM SELECT · focus items list', false);
      return 'focus-items';
    }
    if (!this.treeFocused(window, 'items')) return 'pass';
    const view = this.itemView(window);
    const selection = view?.selection;
    const rowCount = view?.rowCount ?? 0;
    if (!view || !selection?.select || !selection.shiftSelect || rowCount <= 0) {
      this.show(window, 'ITEM SELECT · unavailable', false);
      return 'unavailable';
    }
    const focused = Math.max(0, Math.min(rowCount - 1, selection.focused ?? 0));
    selection.select(focused);
    view.ensureRowIsVisible?.(focused);
    this.showMode(window, selection);
    this.#logger.debug(`main item select entered row=${focused}`);
    return 'entered';
  }

  extend(
    window: MainWindow,
    direction: ItemSelectDirection,
    count: number,
    shouldDebounce = false,
  ): void {
    const view = this.itemView(window);
    const selection = view?.selection;
    const rowCount = view?.rowCount ?? 0;
    if (!view || !selection?.shiftSelect || rowCount <= 0) return;
    const current = Math.max(0, Math.min(rowCount - 1, selection.focused ?? 0));
    const next = nextItemSelectIndex(current, rowCount, direction, count);
    selection.shiftSelect(next, false, shouldDebounce);
    view.ensureRowIsVisible?.(next);
    this.showMode(window, selection);
  }

  swapEnds(window: MainWindow): void {
    const view = this.itemView(window);
    const selection = view?.selection;
    const pivot = selection?.pivot;
    const focused = selection?.focused;
    if (!view || !selection?.shiftSelect || pivot === undefined || focused === undefined) return;
    selection.pivot = focused;
    selection.shiftSelect(pivot, false);
    view.ensureRowIsVisible?.(pivot);
    this.showMode(window, selection);
  }

  finish(window: MainWindow): number {
    const count = this.itemView(window)?.selection?.count ?? 0;
    this.show(window, `${count} item${count === 1 ? '' : 's'} selected`, false);
    this.#logger.debug(`main item select exited preserve=true count=${count}`);
    return count;
  }

  cancel(window: MainWindow): void {
    const view = this.itemView(window);
    const selection = view?.selection;
    if (view && selection?.select) {
      const last = Math.max(0, (view.rowCount ?? 1) - 1);
      const focused = Math.max(0, Math.min(last, selection.focused ?? 0));
      selection.select(focused);
      view.ensureRowIsVisible?.(focused);
    }
    this.show(window, 'Item selection cancelled', false);
    this.#logger.debug('main item select exited preserve=false');
  }

  leave(window: MainWindow): void {
    this.hide(window);
  }
  removeWindow(window: MainWindow): void {
    const ui = this.#ui.get(window);
    if (!ui) return;
    window.clearTimeout(ui.timer);
    ui.badge?.remove();
    this.#ui.delete(window);
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
  private showMode(window: MainWindow, selection: NativeSelection): void {
    const count = selection.count ?? 0;
    this.show(window, `-- ITEM SELECT -- · ${count} item${count === 1 ? '' : 's'}`, true);
  }
  private show(window: MainWindow, text: string, persistent: boolean): void {
    let ui = this.#ui.get(window);
    if (!ui) {
      ui = { badge: null, timer: undefined };
      this.#ui.set(window, ui);
    }
    window.clearTimeout(ui.timer);
    ui.timer = undefined;
    if (!ui.badge) {
      const badge = window.document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      badge.id = 'zotero-neo-item-select-status';
      badge.style.cssText =
        'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:99998;font:bold 12px/1.4 monospace;padding:3px 9px;border-radius:3px;background:Highlight;color:HighlightText;pointer-events:none;user-select:none';
      (window.document.body ?? window.document.documentElement).append(badge);
      ui.badge = badge;
    }
    ui.badge.textContent = text;
    ui.badge.style.display = 'block';
    if (!persistent) ui.timer = window.setTimeout(() => this.hide(window), 1200);
  }
  private hide(window: MainWindow): void {
    const ui = this.#ui.get(window);
    if (!ui) return;
    window.clearTimeout(ui.timer);
    ui.timer = undefined;
    ui.badge?.remove();
    ui.badge = null;
  }
}
