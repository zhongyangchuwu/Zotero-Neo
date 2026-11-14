import { describe, expect, it } from 'vitest';
import {
  applyDocumentCorrections,
  changeDocumentCorrection,
  correctedNativeTextRegions,
  documentCorrectionIdentity,
  emptyDocumentCorrections,
  readDocumentCorrections,
  MAX_DOCUMENT_CORRECTIONS,
} from '../../src/document-analysis/corrections';
import type { DocumentRegion, ParsedDocument } from '../../src/document-analysis/contracts';
import { documentObjectGroups } from '../../src/document-analysis/object-groups';
import { documentExcerpts } from '../../src/document-analysis/excerpts';
import { nativeDocumentTextRegions } from '../../src/document-analysis/native';
import { bodyTextAdmission } from '../../src/modules/reader-selection/body-text';

const key = { backend: 'oxr', adapterVersion: 1, configuration: 'https://service.example' };
function region(id: string, kind: DocumentRegion['kind'], object?: string): DocumentRegion {
  return {
    id,
    kind,
    pageIndex: 0,
    rect: [10, 10, 100, 100],
    text: id,
    format: 'text',
    flow: 'auxiliary',
    anchorPrecision: 'region',
    ...(object ? { sourceObject: { id: object, kind: 'figure' } as const } : {}),
  };
}
const raw: ParsedDocument = {
  schemaVersion: 1,
  backend: 'oxr',
  sourceFingerprint: 'pdf-bytes',
  modelRevision: 'model-1',
  durationMs: 30,
  pages: [0, 1].map((pageIndex) => ({ pageIndex, viewBox: [0, 0, 600, 800], rotation: 0 })),
  regions: [
    region('a', 'image', 'object-a'),
    region('b', 'image', 'object-b'),
    { ...region('ca', 'caption', 'object-a'), text: 'Figure 1. A' },
    { ...region('cb', 'caption', 'object-b'), text: 'Figure 2. B' },
    { ...region('margin', 'text'), flow: 'excluded' },
  ],
};

describe('source-bound local corrections', () => {
  it('overrides provider membership, retires conflicts, and shares the result with excerpts without changing raw data', () => {
    const original = JSON.stringify(raw);
    const empty = emptyDocumentCorrections(raw, key);
    const state = changeDocumentCorrection(empty, raw, key, 'ca', {
      type: 'caption',
      regionID: 'ca',
      bodyID: 'b',
    });
    const effective = applyDocumentCorrections(raw, state);
    const groups = documentObjectGroups(effective.regions);
    expect(groups.find((g) => g.captionRegionIds.includes('ca'))?.memberRegionIds).toEqual([
      'b',
      'ca',
    ]);
    expect(groups.find((g) => g.captionRegionIds.includes('cb'))?.memberRegionIds).toEqual(['cb']);
    expect(
      documentExcerpts(effective.regions).find((e) => e.regionIds.includes('ca'))?.regionIds,
    ).toEqual(['b', 'ca']);
    expect(JSON.stringify(raw)).toBe(original);
    expect(
      applyDocumentCorrections(raw, changeDocumentCorrection(state, raw, key, 'ca', null)),
    ).toEqual(raw);
  });

  it('makes explicit caption swaps independent of edit order and replaces a prior owner of the same body', () => {
    const empty = emptyDocumentCorrections(raw, key);
    let state = changeDocumentCorrection(empty, raw, key, 'ca', {
      type: 'caption',
      regionID: 'ca',
      bodyID: 'b',
    });
    state = changeDocumentCorrection(state, raw, key, 'cb', {
      type: 'caption',
      regionID: 'cb',
      bodyID: 'a',
    });
    const groups = documentObjectGroups(applyDocumentCorrections(raw, state).regions);
    expect(groups.find((g) => g.captionRegionIds.includes('ca'))?.memberRegionIds).toEqual([
      'b',
      'ca',
    ]);
    expect(groups.find((g) => g.captionRegionIds.includes('cb'))?.memberRegionIds).toEqual([
      'a',
      'cb',
    ]);
    expect(
      documentObjectGroups(
        applyDocumentCorrections(raw, { ...state, edits: [...state.edits].reverse() }).regions,
      ),
    ).toEqual(groups);
    state = changeDocumentCorrection(state, raw, key, 'cb', {
      type: 'caption',
      regionID: 'cb',
      bodyID: 'b',
    });
    expect(state.edits).toEqual([{ type: 'caption', regionID: 'cb', bodyID: 'b' }]);
  });

  it('restores body ownership in all effective consumers without inventing text or character anchors', () => {
    const state = changeDocumentCorrection(emptyDocumentCorrections(raw, key), raw, key, 'margin', {
      type: 'body',
      regionID: 'margin',
    });
    const effective = applyDocumentCorrections(raw, state);
    expect(effective.regions.at(-1)).toMatchObject({
      kind: 'text',
      flow: 'body',
      text: 'margin',
      anchorPrecision: 'region',
    });
    const originalNative = [{ ...raw.regions.at(-1)!, sourceBlock: { id: 'native:3', order: 3 } }];
    const accepts = bodyTextAdmission(effective.regions, originalNative);
    expect(accepts({ pageIndex: null, rect: null, sourceBlockId: 'native:3' })).toBe(true);
    expect(
      bodyTextAdmission(
        raw.regions,
        originalNative,
      )({ pageIndex: null, rect: null, sourceBlockId: 'native:3' }),
    ).toBe(false);
  });

  it('projects corrected semantics onto only genuine native ink runs, retaining their IDs and geometry', () => {
    const ink = nativeDocumentTextRegions({
      metadata: {},
      catalog: {},
      blocks: [
        {
          type: 'paragraph',
          flowClass: 'excluded',
          anchor: { pageRects: [[0, 0, 0, 200, 200]] },
          content: [{ text: 'Actual PDF text', anchor: { textMap: '[[0,0,10,20,100,30]]' } }],
        },
      ],
    });
    const parsed = {
      ...raw,
      regions: [{ ...ink[0]!, id: 'native:0:0', rect: [0, 0, 200, 200] as const }],
    };
    const state = changeDocumentCorrection(
      emptyDocumentCorrections(parsed, key),
      parsed,
      key,
      'native:0:0',
      { type: 'body', regionID: 'native:0:0' },
    );
    const corrected = correctedNativeTextRegions(ink, applyDocumentCorrections(parsed, state));
    expect(corrected[0]).toMatchObject({
      id: 'native:0:0:ink:0',
      rect: [10, 20, 100, 30],
      flow: 'body',
      text: 'Actual PDF text',
      anchorPrecision: 'region',
    });
    expect(correctedNativeTextRegions([], applyDocumentCorrections(parsed, state))).toEqual([]);
  });

  it('binds every result-affecting input, not region IDs, duration or object property insertion order', () => {
    const saved = emptyDocumentCorrections(raw, key);
    for (const parsed of [
      { ...raw, sourceFingerprint: 'replacement' },
      { ...raw, modelRevision: 'new-model' },
      { ...raw, backend: 'mineru' },
      { ...raw, regions: [...raw.regions].reverse() },
      { ...raw, regions: raw.regions.map((r, i) => (i ? r : { ...r, text: 'changed' })) },
      {
        ...raw,
        regions: raw.regions.map((r, i) => (i ? r : { ...r, rect: [11, 10, 100, 100] as const })),
      },
    ])
      expect(readDocumentCorrections(saved, parsed, key)).toBeNull();
    for (const changedKey of [
      { ...key, adapterVersion: 2 },
      { ...key, configuration: 'other-service' },
    ])
      expect(readDocumentCorrections(saved, raw, changedKey)).toBeNull();
    expect(documentCorrectionIdentity({ ...raw, durationMs: 99 }, key)).toBe(saved.identity);
    expect(
      documentCorrectionIdentity(
        {
          ...raw,
          regions: raw.regions.map(
            (r) => Object.fromEntries(Object.entries(r).reverse()) as unknown as DocumentRegion,
          ),
        },
        key,
      ),
    ).toBe(saved.identity);
  });

  it('rejects malformed, cross-page, duplicate and oversized edits atomically', () => {
    const state = emptyDocumentCorrections(raw, key);
    const wrongPage = {
      ...raw,
      regions: raw.regions.map((r) => (r.id === 'b' ? { ...r, pageIndex: 1 } : r)),
    };
    expect(() =>
      changeDocumentCorrection(emptyDocumentCorrections(wrongPage, key), wrongPage, key, 'ca', {
        type: 'caption',
        regionID: 'ca',
        bodyID: 'b',
      }),
    ).toThrow();
    for (const edits of [
      [{ type: 'body', regionID: 'missing' }],
      [{ type: 'caption', regionID: 'ca', bodyID: 'margin' }],
      [
        { type: 'body', regionID: 'a' },
        { type: 'body', regionID: 'a' },
      ],
      Array.from({ length: MAX_DOCUMENT_CORRECTIONS + 1 }, () => ({ type: 'body', regionID: 'a' })),
    ])
      expect(readDocumentCorrections({ ...state, edits }, raw, key)).toBeNull();
  });
});
