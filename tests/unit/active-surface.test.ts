import { afterEach, describe, expect, it } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { resolveActiveSurface } from '../../src/main/active-surface';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function mainWindow(
  options: {
    tabID?: string;
    tabType?: string;
    contextNote?: boolean;
  } = {},
): MainWindow {
  const activeElement = {} as Element;
  const tabID = options.tabID ?? 'zotero-pane';
  const window = {
    document: { activeElement },
    Zotero_Tabs: {
      selectedID: tabID,
      getTabInfo: () => (options.tabType ? { type: options.tabType } : undefined),
    },
    ZoteroContextPane: options.contextNote
      ? {
          activeEditor: {
            item: { id: 7 },
            contains: (node: unknown) => node === activeElement,
          },
        }
      : undefined,
  };
  return window as unknown as MainWindow;
}

describe('active Surface resolution', () => {
  it('derives Main from the Zotero library host state', () => {
    Reflect.set(globalThis, 'Zotero', { Reader: { getByTabID: () => null } });

    expect(resolveActiveSurface(mainWindow())).toEqual({ kind: 'main' });
  });

  it('derives Reader from the selected Zotero Reader tab', () => {
    Reflect.set(globalThis, 'Zotero', {
      Reader: { getByTabID: (tabID: string) => (tabID === 'reader-tab' ? { itemID: 42 } : null) },
    });

    expect(resolveActiveSurface(mainWindow({ tabID: 'reader-tab' }))).toEqual({
      kind: 'reader',
      tabID: 'reader-tab',
    });
  });

  it('derives Note from a standalone Note tab', () => {
    Reflect.set(globalThis, 'Zotero', { Reader: { getByTabID: () => null } });

    expect(resolveActiveSurface(mainWindow({ tabID: 'note-tab', tabType: 'note' }))).toEqual({
      kind: 'note',
    });
  });

  it('prefers the focused context-pane Note over the selected Reader tab', () => {
    Reflect.set(globalThis, 'Zotero', {
      Reader: { getByTabID: () => ({ itemID: 42 }) },
    });

    expect(resolveActiveSurface(mainWindow({ tabID: 'reader-tab', contextNote: true }))).toEqual({
      kind: 'note',
    });
  });

  it('tracks Main -> Reader -> Main transitions directly from changing Zotero host state', () => {
    Reflect.set(globalThis, 'Zotero', {
      Reader: { getByTabID: (tabID: string) => (tabID === 'reader-tab' ? { itemID: 42 } : null) },
    });
    const window = mainWindow();
    const tabs = (window as unknown as { Zotero_Tabs: { selectedID: string } }).Zotero_Tabs;

    expect(resolveActiveSurface(window)).toEqual({ kind: 'main' });
    tabs.selectedID = 'reader-tab';
    expect(resolveActiveSurface(window)).toEqual({ kind: 'reader', tabID: 'reader-tab' });
    tabs.selectedID = 'zotero-pane';
    expect(resolveActiveSurface(window)).toEqual({ kind: 'main' });
  });
});
