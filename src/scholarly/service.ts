import { readReferenceKey } from '../platform/reference-credentials';
import { createReferenceAbortController, referenceRequest } from '../platform/reference-http';
import {
  cacheGeneration,
  clearReferenceCache,
  readCachedReference,
  saveCachedReference,
} from './cache';
import {
  ScholarlyError,
  type ScholarlyMetadataService,
  type ScholarlyLookupResult,
  type ScholarlySource,
} from './contracts';
import { extractScholarlyQuery, matchesScholarlyQuery, scholarlySearchText } from './query';
import { admitScholarlyRequest } from './rate';
import { semanticScholarAdapter } from './adapters/semantic-scholar';
import { arxivAdapter } from './adapters/arxiv';
import { crossrefAdapter } from './adapters/crossref';
import { inspireAdapter } from './adapters/inspire';
import type { ScholarlyAdapter } from './adapters/common';

const adapters: Record<ScholarlySource, ScholarlyAdapter> = {
  'semantic-scholar': semanticScholarAdapter,
  arxiv: arxivAdapter,
  crossref: crossrefAdapter,
  inspire: inspireAdapter,
};
const sources: ScholarlyMetadataService['sources'] = [
  { id: 'semantic-scholar', label: 'Semantic Scholar', capabilities: ['lookup', 'search'] },
  { id: 'arxiv', label: 'arXiv', capabilities: ['lookup', 'search', 'version'] },
  { id: 'crossref', label: 'Crossref', capabilities: ['lookup', 'search'] },
  { id: 'inspire', label: 'INSPIRE', capabilities: ['lookup', 'search'] },
];

/** Application-owned: Reader controllers cancel their own lookups, not this shared service. */
export function createScholarlyMetadataService(): ScholarlyMetadataService {
  const active = new Set<AbortController>();
  let disposed = false;
  return {
    sources,
    async lookup(input, signal, options) {
      if (disposed || signal.aborted) throw new Error('Reference lookup cancelled');
      const query = extractScholarlyQuery(input);
      const source = options?.source ?? (query.arxivID ? 'arxiv' : 'semantic-scholar');
      const adapter = Object.hasOwn(adapters, source) ? adapters[source] : undefined;
      if (!adapter) throw new ScholarlyError('unsupported', source, 'Unsupported scholarly source');
      if (!query.doi && !query.arxivID && !scholarlySearchText(query)) return { kind: 'not-found' };
      const request = adapter.request(query);
      // Verify the sent identifier and reject conflicting identifiers supplied alongside it.
      const identity =
        source === 'arxiv' && query.arxivID
          ? { text: '', arxivID: query.arxivID }
          : query.doi
            ? { text: '', doi: query.doi }
            : query.arxivID
              ? { text: '', arxivID: query.arxivID }
              : query;
      const key =
        request.exact && query.doi && query.arxivID
          ? `identifiers:${JSON.stringify({ doi: query.doi, arxivID: query.arxivID })}`
          : request.exact && identity.doi
            ? `doi:${identity.doi}`
            : request.exact && identity.arxivID
              ? `arxiv:${identity.arxivID}`
              : `search:${JSON.stringify({ text: query.text, title: query.title, authors: query.authors, year: query.year, venue: query.venue, arxivID: query.arxivID })}`;
      const cacheKey = `${source}:${key}`;
      const generation = cacheGeneration();
      const cached = await readCachedReference(cacheKey);
      if (generation !== cacheGeneration()) throw new Error('Reference cache cleared');
      if (disposed || signal.aborted) throw new Error('Reference lookup cancelled');
      if (options?.mode !== 'refresh' && cached.value) return cached.value;
      if (options?.mode === 'cache-only')
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
        const response = await admitScholarlyRequest(source, controller.signal, async () => {
          let credential = '';
          if (source === 'semantic-scholar') {
            try {
              credential = readReferenceKey();
            } catch {
              throw new ScholarlyError(
                'auth',
                source,
                'Semantic Scholar credential is unavailable',
              );
            }
          }
          try {
            return await referenceRequest(request.url, credential, controller.signal);
          } catch {
            throw new ScholarlyError('network', source, 'Reference service request failed');
          }
        });
        if (response.status === 401 || response.status === 403)
          throw new ScholarlyError(
            'auth',
            source,
            `Reference service authorization failed (${response.status})`,
          );
        if (response.status === 429)
          throw new ScholarlyError('rate', source, 'Reference service rate limited (429)');
        if (response.status !== 404 && (response.status < 200 || response.status >= 300))
          throw new ScholarlyError(
            'network',
            source,
            `Reference service returned HTTP ${response.status}`,
          );
        const papers =
          response.status === 404
            ? []
            : adapter.decode(response.text, request.exact, new Date().toISOString());
        const matching = request.exact
          ? papers.filter(
              (paper) =>
                matchesScholarlyQuery(identity, paper) && matchesScholarlyQuery(query, paper),
            )
          : [];
        const result: ScholarlyLookupResult =
          papers.length === 0
            ? { kind: 'not-found' }
            : matching.length === 1
              ? { kind: 'found', paper: matching[0]! }
              : { kind: 'candidates', papers };
        if (controller.signal.aborted || disposed) throw new Error('Reference lookup cancelled');
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
        if (error instanceof ScholarlyError) throw error;
        throw new ScholarlyError(
          'decode',
          source,
          error instanceof Error ? error.message : 'Invalid scholarly response',
        );
      } finally {
        active.delete(controller);
        signal.removeEventListener('abort', abort);
      }
    },
    clearCache: clearReferenceCache,
    dispose() {
      disposed = true;
      for (const controller of active) controller.abort();
      active.clear();
    },
  };
}
