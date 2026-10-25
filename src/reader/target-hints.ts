import { CleanupFailure } from '../core/cleanup';
import { compositionOwnsKey } from '../input/composition';
import { isDeadObject } from '../platform/cross-compartment';
import { asElement, isEditableElement } from '../platform/dom';
import { hintLabels } from './hint-labels';
import type { PdfWindow } from './types';

export interface ReaderHintTarget<Value> {
  readonly value: Value;
  readonly rect: readonly number[];
  /** Revalidates source identity and geometry before a label can be confirmed. */
  readonly currentRect: () => readonly number[] | null;
}

interface HintBadge<Value> {
  readonly element: HTMLElement;
  readonly label: string;
  readonly target: ReaderHintTarget<Value>;
}

interface TargetHintsHost<Value> {
  readonly attribute: 'zoteroNeoLinkHint' | 'zoteroNeoIdentifierHint';
  readonly isCurrent: (window: PdfWindow) => boolean;
  readonly choose: (window: PdfWindow, value: Value) => void;
  readonly failed?: (error: unknown) => void;
  readonly closed?: () => void;
}

/** Transient label/input/geometry ownership only; discovery and action policy stay with callers. */
export class ReaderTargetHints<Value> {
  readonly #host: TargetHintsHost<Value>;
  #badges: HintBadge<Value>[] = [];
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

  open(window: PdfWindow, targets: readonly ReaderHintTarget<Value>[]): void {
    this.cancel();
    this.#window = window;
    const labels = hintLabels(targets.length);
    for (const [index, target] of targets.entries()) {
      const element = window.document.createElement('span');
      element.dataset[this.#host.attribute] = '1';
      const label = labels[index]!;
      element.textContent = label;
      element.style.cssText =
        'position:fixed;z-index:99999;background:#f9e2af;color:#1e1e2e;padding:1px 3px;border:1px solid #1e1e2e;border-radius:2px;font:bold 10px monospace;line-height:1.2;pointer-events:none;';
      this.#position(element, target.rect);
      this.#badges.push({ element, label, target });
      window.document.body?.appendChild(element);
    }
    if (!this.isOpen) this.cancel();
  }

  handleKey(event: KeyboardEvent, window: PdfWindow): boolean {
    if (
      !this.ownsView(window) ||
      isDeadObject(window) ||
      isEditableElement(asElement(event.target)) ||
      !this.#host.isCurrent(window)
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
    if (!/^[a-z]$/i.test(event.key)) return true;
    // Source ranges may have disappeared since the last viewport notification.
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
      this.cancel();
      this.#host.choose(window, value);
    } else {
      this.#refresh(window);
    }
    return true;
  }

  onViewportChange(window: PdfWindow): void {
    if (!this.ownsView(window) || isDeadObject(window) || this.#frame !== null) return;
    const badges = this.#badges;
    this.#frame = window.requestAnimationFrame(() => {
      if (this.#badges !== badges || !this.ownsView(window) || isDeadObject(window)) return;
      this.#frame = null;
      this.#refresh(window);
    });
  }

  /** Retires queued frames before removing any content-realm DOM. */
  cancel(): void {
    const badges = this.#badges;
    const owner = this.#window;
    const frame = this.#frame;
    this.#badges = [];
    this.#window = null;
    this.#buffer = '';
    this.#frame = null;
    const failure = new CleanupFailure();
    if (owner) failure.run(() => this.#host.closed?.());
    if (owner && !isDeadObject(owner) && frame !== null)
      failure.run(() => owner.cancelAnimationFrame(frame));
    for (const badge of badges) {
      failure.run(() => {
        if (!isDeadObject(badge.element)) badge.element.remove();
      });
    }
    failure.rethrow();
  }

  #refresh(window: PdfWindow): void {
    try {
      if (!this.#host.isCurrent(window)) {
        this.cancel();
        return;
      }
      const width = window.innerWidth || window.document.documentElement.clientWidth;
      const height = window.innerHeight || window.document.documentElement.clientHeight;
      for (const badge of this.#badges) {
        const rect = badge.target.currentRect();
        const visible =
          !!rect && rect[2]! > 0 && rect[3]! > 0 && rect[0]! < width && rect[1]! < height;
        badge.element.hidden = !visible || !badge.label.startsWith(this.#buffer);
        if (rect) this.#position(badge.element, rect);
      }
    } catch (error) {
      this.cancel();
      this.#host.failed?.(error);
    }
  }

  #position(element: HTMLElement, rect: readonly number[]): void {
    element.style.left = `${Math.max(0, rect[0]!)}px`;
    element.style.top = `${Math.max(0, rect[1]! - 14)}px`;
  }
}
