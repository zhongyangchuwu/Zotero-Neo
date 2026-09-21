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
import {
  appendInputKey,
  bindingEqualsInput,
  bindingMatchesInputPrefix,
} from '../input/key-sequence';
import { resolveBindings, type BindingMap, type Mode } from '../input/bindings';
import { isReaderDelegableMainAction } from '../main/action-capabilities';
import {
  READER_NORMAL_ACTIONS,
  isReaderActionForMode,
  type ReaderAction,
} from './action-capabilities';
import { ACTION_LABELS, focusDirectionForAction, type ActionId } from '../input/actions';
import { KeyGuide } from '../ui/key-guide';
import { THEME_VARS, ThemeManager } from '../ui/theme';
import { ReaderMarks } from './marks';
import { ReaderOutline, type OutlineHost } from './outline';
import { ReaderSidebarOverlay } from './sidebar-overlay';
import { ReaderMarksExplorer } from './marks-explorer';
import { ReaderLinkHints } from './link-hints';
import { ReaderCommentEditor, type AnnotationCommentTarget } from './comment-editor';
import { ReaderHostKeyBridge } from './host-key-bridge';
import { ReaderNavigation } from './navigation';
import { ReaderViewLifecycle } from './view-lifecycle';
import { ReaderFlash } from './flash';
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
  type PdfWindow,
  type ReaderEventRuntime,
  type ReaderMode,
  type ReaderRuntime,
  type ReaderSessionState,
  type ReaderTimer,
  type ReaderViewRuntime,
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

function annotationText(value: string): string {
  return value.normalize('NFKC').replace(/\n/g, ' ').replace(/ {2,}/g, ' ').trim();
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Reader action: ${String(value)}`);
}
function readerBindingMode(
  mode: ReaderMode,
): Extract<Mode, 'reader-normal' | 'reader-select' | 'reader-insert'> {
  return mode === 'normal'
    ? 'reader-normal'
    : mode === 'visual'
      ? 'reader-select'
      : 'reader-insert';
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
  readonly #hostKeyBridge: ReaderHostKeyBridge;
  readonly #viewLifecycle: ReaderViewLifecycle;
  readonly #navigation: ReaderNavigation;
  readonly #marks: ReaderMarks;
  readonly #marksExplorer: ReaderMarksExplorer;
  readonly #sidebar: ReaderSidebarOverlay;
  readonly #outline: ReaderOutline;
  readonly #linkHints: ReaderLinkHints;
  readonly #commentEditor: ReaderCommentEditor;
  readonly #flash: ReaderFlash;
  readonly #selectionRange: ReaderSelectionRange;
  readonly #selectionActions: ReaderSelectionActions;
  readonly #smoothScroller: ReaderSmoothScroller;
  readonly #themeManagers = new Map<Window, ThemeManager>();
  readonly #keyGuide = new KeyGuide();
  #keyGuideTimer: ReaderTimer | null = null;
  #inputRevision = 0;
  #sidebarToggleBuffer = '';
  #sidebarToggleTimer: ReaderTimer | null = null;
  readonly state: ReaderSessionState;

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
      marks: {},
      filterColor: null,
      lastAnnotationKey: null,
    };
    this.#flash = new ReaderFlash({
      activate: (intent, pdfWindow, target) =>
        this.#selectionRange.activateFlashTarget(intent, pdfWindow, target),
      showStatus: (message, duration) => this.showStatus(message, duration),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
    });
    this.#selectionRange = new ReaderSelectionRange({
      mode: () => this.state.mode,
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
      showStatus: (message, duration) => this.showStatus(message, duration),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
      diagnostic: (message) => dependencies.controller.dependencies.logger.diagnostic(message),
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
    });
    this.#hostKeyBridge = new ReaderHostKeyBridge({
      reader: dependencies.reader,
      nativeEditableFocused: () => this.nativeEditableFocused(),
      consumesKey: (key) => this.readerConsumesKey(key),
      commentInputFocused: (window) => this.#commentEditor.isInputFocused(window),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
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
      pageNavigationSupported: () => this.#navigation.pageNavigationSupported(),
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
    this.#viewLifecycle = new ReaderViewLifecycle({
      reader: dependencies.reader,
      timerWindow: dependencies.firstPdfWindow,
      activePdfWindow: () => this.state.activePdfWindow,
      setActivePdfWindow: (pdfWindow) => {
        this.state.activePdfWindow = pdfWindow;
      },
      onKeyDown: (event, pdfWindow) => this.handleKeyDown(event, pdfWindow),
      onKeyUp: (event) => this.handleKeyUp(event),
      onBlur: (pdfWindow) => {
        this.#smoothScroller.stop(true);
        this.#flash.releaseView(pdfWindow);
      },
      onSelectionChange: (pdfWindow) => {
        if (pdfWindow.getSelection()?.isCollapsed) this.state.selectionParams = null;
      },
      onScroll: (pdfWindow) => {
        this.#flash.onViewportChange(pdfWindow);
        this.#linkHints.onViewportChange(pdfWindow);
        if (this.state.mode === 'visual') this.#selectionRange.refresh(pdfWindow, false);
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
      },
      syncHostBridge: () => this.#hostKeyBridge.sync(),
    });
    this.#navigation = new ReaderNavigation({
      reader: dependencies.reader,
      activePdfWindow: () => this.state.activePdfWindow,
      setActivePdfWindow: (pdfWindow) => {
        this.state.activePdfWindow = pdfWindow;
      },
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
    this.#viewLifecycle.start();
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
    this.#selectionRange.leave();
    this.#viewLifecycle.dispose();
    this.#hostKeyBridge.dispose();
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
      mode: readerBindingMode(this.state.mode),
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
        mode: readerBindingMode(this.state.mode),
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
      this.state.keyTimeout = this.schedule(timeoutMs, () => {
        if (this.#scope.disposed || this.#inputRevision !== revision) return;
        const resolved = resolveInputTimeout(decision);
        this.state.keyBuffer = resolved.state.keyBuffer;
        this.state.countBuffer = resolved.state.countBuffer;
        this.clearKeyGuide();
        this.updateIndicator();
        if (resolved.kind === 'execute')
          this.executeAction(resolved.action, resolved.count, this.#navigation.activePdfWindow());
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
    if (this.state.mode !== 'normal' || bindings['reader-normal:m'] || bindings['reader-normal:`'])
      return false;
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
      mode: readerBindingMode(this.state.mode),
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
    return direction ? this.#navigation.canFocusDirection(direction) : true;
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
        this.#navigation.navigateHistory('back');
        break;
      case 'historyForward':
        this.#navigation.navigateHistory('forward');
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
        this.#navigation.zoom('in', number);
        break;
      case 'zoomOut':
        this.#navigation.zoom('out', number);
        break;
      case 'zoomReset':
        this.#navigation.zoom('reset', 1);
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
        this.#navigation.navigatePage(-number);
        break;
      case 'nextPage':
        this.#navigation.navigatePage(number);
        break;
      case 'firstPage':
        this.#navigation.navigateBoundary(count, false, pdfWindow);
        break;
      case 'lastPage':
        this.#navigation.navigateBoundary(count, true, pdfWindow);
        break;
      case 'openSearch':
        this.#navigation.openSearch(pdfWindow);
        break;
      case 'clearSearch':
        this.#navigation.clearSearch();
        break;
      case 'findNext':
        this.#navigation.find(true);
        break;
      case 'findPrevious':
        this.#navigation.find(false);
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
        if (this.modeEnabled('visual')) this.#selectionRange.enter(pdfWindow);
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
    if (mode !== 'visual') this.#selectionRange.leave();
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
      readerBindingMode(this.state.mode),
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
      const selected = annotationText(
        this.#navigation.activePdfWindow()?.getSelection()?.toString() ?? '',
      );
      const pending = this.state.countBuffer || this.state.keyBuffer;
      indicator.textContent = `SELECT · ${selected.length} chars · y copy · Enter actions · s Flash · Esc cancel${pending ? `  ${this.state.countBuffer}${this.state.keyBuffer}` : ''}`;
      indicator.style.color = THEME_VARS.modeVisualText;
      indicator.style.background = THEME_VARS.modeVisual;
      return;
    }
    indicator.textContent = `-- ${this.state.mode.toUpperCase()} --${this.state.countBuffer || this.state.keyBuffer ? `  ${this.state.countBuffer}${this.state.keyBuffer}` : ''}`;
    indicator.style.color =
      this.state.mode === 'insert' ? THEME_VARS.modeInsertText : THEME_VARS.modeNormalText;
    indicator.style.background =
      this.state.mode === 'insert' ? THEME_VARS.modeInsert : THEME_VARS.modeNormal;
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
      this.state.lastAnnotationKey = item.key;
      this.showStatus('✓ annotated', 1200);
      if (focusComment) await this.enterAnnotationInsert();
    } catch (error) {
      this.showStatus(`✗ ${String(error).slice(0, 40)}`, 4000);
    }
  }

  selectionContext(): ReaderSelectionContext | null {
    if (this.state.mode !== 'visual') return null;
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
    this.#navigation.activePdfWindow()?.focus();
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
    const decision = advanceInput(
      {
        mode: 'reader-normal',
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
