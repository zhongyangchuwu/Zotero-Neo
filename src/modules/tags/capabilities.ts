import type { ActionId } from '../../input/actions';

export const TAG_ITEM_ACTIONS = ['addTag', 'removeTag'] as const satisfies readonly ActionId[];
export const TAG_MAIN_ACTIONS = [
  ...TAG_ITEM_ACTIONS,
  'toggleTagFilter',
  'clearTagFilters',
] as const satisfies readonly ActionId[];
