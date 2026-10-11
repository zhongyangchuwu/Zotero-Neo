import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderCaptionTargets } from '../../src/reader/caption-targets';

const originalZotero = Reflect.get(globalThis, 'Zotero');
afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function caption(title: string, pageRects: readonly (readonly number[])[]) {
  return { type: 'caption', content: [{ text: title }], anchor: { pageRects } };
}

function harness(blocks: readonly unknown[]) {
  const getReader = vi.fn(async () => ({
    getTopLevelBlockCount: () => blocks.length,
    getBlocks: async () => blocks,
  }));
  Reflect.set(globalThis, 'Zotero', { SDT: { getReader } });
  const onChange = vi.fn();
  const debug = vi.fn();
  const targets = new ReaderCaptionTargets(2, onChange, debug);
  return { targets, getReader, onChange, debug };
}

describe('Reader caption targets', () => {
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
    expect(test.targets.entries).toEqual([
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
});
