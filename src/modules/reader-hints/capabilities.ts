import type { ActionId } from '../../input/actions';

export const READER_HINT_ACTIONS = Object.freeze([
  'followLink',
  'copyTarget',
] as const satisfies readonly ActionId[]);
