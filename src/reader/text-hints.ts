import { hintLabels } from './hint-labels';
import type { PdfWindow, Pointer, ReaderMode } from './types';

interface TextHintBadge {
  readonly element: HTMLElement;
  readonly label: string;
  readonly textNode: Text;
  readonly offset: number;
}

export interface ReaderTextHintsHost {
  readonly activePdfWindow: () => PdfWindow;
  readonly clearLinkHints: () => void;
  readonly setMode: (mode: ReaderMode) => void;
  readonly setVisualAnchor: (pointer: Pointer) => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly updateVisualCursor: (pdfWindow: PdfWindow, autoPan: boolean) => void;
}

function isTextNode(node: Node | null): node is Text {
  return node?.nodeType === 3;
}

/** Owns the transient hint UI used to place the Reader caret for Cursor/Visual entry. */
export class ReaderTextHints {
  readonly #host: ReaderTextHintsHost;
  #badges: TextHintBadge[] = [];
  #buffer = '';
  #targetMode: ReaderMode | null = null;
  #repositionFrame: number | null = null;

  constructor(host: ReaderTextHintsHost) {
    this.#host = host;
  }

  get active(): boolean {
    return this.#badges.length > 0;
  }

  show(pdfWindow: PdfWindow, targetMode: ReaderMode): void {
    this.#host.clearLinkHints();
    this.clear();
    const starts = this.#textNodes(pdfWindow).map((textNode) => ({ textNode, offset: 0 }));
    if (!starts.length) {
      this.#host.showStatus('✗ no selectable text', 1500);
      this.#host.setMode('normal');
      return;
    }
    const labels = hintLabels(starts.length);
    this.#targetMode = targetMode;
    starts.forEach((start, index) => {
      const range = pdfWindow.document.createRange();
      range.setStart(start.textNode, start.offset);
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      const badge = pdfWindow.document.createElement('span');
      badge.textContent = labels[index] ?? '';
      badge.style.cssText = `position:fixed;left:${rect.left}px;top:${Math.max(0, rect.top - 17)}px;z-index:99998;background:#f9e2af;color:#1e1e2e;padding:1px 3px;border-radius:2px;font:10px monospace;pointer-events:none;`;
      pdfWindow.document.body?.appendChild(badge);
      this.#badges.push({
        element: badge,
        label: labels[index] ?? '',
        textNode: start.textNode,
        offset: start.offset,
      });
    });
  }

  handleKey(event: KeyboardEvent, pdfWindow: PdfWindow): void {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      this.clear();
      this.#host.setMode('normal');
      return;
    }
    if (event.key === 'Backspace') {
      this.#buffer = this.#buffer.slice(0, -1);
      this.#refresh();
      return;
    }
    if (!/^[a-z]$/i.test(event.key)) return;
    const next = `${this.#buffer}${event.key.toUpperCase()}`;
    const matches = this.#badges.filter((badge) => badge.label.startsWith(next));
    if (!matches.length) {
      this.#buffer = '';
      this.#refresh();
      return;
    }
    this.#buffer = next;
    this.#refresh();
    const exact = matches.find((badge) => badge.label === next);
    if (exact || matches.length === 1) this.#activate(pdfWindow, exact ?? matches[0]!);
  }

  reposition(pdfWindow: PdfWindow): void {
    if (this.#repositionFrame !== null) return;
    this.#repositionFrame = pdfWindow.requestAnimationFrame(() => {
      this.#repositionFrame = null;
      for (const badge of this.#badges) {
        if (!badge.textNode.isConnected) continue;
        const range = pdfWindow.document.createRange();
        range.setStart(badge.textNode, Math.min(badge.offset, badge.textNode.length));
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        badge.element.style.left = `${rect.left}px`;
        badge.element.style.top = `${Math.max(0, rect.top - 17)}px`;
      }
    });
  }

  clear(): void {
    for (const badge of this.#badges) badge.element.remove();
    this.#badges = [];
    this.#buffer = '';
    this.#targetMode = null;
    if (this.#repositionFrame !== null)
      this.#host.activePdfWindow().cancelAnimationFrame(this.#repositionFrame);
    this.#repositionFrame = null;
  }

  #activate(pdfWindow: PdfWindow, badge: Pick<TextHintBadge, 'textNode' | 'offset'>): void {
    const selection = pdfWindow.getSelection();
    if (!selection) return;
    const range = pdfWindow.document.createRange();
    range.setStart(badge.textNode, badge.offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    this.#host.setVisualAnchor({ textNode: badge.textNode, offset: badge.offset });
    const target = this.#targetMode;
    this.clear();
    if (target === 'visual') this.#host.setMode('visual');
    else if (target === 'cursor') this.#host.setMode('cursor');
    this.#host.updateVisualCursor(pdfWindow, true);
  }

  #refresh(): void {
    for (const badge of this.#badges)
      badge.element.style.display = badge.label.startsWith(this.#buffer) ? 'block' : 'none';
  }

  #textNodes(pdfWindow: PdfWindow): Text[] {
    const spans = Array.from(
      pdfWindow.document.querySelectorAll('.textLayer span'),
    ) as HTMLElement[];
    return spans
      .map((span) => span.firstChild ?? null)
      .filter((node): node is Text => isTextNode(node) && !!node.data.trim());
  }
}
