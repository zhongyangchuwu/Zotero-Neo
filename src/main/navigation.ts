import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import { citationKey } from '../platform/better-bibtex';
import type { FocusDirection } from '../input/actions';
import { copyToClipboard } from '../platform/clipboard';
import { THEME_VARS } from '../ui/theme';
import type { MainPanel, MainWindowSession } from './session';
import { closeSelectedMainTab, cycleMainTab, mainHost } from './host';

type Selection = { focused?: number; count?: number; select?(index: number): void };
type TreeFocusTarget = { focus?(): void };
export type TreeView = {
  tree?: TreeFocusTarget;
  domEl?: HTMLElement;
  rowCount?: number;
  selection?: Selection;
  focus?(): void;
  ensureRowIsVisible?(index: number): void;
  isContainer?(index: number): boolean;
  isContainerOpen?(index: number): boolean;
  isContainerEmpty?(index: number): boolean;
  toggleOpenState?(index: number): Promise<void> | void;
  getParentIndex?(index: number): number;
  getRow?(index: number): unknown;
  getSelectedCollections?(idOnly?: false): Zotero.Collection[];
  getSelectedCollections?(idOnly: true): number[];
  getRowIndexByID?(id: string): number;
};

type FocusElement = Element & {
  readonly hidden?: boolean;
  focus?(): void;
  getBoundingClientRect(): {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
    readonly width?: number;
    readonly height?: number;
  };
};

interface FocusTarget {
  readonly root: FocusElement;
  readonly focus: () => boolean;
}

function asFocusElement(value: unknown): FocusElement | null {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { getBoundingClientRect?: unknown }).getBoundingClientRect !== 'function'
  )
    return null;
  return value as FocusElement;
}

function focusRect(element: FocusElement): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} | null {
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

export function selectedCollection(view: TreeView | undefined): Zotero.Collection | undefined {
  return view?.getSelectedCollections?.()[0];
}

export function selectedCollectionID(view: TreeView | undefined): number | undefined {
  return view?.getSelectedCollections?.(true)[0];
}

export class MainNavigation {
  readonly #logger: Logger;
  readonly #rescan: (window: MainWindow) => void;
  constructor(logger: Logger, rescan: (window: MainWindow) => void) {
    this.#logger = logger;
    this.#rescan = rescan;
  }
  status(session: MainWindowSession, text: string, milliseconds = 2000): void {
    session.status.textContent = text;
    session.status.style.display = 'block';
    session.status.style.color = THEME_VARS.onAccent;
    session.status.style.background = text.startsWith('✓')
      ? THEME_VARS.success
      : text.startsWith('→') || text.startsWith('▶')
        ? THEME_VARS.accent
        : THEME_VARS.error;
    const timer = session.window.setTimeout(() => {
      session.status.style.display = 'none';
    }, milliseconds);
    session.cleanup.add(() => session.window.clearTimeout(timer));
  }
  panel(window: MainWindow, session: MainWindowSession): MainPanel {
    const current = window.document.activeElement;
    const h = mainHost(window);
    const collections = h.ZoteroPane?.collectionsView;
    const collectionTargets = [
      collections?.tree,
      collections?.domEl,
      window.document.getElementById('collection-tree'),
      window.document.getElementById('zotero-collections-tree'),
      window.document.querySelector('#zotero-collections-tree .virtualized-table'),
    ];
    if (
      current &&
      (collectionTargets.some(
        (target) => containsTarget(target, current) || containsTarget(current, target),
      ) ||
        current.id.includes('collection'))
    ) {
      session.activePanel = 'collections';
    } else if (this.itemPaneContainsFocus(window)) {
      session.activePanel = 'items';
    } else if (collections?.selection?.count) {
      session.activePanel = 'collections';
    }
    return session.activePanel;
  }
  focusPanel(window: MainWindow, session: MainWindowSession, panel: MainPanel): boolean {
    const view =
      panel === 'collections'
        ? mainHost(window).ZoteroPane?.collectionsView
        : mainHost(window).ZoteroPane?.itemsView;
    const fallback = window.document.querySelector(
      panel === 'collections'
        ? '#collection-tree,#zotero-collections-tree .virtualized-table,#zotero-collections-tree'
        : '#item-tree-main-default,#zotero-items-tree .virtualized-table,#zotero-items-tree',
    );
    const focusTarget = (view?.tree ?? view?.domEl ?? fallback) as HTMLElement | null;
    if (!focusTarget?.focus && !view?.focus) return false;
    focusTarget?.focus?.();
    view?.focus?.();
    session.activePanel = panel;
    this.ensureSelection(view);
    return true;
  }

  focusDirection(
    window: MainWindow,
    session: MainWindowSession,
    direction: FocusDirection,
  ): boolean {
    const h = mainHost(window);
    const document = window.document;
    const collections = h.ZoteroPane?.collectionsView;
    const items = h.ZoteroPane?.itemsView;
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
      targets.push({
        root: collectionsRoot,
        focus: () => this.focusPanel(window, session, 'collections'),
      });
    if (itemsRoot)
      targets.push({ root: itemsRoot, focus: () => this.focusPanel(window, session, 'items') });
    if (detailRoot)
      targets.push({ root: detailRoot, focus: () => focusElement(document, detailRoot) });
    if (contextRoot)
      targets.push({
        root: contextRoot,
        focus: () => {
          if (h.ZoteroContextPane?.focus) {
            h.ZoteroContextPane.focus();
            return true;
          }
          return focusElement(document, contextRoot);
        },
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
        const overlapsAxis = (rect: (typeof visible)[number]['rect']): boolean =>
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
  navigate(
    window: MainWindow,
    session: MainWindowSession,
    direction: 1 | -1 | 'first' | 'last',
    count: number,
  ): void {
    const view =
      this.panel(window, session) === 'collections'
        ? mainHost(window).ZoteroPane?.collectionsView
        : mainHost(window).ZoteroPane?.itemsView;
    if (!view?.selection) return;
    const current = view.selection.focused ?? 0;
    const last = Math.max(0, (view.rowCount ?? 1) - 1);
    const next =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? count > 0
            ? Math.min(count - 1, last)
            : last
          : Math.max(0, Math.min(last, current + direction * Math.max(1, count)));
    view.selection.select?.(next);
    view.ensureRowIsVisible?.(next);
  }
  activate(window: MainWindow, session: MainWindowSession): void {
    if (this.panel(window, session) === 'collections') {
      this.focusPanel(window, session, 'items');
      this.status(session, '▶ items', 900);
      return;
    }
    void this.openPDF(window, session);
  }

  async trashItems(ids: readonly number[]): Promise<boolean> {
    const valid = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    if (!valid.length) return false;
    await Zotero.Items.trashTx(valid);
    return true;
  }

  async restoreTrashedItems(ids: readonly number[]): Promise<boolean> {
    const valid = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    if (!valid.length) return false;
    const undo = (
      Zotero as unknown as {
        UndoHistory?: {
          getUndoAction?(): { readonly action?: string } | null;
          undo?(): Promise<boolean>;
        };
      }
    ).UndoHistory;
    if (undo?.getUndoAction?.()?.action === 'undo-action-trash' && undo.undo) {
      return undo.undo();
    }
    let restored = false;
    for (const id of valid) {
      const item = Zotero.Items.get(id);
      if (!item || !item.deleted) continue;
      item.deleted = false;
      await item.saveTx();
      restored = true;
    }
    return restored;
  }
  async trashSelectedItems(window: MainWindow, session: MainWindowSession): Promise<void> {
    if (!this.itemPaneContainsFocus(window)) {
      this.status(session, '✗ Focus the items list first');
      return;
    }
    const ids = (mainHost(window).ZoteroPane?.getSelectedItems?.() ?? []).map((item) => item.id);
    if (!ids.length) {
      this.status(session, '✗ No items selected');
      return;
    }
    try {
      await this.trashItems(ids);
      session.trashedItemIDs = ids;
      this.status(session, `✓ Moved ${ids.length} item${ids.length === 1 ? '' : 's'} to trash`);
    } catch (error) {
      this.#logger.debug(`trash selected items failed: ${String(error)}`);
      this.status(session, '✗ Unable to move selected items to trash');
    }
  }

  async restoreLastTrashedItems(session: MainWindowSession): Promise<void> {
    try {
      const restored = await this.restoreTrashedItems(session.trashedItemIDs);
      if (!restored) {
        this.status(session, '✗ Nothing to restore');
        return;
      }
      const count = session.trashedItemIDs.length;
      session.trashedItemIDs = [];
      this.status(session, `✓ Restored ${count} item${count === 1 ? '' : 's'}`);
    } catch (error) {
      this.#logger.debug(`restore trashed items failed: ${String(error)}`);
      this.status(session, '✗ Unable to restore items');
    }
  }
  async openPDF(window: MainWindow, session: MainWindowSession): Promise<void> {
    try {
      const pane = mainHost(window).ZoteroPane;
      let items = pane?.getSelectedItems?.() ?? [];
      if (!items.length) {
        this.ensureSelection(pane?.itemsView);
        items = pane?.getSelectedItems?.() ?? [];
      }
      const item = items[0];
      if (!item) {
        this.status(session, '✗ No item selected');
        return;
      }
      if (item.isAttachment()) {
        pane?.viewAttachment?.(item.id);
        return;
      }
      if (item.isNote()) {
        await pane?.openNote?.(item.id);
        return;
      }
      let attachment: Zotero.Item | undefined = (await item.getBestAttachment?.()) || undefined;
      if (!attachment) {
        const candidate = item
          .getAttachments()
          .map((id) => Zotero.Items.get(id))
          .find(
            (value): value is Zotero.Item =>
              value !== false &&
              value.isAttachment() &&
              value.attachmentContentType === 'application/pdf',
          );
        attachment = candidate ?? undefined;
      }
      if (attachment) {
        pane?.viewAttachment?.(attachment.id);
        return;
      }
      const doi = item.getField('DOI');
      const url =
        item.getField('url') ||
        (doi ? `https://doi.org/${Zotero.Utilities.cleanDOI?.(doi) ?? doi}` : '');
      if (url) pane?.loadURI?.(url);
      else this.status(session, '✗ No attachment');
    } catch (error) {
      this.#logger.debug(`mainOpenPDF error: ${String(error)}`);
      this.status(session, `✗ ${String(error).slice(0, 40)}`);
    }
  }
  closePDF(window: MainWindow): void {
    closeSelectedMainTab(window);
  }
  cycleTab(window: MainWindow, direction: 1 | -1): void {
    cycleMainTab(window, direction);
    this.afterTabSwitch(window);
  }
  yankCitekey(window: MainWindow, session: MainWindowSession): void {
    try {
      const item = mainHost(window).ZoteroPane?.getSelectedItems?.()[0];
      const key = item ? citationKey(item) : '';
      if (!key) {
        this.status(session, '✗ No citekey (BBT not ready?)');
        return;
      }
      copyToClipboard(key);
      this.status(session, `✓ @${key}`);
    } catch (error) {
      this.status(session, `✗ ${String(error).slice(0, 40)}`);
    }
  }
  async toggleTree(window: MainWindow, session: MainWindowSession): Promise<void> {
    const view = this.collections(window, session);
    const row = this.row(view);
    if (!view || row < 0) return;
    if (!view.isContainer?.(row) || view.isContainerEmpty?.(row)) {
      this.status(session, '→ no child collections', 1000);
      return;
    }
    const open = !!view.isContainerOpen?.(row);
    await view.toggleOpenState?.(row);
    this.focusPanel(window, session, 'collections');
    this.status(session, open ? '→ collapsed' : '→ expanded', 900);
  }
  async openTree(window: MainWindow, session: MainWindowSession): Promise<void> {
    const view = this.collections(window, session);
    const row = this.row(view);
    if (!view || row < 0 || view.isContainerOpen?.(row)) return;
    await view.toggleOpenState?.(row);
    this.status(session, '→ expanded', 900);
  }
  async closeTree(window: MainWindow, session: MainWindowSession): Promise<void> {
    const view = this.collections(window, session);
    const row = this.row(view);
    if (!view || row < 0 || !view.isContainerOpen?.(row)) return;
    await view.toggleOpenState?.(row);
    this.status(session, '→ collapsed', 900);
  }
  expandTree(window: MainWindow, session: MainWindowSession): void {
    const view = this.collections(window, session);
    const row = this.row(view);
    if (!view || row < 0) return;
    if (view.isContainer?.(row) && !view.isContainerOpen?.(row) && !view.isContainerEmpty?.(row)) {
      void view.toggleOpenState?.(row);
      this.status(session, '→ expanded');
    } else this.focusPanel(window, session, 'items');
  }
  collapseTree(window: MainWindow, session: MainWindowSession): void {
    const view = this.collections(window, session);
    const row = this.row(view);
    if (!view || row < 0) return;
    if (view.isContainer?.(row) && view.isContainerOpen?.(row)) {
      void view.toggleOpenState?.(row);
      this.status(session, '→ collapsed');
    } else this.parentTree(window, session);
  }
  parentTree(window: MainWindow, session: MainWindowSession): void {
    const view = this.collections(window, session);
    const parent = view?.getParentIndex?.(this.row(view));
    if (typeof parent === 'number' && parent >= 0) {
      view?.selection?.select?.(parent);
      view?.ensureRowIsVisible?.(parent);
      this.status(session, '→ parent', 900);
    }
  }
  expandAll(window: MainWindow, session: MainWindowSession): void {
    const view = this.collections(window, session);
    if (!view) return;
    let changed = false;
    for (let pass = 0; pass < Math.min(300, Math.max(25, (view.rowCount ?? 0) + 10)); pass += 1) {
      let passChanged = false;
      for (let row = 0; row < (view.rowCount ?? 0); row += 1)
        if (
          view.isContainer?.(row) &&
          !view.isContainerOpen?.(row) &&
          !view.isContainerEmpty?.(row)
        ) {
          void view.toggleOpenState?.(row);
          changed = passChanged = true;
        }
      if (!passChanged) break;
    }
    this.status(session, changed ? '→ expanded all' : '→ already expanded', 900);
  }
  collapseAll(window: MainWindow, session: MainWindowSession): void {
    const view = this.collections(window, session);
    if (!view) return;
    let changed = false;
    for (let row = (view.rowCount ?? 0) - 1; row >= 0; row -= 1)
      if (view.isContainer?.(row) && view.isContainerOpen?.(row)) {
        void view.toggleOpenState?.(row);
        changed = true;
      }
    this.status(session, changed ? '→ collapsed all' : '→ already collapsed', 900);
  }
  afterTabSwitch(window: MainWindow): void {
    for (const delay of [0, 60, 180, 420, 900])
      window.setTimeout(() => this.#rescan(window), delay);
  }
  private itemPaneContainsFocus(window: MainWindow): boolean {
    const current = window.document.activeElement;
    if (!current) return false;
    const items = mainHost(window).ZoteroPane?.itemsView;
    const targets = [
      items?.tree,
      items?.domEl,
      window.document.getElementById('item-tree-main-default'),
      window.document.getElementById('zotero-items-tree'),
      window.document.querySelector('#zotero-items-tree .virtualized-table'),
    ];
    return (
      targets.some(
        (target) => containsTarget(target, current) || containsTarget(current, target),
      ) || current.id.includes('item-tree')
    );
  }

  private collections(window: MainWindow, session: MainWindowSession): TreeView | undefined {
    this.focusPanel(window, session, 'collections');
    return mainHost(window).ZoteroPane?.collectionsView;
  }
  private row(view: TreeView | undefined): number {
    if (!view) return -1;
    const focused = view.selection?.focused ?? -1;
    if (focused >= 0 && view.getRow?.(focused)) return focused;
    const id = selectedCollectionID(view);
    return id ? (view.getRowIndexByID?.(`C${id}`) ?? -1) : -1;
  }
  private ensureSelection(view: TreeView | undefined): void {
    if (
      !view?.selection ||
      (view.selection.count && (view.selection.focused ?? -1) >= 0) ||
      !(view.rowCount && view.rowCount > 0)
    )
      return;
    const row = Math.max(0, Math.min(view.selection.focused ?? 0, view.rowCount - 1));
    view.selection.select?.(row);
    view.ensureRowIsVisible?.(row);
  }
}
