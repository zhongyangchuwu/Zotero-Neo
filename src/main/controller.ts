import type {
  CommandPaletteContext,
  MainWindowControllerApi,
  MainWindowControllerDependencies,
  MainWindow,
  ReaderSelectionContext,
  ReaderNoteCaptureReceipt,
  ReaderNoteCaptureResult,
} from '../core/contracts';
import { CleanupFailure } from '../core/cleanup';
import { ModuleHost } from '../core/module-host';
import { reportDiagnostic, reportDiagnosticError } from '../core/logging';
import type {
  NavigationCause,
  NavigationIntent,
  NavigationOperation,
  NavigationPort,
  NavigationResult,
  NavigationSurface,
} from '../navigation/types';
import type { ItemTargetSet } from '../core/item-target';
import type { ShowInLibraryHost } from '../operations/show-in-library';
import type { LibrarySelectionOptions } from './jump-history';
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
import {
  bindingsForMode,
  resolveBindings,
  type BindingMap,
  type BindingContext,
} from '../input/bindings';
import { compositionOwnsKey } from '../input/composition';
import { actionsForBindingMode } from '../input/binding-capabilities';
import { KEY_GUIDE_CONFIG, type KeyGuideLanguage } from '../input/key-guide-config';
import { isGuidePrefix } from '../input/key-guide';
import type { InputRuntime } from '../input/runtime';
import { keyString } from '../input/keys';
import { asElement, isEditableElement } from '../platform/dom';
import { copyCitekeys } from '../operations/citekeys';
import { t } from '../i18n';
import { resolveActiveSurface } from './active-surface';
import { MainWindowSession } from './session';
import { MainNavigation } from './navigation';
import { FuzzyPicker } from './picker';
import { NoteEditor, type NoteBindingMode } from './note-editor';
import { NOTE_COMMAND_PALETTE_ACTIONS } from './note-action-capabilities';
import { createTagModule, type TagModule } from '../modules/tags';
import { MainItemSelect } from './item-select';
import {
  mainLibrarySelection,
  openMainNote,
  mainItem,
  mainReaderForTab,
  selectedMainTabID,
  activateMainWindow,
  openMainIdentifierLookup,
  mainIdentifierLookupOwnsInput,
  mainTagScope,
} from '../toolkit/main';
import { mainCursorItem } from './action-targets';
import { MAIN_ITEM_TARGET } from './main-item-target';
import { NOTE_ITEM_TARGET } from './note-item-target';
import { createExtensionsModule, type ExtensionsModule } from '../modules/extensions';
import { SelectionPanel } from './selection-panel';
import { MainLocalFind } from './local-find';
import { MainViewActions } from './view-actions';
import { MainNavigationExecutor } from './jump-history';
import { createCollectionsModule, type CollectionsModule } from '../modules/collections';
import { installMainViewLifecycle } from './view-lifecycle';
import { createNotesProvider } from './picker/providers/notes';
import { appendReaderSelectionToNote, readerCaptureBaseItem } from './note-capture';
import { noteOwnerKey } from '../platform/zotero-items';

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
  readonly #modules = new WeakMap<
    MainWindowSession,
    {
      readonly host: ModuleHost;
      readonly tags: TagModule;
      readonly extensions: ExtensionsModule;
      readonly collections: CollectionsModule;
    }
  >();
  readonly #itemSelect: MainItemSelect;
  readonly #selectionPanel: SelectionPanel;
  readonly #localFind: MainLocalFind;
  readonly #viewActions: MainViewActions;
  readonly #navigationExecutor: MainNavigationExecutor;

  constructor(dependencies: MainWindowControllerDependencies) {
    this.#dependencies = dependencies;
    this.#navigation = new MainNavigation(dependencies.logger, (window) => this.rescan(window));
    this.#itemSelect = new MainItemSelect(dependencies.logger);
    this.#viewActions = new MainViewActions(dependencies.logger, this.#navigation);
    this.#navigationExecutor = new MainNavigationExecutor(
      dependencies.logger,
      this.#navigation,
      this.#viewActions,
      dependencies.reader,
      (window, session) => this.#sessions.get(window) === session,
    );
    this.#localFind = new MainLocalFind(
      (session, text) => this.#navigation.status(session, text),
      (window, session, cause, move) => {
        const operation: NavigationOperation = {
          dispatch: 'inline',
          start: () => ({
            kind: 'immediate',
            outcome: move()
              ? { kind: 'completed', evidence: 'settled-change' }
              : { kind: 'unchanged' },
          }),
        };
        this.executeNavigation(window, session, cause, 'main', operation, {
          mainPanel: 'items',
        });
      },
    );
    this.#selectionPanel = new SelectionPanel(
      dependencies.logger,
      this.#navigationExecutor,
      (window, session) => this.#itemSelect.refresh(window, session.selection),
    );
    this.#picker = new FuzzyPicker(
      dependencies.logger,
      this.#navigation,
      () => pickerMouseEnabled(dependencies.preferences),
      () => this.bindings(),
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

  private attachModules(window: MainWindow, session: MainWindowSession): void {
    const host = new ModuleHost(
      this.#dependencies.logger,
      () => this.#sessions.get(window) === session,
    );
    try {
      const tags = createTagModule(host, {
        logger: this.#dependencies.logger,
        preferences: this.#dependencies.preferences,
        status: (message) => this.#navigation.status(session, message),
        readFilter: () => [...this.#viewActions.state(window).tags],
        captureScopeTags: () => mainTagScope(window).getTags,
        applyFilter: (tags) => this.#viewActions.applyTagFilter(window, tags),
        choose: (options) => {
          if (session.picker.open) return null;
          const previous = session.picker.generation;
          void this.#picker.open(window, session, 'tags', options);
          const generation = session.picker.generation;
          if (generation === previous) return null;
          return () => {
            if (session.picker.generation === generation && session.picker.scope === 'tags')
              this.#picker.close(session);
          };
        },
      });
      const extensions = createExtensionsModule(host, {
        window,
        logger: this.#dependencies.logger,
        bindings: () => this.bindings(),
        themeRoot: (root) => session.theme.add(root),
      });
      const collections = createCollectionsModule(host, {
        window,
        logger: this.#dependencies.logger,
        status: (message) => this.#navigation.status(session, message),
        captureCurrent: () => {
          const generation = session.picker.generation;
          return () =>
            this.#sessions.get(window) === session &&
            !session.cleanup.disposed &&
            session.picker.generation === generation &&
            !window.closed;
        },
        choose: (source, confirm) => {
          if (session.picker.open) return null;
          const previous = session.picker.generation;
          let generation = -1;
          const isCurrent = () =>
            this.#sessions.get(window) === session &&
            !session.cleanup.disposed &&
            session.picker.open &&
            session.picker.generation === generation &&
            !window.closed;
          void this.#picker.open(window, session, 'collections', {
            source,
            confirm: (candidate) => confirm(candidate, isCurrent, session.picker.committedQuery),
          });
          generation = session.picker.generation;
          if (generation === previous) return null;
          return () => {
            if (session.picker.generation === generation && session.picker.scope === 'collections')
              this.#picker.close(session);
          };
        },
        navigate: async (collectionID) => {
          const execution = this.#navigationExecutor.execute(
            window,
            session,
            {
              cause: { kind: 'action', action: 'findCollections' },
              surface: 'main',
              context: { mainPanel: session.activePanel },
            },
            this.#navigationExecutor.collectionSelection(window, session, collectionID),
          );
          const result = execution.pending ? await execution.result : execution.result;
          if (result.kind === 'failed') throw result.error;
          if (result.kind !== 'completed' && result.kind !== 'unchanged')
            throw new Error('Collection navigation is no longer available');
        },
      });
      this.#modules.set(session, { host, tags, extensions, collections });
      session.cleanup.add(() => host.dispose());
    } catch (error) {
      const failure = new CleanupFailure();
      failure.run(() => host.dispose());
      failure.run(() => session.dispose());
      try {
        failure.rethrow();
      } catch (cleanupError) {
        reportDiagnosticError(
          this.#dependencies.logger,
          'Module attachment cleanup failed',
          cleanupError,
        );
      }
      throw error;
    }
  }

  private tagModule(session: MainWindowSession): TagModule {
    const modules = this.#modules.get(session);
    if (!modules) throw new Error('Window modules are not attached');
    return modules.tags;
  }

  private extensionsModule(session: MainWindowSession): ExtensionsModule {
    const modules = this.#modules.get(session);
    if (!modules) throw new Error('Window modules are not attached');
    return modules.extensions;
  }

  private collectionsModule(session: MainWindowSession): CollectionsModule {
    const modules = this.#modules.get(session);
    if (!modules) throw new Error('Window modules are not attached');
    return modules.collections;
  }

  addWindow(window: MainWindow): void {
    if (this.#sessions.has(window)) return;
    const session = new MainWindowSession(
      window,
      this.#dependencies.preferences,
      this.#dependencies.mayClaimInitialLibraryFocus?.() ?? false,
    );
    this.attachModules(window, session);
    this.#sessions.set(window, session);
    this.#itemSelect.addWindow(window, session.selection, session.interactionAppearance);
    session.cleanup.add(
      installMainViewLifecycle(window, this.#dependencies.logger, () => {
        if (this.#sessions.get(window) === session)
          this.#itemSelect.refresh(window, session.selection);
      }),
    );
    session.focusOwnership.start();
    this.#dependencies.logger.debug(`main window attached sessions=${this.#sessions.size}`);
    this.#dependencies.logger.diagnostic(`main window attached sessions=${this.#sessions.size}`);
    let readerScanFailed = false;
    const scan = (): void => {
      if (this.#sessions.get(window) !== session) return;
      try {
        this.rescan(window);
        if (readerScanFailed) {
          reportDiagnostic(
            this.#dependencies.logger,
            'Reader rescan recovered during Main window scan',
          );
          readerScanFailed = false;
        }
      } catch (error) {
        if (!readerScanFailed)
          reportDiagnosticError(
            this.#dependencies.logger,
            'Reader rescan failed during Main window scan',
            error,
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
      if (
        this.#sessions.get(window) === session &&
        session.picker.open &&
        !mainIdentifierLookupOwnsInput(window)
      )
        this.#picker.onKeyDown(event as KeyboardEventWithHandled, window, session);
    };
    session.cleanup.addEventListener(window.document, 'keydown', keydown, true);
    session.cleanup.addEventListener(window, 'keydown', pickerKeydown, true);
    session.cleanup.addEventListener(window.document, 'focusin', (event) => {
      if (this.#sessions.get(window) !== session) return;
      this.#navigation.observeFocus(window, session);
      if (session.settings.contains(event.target)) this.resetMainInput(window, session);
      this.syncSurfaceActivation(window, session);
    });
    session.cleanup.add(() => this.#noteEditor.clear(session));
    session.cleanup.add(() => this.#localFind.close(session));
    session.cleanup.add(() => this.#selectionPanel.close(session));
    session.cleanup.add(() => this.#picker.close(session));
  }

  removeWindow(window: MainWindow): void {
    const session = this.#sessions.get(window);
    if (!session) return;
    this.#sessions.delete(window);
    this.#dependencies.logger.debug(`main window detached sessions=${this.#sessions.size}`);
    this.#dependencies.logger.diagnostic(`main window detached sessions=${this.#sessions.size}`);
    const failure = new CleanupFailure();
    const modules = this.#modules.get(session);
    this.#modules.delete(session);
    if (modules) failure.run(() => modules.host.dispose());
    failure.run(() => this.#itemSelect.removeWindow(window));
    failure.run(() => session.dispose());
    failure.rethrow();
  }

  shutdown(): void {
    const failure = new CleanupFailure();
    for (const window of this.#sessions.keys()) failure.run(() => this.removeWindow(window));
    failure.rethrow();
  }

  openSettings(owner?: Window | null): boolean {
    const session = owner ? this.#sessions.get(owner as MainWindow) : undefined;
    const resolved =
      session ?? (this.#sessions.size === 1 ? this.#sessions.values().next().value : undefined);
    if (!resolved) return false;
    const window = resolved.window;
    this.#picker.close(resolved);
    this.extensionsModule(resolved).close();
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
    if (active.kind !== 'note') this.#noteEditor.deactivateInteraction(window, session);
    this.#dependencies.reader.deactivateInactive(
      window,
      active.kind === 'reader' ? active.tabID : null,
    );
  }

  private executeNavigation(
    window: MainWindow,
    session: MainWindowSession,
    cause: NavigationCause,
    surface: NavigationSurface,
    operation: NavigationOperation,
    context?: NavigationIntent['context'],
  ): void {
    this.#navigationExecutor.execute(
      window,
      session,
      context ? { cause, surface, context } : { cause, surface },
      operation,
    );
  }

  private executeImmediateNavigation(
    window: MainWindow,
    session: MainWindowSession,
    cause: NavigationCause,
    surface: NavigationSurface,
    move: () => boolean,
    context?: NavigationIntent['context'],
    admission?: NavigationOperation['admission'],
  ): void {
    this.executeNavigation(
      window,
      session,
      cause,
      surface,
      {
        dispatch: 'inline',
        ...(admission ? { admission } : {}),
        start: () => ({
          kind: 'immediate',
          outcome: move()
            ? { kind: 'completed', evidence: 'settled-change' }
            : { kind: 'unchanged' },
        }),
      },
      context,
    );
  }
  private executeTraversal(
    window: MainWindow,
    session: MainWindowSession,
    action: 'navigateBack' | 'navigateForward',
    surface: NavigationSurface,
    count: number,
  ): void {
    const direction = action === 'navigateBack' ? -1 : 1;
    this.#navigationExecutor.execute(
      window,
      session,
      { cause: { kind: 'action', action }, surface },
      this.#navigationExecutor.traversal(window, session, direction, count),
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

  openAddByIdentifier(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'mainAddByIdentifier', (window, session) => {
      this.#picker.close(session);
      if (this.#itemSelect.isVisual(window)) this.#itemSelect.cancel(window, session.selection);
      this.resetMainInput(window, session);
      try {
        if (!openMainIdentifierLookup(window))
          this.#navigation.status(
            session,
            t('status.identifierLookupUnavailable', this.keyGuideLanguage()),
          );
      } catch (error) {
        this.#dependencies.logger.debug(`add by identifier failed: ${String(error)}`);
        this.#navigation.status(
          session,
          t('status.identifierLookupFailed', this.keyGuideLanguage()),
        );
      }
    });
  }

  openAllItemsPicker(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'findAllItems', (window, session) =>
      this.openAllItemsPickerForSurface(window, session, 'reader'),
    );
  }

  openCollectionItemsPicker(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'findCollectionItems', (window, session) =>
      this.openCollectionItemsPickerForSurface(window, session, 'reader'),
    );
  }

  openNotesPicker(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'findNotes', (window, session) =>
      this.openNotesPickerForSurface(window, session, 'reader'),
    );
  }

  openPluginManager(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'managePlugins', (_window, session) =>
      this.extensionsModule(session).open('reader-normal'),
    );
  }

  openSettingsFromReader(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'openNeoSettings', (window) => this.openSettings(window));
  }

  navigateBackFromReader(ownerWindow: MainWindow | null, count = 1): void {
    this.withReaderWindow(ownerWindow, 'navigateBack', (window, session) =>
      this.executeTraversal(window, session, 'navigateBack', 'reader', count),
    );
  }

  navigateForwardFromReader(ownerWindow: MainWindow | null, count = 1): void {
    this.withReaderWindow(ownerWindow, 'navigateForward', (window, session) =>
      this.executeTraversal(window, session, 'navigateForward', 'reader', count),
    );
  }

  navigationForReader(ownerWindow: MainWindow | null): NavigationPort | null {
    if (!ownerWindow) return null;
    const session = this.#sessions.get(ownerWindow);
    return session ? this.#navigationExecutor.port(ownerWindow, session) : null;
  }

  openTabPicker(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'switchTab', (window, session) =>
      this.openTabPickerForSurface(window, session, 'reader'),
    );
  }

  closeReaderTab(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'closeCurrentTab', (window) =>
      this.#navigation.closePDF(window),
    );
  }

  cycleReaderTab(ownerWindow: MainWindow | null, direction: -1 | 1): void {
    this.withReaderWindow(
      ownerWindow,
      direction < 0 ? 'previousTab' : 'nextTab',
      (window, session) =>
        this.executeImmediateNavigation(
          window,
          session,
          { kind: 'action', action: direction < 0 ? 'previousTab' : 'nextTab' },
          'reader',
          () => this.#navigation.cycleTab(window, direction),
        ),
    );
  }

  showReaderItemInLibrary(ownerWindow: MainWindow | null, targets: ItemTargetSet<'reader'>): void {
    this.withReaderWindow(ownerWindow, 'showInLibrary', (window, session) => {
      void this.showInLibraryForSurface(window, session, targets, 'reader');
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
    if (present) this.tagModule(session).add(targets);
    else this.tagModule(session).remove(targets);
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
    const request = { source: 'reader', label: 'context item', resolveTargets } as const;
    if (present) this.collectionsModule(session).add(request);
    else this.collectionsModule(session).remove(request);
  }

  async captureReaderSelectionToNote(
    context: ReaderSelectionContext,
    ownerWindow: MainWindow | null,
  ): Promise<ReaderNoteCaptureResult> {
    if (!ownerWindow) {
      this.#dependencies.logger.debug('ignored Reader note capture: no owner window');
      return null;
    }
    const session = this.#sessions.get(ownerWindow);
    if (!session) {
      this.#dependencies.logger.debug('ignored Reader note capture: owner window detached');
      return null;
    }
    if (session.picker.open) {
      this.#navigation.status(session, '✗ Close the current picker before capturing');
      return null;
    }

    const snapshot: ReaderSelectionContext = Object.freeze({ ...context });
    const base = readerCaptureBaseItem(snapshot);
    if (!base || !Number.isInteger(base.libraryID) || base.libraryID <= 0) {
      this.#navigation.status(session, '✗ Reader item is unavailable');
      return null;
    }
    const libraryID = base.libraryID;
    let receipt: ReaderNoteCaptureReceipt | null = null;
    let saving = false;
    let closed = false;
    let retired = false;

    return await new Promise<ReaderNoteCaptureResult>((resolve) => {
      const settle = (): void => resolve(retired ? { retired: true, receipt } : receipt);
      void this.#picker.open(ownerWindow, session, 'notes', {
        source: createNotesProvider(ownerWindow, this.#dependencies.logger, {
          baseItem: base,
          libraryID,
        }),
        // Teardown cannot undo an admitted native save; settle with its actual outcome.
        onClose: (reason) => {
          closed = true;
          retired = reason === 'retire';
          if (!saving) settle();
        },
        confirm: async (candidate) => {
          saving = true;
          try {
            const note = Zotero.Items.get(Number(candidate.id));
            if (!note) throw new Error('Note target is unavailable');
            if (noteOwnerKey(note) !== candidate.group)
              throw new Error('Note source changed. Refresh the Notes source before confirming.');
            const noteTitle =
              note.getDisplayTitle?.().trim() || note.getNoteTitle?.().trim() || candidate.title;
            await appendReaderSelectionToNote(note, snapshot, libraryID);
            receipt = { noteID: note.id, noteTitle };
          } finally {
            saving = false;
            if (closed) settle();
          }
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
    activateMainWindow(window);
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
  private activeBindings(mode: BindingContext) {
    return bindingsForMode(this.bindings(), mode);
  }

  private bindingMode(window: MainWindow): Extract<BindingContext, 'main-normal' | 'main-select'> {
    return this.#itemSelect.isVisual(window) ? 'main-select' : 'main-normal';
  }
  private rescan = (window: MainWindow): void => this.#dependencies.reader.rescan(window);

  private onKeyDown(
    event: KeyboardEventWithHandled,
    window: MainWindow,
    session: MainWindowSession,
  ): void {
    if (this.#sessions.get(window) !== session) return;
    if (mainIdentifierLookupOwnsInput(window)) {
      this.resetMainInput(window, session);
      return;
    }
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
    if (this.extensionsModule(session).isOpen) {
      this.extensionsModule(session).handleKey(event);
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
      let active: { mode: BindingContext; bindings: BindingMap };
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

    return this.executeNoteSurfaceAction(action, window, session, undefined, count);
  }

  private executeNoteSurfaceAction(
    action: ActionId,
    window: MainWindow,
    session: MainWindowSession,
    resolvedTargets?: ItemTargetSet<'note'>,
    count = 1,
  ): boolean {
    switch (action) {
      case 'addTag':
      case 'removeTag': {
        const targets = resolvedTargets ?? NOTE_ITEM_TARGET.resolve(window);
        if (action === 'addTag') this.tagModule(session).add(targets);
        else this.tagModule(session).remove(targets);
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
        this.openMainItem(window, session, targets.items[0]!, 'note', action);
        return true;
      }
      case 'showInLibrary':
        void this.showInLibraryForSurface(
          window,
          session,
          resolvedTargets ?? NOTE_ITEM_TARGET.resolve(window),
          'note',
        );
        return true;
      case 'findAllItems':
        this.openAllItemsPickerForSurface(window, session, 'note');
        return true;
      case 'findCollectionItems':
        this.openCollectionItemsPickerForSurface(window, session, 'note');
        return true;
      case 'findNotes':
        this.openNotesPickerForSurface(window, session, 'note');
        return true;
      case 'managePlugins':
        this.extensionsModule(session).open('note-normal');
        return true;
      case 'openNeoSettings':
        this.openSettings(window);
        return true;
      case 'navigateBack':
      case 'navigateForward':
        this.executeTraversal(window, session, action, 'note', count);
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
        this.openTabPickerForSurface(window, session, 'note');
        return true;
      case 'closeCurrentTab':
        this.#navigation.closePDF(window);
        return true;
      case 'previousTab':
      case 'nextTab':
        this.executeImmediateNavigation(window, session, { kind: 'action', action }, 'note', () =>
          this.#navigation.cycleTab(window, action === 'previousTab' ? -1 : 1),
        );
        return true;
      default:
        return false;
    }
  }

  private async executeLibrarySelection(
    window: MainWindow,
    session: MainWindowSession,
    itemID: number,
    pane: ShowInLibraryHost,
    cause: NavigationCause,
    surface: NavigationSurface,
    options?: LibrarySelectionOptions,
  ): Promise<NavigationResult> {
    const operation = this.#navigationExecutor.librarySelection(itemID, pane, options);
    const execution = this.#navigationExecutor.execute(
      window,
      session,
      { cause, surface },
      operation,
    );
    return execution.pending ? await execution.result : execution.result;
  }
  private async confirmLibrarySelection(
    window: MainWindow,
    session: MainWindowSession,
    itemID: number,
    pane: ShowInLibraryHost,
    cause: NavigationCause,
    surface: NavigationSurface,
    options?: LibrarySelectionOptions,
  ): Promise<void> {
    const result = await this.executeLibrarySelection(
      window,
      session,
      itemID,
      pane,
      cause,
      surface,
      options,
    );
    if (result.kind === 'failed') throw result.error;
    if (result.kind === 'unavailable') throw new Error('Library selection is unavailable');
  }

  private async showInLibraryForSurface(
    window: MainWindow,
    session: MainWindowSession,
    targets: ItemTargetSet,
    surface: NavigationSurface = 'main',
  ): Promise<void> {
    const language = this.keyGuideLanguage();
    if (targets.missing || targets.total !== 1 || targets.items.length !== 1) {
      this.#navigation.status(session, t('status.showInLibraryUnavailable', language));
      return;
    }

    const pane = mainLibrarySelection(window);
    if (!pane?.selectItem) {
      this.#navigation.status(session, t('status.showInLibraryHostUnavailable', language));
      return;
    }

    try {
      const result = await this.executeLibrarySelection(
        window,
        session,
        targets.items[0]!.id,
        pane,
        { kind: 'action', action: 'showInLibrary' },
        surface,
      );
      if (this.#sessions.get(window) === session) {
        if (result.kind === 'completed')
          this.#navigation.status(session, t('status.showInLibraryComplete', language));
        else if (result.kind === 'failed') {
          this.#dependencies.logger.debug(`show in library failed: ${String(result.error)}`);
          this.#navigation.status(session, t('status.showInLibraryFailed', language));
        }
      }
    } catch (error) {
      this.#dependencies.logger.debug(`show in library failed: ${String(error)}`);
      if (this.#sessions.get(window) === session)
        this.#navigation.status(session, t('status.showInLibraryFailed', language));
    }
  }

  private openAllItemsPickerForSurface(
    window: MainWindow,
    session: MainWindowSession,
    surface: NavigationSurface = 'main',
  ): void {
    void this.#picker.open(window, session, 'all', {
      confirm: async (item) => {
        const pane = mainLibrarySelection(window);
        if (!pane?.selectItem) throw new Error('Library item selection is unavailable');
        await this.confirmLibrarySelection(
          window,
          session,
          Number(item.id),
          pane,
          { kind: 'action', action: 'findAllItems' },
          surface,
        );
      },
    });
  }

  private openCollectionItemsPickerForSurface(
    window: MainWindow,
    session: MainWindowSession,
    surface: NavigationSurface = 'main',
  ): void {
    void this.#picker.open(window, session, 'collection', {
      confirm: async (item) => {
        const pane = mainLibrarySelection(window);
        if (!pane?.selectItem) throw new Error('Library item selection is unavailable');
        await this.confirmLibrarySelection(
          window,
          session,
          Number(item.id),
          pane,
          { kind: 'action', action: 'findCollectionItems' },
          surface,
        );
      },
    });
  }

  private openNotesPickerForSurface(
    window: MainWindow,
    session: MainWindowSession,
    surface: NavigationSurface = 'main',
  ): void {
    let baseItem: Zotero.Item | null;
    if (surface === 'reader') {
      const tabID = selectedMainTabID(window);
      const reader = tabID ? mainReaderForTab(tabID) : null;
      baseItem = reader?.itemID ? (mainItem(reader.itemID) ?? null) : null;
    } else if (surface === 'note') {
      baseItem = NOTE_ITEM_TARGET.resolve(window).items[0] ?? null;
    } else {
      baseItem = mainCursorItem(window) ?? null;
    }
    void this.#picker.open(window, session, 'notes', {
      source: createNotesProvider(window, this.#dependencies.logger, { baseItem }),
      confirm: async (item, openInWindow) => {
        const pane = mainLibrarySelection(window);
        if (!pane?.selectItem) throw new Error('Library item selection is unavailable');
        const id = Number(item.id);
        await this.confirmLibrarySelection(
          window,
          session,
          id,
          pane,
          { kind: 'action', action: 'findNotes' },
          surface,
          {
            afterSelection: async () => {
              await openMainNote(window, id, openInWindow);
            },
          },
        );
      },
    });
  }

  private openTabPickerForSurface(
    window: MainWindow,
    session: MainWindowSession,
    surface: NavigationSurface = 'main',
  ): void {
    void this.#picker.open(window, session, 'tabs', {
      confirm: (item) => {
        this.executeImmediateNavigation(
          window,
          session,
          { kind: 'action', action: 'switchTab' },
          surface,
          () => this.#navigation.selectTab(window, String(item.id)),
        );
      },
    });
  }

  private openMainItem(
    window: MainWindow,
    session: MainWindowSession,
    item: Zotero.Item | null,
    surface: NavigationSurface = 'main',
    cause: ActionId = 'mainOpenPDF',
  ): void {
    const operation: NavigationOperation = {
      dispatch: 'serial-navigation',
      start: (attempt) => ({
        kind: 'deferred',
        settled: this.#navigation
          .openPDF(window, session, item, () => attempt.isCurrent())
          .then((opened) =>
            opened ? { kind: 'completed', evidence: 'settled-change' } : { kind: 'unchanged' },
          ),
      }),
    };
    this.executeNavigation(
      window,
      session,
      { kind: 'action', action: cause },
      surface,
      operation,
      surface === 'main' ? { mainPanel: this.#navigation.panel(window, session) } : undefined,
    );
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
      case 'mainAddByIdentifier':
        this.openAddByIdentifier(window);
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
      case 'findCollections':
        this.collectionsModule(session).find();
        break;
      case 'addItemsToCurrentCollection':
        this.collectionsModule(session).addItems();
        break;
      case 'moveCollection':
        this.collectionsModule(session).move();
        break;
      case 'createCollection':
        this.collectionsModule(session).create();
        break;
      case 'renameCollection':
        this.collectionsModule(session).rename();
        break;
      case 'deleteCollection':
        this.collectionsModule(session).removeCollection();
        break;
      case 'switchTab':
        this.openTabPickerForSurface(window, session);
        break;
      case 'findNotes':
        this.openNotesPickerForSurface(window, session);
        break;
      case 'managePlugins':
        this.extensionsModule(session).open('main-normal');
        break;
      case 'navigateBack':
      case 'navigateForward':
        if (this.#itemSelect.isVisual(window)) this.#itemSelect.cancel(window, session.selection);
        this.executeTraversal(window, session, action, 'main', count);
        break;
      case 'manageSelection':
        if (this.#itemSelect.isVisual(window)) this.#itemSelect.cancel(window, session.selection);
        this.#navigation.panel(window, session);
        this.#selectionPanel.open(window, session);
        break;
      case 'mainTrashItems': {
        const currentTarget = this.#itemSelect.isVisual(window)
          ? this.#itemSelect.currentTarget(window)
          : undefined;
        const visualRevision =
          currentTarget?.source === 'visual' ? this.#itemSelect.visualRevision(window) : null;
        void this.#navigation
          .trashSelectedItems(window, session, currentTarget, this.keyGuideLanguage())
          .then((trashed) => {
            if (trashed && visualRevision !== null && this.#sessions.get(window) === session)
              this.#itemSelect.cancelIfVisualRevision(window, visualRevision, session.selection);
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
        this.openMainItem(window, session, mainCursorItem(window) ?? null, 'main', action);
        break;
      case 'mainActivate':
        if (this.#navigation.panel(window, session) === 'collections') {
          this.executeNavigation(
            window,
            session,
            { kind: 'action', action },
            'main',
            this.#navigationExecutor.scopeActivation(window, session),
            { mainPanel: 'collections' },
          );
        } else this.openMainItem(window, session, mainCursorItem(window) ?? null, 'main', action);
        break;
      case 'closeCurrentTab':
        this.#navigation.closePDF(window);
        break;
      case 'previousTab':
      case 'nextTab':
        this.executeImmediateNavigation(window, session, { kind: 'action', action }, 'main', () =>
          this.#navigation.cycleTab(window, action === 'previousTab' ? -1 : 1),
        );
        break;
      case 'addTag':
      case 'removeTag': {
        const visual = this.#itemSelect.isVisual(window);
        const currentTarget = visual ? this.#itemSelect.currentTarget(window) : undefined;
        const targets = MAIN_ITEM_TARGET.resolve(window, session, currentTarget);
        if (visual) this.#itemSelect.cancel(window, session.selection);
        if (action === 'addTag') this.tagModule(session).add(targets);
        else this.tagModule(session).remove(targets);
        break;
      }
      case 'toggleTagFilter':
        this.tagModule(session).toggleFilter();
        break;
      case 'clearTagFilters':
        this.tagModule(session).clearFilters();
        break;
      case 'addToCollection':
      case 'removeFromCollection':
      case 'moveToCollection': {
        const visual = this.#itemSelect.isVisual(window);
        const currentTarget = visual ? this.#itemSelect.currentTarget(window) : undefined;
        if (visual) this.#itemSelect.cancel(window, session.selection);
        const resolveTargets = () => MAIN_ITEM_TARGET.resolve(window, session, currentTarget);
        const request = {
          source: 'main',
          label: session.selection.size ? 'Selection' : 'context item',
          resolveTargets,
        } as const;
        const collections = this.collectionsModule(session);
        if (action === 'moveToCollection') collections.moveItems(request);
        else if (action === 'addToCollection') collections.add(request);
        else collections.remove(request);
        break;
      }
      case 'mainNavDown':
      case 'mainNavUp': {
        const panel = this.#navigation.panel(window, session);
        this.executeImmediateNavigation(
          window,
          session,
          { kind: 'action', action },
          'main',
          () => {
            return this.#navigation.navigate(
              window,
              session,
              action === 'mainNavDown' ? 1 : -1,
              count,
              shouldDebounce,
            );
          },
          { mainPanel: panel },
          'motion',
        );
        break;
      }
      case 'mainNavFirst':
      case 'mainNavLast': {
        const panel = this.#navigation.panel(window, session);
        this.executeImmediateNavigation(
          window,
          session,
          { kind: 'action', action },
          'main',
          () => {
            return this.#navigation.navigate(
              window,
              session,
              action === 'mainNavFirst' ? 'first' : 'last',
              count,
            );
          },
          { mainPanel: panel },
        );
        break;
      }
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
