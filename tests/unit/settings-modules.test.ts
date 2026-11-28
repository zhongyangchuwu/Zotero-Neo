// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { BuiltinModuleRuntime, modulePreferenceKey } from '../../src/core/module-runtime';
import type { PreferenceStore } from '../../src/core/preference-store';
import { OPTIONAL_MODULES, type OptionalModuleId } from '../../src/modules';
import { SettingsModules } from '../../src/main/settings-modules';
import { mountSettingsReactView } from '../../src/ui/react/surfaces/settings';
import type { SettingsReactModel } from '../../src/main/settings-react-model';

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
  const groups = page.model().groups;
  const result = groups.flatMap((group) => group.fields).find((entry) => entry.id === id);
  if (!result) throw new Error(`Missing field ${id}`);
  return result;
}
function request(page: SettingsModules, id: OptionalModuleId, value: boolean): void {
  page.dispatch({ type: 'value', id: `modules.request.${id}`, value });
}

describe('headless module settings', () => {
  it('saves each request immediately and shows restart notice until all requests match startup', () => {
    const test = mount({ 'modules.library.enabled': false });
    expect(test.page.model().notice).toBeUndefined();
    request(test.page, 'reader-hints', false);
    expect(test.preferences.values.get(modulePreferenceKey('reader-hints'))).toBe(false);
    expect(field(test.page, 'modules.request.reader-hints')).toMatchObject({ value: false });
    expect(test.page.model().notice).toBe('Some changes will take effect after restarting Zotero.');
    request(test.page, 'extensions', false);
    expect(test.preferences.writes).toEqual([
      [modulePreferenceKey('reader-hints'), false],
      [modulePreferenceKey('extensions'), false],
    ]);
    expect(test.modules.inspect(test.owner).find(({ id }) => id === 'reader-hints')).toMatchObject({
      applied: true,
      requested: false,
      pendingRestart: true,
    });
    request(test.page, 'reader-hints', true);
    expect(test.page.model().notice).toBe('Some changes will take effect after restarting Zotero.');
    test.page.dispose();
    const reopened = new SettingsModules(test.owner, test.preferences, test.modules, 'en', vi.fn());
    expect(reopened.model().notice).toBe('Some changes will take effect after restarting Zotero.');
    request(reopened, 'extensions', true);
    expect(reopened.model().notice).toBeUndefined();
    expect(test.preferences.values.get('modules.library.enabled')).toBe(false);
    reopened.dispose();
  });

  it('reads external changes and restores the saved value after a write fails', () => {
    const test = mount();
    test.preferences.set(modulePreferenceKey('references'), false);
    expect(field(test.page, 'modules.request.references')).toMatchObject({ value: false });
    test.preferences.failSetKey = modulePreferenceKey('extensions');
    request(test.page, 'extensions', false);
    expect(test.modules.requested().extensions).toBe(true);
    expect(field(test.page, 'modules.request.extensions')).toMatchObject({ value: true });
    expect(test.page.model().status?.error).toBe(true);
    expect(test.page.model().status?.text).not.toContain('Preference write failed');
    test.page.dispose();
  });

  it('renders only the three supported optional switches without an extras fold', () => {
    const test = mount();
    const root = document.createElement('div');
    const model: SettingsReactModel = {
      generation: 1,
      language: 'en',
      title: 'Settings',
      closeLabel: 'Close',
      navigationLabel: 'Settings',
      helpLabel: 'Help',
      section: 'Modules',
      sections: [{ id: 'Modules', label: 'Modules' }],
      page: { kind: 'form', model: test.page.model() },
    };
    const view = mountSettingsReactView(root, model, vi.fn());
    expect(root.querySelector('details')).toBeNull();
    const fields = test.page.model().groups.flatMap(({ fields }) => fields);
    expect(fields.map(({ id }) => id).sort()).toEqual([
      'modules.request.extensions',
      'modules.request.reader-hints',
      'modules.request.references',
      'modules.restore',
    ]);
    request(test.page, 'references', false);
    view.update({ ...model, page: { kind: 'form', model: test.page.model() } });
    expect(root.querySelector('.neo-settings-form > [role="status"]')?.textContent).toBe(
      'Some changes will take effect after restarting Zotero.',
    );
    view.dispose();
    test.page.dispose();
  });

  it('reports partial default restoration without changing core or applied state', () => {
    const test = mount({
      [modulePreferenceKey('reader-hints')]: false,
      [modulePreferenceKey('extensions')]: false,
      'modules.library.enabled': false,
      'modules.item-attributes.enabled': true,
    });
    test.preferences.failClearKey = modulePreferenceKey('extensions');
    test.page.dispatch({ type: 'action', id: 'modules.restore' });
    expect(test.modules.applied['reader-hints']).toBe(false);
    expect(test.modules.requested()['reader-hints']).toBe(true);
    expect(test.modules.requested().extensions).toBe(false);
    expect(field(test.page, 'modules.request.extensions')).toMatchObject({ value: false });
    expect(test.page.model().status?.error).toBe(true);
    expect(test.preferences.clears).not.toContain('modules.item-attributes.enabled');
    expect(test.preferences.values.get('modules.item-attributes.enabled')).toBe(true);
    expect(test.preferences.values.get('modules.library.enabled')).toBe(false);
    test.preferences.failClearKey = null;
    test.page.dispatch({ type: 'action', id: 'modules.restore' });
    expect(OPTIONAL_MODULES.every(({ id }) => !test.preferences.has(modulePreferenceKey(id)))).toBe(
      true,
    );
    test.page.dispose();
  });

  it('isolates scoped runtime failures and releases all observers', () => {
    const test = mount();
    const other = {} as MainWindow;
    const pageB = new SettingsModules(other, test.preferences, test.modules, 'en', vi.fn());
    const scope = test.modules.createScope('main', test.owner, () => true);
    scope.activate('extensions', () => {
      throw new Error('Only window A failed');
    });
    expect(field(test.page, 'modules.request.extensions').note).toBe(
      'This feature could not start in this window.',
    );
    expect(field(pageB, 'modules.request.extensions').note).toBeUndefined();
    expect(JSON.stringify(test.page.model())).not.toContain('Only window A failed');
    expect(test.modules.inspect(other).find(({ id }) => id === 'extensions')?.status).toBe(
      'pending',
    );
    test.preferences.failCleanupKey = modulePreferenceKey('reader-hints');
    test.page.dispose();
    pageB.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
    scope.dispose();
  });

  it('cleans up earlier subscriptions if construction fails', () => {
    const preferences = new Preferences();
    preferences.failObserveKey = modulePreferenceKey('extensions');
    const modules = new BuiltinModuleRuntime(preferences, {
      debug: () => {},
      diagnostic: () => {},
    });
    expect(
      () => new SettingsModules({} as MainWindow, preferences, modules, 'en', vi.fn()),
    ).toThrow('Preference observer failed');
    expect(preferences.listenerCount()).toBe(0);
  });

  it('ignores retired prefs and commands without writing or clearing their stored values', () => {
    const legacy = {
      'modules.tab-enhancements.enabled': true,
      'tabEnhancements.side': 'right',
      'tabEnhancements.groups.v2': 'saved',
      'modules.translation.enabled': true,
      'extras.translation.enabled': true,
      'modules.ai-qa.enabled': true,
      'modules.reader-ai.enabled': true,
      'ai.configuration': '{"model":"user-selected"}',
    };
    const test = mount(legacy);
    test.page.dispatch({ type: 'value', id: 'modules.request.library', value: false });
    test.page.dispatch({ type: 'value', id: 'modules.request.references', value: 'invalid' });
    test.page.dispatch({ type: 'value', id: 'modules.request.tab-enhancements', value: false });
    test.page.dispatch({ type: 'value', id: 'modules.request.ai-qa', value: false });
    test.page.dispatch({ type: 'value', id: 'modules.request.translation', value: false });
    test.page.dispatch({ type: 'action', id: 'tabs.restore' });
    expect(test.preferences.writes).toEqual([]);
    expect(JSON.stringify(test.page.model())).not.toMatch(/tab-enhancements|ai-qa|translation/u);
    test.page.dispatch({ type: 'action', id: 'modules.restore' });
    for (const [key, value] of Object.entries(legacy)) {
      expect(test.preferences.values.get(key)).toBe(value);
      expect(test.preferences.clears).not.toContain(key);
    }
    expect(test.preferences.writes).toEqual([]);
    test.page.dispose();
  });
});
