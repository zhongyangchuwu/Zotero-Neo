import { describe, expect, it } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  NOTE_EDITOR_ENABLED_PREFERENCE_KEY as NOTE,
  PICKER_MOUSE_ENABLED_PREFERENCE_KEY as PICKER,
  noteEditorEnabled,
  pickerMouseEnabled,
} from '../../src/core/preferences';
import { settingsText } from '../../src/main/settings-i18n';
import { SettingsInteraction } from '../../src/main/settings-interaction';

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
  const page = new SettingsInteraction({} as never, preferences, language, () => changes++);
  return { page, preferences, changes: () => changes };
}

function field(page: SettingsInteraction, id: string) {
  const match = page.model().groups.flatMap((group) => group.fields).find((item) => item.id === id);
  if (!match) throw new Error(`Missing field: ${id}`);
  return match;
}

describe('Interaction Settings controller', () => {
  it('models both live controls with their existing defaults without writing on construction', () => {
    const test = mount();

    expect(test.page.model().groups.map((group) => group.id)).toEqual(['picker', 'note-editing']);
    expect(field(test.page, 'pickerMouseEnabled')).toMatchObject({
      id: 'pickerMouseEnabled',
      kind: 'boolean',
      value: false,
    });
    expect(field(test.page, 'noteEditorEnabled')).toMatchObject({
      id: 'noteEditorEnabled',
      kind: 'boolean',
      value: true,
    });
    expect(test.preferences.writes).toEqual([]);
    expect(test.changes()).toBe(0);
    test.page.dispose();
  });

  it('writes only whitelisted boolean commands immediately and keeps live helpers aligned', () => {
    const test = mount();

    test.page.dispatch({ type: 'value', id: 'pickerMouseEnabled', value: true });
    expect(test.preferences.writes).toEqual([[PICKER, true]]);
    expect(field(test.page, 'pickerMouseEnabled')).toMatchObject({ value: true });
    expect(pickerMouseEnabled(test.preferences)).toBe(true);

    test.page.dispatch({ type: 'value', id: 'noteEditorEnabled', value: false });
    expect(test.preferences.writes).toEqual([
      [PICKER, true],
      [NOTE, false],
    ]);
    expect(field(test.page, 'noteEditorEnabled')).toMatchObject({ value: false });
    expect(noteEditorEnabled(test.preferences)).toBe(false);

    test.page.dispatch({ type: 'value', id: PICKER, value: true });
    test.page.dispatch({ type: 'value', id: 'pickerMouseEnabled', value: 'true' });
    test.page.dispatch({ type: 'action', id: 'pickerMouseEnabled' });
    expect(test.preferences.writes).toHaveLength(2);
    expect(test.changes()).toBeGreaterThan(0);
    test.page.dispose();
  });

  it('reverts failed writes, localizes the error, and clears status after success or external updates', () => {
    const test = mount({}, 'zh-CN');
    test.preferences.failKey = PICKER;
    test.page.dispatch({ type: 'value', id: 'pickerMouseEnabled', value: true });

    expect(field(test.page, 'pickerMouseEnabled')).toMatchObject({ value: false });
    expect(test.page.model().status).toEqual({
      text: settingsText('zh-CN', 'Could not update Interaction settings.'),
      error: true,
    });

    test.preferences.failKey = null;
    test.page.dispatch({ type: 'value', id: 'pickerMouseEnabled', value: true });
    expect(test.page.model().status).toBeUndefined();
    test.page.dispatch({ type: 'value', id: 'noteEditorEnabled', value: false });
    test.preferences.clear(PICKER);
    expect(field(test.page, 'pickerMouseEnabled')).toMatchObject({ value: false });
    expect(field(test.page, 'noteEditorEnabled')).toMatchObject({ value: false });
    expect(test.page.model().status).toBeUndefined();

    const changesBeforeDispose = test.changes();
    expect(test.preferences.listenerCount()).toBe(2);
    test.page.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
    test.preferences.set(NOTE, true);
    test.page.dispatch({ type: 'value', id: 'pickerMouseEnabled', value: true });
    expect(test.changes()).toBe(changesBeforeDispose);
    expect(test.preferences.writes).toHaveLength(3);
  });
});
