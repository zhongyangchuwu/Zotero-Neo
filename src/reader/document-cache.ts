import type { PreferenceStore } from '../core/preference-store';
import type { DocumentRegion, ParsedDocument } from '../document-analysis/contracts';
import { documentCacheSlot } from '../document-analysis/cache';
import {
  nativeDocumentPages,
  nativeParsedDocument,
  nativeDocumentTextRegions,
} from '../document-analysis/native';
import { localDocumentCacheKey, localDocumentParser } from '../document-analysis/local';
import { analyzeDocument } from '../document-analysis/analyze';
import { documentPreparationAbort } from '../platform/document-preparation';
import { analysisPDF } from '../platform/document-analysis';
import {
  attachmentDocumentCache,
  attachmentDocumentRevision,
} from '../platform/document-analysis-cache';
import { readAttachmentDocumentCorrections } from '../platform/document-corrections';
import {
  applyDocumentCorrections,
  correctedNativeTextRegions,
  NATIVE_CORRECTION_KEY,
} from '../document-analysis/corrections';
import {
  readerDocumentPageGeometry,
  pdfSourceFigurePages,
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
  readonly origin: 'cache' | 'native' | 'local';
  readonly textRegions: readonly DocumentRegion[];
}

/** Native extraction is explicit and validates the same PDF revision before exposing normalized structure. */
export async function readNativeReaderDocument(
  reader: ReaderRuntime,
  current: () => boolean,
): Promise<ReaderDocumentSnapshot | null> {
  if (!current() || !reader.itemID) return null;
  const revision = attachmentDocumentRevision(reader.itemID);
  const pdf = await analysisPDF(reader.itemID);
  if (!current()) return null;
  const data = await structuredDocumentData(reader.itemID, current);
  if (!current() || !data) return null;
  const source = {
    fingerprint: pdf.fingerprint,
    fileName: pdf.fileName,
    pages: nativeDocumentPages(data.catalog),
  };
  const raw = nativeParsedDocument(source, data);
  const corrections = await readAttachmentDocumentCorrections(
    reader.itemID,
    raw,
    NATIVE_CORRECTION_KEY,
  );
  const parsed = applyDocumentCorrections(raw, corrections);
  const isCurrent = async (): Promise<boolean> =>
    current() &&
    revision === attachmentDocumentRevision(reader.itemID!) &&
    (await pdf.isCurrent()) &&
    current() &&
    revision === attachmentDocumentRevision(reader.itemID!);
  return (await isCurrent())
    ? {
        parsed,
        origin: 'native',
        textRegions: correctedNativeTextRegions(nativeDocumentTextRegions(data), parsed),
        isCurrent,
      }
    : null;
}

/** Prepare model-free structure on demand; the explicit comparison action owns persistent cache commits. */
export async function readLocalReaderDocument(
  reader: ReaderRuntime,
  current: () => boolean,
): Promise<ReaderDocumentSnapshot | null> {
  const itemID = reader.itemID;
  if (!current() || !itemID) return null;
  const revision = attachmentDocumentRevision(itemID);
  const pdf = await analysisPDF(itemID);
  if (!current()) return null;
  const pages = nativeDocumentPages({ pages: await readerDocumentPageGeometry(reader, current) });
  if (!current()) return null;
  const source = { fingerprint: pdf.fingerprint, fileName: pdf.fileName, pages };
  const isCurrent = async (): Promise<boolean> =>
    current() &&
    reader.itemID === itemID &&
    revision === attachmentDocumentRevision(itemID) &&
    (await pdf.isCurrent()) &&
    current() &&
    revision === attachmentDocumentRevision(itemID);
  const abort = documentPreparationAbort();
  const parsed: ParsedDocument = await analyzeDocument(
    localDocumentParser((signal) =>
      pdfSourceFigurePages(() => pdf.read(), signal, pages.length, current),
    ),
    source,
    { signal: abort.signal },
  );
  if (!(await isCurrent())) return null;
  const key = localDocumentCacheKey();
  const corrections = await readAttachmentDocumentCorrections(itemID, parsed, key);
  const effective = applyDocumentCorrections(parsed, corrections);
  return (await isCurrent())
    ? { parsed: effective, origin: 'local', textRegions: effective.regions, isCurrent }
    : null;
}

/** Selection, chapter search and notes share one cache-first structure contract; this never uploads. */
export async function readReaderDocument(
  reader: ReaderRuntime,
  preferences: PreferenceStore,
  current: () => boolean,
): Promise<ReaderDocumentSnapshot | null> {
  const slot = documentCacheSlot(selectedDocumentCacheKey(preferences));
  const sourceCurrent = (): boolean =>
    current() && documentCacheSlot(selectedDocumentCacheKey(preferences)) === slot;
  const cached = await readReaderDocumentCache(reader, preferences, sourceCurrent);
  if (!sourceCurrent()) return null;
  if (cached) return { ...cached, origin: 'cache', textRegions: cached.parsed.regions };
  return selectedDocumentCacheKey(preferences).backend === 'local-rules'
    ? readLocalReaderDocument(reader, sourceCurrent)
    : readNativeReaderDocument(reader, sourceCurrent);
}

/** Reader features share the selected service's validated cache; this path never uploads or runs SDT. */
export async function readReaderDocumentCache(
  reader: ReaderRuntime,
  preferences: PreferenceStore,
  current: () => boolean,
): Promise<ReaderCachedDocument | null> {
  if (!current() || !reader.itemID) return null;
  const revision = attachmentDocumentRevision(reader.itemID);
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
  const corrections = await readAttachmentDocumentCorrections(reader.itemID, cached.parsed, key);
  const isCurrent = async (): Promise<boolean> =>
    current() &&
    revision === attachmentDocumentRevision(reader.itemID!) &&
    documentCacheSlot(selectedDocumentCacheKey(preferences)) === documentCacheSlot(key) &&
    (await pdf.isCurrent()) &&
    current() &&
    documentCacheSlot(selectedDocumentCacheKey(preferences)) === documentCacheSlot(key) &&
    revision === attachmentDocumentRevision(reader.itemID!);
  return (await isCurrent())
    ? { parsed: applyDocumentCorrections(cached.parsed, corrections), isCurrent }
    : null;
}
