import type { Logger } from '../core/logging';
import type { TabDocumentRef } from '../toolkit/main/tab-enhancements-types';

export interface ReadingGroupDocument {
  readonly document: TabDocumentRef;
  readonly title: string;
  choiceLabel: string;
}

interface ReadingGroupCandidate {
  readonly title: string;
  readonly documents: readonly ReadingGroupDocument[];
}

function pdfDocument(attachment: Zotero.Item | false): ReadingGroupDocument | undefined {
  if (!attachment || attachment.deleted || !attachment.isPDFAttachment()) return;
  const filename = String(attachment.attachmentFilename || '').slice(0, 2000);
  const title = String(attachment.getField('title') || filename || 'PDF').slice(0, 2000);
  return {
    document: { kind: 'reader', libraryID: attachment.libraryID, key: attachment.key },
    title,
    choiceLabel: filename && filename !== title ? `${title} · ${filename}` : title,
  };
}

/** Freeze only the explicitly resolved items' PDF identities before any prompt changes focus. */
export function snapshotReadingGroupDocuments(
  items: readonly Zotero.Item[],
  missing: number,
  logger: Logger,
): {
  readonly candidates: readonly ReadingGroupCandidate[];
  readonly missing: number;
  readonly missingData: number;
  readonly failed: number;
} {
  const candidates: ReadingGroupCandidate[] = [];
  let missingData = 0;
  let failed = 0;
  for (const item of items) {
    try {
      if (item.deleted) {
        missing++;
        continue;
      }
      const documents: ReadingGroupDocument[] = [];
      let attachmentLookupFailed = false;
      if (item.isRegularItem()) {
        for (const id of item.getAttachments()) {
          try {
            const document = pdfDocument(Zotero.Items.get(id));
            if (document) documents.push(document);
          } catch (error) {
            attachmentLookupFailed = true;
            logger.debug(`reading group PDF lookup failed for attachment ${id}: ${String(error)}`);
          }
        }
      } else {
        const document = pdfDocument(item);
        if (document) documents.push(document);
      }
      if (!documents.length) {
        if (attachmentLookupFailed) failed++;
        else missingData++;
        continue;
      }
      if (documents.length > 1) {
        const labels = new Map<string, number>();
        for (const document of documents)
          labels.set(document.choiceLabel, (labels.get(document.choiceLabel) ?? 0) + 1);
        for (const document of documents) {
          if (labels.get(document.choiceLabel)! > 1)
            document.choiceLabel += ` · ${document.document.key}`;
        }
      }
      candidates.push({
        title: documents.length > 1 ? String(item.getField('title') || 'PDF') : documents[0]!.title,
        documents,
      });
    } catch (error) {
      failed++;
      logger.debug(`reading group PDF lookup failed for item ${item.id}: ${String(error)}`);
    }
  }
  return { candidates, missing, missingData, failed };
}
