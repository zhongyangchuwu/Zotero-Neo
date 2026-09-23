import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import { THEME_VARS, type ThemeManager } from '../ui/theme';
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
import { MainItemStateDecoration, type MainVisualRange } from './item-state-decoration';

type ItemSelectDirection = 1 | -1 | 'first' | 'last';
export type ItemSelectEnterResult = 'entered' | 'focus-items' | 'unavailable' | 'pass';
type ItemSelectUi = {
  badge: HTMLElement | null;
  timer: number | undefined;
  readonly theme: ThemeManager;
  selectionCleanup: (() => void) | null;
  themeCleanup: (() => void) | null;
};
type VisualState = {
  readonly anchor: ItemRef;
  readonly head: ItemRef;
  readonly range: MainVisualRange | undefined;
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

export function selectionStatusText(total: number, visible: number): string {
  const hidden = Math.max(0, total - visible);
  return `SEL ${total} · ${visible} visible${hidden ? ` · ${hidden} hidden` : ''}`;
}

export function visualStatusText(targetCount: number, selectionCount: number): string {
  return `VISUAL ${targetCount} · SEL ${selectionCount}`;
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
  readonly #decoration = new MainItemStateDecoration();

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  addWindow(window: MainWindow, selection: SelectionStore, theme: ThemeManager): void {
    if (this.#ui.has(window)) return;
    const ui: ItemSelectUi = {
      badge: null,
      timer: undefined,
      theme,
      selectionCleanup: null,
      themeCleanup: null,
    };
    this.#ui.set(window, ui);
    this.#decoration.addWindow(window, selection, () => this.#visual.get(window)?.range, theme);
    ui.selectionCleanup = selection.observe(() => {
      const visual = this.#visual.get(window);
      if (visual) this.showMode(window, visual.range?.count ?? 0, selection);
      else
        this.renderSelectionStatus(
          window,
          selection.size,
          visibleMainSelectionCount(window, selection.values()),
        );
    });
  }

  refresh(window: MainWindow, selection: SelectionStore): void {
    this.#decoration.refresh(window);
    const visual = this.#visual.get(window);
    if (visual) {
      const range = this.resolveVisualRange(window, visual.anchor, visual.head);
      this.#visual.set(window, { ...visual, range });
      this.showMode(window, range?.count ?? 0, selection);
      return;
    }
    this.renderSelectionStatus(
      window,
      selection.size,
      visibleMainSelectionCount(window, selection.values()),
    );
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
    this.#decoration.refresh(window);
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

    const range = this.resolveVisualRange(window, cursor, cursor);
    this.#visual.set(window, { anchor: cursor, head: cursor, range });
    this.#decoration.refresh(window);
    this.showMode(window, range?.count ?? shown, selection);
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

    const range = this.resolveVisualRange(window, state.anchor, head);
    if (!range) {
      this.cancel(window, selection);
      return;
    }
    const nextState = { anchor: state.anchor, head, range };
    const shown = showMainVisualRange(window, nextState.anchor, nextState.head, shouldDebounce);
    if (shown === undefined) {
      this.cancel(window, selection);
      return;
    }

    this.#visual.set(window, nextState);
    this.#decoration.refresh(window);
    this.showMode(window, shown, selection);
  }

  swapEnds(window: MainWindow, selection: SelectionStore): void {
    const state = this.#visual.get(window);
    if (!state) return;

    const range = this.resolveVisualRange(window, state.head, state.anchor);
    if (!range) {
      this.cancel(window, selection);
      return;
    }
    const nextState = { anchor: state.head, head: state.anchor, range };
    const shown = showMainVisualRange(window, nextState.anchor, nextState.head);
    if (shown === undefined) {
      this.cancel(window, selection);
      return;
    }

    this.#visual.set(window, nextState);
    this.#decoration.refresh(window);
    this.showMode(window, shown, selection);
  }

  finish(window: MainWindow, selection: SelectionStore): number {
    const state = this.#visual.get(window);
    if (!state) return 0;

    const target = this.visualRefs(window, state);
    const result = selection.toggleTarget(target);
    const visible = projectMainSelection(window, selection.values(), state.head);
    this.#visual.delete(window);
    this.#decoration.refresh(window);

    this.renderSelectionStatus(window, selection.size, visible);
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
    this.#decoration.refresh(window);
    this.renderSelectionStatus(window, selection.size, visible);
    this.#logger.debug(`main visual cancelled total=${selection.size} visible=${visible}`);
  }

  leave(window: MainWindow, selection: SelectionStore): void {
    const state = this.#visual.get(window);
    if (state) projectMainSelection(window, selection.values(), state.head);
    this.#visual.delete(window);
    this.#decoration.refresh(window);
    this.renderSelectionStatus(
      window,
      selection.size,
      visibleMainSelectionCount(window, selection.values()),
    );
  }

  removeWindow(window: MainWindow): void {
    const ui = this.#ui.get(window);
    if (ui) {
      window.clearTimeout(ui.timer);
      ui.selectionCleanup?.();
      ui.themeCleanup?.();
      ui.badge?.remove();
      this.#ui.delete(window);
    }
    this.#visual.delete(window);
    this.#decoration.removeWindow(window);
  }

  clearSelection(window: MainWindow, selection: SelectionStore): boolean {
    const changed = selection.clear();
    const cursor = currentMainItemCursorRef(window);
    projectMainSelection(window, selection.values(), cursor);
    this.#decoration.refresh(window);
    if (changed) this.show(window, 'Selection cleared', false);
    else this.hide(window);
    this.#logger.debug(`main selection cleared changed=${changed}`);
    return changed;
  }

  private resolveVisualRange(
    window: MainWindow,
    anchorRef: ItemRef,
    headRef: ItemRef,
  ): MainVisualRange | undefined {
    const anchor = mainItemRowForRef(window, anchorRef);
    const head = mainItemRowForRef(window, headRef);
    if (anchor === undefined || head === undefined) return undefined;
    const first = Math.min(anchor, head);
    const last = Math.max(anchor, head);
    return { first, last, count: last - first + 1 };
  }

  private visualRefs(window: MainWindow, state: VisualState): ItemRef[] {
    if (!state.range) return [];
    const refs: ItemRef[] = [];
    for (let row = state.range.first; row <= state.range.last; row += 1) {
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
    this.show(window, visualStatusText(targetCount, selection.size), true);
  }

  private renderSelectionStatus(window: MainWindow, total: number, visible: number): void {
    if (total <= 0) {
      this.hide(window);
      return;
    }
    this.show(window, selectionStatusText(total, visible), true);
  }

  private show(window: MainWindow, text: string, persistent: boolean): void {
    const ui = this.#ui.get(window);
    if (!ui) return;
    window.clearTimeout(ui.timer);
    ui.timer = undefined;
    if (!ui.badge) {
      const badge = window.document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      badge.id = 'zotero-neo-item-select-status';
      badge.style.cssText = `position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:99998;font:bold 12px/1.4 monospace;padding:3px 9px;border:1px solid ${THEME_VARS.border};border-radius:3px;background:${THEME_VARS.surface};color:${THEME_VARS.text};box-shadow:0 4px 16px ${THEME_VARS.shadow};pointer-events:none;user-select:none`;
      (window.document.body ?? window.document.documentElement).append(badge);
      ui.themeCleanup = ui.theme.add(badge);
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
    ui.themeCleanup?.();
    ui.themeCleanup = null;
    ui.badge?.remove();
    ui.badge = null;
  }
}
