import { compositionOwnsKey } from '../input/composition';
import { keyString } from '../input/keys';
import type { PdfWindow } from './types';

/** Reader-wide bare passthrough, independent of Surface mode and exact-view comment input. */
export class ReaderNativeInput {
  readonly #onExit: (pdfWindow: PdfWindow) => void;
  #ownsInput = false;

  constructor(onExit: (pdfWindow: PdfWindow) => void) {
    this.#onExit = onExit;
  }

  get ownsInput(): boolean {
    return this.#ownsInput;
  }

  enter(): void {
    this.#ownsInput = true;
  }

  release(): void {
    this.#ownsInput = false;
  }

  /** Native defaults and IME remain untouched; only ordinary Escape releases ownership. */
  handleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
    if (!this.#ownsInput) return false;
    if (!compositionOwnsKey(event, false) && keyString(event) === 'escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.release();
      this.#onExit(pdfWindow);
    }
    return true;
  }
}
