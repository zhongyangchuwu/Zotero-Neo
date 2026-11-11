import { describe, expect, it } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  LANGUAGE_PREFERENCE_KEY as LANGUAGE,
  TAG_SEPARATOR_PREFERENCE_KEY as TAG_SEPARATOR,
  configuredNeoLanguage,
  tagSeparatorFromPreferences,
} from '../../src/core/preferences';
import { settingsText } from '../../src/main/settings-i18n';
import { SettingsAdvanced } from '../../src/main/settings-advanced';

type PreferenceValue = boolean | number | string;

class Preferences implements PreferenceStore {
  readonly values = new Map<string, PreferenceValue>();
  readonly observers = new Map<string, Set<() => void>>();
  readonly writes: Array<[string, PreferenceValue]> = [];
  failKey: string | null = null;

  constructor(initial: Record<string, PreferenceValue> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: PreferenceValue): PreferenceValue {
    return this.values.get(key) ?? fallback;
  }

  set(key: string, value: PreferenceValue): void {
    if (key === this.failKey) throw new Error('Write failed');
    this.values.set(key, value);
    this.writes.push([key, value]);
    this.#notify(key);
  }

  clear(key: string): void {
    this.values.delete(key);
    this.#notify(key);
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

  #notify(key: string): void {
    for (const listener of this.observers.get(key) ?? []) listener();
  }
}

function mount(
  initial: Record<string, PreferenceValue> = {},
  language: 'en' | 'zh-CN' = 'en',
) {
  const preferences = new Preferences(initial);
  let changes = 0;
  const page = new SettingsAdvanced({} as never, preferences, language, () => changes++);
  return { page, preferences, changes: () => changes };
}

function field(page: SettingsAdvanced, id: string) {
  const match = page.model().groups.flatMap((group) => group.fields).find((item) => item.id === id);
  if (!match) throw new Error(`Missing field: ${id}`);
  return match;
}

describe('Advanced Settings controller', () => {
  it('models the existing choices and separator default without writing on construction', () => {
    const test = mount();
    const language = field(test.page, 'language');

    expect(test.page.model().groups.map((group) => group.id)).toEqual(['language', 'tag-namespaces']);
    expect(language).toMatchObject({
      id: 'language',
      kind: 'choice',
      value: '',
      options: [
        { value: '', label: 'Follow Zotero' },
        { value: 'en', label: 'English' },
        { value: 'zh-CN', label: '中文' },
      ],
    });
    expect(field(test.page, 'tagSeparator')).toMatchObject({
      id: 'tagSeparator',
      kind: 'text',
      value: '/',
      commit: 'change',
    });
    expect(test.preferences.writes).toEqual([]);
    expect(test.changes()).toBe(0);
    test.page.dispose();
  });

  it('persists only accepted language and separator values immediately, including explicit flat matching', () => {
    const test = mount();

    test.page.dispatch({ type: 'value', id: 'language', value: 'zh-CN' });
    expect(test.preferences.writes).toEqual([[LANGUAGE, 'zh-CN']]);
    expect(configuredNeoLanguage(test.preferences)).toBe('zh-CN');
    expect(field(test.page, 'language')).toMatchObject({ value: 'zh-CN' });

    test.page.dispatch({ type: 'value', id: 'tagSeparator', value: '::' });
    expect(test.preferences.writes).toContainEqual([TAG_SEPARATOR, '::']);
    expect(tagSeparatorFromPreferences(test.preferences)).toBe('::');
    test.page.dispatch({ type: 'value', id: 'tagSeparator', value: '' });
    expect(test.preferences.writes).toContainEqual([TAG_SEPARATOR, '']);
    expect(tagSeparatorFromPreferences(test.preferences)).toBe('');
    expect(field(test.page, 'tagSeparator')).toMatchObject({ value: '' });

    test.page.dispatch({ type: 'value', id: 'language', value: 'fr' });
    test.page.dispatch({ type: 'value', id: 'language', value: true });
    test.page.dispatch({ type: 'value', id: 'tagSeparator', value: false });
    test.page.dispatch({ type: 'value', id: LANGUAGE, value: 'en' });
    test.page.dispatch({ type: 'action', id: 'language' });
    expect(test.preferences.writes).toHaveLength(3);
    expect(test.page.model().status).toBeUndefined();
    expect(test.changes()).toBeGreaterThan(0);
    test.page.dispose();
  });

  it('reverts failed values, localizes status, follows external separator resets, and disposes observers', () => {
    const test = mount({}, 'zh-CN');
    test.preferences.failKey = LANGUAGE;
    test.page.dispatch({ type: 'value', id: 'language', value: 'en' });
    expect(field(test.page, 'language')).toMatchObject({ value: '' });
    expect(test.page.model().status).toEqual({
      text: settingsText('zh-CN', 'Could not update Advanced settings.'),
      error: true,
    });

    test.preferences.failKey = null;
    test.preferences.set(TAG_SEPARATOR, ':');
    expect(field(test.page, 'tagSeparator')).toMatchObject({ value: ':' });
    expect(test.page.model().status).toBeUndefined();

    test.preferences.failKey = TAG_SEPARATOR;
    test.page.dispatch({ type: 'value', id: 'tagSeparator', value: ';' });
    expect(field(test.page, 'tagSeparator')).toMatchObject({ value: ':' });
    expect(test.page.model().status).toEqual({
      text: settingsText('zh-CN', 'Could not update Advanced settings.'),
      error: true,
    });

    test.preferences.failKey = null;
    test.preferences.clear(TAG_SEPARATOR);
    expect(field(test.page, 'tagSeparator')).toMatchObject({ value: '/' });
    expect(test.page.model().status).toBeUndefined();

    const changesBeforeDispose = test.changes();
    expect(test.preferences.listenerCount()).toBe(1);
    test.page.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
    test.preferences.set(TAG_SEPARATOR, ':');
    test.page.dispatch({ type: 'value', id: 'tagSeparator', value: ';' });
    expect(test.changes()).toBe(changesBeforeDispose);
    expect(test.preferences.writes).toHaveLength(2);
  });
});
