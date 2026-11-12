import type { MainWindow } from '../../core/contracts';
import { CleanupFailure, type Cleanup } from '../../core/cleanup';
import { keyString } from '../../input/keys';
import { CENTERED_MONOSPACE_OVERLAY_STYLE } from '../../ui/react/shells/main';
import { mainItem, mainItemRowForRef } from '../../toolkit/main';
import type { ItemRef } from '../../core/item-ref';
import type { NavigationExecution } from '../../navigation/types';
import type { SelectionStore } from './selection-store';
import type { SelectionPanelRuntime } from './selection-panel-runtime';
import { mountNativeReactView } from '../../platform/native-ui';
import type { NativeReactView } from '../../ui/react/types';
import type { SelectionPanelReactCommand, SelectionPanelReactModel } from './react-model';

interface PanelState {
  readonly window: MainWindow;
  readonly selection: SelectionStore;
  readonly selectionPanel: SelectionPanelRuntime;
  readonly theme: { add(root: HTMLElement): Cleanup };
}

const H = 'http://www.w3.org/1999/xhtml';
const DEFAULT_FOOTER =
  'j/k move · gg/G ends · x remove · c clear · Enter reveal · r refresh · q close';

export type SelectionEntryState = 'visible' | 'hidden' | 'unavailable';

export interface SelectionPanelEntry {
  readonly ref: ItemRef;
  readonly title: string;
  readonly state: SelectionEntryState;
}

export interface SelectionPanelLogger {
  debug(message: string): void;
}
export type SelectionPanelChangeListener = (window: MainWindow, session: PanelState) => void;

function itemForRef(ref: ItemRef): Zotero.Item | undefined {
  const item = mainItem(ref.itemID);
  return item && item.libraryID === ref.libraryID ? item : undefined;
}

function itemTitle(item: Zotero.Item | undefined, ref: ItemRef): string {
  if (!item) return `Item ${ref.itemID}`;
  try {
    const title = String(item.getField?.('title') ?? '').trim();
    if (title) return title;
  } catch {}
  return `Item ${ref.itemID}`;
}

export function selectionPanelEntries(
  window: MainWindow,
  refs: readonly ItemRef[],
): readonly SelectionPanelEntry[] {
  return refs.map((ref) => {
    const item = itemForRef(ref);
    return {
      ref,
      title: itemTitle(item, ref),
      state:
        mainItemRowForRef(window, ref) !== undefined ? 'visible' : item ? 'hidden' : 'unavailable',
    };
  });
}

/**
 * Persistent inspector for Neo's explicit Main Selection workset.
 *
 * This panel intentionally owns no batch domain actions. It can inspect the
 * workset, remove/clear membership, and explicitly reveal one member.
 */
type SelectionNavigation = (itemID: number, isCurrent: () => boolean) => NavigationExecution | null;

export class SelectionPanel {
  readonly #logger: SelectionPanelLogger;
  readonly #navigation: SelectionNavigation;
  readonly #isCurrent: () => boolean;
  readonly #onSelectionChange: SelectionPanelChangeListener;
  readonly #views = new WeakMap<
    SelectionPanelRuntime,
    {
      view: NativeReactView<SelectionPanelReactModel>;
      model: SelectionPanelReactModel;
    }
  >();

  constructor(
    logger: SelectionPanelLogger,
    navigation: SelectionNavigation,
    onSelectionChange: SelectionPanelChangeListener,
    isCurrent: () => boolean,
  ) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#onSelectionChange = onSelectionChange;
    this.#isCurrent = isCurrent;
  }

  open(window: MainWindow, session: PanelState): void {
    const state = session.selectionPanel;
    if (state.open) {
      state.overlay?.focus();
      return;
    }

    const doc = window.document;
    const create = (tag: string): HTMLElement => doc.createElementNS(H, tag);
    const overlay = create('div');
    overlay.id = 'zv-selection-panel';
    overlay.tabIndex = -1;
    overlay.style.cssText = CENTERED_MONOSPACE_OVERLAY_STYLE;

    const content = create('div');
    overlay.append(content);

    state.revision += 1;
    state.open = true;
    state.refs = [];
    state.selected = 0;
    state.commandBuffer = '';
    state.overlay = overlay;
    state.previousElement = doc.activeElement;
    try {
      const isOpeningCurrent = (): boolean =>
        this.#isCurrent() &&
        window.document === doc &&
        !window.closed &&
        state.open &&
        state.overlay === overlay;
      (doc.body ?? doc.documentElement).append(overlay);
      if (!isOpeningCurrent()) {
        overlay.remove();
        return;
      }
      const themeCleanup = session.theme.add(overlay);
      if (!isOpeningCurrent()) {
        themeCleanup();
        return;
      }
      state.themeCleanup = themeCleanup;
      const model: SelectionPanelReactModel = { entries: [], selected: 0, footer: DEFAULT_FOOTER };
      const view = mountNativeReactView<SelectionPanelReactModel, SelectionPanelReactCommand>({
        surface: 'selection-panel',
        root: content,
        model,
        dispatch: () => {},
        isCurrent: isOpeningCurrent,
        loadingText: 'Loading selection…',
        errorText: 'Selection panel unavailable.',
        onError: (error) => this.#logger.debug(`Selection panel failed: ${String(error)}`),
      });
      if (!isOpeningCurrent()) {
        view.dispose();
        return;
      }
      this.#views.set(state, { view, model });
      void view.ready
        .then(() => {
          if (isOpeningCurrent())
            view.getElement('selected')?.scrollIntoView?.({ block: 'nearest' });
        })
        .catch(() => {});
      overlay.addEventListener('mousedown', (event) => {
        if (
          this.#isCurrent() &&
          state.open &&
          state.overlay === overlay &&
          event.target === overlay
        )
          this.close(session);
      });
      overlay.focus();
      if (isOpeningCurrent()) this.refresh(window, session);
    } catch (error) {
      if (state.overlay === overlay) {
        try {
          this.close(session, false);
        } catch {}
      } else {
        try {
          overlay.remove();
        } catch {}
      }
      throw error;
    }
  }

  close(session: PanelState, restoreFocus = true): void {
    const state = session.selectionPanel;
    if (!state.open) return;
    const timer = state.commandTimer;
    const themeCleanup = state.themeCleanup;
    const overlay = state.overlay;
    const previousElement = state.previousElement;
    const revision = state.revision;
    const mounted = this.#views.get(state);
    this.#views.delete(state);
    state.open = false;
    state.commandTimer = undefined;
    state.themeCleanup = null;
    state.refs = [];
    state.selected = 0;
    state.commandBuffer = '';
    state.overlay = null;
    state.previousElement = null;
    const failure = new CleanupFailure();
    failure.run(() => session.window.clearTimeout(timer));
    failure.run(() => mounted?.view.dispose());
    failure.run(() => themeCleanup?.());
    failure.run(() => overlay?.remove());
    if (
      restoreFocus &&
      this.#isCurrent() &&
      state.revision === revision &&
      previousElement?.isConnected
    )
      failure.run(() => (previousElement as HTMLElement).focus());
    failure.rethrow();
  }

  handleKey(event: KeyboardEvent, window: MainWindow, session: PanelState): void {
    const state = session.selectionPanel;
    if (!state.open) return;

    const key = keyString(event);
    const consume = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
    };
    if (!key) {
      event.stopPropagation();
      return;
    }

    if (key !== 'g' && state.commandBuffer) this.clearCommand(session);

    if (key === 'escape' || key === 'q') {
      consume();
      this.close(session);
      return;
    }
    if (key === 'r') {
      consume();
      this.refresh(window, session);
      return;
    }
    if (key === 'j') {
      consume();
      this.select(session, Math.min(state.refs.length - 1, state.selected + 1));
      return;
    }
    if (key === 'k') {
      consume();
      this.select(session, Math.max(0, state.selected - 1));
      return;
    }
    if (key === 'G' || key === 'end') {
      consume();
      this.select(session, Math.max(0, state.refs.length - 1));
      return;
    }
    if (key === 'home') {
      consume();
      this.select(session, 0);
      return;
    }
    if (key === 'g') {
      consume();
      if (state.commandBuffer === 'g') {
        this.clearCommand(session);
        this.select(session, 0);
      } else {
        state.commandBuffer = 'g';
        session.window.clearTimeout(state.commandTimer);
        const overlay = state.overlay;
        const timer = session.window.setTimeout(() => {
          if (
            this.#isCurrent() &&
            state.open &&
            state.overlay === overlay &&
            state.commandTimer === timer
          )
            this.clearCommand(session);
        }, 700);
        state.commandTimer = timer;
        this.renderFooter(session, 'g … (gg top)');
      }
      return;
    }
    if (key === 'x') {
      consume();
      this.removeCurrent(session);
      return;
    }
    if (key === 'c') {
      consume();
      this.clear(session);
      return;
    }
    if (key === 'enter') {
      consume();
      this.reveal(window, session);
      return;
    }

    event.stopPropagation();
  }

  refresh(window: MainWindow, session: PanelState): void {
    const state = session.selectionPanel;
    state.refs = [...session.selection.values()];
    state.selected = Math.max(0, Math.min(state.selected, Math.max(0, state.refs.length - 1)));
    this.render(window, session);
  }

  private clearCommand(session: PanelState): void {
    const state = session.selectionPanel;
    session.window.clearTimeout(state.commandTimer);
    state.commandTimer = undefined;
    state.commandBuffer = '';
    this.renderFooter(session);
  }

  private select(session: PanelState, index: number): void {
    const state = session.selectionPanel;
    if (!state.refs.length) {
      state.selected = 0;
      return;
    }
    state.selected = Math.max(0, Math.min(index, state.refs.length - 1));
    this.render(session.window, session);
  }

  private removeCurrent(session: PanelState): void {
    const state = session.selectionPanel;
    const ref = state.refs[state.selected];
    if (!ref || !session.selection.remove(ref)) return;
    this.refresh(session.window, session);
    this.#onSelectionChange(session.window, session);
  }

  private clear(session: PanelState): void {
    if (!session.selection.clear()) return;
    this.refresh(session.window, session);
    this.#onSelectionChange(session.window, session);
  }

  private reveal(window: MainWindow, session: PanelState): void {
    const ref = session.selectionPanel.refs[session.selectionPanel.selected];
    if (!ref) return;
    const item = itemForRef(ref);
    if (!item) {
      this.renderFooter(session, 'Unavailable item cannot be revealed');
      return;
    }
    const invocationOverlay = session.selectionPanel.overlay;
    const isInvocationCurrent = (): boolean =>
      this.#isCurrent() &&
      session.selectionPanel.open &&
      session.selectionPanel.overlay === invocationOverlay;
    try {
      const execution = this.#navigation(item.id, isInvocationCurrent);
      if (!execution) {
        this.renderFooter(session, 'Reveal is unavailable in this Zotero view');
        return;
      }
      const result = execution.pending ? execution.result : Promise.resolve(execution.result);
      void result
        .then((outcome) => {
          if (outcome.kind === 'completed' && isInvocationCurrent()) this.close(session, false);
          else if (
            (outcome.kind === 'failed' || outcome.kind === 'unavailable') &&
            isInvocationCurrent()
          ) {
            if (outcome.kind === 'failed')
              this.#logger.debug(`Selection reveal failed: ${String(outcome.error)}`);
            this.renderFooter(session, 'Reveal failed · check Library selection');
          }
        })
        .catch((error) => {
          this.#logger.debug(`Selection reveal failed: ${String(error)}`);
          if (isInvocationCurrent())
            this.renderFooter(session, 'Reveal failed · check Library selection');
        });
    } catch (error) {
      this.#logger.debug(`Selection reveal failed: ${String(error)}`);
      if (isInvocationCurrent())
        this.renderFooter(session, 'Reveal failed · check Library selection');
    }
  }

  private render(window: MainWindow, session: PanelState): void {
    const state = session.selectionPanel;
    const mounted = this.#views.get(state);
    if (!mounted) return;
    mounted.model = {
      entries: selectionPanelEntries(window, state.refs).map((entry) => ({
        title: entry.title,
        state: entry.state,
        libraryID: entry.ref.libraryID,
        itemID: entry.ref.itemID,
      })),
      selected: state.selected,
      footer: DEFAULT_FOOTER,
    };
    mounted.view.update(mounted.model);
    mounted.view.getElement('selected')?.scrollIntoView?.({ block: 'nearest' });
  }

  private renderFooter(session: PanelState, override?: string): void {
    const mounted = this.#views.get(session.selectionPanel);
    if (!mounted) return;
    mounted.model = { ...mounted.model, footer: override ?? DEFAULT_FOOTER };
    mounted.view.update(mounted.model);
  }
}
