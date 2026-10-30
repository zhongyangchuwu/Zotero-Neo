import { describe, expect, it } from 'vitest';
import {
  buildMappedTextIndex,
  mappedTextRange,
  tokenBoundaries,
  tokenRangeCovering,
} from '../../src/modules/reader-selection/token-boundaries';

function text(value: string): Text {
  return { data: value, length: value.length, nodeType: 3 } as unknown as Text;
}

describe('local PDF token boundaries and source mapping', () => {
  it('segments words and punctuation without making whitespace a selection stop', () => {
    const input = 'flow matching,';
    const tokens = tokenBoundaries(input);
    expect(tokens.map((token) => input.slice(token.start, token.end))).toEqual([
      'flow',
      'matching',
      ',',
    ]);
    expect(tokenRangeCovering(tokens, 1, 3)).toEqual({ start: 0, end: 4 });
    expect(tokenRangeCovering(tokens, 2, 11)).toEqual({ start: 0, end: 13 });
    expect(tokenRangeCovering(tokens, 4, 5)).toBeNull();
  });

  it('keeps Chinese, mixed scripts, decimals, hyphens and symbols at valid boundaries', () => {
    const input = '机器人学习 flow-matching 3.14 🧪';
    const tokens = tokenBoundaries(input);
    expect(tokens.length).toBeGreaterThan(4);
    for (const token of tokens) {
      expect(token.end).toBeGreaterThan(token.start);
      expect(input.slice(token.start, token.end)).not.toMatch(/^\s+$/u);
      expect(token.end).toBeLessThanOrEqual(input.length);
    }
    expect(tokens.map((token) => input.slice(token.start, token.end)).join('')).toBe(
      input.replace(/\s+/gu, ''),
    );
    expect(tokens.some((token) => input.slice(token.start, token.end) === '-')).toBe(true);
  });

  it('maps NFKC expansions to the complete source character', () => {
    const node = text('ﬂow');
    const index = buildMappedTextIndex([{ textNode: node, text: node.data }]);
    expect(index.text).toBe('flow');
    expect(mappedTextRange(index, 0, 2)).toEqual({
      start: { textNode: node, offset: 0 },
      end: { textNode: node, offset: 1 },
    });
    expect(mappedTextRange(index, 0, 4)?.end).toEqual({ textNode: node, offset: 3 });
  });

  it('composes combining marks even across PDF text nodes', () => {
    const first = text('e');
    const second = text('\u0301clair');
    const index = buildMappedTextIndex([
      { textNode: first, text: first.data },
      { textNode: second, text: second.data },
    ]);
    expect(index.text).toBe('éclair');
    expect(mappedTextRange(index, 0, 1)).toEqual({
      start: { textNode: first, offset: 0 },
      end: { textNode: second, offset: 1 },
    });
  });

  it('keeps surrogate pairs and collapsed whitespace as exact source ranges', () => {
    const node = text('A🧪  \nB');
    const index = buildMappedTextIndex([{ textNode: node, text: node.data }]);
    expect(index.text).toBe('A🧪 B');
    expect(mappedTextRange(index, 1, 3)).toEqual({
      start: { textNode: node, offset: 1 },
      end: { textNode: node, offset: 3 },
    });
    expect(mappedTextRange(index, 3, 4)).toEqual({
      start: { textNode: node, offset: 3 },
      end: { textNode: node, offset: 6 },
    });
    expect(mappedTextRange(index, 0, index.text.length)?.end).toEqual({
      textNode: node,
      offset: node.length,
    });
    expect(mappedTextRange(index, -1, 1)).toBeNull();
  });

  it('does not confuse an unsupported zero-length token range with a valid selection', () => {
    const tokens = tokenBoundaries('a  b');
    expect(tokenRangeCovering(tokens, 2, 2)).toBeNull();
    expect(tokenRangeCovering(tokens, 1, 3)).toBeNull();
    expect(tokenRangeCovering(tokens, 0, 4)).toEqual({ start: 0, end: 4 });
  });
});
