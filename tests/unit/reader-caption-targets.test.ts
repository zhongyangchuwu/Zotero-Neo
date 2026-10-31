import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderCaptionTargets } from '../../src/modules/reader-navigation/caption-targets';

const originalZotero = Reflect.get(globalThis, 'Zotero');
afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function caption(title: string, pageRects: readonly (readonly number[])[]) {
  return { type: 'caption', content: [{ text: title }], anchor: { pageRects } };
}

function image(pageRects: readonly (readonly number[])[]) {
  return { type: 'image', anchor: { pageRects } };
}

function harness(blocks: readonly unknown[]) {
  const getReader = vi.fn(async () => ({
    getTopLevelBlockCount: () => blocks.length,
    getBlocks: async () => blocks,
  }));
  Reflect.set(globalThis, 'Zotero', { SDT: { getReader } });
  const onChange = vi.fn();
  const debug = vi.fn();
  const targets = new ReaderCaptionTargets(2, onChange, debug, () => true);
  return { targets, getReader, onChange, debug };
}

describe('Reader caption targets', () => {
  it('drops a pending native result when module ownership ends without disposal', async () => {
    let current = true;
    const blocks = Promise.withResolvers<readonly unknown[]>();
    const started = Promise.withResolvers<void>();
    Reflect.set(globalThis, 'Zotero', {
      SDT: {
        getReader: async () => ({
          getTopLevelBlockCount: () => 1,
          getBlocks: () => {
            started.resolve();
            return blocks.promise;
          },
        }),
      },
    });
    const changed = vi.fn();
    const debug = vi.fn();
    const targets = new ReaderCaptionTargets(2, changed, debug, () => current);
    const loading = targets.load();
    await started.promise;
    current = false;
    blocks.resolve([caption('Figure 1: stale', [[0, 10, 20, 30, 40]])]);
    await expect(loading).resolves.toEqual([]);
    expect(targets.entries).toEqual([]);
    expect(changed).toHaveBeenCalledOnce();
    expect(debug).not.toHaveBeenCalled();
  });

  it('corrects a previous-page bookmark to its unique genuine next-page heading', async () => {
    // Zotero 10.0.6 OpenVLA: the authored 3.2 bookmark is page 4's bottom,
    // but the actual heading is at page 5's top (zero-based indexes 3 and 4).
    const test = harness([
      {
        type: 'heading',
        content: [{ text: '3.2OpenVLA Training Procedure' }],
        anchor: { pageRects: [[4, 108, 707.95, 250.53, 716.91]] },
      },
      caption('Figure 2: Model', [[3, 108, 527.25, 504, 565.26]]),
    ]);
    const entry = {
      title: 'OpenVLA Training Procedure',
      location: { position: { pageIndex: 3, rects: [[0, 70.401, 0, 70.401]] } },
    };
    expect(test.targets.headingPosition(entry)).toBeNull();
    await test.targets.load();
    expect(test.targets.headingPosition(entry)).toEqual({
      pageIndex: 4,
      rects: [[108, 707.95, 250.53, 716.91]],
    });
    expect(entry.location.position.pageIndex).toBe(3);
    expect(test.targets.entries.map((target) => target.kind)).toEqual(['figure']);
    test.targets.dispose();
    expect(test.targets.headingPosition(entry)).toBeNull();
  });

  it('matches appendix ordinals and normalized text without adding absent authored headings', async () => {
    const test = harness([
      {
        type: 'heading',
        content: [{ text: 'B.3.1Franka-Tabletop and ' }, { text: 'Franka-DROID Tasks' }],
        anchor: { pageRects: [[28, 108, 707.95, 317.05, 716.91]] },
      },
      {
        type: 'heading',
        content: [{ text: 'Acknowledgments' }],
        anchor: { pageRects: [[28, 108, 200, 300, 210]] },
      },
    ]);
    await test.targets.load();
    expect(
      test.targets.headingPosition({
        title: ' FRANKA-Tabletop\u00a0and Franka-DROID Tasks ',
        location: { position: { pageIndex: 28, rects: [[0, 725, 0, 725]] } },
      }),
    ).toEqual({ pageIndex: 28, rects: [[108, 707.95, 317.05, 716.91]] });
    expect(
      test.targets.headingPosition({
        title: 'Missing Section',
        location: { position: { pageIndex: 28, rects: [[0, 100, 0, 100]] } },
      }),
    ).toBeNull();
    expect(test.targets.entries).toEqual([]);
  });

  it('retains authored geometry for ambiguous, distant, invalid or non-heading matches', async () => {
    const block = (title: string, pageIndex: number) => ({
      type: 'heading',
      content: [{ text: title }],
      anchor: { pageRects: [[pageIndex, 108, 700, 300, 710]] },
    });
    const test = harness([
      block('1Repeated', 3),
      block('2Repeated', 4),
      block('3Distant', 5),
      block('4Before', 2),
      { ...block('5Body text', 4), type: 'paragraph' },
      { ...block('6Invalid', 4), anchor: { pageRects: [[4, 300, 700, 108, 710]] } },
      block('Unrelated Title', 4),
    ]);
    await test.targets.load();
    for (const title of ['Repeated', 'Distant', 'Before', 'Body text', 'Invalid', 'Title']) {
      expect(
        test.targets.headingPosition({
          title,
          location: { position: { pageIndex: 3, rects: [[0, 70, 0, 70]] } },
        }),
      ).toBeNull();
    }
  });

  it('loads lazily once and maps only genuine labeled captions with valid first-page anchors', async () => {
    const figure = caption('Figure 1: OpenVLA overview.', [[0, 108, 319.93, 504.31, 367.56]]);
    const table = caption('Table 3: Evaluation results.', [
      [21, 50, 100, 500, 120],
      [20, 60, 50, 500, 90],
    ]);
    const test = harness([
      figure,
      { ...figure, content: [{ text: 'Figure 1: Repeated caption fragment.' }] },
      table,
      { ...figure, type: 'image' },
      { ...figure, type: 'paragraph' },
      caption('A diagram without an authored label', [[0, 10, 20, 30, 40]]),
      caption('Table 8: No usable anchor', []),
      caption('Figure 2: Invalid page', [[-1, 10, 20, 30, 40]]),
      caption('Figure 3: Invalid rectangle', [[1, 30, 20, 10, 40]]),
      caption('Figure 4: Invalid coordinate', [[1, 10, NaN, 30, 40]]),
      {
        type: 'caption',
        content: [{ text: '图' }, { text: '二：流程' }],
        anchor: { pageRects: [[2, 10, 20, 30, 40]] },
      },
    ]);
    expect(test.getReader).not.toHaveBeenCalled();
    const first = test.targets.load();
    const second = test.targets.load();
    expect(test.targets.state).toBe('loading');
    expect(await second).toEqual(await first);
    expect(test.targets.entries).toMatchObject([
      {
        title: figure.content[0].text,
        kind: 'figure',
        label: '1',
        location: { position: { pageIndex: 0, rects: [[108, 319.93, 504.31, 367.56]] } },
      },
      {
        title: table.content[0].text,
        kind: 'table',
        label: '3',
        location: { position: { pageIndex: 20, rects: [[60, 50, 500, 90]] } },
      },
      {
        title: '图二：流程',
        kind: 'figure',
        label: '二',
        location: { position: { pageIndex: 2, rects: [[10, 20, 30, 40]] } },
      },
    ]);
    expect(test.targets.state).toBe('ready');
    await test.targets.load();
    expect(test.getReader).toHaveBeenCalledOnce();
  });

  it('retains image and all caption fragments while keeping caption-derived identity', async () => {
    const test = harness([
      image([[0, 100, 400, 500, 700]]),
      caption('Figure 1: Overview', [[0, 110, 340, 490, 390]]),
      caption('Figure 1: Repeated caption fragment', [[0, 110, 330, 490, 335]]),
    ]);
    expect(await test.targets.load()).toMatchObject([
      {
        title: 'Figure 1: Overview',
        kind: 'figure',
        label: '1',
        location: {
          position: {
            pageIndex: 0,
            rects: [
              [100, 400, 500, 700],
              [110, 340, 490, 390],
              [110, 330, 490, 335],
            ],
          },
        },
      },
    ]);
  });

  it('lands on OpenVLA Figure 2 despite native image/caption coordinate precision differences', async () => {
    // Zotero 10.0.6 SDT, original top-level blocks 22–23 of arxiv2406.09246v3.
    const test = harness([
      image([[3, 107.99993669400001, 573.0210949589999, 503.99390690999996, 720.0012940109999]]),
      caption('Figure 2: OpenVLA model architecture.', [[3, 108, 527.25, 504, 565.26]]),
    ]);
    expect((await test.targets.load())[0].location.position).toEqual({
      pageIndex: 3,
      rects: [
        [107.99993669400001, 573.0210949589999, 503.99390690999996, 720.0012940109999],
        [108, 527.25, 504, 565.26],
      ],
    });
  });

  it('lands on OpenVLA Figure 10 across excluded chart-label text contained inside its image', async () => {
    // Zotero 10.0.6 SDT, original top-level blocks 197–199; the paragraph is an image-axis label.
    const test = harness([
      image([[28, 147.599, 158.675, 464.409, 597.335]]),
      {
        type: 'paragraph',
        flowClass: 'excluded',
        anchor: { pageRects: [[28, 158.78, 217.49, 165.56, 528.75]] },
        content: [{ text: 'Diverse Multi-Instruction Tasks Narrow Single-Instruction Tasks' }],
      },
      caption('Figure 10: Franka-Tabletop fine-tuning tasks.', [
        [28, 107.72, 73.05, 505.57, 150.91],
      ]),
    ]);
    expect((await test.targets.load())[0].location.position).toEqual({
      pageIndex: 28,
      rects: [
        [147.599, 158.675, 464.409, 597.335],
        [158.78, 217.49, 165.56, 528.75],
        [107.72, 73.05, 505.57, 150.91],
      ],
    });
  });

  it('keeps adjacent figures separate and includes rasterized tables with their caption', async () => {
    const test = harness([
      image([[3, 50, 500, 290, 700]]),
      caption('Figure 2: Left graphic', [[3, 55, 450, 285, 490]]),
      image([[3, 320, 500, 560, 700]]),
      caption('Figure 3: Right graphic', [[3, 325, 450, 555, 490]]),
      image([[4, 50, 300, 560, 650]]),
      caption('Table 1: Results', [[4, 55, 250, 555, 290]]),
    ]);
    const entries = await test.targets.load();
    expect(entries.map((entry) => [entry.kind, entry.label, entry.location.position])).toEqual([
      [
        'figure',
        '2',
        {
          pageIndex: 3,
          rects: [
            [50, 500, 290, 700],
            [55, 450, 285, 490],
          ],
        },
      ],
      [
        'figure',
        '3',
        {
          pageIndex: 3,
          rects: [
            [320, 500, 560, 700],
            [325, 450, 555, 490],
          ],
        },
      ],
      [
        'table',
        '1',
        {
          pageIndex: 4,
          rects: [
            [50, 300, 560, 650],
            [55, 250, 555, 290],
          ],
        },
      ],
    ]);
  });

  it('uses all genuine rectangles of one native image region, without inventing a bounding anchor', async () => {
    const test = harness([
      image([
        [2, 60, 400, 280, 680],
        [2, 300, 410, 520, 690],
      ]),
      caption('Figure 4: Two panels', [[2, 55, 350, 525, 390]]),
    ]);
    expect((await test.targets.load())[0].location.position).toEqual({
      pageIndex: 2,
      rects: [
        [60, 400, 280, 680],
        [300, 410, 520, 690],
        [55, 350, 525, 390],
      ],
    });
  });

  it.each([
    ['another column', [image([[0, 320, 400, 560, 700]])]],
    ['partial column overlap', [image([[0, 250, 400, 450, 700]])]],
    ['image below caption', [image([[0, 50, 100, 290, 250]])]],
    ['overlapping image and caption', [image([[0, 50, 350, 290, 700]])]],
    ['previous page', [image([[1, 50, 400, 290, 700]])]],
    [
      'cross-page image',
      [
        image([
          [0, 50, 400, 290, 700],
          [1, 50, 400, 290, 700],
        ]),
      ],
    ],
    ['invalid image anchor', [image([[0, 50, 400, NaN, 700]])]],
    ['unanchored image', [{ type: 'image' }]],
    ['intervening body block', [image([[0, 50, 400, 290, 700]]), { type: 'paragraph' }]],
    [
      'unanchored excluded text',
      [
        image([[0, 50, 400, 290, 700]]),
        {
          type: 'paragraph',
          flowClass: 'excluded',
        },
      ],
    ],
    [
      'ordinary text inside the image',
      [
        image([[0, 50, 400, 290, 700]]),
        {
          type: 'paragraph',
          anchor: { pageRects: [[0, 60, 450, 70, 650]] },
        },
      ],
    ],
    ['low column overlap', [image([[0, 10, 400, 200, 700]])]],
  ])('retains the caption rather than guessing from %s', async (_name, preceding) => {
    const test = harness([
      ...(preceding as readonly unknown[]),
      caption('Figure 5: Caption only', [[0, 55, 340, 285, 390]]),
    ]);
    expect((await test.targets.load())[0].location.position).toEqual({
      pageIndex: 0,
      rects: [[55, 340, 285, 390]],
    });
  });

  it('does not guess across a caption page boundary or promote unlabeled images', async () => {
    const test = harness([
      image([[0, 50, 500, 290, 700]]),
      caption('Figure 6: Continued caption', [
        [0, 55, 450, 285, 490],
        [1, 55, 700, 285, 740],
      ]),
      image([[1, 50, 500, 290, 650]]),
      caption('An unlabeled illustration', [[1, 55, 450, 285, 490]]),
      image([[2, 50, 500, 290, 700]]),
    ]);
    expect(await test.targets.load()).toMatchObject([
      {
        title: 'Figure 6: Continued caption',
        kind: 'figure',
        label: '6',
        location: { position: { pageIndex: 0, rects: [[55, 450, 285, 490]] } },
      },
    ]);
  });

  it('does not attach a later image or reuse the preceding figure image for a second caption', async () => {
    const test = harness([
      image([[0, 50, 500, 290, 700]]),
      caption('Figure 7: First graphic', [[0, 55, 450, 285, 490]]),
      caption('Figure 8: No associated graphic', [[0, 55, 350, 285, 390]]),
      image([[0, 50, 200, 290, 340]]),
    ]);
    const entries = await test.targets.load();
    expect(entries.map((entry) => entry.location.position)).toEqual([
      {
        pageIndex: 0,
        rects: [
          [50, 500, 290, 700],
          [55, 450, 285, 490],
        ],
      },
      { pageIndex: 0, rects: [[55, 350, 285, 390]] },
    ]);
  });

  it.each(['missing API', 'unavailable pack', 'failed extraction'] as const)(
    'exposes unavailable data honestly for %s',
    async (failure) => {
      const test = harness([]);
      if (failure === 'missing API') Reflect.set(globalThis, 'Zotero', {});
      else if (failure === 'unavailable pack') test.getReader.mockResolvedValue(null as never);
      else test.getReader.mockRejectedValue(new Error('native extraction failed'));
      await test.targets.load();
      expect(test.targets.state).toBe('unavailable');
      expect(test.targets.entries).toEqual([]);
      if (failure === 'failed extraction') expect(test.debug).toHaveBeenCalledOnce();
    },
  );

  it('does not initiate native processing when disposed before the queued explicit request', async () => {
    const test = harness([]);
    const pending = test.targets.load();
    test.targets.dispose();
    await pending;
    expect(test.getReader).not.toHaveBeenCalled();
    expect(test.targets.entries).toEqual([]);
  });

  it('ignores native processing results after session retirement without claiming cancellation', async () => {
    const test = harness([]);
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof test.getReader>>>();
    test.getReader.mockReturnValue(pending.promise);
    const request = test.targets.load();
    await Promise.resolve();
    test.targets.dispose();
    const notifications = test.onChange.mock.calls.length;
    pending.resolve({
      getTopLevelBlockCount: () => 1,
      getBlocks: async () => [caption('Figure 1: Overview', [[0, 10, 20, 30, 40]])],
    });
    await request;
    expect(test.targets.entries).toEqual([]);
    expect(test.onChange).toHaveBeenCalledTimes(notifications);
  });

  it('does not publish image-aware targets if retirement occurs while native blocks are loading', async () => {
    const test = harness([]);
    const reading = Promise.withResolvers<void>();
    const blocks = Promise.withResolvers<readonly unknown[]>();
    test.getReader.mockResolvedValue({
      getTopLevelBlockCount: () => 2,
      getBlocks: () => {
        reading.resolve();
        return blocks.promise;
      },
    });
    const request = test.targets.load();
    await reading.promise;
    test.targets.dispose();
    const notifications = test.onChange.mock.calls.length;
    blocks.resolve([
      image([[0, 50, 400, 290, 700]]),
      caption('Figure 9: Retired graphic', [[0, 55, 350, 285, 390]]),
    ]);
    expect(await request).toEqual([]);
    expect(test.targets.entries).toEqual([]);
    expect(test.onChange).toHaveBeenCalledTimes(notifications);
  });
});
