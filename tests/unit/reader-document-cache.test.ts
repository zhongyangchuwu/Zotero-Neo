import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readReaderDocumentCache } from '../../src/modules/reader-navigation/document-cache';
import { selectedDocumentCacheKey } from '../../src/modules/reader-navigation/document-settings';
import { mineruDocumentCacheKey } from '../../src/document-analysis/mineru';
import { oxrDocumentCacheKey } from '../../src/document-analysis/oxr';
import type { PreferenceStore } from '../../src/core/preference-store';
import type { ReaderRuntime } from '../../src/toolkit/reader';
const io = vi.hoisted(() => ({ pdf: vi.fn(), read: vi.fn(), current: vi.fn(), geometry: vi.fn() }));
vi.mock('../../src/platform/document-analysis', () => ({ analysisPDF: io.pdf }));
vi.mock('../../src/platform/document-analysis-cache', () => ({
  attachmentDocumentCache: () => ({ read: io.read }),
}));
vi.mock('../../src/toolkit/reader', () => ({ readerDocumentPageGeometry: io.geometry }));
const settings = new Map<string, string>();
const preferences = {
  get: (key: string, fallback: string) => settings.get(key) ?? fallback,
} as unknown as PreferenceStore;
const reader = { itemID: 2 } as ReaderRuntime;
beforeEach(() => {
  vi.resetAllMocks();
  settings.clear();
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
  io.read.mockResolvedValue({ parsed: { backend: 'mineru', regions: [] } });
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
});
