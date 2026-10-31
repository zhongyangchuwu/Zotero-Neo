import { describe, expect, it } from 'vitest';
import { structuralTextPosition } from '../../src/modules/reader-selection/text-boundary-motion';

describe('structured selection boundaries', () => {
  const textNode = {} as Text,
    next = {} as Text;
  const paragraphs = [
    [{ textNode, text: 'First sentence. 第二句！' }],
    [{ textNode: next, text: 'Next paragraph.' }],
  ];
  it('uses sentence boundaries instead of Firefox unimplemented sentence movement', () => {
    expect(
      structuralTextPosition(paragraphs, { textNode, offset: 1 }, 'forward', 'sentence'),
    ).toEqual({ textNode, offset: 15 });
    expect(
      structuralTextPosition(paragraphs, { textNode, offset: 15 }, 'forward', 'sentence'),
    ).toEqual({ textNode, offset: 20 });
    expect(
      structuralTextPosition(paragraphs, { textNode, offset: 20 }, 'backward', 'sentence'),
    ).toEqual({ textNode, offset: 16 });
  });
  it('crosses real paragraph boundaries without joining text into a fabricated paragraph', () => {
    expect(
      structuralTextPosition(paragraphs, { textNode, offset: 20 }, 'forward', 'paragraph'),
    ).toEqual({ textNode: next, offset: 15 });
    expect(
      structuralTextPosition(paragraphs, { textNode: next, offset: 0 }, 'backward', 'paragraph'),
    ).toEqual({ textNode, offset: 0 });
  });
  it('maps normalized ligatures back to the original source glyph and handles document edges', () => {
    const source = [[{ textNode, text: 'A ﬂow.' }]];
    expect(structuralTextPosition(source, { textNode, offset: 0 }, 'forward', 'sentence')).toEqual({
      textNode,
      offset: 6,
    });
    expect(
      structuralTextPosition(source, { textNode, offset: 0 }, 'backward', 'sentence'),
    ).toBeNull();
  });

  it('skips whitespace-only blocks and sentence segments without inventing a source endpoint', () => {
    const blank = {} as Text;
    const source = [
      [{ textNode, text: 'First.' }],
      [{ textNode: blank, text: ' \n ' }],
      [{ textNode: next, text: '\nNext.' }],
    ];
    for (const granularity of ['sentence', 'paragraph'] as const) {
      expect(
        structuralTextPosition(source, { textNode, offset: 6 }, 'forward', granularity),
      ).toEqual({ textNode: next, offset: 6 });
      expect(
        structuralTextPosition(source, { textNode: next, offset: 0 }, 'backward', granularity),
      ).toEqual({ textNode, offset: 0 });
    }
    expect(
      structuralTextPosition(source, { textNode: next, offset: 0 }, 'forward', 'sentence'),
    ).toEqual({ textNode: next, offset: 6 });
  });
});
