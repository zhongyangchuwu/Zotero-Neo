import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderCaptionTargets } from '../../src/modules/reader-navigation/caption-targets';
import type { ReaderCachedDocument } from '../../src/modules/reader-navigation/document-cache';
import type { ParsedDocument } from '../../src/document-analysis/contracts';

const parsed: ParsedDocument = {
  schemaVersion: 1,
  backend: 'mineru',
  sourceFingerprint: 'owned',
  modelRevision: null,
  durationMs: 10,
  pages: [{ pageIndex: 0, viewBox: [0, 0, 600, 800], rotation: 0 }],
  regions: [0, 1, 2].map((i) => ({
    id: `body:${i}`,
    sourceObject: { id: `table:${i}`, kind: 'table' },
    kind: 'table',
    pageIndex: 0,
    rect: [50, 500 - i * 100, 500, 580 - i * 100],
    text: '',
    format: 'text',
    flow: 'auxiliary',
    anchorPrecision: 'region',
  })),
};
function harness() {
  const native = vi.fn(async () => ({
    getTopLevelBlockCount: () => 1,
    getBlocks: async () => [
      {
        type: 'heading',
        content: [{ text: '1 Methods' }],
        anchor: { pageRects: [[0, 50, 720, 300, 750]] },
      },
    ],
  }));
  vi.stubGlobal('Zotero', { SDT: { getReader: native } });
  const current = vi.fn().mockResolvedValue(true),
    read = vi
      .fn<() => Promise<ReaderCachedDocument | null>>()
      .mockResolvedValue({ parsed, isCurrent: current });
  const changed = vi.fn(),
    debug = vi.fn();
  const targets = new ReaderCaptionTargets(2, changed, debug, () => true, {
    read,
    unnamedTitle: (kind, page) => `${kind} on page ${page + 1}`,
  });
  return { targets, native, current, read, changed, debug };
}
afterEach(() => vi.unstubAllGlobals());
describe('cached graph targets', () => {
  it('publishes independent uncaptioned tables without cold SDT and keeps heading correction separate', async () => {
    const t = harness();
    const entries = await t.targets.load();
    expect(t.native).not.toHaveBeenCalled();
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((e) => e.id)).size).toBe(3);
    expect(
      entries.every(
        (e) =>
          e.kind === 'table' &&
          e.label === '' &&
          e.title === 'table on page 1' &&
          e.source === 'cache',
      ),
    ).toBe(true);
    await t.targets.loadHeadings();
    expect(
      t.targets.headingPosition({
        title: '1 Methods',
        location: { position: { pageIndex: 0, rects: [[0, 700, 0, 700]] } },
      }),
    ).toEqual({ pageIndex: 0, rects: [[50, 720, 300, 750]] });
    expect(t.targets.entries).toBe(entries);
    await t.targets.load();
    expect(t.read).toHaveBeenCalledTimes(1);
    expect(t.native).toHaveBeenCalledTimes(1);
  });
  it.each(['missing', 'unreadable', 'empty'] as const)(
    'uses native fallback for %s cache',
    async (failure) => {
      const t = harness();
      if (failure === 'unreadable') t.read.mockRejectedValue(new Error('unreadable'));
      else
        t.read.mockResolvedValue(
          failure === 'missing'
            ? null
            : { parsed: { ...parsed, regions: [] }, isCurrent: t.current },
        );
      expect(await t.targets.load()).toEqual([]);
      expect(t.targets.state).toBe('ready');
      expect(t.native).toHaveBeenCalledTimes(1);
    },
  );
  it('rechecks file/service identity before using cached targets and retires old choices', async () => {
    const t = harness(),
      old = (await t.targets.load())[0]!;
    expect(await t.targets.sourceCurrent(old)).toBe(true);
    t.current.mockResolvedValue(false);
    t.read.mockResolvedValue(null);
    await t.targets.load();
    expect(t.targets.entries).toEqual([]);
    expect(t.native).toHaveBeenCalledTimes(1);
    expect(await t.targets.sourceCurrent(old)).toBe(false);
  });
  it('allows an explicit saved result to supersede an old lookup and contains disposal', async () => {
    const t = harness(),
      late = Promise.withResolvers<ReaderCachedDocument | null>();
    t.read.mockReturnValueOnce(late.promise);
    const old = t.targets.load();
    await Promise.resolve();
    t.targets.invalidate();
    const fresh = await t.targets.load();
    expect(fresh).toHaveLength(3);
    late.resolve({ parsed: { ...parsed, regions: [] }, isCurrent: t.current });
    await old;
    expect(t.targets.entries).toBe(fresh);
    t.targets.invalidate();
    const pending = Promise.withResolvers<ReaderCachedDocument | null>();
    t.read.mockReturnValueOnce(pending.promise);
    const task = t.targets.load();
    await Promise.resolve();
    t.targets.dispose();
    const changed = t.changed.mock.calls.length;
    pending.resolve({ parsed, isCurrent: t.current });
    expect(await task).toEqual([]);
    expect(t.targets.entries).toEqual([]);
    expect(t.changed).toHaveBeenCalledTimes(changed);
  });
});
