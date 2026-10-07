import { showItemInLibrary, type ShowInLibraryHost } from '../operations/show-in-library';
import type { MainWindow, ReaderControllerApi, ReaderJumpLocation } from '../core/contracts';
import type { Logger } from '../core/logging';
import { NavigationCoordinator } from '../navigation/coordinator';
import type {
  NavigationExecution,
  NavigationIntent,
  NavigationLocation,
  NavigationOperation,
  NavigationOutcome,
  NavigationPort,
} from '../navigation/types';
import type { MainPanel, MainWindowSession } from './session';
import {
  currentMainItemCursorRef,
  focusMainItemsImmediately,
  mainHost,
  mainReaderForTab,
  mainScopeSelectedIDs,
  restoreMainItemCursorAnchor,
  restoreMainScopeIDs,
  selectMainTab,
  selectedMainTabID,
  selectedMainTabInfo,
} from './host';
import type { MainNavigation } from './navigation';
import type { MainViewActions } from './view-actions';

export interface LibrarySelectionOptions {
  readonly afterSelection?: () => void | Promise<void>;
}

interface RestoreResult {
  readonly restored: boolean;
  readonly stale: boolean;
  readonly missing: readonly string[];
}

/** Main's host adapter for the shared per-session navigation coordinator. */
export class MainNavigationExecutor {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;
  readonly #viewActions: MainViewActions;
  readonly #reader: Pick<ReaderControllerApi, 'captureJumpLocation' | 'restoreJumpLocation'>;
  readonly #isSessionCurrent: (window: MainWindow, session: MainWindowSession) => boolean;

  constructor(
    logger: Logger,
    navigation: MainNavigation,
    viewActions: MainViewActions,
    reader: Pick<ReaderControllerApi, 'captureJumpLocation' | 'restoreJumpLocation'>,
    isSessionCurrent: (window: MainWindow, session: MainWindowSession) => boolean = () => true,
  ) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#viewActions = viewActions;
    this.#reader = reader;
    this.#isSessionCurrent = isSessionCurrent;
  }

  execute(
    window: MainWindow,
    session: MainWindowSession,
    intent: NavigationIntent,
    operation: NavigationOperation,
  ): NavigationExecution {
    return this.coordinatorFor(window, session).execute(intent, operation);
  }

  port(window: MainWindow, session: MainWindowSession): NavigationPort {
    return this.coordinatorFor(window, session).port();
  }

  private coordinatorFor(window: MainWindow, session: MainWindowSession): NavigationCoordinator {
    if (session.navigationCoordinator) return session.navigationCoordinator;
    const coordinator = new NavigationCoordinator(session.jumpHistory, {
      capture: (operation, phase) =>
        this.captureSafely(
          window,
          session,
          phase === 'destination' ? operation.destinationPanel : undefined,
        ),
      isCurrent: () => this.#isSessionCurrent(window, session),
      onError: (error) => this.#logger.debug(`navigation execution failed: ${String(error)}`),
      onTraversalCommitted: (intent) => {
        if (intent.cause.kind !== 'action') return;
        this.#navigation.status(
          session,
          intent.cause.action === 'navigateBack' ? '✓ Back' : '✓ Forward',
        );
      },
    });
    session.navigationCoordinator = coordinator;
    return coordinator;
  }

  capture(
    window: MainWindow,
    session: MainWindowSession,
    destinationPanel?: MainPanel,
  ): NavigationLocation | null {
    const tabID = selectedMainTabID(window);
    if (!tabID) return null;

    const tabInfo = selectedMainTabInfo(window);
    const libraryTab = tabID === 'zotero-pane' || tabInfo?.type?.startsWith('library') === true;
    if (mainReaderForTab(tabID) || tabInfo?.type?.startsWith('reader')) {
      return (
        this.#reader.captureJumpLocation(tabID, tabInfo?.data?.itemID) ?? { kind: 'tab', tabID }
      );
    }
    if (!libraryTab) return { kind: 'tab', tabID };

    const pane = mainHost(window).ZoteroPane;
    if (!pane?.collectionsView?.selection || !pane.itemsView?.selection) return null;
    const view = this.#viewActions.state(window);
    return {
      kind: 'library',
      tabID,
      scopeIDs: mainScopeSelectedIDs(window),
      quickSearchText: view.quickSearchText,
      tags: [...view.tags],
      advancedSearch: view.advancedSearch,
      cursor: currentMainItemCursorRef(window),
      panel:
        destinationPanel ??
        (session.picker?.open || session.selectionPanel?.open
          ? session.activePanel
          : this.#navigation.panel(window, session)),
    };
  }

  private captureSafely(
    window: MainWindow,
    session: MainWindowSession,
    destinationPanel?: MainPanel,
  ): NavigationLocation | null {
    try {
      return this.capture(window, session, destinationPanel);
    } catch (error) {
      this.#logger.debug(`jump history snapshot failed: ${String(error)}`);
      return null;
    }
  }

  librarySelection(
    itemID: number,
    host: ShowInLibraryHost | undefined,
    options: LibrarySelectionOptions = {},
  ): NavigationOperation {
    return {
      dispatch: 'serial-navigation',
      destinationPanel: 'items',
      start: (attempt) => ({
        kind: 'deferred',
        settled: (async (): Promise<NavigationOutcome> => {
          await showItemInLibrary(itemID, host);
          if (!attempt.isCurrent()) return { kind: 'stale' };
          await options.afterSelection?.();
          if (!attempt.isCurrent()) return { kind: 'stale' };
          return { kind: 'completed', evidence: 'settled-change' };
        })(),
      }),
    };
  }

  traversal(
    window: MainWindow,
    session: MainWindowSession,
    direction: -1 | 1,
    count = 1,
  ): NavigationOperation {
    return {
      dispatch: 'serial-traversal',
      start: (attempt) => {
        const history = session.jumpHistory;
        history.refresh(this.captureSafely(window, session));
        const targetIndex = Math.max(
          0,
          Math.min(
            history.locations.length - 1,
            history.index + direction * Math.max(1, Math.trunc(count)),
          ),
        );
        const target = history.locations[targetIndex];
        if (!target || targetIndex === history.index) {
          if (attempt.isCurrent())
            this.#navigation.status(
              session,
              direction < 0 ? '✗ No earlier location' : '✗ No later location',
            );
          return { kind: 'immediate', outcome: { kind: 'unavailable' } };
        }

        const settled = this.restoreLocation(window, session, target, attempt.isCurrent).then(
          (result): NavigationOutcome => {
            if (result.stale || !attempt.isCurrent()) return { kind: 'stale' };
            if (!result.restored) {
              this.#navigation.status(
                session,
                `→ ${direction < 0 ? 'Back' : 'Forward'} partial · missing ${result.missing.join(', ')}`,
                3200,
              );
              return { kind: 'unavailable' };
            }
            return { kind: 'completed', evidence: 'managed-final', targetIndex };
          },
          (error: unknown): NavigationOutcome => {
            this.#logger.debug(`jump history restore failed: ${String(error)}`);
            if (!attempt.isCurrent()) return { kind: 'stale' };
            this.#navigation.status(
              session,
              `→ ${direction < 0 ? 'Back' : 'Forward'} partial · missing host state`,
              3200,
            );
            return { kind: 'unavailable' };
          },
        );
        return { kind: 'deferred', settled };
      },
    };
  }

  private async restoreLocation(
    window: MainWindow,
    session: MainWindowSession,
    location: NavigationLocation,
    isCurrent: () => boolean,
  ): Promise<RestoreResult> {
    if (location.kind === 'reader') {
      const tabID = await this.#reader.restoreJumpLocation(window, location, isCurrent);
      if (!isCurrent()) return { restored: false, stale: true, missing: [] };
      if (!tabID) return { restored: false, stale: false, missing: ['Reader location'] };
      if (selectedMainTabID(window) !== tabID) return { restored: false, stale: true, missing: [] };
      session.jumpHistory.remapReaderTab(location, tabID);
      this.#navigation.afterTabSwitch(window);
      return { restored: true, stale: false, missing: [] };
    }
    if (!selectMainTab(window, location.tabID))
      return { restored: false, stale: false, missing: ['tab'] };
    const isCurrentLocation = (): boolean =>
      isCurrent() && selectedMainTabID(window) === location.tabID;
    if (!isCurrentLocation()) return { restored: false, stale: true, missing: [] };
    this.#navigation.afterTabSwitch(window);

    if (location.kind === 'tab') return { restored: true, stale: false, missing: [] };

    const focusBeforeScope = window.document.activeElement;
    const quickSearch = window.document.getElementById('zotero-tb-search');
    let scopeRestored: boolean;
    try {
      scopeRestored = await restoreMainScopeIDs(window, location.scopeIDs, isCurrentLocation);
    } catch (error) {
      this.#logger.debug(`jump history scope restore failed: ${String(error)}`);
      scopeRestored = false;
    }
    if (!isCurrentLocation()) return { restored: false, stale: true, missing: [] };
    if (!scopeRestored) return { restored: false, stale: false, missing: ['scope'] };

    const focused = window.document.activeElement;
    if (
      quickSearch &&
      focused &&
      focused !== focusBeforeScope &&
      (focused === quickSearch || quickSearch.contains?.(focused))
    ) {
      // The user claimed native Quick Search while scope selection was pending.
      return { restored: false, stale: true, missing: [] };
    }

    let quickSearchRestored: boolean;
    try {
      quickSearchRestored = await this.#viewActions.applyQuickSearch(
        window,
        location.quickSearchText,
      );
    } catch (error) {
      this.#logger.debug(`jump history Quick Search restore failed: ${String(error)}`);
      quickSearchRestored = false;
    }
    if (!isCurrentLocation()) return { restored: false, stale: true, missing: [] };
    if (
      !quickSearchRestored ||
      this.#viewActions.state(window).quickSearchText !== location.quickSearchText
    ) {
      return { restored: false, stale: false, missing: ['Quick Search'] };
    }

    if (!sameStrings(mainScopeSelectedIDs(window), location.scopeIDs))
      return { restored: false, stale: true, missing: [] };

    try {
      await this.#viewActions.applyTagFilter(window, location.tags);
    } catch (error) {
      this.#logger.debug(`jump history tag restore failed: ${String(error)}`);
      if (!isCurrentLocation()) return { restored: false, stale: true, missing: [] };
      return { restored: false, stale: false, missing: ['tags'] };
    }
    if (!isCurrentLocation()) return { restored: false, stale: true, missing: [] };
    if (!sameStrings(this.#viewActions.state(window).tags, location.tags))
      return { restored: false, stale: false, missing: ['tags'] };
    if (!sameStrings(mainScopeSelectedIDs(window), location.scopeIDs))
      return { restored: false, stale: true, missing: [] };

    const view = this.#viewActions.state(window);
    if (location.advancedSearch && !view.advancedSearch)
      return { restored: false, stale: false, missing: ['Advanced Search'] };
    if (!location.advancedSearch && view.advancedSearch) {
      try {
        if (!(await this.#viewActions.closeAdvancedSearch(window)))
          return { restored: false, stale: false, missing: ['Advanced Search'] };
      } catch (error) {
        this.#logger.debug(`jump history Advanced Search restore failed: ${String(error)}`);
        if (!isCurrentLocation()) return { restored: false, stale: true, missing: [] };
        return { restored: false, stale: false, missing: ['Advanced Search'] };
      }
      if (!isCurrentLocation()) return { restored: false, stale: true, missing: [] };
      if (this.#viewActions.state(window).advancedSearch)
        return { restored: false, stale: false, missing: ['Advanced Search'] };
    }

    if (location.cursor) {
      if (!restoreMainItemCursorAnchor(window, location.cursor))
        return { restored: false, stale: false, missing: ['Cursor'] };
      const cursor = currentMainItemCursorRef(window);
      if (
        cursor?.libraryID !== location.cursor.libraryID ||
        cursor?.itemID !== location.cursor.itemID
      )
        return { restored: false, stale: false, missing: ['Cursor'] };
    } else if (currentMainItemCursorRef(window)) {
      return { restored: false, stale: false, missing: ['Cursor'] };
    }

    if (!this.#navigation.focusPanel(window, session, location.panel))
      return { restored: false, stale: false, missing: ['focus'] };
    // Zotero's itemsView.focus() may schedule a later focus; use the rendered tree.
    if (location.panel === 'items') focusMainItemsImmediately(window);
    if (this.#navigation.panel(window, session) !== location.panel)
      return { restored: false, stale: false, missing: ['focus'] };

    return { restored: true, stale: false, missing: [] };
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
