import { CleanupFailure } from '../../core/cleanup';
import type { DocumentRegion } from '../../document-analysis/contracts';
import type { ReaderLocalLayout } from '../../reader/local-layout';
import type { PdfWindow } from '../../reader/types';
import {
  leaseReaderTextAdmission,
  projectReadingViewport,
  readerReadingMode,
  readerTextNodeAllowed,
  readerTextSpans,
  type ReaderReadingViewport,
} from '../../toolkit/reader';
import { bodyTextAdmission, isBodyExclusion } from './body-text';

export type SelectionLayout = Pick<
  ReaderLocalLayout,
  'ensureVisible' | 'visibleRegions' | 'isCurrent'
>;

export interface BodySelectionHost {
  readonly layout: SelectionLayout;
  readonly isCurrent: () => boolean;
  readonly capturePresentation: (window: PdfWindow) => () => boolean;
  readonly captureView: (window: PdfWindow) => () => boolean;
  readonly showStatus: (message: string) => void;
  readonly text: (key: string) => string;
  readonly debug: (message: string) => void;
  readonly onChange?: () => void;
}

interface BodyView {
  readonly current: () => boolean;
  regions?: readonly DocumentRegion[];
  dispose?: () => void;
  reading?: ReaderReadingViewport;
  publishedReading?: ReaderReadingViewport;
  preparing?: Promise<void>;
}

/** A Reader-session switch owns source preparation and exact-view leases; native mouse selection is unchanged. */
export class ReaderBodySelection {
  readonly #host: BodySelectionHost;
  readonly #views = new Map<PdfWindow, BodyView>();
  #enabled = false;
  #pending = false;
  #refreshPending = false;
  #disposed = false;
  #revision = 0;

  constructor(host: BodySelectionHost) {
    this.#host = host;
  }

  async toggle(window: PdfWindow): Promise<void> {
    if (this.#disposed || !this.#host.isCurrent()) return;
    if (this.#enabled || this.#pending) {
      this.#reset();
      this.#host.showStatus(this.#host.text('all'));
      return;
    }
    const revision = this.#revision;
    const current = this.#host.capturePresentation(window);
    this.#pending = true;
    this.#host.showStatus(this.#host.text('preparing'));
    try {
      const reflow = readerReadingMode(window);
      const reading = reflow ? projectReadingViewport(window) : undefined;
      const hasPages = !reflow || !!reading?.pages.length;
      if (hasPages) {
        if (reading) await this.#host.layout.ensureVisible(window, reading.pages);
        else await this.#host.layout.ensureVisible(window);
        if (!this.#current(revision) || !current()) return;
        if (!this.#host.layout.isCurrent()) throw new Error('Document source changed');
      }
      this.#enabled = true;
      const view = this.#view(window);
      if (view) {
        view.reading = reading;
        this.#publish(window, view);
      }
      if (this.#refreshPending) this.refreshLayout(window);
      this.#host.onChange?.();
      this.#host.showStatus(this.#host.text(hasPages ? 'body' : 'unavailable'));
    } catch (error) {
      if (this.#current(revision) && current()) {
        this.#reset();
        this.#unavailable(error);
      }
    } finally {
      if (revision === this.#revision) this.#pending = this.#refreshPending = false;
    }
  }

  refreshLayout(window: PdfWindow): void {
    if (this.#disposed || !this.#host.isCurrent()) return;
    if (!this.#enabled) {
      if (this.#pending) this.#refreshPending = true;
      return;
    }
    const view = this.#view(window);
    if (!view) return;
    const reflow = readerReadingMode(window);
    view.reading = reflow ? projectReadingViewport(window, view.reading) : undefined;
    this.#publish(window, view);
    if (reflow && !view.reading?.pages.length) return;
    const layout = this.#host.layout;
    const prepared = view.reading
      ? layout.ensureVisible(window, view.reading.pages)
      : layout.ensureVisible(window);
    if (view.preparing === prepared) return;
    view.preparing = prepared;
    void prepared
      .then(() => {
        if (view.current() && view.preparing === prepared) this.#publish(window, view);
      })
      .catch((error: unknown) => {
        if (view.current() && view.preparing === prepared) this.#unavailable(error);
      })
      .finally(() => {
        if (view.preparing === prepared) view.preparing = undefined;
      });
  }

  dispose(): void {
    this.#disposed = true;
    this.#reset();
  }

  releaseView(window: PdfWindow): void {
    const view = this.#views.get(window);
    this.#views.delete(window);
    view?.dispose?.();
  }

  #current(revision: number): boolean {
    return !this.#disposed && revision === this.#revision && this.#host.isCurrent();
  }

  #unavailable(error: unknown): void {
    this.#host.showStatus(this.#host.text('unavailable'));
    this.#host.debug(`body selection unavailable: ${String(error)}`);
  }

  #reset(): void {
    this.#revision++;
    this.#enabled = this.#pending = this.#refreshPending = false;
    const views = [...this.#views.values()];
    this.#views.clear();
    const failure = new CleanupFailure();
    for (const view of views) failure.run(() => view.dispose?.());
    if (!this.#disposed) failure.run(() => this.#host.onChange?.());
    failure.rethrow();
  }

  #view(window: PdfWindow): BodyView | null {
    const old = this.#views.get(window);
    if (old?.current()) return old;
    if (old) this.releaseView(window);
    const revision = this.#revision;
    const current = this.#host.captureView(window);
    if (!current()) return null;
    const view: BodyView = {
      current: () =>
        this.#views.get(window) === view && this.#current(revision) && this.#enabled && current(),
    };
    this.#views.set(window, view);
    return view;
  }

  #publish(window: PdfWindow, view: BodyView): void {
    const { layout } = this.#host;
    const reading = view.reading;
    const regions = layout.visibleRegions(window, reading?.pages);
    if (regions === view.regions && view.publishedReading === reading) return;
    view.dispose?.();
    view.dispose = undefined;
    view.regions = regions;
    view.publishedReading = reading;
    if (!regions.some(isBodyExclusion)) return;
    const acceptsGeometry = bodyTextAdmission(regions);
    const excluded = reading ? new Map<string, boolean>() : null;
    if (reading && excluded) {
      for (const blocks of reading.blocks.values()) {
        for (const { id, position } of blocks) {
          excluded.set(
            id,
            excluded.get(id) !== false &&
              !!position?.rects.length &&
              position.rects.every(
                (rect) =>
                  !acceptsGeometry({ pageIndex: position.pageIndex, rect, sourceBlockId: null }),
              ),
          );
        }
      }
      for (const [id, reject] of excluded) if (!reject) excluded.delete(id);
      if (!excluded.size) return;
    }
    view.dispose = leaseReaderTextAdmission(
      window,
      excluded ? (source) => !excluded.has(source.sourceBlockId ?? '') : acceptsGeometry,
      view.current,
      async () => {
        const valid =
          view.current() &&
          layout.isCurrent() &&
          view.reading === reading &&
          (!reading || reading.isCurrent()) &&
          layout.visibleRegions(window, reading?.pages) === regions;
        if (!valid && view.regions === regions) view.regions = undefined;
        return valid;
      },
    );
    if (reading && excluded) {
      for (const blocks of reading.blocks.values())
        for (const { id, nodes } of blocks)
          if (excluded.has(id)) for (const node of nodes) readerTextNodeAllowed(window, node);
    } else readerTextSpans(window, new Set(regions.map((region) => region.pageIndex)));
  }
}
