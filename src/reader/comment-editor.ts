import { compositionOwnsKey } from '../input/composition';
import { keyString } from '../input/keys';
import {
  cloneInto,
  nativeObjectIdentity,
  privilegedEventTarget,
} from '../platform/cross-compartment';
import { asElement } from '../platform/dom';
import { THEME_VARS } from '../ui/theme';
import type {
  AnnotationRuntime,
  InternalReaderRuntime,
  PdfWindow,
  ReaderRuntime,
  ReaderTimer,
} from './types';

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
  readonly onInputOwnerChanged: () => void;
  readonly onExit: (saved: boolean, pdfWindow: PdfWindow) => void;
  readonly debug: (message: string) => void;
  readonly locale: () => string;
}

function excerptText(value: string): string {
  return value.normalize('NFKC').replace(/\n/g, ' ').replace(/ {2,}/g, ' ').trim();
}

/** Owns pending and mounted annotation-comment input independently of Reader Surface mode. */
export class ReaderCommentEditor {
  readonly #host: ReaderCommentEditorHost;
  #generation = 0;
  #disposed = false;
  #ownerWindow: PdfWindow | null = null;
  #overlay: HTMLElement | null = null;
  #input: HTMLTextAreaElement | null = null;
  #inputCleanup: (() => void) | null = null;
  #themeCleanup: (() => void) | null = null;
  #target: AnnotationCommentTarget | null = null;
  #autosaveTimer: ReaderTimer | null = null;
  #focusTimer: ReaderTimer | null = null;
  #watchdogTimer: ReaderTimer | null = null;
  #composing = false;
  #deletionOverride: {
    readonly internal: InternalReaderRuntime;
    readonly previous: boolean | undefined;
  } | null = null;
  #popupGuard: MutationObserver | null = null;
  #systemKeyOptions: (AddEventListenerOptions & { mozSystemGroup: boolean }) | null = null;
  readonly #handledEscapes = new WeakSet<KeyboardEvent>();
  readonly #systemKeyListener = (event: KeyboardEvent): void => {
    const pdfWindow = this.#ownerWindow;
    if (
      pdfWindow &&
      keyString(event) === 'escape' &&
      (!this.#input || this.ownsTarget(event.target))
    )
      this.handleKey(event, pdfWindow);
  };
  constructor(host: ReaderCommentEditorHost) {
    this.#host = host;
  }

  get ownsInput(): boolean {
    return this.#ownerWindow !== null;
  }

  get hasInput(): boolean {
    return this.#input !== null;
  }

  ownsView(pdfWindow: PdfWindow): boolean {
    return this.#ownerWindow === pdfWindow;
  }

  /** Privileged system dispatch exposes Xrays rather than the textarea's waived wrapper. */
  ownsTarget(target: EventTarget | null): boolean {
    return (
      this.#input !== null &&
      (target === this.#input ||
        (target !== null && nativeObjectIdentity(target) === nativeObjectIdentity(this.#input)))
    );
  }

  isInputFocused(pdfWindow: Window | undefined): boolean {
    return (
      !!this.#input?.isConnected && !!pdfWindow && pdfWindow.document.activeElement === this.#input
    );
  }

  /** Leaves native editing defaults intact while excluding Reader/host shortcut handling. */
  handleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
    if (!this.ownsView(pdfWindow)) return false;
    if (this.#handledEscapes.has(event)) return true;
    if (compositionOwnsKey(event, this.#composing)) {
      if (this.ownsTarget(event.target)) event.stopImmediatePropagation();
      return true;
    }
    if (keyString(event) === 'escape') {
      this.#handledEscapes.add(event);
      event.preventDefault();
      event.stopImmediatePropagation();
      const generation = this.#generation + 1;
      const saving = this.exit();
      void saving
        .catch((error: unknown) => {
          this.#host.debug(`Annotation comment save failed: ${String(error)}`);
          return false;
        })
        .then((saved) => {
          if (!this.#disposed && generation === this.#generation)
            this.#host.onExit(saved, pdfWindow);
        });
      return true;
    }
    if (this.ownsTarget(event.target)) event.stopImmediatePropagation();
    return true;
  }

  consumesKey(key: string, pdfWindow: PdfWindow): boolean {
    return (
      this.ownsView(pdfWindow) &&
      !this.#composing &&
      (key === 'escape' ||
        (this.hasInput && (key.length === 1 || ['backspace', 'delete', 'enter'].includes(key))))
    );
  }

  async open(key: string): Promise<void> {
    if (this.#disposed) return;
    const pdfWindow = this.#host.activePdfWindow();
    this.#release();
    if (!pdfWindow) return;
    this.#ownerWindow = pdfWindow;
    const generation = this.#generation;
    try {
      // Zotero's earlier normal-group handler can swallow real textarea Esc. Restore the
      // native target's Xray wrapper so Gecko honors the privileged system-group option.
      this.#systemKeyOptions = cloneInto({ capture: true, mozSystemGroup: true }, pdfWindow);
      privilegedEventTarget(pdfWindow).addEventListener(
        'keydown',
        this.#systemKeyListener,
        this.#systemKeyOptions,
      );
      this.#host.onInputOwnerChanged();
      const annotation = await this.#host.resolveAnnotation(key);
      if (!this.#isCurrent(generation, pdfWindow)) return;
      const target: AnnotationCommentTarget = {
        key,
        itemID: annotation?.id ?? null,
        libraryID: annotation?.libraryID ?? null,
      };
      const internal = this.#host.reader._internalReader;
      const readerWindow = this.#host.reader._iframeWindow ?? pdfWindow;
      const navigation = internal?.navigate?.(cloneInto({ annotationID: key }, readerWindow));
      if (navigation)
        void navigation.catch((error: unknown) => {
          this.#host.debug(`Annotation comment navigation failed: ${String(error)}`);
        });
      if (!this.#isCurrent(generation, pdfWindow)) return;
      if (internal) {
        this.#deletionOverride = {
          internal,
          previous: internal._enableAnnotationDeletionFromComment,
        };
        internal._enableAnnotationDeletionFromComment = false;
      }
      this.#mount(
        pdfWindow,
        target,
        annotation?.annotationComment ?? '',
        annotation?.annotationText ?? '',
      );
      this.#armPopupGuard(generation, pdfWindow);
      this.#focusTimer = this.#host.schedule(60, () => {
        if (!this.#isCurrent(generation, pdfWindow)) return;
        this.#focusTimer = null;
        if (!this.#input?.isConnected) return;
        if (this.#host.nativeEditableFocused()) {
          this.#host.onNativeEditorFocus();
          return;
        }
        this.#input.focus();
        const length = this.#input.value.length;
        this.#input.selectionStart = length;
        this.#input.selectionEnd = length;
        this.#keepFocus(generation, pdfWindow);
      });
    } catch (error: unknown) {
      if (this.#isCurrent(generation, pdfWindow)) this.#release();
      this.#host.debug(`Annotation comment open failed: ${String(error)}`);
    }
  }

  /** Captures the final draft, then releases every ownership resource before awaiting persistence. */
  async exit(): Promise<boolean> {
    const text = this.#input?.value ?? null;
    const target = this.#target;
    this.#release();
    if (text === null || !target) return true;
    const annotation = await this.#host.annotationForSave(target);
    if (!annotation || annotation.deleted) return false;
    if ((annotation.annotationComment ?? '') !== text) {
      annotation.annotationComment = text;
      await annotation.saveTx();
    }
    return true;
  }

  /** Restores native behavior synchronously before saving the draft and yielding focus. */
  async handOver(): Promise<void> {
    await this.exit();
  }

  releaseView(pdfWindow: PdfWindow): void {
    if (this.ownsView(pdfWindow)) this.#release();
  }

  dispose(): void {
    this.#disposed = true;
    this.#release();
  }

  #isCurrent(generation: number, pdfWindow: PdfWindow): boolean {
    return !this.#disposed && generation === this.#generation && this.ownsView(pdfWindow);
  }

  #mount(
    pdfWindow: PdfWindow,
    target: AnnotationCommentTarget,
    comment: string,
    quote: string,
  ): void {
    const generation = this.#generation;
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
    const compositionStart = (): void => {
      if (this.#isCurrent(generation, pdfWindow)) this.#composing = true;
    };
    const compositionEnd = (): void => {
      if (this.#isCurrent(generation, pdfWindow)) this.#composing = false;
    };
    const changed = (): void => {
      if (this.#isCurrent(generation, pdfWindow)) this.#scheduleAutosave(generation, pdfWindow);
    };
    input.addEventListener('compositionstart', compositionStart);
    input.addEventListener('compositionend', compositionEnd);
    input.addEventListener('input', changed);
    this.#inputCleanup = () => {
      input.removeEventListener('compositionstart', compositionStart);
      input.removeEventListener('compositionend', compositionEnd);
      input.removeEventListener('input', changed);
    };
    const hint = document.createElement('div');
    hint.style.cssText = `padding:5px 12px;border-top:1px solid ${THEME_VARS.border};color:${THEME_VARS.muted};font-size:11px`;
    hint.textContent = /^zh/i.test(this.#host.locale())
      ? 'Enter 换行 · Esc 保存并关闭'
      : 'Enter newline · Esc save & close';
    overlay.append(input, hint);
    this.#overlay = overlay;
    this.#input = input;
    document.body?.appendChild(overlay);
    this.#themeCleanup = this.#host.themeRoot(overlay);
  }

  #release(): void {
    this.#generation += 1;
    const pdfWindow = this.#ownerWindow;
    if (pdfWindow && this.#systemKeyOptions)
      privilegedEventTarget(pdfWindow).removeEventListener(
        'keydown',
        this.#systemKeyListener,
        this.#systemKeyOptions,
      );
    this.#systemKeyOptions = null;
    this.#clearFocusTimers();
    this.#host.clearTimer(this.#autosaveTimer);
    this.#autosaveTimer = null;
    this.#popupGuard?.disconnect();
    this.#popupGuard = null;
    this.#inputCleanup?.();
    this.#inputCleanup = null;
    this.#themeCleanup?.();
    this.#themeCleanup = null;
    this.#overlay?.remove();
    this.#overlay = null;
    this.#input = null;
    this.#target = null;
    this.#composing = false;
    const override = this.#deletionOverride;
    this.#deletionOverride = null;
    if (override) override.internal._enableAnnotationDeletionFromComment = override.previous;
    this.#ownerWindow = null;
    if (pdfWindow) this.#host.onInputOwnerChanged();
  }

  #scheduleAutosave(generation: number, pdfWindow: PdfWindow): void {
    this.#host.clearTimer(this.#autosaveTimer);
    this.#autosaveTimer = this.#host.schedule(2000, () => {
      if (!this.#isCurrent(generation, pdfWindow)) return;
      this.#autosaveTimer = null;
      const target = this.#target;
      const input = this.#input;
      if (!target || !input) return;
      const text = input.value;
      void this.#host
        .annotationForSave(target)
        .then(async (annotation) => {
          if (
            !this.#isCurrent(generation, pdfWindow) ||
            this.#target !== target ||
            this.#input !== input ||
            input.value !== text ||
            !annotation ||
            annotation.deleted ||
            (annotation.annotationComment ?? '') === text
          )
            return;
          annotation.annotationComment = text;
          await annotation.saveTx();
        })
        .catch((error: unknown) => {
          this.#host.debug(`Annotation comment autosave failed: ${String(error)}`);
        });
    });
  }

  #armPopupGuard(generation: number, pdfWindow: PdfWindow): void {
    const outerWindow = this.#host.reader._iframeWindow;
    const root = outerWindow?.document.body;
    if (!outerWindow || !root || typeof outerWindow.MutationObserver !== 'function') return;
    const guard = new outerWindow.MutationObserver((mutations: MutationRecord[]) => {
      if (!this.#isCurrent(generation, pdfWindow)) return;
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
            new outerWindow.KeyboardEvent(
              'keydown',
              cloneInto(
                {
                  key: 'Escape',
                  code: 'Escape',
                  bubbles: true,
                  cancelable: true,
                },
                outerWindow,
              ),
            ),
          );
        }
      }
    });
    guard.observe(root, cloneInto({ childList: true, subtree: true }, outerWindow));
    this.#popupGuard = guard;
  }

  #keepFocus(generation: number, pdfWindow: PdfWindow): void {
    if (!this.#isCurrent(generation, pdfWindow)) return;
    if (this.#host.nativeEditableFocused()) {
      this.#host.onNativeEditorFocus();
      return;
    }
    const input = this.#input;
    if (input?.isConnected && !this.#composing && input.ownerDocument.activeElement !== input)
      input.focus();
    if (!this.#isCurrent(generation, pdfWindow)) return;
    this.#watchdogTimer = this.#host.schedule(500, () => {
      if (!this.#isCurrent(generation, pdfWindow)) return;
      this.#watchdogTimer = null;
      this.#keepFocus(generation, pdfWindow);
    });
  }

  #clearFocusTimers(): void {
    this.#host.clearTimer(this.#focusTimer);
    this.#focusTimer = null;
    this.#host.clearTimer(this.#watchdogTimer);
    this.#watchdogTimer = null;
  }
}
