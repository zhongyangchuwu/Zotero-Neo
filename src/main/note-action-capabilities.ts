import type { ActionId } from '../input/actions';
import { NOTE_ACTION_IDS, type NoteActionId } from '../input/note-actions';

export const NOTE_NORMAL_ACTIONS = Object.freeze([
  ...NOTE_ACTION_IDS,
  'enterInsert',
  'exitMode',
  'openCommandPalette',
  'findAllItems',
  'findCollectionItems',
  'findNotes',
  'managePlugins',
  'openNeoSettings',
  'navigateBack',
  'navigateForward',
  'showInLibrary',
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
] as const satisfies readonly ActionId[]);

export const NOTE_COMMAND_PALETTE_ACTIONS = NOTE_NORMAL_ACTIONS;

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
