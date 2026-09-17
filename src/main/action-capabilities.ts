import type { ActionId } from '../input/actions';

/** Actions the Main-window executor can dispatch. */
export const MAIN_EXECUTABLE_ACTIONS = Object.freeze([
  'openCommandPalette',
  'mainFuzzyAll',
  'mainFuzzyCollection',
  'mainNotesLayout',
  'mainTabPick',
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
  'mainClosePDF',
  'mainPrevTab',
  'mainNextTab',
  'mainTagPicker',
  'mainTagEditor',
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
] as const satisfies readonly ActionId[]);

export type MainExecutableAction = (typeof MAIN_EXECUTABLE_ACTIONS)[number];

/**
 * Main actions with an explicit Reader owner route. Keep this subset narrow: a Reader
 * may ask Main to run these actions, but must not reach Main's selection/tree mutations.
 */
export const READER_DELEGABLE_MAIN_ACTIONS = Object.freeze([
  'mainFuzzyAll',
  'mainFuzzyCollection',
  'mainNotesLayout',
  'mainTabPick',
  'mainYankCitekey',
  'mainClosePDF',
  'mainPrevTab',
  'mainNextTab',
  'mainTagEditor',
] as const satisfies readonly MainExecutableAction[]);

export type ReaderDelegableMainAction = (typeof READER_DELEGABLE_MAIN_ACTIONS)[number];

export function isMainExecutableAction(value: unknown): value is MainExecutableAction {
  return (
    typeof value === 'string' && (MAIN_EXECUTABLE_ACTIONS as readonly string[]).includes(value)
  );
}

export function isReaderDelegableMainAction(value: unknown): value is ReaderDelegableMainAction {
  return (
    typeof value === 'string' &&
    (READER_DELEGABLE_MAIN_ACTIONS as readonly string[]).includes(value)
  );
}
