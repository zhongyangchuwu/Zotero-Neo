import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { DEFAULT_BINDINGS } from '../../src/input/bindings';
import { NoteEditor } from '../../src/main/note-editor';
import { NoteSurfaceRuntime } from '../../src/main/note-runtime';
import { MainNavigation } from '../../src/main/navigation';
import type { MainWindowSession } from '../../src/main/session';

const originalServices = Reflect.get(globalThis, 'Services');

afterEach(() => {
  if (originalServices === undefined) Reflect.deleteProperty(globalThis, 'Services');
  else Reflect.set(globalThis, 'Services', originalServices);
});

function harness() {
  let itemID = 1;
  const addWindowListener = vi.fn();
  const removeWindowListener = vi.fn();
  const addDocumentListener = vi.fn();
  const removeDocumentListener = vi.fn();
  const styleNodes = new Map<string, { id: string; textContent: string }>();
  const editorDocument = {
    body: { isContentEditable: true },
    designMode: 'off',
    addEventListener: addDocumentListener,
    removeEventListener: removeDocumentListener,
    getElementById: (id: string) => styleNodes.get(id) ?? null,
    createElement: () => ({ id: '', textContent: '' }),
    head: {
      append: (node: { id: string; textContent: string }) => {
        if (node.id) styleNodes.set(node.id, node);
      },
    },
    documentElement: {
      append: () => {},
      classList: { toggle: vi.fn() },
    },
  } as unknown as Document;
  const editorWindow = {
    document: editorDocument,
    addEventListener: addWindowListener,
    removeEventListener: removeWindowListener,
  } as unknown as Window;
  const main = {
    document: {
      activeElement: null,
      querySelectorAll: () => [],
    },
    setTimeout,
    clearTimeout,
    Zotero_Tabs: {
      selectedID: 'note-tab',
      getTabInfo: () => ({ type: 'note', data: { itemID } }),
    },
  } as unknown as MainWindow;
  Reflect.set(globalThis, 'Services', { focus: { focusedWindow: editorWindow } });

  const note = new NoteSurfaceRuntime(main);
  const session = { window: main, note } as unknown as MainWindowSession;
  const guide = { refresh: vi.fn(), clear: vi.fn() };
  const editor = new NoteEditor(
    { debug: vi.fn(), diagnostic: vi.fn() },
    new MainNavigation({ debug: vi.fn(), diagnostic: vi.fn() }, () => {}),
    () => DEFAULT_BINDINGS,
    guide,
  );

  return {
    main,
    note,
    editor,
    addWindowListener,
    removeWindowListener,
    addDocumentListener,
    removeDocumentListener,
    setItemID: (next: number) => {
      itemID = next;
    },
    sync: () => editor.sync(main, session, true),
  };
}

describe('Note surface runtime identity', () => {
  it('keeps one runtime binding for the same Note item and editor host', () => {
    const h = harness();

    h.sync();
    h.note.mode = 'insert';
    h.note.yank = 'kept';
    h.sync();

    expect(h.note.itemID).toBe(1);
    expect(h.note.mode).toBe('insert');
    expect(h.note.yank).toBe('kept');
    expect(h.addWindowListener).toHaveBeenCalledOnce();
    expect(h.addDocumentListener).toHaveBeenCalledOnce();
    expect(h.removeWindowListener).not.toHaveBeenCalled();
    expect(h.removeDocumentListener).not.toHaveBeenCalled();
  });

  it('resets Note interaction state when the same editor host displays another Note item', () => {
    const h = harness();

    h.sync();
    h.note.mode = 'insert';
    h.note.yank = 'old note register';
    h.note.input.replace('d', '2');

    h.setItemID(2);
    h.sync();

    expect(h.note.itemID).toBe(2);
    expect(h.note.mode).toBe('normal');
    expect(h.note.yank).toBe('');
    expect(h.note.input.keyBuffer).toBe('');
    expect(h.note.input.countBuffer).toBe('');
    expect(h.removeWindowListener).toHaveBeenCalledOnce();
    expect(h.removeDocumentListener).toHaveBeenCalledOnce();
    expect(h.addWindowListener).toHaveBeenCalledTimes(2);
    expect(h.addDocumentListener).toHaveBeenCalledTimes(2);
  });
});
