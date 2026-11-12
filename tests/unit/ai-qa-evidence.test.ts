import { expect, it, vi } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import type { DocumentRegion } from '../../src/document-analysis/contracts';
import type { ReaderCachedDocument } from '../../src/reader/document-cache';
import type { ReaderRuntime } from '../../src/toolkit/reader';
import { readAIQAContext, type AIQASourceCapture } from '../../src/ai-qa/evidence';

const data = vi.hoisted(() => ({ snapshot: null as ReaderCachedDocument | null }));
vi.mock('../../src/reader/document-cache', () => ({
  readReaderDocumentCache: async () => data.snapshot,
  readReaderDocument: async () => data.snapshot,
}));

it('keeps uncaptioned visual bodies and table structure without duplicating grouped figures', async () => {
  const text: DocumentRegion = {
    id: 'text',
    kind: 'text',
    pageIndex: 0,
    rect: [0, 0, 180, 20],
    text: 'Original chapter paragraph',
    format: 'text',
    flow: 'body',
    anchorPrecision: 'region',
  };
  const table: DocumentRegion = {
    ...text,
    id: 'table',
    kind: 'table',
    rect: [0, 30, 80, 60],
    text: '| A | B |\n|---|---|\n| 1 | 2 |',
    format: 'markdown',
    flow: 'auxiliary',
  };
  const image: DocumentRegion = {
    ...text,
    id: 'image',
    kind: 'image',
    rect: [100, 100, 180, 180],
    text: '',
    flow: 'auxiliary',
  };
  const groupedImage: DocumentRegion = {
    ...image,
    id: 'grouped-image',
    rect: [200, 200, 300, 300],
    sourceObject: { id: 'figure-1', kind: 'figure' },
  };
  const caption: DocumentRegion = {
    ...groupedImage,
    id: 'caption',
    kind: 'caption',
    rect: [200, 310, 300, 330],
    text: 'Figure 1. Original caption',
  };
  data.snapshot = {
    parsed: {
      schemaVersion: 1,
      sourceFingerprint: 'pdf-revision',
      backend: 'native',
      modelRevision: null,
      durationMs: 0,
      pages: [{ pageIndex: 0, viewBox: [0, 0, 600, 800], rotation: 0 }],
      regions: [text, table, image, groupedImage, caption],
    },
    isCurrent: async () => true,
  };
  const capture = {
    source: {
      itemID: 1,
      libraryID: 1,
      key: 'ABC',
      fingerprint: 'pdf-revision',
      fileName: 'owned.pdf',
    },
    isCurrent: async () => true,
  } as AIQASourceCapture;
  const context = await readAIQAContext(
    { itemID: 1 } as ReaderRuntime,
    {} as PreferenceStore,
    capture,
    () => true,
    { prepare: false, sectionID: null, selection: null, pageIndex: 0 },
  );
  const evidence = context!.evidence;
  expect(evidence.find((entry) => entry.kind === 'table')).toMatchObject({
    text: table.text,
    format: 'markdown',
    precision: 'region',
    location: { pageIndex: 0, rects: [table.rect] },
  });
  const covers = (region: DocumentRegion) =>
    evidence.filter((entry) =>
      entry.location?.rects.some((rect) => rect.join(',') === region.rect.join(',')),
    );
  expect(covers(image).map((entry) => entry.kind)).toEqual(['figure']);
  expect(covers(image)[0].text).toBe('');
  expect(covers(groupedImage).map((entry) => entry.kind)).toEqual(['figure']);
  expect(covers(groupedImage)[0].text).toContain(caption.text);
  expect(context!.limited).toBe(false);
});
