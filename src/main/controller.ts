import type {
  CommandPaletteContext,
  MainWindowControllerApi,
  MainWindowControllerDependencies,
  MainWindow,
} from '../core/contracts';
import { CleanupFailure, type Cleanup } from '../core/cleanup';
import type { BuiltinModuleScope } from '../core/module-runtime';
import { reportDiagnostic, reportDiagnosticError } from '../core/logging';
import type {
  NavigationCause,
  NavigationIntent,
  NavigationOperation,
  NavigationPort,
  NavigationSurface,
} from '../navigation/types';
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
import {
  bindingsForMode,
  resolveBindings,
  type BindingMap,
  type BindingContext,
} from '../input/bindings';
import { compositionOwnsKey } from '../input/composition';
import { actionsForBindingMode } from '../input/binding-capabilities';
import {
  KEY_GUIDE_CONFIG,
  keyGuideTimeout,
  type KeyGuideLanguage,
} from '../input/key-guide-config';
import type { InputRuntime } from '../input/runtime';
import { keyString } from '../input/keys';
import { asElement, isEditableElement } from '../platform/dom';
import { resolveActiveSurface } from './active-surface';
import { MainWindowSession } from './session';
import { MainNavigation } from './navigation';
import { FuzzyPicker } from './picker';
import { NoteEditor, type NoteBindingMode } from './note-editor';
import { NOTE_COMMAND_PALETTE_ACTIONS } from './note-action-capabilities';
import { createTagModule, type TagModule } from '../modules/tags';
import { createWorksetsModule, type WorksetsModule } from '../modules/worksets';
import { createLibraryModule, type LibraryModule } from '../modules/library';
import { createNotesModule, type NotesModule } from '../modules/notes';
import { createWorkspaceModule, type WorkspaceModule } from '../modules/workspace';
import type { PickerOpenOptions } from './picker/types';
import {
  mainLibrarySelection,
  mainItem,
  mainReaderForTab,
  selectedMainTabID,
  activateMainWindow,
  mainIdentifierLookupOwnsInput,
  mainTagScope,
  currentMainItemCursorRef,
  mainItemCursorRow,
  mainSelectedItemRefs,
  mainTreeFocused,
  selectMainItemCursorAnchor,
  mainViewFilterState,
  applyMainQuickSearch,
  applyMainTagFilter,
  closeMainAdvancedSearch,
} from '../toolkit/main';
import { mainCursorItem } from './action-targets';
import { MAIN_ITEM_TARGET } from './main-item-target';
import { NOTE_ITEM_TARGET } from './note-item-target';
import { createExtensionsModule, type ExtensionsModule } from '../modules/extensions';
import { MainItemStateDecoration } from './item-state-decoration';
import { MainNavigationExecutor } from './jump-history';
import { createCollectionsModule, type CollectionsModule } from '../modules/collections';
import { installMainViewLifecycle } from './view-lifecycle';

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
  readonly #retiredSessions = new WeakSet<MainWindowSession>();
  readonly #navigation: MainNavigation;
  readonly #picker: FuzzyPicker;
  readonly #noteEditor: NoteEditor;
  readonly #modules = new WeakMap<
    MainWindowSession,
    {
      readonly scope: BuiltinModuleScope;
      readonly tags: TagModule | null;
      readonly extensions: ExtensionsModule | null;
      readonly collections: CollectionsModule | null;
      readonly worksets: WorksetsModule | null;
      readonly library: LibraryModule | null;
      readonly notes: NotesModule | null;
      readonly workspace: WorkspaceModule | null;
    }
  >();
  readonly #itemDecorations = new MainItemStateDecoration();
  readonly #navigationExecutor: MainNavigationExecutor;

  constructor(dependencies: MainWindowControllerDependencies) {
    this.#dependencies = dependencies;
    this.#navigation = new MainNavigation(dependencies.logger, (window) => this.rescan(window));
    this.#navigationExecutor = new MainNavigationExecutor(
      dependencies.logger,
      this.#navigation,
      {
        state: mainViewFilterState,
        applyQuickSearch: applyMainQuickSearch,
        applyTagFilter: applyMainTagFilter,
        closeAdvancedSearch: closeMainAdvancedSearch,
      },
      dependencies.reader,
      (window, session) => this.#sessions.get(window) === session,
      (session) =>
        session.picker.open || (this.#modules.get(session)?.worksets?.isPanelOpen ?? false),
    );
    this.#picker = new FuzzyPicker(
      dependencies.logger,
      this.#navigation,
      () => pickerMouseEnabled(dependencies.preferences),
      () => this.bindings(),
      (session) => this.#sessions.get(session.window) === session && !session.cleanup.disposed,
    );
    this.#noteEditor = new NoteEditor(
      dependencies.logger,
      this.#navigation,
      (session) => this.sessionBindings(session),
      {
        refresh: (window, session) => {
          this.refreshKeyGuide(window, session, session.note.input);
        },
        clear: (window, session) => this.clearKeyGuide(window, session),
      },
      (session) => this.#modules.get(session)?.notes?.editing ?? null,
      (session) => this.#sessions.get(session.window) === session && !session.cleanup.disposed,
    );
  }

  private attachModules(window: MainWindow, session: MainWindowSession): void {
    const scope = this.#dependencies.modules.createScope(
      'main',
      window,
      () => this.#sessions.get(window) === session && !session.cleanup.disposed,
    );
    const host = scope.host;
    session.cleanup.add(() => scope.dispose());
    try {
      const tags = scope.activate('tags', () =>
        createTagModule(host, {
          logger: this.#dependencies.logger,
          preferences: this.#dependencies.preferences,
          status: (message) => this.#navigation.status(session, message),
          readFilter: () => [...mainViewFilterState(window).tags],
          captureScopeTags: () => mainTagScope(window).getTags,
          applyFilter: (tags) => applyMainTagFilter(window, tags),
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
        }),
      );
      if (this.#sessions.get(window) !== session || session.cleanup.disposed) return;
      const extensions = scope.activate('extensions', () =>
        createExtensionsModule(host, {
          window,
          logger: this.#dependencies.logger,
          bindings: () => this.bindings(),
          themeRoot: (root) => session.theme.add(root),
        }),
      );
      if (this.#sessions.get(window) !== session || session.cleanup.disposed) return;
      const collections = scope.activate('collections', () =>
        createCollectionsModule(host, {
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
              if (
                session.picker.generation === generation &&
                session.picker.scope === 'collections'
              )
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
        }),
      );
      if (this.#sessions.get(window) !== session || session.cleanup.disposed) return;
      const worksets = scope.activate('worksets', () =>
        createWorksetsModule(host, {
          window,
          logger: this.#dependencies.logger,
          appearance: session.interactionAppearance,
          themeRoot: (root) => session.theme.add(root),
          refreshItemDecorations: () => this.#itemDecorations.refresh(window),
          prepareSelectionPanel: () => {
            this.#navigation.panel(window, session);
          },
          revealItem: (itemID, isCurrent) => {
            const pane = mainLibrarySelection(window);
            if (!pane?.selectItem) return null;
            return this.#navigationExecutor.execute(
              window,
              session,
              {
                cause: { kind: 'event', event: 'main-selection-panel.reveal' },
                surface: 'main',
                context: { mainPanel: 'items', isCurrent },
              },
              this.#navigationExecutor.librarySelection(itemID, pane),
            );
          },
        }),
      );
      if (this.#sessions.get(window) !== session || session.cleanup.disposed) return;
      const library = scope.activate('library', () =>
        createLibraryModule(host, {
          window,
          logger: this.#dependencies.logger,
          status: (message, milliseconds) =>
            this.#navigation.status(session, message, milliseconds),
          language: () => this.keyGuideLanguage(),
          panel: () => this.#navigation.panel(window, session),
          focusPanel: (panel) => this.#navigation.focusPanel(window, session, panel),
          themeRoot: (root) => session.theme.add(root),
          leaveVisual: () => {
            if (worksets?.isVisual) worksets?.cancel();
          },
          prepareQuickSearch: () => session.focusOwnership.markQuickSearchIntent(),
          prepareIdentifierLookup: () => {
            this.#picker.close(session);
            if (worksets?.isVisual) worksets?.cancel();
            this.resetMainInput(window, session);
          },
          choose: (kind, options) => {
            if (session.picker.open) return null;
            const previous = session.picker.generation;
            void this.#picker.open(window, session, kind, options);
            const generation = session.picker.generation;
            if (generation === previous) return null;
            return () => {
              if (session.picker.generation === generation && session.picker.scope === kind)
                this.#picker.close(session);
            };
          },
          selectItem: async (itemID, cause, surface, isCurrent) => {
            const pane = mainLibrarySelection(window);
            if (!pane?.selectItem) throw new Error('Library item selection is unavailable');
            const execution = this.#navigationExecutor.execute(
              window,
              session,
              { cause, surface, context: { isCurrent } },
              this.#navigationExecutor.librarySelection(itemID, pane),
            );
            return execution.pending ? await execution.result : execution.result;
          },
          executeNavigation: (intent, operation) =>
            this.#navigationExecutor.execute(window, session, intent, operation),
          scopeActivation: () => this.#navigationExecutor.scopeActivation(window, session),
        }),
      );
      if (this.#sessions.get(window) !== session || session.cleanup.disposed) return;
      const chooseNotes = (options: PickerOpenOptions): Cleanup | null => {
        if (session.picker.open) return null;
        const generation = session.picker.generation + 1;
        void this.#picker.open(window, session, 'notes', options);
        if (
          session.picker.generation !== generation ||
          !session.picker.open ||
          session.picker.scope !== 'notes'
        )
          return null;
        return () => {
          if (session.picker.generation === generation && session.picker.scope === 'notes')
            this.#picker.close(session);
        };
      };
      const notes = scope.activate('notes', () =>
        createNotesModule(host, {
          window,
          logger: this.#dependencies.logger,
          status: (message, milliseconds) =>
            this.#navigation.status(session, message, milliseconds),
          choose: chooseNotes,
          selectNote: async (itemID, surface, isCurrent, afterSelection) => {
            const pane = mainLibrarySelection(window);
            if (!pane?.selectItem) throw new Error('Library item selection is unavailable');
            const execution = this.#navigationExecutor.execute(
              window,
              session,
              { cause: { kind: 'action', action: 'findNotes' }, surface, context: { isCurrent } },
              this.#navigationExecutor.librarySelection(itemID, pane, { afterSelection }),
            );
            return execution.pending ? await execution.result : execution.result;
          },
        }),
      );
      if (this.#sessions.get(window) !== session || session.cleanup.disposed) return;
      const workspace = scope.activate('workspace', () =>
        createWorkspaceModule(host, {
          window,
          logger: this.#dependencies.logger,
          language: () => this.keyGuideLanguage(),
          status: (message, milliseconds) =>
            this.#navigation.status(session, message, milliseconds),
          choose: (options) => {
            if (session.picker.open) return null;
            const generation = session.picker.generation + 1;
            void this.#picker.open(window, session, 'tabs', options);
            if (
              session.picker.generation !== generation ||
              !session.picker.open ||
              session.picker.scope !== 'tabs'
            )
              return null;
            return () => {
              if (session.picker.generation === generation && session.picker.scope === 'tabs')
                this.#picker.close(session);
            };
          },
          selectTab: (id) => this.#navigation.selectTab(window, id),
          cycleTab: (direction) => this.#navigation.cycleTab(window, direction),
          closeTab: () => this.#navigation.closePDF(window),
          navigate: (cause, surface, move, isCurrent) =>
            this.executeImmediateNavigation(window, session, cause, surface, move, { isCurrent }),
          selectInLibrary: (itemID, surface, isCurrent) => {
            const pane = mainLibrarySelection(window);
            if (!pane?.selectItem) return null;
            const execution = this.#navigationExecutor.execute(
              window,
              session,
              {
                cause: { kind: 'action', action: 'showInLibrary' },
                surface,
                context: { isCurrent },
              },
              this.#navigationExecutor.librarySelection(itemID, pane),
            );
            return execution.pending ? execution.result : Promise.resolve(execution.result);
          },
        }),
      );
      if (this.#sessions.get(window) !== session || session.cleanup.disposed) return;
      this.#modules.set(session, {
        scope,
        tags,
        extensions,
        collections,
        worksets,
        library,
        notes,
        workspace,
      });
    } catch (error) {
      const failure = new CleanupFailure();
      failure.run(() => scope.dispose());
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

  private tagModule(session: MainWindowSession): TagModule | null {
    return this.#modules.get(session)?.tags ?? null;
  }

  private extensionsModule(session: MainWindowSession): ExtensionsModule | null {
    return this.#modules.get(session)?.extensions ?? null;
  }

  private collectionsModule(session: MainWindowSession): CollectionsModule | null {
    return this.#modules.get(session)?.collections ?? null;
  }

  private worksetsModule(session: MainWindowSession): WorksetsModule | null {
    return this.#modules.get(session)?.worksets ?? null;
  }

  private libraryModule(session: MainWindowSession): LibraryModule | null {
    return this.#modules.get(session)?.library ?? null;
  }

  private notesModule(session: MainWindowSession): NotesModule | null {
    return this.#modules.get(session)?.notes ?? null;
  }

  private workspaceModule(session: MainWindowSession): WorkspaceModule | null {
    return this.#modules.get(session)?.workspace ?? null;
  }

  private cancelMainCurrentTarget(window: MainWindow, session: MainWindowSession): void {
    const worksets = this.#modules.get(session)?.worksets;
    if (worksets?.isVisual) {
      worksets?.cancel();
      return;
    }
    if (mainSelectedItemRefs(window).length <= 1) return;
    const row = mainItemCursorRow(window);
    if (row !== undefined && selectMainItemCursorAnchor(window, row))
      this.#itemDecorations.refresh(window);
  }

  addWindow(window: MainWindow): void {
    if (this.#sessions.has(window)) return;
    const session = new MainWindowSession(
      window,
      this.#dependencies.preferences,
      this.#dependencies.modules,
      this.#dependencies.mayClaimInitialLibraryFocus?.() ?? false,
    );
    this.#sessions.set(window, session);
    const isCurrent = (): boolean =>
      this.#sessions.get(window) === session && !session.cleanup.disposed;
    const addListener = (
      target: EventTarget,
      type: string,
      listener: EventListener,
      capture = false,
    ): void => {
      try {
        target.addEventListener(type, listener, capture);
      } catch (error) {
        try {
          target.removeEventListener(type, listener, capture);
        } catch {
          // Keep the acquisition failure authoritative.
        }
        throw error;
      }
      session.cleanup.add(() => target.removeEventListener(type, listener, capture));
    };
    try {
      this.attachModules(window, session);
      if (!isCurrent()) return;
      const decoration = this.#itemDecorations.addWindow(
        window,
        () => this.#modules.get(session)?.worksets?.marks ?? null,
        session.interactionAppearance,
        isCurrent,
      );
      if (!isCurrent()) {
        decoration.dispose();
        return;
      }
      session.itemDecoration = decoration;
      // Cursor anchoring belongs to Main even when worksets are absent.
      const cursorRow = mainItemCursorRow(window);
      if (!isCurrent()) return;
      if (cursorRow !== undefined) {
        const cursor = currentMainItemCursorRef(window);
        if (!isCurrent()) return;
        const selected = cursor ? mainSelectedItemRefs(window) : [];
        if (!isCurrent()) return;
        if (cursor && selected.length === 0) selectMainItemCursorAnchor(window, cursorRow);
      }
      if (!isCurrent()) return;
      session.cleanup.add(
        installMainViewLifecycle(window, this.#dependencies.logger, () => {
          if (this.#sessions.get(window) === session) {
            this.#modules.get(session)?.worksets?.refresh();
            this.#itemDecorations.refresh(window);
          }
        }),
      );
      if (!isCurrent()) return;
      session.focusOwnership.start();
      if (!isCurrent()) return;
      this.#dependencies.logger.debug(`main window attached sessions=${this.#sessions.size}`);
      if (!isCurrent()) return;
      this.#dependencies.logger.diagnostic(`main window attached sessions=${this.#sessions.size}`);
      if (!isCurrent()) return;
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
        if (!isCurrent()) return;
        this.#noteEditor.sync(
          window,
          session,
          this.notesModule(session) !== null && noteEditorEnabled(this.#dependencies.preferences),
          (action, count, target, mode, bindings) =>
            this.executeFromNote(action, count, target, mode, bindings, window, session),
        );
        if (!isCurrent()) return;
        this.syncSurfaceActivation(window, session);
      };
      scan();
      if (!isCurrent()) return;
      const interval = window.setInterval(scan, 1000);
      session.cleanup.add(() => window.clearInterval(interval));
      if (!isCurrent()) return;
      for (let count = 1; count <= 4; count += 1) {
        const timer = window.setTimeout(scan, count * 250);
        session.cleanup.add(() => window.clearTimeout(timer));
        if (!isCurrent()) return;
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
      addListener(window.document, 'keydown', keydown, true);
      if (!isCurrent()) return;
      addListener(window, 'keydown', pickerKeydown, true);
      if (!isCurrent()) return;
      addListener(window.document, 'focusin', (event) => {
        if (this.#sessions.get(window) !== session) return;
        this.#navigation.observeFocus(window, session);
        if (session.settings.contains(event.target)) this.resetMainInput(window, session);
        this.syncSurfaceActivation(window, session);
      });
      if (!isCurrent()) return;
      session.cleanup.add(() => this.#noteEditor.clear(session));
      session.cleanup.add(() => this.#picker.close(session));
    } catch (error) {
      try {
        this.removeSession(window, session);
      } catch (cleanupError) {
        reportDiagnosticError(
          this.#dependencies.logger,
          'Main attachment cleanup failed',
          cleanupError,
        );
      }
      throw error;
    }
  }

  removeWindow(window: MainWindow): void {
    const session = this.#sessions.get(window);
    if (session) this.removeSession(window, session);
  }

  private removeSession(window: MainWindow, session: MainWindowSession): void {
    if (this.#retiredSessions.has(session)) return;
    this.#retiredSessions.add(session);
    if (this.#sessions.get(window) === session) this.#sessions.delete(window);
    const modules = this.#modules.get(session);
    this.#modules.delete(session);
    const decoration = session.itemDecoration;
    session.itemDecoration = null;
    decoration?.retire();
    const failure = new CleanupFailure();
    failure.run(() =>
      this.#dependencies.logger.debug(`main window detached sessions=${this.#sessions.size}`),
    );
    failure.run(() =>
      this.#dependencies.logger.diagnostic(`main window detached sessions=${this.#sessions.size}`),
    );
    if (modules) failure.run(() => modules.scope.dispose());
    failure.run(() => decoration?.dispose());
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
    this.extensionsModule(resolved)?.close();
    this.worksetsModule(resolved)?.closePanel();
    this.libraryModule(resolved)?.closeLocalFind();
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
    if (this.worksetsModule(session)?.isVisual) this.worksetsModule(session)?.leave();
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
    this.withReaderWindow(ownerWindow, 'mainAddByIdentifier', (_window, session) => {
      this.libraryModule(session)?.addByIdentifier('reader');
    });
  }

  openAllItemsPicker(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'findAllItems', (_window, session) =>
      this.libraryModule(session)?.findItems('all', 'reader'),
    );
  }

  openCollectionItemsPicker(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'findCollectionItems', (_window, session) =>
      this.libraryModule(session)?.findItems('collection', 'reader'),
    );
  }

  openNotesPicker(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'findNotes', (window, session) =>
      this.openNotesPickerForSurface(window, session, 'reader'),
    );
  }

  openPluginManager(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'managePlugins', (_window, session) =>
      this.extensionsModule(session)?.open('reader-normal'),
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
    this.withReaderWindow(ownerWindow, 'switchTab', (_window, session) =>
      this.workspaceModule(session)?.switchTab('reader'),
    );
  }

  closeReaderTab(ownerWindow: MainWindow | null): void {
    this.withReaderWindow(ownerWindow, 'closeCurrentTab', (_window, session) =>
      this.workspaceModule(session)?.closeTab('reader'),
    );
  }

  cycleReaderTab(ownerWindow: MainWindow | null, direction: -1 | 1): void {
    this.withReaderWindow(
      ownerWindow,
      direction < 0 ? 'previousTab' : 'nextTab',
      (_window, session) => this.workspaceModule(session)?.cycleTab(direction, 'reader'),
    );
  }

  showReaderItemInLibrary(ownerWindow: MainWindow | null, targets: ItemTargetSet<'reader'>): void {
    this.withReaderWindow(ownerWindow, 'showInLibrary', (_window, session) => {
      this.workspaceModule(session)?.showInLibrary(targets, 'reader');
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
    if (present) this.tagModule(session)?.add(targets);
    else this.tagModule(session)?.remove(targets);
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
    if (present) this.collectionsModule(session)?.add(request);
    else this.collectionsModule(session)?.remove(request);
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
      actions:
        context.mode === 'normal'
          ? context.actions
          : context.actions.filter(
              (action) =>
                this.#modules.get(session)?.scope.available(context.bindingMode, action) === true,
            ),
      execute: (action, count) => {
        if (this.#sessions.get(window) !== session) {
          this.#dependencies.logger.debug('ignored command palette action: owner window detached');
          return;
        }
        if (
          context.mode !== 'normal' &&
          !this.#modules.get(session)?.scope.available(context.bindingMode, action)
        )
          return;
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

  private sessionBindings(session: MainWindowSession): BindingMap {
    const bindings = this.bindings();
    return this.#modules.get(session)?.scope.filterBindings(bindings) ?? bindings;
  }

  private activeBindings(mode: BindingContext, session: MainWindowSession) {
    return bindingsForMode(this.sessionBindings(session), mode);
  }

  private bindingMode(window: MainWindow): Extract<BindingContext, 'main-normal' | 'main-select'> {
    const session = this.#sessions.get(window);
    return session && this.#modules.get(session)?.worksets?.isVisual
      ? 'main-select'
      : 'main-normal';
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
    if (this.libraryModule(session)?.isLocalFindOpen) {
      this.libraryModule(session)?.handleLocalFindKey(event);
      return;
    }
    if (this.worksetsModule(session)?.isPanelOpen) {
      this.worksetsModule(session)?.handlePanelKey(event);
      return;
    }
    if (this.extensionsModule(session)?.isOpen) {
      this.extensionsModule(session)?.handleKey(event);
      return;
    }
    if (session.picker.open) {
      this.#picker.onKeyDown(event, window, session);
      return;
    }
    if (
      this.notesModule(session) !== null &&
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
    // Embedded Reader events still reach their view listener. Blurring its Flash input here
    // would cancel the interaction before the Reader can handle Escape or composition.
    if (
      active?.localName === 'browser' &&
      target?.ownerDocument &&
      target.ownerDocument !== window.document
    )
      return;
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
    if (this.worksetsModule(session)?.isVisual && !mainTreeFocused(window, 'items')) {
      this.deactivateMainSurface(window, session);
      return;
    }
    const key = keyString(event);
    if (!key) return;
    const mode = this.bindingMode(window);
    const bindings = this.activeBindings(mode, session);
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
      if (session.input.keyBuffer) {
        session.input.scheduleReset(KEY_GUIDE_CONFIG.idleTimeoutMs, () =>
          this.clearKeyGuide(window, session),
        );
      }
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
        (!mainTreeFocused(window, 'items') ||
          !(this.worksetsModule(session)?.isVisual || mainSelectedItemRefs(window).length > 1))
      ) {
        this.clearKeyGuide(window, session);
        return;
      }
      if (decision.action === 'mainEnterSelect' && !mainTreeFocused(window, 'items')) {
        this.clearKeyGuide(window, session);
        return;
      }
      if (decision.action === 'mainToggleSelection' && !mainTreeFocused(window, 'items')) {
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
    const timeoutMs = keyGuideTimeout(decision);
    if (timeoutMs !== null) {
      session.input.schedule(decision, timeoutMs, (resolved) => {
        this.clearKeyGuide(window, session);
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
        active = { mode, bindings: this.activeBindings(mode, session) };
      }
      const config = keyGuideConfig(this.#dependencies.preferences);
      return {
        input,
        mode: active.mode,
        bindings: active.bindings,
        enabled:
          config.enabled &&
          (fromNote
            ? noteEditorEnabled(this.#dependencies.preferences) && active.mode === 'note-normal'
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
    if (!this.#modules.get(session)?.scope.available(bindingMode, action)) return false;
    const local = this.#noteEditor.executeAction(action, target, window, session, count);
    if (local !== null) return local;

    if (action === 'openCommandPalette') {
      const noteTargets = NOTE_ITEM_TARGET.resolve(window);
      const isEditorCurrent = this.#noteEditor.captureCurrent(session);
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
          if (!isEditorCurrent()) return;
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
        if (action === 'addTag') this.tagModule(session)?.add(targets);
        else this.tagModule(session)?.remove(targets);
        return true;
      }
      case 'mainYankCitekey':
        this.libraryModule(session)?.yankCitekeys(
          resolvedTargets ?? NOTE_ITEM_TARGET.resolve(window),
        );
        return true;
      case 'mainOpenPDF': {
        const targets = resolvedTargets ?? NOTE_ITEM_TARGET.resolve(window);
        if (targets.missing || targets.items.length !== 1) {
          this.#navigation.status(session, '✗ Note item is unavailable');
          return true;
        }
        this.libraryModule(session)?.openItem(targets.items[0]!, 'note');
        return true;
      }
      case 'showInLibrary':
        this.workspaceModule(session)?.showInLibrary(
          resolvedTargets ?? NOTE_ITEM_TARGET.resolve(window),
          'note',
        );
        return true;
      case 'findAllItems':
        this.libraryModule(session)?.findItems('all', 'note');
        return true;
      case 'findCollectionItems':
        this.libraryModule(session)?.findItems('collection', 'note');
        return true;
      case 'findNotes':
        this.openNotesPickerForSurface(window, session, 'note');
        return true;
      case 'managePlugins':
        this.extensionsModule(session)?.open('note-normal');
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
        this.workspaceModule(session)?.switchTab('note');
        return true;
      case 'closeCurrentTab':
        this.workspaceModule(session)?.closeTab('note');
        return true;
      case 'previousTab':
      case 'nextTab':
        this.workspaceModule(session)?.cycleTab(action === 'previousTab' ? -1 : 1, 'note');
        return true;
      default:
        return false;
    }
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
    this.notesModule(session)?.findNotes(baseItem, surface);
  }

  private execute(
    action: ActionId,
    window: MainWindow,
    session: MainWindowSession,
    count: number,
    shouldDebounce = false,
  ): void {
    if (
      !isMainExecutableAction(action) ||
      !this.#modules.get(session)?.scope.available(this.bindingMode(window), action)
    ) {
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
        this.libraryModule(session)?.openSearch();
        break;
      case 'findNext':
      case 'findPrevious':
        this.libraryModule(session)?.repeatFind(action === 'findNext' ? 1 : -1);
        break;
      case 'openCommandPalette': {
        const mode = this.bindingMode(window);
        this.openCommandPalette(window, {
          mode: 'main',
          bindingMode: mode,
          actions: mode === 'main-select' ? MAIN_SELECT_ACTIONS : MAIN_NORMAL_ACTIONS,
          bindings: this.sessionBindings(session),
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
        this.libraryModule(session)?.addByIdentifier('main');
        break;
      case 'mainQuickSearch':
        this.libraryModule(session)?.quickSearch();
        break;
      case 'mainAdvancedSearch':
        this.libraryModule(session)?.advancedSearch();
        break;
      case 'findAllItems':
        this.libraryModule(session)?.findItems('all', 'main');
        break;
      case 'findCollectionItems':
        this.libraryModule(session)?.findItems('collection', 'main');
        break;
      case 'findCollections':
        this.collectionsModule(session)?.find();
        break;
      case 'addItemsToCurrentCollection':
        this.collectionsModule(session)?.addItems();
        break;
      case 'moveCollection':
        this.collectionsModule(session)?.move();
        break;
      case 'createCollection':
        this.collectionsModule(session)?.create();
        break;
      case 'renameCollection':
        this.collectionsModule(session)?.rename();
        break;
      case 'deleteCollection':
        this.collectionsModule(session)?.removeCollection();
        break;
      case 'switchTab':
        this.workspaceModule(session)?.switchTab('main');
        break;
      case 'findNotes':
        this.openNotesPickerForSurface(window, session);
        break;
      case 'managePlugins':
        this.extensionsModule(session)?.open('main-normal');
        break;
      case 'navigateBack':
      case 'navigateForward':
        if (this.worksetsModule(session)?.isVisual) this.worksetsModule(session)?.cancel();
        this.executeTraversal(window, session, action, 'main', count);
        break;
      case 'manageSelection':
        this.worksetsModule(session)?.manageSelection();
        break;
      case 'mainTrashItems': {
        const currentTarget = this.worksetsModule(session)?.isVisual
          ? this.worksetsModule(session)?.currentTarget()
          : undefined;
        const visualRevision =
          currentTarget?.source === 'visual'
            ? (this.worksetsModule(session)?.visualRevision ?? null)
            : null;
        this.libraryModule(session)?.trash(
          {
            selection: this.worksetsModule(session)?.selection ?? null,
            currentTarget,
            afterTrash: () => {
              if (visualRevision !== null && this.#sessions.get(window) === session)
                this.worksetsModule(session)?.cancelIfVisualRevision(visualRevision);
            },
          },
          this.bindingMode(window),
        );
        break;
      }
      case 'mainRestoreTrashedItems':
        this.libraryModule(session)?.restoreLastTrashed();
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
        const visual = this.worksetsModule(session)?.isVisual;
        const currentTarget = visual ? this.worksetsModule(session)?.currentTarget() : undefined;
        const targets = MAIN_ITEM_TARGET.resolve(
          window,
          this.worksetsModule(session)?.selection ?? null,
          currentTarget,
        );
        if (visual) this.worksetsModule(session)?.cancel();
        this.libraryModule(session)?.yankCitekeys(targets);
        break;
      }
      case 'mainOpenPDF':
        this.libraryModule(session)?.openItem(mainCursorItem(window) ?? null, 'main');
        break;
      case 'mainActivate':
        this.libraryModule(session)?.activate(mainCursorItem(window) ?? null);
        break;
      case 'closeCurrentTab':
        this.workspaceModule(session)?.closeTab('main');
        break;
      case 'previousTab':
      case 'nextTab':
        this.workspaceModule(session)?.cycleTab(action === 'previousTab' ? -1 : 1, 'main');
        break;
      case 'addTag':
      case 'removeTag': {
        const visual = this.worksetsModule(session)?.isVisual;
        const currentTarget = visual ? this.worksetsModule(session)?.currentTarget() : undefined;
        const targets = MAIN_ITEM_TARGET.resolve(
          window,
          this.worksetsModule(session)?.selection ?? null,
          currentTarget,
        );
        if (visual) this.worksetsModule(session)?.cancel();
        if (action === 'addTag') this.tagModule(session)?.add(targets);
        else this.tagModule(session)?.remove(targets);
        break;
      }
      case 'toggleTagFilter':
        this.tagModule(session)?.toggleFilter();
        break;
      case 'clearTagFilters':
        this.tagModule(session)?.clearFilters();
        break;
      case 'addToCollection':
      case 'removeFromCollection':
      case 'moveToCollection': {
        const visual = this.worksetsModule(session)?.isVisual;
        const currentTarget = visual ? this.worksetsModule(session)?.currentTarget() : undefined;
        if (visual) this.worksetsModule(session)?.cancel();
        const resolveTargets = () =>
          MAIN_ITEM_TARGET.resolve(
            window,
            this.worksetsModule(session)?.selection ?? null,
            currentTarget,
          );
        const request = {
          source: 'main',
          label: this.worksetsModule(session)?.selection.size ? 'Selection' : 'context item',
          resolveTargets,
        } as const;
        const collections = this.collectionsModule(session);
        if (action === 'moveToCollection') collections?.moveItems(request);
        else if (action === 'addToCollection') collections?.add(request);
        else collections?.remove(request);
        break;
      }
      case 'mainNavDown':
      case 'mainNavUp': {
        this.libraryModule(session)?.navigate(
          action === 'mainNavDown' ? 1 : -1,
          count,
          shouldDebounce,
        );
        break;
      }
      case 'mainNavFirst':
      case 'mainNavLast': {
        this.libraryModule(session)?.navigate(action === 'mainNavFirst' ? 'first' : 'last', count);
        break;
      }
      case 'mainTreeToggle':
      case 'mainTreeOpenOnly':
      case 'mainTreeCloseOnly':
      case 'mainTreeExpand':
      case 'mainTreeCollapse':
      case 'mainTreeParent':
      case 'mainTreeExpandAll':
      case 'mainTreeCollapseAll':
        this.libraryModule(session)?.tree(action);
        break;
      case 'mainToggleSelection':
        this.worksetsModule(session)?.toggleCurrentTarget(shouldDebounce);
        break;
      case 'mainClearSelection':
        this.worksetsModule(session)?.clearSelection();
        break;
      case 'mainCancelTarget':
        this.cancelMainCurrentTarget(window, session);
        break;
      case 'mainEnterSelect':
        this.worksetsModule(session)?.enter();
        break;
      case 'mainSelectDown':
        this.worksetsModule(session)?.extend(1, count, shouldDebounce);
        break;
      case 'mainSelectUp':
        this.worksetsModule(session)?.extend(-1, count, shouldDebounce);
        break;
      case 'mainSelectFirst':
        this.worksetsModule(session)?.extend('first', count);
        break;
      case 'mainSelectLast':
        this.worksetsModule(session)?.extend('last', count);
        break;
      case 'mainSelectSwapEnds':
        this.worksetsModule(session)?.swapEnds();
        break;
      case 'mainSelectFinish':
        this.worksetsModule(session)?.finish();
        break;
      case 'mainSelectCancel':
        this.worksetsModule(session)?.cancel();
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
