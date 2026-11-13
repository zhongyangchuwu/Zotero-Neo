import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  githubRepositoryURL,
  installedPlugins,
  openPluginInfoURL,
  openPluginPreferences,
  setPluginEnabled,
  ZOTERO_NEO_PLUGIN_ID,
} from '../../src/modules/extensions/host';
import { mainPluginInstalled } from '../../src/toolkit/main';

const originalChromeUtils = Reflect.get(globalThis, 'ChromeUtils');
const originalZotero = Reflect.get(globalThis, 'Zotero');

const enable = vi.fn(async () => {});
const disable = vi.fn(async () => {});
const getAddonByID = vi.fn();

function installHost(addons: Array<Record<string, unknown>>): void {
  const manager = {
    PERM_CAN_ENABLE: 2,
    PERM_CAN_DISABLE: 4,
    getAddonsByTypes: vi.fn(async () => addons),
    getAddonByID,
  };
  vi.stubGlobal('ChromeUtils', {
    importESModule: () => ({ AddonManager: manager }),
  });
}

beforeEach(() => {
  enable.mockClear();
  disable.mockClear();
  getAddonByID.mockReset();
  vi.stubGlobal('Zotero', {
    locale: 'en-US',
    PreferencePanes: { pluginPanes: [] },
    Utilities: { Internal: { openPreferences: vi.fn() } },
  });
});

afterEach(() => {
  if (originalChromeUtils === undefined) Reflect.deleteProperty(globalThis, 'ChromeUtils');
  else Reflect.set(globalThis, 'ChromeUtils', originalChromeUtils);
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

describe('Plugin Manager host adapter', () => {
  it.each([
    {
      name: 'disabled extension',
      addon: { id: 'translation@test', type: 'extension', isActive: false },
      expected: true,
    },
    { name: 'missing add-on', addon: null, expected: false },
    {
      name: 'non-extension add-on',
      addon: { id: 'theme@test', type: 'theme' },
      expected: false,
    },
  ])('detects installation independently of runtime: $name', async ({ addon, expected }) => {
    installHost([]);
    getAddonByID.mockResolvedValue(addon);
    expect(await mainPluginInstalled('translation@test')).toBe(expected);
  });

  it('projects lifecycle permissions and registered settings panes', async () => {
    const plugin = {
      id: 'example@example.test',
      name: 'Example Plugin',
      version: '1.2.3',
      type: 'extension',
      isActive: true,
      permissions: 6,
      description: 'Keyboard-first example plugin',
      homepageURL: 'https://github.com/example/example-plugin/releases',
      enable,
      disable,
    };
    installHost([plugin]);
    Reflect.set(Reflect.get(globalThis, 'Zotero').PreferencePanes, 'pluginPanes', [
      { id: 'example-child', pluginID: plugin.id, parent: 'example-root' },
      { id: 'example-root', pluginID: plugin.id },
    ]);

    const plugins = await installedPlugins();
    expect(plugins.find((entry) => entry.id === plugin.id)).toMatchObject({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      installed: true,
      enabled: true,
      canEnable: true,
      canDisable: true,
      description: 'Keyboard-first example plugin',
      homepageURL: 'https://github.com/example/example-plugin/releases',
      repositoryURL: 'https://github.com/example/example-plugin',
      readmeURL: 'https://github.com/example/example-plugin#readme',
      gitLogURL: 'https://github.com/example/example-plugin/commits',
      preferencePaneID: 'example-root',
    });
    expect(plugins.filter((entry) => entry.id === 'zoteropdftranslate@euclpts.com')).toHaveLength(
      1,
    );
    expect(plugins.find((entry) => entry.id === 'zoteropdftranslate@euclpts.com')).toMatchObject({
      installed: false,
    });
  });

  it('does not duplicate the curated entry when Translate is installed', async () => {
    installHost([
      {
        id: 'zoteropdftranslate@euclpts.com',
        name: 'Translate',
        type: 'extension',
        isActive: false,
      },
    ]);
    const matches = (await installedPlugins()).filter(
      (entry) => entry.id === 'zoteropdftranslate@euclpts.com',
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ installed: true, enabled: false });
  });

  it('derives GitHub repository documentation links conservatively', () => {
    expect(githubRepositoryURL('https://github.com/windingwind/zotero-actions-tags')).toBe(
      'https://github.com/windingwind/zotero-actions-tags',
    );
    expect(githubRepositoryURL('https://github.com/windingwind/zotero-actions-tags/releases')).toBe(
      'https://github.com/windingwind/zotero-actions-tags',
    );
    expect(githubRepositoryURL('https://github.com/windingwind/zotero-actions-tags.git')).toBe(
      'https://github.com/windingwind/zotero-actions-tags',
    );
    expect(githubRepositoryURL('https://example.com/project')).toBeUndefined();
    expect(githubRepositoryURL('javascript:alert(1)')).toBeUndefined();
  });

  it('protects Zotero Neo from self-disable while preserving host permissions', async () => {
    installHost([
      {
        id: ZOTERO_NEO_PLUGIN_ID,
        name: 'Zotero Neo',
        version: '0.1.0',
        type: 'extension',
        isActive: true,
        permissions: 6,
        enable,
        disable,
      },
    ]);

    const neo = (await installedPlugins()).find((plugin) => plugin.id === ZOTERO_NEO_PLUGIN_ID);
    expect(neo).toMatchObject({ canEnable: true, canDisable: false });
    await expect(setPluginEnabled(ZOTERO_NEO_PLUGIN_ID, false)).rejects.toThrow(
      'cannot disable itself',
    );
    expect(disable).not.toHaveBeenCalled();
  });

  it('delegates enable and disable to a freshly resolved AddonManager add-on', async () => {
    const plugin = {
      id: 'toggle@example.test',
      type: 'extension',
      permissions: 6,
      enable,
      disable,
    };
    installHost([]);
    getAddonByID.mockResolvedValue(plugin);

    await setPluginEnabled(plugin.id, true);
    expect(enable).toHaveBeenCalledTimes(1);
    expect(disable).not.toHaveBeenCalled();

    await setPluginEnabled(plugin.id, false);
    expect(disable).toHaveBeenCalledTimes(1);
  });

  it('rejects lifecycle operations that AddonManager does not permit', async () => {
    const plugin = {
      id: 'locked@example.test',
      type: 'extension',
      permissions: 0,
      enable,
      disable,
    };
    installHost([]);
    getAddonByID.mockResolvedValue(plugin);

    await expect(setPluginEnabled(plugin.id, true)).rejects.toThrow('cannot be enabled');
    await expect(setPluginEnabled(plugin.id, false)).rejects.toThrow('cannot be disabled');
    expect(enable).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });

  it('opens safe plugin information URLs through Zotero', () => {
    installHost([]);
    const zotero = Reflect.get(globalThis, 'Zotero');
    const launchURL = vi.fn();
    Reflect.set(zotero, 'launchURL', launchURL);

    expect(openPluginInfoURL('https://github.com/example/project#readme')).toBe(true);
    expect(launchURL).toHaveBeenCalledWith('https://github.com/example/project#readme');
    expect(openPluginInfoURL('javascript:alert(1)')).toBe(false);
    expect(launchURL).toHaveBeenCalledTimes(1);
  });

  it('opens an unambiguous Zotero preference pane and no-ops otherwise', () => {
    installHost([]);
    const zotero = Reflect.get(globalThis, 'Zotero');
    const openPreferences = zotero.Utilities.Internal.openPreferences as ReturnType<typeof vi.fn>;
    Reflect.set(zotero.PreferencePanes, 'pluginPanes', [
      { id: 'prefs-pane', pluginID: 'prefs@example.test' },
    ]);

    expect(openPluginPreferences('prefs@example.test')).toBe(true);
    expect(openPreferences).toHaveBeenCalledWith('prefs-pane');
    expect(openPluginPreferences('missing@example.test')).toBe(false);
    Reflect.set(zotero.PreferencePanes, 'pluginPanes', [
      { id: 'first-pane', pluginID: 'ambiguous@example.test' },
      { id: 'second-pane', pluginID: 'ambiguous@example.test' },
    ]);
    expect(openPluginPreferences('ambiguous@example.test')).toBe(false);
    expect(openPreferences).toHaveBeenCalledTimes(1);
  });
});
