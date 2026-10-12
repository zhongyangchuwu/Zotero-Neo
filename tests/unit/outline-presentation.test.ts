import { describe, expect, it } from 'vitest';

import { outlineEntryKind } from '../../src/reader/outline-presentation';

describe('outlineEntryKind', () => {
  it('does not mistake ordinary titles for numbered Figure or Table targets', () => {
    for (const title of [
      'Table of Contents',
      'Tables of Results',
      'Figurative Language',
      'Figure caption without a number',
      '表格说明',
      '图示说明',
    ]) {
      expect(outlineEntryKind(title, 0)).toBe('section');
    }
  });

  it('classifies explicit figure and table captions before heading or hierarchy hints', () => {
    expect(outlineEntryKind('Fig. 2.1 Results', 1)).toBe('figure');
    expect(outlineEntryKind('Figure 4: Summary', 0)).toBe('figure');
    expect(outlineEntryKind('Table 3: Measurements', 0)).toBe('table');
    expect(outlineEntryKind('图三：实验结果', 0)).toBe('figure');
    expect(outlineEntryKind('表 2-1 数据', 2)).toBe('table');
  });

  it('classifies numbered and unnumbered native headings at every depth', () => {
    expect(outlineEntryKind('1 Introduction', 0)).toBe('section');
    expect(outlineEntryKind('1.2 Methods', 0)).toBe('subsection');
    expect(outlineEntryKind('Introduction', 0)).toBe('section');
    expect(outlineEntryKind('Related Work', 0)).toBe('section');
    expect(outlineEntryKind('Background', 1)).toBe('subsection');
    expect(outlineEntryKind('Abstract', 0)).toBe('section');
  });

  it('excludes empty and invalid native titles', () => {
    expect(outlineEntryKind('', 0)).toBeNull();
    expect(outlineEntryKind('  \t ', 0)).toBeNull();
    expect(outlineEntryKind('— · §', 0)).toBeNull();
  });
});
