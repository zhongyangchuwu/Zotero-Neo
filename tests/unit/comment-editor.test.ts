import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import { ReaderCommentEditor, type AnnotationCommentTarget } from '../../src/reader/comment-editor';
import type {
  AnnotationRuntime,
  PdfWindow,
  ReaderRuntime,
  ReaderTimer,
} from '../../src/reader/types';

const originalComponents = Reflect.get(globalThis, 'Components');

afterEach(() => {
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
  const nativeTargets = new WeakMap<object, object>();
  Reflect.set(globalThis, 'Components', {
    utils: {
      cloneInto: <T extends object>(value: T) => ({ ...value }),
      waiveXrays: <T extends object>(value: T) => nativeTargets.get(value) ?? value,
      unwaiveXrays: (value: PdfWindow) =>
        value === primary.pdfWindow ? primary.privilegedWindow : secondary.privilegedWindow,
    },
  });
  const primary = createView();
  const secondary = createView();
  let activeWindow: PdfWindow | null = primary.pdfWindow;
  let nativeEditableFocused = false;
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
    themeRoot: () => cleanupTheme,
    activePdfWindow: () => activeWindow,
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
    onInputOwnerChanged,
    onNativeEditorFocus,
    onExit,
    debug,
    scheduled,
    setActiveWindow: (window: PdfWindow | null) => {
      activeWindow = window;
    },
    setNativeEditableFocused: (value: boolean) => {
      nativeEditableFocused = value;
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
    expect(h.debug).toHaveBeenCalledWith(expect.stringContaining('storage failed'));
    expect(h.onExit).toHaveBeenCalledWith(false, h.primary.pdfWindow);
    expect(vi.getTimerCount()).toBe(0);
    h.editor.dispose();
  });
});

describe('ReaderCommentEditor stale work containment', () => {
  it.each(['release', 'dispose', 'reopen'] as const)(
    'ignores an autosave lookup that resolves after %s',
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

      expect(h.annotation.annotationComment).toBe('before');
      expect(h.annotation.saveTx).not.toHaveBeenCalled();
      if (action === 'reopen') {
        expect(h.primary.input().value).toBe('other draft');
        expect(h.internal._enableAnnotationDeletionFromComment).toBe(false);
      }
      h.editor.dispose();
    },
  );

  it('ignores an older autosave draft after a later edit, then saves the current draft', async () => {
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
    expect(h.annotation.annotationComment).toBe('before');
    vi.advanceTimersByTime(2000);
    await settleJobs();
    expect(h.annotation.annotationComment).toBe('new');
    expect(h.annotation.saveTx).toHaveBeenCalledOnce();
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

    expect(h.debug).toHaveBeenCalledWith(expect.stringContaining('autosave lookup failed'));
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
    await expect(exiting).rejects.toThrow('save target lookup failed');
  });
});
