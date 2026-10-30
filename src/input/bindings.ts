import { isActionId, type ActionId } from './actions';
import { isNoteMigratableMainBindingAction, NOTE_LOCAL_DEFAULT_BINDINGS } from './note-actions';
import {
  bindingSequenceTokens,
  canonicalBindingSequence,
  migrateLegacyKeySequence,
  serializeBindingTokens,
} from './key-sequence';

export const BINDING_CONTEXTS = [
  'reader-normal',
  'reader-select',
  'main-normal',
  'main-select',
  'note-normal',
  'note-insert',
  'reader-outline',
  'reader-marks',
  'reader-annotations',
  'reader-thumbnails',
  'picker-input',
  'picker-list',
  'plugins-input',
  'plugins-list',
] as const;

export type BindingContext = (typeof BINDING_CONTEXTS)[number];
export type BindingKey = `${BindingContext}:${string}`;
export type BindingMap = Readonly<Record<string, ActionId>>;

/** An executable binding occupies a complete sequence, never a namespace. */
export interface ActionBinding {
  readonly kind: 'action';
  readonly action: ActionId;
}

/** A named, non-executing namespace for longer sequences in the same mode. */
export interface PrefixBinding {
  readonly kind: 'prefix';
  readonly label: Readonly<{ en: string; 'zh-CN': string }>;
}

export type Binding = ActionBinding | PrefixBinding;
export type BindingNodes = Readonly<Record<string, Binding>>;

const LEGACY_MODE_ALIASES: Readonly<Record<string, BindingContext>> = {
  normal: 'reader-normal',
  visual: 'reader-select',
  main: 'main-normal',
};

function canonicalMode(value: string): BindingContext | null {
  if ((BINDING_CONTEXTS as readonly string[]).includes(value)) return value as BindingContext;
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
  'reader-normal:<C-o>': 'navigateBack',
  'reader-normal:<C-i>': 'navigateForward',
  'reader-normal:f': 'followLink',
  'reader-normal:/': 'openSearch',
  'reader-normal::': 'openCommandPalette',
  'reader-normal:n': 'findNext',
  'reader-normal:N': 'findPrevious',
  'reader-normal:[s': 'prevHeading',
  'reader-normal:]s': 'nextHeading',
  'reader-normal:[f': 'prevFigure',
  'reader-normal:]f': 'nextFigure',
  'reader-normal:[t': 'prevTable',
  'reader-normal:]t': 'nextTable',
  'reader-normal:[a': 'prevAnnotation',
  'reader-normal:]a': 'nextAnnotation',
  'reader-normal:[m': 'prevBookmark',
  'reader-normal:]m': 'nextBookmark',
  'reader-normal:<Enter>': 'editAnnotation',
  'reader-normal:<Return>': 'editAnnotation',
  'reader-normal:dd': 'deleteAnnotation',
  'reader-normal:y': 'copyTarget',
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
  'reader-normal:<Space>ro': 'focusReaderOutline',
  'reader-normal:<Space>rm': 'focusReaderMarks',
  'reader-normal:<Space>ra': 'focusReaderAnnotations',
  'reader-normal:<Space>rt': 'focusReaderThumbnails',
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
  'reader-normal:<Space>ps': 'openNeoSettings',
  'reader-normal:<Space>yy': 'mainYankCitekey',
  'reader-normal:<Space>ai': 'mainAddByIdentifier',
  'reader-select:s': 'flashText',
  'reader-select:a': 'openSelectionActions',
  'reader-select:<Enter>': 'openSelectionActions',
  'reader-select:<Return>': 'openSelectionActions',
  'reader-select:j': 'extendTokenDown',
  'reader-select:k': 'extendTokenUp',
  'reader-select:h': 'extendTokenBackward',
  'reader-select:l': 'extendTokenForward',
  'reader-select:H': 'extendLeft',
  'reader-select:L': 'extendRight',
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
  ...NOTE_LOCAL_DEFAULT_BINDINGS,
  'note-normal:<C-o>': 'navigateBack',
  'note-normal:<C-i>': 'navigateForward',
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
  'note-normal:<Space>ps': 'openNeoSettings',
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
  'main-normal:<C-o>': 'navigateBack',
  'main-normal:<C-i>': 'navigateForward',
  'main-normal:<Space>ff': 'findAllItems',
  'main-normal:<Space>fq': 'mainQuickSearch',
  'main-normal:<Space>fa': 'mainAdvancedSearch',
  'main-normal:/': 'openSearch',
  'main-normal:n': 'findNext',
  'main-normal:N': 'findPrevious',
  'main-normal::': 'openCommandPalette',
  'main-normal:<Space>fc': 'findCollectionItems',
  'main-normal:<Space>,': 'switchTab',
  'main-normal:<Space>ta': 'addTag',
  'main-normal:<Space>tr': 'removeTag',
  'main-normal:<Space>ca': 'addToCollection',
  'main-normal:<Space>cr': 'removeFromCollection',
  'main-normal:<Space>tf': 'toggleTagFilter',
  'main-normal:<Space>tc': 'clearTagFilters',
  'main-normal:<Space>q': 'closeCurrentTab',
  'main-normal:<Space>fn': 'findNotes',
  'main-normal:<Space>pp': 'managePlugins',
  'main-normal:<Space>ps': 'openNeoSettings',
  'main-normal:<Space>ss': 'manageSelection',
  'main-normal:<Space>sc': 'mainClearSelection',
  'main-normal:e': 'mainFocusTree',
  'main-normal:<Space>yy': 'mainYankCitekey',
  'main-normal:<Space>ai': 'mainAddByIdentifier',
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
  'main-normal:G': 'mainNavLast',
  'main-normal:H': 'previousTab',
  'main-normal:L': 'nextTab',
  'main-normal:<Enter>': 'mainActivate',
  'main-normal:<Return>': 'mainActivate',
  'main-normal:s': 'mainToggleSelection',
  'main-normal:<Esc>': 'mainCancelTarget',
  'main-normal:v': 'mainEnterSelect',
  'main-select:s': 'mainSelectFinish',
  'main-select:j': 'mainSelectDown',
  'main-select:k': 'mainSelectUp',
  'main-select:gg': 'mainSelectFirst',
  'main-select:G': 'mainSelectLast',
  'main-select:o': 'mainSelectSwapEnds',
  'main-select:v': 'mainSelectCancel',
  'main-select:<Esc>': 'mainSelectCancel',
  'reader-outline:[s': 'prevHeading',
  'reader-outline:]s': 'nextHeading',
  'reader-marks:[s': 'prevHeading',
  'reader-marks:]s': 'nextHeading',
  'reader-annotations:[s': 'prevHeading',
  'reader-annotations:]s': 'nextHeading',
  'reader-thumbnails:[s': 'prevHeading',
  'reader-thumbnails:]s': 'nextHeading',
  'reader-outline:<Space>ro': 'focusReaderOutline',
  'reader-outline:<Space>rm': 'focusReaderMarks',
  'reader-outline:<Space>ra': 'focusReaderAnnotations',
  'reader-outline:<Space>rt': 'focusReaderThumbnails',
  'reader-marks:<Space>ro': 'focusReaderOutline',
  'reader-marks:<Space>rm': 'focusReaderMarks',
  'reader-marks:<Space>ra': 'focusReaderAnnotations',
  'reader-marks:<Space>rt': 'focusReaderThumbnails',
  'reader-annotations:<Space>ro': 'focusReaderOutline',
  'reader-annotations:<Space>rm': 'focusReaderMarks',
  'reader-annotations:<Space>ra': 'focusReaderAnnotations',
  'reader-annotations:<Space>rt': 'focusReaderThumbnails',
  'reader-thumbnails:<Space>ro': 'focusReaderOutline',
  'reader-thumbnails:<Space>rm': 'focusReaderMarks',
  'reader-thumbnails:<Space>ra': 'focusReaderAnnotations',
  'reader-thumbnails:<Space>rt': 'focusReaderThumbnails',
  'reader-outline:j': 'uiNext',
  'reader-outline:k': 'uiPrevious',
  'reader-outline:h': 'uiParent',
  'reader-outline:l': 'uiChild',
  'reader-outline:<Esc>': 'uiCancel',
  'reader-marks:j': 'uiNext',
  'reader-marks:k': 'uiPrevious',
  'reader-marks:gg': 'uiFirst',
  'reader-marks:G': 'uiLast',
  'reader-marks:<Enter>': 'uiConfirm',
  'reader-marks:<Esc>': 'uiCancel',
  'reader-marks:d': 'uiDelete',
  'reader-marks:x': 'uiClear',
  'reader-annotations:j': 'uiNext',
  'reader-annotations:k': 'uiPrevious',
  'reader-annotations:<Esc>': 'uiCancel',
  'reader-thumbnails:j': 'uiNext',
  'reader-thumbnails:k': 'uiPrevious',
  'reader-thumbnails:<Esc>': 'uiCancel',
  'picker-input:<C-j>': 'uiNext',
  'picker-input:<C-n>': 'uiNext',
  'picker-input:<Down>': 'uiNext',
  'picker-input:<C-k>': 'uiPrevious',
  'picker-input:<C-p>': 'uiPrevious',
  'picker-input:<Up>': 'uiPrevious',
  'picker-input:<C-d>': 'uiPreviewDown',
  'picker-input:<C-u>': 'uiPreviewUp',
  'picker-input:<Enter>': 'uiConfirm',
  'picker-input:<S-Enter>': 'uiConfirm',
  'picker-input:<Esc>': 'uiCancel',
  'picker-list:<C-j>': 'uiNext',
  'picker-list:<C-n>': 'uiNext',
  'picker-list:<Down>': 'uiNext',
  'picker-list:<C-k>': 'uiPrevious',
  'picker-list:<C-p>': 'uiPrevious',
  'picker-list:<Up>': 'uiPrevious',
  'picker-list:<C-d>': 'uiPreviewDown',
  'picker-list:<C-u>': 'uiPreviewUp',
  'picker-list:<Enter>': 'uiConfirm',
  'picker-list:<S-Enter>': 'uiConfirm',
  'picker-list:<Esc>': 'uiCancel',
  'picker-list:j': 'uiNext',
  'picker-list:k': 'uiPrevious',
  'picker-list:/': 'uiSearch',
  'plugins-input:<Esc>': 'uiFocusList',
  'plugins-list:<Esc>': 'uiCancel',
  'plugins-list:q': 'uiCancel',
  'plugins-list:/': 'uiSearch',
  'plugins-list:j': 'uiNext',
  'plugins-list:<Down>': 'uiNext',
  'plugins-list:k': 'uiPrevious',
  'plugins-list:<Up>': 'uiPrevious',
  'plugins-list:gg': 'uiFirst',
  'plugins-list:<Home>': 'uiFirst',
  'plugins-list:G': 'uiLast',
  'plugins-list:<End>': 'uiLast',
  'plugins-list:<C-d>': 'uiPageDown',
  'plugins-list:<C-u>': 'uiPageUp',
  'plugins-list:r': 'pluginsRefresh',
  'plugins-list:e': 'pluginsEnable',
  'plugins-list:d': 'pluginsDisable',
  'plugins-list:p': 'pluginsPreferences',
  'plugins-list:o': 'pluginsHomepage',
  'plugins-list:R': 'pluginsReadme',
  'plugins-list:L': 'pluginsGitLog',
} as const satisfies BindingMap;

const PREFIX_LABELS = {
  commands: { en: 'Commands', 'zh-CN': '命令' },
  add: { en: 'Add', 'zh-CN': '添加' },
  navigation: { en: 'Navigation', 'zh-CN': '导航' },
  view: { en: 'View', 'zh-CN': '视图' },
  filters: { en: 'Filters', 'zh-CN': '筛选' },
  delete: { en: 'Delete', 'zh-CN': '删除' },
  yank: { en: 'Yank', 'zh-CN': '复制' },
  change: { en: 'Change', 'zh-CN': '修改' },
  inner: { en: 'Inner', 'zh-CN': '内部' },
  tags: { en: 'Tags', 'zh-CN': '标签' },
  collections: { en: 'Collections', 'zh-CN': '分类' },
  find: { en: 'Find', 'zh-CN': '查找' },
  panes: { en: 'Panes', 'zh-CN': '窗格' },
  citations: { en: 'Citations', 'zh-CN': '引用' },
  neo: { en: 'Neo', 'zh-CN': 'Neo' },
  selection: { en: 'Selection', 'zh-CN': '选择' },
  reader: { en: 'Reader panels', 'zh-CN': '阅读器面板' },
  previous: { en: 'Previous target', 'zh-CN': '上一个目标' },
  next: { en: 'Next target', 'zh-CN': '下一个目标' },
} as const;

function prefix(label: keyof typeof PREFIX_LABELS): PrefixBinding {
  return { kind: 'prefix', label: PREFIX_LABELS[label] };
}

/** Explicit, non-executing namespaces; keys include their owning mode. */
export const DEFAULT_PREFIX_BINDINGS = {
  'reader-normal:g': prefix('navigation'),
  'reader-normal:d': prefix('delete'),
  'reader-normal:z': prefix('view'),
  'reader-normal:Z': prefix('filters'),
  'reader-normal:[': prefix('previous'),
  'reader-normal:]': prefix('next'),
  'reader-normal:<Space>': prefix('commands'),
  'reader-normal:<Space>a': prefix('add'),
  'reader-normal:<Space>f': prefix('find'),
  'reader-normal:<Space>t': prefix('tags'),
  'reader-normal:<Space>c': prefix('collections'),
  'reader-normal:<Space>p': prefix('neo'),
  'reader-normal:<Space>y': prefix('citations'),
  'reader-normal:<Space>r': prefix('reader'),
  'reader-select:z': prefix('view'),
  'main-normal:g': prefix('navigation'),
  'main-normal:d': prefix('delete'),
  'main-normal:z': prefix('view'),
  'main-normal:w': prefix('panes'),
  'main-normal:<Space>': prefix('commands'),
  'main-normal:<Space>a': prefix('add'),
  'main-normal:<Space>f': prefix('find'),
  'main-normal:<Space>t': prefix('tags'),
  'main-normal:<Space>c': prefix('collections'),
  'main-normal:<Space>p': prefix('neo'),
  'main-normal:<Space>s': prefix('selection'),
  'main-normal:<Space>y': prefix('citations'),
  'main-select:g': prefix('navigation'),
  'note-normal:g': prefix('navigation'),
  'note-normal:d': prefix('delete'),
  'note-normal:di': prefix('inner'),
  'note-normal:y': prefix('yank'),
  'note-normal:yi': prefix('inner'),
  'note-normal:c': prefix('change'),
  'note-normal:ci': prefix('inner'),
  'note-normal:<Space>': prefix('commands'),
  'note-normal:<Space>f': prefix('find'),
  'note-normal:<Space>t': prefix('tags'),
  'note-normal:<Space>p': prefix('neo'),
  'note-normal:<Space>y': prefix('citations'),
  'reader-marks:g': prefix('navigation'),
  'plugins-list:g': prefix('navigation'),
  'reader-outline:[': prefix('previous'),
  'reader-outline:]': prefix('next'),
  'reader-marks:[': prefix('previous'),
  'reader-marks:]': prefix('next'),
  'reader-annotations:[': prefix('previous'),
  'reader-annotations:]': prefix('next'),
  'reader-thumbnails:[': prefix('previous'),
  'reader-thumbnails:]': prefix('next'),
  'reader-outline:<Space>': prefix('commands'),
  'reader-outline:<Space>r': prefix('reader'),
  'reader-marks:<Space>': prefix('commands'),
  'reader-marks:<Space>r': prefix('reader'),
  'reader-annotations:<Space>': prefix('commands'),
  'reader-annotations:<Space>r': prefix('reader'),
  'reader-thumbnails:<Space>': prefix('commands'),
  'reader-thumbnails:<Space>r': prefix('reader'),
} as const satisfies Readonly<Record<BindingKey, PrefixBinding>>;

/**
 * Projects the legacy action-only map into explicit nodes without changing
 * preference serialization or dispatch. Ambiguous action prefixes cannot be
 * represented as action leaves; Guide prefers the namespace in that case while
 * the legacy matcher retains its exact-action timeout.
 */
export function bindingNodesFromActions(
  bindings: BindingMap,
  collision: 'reject' | 'prefer-prefix' = 'reject',
): BindingNodes {
  const nodes: Record<string, Binding> = {};
  const strictPrefixes = new Set<string>();
  for (const [key, action] of Object.entries(bindings)) {
    const parsed = parseBindingKey(key);
    if (!parsed) continue;
    const tokens = bindingSequenceTokens(parsed.sequence);
    if (!tokens) continue;
    for (let length = 1; length < tokens.length; length += 1) {
      strictPrefixes.add(`${parsed.mode}:${serializeBindingTokens(tokens.slice(0, length))}`);
    }
    nodes[key] = { kind: 'action', action };
  }

  if (collision === 'reject') {
    for (const key of Object.keys(nodes)) {
      if (strictPrefixes.has(key)) throw new Error(`Action binding cannot be a prefix: ${key}`);
    }
  }
  for (const key of strictPrefixes) {
    const builtIn = DEFAULT_PREFIX_BINDINGS[key as keyof typeof DEFAULT_PREFIX_BINDINGS];
    if (builtIn) {
      nodes[key] = builtIn;
    } else {
      const sequence = key.slice(key.indexOf(':') + 1);
      nodes[key] = {
        kind: 'prefix',
        label: { en: `Prefix ${sequence}`, 'zh-CN': `前缀 ${sequence}` },
      };
    }
  }
  return Object.freeze(nodes);
}

export interface ParsedBindingKey {
  mode: BindingContext;
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
  mainReturnContext: 'navigateBack',
  historyBack: 'navigateBack',
  historyForward: 'navigateForward',
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
  'reader-select:h': 'extendLeft',
  'reader-select:l': 'extendRight',
  'reader-select:j': 'extendDown',
  'reader-select:k': 'extendUp',
  'reader-normal:gr': 'mainReturnContext',
  'main-normal:gr': 'mainReturnContext',
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

/** Preserve explicit old character-motion unbindings when adding their H/L fallback defaults. */
export function migrateTokenSelectionOverrides(raw: string): string {
  let overrides: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return raw;
    overrides = parsed as Record<string, unknown>;
  } catch {
    return raw;
  }
  const canonical = new Map(
    Object.entries(overrides).map(([key, value]) => {
      const binding = parseBindingKey(key);
      const sequence = binding && canonicalBindingSequence(binding.sequence);
      return [binding && sequence ? `${binding.mode}:${sequence}` : key, value];
    }),
  );
  let changed = false;
  for (const key of ['h', 'l']) {
    const fallback = `reader-select:${key.toUpperCase()}`;
    if (canonical.get(`reader-select:${key}`) === null && !canonical.has(fallback)) {
      overrides[fallback] = null;
      changed = true;
    }
  }
  return changed ? JSON.stringify(overrides) : raw;
}

/** Converts the legacy full binding table into compact overrides without inferring deletions. */
export function migrateLegacyBindingOverrides(raw: unknown): string {
  const overrides: Record<string, ActionId> = {};
  for (const [key, action] of parseBindingEntries(raw)) {
    const binding = parseBindingKey(key);
    const normalized = canonicalAction(action);
    if (!binding || REMOVED_ACTIONS[String(action)] || !normalized) continue;
    const canonicalKey = `${binding.mode}:${binding.sequence}`;
    const retiredDefault =
      RETIRED_DEFAULT_BINDINGS[canonicalKey as keyof typeof RETIRED_DEFAULT_BINDINGS];
    if (
      retiredDefault === normalized ||
      (action === 'mainReturnContext' && retiredDefault === action)
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
    if (action !== null && !isNoteMigratableMainBindingAction(action)) continue;
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

/**
 * Restores one Space-led command namespace across Main/Reader/Note.
 *
 * Schema 14 used exact Main Space for Selection and direct Main semantic
 * prefixes. Schema 15 moves Selection/Visual commit to s and moves only
 * explicit default tombstones back to the Space-led defaults. Deliberate custom
 * direct bindings remain direct custom bindings.
 */
export function migrateUnifiedSpaceLeaderOverrides(raw: unknown): string {
  const overrides = parseBindingOverrides(raw);
  const move = (oldKey: string, newKey: string, onlyNull = false): void => {
    if (!(oldKey in overrides)) return;
    const action = overrides[oldKey];
    if (onlyNull && action !== null) return;
    delete overrides[oldKey];
    if (!(newKey in overrides)) overrides[newKey] = action;
  };

  for (const [oldKey, newKey] of [
    ['main-normal:ff', 'main-normal:<Space>ff'],
    ['main-normal:fq', 'main-normal:<Space>fq'],
    ['main-normal:fa', 'main-normal:<Space>fa'],
    ['main-normal:fc', 'main-normal:<Space>fc'],
    ['main-normal:,', 'main-normal:<Space>,'],
    ['main-normal:ta', 'main-normal:<Space>ta'],
    ['main-normal:tr', 'main-normal:<Space>tr'],
    ['main-normal:ca', 'main-normal:<Space>ca'],
    ['main-normal:cr', 'main-normal:<Space>cr'],
    ['main-normal:tf', 'main-normal:<Space>tf'],
    ['main-normal:tc', 'main-normal:<Space>tc'],
    ['main-normal:q', 'main-normal:<Space>q'],
    ['main-normal:fn', 'main-normal:<Space>fn'],
    ['main-normal:pp', 'main-normal:<Space>pp'],
    ['main-normal:yy', 'main-normal:<Space>yy'],
  ] as const) {
    move(oldKey, newKey, true);
  }

  // Exact Space used to be the reserved persistent-set operation, so any
  // explicit override belongs with that semantic slot rather than with the new
  // leader root.
  move('main-normal:<Space>', 'main-normal:s');
  move('main-select:<Space>', 'main-select:s');

  return stringifyBindingOverrides(overrides);
}

/** Preserves schema-15 custom dispatch timing around new Main Selection commands. */
export function migrateMainSelectionCommandOverrides(raw: unknown): string {
  const overrides = parseBindingOverrides(raw);
  const newDefaults = ['main-normal:<Space>ss', 'main-normal:<Space>sc'] as const;
  const strictPrefix = (left: readonly string[], right: readonly string[]): boolean =>
    left.length < right.length && left.every((token, index) => token === right[index]);

  for (const defaultKey of newDefaults) {
    if (defaultKey in overrides) continue;
    const defaultBinding = parseBindingKey(defaultKey);
    const defaultTokens = defaultBinding ? bindingSequenceTokens(defaultBinding.sequence) : null;
    if (!defaultBinding || !defaultTokens) continue;

    const conflicts = Object.entries(overrides).some(([key, action]) => {
      if (action === null) return false;
      const binding = parseBindingKey(key);
      const tokens = binding ? bindingSequenceTokens(binding.sequence) : null;
      if (binding?.mode !== defaultBinding.mode || !tokens) return false;
      return strictPrefix(tokens, defaultTokens) || strictPrefix(defaultTokens, tokens);
    });
    if (conflicts) overrides[defaultKey] = null;
  }

  return stringifyBindingOverrides(overrides);
}

/** Deletes inactive Reader Insert overrides, including explicit unbindings. */
export function migrateRetiredReaderInsertOverrides(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const entries = parseBindingEntries(raw);
  const retained = entries.filter(
    ([key]) => !key.startsWith('reader-insert:') && !key.startsWith('insert:'),
  );
  if (retained.length === entries.length) return raw;
  return retained.length ? JSON.stringify(Object.fromEntries(retained)) : '';
}

const RETIRED_SHORTCUT_ACTIONS = new Map<string, ActionId>([
  ['copyIdentifier', 'copyTarget'],
  ['followIdentifier', 'followLink'],
  ['focusReaderSidebar', 'focusReaderOutline'],
]);

/** Translate persisted retired IDs before earlier schema steps parse ActionIds. */
export function migrateRetiredShortcutActions(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const entries = parseBindingEntries(raw);
  if (
    !entries.some(
      ([, action]) => typeof action === 'string' && RETIRED_SHORTCUT_ACTIONS.has(action),
    )
  )
    return raw;
  return JSON.stringify(
    Object.fromEntries(
      entries.map(([key, action]) => [
        key,
        typeof action === 'string' ? (RETIRED_SHORTCUT_ACTIONS.get(action) ?? action) : action,
      ]),
    ),
  );
}

/** Relocates only inherited-default tombstones; explicit destinations always win. */
export function migrateShortcutSystemOverrides(raw: unknown): string {
  const renamed = migrateRetiredShortcutActions(raw);
  const overrides = parseBindingOverrides(renamed);
  let changed = false;
  for (const [oldKey, newKey] of [
    ['reader-normal:<Space>e', 'reader-normal:<Space>ro'],
    ['reader-normal:<Space>m', 'reader-normal:<Space>rm'],
    ['reader-normal:[', 'reader-normal:[a'],
    ['reader-normal:]', 'reader-normal:]a'],
  ] as const) {
    if (overrides[oldKey] !== null) continue;
    changed = true;
    delete overrides[oldKey];
    if (!(newKey in overrides)) overrides[newKey] = null;
  }
  return changed ? stringifyBindingOverrides(overrides) : renamed;
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

// Preferences are serialized; retain only the latest value, not an edit history.
let lastSerializedBindings: string | undefined;
let lastResolvedBindings: BindingMap | undefined;
const MODE_BINDINGS = new WeakMap<BindingMap, Map<BindingContext, BindingMap>>();

export function resolveBindings(raw: unknown): BindingMap {
  if (typeof raw === 'string' && raw === lastSerializedBindings && lastResolvedBindings) {
    return lastResolvedBindings;
  }
  const bindings: Record<string, ActionId> = { ...DEFAULT_BINDINGS };
  for (const [key, action] of Object.entries(parseBindingOverrides(raw))) {
    if (action === null) delete bindings[key];
    else bindings[key] = action;
  }
  const resolved = Object.freeze(bindings);
  if (typeof raw === 'string') {
    lastSerializedBindings = raw;
    lastResolvedBindings = resolved;
  }
  return resolved;
}

/** Projects one explicit mode; mutable editor drafts are never cached. */
export function bindingsForMode(bindings: BindingMap, mode: BindingContext): BindingMap {
  const cacheable = Object.isFrozen(bindings);
  let modes = cacheable ? MODE_BINDINGS.get(bindings) : undefined;
  const cached = modes?.get(mode);
  if (cached) return cached;
  const result: Record<string, ActionId> = {};
  for (const [key, action] of Object.entries(bindings)) {
    const binding = parseBindingKey(key);
    const sequence = binding ? canonicalBindingSequence(binding.sequence) : null;
    if (binding?.mode === mode && sequence) result[`${mode}:${sequence}`] = action;
  }
  const projected = Object.freeze(result);
  if (cacheable) {
    if (!modes) MODE_BINDINGS.set(bindings, (modes = new Map()));
    modes.set(mode, projected);
  }
  return projected;
}
