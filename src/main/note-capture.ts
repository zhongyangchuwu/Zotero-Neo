import type { ReaderSelectionContext } from '../core/contracts';
import { normalizeTopLevelItemTargets } from './item-targets';

export function readerCaptureBaseItem(context: ReaderSelectionContext): Zotero.Item | null {
  if (context.itemID === null) return null;
  const item = Zotero.Items.get(context.itemID);
  if (!item || item === false) return null;
  return normalizeTopLevelItemTargets([item])[0] ?? null;
}

export function readerSelectionNoteFragment(context: ReaderSelectionContext): string {
  const text = context.text.trim();
  if (!text) throw new Error('Selection is empty');
  const page = context.pageLabel?.trim();
  const body = page ? `${text}\n\nPage ${page}` : text;
  return `<blockquote>${Zotero.Utilities.text2html(body)}</blockquote>`;
}

export async function appendReaderSelectionToNote(
  note: Zotero.Item,
  context: ReaderSelectionContext,
  expectedLibraryID: number,
): Promise<void> {
  if (!note.isNote() || note.deleted) throw new Error('Note target is unavailable');
  if (note.libraryID !== expectedLibraryID)
    throw new Error('Note target belongs to another library');

  const fragment = readerSelectionNoteFragment(context);
  note.setNote(`${note.getNote() ?? ''}${fragment}`);
  await note.saveTx();
}
