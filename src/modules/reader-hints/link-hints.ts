import { CleanupFailure } from '../../core/cleanup';
import { reportDiagnosticError } from '../../core/logging';
import {
  readerPositionClientRect,
  openReaderExternalLink,
  prepareReaderLinkLocation,
  navigateReaderLink,
  type ReaderNativeNavigation,
} from '../../toolkit/reader';
import { isDeadObject } from '../../platform/cross-compartment';
import { ReaderTargetHints } from './target-hints';
import {
  identifierHintTargets,
  identifierOpenURL,
  type IdentifierTarget,
} from './identifier-targets';
import type {
  NavigationExecution,
  NavigationIntent,
  NavigationResult,
} from '../../navigation/types';
import type {
  PdfWindow,
  ReaderLinkPosition,
  ReaderRuntime,
  ReaderTimer,
  ReaderViewRuntime,
} from '../../reader/types';

export interface ReaderLinkHintsHost {
  readonly reader: ReaderRuntime;
  viewForWindow(pdfWindow: PdfWindow): ReaderViewRuntime | null;
  showStatus(message: string, duration?: number): void;
  text(key: string): string;
  debug(message: string): void;
  diagnostic(message: string): void;
  readonly executeNavigation: (
    pdfWindow: PdfWindow,
    intent: NavigationIntent,
    perform: (navigation: ReaderNativeNavigation) => unknown,
  ) => NavigationExecution | null;
  isCurrent(): boolean;
}

export class ReaderLinkHints {
  readonly #host: ReaderLinkHintsHost;
  readonly #hints: ReaderTargetHints<IdentifierTarget>;
  #hintView: ReaderViewRuntime | null = null;
  #activation = 0;
  #activationWindow: PdfWindow | null = null;
  #destinationCue: HTMLElement | null = null;
  #destinationPosition: ReaderLinkPosition | null = null;
  #destinationWindow: PdfWindow | null = null;
  #destinationTimer: ReaderTimer | null = null;
  #destinationRepositionFrame: number | null = null;

  constructor(host: ReaderLinkHintsHost) {
    this.#host = host;
    this.#hints = new ReaderTargetHints({
      attribute: 'zoteroNeoLinkHint',
      isCurrent: (window) =>
        host.isCurrent() &&
        this.#hintView !== null &&
        host.viewForWindow(window) === this.#hintView,
      choose: (window, overlay) => this.follow(window, overlay),
      closed: () => {
        this.#hintView = null;
      },
    });
  }

  get hasHints(): boolean {
    return this.#host.isCurrent() && this.#hints.isOpen;
  }

  ownsView(pdfWindow: PdfWindow): boolean {
    return this.#host.isCurrent() && this.#hints.ownsView(pdfWindow);
  }

  open(pdfWindow: PdfWindow): void {
    this.cancelHints();
    if (!this.#host.isCurrent()) return;
    try {
      const view = this.#host.viewForWindow(pdfWindow);
      if (!view || !this.#host.isCurrent()) throw new Error('active PDF view not found');
      this.#hintView = view;
      const targets = identifierHintTargets(view, pdfWindow, 'follow');
      if (!this.#host.isCurrent()) return;
      this.#hints.open(pdfWindow, targets, this.#host.text('reader.hints.followPrompt'));
    } catch (error) {
      const active = this.#host.isCurrent();
      const failure = new CleanupFailure();
      failure.run(() => this.cancelHints());
      if (active) reportDiagnosticError(this.#host, 'reader follow link discovery failed', error);
      failure.run(() => {
        if (this.#host.isCurrent() && this.#hintView === null)
          this.#host.showStatus('Link hints unavailable', 1500);
      });
      try {
        failure.rethrow();
      } catch (cleanupError) {
        reportDiagnosticError(this.#host, 'reader follow link recovery failed', cleanupError);
        throw cleanupError;
      }
      return;
    }
    if (!this.hasHints && this.#host.isCurrent()) this.#host.showStatus('No visible links', 1500);
  }

  handleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
    return this.#hints.handleKey(event, pdfWindow);
  }

  onViewportChange(pdfWindow: PdfWindow): void {
    if (isDeadObject(pdfWindow)) return;
    if (!this.#host.isCurrent()) {
      this.close();
      return;
    }
    this.#hints.onViewportChange(pdfWindow);
    if (this.#host.isCurrent() && this.#destinationWindow === pdfWindow)
      this.#repositionDestinationCue(pdfWindow);
  }

  releaseView(pdfWindow: PdfWindow): void {
    if (this.#activationWindow === pdfWindow) {
      this.#activation += 1;
      this.#activationWindow = null;
    }
    const failure = new CleanupFailure();
    if (this.#hints.ownsView(pdfWindow)) failure.run(() => this.cancelHints());
    if (this.#destinationWindow === pdfWindow) failure.run(() => this.#clearDestinationCue());
    failure.rethrow();
  }

  /** Retires native activation before releasing the shared label interaction. */
  cancelHints(): void {
    this.#activation += 1;
    this.#activationWindow = null;
    this.#hintView = null;
    this.#hints.cancel();
  }

  close(): void {
    if (!this.#hintView && !this.#activationWindow && !this.#destinationWindow) return;

    const failure = new CleanupFailure();
    failure.run(() => this.cancelHints());
    failure.run(() => this.#clearDestinationCue());
    failure.rethrow();
  }

  /** Preserves native destinations; only bare identifiers construct resolver URLs. */
  follow(pdfWindow: PdfWindow, target: IdentifierTarget): void {
    if (!this.#host.isCurrent()) return;
    this.cancelHints();
    this.#clearDestinationCue();
    if (!this.#host.isCurrent()) return;
    const invocation = ++this.#activation;
    this.#activationWindow = pdfWindow;
    try {
      const view = this.#host.viewForWindow(pdfWindow);
      if (!view || !this.#activationIsCurrent(invocation))
        throw new Error('active PDF view not found');
      if (target.kind === 'text') {
        this.#followExternal(pdfWindow, view, identifierOpenURL(target.match), invocation);
        return;
      }
      const overlay = target.overlay;
      if (overlay.type === 'external-link') {
        this.#followExternal(pdfWindow, view, overlay.url, invocation);
        return;
      }
      const position =
        overlay.type === 'internal-link'
          ? overlay.destinationPosition
          : overlay.references[0]!.position;
      const location = prepareReaderLinkLocation(this.#host.reader, position);
      if (!this.#activationIsCurrent(invocation)) return;
      const execution = this.#host.executeNavigation(
        pdfWindow,
        this.#intent('internal-link', invocation),
        (navigation) => {
          navigation.bindRequest(location);
          return navigation.runNative(() => navigateReaderLink(view, location));
        },
      );
      if (!execution) throw new Error('reader navigation unavailable');
      if (!this.#activationIsCurrent(invocation)) return;
      this.#showDestinationCue(pdfWindow, location.position, invocation);
      if (!this.#activationIsCurrent(invocation)) return;
      this.#observeActivation(execution, invocation);
    } catch (error) {
      this.#reportActivationFailure(error, invocation);
    }
  }

  #followExternal(
    window: PdfWindow,
    view: ReaderViewRuntime,
    url: string,
    invocation: number,
  ): void {
    if (!this.#activationIsCurrent(invocation)) return;
    const execution = this.#host.executeNavigation(
      window,
      this.#intent('external-link', invocation),
      (navigation) => navigation.runNative(() => openReaderExternalLink(view, url)),
    );
    if (!execution) throw new Error('reader navigation unavailable');
    if (this.#activationIsCurrent(invocation)) this.#observeActivation(execution, invocation);
  }

  #intent(path: 'internal-link' | 'external-link', invocation: number): NavigationIntent {
    return {
      cause: { kind: 'action', action: 'followLink' },
      surface: 'reader',
      context: {
        readerPath: path,
        isCurrent: () => this.#activationIsCurrent(invocation),
      },
    };
  }

  #observeActivation(execution: NavigationExecution, invocation: number): void {
    if (!this.#activationIsCurrent(invocation)) return;
    const complete = (result: NavigationResult): void => {
      if (!this.#activationIsCurrent(invocation)) return;
      if (result.kind === 'failed') this.#reportActivationFailure(result.error, invocation);
    };
    if (execution.pending) {
      void execution.result.then(complete, (error: unknown) =>
        this.#reportActivationFailure(error, invocation),
      );
    } else {
      complete(execution.result);
    }
  }

  #activationIsCurrent(invocation: number): boolean {
    return (
      this.#host.isCurrent() &&
      invocation === this.#activation &&
      this.#activationWindow !== null &&
      !isDeadObject(this.#activationWindow)
    );
  }

  /** Never rejects a detached completion observer; diagnoses the cause and recovery separately. */
  #reportActivationFailure(error: unknown, invocation: number): void {
    if (!this.#activationIsCurrent(invocation)) return;
    const failure = new CleanupFailure();
    failure.run(() => this.#clearDestinationCue());
    reportDiagnosticError(this.#host, 'reader follow link activation failed', error);
    failure.run(() => {
      if (this.#activationIsCurrent(invocation)) this.#host.showStatus('Link unavailable', 1500);
    });
    try {
      failure.rethrow();
    } catch (cleanupError) {
      reportDiagnosticError(this.#host, 'reader follow link recovery failed', cleanupError);
    }
  }

  #showDestinationCue(
    pdfWindow: PdfWindow,
    position: ReaderLinkPosition,
    invocation: number,
  ): void {
    if (!this.#activationIsCurrent(invocation)) return;
    this.#clearDestinationCue();
    if (!this.#activationIsCurrent(invocation)) return;
    let createdCue: HTMLElement | null = null;
    try {
      const cue = pdfWindow.document.createElement('div');
      createdCue = cue;
      if (!this.#activationIsCurrent(invocation)) return;
      cue.dataset.zoteroNeoDestinationCue = '1';
      cue.hidden = true;
      cue.style.cssText =
        'position:fixed;z-index:99998;background:#f57b7b;mix-blend-mode:multiply;pointer-events:none;';
      const body = pdfWindow.document.body;
      if (!this.#activationIsCurrent(invocation)) return;
      this.#destinationCue = cue;
      this.#destinationPosition = position;
      this.#destinationWindow = pdfWindow;
      body?.appendChild(cue);
      if (
        !this.#host.isCurrent() ||
        this.#destinationCue !== cue ||
        this.#destinationWindow !== pdfWindow
      ) {
        const failure = new CleanupFailure();
        if (this.#destinationCue === cue) failure.run(() => this.#clearDestinationCue());
        if (!isDeadObject(cue)) failure.run(() => cue.remove());
        failure.rethrow();
        return;
      }
      this.#destinationTimer = setTimeout(() => {
        if (this.#destinationCue === cue) this.#clearDestinationCue();
      }, 2000);
      if (
        !this.#host.isCurrent() ||
        this.#destinationCue !== cue ||
        this.#destinationWindow !== pdfWindow
      ) {
        const failure = new CleanupFailure();
        if (this.#destinationCue === cue) failure.run(() => this.#clearDestinationCue());
        if (!isDeadObject(cue)) failure.run(() => cue.remove());
        failure.rethrow();
        return;
      }
      this.#repositionDestinationCue(pdfWindow);
    } catch (error) {
      const cue = createdCue;
      const active = this.#host.isCurrent() && (cue === null || this.#destinationCue === cue);
      if (!active) throw error;
      const failure = new CleanupFailure();
      if (cue !== null && this.#destinationCue === cue)
        failure.run(() => this.#clearDestinationCue());
      if (cue !== null && !isDeadObject(cue)) failure.run(() => cue.remove());
      failure.run(() => this.#reportDestinationCueFailure(error));
      failure.rethrow();
    }
  }

  #refreshDestinationCue(pdfWindow: PdfWindow): void {
    const cue = this.#destinationCue;
    const position = this.#destinationPosition;
    if (!cue || !position || this.#destinationWindow !== pdfWindow) return;
    if (!this.#host.isCurrent()) {
      this.#clearDestinationCue();
      return;
    }
    try {
      const view = this.#host.viewForWindow(pdfWindow);
      if (!view) throw new Error('destination rectangle conversion unavailable');
      const rect = readerPositionClientRect(view, position);
      if (!this.#host.isCurrent() || this.#destinationCue !== cue) return;
      if (!rect) throw new Error('invalid destination rectangle');
      this.#positionDestinationCue(pdfWindow, cue, rect);
    } catch (error) {
      const active = this.#host.isCurrent() && this.#destinationCue === cue;
      if (active) this.#reportDestinationCueFailure(error);
      if (this.#destinationCue === cue) {
        try {
          this.#clearDestinationCue();
        } catch (cleanupError) {
          reportDiagnosticError(this.#host, 'reader destination cue cleanup failed', cleanupError);
          throw cleanupError;
        }
      }
    }
  }

  #repositionDestinationCue(pdfWindow: PdfWindow): void {
    const cue = this.#destinationCue;
    if (!cue || this.#destinationWindow !== pdfWindow) return;
    if (!this.#host.isCurrent()) {
      this.#clearDestinationCue();
      return;
    }
    if (this.#destinationRepositionFrame !== null) return;
    const frame = pdfWindow.requestAnimationFrame(() => {
      if (this.#destinationCue !== cue || this.#destinationWindow !== pdfWindow) return;
      if (isDeadObject(pdfWindow) || isDeadObject(cue) || !this.#host.isCurrent()) {
        this.#clearDestinationCue();
        return;
      }
      this.#destinationRepositionFrame = null;
      this.#refreshDestinationCue(pdfWindow);
    });
    if (
      !this.#host.isCurrent() ||
      this.#destinationCue !== cue ||
      this.#destinationWindow !== pdfWindow
    ) {
      const failure = new CleanupFailure();
      if (this.#destinationCue === cue && this.#destinationWindow === pdfWindow) {
        this.#destinationRepositionFrame = frame;
        failure.run(() => this.#clearDestinationCue());
      } else if (!isDeadObject(pdfWindow)) {
        failure.run(() => pdfWindow.cancelAnimationFrame(frame));
      }
      failure.rethrow();
      return;
    }
    this.#destinationRepositionFrame = frame;
  }

  #clearDestinationCue(): void {
    const cue = this.#destinationCue;
    const owner = this.#destinationWindow;
    const frame = this.#destinationRepositionFrame;
    const timer = this.#destinationTimer;
    this.#destinationCue = null;
    this.#destinationPosition = null;
    this.#destinationTimer = null;
    this.#destinationWindow = null;
    this.#destinationRepositionFrame = null;
    const failure = new CleanupFailure();
    failure.run(() => clearTimeout(timer ?? undefined));
    if (owner && !isDeadObject(owner) && frame !== null)
      failure.run(() => owner.cancelAnimationFrame(frame));
    if (cue && !isDeadObject(cue)) failure.run(() => cue.remove());
    failure.rethrow();
  }

  #reportDestinationCueFailure(error: unknown): void {
    if (!this.#host.isCurrent()) return;
    reportDiagnosticError(this.#host, 'reader destination cue failed', error);
  }

  #positionDestinationCue(pdfWindow: PdfWindow, cue: HTMLElement, rect: readonly number[]): void {
    if (
      !this.#host.isCurrent() ||
      this.#destinationCue !== cue ||
      this.#destinationWindow !== pdfWindow
    )
      return;
    const viewportWidth = pdfWindow.innerWidth || pdfWindow.document.documentElement.clientWidth;
    const viewportHeight = pdfWindow.innerHeight || pdfWindow.document.documentElement.clientHeight;
    if (
      !this.#host.isCurrent() ||
      this.#destinationCue !== cue ||
      this.#destinationWindow !== pdfWindow
    )
      return;
    const width = rect[2]! - rect[0]!;
    const height = rect[3]! - rect[1]!;
    const isPoint = width < 5 || height < 5;
    cue.hidden =
      rect[2]! < 0 || rect[3]! < 0 || rect[0]! > viewportWidth || rect[1]! > viewportHeight;
    if (isPoint) {
      const radius = 7;
      const centerX = Math.min(
        Math.max((rect[0]! + rect[2]!) / 2, radius),
        Math.max(radius, viewportWidth - radius),
      );
      const centerY = Math.min(
        Math.max((rect[1]! + rect[3]!) / 2, radius),
        Math.max(radius, viewportHeight - radius),
      );
      cue.style.left = `${centerX - radius}px`;
      cue.style.top = `${centerY - radius}px`;
      cue.style.width = `${radius * 2}px`;
      cue.style.height = `${radius * 2}px`;
      cue.style.borderRadius = '50%';
      return;
    }
    cue.style.left = `${rect[0]}px`;
    cue.style.top = `${rect[1]}px`;
    cue.style.width = `${width}px`;
    cue.style.height = `${height}px`;
    cue.style.borderRadius = '0';
  }
}
