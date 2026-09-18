import { afterEach, describe, expect, it, vi } from 'vitest';

import { isActionId, type ActionId } from '../../src/input/actions';
import { MAIN_EXECUTABLE_ACTIONS } from '../../src/main/action-capabilities';
import { READER_NORMAL_ACTIONS } from '../../src/reader/action-capabilities';
import type { CommandPaletteContext, MainWindow } from '../../src/core/contracts';
import {
  FuzzyPicker,
  fuzzyMatchScore,
  fuzzyPickerRowText,
  isFuzzyPickerItem,
} from '../../src/main/picker';
import { MainNavigation } from '../../src/main/navigation';
import type { MainWindowSession } from '../../src/main/session';
import type { PickerOpenOptions } from '../../src/main/picker/types';
import { createTagCandidateProvider } from '../../src/main/picker/providers/tags';
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

function commandPickerOptions(context: CommandPaletteContext): PickerOpenOptions {
  return {
    commandContext: context,
    closeBeforeConfirm: true,
    confirm: (item) => {
      if (isActionId(item.id) && item.id !== 'openCommandPalette') context.execute(item.id, 0);
    },
  };
}

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

describe('item picker target resolution', () => {
  it('navigates and confirms the highlighted target while leaving domain keys unclaimed', async () => {
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
    const collection = {
      getChildItems: () => [first, second],
    } as unknown as Zotero.Collection;
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
      ZoteroPane: {
        getSelectedItems: () => nativeSelection,
        selectItem,
        collectionsView: { getSelectedCollections: () => [collection] },
      },
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    const options: PickerOpenOptions = {
      confirm: async (item) => {
        await selectItem(Number(item.id));
      },
    };

    await picker.open(window, session, 'all', options);
    const row = session.picker.results?.children[1] as HTMLElement & { emit(type: string): void };
    row.emit('click');
    row.emit('dblclick');
    row.emit('mouseenter');
    expect(session.picker.selected).toBe(0);
    expect(selectItem).not.toHaveBeenCalled();

    const input = session.picker.input;
    const arrowDown = pickerKey('ArrowDown', input);
    picker.onKeyDown(arrowDown, window, session);
    expect(session.picker.selected).toBe(1);
    const arrowUp = pickerKey('ArrowUp', input);
    picker.onKeyDown(arrowUp, window, session);
    expect(session.picker.selected).toBe(0);
    expect(arrowDown.preventDefault).toHaveBeenCalledOnce();
    expect(arrowUp.preventDefault).toHaveBeenCalledOnce();

    const literalJ = pickerKey('j', input);
    picker.onKeyDown(literalJ, window, session);
    expect(session.picker.selected).toBe(0);
    expect(literalJ.preventDefault).not.toHaveBeenCalled();
    picker.onKeyDown(pickerKey('j', session.picker.results), window, session);
    expect(session.picker.selected).toBe(1);

    picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
    await vi.waitFor(() => expect(selectItem).toHaveBeenCalledWith(second.id));
    expect(session.picker.open).toBe(false);

    await picker.open(window, session, 'all', options);
    for (const event of [
      pickerKey('o', session.picker.results, { ctrl: true }),
      pickerKey('y', session.picker.results),
    ]) {
      picker.onKeyDown(event, window, session);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(selectItem).toHaveBeenCalledTimes(1);
    picker.close(session);

    await picker.open(window, session, 'collection', options);
    picker.onKeyDown(pickerKey('ArrowDown', session.picker.input), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('ArrowUp', session.picker.input), window, session);
    expect(session.picker.selected).toBe(0);
    picker.close(session);
  });
});

describe('picker IME boundary', () => {
  it('defers filtering and command keys until composition commits', async () => {
    const first = {
      id: 1,
      isRegularItem: () => true,
      getField: (field: string) => (field === 'title' ? '机器人学习' : ''),
      getCreators: () => [],
      getAttachments: () => [],
      getNotes: () => [],
    } as unknown as Zotero.Item;
    const second = {
      id: 2,
      isRegularItem: () => true,
      getField: (field: string) => (field === 'title' ? 'Diffusion Models' : ''),
      getCreators: () => [],
      getAttachments: () => [],
      getNotes: () => [],
    } as unknown as Zotero.Item;
    const selectItem = vi.fn(async (_id: number) => undefined);
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: { getAll: async () => [first, second] },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, { ZoteroPane: { getSelectedItems: () => [], selectItem } });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

    await picker.open(window, session, 'all');
    const input = session.picker.input as HTMLInputElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
    input.emit('compositionstart');
    input.value = '机器人';
    input.emit('input', { isComposing: true } as unknown as Partial<Event>);
    expect(session.picker.filtered).toHaveLength(2);

    const enter = pickerKey('Enter', input, { isComposing: true, keyCode: 229 });
    picker.onKeyDown(enter, window, session);
    expect(enter.preventDefault).not.toHaveBeenCalled();
    expect(selectItem).not.toHaveBeenCalled();
    expect(session.picker.open).toBe(true);

    const selectedBefore = session.picker.selected;
    picker.onKeyDown(
      pickerKey('ArrowDown', input, { isComposing: true, keyCode: 229 }),
      window,
      session,
    );
    expect(session.picker.selected).toBe(selectedBefore);

    input.emit('compositionend');
    input.emit('input', { isComposing: false } as unknown as Partial<Event>);
    expect(session.picker.filtered.map((item) => item.id)).toEqual([first.id]);
  });
});

describe('picker mouse activation', () => {
  it('reads mouse preference at event time and confirms an item row once', async () => {
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
    const selectItem = vi.fn(async (_id: number) => undefined);
    let mouseEnabled = false;
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: { getAll: async () => [first, second] },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, { ZoteroPane: { getSelectedItems: () => [], selectItem } });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => mouseEnabled,
    );

    await picker.open(window, session, 'all', {
      confirm: async (item) => {
        await selectItem(Number(item.id));
      },
    });
    const firstRow = session.picker.results?.children[0] as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
    const secondRow = session.picker.results?.children[1] as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
    secondRow.emit('mouseenter');
    secondRow.emit('click');
    expect(session.picker.selected).toBe(0);
    expect(session.picker.previewTitle?.textContent).toBe('First item');

    mouseEnabled = true;
    secondRow.emit('click', { button: 1 } as unknown as Partial<Event>);
    secondRow.emit('dblclick', { button: 1 } as unknown as Partial<Event>);
    expect(session.picker.selected).toBe(0);
    expect(selectItem).not.toHaveBeenCalled();
    secondRow.emit('click');
    expect(session.picker.selected).toBe(1);
    expect(session.picker.previewTitle?.textContent).toBe('Second item');

    session.picker.selected = 1;
    const input = session.picker.input as HTMLInputElement;
    input.focus();
    input.value = 'typed query';
    const firstLabel = firstRow.children[0] as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
    firstLabel.emit('click');
    expect(session.picker.selected).toBe(0);
    expect(session.picker.focusPane).toBe('list');
    expect(window.document.activeElement).toBe(session.picker.results);
    picker.onKeyDown(pickerKey('j', session.picker.results), window, session);
    expect(session.picker.selected).toBe(1);
    expect(input.value).toBe('typed query');

    const currentSecondRow = session.picker.results?.children[1] as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
    currentSecondRow.emit('dblclick');
    await vi.waitFor(() => expect(selectItem).toHaveBeenCalledWith(second.id));
    expect(selectItem).toHaveBeenCalledOnce();
    expect(session.picker.open).toBe(false);
  });
});

describe('command palette provider', () => {
  it('deduplicates remapped actions and closes before keyboard or pointer execution', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const tabs = {
      _tabs: [{ id: 'library', title: 'Library', type: 'library' }],
      selectedID: 'library',
    };
    const actions: [ActionId, number][] = [];
    let picker: FuzzyPicker;
    const context: CommandPaletteContext = {
      mode: 'main',
      bindingMode: 'main-normal',
      actions: ['mainFuzzyAll', 'mainFuzzyAll', 'mainNextTab', 'mainOpenPDF', 'openCommandPalette'],
      language: 'en',
      bindings: {
        'main-normal::': 'openCommandPalette',
        'main-normal:x': 'mainFuzzyAll',
        'main-normal:y': 'mainFuzzyAll',
        'main-normal:z': 'mainNextTab',
      },
      execute: (action, count) => {
        actions.push([action, count]);
        if (action === 'mainFuzzyAll') void picker.open(window, session, 'tabs');
      },
    };
    const { window, session } = createPickerHarness();
    picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => true,
    );
    await picker.open(window, session, 'commands', commandPickerOptions(context));
    const all = session.picker.filtered.find((item) => item.id === 'mainFuzzyAll');
    expect(all?.title).toBe('Main window: fuzzy picker — all items');
    expect(all?.meta).toBe('x, y');
    expect(all?.search).toContain('x, y');
    expect(session.picker.filtered.filter((item) => item.id === 'mainFuzzyAll')).toHaveLength(1);
    expect(session.picker.filtered.some((item) => item.id === 'openCommandPalette')).toBe(false);
    const openPDF = session.picker.filtered.find((item) => item.id === 'mainOpenPDF');
    const provider = session.picker.provider;
    if (!openPDF || !provider) throw new Error('Expected catalog unbound command');
    expect(openPDF.meta).toBe('Unbound');
    expect(provider.preview(openPDF).body).toContain('Keys: Unbound');
    const commandInput = session.picker.input;
    picker.onKeyDown(pickerKey('ArrowDown', commandInput), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('ArrowUp', commandInput), window, session);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('ArrowDown', session.picker.results), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('ArrowUp', session.picker.results), window, session);
    expect(session.picker.selected).toBe(0);

    const keyboardIndex = session.picker.filtered.findIndex((item) => item.id === 'mainFuzzyAll');
    session.picker.selected = keyboardIndex;
    picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
    await vi.waitFor(() => expect(actions).toEqual([['mainFuzzyAll', 0]]));
    await vi.waitFor(() => expect(session.picker.scope).toBe('tabs'));
    expect(session.picker.open).toBe(true);

    picker.close(session);
    await picker.open(window, session, 'commands', commandPickerOptions(context));
    const pointerIndex = session.picker.filtered.findIndex((item) => item.id === 'mainFuzzyAll');
    const pointerRow = session.picker.results?.children[pointerIndex] as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
    pointerRow.emit('dblclick');
    await vi.waitFor(() =>
      expect(actions).toEqual([
        ['mainFuzzyAll', 0],
        ['mainFuzzyAll', 0],
      ]),
    );
    await vi.waitFor(() => expect(session.picker.scope).toBe('tabs'));
  });
  it('keeps unbound catalog commands searchable and executable', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const execute = vi.fn<CommandPaletteContext['execute']>();
    const { window, session } = createPickerHarness();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    const context: CommandPaletteContext = {
      mode: 'main',
      bindingMode: 'main-normal',
      actions: ['mainFuzzyAll', 'mainOpenPDF'],
      language: 'en',
      bindings: { 'main-normal:x': 'mainFuzzyAll' },
      execute,
    };

    await picker.open(window, session, 'commands', commandPickerOptions(context));
    const openPDF = session.picker.filtered.find((item) => item.id === 'mainOpenPDF');
    const provider = session.picker.provider;
    if (!openPDF || !provider) throw new Error('Expected catalog unbound command');
    expect(openPDF.meta).toBe('Unbound');
    expect(provider.preview(openPDF).body).toBe('Action: mainOpenPDF\nKeys: Unbound');
    const input = session.picker.input as (HTMLInputElement & { emit(type: string): void }) | null;
    if (!input) throw new Error('Expected mounted picker input');
    input.value = 'unbound';
    input.emit('input');
    expect(session.picker.filtered.map((item) => item.id)).toEqual(['mainOpenPDF']);
    input.value = 'mainOpenPDF';
    input.emit('input');
    expect(session.picker.filtered.map((item) => item.id)).toEqual(['mainOpenPDF']);

    picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith('mainOpenPDF', 0));
    expect(session.picker.open).toBe(false);
  });

  it('localizes unbound command metadata, preview, and search', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    const context: CommandPaletteContext = {
      mode: 'main',
      bindingMode: 'main-normal',
      actions: ['mainOpenPDF'],
      language: 'zh-CN',
      bindings: {},
      execute: () => {},
    };

    await picker.open(window, session, 'commands', commandPickerOptions(context));
    const item = session.picker.filtered[0];
    const provider = session.picker.provider;
    if (!item || !provider) throw new Error('Expected mounted command provider');
    expect(item.title).toBe('主窗口：打开所选条目的 PDF');
    expect(item.meta).toBe('未绑定');
    expect(provider.rowText(item, 0)).toBe('主窗口：打开所选条目的 PDF · 未绑定');
    const input = session.picker.input as (HTMLInputElement & { emit(type: string): void }) | null;
    if (!input) throw new Error('Expected mounted picker input');
    input.value = '未绑定';
    input.emit('input');
    expect(session.picker.filtered.map((candidate) => candidate.id)).toEqual(['mainOpenPDF']);
  });

  it('keeps Reader and Main command catalogs context-specific', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    const readerContext: CommandPaletteContext = {
      mode: 'normal',
      bindingMode: 'reader-normal',
      actions: READER_NORMAL_ACTIONS,
      language: 'en',
      bindings: {
        'reader-normal:z': 'zoomIn',
        'reader-normal:m': 'mainFuzzyAll',
        'reader-normal:v': 'highlightYellow',
      },
      execute: () => {},
    };

    await picker.open(window, session, 'commands', commandPickerOptions(readerContext));
    const readerIds = session.picker.filtered.map((item) => item.id);
    expect(readerIds).toContain('zoomIn');
    expect(readerIds).toContain('mainFuzzyAll');
    expect(readerIds).not.toContain('highlightYellow');
    expect(readerIds).not.toContain('cursorDown');
    picker.close(session);

    const mainContext: CommandPaletteContext = {
      mode: 'main',
      bindingMode: 'main-normal',
      actions: MAIN_EXECUTABLE_ACTIONS,
      language: 'en',
      bindings: {
        'main-normal:x': 'mainFuzzyAll',
        'main-normal:y': 'zoomIn',
        'main-normal:z': 'toggleMarksExplorer',
      },
      execute: () => {},
    };
    await picker.open(window, session, 'commands', commandPickerOptions(mainContext));
    const mainIds = session.picker.filtered.map((item) => item.id);
    expect(mainIds).toContain('mainFuzzyAll');
    expect(mainIds).toContain('mainTabPick');
    expect(mainIds).not.toContain('toggleMarksExplorer');
    expect(mainIds).not.toContain('highlightYellow');
  });

  it('closes on Escape and restores the prior focus target', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    const context: CommandPaletteContext = {
      mode: 'main',
      bindingMode: 'main-normal',
      actions: ['mainNextTab'],
      language: 'en',
      bindings: { 'main-normal:x': 'mainNextTab' },
      execute: () => {},
    };
    await picker.open(window, session, 'commands', commandPickerOptions(context));
    const restore = { isConnected: true, focus: vi.fn() } as unknown as HTMLElement;
    session.picker.previousElement = restore;
    picker.onKeyDown(pickerKey('Escape', session.picker.input), window, session);
    expect(session.picker.open).toBe(false);
    expect(restore.focus).toHaveBeenCalledOnce();
  });
  it('discards a queued command after close and reopen', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const execute = vi.fn<CommandPaletteContext['execute']>();
    const context: CommandPaletteContext = {
      mode: 'main',
      bindingMode: 'main-normal',
      actions: ['mainNextTab'],
      language: 'en',
      bindings: { 'main-normal:x': 'mainNextTab' },
      execute,
    };
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

    await picker.open(window, session, 'commands', commandPickerOptions(context));
    session.picker.selected = 0;
    picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
    picker.close(session);
    await picker.open(window, session, 'commands', commandPickerOptions(context));
    await Promise.resolve();
    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();
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
      parentElement: null as HTMLElement | null,
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
        for (const node of nodes)
          Reflect.set(node, 'parentElement', element as unknown as HTMLElement);
        children.push(...nodes);
        textContent += nodes.map((node) => node.textContent ?? '').join('');
      },
      appendChild: (node: HTMLElement) => {
        Reflect.set(node, 'parentElement', element as unknown as HTMLElement);
        children.push(node);
        textContent += node.textContent ?? '';
      },
      replaceChildren: (...nodes: HTMLElement[]) => {
        for (const child of children) Reflect.set(child, 'parentElement', null);
        for (const node of nodes)
          Reflect.set(node, 'parentElement', element as unknown as HTMLElement);
        children.splice(0, children.length, ...nodes);
        textContent = nodes.map((node) => node.textContent ?? '').join('');
      },
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      removeEventListener: () => {},
      closest: (selector: string) => {
        if (selector === '[data-zv-picker-row="1"]' && element.dataset.zvPickerRow === '1')
          return element as unknown as HTMLElement;
        return element.parentElement?.closest?.(selector) ?? null;
      },
      emit: (type: string, event: Partial<Event> = {}) => {
        let stopped = false;
        const synthetic = {
          ...event,
          target: event.target ?? element,
          preventDefault: () => event.preventDefault?.(),
          stopPropagation: () => {
            stopped = true;
            event.stopPropagation?.();
          },
          stopImmediatePropagation: () => {
            stopped = true;
            event.stopImmediatePropagation?.();
          },
        } as Event;
        for (const listener of listeners.get(type) ?? []) listener(synthetic);
        if (!stopped)
          (
            element.parentElement as
              | (HTMLElement & { emit?: (type: string, event?: Event) => void })
              | null
          )?.emit?.(type, synthetic);
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
    return element as unknown as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
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
  options: { ctrl?: boolean; shift?: boolean; isComposing?: boolean; keyCode?: number } = {},
): KeyboardEvent {
  return {
    key,
    target,
    ctrlKey: options.ctrl ?? false,
    shiftKey: options.shift ?? false,
    metaKey: false,
    altKey: false,
    isComposing: options.isComposing ?? false,
    keyCode: options.keyCode ?? 0,
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
    const options: PickerOpenOptions = {
      confirm: (item) => {
        tabs.select(String(item.id));
      },
    };

    await picker.open(window, session, 'tabs', options);
    expect(session.picker.results?.children[0]?.textContent).toBe('Library');
    picker.onKeyDown(pickerKey('Enter', session.picker.input), window, session);
    await vi.waitFor(() => expect(selected).toEqual(['zotero-pane']));
    expect(session.picker.open).toBe(false);

    await picker.open(window, session, 'tabs', options);
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
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('ArrowDown', input), window, session);
    expect(session.picker.selected).toBe(1);
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
  it('selects and confirms a tab row with enabled mouse', async () => {
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
      () => true,
    );

    await picker.open(window, session, 'tabs', {
      confirm: (item) => {
        tabs.select(String(item.id));
      },
    });
    const row = session.picker.results?.children[1] as HTMLElement & { emit(type: string): void };
    expect(row.dataset.zvPickerRow).toBe('1');
    row.emit('mouseenter');
    expect(session.picker.selected).toBe(0);
    row.emit('click');
    expect(session.picker.selected).toBe(1);
    expect(session.picker.preview?.textContent).toContain('reader');
    expect(selected).toEqual([]);
    row.emit('dblclick');
    await vi.waitFor(() => expect(selected).toEqual(['reader-tab']));
    expect(selected).toHaveLength(1);
    expect(session.picker.open).toBe(false);
  });
});

describe('unified Notes picker', () => {
  it('searches and previews notes while leaving domain mutation keys unclaimed', async () => {
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
      },
      Reader: { getByTabID: () => ({ itemID: attachment.id }) },
      Libraries: { userLibraryID: 1 },
      Schema: { schemaUpdatePromise: Promise.resolve() },
      Search,
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, {
      Zotero_Tabs: { selectedID: 'reader-tab' },
      ZoteroPane: { getSelectedItems: () => [] },
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );

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
    input.value = '';
    input.emit('input');

    picker.onKeyDown(pickerKey('ArrowDown', input), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('ArrowUp', input), window, session);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('j', input, { ctrl: true }), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('k', input, { ctrl: true }), window, session);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('d', input, { ctrl: true }), window, session);
    expect(session.picker.preview?.scrollBy).toHaveBeenCalledWith({ top: 200 });
    picker.onKeyDown(pickerKey('u', input, { ctrl: true }), window, session);
    expect(session.picker.preview?.scrollBy).toHaveBeenCalledWith({ top: -200 });

    session.picker.focusPane = 'list';
    for (const key of ['n', 'x', 'u']) {
      const event = pickerKey(key, session.picker.results);
      picker.onKeyDown(event, window, session);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    const slash = pickerKey('/', session.picker.results);
    picker.onKeyDown(slash, window, session);
    expect(slash.preventDefault).toHaveBeenCalledOnce();
    expect(session.picker.focusPane).toBe('search');
  });

  it('selects and confirms a note row with enabled mouse', async () => {
    const note = {
      id: 7,
      deleted: false,
      dateModified: '2026-09-12 08:00:00',
      isNote: () => true,
      getNote: () => '<p>Mouse note body</p>',
      getDisplayTitle: () => 'Mouse note',
    } as unknown as Zotero.Item;
    class Search {
      addCondition() {}
      async search(): Promise<number[]> {
        return [note.id];
      }
    }
    const selectItem = vi.fn(async (_id: number) => undefined);
    const openNote = vi.fn(async (_id: number, _options: { openInWindow: boolean }) => undefined);
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: {
        get: (id: number | number[]) => (Array.isArray(id) ? [note] : note),
      },
      Libraries: { userLibraryID: 1 },
      Schema: { schemaUpdatePromise: Promise.resolve() },
      Search,
      Notes: { open: vi.fn() },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, { ZoteroPane: { getSelectedItems: () => [], selectItem, openNote } });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => true,
    );

    await picker.open(window, session, 'notes', {
      confirm: async (item, openInWindow) => {
        const id = Number(item.id);
        await selectItem(id);
        await openNote(id, { openInWindow });
      },
    });
    const row = session.picker.results?.children[0] as HTMLElement & { emit(type: string): void };
    row.emit('mouseenter');
    expect(session.picker.selected).toBe(0);
    row.emit('click');
    expect(session.picker.preview?.textContent).toContain('Mouse note body');
    expect(selectItem).not.toHaveBeenCalled();
    row.emit('dblclick');
    await vi.waitFor(() => expect(openNote).toHaveBeenCalledWith(note.id, { openInWindow: false }));
    expect(openNote).toHaveBeenCalledOnce();
    expect(session.picker.open).toBe(false);
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
      (_id: number) =>
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
    const navigation = new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {});
    const picker = new FuzzyPicker({ debug: vi.fn(), diagnostic: vi.fn() }, navigation);

    await picker.open(window, session, 'all', {
      confirm: async (target) => {
        await selectItem(Number(target.id));
        await navigation.openPDF(window, session);
      },
    });
    picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
    await vi.waitFor(() => expect(selectItem).toHaveBeenCalledWith(item.id));
    expect(viewAttachment).not.toHaveBeenCalled();

    releaseSelection?.();
    await vi.waitFor(() => expect(viewAttachment).toHaveBeenCalledWith(attachment.id));
    expect(session.picker.open).toBe(false);
  });
});

describe('pointer activation lifecycle', () => {
  it('leaves the picker open when pointer activation fails', async () => {
    const item = {
      id: 3,
      isRegularItem: () => true,
      isAttachment: () => false,
      isNote: () => false,
      getField: (field: string) => (field === 'title' ? 'Failed item' : ''),
      getCreators: () => [],
      getAttachments: () => [],
      getNotes: () => [],
    } as unknown as Zotero.Item;
    const selectItem = vi.fn(async (_id: number) => {
      throw new Error('selection failed');
    });
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: { getAll: async () => [item] },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, { ZoteroPane: { getSelectedItems: () => [], selectItem } });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => true,
    );

    await picker.open(window, session, 'all', {
      confirm: async (target) => {
        await selectItem(Number(target.id));
      },
    });
    const row = session.picker.results?.children[0] as HTMLElement & { emit(type: string): void };
    row.emit('dblclick');
    await vi.waitFor(() => expect(selectItem).toHaveBeenCalledOnce());
    expect(session.picker.open).toBe(true);
  });

  it('discards pointer activation that finishes after the picker closes', async () => {
    let releaseSelection: (() => void) | undefined;
    const item = {
      id: 4,
      isRegularItem: () => true,
      isAttachment: () => false,
      isNote: () => false,
      getField: (field: string) => (field === 'title' ? 'Stale item' : ''),
      getCreators: () => [],
      getAttachments: () => [],
      getNotes: () => [],
    } as unknown as Zotero.Item;
    const selectItem = vi.fn(
      (_id: number) =>
        new Promise<void>((resolve) => {
          releaseSelection = resolve;
        }),
    );
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: { getAll: async () => [item] },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, { ZoteroPane: { getSelectedItems: () => [], selectItem } });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => true,
    );

    await picker.open(window, session, 'all', {
      confirm: async (target) => {
        await selectItem(Number(target.id));
      },
    });
    const row = session.picker.results?.children[0] as HTMLElement & { emit(type: string): void };
    row.emit('dblclick');
    await vi.waitFor(() => expect(selectItem).toHaveBeenCalledOnce());
    picker.close(session);
    releaseSelection?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.picker.open).toBe(false);
  });
  it('revalidates the clicked item when filtering reorders rows before activation', async () => {
    const first = {
      id: 11,
      isRegularItem: () => true,
      isAttachment: () => false,
      isNote: () => false,
      getField: (field: string) => (field === 'title' ? 'First stable item' : ''),
      getCreators: () => [],
      getAttachments: () => [],
      getNotes: () => [],
    } as unknown as Zotero.Item;
    const second = {
      id: 12,
      isRegularItem: () => true,
      isAttachment: () => false,
      isNote: () => false,
      getField: (field: string) => (field === 'title' ? 'Second stable item' : ''),
      getCreators: () => [],
      getAttachments: () => [],
      getNotes: () => [],
    } as unknown as Zotero.Item;
    const selectItem = vi.fn(async (_id: number) => undefined);
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    vi.stubGlobal('Zotero', {
      Items: { getAll: async () => [first, second] },
      Libraries: { userLibraryID: 1 },
    });
    const { window, session } = createPickerHarness();
    Object.assign(window, { ZoteroPane: { getSelectedItems: () => [], selectItem } });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => true,
    );

    await picker.open(window, session, 'all', {
      confirm: async (target) => {
        await selectItem(Number(target.id));
      },
    });
    const row = session.picker.results?.children[0] as HTMLElement & { emit(type: string): void };
    const [firstItem, secondItem] = session.picker.filtered;
    row.emit('dblclick');
    session.picker.filtered = [secondItem!, firstItem!];
    await vi.waitFor(() => expect(selectItem).toHaveBeenCalledWith(first.id));
    expect(selectItem).not.toHaveBeenCalledWith(second.id);
    expect(session.picker.open).toBe(false);
  });
});
describe('tag candidate chooser', () => {
  it('refines virtual namespaces and confirms a create candidate without a tag mini-grammar', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    const confirm = vi.fn();
    const source = createTagCandidateProvider({
      title: 'Add Tag',
      placeholder: '> Search or create a tag…',
      separator: '/',
      allowCreate: true,
      loadTags: async () => [{ tag: 'robot/vision' }, { tag: 'robot/control' }, { tag: 'ml' }],
    });

    await picker.open(window, session, 'tags', { source, confirm });
    expect(session.picker.filtered.map((item) => item.tagCandidate)).toEqual(['namespace', 'tag']);
    expect(session.picker.filtered[0]?.tagName).toBe('robot/');

    picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
    await vi.waitFor(() => expect(session.picker.input?.value).toBe('robot/'));
    expect(session.picker.open).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(session.picker.filtered.map((item) => item.tagName)).toEqual([
      'robot/control',
      'robot/vision',
    ]);

    const input = session.picker.input as HTMLInputElement & { emit(type: string): void };
    input.value = 'robot/new';
    input.emit('input');
    expect(session.picker.filtered[0]?.tagCandidate).toBe('create');
    expect(session.picker.filtered[0]?.tagName).toBe('robot/new');

    picker.onKeyDown(pickerKey('Enter', input), window, session);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      tagCandidate: 'create',
      tagName: 'robot/new',
    });
    expect(session.picker.open).toBe(false);
  });

  it('leaves domain mutation keys unclaimed and uses the ordinary pointer policy', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const confirm = vi.fn();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => true,
    );
    const source = createTagCandidateProvider({
      title: 'Remove Tag',
      placeholder: '> Search assigned tags…',
      separator: '/',
      loadTags: async () => [{ tag: 'alpha' }, { tag: 'beta' }],
    });

    await picker.open(window, session, 'tags', { source, confirm });
    session.picker.focusPane = 'list';
    for (const key of ['x', 'C', 'a', ' ']) {
      const event = pickerKey(key, session.picker.results);
      picker.onKeyDown(event, window, session);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }

    const second = session.picker.results?.children[1] as HTMLElement & {
      emit(type: string): void;
    };
    second.emit('click');
    expect(session.picker.selected).toBe(1);
    second.emit('dblclick');
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({ tagName: 'beta' });
    expect(session.picker.open).toBe(false);
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
