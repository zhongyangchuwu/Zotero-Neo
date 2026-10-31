import type { PreferenceStore } from '../core/preference-store';
import type { ParsedDocument } from '../document-analysis/contracts';
import { documentCacheSlot } from '../document-analysis/cache';
import { nativeDocumentPages } from '../document-analysis/native';
import { analysisPDF } from '../platform/document-analysis';
import { attachmentDocumentCache } from '../platform/document-analysis-cache';
import { readerDocumentPageGeometry, type ReaderRuntime } from '../toolkit/reader';
import { selectedDocumentCacheKey } from '../document-analysis/settings';

export interface ReaderCachedDocument {
  readonly parsed: ParsedDocument;
  /** Admission is tied to this source revision, selected service, and Reader ownership. */
  isCurrent(): Promise<boolean>;
}

/** Reader features share the selected service's validated cache; this path never uploads or runs SDT. */
export async function readReaderDocumentCache(
  reader: ReaderRuntime,
  preferences: PreferenceStore,
  current: () => boolean,
): Promise<ReaderCachedDocument | null> {
  if (!current() || !reader.itemID) return null;
  const key = selectedDocumentCacheKey(preferences);
  const pdf = await analysisPDF(reader.itemID);
  if (!current()) return null;
  const pages = await readerDocumentPageGeometry(reader, current);
  if (!current()) return null;
  const source = {
    fingerprint: pdf.fingerprint,
    fileName: pdf.fileName,
    pages: nativeDocumentPages({ pages }),
  };
  const cached = await attachmentDocumentCache(reader.itemID).read(source, key);
  if (!cached || !current()) return null;
  const isCurrent = async (): Promise<boolean> =>
    current() &&
    documentCacheSlot(selectedDocumentCacheKey(preferences)) === documentCacheSlot(key) &&
    (await pdf.isCurrent()) &&
    current();
  return (await isCurrent()) ? { parsed: cached.parsed, isCurrent } : null;
}
