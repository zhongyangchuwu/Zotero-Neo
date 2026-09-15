import { hintLabels } from './hint-labels';
import type { PdfWindow, Pointer, ReaderMode } from './types';

export type FlashMode = Extract<ReaderMode, 'normal' | 'cursor' | 'visual'>;

export interface FlashTextSegment {
  readonly textNode: Text;
  readonly text: string;
}

export interface FlashTextIndex {
  readonly text: string;
  readonly pointers: readonly Pointer[];
}

export interface FlashMatch {
  readonly index: number;
  readonly pointer: Pointer;
}

interface FlashRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

interface FlashTarget {
  readonly pointer: Pointer;
  readonly rect: FlashRect;
  readonly label: string;
  readonly element: HTMLElement;
}

export interface ReaderFlashHost {
  readonly activate: (mode: FlashMode, pdfWindow: PdfWindow, pointer: Pointer) => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

const FLASH_TARGET_LIMIT = 512;

function isTextNode(node: Node | null): node is Text {
  return node?.nodeType === 3;
}

function validRect(rect: FlashRect): boolean {
  return (
    [rect.left, rect.right, rect.top, rect.bottom, rect.width, rect.height].every(Number.isFinite) &&
    rect.height > 0
  );
}

function appendMappedCharacter(
  output: string[],
  pointers: Pointer[],
  value: string,
  pointer: Pointer,
  whitespaceState: { pending: boolean },
): void {
  for (const character of value) {
    if (/\s/u.test(character)) {
      whitespaceState.pending = output.length > 0;
      continue;
    }
    if (whitespaceState.pending) {
      output.push(' ');
      pointers.push(pointer);
      whitespaceState.pending = false;
    }
    output.push(character);
    for (let index = 0; index < character.length; index += 1) pointers.push(pointer);
  }
}

/** NFKC + collapsed whitespace normalization used by Flash query matching. */
export function normalizeFlashText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

/** Builds a normalized search string while retaining a source caret pointer per UTF-16 unit. */
export function buildFlashTextIndex(segments: readonly FlashTextSegment[]): FlashTextIndex {
  const output: string[] = [];
  const pointers: Pointer[] = [];
  const whitespaceState = { pending: false };

  for (const segment of segments) {
    const value = segment.text;
    for (let offset = 0; offset < value.length; ) {
      const codePoint = value.codePointAt(offset);
      if (codePoint === undefined) break;
      const source = String.fromCodePoint(codePoint);
      const pointer = { textNode: segment.textNode, offset };
      appendMappedCharacter(output, pointers, source.normalize('NFKC'), pointer, whitespaceState);
      offset += source.length;
    }
  }

  return { text: output.join(''), pointers };
}

/** Literal overlapping matches with Vim-style smartcase for ASCII/Latin query input. */
export function flashMatches(index: FlashTextIndex, rawQuery: string): FlashMatch[] {
  const query = normalizeFlashText(rawQuery);
  if (!query) return [];
  const caseSensitive = /[A-Z]/.test(query);
  const haystack = caseSensitive ? index.text : index.text.toLocaleLowerCase('en-US');
  const needle = caseSensitive ? query : query.toLocaleLowerCase('en-US');
  const matches: FlashMatch[] = [];
  const seen = new Map<Text, Set<number>>();

  let from = 0;
  while (from <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, from);
    if (found < 0) break;
    const pointer = index.pointers[found];
    if (pointer) {
      let offsets = seen.get(pointer.textNode);
      if (!offsets) {
        offsets = new Set<number>();
        seen.set(pointer.textNode, offsets);
      }
      if (!offsets.has(pointer.offset)) {
        offsets.add(pointer.offset);
        matches.push({ index: found, pointer });
      }
    }
    from = found + 1;
  }
  return matches;
}

/**
 * Keyboard-first visible-text targeter. Query entry and label selection are intentionally separate
 * in v1: Enter freezes the current literal query, then stable labels select an explicit target.
 */
export class ReaderFlash {
  readonly #host: ReaderFlashHost;
  #window: PdfWindow | null = null;
  #mode: FlashMode | null = null;
  #index: FlashTextIndex | null = null;
  #query = '';
  #stage: 'query' | 'label' = 'query';
  #labelBuffer = '';
  #targets: FlashTarget[] = [];
  #prompt: HTMLElement | null = null;

  constructor(host: ReaderFlashHost) {
    this.#host = host;
  }

  get isOpen(): boolean {
    return this.#window !== null;
  }

  open(pdfWindow: PdfWindow, mode: FlashMode): void {
    this.cancel();
    try {
      const segments = this.#visibleSegments(pdfWindow);
      const index = buildFlashTextIndex(segments);
      if (!index.text.trim()) {
        this.#host.showStatus('No visible text', 1200);
        return;
      }
      this.#window = pdfWindow;
      this.#mode = mode;
      this.#index = index;
      this.#query = '';
      this.#stage = 'query';
      this.#labelBuffer = '';
      this.#prompt = this.#createPrompt(pdfWindow);
      this.#refreshPrompt();
    } catch (error) {
      this.cancel();
      this.#host.debug(`reader Flash open failed: ${String(error)}`);
      this.#host.showStatus('Flash unavailable', 1500);
    }
  }

  /** Returns false when an event belongs to another split view after cancelling this invocation. */
  handleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
    if (!this.#window) return false;
    if (pdfWindow !== this.#window) {
      this.cancel();
      return false;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      this.cancel();
      pdfWindow.focus();
      return true;
    }

    if (this.#stage === 'query') {
      this.#handleQueryKey(event);
      return true;
    }
    this.#handleLabelKey(event);
    return true;
  }

  onViewportChange(pdfWindow: PdfWindow): void {
    if (this.#window === pdfWindow) this.cancel();
  }

  releaseView(pdfWindow: PdfWindow): void {
    if (this.#window === pdfWindow) this.cancel();
  }

  dispose(): void {
    this.cancel();
  }

  cancel(): void {
    for (const target of this.#targets) target.element.remove();
    this.#targets = [];
    this.#prompt?.remove();
    this.#prompt = null;
    this.#window = null;
    this.#mode = null;
    this.#index = null;
    this.#query = '';
    this.#stage = 'query';
    this.#labelBuffer = '';
  }

  #handleQueryKey(event: KeyboardEvent): void {
    if (event.key === 'Backspace') {
      this.#query = this.#query.slice(0, -1);
      this.#refreshPrompt();
      return;
    }
    if (event.key === 'Enter' || event.key === 'Return') {
      this.#freezeTargets();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    const code = event.key.charCodeAt(0);
    if (code < 0x20 || code > 0x7e) return;
    this.#query += event.key;
    this.#refreshPrompt();
  }

  #handleLabelKey(event: KeyboardEvent): void {
    if (event.key === 'Backspace') {
      if (this.#labelBuffer) {
        this.#labelBuffer = this.#labelBuffer.slice(0, -1);
        this.#refreshLabels();
      } else {
        this.#clearTargets();
        this.#stage = 'query';
        this.#refreshPrompt();
      }
      return;
    }
    if (!/^[a-z]$/i.test(event.key)) return;
    const next = `${this.#labelBuffer}${event.key.toUpperCase()}`;
    const matches = this.#targets.filter((target) => target.label.startsWith(next));
    if (!matches.length) {
      this.#labelBuffer = '';
      this.#refreshLabels();
      return;
    }
    this.#labelBuffer = next;
    this.#refreshLabels();
    const exact = matches.find((target) => target.label === next);
    if (exact) this.#activate(exact);
  }

  #freezeTargets(): void {
    const pdfWindow = this.#window;
    const index = this.#index;
    if (!pdfWindow || !index || !normalizeFlashText(this.#query)) return;
    try {
      const origin = this.#originPoint(pdfWindow);
      const candidates = flashMatches(index, this.#query)
        .map((match) => {
          const rect = this.#pointerRect(pdfWindow, match.pointer);
          return rect && this.#rectVisible(pdfWindow, rect) ? { ...match, rect } : null;
        })
        .filter((value): value is FlashMatch & { readonly rect: FlashRect } => value !== null)
        .sort((left, right) => {
          const leftDistance = this.#distanceSquared(left.rect, origin.x, origin.y);
          const rightDistance = this.#distanceSquared(right.rect, origin.x, origin.y);
          return leftDistance - rightDistance || left.index - right.index;
        })
        .slice(0, FLASH_TARGET_LIMIT);

      if (!candidates.length) {
        this.#refreshPrompt(' — no matches');
        return;
      }
      const labels = hintLabels(candidates.length);
      this.#clearTargets();
      candidates.forEach((candidate, indexValue) => {
        const element = pdfWindow.document.createElement('span');
        const label = labels[indexValue] ?? '';
        element.dataset.zoteroNeoFlashHint = '1';
        element.textContent = label;
        element.style.cssText =
          'position:fixed;z-index:100000;background:#f9e2af;color:#1e1e2e;padding:1px 3px;border:1px solid #1e1e2e;border-radius:2px;font:bold 10px monospace;line-height:1.2;pointer-events:none;';
        element.style.left = `${candidate.rect.left}px`;
        element.style.top = `${candidate.rect.top}px`;
        pdfWindow.document.body?.appendChild(element);
        this.#targets.push({
          pointer: candidate.pointer,
          rect: candidate.rect,
          label,
          element,
        });
      });
      this.#stage = 'label';
      this.#labelBuffer = '';
      this.#refreshLabels();
      this.#refreshPrompt(` — ${this.#targets.length} targets`);
    } catch (error) {
      this.#host.debug(`reader Flash target freeze failed: ${String(error)}`);
      this.cancel();
      this.#host.showStatus('Flash unavailable', 1500);
    }
  }

  #activate(target: FlashTarget): void {
    const pdfWindow = this.#window;
    const mode = this.#mode;
    const pointer = target.pointer;
    if (!pdfWindow || !mode || !pointer.textNode.isConnected) {
      this.cancel();
      this.#host.showStatus('Flash target unavailable', 1200);
      return;
    }
    this.cancel();
    this.#host.activate(mode, pdfWindow, pointer);
  }

  #refreshPrompt(suffix = ''): void {
    const prompt = this.#prompt;
    const index = this.#index;
    if (!prompt || !index) return;
    const count = this.#query ? flashMatches(index, this.#query).length : 0;
    const stage = this.#stage === 'query' ? 'FLASH' : 'FLASH LABEL';
    prompt.textContent =
      this.#stage === 'query'
        ? `${stage}: ${this.#query || '…'}${this.#query ? ` (${count})` : ''}${suffix}`
        : `${stage}: ${this.#labelBuffer || '…'}${suffix}`;
  }

  #refreshLabels(): void {
    for (const target of this.#targets) {
      target.element.hidden = !target.label.startsWith(this.#labelBuffer);
    }
    this.#refreshPrompt();
  }

  #clearTargets(): void {
    for (const target of this.#targets) target.element.remove();
    this.#targets = [];
    this.#labelBuffer = '';
  }

  #createPrompt(pdfWindow: PdfWindow): HTMLElement {
    const prompt = pdfWindow.document.createElement('div');
    prompt.dataset.zoteroNeoFlashPrompt = '1';
    prompt.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:100001;padding:4px 7px;border:1px solid #585b70;border-radius:4px;background:#1e1e2e;color:#cdd6f4;font:12px monospace;pointer-events:none;';
    pdfWindow.document.body?.appendChild(prompt);
    return prompt;
  }

  #visibleSegments(pdfWindow: PdfWindow): FlashTextSegment[] {
    const spans = Array.from(pdfWindow.document.querySelectorAll('.textLayer span')) as HTMLElement[];
    const segments: FlashTextSegment[] = [];
    for (const span of spans) {
      const textNode = span.firstChild;
      if (!isTextNode(textNode) || !textNode.length || !textNode.isConnected) continue;
      const rect = span.getBoundingClientRect();
      if (!validRect(rect) || !this.#rectVisible(pdfWindow, rect)) continue;
      segments.push({ textNode, text: textNode.data });
    }
    return segments;
  }

  #pointerRect(pdfWindow: PdfWindow, pointer: Pointer): FlashRect | null {
    try {
      const range = pdfWindow.document.createRange();
      const offset = Math.min(pointer.offset, pointer.textNode.length);
      range.setStart(pointer.textNode, offset);
      range.setEnd(pointer.textNode, Math.min(pointer.textNode.length, offset + 1));
      let rect = range.getBoundingClientRect();
      if (!validRect(rect)) {
        const parent = pointer.textNode.parentElement;
        if (!parent) return null;
        rect = parent.getBoundingClientRect();
      }
      return validRect(rect) ? rect : null;
    } catch {
      return null;
    }
  }

  #originPoint(pdfWindow: PdfWindow): { readonly x: number; readonly y: number } {
    const selection = pdfWindow.getSelection();
    const focus = selection?.focusNode ?? null;
    if (isTextNode(focus)) {
      const rect = this.#pointerRect(pdfWindow, {
        textNode: focus,
        offset: selection?.focusOffset ?? 0,
      });
      if (rect) return { x: rect.left, y: (rect.top + rect.bottom) / 2 };
    }
    const width = pdfWindow.innerWidth || pdfWindow.document.documentElement.clientWidth;
    const height = pdfWindow.innerHeight || pdfWindow.document.documentElement.clientHeight;
    return { x: width / 2, y: height / 2 };
  }

  #distanceSquared(rect: FlashRect, x: number, y: number): number {
    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;
    return (centerX - x) ** 2 + (centerY - y) ** 2;
  }

  #rectVisible(pdfWindow: PdfWindow, rect: FlashRect): boolean {
    const width = pdfWindow.innerWidth || pdfWindow.document.documentElement.clientWidth;
    const height = pdfWindow.innerHeight || pdfWindow.document.documentElement.clientHeight;
    return rect.right >= 0 && rect.bottom >= 0 && rect.left <= width && rect.top <= height;
  }
}
