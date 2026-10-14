import type { MainWindow } from '../core/contracts';
import { CleanupFailure } from '../core/cleanup';
import {
  currentMainItemCursorRef,
  installMainRenderedItemDecoration,
  type MainRenderedItemDecoration,
} from '../toolkit/main';
import type { InteractionAppearanceSource } from './interaction-appearance';
import type { SelectionStore } from './selection-store';

export interface MainVisualRange {
  readonly first: number;
  readonly last: number;
  readonly count: number;
}

const DECORATION_CLASSES = [
  'zotero-neo-cursor',
  'zotero-neo-selection',
  'zotero-neo-visual',
  'zotero-neo-visual-first',
  'zotero-neo-visual-last',
] as const;

type DecorationClass = (typeof DECORATION_CLASSES)[number];

export interface MainItemDecorationState {
  readonly cursor: boolean;
  readonly selection: boolean;
  readonly visual: boolean;
  readonly visualFirst: boolean;
  readonly visualLast: boolean;
}

export function itemDecorationClasses(state: MainItemDecorationState): DecorationClass[] {
  const classes: DecorationClass[] = [];
  if (state.cursor) classes.push('zotero-neo-cursor');
  if (state.selection) classes.push('zotero-neo-selection');
  if (state.visual) {
    classes.push('zotero-neo-visual');
    if (state.visualFirst) classes.push('zotero-neo-visual-first');
    if (state.visualLast) classes.push('zotero-neo-visual-last');
  }
  return classes;
}

function refKey(ref: { readonly libraryID: number; readonly itemID: number } | undefined): string {
  return ref ? `${ref.libraryID}:${ref.itemID}` : '';
}

type WindowDecoration = {
  decoration: MainRenderedItemDecoration | null;
  readonly selection: SelectionStore;
  readonly visual: () => MainVisualRange | undefined;
  readonly appearance: InteractionAppearanceSource;
  selectionCleanup: (() => void) | null;
  appearanceCleanup: (() => void) | null;
  scheduled: number | undefined;
};

/** Decorates only rendered virtual rows; stable item identities remain authoritative. */
export class MainItemStateDecoration {
  readonly #windows = new Map<MainWindow, WindowDecoration>();

  addWindow(
    window: MainWindow,
    selection: SelectionStore,
    visual: () => MainVisualRange | undefined,
    appearance: InteractionAppearanceSource,
  ): void {
    if (this.#windows.has(window)) return;
    const refresh = (): void => {
      if (this.#windows.get(window) === state) this.refresh(window);
    };

    const state: WindowDecoration = {
      decoration: null,
      selection,
      visual,
      appearance,
      selectionCleanup: null,
      appearanceCleanup: null,
      scheduled: undefined,
    };
    this.#windows.set(window, state);
    try {
      state.selectionCleanup = selection.observe(refresh);
      state.appearanceCleanup = appearance.observe(refresh);
      state.decoration = installMainRenderedItemDecoration(
        window,
        appearance.appearance,
        DECORATION_CLASSES,
        refresh,
      );
      this.refresh(window);
    } catch (error) {
      try {
        this.removeWindow(window);
      } catch {
        // Retire subscriptions and callbacks without replacing the installation failure.
      }
      throw error;
    }
  }

  refresh(window: MainWindow): void {
    const state = this.#windows.get(window);
    if (!state) return;
    window.clearTimeout(state.scheduled);
    state.scheduled = window.setTimeout(() => {
      if (this.#windows.get(window) !== state) return;
      state.scheduled = undefined;
      this.render(window, state);
    }, 0);
  }

  /** Retires the registration before releasing host resources; the first live error survives. */
  removeWindow(window: MainWindow): void {
    const state = this.#windows.get(window);
    if (!state) return;
    this.#windows.delete(window);
    const scheduled = state.scheduled;
    const selectionCleanup = state.selectionCleanup;
    const appearanceCleanup = state.appearanceCleanup;
    state.scheduled = undefined;
    state.selectionCleanup = null;
    state.appearanceCleanup = null;
    const failure = new CleanupFailure();
    failure.run(() => window.clearTimeout(scheduled));
    failure.run(() => selectionCleanup?.());
    failure.run(() => appearanceCleanup?.());
    failure.run(() => state.decoration?.dispose());
    failure.rethrow();
  }

  private render(window: MainWindow, state: WindowDecoration): void {
    const visual = state.visual();
    const cursor = refKey(currentMainItemCursorRef(window));
    state.decoration?.render(state.appearance.appearance, (rowIndex, ref) => {
      const key = refKey(ref);
      const inVisual =
        visual !== undefined &&
        rowIndex !== undefined &&
        rowIndex >= visual.first &&
        rowIndex <= visual.last;
      return new Set(
        ref
          ? itemDecorationClasses({
              cursor: key === cursor,
              selection: state.selection.has(ref),
              visual: inVisual,
              visualFirst: inVisual && rowIndex === visual.first,
              visualLast: inVisual && rowIndex === visual.last,
            })
          : [],
      );
    });
  }
}
