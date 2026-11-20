import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import {
  createReaderNavigationModule,
  type ReaderNavigationModulePorts,
} from '../../src/modules/reader-navigation';
import { ReaderNavigationHost, type ReaderNativeNavigation } from '../../src/toolkit';
import {
  COLORS,
  type AnnotationRuntime,
  type PdfWindow,
  type ReaderRuntime,
} from '../../src/reader/types';
import type { PreferenceStore } from '../../src/core/preference-store';
import { LOCAL_RULES_KEY } from '../../src/document-analysis/settings';
import type { ReaderDocumentSnapshot } from '../../src/reader/document-cache';
import type { NavigationOutcome, NavigationResult } from '../../src/navigation/types';

const documents = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../src/reader/document-cache', () => ({ readReaderDocument: documents.read }));
import {
  READER_OUTLINE_ACTIONS,
  READER_MARKS_ACTIONS,
  READER_ANNOTATIONS_ACTIONS,
  READER_THUMBNAILS_ACTIONS,
} from '../../src/reader/action-capabilities';

beforeEach(() => {
  vi.stubGlobal('Components', {
    utils: { isDeadWrapper: () => false, cloneInto: (value: unknown) => value },
  });
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
  it('retires a pending caption source on a profile edit and prevents its late targets from returning', async () => {
    const listeners = new Map<string, Set<() => void>>();
    const preferences = {
      observe: (key: string, listener: () => void) => {
        const set = listeners.get(key) ?? new Set<() => void>();
        set.add(listener);
        listeners.set(key, set);
        return () => {
          set.delete(listener);
        };
      },
    } as unknown as PreferenceStore;
    const source: ReaderDocumentSnapshot = {
      origin: 'local',
      parsed: {
        schemaVersion: 1,
        sourceFingerprint: 'pdf',
        backend: 'local-rules',
        modelRevision: null,
        durationMs: 0,
        pages: [{ pageIndex: 0, viewBox: [0, 0, 600, 800], rotation: 0 }],
        regions: [
          {
            id: 'old-caption',
            kind: 'caption',
            flow: 'auxiliary',
            pageIndex: 0,
            rect: [10, 10, 100, 30],
            text: 'Figure 1: Old profile',
            format: 'text',
            anchorPrecision: 'region',
          },
        ],
      },
      textRegions: [],
      isCurrent: async () => true,
    };
    const gate = Promise.withResolvers<ReaderDocumentSnapshot>();
    documents.read
      .mockReset()
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValue({
        ...source,
        parsed: { ...source.parsed, regions: [] },
      });
    const host = new ModuleHost({ debug: vi.fn(), diagnostic: vi.fn() }, () => true);
    const ports = minimalPorts();
    const module = createReaderNavigationModule(host, { ...ports, preferences });
    const pending = module.captions.load();
    await vi.waitFor(() => expect(documents.read).toHaveBeenCalledOnce());
    for (const listener of listeners.get(LOCAL_RULES_KEY) ?? []) listener();
    await vi.waitFor(() => expect(documents.read).toHaveBeenCalledTimes(2));
    gate.resolve(source);
    expect(await pending).toEqual([]);
    expect(await module.captions.load()).toEqual([]);
    expect(module.captions.bodies).toEqual([]);
    host.dispose();
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

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

  const fixtureForAnnotations = () => {
    let active = true;
    const window = {} as PdfWindow;
    const state = {
      selectedAnnotationIDs: ['current'],
      annotations: [
        { id: 'current' },
        { id: 'deleted' },
        { id: 'bad-sort-index' },
        { id: 'different-color' },
        { id: 'ink' },
        { id: 'target' },
      ],
    };
    const setSelectedAnnotations = vi.fn((keys: string[]) => {
      state.selectedAnnotationIDs = keys;
    });
    const reader = {
      _iframeWindow: window,
      _internalReader: { _state: state, setSelectedAnnotations },
    } as unknown as ReaderRuntime;
    const showStatus = vi.fn();
    const rememberAnnotation = vi.fn();
    const annotations: AnnotationRuntime[] = [];
    const executeNavigation = vi.fn<ReaderNavigationModulePorts['actions']['executeNavigation']>(
      (_window, _intent, perform) => ({
        pending: false,
        result: {
          ...(perform({} as ReaderNativeNavigation) as NavigationOutcome),
          recorded: false,
        },
        isCurrent: () => active,
        cancel: vi.fn(),
      }),
    );
    const host = new ModuleHost({ debug: vi.fn(), diagnostic: vi.fn() }, () => true);
    const ports = minimalPorts();
    const module = createReaderNavigationModule(host, {
      ...ports,
      sidebar: { ...ports.sidebar, language: () => 'en' },
      actions: {
        ...ports.actions,
        executeNavigation,
        reader,
        itemForReader: () => ({
          key: 'attachment',
          getAnnotations: () => annotations,
          saveTx: async () => undefined,
        }),
        selectedAnnotationKey: () => state.selectedAnnotationIDs[0] ?? null,
        filterColor: () => COLORS.red,
        rememberAnnotation,
        invocationCurrent: () => () => active,
        showStatus,
        debug: vi.fn(),
      },
    });
    const add = (key: string, sortIndex: string, extra?: Partial<AnnotationRuntime>) =>
      annotations.push({
        key,
        annotationSortIndex: sortIndex,
        annotationType: 'highlight',
        annotationColor: COLORS.red,
        saveTx: async () => undefined,
        ...extra,
      });
    return {
      host,
      module,
      window,
      add,
      executeNavigation,
      setSelectedAnnotations,
      rememberAnnotation,
      showStatus,
      retire: () => {
        active = false;
      },
    };
  };

  it('skips invalid candidates before one native selection in each direction', () => {
    const f = fixtureForAnnotations();
    f.add('target', '08');
    f.add('unloaded', '02');
    f.add('deleted', '03', { deleted: true });
    f.add('', '04');
    f.add('bad-sort-index', '05', { annotationSortIndex: Number.NaN as unknown as string });
    f.add('different-color', '06', { annotationColor: COLORS.blue });
    f.add('ink', '07', { annotationType: 'ink' });
    f.add('current', '01');

    expect(f.module.executeAction('nextAnnotation', f.window, 1)).toBe(true);
    expect(f.executeNavigation).toHaveBeenCalledOnce();
    expect(f.setSelectedAnnotations).toHaveBeenCalledExactlyOnceWith(['target']);
    expect(f.rememberAnnotation).toHaveBeenCalledExactlyOnceWith('target');
    expect(f.showStatus).toHaveBeenLastCalledWith('→ Annotation 2/2 · Skipped 4 unavailable', 1500);

    f.module.executeAction('nextAnnotation', f.window, 1);
    expect(f.setSelectedAnnotations).toHaveBeenLastCalledWith(['current']);
    f.module.executeAction('prevAnnotation', f.window, 1);
    expect(f.setSelectedAnnotations).toHaveBeenLastCalledWith(['target']);
    expect(f.executeNavigation).toHaveBeenCalledTimes(3);
    f.host.dispose();
  });

  it('does not dispatch or remember a target when all eligible annotations are unavailable', () => {
    const f = fixtureForAnnotations();
    f.add('unloaded', '01');
    f.add('deleted', '02', { deleted: true });

    f.module.executeAction('nextAnnotation', f.window, 1);

    expect(f.executeNavigation).not.toHaveBeenCalled();
    expect(f.rememberAnnotation).not.toHaveBeenCalled();
    expect(f.showStatus).toHaveBeenCalledExactlyOnceWith(
      'No annotations to jump to · Skipped 2 unavailable',
      2000,
    );
    f.host.dispose();
  });

  it('does not retry or remember a target when native selection does not settle', () => {
    const f = fixtureForAnnotations();
    f.add('current', '01');
    f.add('target', '02');
    f.setSelectedAnnotations.mockImplementationOnce(() => {});

    f.module.executeAction('nextAnnotation', f.window, 1);

    expect(f.setSelectedAnnotations).toHaveBeenCalledExactlyOnceWith(['target']);
    expect(f.rememberAnnotation).not.toHaveBeenCalled();
    expect(f.showStatus).toHaveBeenCalledExactlyOnceWith('Could not jump to the annotation', 2000);
    f.host.dispose();
  });

  it('does not remember or announce a selection after the invocation retires', async () => {
    const f = fixtureForAnnotations();
    f.add('target', '01');
    const settled = Promise.withResolvers<NavigationResult>();
    f.executeNavigation.mockReturnValueOnce({
      pending: true,
      result: settled.promise,
      isCurrent: () => false,
      cancel: vi.fn(),
    });
    f.module.executeAction('nextAnnotation', f.window, 1);
    f.retire();
    settled.resolve({ kind: 'completed', evidence: 'settled-change', recorded: false });
    await settled.promise;

    expect(f.rememberAnnotation).not.toHaveBeenCalled();
    expect(f.showStatus).not.toHaveBeenCalled();
    f.host.dispose();
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
