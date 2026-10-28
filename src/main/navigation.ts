import type { Logger } from '../core/logging';
import type { MainWindow } from '../core/contracts';
import type { FocusDirection } from '../input/actions';
import { THEME_VARS } from '../ui/theme';
import type { MainPanel, MainWindowSession } from './session';
import {
  closeSelectedMainTab,
  cycleMainTab,
  focusMainPanel,
  focusMainDirection,
  mainFocusedPanel,
  mainTreeFocused,
  selectMainTab,
  selectedMainTabID,
} from '../toolkit/main';

export class MainNavigation {
  readonly #rescan: (window: MainWindow) => void;
  readonly #focusEpochs = new WeakMap<MainWindowSession, number>();
  constructor(_logger: Logger, rescan: (window: MainWindow) => void) {
    this.#rescan = rescan;
  }
  status(session: MainWindowSession, text: string, milliseconds = 2000): void {
    if (session.cleanup.disposed) return;
    const previousTimer = session.statusTimer;
    session.statusTimer = undefined;
    session.window.clearTimeout(previousTimer);
    session.status.textContent = text;
    session.status.style.display = 'block';
    const success = text.startsWith('✓');
    const info = text.startsWith('→') || text.startsWith('▶');
    session.status.style.color = success
      ? THEME_VARS.statusSuccessText
      : info
        ? THEME_VARS.statusInfoText
        : THEME_VARS.statusErrorText;
    session.status.style.background = success
      ? THEME_VARS.statusSuccess
      : info
        ? THEME_VARS.statusInfo
        : THEME_VARS.statusError;
    const timer = session.window.setTimeout(() => {
      if (session.cleanup.disposed || session.statusTimer !== timer) return;
      session.statusTimer = undefined;
      session.status.style.display = 'none';
    }, milliseconds);
    session.statusTimer = timer;
  }
  panel(window: MainWindow, session: MainWindowSession): MainPanel {
    const panel = mainFocusedPanel(window, session.activePanel);
    if (panel !== session.activePanel) this.#focusEpochs.set(session, this.focusEpoch(session) + 1);
    session.activePanel = panel;
    return session.activePanel;
  }
  focusPanel(window: MainWindow, session: MainWindowSession, panel: MainPanel): boolean {
    if (!focusMainPanel(window, panel)) return false;
    this.#focusEpochs.set(session, this.focusEpoch(session) + 1);
    session.activePanel = panel;
    return true;
  }

  /** Identifies a continuous panel visit, including explicit refocusing of the tree. */
  focusEpoch(session: MainWindowSession): number {
    return this.#focusEpochs.get(session) ?? 0;
  }

  /** Native mouse/input focus changes also delimit a continuous tree visit. */
  observeFocus(window: MainWindow, session: MainWindowSession): void {
    const panel = mainTreeFocused(window, 'collections')
      ? 'collections'
      : mainTreeFocused(window, 'items')
        ? 'items'
        : undefined;
    if (!panel || panel !== session.activePanel)
      this.#focusEpochs.set(session, this.focusEpoch(session) + 1);
    if (panel) session.activePanel = panel;
  }

  focusDirection(
    window: MainWindow,
    session: MainWindowSession,
    direction: FocusDirection,
  ): boolean {
    return focusMainDirection(window, direction, (panel) =>
      this.focusPanel(window, session, panel),
    );
  }
  closePDF(window: MainWindow): void {
    closeSelectedMainTab(window);
  }
  cycleTab(window: MainWindow, direction: 1 | -1): boolean {
    const selectedBefore = selectedMainTabID(window);
    cycleMainTab(window, direction);
    return this.finishTabSwitch(window, selectedBefore, selectedMainTabID(window));
  }

  selectTab(window: MainWindow, id: string): boolean {
    const selectedBefore = selectedMainTabID(window);
    if (!selectMainTab(window, id)) return false;
    const selectedAfter = selectedMainTabID(window);
    this.finishTabSwitch(window, selectedBefore, selectedAfter);
    return selectedAfter === id;
  }

  private finishTabSwitch(
    window: MainWindow,
    selectedBefore?: string,
    selectedAfter?: string,
  ): boolean {
    if (!selectedAfter) return false;
    if (selectedAfter !== selectedBefore) this.afterTabSwitch(window);
    return selectedAfter !== selectedBefore;
  }
  afterTabSwitch(window: MainWindow): void {
    for (const delay of [0, 60, 180, 420, 900])
      window.setTimeout(() => this.#rescan(window), delay);
  }
}
