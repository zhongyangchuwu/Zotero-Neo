import { describe, expect, it, vi } from 'vitest';
import { readerDocumentPageGeometry } from '../../src/toolkit/reader/document-source';
import type { ReaderRuntime } from '../../src/toolkit/reader/contracts';

describe('independent PDF source geometry', () => {
  it('uses native page info when content-realm PDF.js getters are opaque, without SDT', async () => {
    const getPage = vi.fn(async () => ({ _pageInfo: { view: [10, 20, 210, 120], rotate: 90 } }));
    const reader = {
      _internalReader: {
        _primaryView: {
          _iframeWindow: { PDFViewerApplication: { pdfDocument: { numPages: 1, getPage } } },
        },
      },
    } as unknown as ReaderRuntime;
    await expect(readerDocumentPageGeometry(reader, () => true)).resolves.toEqual([
      { viewRect: [10, 20, 210, 120], rotation: 90 },
    ]);
    expect(getPage).toHaveBeenCalledWith(1);
  });

  it('stops reading later pages after its owner retires', async () => {
    let current = true;
    const getPage = vi.fn(async () => {
      current = false;
      return { view: [0, 0, 100, 100] };
    });
    const reader = {
      _internalReader: {
        _primaryView: {
          _iframeWindow: { PDFViewerApplication: { pdfDocument: { numPages: 2, getPage } } },
        },
      },
    } as unknown as ReaderRuntime;
    await expect(readerDocumentPageGeometry(reader, () => current)).rejects.toThrow();
    expect(getPage).toHaveBeenCalledTimes(1);
  });
});
