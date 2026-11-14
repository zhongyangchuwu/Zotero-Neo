import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readReaderReferenceDocument } from '../../src/toolkit/reader/references';
import type { ReaderRuntime } from '../../src/toolkit/reader/contracts';

const source = vi.hoisted(() => ({
  fingerprint: '0123456789abcdef0123456789abcdef',
  isCurrent: vi.fn(async () => true),
}));
vi.mock('../../src/platform/document-analysis', () => ({ analysisPDF: vi.fn(async () => source) }));
const sdt = vi.hoisted(() => ({
  blocks: null as unknown[] | null,
  hash: '0123456789abcdef0123456789abcdef',
  unavailable: false,
}));
vi.mock('../../src/toolkit/reader/structured-document', () => ({
  structuredDocumentData: vi.fn(async () => {
    if (sdt.unavailable) throw new Error('SDT unavailable');
    return sdt.blocks ? { metadata: { source: { hash: sdt.hash } }, blocks: sdt.blocks } : null;
  }),
}));
let loadedFingerprint = '0123456789abcdef0123456789abcdef';

function fixture() {
  const reference = (index: number, pageIndex: number, text: string) => ({
    index,
    text,
    textParts: [{ text }],
    position: { pageIndex, rects: [[10, 20 + index, 90, 30 + index]] },
  });
  const first = reference(1, 4, '[1] First paper. doi:10.1038/s41586-021-03819-2');
  const second = reference(2, 4, '[2] Second paper. arXiv:1706.03762');
  const chars = Array.from('See [1,2] today.', (u, offset) => ({ u, c: u, offset, pageIndex: 0 }));
  const position = {
    pageIndex: 0,
    rects: [
      [20, 30, 40, 40],
      [10, 10, 20, 20],
    ],
    nextPageRects: [[5, 6, 15, 16]],
  };
  const citation = {
    type: 'citation',
    position,
    word: chars.slice(4, 9),
    references: [first, second, first],
  };
  const processed = {
    pages: {
      0: { chars, overlays: [citation, citation] },
      4: {
        overlays: [
          { type: 'reference', references: [first] },
          { type: 'reference', references: [second] },
        ],
      },
    },
  };
  const pdf = {
    getData: vi.fn(async () => new Uint8Array([1])),
    getProcessedData: vi.fn(async () => processed),
  };
  const view = { _iframeWindow: { PDFViewerApplication: { pdfDocument: pdf } } };
  const reader = {
    itemID: 42,
    _internalReader: { _primaryView: view },
  } as unknown as ReaderRuntime;
  return {
    reader,
    pdf,
    processed,
    position,
    view,
    window: view._iframeWindow as unknown as Window,
  };
}

beforeEach(() => {
  vi.stubGlobal('Components', {
    utils: { waiveXrays: (value: unknown) => value },
    interfaces: { nsICryptoHash: {} },
    classes: {
      '@mozilla.org/security/hash;1': {
        createInstance: () => ({
          MD5: 1,
          init() {},
          update() {},
          finish: () =>
            loadedFingerprint
              .match(/../g)!
              .map((part) => String.fromCharCode(parseInt(part, 16)))
              .join(''),
        }),
      },
    },
  });
});
afterEach(() => {
  source.fingerprint = '0123456789abcdef0123456789abcdef';
  loadedFingerprint = source.fingerprint;
  source.isCurrent.mockReset().mockResolvedValue(true);
  sdt.blocks = null;
  sdt.hash = '0123456789abcdef0123456789abcdef';
  sdt.unavailable = false;
  vi.unstubAllGlobals();
});

describe('native reference document', () => {
  it('maps all pages, groups multiple destinations, deduplicates, and clones source geometry', async () => {
    const { reader, position, window } = fixture();
    const { document: result } = await readReaderReferenceDocument(reader, () => true, window);
    expect(result.attachmentID).toBe(42);
    expect(result.sourceID).toBe('0123456789abcdef0123456789abcdef');
    expect(result.entries.map((entry) => entry.label)).toEqual(['1', '2']);
    expect(result.bibliographyCoverage).toBe('partial');
    expect(result.entries[0].doi).toBe('10.1038/s41586-021-03819-2');
    expect(result.entries[1].arxivID).toBe('1706.03762');
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0].referenceIDs).toEqual([
      result.entries[0].id,
      result.entries[1].id,
    ]);
    expect(result.occurrences[0].text).toBe('[1,2]');
    expect(result.occurrences[0].context).toBe('See [1,2] today.');
    expect(result.occurrences[0].location.rects).toEqual([
      [20, 30, 40, 40],
      [10, 10, 20, 20],
    ]);
    expect(result.occurrences[0].location.nextPageRects).toEqual([[5, 6, 15, 16]]);
    position.nextPageRects[0][0] = 999;
    expect(result.occurrences[0].location.nextPageRects?.[0][0]).toBe(5);
    position.rects[0][0] = 999;
    expect(result.occurrences[0].location.rects[0][0]).toBe(20);
  });
  it('recovers an uncited numbered entry from the explicit SDT bibliography and merges cited entries', async () => {
    const { reader, window } = fixture();
    const paragraph = (text: string, page: number, rect: number[]) => ({
      type: 'paragraph',
      content: [{ text }],
      anchor: { pageRects: [[page, ...rect]] },
    });
    sdt.blocks = [
      { type: 'heading', content: [{ text: 'References' }] },
      paragraph('[1] First paper.', 4, [10, 21, 80, 31]),
      paragraph('[2] Second paper.', 4, [10, 22, 80, 32]),
      paragraph('[3] Uncited work:', 5, [10, 20, 80, 30]),
      paragraph('continued on next page. arXiv:1512.03385', 6, [10, 30, 80, 40]),
    ];
    const { document: result } = await readReaderReferenceDocument(reader, () => true, window);
    expect(result.bibliographyCoverage).toBe('numbered');
    expect(result.entries.map((entry) => entry.label)).toEqual(['1', '2', '3']);
    expect(result.entries[2].text).toContain('Uncited work: continued on next page');
    expect(result.entries[2].arxivID).toBe('1512.03385');
    expect(result.entries[2].location.nextPageRects).toEqual([[10, 30, 80, 40]]);
    expect(result.occurrences[0].referenceIDs).not.toContain(result.entries[2].id);
  });
  it('uses only uniquely anchored native paragraph text for citation context', async () => {
    const { reader, window } = fixture();
    sdt.blocks = [
      {
        type: 'paragraph',
        content: [{ text: 'A real paragraph cites [1,2] here.' }],
        anchor: { pageRects: [[0, 15, 25, 50, 45]] },
      },
    ];
    const { document: result } = await readReaderReferenceDocument(reader, () => true, window);
    expect(result.occurrences[0].context).toBe('A real paragraph cites [1,2] here.');
    expect(result.bibliographyCoverage).toBe('partial');
  });
  it('reports partial coverage for unnumbered bibliography without inventing entries', async () => {
    const { reader, window } = fixture();
    sdt.blocks = [
      { type: 'heading', content: [{ text: 'References' }] },
      {
        type: 'paragraph',
        content: [{ text: 'Smith, J. (2020). An unnumbered source.' }],
        anchor: { pageRects: [[4, 10, 20, 90, 30]] },
      },
    ];
    const { document: result } = await readReaderReferenceDocument(reader, () => true, window);
    expect(result.bibliographyCoverage).toBe('partial');
    expect(result.entries).toHaveLength(2);
  });
  it('does not merge stale structured bibliography or context', async () => {
    const { reader, window } = fixture();
    sdt.hash = 'fedcba9876543210fedcba9876543210';
    sdt.blocks = [
      {
        type: 'paragraph',
        content: [{ text: 'Stale context' }],
        anchor: { pageRects: [[0, 15, 25, 50, 45]] },
      },
      { type: 'heading', content: [{ text: 'References' }] },
      {
        type: 'paragraph',
        content: [{ text: '[3] Stale entry' }],
        anchor: { pageRects: [[5, 10, 20, 80, 30]] },
      },
    ];
    const { document } = await readReaderReferenceDocument(reader, () => true, window);
    expect(document.bibliographyCoverage).toBe('partial');
    expect(document.entries.map((entry) => entry.label)).toEqual(['1', '2']);
    expect(document.occurrences[0].context).toBe('See [1,2] today.');
  });
  it('retains native references when structured analysis is unavailable', async () => {
    const { reader, window } = fixture();
    sdt.unavailable = true;
    const { document } = await readReaderReferenceDocument(reader, () => true, window);
    expect(document.bibliographyCoverage).toBe('partial');
    expect(document.entries.map((entry) => entry.label)).toEqual(['1', '2']);
  });

  it('retires a published snapshot when the PDF is replaced on the same surface', async () => {
    const { reader, pdf, view, window } = fixture();
    const snapshot = await readReaderReferenceDocument(reader, () => true, window);
    const jump = vi.fn();
    expect(snapshot.isCurrent()).toBe(true);
    view._iframeWindow.PDFViewerApplication.pdfDocument = fixture().pdf;
    expect(snapshot.isCurrent()).toBe(false);
    if (await snapshot.validate()) jump(snapshot.document.occurrences[0].location);
    expect(jump).not.toHaveBeenCalled();
    view._iframeWindow.PDFViewerApplication.pdfDocument = pdf;
    expect(snapshot.isCurrent()).toBe(false);
    expect(await snapshot.validate()).toBe(false);
  });

  it('retires permanently when the attachment revision changes after publication', async () => {
    const { reader, window } = fixture();
    const snapshot = await readReaderReferenceDocument(reader, () => true, window);
    source.isCurrent.mockResolvedValueOnce(false);
    expect(await snapshot.validate()).toBe(false);
    expect(snapshot.isCurrent()).toBe(false);
    expect(await snapshot.validate()).toBe(false);
  });

  it('retires permanently when the attachment revision cannot be read', async () => {
    const { reader, window } = fixture();
    const snapshot = await readReaderReferenceDocument(reader, () => true, window);
    source.isCurrent.mockRejectedValueOnce(new Error('file unavailable'));
    expect(await snapshot.validate()).toBe(false);
    expect(snapshot.isCurrent()).toBe(false);
    expect(await snapshot.validate()).toBe(false);
  });

  it('rejects a revision check that completes after the captured PDF is replaced', async () => {
    const { reader, view, window } = fixture();
    const snapshot = await readReaderReferenceDocument(reader, () => true, window);
    const { promise, resolve } = Promise.withResolvers<boolean>();
    source.isCurrent.mockImplementationOnce(() => promise);
    const validation = snapshot.validate();
    view._iframeWindow.PDFViewerApplication.pdfDocument = fixture().pdf;
    resolve(true);
    expect(await validation).toBe(false);
    expect(snapshot.isCurrent()).toBe(false);
  });

  it('uses the actual attachment revision, not a stable attachment ID', async () => {
    const { reader, window } = fixture();
    const { document: first } = await readReaderReferenceDocument(reader, () => true, window);
    source.fingerprint = 'fedcba9876543210fedcba9876543210';
    loadedFingerprint = source.fingerprint;
    const { document: second } = await readReaderReferenceDocument(reader, () => true, window);
    expect(second.sourceID).not.toBe(first.sourceID);
  });
  it('rejects a PDF loaded from a different attachment revision', async () => {
    const { reader, pdf, window } = fixture();
    loadedFingerprint = 'fedcba9876543210fedcba9876543210';
    await expect(readReaderReferenceDocument(reader, () => true, window)).rejects.toThrow(
      'source changed',
    );
    expect(pdf.getProcessedData).not.toHaveBeenCalled();
  });

  it('keeps separate occurrences of the same reference on unrendered pages', async () => {
    const { reader, processed, window } = fixture();
    const first = processed.pages[0].overlays[0].references[0];
    const chars = Array.from('Later [1].', (u, offset) => ({ u, c: u, offset, pageIndex: 3 }));
    const pages = processed.pages as Record<number, { chars?: typeof chars; overlays: unknown[] }>;
    pages[3] = {
      chars,
      overlays: [
        {
          type: 'citation',
          position: { pageIndex: 3, rects: [[1, 2, 8, 9]] },
          word: chars.slice(6, 9),
          references: [first],
        },
      ],
    };
    const { document: result } = await readReaderReferenceDocument(reader, () => true, window);
    expect(result.occurrences).toHaveLength(2);
    expect(result.occurrences[1].referenceIDs).toEqual([result.entries[0].id]);
    expect(result.occurrences[1].context).toBe('Later [1].');
    expect(result.occurrences[1].location.pageIndex).toBe(3);
  });
  it('does not publish malformed geometry as a navigable citation', async () => {
    const { reader, processed, window } = fixture();
    processed.pages[0].overlays[0].position.rects[0][2] = NaN;
    const { document: result } = await readReaderReferenceDocument(reader, () => true, window);
    expect(result.occurrences).toEqual([]);
  });

  it('uses the captured secondary PDF behind its Reading Mode presentation', async () => {
    const primary = fixture();
    const secondary = fixture();
    const readingWindow = { document: {} } as Window;
    const reader = {
      itemID: 42,
      _internalReader: {
        _primaryView: primary.view,
        _secondaryView: secondary.view,
        _secondarySDTView: { _iframeWindow: readingWindow },
        _state: { secondaryReadingModeEnabled: true },
      },
    } as unknown as ReaderRuntime;
    await readReaderReferenceDocument(reader, () => true, readingWindow);
    expect(secondary.pdf.getProcessedData).toHaveBeenCalledOnce();
    expect(primary.pdf.getProcessedData).not.toHaveBeenCalled();
    await expect(
      readReaderReferenceDocument(reader, () => true, secondary.window),
    ).rejects.toThrow();
  });
  it('retires when the underlying PDF DOM changes behind Reading Mode', async () => {
    const secondary = fixture();
    const readingWindow = { document: {} } as Window;
    Reflect.set(secondary.view._iframeWindow, 'document', {});
    const reader = {
      itemID: 42,
      _internalReader: {
        _secondaryView: secondary.view,
        _secondarySDTView: { _iframeWindow: readingWindow },
        _state: { secondaryReadingModeEnabled: true },
      },
    } as unknown as ReaderRuntime;
    const snapshot = await readReaderReferenceDocument(reader, () => true, readingWindow);
    Reflect.set(secondary.view._iframeWindow, 'document', {});
    expect(snapshot.isCurrent()).toBe(false);
    expect(await snapshot.validate()).toBe(false);
  });
  it('rejects when Reading Mode changes while native work is pending', async () => {
    const secondary = fixture();
    const readingWindow = { document: {} } as Window;
    const internal = {
      _secondaryView: secondary.view,
      _secondarySDTView: { _iframeWindow: readingWindow },
      _state: { secondaryReadingModeEnabled: true },
    };
    const reader = { itemID: 42, _internalReader: internal } as unknown as ReaderRuntime;
    secondary.pdf.getProcessedData.mockImplementationOnce(async () => {
      internal._secondarySDTView = { _iframeWindow: { document: {} } as Window };
      return { pages: {} } as never;
    });
    await expect(readReaderReferenceDocument(reader, () => true, readingWindow)).rejects.toThrow(
      'cancelled',
    );
  });

  it('rejects a retired view or changed document before exposing data', async () => {
    const { reader, pdf, view, window } = fixture();
    pdf.getProcessedData.mockImplementationOnce(async () => {
      view._iframeWindow.PDFViewerApplication.pdfDocument = fixture().pdf;
      return { pages: {} } as never;
    });
    await expect(readReaderReferenceDocument(reader, () => true, window)).rejects.toThrow(
      'cancelled',
    );
    const next = fixture();
    source.isCurrent.mockResolvedValueOnce(false);
    await expect(readReaderReferenceDocument(next.reader, () => true, next.window)).rejects.toThrow(
      'cancelled',
    );
  });

  it('does not start native processing after retirement', async () => {
    const { reader, pdf, window } = fixture();
    await expect(readReaderReferenceDocument(reader, () => false, window)).rejects.toThrow();
    expect(pdf.getProcessedData).not.toHaveBeenCalled();
  });
});
