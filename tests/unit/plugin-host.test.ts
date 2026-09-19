import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installedPlugins,
  openPluginPreferences,
  setPluginEnabled,
  ZOTERO_NEO_PLUGIN_ID,
} from '../../src/main/plugin-host';

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
  it('projects lifecycle permissions and registered settings panes', async () => {
    const plugin = {
      id: 'example@example.test',
      name: 'Example Plugin',
      version: '1.2.3',
      type: 'extension',
      isActive: true,
      permissions: 6,
      enable,
      disable,
    };
    installHost([plugin]);
    Reflect.set(Reflect.get(globalThis, 'Zotero').PreferencePanes, 'pluginPanes', [
      { id: 'example-child', pluginID: plugin.id, parent: 'example-root' },
      { id: 'example-root', pluginID: plugin.id },
    ]);

    await expect(installedPlugins()).resolves.toEqual([
      {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        enabled: true,
        canEnable: true,
        canDisable: true,
        preferencePaneID: 'example-root',
      },
    ]);
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

    const [neo] = await installedPlugins();
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
