import { CleanupFailure } from '../../core/cleanup';
import { reportDiagnosticError, type Logger } from '../../core/logging';
import { isDeadObject } from '../../platform/cross-compartment';
import { readerCopyTargets, type ReaderCopyTarget } from './copy-targets';
import { ReaderTargetHints } from './target-hints';
import type { PdfWindow, ReaderRuntime, ReaderViewRuntime } from '../../reader/types';

interface CopyHintsHost extends Logger {
  readonly reader: ReaderRuntime;
  readonly viewForWindow: (window: PdfWindow) => ReaderViewRuntime | null;
  readonly copyText: (text: string) => void;
  readonly text: (key: string) => string;
  readonly showStatus: (message: string, duration?: number) => void;
  isCurrent(): boolean;
}

/** Copy admission belongs to the exact Reader view, independently of link-follow history. */
export class ReaderCopyHints {
  readonly #host: CopyHintsHost;
  readonly #hints: ReaderTargetHints<ReaderCopyTarget>;
  #window: PdfWindow | null = null;
  #view: ReaderViewRuntime | null = null;

  constructor(host: CopyHintsHost) {
    this.#host = host;
    this.#hints = new ReaderTargetHints({
      attribute: 'zoteroNeoCopyHint',
      isCurrent: (window) => this.#isCurrent(window),
      choose: (window, target) => {
        const view = this.#view;
        if (!view || !this.#isCurrent(window)) return;
        this.close();
        if (
          !this.#host.isCurrent() ||
          isDeadObject(window) ||
          isDeadObject(view) ||
          this.#host.viewForWindow(window) !== view
        )
          return;
        this.#host.copyText(target.text);
      },
      closed: (reason) => {
        if (reason !== 'confirmed') {
          this.#window = null;
          this.#view = null;
        }
      },
      failed: (error) => {
        // TargetHints has already retired its UI, even if a native release failed.
        if (!this.#host.isCurrent()) return;
        reportDiagnosticError(this.#host, 'reader copy hints failed', error);
        if (this.#host.isCurrent() && this.#window === null)
          this.#host.showStatus(this.#host.text('reader.hints.copyFailed'), 1500);
      },
    });
  }

  get hasHints(): boolean {
    return this.#host.isCurrent() && this.#hints.isOpen;
  }
  ownsView(window: PdfWindow): boolean {
    return this.#host.isCurrent() && this.#window === window;
  }

  open(window: PdfWindow): void {
    this.close();
    if (!this.#host.isCurrent()) return;
    try {
      const view = this.#host.viewForWindow(window);
      if (!view || !this.#host.isCurrent()) throw new Error('active PDF view not found');
      this.#window = window;
      this.#view = view;
      const targets = readerCopyTargets(this.#host.reader, view, window, this.#host.text);
      if (!this.#isCurrent(window)) {
        this.close();
        return;
      }
      this.#hints.open(window, targets, this.#host.text('reader.hints.copyPrompt'));
      if (!this.#host.isCurrent()) return;
      if (
        !this.hasHints &&
        !isDeadObject(window) &&
        !isDeadObject(view) &&
        this.#host.viewForWindow(window) === view
      ) {
        const message = this.#host.text('reader.hints.copyEmpty');
        if (this.#host.isCurrent()) this.#host.showStatus(message, 1500);
      }
    } catch (error) {
      const active = this.#host.isCurrent();
      const failure = new CleanupFailure();
      failure.run(() => this.close());
      if (active) reportDiagnosticError(this.#host, 'reader copy discovery failed', error);
      failure.run(() => {
        if (this.#host.isCurrent() && this.#window === null)
          this.#host.showStatus(this.#host.text('reader.hints.copyUnavailable'), 1500);
      });
      try {
        failure.rethrow();
      } catch (cleanupError) {
        reportDiagnosticError(this.#host, 'reader copy recovery failed', cleanupError);
        throw cleanupError;
      }
    }
  }

  handleKey(event: KeyboardEvent, window: PdfWindow): boolean {
    if (!this.#host.isCurrent()) {
      this.close();
      return false;
    }
    return this.#hints.handleKey(event, window);
  }
  onViewportChange(window: PdfWindow): void {
    if (!this.#host.isCurrent()) {
      this.close();
      return;
    }
    this.#hints.onViewportChange(window);
  }
  releaseView(window: PdfWindow): void {
    if (this.#window === window) this.close();
  }
  close(): void {
    this.#window = null;
    this.#view = null;
    this.#hints.cancel();
  }

  #isCurrent(window: PdfWindow): boolean {
    return (
      this.#host.isCurrent() &&
      this.#window === window &&
      !isDeadObject(window) &&
      this.#view !== null &&
      !isDeadObject(this.#view) &&
      this.#host.viewForWindow(window) === this.#view
    );
  }
}
