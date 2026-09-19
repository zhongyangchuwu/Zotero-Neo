export const ZOTERO_NEO_PLUGIN_ID = 'zotero-neo@zotero-neo';

export interface InstalledPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly canEnable: boolean;
  readonly canDisable: boolean;
  readonly preferencePaneID?: string;
}

type AddonLike = {
  readonly id: string;
  readonly name?: string;
  readonly version?: string;
  readonly type?: string;
  readonly isActive?: boolean;
  readonly permissions?: number;
  enable?(): Promise<void>;
  disable?(): Promise<void>;
};

type AddonManagerLike = {
  readonly PERM_CAN_ENABLE: number;
  readonly PERM_CAN_DISABLE: number;
  getAddonsByTypes(types: readonly string[]): Promise<readonly AddonLike[]>;
  getAddonByID(id: string): Promise<AddonLike | null>;
};

type PreferencePaneLike = {
  readonly id: string;
  readonly pluginID?: string;
  readonly parent?: string;
};

function addonManager(): AddonManagerLike {
  const module = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs') as {
    AddonManager?: AddonManagerLike;
  };
  if (!module.AddonManager) throw new Error('Zotero AddonManager is unavailable');
  return module.AddonManager;
}

function preferencePaneForPlugin(pluginID: string): PreferencePaneLike | undefined {
  const panes = (
    Zotero.PreferencePanes as unknown as {
      readonly pluginPanes?: readonly PreferencePaneLike[];
    }
  )?.pluginPanes;
  if (!panes?.length) return undefined;
  const matches = panes.filter((pane) => pane.pluginID === pluginID);
  return matches.find((pane) => !pane.parent) ?? matches[0];
}

function canUsePermission(addon: AddonLike, permission: number): boolean {
  return !!((addon.permissions ?? 0) & permission);
}

export async function installedPlugins(): Promise<InstalledPlugin[]> {
  const manager = addonManager();
  const addons = await manager.getAddonsByTypes(['extension']);
  return addons
    .filter((addon) => addon.type === 'extension')
    .map((addon) => ({
      id: addon.id,
      name: addon.name?.trim() || addon.id,
      version: addon.version?.trim() || '',
      enabled: addon.isActive !== false,
      canEnable: canUsePermission(addon, manager.PERM_CAN_ENABLE),
      canDisable:
        addon.id !== ZOTERO_NEO_PLUGIN_ID &&
        canUsePermission(addon, manager.PERM_CAN_DISABLE),
      preferencePaneID: preferencePaneForPlugin(addon.id)?.id,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, Zotero.locale));
}

export async function setPluginEnabled(pluginID: string, enabled: boolean): Promise<void> {
  if (!enabled && pluginID === ZOTERO_NEO_PLUGIN_ID) {
    throw new Error('Zotero Neo cannot disable itself from inside Plugin Manager');
  }

  const manager = addonManager();
  const addon = await manager.getAddonByID(pluginID);
  if (!addon || addon.type !== 'extension') throw new Error('Plugin is no longer installed');

  const permission = enabled ? manager.PERM_CAN_ENABLE : manager.PERM_CAN_DISABLE;
  if (!canUsePermission(addon, permission)) {
    throw new Error(`Plugin cannot be ${enabled ? 'enabled' : 'disabled'} by the user`);
  }

  const operation = enabled ? addon.enable : addon.disable;
  if (!operation) throw new Error('Zotero AddonManager lifecycle operation is unavailable');
  await operation.call(addon);
}

export function openPluginPreferences(pluginID: string): boolean {
  const pane = preferencePaneForPlugin(pluginID);
  if (!pane) return false;
  const internal = Zotero.Utilities?.Internal as unknown as {
    openPreferences?: (paneID?: string) => unknown;
  };
  if (!internal?.openPreferences) return false;
  internal.openPreferences(pane.id);
  return true;
}
