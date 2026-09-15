import {
  READER_DELEGABLE_MAIN_ACTIONS,
  type ReaderDelegableMainAction,
} from '../main/action-capabilities';
import type { ActionId } from '../input/actions';

export type ReaderCapabilityMode = 'normal' | 'visual' | 'cursor' | 'insert';

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
  'flashText',
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
  'enterCursor',
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

/** Actions implemented by the Reader Visual executor. */
export const READER_LOCAL_VISUAL_ACTIONS = Object.freeze([
  'flashText',
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
  'addNote',
  'copySelection',
  'searchSelection',
  'swapVisualEnds',
  'yankParagraph',
  'exitMode',
] as const satisfies readonly ActionId[]);

/** Actions implemented by the Reader Cursor executor. */
export const READER_LOCAL_CURSOR_ACTIONS = Object.freeze([
  'flashText',
  'cursorDown',
  'cursorUp',
  'cursorLeft',
  'cursorRight',
  'cursorWordForward',
  'cursorBigWordForward',
  'cursorWordBackward',
  'cursorBigWordBackward',
  'cursorLineStart',
  'cursorLineEnd',
  'cursorToVisual',
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
export type ReaderLocalCursorAction = (typeof READER_LOCAL_CURSOR_ACTIONS)[number];
export type ReaderLocalInsertAction = (typeof READER_LOCAL_INSERT_ACTIONS)[number];
export type ReaderNormalAction = (typeof READER_NORMAL_ACTIONS)[number];
export type ReaderLocalAction =
  | ReaderLocalNormalAction
  | ReaderLocalVisualAction
  | ReaderLocalCursorAction
  | ReaderLocalInsertAction;
export type ReaderAction = ReaderLocalAction | ReaderDelegableMainAction;

export type ReaderActionForMode<Mode extends ReaderCapabilityMode> = Mode extends 'normal'
  ? ReaderNormalAction
  : Mode extends 'visual'
    ? ReaderLocalVisualAction
    : Mode extends 'cursor'
      ? ReaderLocalCursorAction
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

export function isReaderLocalCursorAction(value: unknown): value is ReaderLocalCursorAction {
  return includesAction(READER_LOCAL_CURSOR_ACTIONS, value);
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
    isReaderLocalCursorAction(value) ||
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
  mode: 'cursor',
  value: unknown,
): value is ReaderLocalCursorAction;
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
    case 'cursor':
      return isReaderLocalCursorAction(value);
    case 'insert':
      return isReaderLocalInsertAction(value);
    default:
      return false;
  }
}
