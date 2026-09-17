import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BINDINGS,
  encodeBindingOverrides,
  type BindingMap,
} from '../../src/input/bindings';
import {
  actionLabel,
  actionOptions,
  createBindingEditor,
  deriveBindingEditor,
  transition,
  validateBindingDraft,
  type BindingEditorRow,
} from '../../src/preferences/binding-editor';

function row(id: number, mode: string, key: string, action: string): BindingEditorRow {
  return { id, mode, key, action };
}

function rowValues(rows: readonly BindingEditorRow[]): readonly unknown[] {
  return rows.map(({ id, mode, key, action }) => ({ id, mode, key, action }));
}

describe('binding editor model transitions', () => {
  it('starts clean from defaults and returns clean after add then delete', () => {
    const initial = createBindingEditor(DEFAULT_BINDINGS);
    const initialDerived = deriveBindingEditor(initial);

    expect(initialDerived.dirty).toBe(false);
    expect(initialDerived.validation.valid).toBe(true);
    expect(initial.rows.map((candidate) => candidate.id)).toEqual(
      initial.rows.map((_candidate, index) => index),
    );

    const added = transition(initial, { type: 'add-row' });
    const addedRow = added.rows[0];
    expect(addedRow).toEqual({
      id: initial.nextRowId,
      mode: 'reader-normal',
      key: '',
      action: '',
    });
    expect(deriveBindingEditor(added).dirty).toBe(true);

    const deleted = transition(added, { type: 'delete-row', rowId: addedRow.id });
    expect(rowValues(deleted.rows)).toEqual(rowValues(initial.rows));
    expect(deriveBindingEditor(deleted).dirty).toBe(false);
    expect(deriveBindingEditor(deleted).validation.valid).toBe(true);
  });

  it('returns clean after an existing row is edited and reverted without changing its ID', () => {
    const initial = createBindingEditor(DEFAULT_BINDINGS);
    const target = initial.rows.find(
      (candidate) => candidate.mode === 'reader-normal' && candidate.key === 'j',
    );
    if (!target) throw new Error('Expected default normal:j row');

    const edited = transition(initial, {
      type: 'update-row',
      rowId: target.id,
      patch: { key: 'jj' },
    });
    expect(edited.rows.find((candidate) => candidate.id === target.id)).toEqual({
      ...target,
      key: 'jj',
    });
    expect(deriveBindingEditor(edited).dirty).toBe(true);

    const reverted = transition(edited, {
      type: 'update-row',
      rowId: target.id,
      patch: { key: target.key },
    });
    expect(reverted.rows.find((candidate) => candidate.id === target.id)).toEqual(target);
    expect(deriveBindingEditor(reverted).dirty).toBe(false);
  });

  it('resets to the default baseline and clears staged edits', () => {
    const initial = createBindingEditor(DEFAULT_BINDINGS);
    const target = initial.rows.find(
      (candidate) => candidate.mode === 'reader-normal' && candidate.key === 'j',
    );
    if (!target) throw new Error('Expected default normal:j row');

    const edited = transition(initial, {
      type: 'update-row',
      rowId: target.id,
      patch: {
        key: 'jj',
        action: 'scrollDown',
      },
    });
    const reset = transition(edited, { type: 'reset' });

    expect(reset.baseline).toEqual(DEFAULT_BINDINGS);
    expect(deriveBindingEditor(reset).effectiveMap).toEqual(DEFAULT_BINDINGS);
    expect(deriveBindingEditor(reset).dirty).toBe(false);
    expect(reset.actionEditor).toBeNull();
    expect(reset.saveOutcome).toBeNull();
  });

  it('resets a customized editor to staged defaults while retaining its custom baseline', () => {
    const baseline = {
      'reader-normal:x': 'scrollDown',
      'main-normal:y': 'mainTabPick',
    } as BindingMap;
    const initial = createBindingEditor(baseline);
    const edited = transition(initial, {
      type: 'update-row',
      rowId: initial.rows[0].id,
      patch: { key: 'z' },
    });
    const reset = transition(edited, { type: 'reset' });
    const derived = deriveBindingEditor(reset);

    expect(reset.baseline).toEqual(baseline);
    expect(derived.effectiveMap).toEqual(DEFAULT_BINDINGS);
    expect(derived.dirty).toBe(true);
    expect(derived.validation.valid).toBe(true);
    expect(rowValues(reset.rows)).not.toEqual(rowValues(initial.rows));
  });

  it('updates Mode on every existing row while preserving stable IDs', () => {
    const initial = createBindingEditor({
      'reader-normal:a': 'scrollDown',
      'reader-normal:b': 'scrollUp',
      'reader-normal:c': 'scrollLeft',
      'reader-normal:d': 'scrollRight',
      'reader-normal:e': 'scrollTop',
    } as BindingMap);
    const ids = initial.rows.map((candidate) => candidate.id);
    const edits: readonly Pick<BindingEditorRow, 'mode' | 'action'>[] = [
      { mode: 'reader-select', action: 'extendDown' },
      { mode: 'reader-insert', action: 'exitMode' },
      { mode: 'main-normal', action: 'mainTabPick' },
      { mode: 'reader-normal', action: 'scrollBottom' },
      { mode: 'reader-select', action: 'openSelectionActions' },
    ];

    let state = initial;
    edits.forEach((patch, index) => {
      state = transition(state, { type: 'update-row', rowId: ids[index], patch: patch });
    });

    expect(state.rows.map((candidate) => candidate.id)).toEqual(ids);
    expect(state.rows.map((candidate) => candidate.mode)).toEqual(edits.map((patch) => patch.mode));
    expect(state.rows.map((candidate) => candidate.action)).toEqual(
      edits.map((patch) => patch.action),
    );
    expect(deriveBindingEditor(state).validation.valid).toBe(true);
  });

  it('preserves incompatible legacy rows and blocks Apply until their Mode or Action is corrected', () => {
    const baseline = { 'reader-normal:x': 'mainTrashItems' } as BindingMap;
    const state = createBindingEditor(baseline);
    const legacy = state.rows[0];
    const invalid = deriveBindingEditor(state);

    expect(invalid.validation.valid).toBe(false);
    expect(invalid.effectiveMap).toBeNull();
    expect(invalid.validation.errors).toContainEqual({ rowId: legacy.id, kind: 'incompatible' });
    expect(state.rows[0]).toEqual(legacy);

    const corrected = transition(state, {
      type: 'update-row',
      rowId: legacy.id,
      patch: { mode: 'main-normal' },
    });
    expect(deriveBindingEditor(corrected).validation.valid).toBe(true);
    expect(corrected.rows[0]).toEqual({ ...legacy, mode: 'main-normal' });
  });

  it('tracks save success and failure without losing staged state', () => {
    const initial = createBindingEditor({ 'reader-normal:x': 'scrollDown' } as BindingMap);
    const edited = transition(initial, {
      type: 'update-row',
      rowId: initial.rows[0].id,
      patch: { key: 'y' },
    });
    const editedMap = deriveBindingEditor(edited).effectiveMap;
    if (!editedMap) throw new Error('Expected edited map to be valid');

    const failed = transition(edited, { type: 'save-failure' });
    expect(failed.saveOutcome).toBe('save-failed');
    expect(failed.rows).toEqual(edited.rows);
    expect(deriveBindingEditor(failed).dirty).toBe(true);

    const saved = transition(failed, { type: 'save-success', bindings: editedMap });
    expect(saved.saveOutcome).toBe('saved');
    expect(saved.baseline).toEqual(editedMap);
    expect(deriveBindingEditor(saved).dirty).toBe(false);
    expect(deriveBindingEditor(saved).effectiveMap).toEqual(editedMap);
  });
});

describe('binding editor validation and capabilities', () => {
  it('reports duplicate rows by stable ID without collapsing the draft', () => {
    const rows = [
      row(10, 'reader-normal', 'x', 'scrollDown'),
      row(20, 'reader-normal', 'x', 'scrollUp'),
      row(30, 'main-normal', 'x', 'mainFocusTree'),
    ];
    const validation = validateBindingDraft(rows);

    expect(validation.valid).toBe(false);
    expect(validation.effectiveMap).toBeNull();
    expect(validation.errors.filter((issue) => issue.kind === 'duplicate')).toEqual([
      { rowId: 10, kind: 'duplicate' },
      { rowId: 20, kind: 'duplicate' },
    ]);
    expect(rows).toHaveLength(3);
  });

  it('warns for strict same-mode prefixes while retaining an effective map', () => {
    const validation = validateBindingDraft([
      row(1, 'reader-normal', 'g', 'scrollDown'),
      row(2, 'reader-normal', 'gg', 'scrollUp'),
      row(3, 'main-normal', 'g', 'mainFocusTree'),
    ]);

    expect(validation.valid).toBe(true);
    expect(validation.warnings.map((issue) => issue.rowId)).toEqual([1, 2]);
    expect(validation.effectiveMap).toEqual({
      'reader-normal:g': 'scrollDown',
      'reader-normal:gg': 'scrollUp',
      'main-normal:g': 'mainFocusTree',
    });
  });

  it('blocks empty and malformed rows independently', () => {
    const validation = validateBindingDraft([
      row(4, 'reader-normal', '', 'scrollDown'),
      row(5, 'unknown', 'x', 'scrollDown'),
      row(6, 'reader-normal', 'y', 'notAnAction'),
    ]);

    expect(validation.valid).toBe(false);
    expect(validation.effectiveMap).toBeNull();
    expect(validation.errors).toEqual([
      { rowId: 4, kind: 'empty' },
      { rowId: 5, kind: 'malformed' },
      { rowId: 6, kind: 'malformed' },
    ]);
  });

  it('produces an effective map ready for compact delta serialization', () => {
    const bindings = Object.fromEntries(
      Object.entries(DEFAULT_BINDINGS).filter(([key]) => key !== 'reader-normal:H'),
    ) as BindingMap;
    const validation = validateBindingDraft(createBindingEditor(bindings).rows);

    expect(validation.valid).toBe(true);
    expect(validation.effectiveMap).not.toBeNull();
    expect(JSON.parse(encodeBindingOverrides(validation.effectiveMap!))).toEqual({
      'reader-normal:H': null,
    });
  });

  it('filters Action IDs and localized labels within the selected Mode capability set', () => {
    expect(actionOptions('reader-normal', 'scroll', 'en')).toContain('scrollDown');
    expect(actionOptions('reader-normal', 'SCROLLDOWN', 'en')).toContain('scrollDown');
    expect(actionOptions('reader-normal', '向下滚动', 'zh-CN')).toContain('scrollDown');
    expect(actionOptions('main-normal', 'mainfocusitems', 'en')).toContain('mainFocusItems');
    expect(actionOptions('main-normal', 'trash', 'en')).toContain('mainTrashItems');
    expect(actionOptions('reader-normal', 'trash', 'en')).not.toContain('mainTrashItems');
    expect(actionOptions('reader-select', 'scroll', 'en')).toEqual([]);
    expect(actionLabel('scrollDown', 'en')).toBe('Scroll down');
  });
});

describe('binding editor Action interaction state', () => {
  it('wraps keyboard selection and commits the selected Action through model transitions', () => {
    const initial = createBindingEditor({ 'reader-normal:x': 'scrollDown' } as BindingMap);
    const rowId = initial.rows[0].id;
    let active = transition(initial, { type: 'open-action-editor', rowId });
    active = transition(active, {
      type: 'update-action-query',
      rowId,
      query: 'scroll',
    });
    const options = deriveBindingEditor(active).activeActionOptions;
    expect(options.length).toBeGreaterThan(1);

    active = transition(active, {
      type: 'move-action-selection',
      rowId,
      delta: -1,
    });
    expect(active.actionEditor?.selectedIndex).toBe(options.length - 1);

    const selectedAction = options[options.length - 1];
    active = transition(active, { type: 'commit-action-selection', rowId });
    expect(active.actionEditor).toBeNull();
    expect(active.rows[0]?.action).toBe(selectedAction);
  });

  it('keeps one active Action editor, mode-aware options, and query across language changes', () => {
    const state = createBindingEditor({ 'reader-normal:x': 'scrollDown' } as BindingMap);
    const rowId = state.rows[0].id;
    let active = transition(state, { type: 'open-action-editor', rowId });
    active = transition(active, {
      type: 'update-action-query',
      rowId,
      query: 'scroll',
    });
    active = transition(active, {
      type: 'move-action-selection',
      rowId,
      delta: 1,
    });
    const beforeLanguage = active.actionEditor;
    if (!beforeLanguage) throw new Error('Expected active Action editor');
    expect(beforeLanguage.selectedIndex).toBeGreaterThan(0);

    const localized = transition(active, { type: 'set-language', language: 'zh-CN' });
    expect(localized.actionEditor).toMatchObject({
      rowId,
      query: 'scroll',
      open: true,
      selectedIndex: beforeLanguage.selectedIndex,
    });
    expect(localized.rows).toEqual(active.rows);
    expect(deriveBindingEditor(localized).activeActionOptions).toEqual(
      actionOptions('reader-normal', 'scroll', 'zh-CN'),
    );

    const switched = transition(localized, {
      type: 'update-row',
      rowId: rowId,
      patch: { mode: 'main-normal' },
    });
    expect(switched.actionEditor).toMatchObject({ rowId, query: 'scroll', open: true });
    expect(deriveBindingEditor(switched).activeActionOptions).toEqual(
      actionOptions('main-normal', 'scroll', 'zh-CN'),
    );
  });

  it('selects an explicit Action and closes the active editor', () => {
    const state = createBindingEditor({ 'reader-normal:x': 'scrollDown' } as BindingMap);
    const rowId = state.rows[0].id;
    const opened = transition(state, { type: 'open-action-editor', rowId });
    const selected = transition(opened, {
      type: 'select-action',
      rowId,
      action: 'scrollUp',
    });

    expect(selected.actionEditor).toBeNull();
    expect(selected.rows[0]).toEqual({ ...state.rows[0], action: 'scrollUp' });
    expect(deriveBindingEditor(selected).validation.valid).toBe(true);
  });
});
