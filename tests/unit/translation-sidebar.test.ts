import { describe, expect, it } from 'vitest';
import { ReaderTranslationSidebar } from '../../src/toolkit/reader/translation-sidebar';
import type { ReaderRuntime } from '../../src/toolkit/reader';

/** The native DOM boundary only; role projection and controls are the real implementation. */
function fixture() {
  const all: NativeNode[] = [];
  const doc = {
    createElement: (tag: string) => new NativeNode(tag),
    getElementById: (id: string) => all.find((node) => node.id === id && node.isConnected) ?? null,
    defaultView: {},
  };
  class NativeNode extends EventTarget {
    readonly tagName: string;
    readonly localName: string;
    readonly ownerDocument = doc;
    readonly children: NativeNode[] = [];
    readonly attributes = new Map<string, string>();
    readonly style = { cssText: '' };
    parentElement: NativeNode | null = null;
    id = '';
    className = '';
    textContent = '';
    title = '';
    constructor(tag: string) {
      super();
      this.localName = tag;
      this.tagName = tag.toUpperCase();
      all.push(this);
    }
    get isConnected(): boolean {
      return this === body || !!this.parentElement?.isConnected;
    }
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }
    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }
    removeAttribute(name: string) {
      this.attributes.delete(name);
    }
    hasAttribute(name: string) {
      return this.attributes.has(name);
    }
    toggleAttribute(name: string, enabled: boolean) {
      if (enabled) this.attributes.set(name, '');
      else this.attributes.delete(name);
    }
    appendChild(node: NativeNode) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
      return node;
    }
    prepend(node: NativeNode) {
      node.remove();
      node.parentElement = this;
      this.children.unshift(node);
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
      this.parentElement = null;
    }
    matches(selector: string): boolean {
      return selector.split(',').some((part) => {
        const tokens = part.trim().split(/\s+/);
        const simple = (node: NativeNode, token: string): boolean => {
          const tag = /^[a-z]+/i.exec(token)?.[0];
          if (tag && tag !== node.localName) return false;
          for (const match of token.matchAll(/\.([\w-]+)/g))
            if (!node.className.split(' ').includes(match[1])) return false;
          for (const match of token.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
            const value = node.getAttribute(match[1]);
            if (value === null || (match[2] !== undefined && value !== match[2])) return false;
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
    closest(selector: string): NativeNode | null {
      return this.matches(selector) ? this : (this.parentElement?.closest(selector) ?? null);
    }
    contains(node: NativeNode): boolean {
      return this === node || this.children.some((child) => child.contains(node));
    }
    querySelectorAll(selector: string): NativeNode[] {
      return all.filter((node) => node !== this && this.contains(node) && node.matches(selector));
    }
    querySelector(selector: string): NativeNode | null {
      return this.querySelectorAll(selector)[0] ?? null;
    }
  }
  const body = new NativeNode('body');
  const root = new NativeNode('div');
  root.id = 'annotationsView';
  body.appendChild(root);
  const row = (id: string) => {
    const node = new NativeNode('div');
    node.className = 'annotation';
    node.setAttribute('data-sidebar-annotation-id', id);
    const header = new NativeNode('header');
    const end = new NativeNode('div');
    end.className = 'end';
    header.appendChild(end);
    node.appendChild(header);
    root.appendChild(node);
    return node;
  };
  const human = row('HUMAN');
  human.textContent = '中文人工评论';
  const translation = row('TRANS');
  const nativeFilter = { query: 'preserve this', colors: ['#ffd400'] };
  const reader = {
    _iframeWindow: { document: doc },
    _internalReader: {
      _state: {
        filter: nativeFilter,
        annotations: [
          { id: 'HUMAN', tags: [] },
          { id: 'TRANS', tags: [{ name: 'zotero-neo:translation' }] },
        ],
      },
    },
  } as unknown as ReaderRuntime;
  const sidebar = new ReaderTranslationSidebar(reader, 'zotero-neo:translation', (key) => key);
  return { root, human, translation, sidebar, nativeFilter, reader };
}

describe('native translation sidebar warm start', () => {
  it('classifies existing native rows without waiting for header events or guessing from language', () => {
    const h = fixture();
    expect(h.human.getAttribute('data-zv-translation-role')).toBe('human');
    expect(h.translation.getAttribute('data-zv-translation-role')).toBe('translation');
    expect(h.translation.querySelector('[data-zv-translation-badge]')?.textContent).toBe('badge');
    h.root.querySelector('[data-zv-role="translation"]')!.dispatchEvent(new Event('click'));
    expect(h.human.hasAttribute('data-zv-role-hidden')).toBe(true);
    expect(h.translation.hasAttribute('data-zv-role-hidden')).toBe(false);
    expect(h.nativeFilter).toEqual({ query: 'preserve this', colors: ['#ffd400'] });
    h.sidebar.dispose();
  });

  it('removes only its own projection when disabled and can attach again to the same native rows', () => {
    const h = fixture();
    h.root.querySelector('[data-zv-role="human"]')!.dispatchEvent(new Event('click'));
    h.sidebar.dispose();
    expect(h.translation.hasAttribute('data-zv-role-hidden')).toBe(false);
    expect(h.root.querySelector('[data-zv-translation-filter]')).toBeNull();
    expect(h.root.querySelector('[data-zv-translation-badge]')).toBeNull();
    const next = new ReaderTranslationSidebar(h.reader, 'zotero-neo:translation', (key) => key);
    expect(h.translation.getAttribute('data-zv-translation-role')).toBe('translation');
    next.dispose();
  });
});
