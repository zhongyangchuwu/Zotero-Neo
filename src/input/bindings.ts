import { isActionId, type ActionId } from './actions';

export const MODES = ['normal', 'visual', 'insert', 'main'] as const;

export type Mode = (typeof MODES)[number];
export type BindingKey = `${Mode}:${string}`;
export type BindingMap = Readonly<Record<string, ActionId>>;

const MODE_BY_NAME: Readonly<Record<string, true>> = {
  normal: true,
  visual: true,
  insert: true,
  main: true,
};

export const DEFAULT_BINDINGS = {
  'normal:j': 'scrollDown',
  'normal:k': 'scrollUp',
  'normal:H': 'mainPrevTab',
  'normal:L': 'mainNextTab',
  'normal:zh': 'scrollLeft',
  'normal:zl': 'scrollRight',
  'normal:h': 'prevPage',
  'normal:l': 'nextPage',
  'normal:gg': 'firstPage',
  'normal:G': 'lastPage',
  'normal:ctrl+d': 'halfPageDown',
  'normal:ctrl+u': 'halfPageUp',
  'normal:ctrl+f': 'fullPageDown',
  'normal:ctrl+b': 'fullPageUp',
  'normal:+': 'zoomIn',
  'normal:-': 'zoomOut',
  'normal:zI': 'zoomIn',
  'normal:zO': 'zoomOut',
  'normal:=': 'zoomReset',
  'normal:z0': 'zoomReset',
  'normal:ctrl+o': 'historyBack',
  'normal:ctrl+i': 'historyForward',
  'normal:f': 'followLink',
  'normal:/': 'openSearch',
  'normal::': 'openCommandPalette',
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
  'normal:i': 'enterInsert',
  'normal:ctrl+h': 'focusReaderSplitLeft',
  'normal:ctrl+j': 'focusReaderSplitDown',
  'normal:ctrl+k': 'focusReaderSplitUp',
  'normal:ctrl+l': 'focusReaderSplitRight',
  'normal:escape': 'clearSearch',
  'normal: e': 'toggleReaderSidebarOutline',
  'normal: -': 'toggleReaderSplitHorizontal',
  'normal: |': 'toggleReaderSplitVertical',
  'normal: ff': 'mainFuzzyAll',
  'normal: fc': 'mainFuzzyCollection',
  'normal: ft': 'mainTabPick',
  'normal: td': 'mainClosePDF',
  'normal: fn': 'mainNotesLayout',
  'normal: yy': 'mainYankCitekey',
  'normal: m': 'toggleMarksExplorer',
  'visual:s': 'flashText',
  'visual:a': 'openSelectionActions',
  'visual:enter': 'openSelectionActions',
  'visual:return': 'openSelectionActions',
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
  'insert:escape': 'exitMode',
  'main: ff': 'mainFuzzyAll',
  'main::': 'openCommandPalette',
  'main: fc': 'mainFuzzyCollection',
  'main: ft': 'mainTabPick',
  'main: fT': 'mainTagPicker',
  'main: td': 'mainClosePDF',
  'main: fn': 'mainNotesLayout',
  'main: e': 'mainFocusTree',
  'main: yy': 'mainYankCitekey',
  'main: o': 'mainOpenPDF',
  'main: wh': 'mainFocusLeft',
  'main: wl': 'mainFocusRight',
  'main: ww': 'mainFocusItems',
  'main:ctrl+h': 'focusReaderSplitLeft',
  'main:ctrl+j': 'focusReaderSplitDown',
  'main:ctrl+k': 'focusReaderSplitUp',
  'main:ctrl+l': 'focusReaderSplitRight',
  'main:dd': 'mainTrashItems',
  'main:x': 'mainTrashItems',
  'main:u': 'mainRestoreTrashedItems',
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
  'main:H': 'mainPrevTab',
  'main:L': 'mainNextTab',
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

export type BindingOverride = ActionId | null;
export type BindingOverrides = Readonly<Record<string, BindingOverride>>;

function parseBindingEntries(raw: unknown): [string, unknown][] {
  if (typeof raw !== 'string' || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  return Object.entries(parsed);
}

export function parseBindingOverrides(raw: unknown): Record<string, BindingOverride> {
  const result: Record<string, BindingOverride> = {};
  for (const [key, action] of parseBindingEntries(raw)) {
    if (!parseBindingKey(key) || (action !== null && !isActionId(action))) continue;
    result[key] = action;
  }
  return result;
}

export function parseCustomBindings(raw: unknown): Record<string, ActionId> {
  const result: Record<string, ActionId> = {};
  for (const [key, action] of Object.entries(parseBindingOverrides(raw))) {
    if (action !== null) result[key] = action;
  }
  return result;
}

const RETIRED_DEFAULT_BINDINGS = {
  'normal:s': 'flashText',
  'normal:H': 'scrollLeft',
  'normal:L': 'scrollRight',
  'normal:J': 'mainPrevTab',
  'normal:K': 'mainNextTab',
  'main:J': 'mainPrevTab',
  'main:K': 'mainNextTab',
  'normal: fb': 'mainFuzzyCollection',
  'normal: bj': 'mainTabPick',
  'normal: o': 'mainOpenPDF',
  'normal: q': 'mainClosePDF',
  'main: fb': 'mainFuzzyCollection',
  'main: bj': 'mainTabPick',
  'main: q': 'mainClosePDF',
  'normal: n': 'mainNotesLayout',
  'main: n': 'mainNotesLayout',
  'normal: tp': 'mainTabPick',
  'main: tp': 'mainTabPick',
  'main:ctrl+u': 'mainRestoreTrashedItems',
} as const;

const REMOVED_ACTIONS: Readonly<Record<string, true>> = {
  mainFocusSearch: true,
  mainAdvancedSearch: true,
};

function stringifyBindingOverrides(overrides: BindingOverrides): string {
  const sorted = Object.fromEntries(
    Object.entries(overrides).sort(([left], [right]) => left.localeCompare(right)),
  );
  return Object.keys(sorted).length ? JSON.stringify(sorted) : '';
}

/** Converts the legacy full binding table into compact overrides without inferring deletions. */
export function migrateLegacyBindingOverrides(raw: unknown): string {
  const overrides: Record<string, ActionId> = {};
  for (const [key, action] of parseBindingEntries(raw)) {
    if (!parseBindingKey(key) || REMOVED_ACTIONS[String(action)] || !isActionId(action)) continue;
    if (RETIRED_DEFAULT_BINDINGS[key as keyof typeof RETIRED_DEFAULT_BINDINGS] === action) continue;
    if (DEFAULT_BINDINGS[key as keyof typeof DEFAULT_BINDINGS] !== action) overrides[key] = action;
  }
  return stringifyBindingOverrides(overrides);
}

export function encodeBindingOverrides(bindings: BindingMap): string {
  const overrides: Record<string, BindingOverride> = {};
  const keys = new Set([...Object.keys(DEFAULT_BINDINGS), ...Object.keys(bindings)]);
  for (const key of keys) {
    const action = bindings[key];
    const defaultAction: ActionId | undefined =
      DEFAULT_BINDINGS[key as keyof typeof DEFAULT_BINDINGS];
    if (action === undefined) {
      if (defaultAction !== undefined) overrides[key] = null;
    } else if (action !== defaultAction) overrides[key] = action;
  }
  return stringifyBindingOverrides(overrides);
}

export function resolveBindings(raw: unknown): BindingMap {
  const bindings: Record<string, ActionId> = { ...DEFAULT_BINDINGS };
  for (const [key, action] of Object.entries(parseBindingOverrides(raw))) {
    if (action === null) delete bindings[key];
    else bindings[key] = action;
  }
  return Object.freeze(bindings);
}
