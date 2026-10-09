import { isDeadObject } from '../platform/cross-compartment';
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
  #focusRevision = 0;
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

  /** Retires even an already queued restore when Reader focus or sidebar ownership changes. */
  cancelFocusRestore(): void {
    this.#focusRevision += 1;
    this.#host.clearTimer(this.#focusTimer);
    this.#focusTimer = null;
  }

  activate(kind: SidebarKind, pdfWindow: PdfWindow, closeOther: () => void): boolean {
    this.cancelFocusRestore();
    if (this.#active === kind) return false;
    if (this.#active) closeOther();
    this.#active = kind;
    this.#pdfWindow = pdfWindow;
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
    this.cancelFocusRestore();
    this.#suppressFocusRestore = true;
    try {
      closeView();
    } finally {
      this.#suppressFocusRestore = false;
      this.#active = null;
      this.#pdfWindow = null;
      this.#themeCleanup?.();
      this.#themeCleanup = null;
      this.cancelFocusRestore();
    }
  }

  dispose(closeAll: () => void): void {
    closeAll();
    this.#active = null;
    this.#pdfWindow = null;
    this.#themeCleanup?.();
    this.#themeCleanup = null;
    this.cancelFocusRestore();
  }
  #restoreFocus(pdfWindow?: PdfWindow): void {
    const target = pdfWindow ?? this.#pdfWindow;
    if (!target || isDeadObject(target)) return;
    this.cancelFocusRestore();
    const revision = this.#focusRevision;
    this.#focusTimer = this.#host.schedule(30, () => {
      if (this.#focusRevision !== revision) return;
      this.#focusTimer = null;
      if (!isDeadObject(target)) target.focus();
    });
  }
}
