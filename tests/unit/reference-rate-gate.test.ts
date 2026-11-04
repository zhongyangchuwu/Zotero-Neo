import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../src/platform/reference-http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/platform/reference-http')>()),
  referenceRequest: vi.fn(),
}));
vi.mock('../../src/platform/reference-credentials', () => ({
  readReferenceKey: () => '',
  changeReferenceKey: vi.fn(),
}));
import { referenceRequest } from '../../src/platform/reference-http';

let now: number;
const starts: number[] = [];
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  now = 100_000;
  starts.length = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.mocked(referenceRequest)
    .mockReset()
    .mockImplementation(async () => {
      starts.push(Date.now());
      return { status: 404, text: '' };
    });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each([
  ['s2', 1000],
  ['arxiv', 3000],
] as const)(
  'spaces %s starts across service instances after late timer delivery',
  async (provider, interval) => {
    // Reload to give each test an isolated module-global provider gate.
    const { createReferenceMetadataService } = await import('../../src/references/metadata');
    const first = createReferenceMetadataService();
    const second = createReferenceMetadataService();
    const query = (id: number) =>
      provider === 's2' ? { text: `paper ${id}` } : { text: '', arxivID: `2001.0000${id}` };
    const signal = () => new AbortController().signal;
    await first.lookup(query(1), signal());
    const pending1 = second.lookup(query(2), signal());
    const pending2 = first.lookup(query(3), signal());
    now += interval * 5;
    await vi.advanceTimersByTimeAsync(interval * 3);
    expect(starts).toEqual([100_000, now]);
    now += interval;
    await vi.advanceTimersByTimeAsync(interval);
    await Promise.all([pending1, pending2]);
    expect(starts).toEqual([100_000, 100_000 + interval * 5, 100_000 + interval * 6]);
  },
);

it('removes cancelled pending calls without filling the shared arXiv queue', async () => {
  // Reload to give each test an isolated module-global provider gate.
  const { createReferenceMetadataService } = await import('../../src/references/metadata');
  const first = createReferenceMetadataService();
  const second = createReferenceMetadataService();
  await first.lookup({ text: '', arxivID: '2001.00001' }, new AbortController().signal);
  for (let i = 0; i < 15; i++) {
    const controller = new AbortController();
    const cancelled = first.lookup({ text: '', arxivID: '2001.00002' }, controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toThrow('cancelled');
  }
  const pending = second.lookup({ text: '', arxivID: '2001.00003' }, new AbortController().signal);
  now += 3000;
  await vi.advanceTimersByTimeAsync(3000);
  await expect(pending).resolves.toEqual({ kind: 'not-found' });
  expect(starts).toEqual([100_000, 103_000]);
});

it('rejects requests beyond the bounded wait and releases cancelled capacity', async () => {
  // Reload to give each test an isolated module-global provider gate.
  const { createReferenceMetadataService } = await import('../../src/references/metadata');
  const service = createReferenceMetadataService();
  await service.lookup({ text: '', arxivID: '2001.00001' }, new AbortController().signal);
  const controllers = Array.from({ length: 10 }, () => new AbortController());
  const pending = controllers.map((controller) =>
    service.lookup({ text: '', arxivID: '2001.00002' }, controller.signal).catch((error) => error),
  );
  await expect(
    service.lookup({ text: '', arxivID: '2001.00003' }, new AbortController().signal),
  ).rejects.toThrow('queue is full');
  controllers.forEach((controller) => controller.abort());
  const cancelled = await Promise.all(pending);
  expect(cancelled.every((error) => error.message.includes('cancelled'))).toBe(true);
  const next = service.lookup({ text: '', arxivID: '2001.00003' }, new AbortController().signal);
  now += 3000;
  await vi.advanceTimersByTimeAsync(3000);
  await expect(next).resolves.toEqual({ kind: 'not-found' });
});
