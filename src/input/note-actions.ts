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
  noteRedo: 'ctrl+r',
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

export const NOTE_CROSS_CONTEXT_ACTION_IDS = Object.freeze([
  'openCommandPalette',
  'findAllItems',
  'findCollectionItems',
  'findNotes',
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

export type NoteCrossContextActionId = (typeof NOTE_CROSS_CONTEXT_ACTION_IDS)[number];

export function isNoteCrossContextActionId(value: unknown): value is NoteCrossContextActionId {
  return NOTE_CROSS_CONTEXT_ACTION_IDS.includes(value as NoteCrossContextActionId);
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

type LocalizedActionLabel = {
  readonly en: string;
  readonly 'zh-CN': string;
};

const SIMPLE_LABELS: Partial<Record<NoteActionId, LocalizedActionLabel>> = {
  noteMoveLeft: { en: 'Note: move left', 'zh-CN': '笔记：向左移动' },
  noteMoveDown: { en: 'Note: move down one line', 'zh-CN': '笔记：向下一行' },
  noteMoveUp: { en: 'Note: move up one line', 'zh-CN': '笔记：向上一行' },
  noteMoveRight: { en: 'Note: move right', 'zh-CN': '笔记：向右移动' },
  noteMoveWordForward: { en: 'Note: next word', 'zh-CN': '笔记：下一个单词' },
  noteMoveWordBackward: { en: 'Note: previous word', 'zh-CN': '笔记：上一个单词' },
  noteMoveLineStart: { en: 'Note: line start', 'zh-CN': '笔记：行首' },
  noteMoveLineEnd: { en: 'Note: line end', 'zh-CN': '笔记：行尾' },
  noteMoveDocumentStart: { en: 'Note: document start', 'zh-CN': '笔记：文档开头' },
  noteMoveDocumentEnd: { en: 'Note: document end', 'zh-CN': '笔记：文档末尾' },
  noteDeleteChar: { en: 'Note: delete character', 'zh-CN': '笔记：删除字符' },
  noteAppendAfter: { en: 'Note: append after cursor', 'zh-CN': '笔记：在光标后插入' },
  noteAppendLineEnd: { en: 'Note: append at line end', 'zh-CN': '笔记：在行尾插入' },
  noteInsertLineStart: { en: 'Note: insert at line start', 'zh-CN': '笔记：在行首插入' },
  noteOpenLineBelow: { en: 'Note: open line below', 'zh-CN': '笔记：在下方新建一行' },
  noteOpenLineAbove: { en: 'Note: open line above', 'zh-CN': '笔记：在上方新建一行' },
  noteUndo: { en: 'Note: undo', 'zh-CN': '笔记：撤销' },
  noteRedo: { en: 'Note: redo', 'zh-CN': '笔记：重做' },
  notePutAfter: { en: 'Note: paste after cursor', 'zh-CN': '笔记：在光标后粘贴' },
  notePutBefore: { en: 'Note: paste before cursor', 'zh-CN': '笔记：在光标前粘贴' },
  noteDeleteLine: { en: 'Note: delete line', 'zh-CN': '笔记：删除当前行' },
  noteYankLine: { en: 'Note: yank line', 'zh-CN': '笔记：复制当前行' },
};

const OPERATION_LABELS = {
  Delete: { en: 'delete', 'zh-CN': '删除' },
  Yank: { en: 'yank', 'zh-CN': '复制' },
  Change: { en: 'change', 'zh-CN': '修改' },
} as const;

const MOTION_LABELS = {
  Left: { en: 'left character', 'zh-CN': '左侧字符' },
  Down: { en: 'down one line', 'zh-CN': '向下一行' },
  Up: { en: 'up one line', 'zh-CN': '向上一行' },
  Right: { en: 'right character', 'zh-CN': '右侧字符' },
  WordForward: { en: 'to next word', 'zh-CN': '到下一个单词' },
  WordBackward: { en: 'to previous word', 'zh-CN': '到上一个单词' },
  ToLineStart: { en: 'to line start', 'zh-CN': '到行首' },
  ToLineEnd: { en: 'to line end', 'zh-CN': '到行尾' },
  InnerWord: { en: 'inner word', 'zh-CN': '当前单词' },
} as const;

function labelFor(action: NoteActionId): LocalizedActionLabel {
  const simple = SIMPLE_LABELS[action];
  if (simple) return simple;
  const match =
    /^note(Delete|Yank|Change)(Left|Down|Up|Right|WordForward|WordBackward|ToLineStart|ToLineEnd|InnerWord)$/.exec(
      action,
    );
  if (!match) return { en: action, 'zh-CN': action };
  const operation = OPERATION_LABELS[match[1] as keyof typeof OPERATION_LABELS];
  const motion = MOTION_LABELS[match[2] as keyof typeof MOTION_LABELS];
  return {
    en: 'Note: ' + operation.en + ' ' + motion.en,
    'zh-CN': '笔记：' + operation['zh-CN'] + motion['zh-CN'],
  };
}

export const NOTE_ACTION_LABELS = Object.freeze(
  Object.fromEntries(NOTE_ACTION_IDS.map((action) => [action, labelFor(action)])),
) as Readonly<Record<NoteActionId, LocalizedActionLabel>>;

export function isNoteActionId(value: unknown): value is NoteActionId {
  return typeof value === 'string' && value in NOTE_COMMAND_BY_ACTION;
}
