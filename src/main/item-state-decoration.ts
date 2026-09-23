import type { MainWindow } from '../core/contracts';
import { THEME_VARS, itemStateColors, type ResolvedTheme, type ThemeManager } from '../ui/theme';
import { currentMainItemCursorRef, mainItemRefAtRow } from './host';
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

function decorationCss(theme: ResolvedTheme): string {
  const colors = itemStateColors(theme);
  return `
#item-tree-main-default {
  --zotero-neo-focus-ring: ${colors.cursor};
  --zotero-neo-item-selection: ${colors.selection};
  --zotero-neo-item-selection-fill: ${colors.selectionFill};
  --zotero-neo-item-visual: ${colors.visual};
  --zotero-neo-item-visual-fill: ${colors.visualFill};
}
#item-tree-main-default .row.zotero-neo-cursor:not(.zotero-neo-selection):not(.zotero-neo-visual),
#item-tree-main-default .row.zotero-neo-cursor:not(.zotero-neo-selection):not(.zotero-neo-visual) .cell {
  background-color: transparent !important;
}
#item-tree-main-default .row.zotero-neo-selection {
  background: linear-gradient(to right, ${THEME_VARS.itemSelection} 0 3px, ${THEME_VARS.itemSelectionFill} 3px) !important;
}
#item-tree-main-default .row.zotero-neo-visual {
  background: ${THEME_VARS.itemVisualFill} !important;
}
#item-tree-main-default .row.zotero-neo-selection.zotero-neo-visual {
  background: linear-gradient(to right, ${THEME_VARS.itemSelection} 0 3px, ${THEME_VARS.itemVisualFill} 3px) !important;
}
#item-tree-main-default .row.zotero-neo-visual-first {
  box-shadow: inset 0 1px 0 ${THEME_VARS.itemVisual} !important;
}
#item-tree-main-default .row.zotero-neo-visual-last {
  box-shadow: inset 0 -1px 0 ${THEME_VARS.itemVisual} !important;
}
#item-tree-main-default .row.zotero-neo-visual-first.zotero-neo-visual-last {
  box-shadow: inset 0 1px 0 ${THEME_VARS.itemVisual}, inset 0 -1px 0 ${THEME_VARS.itemVisual} !important;
}
#item-tree-main-default .row.zotero-neo-selection,
#item-tree-main-default .row.zotero-neo-selection .cell,
#item-tree-main-default .row.zotero-neo-visual,
#item-tree-main-default .row.zotero-neo-visual .cell {
  color: var(--fill-primary) !important;
}
#item-tree-main-default .row.zotero-neo-cursor {
  outline: 2px solid ${THEME_VARS.focusRing} !important;
  outline-offset: -2px !important;
  position: relative;
  z-index: 2;
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
  readonly theme: ThemeManager;
  readonly scrollListener: EventListener;
  selectionCleanup: (() => void) | null;
  themeCleanup: (() => void) | null;
  scheduled: number | undefined;
  renderedTheme: ResolvedTheme;
};

/** Decorates only rendered virtual rows; stable item identities remain authoritative. */
export class MainItemStateDecoration {
  readonly #windows = new Map<MainWindow, WindowDecoration>();

  addWindow(
    window: MainWindow,
    selection: SelectionStore,
    visual: () => MainVisualRange | undefined,
    theme: ThemeManager,
  ): void {
    if (this.#windows.has(window)) return;
    const doc = window.document;
    const style = doc.createElementNS('http://www.w3.org/1999/xhtml', 'style') as HTMLStyleElement;
    style.id = 'zotero-neo-main-item-state-style';
    style.textContent = decorationCss(theme.theme);
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
      theme,
      scrollListener: () => this.refresh(window),
      selectionCleanup: null,
      themeCleanup: null,
      scheduled: undefined,
      renderedTheme: theme.theme,
    };
    this.#windows.set(window, state);
    state.selectionCleanup = selection.observe(() => this.refresh(window));
    state.themeCleanup = theme.observe(() => this.refresh(window));
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
    state.themeCleanup?.();
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
    if (state.renderedTheme !== state.theme.theme) {
      state.renderedTheme = state.theme.theme;
      state.style.textContent = decorationCss(state.renderedTheme);
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
