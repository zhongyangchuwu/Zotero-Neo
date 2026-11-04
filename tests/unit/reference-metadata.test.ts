import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReferenceMetadataService } from '../../src/references/metadata';

vi.mock('../../src/platform/reference-http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/platform/reference-http')>()),
  referenceRequest: vi.fn(),
}));
vi.mock('../../src/platform/reference-credentials', () => ({
  readReferenceKey: vi.fn(),
  changeReferenceKey: vi.fn(),
}));
import { referenceRequest } from '../../src/platform/reference-http';
import { changeReferenceKey, readReferenceKey } from '../../src/platform/reference-credentials';
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

beforeEach(() => {
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
    const service = createReferenceMetadataService();
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
    expect(await service.lookup({ text: '', doi: '10.1234/ABC' }, signal())).toEqual(result);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toBe('secret');
    service.dispose();
  });
  it('never auto-selects a text search or a DOI mismatch', async () => {
    request
      .mockResolvedValueOnce({ status: 200, text: JSON.stringify({ data: [raw] }) })
      .mockResolvedValueOnce({ status: 200, text: JSON.stringify(raw) });
    const first = createReferenceMetadataService();
    expect((await first.lookup({ text: 'some title' }, signal())).kind).toBe('candidates');
    const second = createReferenceMetadataService();
    expect((await second.lookup({ text: '', doi: '10.1234/different' }, signal())).kind).toBe(
      'candidates',
    );
  });
  it('surfaces 429 without retry or caching failure', async () => {
    request.mockResolvedValue({ status: 429, text: '' });
    const service = createReferenceMetadataService();
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
    const service = createReferenceMetadataService();
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
  it('saves and forgets credentials only on explicit actions', async () => {
    const service = createReferenceMetadataService();
    expect(changeReferenceKey).not.toHaveBeenCalled();
    await service.setSemanticScholarKey('  new key  ');
    await service.setSemanticScholarKey(null);
    expect(vi.mocked(changeReferenceKey).mock.calls).toEqual([['new key'], [null]]);
    await expect(service.setSemanticScholarKey('  ')).rejects.toThrow('empty');
  });
  it('decodes an arXiv entry and never accesses or sends the Semantic Scholar key', async () => {
    const node = (textContent: string) => ({ textContent });
    const entry = {
      getElementsByTagNameNS: (_namespace: string, name: string) => {
        if (name === 'id') return [node('http://arxiv.org/abs/1706.03762v2')];
        if (name === 'title') return [node('Attention Is All You Need')];
        if (name === 'summary') return [node('Original abstract')];
        if (name === 'published') return [node('2017-06-12T00:00:00Z')];
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
    const service = createReferenceMetadataService();
    const result = await service.lookup({ text: '', arxivID: '1706.03762' }, signal());
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') throw new Error('expected paper');
    expect(result.paper).toMatchObject({
      arxivID: '1706.03762v2',
      authors: ['Ashish Vaswani'],
      year: 2017,
      abstract: 'Original abstract',
      citationCount: null,
    });
    expect(readKey).not.toHaveBeenCalled();
    expect(request.mock.calls[0][1]).toBe('');
  });
});
