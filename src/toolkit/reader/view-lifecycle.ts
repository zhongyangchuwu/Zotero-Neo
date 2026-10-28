import { CleanupFailure } from '../../core/cleanup';
import { isDeadObject } from '../../platform/cross-compartment';
import { asKeyboardEvent } from '../../platform/dom';
import type { PdfWindow, ReaderRuntime } from './contracts';
import type { NativeReaderRuntime, NativeReaderViewRuntime } from './private-types';

interface ViewHandlers {
  readonly view: NativeReaderViewRuntime;
  readonly document: Document;
  readonly cleanups: Array<() => void>;
  ready: boolean;
  retired: boolean;
}

export interface ReaderViewLifecycleDependencies {
  readonly reader: ReaderRuntime;
  readonly timerWindow: PdfWindow;
  readonly onKeyDown: (event: KeyboardEvent, pdfWindow: PdfWindow) => void;
  readonly onKeyUp: (event: KeyboardEvent) => void;
  readonly onPointerDown: (pdfWindow: PdfWindow) => void;
  readonly onBlur: (pdfWindow: PdfWindow, event: FocusEvent) => void;
  readonly onSelectionChange: (pdfWindow: PdfWindow) => void;
  readonly onScroll: (pdfWindow: PdfWindow) => void;
  readonly onResize: (pdfWindow: PdfWindow) => void;
  readonly releaseView: (pdfWindow: PdfWindow) => void;
  readonly syncHostBridge: () => void;
}

function asPdfWindow(window: Window | undefined): PdfWindow | null {
  return (window as PdfWindow | undefined) ?? null;
}

/**
 * Owns discovery and DOM-listener lifecycle for the Reader's primary/secondary PDF views.
 *
 * Feature semantics remain in ReaderSession. This owner only discovers current PDF windows,
 * attaches view-local events, releases detached views, and drives the periodic host-view rescan.
 */
export class ReaderViewLifecycle {
  readonly #dependencies: ReaderViewLifecycleDependencies;
  readonly #reader: NativeReaderRuntime;
  readonly #handlers = new Map<PdfWindow, ViewHandlers>();
  #activePdfWindow: PdfWindow;
  #syncTimer: number | null = null;
  #disposed = false;

  constructor(dependencies: ReaderViewLifecycleDependencies) {
    this.#dependencies = dependencies;
    // Resolving private structure does not create or replace the Reader identity.
    this.#reader = dependencies.reader as NativeReaderRuntime;
    this.#activePdfWindow = dependencies.timerWindow;
  }

  activePdfWindow(): PdfWindow {
    return this.#activePdfWindow;
  }

  setActivePdfWindow(pdfWindow: PdfWindow): void {
    this.#activePdfWindow = pdfWindow;
  }

  start(): void {
    if (this.#disposed || this.#syncTimer !== null) return;
    this.sync();
    if (this.#disposed) return;
    this.#syncTimer = this.#dependencies.timerWindow.setInterval(() => this.sync(), 250);
  }

  sync(): void {
    if (this.#disposed) return;
    const internal = this.#reader._internalReader;
    const wanted = new Map<PdfWindow, { view: NativeReaderViewRuntime; document: Document }>();
    for (const view of [internal?._primaryView, internal?._secondaryView]) {
      const pdfWindow = asPdfWindow(view?._iframeWindow);
      if (!view || !pdfWindow || isDeadObject(pdfWindow)) continue;
      wanted.set(pdfWindow, { view, document: pdfWindow.document });
    }

    if (!wanted.has(this.#activePdfWindow)) {
      const next = wanted.keys().next().value;
      if (next) this.#activePdfWindow = next;
    }

    let failure: CleanupFailure | undefined;
    for (const [pdfWindow, handlers] of this.#handlers) {
      const target = wanted.get(pdfWindow);
      if (target && target.view === handlers.view && target.document === handlers.document)
        continue;
      this.#handlers.delete(pdfWindow);
      failure ??= new CleanupFailure();
      failure.run(() => this.#detach(pdfWindow, handlers));
    }
    failure?.rethrow();

    for (const [pdfWindow, target] of wanted) {
      if (this.#handlers.has(pdfWindow)) continue;
      const current = this.#reader._internalReader;
      if (
        this.#disposed ||
        isDeadObject(pdfWindow) ||
        isDeadObject(target.view) ||
        (current?._primaryView !== target.view && current?._secondaryView !== target.view) ||
        target.view._iframeWindow !== pdfWindow ||
        pdfWindow.document !== target.document
      )
        continue;
      this.#attach(pdfWindow, target.view, target.document);
    }

    if (!this.#disposed) this.#dependencies.syncHostBridge();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#syncTimer !== null) clearInterval(this.#syncTimer);
    this.#syncTimer = null;
    const failure = new CleanupFailure();
    const handlers = [...this.#handlers];
    this.#handlers.clear();
    for (const [pdfWindow, viewHandlers] of handlers)
      failure.run(() => this.#detach(pdfWindow, viewHandlers));
    failure.rethrow();
  }

  #attach(pdfWindow: PdfWindow, view: NativeReaderViewRuntime, document: Document): void {
    const keyDown = ((event: Event) => {
      // A failed detach must not admit this registration after window reuse.
      if (!this.#handlerCurrent(pdfWindow, handlers)) return;
      const keyEvent = asKeyboardEvent(event);
      if (keyEvent) this.#dependencies.onKeyDown(keyEvent, pdfWindow);
    }) as EventListener;
    const keyUp = ((event: Event) => {
      if (!this.#handlerCurrent(pdfWindow, handlers)) return;
      const keyEvent = asKeyboardEvent(event);
      if (keyEvent) this.#dependencies.onKeyUp(keyEvent);
    }) as EventListener;
    const pointerDown = (() => {
      if (!this.#handlerCurrent(pdfWindow, handlers)) return;
      this.#dependencies.onPointerDown(pdfWindow);
    }) as EventListener;
    const blur = ((event: Event) => {
      if (!this.#handlerCurrent(pdfWindow, handlers)) return;
      this.#dependencies.onBlur(pdfWindow, event as FocusEvent);
    }) as EventListener;
    const selection = (() => {
      if (!this.#handlerCurrent(pdfWindow, handlers)) return;
      this.#dependencies.onSelectionChange(pdfWindow);
    }) as EventListener;
    const scroll = (() => {
      if (!this.#handlerCurrent(pdfWindow, handlers)) return;
      this.#dependencies.onScroll(pdfWindow);
    }) as EventListener;
    const resize = (() => {
      if (!this.#handlerCurrent(pdfWindow, handlers)) return;
      this.#dependencies.onResize(pdfWindow);
    }) as EventListener;
    const scrollElement =
      document.getElementById('viewerContainer') ?? document.querySelector('.pdfViewer');
    const handlers: ViewHandlers = {
      view,
      document,
      cleanups: [],
      ready: false,
      retired: false,
    };

    this.#handlers.set(pdfWindow, handlers);
    const acquire = (add: () => void, remove: () => void): boolean => {
      handlers.cleanups.push(remove);
      try {
        add();
      } catch (error) {
        if (this.#handlers.get(pdfWindow) !== handlers) {
          const failure = new CleanupFailure();
          failure.run(() => {
            throw error;
          });
          failure.run(remove);
          failure.rethrow();
        }
        throw error;
      }
      if (this.#handlerCurrent(pdfWindow, handlers, true)) return true;
      if (this.#handlers.get(pdfWindow) === handlers) {
        this.#handlers.delete(pdfWindow);
        this.#detach(pdfWindow, handlers);
      } else remove();
      return false;
    };
    const windowListener = (
      type: string,
      listener: EventListener,
      options?: boolean | AddEventListenerOptions,
    ): boolean =>
      acquire(
        () => pdfWindow.addEventListener(type, listener, options),
        () => {
          if (!isDeadObject(pdfWindow)) pdfWindow.removeEventListener(type, listener, options);
        },
      );
    try {
      if (!windowListener('keydown', keyDown, true)) return;
      if (!windowListener('keyup', keyUp, true)) return;
      if (!windowListener('pointerdown', pointerDown, true)) return;
      if (!windowListener('blur', blur, true)) return;
      if (
        !acquire(
          () => document.addEventListener('selectionchange', selection),
          () => {
            if (!isDeadObject(document)) document.removeEventListener('selectionchange', selection);
          },
        )
      )
        return;
      if (!windowListener('resize', resize, { passive: true })) return;
      if (
        scrollElement &&
        !acquire(
          () => scrollElement.addEventListener('scroll', scroll, { passive: true }),
          () => {
            if (!isDeadObject(scrollElement)) scrollElement.removeEventListener('scroll', scroll);
          },
        )
      )
        return;
      handlers.ready = true;
    } catch (error) {
      const failure = new CleanupFailure();
      failure.run(() => {
        throw error;
      });
      if (this.#handlers.get(pdfWindow) === handlers) {
        this.#handlers.delete(pdfWindow);
        failure.run(() => this.#detach(pdfWindow, handlers));
      }
      failure.rethrow();
    }
  }

  #handlerCurrent(pdfWindow: PdfWindow, handlers: ViewHandlers, pending = false): boolean {
    if (
      this.#disposed ||
      (!pending && !handlers.ready) ||
      this.#handlers.get(pdfWindow) !== handlers ||
      isDeadObject(pdfWindow) ||
      isDeadObject(handlers.view) ||
      isDeadObject(handlers.document)
    )
      return false;
    const internal = this.#reader._internalReader;
    return (
      (internal?._primaryView === handlers.view || internal?._secondaryView === handlers.view) &&
      handlers.view._iframeWindow === pdfWindow &&
      pdfWindow.document === handlers.document
    );
  }

  #detach(pdfWindow: PdfWindow, handlers: ViewHandlers): void {
    if (handlers.retired) return;
    handlers.retired = true;
    handlers.ready = false;
    const cleanups = handlers.cleanups.splice(0);
    const failure = new CleanupFailure();
    for (const cleanup of cleanups) failure.run(cleanup);
    failure.run(() => this.#dependencies.releaseView(pdfWindow));
    failure.rethrow();
  }
}
