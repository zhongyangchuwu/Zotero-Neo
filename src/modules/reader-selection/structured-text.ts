import type { ReaderDocumentSnapshot } from '../../reader/document-cache';
import { readerTextSpans } from '../../toolkit/reader';
import type { PdfWindow, Pointer } from '../../reader/types';
import type { MappedTextIndex } from './token-boundaries';
import { mapDocumentParagraphs } from './paragraph-mapping';
import { tokenTextNeighborhood } from './token-motion';

/** Session source snapshots are reusable; character maps exist only during the initiating motion. */
export class ReaderStructuredText {
  readonly #read: () => Promise<ReaderDocumentSnapshot | null>;
  #document: ReaderDocumentSnapshot | null = null;
  #loading: Promise<ReaderDocumentSnapshot | null> | null = null;
  #revision = 0;
  constructor(read: () => Promise<ReaderDocumentSnapshot | null>) {
    this.#read = read;
  }

  invalidate(): void {
    this.#revision++;
    this.#document = null;
    this.#loading = null;
  }

  async paragraphs(
    window: PdfWindow,
    focus: Pointer,
    current: () => boolean,
  ): Promise<readonly MappedTextIndex[] | null> {
    const revision = this.#revision;
    const pending = (this.#loading ??= this.#document
      ? Promise.resolve(this.#document)
      : this.#read());
    let source: ReaderDocumentSnapshot | null;
    try {
      source = await pending;
    } finally {
      if (this.#loading === pending) this.#loading = null;
    }
    if (!current() || revision !== this.#revision) return null;
    this.#document = source;
    if (!source) return null;
    if (!(await source.isCurrent())) {
      this.invalidate();
      throw new Error('Document source changed');
    }
    if (!current() || revision !== this.#revision) return null;
    const spans = tokenTextNeighborhood(readerTextSpans(window), [focus], 2);
    return mapDocumentParagraphs(source.parsed.regions, spans).map((p) => p.index);
  }
}
