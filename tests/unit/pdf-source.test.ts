import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pdfSourcePages } from '../../src/toolkit/pdf-source';

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.stubGlobal('Zotero', { getMainWindow: () => ({ Function }) });
  vi.stubGlobal('Components', { utils: { cloneInto: (value: unknown) => value } });
});
describe('headless host PDF geometry', () => {
  it('reads unrotated boxes and rotation, releasing the host document after metadata extraction', async () => {
    const destroy = vi.fn(async () => {}),
      getPage = vi.fn(async () => ({ view: [10, 20, 610, 820], rotate: 90 }));
    const module = {
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 2, getPage }), destroy })),
    };
    const load = vi.fn(() => module);
    vi.stubGlobal('ChromeUtils', { importESModule: load });
    await expect(
      pdfSourcePages(async () => new Uint8Array([1]), new AbortController().signal, 200),
    ).resolves.toEqual([
      { pageIndex: 0, viewBox: [10, 20, 610, 820], rotation: 90 },
      { pageIndex: 1, viewBox: [10, 20, 610, 820], rotation: 90 },
    ]);
    expect(load).toHaveBeenCalledWith('resource://zotero/reader/pdf/build/pdf.mjs', {
      global: 'current',
    });
    expect(getPage.mock.calls).toHaveLength(2);
    expect(destroy).toHaveBeenCalledOnce();
  });
  it('destroys a loading task on cancellation without publishing late geometry', async () => {
    const pending = Promise.withResolvers<{
        numPages: number;
        getPage: ReturnType<typeof vi.fn>;
      }>(),
      destroy = vi.fn(async () => {}),
      abort = new AbortController();
    vi.stubGlobal('ChromeUtils', {
      importESModule: () => ({
        GlobalWorkerOptions: {},
        getDocument: () => ({ promise: pending.promise, destroy }),
      }),
    });
    const task = pdfSourcePages(async () => new Uint8Array([1]), abort.signal, 200);
    const rejected = expect(task).rejects.toThrow('cancelled');
    await Promise.resolve();
    abort.abort();
    pending.resolve({ numPages: 1, getPage: vi.fn() });
    await rejected;
    expect(destroy).toHaveBeenCalled();
  });
  it('rejects oversized PDFs before enumerating pages and still releases host resources', async () => {
    const getPage = vi.fn(),
      destroy = vi.fn(async () => {});
    vi.stubGlobal('ChromeUtils', {
      importESModule: () => ({
        GlobalWorkerOptions: {},
        getDocument: () => ({ promise: Promise.resolve({ numPages: 201, getPage }), destroy }),
      }),
    });
    await expect(
      pdfSourcePages(async () => new Uint8Array([1]), new AbortController().signal, 200),
    ).rejects.toThrow('200');
    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
