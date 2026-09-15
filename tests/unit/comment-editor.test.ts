import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderCommentEditor, type AnnotationCommentTarget } from '../../src/reader/comment-editor';
import type {
  AnnotationRuntime,
  PdfWindow,
  ReaderRuntime,
  ReaderTimer,
} from '../../src/reader/types';

afterEach(() => {
  vi.useRealTimers();
});

type FakeElement = HTMLElement & {
  value: string;
  emit(type: string): void;
  focus: ReturnType<typeof vi.fn>;
};

function createHarness() {
  vi.useFakeTimers();
  const allElements: FakeElement[] = [];
  const bodyChildren: FakeElement[] = [];
  const document = {
    defaultView: null as Window | null,
    activeElement: null as Element | null,
    body: {
      appendChild: (node: FakeElement) => bodyChildren.push(node),
    },
    createElement: (_tag: string) => {
      const listeners = new Map<string, (() => void)[]>();
      const children: FakeElement[] = [];
      const element = {
        id: '',
        ownerDocument: document,
        style: { cssText: '' },
        textContent: '',
        value: '',
        spellcheck: false,
        selectionStart: 0,
        selectionEnd: 0,
        isConnected: true,
        appendChild: (node: FakeElement) => children.push(node),
        append: (...nodes: FakeElement[]) => children.push(...nodes),
        addEventListener: (type: string, listener: () => void) => {
          const current = listeners.get(type) ?? [];
          current.push(listener);
          listeners.set(type, current);
        },
        emit: (type: string) => {
          for (const listener of listeners.get(type) ?? []) listener();
        },
        focus: vi.fn(() => {
          document.activeElement = element as unknown as Element;
        }),
        remove: vi.fn(() => {
          const index = bodyChildren.indexOf(element as unknown as FakeElement);
          if (index >= 0) bodyChildren.splice(index, 1);
          Reflect.set(element, 'isConnected', false);
        }),
      } as unknown as FakeElement;
      allElements.push(element);
      return element;
    },
  };
  const pdfWindow = { document } as unknown as PdfWindow;
  document.defaultView = pdfWindow;

  const navigate = vi.fn();
  const internal = {
    navigate,
    _enableAnnotationDeletionFromComment: true,
  };
  const reader = {
    _iframeWindow: { document: { body: {} } } as unknown as Window,
    _internalReader: internal,
  } as unknown as ReaderRuntime;
  const saveTx = vi.fn(async () => {});
  const annotation = {
    id: 7,
    key: 'ANN',
    libraryID: 2,
    annotationText: 'Quoted\ntext',
    annotationComment: 'before',
    saveTx,
  } as AnnotationRuntime;
  let resolveAnnotation: (value: AnnotationRuntime | null) => void = () => {};
  let pendingResolve = false;
  const resolve = vi.fn((key: string) => {
    if (!pendingResolve) return Promise.resolve(key === 'ANN' ? annotation : null);
    return new Promise<AnnotationRuntime | null>((done) => {
      resolveAnnotation = done;
    });
  });
  const annotationForSave = vi.fn(async (_target: AnnotationCommentTarget) => annotation);
  const cleanupTheme = vi.fn();
  let nativeEditableFocused = false;
  const onNativeEditorFocus = vi.fn();
  const editor = new ReaderCommentEditor({
    reader,
    schedule: (delay, task) => setTimeout(task, delay) as ReaderTimer,
    clearTimer: (timer) => clearTimeout(timer ?? undefined),
    themeRoot: () => cleanupTheme,
    activePdfWindow: () => pdfWindow,
    resolveAnnotation: resolve,
    annotationForSave,
    nativeEditableFocused: () => nativeEditableFocused,
    onNativeEditorFocus,
    locale: () => 'en-US',
  });
  return {
    editor,
    annotation,
    saveTx,
    navigate,
    internal,
    document,
    pdfWindow,
    bodyChildren,
    allElements,
    annotationForSave,
    cleanupTheme,
    onNativeEditorFocus,
    setNativeEditableFocused: (value: boolean) => {
      nativeEditableFocused = value;
    },
    deferResolution: () => {
      pendingResolve = true;
    },
    resolvePending: (value: AnnotationRuntime | null) => resolveAnnotation(value),
  };
}

function commentInput(harness: ReturnType<typeof createHarness>): FakeElement {
  const input = harness.allElements.find((element) => element.id === 'zv-annotation-comment-input');
  if (!input) throw new Error('Expected comment input');
  return input;
}

describe('ReaderCommentEditor', () => {
  it('mounts, autosaves, exits, and restores Zotero comment deletion behavior', async () => {
    const harness = createHarness();

    await harness.editor.open('ANN');
    expect(harness.editor.hasInput).toBe(true);
    expect(harness.navigate).toHaveBeenCalledWith({ annotationID: 'ANN' });
    expect(harness.internal._enableAnnotationDeletionFromComment).toBe(false);

    vi.advanceTimersByTime(60);
    const input = commentInput(harness);
    expect(input.focus).toHaveBeenCalledOnce();
    input.value = 'after';
    input.emit('input');
    vi.advanceTimersByTime(2000);
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.annotation.annotationComment).toBe('after');
    expect(harness.saveTx).toHaveBeenCalledOnce();

    await expect(harness.editor.exit()).resolves.toBe(true);
    expect(harness.editor.hasInput).toBe(false);
    expect(harness.internal._enableAnnotationDeletionFromComment).toBe(true);
    expect(harness.cleanupTheme).toHaveBeenCalledOnce();
  });

  it('restores Zotero comment deletion behavior even when explicit save fails', async () => {
    const harness = createHarness();
    await harness.editor.open('ANN');
    vi.advanceTimersByTime(60);
    const input = commentInput(harness);
    input.value = 'unsaved change';
    harness.saveTx.mockRejectedValueOnce(new Error('save failed'));

    await expect(harness.editor.exit()).rejects.toThrow('save failed');

    expect(harness.editor.hasInput).toBe(false);
    expect(harness.internal._enableAnnotationDeletionFromComment).toBe(true);
  });

  it('does not mount stale async annotation work after invalidation', async () => {
    const harness = createHarness();
    harness.deferResolution();

    const opening = harness.editor.open('ANN');
    harness.editor.invalidate();
    harness.resolvePending(harness.annotation);
    await opening;

    expect(harness.editor.hasInput).toBe(false);
    expect(harness.navigate).not.toHaveBeenCalled();
    expect(harness.bodyChildren).toHaveLength(0);
  });

  it('stops focus work and restores the host flag when its PDF view is released', async () => {
    const harness = createHarness();
    await harness.editor.open('ANN');
    vi.advanceTimersByTime(60);
    const input = commentInput(harness);
    expect(input.focus).toHaveBeenCalledOnce();

    harness.editor.releaseView(harness.pdfWindow);
    expect(harness.editor.hasInput).toBe(false);
    expect(harness.internal._enableAnnotationDeletionFromComment).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(input.focus).toHaveBeenCalledOnce();
  });

  it('hands focus to a native annotation editor instead of reclaiming it', async () => {
    const harness = createHarness();
    await harness.editor.open('ANN');
    vi.advanceTimersByTime(60);
    harness.setNativeEditableFocused(true);

    vi.advanceTimersByTime(500);

    expect(harness.onNativeEditorFocus).toHaveBeenCalledOnce();
  });

  it('does not reclaim focus while IME composition is active', async () => {
    const harness = createHarness();
    await harness.editor.open('ANN');
    vi.advanceTimersByTime(60);
    const input = commentInput(harness);
    input.emit('compositionstart');
    harness.document.activeElement = null;

    vi.advanceTimersByTime(500);
    expect(input.focus).toHaveBeenCalledOnce();

    input.emit('compositionend');
    vi.advanceTimersByTime(500);
    expect(input.focus).toHaveBeenCalledTimes(2);
  });
});
