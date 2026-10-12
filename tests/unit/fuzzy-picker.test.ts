import { afterEach, describe, expect, it, vi } from 'vitest';

import { isActionId, type ActionId } from '../../src/input/actions';
import { DEFAULT_BINDINGS, resolveBindings, type BindingMap } from '../../src/input/bindings';
import { MAIN_EXECUTABLE_ACTIONS } from '../../src/main/action-capabilities';
import { READER_NORMAL_ACTIONS } from '../../src/reader/action-capabilities';
import type { CommandPaletteContext, MainWindow } from '../../src/core/contracts';
import type { MainWindowSession } from '../../src/main/session';
import {
  FuzzyPicker,
  fuzzyMatchScore,
  fuzzyPickerRowText,
  isFuzzyPickerItem,
} from '../../src/main/picker';
import { MainNavigation } from '../../src/main/navigation';
import type { PickerOpenOptions, PickerProvider } from '../../src/main/picker/types';
import type { PickerItem } from '../../src/main/picker/model';
import { createTagCandidateProvider } from '../../src/main/picker/providers/tags';
import { createCommandsProvider } from '../../src/main/picker/providers/commands';
import { citationKey } from '../../src/platform/better-bibtex';
import { createPickerHarness, pickerKey } from './feature-panel-harness';
import { actionGroup, groupLabel, shortcutsForAction } from '../../src/input/shortcut-catalog';

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function candidateSource(items: PickerItem[], title = 'Candidates'): PickerProvider {
  return {
    title,
    placeholder: 'Search candidates',
    load: async () => items,
    rowText: (item) => item.title,
    preview: (item) => ({ title: item.title, body: item.title }),
  };
}

type EmittingElement = HTMLElement & { emit(type: string, event?: Partial<Event>): void };

function activateSourceButton(
  picker: FuzzyPicker,
  window: MainWindow,
  session: MainWindowSession,
): void {
  const button = session.picker.sourceButton as HTMLButtonElement & EmittingElement;
  expect(button).not.toBeNull();
  expect(button.type).toBe('button');
  expect(button.tabIndex).toBe(0);
  session.picker.input!.focus();
  const tab = pickerKey('Tab', session.picker.input, { shift: true });
  picker.onKeyDown(tab, window, session);
  expect(tab.preventDefault).not.toHaveBeenCalled();
  // The source button precedes the input in native tab order; emulate that browser focus default.
  button.focus();
  expect(window.document.activeElement).toBe(button);
  const enter = pickerKey('Enter', button);
  picker.onKeyDown(enter, window, session);
  expect(enter.preventDefault).not.toHaveBeenCalled();
  // The browser's native Enter default dispatches a keyboard-origin click on the real button.
  button.emit('click', { detail: 0 } as unknown as Partial<Event>);
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
  it('projects exact resolved Action shortcuts while keeping unbound Actions available', async () => {
    const bindings = resolveBindings(
      JSON.stringify({
        'main-normal:<Space>ps': null,
        'main-normal:L': null,
        'main-normal:y': 'nextTab',
        'reader-normal:<Space>ff': null,
      }),
    );
    const context: CommandPaletteContext = {
      mode: 'main',
      bindingMode: 'main-normal',
      actions: ['nextTab', 'openNeoSettings', 'findAllItems'],
      bindings,
      language: 'en',
      execute: () => {},
    };
    const main = createCommandsProvider(context);
    const mainItems = await main.load();
    expect(mainItems.map((item) => item.id).sort()).toEqual(
      ['nextTab', 'openNeoSettings', 'findAllItems'].sort(),
    );
    expect(mainItems.find((item) => item.id === 'nextTab')?.meta).toBe('y');
    const find = mainItems.find((item) => item.id === 'findAllItems');
    if (!find) throw new Error('Expected bound Find Action');
    expect(find.meta).toBe('<Space>ff');
    expect(mainItems.find((item) => item.id === 'openNeoSettings')?.meta).toBe('Unbound');

    const readerItems = await createCommandsProvider({
      ...context,
      mode: 'normal',
      bindingMode: 'reader-normal',
    }).load();
    expect(readerItems.find((item) => item.id === 'nextTab')?.meta).toBe('L');
    expect(readerItems.find((item) => item.id === 'openNeoSettings')?.meta).toBe('<Space>ps');
    expect(readerItems.find((item) => item.id === 'findAllItems')?.meta).toBe('Unbound');
  });

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
      actions: ['findAllItems', 'findAllItems', 'nextTab', 'mainOpenPDF', 'openCommandPalette'],
      language: 'en',
      bindings: {
        'main-normal::': 'openCommandPalette',
        'main-normal:x': 'findAllItems',
        'main-normal:y': 'findAllItems',
        'main-normal:z': 'nextTab',
      },
      execute: (action, count) => {
        actions.push([action, count]);
        if (action === 'findAllItems') void picker.open(window, session, 'tabs');
      },
    };
    const { window, session } = createPickerHarness();
    picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => true,
    );
    await picker.open(window, session, 'commands', commandPickerOptions(context));
    const all = session.picker.filtered.find((item) => item.id === 'findAllItems');
    expect(all?.meta).toBe('x, y');
    expect(all?.search).toContain('x, y');
    expect(session.picker.filtered.filter((item) => item.id === 'findAllItems')).toHaveLength(1);
    expect(session.picker.filtered.some((item) => item.id === 'openCommandPalette')).toBe(false);
    const openPDF = session.picker.filtered.find((item) => item.id === 'mainOpenPDF');
    const provider = session.picker.provider;
    if (!openPDF || !provider) throw new Error('Expected catalog unbound command');
    expect(openPDF.meta).toBe('Unbound');
    const commandInput = session.picker.input;
    picker.onKeyDown(pickerKey('ArrowDown', commandInput), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('ArrowUp', commandInput), window, session);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('ArrowDown', session.picker.results), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('ArrowUp', session.picker.results), window, session);
    expect(session.picker.selected).toBe(0);

    const keyboardIndex = session.picker.filtered.findIndex((item) => item.id === 'findAllItems');
    session.picker.selected = keyboardIndex;
    picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
    await vi.waitFor(() => expect(actions).toEqual([['findAllItems', 0]]));
    await vi.waitFor(() => expect(session.picker.scope).toBe('tabs'));
    expect(session.picker.open).toBe(true);

    picker.close(session);
    await picker.open(window, session, 'commands', commandPickerOptions(context));
    const pointerIndex = session.picker.filtered.findIndex((item) => item.id === 'findAllItems');
    const pointerRow = session.picker.results?.children[pointerIndex] as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
    pointerRow.emit('dblclick');
    await vi.waitFor(() =>
      expect(actions).toEqual([
        ['findAllItems', 0],
        ['findAllItems', 0],
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
      actions: ['findAllItems', 'mainOpenPDF'],
      language: 'en',
      bindings: { 'main-normal:x': 'findAllItems' },
      execute,
    };

    await picker.open(window, session, 'commands', commandPickerOptions(context));
    const openPDF = session.picker.filtered.find((item) => item.id === 'mainOpenPDF');
    const provider = session.picker.provider;
    if (!openPDF || !provider) throw new Error('Expected catalog unbound command');
    const input = session.picker.input as (HTMLInputElement & { emit(type: string): void }) | null;
    if (!input) throw new Error('Expected mounted picker input');
    input.value = 'unbound';
    input.emit('input');
    expect(session.picker.filtered.map((item) => item.id)).toEqual(['mainOpenPDF']);
    input.value = groupLabel(actionGroup('mainOpenPDF'), context.language);
    input.emit('input');
    expect(session.picker.filtered.map((item) => item.id)).toContain('mainOpenPDF');
    input.value = 'main-normal';
    input.emit('input');
    expect(session.picker.filtered.map((item) => item.id).sort()).toEqual(
      ['findAllItems', 'mainOpenPDF'].sort(),
    );
    input.value = 'mainOpenPDF';
    input.emit('input');
    expect(session.picker.filtered.map((item) => item.id)).toEqual(['mainOpenPDF']);

    picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith('mainOpenPDF', 0));
    expect(session.picker.open).toBe(false);
  });

  it('supports localized searches for unbound commands', async () => {
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
    expect(item.meta).toBe('未绑定');
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
        'reader-normal:m': 'findAllItems',
        'reader-normal:v': 'highlightYellow',
      },
      execute: () => {},
    };

    await picker.open(window, session, 'commands', commandPickerOptions(readerContext));
    const readerIds = session.picker.filtered.map((item) => item.id);
    expect(readerIds).toContain('zoomIn');
    expect(readerIds).toContain('findAllItems');
    expect(readerIds).not.toContain('highlightYellow');
    expect(readerIds).not.toContain('cursorDown');
    picker.close(session);

    const mainContext: CommandPaletteContext = {
      mode: 'main',
      bindingMode: 'main-normal',
      actions: MAIN_EXECUTABLE_ACTIONS,
      language: 'en',
      bindings: {
        'main-normal:x': 'findAllItems',
        'main-normal:y': 'zoomIn',
        'main-normal:z': 'toggleMarksExplorer',
      },
      execute: () => {},
    };
    await picker.open(window, session, 'commands', commandPickerOptions(mainContext));
    const mainIds = session.picker.filtered.map((item) => item.id);
    expect(mainIds).toContain('findAllItems');
    expect(mainIds).toContain('switchTab');
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
      actions: ['nextTab'],
      language: 'en',
      bindings: { 'main-normal:x': 'nextTab' },
      execute: () => {},
    };
    const restore = { isConnected: true, focus: vi.fn() } as unknown as HTMLElement;
    const onClose = vi.fn(() => {
      expect(restore.focus).toHaveBeenCalledOnce();
    });
    await picker.open(window, session, 'commands', {
      ...commandPickerOptions(context),
      onClose,
    });
    session.picker.previousElement = restore;
    picker.onKeyDown(pickerKey('Escape', session.picker.input), window, session);
    expect(session.picker.open).toBe(false);
    expect(restore.focus).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    picker.close(session);
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('discards a queued command after close and reopen', async () => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const execute = vi.fn<CommandPaletteContext['execute']>();
    const context: CommandPaletteContext = {
      mode: 'main',
      bindingMode: 'main-normal',
      actions: ['nextTab'],
      language: 'en',
      bindings: { 'main-normal:x': 'nextTab' },
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
      libraryID: 3,
      parentItemID: 10,
      deleted: false,
      dateModified: '2026-09-11 08:00:00',
      isNote: () => true,
      getNote: () => '<p>Current preview body</p>',
      getDisplayTitle: () => 'Current note',
    } as unknown as Zotero.Item;
    const other = {
      id: 2,
      libraryID: 3,
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
      libraryID: parent.libraryID,
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
    expect(session.picker.filtered.map((item) => item.id)).toEqual([current.id]);
    activateSourceButton(picker, window, session);
    await vi.waitFor(() => expect(session.picker.filtered).toHaveLength(2));
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
      libraryID: 1,
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
    expect(session.picker.filtered).toEqual([]);
    activateSourceButton(picker, window, session);
    await vi.waitFor(() =>
      expect(session.picker.filtered.map((item) => item.id)).toEqual([note.id]),
    );
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
    for (const action of ['uiNext', 'uiPreviewDown', 'uiConfirm', 'uiCancel'] as const)
      for (const key of shortcutsForAction(DEFAULT_BINDINGS, 'picker-input', action))
        expect(shortcuts?.textContent).toContain(key);
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

describe('configurable picker contexts', () => {
  it('rebinds execution and discovery while leaving query letters, editing and unrelated events native', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    let bindings: BindingMap = resolveBindings(
      JSON.stringify({
        'picker-input:<Down>': null,
        'picker-input:<C-j>': null,
        'picker-input:<C-n>': null,
        'picker-input:<C-l>': 'uiNext',
        'picker-list:j': null,
        'picker-list:n': 'uiNext',
        'picker-list:<Enter>': null,
        'picker-list:<S-Enter>': null,
        'picker-list:<C-Enter>': 'uiConfirm',
      }),
    );
    const confirm = vi.fn();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => false,
      () => bindings,
    );
    const source = createTagCandidateProvider({
      title: 'Choose tag',
      placeholder: 'Search tags',
      separator: '/',
      loadTags: async () => [{ tag: 'alpha' }, { tag: 'beta' }],
    });
    await picker.open(window, session, 'tags', { source, confirm });
    vi.advanceTimersByTime(30);
    const input = session.picker.input!;
    const oldDown = pickerKey('ArrowDown', input);
    picker.onKeyDown(oldDown, window, session);
    expect(oldDown.preventDefault).not.toHaveBeenCalled();
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('l', input, { ctrl: true }), window, session);
    expect(session.picker.selected).toBe(1);
    expect(session.picker.help?.textContent).toContain('<C-l>');
    expect(session.picker.help?.textContent).not.toContain('<C-j>');
    bindings = {
      ...bindings,
      'picker-input:j': 'uiNext',
      'picker-input:<BS>': 'uiCancel',
      'picker-input:<C-M-l>': 'uiNext',
      'picker-input:<C-Insert>': 'uiCancel',
      'picker-input:<S-Insert>': 'uiFocusList',
    };
    const altGraph = Object.assign(pickerKey('l', input, { ctrl: true }), {
      altKey: true,
      getModifierState: (modifier: string) => modifier === 'AltGraph',
    });
    picker.onKeyDown(altGraph, window, session);
    expect(altGraph.preventDefault).not.toHaveBeenCalled();
    for (const key of ['j', 'Backspace', 'Tab']) {
      const native = pickerKey(key, input);
      picker.onKeyDown(native, window, session);
      expect(native.preventDefault).not.toHaveBeenCalled();
    }
    for (const modifiers of [{ ctrl: true }, { shift: true }]) {
      const native = pickerKey('Insert', input, modifiers);
      picker.onKeyDown(native, window, session);
      expect(native.preventDefault).not.toHaveBeenCalled();
      expect(window.document.activeElement).toBe(input);
    }
    expect(session.picker.open).toBe(true);
    expect(session.picker.selected).toBe(1);
    const unrelated = pickerKey(
      'n',
      window.document.createElementNS('http://www.w3.org/1999/xhtml', 'div'),
    );
    picker.onKeyDown(unrelated, window, session);
    expect(unrelated.preventDefault).not.toHaveBeenCalled();
    session.picker.results!.focus();
    const oldList = pickerKey('j', session.picker.results);
    picker.onKeyDown(oldList, window, session);
    expect(oldList.preventDefault).not.toHaveBeenCalled();
    picker.onKeyDown(pickerKey('k', session.picker.results), window, session);
    picker.onKeyDown(pickerKey('n', session.picker.results), window, session);
    expect(session.picker.selected).toBe(1);
    expect(session.picker.help?.textContent).toContain('<C-Enter>');
    const oldConfirm = pickerKey('Enter', session.picker.results);
    picker.onKeyDown(oldConfirm, window, session);
    expect(oldConfirm.preventDefault).not.toHaveBeenCalled();
    picker.onKeyDown(pickerKey('Enter', session.picker.results, { ctrl: true }), window, session);
    await session.picker.queue;
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ tagName: 'beta' }), false);
    expect(session.picker.open).toBe(false);
  });

  it('cancels exact-prefix waits on focus, IME, close and disposal and rejects retired input events', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session, cleanups } = createPickerHarness();
    const bindings = resolveBindings(
      JSON.stringify({
        'picker-list:a': 'uiNext',
        'picker-list:ab': 'uiConfirm',
        'picker-input:<C-n><C-n>': 'uiConfirm',
      }),
    );
    const confirm = vi.fn();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => false,
      () => bindings,
    );
    const source = createTagCandidateProvider({
      title: 'Tags',
      placeholder: 'Search tags',
      separator: '/',
      loadTags: async () => [{ tag: 'alpha' }, { tag: 'beta' }],
    });
    const open = async (): Promise<void> => {
      await picker.open(window, session, 'tags', { source, confirm });
      vi.advanceTimersByTime(30);
    };
    await open();
    session.picker.results!.focus();
    picker.onKeyDown(pickerKey('a', session.picker.results), window, session);
    session.picker.input!.focus();
    vi.advanceTimersByTime(2000);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('n', session.picker.input, { ctrl: true }), window, session);
    const oldInput = session.picker.input as HTMLInputElement & { emit(type: string): void };
    oldInput.emit('compositionstart');
    vi.advanceTimersByTime(2000);
    expect(session.picker.selected).toBe(0);
    oldInput.emit('compositionend');
    session.picker.results!.focus();
    picker.onKeyDown(pickerKey('a', session.picker.results), window, session);
    picker.close(session);
    await open();
    oldInput.value = 'stale';
    oldInput.emit('input');
    oldInput.emit('focus');
    picker.onKeyDown(pickerKey('Enter', oldInput), window, session);
    vi.advanceTimersByTime(2000);
    expect(session.picker.selected).toBe(0);
    expect(session.picker.filtered).toHaveLength(2);
    expect(confirm).not.toHaveBeenCalled();
    expect(cleanups).toHaveLength(1);
    session.picker.results!.focus();
    picker.onKeyDown(pickerKey('a', session.picker.results), window, session);
    cleanups.forEach((cleanup) => cleanup());
    vi.advanceTimersByTime(2000);
    expect(session.picker.open).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('cancels delayed confirmation when a pointer selects a different candidate', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const bindings = resolveBindings(JSON.stringify({ 'picker-list:<Enter>x': 'uiNext' }));
    const confirm = vi.fn();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => true,
      () => bindings,
    );
    const source = createTagCandidateProvider({
      title: 'Tags',
      placeholder: 'Search tags',
      separator: '/',
      loadTags: async () => [{ tag: 'alpha' }, { tag: 'beta' }],
    });
    await picker.open(window, session, 'tags', { source, confirm, closeBeforeConfirm: true });
    vi.advanceTimersByTime(30);
    session.picker.results!.focus();
    picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
    const row = session.picker.results!.children[1] as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
    row.emit('click');
    expect(session.picker.selected).toBe(1);
    vi.advanceTimersByTime(2000);
    await session.picker.queue;
    expect(confirm).not.toHaveBeenCalled();
    expect(session.picker.selected).toBe(1);
    expect(session.picker.open).toBe(true);
    picker.close(session);
  });

  it('preserves shifted confirmation across an exact-prefix wait and leaves failed semantic confirmation open', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const bindings = resolveBindings(JSON.stringify({ 'picker-list:<S-Enter>x': 'uiNext' }));
    const confirm = vi.fn(async () => {
      throw new Error('domain confirmation failed');
    });
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => false,
      () => bindings,
    );
    const source = createTagCandidateProvider({
      title: 'Tags',
      placeholder: 'Search tags',
      separator: '/',
      loadTags: async () => [{ tag: 'alpha' }],
    });
    await picker.open(window, session, 'tags', { source, confirm });
    vi.advanceTimersByTime(30);
    session.picker.results!.focus();
    picker.onKeyDown(pickerKey('Enter', session.picker.results, { shift: true }), window, session);
    expect(confirm).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    await session.picker.queue;
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ tagName: 'alpha' }), true);
    expect(session.picker.open).toBe(true);
    picker.close(session);
  });
});

describe('picker configurable pane controls', () => {
  it('runs preview, pane, list, search and boundary selection only from the current owned context', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const bindings = resolveBindings(
      JSON.stringify({
        'picker-input:<F1>': 'uiFocusList',
        'picker-list:<F2>': 'uiLast',
        'picker-list:<F3>': 'uiFirst',
        'picker-list:<F4>': 'uiNextPane',
        'picker-list:<F5>': 'uiPreviousPane',
        'picker-input:<F6>': 'uiNextPane',
        'picker-list:/': null,
        'picker-list:<F7>': 'uiSearch',
        'picker-list:<C-d>': null,
        'picker-list:<C-u>': null,
        'picker-list:<F8>': 'uiPreviewDown',
        'picker-list:<F9>': 'uiPreviewUp',
      }),
    );
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => false,
      () => bindings,
    );
    const source = createTagCandidateProvider({
      title: 'Tags',
      placeholder: 'Search tags',
      separator: '/',
      loadTags: async () => [{ tag: 'alpha' }, { tag: 'beta' }],
    });
    await picker.open(window, session, 'tags', { source });
    vi.advanceTimersByTime(30);
    picker.onKeyDown(pickerKey('F1', session.picker.input), window, session);
    expect(window.document.activeElement).toBe(session.picker.results);
    picker.onKeyDown(pickerKey('F2', session.picker.results), window, session);
    expect(session.picker.selected).toBe(1);
    picker.onKeyDown(pickerKey('F3', session.picker.results), window, session);
    expect(session.picker.selected).toBe(0);
    picker.onKeyDown(pickerKey('F4', session.picker.results), window, session);
    expect(window.document.activeElement).toBe(session.picker.preview);
    picker.onKeyDown(pickerKey('F8', session.picker.preview), window, session);
    picker.onKeyDown(pickerKey('F9', session.picker.preview), window, session);
    expect(session.picker.preview!.scrollBy).toHaveBeenNthCalledWith(1, { top: 200 });
    expect(session.picker.preview!.scrollBy).toHaveBeenNthCalledWith(2, { top: -200 });
    const retiredPreview = pickerKey('d', session.picker.preview, { ctrl: true });
    picker.onKeyDown(retiredPreview, window, session);
    expect(retiredPreview.preventDefault).not.toHaveBeenCalled();
    picker.onKeyDown(pickerKey('F5', session.picker.preview), window, session);
    expect(window.document.activeElement).toBe(session.picker.results);
    picker.onKeyDown(pickerKey('F7', session.picker.results), window, session);
    expect(window.document.activeElement).toBe(session.picker.input);
    const wrongContext = pickerKey('F2', session.picker.input);
    picker.onKeyDown(wrongContext, window, session);
    expect(wrongContext.preventDefault).not.toHaveBeenCalled();
    picker.onKeyDown(pickerKey('F6', session.picker.input), window, session);
    expect(window.document.activeElement).toBe(session.picker.results);
    picker.close(session);
  });
});

describe('picker admitted confirmation safety', () => {
  const candidates: PickerItem[] = [
    { id: 'A', title: 'Alpha', search: 'alpha' },
    { id: 'B', title: 'Beta', search: 'beta' },
    { id: 'C', title: 'Gamma', search: 'gamma' },
  ];

  it.each(['keyboard', 'pointer'] as const)(
    'locks %s admission through a held failure, ignores duplicates and permits an intentional retry',
    async (activation) => {
      vi.useFakeTimers();
      vi.stubGlobal('Services', { focus: { focusedWindow: null } });
      const { window, session } = createPickerHarness();
      const diagnostic = vi.fn();
      const picker = new FuzzyPicker(
        { debug: vi.fn(), diagnostic },
        new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
        () => true,
      );
      const save = deferred<void>();
      const started = deferred<void>();
      const mutations: Array<string | number> = [];
      let firstConfirmation = true;
      const confirm = vi.fn(async (item: PickerItem) => {
        if (firstConfirmation) {
          firstConfirmation = false;
          started.resolve();
          await save.promise;
        }
        mutations.push(item.id);
      });
      await picker.open(window, session, 'notes', {
        source: candidateSource(candidates),
        confirm,
      });
      if (activation === 'keyboard')
        picker.onKeyDown(
          pickerKey('Enter', session.picker.results, { shift: true }),
          window,
          session,
        );
      else
        (session.picker.results!.children[0] as EmittingElement).emit('dblclick', {
          shiftKey: true,
        } as unknown as Partial<Event>);
      const admitted = session.picker.queue;
      picker.onKeyDown(pickerKey('ArrowDown', session.picker.results), window, session);
      picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
      (session.picker.results!.children[1] as EmittingElement).emit('dblclick');
      await started.promise;
      expect(confirm).toHaveBeenCalledOnce();
      expect(confirm).toHaveBeenCalledWith(candidates[0], true);
      expect(Reflect.get(session.picker.operationStatus!, 'role')).toBe('status');
      expect(Reflect.get(session.picker.operationStatus!, 'aria-live')).toBe('polite');
      picker.onKeyDown(pickerKey('ArrowDown', session.picker.results), window, session);
      expect(session.picker.previewTitle?.textContent).toBe('Gamma');
      picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
      (session.picker.results!.children[2] as EmittingElement).emit('dblclick');
      expect(session.picker.operationStatus?.textContent).toContain('Alpha');
      save.reject(new Error('native save failed'));
      await admitted;
      expect(confirm).toHaveBeenCalledOnce();
      expect(mutations).toEqual([]);
      expect(session.picker.open).toBe(true);
      expect(session.picker.operationStatus?.hidden).toBe(false);
      expect(session.picker.operationStatus?.textContent).toContain('Alpha');
      expect(session.picker.operationStatus?.textContent).toContain('native save failed');
      expect(session.picker.operationStatus?.textContent).not.toContain('Gamma');
      expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('native save failed'));
      picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
      await session.picker.queue;
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(mutations).toEqual(['C']);
      expect(session.picker.open).toBe(false);
    },
  );

  it('re-resolves a keyboard target by ID and does not confirm a removed candidate', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    const confirm = vi.fn();
    await picker.open(window, session, 'notes', { source: candidateSource(candidates), confirm });
    picker.onKeyDown(pickerKey('Enter', session.picker.input), window, session);
    const admitted = session.picker.queue;
    const input = session.picker.input as HTMLInputElement & EmittingElement;
    input.value = 'beta';
    input.emit('input');
    await admitted;
    expect(confirm).not.toHaveBeenCalled();
    expect(session.picker.open).toBe(true);
    expect(session.picker.operationStatus?.hidden).toBe(false);
    picker.onKeyDown(pickerKey('Enter', input), window, session);
    await session.picker.queue;
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(candidates[1], false);
  });

  it('does not treat Escape or backdrop as rollback but public close releases pending resources', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session, cleanups } = createPickerHarness();
    const releaseTheme = vi.fn();
    session.theme.add = () => releaseTheme;
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    const save = deferred<void>();
    const started = deferred<void>();
    const onClose = vi.fn();
    const confirm = vi.fn(() => {
      started.resolve();
      return save.promise;
    });
    await picker.open(window, session, 'notes', {
      source: candidateSource(candidates),
      confirm,
      onClose,
    });
    const retiredInput = session.picker.input as HTMLInputElement & EmittingElement;
    const overlay = session.picker.overlay as EmittingElement;
    const bindings = session.picker.localBindings!;
    const dispose = vi.spyOn(bindings, 'dispose');
    picker.onKeyDown(pickerKey('Enter', retiredInput), window, session);
    const admitted = session.picker.queue;
    await started.promise;
    picker.onKeyDown(pickerKey('Escape', retiredInput), window, session);
    overlay.emit('mousedown');
    expect(session.picker.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(releaseTheme).not.toHaveBeenCalled();
    // Session teardown uses the public force-close path, even while the host owns an admitted save.
    cleanups[0]!();
    expect(session.picker.open).toBe(false);
    expect(overlay.isConnected).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    expect(releaseTheme).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    picker.close(session);
    retiredInput.value = 'beta';
    retiredInput.emit('input');
    save.resolve();
    await admitted;
    expect(session.picker.items).toEqual([]);
    expect(onClose).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
  });

  it.each(['resolve', 'reject'] as const)(
    'cannot let an old %s completion close or overwrite a reopened operation',
    async (outcome) => {
      vi.useFakeTimers();
      vi.stubGlobal('Services', { focus: { focusedWindow: null } });
      const { window, session } = createPickerHarness();
      const picker = new FuzzyPicker(
        { debug: vi.fn(), diagnostic: vi.fn() },
        new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      );
      const oldSave = deferred<void>();
      const oldStarted = deferred<void>();
      await picker.open(window, session, 'notes', {
        source: candidateSource(candidates),
        confirm: () => {
          oldStarted.resolve();
          return oldSave.promise;
        },
      });
      picker.onKeyDown(pickerKey('Enter', session.picker.input), window, session);
      const oldOperation = session.picker.queue;
      await oldStarted.promise;
      picker.close(session);
      const newSave = deferred<void>();
      const newStarted = deferred<void>();
      const newConfirm = vi.fn(() => {
        newStarted.resolve();
        return newSave.promise;
      });
      await picker.open(window, session, 'notes', {
        source: candidateSource([candidates[1]!]),
        confirm: newConfirm,
      });
      picker.onKeyDown(pickerKey('Enter', session.picker.input), window, session);
      const newOperation = session.picker.queue;
      await newStarted.promise;
      const status = session.picker.operationStatus;
      const message = status?.textContent;
      if (outcome === 'resolve') oldSave.resolve();
      else oldSave.reject(new Error('old failed save'));
      await oldOperation;
      expect(session.picker.open).toBe(true);
      expect(session.picker.operationStatus).toBe(status);
      expect(status?.textContent).toBe(message);
      expect(status?.textContent).toContain('Beta');
      picker.onKeyDown(pickerKey('Enter', session.picker.input), window, session);
      expect(newConfirm).toHaveBeenCalledOnce();
      newSave.resolve();
      await newOperation;
      expect(session.picker.open).toBe(false);
    },
  );
});

describe('picker committed query and explicit sources', () => {
  it.each([false, true])('cancels from the source button after switching=%s', async (switched) => {
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const confirm = vi.fn();
    const onClose = vi.fn();
    const target: PickerItem = { id: 'note-a', title: 'Note A', search: 'note a' };
    const current: PickerProvider = {
      ...candidateSource([target]),
      alternateSource: { label: 'Browse library', provider: () => library },
    };
    const library: PickerProvider = {
      ...candidateSource([target]),
      alternateSource: { label: 'Current item', provider: () => current },
    };
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    await picker.open(window, session, 'notes', { source: current, confirm, onClose });
    if (switched) activateSourceButton(picker, window, session);
    const button = session.picker.sourceButton;
    if (!button) throw new Error('Expected source button');
    button.focus();
    const cancel = pickerKey('Escape', button);
    picker.onKeyDown(cancel, window, session);
    expect(cancel.preventDefault).toHaveBeenCalledOnce();
    expect(session.picker.open).toBe(false);
    expect(onClose).toHaveBeenCalledWith('cancel');
    expect(onClose).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('uses the latest committed query when initial data arrives during IME composition', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    const items: PickerItem[] = [
      { id: 1, title: 'Alpha', search: 'alpha' },
      { id: 2, title: 'Beta', search: 'beta' },
    ];
    const data = deferred<PickerItem[]>();
    const source: PickerProvider = {
      ...candidateSource(items),
      load: () => data.promise,
    };
    const opening = picker.open(window, session, 'notes', { source });
    const input = session.picker.input as HTMLInputElement & EmittingElement;
    input.value = 'beta';
    input.emit('input');
    input.emit('compositionstart');
    input.value = 'alpha';
    input.emit('input', { isComposing: true } as unknown as Partial<Event>);
    data.resolve(items);
    await opening;
    expect(session.picker.filtered.map((item) => item.id)).toEqual([2]);
    expect(input.value).toBe('alpha');
    input.emit('compositionend');
    expect(session.picker.filtered.map((item) => item.id)).toEqual([2]);
    input.emit('input', { isComposing: false } as unknown as Partial<Event>);
    expect(session.picker.filtered.map((item) => item.id)).toEqual([1]);
    picker.close(session);
  });

  it('preserves query and invocation callbacks, fences superseded loads even after switching back', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const diagnostic = vi.fn();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => false,
    );
    const initial = deferred<PickerItem[]>();
    const broader = deferred<PickerItem[]>();
    const refreshed = deferred<PickerItem[]>();
    const target: PickerItem = { id: 'current', title: 'Match Beta', search: 'match beta' };
    const itemLoad = vi
      .fn()
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => refreshed.promise);
    const libraryLoad = vi.fn(() => broader.promise);
    const itemSource: PickerProvider = {
      ...candidateSource([], 'Item notes'),
      load: itemLoad,
      alternateSource: { label: 'Browse library', provider: () => librarySource },
    };
    const librarySource: PickerProvider = {
      ...candidateSource([], 'Library notes'),
      load: libraryLoad,
      alternateSource: { label: 'Current item', provider: () => itemSource },
    };
    const confirm = vi.fn();
    const onClose = vi.fn();
    const opening = picker.open(window, session, 'notes', { source: itemSource, confirm, onClose });
    const input = session.picker.input as HTMLInputElement & EmittingElement;
    input.value = 'match';
    input.emit('input');
    const button = session.picker.sourceButton as HTMLButtonElement & EmittingElement;
    button.emit('click', { detail: 1 } as unknown as Partial<Event>);
    expect(libraryLoad).not.toHaveBeenCalled();
    activateSourceButton(picker, window, session);
    expect(libraryLoad).toHaveBeenCalledOnce();
    expect(session.picker.provider).toBe(librarySource);
    expect(onClose).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(input.value).toBe('match');
    input.value = 'match beta';
    input.emit('input');
    input.emit('compositionstart');
    input.value = 'uncommitted';
    input.emit('input', { isComposing: true } as unknown as Partial<Event>);
    expect(button.disabled).toBe(true);
    button.emit('click', { detail: 0 } as unknown as Partial<Event>);
    expect(itemLoad).toHaveBeenCalledOnce();
    input.emit('compositionend');
    expect(button.disabled).toBe(false);
    activateSourceButton(picker, window, session);
    expect(itemLoad).toHaveBeenCalledTimes(2);
    expect(session.picker.provider).toBe(itemSource);
    refreshed.resolve([target, { id: 'other', title: 'Other', search: 'other' }]);
    await refreshed.promise;
    expect(session.picker.filtered.map((item) => item.id)).toEqual(['current']);
    initial.resolve([{ id: 'stale', title: 'Stale Match Beta', search: 'match beta' }]);
    await opening;
    broader.reject(new Error('superseded library failure'));
    await broader.promise.catch(() => undefined);
    expect(session.picker.filtered.map((item) => item.id)).toEqual(['current']);
    expect(session.picker.operationStatus?.hidden).toBe(true);
    expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('picker load discarded'));
    expect(diagnostic).toHaveBeenCalledWith(
      expect.stringContaining('picker load failure discarded'),
    );
    expect(onClose).not.toHaveBeenCalled();
    picker.onKeyDown(pickerKey('Enter', session.picker.results), window, session);
    await session.picker.queue;
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(target, false);
    expect(onClose).toHaveBeenCalledOnce();
    button.emit('click', { detail: 0 } as unknown as Partial<Event>);
    expect(libraryLoad).toHaveBeenCalledOnce();
  });

  it('confirms a broader-source candidate with the original callback and blocks switching during save', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    let mouseEnabled = true;
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => mouseEnabled,
    );
    const data = deferred<PickerItem[]>();
    const target: PickerItem = {
      id: 'library-note',
      title: 'Broader note',
      search: 'broader note',
    };
    const itemSource: PickerProvider = {
      ...candidateSource([]),
      alternateSource: { label: 'Browse library', provider: () => librarySource },
    };
    const librarySource: PickerProvider = {
      ...candidateSource([]),
      load: () => data.promise,
      alternateSource: { label: 'Current item', provider: () => itemSource },
    };
    const save = deferred<void>();
    const started = deferred<void>();
    const confirm = vi.fn((item: PickerItem, inWindow: boolean) => {
      expect(item).toBe(target);
      expect(inWindow).toBe(true);
      started.resolve();
      return save.promise;
    });
    const onClose = vi.fn();
    await picker.open(window, session, 'notes', { source: itemSource, confirm, onClose });
    const button = session.picker.sourceButton as HTMLButtonElement & EmittingElement;
    button.emit('click', { detail: 1, button: 0 } as unknown as Partial<Event>);
    expect(session.picker.provider).toBe(librarySource);
    data.resolve([target]);
    await data.promise;
    picker.onKeyDown(pickerKey('Enter', session.picker.results, { shift: true }), window, session);
    const operation = session.picker.queue;
    await started.promise;
    expect(button.disabled).toBe(true);
    mouseEnabled = false;
    button.emit('click', { detail: 0 } as unknown as Partial<Event>);
    expect(session.picker.provider).toBe(librarySource);
    expect(onClose).not.toHaveBeenCalled();
    save.reject(new Error('write failed'));
    await operation;
    expect(session.picker.open).toBe(true);
    expect(button.disabled).toBe(false);
    expect(session.picker.operationStatus?.textContent).toContain('write failed');
    expect(confirm).toHaveBeenCalledOnce();
    picker.close(session);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('reports a current load failure accessibly without retrying or closing the invocation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const diagnostic = vi.fn();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    const data = deferred<PickerItem[]>();
    const load = vi.fn(() => data.promise);
    const source = { ...candidateSource([]), loadingText: 'Loading notes…', load };
    const onClose = vi.fn();
    const opening = picker.open(window, session, 'notes', { source, onClose });
    data.reject(new Error('library unavailable'));
    await opening;
    expect(session.picker.open).toBe(true);
    expect(session.picker.operationStatus?.hidden).toBe(false);
    expect(session.picker.operationStatus?.textContent).toContain('library unavailable');
    expect(Reflect.get(session.picker.operationStatus!, 'role')).toBe('status');
    expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('library unavailable'));
    expect(load).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    picker.close(session);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps ordinary ranking and the 100-candidate cap after an explicit switch', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    );
    const items = Array.from({ length: 120 }, (_, index) => ({
      id: index,
      title: `A long beta ${index}`,
      search: `a long beta ${index}`,
    }));
    const data = deferred<PickerItem[]>();
    const library = { ...candidateSource(items), load: () => data.promise };
    const source = {
      ...candidateSource([]),
      alternateSource: { label: 'Browse library', provider: () => library },
    };
    await picker.open(window, session, 'notes', { source });
    const input = session.picker.input as HTMLInputElement & EmittingElement;
    input.value = 'beta';
    input.emit('input');
    activateSourceButton(picker, window, session);
    data.resolve([...items, { id: 999, title: 'Beta', search: 'beta' }]);
    await data.promise;
    expect(session.picker.filtered).toHaveLength(100);
    expect(session.picker.filtered[0]?.id).toBe(999);
    expect(session.picker.results?.children).toHaveLength(100);
    expect(session.picker.sourceButton?.hidden).toBe(true);
    picker.close(session);
  });
});

describe('picker owner boundaries', () => {
  it('decorates only real rows and preserves boundaries through navigation and pointer selection', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Services', { focus: { focusedWindow: null } });
    const { window, session } = createPickerHarness();
    const picker = new FuzzyPicker(
      { debug: vi.fn(), diagnostic: vi.fn() },
      new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
      () => true,
    );
    const items: PickerItem[] = [
      { id: 1, title: 'One', search: 'one', group: '1:10' },
      { id: 2, title: 'Two', search: 'two', group: '1:10' },
      { id: 3, title: 'Three', search: 'three', group: '1:20' },
      { id: 4, title: 'Four', search: 'four' },
      { id: 5, title: 'Five', search: 'five', group: '1:30' },
      { id: 6, title: 'Six', search: 'six', group: '2:30' },
    ];
    const confirm = vi.fn();
    await picker.open(window, session, 'notes', { source: candidateSource(items), confirm });
    const rows = Array.from(session.picker.results!.children) as EmittingElement[];
    expect(rows).toHaveLength(items.length);
    expect(rows.map((row) => row.dataset.zvPickerIndex)).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(rows.map((row) => row.textContent)).toEqual(items.map((item) => item.title));
    expect(rows.map((row) => row.style.borderTop !== '0')).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
    picker.onKeyDown(pickerKey('ArrowDown', session.picker.results), window, session);
    picker.onKeyDown(pickerKey('ArrowDown', session.picker.results), window, session);
    expect(session.picker.selected).toBe(2);
    expect(session.picker.previewTitle?.textContent).toBe('Three');
    const boundary = session.picker.results!.children[2] as EmittingElement;
    const border = boundary.style.borderTop;
    (session.picker.results!.children[4] as EmittingElement).emit('click');
    expect(session.picker.selected).toBe(4);
    expect(boundary.style.borderTop).toBe(border);
    expect(session.picker.results?.children).toHaveLength(items.length);
    picker.onKeyDown(pickerKey('ArrowDown', session.picker.results), window, session);
    expect(session.picker.selected).toBe(5);
    expect(session.picker.previewTitle?.textContent).toBe('Six');
    (session.picker.results!.children[5] as EmittingElement).emit('dblclick');
    await session.picker.queue;
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(items[5], false);
  });
});
