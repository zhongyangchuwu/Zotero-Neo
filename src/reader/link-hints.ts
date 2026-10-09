import { compositionOwnsKey } from '../input/composition';
import { cloneInto, isDeadObject } from '../platform/cross-compartment';
import { asElement, isEditableElement } from '../platform/dom';
import { hintLabels } from './hint-labels';
import type { NavigationExecution, NavigationIntent, NavigationResult } from '../navigation/types';
import type { ReaderNavigationCommand } from './navigation';
import type {
  PdfWindow,
  ReaderLinkOverlay,
  ReaderLinkPosition,
  ReaderRuntime,
  ReaderTimer,
  ReaderViewRuntime,
} from './types';

interface LinkHintBadge {
  readonly element: HTMLElement;
  readonly label: string;
  readonly overlay: ReaderLinkOverlay;
}

export interface ReaderLinkHintsHost {
  readonly reader: ReaderRuntime;
  viewForWindow(pdfWindow: PdfWindow): ReaderViewRuntime | null;
  showStatus(message: string, duration?: number): void;
  debug(message: string): void;
  diagnostic(message: string): void;
  readonly executeNavigation: ReaderNavigationCommand;
}

export class ReaderLinkHints {
  readonly #host: ReaderLinkHintsHost;
  #badges: LinkHintBadge[] = [];
  #buffer = '';
  #window: PdfWindow | null = null;
  #repositionFrame: number | null = null;
  #activation = 0;
  #activationWindow: PdfWindow | null = null;
  #destinationCue: HTMLElement | null = null;
  #destinationPosition: ReaderLinkPosition | null = null;
  #destinationWindow: PdfWindow | null = null;
  #destinationTimer: ReaderTimer | null = null;
  #destinationRepositionFrame: number | null = null;

  constructor(host: ReaderLinkHintsHost) {
    this.#host = host;
  }

  get hasHints(): boolean {
    return this.#badges.length > 0;
  }

  ownsView(pdfWindow: PdfWindow): boolean {
    return this.#window === pdfWindow;
  }

  open(pdfWindow: PdfWindow): void {
    this.cancelHints();
    this.#window = pdfWindow;
    try {
      const view = this.#host.viewForWindow(pdfWindow);
      if (!view) throw new Error('active PDF view not found');
      const pages = view._pdfPages;
      if (!pages || typeof pages !== 'object')
        throw new Error(`PDF page map unavailable (${typeof pages})`);
      if (typeof view.getClientRectForPopup !== 'function')
        throw new Error('PDF client-rectangle conversion unavailable');
      const seen = new Set<string>();
      const targets: {
        readonly overlay: ReaderLinkOverlay;
        readonly rect: readonly number[];
      }[] = [];
      for (const page of Object.values(pages)) {
        if (!Array.isArray(page?.overlays)) continue;
        for (const value of page.overlays) {
          if (!this.#isReaderLinkOverlay(value)) continue;
          const rect = this.#linkClientRect(view, value);
          if (!rect || !this.#linkRectIsVisible(pdfWindow, rect)) continue;
          const key = this.#linkSourceKey(value);
          if (seen.has(key)) continue;
          seen.add(key);
          targets.push({ overlay: value, rect });
        }
      }
      const labels = hintLabels(targets.length);
      targets.forEach(({ overlay, rect }, index) => {
        const badge = pdfWindow.document.createElement('span');
        badge.dataset.zoteroNeoLinkHint = '1';
        badge.textContent = labels[index] ?? '';
        badge.style.cssText =
          'position:fixed;z-index:99999;background:#f9e2af;color:#1e1e2e;padding:1px 3px;border:1px solid #1e1e2e;border-radius:2px;font:bold 10px monospace;line-height:1.2;pointer-events:none;';
        this.#positionLinkHint(badge, rect);
        pdfWindow.document.body?.appendChild(badge);
        this.#badges.push({ element: badge, label: labels[index] ?? '', overlay });
      });
    } catch (error) {
      this.cancelHints();
      const message = `reader follow link discovery failed: ${String(error)}`;
      this.#host.debug(message);
      this.#host.diagnostic(message);
      this.#host.showStatus('Link hints unavailable', 1500);
      return;
    }
    if (!this.#badges.length) {
      this.cancelHints();
      this.#host.showStatus('No visible links', 1500);
    }
  }

  handleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
    if (
      !this.ownsView(pdfWindow) ||
      isDeadObject(pdfWindow) ||
      isEditableElement(asElement(event.target))
    ) {
      this.cancelHints();
      return false;
    }
    if (compositionOwnsKey(event, false)) return true;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      this.cancelHints();
      pdfWindow.focus();
      return true;
    }
    if (event.key === 'Backspace') {
      this.#buffer = this.#buffer.slice(0, -1);
      this.#refreshHints(pdfWindow);
      return true;
    }
    if (!/^[a-z]$/i.test(event.key)) return true;
    const next = `${this.#buffer}${event.key.toUpperCase()}`;
    const matches = this.#badges.filter(
      (badge) => !badge.element.hidden && badge.label.startsWith(next),
    );
    if (!matches.length) {
      this.#buffer = '';
      this.#refreshHints(pdfWindow);
      return true;
    }
    this.#buffer = next;
    this.#refreshHints(pdfWindow);
    const visibleMatches = matches.filter((badge) => !badge.element.hidden);
    const exact = visibleMatches.find((badge) => badge.label === next);
    if (exact || visibleMatches.length === 1)
      this.#activate(pdfWindow, exact ?? visibleMatches[0]!);
    return true;
  }

  onViewportChange(pdfWindow: PdfWindow): void {
    if (isDeadObject(pdfWindow)) return;
    if (this.#window === pdfWindow) this.#repositionHints(pdfWindow);
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

  /** Retires the invocation before releasing DOM/RAF resources; live failures remain observable. */
  cancelHints(): void {
    const badges = this.#badges;
    const owner = this.#window;
    const frame = this.#repositionFrame;
    this.#activation += 1;
    this.#activationWindow = null;
    this.#badges = [];
    this.#buffer = '';
    this.#repositionFrame = null;
    this.#window = null;
    try {
      if (owner && !isDeadObject(owner) && frame !== null) owner.cancelAnimationFrame(frame);
    } finally {
      for (const badge of badges) {
        if (!isDeadObject(badge.element)) badge.element.remove();
      }
    }
  }

  close(): void {
    if (!this.#window && !this.#activationWindow && !this.#destinationWindow) return;
    try {
      this.cancelHints();
    } finally {
      this.#clearDestinationCue();
    }
  }

  #activate(pdfWindow: PdfWindow, badge: { readonly overlay: ReaderLinkOverlay }): void {
    const overlay = badge.overlay;
    this.cancelHints();
    this.#clearDestinationCue();
    const invocation = ++this.#activation;
    this.#activationWindow = pdfWindow;
    try {
      const view = this.#host.viewForWindow(pdfWindow);
      if (overlay.type === 'external-link') {
        if (typeof view?._onOpenLink !== 'function') throw new Error('missing external open-link');
        const execution = this.#host.executeNavigation(
          pdfWindow,
          this.#intent('external-link', invocation),
          (navigation) => navigation.runNative(() => view._onOpenLink!(overlay.url)),
        );
        if (!execution) throw new Error('reader navigation unavailable');
        this.#observeActivation(execution, invocation);
        return;
      }

      if (typeof view?.navigate !== 'function') throw new Error('missing internal navigation');
      const readerWindow = this.#host.reader._iframeWindow;
      if (!readerWindow) throw new Error('reader window unavailable');
      const position =
        overlay.type === 'internal-link'
          ? overlay.destinationPosition
          : overlay.references[0]!.position;
      const location = cloneInto({ position }, readerWindow);
      const execution = this.#host.executeNavigation(
        pdfWindow,
        this.#intent('internal-link', invocation),
        (navigation) => {
          navigation.bindRequest(location);
          return navigation.runNative(() => view.navigate!(location));
        },
      );
      if (!execution) throw new Error('reader navigation unavailable');
      this.#showDestinationCue(pdfWindow, location.position);
      this.#observeActivation(execution, invocation);
    } catch (error) {
      this.#reportActivationFailure(error, invocation);
    }
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

  #refreshHints(pdfWindow: PdfWindow): void {
    try {
      const view = this.#host.viewForWindow(pdfWindow);
      if (!view || typeof view.getClientRectForPopup !== 'function') {
        this.cancelHints();
        return;
      }
      for (const badge of this.#badges) {
        const rect = this.#linkClientRect(view, badge.overlay);
        const visible = !!rect && this.#linkRectIsVisible(pdfWindow, rect);
        badge.element.hidden = !visible || !badge.label.startsWith(this.#buffer);
        if (rect) this.#positionLinkHint(badge.element, rect);
      }
    } catch {
      this.cancelHints();
    }
  }

  #repositionHints(pdfWindow: PdfWindow): void {
    if (this.#repositionFrame !== null) return;
    const badges = this.#badges;
    this.#repositionFrame = pdfWindow.requestAnimationFrame(() => {
      if (this.#badges !== badges || this.#window !== pdfWindow || isDeadObject(pdfWindow)) return;
      this.#repositionFrame = null;
      this.#refreshHints(pdfWindow);
    });
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
      if (!view || typeof view.getClientRectForPopup !== 'function')
        throw new Error('destination rectangle conversion unavailable');
      const rect = this.#positionClientRect(view, position);
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

  #isReaderLinkOverlay(value: unknown): value is ReaderLinkOverlay {
    if (!value || typeof value !== 'object') return false;
    const overlay = value as {
      readonly type?: unknown;
      readonly position?: unknown;
      readonly destinationPosition?: unknown;
      readonly url?: unknown;
    };
    if (!this.#isReaderLinkPosition(overlay.position)) return false;
    if (overlay.type === 'internal-link')
      return this.#isReaderLinkPosition(overlay.destinationPosition);
    if (overlay.type === 'citation') {
      const references = (overlay as { readonly references?: unknown }).references;
      if (!Array.isArray(references) || !references.length) return false;
      const first = references[0];
      return (
        !!first &&
        typeof first === 'object' &&
        this.#isReaderLinkPosition((first as { readonly position?: unknown }).position)
      );
    }
    return overlay.type === 'external-link' && typeof overlay.url === 'string' && !!overlay.url;
  }

  #isReaderLinkPosition(value: unknown): value is ReaderLinkPosition {
    if (!value || typeof value !== 'object') return false;
    const position = value as { readonly pageIndex?: unknown; readonly rects?: unknown };
    return (
      Number.isInteger(position.pageIndex) &&
      Array.isArray(position.rects) &&
      position.rects.length > 0 &&
      position.rects.every(
        (rect) => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite),
      )
    );
  }

  #positionClientRect(
    view: ReaderViewRuntime,
    position: ReaderLinkPosition,
  ): readonly number[] | null {
    const rect = view.getClientRectForPopup?.(position);
    return rect?.length === 4 && rect.every(Number.isFinite) ? rect : null;
  }

  #linkClientRect(view: ReaderViewRuntime, overlay: ReaderLinkOverlay): readonly number[] | null {
    const rect = this.#positionClientRect(view, overlay.position);
    return rect && rect[2]! > rect[0]! && rect[3]! > rect[1]! ? rect : null;
  }

  #linkRectIsVisible(pdfWindow: PdfWindow, rect: readonly number[]): boolean {
    const width = pdfWindow.innerWidth || pdfWindow.document.documentElement.clientWidth;
    const height = pdfWindow.innerHeight || pdfWindow.document.documentElement.clientHeight;
    return rect[2]! > 0 && rect[3]! > 0 && rect[0]! < width && rect[1]! < height;
  }

  #linkSourceKey(overlay: ReaderLinkOverlay): string {
    return `${overlay.position.pageIndex}:${overlay.position.rects
      .map((rect) => rect.map((value) => Math.round(value * 10)).join(','))
      .join(';')}`;
  }

  #positionLinkHint(element: HTMLElement, rect: readonly number[]): void {
    element.style.left = `${Math.max(0, rect[0]!)}px`;
    element.style.top = `${Math.max(0, rect[1]! - 14)}px`;
  }
}
