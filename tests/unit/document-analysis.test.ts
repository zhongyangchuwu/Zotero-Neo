import { describe, expect, it } from 'vitest';
import { nativeDocumentRegions } from '../../src/document-analysis/native';

describe('native document regions', () => {
  it('keeps native text and block order while rejecting invalid anchors', () => {
    const regions = nativeDocumentRegions([
      { type: 'paragraph', anchor: { pageRects: [[0, 0, 0, 0, 10]] } },
      {
        type: 'paragraph',
        anchor: { pageRects: [[0, 30, 70, 110, 110]] },
        content: [{ text: 'We ' }, { text: 'use flow.' }],
      },
      {
        type: 'caption',
        anchor: { pageRects: [[0, 10, 20, 90, 30]] },
        content: [{ text: 'Figure 1' }],
      },
    ]);
    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({
      sourceBlock: { order: 1 },
      text: 'We use flow.',
      rect: [30, 70, 110, 110],
      anchorPrecision: 'region',
    });
    expect(regions[1]?.flow).toBe('auxiliary');
  });
});
