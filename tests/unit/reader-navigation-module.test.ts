import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import {
  createReaderNavigationModule,
  type ReaderNavigationModulePorts,
} from '../../src/modules/reader-navigation';
import { ReaderNavigationHost, type ReaderNativeNavigation } from '../../src/toolkit';
import type { PdfWindow, ReaderRuntime } from '../../src/reader/types';
import {
  READER_OUTLINE_ACTIONS,
  READER_MARKS_ACTIONS,
  READER_ANNOTATIONS_ACTIONS,
  READER_THUMBNAILS_ACTIONS,
} from '../../src/reader/action-capabilities';

beforeEach(() => {
  vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sidebarCapabilities = [
  ['reader-outline', READER_OUTLINE_ACTIONS],
  ['reader-marks', READER_MARKS_ACTIONS],
  ['reader-annotations', READER_ANNOTATIONS_ACTIONS],
  ['reader-thumbnails', READER_THUMBNAILS_ACTIONS],
] as const;

function minimalPorts(): ReaderNavigationModulePorts {
  return {
    reader: {},
    marks: { capturePresentation: () => () => true },
    sidebar: {},
    smooth: {},
    actions: {},
    debug: () => undefined,
  } as unknown as ReaderNavigationModulePorts;
}

describe('Reader navigation module lifetime', () => {
  it('rejects duplicate ownership for every supported sidebar contribution', () => {
    const host = new ModuleHost({ debug: vi.fn(), diagnostic: vi.fn() }, () => true);
    createReaderNavigationModule(host, minimalPorts());
    for (const [context, actions] of sidebarCapabilities) {
      for (const action of actions) {
        expect(() =>
          host.activate('contender', (scope) => host.bind(scope, context, action, () => {})),
        ).toThrow(`Action already contributed: ${context}:${action}`);
      }
    }
    host.dispose();
  });

  it('releases earlier contributions after a partial factory activation fails', () => {
    const host = new ModuleHost({ debug: vi.fn(), diagnostic: vi.fn() }, () => true);
    host.activate('blocker', (scope) =>
      host.bind(scope, 'reader-thumbnails', 'uiCancel', () => {}),
    );
    expect(() => createReaderNavigationModule(host, minimalPorts())).toThrow(
      'Action already contributed: reader-thumbnails:uiCancel',
    );
    host.activate('replacement', (scope) => {
      for (const [context, actions] of sidebarCapabilities) {
        for (const action of actions) {
          if (context === 'reader-thumbnails' && action === 'uiCancel') continue;
          host.bind(scope, context, action, () => {});
        }
      }
    });
    host.dispose();
  });

  it('stops a pending smooth hold when its owner retires and settles it as stale', async () => {
    let current = true;
    const frames = new Map<number, FrameRequestCallback>();
    const window = {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(1, callback);
        return 1;
      },
      cancelAnimationFrame: () => {
        frames.delete(1);
      },
    } as unknown as PdfWindow;
    const reader = {} as ReaderRuntime;
    const preferences = {
      has: (key: string) => key === 'scroll.mode',
      get: <T extends boolean | number | string>(key: string, fallback: T): T =>
        key === 'scroll.mode' ? ('follow' as T) : fallback,
    };
    const scroll = vi.fn();
    let settled: Promise<unknown> | undefined;
    const navigationHost = new ReaderNavigationHost({
      reader,
      activePdfWindow: () => window,
      setActivePdfWindow: () => undefined,
      syncViews: () => undefined,
      scrollBoundary: () => undefined,
      unavailable: () => undefined,
      debug: () => undefined,
    });
    const ports = {
      reader,
      navigationHost,
      smooth: { preferences, scrollBy: scroll },
      marks: { preferences, capturePresentation: () => () => current },
      sidebar: {},
      actions: {
        executeNavigation: (
          _window: PdfWindow,
          _intent: unknown,
          perform: (native: ReaderNativeNavigation) => unknown,
        ) => {
          settled = perform({
            policy: { kind: 'record' },
          } as ReaderNativeNavigation) as Promise<unknown>;
          return null;
        },
      },
      showStatus: () => undefined,
      debug: () => undefined,
    } as unknown as ReaderNavigationModulePorts;
    const host = new ModuleHost({ debug: vi.fn(), diagnostic: vi.fn() }, () => current);
    const module = createReaderNavigationModule(host, ports);
    module.startSmooth(window, 'j', { axis: 'y', direction: 1 }, 'scrollDown', () => true);
    expect(scroll).toHaveBeenCalledOnce();
    expect(frames.has(1)).toBe(true);
    current = false;
    frames.get(1)?.(16);
    expect(scroll).toHaveBeenCalledOnce();
    await expect(settled).resolves.toBe(false);
    expect(module.executeAction('scrollDown', window, 1)).toBe(false);
    host.dispose();
  });
});
