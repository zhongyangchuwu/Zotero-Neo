import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import { citationKey } from '../platform/better-bibtex';
import { copyToClipboard } from '../platform/clipboard';
import type { MainPanel, MainWindowSession } from './session';

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
type HostWindow = Omit<MainWindow, 'Zotero_Tabs'> & {
  ZoteroPane?: {
    collectionsView?: TreeView;
    itemsView?: TreeView;
    getSelectedItems?(): Zotero.Item[];
    selectItem?(id: number): void;
    viewAttachment?(id: number): void;
    openNote?(id: number): Promise<void> | void;
    loadURI?(uri: string): void;
  };
  Zotero_Tabs?: {
    selectedID?: string;
    _selectedID?: string;
    _tabs?: Tab[];
    tabs?: Tab[];
    close?(id?: string): void;
    selectPrev?(): void;
    selectNext?(): void;
    select?(id: string): void;
    selectTab?(id: string): void;
    showTab?(id: string): void;
  };
};
type Tab = { id?: string; tabID?: string; dataset?: DOMStringMap };

function host(window: MainWindow): HostWindow {
  return window as HostWindow;
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
    session.status.style.background = text.startsWith('✓')
      ? 'rgba(50,150,50,.9)'
      : text.startsWith('→') || text.startsWith('▶')
        ? 'rgba(60,100,180,.9)'
        : 'rgba(180,40,40,.9)';
    const timer = session.window.setTimeout(() => {
      session.status.style.display = 'none';
    }, milliseconds);
    session.cleanup.add(() => session.window.clearTimeout(timer));
  }
  panel(window: MainWindow, session: MainWindowSession): MainPanel {
    const current = window.document.activeElement;
    const h = host(window);
    const collections = h.ZoteroPane?.collectionsView;
    const items = h.ZoteroPane?.itemsView;
    const collectionTargets = [
      collections?.tree,
      collections?.domEl,
      window.document.getElementById('collection-tree'),
      window.document.getElementById('zotero-collections-tree'),
      window.document.querySelector('#zotero-collections-tree .virtualized-table'),
    ];
    const itemTargets = [
      items?.tree,
      items?.domEl,
      window.document.getElementById('item-tree-main-default'),
      window.document.getElementById('zotero-items-tree'),
      window.document.querySelector('#zotero-items-tree .virtualized-table'),
    ];
    if (
      current &&
      (collectionTargets.some(
        (target) => containsTarget(target, current) || containsTarget(current, target),
      ) ||
        current.id.includes('collection'))
    ) {
      session.activePanel = 'collections';
    } else if (
      current &&
      (itemTargets.some(
        (target) => containsTarget(target, current) || containsTarget(current, target),
      ) ||
        current.id.includes('item-tree'))
    ) {
      session.activePanel = 'items';
    } else if (collections?.selection?.count) {
      session.activePanel = 'collections';
    }
    return session.activePanel;
  }
  focusPanel(window: MainWindow, session: MainWindowSession, panel: MainPanel): void {
    const view =
      panel === 'collections'
        ? host(window).ZoteroPane?.collectionsView
        : host(window).ZoteroPane?.itemsView;
    const fallback = window.document.querySelector(
      panel === 'collections'
        ? '#collection-tree,#zotero-collections-tree .virtualized-table,#zotero-collections-tree'
        : '#item-tree-main-default,#zotero-items-tree .virtualized-table,#zotero-items-tree',
    );
    const focusTarget = (view?.tree ?? view?.domEl ?? fallback) as HTMLElement | null;
    focusTarget?.focus();
    view?.focus?.();
    session.activePanel = panel;
    this.ensureSelection(view);
  }
  navigate(
    window: MainWindow,
    session: MainWindowSession,
    direction: 1 | -1 | 'first' | 'last',
    count: number,
  ): void {
    const view =
      this.panel(window, session) === 'collections'
        ? host(window).ZoteroPane?.collectionsView
        : host(window).ZoteroPane?.itemsView;
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
  async openPDF(window: MainWindow, session: MainWindowSession): Promise<void> {
    try {
      const pane = host(window).ZoteroPane;
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
    const tabs = host(window).Zotero_Tabs;
    tabs?.close?.(tabs.selectedID);
  }
  cycleTab(window: MainWindow, direction: 1 | -1): void {
    const tabs = host(window).Zotero_Tabs;
    if (!tabs) return;
    if (direction < 0 && tabs.selectPrev) tabs.selectPrev();
    else if (direction > 0 && tabs.selectNext) tabs.selectNext();
    else {
      const list = tabs._tabs ?? tabs.tabs ?? [];
      const ids = list
        .map((tab) => tab.id ?? tab.tabID ?? tab.dataset?.id)
        .filter((id): id is string => !!id);
      const index = ids.indexOf(tabs.selectedID ?? tabs._selectedID ?? '');
      const next = ids[(index + direction + ids.length) % ids.length];
      if (next) (tabs.select ?? tabs.selectTab ?? tabs.showTab)?.(next);
    }
    this.afterTabSwitch(window);
  }
  focusSearch(window: MainWindow): void {
    const input = window.document.querySelector<HTMLInputElement>(
      '#zotero-tb-search-input,#zotero-tb-search input,input[type="search"]',
    );
    input?.focus();
    input?.select();
  }
  yankCitekey(window: MainWindow, session: MainWindowSession): void {
    try {
      const item = host(window).ZoteroPane?.getSelectedItems?.()[0];
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
  private collections(window: MainWindow, session: MainWindowSession): TreeView | undefined {
    this.focusPanel(window, session, 'collections');
    return host(window).ZoteroPane?.collectionsView;
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
