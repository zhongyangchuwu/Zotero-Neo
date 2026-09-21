import { describe, expect, it } from 'vitest';

import {
  appendInputKey,
  bindingEqualsInput,
  bindingMatchesInputPrefix,
  bindingSequenceIsStrictPrefix,
  bindingSequenceTokens,
  canonicalBindingSequence,
  inputBufferTokens,
  popInputKey,
} from '../../src/input/key-sequence';

describe('semantic key sequences', () => {
  it('separates named keys from printable character sequences', () => {
    expect(bindingSequenceTokens('enter')).toEqual(['enter']);
    expect(bindingSequenceTokens('<e>nter')).toEqual(['e', 'n', 't', 'e', 'r']);
    expect(bindingSequenceTokens('gg')).toEqual(['g', 'g']);
    expect(bindingSequenceIsStrictPrefix('e', 'enter')).toBe(false);
    expect(bindingSequenceIsStrictPrefix('d', 'delete')).toBe(false);
    expect(bindingSequenceIsStrictPrefix('g', 'gg')).toBe(true);
  });

  it('supports explicit token boundaries inside longer shortcuts', () => {
    expect(bindingSequenceTokens('<enter>g')).toEqual(['enter', 'g']);
    expect(bindingSequenceTokens('<ctrl+d>g')).toEqual(['ctrl+d', 'g']);
    expect(bindingSequenceTokens('ctrl+dg')).toEqual(['ctrl+d', 'g']);
    expect(canonicalBindingSequence('ctrl+dg')).toBe('<ctrl+d>g');
  });

  it('can express literal words that collide with named-key spellings', () => {
    expect(canonicalBindingSequence('<e>nter')).toBe('<e>nter');
    expect(bindingSequenceTokens('<<enter>>')).toEqual(['<', 'e', 'n', 't', 'e', 'r', '>']);
  });

  it('keeps runtime boundaries for multi-character event tokens', () => {
    const enter = appendInputKey('', 'enter');
    expect(inputBufferTokens(enter)).toEqual(['enter']);
    expect(bindingEqualsInput('enter', enter)).toBe(true);
    expect(bindingMatchesInputPrefix('<enter>g', enter)).toBe(true);
    expect(bindingMatchesInputPrefix('enterg', enter)).toBe(false);

    const chord = appendInputKey(appendInputKey('', 'ctrl+d'), 'g');
    expect(inputBufferTokens(chord)).toEqual(['ctrl+d', 'g']);
    expect(bindingEqualsInput('<ctrl+d>g', chord)).toBe(true);
    expect(popInputKey(chord)).toBe(appendInputKey('', 'ctrl+d'));
    expect(popInputKey(popInputKey(chord))).toBe('');
  });
});
