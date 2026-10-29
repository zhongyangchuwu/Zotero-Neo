import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { BuiltinModuleRuntime, modulePreferenceKey } from '../../src/core/module-runtime';
import type { PreferenceStore } from '../../src/core/preference-store';
import { BUILTIN_MODULES, type BuiltinModuleId } from '../../src/modules';
import { SettingsModules } from '../../src/main/settings-modules';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<() => void>>();
  readonly style = { cssText: '' };
  textContent = '';
  type = '';
  checked = false;
  disabled = false;
  tabIndex = 0;

  constructor(readonly tag: string) {}

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
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

  all(): FakeElement[] {
    return [this, ...this.children.flatMap((child) => child.all())];
  }

  text(): string {
    return [this.textContent, ...this.children.map((child) => child.text())].join(' ');
  }
}

class FakeDocument {
  createElementNS(_namespace: string, tag: string): Element {
    return new FakeElement(tag) as unknown as Element;
  }
}

class Preferences implements PreferenceStore {
  readonly values = new Map<string, boolean | number | string>();
  readonly observers = new Map<string, Set<() => void>>();
  readonly writes: Array<[string, boolean | number | string]> = [];
  readonly clears: string[] = [];
  failObserveKey: string | null = null;
  failCleanupKey: string | null = null;

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
    this.values.set(key, value);
    this.writes.push([key, value]);
    this.#notify(key);
  }

  clear(key: string): void {
    this.values.delete(key);
    this.clears.push(key);
    this.#notify(key);
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

  #notify(key: string): void {
    for (const listener of this.observers.get(key) ?? []) listener();
  }
}

function createWindow(): MainWindow {
  return { document: new FakeDocument() } as unknown as MainWindow;
}

function createRuntime(preferences: Preferences): BuiltinModuleRuntime {
  return new BuiltinModuleRuntime(preferences, { debug: () => {}, diagnostic: () => {} });
}

function mount(
  initial: Record<string, boolean | number | string> = {},
  language: 'en' | 'zh-CN' = 'en',
) {
  const window = createWindow();
  const root = new FakeElement('section');
  const preferences = new Preferences(initial);
  const modules = createRuntime(preferences);
  const page = new SettingsModules(
    window,
    root as unknown as HTMLElement,
    preferences,
    modules,
    language,
  );
  return { window, root, preferences, modules, page };
}

function moduleRow(root: FakeElement, id: BuiltinModuleId): FakeElement {
  const row = root.all().find((element) => element.getAttribute('data-module-id') === id);
  if (!row) throw new Error(`Missing module row: ${id}`);
  return row;
}

function requestCheckbox(root: FakeElement, id: BuiltinModuleId): FakeElement {
  const checkbox = moduleRow(root, id)
    .all()
    .find((element) => element.getAttribute('data-module-request') === id);
  if (!checkbox) throw new Error(`Missing request checkbox: ${id}`);
  return checkbox;
}

function moduleSummary(root: FakeElement, id: BuiltinModuleId): string {
  return (
    moduleRow(root, id).children.filter((element) => element.tag === 'p')[1]?.textContent ?? ''
  );
}

describe('Settings Modules page', () => {
  it('renders all twelve localized module rows with applied and requested state distinct', () => {
    const test = mount();
    const rows = test.root.all().filter((element) => element.tag === 'article');

    expect(rows).toHaveLength(12);
    expect(rows.map((row) => row.getAttribute('data-module-id'))).toEqual(
      BUILTIN_MODULES.map(({ id }) => id),
    );
    expect(requestCheckbox(test.root, 'library').checked).toBe(true);
    expect(moduleSummary(test.root, 'library')).toContain('Applied: On');
    expect(moduleSummary(test.root, 'library')).toContain('Requested: On');
    expect(moduleSummary(test.root, 'library')).toContain('Draft request: On');
    expect(test.preferences.writes).toEqual([]);
    const chinese = mount({}, 'zh-CN');
    expect(moduleRow(chinese.root, 'reader-navigation').children[0]?.textContent).toBe('阅读导航');
    expect(moduleRow(chinese.root, 'reader-navigation').children[1]?.textContent).toContain(
      '阅读器会话',
    );
    chinese.page.dispose();

    test.page.dispose();
  });

  it('retains multiple drafts through synchronous preference observers during save', () => {
    const test = mount();
    for (const id of ['library', 'tags'] as const) {
      const checkbox = requestCheckbox(test.root, id);
      checkbox.checked = false;
      checkbox.emit('change');
    }

    test.root
      .all()
      .find(
        (element) => element.tag === 'button' && element.textContent === 'Save module requests',
      )!
      .click();

    expect(test.preferences.writes).toEqual([
      [modulePreferenceKey('library'), false],
      [modulePreferenceKey('tags'), false],
    ]);
    expect(test.modules.requested().library).toBe(false);
    expect(test.modules.requested().tags).toBe(false);
    expect(moduleSummary(test.root, 'library')).toContain('Requested: Off');
    expect(moduleSummary(test.root, 'tags')).toContain('Requested: Off');
    expect(
      test.root
        .all()
        .find(
          (element) => element.tag === 'button' && element.textContent === 'Save module requests',
        )?.disabled,
    ).toBe(true);
    test.page.dispose();
  });

  it('previews blocked draft requests and saves only the chosen request without toggling dependencies', () => {
    const test = mount({
      [modulePreferenceKey('capture')]: false,
      [modulePreferenceKey('notes')]: false,
    });
    const capture = requestCheckbox(test.root, 'capture');
    capture.checked = true;
    capture.emit('change');

    expect(test.root.text()).toContain('Capture');
    expect(test.root.text()).toContain('Missing required dependencies: Notes');
    expect(test.preferences.writes).toEqual([]);

    test.root
      .all()
      .find(
        (element) => element.tag === 'button' && element.textContent === 'Save module requests',
      )!
      .click();

    expect(test.preferences.writes).toEqual([[modulePreferenceKey('capture'), true]]);
    expect(test.preferences.get(modulePreferenceKey('notes'), true)).toBe(false);
    expect(test.modules.applied.capture).toBe(false);
    expect(test.modules.applied.notes).toBe(false);
    expect(test.modules.blocked('capture', test.modules.requested())).toContain('notes');
    expect(moduleSummary(test.root, 'capture')).toContain('Applied: Off');
    expect(moduleSummary(test.root, 'capture')).toContain('Requested: On');
    expect(moduleSummary(test.root, 'capture')).toContain('Pending restart');
    expect(
      test.root.all().find((element) => element.getAttribute('role') === 'status')?.textContent,
    ).toBe('');

    test.page.dispose();
  });

  it('reports applied dependency blocks without changing saved module requests', () => {
    const test = mount({ [modulePreferenceKey('notes')]: false });
    const scope = test.modules.createScope('main', test.window, () => true);

    expect(moduleSummary(test.root, 'capture')).toContain('Runtime status: Blocked');
    expect(moduleRow(test.root, 'capture').text()).toContain('Requires: Notes');
    expect(test.preferences.writes).toEqual([]);

    test.page.dispose();
    scope.dispose();
  });

  it('isolates scoped failures and releases preference and runtime observers on disposal', () => {
    const preferences = new Preferences();
    const modules = createRuntime(preferences);
    const cleanupRuntimeObserver = vi.fn();
    const subscribe = modules.subscribe.bind(modules);
    vi.spyOn(modules, 'subscribe').mockImplementation((listener) => {
      const cleanup = subscribe(listener);
      return () => {
        cleanup();
        cleanupRuntimeObserver();
      };
    });

    const ownerA = createWindow();
    const rootA = new FakeElement('section');
    const pageA = new SettingsModules(
      ownerA,
      rootA as unknown as HTMLElement,
      preferences,
      modules,
      'en',
    );
    const scopeA = modules.createScope('main', ownerA, () => true);
    scopeA.activate('library', () => ({}));
    expect(moduleRow(rootA, 'library').text()).toContain('Runtime status: Enabled');
    scopeA.activate('extensions', () => {
      throw new Error('Only window A failed');
    });

    const ownerB = createWindow();
    const rootB = new FakeElement('section');
    const pageB = new SettingsModules(
      ownerB,
      rootB as unknown as HTMLElement,
      preferences,
      modules,
      'en',
    );

    expect(moduleRow(rootA, 'extensions').text()).toContain('Only window A failed');
    expect(moduleRow(rootB, 'extensions').text()).not.toContain('Only window A failed');
    expect(moduleRow(rootB, 'extensions').text()).toContain('Pending host');
    expect(preferences.listenerCount()).toBe(24);

    preferences.failCleanupKey = modulePreferenceKey('library');
    expect(() => pageA.dispose()).not.toThrow();
    expect(() => pageB.dispose()).not.toThrow();
    expect(preferences.listenerCount()).toBe(0);
    expect(cleanupRuntimeObserver).toHaveBeenCalledTimes(2);
    expect(rootA.children).toEqual([]);
    expect(rootB.children).toEqual([]);
    scopeA.dispose();
  });

  it('cleans earlier subscriptions and rendered DOM when observer setup fails partway', () => {
    const preferences = new Preferences();
    preferences.failObserveKey = modulePreferenceKey('tags');
    const modules = createRuntime(preferences);
    const window = createWindow();
    const root = new FakeElement('section');

    expect(
      () => new SettingsModules(window, root as unknown as HTMLElement, preferences, modules, 'en'),
    ).toThrow('Preference observer failed');
    expect(preferences.listenerCount()).toBe(0);
    expect(root.children).toEqual([]);
  });

  it('restores defaults by clearing only module requests and leaves applied flags and other settings alone', () => {
    const test = mount({
      [modulePreferenceKey('notes')]: false,
      bindings: 'custom-bindings',
      'theme.id': 'custom-theme',
    });
    test.root
      .all()
      .find(
        (element) =>
          element.tag === 'button' && element.textContent === 'Restore default module requests',
      )!
      .click();

    expect(test.preferences.clears).toEqual(
      BUILTIN_MODULES.map(({ id }) => modulePreferenceKey(id)),
    );
    expect(test.preferences.get('bindings', '')).toBe('custom-bindings');
    expect(test.preferences.get('theme.id', '')).toBe('custom-theme');
    expect(test.modules.applied.notes).toBe(false);
    expect(test.modules.requested().notes).toBe(true);
    expect(requestCheckbox(test.root, 'notes').checked).toBe(true);

    test.page.dispose();
  });
});
