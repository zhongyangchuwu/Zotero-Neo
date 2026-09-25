import type { MainWindow } from '../core/contracts';
import { currentMainItemCursorRef, mainItemRefAtRow } from './host';
import {
  type InteractionAppearance,
  type InteractionAppearanceSource,
} from './interaction-appearance';
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

function decorationCss(appearance: InteractionAppearance): string {
  const { colors, marker } = appearance;
  return `
#item-tree-main-default .row.zotero-neo-selection::before,
#item-tree-main-default .row.zotero-neo-visual::after {
  content: '';
  position: absolute;
  width: ${marker.width}px;
  pointer-events: none;
  z-index: 4;
}
#item-tree-main-default .row.zotero-neo-selection::before {
  left: ${marker.selectionLeft}px;
  top: 2px;
  bottom: 2px;
  border-radius: ${marker.radius}px;
  background: ${colors.selectionMarker};
}
#item-tree-main-default .row.zotero-neo-visual::after {
  left: ${marker.visualLeft}px;
  top: 0;
  bottom: 0;
  background: ${colors.visualMarker};
}
#item-tree-main-default .row.zotero-neo-visual-first::after {
  top: 2px;
  border-radius: ${marker.radius}px ${marker.radius}px 0 0;
}
#item-tree-main-default .row.zotero-neo-visual-last::after {
  bottom: 2px;
  border-radius: 0 0 ${marker.radius}px ${marker.radius}px;
}
#item-tree-main-default .row.zotero-neo-visual-first.zotero-neo-visual-last::after {
  border-radius: ${marker.radius}px;
}
`;
}

type WindowDecoration = {
  rowObserver: MutationObserver | null;
  rootObserver: MutationObserver | null;
  root: HTMLElement | null | undefined;
  readonly style: HTMLStyleElement;
  readonly selection: SelectionStore;
  readonly visual: () => MainVisualRange | undefined;
  readonly appearance: InteractionAppearanceSource;
  readonly scrollListener: EventListener;
  selectionCleanup: (() => void) | null;
  appearanceCleanup: (() => void) | null;
  scheduled: number | undefined;
  renderedAppearance: InteractionAppearance;
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
    const doc = window.document;
    const style = doc.createElementNS('http://www.w3.org/1999/xhtml', 'style') as HTMLStyleElement;
    style.id = 'zotero-neo-main-item-state-style';
    style.textContent = decorationCss(appearance.appearance);
    const styleParent = doc.head ?? doc.documentElement;
    if (typeof styleParent.append === 'function') styleParent.append(style);
    else styleParent.appendChild(style);

    const state: WindowDecoration = {
      rowObserver: null,
      rootObserver: null,
      root: undefined,
      style,
      selection,
      visual,
      appearance,
      scrollListener: () => this.refresh(window),
      selectionCleanup: null,
      appearanceCleanup: null,
      scheduled: undefined,
      renderedAppearance: appearance.appearance,
    };
    this.#windows.set(window, state);
    state.selectionCleanup = selection.observe(() => this.refresh(window));
    state.appearanceCleanup = appearance.observe(() => this.refresh(window));
    this.syncRoot(window, state);
    this.refresh(window);
  }

  refresh(window: MainWindow): void {
    const state = this.#windows.get(window);
    if (!state) return;
    window.clearTimeout(state.scheduled);
    state.scheduled = window.setTimeout(() => {
      state.scheduled = undefined;
      this.render(window, state);
    }, 0);
  }

  removeWindow(window: MainWindow): void {
    const state = this.#windows.get(window);
    if (!state) return;
    window.clearTimeout(state.scheduled);
    state.selectionCleanup?.();
    state.appearanceCleanup?.();
    this.releaseRoot(state);
    state.style.remove();
    this.#windows.delete(window);
  }

  private createObserver(window: MainWindow, listener: MutationCallback): MutationObserver | null {
    try {
      return new window.MutationObserver(listener);
    } catch {
      return null;
    }
  }

  private render(window: MainWindow, state: WindowDecoration): void {
    if (state.renderedAppearance !== state.appearance.appearance) {
      state.renderedAppearance = state.appearance.appearance;
      state.style.textContent = decorationCss(state.renderedAppearance);
    }
    this.syncRoot(window, state);
    const visual = state.visual();
    const cursor = refKey(currentMainItemCursorRef(window));

    for (const row of this.rows(state.root ?? null)) {
      const match = /-row-(\d+)$/.exec(row.id);
      const rowIndex = match ? Number(match[1]) : undefined;
      const ref = rowIndex === undefined ? undefined : mainItemRefAtRow(window, rowIndex);
      const key = refKey(ref);
      const inVisual =
        visual !== undefined &&
        rowIndex !== undefined &&
        rowIndex >= visual.first &&
        rowIndex <= visual.last;
      const desired = new Set(
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
      for (const name of DECORATION_CLASSES) row.classList.toggle(name, desired.has(name));
    }
  }

  private syncRoot(window: MainWindow, state: WindowDecoration): void {
    const getElementById = window.document.getElementById;
    const root =
      typeof getElementById === 'function'
        ? (getElementById.call(window.document, 'item-tree-main-default') as HTMLElement | null)
        : null;
    if (root === state.root) return;

    this.releaseRoot(state);
    state.root = root;

    const replacementTarget =
      root?.parentElement ??
      (typeof getElementById === 'function'
        ? getElementById.call(window.document, 'zotero-items-tree')
        : null);
    if (replacementTarget) {
      state.rootObserver = this.createObserver(window, () => this.refresh(window));
      state.rootObserver?.observe(replacementTarget, {
        childList: true,
        subtree: root === null,
      });
    }

    if (!root) return;
    root.addEventListener('scroll', state.scrollListener, true);
    state.rowObserver = this.createObserver(window, () => this.refresh(window));
    state.rowObserver?.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id'],
    });
  }

  private releaseRoot(state: WindowDecoration): void {
    state.rowObserver?.disconnect();
    state.rowObserver = null;
    state.rootObserver?.disconnect();
    state.rootObserver = null;
    const root = state.root;
    state.root = undefined;
    if (!root) return;
    root.removeEventListener('scroll', state.scrollListener, true);
    for (const row of this.rows(root)) row.classList.remove(...DECORATION_CLASSES);
  }

  private rows(root: HTMLElement | null): HTMLElement[] {
    return root
      ? ([...root.querySelectorAll('.row[id^="item-tree-main-default-row-"]')] as HTMLElement[])
      : [];
  }
}
