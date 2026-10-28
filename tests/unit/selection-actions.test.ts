import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReaderSelectionActionRegistry } from '../../src/modules/reader-selection/registry';
import {
  ReaderSelectionActions,
  type ReaderSelectionActionHost,
} from '../../src/modules/reader-selection/selection-actions';
import type {
  ReaderSelectionActionDefinition,
  ReaderSelectionContext,
} from '../../src/core/contracts';
import type { PdfWindow } from '../../src/reader/types';

function createPalette(
  host: Omit<ReaderSelectionActionHost, 'isCurrent' | 'captureView' | 'capturePresentation'> &
    Partial<Pick<ReaderSelectionActionHost, 'isCurrent' | 'captureView' | 'capturePresentation'>>,
) {
  return new ReaderSelectionActions({
    isCurrent: () => true,
    captureView: () => () => true,
    capturePresentation: () => () => true,
    ...host,
  });
}

const originalComponents = Reflect.get(globalThis, 'Components');
let deadObjects = new WeakSet<object>();
beforeEach(() => {
  deadObjects = new WeakSet();
  Reflect.set(globalThis, 'Components', {
    utils: { isDeadWrapper: (value: object) => deadObjects.has(value) },
  });
});
afterEach(() => {
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

const context: ReaderSelectionContext = {
  text: 'selected text',
  itemID: 42,
  pageLabel: '7',
  position: '{"pageIndex":6}',
};

function key(value: string, state: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: value,
    ...state,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

function createWindow() {
  const bodyChildren: HTMLElement[] = [];
  const createElement = () => {
    const children: HTMLElement[] = [];
    const element = {
      id: '',
      dataset: {} as Record<string, string>,
      textContent: '',
      style: { cssText: '' },
      ownerDocument: null as unknown as Document,
      append: (...nodes: HTMLElement[]) => children.push(...nodes),
      appendChild: (node: HTMLElement) => children.push(node),
      replaceChildren: (...nodes: HTMLElement[]) => {
        children.splice(0, children.length, ...nodes);
      },
      remove: vi.fn(() => {
        const index = bodyChildren.indexOf(element as unknown as HTMLElement);
        if (index >= 0) bodyChildren.splice(index, 1);
      }),
      children,
    };
    return element as unknown as HTMLElement & { children: HTMLElement[] };
  };
  const document = {
    body: { appendChild: (node: HTMLElement) => bodyChildren.push(node) },
    createElement: () => {
      const element = createElement();
      Reflect.set(element, 'ownerDocument', document);
      return element;
    },
  } as unknown as Document;
  const pdfWindow = { document, focus: vi.fn() } as unknown as PdfWindow;
  return { pdfWindow, bodyChildren };
}

describe('ReaderSelectionActionRegistry', () => {
  it('registers available third-party actions and cleans them up by identity', () => {
    const registry = new ReaderSelectionActionRegistry();
    const cleanup = registry.register({
      id: 'demo.translate',
      label: 'Translate',
      isAvailable: (candidate) => candidate.text.length > 0,
      run: () => {},
    });
    registry.register({
      id: 'demo.hidden',
      label: 'Hidden',
      isAvailable: () => false,
      run: () => {},
    });

    expect(registry.available(context, () => true).map((action) => action.id)).toEqual([
      'demo.translate',
    ]);
    cleanup();
    expect(registry.available(context, () => true)).toHaveLength(0);
  });

  it('rejects duplicate ids instead of silently replacing another plugin action', () => {
    const registry = new ReaderSelectionActionRegistry();
    const action: ReaderSelectionActionDefinition = {
      id: 'same',
      label: 'Same',
      run: () => {},
    };
    registry.register(action);
    expect(() => registry.register(action)).toThrow('already registered');
  });
  it('preserves registrations across disposal and ignores stale disposers', () => {
    const registry = new ReaderSelectionActionRegistry();
    const first = registry.register({ id: ' demo ', label: ' Demo ', run: () => {} });
    const palette = createPalette({
      actions: () => registry.available(context, () => true),
      themeRoot: () => () => {},
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });
    const view = createWindow();
    palette.open(view.pdfWindow, context);
    palette.dispose();
    expect(registry.available(context, () => true).map(({ id, label }) => [id, label])).toEqual([
      ['demo', 'Demo'],
    ]);
    first();
    registry.register({ id: 'demo', label: 'Replacement', run: () => {} });
    first();
    expect(registry.available(context, () => true)[0]?.label).toBe('Replacement');
  });

  it('discards earlier definitions and skips later predicates when a predicate retires the owner', () => {
    const registry = new ReaderSelectionActionRegistry();
    let current = true;
    const later = vi.fn(() => true);
    registry.register({ id: 'first', label: 'First', run: () => {} });
    registry.register({
      id: 'retire',
      label: 'Retire',
      run: () => {},
      isAvailable: () => {
        current = false;
        throw new Error('retired');
      },
    });
    registry.register({ id: 'later', label: 'Later', run: () => {}, isAvailable: later });
    expect(registry.available(context, () => current)).toEqual([]);
    expect(later).not.toHaveBeenCalled();
    expect(registry.available(context, () => current)).toEqual([]);
  });
});

describe('ReaderSelectionActions', () => {
  it('runs the keyboard-selected action with the immutable selection context', async () => {
    const created = createWindow();
    const first = vi.fn();
    const second = vi.fn();
    const palette = createPalette({
      actions: () => [
        { id: 'first', label: 'First', run: first },
        { id: 'second', label: 'Second', run: second },
      ],
      themeRoot: () => () => {},
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });

    expect(palette.open(created.pdfWindow, context)).toBe(true);
    palette.handleKey(key('j'), created.pdfWindow);
    palette.handleKey(key('Enter'), created.pdfWindow);
    await Promise.resolve();
    await Promise.resolve();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(context);
    expect(palette.isOpen).toBe(false);
  });

  it('isolates the action context from later caller mutation', async () => {
    const created = createWindow();
    const run = vi.fn();
    const mutable = { ...context };
    const palette = createPalette({
      actions: () => [{ id: 'capture', label: 'Capture', run }],
      themeRoot: () => () => {},
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });

    expect(palette.open(created.pdfWindow, mutable)).toBe(true);
    mutable.text = 'changed later';
    mutable.pageLabel = '99';
    palette.handleKey(key('Enter'), created.pdfWindow);
    await Promise.resolve();
    await Promise.resolve();

    expect(run).toHaveBeenCalledOnce();
    const snapshot = run.mock.calls[0]?.[0];
    expect(snapshot).toEqual(context);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('keeps returned text in a result view and lets y copy it', async () => {
    const created = createWindow();
    const copyText = vi.fn();
    const palette = createPalette({
      actions: () => [
        {
          id: 'translate',
          label: 'Translate',
          run: async () => ({ title: 'Translation', body: '译文' }),
        },
      ],
      themeRoot: () => () => {},
      copyText,
      showStatus: () => {},
      debug: () => {},
    });

    palette.open(created.pdfWindow, context);
    palette.handleKey(key('Enter'), created.pdfWindow);
    await Promise.resolve();
    await Promise.resolve();
    expect(palette.isOpen).toBe(true);

    palette.handleKey(key('y'), created.pdfWindow);
    expect(copyText).toHaveBeenCalledWith('译文');
    palette.handleKey(key('Escape'), created.pdfWindow);
    expect(palette.isOpen).toBe(false);
  });

  it('keeps IME-owned keys native without closing, navigating, or executing the menu', async () => {
    const created = createWindow();
    const first = vi.fn();
    const second = vi.fn();
    const palette = createPalette({
      actions: () => [
        { id: 'first', label: 'First', run: first },
        { id: 'second', label: 'Second', run: second },
      ],
      themeRoot: () => () => {},
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });
    palette.open(created.pdfWindow, context);
    for (const event of [
      key('Escape', { isComposing: true }),
      key('j', { keyCode: 229 }),
      key('Process'),
    ]) {
      palette.handleKey(event, created.pdfWindow);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
      expect(palette.isOpen).toBe(true);
    }
    const otherView = createWindow();
    const otherIme = key('Escape', { keyCode: 229 });
    expect(palette.handleKey(otherIme, otherView.pdfWindow)).toBe(false);
    expect(otherIme.preventDefault).not.toHaveBeenCalled();
    expect(palette.isOpen).toBe(true);
    palette.handleKey(key('Enter'), created.pdfWindow);
    await Promise.resolve();
    await Promise.resolve();
    expect(first).toHaveBeenCalledWith(context);
    expect(second).not.toHaveBeenCalled();
    expect(palette.isOpen).toBe(false);
  });

  it('shows a completed target receipt only while its invocation still owns the view', async () => {
    const created = createWindow();
    const showStatus = vi.fn();
    let pending = Promise.withResolvers<{ status: string }>();
    const palette = createPalette({
      actions: () => [{ id: 'capture', label: 'Capture', run: () => pending.promise }],
      themeRoot: () => () => {},
      copyText: () => {},
      showStatus,
      debug: () => {},
    });
    palette.open(created.pdfWindow, context);
    palette.handleKey(key('Enter'), created.pdfWindow);
    pending.resolve({ status: 'Saved to Note A' });
    await Promise.resolve();
    await Promise.resolve();
    expect(showStatus).toHaveBeenCalledWith('Saved to Note A', 1500);
    expect(palette.isOpen).toBe(false);

    showStatus.mockClear();
    pending = Promise.withResolvers<{ status: string }>();
    palette.open(created.pdfWindow, context);
    palette.handleKey(key('Enter'), created.pdfWindow);
    palette.open(created.pdfWindow, { ...context, text: 'new selection' });
    pending.resolve({ status: 'Late save to Note B' });
    await Promise.resolve();
    await Promise.resolve();
    expect(showStatus).not.toHaveBeenCalled();
    expect(palette.isOpen).toBe(true);
    palette.close();
  });

  it('retires completed capture presentation without stealing replacement workspace focus', async () => {
    const created = createWindow();
    const showStatus = vi.fn();
    const pending = Promise.withResolvers<{ retired: true }>();
    const palette = createPalette({
      actions: () => [{ id: 'capture', label: 'Capture', run: () => pending.promise }],
      themeRoot: () => () => {},
      copyText: () => {},
      showStatus,
      debug: () => {},
    });
    palette.open(created.pdfWindow, context);
    palette.handleKey(key('Enter'), created.pdfWindow);
    pending.resolve({ retired: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(palette.isOpen).toBe(false);
    expect(showStatus).not.toHaveBeenCalled();
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
  });

  it('retires dead-view ownership and ignores a late result over a new menu', async () => {
    const primary = createWindow();
    const secondary = createWindow();
    const pending = Promise.withResolvers<{ body: string }>();
    const themes = new Set<HTMLElement>();
    const nextRun = vi.fn();
    const actions: ReaderSelectionActionDefinition[] = [
      { id: 'old', label: 'Old', run: () => pending.promise },
    ];
    const palette = createPalette({
      actions: () => actions,
      themeRoot: (root) => {
        themes.add(root);
        return () => {
          themes.delete(root);
        };
      },
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });
    palette.open(primary.pdfWindow, context);
    palette.handleKey(key('Enter'), primary.pdfWindow);
    const oldRoot = primary.bodyChildren[0]!;
    deadObjects.add(oldRoot);
    deadObjects.add(primary.pdfWindow);
    vi.mocked(oldRoot.remove).mockImplementation(() => {
      throw new Error('dead object');
    });
    vi.mocked(primary.pdfWindow.focus).mockImplementation(() => {
      throw new Error('dead object');
    });
    palette.releaseView(primary.pdfWindow);
    expect(palette.isOpen).toBe(false);
    expect(themes.size).toBe(0);
    actions.splice(0, 1, { id: 'new', label: 'New', run: nextRun });
    const nextContext = { ...context, text: 'new selection', pageLabel: '8' };
    palette.open(secondary.pdfWindow, nextContext);
    pending.resolve({ body: 'stale result' });
    await Promise.resolve();
    await Promise.resolve();
    expect(palette.isOpen).toBe(true);
    expect(primary.pdfWindow.focus).not.toHaveBeenCalled();
    palette.handleKey(key('Enter'), secondary.pdfWindow);
    await Promise.resolve();
    await Promise.resolve();
    expect(nextRun).toHaveBeenCalledWith(nextContext);
    expect(palette.isOpen).toBe(false);
    expect(themes.size).toBe(0);
  });

  it('retires a completed invocation whose owner window died before view release', async () => {
    const created = createWindow();
    const pending = Promise.withResolvers<{ body: string }>();
    const themes = new Set<HTMLElement>();
    const showStatus = vi.fn();
    const debug = vi.fn();
    const palette = createPalette({
      actions: () => [{ id: 'pending', label: 'Pending', run: () => pending.promise }],
      themeRoot: (root) => {
        themes.add(root);
        return () => {
          themes.delete(root);
        };
      },
      copyText: () => {},
      showStatus,
      debug,
    });
    palette.open(created.pdfWindow, context);
    palette.handleKey(key('Enter'), created.pdfWindow);
    deadObjects.add(created.pdfWindow);
    pending.resolve({ body: 'late result for removed view' });
    await Promise.resolve();
    await Promise.resolve();
    expect(palette.isOpen).toBe(false);
    expect(themes.size).toBe(0);
    expect(created.pdfWindow.focus).not.toHaveBeenCalled();
    expect(showStatus).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
  });

  it('releases ownership and theme resources without hiding a live DOM failure', () => {
    const created = createWindow();
    const themes = new Set<HTMLElement>();
    const palette = createPalette({
      actions: () => [{ id: 'copy', label: 'Copy', run: () => {} }],
      themeRoot: (root) => {
        themes.add(root);
        return () => {
          themes.delete(root);
        };
      },
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });
    palette.open(created.pdfWindow, context);
    const failure = new Error('live DOM removal failed');
    vi.mocked(created.bodyChildren[0]!.remove).mockImplementation(() => {
      throw failure;
    });
    expect(() => palette.close()).toThrow(failure);
    expect(palette.isOpen).toBe(false);
    expect(themes.size).toBe(0);
  });

  it('closes and yields when input moves to another split view', () => {
    const primary = createWindow();
    const secondary = createWindow();
    const palette = createPalette({
      actions: () => [{ id: 'copy', label: 'Copy', run: () => {} }],
      themeRoot: () => () => {},
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });
    palette.open(primary.pdfWindow, context);
    const event = key('j');

    expect(palette.handleKey(event, secondary.pdfWindow)).toBe(false);
    expect(event.preventDefault as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(palette.isOpen).toBe(false);
  });
  it('does not admit actions for an inactive view or after availability retires it', () => {
    const view = createWindow();
    let current = false;
    const actions = vi.fn(() => {
      current = false;
      return [{ id: 'a', label: 'A', run: () => {} }];
    });
    const palette = createPalette({
      isCurrent: () => current,
      actions,
      themeRoot: () => () => {},
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });
    expect(palette.open(view.pdfWindow, context)).toBe(false);
    expect(actions).not.toHaveBeenCalled();
    current = true;
    expect(palette.open(view.pdfWindow, context)).toBe(false);
    expect(view.bodyChildren).toHaveLength(0);
  });

  it('stops availability when the native view changes while its window stays the same', () => {
    const view = createWindow();
    const registry = new ReaderSelectionActionRegistry();
    let nativeView = {};
    const later = vi.fn(() => true);
    registry.register({
      id: 'replace',
      label: 'Replace',
      run: () => {},
      isAvailable: () => {
        nativeView = {};
        return true;
      },
    });
    registry.register({ id: 'later', label: 'Later', run: () => {}, isAvailable: later });
    const palette = createPalette({
      captureView: () => {
        const captured = nativeView;
        return () => nativeView === captured;
      },
      actions: (snapshot, _window, isCurrent) => registry.available(snapshot, isCurrent),
      themeRoot: () => () => {},
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });
    expect(palette.open(view.pdfWindow, context)).toBe(false);
    expect(later).not.toHaveBeenCalled();
    expect(view.bodyChildren).toHaveLength(0);
  });

  it('does not run an action when the native view changes after opening on the same window', () => {
    const view = createWindow();
    let nativeView = {};
    const run = vi.fn();
    const palette = createPalette({
      captureView: () => {
        const captured = nativeView;
        return () => nativeView === captured;
      },
      actions: () => [{ id: 'a', label: 'A', run }],
      themeRoot: () => () => {},
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });
    expect(palette.open(view.pdfWindow, context)).toBe(true);
    nativeView = {};
    expect(palette.handleKey(key('Enter'), view.pdfWindow)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(view.pdfWindow.focus).not.toHaveBeenCalled();
    expect(palette.isOpen).toBe(false);
  });

  it('retires a stale async presentation without status, focus, or result copy', async () => {
    const view = createWindow();
    const pending = Promise.withResolvers<{ body: string }>();
    let revision = 0;
    const copyText = vi.fn();
    const showStatus = vi.fn();
    const palette = createPalette({
      capturePresentation: () => {
        const admitted = revision;
        return () => revision === admitted;
      },
      actions: () => [{ id: 'a', label: 'A', run: () => pending.promise }],
      themeRoot: () => () => {},
      copyText,
      showStatus,
      debug: () => {},
    });
    palette.open(view.pdfWindow, context);
    palette.handleKey(key('Enter'), view.pdfWindow);
    revision++;
    pending.resolve({ body: 'late' });
    await Promise.resolve();
    expect(palette.isOpen).toBe(false);
    expect(view.pdfWindow.focus).not.toHaveBeenCalled();
    expect(showStatus).not.toHaveBeenCalled();
    expect(copyText).not.toHaveBeenCalled();
  });

  it('releases a theme acquired after reentrant retirement and preserves a replacement', () => {
    const first = createWindow();
    const replacement = createWindow();
    const cleanup = vi.fn();
    let palette: ReaderSelectionActions;
    let firstTheme = true;
    palette = createPalette({
      actions: () => [{ id: 'a', label: 'A', run: () => {} }],
      themeRoot: () => {
        if (firstTheme) {
          firstTheme = false;
          palette.open(replacement.pdfWindow, context);
          return cleanup;
        }
        return () => {};
      },
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });
    expect(palette.open(first.pdfWindow, context)).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(first.bodyChildren).toHaveLength(0);
    expect(palette.ownsView(replacement.pdfWindow)).toBe(true);
    expect(replacement.bodyChildren).toHaveLength(1);
  });

  it('removes partially mounted DOM when theme acquisition throws', () => {
    const view = createWindow();
    const failure = new Error('theme failed');
    const palette = createPalette({
      actions: () => [{ id: 'a', label: 'A', run: () => {} }],
      themeRoot: () => {
        throw failure;
      },
      copyText: () => {},
      showStatus: () => {},
      debug: () => {},
    });
    expect(() => palette.open(view.pdfWindow, context)).toThrow(failure);
    expect(palette.isOpen).toBe(false);
    expect(view.bodyChildren).toHaveLength(0);
  });
});
