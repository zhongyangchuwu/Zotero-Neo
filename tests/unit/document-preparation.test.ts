import { describe, expect, it, vi } from 'vitest';
import {
  DocumentPreparationQueue,
  preparationRecord,
  restorePreparation,
  type DocumentAttachment,
  type PreparedAttachment,
  type PreparationHost,
} from '../../src/document-analysis/preparation';
import { mineruParsedDocument } from '../../src/document-analysis/mineru';
import type { ParsedDocument } from '../../src/document-analysis/contracts';
import type {
  DocumentHttpRequest,
  DocumentServiceTransport,
} from '../../src/document-analysis/transport';

const attachment = (itemID: number): DocumentAttachment => ({
  itemID,
  libraryID: 1,
  key: itemID.toString(36).toUpperCase().padStart(8, '0'),
  title: `Paper ${itemID}`,
});
const layout = {
  pdf_info: [
    {
      page_idx: 0,
      page_size: [600, 800],
      discarded_blocks: [],
      para_blocks: [{ type: 'table', bbox: [10, 10, 100, 100] }],
    },
  ],
};
function harness() {
  const uploaded = new Set<string>(),
    failed = new Set<string>(),
    batches = new Map<string, string[]>(),
    cache = new Map<number, ParsedDocument>(),
    missing = new Set<number>(),
    saveFails = new Set<number>();
  let serial = 0;
  const http: DocumentServiceTransport = {
    requestJSON: vi.fn(async (request) => {
      if (request.url.endsWith('/file-urls/batch')) {
        const ids = (JSON.parse(String(request.body)).files as { data_id: string }[]).map(
            (f) => f.data_id,
          ),
          batchID = `batch-${++serial}`;
        batches.set(batchID, ids);
        return {
          code: 0,
          data: {
            batch_id: batchID,
            file_urls: ids.map((id) => `https://storage.example/upload/${id}?signed=private`),
          },
        };
      }
      const ids = batches.get(request.url.split('/').at(-1)!) ?? [];
      return {
        code: 0,
        data: {
          extract_result: [...ids].reverse().map((data_id) => ({
            data_id,
            state: failed.has(data_id) ? 'failed' : uploaded.has(data_id) ? 'done' : 'waiting-file',
            full_zip_url: 'https://storage.example/result.zip?signed=private',
          })),
        },
      };
    }),
    upload: vi.fn(async (request) => {
      uploaded.add(new URL(request.url).pathname.split('/').at(-1)!);
    }),
    download: vi.fn(async () => new Uint8Array([1])),
    readArchive: vi.fn(async () => layout),
    wait: vi.fn(async () => {}),
  };
  const inputs = new Map<number, PreparedAttachment>();
  const input = (id: number): PreparedAttachment => {
    if (inputs.has(id)) return inputs.get(id)!;
    const source = {
      fingerprint: id.toString(16).padStart(32, '0'),
      fileName: 'owned.pdf',
      pages: [{ pageIndex: 0, viewBox: [0, 0, 600, 800] as const, rotation: 0 as const }],
    };
    const value: PreparedAttachment = {
      source,
      read: vi.fn(async () => new Uint8Array([id])),
      isCurrent: vi.fn(async () => true),
      cache: {
        read: vi.fn(async () => (cache.has(id) ? { savedAt: 1, parsed: cache.get(id)! } : null)),
        write: vi.fn(async (_source, _key, parsed, current) => {
          if (saveFails.has(id)) throw new Error('disk full');
          if (!(await current())) return false;
          cache.set(id, parsed);
          return true;
        }),
      },
    };
    inputs.set(id, value);
    return value;
  };
  let journal: unknown = null;
  const host: PreparationHost = {
    transport: http,
    debug: vi.fn(),
    readRecord: vi.fn(async () => journal),
    writeRecord: vi.fn(async (value) => {
      journal = structuredClone(value);
    }),
    prepare: vi.fn(async (target) => {
      if (missing.has(target.itemID)) throw new Error('missing');
      return input(target.itemID);
    }),
  };
  const queue = new DocumentPreparationQueue(host);
  return {
    queue,
    host,
    http,
    input,
    cache,
    missing,
    saveFails,
    uploaded,
    failed,
    batches,
    journal: () => journal,
  };
}
const run = (queue: DocumentPreparationQueue): Promise<void> =>
  queue.run('secret-token', () => new AbortController());

describe('explicit multi-file preparation', () => {
  it('replaces intermediate page counts with complete geometry counts after saving', async () => {
    const t = harness(),
      original = t.http.requestJSON;
    let first = true;
    t.http.requestJSON = vi.fn(async (request) => {
      const result = await original(request);
      if (request.method === 'GET' && first) {
        first = false;
        return {
          code: 0,
          data: {
            extract_result: [...t.batches.values()][0]!.map((data_id) => ({
              data_id,
              state: 'running',
              extract_progress: { extracted_pages: 0, total_pages: 1 },
            })),
          },
        };
      }
      return result;
    });
    await t.queue.replace([attachment(1)]);
    await run(t.queue);
    expect(t.queue.rows[0]).toMatchObject({ state: 'complete', completedPages: 1, totalPages: 1 });
    await t.queue.replace([attachment(1)]);
    await run(t.queue);
    expect(t.queue.rows[0]).toMatchObject({ state: 'cached', completedPages: 1, totalPages: 1 });
  });
  it('splits a large UI batch into at most 50 files per remote request', async () => {
    const t = harness();
    await t.queue.replace(Array.from({ length: 51 }, (_, i) => attachment(i + 1)));
    await run(t.queue);
    expect([...t.batches.values()].map((ids) => ids.length)).toEqual([50, 1]);
    expect(t.queue.rows).toHaveLength(51);
    expect(t.queue.rows.every((row) => row.state === 'complete')).toBe(true);
    expect(t.http.upload).toHaveBeenCalledTimes(51);
  });

  it('continues independently when a retired presentation observer throws', async () => {
    const t = harness();
    const stop = t.queue.subscribe(() => {
      throw new Error('closed window');
    });
    try {
      await t.queue.replace([attachment(1)]);
      await run(t.queue);
      expect(t.queue.rows[0]!.state).toBe('complete');
      expect(t.cache.has(1)).toBe(true);
    } finally {
      stop();
    }
  });
  it('rebuilds an unuploaded task after restart only after confirming waiting-file remotely', async () => {
    const t = harness();
    vi.mocked(t.http.upload).mockRejectedValueOnce(new Error('upload rejected'));
    await t.queue.replace([attachment(1)]);
    await run(t.queue);
    expect(t.queue.rows[0]!.remote?.uploaded).toBe(false);
    t.queue.dispose();
    const restored = new DocumentPreparationQueue(t.host);
    await run(restored);
    expect(restored.rows[0]!.state).toBe('complete');
    expect(t.batches.size).toBe(2);
    expect(t.uploaded.size).toBe(1);
  });
  it('rejects oversized batches before recording or submitting files', async () => {
    const t = harness();
    await expect(
      t.queue.replace(Array.from({ length: 201 }, (_, i) => attachment(i + 1))),
    ).rejects.toThrow('200');
    expect(t.host.writeRecord).not.toHaveBeenCalled();
    expect(t.http.requestJSON).not.toHaveBeenCalled();
  });
  it('isolates cached, missing and remote-failed files, matching out-of-order receipts by identity', async () => {
    const t = harness();
    t.cache.set(1, mineruParsedDocument(t.input(1).source, layout));
    t.missing.add(2);
    vi.mocked(t.http.upload).mockImplementation(async (request) => {
      const id = new URL(request.url).pathname.split('/').at(-1)!;
      t.uploaded.add(id);
      if (request.body instanceof Uint8Array && request.body[0] === 4) t.failed.add(id);
    });
    await t.queue.replace([1, 2, 3, 4].map(attachment));
    await run(t.queue);
    expect(t.queue.rows.map((r) => r.state)).toEqual(['cached', 'failed', 'complete', 'failed']);
    expect(t.http.upload).toHaveBeenCalledTimes(2);
    expect(t.cache.has(3)).toBe(true);
    expect(t.cache.has(4)).toBe(false);
    expect([...t.batches.values()][0]).toHaveLength(2);
    const journal = JSON.stringify(t.journal());
    expect(journal).not.toMatch(/secret-token|signed|storage\.example|readPDF|Authorization/);
    expect(t.queue.rows[2]!.remote?.batchID).toBe('batch-1');
  });
  it('resumes an accepted batch after a poll failure without uploading successful files again', async () => {
    const t = harness(),
      original = t.http.requestJSON;
    let fail = true;
    t.http.requestJSON = vi.fn(async (request) => {
      if (fail && request.method === 'GET') throw new Error('network');
      return original(request);
    });
    await t.queue.replace([1, 2].map(attachment));
    await run(t.queue);
    expect(t.queue.rows.every((r) => r.state === 'failed')).toBe(true);
    fail = false;
    await run(t.queue);
    expect(t.queue.rows.every((r) => r.state === 'complete')).toBe(true);
    expect(t.http.upload).toHaveBeenCalledTimes(2);
    expect(t.batches.size).toBe(1);
  });
  it('persists receipts before PUT and stops safely if the journal cannot be written', async () => {
    const t = harness();
    await t.queue.replace([attachment(1)]);
    vi.mocked(t.host.writeRecord).mockImplementation(async (value) => {
      if ((value as { rows: { remote?: unknown }[] }).rows.some((r) => r.remote))
        throw new Error('disk');
    });
    await run(t.queue);
    expect(t.queue.storageFailed).toBe(true);
    expect(t.http.upload).not.toHaveBeenCalled();
    expect(t.queue.rows[0]!.remote?.batchID).toBe('batch-1');
  });
  it('retries retrieval after cache failure while preserving other completed results', async () => {
    const t = harness();
    t.saveFails.add(1);
    await t.queue.replace([1, 2].map(attachment));
    await run(t.queue);
    expect(t.queue.rows.map((r) => r.state)).toEqual(['failed', 'complete']);
    const complete = t.cache.get(2);
    t.saveFails.clear();
    vi.mocked(t.host.prepare).mockClear();
    await run(t.queue);
    expect(t.queue.rows.map((r) => r.state)).toEqual(['complete', 'complete']);
    expect(t.host.prepare).toHaveBeenCalledTimes(1);
    expect(t.cache.get(2)).toBe(complete);
    expect(t.http.upload).toHaveBeenCalledTimes(2);
    expect(t.batches.size).toBe(1);
  });
  it('treats uncertain PUT cancellation as resumable remote work, even after restart', async () => {
    const t = harness();
    await t.queue.replace([1, 2].map(attachment));
    vi.mocked(t.http.upload).mockImplementation(async (request) => {
      t.uploaded.add(new URL(request.url).pathname.split('/').at(-1)!);
      await new Promise<void>((_resolve, reject) =>
        request.signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        }),
      );
    });
    const work = run(t.queue);
    await vi.waitFor(() => expect(t.http.upload).toHaveBeenCalledTimes(2));
    expect(await t.queue.replace([attachment(3)])).toBe(false);
    t.queue.stop();
    await work;
    expect(t.queue.rows.map((r) => r.state)).toEqual(['paused', 'paused']);
    t.queue.dispose();
    const restored = new DocumentPreparationQueue(t.host);
    await restored.init();
    await run(restored);
    expect(restored.rows.map((r) => r.state)).toEqual(['complete', 'complete']);
    expect(t.http.upload).toHaveBeenCalledTimes(2);
    expect(t.batches.size).toBe(1);
  });
  it('does not submit a changed source against an old receipt', async () => {
    const t = harness(),
      original = t.http.requestJSON;
    t.http.requestJSON = vi.fn(async (request) => {
      if (request.method === 'GET') throw new Error('network');
      return original(request);
    });
    await t.queue.replace([attachment(1)]);
    await run(t.queue);
    t.host.prepare = vi.fn(async () => ({
      ...t.input(1),
      source: { ...t.input(1).source, fingerprint: 'a'.repeat(32) },
    }));
    t.http.requestJSON = original;
    await run(t.queue);
    expect(t.queue.rows[0]).toMatchObject({ state: 'failed', failure: 'sourceChanged' });
    expect(t.batches.size).toBe(1);
  });
  it('re-submits only a confirmed remote failure and skips already cached results on retry', async () => {
    const t = harness();
    let once = true;
    vi.mocked(t.http.upload).mockImplementation(async (request) => {
      const id = new URL(request.url).pathname.split('/').at(-1)!;
      t.uploaded.add(id);
      if (once && request.body instanceof Uint8Array && request.body[0] === 1) t.failed.add(id);
    });
    await t.queue.replace([1, 2].map(attachment));
    await run(t.queue);
    once = false;
    await run(t.queue);
    expect(t.queue.rows.every((r) => r.state === 'complete')).toBe(true);
    expect(t.http.upload).toHaveBeenCalledTimes(3);
    expect([...t.batches.values()].map((ids) => ids.length)).toEqual([2, 1]);
    vi.mocked(t.host.prepare).mockClear();
    await run(t.queue);
    expect(t.host.prepare).not.toHaveBeenCalled();
  });
  it('contains a late preparation after cancellation and holds the captured selection', async () => {
    const t = harness(),
      pending = Promise.withResolvers<PreparedAttachment>();
    t.host.prepare = vi.fn(() => pending.promise);
    const selected = [attachment(1)];
    await t.queue.replace(selected);
    selected.splice(0, 1, attachment(2));
    const work = run(t.queue);
    await vi.waitFor(() => expect(t.host.prepare).toHaveBeenCalledOnce());
    t.queue.stop();
    pending.resolve(t.input(1));
    await work;
    expect(t.queue.rows[0]!.target.itemID).toBe(1);
    expect(t.http.upload).not.toHaveBeenCalled();
    expect(t.cache.size).toBe(0);
  });
  it('checks caches without a token and never submits uncached PDFs without credentials', async () => {
    const t = harness();
    t.cache.set(1, mineruParsedDocument(t.input(1).source, layout));
    await t.queue.replace([1, 2].map(attachment));
    await t.queue.run('', () => new AbortController());
    expect(t.queue.rows.map((r) => r.state)).toEqual(['cached', 'failed']);
    expect(t.http.requestJSON).not.toHaveBeenCalled();
  });
  it('limits upload concurrency and does not accumulate whole-file buffers before workers are available', async () => {
    const t = harness();
    let active = 0,
      peak = 0;
    vi.mocked(t.http.upload).mockImplementation(async (request) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      t.uploaded.add(new URL(request.url).pathname.split('/').at(-1)!);
      active--;
    });
    await t.queue.replace([1, 2, 3, 4].map(attachment));
    await run(t.queue);
    expect(peak).toBe(2);
    expect(t.queue.rows.every((r) => r.state === 'complete')).toBe(true);
  });
  it('projects non-secret fields and rejects incompatible or corrupt restored records', async () => {
    const t = harness();
    await t.queue.replace([attachment(1)]);
    const row = {
      ...t.queue.rows[0]!,
      state: 'running' as const,
      fingerprint: 'a'.repeat(32),
      remote: { batchID: 'batch', dataID: 'document', createdAt: 1, uploaded: true },
      apiKey: 'never',
    };
    const saved = preparationRecord([row]);
    expect(JSON.stringify(saved)).not.toContain('never');
    expect(restorePreparation(saved)[0]).toMatchObject({
      state: 'paused',
      remote: { batchID: 'batch' },
    });
    const bad = structuredClone(saved) as { cacheKey: { adapterVersion: number } };
    bad.cacheKey.adapterVersion++;
    expect(restorePreparation(bad)).toEqual([]);
    expect(restorePreparation({ ...(saved as object), rows: [row, row] })).toEqual([]);
  });
});
