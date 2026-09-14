import { describe, expect, it, vi } from 'vitest';

import type { BindingMap } from '../../src/input/bindings';
import {
  mountBindingEditor,
  type BindingEditorHostAdapter,
  type BindingEditorGeometryAdapter,
} from '../../src/preferences/binding-editor-view';

const XUL_NAMESPACE = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

type FakeListener = (event: Event) => void;

type AttributeSelector = {
  readonly name: string;
  readonly value?: string;
};

function selectorParts(selector: string): {
  readonly tag: string | null;
  readonly id: string | null;
  readonly classes: readonly string[];
  readonly attributes: readonly AttributeSelector[];
} {
  const tagMatch = selector.match(/^[A-Za-z][A-Za-z0-9-]*/);
  const idMatch = selector.match(/#([A-Za-z0-9_-]+)/);
  const classes = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
  const attributes = [...selector.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]/g)].map(
    (match) => ({ name: match[1], value: match[2] }),
  );
  return {
    tag: tagMatch?.[0] ?? null,
    id: idMatch?.[1] ?? null,
    classes,
    attributes,
  };
}

class FakeElement {
  readonly nodeType = 1;
  readonly localName: string;
  readonly tagName: string;
  readonly namespaceURI: string;
  readonly ownerDocument: FakeDocument;
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, FakeListener[]>();
  readonly classList = {
    add: (...names: string[]) => {
      for (const name of names) this.classes.add(name);
    },
    remove: (...names: string[]) => {
      for (const name of names) this.classes.delete(name);
    },
    contains: (name: string) => this.classes.has(name),
  };
  parentElement: FakeElement | null = null;
  id = '';
  value = '';
  type = '';
  autocomplete = '';
  tabIndex = 0;
  hidden = false;
  private selectedValue = false;
  disabled = false;
  title = '';
  textContent = '';
  scrollTop = 0;
  private classes = new Set<string>();
  private readonly attributes = new Map<string, string>();

  constructor(
    ownerDocument: FakeDocument,
    localName: string,
    namespaceURI = 'http://www.w3.org/1999/xhtml',
  ) {
    this.ownerDocument = ownerDocument;
    this.localName = localName;
    this.tagName = localName.toUpperCase();
    this.namespaceURI = namespaceURI;
  }
  get className(): string {
    return [...this.classes].join(' ');
  }
  get selected(): boolean {
    return this.selectedValue;
  }

  set selected(value: boolean) {
    if (this.namespaceURI === XUL_NAMESPACE && this.localName === 'menuitem') {
      throw new TypeError('XUL menuitem.selected is read-only');
    }
    this.selectedValue = value;
  }

  set className(value: string) {
    this.classes = new Set(value.split(/\s+/).filter(Boolean));
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node: FakeElement): FakeElement {
    if (node.parentElement) {
      const index = node.parentElement.children.indexOf(node);
      if (index >= 0) node.parentElement.children.splice(index, 1);
    }
    node.parentElement = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0, this.children.length);
    for (const node of nodes) this.appendChild(node);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'id') this.id = value;
    if (name === 'class') this.className = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name === 'class') this.classes.clear();
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener as FakeListener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  select(): void {}

  private matches(selector: string): boolean {
    const parts = selectorParts(selector);
    if (parts.tag && this.localName !== parts.tag) return false;
    if (parts.id && this.id !== parts.id) return false;
    if (parts.classes.some((name) => !this.classes.has(name))) return false;
    return parts.attributes.every(({ name, value }) => {
      const actual = this.getAttribute(name);
      return actual !== null && (value === undefined || actual === value);
    });
  }

  closest(selector: string): FakeElement | null {
    let current: FakeElement | null = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = [];
    const visit = (element: FakeElement): void => {
      for (const child of element.children) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  emit(type: string, init: Partial<Event> & { readonly key?: string } = {}): Event {
    const preventDefault = init.preventDefault ?? vi.fn();
    const stopPropagation = init.stopPropagation ?? vi.fn();
    const stopImmediatePropagation = init.stopImmediatePropagation ?? vi.fn();
    const event = {
      ...init,
      type,
      target: init.target ?? this,
      preventDefault,
      stopPropagation,
      stopImmediatePropagation,
    } as unknown as Event;
    let current: FakeElement | null = this;
    while (current) {
      for (const listener of current.listeners.get(type) ?? []) listener(event);
      current = current.parentElement;
    }
    return event;
  }
}

class FakeDocument {
  readonly documentElement: FakeElement;
  readonly defaultView: Window;
  activeElement: FakeElement | null = null;

  constructor() {
    this.documentElement = new FakeElement(this, 'root', 'http://www.w3.org/1999/xhtml');
    const pendingTimers = new Map<number, TimerHandler>();
    let nextTimer = 0;
    this.defaultView = {
      setTimeout: (callback: TimerHandler) => {
        const id = ++nextTimer;
        pendingTimers.set(id, callback);
        return id;
      },
      clearTimeout: (id?: number) => {
        if (id === undefined) return;
        pendingTimers.delete(id);
      },
    } as unknown as Window;
  }

  createElementNS(namespace: string, localName: string): FakeElement {
    return new FakeElement(this, localName, namespace);
  }

  querySelector(selector: string): FakeElement | null {
    if (this.documentElement.closest(selector)) return this.documentElement;
    return this.documentElement.querySelector(selector);
  }
}

function createViewHarness(baseline: BindingMap = { 'normal:x': 'scrollDown' } as BindingMap) {
  const document = new FakeDocument();
  const root = document.documentElement;
  const wrapper = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  wrapper.id = 'zv-bindings-table-wrap';
  const body = document.createElementNS('http://www.w3.org/1999/xhtml', 'tbody');
  body.id = 'zv-bindings-body';
  wrapper.appendChild(body);
  const add = document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
  add.id = 'zv-add-binding';
  const reset = document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
  reset.id = 'zv-reset-bindings';
  const save = document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
  save.id = 'zv-save';
  const validationStatus = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  validationStatus.id = 'zv-bindings-validation-status';
  const saveStatus = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  saveStatus.id = 'zv-save-status';
  root.append(add, reset, save, wrapper, validationStatus, saveStatus);

  const createCalls: string[] = [];
  const host: BindingEditorHostAdapter & { readonly createCalls: string[] } = {
    createCalls,
    createXULElement: (_document, localName) => {
      createCalls.push(localName);
      return document.createElementNS(XUL_NAMESPACE, localName) as unknown as Element;
    },
    setMenuValue: (menu, value) => {
      (menu as unknown as FakeElement).value = value;
      menu.setAttribute('value', value);
    },
    getMenuValue: (menu) => (menu as unknown as FakeElement).value,
  };
  const setScrollTop = vi.fn((element: HTMLElement, top: number) => {
    (element as unknown as FakeElement).scrollTop = top;
  });
  const focusAndSelect = vi.fn((input: HTMLInputElement) => {
    const element = input as unknown as FakeElement;
    element.focus();
    element.select();
  });
  const scrollIntoView = vi.fn();
  const geometry = {
    setScrollTop,
    focusAndSelect,
    scrollIntoView,
  } satisfies BindingEditorGeometryAdapter;
  const mounted = mountBindingEditor({
    document: document as unknown as Document,
    root: root as unknown as Element,
    baseline,
    host,
    geometry,
  });
  return { document, root, wrapper, add, host, geometry, mounted };
}

function firstRow(harness: { readonly root: FakeElement }): FakeElement {
  const body = harness.root.querySelector('#zv-bindings-body');
  const row = body?.querySelector('tr');
  if (!row) throw new Error('Expected a rendered binding row');
  return row;
}

function actionInput(row: FakeElement): FakeElement {
  const input = row.querySelector('.zv-binding-action-input');
  if (!input) throw new Error('Expected an Action input');
  return input;
}

function actionResults(row: FakeElement): FakeElement {
  const results = row.querySelector('.zv-binding-action-results');
  if (!results) throw new Error('Expected Action results');
  return results;
}

function expectExactlyOneSelectedAction(row: FakeElement): void {
  const input = actionInput(row);
  const results = actionResults(row);
  expect(input.getAttribute('role')).toBe('combobox');
  const selected = results.querySelectorAll('[aria-selected="true"]');
  expect(selected).toHaveLength(1);
  expect(input.getAttribute('aria-activedescendant')).toBe(selected[0].id);
  expect(input.getAttribute('aria-controls')).toBe(results.id);
}

describe('mounted binding editor view', () => {
  it('adds row zero, clears wrapper scroll, and focuses/selects its Key input', () => {
    const harness = createViewHarness();
    harness.wrapper.scrollTop = 320;

    harness.add.emit('click');

    const added = harness.mounted.getState().rows[0];
    expect(added).toMatchObject({ mode: 'normal', key: '', action: '' });
    expect(harness.wrapper.scrollTop).toBe(0);
    expect(harness.geometry.setScrollTop).toHaveBeenCalledWith(harness.wrapper, 0);
    const focused = harness.geometry.focusAndSelect.mock.calls[0]?.[0] as unknown as FakeElement;
    expect(focused.classList.contains('zv-binding-key')).toBe(true);
    expect(focused).toBe(firstRow(harness).querySelector('.zv-binding-key'));
  });

  it('routes delegated Key input into the authoritative model', () => {
    const harness = createViewHarness();
    const key = firstRow(harness).querySelector('.zv-binding-key');
    if (!key) throw new Error('Expected a Key input');
    key.value = 'z';
    key.emit('input');

    expect(harness.mounted.getState().rows[0]?.key).toBe('z');
  });

  it('creates native XUL Mode controls and routes every Mode command to the model', () => {
    const harness = createViewHarness();
    const rowId = harness.mounted.getState().rows[0].id;

    expect(harness.host.createCalls).toContain('menulist');
    expect(harness.host.createCalls).toContain('menupopup');
    expect(firstRow(harness).querySelector('.zv-binding-mode')?.value).toBe('normal');

    for (const mode of ['normal', 'visual', 'cursor', 'insert', 'main'] as const) {
      const currentRow = harness.mounted.getState().rows.find((row) => row.id === rowId);
      expect(currentRow).toBeDefined();
      const renderedRow = firstRow(harness);
      const menu = renderedRow.querySelector('.zv-binding-mode');
      expect(menu?.namespaceURI).toBe(XUL_NAMESPACE);
      const option = menu?.querySelector(`.zv-binding-mode-option[value="${mode}"]`);
      if (!option) throw new Error(`Expected ${mode} Mode option`);
      option.emit('command');
      expect(harness.mounted.getState().rows.find((row) => row.id === rowId)?.mode).toBe(mode);
    }
  });

  it('keeps exactly one selected Action with a matching active descendant', () => {
    const harness = createViewHarness();
    const renderedRow = firstRow(harness);

    actionInput(renderedRow).emit('focusin');
    const input = actionInput(firstRow(harness));
    input.value = 'scroll';
    input.emit('input');
    expect(harness.mounted.getState().actionEditor).toMatchObject({
      query: 'scroll',
      open: true,
    });
    expectExactlyOneSelectedAction(firstRow(harness));
  });

  it('supports pointer selection, keyboard commit, Escape, and Tab exit through delegated events', () => {
    const harness = createViewHarness();
    const initialRow = firstRow(harness);

    actionInput(initialRow).emit('focusin');
    const pointerRow = actionResults(firstRow(harness)).children[1];
    if (!pointerRow) throw new Error('Expected a second Action option');
    const pointerAction = pointerRow.value;
    pointerRow.emit('click');
    expect(harness.mounted.getState().actionEditor).toBeNull();
    expect(harness.mounted.getState().rows[0]?.action).toBe(pointerAction);

    actionInput(firstRow(harness)).emit('focusin');
    const keyboardInput = actionInput(firstRow(harness));
    const arrowPreventDefault = vi.fn();
    keyboardInput.emit('keydown', { key: 'ArrowDown', preventDefault: arrowPreventDefault });
    expect(arrowPreventDefault).toHaveBeenCalledOnce();
    expectExactlyOneSelectedAction(firstRow(harness));
    const selectedAction = actionResults(firstRow(harness)).querySelector(
      '[aria-selected="true"]',
    )?.value;
    keyboardInput.emit('keydown', { key: 'Enter' });
    expect(harness.mounted.getState().actionEditor).toBeNull();
    expect(harness.mounted.getState().rows[0]?.action).toBe(selectedAction);

    actionInput(firstRow(harness)).emit('focusin');
    const escapePreventDefault = vi.fn();
    actionInput(firstRow(harness)).emit('keydown', {
      key: 'Escape',
      preventDefault: escapePreventDefault,
    });
    expect(escapePreventDefault).toHaveBeenCalledOnce();
    expect(harness.mounted.getState().actionEditor).toBeNull();

    actionInput(firstRow(harness)).emit('focusin');
    actionInput(firstRow(harness)).emit('keydown', { key: 'Tab' });
    expect(harness.mounted.getState().actionEditor).toBeNull();
  });

  it('disposes delegated listeners and makes later events and dispatch inert', () => {
    const harness = createViewHarness();
    const before = harness.mounted.getState();
    harness.mounted.dispose();

    harness.add.emit('click');
    harness.mounted.dispatch({ type: 'add-row' });
    harness.mounted.render();

    expect(harness.mounted.getState()).toBe(before);
    expect(harness.geometry.setScrollTop).not.toHaveBeenCalled();
    expect(harness.geometry.focusAndSelect).not.toHaveBeenCalled();
  });
});
