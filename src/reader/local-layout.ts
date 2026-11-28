import type { DocumentRegion } from '../document-analysis/contracts';
import { localVisibleRegions } from '../document-analysis/local-rules';
import { createAbortController } from '../platform/abort-controller';
import { scheduleAfterPaint } from '../platform/after-paint';
import { openPdfSource, type PdfExtractionSource } from '../toolkit/pdf-source';
import {
  readerPdfSource,
  type ReaderPdfSource,
  type ReaderPdfViewport,
} from '../toolkit/reader/document-source';
import { readerIsClosed } from '../toolkit/reader/host';
import type { PdfWindow, ReaderRuntime } from './types';

const PAGE_CACHE_SIZE = 16;
// Reserve room for both splits. At overview zoom, PDF.js lists the most visible pages first.
const VISIBLE_PAGE_BUDGET = PAGE_CACHE_SIZE / 2;
const ADMISSION_PAGE_BUDGET = 2;
const EMPTY: readonly DocumentRegion[] = [];
type Regions = readonly DocumentRegion[];

interface PageWork {
  scan: boolean;
  screened: boolean;
  foreground: boolean;
  resume?: () => void;
  readonly visible: Set<() => boolean>;
  readonly promise: Promise<Regions | null>;
}

interface VisibleSnapshot {
  readonly viewport: ReaderPdfViewport;
  readonly parts: readonly Regions[];
  readonly regions: Regions;
}

/** A ready page may have no regions. Object identity fences the pages and their geometry. */
export interface ReaderVisibleLayout {
  readonly pages: readonly number[];
  readonly ready: ReadonlyMap<number, Regions>;
}

interface VisibleRequest {
  readonly viewport: ReaderPdfViewport;
  readonly mappedPages: readonly number[] | undefined;
}

/** Geometry belongs to exactly one loaded PDF and never outlives the Reader session. */
export class ReaderLocalLayout {
  readonly #reader: ReaderRuntime;
  readonly #abort = createAbortController();
  readonly #retired = Promise.withResolvers<void>();
  readonly #pages = new Map<number, Regions>();
  readonly #pending = new Map<number, PageWork>();
  readonly #requests = new Map<PdfWindow, VisibleRequest>();
  #views = new WeakMap<PdfWindow, VisibleSnapshot>();
  #admissionViews = new WeakMap<
    PdfWindow,
    { readonly viewport: ReaderPdfViewport; readonly snapshot: ReaderVisibleLayout }
  >();
  #source: ReaderPdfSource | null = null;
  #pdf: Promise<PdfExtractionSource> | null = null;
  #figures: Promise<Regions> | null = null;
  #visibleLoad: Promise<void> | null = null;

  constructor(reader: ReaderRuntime) {
    this.#reader = reader;
  }

  /** Cheap source fence for actions holding regions across asynchronous work. */
  isCurrent(): boolean {
    if (this.#abort.signal.aborted) return false;
    try {
      if (!readerIsClosed(this.#reader) && (!this.#source || this.#source.isCurrent())) return true;
    } catch {
      // Firefox can revoke a Reader window wrapper during teardown.
    }
    this.dispose();
    return false;
  }

  figures(): Promise<Regions> {
    if (!this.isCurrent()) return Promise.resolve(EMPTY);
    if (this.#figures) return this.#figures;
    const source = (this.#source ??= readerPdfSource(this.#reader));
    if (!source) return Promise.reject(new Error('Loaded PDF source unavailable'));
    return (this.#figures = Promise.race([
      this.#scanFigures(source.pageCount),
      this.#retired.promise.then(() => EMPTY),
    ]));
  }

  ensureVisible(window: PdfWindow, mappedPages?: readonly number[]): Promise<void> {
    const viewport = this.#viewport(window, mappedPages);
    if (!viewport?.pages.length) return Promise.resolve();
    this.#requests.set(window, { viewport, mappedPages });
    return (this.#visibleLoad ??= Promise.race([
      Promise.resolve().then(() => this.#loadVisible()),
      this.#retired.promise,
    ]));
  }

  visibleRegions(window: PdfWindow, mappedPages?: readonly number[]): Regions {
    const viewport = this.#viewport(window, mappedPages);
    if (!viewport) return EMPTY;
    const parts: Regions[] = [];
    for (const index of viewport.pages.slice(0, VISIBLE_PAGE_BUDGET).sort((a, b) => a - b)) {
      const regions = this.#pages.get(index);
      if (regions?.length) parts.push(regions);
    }
    if (!parts.length) return EMPTY;
    const previous = this.#views.get(window);
    if (
      previous?.viewport.identity === viewport.identity &&
      previous.viewport.presentation === viewport.presentation &&
      previous.viewport.document === viewport.document &&
      previous.parts.length === parts.length &&
      parts.every((part, index) => part === previous.parts[index])
    )
      return previous.regions;
    const regions = parts.length === 1 ? parts[0]! : parts.flat();
    this.#views.set(window, { viewport, parts, regions });
    return regions;
  }

  visibleSnapshot(window: PdfWindow, mappedPages?: readonly number[]): ReaderVisibleLayout | null {
    const viewport = this.#viewport(window, mappedPages);
    if (!viewport) return null;
    const pages = viewport.pages.slice(0, ADMISSION_PAGE_BUDGET);
    const entry = this.#admissionViews.get(window);
    const previous =
      entry?.viewport.identity === viewport.identity &&
      entry.viewport.presentation === viewport.presentation &&
      entry.viewport.document === viewport.document
        ? entry.snapshot
        : undefined;
    // Keep already-ready pages while they remain in this view, even when
    // offscreen work churns the LRU.
    const regionsFor = (page: number): Regions | undefined =>
      this.#pages.get(page) ?? previous?.ready.get(page);
    if (
      previous?.pages.length === pages.length &&
      pages.every(
        (page) => previous.pages.includes(page) && previous.ready.get(page) === regionsFor(page),
      )
    )
      return previous;

    const ready = new Map<number, Regions>();
    for (const page of pages) {
      const regions = regionsFor(page);
      if (regions) {
        ready.set(page, regions);
        if (this.#pages.delete(page)) this.#pages.set(page, regions);
      }
    }
    const snapshot = { pages, ready };
    this.#admissionViews.set(window, { viewport, snapshot });
    return snapshot;
  }

  async prepareVisiblePage(
    window: PdfWindow,
    page: number,
    mappedPages?: readonly number[],
    wanted?: () => boolean,
  ): Promise<void> {
    const requested = this.#viewport(window, mappedPages);
    if (!requested || !this.#admissionPage(requested, page) || (wanted && !wanted())) return;
    await this.#page(
      page,
      false,
      () => {
        if (wanted && !wanted()) return false;
        const viewport = this.#viewport(window, mappedPages);
        return (
          viewport?.identity === requested.identity &&
          viewport.presentation === requested.presentation &&
          viewport.document === requested.document &&
          this.#admissionPage(viewport, page)
        );
      },
      false,
    );
  }

  dispose(): void {
    if (this.#abort.signal.aborted) return;
    this.#retired.resolve();
    this.#abort.abort();
    this.#pages.clear();
    this.#pending.clear();
    this.#requests.clear();
    this.#admissionViews = new WeakMap();
    this.#views = new WeakMap();
    this.#source = null;
    this.#pdf = null;
    this.#figures = null;
  }

  #viewport(window: PdfWindow, mappedPages?: readonly number[]): ReaderPdfViewport | null {
    if (!this.isCurrent()) return null;
    try {
      return (
        (this.#source ??= readerPdfSource(this.#reader))?.viewport(window, mappedPages) ?? null
      );
    } catch {
      return null;
    }
  }

  #admissionPage(viewport: ReaderPdfViewport, page: number): boolean {
    const offset = viewport.pages.indexOf(page);
    return offset >= 0 && offset < ADMISSION_PAGE_BUDGET;
  }

  async #scanFigures(pageCount: number): Promise<Regions> {
    const figures: DocumentRegion[] = [];
    try {
      for (let index = 0; index < pageCount && this.isCurrent(); index++) {
        const regions = await this.#page(index, true);
        if (!regions) continue;
        for (const region of regions)
          if (region.kind === 'caption' || region.kind === 'image' || region.kind === 'table')
            figures.push(region);
      }
    } catch (error) {
      if (this.isCurrent()) throw error;
    }
    return this.isCurrent() ? figures : EMPTY;
  }

  async #loadVisible(): Promise<void> {
    try {
      for (const [window, { viewport: requested, mappedPages }] of this.#requests) {
        this.#requests.delete(window);
        for (const index of requested.pages.slice(0, VISIBLE_PAGE_BUDGET)) {
          if (this.#requests.has(window)) break;
          const current = (): boolean => {
            const latest = this.#requests.get(window);
            const viewport = this.#viewport(window, latest ? latest.mappedPages : mappedPages);
            const offset = viewport?.pages.indexOf(index) ?? -1;
            return (
              viewport?.identity === requested.identity &&
              viewport.presentation === requested.presentation &&
              viewport.document === requested.document &&
              offset >= 0 &&
              offset < VISIBLE_PAGE_BUDGET
            );
          };
          if (current()) await this.#page(index, false, current);
        }
      }
    } catch (error) {
      this.#requests.clear();
      if (this.isCurrent()) throw error;
    } finally {
      this.#visibleLoad = null;
    }
  }

  #page(
    index: number,
    scan: boolean,
    visible?: () => boolean,
    foreground = true,
  ): Promise<Regions | null> {
    const cached = this.#pages.get(index);
    if (cached) {
      if (visible) {
        this.#pages.delete(index);
        this.#pages.set(index, cached);
      }
      return Promise.resolve(cached);
    }
    const pending = this.#pending.get(index);
    if (pending) {
      pending.scan ||= scan;
      if (visible) pending.visible.add(visible);
      if (foreground) {
        pending.foreground = true;
        pending.resume?.();
      }
      return pending.promise.then((regions) => {
        if (regions) return regions;
        // A newer consumer may attach after the previous geometry decision.
        if (visible?.() || (scan && !pending.screened && this.isCurrent()))
          return this.#page(index, scan, visible, foreground);
        return null;
      });
    }
    const promise = Promise.resolve()
      .then(() => this.#readPage(index, work))
      .finally(() => this.#pending.delete(index));
    const work: PageWork = {
      scan,
      screened: false,
      foreground,
      visible: new Set(visible ? [visible] : []),
      promise,
    };
    this.#pending.set(index, work);
    return promise;
  }

  async #readPage(index: number, work: PageWork): Promise<Regions | null> {
    const source = this.#source;
    const visible = (): boolean => {
      for (const current of work.visible) if (current()) return true;
      return false;
    };
    if (!source || !this.isCurrent() || (!work.scan && !visible())) return null;
    const pdf = await (this.#pdf ??= openPdfSource(source.read, this.#abort.signal, source.realm));
    if (!this.isCurrent() || (!work.scan && !visible())) return null;
    if (pdf.pageCount !== source.pageCount) throw new Error('Loaded PDF page count changed');
    const page = await pdf.readPage(
      index,
      (hasCaption) => {
        if (!this.isCurrent()) return false;
        if (visible()) return true;
        if (!work.scan) return false;
        work.screened = true;
        return hasCaption();
      },
      () => {
        if (!this.isCurrent() || (!work.scan && !visible())) return false;
        if (work.foreground) return true;
        const host = source.realm ?? Zotero.getMainWindow();
        if (!host || host.closed) throw new Error('PDF layout host unavailable');
        return this.#yieldGeometry(host, work).then(
          () => this.isCurrent() && (work.scan || visible()),
        );
      },
    );
    if (!page || !this.isCurrent() || (!work.scan && !visible())) return null;
    const regions = localVisibleRegions(page);
    this.#pages.set(index, regions);
    if (this.#pages.size > PAGE_CACHE_SIZE) this.#pages.delete(this.#pages.keys().next().value!);
    return regions;
  }

  #yieldGeometry(window: Window, work: PageWork): Promise<void> {
    const signal = this.#abort.signal;
    const { promise, resolve } = Promise.withResolvers<void>();
    const finish = (): void => {
      work.resume = undefined;
      signal.removeEventListener('abort', resume);
      resolve();
    };
    const cancel = scheduleAfterPaint(window, finish);
    if (!cancel) throw new Error('PDF layout host cannot schedule idle work');
    const resume = (): void => {
      try {
        cancel();
      } catch {
        // The host window may already be revoked during shutdown.
      }
      finish();
    };
    work.resume = resume;
    signal.addEventListener('abort', resume, { once: true });
    return promise;
  }
}
