type AddonLike = {
  readonly id: string;
  readonly name?: string;
  readonly version?: string;
  readonly type?: string;
  readonly isActive?: boolean;
  readonly permissions?: number;
  readonly description?: string;
  readonly homepageURL?: string;
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
  const registry = Zotero.PreferencePanes as unknown as {
    readonly pluginPanes?: readonly PreferencePaneLike[];
  };
  const panes = registry?.pluginPanes;
  if (!panes?.length) return undefined;
  const matches = panes.filter((pane) => pane.pluginID === pluginID);
  if (matches.length === 1) return matches[0];
  const topLevel = matches.filter((pane) => !pane.parent);
  return topLevel.length === 1 ? topLevel[0] : undefined;
}

export interface MainPluginSnapshot {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly canEnable: boolean;
  readonly canDisable: boolean;
  readonly description: string;
  readonly homepageURL?: string;
  readonly preferencePaneID?: string;
}

/** AddonManager is the platform registry; preference pane discovery remains a private seam. */
export async function mainInstalledPlugins(): Promise<MainPluginSnapshot[]> {
  const manager = addonManager();
  const addons = await manager.getAddonsByTypes(['extension']);
  return addons
    .filter((addon) => addon.type === 'extension')
    .map((addon) => ({
      id: addon.id,
      name: addon.name?.trim() || addon.id,
      version: addon.version?.trim() || '',
      enabled: addon.isActive !== false,
      canEnable: !!((addon.permissions ?? 0) & manager.PERM_CAN_ENABLE),
      canDisable: !!((addon.permissions ?? 0) & manager.PERM_CAN_DISABLE),
      description: addon.description?.trim() || '',
      homepageURL: addon.homepageURL,
      preferencePaneID: preferencePaneForPlugin(addon.id)?.id,
    }));
}

export async function setMainPluginEnabled(pluginID: string, enabled: boolean): Promise<void> {
  const manager = addonManager();
  const addon = await manager.getAddonByID(pluginID);
  if (!addon || addon.type !== 'extension') throw new Error('Plugin is no longer installed');
  const permission = enabled ? manager.PERM_CAN_ENABLE : manager.PERM_CAN_DISABLE;
  if (!((addon.permissions ?? 0) & permission))
    throw new Error(`Plugin cannot be ${enabled ? 'enabled' : 'disabled'} by the user`);
  const operation = enabled ? addon.enable : addon.disable;
  if (!operation) throw new Error('Zotero AddonManager lifecycle operation is unavailable');
  await operation.call(addon);
}

export function openMainPluginPreferences(pluginID: string): boolean {
  const pane = preferencePaneForPlugin(pluginID);
  if (!pane) return false;
  const internal = Zotero.Utilities?.Internal as unknown as {
    openPreferences?: (paneID?: string) => unknown;
  };
  if (!internal?.openPreferences) return false;
  internal.openPreferences(pane.id);
  return true;
}

export function launchMainURL(url: string): boolean {
  const zotero = Zotero as unknown as { launchURL?: (url: string) => unknown };
  if (!zotero.launchURL) return false;
  zotero.launchURL(url);
  return true;
}
