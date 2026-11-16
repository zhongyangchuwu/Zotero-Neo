import { readReferenceCache, writeReferenceCache } from '../platform/reference-cache';
import type { ScholarlyLookupResult, ScholarlyPaper, ScholarlySource } from './contracts';
import { normalizeArxiv, normalizeDOI } from './identifiers';
import { matchesScholarlyQuery } from './query';

type CachedResult = Extract<ScholarlyLookupResult, { kind: 'found' | 'candidates' }>;
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

const sources: readonly ScholarlySource[] = ['semantic-scholar', 'arxiv', 'crossref', 'inspire'];
function optionalFields(value: Record<string, unknown>): boolean {
  const optionalText = (v: unknown) =>
    v === undefined || (typeof v === 'string' && v.length <= 1000);
  if (!optionalText(value.citekey)) return false;
  if (value.version !== undefined) {
    if (!record(value.version)) return false;
    const version = value.version;
    if (!['id', 'updated', 'published'].every((key) => optionalText(version[key]))) return false;
  }
  if (value.bibliography !== undefined) {
    if (!record(value.bibliography)) return false;
    const bibliography = value.bibliography;
    if (
      !['date', 'volume', 'issue', 'pages', 'publisher'].every((key) =>
        optionalText(bibliography[key]),
      )
    )
      return false;
    if (
      bibliography.creators !== undefined &&
      (!Array.isArray(bibliography.creators) ||
        bibliography.creators.length > 1000 ||
        !bibliography.creators.every(
          (creator) =>
            record(creator) &&
            typeof creator.firstName === 'string' &&
            typeof creator.lastName === 'string' &&
            creator.firstName.length <= 1000 &&
            creator.lastName.length <= 1000,
        ))
    )
      return false;
  }
  return true;
}
function paper(value: unknown): value is ScholarlyPaper {
  if (!record(value)) return false;
  const nullableString = (v: unknown) =>
    v === null || (typeof v === 'string' && v.length <= 100000);
  const nullableCount = (v: unknown) =>
    v === null || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
  return (
    sources.includes(value.source as ScholarlySource) &&
    optionalFields(value) &&
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
  const separator = key.indexOf(':');
  const source = key.slice(0, separator);
  const identity = key.slice(separator + 1);
  const papers = value.kind === 'found' ? [value.paper] : value.papers;
  if (!sources.includes(source as ScholarlySource) || papers.some((p) => p.source !== source))
    return false;
  if (identity.startsWith('doi:')) {
    const doi = identity.slice(4);
    return (
      normalizeDOI(doi) === doi &&
      (value.kind !== 'found' || matchesScholarlyQuery({ text: '', doi }, value.paper))
    );
  }
  if (identity.startsWith('arxiv:')) {
    const arxivID = identity.slice(6);
    return (
      normalizeArxiv(arxivID) === arxivID &&
      (value.kind !== 'found' || matchesScholarlyQuery({ text: '', arxivID }, value.paper))
    );
  }
  if (identity.startsWith('identifiers:')) {
    try {
      const ids: unknown = JSON.parse(identity.slice(12));
      if (
        !record(ids) ||
        typeof ids.doi !== 'string' ||
        normalizeDOI(ids.doi) !== ids.doi ||
        typeof ids.arxivID !== 'string' ||
        normalizeArxiv(ids.arxivID) !== ids.arxivID
      )
        return false;
      const primary =
        source === 'arxiv' ? { text: '', arxivID: ids.arxivID } : { text: '', doi: ids.doi };
      return (
        value.kind !== 'found' ||
        (matchesScholarlyQuery(primary, value.paper) &&
          matchesScholarlyQuery({ text: '', doi: ids.doi, arxivID: ids.arxivID }, value.paper))
      );
    } catch {
      return false;
    }
  }
  return (
    identity.startsWith('search:') &&
    identity.length > 7 &&
    identity.length <= 20000 &&
    value.kind === 'candidates'
  );
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
      (data.version !== 1 && data.version !== 2) ||
      !Array.isArray(data.entries) ||
      data.entries.length > LIMIT
    )
      throw new Error('Invalid reference cache');
    for (const entry of data.entries) {
      // The old schema had no provider prefix. Recover it only from validated source data.
      if (
        data.version === 1 &&
        Array.isArray(entry) &&
        typeof entry[0] === 'string' &&
        result(entry[1])
      ) {
        const source =
          entry[1].kind === 'found' ? entry[1].paper.source : entry[1].papers[0]!.source;
        const identity = entry[0].startsWith('search:')
          ? `search:${JSON.stringify({ text: entry[0].slice(7) })}`
          : entry[0];
        entry[0] = `${source}:${identity}`;
      }
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        entry[0].length > 20100 ||
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
        ...(p.citekey ? { citekey: p.citekey } : {}),
        ...(p.version
          ? {
              version: {
                ...(p.version.id ? { id: p.version.id } : {}),
                ...(p.version.updated ? { updated: p.version.updated } : {}),
                ...(p.version.published ? { published: p.version.published } : {}),
              },
            }
          : {}),
        ...(p.bibliography
          ? {
              bibliography: {
                ...(p.bibliography.date ? { date: p.bibliography.date } : {}),
                ...(p.bibliography.volume ? { volume: p.bibliography.volume } : {}),
                ...(p.bibliography.issue ? { issue: p.bibliography.issue } : {}),
                ...(p.bibliography.pages ? { pages: p.bibliography.pages } : {}),
                ...(p.bibliography.publisher ? { publisher: p.bibliography.publisher } : {}),
                ...(p.bibliography.creators
                  ? {
                      creators: p.bibliography.creators.map(({ firstName, lastName }) => ({
                        firstName,
                        lastName,
                      })),
                    }
                  : {}),
              },
            }
          : {}),
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
function snapshot(value: CachedResult, extraWarning = warning): ScholarlyLookupResult {
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
): Promise<{ value: ScholarlyLookupResult | null; warning?: string }> {
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
      JSON.stringify({ version: 2, entries: [...entries] }).length > 3 * 1024 * 1024
    )
      entries.delete(entries.keys().next().value!);
    if (entries.size > LIMIT) entries.delete(entries.keys().next().value!);
    try {
      await writeReferenceCache(
        JSON.stringify({ version: 2, entries: [...entries] }),
        () => generation === current && valid(),
      );
      if (generation !== current || !valid()) {
        entries.clear();
        for (const [oldKey, oldValue] of previous) entries.set(oldKey, oldValue);
        if (generation === current)
          await writeReferenceCache(JSON.stringify({ version: 2, entries: [...entries] }));
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
      await writeReferenceCache(JSON.stringify({ version: 2, entries: [] }));
      warning = undefined;
    } catch {
      warning = 'Reference cache could not be cleared';
      throw new Error(warning);
    }
  });
}
