import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import type { MainWindowSession } from './session';
import { KEY_GUIDE_CONFIG } from '../input/key-guide-config';
import type { ActionId } from '../input/actions';
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

type Execute = (action: ActionId, count: number) => void;

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
export class NoteEditor {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;
  readonly #bindings: () => Readonly<Record<string, ActionId>>;
  readonly #leaderGuide: LeaderGuideHost;

  constructor(
    logger: Logger,
    navigation: MainNavigation,
    bindings: () => Readonly<Record<string, ActionId>>,
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
    const value =
      `${entry?.id ?? ''} ${entry?.type ?? ''} ${entry?.title ?? ''} ${entry?.label ?? ''}`.toLowerCase();
    return /\bnote/.test(value) && !/\b(reader|pdf)\b/.test(value);
  }
  sync(main: MainWindow, session: MainWindowSession, enabled: boolean): void {
    if (!enabled) {
      this.clear(session);
      return;
    }
    const candidate = this.find(main);
    if (candidate === session.note.editorWindow) return;
    this.clear(session);
    if (!candidate) return;
    const handler: EventListener = (event) =>
      this.onKeyDown(event as KeyboardEvent, main, session, () => {});
    candidate.addEventListener('keydown', handler, true);
    candidate.document.addEventListener('keydown', handler, true);
    session.note.editorWindow = candidate;
    session.note.editorDocument = candidate.document;
    session.note.handler = handler;
    this.style(candidate.document, session.note.mode);
  }
  clear(session: MainWindowSession): void {
    const { editorWindow, editorDocument, handler, timer, mainTimer } = session.note;
    if (editorWindow && handler) editorWindow.removeEventListener('keydown', handler, true);
    if (editorDocument && handler) editorDocument.removeEventListener('keydown', handler, true);
    clearTimeout(timer);
    clearTimeout(mainTimer);
    session.note.editorWindow = null;
    session.note.editorDocument = null;
    session.note.handler = null;
    session.note.buffer = '';
    session.note.mainBuffer = '';
    session.note.count = '';
    session.note.timer = undefined;
    session.note.mainTimer = undefined;
    session.note.mainRevision += 1;
    this.#leaderGuide.clear(session.window, session);
  }
  onKeyDown(
    event: KeyboardEvent,
    main: MainWindow,
    session: MainWindowSession,
    execute: Execute,
  ): void {
    const el = editable(event.target);
    if (!el) return;
    const key = keyString(event);
    if (!key) return;
    const direction =
      key === 'ctrl+h'
        ? 'left'
        : key === 'ctrl+j'
          ? 'down'
          : key === 'ctrl+k'
            ? 'up'
            : key === 'ctrl+l'
              ? 'right'
              : null;
    if (direction) {
      const focused =
        (direction === 'left' && this.focusReader(main)) ||
        this.#navigation.focusDirection(main, session, direction);
      if (focused) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (session.note.mode === 'insert') {
      if (key === 'escape') {
        event.preventDefault();
        event.stopPropagation();
        session.note.mode = 'normal';
        this.style(el.ownerDocument, 'normal');
        this.#navigation.status(session, '-- NOTE NORMAL --', 900);
      }
      return;
    }
    if (session.note.mainBuffer) {
      const mainState = {
        mode: 'main' as const,
        keyBuffer: session.note.mainBuffer,
        countBuffer: '',
      };
      if (key === 'escape') {
        const cancelled = cancelLeaderInput(mainState);
        if (cancelled) session.note.mainBuffer = cancelled.keyBuffer;
        this.clearMainInput(main, session);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (key === 'backspace') {
        const backed = backspaceLeaderInput(mainState);
        if (backed) {
          session.note.mainBuffer = backed.keyBuffer;
          this.invalidateMainInput(main, session);
          if (session.note.mainBuffer) this.#leaderGuide.refresh(main, session);
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    }
    // Note-local text input starts the ordinary grammar; only Space, colon, idle H/L, or an active
    // canonical sequence may enter main-command matching. Colon is reserved for the palette even
    // after a count, but the palette always receives the uncounted action default.
    const commandPaletteShortcut = key === ':' && !session.note.buffer;
    const mainShortcut =
      ((key === 'H' || key === 'L') && !session.note.buffer && !session.note.count) ||
      commandPaletteShortcut;
    if (commandPaletteShortcut) session.note.count = '';
    if (session.note.mainBuffer || key === ' ' || mainShortcut) {
      if (this.mainBinding(key, main, session, execute)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (key === 'escape') {
      event.preventDefault();
      event.stopPropagation();
      this.reset(session);
      this.#leaderGuide.clear(main, session);
      return;
    }
    if (key === 'i') {
      event.preventDefault();
      event.stopPropagation();
      session.note.mode = 'insert';
      this.style(el.ownerDocument, 'insert');
      this.#navigation.status(session, '-- NOTE INSERT --', 900);
      this.#leaderGuide.clear(main, session);
      return;
    }
    if (/^\d$/.test(key) && (key !== '0' || session.note.count)) {
      session.note.count += key;
      this.arm(main, session);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const command = session.note.buffer + key;
    const pending = ['g', 'd', 'y', 'c', 'di', 'yi', 'ci'].includes(command);
    if (pending) {
      session.note.buffer = command;
      this.arm(main, session);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const count = Number.parseInt(session.note.count, 10) || 1;
    session.note.buffer = '';
    session.note.count = '';
    const handled = this.command(el, command, count, session);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
      this.style(el.ownerDocument, session.note.mode);
    }
  }

  private mainBinding(
    key: string,
    main: MainWindow,
    session: MainWindowSession,
    execute: Execute,
  ): boolean {
    session.note.mainRevision += 1;
    const revision = session.note.mainRevision;
    clearTimeout(session.note.mainTimer);
    session.note.mainTimer = undefined;
    const decision = advanceInput(
      {
        mode: 'main',
        keyBuffer: session.note.mainBuffer,
        countBuffer: '',
        bindings: this.#bindings(),
        allowCountPrefix: false,
      },
      key,
    );
    session.note.mainBuffer = decision.state.keyBuffer;
    if (decision.kind === 'pass') {
      this.clearMainInput(main, session);
      return false;
    }
    if (decision.kind === 'execute') {
      this.clearMainInput(main, session);
      execute(decision.action, decision.count);
      return true;
    }
    if (isLeaderPrefix(decision.state.keyBuffer)) this.#leaderGuide.refresh(main, session);
    else this.#leaderGuide.clear(main, session);
    const timeoutMs = isLeaderPrefix(decision.state.keyBuffer)
      ? KEY_GUIDE_CONFIG.idleTimeoutMs
      : decision.timeoutMs;
    if (timeoutMs !== null) {
      session.note.mainTimer = main.setTimeout(() => {
        if (session.note.mainRevision !== revision) return;
        const resolved = resolveInputTimeout(decision);
        session.note.mainBuffer = resolved.state.keyBuffer;
        session.note.mainTimer = undefined;
        this.#leaderGuide.clear(main, session);
        if (resolved.kind === 'execute') execute(resolved.action, resolved.count);
      }, timeoutMs);
    }
    return true;
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
        input.value = `${input.value.slice(0, at)}\n${input.value.slice(at)}`;
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
      input.value = `${input.value.slice(0, at)}${text}${input.value.slice(at)}`;
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
  private style(doc: Document, mode: 'normal' | 'insert'): void {
    let style = doc.getElementById('zv-note-caret-style');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'zv-note-caret-style';
      (doc.head ?? doc.documentElement).append(style);
    }
    style.textContent = `html.zv-note-normal-mode [contenteditable="true"],html.zv-note-normal-mode textarea,html.zv-note-normal-mode input{caret-color:rgb(96,150,255)!important}html.zv-note-insert-mode [contenteditable="true"],html.zv-note-insert-mode textarea,html.zv-note-insert-mode input{caret-color:rgb(255,148,77)!important}`;
    doc.documentElement.classList.toggle('zv-note-normal-mode', mode === 'normal');
    doc.documentElement.classList.toggle('zv-note-insert-mode', mode === 'insert');
  }
  private arm(main: MainWindow, session: MainWindowSession): void {
    clearTimeout(session.note.timer);
    session.note.timer = main.setTimeout(() => this.reset(session), 1200);
  }

  private reset(session: MainWindowSession): void {
    session.note.buffer = '';
    session.note.count = '';
    clearTimeout(session.note.timer);
    session.note.timer = undefined;
  }

  private invalidateMainInput(main: MainWindow, session: MainWindowSession): void {
    session.note.mainRevision += 1;
    clearTimeout(session.note.mainTimer);
    session.note.mainTimer = undefined;
    if (!session.note.mainBuffer) this.#leaderGuide.clear(main, session);
  }

  private clearMainInput(main: MainWindow, session: MainWindowSession): void {
    this.invalidateMainInput(main, session);
    session.note.mainBuffer = '';
    this.#leaderGuide.clear(main, session);
  }
  private focusReader(main: MainWindow): boolean {
    try {
      const tabID = selectedMainTabID(main);
      const reader = tabID ? mainReaderForTab(tabID) : null;
      if (!reader?.focus) return false;
      void Promise.resolve(reader.focus()).catch((error) => {
        this.#logger.debug(`focus reader error: ${String(error)}`);
      });
      return true;
    } catch (error) {
      this.#logger.debug(`focus reader error: ${String(error)}`);
      return false;
    }
  }
}
