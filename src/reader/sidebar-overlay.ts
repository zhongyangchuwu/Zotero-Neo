import type { PdfWindow, ReaderTimer } from './types';

type SidebarKind = 'outline' | 'marks';
export interface SidebarOverlayHost {
  readonly schedule: (delay: number, task: () => void) => ReaderTimer;
  readonly clearTimer: (timer: ReaderTimer | null) => void;
  readonly themeRoot: (root: HTMLElement) => () => void;
}

/** Coordinates the two reader sidebars without owning either sidebar's domain behavior. */
export class ReaderSidebarOverlay {
  #active: SidebarKind | null = null;
  #pdfWindow: PdfWindow | null = null;
  #focusTimer: ReaderTimer | null = null;
  #themeCleanup: (() => void) | null = null;
  #suppressFocusRestore = false;
  readonly #host: SidebarOverlayHost;

  constructor(host: SidebarOverlayHost) {
    this.#host = host;
  }

  themeRoot(root: HTMLElement): () => void {
    this.#themeCleanup?.();
    const ownedCleanup = this.#host.themeRoot(root);
    const cleanup = () => {
      ownedCleanup();
      if (this.#themeCleanup === cleanup) this.#themeCleanup = null;
    };
    this.#themeCleanup = cleanup;
    return cleanup;
  }
  activate(kind: SidebarKind, pdfWindow: PdfWindow, closeOther: () => void): boolean {
    if (this.#active === kind) return false;
    if (this.#active) closeOther();
    this.#active = kind;
    this.#pdfWindow = pdfWindow;
    this.#host.clearTimer(this.#focusTimer);
    this.#focusTimer = null;
    return true;
  }

  closed(kind: SidebarKind, pdfWindow?: PdfWindow): void {
    if (this.#active !== kind) return;
    this.#active = null;
    this.#pdfWindow = null;
    this.#themeCleanup?.();
    this.#themeCleanup = null;
    if (!this.#suppressFocusRestore) this.#restoreFocus(pdfWindow);
  }

  releaseView(pdfWindow: PdfWindow, closeView: () => void): void {
    if (this.#pdfWindow !== pdfWindow) return;
    this.#host.clearTimer(this.#focusTimer);
    this.#focusTimer = null;
    this.#suppressFocusRestore = true;
    try {
      closeView();
    } finally {
      this.#suppressFocusRestore = false;
      this.#active = null;
      this.#pdfWindow = null;
      this.#themeCleanup?.();
      this.#themeCleanup = null;
      this.#host.clearTimer(this.#focusTimer);
      this.#focusTimer = null;
    }
  }

  dispose(closeAll: () => void): void {
    closeAll();
    this.#active = null;
    this.#pdfWindow = null;
    this.#themeCleanup?.();
    this.#themeCleanup = null;
    this.#host.clearTimer(this.#focusTimer);
    this.#focusTimer = null;
  }
  #restoreFocus(pdfWindow?: PdfWindow): void {
    const target = pdfWindow ?? this.#pdfWindow;
    if (!target) return;
    this.#host.clearTimer(this.#focusTimer);
    this.#focusTimer = this.#host.schedule(30, () => {
      this.#focusTimer = null;
      target.focus();
    });
  }
}
