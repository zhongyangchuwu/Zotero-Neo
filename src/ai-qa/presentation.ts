import { CleanupFailure } from '../core/cleanup';
import type { Logger } from '../core/logging';
import { reportDiagnosticError } from '../core/logging';
import type { PreferenceStore } from '../core/preference-store';
import { neoCommandLanguage } from '../core/preferences';
import { t } from '../i18n';
import { releaseAIQAUI } from '../platform/ai-qa-ui';
import { AIQAPanelHost, type AIQAPanelLease, type ReaderRuntime } from '../toolkit/reader';
import { ThemeManager } from '../ui/theme';
import { AIQAError } from './errors';
import type { AIQAReaderPresentationPort } from './reader-port';
import { mountAIQAView } from './view-host';
import type { AIQACommand, AIQAView, AIQAViewModel } from './view-contracts';

interface Mount {
  readonly lease: AIQAPanelLease;
  view: AIQAView | null;
  active: boolean;
  revision: number;
  themeRelease: (() => void) | null;
}

/** Owns native AI Q&A panels and their short-lived presentation resources. */
export class AIQAPresentation {
  readonly #rootURI: string;
  readonly #preferences: PreferenceStore;
  readonly #logger: Logger;
  readonly #readModel: (port: AIQAReaderPresentationPort) => AIQAViewModel | null;
  readonly #capture: (reader: ReaderRuntime) => boolean;
  readonly #load: (reader: ReaderRuntime) => void;
  readonly #dispatch: (reader: ReaderRuntime, command: AIQACommand) => void;
  readonly #mountFailed: (reader: ReaderRuntime) => void;
  readonly #panel: AIQAPanelHost;
  readonly #ports = new Map<ReaderRuntime, AIQAReaderPresentationPort>();
  readonly #mounts = new Map<HTMLElement, Mount>();
  #disposed = false;

  constructor(options: {
    readonly pluginID: string;
    readonly rootURI: string;
    readonly preferences: PreferenceStore;
    readonly logger: Logger;
    readonly readModel: (port: AIQAReaderPresentationPort) => AIQAViewModel | null;
    readonly capture: (reader: ReaderRuntime) => boolean;
    readonly load: (reader: ReaderRuntime) => void;
    readonly dispatch: (reader: ReaderRuntime, command: AIQACommand) => void;
    readonly mountFailed: (reader: ReaderRuntime) => void;
  }) {
    this.#rootURI = options.rootURI;
    this.#preferences = options.preferences;
    this.#logger = options.logger;
    this.#readModel = options.readModel;
    this.#capture = options.capture;
    this.#load = options.load;
    this.#dispatch = options.dispatch;
    this.#mountFailed = options.mountFailed;
    this.#panel = new AIQAPanelHost(options.pluginID, options.rootURI, {
      entryLabel: () =>
        t('reader.ai.title', neoCommandLanguage(this.#preferences, Zotero.locale ?? '')),
      mount: (lease) => {
        const mount: Mount = {
          lease,
          view: null,
          active: false,
          revision: 0,
          themeRelease: null,
        };
        this.#mounts.set(lease.root, mount);
        let released = false;
        return () => {
          if (released) return;
          released = true;
          this.#releaseMount(mount);
        };
      },
      activate: (lease) => this.#activate(lease),
      changed: (lease) => this.refresh(lease.reader),
      failed: (reader, error) => {
        reportDiagnosticError(this.#logger, 'AI Q&A tool window failed', error);
        const port = this.#ports.get(reader);
        if (port) port.showStatus(this.#text(port, 'error.unsupported'));
      },
    });
  }

  /** Registers UI capabilities only; release cannot cancel Reader tasks or mutate their results. */
  register(port: AIQAReaderPresentationPort): () => void {
    if (this.#disposed || this.#ports.has(port.reader)) throw new AIQAError('unsupported');
    this.#ports.set(port.reader, port);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.#ports.get(port.reader) !== port) return;
      this.#ports.delete(port.reader);
      this.#panel.releaseReader(port.reader);
    };
  }

  open(reader: ReaderRuntime): boolean {
    if (this.#disposed) return false;
    const port = this.#ports.get(reader);
    if (!port) return false;
    const opened = this.#panel.open(reader);
    if (!opened) port.showStatus(this.#text(port, 'error.unsupported'));
    else this.refresh(reader);
    return opened;
  }

  /** Reads and projects application state only while this Reader has a current visible mount. */
  refresh(reader: ReaderRuntime): void {
    if (this.#disposed) return;
    const port = this.#ports.get(reader);
    if (!port) return;
    let hasCurrentMount = false;
    for (const mount of this.#mounts.values()) {
      if (mount.active && mount.lease.reader === reader && mount.lease.isCurrent()) {
        hasCurrentMount = true;
        break;
      }
    }
    if (!hasCurrentMount) return;
    const model = this.#readModel(port);
    if (!model) return;
    for (const mount of this.#mounts.values()) {
      if (!mount.active || mount.lease.reader !== reader || !mount.lease.isCurrent()) continue;
      try {
        mount.view?.update(model);
      } catch {
        this.#logger.debug('AI Q&A view update failed');
      }
    }
  }

  /** Closes presentation or leaves its reopen button; accepted task cancellation is not a UI effect. */
  close(reader: ReaderRuntime): void {
    const failure = new CleanupFailure();
    failure.run(() => this.#panel.close(reader));
    const port = this.#ports.get(reader);
    if (!port) {
      failure.rethrow();
      return;
    }
    for (const mount of [...this.#mounts.values()]) {
      if (
        this.#mounts.get(mount.lease.root) !== mount ||
        mount.lease.reader !== reader ||
        !mount.lease.isCurrent()
      )
        continue;
      failure.run(() => this.#retire(mount));
      failure.run(() => {
        const button = mount.lease.root.ownerDocument.createElementNS(
          'http://www.w3.org/1999/xhtml',
          'button',
        );
        button.textContent = this.#text(port, 'title');
        button.addEventListener('click', () => this.#activate(mount.lease));
        mount.lease.root.replaceChildren(button);
      });
    }
    failure.rethrow();
  }

  ownsTarget(target: EventTarget | null): boolean {
    return this.#panel.ownsTarget(target);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const failure = new CleanupFailure();
    failure.run(() => this.#panel.dispose());
    for (const mount of [...this.#mounts.values()]) failure.run(() => this.#releaseMount(mount));
    this.#ports.clear();
    this.#mounts.clear();
    failure.rethrow();
  }

  #text(port: AIQAReaderPresentationPort, key: string): string {
    return t(`reader.ai.${key}`, port.language());
  }

  /** Pins an exact lease revision so late runtime loading cannot mount into a replaced Reader. */
  #activate(lease: AIQAPanelLease): void {
    const mount = this.#mounts.get(lease.root);
    const port = this.#ports.get(lease.reader);
    if (
      !mount ||
      mount.lease !== lease ||
      mount.active ||
      !port ||
      !lease.isCurrent() ||
      this.#disposed
    )
      return;

    const revision = ++mount.revision;
    mount.active = true;
    try {
      if (lease.ownsWindow) {
        const theme = new ThemeManager(lease.window, this.#preferences);
        mount.themeRelease = () => theme.dispose();
        theme.add(lease.root);
      } else {
        mount.themeRelease = port.themeRoot(lease.root);
      }
      if (!this.#capture(lease.reader)) {
        this.#retire(mount);
        return;
      }
      const model = this.#readModel(port);
      if (!model) {
        this.#retire(mount);
        return;
      }
      void mountAIQAView(this.#rootURI, lease, model, (command) =>
        this.#dispatch(lease.reader, command),
      )
        .then((view) => {
          if (
            !mount.active ||
            mount.revision !== revision ||
            !lease.isCurrent() ||
            this.#ports.get(lease.reader) !== port ||
            this.#disposed
          ) {
            try {
              view.dispose();
            } catch (error) {
              reportDiagnosticError(this.#logger, 'AI Q&A stale view disposal failed', error);
            }
            return;
          }
          mount.view = view;
          this.refresh(lease.reader);
        })
        .catch(() => this.#mountFailedFor(mount, revision, port));
      this.#load(lease.reader);
    } catch (error) {
      if (mount.active && mount.revision === revision) this.#mountFailedFor(mount, revision, port);
      else throw error;
    }
  }

  #mountFailedFor(mount: Mount, revision: number, port: AIQAReaderPresentationPort): void {
    if (
      mount.revision !== revision ||
      !mount.active ||
      !mount.lease.isCurrent() ||
      this.#ports.get(mount.lease.reader) !== port
    )
      return;
    const failure = new CleanupFailure();
    failure.run(() => this.#retire(mount));
    failure.run(() => this.#mountFailed(mount.lease.reader));
    failure.run(() => {
      mount.lease.root.textContent = this.#text(port, 'error.unsupported');
    });
    failure.rethrow();
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

  #releaseMount(mount: Mount): void {
    if (this.#mounts.get(mount.lease.root) === mount) this.#mounts.delete(mount.lease.root);
    const failure = new CleanupFailure();
    failure.run(() => this.#retire(mount));
    let sharedOwner = false;
    for (const current of this.#mounts.values()) {
      if (current.lease.window === mount.lease.window) {
        sharedOwner = true;
        break;
      }
    }
    if (!sharedOwner) failure.run(() => releaseAIQAUI(mount.lease.window));
    failure.rethrow();
  }
}
