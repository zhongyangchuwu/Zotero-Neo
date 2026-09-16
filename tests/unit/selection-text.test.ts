import { describe, expect, it } from 'vitest';

import { selectionClipboardText } from '../../src/reader/selection-text';

describe('selectionClipboardText', () => {
  it('turns PDF layout line breaks and other whitespace into ordinary spaces', () => {
    expect(selectionClipboardText('first line\r\nsecond\u2028line\tend')).toBe(
      'first line second line end',
    );
  });

  it('composes canonical Unicode without compatibility-folding selected text', () => {
    expect(selectionClipboardText('Cafe\u0301  text')).toBe('Café text');
  });
});
