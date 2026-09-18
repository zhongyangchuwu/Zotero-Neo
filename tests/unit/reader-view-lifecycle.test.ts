import { describe, expect, it, vi } from 'vitest';

import { ReaderViewLifecycle } from '../../src/reader/view-lifecycle';
import type { PdfWindow, ReaderRuntime, ReaderViewRuntime } from '../../src/reader/types';

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
    const primary = fakePdfWindow();
    const secondary = fakePdfWindow();
    const primaryView = { _iframeWindow: primary.pdfWindow } as ReaderViewRuntime;
    const secondaryView = { _iframeWindow: secondary.pdfWindow } as ReaderViewRuntime;
    const internal = { _primaryView: primaryView } as NonNullable<ReaderRuntime['_internalReader']>;
    const reader = { _internalReader: internal } as ReaderRuntime;
    let active = primary.pdfWindow;

    const setActivePdfWindow = vi.fn((pdfWindow: PdfWindow) => {
      active = pdfWindow;
    });
    const onKeyDown = vi.fn();
    const onKeyUp = vi.fn();
    const onBlur = vi.fn();
    const onSelectionChange = vi.fn();
    const onScroll = vi.fn();
    const onResize = vi.fn();
    const releaseView = vi.fn();
    const syncHostBridge = vi.fn();

    const lifecycle = new ReaderViewLifecycle({
      reader,
      timerWindow: primary.pdfWindow,
      activePdfWindow: () => active,
      setActivePdfWindow,
      onKeyDown,
      onKeyUp,
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
      'blur',
      'resize',
    ]);
    expect(primary.documentAdds.map((entry) => entry.type)).toEqual(['selectionchange']);
    expect(primary.scrollAdds.map((entry) => entry.type)).toEqual(['scroll']);
    expect(syncHostBridge).toHaveBeenCalledOnce();

    const keydown = { key: 'j' } as unknown as KeyboardEvent;
    const keyup = { key: 'j' } as unknown as KeyboardEvent;
    primary.emitWindow('keydown', keydown);
    primary.emitWindow('keyup', keyup);
    primary.emitWindow('blur', {} as Event);
    primary.emitDocument('selectionchange', {} as Event);
    primary.emitWindow('resize', {} as Event);
    primary.emitScroll({} as Event);

    expect(onKeyDown).toHaveBeenCalledWith(keydown, primary.pdfWindow);
    expect(onKeyUp).toHaveBeenCalledWith(keyup);
    expect(onBlur).toHaveBeenCalledWith(primary.pdfWindow);
    expect(onSelectionChange).toHaveBeenCalledWith(primary.pdfWindow);
    expect(onResize).toHaveBeenCalledWith(primary.pdfWindow);
    expect(onScroll).toHaveBeenCalledWith(primary.pdfWindow);

    Reflect.set(internal, '_secondaryView', secondaryView);
    primary.intervalTasks[0]?.();

    expect(secondary.windowAdds.map((entry) => entry.type)).toEqual([
      'keydown',
      'keyup',
      'blur',
      'resize',
    ]);
    expect(releaseView).not.toHaveBeenCalled();
    expect(syncHostBridge).toHaveBeenCalledTimes(2);

    Reflect.set(internal, '_primaryView', undefined);
    primary.intervalTasks[0]?.();

    expect(setActivePdfWindow).toHaveBeenCalledWith(secondary.pdfWindow);
    expect(releaseView).toHaveBeenCalledWith(primary.pdfWindow);
    expect(primary.windowRemoves.map((entry) => entry.type)).toEqual([
      'keydown',
      'keyup',
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
      'blur',
      'resize',
    ]);
    expect(secondary.documentRemoves.map((entry) => entry.type)).toEqual(['selectionchange']);
    expect(secondary.scrollRemoves.map((entry) => entry.type)).toEqual(['scroll']);

    lifecycle.sync();
    expect(syncHostBridge).toHaveBeenCalledTimes(3);
  });
});
