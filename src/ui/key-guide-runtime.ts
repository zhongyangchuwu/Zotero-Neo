import type { BindingMap, Mode } from '../input/bindings';
import { guideEntries, isGuidePrefix } from '../input/key-guide';
import type { KeyGuideLanguage } from '../input/key-guide-config';
import type { InputRuntime, InputTimerHost } from '../input/runtime';
import { KeyGuide, type KeyGuideThemeHost } from './key-guide';

export interface PrefixGuideView {
  readonly input: InputRuntime;
  readonly mode: Mode;
  readonly bindings: BindingMap;
  readonly enabled: boolean;
  readonly language: KeyGuideLanguage;
  readonly delayMs: number;
  readonly fontSizePx: number;
  readonly document: Document | null;
  readonly theme: KeyGuideThemeHost;
}

/** Owns one pending-prefix panel and its show timer; input state stays in InputRuntime. */
export class PrefixGuideRuntime {
  readonly #timers: InputTimerHost;
  readonly #guide = new KeyGuide();
  #timer: number | undefined;
  #generation = 0;
  #disposed = false;

  constructor(timers: InputTimerHost) {
    this.#timers = timers;
  }

  #invalidate(): number {
    this.#generation += 1;
    this.#timers.clearTimeout(this.#timer);
    this.#timer = undefined;
    return this.#generation;
  }

  /** Projects the current exact mode; delayed work cannot outlive a newer request. */
  refresh(currentView: () => PrefixGuideView): void {
    if (this.#disposed) return;
    const generation = this.#invalidate();
    const view = currentView();
    const input = view.input;
    const mode = view.mode;
    const prefix = input.keyBuffer;
    if (!view.enabled || !isGuidePrefix(view.bindings, mode, prefix)) {
      this.#guide.hide();
      return;
    }
    const entries = guideEntries(view.bindings, mode, prefix, view.language);
    if (!entries.length) {
      this.#guide.hide();
      return;
    }
    if (!view.document) return;
    if (this.#guide.visible) {
      this.#guide.show(view.document, view.theme, prefix, entries, view.fontSizePx);
      return;
    }
    this.#timer = this.#timers.setTimeout(() => {
      if (this.#disposed || generation !== this.#generation) return;
      this.#timer = undefined;
      const latest = currentView();
      if (
        latest.input !== input ||
        latest.mode !== mode ||
        latest.input.keyBuffer !== prefix ||
        !latest.enabled ||
        !latest.document ||
        !isGuidePrefix(latest.bindings, mode, prefix)
      )
        return;
      const currentEntries = guideEntries(latest.bindings, mode, prefix, latest.language);
      if (!currentEntries.length) return;
      this.#guide.show(latest.document, latest.theme, prefix, currentEntries, latest.fontSizePx);
    }, view.delayMs);
  }

  clear(): void {
    this.#invalidate();
    this.#guide.hide();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.clear();
  }
}
