import type { PreferenceStore } from '../../core/preference-store';
import type { SourceNoteTarget } from '../../core/source-note';
import { escapeHTML } from '../../core/html';
import { documentExcerpts, type DocumentExcerpt } from '../../document-analysis/excerpts';
import { readReaderDocument, type ReaderDocumentSnapshot } from '../../reader/document-cache';
import type { PdfWindow, ReaderRuntime } from '../../reader/types';
import { readerRegionPreview, readerWindow, type ReaderRegionPreview } from '../../toolkit/reader';
import { sourceNoteImageMarkup, sourcePDFLink } from '../../toolkit/main';
import { copyRichClipboard } from '../../platform/clipboard';
import { documentTableClipboard } from '../../platform/document-markup';
import { createSourceNote } from '../../operations/source-note';
import { isDeadObject } from '../../platform/cross-compartment';
import { SearchDialog } from '../../ui/search-dialog';

export interface ReaderObjectExcerptHost {
  readonly reader: ReaderRuntime;
  readonly preferences: PreferenceStore;
  readonly target: () => SourceNoteTarget | null;
  readonly captureView: (window: PdfWindow) => () => boolean;
  readonly isCurrent: () => boolean;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly text: (key: string) => string;
  readonly showStatus: (message: string) => void;
  readonly debug: (message: string) => void;
}
interface PreparedExcerpt {
  readonly target: DocumentExcerpt;
  readonly images: readonly ReaderRegionPreview[];
}

/** Explicit object workflow owns preparation and copy/save admission; no DOM text Capture or implicit note append. */
export class ReaderObjectExcerpts {
  readonly #host: ReaderObjectExcerptHost;
  readonly #dialog = new SearchDialog<DocumentExcerpt>();
  #window: PdfWindow | null = null;
  #revision = 0;
  constructor(host: ReaderObjectExcerptHost) {
    this.#host = host;
  }

  open(window: PdfWindow): void {
    this.close();
    const owner = readerWindow(this.#host.reader),
      captured = this.#host.captureView(window),
      noteTarget = this.#host.target();
    if (!owner || !captured() || !this.#host.isCurrent() || !noteTarget) return;
    this.#window = window;
    const revision = this.#revision,
      text = this.#host.text,
      sourceTitle = noteTarget.parent?.title || noteTarget.attachment.title;
    const current = (): boolean =>
      revision === this.#revision && this.#host.isCurrent() && captured();
    const abort = new (owner as Window & typeof globalThis).AbortController();
    const cache = new Map<string, PreparedExcerpt>(),
      jobs = new Map<string, { signal: AbortSignal; promise: Promise<PreparedExcerpt> }>();
    let source: ReaderDocumentSnapshot | null = null;
    const name = (target: DocumentExcerpt): string =>
      target.title ||
      `${text(target.kind)}${target.association === 'caption-only' || target.association === 'ambiguous' ? ` · ${text('incomplete')}` : ''} · ${text('page')} ${target.locations[0]?.pageIndex! + 1}`;
    const prepare = (target: DocumentExcerpt, signal = abort.signal): Promise<PreparedExcerpt> => {
      const ready = cache.get(target.id);
      if (ready) return Promise.resolve(ready);
      const running = jobs.get(target.id);
      if (running && !running.signal.aborted) return running.promise;
      const check = async (): Promise<void> => {
        if (!current() || signal.aborted || !source || !(await source.isCurrent()) || !current())
          throw new Error('Excerpt source changed');
      };
      const task = (async (): Promise<PreparedExcerpt> => {
        await check();
        if (!target.locations.length || target.locations.length > 16)
          throw new Error('Excerpt page span unsupported');
        const images: ReaderRegionPreview[] = [];
        for (const location of target.locations) {
          await check();
          images.push(await readerRegionPreview(this.#host.reader, location, signal));
        }
        await check();
        const result = { target, images };
        cache.set(target.id, result);
        if (cache.size > 4) cache.delete(cache.keys().next().value!);
        return result;
      })().finally(() => {
        if (jobs.get(target.id)?.promise === task) jobs.delete(target.id);
      });
      jobs.set(target.id, { signal, promise: task });
      return task;
    };
    const admitted = async (target: DocumentExcerpt): Promise<PreparedExcerpt> => {
      const result = await prepare(target);
      if (!current() || !source || !(await source.isCurrent()) || !current())
        throw new Error('Excerpt source changed');
      return result;
    };
    const markup = (prepared: PreparedExcerpt, embedded: boolean): string =>
      prepared.images
        .map((image, i) => {
          const location = prepared.target.locations[i]!;
          const html = sourceNoteImageMarkup(
            noteTarget.attachment.itemID,
            location,
            embedded ? `neo-image:${i}` : image.dataURL,
            i === 0 ? prepared.target.caption : '',
          );
          const link = sourcePDFLink(noteTarget.attachment.itemID, location.pageIndex);
          return `${html}<p><a href="${escapeHTML(link)}">${escapeHTML(sourceTitle)} · ${text('page')} ${location.pageIndex + 1}</a></p>`;
        })
        .join('\n');
    const copy = async (target: DocumentExcerpt, imageOnly = false): Promise<boolean> => {
      const prepared = await admitted(target);
      const links = target.locations.map((location) =>
        sourcePDFLink(noteTarget.attachment.itemID, location.pageIndex),
      );
      copyRichClipboard({
        text: `${target.caption || name(target)}\n${sourceTitle}\n${links.join('\n')}`,
        html: markup(prepared, false),
        ...(imageOnly && prepared.images.length === 1
          ? { image: prepared.images[0]!.dataURL }
          : {}),
      });
      if (current()) this.#host.showStatus(text(imageOnly ? 'copiedImage' : 'copied'));
      return true;
    };
    const structured = async (target: DocumentExcerpt): Promise<boolean> => {
      if (!current() || !source || !(await source.isCurrent()) || !current()) return false;
      const structures = target.structures;
      if (!structures.length) return false;
      const formats = structures.map((s) =>
        s.format === 'html'
          ? documentTableClipboard(s.text)
          : { text: s.text, html: `<pre>${escapeHTML(s.text)}</pre>` },
      );
      copyRichClipboard({
        text: formats.map((f) => f.text).join('\n\n'),
        html: formats.map((f) => f.html).join('<br/>'),
      });
      this.#host.showStatus(text('copiedStructure'));
      return true;
    };
    const save = async (target: DocumentExcerpt): Promise<boolean> => {
      const prepared = await admitted(target);
      await createSourceNote(noteTarget, {
        sourceFingerprint: source!.parsed.sourceFingerprint,
        title:
          `${target.label ? `${text(target.kind)} ${target.label}` : target.kind === 'formula' ? `${text('formula')} · ${target.locations[0]!.pageIndex + 1}` : name(target).slice(0, 80)} · ${sourceTitle}`.slice(
            0,
            180,
          ),
        html: markup(prepared, true),
        images: prepared.images.map((i) => i.dataURL),
      });
      if (current()) this.#host.showStatus(text('saved'));
      return true;
    };
    const originalFocus = window.document.activeElement as HTMLElement | null;
    this.#dialog.open({
      owner,
      current,
      themeRoot: this.#host.themeRoot,
      title: text('title'),
      placeholder: text('search'),
      help: `${text('help')}\n${text('destination')}: ${sourceTitle}${noteTarget.parent ? '' : ` · ${text('standalone')}`}`,
      loading: text('loading'),
      unavailable: text('unavailable'),
      close: text('close'),
      empty: text('empty'),
      restoreFocus: () => {
        window.focus();
        if (originalFocus?.isConnected) originalFocus.focus();
      },
      onClose: () => {
        if (!isDeadObject(abort)) abort.abort();
        cache.clear();
        jobs.clear();
        if (this.#revision === revision) {
          this.#revision++;
          this.#window = null;
        }
      },
      load: async () => {
        source = await readReaderDocument(this.#host.reader, this.#host.preferences, current);
        if (!current() || !source) throw new Error('Excerpt layout unavailable');
        return {
          items: documentExcerpts(source.parsed.regions),
          scopes: ['objects', 'figure', 'table', 'formula', 'bodies'].map((id) => ({
            id,
            title: text(id),
          })),
          initialScope: 'objects',
        };
      },
      filter: (items, query, scope) => {
        const words = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
        return items.filter(
          (item) =>
            (scope === 'bodies'
              ? item.part === 'body'
              : item.part === 'object' && (scope === 'objects' || item.kind === scope)) &&
            words.every((word) =>
              `${name(item)} ${item.caption} ${item.locations.map((p) => p.pageIndex + 1).join(' ')}`
                .toLocaleLowerCase()
                .includes(word),
            ),
        );
      },
      label: (target) =>
        `${text(target.kind)}${target.association === 'caption-only' || target.association === 'ambiguous' ? ` · ${text('incomplete')}` : ''} · ${text('page')} ${target.locations.map((l) => l.pageIndex + 1).join(', ')}\n${name(target)}`,
      preview: async (target, signal) => {
        const prepared = await prepare(target, signal);
        const structureText = target.structures
          .map((s) => {
            try {
              return s.format === 'html' ? documentTableClipboard(s.text).text : s.text;
            } catch {
              return '';
            }
          })
          .filter(Boolean)
          .join('\n\n');
        return {
          text: `${target.caption}${structureText ? `\n\n${structureText}` : ''}`,
          images: prepared.images.map((image) => ({ dataURL: image.dataURL, alt: name(target) })),
        };
      },
      confirm: copy,
      actions: [
        { label: text('copy'), run: copy },
        {
          label: text('copyImage'),
          run: (target) => copy(target, true),
          available: (target) => target.locations.length === 1,
        },
        {
          label: text('structure'),
          run: structured,
          available: (target) => !!target.structures.length,
        },
        { label: text('save'), run: save },
      ],
      debug: (error) => this.#host.debug(`Reader object excerpt failed: ${String(error)}`),
    });
  }
  handleKey(event: KeyboardEvent): boolean {
    return this.#dialog.handleKey(event);
  }
  releaseView(window: PdfWindow): void {
    if (this.#window === window) this.close();
  }
  close(): void {
    const revision = ++this.#revision;
    this.#dialog.close();
    if (revision === this.#revision) this.#window = null;
  }
}
