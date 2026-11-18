import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cleanup } from '../../src/core/cleanup';
import type { ItemAttributeDefinition } from '../../src/item-attributes/types';
import {
  mountLiteratureTable,
  type LiteratureItem,
  type LiteratureScope,
} from '../../src/literature-table/controller';
import type {
  LiteratureTableCommand,
  LiteratureTableModel,
} from '../../src/literature-table/model';
import type { NativeReactViewOptions } from '../../src/ui/react/types';

const bridge = vi.hoisted(() => ({ mount: vi.fn() }));
vi.mock('../../src/platform/native-ui', () => ({ mountNativeReactView: bridge.mount }));

const library: LiteratureScope = { id: 'library:1', label: 'My Library' };
const collection: LiteratureScope = { id: 'collection:2', label: 'Research' };
const score: ItemAttributeDefinition = {
  id: 'score',
  key: 'Research Score',
  label: 'Score',
  type: 'number',
};

const cleanups: Cleanup[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  bridge.mount.mockReset();
});

function item(id: number, extra = ''): LiteratureItem {
  return { id, title: `Paper ${id}`, year: '2026', extra };
}

function open(initialID: string | undefined = collection.id) {
  const updates: LiteratureTableModel[] = [];
  const reads: Array<{ id: string } & PromiseWithResolvers<readonly LiteratureItem[]>> = [];
  let dispatch!: (command: LiteratureTableCommand) => void;
  let changed: (() => void) | undefined;
  const disposeView = vi.fn();
  const reportError = vi.fn();
  const locate = vi.fn((_id: number) => Promise.resolve(true));
  const unobserve = vi.fn(() => {
    changed = undefined;
  });
  const catalog = { scopes: [library, collection], definitions: [score] };
  bridge.mount.mockImplementationOnce(
    (options: NativeReactViewOptions<LiteratureTableModel, LiteratureTableCommand>) => {
      expect(options.surface).toBe('literature-table');
      dispatch = options.dispatch;
      updates.push(options.model);
      return {
        ready: Promise.resolve(),
        update: (model: LiteratureTableModel) => {
          updates.push(model);
        },
        getElement: () => null,
        dispose: disposeView,
      };
    },
  );
  const dispose = mountLiteratureTable(
    {} as HTMLElement,
    {
      scopes: () => catalog.scopes,
      initialScopeID: () => initialID,
      definitions: () => catalog.definitions,
      readItems(id) {
        const gate = Promise.withResolvers<readonly LiteratureItem[]>();
        reads.push({ id, ...gate });
        return gate.promise;
      },
      observe(change) {
        changed = change;
        return unobserve;
      },
      locate,
    },
    'en',
    reportError,
  );
  cleanups.push(dispose);
  return {
    get model() {
      return updates.at(-1)!;
    },
    send: dispatch,
    notify: () => changed?.(),
    reads,
    updates,
    catalog,
    locate,
    reportError,
    dispose,
    disposeView,
    unobserve,
  };
}

describe('literature table read-only workbench', () => {
  it('sorts numbers exactly, preserves spelling, and keeps unorderable cells last both ways', async () => {
    const table = open();
    table.reads[0]!.resolve([
      item(18),
      item(6, 'Research Score: 9007199254740993'),
      item(10, 'Research Score: 2.00'),
      item(8, 'Research Score: -2.01'),
      item(9, 'Research Score: 10'),
      item(16, 'Research Score: 0x10'),
      item(5, 'Research Score: 9007199254740992'),
      item(14, 'Research Score: 2\nresearch_score: 10'),
      item(2, 'Research Score: 2e0'),
      item(4, 'Research Score: 1e-400'),
      item(3, 'Research Score: 0'),
    ]);
    await Promise.resolve();
    expect(table.model.columns.map(({ id }) => id)).toEqual(['title', 'year']);
    table.send({ type: 'column', id: 'score' });
    table.send({ type: 'sort', id: 'attribute:score' });
    expect(table.model.rows.map(({ id }) => id)).toEqual([8, 3, 4, 2, 10, 9, 5, 6, 14, 16, 18]);
    expect(table.model.rows.map(({ cells }) => cells[2])).toEqual([
      { state: 'value', value: '-2.01' },
      { state: 'value', value: '0' },
      { state: 'value', value: '1e-400' },
      { state: 'value', value: '2e0' },
      { state: 'value', value: '2.00' },
      { state: 'value', value: '10' },
      { state: 'value', value: '9007199254740992' },
      { state: 'value', value: '9007199254740993' },
      { state: 'ambiguous' },
      { state: 'invalid', value: '0x10' },
      { state: 'missing' },
    ]);
    table.send({ type: 'sort', id: 'attribute:score' });
    expect(table.model.rows.map(({ id }) => id)).toEqual([6, 5, 9, 2, 10, 4, 3, 8, 14, 16, 18]);
    expect(table.locate).not.toHaveBeenCalled();
  });

  it('starts at the native scope and retires selected, notified and disposed reads', async () => {
    const table = open();
    expect(table.model.scope).toEqual(collection);
    expect(table.model.status).toBe('loading');
    table.send({ type: 'scope', id: library.id });
    table.reads[0]!.reject(new Error('old scope failed'));
    await Promise.resolve();
    expect(table.model.scope).toEqual(library);
    expect(table.model.status).toBe('loading');
    expect(table.reportError).not.toHaveBeenCalled();

    // The old promise resolves before the queued refresh callback, but must not publish.
    table.reads[1]!.resolve([item(12)]);
    table.notify();
    table.notify();
    await Promise.resolve();
    expect(table.reads.map(({ id }) => id)).toEqual([collection.id, library.id, library.id]);
    expect(table.updates.some(({ rows }) => rows.some(({ id }) => id === 12))).toBe(false);
    table.reads[2]!.resolve([item(13)]);
    await Promise.resolve();
    expect(table.model.status).toBe('ready');
    expect(table.model.rows.map(({ id }) => id)).toEqual([13]);

    table.notify();
    await Promise.resolve();
    table.notify();
    table.dispose();
    const lastUpdate = table.model;
    table.reads[3]!.reject(new Error('retired window read failed'));
    await Promise.resolve();
    expect(table.reads).toHaveLength(4);
    expect(table.model).toBe(lastUpdate);
    expect(table.reportError).not.toHaveBeenCalled();
    expect(table.unobserve).toHaveBeenCalledTimes(1);
    expect(table.disposeView).toHaveBeenCalledTimes(1);
  });

  it('offers retry for active failures and keeps a deleted scope until the user switches', async () => {
    const table = open();
    const error = new Error('current load failed');
    table.reads[0]!.reject(error);
    await Promise.resolve();
    expect(table.model.status).toBe('error');
    expect(table.reportError).toHaveBeenCalledWith(error);
    table.send({ type: 'retry' });
    table.send({ type: 'retry' });
    expect(table.reads).toHaveLength(2);
    table.reads[1]!.resolve([]);
    await Promise.resolve();
    expect(table.model).toMatchObject({ status: 'ready', total: 0, rows: [] });

    table.catalog.scopes = [library];
    table.notify();
    await Promise.resolve();
    expect(table.model).toMatchObject({
      status: 'unavailable',
      scope: collection,
      scopes: [library],
    });
    expect(table.reads).toHaveLength(2);
    table.send({ type: 'retry' });
    expect(table.model.status).toBe('unavailable');
    table.send({ type: 'scope', id: library.id });
    expect(table.reads[2]!.id).toBe(library.id);
    table.reads[2]!.resolve([item(1)]);
    await Promise.resolve();
    expect(table.model).toMatchObject({ status: 'ready', scope: library, total: 1 });
    expect(table.locate).not.toHaveBeenCalled();
  });

  it('uses window-local columns, sorts and paginates before projecting visible rows', async () => {
    const table = open('unknown');
    expect(table.model.scope).toEqual(library);
    table.reads[0]!.resolve(Array.from({ length: 51 }, (_, index) => item(51 - index)));
    await Promise.resolve();
    expect(table.model).toMatchObject({ page: 1, pageCount: 2, total: 51 });
    expect(table.model.rows).toHaveLength(50);
    expect(table.model.rows[0]!.id).toBe(1);
    table.send({ type: 'column', id: 'score' });
    table.send({ type: 'page', delta: 1 });
    expect(table.model.rows.map(({ id }) => id)).toEqual([51]);
    const another = open();
    expect(another.model.columns.map(({ id }) => id)).toEqual(['title', 'year']);
    expect(another.model).toMatchObject({
      sortColumn: 'title',
      sortDirection: 'ascending',
      page: 1,
    });
    table.notify();
    await Promise.resolve();
    table.reads[1]!.resolve([item(1, 'Research Score: 4')]);
    await Promise.resolve();
    expect(table.model).toMatchObject({ page: 1, pageCount: 1 });
    expect(table.model.rows[0]!.cells[2]).toEqual({ state: 'value', value: '4' });

    table.send({ type: 'sort', id: 'attribute:score' });
    table.catalog.definitions = [];
    table.notify();
    await Promise.resolve();
    table.reads[2]!.resolve([item(1)]);
    await Promise.resolve();
    expect(table.model.columns.map(({ id }) => id)).toEqual(['title', 'year']);
    expect(table.model).toMatchObject({ sortColumn: 'title', sortDirection: 'ascending' });
  });

  it('only locates visible rows once at a time and shows failure without changing scope', async () => {
    const table = open();
    table.reads[0]!.resolve([item(1), item(2)]);
    await Promise.resolve();
    const pending = Promise.withResolvers<boolean>();
    table.locate.mockReturnValueOnce(pending.promise);
    table.send({ type: 'locate', id: 99 });
    table.send({ type: 'locate', id: 1 });
    table.send({ type: 'locate', id: 2 });
    expect(table.locate.mock.calls).toEqual([[1]]);
    expect(table.model.locating).toBe(true);
    pending.resolve(false);
    await Promise.resolve();
    expect(table.model).toMatchObject({ locating: false, locateFailed: true, scope: collection });
    table.send({ type: 'locate', id: 2 });
    await Promise.resolve();
    expect(table.locate.mock.calls).toEqual([[1], [2]]);
    expect(table.model).toMatchObject({ locating: false, locateFailed: false, scope: collection });
  });
});
