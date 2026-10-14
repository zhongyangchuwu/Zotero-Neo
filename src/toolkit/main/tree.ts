import type { MainWindow } from '../../core/contracts';
import type { FocusDirection } from '../../input/actions';
import {
  mainPane,
  mainScopeCursorRow,
  mainScopeSelectedRows,
  moveMainScopeCursor,
  mainSelectedCollection,
  focusMainContextPane,
} from './host';

export type MainTreePanel = 'collections' | 'items';

function containsTarget(root: unknown, node: unknown): boolean {
  if (!root || !node) return false;
  if (root === node) return true;
  if (typeof root !== 'object' || !('contains' in root) || typeof root.contains !== 'function')
    return false;
  try {
    return Boolean(root.contains(node));
  } catch {
    return false;
  }
}

/** Recognizes native tree focus without exporting host nodes. */
export function mainTreeFocused(window: MainWindow, panel: MainTreePanel): boolean {
  const active = window.document.activeElement;
  if (!active) return false;
  const pane = mainPane(window);
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

export function mainFocusedPanel(window: MainWindow, fallback: MainTreePanel): MainTreePanel {
  if (mainTreeFocused(window, 'collections')) return 'collections';
  if (mainTreeFocused(window, 'items')) return 'items';
  return mainPane(window)?.collectionsView?.selection?.count ? 'collections' : fallback;
}

/** Focus restores only Scope Cursor, preserving the complete native ScopeSet. */
export function focusMainPanel(window: MainWindow, panel: MainTreePanel): boolean {
  const pane = mainPane(window);
  const view = panel === 'collections' ? pane?.collectionsView : pane?.itemsView;
  const scopeCursor = panel === 'collections' ? mainScopeCursorRow(window) : undefined;
  const selectedScopeRows = panel === 'collections' ? mainScopeSelectedRows(window) : [];
  const leavingItems = panel === 'collections' && mainTreeFocused(window, 'items');
  const hasScopeSelection =
    panel === 'collections' && (selectedScopeRows.length > 0 || !!view?.selection?.count);
  const fallback = window.document.querySelector(
    panel === 'collections'
      ? '#collection-tree,#zotero-collections-tree .virtualized-table,#zotero-collections-tree'
      : '#item-tree-main-default,#zotero-items-tree .virtualized-table,#zotero-items-tree',
  );
  const topDiv = view?.tree?._topDiv;
  const target = (topDiv ?? view?.tree ?? view?.domEl ?? fallback) as HTMLElement | null;
  if (!target?.focus && !view?.focus) return false;
  target?.focus?.();
  if (!topDiv?.focus) view?.focus?.();
  if (hasScopeSelection) {
    const cursor =
      leavingItems && selectedScopeRows.length === 1
        ? selectedScopeRows[0]
        : scopeCursor !== undefined && Number.isInteger(scopeCursor) && scopeCursor >= 0
          ? scopeCursor
          : selectedScopeRows[0];
    if (cursor !== undefined && view?.selection?.focused !== cursor)
      moveMainScopeCursor(window, cursor);
  } else if (
    view?.selection &&
    !(view.selection.count && (view.selection.focused ?? -1) >= 0) &&
    view.rowCount &&
    view.rowCount > 0
  ) {
    const row = Math.max(0, Math.min(view.selection.focused ?? 0, view.rowCount - 1));
    view.selection.select?.(row);
    view.ensureRowIsVisible?.(row);
  }
  return true;
}

export function mainTreeCursorState(
  window: MainWindow,
  panel: MainTreePanel,
): { readonly focused: number; readonly rowCount: number } | undefined {
  const pane = mainPane(window);
  const view = panel === 'collections' ? pane?.collectionsView : pane?.itemsView;
  return view?.selection
    ? { focused: view.selection.focused ?? 0, rowCount: view.rowCount ?? 1 }
    : undefined;
}

export function selectMainScopeRow(
  window: MainWindow,
  row: number,
  shouldDebounce = false,
  ensureVisible = false,
): boolean {
  const view = mainPane(window)?.collectionsView;
  if (!view?.selection?.select) return false;
  view.selection.select(row, shouldDebounce);
  if (ensureVisible) view.ensureRowIsVisible?.(row);
  return true;
}

export interface MainScopeCursorNode {
  readonly row: number;
  readonly container: boolean;
  readonly empty: boolean;
  readonly open: boolean;
  readonly parent: number | undefined;
}

export function mainScopeCursorNode(window: MainWindow): MainScopeCursorNode | undefined {
  const view = mainPane(window)?.collectionsView;
  if (!view) return undefined;
  let row = view.selection?.focused ?? -1;
  if (!(row >= 0 && view.getRow?.(row))) {
    const id = mainSelectedCollection(window)?.id;
    row = id ? (view.getRowIndexByID?.(`C${id}`) ?? -1) : -1;
  }
  if (row < 0) return undefined;
  return {
    row,
    container: !!view.isContainer?.(row),
    empty: !!view.isContainerEmpty?.(row),
    open: !!view.isContainerOpen?.(row),
    parent: view.getParentIndex?.(row),
  };
}

export async function toggleMainScopeRow(window: MainWindow, row: number): Promise<void> {
  await mainPane(window)?.collectionsView?.toggleOpenState?.(row);
}

/** Native row inventory changes as containers expand, so traversal remains host-owned. */
export function setMainScopeExpansionAll(window: MainWindow, open: boolean): boolean | undefined {
  const view = mainPane(window)?.collectionsView;
  if (!view) return undefined;
  let changed = false;
  if (open) {
    for (let pass = 0; pass < Math.min(300, Math.max(25, (view.rowCount ?? 0) + 10)); pass += 1) {
      let passChanged = false;
      for (let row = 0; row < (view.rowCount ?? 0); row += 1) {
        if (
          view.isContainer?.(row) &&
          !view.isContainerOpen?.(row) &&
          !view.isContainerEmpty?.(row)
        ) {
          void view.toggleOpenState?.(row);
          changed = passChanged = true;
        }
      }
      if (!passChanged) break;
    }
  } else {
    for (let row = (view.rowCount ?? 0) - 1; row >= 0; row -= 1) {
      if (view.isContainer?.(row) && view.isContainerOpen?.(row)) {
        void view.toggleOpenState?.(row);
        changed = true;
      }
    }
  }
  return changed;
}

type FocusElement = Element & { readonly hidden?: boolean; focus?(): void };
interface FocusTarget {
  readonly root: FocusElement;
  readonly focus: () => boolean;
}

function asFocusElement(value: unknown): FocusElement | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('getBoundingClientRect' in value) ||
    typeof value.getBoundingClientRect !== 'function'
  )
    return null;
  return value as FocusElement;
}
function focusRect(element: FocusElement): DOMRect | null {
  if (element.hidden || element.getAttribute?.('hidden') === 'true') return null;
  const rect = element.getBoundingClientRect();
  const width = rect.width ?? rect.right - rect.left;
  const height = rect.height ?? rect.bottom - rect.top;
  return width > 0 && height > 0 ? rect : null;
}
function containsFocus(root: FocusElement, active: Element | null): boolean {
  if (!active) return false;
  try {
    return root === active || root.contains(active);
  } catch {
    return false;
  }
}
function focusElement(document: Document, root: FocusElement): boolean {
  const target =
    asFocusElement(
      root.querySelector?.(
        'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ) ?? root;
  target.focus?.();
  return containsFocus(root, document.activeElement);
}

export function focusMainDirection(
  window: MainWindow,
  direction: FocusDirection,
  focusPanel: (panel: MainTreePanel) => boolean,
): boolean {
  const document = window.document;
  const pane = mainPane(window);
  const collections = pane?.collectionsView;
  const items = pane?.itemsView;
  const collectionsRoot =
    asFocusElement(collections?.domEl) ??
    asFocusElement(collections?.tree) ??
    asFocusElement(
      document.querySelector(
        '#collection-tree,#zotero-collections-tree .virtualized-table,#zotero-collections-tree',
      ),
    );
  const itemsRoot =
    asFocusElement(items?.domEl) ??
    asFocusElement(items?.tree) ??
    asFocusElement(
      document.querySelector(
        '#item-tree-main-default,#zotero-items-tree .virtualized-table,#zotero-items-tree',
      ),
    );
  const detailRoot = asFocusElement(document.getElementById('zotero-item-pane'));
  const contextRoot = asFocusElement(document.getElementById('zotero-context-pane'));
  const targets: FocusTarget[] = [];
  if (collectionsRoot)
    targets.push({ root: collectionsRoot, focus: () => focusPanel('collections') });
  if (itemsRoot) targets.push({ root: itemsRoot, focus: () => focusPanel('items') });
  if (detailRoot)
    targets.push({ root: detailRoot, focus: () => focusElement(document, detailRoot) });
  if (contextRoot)
    targets.push({
      root: contextRoot,
      focus: () => focusMainContextPane(window) || focusElement(document, contextRoot),
    });
  const visible = targets.flatMap((target) => {
    const rect = focusRect(target.root);
    return rect ? [{ target, rect }] : [];
  });
  const active = document.activeElement;
  const current = visible
    .filter(({ target }) => containsFocus(target.root, active))
    .sort(
      (a, b) =>
        (a.rect.right - a.rect.left) * (a.rect.bottom - a.rect.top) -
        (b.rect.right - b.rect.left) * (b.rect.bottom - b.rect.top),
    )[0];
  const activeElement = asFocusElement(active);
  const origin = current?.rect ?? (activeElement ? focusRect(activeElement) : null);
  if (!origin) return false;
  const originX = (origin.left + origin.right) / 2;
  const originY = (origin.top + origin.bottom) / 2;
  const ranked = visible
    .filter(({ target, rect }) => {
      if (target === current?.target) return false;
      const x = (rect.left + rect.right) / 2;
      const y = (rect.top + rect.bottom) / 2;
      if (direction === 'left') return x < originX;
      if (direction === 'right') return x > originX;
      if (direction === 'up') return y < originY;
      return y > originY;
    })
    .sort((a, b) => {
      const overlapsAxis = (rect: DOMRect): boolean =>
        direction === 'left' || direction === 'right'
          ? rect.bottom > origin.top && rect.top < origin.bottom
          : rect.right > origin.left && rect.left < origin.right;
      const alignedDifference = Number(overlapsAxis(b.rect)) - Number(overlapsAxis(a.rect));
      if (alignedDifference) return alignedDifference;
      const ax = (a.rect.left + a.rect.right) / 2 - originX;
      const ay = (a.rect.top + a.rect.bottom) / 2 - originY;
      const bx = (b.rect.left + b.rect.right) / 2 - originX;
      const by = (b.rect.top + b.rect.bottom) / 2 - originY;
      return ax * ax + ay * ay - (bx * bx + by * by);
    });
  return ranked.some(({ target }) => target.focus());
}
