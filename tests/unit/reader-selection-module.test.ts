import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import {
  createReaderSelectionModule,
  type ReaderSelectionModulePorts,
} from '../../src/modules/reader-selection';
import type { PdfWindow, ReaderMode } from '../../src/reader/types';
import type { ReaderRuntime } from '../fixtures/reader-native-types';

beforeEach(() => {
  vi.stubGlobal('Components', {
    utils: { isDeadWrapper: () => false, cloneInto: <T>(value: T): T => value },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function selectionModule() {
  let mode: ReaderMode = 'visual';
  let current = true;
  const copied: string[] = [];
  const selection = {
    isCollapsed: false,
    rangeCount: 0,
    toString: () => 'Cafe\u0301\n selected',
    removeAllRanges: vi.fn(),
  };
  const window = {
    document: {},
    getSelection: () => selection,
    focus: vi.fn(),
  } as unknown as PdfWindow;
  const input = { value: 'old query', dispatchEvent: vi.fn() };
  const findState = { primaryViewFindState: { popupOpen: false, query: 'old query' } };
  const openSearch = vi.fn(() => {
    findState.primaryViewFindState = { ...findState.primaryViewFindState, popupOpen: true };
  });
  const outer = {
    document: { querySelector: () => input },
    Event: class {
      constructor(readonly type: string) {}
    },
  } as unknown as Window;
  const reader = {
    itemID: 77,
    _iframeWindow: outer,
    _internalReader: {
      _primaryView: { _iframeWindow: window },
      _state: findState,
      toggleFindPopup: openSearch,
    },
  } as unknown as ReaderRuntime;
  const host = new ModuleHost({ debug: vi.fn(), diagnostic: vi.fn() }, () => true);
  const ports: ReaderSelectionModulePorts = {
    reader,
    activeWindow: () => window,
    isViewCurrent: () => current,
    capturePresentation: () => () => current,
    captureView: () => () => current,
    mode: () => mode,
    setMode: (next) => {
      mode = next;
    },
    enabled: () => true,
    invalidateNativeSelection: vi.fn(),
    noteOwner: vi.fn(),
    clearOwner: vi.fn(),
    updateIndicator: vi.fn(),
    scrollContainer: () => ({ clientHeight: 600 }) as HTMLElement,
    scrollBy: vi.fn(),
    copyText: (text) => copied.push(text),
    themeRoot: () => vi.fn(),
    language: () => 'en',
    pluginID: () => null,
    contributedActions: () => [],
    registeredActions: () => [],
    showStatus: vi.fn(),
    debug: vi.fn(),
  };
  const module = createReaderSelectionModule(host, ports);
  return {
    module,
    host,
    window,
    copied,
    selection,
    input,
    openSearch,
    findState,
    mode: () => mode,
    retireView: () => {
      current = false;
    },
  };
}

describe('Reader selection module isolation', () => {
  it('keeps a DOM-free selection snapshot but stops reading or copying after retirement', () => {
    const fixture = selectionModule();
    const snapshot = fixture.module.context();
    expect(snapshot).toEqual({
      text: 'Café selected',
      itemID: 77,
      pageLabel: null,
      position: null,
    });
    fixture.host.dispose();
    expect(fixture.module.context()).toBeNull();
    expect(fixture.module.executeAction('copySelection', {} as PdfWindow)).toBe(false);
    expect(fixture.copied).toEqual([]);
    expect(snapshot?.text).toBe('Café selected');
  });

  it('copies canonical text and leaves Select without a navigation module', () => {
    const fixture = selectionModule();
    expect(fixture.module.executeAction('copySelection', fixture.window)).toBe(true);
    expect(fixture.copied).toEqual(['Café selected']);
    expect(fixture.mode()).toBe('normal');
    expect(fixture.selection.removeAllRanges).toHaveBeenCalledOnce();
    fixture.host.dispose();
  });

  it.each(['view', 'module'] as const)(
    'does not overwrite native Find after %s retirement',
    (owner) => {
      vi.useFakeTimers();
      const fixture = selectionModule();
      fixture.module.executeAction('searchSelection', fixture.window);
      expect(fixture.openSearch).toHaveBeenCalledWith({ primary: true, open: true });
      if (owner === 'view') fixture.retireView();
      else fixture.host.dispose();
      vi.advanceTimersByTime(200);
      expect(fixture.input.value).toBe('old query');
      expect(fixture.input.dispatchEvent).not.toHaveBeenCalled();
      fixture.host.dispose();
    },
  );

  it('puts the selected text into native Find after its opening delay', () => {
    vi.useFakeTimers();
    const fixture = selectionModule();
    fixture.module.executeAction('searchSelection', fixture.window);
    vi.advanceTimersByTime(200);
    expect(fixture.input.value).toBe('Café selected');
    expect(fixture.input.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'input' }),
    );
    fixture.host.dispose();
  });
});
