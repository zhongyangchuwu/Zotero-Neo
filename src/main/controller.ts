import type {
  MainWindowControllerApi,
  MainWindowControllerDependencies,
  MainWindow,
} from '../core/contracts';
import { focusDirectionForAction, type ActionId } from '../input/actions';
import { keyGuideConfig, pickerMouseEnabled } from '../core/preferences';
import { resolveBindings } from '../input/bindings';
import {
  advanceInput,
  backspaceLeaderInput,
  cancelLeaderInput,
  resolveInputTimeout,
} from '../input/engine';
import {
  KEY_GUIDE_CONFIG,
  keyGuideLanguage,
  type KeyGuideLanguage,
} from '../input/key-guide-config';
import { isLeaderPrefix, leaderGuideEntries } from '../input/key-guide';
import { keyString } from '../input/keys';
import { isEditableElement } from '../platform/dom';
import { MainWindowSession } from './session';
import { MainNavigation } from './navigation';
import { FuzzyPicker } from './picker';
import { NoteEditor } from './note-editor';
import { mainReaderForTab, selectedMainTabID } from './host';

type KeyboardEventWithHandled = KeyboardEvent & {
  _zvMainHandled?: boolean;
  _zvPickerHandled?: boolean;
};
const NAVIGATION_REPEAT_INTERVAL_MS = 80;

export class MainWindowController implements MainWindowControllerApi {
  readonly #dependencies: MainWindowControllerDependencies;
  readonly #sessions = new Map<MainWindow, MainWindowSession>();
  readonly #navigation: MainNavigation;
  readonly #picker: FuzzyPicker;
  readonly #noteEditor: NoteEditor;

  constructor(dependencies: MainWindowControllerDependencies) {
    this.#dependencies = dependencies;
    this.#navigation = new MainNavigation(dependencies.logger, (window) => this.rescan(window));
    this.#picker = new FuzzyPicker(dependencies.logger, this.#navigation, () =>
      pickerMouseEnabled(dependencies.preferences),
    );
    this.#noteEditor = new NoteEditor(
      dependencies.logger,
      this.#navigation,
      () => this.bindings(),
      {
        refresh: (window, session) =>
          this.refreshKeyGuide(
            window,
            session,
            session.note.mainBuffer,
            (prefix) => session.note.mainBuffer === prefix,
          ),
        clear: (window, session) => this.clearKeyGuide(window, session),
      },
    );
  }

  addWindow(window: MainWindow): void {
    if (this.#sessions.has(window)) return;
    const session = new MainWindowSession(window, this.#dependencies.preferences);
    this.#sessions.set(window, session);
    this.#dependencies.logger.debug(`main window attached sessions=${this.#sessions.size}`);
    this.#dependencies.logger.diagnostic(`main window attached sessions=${this.#sessions.size}`);
    const scan = (): void => {
      this.rescan(window);
      this.#noteEditor.sync(
        window,
        session,
        this.#dependencies.preferences.get('noteEditor.enabled', true),
      );
    };
    scan();
    const interval = window.setInterval(scan, 1000);
    session.cleanup.add(() => window.clearInterval(interval));
    for (let count = 1; count <= 4; count += 1) {
      const timer = window.setTimeout(scan, count * 250);
      session.cleanup.add(() => window.clearTimeout(timer));
    }
    const keydown: EventListener = (event) =>
      this.onKeyDown(event as KeyboardEventWithHandled, window, session);
    const pickerKeydown: EventListener = (event) => {
      if (session.picker.open)
        this.#picker.onKeyDown(event as KeyboardEventWithHandled, window, session);
    };
    session.cleanup.addEventListener(window.document, 'keydown', keydown, true);
    session.cleanup.addEventListener(window, 'keydown', pickerKeydown, true);
    session.cleanup.add(() => {
      this.#picker.close(session);
      this.#noteEditor.clear(session);
    });
  }

  removeWindow(window: MainWindow): void {
    const session = this.#sessions.get(window);
    if (!session) return;
    this.#sessions.delete(window);
    this.#dependencies.logger.debug(`main window detached sessions=${this.#sessions.size}`);
    this.#dependencies.logger.diagnostic(`main window detached sessions=${this.#sessions.size}`);
    session.dispose();
  }

  shutdown(): void {
    for (const window of [...this.#sessions.keys()]) this.removeWindow(window);
  }

  executeFromReader(action: ActionId, count: number, ownerWindow: MainWindow | null): void {
    if (!ownerWindow) {
      this.#dependencies.logger.debug(`ignored Reader action ${action}: no owner window`);
      return;
    }
    const session = this.#sessions.get(ownerWindow);
    if (!session) {
      this.#dependencies.logger.debug(`ignored Reader action ${action}: owner window detached`);
      return;
    }
    this.execute(action, ownerWindow, session, count);
  }

  private bindings() {
    return resolveBindings(this.#dependencies.preferences.get('bindings', ''));
  }
  private rescan = (window: MainWindow): void => this.#dependencies.reader.rescan(window);

  private onKeyDown(
    event: KeyboardEventWithHandled,
    window: MainWindow,
    session: MainWindowSession,
  ): void {
    if (event._zvMainHandled) return;
    event._zvMainHandled = true;
    if (session.picker.open) {
      this.#picker.onKeyDown(event, window, session);
      return;
    }
    if (
      this.#dependencies.preferences.get('noteEditor.enabled', true) &&
      this.#noteEditor.isStandalone(window)
    ) {
      this.#noteEditor.onKeyDown(event, window, session, (action, count) =>
        this.execute(action, window, session, count),
      );
      return;
    }
    const active = window.document.activeElement;
    if (isEditableElement(active)) {
      this.clearKeyGuide(window, session);
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        (active as HTMLElement).blur();
      }
      return;
    }
    const tabID = selectedMainTabID(window);
    if (active?.localName === 'browser' || (tabID && this.isReaderTab(tabID))) {
      this.#dependencies.reader.forwardKey(event, window);
      return;
    }
    const key = keyString(event);
    if (!key) return;
    const bindings = this.bindings();
    const leaderState = {
      mode: 'main' as const,
      keyBuffer: session.keyBuffer,
      countBuffer: session.countBuffer,
    };
    if (event.key.toLowerCase() === 'escape') {
      const cancelled = cancelLeaderInput(leaderState);
      if (cancelled) {
        event.preventDefault();
        event.stopPropagation();
        session.keyBuffer = cancelled.keyBuffer;
        session.countBuffer = cancelled.countBuffer;
        session.inputRevision += 1;
        window.clearTimeout(session.keyTimer);
        session.keyTimer = undefined;
        this.clearKeyGuide(window, session);
        return;
      }
    }
    if (event.key.toLowerCase() === 'backspace') {
      const backed = backspaceLeaderInput(leaderState);
      if (backed) {
        event.preventDefault();
        event.stopPropagation();
        session.keyBuffer = backed.keyBuffer;
        session.countBuffer = backed.countBuffer;
        session.inputRevision += 1;
        window.clearTimeout(session.keyTimer);
        session.keyTimer = undefined;
        this.refreshKeyGuide(window, session);
        return;
      }
    }
    session.inputRevision += 1;
    const revision = session.inputRevision;
    const decision = advanceInput(
      {
        mode: 'main',
        keyBuffer: session.keyBuffer,
        countBuffer: session.countBuffer,
        bindings,
        allowCountPrefix: true,
      },
      key,
    );
    session.keyBuffer = decision.state.keyBuffer;
    session.countBuffer = decision.state.countBuffer;
    window.clearTimeout(session.keyTimer);
    session.keyTimer = undefined;
    if (decision.kind === 'pass') {
      this.refreshKeyGuide(window, session);
      return;
    }
    if (decision.kind === 'execute') {
      const direction = focusDirectionForAction(decision.action);
      if (direction) {
        if (this.#navigation.focusDirection(window, session, direction)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.clearKeyGuide(window, session);
      if (this.acceptNavigationRepeat(decision.action, event, session)) {
        this.execute(decision.action, window, session, decision.count);
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.refreshKeyGuide(window, session);
    const timeoutMs = isLeaderPrefix(decision.state.keyBuffer)
      ? KEY_GUIDE_CONFIG.idleTimeoutMs
      : decision.timeoutMs;
    if (timeoutMs !== null) {
      session.keyTimer = window.setTimeout(() => {
        if (session.inputRevision !== revision) return;
        const resolved = resolveInputTimeout(decision);
        session.keyBuffer = resolved.state.keyBuffer;
        session.countBuffer = resolved.state.countBuffer;
        session.keyTimer = undefined;
        this.clearKeyGuide(window, session);
        if (resolved.kind !== 'execute') return;
        const direction = focusDirectionForAction(resolved.action);
        if (direction) {
          this.#navigation.focusDirection(window, session, direction);
          return;
        }
        this.execute(resolved.action, window, session, resolved.count);
      }, timeoutMs);
    }
  }

  private acceptNavigationRepeat(
    action: ActionId,
    event: KeyboardEvent,
    session: MainWindowSession,
  ): boolean {
    if (action !== 'mainNavDown' && action !== 'mainNavUp') return true;
    const now = Date.now();
    if (
      event.repeat &&
      session.navigationRepeatAction === action &&
      now - session.navigationRepeatAt < NAVIGATION_REPEAT_INTERVAL_MS
    ) {
      return false;
    }
    session.navigationRepeatAction = action;
    session.navigationRepeatAt = now;
    return true;
  }

  private clearKeyGuide(window: MainWindow, session: MainWindowSession): void {
    window.clearTimeout(session.keyGuideTimer);
    session.keyGuideTimer = undefined;
    session.keyGuide.hide();
  }

  private refreshKeyGuide(
    window: MainWindow,
    session: MainWindowSession,
    prefix = session.keyBuffer,
    isCurrent = (candidate: string) => session.keyBuffer === candidate,
  ): void {
    const config = keyGuideConfig(this.#dependencies.preferences);
    if (!config.enabled || !isLeaderPrefix(prefix)) {
      this.clearKeyGuide(window, session);
      return;
    }
    const entries = leaderGuideEntries(this.bindings(), 'main', prefix, this.keyGuideLanguage());
    if (!entries.length) {
      this.clearKeyGuide(window, session);
      return;
    }
    if (session.keyGuide.visible) {
      session.keyGuide.show(window.document, session.theme, prefix, entries, config.fontSizePx);
      return;
    }
    window.clearTimeout(session.keyGuideTimer);
    session.keyGuideTimer = window.setTimeout(() => {
      session.keyGuideTimer = undefined;
      if (!isCurrent(prefix)) return;
      session.keyGuide.show(window.document, session.theme, prefix, entries, config.fontSizePx);
    }, config.delayMs);
  }

  private keyGuideLanguage(): KeyGuideLanguage {
    return keyGuideLanguage(
      this.#dependencies.preferences.get('language', ''),
      typeof Zotero === 'undefined' ? '' : (Zotero.locale ?? ''),
    );
  }

  private isReaderTab(tabID: string): boolean {
    return !!mainReaderForTab(tabID);
  }

  private execute(
    action: ActionId,
    window: MainWindow,
    session: MainWindowSession,
    count: number,
  ): void {
    switch (action) {
      case 'mainFuzzyAll':
        void this.#picker.open(window, session, 'all');
        break;
      case 'mainFuzzyCollection':
        void this.#picker.open(window, session, 'collection');
        break;
      case 'mainTabPick':
        void this.#picker.open(window, session, 'tabs');
        break;
      case 'mainNotesLayout':
        void this.#picker.open(window, session, 'notes');
        break;
      case 'mainTrashItems':
        void this.#navigation.trashSelectedItems(window, session);
        break;
      case 'mainRestoreTrashedItems':
        void this.#navigation.restoreLastTrashedItems(session);
        break;
      case 'mainFocusTree':
      case 'mainFocusLeft':
        this.#navigation.focusPanel(window, session, 'collections');
        break;
      case 'mainFocusItems':
      case 'mainFocusRight':
        this.#navigation.focusPanel(window, session, 'items');
        break;
      case 'focusReaderSplitLeft':
        this.#navigation.focusDirection(window, session, 'left');
        break;
      case 'focusReaderSplitDown':
        this.#navigation.focusDirection(window, session, 'down');
        break;
      case 'focusReaderSplitUp':
        this.#navigation.focusDirection(window, session, 'up');
        break;
      case 'focusReaderSplitRight':
        this.#navigation.focusDirection(window, session, 'right');
        break;
      case 'mainYankCitekey':
        this.#navigation.yankCitekey(window, session);
        break;
      case 'mainOpenPDF':
        void this.#navigation.openPDF(window, session);
        break;
      case 'mainActivate':
        void this.#navigation.activate(window, session);
        break;
      case 'mainClosePDF':
        this.#navigation.closePDF(window);
        break;
      case 'mainPrevTab':
        this.#navigation.cycleTab(window, -1);
        break;
      case 'mainNextTab':
        this.#navigation.cycleTab(window, 1);
        break;
      case 'mainTagPicker':
        void this.#picker.open(window, session, 'tags');
        break;
      case 'mainNavDown':
        this.#navigation.navigate(window, session, 1, count);
        break;
      case 'mainNavUp':
        this.#navigation.navigate(window, session, -1, count);
        break;
      case 'mainNavFirst':
        this.#navigation.navigate(window, session, 'first', count);
        break;
      case 'mainNavLast':
        this.#navigation.navigate(window, session, 'last', count);
        break;
      case 'mainTreeToggle':
        void this.#navigation.toggleTree(window, session);
        break;
      case 'mainTreeOpenOnly':
        void this.#navigation.openTree(window, session);
        break;
      case 'mainTreeCloseOnly':
        void this.#navigation.closeTree(window, session);
        break;
      case 'mainTreeExpand':
        this.#navigation.expandTree(window, session);
        break;
      case 'mainTreeCollapse':
        this.#navigation.collapseTree(window, session);
        break;
      case 'mainTreeParent':
        this.#navigation.parentTree(window, session);
        break;
      case 'mainTreeExpandAll':
        this.#navigation.expandAll(window, session);
        break;
      case 'mainTreeCollapseAll':
        this.#navigation.collapseAll(window, session);
        break;
      default:
        this.#dependencies.logger.debug(`Unknown main action: ${action}`);
    }
  }
}

export function createMainWindowController(
  dependencies: MainWindowControllerDependencies,
): MainWindowControllerApi {
  return new MainWindowController(dependencies);
}
