import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import type { MainNavigation } from './navigation';
import type { MainPanel, MainWindowSession } from './session';
import type { ItemRef } from './selection-store';
import {
  currentMainItemCursorRef,
  mainScopeSelectedIDs,
  projectMainSelection,
  restoreMainScopeIDs,
  selectedMainTabID,
  selectMainTab,
} from './host';
import type { MainViewActions } from './view-actions';

export interface MainReturnBookmark {
  readonly scopeIDs: readonly string[];
  readonly quickSearchText: string;
  readonly tags: readonly string[];
  readonly advancedSearch: boolean;
  readonly cursor?: ItemRef;
  readonly panel: MainPanel;
  readonly tabID?: string;
}

/**
 * Single-level return bookmark for explicit Main navigation excursions.
 *
 * Selection is intentionally not copied into the bookmark: it remains
 * session-owned state. ScopeSet is captured only as stable native row IDs.
 */
export class MainReturnContext {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;
  readonly #viewActions: MainViewActions;

  constructor(logger: Logger, navigation: MainNavigation, viewActions: MainViewActions) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#viewActions = viewActions;
  }

  capture(window: MainWindow, session: MainWindowSession): MainReturnBookmark {
    const view = this.#viewActions.state(window);
    const bookmark: MainReturnBookmark = {
      scopeIDs: mainScopeSelectedIDs(window),
      quickSearchText: view.quickSearchText,
      tags: [...view.tags],
      advancedSearch: view.advancedSearch,
      cursor: currentMainItemCursorRef(window),
      panel: this.#navigation.panel(window, session),
      tabID: selectedMainTabID(window),
    };
    session.returnBookmark = bookmark;
    return bookmark;
  }

  async restore(window: MainWindow, session: MainWindowSession): Promise<boolean> {
    const bookmark = session.returnBookmark;
    if (!bookmark) {
      this.#navigation.status(session, '✗ No return context');
      return false;
    }

    const partial: string[] = [];

    try {
      if (bookmark.scopeIDs.length && !(await restoreMainScopeIDs(window, bookmark.scopeIDs))) {
        partial.push('scope');
      }
    } catch (error) {
      this.#logger.debug(`return scope restore failed: ${String(error)}`);
      partial.push('scope');
    }

    try {
      if (!(await this.#viewActions.applyQuickSearch(window, bookmark.quickSearchText))) {
        partial.push('quick search');
      }
    } catch (error) {
      this.#logger.debug(`return Quick Search restore failed: ${String(error)}`);
      partial.push('quick search');
    }

    try {
      await this.#viewActions.applyTagFilter(window, bookmark.tags);
    } catch (error) {
      this.#logger.debug(`return tag restore failed: ${String(error)}`);
      partial.push('tags');
    }

    const restoredView = this.#viewActions.state(window);
    if (bookmark.advancedSearch && !restoredView.advancedSearch) {
      partial.push('advanced search');
    }

    const projected = projectMainSelection(
      window,
      session.selection.values(),
      bookmark.cursor,
    );
    if (bookmark.cursor && !projected && session.selection.size === 0) {
      // Projection can legitimately be zero with a non-empty hidden Selection.
      // Verify Cursor independently in that case via visible projection below.
      partial.push('cursor');
    }

    if (bookmark.tabID) {
      try {
        selectMainTab(window, bookmark.tabID);
      } catch (error) {
        this.#logger.debug(`return tab restore failed: ${String(error)}`);
        partial.push('tab');
      }
    }

    if (!this.#navigation.focusPanel(window, session, bookmark.panel)) partial.push('focus');

    if (partial.length) {
      const unique = [...new Set(partial)];
      this.#navigation.status(session, `→ Return partial · missing ${unique.join(', ')}`, 3200);
      return false;
    }

    this.#navigation.status(session, '✓ Returned to saved Main context');
    return true;
  }
}
