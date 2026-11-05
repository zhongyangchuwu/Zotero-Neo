import type { AICredentialChange, AIService } from '../ai/contracts';
import { createAIService } from '../ai/service';
import type { ReaderSelectionContext } from '../core/contracts';
import { CleanupFailure } from '../core/cleanup';
import type { Logger } from '../core/logging';
import { reportDiagnosticError } from '../core/logging';
import type { PreferenceStore } from '../core/preference-store';
import { t } from '../i18n';
import { createAIAbortController } from '../platform/ai-runtime';
import { attachmentReadingStorage } from '../platform/ai-qa-storage';
import type { ReaderRuntime } from '../toolkit/reader';
import type { AIQATasks } from './contracts';
import { AIQAPresentation } from './presentation';
import { AIQAReaderApplication } from './reader-application';
import type { AIQAReaderPort, AIQAReaderPresentationPort } from './reader-port';
import { createAIQARepository } from './repository';
import { createAIQATasks } from './tasks';
import { AI_QA_TEXT_KEYS, type AIQACommand, type AIQAViewModel } from './view-contracts';

/** Composes generic AI services, Reader use cases and native presentation without merging their lifetimes. */
export class AIQAController {
  readonly #service: AIService;
  readonly #tasks: AIQATasks;
  readonly #reader: AIQAReaderApplication;
  readonly #presentation: AIQAPresentation;
  readonly #unsubscribe: () => void;
  #disposed = false;

  constructor(options: {
    readonly pluginID: string;
    readonly rootURI: string;
    readonly preferences: PreferenceStore;
    readonly logger: Logger;
  }) {
    this.#service = createAIService({ rootURI: options.rootURI, preferences: options.preferences });
    const repository = createAIQARepository(attachmentReadingStorage());
    this.#tasks = createAIQATasks({
      client: this.#service,
      repository,
      createAbortController: createAIAbortController,
    });
    this.#reader = new AIQAReaderApplication({
      service: this.#service,
      repository,
      tasks: this.#tasks,
      preferences: options.preferences,
      logger: options.logger,
    });
    try {
      this.#presentation = new AIQAPresentation({
        ...options,
        readModel: (port) => this.#model(port),
        capture: (reader) => this.#reader.activate(reader),
        load: (reader) => this.#reader.load(reader),
        dispatch: (reader, command) => {
          void this.#dispatch(reader, command);
        },
        mountFailed: (reader) => this.#reader.fail(reader, 'unsupported'),
      });
      this.#unsubscribe = this.#reader.subscribe((reader) => this.#presentation.refresh(reader));
    } catch (error) {
      const failure = new CleanupFailure();
      failure.run(() => this.#reader.dispose());
      failure.run(() => this.#tasks.dispose());
      failure.run(() => this.#service.dispose());
      try {
        failure.rethrow();
      } catch (cleanupError) {
        reportDiagnosticError(options.logger, 'AI Q&A construction cleanup failed', cleanupError);
      }
      throw error;
    }
  }

  register(port: AIQAReaderPort): () => void {
    const releaseReader = this.#reader.register(port);
    let releasePresentation: () => void;
    try {
      releasePresentation = this.#presentation.register(port);
    } catch (error) {
      releaseReader();
      throw error;
    }
    return () => {
      const failure = new CleanupFailure();
      failure.run(releaseReader);
      failure.run(releasePresentation);
      failure.rethrow();
    };
  }

  /** Capture the initiating source before opening native UI can move its selection or focus. */
  open(reader: ReaderRuntime, selection?: ReaderSelectionContext | null): boolean {
    return (
      !this.#disposed && this.#reader.capture(reader, selection) && this.#presentation.open(reader)
    );
  }

  async explain(reader: ReaderRuntime, selection: ReaderSelectionContext): Promise<void> {
    if (!this.open(reader, selection)) return;
    await this.#reader.explain(reader);
  }

  ownsTarget(target: EventTarget | null): boolean {
    return !this.#disposed && this.#presentation.ownsTarget(target);
  }

  #model(port: AIQAReaderPresentationPort): AIQAViewModel | null {
    const state = this.#reader.snapshot(port.reader);
    if (!state) return null;
    const text = (key: string): string => t(`reader.ai.${key}`, port.language());
    const labels = Object.fromEntries(
      AI_QA_TEXT_KEYS.map((key) => [key, text(key)]),
    ) as AIQAViewModel['labels'];
    return {
      ...state,
      labels,
      records: state.records.map((record) => ({
        record,
        sourceCurrent: record.source.fingerprint === state.source?.fingerprint,
      })),
      error: state.error ? text(`error.${state.error}`) : null,
      notice: state.notice ? text(state.notice) : null,
    };
  }

  async #dispatch(reader: ReaderRuntime, command: AIQACommand): Promise<void> {
    if (command.type === 'close') {
      return this.#reader.perform(reader, async () => {
        this.#presentation.close(reader);
        this.#reader.abortPreview(reader);
      });
    }
    if (command.type === 'configure') {
      const credential: AICredentialChange = command.forget
        ? { kind: 'forget' }
        : command.key
          ? { kind: 'replace', value: command.key }
          : { kind: 'keep' };
      return this.#reader.configure(reader, command.configuration, credential);
    }
    return this.#reader.dispatch(reader, command);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const failure = new CleanupFailure();
    failure.run(this.#unsubscribe);
    failure.run(() => this.#reader.dispose());
    failure.run(() => this.#tasks.dispose());
    failure.run(() => this.#presentation.dispose());
    failure.run(() => this.#service.dispose());
    failure.rethrow();
  }
}
