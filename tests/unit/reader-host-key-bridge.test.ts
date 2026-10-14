import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReaderHostKeyBridge } from '../../src/toolkit/reader/input-bridge';
import type { PdfWindow, ReaderRuntime, ReaderViewRuntime } from '../fixtures/reader-native-types';

const originalComponents = Reflect.get(globalThis, 'Components');

beforeEach(() => {
  Reflect.set(globalThis, 'Components', { utils: { isDeadWrapper: () => false } });
});

afterEach(() => {
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

function createRetirementHarness() {
  const destroyed = new WeakSet<object>();
  Reflect.set(globalThis, 'Components', {
    utils: { isDeadWrapper: (value: object) => destroyed.has(value) },
  });
  const nativeKeys: { view: ReaderViewRuntime; event: KeyboardEvent }[] = [];
  const nativeFocused = new WeakSet<ReaderViewRuntime>();
  const nativeKeyDown = vi.fn(function (this: ReaderViewRuntime, event: KeyboardEvent) {
    nativeKeys.push({ view: this, event });
    return event.defaultPrevented ? 'blocked' : 'native';
  });
  const nativeTextFocus = vi.fn(function (this: ReaderViewRuntime) {
    return nativeFocused.has(this);
  });
  const primary = {
    _iframeWindow: { document: {} },
    _onKeyDown: nativeKeyDown,
    _textAnnotationFocused: nativeTextFocus,
  } as unknown as ReaderViewRuntime;
  const secondary = {
    _iframeWindow: { document: {} },
    _onKeyDown: nativeKeyDown,
    _textAnnotationFocused: nativeTextFocus,
  } as unknown as ReaderViewRuntime;
  const internal = { _primaryView: primary, _secondaryView: secondary };
  const nativeEditableFocused = vi.fn(() => true);
  const consumesKey = vi.fn(() => true);
  const commentInputFocused = vi.fn(() => true);
  const bridge = new ReaderHostKeyBridge({
    reader: { _internalReader: internal } as unknown as ReaderRuntime,
    nativeEditableFocused,
    consumesKey,
    commentInputFocused,
    debug: vi.fn(),
  });
  return {
    bridge,
    primary,
    secondary,
    internal,
    destroyed,
    nativeKeys,
    nativeFocused,
    nativeKeyDown,
    nativeTextFocus,
    nativeEditableFocused,
    consumesKey,
    commentInputFocused,
  };
}

describe('ReaderHostKeyBridge', () => {
  it('keeps consumed commands and focused comment input out of host handling and restores callbacks', () => {
    const originalKeyDown = vi.fn();
    const originalTextFocus = vi.fn(() => false);
    const pdfWindow = { document: {} } as unknown as Window;
    const view = {
      _iframeWindow: pdfWindow,
      _onKeyDown: originalKeyDown,
      _textAnnotationFocused: originalTextFocus,
    } as unknown as ReaderViewRuntime;
    const reader = {
      _internalReader: { _primaryView: view },
    } as unknown as ReaderRuntime;
    let commentFocused = false;
    const debug = vi.fn();
    const bridge = new ReaderHostKeyBridge({
      reader,
      nativeEditableFocused: () => false,
      consumesKey: (key) => key === 'j',
      commentInputFocused: (window) => commentFocused && window === pdfWindow,
      debug,
    });

    bridge.sync();
    bridge.sync();

    view._onKeyDown?.({ key: 'j' } as KeyboardEvent);
    expect(originalKeyDown).not.toHaveBeenCalled();

    const native = { key: 'x' } as KeyboardEvent;
    view._onKeyDown?.(native);
    expect(originalKeyDown).toHaveBeenCalledOnce();
    expect(originalKeyDown).toHaveBeenCalledWith(native);

    expect(view._textAnnotationFocused?.()).toBe(false);
    commentFocused = true;
    expect(view._textAnnotationFocused?.()).toBe(true);
    expect(originalTextFocus).toHaveBeenCalledOnce();
    expect(debug).not.toHaveBeenCalled();

    bridge.dispose();
    expect(view._onKeyDown).toBe(originalKeyDown);
    expect(view._textAnnotationFocused).toBe(originalTextFocus);
  });
  it('suppresses editor keys only in the owning split view and leaves composition native', () => {
    const ownerWindow = { document: {} } as unknown as PdfWindow;
    const otherWindow = { document: {} } as unknown as PdfWindow;
    const ownerHostKey = vi.fn();
    const otherHostKey = vi.fn();
    const primary = { _iframeWindow: ownerWindow, _onKeyDown: ownerHostKey };
    const secondary = { _iframeWindow: otherWindow, _onKeyDown: otherHostKey };
    const bridge = new ReaderHostKeyBridge({
      reader: {
        _internalReader: { _primaryView: primary, _secondaryView: secondary },
      } as unknown as ReaderRuntime,
      nativeEditableFocused: () => false,
      consumesKey: (key, pdfWindow) =>
        pdfWindow === ownerWindow && ['x', 'enter', 'escape'].includes(key),
      commentInputFocused: () => false,
      debug: vi.fn(),
    });
    bridge.sync();

    for (const key of ['x', 'Enter', 'Escape']) {
      const event = { key } as KeyboardEvent;
      primary._onKeyDown(event);
      secondary._onKeyDown(event);
      expect(otherHostKey).toHaveBeenLastCalledWith(event);
    }
    expect(ownerHostKey).not.toHaveBeenCalled();
    expect(otherHostKey).toHaveBeenCalledTimes(3);

    for (const event of [
      { key: 'Escape', isComposing: true },
      { key: 'Enter', keyCode: 229 },
      { key: 'Process' },
    ]) {
      primary._onKeyDown(event as unknown as KeyboardEvent);
      expect(ownerHostKey).toHaveBeenLastCalledWith(event);
    }
    expect(ownerHostKey).toHaveBeenCalledTimes(3);
    bridge.dispose();
  });

  it('ignores null host views and patches a view that appears later', () => {
    const internal = { _primaryView: null, _secondaryView: null } as unknown as NonNullable<
      ReaderRuntime['_internalReader']
    >;
    const reader = { _internalReader: internal } as ReaderRuntime;
    const bridge = new ReaderHostKeyBridge({
      reader,
      nativeEditableFocused: () => false,
      consumesKey: () => false,
      commentInputFocused: () => false,
      debug: vi.fn(),
    });

    bridge.sync();

    const originalKeyDown = vi.fn();
    const originalTextFocus = vi.fn(() => false);
    const view = {
      _onKeyDown: originalKeyDown,
      _textAnnotationFocused: originalTextFocus,
    } as unknown as ReaderViewRuntime;
    Reflect.set(internal, '_primaryView', view);

    bridge.sync();

    const native = { key: 'x' } as KeyboardEvent;
    view._onKeyDown?.(native);
    expect(originalKeyDown).toHaveBeenCalledWith(native);
    expect(view._textAnnotationFocused?.()).toBe(false);
    bridge.dispose();
    expect(view._onKeyDown).toBe(originalKeyDown);
    expect(view._textAnnotationFocused).toBe(originalTextFocus);
  });
});

describe('ReaderHostKeyBridge callback retirement', () => {
  it('releases callbacks for an absent view during sync while keeping the surviving view patched', () => {
    const h = createRetirementHarness();
    h.bridge.sync();
    const survivingKeyWrapper = h.primary._onKeyDown;
    const survivingFocusWrapper = h.primary._textAnnotationFocused;
    Reflect.set(h.internal, '_secondaryView', null);

    h.bridge.sync();

    expect(h.secondary._onKeyDown).toBe(h.nativeKeyDown);
    expect(h.secondary._textAnnotationFocused).toBe(h.nativeTextFocus);
    expect(h.primary._onKeyDown).toBe(survivingKeyWrapper);
    expect(h.primary._textAnnotationFocused).toBe(survivingFocusWrapper);
    const event = { key: 'j' } as KeyboardEvent;
    expect(h.secondary._onKeyDown?.(event)).toBe('native');
    expect(h.primary._onKeyDown?.(event)).toBeUndefined();
    expect(h.nativeKeys).toEqual([{ view: h.secondary, event }]);
    expect(h.secondary._textAnnotationFocused?.()).toBe(false);
    expect(h.primary._textAnnotationFocused?.()).toBe(true);
    h.nativeFocused.add(h.secondary);
    expect(h.secondary._textAnnotationFocused?.()).toBe(true);
    h.bridge.dispose();
  });

  it('preserves foreign key and text-focus replacements when the bridge is disposed', () => {
    const h = createRetirementHarness();
    h.bridge.sync();
    const foreignEvents: KeyboardEvent[] = [];
    const foreignKey = (event: KeyboardEvent) => {
      foreignEvents.push(event);
      return 'foreign';
    };
    const foreignFocus = () => foreignEvents.length > 0;
    h.primary._onKeyDown = foreignKey;
    h.primary._textAnnotationFocused = foreignFocus;

    h.bridge.dispose();

    expect(h.primary._onKeyDown).toBe(foreignKey);
    expect(h.primary._textAnnotationFocused).toBe(foreignFocus);
    expect(h.primary._textAnnotationFocused?.()).toBe(false);
    const event = { key: 'Enter' } as KeyboardEvent;
    expect(h.primary._onKeyDown?.(event)).toBe('foreign');
    expect(foreignEvents).toEqual([event]);
    expect(h.primary._textAnnotationFocused?.()).toBe(true);
    expect(h.nativeKeys).toEqual([]);
    expect(h.secondary._onKeyDown).toBe(h.nativeKeyDown);
    expect(h.secondary._textAnnotationFocused).toBe(h.nativeTextFocus);
  });

  it.each(['sync', 'dispose'] as const)(
    'delegates retained retired wrappers natively without Neo policy after %s',
    (retirement) => {
      const h = createRetirementHarness();
      h.bridge.sync();
      const retainedKey = h.primary._onKeyDown!;
      const retainedFocus = h.primary._textAnnotationFocused!;
      if (retirement === 'sync') {
        Reflect.set(h.internal, '_primaryView', null);
        h.bridge.sync();
      } else h.bridge.dispose();

      const event = { key: 'j' } as KeyboardEvent;
      expect(retainedKey.call(h.secondary, event)).toBe('native');
      expect(h.nativeKeys).toEqual([{ view: h.primary, event }]);
      expect(retainedFocus.call(h.secondary)).toBe(false);
      h.nativeFocused.add(h.primary);
      expect(retainedFocus.call(h.secondary)).toBe(true);
      expect(h.nativeEditableFocused).not.toHaveBeenCalled();
      expect(h.consumesKey).not.toHaveBeenCalled();
      expect(h.commentInputFocused).not.toHaveBeenCalled();
      h.bridge.dispose();
    },
  );

  it('retires all wrappers and restores independent patches before rethrowing a live restoration failure', () => {
    const h = createRetirementHarness();
    h.bridge.sync();
    const retainedPrimaryKey = h.primary._onKeyDown!;
    const retainedSecondaryKey = h.secondary._onKeyDown!;
    const retainedPrimaryFocus = h.primary._textAnnotationFocused!;
    const failure = new Error('live key callback restoration failed');
    const event = { key: 'Enter' } as KeyboardEvent;
    const restoreKey = vi.fn(() => {
      expect(retainedSecondaryKey(event)).toBe('native');
      expect(retainedPrimaryFocus()).toBe(false);
      throw failure;
    });
    Object.defineProperty(h.primary, '_onKeyDown', {
      configurable: true,
      get: () => retainedPrimaryKey,
      set: restoreKey,
    });

    let thrown: unknown;
    try {
      h.bridge.dispose();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failure);
    expect(h.secondary._onKeyDown).toBe(h.nativeKeyDown);
    expect(h.primary._textAnnotationFocused).toBe(h.nativeTextFocus);
    expect(h.secondary._textAnnotationFocused).toBe(h.nativeTextFocus);
    expect(retainedPrimaryKey(event)).toBe('native');
    expect(h.nativeKeys).toEqual([
      { view: h.secondary, event },
      { view: h.primary, event },
    ]);
    expect(h.nativeEditableFocused).not.toHaveBeenCalled();
    expect(h.consumesKey).not.toHaveBeenCalled();
    expect(h.commentInputFocused).not.toHaveBeenCalled();
    expect(() => h.bridge.dispose()).not.toThrow();
    expect(restoreKey).toHaveBeenCalledOnce();
  });

  it('skips destroyed view properties while retiring their captured wrappers on sync', () => {
    const h = createRetirementHarness();
    h.bridge.sync();
    const retainedKey = h.secondary._onKeyDown!;
    const retainedFocus = h.secondary._textAnnotationFocused!;
    h.destroyed.add(h.secondary);
    const deadProperty = vi.fn(() => {
      throw new Error('dead view property');
    });
    Object.defineProperties(h.secondary, {
      _onKeyDown: { get: deadProperty, set: deadProperty },
      _textAnnotationFocused: { get: deadProperty, set: deadProperty },
    });
    Reflect.set(h.internal, '_secondaryView', null);

    expect(() => h.bridge.sync()).not.toThrow();

    const event = { key: 'j' } as KeyboardEvent;
    expect(retainedKey(event)).toBe('native');
    expect(h.nativeKeys).toEqual([{ view: h.secondary, event }]);
    expect(retainedFocus()).toBe(false);
    expect(deadProperty).not.toHaveBeenCalled();
    expect(h.nativeEditableFocused).not.toHaveBeenCalled();
    expect(h.consumesKey).not.toHaveBeenCalled();
    expect(h.commentInputFocused).not.toHaveBeenCalled();
    h.bridge.dispose();
  });
});
