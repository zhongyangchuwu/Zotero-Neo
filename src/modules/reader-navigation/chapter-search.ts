import type { PreferenceStore } from '../../core/preference-store';
import type { PdfWindow, ReaderRuntime } from '../../reader/types';
import { readReaderDocument, type ReaderDocumentSnapshot } from '../../reader/document-cache';
import { documentText, documentTextBlocks } from '../../document-analysis/text-blocks';
import {
  documentSections,
  sectionForBlock,
  searchDocumentSection,
  type DocumentSection,
  type SectionSearchResult,
} from '../../document-analysis/sections';
import { readerTextSpans, readerWindow } from '../../toolkit/reader';
import { SearchDialog } from '../../ui/search-dialog';

export interface ReaderChapterSearchHost {
  readonly reader: ReaderRuntime;
  readonly preferences: PreferenceStore;
  readonly captureView: (window: PdfWindow) => () => boolean;
  readonly isCurrent: () => boolean;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly text: (key: string) => string;
  readonly navigate: (result: SectionSearchResult, window: PdfWindow) => void | Promise<void>;
  readonly debug: (message: string) => void;
}

/** Chapter scope and literal search belong to navigation; the shared dialog owns only query/list interaction. */
export class ReaderChapterSearch {
  readonly #host: ReaderChapterSearchHost;
  readonly #dialog = new SearchDialog<SectionSearchResult>();
  #window: PdfWindow | null = null;
  #revision = 0;
  constructor(host: ReaderChapterSearchHost) {
    this.#host = host;
  }
  open(window: PdfWindow): void {
    this.close();
    const owner = readerWindow(this.#host.reader),
      captured = this.#host.captureView(window),
      revision = this.#revision;
    if (!owner || !captured() || !this.#host.isCurrent()) return;
    this.#window = window;
    const current = (): boolean =>
      revision === this.#revision && this.#host.isCurrent() && captured();
    let source: ReaderDocumentSnapshot | null = null,
      sections: readonly DocumentSection[] = [];
    const focus = window.document.activeElement as HTMLElement | null;
    const text = this.#host.text;
    this.#dialog.open({
      owner,
      current,
      themeRoot: this.#host.themeRoot,
      title: text('title'),
      placeholder: text('search'),
      help: text('help'),
      loading: text('loading'),
      unavailable: text('unavailable'),
      close: text('close'),
      empty: text('empty'),
      restoreFocus: () => {
        window.focus();
        if (focus?.isConnected) focus.focus();
      },
      onClose: () => {
        if (this.#window === window) {
          this.#window = null;
          this.#revision++;
        }
      },
      load: async () => {
        source = await readReaderDocument(this.#host.reader, this.#host.preferences, current);
        if (!current() || !source) throw new Error('Document structure unavailable');
        const blocks = documentTextBlocks(source.parsed.regions);
        sections = documentSections(blocks);
        let initial: DocumentSection | null = null;
        for (const span of readerTextSpans(window)) {
          if (span.rect.bottom <= 0 || span.rect.top >= window.innerHeight) continue;
          const snippet = documentText(span.text).replace(/\s/gu, '');
          if (snippet.length < 12) continue;
          const matches = blocks.flatMap((block, i) =>
            documentText(block.text).replace(/\s/gu, '').includes(snippet) ? [i] : [],
          );
          if (matches.length === 1) {
            initial = sectionForBlock(sections, matches[0]!);
            if (initial) break;
          }
        }
        return {
          items: [],
          scopes: sections.map((section) => ({
            id: section.id,
            title: section.title || text('document'),
          })),
          initialScope: initial?.id ?? sections[0]?.id,
        };
      },
      filter: (_items, query, scope) => {
        const section = sections.find((section) => section.id === scope);
        return source && section
          ? searchDocumentSection(source.parsed.regions, section, query)
          : [];
      },
      label: (result) => `${text('page')} ${result.location.pageIndex + 1}\n${result.excerpt}`,
      confirm: async (result) => {
        if (!current() || !source || !(await source.isCurrent()) || !current()) return false;
        await this.#host.navigate(result, window);
        return current();
      },
      debug: (error) => this.#host.debug(`Reader chapter search failed: ${String(error)}`),
    });
  }
  handleKey(event: KeyboardEvent): boolean {
    return this.#dialog.handleKey(event);
  }
  releaseView(window: PdfWindow): void {
    if (this.#window === window) this.close();
  }
  close(): void {
    this.#revision++;
    this.#dialog.close();
    this.#window = null;
  }
}
