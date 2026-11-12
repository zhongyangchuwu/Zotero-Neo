import { CleanupFailure } from '../../core/cleanup';
import { compositionOwnsKey } from '../../input/composition';
import { isDeadObject } from '../../platform/cross-compartment';
import { mountNativeReactView } from '../../platform/native-ui';
import type { NativeReactView } from '../../ui/react/types';
import type { SelectionActionsReactCommand, SelectionActionsReactModel } from './react-model';
import type {
  ReaderSelectionActionDefinition,
  ReaderSelectionActionOutcome,
  ReaderSelectionContext,
} from '../../core/contracts';
import { SELECTION_ACTIONS_OVERLAY_STYLE } from '../../ui/react/shells/reader';
import type { PdfWindow } from '../../reader/types';

export interface ReaderSelectionActionHost {
  readonly isCurrent: (pdfWindow: PdfWindow) => boolean;
  readonly captureView: (pdfWindow: PdfWindow) => () => boolean;
  readonly capturePresentation: (pdfWindow: PdfWindow) => () => boolean;
  readonly actions: (
    context: ReaderSelectionContext,
    pdfWindow: PdfWindow,
    isCurrent: () => boolean,
  ) => readonly ReaderSelectionActionDefinition[];
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly copyText: (text: string) => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

type PaletteStage = 'menu' | 'busy' | 'result';

/**
 * Small Reader-local action surface for an existing Visual selection. It owns transient
 * menu/result DOM and keyboard state; the selection module owns selection semantics.
 */
export class ReaderSelectionActions {
  readonly #host: ReaderSelectionActionHost;
  #window: PdfWindow | null = null;
  #viewCurrent: (() => boolean) | null = null;
  #context: ReaderSelectionContext | null = null;
  #actions: readonly ReaderSelectionActionDefinition[] = [];
  #selected = 0;
  #overlay: HTMLElement | null = null;
  #view: NativeReactView<SelectionActionsReactModel> | null = null;
  #ready = false;
  #themeCleanup: (() => void) | null = null;
  #stage: PaletteStage = 'menu';
  #resultText = '';
  #resultTitle = '';
  #generation = 0;

  constructor(host: ReaderSelectionActionHost) {
    this.#host = host;
  }

  get isOpen(): boolean {
    return this.#overlay !== null;
  }

  ownsView(pdfWindow: PdfWindow): boolean {
    return this.#window === pdfWindow;
  }

  open(pdfWindow: PdfWindow, context: ReaderSelectionContext): boolean {
    const priorGeneration = this.#generation;
    this.close();
    if (this.#generation !== priorGeneration + 1) return false;
    const generation = this.#generation;
    const document = pdfWindow.document;
    const capturedView = this.#host.captureView(pdfWindow);
    const viewCurrent = () =>
      !isDeadObject(pdfWindow) &&
      pdfWindow.document === document &&
      this.#host.isCurrent(pdfWindow) &&
      capturedView();
    const isCurrent = () =>
      generation === this.#generation && viewCurrent() && generation === this.#generation;
    if (!isCurrent()) return false;
    const snapshot = Object.freeze({ ...context });
    const actions = this.#host.actions(snapshot, pdfWindow, isCurrent);
    if (!isCurrent()) return false;
    if (!actions.length) {
      this.#host.showStatus('No actions for selection', 1500);
      return false;
    }
    this.#window = pdfWindow;
    this.#viewCurrent = viewCurrent;
    this.#context = snapshot;
    this.#actions = actions;
    this.#selected = 0;
    this.#stage = 'menu';
    this.#resultText = '';
    try {
      this.#mount(pdfWindow, generation);
      if (!this.#canComplete(generation, pdfWindow)) return false;
      this.#render();
      return true;
    } catch (error) {
      const failure = new CleanupFailure();
      failure.run(() => {
        throw error;
      });
      if (generation === this.#generation) failure.run(() => this.close());
      failure.rethrow();
      return false;
    }
  }

  /** Ordinary outside-view input cancels and yields; IME input does not change the owner. */
  handleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
    if (!this.#overlay || !this.#window) return false;
    if (!this.#canComplete(this.#generation, this.#window)) return false;
    const viewCurrent = this.#viewCurrent!;
    if (compositionOwnsKey(event, false)) return this.ownsView(pdfWindow);
    if (pdfWindow !== this.#window) {
      this.close();
      return false;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.key === 'Escape') {
      const generation = this.#generation;
      this.close();
      if (
        this.#generation === generation + 1 &&
        this.#host.isCurrent(pdfWindow) &&
        viewCurrent() &&
        !isDeadObject(pdfWindow)
      )
        pdfWindow.focus();
      return true;
    }
    if (!this.#ready) return true;
    if (this.#stage === 'busy') return true;
    if (this.#stage === 'result') {
      if (event.key.toLowerCase() === 'y' && this.#resultText) {
        this.#host.copyText(this.#resultText);
      } else if (event.key === 'Enter' || event.key === 'Return') {
        const generation = this.#generation;
        this.close();
        if (
          this.#generation === generation + 1 &&
          this.#host.isCurrent(pdfWindow) &&
          viewCurrent() &&
          !isDeadObject(pdfWindow)
        )
          pdfWindow.focus();
      }
      return true;
    }

    if (event.key === 'j' || event.key === 'ArrowDown') {
      this.#selected = (this.#selected + 1) % this.#actions.length;
      this.#render();
      return true;
    }
    if (event.key === 'k' || event.key === 'ArrowUp') {
      this.#selected = (this.#selected - 1 + this.#actions.length) % this.#actions.length;
      this.#render();
      return true;
    }
    if (event.key === 'Home' || event.key === 'g') {
      this.#selected = 0;
      this.#render();
      return true;
    }
    if (event.key === 'End' || event.key === 'G') {
      this.#selected = this.#actions.length - 1;
      this.#render();
      return true;
    }
    if (/^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      if (index < this.#actions.length) void this.#execute(index);
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Return') {
      void this.#execute(this.#selected);
      return true;
    }
    return true;
  }

  releaseView(pdfWindow: PdfWindow): void {
    if (this.#window === pdfWindow) this.close();
  }

  dispose(): void {
    this.close();
  }

  close(): void {
    this.#generation += 1;
    const overlay = this.#overlay;
    const themeCleanup = this.#themeCleanup;
    const view = this.#view;
    this.#overlay = null;
    this.#view = null;
    this.#ready = false;
    this.#themeCleanup = null;
    this.#window = null;
    this.#viewCurrent = null;
    this.#context = null;
    this.#actions = [];
    this.#selected = 0;
    this.#stage = 'menu';
    this.#resultText = '';
    this.#resultTitle = '';
    const failure = new CleanupFailure();
    failure.run(() => view?.dispose());
    failure.run(() => {
      if (overlay && !isDeadObject(overlay)) overlay.remove();
    });
    failure.run(() => themeCleanup?.());
    failure.rethrow();
  }

  async #execute(index: number): Promise<void> {
    const action = this.#actions[index];
    const context = this.#context;
    const pdfWindow = this.#window;
    if (!action || !context || !pdfWindow || !this.#overlay) return;
    const viewCurrent = this.#viewCurrent!;
    if (!this.#canComplete(this.#generation, pdfWindow)) return;
    const generation = ++this.#generation;
    const isPresentationCurrent = this.#host.capturePresentation(pdfWindow);
    if (!this.#canComplete(generation, pdfWindow, isPresentationCurrent)) return;
    this.#stage = 'busy';
    this.#selected = index;
    this.#render(`Running ${action.label}…`);
    if (!this.#canComplete(generation, pdfWindow, isPresentationCurrent)) return;
    try {
      const outcome = await action.run(context);
      if (!this.#canComplete(generation, pdfWindow, isPresentationCurrent)) return;
      if (outcome && typeof outcome === 'object' && 'retired' in outcome) {
        this.close();
        return;
      }
      if (outcome && typeof outcome === 'object' && 'status' in outcome) {
        this.close();
        if (
          this.#generation !== generation + 1 ||
          isDeadObject(pdfWindow) ||
          !this.#host.isCurrent(pdfWindow) ||
          !viewCurrent() ||
          !isPresentationCurrent()
        )
          return;
        this.#host.showStatus(outcome.status, 1500);
        if (
          this.#generation === generation + 1 &&
          !isDeadObject(pdfWindow) &&
          this.#host.isCurrent(pdfWindow) &&
          viewCurrent() &&
          isPresentationCurrent()
        )
          pdfWindow.focus();
        return;
      }
      if (outcome && typeof outcome === 'object' && 'body' in outcome && outcome.body) {
        this.#stage = 'result';
        this.#resultText = outcome.body;
        this.#resultTitle = outcome.title || 'RESULT';
        this.#renderResult(outcome);
        return;
      }
      this.close();
      if (
        this.#generation === generation + 1 &&
        !isDeadObject(pdfWindow) &&
        this.#host.isCurrent(pdfWindow) &&
        viewCurrent() &&
        isPresentationCurrent()
      )
        pdfWindow.focus();
    } catch (error) {
      if (!this.#canComplete(generation, pdfWindow, isPresentationCurrent)) return;
      this.#host.debug(`selection action ${action.id} failed: ${String(error)}`);
      if (!this.#canComplete(generation, pdfWindow, isPresentationCurrent)) return;
      this.close();
      if (
        this.#generation !== generation + 1 ||
        isDeadObject(pdfWindow) ||
        !this.#host.isCurrent(pdfWindow) ||
        !viewCurrent() ||
        !isPresentationCurrent()
      )
        return;
      this.#host.showStatus(`✗ ${action.label} failed`, 2500);
      if (
        this.#generation === generation + 1 &&
        !isDeadObject(pdfWindow) &&
        this.#host.isCurrent(pdfWindow) &&
        viewCurrent() &&
        isPresentationCurrent()
      )
        pdfWindow.focus();
    }
  }

  /** Retires dead content before an async result can touch it, even before view discovery. */
  #canComplete(generation: number, pdfWindow: PdfWindow, presentation?: () => boolean): boolean {
    if (generation !== this.#generation || this.#window !== pdfWindow || !this.#overlay)
      return false;
    const current =
      !isDeadObject(pdfWindow) &&
      !isDeadObject(this.#overlay) &&
      !!this.#viewCurrent?.() &&
      (!presentation || presentation());
    if (generation !== this.#generation || this.#window !== pdfWindow || !this.#overlay)
      return false;
    if (!current) {
      this.close();
      return false;
    }
    return true;
  }

  #mount(pdfWindow: PdfWindow, generation: number): void {
    const document = pdfWindow.document;
    const overlay = document.createElement('div');
    this.#overlay = overlay;
    overlay.id = 'zv-selection-actions';
    overlay.dataset.zoteroNeoSelectionActions = '1';
    overlay.style.cssText = SELECTION_ACTIONS_OVERLAY_STYLE;
    document.body?.appendChild(overlay);
    if (!this.#canComplete(generation, pdfWindow)) return;
    const cleanup = this.#host.themeRoot(overlay);
    if (generation !== this.#generation || this.#overlay !== overlay) {
      cleanup();
      return;
    }
    this.#themeCleanup = cleanup;
    this.#view = mountNativeReactView<SelectionActionsReactModel, SelectionActionsReactCommand>({
      surface: 'selection-actions',
      root: overlay,
      model: this.#model(),
      dispatch: () => {},
      isCurrent: () =>
        this.#window === pdfWindow &&
        this.#overlay === overlay &&
        pdfWindow.document === document &&
        !!this.#viewCurrent?.(),
      loadingText: 'Loading selection actions…',
      errorText: 'Selection actions unavailable.',
      onError: (error) => {
        this.#host.debug(`Selection actions view failed: ${String(error)}`);
        if (this.#overlay === overlay) this.close();
      },
    });
    const view = this.#view;
    void view.ready
      .then(() => {
        if (this.#view === view && this.#canComplete(this.#generation, pdfWindow))
          this.#ready = true;
      })
      .catch(() => {});
  }

  #model(message = ''): SelectionActionsReactModel {
    const compact = (this.#context?.text ?? '').replace(/\s+/g, ' ').trim();
    return {
      stage: this.#stage,
      preview: compact.length > 120 ? `${compact.slice(0, 117)}…` : compact,
      actions: this.#actions.map((action) => action.label),
      selected: this.#selected,
      message,
      resultTitle: this.#resultTitle,
      resultText: this.#resultText,
    };
  }

  #render(message?: string): void {
    this.#view?.update(this.#model(message));
  }

  #renderResult(_outcome: Extract<ReaderSelectionActionOutcome, { body: string }>): void {
    this.#render();
  }
}
