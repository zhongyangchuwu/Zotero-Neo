import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import { CleanupFailure } from '../core/cleanup';
import type { MainWindowSession } from './session';
import type { NoteEditingPort, NoteMode } from '../modules/notes/editor';
import { KEY_GUIDE_CONFIG, keyGuideTimeout } from '../input/key-guide-config';
import { focusDirectionForAction, type ActionId } from '../input/actions';
import { bindingsForMode, type BindingMap, type BindingContext } from '../input/bindings';
import { compositionOwnsKey } from '../input/composition';
import { keyString } from '../input/keys';
import { MainNavigation } from './navigation';
import { isDeadObject } from '../platform/cross-compartment';
import { asElement } from '../platform/dom';
import {
  mainNoteEditorWindow,
  mainNoteItemID,
  mainReaderForTab,
  selectedMainTabSnapshot,
  selectedMainTabID,
} from '../toolkit/main';

export type NoteBindingMode = Extract<BindingContext, 'note-normal' | 'note-insert'>;
export type NoteExternalExecute = (
  action: ActionId,
  count: number,
  target: HTMLElement,
  bindingMode: NoteBindingMode,
  bindings: BindingMap,
) => boolean | void;

interface PrefixGuideHost {
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
  readonly #bindings: (session: MainWindowSession) => BindingMap;
  readonly #prefixGuide: PrefixGuideHost;
  readonly #editing: (session: MainWindowSession) => NoteEditingPort | null;
  readonly #isOwner: (session: MainWindowSession) => boolean;

  constructor(
    logger: Logger,
    navigation: MainNavigation,
    bindings: (session: MainWindowSession) => BindingMap,
    leaderGuide: PrefixGuideHost,
    editing: (session: MainWindowSession) => NoteEditingPort | null,
    isOwner: (session: MainWindowSession) => boolean,
  ) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#bindings = bindings;
    this.#prefixGuide = leaderGuide;
    this.#editing = editing;
    this.#isOwner = isOwner;
  }

  isStandalone(window: MainWindow): boolean {
    const entry = selectedMainTabSnapshot(window);
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
    const candidate = mainNoteEditorWindow(main);
    const document = candidate?.document ?? null;
    const itemID = mainNoteItemID(main, candidate);
    if (
      candidate === session.note.editorWindow &&
      document === session.note.editorDocument &&
      itemID === session.note.itemID
    )
      return;
    this.clear(session);
    if (session.note.editorWindow || session.note.handler) return;
    if (!candidate || !document) return;
    session.note.revision += 1;
    const handler: EventListener = (event) => {
      if (!current()) return;
      this.onKeyDown(event as KeyboardEvent, main, session, execute);
    };
    session.note.editorWindow = candidate;
    session.note.editorDocument = document;
    session.note.handler = handler;
    session.note.itemID = itemID;
    const current = this.captureCurrent(session);
    try {
      candidate.addEventListener('keydown', handler, true);
      if (!current()) {
        if (session.note.handler === handler) this.clear(session);
        else candidate.removeEventListener('keydown', handler, true);
        return;
      }
      document.addEventListener('keydown', handler, true);
      if (!current()) {
        if (session.note.handler === handler) this.clear(session);
        else {
          const failure = new CleanupFailure();
          failure.run(() => candidate.removeEventListener('keydown', handler, true));
          failure.run(() => document.removeEventListener('keydown', handler, true));
          failure.rethrow();
        }
        return;
      }
      this.#editing(session)?.style(document);
    } catch (error) {
      try {
        if (session.note.handler === handler) this.clear(session);
        else {
          const failure = new CleanupFailure();
          failure.run(() => candidate.removeEventListener('keydown', handler, true));
          failure.run(() => document.removeEventListener('keydown', handler, true));
          failure.rethrow();
        }
      } catch {
        /* Preserve the original attachment failure. */
      }
      throw error;
    }
  }

  captureCurrent(session: MainWindowSession): () => boolean {
    const { editorWindow, editorDocument, handler, itemID, revision } = session.note;
    return () =>
      !!editorWindow &&
      !!editorDocument &&
      !!handler &&
      this.#isOwner(session) &&
      session.note.revision === revision &&
      session.note.editorWindow === editorWindow &&
      session.note.editorDocument === editorDocument &&
      session.note.handler === handler &&
      session.note.itemID === itemID &&
      !isDeadObject(editorWindow) &&
      editorWindow.document === editorDocument &&
      mainNoteItemID(session.window, editorWindow) === itemID &&
      mainNoteEditorWindow(session.window) === editorWindow;
  }

  clear(session: MainWindowSession): void {
    const { editorWindow, editorDocument, handler } = session.note;
    const editing = this.#editing(session);
    session.note.revision += 1;
    const revision = session.note.revision;
    session.note.editorWindow = null;
    session.note.editorDocument = null;
    session.note.handler = null;
    const failure = new CleanupFailure();
    failure.run(() => session.note.resetInteraction());
    if (editing && session.note.revision === revision) failure.run(() => editing.clear());
    if (editorWindow && handler && !isDeadObject(editorWindow))
      failure.run(() => editorWindow.removeEventListener('keydown', handler, true));
    if (editorDocument && handler && !isDeadObject(editorDocument))
      failure.run(() => editorDocument.removeEventListener('keydown', handler, true));
    if (session.note.revision === revision)
      failure.run(() => this.#prefixGuide.clear(session.window, session));
    failure.rethrow();
  }

  deactivateInteraction(main: MainWindow, session: MainWindowSession): void {
    const hasPendingInput =
      session.note.input.keyBuffer !== '' || session.note.input.countBuffer !== '';
    const failure = new CleanupFailure();
    failure.run(() => session.note.deactivateInteraction());
    failure.run(() => this.#editing(session)?.deactivate());
    if (hasPendingInput) failure.run(() => this.#prefixGuide.clear(main, session));
    failure.rethrow();
  }

  activeBindings(session: MainWindowSession): {
    mode: NoteBindingMode;
    bindings: BindingMap;
  } {
    const mode = bindingMode(this.#editing(session)?.mode ?? 'normal');
    return { mode, bindings: bindingsForMode(this.#bindings(session), mode) };
  }

  onKeyDown(
    event: KeyboardEvent,
    main: MainWindow,
    session: MainWindowSession,
    execute: NoteExternalExecute,
  ): void {
    const el = editable(event.target);
    if (!el || compositionOwnsKey(event, false)) return;
    const key = keyString(event);
    if (!key) return;

    const active = this.activeBindings(session);
    const input = session.note.input;
    if (key === 'escape' && input.cancel(active.mode)) {
      this.#prefixGuide.clear(main, session);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (key === 'backspace' && input.backspace(active.mode)) {
      this.refreshGuide(main, session);
      if (input.keyBuffer) {
        input.scheduleReset(KEY_GUIDE_CONFIG.idleTimeoutMs, () =>
          this.#prefixGuide.clear(main, session),
        );
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const decision = input.advance(
      active.mode,
      active.bindings,
      key,
      active.mode === 'note-normal',
    );

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
    const timeoutMs = keyGuideTimeout(decision);
    if (timeoutMs !== null) {
      const current = this.captureCurrent(session);
      input.schedule(decision, timeoutMs, (resolved) => {
        if (!current()) return;
        this.#prefixGuide.clear(main, session);
        if (resolved.kind !== 'execute') return;
        const count = resolved.action === 'openCommandPalette' ? 0 : resolved.count;
        const local = this.executeAction(resolved.action, el, main, session, count);
        if (local === null) execute(resolved.action, count, el, active.mode, active.bindings);
      });
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

    const editing = this.#editing(session);
    if (!editing) return null;
    const result = editing.executeAction(action, el, count);
    if (result !== null && (action === 'exitMode' || action === 'enterInsert'))
      this.resetInput(main, session);
    return result;
  }

  private resetInput(main: MainWindow, session: MainWindowSession): void {
    session.note.input.reset();
    this.#prefixGuide.clear(main, session);
  }

  private refreshGuide(main: MainWindow, session: MainWindowSession): void {
    this.#prefixGuide.refresh(main, session);
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
