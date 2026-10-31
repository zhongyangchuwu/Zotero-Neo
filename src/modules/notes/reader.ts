import type { ModuleHost } from '../../core/module-host';
import type { SourceNoteEntry, SourceNoteTarget } from '../../core/source-note';
import type { PreferenceStore } from '../../core/preference-store';
import type { DocumentLocation } from '../../document-analysis/contracts';
import type { PdfWindow, ReaderRuntime } from '../../reader/types';
import { readReaderDocument, type ReaderDocumentSnapshot } from '../../reader/document-cache';
import { readerWindow } from '../../toolkit/reader';
import { sourceNoteEntries } from '../../toolkit/main';
import { observeAttachmentDocumentCache } from '../../platform/document-analysis-cache';
import { DOCUMENT_PROVIDER_KEY, OXR_ENDPOINT_KEY } from '../../document-analysis/settings';
import { createSourceNote } from '../../operations/source-note';
import { sourceNoteIdentity, SOURCE_NOTE_IDENTITY_PREFIX } from '../../platform/note-relations';
import { SearchDialog } from '../../ui/search-dialog';
import { chapterNoteEntries, chapterNoteMarkup, type ChapterNoteEntry } from './chapter-plan';

export interface ReaderNotesHost {
  readonly reader: ReaderRuntime;
  readonly preferences: PreferenceStore;
  readonly target: () => SourceNoteTarget | null;
  readonly captureView: (window: PdfWindow) => () => boolean;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly text: (key: string) => string;
  readonly showStatus: (message: string) => void;
  readonly navigate: (window: PdfWindow, location: DocumentLocation) => void | Promise<void>;
  readonly debug: (message: string) => void;
}
export interface ReaderNotesModule {
  open(window: PdfWindow): boolean;
  handleKey(event: KeyboardEvent): boolean;
  releaseView(window: PdfWindow): void;
  close(): void;
}

/** Notes owns the review and explicit generation workflow; Reader supplies the exact source and navigation capability. */
export function createReaderNotesModule(
  host: ModuleHost,
  ports: ReaderNotesHost,
): ReaderNotesModule {
  return host.activate('notes', (scope) => {
    const dialog = new SearchDialog<ChapterNoteEntry>();
    let revision = 0,
      active: PdfWindow | null = null;
    const close = (): void => {
      revision++;
      active = null;
      dialog.close();
    };
    scope.add(close);
    if (ports.reader.itemID) scope.add(observeAttachmentDocumentCache(ports.reader.itemID, close));
    for (const key of [DOCUMENT_PROVIDER_KEY, OXR_ENDPOINT_KEY]) {
      const stop = ports.preferences.observe?.(key, close);
      if (stop) scope.add(stop);
    }
    const open = host.bind<PdfWindow>(scope, 'reader-normal', 'organizeChapterNotes', (window) => {
      close();
      const owner = readerWindow(ports.reader),
        captured = ports.captureView(window),
        target = ports.target(),
        request = revision;
      const current = (): boolean => scope.isCurrent() && revision === request && captured();
      if (!owner || !target || !current()) return;
      active = window;
      const text = ports.text,
        focus = window.document.activeElement as HTMLElement | null;
      const sectionTitle = (entry: ChapterNoteEntry): string =>
        entry.section ? entry.section.title || text('document') : text('unclassified');
      let source: ReaderDocumentSnapshot | null = null,
        original: readonly SourceNoteEntry[] = [],
        filtered: readonly ChapterNoteEntry[] = [];
      const valid = async (): Promise<boolean> =>
        current() && !!source && (await source.isCurrent()) && current();
      const save = async (): Promise<boolean> => {
        if (!filtered.length || !(await valid())) return false;
        const fresh = await sourceNoteEntries(
          target.attachment.itemID,
          SOURCE_NOTE_IDENTITY_PREFIX,
        );
        if (JSON.stringify(fresh) !== JSON.stringify(original) || !(await valid()))
          throw new Error('Source notes changed; reopen the preview');
        const markup = chapterNoteMarkup(filtered, sectionTitle);
        const identity = sourceNoteIdentity(
          JSON.stringify([source!.parsed.sourceFingerprint, markup]),
        );
        const receipt = await createSourceNote(target, {
          ...markup,
          identity,
          sourceFingerprint: source!.parsed.sourceFingerprint,
          title: `${text('noteTitle')} · ${target.parent?.title || target.attachment.title} · ${filtered.length} ${text('entries')} · ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
        });
        if (current()) ports.showStatus(text(receipt.reused ? 'reused' : 'saved'));
        return true;
      };
      dialog.open({
        owner,
        current,
        themeRoot: ports.themeRoot,
        title: text('title'),
        placeholder: text('search'),
        help: `${text('help')}\n${text('destination')}: ${target.parent?.title || target.attachment.title}`,
        loading: text('loading'),
        unavailable: text('unavailable'),
        close: text('close'),
        empty: text('empty'),
        restoreFocus: () => {
          window.focus();
          if (focus?.isConnected) focus.focus();
        },
        onClose: () => {
          if (revision === request) {
            revision++;
            active = null;
          }
        },
        load: async () => {
          source = await readReaderDocument(ports.reader, ports.preferences, current);
          if (!source || !current()) throw new Error('Document structure unavailable');
          original = await sourceNoteEntries(target.attachment.itemID, SOURCE_NOTE_IDENTITY_PREFIX);
          if (!current()) throw new Error('Notes preview retired');
          const entries = chapterNoteEntries(original, source.parsed.regions);
          const sections = new Map(
            entries.map((entry) => [entry.section?.id ?? 'unclassified', sectionTitle(entry)]),
          );
          return {
            items: entries,
            scopes: [
              { id: 'all', title: text('all') },
              ...[...sections].map(([id, title]) => ({ id, title })),
            ],
            initialScope: 'all',
          };
        },
        filter: (items, query, selected) => {
          const words = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
          filtered = items.filter(
            (entry) =>
              (selected === 'all' || (entry.section?.id ?? 'unclassified') === selected) &&
              words.every((word) =>
                `${entry.quote} ${entry.comment} ${sectionTitle(entry)}`
                  .toLocaleLowerCase()
                  .includes(word),
              ),
          );
          return filtered;
        },
        label: (entry) =>
          `${sectionTitle(entry)} · ${text(entry.kind)} · ${text('page')} ${entry.locations.map((l) => l.pageIndex + 1).join(', ') || '?'}\n${entry.quote || entry.comment}`,
        preview: async (entry) => ({
          text: `${entry.quote}${entry.comment ? `\n\n${entry.comment}` : ''}`,
          images: entry.images.map((dataURL) => ({ dataURL, alt: text('excerpt') })),
        }),
        confirm: async (entry) => {
          if (!entry.locations[0] || !(await valid())) return false;
          await ports.navigate(window, entry.locations[0]);
          return current();
        },
        actions: [{ label: text('save'), run: save }],
        debug: (error) => ports.debug(`Chapter notes failed: ${String(error)}`),
      });
    });
    return {
      open,
      handleKey: (event) => dialog.handleKey(event),
      close,
      releaseView: (window) => {
        if (active === window) close();
      },
    };
  });
}
