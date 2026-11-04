import { describe, expect, it } from 'vitest';
import { createReaderAIRepository, type ReaderAIStorage } from '../../src/reader-ai/repository';
import type { ReaderAIRecord, ReaderAISource } from '../../src/reader-ai/contracts';

const source: ReaderAISource = {
  itemID: 1,
  libraryID: 2,
  key: 'ABC',
  fingerprint: 'old',
  fileName: 'paper.pdf',
};
const record: ReaderAIRecord = {
  id: 'one',
  revision: 1,
  source,
  kind: 'question',
  question: 'Why?',
  contextTitle: 'Paper',
  evidence: [],
  output: { paragraphs: [{ text: 'Unknown', evidenceIDs: [] }], guide: [] },
  model: 'model',
  endpoint: 'https://example.test',
  usage: { inputTokens: null, outputTokens: null },
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  userText: null,
};
function storage(initial: string | null = null) {
  let contents = initial;
  let fail = false;
  const io: ReaderAIStorage = {
    async read() {
      return contents;
    },
    async write(_source, value, current) {
      if (!(await current())) return false;
      if (fail) throw new Error('commit failed');
      contents = value;
      return true;
    },
  };
  return {
    io,
    contents: () => contents,
    fail: () => {
      fail = true;
    },
  };
}
describe('reader AI repository', () => {
  it('preserves generated output and older fingerprints while serializing optimistic edits', async () => {
    const disk = storage();
    const repo = createReaderAIRepository(disk.io);
    await repo.add(record, async () => true);
    const nextSource = { ...source, fingerprint: 'new' };
    expect(await repo.list(nextSource)).toEqual([record]);
    const results = await Promise.allSettled([
      repo.edit(nextSource, 'one', 1, 'first'),
      repo.edit(nextSource, 'one', 1, 'second'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const [edited] = await repo.list(source);
    expect(edited.revision).toBe(2);
    expect(edited.output).toEqual(record.output);
    expect(edited.userText).toBe('first');
    await expect(repo.remove(source, 'one', 1)).rejects.toThrow('storage');
    await repo.remove(source, 'one', 2);
    expect(await repo.list(source)).toEqual([]);
  });
  it('never replaces a corrupt store or a previously committed file on failure', async () => {
    const corrupt = storage('{broken');
    const repo = createReaderAIRepository(corrupt.io);
    await expect(repo.list(source)).rejects.toThrow('storage');
    await expect(repo.add(record, async () => true)).rejects.toThrow('storage');
    expect(corrupt.contents()).toBe('{broken');
    const disk = storage();
    const valid = createReaderAIRepository(disk.io);
    await valid.add(record, async () => true);
    const before = disk.contents();
    disk.fail();
    await expect(valid.edit(source, 'one', 1, 'edit')).rejects.toThrow('storage');
    expect(disk.contents()).toBe(before);
  });
  it('rejects records with unsupported evidence instead of creating links', async () => {
    const disk = storage();
    const repo = createReaderAIRepository(disk.io);
    const invalid = {
      ...record,
      evidence: [
        {
          id: 'x',
          kind: 'unsupported',
          title: '',
          text: '',
          format: 'text',
          pageLabel: null,
          precision: 'text',
          location: null,
          nativePosition: null,
        },
      ],
    } as unknown as ReaderAIRecord;
    await expect(repo.add(invalid, async () => true)).rejects.toThrow('storage');
    expect(disk.contents()).toBeNull();
  });
  it('does not commit when the captured source is no longer current', async () => {
    const disk = storage();
    await expect(createReaderAIRepository(disk.io).add(record, async () => false)).rejects.toThrow(
      'stale-source',
    );
    expect(disk.contents()).toBeNull();
  });
  it.each([
    { rects: [] },
    { rects: [[0, 0, 0, 1]] },
    { rects: [[2, 0, 1, 1]] },
    { rects: [[0, 2, 1, 1]] },
    { rects: [[0, 0, Number.NaN, 1]] },
    { rects: Array.from({ length: 257 }, () => [0, 0, 1, 1]) },
  ])(
    'rejects corrupt or unsupported saved rectangles without replacing the file: %j',
    async ({ rects }) => {
      const malformed = {
        ...record,
        evidence: [
          {
            id: 'source',
            kind: 'figure',
            title: 'Original figure',
            text: '',
            format: 'text',
            pageLabel: '1',
            precision: 'region',
            nativePosition: null,
            location: { pageIndex: 0, rects },
          },
        ],
      };
      const original = JSON.stringify({ version: 1, records: [malformed] });
      const disk = storage(original);
      const repo = createReaderAIRepository(disk.io);
      await expect(repo.list(source)).rejects.toThrow('storage');
      await expect(repo.add({ ...record, id: 'new' }, async () => true)).rejects.toThrow('storage');
      expect(disk.contents()).toBe(original);
    },
  );
});
