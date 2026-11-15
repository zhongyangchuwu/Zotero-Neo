import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import {
  createReaderSelectionModule,
  type ReaderSelectionModulePorts,
} from '../../src/modules/reader-selection';
import type { PdfWindow, ReaderMode } from '../../src/reader/types';
import type { ReaderRuntime } from '../fixtures/reader-native-types';
import { LOCAL_RULES_KEY, LocalRuleConfigurationError } from '../../src/document-analysis/settings';

const documents = vi.hoisted(() => ({ cache: vi.fn(), native: vi.fn() }));
vi.mock('../../src/reader/document-cache', () => ({
  readReaderDocumentCache: documents.cache,
  readReaderDocument: async () => null,
  readNativeReaderDocument: documents.native,
}));

beforeEach(() => {
  documents.cache.mockReset();
  documents.native.mockReset().mockResolvedValue(null);
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
    document: { getElementById: () => null, querySelector: () => input },
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
  const preferenceListeners = new Map<string, Set<() => void>>();
  const ports: ReaderSelectionModulePorts = {
    reader,
    preferences: {
      get: (_key: string, fallback: unknown) => fallback,
      observe: (key: string, listener: () => void) => {
        const listeners = preferenceListeners.get(key) ?? new Set<() => void>();
        listeners.add(listener);
        preferenceListeners.set(key, listeners);
        return () => {
          listeners.delete(listener);
        };
      },
    } as ReaderSelectionModulePorts['preferences'],
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
    contributedActions: () => [],
    registeredActions: () => [],
    showStatus: vi.fn(),
    debug: vi.fn(),
  };
  const module = createReaderSelectionModule(host, ports);
  return {
    module,
    host,
    preferenceListeners,
    ports,
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
  it('reports invalid profile configuration instead of silently using native body geometry', async () => {
    vi.useFakeTimers();
    const fixture = selectionModule();
    fixture.ports.setMode('normal');
    documents.cache.mockRejectedValueOnce(
      new LocalRuleConfigurationError('Invalid local rule profile'),
    );
    fixture.module.executeAction('toggleBodySelection', fixture.window);
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.ports.debug).toHaveBeenCalledWith(
      expect.stringContaining('Invalid local rule profile'),
    );
    expect(documents.native).not.toHaveBeenCalled();
    expect(fixture.ports.showStatus).toHaveBeenCalledTimes(2);
    fixture.host.dispose();
  });

  it('retires pending body selection on a profile edit and releases its observer with the module', async () => {
    vi.useFakeTimers();
    const fixture = selectionModule();
    fixture.ports.setMode('normal');
    const gate = Promise.withResolvers<unknown>();
    documents.cache.mockReturnValueOnce(gate.promise);
    fixture.module.executeAction('toggleBodySelection', fixture.window);
    expect(documents.cache).toHaveBeenCalledOnce();
    expect(fixture.ports.showStatus).toHaveBeenCalledOnce();
    for (const listener of fixture.preferenceListeners.get(LOCAL_RULES_KEY) ?? []) listener();
    const notices = vi.mocked(fixture.ports.showStatus).mock.calls.length;
    gate.resolve({
      parsed: { regions: [] },
      isCurrent: async () => true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.ports.updateIndicator).toHaveBeenCalled();
    expect(vi.mocked(fixture.ports.showStatus).mock.calls).toHaveLength(notices);
    fixture.host.dispose();
    expect(
      [...fixture.preferenceListeners.values()].every((listeners) => listeners.size === 0),
    ).toBe(true);
  });

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
