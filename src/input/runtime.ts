import type { BindingMap, Mode } from './bindings';
import {
  advanceInput,
  backspacePendingInput,
  cancelPendingInput,
  resolveInputTimeout,
  type InputDecision,
  type InputState,
} from './engine';

export interface InputTimerHost {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timer: number | undefined): void;
}

/** Owns pending input bookkeeping; the pure engine still decides what each key means. */
export class InputRuntime {
  readonly #timers: InputTimerHost;
  #keyBuffer = '';
  #countBuffer = '';
  #timer: number | undefined;
  #revision = 0;

  constructor(timers: InputTimerHost) {
    this.#timers = timers;
  }

  get keyBuffer(): string {
    return this.#keyBuffer;
  }

  get countBuffer(): string {
    return this.#countBuffer;
  }

  #state(mode: Mode): InputState {
    return { mode, keyBuffer: this.#keyBuffer, countBuffer: this.#countBuffer };
  }

  #clearTimer(): void {
    this.#timers.clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /** Replaces pending input for host-owned key grammars outside the binding engine. */
  replace(keyBuffer: string, countBuffer: string): void {
    this.#keyBuffer = keyBuffer;
    this.#countBuffer = countBuffer;
    this.#revision += 1;
    this.#clearTimer();
  }

  #arm(delayMs: number, task: () => void): void {
    this.#clearTimer();
    const revision = ++this.#revision;
    this.#timer = this.#timers.setTimeout(() => {
      if (revision !== this.#revision) return;
      this.#timer = undefined;
      task();
    }, delayMs);
  }

  cancel(mode: Mode): boolean {
    const next = cancelPendingInput(this.#state(mode));
    if (!next) return false;
    this.replace(next.keyBuffer, next.countBuffer);
    return true;
  }

  backspace(mode: Mode): boolean {
    const next = backspacePendingInput(this.#state(mode));
    if (!next) return false;
    this.replace(next.keyBuffer, next.countBuffer);
    return true;
  }

  advance(mode: Mode, bindings: BindingMap, key: string, allowCountPrefix: boolean): InputDecision {
    const decision = advanceInput({ ...this.#state(mode), bindings, allowCountPrefix }, key);
    this.replace(decision.state.keyBuffer, decision.state.countBuffer);
    return decision;
  }

  /** Arms only the current pending decision; later input, reset, or disposal invalidates it. */
  schedule(
    pending: Extract<InputDecision, { readonly kind: 'pending' }>,
    delayMs: number,
    onTimeout: (resolved: InputDecision) => void,
  ): void {
    this.#arm(delayMs, () => {
      const resolved = resolveInputTimeout(pending);
      this.#keyBuffer = resolved.state.keyBuffer;
      this.#countBuffer = resolved.state.countBuffer;
      onTimeout(resolved);
    });
  }

  /** Expires pending host-owned input without interpreting it as an Action. */
  scheduleReset(delayMs: number, onTimeout: () => void): void {
    this.#arm(delayMs, () => {
      this.reset();
      onTimeout();
    });
  }

  reset(): void {
    this.replace('', '');
  }

  dispose(): void {
    this.reset();
  }
}
