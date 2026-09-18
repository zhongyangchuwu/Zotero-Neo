import { isActionId, type ActionId } from './actions';
import { NOTE_LOCAL_DEFAULT_BINDINGS, isNoteCrossContextActionId } from './note-actions';

export const MODES = [
  'reader-normal',
  'reader-select',
  'reader-insert',
  'main-normal',
  'main-select',
  'note-normal',
  'note-insert',
] as const;

export type Mode = (typeof MODES)[number];
export type BindingKey = `${Mode}:${string}`;
export type BindingMap = Readonly<Record<string, ActionId>>;

const LEGACY_MODE_ALIASES: Readonly<Record<string, Mode>> = {
  normal: 'reader-normal',
  visual: 'reader-select',
  insert: 'reader-insert',
  main: 'main-normal',
};

function canonicalMode(value: string): Mode | null {
  if ((MODES as readonly string[]).includes(value)) return value as Mode;
  return LEGACY_MODE_ALIASES[value] ?? null;
}

export const DEFAULT_BINDINGS = {
  'reader-normal:j': 'scrollDown',
  'reader-normal:k': 'scrollUp',
  'reader-normal:H': 'mainPrevTab',
  'reader-normal:L': 'mainNextTab',
  'reader-normal:zh': 'scrollLeft',
  'reader-normal:zl': 'scrollRight',
  'reader-normal:h': 'prevPage',
  'reader-normal:l': 'nextPage',
  'reader-normal:gg': 'firstPage',
  'reader-normal:G': 'lastPage',
  'reader-normal:ctrl+d': 'halfPageDown',
  'reader-normal:ctrl+u': 'halfPageUp',
  'reader-normal:ctrl+f': 'fullPageDown',
  'reader-normal:ctrl+b': 'fullPageUp',
  'reader-normal:+': 'zoomIn',
  'reader-normal:-': 'zoomOut',
  'reader-normal:zI': 'zoomIn',
  'reader-normal:zO': 'zoomOut',
  'reader-normal:=': 'zoomReset',
  'reader-normal:z0': 'zoomReset',
  'reader-normal:ctrl+o': 'historyBack',
  'reader-normal:ctrl+i': 'historyForward',
  'reader-normal:f': 'followLink',
  'reader-normal:/': 'openSearch',
  'reader-normal::': 'openCommandPalette',
  'reader-normal:n': 'findNext',
  'reader-normal:N': 'findPrevious',
  'reader-normal:[': 'prevAnnotation',
  'reader-normal:]': 'nextAnnotation',
  'reader-normal:enter': 'editAnnotation',
  'reader-normal:return': 'editAnnotation',
  'reader-normal:dd': 'deleteAnnotation',
  'reader-normal:y': 'yankAnnotation',
  'reader-normal:yy': 'yankAnnotationComment',
  'reader-normal:zy': 'recolorYellow',
  'reader-normal:zr': 'recolorRed',
  'reader-normal:zg': 'recolorGreen',
  'reader-normal:zb': 'recolorBlue',
  'reader-normal:zp': 'recolorPurple',
  'reader-normal:zt': 'scrollTop',
  'reader-normal:zz': 'scrollCenter',
  'reader-normal:Zy': 'filterYellow',
  'reader-normal:Zr': 'filterRed',
  'reader-normal:Zg': 'filterGreen',
  'reader-normal:Zb': 'filterBlue',
  'reader-normal:Zp': 'filterPurple',
  'reader-normal:Za': 'filterClear',
  'reader-normal:v': 'enterVisual',
  'reader-normal:i': 'enterInsert',
  'reader-normal:ctrl+h': 'focusReaderSplitLeft',
  'reader-normal:ctrl+j': 'focusReaderSplitDown',
  'reader-normal:ctrl+k': 'focusReaderSplitUp',
  'reader-normal:ctrl+l': 'focusReaderSplitRight',
  'reader-normal:escape': 'clearSearch',
  'reader-normal: e': 'toggleReaderSidebarOutline',
  'reader-normal: -': 'toggleReaderSplitHorizontal',
  'reader-normal: |': 'toggleReaderSplitVertical',
  'reader-normal: ff': 'mainFuzzyAll',
  'reader-normal: fc': 'mainFuzzyCollection',
  'reader-normal: ft': 'mainTabPick',
  'reader-normal: td': 'mainClosePDF',
  'reader-normal: ta': 'mainTagEditor',
  'reader-normal: fn': 'mainNotesLayout',
  'reader-normal: yy': 'mainYankCitekey',
  'reader-normal: m': 'toggleMarksExplorer',
  'reader-select:s': 'flashText',
  'reader-select:a': 'openSelectionActions',
  'reader-select:enter': 'openSelectionActions',
  'reader-select:return': 'openSelectionActions',
  'reader-select:j': 'extendDown',
  'reader-select:k': 'extendUp',
  'reader-select:h': 'extendLeft',
  'reader-select:l': 'extendRight',
  'reader-select:)': 'extendSentenceForward',
  'reader-select:(': 'extendSentenceBackward',
  'reader-select:}': 'extendParagraphForward',
  'reader-select:{': 'extendParagraphBackward',
  'reader-select:w': 'extendWordForward',
  'reader-select:b': 'extendWordBackward',
  'reader-select:0': 'extendLineStart',
  'reader-select:$': 'extendLineEnd',
  'reader-select:zy': 'highlightYellow',
  'reader-select:zr': 'highlightRed',
  'reader-select:zg': 'highlightGreen',
  'reader-select:zb': 'highlightBlue',
  'reader-select:zp': 'highlightPurple',
  'reader-select:za': 'addNote',
  'reader-select:i': 'addNote',
  'reader-select:y': 'copySelection',
  'reader-select:yy': 'yankParagraph',
  'reader-select:#': 'searchSelection',
  'reader-select:o': 'swapVisualEnds',
  'reader-select:v': 'exitMode',
  'reader-select:escape': 'exitMode',
  'reader-insert:escape': 'exitMode',
  ...NOTE_LOCAL_DEFAULT_BINDINGS,
  'note-normal:i': 'enterInsert',
  'note-normal:escape': 'exitMode',
  'note-normal::': 'openCommandPalette',
  'note-normal: ff': 'mainFuzzyAll',
  'note-normal: fc': 'mainFuzzyCollection',
  'note-normal: ft': 'mainTabPick',
  'note-normal: fT': 'mainTagPicker',
  'note-normal: ta': 'mainTagEditor',
  'note-normal: td': 'mainClosePDF',
  'note-normal: fn': 'mainNotesLayout',
  'note-normal: e': 'mainFocusTree',
  'note-normal: yy': 'mainYankCitekey',
  'note-normal: o': 'mainOpenPDF',
  'note-normal: wh': 'mainFocusLeft',
  'note-normal: wl': 'mainFocusRight',
  'note-normal: ww': 'mainFocusItems',
  'note-normal:H': 'mainPrevTab',
  'note-normal:L': 'mainNextTab',
  'note-normal:ctrl+h': 'focusReaderSplitLeft',
  'note-normal:ctrl+j': 'focusReaderSplitDown',
  'note-normal:ctrl+k': 'focusReaderSplitUp',
  'note-normal:ctrl+l': 'focusReaderSplitRight',
  'note-insert:escape': 'exitMode',
  'note-insert:ctrl+h': 'focusReaderSplitLeft',
  'note-insert:ctrl+j': 'focusReaderSplitDown',
  'note-insert:ctrl+k': 'focusReaderSplitUp',
  'note-insert:ctrl+l': 'focusReaderSplitRight',
  'main-normal: ff': 'mainFuzzyAll',
  'main-normal::': 'openCommandPalette',
  'main-normal: fc': 'mainFuzzyCollection',
  'main-normal: ft': 'mainTabPick',
  'main-normal: fT': 'mainTagPicker',
  'main-normal: ta': 'mainTagEditor',
  'main-normal: td': 'mainClosePDF',
  'main-normal: fn': 'mainNotesLayout',
  'main-normal: e': 'mainFocusTree',
  'main-normal: yy': 'mainYankCitekey',
  'main-normal: o': 'mainOpenPDF',
  'main-normal: wh': 'mainFocusLeft',
  'main-normal: wl': 'mainFocusRight',
  'main-normal: ww': 'mainFocusItems',
  'main-normal:ctrl+h': 'focusReaderSplitLeft',
  'main-normal:ctrl+j': 'focusReaderSplitDown',
  'main-normal:ctrl+k': 'focusReaderSplitUp',
  'main-normal:ctrl+l': 'focusReaderSplitRight',
  'main-normal:dd': 'mainTrashItems',
  'main-normal:x': 'mainTrashItems',
  'main-normal:u': 'mainRestoreTrashedItems',
  'main-normal:h': 'mainTreeCollapse',
  'main-normal:l': 'mainTreeExpand',
  'main-normal:j': 'mainNavDown',
  'main-normal:k': 'mainNavUp',
  'main-normal:za': 'mainTreeToggle',
  'main-normal:zo': 'mainTreeOpenOnly',
  'main-normal:zc': 'mainTreeCloseOnly',
  'main-normal:R': 'mainTreeExpandAll',
  'main-normal:M': 'mainTreeCollapseAll',
  'main-normal:backspace': 'mainTreeParent',
  'main-normal:gg': 'mainNavFirst',
  'main-normal:G': 'mainNavLast',
  'main-normal:H': 'mainPrevTab',
  'main-normal:L': 'mainNextTab',
  'main-normal:enter': 'mainActivate',
  'main-normal:return': 'mainActivate',
  'main-normal:v': 'mainEnterSelect',
  'main-select:j': 'mainSelectDown',
  'main-select:k': 'mainSelectUp',
  'main-select:gg': 'mainSelectFirst',
  'main-select:G': 'mainSelectLast',
  'main-select:o': 'mainSelectSwapEnds',
  'main-select:v': 'mainSelectFinish',
  'main-select:escape': 'mainSelectCancel',
} as const satisfies BindingMap;

export interface ParsedBindingKey {
  mode: Mode;
  sequence: string;
}

export function parseBindingKey(value: string): ParsedBindingKey | null {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const mode = canonicalMode(value.slice(0, separator));
  const sequence = value.slice(separator + 1);
  if (!mode || !sequence) return null;
  return { mode, sequence };
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
    const binding = parseBindingKey(key);
    if (!binding || (action !== null && !isActionId(action))) continue;
    result[`${binding.mode}:${binding.sequence}`] = action;
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
  'reader-normal:s': 'flashText',
  'reader-normal:H': 'scrollLeft',
  'reader-normal:L': 'scrollRight',
  'reader-normal:J': 'mainPrevTab',
  'reader-normal:K': 'mainNextTab',
  'main-normal:J': 'mainPrevTab',
  'main-normal:K': 'mainNextTab',
  'reader-normal: fb': 'mainFuzzyCollection',
  'reader-normal: bj': 'mainTabPick',
  'reader-normal: o': 'mainOpenPDF',
  'reader-normal: q': 'mainClosePDF',
  'main-normal: fb': 'mainFuzzyCollection',
  'main-normal: bj': 'mainTabPick',
  'main-normal: q': 'mainClosePDF',
  'reader-normal: n': 'mainNotesLayout',
  'main-normal: n': 'mainNotesLayout',
  'reader-normal: tp': 'mainTabPick',
  'main-normal: tp': 'mainTabPick',
  'main-normal:ctrl+u': 'mainRestoreTrashedItems',
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
    const binding = parseBindingKey(key);
    if (!binding || REMOVED_ACTIONS[String(action)] || !isActionId(action)) continue;
    const canonicalKey = `${binding.mode}:${binding.sequence}`;
    if (RETIRED_DEFAULT_BINDINGS[canonicalKey as keyof typeof RETIRED_DEFAULT_BINDINGS] === action)
      continue;
    if (DEFAULT_BINDINGS[canonicalKey as keyof typeof DEFAULT_BINDINGS] !== action)
      overrides[canonicalKey] = action;
  }
  return stringifyBindingOverrides(overrides);
}

/** Canonicalizes schema-7 compact overrides while preserving explicit unbindings. */
export function migrateBindingModeOverrides(raw: unknown): string {
  return stringifyBindingOverrides(parseBindingOverrides(raw));
}

const NOTE_INHERITED_MAIN_SEQUENCES = new Set([
  ':',
  'H',
  'L',
  'ctrl+h',
  'ctrl+j',
  'ctrl+k',
  'ctrl+l',
]);

function noteInheritedMainSequence(sequence: string): boolean {
  return sequence.startsWith(' ') || NOTE_INHERITED_MAIN_SEQUENCES.has(sequence);
}

/** Copies schema-8 Note-global Main overrides into the new explicit Note scope. */
export function migrateNoteBindingOverrides(raw: unknown): string {
  const overrides = parseBindingOverrides(raw);
  for (const [key, action] of Object.entries({ ...overrides })) {
    const binding = parseBindingKey(key);
    if (binding?.mode !== 'main-normal' || !noteInheritedMainSequence(binding.sequence)) continue;
    if (action !== null && !isNoteCrossContextActionId(action)) continue;
    const noteKey = 'note-normal:' + binding.sequence;
    if (!(noteKey in overrides)) overrides[noteKey] = action;
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

/** Projects fallback modes into one active mode; active bindings win by sequence. */
export function bindingsForMode(
  bindings: BindingMap,
  mode: Mode,
  fallbacks: readonly Mode[] = [],
): BindingMap {
  const result: Record<string, ActionId> = {};
  for (const sourceMode of [...fallbacks].reverse()) {
    for (const [key, action] of Object.entries(bindings)) {
      const binding = parseBindingKey(key);
      if (binding?.mode === sourceMode) result[`${mode}:${binding.sequence}`] = action;
    }
  }
  for (const [key, action] of Object.entries(bindings)) {
    const binding = parseBindingKey(key);
    if (binding?.mode === mode) result[`${mode}:${binding.sequence}`] = action;
  }
  return Object.freeze(result);
}
