import { showItemInLibrary, type ShowInLibraryHost } from '../operations/show-in-library';
import type { MainWindow, ReaderControllerApi, ReaderJumpLocation } from '../core/contracts';
import type { Logger } from '../core/logging';
import type { MainNavigation } from './navigation';
import type { MainPanel, MainWindowSession } from './session';
import type { ItemRef } from './selection-store';
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
import type { MainViewActions } from './view-actions';

export interface MainTabJumpLocation {
  readonly kind: 'tab';
  readonly tabID: string;
}

export interface MainLibraryJumpLocation {
  readonly kind: 'library';
  readonly tabID: string;
  readonly scopeIDs: readonly string[];
  readonly quickSearchText: string;
  readonly tags: readonly string[];
  readonly advancedSearch: boolean;
  readonly cursor?: ItemRef;
  readonly panel: MainPanel;
}

export type MainJumpLocation = MainTabJumpLocation | MainLibraryJumpLocation | ReaderJumpLocation;

const MAX_JUMP_LOCATIONS = 100;

/** Session-owned navigation history. Selection is deliberately not part of a location. */
export class MainJumpHistoryState {
  readonly locations: MainJumpLocation[] = [];
  index = -1;
  revision = 0;

  invalidate(): number {
    this.revision += 1;
    return this.revision;
  }

  append(source: MainJumpLocation, destination: MainJumpLocation, revision: number): boolean {
    if (this.revision !== revision || sameLocation(source, destination)) return false;
    const current = this.locations[this.index];
    // Loading a Reader refines its tab location; it is not another jump to that same tab.
    if (
      current?.kind === 'reader' &&
      source.kind === 'reader' &&
      current.tabID === source.tabID &&
      current.libraryID === source.libraryID &&
      current.itemID === source.itemID &&
      !current.position &&
      source.position
    )
      this.locations[this.index] = source;

    if (this.index >= 0 && sameLocation(this.locations[this.index]!, source)) {
      this.locations.splice(this.index + 1);
    } else {
      this.locations.splice(this.index + 1);
      this.locations.push(source);
      this.index = this.locations.length - 1;
    }

    this.locations.splice(this.index + 1);
    this.locations.push(destination);
    this.index = this.locations.length - 1;
    if (this.locations.length > MAX_JUMP_LOCATIONS) {
      const removed = this.locations.length - MAX_JUMP_LOCATIONS;
      this.locations.splice(0, removed);
      this.index -= removed;
    }
    return true;
  }

  move(index: number, revision: number): boolean {
    if (this.revision !== revision || index < 0 || index >= this.locations.length) return false;
    this.index = index;
    return true;
  }

  /** Ordinary motion is not a jump, but Forward must return to the actual departure point. */
  refresh(location: MainJumpLocation | null): void {
    const current = this.locations[this.index];
    if (!location || !current || current.kind !== location.kind || current.tabID !== location.tabID)
      return;
    if (
      current.kind === 'reader' &&
      location.kind === 'reader' &&
      (current.libraryID !== location.libraryID || current.itemID !== location.itemID)
    )
      return;
    this.locations[this.index] = location;
  }

  remapReaderTab(location: ReaderJumpLocation, tabID: string): void {
    if (location.tabID === tabID) return;
    for (let index = 0; index < this.locations.length; index += 1) {
      const entry = this.locations[index]!;
      if (
        entry.kind === 'reader' &&
        entry.tabID === location.tabID &&
        entry.libraryID === location.libraryID &&
        entry.itemID === location.itemID
      )
        this.locations[index] = { ...entry, tabID };
    }
  }

  dispose(): void {
    this.invalidate();
    this.locations.length = 0;
    this.index = -1;
  }
}

export interface MainJumpRequest {
  readonly result: Promise<boolean>;
  isCurrent(): boolean;
}

export interface LibrarySelectionOptions {
  readonly afterSelection?: () => void | Promise<void>;
}

interface NavigationQueue {
  tail: Promise<void>;
}

interface NavigationAttempt {
  isCurrent(): boolean;
  readonly revision: number;
}

interface ScheduledRequest extends MainJumpRequest {
  readonly revision: number;
}

interface RestoreResult {
  readonly restored: boolean;
  readonly stale: boolean;
  readonly missing: readonly string[];
}

/** Per-window explicit navigation and transactional Back/Forward restoration. */
export class MainJumpHistory {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;
  readonly #viewActions: MainViewActions;
  readonly #queues = new WeakMap<MainWindowSession, NavigationQueue>();
  readonly #reader: Pick<ReaderControllerApi, 'captureJumpLocation' | 'restoreJumpLocation'>;
  readonly #activeRevisions = new WeakMap<MainWindowSession, number>();
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

  capture(
    window: MainWindow,
    session: MainWindowSession,
    destinationPanel?: MainPanel,
  ): MainJumpLocation | null {
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
  ): MainJumpLocation | null {
    try {
      return this.capture(window, session, destinationPanel);
    } catch (error) {
      this.#logger.debug(`jump history snapshot failed: ${String(error)}`);
      return null;
    }
  }

  /** Synchronous semantic jumps execute immediately, including rapidly repeated tab keys. */
  navigateNow(
    window: MainWindow,
    session: MainWindowSession,
    navigate: () => boolean | void,
  ): void {
    const revision = session.jumpHistory.invalidate();
    const source = this.captureSafely(window, session);
    this.#activeRevisions.set(session, revision);
    try {
      if (navigate() === false || !this.#isSessionCurrent(window, session)) return;
      const destination = this.captureSafely(window, session);
      if (source && destination) session.jumpHistory.append(source, destination, revision);
    } finally {
      if (this.#activeRevisions.get(session) === revision) this.#activeRevisions.delete(session);
    }
  }

  /** Reader emits completed discrete host jumps; it never owns a second traversal stack. */
  recordReaderJump(
    window: MainWindow,
    session: MainWindowSession,
    source: ReaderJumpLocation,
    destination: ReaderJumpLocation,
  ): void {
    if (
      this.#activeRevisions.get(session) === session.jumpHistory.revision ||
      !this.#isSessionCurrent(window, session) ||
      source.tabID !== destination.tabID ||
      selectedMainTabID(window) !== destination.tabID ||
      sameLocation(source, destination)
    )
      return;
    session.jumpHistory.append(source, destination, session.jumpHistory.invalidate());
  }

  requestNavigation(
    window: MainWindow,
    session: MainWindowSession,
    navigate: (isCurrent: () => boolean) => boolean | void | Promise<boolean | void>,
    destinationPanel?: MainPanel,
  ): MainJumpRequest {
    return this.scheduleNavigation(window, session, async (request) => {
      const source = this.captureSafely(window, session);
      const succeeded = await navigate(request.isCurrent);
      if (!request.isCurrent() || succeeded === false) return false;

      if (source) {
        const destination = this.captureSafely(window, session, destinationPanel);
        if (destination) session.jumpHistory.append(source, destination, request.revision);
      }
      return true;
    });
  }

  requestLibrarySelection(
    window: MainWindow,
    session: MainWindowSession,
    itemID: number,
    host: ShowInLibraryHost | undefined,
    options: LibrarySelectionOptions = {},
  ): MainJumpRequest {
    return this.requestNavigation(
      window,
      session,
      async (isCurrent) => {
        await showItemInLibrary(itemID, host);
        if (!isCurrent()) return false;
        await options.afterSelection?.();
        return isCurrent();
      },
      'items',
    );
  }

  back(window: MainWindow, session: MainWindowSession, count = 1): Promise<boolean> {
    return this.restore(window, session, -1, count);
  }

  forward(window: MainWindow, session: MainWindowSession, count = 1): Promise<boolean> {
    return this.restore(window, session, 1, count);
  }

  private scheduleNavigation(
    window: MainWindow,
    session: MainWindowSession,
    run: (request: NavigationAttempt) => Promise<boolean>,
  ): ScheduledRequest {
    return this.enqueue(window, session, session.jumpHistory.invalidate(), run);
  }

  private scheduleTraversal(
    window: MainWindow,
    session: MainWindowSession,
    run: (request: NavigationAttempt) => Promise<boolean>,
  ): ScheduledRequest {
    return this.enqueue(window, session, session.jumpHistory.revision, run);
  }

  private enqueue(
    window: MainWindow,
    session: MainWindowSession,
    revision: number,
    run: (request: NavigationAttempt) => Promise<boolean>,
  ): ScheduledRequest {
    let queue = this.#queues.get(session);
    if (!queue) {
      queue = { tail: Promise.resolve() };
      this.#queues.set(session, queue);
    }
    const isCurrent = (): boolean =>
      session.jumpHistory.revision === revision && this.#isSessionCurrent(window, session);
    const result = queue.tail.then(async () => {
      if (!isCurrent()) return false;
      this.#activeRevisions.set(session, revision);
      try {
        return await run({ isCurrent, revision });
      } finally {
        if (this.#activeRevisions.get(session) === revision) this.#activeRevisions.delete(session);
      }
    });
    queue.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return { result, isCurrent, revision };
  }

  private restore(
    window: MainWindow,
    session: MainWindowSession,
    direction: -1 | 1,
    count: number,
  ): Promise<boolean> {
    const request = this.scheduleTraversal(window, session, async (scheduled) => {
      session.jumpHistory.refresh(this.captureSafely(window, session));
      const targetIndex = Math.max(
        0,
        Math.min(
          session.jumpHistory.locations.length - 1,
          session.jumpHistory.index + direction * Math.max(1, Math.trunc(count)),
        ),
      );
      const target = session.jumpHistory.locations[targetIndex];
      if (!target || targetIndex === session.jumpHistory.index) {
        if (scheduled.isCurrent())
          this.#navigation.status(
            session,
            direction < 0 ? '✗ No earlier location' : '✗ No later location',
          );
        return false;
      }

      let result: RestoreResult;
      try {
        result = await this.restoreLocation(window, session, target, scheduled.isCurrent);
      } catch (error) {
        this.#logger.debug(`jump history restore failed: ${String(error)}`);
        result = { restored: false, stale: !scheduled.isCurrent(), missing: ['host state'] };
      }
      if (result.stale || !scheduled.isCurrent()) return false;
      if (!result.restored) {
        this.#navigation.status(
          session,
          `→ ${direction < 0 ? 'Back' : 'Forward'} partial · missing ${result.missing.join(', ')}`,
          3200,
        );
        return false;
      }
      if (!session.jumpHistory.move(targetIndex, scheduled.revision)) return false;
      this.#navigation.status(session, direction < 0 ? '✓ Back' : '✓ Forward');
      return true;
    });
    return request.result;
  }

  private async restoreLocation(
    window: MainWindow,
    session: MainWindowSession,
    location: MainJumpLocation,
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

function sameLocation(left: MainJumpLocation, right: MainJumpLocation): boolean {
  if (left.kind !== right.kind || left.tabID !== right.tabID) return false;
  if (left.kind === 'tab' || right.kind === 'tab') return left.kind === right.kind;
  if (left.kind === 'reader' || right.kind === 'reader') {
    if (left.kind !== 'reader' || right.kind !== 'reader') return false;
    return (
      left.libraryID === right.libraryID &&
      left.itemID === right.itemID &&
      left.position?.primary === right.position?.primary &&
      left.position?.pageIndex === right.position?.pageIndex &&
      left.position?.top === right.position?.top &&
      left.position?.left === right.position?.left
    );
  }
  return (
    sameStrings(left.scopeIDs, right.scopeIDs) &&
    left.quickSearchText === right.quickSearchText &&
    sameStrings(left.tags, right.tags) &&
    left.advancedSearch === right.advancedSearch &&
    left.cursor?.libraryID === right.cursor?.libraryID &&
    left.cursor?.itemID === right.cursor?.itemID &&
    left.panel === right.panel
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
