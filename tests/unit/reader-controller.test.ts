import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReaderControllerDependencies } from '../../src/core/contracts';
import { ReaderSession, createReaderController } from '../../src/reader/controller';
import { DEFAULT_BINDINGS } from '../../src/input/bindings';
import type {
  InternalReaderRuntime,
  PdfWindow,
  ReaderLinkOverlay,
  ReaderLinkPosition,
  ReaderRuntime,
  ReaderViewRuntime,
} from '../../src/reader/types';

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
  const intervalTasks: (() => void)[] = [];
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
      const element = {
        id: '',
        textContent: '',
        hidden: false,
        style: {
          cssText: '',
          display: '',
          left: '',
          top: '',
          color: '',
          background: '',
        },
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
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: vi.fn(),
    setInterval: (task: () => void) => {
      intervalTasks.push(task);
      return 1;
    },
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
  return { session, indicator, debug, pdfWindow, reader, bodyChildren, intervalTasks };
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
      shiftKey: false,
      target: options.target ?? null,
      preventDefault,
      stopImmediatePropagation,
    } as unknown as KeyboardEvent,
    preventDefault,
    stopImmediatePropagation,
  };
}

function controlKey(key: string, target: EventTarget | null = null) {
  return readerKey(key, { ctrl: true, target });
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
  Reflect.set(view, '_pdfPages', [{ overlays }]);
  Reflect.set(view, 'getClientRectForPopup', (position: ReaderLinkPosition) => position.rects[0]);
  Reflect.set(view, 'navigate', navigate);
  Reflect.set(view, '_onOpenLink', openLink);
  return { view, navigate, openLink };
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
    created.session.start();

    view._onKeyDown?.(controlKey('o').event);
    view._onKeyDown?.(readerKey('f').event);
    view._onKeyDown?.(controlKey('x').event);

    expect(originalKeyDown).toHaveBeenCalledOnce();
    expect(originalKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: 'x' }));
    created.session.dispose();
  });
});

describe('PDF follow-link hints', () => {
  it('labels visible links once and invokes Zotero native internal and external actions', () => {
    const created = createHistorySession();
    const internal = internalLink([20, 30, 80, 50], 4);
    const external = externalLink([100, 120, 180, 140], 'https://example.com');
    const configured = configureLinkView(created, [
      internal,
      internal,
      external,
      internalLink([900, 30, 950, 50]),
      { type: 'citation', position: linkPosition([200, 200, 260, 220]) },
    ]);
    const open = readerKey('f');

    created.session.focusAndHandle(open.event);

    expect(created.session.state.linkHintBadges.map((badge) => badge.label)).toEqual(['A', 'S']);
    expect(created.bodyChildren).toHaveLength(2);
    expect(open.preventDefault).toHaveBeenCalledOnce();
    expect(open.stopImmediatePropagation).toHaveBeenCalledOnce();

    created.session.focusAndHandle(readerKey('a').event);
    expect(configured.navigate).toHaveBeenCalledWith({ position: internal.destinationPosition });
    expect(created.session.state.linkHintBadges).toHaveLength(0);

    created.session.focusAndHandle(readerKey('f').event);
    created.session.focusAndHandle(readerKey('s').event);
    expect(configured.openLink).toHaveBeenCalledWith('https://example.com');
    expect(created.session.state.linkHintBadges).toHaveLength(0);
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
      _pdfPages: [{ overlays: [internalLink([10, 10, 40, 30], 7)] }],
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

    expect(new Set(created.session.state.linkHintBadges.map((badge) => badge.label)).size).toBe(27);
    expect(created.session.state.linkHintBadges.every((badge) => badge.label.length === 2)).toBe(
      true,
    );

    created.session.focusAndHandle(readerKey('a').event);
    expect(navigate).not.toHaveBeenCalled();
    expect(created.session.state.linkHintBuffer).toBe('A');
    expect(
      created.session.state.linkHintBadges.filter((badge) => !badge.element.hidden),
    ).toHaveLength(26);

    created.session.focusAndHandle(readerKey('Backspace').event);
    expect(created.session.state.linkHintBuffer).toBe('');
    expect(created.session.state.linkHintBadges.every((badge) => !badge.element.hidden)).toBe(true);

    const escape = readerKey('Escape');
    created.session.focusAndHandle(escape.event);
    expect(created.session.state.linkHintBadges).toHaveLength(0);
    expect(created.bodyChildren).toHaveLength(0);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
  });
  it('removes link hints when Zotero replaces their PDF view', () => {
    const created = createHistorySession();
    configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    created.session.start();
    created.session.focusAndHandle(readerKey('f').event);
    expect(created.session.state.linkHintBadges).toHaveLength(1);

    Reflect.set(created.reader._internalReader ?? {}, '_primaryView', undefined);
    created.intervalTasks[0]?.();

    expect(created.session.state.linkHintBadges).toHaveLength(0);
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
    vi.clearAllTimers();
  });

  it('leaves Insert mode and editable controls native and drops stale link hints on focus change', () => {
    const created = createHistorySession();
    configureLinkView(created, [internalLink([10, 10, 80, 30])]);
    created.session.state.mode = 'insert';
    const insert = readerKey('f');
    created.session.focusAndHandle(insert.event);
    expect(created.session.state.linkHintBadges).toHaveLength(0);
    expect(insert.preventDefault).not.toHaveBeenCalled();

    created.session.state.mode = 'normal';
    const input = { tagName: 'INPUT', localName: 'input' } as unknown as EventTarget;
    const editable = readerKey('f', { target: input });
    created.session.focusAndHandle(editable.event);
    expect(created.session.state.linkHintBadges).toHaveLength(0);
    expect(editable.preventDefault).not.toHaveBeenCalled();

    created.session.focusAndHandle(readerKey('f').event);
    const focusedInput = readerKey('a', { target: input });
    created.session.focusAndHandle(focusedInput.event);
    expect(created.session.state.linkHintBadges).toHaveLength(0);
    expect(focusedInput.preventDefault).not.toHaveBeenCalled();
  });
});
