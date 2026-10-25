import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { readerMainWindow, type ReaderRuntime } from '../../src/toolkit/reader';

function reader(window: unknown): ReaderRuntime {
  return { _window: window } as unknown as ReaderRuntime;
}

function mainWindow() {
  return {
    closed: false,
    location: { href: 'chrome://zotero/content/zoteroPane.xhtml' },
  } as unknown as MainWindow;
}

afterEach(() => vi.unstubAllGlobals());

describe('Reader library-window ownership', () => {
  it('retains the actual tab owner without substituting another Main window', () => {
    vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
    const owner = mainWindow();
    Reflect.set(owner, 'opener', mainWindow());
    expect(readerMainWindow(reader(owner))).toBe(owner);
  });

  it('routes a standalone Reader to its own opener and rejects a closed opener', () => {
    vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
    const owner = mainWindow();
    const standalone: {
      closed: boolean;
      location: { href: string };
      opener: MainWindow | null;
    } = {
      closed: false,
      location: { href: 'chrome://zotero/content/reader.xhtml' },
      opener: owner,
    };
    expect(readerMainWindow(reader(standalone))).toBe(owner);
    Reflect.set(owner, 'closed', true);
    expect(readerMainWindow(reader(standalone))).toBeUndefined();
    standalone.opener = null;
    expect(readerMainWindow(reader(standalone))).toBeUndefined();
  });

  it('does not dereference a destroyed Reader window', () => {
    const dead = {
      get location() {
        throw new Error('Destroyed window must not be read');
      },
    };
    vi.stubGlobal('Components', { utils: { isDeadWrapper: (value: unknown) => value === dead } });
    expect(readerMainWindow(reader(dead))).toBeUndefined();
    expect(readerMainWindow(reader(undefined))).toBeUndefined();
  });
});
