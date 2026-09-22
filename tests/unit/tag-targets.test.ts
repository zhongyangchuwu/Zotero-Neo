import { afterEach, describe, expect, it, vi } from 'vitest';

import { itemTagState, normalizeItemTargets, setTagOnTargets } from '../../src/main/tag-targets';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

type MutableTagItem = Zotero.Item & { readonly saves: ReturnType<typeof vi.fn> };

function tagItem(
  id: number,
  options: {
    parentItemID?: number;
    kind?: 'regular' | 'attachment' | 'note';
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
    parentItemID: options.parentItemID,
    isAttachment: () => options.kind === 'attachment',
    isNote: () => options.kind === 'note',
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

function installItems(items: readonly Zotero.Item[], readerItemID?: number): void {
  const byID = new Map(items.map((item) => [item.id, item]));
  vi.stubGlobal('Zotero', {
    Items: { get: (id: number) => byID.get(id) ?? false },
    Reader: { getByTabID: () => (readerItemID ? { itemID: readerItemID } : null) },
  });
}

function installTransactionHost(): ReturnType<typeof vi.fn> {
  const executeTransaction = vi.fn(async (callback: () => Promise<void>) => callback());
  vi.stubGlobal('Zotero', { DB: { executeTransaction } });
  return executeTransaction;
}

describe('item tag target normalization', () => {
  it('normalizes child attachments and notes to a deduplicated parent target', () => {
    const parent = tagItem(1);
    const attachment = tagItem(2, { kind: 'attachment', parentItemID: parent.id });
    const note = tagItem(3, { kind: 'note', parentItemID: parent.id });
    installItems([parent, attachment, note]);

    expect(normalizeItemTargets([attachment, note, parent]).map((item) => item.id)).toEqual([
      parent.id,
    ]);
  });
});

describe('semantic multi-target tag action', () => {
  it('uses one transaction and only saves targets that need the transition', async () => {
    const executeTransaction = installTransactionHost();
    const first = tagItem(1, { tags: [{ tag: 'robotics', type: 1 }] });
    const second = tagItem(2);
    expect(itemTagState([first, second], 'robotics')).toBe('mixed');

    await expect(setTagOnTargets([first, second], 'robotics', true)).resolves.toBe(1);
    expect(executeTransaction).toHaveBeenCalledTimes(1);
    expect(itemTagState([first, second], 'robotics')).toBe('all');
    expect(first.saves).not.toHaveBeenCalled();
    expect(second.saves).toHaveBeenCalledTimes(1);
    expect(second.getTagType('robotics')).toBe(0);

    await expect(setTagOnTargets([first, second], 'robotics', false)).resolves.toBe(2);
    expect(executeTransaction).toHaveBeenCalledTimes(2);
    expect(itemTagState([first, second], 'robotics')).toBe('none');
    expect(first.saves).toHaveBeenCalledTimes(1);
    expect(second.saves).toHaveBeenCalledTimes(2);
  });

  it('creates manual tags and restores in-memory state if the batch transaction fails', async () => {
    installTransactionHost();
    const created = tagItem(1);
    await expect(setTagOnTargets([created], 'new-tag', true)).resolves.toBe(1);
    expect(created.hasTag('new-tag')).toBe(true);
    expect(created.getTagType('new-tag')).toBe(0);

    const first = tagItem(2);
    const failed = tagItem(3, { saveError: new Error('save failed') });
    await expect(setTagOnTargets([first, failed], 'unsafe', true)).rejects.toThrow('save failed');
    expect(first.hasTag('unsafe')).toBe(false);
    expect(failed.hasTag('unsafe')).toBe(false);
  });
});
