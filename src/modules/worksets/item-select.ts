import type { MainWindow } from '../../core/contracts';
import { CleanupFailure } from '../../core/cleanup';
import type { Logger } from '../../core/logging';
import {
  currentMainItemCursorRef,
  mainTreeFocused,
  mainItemCursorRow,
  mainItemRefAtRow,
  mainItemRowCount,
  mainItemRowForRef,
  selectMainItemCursorAnchor,
  visibleMainSelectionCount,
} from '../../toolkit/main';
import { resolveMainCurrentTarget, type MainCurrentTarget } from '../../main/action-targets';
import type { ItemRef } from '../../core/item-ref';
import type { SelectionStore } from './selection-store';
import type { MainVisualRange } from '../../main/item-state-decoration';
import {
  interactionStatusColors,
  type InteractionAppearanceSource,
  type InteractionStatusKind,
} from '../../main/interaction-appearance';

type ItemSelectDirection = 1 | -1 | 'first' | 'last';
export type ItemSelectEnterResult = 'entered' | 'unavailable' | 'pass';
type ItemSelectStatus =
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'selection'; readonly total: number; readonly visible: number }
  | { readonly kind: 'visual'; readonly targetCount: number; readonly selectionCount: number };

type ItemSelectUi = {
  badge: HTMLElement | null;
  timer: number | undefined;
  readonly appearance: InteractionAppearanceSource;
  selectionCleanup: (() => void) | null;
  appearanceCleanup: (() => void) | null;
  status: ItemSelectStatus | null;
};
type VisualState = {
  readonly anchor: ItemRef;
  readonly head: ItemRef;
  readonly range: MainVisualRange | undefined;
  readonly revision: number;
};

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
 * Persistent Selection and transient Visual state are owned by the worksets module.
 */
export class MainItemSelect {
  readonly #logger: Logger;
  readonly #ui = new Map<MainWindow, ItemSelectUi>();
  readonly #visual = new Map<MainWindow, VisualState>();
  #nextVisualRevision = 0;
  readonly #refreshDecorations: () => void;
  readonly #isCurrent: () => boolean;

  constructor(logger: Logger, refreshDecorations: () => void, isCurrent: () => boolean) {
    this.#logger = logger;
    this.#refreshDecorations = refreshDecorations;
    this.#isCurrent = isCurrent;
  }

  addWindow(
    window: MainWindow,
    selection: SelectionStore,
    appearance: InteractionAppearanceSource,
  ): void {
    if (this.#ui.has(window)) return;
    const ui: ItemSelectUi = {
      badge: null,
      timer: undefined,
      appearance,
      selectionCleanup: null,
      appearanceCleanup: null,
      status: null,
    };
    this.#ui.set(window, ui);
    ui.selectionCleanup = selection.observe(() => {
      if (!this.#isCurrent() || this.#ui.get(window) !== ui) return;
      this.#refreshDecorations();
      const visual = this.#visual.get(window);
      if (visual) this.showMode(window, visual.range?.count ?? 0, selection);
      else
        this.renderSelectionStatus(
          window,
          selection.size,
          visibleMainSelectionCount(window, selection.values()),
        );
    });
    ui.appearanceCleanup = appearance.observe(() => {
      if (!this.#isCurrent() || this.#ui.get(window) !== ui) return;
      if (ui.status) this.renderBadge(window, ui, ui.status);
    });
  }

  refresh(window: MainWindow, selection: SelectionStore): void {
    const visual = this.#visual.get(window);
    if (visual) {
      const range = this.resolveVisualRange(window, visual.anchor, visual.head);
      const changed =
        range?.first !== visual.range?.first ||
        range?.last !== visual.range?.last ||
        range?.count !== visual.range?.count;
      this.#visual.set(window, {
        ...visual,
        range,
        revision: changed ? ++this.#nextVisualRevision : visual.revision,
      });
      this.#refreshDecorations();
      this.showMode(window, range?.count ?? 0, selection);
      return;
    }
    this.#refreshDecorations();
    this.renderSelectionStatus(
      window,
      selection.size,
      visibleMainSelectionCount(window, selection.values()),
    );
  }

  itemsFocused(window: MainWindow): boolean {
    return this.treeFocused(window, 'items');
  }

  /** The transient Visual range is the sole source of Main mode ownership. */
  isVisual(window: MainWindow): boolean {
    return this.#visual.has(window);
  }

  currentTarget(window: MainWindow): MainCurrentTarget | null {
    const visual = this.#visual.get(window);
    if (visual) return { source: 'visual', refs: this.visualRefs(window, visual) };
    return resolveMainCurrentTarget(window);
  }
  visualRevision(window: MainWindow): number | null {
    return this.#visual.get(window)?.revision ?? null;
  }
  visualRange(window: MainWindow): MainVisualRange | undefined {
    return this.#visual.get(window)?.range;
  }

  cancelIfVisualRevision(window: MainWindow, revision: number, selection: SelectionStore): boolean {
    if (this.#visual.get(window)?.revision !== revision) return false;
    this.cancel(window, selection);
    return true;
  }

  toggleCurrentTarget(
    window: MainWindow,
    selection: SelectionStore,
    shouldDebounce = false,
  ): boolean {
    if (!this.itemsFocused(window)) return false;
    const cursor = currentMainItemCursorRef(window);
    const row = mainItemCursorRow(window);
    const rowCount = mainItemRowCount(window);
    if (!cursor || row === undefined || rowCount <= 0) return false;

    const target = this.currentTarget(window);
    if (!target?.refs.length) return false;
    const before = selection.values();
    const result = selection.toggleTarget(target.refs);
    if (result === 'unchanged') return false;

    const next = Math.min(rowCount - 1, row + 1);
    if (!selectMainItemCursorAnchor(window, next, shouldDebounce)) {
      selection.clear();
      for (const ref of before) selection.add(ref);
      return false;
    }

    const visible = visibleMainSelectionCount(window, selection.values());
    this.#refreshDecorations();
    this.#logger.debug(
      `main selection target toggle source=${target.source} target=${target.refs.length} result=${result} total=${selection.size} visible=${visible}`,
    );
    return true;
  }

  enter(window: MainWindow, selection: SelectionStore): ItemSelectEnterResult {
    if (!this.treeFocused(window, 'items')) return 'pass';

    const cursor = currentMainItemCursorRef(window);
    if (!cursor) {
      this.show(window, { kind: 'message', text: 'VISUAL · unavailable' }, false);
      return 'unavailable';
    }

    const range = this.resolveVisualRange(window, cursor, cursor);
    if (!range || !selectMainItemCursorAnchor(window, range.first)) {
      this.show(window, { kind: 'message', text: 'VISUAL · unavailable' }, false);
      return 'unavailable';
    }

    this.#visual.set(window, {
      anchor: cursor,
      head: cursor,
      range,
      revision: ++this.#nextVisualRevision,
    });
    this.#refreshDecorations();
    this.showMode(window, range.count, selection);
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
    const nextState = {
      anchor: state.anchor,
      head,
      range,
      revision: ++this.#nextVisualRevision,
    };
    if (!selectMainItemCursorAnchor(window, next, shouldDebounce)) {
      this.cancel(window, selection);
      return;
    }

    this.#visual.set(window, nextState);
    this.#refreshDecorations();
    this.showMode(window, range.count, selection);
  }

  swapEnds(window: MainWindow, selection: SelectionStore): void {
    const state = this.#visual.get(window);
    if (!state) return;

    const range = this.resolveVisualRange(window, state.head, state.anchor);
    if (!range) {
      this.cancel(window, selection);
      return;
    }
    const nextState = {
      anchor: state.head,
      head: state.anchor,
      range,
      revision: ++this.#nextVisualRevision,
    };
    const headRow = mainItemRowForRef(window, nextState.head);
    if (headRow === undefined || !selectMainItemCursorAnchor(window, headRow)) {
      this.cancel(window, selection);
      return;
    }

    this.#visual.set(window, nextState);
    this.#refreshDecorations();
    this.showMode(window, range.count, selection);
  }

  finish(window: MainWindow, selection: SelectionStore): number {
    const state = this.#visual.get(window);
    if (!state) return 0;

    const target = this.visualRefs(window, state);
    const result = selection.toggleTarget(target);
    const headRow = mainItemRowForRef(window, state.head);
    if (headRow !== undefined) selectMainItemCursorAnchor(window, headRow);
    const visible = visibleMainSelectionCount(window, selection.values());
    this.#visual.delete(window);
    this.#refreshDecorations();

    this.renderSelectionStatus(window, selection.size, visible);
    this.#logger.debug(
      `main visual committed target=${target.length} result=${result} total=${selection.size} visible=${visible}`,
    );
    return target.length;
  }

  cancel(window: MainWindow, selection: SelectionStore): void {
    const state = this.#visual.get(window);
    if (!state) return;
    const cursorRow = mainItemRowForRef(window, state.head);
    if (cursorRow !== undefined) selectMainItemCursorAnchor(window, cursorRow);
    const visible = visibleMainSelectionCount(window, selection.values());
    this.#visual.delete(window);
    this.#refreshDecorations();
    this.renderSelectionStatus(window, selection.size, visible);
    this.#logger.debug(`main visual cancelled total=${selection.size} visible=${visible}`);
  }

  leave(window: MainWindow, selection: SelectionStore): void {
    const state = this.#visual.get(window);
    const headRow = state ? mainItemRowForRef(window, state.head) : undefined;
    if (headRow !== undefined) selectMainItemCursorAnchor(window, headRow);
    this.#visual.delete(window);
    this.#refreshDecorations();
    this.renderSelectionStatus(
      window,
      selection.size,
      visibleMainSelectionCount(window, selection.values()),
    );
  }

  removeWindow(window: MainWindow): void {
    const ui = this.#ui.get(window);
    this.#ui.delete(window);
    this.#visual.delete(window);
    const failure = new CleanupFailure();
    if (ui) {
      failure.run(() => window.clearTimeout(ui.timer));
      failure.run(() => ui.selectionCleanup?.());
      failure.run(() => ui.appearanceCleanup?.());
      failure.run(() => ui.badge?.remove());
    }
    failure.rethrow();
  }

  clearSelection(window: MainWindow, selection: SelectionStore): boolean {
    const changed = selection.clear();
    this.#refreshDecorations();
    if (changed) this.show(window, { kind: 'message', text: 'Selection cleared' }, false);
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
    return mainTreeFocused(window, panel);
  }

  private showMode(window: MainWindow, targetCount: number, selection: SelectionStore): void {
    this.show(window, { kind: 'visual', targetCount, selectionCount: selection.size }, true);
  }

  private renderSelectionStatus(window: MainWindow, total: number, visible: number): void {
    if (total <= 0) {
      this.hide(window);
      return;
    }
    this.show(window, { kind: 'selection', total, visible }, true);
  }

  private show(window: MainWindow, status: ItemSelectStatus, persistent: boolean): void {
    const ui = this.#ui.get(window);
    if (!ui) return;
    window.clearTimeout(ui.timer);
    ui.timer = undefined;
    ui.status = status;
    this.renderBadge(window, ui, status);
    if (!persistent) {
      const timer = window.setTimeout(() => {
        if (this.#isCurrent() && this.#ui.get(window) === ui && ui.timer === timer)
          this.hide(window);
      }, 1200);
      ui.timer = timer;
    }
  }

  private renderBadge(window: MainWindow, ui: ItemSelectUi, status: ItemSelectStatus): void {
    if (!ui.badge) {
      const badge = window.document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      badge.id = 'zotero-neo-item-select-status';
      ui.badge = badge;
      (window.document.body ?? window.document.documentElement).append(badge);
    }
    const badge = ui.badge;
    const kind: InteractionStatusKind = status.kind === 'message' ? 'neutral' : status.kind;
    const appearance = ui.appearance.appearance;
    const colors = interactionStatusColors(appearance, kind);
    badge.style.cssText = `position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:99998;font:600 12px/1.4 monospace;padding:3px 9px;border:1px solid ${colors.border};border-radius:6px;background:${colors.background};color:${colors.foreground};box-shadow:0 2px 8px ${colors.shadow};pointer-events:none;user-select:none;display:block`;
    badge.replaceChildren();

    if (status.kind === 'message') {
      this.appendStatusSpan(window, badge, status.text, 'zotero-neo-status-message');
      return;
    }
    if (status.kind === 'selection') {
      this.appendStatusSpan(
        window,
        badge,
        'SEL',
        'zotero-neo-status-selection',
        colors.selectionPrefix,
      );
      const hidden = Math.max(0, status.total - status.visible);
      this.appendStatusSpan(
        window,
        badge,
        ` ${status.total} · ${status.visible} visible${hidden ? ` · ${hidden} hidden` : ''}`,
        'zotero-neo-status-detail',
      );
      return;
    }

    this.appendStatusSpan(window, badge, 'VISUAL', 'zotero-neo-status-visual', colors.visualPrefix);
    this.appendStatusSpan(window, badge, ` ${status.targetCount} · `, 'zotero-neo-status-detail');
    this.appendStatusSpan(
      window,
      badge,
      'SEL',
      'zotero-neo-status-selection',
      colors.selectionPrefix,
    );
    this.appendStatusSpan(window, badge, ` ${status.selectionCount}`, 'zotero-neo-status-detail');
  }

  private appendStatusSpan(
    window: MainWindow,
    badge: HTMLElement,
    text: string,
    className: string,
    color?: string,
  ): void {
    const span = window.document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
    span.className = className;
    span.textContent = text;
    if (color) span.style.color = color;
    badge.append(span);
  }

  private hide(window: MainWindow): void {
    const ui = this.#ui.get(window);
    if (!ui) return;
    window.clearTimeout(ui.timer);
    ui.timer = undefined;
    ui.status = null;
    ui.badge?.remove();
    ui.badge = null;
  }
}
