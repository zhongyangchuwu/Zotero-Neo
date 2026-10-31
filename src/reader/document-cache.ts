import type { PreferenceStore } from '../core/preference-store';
import type { DocumentRegion, ParsedDocument } from '../document-analysis/contracts';
import { documentCacheSlot } from '../document-analysis/cache';
import {
  nativeDocumentPages,
  nativeParsedDocument,
  nativeDocumentTextRegions,
} from '../document-analysis/native';
import { analysisPDF } from '../platform/document-analysis';
import { attachmentDocumentCache } from '../platform/document-analysis-cache';
import {
  readerDocumentPageGeometry,
  structuredDocumentData,
  type ReaderRuntime,
} from '../toolkit/reader';
import { selectedDocumentCacheKey } from '../document-analysis/settings';

export interface ReaderCachedDocument {
  readonly parsed: ParsedDocument;
  /** Admission is tied to this source revision, selected service, and Reader ownership. */
  isCurrent(): Promise<boolean>;
}

export interface ReaderDocumentSnapshot extends ReaderCachedDocument {
  readonly origin: 'cache' | 'native';
  readonly textRegions: readonly DocumentRegion[];
}

/** Native extraction is explicit and validates the same PDF revision before exposing normalized structure. */
export async function readNativeReaderDocument(
  reader: ReaderRuntime,
  current: () => boolean,
): Promise<ReaderDocumentSnapshot | null> {
  if (!current() || !reader.itemID) return null;
  const pdf = await analysisPDF(reader.itemID);
  if (!current()) return null;
  const data = await structuredDocumentData(reader.itemID, current);
  if (!current() || !data) return null;
  const source = {
    fingerprint: pdf.fingerprint,
    fileName: pdf.fileName,
    pages: nativeDocumentPages(data.catalog),
  };
  const parsed = nativeParsedDocument(source, data);
  const isCurrent = async (): Promise<boolean> => current() && (await pdf.isCurrent()) && current();
  return (await isCurrent())
    ? { parsed, origin: 'native', textRegions: nativeDocumentTextRegions(data), isCurrent }
    : null;
}

/** Selection, chapter search and notes share one cache-first structure contract; this never uploads. */
export async function readReaderDocument(
  reader: ReaderRuntime,
  preferences: PreferenceStore,
  current: () => boolean,
): Promise<ReaderDocumentSnapshot | null> {
  const cached = await readReaderDocumentCache(reader, preferences, current);
  if (!current()) return null;
  return cached
    ? { ...cached, origin: 'cache', textRegions: cached.parsed.regions }
    : readNativeReaderDocument(reader, current);
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
