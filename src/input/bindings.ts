import { isActionId, type ActionId } from './actions';

export const MODES = ['normal', 'visual', 'cursor', 'insert', 'main'] as const;

export type Mode = (typeof MODES)[number];
export type BindingKey = `${Mode}:${string}`;
export type BindingMap = Readonly<Record<string, ActionId>>;

const MODE_BY_NAME: Readonly<Record<string, true>> = {
  normal: true,
  visual: true,
  cursor: true,
  insert: true,
  main: true,
};

export const DEFAULT_BINDINGS = {
  'normal:j': 'scrollDown',
  'normal:k': 'scrollUp',
  'normal:H': 'scrollLeft',
  'normal:L': 'scrollRight',
  'normal:h': 'prevPage',
  'normal:l': 'nextPage',
  'normal:gg': 'firstPage',
  'normal:G': 'lastPage',
  'normal:ctrl+d': 'halfPageDown',
  'normal:ctrl+u': 'halfPageUp',
  'normal:ctrl+f': 'fullPageDown',
  'normal:ctrl+b': 'fullPageUp',
  'normal:ctrl+o': 'historyBack',
  'normal:ctrl+i': 'historyForward',
  'normal:/': 'openSearch',
  'normal:n': 'findNext',
  'normal:N': 'findPrevious',
  'normal:[': 'prevAnnotation',
  'normal:]': 'nextAnnotation',
  'normal:enter': 'editAnnotation',
  'normal:return': 'editAnnotation',
  'normal:dd': 'deleteAnnotation',
  'normal:y': 'yankAnnotation',
  'normal:yy': 'yankAnnotationComment',
  'normal:zy': 'recolorYellow',
  'normal:zr': 'recolorRed',
  'normal:zg': 'recolorGreen',
  'normal:zb': 'recolorBlue',
  'normal:zp': 'recolorPurple',
  'normal:zt': 'scrollTop',
  'normal:zz': 'scrollCenter',
  'normal:Zy': 'filterYellow',
  'normal:Zr': 'filterRed',
  'normal:Zg': 'filterGreen',
  'normal:Zb': 'filterBlue',
  'normal:Zp': 'filterPurple',
  'normal:Za': 'filterClear',
  'normal:v': 'enterVisual',
  'normal:c': 'enterCursor',
  'normal:i': 'enterInsert',
  'normal:J': 'mainPrevTab',
  'normal:K': 'mainNextTab',
  'normal:ctrl+h': 'focusReaderSplitLeft',
  'normal:ctrl+j': 'focusReaderSplitDown',
  'normal:ctrl+k': 'focusReaderSplitUp',
  'normal:ctrl+l': 'focusReaderSplitRight',
  'normal:escape': 'clearSearch',
  'normal: e': 'toggleReaderSidebarOutline',
  'normal: -': 'toggleReaderSplitHorizontal',
  'normal: |': 'toggleReaderSplitVertical',
  'normal: ff': 'mainFuzzyAll',
  'normal: fb': 'mainFuzzyCollection',
  'normal: bj': 'mainTabPick',
  'normal: n': 'mainNotesLayout',
  'normal: yy': 'mainYankCitekey',
  'normal: o': 'mainOpenPDF',
  'normal: q': 'mainClosePDF',
  'normal: m': 'toggleMarksExplorer',
  'visual:j': 'extendDown',
  'visual:k': 'extendUp',
  'visual:h': 'extendLeft',
  'visual:l': 'extendRight',
  'visual:)': 'extendSentenceForward',
  'visual:(': 'extendSentenceBackward',
  'visual:}': 'extendParagraphForward',
  'visual:{': 'extendParagraphBackward',
  'visual:w': 'extendWordForward',
  'visual:b': 'extendWordBackward',
  'visual:0': 'extendLineStart',
  'visual:$': 'extendLineEnd',
  'visual:zy': 'highlightYellow',
  'visual:zr': 'highlightRed',
  'visual:zg': 'highlightGreen',
  'visual:zb': 'highlightBlue',
  'visual:zp': 'highlightPurple',
  'visual:za': 'addNote',
  'visual:i': 'addNote',
  'visual:y': 'copySelection',
  'visual:yy': 'yankParagraph',
  'visual:#': 'searchSelection',
  'visual:o': 'swapVisualEnds',
  'visual:v': 'exitMode',
  'visual:escape': 'exitMode',
  'cursor:j': 'cursorDown',
  'cursor:k': 'cursorUp',
  'cursor:h': 'cursorLeft',
  'cursor:l': 'cursorRight',
  'cursor:w': 'cursorWordForward',
  'cursor:W': 'cursorBigWordForward',
  'cursor:b': 'cursorWordBackward',
  'cursor:B': 'cursorBigWordBackward',
  'cursor:0': 'cursorLineStart',
  'cursor:$': 'cursorLineEnd',
  'cursor:v': 'cursorToVisual',
  'cursor:escape': 'exitMode',
  'insert:escape': 'exitMode',
  'main: ff': 'mainFuzzyAll',
  'main: fb': 'mainFuzzyCollection',
  'main: bj': 'mainTabPick',
  'main: n': 'mainNotesLayout',
  'main: e': 'mainFocusTree',
  'main: yy': 'mainYankCitekey',
  'main: o': 'mainOpenPDF',
  'main: q': 'mainClosePDF',
  'main: /': 'mainFocusSearch',
  'main: wh': 'mainFocusLeft',
  'main: wl': 'mainFocusRight',
  'main: ww': 'mainFocusItems',
  'main:h': 'mainTreeCollapse',
  'main:l': 'mainTreeExpand',
  'main:j': 'mainNavDown',
  'main:k': 'mainNavUp',
  'main:za': 'mainTreeToggle',
  'main:zo': 'mainTreeOpenOnly',
  'main:zc': 'mainTreeCloseOnly',
  'main:R': 'mainTreeExpandAll',
  'main:M': 'mainTreeCollapseAll',
  'main:backspace': 'mainTreeParent',
  'main:gg': 'mainNavFirst',
  'main:G': 'mainNavLast',
  'main:J': 'mainPrevTab',
  'main:K': 'mainNextTab',
  'main:enter': 'mainActivate',
  'main:return': 'mainActivate',
} as const satisfies BindingMap;

export interface ParsedBindingKey {
  mode: Mode;
  sequence: string;
}

export function parseBindingKey(value: string): ParsedBindingKey | null {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const mode = value.slice(0, separator);
  const sequence = value.slice(separator + 1);
  if (!MODE_BY_NAME[mode] || !sequence) return null;
  return { mode: mode as Mode, sequence };
}

export function parseCustomBindings(raw: unknown): Record<string, ActionId> {
  if (typeof raw !== 'string' || raw === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const result: Record<string, ActionId> = {};
  for (const [key, action] of Object.entries(parsed)) {
    if (!parseBindingKey(key) || !isActionId(action)) continue;
    result[key] = action;
  }
  return result;
}

export function resolveBindings(raw: unknown): BindingMap {
  return Object.freeze({ ...DEFAULT_BINDINGS, ...parseCustomBindings(raw) });
}
