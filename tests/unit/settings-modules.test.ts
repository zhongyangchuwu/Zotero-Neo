import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { BuiltinModuleRuntime, modulePreferenceKey } from '../../src/core/module-runtime';
import type { PreferenceStore } from '../../src/core/preference-store';
import { OPTIONAL_MODULES, type OptionalModuleId } from '../../src/modules';
import { TAB_ENHANCEMENT_PREFERENCES as tabs, TAB_GROUP_STATE_PREFERENCE } from '../../src/modules/tab-enhancements/config';
import { SettingsModules } from '../../src/main/settings-modules';

class Preferences implements PreferenceStore {
  readonly values = new Map<string, boolean | number | string>();
  readonly observers = new Map<string, Set<() => void>>();
  readonly writes: Array<[string, boolean | number | string]> = [];
  readonly clears: string[] = [];
  failObserveKey: string | null = null;
  failCleanupKey: string | null = null;
  failSetKey: string | null = null;
  failClearKey: string | null = null;

  constructor(initial: Record<string, boolean | number | string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }
  has(key: string): boolean { return this.values.has(key); }
  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string {
    return this.values.get(key) ?? fallback;
  }
  set(key: string, value: boolean | number | string): void {
    if (key === this.failSetKey) throw new Error('Preference write failed');
    this.values.set(key, value);
    this.writes.push([key, value]);
    for (const listener of this.observers.get(key) ?? []) listener();
  }
  clear(key: string): void {
    if (key === this.failClearKey) throw new Error('Preference clear failed');
    this.values.delete(key);
    this.clears.push(key);
    for (const listener of this.observers.get(key) ?? []) listener();
  }
  observe(key: string, listener: () => void): () => void {
    if (key === this.failObserveKey) throw new Error('Preference observer failed');
    const group = this.observers.get(key) ?? new Set();
    group.add(listener);
    this.observers.set(key, group);
    return () => {
      group.delete(listener);
      if (key === this.failCleanupKey) throw new Error('Observer cleanup failed');
    };
  }
  listenerCount(): number {
    return [...this.observers.values()].reduce((count, group) => count + group.size, 0);
  }
}

function mount(initial: Record<string, boolean | number | string> = {}, owner = {} as MainWindow) {
  const preferences = new Preferences(initial);
  const modules = new BuiltinModuleRuntime(preferences, { debug: () => {}, diagnostic: () => {} });
  const changed = vi.fn();
  const page = new SettingsModules(owner, preferences, modules, 'en', changed);
  return { owner, preferences, modules, changed, page };
}
function field(page: SettingsModules, id: string) {
  const result = page.model().groups.flatMap((group) => group.fields).find((entry) => entry.id === id);
  if (!result) throw new Error(`Missing field ${id}`);
  return result;
}
function request(page: SettingsModules, id: OptionalModuleId, value: boolean): void {
  page.dispatch({ type: 'value', id: `modules.request.${id}`, value });
}

describe('headless module settings', () => {
  it('retains independent drafts and reports requested versus startup-applied state', () => {
    const test = mount({ 'modules.library.enabled': false, 'noteEditor.enabled': false });
    request(test.page, 'reader-hints', false);
    request(test.page, 'extensions', false);
    test.page.dispatch({ type: 'action', id: 'modules.save' });
    expect(test.preferences.writes).toEqual([
      [modulePreferenceKey('reader-hints'), false], [modulePreferenceKey('extensions'), false],
    ]);
    expect(field(test.page, 'modules.request.reader-hints').note).toContain('Applied: On');
    expect(field(test.page, 'modules.request.reader-hints').note).toContain('Requested: Off');
    expect(field(test.page, 'modules.request.reader-hints').note).toContain('Pending restart');
    expect(field(test.page, 'modules.save').disabled).toBe(true);
    expect(test.preferences.values.get('modules.library.enabled')).toBe(false);
    expect(test.preferences.values.get('noteEditor.enabled')).toBe(false);
    test.page.dispose();
  });

  it('preserves dirty drafts across external preference notifications and partial saves', () => {
    const test = mount();
    request(test.page, 'reader-hints', false);
    request(test.page, 'extensions', false);
    test.preferences.set(modulePreferenceKey('references'), false);
    expect(field(test.page, 'modules.request.reader-hints')).toMatchObject({ value: false });
    expect(field(test.page, 'modules.request.references')).toMatchObject({ value: false });
    test.preferences.failSetKey = modulePreferenceKey('extensions');
    test.page.dispatch({ type: 'action', id: 'modules.save' });
    expect(test.modules.requested()['reader-hints']).toBe(false);
    expect(test.modules.requested().extensions).toBe(true);
    expect(field(test.page, 'modules.request.extensions')).toMatchObject({ value: false });
    expect(field(test.page, 'modules.save').disabled).toBe(false);
    expect(test.page.model().status?.error).toBe(true);
    test.page.dispose();
  });

  it('reports partial default restoration without changing core or applied state', () => {
    const test = mount({ [modulePreferenceKey('reader-hints')]: false, [modulePreferenceKey('extensions')]: false, 'modules.library.enabled': false });
    test.preferences.failClearKey = modulePreferenceKey('extensions');
    test.page.dispatch({ type: 'action', id: 'modules.restore' });
    expect(test.modules.applied['reader-hints']).toBe(false);
    expect(test.modules.requested()['reader-hints']).toBe(true);
    expect(test.modules.requested().extensions).toBe(false);
    expect(field(test.page, 'modules.request.extensions')).toMatchObject({ value: true });
    expect(test.page.model().status?.error).toBe(true);
    expect(test.preferences.values.get('modules.library.enabled')).toBe(false);
    test.preferences.failClearKey = null;
    test.page.dispatch({ type: 'action', id: 'modules.restore' });
    expect(OPTIONAL_MODULES.every(({ id }) => !test.preferences.has(modulePreferenceKey(id)))).toBe(true);
    test.page.dispose();
  });

  it('isolates scoped runtime failures and releases all observers', () => {
    const test = mount();
    const other = {} as MainWindow;
    const pageB = new SettingsModules(other, test.preferences, test.modules, 'en', vi.fn());
    const scope = test.modules.createScope('main', test.owner, () => true);
    scope.activate('extensions', () => { throw new Error('Only window A failed'); });
    expect(field(test.page, 'modules.request.extensions').note).toContain('Only window A failed');
    expect(field(pageB, 'modules.request.extensions').note).not.toContain('Only window A failed');
    expect(field(pageB, 'modules.request.extensions').note).toContain('Pending host');
    test.preferences.failCleanupKey = modulePreferenceKey('reader-hints');
    test.page.dispose(); pageB.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
    scope.dispose();
  });

  it('cleans up earlier subscriptions if construction fails', () => {
    const preferences = new Preferences();
    preferences.failObserveKey = modulePreferenceKey('extensions');
    const modules = new BuiltinModuleRuntime(preferences, { debug: () => {}, diagnostic: () => {} });
    expect(() => new SettingsModules({} as MainWindow, preferences, modules, 'en', vi.fn())).toThrow('Preference observer failed');
    expect(preferences.listenerCount()).toBe(0);
  });

  it('validates commands, edits live tab options and leaves saved groups on reset', () => {
    const test = mount({ [TAB_GROUP_STATE_PREFERENCE]: 'saved' });
    test.page.dispatch({ type: 'value', id: 'modules.request.library', value: false });
    test.page.dispatch({ type: 'value', id: 'tabs.side', value: 'middle' });
    test.page.dispatch({ type: 'value', id: 'tabs.width', value: Infinity });
    expect(test.preferences.writes).toEqual([]);
    test.page.dispatch({ type: 'value', id: 'tabs.side', value: 'right' });
    test.page.dispatch({ type: 'value', id: 'tabs.width', value: 999 });
    expect(test.preferences.values.get(tabs.width)).toBe(520);
    test.page.dispatch({ type: 'value', id: 'tabs.collapsed', value: true });
    expect(field(test.page, 'tabs.width').disabled).toBe(true);
    test.page.dispatch({ type: 'value', id: 'tabs.width', value: 200 });
    expect(test.preferences.values.get(tabs.width)).toBe(520);
    test.page.dispatch({ type: 'value', id: 'tabs.titleFormat', value: '{unknown}' });
    expect(field(test.page, 'tabs.titleFormat')).toMatchObject({ invalid: true, value: '{unknown}' });
    expect(test.preferences.has(tabs.titleFormat)).toBe(false);
    test.page.dispatch({ type: 'value', id: 'tabs.titleFormat', value: '{author}' });
    expect(test.preferences.values.get(tabs.titleFormat)).toBe('{author}');
    test.page.dispatch({ type: 'action', id: 'tabs.restore' });
    expect(test.preferences.values.get(TAB_GROUP_STATE_PREFERENCE)).toBe('saved');
    expect(field(test.page, 'tabs.width')).toMatchObject({ value: 260, disabled: false });
    test.page.dispose();
  });

  it('reflects external tab changes and reports partial reset failures', () => {
    const test = mount({ [tabs.side]: 'right', [tabs.width]: 300 });
    test.preferences.set(tabs.width, 320);
    expect(field(test.page, 'tabs.width')).toMatchObject({ value: 320 });
    expect(test.changed).toHaveBeenCalled();
    test.preferences.failClearKey = tabs.width;
    test.page.dispatch({ type: 'action', id: 'tabs.restore' });
    expect(field(test.page, 'tabs.side')).toMatchObject({ value: 'left' });
    expect(field(test.page, 'tabs.width')).toMatchObject({ value: 320 });
    expect(test.page.model().status?.error).toBe(true);
    test.page.dispose();
  });
});
