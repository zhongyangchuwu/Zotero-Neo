import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import { t } from '../i18n';
import type { FocusDirection } from '../input/actions';
import type { KeyGuideLanguage } from '../input/key-guide-config';
import { openItem } from '../operations/open-item';
import { trashItems } from '../operations/trash-items';
import { THEME_VARS } from '../ui/theme';
import type { MainPanel, MainWindowSession } from './session';
import {
  closeSelectedMainTab,
  cycleMainTab,
  focusMainPanel,
  focusMainDirection,
  mainFocusedPanel,
  mainTreeFocused,
  mainTreeCursorState,
  mainScopeCursorNode,
  toggleMainScopeRow,
  setMainScopeExpansionAll,
  selectMainScopeRow,
  mainItemOpening,
  mainScopeCursorDetached,
  mainScopeSelectedRows,
  moveMainScopeCursor,
  moveMainItemCursor,
  selectMainItemCursorAnchor,
  selectMainTab,
  selectedMainTabID,
} from '../toolkit/main';
import {
  mainCursorItem,
  resolveMainEffectiveTargets,
  type MainCurrentTarget,
  type MainResolvedTargets,
  type MainSelectionSource,
} from './action-targets';

const TRASH_TARGET_LABEL_KEYS: Readonly<Record<MainResolvedTargets['source'], string>> = {
  selection: 'target.trashSelection',
  visual: 'target.trashVisual',
  'native-selection': 'target.trashNativeSelection',
  cursor: 'target.trashCursor',
};

function trashTargetSummary(targets: MainResolvedTargets, language: KeyGuideLanguage): string {
  const count = targets.items.length;
  const countLabel =
    language === 'zh-CN' ? `${count} 项` : `${count} item${count === 1 ? '' : 's'}`;
  return `${t(TRASH_TARGET_LABEL_KEYS[targets.source], language)} · ${countLabel}`;
}

export class MainNavigation {
  readonly #logger: Logger;
  readonly #rescan: (window: MainWindow) => void;
  readonly #focusEpochs = new WeakMap<MainWindowSession, number>();
  constructor(logger: Logger, rescan: (window: MainWindow) => void) {
    this.#logger = logger;
    this.#rescan = rescan;
  }
  status(session: MainWindowSession, text: string, milliseconds = 2000): void {
    if (session.cleanup.disposed) return;
    const previousTimer = session.statusTimer;
    session.statusTimer = undefined;
    session.window.clearTimeout(previousTimer);
    session.status.textContent = text;
    session.status.style.display = 'block';
    const success = text.startsWith('✓');
    const info = text.startsWith('→') || text.startsWith('▶');
    session.status.style.color = success
      ? THEME_VARS.statusSuccessText
      : info
        ? THEME_VARS.statusInfoText
        : THEME_VARS.statusErrorText;
    session.status.style.background = success
      ? THEME_VARS.statusSuccess
      : info
        ? THEME_VARS.statusInfo
        : THEME_VARS.statusError;
    const timer = session.window.setTimeout(() => {
      if (session.cleanup.disposed || session.statusTimer !== timer) return;
      session.statusTimer = undefined;
      session.status.style.display = 'none';
    }, milliseconds);
    session.statusTimer = timer;
  }
  panel(window: MainWindow, session: MainWindowSession): MainPanel {
    const panel = mainFocusedPanel(window, session.activePanel);
    if (panel !== session.activePanel) this.#focusEpochs.set(session, this.focusEpoch(session) + 1);
    session.activePanel = panel;
    return session.activePanel;
  }
  focusPanel(window: MainWindow, session: MainWindowSession, panel: MainPanel): boolean {
    if (!focusMainPanel(window, panel)) return false;
    this.#focusEpochs.set(session, this.focusEpoch(session) + 1);
    session.activePanel = panel;
    return true;
  }

  /** Identifies a continuous panel visit, including explicit refocusing of the tree. */
  focusEpoch(session: MainWindowSession): number {
    return this.#focusEpochs.get(session) ?? 0;
  }

  /** Native mouse/input focus changes also delimit a continuous tree visit. */
  observeFocus(window: MainWindow, session: MainWindowSession): void {
    const panel = mainTreeFocused(window, 'collections')
      ? 'collections'
      : mainTreeFocused(window, 'items')
        ? 'items'
        : undefined;
    if (!panel || panel !== session.activePanel)
      this.#focusEpochs.set(session, this.focusEpoch(session) + 1);
    if (panel) session.activePanel = panel;
  }

  focusDirection(
    window: MainWindow,
    session: MainWindowSession,
    direction: FocusDirection,
  ): boolean {
    return focusMainDirection(window, direction, (panel) =>
      this.focusPanel(window, session, panel),
    );
  }
  navigate(
    window: MainWindow,
    session: MainWindowSession,
    direction: 1 | -1 | 'first' | 'last',
    count: number,
    shouldDebounce = false,
  ): boolean {
    const panel = this.panel(window, session);
    const cursor = mainTreeCursorState(window, panel);
    if (!cursor) return false;
    const current = cursor.focused;
    const last = Math.max(0, cursor.rowCount - 1);
    const next =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? count > 0
            ? Math.min(count - 1, last)
            : last
          : Math.max(0, Math.min(last, current + direction * Math.max(1, count)));

    if (panel === 'items') {
      if (!moveMainItemCursor(window, next, shouldDebounce)) {
        this.#logger.debug('item Cursor host-anchor movement is unavailable');
        return false;
      }
      return true;
    }

    const preserveScopeSet =
      mainScopeSelectedRows(window).length > 1 || mainScopeCursorDetached(window);
    if (preserveScopeSet) {
      if (!moveMainScopeCursor(window, next, shouldDebounce)) {
        this.#logger.debug('focus-only scope cursor movement is unavailable');
        return false;
      }
      return true;
    }
    return selectMainScopeRow(window, next, shouldDebounce);
  }

  /** Restores explicit Neo Trash identities and returns the number successfully saved. */
  async restoreTrashedItems(ids: readonly number[]): Promise<number> {
    const valid = new Set(ids);
    let restored = 0;
    for (const id of valid) {
      if (!Number.isInteger(id) || id <= 0) continue;
      const item = Zotero.Items.get(id);
      if (!item || !item.deleted) continue;
      item.deleted = false;
      try {
        await item.saveTx();
      } catch (error) {
        item.deleted = true;
        throw error;
      }
      restored += 1;
    }
    return restored;
  }
  async trashSelectedItems(
    window: MainWindow,
    session: MainWindowSession,
    selection: MainSelectionSource | null,
    currentTarget?: MainCurrentTarget | null,
    language: KeyGuideLanguage = 'en',
  ): Promise<boolean> {
    if (!this.itemPaneContainsFocus(window)) {
      this.status(session, '✗ Focus the items list first');
      return false;
    }
    const targets = resolveMainEffectiveTargets(window, selection, currentTarget);
    if (!targets.total || !targets.items.length) {
      this.status(session, '✗ No item target');
      return false;
    }
    if (targets.missing > 0) {
      this.status(session, '✗ Selection contains unavailable items; refresh before trash');
      return false;
    }
    if (targets.source === 'selection' && targets.hidden > 0) {
      this.status(
        session,
        `✗ ${t('status.trashHidden', language)
          .replace('{hidden}', String(targets.hidden))
          .replace('{total}', String(targets.total))}`,
      );
      return false;
    }

    const summary = trashTargetSummary(targets, language);
    try {
      const prompt = t('confirm.trashItems', language).replace('{target}', summary);
      if (!window.confirm(prompt)) {
        this.status(
          session,
          `→ ${t('status.destructiveCancelled', language).replace('{target}', summary)}`,
        );
        return false;
      }
      const ids = await trashItems(targets.items);
      if (!ids.length) {
        this.status(session, '✗ No valid item target');
        return false;
      }
      session.trashHistory.record(ids);
      if (targets.source === 'selection') {
        for (const ref of targets.refs) selection?.remove(ref);
      }
      this.status(session, `✓ ${t('status.trashComplete', language).replace('{target}', summary)}`);
      return true;
    } catch (error) {
      this.#logger.debug(`trash target items failed: ${String(error)}`);
      this.status(session, `✗ ${t('status.trashFailed', language).replace('{target}', summary)}`);
      return false;
    }
  }

  async restoreLastTrashedItems(session: MainWindowSession): Promise<void> {
    try {
      const itemIDs = session.trashHistory.values();
      const count = await this.restoreTrashedItems(itemIDs);
      if (!count) {
        this.status(session, '✗ Nothing to restore');
        return;
      }
      session.trashHistory.clear();
      this.status(session, `✓ Restored ${count} item${count === 1 ? '' : 's'}`);
    } catch (error) {
      this.#logger.debug(`restore trashed items failed: ${String(error)}`);
      this.status(session, '✗ Unable to restore items');
    }
  }
  async openPDF(
    window: MainWindow,
    session: MainWindowSession,
    target: Zotero.Item | null,
    isCurrent?: () => boolean,
  ): Promise<boolean> {
    if (isCurrent && !isCurrent()) return false;
    if (!target) {
      this.status(session, '✗ No item under cursor');
      return false;
    }
    try {
      const unavailable = await openItem(target, mainItemOpening(window), isCurrent);
      if (isCurrent && !isCurrent()) return false;
      if (unavailable) {
        this.status(session, `✗ ${unavailable}`);
        return false;
      }
      return true;
    } catch (error) {
      this.#logger.debug(`mainOpenPDF error: ${String(error)}`);
      if (!isCurrent || isCurrent()) this.status(session, `✗ ${String(error).slice(0, 40)}`);
      return false;
    }
  }
  closePDF(window: MainWindow): void {
    closeSelectedMainTab(window);
  }
  cycleTab(window: MainWindow, direction: 1 | -1): boolean {
    const selectedBefore = selectedMainTabID(window);
    cycleMainTab(window, direction);
    return this.finishTabSwitch(window, selectedBefore, selectedMainTabID(window));
  }

  selectTab(window: MainWindow, id: string): boolean {
    const selectedBefore = selectedMainTabID(window);
    if (!selectMainTab(window, id)) return false;
    const selectedAfter = selectedMainTabID(window);
    this.finishTabSwitch(window, selectedBefore, selectedAfter);
    return selectedAfter === id;
  }

  private finishTabSwitch(
    window: MainWindow,
    selectedBefore?: string,
    selectedAfter?: string,
  ): boolean {
    if (!selectedAfter) return false;
    if (selectedAfter !== selectedBefore) this.afterTabSwitch(window);
    return selectedAfter !== selectedBefore;
  }
  private ensureTreeFocus(window: MainWindow, session: MainWindowSession): void {
    if (mainTreeFocused(window, 'collections')) this.panel(window, session);
    else this.focusPanel(window, session, 'collections');
  }

  async toggleTree(window: MainWindow, session: MainWindowSession): Promise<void> {
    this.ensureTreeFocus(window, session);
    const node = mainScopeCursorNode(window);
    if (!node) return;
    if (!node.container || node.empty) {
      this.status(session, '→ no child collections', 1000);
      return;
    }
    await toggleMainScopeRow(window, node.row);
    this.ensureTreeFocus(window, session);
    this.status(session, node.open ? '→ collapsed' : '→ expanded', 900);
  }
  async openTree(window: MainWindow, session: MainWindowSession): Promise<void> {
    this.ensureTreeFocus(window, session);
    const node = mainScopeCursorNode(window);
    if (!node || node.open) return;
    await toggleMainScopeRow(window, node.row);
    this.status(session, '→ expanded', 900);
  }
  async closeTree(window: MainWindow, session: MainWindowSession): Promise<void> {
    this.ensureTreeFocus(window, session);
    const node = mainScopeCursorNode(window);
    if (!node || !node.open) return;
    await toggleMainScopeRow(window, node.row);
    this.status(session, '→ collapsed', 900);
  }
  expandTree(window: MainWindow, session: MainWindowSession): void {
    this.ensureTreeFocus(window, session);
    const node = mainScopeCursorNode(window);
    if (!node) return;
    if (node.container && !node.open && !node.empty) {
      void toggleMainScopeRow(window, node.row);
      this.status(session, '→ expanded');
    } else this.focusPanel(window, session, 'items');
  }
  collapseTree(window: MainWindow, session: MainWindowSession): void {
    if (this.itemPaneContainsFocus(window)) {
      this.ensureTreeFocus(window, session);
      return;
    }
    this.ensureTreeFocus(window, session);
    const node = mainScopeCursorNode(window);
    if (!node) return;
    if (node.container && node.open) {
      void toggleMainScopeRow(window, node.row);
      this.status(session, '→ collapsed');
    } else this.parentTree(window, session);
  }
  parentTree(window: MainWindow, session: MainWindowSession): void {
    this.ensureTreeFocus(window, session);
    const parent = mainScopeCursorNode(window)?.parent;
    if (typeof parent === 'number' && parent >= 0) {
      selectMainScopeRow(window, parent, false, true);
      this.status(session, '→ parent', 900);
    }
  }
  expandAll(window: MainWindow, session: MainWindowSession): void {
    this.ensureTreeFocus(window, session);
    const changed = setMainScopeExpansionAll(window, true);
    if (changed === undefined) return;
    this.status(session, changed ? '→ expanded all' : '→ already expanded', 900);
  }
  collapseAll(window: MainWindow, session: MainWindowSession): void {
    this.ensureTreeFocus(window, session);
    const changed = setMainScopeExpansionAll(window, false);
    if (changed === undefined) return;
    this.status(session, changed ? '→ collapsed all' : '→ already collapsed', 900);
  }
  afterTabSwitch(window: MainWindow): void {
    for (const delay of [0, 60, 180, 420, 900])
      window.setTimeout(() => this.#rescan(window), delay);
  }
  private itemPaneContainsFocus(window: MainWindow): boolean {
    return mainTreeFocused(window, 'items');
  }
}
