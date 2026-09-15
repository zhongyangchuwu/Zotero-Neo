import { asElement } from '../platform/dom';
import { THEME_VARS } from '../ui/theme';
import type { AnnotationRuntime, PdfWindow, ReaderRuntime, ReaderTimer } from './types';

export interface AnnotationCommentTarget {
  readonly key: string;
  readonly itemID: number | null;
  readonly libraryID: number | null;
}

export interface ReaderCommentEditorHost {
  readonly reader: ReaderRuntime;
  readonly schedule: (delay: number, task: () => void) => ReaderTimer;
  readonly clearTimer: (timer: ReaderTimer | null) => void;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly activePdfWindow: () => PdfWindow | null;
  readonly resolveAnnotation: (key: string) => Promise<AnnotationRuntime | null>;
  readonly annotationForSave: (
    target: AnnotationCommentTarget,
  ) => Promise<AnnotationRuntime | null>;
  readonly nativeEditableFocused: () => boolean;
  readonly onNativeEditorFocus: () => void;
  readonly locale: () => string;
}

function excerptText(value: string): string {
  return value.normalize('NFKC').replace(/\n/g, ' ').replace(/ {2,}/g, ' ').trim();
}

/**
 * Owns the transient PDF annotation-comment editor lifecycle.
 *
 * ReaderSession still owns Insert mode and the selected annotation identity. This object owns
 * the textarea DOM, target snapshot, autosave/focus timers, IME state, popup suppression, and
 * Zotero's private comment-deletion flag while the Neo editor is active.
 */
export class ReaderCommentEditor {
  readonly #host: ReaderCommentEditorHost;
  #generation = 0;
  #overlay: HTMLElement | null = null;
  #input: HTMLTextAreaElement | null = null;
  #themeCleanup: (() => void) | null = null;
  #target: AnnotationCommentTarget | null = null;
  #autosaveTimer: ReaderTimer | null = null;
  #focusTimer: ReaderTimer | null = null;
  #watchdogTimer: ReaderTimer | null = null;
  #composing = false;
  #previousDeleteFromComment: boolean | undefined;
  #popupGuard: MutationObserver | null = null;

  constructor(host: ReaderCommentEditorHost) {
    this.#host = host;
  }

  get hasInput(): boolean {
    return this.#input !== null;
  }

  ownsView(pdfWindow: PdfWindow): boolean {
    return this.#overlay?.ownerDocument.defaultView === pdfWindow;
  }

  ownsTarget(target: EventTarget | null): boolean {
    return target === this.#input;
  }

  isInputFocused(pdfWindow: Window | undefined): boolean {
    return (
      !!this.#input?.isConnected &&
      !!pdfWindow &&
      pdfWindow.document.activeElement === this.#input
    );
  }

  /** Invalidates queued focus work without changing the mounted editor. */
  invalidate(): void {
    this.#generation += 1;
    this.#clearFocusTimers();
  }

  async open(key: string): Promise<void> {
    const generation = ++this.#generation;
    this.#clearFocusTimers();
    const annotation = await this.#host.resolveAnnotation(key);
    if (generation !== this.#generation) return;

    const pdfWindow = this.#host.activePdfWindow();
    if (!pdfWindow) return;
    const target: AnnotationCommentTarget = {
      key,
      itemID: annotation?.id ?? null,
      libraryID: annotation?.libraryID ?? null,
    };

    this.#host.reader._internalReader?.navigate?.({ annotationID: key });
    const internal = this.#host.reader._internalReader;
    this.#previousDeleteFromComment = internal?._enableAnnotationDeletionFromComment;
    if (internal) internal._enableAnnotationDeletionFromComment = false;

    this.#mount(
      pdfWindow,
      target,
      annotation?.annotationComment ?? '',
      annotation?.annotationText ?? '',
    );
    this.#armPopupGuard();
    this.#focusTimer = this.#host.schedule(60, () => {
      this.#focusTimer = null;
      if (generation !== this.#generation || !this.#input?.isConnected) return;
      this.#input.focus();
      const length = this.#input.value.length;
      this.#input.selectionStart = length;
      this.#input.selectionEnd = length;
      this.#keepFocus(generation);
    });
  }

  /** Saves, closes, then restores Zotero's annotation-comment deletion flag. */
  async exit(): Promise<boolean> {
    const saved = await this.#saveAndClose();
    this.#restoreAnnotationDeletionFlag();
    return saved;
  }

  /** Restores native Zotero behavior before yielding focus and saving the Neo editor. */
  async handOver(): Promise<void> {
    this.#restoreAnnotationDeletionFlag();
    await this.#saveAndClose();
  }

  releaseView(pdfWindow: PdfWindow): void {
    if (!this.ownsView(pdfWindow)) return;
    this.invalidate();
    this.#closeOverlay();
    this.#restoreAnnotationDeletionFlag();
  }

  dispose(): void {
    this.invalidate();
    this.#closeOverlay();
    this.#restoreAnnotationDeletionFlag();
  }

  #mount(
    pdfWindow: PdfWindow,
    target: AnnotationCommentTarget,
    comment: string,
    quote: string,
  ): void {
    this.#closeOverlay();
    this.#target = target;
    const document = pdfWindow.document;
    const overlay = document.createElement('div');
    overlay.id = 'zv-annotation-comment';
    overlay.style.cssText = `position:fixed;left:50%;bottom:14px;transform:translateX(-50%);width:min(560px,92%);z-index:99998;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 8px 32px ${THEME_VARS.shadow};display:flex;flex-direction:column;font:13px/1.4 sans-serif`;
    if (quote) {
      const excerpt = document.createElement('div');
      excerpt.style.cssText = `padding:8px 12px;color:${THEME_VARS.muted};font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:${THEME_VARS.elevated}`;
      excerpt.textContent = excerptText(quote).slice(0, 200);
      overlay.appendChild(excerpt);
    }
    const input = document.createElement('textarea');
    input.id = 'zv-annotation-comment-input';
    input.value = comment;
    input.spellcheck = false;
    input.style.cssText = `width:100%;box-sizing:border-box;min-height:72px;max-height:220px;padding:10px 12px;background:${THEME_VARS.input};color:${THEME_VARS.text};border:0;outline:2px solid ${THEME_VARS.focusRing};outline-offset:-2px;resize:none;font:13px/1.5 sans-serif`;
    input.addEventListener('compositionstart', () => {
      this.#composing = true;
    });
    input.addEventListener('compositionend', () => {
      this.#composing = false;
    });
    input.addEventListener('input', () => this.#scheduleAutosave());
    const hint = document.createElement('div');
    hint.style.cssText = `padding:5px 12px;border-top:1px solid ${THEME_VARS.border};color:${THEME_VARS.muted};font-size:11px`;
    hint.textContent = /^zh/i.test(this.#host.locale())
      ? 'Enter 换行 · Esc 保存并关闭'
      : 'Enter newline · Esc save & close';
    overlay.append(input, hint);
    document.body?.appendChild(overlay);
    this.#themeCleanup = this.#host.themeRoot(overlay);
    this.#overlay = overlay;
    this.#input = input;
  }

  async #saveAndClose(): Promise<boolean> {
    const text = this.#input?.value ?? null;
    const target = this.#target;
    this.invalidate();
    this.#closeOverlay();
    if (text === null || !target) return true;
    const annotation = await this.#host.annotationForSave(target);
    if (!annotation || annotation.deleted) return false;
    if ((annotation.annotationComment ?? '') !== text) {
      annotation.annotationComment = text;
      await annotation.saveTx();
    }
    return true;
  }

  #closeOverlay(): void {
    this.#themeCleanup?.();
    this.#themeCleanup = null;
    this.#overlay?.remove();
    this.#overlay = null;
    this.#input = null;
    this.#target = null;
    this.#composing = false;
    this.#host.clearTimer(this.#autosaveTimer);
    this.#autosaveTimer = null;
    this.#popupGuard?.disconnect();
    this.#popupGuard = null;
  }

  #scheduleAutosave(): void {
    this.#host.clearTimer(this.#autosaveTimer);
    this.#autosaveTimer = this.#host.schedule(2000, () => {
      this.#autosaveTimer = null;
      const target = this.#target;
      const text = this.#input?.value;
      if (!target || text === undefined) return;
      void this.#host.annotationForSave(target).then(async (annotation) => {
        if (!annotation || annotation.deleted || annotation.annotationComment === text) return;
        annotation.annotationComment = text;
        await annotation.saveTx();
      });
    });
  }

  #armPopupGuard(): void {
    const outerWindow = this.#host.reader._iframeWindow;
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
    this.#popupGuard = guard;
  }

  #keepFocus(generation: number): void {
    if (generation !== this.#generation) return;
    if (this.#host.nativeEditableFocused()) {
      this.#host.onNativeEditorFocus();
      return;
    }
    const input = this.#input;
    if (input?.isConnected && !this.#composing && input.ownerDocument.activeElement !== input)
      input.focus();
    this.#watchdogTimer = this.#host.schedule(500, () => {
      this.#watchdogTimer = null;
      this.#keepFocus(generation);
    });
  }

  #clearFocusTimers(): void {
    this.#host.clearTimer(this.#focusTimer);
    this.#focusTimer = null;
    this.#host.clearTimer(this.#watchdogTimer);
    this.#watchdogTimer = null;
  }

  #restoreAnnotationDeletionFlag(): void {
    const internal = this.#host.reader._internalReader;
    if (internal && this.#previousDeleteFromComment !== undefined)
      internal._enableAnnotationDeletionFromComment = this.#previousDeleteFromComment;
    this.#previousDeleteFromComment = undefined;
  }
}
