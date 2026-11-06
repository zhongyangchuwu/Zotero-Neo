import { afterEach, describe, expect, it, vi } from 'vitest';

import { setItemTag } from '../../src/operations/item-tags';

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

function installTransactionHost(): ReturnType<typeof vi.fn> {
  const executeTransaction = vi.fn(async (callback: () => Promise<void>) => callback());
  vi.stubGlobal('Zotero', { DB: { executeTransaction } });
  return executeTransaction;
}

describe('semantic multi-target tag action', () => {
  it('uses one transaction and only saves targets that need the transition', async () => {
    const executeTransaction = installTransactionHost();
    const first = tagItem(1, { tags: [{ tag: 'robotics', type: 1 }] });
    const second = tagItem(2);

    await expect(setItemTag([first, second], 'robotics', true)).resolves.toBe(1);
    expect(executeTransaction).toHaveBeenCalledTimes(1);
    expect(first.saves).not.toHaveBeenCalled();
    expect(second.saves).toHaveBeenCalledTimes(1);
    expect(second.getTagType('robotics')).toBe(0);

    await expect(setItemTag([first, second], 'robotics', false)).resolves.toBe(2);
    expect(executeTransaction).toHaveBeenCalledTimes(2);
    expect(first.saves).toHaveBeenCalledTimes(1);
    expect(second.saves).toHaveBeenCalledTimes(2);
  });

  it.each([0, 1])(
    'preserves managed identities of type %i without blocking ordinary automatic tags',
    async (type) => {
      installTransactionHost();
      const identity = 'urn:zotero-neo:chapter-note:v1:' + 'f'.repeat(32);
      const owner = tagItem(7, {
        tags: [
          { tag: identity, type },
          { tag: 'topic', type: 1 },
        ],
      });
      const other = tagItem(8);
      const before = owner.getTags();

      await expect(setItemTag([owner, other], ` ${identity} `, false)).rejects.toThrow();
      await expect(setItemTag([owner, other], identity, true)).rejects.toThrow();
      expect(owner.getTags()).toEqual(before);
      expect(other.hasTag(identity)).toBe(false);

      await expect(setItemTag([owner], 'topic', false)).resolves.toBe(1);
      expect(owner.hasTag('topic')).toBe(false);
      expect(owner.getTagType(identity)).toBe(type);
    },
  );

  it('creates manual tags and restores in-memory state if the batch transaction fails', async () => {
    installTransactionHost();
    const created = tagItem(1);
    await expect(setItemTag([created], 'new-tag', true)).resolves.toBe(1);
    expect(created.hasTag('new-tag')).toBe(true);
    expect(created.getTagType('new-tag')).toBe(0);

    const first = tagItem(2);
    const failed = tagItem(3, { saveError: new Error('save failed') });
    await expect(setItemTag([first, failed], 'unsafe', true)).rejects.toThrow('save failed');
    expect(first.hasTag('unsafe')).toBe(false);
    expect(failed.hasTag('unsafe')).toBe(false);
  });
});
