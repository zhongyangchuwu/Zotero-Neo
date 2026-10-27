import type {
  ReaderControllerApi,
  ReaderControllerDependencies,
  MainWindow,
  ReaderJumpLocation,
  ReaderSelectionActionDefinition,
  ReaderSelectionContext,
} from '../core/contracts';
import { reportDiagnosticError } from '../core/logging';
import { sameNavigationLocation } from '../navigation/history';
import type {
  HistoryDecision,
  NavigationCause,
  NavigationExecution,
  NavigationIntent,
  NavigationOperation,
  NavigationOutcome,
  NavigationResult,
} from '../navigation/types';
import { CleanupFailure, CleanupScope } from '../core/cleanup';
import { ModuleHost } from '../core/module-host';
import {
  annotationCommentEditorEnabled,
  keyGuideConfig,
  neoCommandLanguage,
  readerDefaultHighlightColor,
  readerModeEnabled,
  readerScrollStep,
} from '../core/preferences';
import { copyToClipboard } from '../platform/clipboard';
import { cloneInto, isDeadObject } from '../platform/cross-compartment';
import { asElement, asKeyboardEvent, isEditableElement } from '../platform/dom';
import { compositionOwnsKey } from '../input/composition';
import { advanceInput, inputWouldConsume } from '../input/engine';
import { InputRuntime, type InputTimerHost } from '../input/runtime';
import { KEY_GUIDE_CONFIG, type KeyGuideLanguage } from '../input/key-guide-config';
import { isLeaderPrefix } from '../input/key-guide';
import { keyString } from '../input/keys';
import { resolveBindings, type BindingMap, type BindingContext } from '../input/bindings';
import { t } from '../i18n';
import { copyCitekeys } from '../operations/citekeys';
import { deleteAnnotation as deleteReaderAnnotation } from '../operations/delete-annotation';
import {
  READER_NORMAL_ACTIONS,
  isReaderActionForMode,
  type ReaderAction,
} from './action-capabilities';
import { ACTION_LABELS, focusDirectionForAction, type ActionId } from '../input/actions';
import { PrefixGuideRuntime } from '../ui/key-guide-runtime';
import { THEME_VARS, ThemeManager } from '../ui/theme';
import { ReaderAnnotationNavigationState } from './annotation-navigation-state';
import { ReaderMarks } from './marks';
import { ReaderNativeSidebar } from './native-sidebar';
import { ReaderCaptionTargets } from './caption-targets';
import { createReaderHintsModule, type ReaderHintsModule } from '../modules/reader-hints';
import { ReaderCommentEditor, type AnnotationCommentTarget } from './comment-editor';
import { ReaderNativeInput } from './native-input';
import {
  ReaderHostKeyBridge,
  ReaderJumpHostAdapter,
  ReaderJumpHistoryBridge,
  ReaderViewLifecycle,
  readerInstanceID,
  readerOwnerWindow,
  readerMainWindow,
  readerWindow,
  readerPrimaryWindow,
  readerIsClosed,
  readerViewForWindow,
  readerViewIsLive,
  readerInventory,
  readerByTabID,
  readerSelectedTabID,
  registerReaderEvent,
  unregisterReaderEvent,
  computeSelectionPosition,
  readerScrollContainer,
  readerPagePositionTop,
  readerPageRatioTop,
  readerAnnotationPageRatio,
  selectReaderAnnotation,
  clearAnnotationSelection,
  setAnnotationColorFilter,
  readerFindInputFocused,
  openReaderSelectionSearch,
  setReaderSearchText,
  type ReaderEventListener,
  type ReaderNativeNavigation,
  type ReaderOwnedCompletion,
  type ReaderOwnedNavigation,
} from '../toolkit';
import { ReaderNavigation, type ReaderNavigationCommand } from './navigation';
import { ReaderFlash } from './flash';
import { READER_ITEM_TARGET } from './item-target';
import { ReaderSelectionActionRegistry, ReaderSelectionActions } from './selection-actions';
import { ReaderSelectionRange } from './selection-range';
import { selectionClipboardText } from './selection-text';
import { ReaderSmoothScroller, smoothScrollSpec } from './smooth-scroll';
import {
  COLORS,
  type AnnotationColor,
  type AnnotationDraft,
  type AnnotationRuntime,
  type AnnotationSelectionParams,
  type ItemRuntime,
  type Mark,
  type PdfWindow,
  type ReaderEventRuntime,
  type ReaderMode,
  type ReaderRuntime,
  type ReaderSessionState,
  type ReaderTimer,
  type ReaderViewRuntime,
} from './types';

interface ZoteroRuntime {
  readonly Items: {
    get(id: number): ItemRuntime | null | false;
    getByLibraryAndKey?(libraryID: number, key: string): AnnotationRuntime | null | false;
    getByLibraryAndKeyAsync?(
      libraryID: number,
      key: string,
    ): Promise<AnnotationRuntime | null | false>;
  };
  readonly Item: new (itemType: 'annotation') => AnnotationDraft;
  readonly PDFTranslate?: {
    readonly api?: {
      translate?(
        raw: string,
        options: { readonly pluginID: string; readonly itemID?: number },
      ): Promise<{ readonly result?: string }>;
    };
  };
  readonly locale?: string;
}

interface SessionSelectionBridge {
  readonly registered: (
    context: ReaderSelectionContext,
  ) => readonly ReaderSelectionActionDefinition[];
  readonly noteOwner: (session: ReaderSession) => void;
  readonly clearOwner: (session: ReaderSession) => void;
  readonly pluginID: () => string | null;
}

interface SessionDependencies {
  readonly controller: ReaderController;
  readonly reader: ReaderRuntime;
  readonly firstPdfWindow: PdfWindow;
  readonly bindings: () => BindingMap;
  readonly release: () => void;
  readonly jumpHost: ReaderJumpHostAdapter;
  readonly selection?: SessionSelectionBridge;
}

function zoteroRuntime(): ZoteroRuntime {
  return Zotero as unknown as ZoteroRuntime;
}

function annotationText(value: string): string {
  return value.normalize('NFKC').replace(/\n/g, ' ').replace(/ {2,}/g, ' ').trim();
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Reader action: ${String(value)}`);
}
function readerBindingMode(
  mode: ReaderMode,
): Extract<BindingContext, 'reader-normal' | 'reader-select'> {
  return mode === 'normal' ? 'reader-normal' : 'reader-select';
}
function readerActionIntent(
  action: ActionId,
  readerPath: NonNullable<NavigationIntent['context']>['readerPath'],
): NavigationIntent {
  return {
    cause: { kind: 'action', action },
    surface: 'reader',
    context: { readerPath },
  };
}
function isNavigationOutcome(value: unknown): value is NavigationOutcome {
  if (!value || typeof value !== 'object' || !('kind' in value)) return false;
  const kind = Reflect.get(value, 'kind');
  return (
    kind === 'completed' ||
    kind === 'unchanged' ||
    kind === 'unavailable' ||
    kind === 'cancelled' ||
    kind === 'stale' ||
    kind === 'failed'
  );
}

export function createReaderController(
  dependencies: ReaderControllerDependencies,
): ReaderControllerApi {
  return new ReaderController(dependencies);
}

export class ReaderController implements ReaderControllerApi {
  readonly #dependencies: ReaderControllerDependencies;
  readonly #jumpHost = new ReaderJumpHostAdapter();
  readonly #sessions = new Map<string, ReaderSession>();
  readonly #pending = new Set<string>();
  readonly #waitTimers = new Map<string, ReaderTimer>();
  #toolbarListener: ReaderEventListener | null = null;
  #selectionPopupListener: ReaderEventListener | null = null;
  #pluginID: string | null = null;
  readonly #selectionActions = new ReaderSelectionActionRegistry();
  #selectionOwner: ReaderSession | null = null;

  constructor(dependencies: ReaderControllerDependencies) {
    this.#dependencies = dependencies;
  }

  start(pluginId: string): void {
    if (this.#pluginID === pluginId) return;
    this.shutdown();
    const toolbarListener: ReaderEventListener = (event) => {
      if (this.#toolbarListener === toolbarListener) this.#onToolbar(event);
    };
    const selectionPopupListener: ReaderEventListener = (event) => {
      if (this.#selectionPopupListener === selectionPopupListener) this.#onSelectionPopup(event);
    };
    this.#toolbarListener = toolbarListener;
    this.#selectionPopupListener = selectionPopupListener;
    try {
      // Zotero returns no listener ID: teardown requires the exact event/handler pair.
      registerReaderEvent('renderToolbar', toolbarListener, pluginId);
      registerReaderEvent('renderTextSelectionPopup', selectionPopupListener, pluginId);
      this.#pluginID = pluginId;
      this.#dependencies.logger.debug('reader listeners registered');
      this.#dependencies.logger.diagnostic('reader listeners registered');
    } catch (error) {
      this.shutdown();
      const message = `reader listener registration failed: ${String(error)}`;
      this.#dependencies.logger.debug(message);
      this.#dependencies.logger.diagnostic(message);
    }
  }

  shutdown(): void {
    const toolbarListener = this.#toolbarListener;
    const selectionPopupListener = this.#selectionPopupListener;
    // Retire before touching the host registry so queued callbacks cannot reclaim input.
    this.#toolbarListener = null;
    this.#selectionPopupListener = null;
    this.#pluginID = null;
    if (toolbarListener) {
      try {
        unregisterReaderEvent('renderToolbar', toolbarListener);
      } catch {
        // Host shutdown may already have discarded the reader registry.
      }
    }
    if (selectionPopupListener) {
      try {
        unregisterReaderEvent('renderTextSelectionPopup', selectionPopupListener);
      } catch {
        // Host shutdown may already have discarded the reader registry.
      }
    }
    for (const timer of this.#waitTimers.values()) clearTimeout(timer);
    this.#waitTimers.clear();
    this.#pending.clear();
    const failure = new CleanupFailure();
    for (const session of this.#sessions.values()) failure.run(() => session.dispose());
    this.#sessions.clear();
    this.#selectionOwner = null;
    this.#selectionActions.clear();
    failure.rethrow();
  }

  rescan(window: MainWindow): void {
    let stage = 'inventory';
    try {
      const { readers, authoritative } = readerInventory(window, (next) => {
        stage = next;
      });
      stage = 'reconcile';
      if (authoritative) this.#reconcileReaders(readers);
      stage = 'ensure';
      for (const reader of readers) this.#ensure(reader);
    } catch (error) {
      throw new Error(
        `Reader rescan stage=${stage} sessions=[${[...this.#sessions.keys()].join(',')}] pending=[${[...this.#pending].join(',')}]`,
        { cause: error },
      );
    }
  }

  deactivateInactive(window: MainWindow, activeTabID: string | null): void {
    const activeReader = activeTabID ? (readerByTabID(activeTabID) ?? null) : null;
    for (const session of this.#sessions.values()) {
      const ownerWindow = session.ownerWindow;
      if (
        ownerWindow ? ownerWindow !== window : activeReader ? session.reader !== activeReader : true
      )
        continue;
      if (activeReader && session.reader === activeReader) continue;
      session.deactivateInteraction();
    }
  }

  forwardKey(event: KeyboardEvent, window: MainWindow): void {
    const tabID = readerSelectedTabID(window);
    if (!tabID) return;
    const reader = readerByTabID(tabID);
    if (!reader) return;
    this.#ensure(reader);
    const instanceID = readerInstanceID(reader);
    const session = instanceID ? this.#sessions.get(instanceID) : null;
    if (!session || session.nativeEditableFocused()) return;
    session.focusAndHandle(event);
  }

  captureJumpLocation(tabID: string, itemID?: number): ReaderJumpLocation | null {
    return this.#jumpHost.captureJumpLocation(tabID, itemID);
  }

  restoreJumpLocation(
    window: MainWindow,
    location: ReaderJumpLocation,
    isCurrent: () => boolean,
  ): Promise<string | null> {
    return this.#jumpHost.restoreJumpLocation(window, location, isCurrent, (reader) =>
      this.#ensure(reader),
    );
  }

  getSelection(): ReaderSelectionContext | null {
    return this.#selectionOwner?.selectionContext() ?? null;
  }

  registerSelectionAction(action: ReaderSelectionActionDefinition): () => void {
    return this.#selectionActions.register(action);
  }

  registeredSelectionActions(
    context: ReaderSelectionContext,
  ): readonly ReaderSelectionActionDefinition[] {
    return this.#selectionActions.available(context);
  }

  noteSelectionOwner(session: ReaderSession): void {
    this.#selectionOwner = session;
  }

  clearSelectionOwner(session: ReaderSession): void {
    if (this.#selectionOwner === session) this.#selectionOwner = null;
  }

  get pluginID(): string | null {
    return this.#pluginID;
  }

  #onToolbar(event: ReaderEventRuntime): void {
    if (event.reader) this.#ensure(event.reader);
  }

  #onSelectionPopup(event: ReaderEventRuntime): void {
    if (!this.#pluginID) return;
    const params = event.params;
    const reader = event.reader;
    const instanceID = reader ? readerInstanceID(reader) : undefined;
    if (!params?.annotation || !params.onAddAnnotation || !reader || !instanceID) return;
    const session = this.#sessions.get(instanceID);
    if (session?.reader === reader) session.acceptSelectionParams(params);
  }

  #ensure(reader: ReaderRuntime): void {
    if (!this.#pluginID) return;
    const instanceID = readerInstanceID(reader);
    if (!instanceID || this.#pending.has(instanceID) || this.#sessions.has(instanceID)) return;
    this.#pending.add(instanceID);
    this.#waitAndInject(reader, instanceID, 0);
  }

  #waitAndInject(reader: ReaderRuntime, instanceID: string, attempt: number): void {
    try {
      if (!this.#pending.has(instanceID)) return;
      // Native close can outpace inventory reconciliation and destroy the pending PDF view.
      if (readerIsClosed(reader)) {
        this.#pending.delete(instanceID);
        this.#waitTimers.delete(instanceID);
        return;
      }
      const pdfWindow = readerPrimaryWindow(reader);
      if (pdfWindow) {
        this.#waitTimers.delete(instanceID);
        this.#pending.delete(instanceID);
        const session = new ReaderSession({
          controller: this,
          reader,
          firstPdfWindow: pdfWindow,
          bindings: () => resolveBindings(this.#dependencies.preferences.get('bindings', '')),
          release: () => this.#release(instanceID),
          jumpHost: this.#jumpHost,
          selection: {
            registered: (context) => this.registeredSelectionActions(context),
            noteOwner: (owner) => this.noteSelectionOwner(owner),
            clearOwner: (owner) => this.clearSelectionOwner(owner),
            pluginID: () => this.pluginID,
          },
        });
        this.#sessions.set(instanceID, session);
        session.start();
        this.#dependencies.logger.diagnostic(
          `inject reader ${instanceID} itemID=${reader.itemID ?? '?'}`,
        );
        return;
      }
      if (attempt >= 300) {
        this.#pending.delete(instanceID);
        this.#waitTimers.delete(instanceID);
        this.#dependencies.logger.diagnostic(
          `reader injection timed out ${instanceID} itemID=${reader.itemID ?? '?'}`,
        );
        return;
      }
      const timer = setTimeout(() => this.#waitAndInject(reader, instanceID, attempt + 1), 100);
      this.#waitTimers.set(instanceID, timer);
    } catch (error) {
      const failure = new Error(`Reader injection instanceID=${instanceID} attempt=${attempt}`, {
        cause: error,
      });
      if (attempt > 0)
        reportDiagnosticError(this.#dependencies.logger, 'Reader injection failed', failure);
      throw failure;
    }
  }

  #reconcileReaders(readers: readonly ReaderRuntime[]): void {
    const live = new Set(
      readers
        .map((reader) => readerInstanceID(reader))
        .filter((instanceID): instanceID is string => !!instanceID),
    );
    for (const [instanceID, session] of [...this.#sessions]) {
      if (!live.has(instanceID)) {
        try {
          session.dispose();
        } catch (error) {
          throw new Error(`Reader disposal instanceID=${instanceID}`, { cause: error });
        }
      }
    }
    for (const instanceID of [...this.#pending]) {
      if (live.has(instanceID)) continue;
      this.#pending.delete(instanceID);
      const timer = this.#waitTimers.get(instanceID);
      if (timer !== undefined) clearTimeout(timer);
      this.#waitTimers.delete(instanceID);
    }
  }

  #release(instanceID: string): void {
    const session = this.#sessions.get(instanceID);
    if (session && this.#selectionOwner === session) this.#selectionOwner = null;
    this.#sessions.delete(instanceID);
    this.#pending.delete(instanceID);
    const timer = this.#waitTimers.get(instanceID);
    clearTimeout(timer);
    this.#waitTimers.delete(instanceID);
  }

  get dependencies(): ReaderControllerDependencies {
    return this.#dependencies;
  }
}

const READER_INPUT_TIMERS: InputTimerHost = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs) as unknown as number,
  clearTimeout: (timer) => clearTimeout(timer),
};

export class ReaderSession {
  readonly #dependencies: SessionDependencies;
  readonly #scope = new CleanupScope();
  readonly #pendingTimers = new Set<ReaderTimer>();
  readonly #hostKeyBridge: ReaderHostKeyBridge;
  readonly #jumpHistoryBridge: ReaderJumpHistoryBridge;
  readonly #viewLifecycle: ReaderViewLifecycle;
  readonly #navigation: ReaderNavigation;
  readonly #annotationNavigation = new ReaderAnnotationNavigationState();
  readonly #marks: ReaderMarks;
  readonly #sidebar: ReaderNativeSidebar;
  readonly #captions: ReaderCaptionTargets;
  readonly #modules: ModuleHost;
  readonly #hints: ReaderHintsModule;
  readonly #commentEditor: ReaderCommentEditor;
  readonly #nativeInput: ReaderNativeInput;
  readonly #flash: ReaderFlash;
  readonly #selectionRange: ReaderSelectionRange;
  readonly #selectionActions: ReaderSelectionActions;
  readonly #smoothScroller: ReaderSmoothScroller;
  readonly #themeManagers = new Map<Window, ThemeManager>();
  readonly #prefixGuide = new PrefixGuideRuntime(READER_INPUT_TIMERS);
  readonly input = new InputRuntime(READER_INPUT_TIMERS);
  #markJumpRevision = 0;
  #surfaceMode: ReaderMode = 'normal';
  #interactionRevision = 0;
  #editorReleaseRevision = 0;
  #selectionView: ReaderViewRuntime | null = null;
  #selectionWindow: PdfWindow | null = null;
  readonly state: ReaderSessionState;

  constructor(dependencies: SessionDependencies) {
    this.#dependencies = dependencies;
    this.state = {
      selectionParams: null,
      indicator: null,
      indicatorThemeCleanup: null,
    };
    this.#flash = new ReaderFlash({
      activate: (intent, pdfWindow, target) =>
        this.#selectionRange.activateFlashTarget(intent, pdfWindow, target),
      showStatus: (message, duration) => this.showStatus(message, duration),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
    });
    this.#selectionRange = new ReaderSelectionRange({
      mode: () => this.#surfaceMode,
      setModeVisual: () => this.setMode('visual'),
      invalidateNativeSelection: () => {
        this.clearNativeSelection();
      },
      noteOwner: () => this.#dependencies.selection?.noteOwner(this),
      updateIndicator: () => this.updateIndicator(),
      showStatus: (message, duration) => this.showStatus(message, duration),
      scrollContainer: (pdfWindow) => this.scrollContainer(pdfWindow),
      scrollBy: (pdfWindow, x, y) => this.scrollBy(pdfWindow, x, y),
      openFlash: (pdfWindow, intent) => this.#flash.open(pdfWindow, intent),
    });
    this.#selectionActions = new ReaderSelectionActions({
      actions: (context, pdfWindow) => this.selectionActionDefinitions(context, pdfWindow),
      themeRoot: (root) => this.themeRoot(root),
      copyText: (text) => this.copyText(text),
      showStatus: (message, duration) => this.showStatus(message, duration),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
    });
    this.#smoothScroller = new ReaderSmoothScroller({
      preferences: dependencies.controller.dependencies.preferences,
      scrollBy: (pdfWindow, x, y) => this.scrollContainer(pdfWindow).scrollBy(x, y),
    });
    this.#modules = new ModuleHost(
      dependencies.controller.dependencies.logger,
      () => !this.#scope.disposed,
    );
    this.#hints = createReaderHintsModule(this.#modules, {
      reader: dependencies.reader,
      viewForWindow: (pdfWindow) => this.readerViewForWindow(pdfWindow),
      executeNavigation: (pdfWindow, intent, perform) =>
        this.executeReaderNavigation(pdfWindow, intent, perform),
      copyText: (text) => this.copyText(text),
      showStatus: (message, duration) => this.showStatus(message, duration),
      text: (key) => t(key, this.keyGuideLanguage()),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
      diagnostic: (message) => dependencies.controller.dependencies.logger.diagnostic(message),
    });
    this.#nativeInput = new ReaderNativeInput((pdfWindow) => {
      this.setMode('normal');
      pdfWindow.focus();
    });
    this.#commentEditor = new ReaderCommentEditor({
      reader: dependencies.reader,
      schedule: (delay, task) => this.schedule(delay, task),
      clearTimer: (timer) => this.clearTimer(timer),
      themeRoot: (root) => this.themeRoot(root),
      activePdfWindow: () => this.#navigation.activePdfWindow(),
      resolveAnnotation: (key) => this.resolveAnnotation(key),
      annotationForSave: (target) => this.annotationForSave(target),
      nativeEditableFocused: () => this.nativeEditableFocused(),
      onNativeEditorFocus: () => {
        void this.handOverNativeEditor();
      },
      locale: () => zoteroRuntime().locale ?? '',
      onInputOwnerChanged: () => {
        this.#interactionRevision += 1;
        if (!this.#commentEditor.ownsInput) this.#editorReleaseRevision = this.#interactionRevision;
        this.input.reset();
        this.clearKeyGuide();
        this.#sidebar.deactivate();
        this.#smoothScroller.stop(true);
        this.updateIndicator();
      },
      onExit: (saved, pdfWindow) => {
        if (
          this.#nativeInput.ownsInput ||
          this.#commentEditor.ownsInput ||
          this.#sidebar.containsTarget(
            readerWindow(this.#dependencies.reader)?.document.activeElement ?? null,
          ) ||
          this.#interactionRevision !== this.#editorReleaseRevision ||
          this.#navigation.activePdfWindow() !== pdfWindow
        )
          return;
        pdfWindow.focus();
        this.showStatus(saved ? '✓ saved' : '✗ save failed', saved ? 1200 : 2500);
      },
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
    });
    this.#hostKeyBridge = new ReaderHostKeyBridge({
      reader: dependencies.reader,
      nativeEditableFocused: () => this.nativeEditableFocused(),
      consumesKey: (key, pdfWindow) => this.readerConsumesKey(key, pdfWindow),
      commentInputFocused: (window) => this.#commentEditor.isInputFocused(window),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
    });
    this.#jumpHistoryBridge = new ReaderJumpHistoryBridge({
      reader: dependencies.reader,
      host: dependencies.jumpHost,
      navigation: () =>
        dependencies.controller.dependencies.main.navigationForReader(
          readerOwnerWindow(dependencies.reader) ?? null,
        ),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
    });
    this.#marks = new ReaderMarks({
      preferences: dependencies.controller.dependencies.preferences,
      itemForReader: (reader) => this.itemForReader(reader),
      schedule: (delay, task) => this.schedule(delay, task),
      showStatus: (message, duration) => this.showStatus(message, duration),
      onChange: () => {
        try {
          this.#sidebar.refreshMarks();
        } catch (error) {
          dependencies.controller.dependencies.logger.debug(
            `reader bookmark presentation failed: ${String(error)}`,
          );
        }
      },
      log: (message) => dependencies.controller.dependencies.logger.debug(message),
      scrollToPageRatio: (pdfWindow, pageIndex, ratio, isCurrent) =>
        this.scrollToPageRatio(pdfWindow, pageIndex, ratio, isCurrent),
      scrollDocumentToRatio: (pdfWindow, ratio, isCurrent) =>
        this.scrollDocumentToRatio(pdfWindow, ratio, isCurrent),
      pageNavigationSupported: (_reader, pdfWindow) =>
        this.#navigation.pageNavigationSupported(pdfWindow),
      annotationPageRatio: (pdfWindow, annotation) =>
        this.annotationPageRatio(pdfWindow, annotation),
      onJump: (pdfWindow, perform) => this.recordMarkJump(pdfWindow, perform),
    });
    this.#captions = new ReaderCaptionTargets(
      dependencies.reader.itemID,
      () => this.#sidebar.refreshCaptions(),
      (message) => dependencies.controller.dependencies.logger.debug(message),
    );
    this.#sidebar = new ReaderNativeSidebar({
      reader: dependencies.reader,
      marks: this.#marks,
      captions: this.#captions,
      onCaptionTarget: (target, pdfWindow) => {
        if (this.#scope.disposed || this.#nativeInput.ownsInput || this.#commentEditor.ownsInput)
          return;
        this.#interactionRevision += 1;
        void this.#navigation
          .navigateCaption(target, pdfWindow)
          .catch((error: unknown) =>
            dependencies.controller.dependencies.logger.debug(
              `reader caption jump failed: ${String(error)}`,
            ),
          );
      },
      bindings: dependencies.bindings,
      language: () => this.keyGuideLanguage(),
      activePdfWindow: () => this.#navigation.activePdfWindow(),
      onAnnotation: (key) => this.#annotationNavigation.rememberAnnotation(key),
      onDocumentAction: (action, pdfWindow) => {
        if (
          this.#scope.disposed ||
          this.#nativeInput.ownsInput ||
          this.#commentEditor.ownsInput ||
          this.nativeEditableFocused() ||
          this.#surfaceMode !== 'normal' ||
          !this.readerViewForWindow(pdfWindow) ||
          this.#navigation.activePdfWindow() !== pdfWindow
        )
          return false;
        this.executeAction(action, 0, pdfWindow);
        return true;
      },
      onInput: () => {
        this.#markJumpRevision += 1;
        this.#interactionRevision += 1;
        this.input.reset();
        this.clearKeyGuide();
        this.updateIndicator();
      },
      schedule: (delay, task) => this.schedule(delay, task),
      clearTimer: (timer) => this.clearTimer(timer),
      log: (message) => dependencies.controller.dependencies.logger.debug(message),
    });
    this.#viewLifecycle = new ReaderViewLifecycle({
      reader: dependencies.reader,
      timerWindow: dependencies.firstPdfWindow,
      onKeyDown: (event, pdfWindow) => this.handleKeyDown(event, pdfWindow),
      onKeyUp: (event) => this.handleKeyUp(event),
      onPointerDown: () => {
        this.#markJumpRevision += 1;
        this.#interactionRevision += 1;
        this.#hints.copy.close();
        this.#hints.links.cancelHints();
        this.input.reset();
        this.clearKeyGuide();
        this.updateIndicator();
        this.#sidebar.deactivate();
      },
      onBlur: (pdfWindow, event) => {
        this.#interactionRevision += 1;
        this.#smoothScroller.stop(true);
        this.#flash.onBlur(pdfWindow, event);
        if (this.#hints.links.ownsView(pdfWindow)) this.#hints.links.cancelHints();
        this.#hints.copy.releaseView(pdfWindow);
      },
      onSelectionChange: (pdfWindow) => {
        this.#interactionRevision += 1;
        if (this.#selectionWindow === pdfWindow && pdfWindow.getSelection()?.isCollapsed)
          this.clearNativeSelection();
      },
      onScroll: (pdfWindow) => {
        this.#flash.onViewportChange(pdfWindow);
        this.#hints.links.onViewportChange(pdfWindow);
        this.#hints.copy.onViewportChange(pdfWindow);
        if (this.#surfaceMode === 'visual') this.#selectionRange.refresh(pdfWindow, false);
      },
      onResize: (pdfWindow) => {
        this.#flash.onViewportChange(pdfWindow);
        this.#hints.links.onViewportChange(pdfWindow);
        this.#hints.copy.onViewportChange(pdfWindow);
      },
      releaseView: (pdfWindow) => {
        this.#interactionRevision += 1;
        if (this.#selectionWindow === pdfWindow) this.clearNativeSelection();
        const failure = new CleanupFailure();
        failure.run(() => this.#selectionRange.releaseView(pdfWindow));
        failure.run(() => this.#hints.links.releaseView(pdfWindow));
        failure.run(() => this.#hints.copy.releaseView(pdfWindow));
        failure.run(() => this.#selectionActions.releaseView(pdfWindow));
        failure.run(() => this.releaseViewTheme(pdfWindow));
        failure.run(() => this.#jumpHistoryBridge.releaseWindow(pdfWindow));
        failure.rethrow();
      },
      syncHostBridge: () => {
        this.#hostKeyBridge.sync();
        this.#jumpHistoryBridge.sync();
      },
    });
    this.#navigation = new ReaderNavigation({
      reader: dependencies.reader,
      captions: this.#captions,
      activePdfWindow: () => this.#viewLifecycle.activePdfWindow(),
      setActivePdfWindow: (pdfWindow) => this.#viewLifecycle.setActivePdfWindow(pdfWindow),
      syncViews: () => this.#viewLifecycle.sync(),
      scrollBoundary: (last, pdfWindow) => {
        this.scrollTo(
          pdfWindow,
          last
            ? Math.max(0, this.scrollContainer(pdfWindow).scrollHeight - this.viewport(pdfWindow))
            : 0,
        );
      },
      showStatus: (message, duration) => this.showStatus(message, duration),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
    });
    this.#scope.add(() => this.input.dispose());
    this.#scope.addTimeout(() => {
      const failure = new CleanupFailure();
      for (const timer of this.#pendingTimers) failure.run(() => this.clearTimer(timer));
      failure.rethrow();
    });
  }

  get itemID(): number | undefined {
    return this.#dependencies.reader.itemID;
  }

  get reader(): ReaderRuntime {
    return this.#dependencies.reader;
  }
  /** Reader Surface mode is independent of feature input ownership. */
  get mode(): ReaderMode {
    return this.#surfaceMode;
  }

  get ownerWindow(): MainWindow | null {
    return readerOwnerWindow(this.#dependencies.reader) ?? null;
  }

  /** Routes one Reader effect through exact-view ownership and evidence-based completion. */
  private executeReaderNavigation(
    pdfWindow: PdfWindow,
    intent: NavigationIntent,
    perform: (navigation: ReaderNativeNavigation) => unknown,
    options: {
      readonly admission?: 'replace' | 'motion';
      readonly onUnavailable?: () => void;
    } = {},
  ): NavigationExecution | null {
    const reader = this.#dependencies.reader;
    const view = this.readerViewForWindow(pdfWindow);
    if (!view) {
      options.onUnavailable?.();
      return null;
    }

    const parentCurrent = intent.context?.isCurrent;
    const tabID = reader.tabID;
    const ownerWindow = readerOwnerWindow(reader);
    const isCurrent = (): boolean => {
      try {
        return (
          !this.#scope.disposed &&
          this.readerViewForWindow(pdfWindow) === view &&
          (!tabID || !ownerWindow || readerSelectedTabID(ownerWindow) === tabID) &&
          (parentCurrent?.() ?? true)
        );
      } catch {
        return false;
      }
    };
    const cause: NavigationCause = Object.freeze({ ...intent.cause });
    const ownedIntent: NavigationIntent = Object.freeze({
      cause,
      surface: intent.surface,
      context: Object.freeze({ ...intent.context, isCurrent }),
    });
    const admission = options.admission ?? 'replace';
    const capture = (): ReaderJumpLocation | null =>
      tabID ? this.#dependencies.jumpHost.captureReader(reader, tabID, view) : null;

    const port = this.#dependencies.controller.dependencies.main.navigationForReader(
      readerOwnerWindow(reader) ?? null,
    );
    if (port) {
      const operation: NavigationOperation = {
        dispatch: 'inline',
        admission,
        capture,
        start: (attempt) => {
          if (!isCurrent() || !attempt.isCurrent())
            return { kind: 'immediate', outcome: { kind: 'stale' } };
          if (attempt.policy.kind === 'ignore' && admission === 'motion') {
            const outcome = this.#jumpHistoryBridge.runIgnoredMotion(view, attempt, perform);
            return { kind: 'immediate', outcome };
          }
          const attemptCurrent = (): boolean => isCurrent() && attempt.isCurrent();
          let navigation: ReaderOwnedNavigation | null = null;
          return {
            kind: 'deferred',
            settled: this.#jumpHistoryBridge.runOwned(
              view,
              attempt,
              (owned) => {
                navigation = owned;
                return perform(owned);
              },
              (value, completion) =>
                this.finishReaderNavigation(
                  value,
                  completion,
                  attempt.policy,
                  navigation,
                  attemptCurrent,
                ),
            ),
          };
        },
      };
      return port.execute(ownedIntent, operation);
    }

    let cancelled = false;
    const detachedCurrent = (): boolean => !cancelled && isCurrent();
    if (admission === 'motion') {
      const outcome = this.#jumpHistoryBridge.runIgnoredMotion(view, detachedCurrent, perform);
      return {
        isCurrent: detachedCurrent,
        cancel: () => {
          cancelled = true;
        },
        pending: false,
        result: { ...outcome, recorded: false },
      };
    }
    let navigation: ReaderNativeNavigation | null = null;
    const settled = this.#jumpHistoryBridge.runDetached(
      view,
      detachedCurrent,
      (native) => {
        navigation = native;
        return perform(native);
      },
      (value, completion) =>
        this.finishReaderNavigation(
          value,
          completion,
          { kind: 'ignore' },
          navigation,
          detachedCurrent,
        ),
    );
    return {
      isCurrent: detachedCurrent,
      cancel: () => {
        cancelled = true;
      },
      pending: true,
      result: settled.then((outcome): NavigationResult => ({ ...outcome, recorded: false })),
    };
  }
  private finishReaderNavigation(
    value: unknown,
    completion: ReaderOwnedCompletion,
    policy: HistoryDecision,
    navigation: ReaderNativeNavigation | null,
    isCurrent: () => boolean,
  ): NavigationOutcome | Promise<NavigationOutcome> {
    if (!completion.current || !isCurrent() || !navigation || !navigation.isCurrent())
      return { kind: 'stale' };
    if (completion.error !== null && completion.error !== undefined)
      return { kind: 'failed', error: completion.error };
    const explicit = isNavigationOutcome(value) ? value : null;
    if (explicit && explicit.kind !== 'completed') return explicit;
    if (value === false) return { kind: 'unavailable' };

    if (completion.ambiguous) return { kind: 'stale' };
    if (explicit?.kind === 'completed')
      return policy.kind === 'record' && policy.evidence === 'native-hard'
        ? { ...explicit, evidence: 'settled-change' }
        : explicit;
    return navigation.waitForView().then((settled): NavigationOutcome => {
      if (!settled) return isCurrent() ? { kind: 'unchanged' } : { kind: 'stale' };
      if (!isCurrent() || !navigation.isCurrent()) return { kind: 'stale' };
      const moved = navigation.hasMoved();
      if (moved !== true) return { kind: moved === false ? 'unchanged' : 'unavailable' };
      if (policy.kind !== 'record') return { kind: 'completed', evidence: 'settled-change' };
      const destination = navigation.capture();
      if (!destination) return { kind: 'unavailable' };
      if (completion.source && sameNavigationLocation(completion.source, destination))
        return { kind: 'unchanged' };
      const evidence =
        policy.evidence === 'native-hard'
          ? completion.hardDestination &&
            sameNavigationLocation(completion.hardDestination, destination)
            ? 'native-hard'
            : 'settled-change'
          : policy.evidence;
      return { kind: 'completed', evidence, destination };
    });
  }

  /** Marks are a single managed-final excursion; every input retires their invocation guard. */
  private async recordMarkJump(
    pdfWindow: PdfWindow,
    perform: (isCurrent: () => boolean) => Promise<boolean>,
  ): Promise<boolean> {
    const revision = ++this.#markJumpRevision;
    const reader = this.#dependencies.reader;
    const view = this.readerViewForWindow(pdfWindow);
    const tabID = reader.tabID;
    const ownerWindow = readerOwnerWindow(reader);
    const isCurrent = (): boolean =>
      revision === this.#markJumpRevision &&
      !this.#scope.disposed &&
      !!view &&
      this.#navigation.activePdfWindow() === pdfWindow &&
      this.readerViewForWindow(pdfWindow) === view &&
      (!tabID || !ownerWindow || readerSelectedTabID(ownerWindow) === tabID);
    if (!isCurrent()) return false;
    const execution = this.executeReaderNavigation(
      pdfWindow,
      {
        cause: { kind: 'event', event: 'reader-mark.jump' },
        surface: 'reader',
        context: { readerPath: 'mark', isCurrent },
      },
      (navigation) => perform(() => isCurrent() && navigation.isCurrent()),
    );
    if (!execution) return false;
    const result = execution.pending ? await execution.result : execution.result;
    return result.kind === 'completed' && isCurrent();
  }

  get marks(): Readonly<Record<string, Mark>> {
    return this.#marks.values();
  }

  start(): void {
    this.#dependencies.controller.dependencies.logger.debug(
      `injecting reader ${readerInstanceID(this.#dependencies.reader) ?? '?'}`,
    );
    this.state.indicator = this.createIndicator(
      readerWindow(this.#dependencies.reader)?.document ?? null,
    );
    if (this.state.indicator)
      this.state.indicatorThemeCleanup = this.themeRoot(this.state.indicator);
    this.#viewLifecycle.start();
    this.installOuterReaderListeners();
    this.#marks.load(this.#dependencies.reader);
    this.#sidebar.start();
  }

  /** Retires all owners once, preserving the first live cleanup failure for the caller. */
  dispose(): void {
    if (this.#scope.disposed) return;
    this.#interactionRevision += 1;
    // Reject reentrant input and queued work before any host cleanup can fail.
    this.#scope.dispose();
    this.clearNativeSelection();
    const failure = new CleanupFailure();
    failure.run(() => this.#nativeInput.release());
    failure.run(() => this.#commentEditor.dispose());
    failure.run(() => this.#selectionActions.dispose());
    failure.run(() => this.#dependencies.selection?.clearOwner(this));
    failure.run(() => this.#flash.dispose());
    failure.run(() => this.#smoothScroller.dispose());
    failure.run(() => this.#selectionRange.leave());
    failure.run(() => this.#viewLifecycle.dispose());
    failure.run(() => this.#hostKeyBridge.dispose());
    failure.run(() => this.#jumpHistoryBridge.dispose());
    failure.run(() => this.#sidebar.dispose());
    failure.run(() => this.#captions.dispose());
    const indicatorCleanup = this.state.indicatorThemeCleanup;
    this.state.indicatorThemeCleanup = null;
    failure.run(() => indicatorCleanup?.());
    for (const manager of this.#themeManagers.values()) failure.run(() => manager.dispose());
    this.#themeManagers.clear();
    const indicator = this.state.indicator;
    this.state.indicator = null;
    failure.run(() => {
      if (indicator && !isDeadObject(indicator)) indicator.remove();
    });
    failure.run(() => this.#modules.dispose());
    failure.run(() => this.#prefixGuide.dispose());
    failure.run(() => this.#dependencies.release());
    failure.rethrow();
  }

  acceptSelectionParams(params: AnnotationSelectionParams): void {
    const pdfWindow = this.#navigation.activePdfWindow();
    const view = this.readerViewForWindow(pdfWindow);
    if (
      this.#scope.disposed ||
      !view ||
      !readerViewIsLive(this.#dependencies.reader, view, pdfWindow) ||
      this.#nativeInput.ownsInput ||
      this.#commentEditor.ownsView(pdfWindow)
    )
      return;
    this.#interactionRevision += 1;
    this.#selectionView = view;
    this.#selectionWindow = pdfWindow;
    this.state.selectionParams = params;
    if (this.mode === 'normal' && this.modeEnabled('visual')) this.setMode('visual');
  }

  private clearNativeSelection(): void {
    this.state.selectionParams = null;
    this.#selectionView = null;
    this.#selectionWindow = null;
  }

  deactivateInteraction(): void {
    this.#markJumpRevision += 1;
    this.#interactionRevision += 1;
    this.#sidebar.deactivate();
    this.#hints.links.close();
    this.#hints.copy.close();
    this.#nativeInput.release();
    if (this.#commentEditor.ownsInput) {
      void this.handOverNativeEditor();
      return;
    }
    this.setMode('normal');
  }

  nativeEditableFocused(): boolean {
    return isEditableElement(
      readerWindow(this.#dependencies.reader)?.document.activeElement ?? null,
    );
  }

  focusAndHandle(event: KeyboardEvent): void {
    if (this.#scope.disposed) return;
    const pdfWindow = this.#navigation.activePdfWindow();
    if (!pdfWindow) return;
    const sidebarTarget = this.#sidebar.containsTarget(event.target);
    if (!sidebarTarget) pdfWindow.focus();
    this.handleKeyDown(event, pdfWindow, sidebarTarget);
  }

  private installOuterReaderListeners(): void {
    const document = readerWindow(this.#dependencies.reader)?.document;
    if (!document) return;
    this.#scope.addEventListener(
      document,
      'focusin',
      ((event: Event) => {
        this.#interactionRevision += 1;
        if (!this.#commentEditor.ownsInput || !isEditableElement(asElement(event.target))) return;
        void this.handOverNativeEditor();
      }) as EventListener,
      true,
    );
    this.#scope.addEventListener(
      document,
      'keydown',
      ((event: Event) => {
        const keyEvent = asKeyboardEvent(event);
        if (!keyEvent) return;
        if (this.nativeEditableFocused() && !this.#nativeInput.ownsInput) {
          this.input.reset();
          this.clearKeyGuide();
          this.updateIndicator();
          return;
        }
        const pdfWindow = this.#navigation.activePdfWindow();
        if (pdfWindow) this.handleKeyDown(keyEvent, pdfWindow);
      }) as EventListener,
      true,
    );
    this.#scope.addEventListener(
      document,
      'keydown',
      ((event: Event) => {
        const keyEvent = asKeyboardEvent(event);
        if (!keyEvent || keyEvent.key !== 'Enter' || compositionOwnsKey(keyEvent, false)) return;
        const active = document.activeElement;
        if (!active || !readerFindInputFocused(document)) return;
        const pdfWindow = this.#navigation.activePdfWindow();
        const isCurrent = this.invocationCurrent(pdfWindow);
        this.schedule(150, () => {
          if (
            !isCurrent() ||
            isDeadObject(active) ||
            document.activeElement !== active ||
            !active.isConnected
          )
            return;
          if ('blur' in active && typeof active.blur === 'function') active.blur();
          if (isCurrent()) pdfWindow.focus();
        });
      }) as EventListener,
      true,
    );
  }

  /**
   * Releases Neo overlays and theme subscriptions owned by a PDF view that Zotero removed or
   * recreated, without affecting the reader chrome or surviving split view.
   */
  private releaseViewTheme(pdfWindow: PdfWindow): void {
    this.#interactionRevision += 1;
    const failure = new CleanupFailure();
    failure.run(() => this.#flash.releaseView(pdfWindow));
    failure.run(() => this.#smoothScroller.releaseView(pdfWindow));
    failure.run(() => this.#commentEditor.releaseView(pdfWindow));
    const manager = this.#themeManagers.get(pdfWindow);
    this.#themeManagers.delete(pdfWindow);
    failure.run(() => manager?.dispose());
    failure.rethrow();
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.#smoothScroller.handleKeyUp(event);
  }

  private handleKeyDown(
    event: KeyboardEvent,
    pdfWindow: PdfWindow,
    sidebarTarget = this.#sidebar.containsTarget(event.target),
  ): void {
    if (this.#scope.disposed) return;
    if (!this.#nativeInput.ownsInput && sidebarTarget) {
      this.input.reset();
      this.clearKeyGuide();
      this.updateIndicator();
      this.#sidebar.handleKey(event);
      return;
    }
    this.#sidebar.deactivate();
    this.#navigation.activatePdfWindow(pdfWindow);
    this.#markJumpRevision += 1;
    this.#interactionRevision += 1;
    if (this.#commentEditor.handleKey(event, pdfWindow)) return;
    if (this.#nativeInput.handleKey(event, pdfWindow)) return;
    if (this.#selectionActions.isOpen && this.#selectionActions.handleKey(event, pdfWindow)) return;
    if (this.#flash.isOpen && this.#flash.handleKey(event, pdfWindow)) return;
    if (this.#hints.links.hasHints && this.#hints.links.handleKey(event, pdfWindow)) return;
    if (this.#hints.copy.hasHints && this.#hints.copy.handleKey(event, pdfWindow)) return;
    if (isEditableElement(asElement(event.target))) {
      this.input.reset();
      this.clearKeyGuide();
      return;
    }
    if (compositionOwnsKey(event, false)) return;
    const mode = readerBindingMode(this.#surfaceMode);
    if (
      event.key.toLowerCase() === 'escape' &&
      isLeaderPrefix(this.input.keyBuffer) &&
      this.input.cancel(mode)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.clearKeyGuide();
      this.updateIndicator();
      return;
    }
    if (
      event.key.toLowerCase() === 'backspace' &&
      isLeaderPrefix(this.input.keyBuffer) &&
      this.input.backspace(mode)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.refreshKeyGuide();
      this.updateIndicator();
      return;
    }
    const key = keyString(event);
    if (!key) return;
    if (this.handleMarkChord(event, key, pdfWindow)) return;
    if (this.startSmoothHold(event, pdfWindow, key)) return;
    const decision = this.input.advance(
      mode,
      this.#dependencies.bindings(),
      key,
      this.#surfaceMode === 'normal',
    );
    if (decision.kind === 'pass') {
      this.refreshKeyGuide();
      this.updateIndicator();
      return;
    }
    if (decision.kind === 'execute') {
      this.clearKeyGuide();
      this.updateIndicator();
      if (!isReaderActionForMode(this.#surfaceMode, decision.action)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const direction = focusDirectionForAction(decision.action);
      if (direction) {
        if (this.#navigation.focusDirection(direction)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this.executeAction(decision.action, decision.count, pdfWindow);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.refreshKeyGuide();
    const timeoutMs = isLeaderPrefix(decision.state.keyBuffer)
      ? KEY_GUIDE_CONFIG.idleTimeoutMs
      : decision.timeoutMs;
    if (timeoutMs !== null) {
      this.input.schedule(decision, timeoutMs, (resolved) => {
        if (this.#scope.disposed) return;
        this.clearKeyGuide();
        this.updateIndicator();
        if (resolved.kind === 'execute')
          this.executeAction(resolved.action, resolved.count, this.#navigation.activePdfWindow());
      });
    }
  }

  private handleMarkChord(event: KeyboardEvent, key: string, pdfWindow: PdfWindow): boolean {
    const bindings = this.#dependencies.bindings();
    if (
      this.#surfaceMode !== 'normal' ||
      bindings['reader-normal:m'] ||
      bindings['reader-normal:`']
    )
      return false;
    const consume = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (!this.input.keyBuffer && (key === 'm' || key === '`')) {
      this.input.replace(key, '');
      this.armMarkTimer();
      this.updateIndicator();
      consume();
      return true;
    }
    if (this.input.keyBuffer === 'm' && /^[a-z0-9]$/.test(key)) {
      this.input.replace('', this.input.countBuffer);
      void this.#marks.set(
        this.#dependencies.reader,
        pdfWindow,
        key,
        this.#annotationNavigation.selectedAnnotationKey(this.#dependencies.reader),
      );
      consume();
      return true;
    }
    if (this.input.keyBuffer === '`' && /^[a-z0-9]$/.test(key)) {
      this.input.replace('', this.input.countBuffer);
      void this.#marks.jump(this.#dependencies.reader, pdfWindow, key, (annotation) =>
        this.#annotationNavigation.rememberAnnotation(annotation),
      );
      consume();
      return true;
    }
    if (this.input.keyBuffer === 'd' && key === 'm') {
      this.input.replace('dm', this.input.countBuffer);
      this.armMarkTimer();
      this.updateIndicator();
      consume();
      return true;
    }
    if (this.input.keyBuffer === 'd' && key === 'M') {
      this.input.replace('', this.input.countBuffer);
      void this.#marks.clear(this.#dependencies.reader);
      consume();
      return true;
    }
    if (this.input.keyBuffer === 'dm' && /^[a-z0-9]$/.test(key)) {
      this.input.replace('', this.input.countBuffer);
      void this.#marks.delete(this.#dependencies.reader, key);
      consume();
      return true;
    }
    return false;
  }
  private armMarkTimer(): void {
    this.input.scheduleReset(1200, () => this.updateIndicator());
  }

  private readerConsumesKey(key: string, pdfWindow: PdfWindow | undefined): boolean {
    if (!key) return false;
    if (this.#nativeInput.ownsInput) return key === 'escape';
    if (pdfWindow && this.#commentEditor.ownsView(pdfWindow))
      return this.#commentEditor.consumesKey(key, pdfWindow);
    if (this.#selectionActions.isOpen && pdfWindow && this.#selectionActions.ownsView(pdfWindow))
      return true;
    if (this.#flash.isOpen && pdfWindow && this.#flash.ownsView(pdfWindow)) return true;
    if (this.#hints.links.hasHints && pdfWindow && this.#hints.links.ownsView(pdfWindow))
      return true;
    if (this.#hints.copy.hasHints && pdfWindow && this.#hints.copy.ownsView(pdfWindow)) return true;
    if (
      this.input.keyBuffer === 'm' ||
      this.input.keyBuffer === '`' ||
      this.input.keyBuffer === 'dm'
    )
      return /^[a-z0-9]$/.test(key);
    const context = {
      mode: readerBindingMode(this.#surfaceMode),
      keyBuffer: this.input.keyBuffer,
      countBuffer: this.input.countBuffer,
      bindings: this.#dependencies.bindings(),
      allowCountPrefix: this.#surfaceMode === 'normal',
    };
    if (!inputWouldConsume(context, key)) return false;
    const transition = advanceInput(context, key);
    if (transition.kind !== 'execute') return true;
    if (!isReaderActionForMode(this.#surfaceMode, transition.action)) return true;
    const direction = focusDirectionForAction(transition.action);
    return direction ? this.#navigation.canFocusDirection(direction) : true;
  }

  private executeAction(action: ActionId, count: number, pdfWindow: PdfWindow | null): void {
    if (
      this.#scope.disposed ||
      this.#nativeInput.ownsInput ||
      (pdfWindow && this.#commentEditor.ownsView(pdfWindow))
    )
      return;
    if (!isReaderActionForMode(this.#surfaceMode, action)) {
      this.#dependencies.controller.dependencies.logger.debug(
        `ignored Reader action ${String(action)} in ${this.#surfaceMode} mode`,
      );
      return;
    }
    this.#interactionRevision += 1;
    this.#markJumpRevision += 1;
    this.executeReaderAction(action, count, pdfWindow);
  }

  private executeReaderAction(
    action: ReaderAction,
    count: number,
    pdfWindow: PdfWindow | null,
  ): void {
    if (action === 'openCommandPalette') {
      if (!pdfWindow || this.#scope.disposed) return;
      const ownerWindow = readerMainWindow(this.#dependencies.reader);
      if (!ownerWindow) return;
      this.#dependencies.controller.dependencies.main.openCommandPalette(ownerWindow, {
        mode: 'normal',
        bindingMode: 'reader-normal',
        actions: READER_NORMAL_ACTIONS,
        bindings: this.#dependencies.bindings(),
        language: this.keyGuideLanguage(),
        execute: (nextAction, _count) => {
          if (this.#scope.disposed) return;
          const active = this.#navigation.activePdfWindow();
          if (!active || !this.readerViewForWindow(active)) return;
          this.executeAction(nextAction, 0, active);
        },
      });
      return;
    }
    if (!pdfWindow) return;
    const ownerWindow = readerOwnerWindow(this.#dependencies.reader) ?? null;
    const main = this.#dependencies.controller.dependencies.main;
    const number = Math.max(1, count || 1);
    switch (action) {
      case 'mainAddByIdentifier':
        main.openAddByIdentifier(readerMainWindow(this.#dependencies.reader) ?? null);
        return;
      case 'findAllItems':
        main.openAllItemsPicker(ownerWindow);
        return;
      case 'findCollectionItems':
        main.openCollectionItemsPicker(ownerWindow);
        return;
      case 'findNotes':
        main.openNotesPicker(ownerWindow);
        return;
      case 'managePlugins':
        main.openPluginManager(ownerWindow);
        return;
      case 'openNeoSettings':
        main.openSettingsFromReader(ownerWindow);
        return;
      case 'navigateBack':
        main.navigateBackFromReader(ownerWindow, number);
        return;
      case 'navigateForward':
        main.navigateForwardFromReader(ownerWindow, number);
        return;
      case 'showInLibrary':
        main.showReaderItemInLibrary(
          ownerWindow,
          READER_ITEM_TARGET.resolve(this.#dependencies.reader),
        );
        return;
      case 'switchTab':
        main.openTabPicker(ownerWindow);
        return;
      case 'closeCurrentTab':
        main.closeReaderTab(ownerWindow);
        return;
      case 'previousTab':
        main.cycleReaderTab(ownerWindow, -1);
        return;
      case 'nextTab':
        main.cycleReaderTab(ownerWindow, 1);
        return;
      default:
        break;
    }
    if (action === 'addTag' || action === 'removeTag') {
      this.#dependencies.controller.dependencies.main.openReaderTagPicker(
        readerOwnerWindow(this.#dependencies.reader) ?? null,
        READER_ITEM_TARGET.resolve(this.#dependencies.reader),
        action === 'addTag',
      );
      return;
    }
    if (action === 'addToCollection' || action === 'removeFromCollection') {
      const ownerWindow = readerOwnerWindow(this.#dependencies.reader) ?? null;
      this.#dependencies.controller.dependencies.main.openReaderCollectionPicker(
        ownerWindow,
        action === 'addToCollection',
        () => {
          const selectedID = ownerWindow ? readerSelectedTabID(ownerWindow) : undefined;
          if (
            this.#scope.disposed ||
            !selectedID ||
            readerByTabID(selectedID) !== this.#dependencies.reader
          )
            return READER_ITEM_TARGET.resolve(null);
          return READER_ITEM_TARGET.resolve(this.#dependencies.reader);
        },
      );
      return;
    }
    if (action === 'mainYankCitekey') {
      this.showStatus(copyCitekeys(READER_ITEM_TARGET.resolve(this.#dependencies.reader)));
      return;
    }
    if (action === 'toggleReaderSidebarOutline') {
      this.#sidebar.toggle('outline', pdfWindow);
      return;
    }
    if (
      action === 'focusReaderOutline' ||
      action === 'focusReaderMarks' ||
      action === 'focusReaderAnnotations' ||
      action === 'focusReaderThumbnails'
    ) {
      this.#sidebar.focus(
        action === 'focusReaderOutline'
          ? 'outline'
          : action === 'focusReaderMarks'
            ? 'marks'
            : action === 'focusReaderAnnotations'
              ? 'annotations'
              : 'thumbnails',
        pdfWindow,
      );
      return;
    }
    if (action === 'toggleMarksExplorer') {
      this.toggleMarksExplorer(pdfWindow);
      return;
    }
    switch (action) {
      case 'scrollDown': {
        const scroll = (): void => {
          this.clearAnnotation();
          this.scrollBy(pdfWindow, 0, this.scrollStep() * number);
        };
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'scroll'),
          () => {
            scroll();
            return true;
          },
          { admission: 'motion', onUnavailable: scroll },
        );
        break;
      }
      case 'scrollUp': {
        const scroll = (): void => {
          this.clearAnnotation();
          this.scrollBy(pdfWindow, 0, -this.scrollStep() * number);
        };
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'scroll'),
          () => {
            scroll();
            return true;
          },
          { admission: 'motion', onUnavailable: scroll },
        );
        break;
      }
      case 'scrollLeft': {
        const scroll = (): void => {
          this.clearAnnotation();
          this.scrollBy(pdfWindow, -this.scrollStep() * number, 0);
        };
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'scroll'),
          () => {
            scroll();
            return true;
          },
          { admission: 'motion', onUnavailable: scroll },
        );
        break;
      }
      case 'scrollRight': {
        const scroll = (): void => {
          this.clearAnnotation();
          this.scrollBy(pdfWindow, this.scrollStep() * number, 0);
        };
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'scroll'),
          () => {
            scroll();
            return true;
          },
          { admission: 'motion', onUnavailable: scroll },
        );
        break;
      }
      case 'followLink':
      case 'copyTarget':
        this.#hints.copy.close();
        this.#hints.links.close();
        if (this.#flash.isOpen) this.#flash.cancel();
        this.#smoothScroller.stop(true);
        this.input.reset();
        this.clearKeyGuide();
        pdfWindow.focus();
        if (action === 'copyTarget') this.#hints.copyTarget(pdfWindow);
        else this.#hints.followLink(pdfWindow);
        break;
      case 'flashText':
        if (this.#surfaceMode === 'visual') this.#flash.open(pdfWindow, 'visual-end');
        break;
      case 'halfPageDown': {
        const scroll = (): boolean => {
          this.clearAnnotation();
          this.scrollBy(pdfWindow, 0, (this.viewport(pdfWindow) / 2) * number, true);
          return true;
        };
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'scroll'),
          () => scroll(),
          { admission: 'motion', onUnavailable: scroll },
        );
        break;
      }
      case 'halfPageUp': {
        const scroll = (): boolean => {
          this.clearAnnotation();
          this.scrollBy(pdfWindow, 0, (-this.viewport(pdfWindow) / 2) * number, true);
          return true;
        };
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'scroll'),
          () => scroll(),
          { admission: 'motion', onUnavailable: scroll },
        );
        break;
      }
      case 'fullPageDown': {
        const scroll = (): boolean => {
          this.clearAnnotation();
          this.scrollBy(pdfWindow, 0, this.viewport(pdfWindow) * number, true);
          return true;
        };
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'scroll'),
          () => scroll(),
          { admission: 'motion', onUnavailable: scroll },
        );
        break;
      }
      case 'fullPageUp': {
        const scroll = (): boolean => {
          this.clearAnnotation();
          this.scrollBy(pdfWindow, 0, -this.viewport(pdfWindow) * number, true);
          return true;
        };
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'scroll'),
          () => scroll(),
          { admission: 'motion', onUnavailable: scroll },
        );
        break;
      }
      case 'zoomIn':
        this.#navigation.zoom('in', number);
        break;
      case 'zoomOut':
        this.#navigation.zoom('out', number);
        break;
      case 'zoomReset':
        this.#navigation.zoom('reset', 1);
        break;
      case 'scrollTop':
      case 'scrollCenter':
      case 'scrollBottom': {
        const position =
          action === 'scrollTop' ? 'top' : action === 'scrollCenter' ? 'center' : 'bottom';
        const scroll = (): boolean => this.scrollToPagePosition(pdfWindow, position);
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'scroll'),
          () => scroll(),
          { admission: 'motion', onUnavailable: scroll },
        );
        break;
      }
      case 'prevPage':
      case 'nextPage': {
        const direction = action === 'prevPage' ? -number : number;
        const navigate = (): void => this.#navigation.navigatePage(direction, pdfWindow);
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'page-step'),
          (navigation) => this.#navigation.navigatePage(direction, pdfWindow, navigation),
          { admission: 'motion', onUnavailable: navigate },
        );
        break;
      }
      case 'firstPage':
      case 'lastPage': {
        const last = action === 'lastPage';
        const supported = this.#navigation.pageNavigationSupported(pdfWindow);
        const navigate = (): void => this.#navigation.navigateBoundary(count, last, pdfWindow);
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, supported ? 'explicit-page' : 'fallback-scroll'),
          (navigation) => this.#navigation.navigateBoundary(count, last, pdfWindow, navigation),
          { admission: supported ? 'replace' : 'motion', onUnavailable: navigate },
        );
        break;
      }
      case 'openSearch':
        this.#navigation.openSearch(pdfWindow);
        break;
      case 'clearSearch':
        this.#navigation.clearSearch();
        break;
      case 'findNext':
      case 'findPrevious': {
        const next = action === 'findNext';
        const find = (): void => {
          this.#navigation.find(next, pdfWindow);
        };
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'search'),
          (navigation) => this.#navigation.find(next, pdfWindow, navigation),
          { onUnavailable: find },
        );
        break;
      }
      case 'prevAnnotation':
        this.navigateAnnotation(-1, pdfWindow, action);
        break;
      case 'nextAnnotation':
        this.navigateAnnotation(1, pdfWindow, action);
        break;
      case 'prevHeading':
      case 'nextHeading':
      case 'prevFigure':
      case 'nextFigure':
      case 'prevTable':
      case 'nextTable': {
        const revision = this.#interactionRevision;
        const view = this.readerViewForWindow(pdfWindow);
        const category = action.endsWith('Heading')
          ? 'heading'
          : action.endsWith('Figure')
            ? 'figure'
            : 'table';
        if (category !== 'heading' && this.#captions.state === 'idle')
          this.showStatus(t('reader.sidebar.captionsLoading', this.keyGuideLanguage()), 3000);
        void this.#navigation
          .traverseOutline(
            category,
            action.startsWith('prev') ? -1 : 1,
            pdfWindow,
            () =>
              !this.#scope.disposed &&
              this.#interactionRevision === revision &&
              this.readerViewForWindow(pdfWindow) === view &&
              this.#navigation.activePdfWindow() === pdfWindow,
          )
          .catch((error: unknown) =>
            this.#dependencies.controller.dependencies.logger.debug(
              `reader Outline traversal failed: ${String(error)}`,
            ),
          );
        break;
      }
      case 'prevBookmark':
      case 'nextBookmark':
        void this.#marks
          .traverse(
            this.#dependencies.reader,
            pdfWindow,
            action === 'prevBookmark' ? -1 : 1,
            (key) => this.#annotationNavigation.rememberAnnotation(key),
          )
          .catch((error: unknown) =>
            this.#dependencies.controller.dependencies.logger.debug(
              `reader bookmark traversal failed: ${String(error)}`,
            ),
          );
        break;
      case 'editAnnotation':
        if (annotationCommentEditorEnabled(this.#dependencies.controller.dependencies.preferences))
          void this.openAnnotationComment();
        break;
      case 'deleteAnnotation':
        void this.deleteAnnotation();
        break;
      case 'recolorYellow':
        void this.recolorAnnotation(COLORS.yellow);
        break;
      case 'recolorRed':
        void this.recolorAnnotation(COLORS.red);
        break;
      case 'recolorGreen':
        void this.recolorAnnotation(COLORS.green);
        break;
      case 'recolorBlue': {
        if (this.#annotationNavigation.selectedAnnotationKey(this.#dependencies.reader)) {
          void this.recolorAnnotation(COLORS.blue);
          break;
        }
        const scroll = (): boolean => this.scrollToPagePosition(pdfWindow, 'bottom');
        this.executeReaderNavigation(
          pdfWindow,
          readerActionIntent(action, 'scroll'),
          () => scroll(),
          { admission: 'motion', onUnavailable: scroll },
        );
        break;
      }
      case 'recolorPurple':
        void this.recolorAnnotation(COLORS.purple);
        break;
      case 'filterYellow':
        this.filterByColor(COLORS.yellow);
        break;
      case 'filterRed':
        this.filterByColor(COLORS.red);
        break;
      case 'filterGreen':
        this.filterByColor(COLORS.green);
        break;
      case 'filterBlue':
        this.filterByColor(COLORS.blue);
        break;
      case 'filterPurple':
        this.filterByColor(COLORS.purple);
        break;
      case 'filterClear':
        this.filterByColor(null);
        break;
      case 'yankAnnotation':
        this.yankAnnotation(false);
        break;
      case 'yankAnnotationComment':
        this.yankAnnotation(true);
        break;
      case 'enterVisual':
        if (this.modeEnabled('visual')) this.#selectionRange.enter(pdfWindow);
        break;
      case 'openSelectionActions':
        this.openSelectionActions(pdfWindow);
        break;
      case 'enterInsert':
        if (annotationCommentEditorEnabled(this.#dependencies.controller.dependencies.preferences))
          void this.openAnnotationComment();
        else this.enterNativeInput();
        break;
      case 'exitMode':
        this.setMode('normal');
        pdfWindow.getSelection()?.removeAllRanges();
        break;
      case 'extendDown':
        this.#selectionRange.extendByLine(pdfWindow, 1);
        break;
      case 'extendUp':
        this.#selectionRange.extendByLine(pdfWindow, -1);
        break;
      case 'extendLeft':
        this.#selectionRange.modify(pdfWindow, 'backward', 'character');
        break;
      case 'extendRight':
        this.#selectionRange.modify(pdfWindow, 'forward', 'character');
        break;
      case 'extendWordForward':
        this.#selectionRange.modify(pdfWindow, 'forward', 'word');
        break;
      case 'extendWordBackward':
        this.#selectionRange.modify(pdfWindow, 'backward', 'word');
        break;
      case 'extendLineStart':
        this.#selectionRange.extendLineBoundary(pdfWindow, false);
        break;
      case 'extendLineEnd':
        this.#selectionRange.extendLineBoundary(pdfWindow, true);
        break;
      case 'extendSentenceForward':
        this.#selectionRange.modify(pdfWindow, 'forward', 'sentence');
        break;
      case 'extendSentenceBackward':
        this.#selectionRange.modify(pdfWindow, 'backward', 'sentence');
        break;
      case 'extendParagraphForward':
        this.#selectionRange.modify(pdfWindow, 'forward', 'paragraph');
        break;
      case 'extendParagraphBackward':
        this.#selectionRange.modify(pdfWindow, 'backward', 'paragraph');
        break;
      case 'highlightYellow':
        void this.highlight(pdfWindow, COLORS.yellow);
        break;
      case 'highlightRed':
        void this.highlight(pdfWindow, COLORS.red);
        break;
      case 'highlightGreen':
        void this.highlight(pdfWindow, COLORS.green);
        break;
      case 'highlightBlue':
        void this.highlight(pdfWindow, COLORS.blue);
        break;
      case 'highlightPurple':
        void this.highlight(pdfWindow, COLORS.purple);
        break;
      case 'underlineSelection':
        void this.highlight(pdfWindow, this.defaultHighlightColor(), false, 'underline');
        break;
      case 'addNote':
        void this.highlight(pdfWindow, this.defaultHighlightColor(), true);
        break;
      case 'copySelection':
        this.copySelection(pdfWindow);
        break;
      case 'searchSelection':
        this.searchSelection(pdfWindow);
        break;
      case 'swapVisualEnds':
        this.#selectionRange.swapEnds(pdfWindow);
        break;
      case 'toggleReaderSplitHorizontal':
        this.#navigation.toggleSplit('horizontal');
        break;
      case 'toggleReaderSplitVertical':
        this.#navigation.toggleSplit('vertical');
        break;
      case 'focusReaderSplitLeft':
        this.#navigation.focusDirection('left');
        break;
      case 'focusReaderSplitDown':
        this.#navigation.focusDirection('down');
        break;
      case 'focusReaderSplitUp':
        this.#navigation.focusDirection('up');
        break;
      case 'focusReaderSplitRight':
        this.#navigation.focusDirection('right');
        break;
      default:
        return assertNever(action);
    }
  }

  private themeRoot(root: HTMLElement): () => void {
    const window = root.ownerDocument.defaultView;
    if (!window) return () => undefined;
    let manager = this.#themeManagers.get(window);
    if (!manager) {
      manager = new ThemeManager(window, this.#dependencies.controller.dependencies.preferences);
      this.#themeManagers.set(window, manager);
    }
    return manager.add(root);
  }

  private createIndicator(document: Document | null): HTMLElement | null {
    if (!document) return null;
    const existing = document.getElementById('zotero-vim-mode-indicator');
    existing?.remove();
    const indicator = document.createElement('div');
    indicator.id = 'zotero-vim-mode-indicator';
    indicator.style.cssText = `position:fixed;bottom:10px;right:14px;z-index:9999;padding:4px 8px;border:1px solid ${THEME_VARS.border};border-radius:4px;color:${THEME_VARS.text};background:${THEME_VARS.elevated};box-shadow:0 4px 16px ${THEME_VARS.shadow};font:12px monospace;pointer-events:none;display:none`;
    document.body?.appendChild(indicator);
    return indicator;
  }

  private setMode(mode: ReaderMode): void {
    this.#interactionRevision += 1;
    const previousMode = this.#surfaceMode;
    if (this.#flash.isOpen) this.#flash.cancel();
    if (this.#hints.links.hasHints) this.#hints.links.cancelHints();
    this.#hints.copy.close();
    if (previousMode === 'visual' && mode !== 'visual') {
      this.#selectionActions.close();
      this.#dependencies.selection?.clearOwner(this);
    }
    if (mode !== 'normal') this.#smoothScroller.stop(true);
    this.#surfaceMode = mode;
    this.input.reset();
    this.clearKeyGuide();
    if (mode !== 'visual') this.clearNativeSelection();
    if (mode !== 'visual') this.#selectionRange.leave();
    this.updateIndicator();
  }

  private clearKeyGuide(): void {
    this.#prefixGuide.clear();
  }

  private refreshKeyGuide(): void {
    this.#prefixGuide.refresh(() => {
      const config = keyGuideConfig(this.#dependencies.controller.dependencies.preferences);
      const pdfWindow = this.#navigation.activePdfWindow();
      return {
        input: this.input,
        mode: readerBindingMode(this.mode),
        bindings: this.#dependencies.bindings(),
        enabled:
          config.enabled &&
          !this.#nativeInput.ownsInput &&
          !(pdfWindow && this.#commentEditor.ownsView(pdfWindow)) &&
          this.mode === 'normal' &&
          isLeaderPrefix(this.input.keyBuffer),
        language: this.keyGuideLanguage(),
        delayMs: config.delayMs,
        fontSizePx: config.fontSizePx,
        document: readerWindow(this.#dependencies.reader)?.document ?? null,
        theme: { add: (root) => this.themeRoot(root as HTMLElement) },
      };
    });
  }

  private keyGuideLanguage(): KeyGuideLanguage {
    return neoCommandLanguage(
      this.#dependencies.controller.dependencies.preferences,
      typeof Zotero === 'undefined' ? '' : (Zotero.locale ?? ''),
    );
  }

  private updateIndicator(): void {
    const indicator = this.state.indicator;
    if (!indicator) return;
    const pdfWindow = this.#navigation.activePdfWindow();
    const inputOwner = this.#nativeInput.ownsInput
      ? 'NATIVE'
      : pdfWindow && this.#commentEditor.ownsView(pdfWindow)
        ? 'COMMENT'
        : null;
    if (inputOwner) {
      indicator.style.display = 'block';
      indicator.textContent = `-- ${inputOwner} --`;
      indicator.style.color = THEME_VARS.modeInsertText;
      indicator.style.background = THEME_VARS.modeInsert;
      return;
    }
    if (this.mode === 'normal' && !this.input.keyBuffer && !this.input.countBuffer) {
      indicator.style.display = 'none';
      return;
    }
    indicator.style.display = 'block';
    if (this.mode === 'visual') {
      const selected = annotationText(
        this.#navigation.activePdfWindow()?.getSelection()?.toString() ?? '',
      );
      const pending = this.input.countBuffer || this.input.keyBuffer;
      indicator.textContent = `SELECT · ${selected.length} chars · y copy · Enter actions · s Flash · Esc cancel${pending ? `  ${this.input.countBuffer}${this.input.keyBuffer}` : ''}`;
      indicator.style.color = THEME_VARS.modeVisualText;
      indicator.style.background = THEME_VARS.modeVisual;
      return;
    }
    indicator.textContent = `-- ${this.mode.toUpperCase()} --${this.input.countBuffer || this.input.keyBuffer ? `  ${this.input.countBuffer}${this.input.keyBuffer}` : ''}`;
    indicator.style.color = THEME_VARS.modeNormalText;
    indicator.style.background = THEME_VARS.modeNormal;
  }

  private showStatus(message: string, duration = 2000): void {
    const indicator = this.state.indicator;
    if (!indicator) return;
    indicator.style.display = 'block';
    indicator.textContent = message;
    const success = message.startsWith('✓');
    const info = message.startsWith('→') || message.startsWith('▶');
    indicator.style.color = success
      ? THEME_VARS.statusSuccessText
      : info
        ? THEME_VARS.statusInfoText
        : THEME_VARS.statusErrorText;
    indicator.style.background = success
      ? THEME_VARS.statusSuccess
      : info
        ? THEME_VARS.statusInfo
        : THEME_VARS.statusError;
    this.schedule(duration, () => this.updateIndicator());
  }

  private modeEnabled(mode: Exclude<ReaderMode, 'normal'>): boolean {
    return readerModeEnabled(this.#dependencies.controller.dependencies.preferences, mode);
  }

  private scrollStep(): number {
    return readerScrollStep(this.#dependencies.controller.dependencies.preferences);
  }

  private defaultHighlightColor(): AnnotationColor {
    return COLORS[
      readerDefaultHighlightColor(this.#dependencies.controller.dependencies.preferences)
    ];
  }

  private scrollContainer(pdfWindow: PdfWindow): HTMLElement {
    return readerScrollContainer(pdfWindow);
  }

  private scrollBy(pdfWindow: PdfWindow, x: number, y: number, smooth = false): boolean {
    const container = this.scrollContainer(pdfWindow);
    if (smooth && this.#smoothScroller.mode !== 'step') {
      try {
        container.scrollBy(cloneInto({ left: x, top: y, behavior: 'smooth' as const }, pdfWindow));
        return true;
      } catch {
        // Fall through to coordinate scrolling where a host view rejects options objects.
      }
    }
    container.scrollBy(x, y);
    return true;
  }

  private scrollTo(pdfWindow: PdfWindow, top: number, smooth = false): boolean {
    const container = this.scrollContainer(pdfWindow);
    if (smooth && this.#smoothScroller.mode !== 'step') {
      try {
        container.scrollTo(cloneInto({ top, behavior: 'smooth' as const }, pdfWindow));
        return true;
      } catch {
        // Fall through to numeric scrollTo.
      }
    }
    container.scrollTo(0, top);
    return true;
  }

  private viewport(pdfWindow: PdfWindow): number {
    return this.scrollContainer(pdfWindow).clientHeight || 600;
  }

  private clearAnnotation(): void {
    this.#annotationNavigation.clearAnnotation();
  }

  private scrollToPagePosition(
    pdfWindow: PdfWindow,
    position: 'top' | 'center' | 'bottom',
  ): boolean {
    const top = readerPagePositionTop(pdfWindow, position);
    return top === null ? false : this.scrollTo(pdfWindow, top, true);
  }

  private readerViewForWindow(pdfWindow: PdfWindow): ReaderViewRuntime | null {
    return readerViewForWindow(this.#dependencies.reader, pdfWindow);
  }

  private invocationCurrent(pdfWindow: PdfWindow): () => boolean {
    const reader = this.#dependencies.reader;
    const view = this.readerViewForWindow(pdfWindow);
    const revision = this.#interactionRevision;
    const tabID = reader.tabID;
    const ownerWindow = readerOwnerWindow(reader);
    return () => {
      if (
        this.#scope.disposed ||
        this.#interactionRevision !== revision ||
        !view ||
        isDeadObject(pdfWindow) ||
        isDeadObject(view)
      )
        return false;
      return (
        readerViewIsLive(reader, view, pdfWindow) &&
        this.#navigation.activePdfWindow() === pdfWindow &&
        (!tabID || !ownerWindow || readerSelectedTabID(ownerWindow) === tabID)
      );
    };
  }

  private async highlight(
    pdfWindow: PdfWindow,
    color: AnnotationColor,
    focusComment = false,
    annotationType: 'highlight' | 'underline' = 'highlight',
  ): Promise<void> {
    const isCurrent = this.invocationCurrent(pdfWindow);
    if (!isCurrent()) return;
    const params =
      this.#selectionWindow === pdfWindow &&
      this.#selectionView === this.readerViewForWindow(pdfWindow)
        ? this.state.selectionParams
        : null;
    const selection = pdfWindow.getSelection();
    const hasDomSelection = selection && !selection.isCollapsed;
    const computed = hasDomSelection ? computeSelectionPosition(pdfWindow, selection) : null;
    if (hasDomSelection && (!computed || computed.position === null)) {
      this.showStatus(
        computed?.failure === 'unsupported-page-span'
          ? '✗ unsupported page span: select one page or two adjacent pages'
          : '✗ no complete PDF selection rects',
        2000,
      );
      return;
    }
    const useNativeParams =
      params?.annotation &&
      (!hasDomSelection ||
        annotationText(params.annotation.text ?? '') === annotationText(selection.toString()));
    let text: string;
    let position: unknown;
    let sortIndex: string | undefined;
    let pageLabel: string | undefined;
    if (useNativeParams) {
      ({ text = '', position, sortIndex, pageLabel } = params.annotation);
    } else {
      if (!selection || !computed || computed.position === null) {
        this.showStatus('✗ no selection', 1500);
        return;
      }
      text = selection.toString();
      ({ position, sortIndex, pageLabel } = computed);
    }
    const key = await this.createAnnotation(
      text,
      position,
      sortIndex,
      pageLabel,
      color,
      annotationType,
      isCurrent,
    );
    // An admitted native save survives retirement; only its presentation is conditional.
    if (!key || !isCurrent()) return;
    this.clearNativeSelection();
    this.#annotationNavigation.rememberAnnotation(key);
    if (!useNativeParams) {
      selection?.removeAllRanges();
      if (!focusComment) this.setMode('normal');
    }
    this.showStatus('✓ annotated', 1200);
    if (focusComment) {
      if (!isCurrent()) return;
      this.#nativeInput.release();
      this.setMode('normal');
      // open() captures the active window synchronously; never resolve the host selection anew.
      if (this.#navigation.activePdfWindow() === pdfWindow) await this.#commentEditor.open(key);
    }
  }

  private async createAnnotation(
    text: string,
    position: unknown,
    sortIndex: string | undefined,
    pageLabel: string | undefined,
    color: AnnotationColor,
    annotationType: 'highlight' | 'underline',
    isCurrent: () => boolean,
  ): Promise<string | null> {
    const attachment = this.itemForReader(this.#dependencies.reader);
    if (!attachment?.id || attachment.libraryID === undefined) {
      this.showStatus('✗ no attachment', 2000);
      return null;
    }
    try {
      const item = new (zoteroRuntime().Item)('annotation');
      item.libraryID = attachment.libraryID;
      item.parentID = attachment.id;
      item.annotationType = annotationType;
      item.annotationColor = color;
      item.annotationText = annotationText(text);
      item.annotationComment = '';
      item.annotationIsExternal = false;
      if (sortIndex) item.annotationSortIndex = sortIndex;
      if (pageLabel) item.annotationPageLabel = pageLabel;
      if (position)
        item.annotationPosition =
          typeof position === 'string' ? position : JSON.stringify(position);
      await item.saveTx();
      return item.key;
    } catch (error) {
      if (isCurrent()) this.showStatus(`✗ ${String(error).slice(0, 40)}`, 4000);
      return null;
    }
  }

  selectionContext(): ReaderSelectionContext | null {
    if (this.#surfaceMode !== 'visual') return null;
    const pdfWindow = this.#navigation.activePdfWindow();
    if (!pdfWindow) return null;
    const selection = pdfWindow.getSelection();
    if (!selection || selection.isCollapsed) return null;
    const text = annotationText(selection.toString());
    if (!text) return null;
    const computed = computeSelectionPosition(pdfWindow, selection);
    return {
      text,
      itemID: this.#dependencies.reader.itemID ?? null,
      pageLabel: computed?.pageLabel ?? null,
      position: computed?.position ?? null,
    };
  }

  private openSelectionActions(pdfWindow: PdfWindow): void {
    const context = this.selectionContext();
    if (!context) {
      this.showStatus('✗ no selection', 1500);
      return;
    }
    this.#dependencies.selection?.noteOwner(this);
    this.#selectionActions.open(pdfWindow, context);
  }

  private selectionActionDefinitions(
    context: ReaderSelectionContext,
    pdfWindow: PdfWindow,
  ): readonly ReaderSelectionActionDefinition[] {
    const language = this.keyGuideLanguage();
    const actions: ReaderSelectionActionDefinition[] = [];
    const translate = zoteroRuntime().PDFTranslate?.api?.translate;
    const pluginID = this.#dependencies.selection?.pluginID() ?? null;
    if (typeof translate === 'function' && pluginID) {
      actions.push({
        id: 'pdf-translate.translate',
        label: language === 'zh-CN' ? '翻译' : 'Translate',
        run: async (selection) => {
          const task = await translate(selection.text, {
            pluginID,
            ...(selection.itemID === null ? {} : { itemID: selection.itemID }),
          });
          const result = task.result?.trim();
          if (!result) throw new Error('empty translation result');
          return { title: language === 'zh-CN' ? '翻译结果' : 'Translation', body: result };
        },
      });
    }
    const addBuiltIn = (id: string, action: ActionId): void => {
      actions.push({
        id,
        label: ACTION_LABELS[action][language],
        run: () => this.executeAction(action, 1, pdfWindow),
      });
    };
    actions.push({
      id: 'neo.capture-note',
      label: language === 'zh-CN' ? '捕获到笔记' : 'Capture to note',
      isAvailable: (selection) => selection.itemID !== null && !!selection.text.trim(),
      run: async (selection) => {
        const receipt =
          await this.#dependencies.controller.dependencies.main.captureReaderSelectionToNote(
            selection,
            readerOwnerWindow(this.#dependencies.reader) ?? null,
          );
        if (receipt && 'retired' in receipt) return { retired: true };
        if (receipt) {
          return {
            status:
              language === 'zh-CN'
                ? `✓ 已保存到「${receipt.noteTitle}」`
                : `✓ Saved to “${receipt.noteTitle}”`,
          };
        }
      },
    });
    addBuiltIn('neo.underline', 'underlineSelection');
    addBuiltIn('neo.add-note', 'addNote');
    actions.push(...(this.#dependencies.selection?.registered(context) ?? []));
    return actions;
  }

  private copySelection(pdfWindow: PdfWindow): void {
    const selection = pdfWindow.getSelection();
    if (selection && !selection.isCollapsed)
      this.copyText(selectionClipboardText(selection.toString()));
    this.setMode('normal');
    selection?.removeAllRanges();
    pdfWindow.focus();
  }

  private searchSelection(pdfWindow: PdfWindow): void {
    const selection = pdfWindow.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = annotationText(selection.toString());
    if (!text) return;
    const reader = this.#dependencies.reader;
    const searchWindow = readerWindow(reader);
    openReaderSelectionSearch(reader);
    this.schedule(200, () => setReaderSearchText(searchWindow, text));
    this.setMode('normal');
    selection.removeAllRanges();
  }

  private navigateAnnotation(
    direction: -1 | 1,
    pdfWindow: PdfWindow,
    action: 'prevAnnotation' | 'nextAnnotation',
  ): void {
    const attachment = this.itemForReader(this.#dependencies.reader);
    let annotations =
      attachment
        ?.getAnnotations?.()
        .filter((annotation) =>
          ['highlight', 'underline', 'note', 'text'].includes(annotation.annotationType ?? ''),
        ) ?? [];
    const filterColor = this.#annotationNavigation.filterColor();
    if (filterColor)
      annotations = annotations.filter((annotation) => annotation.annotationColor === filterColor);
    annotations = [...annotations].sort((left, right) =>
      (left.annotationSortIndex ?? '').localeCompare(right.annotationSortIndex ?? ''),
    );
    if (!annotations.length) {
      this.showStatus('✗ no annotations', 2000);
      return;
    }
    const selectedKey = this.#annotationNavigation.selectedAnnotationKey(this.#dependencies.reader);
    const current = selectedKey
      ? annotations.findIndex((annotation) => annotation.key === selectedKey)
      : -1;
    const index =
      current < 0
        ? direction > 0
          ? 0
          : annotations.length - 1
        : (current + direction + annotations.length) % annotations.length;
    const target = annotations[index];
    if (!target) return;
    this.#annotationNavigation.rememberAnnotation(target.key);
    this.executeReaderNavigation(
      pdfWindow,
      readerActionIntent(action, 'annotation'),
      (navigation) => this.navigateToAnnotation(target, navigation),
    );
    this.showStatus(`→ ann ${index + 1}/${annotations.length}`, 1500);
  }

  private navigateToAnnotation(
    annotation: AnnotationRuntime,
    navigation?: ReaderNativeNavigation,
  ): unknown {
    return selectReaderAnnotation(this.#dependencies.reader, annotation.key, navigation);
  }

  private async deleteAnnotation(): Promise<void> {
    const language = this.keyGuideLanguage();
    const target = this.selectedAnnotation();
    if (!target?.eraseTx) {
      this.showStatus('✗ select an annotation first', 2000);
      return;
    }
    const window = readerOwnerWindow(this.#dependencies.reader);
    if (!window) {
      this.showStatus(`✗ ${t('status.readerAnnotationDeleteUnconfirmable', language)}`, 2000);
      return;
    }
    const summary = t('target.readerAnnotation', language);
    try {
      const prompt = t('confirm.readerAnnotationDelete', language).replace('{target}', summary);
      if (!window.confirm(prompt)) {
        this.showStatus(
          `→ ${t('status.destructiveCancelled', language).replace('{target}', summary)}`,
          2000,
        );
        return;
      }
      await deleteReaderAnnotation(target);
      const reader = this.#dependencies.reader;
      try {
        if (this.#annotationNavigation.selectedAnnotationKey(reader) === target.key) {
          clearAnnotationSelection(reader);
        }
      } catch {
        // The permanent erase succeeded; host selection cleanup is best-effort.
      }
      this.#annotationNavigation.clearAnnotation(target.key);
      this.showStatus(
        `✓ ${t('status.readerAnnotationDeleteComplete', language).replace('{target}', summary)}`,
        1500,
      );
    } catch (error) {
      this.#dependencies.controller.dependencies.logger.debug(
        `delete Reader annotation failed: ${String(error)}`,
      );
      this.showStatus(
        `✗ ${t('status.readerAnnotationDeleteFailed', language).replace('{target}', summary)}`,
        2000,
      );
    }
  }

  private async recolorAnnotation(color: AnnotationColor): Promise<void> {
    const target = this.selectedAnnotation();
    if (!target) {
      this.showStatus('✗ select an annotation first', 2000);
      return;
    }
    target.annotationColor = color;
    await target.saveTx();
    this.showStatus('✓ recolored', 1200);
  }

  private filterByColor(color: AnnotationColor | null): void {
    setAnnotationColorFilter(this.#dependencies.reader, color ? [color] : []);
    this.#annotationNavigation.setFilterColor(color);
    this.showStatus(color ? '✓ filter set' : '✓ filter cleared', 1200);
  }

  private yankAnnotation(comment: boolean): void {
    const annotation = this.selectedAnnotation();
    const text = comment ? annotation?.annotationComment : annotation?.annotationText;
    if (!text) {
      this.showStatus(comment ? '✗ annotation has no comment' : '✗ annotation has no text', 2000);
      return;
    }
    this.copyText(annotationText(text));
  }

  private copyText(text: string): void {
    try {
      copyToClipboard(text);
      this.showStatus(`✓ copied ${text.length} chars`, 1200);
    } catch (error) {
      this.#dependencies.controller.dependencies.logger.debug(`copy failed: ${String(error)}`);
    }
  }

  private selectedAnnotation(): AnnotationRuntime | null {
    const key = this.#annotationNavigation.selectedAnnotationKey(this.#dependencies.reader);
    if (!key) return null;
    return (
      this.itemForReader(this.#dependencies.reader)
        ?.getAnnotations?.()
        .find((annotation) => annotation.key === key) ?? null
    );
  }

  private enterNativeInput(): void {
    if (this.#commentEditor.ownsInput) void this.handOverNativeEditor();
    this.setMode('normal');
    this.#nativeInput.enter();
    this.#sidebar.deactivate();
    this.#smoothScroller.stop(true);
    this.updateIndicator();
  }

  private async openAnnotationComment(): Promise<void> {
    const key = this.#annotationNavigation.selectedAnnotationKey(this.#dependencies.reader);
    if (!key) {
      this.showStatus('✗ select an annotation first', 2000);
      return;
    }
    this.#nativeInput.release();
    this.setMode('normal');
    this.#annotationNavigation.rememberAnnotation(key);
    await this.#commentEditor.open(key);
  }

  private async resolveAnnotation(key: string): Promise<AnnotationRuntime | null> {
    const attachment = this.itemForReader(this.#dependencies.reader);
    if (!attachment) return null;
    let annotation =
      attachment.getAnnotations?.().find((candidate) => candidate.key === key) ?? null;
    if (!annotation && attachment.libraryID !== undefined)
      annotation = zoteroRuntime().Items.getByLibraryAndKey?.(attachment.libraryID, key) || null;
    if (annotation?.loadDataType) await annotation.loadDataType('annotation');
    return annotation;
  }

  private async handOverNativeEditor(): Promise<void> {
    this.setMode('normal');
    try {
      await this.#commentEditor.handOver();
    } catch (error) {
      this.#dependencies.controller.dependencies.logger.debug(
        `comment editor handoff failed: ${String(error)}`,
      );
    }
  }

  private async annotationForSave(
    target: AnnotationCommentTarget,
  ): Promise<AnnotationRuntime | null> {
    const items = zoteroRuntime().Items;
    let annotation: AnnotationRuntime | null = null;
    if (target.itemID !== null) {
      const cached = items.get(target.itemID);
      if (cached) annotation = cached;
    }
    if (!annotation && target.libraryID !== null) {
      const indexed = items.getByLibraryAndKey?.(target.libraryID, target.key) ?? null;
      if (indexed) annotation = indexed;
    }
    if (!annotation && target.libraryID !== null && items.getByLibraryAndKeyAsync) {
      const fetched = await items.getByLibraryAndKeyAsync(target.libraryID, target.key);
      if (fetched) annotation = fetched;
    }
    if (annotation?.loadDataType) await annotation.loadDataType('annotation');
    return annotation;
  }

  private toggleMarksExplorer(pdfWindow: PdfWindow): void {
    this.#sidebar.toggle('marks', pdfWindow);
  }

  /**
   * Starts a smooth hold only for an executable resolved scroll action. The physical key may be
   * direct (`j`/`k` or a custom single-key remap) or the continuation of a multi-key chord such
   * as `zh`/`zl`; pending chord state is cleared before holding so repeated continuations cannot
   * fall through to another Normal action.
   */
  private startSmoothHold(event: KeyboardEvent, pdfWindow: PdfWindow, key: string): boolean {
    if (this.#smoothScroller.isRepeat(event)) {
      this.input.replace(this.input.keyBuffer, this.input.countBuffer);
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
    if (
      this.#smoothScroller.mode === 'step' ||
      this.#surfaceMode !== 'normal' ||
      this.input.countBuffer ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return false;
    const bindings = this.#dependencies.bindings();
    const decision = advanceInput(
      {
        mode: 'reader-normal',
        keyBuffer: this.input.keyBuffer,
        countBuffer: this.input.countBuffer,
        bindings,
        allowCountPrefix: true,
      },
      key,
    );
    if (decision.kind !== 'execute') return false;
    const spec = smoothScrollSpec(decision.action);
    if (!spec) return false;
    const start = (): boolean => this.#smoothScroller.start(pdfWindow, event.key, spec);
    this.executeReaderNavigation(
      pdfWindow,
      readerActionIntent(decision.action, 'scroll'),
      (navigation) => {
        if (navigation.policy.kind !== 'record') return start();
        const { promise, resolve } = Promise.withResolvers<boolean>();
        if (!this.#smoothScroller.start(pdfWindow, event.key, spec, () => resolve(true)))
          resolve(false);
        return promise;
      },
      { admission: 'motion', onUnavailable: start },
    );
    const hadPendingSequence = !!this.input.keyBuffer;
    this.input.reset();
    if (hadPendingSequence) {
      this.clearKeyGuide();
      this.updateIndicator();
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  private itemForReader(reader: ReaderRuntime): ItemRuntime | null {
    if (reader.itemID === undefined) return null;
    return zoteroRuntime().Items.get(reader.itemID) || null;
  }

  private annotationPageRatio(
    pdfWindow: PdfWindow,
    annotation: ItemRuntime,
  ): Promise<{ pageIndex: number; ratio: number }> {
    return readerAnnotationPageRatio(pdfWindow, annotation.annotationPosition);
  }

  private async scrollToPageRatio(
    pdfWindow: PdfWindow,
    pageIndex: number,
    ratio: number,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    for (let attempt = 0; attempt <= 10; attempt += 1) {
      const reader = this.#dependencies.reader;
      const ownerWindow = readerOwnerWindow(reader);
      if (
        this.#scope.disposed ||
        !isCurrent() ||
        !this.readerViewForWindow(pdfWindow) ||
        (reader.tabID && (!ownerWindow || readerSelectedTabID(ownerWindow) !== reader.tabID))
      )
        return false;
      const top = readerPageRatioTop(pdfWindow, pageIndex, ratio);
      if (top !== null) {
        this.scrollTo(pdfWindow, top);
        return true;
      }
      if (attempt === 10) return false;
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 80);
      await promise;
    }
    return false;
  }

  private scrollDocumentToRatio(
    pdfWindow: PdfWindow,
    ratio: number,
    isCurrent: () => boolean,
  ): boolean {
    if (!isCurrent()) return false;
    const container = this.scrollContainer(pdfWindow);
    this.scrollTo(pdfWindow, ratio * Math.max(0, container.scrollHeight - container.clientHeight));
    return true;
  }

  private schedule(delay: number, task: () => void): ReaderTimer {
    const timer = setTimeout(() => {
      if (!this.#pendingTimers.delete(timer) || this.#scope.disposed) return;
      task();
    }, delay);
    this.#pendingTimers.add(timer);
    if (this.#scope.disposed) this.clearTimer(timer);
    return timer;
  }

  private clearTimer(timer: ReaderTimer | null): void {
    if (timer !== null) this.#pendingTimers.delete(timer);
    clearTimeout(timer ?? undefined);
  }
}
