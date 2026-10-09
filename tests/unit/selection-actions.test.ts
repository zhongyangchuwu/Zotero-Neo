import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ReaderSelectionActionRegistry,
  ReaderSelectionActions,
} from '../../src/reader/selection-actions';
import type {
  ReaderSelectionActionDefinition,
  ReaderSelectionContext,
} from '../../src/core/contracts';
import type { PdfWindow } from '../../src/reader/types';

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

    expect(registry.available(context).map((action) => action.id)).toEqual(['demo.translate']);
    cleanup();
    expect(registry.available(context)).toHaveLength(0);
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
});

describe('ReaderSelectionActions', () => {
  it('runs the keyboard-selected action with the immutable selection context', async () => {
    const created = createWindow();
    const first = vi.fn();
    const second = vi.fn();
    const palette = new ReaderSelectionActions({
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
    const palette = new ReaderSelectionActions({
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
    const palette = new ReaderSelectionActions({
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
    const palette = new ReaderSelectionActions({
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

  it('retires dead-view ownership and ignores a late result over a new menu', async () => {
    const primary = createWindow();
    const secondary = createWindow();
    const pending = Promise.withResolvers<{ body: string }>();
    const themes = new Set<HTMLElement>();
    const nextRun = vi.fn();
    const actions: ReaderSelectionActionDefinition[] = [
      { id: 'old', label: 'Old', run: () => pending.promise },
    ];
    const palette = new ReaderSelectionActions({
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
    const palette = new ReaderSelectionActions({
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
    const palette = new ReaderSelectionActions({
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
    const palette = new ReaderSelectionActions({
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
});
