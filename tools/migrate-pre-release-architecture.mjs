#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function read(path) { return readFileSync(path, 'utf8'); }
function write(path, value) { writeFileSync(path, value); }
function replaceRequired(path, from, to) {
  const source = read(path);
  if (!source.includes(from)) throw new Error(`missing replacement in ${path}: ${from.slice(0, 100)}`);
  write(path, source.replace(from, to));
}
function edit(path, fn) { write(path, fn(read(path))); }
function walk(path, fn) {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isDirectory()) walk(full, fn); else fn(full);
  }
}

// Canonicalize configurable binding modes by host + interaction state.
edit('src/input/bindings.ts', (source) => {
  source = source.replace(
`export const MODES = ['normal', 'visual', 'insert', 'main'] as const;

export type Mode = (typeof MODES)[number];
export type BindingKey = \`${'${Mode}'}:${'${string}'}\`;
export type BindingMap = Readonly<Record<string, ActionId>>;

const MODE_BY_NAME: Readonly<Record<string, true>> = {
  normal: true,
  visual: true,
  insert: true,
  main: true,
};`,
`export const MODES = [
  'reader-normal',
  'reader-select',
  'reader-insert',
  'main-normal',
  'main-select',
] as const;

export type Mode = (typeof MODES)[number];
export type BindingKey = \`${'${Mode}'}:${'${string}'}\`;
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
}`,
  );
  source = source
    .replaceAll("'normal:", "'reader-normal:")
    .replaceAll("'visual:", "'reader-select:")
    .replaceAll("'insert:", "'reader-insert:")
    .replaceAll("'main:", "'main-normal:");
  source = source.replace(
`export function parseBindingKey(value: string): ParsedBindingKey | null {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const mode = value.slice(0, separator);
  const sequence = value.slice(separator + 1);
  if (!MODE_BY_NAME[mode] || !sequence) return null;
  return { mode: mode as Mode, sequence };
}`,
`export function parseBindingKey(value: string): ParsedBindingKey | null {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const mode = canonicalMode(value.slice(0, separator));
  const sequence = value.slice(separator + 1);
  if (!mode || !sequence) return null;
  return { mode, sequence };
}`,
  );
  source = source.replace(
`  for (const [key, action] of parseBindingEntries(raw)) {
    if (!parseBindingKey(key) || (action !== null && !isActionId(action))) continue;
    result[key] = action;
  }`,
`  for (const [key, action] of parseBindingEntries(raw)) {
    const binding = parseBindingKey(key);
    if (!binding || (action !== null && !isActionId(action))) continue;
    result[\`${'${binding.mode}'}:${'${binding.sequence}'}\`] = action;
  }`,
  );
  source = source.replace(
`  for (const [key, action] of parseBindingEntries(raw)) {
    if (!parseBindingKey(key) || REMOVED_ACTIONS[String(action)] || !isActionId(action)) continue;
    if (RETIRED_DEFAULT_BINDINGS[key as keyof typeof RETIRED_DEFAULT_BINDINGS] === action) continue;
    if (DEFAULT_BINDINGS[key as keyof typeof DEFAULT_BINDINGS] !== action) overrides[key] = action;
  }
  return stringifyBindingOverrides(overrides);
}`,
`  for (const [key, action] of parseBindingEntries(raw)) {
    const binding = parseBindingKey(key);
    if (!binding || REMOVED_ACTIONS[String(action)] || !isActionId(action)) continue;
    const canonicalKey = \`${'${binding.mode}'}:${'${binding.sequence}'}\`;
    if (
      RETIRED_DEFAULT_BINDINGS[canonicalKey as keyof typeof RETIRED_DEFAULT_BINDINGS] === action
    )
      continue;
    if (DEFAULT_BINDINGS[canonicalKey as keyof typeof DEFAULT_BINDINGS] !== action)
      overrides[canonicalKey] = action;
  }
  return stringifyBindingOverrides(overrides);
}

/** Canonicalizes schema-7 compact overrides while preserving explicit unbindings. */
export function migrateBindingModeOverrides(raw: unknown): string {
  return stringifyBindingOverrides(parseBindingOverrides(raw));
}`,
  );
  source = source.replace(
`  'main-normal:return': 'mainActivate',
} as const satisfies BindingMap;`,
`  'main-normal:return': 'mainActivate',
  'main-normal:v': 'mainEnterSelect',
  'main-select:j': 'mainSelectDown',
  'main-select:k': 'mainSelectUp',
  'main-select:gg': 'mainSelectFirst',
  'main-select:G': 'mainSelectLast',
  'main-select:o': 'mainSelectSwapEnds',
  'main-select:v': 'mainSelectFinish',
  'main-select:escape': 'mainSelectCancel',
} as const satisfies BindingMap;`,
  );
  source += `\n/** Projects fallback modes into one active mode; active bindings win by sequence. */\nexport function bindingsForMode(\n  bindings: BindingMap,\n  mode: Mode,\n  fallbacks: readonly Mode[] = [],\n): BindingMap {\n  const result: Record<string, ActionId> = {};\n  for (const sourceMode of [...fallbacks].reverse()) {\n    for (const [key, action] of Object.entries(bindings)) {\n      const binding = parseBindingKey(key);\n      if (binding?.mode === sourceMode) result[\`${'${mode}'}:${'${binding.sequence}'}\`] = action;\n    }\n  }\n  for (const [key, action] of Object.entries(bindings)) {\n    const binding = parseBindingKey(key);\n    if (binding?.mode === mode) result[\`${'${mode}'}:${'${binding.sequence}'}\`] = action;\n  }\n  return Object.freeze(result);\n}\n`;
  return source;
});

// Rewrite binding key literals throughout source/tests without changing Reader runtime mode strings.
for (const root of ['src', 'tests']) {
  walk(root, (path) => {
    if (!path.endsWith('.ts')) return;
    edit(path, (source) => source
      .replaceAll("'normal:", "'reader-normal:")
      .replaceAll('"normal:', '"reader-normal:')
      .replaceAll("'visual:", "'reader-select:")
      .replaceAll('"visual:', '"reader-select:')
      .replaceAll("'insert:", "'reader-insert:")
      .replaceAll('"insert:', '"reader-insert:')
      .replaceAll("'main:", "'main-normal:")
      .replaceAll('"main:', '"main-normal:'));
  });
}

// Binding preference migration: schema 7 compact overrides -> canonical modes without losing nulls.
edit('src/core/preferences.ts', (source) => source
  .replace(
    "import { migrateLegacyBindingOverrides, resolveBindings, type BindingMap } from '../input/bindings';",
    "import {\n  migrateBindingModeOverrides,\n  migrateLegacyBindingOverrides,\n  resolveBindings,\n  type BindingMap,\n} from '../input/bindings';",
  )
  .replace('export const BINDING_SCHEMA_VERSION = 7;', 'export const BINDING_SCHEMA_VERSION = 8;')
  .replace(
`export function migrateBindingPreferences(preferences: PreferenceWriter): void {
  if (preferences.get('bindings.schemaVersion', 0) >= BINDING_SCHEMA_VERSION) return;
  const raw = preferences.get('bindings', '');
  const migrated = migrateLegacyBindingOverrides(raw);
  if (migrated !== raw) preferences.set('bindings', migrated);
  preferences.set('bindings.schemaVersion', BINDING_SCHEMA_VERSION);
}`,
`export function migrateBindingPreferences(preferences: PreferenceWriter): void {
  const version = preferences.get('bindings.schemaVersion', 0);
  if (version >= BINDING_SCHEMA_VERSION) return;
  const raw = preferences.get('bindings', '');
  const migrated = version >= 7 ? migrateBindingModeOverrides(raw) : migrateLegacyBindingOverrides(raw);
  if (migrated !== raw) preferences.set('bindings', migrated);
  preferences.set('bindings.schemaVersion', BINDING_SCHEMA_VERSION);
}`,
  ));

// Main action capability sets distinguish normal and Item Select surfaces while sharing one executor.
write('src/main/action-capabilities.ts', `import type { ActionId } from '../input/actions';

/** Actions exposed by the ordinary Main-window interaction mode. */
export const MAIN_NORMAL_ACTIONS = Object.freeze([
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
  'mainEnterSelect',
] as const satisfies readonly ActionId[]);

/** Actions owned by Main Item Select. Ordinary Main actions remain available as fallbacks. */
export const MAIN_ITEM_SELECT_ACTIONS = Object.freeze([
  'mainSelectDown',
  'mainSelectUp',
  'mainSelectFirst',
  'mainSelectLast',
  'mainSelectSwapEnds',
  'mainSelectFinish',
  'mainSelectCancel',
] as const satisfies readonly ActionId[]);

export const MAIN_SELECT_ACTIONS = Object.freeze([
  ...MAIN_NORMAL_ACTIONS,
  ...MAIN_ITEM_SELECT_ACTIONS,
] as const satisfies readonly ActionId[]);

export const MAIN_EXECUTABLE_ACTIONS = MAIN_SELECT_ACTIONS;

export type MainNormalAction = (typeof MAIN_NORMAL_ACTIONS)[number];
export type MainItemSelectAction = (typeof MAIN_ITEM_SELECT_ACTIONS)[number];
export type MainExecutableAction = (typeof MAIN_EXECUTABLE_ACTIONS)[number];

/** Reader may delegate only non-selection Main actions with an explicit owner route. */
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
] as const satisfies readonly MainNormalAction[]);

export type ReaderDelegableMainAction = (typeof READER_DELEGABLE_MAIN_ACTIONS)[number];

function includes(actions: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && actions.includes(value);
}
export function isMainExecutableAction(value: unknown): value is MainExecutableAction {
  return includes(MAIN_EXECUTABLE_ACTIONS, value);
}
export function isMainItemSelectAction(value: unknown): value is MainItemSelectAction {
  return includes(MAIN_ITEM_SELECT_ACTIONS, value);
}
export function isReaderDelegableMainAction(value: unknown): value is ReaderDelegableMainAction {
  return includes(READER_DELEGABLE_MAIN_ACTIONS, value);
}
`);

// Add semantic actions for the shared Main Item Select mode.
edit('src/input/actions.ts', (source) => source.replace(
`  mainTagEditor: {
    en: 'Edit tags for the current item target(s)',
    'zh-CN': '编辑当前目标条目的标签',
  },`,
`  mainTagEditor: {
    en: 'Edit tags for the current item target(s)',
    'zh-CN': '编辑当前目标条目的标签',
  },
  mainEnterSelect: {
    en: 'Main window: enter item selection',
    'zh-CN': '主窗口：进入条目选择',
  },
  mainSelectDown: {
    en: 'Item Select: extend down',
    'zh-CN': '条目选择：向下扩展',
  },
  mainSelectUp: {
    en: 'Item Select: extend up',
    'zh-CN': '条目选择：向上扩展',
  },
  mainSelectFirst: {
    en: 'Item Select: extend to first item',
    'zh-CN': '条目选择：扩展到首项',
  },
  mainSelectLast: {
    en: 'Item Select: extend to last item',
    'zh-CN': '条目选择：扩展到末项',
  },
  mainSelectSwapEnds: {
    en: 'Item Select: swap anchor and focus',
    'zh-CN': '条目选择：交换锚点与焦点',
  },
  mainSelectFinish: {
    en: 'Item Select: finish and preserve selection',
    'zh-CN': '条目选择：完成并保留选择',
  },
  mainSelectCancel: {
    en: 'Item Select: cancel to focused item',
    'zh-CN': '条目选择：取消并保留焦点项',
  },`,
));

// Binding-capability projection follows the explicit host/mode names.
write('src/input/binding-capabilities.ts', `import {
  MAIN_NORMAL_ACTIONS,
  MAIN_SELECT_ACTIONS,
} from '../main/action-capabilities';
import {
  READER_LOCAL_INSERT_ACTIONS,
  READER_LOCAL_VISUAL_ACTIONS,
  READER_NORMAL_ACTIONS,
} from '../reader/action-capabilities';
import type { Mode } from './bindings';
import type { ActionId } from './actions';

/** Returns the executor-owned ActionId set available for a configurable interaction mode. */
export function actionsForBindingMode(mode: Mode): readonly ActionId[] {
  switch (mode) {
    case 'reader-normal':
      return READER_NORMAL_ACTIONS;
    case 'reader-select':
      return READER_LOCAL_VISUAL_ACTIONS;
    case 'reader-insert':
      return READER_LOCAL_INSERT_ACTIONS;
    case 'main-normal':
      return MAIN_NORMAL_ACTIONS;
    case 'main-select':
      return MAIN_SELECT_ACTIONS;
  }
}
`);

// Item Select now owns only Zotero selection operations and transient mode UI; Main owns input state.
write('src/main/item-select.ts', `import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import { mainHost } from './host';

type NativeSelection = {
  pivot?: number;
  focused?: number;
  count?: number;
  select?(index: number, shouldDebounce?: boolean): boolean | void;
  shiftSelect?(index: number, augment: boolean, shouldDebounce?: boolean): void;
};
type ItemView = {
  rowCount?: number;
  selection?: NativeSelection;
  tree?: unknown;
  domEl?: unknown;
  ensureRowIsVisible?(index: number): void;
};
type ItemSelectDirection = 1 | -1 | 'first' | 'last';
export type ItemSelectEnterResult = 'entered' | 'focus-items' | 'unavailable' | 'pass';
type ItemSelectUi = { badge: HTMLElement | null; timer: number | undefined };

function containsTarget(root: unknown, node: unknown): boolean {
  if (!root || !node) return false;
  if (root === node) return true;
  if (typeof root !== 'object') return false;
  const contains = (root as { contains?: unknown }).contains;
  if (typeof contains !== 'function') return false;
  try { return Boolean(contains.call(root, node)); } catch { return false; }
}

export function nextItemSelectIndex(
  current: number,
  rowCount: number,
  direction: ItemSelectDirection,
  count: number,
): number {
  const last = Math.max(0, rowCount - 1);
  if (direction === 'first') return 0;
  if (direction === 'last') return count > 0 ? Math.min(count - 1, last) : last;
  return Math.max(0, Math.min(last, current + direction * Math.max(1, count)));
}

/** Thin host adapter over Zotero's native TreeSelection; input routing belongs to Main. */
export class MainItemSelect {
  readonly #logger: Logger;
  readonly #ui = new Map<MainWindow, ItemSelectUi>();
  constructor(logger: Logger) { this.#logger = logger; }

  entryRelevant(window: MainWindow): boolean {
    return this.treeFocused(window, 'items') || this.treeFocused(window, 'collections');
  }
  itemsFocused(window: MainWindow): boolean { return this.treeFocused(window, 'items'); }

  enter(window: MainWindow): ItemSelectEnterResult {
    if (this.treeFocused(window, 'collections')) {
      this.show(window, 'ITEM SELECT · focus items list', false);
      return 'focus-items';
    }
    if (!this.treeFocused(window, 'items')) return 'pass';
    const view = this.itemView(window);
    const selection = view?.selection;
    const rowCount = view?.rowCount ?? 0;
    if (!view || !selection?.select || !selection.shiftSelect || rowCount <= 0) {
      this.show(window, 'ITEM SELECT · unavailable', false);
      return 'unavailable';
    }
    const focused = Math.max(0, Math.min(rowCount - 1, selection.focused ?? 0));
    selection.select(focused);
    view.ensureRowIsVisible?.(focused);
    this.showMode(window, selection);
    this.#logger.debug(\`main item select entered row=\${focused}\`);
    return 'entered';
  }

  extend(
    window: MainWindow,
    direction: ItemSelectDirection,
    count: number,
    shouldDebounce = false,
  ): void {
    const view = this.itemView(window);
    const selection = view?.selection;
    const rowCount = view?.rowCount ?? 0;
    if (!view || !selection?.shiftSelect || rowCount <= 0) return;
    const current = Math.max(0, Math.min(rowCount - 1, selection.focused ?? 0));
    const next = nextItemSelectIndex(current, rowCount, direction, count);
    selection.shiftSelect(next, false, shouldDebounce);
    view.ensureRowIsVisible?.(next);
    this.showMode(window, selection);
  }

  swapEnds(window: MainWindow): void {
    const view = this.itemView(window);
    const selection = view?.selection;
    const pivot = selection?.pivot;
    const focused = selection?.focused;
    if (!view || !selection?.shiftSelect || pivot === undefined || focused === undefined) return;
    selection.pivot = focused;
    selection.shiftSelect(pivot, false);
    view.ensureRowIsVisible?.(pivot);
    this.showMode(window, selection);
  }

  finish(window: MainWindow): number {
    const count = this.itemView(window)?.selection?.count ?? 0;
    this.show(window, \`\${count} item\${count === 1 ? '' : 's'} selected\`, false);
    this.#logger.debug(\`main item select exited preserve=true count=\${count}\`);
    return count;
  }

  cancel(window: MainWindow): void {
    const view = this.itemView(window);
    const selection = view?.selection;
    if (view && selection?.select) {
      const last = Math.max(0, (view.rowCount ?? 1) - 1);
      const focused = Math.max(0, Math.min(last, selection.focused ?? 0));
      selection.select(focused);
      view.ensureRowIsVisible?.(focused);
    }
    this.show(window, 'Item selection cancelled', false);
    this.#logger.debug('main item select exited preserve=false');
  }

  leave(window: MainWindow): void { this.hide(window); }
  removeWindow(window: MainWindow): void {
    const ui = this.#ui.get(window);
    if (!ui) return;
    window.clearTimeout(ui.timer);
    ui.badge?.remove();
    this.#ui.delete(window);
  }

  private itemView(window: MainWindow): ItemView | undefined {
    return mainHost(window).ZoteroPane?.itemsView as unknown as ItemView | undefined;
  }
  private treeFocused(window: MainWindow, panel: 'items' | 'collections'): boolean {
    const active = window.document.activeElement;
    if (!active) return false;
    const pane = mainHost(window).ZoteroPane;
    const view = panel === 'items' ? pane?.itemsView : pane?.collectionsView;
    const targets = panel === 'items'
      ? [view?.tree, view?.domEl, window.document.getElementById('item-tree-main-default'), window.document.getElementById('zotero-items-tree'), window.document.querySelector('#zotero-items-tree .virtualized-table')]
      : [view?.tree, view?.domEl, window.document.getElementById('collection-tree'), window.document.getElementById('zotero-collections-tree'), window.document.querySelector('#zotero-collections-tree .virtualized-table')];
    const id = active.id ?? '';
    return targets.some((target) => containsTarget(target, active) || containsTarget(active, target)) ||
      (panel === 'items' ? id.includes('item-tree') : id.includes('collection'));
  }
  private showMode(window: MainWindow, selection: NativeSelection): void {
    const count = selection.count ?? 0;
    this.show(window, \`-- ITEM SELECT -- · \${count} item\${count === 1 ? '' : 's'}\`, true);
  }
  private show(window: MainWindow, text: string, persistent: boolean): void {
    let ui = this.#ui.get(window);
    if (!ui) { ui = { badge: null, timer: undefined }; this.#ui.set(window, ui); }
    window.clearTimeout(ui.timer);
    ui.timer = undefined;
    if (!ui.badge) {
      const badge = window.document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      badge.id = 'zotero-neo-item-select-status';
      badge.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:99998;font:bold 12px/1.4 monospace;padding:3px 9px;border-radius:3px;background:Highlight;color:HighlightText;pointer-events:none;user-select:none';
      (window.document.body ?? window.document.documentElement).append(badge);
      ui.badge = badge;
    }
    ui.badge.textContent = text;
    ui.badge.style.display = 'block';
    if (!persistent) ui.timer = window.setTimeout(() => this.hide(window), 1200);
  }
  private hide(window: MainWindow): void {
    const ui = this.#ui.get(window);
    if (!ui) return;
    window.clearTimeout(ui.timer);
    ui.timer = undefined;
    ui.badge?.remove();
    ui.badge = null;
  }
}
`);

// Add explicit Main input mode and remove superseded Picker edit state.
edit('src/main/session.ts', (source) => source
  .replace("import type { CompositionState } from '../input/composition';", "import type { CompositionState } from '../input/composition';\nimport type { Mode } from '../input/bindings';")
  .replace("  activePanel: MainPanel = 'items';", "  activePanel: MainPanel = 'items';\n  inputMode: Extract<Mode, 'main-normal' | 'main-select'> = 'main-normal';")
  .replace("    tagPurpose: 'filter' | 'edit';\n", '')
  .replace("    tagPurpose: 'filter',\n", ''));

// Main controller owns Item Select and routes it through the same input engine/binding map.
edit('src/main/controller.ts', (source) => {
  source = source.replace(
`  MAIN_EXECUTABLE_ACTIONS,
  isMainExecutableAction,`,
`  MAIN_EXECUTABLE_ACTIONS,
  MAIN_NORMAL_ACTIONS,
  MAIN_SELECT_ACTIONS,
  isMainExecutableAction,`,
  );
  source = source.replace(
"import { resolveBindings } from '../input/bindings';",
"import { bindingsForMode, resolveBindings, type Mode } from '../input/bindings';",
  );
  source = source.replace(
"import { TagWorkspace } from './tag-workspace';",
"import { TagWorkspace } from './tag-workspace';\nimport { MainItemSelect } from './item-select';",
  );
  source = source.replace(
"  readonly #tagWorkspace: TagWorkspace;",
"  readonly #tagWorkspace: TagWorkspace;\n  readonly #itemSelect: MainItemSelect;",
  );
  source = source.replace(
"    this.#navigation = new MainNavigation(dependencies.logger, (window) => this.rescan(window));",
"    this.#navigation = new MainNavigation(dependencies.logger, (window) => this.rescan(window));\n    this.#itemSelect = new MainItemSelect(dependencies.logger);",
  );
  source = source.replace(
"    session.dispose();\n  }",
"    this.#itemSelect.removeWindow(window);\n    session.dispose();\n  }",
  );
  source = source.replace(
`  private bindings() {
    return resolveBindings(this.#dependencies.preferences.get('bindings', ''));
  }`,
`  private bindings() {
    return resolveBindings(this.#dependencies.preferences.get('bindings', ''));
  }
  private activeBindings(mode: Mode) {
    return bindingsForMode(this.bindings(), mode, mode === 'main-select' ? ['main-normal'] : []);
  }`,
  );
  source = source.replace(
`    const key = keyString(event);
    if (!key) return;
    const bindings = this.bindings();
    const leaderState = {
      mode: 'main' as const,`,
`    if (session.inputMode === 'main-select' && !this.#itemSelect.itemsFocused(window)) {
      this.#itemSelect.leave(window);
      session.inputMode = 'main-normal';
      session.keyBuffer = '';
      session.countBuffer = '';
      session.inputRevision += 1;
      window.clearTimeout(session.keyTimer);
      session.keyTimer = undefined;
      this.clearKeyGuide(window, session);
      return;
    }
    const key = keyString(event);
    if (!key) return;
    const bindings = this.activeBindings(session.inputMode);
    const leaderState = {
      mode: session.inputMode,`,
  );
  source = source.replace("        mode: 'main',\n", "        mode: session.inputMode,\n");
  source = source.replace(
`    if (decision.kind === 'execute') {
      if (!isMainExecutableAction(decision.action)) {`,
`    if (decision.kind === 'execute') {
      if (decision.action === 'mainEnterSelect' && !this.#itemSelect.entryRelevant(window)) {
        this.clearKeyGuide(window, session);
        return;
      }
      if (!isMainExecutableAction(decision.action)) {`,
  );
  source = source.replace(
"    const entries = leaderGuideEntries(this.bindings(), 'main', prefix, this.keyGuideLanguage());",
"    const entries = leaderGuideEntries(\n      this.activeBindings(session.inputMode),\n      session.inputMode,\n      prefix,\n      this.keyGuideLanguage(),\n    );",
  );
  source = source.replace(
`          mode: 'main',
          actions: MAIN_EXECUTABLE_ACTIONS,
          bindings: this.bindings(),`,
`          mode: 'main',
          bindingMode: session.inputMode,
          actions: session.inputMode === 'main-select' ? MAIN_SELECT_ACTIONS : MAIN_NORMAL_ACTIONS,
          bindings: this.bindings(),`,
  );
  source = source.replace("        session.picker.tagPurpose = 'filter';\n", '');
  source = source.replace(
`      case 'mainTreeCollapseAll':
        this.#navigation.collapseAll(window, session);
        break;`,
`      case 'mainTreeCollapseAll':
        this.#navigation.collapseAll(window, session);
        break;
      case 'mainEnterSelect': {
        const result = this.#itemSelect.enter(window);
        if (result === 'entered') session.inputMode = 'main-select';
        break;
      }
      case 'mainSelectDown':
        this.#itemSelect.extend(window, 1, count, shouldDebounce);
        break;
      case 'mainSelectUp':
        this.#itemSelect.extend(window, -1, count, shouldDebounce);
        break;
      case 'mainSelectFirst':
        this.#itemSelect.extend(window, 'first', count);
        break;
      case 'mainSelectLast':
        this.#itemSelect.extend(window, 'last', count);
        break;
      case 'mainSelectSwapEnds':
        this.#itemSelect.swapEnds(window);
        break;
      case 'mainSelectFinish':
        this.#itemSelect.finish(window);
        session.inputMode = 'main-normal';
        break;
      case 'mainSelectCancel':
        this.#itemSelect.cancel(window);
        session.inputMode = 'main-normal';
        break;`,
  );
  return source;
});

// Item Select no longer has an Addon-level capture listener.
edit('src/addon.ts', (source) => source
  .replace("import { MainItemSelect } from './main/item-select';\n", '')
  .replace("  readonly #itemSelect = new MainItemSelect(this.#logger);\n", '')
  .replace("    this.#itemSelect.shutdown();\n", '')
  .replace("    // Register Item Select first so its capture listener can own v/j/k before Main navigation.\n    this.#itemSelect.addWindow(window);\n", '')
  .replace("    this.#itemSelect.removeWindow(window);\n", ''));

// Command palette keeps surface semantics but receives the actual binding mode for key hints.
edit('src/core/contracts.ts', (source) => source
  .replace("import type { BindingMap } from '../input/bindings';", "import type { BindingMap, Mode } from '../input/bindings';")
  .replace("  readonly mode: CommandPaletteMode;\n", "  readonly mode: CommandPaletteMode;\n  readonly bindingMode: Mode;\n"));
edit('src/main/picker/providers/commands.ts', (source) => source
  .replace("    if (!binding || binding.mode !== context.mode || !isActionId(action)) continue;", "    if (!binding || binding.mode !== context.bindingMode || !isActionId(action)) continue;"));

// Note main-command overlay uses canonical Main mode. Note-local grammar is handled in the next #29 slice.
edit('src/main/note-editor.ts', (source) => source.replace("        mode: 'main' as const,", "        mode: 'main-normal' as const,"));

// Reader runtime modes map explicitly to configurable binding modes.
edit('src/reader/controller.ts', (source) => {
  source = source.replace(
"import { resolveBindings, type BindingMap } from '../input/bindings';",
"import { resolveBindings, type BindingMap, type Mode } from '../input/bindings';",
  );
  source = source.replace(
`function assertNever(value: never): never {
  throw new Error(\`Unhandled Reader action: \${String(value)}\`);
}`,
`function assertNever(value: never): never {
  throw new Error(\`Unhandled Reader action: \${String(value)}\`);
}
function readerBindingMode(mode: ReaderMode): Extract<Mode, 'reader-normal' | 'reader-select' | 'reader-insert'> {
  return mode === 'normal' ? 'reader-normal' : mode === 'visual' ? 'reader-select' : 'reader-insert';
}`,
  );
  source = source.replace("      mode: this.state.mode,\n      keyBuffer: this.state.keyBuffer,", "      mode: readerBindingMode(this.state.mode),\n      keyBuffer: this.state.keyBuffer,");
  source = source.replace("        mode: this.state.mode,\n        keyBuffer: this.state.keyBuffer,", "        mode: readerBindingMode(this.state.mode),\n        keyBuffer: this.state.keyBuffer,");
  source = source.replace("    const modePrefix = 'reader-normal:';", "    const modePrefix = 'reader-normal:';");
  source = source.replace("      this.state.mode,\n      prefix,", "      readerBindingMode(this.state.mode),\n      prefix,");
  source = source.replace(
`        mode: 'normal',
        actions: READER_NORMAL_ACTIONS,`,
`        mode: 'normal',
        bindingMode: 'reader-normal',
        actions: READER_NORMAL_ACTIONS,`,
  );
  return source;
});

// Preferences/editor tests and code: explicit binding modes.
edit('src/preferences/binding-editor.ts', (source) => source
  .replace(`const MODE_ORDER: Readonly<Record<Mode, number>> = {
  normal: 0,
  visual: 1,
  insert: 2,
  main: 3,
};`, `const MODE_ORDER: Readonly<Record<Mode, number>> = {
  'reader-normal': 0,
  'reader-select': 1,
  'reader-insert': 2,
  'main-normal': 3,
  'main-select': 4,
};`));

// Latest stable Zotero only.
const manifest = JSON.parse(read('manifest.json'));
manifest.applications.zotero.strict_min_version = '10.0';
write('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

// Rewrite Item Select unit coverage against the host adapter rather than a private key parser.
write('tests/unit/item-select.test.ts', `import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { MainItemSelect, nextItemSelectIndex } from '../../src/main/item-select';

const logger = { debug: vi.fn(), diagnostic: vi.fn() };

describe('Main Item Select', () => {
  it('computes clamped Vim-style range targets', () => {
    expect(nextItemSelectIndex(3, 10, 1, 4)).toBe(7);
    expect(nextItemSelectIndex(3, 10, -1, 9)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'first', 0)).toBe(0);
    expect(nextItemSelectIndex(3, 10, 'last', 0)).toBe(9);
    expect(nextItemSelectIndex(3, 10, 'last', 5)).toBe(4);
  });

  it('mutates only Zotero native pivot/focus selection while Main owns modal input', () => {
    let pivot = 2;
    let focused = 2;
    let count = 1;
    const active = { id: 'item-tree-row-2' } as unknown as Element;
    const root = { contains: (node: unknown) => node === active } as HTMLElement;
    const select = vi.fn((index: number) => { pivot = index; focused = index; count = 1; });
    const shiftSelect = vi.fn((index: number) => { focused = index; count = Math.abs(pivot - focused) + 1; });
    const badge = { id: '', style: { cssText: '', display: '' }, textContent: '', remove: vi.fn() } as unknown as HTMLElement;
    const document = {
      activeElement: active,
      getElementById: () => null,
      querySelector: () => null,
      createElementNS: () => badge,
      body: { append: vi.fn() },
      documentElement: { append: vi.fn() },
    } as unknown as Document;
    const selection = {
      get pivot() { return pivot; },
      set pivot(value: number) { pivot = value; },
      get focused() { return focused; },
      get count() { return count; },
      select,
      shiftSelect,
    };
    const window = {
      document,
      ZoteroPane: { itemsView: { domEl: root, rowCount: 10, selection, ensureRowIsVisible: vi.fn() } },
      setTimeout: (fn: () => void) => setTimeout(fn, 5000) as unknown as number,
      clearTimeout: (timer: number) => clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
    } as unknown as MainWindow;
    const feature = new MainItemSelect(logger);

    expect(feature.enter(window)).toBe('entered');
    feature.extend(window, 1, 1, false);
    feature.extend(window, 1, 3, false);
    expect(count).toBe(5);
    feature.swapEnds(window);
    expect(pivot).toBe(6);
    expect(focused).toBe(2);
    expect(feature.finish(window)).toBe(5);

    feature.enter(window);
    feature.extend(window, 1, 2, false);
    const focusedBeforeCancel = focused;
    feature.cancel(window);
    expect(count).toBe(1);
    expect(focused).toBe(focusedBeforeCancel);
    feature.removeWindow(window);
  });
});
`);

// Targeted test literals for interaction modes and command palette context.
walk('tests', (path) => {
  if (!path.endsWith('.ts')) return;
  edit(path, (source) => source
    .replaceAll("mode: 'main' as const", "mode: 'main-normal' as const")
    .replaceAll("mode: 'normal' as const", "mode: 'reader-normal' as const"));
});
edit('tests/unit/key-guide.test.ts', (source) => source
  .replaceAll("leaderGuideEntries(bindings, 'normal'", "leaderGuideEntries(bindings, 'reader-normal'")
  .replaceAll("leaderGuideEntries(DEFAULT_BINDINGS, 'main'", "leaderGuideEntries(DEFAULT_BINDINGS, 'main-normal'"));
edit('tests/unit/binding-editor-view.test.ts', (source) => source.replace(
  "for (const mode of ['normal', 'visual', 'insert', 'main'] as const)",
  "for (const mode of ['reader-normal', 'reader-select', 'reader-insert', 'main-normal', 'main-select'] as const)",
));
edit('tests/unit/fuzzy-picker.test.ts', (source) => source
  .replaceAll("mode: 'normal',\n      actions: READER_NORMAL_ACTIONS,", "mode: 'normal',\n      bindingMode: 'reader-normal',\n      actions: READER_NORMAL_ACTIONS,")
  .replaceAll("mode: 'main',\n      actions: MAIN_EXECUTABLE_ACTIONS,", "mode: 'main',\n      bindingMode: 'main-normal',\n      actions: MAIN_EXECUTABLE_ACTIONS,"));

console.log('pre-release architecture migration staged');
