import { vi, type Mock } from 'vitest';

export type CollectionTestTransactionCallback = (transactionID: string) => unknown;
export interface CollectionTestTransactionOptions {
  readonly onCommit?: CollectionTestTransactionCallback;
  readonly onRollback?: CollectionTestTransactionCallback;
}
export interface CollectionTransactionTestDB {
  _transactionID: string | null;
  _commitCount: number;
  readonly _callbacks: {
    readonly current: {
      commit: CollectionTestTransactionCallback[];
      rollback: CollectionTestTransactionCallback[];
    };
  };
  addCurrentCallback: Mock<
    (
      this: CollectionTransactionTestDB,
      type: string,
      callback: CollectionTestTransactionCallback,
    ) => unknown
  >;
  executeTransaction: Mock<
    (
      callback: () => Promise<unknown>,
      options?: CollectionTestTransactionOptions,
    ) => Promise<unknown>
  >;
}

/** Native 10.0.6 lifecycle, including retained failed commit queues and overlapping drains. */
export function createCollectionTransactionDB(): CollectionTransactionTestDB {
  let serial = 0;
  let transactionFinished: Promise<void> = Promise.resolve();
  const db: CollectionTransactionTestDB = {
    _transactionID: null,
    _commitCount: 0,
    _callbacks: { current: { commit: [], rollback: [] } },
    addCurrentCallback: vi.fn(function (
      this: CollectionTransactionTestDB,
      type: string,
      callback: CollectionTestTransactionCallback,
    ) {
      if (!this._transactionID) throw new Error('Transaction required');
      const queue = this._callbacks.current[type as 'commit' | 'rollback'];
      if (!queue) throw new Error(`Unknown transaction callback type ${type}`);
      queue.push(callback);
    }),
    executeTransaction: vi.fn(
      async (callback: () => Promise<unknown>, options: CollectionTestTransactionOptions = {}) => {
        while (db._transactionID) await transactionFinished;
        const finished = Promise.withResolvers<void>();
        transactionFinished = finished.promise;
        const id = `native-test-${++serial}`;
        db._transactionID = id;
        try {
          const result = await callback();
          db._commitCount++;
          db._transactionID = null;
          if (options.onCommit) db._callbacks.current.commit.push(options.onCommit);
          db._callbacks.current.rollback = [];
          let commit;
          while ((commit = db._callbacks.current.commit.shift())) await Promise.resolve(commit(id));
          return result;
        } catch (error) {
          db._transactionID = null;
          if (options.onRollback) db._callbacks.current.rollback.push(options.onRollback);
          let rollback;
          while ((rollback = db._callbacks.current.rollback.shift()))
            await Promise.resolve(rollback(id));
          // Deliberately keep commit callbacks, matching the installed host defect.
          throw error;
        } finally {
          finished.resolve();
        }
      },
    ),
  };
  return db;
}
