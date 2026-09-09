import { describe, expect, it, vi } from 'vitest';

import type { MainWindow, MainWindowControllerDependencies } from '../../src/core/contracts';
import { createMainWindowController } from '../../src/main/controller';
import {
  MainNavigation,
  selectedCollection,
  selectedCollectionID,
  type TreeView,
} from '../../src/main/navigation';
import type { MainWindowSession } from '../../src/main/session';

const logger = { debug: () => {}, diagnostic: () => {} };

describe('current Zotero collection APIs', () => {
  it('uses plural collection selection methods for object and ID lookup', () => {
    const collection = { id: 42 } as Zotero.Collection;
    const view = {
      getSelectedCollections: (idOnly?: boolean) => (idOnly ? [42] : [collection]),
    } as TreeView;

    expect(selectedCollection(view)).toBe(collection);
    expect(selectedCollectionID(view)).toBe(42);
  });

  it('navigates a collection tree whose React tree object has no contains method', () => {
    let selected = 2;
    const active = { id: 'collection-tree-row-2' } as Element;
    const view: TreeView = {
      tree: { focus: () => {} },
      domEl: { contains: (node: unknown) => node === active } as HTMLElement,
      rowCount: 6,
      selection: {
        count: 1,
        focused: selected,
        select: (index) => {
          selected = index;
        },
      },
      ensureRowIsVisible: () => {},
    };
    const window = {
      document: {
        activeElement: active,
        getElementById: () => null,
        querySelector: () => null,
      },
      ZoteroPane: { collectionsView: view },
    } as unknown as MainWindow;
    const session = { activePanel: 'items' } as MainWindowSession;
    const navigation = new MainNavigation(logger, () => {});

    navigation.navigate(window, session, 1, 1);

    expect(selected).toBe(3);
    expect(session.activePanel).toBe('collections');
  });
});

describe('repeated tab switching', () => {
  it('applies every rapid tab-switch command instead of time-deduplicating it', () => {
    let selectedIndex = 0;
    const status = {
      style: { cssText: '', display: '', background: '' },
      remove: () => {},
    };
    const document = {
      body: { append: () => {} },
      documentElement: { append: () => {} },
      createElementNS: () => status,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    let timer = 0;
    const window = {
      document,
      Zotero_Tabs: {
        selectNext: () => {
          selectedIndex += 1;
        },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      setInterval: () => ++timer,
      clearInterval: () => {},
      setTimeout: () => ++timer,
      clearTimeout: () => {},
    } as unknown as MainWindow;
    const dependencies = {
      preferences: {
        has: () => false,
        get: (key: string, fallback: boolean | number | string) =>
          key === 'noteEditor.enabled' ? false : fallback,
        set: () => {},
      },
      logger,
      reader: {
        start: () => {},
        shutdown: () => {},
        rescan: () => {},
        forwardKey: () => {},
      },
    } as MainWindowControllerDependencies;
    const controller = createMainWindowController(dependencies);
    controller.addWindow(window);

    controller.executeFromReader('mainNextTab', 1);
    controller.executeFromReader('mainNextTab', 1);
    controller.shutdown();

    expect(selectedIndex).toBe(2);
  });
});

describe('collection navigation repeat pacing', () => {
  it('moves one row at a time while dropping only over-frequent auto-repeat events', () => {
    let keydown: EventListener | undefined;
    const selectedRows: number[] = [];
    const selection = {
      count: 1,
      focused: 0,
      select(index: number) {
        this.focused = index;
        selectedRows.push(index);
      },
    };
    const active = {
      id: 'collection-tree-row-0',
      localName: 'div',
      shadowRoot: null,
    } as unknown as Element;
    const collectionView: TreeView = {
      tree: { focus: () => {} },
      domEl: { contains: (node: unknown) => node === active } as HTMLElement,
      rowCount: 20,
      selection,
      ensureRowIsVisible: () => {},
    };
    const status = {
      style: { cssText: '', display: '', background: '' },
      remove: () => {},
    };
    const document = {
      activeElement: active,
      body: { append: () => {} },
      documentElement: { append: () => {} },
      createElementNS: () => status,
      getElementById: () => null,
      querySelector: () => null,
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'keydown') keydown = listener;
      },
      removeEventListener: () => {},
    };
    let timer = 0;
    const window = {
      document,
      ZoteroPane: { collectionsView: collectionView },
      addEventListener: () => {},
      removeEventListener: () => {},
      setInterval: () => ++timer,
      clearInterval: () => {},
      setTimeout: () => ++timer,
      clearTimeout: () => {},
    } as unknown as MainWindow;
    const dependencies = {
      preferences: {
        has: () => false,
        get: (key: string, fallback: boolean | number | string) =>
          key === 'noteEditor.enabled' ? false : fallback,
        set: () => {},
      },
      logger,
      reader: {
        start: () => {},
        shutdown: () => {},
        rescan: () => {},
        forwardKey: () => {},
      },
    } as MainWindowControllerDependencies;
    const controller = createMainWindowController(dependencies);
    controller.addWindow(window);
    const now = vi.spyOn(Date, 'now');
    const press = (timestamp: number, repeat: boolean): void => {
      now.mockReturnValue(timestamp);
      keydown?.({
        key: 'j',
        repeat,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as KeyboardEvent);
    };

    press(0, false);
    press(10, true);
    press(30, true);
    press(85, true);
    press(100, true);
    press(170, true);
    controller.shutdown();

    expect(selectedRows).toEqual([1, 2, 3]);
  });
});
