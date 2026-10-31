import { describe, expect, it } from 'vitest';
import { analyzeDocument } from '../../src/document-analysis/analyze';
import { documentCaptionIdentity } from '../../src/document-analysis/caption-identity';
import type {
  DocumentRegion,
  DocumentRect,
  DocumentSource,
  ParsedDocument,
} from '../../src/document-analysis/contracts';
import { nativeDocumentRegions } from '../../src/document-analysis/native';
import { oxrParsedDocument } from '../../src/document-analysis/oxr';
import {
  documentObjectGroups,
  documentObjectLocation,
} from '../../src/document-analysis/object-groups';

function region(
  id: string,
  kind: DocumentRegion['kind'],
  rect: DocumentRect,
  options: Partial<DocumentRegion> = {},
): DocumentRegion {
  return {
    id,
    kind,
    rect,
    pageIndex: 0,
    text: '',
    format: 'text',
    flow: kind === 'text' ? 'body' : 'auxiliary',
    anchorPrecision: 'region',
    ...options,
  };
}
const left = region('left', 'image', [50, 400, 285, 650]);
const right = region('right', 'image', [310, 400, 545, 650]);
const caption = region('caption', 'caption', [50, 340, 545, 390], {
  text: 'Figure 2: Two panels.',
});
const source: DocumentSource = {
  fingerprint: 'test',
  fileName: 'test.pdf',
  pages: [{ pageIndex: 0, rotation: 0, viewBox: [0, 0, 600, 800] }],
};

describe('document object grouping', () => {
  it('keeps separate panels and caption rectangles in one target, independent of array order', () => {
    for (const regions of [
      [left, right, caption],
      [caption, right, left],
    ]) {
      const group = documentObjectGroups(regions)[0]!;
      expect(group).toMatchObject({
        kind: 'figure',
        label: '2',
        association: 'geometry',
        captionRegionIds: ['caption'],
      });
      expect(new Set(group.memberRegionIds)).toEqual(new Set(['left', 'right', 'caption']));
      expect(new Set(documentObjectLocation(regions, group).rects)).toEqual(
        new Set([left.rect, right.rect, caption.rect]),
      );
    }
  });

  it('includes stacked panels and contained auxiliary chart labels', () => {
    const top = region('top', 'image', [50, 665, 285, 750]);
    const label = region('label', 'text', [70, 450, 100, 470], { flow: 'excluded' });
    const regions = [
      top,
      left,
      label,
      region('cap', 'caption', [50, 340, 285, 390], { text: 'Fig. 3: Stacked' }),
    ];
    expect(documentObjectGroups(regions)[0]?.memberRegionIds).toEqual([
      'top',
      'left',
      'label',
      'cap',
    ]);
  });

  it('associates panels collectively when the caption is narrower than the full panel row', () => {
    const regions = [left, right, { ...caption, rect: [50, 340, 335, 390] as DocumentRect }];
    expect(documentObjectGroups(regions)[0]?.memberRegionIds).toEqual(['left', 'right', 'caption']);
  });

  it('tolerates independently detected table borders without expanding or rounding member rectangles', () => {
    // Native SDT, Attention v7 Table 3: neither horizontal interval fully contains the other.
    const table = region('table', 'table', [108, 407.827, 508.737, 663.128]);
    const cap = region('cap', 'caption', [107.69, 678.37, 504, 719.73], {
      text: 'Table 3: Variations',
    });
    const regions = [cap, table];
    const group = documentObjectGroups(regions)[0]!;
    expect(group.association).toBe('geometry');
    expect(documentObjectLocation(regions, group).rects).toEqual([cap.rect, table.rect]);
  });

  it.each(['above', 'below'] as const)(
    'groups tables with captions %s the table, including rasterized tables',
    (side) => {
      for (const kind of ['table', 'image'] as const) {
        const table = region('table', kind, [50, 400, 545, 650]);
        const cap = region(
          'cap',
          'caption',
          side === 'above' ? [50, 660, 545, 690] : caption.rect,
          { text: 'Table 1: Results' },
        );
        const group = documentObjectGroups([table, cap])[0]!;
        expect(group).toMatchObject({
          kind: 'table',
          association: 'geometry',
          memberRegionIds: ['table', 'cap'],
        });
      }
    },
  );

  it('keeps neighboring columns attached to their respective captions', () => {
    const capLeft = region('c1', 'caption', [50, 340, 285, 390], { text: 'Figure 1: Left' });
    const capRight = region('c2', 'caption', [310, 340, 545, 390], { text: 'Figure 2: Right' });
    const groups = documentObjectGroups([left, right, capLeft, capRight]);
    expect(groups.map((group) => group.memberRegionIds)).toEqual([
      ['left', 'c1'],
      ['right', 'c2'],
    ]);
  });

  it('rejects competing claims together instead of letting processing order win', () => {
    const shared = region('shared', 'image', [50, 400, 545, 650]);
    const capLeft = region('c1', 'caption', [50, 340, 285, 390], { text: 'Figure 1: Left' });
    const capRight = region('c2', 'caption', [310, 340, 545, 390], { text: 'Figure 2: Right' });
    for (const regions of [
      [shared, capLeft, capRight],
      [shared, capRight, capLeft],
    ]) {
      const groups = documentObjectGroups(regions);
      expect(groups.every((group) => group.association === 'ambiguous')).toBe(true);
      expect(groups.every((group) => group.memberRegionIds.length === 1)).toBe(true);
    }
  });

  it.each([
    ['body text in the corridor', region('body', 'text', [50, 392, 280, 398])],
    ['body text inside a panel', region('body', 'text', [70, 450, 100, 470])],
    [
      'another caption',
      region('other', 'caption', [50, 392, 280, 398], { text: 'Figure 4: Other' }),
    ],
  ])('retains caption geometry when blocked by %s', (_name, barrier) => {
    const regions = [left, barrier, caption];
    const group = documentObjectGroups(regions).find((group) => group.label === '2')!;
    expect(group.association).toBe('caption-only');
    expect(documentObjectLocation(regions, group).rects).toEqual([caption.rect]);
  });

  it('does not infer association across an unusable native block or a page boundary', () => {
    const regions = nativeDocumentRegions([
      { type: 'image', anchor: { pageRects: [[0, ...left.rect]] } },
      { type: 'paragraph' },
      {
        type: 'caption',
        content: [{ text: caption.text }],
        anchor: { pageRects: [[0, ...caption.rect]] },
      },
    ]);
    expect(documentObjectGroups(regions)[0]?.association).toBe('caption-only');
    const crossPage = [
      { ...left, sourceBlock: { id: 'multi', order: 0 } },
      { ...right, pageIndex: 1, sourceBlock: { id: 'multi', order: 0 } },
      caption,
    ];
    expect(documentObjectGroups(crossPage)[0]?.association).toBe('caption-only');
  });

  it('preserves caption continuation pages without claiming cross-page panels', () => {
    const continuation = {
      ...caption,
      id: 'continued',
      pageIndex: 1,
      rect: [50, 700, 545, 750] as DocumentRect,
      sourceBlock: { id: 'caption-block', order: 1 },
    };
    const regions = [left, { ...caption, sourceBlock: continuation.sourceBlock }, continuation];
    const groups = documentObjectGroups(regions);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.captionRegionIds).toEqual(['caption', 'continued']);
    expect(groups[0]?.association).toBe('caption-only');
    expect(documentObjectLocation(regions, groups[0]!).rects).toEqual([caption.rect]);
  });

  it('does not promote unlabeled images or ordinary Figure mentions to caption groups', () => {
    expect(
      documentObjectGroups([
        left,
        region('body', 'text', caption.rect, { text: 'Figure 1 is shown above.' }),
      ]),
    ).toEqual([]);
    expect(documentCaptionIdentity('Figure 1abc')).toBeNull();
    expect(documentCaptionIdentity('表二：结果')).toEqual({ kind: 'table', label: '二' });
  });

  it('keeps distant repeated labels separate while combining adjacent caption fragments', () => {
    const continued = region('continued', 'caption', [50, 310, 545, 335], { text: caption.text });
    const distant = region('distant', 'caption', [50, 50, 545, 80], { text: caption.text });
    const groups = documentObjectGroups([left, right, caption, continued, distant]);
    expect(groups.map((group) => group.captionRegionIds)).toEqual([
      ['caption', 'continued'],
      ['distant'],
    ]);
    expect(groups[0]?.memberRegionIds).toHaveLength(4);
    expect(groups[1]?.association).toBe('caption-only');
  });

  it('uses one grouping stage for native and OXR normalized geometry', () => {
    const native = nativeDocumentRegions([
      { type: 'image', anchor: { pageRects: [[0, ...left.rect]] } },
      { type: 'image', anchor: { pageRects: [[0, ...right.rect]] } },
      {
        type: 'caption',
        content: [{ text: caption.text }],
        anchor: { pageRects: [[0, ...caption.rect]] },
      },
    ]);
    const oxr = oxrParsedDocument(source, {
      code: 0,
      data: {
        result: {
          outputs: {
            json: {
              pages: [
                {
                  page_num: 0,
                  page_size: { w: 600, h: 800 },
                  blocks: [left, right, caption].map((r) => ({
                    type: r.kind === 'image' ? 'Picture' : 'Caption',
                    bbox: [r.rect[0], 800 - r.rect[3], r.rect[2], 800 - r.rect[1]],
                    content: r.text,
                  })),
                },
              ],
            },
          },
        },
      },
    });
    for (const regions of [native, oxr.regions]) {
      const group = documentObjectGroups(regions)[0]!;
      expect(group.association).toBe('geometry');
      const actual = documentObjectLocation(regions, group).rects;
      expect(actual).toHaveLength(3);
      for (const [index, expected] of [left.rect, right.rect, caption.rect].entries())
        expected.forEach((value, axis) => expect(actual[index]![axis]).toBeCloseTo(value, 8));
    }
  });

  it('runs shared analysis only for a current matching source result', async () => {
    const parsed: ParsedDocument = {
      schemaVersion: 1,
      sourceFingerprint: source.fingerprint,
      backend: 'test',
      modelRevision: null,
      durationMs: 0,
      pages: source.pages,
      regions: [left, right, caption],
    };
    const abort = new AbortController();
    const parser = { id: 'test', capabilities: [] as const, parse: async () => parsed };
    expect(
      (await analyzeDocument(parser, source, { signal: abort.signal })).objectGroups[0]
        ?.memberRegionIds,
    ).toHaveLength(3);
    abort.abort();
    await expect(analyzeDocument(parser, source, { signal: abort.signal })).rejects.toThrow(
      'cancelled',
    );
    await expect(
      analyzeDocument(
        parser,
        { ...source, fingerprint: 'changed' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('different PDF');
  });
});
