import type { ActionId } from './actions';
import type { BindingContext, BindingMap } from './bindings';
import { actionsForBindingMode } from './binding-capabilities';
import { keyString } from './keys';
import { InputRuntime } from './runtime';

export interface LocalBindingHost {
  bindings(): BindingMap;
  execute(action: ActionId, event: KeyboardEvent | null): boolean;
  schedule(callback: () => void, delayMs: number): number;
  clearTimer(timer: number | undefined): void;
  readonly timeoutMs?: number;
}

function sameBindings(left: BindingMap | null, right: BindingMap): boolean {
  if (left === right) return true;
  if (!left) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

/** Surface owners qualify text/native keys before handing an event to this matcher. */
export class LocalBindingRuntime {
  readonly #host: LocalBindingHost;
  readonly #runtime: InputRuntime;
  #context: BindingContext | null = null;
  #target: EventTarget | null = null;
  #bindings: BindingMap | null = null;
  #ownedBindings: BindingMap = {};
  #disposed = false;

  constructor(host: LocalBindingHost) {
    this.#host = host;
    this.#runtime = new InputRuntime({
      setTimeout: (callback, delay) => host.schedule(callback, delay),
      clearTimeout: (timer) => host.clearTimer(timer),
    });
  }

  handle(event: KeyboardEvent, context: BindingContext): boolean {
    if (this.#disposed) return false;
    if (
      event.isComposing ||
      event.keyCode === 229 ||
      event.key === 'Process' ||
      event.key === 'Dead'
    ) {
      this.deactivate();
      return false;
    }
    const bindings = this.#host.bindings();
    if (
      this.#context !== context ||
      this.#target !== event.target ||
      !sameBindings(this.#bindings, bindings)
    ) {
      this.deactivate();
      this.#context = context;
      this.#target = event.target;
      this.#bindings = bindings;
      const actions = actionsForBindingMode(context);
      this.#ownedBindings = Object.fromEntries(
        Object.entries(bindings).filter(
          ([key, action]) => key.startsWith(`${context}:`) && actions.includes(action),
        ),
      );
    }
    const key = keyString(event);
    if (!key) return false;
    const decision = this.#runtime.advance(context, this.#ownedBindings, key, false);
    if (decision.kind === 'pass') return false;
    if (decision.kind === 'execute') return this.#host.execute(decision.action, event);
    const delay = this.#host.timeoutMs ?? decision.timeoutMs;
    if (delay !== null) {
      this.#runtime.schedule(decision, delay, (resolved) => {
        if (resolved.kind === 'execute' && sameBindings(bindings, this.#host.bindings())) {
          this.#host.execute(resolved.action, event);
        }
      });
    }
    return true;
  }

  deactivate(): void {
    this.#runtime.reset();
    this.#context = null;
    this.#target = null;
    this.#bindings = null;
    this.#ownedBindings = {};
  }

  dispose(): void {
    this.#disposed = true;
    this.deactivate();
  }
}
