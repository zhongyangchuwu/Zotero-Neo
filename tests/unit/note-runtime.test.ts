import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import { bindingsForMode, resolveBindings } from '../../src/input/bindings';
import { NoteEditor } from '../../src/main/note-editor';
import { NoteSurfaceRuntime } from '../../src/main/note-runtime';
import { MainNavigation } from '../../src/main/navigation';
import type { MainWindowSession } from '../../src/main/session';
import { NoteEditing } from '../../src/modules/notes/editor';
import { PrefixGuideRuntime, type PrefixGuideView } from '../../src/ui/key-guide-runtime';

const originalServices = Reflect.get(globalThis, 'Services');
const originalComponents = Reflect.get(globalThis, 'Components');

afterEach(() => {
  if (originalServices === undefined) Reflect.deleteProperty(globalThis, 'Services');
  else Reflect.set(globalThis, 'Services', originalServices);
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

function harness() {
  let owner = true;
  let itemID = 1;
  const addWindowListener = vi.fn();
  const removeWindowListener = vi.fn();
  const addDocumentListener = vi.fn();
  const removeDocumentListener = vi.fn();
  const styleNodes = new Map<string, { id: string; textContent: string; remove(): void }>();
  const classes = new Set<string>();
  const execCommand = vi.fn(() => false);
  let selected = '';
  const selection = {
    modify: () => {},
    toString: () => selected,
    deleteFromDocument: () => {},
    collapseToStart: () => {},
  };
  const editorDocument = {
    execCommand,
    getSelection: () => selection,
    body: { isContentEditable: true },
    designMode: 'off',
    addEventListener: addDocumentListener,
    removeEventListener: removeDocumentListener,
    getElementById: (id: string) => styleNodes.get(id) ?? null,
    createElement: () => ({
      id: '',
      textContent: '',
      remove() {
        styleNodes.delete(this.id);
      },
    }),
    head: {
      append: (node: { id: string; textContent: string; remove(): void }) => {
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
        remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
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
  const frames: Array<{
    contentWindow: Window;
    ownerDocument: Document;
    isConnected: boolean;
    display: string;
    visibility: string;
    getBoundingClientRect(): { width: number; height: number };
  }> = [];
  const mainDocument = {
    activeElement: null,
    querySelectorAll: () => frames,
    createElement: createGuideNode,
    body: { appendChild: (node: GuideNode) => guideNodes.push(node) },
  } as unknown as Document;
  const frame = {
    contentWindow: editorWindow,
    ownerDocument: mainDocument,
    isConnected: true,
    display: 'block',
    visibility: 'visible',
    getBoundingClientRect: () => ({ width: 400, height: 300 }),
  };
  frames.push(frame);
  const main = {
    document: mainDocument,
    getComputedStyle: (node: typeof frame) => ({
      display: node.display,
      visibility: node.visibility,
    }),
    setTimeout,
    clearTimeout,
    Zotero_Tabs: {
      selectedID: 'note-tab',
      getTabInfo: () => ({ type: 'note', data: { itemID } }),
    },
  } as unknown as MainWindow;
  Reflect.set(globalThis, 'Services', { focus: { focusedWindow: editorWindow } });
  Reflect.set(globalThis, 'Components', { utils: { isDeadWrapper: () => false } });

  const note = new NoteSurfaceRuntime(main);
  const session = {
    window: main,
    note,
    status: { textContent: '', style: { display: '', color: '', background: '' } },
    cleanup: { add: () => {} },
  } as unknown as MainWindowSession;
  const editing = new NoteEditing({ isCurrent: () => true, status: () => {} });
  const bindings = resolveBindings('{"note-normal:<Space>f":"nextTab"}');
  const guideRuntime = new PrefixGuideRuntime(main);
  const theme = { add: () => () => {} };
  const guideView = (): PrefixGuideView => {
    const mode = editing.mode === 'insert' ? 'note-insert' : 'note-normal';
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
  const editor = new NoteEditor(
    logger,
    navigation,
    () => bindings,
    guide,
    () => editing,
    () => owner,
  );
  const target = {
    tagName: 'DIV',
    localName: 'div',
    isContentEditable: true,
    parentElement: null,
    ownerDocument: editorDocument,
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
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
    editing,
    setSelected: (value: string) => {
      selected = value;
    },
    setOwner: (value: boolean) => {
      owner = value;
    },
    editorWindow,
    frame,
    frames,
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
  it('keeps the rendered editor when Picker focus exposes earlier hidden Note frames', () => {
    const h = harness();
    const hiddenWindow = { document: h.editorDocument } as Window;
    const hidden = { ...h.frame, contentWindow: hiddenWindow, visibility: 'hidden' };
    h.frames.unshift(hidden);
    h.sync();
    const current = h.editor.captureCurrent(h.session);
    h.setFocusedWindow(null);
    h.editor.deactivateInteraction(h.main, h.session);
    h.sync();
    expect(h.note.editorWindow).toBe(h.editorWindow);
    expect(current()).toBe(true);
    expect(h.removeWindowListener).not.toHaveBeenCalled();
    h.setFocusedWindow(hiddenWindow);
    h.sync();
    expect(h.note.editorWindow).toBe(h.editorWindow);
    h.editor.clear(h.session);
  });

  it('rejects a focused foreign editor and invalidates callbacks before replacement is scanned', () => {
    const h = harness();
    const foreignWindow = { document: h.editorDocument } as Window;
    const foreign = { ...h.frame, contentWindow: foreignWindow, ownerDocument: {} as Document };
    h.frames.unshift(foreign);
    h.setFocusedWindow(foreignWindow);
    h.sync();
    expect(h.note.editorWindow).toBe(h.editorWindow);
    const current = h.editor.captureCurrent(h.session);
    const retired = h.addDocumentListener.mock.calls[0]![1] as EventListener;
    const replacementWindow = { ...h.editorWindow, document: h.editorDocument } as Window;
    h.frames[1] = { ...h.frame, contentWindow: replacementWindow };
    expect(current()).toBe(false);
    retired({ key: 'i', target: h.target } as unknown as Event);
    expect(h.editing.mode).toBe('normal');
    h.editor.clear(h.session);
  });
  it.each([
    { display: 'none', visibility: 'visible', width: 400, height: 300 },
    { display: 'block', visibility: 'collapse', width: 400, height: 300 },
    { display: 'block', visibility: 'visible', width: 0, height: 300 },
  ])('ignores a nonrendered Note frame: $display/$visibility/$width', (state) => {
    const h = harness();
    const hiddenWindow = { document: h.editorDocument } as Window;
    h.frames.unshift({
      ...h.frame,
      contentWindow: hiddenWindow,
      display: state.display,
      visibility: state.visibility,
      getBoundingClientRect: () => ({ width: state.width, height: state.height }),
    });
    h.setFocusedWindow(hiddenWindow);
    h.sync();
    expect(h.note.editorWindow).toBe(h.editorWindow);
    h.editor.clear(h.session);
  });

  it('rejects old item and owner callbacks before and after replacement', () => {
    const h = harness();
    h.sync();
    const current = h.editor.captureCurrent(h.session);
    const retired = h.addDocumentListener.mock.calls[0]![1] as EventListener;
    const event = {
      key: 'i',
      target: h.target,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event;
    expect(current()).toBe(true);
    h.setItemID(2);
    expect(current()).toBe(false);
    retired(event);
    expect(h.editing.mode).toBe('normal');
    h.sync();
    retired(event);
    expect(h.editing.mode).toBe('normal');
    const replacement = h.editor.captureCurrent(h.session);
    h.setOwner(false);
    expect(replacement()).toBe(false);
    (h.addDocumentListener.mock.calls.at(-1)![1] as EventListener)(event);
    expect(h.editing.mode).toBe('normal');
    h.editor.clear(h.session);
  });

  it('drains a partially attached editor when document attachment fails', () => {
    const h = harness();
    const error = new Error('attachment failed');
    h.addDocumentListener.mockImplementationOnce(() => {
      throw error;
    });
    expect(() => h.sync()).toThrow(error);
    expect(h.note.editorWindow).toBeNull();
    expect(h.removeWindowListener).toHaveBeenCalledOnce();
    expect(h.removeDocumentListener).toHaveBeenCalledOnce();
  });

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
    h.press('i');
    h.setSelected('kept register');
    h.editing.executeAction('noteDeleteChar', h.target, 1);
    h.note.input.replace('d', '2');

    h.editor.deactivateInteraction(h.main, h.session);

    expect(h.note.itemID).toBe(1);
    expect(h.editing.mode).toBe('normal');
    expect(h.editing.executeAction('notePutAfter', h.target, 1)).toBe(true);
    expect((h.target as HTMLInputElement).value).toBe('kept register');
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

      expect(h.editing.mode).toBe('insert');
      expect(h.classes.has('zv-note-insert-mode')).toBe(true);
      expect(h.classes.has('zv-note-normal-mode')).toBe(false);

      Reflect.set(h.main.document, 'activeElement', { id: 'main-search' });
      h.editor.deactivateInteraction(h.main, h.session);
      expect(h.editing.mode).toBe('normal');
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
    h.press('i');
    h.sync();

    expect(h.note.itemID).toBe(1);
    expect(h.editing.mode).toBe('insert');
    expect(h.addWindowListener).toHaveBeenCalledOnce();
    expect(h.addDocumentListener).toHaveBeenCalledOnce();
    expect(h.removeWindowListener).not.toHaveBeenCalled();
    expect(h.removeDocumentListener).not.toHaveBeenCalled();
  });

  it('retires Note input when the same Window and item replace their Document', () => {
    const h = harness();
    h.sync();
    const retired = h.addDocumentListener.mock.calls[0]![1] as EventListener;
    h.press('i');
    h.note.input.replace('d', '2');
    const replacement = { ...h.editorDocument } as Document;
    Reflect.set(h.editorWindow, 'document', replacement);
    try {
      h.sync();
      expect(h.editing.mode).toBe('normal');
      expect(h.note.input.keyBuffer).toBe('');
      expect(h.note.input.countBuffer).toBe('');
      const target = { ...h.target, ownerDocument: replacement } as HTMLElement;
      const event = {
        key: 'i',
        target,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as Event;
      retired(event);
      expect(h.editing.mode).toBe('normal');
      const current = h.addDocumentListener.mock.calls.at(-1)![1] as EventListener;
      current(event);
      expect(h.editing.mode).toBe('insert');
    } finally {
      h.editor.clear(h.session);
    }
  });

  it('resets Note interaction state when the same editor host displays another Note item', () => {
    const h = harness();

    h.sync();
    h.press('i');
    h.setSelected('old note register');
    h.editing.executeAction('noteDeleteChar', h.target, 1);
    h.note.input.replace('d', '2');

    h.setItemID(2);
    h.sync();

    expect(h.note.itemID).toBe(2);
    expect(h.editing.mode).toBe('normal');
    expect(h.editing.executeAction('notePutAfter', h.target, 1)).toBe(false);
    expect(h.note.input.keyBuffer).toBe('');
    expect(h.note.input.countBuffer).toBe('');
    expect(h.removeWindowListener).toHaveBeenCalledOnce();
    expect(h.removeDocumentListener).toHaveBeenCalledOnce();
    expect(h.addWindowListener).toHaveBeenCalledTimes(2);
    expect(h.addDocumentListener).toHaveBeenCalledTimes(2);
  });

  it('binds the actual context Note only after native context initialization', () => {
    const h = harness();
    const active = {} as Element;
    Reflect.set(h.main.document, 'activeElement', active);
    Reflect.set(h.main.Zotero_Tabs, 'getTabInfo', () => ({ type: 'library' }));
    h.setFocusedWindow(null);
    const pane = {
      get activeEditor(): never {
        throw new TypeError('native context is not initialized');
      },
    };
    Reflect.set(h.main, 'ZoteroContextPane', pane);
    h.frames.length = 0;
    h.sync();
    expect(h.note.editorWindow).toBeNull();
    Reflect.set(pane, 'context', {
      activeEditor: {
        item: { id: 7 },
        contains: (node: unknown) => node === active,
        _iframe: h.frame,
      },
    });
    h.sync();
    expect(h.note.itemID).toBe(7);
    expect(h.note.editorWindow).toBe(h.editorWindow);
    h.editor.clear(h.session);
  });

  it('resolves a focused context-pane Note ahead of standalone tab metadata', () => {
    const h = harness();
    const active = {} as Element;
    Reflect.set(h.main.document, 'activeElement', active);
    Reflect.set(h.main, 'ZoteroContextPane', {
      context: {
        activeEditor: {
          item: { id: 7 },
          contains: (node: unknown) => node === active,
          _iframe: h.frame,
        },
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
      _iframe: h.frame,
    };
    Reflect.set(h.main, 'ZoteroContextPane', { context: { activeEditor: context } });
    Reflect.set(h.main.document, 'activeElement', active);
    Reflect.set(h.main.Zotero_Tabs, 'getTabInfo', () => ({ type: 'library' }));
    h.setFocusedWindow(null);
    h.sync();
    h.setSelected('from A');
    h.editing.executeAction('noteDeleteChar', h.target, 1);

    Reflect.set(h.main.document, 'activeElement', null);
    h.sync();

    expect(h.note.itemID).toBe(7);
    expect(h.editing.executeAction('notePutAfter', h.target, 1)).toBe(true);
    expect((h.target as HTMLInputElement).value).toBe('from A');
    expect(h.removeWindowListener).not.toHaveBeenCalled();

    context.item = { id: 8 };
    h.sync();

    expect(h.note.itemID).toBe(8);
    expect(h.editing.executeAction('notePutAfter', h.target, 1)).toBe(false);
  });

  it('clears a closed Note editor and reopens it with fresh interaction state', () => {
    const h = harness();
    h.sync();
    h.press('i');
    h.setSelected('closed note');
    h.editing.executeAction('noteDeleteChar', h.target, 1);

    h.frames.length = 0;
    h.setFocusedWindow(null);
    h.sync();
    expect(h.note.editorWindow).toBeNull();
    expect(h.note.itemID).toBeNull();
    expect(h.editing.mode).toBe('normal');
    expect(h.editing.executeAction('notePutAfter', h.target, 1)).toBe(false);

    h.frames.push(h.frame);
    h.setFocusedWindow(h.editorWindow);
    h.sync();
    expect(h.note.editorWindow).toBe(h.editorWindow);
    expect(h.note.itemID).toBe(1);
    expect(h.editing.mode).toBe('normal');
    expect(h.addWindowListener).toHaveBeenCalledTimes(2);
  });
});
