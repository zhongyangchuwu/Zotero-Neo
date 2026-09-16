import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import {
  itemTagState,
  normalizeItemTargets,
  resolveItemTagTargets,
  setTagOnTargets,
} from '../../src/main/tag-targets';

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
    saveTx: saves,
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

  it('resolves Reader, Note, and Main sources without borrowing the wrong selection', () => {
    const parent = tagItem(1);
    const attachment = tagItem(2, { kind: 'attachment', parentItemID: parent.id });
    const childNote = tagItem(3, { kind: 'note', parentItemID: parent.id });
    installItems([parent, attachment, childNote], attachment.id);
    const readerWindow = {
      Zotero_Tabs: { selectedID: 'reader-tab', getTabInfo: () => ({ type: 'reader' }) },
      ZoteroPane: { getSelectedItems: () => [childNote] },
    } as unknown as MainWindow;
    expect(resolveItemTagTargets(readerWindow)).toMatchObject({
      source: 'reader',
      items: [{ id: parent.id }],
    });

    installItems([parent, attachment, childNote]);
    const noteWindow = {
      Zotero_Tabs: {
        selectedID: 'note-tab',
        getTabInfo: () => ({ type: 'note', data: { itemID: childNote.id } }),
      },
      ZoteroPane: { getSelectedItems: () => [attachment] },
    } as unknown as MainWindow;
    expect(resolveItemTagTargets(noteWindow)).toMatchObject({
      source: 'note',
      items: [{ id: parent.id }],
    });

    const second = tagItem(4);
    installItems([parent, attachment, childNote, second]);
    const mainWindow = {
      Zotero_Tabs: { selectedID: 'library', getTabInfo: () => ({ type: 'library' }) },
      ZoteroPane: { getSelectedItems: () => [attachment, parent, second] },
    } as unknown as MainWindow;
    expect(resolveItemTagTargets(mainWindow)).toMatchObject({
      source: 'main',
      items: [{ id: parent.id }, { id: second.id }],
    });
  });

  it('prefers a focused Reader context note but ignores an open unfocused editor', () => {
    const readerParent = tagItem(1);
    const attachment = tagItem(2, { kind: 'attachment', parentItemID: readerParent.id });
    const noteParent = tagItem(3);
    const childNote = tagItem(4, { kind: 'note', parentItemID: noteParent.id });
    installItems([readerParent, attachment, noteParent, childNote], attachment.id);

    const activeElement = {} as Element;
    const otherElement = {} as Element;
    const editor = {
      item: childNote,
      contains: (node: Node | null) => node === (activeElement as unknown as Node),
    };
    const window = {
      document: { activeElement },
      Zotero_Tabs: { selectedID: 'reader-tab', getTabInfo: () => ({ type: 'reader' }) },
      ZoteroContextPane: { activeEditor: editor },
    } as unknown as MainWindow;

    expect(resolveItemTagTargets(window)).toMatchObject({
      source: 'note',
      items: [{ id: noteParent.id }],
    });

    Reflect.set(window.document, 'activeElement', otherElement);
    expect(resolveItemTagTargets(window)).toMatchObject({
      source: 'reader',
      items: [{ id: readerParent.id }],
    });
  });
});

describe('semantic multi-target tag action', () => {
  it('reports all/mixed/none and only changes targets that need the transition', async () => {
    const first = tagItem(1, { tags: [{ tag: 'robotics', type: 1 }] });
    const second = tagItem(2);
    expect(itemTagState([first, second], 'robotics')).toBe('mixed');

    await setTagOnTargets([first, second], 'robotics', true);
    expect(itemTagState([first, second], 'robotics')).toBe('all');
    expect(first.saves).not.toHaveBeenCalled();
    expect(second.saves).toHaveBeenCalledTimes(1);
    expect(second.getTagType('robotics')).toBe(0);

    await setTagOnTargets([first, second], 'robotics', false);
    expect(itemTagState([first, second], 'robotics')).toBe('none');
    expect(first.saves).toHaveBeenCalledTimes(1);
    expect(second.saves).toHaveBeenCalledTimes(2);
  });

  it('creates a new user-assigned tag as manual and rolls back an unsaved failed change', async () => {
    const created = tagItem(1);
    await setTagOnTargets([created], 'new-tag', true);
    expect(created.hasTag('new-tag')).toBe(true);
    expect(created.getTagType('new-tag')).toBe(0);

    const failed = tagItem(2, { saveError: new Error('save failed') });
    await expect(setTagOnTargets([failed], 'unsafe', true)).rejects.toThrow('save failed');
    expect(failed.hasTag('unsafe')).toBe(false);
  });
});
