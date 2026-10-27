import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCollectionTransaction } from '../../src/toolkit/main/collection-transactions';
import {
  createCollectionTransactionDB,
  type CollectionTransactionTestDB,
  type CollectionTestTransactionCallback,
} from '../fixtures/collection-transactions';

afterEach(() => vi.unstubAllGlobals());

function host() {
  const db = createCollectionTransactionDB();
  vi.stubGlobal('Zotero', { DB: db });
  return db;
}

describe('owned native collection transaction callbacks', () => {
  it('keeps owned callbacks out of shared queues and preserves synchronous order and owner IDs', async () => {
    const db = host();
    const previous = db.addCurrentCallback;
    const originalDescriptor = Object.getOwnPropertyDescriptor(db, 'addCurrentCallback');
    const shared = db._callbacks.current.commit;
    const order: string[] = [];
    const prefix = vi.fn(() => {
      order.push('unrelated');
    });
    shared.push(prefix);
    const ownerIDs: string[] = [];
    const second = vi.fn(function (this: unknown, id: string) {
      ownerIDs.push(id);
      order.push('second');
    });
    let ownerID = '';
    await expect(
      executeCollectionTransaction(async () => {
        ownerID = db._transactionID!;
        db.addCurrentCallback('commit', (id) => {
          ownerIDs.push(id);
          order.push('first');
          queueMicrotask(() => {
            order.push('microtask');
          });
        });
        db.addCurrentCallback('commit', second);
        expect(shared).toEqual([prefix]);
        expect(order).toEqual([]);
        return 7;
      }),
    ).resolves.toBe(7);
    expect(order).toEqual(['unrelated', 'first', 'second', 'microtask']);
    expect(ownerIDs).toEqual([ownerID, ownerID]);
    expect(second.mock.contexts).toEqual([undefined]);
    expect(prefix).toHaveBeenCalledWith(ownerID);
    expect(db.addCurrentCallback).toBe(previous);
    expect(Object.getOwnPropertyDescriptor(db, 'addCurrentCallback')).toEqual(originalDescriptor);
    expect(db._callbacks.current.commit).toBe(shared);
  });

  it.each(['throw', 'reject'] as const)(
    'settles committed callbacks once when an earlier shared callback %s fails',
    async (mode) => {
      const db = host();
      const shared = db._callbacks.current.commit;
      const failure = new Error('shared commit prefix failed');
      const prefix = vi.fn(() => {
        if (mode === 'throw') throw failure;
        return Promise.reject(failure);
      });
      shared.push(prefix);
      const commit = vi.fn();
      const unload = vi.fn();
      let ownerID = '';
      await expect(
        executeCollectionTransaction(async () => {
          ownerID = db._transactionID!;
          db.addCurrentCallback('commit', commit);
          db.addCurrentCallback('rollback', unload);
        }),
      ).rejects.toBe(failure);
      expect({ commits: commit.mock.calls, rollbacks: unload.mock.calls }).toEqual({
        commits: [[ownerID]],
        rollbacks: [],
      });
      await db.executeTransaction(async () => undefined);
      expect(commit).toHaveBeenCalledTimes(1);
      expect(unload).not.toHaveBeenCalled();
      expect(db._callbacks.current.commit).toBe(shared);
    },
  );

  it('runs owned rollback callbacks but never leaks owned commits into a later unrelated success', async () => {
    const db = host();
    const previous = db.addCurrentCallback;
    const shared = db._callbacks.current.commit;
    const prefix = vi.fn();
    shared.push(prefix);
    const commit = vi.fn();
    const rollback = vi.fn();
    const failure = new Error('SQL body failed');
    let ownerID = '';
    await expect(
      executeCollectionTransaction(async () => {
        ownerID = db._transactionID!;
        db.addCurrentCallback('commit', commit);
        db.addCurrentCallback('rollback', rollback);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(rollback).toHaveBeenCalledWith(ownerID);
    expect(commit).not.toHaveBeenCalled();
    expect(shared).toEqual([prefix]);
    expect(db.addCurrentCallback).toBe(previous);
    await db.executeTransaction(async () => undefined);
    expect(prefix).toHaveBeenCalledTimes(1);
    expect(prefix.mock.calls[0]![0]).not.toBe(ownerID);
    expect(commit).not.toHaveBeenCalled();
    expect(db._callbacks.current.commit).toBe(shared);
  });

  it('protects callbacks while an older native commit drainer overlaps the still-running body', async () => {
    const db = host();
    const oldStarted = Promise.withResolvers<void>();
    const releaseOld = Promise.withResolvers<void>();
    const old = db.executeTransaction(async () => {
      db.addCurrentCallback('commit', () => {
        oldStarted.resolve();
        return releaseOld.promise;
      });
    });
    await oldStarted.promise;
    const bodyStarted = Promise.withResolvers<void>();
    const releaseBody = Promise.withResolvers<void>();
    const commit = vi.fn();
    let ownerID = '';
    const owned = executeCollectionTransaction(async () => {
      ownerID = db._transactionID!;
      db.addCurrentCallback('commit', commit);
      bodyStarted.resolve();
      await releaseBody.promise;
      return 'saved';
    });
    await bodyStarted.promise;
    releaseOld.resolve();
    await old;
    expect(commit).not.toHaveBeenCalled();
    releaseBody.resolve();
    await expect(owned).resolves.toBe('saved');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(ownerID);
  });

  it.each(['resolve', 'reject'] as const)(
    'awaits a foreign drainer dispatching our asynchronous %s outcome',
    async (outcome) => {
      const db = host();
      const oldStarted = Promise.withResolvers<void>();
      const releaseOld = Promise.withResolvers<void>();
      const old = db.executeTransaction(async () => {
        db.addCurrentCallback('commit', () => {
          oldStarted.resolve();
          return releaseOld.promise;
        });
      });
      const oldOutcome = old.then(
        () => undefined,
        (error: unknown) => error,
      );
      await oldStarted.promise;
      const releaseOwnPrefix = Promise.withResolvers<void>();
      db._callbacks.current.commit.push(() => {
        releaseOld.resolve();
        return releaseOwnPrefix.promise;
      });
      const nativeReturned = Promise.withResolvers<void>();
      const nativeExecutor = db.executeTransaction.getMockImplementation()!;
      db.executeTransaction.mockImplementation(async (callback, options) => {
        const result = await nativeExecutor(callback, options);
        if (options) nativeReturned.resolve();
        return result;
      });
      const callbackStarted = Promise.withResolvers<void>();
      const releaseCallback = Promise.withResolvers<void>();
      const failure = new Error('owned callback failed');
      const afterAsync = vi.fn();
      let ownerID = '';
      let callbackID = '';
      let settled = false;
      const owned = executeCollectionTransaction(async () => {
        ownerID = db._transactionID!;
        db.addCurrentCallback('commit', async (id) => {
          callbackID = id;
          callbackStarted.resolve();
          await releaseCallback.promise;
          if (outcome === 'reject') throw failure;
        });
        db.addCurrentCallback('commit', afterAsync);
        return 'committed';
      }).then(
        (value) => {
          settled = true;
          return { value };
        },
        (error: unknown) => {
          settled = true;
          return { error };
        },
      );
      await callbackStarted.promise;
      releaseOwnPrefix.resolve();
      await nativeReturned.promise;
      expect(settled).toBe(false);
      expect(callbackID).toBe(ownerID);
      expect(afterAsync).not.toHaveBeenCalled();
      releaseCallback.resolve();
      if (outcome === 'reject') {
        await expect(owned).resolves.toEqual({ error: failure });
        await expect(oldOutcome).resolves.toBe(failure);
        expect(afterAsync).not.toHaveBeenCalled();
      } else {
        await expect(owned).resolves.toEqual({ value: 'committed' });
        await expect(oldOutcome).resolves.toBeUndefined();
        expect(afterAsync).toHaveBeenCalledWith(ownerID);
      }
    },
  );

  it('delegates foreign receivers, transaction IDs, types and original return values', async () => {
    const db = host();
    const other = createCollectionTransactionDB();
    const original = db.addCurrentCallback;
    const foreign = vi.fn();
    const token = Symbol('native return');
    await executeCollectionTransaction(async () => {
      const ownerID = db._transactionID;
      original.mockReturnValueOnce(token);
      db._transactionID = 'another-transaction';
      expect(db.addCurrentCallback('commit', foreign)).toBe(token);
      db._transactionID = ownerID;
      other._transactionID = 'other-receiver';
      db.addCurrentCallback.call(other, 'commit', foreign);
      expect(other._callbacks.current.commit).toEqual([foreign]);
      expect(() => db.addCurrentCallback('unsupported', foreign)).toThrow(
        'Unknown transaction callback type',
      );
    });
    expect(original.mock.contexts).toContain(other);
    expect(db.addCurrentCallback).toBe(original);
  });

  it('honors an intervening registrar replacement instead of overwriting it on exit', async () => {
    const db = host();
    const replacement = vi.fn();
    const commit = vi.fn();
    await executeCollectionTransaction(async () => {
      db.addCurrentCallback('commit', commit);
      db.addCurrentCallback = replacement;
    });
    expect(db.addCurrentCallback).toBe(replacement);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('delegates through an interceptor retained by another plugin after the owned body exits', async () => {
    const db = host();
    const previous = db.addCurrentCallback;
    const nativeExecutor = db.executeTransaction.getMockImplementation()!;
    const late = vi.fn();
    const owned = vi.fn();
    let replacement: CollectionTransactionTestDB['addCurrentCallback'] | undefined;
    db.executeTransaction.mockImplementation((callback, options) =>
      nativeExecutor(async () => {
        const result = await callback();
        // The native ID still belongs to us here, but our entered body has ended.
        expect(db._transactionID).not.toBeNull();
        db.addCurrentCallback('commit', late);
        expect(db._callbacks.current.commit).toContain(late);
        return result;
      }, options),
    );
    await executeCollectionTransaction(async () => {
      db.addCurrentCallback('commit', owned);
      const retained = db.addCurrentCallback;
      replacement = vi.fn(function (
        this: CollectionTransactionTestDB,
        type: string,
        registered: CollectionTestTransactionCallback,
      ) {
        return retained.call(this, type, registered);
      });
      db.addCurrentCallback = replacement;
    });
    expect(db.addCurrentCallback).toBe(replacement);
    expect(previous).toHaveBeenCalledWith('commit', late);
    expect(late).toHaveBeenCalledTimes(1);
    expect(owned).toHaveBeenCalledTimes(1);
  });

  it('restores an inherited registrar without leaving an own-property shadow', async () => {
    const db = host();
    const previous = db.addCurrentCallback;
    Object.setPrototypeOf(db, { addCurrentCallback: previous });
    Reflect.deleteProperty(db, 'addCurrentCallback');
    await executeCollectionTransaction(async () => {
      db.addCurrentCallback('commit', vi.fn());
    });
    expect(db.addCurrentCallback).toBe(previous);
    expect(Object.hasOwn(db, 'addCurrentCallback')).toBe(false);
  });

  it('restores the native commit counter descriptor and preserves its committed value', async () => {
    const db = host();
    const descriptor = Object.getOwnPropertyDescriptor(db, '_commitCount')!;
    await executeCollectionTransaction(async () => undefined);
    expect(Object.getOwnPropertyDescriptor(db, '_commitCount')).toEqual({
      ...descriptor,
      value: 1,
    });
  });

  it('preserves foreign accessors retaining the scoped SQL observer after it is inactive', async () => {
    const db = host();
    let count = 0;
    const originalGet = vi.fn(() => count);
    const originalSet = vi.fn((value: number) => {
      count = value;
    });
    Object.defineProperty(db, '_commitCount', {
      configurable: true,
      enumerable: true,
      get: originalGet,
      set: originalSet,
    });
    const failure = new Error('shared prefix failed');
    db._callbacks.current.commit.push(() => {
      throw failure;
    });
    const commit = vi.fn();
    const rollback = vi.fn();
    let foreignDescriptor: PropertyDescriptor | undefined;
    await expect(
      executeCollectionTransaction(async () => {
        const retained = Object.getOwnPropertyDescriptor(db, '_commitCount')!;
        Object.defineProperty(db, '_commitCount', {
          configurable: true,
          enumerable: true,
          get() {
            return retained.get!.call(this);
          },
          set(value: number) {
            retained.set!.call(this, value);
          },
        });
        foreignDescriptor = Object.getOwnPropertyDescriptor(db, '_commitCount');
        db.addCurrentCallback('commit', commit);
        db.addCurrentCallback('rollback', rollback);
      }),
    ).rejects.toBe(failure);
    expect(Object.getOwnPropertyDescriptor(db, '_commitCount')).toEqual(foreignDescriptor);
    expect({
      count,
      commits: commit.mock.calls.length,
      rollbacks: rollback.mock.calls.length,
    }).toEqual({
      count: 1,
      commits: 1,
      rollbacks: 0,
    });
    await db.executeTransaction(async () => undefined);
    expect(count).toBe(2);
    expect(originalSet.mock.calls).toEqual([[1], [2]]);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
  });

  it('does not mistake a later unrelated SQL commit for the rolled-back owner outcome', async () => {
    const db = host();
    const rollbackStarted = Promise.withResolvers<void>();
    const releaseRollback = Promise.withResolvers<void>();
    db._callbacks.current.rollback.push(() => {
      rollbackStarted.resolve();
      return releaseRollback.promise;
    });
    const failure = new Error('owner SQL body failed');
    const commit = vi.fn();
    const rollback = vi.fn();
    const owned = executeCollectionTransaction(async () => {
      db.addCurrentCallback('commit', commit);
      db.addCurrentCallback('rollback', rollback);
      throw failure;
    }).catch((error: unknown) => error);
    await rollbackStarted.promise;
    await db.executeTransaction(async () => undefined);
    expect(db._commitCount).toBe(1);
    releaseRollback.resolve();
    expect(await owned).toBe(failure);
    expect(commit).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it('discards held rollback callbacks before a commit callback error can unload committed objects', async () => {
    const db = host();
    const unload = vi.fn();
    const failure = new Error('commit side effect failed');
    await expect(
      executeCollectionTransaction(async () => {
        db.addCurrentCallback('rollback', unload);
        db.addCurrentCallback('commit', () => {
          throw failure;
        });
      }),
    ).rejects.toBe(failure);
    expect(unload).not.toHaveBeenCalled();
  });

  it('dispatches only rollback callbacks when native SQL commit fails after the body succeeds', async () => {
    const db = host();
    const commit = vi.fn();
    const rollback = vi.fn();
    const failure = new Error('SQL COMMIT failed');
    db.executeTransaction.mockImplementationOnce(async (callback, options) => {
      db._transactionID = 'commit-failure-owner';
      await callback();
      db._transactionID = null;
      await options!.onRollback!('foreign-dispatcher');
      throw failure;
    });
    await expect(
      executeCollectionTransaction(async () => {
        db.addCurrentCallback('commit', commit);
        db.addCurrentCallback('rollback', rollback);
      }),
    ).rejects.toBe(failure);
    expect(commit).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledWith('commit-failure-owner');
  });

  it('propagates admission failure without awaiting a nonexistent owned outcome', async () => {
    const db = host();
    const previous = db.addCurrentCallback;
    const failure = new Error('native admission failed');
    db.executeTransaction.mockRejectedValueOnce(failure);
    const body = vi.fn(async () => undefined);
    await expect(executeCollectionTransaction(body)).rejects.toBe(failure);
    expect(body).not.toHaveBeenCalled();
    expect(db.addCurrentCallback).toBe(previous);
  });
});
