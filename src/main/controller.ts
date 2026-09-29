import type {
  CommandPaletteContext,
  MainWindowControllerApi,
  MainWindowControllerDependencies,
  MainWindow,
  ReaderSelectionContext,
} from '../core/contracts';
import type { ItemTargetSet } from '../core/item-target';
import { focusDirectionForAction, isActionId, type ActionId } from '../input/actions';
import {
  MAIN_EXECUTABLE_ACTIONS,
  MAIN_NORMAL_ACTIONS,
  MAIN_SELECT_ACTIONS,
  isMainExecutableAction,
  type MainExecutableAction,
} from './action-capabilities';
import {
  keyGuideConfig,
  neoCommandLanguage,
  noteEditorEnabled,
  pickerMouseEnabled,
} from '../core/preferences';
import { bindingsForMode, resolveBindings, type BindingMap, type Mode } from '../input/bindings';
import { compositionOwnsKey } from '../input/composition';
import { actionsForBindingMode } from '../input/binding-capabilities';
import { KEY_GUIDE_CONFIG, type KeyGuideLanguage } from '../input/key-guide-config';
import { isGuidePrefix } from '../input/key-guide';
import type { InputRuntime } from '../input/runtime';
import { keyString } from '../input/keys';
import { asElement, isEditableElement } from '../platform/dom';
import { copyCitekeys } from '../operations/citekeys';
import { t } from '../i18n';
import { showItemInLibrary } from '../operations/show-in-library';
import { resolveActiveSurface } from './active-surface';
import { MainWindowSession } from './session';
import { MainNavigation } from './navigation';
import { FuzzyPicker } from './picker';
import { NoteEditor, type NoteBindingMode } from './note-editor';
import { NOTE_COMMAND_PALETTE_ACTIONS } from './note-action-capabilities';
import { TagActions } from './tag-actions';
import { MainItemSelect } from './item-select';
import { mainHost, mainReaderForTab, selectMainTab, selectedMainTabID } from './host';
import { mainCursorItem } from './action-targets';
import { MAIN_ITEM_TARGET } from './main-item-target';
import { NOTE_ITEM_TARGET } from './note-item-target';
import { PluginManagerPanel } from './plugin-manager';
import { SelectionPanel } from './selection-panel';
import { MainLocalFind } from './local-find';
import { MainViewActions } from './view-actions';
import { MainReturnContext } from './return-context';
import { CollectionMembershipActions } from './collection-actions';
import { installMainViewLifecycle } from './view-lifecycle';
import { createNotesProvider } from './picker/providers/notes';
import { appendReaderSelectionToNote, readerCaptureBaseItem } from './note-capture';

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
  readonly #localFind: MainLocalFind;
  readonly #viewActions: MainViewActions;
  readonly #returnContext: MainReturnContext;
  readonly #collections: CollectionMembershipActions;

  constructor(dependencies: MainWindowControllerDependencies) {
    this.#dependencies = dependencies;
    this.#navigation = new MainNavigation(dependencies.logger, (window) => this.rescan(window));
    this.#itemSelect = new MainItemSelect(dependencies.logger);
    this.#pluginManager = new PluginManagerPanel(dependencies.logger);
    this.#localFind = new MainLocalFind((session, text) => this.#navigation.status(session, text));
    this.#viewActions = new MainViewActions(dependencies.logger, this.#navigation);
    this.#returnContext = new MainReturnContext(
      dependencies.logger,
      this.#navigation,
      this.#viewActions,
    );
    this.#selectionPanel = new SelectionPanel(
      dependencies.logger,
      this.#returnContext,
      (window, session) => this.#itemSelect.refresh(window, session.selection),
    );
    this.#picker = new FuzzyPicker(dependencies.logger, this.#navigation, () =>
      pickerMouseEnabled(dependencies.preferences),
    );
    this.#collections = new CollectionMembershipActions(
      dependencies.logger,
      this.#navigation,
      this.#picker,
    );
    this.#tags = new TagActions(
      dependencies.logger,
      this.#navigation,
      dependencies.preferences,
      this.#picker,
      this.#viewActions,
    );
    this.#noteEditor = new NoteEditor(
      dependencies.logger,
      this.#navigation,
      () => this.bindings(),
      {
        refresh: (window, session) => {
          this.refreshKeyGuide(window, session, session.note.input);
        },
        clear: (window, session) => this.clearKeyGuide(window, session),
      },
    );
  }

  addWindow(window: MainWindow): void {
    if (this.#sessions.has(window)) return;
    const session = new MainWindowSession(
      window,
      this.#dependencies.preferences,
      this.#dependencies.mayClaimInitialLibraryFocus?.() ?? false,
    );
    this.#sessions.set(window, session);
    this.#itemSelect.addWindow(window, session.selection, session.interactionAppearance);
    session.cleanup.add(
      installMainViewLifecycle(window, this.#dependencies.logger, () =>
        this.#itemSelect.refresh(window, session.selection),
      ),
    );
    session.focusOwnership.start();
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
        noteEditorEnabled(this.#dependencies.preferences),
        (action, count, target, mode, bindings) =>
          this.executeFromNote(action, count, target, mode, bindings, window, session),
      );
      this.syncSurfaceActivation(window, session);
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
    session.cleanup.addEventListener(window.document, 'focusin', (event) => {
      if (session.settings.contains(event.target)) this.resetMainInput(window, session);
      this.syncSurfaceActivation(window, session);
    });
    session.cleanup.add(() => {
      this.#picker.close(session);
      this.#pluginManager.close(session);
      this.#selectionPanel.close(session);
      this.#localFind.close(session);
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

  openSettings(owner?: Window | null): boolean {
    const session = owner ? this.#sessions.get(owner as MainWindow) : undefined;
    const resolved =
      session ?? (this.#sessions.size === 1 ? this.#sessions.values().next().value : undefined);
    if (!resolved) return false;
    const window = resolved.window;
    this.#picker.close(resolved);
    this.#pluginManager.close(resolved);
    this.#selectionPanel.close(resolved);
    this.#localFind.close(resolved);
    this.resetMainInput(window, resolved);
    try {
      window.focus();
      resolved.settings.openWorkspace();
      return true;
    } catch (error) {
      this.#dependencies.logger.debug(`Settings open failed: ${String(error)}`);
      resolved.settings.close();
      return false;
    }
  }

  private resetMainInput(window: MainWindow, session: MainWindowSession): void {
    session.input.reset();
    this.clearKeyGuide(window, session);
  }

  private deactivateMainSurface(window: MainWindow, session: MainWindowSession): void {
    if (this.#itemSelect.isVisual(window)) this.#itemSelect.leave(window, session.selection);
    this.resetMainInput(window, session);
  }

  private syncSurfaceActivation(window: MainWindow, session: MainWindowSession): void {
    const active = resolveActiveSurface(window);
    if (active.kind !== 'main') this.deactivateMainSurface(window, session);
    if (active.kind !== 'note') session.note.deactivateInteraction();
    this.#dependencies.reader.deactivateInactive(
      window,
      active.kind === 'reader' ? active.tabID : null,
    );
  }

  private withReaderWindow(
    ownerWindow: MainWindow | null,
    operation: string,
    run: (window: MainWindow, session: MainWindowSession) => void,
  ): void {
    if (!ownerWindow) {
      this.#dependencies.logger.debug(`ignored Reader operation ${operation}: no owner window`);
      return;
    }
    const session = this.#sessions.get(ownerWindow);
    if (!session) {
      this.#dependencies.logger.debug(
        `ignored Reader operation ${operation}: owner window detached`,
      );
      return;
    }
    run(ownerWindow, session);
  }

  openAllItemsPicker(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'findAllItems', (window, session) =>
      this.openAllItemsPickerForSurface(window, session),
    );
  }

  openCollectionItemsPicker(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'findCollectionItems', (window, session) =>
      this.openCollectionItemsPickerForSurface(window, session),
    );
  }

  openNotesPicker(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'findNotes', (window, session) =>
      this.openNotesPickerForSurface(window, session),
    );
  }

  openPluginManager(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'managePlugins', (window, session) =>
      this.#pluginManager.open(window, session),
    );
  }

  openSettingsFromReader(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'openNeoSettings', (window) => this.openSettings(window));
  }

  restoreReturnContext(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(
      ownerWindow,
      'mainReturnContext',
      (window, session) => void this.#returnContext.restore(window, session),
    );
  }

  openTabPicker(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'switchTab', (window, session) =>
      this.openTabPickerForSurface(window, session),
    );
  }

  closeReaderTab(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'closeCurrentTab', (window) =>
      this.#navigation.closePDF(window),
    );
  }

  cycleReaderTab(ownerWindow: MainWindow | null, direction: -1 | 1): void {
    this.withReaderWindow(ownerWindow, direction < 0 ? 'previousTab' : 'nextTab', (window) =>
      this.#navigation.cycleTab(window, direction),
    );
  }

  showReaderItemInLibrary(ownerWindow: MainWindow | null, targets: ItemTargetSet<'reader'>): void {
    this.withReaderWindow(ownerWindow, 'showInLibrary', (window, session) => {
      void this.showInLibraryForSurface(window, session, targets);
    });
  }

  openReaderTagPicker(
    ownerWindow: MainWindow | null,
    targets: ItemTargetSet<'reader'>,
    present: boolean,
  ): void {
    const session = ownerWindow ? this.#sessions.get(ownerWindow) : undefined;
    if (!ownerWindow || !session) {
      this.#dependencies.logger.debug('ignored Reader tag picker: no attached owner window');
      return;
    }
    if (present) this.#tags.add(ownerWindow, session, targets);
    else this.#tags.remove(ownerWindow, session, targets);
  }

  openReaderCollectionPicker(
    ownerWindow: MainWindow | null,
    present: boolean,
    resolveTargets: () => ItemTargetSet<'reader'>,
  ): void {
    const session = ownerWindow ? this.#sessions.get(ownerWindow) : undefined;
    if (!ownerWindow || !session) {
      this.#dependencies.logger.debug('ignored Reader collection picker: no attached owner window');
      return;
    }
    this.#collections.open(ownerWindow, session, present, resolveTargets);
  }

  async captureReaderSelectionToNote(
    context: ReaderSelectionContext,
    ownerWindow: MainWindow | null,
  ): Promise<boolean> {
    if (!ownerWindow) {
      this.#dependencies.logger.debug('ignored Reader note capture: no owner window');
      return false;
    }
    const session = this.#sessions.get(ownerWindow);
    if (!session) {
      this.#dependencies.logger.debug('ignored Reader note capture: owner window detached');
      return false;
    }
    if (session.picker.open) {
      this.#navigation.status(session, '✗ Close the current picker before capturing');
      return false;
    }

    const snapshot: ReaderSelectionContext = Object.freeze({ ...context });
    const base = readerCaptureBaseItem(snapshot);
    if (!base || !Number.isInteger(base.libraryID) || base.libraryID <= 0) {
      this.#navigation.status(session, '✗ Reader item is unavailable');
      return false;
    }
    const libraryID = base.libraryID;
    let captured = false;

    return await new Promise<boolean>((resolve) => {
      void this.#picker.open(ownerWindow, session, 'notes', {
        source: createNotesProvider(ownerWindow, this.#dependencies.logger, {
          baseItem: base,
          libraryID,
        }),
        onClose: () => resolve(captured),
        confirm: async (candidate) => {
          const note = Zotero.Items.get(Number(candidate.id));
          if (!note) throw new Error('Note target is unavailable');
          await appendReaderSelectionToNote(note, snapshot, libraryID);
          captured = true;
        },
      });
    });
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
    return bindingsForMode(this.bindings(), mode);
  }

  private bindingMode(window: MainWindow): Extract<Mode, 'main-normal' | 'main-select'> {
    return this.#itemSelect.isVisual(window) ? 'main-select' : 'main-normal';
  }
  private rescan = (window: MainWindow): void => this.#dependencies.reader.rescan(window);

  private onKeyDown(
    event: KeyboardEventWithHandled,
    window: MainWindow,
    session: MainWindowSession,
  ): void {
    if (event._zvMainHandled) return;
    event._zvMainHandled = true;
    if (session.settings.open) {
      if (compositionOwnsKey(event, false)) {
        event.stopPropagation();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation();
        session.settings.close();
      } else if (!session.settings.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation();
      }
      this.resetMainInput(window, session);
      return;
    }
    if (session.localFind.open) {
      this.#localFind.handleKey(event, window, session);
      return;
    }
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
      noteEditorEnabled(this.#dependencies.preferences) &&
      this.#noteEditor.isStandalone(window)
    ) {
      this.#noteEditor.onKeyDown(event, window, session, (action, count, target, mode, bindings) =>
        this.executeFromNote(action, count, target, mode, bindings, window, session),
      );
      return;
    }
    const active = window.document.activeElement;
    const target = asElement(event.target);
    const editable = isEditableElement(active) ? active : isEditableElement(target) ? target : null;
    if (editable) {
      this.clearKeyGuide(window, session);
      if (event.key === 'Escape' && !compositionOwnsKey(event, false)) {
        event.preventDefault();
        event.stopPropagation();
        (editable as HTMLElement).blur();
      }
      return;
    }
    const tabID = selectedMainTabID(window);
    if (active?.localName === 'browser' || (tabID && this.isReaderTab(tabID))) {
      this.#dependencies.reader.forwardKey(event, window);
      return;
    }
    if (compositionOwnsKey(event, false)) return;
    if (this.#itemSelect.isVisual(window) && !this.#itemSelect.itemsFocused(window)) {
      this.deactivateMainSurface(window, session);
      return;
    }
    const key = keyString(event);
    if (!key) return;
    const mode = this.bindingMode(window);
    const bindings = this.activeBindings(mode);
    if (event.key.toLowerCase() === 'escape' && session.input.cancel(mode)) {
      event.preventDefault();
      event.stopPropagation();
      this.clearKeyGuide(window, session);
      return;
    }
    if (event.key.toLowerCase() === 'backspace' && session.input.backspace(mode)) {
      event.preventDefault();
      event.stopPropagation();
      this.refreshKeyGuide(window, session);
      return;
    }
    const decision = session.input.advance(mode, bindings, key, true);
    if (decision.kind === 'pass') {
      this.refreshKeyGuide(window, session);
      return;
    }
    if (decision.kind === 'execute') {
      if (
        decision.action === 'mainCancelTarget' &&
        event.key.toLowerCase() === 'escape' &&
        (!this.#itemSelect.itemsFocused(window) || !this.#itemSelect.hasCancelableTarget(window))
      ) {
        this.clearKeyGuide(window, session);
        return;
      }
      if (decision.action === 'mainEnterSelect' && !this.#itemSelect.itemsFocused(window)) {
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
    const timeoutMs = isGuidePrefix(bindings, mode, decision.state.keyBuffer)
      ? KEY_GUIDE_CONFIG.idleTimeoutMs
      : decision.timeoutMs;
    if (timeoutMs !== null) {
      session.input.schedule(decision, timeoutMs, (resolved) => {
        if (resolved.kind !== 'execute') return;
        if (!isMainExecutableAction(resolved.action)) return;
        const direction = focusDirectionForAction(resolved.action);
        if (direction) {
          this.#navigation.focusDirection(window, session, direction);
          return;
        }
        this.execute(resolved.action, window, session, resolved.count);
      });
    }
  }

  private clearKeyGuide(_window: MainWindow, session: MainWindowSession): void {
    session.prefixGuide.clear();
  }

  private refreshKeyGuide(
    window: MainWindow,
    session: MainWindowSession,
    input: InputRuntime = session.input,
  ): void {
    session.prefixGuide.refresh(() => {
      const fromNote = input === session.note.input;
      let active: { mode: Mode; bindings: BindingMap };
      if (fromNote) active = this.#noteEditor.activeBindings(session);
      else {
        const mode = this.bindingMode(window);
        active = { mode, bindings: this.activeBindings(mode) };
      }
      const config = keyGuideConfig(this.#dependencies.preferences);
      return {
        input,
        mode: active.mode,
        bindings: active.bindings,
        enabled:
          config.enabled &&
          (fromNote
            ? noteEditorEnabled(this.#dependencies.preferences)
            : !this.#noteEditor.isStandalone(window)),
        language: this.keyGuideLanguage(),
        delayMs: config.delayMs,
        fontSizePx: config.fontSizePx,
        document: window.document,
        theme: session.theme,
      };
    });
  }

  private keyGuideLanguage(): KeyGuideLanguage {
    return neoCommandLanguage(
      this.#dependencies.preferences,
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
      const noteTargets = NOTE_ITEM_TARGET.resolve(window);
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
          if (nextLocal !== null) return;
          if (nextAction === 'openCommandPalette') {
            this.executeFromNote(
              nextAction,
              nextCount,
              target,
              bindingMode,
              bindings,
              window,
              session,
            );
            return;
          }
          this.executeNoteSurfaceAction(nextAction, window, session, noteTargets);
        },
      });
      return true;
    }

    return this.executeNoteSurfaceAction(action, window, session);
  }

  private executeNoteSurfaceAction(
    action: ActionId,
    window: MainWindow,
    session: MainWindowSession,
    resolvedTargets?: ItemTargetSet<'note'>,
  ): boolean {
    switch (action) {
      case 'addTag':
      case 'removeTag': {
        const targets = resolvedTargets ?? NOTE_ITEM_TARGET.resolve(window);
        if (action === 'addTag') this.#tags.add(window, session, targets);
        else this.#tags.remove(window, session, targets);
        return true;
      }
      case 'mainYankCitekey':
        this.#navigation.status(
          session,
          copyCitekeys(resolvedTargets ?? NOTE_ITEM_TARGET.resolve(window)),
        );
        return true;
      case 'mainOpenPDF': {
        const targets = resolvedTargets ?? NOTE_ITEM_TARGET.resolve(window);
        if (targets.missing || targets.items.length !== 1) {
          this.#navigation.status(session, '✗ Note item is unavailable');
          return true;
        }
        void this.#navigation.openPDF(window, session, targets.items[0]!);
        return true;
      }
      case 'showInLibrary':
        void this.showInLibraryForSurface(
          window,
          session,
          resolvedTargets ?? NOTE_ITEM_TARGET.resolve(window),
        );
        return true;
      case 'findAllItems':
        this.openAllItemsPickerForSurface(window, session);
        return true;
      case 'findCollectionItems':
        this.openCollectionItemsPickerForSurface(window, session);
        return true;
      case 'findNotes':
        this.openNotesPickerForSurface(window, session);
        return true;
      case 'managePlugins':
        this.#pluginManager.open(window, session);
        return true;
      case 'openNeoSettings':
        this.openSettings(window);
        return true;
      case 'mainFocusTree':
      case 'mainFocusLeft':
        this.#navigation.focusPanel(window, session, 'collections');
        return true;
      case 'mainFocusItems':
      case 'mainFocusRight':
        this.#navigation.focusPanel(window, session, 'items');
        return true;
      case 'focusReaderSplitLeft':
        this.#navigation.focusDirection(window, session, 'left');
        return true;
      case 'focusReaderSplitDown':
        this.#navigation.focusDirection(window, session, 'down');
        return true;
      case 'focusReaderSplitUp':
        this.#navigation.focusDirection(window, session, 'up');
        return true;
      case 'focusReaderSplitRight':
        this.#navigation.focusDirection(window, session, 'right');
        return true;
      case 'switchTab':
        this.openTabPickerForSurface(window, session);
        return true;
      case 'closeCurrentTab':
        this.#navigation.closePDF(window);
        return true;
      case 'previousTab':
        this.#navigation.cycleTab(window, -1);
        return true;
      case 'nextTab':
        this.#navigation.cycleTab(window, 1);
        return true;
      default:
        return false;
    }
  }

  private async showInLibraryForSurface(
    window: MainWindow,
    session: MainWindowSession,
    targets: ItemTargetSet,
  ): Promise<void> {
    const language = this.keyGuideLanguage();
    if (targets.missing || targets.total !== 1 || targets.items.length !== 1) {
      this.#navigation.status(session, t('status.showInLibraryUnavailable', language));
      return;
    }

    const pane = mainHost(window).ZoteroPane;
    if (!pane?.selectItem) {
      this.#navigation.status(session, t('status.showInLibraryHostUnavailable', language));
      return;
    }

    const previous = session.returnBookmark;
    try {
      this.#returnContext.capture(window, session);
      await showItemInLibrary(targets.items[0]!, pane);
    } catch (error) {
      session.returnBookmark = previous;
      this.#dependencies.logger.debug(`show in library failed: ${String(error)}`);
      if (this.#sessions.get(window) === session)
        this.#navigation.status(session, t('status.showInLibraryFailed', language));
      return;
    }

    if (this.#sessions.get(window) === session)
      this.#navigation.status(session, t('status.showInLibraryComplete', language));
  }
  private openAllItemsPickerForSurface(window: MainWindow, session: MainWindowSession): void {
    void this.#picker.open(window, session, 'all', {
      confirm: async (item) => {
        this.#returnContext.capture(window, session);
        await mainHost(window).ZoteroPane?.selectItem?.(Number(item.id));
      },
    });
  }

  private openCollectionItemsPickerForSurface(
    window: MainWindow,
    session: MainWindowSession,
  ): void {
    void this.#picker.open(window, session, 'collection', {
      confirm: async (item) => {
        await mainHost(window).ZoteroPane?.selectItem?.(Number(item.id));
      },
    });
  }

  private openNotesPickerForSurface(window: MainWindow, session: MainWindowSession): void {
    void this.#picker.open(window, session, 'notes', {
      confirm: async (item, openInWindow) => {
        const pane = mainHost(window).ZoteroPane;
        const id = Number(item.id);
        this.#returnContext.capture(window, session);
        await pane?.selectItem?.(id);
        if (pane?.openNote) await pane.openNote(id, { openInWindow });
        else await Zotero.Notes.open(id, null, { openInWindow });
      },
    });
  }

  private openTabPickerForSurface(window: MainWindow, session: MainWindowSession): void {
    void this.#picker.open(window, session, 'tabs', {
      confirm: (item) => {
        selectMainTab(window, String(item.id));
        this.#navigation.afterTabSwitch(window);
      },
    });
  }

  private execute(
    action: ActionId,
    window: MainWindow,
    session: MainWindowSession,
    count: number,
    shouldDebounce = false,
  ): void {
    if (!isMainExecutableAction(action)) {
      this.#dependencies.logger.debug(`ignored Main action: ${String(action)}`);
      return;
    }
    this.executeMain(action, window, session, count, shouldDebounce);
  }

  private executeMain(
    action: MainExecutableAction,
    window: MainWindow,
    session: MainWindowSession,
    count: number,
    shouldDebounce = false,
  ): void {
    const beforeMainReadingNavigation = () => {
      const previous = session.returnBookmark;
      this.#returnContext.capture(window, session);
      return () => {
        session.returnBookmark = previous;
      };
    };

    switch (action) {
      case 'openSearch':
        if (!this.#itemSelect.itemsFocused(window)) {
          this.#navigation.status(session, '✗ Focus the items list first');
          break;
        }
        if (this.#itemSelect.isVisual(window)) this.#itemSelect.cancel(window, session.selection);
        this.#localFind.open(window, session);
        break;
      case 'findNext':
      case 'findPrevious':
        if (!this.#itemSelect.itemsFocused(window)) {
          this.#navigation.status(session, '✗ Focus the items list first');
          break;
        }
        if (this.#itemSelect.isVisual(window)) this.#itemSelect.cancel(window, session.selection);
        this.#localFind.repeat(window, session, action === 'findNext' ? 1 : -1);
        break;
      case 'openCommandPalette': {
        const mode = this.bindingMode(window);
        this.openCommandPalette(window, {
          mode: 'main',
          bindingMode: mode,
          actions: mode === 'main-select' ? MAIN_SELECT_ACTIONS : MAIN_NORMAL_ACTIONS,
          bindings: this.bindings(),
          language: this.keyGuideLanguage(),
          execute: (nextAction, nextCount) => {
            if (this.#sessions.get(window) === session)
              this.execute(nextAction, window, session, nextCount);
          },
        });
        break;
      }
      case 'openNeoSettings':
        this.openSettings(window);
        break;
      case 'mainQuickSearch':
        if (this.#itemSelect.isVisual(window)) this.#itemSelect.cancel(window, session.selection);
        session.focusOwnership.markQuickSearchIntent();
        this.#viewActions.focusQuickSearch(window, session);
        break;
      case 'mainAdvancedSearch':
        if (this.#itemSelect.isVisual(window)) this.#itemSelect.cancel(window, session.selection);
        this.#viewActions.openAdvancedSearch(window, session);
        break;
      case 'findAllItems':
        this.openAllItemsPickerForSurface(window, session);
        break;
      case 'findCollectionItems':
        this.openCollectionItemsPickerForSurface(window, session);
        break;
      case 'switchTab':
        this.openTabPickerForSurface(window, session);
        break;
      case 'findNotes':
        this.openNotesPickerForSurface(window, session);
        break;
      case 'managePlugins':
        this.#pluginManager.open(window, session);
        break;
      case 'mainReturnContext':
        if (this.#itemSelect.isVisual(window)) this.#itemSelect.cancel(window, session.selection);
        void this.#returnContext.restore(window, session);
        break;
      case 'manageSelection':
        if (this.#itemSelect.isVisual(window)) this.#itemSelect.cancel(window, session.selection);
        this.#selectionPanel.open(window, session);
        break;
      case 'mainTrashItems': {
        const currentTarget = this.#itemSelect.isVisual(window)
          ? this.#itemSelect.currentTarget(window)
          : undefined;
        void this.#navigation
          .trashSelectedItems(window, session, currentTarget, this.keyGuideLanguage())
          .then((trashed) => {
            if (
              trashed &&
              currentTarget?.source === 'visual' &&
              this.#sessions.get(window) === session
            )
              this.#itemSelect.cancel(window, session.selection);
          });
        break;
      }
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
      case 'mainYankCitekey': {
        const visual = this.#itemSelect.isVisual(window);
        const currentTarget = visual ? this.#itemSelect.currentTarget(window) : undefined;
        const targets = MAIN_ITEM_TARGET.resolve(window, session, currentTarget);
        if (visual) this.#itemSelect.cancel(window, session.selection);
        this.#navigation.status(session, copyCitekeys(targets));
        break;
      }
      case 'mainOpenPDF':
        void this.#navigation.openPDF(
          window,
          session,
          mainCursorItem(window) ?? null,
          beforeMainReadingNavigation,
        );
        break;
      case 'mainActivate':
        this.#navigation.activate(window, session, beforeMainReadingNavigation);
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
      case 'removeTag': {
        const visual = this.#itemSelect.isVisual(window);
        const currentTarget = visual ? this.#itemSelect.currentTarget(window) : undefined;
        const targets = MAIN_ITEM_TARGET.resolve(window, session, currentTarget);
        if (visual) this.#itemSelect.cancel(window, session.selection);
        if (action === 'addTag') this.#tags.add(window, session, targets);
        else this.#tags.remove(window, session, targets);
        break;
      }
      case 'toggleTagFilter':
        this.#tags.toggleFilter(window, session);
        break;
      case 'clearTagFilters':
        this.#tags.clearFilters(window, session);
        break;
      case 'addToCollection':
      case 'removeFromCollection': {
        const visual = this.#itemSelect.isVisual(window);
        const currentTarget = visual ? this.#itemSelect.currentTarget(window) : undefined;
        if (visual) this.#itemSelect.cancel(window, session.selection);
        this.#collections.open(window, session, action === 'addToCollection', () =>
          MAIN_ITEM_TARGET.resolve(window, session, currentTarget),
        );
        break;
      }
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
        this.#itemSelect.toggleCurrentTarget(window, session.selection, shouldDebounce);
        break;
      case 'mainClearSelection':
        this.#itemSelect.clearSelection(window, session.selection);
        break;
      case 'mainCancelTarget':
        this.#itemSelect.cancelCurrentTarget(window, session.selection);
        break;
      case 'mainEnterSelect':
        this.#itemSelect.enter(window, session.selection);
        break;
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
        break;
      case 'mainSelectCancel':
        this.#itemSelect.cancel(window, session.selection);
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
