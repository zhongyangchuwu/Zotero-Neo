import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readReaderDocumentCache,
  readReaderDocument,
  readNativeReaderDocument,
} from '../../src/reader/document-cache';
import {
  emptyDocumentCorrections,
  changeDocumentCorrection,
} from '../../src/document-analysis/corrections';
import type { ParsedDocument } from '../../src/document-analysis/contracts';
import { selectedDocumentCacheKey } from '../../src/document-analysis/settings';
import { mineruDocumentCacheKey } from '../../src/document-analysis/mineru';
import { oxrDocumentCacheKey } from '../../src/document-analysis/oxr';
import type { PreferenceStore } from '../../src/core/preference-store';
import type { ReaderRuntime } from '../../src/toolkit/reader';
const io = vi.hoisted(() => ({
  pdf: vi.fn(),
  read: vi.fn(),
  current: vi.fn(),
  geometry: vi.fn(),
  corrections: vi.fn(),
  native: vi.fn(),
  revision: 0,
  figures: vi.fn(),
  write: vi.fn(),
}));
vi.mock('../../src/platform/document-analysis', () => ({ analysisPDF: io.pdf }));
vi.mock('../../src/platform/document-analysis-cache', () => ({
  attachmentDocumentCache: () => ({ read: io.read, write: io.write }),
  attachmentDocumentRevision: () => io.revision,
}));
vi.mock('../../src/platform/document-corrections', () => ({
  readAttachmentDocumentCorrections: io.corrections,
}));
vi.mock('../../src/platform/document-preparation', () => ({
  documentPreparationAbort: () => new AbortController(),
}));
vi.mock('../../src/toolkit/reader', () => ({
  readerDocumentPageGeometry: io.geometry,
  structuredDocumentData: io.native,
  pdfSourceFigurePages: io.figures,
}));
const settings = new Map<string, string>();
const preferences = {
  get: (key: string, fallback: string) => settings.get(key) ?? fallback,
} as unknown as PreferenceStore;
const reader = { itemID: 2 } as ReaderRuntime;
const parsed: ParsedDocument = {
  schemaVersion: 1,
  sourceFingerprint: 'owned',
  backend: 'mineru',
  modelRevision: null,
  durationMs: 1,
  pages: [{ pageIndex: 0, viewBox: [0, 0, 600, 800], rotation: 0 }],
  regions: [
    {
      id: 'excluded',
      kind: 'text',
      flow: 'excluded',
      pageIndex: 0,
      rect: [10, 10, 100, 100],
      text: 'actual text',
      format: 'text',
      anchorPrecision: 'region',
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  settings.clear();
  settings.set('documentAnalysis.provider', 'mineru');
  io.revision = 0;
  io.corrections.mockImplementation(async (_id, raw, key) => emptyDocumentCorrections(raw, key));
  io.native.mockResolvedValue({
    metadata: { source: { hash: 'owned' } },
    catalog: { pages: [{ viewRect: [0, 0, 600, 800], rotation: 0 }] },
    blocks: [
      {
        type: 'paragraph',
        flowClass: 'excluded',
        text: 'actual text',
        anchor: { pageRects: [[0, 10, 10, 100, 100]] },
      },
    ],
  });
  io.current.mockResolvedValue(true);
  io.pdf.mockResolvedValue({
    fingerprint: 'owned',
    fileName: 'owned.pdf',
    isCurrent: io.current,
    read: () => {
      throw new Error('must not read PDF bytes');
    },
  });
  io.geometry.mockResolvedValue([{ viewRect: [0, 0, 600, 800], rotation: 0 }]);
  io.read.mockResolvedValue({ parsed });
  io.write.mockResolvedValue(true);
});
describe('Reader external document cache admission', () => {
  it('shares exact parser cache identities and reads without credentials or parser/network construction', async () => {
    expect(selectedDocumentCacheKey(preferences)).toEqual(mineruDocumentCacheKey());
    const result = await readReaderDocumentCache(reader, preferences, () => true);
    expect(result?.parsed.backend).toBe('mineru');
    expect(io.read).toHaveBeenCalledWith(
      {
        fingerprint: 'owned',
        fileName: 'owned.pdf',
        pages: [{ pageIndex: 0, viewBox: [0, 0, 600, 800], rotation: 0 }],
      },
      mineruDocumentCacheKey(),
    );
    settings.set('documentAnalysis.provider', 'oxr');
    settings.set('documentAnalysis.oxr.endpoint', 'https://service.example/api/v1/');
    expect(selectedDocumentCacheKey(preferences)).toEqual(
      oxrDocumentCacheKey('https://service.example/api/v1'),
    );
    expect(await result!.isCurrent()).toBe(false);
  });
  it('refuses changed files and retired Readers before publishing or using a saved result', async () => {
    io.current.mockResolvedValue(false);
    expect(await readReaderDocumentCache(reader, preferences, () => true)).toBeNull();
    io.current.mockResolvedValue(true);
    let current = true;
    const result = await readReaderDocumentCache(reader, preferences, () => current);
    current = false;
    expect(await result!.isCurrent()).toBe(false);
    io.read.mockClear();
    expect(await readReaderDocumentCache(reader, preferences, () => false)).toBeNull();
    expect(io.read).not.toHaveBeenCalled();
  });
  it('returns cache misses without creating a service request', async () => {
    io.read.mockResolvedValue(null);
    expect(await readReaderDocumentCache(reader, preferences, () => true)).toBeNull();
    expect(io.current).not.toHaveBeenCalled();
  });
  it('shares saved semantic overrides across cache-first and native readers, and retires stale snapshots on notification', async () => {
    io.corrections.mockImplementation(async (_id, raw, key) =>
      changeDocumentCorrection(emptyDocumentCorrections(raw, key), raw, key, raw.regions[0].id, {
        type: 'body',
        regionID: raw.regions[0].id,
      }),
    );
    const cache = await readReaderDocumentCache(reader, preferences, () => true);
    const snapshot = await readReaderDocument(reader, preferences, () => true);
    expect(cache?.parsed.regions[0]?.flow).toBe('body');
    expect(snapshot?.parsed.regions[0]?.flow).toBe('body');
    expect(parsed.regions[0]?.flow).toBe('excluded');
    io.read.mockResolvedValue(null);
    const native = await readNativeReaderDocument(reader, () => true);
    expect(native?.parsed.regions[0]?.flow).toBe('body');
    expect(native?.textRegions[0]).toMatchObject({
      flow: 'body',
      anchorPrecision: 'region',
      text: 'actual text',
    });
    io.revision++;
    expect(await cache!.isCurrent()).toBe(false);
    expect(await snapshot!.isCurrent()).toBe(false);
    expect(await native!.isCurrent()).toBe(false);
  });
  it('rejects a snapshot when correction notification arrives during its final PDF validation', async () => {
    io.current.mockImplementationOnce(async () => {
      io.revision++;
      return true;
    });
    expect(await readReaderDocumentCache(reader, preferences, () => true)).toBeNull();
  });
  it('retires a native fallback when the selected service gains a differently corrected cache', async () => {
    io.read.mockImplementation(async (_source, key) =>
      key.backend === 'mineru' ? null : { parsed: { ...parsed, backend: 'oxr' } },
    );
    io.corrections.mockImplementation(async (_id, raw, key) => {
      const state = emptyDocumentCorrections(raw, key);
      return raw.backend === 'oxr'
        ? changeDocumentCorrection(state, raw, key, raw.regions[0].id, {
            type: 'body',
            regionID: raw.regions[0].id,
          })
        : state;
    });
    const old = await readReaderDocument(reader, preferences, () => true);
    expect(old?.origin).toBe('native');
    expect(old?.parsed.regions[0]?.flow).toBe('excluded');
    settings.set('documentAnalysis.provider', 'oxr');
    const fresh = await readReaderDocument(reader, preferences, () => true);
    expect(fresh?.origin).toBe('cache');
    expect(fresh?.parsed.regions[0]?.flow).toBe('body');
    expect(await old!.isCurrent()).toBe(false);
  });

  it.each(['cache', 'native'] as const)(
    'rechecks the selected service after asynchronous PDF validation for a %s snapshot',
    async (origin) => {
      if (origin === 'native') io.read.mockResolvedValue(null);
      const snapshot = await readReaderDocument(reader, preferences, () => true);
      expect(snapshot?.origin).toBe(origin);
      const validation = Promise.withResolvers<boolean>();
      io.current.mockReturnValueOnce(validation.promise);
      const checking = snapshot!.isCurrent();
      settings.set('documentAnalysis.provider', 'oxr');
      validation.resolve(true);
      expect(await checking).toBe(false);
    },
  );

  it('does not start native fallback after the selected service changes during a cache miss', async () => {
    io.read.mockImplementationOnce(async () => {
      settings.set('documentAnalysis.provider', 'oxr');
      return null;
    });
    expect(await readReaderDocument(reader, preferences, () => true)).toBeNull();
    expect(io.native).not.toHaveBeenCalled();
  });

  it('replaces obsolete local layouts with current model-free geometry and reuses matching caches without SDT', async () => {
    settings.clear();
    io.read.mockImplementation(async (_source, key) =>
      key.backend === 'local-rules' && key.adapterVersion === 2
        ? { parsed: { ...parsed, backend: 'local-rules' } }
        : null,
    );
    io.write.mockImplementation(async (_source, _key, parsed) => {
      io.revision++;
      io.read.mockResolvedValue({ parsed });
      return true;
    });
    io.figures.mockResolvedValue([
      {
        pageIndex: 0,
        viewBox: [0, 0, 600, 800],
        text: [
          { text: 'Figure 1: A plot.', rect: [100, 350, 400, 362], fontSize: 10 },
          { text: 'Plot label', rect: [150, 500, 220, 510], fontSize: 10 },
        ],
        graphics: [[100, 400, 400, 620]],
      },
    ]);
    const snapshot = await readReaderDocument(reader, preferences, () => true);
    expect(snapshot?.parsed.backend).toBe('local-rules');
    expect(snapshot?.origin).toBe('local');
    expect(await snapshot!.isCurrent()).toBe(true);
    // Committing here would notify subscribers and dismiss their initial loading UI.
    // Durable commits belong to the explicit local-parse action, not a source read.
    expect(io.write).not.toHaveBeenCalled();
    expect(snapshot?.parsed.regions.find((region) => region.kind === 'image')).toMatchObject({
      rect: [100, 400, 400, 620],
      sourceObject: { kind: 'figure' },
    });
    expect(io.native).not.toHaveBeenCalled();
    io.read.mockResolvedValue({ parsed: snapshot!.parsed });
    const cached = await readReaderDocument(reader, preferences, () => true);
    expect(cached?.parsed.regions).toEqual(snapshot?.parsed.regions);
    expect(io.figures).toHaveBeenCalledTimes(1);
  });
});
