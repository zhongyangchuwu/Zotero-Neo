import type {
  ReaderSelectionActionDefinition,
  ReaderSelectionActionOutcome,
  ReaderSelectionContext,
} from '../core/contracts';
import { THEME_VARS } from '../ui/theme';
import type { PdfWindow } from './types';

export interface ReaderSelectionActionHost {
  readonly actions: (
    context: ReaderSelectionContext,
    pdfWindow: PdfWindow,
  ) => readonly ReaderSelectionActionDefinition[];
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly copyText: (text: string) => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

/** Shared registry behind the public selection-action extension seam. */
export class ReaderSelectionActionRegistry {
  readonly #actions = new Map<string, ReaderSelectionActionDefinition>();

  register(action: ReaderSelectionActionDefinition): () => void {
    const id = action.id.trim();
    const label = action.label.trim();
    if (!id || !label || typeof action.run !== 'function')
      throw new Error('Selection action requires id, label, and run');
    if (this.#actions.has(id)) throw new Error(`Selection action already registered: ${id}`);
    const stored = { ...action, id, label };
    this.#actions.set(id, stored);
    return () => {
      if (this.#actions.get(id) === stored) this.#actions.delete(id);
    };
  }

  available(context: ReaderSelectionContext): ReaderSelectionActionDefinition[] {
    const result: ReaderSelectionActionDefinition[] = [];
    for (const action of this.#actions.values()) {
      try {
        if (action.isAvailable && !action.isAvailable(context)) continue;
        result.push(action);
      } catch {
        // A third-party availability predicate must not break the selection workflow.
      }
    }
    return result;
  }

  clear(): void {
    this.#actions.clear();
  }
}

type PaletteStage = 'menu' | 'busy' | 'result';

/**
 * Small Reader-local action surface for an existing Visual selection. It intentionally owns only
 * transient menu/result DOM and keyboard state; selection semantics remain in ReaderSession.
 */
export class ReaderSelectionActions {
  readonly #host: ReaderSelectionActionHost;
  #window: PdfWindow | null = null;
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
    this.close();
    const actions = this.#host.actions(context, pdfWindow);
    if (!actions.length) {
      this.#host.showStatus('No actions for selection', 1500);
      return false;
    }
    this.#window = pdfWindow;
    this.#context = context;
    this.#actions = actions;
    this.#selected = 0;
    this.#stage = 'menu';
    this.#resultText = '';
    this.#mount(pdfWindow);
    this.#render();
    return true;
  }

  /** Returns false after cancelling an invocation owned by another split view. */
  handleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
    if (!this.#overlay || !this.#window) return false;
    if (pdfWindow !== this.#window) {
      this.close();
      return false;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.key === 'Escape') {
      this.close();
      pdfWindow.focus();
      return true;
    }
    if (this.#stage === 'busy') return true;
    if (this.#stage === 'result') {
      if (event.key.toLowerCase() === 'y' && this.#resultText) {
        this.#host.copyText(this.#resultText);
      } else if (event.key === 'Enter' || event.key === 'Return') {
        this.close();
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
    this.#overlay?.remove();
    this.#overlay = null;
    this.#themeCleanup?.();
    this.#themeCleanup = null;
    this.#window = null;
    this.#context = null;
    this.#actions = [];
    this.#selected = 0;
    this.#stage = 'menu';
    this.#resultText = '';
  }

  async #execute(index: number): Promise<void> {
    const action = this.#actions[index];
    const context = this.#context;
    const pdfWindow = this.#window;
    if (!action || !context || !pdfWindow || !this.#overlay) return;
    const generation = ++this.#generation;
    this.#stage = 'busy';
    this.#selected = index;
    this.#render(`Running ${action.label}…`);
    try {
      const outcome = await action.run(context);
      if (generation !== this.#generation || this.#window !== pdfWindow) return;
      if (outcome && typeof outcome === 'object' && outcome.body) {
        this.#stage = 'result';
        this.#resultText = outcome.body;
        this.#renderResult(outcome);
        return;
      }
      const managesFocus = action.managesFocus === true;
      this.close();
      if (!managesFocus) pdfWindow.focus();
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#host.debug(`selection action ${action.id} failed: ${String(error)}`);
      this.close();
      this.#host.showStatus(`✗ ${action.label} failed`, 2500);
      pdfWindow.focus();
    }
  }

  #mount(pdfWindow: PdfWindow): void {
    const overlay = pdfWindow.document.createElement('div');
    overlay.id = 'zv-selection-actions';
    overlay.dataset.zoteroNeoSelectionActions = '1';
    overlay.style.cssText = `position:fixed;right:16px;bottom:52px;z-index:100002;width:min(430px,calc(100vw - 32px));max-height:min(70vh,560px);overflow:auto;padding:10px;border:1px solid ${THEME_VARS.border};border-radius:8px;background:${THEME_VARS.surface};color:${THEME_VARS.text};box-shadow:0 12px 36px ${THEME_VARS.shadow};font:12px/1.4 system-ui,sans-serif;pointer-events:none;`;
    pdfWindow.document.body?.appendChild(overlay);
    this.#overlay = overlay;
    this.#themeCleanup = this.#host.themeRoot(overlay);
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

  #renderResult(outcome: ReaderSelectionActionOutcome): void {
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
