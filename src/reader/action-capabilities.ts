import type { ActionId } from '../input/actions';
import { TAG_ITEM_ACTIONS } from '../modules/tags/capabilities';
import { EXTENSIONS_SURFACE_ACTIONS } from '../modules/extensions/capabilities';
import { COLLECTION_MEMBERSHIP_ACTIONS } from '../modules/collections/capabilities';
import { READER_HINT_ACTIONS } from '../modules/reader-hints/capabilities';

export type ReaderCapabilityMode = 'normal' | 'visual';

/** Actions implemented by the Reader Normal executor itself. */
export const READER_LOCAL_NORMAL_ACTIONS = Object.freeze([
  'scrollDown',
  'scrollUp',
  'scrollLeft',
  'scrollRight',
  'prevPage',
  'nextPage',
  ...READER_HINT_ACTIONS,
  'firstPage',
  'lastPage',
  'halfPageDown',
  'halfPageUp',
  'fullPageDown',
  'fullPageUp',
  'toggleReadingMode',
  'compareDocumentParsing',
  'prepareDocuments',
  'openFigurePicker',
  'openChapterSearch',
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
  'prevHeading',
  'nextHeading',
  'prevFigure',
  'nextFigure',
  'prevTable',
  'nextTable',
  'prevBookmark',
  'nextBookmark',
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
  'toggleBodySelection',
  'enterInsert',
  'focusReaderSplitLeft',
  'focusReaderSplitDown',
  'focusReaderSplitUp',
  'focusReaderSplitRight',
  'toggleReaderSplitHorizontal',
  'toggleReaderSplitVertical',
  'toggleReaderSidebarOutline',
  'focusReaderOutline',
  'focusReaderMarks',
  'focusReaderAnnotations',
  'focusReaderThumbnails',
  'toggleMarksExplorer',
  ...TAG_ITEM_ACTIONS,
  ...COLLECTION_MEMBERSHIP_ACTIONS,
  'mainYankCitekey',
  'showInLibrary',
  'openCommandPalette',
] as const satisfies readonly ActionId[]);

const READER_PANEL_ACTIONS = [
  'focusReaderOutline',
  'focusReaderMarks',
  'focusReaderAnnotations',
  'focusReaderThumbnails',
] as const satisfies readonly ActionId[];

/** Configurable Neo controls; native arrows, Tab and editors remain host-owned. */
export const READER_OUTLINE_ACTIONS = Object.freeze([
  ...READER_PANEL_ACTIONS,
  'prevHeading',
  'nextHeading',
  'uiNext',
  'uiPrevious',
  'uiParent',
  'uiChild',
  'uiConfirm',
  'uiCancel',
] as const satisfies readonly ActionId[]);
export const READER_MARKS_ACTIONS = Object.freeze([
  ...READER_PANEL_ACTIONS,
  'prevHeading',
  'nextHeading',
  'uiNext',
  'uiPrevious',
  'uiFirst',
  'uiLast',
  'uiConfirm',
  'uiCancel',
  'uiDelete',
  'uiClear',
] as const satisfies readonly ActionId[]);
export const READER_ANNOTATIONS_ACTIONS = Object.freeze([
  ...READER_PANEL_ACTIONS,
  'prevHeading',
  'nextHeading',
  'uiNext',
  'uiPrevious',
  'uiCancel',
] as const satisfies readonly ActionId[]);
export const READER_THUMBNAILS_ACTIONS = Object.freeze([
  ...READER_PANEL_ACTIONS,
  'prevHeading',
  'nextHeading',
  'uiNext',
  'uiPrevious',
  'uiCancel',
] as const satisfies readonly ActionId[]);

/** Actions implemented while a PDF text selection is active. */
export const READER_LOCAL_VISUAL_ACTIONS = Object.freeze([
  'flashText',
  'openSelectionActions',
  'extendDown',
  'extendUp',
  'extendLeft',
  'extendRight',
  'extendTokenBackward',
  'extendTokenForward',
  'extendTokenDown',
  'extendTokenUp',
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

/** Actions available in Reader Normal, including explicit Main-surface operations. */
export const READER_NORMAL_ACTIONS = Object.freeze([
  ...READER_LOCAL_NORMAL_ACTIONS,
  'findAllItems',
  'findCollectionItems',
  'findNotes',
  'mainAddByIdentifier',
  ...EXTENSIONS_SURFACE_ACTIONS,
  'openNeoSettings',
  'navigateBack',
  'navigateForward',
  'switchTab',
  'closeCurrentTab',
  'previousTab',
  'nextTab',
] as const satisfies readonly ActionId[]);

export type ReaderLocalNormalAction = (typeof READER_LOCAL_NORMAL_ACTIONS)[number];
export type ReaderLocalVisualAction = (typeof READER_LOCAL_VISUAL_ACTIONS)[number];
export type ReaderNormalAction = (typeof READER_NORMAL_ACTIONS)[number];
export type ReaderLocalAction = ReaderLocalNormalAction | ReaderLocalVisualAction;
export type ReaderAction = ReaderLocalAction | ReaderNormalAction;

export type ReaderActionForMode<Mode extends ReaderCapabilityMode> = Mode extends 'normal'
  ? ReaderNormalAction
  : ReaderLocalVisualAction;

function includesAction(actions: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && actions.includes(value);
}

export function isReaderLocalNormalAction(value: unknown): value is ReaderLocalNormalAction {
  return includesAction(READER_LOCAL_NORMAL_ACTIONS, value);
}

export function isReaderLocalVisualAction(value: unknown): value is ReaderLocalVisualAction {
  return includesAction(READER_LOCAL_VISUAL_ACTIONS, value);
}

export function isReaderNormalAction(value: unknown): value is ReaderNormalAction {
  return includesAction(READER_NORMAL_ACTIONS, value);
}

export function isReaderLocalAction(value: unknown): value is ReaderLocalAction {
  return isReaderLocalNormalAction(value) || isReaderLocalVisualAction(value);
}

export function isReaderAction(value: unknown): value is ReaderAction {
  return isReaderLocalAction(value) || isReaderNormalAction(value);
}

export function isReaderActionForMode(mode: 'normal', value: unknown): value is ReaderNormalAction;
export function isReaderActionForMode(
  mode: 'visual',
  value: unknown,
): value is ReaderLocalVisualAction;
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
  }
}
