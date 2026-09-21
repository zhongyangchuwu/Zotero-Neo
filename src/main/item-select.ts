import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import {
  currentMainItemCursorRef,
  mainHost,
  mainItemRefAtRow,
  mainItemRowCount,
  mainItemRowForRef,
  moveMainItemCursor,
  projectMainSelection,
  showMainVisualRange,
  visibleMainSelectionCount,
} from './host';
import type { ItemRef, SelectionStore } from './selection-store';

type ItemView = {
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
 * Main Visual owns only a transient anchor/head range.
 *
 * Neo's SelectionStore remains unchanged while Visual moves. Native TreeSelection
 * is used only as a visible projection of the transient range, then restored
 * from SelectionStore on commit/cancel.
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

  enter(window: MainWindow): ItemSelectEnterResult {
    if (this.treeFocused(window, 'collections')) {
      this.show(window, 'VISUAL · focus items list', false);
      return 'focus-items';
    }
    if (!this.treeFocused(window, 'items')) return 'pass';

    const cursor = currentMainItemCursorRef(window);
    if (!cursor || showMainVisualRange(window, cursor, cursor) === undefined) {
      this.show(window, 'VISUAL · unavailable', false);
      return 'unavailable';
    }

    this.#visual.set(window, { anchor: cursor, head: cursor });
    this.showMode(window, 1);
    this.#logger.debug(`main visual entered item=${cursor.libraryID}:${cursor.itemID}`);
    return 'entered';
  }

  toggleCursor(window: MainWindow, selection: SelectionStore): boolean {
    if (!this.itemsFocused(window)) return false;
    const cursor = currentMainItemCursorRef(window);
    const row = cursor ? mainItemRowForRef(window, cursor) : undefined;
    if (!cursor || row === undefined) return false;

    selection.toggleTarget([cursor]);
    const visible = projectMainSelection(window, selection.values(), cursor);
    const rowCount = mainItemRowCount(window);
    if (rowCount > 0) moveMainItemCursor(window, Math.min(rowCount - 1, row + 1));

    this.showSelection(window, selection.size, visible);
    this.#logger.debug(
      `main selection toggled item=${cursor.libraryID}:${cursor.itemID} count=${selection.size}`,
    );
    return true;
  }

  extend(
    window: MainWindow,
    direction: ItemSelectDirection,
    count: number,
    shouldDebounce = false,
  ): void {
    const visual = this.#visual.get(window);
    if (!visual) return;

    const rowCount = mainItemRowCount(window);
    const current = mainItemRowForRef(window, visual.head);
    if (current === undefined || rowCount <= 0) return;

    const requested = nextItemSelectIndex(current, rowCount, direction, count);
    const step = direction === 'first' ? 1 : direction === 'last' ? -1 : direction === 1 ? 1 : -1;
    const next = this.itemRefAtOrToward(window, requested, step);
    if (!next) return;

    visual.head = next;
    const size = showMainVisualRange(window, visual.anchor, visual.head, shouldDebounce);
    if (size !== undefined) this.showMode(window, size);
  }

  swapEnds(window: MainWindow): void {
    const visual = this.#visual.get(window);
    if (!visual) return;
    [visual.anchor, visual.head] = [visual.head, visual.anchor];
    const size = showMainVisualRange(window, visual.anchor, visual.head);
    if (size !== undefined) this.showMode(window, size);
  }

  commit(window: MainWindow, selection: SelectionStore): number {
    const visual = this.#visual.get(window);
    if (!visual) return selection.size;

    const refs = this.visualRefs(window, visual);
    if (refs.length) selection.toggleTarget(refs);

    const cursor = visual.head;
    this.#visual.delete(window);
    const visible = projectMainSelection(window, selection.values(), cursor);
    this.showSelection(window, selection.size, visible);
    this.#logger.debug(`main visual committed range=${refs.length} selection=${selection.size}`);
    return selection.size;
  }

  cancel(window: MainWindow, selection: SelectionStore): void {
    const visual = this.#visual.get(window);
    const cursor = visual?.head ?? currentMainItemCursorRef(window);
    this.#visual.delete(window);
    const visible = projectMainSelection(window, selection.values(), cursor);
    this.show(window, `Visual cancelled · Selection ${selection.size} · ${visible} visible`, false);
    this.#logger.debug('main visual cancelled');
  }

  leave(window: MainWindow): void {
    this.#visual.delete(window);
    this.hide(window);
  }

  removeWindow(window: MainWindow): void {
    this.#visual.delete(window);
    const ui = this.#ui.get(window);
    if (!ui) return;
    window.clearTimeout(ui.timer);
    ui.badge?.remove();
    this.#ui.delete(window);
  }

  private visualRefs(window: MainWindow, visual: VisualState): ItemRef[] {
    const anchor = mainItemRowForRef(window, visual.anchor);
    const head = mainItemRowForRef(window, visual.head);
    if (anchor === undefined || head === undefined) return [];

    const start = Math.min(anchor, head);
    const end = Math.max(anchor, head);
    const refs: ItemRef[] = [];
    for (let row = start; row <= end; row += 1) {
      const ref = mainItemRefAtRow(window, row);
      if (ref) refs.push(ref);
    }
    return refs;
  }

  private itemRefAtOrToward(window: MainWindow, start: number, step: 1 | -1): ItemRef | undefined {
    const rowCount = mainItemRowCount(window);
    for (let row = start; row >= 0 && row < rowCount; row += step) {
      const ref = mainItemRefAtRow(window, row);
      if (ref) return ref;
    }
    return undefined;
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

  private showSelection(window: MainWindow, count: number, visible: number): void {
    this.show(window, `Selection ${count} · ${visible} visible`, false);
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
