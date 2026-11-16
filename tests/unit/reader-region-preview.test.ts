import { afterEach, describe, expect, it, vi } from 'vitest';
import { readerRegionPreview, regionPreviewPlan } from '../../src/toolkit/reader/region-preview';
import type { ReaderRuntime } from '../../src/toolkit/reader/contracts';

function harness() {
  vi.stubGlobal('Components', {
    utils: { cloneInto: (v: unknown) => v, waiveXrays: (v: unknown) => v },
  });
  const completion = Promise.withResolvers<void>();
  const cancel = vi.fn(() => completion.reject(new Error('cancelled')));
  const contexts = [0, 1].map(() => ({
    fillStyle: '',
    pixels: new Map<string, string>(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  }));
  const canvases = contexts.map((context) => ({
    width: 0,
    height: 0,
    getContext: () => context,
    // The host encoder is stubbed; serialize sampled pixels rather than implement PNG here.
    toDataURL: () => JSON.stringify([...context.pixels]),
  }));
  for (const context of contexts) {
    context.fillRect.mockImplementation((x: number, y: number, width: number, height: number) => {
      for (const key of context.pixels.keys()) {
        const [px, py] = key.split(',').map(Number) as [number, number];
        if (px >= x && px < x + width && py >= y && py < y + height) context.pixels.delete(key);
      }
    });
    context.drawImage.mockImplementation(
      (
        source: (typeof canvases)[number],
        sx: number,
        sy: number,
        width: number,
        height: number,
        dx: number,
        dy: number,
        targetWidth: number,
        targetHeight: number,
      ) => {
        for (const [key, value] of source.getContext().pixels) {
          const [x, y] = key.split(',').map(Number) as [number, number];
          if (x >= sx && x < sx + width && y >= sy && y < sy + height)
            context.pixels.set(
              `${dx + ((x - sx) * targetWidth) / width},${dy + ((y - sy) * targetHeight) / height}`,
              value,
            );
        }
      },
    );
  }
  let next = 0;
  const render = vi.fn((options: unknown) => {
    const { canvasContext, viewport, transform } = options as {
      canvasContext: (typeof contexts)[number];
      viewport: { scale: number };
      transform: number[];
    };
    for (const [x, y, value] of [
      [30, 20, 'body'],
      [30, 40, 'axis-title'],
    ] as const) {
      const px = x * viewport.scale + transform[4]!,
        py = y * viewport.scale + transform[5]!;
      if (px >= 0 && px < canvases[0]!.width && py >= 0 && py < canvases[0]!.height)
        canvasContext.pixels.set(`${px},${py}`, value);
    }
    return { promise: completion.promise, cancel };
  });
  const getPage = vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({
      scale,
      width: 800 * scale,
      height: 600 * scale,
      // A rotated page: the preview must use PDF.js's transform, not assume top-left coordinates.
      convertToViewportRectangle: ([x0, y0, x1, y1]: number[]) => [y0, x0, y1, x1],
    }),
    render,
  }));
  const window = {
    document: { createElement: () => canvases[next++] },
    PDFViewerApplication: {
      pdfDocument: {
        numPages: 1,
        getPage,
        getOptionalContentConfig: async () => ({ getOrder: () => null }),
      },
    },
  };
  const reader = {
    _internalReader: { _primaryView: { _iframeWindow: window } },
  } as unknown as ReaderRuntime;
  return { reader, window, render, getPage, completion, cancel, contexts, canvases };
}
afterEach(() => vi.unstubAllGlobals());

describe('detached source PDF previews', () => {
  it('bounds raster memory and rejects invalid source geometry', () => {
    const plan = regionPreviewPlan([
      [0, 0, 10000, 20000],
      [100, 25000, 10000, 30000],
    ]);
    expect(plan.width * plan.height).toBeLessThanOrEqual(2_000_000);
    expect(Math.max(plan.width, plan.height)).toBeLessThanOrEqual(1800);
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
  it.each([undefined, 'bounds'] as const)(
    'retains authored pixels between members only for continuous object crops (%s)',
    async (clip) => {
      const t = harness();
      const pending = readerRegionPreview(
        t.reader,
        {
          pageIndex: 0,
          rects: [
            [10, 20, 30, 40],
            [50, 20, 60, 40],
          ],
        },
        new AbortController().signal,
        clip,
      );
      await vi.waitFor(() => expect(t.render).toHaveBeenCalledOnce());
      t.completion.resolve();
      const preview = await pending;
      const pixels = new Map(JSON.parse(preview.dataURL) as [string, string][]);
      expect(pixels.get('20,20')).toBe('body');
      expect(pixels.get('20,60')).toBe(clip === 'bounds' ? 'axis-title' : undefined);
      expect(preview).toMatchObject({ width: 40, height: 100 });
      expect(t.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    },
  );
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
  it.each([undefined, 'bounds'] as const)(
    'rejects stale completion and invalid source rectangles (%s)',
    async (clip) => {
      const t = harness();
      await expect(
        readerRegionPreview(
          t.reader,
          { pageIndex: 1, rects: [[10, 20, 30, 40]] },
          new AbortController().signal,
          clip,
        ),
      ).rejects.toThrow();
      await expect(
        readerRegionPreview(
          t.reader,
          { pageIndex: 0, rects: [[0, 0, 900, 900]] },
          new AbortController().signal,
          clip,
        ),
      ).rejects.toThrow();
      for (const rects of [
        [
          [10, 20, 30, 40],
          [30, 20, 10, 40],
        ] as const,
        Array.from({ length: 257 }, () => [10, 20, 30, 40] as const),
      ])
        await expect(
          readerRegionPreview(
            t.reader,
            { pageIndex: 0, rects },
            new AbortController().signal,
            clip,
          ),
        ).rejects.toThrow();
      expect(t.render).not.toHaveBeenCalled();
      const result = readerRegionPreview(
        t.reader,
        { pageIndex: 0, rects: [[10, 20, 30, 40]] },
        new AbortController().signal,
        clip,
      );
      const rejected = expect(result).rejects.toThrow('retired');
      await vi.waitFor(() => expect(t.render).toHaveBeenCalledOnce());
      t.window.PDFViewerApplication.pdfDocument = {
        ...t.window.PDFViewerApplication.pdfDocument,
        numPages: 2,
      };
      t.completion.resolve();
      await rejected;
    },
  );
});
