import { afterEach, describe, expect, it, vi } from 'vitest';
import { readerRegionPreview, regionPreviewPlan } from '../../src/toolkit/reader/region-preview';
import type { ReaderRuntime } from '../../src/toolkit/reader/contracts';

function harness() {
  vi.stubGlobal('Components', {
    utils: { cloneInto: (v: unknown) => v, waiveXrays: (v: unknown) => v },
  });
  const completion = Promise.withResolvers<void>();
  const cancel = vi.fn(() => completion.reject(new Error('cancelled')));
  const contexts = [0, 1].map(() => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }));
  const canvases = contexts.map((context) => ({
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => 'data:image/png;base64,owned',
  }));
  let next = 0;
  const render = vi.fn((_options: unknown) => ({ promise: completion.promise, cancel }));
  const getPage = vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 800 * scale,
      height: 600 * scale,
      // A rotated page: the preview must use PDF.js's transform, not assume top-left coordinates.
      convertToViewportRectangle: ([x0, y0, x1, y1]: number[]) => [y0, x0, y1, x1],
    }),
    render,
  }));
  const window = {
    document: { createElement: () => canvases[next++] },
    PDFViewerApplication: { pdfDocument: { numPages: 1, getPage } },
  };
  const reader = {
    _internalReader: { _primaryView: { _iframeWindow: window } },
  } as unknown as ReaderRuntime;
  return { reader, window, render, getPage, completion, cancel, contexts, canvases };
}
afterEach(() => vi.unstubAllGlobals());

describe('detached source PDF previews', () => {
  it('bounds memory for very large groups and retains the gaps between actual members', () => {
    const plan = regionPreviewPlan([
      [0, 0, 10000, 20000],
      [100, 25000, 10000, 30000],
    ]);
    expect(plan.width * plan.height).toBeLessThanOrEqual(2_000_000);
    expect(Math.max(plan.width, plan.height)).toBeLessThanOrEqual(1800);
    expect(plan.members[1]![1]).toBeGreaterThan(plan.members[0]![3]);
    expect(() => regionPreviewPlan([[0, 0, 0, 10]])).toThrow();
    expect(() => regionPreviewPlan([])).toThrow();
  });
  it('uses rotated viewport geometry, masks body text in gaps and releases both canvases', async () => {
    const t = harness();
    const result = readerRegionPreview(
      t.reader,
      {
        pageIndex: 0,
        rects: [
          [10, 20, 30, 40],
          [50, 20, 60, 40],
        ],
      },
      new AbortController().signal,
    );
    await vi.waitFor(() => expect(t.render).toHaveBeenCalledOnce());
    expect(t.render.mock.calls[0]![0]).toMatchObject({
      transform: [1, 0, 0, 1, -40, -20],
      annotationMode: 0,
    });
    t.completion.resolve();
    await expect(result).resolves.toMatchObject({ width: 40, height: 100 });
    expect(t.contexts[1]!.fillRect).toHaveBeenCalledWith(0, 0, 40, 100);
    expect(t.contexts[1]!.drawImage.mock.calls.map((call) => call.slice(1))).toEqual([
      [0, 0, 40, 40, 0, 0, 40, 40],
      [0, 80, 40, 20, 0, 80, 40, 20],
    ]);
    expect(t.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  it('cancels pending PDF.js work and releases memory when a choice is superseded', async () => {
    const t = harness(),
      abort = new AbortController();
    const result = readerRegionPreview(
      t.reader,
      { pageIndex: 0, rects: [[10, 20, 30, 40]] },
      abort.signal,
    );
    const rejected = expect(result).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(t.render).toHaveBeenCalledOnce());
    abort.abort();
    await rejected;
    expect(t.cancel).toHaveBeenCalledOnce();
    expect(t.canvases.every((canvas) => canvas.width === 0)).toBe(true);
  });
  it('rejects stale PDF completion and invalid page rectangles without publishing a crop', async () => {
    const t = harness();
    await expect(
      readerRegionPreview(
        t.reader,
        { pageIndex: 1, rects: [[10, 20, 30, 40]] },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    await expect(
      readerRegionPreview(
        t.reader,
        { pageIndex: 0, rects: [[0, 0, 900, 900]] },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(t.render).not.toHaveBeenCalled();
    const result = readerRegionPreview(
      t.reader,
      { pageIndex: 0, rects: [[10, 20, 30, 40]] },
      new AbortController().signal,
    );
    const rejected = expect(result).rejects.toThrow('retired');
    await vi.waitFor(() => expect(t.render).toHaveBeenCalledOnce());
    t.window.PDFViewerApplication.pdfDocument = { numPages: 2, getPage: t.getPage };
    t.completion.resolve();
    await rejected;
  });
});
