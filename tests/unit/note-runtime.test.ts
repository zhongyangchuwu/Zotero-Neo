import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { bindingsForMode, resolveBindings } from '../../src/input/bindings';
import { NoteEditor } from '../../src/main/note-editor';
import { NoteSurfaceRuntime } from '../../src/main/note-runtime';
import { MainNavigation } from '../../src/main/navigation';
import type { MainWindowSession } from '../../src/main/session';
import { PrefixGuideRuntime, type PrefixGuideView } from '../../src/ui/key-guide-runtime';

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
  const classes = new Set<string>();
  const execCommand = vi.fn(() => false);
  const editorDocument = {
    execCommand,
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
      classList: {
        toggle: (name: string, active: boolean) => {
          if (active) classes.add(name);
          else classes.delete(name);
        },
        contains: (name: string) => classes.has(name),
      },
    },
  } as unknown as Document;
  const editorWindow = {
    document: editorDocument,
    addEventListener: addWindowListener,
    removeEventListener: removeWindowListener,
  } as unknown as Window;
  type GuideNode = {
    id: string;
    textContent: string;
    style: { cssText: string; fontSize: string };
    children: GuideNode[];
    setAttribute(name: string, value: string): void;
    append(...nodes: GuideNode[]): void;
    appendChild(node: GuideNode): void;
    replaceChildren(...nodes: GuideNode[]): void;
    remove(): void;
  };
  const guideNodes: GuideNode[] = [];
  const createGuideNode = (): GuideNode => {
    const children: GuideNode[] = [];
    const node: GuideNode = {
      id: '',
      textContent: '',
      style: { cssText: '', fontSize: '' },
      children,
      setAttribute: () => {},
      append: (...nodes) => children.push(...nodes),
      appendChild: (child) => children.push(child),
      replaceChildren: (...nodes) => children.splice(0, children.length, ...nodes),
      remove: () => {
        const index = guideNodes.indexOf(node);
        if (index >= 0) guideNodes.splice(index, 1);
      },
    };
    return node;
  };
  const mainDocument = {
    activeElement: null,
    querySelectorAll: () => [],
    createElement: createGuideNode,
    body: { appendChild: (node: GuideNode) => guideNodes.push(node) },
  } as unknown as Document;
  const main = {
    document: mainDocument,
    setTimeout,
    clearTimeout,
    Zotero_Tabs: {
      selectedID: 'note-tab',
      getTabInfo: () => ({ type: 'note', data: { itemID } }),
    },
  } as unknown as MainWindow;
  Reflect.set(globalThis, 'Services', { focus: { focusedWindow: editorWindow } });

  const note = new NoteSurfaceRuntime(main);
  const session = {
    window: main,
    note,
    status: { textContent: '', style: { display: '', color: '', background: '' } },
    cleanup: { add: () => {} },
  } as unknown as MainWindowSession;
  const bindings = resolveBindings('{"note-normal:<Space>f":"nextTab"}');
  const guideRuntime = new PrefixGuideRuntime(main);
  const theme = { add: () => () => {} };
  const guideView = (): PrefixGuideView => {
    const mode = session.note.mode === 'insert' ? 'note-insert' : 'note-normal';
    return {
      input: session.note.input,
      mode,
      bindings: bindingsForMode(bindings, mode),
      enabled: true,
      language: 'en',
      delayMs: 100,
      fontSizePx: 15,
      document: main.document,
      theme,
    };
  };
  const guide = {
    refresh: () => guideRuntime.refresh(guideView),
    clear: () => guideRuntime.clear(),
  };
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const navigation = new MainNavigation(logger, () => {});
  const editor = new NoteEditor(logger, navigation, () => bindings, guide);
  const target = {
    tagName: 'DIV',
    localName: 'div',
    isContentEditable: true,
    parentElement: null,
    ownerDocument: editorDocument,
  } as unknown as HTMLElement;
  const press = (key: string, ctrlKey = false) => {
    const event = {
      key,
      target,
      ctrlKey,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    editor.onKeyDown(event as unknown as KeyboardEvent, main, session, () => true);
    return event;
  };

  return {
    main,
    session,
    note,
    editor,
    editorWindow,
    editorDocument,
    execCommand,
    guideNodes,
    classes,
    guide,
    target,
    press,
    addWindowListener,
    removeWindowListener,
    addDocumentListener,
    removeDocumentListener,
    setFocusedWindow: (window: Window | null) => {
      Reflect.set(globalThis, 'Services', { focus: { focusedWindow: window } });
    },
    setItemID: (next: number) => {
      itemID = next;
    },
    sync: () => editor.sync(main, session, true),
  };
}

describe('Note surface runtime identity', () => {
  it('consumes Note undo and redo keys when the editor reports no history', () => {
    const h = harness();

    const undo = h.press('u');
    expect(h.execCommand).toHaveBeenCalledWith('undo');
    expect(undo.preventDefault).toHaveBeenCalledOnce();
    expect(undo.stopPropagation).toHaveBeenCalledOnce();

    const redo = h.press('r', true);
    expect(h.execCommand).toHaveBeenCalledWith('redo');
    expect(redo.preventDefault).toHaveBeenCalledOnce();
    expect(redo.stopPropagation).toHaveBeenCalledOnce();
  });

  it('leaves Insert-mode u to native editor input', () => {
    const h = harness();
    h.press('i');

    const insert = h.press('u');

    expect(h.execCommand).not.toHaveBeenCalled();
    expect(insert.preventDefault).not.toHaveBeenCalled();
    expect(insert.stopPropagation).not.toHaveBeenCalled();
  });

  it('deactivates Note interaction without discarding Note identity or register state', () => {
    const h = harness();

    h.sync();
    h.note.mode = 'insert';
    h.note.yank = 'kept register';
    h.note.input.replace('d', '2');

    h.note.deactivateInteraction();

    expect(h.note.itemID).toBe(1);
    expect(h.note.mode).toBe('normal');
    expect(h.note.yank).toBe('kept register');
    expect(h.note.input.keyBuffer).toBe('');
    expect(h.note.input.countBuffer).toBe('');
  });
  it('resets Note caret styling and hides the shared Guide for the same editor host', () => {
    vi.useFakeTimers();
    const h = harness();
    try {
      h.sync();
      const editorWindow = h.note.editorWindow;
      h.press('i');

      expect(h.note.mode).toBe('insert');
      expect(h.classes.has('zv-note-insert-mode')).toBe(true);
      expect(h.classes.has('zv-note-normal-mode')).toBe(false);

      Reflect.set(h.main.document, 'activeElement', { id: 'main-search' });
      h.editor.deactivateInteraction(h.main, h.session);
      expect(h.note.mode).toBe('normal');
      expect(h.classes.has('zv-note-normal-mode')).toBe(true);
      expect(h.classes.has('zv-note-insert-mode')).toBe(false);
      expect(h.note.editorWindow).toBe(editorWindow);

      h.sync();
      expect(h.addWindowListener).toHaveBeenCalledOnce();
      expect(h.removeWindowListener).not.toHaveBeenCalled();

      h.press(' ');
      vi.advanceTimersByTime(100);
      expect(h.guideNodes).toHaveLength(1);

      h.editor.deactivateInteraction(h.main, h.session);
      expect(h.note.input.keyBuffer).toBe('');
      expect(h.guideNodes).toHaveLength(0);
      h.sync();
      expect(h.note.editorWindow).toBe(editorWindow);
      expect(h.addDocumentListener).toHaveBeenCalledOnce();
      expect(h.removeDocumentListener).not.toHaveBeenCalled();
    } finally {
      h.editor.clear(h.session);
      vi.useRealTimers();
    }
  });

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

  it('resolves a focused context-pane Note ahead of standalone tab metadata', () => {
    const h = harness();
    const active = {} as Element;
    Reflect.set(h.main.document, 'activeElement', active);
    Reflect.set(h.main, 'ZoteroContextPane', {
      activeEditor: {
        item: { id: 7 },
        contains: (node: unknown) => node === active,
        _iframe: { contentWindow: h.editorWindow },
      },
    });
    h.setFocusedWindow(null);

    h.sync();

    expect(h.note.itemID).toBe(7);
    expect(h.note.editorWindow).toBe(h.editorWindow);
  });

  it('preserves a context-pane Note register across focus loss but resets it for another Note', () => {
    const h = harness();
    const active = {} as Element;
    const context = {
      item: { id: 7 },
      contains: (node: unknown) => node === active,
      _iframe: { contentWindow: h.editorWindow },
    };
    Reflect.set(h.main, 'ZoteroContextPane', { activeEditor: context });
    Reflect.set(h.main.document, 'activeElement', active);
    Reflect.set(h.main.Zotero_Tabs, 'getTabInfo', () => ({ type: 'library' }));
    h.setFocusedWindow(null);
    h.sync();
    h.note.yank = 'from A';

    Reflect.set(h.main.document, 'activeElement', null);
    h.sync();

    expect(h.note.itemID).toBe(7);
    expect(h.note.yank).toBe('from A');
    expect(h.removeWindowListener).not.toHaveBeenCalled();

    context.item = { id: 8 };
    h.sync();

    expect(h.note.itemID).toBe(8);
    expect(h.note.yank).toBe('');
  });

  it('clears a closed Note editor and reopens it with fresh interaction state', () => {
    const h = harness();
    h.sync();
    h.note.mode = 'insert';
    h.note.yank = 'closed note';

    h.setFocusedWindow(null);
    h.sync();
    expect(h.note.editorWindow).toBeNull();
    expect(h.note.itemID).toBeNull();
    expect(h.note.mode).toBe('normal');
    expect(h.note.yank).toBe('');

    h.setFocusedWindow(h.editorWindow);
    h.sync();
    expect(h.note.editorWindow).toBe(h.editorWindow);
    expect(h.note.itemID).toBe(1);
    expect(h.note.mode).toBe('normal');
    expect(h.addWindowListener).toHaveBeenCalledTimes(2);
  });
});
