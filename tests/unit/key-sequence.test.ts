import { describe, expect, it } from 'vitest';

import {
  appendInputKey,
  bindingEqualsInput,
  bindingMatchesInputPrefix,
  bindingSequenceIsStrictPrefix,
  bindingSequenceTokens,
  canonicalBindingSequence,
  inputBufferTokens,
  migrateLegacyKeySequence,
  popInputKey,
} from '../../src/input/key-sequence';

describe('Neovim-style key notation', () => {
  it('keeps printable text literal and reserves angle notation for symbolic keys', () => {
    expect(bindingSequenceTokens('enter')).toEqual(['e', 'n', 't', 'e', 'r']);
    expect(bindingSequenceTokens('f1')).toEqual(['f', '1']);
    expect(bindingSequenceTokens('<Enter>')).toEqual(['enter']);
    expect(bindingSequenceTokens('<F1>')).toEqual(['f1']);
    expect(bindingSequenceTokens('<f>')).toBeNull();
    expect(bindingSequenceTokens('<lt>')).toEqual(['<']);
  });

  it('parses modifiers and longer mixed sequences by token boundaries', () => {
    expect(bindingSequenceTokens('<C-d>g')).toEqual(['ctrl+d', 'g']);
    expect(bindingSequenceTokens('<S-Tab>')).toEqual(['shift+tab']);
    expect(bindingSequenceTokens('<C-S-Left>')).toEqual(['ctrl+shift+arrowleft']);
    expect(bindingSequenceTokens('<M-a>')).toEqual(['alt+a']);
    expect(bindingSequenceIsStrictPrefix('e', '<Enter>')).toBe(false);
    expect(bindingSequenceIsStrictPrefix('f', '<F1>')).toBe(false);
    expect(bindingSequenceIsStrictPrefix('g', 'gg')).toBe(true);
  });

  it('canonicalizes aliases without creating a second printable-key syntax', () => {
    expect(canonicalBindingSequence('<CR>')).toBe('<Enter>');
    expect(canonicalBindingSequence('<Escape>')).toBe('<Esc>');
    expect(canonicalBindingSequence('<Backspace>')).toBe('<BS>');
    expect(canonicalBindingSequence('<C-d>g')).toBe('<C-d>g');
    expect(canonicalBindingSequence('enter')).toBe('enter');
  });

  it('keeps runtime event tokens distinct from their printable spellings', () => {
    const enter = appendInputKey('', 'enter');
    expect(inputBufferTokens(enter)).toEqual(['enter']);
    expect(bindingEqualsInput('<Enter>', enter)).toBe(true);
    expect(bindingEqualsInput('enter', enter)).toBe(false);
    expect(bindingMatchesInputPrefix('<Enter>g', enter)).toBe(true);
    expect(bindingMatchesInputPrefix('enterg', enter)).toBe(false);

    const chord = appendInputKey(appendInputKey('', 'ctrl+d'), 'g');
    expect(inputBufferTokens(chord)).toEqual(['ctrl+d', 'g']);
    expect(bindingEqualsInput('<C-d>g', chord)).toBe(true);
    expect(popInputKey(chord)).toBe(appendInputKey('', 'ctrl+d'));
    expect(popInputKey(popInputKey(chord))).toBe('');
  });

  it('migrates the ambiguous legacy flat grammar toward special-key behavior', () => {
    expect(migrateLegacyKeySequence('enter')).toBe('<Enter>');
    expect(migrateLegacyKeySequence('f1')).toBe('<F1>');
    expect(migrateLegacyKeySequence('ctrl+d')).toBe('<C-d>');
    expect(migrateLegacyKeySequence('ctrl+dg')).toBe('<C-d>g');
    expect(migrateLegacyKeySequence(' ff')).toBe('<Space>ff');
    expect(migrateLegacyKeySequence('custom-tab')).toBe('custom-tab');
    expect(migrateLegacyKeySequence('enterg')).toBe('enterg');
  });
});
