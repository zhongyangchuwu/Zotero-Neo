import type {
  CommandPaletteContext,
  MainWindowControllerApi,
  MainWindowControllerDependencies,
  MainWindow,
} from '../core/contracts';
import { focusDirectionForAction, isActionId, type ActionId } from '../input/actions';
import {
  MAIN_EXECUTABLE_ACTIONS,
  MAIN_NORMAL_ACTIONS,
  MAIN_SELECT_ACTIONS,
  isMainExecutableAction,
  isReaderDelegableMainAction,
  type MainExecutableAction,
  type ReaderDelegableMainAction,
} from './action-capabilities';
import { keyGuideConfig, pickerMouseEnabled } from '../core/preferences';
import { bindingsForMode, resolveBindings, type BindingMap, type Mode } from '../input/bindings';
import { actionsForBindingMode } from '../input/binding-capabilities';
import { isNoteCrossContextActionId } from '../input/note-actions';
import {
  advanceInput,
  backspacePendingInput,
  cancelPendingInput,
  resolveInputTimeout,
} from '../input/engine';
import {
  KEY_GUIDE_CONFIG,
  keyGuideLanguage,
  type KeyGuideLanguage,
} from '../input/key-guide-config';
import { guideEntries, isGuidePrefix } from '../input/key-guide';
import { keyString } from '../input/keys';
import { isEditableElement } from '../platform/dom';
import { MainWindowSession } from './session';
import { MainNavigation } from './navigation';
import { FuzzyPicker } from './picker';
import { NoteEditor, type NoteBindingMode } from './note-editor';
import { NOTE_COMMAND_PALETTE_ACTIONS } from './note-action-capabilities';
import { TagActions } from './tag-actions';
import { MainItemSelect } from './item-select';
import { mainHost, mainReaderForTab, selectMainTab, selectedMainTabID } from './host';
import { mainCursorItem } from './action-targets';
import { PluginManagerPanel } from './plugin-manager';
import { SelectionPanel } from './selection-panel';

type MainInvocationContext = 'main' | 'reader' | 'note';

type KeyboardEventWithHandled = KeyboardEvent & {
  _zvMainHandled?: boolean;
  _zvPickerHandled?: boolean;
};
function assertNever(value: never): never {
  throw new Error(`Unhandled Main action: ${String(value)}`);
}

export class MainWindowController implements MainWindowControllerApi {
  readonly #dependencies: MainWindowControllerDependencies;
  readonly #sessions = new Map<MainWindow, MainWindowSession>();
  readonly #navigation: MainNavigation;
  readonly #picker: FuzzyPicker;
  readonly #noteEditor: NoteEditor;
  readonly #tags: TagActions;
  readonly #itemSelect: MainItemSelect;
  readonly #pluginManager: PluginManagerPanel;
  readonly #selectionPanel: SelectionPanel;

  constructor(dependencies: MainWindowControllerDependencies) {
    this.#dependencies = dependencies;
    this.#navigation = new MainNavigation(dependencies.logger, (window) => this.rescan(window));
    this.#itemSelect = new MainItemSelect(dependencies.logger);
    this.#pluginManager = new PluginManagerPanel(dependencies.logger);
    this.#selectionPanel = new SelectionPanel(dependencies.logger);
    this.#picker = new FuzzyPicker(dependencies.logger, this.#navigation, () =>
      pickerMouseEnabled(dependencies.preferences),
    );
    this.#tags = new TagActions(
      dependencies.logger,
      this.#navigation,
      dependencies.preferences,
      this.#picker,
    );
    this.#noteEditor = new NoteEditor(
      dependencies.logger,
      this.#navigation,
      () => this.bindings(),
      {
        refresh: (window, session) => {
          const active = this.#noteEditor.activeBindings(session);
          this.refreshKeyGuide(
            window,
            session,
            session.note.buffer,
            (prefix) => session.note.buffer === prefix,
            active.mode,
            active.bindings,
          );
        },
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
    let readerScanFailed = false;
    const scan = (): void => {
      try {
        this.rescan(window);
        if (readerScanFailed) {
          this.#dependencies.logger.debug('Reader rescan recovered during Main window scan');
          readerScanFailed = false;
        }
      } catch (error) {
        if (!readerScanFailed)
          this.#dependencies.logger.debug(
            `Reader rescan failed during Main window scan: ${String(error)}`,
          );
        readerScanFailed = true;
      }
      this.#noteEditor.sync(
        window,
        session,
        this.#dependencies.preferences.get('noteEditor.enabled', true),
        (action, count, target, mode, bindings) =>
          this.executeFromNote(action, count, target, mode, bindings, window, session),
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
      this.#pluginManager.close(session);
      this.#selectionPanel.close(session);
      this.#noteEditor.clear(session);
    });
  }

  removeWindow(window: MainWindow): void {
    const session = this.#sessions.get(window);
    if (!session) return;
    this.#sessions.delete(window);
    this.#dependencies.logger.debug(`main window detached sessions=${this.#sessions.size}`);
    this.#dependencies.logger.diagnostic(`main window detached sessions=${this.#sessions.size}`);
    this.#itemSelect.removeWindow(window);
    session.dispose();
  }

  shutdown(): void {
    for (const window of [...this.#sessions.keys()]) this.removeWindow(window);
  }

  executeFromReader(
    action: ReaderDelegableMainAction,
    count: number,
    ownerWindow: MainWindow | null,
  ): void {
    if (!isReaderDelegableMainAction(action)) {
      this.#dependencies.logger.debug(`ignored Reader action ${String(action)}: not delegable`);
      return;
    }
    if (!ownerWindow) {
      this.#dependencies.logger.debug(`ignored Reader action ${action}: no owner window`);
      return;
    }
    const session = this.#sessions.get(ownerWindow);
    if (!session) {
      this.#dependencies.logger.debug(`ignored Reader action ${action}: owner window detached`);
      return;
    }
    this.execute(action, ownerWindow, session, count, false, 'reader');
  }

  openCommandPalette(window: MainWindow, context: CommandPaletteContext): void {
    const session = this.#sessions.get(window);
    if (!session) {
      this.#dependencies.logger.debug('ignored command palette: owner window detached');
      return;
    }
    const execute = context.execute;
    const ownerContext: CommandPaletteContext = {
      ...context,
      execute: (action, count) => {
        if (this.#sessions.get(window) !== session) {
          this.#dependencies.logger.debug('ignored command palette action: owner window detached');
          return;
        }
        execute(action, count);
      },
    };
    void this.#picker.open(window, session, 'commands', {
      commandContext: ownerContext,
      closeBeforeConfirm: true,
      confirm: (item) => {
        if (isActionId(item.id) && item.id !== 'openCommandPalette')
          ownerContext.execute(item.id, 0);
      },
    });
  }

  private bindings() {
    return resolveBindings(this.#dependencies.preferences.get('bindings', ''));
  }
  private activeBindings(mode: Mode) {
    return bindingsForMode(this.bindings(), mode, mode === 'main-select' ? ['main-normal'] : []);
  }
  private rescan = (window: MainWindow): void => this.#dependencies.reader.rescan(window);

  private onKeyDown(
    event: KeyboardEventWithHandled,
    window: MainWindow,
    session: MainWindowSession,
  ): void {
    if (event._zvMainHandled) return;
    event._zvMainHandled = true;
    if (session.selectionPanel.open) {
      this.#selectionPanel.handleKey(event, window, session);
      return;
    }
    if (session.pluginManager.open) {
      this.#pluginManager.handleKey(event, window, session);
      return;
    }
    if (session.picker.open) {
      this.#picker.onKeyDown(event, window, session);
      return;
    }
    if (
      this.#dependencies.preferences.get('noteEditor.enabled', true) &&
      this.#noteEditor.isStandalone(window)
    ) {
      this.#noteEditor.onKeyDown(event, window, session, (action, count, target, mode, bindings) =>
        this.executeFromNote(action, count, target, mode, bindings, window, session),
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
    if (session.inputMode === 'main-select' && !this.#itemSelect.itemsFocused(window)) {
      this.#itemSelect.leave(window, session.selection);
      session.inputMode = 'main-normal';
      session.keyBuffer = '';
      session.countBuffer = '';
      session.inputRevision += 1;
      window.clearTimeout(session.keyTimer);
      session.keyTimer = undefined;
      this.clearKeyGuide(window, session);
      return;
    }
    const key = keyString(event);
    if (!key) return;
    if (
      session.inputMode === 'main-normal' &&
      key === ' ' &&
      !this.#itemSelect.itemsFocused(window)
    ) {
      this.clearKeyGuide(window, session);
      return;
    }
    const bindings = this.activeBindings(session.inputMode);
    const leaderState = {
      mode: session.inputMode,
      keyBuffer: session.keyBuffer,
      countBuffer: session.countBuffer,
    };
    if (event.key.toLowerCase() === 'escape') {
      const cancelled = cancelPendingInput(leaderState);
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
      const backed = backspacePendingInput(leaderState);
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
        mode: session.inputMode,
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
      if (decision.action === 'mainEnterSelect' && !this.#itemSelect.entryRelevant(window)) {
        this.clearKeyGuide(window, session);
        return;
      }
      if (decision.action === 'mainToggleSelection' && !this.#itemSelect.itemsFocused(window)) {
        this.clearKeyGuide(window, session);
        return;
      }
      if (!isMainExecutableAction(decision.action)) {
        event.preventDefault();
        event.stopPropagation();
        this.clearKeyGuide(window, session);
        return;
      }
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
      this.execute(decision.action, window, session, decision.count, event.repeat);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.refreshKeyGuide(window, session);
    const timeoutMs = isGuidePrefix(bindings, session.inputMode, decision.state.keyBuffer)
      ? KEY_GUIDE_CONFIG.idleTimeoutMs
      : decision.timeoutMs;
    if (timeoutMs !== null) {
      session.keyTimer = window.setTimeout(() => {
        if (session.inputRevision !== revision) return;
        const resolved = resolveInputTimeout(decision);
        session.keyBuffer = resolved.state.keyBuffer;
        session.countBuffer = resolved.state.countBuffer;
        session.keyTimer = undefined;
        if (resolved.kind !== 'execute') return;
        if (!isMainExecutableAction(resolved.action)) return;
        const direction = focusDirectionForAction(resolved.action);
        if (direction) {
          this.#navigation.focusDirection(window, session, direction);
          return;
        }
        this.execute(resolved.action, window, session, resolved.count);
      }, timeoutMs);
    }
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
    mode: Mode = session.inputMode,
    bindings: BindingMap = this.activeBindings(mode),
  ): void {
    const config = keyGuideConfig(this.#dependencies.preferences);
    if (!config.enabled || !isGuidePrefix(bindings, mode, prefix)) {
      this.clearKeyGuide(window, session);
      return;
    }
    const entries = guideEntries(bindings, mode, prefix, this.keyGuideLanguage());
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

  private executeFromNote(
    action: ActionId,
    count: number,
    target: HTMLElement,
    bindingMode: NoteBindingMode,
    bindings: BindingMap,
    window: MainWindow,
    session: MainWindowSession,
  ): boolean {
    const local = this.#noteEditor.executeAction(action, target, window, session, count);
    if (local !== null) return local;

    if (action === 'openCommandPalette') {
      this.openCommandPalette(window, {
        mode: 'note',
        bindingMode,
        actions:
          bindingMode === 'note-normal'
            ? NOTE_COMMAND_PALETTE_ACTIONS
            : actionsForBindingMode(bindingMode),
        bindings,
        language: this.keyGuideLanguage(),
        execute: (nextAction, nextCount) => {
          if (this.#sessions.get(window) !== session) return;
          const nextLocal = this.#noteEditor.executeAction(
            nextAction,
            target,
            window,
            session,
            nextCount,
          );
          if (
            nextLocal === null &&
            isNoteCrossContextActionId(nextAction) &&
            isMainExecutableAction(nextAction)
          )
            this.execute(nextAction, window, session, nextCount, false, 'note');
        },
      });
      return true;
    }

    if (!isNoteCrossContextActionId(action) || !isMainExecutableAction(action)) return false;
    this.execute(action, window, session, count, false, 'note');
    return true;
  }

  private execute(
    action: ActionId,
    window: MainWindow,
    session: MainWindowSession,
    count: number,
    shouldDebounce = false,
    context: MainInvocationContext = 'main',
  ): void {
    if (!isMainExecutableAction(action)) {
      this.#dependencies.logger.debug(`ignored Main action: ${String(action)}`);
      return;
    }
    this.executeMain(action, window, session, count, shouldDebounce, context);
  }

  private executeMain(
    action: MainExecutableAction,
    window: MainWindow,
    session: MainWindowSession,
    count: number,
    shouldDebounce = false,
    context: MainInvocationContext = 'main',
  ): void {
    switch (action) {
      case 'openCommandPalette':
        this.openCommandPalette(window, {
          mode: 'main',
          bindingMode: session.inputMode,
          actions: session.inputMode === 'main-select' ? MAIN_SELECT_ACTIONS : MAIN_NORMAL_ACTIONS,
          bindings: this.bindings(),
          language: this.keyGuideLanguage(),
          execute: (nextAction, nextCount) => {
            if (this.#sessions.get(window) === session)
              this.execute(nextAction, window, session, nextCount);
          },
        });
        break;
      case 'findAllItems':
        void this.#picker.open(window, session, 'all', {
          confirm: async (item) => {
            await mainHost(window).ZoteroPane?.selectItem?.(Number(item.id));
          },
        });
        break;
      case 'findCollectionItems':
        void this.#picker.open(window, session, 'collection', {
          confirm: async (item) => {
            await mainHost(window).ZoteroPane?.selectItem?.(Number(item.id));
          },
        });
        break;
      case 'switchTab':
        void this.#picker.open(window, session, 'tabs', {
          confirm: (item) => {
            selectMainTab(window, String(item.id));
            this.#navigation.afterTabSwitch(window);
          },
        });
        break;
      case 'findNotes':
        void this.#picker.open(window, session, 'notes', {
          confirm: async (item, openInWindow) => {
            const pane = mainHost(window).ZoteroPane;
            const id = Number(item.id);
            await pane?.selectItem?.(id);
            if (pane?.openNote) await pane.openNote(id, { openInWindow });
            else await Zotero.Notes.open(id, null, { openInWindow });
          },
        });
        break;
      case 'managePlugins':
        this.#pluginManager.open(window, session);
        break;
      case 'manageSelection':
        this.#selectionPanel.open(window, session);
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
        this.#navigation.yankCitekey(window, session, context);
        break;
      case 'mainOpenPDF':
        void this.#navigation.openPDF(
          window,
          session,
          context === 'main' ? (mainCursorItem(window) ?? null) : undefined,
        );
        break;
      case 'mainActivate':
        void this.#navigation.activate(window, session);
        break;
      case 'closeCurrentTab':
        this.#navigation.closePDF(window);
        break;
      case 'previousTab':
        this.#navigation.cycleTab(window, -1);
        break;
      case 'nextTab':
        this.#navigation.cycleTab(window, 1);
        break;
      case 'addTag':
        this.#tags.add(window, session);
        break;
      case 'removeTag':
        this.#tags.remove(window, session);
        break;
      case 'toggleTagFilter':
        this.#tags.toggleFilter(window, session);
        break;
      case 'clearTagFilters':
        this.#tags.clearFilters(window, session);
        break;
      case 'mainNavDown':
        this.#navigation.navigate(window, session, 1, count, shouldDebounce);
        break;
      case 'mainNavUp':
        this.#navigation.navigate(window, session, -1, count, shouldDebounce);
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
      case 'mainToggleSelection':
        this.#itemSelect.toggleCursor(window, session.selection, shouldDebounce);
        break;
      case 'mainEnterSelect': {
        const result = this.#itemSelect.enter(window, session.selection);
        if (result === 'entered') session.inputMode = 'main-select';
        break;
      }
      case 'mainSelectDown':
        this.#itemSelect.extend(window, 1, count, session.selection, shouldDebounce);
        break;
      case 'mainSelectUp':
        this.#itemSelect.extend(window, -1, count, session.selection, shouldDebounce);
        break;
      case 'mainSelectFirst':
        this.#itemSelect.extend(window, 'first', count, session.selection);
        break;
      case 'mainSelectLast':
        this.#itemSelect.extend(window, 'last', count, session.selection);
        break;
      case 'mainSelectSwapEnds':
        this.#itemSelect.swapEnds(window, session.selection);
        break;
      case 'mainSelectFinish':
        this.#itemSelect.finish(window, session.selection);
        session.inputMode = 'main-normal';
        break;
      case 'mainSelectCancel':
        this.#itemSelect.cancel(window, session.selection);
        session.inputMode = 'main-normal';
        break;
      default:
        return assertNever(action);
    }
  }
}

export function createMainWindowController(
  dependencies: MainWindowControllerDependencies,
): MainWindowControllerApi {
  return new MainWindowController(dependencies);
}
