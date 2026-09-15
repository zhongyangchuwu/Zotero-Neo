import type {
  ReaderControllerApi,
  ReaderControllerDependencies,
  MainWindow,
  ReaderSelectionActionDefinition,
  ReaderSelectionContext,
} from '../core/contracts';
import { CleanupScope } from '../core/cleanup';
import { keyGuideConfig } from '../core/preferences';
import { copyToClipboard } from '../platform/clipboard';
import { cloneInto } from '../platform/cross-compartment';
import { asElement, asKeyboardEvent, isEditableElement } from '../platform/dom';
import {
  advanceInput,
  backspaceLeaderInput,
  cancelLeaderInput,
  inputWouldConsume,
  resolveInputTimeout,
} from '../input/engine';
import {
  KEY_GUIDE_CONFIG,
  keyGuideLanguage,
  type KeyGuideLanguage,
} from '../input/key-guide-config';
import { isLeaderPrefix, leaderGuideEntries } from '../input/key-guide';
import { keyString } from '../input/keys';
import { resolveBindings, type BindingMap } from '../input/bindings';
import { isReaderDelegableMainAction } from '../main/action-capabilities';
import {
  READER_NORMAL_ACTIONS,
  isReaderActionForMode,
  type ReaderAction,
} from './action-capabilities';
import {
  ACTION_LABELS,
  focusDirectionForAction,
  type ActionId,
  type FocusDirection,
} from '../input/actions';
import { KeyGuide } from '../ui/key-guide';
import { THEME_VARS, ThemeManager } from '../ui/theme';
import { ReaderMarks } from './marks';
import { ReaderOutline, type OutlineHost } from './outline';
import { ReaderSidebarOverlay } from './sidebar-overlay';
import { ReaderMarksExplorer } from './marks-explorer';
import { ReaderLinkHints } from './link-hints';
import { ReaderCommentEditor, type AnnotationCommentTarget } from './comment-editor';
import { ReaderFlash, type FlashIntent, type FlashSelectionTarget } from './flash';
import { ReaderSelectionActionRegistry, ReaderSelectionActions } from './selection-actions';
import { ReaderSmoothScroller, smoothScrollSpec } from './smooth-scroll';
import { verticalTextPosition } from './text-motion';
import {
  COLORS,
  type AnnotationColor,
  type AnnotationDraft,
  type AnnotationRuntime,
  type AnnotationSelectionParams,
  type ItemRuntime,
  type PdfWindow,
  type Pointer,
  type ReaderEventRuntime,
  type ReaderMode,
  type ReaderRuntime,
  type ReaderSessionState,
  type ReaderTimer,
  type ReaderViewRuntime,
  type ViewHandlers,
} from './types';

interface ReaderService {
  readonly _readers?: readonly ReaderRuntime[] | ReadonlyMap<unknown, ReaderRuntime>;
  registerEventListener(
    name: 'renderToolbar' | 'renderTextSelectionPopup',
    listener: (event: ReaderEventRuntime) => void,
    pluginID: string,
  ): unknown;
  unregisterEventListener(listenerID: unknown): void;
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

function isTextNode(node: Node | null): node is Text {
  return node?.nodeType === 3;
}

function annotationText(value: string): string {
  return value.normalize('NFKC').replace(/\n/g, ' ').replace(/ {2,}/g, ' ').trim();
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Reader action: ${String(value)}`);
}

export function createReaderController(
  dependencies: ReaderControllerDependencies,
): ReaderControllerApi {
  return new ReaderController(dependencies);
}

export class ReaderController implements ReaderControllerApi {
  readonly #dependencies: ReaderControllerDependencies;
  readonly #sessions = new Map<string, ReaderSession>();
  readonly #sessionsByItem = new Map<number, ReaderSession>();
  readonly #pending = new Set<string>();
  readonly #waitTimers = new Map<string, ReaderTimer>();
  #listenerIDs: unknown[] = [];
  #pluginID: string | null = null;
  #lastSelection: AnnotationSelectionParams | null = null;
  #lastSelectionAt = 0;
  readonly #selectionActions = new ReaderSelectionActionRegistry();
  #selectionOwner: ReaderSession | null = null;

  constructor(dependencies: ReaderControllerDependencies) {
    this.#dependencies = dependencies;
  }

  start(pluginId: string): void {
    if (this.#pluginID === pluginId && this.#listenerIDs.length) return;
    this.shutdown();
    const service = zoteroRuntime().Reader;
    const registered: unknown[] = [];
    try {
      registered.push(
        service.registerEventListener('renderToolbar', (event) => this.#onToolbar(event), pluginId),
      );
      registered.push(
        service.registerEventListener(
          'renderTextSelectionPopup',
          (event) => this.#onSelectionPopup(event),
          pluginId,
        ),
      );
      this.#listenerIDs = registered;
      this.#pluginID = pluginId;
      this.#dependencies.logger.debug('reader listeners registered');
      this.#dependencies.logger.diagnostic('reader listeners registered');
    } catch (error) {
      for (const listenerID of registered) {
        try {
          service.unregisterEventListener(listenerID);
        } catch {
          // Listener registration rollback is best-effort; the next start remains retryable.
        }
      }
      this.#listenerIDs = [];
      this.#pluginID = null;
      const message = `reader listener registration failed: ${String(error)}`;
      this.#dependencies.logger.debug(message);
      this.#dependencies.logger.diagnostic(message);
    }
  }

  shutdown(): void {
    const service = zoteroRuntime().Reader;
    for (const listenerID of this.#listenerIDs) {
      try {
        service.unregisterEventListener(listenerID);
      } catch {
        // Host shutdown may already have discarded the reader registry.
      }
    }
    this.#listenerIDs = [];
    this.#pluginID = null;
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
    const service = zoteroRuntime().Reader;
    const readers: ReaderRuntime[] = [];
    const all = service._readers;
    if (Array.isArray(all)) readers.push(...all);
    else if (all instanceof Map) readers.push(...all.values());
    if (!readers.length) {
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
    for (const reader of readers) this.#ensure(reader);
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
    const instanceID = reader._instanceID;
    if (!instanceID || this.#pending.has(instanceID) || this.#sessions.has(instanceID)) return;
    this.#pending.add(instanceID);
    this.#waitAndInject(reader, instanceID, 0);
  }

  #waitAndInject(reader: ReaderRuntime, instanceID: string, attempt: number): void {
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

export class ReaderSession {
  readonly #dependencies: SessionDependencies;
  readonly #scope = new CleanupScope();
  readonly #viewHandlers = new Map<PdfWindow, ViewHandlers>();
  readonly #keyPatches = new Map<ReaderViewRuntime, (event: KeyboardEvent) => unknown>();
  readonly #textFocusPatches = new Map<ReaderViewRuntime, () => boolean>();
  readonly #marks: ReaderMarks;
  readonly #marksExplorer: ReaderMarksExplorer;
  readonly #sidebar: ReaderSidebarOverlay;
  readonly #outline: ReaderOutline;
  readonly #linkHints: ReaderLinkHints;
  readonly #commentEditor: ReaderCommentEditor;
  readonly #flash: ReaderFlash;
  readonly #selectionActions: ReaderSelectionActions;
  readonly #smoothScroller: ReaderSmoothScroller;
  readonly #themeManagers = new Map<Window, ThemeManager>();
  readonly #keyGuide = new KeyGuide();
  #keyGuideTimer: ReaderTimer | null = null;
  #inputRevision = 0;
  #sidebarToggleBuffer = '';
  #sidebarToggleTimer: ReaderTimer | null = null;
  readonly state: ReaderSessionState;
  #viewSyncTimer: number | null = null;

  constructor(dependencies: SessionDependencies) {
    this.#dependencies = dependencies;
    this.state = {
      mode: 'normal',
      keyBuffer: '',
      countBuffer: '',
      keyTimeout: null,
      selectionParams: null,
      indicator: null,
      indicatorThemeCleanup: null,
      activePdfWindow: dependencies.firstPdfWindow,
      visualAnchor: null,
      visualPreferredX: null,
      marks: {},
      filterColor: null,
      lastAnnotationKey: null,
    };
    this.#flash = new ReaderFlash({
      activate: (intent, pdfWindow, target) => this.activateFlashTarget(intent, pdfWindow, target),
      showStatus: (message, duration) => this.showStatus(message, duration),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
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
      showStatus: (message, duration) => this.showStatus(message, duration),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
      diagnostic: (message) => dependencies.controller.dependencies.logger.diagnostic(message),
    });
    this.#commentEditor = new ReaderCommentEditor({
      reader: dependencies.reader,
      schedule: (delay, task) => this.schedule(delay, task),
      clearTimer: (timer) => this.clearTimer(timer),
      themeRoot: (root) => this.themeRoot(root),
      activePdfWindow: () => this.activePdfWindow(),
      resolveAnnotation: (key) => this.resolveAnnotation(key),
      annotationForSave: (target) => this.annotationForSave(target),
      nativeEditableFocused: () => this.nativeEditableFocused(),
      onNativeEditorFocus: () => {
        void this.handOverNativeEditor();
      },
      locale: () => zoteroRuntime().locale ?? '',
    });
    this.#marks = new ReaderMarks({
      preferences: dependencies.controller.dependencies.preferences,
      itemForReader: (reader) => this.itemForReader(reader),
      schedule: (delay, task) => this.schedule(delay, task),
      showStatus: (message, duration) => this.showStatus(message, duration),
      log: (message) => dependencies.controller.dependencies.logger.debug(message),
      scrollToPageRatio: (pdfWindow, pageIndex, ratio) =>
        this.scrollToPageRatio(pdfWindow, pageIndex, ratio),
      scrollDocumentToRatio: (pdfWindow, ratio) => this.scrollDocumentToRatio(pdfWindow, ratio),
      pageNavigationSupported: (reader) => this.pageNavigationSupported(reader),
      annotationPageRatio: (pdfWindow, annotation) =>
        this.annotationPageRatio(pdfWindow, annotation),
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
      marksState: () => this.state.marks,
      onAnnotation: (key) => {
        this.state.lastAnnotationKey = key;
      },
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
      onClose: (pdfWindow) => {
        this.clearSidebarToggleInput();
        this.#sidebar.closed('outline', pdfWindow);
      },
    };
    this.#outline = new ReaderOutline(outlineHost);
    this.#scope.add(() => {
      this.#inputRevision += 1;
      this.clearKeyTimer();
    });
  }

  get itemID(): number | undefined {
    return this.#dependencies.reader.itemID;
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
    this.injectSelectionStyle(this.state.activePdfWindow);
    this.syncPdfViews();
    this.#viewSyncTimer = this.state.activePdfWindow.setInterval(() => this.syncPdfViews(), 250);
    this.#scope.add(() => {
      if (this.#viewSyncTimer !== null) clearInterval(this.#viewSyncTimer);
      this.#viewSyncTimer = null;
    });
    this.installOuterReaderListeners();
    this.#marks.load(this.state.marks, this.#dependencies.reader);
  }

  dispose(): void {
    this.#commentEditor.dispose();
    this.#selectionActions.dispose();
    this.#dependencies.selection?.clearOwner(this);
    this.#flash.dispose();
    this.#smoothScroller.dispose();
    this.clearSidebarToggleInput();
    for (const [pdfWindow, handlers] of this.#viewHandlers)
      this.removeViewHandlers(pdfWindow, handlers);
    this.#viewHandlers.clear();
    this.restorePatches();
    this.#scope.dispose();
    this.#sidebar.dispose(() => {
      this.#marksExplorer.close();
      this.#outline.close();
    });
    this.state.indicatorThemeCleanup?.();
    this.state.indicatorThemeCleanup = null;
    for (const manager of this.#themeManagers.values()) manager.dispose();
    this.#themeManagers.clear();
    this.state.indicator?.remove();
    this.state.indicator = null;
    this.#linkHints.close();
    this.clearKeyGuide();
    this.#dependencies.release();
  }

  acceptSelectionParams(params: AnnotationSelectionParams): void {
    this.state.selectionParams = params;
    if (this.state.mode === 'normal' && this.modeEnabled('visual')) this.setMode('visual');
  }

  nativeEditableFocused(): boolean {
    return isEditableElement(
      this.#dependencies.reader._iframeWindow?.document.activeElement ?? null,
    );
  }

  focusAndHandle(event: KeyboardEvent): void {
    const pdfWindow = this.activePdfWindow();
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
        if (
          this.state.mode !== 'insert' ||
          !this.#commentEditor.hasInput ||
          !isEditableElement(asElement(event.target))
        )
          return;
        void this.handOverNativeEditor();
      }) as EventListener,
      true,
    );
    this.#scope.addEventListener(
      document,
      'keydown',
      ((event: Event) => {
        const keyEvent = asKeyboardEvent(event);
        if (!keyEvent || this.nativeEditableFocused()) return;
        const pdfWindow = this.activePdfWindow();
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
          this.activePdfWindow()?.focus();
        });
      }) as EventListener,
      true,
    );
  }

  private syncPdfViews(): void {
    if (this.#scope.disposed) return;
    const reader = this.#dependencies.reader;
    const wanted = [
      asPdfWindow(reader._internalReader?._primaryView?._iframeWindow),
      asPdfWindow(reader._internalReader?._secondaryView?._iframeWindow),
    ].filter((value): value is PdfWindow => value !== null);
    if (!wanted.includes(this.state.activePdfWindow))
      this.state.activePdfWindow = wanted[0] ?? this.state.activePdfWindow;
    for (const [window, handlers] of this.#viewHandlers) {
      if (wanted.includes(window)) continue;
      this.removeViewHandlers(window, handlers);
      this.#viewHandlers.delete(window);
    }
    for (const pdfWindow of wanted) {
      if (this.#viewHandlers.has(pdfWindow)) continue;
      this.injectSelectionStyle(pdfWindow);
      const keyDown = ((event: Event) => {
        const keyEvent = asKeyboardEvent(event);
        if (keyEvent) this.handleKeyDown(keyEvent, pdfWindow);
      }) as EventListener;
      const keyUp = ((event: Event) => {
        const keyEvent = asKeyboardEvent(event);
        if (keyEvent) this.handleKeyUp(keyEvent);
      }) as EventListener;
      const blur = (() => {
        this.#smoothScroller.stop(true);
        this.#flash.releaseView(pdfWindow);
      }) as EventListener;
      const selection = (() => {
        if (pdfWindow.getSelection()?.isCollapsed) this.state.selectionParams = null;
      }) as EventListener;
      const scroll = (() => {
        this.#flash.onViewportChange(pdfWindow);
        this.#linkHints.onViewportChange(pdfWindow);
        if (this.state.mode === 'visual') this.updateVisualCursor(pdfWindow, false);
      }) as EventListener;
      const resize = (() => {
        this.#flash.onViewportChange(pdfWindow);
        this.#linkHints.onViewportChange(pdfWindow);
      }) as EventListener;
      const scrollElement =
        pdfWindow.document.getElementById('viewerContainer') ??
        pdfWindow.document.querySelector('.pdfViewer');
      pdfWindow.addEventListener('keydown', keyDown, true);
      pdfWindow.addEventListener('keyup', keyUp, true);
      pdfWindow.addEventListener('blur', blur, true);
      pdfWindow.document.addEventListener('selectionchange', selection);
      pdfWindow.addEventListener('resize', resize, { passive: true });
      scrollElement?.addEventListener('scroll', scroll, { passive: true });
      this.#viewHandlers.set(pdfWindow, {
        keyDown,
        keyUp,
        blur,
        selection,
        resize,
        scroll,
        scrollElement,
      });
    }
    this.patchKeyForwarding();
    this.patchTextAnnotationFocus();
  }

  private removeViewHandlers(pdfWindow: PdfWindow, handlers: ViewHandlers): void {
    pdfWindow.removeEventListener('keydown', handlers.keyDown, true);
    pdfWindow.removeEventListener('keyup', handlers.keyUp, true);
    pdfWindow.removeEventListener('blur', handlers.blur, true);
    pdfWindow.document.removeEventListener('selectionchange', handlers.selection);
    pdfWindow.removeEventListener('resize', handlers.resize);
    handlers.scrollElement?.removeEventListener('scroll', handlers.scroll);
    this.#linkHints.releaseView(pdfWindow);
    this.#selectionActions.releaseView(pdfWindow);
    this.releaseViewTheme(pdfWindow);
  }

  /**
   * Releases Neo overlays and theme subscriptions owned by a PDF view that Zotero removed or
   * recreated, without affecting the reader chrome or surviving split view.
   */
  private releaseViewTheme(pdfWindow: PdfWindow): void {
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

  private patchKeyForwarding(): void {
    const views = [
      this.#dependencies.reader._internalReader?._primaryView,
      this.#dependencies.reader._internalReader?._secondaryView,
    ];
    for (const view of views) {
      if (!view || this.#keyPatches.has(view) || !view._onKeyDown) continue;
      const original = view._onKeyDown;
      const session = this;
      const wrapper = (event: KeyboardEvent): unknown => {
        if (session.nativeEditableFocused() || session.readerConsumesKey(keyString(event)))
          return undefined;
        return original.call(view, event);
      };
      try {
        view._onKeyDown = wrapper;
        this.#keyPatches.set(view, original);
      } catch (error) {
        this.#dependencies.controller.dependencies.logger.debug(
          `reader key forwarding patch failed: ${String(error)}`,
        );
      }
    }
  }

  private patchTextAnnotationFocus(): void {
    const views = [
      this.#dependencies.reader._internalReader?._primaryView,
      this.#dependencies.reader._internalReader?._secondaryView,
    ];
    for (const view of views) {
      if (!view || this.#textFocusPatches.has(view) || !view._textAnnotationFocused) continue;
      const original = view._textAnnotationFocused;
      const session = this;
      const wrapper = (): boolean => {
        if (session.#commentEditor.isInputFocused(view._iframeWindow)) return true;
        return original.call(view);
      };
      try {
        view._textAnnotationFocused = wrapper;
        this.#textFocusPatches.set(view, original);
      } catch (error) {
        this.#dependencies.controller.dependencies.logger.debug(
          `reader text annotation patch failed: ${String(error)}`,
        );
      }
    }
  }

  private restorePatches(): void {
    for (const [view, original] of this.#keyPatches) {
      try {
        view._onKeyDown = original;
      } catch {
        // A recreated view may no longer accept restoration.
      }
    }
    this.#keyPatches.clear();
    for (const [view, original] of this.#textFocusPatches) {
      try {
        view._textAnnotationFocused = original;
      } catch {
        // A recreated view may no longer accept restoration.
      }
    }
    this.#textFocusPatches.clear();
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.#smoothScroller.handleKeyUp(event);
  }

  private handleKeyDown(event: KeyboardEvent, pdfWindow: PdfWindow): void {
    this.activatePdfWindow(pdfWindow);
    if (this.#selectionActions.isOpen && this.#selectionActions.handleKey(event, pdfWindow)) return;
    if (this.#flash.isOpen && this.#flash.handleKey(event, pdfWindow)) return;
    if (this.handleSidebarToggleKey(event, pdfWindow)) return;
    if (
      this.#outline.isOpen &&
      this.#outline.handleKey(this.#dependencies.reader, pdfWindow, event)
    )
      return;
    if (this.#marksExplorer.isOpen) {
      this.#marksExplorer.handleKey(pdfWindow, event);
      return;
    }
    if (this.#linkHints.hasHints && isEditableElement(asElement(event.target))) {
      this.#linkHints.cancelHints();
      return;
    }
    if (this.#linkHints.hasHints) {
      this.#linkHints.handleKey(event, pdfWindow);
      return;
    }
    if (this.state.mode === 'insert') {
      this.handleInsertKey(event);
      return;
    }
    if (isEditableElement(asElement(event.target))) {
      this.clearKeyGuide();
      return;
    }
    const leaderState = {
      mode: this.state.mode,
      keyBuffer: this.state.keyBuffer,
      countBuffer: this.state.countBuffer,
    };
    if (event.key.toLowerCase() === 'escape') {
      const cancelled = cancelLeaderInput(leaderState);
      if (cancelled) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.state.keyBuffer = cancelled.keyBuffer;
        this.state.countBuffer = cancelled.countBuffer;
        this.#inputRevision += 1;
        this.clearKeyTimer();
        this.clearKeyGuide();
        this.updateIndicator();
        return;
      }
    }
    if (event.key.toLowerCase() === 'backspace') {
      const backed = backspaceLeaderInput(leaderState);
      if (backed) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.state.keyBuffer = backed.keyBuffer;
        this.state.countBuffer = backed.countBuffer;
        this.#inputRevision += 1;
        this.clearKeyTimer();
        this.refreshKeyGuide();
        this.updateIndicator();
        return;
      }
    }
    const key = keyString(event);
    if (!key) return;
    this.#inputRevision += 1;
    const revision = this.#inputRevision;
    if (this.handleMarkChord(event, key, pdfWindow)) return;
    if (this.startSmoothHold(event, pdfWindow, key)) return;
    const decision = advanceInput(
      {
        mode: this.state.mode,
        keyBuffer: this.state.keyBuffer,
        countBuffer: this.state.countBuffer,
        bindings: this.#dependencies.bindings(),
        allowCountPrefix: this.state.mode === 'normal',
      },
      key,
    );
    this.state.keyBuffer = decision.state.keyBuffer;
    this.state.countBuffer = decision.state.countBuffer;
    this.clearKeyTimer();
    if (decision.kind === 'pass') {
      this.refreshKeyGuide();
      this.updateIndicator();
      return;
    }
    if (decision.kind === 'execute') {
      this.clearKeyGuide();
      this.updateIndicator();
      if (!isReaderActionForMode(this.state.mode, decision.action)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const direction = focusDirectionForAction(decision.action);
      if (direction) {
        if (this.focusDirection(direction)) {
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
      this.state.keyTimeout = this.schedule(timeoutMs, () => {
        if (this.#scope.disposed || this.#inputRevision !== revision) return;
        const resolved = resolveInputTimeout(decision);
        this.state.keyBuffer = resolved.state.keyBuffer;
        this.state.countBuffer = resolved.state.countBuffer;
        this.clearKeyGuide();
        this.updateIndicator();
        if (resolved.kind === 'execute')
          this.executeAction(resolved.action, resolved.count, this.activePdfWindow());
      });
    }
  }

  private handleSidebarToggleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
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
    const modePrefix = 'normal:';
    const sequences = Object.entries(this.#dependencies.bindings())
      .filter(([binding, boundAction]) => binding.startsWith(modePrefix) && boundAction === action)
      .map(([binding]) => binding.slice(modePrefix.length));
    const matching = (buffer: string): string[] =>
      sequences.filter((sequence) => sequence.startsWith(buffer));

    let next = `${this.#sidebarToggleBuffer}${key}`;
    let matches = matching(next);
    if (!matches.length && this.#sidebarToggleBuffer) {
      next = key;
      matches = matching(next);
    }
    if (!matches.length) {
      this.clearSidebarToggleInput();
      return false;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    if (matches.includes(next)) {
      this.clearSidebarToggleInput();
      if (action === 'toggleReaderSidebarOutline') this.#outline.close(pdfWindow);
      else this.#marksExplorer.close(pdfWindow);
      return true;
    }

    this.#sidebarToggleBuffer = next;
    this.clearTimer(this.#sidebarToggleTimer);
    this.#sidebarToggleTimer = this.schedule(1200, () => {
      this.#sidebarToggleBuffer = '';
      this.#sidebarToggleTimer = null;
    });
    return true;
  }

  private clearSidebarToggleInput(): void {
    this.#sidebarToggleBuffer = '';
    this.clearTimer(this.#sidebarToggleTimer);
    this.#sidebarToggleTimer = null;
  }

  private handleInsertKey(event: KeyboardEvent): void {
    if (keyString(event) === 'escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.exitAnnotationInsert();
      return;
    }
    if (this.#commentEditor.ownsTarget(event.target)) event.stopImmediatePropagation();
  }

  private handleMarkChord(event: KeyboardEvent, key: string, pdfWindow: PdfWindow): boolean {
    const bindings = this.#dependencies.bindings();
    if (this.state.mode !== 'normal' || bindings['normal:m'] || bindings['normal:`']) return false;
    const consume = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (!this.state.keyBuffer && (key === 'm' || key === '`')) {
      this.state.keyBuffer = key;
      this.state.countBuffer = '';
      this.armMarkTimer();
      this.updateIndicator();
      consume();
      return true;
    }
    if (this.state.keyBuffer === 'm' && /^[a-z0-9]$/.test(key)) {
      this.clearKeyTimer();
      this.state.keyBuffer = '';
      void this.#marks.set(
        this.state.marks,
        this.#dependencies.reader,
        pdfWindow,
        key,
        this.state.lastAnnotationKey,
      );
      consume();
      return true;
    }
    if (this.state.keyBuffer === '`' && /^[a-z0-9]$/.test(key)) {
      this.clearKeyTimer();
      this.state.keyBuffer = '';
      void this.#marks.jump(
        this.state.marks,
        this.#dependencies.reader,
        pdfWindow,
        key,
        (annotation) => {
          this.state.lastAnnotationKey = annotation;
        },
      );
      consume();
      return true;
    }
    if (this.state.keyBuffer === 'd' && key === 'm') {
      this.state.keyBuffer = 'dm';
      this.armMarkTimer();
      this.updateIndicator();
      consume();
      return true;
    }
    if (this.state.keyBuffer === 'd' && key === 'M') {
      this.clearKeyTimer();
      this.state.keyBuffer = '';
      void this.#marks.clear(this.state.marks, this.#dependencies.reader);
      consume();
      return true;
    }
    if (this.state.keyBuffer === 'dm' && /^[a-z0-9]$/.test(key)) {
      this.clearKeyTimer();
      this.state.keyBuffer = '';
      void this.#marks.delete(this.state.marks, this.#dependencies.reader, key);
      consume();
      return true;
    }
    return false;
  }
  private armMarkTimer(): void {
    this.clearKeyTimer();
    this.state.keyTimeout = this.schedule(1200, () => {
      this.state.keyBuffer = '';
      this.state.countBuffer = '';
      this.updateIndicator();
    });
  }

  private readerConsumesKey(key: string): boolean {
    if (!key) return false;
    if (this.#selectionActions.isOpen || this.#flash.isOpen) return true;
    if (this.state.mode === 'insert')
      return (
        key === 'escape' ||
        (this.#commentEditor.hasInput &&
          (key.length === 1 || ['backspace', 'delete', 'enter'].includes(key)))
      );
    if (this.#marksExplorer.isOpen || this.#outline.isOpen || this.#linkHints.hasHints) return true;
    if (
      this.state.keyBuffer === 'm' ||
      this.state.keyBuffer === '`' ||
      this.state.keyBuffer === 'dm'
    )
      return /^[a-z0-9]$/.test(key);
    const context = {
      mode: this.state.mode,
      keyBuffer: this.state.keyBuffer,
      countBuffer: this.state.countBuffer,
      bindings: this.#dependencies.bindings(),
      allowCountPrefix: this.state.mode === 'normal',
    };
    if (!inputWouldConsume(context, key)) return false;
    const transition = advanceInput(context, key);
    if (transition.kind !== 'execute') return true;
    if (!isReaderActionForMode(this.state.mode, transition.action)) return true;
    const direction = focusDirectionForAction(transition.action);
    return direction ? this.canFocusDirection(direction) : true;
  }
  private openOrFocusOutline(pdfWindow: PdfWindow, focusOnly: boolean): void {
    this.#sidebar.activate('outline', pdfWindow, () => this.#marksExplorer.close(pdfWindow));
    if (focusOnly) {
      void this.#outline.focus(this.#dependencies.reader, pdfWindow);
      return;
    }
    if (this.#outline.isOpen) this.#outline.close(pdfWindow);
    else void this.#outline.toggle(this.#dependencies.reader, pdfWindow);
  }

  private executeAction(action: ActionId, count: number, pdfWindow: PdfWindow | null): void {
    if (!isReaderActionForMode(this.state.mode, action)) {
      this.#dependencies.controller.dependencies.logger.debug(
        `ignored Reader action ${String(action)} in ${this.state.mode} mode`,
      );
      return;
    }
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
      this.#dependencies.controller.dependencies.openCommandPalette(ownerWindow, {
        mode: 'normal',
        actions: READER_NORMAL_ACTIONS,
        bindings: this.#dependencies.bindings(),
        language: this.keyGuideLanguage(),
        execute: (nextAction, _count) => {
          if (this.#scope.disposed) return;
          const active = this.activePdfWindow();
          if (!active || !this.readerViewForWindow(active)) return;
          this.executeAction(nextAction, 0, active);
        },
      });
      return;
    }
    if (!pdfWindow) return;
    const number = Math.max(1, count || 1);
    if (isReaderDelegableMainAction(action)) {
      this.#dependencies.controller.dependencies.delegateMain(
        action,
        count,
        this.#dependencies.reader._window ?? null,
      );
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
      case 'scrollDown':
        this.clearAnnotation();
        this.scrollBy(pdfWindow, 0, this.scrollStep() * number);
        break;
      case 'scrollUp':
        this.clearAnnotation();
        this.scrollBy(pdfWindow, 0, -this.scrollStep() * number);
        break;
      case 'scrollLeft':
        this.clearAnnotation();
        this.scrollBy(pdfWindow, -this.scrollStep() * number, 0);
        break;
      case 'scrollRight':
        this.clearAnnotation();
        this.scrollBy(pdfWindow, this.scrollStep() * number, 0);
        break;
      case 'historyBack':
        this.navigateHistory('back');
        break;
      case 'historyForward':
        this.navigateHistory('forward');
        break;
      case 'followLink':
        this.#linkHints.open(pdfWindow);
        break;
      case 'flashText':
        if (this.state.mode === 'visual') this.#flash.open(pdfWindow, 'visual-end');
        break;
      case 'halfPageDown':
        this.clearAnnotation();
        this.scrollBy(pdfWindow, 0, (this.viewport(pdfWindow) / 2) * number, true);
        break;
      case 'halfPageUp':
        this.clearAnnotation();
        this.scrollBy(pdfWindow, 0, (-this.viewport(pdfWindow) / 2) * number, true);
        break;
      case 'fullPageDown':
        this.clearAnnotation();
        this.scrollBy(pdfWindow, 0, this.viewport(pdfWindow) * number, true);
        break;
      case 'fullPageUp':
        this.clearAnnotation();
        this.scrollBy(pdfWindow, 0, -this.viewport(pdfWindow) * number, true);
        break;
      case 'zoomIn':
        this.zoomReader('in', number);
        break;
      case 'zoomOut':
        this.zoomReader('out', number);
        break;
      case 'zoomReset':
        this.zoomReader('reset', 1);
        break;
      case 'scrollTop':
        this.scrollToPagePosition(pdfWindow, 'top');
        break;
      case 'scrollCenter':
        this.scrollToPagePosition(pdfWindow, 'center');
        break;
      case 'scrollBottom':
        this.scrollToPagePosition(pdfWindow, 'bottom');
        break;
      case 'prevPage':
        this.navigatePage(-number);
        break;
      case 'nextPage':
        this.navigatePage(number);
        break;
      case 'firstPage':
        this.navigateBoundary(count, false, pdfWindow);
        break;
      case 'lastPage':
        this.navigateBoundary(count, true, pdfWindow);
        break;
      case 'openSearch':
        this.openSearch(pdfWindow);
        break;
      case 'clearSearch':
        this.clearSearch();
        break;
      case 'findNext':
        this.find(true);
        break;
      case 'findPrevious':
        this.find(false);
        break;
      case 'prevAnnotation':
        this.navigateAnnotation(-1);
        break;
      case 'nextAnnotation':
        this.navigateAnnotation(1);
        break;
      case 'editAnnotation':
        if (this.modeEnabled('insert')) void this.enterAnnotationInsert();
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
      case 'recolorBlue':
        this.state.lastAnnotationKey
          ? void this.recolorAnnotation(COLORS.blue)
          : this.scrollToPagePosition(pdfWindow, 'bottom');
        break;
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
        if (this.modeEnabled('visual')) this.enterVisual(pdfWindow);
        break;
      case 'openSelectionActions':
        this.openSelectionActions(pdfWindow);
        break;
      case 'enterInsert':
        if (this.modeEnabled('insert')) void this.enterAnnotationInsert();
        else this.setMode('insert');
        break;
      case 'exitMode':
        this.setMode('normal');
        pdfWindow.getSelection()?.removeAllRanges();
        break;
      case 'extendDown':
        this.extendByLine(pdfWindow, 1);
        break;
      case 'extendUp':
        this.extendByLine(pdfWindow, -1);
        break;
      case 'extendLeft':
        this.modifySelection(pdfWindow, 'backward', 'character');
        break;
      case 'extendRight':
        this.modifySelection(pdfWindow, 'forward', 'character');
        break;
      case 'extendWordForward':
        this.modifySelection(pdfWindow, 'forward', 'word');
        break;
      case 'extendWordBackward':
        this.modifySelection(pdfWindow, 'backward', 'word');
        break;
      case 'extendLineStart':
        this.extendLineBoundary(pdfWindow, false);
        break;
      case 'extendLineEnd':
        this.extendLineBoundary(pdfWindow, true);
        break;
      case 'extendSentenceForward':
        this.modifySelection(pdfWindow, 'forward', 'sentence');
        break;
      case 'extendSentenceBackward':
        this.modifySelection(pdfWindow, 'backward', 'sentence');
        break;
      case 'extendParagraphForward':
        this.modifySelection(pdfWindow, 'forward', 'paragraph');
        break;
      case 'extendParagraphBackward':
        this.modifySelection(pdfWindow, 'backward', 'paragraph');
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
      case 'yankParagraph':
        this.yankParagraph(pdfWindow);
        break;
      case 'searchSelection':
        this.searchSelection(pdfWindow);
        break;
      case 'swapVisualEnds':
        this.swapVisualEnds(pdfWindow);
        break;
      case 'toggleReaderSplitHorizontal':
        this.toggleSplit('horizontal');
        break;
      case 'toggleReaderSplitVertical':
        this.toggleSplit('vertical');
        break;
      case 'focusReaderSplitLeft':
        this.focusDirection('left');
        break;
      case 'focusReaderSplitDown':
        this.focusDirection('down');
        break;
      case 'focusReaderSplitUp':
        this.focusDirection('up');
        break;
      case 'focusReaderSplitRight':
        this.focusDirection('right');
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

  private injectSelectionStyle(pdfWindow: PdfWindow): void {
    const document = pdfWindow.document;
    if (document.getElementById('zv-sel-css')) return;
    const style = document.createElement('style');
    style.id = 'zv-sel-css';
    style.textContent =
      '.textLayer,.textLayer span{user-select:text!important;-moz-user-select:text!important}.textLayer span{cursor:text!important}.textLayer ::selection{background:rgba(0,82,220,.82)!important;color:#fff!important;text-shadow:0 0 1px rgba(0,0,0,.45)!important}';
    (document.head ?? document.documentElement).appendChild(style);
  }

  private setMode(mode: ReaderMode): void {
    const previousMode = this.state.mode;
    if (this.#flash.isOpen) this.#flash.cancel();
    if (this.#linkHints.hasHints) this.#linkHints.cancelHints();
    if (this.state.mode === 'insert' && mode !== 'insert') this.#commentEditor.invalidate();
    if (previousMode === 'visual' && mode !== 'visual') {
      this.#selectionActions.close();
      this.#dependencies.selection?.clearOwner(this);
    }
    if (mode !== 'normal') this.#smoothScroller.stop(true);
    this.#inputRevision += 1;
    this.state.mode = mode;
    this.state.keyBuffer = '';
    this.state.countBuffer = '';
    this.clearKeyTimer();
    this.clearKeyGuide();
    if (mode !== 'visual') this.removeVisualCursor(this.state.activePdfWindow);
    this.updateIndicator();
  }

  private clearKeyGuide(): void {
    this.clearTimer(this.#keyGuideTimer);
    this.#keyGuideTimer = null;
    this.#keyGuide.hide();
  }

  private refreshKeyGuide(): void {
    const config = keyGuideConfig(this.#dependencies.controller.dependencies.preferences);
    const prefix = this.state.keyBuffer;
    if (!config.enabled || this.state.mode !== 'normal' || !isLeaderPrefix(prefix)) {
      this.clearKeyGuide();
      return;
    }
    const entries = leaderGuideEntries(
      this.#dependencies.bindings(),
      this.state.mode,
      prefix,
      this.keyGuideLanguage(),
    );
    if (!entries.length) {
      this.clearKeyGuide();
      return;
    }
    const document = this.#dependencies.reader._iframeWindow?.document;
    if (!document) return;
    if (this.#keyGuide.visible) {
      this.#keyGuide.show(
        document,
        { add: (root) => this.themeRoot(root as HTMLElement) },
        prefix,
        entries,
        config.fontSizePx,
      );
      return;
    }
    this.clearTimer(this.#keyGuideTimer);
    this.#keyGuideTimer = this.schedule(config.delayMs, () => {
      this.#keyGuideTimer = null;
      if (this.state.mode !== 'normal' || this.state.keyBuffer !== prefix) return;
      this.#keyGuide.show(
        document,
        { add: (root) => this.themeRoot(root as HTMLElement) },
        prefix,
        entries,
        config.fontSizePx,
      );
    });
  }

  private keyGuideLanguage(): KeyGuideLanguage {
    return keyGuideLanguage(
      this.#dependencies.controller.dependencies.preferences.get('language', ''),
      typeof Zotero === 'undefined' ? '' : (Zotero.locale ?? ''),
    );
  }

  private updateIndicator(): void {
    const indicator = this.state.indicator;
    if (!indicator) return;
    if (this.state.mode === 'normal' && !this.state.keyBuffer && !this.state.countBuffer) {
      indicator.style.display = 'none';
      return;
    }
    indicator.style.display = 'block';
    if (this.state.mode === 'visual') {
      const selected = annotationText(this.activePdfWindow()?.getSelection()?.toString() ?? '');
      const pending = this.state.countBuffer || this.state.keyBuffer;
      indicator.textContent = `SELECT · ${selected.length} chars · Enter actions · s Flash · Esc cancel${pending ? `  ${this.state.countBuffer}${this.state.keyBuffer}` : ''}`;
      indicator.style.color = THEME_VARS.onAccent;
      indicator.style.background = THEME_VARS.accent;
      return;
    }
    indicator.textContent = `-- ${this.state.mode.toUpperCase()} --${this.state.countBuffer || this.state.keyBuffer ? `  ${this.state.countBuffer}${this.state.keyBuffer}` : ''}`;
    indicator.style.color = this.state.mode === 'normal' ? THEME_VARS.text : THEME_VARS.onAccent;
    indicator.style.background =
      this.state.mode === 'insert' ? THEME_VARS.success : THEME_VARS.elevated;
  }

  /** Delegates one jump to Zotero's per-view history without caching private host methods. */
  private navigateHistory(direction: 'back' | 'forward'): void {
    try {
      const internal = this.#dependencies.reader._internalReader;
      const navigate = direction === 'back' ? internal?.navigateBack : internal?.navigateForward;
      if (typeof navigate !== 'function') {
        this.showStatus('History unavailable', 1500);
        return;
      }
      navigate.call(internal);
    } catch (error) {
      this.#dependencies.controller.dependencies.logger.debug(
        `reader history ${direction} failed: ${String(error)}`,
      );
      this.showStatus('History unavailable', 1500);
    }
  }

  /** Delegates repeated step zoom and one-shot reset to Zotero's per-reader internal API. */
  private zoomReader(direction: 'in' | 'out' | 'reset', steps: number): void {
    try {
      const internal = this.#dependencies.reader._internalReader;
      const zoom =
        direction === 'in'
          ? internal?.zoomIn
          : direction === 'out'
            ? internal?.zoomOut
            : internal?.zoomReset;
      if (typeof zoom !== 'function') {
        this.showStatus('Zoom unavailable', 1500);
        return;
      }
      const repeat = direction === 'reset' ? 1 : steps;
      for (let index = 0; index < repeat; index += 1) zoom.call(internal);
    } catch (error) {
      this.#dependencies.controller.dependencies.logger.debug(
        `reader zoom ${direction} failed: ${String(error)}`,
      );
      this.showStatus('Zoom unavailable', 1500);
    }
  }

  private showStatus(message: string, duration = 2000): void {
    const indicator = this.state.indicator;
    if (!indicator) return;
    indicator.style.display = 'block';
    indicator.textContent = message;
    indicator.style.color = THEME_VARS.onAccent;
    indicator.style.background = message.startsWith('✓')
      ? THEME_VARS.success
      : message.startsWith('→') || message.startsWith('▶')
        ? THEME_VARS.accent
        : THEME_VARS.error;
    this.schedule(duration, () => this.updateIndicator());
  }

  private modeEnabled(mode: Exclude<ReaderMode, 'normal'>): boolean {
    return this.#dependencies.controller.dependencies.preferences.get(`mode.${mode}.enabled`, true);
  }

  private scrollStep(): number {
    return Math.max(
      1,
      this.#dependencies.controller.dependencies.preferences.get('scrollStep', 60),
    );
  }

  private defaultHighlightColor(): AnnotationColor {
    const configured = this.#dependencies.controller.dependencies.preferences.get(
      'defaultHighlightColor',
      'yellow',
    );
    return configured in COLORS ? COLORS[configured as keyof typeof COLORS] : COLORS.yellow;
  }

  private scrollContainer(pdfWindow: PdfWindow): HTMLElement {
    return (pdfWindow.PDFViewerApplication?.pdfViewer?.container ??
      pdfWindow.document.getElementById('viewerContainer') ??
      pdfWindow.document.scrollingElement ??
      pdfWindow.document.documentElement) as HTMLElement;
  }

  private scrollBy(pdfWindow: PdfWindow, x: number, y: number, smooth = false): void {
    const container = this.scrollContainer(pdfWindow);
    if (smooth && this.#smoothScroller.mode !== 'step') {
      try {
        container.scrollBy(cloneInto({ left: x, top: y, behavior: 'smooth' as const }, pdfWindow));
        return;
      } catch {
        // Fall through to coordinate scrolling where a host view rejects options objects.
      }
    }
    container.scrollBy(x, y);
  }

  private scrollTo(pdfWindow: PdfWindow, top: number, smooth = false): void {
    const container = this.scrollContainer(pdfWindow);
    if (smooth && this.#smoothScroller.mode !== 'step') {
      try {
        container.scrollTo(cloneInto({ top, behavior: 'smooth' as const }, pdfWindow));
        return;
      } catch {
        // Fall through to numeric scrollTo.
      }
    }
    container.scrollTo(0, top);
  }

  private viewport(pdfWindow: PdfWindow): number {
    return this.scrollContainer(pdfWindow).clientHeight || 600;
  }

  private clearAnnotation(): void {
    this.state.lastAnnotationKey = null;
  }

  private pageNavigationSupported(reader: ReaderRuntime): boolean {
    return (
      typeof (reader._internalReader?._lastView ?? reader._internalReader?._primaryView)
        ?.navigateToNextPage === 'function'
    );
  }

  private navigatePage(direction: number): void {
    const internal = this.#dependencies.reader._internalReader;
    if (!this.pageNavigationSupported(this.#dependencies.reader)) {
      this.showStatus('✗ Page navigation not supported here', 1500);
      return;
    }
    const method = direction > 0 ? internal?.navigateToNextPage : internal?.navigateToPreviousPage;
    for (let index = 0; index < Math.abs(direction); index += 1) method?.call(internal);
  }

  private navigateBoundary(count: number, last: boolean, pdfWindow: PdfWindow): void {
    const internal = this.#dependencies.reader._internalReader;
    if (!this.pageNavigationSupported(this.#dependencies.reader)) {
      this.scrollTo(
        pdfWindow,
        last
          ? Math.max(0, this.scrollContainer(pdfWindow).scrollHeight - this.viewport(pdfWindow))
          : 0,
      );
      return;
    }
    if (count > 0 && internal?.navigate && this.#dependencies.reader._iframeWindow) {
      internal.navigate(
        cloneInto({ pageIndex: count - 1 }, this.#dependencies.reader._iframeWindow),
      );
    } else if (last) internal?.navigateToLastPage?.();
    else internal?.navigateToFirstPage?.();
  }

  private openSearch(pdfWindow: PdfWindow): void {
    const internal = this.#dependencies.reader._internalReader;
    const outerWindow = this.#dependencies.reader._iframeWindow;
    if (internal?.toggleFindPopup && outerWindow) {
      internal.toggleFindPopup(cloneInto({ open: true }, outerWindow));
      return;
    }
    const input = outerWindow?.document.querySelector<HTMLInputElement>(
      '.primary-view .find-popup input',
    );
    input?.focus();
    input?.select();
    pdfWindow.focus();
  }

  private clearSearch(): void {
    const internal = this.#dependencies.reader._internalReader;
    const outerWindow = this.#dependencies.reader._iframeWindow;
    if (internal?.toggleFindPopup && outerWindow) {
      internal.toggleFindPopup(cloneInto({ open: false }, outerWindow));
      return;
    }
    const input = outerWindow?.document.querySelector<HTMLInputElement>('.find-popup input');
    if (input && outerWindow?.document.activeElement === input) input.blur();
  }

  private find(next: boolean): void {
    const internal = this.#dependencies.reader._internalReader;
    const active =
      internal?._primaryView?._findState?.active ||
      internal?._secondaryView?._findState?.active ||
      internal?._state?.primaryViewFindState?.active ||
      internal?._state?.secondaryViewFindState?.active;
    if (!active) {
      this.showStatus('No active search — press / to search', 1500);
      return;
    }
    if (next) internal?.findNext?.();
    else internal?.findPrevious?.();
  }

  private scrollToPagePosition(pdfWindow: PdfWindow, position: 'top' | 'center' | 'bottom'): void {
    const viewer = pdfWindow.PDFViewerApplication?.pdfViewer;
    const container = viewer?.container;
    if (!viewer || !container) {
      const element = this.scrollContainer(pdfWindow);
      const available = Math.max(0, element.scrollHeight - element.clientHeight);
      this.scrollTo(
        pdfWindow,
        position === 'top' ? 0 : position === 'bottom' ? available : available / 2,
        true,
      );
      return;
    }
    const pageNumber = viewer.currentPageNumber ?? 1;
    const page = pdfWindow.document.querySelector<HTMLElement>(
      `.page[data-page-number="${pageNumber}"]`,
    );
    if (!page) return;
    const target =
      position === 'top'
        ? page.offsetTop
        : position === 'bottom'
          ? page.offsetTop + page.offsetHeight - container.clientHeight
          : page.offsetTop + page.offsetHeight / 2 - container.clientHeight / 2;
    this.scrollTo(pdfWindow, Math.max(0, target), true);
  }

  private activateFlashTarget(
    intent: FlashIntent,
    pdfWindow: PdfWindow,
    target: FlashSelectionTarget,
  ): void {
    if (!target.start.textNode.isConnected || !target.end.textNode.isConnected) return;
    const selection = pdfWindow.getSelection();
    if (!selection) return;
    this.state.visualPreferredX = null;
    if (intent === 'visual-start') {
      this.state.visualAnchor = target.start;
      this.setMode('visual');
      selection.setBaseAndExtent(
        target.start.textNode,
        target.start.offset,
        target.end.textNode,
        target.end.offset,
      );
      this.updateVisualCursor(pdfWindow, true);
      this.showStatus('✓ selection started', 650);
      return;
    }
    if (this.state.mode !== 'visual') return;
    this.ensureVisualAnchor(pdfWindow);
    const anchor = this.state.visualAnchor;
    if (!anchor?.textNode.isConnected) return;
    const focus = this.comparePointers(target.end, anchor) <= 0 ? target.start : target.end;
    selection.setBaseAndExtent(anchor.textNode, anchor.offset, focus.textNode, focus.offset);
    this.updateVisualCursor(pdfWindow, true);
    this.showStatus('✓ selection updated', 650);
  }

  private comparePointers(left: Pointer, right: Pointer): number {
    if (left.textNode === right.textNode) return left.offset - right.offset;
    const compare = left.textNode.compareDocumentPosition?.(right.textNode) ?? 0;
    if (compare & 4) return -1;
    if (compare & 2) return 1;
    return 0;
  }

  private enterVisual(pdfWindow: PdfWindow): void {
    const selection = pdfWindow.getSelection();
    this.state.visualAnchor = null;
    this.state.visualPreferredX = null;
    if (selection && !selection.isCollapsed && isTextNode(selection.anchorNode)) {
      this.state.visualAnchor = { textNode: selection.anchorNode, offset: selection.anchorOffset };
      this.setMode('visual');
      this.updateVisualCursor(pdfWindow, true);
      return;
    }
    this.#flash.open(pdfWindow, 'visual-start');
  }

  private firstTextPosition(pdfWindow: PdfWindow): { textNode: Text; offset: number } | null {
    const span = pdfWindow.document.querySelector('.textLayer span') as HTMLElement | null;
    const text = span?.firstChild ?? null;
    return isTextNode(text) ? { textNode: text, offset: 0 } : null;
  }

  private modifySelection(
    pdfWindow: PdfWindow,
    direction: 'forward' | 'backward',
    granularity: 'character' | 'word' | 'sentence' | 'paragraph',
  ): void {
    this.state.visualPreferredX = null;
    this.ensureVisualAnchor(pdfWindow);
    pdfWindow.getSelection()?.modify('extend', direction, granularity);
    this.updateVisualCursor(pdfWindow, true);
  }

  private extendByLine(pdfWindow: PdfWindow, direction: -1 | 1): void {
    this.ensureVisualAnchor(pdfWindow);
    const selection = pdfWindow.getSelection();
    const anchor = this.state.visualAnchor;
    if (!selection || !anchor || !isTextNode(selection.focusNode)) return;
    const pointer = { textNode: selection.focusNode, offset: selection.focusOffset };
    const target = verticalTextPosition(pdfWindow, pointer, direction, this.state.visualPreferredX);
    if (!target) return;
    this.state.visualPreferredX = target.preferredX;
    selection.setBaseAndExtent(
      anchor.textNode,
      anchor.offset,
      target.pointer.textNode,
      target.pointer.offset,
    );
    this.updateVisualCursor(pdfWindow, true);
  }

  private extendLineBoundary(pdfWindow: PdfWindow, end: boolean): void {
    this.state.visualPreferredX = null;
    this.ensureVisualAnchor(pdfWindow);
    pdfWindow.getSelection()?.modify('extend', end ? 'forward' : 'backward', 'lineboundary');
    this.updateVisualCursor(pdfWindow, true);
  }

  private ensureVisualAnchor(pdfWindow: PdfWindow): void {
    if (this.state.visualAnchor?.textNode.isConnected) return;
    const selection = pdfWindow.getSelection();
    const anchor = selection?.anchorNode ?? null;
    if (isTextNode(anchor))
      this.state.visualAnchor = { textNode: anchor, offset: selection?.anchorOffset ?? 0 };
    else this.state.visualAnchor = this.firstTextPosition(pdfWindow);
  }

  private updateVisualCursor(pdfWindow: PdfWindow, autoPan: boolean): void {
    this.removeVisualCursor(pdfWindow);
    if (this.state.mode !== 'visual') return;
    const selection = pdfWindow.getSelection();
    const focus = selection?.focusNode ?? null;
    const node = isTextNode(focus) ? focus : this.state.visualAnchor?.textNode;
    const offset = isTextNode(focus)
      ? (selection?.focusOffset ?? 0)
      : (this.state.visualAnchor?.offset ?? 0);
    if (!node?.isConnected) return;
    const range = pdfWindow.document.createRange();
    range.setStart(node, Math.min(offset, node.length));
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const cursor = pdfWindow.document.createElement('span');
    cursor.dataset.zvCursor = '1';
    cursor.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;height:${Math.max(12, rect.height)}px;width:3px;background:#0057d9;z-index:99997;pointer-events:none;box-shadow:0 0 0 1px #fff,0 0 0 2px #0057d9;border-radius:1px;`;
    pdfWindow.document.body?.appendChild(cursor);
    this.#dependencies.selection?.noteOwner(this);
    this.updateIndicator();
    if (autoPan) {
      const container = this.scrollContainer(pdfWindow);
      if (rect.top < 20) this.scrollBy(pdfWindow, 0, rect.top - 40);
      else if (rect.bottom > container.clientHeight - 20)
        this.scrollBy(pdfWindow, 0, rect.bottom - container.clientHeight + 40);
    }
  }

  private removeVisualCursor(pdfWindow: PdfWindow): void {
    const cursors = Array.from(
      pdfWindow.document.querySelectorAll('[data-zv-cursor]'),
    ) as HTMLElement[];
    for (const cursor of cursors) cursor.remove();
  }

  private readerViewForWindow(pdfWindow: PdfWindow): ReaderViewRuntime | null {
    const internal = this.#dependencies.reader._internalReader;
    if (internal?._primaryView?._iframeWindow === pdfWindow) return internal._primaryView;
    if (internal?._secondaryView?._iframeWindow === pdfWindow) return internal._secondaryView;
    if (internal?._lastView?._iframeWindow === pdfWindow) return internal._lastView;
    return null;
  }

  private swapVisualEnds(pdfWindow: PdfWindow): void {
    const selection = pdfWindow.getSelection();
    if (
      !selection ||
      selection.rangeCount === 0 ||
      selection.isCollapsed ||
      !this.state.visualAnchor
    )
      return;
    const range = selection.getRangeAt(0);
    const anchorIsStart =
      this.state.visualAnchor.textNode === range.startContainer &&
      this.state.visualAnchor.offset === range.startOffset;
    const focusNode = anchorIsStart ? range.endContainer : range.startContainer;
    const focusOffset = anchorIsStart ? range.endOffset : range.startOffset;
    if (!isTextNode(focusNode)) return;
    selection.setBaseAndExtent(
      focusNode,
      focusOffset,
      this.state.visualAnchor.textNode,
      this.state.visualAnchor.offset,
    );
    this.state.visualAnchor = { textNode: focusNode, offset: focusOffset };
    this.state.visualPreferredX = null;
    this.updateVisualCursor(pdfWindow, true);
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
      this.state.lastAnnotationKey = item.key;
      this.showStatus('✓ annotated', 1200);
      if (focusComment) await this.enterAnnotationInsert();
    } catch (error) {
      this.showStatus(`✗ ${String(error).slice(0, 40)}`, 4000);
    }
  }

  selectionContext(): ReaderSelectionContext | null {
    if (this.state.mode !== 'visual') return null;
    const pdfWindow = this.activePdfWindow();
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
    addBuiltIn('neo.highlight-yellow', 'highlightYellow');
    addBuiltIn('neo.underline', 'underlineSelection');
    addBuiltIn('neo.add-note', 'addNote');
    addBuiltIn('neo.highlight-red', 'highlightRed');
    addBuiltIn('neo.highlight-green', 'highlightGreen');
    addBuiltIn('neo.highlight-blue', 'highlightBlue');
    addBuiltIn('neo.highlight-purple', 'highlightPurple');
    addBuiltIn('neo.copy', 'copySelection');
    addBuiltIn('neo.search', 'searchSelection');
    actions.push(...(this.#dependencies.selection?.registered(context) ?? []));
    return actions;
  }

  private copySelection(pdfWindow: PdfWindow): void {
    const selection = pdfWindow.getSelection();
    if (selection && !selection.isCollapsed) this.copyText(annotationText(selection.toString()));
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

  private navigateAnnotation(direction: -1 | 1): void {
    const attachment = this.itemForReader(this.#dependencies.reader);
    let annotations =
      attachment
        ?.getAnnotations?.()
        .filter((annotation) =>
          ['highlight', 'underline', 'note', 'text'].includes(annotation.annotationType ?? ''),
        ) ?? [];
    if (this.state.filterColor)
      annotations = annotations.filter(
        (annotation) => annotation.annotationColor === this.state.filterColor,
      );
    annotations = [...annotations].sort((left, right) =>
      (left.annotationSortIndex ?? '').localeCompare(right.annotationSortIndex ?? ''),
    );
    if (!annotations.length) {
      this.showStatus('✗ no annotations', 2000);
      return;
    }
    const current = this.state.lastAnnotationKey
      ? annotations.findIndex((annotation) => annotation.key === this.state.lastAnnotationKey)
      : -1;
    const index =
      current < 0
        ? direction > 0
          ? 0
          : annotations.length - 1
        : (current + direction + annotations.length) % annotations.length;
    const target = annotations[index];
    if (!target) return;
    this.state.lastAnnotationKey = target.key;
    this.navigateToAnnotation(target);
    this.showStatus(`→ ann ${index + 1}/${annotations.length}`, 1500);
  }

  private navigateToAnnotation(annotation: AnnotationRuntime): void {
    const readerWindow = this.#dependencies.reader._iframeWindow;
    const internal = this.#dependencies.reader._internalReader;
    if (!readerWindow || !internal) return;
    if (internal.setSelectedAnnotations) {
      internal.setSelectedAnnotations(cloneInto([annotation.key], readerWindow));
      return;
    }
    internal.navigate?.(cloneInto({ annotationID: annotation.key }, readerWindow));
  }

  private async deleteAnnotation(): Promise<void> {
    const target = this.selectedAnnotation();
    if (!target?.eraseTx) {
      this.showStatus('✗ navigate first with [ / ]', 2000);
      return;
    }
    this.#dependencies.reader._internalReader?.setSelectedAnnotations?.([]);
    this.state.lastAnnotationKey = null;
    await target.eraseTx();
    this.showStatus('✓ annotation deleted', 1500);
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
    this.state.filterColor = color;
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

  private yankParagraph(pdfWindow: PdfWindow): void {
    const selection = pdfWindow.getSelection();
    const text = selection?.toString() ?? '';
    if (!text) {
      this.showStatus('✗ no selection', 2000);
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
    const key =
      this.state.lastAnnotationKey ??
      this.#dependencies.reader._internalReader?._state?.selectedAnnotationIDs?.[0] ??
      null;
    if (!key) return null;
    return (
      this.itemForReader(this.#dependencies.reader)
        ?.getAnnotations?.()
        .find((annotation) => annotation.key === key) ?? null
    );
  }

  private async enterAnnotationInsert(): Promise<void> {
    const key =
      this.state.lastAnnotationKey ??
      this.#dependencies.reader._internalReader?._state?.selectedAnnotationIDs?.[0] ??
      null;
    if (!key) {
      this.showStatus('✗ navigate first with [ / ]', 2000);
      return;
    }
    this.setMode('insert');
    this.state.lastAnnotationKey = key;
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

  private async exitAnnotationInsert(): Promise<void> {
    const saved = await this.#commentEditor.exit();
    this.setMode('normal');
    this.activePdfWindow()?.focus();
    this.showStatus(saved ? '✓ saved' : '✗ save failed', saved ? 1200 : 2500);
  }

  private async handOverNativeEditor(): Promise<void> {
    this.setMode('normal');
    await this.#commentEditor.handOver();
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

  private toggleSplit(type: 'horizontal' | 'vertical'): void {
    const internal = this.#dependencies.reader._internalReader;
    if (type === 'horizontal') internal?.toggleHorizontalSplit?.();
    else internal?.toggleVerticalSplit?.();
    this.syncPdfViews();
  }

  private splitFocusTarget(
    direction: FocusDirection,
  ): { readonly primary: boolean; readonly window: PdfWindow } | null {
    const internal = this.#dependencies.reader._internalReader;
    const primary = asPdfWindow(internal?._primaryView?._iframeWindow);
    const secondary = asPdfWindow(internal?._secondaryView?._iframeWindow);
    if (!primary || !secondary || !internal?.splitType) return null;
    const activePrimary = this.state.activePdfWindow !== secondary;
    const targetPrimary =
      internal.splitType === 'vertical'
        ? direction === 'left' && !activePrimary
          ? true
          : direction === 'right' && activePrimary
            ? false
            : null
        : direction === 'up' && !activePrimary
          ? true
          : direction === 'down' && activePrimary
            ? false
            : null;
    if (targetPrimary === null) return null;
    return { primary: targetPrimary, window: targetPrimary ? primary : secondary };
  }

  private canFocusDirection(direction: FocusDirection): boolean {
    if (this.splitFocusTarget(direction)) return true;
    return (
      direction === 'right' &&
      typeof this.#dependencies.reader._window?.ZoteroContextPane?.focus === 'function'
    );
  }

  private focusDirection(direction: FocusDirection): boolean {
    const target = this.splitFocusTarget(direction);
    if (target) {
      try {
        const internal = this.#dependencies.reader._internalReader;
        if (internal?.focusView) internal.focusView(target.primary);
        else target.window.focus();
        this.state.activePdfWindow = target.window;
        return true;
      } catch (error) {
        this.#dependencies.controller.dependencies.logger.debug(
          `reader split focus failed: ${String(error)}`,
        );
        return false;
      }
    }
    if (direction !== 'right') return false;
    const focusContext = this.#dependencies.reader._window?.ZoteroContextPane?.focus;
    if (!focusContext) return false;
    try {
      focusContext.call(this.#dependencies.reader._window?.ZoteroContextPane);
      return true;
    } catch (error) {
      this.#dependencies.controller.dependencies.logger.debug(
        `reader context focus failed: ${String(error)}`,
      );
      return false;
    }
  }
  /**
   * Starts a smooth hold only for an executable resolved scroll action. The physical key may be
   * direct (`j`/`k` or a custom single-key remap) or the continuation of a multi-key chord such
   * as `zh`/`zl`; pending chord state is cleared before holding so repeated continuations cannot
   * fall through to another Normal action.
   */
  private startSmoothHold(event: KeyboardEvent, pdfWindow: PdfWindow, key: string): boolean {
    if (this.#smoothScroller.isRepeat(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
    if (
      this.#smoothScroller.mode === 'step' ||
      this.state.mode !== 'normal' ||
      this.state.countBuffer ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return false;
    const bindings = this.#dependencies.bindings();
    const directAction = bindings['normal:' + key];
    if (!this.state.keyBuffer && (!directAction || !smoothScrollSpec(directAction))) return false;
    const decision = advanceInput(
      {
        mode: 'normal',
        keyBuffer: this.state.keyBuffer,
        countBuffer: this.state.countBuffer,
        bindings,
        allowCountPrefix: true,
      },
      key,
    );
    if (decision.kind !== 'execute') return false;
    const spec = smoothScrollSpec(decision.action);
    if (!spec || !this.#smoothScroller.start(pdfWindow, event.key, spec)) return false;
    const hadPendingSequence = !!this.state.keyBuffer;
    this.state.keyBuffer = '';
    this.state.countBuffer = '';
    if (hadPendingSequence) {
      this.clearKeyTimer();
      this.clearKeyGuide();
      this.updateIndicator();
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  private activatePdfWindow(pdfWindow: PdfWindow): void {
    const internal = this.#dependencies.reader._internalReader;
    const secondary = asPdfWindow(internal?._secondaryView?._iframeWindow);
    if (secondary) {
      const primary = pdfWindow !== secondary;
      const hostPrimary = internal?._lastViewPrimary ?? internal?._state?.primary;
      if (hostPrimary !== undefined && hostPrimary !== primary) {
        internal?.focusView?.(primary);
      }
    }
    this.state.activePdfWindow = pdfWindow;
  }

  private activePdfWindow(): PdfWindow | null {
    const reader = this.#dependencies.reader;
    const internal = reader._internalReader;
    const primary = asPdfWindow(internal?._primaryView?._iframeWindow);
    const secondary = asPdfWindow(internal?._secondaryView?._iframeWindow);
    const hostPrimary = internal?._lastViewPrimary ?? internal?._state?.primary;
    if (secondary && hostPrimary === false) return secondary;
    if (primary && hostPrimary === true) return primary;
    if (this.state.activePdfWindow === secondary) return secondary;
    if (this.state.activePdfWindow === primary) return primary;
    const focused = Services.focus?.focusedWindow;
    if (focused === secondary) return secondary;
    if (focused === primary) return primary;
    return primary ?? secondary ?? this.state.activePdfWindow;
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

  private scrollToPageRatio(
    pdfWindow: PdfWindow,
    pageIndex: number,
    ratio: number,
    attempt = 0,
  ): void {
    const container =
      pdfWindow.PDFViewerApplication?.pdfViewer?.container ??
      pdfWindow.document.getElementById('viewerContainer');
    const page = pdfWindow.document.querySelector<HTMLElement>(
      `.page[data-page-number="${pageIndex + 1}"]`,
    );
    if (!page || !container) {
      if (attempt < 10)
        this.schedule(80, () => this.scrollToPageRatio(pdfWindow, pageIndex, ratio, attempt + 1));
      return;
    }
    this.scrollTo(
      pdfWindow,
      Math.max(0, page.offsetTop + page.offsetHeight * ratio - container.clientHeight / 2),
    );
  }

  private scrollDocumentToRatio(pdfWindow: PdfWindow, ratio: number): void {
    const container = this.scrollContainer(pdfWindow);
    this.scrollTo(pdfWindow, ratio * Math.max(0, container.scrollHeight - container.clientHeight));
  }

  private clearKeyTimer(): void {
    this.clearTimer(this.state.keyTimeout);
    this.state.keyTimeout = null;
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
