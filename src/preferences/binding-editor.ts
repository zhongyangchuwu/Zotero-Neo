import { ACTION_LABELS, isActionId, type ActionId } from '../input/actions';
import { actionsForBindingMode } from '../input/binding-capabilities';
import {
  DEFAULT_BINDINGS,
  MODES,
  parseBindingKey,
  type BindingMap,
  type Mode,
} from '../input/bindings';

export type BindingEditorLanguage = 'en' | 'zh-CN';
export type BindingRowId = number;

/** A row is the complete editable value; IDs are only for view/event routing. */
export interface BindingEditorRow {
  readonly id: BindingRowId;
  readonly mode: string;
  readonly key: string;
  readonly action: string;
}

export interface ActionEditorState {
  readonly rowId: BindingRowId;
  readonly query: string;
  readonly open: boolean;
  readonly selectedIndex: number;
}

export type BindingIssueKind = 'empty' | 'malformed' | 'incompatible' | 'duplicate' | 'prefix';

export interface BindingEditorIssue {
  readonly rowId: BindingRowId;
  readonly kind: BindingIssueKind;
}

export interface BindingEditorValidation {
  readonly errors: readonly BindingEditorIssue[];
  readonly warnings: readonly BindingEditorIssue[];
  readonly effectiveMap: BindingMap | null;
  readonly valid: boolean;
}

export type BindingSaveOutcome = 'saved' | 'save-failed' | null;

export interface BindingEditorState {
  readonly baseline: BindingMap;
  readonly rows: readonly BindingEditorRow[];
  readonly actionEditor: ActionEditorState | null;
  readonly nextRowId: BindingRowId;
  readonly saveOutcome: BindingSaveOutcome;
  readonly language: BindingEditorLanguage;
}

export interface BindingEditorDerived {
  readonly validation: BindingEditorValidation;
  readonly effectiveMap: BindingMap | null;
  readonly dirty: boolean;
  readonly activeActionOptions: readonly ActionId[];
}

const MODE_ORDER: Readonly<Record<Mode, number>> = {
  'reader-normal': 0,
  'reader-select': 1,
  'reader-insert': 2,
  'main-normal': 3,
  'main-select': 4,
};

function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

function cloneBindingMap(bindings: BindingMap): BindingMap {
  return Object.freeze({ ...bindings });
}

function clampActionSelection(selectedIndex: number, resultCount: number): number {
  if (resultCount <= 0 || !Number.isFinite(selectedIndex)) return 0;
  return Math.min(resultCount - 1, Math.max(0, Math.trunc(selectedIndex)));
}

export function actionLabel(action: ActionId, language: BindingEditorLanguage): string {
  return ACTION_LABELS[action][language];
}

/** Return only IDs; labels stay in the localized view projection. */
export function actionOptions(
  mode: string,
  query: string,
  language: BindingEditorLanguage = 'en',
): readonly ActionId[] {
  const normalizedQuery = query.toLowerCase();
  const candidates = isMode(mode) ? actionsForBindingMode(mode) : [];
  return candidates.filter((id) => {
    const normalizedId = id.toLowerCase();
    const normalizedLabel = actionLabel(id, language).toLowerCase();
    return normalizedId.includes(normalizedQuery) || normalizedLabel.includes(normalizedQuery);
  });
}

function sortedRowsFromMap(bindings: BindingMap, startingId = 0): BindingEditorRow[] {
  return Object.entries(bindings)
    .flatMap(([fullKey, action]) => {
      const parsed = parseBindingKey(fullKey);
      return parsed ? [{ mode: parsed.mode, key: parsed.sequence, action }] : [];
    })
    .sort((left, right) => {
      const modeDelta = MODE_ORDER[left.mode as Mode] - MODE_ORDER[right.mode as Mode];
      return modeDelta !== 0 ? modeDelta : left.key.localeCompare(right.key);
    })
    .map((row, index) => ({ ...row, id: startingId + index }));
}

interface ParsedEditorRow {
  readonly rowId: BindingRowId;
  readonly mode: Mode;
  readonly sequence: string;
  readonly action: ActionId;
}

function parseRows(rows: readonly BindingEditorRow[]): {
  readonly parsed: readonly ParsedEditorRow[];
  readonly keyRows: readonly { rowId: BindingRowId; mode: Mode; sequence: string }[];
  readonly errors: readonly BindingEditorIssue[];
} {
  const errors: BindingEditorIssue[] = [];
  const parsed: ParsedEditorRow[] = [];
  const keyRows: { rowId: BindingRowId; mode: Mode; sequence: string }[] = [];

  for (const row of rows) {
    const mode = typeof row?.mode === 'string' ? row.mode : '';
    const key = typeof row?.key === 'string' ? row.key : '';
    const action = typeof row?.action === 'string' ? row.action : '';
    const rowId = row?.id;
    if (!mode || !key) {
      errors.push({ rowId, kind: 'empty' });
      continue;
    }
    const binding = parseBindingKey(`${mode}:${key}`);
    if (!binding || binding.mode !== mode || binding.sequence !== key) {
      errors.push({ rowId, kind: 'malformed' });
      continue;
    }
    keyRows.push({ rowId, ...binding });
    if (!action) {
      errors.push({ rowId, kind: 'empty' });
      continue;
    }
    if (!isActionId(action)) {
      errors.push({ rowId, kind: 'malformed' });
      continue;
    }
    parsed.push({ rowId, ...binding, action });
    if (!actionsForBindingMode(binding.mode).includes(action)) {
      errors.push({ rowId, kind: 'incompatible' });
    }
  }

  return { parsed, keyRows, errors };
}

function duplicateIssues(
  rows: readonly { rowId: BindingRowId; mode: Mode; sequence: string }[],
): BindingEditorIssue[] {
  const byBinding = new Map<string, BindingRowId[]>();
  for (const row of rows) {
    const binding = `${row.mode}:${row.sequence}`;
    const ids = byBinding.get(binding);
    if (ids) ids.push(row.rowId);
    else byBinding.set(binding, [row.rowId]);
  }
  const issues: BindingEditorIssue[] = [];
  for (const ids of byBinding.values()) {
    if (ids.length < 2) continue;
    for (const rowId of ids) issues.push({ rowId, kind: 'duplicate' });
  }
  return issues;
}

function prefixIssues(rows: readonly ParsedEditorRow[]): BindingEditorIssue[] {
  const prefixRows = new Set<BindingRowId>();
  for (const [leftIndex, first] of rows.entries()) {
    for (const [rightIndex, second] of rows.entries()) {
      if (
        rightIndex <= leftIndex ||
        first.mode !== second.mode ||
        first.sequence === second.sequence
      )
        continue;
      if (
        !second.sequence.startsWith(first.sequence) &&
        !first.sequence.startsWith(second.sequence)
      )
        continue;
      const firstBinding = `${first.mode}:${first.sequence}`;
      const secondBinding = `${second.mode}:${second.sequence}`;
      if (
        DEFAULT_BINDINGS[firstBinding as keyof typeof DEFAULT_BINDINGS] === first.action &&
        DEFAULT_BINDINGS[secondBinding as keyof typeof DEFAULT_BINDINGS] === second.action
      )
        continue;
      prefixRows.add(first.rowId);
      prefixRows.add(second.rowId);
    }
  }
  return [...prefixRows].map((rowId) => ({ rowId, kind: 'prefix' as const }));
}

export function validateBindingDraft(rows: readonly BindingEditorRow[]): BindingEditorValidation {
  const parsedRows = parseRows(rows);
  const errors = [...parsedRows.errors, ...duplicateIssues(parsedRows.keyRows)];
  const warnings = prefixIssues(parsedRows.parsed);
  errors.sort((left, right) => left.rowId - right.rowId || left.kind.localeCompare(right.kind));
  warnings.sort((left, right) => left.rowId - right.rowId);

  let effectiveMap: BindingMap | null = null;
  if (errors.length === 0) {
    const map: Record<string, ActionId> = {};
    for (const row of parsedRows.parsed) map[`${row.mode}:${row.sequence}`] = row.action;
    effectiveMap = Object.freeze(map);
  }
  return {
    errors,
    warnings,
    effectiveMap,
    valid: errors.length === 0,
  };
}

function candidateMap(rows: readonly BindingEditorRow[]): BindingMap | null {
  const parsedRows = parseRows(rows);
  if (
    parsedRows.errors.some(
      (issue) => issue.kind === 'empty' || issue.kind === 'malformed' || issue.kind === 'duplicate',
    )
  )
    return null;
  const duplicates = duplicateIssues(parsedRows.keyRows);
  if (duplicates.length) return null;
  const map: Record<string, ActionId> = {};
  for (const row of parsedRows.parsed) map[`${row.mode}:${row.sequence}`] = row.action;
  return Object.freeze(map);
}

function mapsEqual(left: BindingMap, right: BindingMap): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

function rowForId(state: BindingEditorState, rowId: BindingRowId): BindingEditorRow | undefined {
  return state.rows.find((row) => row.id === rowId);
}

function optionsForEditor(
  state: BindingEditorState,
  editor: ActionEditorState | null,
): readonly ActionId[] {
  const row = editor ? rowForId(state, editor.rowId) : undefined;
  return row ? actionOptions(row.mode, editor?.query ?? '', state.language) : [];
}

export function deriveBindingEditor(state: BindingEditorState): BindingEditorDerived {
  const validation = validateBindingDraft(state.rows);
  const effectiveMap = validation.effectiveMap;
  const candidate = candidateMap(state.rows);
  const dirty = candidate === null ? true : !mapsEqual(candidate, state.baseline);
  const actionOptionsForActive = optionsForEditor(state, state.actionEditor);
  return {
    validation,
    effectiveMap,
    dirty,
    activeActionOptions: actionOptionsForActive,
  };
}

function nextRowId(state: BindingEditorState): BindingRowId {
  return Math.max(state.nextRowId, ...state.rows.map((row) => row.id + 1), 0);
}

function rowsForReset(state: BindingEditorState): {
  readonly rows: readonly BindingEditorRow[];
  readonly nextRowId: BindingRowId;
} {
  const existing = new Map<string, BindingRowId[]>();
  for (const row of state.rows) {
    const key = `${row.mode}:${row.key}`;
    const ids = existing.get(key);
    if (ids) ids.push(row.id);
    else existing.set(key, [row.id]);
  }
  let id = nextRowId(state);
  const rows = sortedRowsFromMap(DEFAULT_BINDINGS).map((row) => {
    const key = `${row.mode}:${row.key}`;
    const ids = existing.get(key);
    const preservedId = ids?.shift();
    if (preservedId !== undefined) return { ...row, id: preservedId };
    return { ...row, id: id++ };
  });
  return { rows, nextRowId: id };
}

export type BindingEditorEvent =
  | { readonly type: 'add-row' }
  | {
      readonly type: 'update-row';
      readonly rowId: BindingRowId;
      readonly patch: Partial<Pick<BindingEditorRow, 'mode' | 'key' | 'action'>>;
    }
  | { readonly type: 'delete-row'; readonly rowId: BindingRowId }
  | { readonly type: 'reset' }
  | { readonly type: 'open-action-editor'; readonly rowId: BindingRowId }
  | { readonly type: 'update-action-query'; readonly rowId: BindingRowId; readonly query: string }
  | { readonly type: 'move-action-selection'; readonly rowId: BindingRowId; readonly delta: -1 | 1 }
  | {
      readonly type: 'select-action' | 'commit-action-selection';
      readonly rowId: BindingRowId;
      readonly action?: ActionId;
    }
  | { readonly type: 'close-action-editor'; readonly rowId?: BindingRowId }
  | { readonly type: 'save-success'; readonly bindings: BindingMap }
  | { readonly type: 'save-failure' }
  | { readonly type: 'set-language'; readonly language: BindingEditorLanguage };

function updateRow(
  state: BindingEditorState,
  rowId: BindingRowId,
  patch: Partial<Pick<BindingEditorRow, 'mode' | 'key' | 'action'>>,
): BindingEditorState {
  if (!rowForId(state, rowId)) return state;
  const rows = state.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
  let actionEditor = state.actionEditor;
  if (actionEditor?.rowId === rowId && patch.mode !== undefined) {
    const updated = rows.find((row) => row.id === rowId);
    const options = updated ? actionOptions(updated.mode, actionEditor.query, state.language) : [];
    actionEditor = {
      ...actionEditor,
      selectedIndex: clampActionSelection(actionEditor.selectedIndex, options.length),
    };
  }
  return { ...state, rows, actionEditor, saveOutcome: null };
}

export function transition(
  state: BindingEditorState,
  event: BindingEditorEvent,
): BindingEditorState {
  switch (event.type) {
    case 'add-row': {
      const id = nextRowId(state);
      return {
        ...state,
        rows: [{ id, mode: 'reader-normal', key: '', action: '' }, ...state.rows],
        actionEditor: null,
        nextRowId: id + 1,
        saveOutcome: null,
      };
    }
    case 'update-row':
      return updateRow(state, event.rowId, event.patch);
    case 'delete-row':
      if (!rowForId(state, event.rowId)) return state;
      return {
        ...state,
        rows: state.rows.filter((row) => row.id !== event.rowId),
        actionEditor: state.actionEditor?.rowId === event.rowId ? null : state.actionEditor,
        saveOutcome: null,
      };
    case 'reset': {
      const reset = rowsForReset(state);
      return {
        ...state,
        rows: reset.rows,
        nextRowId: reset.nextRowId,
        actionEditor: null,
        saveOutcome: null,
      };
    }
    case 'open-action-editor': {
      if (!rowForId(state, event.rowId)) return state;
      const previous = state.actionEditor?.rowId === event.rowId ? state.actionEditor : null;
      const editor = previous ?? { rowId: event.rowId, query: '', open: true, selectedIndex: 0 };
      const options = optionsForEditor(state, editor);
      return {
        ...state,
        actionEditor: {
          ...editor,
          open: true,
          selectedIndex: clampActionSelection(editor.selectedIndex, options.length),
        },
      };
    }
    case 'update-action-query': {
      if (!rowForId(state, event.rowId)) return state;
      const editor = {
        rowId: event.rowId,
        query: event.query,
        open: true,
        selectedIndex: 0,
      };
      const options = optionsForEditor(state, editor);
      return {
        ...state,
        actionEditor: { ...editor, selectedIndex: clampActionSelection(0, options.length) },
      };
    }
    case 'move-action-selection': {
      if (state.actionEditor?.rowId !== event.rowId) return state;
      const options = optionsForEditor(state, state.actionEditor);
      const selectedIndex =
        options.length === 0
          ? 0
          : (clampActionSelection(state.actionEditor.selectedIndex, options.length) +
              event.delta +
              options.length) %
            options.length;
      return {
        ...state,
        actionEditor: { ...state.actionEditor, open: true, selectedIndex },
      };
    }
    case 'select-action':
    case 'commit-action-selection': {
      if (state.actionEditor?.rowId !== event.rowId) return state;
      const options = optionsForEditor(state, state.actionEditor);
      const action = event.action ?? options[state.actionEditor.selectedIndex];
      if (!action || !isActionId(action) || !options.includes(action)) return state;
      return updateRow({ ...state, actionEditor: null }, event.rowId, { action });
    }
    case 'close-action-editor':
      if (event.rowId !== undefined && state.actionEditor?.rowId !== event.rowId) return state;
      return { ...state, actionEditor: null };
    case 'save-success':
      return {
        ...state,
        baseline: cloneBindingMap(event.bindings),
        saveOutcome: 'saved',
      };
    case 'save-failure':
      return { ...state, saveOutcome: 'save-failed' };
    case 'set-language': {
      const editor = state.actionEditor;
      if (!editor) return { ...state, language: event.language };
      const nextState = { ...state, language: event.language };
      const options = optionsForEditor(nextState, editor);
      return {
        ...nextState,
        actionEditor: {
          ...editor,
          selectedIndex: clampActionSelection(editor.selectedIndex, options.length),
        },
      };
    }
  }
}

export function createBindingEditor(
  baseline: BindingMap = DEFAULT_BINDINGS,
  language: BindingEditorLanguage = 'en',
): BindingEditorState {
  const persistedBaseline = cloneBindingMap(baseline);
  const rows = sortedRowsFromMap(persistedBaseline);
  return {
    baseline: persistedBaseline,
    rows,
    actionEditor: null,
    nextRowId: rows.length,
    saveOutcome: null,
    language,
  };
}
