import { describe, expect, it, vi } from 'vitest';

import { ReaderHostKeyBridge } from '../../src/reader/host-key-bridge';
import type { ReaderRuntime, ReaderViewRuntime } from '../../src/reader/types';

describe('ReaderHostKeyBridge', () => {
  it('patches each view once, delegates policy to the session, and restores host callbacks', () => {
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
    const patchedKeyDown = view._onKeyDown;
    const patchedTextFocus = view._textAnnotationFocused;
    bridge.sync();

    expect(view._onKeyDown).toBe(patchedKeyDown);
    expect(view._textAnnotationFocused).toBe(patchedTextFocus);

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

    expect(() => bridge.sync()).not.toThrow();

    const originalKeyDown = vi.fn();
    const originalTextFocus = vi.fn(() => false);
    const view = {
      _onKeyDown: originalKeyDown,
      _textAnnotationFocused: originalTextFocus,
    } as unknown as ReaderViewRuntime;
    Reflect.set(internal, '_primaryView', view);

    bridge.sync();

    expect(view._onKeyDown).not.toBe(originalKeyDown);
    expect(view._textAnnotationFocused).not.toBe(originalTextFocus);
    bridge.dispose();
    expect(view._onKeyDown).toBe(originalKeyDown);
    expect(view._textAnnotationFocused).toBe(originalTextFocus);
  });
});
