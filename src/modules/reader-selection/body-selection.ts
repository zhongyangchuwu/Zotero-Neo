import { CleanupFailure } from '../../core/cleanup';
import { scheduleAfterPaint } from '../../platform/after-paint';
import type { ReaderLocalLayout, ReaderVisibleLayout } from '../../reader/local-layout';
import type { PdfWindow } from '../../reader/types';
import {
  leaseReaderTextAdmission,
  projectReadingViewport,
  readerPaintedTextLayer,
  readerReadingMode,
  readerTextNodeAllowed,
  type ReaderPaintedTextLayer,
  type ReaderReadingViewport,
  type ReaderTextSourceLocation,
} from '../../toolkit/reader';
import { bodyTextAdmission, isBodyExclusion } from './body-text';

export type SelectionLayout = Pick<
  ReaderLocalLayout,
  'ensureVisible' | 'visibleRegions' | 'visibleSnapshot' | 'prepareVisiblePage' | 'isCurrent'
>;

export interface BodySelectionHost {
  readonly layout: SelectionLayout;
  readonly isCurrent: () => boolean;
  readonly captureView: (window: PdfWindow) => () => boolean;
  readonly debug: (message: string) => void;
  readonly onChange?: () => void;
}

interface BodyLease {
  readonly snapshot: ReaderVisibleLayout;
  readonly reading: ReaderReadingViewport | undefined;
  readonly readyPages: readonly number[];
  readonly release: () => void;
  layers: ReadonlyMap<number, ReaderPaintedTextLayer>;
  marking?: Iterator<Text>;
}

interface BodyView {
  readonly current: () => boolean;
  cancel?: () => void;
  preparing?: Promise<void>;
  snapshot?: ReaderVisibleLayout | null;
  reading?: ReaderReadingViewport;
  lease?: BodyLease;
}

const MARK_BATCH = 192;

function* pdfText(
  window: PdfWindow,
  layers: ReadonlyMap<number, ReaderPaintedTextLayer>,
  pages: ReadonlySet<number>,
): IterableIterator<Text> {
  for (const page of pages) {
    const layer = layers.get(page);
    if (!layer) continue;
    const walker = window.document.createTreeWalker(layer.node, 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) yield node as Text;
  }
}

type BlockAdmission = 'body' | 'excluded' | 'unmapped';

function readingAdmission(
  reading: ReaderReadingViewport,
  snapshot: ReaderVisibleLayout,
  accepts: (source: ReaderTextSourceLocation) => boolean,
): ReadonlyMap<string, BlockAdmission> {
  const result = new Map<string, BlockAdmission>();
  for (const blocks of reading.blocks.values()) {
    for (const { id, position } of blocks) {
      const previous = result.get(id);
      if (!position?.rects.length || !snapshot.ready.has(position.pageIndex)) {
        result.set(id, 'unmapped');
      } else if (previous !== 'unmapped' && previous !== 'body') {
        const excluded = position.rects.every(
          (rect) => !accepts({ pageIndex: position.pageIndex, rect, sourceBlockId: null }),
        );
        result.set(id, excluded ? 'excluded' : 'body');
      }
    }
  }
  return result;
}

function* readingText(
  reading: ReaderReadingViewport,
  blocks: ReadonlyMap<string, BlockAdmission>,
): IterableIterator<Text> {
  for (const groups of reading.blocks.values())
    for (const { id, nodes } of groups) if (blocks.get(id) === 'excluded') yield* nodes;
}

function readingPageVisible(
  window: PdfWindow,
  reading: ReaderReadingViewport | undefined,
  page: number,
): boolean {
  if (!reading?.isCurrent()) return false;
  for (const [block, groups] of reading.blocks) {
    if (!groups.some(({ position }) => position?.pageIndex === page)) continue;
    const bounds = block.getBoundingClientRect();
    if (bounds.height > 0 && bounds.bottom > 0 && bounds.top < window.innerHeight) return true;
  }
  return false;
}

/** Warm only the exact Reader presentation's rendered viewport, one page at a time. */
export class ReaderBodySelection {
  readonly #host: BodySelectionHost;
  readonly #views = new Map<PdfWindow, BodyView>();
  #disposed = false;

  constructor(host: BodySelectionHost) {
    this.#host = host;
  }

  refreshLayout(window: PdfWindow): void {
    if (this.#disposed || !this.#host.isCurrent()) return;
    let view = this.#views.get(window);
    if (!view?.current()) {
      if (view) this.releaseView(window);
      const current = this.#host.captureView(window);
      if (!current()) return;
      const owner: BodyView = {
        current: () =>
          this.#views.get(window) === owner &&
          !this.#disposed &&
          this.#host.isCurrent() &&
          current(),
      };
      this.#views.set(window, owner);
      view = owner;
    }
    this.#enqueue(window, view);
  }

  releaseView(window: PdfWindow): void {
    const view = this.#views.get(window);
    if (!view) return;
    this.#views.delete(window);
    const { cancel, lease } = view;
    view.cancel = undefined;
    view.preparing = undefined;
    view.snapshot = undefined;
    view.reading = undefined;
    view.lease = undefined;
    const failure = new CleanupFailure();
    failure.run(() => cancel?.());
    failure.run(() => lease?.release());
    failure.rethrow();
  }

  dispose(): void {
    this.#disposed = true;
    const failure = new CleanupFailure();
    for (const window of this.#views.keys()) failure.run(() => this.releaseView(window));
    failure.rethrow();
  }

  #enqueue(window: PdfWindow, view: BodyView): void {
    if (view.cancel) return;
    view.cancel = scheduleAfterPaint(window, (deadline) => {
      view.cancel = undefined;
      if (this.#views.get(window) !== view) return;
      if (!view.current()) {
        this.releaseView(window);
        return;
      }
      try {
        this.#refresh(window, view, deadline);
      } catch (error) {
        this.#host.debug(`body selection unavailable: ${String(error)}`);
      }
    });
  }

  #refresh(window: PdfWindow, view: BodyView, deadline?: IdleDeadline): void {
    const { layout } = this.#host;
    const reflow = readerReadingMode(window);
    const reading = reflow ? projectReadingViewport(window, view.reading) : undefined;
    const snapshot =
      reflow && !reading?.pages.length ? null : layout.visibleSnapshot(window, reading?.pages);
    view.reading = reading;
    view.snapshot = snapshot;

    const layers = new Map<number, ReaderPaintedTextLayer>();
    if (!reading && snapshot)
      for (const page of snapshot.pages) {
        const layer = readerPaintedTextLayer(window, page);
        if (layer) layers.set(page, layer);
      }
    this.#publish(window, view, layers);
    if (view.lease && this.#mark(window, view.lease, deadline)) this.#enqueue(window, view);

    if (!snapshot || view.preparing) return;
    const page = snapshot.pages.find(
      (index) => !snapshot.ready.has(index) && (reading || layers.has(index)),
    );
    if (page === undefined) return;
    const wanted = (): boolean =>
      view.current() &&
      view.snapshot?.pages.includes(page) === true &&
      (reflow
        ? readingPageVisible(window, view.reading, page)
        : !!readerPaintedTextLayer(window, page));
    const preparing = layout.prepareVisiblePage(window, page, reading?.pages, wanted);
    view.preparing = preparing;
    void preparing.then(
      () => {
        view.preparing = undefined;
        if (view.current()) this.#enqueue(window, view);
      },
      (error: unknown) => {
        view.preparing = undefined;
        if (view.current()) this.#host.debug(`body selection unavailable: ${String(error)}`);
      },
    );
  }

  #publish(
    window: PdfWindow,
    view: BodyView,
    layers: ReadonlyMap<number, ReaderPaintedTextLayer>,
  ): void {
    const { layout } = this.#host;
    const { snapshot, reading, lease } = view;
    const readyPages =
      snapshot?.pages.filter((page) => snapshot.ready.has(page) && (reading || layers.has(page))) ??
      [];
    if (
      lease &&
      snapshot === lease.snapshot &&
      reading === lease.reading &&
      readyPages.length === lease.readyPages.length &&
      readyPages.every((page, index) => page === lease.readyPages[index])
    ) {
      if (
        !reading &&
        readyPages.some((page) => layers.get(page)?.marker !== lease.layers.get(page)?.marker)
      ) {
        lease.marking = this.#pdfMarks(window, lease.snapshot, layers, readyPages);
        lease.layers = layers;
      }
      return;
    }

    view.lease = undefined;
    lease?.release();
    if (!snapshot || !readyPages.length) {
      if (lease) this.#host.onChange?.();
      return;
    }

    const regions = readyPages.flatMap((page) => snapshot.ready.get(page) ?? []);
    const acceptsGeometry = bodyTextAdmission(regions);
    const blocks = reading && readingAdmission(reading, snapshot, acceptsGeometry);
    const ready = (source: ReaderTextSourceLocation): boolean => {
      if (blocks) {
        const block = blocks.get(source.sourceBlockId ?? '');
        return block !== undefined && block !== 'unmapped';
      }
      return (
        source.pageIndex !== null && source.rect !== null && readyPages.includes(source.pageIndex)
      );
    };
    const next: BodyLease = {
      snapshot,
      reading,
      readyPages,
      layers,
      release: leaseReaderTextAdmission(
        window,
        blocks
          ? (source) => blocks.get(source.sourceBlockId ?? '') !== 'excluded'
          : acceptsGeometry,
        () => view.lease === next && view.current() && layout.isCurrent(),
        () =>
          (!reading || reading.isCurrent()) &&
          layout.visibleSnapshot(window, reading?.pages) === snapshot &&
          (!!reading || readyPages.every((page) => !!readerPaintedTextLayer(window, page))),
        ready,
      ),
      marking:
        reading && blocks
          ? readingText(reading, blocks)
          : this.#pdfMarks(window, snapshot, layers, readyPages),
    };
    view.lease = next;
    this.#host.onChange?.();
  }

  #pdfMarks(
    window: PdfWindow,
    snapshot: ReaderVisibleLayout,
    layers: ReadonlyMap<number, ReaderPaintedTextLayer>,
    readyPages: readonly number[],
  ): Iterator<Text> {
    return pdfText(
      window,
      layers,
      new Set(readyPages.filter((page) => snapshot.ready.get(page)?.some(isBodyExclusion))),
    );
  }

  #mark(window: PdfWindow, lease: BodyLease, deadline?: IdleDeadline): boolean {
    if (!lease.marking) return false;
    for (let i = 0; i < MARK_BATCH; i++) {
      if (i > 0 && deadline && deadline.timeRemaining() < 1) return true;
      const node = lease.marking.next();
      if (node.done) {
        lease.marking = undefined;
        return false;
      }
      if (node.value.isConnected && node.value.length) readerTextNodeAllowed(window, node.value);
    }
    return true;
  }
}
