import type { ActionId } from '../input/actions';
import { parseBindingKey, type BindingContext, type BindingMap } from '../input/bindings';
import { actionsForBindingMode } from '../input/binding-capabilities';
import {
  BUILTIN_MODULES,
  actionContribution,
  validateBuiltinModules,
  type BuiltinModuleId,
  type ModuleHostKind,
} from '../modules';
import type { Cleanup } from './cleanup';
import { reportDiagnosticError, type Logger } from './logging';
import { ModuleHost } from './module-host';
import type { PreferenceReader } from './preferences';

export type ModuleFlags = Readonly<Record<BuiltinModuleId, boolean>>;
export type ModuleStatus = 'enabled' | 'disabled' | 'blocked' | 'failed' | 'pending';
export interface ModuleInstanceState {
  readonly host: ModuleHostKind;
  readonly status: ModuleStatus;
  readonly dependencyIds: readonly BuiltinModuleId[];
  readonly failure: string | null;
}
export interface ModuleSettingsState {
  readonly id: BuiltinModuleId;
  readonly applied: boolean;
  readonly requested: boolean;
  readonly pendingRestart: boolean;
  readonly status: ModuleStatus;
  readonly dependencyIds: readonly BuiltinModuleId[];
  readonly instances: readonly ModuleInstanceState[];
}
interface Activation {
  attempted: boolean;
  status: ModuleStatus;
  failure: string | null;
}
export function modulePreferenceKey(id: BuiltinModuleId): string {
  return `modules.${id}.enabled`;
}

/** One immutable applied graph per Neo startup; preference edits only change requested flags. */
export class BuiltinModuleRuntime {
  readonly applied: ModuleFlags;
  readonly #preferences: PreferenceReader;
  readonly logger: Logger;
  readonly #scopes = new Set<BuiltinModuleScope>();
  readonly #listeners = new Set<() => void>();
  #notifying = false;
  #changed = false;
  #revision = 0;

  get revision(): number {
    return this.#revision;
  }

  constructor(preferences: PreferenceReader, logger: Logger, applied?: ModuleFlags) {
    validateBuiltinModules(BUILTIN_MODULES);
    this.#preferences = preferences;
    this.logger = logger;
    this.applied = Object.freeze(applied ?? this.requested());
  }

  requested(): ModuleFlags {
    return Object.fromEntries(
      BUILTIN_MODULES.map(({ id }) => [
        id,
        this.#preferences.get(modulePreferenceKey(id), true) === true,
      ]),
    ) as Record<BuiltinModuleId, boolean>;
  }

  /** Includes transitive disabled dependencies without changing any persisted request. */
  blocked(id: BuiltinModuleId, flags: ModuleFlags = this.applied): BuiltinModuleId[] {
    const missing = new Set<BuiltinModuleId>();
    const visit = (current: BuiltinModuleId): void => {
      const description = BUILTIN_MODULES.find((entry) => entry.id === current)!;
      for (const dependency of description.requires) {
        if (!flags[dependency]) missing.add(dependency);
        visit(dependency);
      }
    };
    visit(id);
    return [...missing];
  }

  /**
   * Registers one host lifetime. mainOwner owns dependencies and Settings inspection;
   * mainForContribution may resolve a different actual receiver for a named Main action.
   */
  createScope(
    kind: ModuleHostKind,
    identity: object,
    isCurrent: () => boolean,
    mainOwner?: () => object | null,
    mainForContribution?: (context: BindingContext, action: ActionId) => object | null,
  ): BuiltinModuleScope {
    const scope = new BuiltinModuleScope(
      this,
      kind,
      identity,
      isCurrent,
      mainOwner,
      mainForContribution,
    );
    this.#scopes.add(scope);
    this.changed();
    return scope;
  }

  mainScope(identity: object | null): BuiltinModuleScope | null {
    if (!identity) return null;
    for (const scope of this.#scopes)
      if (scope.kind === 'main' && scope.identity === identity && scope.isCurrent()) return scope;
    return null;
  }

  remove(scope: BuiltinModuleScope): void {
    this.#scopes.delete(scope);
    this.changed();
  }

  subscribe(listener: () => void): Cleanup {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Notifies observers after current host availability changes. */
  changed(): void {
    this.#revision += 1;
    this.#changed = true;
    if (this.#notifying) return;
    this.#notifying = true;
    try {
      while (this.#changed) {
        this.#changed = false;
        for (const listener of [...this.#listeners]) {
          if (!this.#listeners.has(listener)) continue;
          try {
            listener();
          } catch (error) {
            reportDiagnosticError(this.logger, 'Module availability observer failed', error);
          }
        }
      }
    } finally {
      this.#notifying = false;
    }
  }

  inspect(owner: object): ModuleSettingsState[] {
    const requested = this.requested();
    return BUILTIN_MODULES.map(({ id }) => {
      const instances = [...this.#scopes]
        .filter(
          (scope) =>
            scope.isCurrent() &&
            (scope.kind === 'main' ? scope.identity === owner : scope.mainOwner() === owner),
        )
        .filter((scope) => scope.supports(id))
        .map((scope) => scope.state(id));
      const dependencyIds = this.blocked(id);
      const status: ModuleStatus = !this.applied[id]
        ? 'disabled'
        : dependencyIds.length
          ? 'blocked'
          : instances.some((entry) => entry.status === 'failed')
            ? 'failed'
            : instances.some((entry) => entry.status === 'blocked')
              ? 'blocked'
              : instances.some((entry) => entry.status === 'enabled')
                ? 'enabled'
                : 'pending';
      return {
        id,
        applied: this.applied[id],
        requested: requested[id],
        pendingRestart: this.applied[id] !== requested[id],
        status,
        dependencyIds: [
          ...new Set([...dependencyIds, ...instances.flatMap((entry) => entry.dependencyIds)]),
        ],
        instances,
      };
    });
  }
}

/** Base-owned attachment state; modules still receive only their existing named ports. */
export class BuiltinModuleScope {
  readonly host: ModuleHost;
  readonly #runtime: BuiltinModuleRuntime;
  readonly #ownerIsCurrent: () => boolean;
  readonly #mainOwner: () => object | null;
  readonly #mainForContribution: (context: BindingContext, action: ActionId) => object | null;
  readonly #activations = new Map<BuiltinModuleId, Activation>();
  #disposed = false;
  #bindingCache: {
    source: BindingMap;
    revision: number;
    filtered: BindingMap;
    receivers: readonly (readonly [BindingContext, ActionId, object | null])[];
  } | null = null;

  constructor(
    runtime: BuiltinModuleRuntime,
    readonly kind: ModuleHostKind,
    readonly identity: object,
    isCurrent: () => boolean,
    mainOwner?: () => object | null,
    mainForContribution?: (context: BindingContext, action: ActionId) => object | null,
  ) {
    this.#runtime = runtime;
    this.#ownerIsCurrent = isCurrent;
    this.#mainOwner = mainOwner ?? (() => (kind === 'main' ? identity : null));
    this.#mainForContribution = mainForContribution ?? this.#mainOwner;
    this.host = new ModuleHost(runtime.logger, () => this.isCurrent());
  }

  isCurrent(): boolean {
    return !this.#disposed && this.#ownerIsCurrent();
  }
  mainOwner(): object | null {
    return this.#mainOwner();
  }
  supports(id: BuiltinModuleId): boolean {
    return BUILTIN_MODULES.find((entry) => entry.id === id)!.hosts.includes(this.kind);
  }

  state(id: BuiltinModuleId): ModuleInstanceState {
    const activation = this.#activations.get(id);
    if (!this.#runtime.applied[id])
      return { host: this.kind, status: 'disabled', dependencyIds: [], failure: null };
    if (activation?.status === 'failed')
      return { host: this.kind, status: 'failed', dependencyIds: [], failure: activation.failure };
    const dependencyIds = this.#runtime.blocked(id);
    return {
      host: this.kind,
      status: dependencyIds.length ? 'blocked' : (activation?.status ?? 'pending'),
      dependencyIds,
      failure: activation?.failure ?? null,
    };
  }

  enabled(id: BuiltinModuleId): boolean {
    return this.isCurrent() && this.#activations.get(id)?.status === 'enabled';
  }

  canActivate(id: BuiltinModuleId): boolean {
    return (
      this.isCurrent() &&
      this.supports(id) &&
      this.#runtime.applied[id] &&
      !this.#activations.get(id)?.attempted &&
      this.#runtime.blocked(id).length === 0
    );
  }

  /** A failed factory is isolated and never retried in this scope; ModuleHost rolls back acquisitions. */
  activate<Api>(id: BuiltinModuleId, create: () => Api): Api | null {
    if (!this.canActivate(id)) return null;
    const activation: Activation = { attempted: true, status: 'pending', failure: null };
    this.#activations.set(id, activation);
    let result: Api | null = null;
    try {
      result = create();
      if (this.isCurrent()) activation.status = 'enabled';
      else {
        this.host.release(id);
        result = null;
      }
    } catch (error) {
      activation.status = 'failed';
      result = null;
      try {
        this.host.release(id);
      } catch (cleanupError) {
        reportDiagnosticError(
          this.#runtime.logger,
          `Module ${id} activation cleanup failed`,
          cleanupError,
        );
      }
      try {
        activation.failure = String(error);
      } catch {
        activation.failure = 'Activation failed';
      }
      reportDiagnosticError(
        this.#runtime.logger,
        `Module ${id} activation failed (${this.kind})`,
        error,
      );
    }
    this.#runtime.changed();
    return result;
  }

  available(context: BindingContext, action: ActionId): boolean {
    if (context === 'reader-select' && !this.enabled('reader-selection')) return false;
    if (context === 'main-select' && !this.enabled('worksets')) return false;
    if ((context === 'note-normal' || context === 'note-insert') && !this.enabled('notes'))
      return false;
    const contribution = actionContribution(context, action);
    if (!contribution) return this.isCurrent() && actionsForBindingMode(context).includes(action);
    const scope =
      contribution.host === this.kind
        ? this
        : contribution.host === 'main'
          ? this.#runtime.mainScope(this.#mainForContribution(context, action))
          : null;
    return !!scope?.enabled(contribution.module) && scope.host.hasAction(context, action);
  }

  /** Rebuilds only when bindings or actual host availability change, before input prefix matching. */
  filterBindings(bindings: BindingMap): BindingMap {
    const revision = this.#runtime.revision;
    const cache = this.#bindingCache;
    if (cache?.source === bindings && cache.revision === revision) {
      let current = true;
      for (const [context, action, owner] of cache.receivers) {
        if (this.#mainForContribution(context, action) !== owner) {
          current = false;
          break;
        }
      }
      if (current) return cache.filtered;
    }
    const filtered: Record<string, ActionId> = {};
    const receivers: (readonly [BindingContext, ActionId, object | null])[] = [];
    for (const [key, action] of Object.entries(bindings)) {
      const parsed = parseBindingKey(key);
      if (
        parsed &&
        this.kind !== 'main' &&
        actionContribution(parsed.mode, action)?.host === 'main'
      )
        receivers.push([parsed.mode, action, this.#mainForContribution(parsed.mode, action)]);
      if (parsed && this.available(parsed.mode, action)) filtered[key] = action;
    }
    const result = Object.freeze(filtered);
    this.#bindingCache = { source: bindings, revision, filtered: result, receivers };
    return result;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      this.host.dispose();
    } finally {
      this.#runtime.remove(this);
    }
  }
}
