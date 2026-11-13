import type { TabDocumentRef } from '../toolkit/main/tab-enhancements-types';

export interface ReadingGroupDocument {
  readonly document: TabDocumentRef;
  readonly title: string;
  readonly choiceLabel: string;
}

interface ReadingGroupCandidate {
  readonly title: string;
  readonly documents: readonly ReadingGroupDocument[];
}

/** Freeze only the explicitly resolved items' PDF identities before any prompt changes focus. */
export function snapshotReadingGroupDocuments(
  items: readonly Zotero.Item[],
  missing: number,
): { readonly candidates: readonly ReadingGroupCandidate[]; readonly missing: number } {
  const candidates: ReadingGroupCandidate[] = [];
  for (const item of items) {
    if (item.deleted) {
      missing++;
      continue;
    }
    const attachments = item.isRegularItem()
      ? item.getAttachments().map((id) => Zotero.Items.get(id))
      : [item];
    const documents = attachments.flatMap((attachment) => {
      if (!attachment || attachment.deleted || !attachment.isPDFAttachment()) return [];
      const filename = String(attachment.attachmentFilename || '').slice(0, 2000);
      const title = String(attachment.getField('title') || filename || 'PDF').slice(0, 2000);
      return [
        {
          document: {
            kind: 'reader' as const,
            libraryID: attachment.libraryID,
            key: attachment.key,
          },
          title,
          choiceLabel: filename && filename !== title ? `${title} · ${filename}` : title,
        },
      ];
    });
    if (!documents.length) {
      missing++;
      continue;
    }
    const labels = new Map<string, number>();
    for (const document of documents)
      labels.set(document.choiceLabel, (labels.get(document.choiceLabel) ?? 0) + 1);
    for (const document of documents) {
      if (labels.get(document.choiceLabel)! > 1)
        document.choiceLabel += ` · ${document.document.key}`;
    }
    candidates.push({ title: String(item.getField('title') || 'PDF'), documents });
  }
  return { candidates, missing };
}
