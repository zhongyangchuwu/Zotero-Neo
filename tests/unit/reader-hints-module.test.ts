import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import {
  createReaderHintsModule,
  type ReaderHintsModuleHost,
} from '../../src/modules/reader-hints';
import type { NavigationIntent, NavigationResult } from '../../src/navigation/types';
import type {
  PdfWindow,
  ReaderLinkPosition,
  ReaderRuntime,
  ReaderViewRuntime,
} from '../../src/reader/types';
import type { ReaderNativeNavigation } from '../../src/toolkit/reader';

const originalComponents = Reflect.get(globalThis, 'Components');
beforeEach(() => {
  Reflect.set(globalThis, 'Components', {
    utils: { isDeadWrapper: () => false, cloneInto: <T>(value: T) => structuredClone(value) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

function fixture() {
  const nodes: HTMLElement[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const document = {
    documentElement: { clientWidth: 800, clientHeight: 600 },
    querySelectorAll: () => [],
    body: { appendChild: (node: HTMLElement) => nodes.push(node) },
    createElement: () => {
      const node = {
        dataset: {} as Record<string, string>,
        hidden: false,
        textContent: '',
        style: { cssText: '', left: '', top: '', width: '', height: '', borderRadius: '' },
        getBoundingClientRect: (): DOMRect => {
          const left = Number.parseFloat(node.style.left) || 0;
          const top = Number.parseFloat(node.style.top) || 0;
          const width = node.textContent.length * 7 + 8;
          return { left, top, right: left + width, bottom: top + 16, width, height: 16 } as DOMRect;
        },
        remove: vi.fn(() => {
          const index = nodes.indexOf(node as unknown as HTMLElement);
          if (index >= 0) nodes.splice(index, 1);
        }),
      };
      return node;
    },
  };
  const window = {
    document,
    closed: false,
    frameElement: null,
    innerWidth: 800,
    innerHeight: 600,
    focus: vi.fn(),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: vi.fn((id: number) => {
      frames.delete(id);
    }),
  } as unknown as PdfWindow;
  const external = {
    type: 'external-link',
    position: { pageIndex: 0, rects: [[10, 30, 70, 50]] },
    url: 'https://example.com/source',
  };
  const internal = {
    type: 'internal-link',
    position: { pageIndex: 0, rects: [[100, 30, 160, 50]] },
    destinationPosition: { pageIndex: 1, rects: [[200, 200, 240, 240]] },
  };
  const navigate = vi.fn();
  const openLink = vi.fn();
  const view = {
    _iframeWindow: window,
    _pdfPages: { 0: { overlays: [external, internal] } },
    getClientRectForPopup: (position: ReaderLinkPosition) => position.rects[0],
    navigate,
    _onOpenLink: openLink,
  };
  const reader = {
    _iframeWindow: {} as Window,
    _internalReader: { _primaryView: view, _state: { annotations: [] } },
  } as unknown as ReaderRuntime;
  let current = true;
  const pending: { intent: NavigationIntent; reject: (error: unknown) => void }[] = [];
  const copyText = vi.fn();
  const showStatus = vi.fn();
  const debug = vi.fn();
  const diagnostic = vi.fn();
  const ports: ReaderHintsModuleHost = {
    reader,
    viewForWindow: (candidate) =>
      candidate === window ? (view as unknown as ReaderViewRuntime) : null,
    copyText,
    showStatus,
    debug,
    diagnostic,
    text: (key) => key,
    executeNavigation: (_window, intent, perform) => {
      const native = {
        bindRequest: () => undefined,
        runNative: <T>(run: () => T): T => run(),
      } as unknown as ReaderNativeNavigation;
      perform(native);
      const { promise, reject } = Promise.withResolvers<NavigationResult>();
      pending.push({ intent, reject });
      return { pending: true, result: promise, isCurrent: () => true, cancel: () => undefined };
    },
  };
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const makeModule = () => {
    const host = new ModuleHost(logger, () => current);
    return { host, module: createReaderHintsModule(host, ports) };
  };
  const key = (value: string) =>
    ({
      key: value,
      target: null,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    }) as unknown as KeyboardEvent;
  const badges = (attribute: string) => nodes.filter((node) => node.dataset[attribute] === '1');
  return {
    window,
    nodes,
    frames,
    view,
    navigate,
    openLink,
    pending,
    copyText,
    showStatus,
    debug,
    diagnostic,
    makeModule,
    key,
    badges,
    retireParent: () => {
      current = false;
    },
  };
}

describe('Reader hints module lifetime', () => {
  it('rejects copy confirmation after the parent retires, before host disposal', () => {
    const f = fixture();
    const { host, module } = f.makeModule();
    expect(module.copyTarget(f.window)).toBe(true);
    expect(f.badges('zoteroNeoCopyHint')).toHaveLength(1);
    f.retireParent();
    expect(module.copy.handleKey(f.key('a'), f.window)).toBe(false);
    expect(f.copyText).not.toHaveBeenCalled();
    expect(module.copy.hasHints).toBe(false);
    host.dispose();
  });

  it('retires pending native navigation immediately and ignores its late failure', async () => {
    const f = fixture();
    const { host, module } = f.makeModule();
    module.followLink(f.window);
    expect(f.badges('zoteroNeoLinkHint')).toHaveLength(2);
    module.links.handleKey(f.key('s'), f.window);
    expect(f.navigate).toHaveBeenCalledOnce();
    const navigation = f.pending[0]!;
    expect(navigation.intent.context?.isCurrent?.()).toBe(true);
    const cue = f.badges('zoteroNeoDestinationCue')[0];
    expect(cue).toBeDefined();
    f.retireParent();
    expect(navigation.intent.context?.isCurrent?.()).toBe(false);
    navigation.reject(new Error('late native failure'));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.showStatus).not.toHaveBeenCalled();
    expect(f.debug).not.toHaveBeenCalled();
    expect(f.diagnostic).not.toHaveBeenCalled();
    expect(f.badges('zoteroNeoDestinationCue')).toEqual([cue]);
    host.dispose();
  });

  it('does not acquire a cue when native navigation retires its parent reentrantly', () => {
    const f = fixture();
    const { host, module } = f.makeModule();
    f.navigate.mockImplementation(() => f.retireParent());
    module.followLink(f.window);
    module.links.handleKey(f.key('s'), f.window);
    expect(f.navigate).toHaveBeenCalledOnce();
    expect(f.pending[0]!.intent.context?.isCurrent?.()).toBe(false);
    expect(f.badges('zoteroNeoDestinationCue')).toEqual([]);
    expect(f.frames.size).toBe(0);
    host.dispose();
  });

  it('fences retired interactions from a replacement on the same window', async () => {
    const f = fixture();
    const old = f.makeModule();
    old.module.followLink(f.window);
    old.module.links.handleKey(f.key('s'), f.window);
    const pending = f.pending[0]!;
    old.host.dispose();
    const replacement = f.makeModule();
    replacement.module.copyTarget(f.window);
    const current = f.badges('zoteroNeoCopyHint');
    expect(current).toHaveLength(1);
    expect(old.module.copyTarget(f.window)).toBe(false);
    expect(old.module.followLink(f.window)).toBe(false);
    expect(old.module.copy.handleKey(f.key('a'), f.window)).toBe(false);
    pending.reject(new Error('old navigation failed'));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.badges('zoteroNeoCopyHint')).toEqual(current);
    expect(f.showStatus).not.toHaveBeenCalled();
    expect(f.debug).not.toHaveBeenCalled();
    expect(f.diagnostic).not.toHaveBeenCalled();
    replacement.module.copy.handleKey(f.key('a'), f.window);
    expect(f.copyText).toHaveBeenCalledExactlyOnceWith('https://example.com/source');
    replacement.host.dispose();
  });

  it('does not confirm copy or links from a different PDF window', () => {
    const f = fixture();
    const { host, module } = f.makeModule();
    const wrong = {} as PdfWindow;
    module.copyTarget(f.window);
    expect(module.copy.hasHints).toBe(true);
    expect(module.copy.handleKey(f.key('a'), wrong)).toBe(false);
    expect(f.copyText).not.toHaveBeenCalled();
    module.followLink(f.window);
    expect(module.links.hasHints).toBe(true);
    expect(module.links.handleKey(f.key('s'), wrong)).toBe(false);
    expect(f.navigate).not.toHaveBeenCalled();
    expect(f.openLink).not.toHaveBeenCalled();
    host.dispose();
  });

  it('releases the other owned hints, cue, timer and frames when badge removal fails', () => {
    vi.useFakeTimers();
    const f = fixture();
    const { host, module } = f.makeModule();
    module.followLink(f.window);
    module.links.handleKey(f.key('s'), f.window);
    expect(f.badges('zoteroNeoDestinationCue')).toHaveLength(1);
    module.followLink(f.window);
    module.copyTarget(f.window);
    module.copy.onViewportChange(f.window);
    module.links.onViewportChange(f.window);
    expect(vi.getTimerCount()).toBe(1);
    const failedBadge = f.badges('zoteroNeoCopyHint')[0]!;
    const failure = new Error('badge removal failed');
    vi.mocked(failedBadge.remove).mockImplementationOnce(() => {
      throw failure;
    });
    let thrown: unknown;
    try {
      host.dispose();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
    expect(module.copy.hasHints).toBe(false);
    expect(module.links.hasHints).toBe(false);
    expect(f.badges('zoteroNeoLinkHint')).toHaveLength(0);
    expect(f.badges('zoteroNeoDestinationCue')).toHaveLength(0);
    expect(f.nodes).toEqual([failedBadge]);
    expect(f.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('diagnoses a failed native navigation even when cue cleanup fails', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const { host, module } = f.makeModule();
    module.followLink(f.window);
    module.links.handleKey(f.key('s'), f.window);
    const cue = f.badges('zoteroNeoDestinationCue')[0]!;
    const oldFrame = [...f.frames.values()][0]!;
    const original = new Error('native navigation root cause');
    const cleanup = new Error('cue removal failed');
    vi.mocked(cue.remove).mockImplementationOnce(() => {
      throw cleanup;
    });
    f.pending[0]!.reject(original);
    for (let turn = 0; turn < 4; turn++) await Promise.resolve();
    expect(f.diagnostic).toHaveBeenCalledWith(expect.stringContaining(original.message));
    expect(f.diagnostic).toHaveBeenCalledWith(expect.stringContaining(cleanup.message));
    expect(f.frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    module.copyTarget(f.window);
    const replacement = f.badges('zoteroNeoCopyHint');
    oldFrame(0);
    expect(f.badges('zoteroNeoCopyHint')).toEqual(replacement);
    module.copy.handleKey(f.key('a'), f.window);
    expect(f.copyText).toHaveBeenCalledExactlyOnceWith('https://example.com/source');
    host.dispose();
  });

  it('keeps a copy geometry error observable when cancelling its badges also fails', () => {
    const f = fixture();
    const { host, module } = f.makeModule();
    module.copyTarget(f.window);
    const badge = f.badges('zoteroNeoCopyHint')[0]!;
    const original = new Error('native copy geometry root cause');
    const cleanup = new Error('copy badge removal failed');
    vi.spyOn(f.view, 'getClientRectForPopup').mockImplementation(() => {
      throw original;
    });
    vi.mocked(badge.remove).mockImplementationOnce(() => {
      throw cleanup;
    });
    let thrown: unknown;
    try {
      module.copy.handleKey(f.key('a'), f.window);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(cleanup);
    expect(f.debug).toHaveBeenCalledWith(expect.stringContaining(original.message));
    expect(f.copyText).not.toHaveBeenCalled();
    expect(module.copy.hasHints).toBe(false);
    host.dispose();
  });

  it.each(['copy', 'link'] as const)(
    'keeps a %s acquisition error observable when partial UI release also fails',
    (kind) => {
      const f = fixture();
      const { host, module } = f.makeModule();
      const original = new Error(`${kind} append root cause`);
      const cleanup = new Error('partial badge removal failed');
      const body = f.window.document.body;
      const append = body.appendChild.bind(body);
      vi.spyOn(body, 'appendChild').mockImplementationOnce((node) => {
        append(node);
        vi.mocked((node as HTMLElement).remove).mockImplementationOnce(() => {
          throw cleanup;
        });
        throw original;
      });
      let thrown: unknown;
      try {
        if (kind === 'copy') module.copyTarget(f.window);
        else module.followLink(f.window);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(cleanup);
      expect(f.debug).toHaveBeenCalledWith(expect.stringContaining(original.message));
      expect(f.copyText).not.toHaveBeenCalled();
      expect(f.navigate).not.toHaveBeenCalled();
      expect((kind === 'copy' ? module.copy : module.links).hasHints).toBe(false);
      expect(f.frames.size).toBe(0);
      host.dispose();
    },
  );
});
