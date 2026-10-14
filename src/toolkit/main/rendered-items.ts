import type { MainWindow } from '../../core/contracts';
import { CleanupFailure } from '../../core/cleanup';
import type { ItemRef } from '../../main/selection-store';
import { mainItemRefAtRow } from './host';

export interface MainItemMarkerStyle {
  readonly colors: { readonly selectionMarker: string; readonly visualMarker: string };
  readonly marker: {
    readonly width: number;
    readonly radius: number;
    readonly selectionLeft: number;
    readonly visualLeft: number;
  };
}

export interface MainRenderedItemDecoration {
  render(
    appearance: MainItemMarkerStyle,
    classes: (index: number | undefined, ref: ItemRef | undefined) => ReadonlySet<string>,
  ): void;
  dispose(): void;
}

function decorationCss({ colors, marker }: MainItemMarkerStyle): string {
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

/** Owns virtual row discovery, replacement/scroll listeners, and native DOM decoration. */
export function installMainRenderedItemDecoration(
  window: MainWindow,
  appearance: MainItemMarkerStyle,
  names: readonly string[],
  onChange: () => void,
): MainRenderedItemDecoration {
  let root: HTMLElement | null | undefined;
  let rowObserver: MutationObserver | null = null;
  let rootObserver: MutationObserver | null = null;
  let disposed = false;
  let renderedAppearance = appearance;
  const doc = window.document;
  const style = doc.createElementNS('http://www.w3.org/1999/xhtml', 'style') as HTMLStyleElement;
  const refresh: EventListener = () => {
    if (!disposed) onChange();
  };
  const rows = (target: HTMLElement | null | undefined): HTMLElement[] =>
    target
      ? ([...target.querySelectorAll('.row[id^="item-tree-main-default-row-"]')] as HTMLElement[])
      : [];
  const observer = (listener: MutationCallback): MutationObserver | null => {
    try {
      return new window.MutationObserver(listener);
    } catch {
      return null;
    }
  };
  const releaseRoot = (): void => {
    const previousRowObserver = rowObserver;
    const previousRootObserver = rootObserver;
    const previousRoot = root;
    rowObserver = null;
    rootObserver = null;
    root = undefined;
    const failure = new CleanupFailure();
    failure.run(() => previousRowObserver?.disconnect());
    failure.run(() => previousRootObserver?.disconnect());
    if (previousRoot) {
      failure.run(() => previousRoot.removeEventListener('scroll', refresh, true));
      failure.run(() => {
        for (const row of rows(previousRoot)) failure.run(() => row.classList.remove(...names));
      });
    }
    failure.rethrow();
  };
  const syncRoot = (): void => {
    const getElementById = doc.getElementById;
    const next =
      typeof getElementById === 'function'
        ? (getElementById.call(doc, 'item-tree-main-default') as HTMLElement | null)
        : null;
    if (next === root) return;
    releaseRoot();
    root = next;
    const replacementTarget =
      root?.parentElement ??
      (typeof getElementById === 'function' ? getElementById.call(doc, 'zotero-items-tree') : null);
    if (replacementTarget) {
      rootObserver = observer(() => {
        if (!disposed) onChange();
      });
      rootObserver?.observe(replacementTarget, { childList: true, subtree: root === null });
    }
    if (!root) return;
    root.addEventListener('scroll', refresh, true);
    rowObserver = observer(() => {
      if (!disposed) onChange();
    });
    rowObserver?.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id'],
    });
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    const failure = new CleanupFailure();
    failure.run(releaseRoot);
    failure.run(() => style.remove());
    failure.rethrow();
  };
  try {
    style.id = 'zotero-neo-main-item-state-style';
    style.textContent = decorationCss(appearance);
    const parent = doc.head ?? doc.documentElement;
    if (typeof parent.append === 'function') parent.append(style);
    else parent.appendChild(style);
    syncRoot();
  } catch (error) {
    try {
      dispose();
    } catch {
      // All acquired resources were attempted; the installation error remains authoritative.
    }
    throw error;
  }
  return {
    render(nextAppearance, classes): void {
      if (disposed) return;
      if (renderedAppearance !== nextAppearance) {
        renderedAppearance = nextAppearance;
        style.textContent = decorationCss(nextAppearance);
      }
      syncRoot();
      for (const row of rows(root)) {
        const match = /-row-(\d+)$/.exec(row.id);
        const index = match ? Number(match[1]) : undefined;
        const ref = index === undefined ? undefined : mainItemRefAtRow(window, index);
        const desired = classes(index, ref);
        for (const name of names) row.classList.toggle(name, desired.has(name));
      }
    },
    dispose,
  };
}
