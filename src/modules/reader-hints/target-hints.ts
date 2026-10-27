import { CleanupFailure } from '../../core/cleanup';
import { compositionOwnsKey } from '../../input/composition';
import { isDeadObject } from '../../platform/cross-compartment';
import { asElement, isEditableElement } from '../../platform/dom';
import { hintLabels } from '../../reader/hint-labels';
import type { PdfWindow } from '../../reader/types';

export interface ReaderHintTarget<Value> {
  readonly value: Value;
  readonly rect: readonly number[];
  readonly caption?: string;
  /** Entries with the same group remain adjacent, but keep separate confirmation labels. */
  readonly group?: string;
  readonly currentRect: () => readonly number[] | null;
}

interface HintBadge<Value> {
  readonly element: HTMLElement;
  readonly label: string;
  readonly target: ReaderHintTarget<Value>;
}
interface HintBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
interface TargetHintsHost<Value> {
  readonly attribute: 'zoteroNeoLinkHint' | 'zoteroNeoCopyHint';
  readonly isCurrent: (window: PdfWindow) => boolean;
  readonly choose: (window: PdfWindow, value: Value) => void;
  readonly failed?: (error: unknown) => void;
  readonly closed?: (reason: 'cancelled' | 'confirmed') => void;
}
const BADGE_STYLE =
  'position:fixed;z-index:99999;background:#f9e2af;color:#1e1e2e;padding:1px 3px;border:1px solid #1e1e2e;border-radius:2px;font:bold 10px monospace;line-height:1.2;pointer-events:none;';
const GAP = 3;

/** Owns transient labels and input, not candidate discovery or copy/follow policy. */
export class ReaderTargetHints<Value> {
  readonly #host: TargetHintsHost<Value>;
  #badges: HintBadge<Value>[] = [];
  #prompt: HTMLElement | null = null;
  #buffer = '';
  #window: PdfWindow | null = null;
  #frame: number | null = null;

  constructor(host: TargetHintsHost<Value>) {
    this.#host = host;
  }
  get isOpen(): boolean {
    return this.#badges.length > 0;
  }
  ownsView(window: PdfWindow): boolean {
    return this.#window === window;
  }

  open(window: PdfWindow, targets: readonly ReaderHintTarget<Value>[], prompt?: string): void {
    this.cancel();
    if (!this.#host.isCurrent(window)) return;
    this.#window = window;
    const body = window.document.body;
    if (!this.#host.isCurrent(window)) {
      this.cancel();
      return;
    }
    if (!body) throw new Error('PDF hint root unavailable');
    const labels = hintLabels(targets.length);
    const geometry = new Map<HintBadge<Value>, readonly number[]>();
    for (const [index, target] of targets.entries()) {
      const element = window.document.createElement('span');
      if (!this.#host.isCurrent(window)) {
        this.cancel();
        return;
      }
      element.dataset[this.#host.attribute] = '1';
      if (target.group) element.dataset.zoteroNeoHintGroup = target.group;
      const label = labels[index]!;
      element.textContent = target.caption ? `${label} ${target.caption}` : label;
      element.style.cssText = BADGE_STYLE;
      const badge = { element, label, target };
      this.#badges.push(badge);
      geometry.set(badge, target.rect);
      body.appendChild(element);
      if (!this.#host.isCurrent(window)) {
        const failure = new CleanupFailure();
        failure.run(() => this.cancel());
        if (!isDeadObject(element)) failure.run(() => element.remove());
        failure.rethrow();
        return;
      }
    }
    if (!this.isOpen) {
      this.cancel();
      return;
    }
    if (prompt) {
      const element = window.document.createElement('span');
      if (!this.#host.isCurrent(window)) {
        this.cancel();
        return;
      }
      this.#prompt = element;
      element.dataset.zoteroNeoHintPrompt = '1';
      element.textContent = prompt;
      element.style.cssText = `${BADGE_STYLE}top:4px;right:4px;padding:3px 6px;`;
      body.appendChild(element);
      if (!this.#host.isCurrent(window)) {
        const failure = new CleanupFailure();
        failure.run(() => this.cancel());
        if (!isDeadObject(element)) failure.run(() => element.remove());
        failure.rethrow();
        return;
      }
    }
    if (!this.#host.isCurrent(window)) {
      this.cancel();
      return;
    }
    this.#layout(window, geometry);
  }

  handleKey(event: KeyboardEvent, window: PdfWindow): boolean {
    if (
      !this.ownsView(window) ||
      isDeadObject(window) ||
      !this.#host.isCurrent(window) ||
      isEditableElement(asElement(event.target))
    ) {
      this.cancel();
      return false;
    }
    if (compositionOwnsKey(event, false)) return true;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      this.cancel();
      window.focus();
      return true;
    }
    if (event.key === 'Backspace') {
      this.#buffer = this.#buffer.slice(0, -1);
      this.#refresh(window);
      return true;
    }
    if (
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      !/^[a-z]$/i.test(event.key)
    )
      return true;
    this.#refresh(window);
    const next = `${this.#buffer}${event.key.toUpperCase()}`;
    const matches = this.#badges.filter(
      (badge) => !badge.element.hidden && badge.label.startsWith(next),
    );
    if (!matches.length) {
      this.#buffer = '';
      this.#refresh(window);
      return true;
    }
    this.#buffer = next;
    const exact = matches.find((badge) => badge.label === next);
    if (exact || matches.length === 1) {
      const value = (exact ?? matches[0]!).target.value;
      this.cancel('confirmed');
      this.#host.choose(window, value);
    } else this.#refresh(window);
    return true;
  }

  onViewportChange(window: PdfWindow): void {
    if (!this.ownsView(window) || isDeadObject(window)) return;
    if (!this.#host.isCurrent(window)) {
      this.cancel();
      return;
    }
    if (this.#frame !== null) return;
    const badges = this.#badges;
    const frame = window.requestAnimationFrame(() => {
      if (this.#badges !== badges || !this.ownsView(window) || isDeadObject(window)) return;
      if (!this.#host.isCurrent(window)) {
        this.cancel();
        return;
      }
      this.#frame = null;
      this.#refresh(window);
    });
    if (this.#badges !== badges || !this.ownsView(window) || !this.#host.isCurrent(window)) {
      const failure = new CleanupFailure();
      if (this.#badges === badges && this.ownsView(window)) failure.run(() => this.cancel());
      if (!isDeadObject(window)) failure.run(() => window.cancelAnimationFrame(frame));
      failure.rethrow();
      return;
    }
    this.#frame = frame;
  }

  /** Retires all owners before attempting every live DOM/frame cleanup. */
  cancel(reason: 'cancelled' | 'confirmed' = 'cancelled'): void {
    const badges = this.#badges,
      owner = this.#window,
      frame = this.#frame,
      prompt = this.#prompt;
    this.#badges = [];
    this.#prompt = null;
    this.#window = null;
    this.#buffer = '';
    this.#frame = null;
    const failure = new CleanupFailure();
    if (owner) failure.run(() => this.#host.closed?.(reason));
    if (owner && !isDeadObject(owner) && frame !== null)
      failure.run(() => owner.cancelAnimationFrame(frame));
    if (prompt)
      failure.run(() => {
        if (!isDeadObject(prompt)) prompt.remove();
      });
    for (const badge of badges)
      failure.run(() => {
        if (!isDeadObject(badge.element)) badge.element.remove();
      });
    failure.rethrow();
  }

  #refresh(window: PdfWindow): void {
    let cleanupStarted = false;
    try {
      if (!this.#host.isCurrent(window)) {
        cleanupStarted = true;
        this.cancel();
        return;
      }
      const width = window.innerWidth || window.document.documentElement.clientWidth;
      const height = window.innerHeight || window.document.documentElement.clientHeight;
      const badges = this.#badges;
      const geometry = new Map<HintBadge<Value>, readonly number[]>();
      const resolved = new Map<ReaderHintTarget<Value>['currentRect'], readonly number[] | null>();
      for (const badge of badges) {
        if (this.#badges !== badges || !this.#host.isCurrent(window)) {
          cleanupStarted = true;
          this.cancel();
          return;
        }
        const getter = badge.target.currentRect;
        if (!resolved.has(getter)) {
          const rect = getter();
          if (this.#badges !== badges || !this.#host.isCurrent(window)) {
            cleanupStarted = true;
            this.cancel();
            return;
          }
          resolved.set(getter, rect);
        }
        const rect = resolved.get(getter);
        const visible =
          !!rect && rect[2]! > 0 && rect[3]! > 0 && rect[0]! < width && rect[1]! < height;
        badge.element.hidden = !visible || !badge.label.startsWith(this.#buffer);
        if (visible && rect) geometry.set(badge, rect);
      }
      if (this.#badges !== badges || !this.#host.isCurrent(window)) {
        cleanupStarted = true;
        this.cancel();
        return;
      }
      this.#layout(window, geometry);
    } catch (error) {
      if (cleanupStarted) throw error;
      const active = this.#host.isCurrent(window);
      const failure = new CleanupFailure();
      failure.run(() => this.cancel());
      if (active) failure.run(() => this.#host.failed?.(error));
      failure.rethrow();
    }
  }

  /** Measures rendered labels, keeps related roles together and shifts colliding groups vertically. */
  #layout(window: PdfWindow, geometry: ReadonlyMap<HintBadge<Value>, readonly number[]>): void {
    const badges = this.#badges;
    if (!this.#host.isCurrent(window)) return;
    const groups = new Map<
      string | HintBadge<Value>,
      { rect: readonly number[]; badges: HintBadge<Value>[] }
    >();
    for (const badge of badges) {
      const rect = geometry.get(badge);
      if (!rect || badge.element.hidden) continue;
      const key = badge.target.group ?? badge;
      const group = groups.get(key);
      if (group) group.badges.push(badge);
      else groups.set(key, { rect, badges: [badge] });
    }
    const width = window.innerWidth || window.document.documentElement.clientWidth;
    const height = window.innerHeight || window.document.documentElement.clientHeight;
    const placed: HintBox[] = [];
    if (this.#prompt) {
      const rect = this.#prompt.getBoundingClientRect();
      placed.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }
    for (const { rect, badges: groupBadges } of groups.values()) {
      const sizes = groupBadges.map((badge) => badge.element.getBoundingClientRect());
      const groupWidth =
        sizes.reduce((sum, size) => sum + size.width, 0) + GAP * (sizes.length - 1);
      const groupHeight = Math.max(...sizes.map((size) => size.height));
      const box = placeHintGroup(
        rect[0]!,
        rect[1]! - groupHeight - 2,
        groupWidth,
        groupHeight,
        width,
        height,
        placed,
      );
      if (!box) throw new Error('Hint labels do not fit in this view');
      if (this.#badges !== badges || !this.#host.isCurrent(window)) return;
      const { left, top } = box;
      let x = left;
      groupBadges.forEach((badge, index) => {
        badge.element.style.left = `${x}px`;
        badge.element.style.top = `${top}px`;
        x += sizes[index]!.width + GAP;
      });
      placed.push(box);
    }
  }
}

/** Prefer the source's column, then nearby free columns; never clamp onto an occupied slot. */
function placeHintGroup(
  anchorLeft: number,
  anchorTop: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  placed: readonly HintBox[],
): HintBox | null {
  if (
    ![width, height, viewportWidth, viewportHeight].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    width > viewportWidth ||
    height > viewportHeight
  )
    return null;
  const preferredLeft = Math.max(0, Math.min(anchorLeft, viewportWidth - width));
  const preferredTop = Math.max(0, Math.min(anchorTop, viewportHeight - height));
  const columns = new Set([preferredLeft, 0, viewportWidth - width]);
  for (const box of placed) {
    columns.add(box.left + box.width + GAP);
    columns.add(box.left - width - GAP);
  }
  const candidates = [...columns]
    .filter((left) => left >= 0 && left + width <= viewportWidth)
    .sort((left, right) => Math.abs(left - preferredLeft) - Math.abs(right - preferredLeft));
  const ordered = [...placed].sort((left, right) => left.top - right.top);
  for (const left of candidates) {
    let start = 0;
    let bestTop: number | null = null;
    let bestDistance = Infinity;
    const consider = (end: number): void => {
      if (end - start < height) return;
      const top = Math.max(start, Math.min(preferredTop, end - height));
      const distance = Math.abs(top - preferredTop);
      if (distance < bestDistance) {
        bestTop = top;
        bestDistance = distance;
      }
    };
    for (const obstacle of ordered) {
      if (left >= obstacle.left + obstacle.width + GAP || left + width + GAP <= obstacle.left)
        continue;
      consider(Math.min(viewportHeight, obstacle.top - GAP));
      start = Math.max(start, Math.min(viewportHeight, obstacle.top + obstacle.height + GAP));
    }
    consider(viewportHeight);
    if (bestTop !== null) return { left, top: bestTop, width, height };
  }
  return null;
}
