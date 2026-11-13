import { describe, expect, it, vi } from 'vitest';
import type { PreferenceReader } from '../../src/core/preferences';
import {
  TAB_ENHANCEMENT_PREFERENCES,
  tabRailOptions,
  tabTitleFormat,
} from '../../src/modules/tab-enhancements/config';
import {
  normalizeTabRailWidth,
  TAB_RAIL_WIDTH,
} from '../../src/toolkit/main/tab-enhancements-types';

describe('tab enhancement display preferences', () => {
  it('uses the shared finite width normalizer and its defaults', () => {
    expect(TAB_RAIL_WIDTH).toEqual({ min: 180, max: 520, default: 260 });
    expect(normalizeTabRailWidth('520')).toBe(260);
    expect(normalizeTabRailWidth(Number.NaN)).toBe(260);
    expect(normalizeTabRailWidth(Number.POSITIVE_INFINITY)).toBe(260);
    expect(normalizeTabRailWidth(179)).toBe(180);
    expect(normalizeTabRailWidth(520.4)).toBe(520);
    expect(normalizeTabRailWidth(521)).toBe(520);
  });

  it('defaults malformed stored types without rewriting preferences', () => {
    const values = new Map<string, unknown>([
      [TAB_ENHANCEMENT_PREFERENCES.side, 'far-right'],
      [TAB_ENHANCEMENT_PREFERENCES.width, '500'],
      [TAB_ENHANCEMENT_PREFERENCES.collapsed, 'false'],
      [TAB_ENHANCEMENT_PREFERENCES.titleFormat, 42],
    ]);
    const write = vi.fn();
    const preferences = {
      get: (key: string, fallback: boolean | number | string) =>
        values.has(key) ? values.get(key) : fallback,
      set: write,
    } as unknown as PreferenceReader;

    expect(tabRailOptions(preferences)).toEqual({
      side: 'left',
      width: 260,
      collapsed: false,
    });
    expect(tabTitleFormat(preferences)).toBe('{title}');
    values.set(TAB_ENHANCEMENT_PREFERENCES.width, Number.NaN);
    expect(tabRailOptions(preferences).width).toBe(260);
    expect(write).not.toHaveBeenCalled();
  });

  it('preserves valid stored display values and clamps numeric widths', () => {
    const values = new Map<string, unknown>([
      [TAB_ENHANCEMENT_PREFERENCES.side, 'right'],
      [TAB_ENHANCEMENT_PREFERENCES.width, 900],
      [TAB_ENHANCEMENT_PREFERENCES.collapsed, true],
      [TAB_ENHANCEMENT_PREFERENCES.titleFormat, '{author} — {title}'],
    ]);
    const preferences = {
      get: (key: string, fallback: boolean | number | string) =>
        values.has(key) ? values.get(key) : fallback,
    } as unknown as PreferenceReader;

    expect(tabRailOptions(preferences)).toEqual({
      side: 'right',
      width: 520,
      collapsed: true,
    });
    values.set(TAB_ENHANCEMENT_PREFERENCES.side, 'top');
    expect(tabRailOptions(preferences).side).toBe('top');
    expect(tabTitleFormat(preferences)).toBe('{author} — {title}');
  });
});
