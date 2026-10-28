import type { ActionId } from '../../input/actions';

export const WORKSETS_SELECT_ACTIONS = Object.freeze([
  'mainSelectDown',
  'mainSelectUp',
  'mainSelectFirst',
  'mainSelectLast',
  'mainSelectSwapEnds',
  'mainSelectFinish',
  'mainSelectCancel',
] as const satisfies readonly ActionId[]);
