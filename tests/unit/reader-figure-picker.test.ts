import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderFigurePicker } from '../../src/modules/reader-navigation/figure-picker';
import type {
  ReaderCaptionTarget,
  ReaderCaptionTargets,
} from '../../src/modules/reader-navigation/caption-targets';
import type { PdfWindow } from '../../src/reader/types';
import type { ReaderRegionPreview } from '../../src/toolkit/reader';

const native = vi.hoisted(() => ({ window: null as unknown }));
vi.mock('../../src/toolkit/reader', () => ({ readerWindow: () => native.window }));

/** Minimal chooser DOM; actual focus, IME and rendering are also checked in the dedicated Zotero profile. */
class Element {
  children: Element[] = [];
  parent: Element | null = null;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, ((event: unknown) => void)[]>();
  value = '';
  disabled = false;
  src = '';
  text = '';
  constructor(
    readonly tagName: string,
    readonly ownerDocument: DocumentFixture,
    readonly top = false,
  ) {}
  get isConnected(): boolean {
    return this.top || !!this.parent?.isConnected;
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(value: string) {
    this.replaceChildren();
    this.text = value;
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  removeAttribute(key: string) {
    this.attributes.delete(key);
  }
  append(...nodes: Element[]) {
    for (const n of nodes) {
      n.parent = this;
      this.children.push(n);
    }
  }
  replaceChildren(...nodes: Element[]) {
    for (const c of this.children) c.parent = null;
    this.children = [];
    this.text = '';
    this.append(...nodes);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  scrollIntoView() {}
  contains(node: Element): boolean {
    return this === node || this.children.some((c) => c.contains(node));
  }
  querySelector(tag: string): Element | null {
    for (const c of this.children) {
      if (c.tagName === tag) return c;
      const found = c.querySelector(tag);
      if (found) return found;
    }
    return null;
  }
  addEventListener(name: string, listener: (event: unknown) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  removeEventListener(name: string, listener: (event: unknown) => void) {
    this.listeners.set(
      name,
      (this.listeners.get(name) ?? []).filter((l) => l !== listener),
    );
  }
  emit(name: string) {
    for (const listener of this.listeners.get(name) ?? []) listener({ target: this });
  }
}
class DocumentFixture {
  documentElement = new Element('html', this, true);
  activeElement: Element | null = null;
  nodes: Element[] = [];
  createElementNS(_ns: string, tag: string) {
    const node = new Element(tag, this);
    this.nodes.push(node);
    return node;
  }
  find(tag: string) {
    return this.nodes.find((n) => n.isConnected && n.tagName === tag)!;
  }
}
function harness() {
  const doc = new DocumentFixture(),
    focus = vi.fn(),
    untheme = vi.fn();
  const originalFocus = doc.createElementNS('', 'body');
  doc.documentElement.append(originalFocus);
  originalFocus.focus();
  const window = { document: doc, AbortController, focus } as unknown as PdfWindow;
  native.window = window;
  const targets: ReaderCaptionTarget[] = ['alpha', 'beta'].map((title, i) => ({
    kind: 'table',
    label: String(i),
    title,
    location: { position: { pageIndex: i, rects: [[10, 10, 100, 100]] } },
  }));
  const load = vi.fn().mockResolvedValue(targets),
    sourceCurrent = vi.fn().mockResolvedValue(true);
  const render = vi
    .fn<(target: ReaderCaptionTarget, signal: AbortSignal) => Promise<ReaderRegionPreview>>()
    .mockResolvedValue({ dataURL: 'initial', width: 1, height: 1 });
  const navigate = vi.fn().mockResolvedValue(true),
    current = vi.fn(() => true);
  const picker = new ReaderFigurePicker({
    reader: {},
    captions: { load, sourceCurrent, bodies: [] } as unknown as ReaderCaptionTargets,
    text: (key) => key,
    themeRoot: () => untheme,
    captureView: () => current,
    isCurrent: () => true,
    render,
    navigate,
    debug: vi.fn(),
  });
  const key = (value: string, extra = {}) => {
    const event = {
      key: value,
      target: doc.activeElement,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      ...extra,
    };
    picker.handleKey(event as unknown as KeyboardEvent);
    return event;
  };
  return {
    picker,
    doc,
    window,
    targets,
    load,
    sourceCurrent,
    render,
    navigate,
    current,
    untheme,
    focus,
    originalFocus,
    key,
  };
}
afterEach(() => {
  native.window = null;
});
describe('Reader figure chooser lifetime', () => {
  it('contains a late load after closing and restores the initiating focus only on request', async () => {
    const t = harness(),
      pending = Promise.withResolvers<readonly ReaderCaptionTarget[]>();
    t.load.mockReturnValueOnce(pending.promise);
    t.picker.open(t.window);
    t.picker.close(true);
    pending.resolve(t.targets);
    await Promise.resolve();
    expect(t.render).not.toHaveBeenCalled();
    expect(t.navigate).not.toHaveBeenCalled();
    expect(t.untheme).toHaveBeenCalledOnce();
    expect(t.doc.activeElement).toBe(t.originalFocus);
  });
  it('cancels the superseded render and ignores its late image while browsing without navigation', async () => {
    const t = harness(),
      first = Promise.withResolvers<ReaderRegionPreview>();
    t.render
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ dataURL: 'second', width: 1, height: 1 });
    t.picker.open(t.window);
    await vi.waitFor(() => expect(t.render).toHaveBeenCalledOnce());
    t.key('ArrowDown');
    await vi.waitFor(() => expect(t.doc.find('img')?.src).toBe('second'));
    expect(t.render.mock.calls[0]![1].aborted).toBe(true);
    first.resolve({ dataURL: 'stale', width: 1, height: 1 });
    await Promise.resolve();
    expect(t.doc.find('img').src).toBe('second');
    expect(t.navigate).not.toHaveBeenCalled();
    t.picker.close();
  });
  it('leaves IME keys alone, rejects stale targets and keeps the dialog open on navigation failure', async () => {
    const t = harness();
    t.picker.open(t.window);
    await vi.waitFor(() => expect(t.doc.find('img')).toBeDefined());
    expect(t.key('Enter', { isComposing: true }).preventDefault).not.toHaveBeenCalled();
    expect(t.navigate).not.toHaveBeenCalled();
    t.sourceCurrent.mockResolvedValue(false);
    t.key('Enter');
    await vi.waitFor(() => expect(t.doc.find('p')?.isConnected).toBe(true));
    await Promise.resolve();
    expect(t.navigate).not.toHaveBeenCalled();
    t.sourceCurrent.mockResolvedValue(true);
    t.navigate.mockResolvedValue(false);
    t.key('Enter');
    await vi.waitFor(() => expect(t.navigate).toHaveBeenCalledOnce());
    expect(t.doc.find('section')).toBeDefined();
    t.picker.close();
  });
  it('admits Enter once and retires pending work with its exact initiating view', async () => {
    const t = harness(),
      pending = Promise.withResolvers<boolean>();
    t.navigate.mockReturnValue(pending.promise);
    t.picker.open(t.window);
    await vi.waitFor(() => expect(t.doc.find('img')).toBeDefined());
    t.key('Enter');
    t.key('Enter');
    await vi.waitFor(() => expect(t.navigate).toHaveBeenCalledOnce());
    t.picker.releaseView({} as PdfWindow);
    expect(t.doc.find('section')).toBeDefined();
    t.picker.releaseView(t.window);
    pending.resolve(true);
    await Promise.resolve();
    expect(t.doc.find('section')).toBeUndefined();
    expect(t.focus).not.toHaveBeenCalled();
    expect(t.untheme).toHaveBeenCalledOnce();
  });
});
