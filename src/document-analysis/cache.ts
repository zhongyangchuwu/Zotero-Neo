import {
  documentRect,
  record,
  type DocumentCacheKey,
  type DocumentRegion,
  type DocumentSource,
  type ParsedDocument,
} from './contracts';

export interface CachedDocument {
  readonly savedAt: number;
  readonly parsed: ParsedDocument;
}

export interface DocumentResultCache {
  read(source: DocumentSource, key: DocumentCacheKey): Promise<CachedDocument | null>;
  /** Recheck both source and invocation immediately before committing a prepared file. */
  write(
    source: DocumentSource,
    key: DocumentCacheKey,
    parsed: ParsedDocument,
    current: () => Promise<boolean>,
  ): Promise<boolean>;
}

interface CacheRecord extends CachedDocument {
  readonly cacheVersion: 1;
  readonly key: DocumentCacheKey;
}

const KINDS = new Set([
  'text',
  'heading',
  'caption',
  'image',
  'table',
  'formula',
  'list',
  'code',
  'footnote',
  'references',
  'header',
  'footer',
  'other',
]);
const FORMATS = new Set(['text', 'html', 'latex', 'markdown']);
const FLOWS = new Set(['body', 'auxiliary', 'excluded']);

/** Canonical identity excludes API credentials; providers supply explicit result-affecting settings. */
export function documentCacheSlot(key: DocumentCacheKey): string {
  return JSON.stringify([key.backend, key.adapterVersion, key.configuration]);
}

function cachedRegion(value: unknown, source: DocumentSource): DocumentRegion | null {
  const region = record(value);
  if (!region || typeof region.pageIndex !== 'number' || !Number.isInteger(region.pageIndex))
    return null;
  const page = source.pages[region.pageIndex];
  const rect = documentRect(region.rect);
  if (
    !page ||
    !rect ||
    typeof region.id !== 'string' ||
    !region.id ||
    typeof region.text !== 'string' ||
    typeof region.kind !== 'string' ||
    !KINDS.has(region.kind) ||
    typeof region.format !== 'string' ||
    !FORMATS.has(region.format) ||
    typeof region.flow !== 'string' ||
    !FLOWS.has(region.flow) ||
    region.anchorPrecision !== 'region'
  )
    return null;
  if (
    rect[0] < page.viewBox[0] - 0.01 ||
    rect[1] < page.viewBox[1] - 0.01 ||
    rect[2] > page.viewBox[2] + 0.01 ||
    rect[3] > page.viewBox[3] + 0.01
  )
    return null;
  const block = record(region.sourceBlock);
  if (
    region.sourceBlock !== undefined &&
    (!block ||
      typeof block.id !== 'string' ||
      !block.id ||
      typeof block.order !== 'number' ||
      !Number.isInteger(block.order) ||
      block.order < 0)
  )
    return null;
  return {
    id: region.id,
    pageIndex: region.pageIndex,
    rect,
    text: region.text,
    kind: region.kind as DocumentRegion['kind'],
    format: region.format as DocumentRegion['format'],
    flow: region.flow as DocumentRegion['flow'],
    anchorPrecision: 'region',
    ...(block ? { sourceBlock: { id: block.id as string, order: block.order as number } } : {}),
  };
}

/** Treat disk data as untrusted: admit a complete current geometry set, then project known fields only. */
export function readDocumentCacheRecord(
  value: unknown,
  source: DocumentSource,
  key: DocumentCacheKey,
): CachedDocument | null {
  const entry = record(value),
    savedKey = record(entry?.key),
    parsed = record(entry?.parsed);
  if (
    entry?.cacheVersion !== 1 ||
    !savedKey ||
    savedKey.backend !== key.backend ||
    savedKey.adapterVersion !== key.adapterVersion ||
    savedKey.configuration !== key.configuration ||
    typeof entry.savedAt !== 'number' ||
    !Number.isFinite(entry.savedAt) ||
    entry.savedAt < 0 ||
    !parsed ||
    parsed.schemaVersion !== 1 ||
    parsed.sourceFingerprint !== source.fingerprint ||
    parsed.backend !== key.backend ||
    (parsed.modelRevision !== null && typeof parsed.modelRevision !== 'string') ||
    typeof parsed.durationMs !== 'number' ||
    !Number.isFinite(parsed.durationMs) ||
    parsed.durationMs < 0 ||
    !Array.isArray(parsed.pages) ||
    parsed.pages.length !== source.pages.length ||
    !Array.isArray(parsed.regions) ||
    parsed.regions.length > 100_000
  )
    return null;
  for (const [index, value] of parsed.pages.entries()) {
    const page = record(value),
      expected = source.pages[index]!;
    const box = documentRect(page?.viewBox);
    if (
      !page ||
      page.pageIndex !== expected.pageIndex ||
      page.rotation !== expected.rotation ||
      !box ||
      box.some((coordinate, i) => coordinate !== expected.viewBox[i])
    )
      return null;
  }
  const regions: DocumentRegion[] = [];
  const ids = new Set<string>();
  for (const value of parsed.regions) {
    const region = cachedRegion(value, source);
    if (!region || ids.has(region.id)) return null;
    regions.push(region);
    ids.add(region.id);
  }
  return {
    savedAt: entry.savedAt,
    parsed: {
      schemaVersion: 1,
      sourceFingerprint: source.fingerprint,
      backend: key.backend,
      modelRevision: parsed.modelRevision as string | null,
      durationMs: parsed.durationMs,
      pages: source.pages,
      regions,
    },
  };
}

/** Persist parser output only; callers recompute derived groups using current feature policy. */
export function documentCacheRecord(
  source: DocumentSource,
  key: DocumentCacheKey,
  parsed: ParsedDocument,
): CacheRecord {
  const savedAt = Date.now();
  const candidate = { cacheVersion: 1, key, savedAt, parsed };
  const admitted = readDocumentCacheRecord(candidate, source, key);
  if (!admitted) throw new Error('Document result cannot be cached');
  return {
    cacheVersion: 1,
    key: {
      backend: key.backend,
      adapterVersion: key.adapterVersion,
      configuration: key.configuration,
    },
    ...admitted,
  };
}
