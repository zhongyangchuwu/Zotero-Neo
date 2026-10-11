import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderNativeSidebar } from '../../src/reader/native-sidebar';
import { ReaderMarks } from '../../src/reader/marks';
import { DEFAULT_BINDINGS, resolveBindings, type BindingMap } from '../../src/input/bindings';
import type { PdfWindow, ReaderRuntime } from '../../src/reader/types';

const originalComponents = Reflect.get(globalThis, 'Components');
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
  vi.useRealTimers();
});

/** Native DOM boundary only: production sidebar and common matcher run unchanged. */
function harness(bindings: BindingMap = DEFAULT_BINDINGS) {
  const listeners: Record<string, EventListener[]> = {};
  let mutation: () => void = () => {};
  const nodes: Node[] = [];
  const document = {
    activeElement: null as Node | null,
    createElement: (name: string) => new Node(name),
    getElementById: (id: string) => nodes.find((node) => node.id === id) ?? null,
    querySelector: (selector: string) => nodes.find((node) => node.matches(selector)) ?? null,
    addEventListener: (name: string, callback: EventListener) =>
      (listeners[name] ??= []).push(callback),
    removeEventListener: (name: string, callback: EventListener) => {
      listeners[name] = (listeners[name] ?? []).filter((entry) => entry !== callback);
    },
    head: { appendChild: () => {} },
    body: {},
  };
  class Node {
    readonly localName: string;
    readonly tagName: string;
    readonly ownerDocument = document;
    readonly attributes = new Map<string, string>();
    readonly dataset: Record<string, string> = {};
    readonly children: Node[] = [];
    parentElement: Node | null = null;
    id = '';
    className = '';
    textContent = '';
    tabIndex = -1;
    open = true;
    type = '';
    isContentEditable = false;
    readonly classList = { contains: (name: string) => this.className.split(' ').includes(name) };
    readonly click = vi.fn();
    readonly dispatchEvent = vi.fn((event: { key: string }) => {
      if (this.id === 'outlineView' && event.key === 'ArrowDown') nativeNavigate();
      return true;
    });
    constructor(name: string) {
      this.localName = name;
      this.tagName = name.toUpperCase();
      nodes.push(this);
    }
    matches(selector: string): boolean {
      return selector.split(',').some((part) => {
        const tokens = part.trim().split(/\s+/);
        const simple = (node: Node, token: string): boolean => {
          const tag = /^[a-z]+/i.exec(token)?.[0];
          if (tag && node.localName !== tag.toLowerCase()) return false;
          const id = /#([\w-]+)/.exec(token)?.[1];
          if (id && node.id !== id) return false;
          for (const name of token.matchAll(/\.([\w-]+)/g))
            if (!node.classList.contains(name[1])) return false;
          for (const attr of token.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
            const name = attr[1];
            const value = name.startsWith('data-')
              ? node.dataset[
                  name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
                ]
              : node.getAttribute(name);
            if (value == null || (attr[2] !== undefined && value !== attr[2])) return false;
          }
          return true;
        };
        if (!simple(this, tokens.pop()!)) return false;
        let ancestor = this.parentElement;
        while (tokens.length) {
          const token = tokens.pop()!;
          while (ancestor && !simple(ancestor, token)) ancestor = ancestor.parentElement;
          if (!ancestor) return false;
          ancestor = ancestor.parentElement;
        }
        return true;
      });
    }
    closest(selector: string): Node | null {
      return this.matches(selector) ? this : (this.parentElement?.closest(selector) ?? null);
    }
    contains(node: Node): boolean {
      return node === this || this.children.some((child) => child.contains(node));
    }
    querySelector(selector: string): Node | null {
      return (
        nodes.find((node) => node !== this && this.contains(node) && node.matches(selector)) ?? null
      );
    }
    querySelectorAll(selector: string) {
      const result = nodes.filter(
        (node) => node !== this && this.contains(node) && node.matches(selector),
      );
      return Object.assign(result, { item: (index: number) => result[index] ?? null });
    }
    appendChild(node: Node) {
      node.parentElement = this;
      this.children.push(node);
      return node;
    }
    append(...children: Node[]) {
      for (const child of children) this.appendChild(child);
    }
    replaceChildren(...children: Node[]) {
      for (const old of this.children) old.parentElement = null;
      this.children.length = 0;
      this.append(...children);
    }
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }
    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }
    hasAttribute(name: string) {
      return this.attributes.has(name);
    }
    removeAttribute(name: string) {
      this.attributes.delete(name);
    }
    addEventListener() {}
    remove() {
      if (this.parentElement)
        this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
      this.parentElement = null;
    }
    focus() {
      document.activeElement = this;
      for (const callback of listeners.focusin ?? [])
        callback({ target: this } as unknown as Event);
    }
  }
  const nativeNavigate = vi.fn();
  const sidebarRoot = new Node('div');
  sidebarRoot.id = 'sidebarContainer';
  const wrapper = new Node('div');
  wrapper.className = 'viewWrapper';
  sidebarRoot.appendChild(wrapper);
  const outline = new Node('div');
  outline.id = 'outlineView';
  wrapper.appendChild(outline);
  const row = new Node('div');
  row.className = 'item active';
  outline.appendChild(row);
  const annotations = new Node('div');
  annotations.id = 'annotationsView';
  annotations.className = 'viewWrapper';
  sidebarRoot.appendChild(annotations);
  const annotation = new Node('div');
  annotation.className = 'annotation selected';
  annotations.appendChild(annotation);
  const thumbnails = new Node('div');
  thumbnails.id = 'thumbnailsView';
  sidebarRoot.appendChild(thumbnails);
  const thumbnailList = new Node('div');
  thumbnailList.className = 'thumbnails';
  thumbnails.appendChild(thumbnailList);
  const state = {
    sidebarOpen: false,
    sidebarView: 'outline' as 'outline' | 'annotations' | 'thumbnails',
    outline: [] as readonly [] | null,
    pageLabels: [],
  };
  const window = {
    document,
    KeyboardEvent: class {
      readonly key: string;
      constructor(_type: string, options: { key: string }) {
        this.key = options.key;
      }
    },
    MutationObserver: class {
      constructor(callback: (records: MutationRecord[]) => void) {
        mutation = () => callback([]);
      }
      observe() {}
      disconnect() {}
    },
  };
  const pdf = { focus: vi.fn() } as unknown as PdfWindow;
  const reader = {
    _iframeWindow: window,
    _internalReader: {
      _state: state,
      setSidebarView: (view: typeof state.sidebarView) => {
        state.sidebarView = view;
        wrapper.className = view === 'outline' ? 'viewWrapper' : 'viewWrapper hidden';
        annotations.className = view === 'annotations' ? 'viewWrapper' : 'viewWrapper hidden';
      },
      toggleSidebar: (open: boolean) => {
        state.sidebarOpen = open;
      },
    },
  } as unknown as ReaderRuntime;
  Reflect.set(globalThis, 'Components', {
    utils: { cloneInto: <T>(value: T) => value, isDeadWrapper: () => false },
  });
  const marks = new ReaderMarks({
    preferences: {
      get: <T extends boolean | number | string>(_key: string, fallback: T): T => fallback,
      has: () => false,
      set: () => {},
      clear: () => {},
    },
    itemForReader: () => null,
    schedule: () => {},
    showStatus: () => {},
    log: () => {},
    scrollToPageRatio: async () => false,
    scrollDocumentToRatio: () => false,
    pageNavigationSupported: () => true,
    annotationPageRatio: async () => ({ pageIndex: 0, ratio: 0 }),
    onJump: async () => false,
  });
  let currentBindings = bindings;
  const sidebar = new ReaderNativeSidebar({
    reader,
    marks,
    bindings: () => currentBindings,
    language: () => 'en-US',
    activePdfWindow: () => pdf,
    onAnnotation: () => {},
    onInput: () => {},
    schedule: (delay, callback) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer ?? undefined),
    log: () => {},
  });
  const key = (name: string, extra: Partial<KeyboardEvent> = {}) => {
    const event = {
      key: name,
      target: document.activeElement,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      ...extra,
    } as unknown as KeyboardEvent;
    sidebar.handleKey(event);
    return event;
  };
  return {
    sidebar,
    state,
    pdf,
    outline,
    annotation,
    thumbnailList,
    document,
    nativeNavigate,
    key,
    mutate: () => mutation(),
    createNode: (tag: string) => new Node(tag),
    setBindings: (next: BindingMap) => {
      currentBindings = next;
    },
  };
}

describe('native Reader sidebar consumers', () => {
  it('focuses exact native panes, repeats without closing and switches directly from focused sidebar contexts', () => {
    const test = harness();
    try {
      test.sidebar.focus('outline', test.pdf);
      expect(test.document.activeElement).toBe(test.outline);
      for (const key of [' ', 'r', 'o']) test.key(key);
      expect(test.state.sidebarOpen).toBe(true);
      expect(test.document.activeElement).toBe(test.outline);
      for (const key of [' ', 'r', 'm']) test.key(key);
      expect(test.document.activeElement?.localName).toBe('summary');
      for (const key of [' ', 'r', 'a']) test.key(key);
      expect(test.document.activeElement).toBe(test.annotation);
      for (const key of [' ', 'r', 't']) test.key(key);
      expect(test.document.activeElement).toBe(test.thumbnailList);
    } finally {
      test.sidebar.dispose();
    }
  });

  it('uses configurable context-local aliases for immediate native Outline navigation while native arrows, Tab, editable text and IME pass through', () => {
    const test = harness(
      resolveBindings(JSON.stringify({ 'reader-outline:j': null, 'reader-outline:q': 'uiNext' })),
    );
    try {
      test.sidebar.focus('outline', test.pdf);
      expect(test.key('j').preventDefault).not.toHaveBeenCalled();
      const configured = test.key('q');
      expect(configured.preventDefault).toHaveBeenCalledOnce();
      expect(test.nativeNavigate).toHaveBeenCalledOnce();
      for (const name of ['ArrowDown', 'Tab'])
        expect(test.key(name).preventDefault).not.toHaveBeenCalled();
      expect(test.key('q', { isComposing: true }).preventDefault).not.toHaveBeenCalled();
      const editor = test.createNode('textarea');
      test.outline.appendChild(editor);
      editor.focus();
      expect(test.key('q').preventDefault).not.toHaveBeenCalled();
      test.sidebar.focus('annotations', test.pdf);
      expect(test.key('q').preventDefault).not.toHaveBeenCalled();
      expect(test.nativeNavigate).toHaveBeenCalledOnce();
    } finally {
      test.sidebar.dispose();
    }
  });

  it('leaves native Outline Enter immediate despite conflicting persisted bindings and cancels local pending work', () => {
    const test = harness(
      resolveBindings(
        JSON.stringify({
          'reader-outline:<Enter>': 'uiCancel',
          'reader-outline:<Enter>x': 'uiNext',
          'reader-outline:a': 'uiCancel',
          'reader-outline:ab': 'uiNext',
        }),
      ),
    );
    try {
      test.sidebar.focus('outline', test.pdf);
      test.key('a');
      const nativeEnter = test.key('Enter');
      expect(nativeEnter.preventDefault).not.toHaveBeenCalled();
      expect(nativeEnter.stopImmediatePropagation).not.toHaveBeenCalled();
      test.key('x');
      vi.advanceTimersByTime(2000);
      expect(test.state.sidebarOpen).toBe(true);
      expect(test.document.activeElement).toBe(test.outline);
      expect(test.nativeNavigate).not.toHaveBeenCalled();
      expect(test.key('Enter', { ctrlKey: true }).preventDefault).not.toHaveBeenCalled();
    } finally {
      test.sidebar.dispose();
    }
  });

  it.each(['outline', 'marks', 'annotations', 'thumbnails'] as const)(
    'limits configured controls to the focused %s context',
    (pane) => {
      const test = harness(resolveBindings(JSON.stringify({ [`reader-${pane}:q`]: 'uiCancel' })));
      try {
        test.sidebar.focus(pane === 'outline' ? 'annotations' : 'outline', test.pdf);
        expect(test.key('q').preventDefault).not.toHaveBeenCalled();
        expect(test.state.sidebarOpen).toBe(true);
        test.sidebar.focus(pane, test.pdf);
        const configured = test.key('q');
        expect(configured.preventDefault).toHaveBeenCalledOnce();
        expect(test.state.sidebarOpen).toBe(false);
        expect(test.pdf.focus).toHaveBeenCalledOnce();
      } finally {
        test.sidebar.dispose();
      }
    },
  );

  it.each(['pane change', 'deactivation', 'close and reopen', 'teardown'] as const)(
    'retires delayed local input on %s',
    (change) => {
      const test = harness(
        resolveBindings(
          JSON.stringify({ 'reader-outline:z': 'uiNext', 'reader-outline:zz': 'uiPrevious' }),
        ),
      );
      test.sidebar.focus('outline', test.pdf);
      test.key('z');
      if (change === 'pane change') test.sidebar.focus('thumbnails', test.pdf);
      else if (change === 'deactivation') test.sidebar.deactivate();
      else if (change === 'close and reopen') {
        test.state.sidebarOpen = false;
        test.mutate();
        test.sidebar.focus('outline', test.pdf);
      } else test.sidebar.dispose();
      vi.runAllTimers();
      expect(test.nativeNavigate).not.toHaveBeenCalled();
      test.sidebar.dispose();
    },
  );

  it('retires deferred focus when native pane changes or the Reader deactivates, and permits a fresh reopened request', () => {
    const test = harness();
    try {
      test.state.outline = null;
      test.sidebar.focus('outline', test.pdf);
      test.state.sidebarView = 'annotations';
      test.mutate();
      test.state.outline = [];
      test.state.sidebarView = 'outline';
      test.mutate();
      expect(test.document.activeElement).toBeNull();
      test.state.outline = null;
      test.sidebar.focus('outline', test.pdf);
      test.sidebar.deactivate();
      test.state.outline = [];
      test.mutate();
      expect(test.document.activeElement).toBeNull();
      test.sidebar.focus('outline', test.pdf);
      expect(test.document.activeElement).toBe(test.outline);
    } finally {
      test.sidebar.dispose();
    }
  });
});
