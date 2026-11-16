import type { Cleanup } from '../core/cleanup';
import type { KeyGuideLanguage } from '../input/key-guide-config';
import { compositionOwnsKey } from '../input/composition';
import { keyString } from '../input/keys';
import { isDeadObject } from '../platform/cross-compartment';
import { mountNativeReactView } from '../platform/native-ui';
import type { NativeReactView } from '../ui/react/types';
import { PREPARATION_BACKDROP_STYLE, PREPARATION_PANEL_STYLE } from '../ui/react/shells/reader';
import type {
  ScholarlyMetadataService,
  ScholarlyPaper,
  ScholarlySource,
} from '../scholarly/contracts';
import {
  artifactHeads,
  type ArtifactInput,
  type NeoArtifact,
  type NeoArtifactRepository,
} from '../artifacts';
import { applyMetadataPlan } from '../operations/metadata';
import { projectArtifactNote } from '../operations/artifact-note';
import {
  createMetadataPlan,
  metadataValueText,
  snapshotMetadata,
  type MetadataField,
  type MetadataPlan,
  type MetadataSnapshot,
} from './model';
import { metadataReviewPayload, readMetadataReviewPaper } from './artifacts';
import type { MetadataReviewCommand, MetadataReviewModel } from './react-model';

export interface MetadataReviewPresentation {
  readonly window: Window;
  readonly items: readonly Zotero.Item[];
  readonly language: () => KeyGuideLanguage;
  readonly themeRoot: (root: HTMLElement) => Cleanup;
  readonly isCurrent: () => boolean;
}
export interface MetadataReviewPort {
  open(host: MetadataReviewPresentation): Cleanup | null;
  handleKey(event: KeyboardEvent): boolean;
  closeOwner(window: Window): void;
}
interface ReviewRow {
  readonly item: Zotero.Item;
  readonly key: string;
  readonly libraryID: number;
  readonly title: string;
  bibtex: string;
  status: string;
  error: boolean;
  snapshot?: MetadataSnapshot;
  papers: readonly ScholarlyPaper[];
  candidateIndex: number;
  plan?: MetadataPlan;
  selected: Set<MetadataField>;
  applied: readonly MetadataField[];
  history: readonly NeoArtifact[];
  parents: readonly string[];
  recordID?: string;
  savedJSON?: string;
  savedAttachment?: string;
  savedRevision?: string;
  revision: number;
  pendingPublication?: { readonly json: string; readonly input: ArtifactInput };
}
interface ReviewView {
  readonly host: MetadataReviewPresentation;
  readonly root: HTMLElement;
  readonly backdrop: HTMLElement;
  readonly focus: HTMLElement | null;
  readonly untheme: Cleanup;
  readonly unload: () => void;
  readonly capture: (event: KeyboardEvent) => void;
  readonly rows: ReviewRow[];
  react: NativeReactView<MetadataReviewModel> | null;
  index: number;
  source: ScholarlySource;
  busy: boolean;
  composition: boolean;
  abort?: AbortController;
}

/** Bibliographic workflows own targets and mutations; UI and provider lifetimes remain separate. */
export class MetadataReviewController implements MetadataReviewPort {
  readonly #metadata: ScholarlyMetadataService;
  readonly #artifacts: NeoArtifactRepository;
  readonly #debug: (message: string) => void;
  #view: ReviewView | null = null;
  constructor(
    metadata: ScholarlyMetadataService,
    artifacts: NeoArtifactRepository,
    debug: (message: string) => void,
  ) {
    this.#metadata = metadata;
    this.#artifacts = artifacts;
    this.#debug = debug;
  }
  #text(view: ReviewView, cn: string, en: string): string {
    return view.host.language() === 'zh-CN' ? cn : en;
  }
  #current(view: ReviewView): boolean {
    return (
      this.#view === view &&
      view.host.isCurrent() &&
      !isDeadObject(view.root) &&
      view.root.isConnected
    );
  }
  open(host: MetadataReviewPresentation): Cleanup | null {
    if (!host.isCurrent()) return null;
    this.close();
    const doc = host.window.document;
    const backdrop = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLElement;
    backdrop.style.cssText = PREPARATION_BACKDROP_STYLE;
    const root = doc.createElementNS('http://www.w3.org/1999/xhtml', 'section') as HTMLElement;
    root.style.cssText = PREPARATION_PANEL_STYLE;
    root.className = 'neo-ui';
    root.dataset.neoMetadataReview = '1';
    root.tabIndex = -1;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute(
      'aria-label',
      host.language() === 'zh-CN' ? '论文信息检查与更新' : 'Inspect paper metadata',
    );
    backdrop.append(root);
    const focus = doc.activeElement as HTMLElement | null;
    doc.documentElement.append(backdrop);
    const seen = new Set<number>();
    const rows = host.items
      .filter(
        (item) =>
          item.isRegularItem() && !item.deleted && !seen.has(item.id) && !!seen.add(item.id),
      )
      .map(
        (item): ReviewRow => ({
          item,
          key: item.key,
          libraryID: item.libraryID,
          title: String(item.getField('title') || item.key),
          bibtex: '',
          status: '',
          error: false,
          papers: [],
          candidateIndex: -1,
          selected: new Set(),
          applied: [],
          history: [],
          parents: [],
          revision: 0,
        }),
      );
    const view: ReviewView = {
      host,
      root,
      backdrop,
      focus,
      rows,
      index: 0,
      source: 'crossref',
      busy: false,
      composition: false,
      react: null,
      untheme: host.themeRoot(backdrop),
      unload: () => this.closeOwner(host.window),
      capture: (event) => {
        this.handleKey(event);
      },
    };
    root.addEventListener('compositionstart', () => {
      view.composition = true;
    });
    root.addEventListener('compositionend', () => {
      view.composition = false;
    });
    this.#view = view;
    host.window.addEventListener('keydown', view.capture, true);
    host.window.addEventListener('unload', view.unload, { once: true });
    view.react = mountNativeReactView<MetadataReviewModel, MetadataReviewCommand>({
      surface: 'metadata-review',
      root,
      model: this.#model(view),
      isCurrent: () => this.#current(view),
      loadingText: this.#text(view, '正在载入…', 'Loading…'),
      errorText: this.#text(view, '审阅界面不可用', 'Review interface unavailable'),
      onError: (error) => this.#debug(String(error)),
      dispatch: (command) => {
        if (this.#current(view)) this.#dispatch(view, command);
      },
    });
    root.focus();
    void view.react.ready
      .then(() => {
        if (this.#current(view) && view.root.contains(doc.activeElement))
          view.react?.getElement('source')?.focus();
      })
      .catch((error) => this.#debug(String(error)));
    if (rows[0]) void this.#history(view, rows[0]);
    return () => {
      if (this.#view === view) this.close();
    };
  }
  #model(view: ReviewView): MetadataReviewModel {
    const row = view.rows[view.index];
    const paper = row?.plan?.paper;
    return {
      chinese: view.host.language() === 'zh-CN',
      sources: this.#metadata.sources,
      source: view.source,
      items: view.rows.map((entry) => ({ title: entry.title, status: entry.status })),
      itemIndex: view.index,
      busy: view.busy,
      status:
        row?.status ||
        this.#text(
          view,
          '尚未检查。只读加载已有成果，不自动联网。',
          'Not inspected. Saved results are loaded locally without network queries.',
        ),
      error: row?.error ?? false,
      candidates:
        row?.papers.map(
          (candidate) =>
            `${candidate.title} — ${candidate.authors.slice(0, 3).join('; ')} (${candidate.year ?? '?'}) ${candidate.doi || candidate.arxivID || ''}`,
        ) ?? [],
      candidateIndex: row?.candidateIndex ?? -1,
      provenance: paper
        ? `${paper.source} · ${paper.sourceID}\n${paper.retrievedAt}\n${paper.url || ''}${
            paper.version
              ? '\n' +
                Object.entries(paper.version)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(' · ')
              : ''
          }`
        : '',
      fields:
        row?.plan?.changes.map((change) => ({
          field: change.field,
          before: metadataValueText(change.before),
          after: metadataValueText(change.after),
          selected: row.selected.has(change.field),
        })) ?? [],
      history:
        row?.history.map((artifact) => ({
          id: artifact.revisionID,
          title: `${artifact.createdAt} · ${artifact.revisionID} · ${'stage' in artifact.payload ? String(artifact.payload.stage) : ''}`,
        })) ?? [],
      canApply: !!row?.plan && !!row.selected.size && !row.applied.length,
      canSave: !!row?.plan,
      bibtex: row?.bibtex || '',
      canEdit: !!row?.plan && !row.applied.length,
    };
  }
  #render(view: ReviewView): void {
    if (this.#current(view)) view.react?.update(this.#model(view));
  }
  #dispatch(view: ReviewView, command: MetadataReviewCommand): void {
    const row = view.rows[view.index];
    if (command.type === 'close') {
      this.close(true);
      return;
    }
    if (command.type === 'stop') {
      view.abort?.abort();
      return;
    }
    if (view.busy) return;
    switch (command.type) {
      case 'source':
        if (
          this.#metadata.sources.some((source) => source.id === command.value) &&
          command.value !== view.source
        ) {
          view.source = command.value as ScholarlySource;
          if (row) {
            row.plan = undefined;
            row.papers = [];
            row.candidateIndex = -1;
            row.revision++;
          }
        }
        break;
      case 'item':
        if (Number.isInteger(command.index) && view.rows[command.index]) {
          view.index = command.index;
          void this.#history(view, view.rows[view.index]!);
        }
        break;
      case 'bibtex':
        if (row && command.value.length <= 32768) row.bibtex = command.value;
        break;
      case 'candidate':
        if (row && Number.isInteger(command.index) && row.papers[command.index] && row.snapshot) {
          row.candidateIndex = command.index;
          this.#plan(row, row.snapshot, row.papers[command.index]!);
        }
        break;
      case 'field':
        if (
          row &&
          !row.applied.length &&
          row.plan?.changes.some((field) => field.field === command.field)
        ) {
          if (command.checked) row.selected.add(command.field);
          else row.selected.delete(command.field);
        }
        break;
      case 'history': {
        const artifact = row?.history.find((entry) => entry.revisionID === command.id);
        const paper = artifact && row && readMetadataReviewPaper(artifact.payload, row.key);
        if (row && artifact && paper) {
          this.#plan(row, snapshotMetadata(row.item), paper);
          row.papers = [];
          row.candidateIndex = -1;
          row.parents = [artifact.revisionID];
          row.recordID = artifact.recordID;
          row.status = this.#text(
            view,
            '已载入附件建议；请核对来源与全部差异，不会自动执行。',
            'Loaded an attachment proposal. Review its origin and all differences; nothing is executed automatically.',
          );
        }
        break;
      }
      case 'inspect':
        void this.#inspect(view, false);
        return;
      case 'inspect-all':
        void this.#inspect(view, true);
        return;
      case 'refresh':
        void this.#inspect(view, false, true);
        return;
      case 'apply':
        if (row) void this.#apply(view, row);
        return;
      case 'save':
        if (row) void this.#save(view, row);
        return;
    }
    this.#render(view);
  }
  #plan(row: ReviewRow, snapshot: MetadataSnapshot, paper: ScholarlyPaper): void {
    row.revision++;
    row.recordID = `metadata:${paper.source}:${paper.sourceID}`;
    row.snapshot = snapshot;
    row.plan = createMetadataPlan(snapshot, paper);
    row.selected = new Set(
      row.plan.changes.filter((change) => change.selected).map((change) => change.field),
    );
    row.applied = [];
    row.parents = [];
    row.savedJSON = undefined;
    row.savedAttachment = undefined;
    row.savedRevision = undefined;
    row.pendingPublication = undefined;
  }
  async #history(view: ReviewView, row: ReviewRow): Promise<void> {
    const revision = row.revision;
    try {
      const listing = await this.#artifacts.list(row.item, 'metadata-review');
      if (!this.#current(view)) return;
      row.history = listing.artifacts.filter(
        (entry) => !!readMetadataReviewPaper(entry.payload, row.key),
      );
      if (revision === row.revision && (!listing.complete || listing.issues.length)) {
        row.status =
          listing.issues.map((issue) => issue.message).join('\n') ||
          this.#text(view, '部分成果尚未下载', 'Some artifacts have not been downloaded');
      }
      this.#render(view);
    } catch (error) {
      if (this.#current(view) && revision === row.revision) {
        row.status = String(error);
        row.error = true;
        this.#render(view);
      }
    }
  }
  async #inspect(view: ReviewView, all: boolean, refresh = false): Promise<void> {
    const ownerWindow = view.host.window as Window & typeof globalThis;
    const abort = new ownerWindow.AbortController();
    view.abort = abort;
    view.busy = true;
    const indexes = all ? view.rows.map((_, index) => index) : [view.index];
    try {
      for (const index of indexes) {
        if (!this.#current(view) || abort.signal.aborted) break;
        const row = view.rows[index]!;
        row.revision++;
        view.index = index;
        row.status = this.#text(view, '正在查询…', 'Querying…');
        row.error = false;
        row.plan = undefined;
        row.papers = [];
        row.candidateIndex = -1;
        this.#render(view);
        try {
          if (row.item.key !== row.key || row.item.libraryID !== row.libraryID || row.item.deleted)
            throw new Error('The captured item is no longer available');
          const snapshot = snapshotMetadata(row.item, row.bibtex);
          row.snapshot = snapshot;
          const result = await this.#metadata.lookup(snapshot.query, abort.signal, {
            source: view.source,
            ...(refresh ? { mode: 'refresh' as const } : {}),
          });
          if (!this.#current(view) || abort.signal.aborted) break;
          if (result.kind === 'found') {
            this.#plan(row, snapshot, result.paper);
            row.status = this.#text(
              view,
              '已按标识符匹配；请审阅字段。',
              'Matched an identifier; review the proposed fields.',
            );
          } else if (result.kind === 'candidates') {
            row.papers = result.papers;
            row.status = this.#text(
              view,
              '请选择正确候选；标题相似不等于同一论文。',
              'Choose the correct candidate; similar titles do not establish identity.',
            );
          } else
            row.status = this.#text(view, '该来源未找到记录。', 'No record found in this source.');
          if (result.cache)
            row.status += ` · ${result.cache.origin}${result.cache.stale ? ' / stale' : ''}${result.cache.warning ? ' · ' + result.cache.warning : ''}`;
        } catch (error) {
          if (abort.signal.aborted) {
            row.status = this.#text(view, '已停止；未应用字段。', 'Stopped; no fields applied.');
            break;
          }
          row.status = error instanceof Error ? error.message : String(error);
          row.error = true;
        }
        this.#render(view);
      }
    } finally {
      if (this.#current(view)) {
        view.busy = false;
        view.abort = undefined;
        this.#render(view);
      }
    }
  }
  async #publishPending(view: ReviewView, row: ReviewRow): Promise<void> {
    const pending = row.pendingPublication;
    if (!pending) return;
    const receipt = await this.#artifacts.publish(row.item, pending.input, () =>
      this.#current(view),
    );
    row.savedJSON = pending.json;
    row.savedAttachment = receipt.attachmentKey;
    row.savedRevision = receipt.artifact.revisionID;
    row.pendingPublication = undefined;
  }
  async #persist(view: ReviewView, row: ReviewRow, project: boolean): Promise<void> {
    if (!row.plan) throw new Error('Inspect or load a proposal first');
    const payload = metadataReviewPayload(row.plan, [...row.selected], row.applied);
    const json = JSON.stringify(payload);
    await this.#publishPending(view, row);
    if (json !== row.savedJSON || !row.savedAttachment) {
      const recordID =
        row.recordID || `metadata:${row.plan.paper.source}:${row.plan.paper.sourceID}`;
      const listing = await this.#artifacts.list(row.item, 'metadata-review');
      if (!listing.complete)
        throw new Error(
          'Some artifact files are unavailable or inconsistent; resolve them before saving',
        );
      const heads = artifactHeads(listing.artifacts, recordID);
      if (!row.savedRevision && !row.parents.length && heads.length > 1)
        throw new Error('Concurrent review branches exist; load the branch to continue explicitly');
      row.pendingPublication = {
        json,
        input: {
          kind: 'metadata-review',
          recordID,
          revisionID: Zotero.Utilities.randomString(32),
          payload,
          parentRevisions: row.savedRevision
            ? [row.savedRevision]
            : row.parents.length
              ? row.parents
              : heads.map((entry) => entry.revisionID),
        },
      };
      await this.#publishPending(view, row);
    }
    if (project && row.savedAttachment) {
      await projectArtifactNote(
        row.item,
        row.savedAttachment,
        `Neo · ${this.#text(view, '元数据审阅', 'Metadata review')} · ${row.plan.paper.title}`,
        [
          `${row.plan.paper.source} / ${row.plan.paper.sourceID} / ${row.plan.paper.retrievedAt}`,
          this.#text(
            view,
            '此笔记是 JSON 成果的展示副本；手工修改不会写回机器数据。',
            'This note is a display copy of the JSON artifact; manual edits do not change the machine data.',
          ),
          `${payload.stage}: ${payload.appliedFields.join(', ')}`,
          ...row.plan.changes.map(
            (change) =>
              `${row.selected.has(change.field) ? '[x]' : '[ ]'} ${change.field}\n${metadataValueText(change.before)}\n→ ${metadataValueText(change.after)}`,
          ),
        ],
        () => this.#current(view),
      );
    }
  }
  async #save(view: ReviewView, row: ReviewRow): Promise<void> {
    view.busy = true;
    row.error = false;
    this.#render(view);
    try {
      await this.#persist(view, row, true);
      row.status = this.#text(
        view,
        '成果附件与展示笔记已在本机保存；远端可用性取决于 Zotero 同步。',
        'Artifact and display note saved locally; remote availability depends on Zotero sync.',
      );
      await this.#history(view, row);
    } catch (error) {
      row.status = String(error);
      row.error = true;
    } finally {
      if (this.#current(view)) {
        view.busy = false;
        this.#render(view);
      }
    }
  }
  async #apply(view: ReviewView, row: ReviewRow): Promise<void> {
    if (!row.plan || row.applied.length || !row.selected.size) return;
    view.busy = true;
    row.error = false;
    this.#render(view);
    try {
      await this.#persist(view, row, false);
      row.applied = await applyMetadataPlan(row.plan, [...row.selected], () => this.#current(view));
      try {
        await this.#persist(view, row, true);
        row.status = this.#text(
          view,
          '字段已更新，回执已在本机保存。',
          'Fields updated and receipt saved locally.',
        );
      } catch (error) {
        row.status =
          this.#text(
            view,
            '字段已更新，但回执保存失败；不要重复应用，可重试保存成果。',
            'Fields were updated, but receipt storage failed. Do not apply again; retry saving the result.',
          ) +
          '\n' +
          String(error);
        row.error = true;
      }
    } catch (error) {
      row.status = String(error);
      row.error = true;
    } finally {
      if (this.#current(view)) {
        view.busy = false;
        this.#render(view);
      }
    }
  }
  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view;
    if (!view || !this.#current(view)) return false;
    const target = event.target as Node | null;
    if (!target || target.ownerDocument !== view.root.ownerDocument) return false;
    event.stopImmediatePropagation();
    if (compositionOwnsKey(event, view.composition)) return true;
    const key = keyString(event);
    if (key === 'escape') {
      event.preventDefault();
      this.close(true);
    } else if (!view.root.contains(target)) {
      event.preventDefault();
      view.react?.getElement('close')?.focus();
    } else if (key === 'tab' || key === 'shift+tab') {
      const controls = (
        Array.from(
          view.root.querySelectorAll<HTMLElement>('input,select,textarea,button,summary'),
        ) as HTMLElement[]
      ).filter(
        (element) => !(element as HTMLButtonElement).disabled && element.getClientRects().length,
      );
      if (key === 'tab' && target === controls.at(-1)) {
        event.preventDefault();
        controls[0]?.focus();
      } else if (key === 'shift+tab' && target === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      }
    }
    return true;
  }
  closeOwner(window: Window): void {
    if (this.#view?.host.window === window) this.close();
  }
  close(restore = false): void {
    const view = this.#view;
    if (!view) return;
    const ownedFocus = view.root.contains(view.root.ownerDocument.activeElement);
    this.#view = null;
    view.abort?.abort();
    if (!isDeadObject(view.host.window)) {
      view.host.window.removeEventListener('keydown', view.capture, true);
      view.host.window.removeEventListener('unload', view.unload);
    }
    try {
      view.react?.dispose();
    } finally {
      view.untheme();
      if (!isDeadObject(view.backdrop)) view.backdrop.remove();
    }
    if (restore && ownedFocus && view.host.isCurrent() && view.focus?.isConnected)
      view.focus.focus();
  }
  dispose(): void {
    this.close();
  }
}
