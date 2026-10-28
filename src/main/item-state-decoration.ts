import type { MainWindow } from '../core/contracts';
import { CleanupFailure } from '../core/cleanup';
import {
  currentMainItemCursorRef,
  installMainRenderedItemDecoration,
  type MainRenderedItemDecoration,
} from '../toolkit/main';
import type { InteractionAppearanceSource } from './interaction-appearance';
import type { ItemRef } from '../core/item-ref';

export interface MainVisualRange {
  readonly first: number;
  readonly last: number;
  readonly count: number;
}

export interface MainItemDecorationProjection {
  has(ref: ItemRef): boolean;
  visualRange(): MainVisualRange | undefined;
}

export interface MainItemDecorationRegistration {
  retire(): void;
  dispose(): void;
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
  readonly projection: () => MainItemDecorationProjection | null;
  readonly appearance: InteractionAppearanceSource;
  readonly ownerIsCurrent: () => boolean;
  readonly registration: MainItemDecorationRegistration;
  appearanceCleanup: (() => void) | null;
  scheduled: number | undefined;
  retired: boolean;
  disposed: boolean;
};

/** Decorates only rendered virtual rows; stable item identities remain authoritative. */
export class MainItemStateDecoration {
  readonly #windows = new Map<MainWindow, WindowDecoration>();

  addWindow(
    window: MainWindow,
    projection: () => MainItemDecorationProjection | null,
    appearance: InteractionAppearanceSource,
    ownerIsCurrent: () => boolean,
  ): MainItemDecorationRegistration {
    const previous = this.#windows.get(window);
    if (previous && ownerIsCurrent() && previous.ownerIsCurrent()) return previous.registration;
    if (previous && ownerIsCurrent()) {
      previous.registration.retire();
      previous.registration.dispose();
    }

    const current = (): boolean =>
      !state.retired && this.#windows.get(window) === state && ownerIsCurrent();
    const refresh = (): void => {
      if (current()) this.refresh(window);
    };
    const registration: MainItemDecorationRegistration = {
      retire: () => {
        state.retired = true;
        if (this.#windows.get(window) === state) this.#windows.delete(window);
      },
      dispose: () => {
        registration.retire();
        if (state.disposed) return;
        state.disposed = true;
        const scheduled = state.scheduled;
        const appearanceCleanup = state.appearanceCleanup;
        const decoration = state.decoration;
        state.scheduled = undefined;
        state.appearanceCleanup = null;
        state.decoration = null;
        const failure = new CleanupFailure();
        failure.run(() => window.clearTimeout(scheduled));
        failure.run(() => appearanceCleanup?.());
        failure.run(() => decoration?.dispose());
        if (this.#windows.has(window)) failure.run(() => this.refresh(window));
        failure.rethrow();
      },
    };
    const state: WindowDecoration = {
      decoration: null,
      projection,
      appearance,
      ownerIsCurrent,
      registration,
      appearanceCleanup: null,
      scheduled: undefined,
      retired: false,
      disposed: false,
    };
    if (!ownerIsCurrent() || this.#windows.has(window)) {
      registration.retire();
      return registration;
    }
    this.#windows.set(window, state);
    try {
      const appearanceCleanup = appearance.observe(refresh);
      if (!current()) {
        appearanceCleanup();
        registration.dispose();
        return registration;
      }
      state.appearanceCleanup = appearanceCleanup;
      const markerAppearance = appearance.appearance;
      if (!current()) {
        registration.dispose();
        return registration;
      }
      const decoration = installMainRenderedItemDecoration(
        window,
        markerAppearance,
        DECORATION_CLASSES,
        refresh,
      );
      if (!current()) {
        const failure = new CleanupFailure();
        failure.run(() => decoration.dispose());
        failure.run(() => registration.dispose());
        if (this.#windows.has(window)) failure.run(() => this.refresh(window));
        failure.rethrow();
        return registration;
      }
      state.decoration = decoration;
      this.refresh(window);
      return registration;
    } catch (error) {
      try {
        registration.dispose();
      } catch {
        // Preserve the acquisition error after releasing the captured resources.
      }
      throw error;
    }
  }

  refresh(window: MainWindow): void {
    const state = this.#windows.get(window);
    if (!state || state.retired || !state.ownerIsCurrent()) return;
    const scheduled = state.scheduled;
    state.scheduled = undefined;
    window.clearTimeout(scheduled);
    if (this.#windows.get(window) !== state || state.retired || !state.ownerIsCurrent()) return;
    const timer = window.setTimeout(() => {
      if (this.#windows.get(window) !== state || state.retired || !state.ownerIsCurrent()) return;
      state.scheduled = undefined;
      this.render(window, state);
    }, 0);
    if (this.#windows.get(window) !== state || state.retired || !state.ownerIsCurrent()) {
      window.clearTimeout(timer);
      return;
    }
    state.scheduled = timer;
  }

  private render(window: MainWindow, state: WindowDecoration): void {
    const projection = state.projection();
    const visual = projection?.visualRange();
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
              selection: projection?.has(ref) ?? false,
              visual: inVisual,
              visualFirst: inVisual && rowIndex === visual.first,
              visualLast: inVisual && rowIndex === visual.last,
            })
          : [],
      );
    });
  }
}
