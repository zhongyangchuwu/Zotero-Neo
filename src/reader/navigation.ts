import { ReaderNavigationHost, readerWindow } from '../toolkit';
import type { FocusDirection } from '../input/actions';
import type { PdfWindow, ReaderRuntime } from './types';
import { outlineEntryKind } from './outline-presentation';
import type { ReaderNativeOutlineEntry } from './types';
import {
  captionLabel,
  type ReaderCaptionTarget,
  type ReaderCaptionTargets,
} from './caption-targets';
import type { NavigationExecution, NavigationIntent, NavigationOutcome } from '../navigation/types';
import type { ReaderNativeNavigation } from '../toolkit';

/** Confirmation owners keep their cause and pass native work to the Reader execution adapter. */
export type ReaderNavigationCommand = (
  pdfWindow: PdfWindow,
  intent: NavigationIntent,
  perform: (navigation: ReaderNativeNavigation) => unknown,
) => NavigationExecution | null;

export interface ReaderNavigationDependencies {
  readonly reader: ReaderRuntime;
  readonly captions: ReaderCaptionTargets;
  readonly activePdfWindow: () => PdfWindow;
  readonly setActivePdfWindow: (pdfWindow: PdfWindow) => void;
  readonly syncViews: () => void;
  readonly scrollBoundary: (last: boolean, pdfWindow: PdfWindow) => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

/**
 * Owns navigation-oriented Zotero Reader host seams.
 *
 * Input policy, counts, selection state, smooth-scroll behavior, and annotation mutations remain
 * in ReaderSession. This adapter only delegates history/zoom/page/search/split/focus operations
 * to the current Zotero Reader and resolves the active primary/secondary PDF window.
 */
export class ReaderNavigation {
  readonly #dependencies: ReaderNavigationDependencies;
  readonly #host: ReaderNavigationHost;

  constructor(dependencies: ReaderNavigationDependencies) {
    this.#dependencies = dependencies;
    this.#host = new ReaderNavigationHost({
      ...dependencies,
      unavailable: (reason) =>
        dependencies.showStatus(
          reason === 'zoom'
            ? 'Zoom unavailable'
            : reason === 'page'
              ? '✗ Page navigation not supported here'
              : 'No active search — press / to search',
          1500,
        ),
    });
  }

  /** Uses authored, resolved Outline locations and the exact view's native history producer. */
  async traverseOutline(
    category: 'heading' | 'figure' | 'table',
    direction: -1 | 1,
    pdfWindow: PdfWindow,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    if (!this.#host.canNavigate(pdfWindow)) {
      this.#dependencies.showStatus('✗ Outline navigation unavailable', 2000);
      return false;
    }
    const outline = await this.#host.prepareOutline(pdfWindow, isCurrent);
    if (!outline) return false;
    // Load native semantic anchors only on an explicit structural navigation request.
    const captions = await this.#dependencies.captions.load();
    if (!outline.isCurrent()) return false;
    const entries: {
      entry: ReaderNativeOutlineEntry;
      page: number;
      top: number;
      order: number;
      clonePosition: boolean;
    }[] = [];
    let order = 0;
    const visit = (
      outline: readonly ReaderNativeOutlineEntry[],
      depth: number,
      clonePosition = false,
    ): void => {
      for (const entry of outline) {
        const currentOrder = order++;
        const kind = outlineEntryKind(entry.title, depth);
        const heading = kind === 'section' || kind === 'subsection';
        // Some authored bookmarks precede their printed heading by a page. Keep their
        // hierarchy and identity, but land at the genuine semantic heading when available.
        const headingPosition =
          category === 'heading' && heading
            ? this.#dependencies.captions.headingPosition(entry)
            : null;
        const position = headingPosition ?? entry.location?.position;
        if (
          position &&
          Number.isInteger(position.pageIndex) &&
          position.pageIndex >= 0 &&
          Array.isArray(position.rects) &&
          (kind === category ||
            (category === 'heading' && (kind === 'section' || kind === 'subsection')))
        ) {
          let top = -Infinity;
          for (const rect of position.rects) {
            if (!Array.isArray(rect) || rect.length < 4 || !rect.every(Number.isFinite)) {
              top = -Infinity;
              break;
            }
            top = Math.max(top, rect[1], rect[3]);
          }
          if (Number.isFinite(top))
            entries.push({
              entry: headingPosition
                ? { ...entry, location: { position: headingPosition } }
                : entry,
              page: position.pageIndex,
              top,
              order: currentOrder,
              clonePosition: clonePosition || headingPosition !== null,
            });
        }
        if (entry.items) visit(entry.items, depth + 1, clonePosition);
      }
    };
    visit(outline.outline, 0);
    if (category !== 'heading') {
      const seen = new Map(
        entries.map((entry) => [`${entry.page}:${captionLabel(entry.entry.title)}`, entry]),
      );
      for (const caption of captions) {
        if (caption.kind !== category) continue;
        const key = `${caption.location.position.pageIndex}:${caption.label}`;
        const existing = seen.get(key);
        if (existing) {
          // A genuine Figure projection may start at its image, above the authored bookmark.
          // Keep the native identity/order unless the supplied region starts earlier.
          if (category === 'figure') {
            let top = -Infinity;
            for (const rect of caption.location.position.rects) {
              if (!Array.isArray(rect) || rect.length < 4 || !rect.every(Number.isFinite)) {
                top = -Infinity;
                break;
              }
              top = Math.max(top, rect[1], rect[3]);
            }
            if (Number.isFinite(top) && top > existing.top) {
              existing.entry = caption;
              existing.top = top;
              existing.clonePosition = true;
            }
          }
          continue;
        }
        visit([caption], 0, true);
        const added = entries[entries.length - 1];
        if (added && added.entry === caption) seen.set(key, added);
      }
    }
    if (!entries.length) {
      this.#dependencies.showStatus(
        `✗ no ${category === 'heading' ? 'headings in Outline' : category === 'figure' ? 'recognized figures' : 'recognized tables'}`,
        2000,
      );
      return false;
    }
    entries.sort((a, b) => a.page - b.page || b.top - a.top || a.order - b.order);
    if (!readerWindow(this.#dependencies.reader)) return false;
    const position = this.#host.outlinePosition(pdfWindow);
    if (!position) {
      this.#dependencies.showStatus('✗ PDF position unavailable', 2000);
      return false;
    }
    const relative = (entry: (typeof entries)[number]): number => {
      const targetPosition = entry.entry.location?.position;
      if (targetPosition) {
        const distance = this.#host.outlineTargetDistance(
          outline.view,
          targetPosition,
          entry.clonePosition,
        );
        if (distance !== null) return distance;
      }
      if (entry.page !== position.pageIndex) return entry.page - position.pageIndex;
      const distance = position.top - entry.top;
      return Math.abs(distance) <= position.tolerance ? 0 : distance;
    };
    let target = direction > 0 ? entries[0] : entries[entries.length - 1];
    if (direction > 0) target = entries.find((entry) => relative(entry) > 0) ?? target;
    else {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (relative(entries[index]) < 0) {
          target = entries[index];
          break;
        }
      }
    }
    if (!target?.entry.location || !isCurrent() || this.activePdfWindow() !== pdfWindow)
      return false;
    await this.#host.navigatePosition(outline.view, target.entry.location);
    return isCurrent();
  }

  /** A caption choice uses the exact active view's native position/history producer. */
  async navigateCaption(target: ReaderCaptionTarget, pdfWindow: PdfWindow): Promise<void> {
    await this.#host.navigateCaption(pdfWindow, target.location);
  }

  zoom(direction: 'in' | 'out' | 'reset', steps: number): void {
    this.#host.zoom(direction, steps);
  }

  pageNavigationSupported(pdfWindow?: PdfWindow): boolean {
    return this.#host.pageNavigationSupported(pdfWindow);
  }

  navigatePage(
    direction: number,
    pdfWindow?: PdfWindow,
    navigation?: ReaderNativeNavigation,
  ): void {
    this.#host.navigatePage(direction, pdfWindow, navigation);
  }

  /**
   * Resolves a counted page start, the first page, or the document bottom in the active view.
   * An uncounted last-page jump uses one native XYZ destination; count overrides the boundary.
   */
  navigateBoundary(
    count: number,
    last: boolean,
    pdfWindow: PdfWindow,
    navigation?: ReaderNativeNavigation,
  ): void {
    this.#host.navigateBoundary(count, last, pdfWindow, navigation);
  }

  openSearch(pdfWindow: PdfWindow): void {
    this.#host.openSearch(pdfWindow);
  }

  clearSearch(): void {
    this.#host.clearSearch();
  }

  find(
    next: boolean,
    pdfWindow?: PdfWindow,
    navigation?: ReaderNativeNavigation,
  ): NavigationOutcome | Promise<NavigationOutcome> | void {
    return this.#host.find(next, pdfWindow, navigation);
  }

  toggleSplit(type: 'horizontal' | 'vertical'): void {
    this.#host.toggleSplit(type);
  }

  canFocusDirection(direction: FocusDirection): boolean {
    return this.#host.canFocusDirection(direction);
  }

  focusDirection(direction: FocusDirection): boolean {
    return this.#host.focusDirection(direction);
  }

  activatePdfWindow(pdfWindow: PdfWindow): void {
    this.#host.activatePdfWindow(pdfWindow);
  }

  activePdfWindow(): PdfWindow {
    return this.#host.activePdfWindow();
  }
}
