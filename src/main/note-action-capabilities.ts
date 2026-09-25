import type { ActionId } from '../input/actions';
import { NOTE_ACTION_IDS, type NoteActionId } from '../input/note-actions';
import { MAIN_NORMAL_ACTIONS, type MainNormalAction } from './action-capabilities';

export const NOTE_CROSS_CONTEXT_MAIN_ACTIONS = Object.freeze([
  'openCommandPalette',
  'findAllItems',
  'findCollectionItems',
  'findNotes',
  'managePlugins',
  'openNeoSettings',
  'switchTab',
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
  'closeCurrentTab',
  'previousTab',
  'nextTab',
  'addTag',
  'removeTag',
] as const satisfies readonly MainNormalAction[]);

export const NOTE_NORMAL_ACTIONS = Object.freeze([
  ...NOTE_ACTION_IDS,
  'enterInsert',
  'exitMode',
  ...NOTE_CROSS_CONTEXT_MAIN_ACTIONS,
] as const satisfies readonly ActionId[]);

export const NOTE_COMMAND_PALETTE_ACTIONS = Object.freeze([
  ...NOTE_ACTION_IDS,
  'enterInsert',
  'exitMode',
  ...NOTE_CROSS_CONTEXT_MAIN_ACTIONS,
] as const satisfies readonly ActionId[]);

export const NOTE_INSERT_ACTIONS = Object.freeze([
  'exitMode',
  'focusReaderSplitLeft',
  'focusReaderSplitDown',
  'focusReaderSplitUp',
  'focusReaderSplitRight',
] as const satisfies readonly ActionId[]);

export type NoteOwnedAction = NoteActionId | 'enterInsert' | 'exitMode';

export function isNoteOwnedAction(value: unknown): value is NoteOwnedAction {
  return (
    value === 'enterInsert' ||
    value === 'exitMode' ||
    NOTE_ACTION_IDS.includes(value as NoteActionId)
  );
}
