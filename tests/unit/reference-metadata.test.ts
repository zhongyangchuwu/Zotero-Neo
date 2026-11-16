import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScholarlyMetadataService,
  extractScholarlyQuery,
  ScholarlyError,
} from '../../src/scholarly';
import { snapshotMetadata } from '../../src/metadata-review/model';

vi.mock('../../src/platform/reference-http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/platform/reference-http')>()),
  referenceRequest: vi.fn(),
}));
vi.mock('../../src/platform/reference-credentials', () => ({
  readReferenceKey: vi.fn(),
}));
vi.mock('../../src/platform/reference-cache', () => ({
  readReferenceCache: vi.fn(async () => null),
  writeReferenceCache: vi.fn(async () => {}),
}));
import { referenceRequest } from '../../src/platform/reference-http';
import { readReferenceKey } from '../../src/platform/reference-credentials';
const request = vi.mocked(referenceRequest);
const readKey = vi.mocked(readReferenceKey);
const signal = () => new AbortController().signal;
const raw = {
  paperId: 'p1',
  title: 'Original title',
  authors: [{ name: 'Ada Example' }],
  year: 2022,
  externalIds: { DOI: '10.1234/ABC' },
  abstract: null,
  citationCount: 3,
};

beforeEach(async () => {
  await createScholarlyMetadataService().clearCache();
  vi.clearAllMocks();
  readKey.mockReturnValue('secret');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('reference metadata', () => {
  it('decodes original fields, preserves missing data and caches exact identifiers', async () => {
    request.mockResolvedValue({ status: 200, text: JSON.stringify(raw) });
    const service = createScholarlyMetadataService();
    expect(readKey).not.toHaveBeenCalled();
    const result = await service.lookup({ text: '', doi: 'https://doi.org/10.1234/abc' }, signal());
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') throw new Error('expected paper');
    expect(result.paper).toMatchObject({
      title: 'Original title',
      authors: ['Ada Example'],
      doi: '10.1234/abc',
      abstract: null,
      venue: null,
      referenceCount: null,
      citationCount: 3,
    });
    const cached = await service.lookup({ text: '', doi: '10.1234/ABC' }, signal());
    expect(cached).toMatchObject({
      kind: 'found',
      paper: result.paper,
      cache: { origin: 'cached' },
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toBe('secret');
    service.dispose();
  });
  it('never auto-selects a text search or a DOI mismatch', async () => {
    request
      .mockResolvedValueOnce({ status: 200, text: JSON.stringify({ data: [raw] }) })
      .mockResolvedValueOnce({ status: 200, text: JSON.stringify(raw) });
    const first = createScholarlyMetadataService();
    expect((await first.lookup({ text: 'some title' }, signal())).kind).toBe('candidates');
    const second = createScholarlyMetadataService();
    expect((await second.lookup({ text: '', doi: '10.1234/different' }, signal())).kind).toBe(
      'candidates',
    );
  });
  it('surfaces 429 without retry or caching failure', async () => {
    request.mockResolvedValue({ status: 429, text: '' });
    const service = createScholarlyMetadataService();
    await expect(service.lookup({ text: '', doi: '10.1234/abc' }, signal())).rejects.toThrow('429');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('cancels pending work on disposal and performs no request for pre-aborted signals', async () => {
    request.mockImplementation(
      (_url, _key, abort) =>
        new Promise((_resolve, reject) =>
          abort.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
        ),
    );
    const service = createScholarlyMetadataService();
    const controller = new AbortController();
    controller.abort();
    await expect(service.lookup({ text: 'x' }, controller.signal)).rejects.toThrow('cancelled');
    expect(request).not.toHaveBeenCalled();
    const incoming = signal();
    const nativeAbortController = AbortController;
    vi.stubGlobal('AbortController', undefined);
    vi.stubGlobal('Components', {
      utils: {
        importGlobalProperties: (properties: string[]) => {
          if (properties.includes('AbortController'))
            vi.stubGlobal('AbortController', nativeAbortController);
        },
      },
    });
    const pending = service.lookup({ text: 'x' }, incoming);
    service.dispose();
    await expect(pending).rejects.toThrow('cancelled');
  });
  it('decodes an arXiv entry and never accesses or sends the Semantic Scholar key', async () => {
    const node = (textContent: string) => ({ textContent });
    const entry = {
      getElementsByTagNameNS: (_namespace: string, name: string) => {
        if (name === 'id') return [node('http://arxiv.org/abs/1706.03762v2')];
        if (name === 'title') return [node('Attention Is All You Need')];
        if (name === 'summary') return [node('Original abstract')];
        if (name === 'published') return [node('2017-06-12T00:00:00Z')];
        if (name === 'updated') return [node('2017-06-19T00:00:00Z')];
        if (name === 'author') return [{ getElementsByTagNameNS: () => [node('Ashish Vaswani')] }];
        if (name === 'link')
          return [
            {
              getAttribute: (attribute: string) =>
                attribute === 'title' ? 'pdf' : 'https://arxiv.org/pdf/1706.03762v2',
            },
          ];
        return [];
      },
    };
    vi.stubGlobal(
      'DOMParser',
      class {
        parseFromString() {
          return { getElementsByTagName: () => [], getElementsByTagNameNS: () => [entry] };
        }
      },
    );
    request.mockResolvedValue({ status: 200, text: '<feed/>' });
    const service = createScholarlyMetadataService();
    const result = await service.lookup({ text: '', arxivID: '1706.03762' }, signal());
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') throw new Error('expected paper');
    expect(result.paper).toMatchObject({
      arxivID: '1706.03762v2',
      authors: ['Ashish Vaswani'],
      year: 2017,
      abstract: 'Original abstract',
      citationCount: null,
      version: { id: 'v2', published: '2017-06-12T00:00:00Z', updated: '2017-06-19T00:00:00Z' },
    });
    expect(readKey).not.toHaveBeenCalled();
    expect(request.mock.calls[0][1]).toBe('');
  });
});

describe('scholarly sources and query extraction', () => {
  const crossref = {
    status: 'ok',
    message: {
      DOI: '10.1234/abc',
      title: ['Publisher title'],
      author: [{ given: 'Ada', family: 'Example' }],
      published: { 'date-parts': [[2022, 6, 12]] },
      'container-title': ['Journal'],
      volume: '3',
      issue: '2',
      page: '4-8',
      publisher: 'Publisher',
      'is-referenced-by-count': 4,
    },
  };
  it('extracts title, full author strings, year and venue without using a citekey as an ID', () => {
    const query = extractScholarlyQuery({
      text: '@article{LocalKey, title={A {Useful} Title}, author={Ada Example and Second, Author}, year=2022, journal=\"Journal\"}',
    });
    expect(query).toEqual({
      text: '',
      title: 'A Useful Title',
      authors: ['Ada Example', 'Second, Author'],
      year: 2022,
      venue: 'Journal',
      citekey: 'LocalKey',
    });
    expect(
      extractScholarlyQuery({
        text: '',
        bibtex: '@article{k, doi={10.1234/ABC}, eprint={1706.03762}}',
      }),
    ).toMatchObject({ doi: '10.1234/abc', arxivID: '1706.03762' });
  });
  it.each(['', ' \t '])(
    'falls back to BibTeX when explicit title is %j and authors are empty',
    (title) => {
      expect(
        extractScholarlyQuery({
          text: '',
          title,
          authors: [],
          bibtex: '@article{not-an-id, title={Useful Title}, author={Ada Example}}',
        }),
      ).toMatchObject({ text: '', title: 'Useful Title', authors: ['Ada Example'] });
      const keyOnly = extractScholarlyQuery({
        text: '',
        title,
        authors: [],
        citekey: 'LocalOnlyKey',
      });
      expect(keyOnly.title).toBeUndefined();
      expect(keyOnly.authors).toBeUndefined();
      expect(keyOnly.text).toBe('');
      expect(keyOnly.doi).toBeUndefined();
      expect(keyOnly.arxivID).toBeUndefined();
    },
  );
  it('bounds query fields before any request or credential access', async () => {
    const service = createScholarlyMetadataService();
    await expect(service.lookup({ text: 'x'.repeat(4097) }, signal())).rejects.toThrow('too long');
    await expect(
      service.lookup({ text: '', authors: ['x'.repeat(257)] }, signal()),
    ).rejects.toThrow('too long');
    await expect(service.lookup({ text: '', bibtex: 'x'.repeat(32769) }, signal())).rejects.toThrow(
      'too long',
    );
    expect(request).not.toHaveBeenCalled();
    expect(readKey).not.toHaveBeenCalled();
  });
  it('decodes publisher bibliographic fields and isolates caches by selected source', async () => {
    request
      .mockResolvedValueOnce({ status: 200, text: JSON.stringify(crossref) })
      .mockResolvedValueOnce({ status: 200, text: JSON.stringify(raw) });
    const service = createScholarlyMetadataService();
    const query = { text: '', doi: '10.1234/abc' };
    expect(await service.lookup(query, signal(), { source: 'crossref' })).toMatchObject({
      kind: 'found',
      paper: {
        source: 'crossref',
        title: 'Publisher title',
        authors: ['Ada Example'],
        bibliography: {
          date: '2022-06-12',
          volume: '3',
          issue: '2',
          pages: '4-8',
          publisher: 'Publisher',
          creators: [{ firstName: 'Ada', lastName: 'Example' }],
        },
      },
    });
    expect(readKey).not.toHaveBeenCalled();
    expect(
      await service.lookup(query, signal(), { source: 'semantic-scholar', mode: 'cache-only' }),
    ).toMatchObject({ kind: 'not-found' });
    expect(await service.lookup(query, signal(), { source: 'semantic-scholar' })).toMatchObject({
      kind: 'found',
      paper: { title: 'Original title' },
    });
    expect(
      await service.lookup(query, signal(), { source: 'crossref', mode: 'cache-only' }),
    ).toMatchObject({
      kind: 'found',
      paper: { title: 'Publisher title' },
      cache: { origin: 'cached' },
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('projects JATS abstract markup as inert readable text while preserving encoded inequalities', async () => {
    request.mockResolvedValue({
      status: 200,
      text: JSON.stringify({
        ...crossref,
        message: {
          ...crossref.message,
          abstract:
            '<jats:title>Weyl physics</jats:title> <jats:p>A &lt; B &amp; C &#x3b1;</jats:p>',
        },
      }),
    });
    const result = await createScholarlyMetadataService().lookup(
      { text: '', doi: '10.1234/abc' },
      signal(),
      { source: 'crossref' },
    );
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') throw new Error('Expected exact record');
    expect(result.paper.abstract).toMatch(/^Weyl physics\s+A < B & C α$/u);
    expect(result.paper.abstract).not.toContain('<jats:');
  });
  it('sends useful BibTeX fields in title search but never automatically adopts its single result', async () => {
    request.mockResolvedValue({
      status: 200,
      text: JSON.stringify({ ...crossref, message: { items: [crossref.message] } }),
    });
    const service = createScholarlyMetadataService();
    expect(
      await service.lookup(
        {
          text: '',
          bibtex: '@article{not-an-id, title={Useful Title}, author={Ada Example}, year=2022}',
        },
        signal(),
        { source: 'crossref' },
      ),
    ).toMatchObject({ kind: 'candidates' });
    const endpoint = decodeURIComponent(request.mock.calls[0]![0]);
    expect(endpoint).toContain('Useful Title Ada Example 2022');
    expect(endpoint).not.toContain('not-an-id');
  });
  it.each([
    { title: '', authors: [], expectedTitle: 'Useful Title', expectedAuthor: 'Ada Example' },
    { title: ' \t ', authors: [], expectedTitle: 'Useful Title', expectedAuthor: 'Ada Example' },
    {
      title: 'Native Title',
      authors: ['Native Author'],
      expectedTitle: 'Native Title',
      expectedAuthor: 'Native Author',
    },
  ])(
    'sends native-or-pasted title and authors for an item with title $title',
    async ({ title, authors, expectedTitle, expectedAuthor }) => {
      vi.stubGlobal('Zotero', {});
      const nativeFields: Record<string, string> = { title, citationKey: 'LocalOnlyKey' };
      const item = {
        id: 1,
        key: 'ABCD2345',
        libraryID: 1,
        deleted: false,
        isRegularItem: () => true,
        getField: (field: string) => nativeFields[field] ?? '',
        getCreatorsJSON: () => authors.map((name) => ({ creatorType: 'author', name })),
      } as unknown as Zotero.Item;
      const snapshot = snapshotMetadata(
        item,
        '@article{not-an-id, title={Useful Title}, author={Ada Example}, year=2022}',
      );
      request.mockResolvedValue({
        status: 200,
        text: JSON.stringify({
          ...crossref,
          message: { items: [crossref.message] },
        }),
      });
      const service = createScholarlyMetadataService();
      expect(await service.lookup(snapshot.query, signal(), { source: 'crossref' })).toMatchObject({
        kind: 'candidates',
      });
      const endpoint = decodeURIComponent(request.mock.calls[0]![0]);
      expect(endpoint).toContain(`${expectedTitle} ${expectedAuthor} 2022`);
      expect(endpoint).not.toContain('not-an-id');
      expect(endpoint).not.toContain('LocalOnlyKey');
      if (title.trim()) {
        expect(endpoint).not.toContain('Useful Title');
        expect(endpoint).not.toContain('Ada Example');
      }
      service.dispose();
    },
  );
  it('keeps the INSPIRE current texkey as proposal data and leaves full names unparsed', async () => {
    request.mockResolvedValue({
      status: 200,
      text: JSON.stringify({
        metadata: {
          control_number: 451647,
          titles: [{ title: 'The Large N Limit' }],
          arxiv_eprints: [{ value: 'hep-th/9711200' }],
          dois: [{ value: '10.1234/abc' }],
          texkeys: ['Maldacena:1997re', 'obsolete'],
          authors: [{ full_name: 'Maldacena, Juan Martin' }],
          publication_info: [
            {
              year: 1998,
              journal_title: 'Journal',
              journal_volume: '2',
              page_start: '231',
              page_end: '252',
            },
          ],
        },
      }),
    });
    const service = createScholarlyMetadataService();
    const result = await service.lookup(
      { text: '', arxivID: 'hep-th/9711200', citekey: 'MyLocalKey' },
      signal(),
      { source: 'inspire' },
    );
    expect(result).toMatchObject({
      kind: 'found',
      paper: {
        source: 'inspire',
        sourceID: '451647',
        citekey: 'Maldacena:1997re',
        authors: ['Maldacena, Juan Martin'],
        bibliography: { pages: '231-252' },
      },
    });
    if (result.kind !== 'found') throw new Error('expected record');
    expect(result.paper.bibliography?.creators).toBeUndefined();
    expect(readKey).not.toHaveBeenCalled();
    expect(request.mock.calls[0]![1]).toBe('');
  });
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate'],
    [500, 'network'],
  ] as const)('distinguishes HTTP %s from a genuine no-result', async (status, kind) => {
    request.mockResolvedValue({ status, text: '' });
    const service = createScholarlyMetadataService();
    await expect(
      service.lookup({ text: '', doi: '10.1234/failure' }, signal(), { source: 'crossref' }),
    ).rejects.toMatchObject({ name: 'ScholarlyError', kind, source: 'crossref' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed successful search responses instead of turning errors into no results', async () => {
    request.mockResolvedValue({ status: 200, text: '{\"status\":\"ok\",\"message\":{}}' });
    const service = createScholarlyMetadataService();
    await expect(
      service.lookup({ text: 'title' }, signal(), { source: 'crossref' }),
    ).rejects.toBeInstanceOf(ScholarlyError);
  });
  it('returns a real empty search and does not activate OpenAlex', async () => {
    request.mockResolvedValue({
      status: 200,
      text: '{\"status\":\"ok\",\"message\":{\"items\":[]}}',
    });
    const service = createScholarlyMetadataService();
    expect(await service.lookup({ text: 'missing' }, signal(), { source: 'crossref' })).toEqual({
      kind: 'not-found',
    });
    expect(service.sources.map((source) => source.id)).toEqual([
      'semantic-scholar',
      'arxiv',
      'crossref',
      'inspire',
    ]);
  });
});

it('preserves braced corporate BibTeX authors without splitting their internal and', () => {
  expect(
    extractScholarlyQuery({
      text: '',
      bibtex:
        '@article{k, title={Title}, author={{Research and Development Group} and Ada Example}}',
    }).authors,
  ).toEqual(['Research and Development Group', 'Ada Example']);
});

it('uses arXiv title/author/year search and treats a singleton as a candidate; version mismatches remain candidates', async () => {
  vi.useFakeTimers();
  const node = (textContent: string) => ({ textContent });
  const entry = {
    getElementsByTagNameNS: (_namespace: string, name: string) => {
      if (name === 'id') return [node('https://arxiv.org/abs/1706.03762v2')];
      if (name === 'title') return [node('Attention Is All You Need')];
      if (name === 'published') return [node('2017-06-12T00:00:00Z')];
      if (name === 'updated') return [node('2017-06-19T00:00:00Z')];
      return [];
    },
  };
  vi.stubGlobal(
    'DOMParser',
    class {
      parseFromString() {
        return { getElementsByTagName: () => [], getElementsByTagNameNS: () => [entry] };
      }
    },
  );
  request.mockResolvedValue({ status: 200, text: '<feed/>' });
  const service = createScholarlyMetadataService();
  const search = service.lookup(
    { text: '', title: 'Attention Is All You Need', authors: ['Ashish Vaswani'], year: 2017 },
    signal(),
    { source: 'arxiv' },
  );
  await vi.runAllTimersAsync();
  expect(await search).toMatchObject({
    kind: 'candidates',
    papers: [{ arxivID: '1706.03762v2', version: { id: 'v2' } }],
  });
  const endpoint = decodeURIComponent(request.mock.calls[0]![0]);
  expect(endpoint).toContain('ti:\"Attention Is All You Need\"');
  expect(endpoint).toContain('au:\"Ashish Vaswani\"');
  expect(endpoint).toContain('submittedDate:[201701010000 TO 201712312359]');
  const mismatch = service.lookup({ text: '', arxivID: '1706.03762v3' }, signal(), {
    source: 'arxiv',
  });
  await vi.runAllTimersAsync();
  expect(await mismatch).toMatchObject({
    kind: 'candidates',
    papers: [{ arxivID: '1706.03762v2' }],
  });
  expect(readKey).not.toHaveBeenCalled();
  service.dispose();
});

it('does not promote an exact primary identifier when another supplied identifier conflicts', async () => {
  request.mockResolvedValue({
    status: 200,
    text: JSON.stringify({
      ...raw,
      externalIds: { DOI: '10.1234/abc', ArXiv: '1706.03762v2' },
    }),
  });
  const service = createScholarlyMetadataService();
  const query = { text: '', doi: '10.1234/abc', arxivID: '1706.03762v3' };
  expect(await service.lookup(query, signal(), { source: 'semantic-scholar' })).toMatchObject({
    kind: 'candidates',
  });
  expect(
    await service.lookup(query, signal(), { source: 'semantic-scholar', mode: 'cache-only' }),
  ).toMatchObject({ kind: 'candidates' });
  expect(
    await service.lookup({ text: '', doi: query.doi }, signal(), {
      source: 'semantic-scholar',
      mode: 'cache-only',
    }),
  ).toEqual({ kind: 'not-found' });
  service.dispose();
});
