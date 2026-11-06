import { changeReferenceKey, readReferenceKey } from '../platform/reference-credentials';
import {
  createReferenceAbortController,
  parseReferenceXML,
  referenceRequest,
} from '../platform/reference-http';
import type { ReferenceLookupResult, ReferenceMetadataService, ScholarlyPaper } from './contracts';
import { normalizeArxiv, normalizeDOI } from './identifiers';
import {
  cacheGeneration,
  clearReferenceCache,
  readCachedReference,
  saveCachedReference,
} from './cache';

const FIELDS =
  'title,authors,year,venue,abstract,url,externalIds,openAccessPdf,referenceCount,citationCount';
const S2 = 'https://api.semanticscholar.org/graph/v1/paper/';
const ARXIV = 'https://export.arxiv.org/api/query?id_list=';
type Provider = 's2' | 'arxiv';
interface WaitingRequest {
  signal: AbortSignal;
  resolve(started: () => void): void;
  cancel(): void;
}
interface ProviderGate {
  lastStart: number | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  queue: WaitingRequest[];
}
const gates: Record<Provider, ProviderGate> = {
  s2: { lastStart: null, timer: undefined, queue: [] },
  arxiv: { lastStart: null, timer: undefined, queue: [] },
};

function scheduleAdmission(provider: Provider): void {
  const gate = gates[provider];
  clearTimeout(gate.timer);
  gate.timer = undefined;
  if (!gate.queue.length) return;
  const interval = provider === 'arxiv' ? 3000 : 1000;
  const wait = gate.lastStart === null ? 0 : Math.max(0, gate.lastStart + interval - Date.now());
  if (wait) {
    gate.timer = setTimeout(() => scheduleAdmission(provider), wait);
    return;
  }
  const request = gate.queue.shift()!;
  request.signal.removeEventListener('abort', request.cancel);
  request.resolve(() => {
    gate.lastStart = Date.now();
  });
  scheduleAdmission(provider);
}

function admit<T>(
  provider: Provider,
  signal: AbortSignal,
  start: (started: () => void) => Promise<T>,
): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Reference lookup cancelled'));
  const gate = gates[provider];
  const interval = provider === 'arxiv' ? 3000 : 1000;
  const wait = gate.lastStart === null ? 0 : Math.max(0, gate.lastStart + interval - Date.now());
  if (wait + gate.queue.length * interval > 30000)
    return Promise.reject(new Error('Reference service request queue is full'));
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  const request: WaitingRequest = {
    signal,
    resolve(started) {
      try {
        resolve(start(started));
      } catch (error) {
        reject(error);
      }
    },
    cancel() {
      const index = gate.queue.indexOf(request);
      if (index < 0) return;
      gate.queue.splice(index, 1);
      signal.removeEventListener('abort', request.cancel);
      reject(new Error('Reference lookup cancelled'));
      scheduleAdmission(provider);
    },
  };
  gate.queue.push(request);
  signal.addEventListener('abort', request.cancel, { once: true });
  scheduleAdmission(provider);
  return promise;
}

type ObjectRecord = Record<string, unknown>;
function object(value: unknown): ObjectRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as ObjectRecord) : {};
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/gu, ' ') : null;
}
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
function url(value: unknown): string | null {
  const result = text(value);
  return result && /^https?:\/\//iu.test(result) ? result : null;
}
function semanticPaper(value: unknown, retrievedAt: string): ScholarlyPaper | null {
  const data = object(value);
  const id = text(data.paperId);
  const title = text(data.title);
  if (!id || !title) return null;
  const ids = object(data.externalIds);
  return {
    source: 'semantic-scholar',
    sourceID: id,
    title,
    authors: Array.isArray(data.authors)
      ? data.authors
          .map((author) => text(object(author).name))
          .filter((name): name is string => !!name)
      : [],
    year: count(data.year),
    venue: text(data.venue),
    abstract: text(data.abstract),
    doi: normalizeDOI(text(ids.DOI)),
    arxivID: normalizeArxiv(text(ids.ArXiv)),
    url: url(data.url),
    pdfURL: url(object(data.openAccessPdf).url),
    referenceCount: count(data.referenceCount),
    citationCount: count(data.citationCount),
    retrievedAt,
  };
}
function arxivPaper(xml: string, requested: string, retrievedAt: string): ScholarlyPaper | null {
  const doc = parseReferenceXML(xml);
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid arXiv response');
  const entries = doc.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'entry');
  for (const entry of Array.from(entries)) {
    const element = (name: string): string | null =>
      text(entry.getElementsByTagNameNS('http://www.w3.org/2005/Atom', name)[0]?.textContent);
    const id = normalizeArxiv(element('id'));
    const title = element('title');
    if (
      !id ||
      !title ||
      (id !== requested && (/v\d+$/u.test(requested) || id.replace(/v\d+$/u, '') !== requested))
    )
      continue;
    const published = element('published');
    const authors = Array.from(
      entry.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'author'),
    )
      .map((author) =>
        text(author.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'name')[0]?.textContent),
      )
      .filter((name): name is string => !!name);
    const links = Array.from(entry.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'link'));
    return {
      source: 'arxiv',
      sourceID: id,
      title,
      authors,
      year: published && /^\d{4}/u.test(published) ? Number(published.slice(0, 4)) : null,
      venue: text(
        entry.getElementsByTagNameNS('http://arxiv.org/schemas/atom', 'journal_ref')[0]
          ?.textContent,
      ),
      abstract: element('summary'),
      doi: normalizeDOI(
        text(entry.getElementsByTagNameNS('http://arxiv.org/schemas/atom', 'doi')[0]?.textContent),
      ),
      arxivID: id,
      url: url(element('id')),
      pdfURL: url(links.find((link) => link.getAttribute('title') === 'pdf')?.getAttribute('href')),
      referenceCount: null,
      citationCount: null,
      retrievedAt,
    };
  }
  return null;
}

export function createReferenceMetadataService(): ReferenceMetadataService {
  const active = new Set<AbortController>();
  let disposed = false;
  return {
    async lookup(query, signal, mode) {
      if (disposed || signal.aborted) throw new Error('Reference lookup cancelled');
      const doi = normalizeDOI(query.doi);
      const arxiv = normalizeArxiv(query.arxivID);
      if (
        query.text.length > 4096 ||
        (query.doi?.length ?? 0) > 512 ||
        (query.arxivID?.length ?? 0) > 128
      )
        throw new Error('Reference query is too long');
      const term = query.text.trim();
      if (!doi && !arxiv && !term) return { kind: 'not-found' };
      const provider = arxiv ? 'arxiv' : 's2';
      const cacheKey = arxiv ? `arxiv:${arxiv}` : doi ? `doi:${doi}` : `search:${term}`;
      const generation = cacheGeneration();
      const cached = await readCachedReference(cacheKey);
      if (generation !== cacheGeneration()) throw new Error('Reference cache cleared');
      if (disposed || signal.aborted) throw new Error('Reference lookup cancelled');
      if (mode !== 'refresh' && cached.value) return cached.value;
      if (mode === 'cache-only')
        return {
          kind: 'not-found',
          ...(cached.warning
            ? { cache: { origin: 'cached', stale: false, warning: cached.warning } }
            : {}),
        };
      const controller = createReferenceAbortController();
      const abort = (): void => controller.abort();
      active.add(controller);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      try {
        const endpoint = arxiv
          ? `${ARXIV}${encodeURIComponent(arxiv)}`
          : doi
            ? `${S2}${encodeURIComponent(`DOI:${doi}`)}?fields=${FIELDS}`
            : `${S2}search?query=${encodeURIComponent(term)}&limit=10&fields=${FIELDS}`;
        const response = await admit(provider, controller.signal, (started) => {
          const key = provider === 's2' ? readReferenceKey() : '';
          started();
          return referenceRequest(endpoint, key, controller.signal);
        });
        if (response.status === 429) throw new Error('Reference service rate limited (429)');
        if (response.status === 404) {
          if (cached.value) throw new Error('No metadata found on refresh');
          return { kind: 'not-found' };
        }
        if (response.status < 200 || response.status >= 300)
          throw new Error(`Reference service returned HTTP ${response.status}`);
        const retrievedAt = new Date().toISOString();
        let result: ReferenceLookupResult;
        if (arxiv) {
          const paper = arxivPaper(response.text, arxiv, retrievedAt);
          result = paper ? { kind: 'found', paper } : { kind: 'not-found' };
        } else {
          let parsed: unknown;
          try {
            parsed = JSON.parse(response.text);
          } catch {
            throw new Error('Invalid Semantic Scholar response');
          }
          if (doi) {
            const paper = semanticPaper(parsed, retrievedAt);
            result =
              paper && paper.doi === doi
                ? { kind: 'found', paper }
                : paper
                  ? { kind: 'candidates', papers: [paper] }
                  : { kind: 'not-found' };
          } else {
            const data = object(parsed).data;
            const papers = Array.isArray(data)
              ? data
                  .map((item) => semanticPaper(item, retrievedAt))
                  .filter((paper): paper is ScholarlyPaper => !!paper)
              : [];
            result = papers.length ? { kind: 'candidates', papers } : { kind: 'not-found' };
          }
        }
        if (controller.signal.aborted) throw new Error('Reference lookup cancelled');
        if (result.kind === 'not-found' && cached.value)
          throw new Error('No metadata found on refresh');
        const warning =
          result.kind === 'not-found'
            ? cached.warning
            : await saveCachedReference(
                cacheKey,
                result,
                generation,
                () => !controller.signal.aborted && !disposed,
              );
        if (controller.signal.aborted || disposed) throw new Error('Reference lookup cancelled');
        return result.kind === 'not-found' && !warning
          ? result
          : {
              ...result,
              cache: {
                origin: 'network',
                stale: false,
                ...(warning || cached.warning ? { warning: warning || cached.warning } : {}),
              },
            };
      } catch (error) {
        if (controller.signal.aborted || disposed || signal.aborted)
          throw new Error('Reference lookup cancelled');
        if (cached.value && generation === cacheGeneration())
          return {
            ...cached.value,
            cache: {
              origin: 'cached',
              stale: true,
              warning: error instanceof Error ? error.message : 'Reference refresh failed',
            },
          };
        throw error;
      } finally {
        active.delete(controller);
        signal.removeEventListener('abort', abort);
      }
    },
    clearCache: clearReferenceCache,
    async hasSemanticScholarKey() {
      return !!readReferenceKey();
    },
    async setSemanticScholarKey(key) {
      if (disposed) throw new Error('Reference service disposed');
      const trimmed = key?.trim() ?? '';
      if (key !== null && !trimmed) throw new Error('Semantic Scholar key is empty');
      await changeReferenceKey(key === null ? null : trimmed);
    },
    dispose() {
      disposed = true;
      for (const controller of active) controller.abort();
      active.clear();
    },
  };
}
