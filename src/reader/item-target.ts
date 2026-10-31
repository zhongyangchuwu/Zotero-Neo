import { documentAttachments } from '../operations/document-attachments';
import type { DocumentAttachment } from '../document-analysis/preparation';
import type { ItemTargetSet } from '../core/item-target';
import type { SourceNoteTarget } from '../core/source-note';
import { normalizeTopLevelItemTargets, zoteroItem } from '../platform/zotero-items';

export interface ReaderItemTargetContext {
  readonly itemID?: number;
}

export interface ReaderItemTargetResolver {
  readonly source: 'reader';
  resolve(reader: ReaderItemTargetContext | null): ItemTargetSet<'reader'>;
}

export function resolveReaderItemTarget(
  reader: ReaderItemTargetContext | null,
): ItemTargetSet<'reader'> {
  const itemID = reader?.itemID;
  if (!itemID) return { source: 'reader', items: [], total: 0, missing: 0 };
  const item = zoteroItem(itemID);
  return {
    source: 'reader',
    items: normalizeTopLevelItemTargets(item ? [item] : []),
    total: 1,
    missing: item ? 0 : 1,
  };
}

export const READER_ITEM_TARGET: ReaderItemTargetResolver = Object.freeze({
  source: 'reader',
  resolve: resolveReaderItemTarget,
});

/** Reader preparation always captures this exact attachment, including when its parent owns several PDFs. */
export function resolveReaderDocumentAttachments(
  reader: ReaderItemTargetContext | null,
): readonly DocumentAttachment[] {
  const item = reader?.itemID ? zoteroItem(reader.itemID) : undefined;
  return documentAttachments(item ? [item] : [], false);
}

/** New notes belong to the initiating PDF's parent, or remain standalone beside a standalone PDF. */
export function resolveReaderSourceNoteTarget(
  reader: ReaderItemTargetContext,
): SourceNoteTarget | null {
  const attachment = resolveReaderDocumentAttachments(reader)[0];
  if (!attachment) return null;
  const pdf = zoteroItem(attachment.itemID),
    parent = pdf?.parentItemID ? zoteroItem(pdf.parentItemID) : null;
  if (
    pdf?.parentItemID &&
    (!parent || !parent.isRegularItem() || parent.libraryID !== attachment.libraryID)
  )
    return null;
  return {
    attachment,
    parent: parent ? { itemID: parent.id, key: parent.key, title: parent.getDisplayTitle() } : null,
  };
}
