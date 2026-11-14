import { readSettledMinerUToken, saveMinerUToken } from '../../platform/document-credentials';
import {
  checkCredential,
  CREDENTIAL_HELP_URLS,
  createCredentialAbortController,
  openCredentialHelp,
} from '../../platform/credential-check';
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
import { documentCacheSlot } from '../../document-analysis/cache';
import {
  applyDocumentCorrections,
  changeDocumentCorrection,
  documentCorrectionIdentity,
  NATIVE_CORRECTION_KEY,
  type DocumentCorrections,
} from '../../document-analysis/corrections';
import {
  readAttachmentDocumentCorrections,
  saveAttachmentDocumentCorrections,
} from '../../platform/document-corrections';
import { documentObjectLocation } from '../../document-analysis/object-groups';
import type {
  DocumentSource,
  DocumentLocation,
  DocumentParser,
  DocumentCacheKey,
  ParsedDocument,
} from '../../document-analysis/contracts';
import {
  nativeDocumentPages,
  nativeDocumentParser,
  nativeParsedDocument,
} from '../../document-analysis/native';
import { oxrDocumentParser } from '../../document-analysis/oxr';
import { mineruDocumentParser } from '../../document-analysis/mineru';
import { localDocumentParser } from '../../document-analysis/local';
import {
  analysisPDF,
  requestDocumentJSON,
  documentServiceTransport,
  type AnalysisPDF,
} from '../../platform/document-analysis';
import { documentMarkupText } from '../../platform/document-markup';
import {
  attachmentDocumentCache,
  observeAttachmentDocumentCache,
} from '../../platform/document-analysis-cache';
import {
  readerWindow,
  readerDocumentPageGeometry,
  structuredDocumentData,
  pdfSourceFigurePages,
  type ReaderRuntime,
} from '../../toolkit/reader';
import { COMPARISON_BACKDROP_STYLE, COMPARISON_PANEL_STYLE } from '../../ui/react/shells/reader';
import {
  DOCUMENT_PROVIDER_KEY,
  OXR_ENDPOINT_KEY,
  selectedDocumentCacheKey,
  selectedDocumentProvider,
  type DocumentProvider,
  DEFAULT_OXR_ENDPOINT,
} from '../../document-analysis/settings';
import { mountNativeReactView } from '../../platform/native-ui';
import type { NativeReactView } from '../../ui/react/types';
import type {
  ComparisonColumn,
  ComparisonTarget,
  DocumentComparisonCommand,
  DocumentComparisonModel,
} from './react-model';

const H = 'http://www.w3.org/1999/xhtml';

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

interface CorrectionSource {
  readonly raw: ParsedDocument;
  readonly key: DocumentCacheKey;
  state: DocumentCorrections;
  readonly undo: DocumentCorrections[];
}

interface ComparisonView {
  readonly backdrop: HTMLElement;
  readonly root: HTMLElement;
  readonly status: { textContent: string };
  readonly cloudButton: { disabled: boolean };
  readonly refreshButton: { disabled: boolean };
  readonly endpoint: { value: string; disabled: boolean };
  readonly provider: { value: DocumentProvider; disabled: boolean };
  credentialStatus: string;
  credentialRevision: number;
  credentialComposing: boolean;
  credentialCheck?: AbortController;
  credentialWrite?: Promise<boolean>;
  credentialStorageError: boolean;
  readonly abort: AbortController;
  readonly untheme: () => void;
  react?: NativeReactView<DocumentComparisonModel>;
  stopObserving?: () => void;
  readonly stopPreferences: (() => void)[];
  preferenceSlot: string;
  preferenceWrite?: boolean;
  title: string;
  locations: Map<string, DocumentLocation>;
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
  nativePending?: boolean;
  nativeError?: string;
  cloud?: AnalyzedDocument;
  readonly corrections: Map<number, CorrectionSource>;
  readonly regionPages: Map<number, number>;
  correctionPending?: boolean;
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
    backdrop.style.cssText = COMPARISON_BACKDROP_STYLE;
    root.dataset.zvDocumentComparison = '1';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', this.#text('title'));
    root.style.cssText = COMPARISON_PANEL_STYLE;
    const content = element('div');
    const provider: ComparisonView['provider'] = {
      value: selectedDocumentProvider(this.#host.preferences),
      disabled: false,
    };
    root.append(content);
    backdrop.append(root);
    doc.documentElement.append(backdrop);
    let statusText = this.#text('preparing');
    const view: ComparisonView = {
      root,
      backdrop,
      provider,
      credentialStatus: '',
      credentialRevision: 0,
      credentialComposing: false,
      credentialStorageError: false,
      endpoint: {
        value: this.#host.preferences.get(OXR_ENDPOINT_KEY, DEFAULT_OXR_ENDPOINT),
        disabled: false,
      },
      cloudButton: { disabled: true },
      refreshButton: { disabled: true },
      status: {
        get textContent() {
          return statusText;
        },
        set textContent(value: string) {
          statusText = value;
          if (view.react) view.react.update(model());
        },
      },
      corrections: new Map(),
      regionPages: new Map(),
      stopPreferences: [],
      preferenceSlot: documentCacheSlot(selectedDocumentCacheKey(this.#host.preferences)),
      title: this.#text('title'),
      locations: new Map(),
      cloudRevision: 0,
      abort: new (window as Window & typeof globalThis).AbortController(),
      untheme: this.#host.themeRoot(backdrop),
    };
    this.#view = view;
    view.stopObserving = observeAttachmentDocumentCache(this.#host.reader.itemID!, () => {
      if (this.#current(view) && !view.cloudPending && !view.correctionPending)
        void this.#refreshCorrections(view);
    });
    for (const key of [DOCUMENT_PROVIDER_KEY, OXR_ENDPOINT_KEY]) {
      const stop = this.#host.preferences.observe?.(key, () => this.#selectedServiceChanged(view));
      if (stop) view.stopPreferences.push(stop);
    }
    const model = () => this.#model(view);
    view.react = mountNativeReactView({
      surface: 'document-comparison',
      root: content,
      model: model(),
      dispatch: (command: DocumentComparisonCommand) => this.#command(view, command),
      isCurrent: () => this.#current(view),
      loadingText: this.#text('preparing'),
      errorText: this.#text('nativeReady'),
      onError: () => this.#host.debug('Document comparison view unavailable'),
    });
    void view.react.ready
      .then(() => {
        if (this.#current(view)) {
          if (view.credentialRevision === 0) void this.#loadCredential(view);
          view.react?.getElement('close')?.focus();
        }
      })
      .catch(() => {});
    backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === backdrop) {
        event.preventDefault();
        this.close(true);
      }
    });
    root.addEventListener('keydown', (event) => this.handleKey(event));
    void this.#prepare(view);
  }

  #command(view: ComparisonView, command: DocumentComparisonCommand): void {
    if (!this.#current(view)) return;
    switch (command.type) {
      case 'regions-page':
        if (
          !view.cloudPending &&
          !view.correctionPending &&
          Number.isInteger(command.page) &&
          command.page >= 0
        ) {
          view.regionPages.set(command.column, command.page);
          this.#render(view);
        }
        break;
      case 'correct-body':
      case 'correct-restore':
      case 'correct-caption':
      case 'correct-undo':
        void this.#correct(view, command);
        break;
      case 'close':
        this.close(true);
        break;
      case 'parse':
        void this.#cloud(view);
        break;
      case 'refresh':
        void this.#cloud(view, true);
        break;
      case 'read-native':
        if (!view.cloudPending && !view.correctionPending) void this.#readNative(view);
        break;
      case 'credential-change':
        view.credentialComposing = false;
        void this.#saveCredential(view);
        break;
      case 'credential-composition':
        view.credentialComposing = true;
        this.#retireCredential(view);
        this.#render(view);
        break;
      case 'credential-verify':
        void this.#verifyCredential(view);
        break;
      case 'credential-help':
        if (view.provider.value === 'mineru') openCredentialHelp('mineru');
        break;
      case 'provider':
        if (view.cloudPending || view.correctionPending) break;
        view.provider.value = command.value;
        void this.#loadCredential(view);
        this.#setPreference(view, DOCUMENT_PROVIDER_KEY, command.value);
        this.#render(view);
        void this.#restoreCloud(view);
        break;
      case 'endpoint':
        if (view.cloudPending || view.correctionPending) break;
        view.endpoint.value = command.value;
        this.#retireCredentialCheck(view);
        if (!view.credentialStorageError) view.credentialStatus = '';
        this.#render(view);
        void this.#restoreCloud(view);
        break;
      case 'locate': {
        const location = view.locations.get(command.id);
        if (location) void this.#locate(view, location);
        break;
      }
      case 'copy':
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
        view.status.textContent = this.#text('copied');
        break;
    }
  }

  /** Synchronous preference observers must retire other dialogs, not the writer's own prepared result. */
  #setPreference(view: ComparisonView, key: string, value: string): void {
    view.preferenceWrite = true;
    try {
      this.#host.preferences.set(key, value);
      view.preferenceSlot = documentCacheSlot(selectedDocumentCacheKey(this.#host.preferences));
    } finally {
      view.preferenceWrite = false;
    }
  }

  #selectedServiceChanged(view: ComparisonView): void {
    if (!this.#current(view) || view.preferenceWrite) return;
    const slot = documentCacheSlot(selectedDocumentCacheKey(this.#host.preferences));
    if (slot === view.preferenceSlot) return;
    view.preferenceSlot = slot;
    // Retire old reads/writes and their controls immediately. Reload remains an explicit local lookup/parse action.
    view.cloudRevision++;
    view.provider.value = selectedDocumentProvider(this.#host.preferences);
    view.endpoint.value = this.#host.preferences.get(OXR_ENDPOINT_KEY, DEFAULT_OXR_ENDPOINT);
    view.cloud = undefined;
    view.cloudState = undefined;
    view.cloudSavedAt = undefined;
    view.corrections.delete(1);
    view.regionPages.delete(1);
    view.cloudNotice = this.#text('corrections.changed');
    this.#busy(view, false);
    void this.#loadCredential(view);
    view.status.textContent = view.cloudNotice;
  }

  #retireCredentialCheck(view: ComparisonView): void {
    view.credentialCheck?.abort();
    view.credentialCheck = undefined;
  }

  #retireCredential(view: ComparisonView): void {
    view.credentialRevision++;
    this.#retireCredentialCheck(view);
    view.credentialWrite = undefined;
    view.credentialStorageError = false;
    view.credentialStatus = '';
  }

  async #loadCredential(view: ComparisonView): Promise<void> {
    this.#retireCredential(view);
    view.credentialComposing = false;
    const revision = view.credentialRevision;
    const provider = view.provider.value;
    const input = view.react?.getElement('credential') as HTMLInputElement | null;
    if (!input) return;
    input.value = provider === 'oxr' ? 'dummy' : '';
    this.#render(view);
    if (provider !== 'mineru') return;
    const current = () =>
      this.#current(view) &&
      view.credentialRevision === revision &&
      view.provider.value === provider &&
      view.react?.getElement('credential') === input &&
      input.value === '';
    try {
      const value = await readSettledMinerUToken();
      if (!current()) return;
      this.#retireCredentialCheck(view);
      input.value = value;
      view.credentialStatus = '';
    } catch {
      if (!current()) return;
      this.#retireCredentialCheck(view);
      view.credentialStorageError = true;
      view.credentialStatus = t('documentCredentials.unavailable', this.#host.language());
    }
    this.#render(view);
  }

  #saveCredential(view: ComparisonView): void {
    this.#retireCredential(view);
    const revision = view.credentialRevision;
    const input = view.react?.getElement('credential') as HTMLInputElement | null;
    this.#render(view);
    if (!input || view.provider.value !== 'mineru') return;
    const value = input.value;
    // Admit every completed edit immediately; shared storage serializes writes even after close.
    view.credentialWrite = saveMinerUToken(value).then(
      () => true,
      () => {
        if (
          this.#current(view) &&
          view.credentialRevision === revision &&
          input.value === value &&
          view.provider.value === 'mineru'
        ) {
          view.credentialStorageError = true;
          view.credentialStatus = t('documentCredentials.unavailable', this.#host.language());
          this.#render(view);
        }
        return false;
      },
    );
  }

  async #verifyCredential(view: ComparisonView): Promise<void> {
    if (
      view.provider.value !== 'mineru' ||
      view.credentialComposing ||
      view.credentialCheck ||
      view.credentialStorageError
    )
      return;
    const input = view.react?.getElement('credential') as HTMLInputElement | null;
    if (!input) return;
    const revision = view.credentialRevision;
    const value = input.value;
    const check = createCredentialAbortController();
    view.credentialCheck = check;
    const current = () =>
      this.#current(view) &&
      !check.signal.aborted &&
      view.credentialCheck === check &&
      view.credentialRevision === revision &&
      view.provider.value === 'mineru' &&
      input.value === value;
    view.credentialStatus = t('credentials.validation.checking', this.#host.language());
    this.#render(view);
    if (view.credentialWrite) {
      const saved = await view.credentialWrite;
      if (!current()) return;
      if (!saved) {
        view.credentialCheck = undefined;
        view.credentialStatus = t('documentCredentials.unavailable', this.#host.language());
        this.#render(view);
        return;
      }
    }
    if (!current()) return;
    const result = await checkCredential('mineru', value, check.signal).catch(() => 'unavailable');
    if (!current()) return;
    view.credentialCheck = undefined;
    view.credentialStatus =
      result === 'cancelled' ? '' : t(`credentials.validation.${result}`, this.#host.language());
    this.#render(view);
  }

  /** Keep dialog keys out of Reader's matcher; Tab remains native and Escape closes this owner. */
  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view;
    if (!view || !event.target || !view.root.contains(event.target as Node)) return false;
    event.stopImmediatePropagation();
    if (event.key === 'Escape' && !event.isComposing && !view.credentialComposing) {
      event.preventDefault();
      this.close(true);
    }
    if (event.key === 'Tab') {
      const controls = (
        Array.from(
          view.root.querySelectorAll('input,select,button,a[href],summary,[tabindex]'),
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
    if (!view) return;
    const input = view.react?.getElement('credential') as HTMLInputElement | null;
    this.#view = null;
    const cleanup = new CleanupFailure();
    cleanup.run(() => this.#retireCredential(view));
    cleanup.run(() => {
      if (input) input.value = '';
    });
    cleanup.run(() => view.abort.abort());
    cleanup.run(() => view.stopObserving?.());
    for (const stop of view.stopPreferences) cleanup.run(stop);
    cleanup.run(() => view.react?.dispose());
    cleanup.run(view.untheme);
    cleanup.run(() => view.backdrop.remove());
    cleanup.rethrow();
    if (focus && this.#host.isCurrent()) this.#host.focusReader();
  }

  async #prepare(view: ComparisonView): Promise<void> {
    try {
      const pdf = await analysisPDF(this.#host.reader.itemID!);
      if (!this.#current(view)) return;
      view.title = `${this.#text('title')} · ${pdf.fileName}`;
      this.#render(view);
      const pages = await readerDocumentPageGeometry(this.#host.reader, () => this.#current(view));
      if (!this.#current(view)) return;
      const source = {
        fingerprint: pdf.fingerprint,
        fileName: pdf.fileName,
        pages: nativeDocumentPages({ pages }),
      };
      view.prepared = { source, pdf, cache: attachmentDocumentCache(this.#host.reader.itemID!) };
      void this.#restoreCloud(view);
      if (view.provider.value !== 'local') await this.#readNative(view);
    } catch (error) {
      if (this.#current(view)) {
        view.nativeError = String(error);
        view.status.textContent = view.nativeError;
        this.#render(view);
      }
    }
  }

  /** Local mode never prepares SDT implicitly; this explicit comparison may invoke Zotero models. */
  async #readNative(view: ComparisonView): Promise<void> {
    const prepared = view.prepared;
    if (!prepared || view.nativePending || !this.#current(view)) return;
    view.nativePending = true;
    view.nativeError = undefined;
    this.#render(view);
    const { source, pdf } = prepared;
    try {
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
      const state = await readAttachmentDocumentCorrections(
        this.#host.reader.itemID!,
        native,
        NATIVE_CORRECTION_KEY,
      );
      if (!this.#current(view)) return;
      view.corrections.set(0, { raw: native, key: NATIVE_CORRECTION_KEY, state, undo: [] });
      view.native = analyzeParsedDocument(applyDocumentCorrections(native, state), source);
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
    } finally {
      view.nativePending = false;
      if (this.#current(view)) this.#render(view);
    }
  }

  #readyText(view: ComparisonView): string {
    if (view.cloudNotice) return view.cloudNotice;
    if (!view.cloud) return this.#text(view.native ? 'nativeReady' : 'localReady');
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
    this.#render(view);
  }

  #parser(view: ComparisonView, credential = ''): DocumentParser {
    if (view.provider.value === 'local')
      return localDocumentParser((signal) =>
        pdfSourceFigurePages(
          () => view.prepared!.pdf.read(),
          signal,
          view.prepared!.source.pages.length,
          () => this.#current(view),
        ),
      );
    if (view.provider.value === 'mineru')
      return mineruDocumentParser({
        apiKey: credential,
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
      apiKey: credential,
      readPDF: () => view.prepared!.pdf.read(),
      request: requestDocumentJSON,
    });
  }

  #cloudCurrent(view: ComparisonView, revision: number): boolean {
    return this.#current(view) && view.cloudRevision === revision;
  }

  async #refreshCorrections(view: ComparisonView): Promise<void> {
    const source = view.corrections.get(0);
    void this.#restoreCloud(view);
    if (!source || !view.prepared) return;
    try {
      const state = await readAttachmentDocumentCorrections(
        this.#host.reader.itemID!,
        source.raw,
        source.key,
      );
      if (!this.#current(view) || view.correctionPending || view.corrections.get(0) !== source)
        return;
      if (!(await view.prepared.pdf.isCurrent()) || !this.#current(view)) return;
      if (view.correctionPending || view.corrections.get(0) !== source) return;
      view.corrections.set(0, { ...source, state, undo: [] });
      view.native = analyzeParsedDocument(
        applyDocumentCorrections(source.raw, state),
        view.prepared.source,
      );
      this.#render(view);
    } catch {
      if (this.#current(view)) view.status.textContent = this.#text('corrections.failed');
    }
  }

  /** Cache lookup never initiates a network request, including invalid or unavailable cache files. */
  async #restoreCloud(view: ComparisonView): Promise<void> {
    if (!view.prepared || !this.#current(view) || view.cloudPending || view.correctionPending)
      return;
    const revision = ++view.cloudRevision;
    // A local lookup must not swallow the click that committed an edited endpoint.
    // An explicit parse may supersede it; the revision fences its late result.
    this.#busy(view, false);
    view.cloud = undefined;
    view.cloudState = undefined;
    view.cloudSavedAt = undefined;
    view.cloudNotice = undefined;
    view.corrections.delete(1);
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
    const state = await readAttachmentDocumentCorrections(
      this.#host.reader.itemID!,
      cached.parsed,
      parser.cacheKey,
    );
    if (!this.#cloudCurrent(view, revision)) return true;
    if (view.provider.value === 'oxr')
      this.#setPreference(view, OXR_ENDPOINT_KEY, view.endpoint.value.trim());
    view.corrections.set(1, { raw: cached.parsed, key: parser.cacheKey, state, undo: [] });
    view.cloud = analyzeParsedDocument(
      applyDocumentCorrections(cached.parsed, state),
      prepared.source,
    );
    view.cloudState = 'cached';
    view.cloudSavedAt = cached.savedAt;
    view.cloudNotice = undefined;
    view.status.textContent = this.#readyText(view);
    this.#render(view);
    return true;
  }

  async #cloud(view: ComparisonView, refresh = false): Promise<void> {
    const prepared = view.prepared;
    if (!prepared || !this.#current(view) || view.cloudButton.disabled || view.correctionPending)
      return;
    const credential =
      (view.react?.getElement('credential') as HTMLInputElement | null)?.value ?? '';
    const revision = ++view.cloudRevision;
    this.#busy(view, true);
    view.cloudNotice = undefined;
    view.status.textContent = this.#text(
      view.provider.value === 'local' ? 'processingLocal' : 'processing',
    );
    try {
      const endpoint = view.endpoint.value.trim();
      const parser = this.#parser(view, credential);
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
      if (view.provider.value === 'oxr') this.#setPreference(view, OXR_ENDPOINT_KEY, endpoint);
      view.corrections.delete(1);
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
          if (saved) {
            const state = await readAttachmentDocumentCorrections(
              this.#host.reader.itemID!,
              result,
              parser.cacheKey,
            );
            if (!this.#cloudCurrent(view, revision)) return;
            view.corrections.set(1, { raw: result, key: parser.cacheKey, state, undo: [] });
            view.cloud = analyzeParsedDocument(
              applyDocumentCorrections(result, state),
              prepared.source,
            );
          }
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
        const message = String(error);
        view.cloudNotice = credential ? message.split(credential).join('[redacted]') : message;
        view.status.textContent = view.cloudNotice;
      }
    } finally {
      if (this.#cloudCurrent(view, revision)) this.#busy(view, false);
    }
  }

  /** Persist before publishing. Revalidate the uncorrected result at both sides of staging. */
  async #correct(
    view: ComparisonView,
    command: Extract<
      DocumentComparisonCommand,
      { readonly type: 'correct-body' | 'correct-restore' | 'correct-caption' | 'correct-undo' }
    >,
  ): Promise<void> {
    this.#selectedServiceChanged(view);
    const source = view.corrections.get(command.column);
    const prepared = view.prepared;
    if (!source || !prepared || view.cloudPending || view.correctionPending || !this.#current(view))
      return;
    const revision = view.cloudRevision;
    const owned = (): boolean =>
      this.#current(view) &&
      view.corrections.get(command.column) === source &&
      (command.column === 0 ||
        (view.cloudRevision === revision &&
          documentCacheSlot(selectedDocumentCacheKey(this.#host.preferences)) ===
            documentCacheSlot(source.key)));
    const current = async (): Promise<boolean> => {
      if (!owned() || !(await prepared.pdf.isCurrent()) || !owned()) return false;
      let raw: ParsedDocument | undefined;
      if (command.column === 0) {
        const data = await structuredDocumentData(this.#host.reader.itemID, owned);
        if (!data || !owned()) return false;
        raw = nativeParsedDocument(prepared.source, data);
      } else {
        raw = (await prepared.cache.read(prepared.source, source.key))?.parsed;
      }
      return (
        !!raw && owned() && documentCorrectionIdentity(raw, source.key) === source.state.identity
      );
    };
    view.correctionPending = true;
    view.status.textContent = this.#text('corrections.saving');
    this.#render(view);
    try {
      const previous = source.state;
      const undo = command.type === 'correct-undo';
      const next =
        command.type === 'correct-undo'
          ? source.undo.at(-1)
          : changeDocumentCorrection(
              previous,
              source.raw,
              source.key,
              command.regionID,
              command.type === 'correct-restore'
                ? null
                : command.type === 'correct-caption'
                  ? { type: 'caption', regionID: command.regionID, bodyID: command.bodyID }
                  : { type: 'body', regionID: command.regionID },
            );
      if (!next) throw new Error(this.#text('corrections.changed'));
      const saved = await saveAttachmentDocumentCorrections({
        itemID: this.#host.reader.itemID!,
        parsed: source.raw,
        key: source.key,
        previous,
        next,
        current,
      });
      if (!owned() || !saved || !(await current()) || !owned())
        throw new Error(this.#text('corrections.changed'));
      source.state = next;
      if (undo) source.undo.pop();
      else {
        source.undo.push(previous);
        if (source.undo.length > 20) source.undo.shift();
      }
      const result = analyzeParsedDocument(
        applyDocumentCorrections(source.raw, next),
        prepared.source,
      );
      if (command.column === 0) view.native = result;
      else view.cloud = result;
      view.status.textContent = this.#text('corrections.saved');
    } catch (error) {
      if (this.#current(view))
        view.status.textContent = `${this.#text('corrections.failed')} ${
          owned() ? String(error) : this.#text('corrections.changed')
        }`;
    } finally {
      if (this.#current(view)) {
        view.correctionPending = false;
        this.#selectedServiceChanged(view);
        this.#render(view);
      }
    }
  }

  #render(view: ComparisonView): void {
    view.react?.update(this.#model(view));
  }

  #model(view: ComparisonView): DocumentComparisonModel {
    const locations = new Map<string, DocumentLocation>();
    const columns: ComparisonColumn[] = [];
    for (const [index, label, result, error] of [
      [0, this.#text('native'), view.native, view.nativeError],
      [
        1,
        view.provider.value === 'local'
          ? this.#text('local')
          : view.provider.value === 'mineru'
            ? 'MinerU'
            : 'OXR',
        view.cloud,
        undefined,
      ],
    ] as const) {
      const pageCount = Math.max(1, Math.ceil((result?.regions.length ?? 0) / 500));
      const page = Math.min(view.regionPages.get(index) ?? 0, pageCount - 1);
      const correctionSource = view.corrections.get(index);
      const correctedIDs = new Set(correctionSource?.state.edits.map((e) => e.regionID));
      const captionIDs = new Set<string>();
      const bodies = new Map<number, { id: string; title: string }[]>();
      for (const r of correctionSource?.raw.regions ?? []) {
        if (r.kind === 'caption') captionIDs.add(r.id);
        if (r.kind !== 'image' && r.kind !== 'table') continue;
        const options = bodies.get(r.pageIndex) ?? [];
        options.push({
          id: r.id,
          title: `${r.pageIndex + 1} · ${this.#text(`kind.${r.kind}`)} · ${r.id} · [${r.rect.join(', ')}]`,
        });
        bodies.set(r.pageIndex, options);
      }
      const targets: ComparisonTarget[] = [];
      if (result) {
        for (const [i, group] of result.objectGroups.slice(0, 500).entries()) {
          const location = documentObjectLocation(result.regions, group);
          const id = `${index}:group:${i}`;
          locations.set(id, location);
          const name =
            group.title.slice(0, 140) ||
            `${this.#text(`kind.${group.kind === 'figure' ? 'image' : 'table'}`)} · ${location.pageIndex + 1}`;
          targets.push({
            id,
            title: `${this.#text('objectGroup')} · ${name} · ${group.id.startsWith('object:local-caption:') ? this.#text('corrections.saved') : this.#text(`association.${group.association}`)}`,
            text: `${group.title}\n${this.#text('members')}: ${group.memberRegionIds.length}`,
            action: this.#text('locateGroup'),
          });
        }
        for (const region of result.regions.slice(page * 500, (page + 1) * 500)) {
          const text = region.format === 'html' ? documentMarkupText(region.text) : region.text;
          const id = `${index}:region:${region.id}`;
          locations.set(id, { pageIndex: region.pageIndex, rects: [region.rect] });
          targets.push({
            id,
            title: `${region.pageIndex + 1} · ${this.#text(`kind.${region.kind}`)} · ${this.#text(`flow.${region.flow}`)} · ${text.slice(0, 100)}`,
            text,
            action: this.#text('locate'),
            ...(correctionSource
              ? {
                  correction: {
                    regionID: region.id,
                    column: index,
                    corrected: correctedIDs.has(region.id),
                    bodies: captionIDs.has(region.id) ? (bodies.get(region.pageIndex) ?? []) : [],
                  },
                }
              : {}),
          });
        }
      }
      columns.push({
        label,
        ...(index === 0 && !result ? { prepareLabel: this.#text('readNative') } : {}),
        page,
        pageCount,
        previousLabel: this.#text('corrections.previous'),
        nextLabel: this.#text('corrections.next'),
        error: result ? '' : (error ?? ''),
        targets,
        summary: result
          ? `${result.pages.length} ${this.#text('pages')} · ${result.regions.length} ${this.#text('regions')} · ${this.#text('elapsed')} ${(result.durationMs / 1000).toFixed(1)}s`
          : index === 0
            ? this.#text('nativeNotPrepared')
            : '',
        cache:
          result && index === 1 && view.cloudState
            ? this.#readyText(view) +
              (view.cloudSavedAt ? ` · ${new Date(view.cloudSavedAt).toLocaleString()}` : '')
            : '',
        truncated: result && result.objectGroups.length > 500 ? this.#text('truncated') : '',
      });
    }
    view.locations = locations;
    const comparison = view.native && view.cloud ? compareDocuments(view.native, view.cloud) : null;
    return {
      title: view.title,
      description: this.#text('description'),
      providerLabel: this.#text('provider'),
      endpointLabel: this.#text('endpoint'),
      provider: view.provider.value,
      localLabel: this.#text('local'),
      endpoint: view.endpoint.value,
      credentialLabel:
        view.provider.value === 'mineru'
          ? t('documentCredentials.token', this.#host.language())
          : `OXR / SoMark · ${t('documentCredentials.temporaryToken', this.#host.language())}`,
      credentialVerifyLabel: t('documentCredentials.verify', this.#host.language()),
      credentialHelpLabel: t('documentCredentials.help', this.#host.language()),
      credentialHelpURL: CREDENTIAL_HELP_URLS.mineru,
      credentialHint:
        view.provider.value === 'mineru'
          ? t('documentCredentials.hint', this.#host.language())
          : '',
      credentialStatus: view.credentialStatus,
      credentialChecking: !!view.credentialCheck,
      busy: !!view.cloudPending || !!view.nativePending || !!view.correctionPending,
      ready: !!view.prepared,
      parseLabel: this.#text(view.provider.value === 'local' ? 'parseLocal' : 'parseCloud'),
      refreshLabel: this.#text(view.provider.value === 'local' ? 'refreshLocal' : 'refreshCloud'),
      copyLabel: this.#text('copyReport'),
      closeLabel: this.#text('close'),
      status: view.status.textContent,
      vocabularyLabel: this.#text('vocabulary'),
      vocabulary: comparison
        ? `${this.#text('diagnostic')}\n${this.#text('nativeOnly')}: ${comparison.nativeOnlyWords.slice(0, 50).join(', ')}\n${this.#text('cloudOnly')}: ${comparison.cloudOnlyWords.slice(0, 50).join(', ')}`
        : '',
      corrections: {
        hint: this.#text('corrections.hint'),
        body: this.#text('corrections.body'),
        restore: this.#text('corrections.restore'),
        caption: this.#text('corrections.caption'),
        target: this.#text('corrections.target'),
        choose: this.#text('corrections.choose'),
        saved: this.#text('corrections.saved'),
        undo: this.#text('corrections.undo'),
        undoColumns: [...view.corrections]
          .filter(([, source]) => source.undo.length > 0)
          .map(([index]) => index),
        busy: !!view.cloudPending || !!view.nativePending || !!view.correctionPending,
      },
      columns,
    };
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
