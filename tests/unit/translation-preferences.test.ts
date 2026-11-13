import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import { modulePreferenceKey } from '../../src/core/module-runtime';
import { migrateTranslationModulePreference } from '../../src/modules/translation/preferences';

const provider = vi.hoisted(() => ({
  running: false,
  configured: false,
  installed: vi.fn<(pluginID: string) => Promise<boolean>>(),
}));
vi.mock('../../src/platform/translate-for-zotero-v248', () => ({
  translateForZoteroPresent: () => provider.running,
}));
vi.mock('../../src/platform/translate-for-zotero-settings-v248', () => ({
  hasTranslateForZoteroConfiguration: () => provider.configured,
}));
vi.mock('../../src/toolkit', () => ({
  mainPluginInstalled: provider.installed,
}));
beforeEach(() => {
  provider.running = false;
  provider.configured = false;
  provider.installed.mockReset().mockResolvedValue(false);
});

function preferences(initial: Record<string, boolean | number | string> = {}) {
  const values = new Map<string, boolean | number | string>(Object.entries(initial));
  const store = {
    has: (key: string) => values.has(key),
    get: (key: string, fallback: boolean | number | string) => values.get(key) ?? fallback,
    set: (key: string, value: boolean | number | string) => {
      values.set(key, value);
    },
    clear: (key: string) => {
      values.delete(key);
    },
  } as PreferenceStore;
  return { store, values };
}

describe('translation enhancement preference migration', () => {
  it('preserves prior use without changing other module, binding or provider configuration', async () => {
    provider.configured = true;
    const { store, values } = preferences({
      'modules.extensions.enabled': false,
      bindings: 'custom-bindings',
      'provider.targetLanguage': 'custom-language',
    });
    await migrateTranslationModulePreference(store);
    expect(values.get(modulePreferenceKey('translation'))).toBe(true);
    expect(values.get('modules.extensions.enabled')).toBe(false);
    expect(values.get('bindings')).toBe('custom-bindings');
    expect(values.get('provider.targetLanguage')).toBe('custom-language');
  });

  it('never overrides an explicit opt-out even when the external provider is running', async () => {
    provider.running = true;
    provider.configured = true;
    const { store, values } = preferences({ [modulePreferenceKey('translation')]: false });
    await migrateTranslationModulePreference(store);
    expect(values.get(modulePreferenceKey('translation'))).toBe(false);
  });

  it('does not turn a fresh-profile opt-out into activation when a provider appears later', async () => {
    const { store, values } = preferences();
    await migrateTranslationModulePreference(store);
    provider.running = true;
    provider.configured = true;
    await migrateTranslationModulePreference(store);
    expect(values.get(modulePreferenceKey('translation'))).toBe(false);
  });

  it('preserves an installed provider without runtime or saved configuration', async () => {
    provider.installed.mockResolvedValue(true);
    const { store, values } = preferences();
    await migrateTranslationModulePreference(store);
    expect(values.get(modulePreferenceKey('translation'))).toBe(true);
  });

  it('preserves an explicit opt-out saved while installation discovery is pending', async () => {
    const installed = Promise.withResolvers<boolean>();
    provider.installed.mockReturnValue(installed.promise);
    const { store, values } = preferences();
    const migration = migrateTranslationModulePreference(store);
    store.set(modulePreferenceKey('translation'), false);
    installed.resolve(true);
    await migration;
    expect(values.get(modulePreferenceKey('translation'))).toBe(false);
  });
});
