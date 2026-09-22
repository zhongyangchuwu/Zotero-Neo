import { isActionId, type ActionId } from './actions';
import { NOTE_LOCAL_DEFAULT_BINDINGS, isNoteCrossContextActionId } from './note-actions';
import {
  bindingSequenceTokens,
  canonicalBindingSequence,
  migrateLegacyKeySequence,
  serializeBindingTokens,
} from './key-sequence';

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
  'reader-normal:H': 'previousTab',
  'reader-normal:L': 'nextTab',
  'reader-normal:zh': 'scrollLeft',
  'reader-normal:zl': 'scrollRight',
  'reader-normal:h': 'prevPage',
  'reader-normal:l': 'nextPage',
  'reader-normal:gg': 'firstPage',
  'reader-normal:G': 'lastPage',
  'reader-normal:<C-d>': 'halfPageDown',
  'reader-normal:<C-u>': 'halfPageUp',
  'reader-normal:<C-f>': 'fullPageDown',
  'reader-normal:<C-b>': 'fullPageUp',
  'reader-normal:+': 'zoomIn',
  'reader-normal:-': 'zoomOut',
  'reader-normal:zI': 'zoomIn',
  'reader-normal:zO': 'zoomOut',
  'reader-normal:=': 'zoomReset',
  'reader-normal:z0': 'zoomReset',
  'reader-normal:<C-o>': 'historyBack',
  'reader-normal:<C-i>': 'historyForward',
  'reader-normal:f': 'followLink',
  'reader-normal:/': 'openSearch',
  'reader-normal::': 'openCommandPalette',
  'reader-normal:n': 'findNext',
  'reader-normal:N': 'findPrevious',
  'reader-normal:[': 'prevAnnotation',
  'reader-normal:]': 'nextAnnotation',
  'reader-normal:<Enter>': 'editAnnotation',
  'reader-normal:<Return>': 'editAnnotation',
  'reader-normal:dd': 'deleteAnnotation',
  'reader-normal:y': 'yankAnnotation',
  'reader-normal:Y': 'yankAnnotationComment',
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
  'reader-normal:<C-h>': 'focusReaderSplitLeft',
  'reader-normal:<C-j>': 'focusReaderSplitDown',
  'reader-normal:<C-k>': 'focusReaderSplitUp',
  'reader-normal:<C-l>': 'focusReaderSplitRight',
  'reader-normal:<Esc>': 'clearSearch',
  'reader-normal:<Space>e': 'toggleReaderSidebarOutline',
  'reader-normal:<Space>-': 'toggleReaderSplitHorizontal',
  'reader-normal:<Space>|': 'toggleReaderSplitVertical',
  'reader-normal:<Space>ff': 'findAllItems',
  'reader-normal:<Space>fc': 'findCollectionItems',
  'reader-normal:<Space>,': 'switchTab',
  'reader-normal:<Space>q': 'closeCurrentTab',
  'reader-normal:<Space>ta': 'addTag',
  'reader-normal:<Space>tr': 'removeTag',
  'reader-normal:<Space>ca': 'addToCollection',
  'reader-normal:<Space>cr': 'removeFromCollection',
  'reader-normal:<Space>fn': 'findNotes',
  'reader-normal:<Space>pp': 'managePlugins',
  'reader-normal:<Space>yy': 'mainYankCitekey',
  'reader-normal:<Space>m': 'toggleMarksExplorer',
  'reader-select:s': 'flashText',
  'reader-select:a': 'openSelectionActions',
  'reader-select:<Enter>': 'openSelectionActions',
  'reader-select:<Return>': 'openSelectionActions',
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
  'reader-select:#': 'searchSelection',
  'reader-select:o': 'swapVisualEnds',
  'reader-select:v': 'exitMode',
  'reader-select:<Esc>': 'exitMode',
  'reader-insert:<Esc>': 'exitMode',
  ...NOTE_LOCAL_DEFAULT_BINDINGS,
  'note-normal:i': 'enterInsert',
  'note-normal:<Esc>': 'exitMode',
  'note-normal::': 'openCommandPalette',
  'note-normal:<Space>ff': 'findAllItems',
  'note-normal:<Space>fc': 'findCollectionItems',
  'note-normal:<Space>,': 'switchTab',
  'note-normal:<Space>ta': 'addTag',
  'note-normal:<Space>tr': 'removeTag',
  'note-normal:<Space>q': 'closeCurrentTab',
  'note-normal:<Space>fn': 'findNotes',
  'note-normal:<Space>pp': 'managePlugins',
  'note-normal:<Space>e': 'mainFocusTree',
  'note-normal:<Space>yy': 'mainYankCitekey',
  'note-normal:<Space>o': 'mainOpenPDF',
  'note-normal:H': 'previousTab',
  'note-normal:L': 'nextTab',
  'note-normal:<C-h>': 'focusReaderSplitLeft',
  'note-normal:<C-j>': 'focusReaderSplitDown',
  'note-normal:<C-k>': 'focusReaderSplitUp',
  'note-normal:<C-l>': 'focusReaderSplitRight',
  'note-insert:<Esc>': 'exitMode',
  'note-insert:<C-h>': 'focusReaderSplitLeft',
  'note-insert:<C-j>': 'focusReaderSplitDown',
  'note-insert:<C-k>': 'focusReaderSplitUp',
  'note-insert:<C-l>': 'focusReaderSplitRight',
  'main-normal:ff': 'findAllItems',
  'main-normal:fq': 'mainQuickSearch',
  'main-normal:fa': 'mainAdvancedSearch',
  'main-normal:/': 'openSearch',
  'main-normal:n': 'findNext',
  'main-normal:N': 'findPrevious',
  'main-normal::': 'openCommandPalette',
  'main-normal:fc': 'findCollectionItems',
  'main-normal:,': 'switchTab',
  'main-normal:ta': 'addTag',
  'main-normal:tr': 'removeTag',
  'main-normal:ca': 'addToCollection',
  'main-normal:cr': 'removeFromCollection',
  'main-normal:tf': 'toggleTagFilter',
  'main-normal:tc': 'clearTagFilters',
  'main-normal:q': 'closeCurrentTab',
  'main-normal:fn': 'findNotes',
  'main-normal:pp': 'managePlugins',
  'main-normal:e': 'mainFocusTree',
  'main-normal:yy': 'mainYankCitekey',
  'main-normal:o': 'mainOpenPDF',
  'main-normal:wh': 'mainFocusLeft',
  'main-normal:wl': 'mainFocusRight',
  'main-normal:ww': 'mainFocusItems',
  'main-normal:<C-h>': 'focusReaderSplitLeft',
  'main-normal:<C-j>': 'focusReaderSplitDown',
  'main-normal:<C-k>': 'focusReaderSplitUp',
  'main-normal:<C-l>': 'focusReaderSplitRight',
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
  'main-normal:<BS>': 'mainTreeParent',
  'main-normal:gg': 'mainNavFirst',
  'main-normal:gr': 'mainReturnContext',
  'main-normal:G': 'mainNavLast',
  'main-normal:H': 'previousTab',
  'main-normal:L': 'nextTab',
  'main-normal:<Enter>': 'mainActivate',
  'main-normal:<Return>': 'mainActivate',
  'main-normal:<Space>': 'mainToggleSelection',
  'main-normal:v': 'mainEnterSelect',
  'main-select:<Space>': 'mainSelectFinish',
  'main-select:j': 'mainSelectDown',
  'main-select:k': 'mainSelectUp',
  'main-select:gg': 'mainSelectFirst',
  'main-select:G': 'mainSelectLast',
  'main-select:o': 'mainSelectSwapEnds',
  'main-select:v': 'mainSelectCancel',
  'main-select:<Esc>': 'mainSelectCancel',
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
  if (!mode || !sequence || canonicalBindingSequence(sequence) === null) return null;
  return { mode, sequence };
}

export type BindingOverride = ActionId | null;
export type BindingOverrides = Readonly<Record<string, BindingOverride>>;

const LEGACY_ACTION_ALIASES: Readonly<Record<string, ActionId>> = {
  mainFuzzyAll: 'findAllItems',
  mainFuzzyCollection: 'findCollectionItems',
  mainNotesLayout: 'findNotes',
  mainTabPick: 'switchTab',
  mainClosePDF: 'closeCurrentTab',
  mainPrevTab: 'previousTab',
  mainNextTab: 'nextTab',
  mainTagEditor: 'addTag',
  mainTagPicker: 'toggleTagFilter',
};

function canonicalAction(value: unknown): ActionId | null {
  if (isActionId(value)) return value;
  return typeof value === 'string' ? (LEGACY_ACTION_ALIASES[value] ?? null) : null;
}

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
    const normalized = action === null ? null : canonicalAction(action);
    const sequence = binding ? canonicalBindingSequence(binding.sequence) : null;
    if (!binding || !sequence || (action !== null && !normalized)) continue;
    result[`${binding.mode}:${sequence}`] = normalized;
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
  'reader-normal:yy': 'yankAnnotationComment',
  'reader-select:yy': 'yankParagraph',
  'reader-normal:H': 'scrollLeft',
  'reader-normal:L': 'scrollRight',
  'reader-normal:J': 'previousTab',
  'reader-normal:K': 'nextTab',
  'main-normal:J': 'previousTab',
  'main-normal:K': 'nextTab',
  'reader-normal: fb': 'findCollectionItems',
  'reader-normal: bj': 'switchTab',
  'reader-normal: o': 'mainOpenPDF',
  'reader-normal: q': 'closeCurrentTab',
  'main-normal: fb': 'findCollectionItems',
  'main-normal: bj': 'switchTab',
  'main-normal: q': 'closeCurrentTab',
  'reader-normal: n': 'findNotes',
  'main-normal: n': 'findNotes',
  'reader-normal: tp': 'switchTab',
  'main-normal: tp': 'switchTab',
  'reader-normal: ft': 'switchTab',
  'note-normal: ft': 'switchTab',
  'main-normal: ft': 'switchTab',
  'reader-normal: td': 'closeCurrentTab',
  'note-normal: td': 'closeCurrentTab',
  'main-normal: td': 'closeCurrentTab',
  'note-normal: fT': 'toggleTagFilter',
  'main-normal: fT': 'toggleTagFilter',
  'main-normal:ctrl+u': 'mainRestoreTrashedItems',
} as const;

const REMOVED_ACTIONS: Readonly<Record<string, true>> = {
  mainFocusSearch: true,
  mainAdvancedSearch: true,
  yankParagraph: true,
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
    const normalized = canonicalAction(action);
    if (!binding || REMOVED_ACTIONS[String(action)] || !normalized) continue;
    const canonicalKey = `${binding.mode}:${binding.sequence}`;
    if (
      RETIRED_DEFAULT_BINDINGS[canonicalKey as keyof typeof RETIRED_DEFAULT_BINDINGS] === normalized
    )
      continue;

    const migratedSequence = migrateLegacyKeySequence(binding.sequence);
    const currentKey = migratedSequence ? `${binding.mode}:${migratedSequence}` : canonicalKey;
    if (DEFAULT_BINDINGS[currentKey as keyof typeof DEFAULT_BINDINGS] !== normalized)
      overrides[canonicalKey] = normalized;
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
  '<C-h>',
  '<C-j>',
  '<C-k>',
  '<C-l>',
]);

function noteInheritedMainSequence(sequence: string): boolean {
  return (
    bindingSequenceTokens(sequence)?.[0] === ' ' || NOTE_INHERITED_MAIN_SEQUENCES.has(sequence)
  );
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

/**
 * Migrates the 0.1.0 Reader yank-key freeze without losing explicit unbindings.
 *
 * Schema 9 stored compact overrides, so the old default yy binding itself is normally absent.
 * A persisted null at reader-normal:yy therefore means the user explicitly unbound the old
 * comment-yank default and must follow that action to its new Y default. Custom yy actions remain
 * untouched. Select yy no longer has a default, so its obsolete null can simply be dropped.
 */
export function migrateFrozenKeymapOverrides(raw: unknown): string {
  const overrides = parseBindingOverrides(raw);
  const oldCommentYank = 'reader-normal:yy';
  const newCommentYank = 'reader-normal:Y';
  if (overrides[oldCommentYank] === null) {
    delete overrides[oldCommentYank];
    if (!(newCommentYank in overrides)) overrides[newCommentYank] = null;
  }
  if (overrides['reader-select:yy'] === null) delete overrides['reader-select:yy'];
  return stringifyBindingOverrides(overrides);
}

/**
 * Migrates the final 0.1.0 semantic leader re-freeze.
 *
 * Schema 10 compact overrides may contain null tombstones for defaults that moved. Carry those
 * explicit unbindings to the new semantic key instead of silently re-enabling the action.
 * The old Note tag-filter action is intentionally dropped because Main view filtering is no longer
 * a Note capability.
 */
export function migrateSemanticKeymapOverrides(raw: unknown): string {
  const overrides = parseBindingOverrides(raw);
  const moveNull = (oldKey: string, newKey: string): void => {
    if (overrides[oldKey] !== null) return;
    delete overrides[oldKey];
    if (!(newKey in overrides)) overrides[newKey] = null;
  };

  moveNull('reader-normal:<Space>ft', 'reader-normal:<Space>,');
  moveNull('note-normal:<Space>ft', 'note-normal:<Space>,');
  moveNull('main-normal:<Space>ft', 'main-normal:<Space>,');
  moveNull('reader-normal:<Space>td', 'reader-normal:<Space>q');
  moveNull('note-normal:<Space>td', 'note-normal:<Space>q');
  moveNull('main-normal:<Space>td', 'main-normal:<Space>q');
  moveNull('main-normal:<Space>fT', 'main-normal:<Space>tf');

  if (overrides['note-normal:<Space>fT'] === null) delete overrides['note-normal:<Space>fT'];
  for (const [key, action] of Object.entries({ ...overrides })) {
    const binding = parseBindingKey(key);
    if (binding?.mode === 'note-normal' && action === 'toggleTagFilter') delete overrides[key];
  }

  return stringifyBindingOverrides(overrides);
}

/**
 * Migrates Main semantic defaults away from the Space leader for v0.2.
 *
 * Compact overrides normally omit defaults. Explicit null tombstones must follow
 * a moved default so an intentionally disabled command is not silently
 * re-enabled at its new direct prefix. Custom old Space-prefixed bindings are
 * preserved as custom bindings.
 */
export function migrateMainDirectPrefixOverrides(raw: unknown): string {
  const overrides = parseBindingOverrides(raw);
  const moveNull = (oldKey: string, newKey: string): void => {
    if (overrides[oldKey] !== null) return;
    delete overrides[oldKey];
    if (!(newKey in overrides)) overrides[newKey] = null;
  };

  for (const [oldKey, newKey] of [
    ['main-normal:<Space>ff', 'main-normal:ff'],
    ['main-normal:<Space>fc', 'main-normal:fc'],
    ['main-normal:<Space>,', 'main-normal:,'],
    ['main-normal:<Space>ta', 'main-normal:ta'],
    ['main-normal:<Space>tr', 'main-normal:tr'],
    ['main-normal:<Space>tf', 'main-normal:tf'],
    ['main-normal:<Space>tc', 'main-normal:tc'],
    ['main-normal:<Space>q', 'main-normal:q'],
    ['main-normal:<Space>fn', 'main-normal:fn'],
    ['main-normal:<Space>pp', 'main-normal:pp'],
    ['main-normal:<Space>e', 'main-normal:e'],
    ['main-normal:<Space>yy', 'main-normal:yy'],
    ['main-normal:<Space>o', 'main-normal:o'],
    ['main-normal:<Space>wh', 'main-normal:wh'],
    ['main-normal:<Space>wl', 'main-normal:wl'],
    ['main-normal:<Space>ww', 'main-normal:ww'],
  ] as const) {
    moveNull(oldKey, newKey);
  }

  return stringifyBindingOverrides(overrides);
}

/**
 * Releases Main Space completely for the v0.2 Selection toggle.
 *
 * Schema 13 may still contain custom Main <Space>... overrides preserved by the
 * direct-prefix migration. Move them to the equivalent direct sequence so the
 * exact <Space> selection action never acquires an 800 ms exact/prefix delay.
 * If an explicit direct override already exists, it wins and the stale
 * Space-prefixed override is dropped.
 */
export function migrateMainSpaceSelectionOverrides(raw: unknown): string {
  const overrides = parseBindingOverrides(raw);

  for (const [key, action] of Object.entries({ ...overrides })) {
    const binding = parseBindingKey(key);
    if (binding?.mode !== 'main-normal') continue;

    const tokens = bindingSequenceTokens(binding.sequence);
    if (!tokens || tokens[0] !== ' ') continue;

    // Main's exact Space is a new reserved semantic key in schema 14. Any
    // historical exact override (including an explicit unbinding) must not
    // shadow the Selection toggle after upgrade.
    if (tokens.length === 1) {
      delete overrides[key];
      continue;
    }

    const directSequence = serializeBindingTokens(tokens.slice(1));
    if (!directSequence) continue;
    const directKey = `main-normal:${directSequence}`;

    delete overrides[key];
    if (!(directKey in overrides)) overrides[directKey] = action;
  }

  return stringifyBindingOverrides(overrides);
}

/** Canonicalizes token boundaries so persisted multi-key sequences are unambiguous. */
export function migrateKeySequenceOverrides(raw: unknown): string {
  const overrides: Record<string, BindingOverride> = {};
  for (const [key, action] of parseBindingEntries(raw)) {
    const separator = key.indexOf(':');
    if (separator < 1) continue;
    const mode = canonicalMode(key.slice(0, separator));
    const sequence = migrateLegacyKeySequence(key.slice(separator + 1));
    const normalized = action === null ? null : canonicalAction(action);
    if (!mode || !sequence || (action !== null && !normalized)) continue;
    overrides[`${mode}:${sequence}`] = normalized;
  }
  return stringifyBindingOverrides(overrides);
}

export function encodeBindingOverrides(bindings: BindingMap): string {
  const canonical: Record<string, ActionId> = {};
  for (const [key, action] of Object.entries(bindings)) {
    const binding = parseBindingKey(key);
    const sequence = binding ? canonicalBindingSequence(binding.sequence) : null;
    if (!binding || !sequence) continue;
    canonical[`${binding.mode}:${sequence}`] = action;
  }

  const overrides: Record<string, BindingOverride> = {};
  const keys = new Set([...Object.keys(DEFAULT_BINDINGS), ...Object.keys(canonical)]);
  for (const key of keys) {
    const action = canonical[key];
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
      const sequence = binding ? canonicalBindingSequence(binding.sequence) : null;
      if (binding?.mode === sourceMode && sequence) result[`${mode}:${sequence}`] = action;
    }
  }
  for (const [key, action] of Object.entries(bindings)) {
    const binding = parseBindingKey(key);
    const sequence = binding ? canonicalBindingSequence(binding.sequence) : null;
    if (binding?.mode === mode && sequence) result[`${mode}:${sequence}`] = action;
  }
  return Object.freeze(result);
}
