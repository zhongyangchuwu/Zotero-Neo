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
import {
  LOCAL_RULES_KEY,
  selectedDocumentCacheKey,
  selectedLocalRuleProfile,
} from '../document-analysis/settings';
import {
  DEFAULT_LOCAL_RULE_PROFILE,
  type LocalRuleProfile,
} from '../document-analysis/local-rules';

export interface ReaderCachedDocument {
  readonly parsed: ParsedDocument;
  /** Admission is tied to this source revision, selected service, and Reader ownership. */
  isCurrent(): Promise<boolean>;
}

export interface ReaderDocumentSnapshot extends ReaderCachedDocument {
  readonly origin: 'cache' | 'native' | 'local';
  readonly textRegions: readonly DocumentRegion[];
}

/** Raw edits retire snapshots even when a later lookup can reuse the same canonical cache slot. */
function configurationCurrent(preferences: PreferenceStore, current: () => boolean): () => boolean {
  const slot = documentCacheSlot(selectedDocumentCacheKey(preferences));
  const rules = preferences.get(LOCAL_RULES_KEY, '');
  return () => {
    if (!current() || preferences.get(LOCAL_RULES_KEY, '') !== rules) return false;
    try {
      return documentCacheSlot(selectedDocumentCacheKey(preferences)) === slot;
    } catch {
      // A retired snapshot is not the error boundary for a newly invalid configuration.
      return false;
    }
  };
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
  profile: LocalRuleProfile = DEFAULT_LOCAL_RULE_PROFILE,
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
    localDocumentParser(
      (signal) => pdfSourceFigurePages(() => pdf.read(), signal, pages.length, current),
      profile,
    ),
    source,
    { signal: abort.signal },
  );
  if (!(await isCurrent())) return null;
  const key = localDocumentCacheKey(profile);
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
  const sourceCurrent = configurationCurrent(preferences, current);
  const key = selectedDocumentCacheKey(preferences);
  const profile = key.backend === 'local-rules' ? selectedLocalRuleProfile(preferences) : undefined;
  const cached = await readReaderDocumentCache(reader, preferences, sourceCurrent);
  if (!sourceCurrent()) return null;
  if (cached) return { ...cached, origin: 'cache', textRegions: cached.parsed.regions };
  return key.backend === 'local-rules'
    ? readLocalReaderDocument(reader, sourceCurrent, profile)
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
  const sourceCurrent = configurationCurrent(preferences, current);
  const pdf = await analysisPDF(reader.itemID);
  if (!sourceCurrent()) return null;
  const pages = await readerDocumentPageGeometry(reader, sourceCurrent);
  if (!sourceCurrent()) return null;
  const source = {
    fingerprint: pdf.fingerprint,
    fileName: pdf.fileName,
    pages: nativeDocumentPages({ pages }),
  };
  const cached = await attachmentDocumentCache(reader.itemID).read(source, key);
  if (!cached || !sourceCurrent()) return null;
  const corrections = await readAttachmentDocumentCorrections(reader.itemID, cached.parsed, key);
  const isCurrent = async (): Promise<boolean> =>
    sourceCurrent() &&
    revision === attachmentDocumentRevision(reader.itemID!) &&
    (await pdf.isCurrent()) &&
    sourceCurrent() &&
    revision === attachmentDocumentRevision(reader.itemID!);
  return (await isCurrent())
    ? { parsed: applyDocumentCorrections(cached.parsed, corrections), isCurrent }
    : null;
}
