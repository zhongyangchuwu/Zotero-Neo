export const NOTE_COMMAND_BY_ACTION = {
  noteMoveLeft: 'h',
  noteMoveDown: 'j',
  noteMoveUp: 'k',
  noteMoveRight: 'l',
  noteMoveWordForward: 'w',
  noteMoveWordBackward: 'b',
  noteMoveLineStart: '0',
  noteMoveLineEnd: '$',
  noteMoveDocumentStart: 'gg',
  noteMoveDocumentEnd: 'G',
  noteDeleteChar: 'x',
  noteAppendAfter: 'a',
  noteAppendLineEnd: 'A',
  noteInsertLineStart: 'I',
  noteOpenLineBelow: 'o',
  noteOpenLineAbove: 'O',
  noteUndo: 'u',
  noteRedo: '<C-r>',
  notePutAfter: 'p',
  notePutBefore: 'P',
  noteDeleteLine: 'dd',
  noteYankLine: 'yy',
  noteDeleteLeft: 'dh',
  noteDeleteDown: 'dj',
  noteDeleteUp: 'dk',
  noteDeleteRight: 'dl',
  noteDeleteWordForward: 'dw',
  noteDeleteWordBackward: 'db',
  noteDeleteToLineStart: 'd0',
  noteDeleteToLineEnd: 'd$',
  noteDeleteInnerWord: 'diw',
  noteYankLeft: 'yh',
  noteYankDown: 'yj',
  noteYankUp: 'yk',
  noteYankRight: 'yl',
  noteYankWordForward: 'yw',
  noteYankWordBackward: 'yb',
  noteYankToLineStart: 'y0',
  noteYankToLineEnd: 'y$',
  noteYankInnerWord: 'yiw',
  noteChangeLeft: 'ch',
  noteChangeDown: 'cj',
  noteChangeUp: 'ck',
  noteChangeRight: 'cl',
  noteChangeWordForward: 'cw',
  noteChangeWordBackward: 'cb',
  noteChangeToLineStart: 'c0',
  noteChangeToLineEnd: 'c$',
  noteChangeInnerWord: 'ciw',
} as const;

/** Main-scope actions schema-8 migration may preserve in Note scope. */
export const NOTE_MIGRATABLE_MAIN_BINDING_ACTION_IDS = Object.freeze([
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
] as const);

type NoteMigratableMainBindingActionId = (typeof NOTE_MIGRATABLE_MAIN_BINDING_ACTION_IDS)[number];

export function isNoteMigratableMainBindingAction(
  value: unknown,
): value is NoteMigratableMainBindingActionId {
  return NOTE_MIGRATABLE_MAIN_BINDING_ACTION_IDS.includes(
    value as NoteMigratableMainBindingActionId,
  );
}

export type NoteActionId = keyof typeof NOTE_COMMAND_BY_ACTION;

export const NOTE_ACTION_IDS = Object.freeze(Object.keys(NOTE_COMMAND_BY_ACTION) as NoteActionId[]);

export const NOTE_LOCAL_DEFAULT_BINDINGS = Object.freeze(
  Object.fromEntries(
    Object.entries(NOTE_COMMAND_BY_ACTION).map(([action, sequence]) => [
      'note-normal:' + sequence,
      action,
    ]),
  ),
) as Readonly<Record<string, NoteActionId>>;

export function isNoteActionId(value: unknown): value is NoteActionId {
  return typeof value === 'string' && value in NOTE_COMMAND_BY_ACTION;
}
