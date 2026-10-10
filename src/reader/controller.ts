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
import { CleanupScope } from '../core/cleanup';
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
import {
  appendInputKey,
  bindingEqualsInput,
  bindingMatchesInputPrefix,
} from '../input/key-sequence';
import { resolveBindings, type BindingMap, type Mode } from '../input/bindings';
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
import { ReaderOutline, type OutlineHost } from './outline';
import { ReaderSidebarOverlay } from './sidebar-overlay';
import { ReaderMarksExplorer } from './marks-explorer';
import { ReaderLinkHints } from './link-hints';
import { ReaderCommentEditor, type AnnotationCommentTarget } from './comment-editor';
import { ReaderNativeInput } from './native-input';
import { ReaderHostKeyBridge } from './host-key-bridge';
import { ReaderJumpHostAdapter } from './jump-host';
import { ReaderJumpHistoryBridge } from './jump-history-bridge';
import type {
  ReaderNativeNavigation,
  ReaderOwnedCompletion,
  ReaderOwnedNavigation,
} from './jump-history-bridge';
import { ReaderNavigation, type ReaderNavigationCommand } from './navigation';
import { ReaderViewLifecycle } from './view-lifecycle';
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

type ReaderEventName = 'renderToolbar' | 'renderTextSelectionPopup';
type ReaderEventListener = (event: ReaderEventRuntime) => void;

interface ReaderService {
  readonly _readers?: readonly ReaderRuntime[] | ReadonlyMap<unknown, ReaderRuntime>;
  registerEventListener(
    name: ReaderEventName,
    listener: ReaderEventListener,
    pluginID: string,
  ): void;
  unregisterEventListener(name: ReaderEventName, listener: ReaderEventListener): void;
  getByTabID?(tabID: string): ReaderRuntime | null;
}

interface ZoteroRuntime {
  readonly Reader: ReaderService;
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

interface TabRuntime {
  readonly id?: string;
}

type MainWindowRuntime = MainWindow & {
  readonly Zotero_Tabs?: {
    readonly selectedID?: string;
    readonly _tabs?: readonly TabRuntime[];
    readonly tabs?: readonly TabRuntime[];
  };
};

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

interface ComputedAnnotationPosition {
  readonly position: string;
  readonly sortIndex: string;
  readonly pageLabel: string;
}

function zoteroRuntime(): ZoteroRuntime {
  // Zotero's typed surface intentionally omits private reader internals; this is the single validated host boundary.
  const host = Zotero as unknown as ZoteroRuntime;
  return host;
}

function asPdfWindow(window: Window | undefined): PdfWindow | null {
  const pdfWindow = window as PdfWindow | undefined;
  return pdfWindow ?? null;
}

function annotationText(value: string): string {
  return value.normalize('NFKC').replace(/\n/g, ' ').replace(/ {2,}/g, ' ').trim();
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Reader action: ${String(value)}`);
}
function readerBindingMode(mode: ReaderMode): Extract<Mode, 'reader-normal' | 'reader-select'> {
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
  readonly #sessionsByItem = new Map<number, ReaderSession>();
  readonly #pending = new Set<string>();
  readonly #waitTimers = new Map<string, ReaderTimer>();
  #toolbarListener: ReaderEventListener | null = null;
  #selectionPopupListener: ReaderEventListener | null = null;
  #pluginID: string | null = null;
  #lastSelection: AnnotationSelectionParams | null = null;
  #lastSelectionAt = 0;
  readonly #selectionActions = new ReaderSelectionActionRegistry();
  #selectionOwner: ReaderSession | null = null;

  constructor(dependencies: ReaderControllerDependencies) {
    this.#dependencies = dependencies;
  }

  start(pluginId: string): void {
    if (this.#pluginID === pluginId) return;
    this.shutdown();
    const service = zoteroRuntime().Reader;
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
      service.registerEventListener('renderToolbar', toolbarListener, pluginId);
      service.registerEventListener('renderTextSelectionPopup', selectionPopupListener, pluginId);
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
    const service = zoteroRuntime().Reader;
    const toolbarListener = this.#toolbarListener;
    const selectionPopupListener = this.#selectionPopupListener;
    // Retire before touching the host registry so queued callbacks cannot reclaim input.
    this.#toolbarListener = null;
    this.#selectionPopupListener = null;
    this.#pluginID = null;
    if (toolbarListener) {
      try {
        service.unregisterEventListener('renderToolbar', toolbarListener);
      } catch {
        // Host shutdown may already have discarded the reader registry.
      }
    }
    if (selectionPopupListener) {
      try {
        service.unregisterEventListener('renderTextSelectionPopup', selectionPopupListener);
      } catch {
        // Host shutdown may already have discarded the reader registry.
      }
    }
    for (const timer of this.#waitTimers.values()) clearTimeout(timer);
    this.#waitTimers.clear();
    this.#pending.clear();
    for (const session of this.#sessions.values()) session.dispose();
    this.#sessions.clear();
    this.#sessionsByItem.clear();
    this.#lastSelection = null;
    this.#lastSelectionAt = 0;
    this.#selectionOwner = null;
    this.#selectionActions.clear();
  }

  rescan(window: MainWindow): void {
    let stage = 'inventory';
    try {
      const service = zoteroRuntime().Reader;
      const readers: ReaderRuntime[] = [];
      const all = service._readers;
      const hasAuthoritativeInventory = Array.isArray(all) || all instanceof Map;
      if (Array.isArray(all)) readers.push(...all);
      else if (all instanceof Map) readers.push(...all.values());
      if (!readers.length) {
        stage = 'tabs';
        const tabs =
          (window as MainWindowRuntime).Zotero_Tabs?._tabs ??
          (window as MainWindowRuntime).Zotero_Tabs?.tabs ??
          [];
        for (const tab of tabs) {
          if (!tab.id) continue;
          const reader = service.getByTabID?.(tab.id);
          if (reader) readers.push(reader);
        }
      }
      stage = 'reconcile';
      if (hasAuthoritativeInventory) this.#reconcileReaders(readers);
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
    const activeReader = activeTabID
      ? (zoteroRuntime().Reader.getByTabID?.(activeTabID) ?? null)
      : null;
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
    const tabID = (window as MainWindowRuntime).Zotero_Tabs?.selectedID;
    if (!tabID) return;
    const reader = zoteroRuntime().Reader.getByTabID?.(tabID);
    if (!reader) return;
    this.#ensure(reader);
    const session = reader._instanceID ? this.#sessions.get(reader._instanceID) : null;
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

  selection(): AnnotationSelectionParams | null {
    return this.#lastSelection && Date.now() - this.#lastSelectionAt < 10_000
      ? this.#lastSelection
      : null;
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
    if (!params?.annotation || !params.onAddAnnotation) return;
    this.#lastSelection = params;
    this.#lastSelectionAt = Date.now();
    let session: ReaderSession | undefined;
    if (event.reader?._instanceID) session = this.#sessions.get(event.reader._instanceID);
    if (!session && event.reader?.itemID !== undefined)
      session = this.#sessionsByItem.get(event.reader.itemID);
    if (!session && this.#sessions.size === 1) session = this.#sessions.values().next().value;
    session?.acceptSelectionParams(params);
  }

  #ensure(reader: ReaderRuntime): void {
    if (!this.#pluginID) return;
    const instanceID = reader._instanceID;
    if (!instanceID || this.#pending.has(instanceID) || this.#sessions.has(instanceID)) return;
    this.#pending.add(instanceID);
    this.#waitAndInject(reader, instanceID, 0);
  }

  #waitAndInject(reader: ReaderRuntime, instanceID: string, attempt: number): void {
    try {
      if (!this.#pending.has(instanceID)) return;
      const pdfWindow = asPdfWindow(reader._internalReader?._primaryView?._iframeWindow);
      if (pdfWindow) {
        this.#waitTimers.delete(instanceID);
        this.#pending.delete(instanceID);
        const session = new ReaderSession({
          controller: this,
          reader,
          firstPdfWindow: pdfWindow,
          bindings: () => resolveBindings(this.#dependencies.preferences.get('bindings', '')),
          release: () => this.#release(instanceID, reader),
          jumpHost: this.#jumpHost,
          selection: {
            registered: (context) => this.registeredSelectionActions(context),
            noteOwner: (owner) => this.noteSelectionOwner(owner),
            clearOwner: (owner) => this.clearSelectionOwner(owner),
            pluginID: () => this.pluginID,
          },
        });
        this.#sessions.set(instanceID, session);
        if (reader.itemID !== undefined) this.#sessionsByItem.set(reader.itemID, session);
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
        .map((reader) => reader._instanceID)
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

  #release(instanceID: string, reader: ReaderRuntime): void {
    const session = this.#sessions.get(instanceID);
    if (session && this.#selectionOwner === session) this.#selectionOwner = null;
    this.#sessions.delete(instanceID);
    this.#pending.delete(instanceID);
    const timer = this.#waitTimers.get(instanceID);
    if (timer !== undefined) clearTimeout(timer);
    this.#waitTimers.delete(instanceID);
    if (reader.itemID !== undefined && this.#sessionsByItem.get(reader.itemID) === session) {
      const replacement = [...this.#sessions.values()].find(
        (candidate) => candidate.itemID === reader.itemID,
      );
      if (replacement) this.#sessionsByItem.set(reader.itemID, replacement);
      else this.#sessionsByItem.delete(reader.itemID);
    }
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
  readonly #hostKeyBridge: ReaderHostKeyBridge;
  readonly #jumpHistoryBridge: ReaderJumpHistoryBridge;
  readonly #viewLifecycle: ReaderViewLifecycle;
  readonly #navigation: ReaderNavigation;
  readonly #annotationNavigation = new ReaderAnnotationNavigationState();
  readonly #marks: ReaderMarks;
  readonly #marksExplorer: ReaderMarksExplorer;
  readonly #sidebar: ReaderSidebarOverlay;
  readonly #outline: ReaderOutline;
  readonly #linkHints: ReaderLinkHints;
  readonly #commentEditor: ReaderCommentEditor;
  readonly #nativeInput: ReaderNativeInput;
  readonly #flash: ReaderFlash;
  readonly #selectionRange: ReaderSelectionRange;
  readonly #selectionActions: ReaderSelectionActions;
  readonly #smoothScroller: ReaderSmoothScroller;
  readonly #themeManagers = new Map<Window, ThemeManager>();
  readonly #prefixGuide = new PrefixGuideRuntime(READER_INPUT_TIMERS);
  readonly input = new InputRuntime(READER_INPUT_TIMERS);
  #sidebarToggleBuffer = '';
  #sidebarToggleTimer: ReaderTimer | null = null;
  #markJumpRevision = 0;
  #surfaceMode: ReaderMode = 'normal';
  #interactionRevision = 0;
  #editorReleaseRevision = 0;
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
        this.state.selectionParams = null;
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
    this.#linkHints = new ReaderLinkHints({
      reader: dependencies.reader,
      viewForWindow: (pdfWindow) => this.readerViewForWindow(pdfWindow),
      executeNavigation: (pdfWindow, intent, perform) =>
        this.executeReaderNavigation(pdfWindow, intent, perform),
      showStatus: (message, duration) => this.showStatus(message, duration),
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
        this.clearSidebarToggleInput();
        this.#smoothScroller.stop(true);
        this.updateIndicator();
      },
      onExit: (saved, pdfWindow) => {
        if (
          this.#nativeInput.ownsInput ||
          this.#commentEditor.ownsInput ||
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
          dependencies.reader._window ?? null,
        ),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
    });
    this.#marks = new ReaderMarks({
      preferences: dependencies.controller.dependencies.preferences,
      itemForReader: (reader) => this.itemForReader(reader),
      schedule: (delay, task) => this.schedule(delay, task),
      showStatus: (message, duration) => this.showStatus(message, duration),
      log: (message) => dependencies.controller.dependencies.logger.debug(message),
      scrollToPageRatio: (pdfWindow, pageIndex, ratio, isCurrent) =>
        this.scrollToPageRatio(pdfWindow, pageIndex, ratio, isCurrent),
      scrollDocumentToRatio: (pdfWindow, ratio, isCurrent) =>
        this.scrollDocumentToRatio(pdfWindow, ratio, isCurrent),
      pageNavigationSupported: () => this.#navigation.pageNavigationSupported(),
      annotationPageRatio: (pdfWindow, annotation) =>
        this.annotationPageRatio(pdfWindow, annotation),
      onJump: (pdfWindow, perform) => this.recordMarkJump(pdfWindow, perform),
    });
    this.#sidebar = new ReaderSidebarOverlay({
      schedule: (delay, task) => this.schedule(delay, task),
      clearTimer: (timer) => this.clearTimer(timer),
      themeRoot: (root) => this.themeRoot(root),
    });
    this.#marksExplorer = new ReaderMarksExplorer({
      marks: this.#marks,
      reader: dependencies.reader,
      themeRoot: (root) => this.#sidebar.themeRoot(root),
      onAnnotation: (key) => this.#annotationNavigation.rememberAnnotation(key),
      onClose: (pdfWindow) => {
        this.clearSidebarToggleInput();
        this.#sidebar.closed('marks', pdfWindow);
      },
    });
    const outlineHost: OutlineHost = {
      schedule: (delay, task) => this.schedule(delay, task),
      clearTimer: (timer) => this.clearTimer(timer),
      log: (message) => dependencies.controller.dependencies.logger.debug(message),
      setModeNormal: () => this.setMode('normal'),
      themeRoot: (root) => this.#sidebar.themeRoot(root),
      executeNavigation: (pdfWindow, intent, perform) =>
        this.executeReaderNavigation(pdfWindow, intent, perform),
      onClose: (pdfWindow) => {
        this.clearSidebarToggleInput();
        this.#sidebar.closed('outline', pdfWindow);
      },
    };
    this.#outline = new ReaderOutline(outlineHost);
    this.#viewLifecycle = new ReaderViewLifecycle({
      reader: dependencies.reader,
      timerWindow: dependencies.firstPdfWindow,
      onKeyDown: (event, pdfWindow) => this.handleKeyDown(event, pdfWindow),
      onKeyUp: (event) => this.handleKeyUp(event),
      onBlur: (pdfWindow, event) => {
        this.#smoothScroller.stop(true);
        this.#flash.onBlur(pdfWindow, event);
      },
      onSelectionChange: (pdfWindow) => {
        if (pdfWindow.getSelection()?.isCollapsed) this.state.selectionParams = null;
      },
      onScroll: (pdfWindow) => {
        this.#flash.onViewportChange(pdfWindow);
        this.#linkHints.onViewportChange(pdfWindow);
        if (this.#surfaceMode === 'visual') this.#selectionRange.refresh(pdfWindow, false);
      },
      onResize: (pdfWindow) => {
        this.#flash.onViewportChange(pdfWindow);
        this.#linkHints.onViewportChange(pdfWindow);
      },
      releaseView: (pdfWindow) => {
        this.#selectionRange.releaseView(pdfWindow);
        this.#linkHints.releaseView(pdfWindow);
        this.#selectionActions.releaseView(pdfWindow);
        this.releaseViewTheme(pdfWindow);
        this.#jumpHistoryBridge.releaseWindow(pdfWindow);
      },
      syncHostBridge: () => {
        this.#hostKeyBridge.sync();
        this.#jumpHistoryBridge.sync();
      },
    });
    this.#navigation = new ReaderNavigation({
      reader: dependencies.reader,
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
    return this.#dependencies.reader._window ?? null;
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
    const ownerWindow = reader._window as MainWindowRuntime | undefined;
    const isCurrent = (): boolean => {
      try {
        return (
          !this.#scope.disposed &&
          this.readerViewForWindow(pdfWindow) === view &&
          (!tabID || !ownerWindow || ownerWindow.Zotero_Tabs?.selectedID === tabID) &&
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
      reader._window ?? null,
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
    const ownerWindow = reader._window as MainWindowRuntime | undefined;
    const isCurrent = (): boolean =>
      revision === this.#markJumpRevision &&
      !this.#scope.disposed &&
      !!view &&
      this.readerViewForWindow(pdfWindow) === view &&
      (!tabID || !ownerWindow || ownerWindow.Zotero_Tabs?.selectedID === tabID);
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
      `injecting reader ${this.#dependencies.reader._instanceID ?? '?'}`,
    );
    this.state.indicator = this.createIndicator(
      this.#dependencies.reader._iframeWindow?.document ?? null,
    );
    if (this.state.indicator)
      this.state.indicatorThemeCleanup = this.themeRoot(this.state.indicator);
    this.#viewLifecycle.start();
    this.installOuterReaderListeners();
    this.#marks.load(this.#dependencies.reader);
  }

  dispose(): void {
    this.#interactionRevision += 1;
    this.#nativeInput.release();
    this.#commentEditor.dispose();
    this.#selectionActions.dispose();
    this.#dependencies.selection?.clearOwner(this);
    this.#flash.dispose();
    this.#smoothScroller.dispose();
    this.clearSidebarToggleInput();
    this.#selectionRange.leave();
    this.#viewLifecycle.dispose();
    this.#hostKeyBridge.dispose();
    this.#jumpHistoryBridge.dispose();
    this.#scope.dispose();
    this.#sidebar.dispose(() => {
      this.#marksExplorer.close();
      this.#outline.close();
    });
    this.state.indicatorThemeCleanup?.();
    this.state.indicatorThemeCleanup = null;
    for (const manager of this.#themeManagers.values()) manager.dispose();
    this.#themeManagers.clear();
    const indicator = this.state.indicator;
    this.state.indicator = null;
    if (indicator && !isDeadObject(indicator)) indicator.remove();
    this.#linkHints.close();
    this.#prefixGuide.dispose();
    this.#dependencies.release();
  }

  acceptSelectionParams(params: AnnotationSelectionParams): void {
    const pdfWindow = this.#navigation.activePdfWindow();
    if (this.#nativeInput.ownsInput || (pdfWindow && this.#commentEditor.ownsView(pdfWindow)))
      return;
    this.state.selectionParams = params;
    if (this.mode === 'normal' && this.modeEnabled('visual')) this.setMode('visual');
  }

  deactivateInteraction(): void {
    this.#sidebar.cancelFocusRestore();
    this.#marksExplorer.close();
    this.#outline.close();
    this.#linkHints.close();
    this.#nativeInput.release();
    if (this.#commentEditor.ownsInput) {
      void this.handOverNativeEditor();
      return;
    }
    this.setMode('normal');
  }

  nativeEditableFocused(): boolean {
    return isEditableElement(
      this.#dependencies.reader._iframeWindow?.document.activeElement ?? null,
    );
  }

  focusAndHandle(event: KeyboardEvent): void {
    const pdfWindow = this.#navigation.activePdfWindow();
    if (!pdfWindow) return;
    pdfWindow.focus();
    this.handleKeyDown(event, pdfWindow);
  }

  private installOuterReaderListeners(): void {
    const document = this.#dependencies.reader._iframeWindow?.document;
    if (!document) return;
    this.#scope.addEventListener(
      document,
      'focusin',
      ((event: Event) => {
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
        if (!keyEvent || (this.nativeEditableFocused() && !this.#nativeInput.ownsInput)) return;
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
        if (!keyEvent || keyEvent.key !== 'Enter') return;
        const active = document.activeElement;
        if (active?.tagName !== 'INPUT' || !active.closest('.find-popup')) return;
        this.schedule(150, () => {
          if ('blur' in active && typeof active.blur === 'function') active.blur();
          this.#navigation.activePdfWindow()?.focus();
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
    this.#flash.releaseView(pdfWindow);
    this.#smoothScroller.releaseView(pdfWindow);
    if (this.#outline.ownsView(pdfWindow))
      this.#sidebar.releaseView(pdfWindow, () => this.#outline.close(pdfWindow));
    this.#commentEditor.releaseView(pdfWindow);
    if (this.#marksExplorer.ownsView(pdfWindow))
      this.#sidebar.releaseView(pdfWindow, () => this.#marksExplorer.close(pdfWindow));
    const manager = this.#themeManagers.get(pdfWindow);
    if (!manager) return;
    manager.dispose();
    this.#themeManagers.delete(pdfWindow);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.#smoothScroller.handleKeyUp(event);
  }

  private handleKeyDown(event: KeyboardEvent, pdfWindow: PdfWindow): void {
    this.#navigation.activatePdfWindow(pdfWindow);
    this.#markJumpRevision += 1;
    this.#interactionRevision += 1;
    if (this.#commentEditor.handleKey(event, pdfWindow)) return;
    if (this.#nativeInput.handleKey(event, pdfWindow)) return;
    if (this.#selectionActions.isOpen && this.#selectionActions.handleKey(event, pdfWindow)) return;
    if (this.#flash.isOpen && this.#flash.handleKey(event, pdfWindow)) return;
    if (this.handleSidebarToggleKey(event, pdfWindow)) return;
    if (
      this.#outline.isOpen &&
      this.#outline.handleKey(this.#dependencies.reader, pdfWindow, event)
    )
      return;
    if (this.#marksExplorer.isOpen && this.#marksExplorer.handleKey(pdfWindow, event)) return;
    if (this.#linkHints.hasHints && this.#linkHints.handleKey(event, pdfWindow)) return;
    if (isEditableElement(asElement(event.target))) {
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

  private handleSidebarToggleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
    if (
      (this.#outline.isOpen && !this.#outline.ownsView(pdfWindow)) ||
      (this.#marksExplorer.isOpen && !this.#marksExplorer.ownsView(pdfWindow)) ||
      isEditableElement(asElement(event.target)) ||
      compositionOwnsKey(event, false)
    )
      return false;
    const action = this.#outline.isOpen
      ? 'toggleReaderSidebarOutline'
      : this.#marksExplorer.isOpen
        ? 'toggleMarksExplorer'
        : null;
    if (!action) {
      this.clearSidebarToggleInput();
      return false;
    }
    const key = keyString(event);
    if (!key) return false;
    const modePrefix = 'reader-normal:';
    const sequences = Object.entries(this.#dependencies.bindings())
      .filter(([binding, boundAction]) => binding.startsWith(modePrefix) && boundAction === action)
      .map(([binding]) => binding.slice(modePrefix.length));
    const matching = (buffer: string): string[] =>
      sequences.filter((sequence) => bindingMatchesInputPrefix(sequence, buffer));

    let next = appendInputKey(this.#sidebarToggleBuffer, key);
    let matches = matching(next);
    if (!matches.length && this.#sidebarToggleBuffer) {
      next = appendInputKey('', key);
      matches = matching(next);
    }
    if (!matches.length) {
      this.clearSidebarToggleInput();
      return false;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    if (matches.some((sequence) => bindingEqualsInput(sequence, next))) {
      this.clearSidebarToggleInput();
      if (action === 'toggleReaderSidebarOutline') this.#outline.close(pdfWindow);
      else this.#marksExplorer.close(pdfWindow);
      return true;
    }

    this.#sidebarToggleBuffer = next;
    this.clearTimer(this.#sidebarToggleTimer);
    const timer = this.schedule(1200, () => {
      if (this.#sidebarToggleTimer !== timer) return;
      this.#sidebarToggleBuffer = '';
      this.#sidebarToggleTimer = null;
    });
    this.#sidebarToggleTimer = timer;
    return true;
  }

  private clearSidebarToggleInput(): void {
    this.#sidebarToggleBuffer = '';
    this.clearTimer(this.#sidebarToggleTimer);
    this.#sidebarToggleTimer = null;
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
    if (this.#linkHints.hasHints && pdfWindow && this.#linkHints.ownsView(pdfWindow)) return true;
    if (this.#outline.isOpen && pdfWindow && this.#outline.ownsView(pdfWindow)) return true;
    if (this.#marksExplorer.isOpen && pdfWindow && this.#marksExplorer.ownsView(pdfWindow))
      return true;
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
  private openOrFocusOutline(pdfWindow: PdfWindow, focusOnly: boolean): void {
    if (this.#outline.isOpen && !this.#outline.ownsView(pdfWindow)) this.#outline.close();
    this.#sidebar.activate('outline', pdfWindow, () => this.#marksExplorer.close(pdfWindow));
    if (focusOnly) {
      void this.#outline.focus(this.#dependencies.reader, pdfWindow);
      return;
    }
    if (this.#outline.isOpen) this.#outline.close(pdfWindow);
    else void this.#outline.toggle(this.#dependencies.reader, pdfWindow);
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
    this.executeReaderAction(action, count, pdfWindow);
  }

  private executeReaderAction(
    action: ReaderAction,
    count: number,
    pdfWindow: PdfWindow | null,
  ): void {
    if (action === 'openCommandPalette') {
      if (!pdfWindow || this.#scope.disposed) return;
      const ownerWindow = this.#dependencies.reader._window;
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
    const ownerWindow = this.#dependencies.reader._window ?? null;
    const main = this.#dependencies.controller.dependencies.main;
    const number = Math.max(1, count || 1);
    switch (action) {
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
        this.#dependencies.reader._window ?? null,
        READER_ITEM_TARGET.resolve(this.#dependencies.reader),
        action === 'addTag',
      );
      return;
    }
    if (action === 'addToCollection' || action === 'removeFromCollection') {
      const ownerWindow = this.#dependencies.reader._window ?? null;
      this.#dependencies.controller.dependencies.main.openReaderCollectionPicker(
        ownerWindow,
        action === 'addToCollection',
        () => {
          const selectedID = (ownerWindow as MainWindowRuntime | null)?.Zotero_Tabs?.selectedID;
          if (
            this.#scope.disposed ||
            !selectedID ||
            zoteroRuntime().Reader.getByTabID?.(selectedID) !== this.#dependencies.reader
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
      this.openOrFocusOutline(pdfWindow, false);
      return;
    }
    if (action === 'focusReaderSidebar') {
      this.openOrFocusOutline(pdfWindow, true);
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
        this.#linkHints.open(pdfWindow);
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
    if (this.#linkHints.hasHints) this.#linkHints.cancelHints();
    if (previousMode === 'visual' && mode !== 'visual') {
      this.#selectionActions.close();
      this.#dependencies.selection?.clearOwner(this);
    }
    if (mode !== 'normal') this.#smoothScroller.stop(true);
    this.#surfaceMode = mode;
    this.input.reset();
    this.clearKeyGuide();
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
        document: this.#dependencies.reader._iframeWindow?.document ?? null,
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
    return (pdfWindow.PDFViewerApplication?.pdfViewer?.container ??
      pdfWindow.document.getElementById('viewerContainer') ??
      pdfWindow.document.scrollingElement ??
      pdfWindow.document.documentElement) as HTMLElement;
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
    const viewer = pdfWindow.PDFViewerApplication?.pdfViewer;
    const container = viewer?.container;
    if (!viewer || !container) {
      const element = this.scrollContainer(pdfWindow);
      const available = Math.max(0, element.scrollHeight - element.clientHeight);
      return this.scrollTo(
        pdfWindow,
        position === 'top' ? 0 : position === 'bottom' ? available : available / 2,
        true,
      );
    }
    const pageNumber = viewer.currentPageNumber ?? 1;
    const page = pdfWindow.document.querySelector<HTMLElement>(
      `.page[data-page-number="${pageNumber}"]`,
    );
    if (!page) return false;
    const target =
      position === 'top'
        ? page.offsetTop
        : position === 'bottom'
          ? page.offsetTop + page.offsetHeight - container.clientHeight
          : page.offsetTop + page.offsetHeight / 2 - container.clientHeight / 2;
    return this.scrollTo(pdfWindow, Math.max(0, target), true);
  }

  private readerViewForWindow(pdfWindow: PdfWindow): ReaderViewRuntime | null {
    const internal = this.#dependencies.reader._internalReader;
    if (internal?._primaryView?._iframeWindow === pdfWindow) return internal._primaryView;
    if (internal?._secondaryView?._iframeWindow === pdfWindow) return internal._secondaryView;
    if (internal?._lastView?._iframeWindow === pdfWindow) return internal._lastView;
    return null;
  }

  private async highlight(
    pdfWindow: PdfWindow,
    color: AnnotationColor,
    focusComment = false,
    annotationType: 'highlight' | 'underline' = 'highlight',
  ): Promise<void> {
    const params = this.state.selectionParams ?? this.#dependencies.controller.selection();
    if (params?.annotation) {
      this.state.selectionParams = null;
      await this.createAnnotation(
        params.annotation.text ?? '',
        params.annotation.position,
        params.annotation.sortIndex,
        params.annotation.pageLabel,
        color,
        focusComment,
        annotationType,
      );
      return;
    }
    const selection = pdfWindow.getSelection();
    if (!selection || selection.isCollapsed) {
      this.showStatus('✗ no selection', 1500);
      return;
    }
    const computed = this.computeSelectionPosition(pdfWindow, selection);
    if (!computed) {
      this.showStatus('✗ no PDF selection rects', 2000);
      return;
    }
    await this.createAnnotation(
      selection.toString(),
      computed.position,
      computed.sortIndex,
      computed.pageLabel,
      color,
      focusComment,
      annotationType,
    );
    selection.removeAllRanges();
    if (!focusComment) this.setMode('normal');
  }

  private computeSelectionPosition(
    pdfWindow: PdfWindow,
    selection: Selection,
  ): ComputedAnnotationPosition | null {
    if (!selection.rangeCount) return null;
    const viewer = pdfWindow.PDFViewerApplication?.pdfViewer;
    if (!viewer) return null;
    const rectangles = Array.from(selection.getRangeAt(0).getClientRects() ?? []).filter(
      (rectangle) => rectangle.width > 1 && rectangle.height > 1,
    );
    const pages = Array.from(
      pdfWindow.document.querySelectorAll('.page[data-page-number]'),
    ) as HTMLElement[];
    const groups = new Map<number, { page: HTMLElement; rectangles: DOMRect[] }>();
    for (const rectangle of rectangles) {
      const center = (rectangle.top + rectangle.bottom) / 2;
      const page = pages.find((candidate) => {
        const bounds = candidate.getBoundingClientRect();
        return center >= bounds.top && center <= bounds.bottom;
      });
      const pageNumber = page?.dataset.pageNumber;
      if (!page || !pageNumber) continue;
      const index = Number(pageNumber) - 1;
      if (!Number.isInteger(index) || index < 0) continue;
      const group = groups.get(index);
      if (group) group.rectangles.push(rectangle);
      else groups.set(index, { page, rectangles: [rectangle] });
    }
    const ordered = [...groups.entries()].sort(([left], [right]) => left - right).slice(0, 2);
    if (!ordered.length) return null;
    const convert = ([pageIndex, group]: [
      number,
      { page: HTMLElement; rectangles: DOMRect[] },
    ]): number[][] => {
      const pageView = viewer._pages?.[pageIndex] ?? viewer.getPageView?.(pageIndex);
      const viewport = pageView?.viewport;
      if (!viewport) return [];
      const bounds = group.page.getBoundingClientRect();
      return group.rectangles
        .map((rectangle) => {
          const upperLeft = viewport.convertToPdfPoint?.(
            rectangle.left - bounds.left,
            rectangle.top - bounds.top,
          );
          const lowerRight = viewport.convertToPdfPoint?.(
            rectangle.right - bounds.left,
            rectangle.bottom - bounds.top,
          );
          if (!upperLeft || !lowerRight) return [];
          const x1 = Math.min(upperLeft[0], lowerRight[0]);
          const y1 = Math.min(upperLeft[1], lowerRight[1]);
          const x2 = Math.max(upperLeft[0], lowerRight[0]);
          const y2 = Math.max(upperLeft[1], lowerRight[1]);
          return [x1, y1, x2, y2].map((value) => Math.round(value * 1000) / 1000);
        })
        .filter(
          (rectangle) =>
            rectangle.length === 4 &&
            rectangle[2]! > rectangle[0]! &&
            rectangle[3]! > rectangle[1]!,
        );
    };
    const first = ordered[0];
    if (!first) return null;
    const rects = convert(first);
    if (!rects.length) return null;
    const position: { pageIndex: number; rects: number[][]; nextPageRects?: number[][] } = {
      pageIndex: first[0],
      rects,
    };
    const next = ordered[1];
    if (next) {
      const nextRects = convert(next);
      if (nextRects.length) position.nextPageRects = nextRects;
    }
    const pageHeight =
      viewer._pages?.[first[0]]?.viewport?.height ??
      viewer.getPageView?.(first[0])?.viewport?.height ??
      0;
    const y = rects[0]?.[3] ?? 0;
    const sortIndex = `${String(first[0]).padStart(5, '0')}|000000|${String(Math.max(0, Math.floor(pageHeight - y))).padStart(5, '0')}`;
    return {
      position: JSON.stringify(position),
      sortIndex,
      pageLabel: viewer._pageLabels?.[first[0]] ?? String(first[0] + 1),
    };
  }

  private async createAnnotation(
    text: string,
    position: unknown,
    sortIndex: string | undefined,
    pageLabel: string | undefined,
    color: AnnotationColor,
    focusComment: boolean,
    annotationType: 'highlight' | 'underline',
  ): Promise<void> {
    const attachment = this.itemForReader(this.#dependencies.reader);
    if (!attachment?.id || attachment.libraryID === undefined) {
      this.showStatus('✗ no attachment', 2000);
      return;
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
      this.#annotationNavigation.rememberAnnotation(item.key);
      this.showStatus('✓ annotated', 1200);
      if (focusComment) await this.openAnnotationComment();
    } catch (error) {
      this.showStatus(`✗ ${String(error).slice(0, 40)}`, 4000);
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
    const computed = this.computeSelectionPosition(pdfWindow, selection);
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
        const captured =
          await this.#dependencies.controller.dependencies.main.captureReaderSelectionToNote(
            selection,
            this.#dependencies.reader._window ?? null,
          );
        if (captured) this.showStatus('✓ captured to note', 1500);
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
    const readerWindow = this.#dependencies.reader._iframeWindow;
    const internal = this.#dependencies.reader._internalReader;
    if (readerWindow && internal?.toggleFindPopup)
      internal.toggleFindPopup(cloneInto({ open: true }, readerWindow));
    this.schedule(200, () => {
      const input = readerWindow?.document.querySelector<HTMLInputElement>(
        '.primary-view .find-popup input',
      );
      if (!input || !readerWindow) return;
      input.value = text;
      input.dispatchEvent(new readerWindow.Event('input', { bubbles: true }));
    });
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
    const readerWindow = this.#dependencies.reader._iframeWindow;
    const internal = this.#dependencies.reader._internalReader;
    if (!readerWindow || !internal) return { kind: 'unavailable' };
    if (internal.setSelectedAnnotations) {
      const before = internal._state?.selectedAnnotationIDs ?? [];
      internal.setSelectedAnnotations(cloneInto([annotation.key], readerWindow));
      const selected = internal._state?.selectedAnnotationIDs;
      if (!selected || (before.length === 1 && before[0] === annotation.key))
        return { kind: 'unchanged' };
      return selected.length === 1 && selected[0] === annotation.key
        ? { kind: 'completed', evidence: 'settled-change' }
        : { kind: 'unchanged' };
    }
    if (!internal.navigate) return { kind: 'unavailable' };
    const request = cloneInto({ annotationID: annotation.key }, readerWindow);
    if (navigation) {
      navigation.bindRequest(request);
      return navigation.navigate(request);
    }
    return internal.navigate(request);
  }

  private async deleteAnnotation(): Promise<void> {
    const language = this.keyGuideLanguage();
    const target = this.selectedAnnotation();
    if (!target?.eraseTx) {
      this.showStatus('✗ navigate first with [ / ]', 2000);
      return;
    }
    const window = this.#dependencies.reader._window;
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
          const internal = reader._internalReader;
          const readerWindow = reader._iframeWindow;
          if (internal?.setSelectedAnnotations && readerWindow)
            internal.setSelectedAnnotations(cloneInto([], readerWindow));
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
      this.showStatus('✗ navigate first with [ / ]', 2000);
      return;
    }
    target.annotationColor = color;
    await target.saveTx();
    this.showStatus('✓ recolored', 1200);
  }

  private filterByColor(color: AnnotationColor | null): void {
    const internal = this.#dependencies.reader._internalReader;
    const readerWindow = this.#dependencies.reader._iframeWindow;
    if (internal?.setFilter && readerWindow)
      internal.setFilter(cloneInto({ colors: color ? [color] : [] }, readerWindow));
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
    this.clearSidebarToggleInput();
    this.#smoothScroller.stop(true);
    this.updateIndicator();
  }

  private async openAnnotationComment(): Promise<void> {
    const key = this.#annotationNavigation.selectedAnnotationKey(this.#dependencies.reader);
    if (!key) {
      this.showStatus('✗ navigate first with [ / ]', 2000);
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
    if (this.#marksExplorer.isOpen) {
      this.#marksExplorer.close(pdfWindow);
      return;
    }
    this.#sidebar.activate('marks', pdfWindow, () => this.#outline.close());
    this.#marksExplorer.toggle(pdfWindow);
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

  private async annotationPageRatio(
    pdfWindow: PdfWindow,
    annotation: ItemRuntime,
  ): Promise<{ pageIndex: number; ratio: number }> {
    try {
      const parsed: unknown = JSON.parse(annotation.annotationPosition ?? '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return { pageIndex: 0, ratio: 0.5 };
      const pageIndexValue = 'pageIndex' in parsed ? parsed.pageIndex : undefined;
      const rectsValue = 'rects' in parsed ? parsed.rects : undefined;
      const pageIndex = typeof pageIndexValue === 'number' ? pageIndexValue : 0;
      if (!Array.isArray(rectsValue) || !Array.isArray(rectsValue[0]))
        return { pageIndex, ratio: 0.5 };
      const y = rectsValue[0][3] ?? rectsValue[0][1];
      if (typeof y !== 'number') return { pageIndex, ratio: 0.5 };
      const page = await pdfWindow.PDFViewerApplication?.pdfDocument?.getPage?.(pageIndex + 1);
      const viewport = page?.getViewport({ scale: 1 });
      return viewport
        ? { pageIndex, ratio: Math.max(0, Math.min(1, (viewport.height - y) / viewport.height)) }
        : { pageIndex, ratio: 0.5 };
    } catch {
      return { pageIndex: 0, ratio: 0.5 };
    }
  }

  private async scrollToPageRatio(
    pdfWindow: PdfWindow,
    pageIndex: number,
    ratio: number,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    for (let attempt = 0; attempt <= 10; attempt += 1) {
      const reader = this.#dependencies.reader;
      if (
        this.#scope.disposed ||
        !isCurrent() ||
        !this.readerViewForWindow(pdfWindow) ||
        (reader.tabID &&
          (reader._window as MainWindowRuntime | undefined)?.Zotero_Tabs?.selectedID !==
            reader.tabID)
      )
        return false;
      const container =
        pdfWindow.PDFViewerApplication?.pdfViewer?.container ??
        pdfWindow.document.getElementById('viewerContainer');
      const page = pdfWindow.document.querySelector<HTMLElement>(
        `.page[data-page-number="${pageIndex + 1}"]`,
      );
      if (page && page.offsetHeight > 0 && container) {
        this.scrollTo(
          pdfWindow,
          Math.max(0, page.offsetTop + page.offsetHeight * ratio - container.clientHeight / 2),
        );
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
      if (!this.#scope.disposed) task();
    }, delay);
    this.#scope.addTimeout(() => clearTimeout(timer));
    return timer;
  }

  private clearTimer(timer: ReaderTimer | null): void {
    clearTimeout(timer ?? undefined);
  }
}
