import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import {
  currentMainItemCursorRef,
  mainHost,
  mainItemCursorRow,
  mainItemRefAtRow,
  mainItemRowCount,
  mainItemRowForRef,
  moveMainItemCursor,
  projectMainSelection,
  showMainVisualRange,
  visibleMainSelectionCount,
} from './host';
import type { ItemRef } from './selection-store';
import type { SelectionStore } from './selection-store';

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
 * Main Library selection feature.
 *
 * Persistent Selection belongs to MainWindowSession.SelectionStore. This owner
 * keeps only transient Visual anchor/head state and projects both VisualTarget
 * and the visible Selection subset into Zotero's native item tree.
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

  toggleCursor(window: MainWindow, selection: SelectionStore, shouldDebounce = false): boolean {
    if (!this.itemsFocused(window)) return false;
    const cursor = currentMainItemCursorRef(window);
    const row = mainItemCursorRow(window);
    const rowCount = mainItemRowCount(window);
    if (!cursor || row === undefined || rowCount <= 0) return false;

    const selected = selection.toggle(cursor);
    const visible = projectMainSelection(window, selection.values(), cursor, shouldDebounce);

    const next = Math.min(rowCount - 1, row + 1);
    moveMainItemCursor(window, next, shouldDebounce);
    this.showSelection(window, selection.size, visible);
    this.#logger.debug(
      `main selection cursor toggle item=${cursor.itemID} selected=${selected} total=${selection.size} visible=${visible}`,
    );
    return true;
  }

  enter(window: MainWindow, selection: SelectionStore): ItemSelectEnterResult {
    if (this.treeFocused(window, 'collections')) {
      this.show(window, 'VISUAL · focus items list', false);
      return 'focus-items';
    }
    if (!this.treeFocused(window, 'items')) return 'pass';

    const cursor = currentMainItemCursorRef(window);
    if (!cursor) {
      this.show(window, 'VISUAL · unavailable', false);
      return 'unavailable';
    }

    const shown = showMainVisualRange(window, cursor, cursor);
    if (shown === undefined) {
      this.show(window, 'VISUAL · unavailable', false);
      return 'unavailable';
    }

    this.#visual.set(window, { anchor: cursor, head: cursor });
    this.showMode(window, shown, selection);
    this.#logger.debug(`main visual entered item=${cursor.itemID}`);
    return 'entered';
  }

  extend(
    window: MainWindow,
    direction: ItemSelectDirection,
    count: number,
    selection: SelectionStore,
    shouldDebounce = false,
  ): void {
    const state = this.#visual.get(window);
    if (!state) return;

    const rowCount = mainItemRowCount(window);
    const current = mainItemRowForRef(window, state.head);
    if (current === undefined || rowCount <= 0) {
      this.cancel(window, selection);
      return;
    }

    const next = nextItemSelectIndex(current, rowCount, direction, count);
    const head = mainItemRefAtRow(window, next);
    if (!head) return;

    const nextState = { anchor: state.anchor, head };
    const shown = showMainVisualRange(window, nextState.anchor, nextState.head, shouldDebounce);
    if (shown === undefined) {
      this.cancel(window, selection);
      return;
    }

    this.#visual.set(window, nextState);
    this.showMode(window, shown, selection);
  }

  swapEnds(window: MainWindow, selection: SelectionStore): void {
    const state = this.#visual.get(window);
    if (!state) return;

    const nextState = { anchor: state.head, head: state.anchor };
    const shown = showMainVisualRange(window, nextState.anchor, nextState.head);
    if (shown === undefined) {
      this.cancel(window, selection);
      return;
    }

    this.#visual.set(window, nextState);
    this.showMode(window, shown, selection);
  }

  finish(window: MainWindow, selection: SelectionStore): number {
    const state = this.#visual.get(window);
    if (!state) return 0;

    const target = this.visualRefs(window, state);
    const result = selection.toggleTarget(target);
    const visible = projectMainSelection(window, selection.values(), state.head);
    this.#visual.delete(window);

    this.showSelection(window, selection.size, visible);
    this.#logger.debug(
      `main visual committed target=${target.length} result=${result} total=${selection.size} visible=${visible}`,
    );
    return target.length;
  }

  cancel(window: MainWindow, selection: SelectionStore): void {
    const state = this.#visual.get(window);
    const cursor = state?.head ?? currentMainItemCursorRef(window);
    const visible = projectMainSelection(window, selection.values(), cursor);
    this.#visual.delete(window);
    this.show(window, `Visual cancelled · Selection ${selection.size} · ${visible} visible`, false);
    this.#logger.debug(`main visual cancelled total=${selection.size} visible=${visible}`);
  }

  leave(window: MainWindow, selection: SelectionStore): void {
    const state = this.#visual.get(window);
    if (state) projectMainSelection(window, selection.values(), state.head);
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

  private visualRefs(window: MainWindow, state: VisualState): ItemRef[] {
    const anchor = mainItemRowForRef(window, state.anchor);
    const head = mainItemRowForRef(window, state.head);
    if (anchor === undefined || head === undefined) return [];

    const first = Math.min(anchor, head);
    const last = Math.max(anchor, head);
    const refs: ItemRef[] = [];
    for (let row = first; row <= last; row += 1) {
      const ref = mainItemRefAtRow(window, row);
      if (ref) refs.push(ref);
    }
    return refs;
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

  private showMode(window: MainWindow, targetCount: number, selection: SelectionStore): void {
    const visible = visibleMainSelectionCount(window, selection.values());
    this.show(
      window,
      `-- VISUAL -- · ${targetCount} target${targetCount === 1 ? '' : 's'} · Selection ${selection.size} · ${visible} visible`,
      true,
    );
  }

  private showSelection(window: MainWindow, total: number, visible: number): void {
    this.show(window, `Selection ${total} · ${visible} visible`, false);
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
