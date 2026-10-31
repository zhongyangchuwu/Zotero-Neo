import { analysisPDF } from '../../platform/document-analysis';
import {
  nativeDocumentPages,
  nativeParsedDocument,
  nativeDocumentTextRegions,
} from '../../document-analysis/native';
import type { DocumentRegion, NativeDocumentData } from '../../document-analysis/contracts';
import type { ReaderCachedDocument } from '../../reader/document-cache';
import {
  leaseReaderTextAdmission,
  readerReadingMode,
  readerTextSpans,
  structuredDocumentData,
  type ReaderRuntime,
  type ReaderTextSourceLocation,
} from '../../toolkit/reader';
import { CleanupFailure } from '../../core/cleanup';
import { bodyTextAdmission } from './body-text';

export interface BodySelectionHost {
  readonly reader: ReaderRuntime;
  readonly readCache?: () => Promise<ReaderCachedDocument | null>;
  readonly isCurrent: () => boolean;
  readonly capturePresentation: (window: Window) => () => boolean;
  readonly captureView: (window: Window) => () => boolean;
  readonly showStatus: (message: string) => void;
  readonly text: (key: string) => string;
  readonly debug: (message: string) => void;
  readonly onChange?: () => void;
}

interface BodyLayout {
  readonly isCurrent: () => Promise<boolean>;
  readonly accepts: (source: ReaderTextSourceLocation) => boolean;
  readonly cached: boolean;
}

/** A Reader-session switch owns source preparation and exact-view leases; native mouse selection is unchanged. */
export class ReaderBodySelection {
  readonly #host: BodySelectionHost;
  readonly #views = new Map<Window, { current: () => boolean; dispose: () => void }>();
  readonly #layouts = new Map<boolean, BodyLayout>();
  readonly #loading = new Map<boolean, Promise<BodyLayout>>();
  #native: Promise<NativeDocumentData | null> | null = null;
  #enabled = false;
  #pending = false;
  #disposed = false;
  #revision = 0;

  constructor(host: BodySelectionHost) {
    this.#host = host;
  }

  async toggle(window: Window): Promise<void> {
    if (this.#disposed || !this.#host.isCurrent()) return;
    if (this.#enabled || this.#pending) {
      this.invalidate();
      this.#host.showStatus(this.#host.text('all'));
      return;
    }
    const revision = this.#revision;
    const current = this.#host.capturePresentation(window);
    this.#pending = true;
    this.#host.showStatus(this.#host.text('preparing'));
    try {
      const layout = await this.#load(readerReadingMode(window));
      if (!this.#current(revision) || !current()) return;
      if (!(await layout.isCurrent())) throw new Error('Document source changed');
      if (!this.#current(revision) || !current()) return;
      this.#enabled = true;
      this.bind(window);
      this.#host.showStatus(this.#host.text(layout.cached ? 'cached' : 'body'));
    } catch (error) {
      if (this.#current(revision) && current()) this.#unavailable(error);
    } finally {
      if (revision === this.#revision) this.#pending = false;
    }
  }

  /** A newly displayed Reading Mode obtains its own native block mapping; PDF never waits for SDT on a cache hit. */
  bind(window: Window): void {
    if (!this.#enabled || this.#disposed || !this.#host.isCurrent()) return;
    const old = this.#views.get(window);
    if (old?.current()) return;
    old?.dispose();
    const current = this.#host.captureView(window);
    if (!current()) return;
    const reading = readerReadingMode(window);
    const layout = this.#layouts.get(reading);
    if (!layout) {
      const revision = this.#revision;
      if (this.#loading.has(reading)) return;
      this.#host.showStatus(this.#host.text('preparing'));
      void this.#load(reading)
        .then(async (prepared) => {
          if (!this.#current(revision) || !this.#enabled || !current()) return;
          if (!(await prepared.isCurrent())) throw new Error('Document source changed');
          if (!this.#current(revision) || !this.#enabled || !current()) return;
          this.bind(window);
          this.#host.showStatus(this.#host.text(prepared.cached ? 'cached' : 'body'));
        })
        .catch((error: unknown) => {
          if (this.#current(revision) && current()) this.#unavailable(error);
        });
      return;
    }
    const revision = this.#revision;
    const live = (): boolean => this.#current(revision) && this.#enabled && current();
    const dispose = leaseReaderTextAdmission(window, layout.accepts, live, async () => {
      if (!live()) return false;
      const valid = await layout.isCurrent();
      if (!valid && this.#current(revision))
        this.#unavailable(new Error('Document source changed'));
      return valid && live();
    });
    this.#views.set(window, { current: live, dispose });
    readerTextSpans(window);
    this.#host.onChange?.();
  }

  /** Replacing the cache/service retires policy synchronously; the next explicit toggle prepares fresh data. */
  invalidate(): void {
    this.#revision++;
    this.#enabled = this.#pending = false;
    this.#layouts.clear();
    this.#loading.clear();
    this.#native = null;
    this.#releaseViews();
    if (!this.#disposed) this.#host.onChange?.();
  }

  dispose(): void {
    this.#disposed = true;
    this.invalidate();
  }

  releaseView(window: Window): void {
    const view = this.#views.get(window);
    this.#views.delete(window);
    view?.dispose();
  }

  #current(revision: number): boolean {
    return !this.#disposed && revision === this.#revision && this.#host.isCurrent();
  }

  #unavailable(error: unknown): void {
    this.invalidate();
    this.#host.showStatus(this.#host.text('unavailable'));
    this.#host.debug(`body selection unavailable: ${String(error)}`);
  }

  #releaseViews(): void {
    const views = [...this.#views.values()];
    this.#views.clear();
    const failure = new CleanupFailure();
    for (const view of views) failure.run(view.dispose);
    failure.rethrow();
  }

  #load(reading: boolean): Promise<BodyLayout> {
    const prepared = this.#layouts.get(reading);
    if (prepared) return Promise.resolve(prepared);
    const pending = this.#loading.get(reading);
    if (pending) return pending;
    const revision = this.#revision;
    const current = (): boolean => this.#current(revision);
    const task = (async (): Promise<BodyLayout> => {
      if (!this.#host.reader.itemID) throw new Error('No PDF attachment');
      let cached: ReaderCachedDocument | null = null;
      try {
        cached = (await this.#host.readCache?.()) ?? null;
      } catch {
        if (current()) this.#host.debug('Body cache unavailable; using native layout');
      }
      if (!current()) throw new Error('Body selection retired');
      // Reading Mode exposes native ref paths, not cloud IDs. Map only complete
      // native source fragments; never interpret an OCR region as a character anchor.
      const pdf = cached ? null : await analysisPDF(this.#host.reader.itemID);
      if (!current()) throw new Error('Body selection retired');
      let native: readonly DocumentRegion[] = [];
      if (reading || !cached) {
        this.#native ??= structuredDocumentData(this.#host.reader.itemID, current);
        const data = await this.#native;
        if (!current() || !data) throw new Error('Native layout unavailable');
        if (pdf)
          nativeParsedDocument(
            {
              fingerprint: pdf.fingerprint,
              fileName: pdf.fileName,
              pages: nativeDocumentPages(data.catalog),
            },
            data,
          );
        else if (cached)
          nativeParsedDocument(
            {
              fingerprint: cached.parsed.sourceFingerprint,
              fileName: '',
              pages: cached.parsed.pages,
            },
            data,
          );
        native = nativeDocumentTextRegions(data);
      }
      const isCurrent = cached?.isCurrent ?? pdf!.isCurrent;
      const layout: BodyLayout = {
        isCurrent,
        cached: !!cached,
        accepts: bodyTextAdmission(cached?.parsed.regions ?? native, native),
      };
      if (!current()) throw new Error('Body selection retired');
      this.#layouts.set(reading, layout);
      return layout;
    })().finally(() => {
      if (this.#loading.get(reading) === task) this.#loading.delete(reading);
    });
    this.#loading.set(reading, task);
    return task;
  }
}
