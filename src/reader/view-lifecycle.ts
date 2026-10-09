import { isDeadObject } from '../platform/cross-compartment';
import { asKeyboardEvent } from '../platform/dom';
import type { PdfWindow, ReaderRuntime } from './types';

interface ViewHandlers {
  readonly keyDown: EventListener;
  readonly keyUp: EventListener;
  readonly blur: EventListener;
  readonly selection: EventListener;
  readonly resize: EventListener;
  readonly scroll: EventListener;
  readonly scrollElement: Element | null;
}

export interface ReaderViewLifecycleDependencies {
  readonly reader: ReaderRuntime;
  readonly timerWindow: PdfWindow;
  readonly onKeyDown: (event: KeyboardEvent, pdfWindow: PdfWindow) => void;
  readonly onKeyUp: (event: KeyboardEvent) => void;
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
  readonly #handlers = new Map<PdfWindow, ViewHandlers>();
  #activePdfWindow: PdfWindow;
  #syncTimer: number | null = null;
  #disposed = false;

  constructor(dependencies: ReaderViewLifecycleDependencies) {
    this.#dependencies = dependencies;
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
    this.#syncTimer = this.#dependencies.timerWindow.setInterval(() => this.sync(), 250);
  }

  sync(): void {
    if (this.#disposed) return;
    const internal = this.#dependencies.reader._internalReader;
    const wanted = [
      asPdfWindow(internal?._primaryView?._iframeWindow),
      asPdfWindow(internal?._secondaryView?._iframeWindow),
    ].filter((value): value is PdfWindow => value !== null);

    if (!wanted.includes(this.#activePdfWindow)) {
      const next = wanted[0];
      if (next) this.#activePdfWindow = next;
    }

    for (const [pdfWindow, handlers] of this.#handlers) {
      if (wanted.includes(pdfWindow)) continue;
      this.#detach(pdfWindow, handlers);
      this.#handlers.delete(pdfWindow);
    }

    for (const pdfWindow of wanted) {
      if (this.#handlers.has(pdfWindow)) continue;
      this.#attach(pdfWindow);
    }

    this.#dependencies.syncHostBridge();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#syncTimer !== null) clearInterval(this.#syncTimer);
    this.#syncTimer = null;
    for (const [pdfWindow, handlers] of this.#handlers) this.#detach(pdfWindow, handlers);
    this.#handlers.clear();
  }

  #attach(pdfWindow: PdfWindow): void {
    const keyDown = ((event: Event) => {
      const keyEvent = asKeyboardEvent(event);
      if (keyEvent) this.#dependencies.onKeyDown(keyEvent, pdfWindow);
    }) as EventListener;
    const keyUp = ((event: Event) => {
      const keyEvent = asKeyboardEvent(event);
      if (keyEvent) this.#dependencies.onKeyUp(keyEvent);
    }) as EventListener;
    const blur = ((event: Event) =>
      this.#dependencies.onBlur(pdfWindow, event as FocusEvent)) as EventListener;
    const selection = (() => this.#dependencies.onSelectionChange(pdfWindow)) as EventListener;
    const scroll = (() => this.#dependencies.onScroll(pdfWindow)) as EventListener;
    const resize = (() => this.#dependencies.onResize(pdfWindow)) as EventListener;
    const scrollElement =
      pdfWindow.document.getElementById('viewerContainer') ??
      pdfWindow.document.querySelector('.pdfViewer');

    pdfWindow.addEventListener('keydown', keyDown, true);
    pdfWindow.addEventListener('keyup', keyUp, true);
    pdfWindow.addEventListener('blur', blur, true);
    pdfWindow.document.addEventListener('selectionchange', selection);
    pdfWindow.addEventListener('resize', resize, { passive: true });
    scrollElement?.addEventListener('scroll', scroll, { passive: true });

    this.#handlers.set(pdfWindow, {
      keyDown,
      keyUp,
      blur,
      selection,
      resize,
      scroll,
      scrollElement,
    });
  }

  #detach(pdfWindow: PdfWindow, handlers: ViewHandlers): void {
    // Zotero may destroy an iframe before the next discovery tick or add-on shutdown.
    if (!isDeadObject(pdfWindow)) {
      pdfWindow.removeEventListener('keydown', handlers.keyDown, true);
      pdfWindow.removeEventListener('keyup', handlers.keyUp, true);
      pdfWindow.removeEventListener('blur', handlers.blur, true);
      pdfWindow.document.removeEventListener('selectionchange', handlers.selection);
      pdfWindow.removeEventListener('resize', handlers.resize);
    }
    const scrollElement = handlers.scrollElement;
    if (scrollElement && !isDeadObject(scrollElement))
      scrollElement.removeEventListener('scroll', handlers.scroll);
    this.#dependencies.releaseView(pdfWindow);
  }
}
