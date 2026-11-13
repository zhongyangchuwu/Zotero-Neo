import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { BuiltinModuleRuntime, modulePreferenceKey } from '../../src/core/module-runtime';
import type { PreferenceStore } from '../../src/core/preference-store';
import type { OptionalModuleId } from '../../src/modules';
import { SettingsModules } from '../../src/main/settings-modules';
import {
  prepareTranslationDependency,
  readTranslationDependency,
  type TranslationDependencySnapshot,
} from '../../src/modules/translation/setup';

vi.mock('../../src/modules/translation/setup', () => ({
  prepareTranslationDependency: vi.fn(),
  readTranslationDependency: vi.fn(),
}));

const MISSING_TRANSLATION: TranslationDependencySnapshot = {
  installed: false,
  version: null,
  enabled: false,
  pendingRestart: false,
  saveSupported: false,
  runtimeReady: false,
};
const READY_TRANSLATION: TranslationDependencySnapshot = {
  installed: true,
  version: '2.4.8',
  enabled: true,
  pendingRestart: false,
  saveSupported: true,
  runtimeReady: true,
};
beforeEach(() => {
  vi.mocked(readTranslationDependency).mockReset().mockResolvedValue(MISSING_TRANSLATION);
  vi.mocked(prepareTranslationDependency).mockReset().mockResolvedValue(READY_TRANSLATION);
});

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
  readonly reads: string[] = [];
  readonly observers = new Map<string, Set<() => void>>();
  readonly writes: Array<[string, boolean | number | string]> = [];
  readonly clears: string[] = [];
  failObserveKey: string | null = null;
  failCleanupKey: string | null = null;
  failSetKey: string | null = null;

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
    this.reads.push(key);
    return this.values.get(key) ?? fallback;
  }

  set(key: string, value: boolean | number | string): void {
    if (key === this.failSetKey) throw new Error('Preference write failed');
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

function moduleRow(root: FakeElement, id: OptionalModuleId): FakeElement {
  const row = root.all().find((element) => element.getAttribute('data-module-id') === id);
  if (!row) throw new Error(`Missing module row: ${id}`);
  return row;
}

function requestCheckbox(root: FakeElement, id: OptionalModuleId): FakeElement {
  const checkbox = moduleRow(root, id)
    .all()
    .find((element) => element.getAttribute('data-module-request') === id);
  if (!checkbox) throw new Error(`Missing request checkbox: ${id}`);
  return checkbox;
}

function moduleSummary(root: FakeElement, id: OptionalModuleId): string {
  return (
    moduleRow(root, id).children.filter((element) => element.tag === 'p')[1]?.textContent ?? ''
  );
}

describe('Settings Modules page', () => {
  it('retains optional drafts through synchronous observers without touching core preferences', () => {
    const test = mount({
      'modules.library.enabled': false,
      'modules.notes.enabled': false,
      'modules.workspace.enabled': false,
      'noteEditor.enabled': false,
      bindings: 'custom-bindings',
    });
    for (const id of ['reader-hints', 'extensions'] as const) {
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
      [modulePreferenceKey('reader-hints'), false],
      [modulePreferenceKey('extensions'), false],
    ]);
    expect(test.modules.requested()['reader-hints']).toBe(false);
    expect(test.modules.requested().extensions).toBe(false);
    expect(moduleSummary(test.root, 'reader-hints')).toContain('Applied: On');
    expect(moduleSummary(test.root, 'reader-hints')).toContain('Requested: Off');
    expect(moduleSummary(test.root, 'reader-hints')).toContain('Pending restart');
    expect(moduleSummary(test.root, 'extensions')).toContain('Requested: Off');
    expect(test.preferences.values.get('modules.library.enabled')).toBe(false);
    expect(test.preferences.values.get('modules.notes.enabled')).toBe(false);
    expect(test.preferences.values.get('modules.workspace.enabled')).toBe(false);
    expect(test.preferences.values.get('noteEditor.enabled')).toBe(false);
    expect(test.preferences.values.get('bindings')).toBe('custom-bindings');
    expect(test.preferences.reads).not.toContain('modules.library.enabled');
    expect(test.preferences.reads).not.toContain('modules.notes.enabled');
    expect(test.preferences.reads).not.toContain('modules.workspace.enabled');
    expect(test.preferences.reads).not.toContain('noteEditor.enabled');
    expect(test.preferences.observers.has('modules.library.enabled')).toBe(false);
    expect(test.preferences.observers.has('noteEditor.enabled')).toBe(false);
    expect(test.preferences.observers.has('modules.notes.enabled')).toBe(false);
    expect(test.preferences.observers.has('modules.workspace.enabled')).toBe(false);
    expect(
      test.root
        .all()
        .find(
          (element) => element.tag === 'button' && element.textContent === 'Save module requests',
        )?.disabled,
    ).toBe(true);
    test.page.dispose();
  });

  it('keeps failed optional drafts visible when only earlier preference writes succeeded', () => {
    const test = mount();
    for (const id of ['reader-hints', 'extensions'] as const) {
      const checkbox = requestCheckbox(test.root, id);
      checkbox.checked = false;
      checkbox.emit('change');
    }
    test.preferences.failSetKey = modulePreferenceKey('extensions');

    test.root
      .all()
      .find(
        (element) => element.tag === 'button' && element.textContent === 'Save module requests',
      )!
      .click();

    expect(test.preferences.writes).toEqual([[modulePreferenceKey('reader-hints'), false]]);
    expect(test.modules.requested()['reader-hints']).toBe(false);
    expect(test.modules.requested().extensions).toBe(true);
    expect(requestCheckbox(test.root, 'reader-hints').checked).toBe(false);
    expect(requestCheckbox(test.root, 'extensions').checked).toBe(false);
    expect(
      test.root.all().find((element) => element.getAttribute('role') === 'status')?.textContent,
    ).not.toBe('');
    expect(
      test.root
        .all()
        .find(
          (element) => element.tag === 'button' && element.textContent === 'Save module requests',
        )?.disabled,
    ).toBe(false);
    test.page.dispose();
  });

  it('isolates optional scoped failures and releases observers on disposal', () => {
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
    const mainScopeA = modules.createScope('main', ownerA, () => true);
    mainScopeA.activate('extensions', () => {
      throw new Error('Only window A failed');
    });
    const readerScopeA = modules.createScope(
      'reader',
      ownerA,
      () => true,
      () => ownerA,
    );
    readerScopeA.activate('reader-hints', () => ({}));
    expect(moduleRow(rootA, 'reader-hints').text()).toContain('Runtime status: Enabled');

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
    expect(moduleRow(rootB, 'reader-hints').text()).toContain('Pending host');

    preferences.failCleanupKey = modulePreferenceKey('reader-hints');
    expect(() => pageA.dispose()).not.toThrow();
    expect(() => pageB.dispose()).not.toThrow();
    expect(preferences.listenerCount()).toBe(0);
    expect(cleanupRuntimeObserver).toHaveBeenCalledTimes(2);
    expect(rootA.children).toEqual([]);
    expect(rootB.children).toEqual([]);
    mainScopeA.dispose();
    readerScopeA.dispose();
  });

  it('cleans earlier subscriptions and rendered DOM when optional observer setup fails', () => {
    const preferences = new Preferences();
    preferences.failObserveKey = modulePreferenceKey('extensions');
    const modules = createRuntime(preferences);
    const window = createWindow();
    const root = new FakeElement('section');

    expect(
      () => new SettingsModules(window, root as unknown as HTMLElement, preferences, modules, 'en'),
    ).toThrow('Preference observer failed');
    expect(preferences.listenerCount()).toBe(0);
    expect(root.children).toEqual([]);
  });

  it('restores defaults only for optional requests and leaves core preferences unchanged', () => {
    const test = mount({
      [modulePreferenceKey('reader-hints')]: false,
      [modulePreferenceKey('extensions')]: false,
      [modulePreferenceKey('translation')]: true,
      'modules.library.enabled': false,
      'modules.notes.enabled': false,
      'modules.workspace.enabled': false,
      'noteEditor.enabled': false,
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

    expect(test.preferences.get('modules.library.enabled', true)).toBe(false);
    expect(test.preferences.get('modules.notes.enabled', true)).toBe(false);
    expect(test.preferences.get('modules.workspace.enabled', true)).toBe(false);
    expect(test.preferences.get('noteEditor.enabled', true)).toBe(false);
    expect(test.preferences.get('bindings', '')).toBe('custom-bindings');
    expect(test.preferences.get('theme.id', '')).toBe('custom-theme');
    expect(test.modules.applied['reader-hints']).toBe(false);
    expect(test.modules.requested()['reader-hints']).toBe(true);
    expect(test.modules.requested().extensions).toBe(true);
    expect(test.modules.applied.translation).toBe(true);
    expect(test.modules.requested().translation).toBe(false);
    expect(test.preferences.has(modulePreferenceKey('translation'))).toBe(true);
    expect(requestCheckbox(test.root, 'reader-hints').checked).toBe(true);
    expect(requestCheckbox(test.root, 'extensions').checked).toBe(true);

    test.page.dispose();
  });
});

function saveRequests(root: FakeElement): void {
  root
    .all()
    .find((element) => element.getAttribute('aria-label') === 'Save module requests')!
    .click();
}

describe('translation dependency admission in module settings', () => {
  it('prepares before persisting an enable request even with Plugin Manager disabled', async () => {
    const pending = Promise.withResolvers<TranslationDependencySnapshot | null>();
    vi.mocked(prepareTranslationDependency).mockReturnValue(pending.promise);
    const test = mount({ [modulePreferenceKey('extensions')]: false });
    const checkbox = requestCheckbox(test.root, 'translation');
    checkbox.checked = true;
    checkbox.emit('change');
    saveRequests(test.root);
    expect(test.modules.requested().translation).toBe(false);
    expect(checkbox.disabled).toBe(true);
    pending.resolve(READY_TRANSLATION);
    await vi.waitFor(() => expect(test.modules.requested().translation).toBe(true));
    expect(test.modules.applied.translation).toBe(false);
    expect(test.modules.requested().extensions).toBe(false);
    expect(moduleSummary(test.root, 'translation')).toContain('Pending restart');
    expect(checkbox.disabled).toBe(false);
    test.page.dispose();
  });

  it.each(['cancelled', 'failed'] as const)(
    'does not persist an enable request after %s preparation',
    async (outcome) => {
      if (outcome === 'cancelled') vi.mocked(prepareTranslationDependency).mockResolvedValue(null);
      else
        vi.mocked(prepareTranslationDependency).mockRejectedValue(
          new Error('Native download unavailable'),
        );
      const test = mount();
      const checkbox = requestCheckbox(test.root, 'translation');
      checkbox.checked = true;
      checkbox.emit('change');
      saveRequests(test.root);
      await vi.waitFor(() => expect(checkbox.disabled).toBe(false));
      expect(test.modules.requested().translation).toBe(false);
      expect(test.preferences.writes).toEqual([]);
      expect(checkbox.checked).toBe(true);
      expect(moduleRow(test.root, 'translation').text()).toContain(
        outcome === 'cancelled' ? 'Preparation cancelled' : 'Native download unavailable',
      );
      test.page.dispose();
    },
  );

  it('does not persist or repaint after the preparing Settings view is retired', async () => {
    const pending = Promise.withResolvers<TranslationDependencySnapshot | null>();
    const cancel = vi.fn();
    vi.mocked(prepareTranslationDependency).mockImplementation((options) => {
      options.registerCancel(cancel);
      return pending.promise;
    });
    const test = mount();
    const checkbox = requestCheckbox(test.root, 'translation');
    checkbox.checked = true;
    checkbox.emit('change');
    saveRequests(test.root);
    test.page.dispose();
    pending.resolve(READY_TRANSLATION);
    await pending.promise;
    await Promise.resolve();
    expect(test.modules.requested().translation).toBe(false);
    expect(test.preferences.writes).toEqual([]);
    expect(test.root.children).toEqual([]);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
