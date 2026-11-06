import type { ActionId } from '../../input/actions';

export const TAB_ENHANCEMENT_SURFACE_ACTIONS = Object.freeze([
  'tabFocusSidebar',
  'tabToggleSidebar',
] as const satisfies readonly ActionId[]);

export const TAB_SIDEBAR_INPUT_ACTIONS = Object.freeze([
  'uiNext',
  'uiPrevious',
  'uiFirst',
  'uiLast',
  'uiConfirm',
  'uiCancel',
  'uiFocusList',
  'uiNextPane',
  'uiPreviousPane',
  'tabCreateGroup',
  'tabRenameGroup',
  'tabCloseEntry',
  'tabToggleGroup',
  'tabOpenGroup',
  'tabCloseGroup',
  'tabUngroup',
  'tabRemoveFromGroup',
] as const satisfies readonly ActionId[]);

export const TAB_SIDEBAR_LIST_ACTIONS = Object.freeze([
  ...TAB_SIDEBAR_INPUT_ACTIONS,
  'uiSearch',
] as const satisfies readonly ActionId[]);
