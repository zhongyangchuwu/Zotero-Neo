import { describe, expect, it, vi } from 'vitest';

import { ReaderHostKeyBridge } from '../../src/reader/host-key-bridge';
import type { PdfWindow, ReaderRuntime, ReaderViewRuntime } from '../../src/reader/types';

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

    expect(() => bridge.sync()).not.toThrow();

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
