import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import type { MainNavigation } from './navigation';
import type { MainWindowSession } from './session';
import {
  applyMainTagFilter,
  focusMainQuickSearch,
  mainViewFilterState,
  openMainAdvancedSearch,
  type MainViewFilterState,
} from './host';

/**
 * Owns semantic mutations of the Main Zotero View while leaving the actual
 * Quick Search, Advanced Search, and tag-selector UIs with Zotero/their domain
 * owners.
 */
export class MainViewActions {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;

  constructor(logger: Logger, navigation: MainNavigation) {
    this.#logger = logger;
    this.#navigation = navigation;
  }

  state(window: MainWindow): MainViewFilterState {
    return mainViewFilterState(window);
  }

  focusQuickSearch(window: MainWindow, session: MainWindowSession): boolean {
    if (focusMainQuickSearch(window)) return true;
    this.#navigation.status(session, '✗ Quick Search is unavailable in this view');
    return false;
  }

  openAdvancedSearch(window: MainWindow, session: MainWindowSession): void {
    void openMainAdvancedSearch(window)
      .then((opened) => {
        if (!opened) this.#navigation.status(session, '✗ Advanced Search is unavailable');
      })
      .catch((error) => {
        this.#logger.debug(`open Advanced Search failed: ${String(error)}`);
        this.#navigation.status(session, '✗ Unable to open Advanced Search');
      });
  }

  applyTagFilter(window: MainWindow, tags: readonly string[]): Promise<number> {
    return applyMainTagFilter(window, tags);
  }
}
