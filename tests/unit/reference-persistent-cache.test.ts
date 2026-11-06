import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReferenceHttp from '../../src/platform/reference-http';

const host = vi.hoisted(() => ({
  disk: null as string | null,
  readError: false,
  writeError: false,
  request: vi.fn(),
}));
vi.mock('../../src/platform/reference-cache', () => ({
  readReferenceCache: async () => {
    if (host.readError) throw new Error('unreadable');
    if (host.disk && host.disk.length > 4 * 1024 * 1024) throw new Error('oversized');
    return host.disk;
  },
  writeReferenceCache: async (contents: string, current: () => boolean = () => true) => {
    if (host.writeError) throw new Error('unwritable');
    if (current()) host.disk = contents;
  },
}));
vi.mock('../../src/platform/reference-http', async (original) => ({
  ...(await original<typeof ReferenceHttp>()),
  referenceRequest: host.request,
}));
vi.mock('../../src/platform/reference-credentials', () => ({
  readReferenceKey: () => 'secret', changeReferenceKey: vi.fn(),
}));

const query = (id: string) => ({ text: '', doi: `10.1234/${id}` });
const signal = () => new AbortController().signal;
const response = (id: string) => ({ status: 200, text: JSON.stringify({
  paperId: id, title: `Paper ${id}`, authors: [{ name: 'Author' }],
  externalIds: { DOI: `10.1234/${id}` }, abstract: 'Original abstract',
}) });
async function service() {
  // Reload the module to model a new process while retaining the fake file.
  return (await import('../../src/references/metadata')).createReferenceMetadataService();
}

beforeEach(() => {
  vi.resetModules();
  host.disk = null;
  host.readError = false;
  host.writeError = false;
  host.request.mockReset();
});

describe('persistent reference metadata', () => {
  it('reuses a stored result after a cold module load without transport or credentials in the file', async () => {
    host.request.mockResolvedValue(response('one'));
    const first = await service();
    const fetched = await first.lookup(query('one'), signal());
    expect(fetched).toMatchObject({ kind: 'found', cache: { origin: 'network' } });
    expect(host.disk).not.toContain('secret');
    first.dispose();
    vi.resetModules();
    host.request.mockClear();
    const cold = await service();
    expect(await cold.lookup(query('one'), signal(), 'cache-only')).toMatchObject({
      kind: 'found', paper: { title: 'Paper one', abstract: 'Original abstract' }, cache: { origin: 'cached' },
    });
    expect(host.request).not.toHaveBeenCalled();
    cold.dispose();
  });

  it('offers stale data offline and preserves it when refresh fails, then replaces it on success', async () => {
    host.request.mockResolvedValue(response('one'));
    const first = await service();
    await first.lookup(query('one'), signal());
    first.dispose();
    const file = JSON.parse(host.disk!);
    file.entries[0][1].paper.retrievedAt = '2000-01-01T00:00:00.000Z';
    host.disk = JSON.stringify(file);
    vi.resetModules();
    const cold = await service();
    expect(await cold.lookup(query('one'), signal())).toMatchObject({ cache: { origin: 'cached', stale: true } });
    host.request.mockRejectedValueOnce(new Error('offline'));
    expect(await cold.lookup(query('one'), signal(), 'refresh')).toMatchObject({
      kind: 'found', paper: { retrievedAt: '2000-01-01T00:00:00.000Z' }, cache: { origin: 'cached', stale: true, warning: 'offline' },
    });
    host.request.mockResolvedValueOnce(response('one'));
    expect(await cold.lookup(query('one'), signal(), 'refresh')).toMatchObject({ cache: { origin: 'network', stale: false } });
    cold.dispose();
  });

  it('merges different keys from concurrent services and survives disposal of either owner', async () => {
    host.request.mockImplementation(async (url: string) => response(url.includes('one') ? 'one' : 'two'));
    const first = await service();
    const second = await service();
    await Promise.all([first.lookup(query('one'), signal()), second.lookup(query('two'), signal())]);
    first.dispose();
    second.dispose();
    vi.resetModules();
    host.request.mockClear();
    const cold = await service();
    expect(await cold.lookup(query('one'), signal())).toMatchObject({ paper: { title: 'Paper one' } });
    expect(await cold.lookup(query('two'), signal())).toMatchObject({ paper: { title: 'Paper two' } });
    expect(host.request).not.toHaveBeenCalled();
  });

  it('fences late responses after clear and does not persist cancelled work', async () => {
    const responseGate = Promise.withResolvers<{ status: number; text: string }>();
    const admission = Promise.withResolvers<void>();
    host.request.mockImplementation(() => { admission.resolve(); return responseGate.promise; });
    const first = await service();
    const second = await service();
    const pending = first.lookup(query('one'), signal());
    await admission.promise;
    await second.clearCache();
    responseGate.resolve(response('one'));
    await pending;
    vi.resetModules();
    const cold = await service();
    expect((await cold.lookup(query('one'), signal(), 'cache-only')).kind).toBe('not-found');
    const abort = new AbortController();
    const cancelled = cold.lookup(query('two'), abort.signal);
    abort.abort();
    await expect(cancelled).rejects.toThrow('cancelled');
    expect(host.disk).not.toContain('two');
  });

  it('does not save a successful response delivered after cancellation', async () => {
    const responseGate = Promise.withResolvers<{ status: number; text: string }>();
    const admission = Promise.withResolvers<void>();
    host.request.mockImplementation(() => { admission.resolve(); return responseGate.promise; });
    const current = await service();
    const controller = new AbortController();
    const pending = current.lookup(query('cancelled'), controller.signal);
    await admission.promise;
    controller.abort();
    responseGate.resolve(response('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    vi.resetModules();
    const cold = await service();
    expect((await cold.lookup(query('cancelled'), signal(), 'cache-only')).kind).toBe('not-found');
  });

  it.each(['corrupt', 'oversized', 'unreadable'] as const)('reports %s storage without preventing an explicit lookup', async (problem) => {
    host.disk = problem === 'corrupt' ? '{bad' : problem === 'oversized' ? 'x'.repeat(4 * 1024 * 1024 + 1) : null;
    host.readError = problem === 'unreadable';
    host.request.mockResolvedValue(response('one'));
    const current = await service();
    expect(await current.lookup(query('one'), signal(), 'cache-only')).toMatchObject({ kind: 'not-found', cache: { warning: expect.any(String) } });
    expect(await current.lookup(query('one'), signal())).toMatchObject({ kind: 'found', cache: { warning: expect.any(String) } });
  });

  it('reports write and clear failures without discarding a fetched result or claiming a successful clear', async () => {
    host.writeError = true;
    host.request.mockResolvedValue(response('one'));
    const current = await service();
    expect(await current.lookup(query('one'), signal())).toMatchObject({ kind: 'found', cache: { warning: expect.any(String) } });
    expect(await current.lookup(query('one'), signal())).toMatchObject({ kind: 'found', cache: { origin: 'cached' } });
    await expect(current.clearCache()).rejects.toThrow('could not be cleared');
  });
});
