import { describe, expect, it } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  LANGUAGE_PREFERENCE_KEY as LANGUAGE,
  TAG_SEPARATOR_PREFERENCE_KEY as TAG_SEPARATOR,
  configuredNeoLanguage,
  tagSeparatorFromPreferences,
} from '../../src/core/preferences';
import { SettingsAdvanced } from '../../src/main/settings-advanced';

class ElementFake {
  readonly children: ElementFake[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<() => void>>();
  readonly style: Record<string, string> = {
    cssText: '',
    background: '',
    color: '',
    borderColor: '',
  };
  textContent = '';
  tabIndex = 0;
  type = '';
  value = '';
  constructor(readonly tag: string) {}
  append(...children: ElementFake[]): void {
    this.children.push(...children);
  }
  replaceChildren(...children: ElementFake[]): void {
    this.children.splice(0, this.children.length, ...children);
  }
  setAttribute(key: string, value: string): void {
    this.attributes.set(key, value);
  }
  getAttribute(key: string): string | null {
    return this.attributes.get(key) ?? null;
  }
  addEventListener(type: string, listener: () => void): void {
    const group = this.listeners.get(type) ?? new Set();
    group.add(listener);
    this.listeners.set(type, group);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  click(): void {
    this.emit('click');
  }
  all(): ElementFake[] {
    return [this, ...this.children.flatMap((child) => child.all())];
  }
  button(label: string): ElementFake {
    const match = this.all().find((node) => node.tag === 'button' && node.textContent === label);
    if (!match) throw new Error(`Missing button: ${label}`);
    return match;
  }
  byAria(label: string): ElementFake {
    const match = this.all().find((node) => node.getAttribute('aria-label') === label);
    if (!match) throw new Error(`Missing control: ${label}`);
    return match;
  }
}

class Preferences implements PreferenceStore {
  readonly values = new Map<string, boolean | number | string>();
  readonly observers = new Map<string, Set<() => void>>();
  readonly writes: Array<[string, boolean | number | string]> = [];
  failKey: string | null = null;
  constructor(initial: Record<string, boolean | number | string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }
  has(key: string): boolean {
    return this.values.has(key);
  }
  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string {
    return this.values.get(key) ?? fallback;
  }
  set(key: string, value: boolean | number | string): void {
    if (key === this.failKey) throw new Error('Write failed');
    this.values.set(key, value);
    this.writes.push([key, value]);
    for (const listener of this.observers.get(key) ?? []) listener();
  }
  observe(key: string, listener: () => void): () => void {
    const group = this.observers.get(key) ?? new Set();
    group.add(listener);
    this.observers.set(key, group);
    return () => group.delete(listener);
  }
  listenerCount(): number {
    return [...this.observers.values()].reduce((count, group) => count + group.size, 0);
  }
}

function mount(initial: Record<string, boolean | number | string> = {}) {
  const document = { createElementNS: (_ns: string, tag: string) => new ElementFake(tag) };
  const root = new ElementFake('section');
  const preferences = new Preferences(initial);
  const page = new SettingsAdvanced({ document } as never, root as never, preferences);
  const status = root.all().find((node) => node.getAttribute('role') === 'status')!;
  return { page, root, preferences, status };
}

describe('Advanced Settings', () => {
  it('renders command language and virtual tag namespace controls with truthful defaults', () => {
    const test = mount();
    expect(test.root.all().find((node) => node.tag === 'h2')?.textContent).toBe('Advanced');
    expect(
      test.root
        .all()
        .filter((node) => node.tag === 'h3')
        .map((node) => node.textContent),
    ).toEqual(['Interface and command language', 'Tag namespaces']);
    expect(test.root.button('Follow Zotero').getAttribute('aria-pressed')).toBe('true');
    expect(test.root.button('English').getAttribute('aria-pressed')).toBe('false');
    expect(test.root.button('中文').getAttribute('aria-pressed')).toBe('false');
    expect(test.root.byAria('Namespace separator').value).toBe('/');
    const copy = test.root
      .all()
      .map((node) => node.textContent)
      .join(' ');
    expect(copy).toContain(
      'Changes the Neo Settings interface and localized command labels immediately.',
    );
    expect(copy).toContain('existing Zotero tags are never rewritten');
    expect(test.preferences.writes).toEqual([]);
    test.page.dispose();
  });

  it('persists language and tag separators live, including explicit flat matching', () => {
    const test = mount();
    test.root.button('中文').click();
    expect(test.preferences.writes).toEqual([[LANGUAGE, 'zh-CN']]);
    expect(configuredNeoLanguage(test.preferences)).toBe('zh-CN');

    const separator = test.root.byAria('Namespace separator');
    separator.value = '::';
    separator.emit('change');
    expect(test.preferences.writes).toContainEqual([TAG_SEPARATOR, '::']);
    expect(tagSeparatorFromPreferences(test.preferences)).toBe('::');

    separator.value = '';
    separator.emit('change');
    expect(test.preferences.writes).toContainEqual([TAG_SEPARATOR, '']);
    expect(tagSeparatorFromPreferences(test.preferences)).toBe('');
    expect(test.status.textContent).toBe('');
    test.page.dispose();
  });

  it('vetoes failed writes, tracks external changes, and releases observers and listeners', () => {
    const test = mount();
    const chinese = test.root.button('中文');
    const follow = test.root.button('Follow Zotero');
    const separator = test.root.byAria('Namespace separator');
    expect(test.preferences.listenerCount()).toBe(1);

    test.preferences.failKey = LANGUAGE;
    chinese.click();
    expect(chinese.getAttribute('aria-pressed')).toBe('false');
    expect(follow.getAttribute('aria-pressed')).toBe('true');
    expect(test.status.textContent).toContain('Could not update Advanced settings');

    test.preferences.failKey = null;
    chinese.click();
    expect(chinese.getAttribute('aria-pressed')).toBe('true');
    expect(test.status.textContent).toBe('');
    test.preferences.set(TAG_SEPARATOR, ':');
    expect(separator.value).toBe(':');

    const writeCount = test.preferences.writes.length;
    test.page.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
    expect(test.root.children).toEqual([]);
    separator.value = '/';
    separator.emit('change');
    chinese.click();
    expect(test.preferences.writes).toHaveLength(writeCount);
  });
});
