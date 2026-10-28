import { CleanupFailure } from '../../core/cleanup';
import { compositionOwnsKey } from '../../input/composition';
import { isDeadObject } from '../../platform/cross-compartment';
import type {
  ReaderSelectionActionDefinition,
  ReaderSelectionActionOutcome,
  ReaderSelectionContext,
} from '../../core/contracts';
import { THEME_VARS } from '../../ui/theme';
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
  #themeCleanup: (() => void) | null = null;
  #stage: PaletteStage = 'menu';
  #resultText = '';
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
    const capturedView = this.#host.captureView(pdfWindow);
    const viewCurrent = () =>
      !isDeadObject(pdfWindow) && this.#host.isCurrent(pdfWindow) && capturedView();
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
    this.#overlay = null;
    this.#themeCleanup = null;
    this.#window = null;
    this.#viewCurrent = null;
    this.#context = null;
    this.#actions = [];
    this.#selected = 0;
    this.#stage = 'menu';
    this.#resultText = '';
    const failure = new CleanupFailure();
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
    const overlay = pdfWindow.document.createElement('div');
    this.#overlay = overlay;
    overlay.id = 'zv-selection-actions';
    overlay.dataset.zoteroNeoSelectionActions = '1';
    overlay.style.cssText = `position:fixed;right:16px;bottom:52px;z-index:100002;width:min(430px,calc(100vw - 32px));max-height:min(70vh,560px);overflow:auto;padding:10px;border:1px solid ${THEME_VARS.border};border-radius:8px;background:${THEME_VARS.surface};color:${THEME_VARS.text};box-shadow:0 12px 36px ${THEME_VARS.shadow};font:12px/1.4 system-ui,sans-serif;pointer-events:none;`;
    pdfWindow.document.body?.appendChild(overlay);
    if (!this.#canComplete(generation, pdfWindow)) return;
    const cleanup = this.#host.themeRoot(overlay);
    if (generation !== this.#generation || this.#overlay !== overlay) cleanup();
    else this.#themeCleanup = cleanup;
  }

  #render(message?: string): void {
    const overlay = this.#overlay;
    const context = this.#context;
    if (!overlay || !context) return;
    overlay.replaceChildren();
    const title = overlay.ownerDocument.createElement('div');
    title.textContent = 'SELECT ACTIONS';
    title.style.cssText = `font-weight:700;letter-spacing:.06em;color:${THEME_VARS.accent};margin-bottom:6px;`;
    const preview = overlay.ownerDocument.createElement('div');
    const compact = context.text.replace(/\s+/g, ' ').trim();
    preview.textContent = compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
    preview.style.cssText = `padding:6px 8px;margin-bottom:8px;border-radius:5px;background:${THEME_VARS.elevated};color:${THEME_VARS.muted};white-space:normal;`;
    overlay.append(title, preview);
    if (message) {
      const status = overlay.ownerDocument.createElement('div');
      status.textContent = message;
      status.style.cssText = `padding:8px;color:${THEME_VARS.text};`;
      overlay.appendChild(status);
      return;
    }
    this.#actions.forEach((action, index) => {
      const row = overlay.ownerDocument.createElement('div');
      const key = index < 9 ? String(index + 1) : '·';
      row.textContent = `${key}  ${action.label}`;
      row.style.cssText = `padding:5px 8px;border-radius:4px;${
        index === this.#selected
          ? `background:${THEME_VARS.accent};color:${THEME_VARS.onAccent};font-weight:600;`
          : `color:${THEME_VARS.text};`
      }`;
      overlay.appendChild(row);
    });
    const help = overlay.ownerDocument.createElement('div');
    help.textContent = 'j/k move · 1–9 run · Enter run · Esc close';
    help.style.cssText = `margin-top:8px;color:${THEME_VARS.muted};`;
    overlay.appendChild(help);
  }

  #renderResult(outcome: Extract<ReaderSelectionActionOutcome, { body: string }>): void {
    const overlay = this.#overlay;
    if (!overlay) return;
    overlay.replaceChildren();
    const title = overlay.ownerDocument.createElement('div');
    title.textContent = outcome.title || 'RESULT';
    title.style.cssText = `font-weight:700;letter-spacing:.04em;color:${THEME_VARS.accent};margin-bottom:8px;`;
    const body = overlay.ownerDocument.createElement('div');
    body.textContent = outcome.body;
    body.style.cssText = `white-space:pre-wrap;user-select:text;-moz-user-select:text;padding:8px;border-radius:5px;background:${THEME_VARS.elevated};color:${THEME_VARS.text};`;
    const help = overlay.ownerDocument.createElement('div');
    help.textContent = 'y copy result · Enter/Esc close';
    help.style.cssText = `margin-top:8px;color:${THEME_VARS.muted};`;
    overlay.append(title, body, help);
  }
}
