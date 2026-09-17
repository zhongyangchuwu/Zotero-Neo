import { describe, expect, it } from 'vitest';

import { fuzzyMatchScore } from '../../src/main/picker';

describe('fuzzysort matcher adapter', () => {
  it('keeps contiguous matches ahead of wide-gap matches', () => {
    expect(fuzzyMatchScore('alpha beta', 'ab')).toBeGreaterThan(
      fuzzyMatchScore('a very long gap before b', 'ab') ?? Number.NEGATIVE_INFINITY,
    );
    expect(fuzzyMatchScore('alpha', 'az')).toBeNull();
  });

  it('matches CJK subsequences without transliteration', () => {
    expect(fuzzyMatchScore('扩散模型', '扩模')).not.toBeNull();
    expect(fuzzyMatchScore('机器人学习', '机学')).not.toBeNull();
    expect(fuzzyMatchScore('拡散モデル', '拡モ')).not.toBeNull();
  });

  it('uses fuzzysort unicode normalization for accents and full-width forms', () => {
    expect(fuzzyMatchScore('Café diffusion', 'cafe')).not.toBeNull();
    expect(fuzzyMatchScore('ＡＢＣ Transformer', 'abc')).not.toBeNull();
  });

  it('keeps empty-query behavior compatible with existing picker callers', () => {
    expect(fuzzyMatchScore('anything', '   ')).toBe(0);
  });
});
