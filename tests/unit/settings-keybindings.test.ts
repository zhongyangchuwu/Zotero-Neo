import { describe, expect, it } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  BINDINGS_PREFERENCE_KEY,
  KEY_GUIDE_DELAY_PREFERENCE_KEY,
  LANGUAGE_PREFERENCE_KEY,
  bindingsFromPreferences,
} from '../../src/core/preferences';
import {
  DEFAULT_BINDINGS,
  encodeBindingOverrides,
  type BindingMap,
} from '../../src/input/bindings';
import { shortcutsForAction } from '../../src/input/shortcut-catalog';
import { SettingsKeybindings } from '../../src/main/settings-keybindings';

class MemoryPreferences implements PreferenceStore {
  readonly values = new Map<string, boolean | number | string>();
  readonly listeners = new Map<string, Set<() => void>>();
  fail = false;
  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string {
    return this.values.get(key) ?? fallback;
  }
  has(key: string): boolean {
    return this.values.has(key);
  }
  set(key: string, value: boolean | number | string): void {
    if (this.fail) throw new Error('preference write failed');
    this.values.set(key, value);
    for (const listener of this.listeners.get(key) ?? []) listener();
  }
  clear(key: string): void {
    this.values.delete(key);
    for (const listener of this.listeners.get(key) ?? []) listener();
  }
  observe(key: string, listener: () => void): () => void {
    const listeners = this.listeners.get(key) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
    };
  }
}

function setup(bindings: BindingMap = DEFAULT_BINDINGS) {
  const preferences = new MemoryPreferences();
  preferences.set(LANGUAGE_PREFERENCE_KEY, 'en');
  preferences.set(BINDINGS_PREFERENCE_KEY, encodeBindingOverrides(bindings));
  const page = new SettingsKeybindings(preferences, 'en', () => {});
  return { page, preferences };
}

const SCROLL = { context: 'reader-normal', action: 'scrollDown' } as const;

describe('Settings keybindings controller', () => {
  it('replaces one shortcut on confirmation without touching the same key in another context', () => {
    const { page, preferences } = setup({
      ...DEFAULT_BINDINGS,
      'main-normal:<S-Space>ff': 'mainNavDown',
    });
    page.dispatch({ type: 'record', ...SCROLL, previous: 'j' });
    page.dispatch({ type: 'record-key', event: { key: ' ', shiftKey: true } });
    page.dispatch({ type: 'record-key', event: { key: 'F8', ctrlKey: true } });
    page.dispatch({ type: 'pop-key' });
    page.dispatch({ type: 'record-key', event: { key: 'f' } });
    page.dispatch({ type: 'record-key', event: { key: 'f' } });
    expect(page.model().edit?.sequence).toBe('<S-Space>ff');
    expect(bindingsFromPreferences(preferences)['reader-normal:j']).toBe('scrollDown');
    page.dispatch({ type: 'save-edit' });
    expect(bindingsFromPreferences(preferences)).toMatchObject({
      'reader-normal:<S-Space>ff': 'scrollDown',
      'main-normal:<S-Space>ff': 'mainNavDown',
    });
    expect(bindingsFromPreferences(preferences)['reader-normal:j']).toBeUndefined();
    expect(page.model().edit).toBeNull();
    page.dispose();
  });

  it('names an exact conflict immediately and does not block unrelated changes', () => {
    const { page, preferences } = setup();
    page.dispatch({ type: 'record', ...SCROLL, previous: 'j' });
    page.dispatch({ type: 'record-key', event: { key: 'k' } });
    expect(page.model().edit?.error).toContain('Scroll up');
    page.dispatch({ type: 'save-edit' });
    expect(bindingsFromPreferences(preferences)).toMatchObject({
      'reader-normal:j': 'scrollDown',
      'reader-normal:k': 'scrollUp',
    });
    page.dispatch({
      type: 'delete-row',
      context: 'reader-normal',
      action: 'lastPage',
      previous: 'G',
    });
    expect(bindingsFromPreferences(preferences)['reader-normal:G']).toBeUndefined();
    page.dispatch({ type: 'save-edit', overwrite: 'scrollUp' });
    const saved = bindingsFromPreferences(preferences);
    expect(saved['reader-normal:k']).toBe('scrollDown');
    expect(saved['reader-normal:j']).toBeUndefined();
    expect(saved['reader-normal:G']).toBeUndefined();
    page.dispose();
  });

  it('rechecks current conflict ownership before allowing overwrite', () => {
    const { page, preferences } = setup();
    page.dispatch({ type: 'record', ...SCROLL, previous: 'j' });
    page.dispatch({ type: 'record-key', event: { key: 'k' } });
    preferences.set(
      BINDINGS_PREFERENCE_KEY,
      encodeBindingOverrides({
        ...DEFAULT_BINDINGS,
        'reader-normal:k': 'firstPage',
      }),
    );
    page.dispatch({ type: 'save-edit', overwrite: 'scrollUp' });
    expect(bindingsFromPreferences(preferences)['reader-normal:k']).toBe('firstPage');
    expect(page.model().edit?.exact).toBe('firstPage');
    page.dispose();
  });

  it('saves literal control keys in an expression and keeps native reservations', () => {
    const { page, preferences } = setup();
    page.dispatch({ type: 'record', ...SCROLL, previous: 'j' });
    page.dispatch({ type: 'toggle-expression' });
    page.dispatch({ type: 'expression', value: '<F8><Enter><Esc><BS>' });
    page.dispatch({ type: 'save-edit' });
    expect(bindingsFromPreferences(preferences)['reader-normal:<F8><Enter><Esc><BS>']).toBe(
      'scrollDown',
    );
    page.dispatch({
      type: 'record',
      context: 'reader-outline',
      action: 'uiConfirm',
      previous: null,
    });
    page.dispatch({ type: 'toggle-expression' });
    page.dispatch({ type: 'expression', value: '<Enter>' });
    expect(page.model().edit?.error).toContain('reserved');
    page.dispatch({ type: 'save-edit' });
    expect(bindingsFromPreferences(preferences)['reader-outline:<Enter>']).toBeUndefined();
    page.dispose();
  });

  it('leaves the old binding on cancel and reports write failures in the editing row', () => {
    const { page, preferences } = setup();
    page.dispatch({ type: 'record', ...SCROLL, previous: 'j' });
    page.dispatch({ type: 'record-key', event: { key: 'F8', altKey: true } });
    preferences.fail = true;
    page.dispatch({ type: 'save-edit' });
    expect(page.model().edit).toMatchObject({
      sequence: '<M-F8>',
      error: 'Could not save bindings.',
    });
    page.dispatch({ type: 'cancel-edit' });
    expect(bindingsFromPreferences(preferences)).toEqual(DEFAULT_BINDINGS);
    page.dispose();
  });

  it('resets and unbinds immediately without taking defaults owned by another action', () => {
    const { page, preferences } = setup({ ...DEFAULT_BINDINGS, 'reader-normal:j': 'scrollUp' });
    page.dispatch({ type: 'reset-action', ...SCROLL });
    expect(page.model().notice?.text).toContain('Scroll up');
    expect(bindingsFromPreferences(preferences)['reader-normal:j']).toBe('scrollUp');
    page.dispatch({ type: 'unbind', context: 'reader-normal', action: 'scrollUp' });
    expect(
      shortcutsForAction(bindingsFromPreferences(preferences), 'reader-normal', 'scrollUp'),
    ).toEqual([]);
    page.dispatch({ type: 'reset-action', ...SCROLL });
    expect(bindingsFromPreferences(preferences)['reader-normal:j']).toBe('scrollDown');
    page.dispose();
  });

  it('reports failed Prefix Guide writes and clamps numeric values', () => {
    const { page, preferences } = setup();
    page.dispatch({ type: 'guide-number', setting: 'delayMs', value: -50 });
    expect(preferences.get(KEY_GUIDE_DELAY_PREFERENCE_KEY, 1)).toBe(0);
    preferences.fail = true;
    page.dispatch({ type: 'guide-enabled', value: false });
    expect(page.model().guide.error).not.toBe('');
    page.dispose();
  });
});
