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
  it('imports closed documents atomically without stealing views and restores them later', async () => {
    const store = storage();
    const a = host('a', [tab('existing')]);
    const manager = createTabGroupManager(store);
    manager.registerHost(a.port);
    const old = manager.createGroup('Existing');
    manager.assign('existing', old, 'a');
    const second = { kind: 'reader' as const, libraryID: 1, key: 'SECOND' };
    expect(
      manager.importDocuments({ name: 'Imported' }, [
        { document, title: 'Paper' },
        { document, title: 'Duplicate' },
        { document: second, title: 'Second' },
      ]),
    ).toBe(2);
    let groups = manager.view('a', '{title}').groups;
    expect(groups[0]?.entries.map((entry) => entry.id)).toEqual(['existing']);
    expect(groups[1]?.entries.map((entry) => entry.status)).toEqual(['closed', 'closed']);
    expect(a.native.open).not.toHaveBeenCalled();
    expect(
      manager.importDocuments({ groupID: groups[1]!.id }, [{ document, title: 'Again' }]),
    ).toBe(0);
    manager.dispose();
    const restored = createTabGroupManager(store);
    restored.registerHost(a.port);
    groups = restored.view('a', '{title}').groups;
    await restored.openGroup(groups[1]!.id, 'a');
    expect(a.native.open).toHaveBeenCalledTimes(2);
    expect(restored.view('a', '{title}').groups[0]?.entries[0]?.id).toBe('existing');
  });
  it('does not leave an empty group when an import write fails', () => {
    const store = storage();
    const a = host('a');
    const manager = createTabGroupManager({
      ...store,
      write: () => {
        throw new Error('disk');
      },
    });
    manager.registerHost(a.port);
    expect(() =>
      manager.importDocuments({ name: 'Failed' }, [{ document, title: 'Paper' }]),
    ).toThrow('disk');
    expect(manager.view('a', '{title}').groups).toEqual([]);
    expect(store.value()).toBe('');
  });
  it('conserves native views across unload/close, reload and reopens with the same view identity', async () => {
    const store = storage();
    const first = host('one', [tab('view-a'), tab('view-b')]);
    const manager = createTabGroupManager(store);
    manager.registerHost(first.port);
    const group = manager.createGroup('Papers');
    manager.assign('view-a', group, 'one');
    manager.assign('view-b', group, 'one');
    first.setTabs([tab('view-a'), { ...tab('view-b'), state: 'unloaded' }]);
    manager.closeMember('view-a', 'one');
    expect(manager.view('one', '{title}').groups[0]?.entries.map((e) => e.status)).toEqual([
      'closed',
      'open',
    ]);
    manager.dispose();
    const restored = createTabGroupManager(store);
    restored.registerHost(first.port);
    await restored.activate('view-a', 'one');
    expect(first.activate).toHaveBeenCalledWith('new-view-a');
    expect(restored.view('one', '{title}').groups[0]?.entries.map((e) => e.id)).toEqual([
      'view-a',
      'view-b',
    ]);
    expect(JSON.parse(store.value()).groups[0].members).toHaveLength(2);
  });
  it('opens only closed views and closes only the requesting window', async () => {
    const store = storage();
    const a = host('a', [tab('a')]);
    const b = host('b', [tab('b')]);
    const manager = createTabGroupManager(store);
    manager.registerHost(a.port);
    manager.registerHost(b.port);
    const group = manager.createGroup('Shared');
    manager.assign('a', group, 'a');
    manager.assign('b', group, 'b');
    expect(manager.view('a', '{title}').groups[0]?.entries.map((e) => e.status)).toEqual([
      'open',
      'other-window',
    ]);
    await manager.activate('b', 'a');
    expect(b.activate).toHaveBeenCalledWith('b');
    manager.closeGroup(group, 'a');
    expect(b.native.close).not.toHaveBeenCalled();
    await manager.openGroup(group, 'a');
    expect(a.native.open).toHaveBeenCalledTimes(1);
    expect(b.native.open).not.toHaveBeenCalled();
  });
  it('preserves corrupt storage and failed writes without modifying groups', () => {
    const broken = storage('{bad json');
    expect(() => createTabGroupManager(broken)).toThrow();
    expect(broken.value()).toBe('{bad json');
    const unknown = storage('{"version":2,"groups":[]}');
    expect(() => createTabGroupManager(unknown)).toThrow();
    expect(unknown.value()).toBe('{"version":2,"groups":[]}');
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
  it('retains missing members and ungrouping never closes native tabs', () => {
    const store = storage();
    const a = host('a', [tab('a')]);
    const manager = createTabGroupManager(store);
    manager.registerHost(a.port);
    const group = manager.createGroup('Group');
    manager.assign('a', group, 'a');
    a.setTabs([]);
    a.native.metadata.mockReturnValue(null);
    expect(manager.view('a', '{title}').groups[0]?.entries[0]?.status).toBe('missing');
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
  it('retains the saved native title when a closed member has no citation key', () => {
    const a = host('a', [tab('view')]);
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    const group = manager.createGroup('Reading');
    manager.assign('view', group, 'a');
    manager.closeMember('view', 'a');
    a.native.metadata.mockReturnValue({ ...fields, nativeTitle: '' });
    expect(manager.view('a', '{citekey}').groups[0]?.entries[0]?.title).toBe('Paper.pdf');
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

    manager.closeMember('open', 'a');
    a.native.metadata.mockReturnValue(metadata);
    const closed = manager.view('a', '{citekey}').groups[0]!.entries[0]!;
    expect(closed.status).toBe('closed');
    expect(closed.title).toBe('Smith2024');
    expect(closed.searchText).toBe(
      'Actual article title Saved native title Jane Smith 2024 article.pdf Smith2024',
    );

    a.native.metadata.mockReturnValue(null);
    const missing = manager.view('a', '{citekey}').groups[0]!.entries[0]!;
    expect(missing.status).toBe('missing');
    expect(missing.title).toBe('Saved native title');
    expect(missing.searchText).toBe('Saved native title');
    expect(JSON.parse(store.value()).groups[0].members[0].title).toBe('Saved native title');
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
  it('reorders saved and native views only in the requesting window and retains closed entries', () => {
    const store = storage();
    const a = host('a', [tab('a'), tab('b'), tab('c')]);
    const b = host('b', [tab('remote')]);
    const manager = createTabGroupManager(store);
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
    expect(manager.view('a', '{title}').groups[1]?.entries.map((item) => item.id)).toEqual([
      'a',
      'b',
    ]);
    expect(b.native.move).not.toHaveBeenCalled();
    manager.moveMember('b', second, 'c', 'a');
    expect(manager.view('a', '{title}').groups[0]?.entries.map((item) => item.id)).toEqual([
      'b',
      'c',
      'remote',
    ]);
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
  it('reports native open failures without discarding recoverable members', async () => {
    const store = storage();
    const a = host('a', [tab('a')]);
    const manager = createTabGroupManager(store);
    manager.registerHost(a.port);
    const group = manager.createGroup('Group');
    manager.assign('a', group, 'a');
    a.setTabs([]);
    a.native.open.mockRejectedValueOnce(new Error('document unavailable'));
    await expect(manager.openGroup(group, 'a')).resolves.toMatchObject({ opened: 0, failed: 1, skipped: 0 });
    expect(manager.view('a', '{title}').groups[0]?.entries[0]?.id).toBe('a');
  });
  it('activates an accepted native ID before the coalesced snapshot and avoids duplicate opens', async () => {
    const store = storage();
    const a = host('a', [tab('a')]);
    const manager = createTabGroupManager(store);
    manager.registerHost(a.port);
    const group = manager.createGroup('Group');
    manager.assign('a', group, 'a');
    a.setTabs([]);
    const nativeIDs: string[] = [];
    let selected: string | null = null;
    a.native.open.mockImplementation(async (_doc, _id, current) => {
      if (!current()) return false;
      nativeIDs.push('accepted-id');
      return 'accepted-id';
    });
    a.native.move.mockImplementation((id, before) => {
      const old = nativeIDs.indexOf(id);
      if (old < 0) throw new Error('Native view is absent');
      nativeIDs.splice(old, 1);
      nativeIDs.splice(before === null ? nativeIDs.length : nativeIDs.indexOf(before), 0, id);
    });
    a.activate.mockImplementation((id?: string) => {
      if (!id || !nativeIDs.includes(id)) return false;
      selected = id;
      return true;
    });
    a.native.close.mockImplementation((ids) => {
      for (const id of ids) {
        const index = nativeIDs.indexOf(id);
        if (index >= 0) nativeIDs.splice(index, 1);
        if (selected === id) selected = null;
      }
    });
    await manager.activate('a', 'a');
    expect(selected).toBe('accepted-id');
    await manager.openGroup(group, 'a');
    expect(nativeIDs).toEqual(['accepted-id']);
    manager.closeMember('a', 'a');
    expect(nativeIDs).toEqual([]);
    expect(selected).toBeNull();
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
  it('does not cancel an admission in another window when closing locally', async () => {
    const store = storage();
    const a = host('a', [tab('view')]);
    const b = host('b');
    const manager = createTabGroupManager(store);
    manager.registerHost(a.port);
    manager.registerHost(b.port);
    const group = manager.createGroup('Group');
    manager.assign('view', group, 'a');
    a.setTabs([]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    a.native.open.mockImplementation(async (_doc, _id, current) => {
      await gate;
      return current() ? 'accepted-id' : false;
    });
    const opening = manager.openGroup(group, 'a');
    manager.closeGroup(group, 'b');
    release();
    await opening;
    await expect(a.native.open.mock.results[0]?.value).resolves.toBe('accepted-id');
    expect(a.native.close).not.toHaveBeenCalled();
  });
  it('continues opening a group through collapse and closing an unrelated view', async () => {
    const a = host('a', [tab('first'), tab('second'), tab('unrelated')]);
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    const group = manager.createGroup('Reading');
    manager.assign('first', group, 'a');
    manager.assign('second', group, 'a');
    a.setTabs([tab('unrelated')]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = a.native.open.getMockImplementation()!;
    a.native.open.mockImplementation(async (...args) => {
      await gate;
      return original(...args);
    });
    const opening = manager.openGroup(group, 'a');
    manager.toggleGroup(group);
    manager.closeMember('unrelated', 'a');
    release();
    await opening;
    expect(a.native.snapshot().map((view) => view.viewID)).toEqual(['first', 'second']);
    expect(manager.view('a', '{title}').groups[0]?.collapsed).toBe(true);
  });
  it('cancels pending native admissions on host retirement and group close', async () => {
    for (const cancel of ['retire', 'close'] as const) {
      const store = storage();
      const a = host('a', [tab('a'), tab('b')]);
      const manager = createTabGroupManager(store);
      const unregister = manager.registerHost(a.port);
      const group = manager.createGroup('Group');
      manager.assign('a', group, 'a');
      manager.assign('b', group, 'a');
      a.setTabs([]);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      a.native.open.mockImplementation(async (_doc, _id, current) => {
        await gate;
        return current() ? 'accepted' : false;
      });
      const opening = manager.openGroup(group, 'a');
      if (cancel === 'retire') unregister();
      else manager.closeGroup(group, 'a');
      release();
      await opening;
      expect(a.native.open).toHaveBeenCalledTimes(1);
      await expect(a.native.open.mock.results[0]?.value).resolves.toBe(false);
    }
  });
  it('does not reopen a member closed while an earlier group member is opening', async () => {
    const a = host('a', [tab('first'), tab('second'), tab('third')]);
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    const group = manager.createGroup('Reading');
    for (const id of ['first', 'second', 'third']) manager.assign(id, group, 'a');
    a.setTabs([tab('second')]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = a.native.open.getMockImplementation()!;
    a.native.open.mockImplementation(async (...args) => {
      await gate;
      return original(...args);
    });
    const opening = manager.openGroup(group, 'a');
    manager.closeMember('second', 'a');
    release();
    await opening;
    expect(a.native.snapshot().map((view) => view.viewID)).toEqual(['first', 'third']);
    expect(a.native.open.mock.calls.map((call) => call[1])).toEqual(['first', 'third']);
  });

  it('focuses the admission owner when clicked during a background open', async () => {
    for (const otherWindow of [false, true]) {
      const a = host('a', [tab('view')]);
      const b = host('b');
      const manager = createTabGroupManager(storage());
      manager.registerHost(a.port);
      manager.registerHost(b.port);
      const group = manager.createGroup('Reading');
      manager.assign('view', group, 'a');
      a.setTabs([]);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = a.native.open.getMockImplementation()!;
      a.native.open.mockImplementation(async (...args) => {
        await gate;
        return original(...args);
      });
      const opening = manager.openGroup(group, 'a');
      const activating = manager.activate('view', otherWindow ? 'b' : 'a');
      release();
      await Promise.all([opening, activating]);
      expect(a.native.open).toHaveBeenCalledTimes(1);
      expect(b.native.open).not.toHaveBeenCalled();
      expect(a.activate).toHaveBeenCalledWith('new-view');
      expect(b.activate).not.toHaveBeenCalled();
    }
  });

  it('does not focus a pending admission after close, removal, retirement, or disposal', async () => {
    for (const cancel of [
      'owner-close',
      'requester-close',
      'remove',
      'owner-retire',
      'requester-retire',
      'dispose',
    ] as const) {
      const a = host('a', [tab('view')]);
      const b = host('b');
      const manager = createTabGroupManager(storage());
      const retireA = manager.registerHost(a.port);
      const retireB = manager.registerHost(b.port);
      const group = manager.createGroup('Reading');
      manager.assign('view', group, 'a');
      a.setTabs([]);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = a.native.open.getMockImplementation()!;
      a.native.open.mockImplementation(async (...args) => {
        await gate;
        return original(...args);
      });
      const opening = manager.openGroup(group, 'a');
      const activating = manager.activate('view', 'b');
      if (cancel === 'owner-close') manager.closeMember('view', 'a');
      else if (cancel === 'requester-close') manager.closeMember('view', 'b');
      else if (cancel === 'remove') manager.removeMember('view', 'a');
      else if (cancel === 'owner-retire') retireA();
      else if (cancel === 'requester-retire') retireB();
      else manager.dispose();
      release();
      await Promise.all([opening, activating]);
      expect(a.activate).not.toHaveBeenCalled();
      expect(b.activate).not.toHaveBeenCalled();
      expect(a.native.open).toHaveBeenCalledTimes(1);
      expect(b.native.open).not.toHaveBeenCalled();
    }
  });

  it('honors a new click after an older pending admission was cancelled', async () => {
    const a = host('a', [tab('view')]);
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    const group = manager.createGroup('Reading');
    manager.assign('view', group, 'a');
    a.setTabs([]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = a.native.open.getMockImplementation()!;
    a.native.open.mockImplementationOnce(async (...args) => {
      await gate;
      return original(...args);
    });
    const opening = manager.openGroup(group, 'a');
    manager.closeMember('view', 'a');
    const activating = manager.activate('view', 'a');
    release();
    await Promise.all([opening, activating]);
    expect(a.native.open).toHaveBeenCalledTimes(2);
    expect(a.activate).toHaveBeenCalledWith('new-view');
  });
  it('coalesces a click before an accepted native view appears in the snapshot', async () => {
    const a = host('a', [tab('view')]);
    const b = host('b');
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    manager.registerHost(b.port);
    const group = manager.createGroup('Reading');
    manager.assign('view', group, 'a');
    a.setTabs([]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    a.native.open.mockImplementation(async (_doc, _id, current) => {
      await gate;
      return current() ? 'accepted-id' : false;
    });
    a.native.move.mockImplementation(() => {});
    const opening = manager.openGroup(group, 'a');
    const activating = manager.activate('view', 'b');
    release();
    await Promise.all([opening, activating]);
    expect(a.native.open).toHaveBeenCalledTimes(1);
    expect(a.activate).toHaveBeenCalledWith('accepted-id');
    expect(b.activate).not.toHaveBeenCalled();
    await manager.openGroup(group, 'b');
    expect(b.native.open).not.toHaveBeenCalled();
  });
  it('previews without mutations and continues after failures while skipping missing and foreign views', async () => {
    const store = storage();
    const a = host('a', [tab('first'), tab('second'), tab('missing'), tab('here')]);
    const b = host('b', [tab('foreign')]);
    const manager = createTabGroupManager(store);
    manager.registerHost(a.port);
    manager.registerHost(b.port);
    const group = manager.createGroup('Reading');
    for (const id of ['first', 'second', 'missing', 'here']) manager.assign(id, group, 'a');
    manager.assign('foreign', group, 'b');
    a.setTabs([tab('here')]);
    a.native.metadata.mockImplementation((doc) => doc.key === 'MISSING' ? null : fields);
    // Give the missing record its own document through the persisted import path.
    manager.removeMember('missing', 'a');
    manager.importDocuments({ groupID: group }, [{ document: { ...document, key: 'MISSING' }, title: 'Missing' }]);
    const before = store.value();
    const plan = manager.prepareGroup(group, 'a');
    expect(a.native.open).not.toHaveBeenCalled();
    expect(a.native.close).not.toHaveBeenCalled();
    expect(store.value()).toBe(before);
    a.native.open.mockRejectedValueOnce(new Error('failed'));
    const updates: number[] = [];
    const result = await manager.openGroup(group, 'a', { plan, isCurrent: () => true, progress: (p) => updates.push(p.processed) });
    expect(result).toEqual({ total: 5, processed: 5, opened: 1, skipped: 3, failed: 1, stopped: false });
    expect(updates).toEqual([0, 1, 2, 3, 4, 5]);
    expect(b.native.open).not.toHaveBeenCalled();
    expect(store.value()).toBe(before);
  });

  it('stops a delayed admission and rejects simultaneous same-window restores', async () => {
    const a = host('a', [tab('first'), tab('second')]);
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    const group = manager.createGroup('Reading');
    manager.assign('first', group, 'a');
    manager.assign('second', group, 'a');
    a.setTabs([]);
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const original = a.native.open.getMockImplementation()!;
    a.native.open.mockImplementation(async (...args) => { await gate; return original(...args); });
    let current = true;
    const opening = manager.openGroup(group, 'a', { isCurrent: () => current, progress: () => {} });
    await expect(manager.openGroup(group, 'a')).rejects.toThrow('already in progress');
    current = false;
    release();
    expect(await opening).toEqual({ total: 2, processed: 1, opened: 0, skipped: 1, failed: 0, stopped: true });
    expect(a.native.snapshot()).toEqual([]);
    expect(a.native.open).toHaveBeenCalledTimes(1);
    expect(a.native.close).not.toHaveBeenCalled();
  });

  it('does not reopen a preview member closed or moved away and back before start', async () => {
    const a = host('a', [tab('first'), tab('second')]);
    const manager = createTabGroupManager(storage());
    manager.registerHost(a.port);
    const group = manager.createGroup('Reading');
    const other = manager.createGroup('Other');
    manager.assign('first', group, 'a');
    manager.assign('second', group, 'a');
    a.setTabs([]);
    const plan = manager.prepareGroup(group, 'a');
    manager.closeMember('first', 'a');
    manager.moveMember('second', other, null, 'a');
    manager.moveMember('second', group, null, 'a');
    const result = await manager.openGroup(group, 'a', { plan, isCurrent: () => true, progress: () => {} });
    expect(result).toMatchObject({ opened: 0, skipped: 2, stopped: false });
    expect(a.native.open).not.toHaveBeenCalled();
  });
});
