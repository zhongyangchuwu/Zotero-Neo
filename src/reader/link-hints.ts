import {
  readerPositionClientRect,
  openReaderExternalLink,
  prepareReaderLinkLocation,
  navigateReaderLink,
} from '../toolkit/reader';
import { isDeadObject } from '../platform/cross-compartment';
import { ReaderTargetHints } from './target-hints';
import {
  identifierHintTargets,
  identifierOpenURL,
  type IdentifierTarget,
} from './identifier-targets';
import type { NavigationExecution, NavigationIntent, NavigationResult } from '../navigation/types';
import type { ReaderNavigationCommand } from './navigation';
import type {
  PdfWindow,
  ReaderLinkPosition,
  ReaderRuntime,
  ReaderTimer,
  ReaderViewRuntime,
} from './types';

export interface ReaderLinkHintsHost {
  readonly reader: ReaderRuntime;
  viewForWindow(pdfWindow: PdfWindow): ReaderViewRuntime | null;
  showStatus(message: string, duration?: number): void;
  text(key: string): string;
  debug(message: string): void;
  diagnostic(message: string): void;
  readonly executeNavigation: ReaderNavigationCommand;
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
        this.#hintView !== null && host.viewForWindow(window) === this.#hintView,
      choose: (window, overlay) => this.follow(window, overlay),
      closed: () => {
        this.#hintView = null;
      },
    });
  }

  get hasHints(): boolean {
    return this.#hints.isOpen;
  }

  ownsView(pdfWindow: PdfWindow): boolean {
    return this.#hints.ownsView(pdfWindow);
  }

  open(pdfWindow: PdfWindow): void {
    this.cancelHints();
    try {
      const view = this.#host.viewForWindow(pdfWindow);
      if (!view) throw new Error('active PDF view not found');
      this.#hintView = view;
      this.#hints.open(
        pdfWindow,
        identifierHintTargets(view, pdfWindow, 'follow'),
        this.#host.text('reader.hints.followPrompt'),
      );
    } catch (error) {
      this.cancelHints();
      const message = `reader follow link discovery failed: ${String(error)}`;
      this.#host.debug(message);
      this.#host.diagnostic(message);
      this.#host.showStatus('Link hints unavailable', 1500);
      return;
    }
    if (!this.hasHints) this.#host.showStatus('No visible links', 1500);
  }

  handleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
    return this.#hints.handleKey(event, pdfWindow);
  }

  onViewportChange(pdfWindow: PdfWindow): void {
    if (isDeadObject(pdfWindow)) return;
    this.#hints.onViewportChange(pdfWindow);
    if (this.#destinationWindow === pdfWindow) this.#repositionDestinationCue(pdfWindow);
  }

  releaseView(pdfWindow: PdfWindow): void {
    if (this.#activationWindow === pdfWindow) {
      this.#activation += 1;
      this.#activationWindow = null;
    }
    try {
      if (this.ownsView(pdfWindow)) this.cancelHints();
    } finally {
      if (this.#destinationWindow === pdfWindow) this.#clearDestinationCue();
    }
  }

  /** Retires native activation before releasing the shared label interaction. */
  cancelHints(): void {
    this.#activation += 1;
    this.#activationWindow = null;
    this.#hintView = null;
    this.#hints.cancel();
  }

  close(): void {
    if (!this.hasHints && !this.#hintView && !this.#activationWindow && !this.#destinationWindow)
      return;
    try {
      this.cancelHints();
    } finally {
      this.#clearDestinationCue();
    }
  }

  /** Preserves native destinations; only bare identifiers construct resolver URLs. */
  follow(pdfWindow: PdfWindow, target: IdentifierTarget): void {
    this.cancelHints();
    this.#clearDestinationCue();
    const invocation = ++this.#activation;
    this.#activationWindow = pdfWindow;
    try {
      const view = this.#host.viewForWindow(pdfWindow);
      if (!view) throw new Error('active PDF view not found');
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
      const execution = this.#host.executeNavigation(
        pdfWindow,
        this.#intent('internal-link', invocation),
        (navigation) => {
          navigation.bindRequest(location);
          return navigation.runNative(() => navigateReaderLink(view, location));
        },
      );
      if (!execution) throw new Error('reader navigation unavailable');
      this.#showDestinationCue(pdfWindow, location.position);
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
    const execution = this.#host.executeNavigation(
      window,
      this.#intent('external-link', invocation),
      (navigation) => navigation.runNative(() => openReaderExternalLink(view, url)),
    );
    if (!execution) throw new Error('reader navigation unavailable');
    this.#observeActivation(execution, invocation);
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
    const complete = (result: NavigationResult): void => {
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
      invocation === this.#activation &&
      this.#activationWindow !== null &&
      !isDeadObject(this.#activationWindow)
    );
  }

  #reportActivationFailure(error: unknown, invocation: number): void {
    if (!this.#activationIsCurrent(invocation)) return;
    this.#clearDestinationCue();
    const message = `reader follow link activation failed: ${String(error)}`;
    this.#host.debug(message);
    this.#host.diagnostic(message);
    this.#host.showStatus('Link unavailable', 1500);
  }

  #showDestinationCue(pdfWindow: PdfWindow, position: ReaderLinkPosition): void {
    this.#clearDestinationCue();
    try {
      const cue = pdfWindow.document.createElement('div');
      cue.dataset.zoteroNeoDestinationCue = '1';
      cue.hidden = true;
      cue.style.cssText =
        'position:fixed;z-index:99998;background:#f57b7b;mix-blend-mode:multiply;pointer-events:none;';
      pdfWindow.document.body?.appendChild(cue);
      this.#destinationCue = cue;
      this.#destinationPosition = position;
      this.#destinationWindow = pdfWindow;
      this.#destinationTimer = setTimeout(() => {
        if (this.#destinationCue === cue) this.#clearDestinationCue();
      }, 2000);
      this.#repositionDestinationCue(pdfWindow);
    } catch (error) {
      this.#clearDestinationCue();
      this.#reportDestinationCueFailure(error);
    }
  }

  #refreshDestinationCue(pdfWindow: PdfWindow): void {
    const cue = this.#destinationCue;
    const position = this.#destinationPosition;
    if (!cue || !position || this.#destinationWindow !== pdfWindow) return;
    try {
      const view = this.#host.viewForWindow(pdfWindow);
      if (!view) throw new Error('destination rectangle conversion unavailable');
      const rect = readerPositionClientRect(view, position);
      if (!rect) throw new Error('invalid destination rectangle');
      this.#positionDestinationCue(pdfWindow, cue, rect);
    } catch (error) {
      this.#clearDestinationCue();
      this.#reportDestinationCueFailure(error);
    }
  }

  #repositionDestinationCue(pdfWindow: PdfWindow): void {
    if (
      !this.#destinationCue ||
      this.#destinationWindow !== pdfWindow ||
      this.#destinationRepositionFrame !== null
    )
      return;
    const cue = this.#destinationCue;
    this.#destinationRepositionFrame = pdfWindow.requestAnimationFrame(() => {
      if (
        this.#destinationCue !== cue ||
        this.#destinationWindow !== pdfWindow ||
        isDeadObject(pdfWindow) ||
        isDeadObject(cue)
      )
        return;
      this.#destinationRepositionFrame = null;
      this.#refreshDestinationCue(pdfWindow);
    });
  }

  #clearDestinationCue(): void {
    const cue = this.#destinationCue;
    const owner = this.#destinationWindow;
    const frame = this.#destinationRepositionFrame;
    this.#destinationCue = null;
    this.#destinationPosition = null;
    clearTimeout(this.#destinationTimer ?? undefined);
    this.#destinationTimer = null;
    this.#destinationWindow = null;
    this.#destinationRepositionFrame = null;
    try {
      if (owner && !isDeadObject(owner) && frame !== null) owner.cancelAnimationFrame(frame);
    } finally {
      if (cue && !isDeadObject(cue)) cue.remove();
    }
  }

  #reportDestinationCueFailure(error: unknown): void {
    const message = `reader destination cue failed: ${String(error)}`;
    this.#host.debug(message);
    this.#host.diagnostic(message);
  }

  #positionDestinationCue(pdfWindow: PdfWindow, cue: HTMLElement, rect: readonly number[]): void {
    const viewportWidth = pdfWindow.innerWidth || pdfWindow.document.documentElement.clientWidth;
    const viewportHeight = pdfWindow.innerHeight || pdfWindow.document.documentElement.clientHeight;
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
