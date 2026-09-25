import { describe, expect, it } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  NOTE_EDITOR_ENABLED_PREFERENCE_KEY as NOTE,
  PICKER_MOUSE_ENABLED_PREFERENCE_KEY as PICKER,
  noteEditorEnabled,
  pickerMouseEnabled,
} from '../../src/core/preferences';
import { SettingsInteraction } from '../../src/main/settings-interaction';

class ElementFake {
  readonly children: ElementFake[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<() => void>>();
  readonly style: Record<string, string> = { cssText: '' };
  textContent = '';
  tabIndex = 0;
  type = '';
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
  click(): void {
    for (const listener of this.listeners.get('click') ?? []) listener();
  }
  all(): ElementFake[] {
    return [this, ...this.children.flatMap((child) => child.all())];
  }
  switch(label: string): ElementFake {
    const match = this.all().find((node) => node.getAttribute('aria-label') === label);
    if (!match) throw new Error(`Missing switch: ${label}`);
    return match;
  }
}

class Preferences implements PreferenceStore {
  readonly values = new Map<string, boolean | number | string>();
  readonly observers = new Map<string, Set<() => void>>();
  readonly writes: Array<[string, boolean | number | string]> = [];
  failKey: string | null = null;
  constructor(initial: Record<string, boolean> = {}) {
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

function mount(initial: Record<string, boolean> = {}) {
  const document = { createElementNS: (_ns: string, tag: string) => new ElementFake(tag) };
  const root = new ElementFake('section');
  const preferences = new Preferences(initial);
  const page = new SettingsInteraction({ document } as never, root as never, preferences);
  const status = root.all().find((node) => node.getAttribute('role') === 'status')!;
  return { page, root, preferences, status };
}

const PICKER_LABEL = 'Mouse row selection and double-click confirmation';
const NOTE_LABEL = 'Vim-style note editing';

describe('Interaction Settings', () => {
  it('shows two cross-surface toggles with correct defaults and truthful descriptions', () => {
    const test = mount();
    expect(test.root.all().find((node) => node.tag === 'h2')?.textContent).toBe('Interaction');
    expect(
      test.root
        .all()
        .filter((node) => node.tag === 'h3')
        .map((node) => node.textContent),
    ).toEqual(['Picker', 'Note editing']);
    expect(
      test.root
        .all()
        .some((node) =>
          node.textContent.includes('including items, collections, tags, tabs, and notes'),
        ),
    ).toBe(true);
    expect(
      test.root
        .all()
        .some((node) => node.textContent.includes('context-pane notes and standalone note tabs')),
    ).toBe(true);
    expect(test.root.all().some((node) => node.textContent.includes('keyboard-only'))).toBe(false);
    expect(test.root.switch(PICKER_LABEL).getAttribute('aria-checked')).toBe('false');
    expect(test.root.switch(NOTE_LABEL).getAttribute('aria-checked')).toBe('true');
    expect(test.root.all().filter((node) => node.getAttribute('role') === 'switch')).toHaveLength(
      2,
    );
    expect(test.preferences.writes).toEqual([]);
    test.page.dispose();
  });

  it('writes only the clicked key and keeps live runtime helpers aligned', () => {
    const test = mount();
    test.root.switch(PICKER_LABEL).click();
    expect(test.preferences.writes).toEqual([[PICKER, true]]);
    expect(test.root.switch(PICKER_LABEL).getAttribute('aria-checked')).toBe('true');
    expect(pickerMouseEnabled(test.preferences)).toBe(true);
    test.root.switch(NOTE_LABEL).click();
    expect(test.preferences.writes).toEqual([
      [PICKER, true],
      [NOTE, false],
    ]);
    expect(noteEditorEnabled(test.preferences)).toBe(false);
    expect(test.root.switch(NOTE_LABEL).getAttribute('aria-checked')).toBe('false');
    expect(test.status.textContent).toBe('');
    test.page.dispose();
  });

  it('vetoes failed writes and clears the inline error after a successful retry', () => {
    const test = mount();
    test.preferences.failKey = PICKER;
    test.root.switch(PICKER_LABEL).click();
    expect(test.preferences.writes).toEqual([]);
    expect(test.root.switch(PICKER_LABEL).getAttribute('aria-checked')).toBe('false');
    expect(test.status.textContent).toContain('Could not update');
    test.preferences.failKey = null;
    test.root.switch(PICKER_LABEL).click();
    expect(test.preferences.writes).toEqual([[PICKER, true]]);
    expect(test.status.textContent).toBe('');
    test.page.dispose();
  });

  it('updates mounted controls on external writes and releases all observers and listeners', () => {
    const test = mount();
    const picker = test.root.switch(PICKER_LABEL);
    const note = test.root.switch(NOTE_LABEL);
    expect(test.preferences.listenerCount()).toBe(2);
    test.preferences.failKey = PICKER;
    picker.click();
    expect(test.status.textContent).toContain('Could not update');
    test.preferences.failKey = null;
    test.preferences.set(PICKER, true);
    expect(test.status.textContent).toBe('');
    test.preferences.set(NOTE, false);
    expect(test.root.switch(PICKER_LABEL)).toBe(picker);
    expect(test.root.switch(NOTE_LABEL)).toBe(note);
    expect(picker.getAttribute('aria-checked')).toBe('true');
    expect(note.getAttribute('aria-checked')).toBe('false');
    expect(test.preferences.listenerCount()).toBe(2);
    test.page.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
    expect(picker.listeners.get('click')?.size).toBe(0);
    expect(note.listeners.get('click')?.size).toBe(0);
    picker.click();
    expect(test.preferences.writes).toHaveLength(2);
    expect(test.root.children).toEqual([]);
  });
});
