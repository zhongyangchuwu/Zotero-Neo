import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommandPaletteContext, ReaderControllerDependencies } from '../../src/core/contracts';
import { ReaderSession, createReaderController } from '../../src/reader/controller';
import { DEFAULT_BINDINGS, type BindingMap } from '../../src/input/bindings';
import type {
  InternalReaderRuntime,
  PdfWindow,
  ReaderLinkOverlay,
  ReaderLinkPosition,
  ReaderRuntime,
  ReaderViewRuntime,
} from '../../src/reader/types';

import { KEY_GUIDE_CONFIG } from '../../src/input/key-guide-config';

const originalZotero = Reflect.get(globalThis, 'Zotero');
const originalServices = Reflect.get(globalThis, 'Services');
const originalComponents = Reflect.get(globalThis, 'Components');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
  vi.useRealTimers();
  if (originalServices === undefined) Reflect.deleteProperty(globalThis, 'Services');
  else Reflect.set(globalThis, 'Services', originalServices);
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
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
      openCommandPalette: () => {},
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

function createHistorySession(
  internal: InternalReaderRuntime = {},
  delegateMain: ReaderControllerDependencies['delegateMain'] = () => {},
  bindings: BindingMap = DEFAULT_BINDINGS,
  openCommandPalette: ReaderControllerDependencies['openCommandPalette'] = () => {},
  preferenceValues: Readonly<Record<string, boolean | number | string>> = {},
) {
  const debug: string[] = [];
  const diagnostics: string[] = [];
  const nodes = new Map<string, { id: string }>();
  const intervalTasks: (() => void)[] = [];
  const animationFrameTasks: (() => void)[] = [];
  const bodyChildren: HTMLElement[] = [];
  const document = {
    defaultView: null as Window | null,
    head: {
      appendChild: (node: { id: string }) => nodes.set(node.id, node),
    },
    body: {
      appendChild: (node: HTMLElement) => bodyChildren.push(node),
    },
    documentElement: {
      clientWidth: 800,
      clientHeight: 600,
      appendChild: (node: { id: string }) => nodes.set(node.id, node),
    },
    getElementById: (id: string) => nodes.get(id) ?? null,
    querySelector: () => null,
    createElement: () => {
      const attributes = new Map<string, string>();
      const children: HTMLElement[] = [];
      const element = {
        id: '',
        ownerDocument: document,
        textContent: '',
        hidden: false,
        dataset: {} as Record<string, string>,
        style: {
          cssText: '',
          display: '',
          left: '',
          top: '',
          color: '',
          background: '',
          width: '',
          height: '',
          borderRadius: '',
          colorScheme: '',
          getPropertyValue: () => '',
          setProperty: () => {},
        },
        focus: vi.fn(),
        append: (...nodes: HTMLElement[]) => children.push(...nodes),
        appendChild: (node: HTMLElement) => children.push(node),
        replaceChildren: (...nodes: HTMLElement[]) => {
          children.splice(0, children.length, ...nodes);
        },
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        remove: vi.fn(() => {
          const index = bodyChildren.indexOf(element as unknown as HTMLElement);
          if (index >= 0) bodyChildren.splice(index, 1);
        }),
      };
      return element;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const pdfWindow = {
    document,
    innerWidth: 800,
    innerHeight: 600,
    focus: vi.fn(),
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (task: () => void) => {
      animationFrameTasks.push(task);
      return animationFrameTasks.length;
    },
    cancelAnimationFrame: vi.fn(),
    setInterval: (task: () => void) => {
      intervalTasks.push(task);
      return 1;
    },
  } as unknown as PdfWindow;
  document.defaultView = pdfWindow;
  const readerWindow = { document } as unknown as Window;
  const cloneInto = vi.fn(<T>(value: T) => value);
  Reflect.set(globalThis, 'Components', { utils: { cloneInto } });
  Reflect.set(globalThis, 'Services', { focus: { focusedWindow: pdfWindow } });
  const ownerWindow = {} as _ZoteroTypes.MainWindow;
  const reader = {
    _iframeWindow: readerWindow,
    _window: ownerWindow,
    _internalReader: {
      ...internal,
      _primaryView: internal._primaryView ?? { _iframeWindow: pdfWindow },
    },
  } as ReaderRuntime;
  const controller = {
    dependencies: {
      preferences: {
        has: (key: string) => Object.hasOwn(preferenceValues, key),
        get: (key: string, fallback: boolean | number | string) =>
          preferenceValues[key] ?? fallback,
        set: () => {},
      },
      logger: {
        debug: (message: string) => debug.push(message),
        diagnostic: (message: string) => diagnostics.push(message),
      },
      delegateMain,
      openCommandPalette,
    },
  };
  const session = new ReaderSession({
    controller,
    reader,
    firstPdfWindow: pdfWindow,
    bindings: () => bindings,
    release: () => {},
  } as unknown as ConstructorParameters<typeof ReaderSession>[0]);
  const indicator = {
    style: { display: '', color: '', background: '' },
    textContent: '',
    remove: vi.fn(),
  } as unknown as HTMLElement;
  session.state.indicator = indicator;
  return {
    session,
    indicator,
    debug,
    diagnostics,
    pdfWindow,
    readerWindow,
    reader,
    cloneInto,
    bodyChildren,
    animationFrameTasks,
    intervalTasks,
  };
}

function readerKey(
  key: string,
  options: { readonly ctrl?: boolean; readonly target?: EventTarget | null } = {},
) {
  const preventDefault = vi.fn();
  const stopImmediatePropagation = vi.fn();
  return {
    event: {
      key,
      ctrlKey: options.ctrl ?? false,
      metaKey: false,
      altKey: false,
      target: options.target ?? null,
      preventDefault,
      stopImmediatePropagation,
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent,
    preventDefault,
    stopImmediatePropagation,
    stopPropagation: vi.fn(),
  };
}

function controlKey(key: string, target: EventTarget | null = null) {
  return readerKey(key, { ctrl: true, target });
}

type SmoothMode = 'step' | 'follow' | 'trapezoid';
const smoothPreferences = (
  mode: SmoothMode,
): Readonly<Record<string, boolean | number | string>> => ({
  'scroll.mode': mode,
  'smoothScroll.followSpeed': 1200,
  'smoothScroll.initialSpeed': 900,
  'smoothScroll.maxSpeed': 2400,
  'smoothScroll.acceleration': 1000,
  'smoothScroll.deceleration': 500,
  'smoothScroll.stopOnRelease': false,
});

function smoothSession(
  mode: SmoothMode,
  internal: InternalReaderRuntime = {},
  bindings: BindingMap = DEFAULT_BINDINGS,
  delegateMain: ReaderControllerDependencies['delegateMain'] = () => {},
) {
  const created = createHistorySession(
    internal,
    delegateMain,
    bindings,
    () => {},
    smoothPreferences(mode),
  );
  const container = { scrollBy: vi.fn() } as unknown as HTMLElement;
  Reflect.set(created.pdfWindow, 'PDFViewerApplication', { pdfViewer: { container } });
  return { ...created, container };
}

type SmoothTestSession = {
  readonly session: ReaderSession;
  readonly pdfWindow: PdfWindow;
  readonly animationFrameTasks: (() => void)[];
};

function releaseSmoothHold(created: SmoothTestSession, key: string) {
  const event = readerKey(key);
  const session = created.session as unknown as {
    handleKeyUp(event: KeyboardEvent): void;
  };
  session.handleKeyUp.call(created.session, event.event);
  return event;
}

function runSmoothFrame(created: SmoothTestSession, timestamp: number): void {
  const frame = created.animationFrameTasks.shift() as ((timestamp: number) => void) | undefined;
  frame?.(timestamp);
}

type ActionExecutorSession = {
  executeAction: (action: string, count: number, window: PdfWindow) => void;
};

function executeReaderAction(session: ReaderSession, action: string, pdfWindow: PdfWindow): void {
  const executable = session as unknown as ActionExecutorSession;
  executable.executeAction(action, 1, pdfWindow);
}
type ViewReleaseSession = {
  releaseViewTheme: (pdfWindow: PdfWindow) => void;
};

function releaseReaderView(session: ReaderSession, pdfWindow: PdfWindow): void {
  const releaser = session as unknown as ViewReleaseSession;
  releaser.releaseViewTheme(pdfWindow);
}
function linkPosition(rect: readonly number[], pageIndex = 0): ReaderLinkPosition {
  return { pageIndex, rects: [rect] };
}

function internalLink(
  rect: readonly number[],
  destinationPage = 1,
): Extract<ReaderLinkOverlay, { readonly type: 'internal-link' }> {
  return {
    type: 'internal-link',
    position: linkPosition(rect),
    destinationPosition: linkPosition([0, 0, 0, 0], destinationPage),
  };
}

function citationLink(
  rect: readonly number[],
  destinationPage = 1,
  destinationRect: readonly number[] = [0, 0, 0, 0],
): Extract<ReaderLinkOverlay, { readonly type: 'citation' }> {
  return {
    type: 'citation',
    position: linkPosition(rect),
    references: [{ position: linkPosition(destinationRect, destinationPage) }],
  };
}
function externalLink(
  rect: readonly number[],
  url: string,
): Extract<ReaderLinkOverlay, { readonly type: 'external-link' }> {
  return {
    type: 'external-link',
    position: linkPosition(rect),
    url,
  };
}

function configureLinkView(
  created: ReturnType<typeof createHistorySession>,
  overlays: readonly unknown[],
) {
  const view = created.reader._internalReader?._primaryView;
  if (!view) throw new Error('Expected a primary reader view');
  const navigate = vi.fn();
  const openLink = vi.fn();
  Reflect.set(view, '_pdfPages', { 0: { overlays } });
  Reflect.set(view, 'getClientRectForPopup', (position: ReaderLinkPosition) => position.rects[0]);
  Reflect.set(view, 'navigate', navigate);
  Reflect.set(view, '_onOpenLink', openLink);
  return { view, navigate, openLink };
}

function linkHintElements(created: ReturnType<typeof createHistorySession>): HTMLElement[] {
  return created.bodyChildren.filter((node) => node.dataset.zoteroNeoLinkHint === '1');
}

function destinationCueElement(
  created: ReturnType<typeof createHistorySession>,
): HTMLElement | null {
  return created.bodyChildren.find((node) => node.dataset.zoteroNeoDestinationCue === '1') ?? null;
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

  it('suppresses Zotero key forwarding only for bound reader commands', () => {
    const originalKeyDown = vi.fn();
    const created = createHistorySession();
    const view = created.reader._internalReader?._primaryView;
    if (!view) throw new Error('Expected a primary reader view');
    view._onKeyDown = originalKeyDown;

    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();

    view._onKeyDown?.(controlKey('o').event);
    view._onKeyDown?.(readerKey('f').event);
    view._onKeyDown?.(readerKey('3').event);

    created.session.focusAndHandle(readerKey(' ').event);
    view._onKeyDown?.(readerKey('t').event);
    view._onKeyDown?.(controlKey('x').event);
    view._onKeyDown?.(controlKey('h').event);
    expect(originalKeyDown).toHaveBeenCalledTimes(2);
    expect(originalKeyDown).toHaveBeenNthCalledWith(1, expect.objectContaining({ key: 'x' }));
    expect(originalKeyDown).toHaveBeenNthCalledWith(2, expect.objectContaining({ key: 'h' }));
    created.session.dispose();
  });
});
describe('reader keymap forwarding', () => {
  it('consumes new tab and pan chords while forwarding retired J/K keys', () => {
    const originalKeyDown = vi.fn();
    const delegateMain = vi.fn<ReaderControllerDependencies['delegateMain']>();
    const created = createHistorySession({}, delegateMain);
    const container = { scrollBy: vi.fn() } as unknown as HTMLElement;
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', { pdfViewer: { container } });
    const view = created.reader._internalReader?._primaryView;
    if (!view) throw new Error('Expected a primary reader view');
    view._onKeyDown = originalKeyDown;
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();

    const press = (key: string) => {
      const event = readerKey(key);
      view._onKeyDown?.(event.event);
      created.session.focusAndHandle(event.event);
      return event;
    };
    const previous = press('H');
    const next = press('L');
    const oldPrevious = press('J');
    const oldNext = press('K');
    press('z');
    press('h');

    expect(delegateMain).toHaveBeenNthCalledWith(1, 'previousTab', 0, created.reader._window);
    expect(delegateMain).toHaveBeenNthCalledWith(2, 'nextTab', 0, created.reader._window);
    expect(previous.preventDefault).toHaveBeenCalledOnce();
    expect(next.preventDefault).toHaveBeenCalledOnce();
    expect(originalKeyDown).toHaveBeenCalledTimes(2);
    expect(container.scrollBy).toHaveBeenCalledWith(-2000 / 120, 0);
    expect(originalKeyDown).toHaveBeenNthCalledWith(1, expect.objectContaining({ key: 'J' }));
    expect(originalKeyDown).toHaveBeenNthCalledWith(2, expect.objectContaining({ key: 'K' }));
    expect(created.session.state.keyBuffer).toBe('');
    created.session.dispose();
  });
});
describe('reader zoom shortcuts', () => {
  it('dispatches zoom commands and repeats count prefixes', () => {
    const zoomIn = vi.fn();
    const zoomOut = vi.fn();
    const created = createHistorySession({ zoomIn, zoomOut });
    const zoomInKey = readerKey('+');
    created.session.focusAndHandle(zoomInKey.event);
    created.session.focusAndHandle(readerKey('3').event);
    const zoomOutKey = readerKey('-');
    created.session.focusAndHandle(zoomOutKey.event);

    expect(zoomIn).toHaveBeenCalledOnce();
    expect(zoomOut).toHaveBeenCalledTimes(3);
    expect(zoomInKey.preventDefault).toHaveBeenCalledOnce();
    expect(zoomOutKey.preventDefault).toHaveBeenCalledOnce();
    created.session.dispose();
  });

  it('supports Zathura zoom aliases and resets once regardless of count', () => {
    const zoomIn = vi.fn();
    const zoomOut = vi.fn();
    const zoomReset = vi.fn();
    const created = createHistorySession({ zoomIn, zoomOut, zoomReset });
    const press = (key: string): void => created.session.focusAndHandle(readerKey(key).event);

    press('3');
    press('z');
    press('I');
    press('2');
    press('z');
    press('O');
    press('4');
    press('=');
    press('3');
    press('z');
    press('0');

    expect(zoomIn).toHaveBeenCalledTimes(3);
    expect(zoomOut).toHaveBeenCalledTimes(2);
    expect(zoomReset).toHaveBeenCalledTimes(2);
    created.session.dispose();
  });

  it('fails closed when the host zoom APIs are unavailable or throw', () => {
    vi.useFakeTimers();
    const missing = createHistorySession();
    const missingKey = readerKey('+');
    expect(() => missing.session.focusAndHandle(missingKey.event)).not.toThrow();
    expect(missing.indicator.textContent).toBe('Zoom unavailable');

    const missingReset = createHistorySession();
    const missingResetKey = readerKey('=');
    expect(() => missingReset.session.focusAndHandle(missingResetKey.event)).not.toThrow();
    expect(missingReset.indicator.textContent).toBe('Zoom unavailable');

    const failed = createHistorySession({
      zoomOut: () => {
        throw new Error('reader reloaded');
      },
    });
    expect(() => failed.session.focusAndHandle(readerKey('-').event)).not.toThrow();
    expect(failed.indicator.textContent).toBe('Zoom unavailable');
    expect(failed.debug).toEqual(['reader zoom out failed: Error: reader reloaded']);

    const failedReset = createHistorySession({
      zoomReset: () => {
        throw new Error('reader reloaded');
      },
    });
    expect(() => failedReset.session.focusAndHandle(readerKey('=').event)).not.toThrow();
    expect(failedReset.indicator.textContent).toBe('Zoom unavailable');
    expect(failedReset.debug).toEqual(['reader zoom reset failed: Error: reader reloaded']);
    expect(missingKey.preventDefault).toHaveBeenCalledOnce();
    expect(missingResetKey.preventDefault).toHaveBeenCalledOnce();
    missing.session.dispose();
    missingReset.session.dispose();
    failed.session.dispose();
    failedReset.session.dispose();
    vi.clearAllTimers();
  });

  it('leaves zoom keys native in Insert mode and editable controls', () => {
    const zoomIn = vi.fn();
    const zoomReset = vi.fn();
    const created = createHistorySession({ zoomIn, zoomReset });
    created.session.state.mode = 'insert';
    const insert = readerKey('+');
    created.session.focusAndHandle(insert.event);

    const input = { tagName: 'INPUT', localName: 'input' } as unknown as EventTarget;
    created.session.state.mode = 'normal';
    const editable = readerKey('=', { target: input });
    created.session.focusAndHandle(editable.event);

    expect(zoomIn).not.toHaveBeenCalled();
    expect(zoomReset).not.toHaveBeenCalled();
    expect(insert.preventDefault).not.toHaveBeenCalled();
    expect(editable.preventDefault).not.toHaveBeenCalled();
    created.session.dispose();
  });

  it('keeps zoom inside the Outline overlay until Escape closes it', () => {
    const zoomIn = vi.fn();
    const zoomOut = vi.fn();
    const zoomReset = vi.fn();
    const created = createHistorySession({ zoomIn, zoomOut, zoomReset });
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);

    const plusWhileOpen = readerKey('+');
    const minusWhileOpen = readerKey('-');
    const resetWhileOpen = readerKey('=');
    created.session.focusAndHandle(plusWhileOpen.event);
    created.session.focusAndHandle(minusWhileOpen.event);
    created.session.focusAndHandle(resetWhileOpen.event);

    expect(zoomIn).not.toHaveBeenCalled();
    expect(zoomOut).not.toHaveBeenCalled();
    expect(zoomReset).not.toHaveBeenCalled();
    expect(plusWhileOpen.preventDefault).toHaveBeenCalledOnce();
    expect(plusWhileOpen.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(minusWhileOpen.preventDefault).toHaveBeenCalledOnce();
    expect(minusWhileOpen.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(resetWhileOpen.preventDefault).toHaveBeenCalledOnce();
    expect(resetWhileOpen.stopImmediatePropagation).toHaveBeenCalledOnce();

    const modifier = readerKey('Control');
    created.session.focusAndHandle(modifier.event);
    expect(modifier.preventDefault).not.toHaveBeenCalled();

    const escape = readerKey('Escape');
    created.session.focusAndHandle(escape.event);
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');

    created.session.focusAndHandle(readerKey('+').event);
    created.session.focusAndHandle(readerKey('-').event);
    created.session.focusAndHandle(readerKey('=').event);
    expect(zoomIn).toHaveBeenCalledOnce();
    expect(zoomOut).toHaveBeenCalledOnce();
    expect(zoomReset).toHaveBeenCalledOnce();
    created.session.dispose();
  });

  it('consumes zoom shortcuts before Zotero reader forwarding', () => {
    const originalKeyDown = vi.fn();
    const zoomIn = vi.fn();
    const zoomOut = vi.fn();
    const zoomReset = vi.fn();
    const created = createHistorySession({ zoomIn, zoomOut, zoomReset });
    const view = created.reader._internalReader?._primaryView;
    if (!view) throw new Error('Expected a primary reader view');
    view._onKeyDown = originalKeyDown;
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();

    view._onKeyDown?.(readerKey('+').event);
    view._onKeyDown?.(readerKey('-').event);
    view._onKeyDown?.(readerKey('=').event);
    view._onKeyDown?.(readerKey(':').event);
    view._onKeyDown?.(readerKey('J').event);
    view._onKeyDown?.(readerKey('K').event);
    const advanceThroughReader = (key: string): void => {
      const press = readerKey(key);
      view._onKeyDown?.(press.event);
      created.session.focusAndHandle(press.event);
    };
    advanceThroughReader('z');
    advanceThroughReader('I');
    advanceThroughReader('z');
    advanceThroughReader('O');
    advanceThroughReader('z');
    advanceThroughReader('0');

    expect(zoomIn).toHaveBeenCalledOnce();
    expect(zoomOut).toHaveBeenCalledOnce();
    expect(zoomReset).toHaveBeenCalledOnce();
    expect(originalKeyDown).toHaveBeenCalledTimes(2);
    created.session.dispose();
  });
  it('leaves colon native when a custom resolved map removes the default binding', () => {
    const originalKeyDown = vi.fn();
    const bindings = Object.fromEntries(
      Object.entries(DEFAULT_BINDINGS).filter(([key]) => key !== 'reader-normal::'),
    ) as BindingMap;
    const created = createHistorySession({}, () => {}, bindings);
    const view = created.reader._internalReader?._primaryView;
    if (!view) throw new Error('Expected a primary reader view');
    view._onKeyDown = originalKeyDown;
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();

    view._onKeyDown?.(readerKey(':').event);

    expect(originalKeyDown).toHaveBeenCalledOnce();
    created.session.dispose();
  });
});

describe('Reader-origin main delegation', () => {
  it('passes the Reader runtime owner window with picker-opening actions', () => {
    const delegateMain = vi.fn<ReaderControllerDependencies['delegateMain']>();
    const created = createHistorySession({}, delegateMain);

    created.session.focusAndHandle(readerKey(' ').event);
    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('f').event);

    expect(delegateMain).toHaveBeenCalledWith('findAllItems', 0, created.reader._window);
    created.session.dispose();
  });
});
describe('reader Space-leader key guide', () => {
  it('updates nested prefixes, returns with Backspace, and closes on invalid input or Escape', () => {
    vi.useFakeTimers();
    const created = createHistorySession();

    created.session.focusAndHandle(readerKey(' ').event);
    expect(created.bodyChildren).toHaveLength(0);
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.defaultDelayMs);
    expect(created.bodyChildren).toHaveLength(1);
    expect(created.bodyChildren[0]?.id).toBe('zotero-neo-key-guide');

    created.session.focusAndHandle(readerKey('f').event);
    expect(created.bodyChildren).toHaveLength(1);
    const backspace = readerKey('Backspace');
    created.session.focusAndHandle(backspace.event);
    expect(created.bodyChildren).toHaveLength(1);
    expect(backspace.preventDefault).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('x').event);
    expect(created.bodyChildren).toHaveLength(0);

    created.session.focusAndHandle(readerKey(' ').event);
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.defaultDelayMs);
    const escape = readerKey('Escape');
    created.session.focusAndHandle(escape.event);
    expect(created.bodyChildren).toHaveLength(0);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    created.session.dispose();
  });
});
describe('Reader command palette', () => {
  it('opens from Reader Normal, routes active-split local actions, and preserves owner delegation', () => {
    const delegateMain = vi.fn<ReaderControllerDependencies['delegateMain']>();
    const zoomIn = vi.fn(function (this: InternalReaderRuntime) {
      expect(this._lastViewPrimary).toBe(false);
    });
    const paletteRef: { value: CommandPaletteContext | null } = { value: null };
    const created = createHistorySession(
      { _lastViewPrimary: false, zoomIn },
      delegateMain,
      DEFAULT_BINDINGS,
      (_window, context) => {
        paletteRef.value = context;
      },
    );
    const secondary = { ...created.pdfWindow, focus: vi.fn() } as unknown as PdfWindow;
    Reflect.set(created.reader._internalReader, '_secondaryView', { _iframeWindow: secondary });

    created.session.focusAndHandle(readerKey('3').event);
    const colon = readerKey(':');
    created.session.focusAndHandle(colon.event);
    expect(colon.preventDefault).toHaveBeenCalledOnce();
    const palette = paletteRef.value;
    if (!palette) throw new Error('Expected a Reader command palette context');
    expect(palette.mode).toBe('normal');
    expect(palette.actions).toContain('switchTab');
    expect(palette.actions).not.toContain('mainTrashItems');
    expect(palette.actions).not.toContain('mainOpenPDF');
    expect(palette.actions).not.toContain('mainActivate');

    palette.execute('zoomIn', 123);
    expect(zoomIn).toHaveBeenCalledOnce();
    palette.execute('mainTrashItems', 123);
    expect(delegateMain).not.toHaveBeenCalled();
    palette.execute('findAllItems', 123);
    expect(delegateMain).toHaveBeenCalledWith('findAllItems', 0, created.reader._window);

    Reflect.set(created.reader._internalReader, '_primaryView', undefined);
    Reflect.set(created.reader._internalReader, '_secondaryView', undefined);
    palette.execute('zoomIn', 123);
    expect(zoomIn).toHaveBeenCalledOnce();
    expect(delegateMain).toHaveBeenCalledOnce();
    Reflect.set(created.reader._internalReader, '_primaryView', {
      _iframeWindow: created.pdfWindow,
    });
    created.session.dispose();
    palette.execute('zoomIn', 123);
    palette.execute('switchTab', 123);
    expect(zoomIn).toHaveBeenCalledOnce();
    expect(delegateMain).toHaveBeenCalledOnce();
  });
});
describe('Reader leader timer guards', () => {
  it('executes only current ambiguous leader transitions', () => {
    vi.useFakeTimers();
    const delegateMain = vi.fn<ReaderControllerDependencies['delegateMain']>();
    const bindings: BindingMap = {
      'reader-normal:<Space>f': 'findAllItems',
      'reader-normal:<Space>ff': 'switchTab',
    };
    const created = createHistorySession({}, delegateMain, bindings);
    const press = (key: string): void => created.session.focusAndHandle(readerKey(key).event);

    press(' ');
    press('f');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(delegateMain).toHaveBeenCalledTimes(1);
    expect(delegateMain).toHaveBeenLastCalledWith('findAllItems', 0, created.reader._window);

    press(' ');
    press('f');
    press('z');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(delegateMain).toHaveBeenCalledTimes(1);

    press(' ');
    press('f');
    press('Escape');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(delegateMain).toHaveBeenCalledTimes(1);

    press(' ');
    press('f');
    press('Backspace');
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(delegateMain).toHaveBeenCalledTimes(1);

    press(' ');
    press('f');
    created.session.dispose();
    vi.advanceTimersByTime(KEY_GUIDE_CONFIG.idleTimeoutMs);
    expect(delegateMain).toHaveBeenCalledTimes(1);
  });
});

describe('reader H/L tab and zh/zl pan defaults', () => {
  it('switches tabs horizontally, pans with counts, and leaves J/K native', () => {
    const delegateMain = vi.fn<ReaderControllerDependencies['delegateMain']>();
    const created = createHistorySession({}, delegateMain);
    const container = { scrollBy: vi.fn() } as unknown as HTMLElement;
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfViewer: { container },
    });

    const previousTab = readerKey('H');
    const nextTab = readerKey('L');
    created.session.focusAndHandle(previousTab.event);
    created.session.focusAndHandle(nextTab.event);
    expect(delegateMain).toHaveBeenNthCalledWith(1, 'previousTab', 0, created.reader._window);
    expect(delegateMain).toHaveBeenNthCalledWith(2, 'nextTab', 0, created.reader._window);
    expect(container.scrollBy).not.toHaveBeenCalled();

    created.session.focusAndHandle(readerKey('3').event);
    created.session.focusAndHandle(readerKey('z').event);
    const left = readerKey('h');
    created.session.focusAndHandle(left.event);
    expect(container.scrollBy).toHaveBeenCalledWith(-180, 0);
    expect(left.preventDefault).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('2').event);
    created.session.focusAndHandle(readerKey('z').event);
    const right = readerKey('l');
    created.session.focusAndHandle(right.event);
    expect(container.scrollBy).toHaveBeenCalledWith(120, 0);
    expect(right.preventDefault).toHaveBeenCalledOnce();

    const oldPrevious = readerKey('J');
    const oldNext = readerKey('K');
    created.session.focusAndHandle(oldPrevious.event);
    created.session.focusAndHandle(oldNext.event);
    expect(oldPrevious.preventDefault).not.toHaveBeenCalled();
    expect(oldNext.preventDefault).not.toHaveBeenCalled();
    expect(delegateMain).toHaveBeenCalledTimes(2);
    created.session.dispose();
  });
});

describe('Reader smooth horizontal pan', () => {
  it('starts follow holds for zh/zl and consumes continuation repeats until keyup', () => {
    for (const [continuation, direction] of [
      ['h', -1],
      ['l', 1],
    ] as const) {
      const previousPage = vi.fn();
      const nextPage = vi.fn();
      const created = smoothSession('follow', {
        navigateToPreviousPage: previousPage,
        navigateToNextPage: nextPage,
      });

      created.session.focusAndHandle(readerKey('z').event);
      const first = readerKey(continuation);
      created.session.focusAndHandle(first.event);
      expect(created.container.scrollBy).toHaveBeenCalledWith(direction * 10, 0);
      expect(created.animationFrameTasks).toHaveLength(1);

      const repeat = readerKey(continuation);
      created.session.focusAndHandle(repeat.event);
      expect(repeat.preventDefault).toHaveBeenCalledOnce();
      expect(created.container.scrollBy).toHaveBeenCalledTimes(1);
      expect(previousPage).not.toHaveBeenCalled();
      expect(nextPage).not.toHaveBeenCalled();

      releaseSmoothHold(created, continuation);
      runSmoothFrame(created, 16);
      expect(created.container.scrollBy).toHaveBeenCalledTimes(1);
      created.session.dispose();
    }
  });

  it('keeps trapezoid release moving while repeat keydown does not restart the curve', () => {
    const created = smoothSession('trapezoid');
    created.session.focusAndHandle(readerKey('z').event);
    created.session.focusAndHandle(readerKey('l').event);
    expect(created.container.scrollBy).toHaveBeenNthCalledWith(1, 7.5, 0);

    runSmoothFrame(created, 16);
    expect(created.container.scrollBy).toHaveBeenCalledTimes(2);

    const repeat = readerKey('l');
    created.session.focusAndHandle(repeat.event);
    expect(repeat.preventDefault).toHaveBeenCalledOnce();
    expect(created.container.scrollBy).toHaveBeenCalledTimes(2);

    releaseSmoothHold(created, 'l');
    runSmoothFrame(created, 32);
    expect(created.container.scrollBy).toHaveBeenCalledTimes(3);
    created.session.dispose();
  });

  it('keeps counted chords and step mode as immediate discrete pan', () => {
    const counted = smoothSession('follow');
    counted.session.focusAndHandle(readerKey('3').event);
    counted.session.focusAndHandle(readerKey('z').event);
    counted.session.focusAndHandle(readerKey('h').event);
    expect(counted.container.scrollBy).toHaveBeenCalledWith(-180, 0);
    expect(counted.animationFrameTasks).toHaveLength(0);
    counted.session.focusAndHandle(readerKey('2').event);
    counted.session.focusAndHandle(readerKey('z').event);
    counted.session.focusAndHandle(readerKey('l').event);
    expect(counted.container.scrollBy).toHaveBeenCalledWith(120, 0);
    expect(counted.animationFrameTasks).toHaveLength(0);
    counted.session.dispose();

    const step = smoothSession('step');
    step.session.focusAndHandle(readerKey('z').event);
    step.session.focusAndHandle(readerKey('h').event);
    expect(step.container.scrollBy).toHaveBeenCalledWith(-60, 0);
    expect(step.animationFrameTasks).toHaveLength(0);
    step.session.focusAndHandle(readerKey('z').event);
    step.session.focusAndHandle(readerKey('l').event);
    expect(step.container.scrollBy).toHaveBeenCalledWith(60, 0);
    expect(step.animationFrameTasks).toHaveLength(0);
    step.session.dispose();
  });

  it('derives direct j/k and custom H/L scroll holds from their actions', () => {
    for (const [key, direction] of [
      ['j', 1],
      ['k', -1],
    ] as const) {
      const created = smoothSession('follow');
      const press = readerKey(key);
      created.session.focusAndHandle(press.event);
      expect(created.container.scrollBy).toHaveBeenCalledWith(0, direction * 10);
      expect(created.animationFrameTasks).toHaveLength(1);
      const repeat = readerKey(key);
      created.session.focusAndHandle(repeat.event);
      expect(repeat.preventDefault).toHaveBeenCalledOnce();
      expect(created.container.scrollBy).toHaveBeenCalledTimes(1);
      releaseSmoothHold(created, key);
      created.session.dispose();
    }

    const customBindings = {
      ...DEFAULT_BINDINGS,
      'reader-normal:H': 'scrollLeft',
      'reader-normal:L': 'scrollRight',
    } as BindingMap;
    for (const [key, direction] of [
      ['H', -1],
      ['L', 1],
    ] as const) {
      const created = smoothSession('follow', {}, customBindings);
      const press = readerKey(key);
      created.session.focusAndHandle(press.event);
      expect(created.container.scrollBy).toHaveBeenCalledWith(direction * 10, 0);
      expect(created.animationFrameTasks).toHaveLength(1);
      releaseSmoothHold(created, key);
      created.session.dispose();
    }

    const namedBindings = {
      ...DEFAULT_BINDINGS,
      'reader-normal:<Down>': 'scrollDown',
    } as BindingMap;
    const named = smoothSession('follow', {}, namedBindings);
    const down = readerKey('ArrowDown');
    named.session.focusAndHandle(down.event);
    expect(named.container.scrollBy).toHaveBeenCalledWith(0, 10);
    expect(named.animationFrameTasks).toHaveLength(1);
    releaseSmoothHold(named, 'ArrowDown');
    named.session.dispose();
  });
});
describe('reader split shortcuts', () => {
  it('uses the current Zotero reader split methods for Space-minus and Space-pipe', () => {
    const toggleHorizontalSplit = vi.fn();
    const toggleVerticalSplit = vi.fn();
    const created = createHistorySession({ toggleHorizontalSplit, toggleVerticalSplit });

    created.session.focusAndHandle(readerKey(' ').event);
    created.session.focusAndHandle(readerKey('-').event);
    created.session.focusAndHandle(readerKey(' ').event);
    created.session.focusAndHandle(readerKey('|').event);

    expect(toggleHorizontalSplit).toHaveBeenCalledOnce();
    expect(toggleVerticalSplit).toHaveBeenCalledOnce();
    created.session.dispose();
  });

  it('routes motions through Zotero active split state even when Gecko focus stays primary', () => {
    const zoomOut = vi.fn(function (this: InternalReaderRuntime) {
      expect(this._lastViewPrimary).toBe(true);
    });
    const zoomReset = vi.fn(function (this: InternalReaderRuntime) {
      expect(this._lastViewPrimary).toBe(false);
    });
    const created = createHistorySession({
      _state: { primary: true },
      _lastViewPrimary: true,
      zoomOut,
      zoomReset,
    });
    const internal = created.reader._internalReader ?? {};
    const focusView = vi.fn((primary = true) => {
      Reflect.set(internal, '_lastViewPrimary', primary);
      Reflect.set(internal, '_state', { primary });
    });
    Reflect.set(internal, 'focusView', focusView);
    const primaryScrollTo = vi.fn();
    const secondaryScrollTo = vi.fn();
    const primaryScrollBy = vi.fn();
    const secondaryScrollBy = vi.fn();
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfViewer: {
        container: {
          clientHeight: 600,
          scrollHeight: 2400,
          scrollTo: primaryScrollTo,
          scrollBy: primaryScrollBy,
        } as unknown as HTMLElement,
      },
    });
    const secondary = {
      ...created.pdfWindow,
      focus: vi.fn(),
      PDFViewerApplication: {
        pdfViewer: {
          container: {
            clientHeight: 600,
            scrollHeight: 2400,
            scrollTo: secondaryScrollTo,
            scrollBy: secondaryScrollBy,
          } as unknown as HTMLElement,
        },
      },
    } as unknown as PdfWindow;
    Reflect.set(internal, '_secondaryView', { _iframeWindow: secondary });
    Reflect.set(internal, 'splitType', 'vertical');

    const right = controlKey('l');
    created.session.focusAndHandle(right.event);
    expect(focusView).toHaveBeenLastCalledWith(false);
    expect(right.preventDefault).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('z').event);
    created.session.focusAndHandle(readerKey('0').event);
    expect(zoomReset).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('G').event);
    expect(secondaryScrollTo).toHaveBeenCalledWith(0, 1800);
    expect(primaryScrollTo).not.toHaveBeenCalled();

    created.session.focusAndHandle(readerKey('j').event);
    created.session.focusAndHandle(readerKey('k').event);
    created.session.focusAndHandle(controlKey('d').event);
    created.session.focusAndHandle(controlKey('u').event);
    expect(secondaryScrollBy).toHaveBeenCalledTimes(4);
    expect(primaryScrollBy).not.toHaveBeenCalled();

    const rightEdge = controlKey('l');
    created.session.focusAndHandle(rightEdge.event);
    expect(focusView).toHaveBeenCalledTimes(1);
    expect(rightEdge.preventDefault).not.toHaveBeenCalled();

    created.session.focusAndHandle(controlKey('h').event);
    expect(focusView).toHaveBeenLastCalledWith(true);
    created.session.focusAndHandle(readerKey('-').event);
    expect(zoomOut).toHaveBeenCalledOnce();

    Reflect.set(internal, 'splitType', 'horizontal');
    created.session.focusAndHandle(controlKey('j').event);
    expect(focusView).toHaveBeenLastCalledWith(false);
    created.session.focusAndHandle(controlKey('k').event);
    expect(focusView).toHaveBeenLastCalledWith(true);
    created.session.dispose();
  });

  it('moves right from the reader into Zotero context notes when no split target exists', () => {
    const focusContext = vi.fn();
    const created = createHistorySession();
    Reflect.set(created.reader, '_window', { ZoteroContextPane: { focus: focusContext } });
    const right = controlKey('l');

    created.session.focusAndHandle(right.event);

    expect(focusContext).toHaveBeenCalledOnce();
    expect(right.preventDefault).toHaveBeenCalledOnce();
    const left = controlKey('h');
    created.session.focusAndHandle(left.event);
    expect(left.preventDefault).not.toHaveBeenCalled();
    created.session.dispose();
  });
});

describe('reader sidebar coordination', () => {
  it('replaces Outline with Marks and restores focus once on close', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');

    created.session.focusAndHandle(readerKey('Escape').event);
    vi.advanceTimersByTime(30);
    expect(created.pdfWindow.focus).toHaveBeenCalledTimes(2);
    created.session.dispose();
  });

  it('reopens Marks immediately after Escape closes the explorer', () => {
    const created = createHistorySession();
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');

    created.session.focusAndHandle(readerKey('Escape').event);
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-marks-explorer');

    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');
    created.session.dispose();
  });

  it('toggles open Outline and Marks with their default Space-leader shortcuts', () => {
    for (const [key, overlayID] of [
      ['e', 'zv-outline-explorer'],
      ['m', 'zv-marks-explorer'],
    ] as const) {
      const created = createHistorySession();
      created.session.focusAndHandle(readerKey(' ').event);
      created.session.focusAndHandle(readerKey(key).event);
      expect(created.bodyChildren.map((node) => node.id)).toContain(overlayID);

      const prefix = readerKey(' ');
      created.session.focusAndHandle(prefix.event);
      expect(prefix.preventDefault).toHaveBeenCalledOnce();
      expect(created.bodyChildren.map((node) => node.id)).toContain(overlayID);

      const close = readerKey(key);
      created.session.focusAndHandle(close.event);
      expect(close.preventDefault).toHaveBeenCalledOnce();
      expect(created.bodyChildren.map((node) => node.id)).not.toContain(overlayID);
      created.session.dispose();
    }
  });

  it('uses remapped toggle bindings while a Reader sidebar owns input', () => {
    const bindings = {
      ...Object.fromEntries(
        Object.entries(DEFAULT_BINDINGS).filter(
          ([binding]) =>
            binding !== 'reader-normal:<Space>e' && binding !== 'reader-normal:<Space>m',
        ),
      ),
      'reader-normal:q': 'toggleReaderSidebarOutline',
      'reader-normal:w': 'toggleMarksExplorer',
    } as BindingMap;
    const created = createHistorySession({}, () => {}, bindings);

    created.session.focusAndHandle(readerKey('q').event);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    created.session.focusAndHandle(readerKey('q').event);
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');

    created.session.focusAndHandle(readerKey('w').event);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');
    created.session.focusAndHandle(readerKey('w').event);
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-marks-explorer');
    created.session.dispose();
  });

  it('returns a failed sidebar toggle prefix to local sidebar input', () => {
    const scrollBy = vi.fn();
    const created = createHistorySession();
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfViewer: { container: { scrollBy } },
    });
    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);

    created.session.focusAndHandle(readerKey(' ').event);
    created.session.focusAndHandle(readerKey('j').event);

    expect(scrollBy).not.toHaveBeenCalled();
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    created.session.dispose();
  });

  it('coordinates Marks replacement when focusing Outline and restores focus on disposal', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');
    executeReaderAction(created.session, 'focusReaderSidebar', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-marks-explorer');

    created.session.dispose();
    vi.advanceTimersByTime(30);
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
    expect(created.bodyChildren).toHaveLength(0);
  });
});

describe('reader outline load invalidation', () => {
  it('does not resurrect a closed Outline after pending load resolves', async () => {
    vi.useFakeTimers();
    let resolveOutline!: (value: unknown[]) => void;
    const pending = new Promise<unknown[]>((resolve) => {
      resolveOutline = resolve;
    });
    const created = createHistorySession();
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfDocument: { getOutline: () => pending },
    });

    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');
    created.session.focusAndHandle(readerKey('Escape').event);
    vi.advanceTimersByTime(30);
    const focusCount = vi.mocked(created.pdfWindow.focus).mock.calls.length;
    resolveOutline([]);
    await Promise.resolve();
    await Promise.resolve();

    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');
    expect(created.pdfWindow.focus).toHaveBeenCalledTimes(focusCount);
    created.session.dispose();
  });

  it('does not resurrect a released PDF view Outline after pending load resolves', async () => {
    vi.useFakeTimers();
    let resolveOutline!: (value: unknown[]) => void;
    const pending = new Promise<unknown[]>((resolve) => {
      resolveOutline = resolve;
    });
    const created = createHistorySession();
    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {
      pdfDocument: { getOutline: () => pending },
    });

    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);
    releaseReaderView(created.session, created.pdfWindow);
    resolveOutline([]);
    await Promise.resolve();
    await Promise.resolve();

    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');
    vi.advanceTimersByTime(30);
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
    created.session.dispose();
  });
});

describe('PDF follow-link hints', () => {
  it('follows visible links and shows Zotero-preview-style point and rectangle cues', () => {
    vi.useFakeTimers();
    const created = createHistorySession();
    const internal = internalLink([20, 30, 80, 50], 4);
    const external = externalLink([100, 120, 180, 140], 'https://example.com');
    const citation = citationLink([200, 200, 260, 220], 8, [300, 320, 380, 340]);
    const configured = configureLinkView(created, [
      internal,
      internal,
      external,
      citation,
      internalLink([900, 30, 950, 50]),
    ]);
    const open = readerKey('f');

    created.session.focusAndHandle(open.event);

    expect(linkHintElements(created).map((badge) => badge.textContent)).toEqual(['A', 'S', 'D']);
    expect(created.bodyChildren).toHaveLength(3);
    expect(open.preventDefault).toHaveBeenCalledOnce();
    expect(open.stopImmediatePropagation).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('a').event);
    expect(created.cloneInto).toHaveBeenNthCalledWith(
      1,
      { position: internal.destinationPosition },
      created.readerWindow,
    );
    expect(configured.navigate).toHaveBeenNthCalledWith(1, {
      position: internal.destinationPosition,
    });
    created.animationFrameTasks.shift()?.();
    const pointCue = destinationCueElement(created);
    expect(pointCue?.style.cssText).toContain('background:#f57b7b');
    expect(pointCue?.style.cssText).toContain('mix-blend-mode:multiply');
    expect(pointCue?.style.width).toBe('14px');
    expect(pointCue?.style.height).toBe('14px');
    expect(pointCue?.style.borderRadius).toBe('50%');

    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('s').event);
    expect(configured.openLink).toHaveBeenCalledWith('https://example.com');
    expect(destinationCueElement(created)).toBeNull();

    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('d').event);
    expect(created.cloneInto).toHaveBeenNthCalledWith(
      2,
      { position: citation.references[0]!.position },
      created.readerWindow,
    );
    expect(configured.navigate).toHaveBeenNthCalledWith(2, {
      position: citation.references[0]!.position,
    });
    created.animationFrameTasks.shift()?.();
    const rectangleCue = destinationCueElement(created);
    expect(rectangleCue?.style.left).toBe('300px');
    expect(rectangleCue?.style.top).toBe('320px');
    expect(rectangleCue?.style.width).toBe('80px');
    expect(rectangleCue?.style.height).toBe('20px');
    expect(rectangleCue?.style.borderRadius).toBe('0');

    vi.advanceTimersByTime(2000);
    expect(destinationCueElement(created)).toBeNull();
    expect(created.bodyChildren).toHaveLength(0);
    created.session.dispose();
  });

  it('uses the active secondary PDF view for split-reader navigation', () => {
    const created = createHistorySession();
    const primary = created.reader._internalReader?._primaryView;
    const internal = created.reader._internalReader;
    if (!primary || !internal) throw new Error('Expected reader views');
    Reflect.set(primary, '_iframeWindow', {} as Window);
    const navigate = vi.fn();
    const secondary = {
      _iframeWindow: created.pdfWindow,
      _pdfPages: { 0: { overlays: [internalLink([10, 10, 40, 30], 7)] } },
      getClientRectForPopup: (position: ReaderLinkPosition) => position.rects[0],
      navigate,
    } as ReaderViewRuntime;
    Reflect.set(internal, '_secondaryView', secondary);

    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('a').event);

    expect(navigate).toHaveBeenCalledWith({
      position: linkPosition([0, 0, 0, 0], 7),
    });
  });

  it('keeps more than one alphabet of hints reachable and cleans up on Backspace and Escape', () => {
    const created = createHistorySession();
    const overlays = Array.from({ length: 27 }, (_, index) =>
      internalLink(
        [
          10 + (index % 9) * 70,
          20 + Math.floor(index / 9) * 80,
          50 + (index % 9) * 70,
          40 + Math.floor(index / 9) * 80,
        ],
        index + 1,
      ),
    );
    const { navigate } = configureLinkView(created, overlays);

    created.session.focusAndHandle(readerKey('f').event);

    expect(new Set(linkHintElements(created).map((badge) => badge.textContent)).size).toBe(27);
    expect(linkHintElements(created).every((badge) => (badge.textContent ?? '').length === 2)).toBe(
      true,
    );

    created.session.focusAndHandle(readerKey('a').event);
    expect(navigate).not.toHaveBeenCalled();
    expect(linkHintElements(created).filter((badge) => !badge.hidden)).toHaveLength(26);

    created.session.focusAndHandle(readerKey('Backspace').event);
    expect(linkHintElements(created).every((badge) => !badge.hidden)).toBe(true);

    const escape = readerKey('Escape');
    created.session.focusAndHandle(escape.event);
    expect(linkHintElements(created)).toHaveLength(0);
    expect(created.bodyChildren).toHaveLength(0);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
  });
  it('removes link hints when Zotero replaces their PDF view', () => {
    const created = createHistorySession();
    configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    Reflect.set(created.reader, '_iframeWindow', undefined);
    created.session.start();
    created.session.focusAndHandle(readerKey('f').event);
    expect(linkHintElements(created)).toHaveLength(1);

    Reflect.set(created.reader._internalReader ?? {}, '_primaryView', undefined);
    created.intervalTasks[0]?.();

    expect(linkHintElements(created)).toHaveLength(0);
    expect(created.bodyChildren).toHaveLength(0);
    created.session.dispose();
  });

  it('contains missing, empty, and throwing private link seams', async () => {
    vi.useFakeTimers();
    const missing = createHistorySession();
    const missingView = missing.reader._internalReader?._primaryView;
    if (!missingView) throw new Error('Expected a primary reader view');
    Object.defineProperty(missingView, '_pdfPages', {
      configurable: true,
      get: () => {
        throw new Error('reader reloaded');
      },
    });
    expect(() => missing.session.focusAndHandle(readerKey('f').event)).not.toThrow();
    expect(missing.indicator.textContent).toBe('Link hints unavailable');
    expect(missing.debug).toEqual(['reader follow link discovery failed: Error: reader reloaded']);
    expect(missing.diagnostics).toEqual([
      'reader follow link discovery failed: Error: reader reloaded',
    ]);

    const empty = createHistorySession();
    configureLinkView(empty, []);
    empty.session.focusAndHandle(readerKey('f').event);
    expect(empty.indicator.textContent).toBe('No visible links');

    const failed = createHistorySession();
    const configured = configureLinkView(failed, [
      externalLink([10, 10, 80, 30], 'https://example.com'),
    ]);
    Reflect.set(configured.view, '_onOpenLink', () => {
      throw new Error('blocked URI');
    });
    failed.session.focusAndHandle(readerKey('f').event);
    expect(() => failed.session.focusAndHandle(readerKey('a').event)).not.toThrow();
    expect(failed.indicator.textContent).toBe('Link unavailable');
    expect(failed.debug).toEqual(['reader follow link activation failed: Error: blocked URI']);
    expect(failed.diagnostics).toEqual([
      'reader follow link activation failed: Error: blocked URI',
    ]);

    const rejected = createHistorySession();
    const rejectedView = configureLinkView(rejected, [internalLink([10, 10, 80, 30])]);
    Reflect.set(rejectedView.view, 'navigate', async () => {
      throw new Error('navigation rejected');
    });
    rejected.session.focusAndHandle(readerKey('f').event);
    rejected.session.focusAndHandle(readerKey('a').event);
    await Promise.resolve();
    expect(rejected.indicator.textContent).toBe('Link unavailable');
    expect(rejected.debug).toEqual([
      'reader follow link activation failed: Error: navigation rejected',
    ]);
    expect(rejected.diagnostics).toEqual([
      'reader follow link activation failed: Error: navigation rejected',
    ]);
    vi.clearAllTimers();
  });

  it('leaves Insert mode and editable controls native and drops stale link hints on focus change', () => {
    const created = createHistorySession();
    configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    created.session.state.mode = 'insert';
    const insert = readerKey('f');
    created.session.focusAndHandle(insert.event);
    expect(linkHintElements(created)).toHaveLength(0);
    expect(insert.preventDefault).not.toHaveBeenCalled();

    created.session.state.mode = 'normal';
    const input = { tagName: 'INPUT', localName: 'input' } as unknown as EventTarget;
    const editable = readerKey('f', { target: input });
    created.session.focusAndHandle(editable.event);
    expect(linkHintElements(created)).toHaveLength(0);
    expect(editable.preventDefault).not.toHaveBeenCalled();

    created.session.focusAndHandle(readerKey('f').event);
    const focusedInput = readerKey('a', { target: input });
    created.session.focusAndHandle(focusedInput.event);
    expect(linkHintElements(created)).toHaveLength(0);
    expect(focusedInput.preventDefault).not.toHaveBeenCalled();
  });
});
