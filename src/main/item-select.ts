import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import {
  mainCursorItemRef,
  mainHost,
  mainItemRefAtRow,
  mainItemRowIndex,
  moveMainItemCursor,
  projectMainItemSelection,
} from './host';
import type { ItemRef } from './selection-store';

type ItemView = {
  rowCount?: number;
  tree?: unknown;
  domEl?: unknown;
};

type ItemSelectDirection = 1 | -1 | 'first' | 'last';
export type ItemSelectEnterResult = 'entered' | 'focus-items' | 'unavailable' | 'pass';
type ItemSelectUi = { badge: HTMLElement | null; timer: number | undefined };
type VisualState = { anchor: ItemRef; head: ItemRef };

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

function sameRef(left: ItemRef, right: ItemRef): boolean {
  return left.itemID === right.itemID && left.libraryID === right.libraryID;
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
 * Transient Main Visual range.
 *
 * The persisted binding scope remains `main-select` for compatibility, but this feature does not
 * own committed Selection. It tracks only anchor/head identities and projects the current range
 * into Zotero's visible tree for feedback.
 */
export class MainItemSelect {
  readonly #logger: Logger;
  readonly #ui = new Map<MainWindow, ItemSelectUi>();
  readonly #visual = new Map<MainWindow, VisualState>();

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  entryRelevant(window: MainWindow): boolean {
    return this.treeFocused(window, 'items') || this.treeFocused(window, 'collections');
  }

  itemsFocused(window: MainWindow): boolean {
    return this.treeFocused(window, 'items');
  }

  active(window: MainWindow): boolean {
    return this.#visual.has(window);
  }

  enter(window: MainWindow): ItemSelectEnterResult {
    if (this.treeFocused(window, 'collections')) {
      this.show(window, 'VISUAL · focus items list', false);
      return 'focus-items';
    }
    if (!this.treeFocused(window, 'items')) return 'pass';

    const view = this.itemView(window);
    const cursor = mainCursorItemRef(window);
    if (!view || !cursor || (view.rowCount ?? 0) <= 0) {
      this.show(window, 'VISUAL · unavailable', false);
      return 'unavailable';
    }

    this.#visual.set(window, { anchor: cursor, head: cursor });
    this.render(window, false);
    this.#logger.debug(`main visual entered item=${cursor.itemID}`);
    return 'entered';
  }

  target(window: MainWindow): readonly ItemRef[] {
    const state = this.#visual.get(window);
    const view = this.itemView(window);
    if (!state || !view) return [];

    const anchor = this.rowForRef(window, state.anchor);
    const head = this.rowForRef(window, state.head);
    if (anchor === undefined || head === undefined) return [];

    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    const refs: ItemRef[] = [];
    for (let index = from; index <= to; index += 1) {
      const ref = mainItemRefAtRow(window, index);
      if (ref) refs.push(ref);
    }
    return refs;
  }

  extend(
    window: MainWindow,
    direction: ItemSelectDirection,
    count: number,
    shouldDebounce = false,
  ): void {
    const state = this.#visual.get(window);
    const view = this.itemView(window);
    const rowCount = view?.rowCount ?? 0;
    if (!state || !view || rowCount <= 0) return;

    const current = this.rowForRef(window, state.head);
    if (current === undefined) {
      this.show(window, 'VISUAL · range unavailable', false);
      return;
    }
    const next = nextItemSelectIndex(current, rowCount, direction, count);
    const head = mainItemRefAtRow(window, next);
    if (!head) return;

    this.#visual.set(window, { ...state, head });
    this.render(window, shouldDebounce);
  }

  swapEnds(window: MainWindow): void {
    const state = this.#visual.get(window);
    if (!state) return;
    this.#visual.set(window, { anchor: state.head, head: state.anchor });
    this.render(window, false);
  }

  finish(window: MainWindow): number {
    const count = this.target(window).length;
    this.#visual.delete(window);
    this.show(window, 'Visual range cancelled', false);
    this.#logger.debug(`main visual exited commit=false count=${count}`);
    return count;
  }

  cancel(window: MainWindow): void {
    const state = this.#visual.get(window);
    this.#visual.delete(window);
    this.show(window, 'Visual range cancelled', false);
    this.#logger.debug(
      `main visual exited commit=false anchor=${state?.anchor.itemID ?? 'none'} head=${state?.head.itemID ?? 'none'}`,
    );
  }

  leave(window: MainWindow): void {
    this.#visual.delete(window);
    this.hide(window);
  }

  removeWindow(window: MainWindow): void {
    const ui = this.#ui.get(window);
    if (ui) {
      window.clearTimeout(ui.timer);
      ui.badge?.remove();
      this.#ui.delete(window);
    }
    this.#visual.delete(window);
  }

  private rowForRef(window: MainWindow, ref: ItemRef): number | undefined {
    const row = mainItemRowIndex(window, ref.itemID);
    if (row === undefined) return undefined;
    const actual = mainItemRefAtRow(window, row);
    return actual && sameRef(actual, ref) ? row : undefined;
  }

  private render(window: MainWindow, shouldDebounce: boolean): void {
    const state = this.#visual.get(window);
    if (!state) return;
    const head = this.rowForRef(window, state.head);
    const target = this.target(window);
    if (head === undefined || !target.length) {
      this.show(window, 'VISUAL · range unavailable', false);
      return;
    }

    moveMainItemCursor(window, head, shouldDebounce);
    projectMainItemSelection(window, target, shouldDebounce);
    this.showMode(window, target.length);
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

  private showMode(window: MainWindow, count: number): void {
    this.show(window, `-- VISUAL -- · ${count} item${count === 1 ? '' : 's'}`, true);
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
