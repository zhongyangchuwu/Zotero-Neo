import { reportDiagnosticError, ZoteroLogger } from '../../core/logging';

type TransactionCallback = (transactionID: string) => unknown;
type CallbackRegistrar = (this: unknown, type: string, callback: TransactionCallback) => unknown;

type NativeCollectionDB = {
  readonly _transactionID?: string | null;
  _commitCount: number;
  addCurrentCallback: CallbackRegistrar;
  executeTransaction<T>(
    callback: () => Promise<T>,
    options: {
      onCommit: TransactionCallback;
      onRollback: TransactionCallback;
    },
  ): Promise<T>;
};

type DispatchOutcome =
  | { readonly failed: false }
  | { readonly failed: true; readonly error: unknown };

/** Keep synchronous native callbacks synchronous, awaiting only actual thenables. */
function drainCallbacks(
  callbacks: readonly TransactionCallback[],
  transactionID: string,
): void | Promise<void> {
  let index = 0;
  function advance(): void | Promise<void> {
    while (index < callbacks.length) {
      const callback = callbacks[index++]!;
      const result = callback(transactionID) as PromiseLike<unknown> | null | undefined;
      if (result && typeof result.then === 'function') return Promise.resolve(result).then(advance);
    }
  }
  return advance();
}

type CollectionTransactionOptions = {
  /** Operations owns restoration, which completes before the next Neo mutation. */
  readonly onRollback?: (error: unknown) => Promise<void>;
  /** Report post-commit errors without replacing the durable operation receipt. */
  readonly reportCommittedError?: boolean;
};

let mutationFinished: Promise<void> = Promise.resolve();
const transactionLogger = new ZoteroLogger();

/** Serialize the complete mutation, callback dispatch, and operation recovery. */
export async function executeCollectionTransaction<T>(
  callback: () => Promise<T>,
  options: CollectionTransactionOptions = {},
): Promise<T> {
  const previous = mutationFinished;
  const finished = Promise.withResolvers<void>();
  mutationFinished = finished.promise;
  await previous;
  try {
    return await executeOwnedTransaction(callback, options);
  } finally {
    finished.resolve();
  }
}

/**
 * Native 10.0.6 increments this counter immediately after SQL COMMIT, while its
 * transaction ID is still installed, before any shared commit callback runs.
 * Observe that exact write, not a later global-count comparison. A retained
 * foreign accessor delegates normally after this scoped observer is retired.
 */
function observeSQLCommit(db: NativeCollectionDB, committed: () => void): () => void {
  const ownDescriptor = Object.getOwnPropertyDescriptor(db, '_commitCount');
  let descriptor = ownDescriptor;
  let prototype = Object.getPrototypeOf(db) as object | null;
  while (!descriptor && prototype) {
    descriptor = Object.getOwnPropertyDescriptor(prototype, '_commitCount');
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  let value = db._commitCount;
  if (
    typeof value !== 'number' ||
    (ownDescriptor && !ownDescriptor.configurable) ||
    (descriptor && ('value' in descriptor ? !descriptor.writable : !descriptor.set))
  )
    throw new Error('Native collection transaction SQL outcome observation is unavailable');
  let active = true;
  let written = false;
  const get = function (this: unknown): number {
    return descriptor?.get ? (descriptor.get.call(this) as number) : value;
  };
  const set = function (this: unknown, next: number): void {
    const previous = get.call(this);
    if (descriptor?.set) descriptor.set.call(this, next);
    else value = next;
    written = true;
    if (active && this === db && next === previous + 1) committed();
  };
  Object.defineProperty(db, '_commitCount', {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    get,
    set,
  });
  return () => {
    active = false;
    const current = Object.getOwnPropertyDescriptor(db, '_commitCount');
    if (current?.get !== get || current.set !== set) return;
    if (ownDescriptor) {
      Object.defineProperty(
        db,
        '_commitCount',
        'value' in ownDescriptor ? { ...ownDescriptor, value } : ownDescriptor,
      );
    } else if (written && (!descriptor || 'value' in descriptor)) {
      Object.defineProperty(db, '_commitCount', {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
    } else Reflect.deleteProperty(db, '_commitCount');
  };
}

/** Capture owned registrations without editing native shared callback queues. */
async function executeOwnedTransaction<T>(
  callback: () => Promise<T>,
  options: CollectionTransactionOptions,
): Promise<T> {
  const db = Zotero.DB as unknown as NativeCollectionDB;
  const commitCallbacks: TransactionCallback[] = [];
  const rollbackCallbacks: TransactionCallback[] = [];
  const completions: Promise<DispatchOutcome>[] = [];
  let ownerID = '';
  let entered = false;
  let sqlCommitted = false;
  let terminal = false;
  let stopObserving: (() => void) | undefined;

  function dispatch(callbacks: readonly TransactionCallback[]): void | Promise<void> {
    if (terminal) return;
    terminal = true;
    const completed = Promise.withResolvers<DispatchOutcome>();
    completions.push(completed.promise);
    function complete(outcome: DispatchOutcome): void {
      commitCallbacks.length = 0;
      rollbackCallbacks.length = 0;
      completed.resolve(outcome);
    }
    try {
      const pending = drainCallbacks(callbacks, ownerID);
      if (pending)
        return pending.then(
          () => {
            complete({ failed: false });
          },
          (error: unknown) => {
            complete({ failed: true, error });
            throw error;
          },
        );
      complete({ failed: false });
    } catch (error) {
      complete({ failed: true, error });
      throw error;
    }
  }

  // Native also calls onRollback after shared post-commit callbacks fail. Do
  // not replace that original error if our terminal cleanup fails as well.
  function settleAfterFailure(): void | Promise<void> {
    try {
      const pending = dispatch(sqlCommitted ? commitCallbacks : rollbackCallbacks);
      return pending?.catch(() => undefined);
    } catch {
      // The recorded dispatch outcome is awaited below.
    }
  }

  let result: T | undefined;
  let nativeFailure: { readonly error: unknown } | undefined;
  try {
    await db.executeTransaction(
      async () => {
        const transactionID = db._transactionID;
        if (typeof transactionID !== 'string' || !transactionID)
          throw new Error('Native collection transaction identity is unavailable');
        entered = true;
        ownerID = transactionID;
        stopObserving = observeSQLCommit(db, () => {
          if (db._transactionID === transactionID) sqlCommitted = true;
        });
        const previous = db.addCurrentCallback;
        if (typeof previous !== 'function')
          throw new Error('Native collection transaction callback registration is unavailable');
        const descriptor = Object.getOwnPropertyDescriptor(db, 'addCurrentCallback');
        let active = true;
        const capture: CallbackRegistrar = function (type, registered) {
          if (
            active &&
            this === db &&
            db._transactionID === transactionID &&
            (type === 'commit' || type === 'rollback')
          ) {
            (type === 'commit' ? commitCallbacks : rollbackCallbacks).push(registered);
            return;
          }
          return previous.call(this, type, registered);
        };
        db.addCurrentCallback = capture;
        try {
          result = await callback();
          return result;
        } finally {
          active = false;
          // Never overwrite a replacement installed by another native consumer.
          if (db.addCurrentCallback === capture) {
            if (descriptor) Object.defineProperty(db, 'addCurrentCallback', descriptor);
            else Reflect.deleteProperty(db, 'addCurrentCallback');
          }
        }
      },
      {
        onCommit: () => {
          if (terminal) return;
          sqlCommitted = true;
          return dispatch(commitCallbacks);
        },
        onRollback: settleAfterFailure,
      },
    );
  } catch (error) {
    nativeFailure = { error };
  } finally {
    stopObserving?.();
  }

  // A shared callback may fail before either tail hook is reached. Settle our
  // callbacks now; the queued hooks become inert on every later native drain.
  if (entered && !terminal && nativeFailure) await settleAfterFailure();
  // An older native drainer can still be awaiting an owned asynchronous hook.
  const outcomes = await Promise.all(completions);
  const dispatchFailure = outcomes.find((outcome) => outcome.failed);
  const failure = nativeFailure ?? (dispatchFailure?.failed ? dispatchFailure : undefined);
  if (failure) {
    if (sqlCommitted && options.reportCommittedError) {
      reportDiagnosticError(
        transactionLogger,
        'Collection SQL committed; native callback failed',
        failure.error,
      );
      if (!dispatchFailure) return result as T;
      if (dispatchFailure.failed && dispatchFailure.error !== failure.error)
        reportDiagnosticError(
          transactionLogger,
          'Collection owned commit callback failed',
          dispatchFailure.error,
        );
    }
    if (!sqlCommitted) await options.onRollback?.(failure.error);
    throw failure.error;
  }
  if (!terminal)
    throw new Error(
      entered
        ? 'Native collection transaction outcome was not dispatched'
        : 'Native collection transaction body was not entered',
    );
  return result as T;
}
