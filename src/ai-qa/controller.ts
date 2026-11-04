import type { AIService } from '../ai/contracts';
import { aiErrorCode } from '../ai/errors';
import { createAIService } from '../ai/service';
import type { ReaderSelectionContext } from '../core/contracts';
import { CleanupFailure } from '../core/cleanup';
import type { Logger } from '../core/logging';
import { reportDiagnosticError } from '../core/logging';
import type { PreferenceStore } from '../core/preference-store';
import { neoCommandLanguage } from '../core/preferences';
import { t } from '../i18n';
import { createAIAbortController } from '../platform/ai-runtime';
import { attachmentReadingStorage } from '../platform/ai-qa-storage';
import { releaseAIQAUI } from '../platform/ai-qa-ui';
import {
  AIQAPanelHost,
  readerRegionPreview,
  type AIQAPanelLease,
  type ReaderRuntime,
} from '../toolkit/reader';
import { ThemeManager } from '../ui/theme';
import { saveAIQAToNote } from './adoption';
import type {
  AIQAEvidence,
  AIQAErrorCode,
  AIQAInputImage,
  AIQARecord,
  AIQARepository,
  AIQATaskKind,
  AIQATasks,
  AIQATaskState,
} from './contracts';
import {
  captureAIQASource,
  aiQASelectionEvidence,
  readAIQAContext,
  type AIQAContext,
  type AIQASourceCapture,
} from './evidence';
import { AIQAError } from './errors';
import type { AIQAReaderPort, AIQAReaderViewAccess } from './reader-port';
import { createAIQARepository } from './repository';
import { createAIQATasks } from './tasks';
import { mountAIQAView } from './view-host';
import {
  AI_QA_TEXT_KEYS,
  type AIQACommand,
  type AIQASourcePreview,
  type AIQAView,
  type AIQAViewModel,
} from './view-contracts';

interface Session {
  readonly port: AIQAReaderPort;
  capture: AIQASourceCapture | null;
  context: AIQAContext | null;
  selection: ReaderSelectionContext | null;
  access: AIQAReaderViewAccess | null;
  records: readonly AIQARecord[];
  preview: AIQASourcePreview | null;
  previewAbort: AbortController | null;
  error: string | null;
  notice: string | null;
  loading: boolean;
  pendingLoad: Promise<void> | null;
  recordsRevision: number;
  resultID: string | null;
  operationRevision: number;
}
interface Mount {
  readonly lease: AIQAPanelLease;
  view: AIQAView | null;
  active: boolean;
  revision: number;
  themeRelease: (() => void) | null;
}
interface Preparation {
  readonly abort: AbortController;
  readonly kind: AIQATaskKind;
}

interface Invocation {
  readonly selection: ReaderSelectionContext | null;
  readonly access: AIQAReaderViewAccess | null;
  readonly sectionID: string | null;
}

/** App-owned tasks and results outlive the native panel; Reader supplies selection and exact-view policy. */
export class AIQAController {
  readonly #rootURI: string;
  readonly #preferences: PreferenceStore;
  readonly #logger: Logger;
  readonly #service: AIService;
  readonly #repository: AIQARepository;
  readonly #tasks: AIQATasks;
  readonly #panel: AIQAPanelHost;
  readonly #unsubscribe: () => void;
  readonly #sessions = new Map<ReaderRuntime, Session>();
  readonly #mounts = new Map<HTMLElement, Mount>();
  readonly #preparing = new Map<number, Preparation>();
  #disposed = false;

  constructor(options: {
    readonly pluginID: string;
    readonly rootURI: string;
    readonly preferences: PreferenceStore;
    readonly logger: Logger;
  }) {
    this.#rootURI = options.rootURI;
    this.#preferences = options.preferences;
    this.#logger = options.logger;
    this.#service = createAIService({ rootURI: options.rootURI, preferences: options.preferences });
    this.#repository = createAIQARepository(attachmentReadingStorage());
    this.#tasks = createAIQATasks({
      client: this.#service,
      repository: this.#repository,
      createAbortController: createAIAbortController,
    });
    this.#unsubscribe = this.#tasks.subscribe(() => {
      for (const state of this.#sessions.values()) {
        const task = this.#task(state);
        if (task.phase === 'complete' && task.resultID !== state.resultID) {
          state.resultID = task.resultID;
          this.#perform(state, () => this.#reloadRecords(state));
        }
        this.#emit(state);
      }
    });
    try {
      this.#panel = new AIQAPanelHost(options.pluginID, options.rootURI, {
        entryLabel: () =>
          t('reader.ai.title', neoCommandLanguage(options.preferences, Zotero.locale ?? '')),
        mount: (lease) => {
          const mount: Mount = {
            lease,
            view: null,
            active: false,
            revision: 0,
            themeRelease: null,
          };
          this.#mounts.set(lease.root, mount);
          return () => {
            this.#mounts.delete(lease.root);
            try {
              this.#retire(mount);
            } finally {
              if (![...this.#mounts.values()].some((other) => other.lease.window === lease.window))
                releaseAIQAUI(lease.window);
            }
          };
        },
        activate: (lease) => this.#activate(lease),
        changed: (lease) => {
          const state = this.#sessions.get(lease.reader);
          if (state) this.#emit(state);
        },
        failed: (reader, error) => {
          reportDiagnosticError(this.#logger, 'AI Q&A tool window failed', error);
          const state = this.#sessions.get(reader);
          if (state) state.port.showStatus(this.#text(state, 'error.unsupported'));
        },
      });
    } catch (error) {
      this.#unsubscribe();
      this.#tasks.dispose();
      this.#service.dispose();
      throw error;
    }
  }

  register(port: AIQAReaderPort): () => void {
    if (this.#disposed || this.#sessions.has(port.reader)) throw new AIQAError('unsupported');
    const state: Session = {
      port,
      capture: null,
      context: null,
      selection: null,
      access: null,
      records: [],
      preview: null,
      previewAbort: null,
      error: null,
      notice: null,
      loading: false,
      pendingLoad: null,
      recordsRevision: 0,
      resultID: null,
      operationRevision: 0,
    };
    this.#sessions.set(port.reader, state);
    return () => {
      if (this.#sessions.get(port.reader) !== state) return;
      this.#sessions.delete(port.reader);
      state.recordsRevision += 1;
      state.previewAbort?.abort();
      this.#panel.releaseReader(port.reader);
    };
  }

  /** Capture before opening native chrome: focusing the panel must not change the request's selection or pane. */
  open(reader: ReaderRuntime, selection?: ReaderSelectionContext | null): boolean {
    const state = this.#sessions.get(reader);
    if (!state || this.#disposed) return false;
    state.selection = selection === undefined ? state.port.captureSelection() : selection;
    state.access = state.port.captureView();
    state.previewAbort?.abort();
    state.preview = null;
    const opened = this.#panel.open(reader);
    if (!opened) state.port.showStatus(this.#text(state, 'error.unsupported'));
    if (opened) this.#emit(state);
    return opened;
  }

  async explain(reader: ReaderRuntime, selection: ReaderSelectionContext): Promise<void> {
    if (!this.open(reader, selection)) return;
    const state = this.#sessions.get(reader)!;
    const invocation: Invocation = {
      selection: { ...selection },
      access: state.access,
      sectionID: state.context?.sectionID ?? null,
    };
    await this.#execute(state, async () => {
      await this.#load(state);
      await this.#run(state, 'explain', '', invocation);
    });
  }

  ownsTarget(target: EventTarget | null): boolean {
    return this.#panel.ownsTarget(target);
  }

  #current(state: Session): boolean {
    return !this.#disposed && this.#sessions.get(state.port.reader) === state;
  }
  #text(state: Session, key: string): string {
    return t(`reader.ai.${key}`, state.port.language());
  }

  #task(state: Session): AIQATaskState {
    const itemID = state.capture?.source.itemID ?? state.port.reader.itemID ?? 0;
    const preparation = this.#preparing.get(itemID);
    return preparation
      ? {
          itemID,
          taskID: null,
          kind: preparation.kind,
          phase: 'preparing',
          error: null,
          resultID: null,
        }
      : this.#tasks.state(itemID);
  }

  #model(state: Session): AIQAViewModel {
    const labels = Object.fromEntries(
      AI_QA_TEXT_KEYS.map((key) => [key, this.#text(state, key)]),
    ) as AIQAViewModel['labels'];
    const task = this.#task(state);
    const hasSelection = !!state.selection?.text.trim();
    return {
      labels,
      configuration: this.#service.configuration(),
      source: state.capture?.source ?? null,
      contextTitle: hasSelection
        ? (state.capture?.source.fileName ?? '')
        : (state.context?.title ?? ''),
      hasSelection,
      sections: state.context?.sections ?? [],
      selectedSectionID: state.context?.sectionID ?? null,
      limitedContext: state.context?.limited ?? false,
      task,
      records: state.records.map((record) => ({
        record,
        sourceCurrent: record.source.fingerprint === state.capture?.source.fingerprint,
      })),
      preview: state.preview,
      error: state.error ?? (task.error ? this.#text(state, `error.${task.error}`) : null),
      notice: state.notice,
      loading: state.loading,
    };
  }

  #emit(state: Session): void {
    if (!this.#current(state)) return;
    const mounts = [...this.#mounts.values()].filter(
      (mount) =>
        mount.active && mount.lease.reader === state.port.reader && mount.lease.isCurrent(),
    );
    if (!mounts.length) return;
    const model = this.#model(state);
    for (const mount of mounts) {
      try {
        mount.view?.update(model);
      } catch {
        this.#logger.debug('AI Q&A view update failed');
      }
    }
  }

  #activate(lease: AIQAPanelLease): void {
    const mount = this.#mounts.get(lease.root),
      state = this.#sessions.get(lease.reader);
    if (!mount || !lease.isCurrent() || mount.active || !state) return;
    mount.active = true;
    if (lease.ownsWindow) {
      const theme = new ThemeManager(lease.window, this.#preferences);
      mount.themeRelease = () => theme.dispose();
      theme.add(lease.root);
    } else {
      mount.themeRelease = state.port.themeRoot(lease.root);
    }
    state.access ??= state.port.captureView();
    state.selection ??= state.port.captureSelection();
    const revision = ++mount.revision;
    void mountAIQAView(this.#rootURI, lease, this.#model(state), (command) =>
      this.#perform(state, () => this.#command(state, command)),
    )
      .then((view) => {
        if (
          !mount.active ||
          mount.revision !== revision ||
          !lease.isCurrent() ||
          !this.#current(state)
        ) {
          view.dispose();
          return;
        }
        mount.view = view;
        this.#emit(state);
      })
      .catch(() => {
        if (mount.revision !== revision || !lease.isCurrent()) return;
        mount.active = false;
        state.error = this.#text(state, 'error.unsupported');
        lease.root.textContent = state.error;
      });
    this.#perform(state, () => this.#load(state));
  }

  #retire(mount: Mount): void {
    mount.active = false;
    mount.revision += 1;
    const view = mount.view;
    mount.view = null;
    const themeRelease = mount.themeRelease;
    mount.themeRelease = null;
    const failure = new CleanupFailure();
    failure.run(() => view?.dispose());
    failure.run(() => themeRelease?.());
    failure.rethrow();
  }

  #perform(state: Session, action: () => Promise<void>): void {
    void this.#execute(state, action);
  }
  async #execute(state: Session, action: () => Promise<void>): Promise<void> {
    if (!this.#current(state)) return;
    const revision = ++state.operationRevision;
    state.error = null;
    state.notice = null;
    try {
      await action();
    } catch (error) {
      if (!this.#current(state) || state.operationRevision !== revision) return;
      const code: AIQAErrorCode = error instanceof AIQAError ? error.code : aiErrorCode(error);
      state.error = this.#text(state, `error.${code}`);
      this.#logger.debug(`AI Q&A operation failed code=${code}`);
    } finally {
      this.#emit(state);
    }
  }

  async #load(state: Session): Promise<void> {
    if (state.pendingLoad) return state.pendingLoad;
    state.loading = true;
    this.#emit(state);
    const load = async (): Promise<void> => {
      const capture = await captureAIQASource(state.port.reader);
      if (!this.#current(state)) return;
      if (state.capture?.source.fingerprint !== capture.source.fingerprint) {
        state.context = null;
        state.preview = null;
      }
      state.capture = capture;
      await this.#reloadRecords(state);
      const context = await readAIQAContext(
        state.port.reader,
        this.#preferences,
        capture,
        () => this.#current(state),
        {
          prepare: false,
          sectionID: state.context?.sectionID ?? null,
          selection: state.selection,
          pageIndex: state.access?.pageIndex ?? null,
        },
      );
      if (this.#current(state)) state.context = context;
    };
    state.pendingLoad = load().finally(() => {
      state.pendingLoad = null;
      state.loading = false;
      this.#emit(state);
    });
    return state.pendingLoad;
  }

  async #reloadRecords(state: Session): Promise<void> {
    const capture = state.capture;
    if (!capture) return;
    const revision = ++state.recordsRevision;
    const records = await this.#repository.list(capture.source);
    if (this.#current(state) && state.capture === capture && state.recordsRevision === revision)
      state.records = records;
  }

  async #run(
    state: Session,
    kind: AIQATaskKind,
    question: string,
    invocation: Invocation = {
      selection: state.selection && { ...state.selection },
      access: state.access,
      sectionID: state.context?.sectionID ?? null,
    },
  ): Promise<void> {
    const capture = state.capture;
    if (!capture || !this.#current(state)) throw new AIQAError('stale-source');
    if (!this.#service.configuration().configured) throw new AIQAError('unconfigured');
    const itemID = capture.source.itemID;
    if (
      this.#preparing.has(itemID) ||
      ['preparing', 'requesting', 'saving'].includes(this.#tasks.state(itemID).phase)
    )
      throw new AIQAError('busy');
    question = question.trim();
    if (question.length > 8000 || (kind === 'question' && !question))
      throw new AIQAError('unsupported');
    const preparation: Preparation = { abort: createAIAbortController(), kind };
    this.#preparing.set(itemID, preparation);
    const current = (): boolean => !this.#disposed && !preparation.abort.signal.aborted;
    this.#emit(state);
    try {
      if (!(await capture.isCurrent())) throw new AIQAError('stale-source');
      let evidence = aiQASelectionEvidence(capture.source, invocation.selection);
      if (kind === 'explain' && !evidence.length) throw new AIQAError('unsupported');
      let title = this.#text(state, 'selection');
      if (kind === 'guide' || (kind === 'question' && !evidence.length)) {
        const context = await readAIQAContext(
          state.port.reader,
          this.#preferences,
          capture,
          current,
          {
            prepare: true,
            sectionID: invocation.sectionID,
            selection: invocation.selection,
            pageIndex: invocation.access?.pageIndex ?? null,
          },
        );
        if (!context?.evidence.length) throw new AIQAError('unsupported');
        if (
          this.#current(state) &&
          (!state.context || state.context.sectionID === invocation.sectionID)
        )
          state.context = context;
        evidence = context.evidence;
        title = context.title;
      }
      const images: AIQAInputImage[] = [];
      if (this.#service.configuration().sendImages) {
        for (const entry of evidence
          .filter((value) => (value.kind === 'figure' || value.kind === 'table') && value.location)
          .slice(0, 4)) {
          if (!current()) throw new AIQAError('cancelled');
          const preview = await readerRegionPreview(
            state.port.reader,
            entry.location!,
            preparation.abort.signal,
          );
          const prefix = 'data:image/png;base64,';
          if (!preview.dataURL.startsWith(prefix)) throw new AIQAError('unsupported');
          images.push({
            evidenceID: entry.id,
            data: preview.dataURL.slice(prefix.length),
            mediaType: 'image/png',
          });
        }
      }
      if (!current()) throw new AIQAError('cancelled');
      // A prepared request is admitted independently of panel focus; only the PDF revision guards its save.
      this.#preparing.delete(itemID);
      const pending = this.#tasks.run({
        source: capture.source,
        kind,
        question:
          question || this.#text(state, kind === 'guide' ? 'guideQuestion' : 'explainQuestion'),
        contextTitle: title,
        evidence,
        images,
        isCurrent: () => capture.isCurrent(),
      });
      await pending;
    } finally {
      if (this.#preparing.get(itemID) === preparation) this.#preparing.delete(itemID);
      this.#emit(state);
    }
  }

  #record(state: Session, id: string): AIQARecord {
    const record = state.records.find((value) => value.id === id);
    if (!record) throw new AIQAError('storage');
    return record;
  }

  async #evidence(state: Session, resultID: string, evidenceID: string): Promise<AIQAEvidence> {
    const record = this.#record(state, resultID),
      capture = state.capture;
    if (
      !capture ||
      record.source.fingerprint !== capture.source.fingerprint ||
      !(await capture.isCurrent())
    )
      throw new AIQAError('stale-source');
    const evidence = record.evidence.find((value) => value.id === evidenceID);
    if (!evidence) throw new AIQAError('invalid-output');
    return evidence;
  }

  async #preview(state: Session, resultID: string, evidenceID: string): Promise<void> {
    state.previewAbort?.abort();
    const abort = createAIAbortController();
    state.previewAbort = abort;
    const evidence = await this.#evidence(state, resultID, evidenceID);
    if (!this.#current(state) || abort.signal.aborted || state.previewAbort !== abort) return;
    const id = `${resultID}/${evidenceID}`;
    state.preview = { id, title: evidence.title, text: evidence.text, imageDataURL: null };
    this.#emit(state);
    if (!evidence.location) return;
    try {
      const preview = await readerRegionPreview(state.port.reader, evidence.location, abort.signal);
      if (this.#current(state) && state.previewAbort === abort && !abort.signal.aborted)
        state.preview = {
          id,
          title: evidence.title,
          text: evidence.text,
          imageDataURL: preview.dataURL,
        };
    } catch {
      if (!abort.signal.aborted && this.#current(state))
        state.notice = this.#text(state, 'evidenceUnavailable');
    }
  }

  async #command(state: Session, command: AIQACommand): Promise<void> {
    switch (command.type) {
      case 'configure':
        await this.#service.configure(
          command.configuration,
          command.forget
            ? { kind: 'forget' }
            : command.key
              ? { kind: 'replace', value: command.key }
              : { kind: 'keep' },
        );
        state.notice = this.#text(state, 'saved');
        for (const session of this.#sessions.values()) this.#emit(session);
        return;
      case 'close':
        this.#panel.close(state.port.reader);
        state.previewAbort?.abort();
        for (const mount of this.#mounts.values())
          if (mount.lease.reader === state.port.reader && mount.lease.isCurrent()) {
            this.#retire(mount);
            const button = mount.lease.root.ownerDocument.createElementNS(
              'http://www.w3.org/1999/xhtml',
              'button',
            );
            button.textContent = this.#text(state, 'title');
            button.addEventListener('click', () => this.#activate(mount.lease));
            mount.lease.root.replaceChildren(button);
          }
        return;
      case 'explain':
        return this.#run(state, 'explain', '');
      case 'ask':
        return this.#run(state, 'question', command.question);
      case 'guide':
        return this.#run(state, 'guide', '');
      case 'cancel': {
        const itemID = state.capture?.source.itemID;
        if (itemID) {
          this.#preparing.get(itemID)?.abort.abort();
          this.#preparing.delete(itemID);
          this.#tasks.cancel(itemID);
        }
        state.notice = this.#text(state, 'cancelled');
        return;
      }
      case 'select-section': {
        const capture = state.capture;
        if (!capture || !state.context?.sections.some((value) => value.id === command.id))
          throw new AIQAError('unsupported');
        state.context = await readAIQAContext(
          state.port.reader,
          this.#preferences,
          capture,
          () => this.#current(state),
          {
            prepare: true,
            sectionID: command.id,
            selection: state.selection,
            pageIndex: state.access?.pageIndex ?? null,
          },
        );
        return;
      }
      case 'preview':
        return this.#preview(state, command.resultID, command.evidenceID);
      case 'jump': {
        const evidence = await this.#evidence(state, command.resultID, command.evidenceID);
        if (
          state.preview?.id !== `${command.resultID}/${command.evidenceID}` ||
          !evidence.location ||
          !state.access?.isCurrent() ||
          !state.access.jump(evidence.location)
        )
          throw new AIQAError('stale-source');
        return;
      }
      case 'save-note': {
        if (!state.capture) throw new AIQAError('stale-source');
        const labels = this.#model(state).labels;
        await saveAIQAToNote(this.#record(state, command.resultID), state.capture, labels);
        state.notice = this.#text(state, 'saved');
        return;
      }
      case 'edit': {
        const record = this.#record(state, command.resultID);
        await this.#repository.edit(record.source, record.id, command.revision, command.text);
        await this.#reloadRecords(state);
        state.notice = this.#text(state, 'saved');
        return;
      }
      case 'remove': {
        const record = this.#record(state, command.resultID);
        await this.#repository.remove(record.source, record.id, command.revision);
        state.previewAbort?.abort();
        state.preview = null;
        await this.#reloadRecords(state);
        return;
      }
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const failure = new CleanupFailure();
    const owners = new Set([...this.#mounts.values()].map((mount) => mount.lease.window));
    for (const preparation of this.#preparing.values())
      failure.run(() => preparation.abort.abort());
    this.#preparing.clear();
    for (const state of this.#sessions.values()) failure.run(() => state.previewAbort?.abort());
    failure.run(this.#unsubscribe);
    failure.run(() => this.#tasks.dispose());
    failure.run(() => this.#panel.dispose());
    for (const owner of owners) failure.run(() => releaseAIQAUI(owner));
    failure.run(() => this.#service.dispose());
    this.#mounts.clear();
    this.#sessions.clear();
    failure.rethrow();
  }
}
