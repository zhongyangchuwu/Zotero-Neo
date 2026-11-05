import type { AIConfiguration, AICredentialChange, AIService } from '../ai/contracts';
import { aiErrorCode } from '../ai/errors';
import { CleanupFailure } from '../core/cleanup';
import type { ReaderSelectionContext } from '../core/contracts';
import type { Logger } from '../core/logging';
import type { PreferenceStore } from '../core/preference-store';
import { t } from '../i18n';
import { createAIAbortController } from '../platform/ai-runtime';
import { readerRegionPreview, type ReaderRuntime } from '../toolkit/reader';
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
  aiQASelectionEvidence,
  captureAIQASource,
  readAIQAContext,
  type AIQAContext,
  type AIQASourceCapture,
} from './evidence';
import { AIQAError } from './errors';
import type {
  AIQAReaderCommand,
  AIQAReaderNotice,
  AIQAReaderSnapshot,
  AIQASourcePreview,
} from './reader-contracts';
import type { AIQAReaderTaskPort, AIQAReaderViewAccess } from './reader-port';

interface Session {
  readonly port: AIQAReaderTaskPort;
  capture: AIQASourceCapture | null;
  context: AIQAContext | null;
  selection: ReaderSelectionContext | null;
  access: AIQAReaderViewAccess | null;
  records: readonly AIQARecord[];
  preview: AIQASourcePreview | null;
  previewAbort: AbortController | null;
  error: AIQAErrorCode | null;
  notice: AIQAReaderNotice | null;
  loading: boolean;
  pendingLoad: Promise<void> | null;
  recordsRevision: number;
  resultID: string | null;
  operationRevision: number;
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

/** UI-independent Reader application state; injected services retain their own lifetimes. */
export class AIQAReaderApplication {
  readonly #service: AIService;
  readonly #repository: AIQARepository;
  readonly #tasks: AIQATasks;
  readonly #preferences: PreferenceStore;
  readonly #logger: Logger;
  readonly #unsubscribe: () => void;
  readonly #sessions = new Map<ReaderRuntime, Session>();
  readonly #preparing = new Map<number, Preparation>();
  readonly #listeners = new Set<(reader: ReaderRuntime) => void>();
  #disposed = false;

  constructor(options: {
    readonly service: AIService;
    readonly repository: AIQARepository;
    readonly tasks: AIQATasks;
    readonly preferences: PreferenceStore;
    readonly logger: Logger;
  }) {
    this.#service = options.service;
    this.#repository = options.repository;
    this.#tasks = options.tasks;
    this.#preferences = options.preferences;
    this.#logger = options.logger;
    this.#unsubscribe = this.#tasks.subscribe(() => {
      for (const state of this.#sessions.values()) {
        const task = this.#task(state);
        if (task.phase === 'complete' && task.resultID !== state.resultID) {
          state.resultID = task.resultID;
          void this.#execute(state, () => this.#reloadRecords(state));
        }
        this.#emit(state);
      }
    });
  }

  register(port: AIQAReaderTaskPort): () => void {
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
    };
  }

  /** Captures the explicit invocation before native UI can change the active selection or pane. */
  capture(reader: ReaderRuntime, selection?: ReaderSelectionContext | null): boolean {
    const state = this.#sessions.get(reader);
    if (!state || this.#disposed) return false;
    state.selection = selection === undefined ? state.port.captureSelection() : selection;
    state.access = state.port.captureView();
    state.previewAbort?.abort();
    state.preview = null;
    return true;
  }

  activate(reader: ReaderRuntime): boolean {
    const state = this.#sessions.get(reader);
    if (!state || this.#disposed) return false;
    state.access ??= state.port.captureView();
    state.selection ??= state.port.captureSelection();
    return true;
  }

  load(reader: ReaderRuntime): void {
    const state = this.#sessions.get(reader);
    if (state) void this.#execute(state, () => this.#load(state));
  }

  /** Runs the captured selection without requiring a panel; invocation data is pinned before loading. */
  async explain(reader: ReaderRuntime): Promise<void> {
    const state = this.#sessions.get(reader);
    if (!state || !this.#current(state)) return;
    const invocation = this.#invocation(state);
    await this.#execute(state, async () => {
      await this.#load(state);
      await this.#run(state, 'explain', '', invocation);
    });
  }

  async dispatch(reader: ReaderRuntime, command: AIQAReaderCommand): Promise<void> {
    const state = this.#sessions.get(reader);
    if (state) await this.#execute(state, () => this.#command(state, command));
  }

  async configure(
    reader: ReaderRuntime,
    configuration: AIConfiguration,
    credential: AICredentialChange,
  ): Promise<void> {
    const state = this.#sessions.get(reader);
    if (!state) return;
    await this.#execute(state, async () => {
      await this.#service.configure(configuration, credential);
      state.notice = 'saved';
      for (const session of this.#sessions.values()) this.#emit(session);
    });
  }

  /** Fences a use case by Reader operation revision and publishes only its current failure. */
  async perform(reader: ReaderRuntime, action: () => Promise<void>): Promise<void> {
    const state = this.#sessions.get(reader);
    if (state) await this.#execute(state, action);
  }

  abortPreview(reader: ReaderRuntime): void {
    this.#sessions.get(reader)?.previewAbort?.abort();
  }

  fail(reader: ReaderRuntime, code: AIQAErrorCode): void {
    const state = this.#sessions.get(reader);
    if (!state || !this.#current(state)) return;
    state.error = code;
    this.#emit(state);
  }

  snapshot(reader: ReaderRuntime): AIQAReaderSnapshot | null {
    const state = this.#sessions.get(reader);
    if (!state || !this.#current(state)) return null;
    const task = this.#task(state);
    const hasSelection = !!state.selection?.text.trim();
    return {
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
      records: state.records,
      preview: state.preview,
      error: state.error ?? task.error,
      notice: state.notice,
      loading: state.loading,
    };
  }

  subscribe(changed: (reader: ReaderRuntime) => void): () => void {
    if (this.#disposed) return () => {};
    this.#listeners.add(changed);
    return () => {
      this.#listeners.delete(changed);
    };
  }

  #current(state: Session): boolean {
    return !this.#disposed && this.#sessions.get(state.port.reader) === state;
  }
  #text(state: Session, key: string): string {
    return t(`reader.ai.${key}`, state.port.language());
  }
  #emit(state: Session): void {
    if (!this.#current(state)) return;
    for (const listener of this.#listeners) listener(state.port.reader);
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
  #invocation(state: Session): Invocation {
    return {
      selection: state.selection && { ...state.selection },
      access: state.access,
      sectionID: state.context?.sectionID ?? null,
    };
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
      state.error = code;
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
    invocation: Invocation = this.#invocation(state),
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
      this.#preparing.delete(itemID);
      await this.#tasks.run({
        source: capture.source,
        kind,
        question:
          question || this.#text(state, kind === 'guide' ? 'guideQuestion' : 'explainQuestion'),
        contextTitle: title,
        evidence,
        images,
        isCurrent: () => capture.isCurrent(),
      });
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
      if (!abort.signal.aborted && this.#current(state)) state.notice = 'evidenceUnavailable';
    }
  }
  async #command(state: Session, command: AIQAReaderCommand): Promise<void> {
    switch (command.type) {
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
        state.notice = 'cancelled';
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
        await saveAIQAToNote(this.#record(state, command.resultID), state.capture, {
          title: this.#text(state, 'title'),
          question: this.#text(state, 'question'),
          source: this.#text(state, 'source'),
          model: this.#text(state, 'model'),
          generated: this.#text(state, 'generated'),
          modified: this.#text(state, 'modified'),
        });
        state.notice = 'saved';
        return;
      }
      case 'edit': {
        const record = this.#record(state, command.resultID);
        await this.#repository.edit(record.source, record.id, command.revision, command.text);
        await this.#reloadRecords(state);
        state.notice = 'saved';
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
  /** Retires Reader state and preparation; admitted tasks remain owned by the injected task service. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const failure = new CleanupFailure();
    for (const preparation of this.#preparing.values())
      failure.run(() => preparation.abort.abort());
    this.#preparing.clear();
    for (const state of this.#sessions.values()) failure.run(() => state.previewAbort?.abort());
    failure.run(this.#unsubscribe);
    this.#sessions.clear();
    this.#listeners.clear();
    failure.rethrow();
  }
}
