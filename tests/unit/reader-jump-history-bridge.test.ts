import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReaderJumpLocation } from '../../src/core/contracts';
import { ReaderJumpHostAdapter } from '../../src/reader/jump-host';
import { ReaderJumpHistoryBridge } from '../../src/reader/jump-history-bridge';
import type {
  ReaderPdfHistoryLocationRuntime,
  ReaderPdfHistoryRuntime,
  ReaderRuntime,
  ReaderViewRuntime,
} from '../../src/reader/types';

interface TestHistory extends ReaderPdfHistoryRuntime {
  _currentLocation?: ReaderPdfHistoryLocationRuntime;
}

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

function location(pageIndex: number, top: number, left: number): ReaderPdfHistoryLocationRuntime {
  return { dest: [pageIndex, { name: 'XYZ' }, left, top, null] };
}

function harness() {
  Reflect.set(globalThis, 'Zotero', {
    Items: {
      get: (id: number) => ({ id, libraryID: 4, isAttachment: () => true }),
    },
  });
  const primaryHistory: TestHistory = {
    _currentLocation: location(0, 10, 20),
    save(dest) {
      this._currentLocation = dest;
      return 'native-save';
    },
  };
  const secondaryHistory: TestHistory = {
    _currentLocation: location(2, 30, 40),
    save(dest) {
      this._currentLocation = dest;
      return 'native-save';
    },
  };
  const primaryWindow = {} as Window;
  const secondaryWindow = {} as Window;
  const primary: ReaderViewRuntime = { _history: primaryHistory, _iframeWindow: primaryWindow };
  const secondary: ReaderViewRuntime = {
    _history: secondaryHistory,
    _iframeWindow: secondaryWindow,
  };
  const reader = {
    tabID: 'reader-tab',
    itemID: 12,
    _internalReader: { _primaryView: primary, _secondaryView: secondary },
  } as unknown as ReaderRuntime;
  const host = new ReaderJumpHostAdapter();
  const transitions: Array<{ source: ReaderJumpLocation; destination: ReaderJumpLocation }> = [];
  const bridge = new ReaderJumpHistoryBridge({
    reader,
    host,
    record: (source, destination) => transitions.push({ source, destination }),
    debug: vi.fn(),
  });
  return {
    bridge,
    host,
    reader,
    primary,
    secondary,
    primaryHistory,
    secondaryHistory,
    primaryWindow,
    transitions,
  };
}

describe('ReaderJumpHistoryBridge', () => {
  it('captures the pre-save source for coalesced hard saves and preserves native call behavior', () => {
    const h = harness();
    const receiver = { marker: 'native receiver' } as ReaderPdfHistoryRuntime;
    const args: [ReaderPdfHistoryLocationRuntime, boolean] = [location(4, 50, 60), false];
    const nativeSave = vi.fn(function (this: TestHistory, dest: ReaderPdfHistoryLocationRuntime) {
      this._currentLocation = dest;
      return 'native-result';
    });
    h.primaryHistory.save = nativeSave;
    h.bridge.sync();
    h.bridge.sync();

    const result = h.primaryHistory.save?.apply(receiver, args);

    expect(result).toBe('native-result');
    expect(nativeSave).toHaveBeenCalledTimes(1);
    expect(nativeSave.mock.contexts[0]).toBe(receiver);
    expect(nativeSave.mock.calls[0]).toEqual(args);
    expect(h.transitions).toEqual([
      {
        source: {
          kind: 'reader',
          tabID: 'reader-tab',
          libraryID: 4,
          itemID: 12,
          position: { pageIndex: 0, top: 10, left: 20, primary: true },
        },
        destination: {
          kind: 'reader',
          tabID: 'reader-tab',
          libraryID: 4,
          itemID: 12,
          position: { pageIndex: 4, top: 50, left: 60, primary: true },
        },
      },
    ]);
  });

  it('keeps transient saves unrecorded and tags secondary-view transitions correctly', () => {
    const h = harness();
    const secondarySave = vi.fn(function (
      this: TestHistory,
      dest: ReaderPdfHistoryLocationRuntime,
    ) {
      this._currentLocation = dest;
      return 23;
    });
    h.secondaryHistory.save = secondarySave;
    h.bridge.sync();

    expect(h.primaryHistory.save?.(location(1, 15, 25), true)).toBe('native-save');
    expect(h.secondaryHistory.save?.call(h.secondaryHistory, location(3, 35, 45))).toBe(23);

    expect(secondarySave).toHaveBeenCalledTimes(1);
    expect(h.transitions).toHaveLength(1);
    expect(h.transitions[0]).toEqual({
      source: {
        kind: 'reader',
        tabID: 'reader-tab',
        libraryID: 4,
        itemID: 12,
        position: { pageIndex: 2, top: 30, left: 40, primary: false },
      },
      destination: {
        kind: 'reader',
        tabID: 'reader-tab',
        libraryID: 4,
        itemID: 12,
        position: { pageIndex: 3, top: 35, left: 45, primary: false },
      },
    });
  });

  it('uses the actual transient departure even when native history discards that location', () => {
    const h = harness();
    h.primaryHistory.save = function (this: TestHistory, destination, transient) {
      // Zotero can discard a transient equal to its nearest native back point.
      if (!transient) this._currentLocation = destination;
    };
    h.bridge.sync();

    h.primaryHistory.save(location(1, 25, 35), true);
    h.primaryHistory.save(location(4, 50, 60));

    expect(h.transitions).toEqual([
      {
        source: {
          kind: 'reader',
          tabID: 'reader-tab',
          libraryID: 4,
          itemID: 12,
          position: { pageIndex: 1, top: 25, left: 35, primary: true },
        },
        destination: {
          kind: 'reader',
          tabID: 'reader-tab',
          libraryID: 4,
          itemID: 12,
          position: { pageIndex: 4, top: 50, left: 60, primary: true },
        },
      },
    ]);
  });

  it('rethrows native failures unchanged and lets native saves proceed after capture failures', () => {
    const h = harness();
    const nativeError = new Error('native save failed');
    const nativeSave = vi.fn(() => {
      throw nativeError;
    });
    h.primaryHistory.save = nativeSave;
    h.bridge.sync();

    let caught: unknown;
    try {
      h.primaryHistory.save?.(location(1, 12, 22));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(nativeError);
    expect(nativeSave).toHaveBeenCalledTimes(1);
    expect(h.transitions).toEqual([]);

    const captureError = new Error('capture failed');
    h.host.captureHardLocation = () => {
      throw captureError;
    };
    h.primaryHistory.save = vi.fn(function (this: TestHistory, dest) {
      this._currentLocation = dest;
      return 'still-saved';
    });
    h.bridge.sync();

    expect(h.primaryHistory.save?.(location(2, 20, 30))).toBe('still-saved');
    expect(h.transitions).toEqual([]);
  });

  it('suppresses intermediate native points for a current manual hold and observes a later jump before release', () => {
    const h = harness();
    h.bridge.sync();
    let isCurrent = true;
    const release = h.bridge.holdJump(h.primary, () => isCurrent);
    const intermediate = location(1, 15, 25);

    expect(h.primaryHistory.save?.(intermediate)).toBe('native-save');
    expect(h.primaryHistory._currentLocation).toBe(intermediate);
    expect(h.transitions).toEqual([]);

    isCurrent = false;
    expect(h.primaryHistory.save?.(location(3, 35, 45))).toBe('native-save');
    expect(h.transitions).toEqual([
      {
        source: {
          kind: 'reader',
          tabID: 'reader-tab',
          libraryID: 4,
          itemID: 12,
          position: { pageIndex: 1, top: 15, left: 25, primary: true },
        },
        destination: {
          kind: 'reader',
          tabID: 'reader-tab',
          libraryID: 4,
          itemID: 12,
          position: { pageIndex: 3, top: 35, left: 45, primary: true },
        },
      },
    ]);
    release();
  });

  it('does not let an older manual-hold release clear a newer hold', () => {
    const h = harness();
    h.bridge.sync();
    const releaseOld = h.bridge.holdJump(h.primary, () => true);
    let newerIsCurrent = true;
    const releaseNew = h.bridge.holdJump(h.primary, () => newerIsCurrent);
    releaseOld();

    const heldLocation = location(1, 15, 25);
    expect(h.primaryHistory.save?.(heldLocation)).toBe('native-save');
    expect(h.primaryHistory._currentLocation).toBe(heldLocation);
    expect(h.transitions).toEqual([]);

    newerIsCurrent = false;
    h.primaryHistory.save?.(location(2, 20, 30));
    expect(h.transitions).toEqual([
      {
        source: {
          kind: 'reader',
          tabID: 'reader-tab',
          libraryID: 4,
          itemID: 12,
          position: { pageIndex: 1, top: 15, left: 25, primary: true },
        },
        destination: {
          kind: 'reader',
          tabID: 'reader-tab',
          libraryID: 4,
          itemID: 12,
          position: { pageIndex: 2, top: 20, left: 30, primary: true },
        },
      },
    ]);
    releaseNew();
  });

  it('records unrelated hard destinations while a restored-location suppression is pending', () => {
    const h = harness();
    h.bridge.sync();
    h.host.suppressRestoredLocation(h.primary, { pageIndex: 1, top: 15, left: 25, primary: true });

    h.primaryHistory.save?.(location(2, 20, 30));
    h.primaryHistory.save?.(location(1, 15, 25));

    expect(h.transitions).toEqual([
      {
        source: {
          kind: 'reader',
          tabID: 'reader-tab',
          libraryID: 4,
          itemID: 12,
          position: { pageIndex: 0, top: 10, left: 20, primary: true },
        },
        destination: {
          kind: 'reader',
          tabID: 'reader-tab',
          libraryID: 4,
          itemID: 12,
          position: { pageIndex: 2, top: 20, left: 30, primary: true },
        },
      },
    ]);
  });

  it('honors host self-restore suppression and restores patched behavior on release and dispose', () => {
    const h = harness();
    const originalPrimarySave = vi.fn(function (this: TestHistory, dest) {
      this._currentLocation = dest;
      return 'saved';
    });
    h.primaryHistory.save = originalPrimarySave;
    h.bridge.sync();
    h.host.suppressRestoredLocation(h.primary, { pageIndex: 1, top: 15, left: 25, primary: true });

    expect(h.primaryHistory.save?.(location(1, 15, 25))).toBe('saved');
    expect(h.transitions).toEqual([]);

    h.bridge.releaseWindow(h.primaryWindow);
    expect(h.primaryHistory.save).toBe(originalPrimarySave);
    h.primaryHistory.save?.(location(2, 20, 30));
    expect(originalPrimarySave).toHaveBeenCalledTimes(2);
    expect(h.transitions).toEqual([]);

    const originalSecondarySave = vi.fn();
    h.secondaryHistory.save = originalSecondarySave;
    h.bridge.sync();
    h.bridge.dispose();
    expect(h.secondaryHistory.save).toBe(originalSecondarySave);
    h.secondaryHistory.save?.(location(3, 35, 45));
    expect(originalSecondarySave).toHaveBeenCalledTimes(1);
  });

  it('restores a replaced history and preserves third-party save patches', () => {
    const h = harness();
    const oldSave = vi.fn();
    h.primaryHistory.save = oldSave;
    h.bridge.sync();

    const replacementHistory: ReaderPdfHistoryRuntime = {
      _currentLocation: location(1, 15, 25),
      save: vi.fn(),
    };
    const thirdPartySave = vi.fn();
    Object.defineProperty(h.primary, '_history', { value: replacementHistory, configurable: true });
    h.bridge.sync();
    expect(h.primaryHistory.save).toBe(oldSave);

    replacementHistory.save = thirdPartySave;
    h.bridge.sync();
    h.bridge.dispose();
    expect(replacementHistory.save).toBe(thirdPartySave);
  });
});
