import {
  READER_DELEGABLE_MAIN_ACTIONS,
  type ReaderDelegableMainAction,
} from '../main/action-capabilities';
import type { ActionId } from '../input/actions';

export type ReaderCapabilityMode = 'normal' | 'visual' | 'insert';

/** Actions implemented by the Reader Normal executor itself. */
export const READER_LOCAL_NORMAL_ACTIONS = Object.freeze([
  'scrollDown',
  'scrollUp',
  'scrollLeft',
  'scrollRight',
  'prevPage',
  'nextPage',
  'historyBack',
  'historyForward',
  'followLink',
  'firstPage',
  'lastPage',
  'halfPageDown',
  'halfPageUp',
  'fullPageDown',
  'fullPageUp',
  'zoomIn',
  'zoomOut',
  'zoomReset',
  'scrollTop',
  'scrollCenter',
  'scrollBottom',
  'openSearch',
  'findNext',
  'findPrevious',
  'prevAnnotation',
  'nextAnnotation',
  'clearSearch',
  'editAnnotation',
  'deleteAnnotation',
  'filterYellow',
  'filterRed',
  'filterGreen',
  'filterBlue',
  'filterPurple',
  'filterClear',
  'recolorYellow',
  'recolorRed',
  'recolorGreen',
  'recolorBlue',
  'recolorPurple',
  'yankAnnotation',
  'yankAnnotationComment',
  'enterVisual',
  'enterInsert',
  'focusReaderSplitLeft',
  'focusReaderSplitDown',
  'focusReaderSplitUp',
  'focusReaderSplitRight',
  'toggleReaderSplitHorizontal',
  'toggleReaderSplitVertical',
  'toggleReaderSidebarOutline',
  'focusReaderSidebar',
  'toggleMarksExplorer',
  'openCommandPalette',
] as const satisfies readonly ActionId[]);

/** Actions implemented while a PDF text selection is active. */
export const READER_LOCAL_VISUAL_ACTIONS = Object.freeze([
  'flashText',
  'openSelectionActions',
  'extendDown',
  'extendUp',
  'extendLeft',
  'extendRight',
  'extendSentenceForward',
  'extendSentenceBackward',
  'extendParagraphForward',
  'extendParagraphBackward',
  'extendWordForward',
  'extendWordBackward',
  'extendLineStart',
  'extendLineEnd',
  'highlightYellow',
  'highlightRed',
  'highlightGreen',
  'highlightBlue',
  'highlightPurple',
  'underlineSelection',
  'addNote',
  'copySelection',
  'searchSelection',
  'swapVisualEnds',
  'exitMode',
] as const satisfies readonly ActionId[]);

/** Actions implemented by the Reader Insert executor. */
export const READER_LOCAL_INSERT_ACTIONS = Object.freeze([
  'exitMode',
] as const satisfies readonly ActionId[]);

/** Reader Normal availability combines local actions with the narrow Main route. */
export const READER_NORMAL_ACTIONS = Object.freeze([
  ...READER_LOCAL_NORMAL_ACTIONS,
  ...READER_DELEGABLE_MAIN_ACTIONS,
] as const satisfies readonly ActionId[]);

export type ReaderLocalNormalAction = (typeof READER_LOCAL_NORMAL_ACTIONS)[number];
export type ReaderLocalVisualAction = (typeof READER_LOCAL_VISUAL_ACTIONS)[number];
export type ReaderLocalInsertAction = (typeof READER_LOCAL_INSERT_ACTIONS)[number];
export type ReaderNormalAction = (typeof READER_NORMAL_ACTIONS)[number];
export type ReaderLocalAction =
  | ReaderLocalNormalAction
  | ReaderLocalVisualAction
  | ReaderLocalInsertAction;
export type ReaderAction = ReaderLocalAction | ReaderDelegableMainAction;

export type ReaderActionForMode<Mode extends ReaderCapabilityMode> = Mode extends 'normal'
  ? ReaderNormalAction
  : Mode extends 'visual'
    ? ReaderLocalVisualAction
    : ReaderLocalInsertAction;

function includesAction(actions: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && actions.includes(value);
}

export function isReaderLocalNormalAction(value: unknown): value is ReaderLocalNormalAction {
  return includesAction(READER_LOCAL_NORMAL_ACTIONS, value);
}

export function isReaderLocalVisualAction(value: unknown): value is ReaderLocalVisualAction {
  return includesAction(READER_LOCAL_VISUAL_ACTIONS, value);
}

export function isReaderLocalInsertAction(value: unknown): value is ReaderLocalInsertAction {
  return includesAction(READER_LOCAL_INSERT_ACTIONS, value);
}

export function isReaderNormalAction(value: unknown): value is ReaderNormalAction {
  return isReaderLocalNormalAction(value) || includesAction(READER_DELEGABLE_MAIN_ACTIONS, value);
}

export function isReaderLocalAction(value: unknown): value is ReaderLocalAction {
  return (
    isReaderLocalNormalAction(value) ||
    isReaderLocalVisualAction(value) ||
    isReaderLocalInsertAction(value)
  );
}

export function isReaderAction(value: unknown): value is ReaderAction {
  return isReaderLocalAction(value) || includesAction(READER_DELEGABLE_MAIN_ACTIONS, value);
}

export function isReaderActionForMode(mode: 'normal', value: unknown): value is ReaderNormalAction;
export function isReaderActionForMode(
  mode: 'visual',
  value: unknown,
): value is ReaderLocalVisualAction;
export function isReaderActionForMode(
  mode: 'insert',
  value: unknown,
): value is ReaderLocalInsertAction;
export function isReaderActionForMode(
  mode: ReaderCapabilityMode,
  value: unknown,
): value is ReaderAction;
export function isReaderActionForMode(
  mode: ReaderCapabilityMode,
  value: unknown,
): value is ReaderAction {
  switch (mode) {
    case 'normal':
      return isReaderNormalAction(value);
    case 'visual':
      return isReaderLocalVisualAction(value);
    case 'insert':
      return isReaderLocalInsertAction(value);
  }
}
