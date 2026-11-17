import { describe, expect, it } from 'vitest';
import {
  normalizeAttributeKey,
  normalizeAttributeValue,
  readAttributeValue,
  replaceAttributeValue,
} from '../../src/item-attributes/extra';
import type { ItemAttributeDefinition } from '../../src/item-attributes/types';

const text: ItemAttributeDefinition = {
  id: 'research',
  key: 'Research Score',
  label: 'Score',
  type: 'text',
};
const number: ItemAttributeDefinition = { ...text, type: 'number' };

describe('lossless Extra attributes', () => {
  it('changes only the matching value, preserving mixed line endings and unrelated bytes', () => {
    const extra = '  Unstructured e\u0301  \r\n\tResearch-score :  old  \r\nDOI: 10.1/a:b\n尾行 \r';
    expect(replaceAttributeValue(extra, text.key, 'new: value')).toBe(
      '  Unstructured e\u0301  \r\n\tResearch-score :  new: value  \r\nDOI: 10.1/a:b\n尾行 \r',
    );
    expect(readAttributeValue(extra, 'RESEARCH_score')).toEqual({ value: 'old', ambiguous: false });
    expect(replaceAttributeValue(extra, text.key, ' old ')).toBe(extra);
  });

  it('removes only the owned line boundary, retaining all remaining separators', () => {
    expect(replaceAttributeValue('A: one\r\nResearch Score: 2\nB: three\r', text.key, null)).toBe(
      'A: one\r\nB: three\r',
    );
    expect(replaceAttributeValue('A: one\r\nResearch Score: 2', text.key, '  ')).toBe('A: one');
    expect(replaceAttributeValue('Research Score:   \r\nA: one', text.key, null)).toBe('A: one');
    expect(replaceAttributeValue('No field\r\n', text.key, null)).toBe('No field\r\n');
  });

  it('appends using existing line endings without rewriting existing text', () => {
    expect(replaceAttributeValue('A: one\r\nB: two', text.key, '0')).toBe(
      'A: one\r\nB: two\r\nResearch Score: 0',
    );
    expect(replaceAttributeValue('A: one\r\n', text.key, '0')).toBe('A: one\r\nResearch Score: 0');
    expect(replaceAttributeValue('', text.key, '0')).toBe('Research Score: 0');
  });

  it.each(['Other: one', 'A: one\r\nB: two', 'A: one\rB: two', 'A: one\nB: two', ''])(
    'roundtrips append and final-line clear without a trailing separator: %j',
    (extra) => {
      const appended = replaceAttributeValue(extra, text.key, '3');
      expect(replaceAttributeValue(appended, text.key, null)).toBe(extra);
    },
  );

  it('fails closed on duplicate normalized keys, even with equal values', () => {
    const extra = 'Research-Score: 2\r\nresearch_score: 2';
    expect(readAttributeValue(extra, text.key)).toEqual({ value: null, ambiguous: true });
    expect(() => replaceAttributeValue(extra, text.key, '3')).toThrow(/ambiguous/);
    expect(() => replaceAttributeValue(extra, text.key, null)).toThrow(/ambiguous/);
    expect(readAttributeValue('Research Score: a\u0000b', text.key)).toEqual({
      value: null,
      ambiguous: true,
    });
    expect(() => replaceAttributeValue('Research Score: a\u0000b', text.key, 'safe')).toThrow(
      /ambiguous/,
    );
    expect(readAttributeValue('Research Score: \ufeff2', text.key)).toEqual({
      value: null,
      ambiguous: true,
    });
    expect(() => replaceAttributeValue('Research Score: \ufeff2', text.key, 'safe')).toThrow(
      /ambiguous/,
    );
  });

  it('keeps punctuation distinct rather than matching arbitrary near keys', () => {
    expect(normalizeAttributeKey(' RESEARCH-score_ ')).toBe(normalizeAttributeKey(text.key));
    expect(readAttributeValue('ResearchScoreOther: untouched', text.key)).toEqual({
      value: null,
      ambiguous: false,
    });
    expect(readAttributeValue('Research.Score: untouched', text.key)).toEqual({
      value: null,
      ambiguous: false,
    });
  });

  it.each([
    'Research\nScore',
    'Research\rScore',
    'Research: Score',
    'Research\tScore',
    'zV-marks',
    'ZV_marks_reader',
  ])('rejects invalid or managed key %j', (key) => {
    expect(() => normalizeAttributeKey(key)).toThrow();
    expect(() => replaceAttributeValue('', key, 'safe')).toThrow();
  });

  it.each(['a\nb', 'a\rb', 'a\tb', 'a\u0000b', 'a\u0085b', 'a\u2028b', 'a\u202eb', '\ufeff2'])(
    'rejects control-character value injection %j',
    (value) => {
      expect(() => normalizeAttributeValue(text, value)).toThrow();
      expect(() => replaceAttributeValue('', text.key, value)).toThrow();
    },
  );

  it('treats blank values as removal while allowing colon-containing text', () => {
    expect(normalizeAttributeValue(text, null)).toBeNull();
    expect(normalizeAttributeValue(text, '   ')).toBeNull();
    expect(normalizeAttributeValue(text, '  a:b  ')).toBe('a:b');
  });
});

describe('attribute numbers', () => {
  it.each([
    '0',
    '-0',
    '-12',
    '-0.25',
    '.125',
    '1.',
    '+3',
    '1e3',
    '9007199254740993',
    '0.123456789012345678901',
  ])('retains the exact finite decimal spelling %s without rounding', (value) => {
    expect(normalizeAttributeValue(number, ` ${value} `)).toBe(value);
  });

  it.each([
    'NaN',
    'Infinity',
    '-Infinity',
    '1e999',
    '0x10',
    '1,5',
    '1 2',
    '.',
    '-',
    '12px',
    '1_000',
  ])('rejects invalid number %s', (value) => {
    expect(() => normalizeAttributeValue(number, value)).toThrow(/finite/);
  });
});
