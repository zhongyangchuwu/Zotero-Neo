import {
  bindCompositionState,
  compositionOwnsKey,
  isCommittedInput,
  type CompositionState,
} from '../input/composition';
import { HINT_ALPHABET } from './hint-labels';
import type { PdfWindow, Pointer } from './types';

export type FlashIntent = 'visual-start' | 'visual-end';

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
  readonly end: Pointer;
}

export interface FlashSelectionTarget {
  readonly start: Pointer;
  readonly end: Pointer;
}

interface FlashRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

interface FlashCandidate extends FlashMatch {
  readonly rect: FlashRect;
}

interface FlashTarget extends FlashSelectionTarget {
  readonly pointer: Pointer;
  readonly rect: FlashRect;
  readonly label: string;
  readonly element: HTMLElement;
}

export interface ReaderFlashHost {
  readonly activate: (
    intent: FlashIntent,
    pdfWindow: PdfWindow,
    target: FlashSelectionTarget,
  ) => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

/** Keep geometry + DOM work comfortably below one 60 Hz frame on ordinary visible PDF text. */
export const FLASH_TARGET_LIMIT = 48;

function isTextNode(node: Node | null): node is Text {
  return node?.nodeType === 3;
}

function validRect(rect: FlashRect): boolean {
  return (
    [rect.left, rect.right, rect.top, rect.bottom, rect.width, rect.height].every(
      Number.isFinite,
    ) && rect.height > 0
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

function pointerAfterSourceCharacter(pointer: Pointer): Pointer {
  const codePoint = pointer.textNode.data.codePointAt(pointer.offset);
  const width = codePoint === undefined ? 1 : String.fromCodePoint(codePoint).length;
  return {
    textNode: pointer.textNode,
    offset: Math.min(pointer.textNode.length, pointer.offset + width),
  };
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
    const last = index.pointers[found + needle.length - 1];
    if (pointer && last) {
      let offsets = seen.get(pointer.textNode);
      if (!offsets) {
        offsets = new Set<number>();
        seen.set(pointer.textNode, offsets);
      }
      if (!offsets.has(pointer.offset)) {
        offsets.add(pointer.offset);
        matches.push({
          index: found,
          pointer,
          end: pointerAfterSourceCharacter(last),
        });
      }
    }
    from = found + 1;
  }
  return matches;
}

/**
 * Returns label letters that would also be valid one-character continuations of the current query.
 * Flash must not use these as first label characters, so search input and jump input stay unambiguous.
 */
export function flashContinuationLabels(
  index: FlashTextIndex,
  rawQuery: string,
  matches: readonly FlashMatch[],
): ReadonlySet<string> {
  const query = normalizeFlashText(rawQuery);
  const excluded = new Set<string>();
  if (!query) return excluded;
  for (const match of matches) {
    const position = match.index + query.length;
    const codePoint = index.text.codePointAt(position);
    if (codePoint === undefined) continue;
    const character = String.fromCodePoint(codePoint);
    if (/^[a-z]$/i.test(character)) excluded.add(character.toUpperCase());
  }
  return excluded;
}

function flashLabelPool(count: number, firstAlphabet: string): string[] {
  if (count <= 0 || !firstAlphabet) return [];
  let suffixWidth = 0;
  let capacity = firstAlphabet.length;
  while (capacity < count) {
    suffixWidth += 1;
    capacity *= HINT_ALPHABET.length;
  }
  return Array.from({ length: capacity }, (_, index) => {
    const suffixCapacity = HINT_ALPHABET.length ** suffixWidth;
    const firstIndex = Math.floor(index / suffixCapacity);
    let remainder = index % suffixCapacity;
    let suffix = '';
    for (let position = suffixWidth - 1; position >= 0; position -= 1) {
      const divisor = HINT_ALPHABET.length ** position;
      const digit = Math.floor(remainder / divisor);
      suffix += HINT_ALPHABET[digit] ?? HINT_ALPHABET[0]!;
      remainder %= divisor;
    }
    return `${firstAlphabet[firstIndex] ?? firstAlphabet[0]!}${suffix}`;
  });
}

/**
 * Keyboard-first visible-text targeter. Labels update incrementally with the literal query. Their
 * first letters are excluded from every valid one-character query continuation, so pressing a
 * visible label can jump immediately without a separate confirmation stage.
 */
export class ReaderFlash {
  readonly #host: ReaderFlashHost;
  #window: PdfWindow | null = null;
  #intent: FlashIntent | null = null;
  #index: FlashTextIndex | null = null;
  #query = '';
  #labelBuffer = '';
  #targets: FlashTarget[] = [];
  #prompt: HTMLElement | null = null;
  #input: HTMLInputElement | null = null;
  #inputCleanup: (() => void) | null = null;
  readonly #composition: CompositionState = { active: false };
  #matchCount = 0;
  #labelCache = new Map<Text, Map<number, string>>();

  constructor(host: ReaderFlashHost) {
    this.#host = host;
  }

  get isOpen(): boolean {
    return this.#window !== null;
  }

  open(pdfWindow: PdfWindow, intent: FlashIntent): void {
    this.cancel();
    try {
      const segments = this.#visibleSegments(pdfWindow);
      const index = buildFlashTextIndex(segments);
      if (!index.text.trim()) {
        this.#host.showStatus('No visible text', 1200);
        return;
      }
      this.#window = pdfWindow;
      this.#intent = intent;
      this.#index = index;
      this.#query = '';
      this.#labelBuffer = '';
      this.#matchCount = 0;
      this.#labelCache.clear();
      this.#prompt = this.#createPrompt(pdfWindow);
      this.#input = this.#createInput(pdfWindow);
      this.#input.focus();
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

    if (compositionOwnsKey(event, this.#composition.active)) {
      event.stopPropagation();
      return true;
    }

    const consumeCommand = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (event.key === 'Escape') {
      consumeCommand();
      this.cancel();
      pdfWindow.focus();
      return true;
    }

    if (this.#labelBuffer) {
      consumeCommand();
      this.#handleLabelKey(event);
      return true;
    }

    if (event.key === 'Enter' || event.key === 'Return') {
      consumeCommand();
      const first = this.#targets[0];
      if (first) this.#activate(first);
      return true;
    }

    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      const labelKey = event.key.toUpperCase();
      if (
        /^[A-Z]$/.test(labelKey) &&
        this.#targets.some((target) => target.label.startsWith(labelKey))
      ) {
        consumeCommand();
        this.#labelBuffer = labelKey;
        this.#refreshLabels();
        const exact = this.#targets.find((target) => target.label === labelKey);
        if (exact) this.#activate(exact);
        return true;
      }
    }

    // Keep Reader/Zotero shortcuts from seeing query-editing keys, but preserve the input's default edit.
    event.stopPropagation();
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
    this.#clearTargets();
    this.#inputCleanup?.();
    this.#inputCleanup = null;
    this.#input?.remove();
    this.#input = null;
    this.#composition.active = false;
    this.#prompt?.remove();
    this.#prompt = null;
    this.#window = null;
    this.#intent = null;
    this.#index = null;
    this.#query = '';
    this.#labelBuffer = '';
    this.#matchCount = 0;
    this.#labelCache.clear();
  }

  #handleLabelKey(event: KeyboardEvent): void {
    if (event.key === 'Backspace') {
      this.#labelBuffer = this.#labelBuffer.slice(0, -1);
      this.#refreshLabels();
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

  #refreshTargets(): void {
    const pdfWindow = this.#window;
    const index = this.#index;
    this.#labelBuffer = '';
    this.#clearTargets();
    if (!pdfWindow || !index) return;
    const query = normalizeFlashText(this.#query);
    if (!query) {
      this.#matchCount = 0;
      this.#refreshPrompt();
      return;
    }

    try {
      const matches = flashMatches(index, this.#query);
      this.#matchCount = matches.length;
      if (!matches.length) {
        this.#refreshPrompt();
        return;
      }
      if (matches.length > FLASH_TARGET_LIMIT) {
        this.#refreshPrompt(' — type more');
        return;
      }

      const excluded = flashContinuationLabels(index, this.#query, matches);
      const firstAlphabet = Array.from(HINT_ALPHABET)
        .filter((letter) => !excluded.has(letter))
        .join('');
      if (!firstAlphabet) {
        this.#refreshPrompt(' — type more');
        return;
      }

      const origin = this.#originPoint(pdfWindow);
      const candidates = matches
        .map((match) => {
          const rect = this.#pointerRect(pdfWindow, match.pointer);
          return rect && this.#rectVisible(pdfWindow, rect) ? { ...match, rect } : null;
        })
        .filter((value): value is FlashCandidate => value !== null)
        .sort((left, right) => {
          const leftDistance = this.#distanceSquared(left.rect, origin.x, origin.y);
          const rightDistance = this.#distanceSquared(right.rect, origin.x, origin.y);
          return leftDistance - rightDistance || left.index - right.index;
        });

      if (!candidates.length) {
        this.#refreshPrompt(' — no visible targets');
        return;
      }

      const labels = this.#assignLabels(candidates, firstAlphabet);
      candidates.forEach((candidate, indexValue) => {
        const label = labels[indexValue];
        if (!label) return;
        const element = pdfWindow.document.createElement('span');
        element.dataset.zoteroNeoFlashHint = '1';
        element.textContent = label;
        element.style.cssText =
          'position:fixed;z-index:100000;background:#f9e2af;color:#1e1e2e;padding:1px 3px;border:1px solid #1e1e2e;border-radius:2px;font:bold 10px monospace;line-height:1.2;pointer-events:none;';
        element.style.left = `${candidate.rect.left}px`;
        element.style.top = `${candidate.rect.top}px`;
        pdfWindow.document.body?.appendChild(element);
        this.#targets.push({
          start: candidate.pointer,
          pointer: candidate.pointer,
          end: candidate.end,
          rect: candidate.rect,
          label,
          element,
        });
      });
      this.#refreshPrompt();
    } catch (error) {
      this.#host.debug(`reader Flash refresh failed: ${String(error)}`);
      this.cancel();
      this.#host.showStatus('Flash unavailable', 1500);
    }
  }

  #assignLabels(candidates: readonly FlashCandidate[], firstAlphabet: string): string[] {
    const pool = flashLabelPool(candidates.length, firstAlphabet);
    if (!pool.length) return [];
    const width = pool[0]!.length;
    const allowed = new Set(pool);
    const used = new Set<string>();
    const assigned: (string | null)[] = Array.from({ length: candidates.length }, () => null);

    candidates.forEach((candidate, index) => {
      const cached = this.#cachedLabel(candidate.pointer);
      if (!cached || cached.length !== width || !allowed.has(cached) || used.has(cached)) return;
      assigned[index] = cached;
      used.add(cached);
    });

    let poolIndex = 0;
    candidates.forEach((candidate, index) => {
      if (assigned[index]) return;
      while (poolIndex < pool.length && used.has(pool[poolIndex]!)) poolIndex += 1;
      const label = pool[poolIndex];
      if (!label) return;
      poolIndex += 1;
      assigned[index] = label;
      used.add(label);
      this.#cacheLabel(candidate.pointer, label);
    });
    return assigned.map((label) => label ?? '');
  }

  #cachedLabel(pointer: Pointer): string | null {
    return this.#labelCache.get(pointer.textNode)?.get(pointer.offset) ?? null;
  }

  #cacheLabel(pointer: Pointer, label: string): void {
    let offsets = this.#labelCache.get(pointer.textNode);
    if (!offsets) {
      offsets = new Map<number, string>();
      this.#labelCache.set(pointer.textNode, offsets);
    }
    offsets.set(pointer.offset, label);
  }

  #activate(target: FlashTarget): void {
    const pdfWindow = this.#window;
    const intent = this.#intent;
    if (
      !pdfWindow ||
      !intent ||
      !target.start.textNode.isConnected ||
      !target.end.textNode.isConnected
    ) {
      this.cancel();
      this.#host.showStatus('Flash target unavailable', 1200);
      return;
    }
    const selectionTarget = { start: target.start, end: target.end };
    this.cancel();
    this.#host.activate(intent, pdfWindow, selectionTarget);
  }

  #promptPrefix(): string {
    return this.#intent === 'visual-end' ? 'SELECT END' : 'SELECT START';
  }

  #refreshPrompt(suffix = ''): void {
    const prompt = this.#prompt;
    if (!prompt) return;
    const prefix = this.#promptPrefix();
    if (this.#labelBuffer) {
      prompt.textContent = `${prefix}: ${this.#query} → ${this.#labelBuffer}`;
      return;
    }
    prompt.textContent = this.#query
      ? `${prefix}: ${this.#query} (${this.#matchCount})${suffix}`
      : `${prefix}: …`;
  }

  #refreshLabels(): void {
    for (const target of this.#targets)
      target.element.hidden = !target.label.startsWith(this.#labelBuffer);
    this.#refreshPrompt();
  }

  #clearTargets(): void {
    for (const target of this.#targets) target.element.remove();
    this.#targets = [];
  }

  #createInput(pdfWindow: PdfWindow): HTMLInputElement {
    const input = pdfWindow.document.createElement('input') as HTMLInputElement;
    input.dataset.zoteroNeoFlashInput = '1';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Type visible text…';
    input.style.cssText =
      'position:fixed;left:12px;bottom:46px;z-index:100001;width:min(360px,calc(100vw - 24px));box-sizing:border-box;padding:6px 8px;border:2px solid #8ab4ff;border-radius:5px;background:#0f172a;color:#ffffff;outline:none;font:13px/1.2 monospace;box-shadow:0 4px 14px rgba(0,0,0,.28);';
    const compositionCleanup = bindCompositionState(input, this.#composition);
    const inputHandler = (event: Event): void => {
      if (!isCommittedInput(event, this.#composition.active)) return;
      this.#query = input.value;
      this.#refreshTargets();
    };
    input.addEventListener('input', inputHandler);
    this.#inputCleanup = () => {
      compositionCleanup();
      input.removeEventListener('input', inputHandler);
    };
    pdfWindow.document.body?.appendChild(input);
    return input;
  }

  #createPrompt(pdfWindow: PdfWindow): HTMLElement {
    const prompt = pdfWindow.document.createElement('div');
    prompt.dataset.zoteroNeoFlashPrompt = '1';
    prompt.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:100001;padding:5px 8px;border:2px solid #8ab4ff;border-radius:5px;background:#172554;color:#ffffff;font:bold 12px monospace;box-shadow:0 4px 14px rgba(0,0,0,.28);pointer-events:none;';
    pdfWindow.document.body?.appendChild(prompt);
    return prompt;
  }

  #visibleSegments(pdfWindow: PdfWindow): FlashTextSegment[] {
    const spans = Array.from(
      pdfWindow.document.querySelectorAll('.textLayer span'),
    ) as HTMLElement[];
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
