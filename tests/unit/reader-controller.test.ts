import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReaderControllerDependencies } from '../../src/core/contracts';
import { ReaderSession, createReaderController } from '../../src/reader/controller';
import { DEFAULT_BINDINGS } from '../../src/input/bindings';
import type { InternalReaderRuntime, PdfWindow, ReaderRuntime } from '../../src/reader/types';

const originalZotero = Reflect.get(globalThis, 'Zotero');
const originalServices = Reflect.get(globalThis, 'Services');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
  vi.useRealTimers();
  if (originalServices === undefined) Reflect.deleteProperty(globalThis, 'Services');
  else Reflect.set(globalThis, 'Services', originalServices);
});

describe('reader discovery diagnostics', () => {
  it('records registration once but does not log unchanged rescans', () => {
    const diagnostics: string[] = [];
    const readerService = {
      _readers: [],
      registerEventListener: () => Symbol('reader-listener'),
      unregisterEventListener: () => {},
      getByTabID: () => null,
    };
    Reflect.set(globalThis, 'Zotero', { Reader: readerService });

    const dependencies = {
      preferences: {
        has: () => false,
        get: (_key: string, fallback: boolean | number | string) => fallback,
        set: () => {},
      },
      logger: {
        debug: () => {},
        diagnostic: (message: string) => diagnostics.push(message),
      },
      delegateMain: () => {},
    } as ReaderControllerDependencies;
    const controller = createReaderController(dependencies);
    const window = { Zotero_Tabs: { _tabs: [] } } as unknown as _ZoteroTypes.MainWindow;

    controller.start('zotero-neo@zotero-neo');
    controller.rescan(window);
    controller.rescan(window);
    controller.rescan(window);
    controller.shutdown();

    expect(diagnostics).toEqual(['reader listeners registered']);
  });
});

function createHistorySession(internal: InternalReaderRuntime = {}) {
  const debug: string[] = [];
  const nodes = new Map<string, { id: string }>();
  const document = {
    defaultView: null as Window | null,
    head: {
      appendChild: (node: { id: string }) => nodes.set(node.id, node),
    },
    documentElement: {
      appendChild: (node: { id: string }) => nodes.set(node.id, node),
    },
    getElementById: (id: string) => nodes.get(id) ?? null,
    querySelector: () => null,
    createElement: () => ({ id: '', textContent: '' }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const pdfWindow = {
    document,
    focus: vi.fn(),
    addEventListener: () => {},
    removeEventListener: () => {},
    setInterval: () => 1,
  } as unknown as PdfWindow;
  document.defaultView = pdfWindow;
  Reflect.set(globalThis, 'Services', { focus: { focusedWindow: pdfWindow } });
  const reader = {
    _internalReader: {
      ...internal,
      _primaryView: internal._primaryView ?? { _iframeWindow: pdfWindow },
    },
  } as ReaderRuntime;
  const controller = {
    dependencies: {
      preferences: {
        has: () => false,
        get: (_key: string, fallback: boolean | number | string) => fallback,
        set: () => {},
      },
      logger: {
        debug: (message: string) => debug.push(message),
        diagnostic: () => {},
      },
      delegateMain: () => {},
    },
  };
  const session = new ReaderSession({
    controller,
    reader,
    firstPdfWindow: pdfWindow,
    bindings: () => DEFAULT_BINDINGS,
    release: () => {},
  } as unknown as ConstructorParameters<typeof ReaderSession>[0]);
  const indicator = {
    style: { display: '', color: '', background: '' },
    textContent: '',
  } as unknown as HTMLElement;
  session.state.indicator = indicator;
  return { session, indicator, debug, pdfWindow, reader };
}

function controlKey(key: string, target: EventTarget | null = null) {
  const preventDefault = vi.fn();
  const stopImmediatePropagation = vi.fn();
  return {
    event: {
      key,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target,
      preventDefault,
      stopImmediatePropagation,
    } as unknown as KeyboardEvent,
    preventDefault,
    stopImmediatePropagation,
  };
}

describe('native reader history', () => {
  it('delegates Ctrl-o and Ctrl-i to Zotero and consumes both events', () => {
    const navigateBack = vi.fn();
    const navigateForward = vi.fn();
    const { session } = createHistorySession({ navigateBack, navigateForward });
    const back = controlKey('o');
    const forward = controlKey('i');

    session.focusAndHandle(back.event);
    session.focusAndHandle(forward.event);

    expect(navigateBack).toHaveBeenCalledOnce();
    expect(navigateForward).toHaveBeenCalledOnce();
    expect(back.preventDefault).toHaveBeenCalledOnce();
    expect(back.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(forward.preventDefault).toHaveBeenCalledOnce();
    expect(forward.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it('reports missing and failed host commands without throwing through input dispatch', () => {
    vi.useFakeTimers();
    const missing = createHistorySession();

    expect(() => missing.session.focusAndHandle(controlKey('o').event)).not.toThrow();
    expect(missing.indicator.textContent).toBe('History unavailable');

    const failed = createHistorySession({
      navigateForward: () => {
        throw new Error('reader reloaded');
      },
    });
    expect(() => failed.session.focusAndHandle(controlKey('i').event)).not.toThrow();
    expect(failed.indicator.textContent).toBe('History unavailable');
    expect(failed.debug).toEqual(['reader history forward failed: Error: reader reloaded']);
    vi.clearAllTimers();
  });

  it('leaves history chords untouched in Insert mode and editable controls', () => {
    const navigateBack = vi.fn();
    const { session } = createHistorySession({ navigateBack });
    session.state.mode = 'insert';
    const insert = controlKey('o');

    session.focusAndHandle(insert.event);

    const input = { tagName: 'INPUT', localName: 'input' } as unknown as EventTarget;
    session.state.mode = 'normal';
    const editable = controlKey('o', input);
    session.focusAndHandle(editable.event);

    expect(navigateBack).not.toHaveBeenCalled();
    expect(insert.preventDefault).not.toHaveBeenCalled();
    expect(editable.preventDefault).not.toHaveBeenCalled();
  });

  it('suppresses Zotero key forwarding only for bound history chords', () => {
    const originalKeyDown = vi.fn();
    const created = createHistorySession();
    const view = created.reader._internalReader?._primaryView;
    if (!view) throw new Error('Expected a primary reader view');
    view._onKeyDown = originalKeyDown;
    created.session.start();

    view._onKeyDown?.(controlKey('o').event);
    view._onKeyDown?.(controlKey('x').event);

    expect(originalKeyDown).toHaveBeenCalledOnce();
    expect(originalKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: 'x' }));
    created.session.dispose();
  });
});
