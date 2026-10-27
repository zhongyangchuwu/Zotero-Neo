import type { ActionId } from '../input/actions';
import { TAG_MAIN_ACTIONS } from '../modules/tags/capabilities';
import { EXTENSIONS_SURFACE_ACTIONS } from '../modules/extensions/capabilities';

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
  ...EXTENSIONS_SURFACE_ACTIONS,
  'openNeoSettings',
  'manageSelection',
  'navigateBack',
  'navigateForward',
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
  'mainAddByIdentifier',
  'mainOpenPDF',
  'mainActivate',
  'closeCurrentTab',
  'previousTab',
  'nextTab',
  ...TAG_MAIN_ACTIONS,
  'addToCollection',
  'removeFromCollection',
  'findCollections',
  'addItemsToCurrentCollection',
  'moveToCollection',
  'moveCollection',
  'createCollection',
  'renameCollection',
  'deleteCollection',
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
  'mainCancelTarget',
  'mainEnterSelect',
] as const satisfies readonly ActionId[]);

/** Actions explicitly owned by transient Main Visual range editing. */
export const MAIN_ITEM_SELECT_ACTIONS = Object.freeze([
  'mainSelectDown',
  'mainSelectUp',
  'mainSelectFirst',
  'mainSelectLast',
  'mainSelectSwapEnds',
  'mainSelectFinish',
  'mainSelectCancel',
] as const satisfies readonly ActionId[]);

export const MAIN_SELECT_ACTIONS = MAIN_ITEM_SELECT_ACTIONS;

export const MAIN_EXECUTABLE_ACTIONS = Object.freeze([
  ...MAIN_NORMAL_ACTIONS,
  ...MAIN_ITEM_SELECT_ACTIONS,
] as const satisfies readonly ActionId[]);

export type MainNormalAction = (typeof MAIN_NORMAL_ACTIONS)[number];
export type MainItemSelectAction = (typeof MAIN_ITEM_SELECT_ACTIONS)[number];
export type MainExecutableAction = (typeof MAIN_EXECUTABLE_ACTIONS)[number];

function includes(actions: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && actions.includes(value);
}
export function isMainExecutableAction(value: unknown): value is MainExecutableAction {
  return includes(MAIN_EXECUTABLE_ACTIONS, value);
}
export function isMainItemSelectAction(value: unknown): value is MainItemSelectAction {
  return includes(MAIN_ITEM_SELECT_ACTIONS, value);
}
