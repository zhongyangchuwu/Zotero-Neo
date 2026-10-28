import type { MainWindow } from '../../core/contracts';
import type { Logger } from '../../core/logging';
import { t } from '../../i18n';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { openItem } from '../../operations/open-item';
import { trashItems } from '../../operations/trash-items';
import {
  resolveMainEffectiveTargets,
  type MainCurrentTarget,
  type MainResolvedTargets,
  type MainSelectionSource,
} from '../../main/action-targets';
import {
  mainTreeFocused,
  mainTreeCursorState,
  type MainTreePanel as MainPanel,
  mainScopeCursorNode,
  toggleMainScopeRow,
  setMainScopeExpansionAll,
  selectMainScopeRow,
  mainItemOpening,
  mainScopeCursorDetached,
  mainScopeSelectedRows,
  moveMainScopeCursor,
  moveMainItemCursor,
} from '../../toolkit/main';

export interface LibraryNavigationPorts {
  readonly window: MainWindow;
  readonly logger: Logger;
  status(text: string, milliseconds?: number): void;
  panel(): MainPanel;
  focusPanel(panel: MainPanel): boolean;
  isCurrent(): boolean;
}

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

export class LibraryNavigation {
  readonly #ports: LibraryNavigationPorts;
  #lastTrashedIDs: number[] = [];

  constructor(ports: LibraryNavigationPorts) {
    this.#ports = ports;
  }

  navigate(direction: 1 | -1 | 'first' | 'last', count: number, shouldDebounce = false): boolean {
    const { window, logger } = this.#ports;
    if (!this.#ports.isCurrent()) return false;
    const panel = this.#ports.panel();
    if (!this.#ports.isCurrent()) return false;
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
        logger.debug('item Cursor host-anchor movement is unavailable');
        return false;
      }
      return true;
    }
    const preserveScopeSet =
      mainScopeSelectedRows(window).length > 1 || mainScopeCursorDetached(window);
    if (preserveScopeSet) {
      if (!moveMainScopeCursor(window, next, shouldDebounce)) {
        logger.debug('focus-only scope cursor movement is unavailable');
        return false;
      }
      return true;
    }
    return selectMainScopeRow(window, next, shouldDebounce);
  }

  /** Restores explicit Neo Trash identities and returns the number successfully saved. */
  async restoreTrashedItems(ids: readonly number[]): Promise<number> {
    if (!this.#ports.isCurrent()) return 0;
    const valid = new Set(ids);
    let restored = 0;
    for (const id of valid) {
      if (!this.#ports.isCurrent()) break;
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
    selection: MainSelectionSource | null,
    currentTarget?: MainCurrentTarget | null,
    language: KeyGuideLanguage = 'en',
  ): Promise<boolean> {
    const { window, logger } = this.#ports;
    if (!this.#ports.isCurrent()) return false;
    if (!mainTreeFocused(window, 'items')) {
      this.#status('✗ Focus the items list first');
      return false;
    }
    const targets = resolveMainEffectiveTargets(window, selection, currentTarget);
    if (!targets.total || !targets.items.length) {
      this.#status('✗ No item target');
      return false;
    }
    if (targets.missing > 0) {
      this.#status('✗ Selection contains unavailable items; refresh before trash');
      return false;
    }
    if (targets.source === 'selection' && targets.hidden > 0) {
      this.#status(
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
        this.#status(
          `→ ${t('status.destructiveCancelled', language).replace('{target}', summary)}`,
        );
        return false;
      }
      if (!this.#ports.isCurrent()) return false;
      const ids = await trashItems(targets.items);
      if (!ids.length) {
        this.#status('✗ No valid item target');
        return false;
      }
      if (this.#ports.isCurrent()) {
        this.#lastTrashedIDs = [...ids];
        if (targets.source === 'selection') {
          for (const ref of targets.refs) selection?.remove(ref);
        }
        this.#status(`✓ ${t('status.trashComplete', language).replace('{target}', summary)}`);
      }
      return true;
    } catch (error) {
      logger.debug(`trash target items failed: ${String(error)}`);
      this.#status(`✗ ${t('status.trashFailed', language).replace('{target}', summary)}`);
      return false;
    }
  }

  async restoreLastTrashedItems(): Promise<void> {
    if (!this.#ports.isCurrent()) return;
    try {
      const itemIDs = this.#lastTrashedIDs;
      const count = await this.restoreTrashedItems(itemIDs);
      if (!this.#ports.isCurrent()) return;
      if (!count) {
        this.#status('✗ Nothing to restore');
        return;
      }
      if (this.#lastTrashedIDs === itemIDs) this.#lastTrashedIDs = [];
      this.#status(`✓ Restored ${count} item${count === 1 ? '' : 's'}`);
    } catch (error) {
      this.#ports.logger.debug(`restore trashed items failed: ${String(error)}`);
      this.#status('✗ Unable to restore items');
    }
  }

  async openPDF(target: Zotero.Item | null, isCurrent: () => boolean): Promise<boolean> {
    const current = () => this.#ports.isCurrent() && isCurrent();
    if (!current()) return false;
    if (!target) {
      this.#status('✗ No item under cursor');
      return false;
    }
    try {
      const unavailable = await openItem(target, mainItemOpening(this.#ports.window), current);
      if (!current()) return false;
      if (unavailable) {
        this.#status(`✗ ${unavailable}`);
        return false;
      }
      return true;
    } catch (error) {
      this.#ports.logger.debug(`mainOpenPDF error: ${String(error)}`);
      if (current()) this.#status(`✗ ${String(error).slice(0, 40)}`);
      return false;
    }
  }

  #status(text: string, milliseconds?: number): void {
    if (this.#ports.isCurrent()) this.#ports.status(text, milliseconds);
  }

  #ensureTreeFocus(): boolean {
    if (mainTreeFocused(this.#ports.window, 'collections')) this.#ports.panel();
    else this.#ports.focusPanel('collections');
    return this.#ports.isCurrent();
  }

  async toggleTree(): Promise<void> {
    if (!this.#ports.isCurrent()) return;
    const { window } = this.#ports;
    if (!this.#ensureTreeFocus()) return;
    const node = mainScopeCursorNode(window);
    if (!node) return;
    if (!node.container || node.empty) {
      this.#status('→ no child collections', 1000);
      return;
    }
    await toggleMainScopeRow(window, node.row);
    if (!this.#ports.isCurrent()) return;
    if (!this.#ensureTreeFocus()) return;
    this.#status(node.open ? '→ collapsed' : '→ expanded', 900);
  }

  async openTree(): Promise<void> {
    if (!this.#ports.isCurrent()) return;
    const { window } = this.#ports;
    if (!this.#ensureTreeFocus()) return;
    const node = mainScopeCursorNode(window);
    if (!node || node.open) return;
    await toggleMainScopeRow(window, node.row);
    this.#status('→ expanded', 900);
  }

  async closeTree(): Promise<void> {
    if (!this.#ports.isCurrent()) return;
    const { window } = this.#ports;
    if (!this.#ensureTreeFocus()) return;
    const node = mainScopeCursorNode(window);
    if (!node || !node.open) return;
    await toggleMainScopeRow(window, node.row);
    this.#status('→ collapsed', 900);
  }

  expandTree(): void {
    if (!this.#ports.isCurrent()) return;
    const { window } = this.#ports;
    if (!this.#ensureTreeFocus()) return;
    const node = mainScopeCursorNode(window);
    if (!node) return;
    if (node.container && !node.open && !node.empty) {
      void toggleMainScopeRow(window, node.row);
      this.#status('→ expanded');
    } else this.#ports.focusPanel('items');
  }

  collapseTree(): void {
    if (!this.#ports.isCurrent()) return;
    const { window } = this.#ports;
    if (mainTreeFocused(window, 'items')) {
      this.#ensureTreeFocus();
      return;
    }
    if (!this.#ensureTreeFocus()) return;
    const node = mainScopeCursorNode(window);
    if (!node) return;
    if (node.container && node.open) {
      void toggleMainScopeRow(window, node.row);
      this.#status('→ collapsed');
    } else this.parentTree();
  }

  parentTree(): void {
    if (!this.#ports.isCurrent()) return;
    const { window } = this.#ports;
    if (!this.#ensureTreeFocus()) return;
    const parent = mainScopeCursorNode(window)?.parent;
    if (typeof parent === 'number' && parent >= 0) {
      selectMainScopeRow(window, parent, false, true);
      this.#status('→ parent', 900);
    }
  }

  expandAll(): void {
    if (!this.#ports.isCurrent()) return;
    if (!this.#ensureTreeFocus()) return;
    const changed = setMainScopeExpansionAll(this.#ports.window, true);
    if (changed === undefined) return;
    this.#status(changed ? '→ expanded all' : '→ already expanded', 900);
  }

  collapseAll(): void {
    if (!this.#ports.isCurrent()) return;
    if (!this.#ensureTreeFocus()) return;
    const changed = setMainScopeExpansionAll(this.#ports.window, false);
    if (changed === undefined) return;
    this.#status(changed ? '→ collapsed all' : '→ already collapsed', 900);
  }
}
