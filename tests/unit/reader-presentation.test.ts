import { describe, expect, it } from 'vitest';
import { leaseReaderPresentation } from '../../src/toolkit/reader/presentation';
import { readerPresentationViews } from '../../src/toolkit/reader/presentation';
import type { ReaderRuntime } from '../../src/toolkit/reader/contracts';
import { computeSelectionPosition } from '../../src/toolkit/reader/selection-geometry';
import { ReaderNavigationHost } from '../../src/toolkit/reader/navigation';
import { vi } from 'vitest';

describe('Reading Mode source selection', () => {
  it('serializes rapid toggle intents through native view initialization before teardown', async () => {
    const first = Promise.withResolvers<void>(),
      initialized = Promise.withResolvers<void>(),
      second = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>(),
      enabled = Promise.withResolvers<void>(),
      disabling = Promise.withResolvers<void>();
    const window = {} as Window,
      focus = vi.fn(),
      syncViews = vi.fn();
    const overlay = { _iframeWindow: {} as Window, initializedPromise: initialized.promise };
    const internal = {
      _primaryView: { _iframeWindow: window, focus },
      _primarySDTView: undefined as typeof overlay | undefined,
      _setReadingMode: async (_primary: boolean, _enabled: boolean) => {},
    };
    const setReadingMode = vi.fn(async (_primary: boolean, next: boolean) => {
      if (next) {
        started.resolve();
        await first.promise;
        internal._primarySDTView = overlay;
        enabled.resolve();
      } else {
        disabling.resolve();
        await second.promise;
        internal._primarySDTView = undefined;
      }
    });
    internal._setReadingMode = setReadingMode;
    const reader = { _internalReader: internal } as unknown as ReaderRuntime;
    const host = new ReaderNavigationHost({
      reader,
      activePdfWindow: () => window,
      setActivePdfWindow: vi.fn(),
      syncViews,
      scrollBoundary: vi.fn(),
      unavailable: vi.fn(),
      debug: vi.fn(),
    });
    const on = host.toggleReadingMode(window),
      off = host.toggleReadingMode(window);
    await started.promise;
    expect(setReadingMode.mock.calls.map((call) => call[1])).toEqual([true]);
    first.resolve();
    await enabled.promise;
    expect(setReadingMode.mock.calls.map((call) => call[1])).toEqual([true]);
    initialized.resolve();
    await disabling.promise;
    expect(setReadingMode.mock.calls.map((call) => call[1])).toEqual([true, false]);
    expect(focus).not.toHaveBeenCalled();
    second.resolve();
    await Promise.all([on, off]);
    expect(syncViews).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to a hidden PDF during an incomplete Reading Mode transition', () => {
    const reader = {
      _internalReader: { _primaryView: {}, _state: { primaryReadingModeEnabled: true } },
    } as unknown as ReaderRuntime;
    expect(readerPresentationViews(reader)).toEqual([]);
  });
  it('uses native PDF annotation mapping only while its exact presentation is current', () => {
    const range = {} as Range;
    const window = {
      document: { getElementById: () => ({ id: 'sdt-content' }) },
    } as unknown as Window;
    let current = true;
    const release = leaseReaderPresentation(
      window,
      {
        getAnnotationFromRange: (received) => {
          expect(received).toBe(range);
          return {
            position: { pageIndex: 2, rects: [[10, 20, 30, 40]] },
            sortIndex: 'native-sort',
            pageLabel: 'iii',
          };
        },
      },
      () => current,
    );
    const selection = { rangeCount: 1, getRangeAt: () => range } as unknown as Selection;
    expect(computeSelectionPosition(window, selection)).toEqual({
      position: '{"pageIndex":2,"rects":[[10,20,30,40]]}',
      sortIndex: 'native-sort',
      pageLabel: 'iii',
    });
    current = false;
    expect(computeSelectionPosition(window, selection)).toBeNull();
    release();
  });

  it('an old cleanup cannot remove a successor presentation capability', () => {
    const window = {
      document: { getElementById: () => ({ id: 'sdt-content' }) },
    } as unknown as Window;
    const releaseOld = leaseReaderPresentation(window, {}, () => true);
    const releaseNew = leaseReaderPresentation(
      window,
      {
        getAnnotationFromRange: () => ({
          position: { pageIndex: 0, rects: [[1, 2, 3, 4]] },
          sortIndex: 'new',
          pageLabel: '1',
        }),
      },
      () => true,
    );
    releaseOld();
    expect(
      computeSelectionPosition(window, {
        rangeCount: 1,
        getRangeAt: () => ({}),
      } as unknown as Selection)?.sortIndex,
    ).toBe('new');
    releaseNew();
  });
});
