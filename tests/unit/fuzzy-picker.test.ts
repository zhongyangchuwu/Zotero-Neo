import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import {
  FuzzyPicker,
  fuzzyMatchScore,
  fuzzyPickerRowText,
  isFuzzyPickerItem,
} from '../../src/main/picker';
import { MainNavigation } from '../../src/main/navigation';
import type { MainWindowSession } from '../../src/main/session';
import { citationKey } from '../../src/platform/better-bibtex';

const originalZotero = Reflect.get(globalThis, 'Zotero');
const originalServices = Reflect.get(globalThis, 'Services');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
  if (originalServices === undefined) Reflect.deleteProperty(globalThis, 'Services');
  else Reflect.set(globalThis, 'Services', originalServices);
  vi.useRealTimers();
});

describe('fuzzy picker bibliographic items', () => {
  it('keeps regular parent items and excludes notes, attachments, and annotations', () => {
    const item = (regular: boolean): Zotero.Item =>
      ({ isRegularItem: () => regular }) as Zotero.Item;

    expect(isFuzzyPickerItem(item(true))).toBe(true);
    expect(isFuzzyPickerItem(item(false))).toBe(false);
  });

  it('shows the title directly when an item genuinely has no citation key', () => {
    expect(
      fuzzyPickerRowText(
        { id: 1, title: 'A searchable paper', search: 'a searchable paper' },
        0,
        'collection',
      ),
    ).toBe('A searchable paper');
  });
});

describe('shared fuzzy ranking', () => {
  it('prefers contiguous and boundary matches while rejecting missing subsequences', () => {
    expect(fuzzyMatchScore('alpha beta', 'ab')).toBeGreaterThan(
      fuzzyMatchScore('a very long gap before b', 'ab') ?? Number.NEGATIVE_INFINITY,
    );
    expect(fuzzyMatchScore('alpha', 'az')).toBeNull();
  });
});

describe('bibliographic picker previews', () => {
  it('shows metadata, attachment filenames, and bounded child-note titles', async () => {
    const attachment = {
      id: 2,
      attachmentFilename: 'paper.pdf',
      getDisplayTitle: () => 'Paper PDF',
      getField: () => '',
    } as unknown as Zotero.Item;
    const note = {
      id: 3,
      getNoteTitle: () => 'Methods note',
      getDisplayTitle: () => 'Methods note',
      getField: () => '',
    } as unknown as Zotero.Item;
    const item = {
      id: 1,
      isRegularItem: () => true,
      getField: (field: string) => ({ title: 'Preview item', year: '2026' })[field] ?? '',
      getCreators: () => [{ lastName: 'Author' }],
      getAttachments: () => [attachment.id],
      getNotes: () => [note.id],
    } as unknown as Zotero.Item;
    const byID = new Map([
      [item.id, item],
      [attachment.id, attachment],
      [note.id, note],
    ]);
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: {
        get: (id: number | number[]) =>
          Array.isArray(id)
            ? id.flatMap((value) => byID.get(value) ?? [])
            : (byID.get(id) ?? false),
        getAll: async () => [item],
      },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, { ZoteroPane: { getSelectedItems: () => [] } });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

    await picker.open(window, session, 'all');

    expect(session.picker.preview?.textContent).toContain('Author, 2026');
    expect(session.picker.preview?.textContent).toContain('Attachments: 1');
    expect(session.picker.preview?.textContent).toContain('paper.pdf');
    expect(session.picker.preview?.textContent).toContain('Child notes: 1');
    expect(session.picker.preview?.textContent).toContain('Methods note');
  });
});

describe('item picker keyboard activation', () => {
  it('ignores result pointer events, navigates by keyboard, and activates the highlighted item', async () => {
    const first = {
      id: 1,
      isRegularItem: () => true,
      isAttachment: () => false,
      isNote: () => false,
      getField: (field: string) =>
        ({ title: 'First item', year: '2025', citationKey: 'first-key' })[field] ?? '',
      getCreators: () => [],
      getAttachments: () => [],
      getNotes: () => [],
    } as unknown as Zotero.Item;
    const second = {
      id: 2,
      isRegularItem: () => true,
      isAttachment: () => false,
      isNote: () => false,
      getField: (field: string) =>
        ({ title: 'Second item', year: '2026', citationKey: 'second-key' })[field] ?? '',
      getCreators: () => [],
      getAttachments: () => [],
      getNotes: () => [],
    } as unknown as Zotero.Item;
    let nativeSelection: Zotero.Item[] = [];
    const selectItem = vi.fn(async (id: number) => {
      nativeSelection = [id === first.id ? first : second];
    });
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: { getAll: async () => [first, second] },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, {
      ZoteroPane: { getSelectedItems: () => nativeSelection, selectItem },
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

    await picker.open(window, session, 'all');
    const row = session.picker.results?.children[1] as HTMLElement & { emit(type: string): void };
    row.emit('click');
    row.emit('dblclick');
    row.emit('mouseenter');
    expect(session.picker.selected).toBe(0);
    expect(selectItem).not.toHaveBeenCalled();

    const input = session.picker.input;
    picker.onKeyDown(pickerKey('j', input), window, session);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('j', session.picker.results), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('ArrowUp', session.picker.results), window, session);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('ArrowDown', session.picker.results), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('k', session.picker.results), window, session);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('j', session.picker.results, { ctrl: true }), window, session);
    expect(session.picker.selected).toBe(1);

    picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
    await vi.waitFor(() => expect(selectItem).toHaveBeenCalledWith(second.id));
    expect(session.picker.open).toBe(false);

    await picker.open(window, session, 'all');
    const ctrlO = pickerKey('o', session.picker.results, { ctrl: true });
    picker.onKeyDown(ctrlO, window, session);
    expect(ctrlO.preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(selectItem).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(session.picker.open).toBe(false));

    await picker.open(window, session, 'all');
    const y = pickerKey('y', session.picker.results);
    picker.onKeyDown(y, window, session);
    expect(y.preventDefault).toHaveBeenCalledOnce();
    picker.close(session);
  });
});

function createPickerHarness(width = 1200): {
  window: MainWindow;
  session: MainWindowSession;
  bodyChildren: HTMLElement[];
} {
  let activeElement: Element | null = null;
  let document: Document;
  const createElement = (tag: string) => {
    const children: HTMLElement[] = [];
    const listeners = new Map<string, EventListener[]>();
    let textContent = '';
    const element = {
      setAttribute: (name: string, value: string) => {
        Reflect.set(element, name, value);
      },
      tagName: tag.toUpperCase(),
      localName: tag,
      ownerDocument: null as unknown as Document,
      style: {} as CSSStyleDeclaration,
      children,
      dataset: {} as DOMStringMap,
      value: '',
      type: '',
      placeholder: '',
      tabIndex: 0,
      clientHeight: 400,
      isConnected: true,
      get textContent() {
        return textContent;
      },
      set textContent(value: string) {
        textContent = value;
      },
      set innerHTML(value: string) {
        textContent = value.replace(/<[^>]*>/g, '');
      },
      append: (...nodes: HTMLElement[]) => {
        children.push(...nodes);
        textContent += nodes.map((node) => node.textContent ?? '').join('');
      },
      appendChild: (node: HTMLElement) => {
        children.push(node);
        textContent += node.textContent ?? '';
      },
      replaceChildren: (...nodes: HTMLElement[]) => {
        children.splice(0, children.length, ...nodes);
        textContent = nodes.map((node) => node.textContent ?? '').join('');
      },
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      removeEventListener: () => {},
      emit: (type: string, event: Partial<Event> = {}) => {
        for (const listener of listeners.get(type) ?? []) {
          listener({
            target: element,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
            ...event,
          } as Event);
        }
      },
      focus: () => {
        activeElement = element as unknown as Element;
        element.emit('focus');
      },
      select: vi.fn(),
      scrollBy: vi.fn(),
      scrollIntoView: vi.fn(),
      remove: () => {},
    };
    element.ownerDocument = document;
    return element as unknown as HTMLElement & { emit(type: string): void };
  };
  const bodyChildren: HTMLElement[] = [];
  document = {
    get activeElement() {
      return activeElement;
    },
    createElementNS: (_namespace: string, tag: string) => createElement(tag),
    body: { append: (node: HTMLElement) => bodyChildren.push(node) },
    documentElement: { append: (node: HTMLElement) => bodyChildren.push(node) },
  } as unknown as Document;
  const window = {
    document,
    innerWidth: width,
    setTimeout,
    clearTimeout,
  } as unknown as MainWindow;
  const session = {
    window,
    picker: {
      generation: 0,
      open: false,
      scope: 'all',
      overlay: null,
      input: null,
      results: null,
      preview: null,
      count: null,
      previewTitle: null,
      items: [],
      filtered: [],
      selected: 0,
      lastKey: null,
      yTimer: undefined,
      focusPane: 'search',
      tagMode: 'list',
      command: '',
      commandTimer: undefined,
      layout: 'dual',
      previousElement: null,
      previousWindow: null,
      themeCleanup: null,
    },
    status: { textContent: '', style: {} },
    cleanup: { add: () => {} },
    theme: { add: () => () => {} },
  } as unknown as MainWindowSession;
  return { window, session, bodyChildren };
}

function pickerKey(
  key: string,
  target: EventTarget | null,
  options: { ctrl?: boolean; shift?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    target,
    ctrlKey: options.ctrl ?? false,
    shiftKey: options.shift ?? false,
    metaKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe('tab picker activation', () => {
  it('keeps tab selection and activation keyboard-only', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const selected: string[] = [];
    const tabs = {
      _tabs: [
        { id: 'zotero-pane', title: 'Library', type: 'library' },
        { id: 'reader-tab', title: 'Reader', type: 'reader' },
      ],
      selectedID: 'zotero-pane',
      select: vi.fn(function (this: typeof tabs, id: string) {
        expect(this).toBe(tabs);
        selected.push(id);
      }),
    };
    const { window, session } = createPickerHarness();
    Object.assign(window, { Zotero_Tabs: tabs });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

    await picker.open(window, session, 'tabs');
    expect(session.picker.results?.children[0]?.textContent).toBe('Library');
    picker.onKeyDown(pickerKey('Enter', session.picker.input), window, session);
    await vi.waitFor(() => expect(selected).toEqual(['zotero-pane']));
    expect(session.picker.open).toBe(false);

    await picker.open(window, session, 'tabs');
    const row = session.picker.results?.children[1] as HTMLElement & { emit(type: string): void };
    row.emit('click');
    row.emit('dblclick');
    row.emit('mouseenter');
    expect(session.picker.selected).toBe(0);
    expect(selected).toEqual(['zotero-pane']);
    expect(session.picker.open).toBe(true);
    picker.close(session);
  });
  it('supports keyboard navigation outside the query input', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const tabs = {
      _tabs: [
        { id: 'first-tab', title: 'First', type: 'reader' },
        { id: 'second-tab', title: 'Second', type: 'reader' },
      ],
      selectedID: 'first-tab',
    };
    const { window, session } = createPickerHarness();
    Object.assign(window, { Zotero_Tabs: tabs });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

    await picker.open(window, session, 'tabs');
    const input = session.picker.input;
    picker.onKeyDown(pickerKey('j', input), window, session);
    picker.onKeyDown(pickerKey('k', input), window, session);
    picker.onKeyDown(pickerKey('ArrowDown', input), window, session);
    picker.onKeyDown(pickerKey('ArrowUp', input), window, session);
    expect(session.picker.selected).toBe(0);

    picker.onKeyDown(pickerKey('j', session.picker.results), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('ArrowUp', session.picker.results), window, session);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('ArrowDown', session.picker.results), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('k', session.picker.results), window, session);
    expect(session.picker.selected).toBe(0);

    picker.onKeyDown(pickerKey('j', session.picker.results, { ctrl: true }), window, session);
    expect(session.picker.selected).toBe(1);
    const firstRow = session.picker.results?.children[0] as HTMLElement & {
      emit(type: string): void;
    };
    firstRow.emit('mouseenter');
    expect(session.picker.selected).toBe(1);

    picker.onKeyDown(pickerKey('k', session.picker.results, { ctrl: true }), window, session);
    expect(session.picker.selected).toBe(0);
    const secondRow = session.picker.results?.children[1] as HTMLElement & {
      emit(type: string): void;
    };
    secondRow.emit('mouseenter');
    expect(session.picker.selected).toBe(0);
  });
});

describe('unified Notes picker', () => {
  it('searches note names, previews in two panes, moves focus, scrolls, trashes, and restores', async () => {
    vi.useFakeTimers();
    const current = {
      id: 1,
      deleted: false,
      dateModified: '2026-09-11 08:00:00',
      isNote: () => true,
      getNote: () => '<p>Current preview body</p>',
      getDisplayTitle: () => 'Current note',
    } as unknown as Zotero.Item;
    const other = {
      id: 2,
      deleted: false,
      dateModified: '2026-09-10 00:00:00',
      isNote: () => true,
      getNote: () => '<p>Body-only searchable phrase</p>',
      getDisplayTitle: () => 'Other note',
    } as unknown as Zotero.Item;
    const parent = {
      id: 10,
      libraryID: 3,
      isNote: () => false,
      isAttachment: () => false,
      getNotes: () => [current.id],
      getDisplayTitle: () => 'Parent item',
    } as unknown as Zotero.Item;
    const attachment = {
      id: 11,
      parentItemID: parent.id,
      isNote: () => false,
      isAttachment: () => true,
    } as unknown as Zotero.Item;
    const byID = new Map([
      [current.id, current],
      [other.id, other],
      [parent.id, parent],
      [attachment.id, attachment],
    ]);
    const trashTx = vi.fn(async (ids: number[]) => {
      for (const id of ids) Reflect.set(byID.get(id) ?? {}, 'deleted', true);
    });
    const undo = vi.fn(async () => {
      Reflect.set(other, 'deleted', false);
      return true;
    });
    class Search {
      addCondition() {}
      async search(): Promise<number[]> {
        return [current.id, other.id];
      }
    }
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: {
        get: (id: number | number[]) =>
          Array.isArray(id)
            ? id.flatMap((value) => byID.get(value) ?? [])
            : (byID.get(id) ?? false),
        getAll: vi.fn(),
        trashTx,
      },
      Reader: { getByTabID: () => ({ itemID: attachment.id }) },
      Libraries: { userLibraryID: 1 },
      Schema: { schemaUpdatePromise: Promise.resolve() },
      Search,
      UndoHistory: { getUndoAction: () => ({ action: 'undo-action-trash' }), undo },
      Notes: { open: vi.fn() },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, {
      Zotero_Tabs: { selectedID: 'reader-tab' },
      ZoteroPane: { getSelectedItems: () => [] },
    });
    const navigation = new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {});
    const restoreTrashedItems = vi.spyOn(navigation, 'restoreTrashedItems');
    const picker = new FuzzyPicker({ debug: vi.fn(), diagnostic: vi.fn() }, navigation);

    await picker.open(window, session, 'notes');
    vi.advanceTimersByTime(30);
    expect(session.picker.preview?.textContent).toContain('Current preview body');
    const input = session.picker.input as HTMLInputElement & { emit(type: string): void };
    input.value = 'other';
    input.emit('input');
    expect(session.picker.filtered.map((item) => item.id)).toEqual([other.id]);
    input.value = 'body-only searchable phrase';
    input.emit('input');
    expect(session.picker.filtered.map((item) => item.id)).toEqual([other.id]);
    input.value = 'not present in any note';
    input.emit('input');
    expect(session.picker.filtered).toHaveLength(0);
    input.value = '';
    input.emit('input');

    picker.onKeyDown(pickerKey('j', input, { ctrl: true }), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('k', input, { ctrl: true }), window, session);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('d', input, { ctrl: true }), window, session);
    expect(session.picker.preview?.scrollBy).toHaveBeenCalledWith({ top: 200 });
    picker.onKeyDown(pickerKey('u', input, { ctrl: true }), window, session);
    expect(session.picker.preview?.scrollBy).toHaveBeenCalledWith({ top: -200 });
    session.picker.selected = 1;
    session.picker.focusPane = 'list';

    picker.onKeyDown(pickerKey('x', session.picker.results), window, session);
    await vi.waitFor(() => expect(trashTx).toHaveBeenCalledWith([other.id]));
    await vi.waitFor(() =>
      expect(session.picker.filtered.map((item) => item.id)).toEqual([current.id]),
    );
    picker.onKeyDown(pickerKey('u', session.picker.results), window, session);
    await vi.waitFor(() => expect(restoreTrashedItems).toHaveBeenCalledWith([other.id]));
    await vi.waitFor(() => expect(undo).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(session.picker.filtered).toHaveLength(2));
  });

  it('ignores a pending note trash completion after close', async () => {
    vi.useFakeTimers();
    let resolveTrash: ((value: boolean) => void) | undefined;
    const pendingTrash = new Promise<boolean>((resolve) => {
      resolveTrash = resolve;
    });
    const note = {
      id: 2,
      deleted: false,
      dateModified: '2026-09-10 00:00:00',
      isNote: () => true,
      getNote: () => '<p>Pending note</p>',
      getDisplayTitle: () => 'Pending note',
    } as unknown as Zotero.Item;
    class Search {
      addCondition() {}
      async search(): Promise<number[]> {
        return [note.id];
      }
    }
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: {
        get: (id: number | number[]) => (Array.isArray(id) ? [note] : note),
        getAll: vi.fn(),
      },
      Schema: { schemaUpdatePromise: Promise.resolve() },
      Search,
      Notes: { open: vi.fn() },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, { ZoteroPane: { getSelectedItems: () => [] } });
    const navigation = new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {});
    const picker = new FuzzyPicker({ debug: vi.fn(), diagnostic: vi.fn() }, navigation);
    vi.spyOn(navigation, 'trashItems').mockReturnValue(pendingTrash);
    await picker.open(window, session, 'notes');
    session.picker.items = [
      { id: note.id, title: 'Pending note', search: 'pending note', kind: 'note' },
    ];
    session.picker.filtered = [...session.picker.items];
    session.picker.selected = 0;
    session.picker.focusPane = 'list';
    picker.onKeyDown(pickerKey('x', session.picker.results), window, session);
    await vi.waitFor(() => expect(navigation.trashItems).toHaveBeenCalledWith([note.id]));
    picker.close(session);
    resolveTrash?.(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(session.picker.items).toEqual([]);
    expect(session.picker.filtered).toEqual([]);
    expect(session.picker.lastDeletedNoteID).toBeNull();
    expect(session.status.textContent).toBe('');
  });

  it('uses a stacked single-column fallback on narrow windows', async () => {
    vi.useFakeTimers();
    class Search {
      addCondition() {}
      async search(): Promise<number[]> {
        return [];
      }
    }
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: { get: () => false, getAll: vi.fn(), trashTx: vi.fn() },
      Reader: { getByTabID: () => null },
      Libraries: { userLibraryID: 1 },
      Schema: { schemaUpdatePromise: Promise.resolve() },
      Search,
    });
    const { window, session, bodyChildren } = createPickerHarness(720);
    Object.assign(window, { ZoteroPane: { getSelectedItems: () => [] } });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

    await picker.open(window, session, 'notes');
    vi.advanceTimersByTime(30);

    expect(session.picker.layout).toBe('single');
    expect(session.picker.results).not.toBeNull();
    expect(session.picker.preview).not.toBeNull();
    const overlay = bodyChildren[0];
    const modal = overlay?.children[0];
    const content = modal?.children[0];
    expect(Array.from(content?.children ?? []).map((element) => element.localName)).toEqual([
      'section',
      'section',
    ]);
    const left = content?.children[0];
    const shortcuts = left?.children[2];
    expect(shortcuts?.textContent).toContain('Ctrl+j/k select');
    expect(shortcuts?.textContent).toContain('Ctrl+d/u preview');
    expect(shortcuts?.textContent).toContain('Enter apply · Esc close');
  });
});

describe('picker async lifecycle', () => {
  it('discards a scope load that finishes after the picker closes', async () => {
    let resolveItems: ((items: Zotero.Item[]) => void) | undefined;
    const pendingItems = new Promise<Zotero.Item[]>((resolve) => {
      resolveItems = resolve;
    });
    const diagnostic = vi.fn();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: { getAll: () => pendingItems },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, { ZoteroPane: { getSelectedItems: () => [] } });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

    const opening = picker.open(window, session, 'all');
    picker.close(session);
    resolveItems?.([
      {
        id: 1,
        isRegularItem: () => true,
        getField: (field: string) => (field === 'title' ? 'Late item' : ''),
      } as unknown as Zotero.Item,
    ]);
    await opening;

    expect(session.picker.open).toBe(false);
    expect(session.picker.items).toEqual([]);
    expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('picker load discarded'));
  });

  it('waits for item selection before opening its attachment', async () => {
    let releaseSelection: (() => void) | undefined;
    const selected: Zotero.Item[] = [];
    const attachment = { id: 2, isAttachment: () => true } as Zotero.Item;
    const item = {
      id: 1,
      isRegularItem: () => true,
      isAttachment: () => false,
      isNote: () => false,
      getField: (field: string) => (field === 'title' ? 'Selected item' : ''),
      getBestAttachment: async () => attachment,
      getAttachments: () => [],
    } as unknown as Zotero.Item;
    const selectItem = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSelection = () => {
            selected.splice(0, selected.length, item);
            resolve();
          };
        }),
    );
    const viewAttachment = vi.fn();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: { getAll: async () => [item] },
      Libraries: { userLibraryID: 1 },
      Utilities: { cleanDOI: (value: string) => value },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, {
      ZoteroPane: { getSelectedItems: () => selected, selectItem, viewAttachment },
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

    await picker.open(window, session, 'all');
    picker.onKeyDown(pickerKey('o', session.picker.results, { ctrl: true }), window, session);
    await vi.waitFor(() => expect(selectItem).toHaveBeenCalledWith(item.id));
    expect(viewAttachment).not.toHaveBeenCalled();

    releaseSelection?.();
    await vi.waitFor(() => expect(viewAttachment).toHaveBeenCalledWith(attachment.id));
    expect(session.picker.open).toBe(false);
  });
});

describe('unified tag picker', () => {
  it('pins active filters, applies AND selection immediately, clears filters, and switches scope', async () => {
    vi.useFakeTimers();
    const selectedTags = new Set(['alpha']);
    const currentTags: _ZoteroTypes.Tags.TagJson[] = [
      { tag: 'beta' },
      { tag: 'alpha' },
      { tag: 'automatic', type: 1 },
    ];
    const libraryTags: _ZoteroTypes.Tags.TagJson[] = [...currentTags, { tag: 'outside' }];
    const setFilter = vi.fn(async (_type: 'tags', tags: ReadonlySet<string>) => {
      selectedTags.clear();
      for (const tag of tags) selectedTags.add(tag);
    });
    const itemsView = { rowCount: 42, setFilter };
    const tagSelector = { selectedTags: new Set(['alpha']) };
    const row = {
      ref: { libraryID: 1 },
      tags: selectedTags,
      getTags: vi.fn(async () => currentTags),
    };
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Tags: { getAll: vi.fn(async () => libraryTags) },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, {
      ZoteroPane: { getCollectionTreeRow: () => row, itemsView, tagSelector },
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

    await picker.open(window, session, 'tags');
    vi.advanceTimersByTime(30);

    expect(session.picker.filtered.map((item) => item.id)).toEqual(['alpha', 'beta', 'automatic']);
    expect(session.picker.filtered[0]?.selected).toBe(true);
    expect(session.picker.tagSelection).toEqual(['alpha']);
    session.picker.tagMode = 'query';
    picker.onKeyDown(pickerKey('ArrowDown', session.picker.input), window, session);
    picker.onKeyDown(pickerKey('j', session.picker.input, { ctrl: true }), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('k', session.picker.input, { ctrl: true }), window, session);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('d', session.picker.input, { ctrl: true }), window, session);
    expect(session.picker.preview?.scrollBy).toHaveBeenCalledWith({ top: 200 });
    picker.onKeyDown(pickerKey('u', session.picker.input, { ctrl: true }), window, session);
    expect(session.picker.preview?.scrollBy).toHaveBeenCalledWith({ top: -200 });

    session.picker.selected = 1;
    picker.onKeyDown(pickerKey(' ', session.picker.results), window, session);
    await vi.waitFor(() =>
      expect(setFilter).toHaveBeenLastCalledWith('tags', new Set(['alpha', 'beta'])),
    );
    expect(session.picker.filtered.map((item) => item.id)).toEqual(['beta', 'alpha', 'automatic']);
    expect(session.picker.selected).toBe(0);
    expect(session.picker.preview?.textContent).toContain('Filters: alpha AND beta');

    picker.onKeyDown(pickerKey('x', session.picker.results), window, session);
    await vi.waitFor(() => expect(setFilter).toHaveBeenLastCalledWith('tags', new Set(['alpha'])));
    expect(session.picker.filtered.map((item) => item.id)).toEqual(['alpha', 'beta', 'automatic']);
    expect(session.picker.selected).toBe(1);

    picker.onKeyDown(pickerKey('a', session.picker.results), window, session);
    await vi.waitFor(() => expect(session.picker.tagScope).toBe('library'));
    await vi.waitFor(() =>
      expect(session.picker.items.map((item) => item.id)).toContain('outside'),
    );

    picker.onKeyDown(pickerKey('C', session.picker.results), window, session);
    await vi.waitFor(() => expect(setFilter).toHaveBeenLastCalledWith('tags', new Set()));
    expect(session.picker.tagSelection).toEqual([]);
    expect(session.picker.preview?.textContent).toContain('Filters: (none)');
    session.picker.selected = session.picker.filtered.findIndex((item) => item.id === 'beta');
    const filterCalls = setFilter.mock.calls.length;
    picker.onKeyDown(pickerKey(' ', session.picker.results), window, session);
    picker.onKeyDown(pickerKey(' ', session.picker.results), window, session);
    await vi.waitFor(() => expect(setFilter).toHaveBeenCalledTimes(filterCalls + 2));
    expect(setFilter).toHaveBeenLastCalledWith('tags', new Set());
    expect(session.picker.tagSelection).toEqual([]);
  });
  it('keeps control keys literal in Query mode and Enter toggles without closing', async () => {
    vi.useFakeTimers();
    const selectedTags = new Set<string>();
    const tags: _ZoteroTypes.Tags.TagJson[] = [{ tag: 'beta' }, { tag: 'alpha' }];
    const setFilter = vi.fn(async (_type: 'tags', next: ReadonlySet<string>) => {
      selectedTags.clear();
      for (const tag of next) selectedTags.add(tag);
    });
    const row = {
      ref: { libraryID: 1 },
      tags: selectedTags,
      getTags: vi.fn(async () => tags),
    };
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Tags: { getAll: vi.fn(async () => tags) },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    const tagSelector = { selectedTags: new Set<string>() };
    Object.assign(window, {
      ZoteroPane: {
        getCollectionTreeRow: () => row,
        itemsView: { rowCount: 7, setFilter },
        tagSelector,
      },
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

    await picker.open(window, session, 'tags');
    vi.advanceTimersByTime(30);
    expect(session.picker.focusPane).toBe('list');
    expect(session.picker.selected).toBe(0);
    const input = session.picker.input as HTMLInputElement & { emit(type: string): void };
    input.value = 'alp';
    input.emit('input');
    picker.onKeyDown(pickerKey('/', session.picker.results), window, session);
    expect(session.picker.focusPane).toBe('search');
    const callsBeforeLiteral = setFilter.mock.calls.length;
    picker.onKeyDown(pickerKey(' ', input), window, session);
    picker.onKeyDown(pickerKey('x', input), window, session);
    picker.onKeyDown(pickerKey('C', input), window, session);
    picker.onKeyDown(pickerKey('a', input), window, session);
    expect(setFilter).toHaveBeenCalledTimes(callsBeforeLiteral);
    picker.onKeyDown(pickerKey('Enter', input), window, session);
    await vi.waitFor(() => expect(setFilter).toHaveBeenLastCalledWith('tags', new Set(['alpha'])));
    expect(session.picker.open).toBe(true);
    expect(session.picker.focusPane).toBe('list');
    picker.onKeyDown(pickerKey('Escape', session.picker.results), window, session);
    expect(session.picker.open).toBe(false);
  });
  it('uses explicit List mode despite physical input focus and target', async () => {
    vi.useFakeTimers();
    const tags: _ZoteroTypes.Tags.TagJson[] = [{ tag: 'alpha' }];
    const row = {
      ref: { libraryID: 1 },
      tags: new Set<string>(),
      getTags: vi.fn(async () => tags),
    };
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Tags: { getAll: vi.fn(async () => tags) },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session, bodyChildren } = createPickerHarness();
    Object.assign(window, {
      ZoteroPane: {
        getCollectionTreeRow: () => row,
        itemsView: { rowCount: 1, setFilter: vi.fn() },
      },
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    await picker.open(window, session, 'tags');
    vi.advanceTimersByTime(30);
    const overlay = bodyChildren[0];
    const content = overlay?.children[0]?.children[0];
    const left = content?.children[0];
    expect(Array.from(left?.children ?? []).map((child) => child.tagName)).toEqual([
      'HEADER',
      'INPUT',
      'DIV',
      'DIV',
      'DIV',
    ]);
    expect(session.picker.queryHelp?.textContent).toContain('Query');
    expect(session.picker.listHelp?.textContent).toContain('List');
    expect(session.picker.queryHelp?.style.cssText).toContain('flex:0 0 auto');
    expect(session.picker.listHelp?.style.cssText).toContain('flex:0 0 auto');
    expect(session.picker.queryHelp?.style.cssText).not.toContain('overflow:auto');
    expect(session.picker.listHelp?.style.cssText).not.toContain('overflow:auto');
    expect(session.picker.results?.style.cssText).toContain('overflow:auto');
    expect(session.picker.results?.style.cssText).toContain('flex:1');
    expect(session.picker.results?.style.cssText).toContain('min-height:0');
    expect(left?.children[2]).toBe(session.picker.queryHelp);
    expect(left?.children[3]).toBe(session.picker.results);
    expect(left?.children[4]).toBe(session.picker.listHelp);
    const input = session.picker.input as HTMLInputElement;
    input.focus();
    session.picker.tagMode = 'list';
    const slash = pickerKey('/', input);
    picker.onKeyDown(slash, window, session);
    expect(session.picker.tagMode).toBe('query');
    expect(slash.preventDefault).toHaveBeenCalledOnce();

    input.focus();
    session.picker.tagMode = 'list';
    const tab = pickerKey('Tab', input);
    tab.stopImmediatePropagation = vi.fn();
    picker.onKeyDown(tab, window, session);
    expect(session.picker.tagMode).toBe('query');
    expect(tab.preventDefault).toHaveBeenCalledOnce();
    expect(tab.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it('resynchronizes native state when a tag filter update fails', async () => {
    vi.useFakeTimers();
    const nativeTags = new Set(['alpha']);
    const setFilter = vi.fn(async () => {
      throw new Error('refresh failed');
    });
    const tags: _ZoteroTypes.Tags.TagJson[] = [{ tag: 'beta' }, { tag: 'alpha' }];
    const row = { ref: { libraryID: 1 }, tags: nativeTags, getTags: vi.fn(async () => tags) };
    const tagSelector = { selectedTags: new Set(['native-selected']) };
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Tags: { getAll: vi.fn(async () => tags) },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, {
      ZoteroPane: {
        getCollectionTreeRow: () => row,
        itemsView: { rowCount: 2, setFilter },
        tagSelector,
      },
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    await picker.open(window, session, 'tags');
    vi.advanceTimersByTime(30);
    session.picker.selected = 1;
    picker.onKeyDown(pickerKey(' ', session.picker.results), window, session);
    await vi.waitFor(() => expect(setFilter).toHaveBeenCalledOnce());
    expect(session.picker.open).toBe(true);
    expect(session.picker.tagSelection).toEqual(['alpha']);
    expect(tagSelector.selectedTags).toEqual(new Set(['alpha']));
  });

  it('keeps tag selection and toggling keyboard-only', async () => {
    vi.useFakeTimers();
    const selectedTags = new Set<string>();
    const tags: _ZoteroTypes.Tags.TagJson[] = [{ tag: 'beta' }, { tag: 'alpha' }];
    const setFilter = vi.fn(async (_type: 'tags', next: ReadonlySet<string>) => {
      selectedTags.clear();
      for (const tag of next) selectedTags.add(tag);
    });
    const row = { ref: { libraryID: 1 }, tags: selectedTags, getTags: vi.fn(async () => tags) };
    const tagSelector = { selectedTags: new Set(['native-selected']) };
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Tags: { getAll: vi.fn(async () => tags) },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, {
      ZoteroPane: {
        getCollectionTreeRow: () => row,
        itemsView: { rowCount: 3, setFilter },
        tagSelector,
      },
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    await picker.open(window, session, 'tags');
    expect(session.picker.tagSelection).toEqual([]);
    expect(tagSelector.selectedTags).toEqual(new Set(['native-selected']));
    vi.advanceTimersByTime(30);
    const callsBeforePointer = setFilter.mock.calls.length;
    const second = session.picker.results?.children[1] as HTMLElement & {
      emit(type: string): void;
    };
    expect(second.children).toHaveLength(2);
    const marker = second.children[0] as HTMLElement & { emit(type: string): void };
    expect(marker.tagName).toBe('SPAN');
    expect(marker.tabIndex).toBe(-1);
    expect(Reflect.get(marker, 'role')).toBe('checkbox');
    expect(Reflect.get(marker, 'aria-checked')).toBe('false');
    expect(second.children[1]?.textContent).toBe('alpha · manual');
    second.emit('click');
    second.emit('dblclick');
    second.emit('mouseenter');
    marker.emit('click');
    expect(session.picker.selected).toBe(0);
    expect(setFilter).toHaveBeenCalledTimes(callsBeforePointer);

    picker.onKeyDown(pickerKey('j', session.picker.results, { ctrl: true }), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey(' ', session.picker.results), window, session);
    await vi.waitFor(() => expect(setFilter).toHaveBeenLastCalledWith('tags', new Set(['alpha'])));
    expect(session.picker.open).toBe(true);
    expect(tagSelector.selectedTags).toEqual(new Set(['alpha']));
  });

  it('ignores a pending tag filter completion after close', async () => {
    let resolveFilter: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      resolveFilter = resolve;
    });
    const selectedTags = new Set<string>();
    const tags: _ZoteroTypes.Tags.TagJson[] = [{ tag: 'beta' }];
    const setFilter = vi.fn(() => pending);
    const row = { ref: { libraryID: 1 }, tags: selectedTags, getTags: vi.fn(async () => tags) };
    const tagSelector = { selectedTags: new Set<string>() };
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Tags: { getAll: vi.fn(async () => tags) },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, {
      ZoteroPane: {
        getCollectionTreeRow: () => row,
        itemsView: { rowCount: 1, setFilter },
        tagSelector,
      },
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    await picker.open(window, session, 'tags');
    session.picker.selected = 0;
    picker.onKeyDown(pickerKey(' ', session.picker.results), window, session);
    await vi.waitFor(() => expect(setFilter).toHaveBeenCalledOnce());
    picker.close(session);
    resolveFilter?.();
    await Promise.resolve();
    expect(session.picker.open).toBe(false);
    expect(session.picker.tagSelection).toEqual([]);
    expect(tagSelector.selectedTags).toEqual(new Set());
  });

  it('ignores a pending tag scope load after close', async () => {
    let resolveTags: ((tags: _ZoteroTypes.Tags.TagJson[]) => void) | undefined;
    const pendingTags = new Promise<_ZoteroTypes.Tags.TagJson[]>((resolve) => {
      resolveTags = resolve;
    });
    const currentTags: _ZoteroTypes.Tags.TagJson[] = [{ tag: 'current' }];
    const row = {
      ref: { libraryID: 1 },
      tags: new Set<string>(),
      getTags: vi.fn(async () => currentTags),
    };
    const getAll = vi.fn(() => pendingTags);
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', { Tags: { getAll }, Libraries: { userLibraryID: 1 } });
    const { window, session } = createPickerHarness();
    Object.assign(window, {
      ZoteroPane: {
        getCollectionTreeRow: () => row,
        itemsView: { rowCount: 1, setFilter: vi.fn() },
      },
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    await picker.open(window, session, 'tags');
    picker.onKeyDown(pickerKey('a', session.picker.results), window, session);
    await vi.waitFor(() => expect(getAll).toHaveBeenCalledOnce());
    picker.close(session);
    resolveTags?.([{ tag: 'library' }]);
    await Promise.resolve();
    expect(session.picker.open).toBe(false);
    expect(session.picker.tagScope).toBe('current');
    expect(session.picker.items).toEqual([]);
  });
});
describe('citation-key lookup', () => {
  it('prefers the native citationKey field populated by current Better BibTeX', () => {
    const item = {
      id: 1,
      getField: (field: string) => (field === 'citationKey' ? 'Smith2026' : ''),
    } as Zotero.Item;

    expect(citationKey(item)).toBe('Smith2026');
  });

  it('falls back to the Better BibTeX cache for read-only items', () => {
    Reflect.set(globalThis, 'Zotero', {
      BetterBibTeX: {
        KeyManager: {
          get: (itemID: number) =>
            itemID === 2 ? { itemID, citationKey: 'Cached2026' } : undefined,
        },
      },
    });
    const item = { id: 2, getField: () => '' } as unknown as Zotero.Item;

    expect(citationKey(item)).toBe('Cached2026');
  });
});
