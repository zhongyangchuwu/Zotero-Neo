import { isDeadObject } from '../platform/cross-compartment';
import { openReaderExternalLink } from '../toolkit/reader';
import type { NavigationResult } from '../navigation/types';
import type { ReaderNavigationCommand } from './navigation';
import {
  identifierCopyValue,
  identifierHintTargets,
  identifierOpenURL,
  type IdentifierTarget,
} from './identifier-targets';
import { ReaderTargetHints } from './target-hints';
import type { PdfWindow, ReaderLinkOverlay, ReaderViewRuntime } from './types';

interface IdentifierHintsHost {
  readonly viewForWindow: (window: PdfWindow) => ReaderViewRuntime | null;
  readonly copyText: (text: string) => void;
  readonly followNative: (window: PdfWindow, overlay: ReaderLinkOverlay) => void;
  readonly executeNavigation: ReaderNavigationCommand;
  readonly text: (key: string) => string;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

/** Owns action consequences and exact-view invocation lifetime, never recognition or PDF DOM seams. */
export class ReaderIdentifierHints {
  readonly #host: IdentifierHintsHost;
  readonly #hints: ReaderTargetHints<IdentifierTarget>;
  #window: PdfWindow | null = null;
  #view: ReaderViewRuntime | null = null;
  #intent: 'copy' | 'follow' = 'copy';
  #generation = 0;

  constructor(host: IdentifierHintsHost) {
    this.#host = host;
    this.#hints = new ReaderTargetHints({
      attribute: 'zoteroNeoIdentifierHint',
      isCurrent: (window) => this.#isCurrent(window),
      choose: (window, target) => this.#activate(window, target),
      failed: (error) => this.#reportFailure(error),
    });
  }

  get hasHints(): boolean {
    return this.#hints.isOpen;
  }

  ownsView(window: PdfWindow): boolean {
    return this.#window === window;
  }

  open(window: PdfWindow, intent: 'copy' | 'follow'): void {
    this.close();
    try {
      const view = this.#host.viewForWindow(window);
      if (!view) throw new Error('active PDF view not found');
      this.#window = window;
      this.#view = view;
      this.#intent = intent;
      this.#hints.open(window, identifierHintTargets(view, window, intent));
      if (!this.hasHints) {
        this.close();
        this.#host.showStatus(this.#host.text('reader.identifiers.empty'), 1500);
      }
    } catch (error) {
      this.close();
      this.#host.debug(`reader identifier discovery failed: ${String(error)}`);
      this.#host.showStatus(this.#host.text('reader.identifiers.unavailable'), 1500);
    }
  }

  handleKey(event: KeyboardEvent, window: PdfWindow): boolean {
    return this.#hints.handleKey(event, window);
  }

  onViewportChange(window: PdfWindow): void {
    this.#hints.onViewportChange(window);
  }

  releaseView(window: PdfWindow): void {
    if (this.#window === window) this.close();
  }

  close(): void {
    this.#generation += 1;
    this.#window = null;
    this.#view = null;
    this.#hints.cancel();
  }

  #isCurrent(window: PdfWindow): boolean {
    return (
      this.#window === window &&
      !isDeadObject(window) &&
      this.#view !== null &&
      !isDeadObject(this.#view) &&
      this.#host.viewForWindow(window) === this.#view
    );
  }

  #activate(window: PdfWindow, target: IdentifierTarget): void {
    if (!this.#isCurrent(window)) return;
    const view = this.#view!;
    const intent = this.#intent;
    this.close();
    if (intent === 'copy') {
      const text = identifierCopyValue(target);
      if (text) this.#host.copyText(text);
      return;
    }
    this.#window = window;
    this.#view = view;
    if (target.kind === 'native') {
      this.#host.followNative(window, target.overlay);
      return;
    }
    const generation = this.#generation;
    const isCurrent = (): boolean => this.#generation === generation && this.#isCurrent(window);
    try {
      const execution = this.#host.executeNavigation(
        window,
        {
          cause: { kind: 'action', action: 'followIdentifier' },
          surface: 'reader',
          context: { readerPath: 'external-link', isCurrent },
        },
        (navigation) =>
          navigation.runNative(() => openReaderExternalLink(view, identifierOpenURL(target.match))),
      );
      if (!execution) throw new Error('reader navigation unavailable');
      const complete = (result: NavigationResult): void => {
        if (isCurrent() && result.kind === 'failed') this.#reportFailure(result.error);
      };
      if (execution.pending) {
        void execution.result.then(complete, (error: unknown) => {
          if (isCurrent()) this.#reportFailure(error);
        });
      } else complete(execution.result);
    } catch (error) {
      if (isCurrent()) this.#reportFailure(error);
    }
  }

  #reportFailure(error: unknown): void {
    this.#host.debug(`reader identifier activation failed: ${String(error)}`);
    this.#host.showStatus(this.#host.text('reader.identifiers.failed'), 1500);
  }
}
