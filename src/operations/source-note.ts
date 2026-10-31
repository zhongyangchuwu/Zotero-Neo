import type { SourceNoteDraft, SourceNoteReceipt, SourceNoteTarget } from '../core/source-note';
import { analysisPDF } from '../platform/document-analysis';
import { pngBlob } from '../platform/image-data';
import { escapeHTML } from '../core/html';
import { relatedSourceNotes, SOURCE_NOTE_IDENTITY_PREFIX } from '../platform/note-relations';

const pendingNotes = new Map<string, Promise<SourceNoteReceipt>>();

/** Create a fresh source note only after target/source admission; roll back our own partial note on image/save failure. */
export async function createSourceNote(
  target: SourceNoteTarget,
  draft: SourceNoteDraft,
): Promise<SourceNoteReceipt> {
  if (!draft.identity) return writeSourceNote(target, draft);
  if (
    !draft.identity.startsWith(SOURCE_NOTE_IDENTITY_PREFIX) ||
    !/^[a-f0-9]{32}$/u.test(draft.identity.slice(SOURCE_NOTE_IDENTITY_PREFIX.length))
  )
    throw new Error('Invalid note identity');
  const key = `${target.attachment.itemID}:${target.parent?.itemID ?? ''}:${draft.identity}`;
  const previous = pendingNotes.get(key);
  const task = (previous ?? Promise.resolve())
    .catch(() => {})
    .then(() => writeSourceNote(target, draft));
  pendingNotes.set(key, task);
  try {
    return await task;
  } finally {
    if (pendingNotes.get(key) === task) pendingNotes.delete(key);
  }
}

async function writeSourceNote(
  target: SourceNoteTarget,
  draft: SourceNoteDraft,
): Promise<SourceNoteReceipt> {
  const source = await Zotero.Items.getAsync(target.attachment.itemID),
    parent = target.parent && (await Zotero.Items.getAsync(target.parent.itemID));
  if (
    !source ||
    source.deleted ||
    !source.isPDFAttachment() ||
    source.key !== target.attachment.key ||
    source.libraryID !== target.attachment.libraryID ||
    (source.parentItemID || null) !== (target.parent?.itemID ?? null) ||
    (target.parent &&
      (!parent || parent.deleted || parent.key !== target.parent.key || !parent.isRegularItem()))
  )
    throw new Error('Source note destination changed');
  const library = Zotero.Libraries.get(source.libraryID);
  if (!library || !library.editable || (draft.images.length && !library.filesEditable))
    throw new Error('Note destination is read-only');
  const destinationCurrent = (): boolean =>
    !source.deleted &&
    source.key === target.attachment.key &&
    source.libraryID === target.attachment.libraryID &&
    (source.parentItemID || null) === (target.parent?.itemID ?? null) &&
    (!target.parent ||
      (!!parent &&
        !parent.deleted &&
        parent.key === target.parent.key &&
        parent.libraryID === source.libraryID &&
        parent.isRegularItem())) &&
    library.editable &&
    (!draft.images.length || library.filesEditable);
  if (
    draft.images.length > 64 ||
    draft.images.reduce((size, image) => size + image.length, 0) > 64 * 1024 * 1024 ||
    draft.html.length > 2 * 1024 * 1024
  )
    throw new Error('Note exceeds size limit');
  const pdf = await analysisPDF(source.id);
  if (pdf.fingerprint !== draft.sourceFingerprint || !(await pdf.isCurrent()))
    throw new Error('Source PDF changed');
  if (!destinationCurrent()) throw new Error('Source note destination changed before save');
  if (draft.identity) {
    const existing = (await relatedSourceNotes(draft.identity)).find(
      (note) =>
        !note.deleted &&
        note.isNote() &&
        note.libraryID === source.libraryID &&
        (note.parentID || null) === (target.parent?.itemID ?? null) &&
        note.getRelationsByPredicate('dc:relation').includes(Zotero.URI.getItemURI(source)),
    );
    if (!(await pdf.isCurrent()) || !destinationCurrent())
      throw new Error('Source PDF or destination changed');
    if (existing) return { itemID: existing.id, key: existing.key, reused: true };
  }
  const note = new Zotero.Item('note');
  note.libraryID = source.libraryID;
  if (target.parent) note.parentID = target.parent.itemID;
  note.addRelation('dc:relation', Zotero.URI.getItemURI(source));
  if (draft.identity) note.addRelation('dc:relation', draft.identity);
  const schemaVersion = draft.schemaVersion ?? 9;
  let saved = false;
  try {
    note.setNote(
      `<div data-schema-version="${schemaVersion}"><h1>${escapeHTML(draft.title)}</h1></div>`,
    );
    await note.saveTx();
    saved = true;
    let html = draft.html;
    for (const [index, image] of draft.images.entries()) {
      const slot = `src="neo-image:${index}"`;
      if (!html.includes(slot)) throw new Error('Missing embedded image slot');
      const attachment = await Zotero.Attachments.importEmbeddedImage({
        blob: pngBlob(image),
        parentItemID: note.id,
      });
      html = html.replace(slot, `data-attachment-key="${attachment.key}"`);
    }
    if (!(await pdf.isCurrent())) throw new Error('Source PDF changed before note commit');
    if (!destinationCurrent()) throw new Error('Note destination changed before note commit');
    note.setNote(
      `<div data-schema-version="${schemaVersion}"><h1>${escapeHTML(draft.title)}</h1>\n${html}</div>`,
    );
    await note.saveTx();
    return { itemID: note.id, key: note.key, reused: false };
  } catch (error) {
    if (saved) await note.eraseTx();
    throw error;
  }
}
