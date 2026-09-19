export interface InstalledPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
}

type AddonLike = {
  readonly id: string;
  readonly name?: string;
  readonly version?: string;
  readonly type?: string;
  readonly isActive?: boolean;
};

type AddonManagerLike = {
  getAddonsByTypes(types: readonly string[]): Promise<readonly AddonLike[]>;
};

function addonManager(): AddonManagerLike {
  const module = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs') as {
    AddonManager?: AddonManagerLike;
  };
  if (!module.AddonManager) throw new Error('Zotero AddonManager is unavailable');
  return module.AddonManager;
}

export async function installedPlugins(): Promise<InstalledPlugin[]> {
  const addons = await addonManager().getAddonsByTypes(['extension']);
  return addons
    .filter((addon) => addon.type === 'extension')
    .map((addon) => ({
      id: addon.id,
      name: addon.name?.trim() || addon.id,
      version: addon.version?.trim() || '',
      enabled: addon.isActive !== false,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, Zotero.locale));
}
