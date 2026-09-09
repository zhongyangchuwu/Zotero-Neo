import type {
  MainWindowControllerApi,
  MainWindowControllerDependencies,
  MainWindow,
} from '../core/contracts';
import type { ActionId } from '../input/actions';
import { resolveBindings } from '../input/bindings';
import { advanceInput, resolveInputTimeout } from '../input/engine';
import { isEditableElement } from '../platform/dom';
import { MainWindowSession } from './session';
import { MainNavigation } from './navigation';
import { FuzzyPicker } from './picker';
import { NotesLayout } from './notes-layout';
import { NoteEditor } from './note-editor';

type KeyboardEventWithHandled = KeyboardEvent & {
  _zvMainHandled?: boolean;
  _zvPickerHandled?: boolean;
};
const NAVIGATION_REPEAT_INTERVAL_MS = 80;

function keyString(event: KeyboardEvent): string {
  const key = event.key === ' ' ? ' ' : event.key.toLowerCase();
  if (!key) return '';
  const modifier = event.ctrlKey || event.metaKey ? 'ctrl+' : event.altKey ? 'alt+' : '';
  return modifier
    ? `${modifier}${key}`
    : event.key.length === 1 && event.shiftKey
      ? event.key
      : key;
}

export class MainWindowController implements MainWindowControllerApi {
  readonly #dependencies: MainWindowControllerDependencies;
  readonly #sessions = new Map<MainWindow, MainWindowSession>();
  readonly #navigation: MainNavigation;
  readonly #picker: FuzzyPicker;
  readonly #notes: NotesLayout;
  readonly #noteEditor: NoteEditor;

  constructor(dependencies: MainWindowControllerDependencies) {
    this.#dependencies = dependencies;
    this.#navigation = new MainNavigation(dependencies.logger, (window) => this.rescan(window));
    this.#picker = new FuzzyPicker(dependencies.logger, this.#navigation);
    this.#notes = new NotesLayout(dependencies.logger, this.#navigation);
    this.#noteEditor = new NoteEditor(dependencies.logger, this.#navigation, () => this.bindings());
  }

  addWindow(window: MainWindow): void {
    if (this.#sessions.has(window)) return;
    const session = new MainWindowSession(window, this.#dependencies.preferences);
    this.#sessions.set(window, session);
    const scan = (): void => {
      this.rescan(window);
      this.#noteEditor.sync(
        window,
        session,
        this.#dependencies.preferences.get('noteEditor.enabled', true),
      );
    };
    scan();
    const interval = window.setInterval(scan, 1000);
    session.cleanup.add(() => window.clearInterval(interval));
    for (let count = 1; count <= 4; count += 1) {
      const timer = window.setTimeout(scan, count * 250);
      session.cleanup.add(() => window.clearTimeout(timer));
    }
    const keydown: EventListener = (event) =>
      this.onKeyDown(event as KeyboardEventWithHandled, window, session);
    const pickerKeydown: EventListener = (event) => {
      if (session.picker.open)
        this.#picker.onKeyDown(event as KeyboardEventWithHandled, window, session);
    };
    session.cleanup.addEventListener(window.document, 'keydown', keydown, true);
    session.cleanup.addEventListener(window, 'keydown', pickerKeydown, true);
    session.cleanup.add(() => {
      this.#picker.close(session);
      this.#notes.close(session);
      this.#noteEditor.clear(session);
    });
  }

  removeWindow(window: MainWindow): void {
    const session = this.#sessions.get(window);
    if (!session) return;
    this.#sessions.delete(window);
    session.dispose();
  }

  shutdown(): void {
    for (const window of [...this.#sessions.keys()]) this.removeWindow(window);
  }

  executeFromReader(action: ActionId, count: number): void {
    const first = this.#sessions.entries().next().value as
      | [MainWindow, MainWindowSession]
      | undefined;
    if (first) this.execute(action, first[0], first[1], count);
  }

  private bindings() {
    return resolveBindings(this.#dependencies.preferences.get('bindings', ''));
  }
  private rescan = (window: MainWindow): void => this.#dependencies.reader.rescan(window);

  private onKeyDown(
    event: KeyboardEventWithHandled,
    window: MainWindow,
    session: MainWindowSession,
  ): void {
    if (event._zvMainHandled) return;
    event._zvMainHandled = true;
    if (session.picker.open) {
      this.#picker.onKeyDown(event, window, session);
      return;
    }
    if (session.notes.open) {
      this.#notes.onKeyDown(event, window, session);
      return;
    }
    if (
      this.#dependencies.preferences.get('noteEditor.enabled', true) &&
      this.#noteEditor.isStandalone(window)
    ) {
      this.#noteEditor.onKeyDown(event, window, session, (action, count) =>
        this.execute(action, window, session, count),
      );
      return;
    }
    const active = window.document.activeElement;
    if (isEditableElement(active)) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        (active as HTMLElement).blur();
      }
      return;
    }
    const tabID = (window as unknown as { Zotero_Tabs?: { selectedID?: string } }).Zotero_Tabs
      ?.selectedID;
    if (active?.localName === 'browser' || (tabID && this.isReaderTab(tabID))) {
      this.#dependencies.reader.forwardKey(event, window);
      return;
    }
    const key = keyString(event);
    if (!key) return;
    const bindings = this.bindings();
    const direct = bindings[`main:${key}`];
    if (direct === 'mainPrevTab' || direct === 'mainNextTab') {
      event.preventDefault();
      event.stopPropagation();
      this.execute(direct, window, session, 1);
      return;
    }
    const decision = advanceInput(
      { mode: 'main', keyBuffer: session.keyBuffer, countBuffer: session.countBuffer },
      key,
      bindings,
      { allowCountPrefix: true },
    );
    if (decision.kind === 'pass') {
      session.keyBuffer = decision.state.keyBuffer;
      session.countBuffer = decision.state.countBuffer;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    session.keyBuffer = decision.state.keyBuffer;
    session.countBuffer = decision.state.countBuffer;
    window.clearTimeout(session.keyTimer);
    session.keyTimer = undefined;
    if (decision.kind === 'execute') {
      if (this.acceptNavigationRepeat(decision.action, event, session)) {
        this.execute(decision.action, window, session, decision.count);
      }
      return;
    }
    if (decision.timeoutMs !== null) {
      session.keyTimer = window.setTimeout(() => {
        const resolved = resolveInputTimeout(decision);
        session.keyBuffer = resolved.state.keyBuffer;
        session.countBuffer = resolved.state.countBuffer;
        session.keyTimer = undefined;
        if (resolved.kind === 'execute')
          this.execute(resolved.action, window, session, resolved.count);
      }, decision.timeoutMs);
    }
  }

  private acceptNavigationRepeat(
    action: ActionId,
    event: KeyboardEvent,
    session: MainWindowSession,
  ): boolean {
    if (action !== 'mainNavDown' && action !== 'mainNavUp') return true;
    const now = Date.now();
    if (
      event.repeat &&
      session.navigationRepeatAction === action &&
      now - session.navigationRepeatAt < NAVIGATION_REPEAT_INTERVAL_MS
    ) {
      return false;
    }
    session.navigationRepeatAction = action;
    session.navigationRepeatAt = now;
    return true;
  }

  private isReaderTab(tabID: string): boolean {
    try {
      return !!Zotero.Reader.getByTabID?.(tabID);
    } catch {
      return false;
    }
  }

  private execute(
    action: ActionId,
    window: MainWindow,
    session: MainWindowSession,
    count: number,
  ): void {
    switch (action) {
      case 'mainFuzzyAll':
        void this.#picker.open(window, session, 'all');
        break;
      case 'mainFuzzyCollection':
        void this.#picker.open(window, session, 'collection');
        break;
      case 'mainTabPick':
        void this.#picker.open(window, session, 'tabs');
        break;
      case 'mainNotesLayout':
        void this.#notes.toggle(window, session);
        break;
      case 'mainFocusTree':
      case 'mainFocusLeft':
        this.#navigation.focusPanel(window, session, 'collections');
        break;
      case 'mainFocusItems':
      case 'mainFocusRight':
        this.#navigation.focusPanel(window, session, 'items');
        break;
      case 'mainYankCitekey':
        this.#navigation.yankCitekey(window, session);
        break;
      case 'mainOpenPDF':
        void this.#navigation.openPDF(window, session);
        break;
      case 'mainActivate':
        void this.#navigation.activate(window, session);
        break;
      case 'mainClosePDF':
        this.#navigation.closePDF(window);
        break;
      case 'mainPrevTab':
        this.#navigation.cycleTab(window, -1);
        break;
      case 'mainNextTab':
        this.#navigation.cycleTab(window, 1);
        break;
      case 'mainFocusSearch':
        this.#navigation.focusSearch(window);
        break;
      case 'mainNavDown':
        this.#navigation.navigate(window, session, 1, count);
        break;
      case 'mainNavUp':
        this.#navigation.navigate(window, session, -1, count);
        break;
      case 'mainNavFirst':
        this.#navigation.navigate(window, session, 'first', count);
        break;
      case 'mainNavLast':
        this.#navigation.navigate(window, session, 'last', count);
        break;
      case 'mainTreeToggle':
        void this.#navigation.toggleTree(window, session);
        break;
      case 'mainTreeOpenOnly':
        void this.#navigation.openTree(window, session);
        break;
      case 'mainTreeCloseOnly':
        void this.#navigation.closeTree(window, session);
        break;
      case 'mainTreeExpand':
        this.#navigation.expandTree(window, session);
        break;
      case 'mainTreeCollapse':
        this.#navigation.collapseTree(window, session);
        break;
      case 'mainTreeParent':
        this.#navigation.parentTree(window, session);
        break;
      case 'mainTreeExpandAll':
        this.#navigation.expandAll(window, session);
        break;
      case 'mainTreeCollapseAll':
        this.#navigation.collapseAll(window, session);
        break;
      default:
        this.#dependencies.logger.debug(`Unknown main action: ${action}`);
    }
  }
}

export function createMainWindowController(
  dependencies: MainWindowControllerDependencies,
): MainWindowControllerApi {
  return new MainWindowController(dependencies);
}
