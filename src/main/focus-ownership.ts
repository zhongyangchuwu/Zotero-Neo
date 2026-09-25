import type { MainWindow } from '../core/contracts';
import { CleanupScope } from '../core/cleanup';
import {
  focusMainItemsImmediately,
  mainEmptyQuickSearchFocused,
  mainQuickSearchFocusEvent,
  selectedMainTabID,
} from './host';
import type { MainWindowSession } from './session';

/** Claims only an application-startup Library Quick Search autofocus, never a reload's editor. */
export class MainFocusOwnership {
  readonly #window: MainWindow;
  readonly #session: MainWindowSession;
  readonly #mayClaimInitialLibraryFocus: boolean;
  readonly #scope = new CleanupScope();
  #armed = false;

  constructor(
    window: MainWindow,
    session: MainWindowSession,
    mayClaimInitialLibraryFocus: boolean,
  ) {
    this.#window = window;
    this.#session = session;
    this.#mayClaimInitialLibraryFocus = mayClaimInitialLibraryFocus;
  }

  start(): void {
    const doc = this.#window.document;
    if (!this.#mayClaimInitialLibraryFocus || selectedMainTabID(this.#window) !== 'zotero-pane')
      return;
    const preFocused = mainEmptyQuickSearchFocused(this.#window);
    const active = doc.activeElement;
    if (
      !preFocused &&
      active &&
      active !== doc.body &&
      active !== doc.documentElement &&
      active.localName !== 'window'
    )
      return;

    this.#armed = true;
    const cancel = (): void => this.dispose();
    const onFocus = (event: Event): void => {
      if (!this.#armed) return;
      if (
        selectedMainTabID(this.#window) !== 'zotero-pane' ||
        !mainQuickSearchFocusEvent(this.#window, event)
      ) {
        this.dispose();
        return;
      }
      if (!preFocused) this.#claim();
    };
    this.#scope.addEventListener(doc, 'focusin', onFocus, true);
    for (const type of ['pointerdown', 'keydown', 'beforeinput', 'input', 'compositionstart'])
      this.#scope.addEventListener(doc, type, cancel, true);
    // APP_STARTUP can attach after Zotero's 1ms select; defer only that
    // already-focused claim so direct input has an opportunity to veto it.
    // When native focus has not happened, retain the one-shot gate until an
    // observed focus, direct intent, or session cleanup settles ownership.
    if (preFocused) {
      const timer = this.#window.setTimeout(() => {
        if (!this.#armed) return;
        if (
          selectedMainTabID(this.#window) === 'zotero-pane' &&
          mainEmptyQuickSearchFocused(this.#window)
        )
          this.#claim();
        else this.dispose();
      }, 0);
      this.#scope.add(() => this.#window.clearTimeout(timer));
    }
  }

  #claim(): void {
    if (!this.#armed) return;
    this.dispose();
    if (focusMainItemsImmediately(this.#window)) this.#session.activePanel = 'items';
  }

  /** A semantic Neo search command is explicit intent even if no user event preceded it. */
  markQuickSearchIntent(): void {
    this.dispose();
  }

  dispose(): void {
    if (!this.#armed) return;
    this.#armed = false;
    this.#scope.dispose();
  }
}
