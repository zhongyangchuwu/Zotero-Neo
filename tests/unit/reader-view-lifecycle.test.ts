import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderViewLifecycle } from '../../src/toolkit/reader/view-lifecycle';
import type { PdfWindow, ReaderRuntime, ReaderViewRuntime } from '../fixtures/reader-native-types';

const originalComponents = Reflect.get(globalThis, 'Components');
afterEach(() => {
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

type ListenerEntry = {
  readonly type: string;
  readonly listener: EventListener;
};

function fakePdfWindow() {
  const windowAdds: ListenerEntry[] = [];
  const windowRemoves: ListenerEntry[] = [];
  const documentAdds: ListenerEntry[] = [];
  const documentRemoves: ListenerEntry[] = [];
  const scrollAdds: ListenerEntry[] = [];
  const scrollRemoves: ListenerEntry[] = [];
  const intervalTasks: Array<() => void> = [];
  const scrollElement = {
    addEventListener: (type: string, listener: EventListener) =>
      scrollAdds.push({ type, listener }),
    removeEventListener: (type: string, listener: EventListener) =>
      scrollRemoves.push({ type, listener }),
  } as unknown as Element;
  const document = {
    getElementById: (id: string) => (id === 'viewerContainer' ? scrollElement : null),
    querySelector: () => null,
    addEventListener: (type: string, listener: EventListener) =>
      documentAdds.push({ type, listener }),
    removeEventListener: (type: string, listener: EventListener) =>
      documentRemoves.push({ type, listener }),
  } as unknown as Document;
  const pdfWindow = {
    document,
    addEventListener: (type: string, listener: EventListener) =>
      windowAdds.push({ type, listener }),
    removeEventListener: (type: string, listener: EventListener) =>
      windowRemoves.push({ type, listener }),
    setInterval: (task: () => void) => {
      intervalTasks.push(task);
      return 7;
    },
  } as unknown as PdfWindow;

  const emitWindow = (type: string, event: Event): void => {
    for (const entry of windowAdds.filter((candidate) => candidate.type === type))
      entry.listener(event);
  };
  const emitDocument = (type: string, event: Event): void => {
    for (const entry of documentAdds.filter((candidate) => candidate.type === type))
      entry.listener(event);
  };
  const emitScroll = (event: Event): void => {
    for (const entry of scrollAdds.filter((candidate) => candidate.type === 'scroll'))
      entry.listener(event);
  };

  return {
    pdfWindow,
    intervalTasks,
    windowAdds,
    windowRemoves,
    documentAdds,
    documentRemoves,
    scrollAdds,
    scrollRemoves,
    emitWindow,
    emitDocument,
    emitScroll,
  };
}

describe('ReaderViewLifecycle', () => {
  it('owns primary/secondary listener attachment, replacement, release, and active-view fallback', () => {
    Reflect.set(globalThis, 'Components', { utils: { isDeadWrapper: () => false } });
    const primary = fakePdfWindow();
    const secondary = fakePdfWindow();
    const primaryView = { _iframeWindow: primary.pdfWindow } as ReaderViewRuntime;
    const secondaryView = { _iframeWindow: secondary.pdfWindow } as ReaderViewRuntime;
    const internal = { _primaryView: primaryView } as NonNullable<ReaderRuntime['_internalReader']>;
    const reader = { _internalReader: internal } as ReaderRuntime;
    const onKeyDown = vi.fn();
    const onKeyUp = vi.fn();
    const onPointerDown = vi.fn();
    const onBlur = vi.fn();
    const onSelectionChange = vi.fn();
    const onScroll = vi.fn();
    const onResize = vi.fn();
    const releaseView = vi.fn();
    const syncHostBridge = vi.fn();

    const lifecycle = new ReaderViewLifecycle({
      reader,
      timerWindow: primary.pdfWindow,
      onKeyDown,
      onKeyUp,
      onPointerDown,
      onBlur,
      onSelectionChange,
      onScroll,
      onResize,
      releaseView,
      syncHostBridge,
    });

    lifecycle.start();
    lifecycle.start();

    expect(primary.intervalTasks).toHaveLength(1);
    expect(primary.windowAdds.map((entry) => entry.type)).toEqual([
      'keydown',
      'keyup',
      'pointerdown',
      'blur',
      'resize',
    ]);
    expect(primary.documentAdds.map((entry) => entry.type)).toEqual(['selectionchange']);
    expect(primary.scrollAdds.map((entry) => entry.type)).toEqual(['scroll']);
    expect(syncHostBridge).toHaveBeenCalledOnce();
    expect(lifecycle.activePdfWindow()).toBe(primary.pdfWindow);

    const keydown = { key: 'j' } as unknown as KeyboardEvent;
    const keyup = { key: 'j' } as unknown as KeyboardEvent;
    primary.emitWindow('keydown', keydown);
    primary.emitWindow('keyup', keyup);
    primary.emitWindow('pointerdown', {} as Event);
    primary.emitWindow('blur', {} as Event);
    primary.emitDocument('selectionchange', {} as Event);
    primary.emitWindow('resize', {} as Event);
    primary.emitScroll({} as Event);

    expect(onKeyDown).toHaveBeenCalledWith(keydown, primary.pdfWindow);
    expect(onKeyUp).toHaveBeenCalledWith(keyup);
    expect(onPointerDown).toHaveBeenCalledWith(primary.pdfWindow);
    expect(onSelectionChange).toHaveBeenCalledWith(primary.pdfWindow);
    expect(onResize).toHaveBeenCalledWith(primary.pdfWindow);
    expect(onScroll).toHaveBeenCalledWith(primary.pdfWindow);

    Reflect.set(internal, '_secondaryView', secondaryView);
    primary.intervalTasks[0]?.();

    expect(secondary.windowAdds.map((entry) => entry.type)).toEqual([
      'keydown',
      'keyup',
      'pointerdown',
      'blur',
      'resize',
    ]);
    expect(releaseView).not.toHaveBeenCalled();
    expect(syncHostBridge).toHaveBeenCalledTimes(2);

    Reflect.set(internal, '_primaryView', undefined);
    primary.intervalTasks[0]?.();

    expect(lifecycle.activePdfWindow()).toBe(secondary.pdfWindow);
    expect(releaseView).toHaveBeenCalledWith(primary.pdfWindow);
    expect(primary.windowRemoves.map((entry) => entry.type)).toEqual([
      'keydown',
      'keyup',
      'pointerdown',
      'blur',
      'resize',
    ]);
    expect(primary.documentRemoves.map((entry) => entry.type)).toEqual(['selectionchange']);
    expect(primary.scrollRemoves.map((entry) => entry.type)).toEqual(['scroll']);

    lifecycle.dispose();

    expect(releaseView).toHaveBeenCalledWith(secondary.pdfWindow);
    expect(secondary.windowRemoves.map((entry) => entry.type)).toEqual([
      'keydown',
      'keyup',
      'pointerdown',
      'blur',
      'resize',
    ]);
    expect(secondary.documentRemoves.map((entry) => entry.type)).toEqual(['selectionchange']);
    expect(secondary.scrollRemoves.map((entry) => entry.type)).toEqual(['scroll']);

    lifecycle.sync();
    primary.emitWindow('pointerdown', {} as Event);
    secondary.emitWindow('pointerdown', {} as Event);
    expect(onPointerDown).toHaveBeenCalledOnce();
    expect(syncHostBridge).toHaveBeenCalledTimes(3);
  });
  it('retires old registrations before same-window view and document replacements', () => {
    Reflect.set(globalThis, 'Components', { utils: { isDeadWrapper: () => false } });
    const original = fakePdfWindow();
    const replacement = fakePdfWindow();
    const firstView = { _iframeWindow: original.pdfWindow } as ReaderViewRuntime;
    const internal = { _primaryView: firstView } as NonNullable<ReaderRuntime['_internalReader']>;
    const reader = { _internalReader: internal } as ReaderRuntime;
    const onPointerDown = vi.fn();
    const releaseView = vi.fn();
    const lifecycle = new ReaderViewLifecycle({
      reader,
      timerWindow: original.pdfWindow,
      onKeyDown: vi.fn(),
      onKeyUp: vi.fn(),
      onPointerDown,
      onBlur: vi.fn(),
      onSelectionChange: vi.fn(),
      onScroll: vi.fn(),
      onResize: vi.fn(),
      releaseView,
      syncHostBridge: vi.fn(),
    });
    lifecycle.sync();
    const oldPointer = original.windowAdds.find((entry) => entry.type === 'pointerdown')!.listener;
    Reflect.set(internal, '_primaryView', { _iframeWindow: original.pdfWindow });
    oldPointer({} as Event);
    expect(onPointerDown).not.toHaveBeenCalled();
    lifecycle.sync();
    expect(releaseView).toHaveBeenCalledTimes(1);
    expect(original.documentRemoves).toHaveLength(1);
    expect(original.windowAdds.filter((entry) => entry.type === 'pointerdown')).toHaveLength(2);
    const secondPointer = original.windowAdds.filter((entry) => entry.type === 'pointerdown')[1]!
      .listener;
    Reflect.set(original.pdfWindow, 'document', replacement.pdfWindow.document);
    secondPointer({} as Event);
    expect(onPointerDown).not.toHaveBeenCalled();
    lifecycle.sync();
    expect(releaseView).toHaveBeenCalledTimes(2);
    expect(original.documentRemoves).toHaveLength(2);
    expect(replacement.documentAdds).toHaveLength(1);
    const thirdPointer = original.windowAdds.filter((entry) => entry.type === 'pointerdown')[2]!
      .listener;
    thirdPointer({} as Event);
    expect(onPointerDown).toHaveBeenCalledOnce();
    lifecycle.dispose();
  });
  it('drains partial registration and preserves the acquisition error', () => {
    Reflect.set(globalThis, 'Components', { utils: { isDeadWrapper: () => false } });
    const view = fakePdfWindow();
    const reader = {
      _internalReader: { _primaryView: { _iframeWindow: view.pdfWindow } },
    } as ReaderRuntime;
    const document = view.pdfWindow.document;
    const add = document.addEventListener.bind(document);
    const remove = view.pdfWindow.removeEventListener.bind(view.pdfWindow);
    const acquisitionError = new Error('selection registration failed');
    Reflect.set(document, 'addEventListener', (type: string, listener: EventListener) => {
      add(type, listener);
      throw acquisitionError;
    });
    Reflect.set(view.pdfWindow, 'removeEventListener', (type: string, listener: EventListener) => {
      remove(type, listener);
      if (type === 'keydown') throw new Error('cleanup failed');
    });
    const releaseView = vi.fn();
    const onPointerDown = vi.fn();
    const lifecycle = new ReaderViewLifecycle({
      reader,
      timerWindow: view.pdfWindow,
      onKeyDown: vi.fn(),
      onKeyUp: vi.fn(),
      onPointerDown,
      onBlur: vi.fn(),
      onSelectionChange: vi.fn(),
      onScroll: vi.fn(),
      onResize: vi.fn(),
      releaseView,
      syncHostBridge: vi.fn(),
    });
    expect(() => lifecycle.sync()).toThrow(acquisitionError);
    expect(view.windowRemoves.map((entry) => entry.type)).toEqual([
      'keydown',
      'keyup',
      'pointerdown',
      'blur',
    ]);
    expect(view.documentRemoves.map((entry) => entry.type)).toEqual(['selectionchange']);
    expect(releaseView).toHaveBeenCalledOnce();
    view.emitWindow('pointerdown', {} as Event);
    expect(onPointerDown).not.toHaveBeenCalled();
    lifecycle.dispose();
    expect(releaseView).toHaveBeenCalledOnce();
  });

  it('removes a late listener after reentrant disposal during registration', () => {
    Reflect.set(globalThis, 'Components', { utils: { isDeadWrapper: () => false } });
    const view = fakePdfWindow();
    const reader = {
      _internalReader: { _primaryView: { _iframeWindow: view.pdfWindow } },
    } as ReaderRuntime;
    const releaseView = vi.fn();
    const onPointerDown = vi.fn();
    const syncHostBridge = vi.fn();
    const lifecycle = new ReaderViewLifecycle({
      reader,
      timerWindow: view.pdfWindow,
      onKeyDown: vi.fn(),
      onKeyUp: vi.fn(),
      onPointerDown,
      onBlur: vi.fn(),
      onSelectionChange: vi.fn(),
      onScroll: vi.fn(),
      onResize: vi.fn(),
      releaseView,
      syncHostBridge,
    });
    const document = view.pdfWindow.document;
    const add = document.addEventListener.bind(document);
    Reflect.set(document, 'addEventListener', (type: string, listener: EventListener) => {
      lifecycle.dispose();
      add(type, listener);
    });
    lifecycle.start();
    expect(view.documentAdds).toHaveLength(1);
    expect(view.documentRemoves.at(-1)?.listener).toBe(view.documentAdds[0]?.listener);
    expect(view.intervalTasks).toHaveLength(0);
    expect(syncHostBridge).not.toHaveBeenCalled();
    expect(releaseView).toHaveBeenCalledOnce();
    view.emitWindow('pointerdown', {} as Event);
    expect(onPointerDown).not.toHaveBeenCalled();
  });
});
