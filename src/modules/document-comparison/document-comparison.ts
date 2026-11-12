import { readMinerUToken, saveMinerUToken } from '../../platform/document-credentials';
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

interface ComparisonView {
  readonly backdrop: HTMLElement;
  readonly root: HTMLElement;
  readonly status: { textContent: string };
  readonly cloudButton: { disabled: boolean };
  readonly refreshButton: { disabled: boolean };
  readonly endpoint: { value: string; disabled: boolean };
  readonly provider: { value: 'mineru' | 'oxr'; disabled: boolean };
  credentialStatus: string;
  credentialPending: boolean;
  readonly abort: AbortController;
  readonly untheme: () => void;
  react?: NativeReactView<DocumentComparisonModel>;
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
    const content = element('div');
    const provider: ComparisonView['provider'] = {
      value:
        this.#host.preferences.get(DOCUMENT_PROVIDER_KEY, 'mineru') === 'oxr' ? 'oxr' : 'mineru',
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
      credentialPending: false,
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
      title: this.#text('title'),
      locations: new Map(),
      cloudRevision: 0,
      abort: new (window as Window & typeof globalThis).AbortController(),
      untheme: this.#host.themeRoot(backdrop),
    };
    this.#view = view;
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
          this.#loadCredential(view);
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
      case 'close':
        this.close(true);
        break;
      case 'parse':
        void this.#cloud(view);
        break;
      case 'refresh':
        void this.#cloud(view, true);
        break;
      case 'credential-save':
        void this.#saveCredential(view, false);
        break;
      case 'credential-clear':
        void this.#saveCredential(view, true);
        break;
      case 'provider':
        if (view.cloudPending) break;
        view.provider.value = command.value;
        this.#loadCredential(view);
        this.#host.preferences.set(DOCUMENT_PROVIDER_KEY, command.value);
        this.#render(view);
        void this.#restoreCloud(view);
        break;
      case 'endpoint':
        if (view.cloudPending) break;
        view.endpoint.value = command.value;
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

  #loadCredential(view: ComparisonView): void {
    const input = view.react?.getElement('credential') as HTMLInputElement | null;
    if (!input) return;
    try {
      input.value = view.provider.value === 'mineru' ? readMinerUToken() : 'dummy';
      view.credentialStatus =
        view.provider.value === 'mineru'
          ? t('documentCredentials.hint', this.#host.language())
          : '';
    } catch {
      input.value = '';
      view.credentialStatus = t('documentCredentials.unavailable', this.#host.language());
    }
    this.#render(view);
  }

  async #saveCredential(view: ComparisonView, clear: boolean): Promise<void> {
    if (
      !this.#current(view) ||
      view.cloudPending ||
      view.credentialPending ||
      view.provider.value !== 'mineru'
    )
      return;
    const input = view.react?.getElement('credential') as HTMLInputElement | null;
    if (!input) return;
    const doc = view.root.ownerDocument;
    const ownedFocus = view.root.contains(doc.activeElement);
    const forget = clear || !input.value.trim();
    const value = forget ? '' : input.value;
    view.credentialPending = true;
    this.#render(view);
    try {
      await saveMinerUToken(value);
      if (this.#current(view)) {
        if (forget) input.value = '';
        view.credentialStatus = t(
          `documentCredentials.${forget ? 'cleared' : 'saved'}`,
          this.#host.language(),
        );
      }
    } catch {
      if (this.#current(view))
        view.credentialStatus = t('documentCredentials.unavailable', this.#host.language());
    } finally {
      if (this.#current(view)) {
        view.credentialPending = false;
        this.#render(view);
        if (
          ownedFocus &&
          (!doc.activeElement ||
            doc.activeElement === view.root ||
            doc.activeElement === doc.body ||
            doc.activeElement === doc.documentElement)
        )
          input.focus();
      }
    }
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
    if (!view) return;
    const input = view.react?.getElement('credential') as HTMLInputElement | null;
    this.#view = null;
    const cleanup = new CleanupFailure();
    cleanup.run(() => {
      if (input) input.value = '';
    });
    cleanup.run(() => view.abort.abort());
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
    this.#render(view);
  }

  #parser(view: ComparisonView, credential = ''): DocumentParser {
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
    const credential =
      (view.react?.getElement('credential') as HTMLInputElement | null)?.value ?? '';
    const revision = ++view.cloudRevision;
    this.#busy(view, true);
    view.cloudNotice = undefined;
    view.status.textContent = this.#text('processing');
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
        const message = String(error);
        view.cloudNotice = credential ? message.split(credential).join('[redacted]') : message;
        view.status.textContent = view.cloudNotice;
      }
    } finally {
      if (this.#cloudCurrent(view, revision)) this.#busy(view, false);
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
      [1, view.provider.value === 'mineru' ? 'MinerU' : 'OXR', view.cloud, undefined],
    ] as const) {
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
            title: `${this.#text('objectGroup')} · ${name} · ${this.#text(`association.${group.association}`)}`,
            text: `${group.title}\n${this.#text('members')}: ${group.memberRegionIds.length}`,
            action: this.#text('locateGroup'),
          });
        }
        for (const [i, region] of result.regions.slice(0, 500).entries()) {
          const text = region.format === 'html' ? documentMarkupText(region.text) : region.text;
          const id = `${index}:region:${i}`;
          locations.set(id, { pageIndex: region.pageIndex, rects: [region.rect] });
          targets.push({
            id,
            title: `${region.pageIndex + 1} · ${this.#text(`kind.${region.kind}`)} · ${this.#text(`flow.${region.flow}`)} · ${text.slice(0, 100)}`,
            text,
            action: this.#text('locate'),
          });
        }
      }
      columns.push({
        label,
        error: result ? '' : (error ?? ''),
        targets,
        summary: result
          ? `${result.pages.length} ${this.#text('pages')} · ${result.regions.length} ${this.#text('regions')} · ${this.#text('elapsed')} ${(result.durationMs / 1000).toFixed(1)}s`
          : '',
        cache:
          result && index === 1 && view.cloudState
            ? this.#readyText(view) +
              (view.cloudSavedAt ? ` · ${new Date(view.cloudSavedAt).toLocaleString()}` : '')
            : '',
        truncated:
          result && (result.regions.length > 500 || result.objectGroups.length > 500)
            ? this.#text('truncated')
            : '',
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
      endpoint: view.endpoint.value,
      credentialLabel: t(
        `documentCredentials.${view.provider.value === 'mineru' ? 'token' : 'temporaryToken'}`,
        this.#host.language(),
      ),
      credentialSaveLabel: t('documentCredentials.save', this.#host.language()),
      credentialClearLabel: t('documentCredentials.clear', this.#host.language()),
      credentialStatus: view.credentialStatus,
      credentialPending: view.credentialPending,
      busy: !!view.cloudPending,
      ready: !!view.prepared,
      parseLabel: this.#text('parseCloud'),
      refreshLabel: this.#text('refreshCloud'),
      copyLabel: this.#text('copyReport'),
      closeLabel: this.#text('close'),
      status: view.status.textContent,
      vocabularyLabel: this.#text('vocabulary'),
      vocabulary: comparison
        ? `${this.#text('diagnostic')}\n${this.#text('nativeOnly')}: ${comparison.nativeOnlyWords.slice(0, 50).join(', ')}\n${this.#text('cloudOnly')}: ${comparison.cloudOnlyWords.slice(0, 50).join(', ')}`
        : '',
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
