import { NavigationHistoryState, sameNavigationLocation } from './history';
import { resolveHistoryPolicy } from './history-policy';
import type {
  HistoryDecision,
  NavigationAttempt,
  NavigationCompletion,
  NavigationExecution,
  NavigationIntent,
  NavigationLocation,
  NavigationOperation,
  NavigationOutcome,
  NavigationPort,
  NavigationResult,
  NavigationToken,
  NativeNavigationReceipt,
} from './types';

export interface NavigationCoordinatorHost {
  capture(
    operation: NavigationOperation,
    phase: 'source' | 'destination',
  ): NavigationLocation | null;
  isCurrent(): boolean;
  onError?(error: unknown): void;
  onTraversalCommitted?(intent: NavigationIntent): void;
}

interface AttemptState {
  readonly token: NavigationToken;
  readonly intent: NavigationIntent;
  cancelled: boolean;
  committed: boolean;
}

interface AttemptContext {
  readonly state: AttemptState;
  readonly isCurrent: () => boolean;
  readonly attempt: NavigationAttempt;
}

/** One session's policy, admission, dispatch, completion, and history commit point. */
export class NavigationCoordinator {
  readonly #history: NavigationHistoryState;
  readonly #host: NavigationCoordinatorHost;
  readonly #attempts = new Set<AttemptState>();
  readonly #completionFences = new Set<Promise<unknown>>();
  #serialTail: Promise<void> = Promise.resolve();
  #nextID = 0;
  #disposed = false;

  constructor(history: NavigationHistoryState, host: NavigationCoordinatorHost) {
    this.#history = history;
    this.#host = host;
  }

  execute(intent: NavigationIntent, operation: NavigationOperation): NavigationExecution {
    const cause =
      intent.cause.kind === 'action'
        ? Object.freeze({ kind: 'action' as const, action: intent.cause.action })
        : Object.freeze({ kind: 'event' as const, event: intent.cause.event });
    const stampedIntent = Object.freeze({
      cause,
      surface: intent.surface,
      context: intent.context ? Object.freeze({ ...intent.context }) : undefined,
    });
    const decision = resolveHistoryPolicy(stampedIntent);
    const traversal = decision.kind === 'traverse';
    const ordinaryMotion = operation.admission === 'motion';
    const admitted = !traversal && !(ordinaryMotion && decision.kind === 'ignore');
    const epoch = traversal || !admitted ? this.#history.revision : this.#history.invalidate();
    const state: AttemptState = {
      token: Object.freeze({
        id: ++this.#nextID,
        epoch,
        cause,
        surface: stampedIntent.surface,
      }),
      intent: stampedIntent,
      cancelled: false,
      committed: false,
    };
    this.#attempts.add(state);
    const isCurrent = (): boolean => this.#isCurrent(state);
    const attempt: NavigationAttempt = {
      token: state.token,
      policy: decision,
      isCurrent,
      cancel: () => {
        state.cancelled = true;
      },
    };
    const context = { state, isCurrent, attempt };

    if (operation.dispatch !== 'inline') return this.#enqueue(context, decision, operation);
    return this.#runInline(context, decision, operation, admitted);
  }

  observeNative(receipt: NativeNavigationReceipt): void {
    let eligible = false;
    try {
      eligible = !this.#disposed && this.#host.isCurrent() && receipt.isCurrent();
    } catch (error) {
      this.#reportError(error);
      return;
    }
    if (!eligible || sameNavigationLocation(receipt.source, receipt.destination)) return;

    const decision = resolveHistoryPolicy({
      cause: { kind: 'event', event: 'reader-native.hard' },
      surface: 'reader',
    });
    if (!matchesEvidence(decision, { kind: 'completed', evidence: 'native-hard' })) return;

    const revision = this.#history.invalidate();
    this.#history.append(receipt.source, receipt.destination, revision);
  }

  port(): NavigationPort {
    return {
      execute: (intent, operation) => this.execute(intent, operation),
      observeNative: (receipt) => this.observeNative(receipt),
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const state of this.#attempts) state.cancelled = true;
    this.#attempts.clear();
  }

  #enqueue(
    context: AttemptContext,
    decision: HistoryDecision,
    operation: NavigationOperation,
  ): NavigationExecution {
    const traversal = decision.kind === 'traverse';
    const result = this.#serialTail.then(async (): Promise<NavigationResult> => {
      if (traversal) await Promise.all([...this.#completionFences]);
      if (!context.isCurrent()) {
        this.#retire(context.state);
        return { kind: 'stale', recorded: false };
      }
      return this.#runStarted(context, decision, operation);
    });
    this.#serialTail = result.then(
      () => undefined,
      () => undefined,
    );
    return {
      isCurrent: context.isCurrent,
      cancel: context.attempt.cancel,
      pending: true,
      result,
    };
  }

  #runInline(
    context: AttemptContext,
    decision: HistoryDecision,
    operation: NavigationOperation,
    admitted: boolean,
  ): NavigationExecution {
    if (!context.isCurrent()) {
      this.#retire(context.state);
      return {
        isCurrent: context.isCurrent,
        cancel: context.attempt.cancel,
        pending: false,
        result: { kind: 'stale', recorded: false },
      };
    }
    let source: NavigationLocation | null = null;
    if (decision.kind === 'record') source = this.#capture(operation, 'source');
    const started = this.#start(context, decision, operation, source);
    if ('then' in started) {
      if (admitted) this.#addFence(started);
      return {
        isCurrent: context.isCurrent,
        cancel: context.attempt.cancel,
        pending: true,
        result: started,
      };
    }
    this.#retire(context.state);
    return {
      isCurrent: context.isCurrent,
      cancel: context.attempt.cancel,
      pending: false,
      result: started,
    };
  }

  #runStarted(
    context: AttemptContext,
    decision: HistoryDecision,
    operation: NavigationOperation,
  ): Promise<NavigationResult> | NavigationResult {
    if (!context.isCurrent()) {
      this.#retire(context.state);
      return { kind: 'stale', recorded: false };
    }
    const source = decision.kind === 'record' ? this.#capture(operation, 'source') : null;
    return this.#start(context, decision, operation, source);
  }

  #start(
    context: AttemptContext,
    decision: HistoryDecision,
    operation: NavigationOperation,
    source: NavigationLocation | null,
  ): Promise<NavigationResult> | NavigationResult {
    if (!context.isCurrent()) {
      this.#retire(context.state);
      return { kind: 'stale', recorded: false };
    }

    let completion: NavigationCompletion;
    try {
      completion = operation.start(context.attempt);
    } catch (error) {
      this.#reportError(error);
      this.#retire(context.state);
      return { kind: 'failed', error, recorded: false };
    }

    if (completion.kind === 'immediate') {
      const result = this.#finish(context, decision, operation, source, completion.outcome);
      this.#retire(context.state);
      return result;
    }

    const pending = completion.settled
      .then((outcome) => this.#finish(context, decision, operation, source, outcome))
      .catch(
        (error: unknown): NavigationResult =>
          this.#finish(context, decision, operation, source, { kind: 'failed', error }),
      )
      .finally(() => this.#retire(context.state));
    return pending;
  }

  #finish(
    context: AttemptContext,
    decision: HistoryDecision,
    operation: NavigationOperation,
    source: NavigationLocation | null,
    outcome: NavigationOutcome,
  ): NavigationResult {
    if (!context.isCurrent()) return { kind: 'stale', recorded: false };
    if (outcome.kind !== 'completed' || context.state.committed) {
      if (outcome.kind === 'failed') this.#reportError(outcome.error);
      return { ...outcome, recorded: false };
    }

    if (decision.kind === 'traverse') {
      if (outcome.targetIndex === undefined) return { ...outcome, recorded: false };
      context.state.committed = true;
      if (!this.#history.move(outcome.targetIndex, context.state.token.epoch))
        return { kind: 'stale', recorded: false };
      try {
        this.#host.onTraversalCommitted?.(context.state.intent);
      } catch (error) {
        this.#reportError(error);
      }
      return { ...outcome, recorded: false };
    }
    if (decision.kind !== 'record' || !matchesEvidence(decision, outcome) || !source) {
      context.state.committed = true;
      return { ...outcome, recorded: false };
    }

    const destination = outcome.destination ?? this.#capture(operation, 'destination');
    if (!context.isCurrent()) return { kind: 'stale', recorded: false };
    context.state.committed = true;
    const recorded = destination
      ? this.#history.append(source, destination, context.state.token.epoch)
      : false;
    return { ...outcome, recorded };
  }

  #capture(
    operation: NavigationOperation,
    phase: 'source' | 'destination',
  ): NavigationLocation | null {
    try {
      if (operation.capture) return operation.capture();
      return this.#host.capture(operation, phase);
    } catch (error) {
      this.#reportError(error);
      return null;
    }
  }

  #isCurrent(state: AttemptState): boolean {
    if (state.cancelled || this.#disposed || this.#history.revision !== state.token.epoch)
      return false;
    try {
      return this.#host.isCurrent() && (state.intent.context?.isCurrent?.() ?? true);
    } catch {
      return false;
    }
  }

  #addFence(promise: Promise<unknown>): void {
    this.#completionFences.add(promise);
    void promise.then(
      () => this.#completionFences.delete(promise),
      () => this.#completionFences.delete(promise),
    );
  }

  #retire(state: AttemptState): void {
    this.#attempts.delete(state);
  }

  #reportError(error: unknown): void {
    try {
      this.#host.onError?.(error);
    } catch {
      // Diagnostics must not change the host result.
    }
  }
}

function matchesEvidence(decision: HistoryDecision, outcome: NavigationOutcome): boolean {
  return (
    decision.kind === 'record' &&
    outcome.kind === 'completed' &&
    decision.evidence === outcome.evidence
  );
}
