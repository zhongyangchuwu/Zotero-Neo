import { afterEach, describe, expect, it, vi } from 'vitest';

import { setItemTag } from '../../src/operations/item-tags';
import { createCollectionTransactionDB } from '../fixtures/collection-transactions';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

type MutableTagItem = Zotero.Item & { readonly saves: ReturnType<typeof vi.fn> };

function tagItem(
  id: number,
  options: {
    tags?: Array<{ tag: string; type: number }>;
    saveError?: Error;
  } = {},
): MutableTagItem {
  const tags = new Map((options.tags ?? []).map((tag) => [tag.tag, tag.type]));
  const saves = vi.fn(async () => {
    if (options.saveError) throw options.saveError;
  });
  return {
    id,
    libraryID: 1,
    isRegularItem: () => true,
    isEditable: () => true,
    hasChanged: () => false,
    reload: async () => undefined,
    isAttachment: () => false,
    isNote: () => false,
    hasTag: (tag: string) => tags.has(tag),
    getTagType: (tag: string) => tags.get(tag) ?? 0,
    getTags: () => [...tags].map(([tag, type]) => ({ tag, type })),
    addTag: (tag: string, type = 0) => {
      if (tags.has(tag)) return false;
      tags.set(tag, type);
      return true;
    },
    removeTag: (tag: string) => tags.delete(tag),
    save: saves,
    saves,
  } as unknown as MutableTagItem;
}

function installHost(items: readonly Zotero.Item[]) {
  const byID = new Map(items.map((item) => [item.id, item]));
  const db = createCollectionTransactionDB();
  vi.stubGlobal('Zotero', {
    DB: db,
    Items: { get: (id: number) => byID.get(id) ?? false },
    Libraries: { get: () => ({ editable: true, libraryType: 'user' }) },
  });
  return {
    db,
    request: { isCurrent: () => true, logger: { debug: vi.fn(), diagnostic: vi.fn() } },
  };
}

describe('semantic multi-target tag action', () => {
  it('saves only items that need a change and preserves an existing automatic tag', async () => {
    const first = tagItem(1, { tags: [{ tag: 'robotics', type: 1 }] });
    const second = tagItem(2);

    const { request } = installHost([first, second]);

    await expect(setItemTag([first, second], 'robotics', true, request)).resolves.toEqual({
      done: 1,
      unchanged: 1,
    });
    expect(first.saves).not.toHaveBeenCalled();
    expect(second.saves).toHaveBeenCalledTimes(1);
    expect(second.getTagType('robotics')).toBe(0);
    expect(first.getTagType('robotics')).toBe(1);

    await expect(setItemTag([first, second], 'robotics', false, request)).resolves.toEqual({
      done: 2,
    });
    expect(first.saves).toHaveBeenCalledTimes(1);
    expect(second.saves).toHaveBeenCalledTimes(2);
  });

  it.each([0, 1])(
    'preserves managed identities of type %i without blocking ordinary automatic tags',
    async (type) => {
      const identity = 'urn:zotero-neo:chapter-note:v1:' + 'f'.repeat(32);
      const owner = tagItem(7, {
        tags: [
          { tag: identity, type },
          { tag: 'topic', type: 1 },
        ],
      });
      const other = tagItem(8);
      const { request } = installHost([owner, other]);
      const before = owner.getTags();

      await expect(setItemTag([owner, other], ` ${identity} `, false, request)).rejects.toThrow();
      await expect(setItemTag([owner, other], identity, true, request)).rejects.toThrow();
      expect(owner.getTags()).toEqual(before);
      expect(other.hasTag(identity)).toBe(false);

      await expect(setItemTag([owner], 'topic', false, request)).resolves.toEqual({ done: 1 });
      expect(owner.hasTag('topic')).toBe(false);
      expect(owner.getTagType(identity)).toBe(type);
    },
  );

  it.each([true, false])(
    'restores only the failed item and continues the batch when assigning = %s',
    async (present) => {
      const original = present ? [] : [{ tag: 'topic', type: 1 }];
      const unrelated = { tag: 'other', type: 0 };
      const first = tagItem(1, { tags: original });
      const failed = tagItem(2, {
        tags: [...original, unrelated],
        saveError: new Error('save failed'),
      });
      const last = tagItem(3, { tags: original });
      const { db, request } = installHost([first, failed, last]);

      await expect(setItemTag([first, failed, last], 'topic', present, request)).resolves.toEqual({
        done: 2,
        failed: 1,
      });
      expect(db._commitCount).toBe(2);
      expect(first.hasTag('topic')).toBe(present);
      expect(last.hasTag('topic')).toBe(present);
      expect(failed.hasTag('topic')).toBe(!present);
      if (!present) expect(failed.getTagType('topic')).toBe(1);
      expect(failed.hasTag(unrelated.tag)).toBe(true);
      expect(request.logger.debug).toHaveBeenCalledWith(expect.stringContaining('save failed'));
    },
  );

  it('counts a committed tag write even if its native refresh callback fails', async () => {
    const item = tagItem(1);
    const last = tagItem(2);
    const { db, request } = installHost([item, last]);
    item.saves.mockImplementationOnce(async () => {
      db.addCurrentCallback('commit', () => {
        throw new Error('native refresh failed');
      });
    });

    await expect(setItemTag([item, last], 'topic', true, request)).resolves.toEqual({ done: 2 });
    expect(item.hasTag('topic')).toBe(true);
    expect(last.hasTag('topic')).toBe(true);
    expect(request.logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('native refresh failed'),
    );
  });

  it('checks tag presence after a pending write rolls back', async () => {
    const item = tagItem(1);
    const { request } = installHost([item]);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    item.saves
      .mockImplementationOnce(async () => {
        started.resolve();
        await release.promise;
        throw new Error('first save failed');
      })
      .mockResolvedValueOnce(true);

    const first = setItemTag([item], 'queued', true, request);
    await started.promise;
    const second = setItemTag([item], 'queued', true, request);
    release.resolve();

    await expect(first).resolves.toEqual({ done: 0, failed: 1 });
    await expect(second).resolves.toEqual({ done: 1 });
    expect(item.hasTag('queued')).toBe(true);
  });
});
