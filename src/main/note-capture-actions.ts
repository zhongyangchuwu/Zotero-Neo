import type {
  MainWindow,
  ReaderSelectionContext,
} from '../core/contracts';
import type { Logger } from '../core/logging';
import { mainItem } from './host';
import { normalizeTopLevelItemTargets } from './item-targets';
import type { MainNavigation } from './navigation';
import type { FuzzyPicker } from './picker';
import { createNotesProvider } from './picker/providers/notes';
import type { MainWindowSession } from './session';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

export function readerSelectionNoteFragment(context: ReaderSelectionContext): string {
  const quote = escapeHtml(context.text.trim());
  const page = context.pageLabel?.trim();
  return [
    `<blockquote><p>${quote}</p></blockquote>`,
    page ? `<p>Page ${escapeHtml(page)}</p>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function readerSourceItem(context: ReaderSelectionContext): Zotero.Item | undefined {
  if (!context.itemID) return undefined;
  const item = mainItem(context.itemID);
  if (!item) return undefined;
  return normalizeTopLevelItemTargets([item])[0];
}

export async function appendReaderSelectionToNote(
  note: Zotero.Item,
  context: ReaderSelectionContext,
  sourceLibraryID: number,
): Promise<void> {
  if (!note.isNote() || note.deleted || note.libraryID !== sourceLibraryID)
    throw new Error('Note target is unavailable');

  const fragment = readerSelectionNoteFragment(context);
  const existing = note.getNote();
  note.setNote(existing ? `${existing}\n${fragment}` : fragment);
  await note.saveTx();
}

/**
 * Knowledge-capture semantic owner.
 *
 * Reader supplies an immutable selection snapshot. Picker resolves one existing
 * Zotero note; this owner performs the mutation after revalidating that target.
 */
export class NoteCaptureActions {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;
  readonly #picker: FuzzyPicker;

  constructor(logger: Logger, navigation: MainNavigation, picker: FuzzyPicker) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#picker = picker;
  }

  open(
    window: MainWindow,
    session: MainWindowSession,
    context: ReaderSelectionContext,
  ): void {
    const snapshot: ReaderSelectionContext = { ...context };
    const source = readerSourceItem(snapshot);
    if (!source?.libraryID) {
      this.#navigation.status(session, '✗ Reader item is unavailable');
      return;
    }
    const libraryID = source.libraryID;

    void this.#picker.open(window, session, 'notes', {
      closeBeforeConfirm: true,
      source: createNotesProvider(window, this.#logger, source),
      confirm: async (candidate) => {
        try {
          const note = mainItem(Number(candidate.id));
          if (!note || !note.isNote() || note.deleted || note.libraryID !== libraryID) {
            this.#navigation.status(session, '✗ Note target is unavailable');
            return;
          }
          await appendReaderSelectionToNote(note, snapshot, libraryID);
          this.#navigation.status(session, '✓ Appended selection to note');
        } catch (error) {
          this.#logger.debug(`append Reader selection to note failed: ${String(error)}`);
          this.#navigation.status(session, '✗ Unable to append selection to note');
        }
      },
    });
  }
}
