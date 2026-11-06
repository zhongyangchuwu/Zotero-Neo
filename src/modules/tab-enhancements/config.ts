import type { PreferenceReader } from '../../core/preferences';
import { normalizeTabRailWidth, TAB_RAIL_WIDTH } from '../../toolkit/main/tab-enhancements-types';
import type { TabRailLayoutOptions } from '../../toolkit/main/tab-enhancements-types';

export const TAB_ENHANCEMENT_PREFERENCES = {
  side: 'tabEnhancements.side',
  width: 'tabEnhancements.width',
  collapsed: 'tabEnhancements.collapsed',
  titleFormat: 'tabEnhancements.titleFormat',
} as const;
export const TAB_GROUP_STATE_PREFERENCE = 'tabEnhancements.groups.v1';
export const TAB_SIDEBAR_DEFAULT_FORMAT = '{title}';

/** Saved groups are not display preferences and are deliberately excluded from display reset. */
export function tabRailOptions(preferences: PreferenceReader): TabRailLayoutOptions {
  const side: unknown = preferences.get(TAB_ENHANCEMENT_PREFERENCES.side, 'left');
  const width: unknown = preferences.get(TAB_ENHANCEMENT_PREFERENCES.width, TAB_RAIL_WIDTH.default);
  const collapsed: unknown = preferences.get(TAB_ENHANCEMENT_PREFERENCES.collapsed, false);
  return {
    side: side === 'right' ? 'right' : 'left',
    width: normalizeTabRailWidth(width),
    collapsed: typeof collapsed === 'boolean' ? collapsed : false,
  };
}

export function tabTitleFormat(preferences: PreferenceReader): string {
  const format: unknown = preferences.get(
    TAB_ENHANCEMENT_PREFERENCES.titleFormat,
    TAB_SIDEBAR_DEFAULT_FORMAT,
  );
  return typeof format === 'string' ? format : TAB_SIDEBAR_DEFAULT_FORMAT;
}
