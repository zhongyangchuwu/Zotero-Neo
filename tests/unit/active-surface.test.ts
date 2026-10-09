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
          context: {
            activeEditor: {
              item: { id: 7 },
              contains: (node: unknown) => node === activeElement,
            },
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

  it('resolves Main before context initialization and focused Note after the native context is published', () => {
    Reflect.set(globalThis, 'Zotero', { Reader: { getByTabID: () => null } });
    const window = mainWindow();
    const active = window.document.activeElement;
    const pane = {
      get activeEditor(): never {
        throw new TypeError('native context is not initialized');
      },
    };
    Reflect.set(window, 'ZoteroContextPane', pane);
    expect(resolveActiveSurface(window)).toEqual({ kind: 'main' });
    const context = {
      activeEditor: { item: { id: 7 }, contains: (node: unknown) => node === active },
    };
    Reflect.set(pane, 'context', context);
    expect(resolveActiveSurface(window)).toEqual({ kind: 'note' });
    Reflect.set(context, 'activeEditor', undefined);
    expect(resolveActiveSurface(window)).toEqual({ kind: 'main' });
  });

  it('keeps an unexpected live context getter failure observable', () => {
    const window = mainWindow();
    Reflect.set(window, 'ZoteroContextPane', {
      context: {
        get activeEditor(): never {
          throw new Error('live context editor failed');
        },
      },
    });
    expect(() => resolveActiveSurface(window)).toThrow('live context editor failed');
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
