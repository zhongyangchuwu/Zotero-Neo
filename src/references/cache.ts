import { readReferenceCache, writeReferenceCache } from '../platform/reference-cache';
import type { ReferenceLookupResult, ScholarlyPaper } from './contracts';
import { normalizeArxiv, normalizeDOI } from './identifiers';

type CachedResult = Extract<ReferenceLookupResult, { kind: 'found' | 'candidates' }>;
const LIMIT = 50;
const AGE = 30 * 60 * 1000;
const entries = new Map<string, CachedResult>();
let loaded = false;
let generation = 0;
let queue: Promise<unknown> = Promise.resolve();
let warning: string | undefined;

function serial<T>(operation: () => Promise<T>): Promise<T> {
  const task = queue.catch(() => {}).then(operation);
  queue = task;
  return task;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function paper(value: unknown): value is ScholarlyPaper {
  if (!record(value)) return false;
  const nullableString = (v: unknown) =>
    v === null || (typeof v === 'string' && v.length <= 100000);
  const nullableCount = (v: unknown) =>
    v === null || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
  return (
    (value.source === 'semantic-scholar' || value.source === 'arxiv') &&
    typeof value.sourceID === 'string' &&
    value.sourceID.length > 0 &&
    value.sourceID.length <= 512 &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    value.title.length <= 100000 &&
    Array.isArray(value.authors) &&
    value.authors.length <= 1000 &&
    value.authors.every((v) => typeof v === 'string' && v.length <= 1000) &&
    nullableCount(value.year) &&
    nullableCount(value.referenceCount) &&
    nullableCount(value.citationCount) &&
    nullableString(value.venue) &&
    nullableString(value.abstract) &&
    (value.doi === null ||
      (typeof value.doi === 'string' && normalizeDOI(value.doi) === value.doi)) &&
    (value.arxivID === null ||
      (typeof value.arxivID === 'string' && normalizeArxiv(value.arxivID) === value.arxivID)) &&
    (value.source !== 'arxiv' || (value.arxivID !== null && value.sourceID === value.arxivID)) &&
    (value.url === null ||
      (typeof value.url === 'string' &&
        /^https?:\/\//iu.test(value.url) &&
        value.url.length <= 100000)) &&
    (value.pdfURL === null ||
      (typeof value.pdfURL === 'string' &&
        /^https?:\/\//iu.test(value.pdfURL) &&
        value.pdfURL.length <= 100000)) &&
    typeof value.retrievedAt === 'string' &&
    Number.isFinite(Date.parse(value.retrievedAt))
  );
}
function result(value: unknown): value is CachedResult {
  return (
    record(value) &&
    ((value.kind === 'found' && paper(value.paper)) ||
      (value.kind === 'candidates' &&
        Array.isArray(value.papers) &&
        value.papers.length > 0 &&
        value.papers.length <= 10 &&
        value.papers.every(paper)))
  );
}

/** An exact cached result must preserve the identifier admission used by the network decoder. */
function matchesKey(key: string, value: CachedResult): boolean {
  if (key.startsWith('doi:')) {
    const doi = key.slice(4);
    return normalizeDOI(doi) === doi && (value.kind !== 'found' || value.paper.doi === doi);
  }
  if (key.startsWith('arxiv:')) {
    const arxiv = key.slice(6);
    if (normalizeArxiv(arxiv) !== arxiv || value.kind !== 'found' || value.paper.source !== 'arxiv')
      return false;
    return (
      value.paper.arxivID === arxiv ||
      (!/v\d+$/u.test(arxiv) && value.paper.arxivID?.replace(/v\d+$/u, '') === arxiv)
    );
  }
  if (!key.startsWith('search:')) return false;
  const term = key.slice(7);
  return term.length > 0 && term.length <= 4096 && term.trim() === term;
}
async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await readReferenceCache();
    if (raw === null) return;
    const data: unknown = JSON.parse(raw);
    if (
      !record(data) ||
      data.version !== 1 ||
      !Array.isArray(data.entries) ||
      data.entries.length > LIMIT
    )
      throw new Error('Invalid reference cache');
    for (const entry of data.entries) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        entry[0].length > 4103 ||
        !result(entry[1]) ||
        !matchesKey(entry[0], entry[1])
      ) {
        warning = 'Reference cache contains invalid data';
        continue;
      }
      // Select only the validated schema, never persist unknown fields from disk.
      const cleanPaper = (p: ScholarlyPaper): ScholarlyPaper => ({
        source: p.source,
        sourceID: p.sourceID,
        title: p.title,
        authors: p.authors,
        year: p.year,
        venue: p.venue,
        abstract: p.abstract,
        doi: p.doi,
        arxivID: p.arxivID,
        url: p.url,
        pdfURL: p.pdfURL,
        referenceCount: p.referenceCount,
        citationCount: p.citationCount,
        retrievedAt: p.retrievedAt,
      });
      const value = entry[1];
      entries.set(
        entry[0],
        value.kind === 'found'
          ? { kind: 'found', paper: cleanPaper(value.paper) }
          : { kind: 'candidates', papers: value.papers.map(cleanPaper) },
      );
    }
  } catch {
    warning = 'Reference cache could not be read';
  }
}
function snapshot(value: CachedResult, extraWarning = warning): ReferenceLookupResult {
  const papers = value.kind === 'found' ? [value.paper] : value.papers;
  return {
    ...value,
    cache: {
      origin: 'cached',
      stale: papers.some((p) => Date.now() - Date.parse(p.retrievedAt) >= AGE),
      ...(extraWarning ? { warning: extraWarning } : {}),
    },
  };
}
export function cacheGeneration(): number {
  return generation;
}
export function readCachedReference(
  key: string,
): Promise<{ value: ReferenceLookupResult | null; warning?: string }> {
  return serial(async () => {
    await load();
    const value = entries.get(key);
    return { value: value ? snapshot(value) : null, ...(warning ? { warning } : {}) };
  });
}
export function saveCachedReference(
  key: string,
  value: CachedResult,
  current: number,
  valid: () => boolean,
): Promise<string | undefined> {
  return serial(async () => {
    await load();
    if (!result(value) || !matchesKey(key, value)) return 'Reference metadata could not be cached';
    if (generation !== current || !valid()) return undefined;
    const previous = new Map(entries);
    entries.delete(key);
    entries.set(key, value);
    while (
      entries.size > 1 &&
      JSON.stringify({ version: 1, entries: [...entries] }).length > 3 * 1024 * 1024
    )
      entries.delete(entries.keys().next().value!);
    if (entries.size > LIMIT) entries.delete(entries.keys().next().value!);
    try {
      await writeReferenceCache(
        JSON.stringify({ version: 1, entries: [...entries] }),
        () => generation === current && valid(),
      );
      if (generation !== current || !valid()) {
        entries.clear();
        for (const [oldKey, oldValue] of previous) entries.set(oldKey, oldValue);
        if (generation === current)
          await writeReferenceCache(JSON.stringify({ version: 1, entries: [...entries] }));
        return undefined;
      }
      warning = undefined;
      return undefined;
    } catch {
      if (generation !== current || !valid()) {
        entries.clear();
        for (const [oldKey, oldValue] of previous) entries.set(oldKey, oldValue);
      }
      warning = 'Reference cache could not be saved';
      return warning;
    }
  });
}
export function clearReferenceCache(): Promise<void> {
  generation++;
  return serial(async () => {
    await load();
    entries.clear();
    try {
      await writeReferenceCache(JSON.stringify({ version: 1, entries: [] }));
      warning = undefined;
    } catch {
      warning = 'Reference cache could not be cleared';
      throw new Error(warning);
    }
  });
}
