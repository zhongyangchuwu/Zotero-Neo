import { describe, expect, it } from 'vitest';
import {
  buildFlashTextIndex,
  flashContinuationLabels,
  flashMatches,
  flashTokenMatches,
} from '../../src/modules/reader-selection/flash';

function text(value: string): Text {
  return { data: value, nodeType: 3, length: value.length } as unknown as Text;
}

function matches(value: string, query: string) {
  const node = text(value);
  const index = buildFlashTextIndex([{ textNode: node, text: node.data }]);
  return { node, index, raw: flashMatches(index, query), targets: flashTokenMatches(index, query) };
}

describe('Flash complete-token targeting', () => {
  it('expands partial words and complete phrases while excluding outer whitespace', () => {
    const example = matches('We use flow matching, next', 'flo');
    expect(example.targets).toEqual([
      {
        index: 7,
        pointer: { textNode: example.node, offset: 7 },
        end: { textNode: example.node, offset: 11 },
      },
    ]);

    const phrase = matches('We use flow matching, next', 'ow mat');
    expect(phrase.targets).toEqual([
      {
        index: 7,
        pointer: { textNode: phrase.node, offset: 7 },
        end: { textNode: phrase.node, offset: 20 },
      },
    ]);

    const comma = matches('We use flow matching, next', 'ing,');
    expect(comma.targets).toEqual([
      {
        index: 12,
        pointer: { textNode: comma.node, offset: 12 },
        end: { textNode: comma.node, offset: 21 },
      },
    ]);
  });

  it('treats punctuation as an independently selectable target', () => {
    const example = matches('flow, matching', ',');
    expect(example.targets).toEqual([
      {
        index: 4,
        pointer: { textNode: example.node, offset: 4 },
        end: { textNode: example.node, offset: 5 },
      },
    ]);
  });

  it('shows one target for overlapping substrings of a token', () => {
    const example = matches('banana banana', 'ana');
    expect(example.raw).toHaveLength(4);
    expect(example.targets).toHaveLength(2);
    expect(example.targets.map((match) => match.index)).toEqual([0, 7]);
    expect(example.targets.map((match) => match.end.offset)).toEqual([6, 13]);
  });

  it('still excludes letters that would extend the raw query, even after token expansion', () => {
    const example = matches('matching match', 'match');
    const excluded = flashContinuationLabels(example.index, 'match', example.raw);
    expect(excluded).toContain('I');
    expect(example.targets).toHaveLength(2);
    expect(example.targets[0]?.end.offset).toBe(8);
    expect(example.targets[1]?.end.offset).toBe(14);
  });

  it('does not mistake Unicode case fold lengths for original source offsets', () => {
    const example = matches('İx İx', 'x');
    expect(example.raw.map((match) => match.pointer.offset)).toEqual([1, 4]);
    expect(example.targets.map((match) => match.pointer.offset)).toEqual([0, 3]);
    expect(example.targets.map((match) => match.end.offset)).toEqual([2, 5]);

    const dotted = matches('İstanbul', 'i');
    expect(dotted.targets).toHaveLength(1);
    expect(dotted.targets[0]?.pointer.offset).toBe(0);
    expect(dotted.targets[0]?.end.offset).toBe(8);
  });

  it('preserves contextual Greek lowercasing alongside length-changing mappings', () => {
    const example = matches('İx ΟΣ ος ΟΣΑ', 'ος');
    expect(example.raw.map((match) => [match.pointer.offset, match.end.offset])).toEqual([
      [3, 5],
      [6, 8],
    ]);
    expect(example.targets.map((match) => [match.pointer.offset, match.end.offset])).toEqual([
      [3, 5],
      [6, 8],
    ]);

    const uppercase = matches('ΟΣ', 'ΟΣ');
    expect(uppercase.raw).toHaveLength(1);
    expect(uppercase.targets).toHaveLength(1);

    const medial = matches('ΟΣΑ', 'οσα');
    expect(medial.targets).toHaveLength(1);
    expect(medial.targets[0]?.end.offset).toBe(3);
  });

  it('selects an expanded NFKC ligature as one complete source word', () => {
    const example = matches('ﬂow matching', 'fl');
    expect(example.index.text).toBe('flow matching');
    expect(example.targets).toEqual([
      {
        index: 0,
        pointer: { textNode: example.node, offset: 0 },
        end: { textNode: example.node, offset: 3 },
      },
    ]);
  });

  it('uses visible span gaps to separate words without injecting synthetic search spaces', () => {
    const first = text('target');
    const second = text('target');
    const index = buildFlashTextIndex([
      {
        textNode: first,
        text: first.data,
        rect: { left: 10, right: 50, top: 10, bottom: 20, width: 40, height: 10 },
      },
      {
        textNode: second,
        text: second.data,
        rect: { left: 200, right: 240, top: 10, bottom: 20, width: 40, height: 10 },
      },
    ]);
    expect(index.text).toBe('targettarget');
    expect(index.tokenBreaks).toEqual([6]);
    expect(flashTokenMatches(index, 'target')).toEqual([
      {
        index: 0,
        pointer: { textNode: first, offset: 0 },
        end: { textNode: first, offset: 6 },
      },
      {
        index: 6,
        pointer: { textNode: second, offset: 0 },
        end: { textNode: second, offset: 6 },
      },
    ]);
  });

  it('still joins adjacent spans within one visually continuous word', () => {
    const first = text('hel');
    const second = text('lo');
    const index = buildFlashTextIndex([
      {
        textNode: first,
        text: first.data,
        rect: { left: 10, right: 34, top: 10, bottom: 20, width: 24, height: 10 },
      },
      {
        textNode: second,
        text: second.data,
        rect: { left: 34, right: 50, top: 10, bottom: 20, width: 16, height: 10 },
      },
    ]);
    expect(index.text).toBe('hello');
    expect(index.tokenBreaks).toBeUndefined();
    expect(flashTokenMatches(index, 'llo')).toEqual([
      {
        index: 0,
        pointer: { textNode: first, offset: 0 },
        end: { textNode: second, offset: 2 },
      },
    ]);
  });

  it('finds Chinese spans without demanding Latin word boundaries', () => {
    const example = matches('机器学习与数据', '学习');
    expect(example.targets).toHaveLength(1);
    expect(example.targets[0]?.pointer.offset).toBeLessThanOrEqual(2);
    expect(example.targets[0]?.end.offset).toBeGreaterThanOrEqual(4);
  });
});
