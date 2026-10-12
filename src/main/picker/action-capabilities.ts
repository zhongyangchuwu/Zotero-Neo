import type { ActionId } from '../../input/actions';

/** Neo commands implemented by the query surface; text editing remains native. */
export const PICKER_INPUT_ACTIONS = Object.freeze([
  'uiNext',
  'uiPrevious',
  'uiFirst',
  'uiLast',
  'uiConfirm',
  'uiCancel',
  'uiFocusList',
  'uiPreviewDown',
  'uiPreviewUp',
  'uiNextPane',
  'uiPreviousPane',
] as const satisfies readonly ActionId[]);

/** The list and non-editable preview share the picker-owned command surface. */
export const PICKER_LIST_ACTIONS = Object.freeze([
  ...PICKER_INPUT_ACTIONS,
  'uiSearch',
] as const satisfies readonly ActionId[]);
