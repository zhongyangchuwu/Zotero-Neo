import { documentCaptionIdentity } from '../../document-analysis/caption-identity';
import { readerWindow, type ReaderNavigationHost } from '../../toolkit';
import type { PdfWindow, ReaderRuntime } from '../../reader/types';
import { outlineEntryKind } from './outline-presentation';
import type { ReaderNativeOutlineEntry } from '../../reader/types';
import { type ReaderCaptionTarget, type ReaderCaptionTargets } from './caption-targets';
import type { ReaderNativeNavigation } from '../../toolkit';
import type { NavigationOutcome } from '../../navigation/types';

export interface ReaderNavigationDependencies {
  readonly reader: ReaderRuntime;
  readonly captions: ReaderCaptionTargets;
  readonly host: ReaderNavigationHost;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

/** Semantic traversal over the Reader's shared native navigation host. */
export class ReaderNavigation {
  readonly #dependencies: ReaderNavigationDependencies;
  readonly #host: ReaderNavigationHost;

  constructor(dependencies: ReaderNavigationDependencies) {
    this.#dependencies = dependencies;
    this.#host = dependencies.host;
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
    // Heading correction stays native; graph navigation can use cloud cache without cold SDT work.
    if (category === 'heading') await this.#dependencies.captions.loadHeadings();
    const captions = category === 'heading' ? [] : await this.#dependencies.captions.load();
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
        entries.map((entry) => [
          `${entry.page}:${documentCaptionIdentity(entry.entry.title)?.label}`,
          entry,
        ]),
      );
      for (const caption of captions) {
        if (caption.kind !== category) continue;
        const key = caption.label
          ? `${caption.location.position.pageIndex}:${caption.label}`
          : `object:${caption.id ?? order}`;
        const existing = seen.get(key);
        if (existing) {
          // A resolved group retains all panels and its caption, including tables
          // whose caption already starts at the authored bookmark's top.
          if (category === 'figure' || category === 'table') {
            let top = -Infinity;
            for (const rect of caption.location.position.rects) {
              if (!Array.isArray(rect) || rect.length < 4 || !rect.every(Number.isFinite)) {
                top = -Infinity;
                break;
              }
              top = Math.max(top, rect[1], rect[3]);
            }
            if (
              Number.isFinite(top) &&
              (caption.association === 'geometry' ||
                caption.association === 'backend' ||
                top > existing.top)
            ) {
              existing.entry = caption;
              existing.top = top;
              existing.clonePosition = true;
            }
          }
          continue;
        }
        const top = Math.max(
          ...caption.location.position.rects.map((rect) => Math.max(rect[1], rect[3])),
        );
        if (!Number.isFinite(top)) continue;
        const added = {
          entry: caption,
          page: caption.location.position.pageIndex,
          top,
          order: order++,
          clonePosition: true,
        };
        entries.push(added);
        seen.set(key, added);
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
    if (!target?.entry.location || !isCurrent() || this.#host.activePdfWindow() !== pdfWindow)
      return false;
    if (
      category !== 'heading' &&
      !(await this.#dependencies.captions.sourceCurrent(target.entry as ReaderCaptionTarget))
    )
      return false;
    if (!outline.isCurrent() || !isCurrent() || this.#host.activePdfWindow() !== pdfWindow)
      return false;
    await this.#host.navigatePosition(outline.view, target.entry.location);
    return isCurrent();
  }

  /** A caption choice uses the exact active view's native position/history producer. */
  async navigateCaption(target: ReaderCaptionTarget, pdfWindow: PdfWindow): Promise<void> {
    if (
      !(await this.#dependencies.captions.sourceCurrent(target)) ||
      this.#host.activePdfWindow() !== pdfWindow
    )
      return;
    await this.#host.navigateToRegion(pdfWindow, target.location);
  }

  toggleReadingMode(window: PdfWindow): Promise<void> {
    return this.#host.toggleReadingMode(window);
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
}
