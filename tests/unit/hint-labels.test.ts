import { describe, expect, it } from 'vitest';

import { hintLabels } from '../../src/reader/hint-labels';

describe('reader hint labels', () => {
  it('preserves the existing single-key display order', () => {
    expect(hintLabels(4)).toEqual(['A', 'S', 'D', 'F']);
  });

  it('uses stable fixed-width labels after exhausting the single-key alphabet', () => {
    const labels = hintLabels(27);

    expect(labels).toHaveLength(27);
    expect(new Set(labels).size).toBe(27);
    expect(labels.every((label) => label.length === 2)).toBe(true);
    expect(labels.slice(0, 3)).toEqual(['AA', 'AS', 'AD']);
    expect(labels.at(-1)).toBe('SA');
  });
});
