type TransactionCallback = (transactionID: string) => unknown;
type CallbackRegistrar = (this: unknown, type: string, callback: TransactionCallback) => unknown;

type NativeCollectionDB = {
  readonly _transactionID?: string | null;
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

/**
 * Native 10.0.6 leaves failed transactions' temporary commit callbacks queued,
 * and a previous transaction can still be draining that shared queue. Capture
 * only registrations owned by this entered transaction, before they reach the
 * queue. Public post-SQL outcome hooks dispatch them with their actual owner ID.
 */
export async function executeCollectionTransaction<T>(callback: () => Promise<T>): Promise<T> {
  const db = Zotero.DB as unknown as NativeCollectionDB;
  const commitCallbacks: TransactionCallback[] = [];
  const rollbackCallbacks: TransactionCallback[] = [];
  const completions: Promise<DispatchOutcome>[] = [];
  let ownerID = '';
  let entered = false;

  function dispatch(callbacks: readonly TransactionCallback[]): void | Promise<void> {
    const completed = Promise.withResolvers<DispatchOutcome>();
    completions.push(completed.promise);
    try {
      const pending = drainCallbacks(callbacks, ownerID);
      if (pending)
        return pending.then(
          () => {
            completed.resolve({ failed: false });
          },
          (error: unknown) => {
            completed.resolve({ failed: true, error });
            throw error;
          },
        );
      completed.resolve({ failed: false });
    } catch (error) {
      completed.resolve({ failed: true, error });
      throw error;
    }
  }

  let result: T | undefined;
  let nativeFailure: { readonly error: unknown } | undefined;
  try {
    result = await db.executeTransaction(
      async () => {
        const transactionID = db._transactionID;
        if (typeof transactionID !== 'string' || !transactionID)
          throw new Error('Native collection transaction identity is unavailable');
        entered = true;
        ownerID = transactionID;
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
          return await callback();
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
          // Native DB clears rollback callbacks before starting commit callbacks.
          rollbackCallbacks.length = 0;
          return dispatch(commitCallbacks);
        },
        onRollback: () => dispatch(rollbackCallbacks),
      },
    );
  } catch (error) {
    nativeFailure = { error };
  }

  // A foreign native drainer may have shifted our outcome hook and still be
  // awaiting its callbacks even after our own executor returns. Await that work.
  if (completions.length) {
    const outcomes = await Promise.all(completions);
    if (nativeFailure) throw nativeFailure.error;
    for (const outcome of outcomes) if (outcome.failed) throw outcome.error;
  } else if (nativeFailure) {
    // Admission failure never entered the body and cannot have owned callbacks.
    throw nativeFailure.error;
  } else {
    throw new Error(
      entered
        ? 'Native collection transaction outcome was not dispatched'
        : 'Native collection transaction body was not entered',
    );
  }
  return result as T;
}
