import { CleanupFailure } from '../../core/cleanup';
import { pdfTextSpans } from '../../toolkit/reader';
import {
  compositionOwnsKey,
  isCommittedInput,
  type CompositionState,
} from '../../input/composition';
import { isDeadObject, nativeObjectIdentity } from '../../platform/cross-compartment';
import { HINT_ALPHABET } from '../../reader/hint-labels';
import type { PdfWindow, Pointer } from '../../reader/types';
import { buildMappedTextIndex, type MappedTextIndex } from './token-boundaries';

export type FlashIntent = 'visual-start' | 'visual-end';

export interface FlashTextSegment {
  readonly textNode: Text;
  readonly text: string;
}

export interface FlashTextIndex extends MappedTextIndex {}

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
  readonly isCurrent: (pdfWindow: PdfWindow) => boolean;
  readonly captureView: (pdfWindow: PdfWindow) => () => boolean;
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

/** NFKC + collapsed whitespace normalization used by Flash query matching. */
export function normalizeFlashText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

/** Builds a normalized search index while retaining exact DOM source endpoints. */
export function buildFlashTextIndex(segments: readonly FlashTextSegment[]): FlashTextIndex {
  return buildMappedTextIndex(segments);
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
    const last = index.ends[found + needle.length - 1];
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
          end: last,
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
  #generation = 0;
  #disposed = false;
  #window: PdfWindow | null = null;
  #viewCurrent: (() => boolean) | null = null;
  #intent: FlashIntent | null = null;
  #index: FlashTextIndex | null = null;
  #query = '';
  #labelBuffer = '';
  #targets: FlashTarget[] = [];
  #prompt: HTMLElement | null = null;
  #input: HTMLInputElement | null = null;
  #inputCleanup: (() => void) | null = null;
  #composition: CompositionState = { active: false };
  #matchCount = 0;
  #labelCache = new Map<Text, Map<number, string>>();

  constructor(host: ReaderFlashHost) {
    this.#host = host;
  }

  get isOpen(): boolean {
    return this.#window !== null;
  }

  ownsView(pdfWindow: PdfWindow): boolean {
    return this.#window === pdfWindow;
  }

  /** Internal focus into the query is not a view exit; other blur still cancels Flash. */
  onBlur(pdfWindow: PdfWindow, event: FocusEvent): void {
    if (!this.ownsView(pdfWindow)) return;
    const input = this.#input;
    if (
      input &&
      !isDeadObject(input) &&
      event.relatedTarget &&
      nativeObjectIdentity(event.relatedTarget) === nativeObjectIdentity(input)
    )
      return;
    this.cancel();
  }

  open(pdfWindow: PdfWindow, intent: FlashIntent): void {
    const previousGeneration = this.#generation;
    this.cancel();
    if (
      this.#generation !== previousGeneration + 1 ||
      this.#disposed ||
      isDeadObject(pdfWindow) ||
      !this.#host.isCurrent(pdfWindow)
    )
      return;
    const generation = this.#generation;
    const current = this.#host.captureView(pdfWindow);
    try {
      const index = buildFlashTextIndex(this.#visibleSegments(pdfWindow));
      if (generation !== this.#generation || !this.#host.isCurrent(pdfWindow) || !current()) return;
      if (!index.text.trim()) {
        this.#host.showStatus('No visible text', 1200);
        return;
      }
      this.#window = pdfWindow;
      this.#viewCurrent = current;
      this.#intent = intent;
      this.#index = index;
      this.#createPrompt(pdfWindow, generation);
      if (!this.#current(pdfWindow, generation)) {
        if (generation === this.#generation) this.cancel();
        return;
      }
      this.#createInput(pdfWindow, generation);
      if (!this.#current(pdfWindow, generation)) {
        if (generation === this.#generation) this.cancel();
        return;
      }
      this.#input?.focus();
      if (this.#current(pdfWindow, generation)) this.#refreshPrompt();
      else if (generation === this.#generation) this.cancel();
    } catch (error) {
      const active =
        generation === this.#generation &&
        !this.#disposed &&
        !isDeadObject(pdfWindow) &&
        this.#host.isCurrent(pdfWindow) &&
        current();
      const failure = new CleanupFailure();
      if (generation === this.#generation) failure.run(() => this.cancel());
      if (
        active &&
        this.#generation === generation + 1 &&
        current() &&
        this.#host.isCurrent(pdfWindow)
      ) {
        this.#host.debug(`reader Flash open failed: ${String(error)}`);
        if (this.#generation === generation + 1 && current() && this.#host.isCurrent(pdfWindow))
          this.#host.showStatus('Flash unavailable', 1500);
      }
      failure.rethrow();
    }
  }

  /** Returns false when an event belongs to another split view after cancelling this invocation. */
  handleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {
    if (!this.#window) return false;
    if (pdfWindow !== this.#window) {
      this.cancel();
      return false;
    }
    if (!this.#current(pdfWindow, this.#generation)) {
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
      const generation = this.#generation;
      const current = this.#viewCurrent;
      this.cancel();
      if (
        this.#generation === generation + 1 &&
        !this.#disposed &&
        current?.() &&
        this.#host.isCurrent(pdfWindow)
      )
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
    this.#disposed = true;
    this.cancel();
  }

  /** Retires input ownership before DOM cleanup; dead nodes are skipped and live failures propagate. */
  cancel(): void {
    this.#generation += 1;
    const input = this.#input;
    const prompt = this.#prompt;
    const inputCleanup = this.#inputCleanup;
    this.#inputCleanup = null;
    this.#input = null;
    this.#composition.active = false;
    this.#prompt = null;
    this.#window = null;
    this.#viewCurrent = null;
    this.#intent = null;
    this.#index = null;
    this.#query = '';
    this.#labelBuffer = '';
    this.#matchCount = 0;
    this.#labelCache.clear();
    const failure = new CleanupFailure();
    failure.run(() => this.#clearTargets());
    if (input && !isDeadObject(input)) {
      failure.run(() => inputCleanup?.());
      failure.run(() => input.remove());
    }
    if (prompt && !isDeadObject(prompt)) failure.run(() => prompt.remove());
    failure.rethrow();
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
    const generation = this.#generation;
    this.#labelBuffer = '';
    try {
      this.#clearTargets();
    } catch (error) {
      const failure = new CleanupFailure();
      failure.run(() => {
        throw error;
      });
      if (generation === this.#generation) failure.run(() => this.cancel());
      failure.rethrow();
      return;
    }
    if (!pdfWindow || !index || !this.#current(pdfWindow, generation)) return;
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
      for (const [indexValue, candidate] of candidates.entries()) {
        if (!this.#current(pdfWindow, generation)) break;
        const label = labels[indexValue];
        if (!label) continue;
        const element = pdfWindow.document.createElement('span');
        element.dataset.zoteroNeoFlashHint = '1';
        element.textContent = label;
        element.style.cssText =
          'position:fixed;z-index:100000;background:#f9e2af;color:#1e1e2e;padding:1px 3px;border:1px solid #1e1e2e;border-radius:2px;font:bold 10px monospace;line-height:1.2;pointer-events:none;';
        element.style.left = `${candidate.rect.left}px`;
        element.style.top = `${candidate.rect.top}px`;
        const target = {
          start: candidate.pointer,
          pointer: candidate.pointer,
          end: candidate.end,
          rect: candidate.rect,
          label,
          element,
        };
        this.#targets.push(target);
        try {
          pdfWindow.document.body?.appendChild(element);
        } finally {
          if (!this.#current(pdfWindow, generation) && !isDeadObject(element)) element.remove();
        }
      }
      if (!this.#current(pdfWindow, generation)) {
        if (generation === this.#generation) this.cancel();
        return;
      }
      this.#refreshPrompt();
    } catch (error) {
      const active = this.#current(pdfWindow, generation);
      const current = this.#viewCurrent;
      const failure = new CleanupFailure();
      if (generation === this.#generation) failure.run(() => this.cancel());
      if (
        active &&
        this.#generation === generation + 1 &&
        current?.() &&
        this.#host.isCurrent(pdfWindow)
      ) {
        this.#host.debug(`reader Flash refresh failed: ${String(error)}`);
        if (this.#generation === generation + 1 && current() && this.#host.isCurrent(pdfWindow))
          this.#host.showStatus('Flash unavailable', 1500);
      }
      failure.rethrow();
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
    const current = this.#viewCurrent;
    if (!pdfWindow || !this.#current(pdfWindow, this.#generation)) {
      this.cancel();
      return;
    }
    if (
      !intent ||
      isDeadObject(target.start.textNode) ||
      isDeadObject(target.end.textNode) ||
      !target.start.textNode.isConnected ||
      !target.end.textNode.isConnected
    ) {
      const generation = this.#generation;
      this.cancel();
      if (
        this.#generation === generation + 1 &&
        !this.#disposed &&
        current?.() &&
        this.#host.isCurrent(pdfWindow)
      )
        this.#host.showStatus('Flash target unavailable', 1200);
      return;
    }
    const selectionTarget = { start: target.start, end: target.end };
    const generation = this.#generation;
    this.cancel();
    if (
      this.#generation === generation + 1 &&
      !this.#disposed &&
      current?.() &&
      this.#host.isCurrent(pdfWindow)
    )
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
    const targets = this.#targets;
    this.#targets = [];
    const failure = new CleanupFailure();
    for (const target of targets) {
      if (!isDeadObject(target.element)) failure.run(() => target.element.remove());
    }
    failure.rethrow();
  }

  #createInput(pdfWindow: PdfWindow, generation: number): void {
    const input = pdfWindow.document.createElement('input') as HTMLInputElement;
    input.dataset.zoteroNeoFlashInput = '1';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Type visible text…';
    input.style.cssText =
      'position:fixed;left:12px;bottom:46px;z-index:100001;width:min(360px,calc(100vw - 24px));box-sizing:border-box;padding:6px 8px;border:2px solid #8ab4ff;border-radius:5px;background:#0f172a;color:#ffffff;outline:none;font:13px/1.2 monospace;box-shadow:0 4px 14px rgba(0,0,0,.28);';
    const composition: CompositionState = { active: false };
    this.#composition = composition;
    this.#input = input;
    const current = (): boolean => {
      if (this.#input !== input || this.#generation !== generation) return false;
      if (!isDeadObject(input) && this.#current(pdfWindow, generation)) return true;
      this.cancel();
      return false;
    };
    const start = (): void => {
      if (current()) composition.active = true;
    };
    const end = (): void => {
      if (current()) composition.active = false;
    };
    const inputHandler = (event: Event): void => {
      if (!current() || isDeadObject(input) || !isCommittedInput(event, composition.active)) return;
      this.#query = input.value;
      this.#refreshTargets();
    };
    const cleanup = (): void => {
      composition.active = false;
      const failure = new CleanupFailure();
      failure.run(() => input.removeEventListener('compositionstart', start));
      failure.run(() => input.removeEventListener('compositionend', end));
      failure.run(() => input.removeEventListener('input', inputHandler));
      failure.rethrow();
    };
    this.#inputCleanup = cleanup;
    try {
      input.addEventListener('compositionstart', start);
      if (!current()) return;
      input.addEventListener('compositionend', end);
      if (!current()) return;
      input.addEventListener('input', inputHandler);
      if (!current()) return;
      pdfWindow.document.body?.appendChild(input);
    } finally {
      if (!current()) {
        const failure = new CleanupFailure();
        if (generation === this.#generation) failure.run(() => this.cancel());
        if (!isDeadObject(input)) {
          failure.run(cleanup);
          failure.run(() => input.remove());
        }
        failure.rethrow();
      }
    }
  }

  #createPrompt(pdfWindow: PdfWindow, generation: number): void {
    const prompt = pdfWindow.document.createElement('div');
    prompt.dataset.zoteroNeoFlashPrompt = '1';
    prompt.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:100001;padding:5px 8px;border:2px solid #8ab4ff;border-radius:5px;background:#172554;color:#ffffff;font:bold 12px monospace;box-shadow:0 4px 14px rgba(0,0,0,.28);pointer-events:none;';
    this.#prompt = prompt;
    try {
      pdfWindow.document.body?.appendChild(prompt);
    } finally {
      if (!this.#current(pdfWindow, generation)) {
        const failure = new CleanupFailure();
        if (generation === this.#generation) failure.run(() => this.cancel());
        if (!isDeadObject(prompt)) failure.run(() => prompt.remove());
        failure.rethrow();
      }
    }
  }

  #current(pdfWindow: PdfWindow, generation: number): boolean {
    return (
      !this.#disposed &&
      this.#generation === generation &&
      this.#window === pdfWindow &&
      !isDeadObject(pdfWindow) &&
      this.#host.isCurrent(pdfWindow) &&
      this.#viewCurrent?.() === true
    );
  }

  #visibleSegments(pdfWindow: PdfWindow): FlashTextSegment[] {
    const segments: FlashTextSegment[] = [];
    for (const { textNode, text, rect } of pdfTextSpans(pdfWindow)) {
      if (this.#rectVisible(pdfWindow, rect)) segments.push({ textNode, text });
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
