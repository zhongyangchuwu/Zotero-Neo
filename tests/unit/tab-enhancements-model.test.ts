import { describe, expect, it, vi } from 'vitest';
import { createTabGroupManager } from '../../src/modules/tab-enhancements/model';
import type { TabGroupHost } from '../../src/modules/tab-enhancements/types';
import type {
  TabDocumentRef,
  TabViewSnapshot,
} from '../../src/toolkit/main/tab-enhancements-types';

const document: TabDocumentRef = { kind: 'reader', libraryID: 1, key: 'ATTACHMENT' };
const fields = {
  nativeTitle: 'Paper.pdf',
  title: 'Paper',
  citekey: '',
  author: '',
  year: '',
  filename: 'Paper.pdf',
};
function tab(viewID: string, nativeID = viewID): TabViewSnapshot {
  return { nativeID, viewID, kind: 'reader', state: 'loaded', selected: false, document, fields };
}
function host(id: string, initial: TabViewSnapshot[] = []) {
  let tabs = [...initial];
  let listener = () => {};
  const native = {
    id,
    window: { setTimeout },
    snapshot: () => tabs,
    observe: (fn: () => void) => {
      listener = fn;
      return () => {
        listener = () => {};
      };
    },
    metadata: vi.fn((_doc: TabDocumentRef) => fields as typeof fields | null),
    close: vi.fn((ids: readonly string[]) => {
      tabs = tabs.filter((t) => !ids.includes(t.nativeID));
      listener();
    }),
    move: vi.fn((nativeID: string, before: string | null) => {
      const item = tabs.find((t) => t.nativeID === nativeID)!;
      tabs = tabs.filter((t) => t !== item);
      const index = before === null ? tabs.length : tabs.findIndex((t) => t.nativeID === before);
      tabs.splice(index, 0, item);
    }),
    open: vi.fn(async (doc: TabDocumentRef, viewID: string, current: () => boolean) => {
      if (!current()) return false;
      tabs.push({ ...tab(viewID, `new-${viewID}`), document: doc });
      listener();
      return `new-${viewID}`;
    }),
  };
  const activate = vi.fn(() => true);
  return {
    native,
    activate,
    port: { native, activate } as unknown as TabGroupHost,
    setTabs(value: TabViewSnapshot[]) {
      tabs = value;
      listener();
    },
  };
}
function storage(initial = '') {
  let value = initial;
  let next = 0;
  return {
    read: () => value,
    write: (data: string) => {
      value = data;
    },
    createID: () => `group-${++next}`,
    value: () => value,
  };
}

describe('persistent tab groups', () => {
  it('identifies the libraries referenced by persisted reading groups', () => {
    const store = storage(
      JSON.stringify({
        version: 1,
        groups: [
          {
            id: 'a',
            name: 'One',
            color: '',
            collapsed: false,
            members: [
              { id: 'v1', title: 'A', document },
              { id: 'v2', title: 'B', document: { ...document, key: 'B' } },
            ],
          },
          {
            id: 'b',
            name: 'Two',
            color: '',
            collapsed: false,
            members: [{ id: 'v3', title: 'C', document: { ...document, libraryID: 2, key: 'C' } }],
          },
        ],
      }),
    );
    const manager = createTabGroupManager(store);
    expect(manager.libraryIDs()).toEqual([1, 2]);
    manager.dispose();
  });
  it('preserves corrupt storage and failed writes without modifying groups', () => {
    const broken = storage('{bad json');
    expect(() => createTabGroupManager(broken)).toThrow();
    expect(broken.value()).toBe('{bad json');
    const unknown = storage('{"version":3,"groups":[]}');
    expect(() => createTabGroupManager(unknown)).toThrow();
    expect(unknown.value()).toBe('{"version":3,"groups":[]}');
    const store = storage();
    const manager = createTabGroupManager({
      ...store,
      write: () => {
        throw new Error('disk');
      },
    });
    const a = host('a');
    manager.registerHost(a.port);
    expect(() => manager.createGroup('No')).toThrow('disk');
    expect(manager.view('a', '{title}').groups).toEqual([]);
    expect(store.value()).toBe('');
  });
  it('removes closed members and ungrouping never closes native tabs', () => {
    const a = host('a', [tab('a')]);
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    const group = manager.createGroup('Group');
    manager.assign('a', group, 'a');
    a.setTabs([]);
    expect(manager.view('a', '{title}').groups[0]?.entries).toEqual([]);
    a.setTabs([tab('a')]);
    manager.ungroup(group, 'a');
    expect(a.native.close).not.toHaveBeenCalled();
    expect(manager.view('a', '{title}').ungrouped[0]?.id).toBe('a');
  });
  it('never groups or closes the fixed library view', () => {
    const library: TabViewSnapshot = { ...tab('library'), kind: 'library', document: null };
    const a = host('a', [library]);
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    const group = manager.createGroup('Group');
    expect(() => manager.assign('library', group, 'a')).toThrow();
    manager.closeMember('library', 'a');
    expect(a.native.close).not.toHaveBeenCalled();
    expect(manager.view('a', '{title}').library?.id).toBe('library');
  });
  it('searches actual metadata and uses the saved title when metadata is unavailable', () => {
    const metadata = {
      ...fields,
      nativeTitle: 'Saved native title',
      title: 'Actual article title',
      citekey: 'Smith2024',
      author: 'Jane Smith',
      year: '2024',
      filename: 'article.pdf',
    };
    const a = host('a', [{ ...tab('open'), fields: metadata }]);
    const b = host('b', [{ ...tab('remote'), fields: metadata }]);
    const store = storage();
    const manager = createTabGroupManager(store);
    manager.registerHost(a.port);
    manager.registerHost(b.port);
    const group = manager.createGroup('Search');
    manager.assign('open', group, 'a');
    manager.assign('remote', group, 'b');

    const entries = manager.view('a', '{citekey}').groups[0]!.entries;
    expect(entries.map((item) => [item.status, item.title, item.searchText])).toEqual([
      [
        'open',
        'Smith2024',
        'Actual article title Saved native title Jane Smith 2024 article.pdf Smith2024',
      ],
      [
        'other-window',
        'Smith2024',
        'Actual article title Saved native title Jane Smith 2024 article.pdf Smith2024',
      ],
    ]);

    manager.dispose();
  });

  it('keeps native traversal aligned with grouped rows before the ungrouped list', () => {
    const a = host('a', [tab('ungrouped'), tab('first'), tab('second')]);
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    const group = manager.createGroup('Reading');
    manager.assign('first', group, 'a');
    manager.assign('second', group, 'a');
    expect(a.native.snapshot().map((entry) => entry.viewID)).toEqual([
      'first',
      'second',
      'ungrouped',
    ]);
    expect(manager.view('a', '{title}').ungrouped.map((entry) => entry.id)).toEqual(['ungrouped']);
  });
  it('reorders open groups without touching another window', () => {
    const a = host('a', [tab('a'), tab('b'), tab('c')]);
    const b = host('b', [tab('remote')]);
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    manager.registerHost(b.port);
    const first = manager.createGroup('First');
    const second = manager.createGroup('Second');
    manager.assign('a', first, 'a');
    manager.assign('b', first, 'a');
    manager.assign('c', second, 'a');
    manager.assign('remote', second, 'b');
    a.setTabs(a.native.snapshot().filter((item) => item.viewID !== 'b'));
    b.native.move.mockClear();
    manager.moveGroup(second, first, 'a');
    expect(a.native.snapshot().map((item) => item.viewID)).toEqual(['c', 'a']);
    expect(manager.view('a', '{title}').groups[1]?.entries.map((item) => item.id)).toEqual(['a']);
    expect(b.native.move).not.toHaveBeenCalled();
  });
  it('compensates a native move failure without publishing changed state', () => {
    const store = storage();
    const a = host('a', [tab('a'), tab('b'), tab('c')]);
    const manager = createTabGroupManager(store);
    manager.registerHost(a.port);
    const first = manager.createGroup('First');
    const second = manager.createGroup('Second');
    manager.assign('a', first, 'a');
    manager.assign('b', first, 'a');
    manager.assign('c', second, 'a');
    const saved = store.value();
    const oldOrder = a.native.snapshot().map((item) => item.nativeID);
    const oldGroups = manager.view('a', '{title}').groups;
    const listener = vi.fn();
    manager.subscribe(listener);
    const move = a.native.move.getMockImplementation()!;
    a.native.move.mockImplementationOnce(move);
    a.native.move.mockImplementationOnce((id, before) => {
      move(id, before);
      throw new Error('move failed');
    });
    expect(() => manager.moveGroup(second, first, 'a')).toThrow('move failed');
    expect(a.native.snapshot().map((item) => item.nativeID)).toEqual(oldOrder);
    expect(store.value()).toBe(saved);
    expect(manager.view('a', '{title}').groups).toEqual(oldGroups);
    expect(listener).not.toHaveBeenCalled();
  });
  it('reports both the original move failure and a failed persistence compensation', () => {
    const store = storage();
    let failRollback = false;
    const manager = createTabGroupManager({
      ...store,
      write: (value) => {
        if (failRollback) throw new Error('rollback failed');
        store.write(value);
      },
    });
    const a = host('a', [tab('ungrouped'), tab('a')]);
    manager.registerHost(a.port);
    const group = manager.createGroup('Group');
    a.native.move.mockImplementationOnce(() => {
      failRollback = true;
      throw new Error('move failed');
    });
    try {
      manager.assign('a', group, 'a');
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors.map((item: Error) => item.message)).toEqual([
        'move failed',
        'rollback failed',
      ]);
    }
    expect(manager.view('a', '{title}').groups[0]?.entries).toEqual([]);
  });
  it('rejects non-color style data without changing the saved reading group', () => {
    const store = storage();
    const manager = createTabGroupManager(store);
    const group = manager.createGroup('Reading');
    manager.setGroupColor(group, '#e06c75');
    const saved = store.value();
    expect(() => manager.setGroupColor(group, 'red; position:fixed')).toThrow();
    expect(store.value()).toBe(saved);
    const bad = JSON.parse(saved);
    bad.groups[0].color = 'url(https://example.invalid/image)';
    expect(() => createTabGroupManager(storage(JSON.stringify(bad)))).toThrow();
  });
  it('migrates legacy data without losing groups or members before hosts register', () => {
    const original = {
      version: 1,
      groups: [
        {
          id: 'g',
          name: 'Papers',
          color: '#123456',
          collapsed: true,
          members: [
            { id: 'one', title: 'One', document },
            { id: 'two', title: 'Two', document },
          ],
        },
        { id: 'empty', name: 'Empty', color: '', collapsed: false, members: [] },
      ],
    };
    const store = storage(JSON.stringify(original));
    const manager = createTabGroupManager(store);
    expect(JSON.parse(store.value())).toEqual({ ...original, version: 2 });
    const a = host('a', [tab('one')]);
    manager.registerHost(a.port);
    expect(manager.view('a', '{title}').groups[0]?.entries.map((entry) => entry.id)).toEqual([
      'one',
    ]);
    expect(JSON.parse(store.value()).groups[0].members).toHaveLength(2);
    const b = host('b', [tab('two')]);
    const retire = manager.registerHost(b.port);
    expect(manager.view('a', '{title}').groups[0]?.entries.map((entry) => entry.status)).toEqual([
      'open',
      'other-window',
    ]);
    retire();
    expect(JSON.parse(store.value()).groups[0].members).toHaveLength(2);
    manager.registerHost(b.port);
    b.setTabs([]);
    expect(
      JSON.parse(store.value()).groups[0].members.map((member: { id: string }) => member.id),
    ).toEqual(['one']);
  });

  it('keeps unresolved native views open and removes only the observed closed duplicate', () => {
    const a = host('a', [tab('one'), tab('two')]);
    const store = storage();
    const manager = createTabGroupManager(store);
    manager.registerHost(a.port);
    const group = manager.createGroup('Papers');
    manager.assign('one', group, 'a');
    manager.assign('two', group, 'a');
    a.setTabs([{ ...tab('two'), document: null, fields: { ...fields, title: '' } }]);
    expect(
      manager.view('a', '{title}').groups[0]?.entries.map((entry) => [entry.id, entry.title]),
    ).toEqual([['two', 'Paper.pdf']]);
    expect(
      JSON.parse(store.value()).groups[0].members.map((member: { id: string }) => member.id),
    ).toEqual(['two']);
    expect(a.native.open).not.toHaveBeenCalled();
  });

  it('imports only opened views and retains successful earlier imports on failure', async () => {
    const a = host('a');
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    const first = { document, title: 'Paper' };
    const second = { document: { ...document, key: 'SECOND' }, title: 'Second' };
    expect(
      await manager.importDocuments({ name: 'Papers' }, [first, first, second], 'a', () => true),
    ).toBe(2);
    const group = manager.view('a', '{title}').groups[0]!;
    expect(group.entries).toHaveLength(2);
    a.native.open.mockRejectedValueOnce(new Error('unavailable'));
    await expect(
      manager.importDocuments({ groupID: group.id }, [first], 'a', () => true),
    ).rejects.toThrow('unavailable');
    expect(manager.view('a', '{title}').groups[0]?.entries).toHaveLength(2);
  });

  it('fences delayed imports on cancellation, group close, or host retirement', async () => {
    for (const cancel of ['cancel', 'close', 'retire'] as const) {
      const a = host('a');
      const manager = createTabGroupManager(storage());
      const retire = manager.registerHost(a.port);
      const groupID = manager.createGroup('Papers');
      const { promise: gate, resolve: release } = Promise.withResolvers<void>();
      const original = a.native.open.getMockImplementation()!;
      a.native.open.mockImplementation(async (...args) => {
        await gate;
        return original(...args);
      });
      let current = true;
      const importing = manager.importDocuments(
        { groupID },
        [{ document, title: 'Paper' }],
        'a',
        () => current,
      );
      if (cancel === 'retire') retire();
      else if (cancel === 'close') manager.closeGroup(groupID, 'a');
      else current = false;
      release();
      expect(await importing).toBe(0);
      expect(a.native.snapshot()).toEqual([]);
    }
  });

  it('closes a newly opened view if saving its membership fails', async () => {
    const a = host('a');
    const manager = createTabGroupManager({
      ...storage(),
      write: () => {
        throw new Error('disk');
      },
    });
    manager.registerHost(a.port);
    await expect(
      manager.importDocuments({ name: 'Papers' }, [{ document, title: 'Paper' }], 'a', () => true),
    ).rejects.toThrow('disk');
    expect(a.native.snapshot()).toEqual([]);
    expect(manager.view('a', '{title}').groups).toEqual([]);
  });

  it('does not group or reopen an imported view closed before open returns', async () => {
    const a = host('a');
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    a.native.open.mockImplementation(async (_doc, viewID) => {
      a.setTabs([tab(viewID)]);
      a.setTabs([]);
      return viewID;
    });
    expect(
      await manager.importDocuments(
        { name: 'Papers' },
        [{ document, title: 'Paper' }],
        'a',
        () => true,
      ),
    ).toBe(0);
    expect(manager.view('a', '{title}').groups).toEqual([]);
    expect(a.native.open).toHaveBeenCalledTimes(1);
  });
});
