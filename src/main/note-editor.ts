import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import type { MainWindowSession, NoteMode } from './session';
import { KEY_GUIDE_CONFIG } from '../input/key-guide-config';
import { focusDirectionForAction, type ActionId } from '../input/actions';
import { NOTE_COMMAND_BY_ACTION, isNoteActionId } from '../input/note-actions';
import { bindingsForMode, type BindingMap, type Mode } from '../input/bindings';
import {
  advanceInput,
  backspaceLeaderInput,
  cancelLeaderInput,
  resolveInputTimeout,
} from '../input/engine';
import { isLeaderPrefix } from '../input/key-guide';
import { keyString } from '../input/keys';
import { MainNavigation } from './navigation';
import { copyToClipboard } from '../platform/clipboard';
import { asElement } from '../platform/dom';
import {
  activeContextEditorWindow,
  mainReaderForTab,
  mainTabList,
  selectedMainTabID,
} from './host';

export type NoteBindingMode = Extract<Mode, 'note-normal' | 'note-insert'>;
export type NoteExternalExecute = (
  action: ActionId,
  count: number,
  target: HTMLElement,
  bindingMode: NoteBindingMode,
  bindings: BindingMap,
) => boolean | void;

interface LeaderGuideHost {
  refresh(window: MainWindow, session: MainWindowSession): void;
  clear(window: MainWindow, session: MainWindowSession): void;
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

function editable(target: EventTarget | null): HTMLElement | null {
  let node = asElement(target);
  while (node) {
    if ((node as HTMLElement).isContentEditable || textControl(node)) return node as HTMLElement;
    node = node.parentElement;
  }
  return null;
}

function bindingMode(mode: NoteMode): NoteBindingMode {
  return mode === 'insert' ? 'note-insert' : 'note-normal';
}

export class NoteEditor {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;
  readonly #bindings: () => BindingMap;
  readonly #leaderGuide: LeaderGuideHost;

  constructor(
    logger: Logger,
    navigation: MainNavigation,
    bindings: () => BindingMap,
    leaderGuide: LeaderGuideHost,
  ) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#bindings = bindings;
    this.#leaderGuide = leaderGuide;
  }

  isStandalone(window: MainWindow): boolean {
    const selected = selectedMainTabID(window);
    const entry = mainTabList(window).find((value) => value.id === selected);
    const value = (
      String(entry?.id ?? '') +
      ' ' +
      String(entry?.type ?? '') +
      ' ' +
      String(entry?.title ?? '') +
      ' ' +
      String(entry?.label ?? '')
    ).toLowerCase();
    return /\bnote/.test(value) && !/\b(reader|pdf)\b/.test(value);
  }

  sync(
    main: MainWindow,
    session: MainWindowSession,
    enabled: boolean,
    execute: NoteExternalExecute = () => true,
  ): void {
    if (!enabled) {
      this.clear(session);
      return;
    }
    const candidate = this.find(main);
    if (candidate === session.note.editorWindow) return;
    this.clear(session);
    if (!candidate) return;
    const handler: EventListener = (event) =>
      this.onKeyDown(event as KeyboardEvent, main, session, execute);
    candidate.addEventListener('keydown', handler, true);
    candidate.document.addEventListener('keydown', handler, true);
    session.note.editorWindow = candidate;
    session.note.editorDocument = candidate.document;
    session.note.handler = handler;
    this.style(candidate.document, session.note.mode);
  }

  clear(session: MainWindowSession): void {
    const { editorWindow, editorDocument, handler, timer } = session.note;
    if (editorWindow && handler) editorWindow.removeEventListener('keydown', handler, true);
    if (editorDocument && handler) editorDocument.removeEventListener('keydown', handler, true);
    clearTimeout(timer);
    session.note.editorWindow = null;
    session.note.editorDocument = null;
    session.note.handler = null;
    session.note.buffer = '';
    session.note.count = '';
    session.note.timer = undefined;
    session.note.inputRevision += 1;
    this.#leaderGuide.clear(session.window, session);
  }

  activeBindings(session: MainWindowSession): {
    mode: NoteBindingMode;
    bindings: BindingMap;
  } {
    const mode = bindingMode(session.note.mode);
    return { mode, bindings: bindingsForMode(this.#bindings(), mode) };
  }

  onKeyDown(
    event: KeyboardEvent,
    main: MainWindow,
    session: MainWindowSession,
    execute: NoteExternalExecute,
  ): void {
    const el = editable(event.target);
    if (!el) return;
    const key = keyString(event);
    if (!key) return;

    const active = this.activeBindings(session);
    const state = {
      mode: active.mode,
      keyBuffer: session.note.buffer,
      countBuffer: session.note.count,
    };

    if (key === 'escape') {
      const cancelled = cancelLeaderInput(state);
      if (cancelled) {
        this.applyState(session, cancelled);
        this.invalidate(main, session);
        this.#leaderGuide.clear(main, session);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    if (key === 'backspace') {
      const backed = backspaceLeaderInput(state);
      if (backed) {
        this.applyState(session, backed);
        this.invalidate(main, session);
        this.refreshGuide(main, session);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    session.note.inputRevision += 1;
    const revision = session.note.inputRevision;
    clearTimeout(session.note.timer);
    session.note.timer = undefined;

    const decision = advanceInput(
      {
        ...state,
        bindings: active.bindings,
        allowCountPrefix: active.mode === 'note-normal',
      },
      key,
    );
    this.applyState(session, decision.state);

    if (decision.kind === 'pass') {
      this.refreshGuide(main, session);
      return;
    }

    if (decision.kind === 'execute') {
      const count = decision.action === 'openCommandPalette' ? 0 : decision.count;
      const local = this.executeAction(decision.action, el, main, session, count);
      const external =
        local === null ? execute(decision.action, count, el, active.mode, active.bindings) : local;
      if (external !== false) {
        event.preventDefault();
        event.stopPropagation();
      }
      this.refreshGuide(main, session);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.refreshGuide(main, session);
    const timeoutMs = isLeaderPrefix(decision.state.keyBuffer)
      ? KEY_GUIDE_CONFIG.idleTimeoutMs
      : decision.timeoutMs;
    if (timeoutMs !== null) {
      session.note.timer = main.setTimeout(() => {
        if (session.note.inputRevision !== revision) return;
        const resolved = resolveInputTimeout(decision);
        this.applyState(session, resolved.state);
        session.note.timer = undefined;
        this.#leaderGuide.clear(main, session);
        if (resolved.kind !== 'execute') return;
        const count = resolved.action === 'openCommandPalette' ? 0 : resolved.count;
        const local = this.executeAction(resolved.action, el, main, session, count);
        if (local === null) execute(resolved.action, count, el, active.mode, active.bindings);
      }, timeoutMs);
    }
  }

  executeAction(
    action: ActionId,
    el: HTMLElement,
    main: MainWindow,
    session: MainWindowSession,
    count: number,
  ): boolean | null {
    const direction = focusDirectionForAction(action);
    if (direction) {
      return (
        (direction === 'left' && this.focusReader(main)) ||
        this.#navigation.focusDirection(main, session, direction)
      );
    }

    if (action === 'exitMode') {
      const changed = session.note.mode !== 'normal';
      session.note.mode = 'normal';
      this.resetInput(main, session);
      this.style(el.ownerDocument, 'normal');
      if (changed) this.#navigation.status(session, '-- NOTE NORMAL --', 900);
      return true;
    }

    if (action === 'enterInsert') {
      session.note.mode = 'insert';
      this.resetInput(main, session);
      this.style(el.ownerDocument, 'insert');
      this.#navigation.status(session, '-- NOTE INSERT --', 900);
      return true;
    }

    if (!isNoteActionId(action)) return null;

    const handled = this.command(el, NOTE_COMMAND_BY_ACTION[action], count || 1, session);
    if (handled) this.style(el.ownerDocument, session.note.mode);
    return handled;
  }

  private applyState(
    session: MainWindowSession,
    state: { readonly keyBuffer: string; readonly countBuffer: string },
  ): void {
    session.note.buffer = state.keyBuffer;
    session.note.count = state.countBuffer;
  }

  private invalidate(main: MainWindow, session: MainWindowSession): void {
    session.note.inputRevision += 1;
    clearTimeout(session.note.timer);
    session.note.timer = undefined;
    if (!session.note.buffer) this.#leaderGuide.clear(main, session);
  }

  private resetInput(main: MainWindow, session: MainWindowSession): void {
    session.note.buffer = '';
    session.note.count = '';
    this.invalidate(main, session);
  }

  private refreshGuide(main: MainWindow, session: MainWindowSession): void {
    if (isLeaderPrefix(session.note.buffer)) this.#leaderGuide.refresh(main, session);
    else this.#leaderGuide.clear(main, session);
  }

  private command(
    el: HTMLElement,
    command: string,
    count: number,
    session: MainWindowSession,
  ): boolean {
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
        session.note.yank = text;
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
      session.note.mode = 'insert';
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
      session.note.mode = 'insert';
      return true;
    }
    if (command === 'u' || command === 'ctrl+r')
      return doc.execCommand(command === 'u' ? 'undo' : 'redo');
    if (command === 'p' || command === 'P')
      return this.insert(el, session.note.yank, command === 'P');
    if (command === 'dd' || command === 'yy') {
      selection.modify('move', 'backward', 'lineboundary');
      selection.modify('extend', 'forward', 'lineboundary');
      const text = selection.toString();
      if (!text) return false;
      session.note.yank = text;
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
      session.note.yank = text;
      if (operator === 'y') {
        copyToClipboard(text);
        selection.collapseToStart();
      } else {
        selection.deleteFromDocument();
        if (operator === 'c') session.note.mode = 'insert';
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

  private find(main: MainWindow): Window | null {
    const focused = Services.focus?.focusedWindow;
    if (this.likely(focused as unknown as Window | null, main)) return focused as unknown as Window;
    for (const frame of Array.from(main.document.querySelectorAll('browser,iframe'))) {
      const candidate = (frame as HTMLIFrameElement).contentWindow;
      if (this.likely(candidate, main)) return candidate;
    }
    const editor = activeContextEditorWindow(main);
    return this.likely(editor, main) ? editor : null;
  }

  private likely(candidate: Window | null | undefined, main: MainWindow): candidate is Window {
    if (
      !candidate ||
      candidate === main ||
      (candidate as unknown as { PDFViewerApplication?: unknown }).PDFViewerApplication
    )
      return false;
    const doc = candidate.document;
    return !!(
      doc.body?.isContentEditable ||
      doc.querySelector('[contenteditable="true"],.ProseMirror,.editor-core,.editor') ||
      doc.designMode.toLowerCase() === 'on'
    );
  }

  private style(doc: Document, mode: NoteMode): void {
    let style = doc.getElementById('zv-note-caret-style');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'zv-note-caret-style';
      (doc.head ?? doc.documentElement).append(style);
    }
    style.textContent =
      'html.zv-note-normal-mode [contenteditable="true"],html.zv-note-normal-mode textarea,html.zv-note-normal-mode input{caret-color:rgb(96,150,255)!important}' +
      'html.zv-note-insert-mode [contenteditable="true"],html.zv-note-insert-mode textarea,html.zv-note-insert-mode input{caret-color:rgb(255,148,77)!important}';
    doc.documentElement.classList.toggle('zv-note-normal-mode', mode === 'normal');
    doc.documentElement.classList.toggle('zv-note-insert-mode', mode === 'insert');
  }

  private focusReader(main: MainWindow): boolean {
    try {
      const tabID = selectedMainTabID(main);
      const reader = tabID ? mainReaderForTab(tabID) : null;
      if (!reader?.focus) return false;
      void Promise.resolve(reader.focus()).catch((error) => {
        this.#logger.debug('focus reader error: ' + String(error));
      });
      return true;
    } catch (error) {
      this.#logger.debug('focus reader error: ' + String(error));
      return false;
    }
  }
}
