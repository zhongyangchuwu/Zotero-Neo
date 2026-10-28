import { CleanupFailure } from '../../core/cleanup';
import type { ActionId } from '../../input/actions';
import { NOTE_COMMAND_BY_ACTION, isNoteActionId } from '../../input/note-actions';
import { copyToClipboard } from '../../platform/clipboard';
import { isDeadObject } from '../../platform/cross-compartment';

export type NoteMode = 'normal' | 'insert';
export interface NoteEditingPort {
  readonly mode: NoteMode;
  executeAction(action: ActionId, target: HTMLElement, count: number): boolean | null;
  style(document: Document): void;
  deactivate(): void;
  clear(): void;
}

type TextControl = HTMLElement & {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
};

function textControl(element: Element): TextControl | null {
  const candidate = element as HTMLElement;
  return 'value' in candidate && 'selectionStart' in candidate && 'selectionEnd' in candidate
    ? (candidate as TextControl)
    : null;
}
const caretStyles = new WeakMap<Document, HTMLElement>();

export class NoteEditing implements NoteEditingPort {
  #mode: NoteMode = 'normal';
  #yank = '';
  #document: Document | null = null;
  #style: HTMLElement | null = null;
  readonly #host: { isCurrent(): boolean; status(message: string, milliseconds?: number): void };

  constructor(host: {
    isCurrent(): boolean;
    status(message: string, milliseconds?: number): void;
  }) {
    this.#host = host;
  }

  get mode(): NoteMode {
    return this.#mode;
  }

  executeAction(action: ActionId, el: HTMLElement, count: number): boolean | null {
    if (!this.#host.isCurrent()) return null;
    if (action === 'exitMode') {
      const changed = this.#mode !== 'normal';
      this.#mode = 'normal';
      this.style(el.ownerDocument);
      if (changed) this.#host.status('-- NOTE NORMAL --', 900);
      return true;
    }
    if (action === 'enterInsert') {
      this.#mode = 'insert';
      this.style(el.ownerDocument);
      this.#host.status('-- NOTE INSERT --', 900);
      return true;
    }
    if (!isNoteActionId(action)) return null;
    if (action === 'noteUndo' || action === 'noteRedo') {
      if (el.ownerDocument.execCommand(action === 'noteUndo' ? 'undo' : 'redo'))
        this.style(el.ownerDocument);
      return true;
    }
    const handled = this.command(el, NOTE_COMMAND_BY_ACTION[action], count || 1);
    if (handled) this.style(el.ownerDocument);
    return handled;
  }

  style(doc: Document): void {
    if (!this.#host.isCurrent()) return;
    if (this.#document !== doc || !this.#style) {
      this.releaseStyle();
      const style = doc.createElement('style');
      style.id = 'zv-note-caret-style';
      this.#document = doc;
      this.#style = style;
      caretStyles.set(doc, style);
      (doc.head ?? doc.documentElement).append(style);
    }
    const style = this.#style;
    if (
      !style ||
      this.#document !== doc ||
      caretStyles.get(doc) !== style ||
      !this.#host.isCurrent()
    )
      return;
    style.textContent =
      'html.zv-note-normal-mode [contenteditable="true"],html.zv-note-normal-mode textarea,html.zv-note-normal-mode input{caret-color:rgb(96,150,255)!important}' +
      'html.zv-note-insert-mode [contenteditable="true"],html.zv-note-insert-mode textarea,html.zv-note-insert-mode input{caret-color:rgb(255,148,77)!important}';
    doc.documentElement.classList.toggle('zv-note-normal-mode', this.#mode === 'normal');
    doc.documentElement.classList.toggle('zv-note-insert-mode', this.#mode === 'insert');
  }

  deactivate(): void {
    this.#mode = 'normal';
    if (this.#document) this.style(this.#document);
  }

  clear(): void {
    this.#mode = 'normal';
    this.#yank = '';
    this.releaseStyle();
  }

  private releaseStyle(): void {
    const doc = this.#document;
    const style = this.#style;
    this.#document = null;
    this.#style = null;
    if (!doc || !style || isDeadObject(doc)) return;
    const failure = new CleanupFailure();
    if (caretStyles.get(doc) === style) {
      caretStyles.delete(doc);
      failure.run(() =>
        doc.documentElement.classList.remove('zv-note-normal-mode', 'zv-note-insert-mode'),
      );
    }
    failure.run(() => style.remove());
    failure.rethrow();
  }

  private command(el: HTMLElement, command: string, count: number): boolean {
    const doc = el.ownerDocument;
    const selection = doc.getSelection();
    if (!selection) return false;
    const move: Record<string, [SelectionModifyAlteration, SelectionModifyDirection]> = {
      h: ['move', 'backward'],
      l: ['move', 'forward'],
      j: ['move', 'forward'],
      k: ['move', 'backward'],
      w: ['move', 'forward'],
      b: ['move', 'backward'],
      '0': ['move', 'backward'],
      $: ['move', 'forward'],
    };
    if (command in move) {
      for (let i = 0; i < count; i += 1)
        selection.modify(
          move[command][0],
          move[command][1],
          ['j', 'k'].includes(command)
            ? 'line'
            : ['0', '$'].includes(command)
              ? 'lineboundary'
              : command === 'w' || command === 'b'
                ? 'word'
                : 'character',
        );
      return true;
    }
    if (command === 'gg') {
      selection.selectAllChildren(el);
      selection.collapseToStart();
      return true;
    }
    if (command === 'G') {
      selection.selectAllChildren(el);
      selection.collapseToEnd();
      return true;
    }
    if (command === 'x') {
      for (let i = 0; i < count; i += 1) selection.modify('extend', 'forward', 'character');
      const text = selection.toString();
      if (text) {
        this.#yank = text;
        selection.deleteFromDocument();
      }
      return !!text;
    }
    if (command === 'a' || command === 'A' || command === 'I') {
      selection.modify(
        'move',
        command === 'I' ? 'backward' : 'forward',
        command === 'a' ? 'character' : 'lineboundary',
      );
      this.#mode = 'insert';
      return true;
    }
    if (command === 'o' || command === 'O') {
      const input = textControl(el);
      if (input) {
        const start = input.selectionStart ?? 0;
        const position =
          command === 'O'
            ? input.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
            : input.value.indexOf('\n', start);
        const at = position < 0 ? input.value.length : position;
        input.value = input.value.slice(0, at) + '\n' + input.value.slice(at);
        input.selectionStart = input.selectionEnd = command === 'O' ? at : at + 1;
      } else doc.execCommand('insertParagraph');
      this.#mode = 'insert';
      return true;
    }
    if (command === 'p' || command === 'P') return this.insert(el, this.#yank, command === 'P');
    if (command === 'dd' || command === 'yy') {
      selection.modify('move', 'backward', 'lineboundary');
      selection.modify('extend', 'forward', 'lineboundary');
      const text = selection.toString();
      if (!text) return false;
      this.#yank = text;
      if (command === 'yy') {
        copyToClipboard(text);
        selection.collapseToStart();
      } else selection.deleteFromDocument();
      return true;
    }
    const operation = /^([dyc])(iw|[hjklwb0$])$/.exec(command);
    if (operation) {
      const [, operator, motion] = operation;
      if (motion === 'iw') {
        selection.modify('move', 'backward', 'word');
        selection.modify('extend', 'forward', 'word');
      } else
        selection.modify(
          'extend',
          motion === 'h' || motion === 'k' || motion === 'b' || motion === '0'
            ? 'backward'
            : 'forward',
          motion === 'j' || motion === 'k'
            ? 'line'
            : motion === 'w' || motion === 'b'
              ? 'word'
              : motion === '0' || motion === '$'
                ? 'lineboundary'
                : 'character',
        );
      const text = selection.toString();
      if (!text) return false;
      this.#yank = text;
      if (operator === 'y') {
        copyToClipboard(text);
        selection.collapseToStart();
      } else {
        selection.deleteFromDocument();
        if (operator === 'c') this.#mode = 'insert';
      }
      return true;
    }
    return false;
  }

  private insert(el: HTMLElement, text: string, before: boolean): boolean {
    if (!text) return false;
    const input = textControl(el);
    if (input) {
      const at = (before ? input.selectionStart : input.selectionEnd) ?? 0;
      input.value = input.value.slice(0, at) + text + input.value.slice(at);
      input.selectionStart = input.selectionEnd = at + text.length;
      return true;
    }
    const selection = el.ownerDocument.getSelection();
    if (!selection?.rangeCount) return false;
    const range = selection.getRangeAt(0);
    range.insertNode(el.ownerDocument.createTextNode(text));
    return true;
  }
}
