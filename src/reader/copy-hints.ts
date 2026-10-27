import { isDeadObject } from '../platform/cross-compartment';
import { readerCopyTargets, type ReaderCopyTarget } from './copy-targets';
import { ReaderTargetHints } from './target-hints';
import type { PdfWindow, ReaderRuntime, ReaderViewRuntime } from './types';

interface CopyHintsHost {
  readonly reader: ReaderRuntime;
  readonly viewForWindow: (window: PdfWindow) => ReaderViewRuntime | null;
  readonly copyText: (text: string) => void;
  readonly text: (key: string) => string;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
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
        if (!this.#isCurrent(window)) return;
        this.close();
        this.#host.copyText(target.text);
      },
      closed: (reason) => {
        if (reason !== 'confirmed') {
          this.#window = null;
          this.#view = null;
        }
      },
      failed: (error) => {
        this.close();
        this.#host.debug(`reader copy hints failed: ${String(error)}`);
        this.#host.showStatus(this.#host.text('reader.hints.copyFailed'), 1500);
      },
    });
  }

  get hasHints(): boolean {
    return this.#hints.isOpen;
  }
  ownsView(window: PdfWindow): boolean {
    return this.#window === window;
  }

  open(window: PdfWindow): void {
    this.close();
    try {
      const view = this.#host.viewForWindow(window);
      if (!view) throw new Error('active PDF view not found');
      this.#window = window;
      this.#view = view;
      this.#hints.open(
        window,
        readerCopyTargets(this.#host.reader, view, window, this.#host.text),
        this.#host.text('reader.hints.copyPrompt'),
      );
      if (!this.hasHints) this.#host.showStatus(this.#host.text('reader.hints.copyEmpty'), 1500);
    } catch (error) {
      this.close();
      this.#host.debug(`reader copy discovery failed: ${String(error)}`);
      this.#host.showStatus(this.#host.text('reader.hints.copyUnavailable'), 1500);
    }
  }

  handleKey(event: KeyboardEvent, window: PdfWindow): boolean {
    return this.#hints.handleKey(event, window);
  }
  onViewportChange(window: PdfWindow): void {
    this.#hints.onViewportChange(window);
  }
  releaseView(window: PdfWindow): void {
    if (this.ownsView(window)) this.close();
  }
  close(): void {
    this.#window = null;
    this.#view = null;
    this.#hints.cancel();
  }

  #isCurrent(window: PdfWindow): boolean {
    return (
      this.#window === window &&
      !isDeadObject(window) &&
      this.#view !== null &&
      !isDeadObject(this.#view) &&
      this.#host.viewForWindow(window) === this.#view
    );
  }
}
