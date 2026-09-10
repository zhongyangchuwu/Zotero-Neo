import type {
  ReaderControllerApi,
  ReaderControllerDependencies,
  MainWindow,
} from '../core/contracts';
import { CleanupScope } from '../core/cleanup';
import { copyToClipboard } from '../platform/clipboard';
import { cloneInto } from '../platform/cross-compartment';
import { asElement, asKeyboardEvent, isEditableElement } from '../platform/dom';
import { advanceInput, bindingMatchesPrefix, resolveInputTimeout } from '../input/engine';
import { keyString } from '../input/keys';
import { resolveBindings, type BindingMap } from '../input/bindings';
import type { ActionId } from '../input/actions';
import { THEME_VARS, ThemeManager } from '../ui/theme';
import { ReaderMarks } from './marks';
import { ReaderOutline, type OutlineHost } from './outline';
import {
  COLORS,
  type AnnotationColor,
  type AnnotationDraft,
  type AnnotationRuntime,
  type AnnotationSelectionParams,
  type ItemRuntime,
  type PdfWindow,
  type ReaderEventRuntime,
  type ReaderLinkOverlay,
  type ReaderLinkPosition,
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

interface SessionDependencies {
  readonly controller: ReaderController;
  readonly reader: ReaderRuntime;
  readonly firstPdfWindow: PdfWindow;
  readonly bindings: () => BindingMap;
  readonly release: () => void;
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
  readonly #outline: ReaderOutline;
  readonly #themeManagers = new Map<Window, ThemeManager>();
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
      cursorPreferredX: null,
      hintBadges: [],
      hintBuffer: '',
      hintStage: null,
      hintTargetMode: null,
      hintStarts: [],
      hintRepositionFrame: null,
      linkHintBadges: [],
      linkHintBuffer: '',
      linkHintWindow: null,
      linkHintRepositionFrame: null,
      marks: {},
      marksExplorerOpen: false,
      marksExplorerSelected: 0,
      marksOverlay: null,
      marksList: null,
      marksThemeCleanup: null,
      outline: {
        open: false,
        loading: false,
        tree: null,
        visible: [],
        selected: 0,
        overlay: null,
        list: null,
        status: null,
        themeCleanup: null,
        hintBuffer: '',
        hintTimer: null,
        commandBuffer: '',
        commandTimer: null,
      },
      sidebarOutlineIndex: -1,
      filterColor: null,
      lastAnnotationKey: null,
      smoothHold: {
        active: false,
        releasing: false,
        key: null,
        axis: null,
        direction: 0,
        speed: 0,
        rafId: null,
        lastTimestamp: 0,
      },
      commentOverlay: null,
      commentInput: null,
      commentThemeCleanup: null,
      commentItemID: null,
      commentLibraryID: null,
      commentAutosaveTimer: null,
      composing: false,
      insertSession: 0,
      insertWatchdog: null,
      previousDeleteFromComment: undefined,
      popupGuard: null,
    };
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
    const outlineHost: OutlineHost = {
      schedule: (delay, task) => this.schedule(delay, task),
      clearTimer: (timer) => this.clearTimer(timer),
      log: (message) => dependencies.controller.dependencies.logger.debug(message),
      setModeNormal: () => this.setMode('normal'),
      themeRoot: (root) => this.themeRoot(root),
    };
    this.#outline = new ReaderOutline(outlineHost);
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
    this.state.insertSession += 1;
    this.stopSmoothHold(true);
    this.closeMarksExplorer();
    this.#outline.close(this.state.outline);
    this.closeCommentOverlay();
    for (const [pdfWindow, handlers] of this.#viewHandlers)
      this.removeViewHandlers(pdfWindow, handlers);
    this.#viewHandlers.clear();
    this.restorePatches();
    this.#scope.dispose();
    this.state.indicatorThemeCleanup?.();
    this.state.indicatorThemeCleanup = null;
    for (const manager of this.#themeManagers.values()) manager.dispose();
    this.#themeManagers.clear();
    this.state.indicator?.remove();
    this.state.indicator = null;
    this.clearHints();
    this.clearLinkHints();
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
          !this.state.commentInput ||
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
        if (keyEvent) this.handleKeyUp(keyEvent, pdfWindow);
      }) as EventListener;
      const blur = (() => this.stopSmoothHold(true)) as EventListener;
      const selection = (() => {
        if (pdfWindow.getSelection()?.isCollapsed) this.state.selectionParams = null;
      }) as EventListener;
      const scroll = (() => {
        if (this.state.hintBadges.length) this.repositionHints(pdfWindow);
        if (this.state.linkHintWindow === pdfWindow) this.repositionLinkHints(pdfWindow);
        if (this.state.mode === 'visual' || this.state.mode === 'cursor')
          this.updateVisualCursor(pdfWindow, false);
      }) as EventListener;
      const resize = (() => {
        this.repositionHints(pdfWindow);
        if (this.state.linkHintWindow === pdfWindow) this.repositionLinkHints(pdfWindow);
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
    if (this.state.linkHintWindow === pdfWindow) this.clearLinkHints();
    this.releaseViewTheme(pdfWindow);
  }

  /**
   * Releases Neo overlays and theme subscriptions owned by a PDF view that Zotero removed or
   * recreated, without affecting the reader chrome or surviving split view.
   */
  private releaseViewTheme(pdfWindow: PdfWindow): void {
    if (this.state.outline.overlay?.ownerDocument.defaultView === pdfWindow) {
      this.#outline.close(this.state.outline);
    }
    if (this.state.commentOverlay?.ownerDocument.defaultView === pdfWindow) {
      this.closeCommentOverlay();
    }
    if (this.state.marksOverlay?.ownerDocument.defaultView === pdfWindow) {
      this.closeMarksExplorer();
    }
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
        const input = session.state.commentInput;
        if (input?.isConnected && view._iframeWindow?.document.activeElement === input) return true;
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

  private handleKeyUp(event: KeyboardEvent, pdfWindow: PdfWindow): void {
    if (this.state.smoothHold.key !== event.key) return;
    const mode = this.scrollMode();
    this.stopSmoothHold(
      mode === 'follow' ||
        this.#dependencies.controller.dependencies.preferences.get(
          'smoothScroll.stopOnRelease',
          false,
        ),
    );
    if (!this.state.smoothHold.active && !this.state.smoothHold.releasing)
      this.clearSmoothFrame(pdfWindow);
  }

  private handleKeyDown(event: KeyboardEvent, pdfWindow: PdfWindow): void {
    this.state.activePdfWindow = pdfWindow;
    if (this.nativeEditableFocused()) {
      if (this.state.linkHintBadges.length) this.clearLinkHints();
      return;
    }
    if (
      this.state.outline.open &&
      this.#outline.handleKey(this.state.outline, this.#dependencies.reader, pdfWindow, event)
    )
      return;
    if (this.state.marksExplorerOpen) {
      this.handleMarksExplorerKey(event, pdfWindow);
      return;
    }
    if (this.state.linkHintBadges.length && isEditableElement(asElement(event.target))) {
      this.clearLinkHints();
      return;
    }
    if (this.state.linkHintBadges.length) {
      this.handleLinkHintKey(event, pdfWindow);
      return;
    }
    if (this.state.hintBadges.length) {
      this.handleHintKey(event, pdfWindow);
      return;
    }
    if (this.state.mode === 'insert') {
      this.handleInsertKey(event);
      return;
    }
    if (isEditableElement(asElement(event.target))) return;
    const key = keyString(event);
    if (!key) return;
    if (this.startSmoothHold(event, pdfWindow)) return;
    if (this.handleMarkChord(event, key, pdfWindow)) return;
    const decision = advanceInput(
      {
        mode: this.state.mode,
        keyBuffer: this.state.keyBuffer,
        countBuffer: this.state.countBuffer,
      },
      key,
      this.#dependencies.bindings(),
      { allowCountPrefix: this.state.mode === 'normal' || this.state.mode === 'cursor' },
    );
    this.state.keyBuffer = decision.state.keyBuffer;
    this.state.countBuffer = decision.state.countBuffer;
    if (decision.kind === 'pass') {
      this.updateIndicator();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.clearKeyTimer();
    if (decision.kind === 'execute') {
      this.updateIndicator();
      this.executeAction(decision.action, decision.count, pdfWindow);
      return;
    }
    this.updateIndicator();
    if (decision.timeoutMs !== null) {
      this.state.keyTimeout = this.schedule(decision.timeoutMs, () => {
        if (this.#scope.disposed) return;
        const resolved = resolveInputTimeout(decision);
        this.state.keyBuffer = resolved.state.keyBuffer;
        this.state.countBuffer = resolved.state.countBuffer;
        this.updateIndicator();
        if (resolved.kind === 'execute')
          this.executeAction(resolved.action, resolved.count, this.activePdfWindow());
      });
    }
  }

  private handleInsertKey(event: KeyboardEvent): void {
    if (keyString(event) === 'escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.exitAnnotationInsert();
      return;
    }
    if (event.target === this.state.commentInput) event.stopImmediatePropagation();
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
    if (this.state.mode === 'insert')
      return (
        key === 'escape' ||
        (!!this.state.commentInput &&
          (key.length === 1 || ['backspace', 'delete', 'enter'].includes(key)))
      );
    if (
      this.state.marksExplorerOpen ||
      this.state.outline.open ||
      this.state.hintBadges.length ||
      this.state.linkHintBadges.length
    )
      return true;
    if (
      this.state.keyBuffer === 'm' ||
      this.state.keyBuffer === '`' ||
      this.state.keyBuffer === 'dm'
    )
      return /^[a-z0-9]$/.test(key);
    const bindings = this.#dependencies.bindings();
    return (
      !!bindings[`${this.state.mode}:${key}`] ||
      Object.keys(bindings).some((binding) => bindingMatchesPrefix(binding, this.state.mode, key))
    );
  }

  private executeAction(action: ActionId, count: number, pdfWindow: PdfWindow | null): void {
    if (!pdfWindow) return;
    const number = Math.max(1, count || 1);
    if (action.startsWith('main')) {
      this.#dependencies.controller.dependencies.delegateMain(action, count);
      return;
    }
    if (action === 'toggleReaderSidebarOutline') {
      void this.#outline.toggle(this.state.outline, this.#dependencies.reader, pdfWindow);
      return;
    }
    if (action === 'focusReaderSidebar') {
      void this.#outline.focus(this.state.outline, this.#dependencies.reader, pdfWindow);
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
        this.showLinkHints(pdfWindow);
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
      case 'enterCursor':
        if (this.modeEnabled('cursor')) this.enterCursor(pdfWindow);
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
      case 'cursorDown':
        this.moveCursorLine(pdfWindow, 1, number);
        break;
      case 'cursorUp':
        this.moveCursorLine(pdfWindow, -1, number);
        break;
      case 'cursorLeft':
        this.moveCursor(pdfWindow, 'backward', 'character', number);
        break;
      case 'cursorRight':
        this.moveCursor(pdfWindow, 'forward', 'character', number);
        break;
      case 'cursorWordForward':
        this.moveCursor(pdfWindow, 'forward', 'word', number);
        break;
      case 'cursorBigWordForward':
        this.moveCursor(pdfWindow, 'forward', 'word', number);
        break;
      case 'cursorWordBackward':
        this.moveCursor(pdfWindow, 'backward', 'word', number);
        break;
      case 'cursorBigWordBackward':
        this.moveCursor(pdfWindow, 'backward', 'word', number);
        break;
      case 'cursorLineStart':
        this.moveCursorBoundary(pdfWindow, false);
        break;
      case 'cursorLineEnd':
        this.moveCursorBoundary(pdfWindow, true);
        break;
      case 'cursorToVisual':
        this.cursorToVisual(pdfWindow);
        break;
      case 'toggleReaderSplitHorizontal':
        this.toggleSplit('horizontal');
        break;
      case 'toggleReaderSplitVertical':
        this.toggleSplit('vertical');
        break;
      case 'focusReaderSplitLeft':
        this.focusSplit('left');
        break;
      case 'focusReaderSplitDown':
        this.focusSplit('down');
        break;
      case 'focusReaderSplitUp':
        this.focusSplit('up');
        break;
      case 'focusReaderSplitRight':
        this.focusSplit('right');
        break;
      default:
        this.#dependencies.controller.dependencies.logger.debug(
          `unhandled reader action: ${action}`,
        );
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
      '.textLayer,.textLayer span{user-select:text!important;-moz-user-select:text!important}.textLayer span{cursor:text!important}.textLayer ::selection{background:rgba(0,140,255,.6)!important;color:inherit!important}@keyframes zv-cursor-blink{0%,100%{opacity:1}50%{opacity:0}}';
    (document.head ?? document.documentElement).appendChild(style);
  }

  private setMode(mode: ReaderMode): void {
    if (this.state.linkHintBadges.length) this.clearLinkHints();
    if (this.state.mode === 'insert' && mode !== 'insert') this.state.insertSession += 1;
    if (mode !== 'normal') this.stopSmoothHold(true);
    this.state.mode = mode;
    this.state.keyBuffer = '';
    this.state.countBuffer = '';
    this.clearKeyTimer();
    if (mode !== 'insert') this.clearTimer(this.state.insertWatchdog);
    if (mode !== 'visual' && mode !== 'cursor') this.clearHints();
    if (mode !== 'visual' && mode !== 'cursor') this.removeVisualCursor(this.state.activePdfWindow);
    this.updateIndicator();
  }

  private updateIndicator(): void {
    const indicator = this.state.indicator;
    if (!indicator) return;
    if (this.state.mode === 'normal' && !this.state.keyBuffer && !this.state.countBuffer) {
      indicator.style.display = 'none';
      return;
    }
    indicator.style.display = 'block';
    indicator.textContent = `-- ${this.state.mode.toUpperCase()} --${this.state.countBuffer || this.state.keyBuffer ? `  ${this.state.countBuffer}${this.state.keyBuffer}` : ''}`;
    indicator.style.color = this.state.mode === 'normal' ? THEME_VARS.text : THEME_VARS.onAccent;
    indicator.style.background =
      this.state.mode === 'visual'
        ? THEME_VARS.accent
        : this.state.mode === 'cursor'
          ? THEME_VARS.warning
          : this.state.mode === 'insert'
            ? THEME_VARS.success
            : THEME_VARS.elevated;
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

  private scrollMode(): 'step' | 'follow' | 'trapezoid' {
    const configured = this.#dependencies.controller.dependencies.preferences.get(
      'scroll.mode',
      'follow',
    );
    return configured === 'step' || configured === 'trapezoid' || configured === 'follow'
      ? configured
      : 'follow';
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
    if (smooth && this.scrollMode() !== 'step') {
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
    if (smooth && this.scrollMode() !== 'step') {
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

  private enterVisual(pdfWindow: PdfWindow): void {
    const selection = pdfWindow.getSelection();
    this.state.visualAnchor = null;
    this.setMode('visual');
    if (selection && !selection.isCollapsed && isTextNode(selection.anchorNode)) {
      this.state.visualAnchor = { textNode: selection.anchorNode, offset: selection.anchorOffset };
      this.updateVisualCursor(pdfWindow, true);
      return;
    }
    this.showHints(pdfWindow, 'visual');
  }

  private enterCursor(pdfWindow: PdfWindow): void {
    this.state.visualAnchor = null;
    this.state.cursorPreferredX = null;
    this.setMode('cursor');
    this.showHints(pdfWindow, 'cursor');
  }

  private cursorToVisual(pdfWindow: PdfWindow): void {
    if (!this.ensureCursor(pdfWindow)) return;
    const selection = pdfWindow.getSelection();
    if (!selection?.anchorNode || !isTextNode(selection.anchorNode)) return;
    this.setMode('visual');
    this.state.visualAnchor = { textNode: selection.anchorNode, offset: selection.anchorOffset };
    this.updateVisualCursor(pdfWindow, true);
  }

  private ensureCursor(pdfWindow: PdfWindow): boolean {
    const selection = pdfWindow.getSelection();
    if (!selection) return false;
    if (selection.rangeCount && selection.isCollapsed) return true;
    const anchor = this.state.visualAnchor?.textNode.isConnected
      ? this.state.visualAnchor
      : this.firstTextPosition(pdfWindow);
    if (!anchor) return false;
    const range = pdfWindow.document.createRange();
    range.setStart(anchor.textNode, Math.min(anchor.offset, anchor.textNode.length));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    this.state.visualAnchor = anchor;
    return true;
  }

  private firstTextPosition(pdfWindow: PdfWindow): { textNode: Text; offset: number } | null {
    const span = pdfWindow.document.querySelector('.textLayer span') as HTMLElement | null;
    const text = span?.firstChild ?? null;
    return isTextNode(text) ? { textNode: text, offset: 0 } : null;
  }

  private moveCursor(
    pdfWindow: PdfWindow,
    direction: 'forward' | 'backward',
    granularity: 'character' | 'word',
    count: number,
  ): void {
    if (!this.ensureCursor(pdfWindow)) return;
    const selection = pdfWindow.getSelection();
    if (!selection) return;
    for (let index = 0; index < count; index += 1) selection.modify('move', direction, granularity);
    if (isTextNode(selection.focusNode))
      this.state.visualAnchor = { textNode: selection.focusNode, offset: selection.focusOffset };
    this.updateVisualCursor(pdfWindow, true);
  }

  private moveCursorLine(pdfWindow: PdfWindow, direction: -1 | 1, count: number): void {
    if (!this.ensureCursor(pdfWindow)) return;
    const selection = pdfWindow.getSelection();
    if (!selection) return;
    for (let index = 0; index < count; index += 1)
      selection.modify('move', direction > 0 ? 'forward' : 'backward', 'line');
    if (isTextNode(selection.focusNode))
      this.state.visualAnchor = { textNode: selection.focusNode, offset: selection.focusOffset };
    this.updateVisualCursor(pdfWindow, true);
  }

  private moveCursorBoundary(pdfWindow: PdfWindow, end: boolean): void {
    if (!this.ensureCursor(pdfWindow)) return;
    const selection = pdfWindow.getSelection();
    if (!selection) return;
    selection.modify('move', end ? 'forward' : 'backward', 'lineboundary');
    if (isTextNode(selection.focusNode))
      this.state.visualAnchor = { textNode: selection.focusNode, offset: selection.focusOffset };
    this.updateVisualCursor(pdfWindow, true);
  }

  private modifySelection(
    pdfWindow: PdfWindow,
    direction: 'forward' | 'backward',
    granularity: 'character' | 'word' | 'sentence' | 'paragraph',
  ): void {
    this.ensureVisualAnchor(pdfWindow);
    pdfWindow.getSelection()?.modify('extend', direction, granularity);
    this.updateVisualCursor(pdfWindow, true);
  }

  private extendByLine(pdfWindow: PdfWindow, direction: -1 | 1): void {
    this.ensureVisualAnchor(pdfWindow);
    pdfWindow.getSelection()?.modify('extend', direction > 0 ? 'forward' : 'backward', 'line');
    this.updateVisualCursor(pdfWindow, true);
  }

  private extendLineBoundary(pdfWindow: PdfWindow, end: boolean): void {
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
    if (this.state.mode !== 'visual' && this.state.mode !== 'cursor') return;
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
    cursor.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;height:${Math.max(12, rect.height)}px;width:2px;background:#f9e2af;z-index:99997;pointer-events:none;animation:zv-cursor-blink 1s step-end infinite;`;
    pdfWindow.document.body?.appendChild(cursor);
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

  private showHints(pdfWindow: PdfWindow, targetMode: ReaderMode): void {
    this.clearLinkHints();
    this.clearHints();
    const starts = this.textNodes(pdfWindow)
      .map((textNode) => ({ textNode, offset: 0 }))
      .filter(({ textNode }) => textNode.data.trim());
    if (!starts.length) {
      this.showStatus('✗ no selectable text', 1500);
      this.setMode('normal');
      return;
    }
    const labels = this.hintLabels(starts.length);
    this.state.hintStarts = starts;
    this.state.hintTargetMode = targetMode;
    this.state.hintStage = 'coarse';
    starts.forEach((start, index) => {
      const range = pdfWindow.document.createRange();
      range.setStart(start.textNode, start.offset);
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      const badge = pdfWindow.document.createElement('span');
      badge.textContent = labels[index] ?? '';
      badge.style.cssText = `position:fixed;left:${rect.left}px;top:${Math.max(0, rect.top - 17)}px;z-index:99998;background:#f9e2af;color:#1e1e2e;padding:1px 3px;border-radius:2px;font:10px monospace;pointer-events:none;`;
      pdfWindow.document.body?.appendChild(badge);
      this.state.hintBadges.push({
        element: badge,
        label: labels[index] ?? '',
        textNode: start.textNode,
        offset: start.offset,
      });
    });
  }

  private handleHintKey(event: KeyboardEvent, pdfWindow: PdfWindow): void {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      this.clearHints();
      this.setMode('normal');
      return;
    }
    if (event.key === 'Backspace') {
      this.state.hintBuffer = this.state.hintBuffer.slice(0, -1);
      this.refreshHints();
      return;
    }
    if (!/^[a-z]$/i.test(event.key)) return;
    const next = `${this.state.hintBuffer}${event.key.toUpperCase()}`;
    const matches = this.state.hintBadges.filter((badge) => badge.label.startsWith(next));
    if (!matches.length) {
      this.state.hintBuffer = '';
      this.refreshHints();
      return;
    }
    this.state.hintBuffer = next;
    this.refreshHints();
    const exact = matches.find((badge) => badge.label === next);
    if (exact || matches.length === 1) this.activateHint(pdfWindow, exact ?? matches[0]!);
  }

  private activateHint(
    pdfWindow: PdfWindow,
    badge: { readonly textNode: Text; readonly offset: number },
  ): void {
    const selection = pdfWindow.getSelection();
    if (!selection) return;
    const range = pdfWindow.document.createRange();
    range.setStart(badge.textNode, badge.offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    this.state.visualAnchor = { textNode: badge.textNode, offset: badge.offset };
    const target = this.state.hintTargetMode;
    this.clearHints();
    if (target === 'visual') this.setMode('visual');
    else if (target === 'cursor') this.setMode('cursor');
    this.updateVisualCursor(pdfWindow, true);
  }

  private refreshHints(): void {
    for (const badge of this.state.hintBadges)
      badge.element.style.display = badge.label.startsWith(this.state.hintBuffer)
        ? 'block'
        : 'none';
  }

  private repositionHints(pdfWindow: PdfWindow): void {
    if (this.state.hintRepositionFrame !== null) return;
    this.state.hintRepositionFrame = pdfWindow.requestAnimationFrame(() => {
      this.state.hintRepositionFrame = null;
      for (const badge of this.state.hintBadges) {
        if (!badge.textNode.isConnected) continue;
        const range = pdfWindow.document.createRange();
        range.setStart(badge.textNode, Math.min(badge.offset, badge.textNode.length));
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        badge.element.style.left = `${rect.left}px`;
        badge.element.style.top = `${Math.max(0, rect.top - 17)}px`;
      }
    });
  }

  private clearHints(): void {
    for (const badge of this.state.hintBadges) badge.element.remove();
    this.state.hintBadges = [];
    this.state.hintBuffer = '';
    this.state.hintStarts = [];
    this.state.hintStage = null;
    this.state.hintTargetMode = null;
    if (this.state.hintRepositionFrame !== null)
      this.state.activePdfWindow.cancelAnimationFrame(this.state.hintRepositionFrame);
    this.state.hintRepositionFrame = null;
  }

  private hintLabels(count: number): string[] {
    const alphabet = 'ASDFJKLGHQWERTYUIOPZXCVBNM';
    let width = 1;
    let capacity = alphabet.length;
    while (capacity < count) {
      width += 1;
      capacity *= alphabet.length;
    }
    return Array.from({ length: count }, (_, index) => {
      let value = index;
      const label = Array.from({ length: width }, () => alphabet[0]!);
      for (let position = width - 1; position >= 0; position -= 1) {
        label[position] = alphabet[value % alphabet.length]!;
        value = Math.floor(value / alphabet.length);
      }
      return label.join('');
    });
  }

  private showLinkHints(pdfWindow: PdfWindow): void {
    this.clearHints();
    this.clearLinkHints();
    this.state.linkHintWindow = pdfWindow;
    try {
      const view = this.readerViewForWindow(pdfWindow);
      if (!view) throw new Error('active PDF view not found');
      const pages = view._pdfPages;
      if (!pages || typeof pages !== 'object')
        throw new Error(`PDF page map unavailable (${typeof pages})`);
      if (typeof view.getClientRectForPopup !== 'function')
        throw new Error('PDF client-rectangle conversion unavailable');
      const seen = new Set<string>();
      const targets: {
        readonly overlay: ReaderLinkOverlay;
        readonly rect: readonly number[];
      }[] = [];
      for (const page of Object.values(pages)) {
        if (!Array.isArray(page?.overlays)) continue;
        for (const value of page.overlays) {
          if (!this.isReaderLinkOverlay(value)) continue;
          const rect = this.linkClientRect(view, value);
          if (!rect || !this.linkRectIsVisible(pdfWindow, rect)) continue;
          const key = this.linkSourceKey(value);
          if (seen.has(key)) continue;
          seen.add(key);
          targets.push({ overlay: value, rect });
        }
      }
      const labels = this.hintLabels(targets.length);
      targets.forEach(({ overlay, rect }, index) => {
        const badge = pdfWindow.document.createElement('span');
        badge.textContent = labels[index] ?? '';
        badge.style.cssText =
          'position:fixed;z-index:99999;background:#f9e2af;color:#1e1e2e;padding:1px 3px;border:1px solid #1e1e2e;border-radius:2px;font:bold 10px monospace;line-height:1.2;pointer-events:none;';
        this.positionLinkHint(badge, rect);
        pdfWindow.document.body?.appendChild(badge);
        this.state.linkHintBadges.push({
          element: badge,
          label: labels[index] ?? '',
          overlay,
        });
      });
    } catch (error) {
      this.clearLinkHints();
      const message = `reader follow link discovery failed: ${String(error)}`;
      this.#dependencies.controller.dependencies.logger.debug(message);
      this.#dependencies.controller.dependencies.logger.diagnostic(message);
      this.showStatus('Link hints unavailable', 1500);
      return;
    }
    if (!this.state.linkHintBadges.length) {
      this.clearLinkHints();
      this.showStatus('No visible links', 1500);
    }
  }

  private handleLinkHintKey(event: KeyboardEvent, pdfWindow: PdfWindow): void {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      this.clearLinkHints();
      pdfWindow.focus();
      return;
    }
    if (event.key === 'Backspace') {
      this.state.linkHintBuffer = this.state.linkHintBuffer.slice(0, -1);
      this.refreshLinkHints(pdfWindow);
      return;
    }
    if (!/^[a-z]$/i.test(event.key)) return;
    const next = `${this.state.linkHintBuffer}${event.key.toUpperCase()}`;
    const matches = this.state.linkHintBadges.filter(
      (badge) => !badge.element.hidden && badge.label.startsWith(next),
    );
    if (!matches.length) {
      this.state.linkHintBuffer = '';
      this.refreshLinkHints(pdfWindow);
      return;
    }
    this.state.linkHintBuffer = next;
    this.refreshLinkHints(pdfWindow);
    const visibleMatches = matches.filter((badge) => !badge.element.hidden);
    const exact = visibleMatches.find((badge) => badge.label === next);
    if (exact || visibleMatches.length === 1)
      this.activateLinkHint(pdfWindow, exact ?? visibleMatches[0]!);
  }

  private activateLinkHint(
    pdfWindow: PdfWindow,
    badge: { readonly overlay: ReaderLinkOverlay },
  ): void {
    const overlay = badge.overlay;
    this.clearLinkHints();
    try {
      const view = this.readerViewForWindow(pdfWindow);
      let result: void | Promise<void>;
      if (overlay.type === 'external-link') {
        if (typeof view?._onOpenLink !== 'function') throw new Error('missing external open-link');
        result = view._onOpenLink(overlay.url);
      } else {
        if (typeof view?.navigate !== 'function') throw new Error('missing internal navigation');
        const readerWindow = this.#dependencies.reader._iframeWindow;
        if (!readerWindow) throw new Error('reader window unavailable');
        const position =
          overlay.type === 'internal-link'
            ? overlay.destinationPosition
            : overlay.references[0]!.position;
        result = view.navigate(cloneInto({ position }, readerWindow));
      }
      if (result && typeof result.then === 'function')
        void Promise.resolve(result).catch((error: unknown) =>
          this.reportLinkActivationFailure(error),
        );
    } catch (error) {
      this.reportLinkActivationFailure(error);
    }
  }

  private reportLinkActivationFailure(error: unknown): void {
    const message = `reader follow link activation failed: ${String(error)}`;
    this.#dependencies.controller.dependencies.logger.debug(message);
    this.#dependencies.controller.dependencies.logger.diagnostic(message);
    this.showStatus('Link unavailable', 1500);
  }

  private refreshLinkHints(pdfWindow: PdfWindow): void {
    try {
      const view = this.readerViewForWindow(pdfWindow);
      if (!view || typeof view.getClientRectForPopup !== 'function') {
        this.clearLinkHints();
        return;
      }
      for (const badge of this.state.linkHintBadges) {
        const rect = this.linkClientRect(view, badge.overlay);
        const visible = !!rect && this.linkRectIsVisible(pdfWindow, rect);
        badge.element.hidden = !visible || !badge.label.startsWith(this.state.linkHintBuffer);
        if (rect) this.positionLinkHint(badge.element, rect);
      }
    } catch {
      this.clearLinkHints();
    }
  }

  private repositionLinkHints(pdfWindow: PdfWindow): void {
    if (this.state.linkHintRepositionFrame !== null) return;
    this.state.linkHintRepositionFrame = pdfWindow.requestAnimationFrame(() => {
      this.state.linkHintRepositionFrame = null;
      if (this.state.linkHintWindow === pdfWindow) this.refreshLinkHints(pdfWindow);
    });
  }

  private clearLinkHints(): void {
    for (const badge of this.state.linkHintBadges) badge.element.remove();
    this.state.linkHintBadges = [];
    this.state.linkHintBuffer = '';
    const owner = this.state.linkHintWindow;
    if (owner && this.state.linkHintRepositionFrame !== null)
      owner.cancelAnimationFrame(this.state.linkHintRepositionFrame);
    this.state.linkHintRepositionFrame = null;
    this.state.linkHintWindow = null;
  }

  private readerViewForWindow(pdfWindow: PdfWindow): ReaderViewRuntime | null {
    const internal = this.#dependencies.reader._internalReader;
    if (internal?._primaryView?._iframeWindow === pdfWindow) return internal._primaryView;
    if (internal?._secondaryView?._iframeWindow === pdfWindow) return internal._secondaryView;
    if (internal?._lastView?._iframeWindow === pdfWindow) return internal._lastView;
    return null;
  }

  private isReaderLinkOverlay(value: unknown): value is ReaderLinkOverlay {
    if (!value || typeof value !== 'object') return false;
    const overlay = value as {
      readonly type?: unknown;
      readonly position?: unknown;
      readonly destinationPosition?: unknown;
      readonly url?: unknown;
    };
    if (!this.isReaderLinkPosition(overlay.position)) return false;
    if (overlay.type === 'internal-link')
      return this.isReaderLinkPosition(overlay.destinationPosition);
    if (overlay.type === 'citation') {
      const references = (overlay as { readonly references?: unknown }).references;
      if (!Array.isArray(references) || !references.length) return false;
      const first = references[0];
      return (
        !!first &&
        typeof first === 'object' &&
        this.isReaderLinkPosition((first as { readonly position?: unknown }).position)
      );
    }
    return overlay.type === 'external-link' && typeof overlay.url === 'string' && !!overlay.url;
  }

  private isReaderLinkPosition(value: unknown): value is ReaderLinkPosition {
    if (!value || typeof value !== 'object') return false;
    const position = value as { readonly pageIndex?: unknown; readonly rects?: unknown };
    return (
      Number.isInteger(position.pageIndex) &&
      Array.isArray(position.rects) &&
      position.rects.length > 0 &&
      position.rects.every(
        (rect) => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite),
      )
    );
  }

  private linkClientRect(
    view: ReaderViewRuntime,
    overlay: ReaderLinkOverlay,
  ): readonly number[] | null {
    const rect = view.getClientRectForPopup?.(overlay.position);
    return rect?.length === 4 &&
      rect.every(Number.isFinite) &&
      rect[2]! > rect[0]! &&
      rect[3]! > rect[1]!
      ? rect
      : null;
  }

  private linkRectIsVisible(pdfWindow: PdfWindow, rect: readonly number[]): boolean {
    const width = pdfWindow.innerWidth || pdfWindow.document.documentElement.clientWidth;
    const height = pdfWindow.innerHeight || pdfWindow.document.documentElement.clientHeight;
    return rect[2]! > 0 && rect[3]! > 0 && rect[0]! < width && rect[1]! < height;
  }

  private linkSourceKey(overlay: ReaderLinkOverlay): string {
    return `${overlay.position.pageIndex}:${overlay.position.rects
      .map((rect) => rect.map((value) => Math.round(value * 10)).join(','))
      .join(';')}`;
  }

  private positionLinkHint(element: HTMLElement, rect: readonly number[]): void {
    element.style.left = `${Math.max(0, rect[0]!)}px`;
    element.style.top = `${Math.max(0, rect[1]! - 14)}px`;
  }

  private textNodes(pdfWindow: PdfWindow): Text[] {
    const spans = Array.from(
      pdfWindow.document.querySelectorAll('.textLayer span'),
    ) as HTMLElement[];
    return spans
      .map((span) => span.firstChild ?? null)
      .filter((node): node is Text => isTextNode(node) && !!node.data.trim());
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
    this.updateVisualCursor(pdfWindow, true);
  }

  private async highlight(
    pdfWindow: PdfWindow,
    color: AnnotationColor,
    focusComment = false,
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
    );
    selection.removeAllRanges();
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
      item.annotationType = 'highlight';
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
    const session = ++this.state.insertSession;
    const annotation = await this.resolveAnnotation(key);
    if (
      this.#scope.disposed ||
      this.state.mode !== 'insert' ||
      session !== this.state.insertSession
    )
      return;
    this.state.commentItemID = annotation?.id ?? null;
    this.state.commentLibraryID = annotation?.libraryID ?? null;
    const pdfWindow = this.activePdfWindow();
    if (!pdfWindow) return;
    this.#dependencies.reader._internalReader?.navigate?.({ annotationID: key });
    this.state.previousDeleteFromComment =
      this.#dependencies.reader._internalReader?._enableAnnotationDeletionFromComment;
    if (this.#dependencies.reader._internalReader)
      this.#dependencies.reader._internalReader._enableAnnotationDeletionFromComment = false;
    this.createCommentOverlay(
      pdfWindow,
      annotation?.annotationComment ?? '',
      annotation?.annotationText ?? '',
    );
    this.armPopupGuard();
    this.schedule(60, () => {
      if (this.state.insertSession !== session || !this.state.commentInput?.isConnected) return;
      this.state.commentInput.focus();
      const length = this.state.commentInput.value.length;
      this.state.commentInput.selectionStart = length;
      this.state.commentInput.selectionEnd = length;
      this.keepCommentFocus(session);
    });
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

  private createCommentOverlay(pdfWindow: PdfWindow, comment: string, quote: string): void {
    this.closeCommentOverlay();
    const document = pdfWindow.document;
    const overlay = document.createElement('div');
    overlay.id = 'zv-annotation-comment';
    overlay.style.cssText = `position:fixed;left:50%;bottom:14px;transform:translateX(-50%);width:min(560px,92%);z-index:99998;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 8px 32px ${THEME_VARS.shadow};display:flex;flex-direction:column;font:13px/1.4 sans-serif`;
    if (quote) {
      const excerpt = document.createElement('div');
      excerpt.style.cssText = `padding:8px 12px;color:${THEME_VARS.muted};font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:${THEME_VARS.elevated}`;
      excerpt.textContent = annotationText(quote).slice(0, 200);
      overlay.appendChild(excerpt);
    }
    const input = document.createElement('textarea');
    input.id = 'zv-annotation-comment-input';
    input.value = comment;
    input.spellcheck = false;
    input.style.cssText = `width:100%;box-sizing:border-box;min-height:72px;max-height:220px;padding:10px 12px;background:${THEME_VARS.input};color:${THEME_VARS.text};border:0;outline:2px solid ${THEME_VARS.focusRing};outline-offset:-2px;resize:none;font:13px/1.5 sans-serif`;
    input.addEventListener('compositionstart', () => {
      this.state.composing = true;
    });
    input.addEventListener('compositionend', () => {
      this.state.composing = false;
    });
    input.addEventListener('input', () => this.scheduleCommentAutosave());
    const hint = document.createElement('div');
    hint.style.cssText = `padding:5px 12px;border-top:1px solid ${THEME_VARS.border};color:${THEME_VARS.muted};font-size:11px`;
    hint.textContent = /^zh/i.test(zoteroRuntime().locale ?? '')
      ? 'Enter 换行 · Esc 保存并关闭'
      : 'Enter newline · Esc save & close';
    overlay.append(input, hint);
    document.body?.appendChild(overlay);
    this.state.commentThemeCleanup = this.themeRoot(overlay);
    this.state.commentOverlay = overlay;
    this.state.commentInput = input;
  }

  private async exitAnnotationInsert(): Promise<void> {
    const saved = await this.saveAndCloseCommentOverlay();
    this.restoreAnnotationDeletionFlag();
    this.setMode('normal');
    this.activePdfWindow()?.focus();
    this.showStatus(saved ? '✓ saved' : '✗ save failed', saved ? 1200 : 2500);
  }

  private async handOverNativeEditor(): Promise<void> {
    this.setMode('normal');
    this.restoreAnnotationDeletionFlag();
    await this.saveAndCloseCommentOverlay();
  }

  private async saveAndCloseCommentOverlay(): Promise<boolean> {
    const text = this.state.commentInput?.value ?? null;
    const key = this.state.lastAnnotationKey;
    this.closeCommentOverlay();
    if (text === null || !key) return true;
    const annotation = await this.annotationForSave(key);
    if (!annotation || annotation.deleted) return false;
    if ((annotation.annotationComment ?? '') !== text) {
      annotation.annotationComment = text;
      await annotation.saveTx();
    }
    return true;
  }

  private closeCommentOverlay(): void {
    this.state.commentThemeCleanup?.();
    this.state.commentThemeCleanup = null;
    this.state.commentOverlay?.remove();
    this.state.commentOverlay = null;
    this.state.commentInput = null;
    this.clearTimer(this.state.commentAutosaveTimer);
    this.state.commentAutosaveTimer = null;
    this.state.popupGuard?.disconnect();
    this.state.popupGuard = null;
  }

  private scheduleCommentAutosave(): void {
    this.clearTimer(this.state.commentAutosaveTimer);
    this.state.commentAutosaveTimer = this.schedule(2000, () => {
      const key = this.state.lastAnnotationKey;
      const text = this.state.commentInput?.value;
      if (!key || text === undefined) return;
      void this.annotationForSave(key).then(async (annotation) => {
        if (!annotation || annotation.deleted || annotation.annotationComment === text) return;
        annotation.annotationComment = text;
        await annotation.saveTx();
      });
    });
  }

  private async annotationForSave(key: string): Promise<AnnotationRuntime | null> {
    const items = zoteroRuntime().Items;
    let annotation: AnnotationRuntime | null = null;
    if (this.state.commentItemID !== null) {
      const cached = items.get(this.state.commentItemID);
      if (cached) annotation = cached;
    }
    if (!annotation && this.state.commentLibraryID !== null) {
      const indexed = items.getByLibraryAndKey?.(this.state.commentLibraryID, key) ?? null;
      if (indexed) annotation = indexed;
    }
    if (!annotation && this.state.commentLibraryID !== null && items.getByLibraryAndKeyAsync) {
      const fetched = await items.getByLibraryAndKeyAsync(this.state.commentLibraryID, key);
      if (fetched) annotation = fetched;
    }
    if (annotation?.loadDataType) await annotation.loadDataType('annotation');
    return annotation;
  }

  private armPopupGuard(): void {
    const outerWindow = this.#dependencies.reader._iframeWindow;
    const root = outerWindow?.document.body;
    if (!outerWindow || !root || typeof outerWindow.MutationObserver !== 'function') return;
    const guard = new outerWindow.MutationObserver((mutations: MutationRecord[]) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          const element = asElement(node);
          if (!element) continue;
          const popup = element.matches('.annotation-popup')
            ? element
            : element.querySelector('.annotation-popup');
          const input = popup?.querySelector<HTMLElement>(
            '[contenteditable="true"],textarea,input',
          );
          input?.dispatchEvent(
            new outerWindow.KeyboardEvent('keydown', {
              key: 'Escape',
              code: 'Escape',
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      }
    });
    guard.observe(root, { childList: true, subtree: true });
    this.state.popupGuard = guard;
  }

  private keepCommentFocus(session: number): void {
    if (this.state.mode !== 'insert' || session !== this.state.insertSession) return;
    if (this.nativeEditableFocused()) {
      void this.handOverNativeEditor();
      return;
    }
    const input = this.state.commentInput;
    if (input?.isConnected && !this.state.composing && input.ownerDocument.activeElement !== input)
      input.focus();
    this.state.insertWatchdog = this.schedule(500, () => this.keepCommentFocus(session));
  }

  private restoreAnnotationDeletionFlag(): void {
    const internal = this.#dependencies.reader._internalReader;
    if (internal && this.state.previousDeleteFromComment !== undefined)
      internal._enableAnnotationDeletionFromComment = this.state.previousDeleteFromComment;
    this.state.previousDeleteFromComment = undefined;
  }

  private toggleMarksExplorer(pdfWindow: PdfWindow): void {
    if (this.state.marksExplorerOpen) {
      this.closeMarksExplorer(pdfWindow);
      return;
    }
    this.#outline.close(this.state.outline);
    this.state.marksExplorerOpen = true;
    this.state.marksExplorerSelected = 0;
    const document = pdfWindow.document;
    const overlay = document.createElement('div');
    overlay.id = 'zv-marks-explorer';
    overlay.tabIndex = -1;
    overlay.style.cssText = `position:fixed;top:0;left:0;bottom:0;width:320px;z-index:99998;background:${THEME_VARS.surface};color:${THEME_VARS.text};border-right:1px solid ${THEME_VARS.border};display:flex;flex-direction:column;box-shadow:12px 0 40px ${THEME_VARS.shadow};font:13px/1.35 monospace`;
    const heading = document.createElement('div');
    heading.style.cssText = `padding:12px 14px;border-bottom:1px solid ${THEME_VARS.border};font-weight:bold;background:${THEME_VARS.elevated}`;
    heading.textContent = 'Marks';
    const list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow:auto;padding:8px 0;';
    const help = document.createElement('div');
    help.style.cssText = `padding:6px 12px;border-top:1px solid ${THEME_VARS.border};color:${THEME_VARS.muted};font-size:11px`;
    help.textContent =
      'type a mark char to jump · j/k move · Enter jump · d delete · x delete all · Esc close';
    overlay.append(heading, list, help);
    document.body?.appendChild(overlay);
    this.state.marksThemeCleanup = this.themeRoot(overlay);
    this.state.marksOverlay = overlay;
    this.state.marksList = list;
    this.renderMarksExplorer();
    overlay.focus();
  }

  private handleMarksExplorerKey(event: KeyboardEvent, pdfWindow: PdfWindow): void {
    const key = keyString(event);
    if (!key) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const chars = Object.keys(this.state.marks).sort();
    if (
      /^[a-z0-9]$/.test(key) &&
      this.state.marks[key] &&
      !['j', 'k', 'g', 'G', 'd', 'x'].includes(key)
    ) {
      this.closeMarksExplorer(pdfWindow);
      void this.#marks.jump(
        this.state.marks,
        this.#dependencies.reader,
        pdfWindow,
        key,
        (annotation) => {
          this.state.lastAnnotationKey = annotation;
        },
      );
      return;
    }
    if (key === 'j')
      this.state.marksExplorerSelected = Math.min(
        chars.length - 1,
        this.state.marksExplorerSelected + 1,
      );
    else if (key === 'k')
      this.state.marksExplorerSelected = Math.max(0, this.state.marksExplorerSelected - 1);
    else if (key === 'G') this.state.marksExplorerSelected = Math.max(0, chars.length - 1);
    else if (key === 'enter' || key === 'return') {
      const char = chars[this.state.marksExplorerSelected];
      this.closeMarksExplorer(pdfWindow);
      if (char)
        void this.#marks.jump(
          this.state.marks,
          this.#dependencies.reader,
          pdfWindow,
          char,
          (annotation) => {
            this.state.lastAnnotationKey = annotation;
          },
        );
      return;
    } else if (key === 'd') {
      const char = chars[this.state.marksExplorerSelected];
      if (char) void this.#marks.delete(this.state.marks, this.#dependencies.reader, char);
    } else if (key === 'x') void this.#marks.clear(this.state.marks, this.#dependencies.reader);
    else if (key === 'escape') {
      this.closeMarksExplorer(pdfWindow);
      return;
    }
    this.renderMarksExplorer();
  }

  private closeMarksExplorer(pdfWindow?: PdfWindow): void {
    this.state.marksExplorerOpen = false;
    this.state.marksThemeCleanup?.();
    this.state.marksThemeCleanup = null;
    this.state.marksOverlay?.remove();
    this.state.marksOverlay = null;
    this.state.marksList = null;
    if (pdfWindow) this.schedule(30, () => pdfWindow.focus());
  }

  private renderMarksExplorer(): void {
    const list = this.state.marksList;
    if (!list) return;
    list.replaceChildren();
    const chars = Object.keys(this.state.marks).sort();
    if (!chars.length) {
      const row = list.ownerDocument.createElement('div');
      row.style.cssText = `padding:10px 14px;color:${THEME_VARS.muted}`;
      row.textContent = 'No marks — press m<x> in Normal mode to set one';
      list.appendChild(row);
      return;
    }
    chars.forEach((char, index) => {
      const mark = this.state.marks[char];
      if (!mark) return;
      const row = list.ownerDocument.createElement('div');
      const selected = index === this.state.marksExplorerSelected;
      row.style.cssText = `padding:6px 14px;white-space:nowrap;color:${selected ? THEME_VARS.selectedText : THEME_VARS.text};border-left:3px solid ${selected ? THEME_VARS.accent : 'transparent'};background:${selected ? THEME_VARS.selected : 'transparent'}`;
      row.textContent = `${char}   ${mark.pageIndex === null ? '—' : `p.${mark.pageIndex + 1}  ${Math.round(mark.ratio * 100)}%`}${mark.key ? '  ⚑ ann' : ''}`;
      list.appendChild(row);
    });
  }

  private toggleSplit(type: 'horizontal' | 'vertical'): void {
    const internal = this.#dependencies.reader._internalReader;
    internal?.toggleSplit?.(
      cloneInto({ type }, this.#dependencies.reader._iframeWindow ?? this.state.activePdfWindow),
    );
  }

  private focusSplit(direction: 'left' | 'right' | 'up' | 'down'): void {
    const internal = this.#dependencies.reader._internalReader;
    internal?.focusSplit?.(
      cloneInto(
        { direction },
        this.#dependencies.reader._iframeWindow ?? this.state.activePdfWindow,
      ),
    );
    this.syncPdfViews();
  }

  private startSmoothHold(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
    if (
      this.scrollMode() === 'step' ||
      this.state.mode !== 'normal' ||
      this.state.keyBuffer ||
      this.state.countBuffer ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return false;
    const spec = ({ j: ['y', 1], k: ['y', -1], H: ['x', -1], L: ['x', 1] } as const)[event.key];
    if (!spec) return false;
    const action = this.#dependencies.bindings()[`normal:${event.key}`];
    if (!['scrollDown', 'scrollUp', 'scrollLeft', 'scrollRight'].includes(action ?? ''))
      return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const hold = this.state.smoothHold;
    hold.active = true;
    hold.releasing = false;
    hold.key = event.key;
    hold.axis = spec[0];
    hold.direction = spec[1];
    hold.speed =
      this.scrollMode() === 'follow'
        ? this.#dependencies.controller.dependencies.preferences.get(
            'smoothScroll.followSpeed',
            2000,
          )
        : this.#dependencies.controller.dependencies.preferences.get(
            'smoothScroll.initialSpeed',
            2000,
          );
    this.scrollBy(
      pdfWindow,
      hold.axis === 'x' ? (hold.direction * hold.speed) / 120 : 0,
      hold.axis === 'y' ? (hold.direction * hold.speed) / 120 : 0,
    );
    if (hold.rafId === null)
      hold.rafId = pdfWindow.requestAnimationFrame((timestamp) =>
        this.smoothTick(pdfWindow, timestamp),
      );
    return true;
  }

  private smoothTick(pdfWindow: PdfWindow, timestamp: number): void {
    const hold = this.state.smoothHold;
    if ((!hold.active && !hold.releasing) || !hold.axis || !hold.direction) {
      hold.rafId = null;
      return;
    }
    const seconds = hold.lastTimestamp
      ? Math.min(0.05, Math.max(0.001, (timestamp - hold.lastTimestamp) / 1000))
      : 0.016;
    hold.lastTimestamp = timestamp;
    const preferences = this.#dependencies.controller.dependencies.preferences;
    if (hold.active && this.scrollMode() === 'trapezoid')
      hold.speed = Math.min(
        preferences.get('smoothScroll.maxSpeed', 2000),
        Math.max(
          preferences.get('smoothScroll.initialSpeed', 2000),
          hold.speed + preferences.get('smoothScroll.acceleration', 2600) * seconds,
        ),
      );
    if (hold.releasing) {
      hold.speed = Math.max(
        0,
        hold.speed - preferences.get('smoothScroll.deceleration', 4200) * seconds,
      );
      if (!hold.speed) {
        this.stopSmoothHold(true);
        return;
      }
    }
    const delta = hold.direction * hold.speed * seconds;
    this.scrollBy(pdfWindow, hold.axis === 'x' ? delta : 0, hold.axis === 'y' ? delta : 0);
    hold.rafId = pdfWindow.requestAnimationFrame((next) => this.smoothTick(pdfWindow, next));
  }

  private stopSmoothHold(immediate: boolean): void {
    const hold = this.state.smoothHold;
    if (!immediate && hold.active) {
      hold.active = false;
      hold.releasing = true;
      hold.key = null;
      return;
    }
    hold.active = false;
    hold.releasing = false;
    hold.key = null;
    hold.axis = null;
    hold.direction = 0;
    hold.speed = 0;
    hold.lastTimestamp = 0;
    this.clearSmoothFrame(this.state.activePdfWindow);
  }

  private clearSmoothFrame(pdfWindow: PdfWindow): void {
    const frame = this.state.smoothHold.rafId;
    if (frame !== null) pdfWindow.cancelAnimationFrame(frame);
    this.state.smoothHold.rafId = null;
  }

  private activePdfWindow(): PdfWindow | null {
    const reader = this.#dependencies.reader;
    const focused = Services.focus?.focusedWindow;
    const primary = asPdfWindow(reader._internalReader?._primaryView?._iframeWindow);
    const secondary = asPdfWindow(reader._internalReader?._secondaryView?._iframeWindow);
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
