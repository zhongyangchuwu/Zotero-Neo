import { describe, expect, it } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  BINDINGS_PREFERENCE_KEY,
  KEY_GUIDE_DELAY_PREFERENCE_KEY,
  LANGUAGE_PREFERENCE_KEY,
  bindingsFromPreferences,
} from '../../src/core/preferences';
import { DEFAULT_BINDINGS, encodeBindingOverrides } from '../../src/input/bindings';
import { shortcutsForAction } from '../../src/input/shortcut-catalog';
import {
  SettingsKeybindings,
  type SettingsKeybindingsState,
} from '../../src/main/settings-keybindings';

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

function setup(state: SettingsKeybindingsState = { editor: null }) {
  const preferences = new MemoryPreferences();
  preferences.set(LANGUAGE_PREFERENCE_KEY, 'en');
  preferences.set(BINDINGS_PREFERENCE_KEY, encodeBindingOverrides(DEFAULT_BINDINGS));
  const page = new SettingsKeybindings({} as MainWindow, preferences, state, 'en', () => {});
  return { page, preferences, state };
}

describe('Settings keybindings controller', () => {
  it('records an edit in the draft and persists only on Apply', () => {
    const { page, preferences } = setup();
    const row = page
      .model()
      .rows.find((item) => item.mode === 'reader-normal' && item.action === 'scrollDown')!;
    const before = bindingsFromPreferences(preferences);
    page.dispatch({
      type: 'record',
      context: 'reader-normal',
      action: 'scrollDown',
      rowId: row.id,
    });
    page.dispatch({ type: 'record-key', event: { key: 'F8', ctrlKey: true } });
    expect(page.model().recording?.sequence).toBe('<C-F8>');
    page.dispatch({ type: 'finish-recording' });
    expect(page.model().dirty).toBe(true);
    expect(bindingsFromPreferences(preferences)).toEqual(before);
    page.dispatch({ type: 'apply' });
    expect(
      shortcutsForAction(bindingsFromPreferences(preferences), 'reader-normal', 'scrollDown'),
    ).toContain('<C-F8>');
    expect(page.model().dirty).toBe(false);
    expect(page.model().saveOutcome).toBe('saved');
    page.dispose();
  });

  it('preserves a dirty draft across language and external binding updates', () => {
    const { page, preferences, state } = setup();
    page.dispatch({ type: 'unbind', context: 'reader-normal', action: 'scrollDown' });
    expect(page.model().dirty).toBe(true);
    preferences.set(LANGUAGE_PREFERENCE_KEY, 'zh-CN');
    preferences.set(BINDINGS_PREFERENCE_KEY, encodeBindingOverrides(DEFAULT_BINDINGS));
    expect(
      page
        .model()
        .catalog.find((entry) => entry.context === 'reader-normal' && entry.action === 'scrollDown')
        ?.keys,
    ).toEqual([]);
    page.dispose();
    const reopened = new SettingsKeybindings(
      {} as MainWindow,
      preferences,
      state,
      'zh-CN',
      () => {},
    );
    expect(reopened.model().dirty).toBe(true);
    expect(
      reopened
        .model()
        .catalog.find((entry) => entry.context === 'reader-normal' && entry.action === 'scrollDown')
        ?.keys,
    ).toEqual([]);
    reopened.dispose();
  });

  it('reports invalid duplicate recordings and permits reset without persisting', () => {
    const { page, preferences } = setup();
    const rows = page.model().rows.filter((row) => row.mode === 'reader-normal');
    const first = rows.find((row) => row.action === 'scrollDown')!;
    const second = rows.find((row) => row.action !== first.action && row.key.length === 1)!;
    page.dispatch({
      type: 'record',
      context: 'reader-normal',
      action: 'scrollDown',
      rowId: first.id,
    });
    page.dispatch({ type: 'record-key', event: { key: second.key } });
    page.dispatch({ type: 'finish-recording' });
    expect(page.model().errors.length).toBeGreaterThan(0);
    expect(page.model().canApply).toBe(false);
    page.dispatch({ type: 'apply' });
    expect(bindingsFromPreferences(preferences)).toEqual(DEFAULT_BINDINGS);
    page.dispatch({ type: 'reset-action', context: 'reader-normal', action: 'scrollDown' });
    expect(page.model().errors).toEqual([]);
    page.dispose();
  });

  it('cancels recordings, adds and removes a shortcut, and ignores stale row commands', () => {
    const { page } = setup();
    const initial = page.model().rows;
    page.dispatch({ type: 'record', context: 'reader-normal', action: 'scrollDown', rowId: null });
    page.dispatch({ type: 'record-key', event: { key: 'F8', altKey: true } });
    page.dispatch({ type: 'cancel-recording' });
    expect(page.model().rows).toEqual(initial);
    page.dispatch({ type: 'record', context: 'reader-normal', action: 'scrollDown', rowId: null });
    page.dispatch({ type: 'record-key', event: { key: 'F8', altKey: true } });
    page.dispatch({ type: 'finish-recording' });
    const added = page
      .model()
      .rows.find(
        (row) =>
          row.mode === 'reader-normal' && row.action === 'scrollDown' && row.key === '<M-F8>',
      );
    expect(added).toBeDefined();
    page.dispatch({ type: 'delete-row', rowId: added!.id });
    expect(page.model().dirty).toBe(false);
    page.dispatch({
      type: 'record',
      context: 'reader-normal',
      action: 'scrollDown',
      rowId: added!.id,
    });
    expect(page.model().recording).toBeNull();
    page.dispose();
  });

  it('refreshes a clean draft on external changes and exposes native reservations', () => {
    const { page, preferences } = setup();
    const bindings = { ...DEFAULT_BINDINGS, 'reader-normal:<C-F8>': 'scrollDown' as const };
    preferences.set(BINDINGS_PREFERENCE_KEY, encodeBindingOverrides(bindings));
    expect(
      page
        .model()
        .catalog.find((entry) => entry.context === 'reader-normal' && entry.action === 'scrollDown')
        ?.keys,
    ).toContain('<C-F8>');
    expect(page.model().dirty).toBe(false);
    expect(page.model().native.length).toBeGreaterThan(0);
    page.dispose();
  });

  it('exposes failed writes and clamps Prefix Guide values', () => {
    const { page, preferences } = setup();
    page.dispatch({ type: 'guide-number', setting: 'delayMs', value: -50 });
    expect(preferences.get(KEY_GUIDE_DELAY_PREFERENCE_KEY, 1)).toBe(0);
    preferences.fail = true;
    page.dispatch({ type: 'guide-enabled', value: false });
    expect(page.model().guide.error).not.toBe('');
    page.dispatch({ type: 'unbind', context: 'reader-normal', action: 'scrollDown' });
    page.dispatch({ type: 'apply' });
    expect(page.model().saveOutcome).toBe('save-failed');
    expect(page.model().dirty).toBe(true);
    page.dispose();
  });
});
