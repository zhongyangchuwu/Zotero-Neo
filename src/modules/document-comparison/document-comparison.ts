import { mineruCredentialField, type MinerUCredentialField } from '../../ui/mineru-credentials';
import type { PreferenceStore } from '../../core/preference-store';
import { CleanupFailure } from '../../core/cleanup';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { t } from '../../i18n';
import { compareDocuments } from '../../document-analysis/compare';
import {
  analyzeDocument,
  analyzeParsedDocument,
  type AnalyzedDocument,
} from '../../document-analysis/analyze';
import type { DocumentResultCache } from '../../document-analysis/cache';
import { documentObjectLocation } from '../../document-analysis/object-groups';
import type {
  DocumentSource,
  DocumentLocation,
  DocumentParser,
} from '../../document-analysis/contracts';
import { nativeDocumentPages, nativeDocumentParser } from '../../document-analysis/native';
import { oxrDocumentParser } from '../../document-analysis/oxr';
import { mineruDocumentParser } from '../../document-analysis/mineru';
import {
  analysisPDF,
  requestDocumentJSON,
  documentServiceTransport,
  type AnalysisPDF,
} from '../../platform/document-analysis';
import { documentMarkupText } from '../../platform/document-markup';
import { attachmentDocumentCache } from '../../platform/document-analysis-cache';
import {
  readerWindow,
  readerDocumentPageGeometry,
  structuredDocumentData,
  type ReaderRuntime,
} from '../../toolkit/reader';
import { THEME_VARS } from '../../ui/theme';
import {
  DOCUMENT_PROVIDER_KEY,
  OXR_ENDPOINT_KEY,
  DEFAULT_OXR_ENDPOINT,
} from '../../document-analysis/settings';

const H = 'http://www.w3.org/1999/xhtml';

function comparisonButton(doc: Document, text: string): HTMLButtonElement {
  const button = doc.createElementNS(H, 'button') as HTMLButtonElement;
  button.type = 'button';
  button.textContent = text;
  button.style.cssText = `padding:4px 9px;border:1px solid ${THEME_VARS.border};border-radius:4px;background:${THEME_VARS.input};color:${THEME_VARS.text};cursor:pointer;font:inherit`;
  return button;
}

function comparisonTarget(
  doc: Document,
  title: string,
  text: string,
  action: string,
  run: () => void,
): HTMLDetailsElement {
  const details = doc.createElementNS(H, 'details') as HTMLDetailsElement;
  details.style.cssText = `padding:6px 0;border-bottom:1px solid ${THEME_VARS.border}`;
  const heading = doc.createElementNS(H, 'summary');
  heading.textContent = title;
  const content = doc.createElementNS(H, 'p');
  content.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
  content.textContent = text;
  const jump = comparisonButton(doc, action);
  jump.addEventListener('click', run);
  details.append(heading, content, jump);
  return details;
}

export interface DocumentComparisonHost {
  readonly reader: ReaderRuntime;
  readonly preferences: PreferenceStore;
  readonly language: () => KeyGuideLanguage;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly copyText: (text: string) => void;
  readonly navigate: (location: DocumentLocation) => void | Promise<void>;
  readonly focusReader: () => void;
  readonly isCurrent: () => boolean;
  readonly debug: (message: string) => void;
  readonly onCacheSaved?: () => void;
}

interface ComparisonView {
  readonly backdrop: HTMLElement;
  readonly root: HTMLElement;
  readonly status: HTMLElement;
  readonly results: HTMLElement;
  readonly cloudButton: HTMLButtonElement;
  readonly refreshButton: HTMLButtonElement;
  readonly endpoint: HTMLInputElement;
  readonly provider: HTMLSelectElement;
  readonly key: HTMLInputElement;
  readonly credentials: MinerUCredentialField;
  readonly abort: AbortController;
  readonly untheme: () => void;
  prepared?: {
    readonly source: DocumentSource;
    readonly pdf: AnalysisPDF;
    readonly cache: DocumentResultCache;
  };
  cloudRevision: number;
  cloudState?: 'cached' | 'saved' | 'unsaved';
  cloudSavedAt?: number;
  cloudNotice?: string;
  cloudPending?: boolean;
  native?: AnalyzedDocument;
  nativeError?: string;
  cloud?: AnalyzedDocument;
}

/** One explicit comparison owns preparation, network cancellation, presentation and stale-result fencing. */
export class ReaderDocumentComparison {
  readonly #host: DocumentComparisonHost;
  #view: ComparisonView | null = null;

  constructor(host: DocumentComparisonHost) {
    this.#host = host;
  }

  #text(key: string): string {
    return t(`documentAnalysis.${key}`, this.#host.language());
  }

  #current(view: ComparisonView): boolean {
    return (
      this.#view === view &&
      !view.abort.signal.aborted &&
      this.#host.isCurrent() &&
      view.root.isConnected
    );
  }

  open(): void {
    this.close(false);
    const window = readerWindow(this.#host.reader);
    if (!window || !this.#host.reader.itemID || !this.#host.isCurrent()) return;
    const doc = window.document;
    const element = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      text = '',
    ): HTMLElementTagNameMap[K] => {
      const node = doc.createElementNS(H, tag) as HTMLElementTagNameMap[K];
      node.textContent = text;
      return node;
    };
    const root = element('section');
    const backdrop = element('div');
    backdrop.style.cssText = `position:fixed;inset:0;z-index:2147483644;background:${THEME_VARS.backdrop}`;
    root.dataset.zvDocumentComparison = '1';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', this.#text('title'));
    root.style.cssText = `position:fixed;inset:5%;z-index:2147483645;overflow:auto;padding:20px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 8px 40px #0006;font:menu`;
    const title = element('h2', this.#text('title'));
    const note = element('p', this.#text('description'));
    const controls = element('div');
    controls.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:center';
    const endpoint = element('input');
    endpoint.type = 'url';
    endpoint.value = this.#host.preferences.get(OXR_ENDPOINT_KEY, DEFAULT_OXR_ENDPOINT);
    endpoint.setAttribute('aria-label', this.#text('endpoint'));
    endpoint.style.width = 'min(420px,80%)';
    const provider = element('select');
    provider.setAttribute('aria-label', this.#text('provider'));
    for (const [value, label] of [
      ['mineru', 'MinerU'],
      ['oxr', 'OXR'],
    ]) {
      const option = element('option', label);
      option.value = value;
      provider.append(option);
    }
    provider.value =
      this.#host.preferences.get(DOCUMENT_PROVIDER_KEY, 'mineru') === 'oxr' ? 'oxr' : 'mineru';
    endpoint.hidden = provider.value === 'mineru';
    const credentials = mineruCredentialField(
        doc,
        this.#host.language,
        provider.value === 'mineru',
      ),
      key = credentials.input;
    const cloudButton = comparisonButton(doc, this.#text('parseCloud'));
    cloudButton.disabled = true;
    const refreshButton = comparisonButton(doc, this.#text('refreshCloud'));
    refreshButton.disabled = true;
    const copy = comparisonButton(doc, this.#text('copyReport'));
    const close = comparisonButton(doc, this.#text('close'));
    controls.append(provider, endpoint, credentials.root, cloudButton, refreshButton, copy, close);
    const status = element('p', this.#text('preparing'));
    status.setAttribute('role', 'status');
    const results = element('div');
    results.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px';
    root.append(title, note, controls, status, results);
    backdrop.append(root);
    doc.documentElement.append(backdrop);
    const abort = new (window as Window & typeof globalThis).AbortController();
    const view: ComparisonView = {
      root,
      backdrop,
      status,
      results,
      endpoint,
      provider,
      key,
      credentials,
      cloudButton,
      refreshButton,
      cloudRevision: 0,
      abort,
      untheme: this.#host.themeRoot(backdrop),
    };
    this.#view = view;
    close.addEventListener('click', () => this.close(true));
    backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === backdrop) {
        event.preventDefault();
        this.close(true);
      }
    });
    cloudButton.addEventListener('click', () => {
      void this.#cloud(view);
    });
    refreshButton.addEventListener('click', () => {
      void this.#cloud(view, true);
    });
    endpoint.addEventListener('change', () => {
      void this.#restoreCloud(view);
    });
    provider.addEventListener('change', () => {
      endpoint.hidden = provider.value === 'mineru';
      credentials.setMinerU(provider.value === 'mineru');
      this.#host.preferences.set(DOCUMENT_PROVIDER_KEY, provider.value);
      void this.#restoreCloud(view);
    });
    copy.addEventListener('click', () => {
      if (!this.#current(view)) return;
      this.#host.copyText(
        JSON.stringify(
          {
            schemaVersion: 1,
            source: view.prepared?.source ?? null,
            native: view.native ?? null,
            cloud: view.cloud ?? null,
            cloudCache: { state: view.cloudState ?? null, savedAt: view.cloudSavedAt ?? null },
            comparison:
              view.native && view.cloud ? compareDocuments(view.native, view.cloud) : null,
          },
          null,
          2,
        ),
      );
      status.textContent = this.#text('copied');
    });
    root.addEventListener('keydown', (event) => this.handleKey(event));
    close.focus();
    void this.#prepare(view);
  }

  /** Keep dialog keys out of Reader's matcher; Tab remains native and Escape closes this owner. */
  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view;
    if (!view || !event.target || !view.root.contains(event.target as Node)) return false;
    event.stopImmediatePropagation();
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      this.close(true);
    }
    if (event.key === 'Tab') {
      const controls = (
        Array.from(
          view.root.querySelectorAll('input,select,button,summary,[tabindex]'),
        ) as HTMLElement[]
      ).filter(
        (control) =>
          !(control as HTMLButtonElement).disabled && control.getClientRects().length > 0,
      );
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && event.target === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && event.target === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    return true;
  }

  close(focus = false): void {
    const view = this.#view;
    this.#view = null;
    if (!view) return;
    const cleanup = new CleanupFailure();
    cleanup.run(() => view.abort.abort());
    cleanup.run(() => view.credentials.dispose());
    cleanup.run(view.untheme);
    cleanup.run(() => view.backdrop.remove());
    cleanup.rethrow();
    if (focus && this.#host.isCurrent()) this.#host.focusReader();
  }

  async #prepare(view: ComparisonView): Promise<void> {
    try {
      const pdf = await analysisPDF(this.#host.reader.itemID!);
      if (!this.#current(view)) return;
      view.root.querySelector('h2')!.textContent = `${this.#text('title')} · ${pdf.fileName}`;
      const pages = await readerDocumentPageGeometry(this.#host.reader, () => this.#current(view));
      if (!this.#current(view)) return;
      const source = {
        fingerprint: pdf.fingerprint,
        fileName: pdf.fileName,
        pages: nativeDocumentPages({ pages }),
      };
      view.prepared = { source, pdf, cache: attachmentDocumentCache(this.#host.reader.itemID!) };
      void this.#restoreCloud(view);
      const native = await analyzeDocument(
        nativeDocumentParser(async (signal) => {
          const data = await structuredDocumentData(
            this.#host.reader.itemID,
            () => this.#current(view) && !signal.aborted,
          );
          if (!data) throw new Error('Native document structure unavailable');
          return data;
        }),
        source,
        { signal: view.abort.signal },
      );
      if (!this.#current(view)) return;
      if (!(await pdf.isCurrent())) throw new Error('PDF changed; reopen the comparison');
      if (!this.#current(view)) return;
      view.native = native;
      if (!view.cloudPending) view.status.textContent = this.#readyText(view);
      this.#render(view);
    } catch (error) {
      if (this.#current(view)) {
        view.nativeError = String(error);
        if (!view.cloudPending)
          view.status.textContent =
            view.cloud || view.cloudNotice ? this.#readyText(view) : view.nativeError;
        this.#render(view);
      }
    }
  }

  #readyText(view: ComparisonView): string {
    if (view.cloudNotice) return view.cloudNotice;
    if (!view.cloud) return this.#text('nativeReady');
    return this.#text(
      view.cloudState === 'cached'
        ? 'cacheReady'
        : view.cloudState === 'saved'
          ? 'saved'
          : 'notSaved',
    );
  }

  #busy(view: ComparisonView, busy: boolean): void {
    view.cloudPending = busy;
    view.cloudButton.disabled = view.refreshButton.disabled = busy || !view.prepared;
    view.endpoint.disabled = view.provider.disabled = busy;
    view.credentials.setDisabled(busy);
  }

  #parser(view: ComparisonView): DocumentParser {
    if (view.provider.value === 'mineru')
      return mineruDocumentParser({
        apiKey: view.key.value,
        readPDF: () => view.prepared!.pdf.read(),
        transport: documentServiceTransport,
        onProgress: (state, completed, total) => {
          if (!this.#current(view) || !view.cloudPending) return;
          const progress =
            completed !== undefined && total !== undefined ? ` ${completed}/${total}` : '';
          view.status.textContent = this.#text(`progress.${state}`) + progress;
        },
      });
    return oxrDocumentParser({
      baseURL: view.endpoint.value.trim(),
      apiKey: view.key.value,
      readPDF: () => view.prepared!.pdf.read(),
      request: requestDocumentJSON,
    });
  }

  #cloudCurrent(view: ComparisonView, revision: number): boolean {
    return this.#current(view) && view.cloudRevision === revision;
  }

  /** Cache lookup never initiates a network request, including invalid or unavailable cache files. */
  async #restoreCloud(view: ComparisonView): Promise<void> {
    if (!view.prepared || !this.#current(view) || view.cloudPending) return;
    const revision = ++view.cloudRevision;
    // A local lookup must not swallow the click that committed an edited endpoint.
    // An explicit parse may supersede it; the revision fences its late result.
    this.#busy(view, false);
    view.cloud = undefined;
    view.cloudState = undefined;
    view.cloudSavedAt = undefined;
    view.cloudNotice = undefined;
    this.#render(view);
    try {
      if (
        !(await this.#readCloud(view, this.#parser(view), revision)) &&
        this.#cloudCurrent(view, revision)
      ) {
        view.cloudNotice = this.#text('cacheMiss');
        view.status.textContent = view.cloudNotice;
      }
    } catch {
      if (this.#cloudCurrent(view, revision)) {
        this.#host.debug('Document analysis cache lookup unavailable');
        view.cloudNotice = this.#text('cacheUnavailable');
        view.status.textContent = view.cloudNotice;
      }
    }
  }

  async #readCloud(
    view: ComparisonView,
    parser: DocumentParser,
    revision: number,
  ): Promise<boolean> {
    const prepared = view.prepared!;
    if (!parser.cacheKey) return false;
    const cached = await prepared.cache.read(prepared.source, parser.cacheKey);
    if (!this.#cloudCurrent(view, revision)) return true;
    if (!cached) return false;
    if (!(await prepared.pdf.isCurrent())) throw new Error('PDF changed; reopen the comparison');
    if (!this.#cloudCurrent(view, revision)) return true;
    view.cloud = analyzeParsedDocument(cached.parsed, prepared.source);
    view.cloudState = 'cached';
    view.cloudSavedAt = cached.savedAt;
    view.cloudNotice = undefined;
    view.status.textContent = this.#readyText(view);
    this.#render(view);
    return true;
  }

  async #cloud(view: ComparisonView, refresh = false): Promise<void> {
    const prepared = view.prepared;
    if (!prepared || !this.#current(view) || view.cloudButton.disabled) return;
    const revision = ++view.cloudRevision;
    this.#busy(view, true);
    view.cloudNotice = undefined;
    view.status.textContent = this.#text('processing');
    try {
      const endpoint = view.endpoint.value.trim();
      const parser = this.#parser(view);
      if (!refresh) {
        try {
          if (await this.#readCloud(view, parser, revision)) return;
        } catch {
          this.#host.debug('Document analysis cache lookup unavailable');
        }
      }
      if (!this.#cloudCurrent(view, revision)) return;
      const result = await analyzeDocument(parser, prepared.source, { signal: view.abort.signal });
      if (!this.#cloudCurrent(view, revision)) return;
      if (!(await prepared.pdf.isCurrent())) throw new Error('PDF changed; reopen the comparison');
      if (!this.#cloudCurrent(view, revision)) return;
      if (view.provider.value === 'oxr') this.#host.preferences.set(OXR_ENDPOINT_KEY, endpoint);
      view.cloud = result;
      view.cloudState = 'unsaved';
      view.cloudSavedAt = undefined;
      this.#render(view);
      if (parser.cacheKey) {
        try {
          const saved = await prepared.cache.write(
            prepared.source,
            parser.cacheKey,
            result,
            async () =>
              this.#cloudCurrent(view, revision) &&
              (await prepared.pdf.isCurrent()) &&
              this.#cloudCurrent(view, revision),
          );
          if (!this.#cloudCurrent(view, revision)) return;
          view.cloudState = saved ? 'saved' : 'unsaved';
          if (saved) this.#host.onCacheSaved?.();
        } catch {
          this.#host.debug('Document analysis cache write unavailable');
        }
      }
      if (this.#cloudCurrent(view, revision)) {
        view.status.textContent = this.#readyText(view);
        this.#render(view);
      }
    } catch (error) {
      if (this.#cloudCurrent(view, revision)) {
        view.cloudNotice = String(error);
        view.status.textContent = view.cloudNotice;
      }
    } finally {
      if (this.#cloudCurrent(view, revision)) this.#busy(view, false);
    }
  }

  #render(view: ComparisonView): void {
    const doc = view.root.ownerDocument;
    view.results.replaceChildren();
    for (const [label, result, error] of [
      [this.#text('native'), view.native, view.nativeError],
      [view.provider.value === 'mineru' ? 'MinerU' : 'OXR', view.cloud, undefined],
    ] as const) {
      const section = doc.createElementNS(H, 'section');
      const title = doc.createElementNS(H, 'h3');
      title.textContent = label;
      section.append(title);
      if (!result && error) {
        const message = doc.createElementNS(H, 'p');
        message.textContent = error;
        section.append(message);
      }
      if (result) {
        const summary = doc.createElementNS(H, 'p');
        summary.textContent = `${result.pages.length} ${this.#text('pages')} · ${result.regions.length} ${this.#text('regions')} · ${this.#text('elapsed')} ${(result.durationMs / 1000).toFixed(1)}s`;
        section.append(summary);
        if (result === view.cloud && view.cloudState) {
          const cache = doc.createElementNS(H, 'p');
          cache.textContent =
            this.#readyText(view) +
            (view.cloudSavedAt ? ` · ${new Date(view.cloudSavedAt).toLocaleString()}` : '');
          section.append(cache);
        }
        for (const group of result.objectGroups.slice(0, 500)) {
          const location = documentObjectLocation(result.regions, group);
          const name =
            group.title.slice(0, 140) ||
            `${this.#text(`kind.${group.kind === 'figure' ? 'image' : 'table'}`)} · ${location.pageIndex + 1}`;
          section.append(
            comparisonTarget(
              doc,
              `${this.#text('objectGroup')} · ${name} · ${this.#text(`association.${group.association}`)}`,
              `${group.title}\n${this.#text('members')}: ${group.memberRegionIds.length}`,
              this.#text('locateGroup'),
              () => {
                void this.#locate(view, location);
              },
            ),
          );
        }
        for (const region of result.regions.slice(0, 500)) {
          const text = region.format === 'html' ? documentMarkupText(region.text) : region.text;
          section.append(
            comparisonTarget(
              doc,
              `${region.pageIndex + 1} · ${this.#text(`kind.${region.kind}`)} · ${this.#text(`flow.${region.flow}`)} · ${text.slice(0, 100)}`,
              text,
              this.#text('locate'),
              () => {
                void this.#locate(view, { pageIndex: region.pageIndex, rects: [region.rect] });
              },
            ),
          );
        }
        if (result.regions.length > 500 || result.objectGroups.length > 500) {
          const note = doc.createElementNS(H, 'p');
          note.textContent = this.#text('truncated');
          section.append(note);
        }
      }
      view.results.append(section);
    }
    if (view.native && view.cloud) {
      const comparison = compareDocuments(view.native, view.cloud);
      const details = doc.createElementNS(H, 'details');
      details.style.gridColumn = '1 / -1';
      const heading = doc.createElementNS(H, 'summary');
      heading.textContent = this.#text('vocabulary');
      const note = doc.createElementNS(H, 'p');
      note.style.whiteSpace = 'pre-wrap';
      note.textContent = `${this.#text('diagnostic')}\n${this.#text('nativeOnly')}: ${comparison.nativeOnlyWords.slice(0, 50).join(', ')}\n${this.#text('cloudOnly')}: ${comparison.cloudOnlyWords.slice(0, 50).join(', ')}`;
      details.append(heading, note);
      view.results.prepend(details);
    }
  }

  /** Recheck the source version at use time; an earlier successful parse is not current-file admission. */
  async #locate(view: ComparisonView, location: DocumentLocation): Promise<void> {
    try {
      if (!this.#current(view) || !view.prepared) return;
      const current = await view.prepared.pdf.isCurrent();
      if (!this.#current(view)) return;
      if (!current) throw new Error('PDF changed; reopen the comparison');
      await this.#host.navigate(location);
      if (this.#current(view)) this.close(true);
    } catch (error) {
      if (this.#current(view)) view.status.textContent = String(error);
    }
  }
}
