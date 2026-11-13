import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  ReaderCommentEditor,
  type AnnotationCommentTarget,
} from '../../src/modules/reader-annotations/comment-editor';
import type {
  AnnotationRuntime,
  PdfWindow,
  ReaderRuntime,
  ReaderTimer,
} from '../../src/reader/types';

const commentBridge = vi.hoisted(() => ({
  load: null as Promise<void> | null,
  dispatch: null as ((command: 'retry' | 'overwrite' | 'discard') => void) | null,
  model: null as Record<string, unknown> | null,
}));

vi.mock('../../src/platform/native-ui', () => ({
  mountNativeReactView: (options: {
    root: HTMLElement;
    model: { comment: string };
    isCurrent: () => boolean;
    dispatch: (command: 'retry' | 'overwrite' | 'discard') => void;
  }) => {
    let input: HTMLTextAreaElement | null = null;
    let disposed = false;
    commentBridge.dispatch = options.dispatch;
    commentBridge.model = options.model;
    const ready = (commentBridge.load ?? Promise.resolve()).then(() => {
      if (disposed || !options.isCurrent()) throw new Error('View retired');
      input = options.root.ownerDocument.createElement('textarea');
      input.id = 'zv-annotation-comment-input';
      input.value = options.model.comment;
      options.root.appendChild(input);
    });
    return {
      ready,
      update: (model: Record<string, unknown>) => {
        commentBridge.model = model;
      },
      getElement: (part: string) => (part === 'input' ? input : null),
      dispose: () => {
        disposed = true;
      },
    };
  },
}));

const originalComponents = Reflect.get(globalThis, 'Components');
const originalServices = Reflect.get(globalThis, 'Services');

afterEach(() => {
  commentBridge.load = null;
  commentBridge.dispatch = null;
  commentBridge.model = null;
  if (originalServices === undefined) Reflect.deleteProperty(globalThis, 'Services');
  else Reflect.set(globalThis, 'Services', originalServices);
  vi.useRealTimers();
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

type FakeElement = HTMLElement & {
  value: string;
  emit(type: string): void;
  focus: Mock<() => void>;
};

function createView() {
  const elements: FakeElement[] = [];
  const mounted: FakeElement[] = [];
  const systemKeys = new Set<(event: KeyboardEvent) => void>();
  const document = {
    defaultView: null as Window | null,
    activeElement: null as Element | null,
    body: {
      appendChild: (element: FakeElement) => mounted.push(element),
    },
    createElement: (_tag: string) => {
      const listeners = new Map<string, Set<() => void>>();
      const children: FakeElement[] = [];
      const element = {
        id: '',
        ownerDocument: document,
        style: { cssText: '' },
        value: '',
        textContent: '',
        spellcheck: false,
        selectionStart: 0,
        selectionEnd: 0,
        isConnected: true,
        appendChild: (child: FakeElement) => children.push(child),
        append: (...nodes: FakeElement[]) => children.push(...nodes),
        addEventListener: (type: string, listener: () => void) => {
          const current = listeners.get(type) ?? new Set<() => void>();
          current.add(listener);
          listeners.set(type, current);
        },
        removeEventListener: (type: string, listener: () => void) => {
          listeners.get(type)?.delete(listener);
        },
        emit: (type: string) => {
          for (const listener of listeners.get(type) ?? []) listener();
        },
        focus: vi.fn(() => {
          document.activeElement = element as unknown as Element;
        }),
        remove: () => {
          const index = mounted.indexOf(element as unknown as FakeElement);
          if (index >= 0) mounted.splice(index, 1);
          Reflect.set(element, 'isConnected', false);
          for (const child of children) Reflect.set(child, 'isConnected', false);
        },
      } as unknown as FakeElement;
      elements.push(element);
      return element;
    },
  };
  const privilegedWindow = {
    document,
    addEventListener: (
      type: string,
      listener: (event: KeyboardEvent) => void,
      options?: { mozSystemGroup?: boolean },
    ) => {
      if (type === 'keydown' && options?.mozSystemGroup) systemKeys.add(listener);
    },
    removeEventListener: (type: string, listener: (event: KeyboardEvent) => void) => {
      if (type === 'keydown') systemKeys.delete(listener);
    },
  } as unknown as PdfWindow;
  // Waived DOM calls lose ChromeOnly options; only the restored native wrapper owns system keys.
  const pdfWindow = {
    document,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as PdfWindow;
  document.defaultView = pdfWindow;
  return {
    pdfWindow,
    privilegedWindow,
    document,
    mounted,
    systemKeys,
    input: () => {
      const input = elements.findLast(
        (element) => element.id === 'zv-annotation-comment-input' && element.isConnected,
      );
      if (!input) throw new Error('Expected mounted annotation comment input');
      return input;
    },
    dispatchSystemKey: (event: KeyboardEvent) => {
      for (const listener of [...systemKeys]) listener(event);
    },
  };
}

function createHarness() {
  vi.useFakeTimers();
  const preferences = new Map<string, string>();
  Reflect.set(globalThis, 'Services', {
    prefs: {
      getPrefType: (key: string) => (preferences.has(key) ? 32 : 0),
      getStringPref: (key: string) => preferences.get(key),
      setStringPref: (key: string, value: string) => {
        preferences.set(key, value);
      },
      clearUserPref: (key: string) => {
        preferences.delete(key);
      },
    },
  });
  const destroyed = new WeakSet<object>();
  const nativeTargets = new WeakMap<object, object>();
  Reflect.set(globalThis, 'Components', {
    utils: {
      cloneInto: <T extends object>(value: T) => ({ ...value }),
      isDeadWrapper: (value: object) => destroyed.has(value),
      waiveXrays: <T extends object>(value: T) => nativeTargets.get(value) ?? value,
      unwaiveXrays: (value: PdfWindow) =>
        value === primary.pdfWindow ? primary.privilegedWindow : secondary.privilegedWindow,
    },
  });
  const primary = createView();
  const secondary = createView();
  let activeWindow: PdfWindow | null = primary.pdfWindow;
  let nativeEditableFocused = false;
  let viewGeneration = 0;
  const annotation: AnnotationRuntime = {
    id: 7,
    key: 'ANN',
    libraryID: 2,
    annotationText: 'Quoted\ntext',
    annotationComment: 'before',
    saveTx: vi.fn(async () => {}),
  };
  const other: AnnotationRuntime = {
    id: 8,
    key: 'OTHER',
    libraryID: 3,
    annotationComment: 'other draft',
    saveTx: vi.fn(async () => {}),
  };
  const navigate = vi.fn();
  const internal = { navigate, _enableAnnotationDeletionFromComment: true as boolean | undefined };
  const reader = { _internalReader: internal } as unknown as ReaderRuntime;
  const resolveAnnotation = vi.fn(async (key: string) => (key === 'ANN' ? annotation : other));
  const annotationForSave = vi.fn(
    async (target: AnnotationCommentTarget): Promise<AnnotationRuntime | null> =>
      target.key === 'ANN' ? annotation : other,
  );
  const cleanupTheme = vi.fn();
  const themeRoot = vi.fn(() => cleanupTheme);
  const onInputOwnerChanged = vi.fn();
  const onNativeEditorFocus = vi.fn();
  const onExit = vi.fn();
  const debug = vi.fn();
  const scheduled: { delay: number; task: () => void }[] = [];
  const editor = new ReaderCommentEditor({
    reader,
    schedule: (delay, task) => {
      scheduled.push({ delay, task });
      return setTimeout(task, delay) as ReaderTimer;
    },
    clearTimer: (timer) => clearTimeout(timer ?? undefined),
    themeRoot,
    activePdfWindow: () => activeWindow,
    captureView: () => {
      const captured = viewGeneration;
      return () => captured === viewGeneration;
    },
    captureViewLifetime: () => {
      const captured = viewGeneration;
      return () => captured === viewGeneration;
    },
    resolveAnnotation,
    annotationForSave,
    nativeEditableFocused: () => nativeEditableFocused,
    onNativeEditorFocus,
    onInputOwnerChanged,
    onExit,
    debug,
    locale: () => 'en-US',
  });
  return {
    editor,
    destroyed,
    reader,
    nativeTargets,
    primary,
    secondary,
    annotation,
    other,
    internal,
    navigate,
    resolveAnnotation,
    annotationForSave,
    cleanupTheme,
    themeRoot,
    onInputOwnerChanged,
    onNativeEditorFocus,
    onExit,
    debug,
    scheduled,
    setActiveWindow: (window: PdfWindow | null) => {
      activeWindow = window;
    },
    retireCapturedViews: () => {
      viewGeneration += 1;
    },
    setNativeEditableFocused: (value: boolean) => {
      nativeEditableFocused = value;
    },
  };
}

function createPopupGuard(reader: ReaderRuntime) {
  let connected = false;
  let callback: MutationCallback;
  const disconnect = vi.fn(() => {
    connected = false;
  });
  const popupInput = { dispatchEvent: vi.fn(() => true) };
  const popup = {
    tagName: 'DIV',
    matches: () => true,
    querySelector: () => popupInput,
  };
  class PopupObserver {
    constructor(onMutation: MutationCallback) {
      callback = onMutation;
    }
    observe() {
      connected = true;
    }
    disconnect = disconnect;
  }
  Reflect.set(reader, '_iframeWindow', {
    document: { body: {} },
    MutationObserver: PopupObserver,
    KeyboardEvent: class {
      constructor(
        readonly type: string,
        readonly options: object,
      ) {}
    },
  });
  const deliverRetainedPopup = () =>
    callback([{ addedNodes: [popup] }] as unknown as MutationRecord[], {} as MutationObserver);
  return {
    disconnect,
    popupInput,
    deliverRetainedPopup,
    deliverPopup: () => {
      if (connected) deliverRetainedPopup();
    },
  };
}

function keyboard(
  key: string,
  target: EventTarget | null,
  properties: Partial<KeyboardEvent> = {},
) {
  return {
    key,
    target,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    keyCode: 0,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    ...properties,
  } as unknown as KeyboardEvent & {
    preventDefault: Mock<() => void>;
    stopImmediatePropagation: Mock<() => void>;
  };
}

async function settleJobs(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('ReaderCommentEditor input ownership', () => {
  it('does not save or mount a retired draft when React is still loading', async () => {
    const h = createHarness();
    const load = Promise.withResolvers<void>();
    commentBridge.load = load.promise;
    const opening = h.editor.open('ANN');
    await Promise.resolve();
    expect(h.editor.ownsInput).toBe(true);
    expect(h.editor.hasInput).toBe(false);
    h.editor.releaseView(h.primary.pdfWindow);
    load.resolve();
    await opening;
    expect(h.annotationForSave).not.toHaveBeenCalled();
    expect(h.primary.mounted).toHaveLength(0);
    expect(h.editor.hasInput).toBe(false);
  });

  it('does not save an initial comment when React loading fails', async () => {
    const h = createHarness();
    const load = Promise.withResolvers<void>();
    commentBridge.load = load.promise;
    const opening = h.editor.open('ANN');
    await Promise.resolve();
    load.reject(new Error('React unavailable'));
    await opening;
    expect(h.annotationForSave).not.toHaveBeenCalled();
    expect(h.annotation.annotationComment).toBe('before');
    expect(h.editor.ownsInput).toBe(false);
    expect(h.primary.mounted).toHaveLength(0);
  });

  it('claims the opening view before annotation resolution and never follows a split-view focus change', async () => {
    const h = createHarness();
    const pending = Promise.withResolvers<AnnotationRuntime>();
    h.resolveAnnotation.mockReturnValueOnce(pending.promise);
    const opening = h.editor.open('ANN');

    expect(h.editor.ownsInput).toBe(true);
    expect(h.editor.hasInput).toBe(false);
    expect(h.editor.ownsView(h.primary.pdfWindow)).toBe(true);
    expect(h.editor.ownsView(h.secondary.pdfWindow)).toBe(false);
    expect(h.editor.consumesKey('escape', h.primary.pdfWindow)).toBe(true);
    expect(h.editor.consumesKey('enter', h.primary.pdfWindow)).toBe(false);
    expect(h.editor.handleKey(keyboard('j', null), h.primary.pdfWindow)).toBe(true);
    expect(h.editor.handleKey(keyboard('j', null), h.secondary.pdfWindow)).toBe(false);

    h.setActiveWindow(h.secondary.pdfWindow);
    pending.resolve(h.annotation);
    await opening;

    expect(h.primary.input().value).toBe('before');
    expect(h.secondary.mounted).toHaveLength(0);
    expect(h.editor.ownsView(h.primary.pdfWindow)).toBe(true);
    h.editor.dispose();
  });

  it.each(['release', 'dispose', 'escape'] as const)(
    'invalidates a pending open on %s without mounting or changing the host flag',
    async (action) => {
      const h = createHarness();
      const pending = Promise.withResolvers<AnnotationRuntime>();
      h.resolveAnnotation.mockReturnValueOnce(pending.promise);
      const opening = h.editor.open('ANN');
      if (action === 'release') h.editor.releaseView(h.primary.pdfWindow);
      else if (action === 'dispose') h.editor.dispose();
      else h.editor.handleKey(keyboard('Escape', null), h.primary.pdfWindow);

      expect(h.editor.ownsInput).toBe(false);
      expect(h.primary.systemKeys.size).toBe(0);
      pending.resolve(h.annotation);
      await opening;
      await settleJobs();

      expect(h.primary.mounted).toHaveLength(0);
      expect(h.navigate).not.toHaveBeenCalled();
      expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
      expect(h.annotationForSave).not.toHaveBeenCalled();
      if (action === 'dispose') {
        await h.editor.open('OTHER');
        expect(h.editor.ownsInput).toBe(false);
      }
      h.editor.dispose();
    },
  );

  it('keeps a newer pending or mounted owner when an older open resolves', async () => {
    const h = createHarness();
    const pending = Promise.withResolvers<AnnotationRuntime>();
    h.resolveAnnotation.mockReturnValueOnce(pending.promise);
    const first = h.editor.open('ANN');
    h.setActiveWindow(h.secondary.pdfWindow);
    await h.editor.open('OTHER');
    pending.resolve(h.annotation);
    await first;

    expect(h.editor.ownsView(h.secondary.pdfWindow)).toBe(true);
    expect(h.secondary.input().value).toBe('other draft');
    expect(h.primary.mounted).toHaveLength(0);
    expect(h.primary.systemKeys.size).toBe(0);
    expect(h.navigate).toHaveBeenCalledOnce();
    h.editor.dispose();
  });

  it('reports failed annotation lookup and releases pending input rather than trapping Reader keys', async () => {
    const h = createHarness();
    h.resolveAnnotation.mockRejectedValueOnce(new Error('annotation lookup failed'));
    await h.editor.open('ANN');

    expect(h.editor.ownsInput).toBe(false);
    expect(h.primary.systemKeys.size).toBe(0);
    expect(h.primary.mounted).toHaveLength(0);
    expect(h.debug).toHaveBeenCalledWith(expect.stringContaining('annotation lookup failed'));
    expect(h.editor.handleKey(keyboard('j', null), h.primary.pdfWindow)).toBe(false);
    h.editor.dispose();
  });
});

describe('ReaderCommentEditor native input and persistence', () => {
  it('leaves typing, Enter newline and native editing defaults intact while protecting only its own view', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    for (const key of ['a', 'Enter', 'Backspace', 'Delete', 'ArrowLeft']) {
      const event = keyboard(key, input);
      expect(h.editor.handleKey(event, h.primary.pdfWindow)).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    }
    for (const key of ['a', 'enter', 'backspace', 'delete', 'escape']) {
      expect(h.editor.consumesKey(key, h.primary.pdfWindow)).toBe(true);
      expect(h.editor.consumesKey(key, h.secondary.pdfWindow)).toBe(false);
    }
    expect(h.editor.consumesKey('arrowleft', h.primary.pdfWindow)).toBe(false);
    expect(h.annotation.saveTx).not.toHaveBeenCalled();
    expect(h.editor.hasInput).toBe(true);
    h.editor.dispose();
  });

  it.each([
    { isComposing: true },
    { key: 'Process' },
    { keyCode: 229 },
    { activeComposition: true },
  ])('does not treat IME-owned Escape as a save command: %j', async (state) => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    if ('activeComposition' in state) input.emit('compositionstart');
    const event = keyboard('Escape', input, 'activeComposition' in state ? {} : state);
    h.primary.dispatchSystemKey(event);
    expect(h.editor.handleKey(event, h.primary.pdfWindow)).toBe(true);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(h.editor.ownsInput).toBe(true);
    expect(h.annotationForSave).not.toHaveBeenCalled();
    if ('activeComposition' in state) {
      expect(h.editor.consumesKey('escape', h.primary.pdfWindow)).toBe(false);
      input.emit('compositionend');
      h.editor.handleKey(keyboard('Escape', input), h.primary.pdfWindow);
      await settleJobs();
      expect(h.editor.ownsInput).toBe(false);
    }
    h.editor.dispose();
  });

  it('saves the captured annotation target and multiline draft when real Esc reaches only the system group', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    input.value = 'line one\nline two';
    h.setActiveWindow(h.secondary.pdfWindow);
    const eventTarget = {} as EventTarget;
    h.nativeTargets.set(eventTarget, input);
    const event = keyboard('Escape', eventTarget, { defaultPrevented: true });

    h.primary.dispatchSystemKey(event);
    expect(h.editor.ownsInput).toBe(false);
    expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
    expect(h.primary.mounted).toHaveLength(0);
    expect(h.primary.systemKeys.size).toBe(0);
    await settleJobs();

    expect(h.annotationForSave).toHaveBeenCalledWith({ key: 'ANN', itemID: 7, libraryID: 2 });
    expect(h.annotation.annotationComment).toBe('line one\nline two');
    expect(h.other.annotationComment).toBe('other draft');
    expect(h.annotation.saveTx).toHaveBeenCalledOnce();
    expect(h.onExit).toHaveBeenCalledWith(true, h.primary.pdfWindow);
    h.editor.dispose();
  });

  it('does not save twice if one Escape is delivered in normal and system groups', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    input.value = 'saved once';
    const event = keyboard('Escape', input);
    const systemListener = [...h.primary.systemKeys][0]!;
    h.editor.handleKey(event, h.primary.pdfWindow);
    systemListener(event);
    await settleJobs();

    expect(h.annotationForSave).toHaveBeenCalledOnce();
    expect(h.annotation.saveTx).toHaveBeenCalledOnce();
    expect(h.onExit).toHaveBeenCalledOnce();
    h.editor.dispose();
  });

  it('debounces edits for two seconds, preserves newlines and skips unchanged final saves', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    input.value = 'first';
    input.emit('input');
    vi.advanceTimersByTime(1000);
    input.value = 'first\nsecond';
    input.emit('input');
    vi.advanceTimersByTime(1999);
    expect(h.annotationForSave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await settleJobs();

    expect(h.annotation.annotationComment).toBe('first\nsecond');
    expect(h.annotation.saveTx).toHaveBeenCalledOnce();
    await expect(h.editor.exit()).resolves.toBe(true);
    expect(h.annotation.saveTx).toHaveBeenCalledOnce();
    expect(h.cleanupTheme).toHaveBeenCalledOnce();
  });

  it.each(['deleted', 'missing'] as const)(
    'does not resurrect a %s annotation on final save',
    async (state) => {
      const h = createHarness();
      await h.editor.open('ANN');
      h.primary.input().value = 'new draft';
      h.annotationForSave.mockResolvedValueOnce(
        state === 'missing' ? null : { ...h.annotation, deleted: true },
      );
      await expect(h.editor.exit()).resolves.toBe(false);

      expect(h.annotation.saveTx).not.toHaveBeenCalled();
      expect(h.annotation.annotationComment).toBe('before');
      expect(h.editor.ownsInput).toBe(false);
      expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
    },
  );

  it('reports asynchronous keyboard-save failure after synchronously restoring host behavior', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    input.value = 'draft';
    vi.mocked(h.annotation.saveTx).mockRejectedValueOnce(new Error('storage failed'));
    h.primary.dispatchSystemKey(keyboard('Escape', input));

    expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
    expect(h.editor.ownsInput).toBe(false);
    await settleJobs();
    expect(h.onExit).toHaveBeenCalledWith(false, h.primary.pdfWindow);
    expect(vi.getTimerCount()).toBe(0);
    h.editor.dispose();
  });
});

describe('ReaderCommentEditor stale work containment', () => {
  it('drains a pending owner when its document is replaced before lookup resolves', async () => {
    const h = createHarness();
    const pending = Promise.withResolvers<AnnotationRuntime>();
    h.resolveAnnotation.mockReturnValueOnce(pending.promise);
    const opening = h.editor.open('ANN');
    Reflect.set(h.primary.pdfWindow, 'document', h.secondary.document);
    pending.resolve(h.annotation);
    await opening;
    expect(h.primary.systemKeys.size).toBe(0);
    expect(h.primary.mounted).toHaveLength(0);
    expect(h.secondary.mounted).toHaveLength(0);
    expect(h.editor.ownsInput).toBe(false);
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('does not adopt a replacement document installed during retirement', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    h.resolveAnnotation.mockClear();
    h.navigate.mockClear();
    h.onInputOwnerChanged.mockImplementationOnce(() => {
      Reflect.set(h.primary.pdfWindow, 'document', h.secondary.document);
    });
    await h.editor.open('OTHER');
    expect(h.editor.ownsInput).toBe(false);
    expect(h.primary.systemKeys.size).toBe(0);
    expect(h.primary.mounted).toHaveLength(0);
    expect(h.secondary.mounted).toHaveLength(0);
    expect(h.resolveAnnotation).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
  });

  it('rejects events and timers from an invalid view while still draining its resources', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    input.value = 'unadmitted draft';
    input.emit('input');
    h.retireCapturedViews();
    const escape = keyboard('Escape', input);
    h.primary.dispatchSystemKey(escape);
    vi.advanceTimersByTime(3000);
    expect(escape.preventDefault).not.toHaveBeenCalled();
    expect(input.focus).not.toHaveBeenCalled();
    expect(h.annotationForSave).not.toHaveBeenCalled();
    h.editor.releaseView(h.primary.pdfWindow);
    expect(h.primary.systemKeys.size).toBe(0);
    expect(h.primary.mounted).toHaveLength(0);
    expect(h.cleanupTheme).toHaveBeenCalledOnce();
    expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
  });

  it('does not notify exit after the captured view retires while final persistence completes', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    input.value = 'final draft';
    const pending = Promise.withResolvers<AnnotationRuntime>();
    h.annotationForSave.mockReturnValueOnce(pending.promise);
    h.editor.handleKey(keyboard('Escape', input), h.primary.pdfWindow);
    h.retireCapturedViews();
    pending.resolve(h.annotation);
    await settleJobs();
    expect(h.annotation.annotationComment).toBe('final draft');
    expect(h.annotation.saveTx).toHaveBeenCalledOnce();
    expect(h.onExit).not.toHaveBeenCalled();
  });

  it('ignores a retained system listener after reopening in the same view', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const stale = [...h.primary.systemKeys][0]!;
    await h.editor.open('OTHER');
    const input = h.primary.input();
    const event = keyboard('Escape', input);
    stale(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(h.editor.ownsInput).toBe(true);
    expect(input.value).toBe('other draft');
    h.editor.dispose();
  });

  it('does not overwrite an editor opened reentrantly during retirement', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    h.onInputOwnerChanged.mockImplementationOnce(() => {
      void h.editor.open('OTHER');
    });
    await h.editor.open('ANN');
    await settleJobs();
    expect(h.primary.input().value).toBe('other draft');
    expect(h.primary.mounted).toHaveLength(1);
    h.editor.dispose();
  });

  it('cleans a theme lease returned after reentrant disposal', async () => {
    const h = createHarness();
    h.themeRoot.mockImplementationOnce(() => {
      h.editor.dispose();
      return h.cleanupTheme;
    });
    await h.editor.open('ANN');
    expect(h.cleanupTheme).toHaveBeenCalledOnce();
    expect(h.primary.mounted).toHaveLength(0);
    expect(h.primary.systemKeys.size).toBe(0);
    expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
  });

  it.each(['release', 'dispose', 'reopen'] as const)(
    'completes an accepted autosave after %s without retargeting it',
    async (action) => {
      const h = createHarness();
      await h.editor.open('ANN');
      const input = h.primary.input();
      input.value = 'stale autosave';
      const pending = Promise.withResolvers<AnnotationRuntime>();
      h.annotationForSave.mockReturnValueOnce(pending.promise);
      input.emit('input');
      vi.advanceTimersByTime(2000);
      if (action === 'release') h.editor.releaseView(h.primary.pdfWindow);
      else if (action === 'dispose') h.editor.dispose();
      else await h.editor.open('OTHER');
      pending.resolve(h.annotation);
      await settleJobs();

      expect(h.annotation.annotationComment).toBe('stale autosave');
      expect(h.annotation.saveTx).toHaveBeenCalledOnce();
      if (action === 'reopen') {
        expect(h.primary.input().value).toBe('other draft');
        expect(h.internal._enableAnnotationDeletionFromComment).toBe(false);
      }
      h.editor.dispose();
    },
  );

  it('serializes an older autosave and keeps the newer draft for the next save', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    const pending = Promise.withResolvers<AnnotationRuntime>();
    h.annotationForSave.mockReturnValueOnce(pending.promise);
    input.value = 'old';
    input.emit('input');
    vi.advanceTimersByTime(2000);
    input.value = 'new';
    input.emit('input');
    pending.resolve(h.annotation);
    await settleJobs();
    expect(h.annotation.annotationComment).toBe('old');
    vi.advanceTimersByTime(2000);
    await settleJobs();
    expect(h.annotation.annotationComment).toBe('new');
    expect(h.annotation.saveTx).toHaveBeenCalledTimes(2);
    h.editor.dispose();
  });

  it('reports autosave failure without closing or losing the editable draft', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    input.value = 'retained draft';
    h.annotationForSave.mockRejectedValueOnce(new Error('autosave lookup failed'));
    input.emit('input');
    vi.advanceTimersByTime(2000);
    await settleJobs();

    expect(commentBridge.model?.canRetry).toBe(true);
    expect(h.editor.ownsInput).toBe(true);
    expect(input.value).toBe('retained draft');
    await expect(h.editor.exit()).resolves.toBe(true);
    expect(h.annotation.annotationComment).toBe('retained draft');
  });

  it('a closing save cannot restore an old deletion override or exit notification over a reopened editor', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    input.value = 'captured final draft';
    const pendingSave = Promise.withResolvers<void>();
    vi.mocked(h.annotation.saveTx).mockReturnValueOnce(pendingSave.promise);
    h.editor.handleKey(keyboard('Escape', input), h.primary.pdfWindow);
    expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
    await settleJobs();
    await h.editor.open('OTHER');
    const reopened = h.primary.input();
    pendingSave.resolve();
    await settleJobs();

    expect(h.editor.ownsInput).toBe(true);
    expect(reopened.value).toBe('other draft');
    expect(h.internal._enableAnnotationDeletionFromComment).toBe(false);
    expect(h.onExit).not.toHaveBeenCalled();
    expect(h.annotation.annotationComment).toBe('captured final draft');
    h.editor.dispose();
    expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
  });

  it('contains a cancelled focus callback even if it executes after reopen', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const oldInput = h.primary.input();
    const staleFocus = h.scheduled.find((task) => task.delay === 60)!.task;
    h.editor.releaseView(h.primary.pdfWindow);
    h.setActiveWindow(h.secondary.pdfWindow);
    await h.editor.open('OTHER');
    const current = h.secondary.input();
    staleFocus();
    expect(oldInput.focus).not.toHaveBeenCalled();
    expect(current.focus).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(current.focus).toHaveBeenCalledOnce();
    h.editor.dispose();
    vi.advanceTimersByTime(2000);
    expect(current.focus).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['initial', 'watchdog'] as const)(
    'yields to a native editor instead of stealing focus from the %s callback',
    async (stage) => {
      const h = createHarness();
      h.onNativeEditorFocus.mockImplementation(() => {
        void h.editor.handOver();
      });
      await h.editor.open('ANN');
      const input = h.primary.input();
      input.value = 'handoff draft';
      if (stage === 'watchdog') vi.advanceTimersByTime(60);
      h.setNativeEditableFocused(true);
      vi.advanceTimersByTime(stage === 'initial' ? 60 : 500);
      expect(h.editor.ownsInput).toBe(false);
      expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
      await settleJobs();
      expect(h.annotation.annotationComment).toBe('handoff draft');
      expect(input.focus).toHaveBeenCalledTimes(stage === 'initial' ? 0 : 1);
      vi.advanceTimersByTime(2000);
      expect(h.onNativeEditorFocus).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not reclaim focus during composition and resumes only after composition ends', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const input = h.primary.input();
    vi.advanceTimersByTime(60);
    input.emit('compositionstart');
    h.primary.document.activeElement = null;
    vi.advanceTimersByTime(500);
    expect(input.focus).toHaveBeenCalledOnce();
    input.emit('compositionend');
    vi.advanceTimersByTime(500);
    expect(input.focus).toHaveBeenCalledTimes(2);
    h.editor.dispose();
  });

  it('restores only the captured native deletion owner when the Reader replaces its internals', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    expect(h.internal._enableAnnotationDeletionFromComment).toBe(false);
    const replacement = { _enableAnnotationDeletionFromComment: false };
    Reflect.set(h.reader, '_internalReader', replacement);

    h.editor.releaseView(h.primary.pdfWindow);

    expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
    expect(replacement._enableAnnotationDeletionFromComment).toBe(false);
    expect(h.editor.ownsInput).toBe(false);
    expect(h.primary.systemKeys.size).toBe(0);
    h.editor.dispose();
  });

  it('restores an originally absent deletion flag synchronously even when final persistence rejects', async () => {
    const h = createHarness();
    h.internal._enableAnnotationDeletionFromComment = undefined;
    await h.editor.open('ANN');
    h.primary.input().value = 'final';
    const pending = Promise.withResolvers<AnnotationRuntime>();
    h.annotationForSave.mockReturnValueOnce(pending.promise);
    const exiting = h.editor.exit();
    expect(h.internal._enableAnnotationDeletionFromComment).toBeUndefined();
    expect(h.editor.ownsInput).toBe(false);
    expect(h.primary.systemKeys.size).toBe(0);
    pending.reject(new Error('save target lookup failed'));
    await expect(exiting).resolves.toBe(false);
  });
});

describe('ReaderCommentEditor failure-safe retirement', () => {
  it('removes already installed input listeners when a later listener acquisition fails', async () => {
    const h = createHarness();
    const createElement = h.primary.document.createElement;
    let input: FakeElement | undefined;
    vi.spyOn(h.primary.document, 'createElement').mockImplementation((tag) => {
      const element = createElement(tag);
      if (tag === 'textarea') {
        input = element;
        const add = element.addEventListener.bind(element);
        vi.spyOn(element, 'addEventListener').mockImplementation((type, listener, options) => {
          if (type === 'compositionend') throw new Error('listener acquisition failed');
          add(type, listener, options);
        });
        vi.spyOn(element, 'removeEventListener');
      }
      return element;
    });
    await h.editor.open('ANN');
    expect(input?.removeEventListener).toHaveBeenCalledWith(
      'compositionstart',
      expect.any(Function),
    );
    expect(h.editor.ownsInput).toBe(false);
    expect(h.primary.systemKeys.size).toBe(0);
    expect(h.primary.mounted).toHaveLength(0);
    expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
    expect(h.debug).toHaveBeenCalledWith(expect.stringContaining('listener acquisition failed'));
  });

  it.each(['view', 'input'] as const)(
    'retires a destroyed comment %s without touching dead wrappers or reviving focus and autosave',
    async (destroyedOwner) => {
      const h = createHarness();
      const guard = createPopupGuard(h.reader);
      await h.editor.open('ANN');
      const input = h.primary.input();
      const overlay = h.primary.mounted[0]!;
      const removeInputListeners = vi.spyOn(input, 'removeEventListener').mockImplementation(() => {
        throw new Error('dead input wrapper');
      });
      h.destroyed.add(input);
      if (destroyedOwner === 'view') {
        h.destroyed.add(h.primary.pdfWindow);
        h.destroyed.add(overlay);
        vi.spyOn(h.primary.privilegedWindow, 'removeEventListener').mockImplementation(() => {
          throw new Error('dead window wrapper');
        });
        vi.spyOn(overlay, 'remove').mockImplementation(() => {
          throw new Error('dead overlay wrapper');
        });
      }
      input.value = 'discarded draft';
      input.emit('input');
      const retainedTasks = [...h.scheduled];
      guard.deliverPopup();
      expect(guard.popupInput.dispatchEvent).toHaveBeenCalledOnce();

      expect(() => h.editor.releaseView(h.primary.pdfWindow)).not.toThrow();

      expect(h.editor.ownsInput).toBe(false);
      expect(h.editor.hasInput).toBe(false);
      expect(h.editor.ownsTarget(input)).toBe(false);
      expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
      expect(removeInputListeners).not.toHaveBeenCalled();
      expect(guard.disconnect).toHaveBeenCalledOnce();
      expect(h.cleanupTheme).toHaveBeenCalledOnce();
      if (destroyedOwner === 'input') expect(h.primary.systemKeys.size).toBe(0);
      for (const task of retainedTasks) task.task();
      input.emit('input');
      guard.deliverPopup();
      guard.deliverRetainedPopup();
      vi.advanceTimersByTime(3000);
      expect(input.focus).not.toHaveBeenCalled();
      expect(h.annotationForSave).not.toHaveBeenCalled();
      expect(h.annotation.annotationComment).toBe('before');
      expect(guard.popupInput.dispatchEvent).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      h.editor.dispose();
    },
  );

  it.each(['system listener', 'input listener', 'theme', 'overlay'] as const)(
    'preserves a live %s cleanup failure after retiring every owner and restoring native deletion',
    async (failureSite) => {
      const h = createHarness();
      const guard = createPopupGuard(h.reader);
      await h.editor.open('ANN');
      const input = h.primary.input();
      const retainedSystemListener = [...h.primary.systemKeys][0]!;
      vi.advanceTimersByTime(60);
      input.value = 'unsaved draft';
      input.emit('input');
      const retainedTasks = [...h.scheduled];
      const failure = new Error(`live ${failureSite} cleanup failed`);
      const fail = () => {
        expect(h.editor.ownsInput).toBe(false);
        expect(h.editor.hasInput).toBe(false);
        expect(h.editor.ownsTarget(input)).toBe(false);
        throw failure;
      };
      if (failureSite === 'system listener')
        vi.spyOn(h.primary.privilegedWindow, 'removeEventListener').mockImplementationOnce(fail);
      else if (failureSite === 'input listener')
        vi.spyOn(input, 'removeEventListener').mockImplementationOnce(fail);
      else if (failureSite === 'theme') h.cleanupTheme.mockImplementationOnce(fail);
      else vi.spyOn(h.primary.mounted[0]!, 'remove').mockImplementationOnce(fail);

      let thrown: unknown;
      try {
        h.editor.releaseView(h.primary.pdfWindow);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(failure);
      expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
      expect(h.editor.ownsView(h.primary.pdfWindow)).toBe(false);
      expect(h.editor.consumesKey('escape', h.primary.pdfWindow)).toBe(false);
      expect(guard.disconnect).toHaveBeenCalledOnce();
      expect(h.cleanupTheme).toHaveBeenCalledOnce();
      expect(h.primary.mounted).toHaveLength(failureSite === 'overlay' ? 1 : 0);
      expect(h.onInputOwnerChanged).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
      for (const task of retainedTasks) task.task();
      input.emit('input');
      input.emit('compositionstart');
      const escape = keyboard('Escape', input);
      retainedSystemListener(escape);
      guard.deliverRetainedPopup();
      vi.advanceTimersByTime(3000);
      expect(input.focus).toHaveBeenCalledOnce();
      expect(escape.preventDefault).not.toHaveBeenCalled();
      expect(h.annotationForSave).not.toHaveBeenCalled();
      expect(guard.popupInput.dispatchEvent).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);

      h.setActiveWindow(h.secondary.pdfWindow);
      await h.editor.open('OTHER');
      expect(h.editor.ownsView(h.secondary.pdfWindow)).toBe(true);
      expect(h.secondary.input().value).toBe('other draft');
      expect(h.editor.consumesKey('escape', h.secondary.pdfWindow)).toBe(true);
      h.editor.dispose();
      expect(h.internal._enableAnnotationDeletionFromComment).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

describe('annotation comment durable drafts', () => {
  it('exposes a copyable draft on forced retirement and recovers it even while storage is unreadable', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const services = Reflect.get(globalThis, 'Services');
    const prefs = services.prefs;
    const setStringPref = prefs.setStringPref;
    const getPrefType = prefs.getPrefType;
    const prompt = vi.fn(() => false);
    services.prompt = { prompt };
    prefs.setStringPref = () => {
      throw new Error('storage unavailable');
    };
    h.primary.input().value = 'copy this draft';
    h.primary.input().emit('input');
    h.editor.releaseView(h.primary.pdfWindow);
    expect(prompt).toHaveBeenCalledWith(
      null,
      'Zotero Neo',
      expect.stringContaining('Copy'),
      { value: 'copy this draft' },
      null,
      { value: false },
    );
    prefs.getPrefType = () => {
      throw new Error('storage unreadable');
    };
    await h.editor.open('ANN');
    expect(h.primary.input().value).toBe('copy this draft');
    expect(commentBridge.model?.status).toBe('Local draft storage failed');
    prefs.getPrefType = getPrefType;
    prefs.setStringPref = setStringPref;
    commentBridge.dispatch?.('retry');
    await settleJobs();
    expect(h.annotation.annotationComment).toBe('copy this draft');
    expect(h.annotation.saveTx).toHaveBeenCalledOnce();
    h.editor.dispose();
  });

  it('blocks Esc on local storage failure and lets the user retry without losing input', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const prefs = Reflect.get(Reflect.get(globalThis, 'Services'), 'prefs');
    const setStringPref = prefs.setStringPref;
    prefs.setStringPref = () => {
      throw new Error('disk unavailable');
    };
    const input = h.primary.input();
    input.value = 'unsaved local text';
    input.emit('input');
    h.primary.dispatchSystemKey(keyboard('Escape', input));
    expect(h.editor.ownsInput).toBe(true);
    expect(input.value).toBe('unsaved local text');
    expect(commentBridge.model?.canRetry).toBe(true);
    prefs.setStringPref = setStringPref;
    commentBridge.dispatch?.('retry');
    await settleJobs();
    expect(h.annotation.annotationComment).toBe('unsaved local text');
    h.editor.dispose();
  });

  it('restores an input immediately after view retirement without waiting for autosave', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    h.primary.input().value = 'recover me';
    h.primary.input().emit('input');
    h.editor.releaseView(h.primary.pdfWindow);
    await h.editor.open('ANN');
    expect(h.primary.input().value).toBe('recover me');
    expect(h.annotation.annotationComment).toBe('before');
    h.editor.dispose();
  });

  it('retains a failed save across reopening and retries explicitly', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    h.primary.input().value = 'retry me';
    h.primary.input().emit('input');
    vi.mocked(h.annotation.saveTx).mockRejectedValueOnce(new Error('failed'));
    expect(await h.editor.exit()).toBe(false);
    await h.editor.open('ANN');
    expect(h.primary.input().value).toBe('retry me');
    commentBridge.dispatch?.('retry');
    await settleJobs();
    expect(h.annotation.annotationComment).toBe('retry me');
    expect(h.annotation.saveTx).toHaveBeenCalledTimes(2);
    h.editor.dispose();
  });

  it('keeps an external edit on conflict until an explicit overwrite', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    h.primary.input().value = 'local draft';
    h.primary.input().emit('input');
    h.editor.releaseView(h.primary.pdfWindow);
    h.annotation.annotationComment = 'external edit';
    await h.editor.open('ANN');
    expect(h.primary.input().value).toBe('local draft');
    expect(commentBridge.model?.canOverwrite).toBe(true);
    expect(await h.editor.exit()).toBe(false);
    expect(h.annotation.annotationComment).toBe('external edit');
    await h.editor.open('ANN');
    commentBridge.dispatch?.('overwrite');
    await settleJobs();
    expect(h.annotation.annotationComment).toBe('local draft');
    h.editor.dispose();
  });

  it.each([false, true])(
    'advances the recovered draft baseline after an older save (external change: %s)',
    async (externalChange) => {
      const h = createHarness();
      await h.editor.open('ANN');
      const lookup = Promise.withResolvers<AnnotationRuntime>();
      h.annotationForSave.mockReturnValueOnce(lookup.promise);
      h.primary.input().value = 'first';
      h.primary.input().emit('input');
      vi.advanceTimersByTime(2000);
      await settleJobs();
      expect(h.annotationForSave).toHaveBeenCalledOnce();

      h.editor.releaseView(h.primary.pdfWindow);
      await h.editor.open('ANN');
      expect(h.primary.input().value).toBe('first');
      h.primary.input().value = 'newer';
      h.primary.input().emit('input');
      lookup.resolve(h.annotation);
      await settleJobs();
      expect(h.annotation.annotationComment).toBe('first');

      if (externalChange) h.annotation.annotationComment = 'external';
      vi.advanceTimersByTime(2000);
      await settleJobs();
      expect(h.annotation.annotationComment).toBe(externalChange ? 'external' : 'newer');
      expect(commentBridge.model?.canOverwrite).toBe(externalChange);
      expect(h.annotation.saveTx).toHaveBeenCalledTimes(externalChange ? 1 : 2);
      h.editor.dispose();
    },
  );

  it('does not remove a newer draft when an older save completes', async () => {
    const h = createHarness();
    await h.editor.open('ANN');
    const pending = Promise.withResolvers<void>();
    vi.mocked(h.annotation.saveTx).mockReturnValueOnce(pending.promise);
    h.primary.input().value = 'old';
    h.primary.input().emit('input');
    vi.advanceTimersByTime(2000);
    await settleJobs();
    h.primary.input().value = 'new';
    h.primary.input().emit('input');
    h.editor.releaseView(h.primary.pdfWindow);
    pending.resolve();
    await settleJobs();
    await h.editor.open('ANN');
    expect(h.primary.input().value).toBe('new');
    h.editor.dispose();
  });
});
