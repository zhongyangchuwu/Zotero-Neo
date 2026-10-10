import { describe, expect, it } from 'vitest';

import { outlineEntryKind } from '../../src/reader/outline-presentation';

describe('outlineEntryKind', () => {
  it('requires a numbered figure or table identifier', () => {
    for (const title of [
      'Table of Contents',
      'Tables of Results',
      'Figurative Language',
      'Figure caption without a number',
      '表格说明',
      '图示说明',
    ]) {
      expect(outlineEntryKind(title, 0, 0)).toBeNull();
    }
  });

  it('classifies explicit figure and table captions before heading or hierarchy hints', () => {
    expect(outlineEntryKind('Fig. 2.1 Results', 1, 3)).toBe('figure');
    expect(outlineEntryKind('Figure 4: Summary', 0, 1)).toBe('figure');
    expect(outlineEntryKind('Table 3: Measurements', 0, 2)).toBe('table');
    expect(outlineEntryKind('图三：实验结果', 0, 0)).toBe('figure');
    expect(outlineEntryKind('表 2-1 数据', 2, 0)).toBe('table');
  });

  it('classifies numbered headings by their explicit numbering', () => {
    expect(outlineEntryKind('1 Introduction', 0, 0)).toBe('section');
    expect(outlineEntryKind('1.2 Methods', 0, 0)).toBe('subsection');
  });

  it('uses existing hierarchy without inventing kinds for unknown root leaves', () => {
    expect(outlineEntryKind('Background', 1, 0)).toBe('subsection');
    expect(outlineEntryKind('Overview', 0, 2)).toBe('section');
    expect(outlineEntryKind('Abstract', 0, 0)).toBeNull();
  });
});
