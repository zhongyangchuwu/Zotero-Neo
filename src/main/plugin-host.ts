export const ZOTERO_NEO_PLUGIN_ID = 'zotero-neo@zotero-neo';

export interface InstalledPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly canEnable: boolean;
  readonly canDisable: boolean;
  readonly description: string;
  readonly homepageURL?: string;
  readonly repositoryURL?: string;
  readonly readmeURL?: string;
  readonly gitLogURL?: string;
  readonly preferencePaneID?: string;
}

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
  const panes = (
    Zotero.PreferencePanes as unknown as {
      readonly pluginPanes?: readonly PreferencePaneLike[];
    }
  )?.pluginPanes;
  if (!panes?.length) return undefined;
  const matches = panes.filter((pane) => pane.pluginID === pluginID);
  if (matches.length === 1) return matches[0];
  const topLevel = matches.filter((pane) => !pane.parent);
  return topLevel.length === 1 ? topLevel[0] : undefined;
}

function canUsePermission(addon: AddonLike, permission: number): boolean {
  return !!((addon.permissions ?? 0) & permission);
}

function safeHTTPURL(value?: string): string | undefined {
  const input = value?.trim();
  if (!input) return undefined;
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function githubRepositoryURL(homepageURL?: string): string | undefined {
  const safe = safeHTTPURL(homepageURL);
  if (!safe) return undefined;
  try {
    const url = new URL(safe);
    if (url.hostname.toLowerCase() !== 'github.com') return undefined;
    const [owner, rawRepo] = url.pathname.split('/').filter(Boolean);
    if (!owner || !rawRepo) return undefined;
    const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
    if (!repo) return undefined;
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  } catch {
    return undefined;
  }
}

function pluginInfoLinks(homepageURL?: string): {
  homepageURL?: string;
  repositoryURL?: string;
  readmeURL?: string;
  gitLogURL?: string;
} {
  const homepage = safeHTTPURL(homepageURL);
  const repositoryURL = githubRepositoryURL(homepage);
  return {
    homepageURL: homepage,
    repositoryURL,
    readmeURL: repositoryURL ? `${repositoryURL}#readme` : undefined,
    gitLogURL: repositoryURL ? `${repositoryURL}/commits` : undefined,
  };
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
        addon.id !== ZOTERO_NEO_PLUGIN_ID && canUsePermission(addon, manager.PERM_CAN_DISABLE),
      description: addon.description?.trim() || '',
      ...pluginInfoLinks(addon.homepageURL),
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

export function openPluginInfoURL(url: string | undefined): boolean {
  const safe = safeHTTPURL(url);
  if (!safe) return false;
  const launchURL = (Zotero as unknown as { launchURL?: (url: string) => unknown }).launchURL;
  if (!launchURL) return false;
  launchURL(safe);
  return true;
}
