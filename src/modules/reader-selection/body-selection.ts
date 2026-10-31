import { analysisPDF, type AnalysisPDF } from '../../platform/document-analysis';
import { nativeDocumentPages, nativeParsedDocument } from '../../document-analysis/native';
import {
  leaseReaderTextAdmission,
  readerTextSpans,
  structuredDocumentData,
  type ReaderRuntime,
  type ReaderTextSourceLocation,
} from '../../toolkit/reader';
import { CleanupFailure } from '../../core/cleanup';
import { bodyTextAdmission } from './body-text';

export interface BodySelectionHost {
  readonly reader: ReaderRuntime;
  readonly isCurrent: () => boolean;
  readonly capturePresentation: (window: Window) => () => boolean;
  readonly captureView: (window: Window) => () => boolean;
  readonly showStatus: (message: string) => void;
  readonly text: (key: string) => string;
  readonly debug: (message: string) => void;
}

interface BodyLayout {
  readonly pdf: AnalysisPDF;
  readonly accepts: (source: ReaderTextSourceLocation) => boolean;
}

/** A Reader-session switch owns layout preparation and exact-view policy leases; no global native patches. */
export class ReaderBodySelection {
  readonly #host: BodySelectionHost;
  readonly #views = new Map<Window, { current: () => boolean; dispose: () => void }>();
  #enabled = false;
  #pending = false;
  #disposed = false;
  #revision = 0;
  #layout: BodyLayout | null = null;
  #loading: Promise<BodyLayout> | null = null;

  constructor(host: BodySelectionHost) {
    this.#host = host;
  }

  async toggle(window: Window): Promise<void> {
    if (this.#disposed || !this.#host.isCurrent()) return;
    const revision = ++this.#revision;
    const current = this.#host.capturePresentation(window);
    if (this.#enabled || this.#pending) {
      this.#enabled = this.#pending = false;
      this.#releaseViews();
      this.#host.showStatus(this.#host.text('all'));
      return;
    }
    this.#pending = true;
    this.#host.showStatus(this.#host.text('preparing'));
    try {
      const layout = await this.#load();
      if (this.#disposed || revision !== this.#revision || !current()) return;
      if (!(await layout.pdf.isCurrent())) {
        this.#layout = null;
        throw new Error('PDF changed; reopen the Reader');
      }
      if (this.#disposed || revision !== this.#revision || !current()) return;
      this.#enabled = true;
      this.bind(window);
      this.#host.showStatus(this.#host.text('body'));
    } catch (error) {
      if (!this.#disposed && revision === this.#revision && current()) {
        this.#host.showStatus(this.#host.text('unavailable'));
        this.#host.debug(`body selection unavailable: ${String(error)}`);
      }
    } finally {
      if (revision === this.#revision) this.#pending = false;
    }
  }

  bind(window: Window): void {
    if (!this.#enabled || !this.#layout || this.#disposed || !this.#host.isCurrent()) return;
    const old = this.#views.get(window);
    if (old?.current()) return;
    old?.dispose();
    const current = this.#host.captureView(window);
    if (!current()) return;
    const dispose = leaseReaderTextAdmission(window, this.#layout.accepts, current);
    this.#views.set(window, { current, dispose });
    readerTextSpans(window);
  }

  dispose(): void {
    this.#disposed = true;
    this.#revision++;
    this.#layout = null;
    this.#releaseViews();
  }

  releaseView(window: Window): void {
    const view = this.#views.get(window);
    this.#views.delete(window);
    view?.dispose();
  }

  #releaseViews(): void {
    const views = [...this.#views.values()];
    this.#views.clear();
    const failure = new CleanupFailure();
    for (const view of views) failure.run(view.dispose);
    failure.rethrow();
  }

  #load(): Promise<BodyLayout> {
    if (this.#layout) return Promise.resolve(this.#layout);
    if (this.#loading) return this.#loading;
    const current = (): boolean => !this.#disposed && this.#host.isCurrent();
    this.#loading = (async () => {
      if (!this.#host.reader.itemID) throw new Error('No PDF attachment');
      const pdf = await analysisPDF(this.#host.reader.itemID);
      if (!current()) throw new Error('Body selection retired');
      const data = await structuredDocumentData(this.#host.reader.itemID, current);
      if (!current() || !data) throw new Error('Native layout unavailable');
      const source = {
        fingerprint: pdf.fingerprint,
        fileName: pdf.fileName,
        pages: nativeDocumentPages(data.catalog),
      };
      const parsed = nativeParsedDocument(source, data);
      const layout = { pdf, accepts: bodyTextAdmission(parsed.regions) };
      if (!current()) throw new Error('Body selection retired');
      this.#layout = layout;
      return layout;
    })().finally(() => {
      this.#loading = null;
    });
    return this.#loading;
  }
}
