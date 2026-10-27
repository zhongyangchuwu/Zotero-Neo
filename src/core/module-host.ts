import { CleanupFailure, CleanupScope, type Cleanup } from './cleanup';
import { reportDiagnosticError, type Logger } from './logging';
import type { ActionId } from '../input/actions';
import type { BindingContext } from '../input/bindings';

/** A module owns this child lifetime, never the containing window or another module. */
export interface ModuleScope {
  readonly id: string;
  isCurrent(): boolean;
  add(cleanup: Cleanup): Cleanup;
}

class ModuleLifetime implements ModuleScope {
  readonly #cleanup = new CleanupScope();
  readonly #failure = new CleanupFailure();
  readonly #logger: Logger;
  readonly #ownerIsCurrent: () => boolean;
  #retired = false;
  #disposed = false;

  constructor(
    readonly id: string,
    logger: Logger,
    ownerIsCurrent: () => boolean,
  ) {
    this.#logger = logger;
    this.#ownerIsCurrent = ownerIsCurrent;
  }

  isCurrent(): boolean {
    return !this.#retired && this.#ownerIsCurrent();
  }

  /** Releases late acquisitions immediately and makes every returned disposer one-shot. */
  add(cleanup: Cleanup): Cleanup {
    let pending = true;
    const release = (): void => {
      if (!pending) return;
      pending = false;
      try {
        cleanup();
      } catch (error) {
        reportDiagnosticError(this.#logger, `Module ${this.id} cleanup failed`, error);
        this.#failure.run(() => {
          throw error;
        });
        throw error;
      }
    };
    this.#cleanup.add(release);
    return release;
  }

  retire(): void {
    this.#retired = true;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.retire();
    this.#cleanup.dispose();
    this.#failure.rethrow();
  }
}

/**
 * One host lifetime for statically composed modules. Typed invokers retain payload ownership;
 * the host only enforces contribution identity and retirement, not business dispatch policy.
 */
export class ModuleHost {
  readonly #modules = new Map<string, ModuleLifetime>();
  readonly #actions = new Map<BindingContext, Map<ActionId, object>>();
  readonly #logger: Logger;
  readonly #ownerIsCurrent: () => boolean;
  #disposed = false;

  constructor(logger: Logger, ownerIsCurrent: () => boolean) {
    this.#logger = logger;
    this.#ownerIsCurrent = ownerIsCurrent;
  }

  activate<Api>(id: string, activate: (scope: ModuleScope) => Api): Api {
    if (this.#disposed) throw new Error('Module host is disposed');
    if (this.#modules.has(id)) throw new Error(`Module already attached: ${id}`);
    const scope = new ModuleLifetime(
      id,
      this.#logger,
      () => !this.#disposed && this.#ownerIsCurrent(),
    );
    this.#modules.set(id, scope);
    try {
      return activate(scope);
    } catch (error) {
      scope.retire();
      this.#modules.delete(id);
      try {
        scope.dispose();
      } catch {
        // Each failed release is already diagnosed; retain the original activation error.
      }
      throw error;
    }
  }

  /** Contributes an existing command/context pair and returns its payload-typed invocation. */
  bind<Request>(
    scope: ModuleScope,
    context: BindingContext,
    action: ActionId,
    run: (request: Request) => void,
  ): (request: Request) => boolean {
    if (this.#disposed || this.#modules.get(scope.id) !== scope)
      throw new Error(`Module is not attached: ${scope.id}`);
    let actions = this.#actions.get(context);
    if (!actions) {
      actions = new Map();
      this.#actions.set(context, actions);
    }
    if (actions.has(action)) throw new Error(`Action already contributed: ${context}:${action}`);
    const registrations = actions;
    const registration = {};
    registrations.set(action, registration);
    scope.add(() => {
      if (registrations.get(action) === registration) registrations.delete(action);
      if (!registrations.size && this.#actions.get(context) === registrations)
        this.#actions.delete(context);
    });
    return (request) => {
      if (!scope.isCurrent() || registrations.get(action) !== registration) return false;
      run(request);
      return true;
    };
  }

  /** Retires every callback before any module cleanup can re-enter another contribution. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const scope of this.#modules.values()) scope.retire();
    this.#actions.clear();
    const failure = new CleanupFailure();
    for (const scope of this.#modules.values()) failure.run(() => scope.dispose());
    this.#modules.clear();
    failure.rethrow();
  }
}
