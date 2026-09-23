import type { ActionId } from '../input/actions';

/** Actions exposed by the ordinary Main-window interaction mode. */
export const MAIN_NORMAL_ACTIONS = Object.freeze([
  'openCommandPalette',
  'openSearch',
  'findNext',
  'findPrevious',
  'findAllItems',
  'findCollectionItems',
  'findNotes',
  'mainQuickSearch',
  'mainAdvancedSearch',
  'managePlugins',
  'manageSelection',
  'mainReturnContext',
  'switchTab',
  'mainTrashItems',
  'mainRestoreTrashedItems',
  'mainFocusTree',
  'mainFocusLeft',
  'mainFocusRight',
  'mainFocusItems',
  'focusReaderSplitLeft',
  'focusReaderSplitDown',
  'focusReaderSplitUp',
  'focusReaderSplitRight',
  'mainYankCitekey',
  'mainOpenPDF',
  'mainActivate',
  'closeCurrentTab',
  'previousTab',
  'nextTab',
  'addTag',
  'removeTag',
  'toggleTagFilter',
  'clearTagFilters',
  'addToCollection',
  'removeFromCollection',
  'mainNavDown',
  'mainNavUp',
  'mainNavFirst',
  'mainNavLast',
  'mainTreeToggle',
  'mainTreeOpenOnly',
  'mainTreeCloseOnly',
  'mainTreeExpand',
  'mainTreeCollapse',
  'mainTreeParent',
  'mainTreeExpandAll',
  'mainTreeCollapseAll',
  'mainToggleSelection',
  'mainClearSelection',
  'mainEnterSelect',
] as const satisfies readonly ActionId[]);

/** Actions owned by transient Main Visual range editing. Ordinary Main actions remain available as fallbacks. */
export const MAIN_ITEM_SELECT_ACTIONS = Object.freeze([
  'mainSelectDown',
  'mainSelectUp',
  'mainSelectFirst',
  'mainSelectLast',
  'mainSelectSwapEnds',
  'mainSelectFinish',
  'mainSelectCancel',
] as const satisfies readonly ActionId[]);

export const MAIN_SELECT_ACTIONS = Object.freeze([
  ...MAIN_NORMAL_ACTIONS,
  ...MAIN_ITEM_SELECT_ACTIONS,
] as const satisfies readonly ActionId[]);

export const MAIN_EXECUTABLE_ACTIONS = MAIN_SELECT_ACTIONS;

export type MainNormalAction = (typeof MAIN_NORMAL_ACTIONS)[number];
export type MainItemSelectAction = (typeof MAIN_ITEM_SELECT_ACTIONS)[number];
export type MainExecutableAction = (typeof MAIN_EXECUTABLE_ACTIONS)[number];

/** Reader may delegate only non-selection Main actions with an explicit owner route. */
export const READER_DELEGABLE_MAIN_ACTIONS = Object.freeze([
  'findAllItems',
  'findCollectionItems',
  'findNotes',
  'managePlugins',
  'mainReturnContext',
  'switchTab',
  'mainYankCitekey',
  'closeCurrentTab',
  'previousTab',
  'nextTab',
  'addTag',
  'removeTag',
  'addToCollection',
  'removeFromCollection',
] as const satisfies readonly MainNormalAction[]);

export type ReaderDelegableMainAction = (typeof READER_DELEGABLE_MAIN_ACTIONS)[number];

function includes(actions: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && actions.includes(value);
}
export function isMainExecutableAction(value: unknown): value is MainExecutableAction {
  return includes(MAIN_EXECUTABLE_ACTIONS, value);
}
export function isMainItemSelectAction(value: unknown): value is MainItemSelectAction {
  return includes(MAIN_ITEM_SELECT_ACTIONS, value);
}
export function isReaderDelegableMainAction(value: unknown): value is ReaderDelegableMainAction {
  return includes(READER_DELEGABLE_MAIN_ACTIONS, value);
}
