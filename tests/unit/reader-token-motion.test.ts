import { describe, expect, it } from 'vitest';
import {
  horizontalTokenSelection,
  selectionToToken,
  sourceTokens,
  tokenAtPointer,
} from '../../src/modules/reader-selection/token-motion';
import type { Pointer } from '../../src/reader/types';

function fixture(value: string) {
  const node = { nodeType: 3, data: value, length: value.length } as Text;
  const tokens = sourceTokens([{ textNode: node, text: value }]);
  return {
    tokens,
    point: (offset: number): Pointer => ({ textNode: node, offset }),
    text: (anchor: Pointer, focus: Pointer): string =>
      value.slice(Math.min(anchor.offset, focus.offset), Math.max(anchor.offset, focus.offset)),
  };
}

describe('whole-token selection motions', () => {
  it('grows, shrinks, crosses the anchor and never stops at outer spaces or an empty range', () => {
    const f = fixture('We use flow   matching, next');
    let anchor = f.point(7);
    let focus = f.point(11);
    const observed: string[] = [];
    for (const direction of [1, 1, -1, -1, -1, 1, 1] as const) {
      const next = horizontalTokenSelection(f.tokens, anchor, focus, direction)!;
      anchor = next.anchor;
      focus = next.focus;
      observed.push(f.text(anchor, focus));
    }
    expect(observed).toEqual([
      'flow   matching',
      'flow   matching,',
      'flow   matching',
      'flow',
      'use flow',
      'flow',
      'flow   matching',
    ]);
  });

  it('keeps the new anchor token included after swapping a multi-token selection', () => {
    const f = fixture('flow matching, next');
    let next = horizontalTokenSelection(f.tokens, f.point(13), f.point(0), 1)!;
    expect(f.text(next.anchor, next.focus)).toBe('matching');
    expect(next.anchor.offset).toBe(13);
    expect(next.focus.offset).toBe(5);
    next = horizontalTokenSelection(f.tokens, next.anchor, next.focus, 1)!;
    expect(f.text(next.anchor, next.focus)).toBe('matching,');
    expect(next.anchor.offset).toBe(5);
    expect(next.focus.offset).toBe(14);
  });

  it('resolves Flash endpoints before and after a full-word anchor consistently', () => {
    const f = fixture('flow matching, next');
    const backward = selectionToToken(f.tokens, f.point(5), f.point(13), 0)!;
    expect(f.text(backward.anchor, backward.focus)).toBe('flow matching');
    expect(backward.anchor.offset).toBe(13);
    const crossed = selectionToToken(f.tokens, backward.anchor, backward.focus, 3)!;
    expect(f.text(crossed.anchor, crossed.focus)).toBe('matching, next');
  });

  it('preserves exact partial native anchors instead of expanding them without permission', () => {
    const f = fixture('flow matching, next');
    const next = horizontalTokenSelection(f.tokens, f.point(2), f.point(10), 1)!;
    expect(next.anchor.offset).toBe(2);
    expect(f.text(next.anchor, next.focus)).toBe('ow matching,');
    const previous = selectionToToken(f.tokens, f.point(8), f.point(13), 0)!;
    expect(previous.anchor.offset).toBe(8);
    expect(previous.focus.offset).toBe(0);
  });

  it('has no movement beyond either document boundary', () => {
    const f = fixture('flow matching');
    expect(horizontalTokenSelection(f.tokens, f.point(0), f.point(4), -1)).toBeNull();
    expect(horizontalTokenSelection(f.tokens, f.point(0), f.point(13), 1)).toBeNull();
  });

  it('starts with one adjacent token when adopting a collapsed native caret', () => {
    const f = fixture('use flow matching');
    const left = horizontalTokenSelection(f.tokens, f.point(4), f.point(4), -1)!;
    expect(f.text(left.anchor, left.focus)).toBe('use');
    const right = horizontalTokenSelection(f.tokens, f.point(4), f.point(4), 1)!;
    expect(f.text(right.anchor, right.focus)).toBe('flow');
  });

  it('maps NFKC symbols, combining clusters and surrogate pairs to indivisible source units', () => {
    const f = fixture('½ e\u0301clair 🧪');
    expect(f.tokens.map((t) => f.text(t.start, t.end))).toEqual(['½', 'e\u0301clair', '🧪']);
    const next = horizontalTokenSelection(f.tokens, f.point(0), f.point(1), 1)!;
    expect(f.text(next.anchor, next.focus)).toBe('½ e\u0301clair');
    expect(next.focus.offset).toBe(9);
  });

  it('keeps CJK, decimal, acronym, hyphen and formula punctuation units selectable', () => {
    const f = fixture('机器学习，3.14 U.S. flow-matching x+y');
    const parts = f.tokens.map((t) => f.text(t.start, t.end));
    expect(parts.join('')).toBe('机器学习，3.14U.S.flow-matchingx+y');
    expect(parts).toContain('，');
    expect(parts).toContain('-');
    expect(parts).toContain('+');
    expect(parts).toContain('3.14');
  });

  it('respects visually separated spans but joins tight fragments of one word', () => {
    const nodes = ['hel', 'lo', 'next'].map(
      (data) => ({ nodeType: 3, data, length: data.length }) as Text,
    );
    for (const [index, node] of nodes.entries())
      node.compareDocumentPosition = (other) => (nodes.indexOf(other as Text) > index ? 4 : 2);
    const tokens = sourceTokens(
      nodes.map((textNode, index) => ({
        textNode,
        text: textNode.data,
        rect: {
          left: [0, 24, 100][index]!,
          right: [24, 40, 132][index]!,
          top: 0,
          bottom: 10,
          height: 10,
        },
      })),
    );
    expect(tokens).toEqual([
      { start: { textNode: nodes[0], offset: 0 }, end: { textNode: nodes[1], offset: 2 } },
      { start: { textNode: nodes[2], offset: 0 }, end: { textNode: nodes[2], offset: 4 } },
    ]);
    const next = horizontalTokenSelection(tokens, tokens[0]!.start, tokens[0]!.end, 1)!;
    expect(next.anchor).toEqual(tokens[0]!.start);
    expect(next.focus).toEqual(tokens[1]!.end);
  });

  it('does not invent an order for a pointer from a replaced document', () => {
    const f = fixture('flow');
    const other = { compareDocumentPosition: () => 1 } as unknown as Text;
    expect(tokenAtPointer(f.tokens, { textNode: other, offset: 0 }, 'start')).toBeNull();
  });
});
