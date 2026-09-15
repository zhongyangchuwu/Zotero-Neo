import { describe, expect, it } from 'vitest';

import type { ActionId } from '../../src/input/actions';
import {
  MAIN_EXECUTABLE_ACTIONS,
  READER_DELEGABLE_MAIN_ACTIONS,
  isMainExecutableAction,
  isReaderDelegableMainAction,
} from '../../src/main/action-capabilities';
import {
  READER_LOCAL_INSERT_ACTIONS,
  READER_LOCAL_NORMAL_ACTIONS,
  READER_LOCAL_VISUAL_ACTIONS,
  READER_NORMAL_ACTIONS,
  isReaderActionForMode,
} from '../../src/reader/action-capabilities';
import { actionsForBindingMode } from '../../src/input/binding-capabilities';

const expectedMainActions: readonly ActionId[] = [
  'openCommandPalette',
  'mainFuzzyAll',
  'mainFuzzyCollection',
  'mainTabPick',
  'mainNotesLayout',
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
];

const expectedDelegableMainActions: readonly ActionId[] = [
  'mainFuzzyAll',
  'mainFuzzyCollection',
  'mainNotesLayout',
  'mainTabPick',
  'mainYankCitekey',
  'mainClosePDF',
  'mainPrevTab',
  'mainNextTab',
];

function sameActions(actual: readonly ActionId[], expected: readonly ActionId[]): void {
  expect(new Set(actual)).toEqual(new Set(expected));
  expect(new Set(actual).size).toBe(actual.length);
}

describe('action capability ownership', () => {
  it('keeps the Main capability catalog in parity with its executable actions', () => {
    sameActions(MAIN_EXECUTABLE_ACTIONS, expectedMainActions);

    for (const action of expectedMainActions) expect(isMainExecutableAction(action)).toBe(true);
    expect(isMainExecutableAction('zoomIn')).toBe(false);
    expect(isMainExecutableAction('not-an-action')).toBe(false);
  });

  it('keeps Reader delegation limited to the approved Main subset', () => {
    sameActions(READER_DELEGABLE_MAIN_ACTIONS, expectedDelegableMainActions);

    for (const action of expectedDelegableMainActions)
      expect(isReaderDelegableMainAction(action)).toBe(true);
    for (const action of [
      'mainTrashItems',
      'mainRestoreTrashedItems',
      'mainFocusTree',
      'mainFocusItems',
      'mainOpenPDF',
      'mainActivate',
      'mainTagPicker',
      'mainTreeExpand',
    ] as const)
      expect(isReaderDelegableMainAction(action)).toBe(false);
    expect(isReaderDelegableMainAction('zoomIn')).toBe(false);
  });

  it('composes binding capabilities from the owning Main and Reader sets', () => {
    sameActions(actionsForBindingMode('main'), MAIN_EXECUTABLE_ACTIONS);
    sameActions(actionsForBindingMode('normal'), READER_NORMAL_ACTIONS);
    sameActions(actionsForBindingMode('visual'), READER_LOCAL_VISUAL_ACTIONS);
    sameActions(actionsForBindingMode('insert'), READER_LOCAL_INSERT_ACTIONS);

    sameActions(READER_NORMAL_ACTIONS, [
      ...READER_LOCAL_NORMAL_ACTIONS,
      ...READER_DELEGABLE_MAIN_ACTIONS,
    ]);
  });

  it('guards commands by Reader mode and rejects unsafe catalog drift', () => {
    expect(isReaderActionForMode('normal', 'openCommandPalette')).toBe(true);
    expect(isReaderActionForMode('normal', 'mainTabPick')).toBe(true);
    expect(isReaderActionForMode('normal', 'mainTrashItems')).toBe(false);
    expect(isReaderActionForMode('visual', 'highlightYellow')).toBe(true);
    expect(isReaderActionForMode('visual', 'flashText')).toBe(true);
    expect(isReaderActionForMode('visual', 'openSelectionActions')).toBe(true);
    expect(isReaderActionForMode('visual', 'underlineSelection')).toBe(true);
    expect(isReaderActionForMode('visual', 'zoomIn')).toBe(false);
    expect(isReaderActionForMode('normal', 'flashText')).toBe(false);
    expect(isReaderActionForMode('insert', 'exitMode')).toBe(true);
    expect(isReaderActionForMode('insert', 'mainFuzzyAll')).toBe(false);
    expect(isReaderActionForMode('normal', 'not-an-action')).toBe(false);
  });
});
