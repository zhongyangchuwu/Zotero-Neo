import { describe, expect, it, vi } from 'vitest';

import {
  ReaderSelectionActionRegistry,
  ReaderSelectionActions,
} from '../../src/reader/selection-actions';
import type {
  ReaderSelectionActionDefinition,
  ReaderSelectionContext,
} from '../../src/core/contracts';
import type { PdfWindow } from '../../src/reader/types';

const context: ReaderSelectionContext = {
  text: 'selected text',
  itemID: 42,
  pageLabel: '7',
  position: '{"pageIndex":6}',
};

function key(value: string): KeyboardEvent {
  return {
    key: value,
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
