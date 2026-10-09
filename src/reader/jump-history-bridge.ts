import type { ReaderJumpLocation, ReaderJumpPosition } from '../core/contracts';
import type {
  HistoryDecision,
  NavigationAttempt,
  NavigationOutcome,
  NavigationPort,
} from '../navigation/types';
import { cloneIntoWithFunctions, nativeObjectIdentity } from '../platform/cross-compartment';
import { ReaderJumpHostAdapter } from './jump-host';
import type {
  PdfWindow,
  ReaderFindControllerRuntime,
  ReaderPdfHistoryRuntime,
  ReaderRuntime,
  ReaderViewRuntime,
} from './types';

interface ReaderLinkServiceRuntime {
  goToDestination?: (...args: unknown[]) => unknown;
  navigateTo?: (...args: unknown[]) => unknown;
  setHash?: (...args: unknown[]) => unknown;
}

type NativeMethod = (...args: unknown[]) => unknown;

interface MethodPatch {
  readonly target: object;
  readonly key: string;
  readonly original: NativeMethod;
  readonly wrapper: NativeMethod;
  readonly hadOwnProperty: boolean;
}

interface ReaderHistoryPatch {
  readonly history: ReaderPdfHistoryRuntime;
  readonly original: NonNullable<ReaderPdfHistoryRuntime['save']>;
  readonly wrapper: NonNullable<ReaderPdfHistoryRuntime['save']>;
  readonly hadOwnProperty: boolean;
}

interface OwnedScope {
  readonly attempt: NavigationAttempt | null;
  readonly policy: HistoryDecision;
  readonly isCurrent: () => boolean;
  readonly view: ReaderViewRuntime;
  readonly window: Window | undefined;
  readonly source: ReaderJumpLocation | null;
  readonly origin: ReaderJumpPosition | null;
  readonly hardDestinations: ReaderJumpLocation[] | null;
  readonly pending: Set<Promise<void>>;
  abort?: Promise<void>;
  resolveAbort?: () => void;
  searchCompletion?: Promise<NavigationOutcome>;
  resolveSearch?(outcome: NavigationOutcome): void;
  searchOutcome?: NavigationOutcome;
  searchNavigationStarted?: boolean;
  searchResolved?: boolean;
  searchRequestSeen?: boolean;
  finishing: boolean;
  running: boolean;
  closed: boolean;
  disposed: boolean;
  ambiguous: boolean;
  cleanups?: Set<() => void>;
  error: unknown;
  producerCount: number;
  hardPointCount: number;
}

interface NavigationInvocation {
  readonly scope: OwnedScope | null;
  readonly source: ReaderJumpLocation | null;
}

interface ProducerTicket {
  readonly scope: OwnedScope | null;
  readonly view: ReaderViewRuntime;
  readonly window: Window | undefined;
  readonly history: ReaderPdfHistoryRuntime | undefined;
  readonly patch: ReaderViewPatch | undefined;
  readonly source: ReaderJumpLocation | null;
  awaitingHardPoint: boolean;
  ambiguous: boolean;
  destination: ReaderJumpLocation | null;
  settled: boolean;
}

interface HardEmission {
  readonly window: Window;
  readonly history: ReaderPdfHistoryRuntime;
  readonly patch: ReaderViewPatch;
  readonly location: unknown;
  consumed: boolean;
}

interface ReaderViewPatch {
  readonly window: Window | undefined;
  readonly methods: MethodPatch[];
  readonly histories: ReaderHistoryPatch[];
  history?: ReaderPdfHistoryRuntime;
  findController?: ReaderFindControllerRuntime;
  linkService?: object;
}

interface ReaderLinkInvocation {
  readonly scope: OwnedScope | null;
  navigationStarted: boolean;
}

interface ReaderTabsRuntime {
  readonly selectedID?: string;
  readonly _tabs?: readonly { readonly id?: string; readonly type?: string }[];
}

interface ReaderOwnerWindowRuntime {
  readonly Zotero_Tabs?: ReaderTabsRuntime;
}

export interface ReaderNativeNavigation {
  readonly policy: HistoryDecision;
  isCurrent(): boolean;
  capture(): ReaderJumpLocation | null;
  bindRequest(location: object): void;
  navigate(location: object, options?: object): unknown;
  runNative<T>(perform: () => T): T;
  waitForSearch(): Promise<NavigationOutcome>;
  waitForView(): Promise<boolean>;
  hasMoved(): boolean | null;
}

export interface ReaderOwnedNavigation extends ReaderNativeNavigation {
  readonly attempt: NavigationAttempt;
}

export interface ReaderOwnedCompletion {
  readonly source: ReaderJumpLocation | null;
  readonly hardDestination: ReaderJumpLocation | null;
  readonly producerCount: number;
  readonly hardPointCount: number;
  readonly current: boolean;
  readonly ambiguous: boolean;
  readonly error: unknown;
}

export interface ReaderJumpHistoryBridgeDependencies {
  readonly reader: ReaderRuntime;
  readonly host: ReaderJumpHostAdapter;
  readonly navigation: () => NavigationPort | null;
  readonly debug: (message: string) => void;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return false;
  try {
    return typeof Reflect.get(value, 'then') === 'function';
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function safelyCurrent(isCurrent: () => boolean): boolean {
  try {
    return isCurrent();
  } catch {
    return false;
  }
}

function nativeIdentity(value: unknown): object | null {
  if (!isObject(value)) return null;
  try {
    return nativeObjectIdentity(value);
  } catch {
    return value;
  }
}

/**
 * Carries immutable Reader execution ownership to the native hard-point producer. Raw save
 * observation updates only the adapter baseline; commit eligibility comes from a completed,
 * uniquely-associated producer ticket or an explicitly managed Reader result.
 */
export class ReaderJumpHistoryBridge {
  readonly #dependencies: ReaderJumpHistoryBridgeDependencies;
  readonly #patches = new Map<ReaderViewRuntime, ReaderViewPatch>();
  readonly #ownedRequests = new WeakMap<object, OwnedScope>();
  readonly #currentOwners = new WeakMap<ReaderViewRuntime, OwnedScope>();
  readonly #currentInvocations = new WeakMap<ReaderViewRuntime, NavigationInvocation>();
  readonly #labelContinuations = new WeakMap<ReaderViewRuntime, NavigationInvocation>();
  readonly #labelPromises = new WeakMap<object, PromiseLike<unknown>>();
  readonly #invocations = new WeakMap<ReaderViewRuntime, Set<NavigationInvocation>>();
  readonly #currentProducers = new WeakMap<ReaderViewRuntime, ProducerTicket>();
  readonly #hardEmissions = new WeakMap<ReaderViewRuntime, HardEmission>();
  readonly #scopes = new Set<OwnedScope>();
  readonly #commandOwners = new WeakMap<ReaderViewRuntime, OwnedScope>();
  readonly #searchFrames = new WeakMap<ReaderViewRuntime, OwnedScope | null>();
  readonly #searchFrameViews = new WeakSet<ReaderViewRuntime>();
  readonly #findRequests = new WeakMap<object, OwnedScope>();
  readonly #searchByView = new WeakMap<
    ReaderViewRuntime,
    { readonly state: object; readonly scope: OwnedScope }
  >();
  readonly #linkFrames = new WeakMap<ReaderViewRuntime, ReaderLinkInvocation>();
  readonly #searchSeams = new WeakSet<ReaderFindControllerRuntime>();
  readonly #baselines = new WeakMap<ReaderViewRuntime, unknown>();
  #disposed = false;

  constructor(dependencies: ReaderJumpHistoryBridgeDependencies) {
    this.#dependencies = dependencies;
  }

  sync(): void {
    if (this.#disposed) return;
    const internal = this.#dependencies.reader._internalReader;
    const primary = internal?._primaryView;
    const secondary = internal?._secondaryView;
    for (const view of this.#patches.keys()) {
      if (view !== primary && view !== secondary) this.#restore(view);
    }
    if (primary) this.#patch(primary);
    if (secondary && secondary !== primary) this.#patch(secondary);
  }

  /** Runs an owned adapter and waits only for the native/managed children it actually starts. */
  runOwned<T>(
    view: ReaderViewRuntime,
    attempt: NavigationAttempt,
    perform: (navigation: ReaderOwnedNavigation) => T,
    finish: (
      value: Awaited<T>,
      completion: ReaderOwnedCompletion,
    ) => NavigationOutcome | Promise<NavigationOutcome>,
  ): Promise<NavigationOutcome> {
    const scope = this.#createScope(
      view,
      attempt,
      attempt.policy,
      () => safelyCurrent(attempt.isCurrent),
      attempt.policy.kind === 'record',
      true,
    );
    return this.#runScoped(scope, this.#createNavigation(scope, attempt), perform, finish);
  }

  /** Runs a native host callback without a Main owner or any history capture/recording. */
  runDetached<T>(
    view: ReaderViewRuntime,
    isCurrent: () => boolean,
    perform: (navigation: ReaderNativeNavigation) => T,
    finish: (
      value: Awaited<T>,
      completion: ReaderOwnedCompletion,
    ) => NavigationOutcome | Promise<NavigationOutcome>,
  ): Promise<NavigationOutcome> {
    const scope = this.#createScope(view, null, { kind: 'ignore' }, isCurrent, false, true);
    return this.#runScoped(scope, this.#createNavigation(scope), perform, finish);
  }

  /** Cheap no-history scope for ignored motion or a host with no exact Main navigation port. */
  runIgnoredMotion<T>(
    view: ReaderViewRuntime,
    ownership: NavigationAttempt | (() => boolean),
    perform: (navigation: ReaderNativeNavigation) => T,
  ): NavigationOutcome {
    const attempt = typeof ownership === 'function' ? null : ownership;
    const scope = this.#createScope(
      view,
      attempt,
      attempt?.policy ?? { kind: 'ignore' },
      typeof ownership === 'function' ? ownership : () => safelyCurrent(ownership.isCurrent),
      false,
      false,
      false,
    );
    const navigation = attempt
      ? this.#createNavigation(scope, attempt)
      : this.#createNavigation(scope);
    try {
      if (!this.#scopeIsCurrent(scope)) return { kind: 'stale' };
      this.#withCommandOwner(scope, () => this.#withOwner(scope, () => perform(navigation)));
      return this.#scopeIsCurrent(scope) ? { kind: 'unchanged' } : { kind: 'stale' };
    } catch (error) {
      return { kind: 'failed', error };
    } finally {
      scope.closed = true;
      if (!scope.searchResolved) this.#resolveSearch(scope, { kind: 'stale' });
      this.#cleanupScope(scope);
      this.#pruneScope(scope);
    }
  }

  /** Releases captured window ownership without dereferencing a possibly destroyed native view. */
  releaseWindow(window: Window): void {
    for (const scope of [...this.#scopes]) {
      if (scope.window === window) this.#disposeScope(scope);
    }
    for (const [view, patch] of this.#patches) {
      if (patch.window === window) this.#restore(view);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const scope of [...this.#scopes]) this.#disposeScope(scope);
    for (const view of this.#patches.keys()) this.#restore(view);
  }

  #createScope(
    view: ReaderViewRuntime,
    attempt: NavigationAttempt | null,
    policy: HistoryDecision,
    isCurrent: () => boolean,
    captureSource: boolean,
    captureViewOrigin: boolean,
    cancellable = true,
  ): OwnedScope {
    const abort = cancellable ? Promise.withResolvers<void>() : null;
    let origin: ReaderJumpPosition | null = null;
    if (captureViewOrigin) {
      try {
        origin = this.#dependencies.host.captureViewPosition(this.#dependencies.reader, view);
      } catch {
        origin = null;
      }
    }
    const scope: OwnedScope = {
      attempt,
      policy,
      isCurrent,
      view,
      window: view._iframeWindow,
      source: captureSource && policy.kind === 'record' ? this.#capture(view, origin) : null,
      origin,
      hardDestinations: policy.kind === 'record' && policy.evidence === 'native-hard' ? [] : null,
      pending: new Set(),
      ...(abort ? { abort: abort.promise, resolveAbort: () => abort.resolve(undefined) } : {}),
      producerCount: 0,
      hardPointCount: 0,
      searchNavigationStarted: false,
      searchResolved: false,
      searchRequestSeen: false,
      finishing: false,
      running: false,
      closed: false,
      disposed: false,
      ambiguous: false,
      error: undefined,
    };
    this.#scopes.add(scope);
    return scope;
  }

  #createNavigation(scope: OwnedScope): ReaderNativeNavigation;
  #createNavigation(scope: OwnedScope, attempt: NavigationAttempt): ReaderOwnedNavigation;
  #createNavigation(
    scope: OwnedScope,
    attempt?: NavigationAttempt,
  ): ReaderNativeNavigation | ReaderOwnedNavigation {
    const navigation = Object.freeze<ReaderNativeNavigation>({
      policy: scope.policy,
      isCurrent: () => (!scope.closed || scope.finishing) && this.#scopeIsCurrent(scope),
      capture: () => this.#capture(scope.view),
      bindRequest: (location) => this.#bindRequest(scope, location),
      navigate: (location, options) => {
        if (scope.closed) {
          this.#bindRequest(scope, location);
          return undefined;
        }
        return this.#navigate(scope, location, options);
      },
      runNative: (perform) => {
        if (scope.closed) throw new Error('Reader navigation scope is closed');
        return this.#withOwner(scope, perform);
      },
      waitForSearch: () => this.#waitForSearch(scope),
      waitForView: () => this.#waitForNativeScroll(scope),
      hasMoved: () => {
        const origin = scope.origin;
        if (!origin || !this.#scopeIsCurrent(scope)) return null;
        return this.#dependencies.host.hasViewMoved(this.#dependencies.reader, scope.view, origin);
      },
    });
    return attempt
      ? (Object.freeze({ ...navigation, attempt }) as ReaderOwnedNavigation)
      : navigation;
  }

  async #runScoped<T, N extends ReaderNativeNavigation>(
    scope: OwnedScope,
    navigation: N,
    perform: (navigation: N) => T,
    finish: (
      value: Awaited<T>,
      completion: ReaderOwnedCompletion,
    ) => NavigationOutcome | Promise<NavigationOutcome>,
  ): Promise<NavigationOutcome> {
    scope.running = true;
    try {
      const outcome = await this.#runScopedBody(scope, navigation, perform, finish);
      return outcome;
    } finally {
      scope.finishing = false;
      this.#cleanupScope(scope);
      scope.running = false;
      this.#pruneScope(scope);
    }
  }

  async #runScopedBody<T, N extends ReaderNativeNavigation>(
    scope: OwnedScope,
    navigation: N,
    perform: (navigation: N) => T,
    finish: (
      value: Awaited<T>,
      completion: ReaderOwnedCompletion,
    ) => NavigationOutcome | Promise<NavigationOutcome>,
  ): Promise<NavigationOutcome> {
    if (!this.#scopeIsCurrent(scope)) {
      this.#closeScope(scope);
      return { kind: 'stale' };
    }

    let value: Awaited<T>;
    try {
      const returned = this.#withCommandOwner(scope, () =>
        this.#withOwner(scope, () => perform(navigation)),
      );
      if (isPromiseLike(returned)) {
        const pending = Promise.resolve(returned) as Promise<Awaited<T>>;
        if (scope.abort) {
          const aborted = {};
          const result = await Promise.race([pending, scope.abort.then(() => aborted)]);
          if (result === aborted) {
            this.#closeScope(scope);
            return { kind: 'stale' };
          }
          value = result as Awaited<T>;
        } else {
          value = await pending;
        }
      } else {
        value = returned as Awaited<T>;
      }
    } catch (error) {
      scope.error = error;
      this.#resolveSearch(scope, { kind: 'failed', error });
      this.#closeScope(scope);
      return { kind: 'failed', error };
    }

    if (!(await this.#drain(scope))) {
      this.#closeScope(scope);
      return { kind: 'stale' };
    }
    this.#closeScope(scope);
    const current = this.#scopeIsCurrent(scope);
    const hardDestination = scope.hardDestinations?.length
      ? scope.hardDestinations[scope.hardDestinations.length - 1]!
      : null;
    const completion: ReaderOwnedCompletion = {
      source: scope.source,
      hardDestination,
      producerCount: scope.producerCount,
      hardPointCount: scope.hardPointCount,
      current,
      ambiguous: scope.ambiguous,
      error: scope.error,
    };
    if (!current) return { kind: 'stale' };
    if (scope.ambiguous) return { kind: 'stale' };
    if (scope.error !== undefined) return { kind: 'failed', error: scope.error };

    scope.finishing = true;
    try {
      const finished = Promise.resolve(finish(value, completion));
      let outcome: NavigationOutcome;
      if (scope.abort) {
        const aborted = {};
        const result = await Promise.race([finished, scope.abort.then(() => aborted)]);
        if (result === aborted) return { kind: 'stale' };
        outcome = result as NavigationOutcome;
      } else {
        outcome = await finished;
      }
      return this.#scopeIsCurrent(scope) ? outcome : { kind: 'stale' };
    } catch (error) {
      return { kind: 'failed', error };
    } finally {
      scope.finishing = false;
      this.#cleanupScope(scope);
    }
  }

  #scopeIsCurrent(scope: OwnedScope): boolean {
    return !this.#disposed && !scope.disposed && safelyCurrent(scope.isCurrent);
  }

  #requiresNativeHard(policy: HistoryDecision): boolean {
    return policy.kind === 'record' && policy.evidence === 'native-hard';
  }

  #closeScope(scope: OwnedScope): void {
    scope.closed = true;
    if (!scope.searchResolved) this.#resolveSearch(scope, { kind: 'stale' });
    this.#cleanupScope(scope);
    const search = this.#searchByView.get(scope.view);
    if (search?.scope === scope) this.#searchByView.delete(scope.view);
    this.#pruneScope(scope);
  }

  #disposeScope(scope: OwnedScope): void {
    scope.disposed = true;
    scope.closed = true;
    this.#resolveSearch(scope, { kind: 'stale' });
    this.#cleanupScope(scope);
    scope.resolveAbort?.();
    this.#pruneScope(scope);
  }

  #pruneScope(scope: OwnedScope): void {
    if (scope.closed && !scope.running && !scope.pending.size && !scope.cleanups?.size)
      this.#scopes.delete(scope);
  }

  #waitForSearch(scope: OwnedScope): Promise<NavigationOutcome> {
    if (scope.closed && !scope.searchResolved) return Promise.resolve({ kind: 'stale' });
    if (scope.searchResolved)
      return Promise.resolve(scope.searchOutcome ?? { kind: 'unavailable' });
    const controller = scope.view._findController;
    const window = scope.view._iframeWindow;
    if (
      !scope.searchRequestSeen ||
      !controller ||
      !this.#searchSeams.has(controller) ||
      !window ||
      typeof window.requestAnimationFrame !== 'function'
    )
      return Promise.resolve({ kind: 'unavailable' });
    if (scope.searchCompletion) return scope.searchCompletion;
    const search = Promise.withResolvers<NavigationOutcome>();
    scope.searchCompletion = search.promise;
    scope.resolveSearch = search.resolve;
    this.#watchSearchCurrent(scope);
    return search.promise;
  }

  #watchSearchCurrent(scope: OwnedScope): void {
    const window = scope.view._iframeWindow;
    if (!window || typeof window.requestAnimationFrame !== 'function') return;
    void this.#nextFrame(scope).then((current) => {
      if (scope.searchResolved) return;
      if (!current) {
        this.#resolveSearch(
          scope,
          this.#scopeIsCurrent(scope) ? { kind: 'unavailable' } : { kind: 'stale' },
        );
        return;
      }
      this.#watchSearchCurrent(scope);
    });
  }

  #capture(view: ReaderViewRuntime, origin?: ReaderJumpPosition | null): ReaderJumpLocation | null {
    const reader = this.#dependencies.reader;
    const tabID = reader.tabID;
    if (!tabID) return null;
    try {
      const location = this.#dependencies.host.captureReader(reader, tabID, view, origin);
      if (location?.position) return location;
      const baseline = this.#baselines.get(view) ?? view._history?._currentLocation;
      const observed = this.#dependencies.host.captureHardLocation(reader, view, baseline);
      return observed?.position ? observed : null;
    } catch {
      return null;
    }
  }

  #captureBaseline(view: ReaderViewRuntime): ReaderJumpLocation | null {
    const baseline = this.#baselines.get(view) ?? view._history?._currentLocation;
    if (!baseline) return null;
    try {
      return this.#dependencies.host.captureHardLocation(this.#dependencies.reader, view, baseline);
    } catch {
      return null;
    }
  }

  #bindRequest(scope: OwnedScope, location: object): void {
    if (!this.#disposed && !scope.disposed)
      this.#ownedRequests.set(nativeIdentity(location) ?? location, scope);
  }

  #navigate(scope: OwnedScope, location: object, options?: object): unknown {
    const reader = this.#dependencies.reader;
    const internal = reader._internalReader;
    if (!internal?.navigate) return undefined;
    this.#bindRequest(scope, location);
    const result = Reflect.apply(
      internal.navigate,
      internal,
      options ? [location, options] : [location],
    );
    if (isPromiseLike(result)) this.#track(scope, result);
    return result;
  }

  #withOwner<T>(scope: OwnedScope, perform: () => T): T {
    const previous = this.#currentOwners.get(scope.view);
    this.#currentOwners.set(scope.view, scope);
    try {
      return perform();
    } finally {
      if (previous) this.#currentOwners.set(scope.view, previous);
      else this.#currentOwners.delete(scope.view);
    }
  }

  #withCommandOwner<T>(scope: OwnedScope, perform: () => T): T {
    const previous = this.#commandOwners.get(scope.view);
    this.#commandOwners.set(scope.view, scope);
    try {
      return perform();
    } finally {
      if (previous) this.#commandOwners.set(scope.view, previous);
      else this.#commandOwners.delete(scope.view);
    }
  }

  #resolveSearch(scope: OwnedScope, outcome: NavigationOutcome): void {
    if (scope.searchResolved) return;
    scope.searchResolved = true;
    scope.searchOutcome = outcome;
    scope.resolveSearch?.(outcome);
    scope.resolveSearch = undefined;
    this.#pruneScope(scope);
  }

  #cleanupScope(scope: OwnedScope): void {
    const cleanups = scope.cleanups;
    scope.cleanups = undefined;
    if (!cleanups) return;
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        this.#debugSafely('reader callback cleanup failed');
      }
    }
  }

  #track(
    scope: OwnedScope | null,
    promise: PromiseLike<unknown>,
    onFulfilled?: (value: unknown) => void,
    onRejected?: (error: unknown) => void,
  ): void {
    let observer: Promise<void>;
    observer = Promise.resolve(promise)
      .then(
        (value) => {
          try {
            onFulfilled?.(value);
          } catch (error) {
            if (scope) scope.error ??= error;
          }
        },
        (error: unknown) => {
          if (scope) scope.error ??= error;
          try {
            onRejected?.(error);
          } catch (callbackError) {
            if (scope) scope.error ??= callbackError;
          }
        },
      )
      .then(() => {
        if (!scope) return;
        scope.pending.delete(observer);
        this.#pruneScope(scope);
      });
    scope?.pending.add(observer);
  }

  async #drain(scope: OwnedScope): Promise<boolean> {
    while (scope.pending.size) {
      const pending = Promise.all([...scope.pending]);
      if (scope.abort) {
        const aborted = {};
        const result = await Promise.race([pending, scope.abort.then(() => aborted)]);
        if (result === aborted) return false;
      } else {
        await pending;
      }
      if (!this.#scopeIsCurrent(scope)) return false;
    }
    return this.#scopeIsCurrent(scope);
  }

  /**
   * Temporarily tags the SDK's single label await with its immutable invocation.
   * Restores the native promise immediately; preserves receiver, arguments, and returned promise.
   */
  #withLabelContinuation(
    view: ReaderViewRuntime,
    invocation: NavigationInvocation,
    originalMethod: NativeMethod,
    receiver: ReaderViewRuntime,
    args: unknown[],
  ): unknown {
    const request = args[0];
    if (
      !isObject(request) ||
      (typeof Reflect.get(request, 'pageLabel') !== 'string' &&
        typeof Reflect.get(request, 'pageNumber') !== 'string')
    )
      return Reflect.apply(originalMethod, receiver, args);
    const descriptor = Object.getOwnPropertyDescriptor(view, '_pageLabelsPromise');
    const original = view._pageLabelsPromise;
    const target = this.#dependencies.reader._iframeWindow;
    const window = view._iframeWindow;
    const patch = this.#patches.get(view);
    const history = view._history;
    if (!descriptor?.writable || !isPromiseLike(original) || !target || !window || !patch)
      return Reflect.apply(originalMethod, receiver, args);
    const origin = nativeIdentity(original);
    const promise = (origin && this.#labelPromises.get(origin)) ?? original;
    let tagged: object;
    try {
      tagged = cloneIntoWithFunctions(
        {
          then: (fulfilled: (value: unknown) => unknown, rejected: (error: unknown) => unknown) =>
            promise.then((value) => {
              try {
                window.queueMicrotask(() => {
                  if (
                    this.#disposed ||
                    this.#patches.get(view) !== patch ||
                    view._iframeWindow !== window ||
                    view._history !== history
                  )
                    return;
                  this.#labelContinuations.set(view, invocation);
                  window.queueMicrotask(() => {
                    if (this.#labelContinuations.get(view) === invocation)
                      this.#labelContinuations.delete(view);
                  });
                });
              } catch (error) {
                this.#debugSafely(`reader label continuation observation failed: ${String(error)}`);
              }
              return fulfilled(value);
            }, rejected),
        },
        target,
      );
      const identity = nativeIdentity(tagged);
      if (identity) this.#labelPromises.set(identity, promise);
      view._pageLabelsPromise = tagged;
    } catch (error) {
      this.#debugSafely(`reader label continuation patch failed: ${String(error)}`);
      return Reflect.apply(originalMethod, receiver, args);
    }
    try {
      return Reflect.apply(originalMethod, receiver, args);
    } finally {
      if (nativeIdentity(view._pageLabelsPromise) === nativeIdentity(tagged))
        view._pageLabelsPromise = original;
    }
  }

  #producerOwner(view: ReaderViewRuntime): {
    readonly scope: OwnedScope | null;
    readonly source: ReaderJumpLocation | null;
    readonly ambiguous: boolean;
  } {
    const active = this.#currentInvocations.get(view);
    if (active) return { scope: active.scope, source: active.source, ambiguous: false };
    const owner = this.#currentOwners.get(view);
    if (owner) return { scope: owner, source: owner.source, ambiguous: false };
    const continuation = this.#labelContinuations.get(view);
    if (continuation)
      return { scope: continuation.scope, source: continuation.source, ambiguous: false };
    if (this.#invocations.get(view)?.size) return { scope: null, source: null, ambiguous: true };
    return { scope: null, source: this.#captureBaseline(view), ambiguous: false };
  }

  #startProducer(view: ReaderViewRuntime): ProducerTicket {
    const owner = this.#producerOwner(view);
    const scope = owner.scope;
    if (scope) scope.producerCount += 1;
    const ticket: ProducerTicket = {
      scope,
      view,
      window: view._iframeWindow,
      history: view._history,
      patch: this.#patches.get(view),
      source: owner.source,
      awaitingHardPoint: true,
      ambiguous: owner.ambiguous,
      destination: null,
      settled: false,
    };
    return ticket;
  }

  #producerIsCurrent(ticket: ProducerTicket): boolean {
    const { view, patch } = ticket;
    return (
      !this.#disposed &&
      !!patch &&
      this.#patches.get(view) === patch &&
      view._iframeWindow === ticket.window &&
      view._history === ticket.history &&
      this.#isPatchCurrent(view, patch)
    );
  }

  #observeProducer(ticket: ProducerTicket, result: unknown): void {
    if (!isPromiseLike(result)) {
      this.#finishProducer(ticket);
      return;
    }
    // Zotero's producer ends with save(). Its native Promise reaction must run between the
    // emission's publish/clear microtasks; Promise.resolve adoption loses that boundary.
    const observer = result.then(
      () => {
        const emission = this.#hardEmissions.get(ticket.view);
        if (
          ticket.awaitingHardPoint &&
          emission &&
          !emission.consumed &&
          emission.window === ticket.window &&
          emission.history === ticket.history &&
          emission.patch === ticket.patch &&
          this.#producerIsCurrent(ticket)
        ) {
          emission.consumed = true;
          this.#recordHardPoint(ticket, emission.location);
        }
        this.#finishProducer(ticket);
      },
      (error: unknown) => {
        if (ticket.scope) ticket.scope.error ??= error;
        this.#finishProducer(ticket);
      },
    );
    this.#track(ticket.scope, observer);
  }

  #finishProducer(ticket: ProducerTicket): void {
    if (ticket.settled) return;
    ticket.settled = true;
    ticket.awaitingHardPoint = false;

    // Owned roots, including closed ones, never degrade into native receipts.
    if (ticket.scope) return;
    try {
      if (
        ticket.ambiguous ||
        !ticket.source ||
        !ticket.destination ||
        !this.#producerIsCurrent(ticket) ||
        !this.#nativeEligible(ticket.view)
      )
        return;
      this.#dependencies.navigation()?.observeNative({
        source: ticket.source,
        destination: ticket.destination,
        isCurrent: () =>
          this.#producerIsCurrent(ticket) && !ticket.ambiguous && this.#nativeEligible(ticket.view),
      });
    } catch (error) {
      this.#debugSafely(`reader native observation failed: ${String(error)}`);
    }
  }

  #save(
    view: ReaderViewRuntime,
    history: ReaderPdfHistoryRuntime,
    location: unknown,
    transient: boolean,
  ): void {
    const currentHistory = view._history;
    if (!currentHistory || nativeIdentity(history) !== nativeIdentity(currentHistory)) return;
    this.#baselines.set(view, location);
    if (transient) return;
    const active = this.#currentProducers.get(view);
    if (active) {
      this.#recordHardPoint(active, location);
      return;
    }
    const patch = this.#patches.get(view);
    if (!patch) return;
    const window = view._iframeWindow;
    if (!window || typeof window.queueMicrotask !== 'function') return;
    const emission: HardEmission = {
      window,
      history: currentHistory,
      patch,
      location,
      consumed: false,
    };
    window.queueMicrotask(() => {
      if (
        this.#disposed ||
        view._iframeWindow !== window ||
        view._history !== currentHistory ||
        this.#patches.get(view) !== patch
      )
        return;
      this.#hardEmissions.set(view, emission);
      window.queueMicrotask(() => {
        if (this.#hardEmissions.get(view) === emission) this.#hardEmissions.delete(view);
      });
    });
  }

  #recordHardPoint(ticket: ProducerTicket, location: unknown): void {
    if (
      !ticket.awaitingHardPoint ||
      ticket.settled ||
      ticket.ambiguous ||
      !this.#producerIsCurrent(ticket)
    )
      return;
    const view = ticket.view;
    ticket.awaitingHardPoint = false;
    const scope = ticket.scope;
    if (scope) {
      scope.hardPointCount += 1;
      if (!this.#requiresNativeHard(scope.policy)) return;
      if (scope.hardDestinations) scope.hardDestinations.length = 0;
      scope.ambiguous = false;
      if (scope.closed || scope.disposed || !this.#scopeIsCurrent(scope)) return;
    }
    try {
      ticket.destination = this.#dependencies.host.captureHardLocation(
        this.#dependencies.reader,
        view,
        location,
      );
      if (scope && ticket.destination) scope.hardDestinations?.push(ticket.destination);
    } catch (error) {
      if (scope) scope.error ??= error;
      this.#debugSafely(`reader hard-point capture failed: ${String(error)}`);
    }
  }

  #nativeEligible(view: ReaderViewRuntime): boolean {
    const reader = this.#dependencies.reader;
    const tabID = reader.tabID;
    const owner = reader._window as ReaderOwnerWindowRuntime | undefined;
    const tabs = owner?.Zotero_Tabs;
    if (!tabID || !tabs || tabs.selectedID !== tabID || reader._isTabClosed === true) return false;
    const tab = tabs._tabs?.find((candidate) => candidate.id === tabID);
    if (tabs._tabs && (!tab || (tab.type !== 'reader' && tab.type !== 'reader-unloaded')))
      return false;
    const internal = reader._internalReader;
    return internal?._primaryView === view || internal?._secondaryView === view;
  }

  #patch(view: ReaderViewRuntime): void {
    const existing = this.#patches.get(view);
    if (existing && this.#isPatchCurrent(view, existing)) return;
    if (existing) this.#restore(view);

    const patch: ReaderViewPatch = {
      window: view._iframeWindow,
      methods: [],
      histories: [],
    };
    const history = view._history;
    const findController = view._findController;
    const linkService = (view._iframeWindow as PdfWindow | undefined)?.PDFViewerApplication
      ?.pdfLinkService;
    patch.history = history;
    patch.findController = findController;
    patch.linkService = linkService;
    const save = history?.save;
    if (history && typeof save === 'function') {
      this.#baselines.set(view, history._currentLocation);
      const bridge = this;
      const wrapper: NonNullable<ReaderPdfHistoryRuntime['save']> = function (
        this: ReaderPdfHistoryRuntime,
        ...args
      ): unknown {
        const result = Reflect.apply(save, this, args);
        try {
          bridge.#save(view, this, args[0], args[1] === true);
        } catch (error) {
          bridge.#debugSafely(`reader history observation failed: ${String(error)}`);
        }
        return result;
      };
      const hadOwnProperty = Object.prototype.hasOwnProperty.call(history, 'save');
      try {
        history.save = wrapper;
        patch.histories.push({ history, original: save, wrapper, hadOwnProperty });
      } catch (error) {
        this.#debugSafely(`reader history observer patch failed: ${String(error)}`);
      }
    }

    const bridge = this;
    this.#patchMethod(
      view,
      '_pushHistoryPoint',
      patch,
      (original) =>
        function (this: ReaderViewRuntime, ...args: unknown[]): unknown {
          const ticket = bridge.#startProducer(view);
          const previous = bridge.#currentProducers.get(view);
          bridge.#currentProducers.set(view, ticket);
          let result: unknown;
          try {
            result = Reflect.apply(original, this, args);
          } catch (error) {
            bridge.#finishProducer(ticket);
            throw error;
          } finally {
            if (previous) bridge.#currentProducers.set(view, previous);
            else bridge.#currentProducers.delete(view);
          }
          bridge.#observeProducer(ticket, result);
          return result;
        },
    );
    this.#patchMethod(
      view,
      'navigate',
      patch,
      (original) =>
        function (this: ReaderViewRuntime, ...args: unknown[]): unknown {
          const request = nativeIdentity(args[0]);
          const scope =
            (request && bridge.#ownedRequests.get(request)) ??
            bridge.#currentOwners.get(view) ??
            null;
          const invocation: NavigationInvocation = {
            scope,
            source: scope ? scope.source : bridge.#capture(view),
          };
          const active = bridge.#invocations.get(view) ?? new Set<NavigationInvocation>();
          bridge.#invocations.set(view, active);
          active.add(invocation);
          const previous = bridge.#currentInvocations.get(view);
          bridge.#currentInvocations.set(view, invocation);
          let result: unknown;
          try {
            result = scope
              ? bridge.#withOwner(scope, () =>
                  bridge.#withLabelContinuation(view, invocation, original, this, args),
                )
              : bridge.#withLabelContinuation(view, invocation, original, this, args);
          } catch (error) {
            active.delete(invocation);
            if (!active.size) bridge.#invocations.delete(view);
            if (previous) bridge.#currentInvocations.set(view, previous);
            else bridge.#currentInvocations.delete(view);
            throw error;
          }
          if (previous) bridge.#currentInvocations.set(view, previous);
          else bridge.#currentInvocations.delete(view);
          const finish = (): void => {
            active.delete(invocation);
            if (!active.size) bridge.#invocations.delete(view);
          };
          if (isPromiseLike(result)) bridge.#track(scope, result, finish, finish);
          else finish();
          return result;
        },
    );
    this.#patchLinkService(view, patch);

    if (findController) this.#patchFindController(view, findController, patch);
    this.#patches.set(view, patch);
  }

  #patchLinkService(view: ReaderViewRuntime, patch: ReaderViewPatch): void {
    const pdfWindow = view._iframeWindow as PdfWindow | undefined;
    const service = pdfWindow?.PDFViewerApplication?.pdfLinkService as
      | ReaderLinkServiceRuntime
      | undefined;
    if (!service) return;
    const bridge = this;
    for (const method of ['goToDestination', 'navigateTo'] as const) {
      this.#patchMethod(
        service,
        method,
        patch,
        (original) =>
          function (this: ReaderLinkServiceRuntime, ...args: unknown[]): unknown {
            const scope = bridge.#currentOwners.get(view) ?? bridge.#producerOwner(view).scope;
            const linkFrame = bridge.#linkFrames.get(view);
            if (linkFrame && linkFrame.scope === scope) linkFrame.navigationStarted = true;
            const result = Reflect.apply(original, this, args);
            if (scope && isPromiseLike(result)) {
              bridge.#track(scope, result, () => {
                bridge.#track(scope, bridge.#waitForNativeScroll(scope));
              });
            } else if (scope) {
              bridge.#track(scope, bridge.#waitForNativeScroll(scope));
            }
            return result;
          },
      );
    }
    // Completion comes from the nested destination promise or exact view frame.
    this.#patchMethod(
      service,
      'setHash',
      patch,
      (original) =>
        function (this: ReaderLinkServiceRuntime, ...args: unknown[]): unknown {
          const scope = bridge.#currentOwners.get(view) ?? bridge.#producerOwner(view).scope;
          const previous = bridge.#linkFrames.get(view);
          const frame: ReaderLinkInvocation = { scope, navigationStarted: false };
          if (scope) bridge.#linkFrames.set(view, frame);
          let result: unknown;
          try {
            result = Reflect.apply(original, this, args);
          } catch (error) {
            if (previous) bridge.#linkFrames.set(view, previous);
            else bridge.#linkFrames.delete(view);
            throw error;
          }
          if (previous) bridge.#linkFrames.set(view, previous);
          else bridge.#linkFrames.delete(view);
          if (scope && isPromiseLike(result)) {
            bridge.#track(scope, result, () => {
              if (!frame.navigationStarted)
                bridge.#track(scope, bridge.#waitForNativeScroll(scope));
            });
          } else if (scope && !frame.navigationStarted) {
            bridge.#track(scope, bridge.#waitForNativeScroll(scope));
          }
          return result;
        },
    );
  }

  #retireSearch(view: ReaderViewRuntime, nextState: object | null): void {
    const previous = this.#searchByView.get(view);
    if (!previous || previous.state === nextState) return;
    previous.scope.ambiguous = true;
    this.#resolveSearch(previous.scope, { kind: 'stale' });
    this.#searchByView.delete(view);
  }

  async #settleSearch(scope: OwnedScope): Promise<void> {
    if (scope.searchResolved) return;
    if (!this.#scopeIsCurrent(scope)) {
      this.#resolveSearch(scope, { kind: 'stale' });
      return;
    }
    if (!(await this.#waitForNativeScroll(scope))) {
      this.#resolveSearch(
        scope,
        this.#scopeIsCurrent(scope) ? { kind: 'unavailable' } : { kind: 'stale' },
      );
      return;
    }
    const destination = scope.policy.kind === 'record' ? this.#capture(scope.view) : null;
    const sourcePosition = scope.source?.position;
    const destinationPosition = destination?.position;
    if (
      sourcePosition &&
      destinationPosition &&
      sourcePosition.pageIndex === destinationPosition.pageIndex &&
      sourcePosition.top === destinationPosition.top &&
      sourcePosition.left === destinationPosition.left
    ) {
      this.#resolveSearch(scope, { kind: 'unchanged' });
      return;
    }
    if (scope.policy.kind === 'record' && !destinationPosition) {
      this.#resolveSearch(scope, { kind: 'unavailable' });
      return;
    }
    this.#resolveSearch(scope, {
      kind: 'completed',
      evidence: 'settled-change',
      ...(destination ? { destination } : {}),
    });
  }

  #nextFrame(scope: OwnedScope): Promise<boolean> {
    const window = scope.view._iframeWindow;
    if (!window || typeof window.requestAnimationFrame !== 'function')
      return Promise.resolve(false);
    const frame = Promise.withResolvers<boolean>();
    let completed = false;
    const finish = (ready: boolean): void => {
      if (completed) return;
      completed = true;
      scope.cleanups?.delete(cancel);
      frame.resolve(ready && (!scope.closed || scope.finishing) && this.#scopeIsCurrent(scope));
      this.#pruneScope(scope);
    };
    const cancel = (): void => finish(false);
    (scope.cleanups ??= new Set()).add(cancel);
    try {
      window.requestAnimationFrame(() => finish(true));
    } catch {
      finish(false);
    }
    return frame.promise;
  }

  async #waitForNativeScroll(scope: OwnedScope): Promise<boolean> {
    if ((scope.closed && !scope.finishing) || !scope.view._iframeWindow) return false;
    try {
      if (!(await this.#nextFrame(scope))) return false;
      while (scope.view._scrolling === true) {
        if (!this.#scopeIsCurrent(scope) || !(await this.#nextFrame(scope))) return false;
      }
      return this.#scopeIsCurrent(scope);
    } catch {
      return false;
    }
  }

  #patchFindController(
    view: ReaderViewRuntime,
    controller: ReaderFindControllerRuntime,
    patch: ReaderViewPatch,
  ): void {
    const bridge = this;
    this.#patchMethod(
      controller,
      'find',
      patch,
      (original) =>
        function (this: ReaderFindControllerRuntime, ...args: unknown[]): unknown {
          const scope = bridge.#commandOwners.get(view) ?? null;
          const state = nativeIdentity(args[0]);
          if (scope) scope.searchRequestSeen = true;
          bridge.#retireSearch(view, state);
          if (scope && state) {
            bridge.#findRequests.set(state, scope);
            bridge.#searchByView.set(view, { state, scope });
          } else if (scope) {
            bridge.#resolveSearch(scope, { kind: 'unavailable' });
          }
          return Reflect.apply(original, this, args);
        },
    );
    this.#patchMethod(
      controller,
      '_updateMatch',
      patch,
      (original) =>
        function (this: ReaderFindControllerRuntime, ...args: unknown[]): unknown {
          const state = nativeIdentity(this._state);
          const scope = state ? (bridge.#findRequests.get(state) ?? null) : null;
          const hadFrame = bridge.#searchFrameViews.has(view);
          const previous = bridge.#searchFrames.get(view) ?? null;
          bridge.#searchFrameViews.add(view);
          bridge.#searchFrames.set(view, scope);
          if (scope) scope.searchNavigationStarted = false;
          try {
            const result = Reflect.apply(original, this, args);
            if (scope && !scope.searchNavigationStarted)
              bridge.#resolveSearch(scope, { kind: 'unchanged' });
            return result;
          } catch (error) {
            if (scope) bridge.#resolveSearch(scope, { kind: 'failed', error });
            throw error;
          } finally {
            if (hadFrame) bridge.#searchFrames.set(view, previous);
            else {
              bridge.#searchFrames.delete(view);
              bridge.#searchFrameViews.delete(view);
            }
          }
        },
    );
    this.#patchMethod(
      controller,
      '_onNavigate',
      patch,
      (original) =>
        function (this: ReaderFindControllerRuntime, ...args: unknown[]): unknown {
          const scope = bridge.#searchFrameViews.has(view)
            ? (bridge.#searchFrames.get(view) ?? null)
            : null;
          if (scope) scope.searchNavigationStarted = true;
          let result: unknown;
          try {
            result = scope
              ? bridge.#withOwner(scope, () => Reflect.apply(original, this, args))
              : Reflect.apply(original, this, args);
          } catch (error) {
            if (scope) bridge.#resolveSearch(scope, { kind: 'failed', error });
            throw error;
          }
          if (scope && isPromiseLike(result)) {
            bridge.#track(
              scope,
              result,
              () => void bridge.#settleSearch(scope),
              (error) => bridge.#resolveSearch(scope, { kind: 'failed', error }),
            );
          } else if (scope) {
            void bridge.#settleSearch(scope);
          }
          return result;
        },
    );

    let findPatched = false;
    let matchPatched = false;
    let navigationPatched = false;
    for (const method of patch.methods) {
      if (method.target !== controller) continue;
      if (method.key === 'find') findPatched = true;
      else if (method.key === '_updateMatch') matchPatched = true;
      else if (method.key === '_onNavigate') navigationPatched = true;
    }
    if (findPatched && matchPatched && navigationPatched) this.#searchSeams.add(controller);
  }
  #patchMethod(
    target: object,
    key: string,
    patch: ReaderViewPatch,
    wrap: (original: NativeMethod) => NativeMethod,
  ): void {
    const current = Reflect.get(target, key);
    if (typeof current !== 'function') return;
    const original = current as NativeMethod;
    const hadOwnProperty = Object.prototype.hasOwnProperty.call(target, key);
    const wrapper = wrap(original);
    try {
      Reflect.set(target, key, wrapper);
      if (Reflect.get(target, key) === wrapper)
        patch.methods.push({ target, key, original, wrapper, hadOwnProperty });
    } catch (error) {
      this.#debugSafely(`reader ${key} patch failed: ${String(error)}`);
    }
  }

  #isPatchCurrent(view: ReaderViewRuntime, patch: ReaderViewPatch): boolean {
    const service = (view._iframeWindow as PdfWindow | undefined)?.PDFViewerApplication
      ?.pdfLinkService;
    if (
      patch.window !== view._iframeWindow ||
      patch.history !== view._history ||
      patch.findController !== view._findController ||
      patch.linkService !== service ||
      (!patch.histories.length && !patch.methods.length)
    )
      return false;
    if (
      !patch.histories.every(({ history, wrapper }) => history.save === wrapper) ||
      !patch.methods.every(({ target, key, wrapper }) => Reflect.get(target, key) === wrapper)
    )
      return false;
    if (typeof view._history?.save === 'function' && !patch.histories.length) return false;
    if (
      typeof view._pushHistoryPoint === 'function' &&
      !this.#methodIsPatched(patch, view, '_pushHistoryPoint')
    )
      return false;
    if (typeof view.navigate === 'function' && !this.#methodIsPatched(patch, view, 'navigate'))
      return false;
    if (service) {
      for (const key of ['goToDestination', 'navigateTo', 'setHash'] as const) {
        if (
          typeof Reflect.get(service, key) === 'function' &&
          !this.#methodIsPatched(patch, service, key)
        )
          return false;
      }
    }
    return !view._findController || this.#searchSeams.has(view._findController);
  }

  #methodIsPatched(patch: ReaderViewPatch, target: object, key: string): boolean {
    for (const method of patch.methods) {
      if (method.target === target && method.key === key) return true;
    }
    return false;
  }

  #restore(view: ReaderViewRuntime): void {
    const patch = this.#patches.get(view);
    if (!patch) return;
    this.#retireSearch(view, null);
    for (const scope of [...this.#scopes]) {
      if (scope.view === view) this.#disposeScope(scope);
    }
    this.#searchFrames.delete(view);
    this.#searchFrameViews.delete(view);
    this.#linkFrames.delete(view);
    this.#currentProducers.delete(view);
    this.#hardEmissions.delete(view);
    this.#labelContinuations.delete(view);
    if (patch.findController) this.#searchSeams.delete(patch.findController);
    for (const { history, original, wrapper, hadOwnProperty } of patch.histories) {
      try {
        if (history.save !== wrapper) continue;
        if (hadOwnProperty) history.save = original;
        else Reflect.deleteProperty(history, 'save');
      } catch {
        this.#debugSafely('reader history observer cleanup failed');
      }
    }
    for (const { target, key, original, wrapper, hadOwnProperty } of patch.methods) {
      try {
        if (Reflect.get(target, key) !== wrapper) continue;
        if (hadOwnProperty) Reflect.set(target, key, original);
        else Reflect.deleteProperty(target, key);
      } catch {
        this.#debugSafely(`reader ${key} cleanup failed`);
      }
    }
    this.#patches.delete(view);
  }

  #debugSafely(message: string): void {
    try {
      this.#dependencies.debug(message);
    } catch {
      // Diagnostics cannot interfere with Zotero's native navigation or history producer.
    }
  }
}
