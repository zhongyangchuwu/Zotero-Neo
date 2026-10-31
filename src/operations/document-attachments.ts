import type { DocumentAttachment } from '../document-analysis/preparation';

/** Freeze the supplied items' PDF identities. Only Main asks to expand selected regular items. */
export function documentAttachments(
  items: readonly Zotero.Item[],
  expand: boolean,
): readonly DocumentAttachment[] {
  const targets = new Map<string, DocumentAttachment>();
  for (const item of items) {
    const candidates =
      expand && item.isRegularItem()
        ? item.getAttachments().map((id) => Zotero.Items.get(id))
        : [item];
    for (const attachment of candidates) {
      if (!attachment || attachment.deleted || !attachment.isPDFAttachment()) continue;
      const target = {
        itemID: attachment.id,
        libraryID: attachment.libraryID,
        key: attachment.key,
        title: String(attachment.getField('title') || attachment.attachmentFilename || 'PDF').slice(
          0,
          2000,
        ),
      };
      targets.set(`${target.libraryID}:${target.key}`, target);
    }
  }
  return [...targets.values()];
}
