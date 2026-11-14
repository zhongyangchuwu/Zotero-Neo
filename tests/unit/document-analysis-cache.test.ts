import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  mkdirSync,
  existsSync,
  statSync,
  readdirSync,
  truncateSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { analyzeParsedDocument } from '../../src/document-analysis/analyze';
import {
  documentCacheRecord,
  documentCacheSlot,
  readDocumentCacheRecord,
} from '../../src/document-analysis/cache';
import type { DocumentSource, ParsedDocument } from '../../src/document-analysis/contracts';
import { oxrDocumentParser } from '../../src/document-analysis/oxr';
import {
  attachmentDocumentCache,
  observeAttachmentDocumentCache,
} from '../../src/platform/document-analysis-cache';

import {
  readAttachmentDocumentCorrections,
  saveAttachmentDocumentCorrections,
} from '../../src/platform/document-corrections';
import {
  changeDocumentCorrection,
  emptyDocumentCorrections,
} from '../../src/document-analysis/corrections';
const source: DocumentSource = {
  fingerprint: 'original',
  fileName: 'paper.pdf',
  pages: [{ pageIndex: 0, viewBox: [0, 0, 600, 800], rotation: 0 }],
};
const parser = (baseURL = 'https://example.com/api/v1', apiKey = 'never-persist-this') =>
  oxrDocumentParser({ baseURL, apiKey, readPDF: vi.fn(), request: vi.fn() });
const key = parser().cacheKey!;
const parsed: ParsedDocument = {
  schemaVersion: 1,
  backend: 'oxr',
  sourceFingerprint: source.fingerprint,
  modelRevision: null,
  durationMs: 1200,
  pages: source.pages,
  regions: [
    {
      id: 'image',
      sourceBlock: { id: 'image', order: 0 },
      kind: 'image',
      pageIndex: 0,
      rect: [100, 500, 400, 700],
      text: '',
      format: 'text',
      flow: 'auxiliary',
      anchorPrecision: 'region',
    },
    {
      id: 'caption',
      sourceBlock: { id: 'caption', order: 1 },
      kind: 'caption',
      pageIndex: 0,
      rect: [100, 475, 400, 490],
      text: 'Figure 2: Result',
      format: 'text',
      flow: 'auxiliary',
      anchorPrecision: 'region',
    },
  ],
};

describe('persistent document result admission', () => {
  it('projects only known fields and recomputes figure groups using the current algorithm', () => {
    const record = documentCacheRecord(source, key, {
      ...parsed,
      apiKey: 'secret',
      objectGroups: [{ id: 'obsolete' }],
      regions: parsed.regions.map((r) => ({ ...r, unsafeExtra: true })),
    } as ParsedDocument);
    const serialized = JSON.stringify(record);
    expect(serialized).not.toMatch(/secret|apiKey|objectGroups|unsafeExtra/);
    const restored = readDocumentCacheRecord(JSON.parse(serialized), source, key)!;
    expect(restored.parsed).toEqual(parsed);
    expect(analyzeParsedDocument(restored.parsed, source).objectGroups).toMatchObject([
      { kind: 'figure', memberRegionIds: ['image', 'caption'] },
    ]);
  });

  it('keys explicit parser settings without credentials and normalizes equivalent endpoints', () => {
    expect(parser('https://EXAMPLE.com/api/v1/', 'another-key').cacheKey).toEqual(key);
    expect(documentCacheSlot(parser('https://other.example/api/v1').cacheKey!)).not.toBe(
      documentCacheSlot(key),
    );
    for (const address of [
      'https://user:password@example.com',
      'https://example.com?token=secret',
      'file:///tmp/api',
      'https://example.com/#secret',
    ])
      expect(() => parser(address)).toThrow('address');
  });

  it('invalidates source, page geometry, backend, adapter and configuration independently', () => {
    const saved = documentCacheRecord(source, key, parsed);
    expect(readDocumentCacheRecord(saved, { ...source, fingerprint: 'changed' }, key)).toBeNull();
    expect(
      readDocumentCacheRecord(
        saved,
        { ...source, pages: [{ ...source.pages[0]!, rotation: 90 }] },
        key,
      ),
    ).toBeNull();
    expect(
      readDocumentCacheRecord(
        saved,
        { ...source, pages: [{ ...source.pages[0]!, viewBox: [0, 0, 600, 801] }] },
        key,
      ),
    ).toBeNull();
    for (const changed of [
      { ...key, backend: 'mineru' },
      { ...key, adapterVersion: 2 },
      parser('https://other.example').cacheKey!,
    ])
      expect(readDocumentCacheRecord(saved, source, changed)).toBeNull();
    expect(readDocumentCacheRecord({ ...saved, cacheVersion: 2 }, source, key)).toBeNull();
  });

  it('rejects partial, duplicate or malformed geometry instead of dropping individual regions', () => {
    const saved = documentCacheRecord(source, key, parsed);
    const badRegions = [
      [{ ...parsed.regions[0], pageIndex: 1 }],
      [parsed.regions[0], parsed.regions[0]],
      [{ ...parsed.regions[0], rect: [0, 0, 900, 900] }],
      [{ ...parsed.regions[0], rect: [0, 0, Infinity, 1] }],
      [{ ...parsed.regions[0], anchorPrecision: 'character' }],
      [{ ...parsed.regions[0], sourceBlock: { id: 'x', order: -1 } }],
    ];
    for (const regions of badRegions)
      expect(
        readDocumentCacheRecord({ ...saved, parsed: { ...parsed, regions } }, source, key),
      ).toBeNull();
    expect(
      readDocumentCacheRecord({ ...saved, parsed: { ...parsed, pages: [] } }, source, key),
    ).toBeNull();
  });
});

const originalZotero = Reflect.get(globalThis, 'Zotero');
const originalIOUtils = Reflect.get(globalThis, 'IOUtils');
const move = vi.fn(async (source: string, destination: string) => {
  renameSync(source, destination);
});
let directory: string;
class File {
  constructor(public path: string) {}
  clone() {
    return new File(this.path);
  }
  append(value: string) {
    this.path = join(this.path, value);
  }
  get leafName() {
    return basename(this.path);
  }
  set leafName(value: string) {
    this.path = join(dirname(this.path), value);
  }
  get parent() {
    return new File(dirname(this.path));
  }
  get fileSize() {
    return statSync(this.path).size;
  }
  exists() {
    return existsSync(this.path);
  }
}
const files = {
  getContentsAsync: vi.fn(async (path: string) => readFileSync(path, 'utf8')),
  createDirectoryIfMissingAsync: vi.fn(async (path: string) => {
    mkdirSync(path, { recursive: true });
  }),
  putContentsAsync: vi.fn(async (path: string, text: string) => {
    writeFileSync(path, text);
  }),
  rename: vi.fn(async (path: string, name: string) => {
    renameSync(path, join(dirname(path), name));
    return name;
  }),
  removeIfExists: vi.fn(async (path: string) => {
    rmSync(path, { force: true });
  }),
};
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'neo-analysis-cache-'));
  vi.clearAllMocks();
  Reflect.set(globalThis, 'Zotero', {
    Items: { getAsync: async () => ({ isPDFAttachment: () => true }) },
    Attachments: { getStorageDirectory: () => new File(directory) },
    Utilities: {
      Internal: { md5: (text: string) => createHash('md5').update(text).digest('hex') },
    },
    File: files,
  });
  Reflect.set(globalThis, 'IOUtils', { move });
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
  if (originalIOUtils === undefined) Reflect.deleteProperty(globalThis, 'IOUtils');
  else Reflect.set(globalThis, 'IOUtils', originalIOUtils);
});

describe('attachment-owned cache files', () => {
  it('notifies only live observers for the committed attachment, without turning UI failure into save failure', async () => {
    const saved = vi.fn(),
      other = vi.fn();
    const stop = observeAttachmentDocumentCache(7, saved),
      stopOther = observeAttachmentDocumentCache(8, other);
    const stopBroken = observeAttachmentDocumentCache(7, () => {
      throw new Error('retired UI');
    });
    try {
      const cache = attachmentDocumentCache(7);
      expect(await cache.write(source, key, parsed, async () => false)).toBe(false);
      expect(saved).not.toHaveBeenCalled();
      expect(await cache.write(source, key, parsed, async () => true)).toBe(true);
      expect(saved).toHaveBeenCalledOnce();
      expect(other).not.toHaveBeenCalled();
      stop();
      await cache.write(source, key, parsed, async () => true);
      expect(saved).toHaveBeenCalledOnce();
    } finally {
      stop();
      stopOther();
      stopBroken();
    }
  });
  it('survives a fresh cache instance and keeps backend configurations separate', async () => {
    const cache = attachmentDocumentCache(7);
    expect(await cache.read(source, key)).toBeNull();
    expect(await cache.write(source, key, parsed, async () => true)).toBe(true);
    expect((await attachmentDocumentCache(7).read(source, key))?.parsed).toEqual(parsed);
    expect(await cache.read(source, parser('https://other.example').cacheKey!)).toBeNull();
    expect(readdirSync(directory)).toHaveLength(1);
    expect(move).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/[/\\]\.zotero-neo-analysis-[a-f0-9]+\.json$/),
    );
    expect(files.rename).not.toHaveBeenCalled();
  });

  it('preserves the last usable result and cleans staging files when saving fails', async () => {
    const cache = attachmentDocumentCache(7);
    await cache.write(source, key, parsed, async () => true);
    files.putContentsAsync.mockImplementationOnce(async (path, text) => {
      writeFileSync(path, text);
      throw new Error('disk unavailable');
    });
    await expect(
      cache.write(source, key, { ...parsed, durationMs: 20 }, async () => true),
    ).rejects.toThrow('disk unavailable');
    expect((await cache.read(source, key))?.parsed.durationMs).toBe(1200);
    expect(readdirSync(directory)).toHaveLength(1);
    await expect(
      cache.write(source, key, { ...parsed, durationMs: 30 }, async () => true),
    ).resolves.toBe(true);
    expect((await cache.read(source, key))?.parsed.durationMs).toBe(30);
  });

  it('retires a save during staging without replacing the old result', async () => {
    const cache = attachmentDocumentCache(7);
    await cache.write(source, key, parsed, async () => true);
    let current = true;
    files.putContentsAsync.mockImplementationOnce(async (path, text) => {
      writeFileSync(path, text);
      current = false;
    });
    expect(await cache.write(source, key, { ...parsed, durationMs: 20 }, async () => current)).toBe(
      false,
    );
    expect((await cache.read(source, key))?.parsed.durationMs).toBe(1200);
    expect(readdirSync(directory)).toHaveLength(1);
  });

  it('serializes competing writers and rechecks an invocation after waiting in the queue', async () => {
    const cache = attachmentDocumentCache(7),
      started = Promise.withResolvers<void>(),
      finish = Promise.withResolvers<void>();
    files.putContentsAsync.mockImplementationOnce(async (path, text) => {
      started.resolve();
      await finish.promise;
      writeFileSync(path, text);
    });
    const first = cache.write(source, key, parsed, async () => true);
    await started.promise;
    let current = true;
    const second = attachmentDocumentCache(7).write(
      source,
      key,
      { ...parsed, durationMs: 20 },
      async () => current,
    );
    current = false;
    finish.resolve();
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(files.putContentsAsync).toHaveBeenCalledTimes(1);
    expect((await cache.read(source, key))?.parsed.durationMs).toBe(1200);
  });

  it('treats corrupt or oversized files as a cache miss without reading oversized payloads', async () => {
    const cache = attachmentDocumentCache(7);
    await cache.write(source, key, parsed, async () => true);
    const path = join(directory, readdirSync(directory)[0]!);
    writeFileSync(path, '{truncated');
    expect(await cache.read(source, key)).toBeNull();
    truncateSync(path, 32 * 1024 * 1024 + 1);
    files.getContentsAsync.mockClear();
    expect(await cache.read(source, key)).toBeNull();
    expect(files.getContentsAsync).not.toHaveBeenCalled();
  });
});

describe('attachment-owned correction sidecars', () => {
  it('reopens and restores local edits without overwriting the original parser cache', async () => {
    await attachmentDocumentCache(7).write(source, key, parsed, async () => true);
    const previous = await readAttachmentDocumentCorrections(7, parsed, key);
    const next = changeDocumentCorrection(previous, parsed, key, 'caption', {
      type: 'caption',
      regionID: 'caption',
      bodyID: 'image',
    });
    expect(
      await saveAttachmentDocumentCorrections({
        itemID: 7,
        parsed,
        key,
        previous,
        next,
        current: async () => true,
      }),
    ).toBe(true);
    expect(await readAttachmentDocumentCorrections(7, parsed, key)).toEqual(next);
    expect((await attachmentDocumentCache(7).read(source, key))?.parsed).toEqual(parsed);
    expect(readdirSync(directory).filter((n) => n.includes('corrections'))).toHaveLength(1);
    const restored = changeDocumentCorrection(next, parsed, key, 'caption', null);
    await saveAttachmentDocumentCorrections({
      itemID: 7,
      parsed,
      key,
      previous: next,
      next: restored,
      current: async () => true,
    });
    expect((await readAttachmentDocumentCorrections(7, parsed, key)).edits).toEqual([]);
  });

  it('keeps changed PDFs, changed parse geometry with reused IDs, and different services inert', async () => {
    const previous = emptyDocumentCorrections(parsed, key);
    const next = changeDocumentCorrection(previous, parsed, key, 'caption', {
      type: 'body',
      regionID: 'caption',
    });
    await saveAttachmentDocumentCorrections({
      itemID: 7,
      parsed,
      key,
      previous,
      next,
      current: async () => true,
    });
    for (const changed of [
      { ...parsed, sourceFingerprint: 'replacement' },
      {
        ...parsed,
        regions: parsed.regions.map((r) => ({ ...r, rect: [20, 20, 100, 100] as const })),
      },
      { ...parsed, modelRevision: 'another-model' },
    ])
      expect((await readAttachmentDocumentCorrections(7, changed, key)).edits).toEqual([]);
    expect(
      (await readAttachmentDocumentCorrections(7, parsed, { ...key, configuration: 'other' }))
        .edits,
    ).toEqual([]);
    expect(await readAttachmentDocumentCorrections(7, parsed, key)).toEqual(next);
  });

  it('serializes optimistic commits across windows instead of silently losing another saved edit', async () => {
    const previous = emptyDocumentCorrections(parsed, key);
    const first = changeDocumentCorrection(previous, parsed, key, 'caption', {
      type: 'body',
      regionID: 'caption',
    });
    const second = changeDocumentCorrection(previous, parsed, key, 'image', {
      type: 'body',
      regionID: 'image',
    });
    const results = await Promise.allSettled([
      saveAttachmentDocumentCorrections({
        itemID: 7,
        parsed,
        key,
        previous,
        next: first,
        current: async () => true,
      }),
      saveAttachmentDocumentCorrections({
        itemID: 7,
        parsed,
        key,
        previous,
        next: second,
        current: async () => true,
      }),
    ]);
    expect(results[0]).toMatchObject({ status: 'fulfilled', value: true });
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.any(Error) });
    expect(await readAttachmentDocumentCorrections(7, parsed, key)).toEqual(first);
  });

  it('does not notify or replace data for a late invocation or failed atomic move, and removes staging files', async () => {
    const previous = emptyDocumentCorrections(parsed, key);
    const next = changeDocumentCorrection(previous, parsed, key, 'caption', {
      type: 'body',
      regionID: 'caption',
    });
    const saved = vi.fn();
    const stop = observeAttachmentDocumentCache(7, saved);
    try {
      let calls = 0;
      expect(
        await saveAttachmentDocumentCorrections({
          itemID: 7,
          parsed,
          key,
          previous,
          next,
          current: async () => ++calls === 1,
        }),
      ).toBe(false);
      expect(readdirSync(directory)).toEqual([]);
      expect(saved).not.toHaveBeenCalled();
      move.mockRejectedValueOnce(new Error('disk unavailable'));
      await expect(
        saveAttachmentDocumentCorrections({
          itemID: 7,
          parsed,
          key,
          previous,
          next,
          current: async () => true,
        }),
      ).rejects.toThrow('disk unavailable');
      expect(readdirSync(directory)).toEqual([]);
      expect(saved).not.toHaveBeenCalled();
      await saveAttachmentDocumentCorrections({
        itemID: 7,
        parsed,
        key,
        previous,
        next,
        current: async () => true,
      });
      expect(saved).toHaveBeenCalledOnce();
    } finally {
      stop();
    }
  });

  it('rejects malformed matching sidecars and bounds disk reads', async () => {
    const previous = emptyDocumentCorrections(parsed, key);
    const next = changeDocumentCorrection(previous, parsed, key, 'caption', {
      type: 'body',
      regionID: 'caption',
    });
    await saveAttachmentDocumentCorrections({
      itemID: 7,
      parsed,
      key,
      previous,
      next,
      current: async () => true,
    });
    const file = join(directory, readdirSync(directory)[0]!);
    writeFileSync(
      file,
      JSON.stringify({ ...next, edits: [{ type: 'body', regionID: 'unknown' }] }),
    );
    await expect(readAttachmentDocumentCorrections(7, parsed, key)).rejects.toThrow('Invalid');
    truncateSync(file, 32 * 1024 * 1024 + 1);
    await expect(readAttachmentDocumentCorrections(7, parsed, key)).rejects.toThrow('size limit');
  });
  it('bounds pending correction commits and releases capacity after cancelled owners', async () => {
    const previous = emptyDocumentCorrections(parsed, key);
    const next = changeDocumentCorrection(previous, parsed, key, 'caption', {
      type: 'body',
      regionID: 'caption',
    });
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<boolean>();
    const current = async () => {
      started.resolve();
      return gate.promise;
    };
    const writes = Array.from({ length: 4 }, () =>
      saveAttachmentDocumentCorrections({ itemID: 7, parsed, key, previous, next, current }),
    );
    await started.promise;
    await expect(
      saveAttachmentDocumentCorrections({
        itemID: 7,
        parsed,
        key,
        previous,
        next,
        current: async () => true,
      }),
    ).rejects.toThrow('Too many pending');
    gate.resolve(false);
    expect(await Promise.all(writes)).toEqual([false, false, false, false]);
    expect(
      await saveAttachmentDocumentCorrections({
        itemID: 7,
        parsed,
        key,
        previous,
        next,
        current: async () => true,
      }),
    ).toBe(true);
  });
});
