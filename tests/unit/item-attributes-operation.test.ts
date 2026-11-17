import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAttributeValue } from '../../src/item-attributes/extra';
import type { ItemAttributeDefinition, ItemAttributeState } from '../../src/item-attributes/types';
import { setItemAttribute } from '../../src/operations/item-attributes';
import { createCollectionTransactionDB } from '../fixtures/collection-transactions';

const definition: ItemAttributeDefinition = {
  id: 'score',
  key: 'Research Score',
  label: 'Score',
  type: 'number',
};
const originalZotero = Reflect.get(globalThis, 'Zotero');
afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

type FieldValue = string | number | boolean;
function harness(initial: readonly string[]) {
  const db = createCollectionTransactionDB();
  const library = { id: 1, editable: true, archived: false, libraryType: 'user' };
  const disk = new Map<number, Map<string, FieldValue>>();
  const records = initial.map((extra, index) => {
    const fields = new Map<string, FieldValue>([
      ['extra', extra],
      ['title', `Title ${index + 1}`],
      ['dateModified', 'before'],
      ['synced', true],
      ['clientVersion', 1],
    ]);
    const record = {
      id: index + 1,
      libraryID: 1,
      deleted: false,
      regular: true,
      editable: true,
      dirty: false,
      isFeedItem: false,
      fields,
      getField: (name: string) => fields.get(name) ?? '',
      setField: vi.fn((name: string, value: FieldValue) => {
        const normalized = typeof value === 'string' ? value.trim().normalize() : value;
        if (fields.get(name) !== normalized) record.dirty = true;
        fields.set(name, normalized);
      }),
      isRegularItem: () => record.regular,
      isEditable: () => record.editable,
      hasChanged: () => record.dirty,
      save: vi.fn(async (_options?: unknown) => {
        fields.set('dateModified', 'after');
        fields.set('synced', false);
        fields.set('clientVersion', 2);
        disk.set(record.id, new Map(fields));
        record.dirty = false;
        return true;
      }),
    };
    disk.set(record.id, new Map(fields));
    return record;
  });
  const items = records as unknown as Zotero.Item[];
  const cache = new Map(items.map((item) => [item.id, item]));
  const nativeExecute = db.executeTransaction;
  const admission = { before: undefined as (() => void | Promise<void>) | undefined };
  db.executeTransaction = vi.fn(async (callback, options) => {
    await admission.before?.();
    const before = new Map([...disk].map(([id, fields]) => [id, new Map(fields)]));
    const commits = db._commitCount;
    try {
      return await nativeExecute(callback, options);
    } catch (error) {
      if (commits === db._commitCount) {
        disk.clear();
        for (const [id, fields] of before) disk.set(id, fields);
      }
      throw error;
    }
  });
  Reflect.set(globalThis, 'Zotero', {
    DB: db,
    Items: { get: (id: number) => cache.get(id) },
    Libraries: { get: (id: number) => (id === library.id ? library : undefined) },
    debug: vi.fn(),
    logError: vi.fn(),
  });
  const expected = new Map(
    items.map((item) => [item.id, readAttributeValue(item.getField('extra'), definition.key)]),
  );
  const request = { expected, isCurrent: () => true };
  return { records, items, library, disk, cache, db, admission, request };
}

describe('explicit atomic item attribute edits', () => {
  it('sets zero and negative fractions on unique explicit targets using real native Undo save options', async () => {
    const h = harness([
      'Research Score: 2\r\nOther: keep',
      'Research Score: 0',
      'Research Score: 99',
    ]);
    const count = await setItemAttribute(
      [h.items[0]!, h.items[1]!, h.items[0]!],
      definition,
      '0',
      h.request,
    );
    expect(count).toBe(1);
    expect(h.records[0]!.getField('extra')).toBe('Research Score: 0\r\nOther: keep');
    expect(h.records[0]!.save).toHaveBeenCalledWith({
      undoAction: 'undo-action-edit-metadata',
      undoActionArgs: { count: 1 },
    });
    expect(h.records[1]!.save).not.toHaveBeenCalled();
    expect(h.records[2]!.save).not.toHaveBeenCalled();
    expect(h.disk.get(3)!.get('extra')).toBe('Research Score: 99');
    const current = new Map([
      [1, readAttributeValue(h.items[0]!.getField('extra'), definition.key)],
    ]);
    expect(
      await setItemAttribute([h.items[0]!], definition, '-0.25', {
        expected: current,
        isCurrent: () => true,
      }),
    ).toBe(1);
    expect(h.records[0]!.getField('extra')).toBe('Research Score: -0.25\r\nOther: keep');
  });

  it('clears only the selected field and never saves unchanged targets', async () => {
    const h = harness(['Research Score: 2\r\nOther: keep', 'Other: alone']);
    expect(await setItemAttribute(h.items, definition, null, h.request)).toBe(1);
    expect(h.disk.get(1)!.get('extra')).toBe('Other: keep');
    expect(h.records[1]!.save).not.toHaveBeenCalled();
    const unchanged = harness(['Research Score: 0']);
    expect(await setItemAttribute(unchanged.items, definition, '0', unchanged.request)).toBe(0);
    expect(unchanged.records[0]!.setField).not.toHaveBeenCalled();
    expect(unchanged.records[0]!.save).not.toHaveBeenCalled();
  });

  it.each(['Other: one', 'A: one\r\nB: two', 'A: one\rB: two', 'A: one\nB: two', ''])(
    'roundtrips a normal native append and final-key clear: %j',
    async (extra) => {
      const h = harness([extra]);
      expect(await setItemAttribute(h.items, definition, '3', h.request)).toBe(1);
      const expected = new Map([
        [1, readAttributeValue(h.items[0]!.getField('extra'), definition.key)],
      ]);
      expect(
        await setItemAttribute(h.items, definition, null, { expected, isCurrent: () => true }),
      ).toBe(1);
      expect(h.records[0]!.getField('extra')).toBe(extra);
      expect(h.disk.get(1)!.get('extra')).toBe(extra);
    },
  );

  it('uses unrelated latest saved Extra at asynchronous admission rather than the preview', async () => {
    const h = harness(['Research Score: 2\r\nOther: old']);
    h.admission.before = () => {
      h.records[0]!.fields.set('extra', 'Research Score: 2\r\nOther: latest\r\nNew: retained');
      h.disk.set(1, new Map(h.records[0]!.fields));
    };
    await setItemAttribute(h.items, definition, '3', h.request);
    expect(h.disk.get(1)!.get('extra')).toBe('Research Score: 3\r\nOther: latest\r\nNew: retained');
  });

  it('requires expected snapshots for every target and refuses ambiguous lines', async () => {
    const h = harness(['Research Score: 2', 'Research Score: 3']);
    h.request.expected.delete(2);
    await expect(setItemAttribute(h.items, definition, '0', h.request)).rejects.toThrow(/expected/);
    expect(h.db.executeTransaction).not.toHaveBeenCalled();
    expect(h.records.every((item) => item.save.mock.calls.length === 0)).toBe(true);
    const ambiguous = harness(['Research Score: 2\nresearch_score: 2']);
    await expect(
      setItemAttribute(ambiguous.items, definition, '0', ambiguous.request),
    ).rejects.toThrow(/unambiguous/);
    expect(ambiguous.records[0]!.save).not.toHaveBeenCalled();
  });

  it.each(['field', 'duplicate', 'retired', 'library', 'identity', 'deleted', 'type', 'dirty'])(
    'rejects %s changes while awaiting admission without any item mutation',
    async (change) => {
      const h = harness(['Research Score: 2', 'Research Score: 3']);
      let current = true;
      h.request.isCurrent = () => current;
      h.admission.before = () => {
        if (change === 'field') h.records[1]!.fields.set('extra', 'Research Score: 9');
        if (change === 'duplicate')
          h.records[1]!.fields.set('extra', 'Research Score: 3\nresearch_score: 3');
        if (change === 'retired') current = false;
        if (change === 'library') h.library.editable = false;
        if (change === 'identity') h.cache.delete(2);
        if (change === 'deleted') h.records[1]!.deleted = true;
        if (change === 'type') h.records[1]!.regular = false;
        if (change === 'dirty') {
          h.records[1]!.fields.set('title', 'Unfinished native edit');
          h.records[1]!.dirty = true;
        }
      };
      await expect(setItemAttribute(h.items, definition, '0', h.request)).rejects.toThrow();
      expect(h.records.every((item) => item.save.mock.calls.length === 0)).toBe(true);
      expect(h.records.every((item) => item.setField.mock.calls.length === 0)).toBe(true);
      if (change === 'dirty')
        expect(h.records[1]!.getField('title')).toBe('Unfinished native edit');
    },
  );

  it.each([
    'read-only',
    'archived',
    'feed',
    'item-read-only',
    'invalid-library',
    'unsaved',
    'note',
  ])('refuses %s targets before opening a transaction', async (kind) => {
    const h = harness(['Research Score: 2']);
    if (kind === 'read-only') h.library.editable = false;
    if (kind === 'archived') h.library.archived = true;
    if (kind === 'feed') h.library.libraryType = 'feed';
    if (kind === 'item-read-only') h.records[0]!.editable = false;
    if (kind === 'invalid-library') h.records[0]!.libraryID = 99;
    if (kind === 'unsaved') h.records[0]!.id = 0;
    if (kind === 'note') h.records[0]!.regular = false;
    await expect(setItemAttribute(h.items, definition, '3', h.request)).rejects.toThrow();
    expect(h.db.executeTransaction).not.toHaveBeenCalled();
    expect(h.records[0]!.save).not.toHaveBeenCalled();
  });

  it.each(['NaN', 'Infinity', '1e999', '1,5', '3\nOther: injection'])(
    'rejects invalid input %j before any writes',
    async (input) => {
      const h = harness(['Research Score: 2']);
      await expect(setItemAttribute(h.items, definition, input, h.request)).rejects.toThrow();
      expect(h.db.executeTransaction).not.toHaveBeenCalled();
    },
  );

  it('rejects native normalization rather than silently changing unrelated bytes', async () => {
    const h = harness(['Research Score: 2\r\nOther: e\u0301']);
    await expect(setItemAttribute(h.items, definition, '3', h.request)).rejects.toThrow(
      /edit Extra manually/,
    );
    expect(h.records[0]!.setField).not.toHaveBeenCalled();
    expect(h.records[0]!.save).not.toHaveBeenCalled();
    expect(h.records[0]!.getField('extra')).toBe('Research Score: 2\r\nOther: e\u0301');
  });

  it('rolls back earlier successful saves and native save metadata if a later save fails', async () => {
    const h = harness(['Research Score: 2\r\nOther: one', 'Research Score: 3\r\nOther: two']);
    h.records[1]!.save.mockRejectedValueOnce(new Error('Disk write failed'));
    await expect(setItemAttribute(h.items, definition, '0', h.request)).rejects.toThrow(
      'Disk write failed',
    );
    expect(h.records[0]!.getField('extra')).toBe('Research Score: 2\r\nOther: one');
    expect(h.records[1]!.getField('extra')).toBe('Research Score: 3\r\nOther: two');
    expect(h.records[0]!.getField('dateModified')).toBe('before');
    expect(h.records[0]!.getField('synced')).toBe(true);
    expect(h.records[0]!.getField('clientVersion')).toBe(1);
    expect(h.disk.get(1)!.get('extra')).toBe('Research Score: 2\r\nOther: one');
    expect(h.disk.get(2)!.get('extra')).toBe('Research Score: 3\r\nOther: two');
    expect(h.db._commitCount).toBe(0);
  });

  it.each(['append', 'clear'])('restores exact Extra after a failed %s batch', async (kind) => {
    const initial =
      kind === 'append'
        ? ['Other: one', 'Other: two']
        : ['Other: one\r\nResearch Score: 2', 'Research Score: 3\r\nOther: two'];
    const h = harness(initial);
    h.records[1]!.save.mockRejectedValueOnce(new Error('Batch failed'));
    await expect(
      setItemAttribute(h.items, definition, kind === 'append' ? '0' : null, h.request),
    ).rejects.toThrow('Batch failed');
    for (const [index, extra] of initial.entries()) {
      expect(h.records[index]!.getField('extra')).toBe(extra);
      expect(h.disk.get(index + 1)!.get('extra')).toBe(extra);
    }
  });

  it('preserves later unrelated in-memory edits while restoring operation-owned changes', async () => {
    const h = harness(['Research Score: 2\r\nOther: one', 'Research Score: 3']);
    h.records[1]!.save.mockImplementationOnce(async () => {
      h.records[0]!.setField('extra', 'Research Score: 0\r\nOther: edited later');
      h.records[0]!.setField('title', 'Later native edit');
      throw new Error('Second save failed');
    });
    await expect(setItemAttribute(h.items, definition, '0', h.request)).rejects.toThrow(
      'Second save failed',
    );
    expect(h.records[0]!.getField('extra')).toBe('Research Score: 2\r\nOther: edited later');
    expect(h.records[0]!.getField('title')).toBe('Later native edit');
    expect(h.records[0]!.dirty).toBe(true);
    expect(h.disk.get(1)!.get('extra')).toBe('Research Score: 2\r\nOther: one');
  });

  it('does not overwrite a later edit to the target field when aborting', async () => {
    const h = harness(['Research Score: 2', 'Research Score: 3']);
    h.records[0]!.save.mockImplementationOnce(async () => {
      h.records[0]!.setField('extra', 'Research Score: 99');
      return true;
    });
    await expect(setItemAttribute(h.items, definition, '0', h.request)).rejects.toThrow(/changed/);
    expect(h.records[0]!.getField('extra')).toBe('Research Score: 99');
    expect(h.records[1]!.save).not.toHaveBeenCalled();
  });

  it('rechecks retired requests and earlier target permissions after awaited saves', async () => {
    const h = harness(['Research Score: 2', 'Research Score: 3']);
    let current = true;
    h.request.isCurrent = () => current;
    h.records[0]!.save.mockImplementationOnce(async () => {
      current = false;
      return true;
    });
    await expect(setItemAttribute(h.items, definition, '0', h.request)).rejects.toThrow(
      /no longer current/,
    );
    expect(h.records[0]!.getField('extra')).toBe('Research Score: 2');
    expect(h.records[1]!.save).not.toHaveBeenCalled();
    const permissions = harness(['Research Score: 2', 'Research Score: 3']);
    permissions.records[1]!.save.mockImplementationOnce(async () => {
      permissions.records[0]!.editable = false;
      return true;
    });
    await expect(
      setItemAttribute(permissions.items, definition, '0', permissions.request),
    ).rejects.toThrow(/read-only/);
    expect(permissions.records[0]!.getField('extra')).toBe('Research Score: 2');
    expect(permissions.records[1]!.getField('extra')).toBe('Research Score: 3');
  });

  it('restores a pending batch if a later target becomes dirty during an earlier save', async () => {
    const h = harness(['Research Score: 2', 'Research Score: 3']);
    h.records[0]!.save.mockImplementationOnce(async () => {
      h.records[1]!.setField('title', 'Pending edit');
      return true;
    });
    await expect(setItemAttribute(h.items, definition, '0', h.request)).rejects.toThrow(
      /Finish and save native/,
    );
    expect(h.records[0]!.getField('extra')).toBe('Research Score: 2');
    expect(h.records[1]!.getField('title')).toBe('Pending edit');
    expect(h.records[1]!.save).not.toHaveBeenCalled();
  });

  it('does not falsely restore SQL-committed values when native post-commit notification fails', async () => {
    const h = harness(['Research Score: 2']);
    h.admission.before = () => {
      // A shared native commit observer, not an operation-owned callback.
      h.db._callbacks.current.commit.push(() => {
        throw new Error('Native notifier failed');
      });
    };
    expect(await setItemAttribute(h.items, definition, '0', h.request)).toBe(1);
    expect(h.db._commitCount).toBe(1);
    expect(h.records[0]!.getField('extra')).toBe('Research Score: 0');
    expect(h.disk.get(1)!.get('extra')).toBe('Research Score: 0');
  });

  it('captures caller snapshots before async admission rather than trusting a mutable map', async () => {
    const h = harness(['Research Score: 2']);
    const callerState: { value: string | null; ambiguous: boolean } = {
      value: '2',
      ambiguous: false,
    };
    const expected = new Map<number, ItemAttributeState>([[1, callerState]]);
    h.admission.before = () => {
      callerState.value = '99';
      h.records[0]!.fields.set('extra', 'Research Score: 99');
    };
    await expect(
      setItemAttribute(h.items, definition, '0', { expected, isCurrent: () => true }),
    ).rejects.toThrow(/changed/);
    expect(h.records[0]!.save).not.toHaveBeenCalled();
  });
});
