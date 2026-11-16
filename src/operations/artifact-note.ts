import { escapeHTML } from '../core/html';

/** A note is a display projection linked to a real artifact, never a second editable master. */
export async function projectArtifactNote(
  parent: Zotero.Item,
  attachmentKey: string,
  title: string,
  paragraphs: readonly string[],
  isCurrent: () => boolean | Promise<boolean> = () => true,
): Promise<Zotero.Item> {
  return Zotero.DB.executeTransaction(async () => {
    const library = Zotero.Libraries.get(parent.libraryID);
    if (!parent.isRegularItem() || parent.deleted || !library || !library.editable) {
      throw new Error('Artifact note destination is read-only or unavailable');
    }
    const attachment = await Zotero.Items.getByLibraryAndKeyAsync(parent.libraryID, attachmentKey);
    if (
      !attachment ||
      attachment.deleted ||
      !attachment.isAttachment() ||
      attachment.parentItemID !== parent.id
    ) {
      throw new Error('The artifact attachment is no longer available');
    }
    const uri = Zotero.URI.getItemURI(attachment);
    for (const id of parent.getNotes()) {
      const existing = await Zotero.Items.getAsync(id);
      if (
        existing &&
        !existing.deleted &&
        existing.getRelationsByPredicate('dc:relation').includes(uri)
      ) {
        return existing;
      }
    }
    // All native lookups must finish before admitting a new note mutation.
    if (!(await isCurrent())) throw new Error('The artifact note projection was cancelled');
    const currentLibrary = Zotero.Libraries.get(parent.libraryID);
    if (!parent.isRegularItem() || parent.deleted || !currentLibrary || !currentLibrary.editable) {
      throw new Error('Artifact note destination is read-only or unavailable');
    }
    if (
      attachment.deleted ||
      !attachment.isAttachment() ||
      attachment.parentItemID !== parent.id ||
      attachment.libraryID !== parent.libraryID
    ) {
      throw new Error('The artifact attachment is no longer available');
    }
    const note = new Zotero.Item('note');
    note.libraryID = parent.libraryID;
    note.parentID = parent.id;
    note.addRelation('dc:relation', uri);
    const html =
      `<h1>${escapeHTML(title)}</h1>` +
      paragraphs
        .map((paragraph) => `<p>${escapeHTML(paragraph).replace(/\n/gu, '<br/>')}</p>`)
        .join('');
    if (html.length > 2 * 1024 * 1024) throw new Error('Artifact note exceeds size limit');
    note.setNote(html);
    await note.save();
    return note;
  });
}
