type AddonLike = {
  readonly id: string;
  readonly name?: string;
  readonly version?: string;
  readonly type?: string;
  readonly isActive?: boolean;
  readonly permissions?: number;
  readonly description?: string;
  readonly homepageURL?: string;
  readonly isCompatible?: boolean;
  readonly appDisabled?: boolean;
  readonly pendingOperations?: number;
  findUpdates?(listener: UpdateListener, reason: number): void;
  enable?(): Promise<void>;
  disable?(): Promise<void>;
};

type InstallLike = {
  readonly addon?: AddonLike;
  readonly state: number;
  readonly sourceURI?: { readonly spec: string };
  readonly progress?: number;
  readonly maxProgress?: number;
  readonly error?: number;
  addListener(listener: InstallListener): void;
  removeListener(listener: InstallListener): void;
  install(): Promise<unknown> | void;
  cancel(): void;
};

type InstallListener = {
  onDownloadProgress?(install: InstallLike): void;
  onDownloadEnded?(install: InstallLike): boolean;
  onDownloadCancelled?(): void;
  onDownloadFailed?(install: InstallLike): void;
  onInstallCancelled?(): void;
  onInstallStarted?(install: InstallLike): boolean;
  onInstallFailed?(install: InstallLike): void;
  onInstallPostponed?(): void;
  onInstallEnded?(install: InstallLike, addon: AddonLike): void;
};

type UpdateListener = {
  onUpdateAvailable(addon: AddonLike, install: InstallLike): void;
  onUpdateFinished(addon: AddonLike, error?: number): void;
};

type AddonManagerLike = {
  readonly PERM_CAN_ENABLE: number;
  readonly PERM_CAN_DISABLE: number;
  readonly UPDATE_WHEN_USER_REQUESTED: number;
  readonly UPDATE_STATUS_NO_ERROR: number;
  readonly STATE_AVAILABLE: number;
  readonly STATE_DOWNLOADED: number;
  readonly PENDING_INSTALL: number;
  readonly PENDING_UPGRADE: number;
  getInstallForURL(url: string, options?: { hash?: string }): Promise<InstallLike>;
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
  readonly pendingRestart: boolean;
  readonly canEnable: boolean;
  readonly canDisable: boolean;
  readonly description: string;
  readonly homepageURL?: string;
  readonly preferencePaneID?: string;
}

/** Resolve installation independently of whether the extension is enabled or running. */
export async function mainPluginInstalled(pluginID: string): Promise<boolean> {
  const addon = await addonManager().getAddonByID(pluginID);
  return addon?.type === 'extension';
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
      pendingRestart: !!(
        (addon.pendingOperations ?? 0) &
        (manager.PENDING_INSTALL | manager.PENDING_UPGRADE)
      ),
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

export interface MainPluginInstallOptions {
  readonly id: string;
  readonly hash?: string;
  readonly confirm: (details: { name: string; version: string; source: string }) => boolean;
  readonly progress: (current: number, total: number) => void;
  readonly registerCancel: (cancel: (() => void) | null) => void;
}

async function runPluginInstall(
  install: InstallLike,
  options: MainPluginInstallOptions,
): Promise<{ pendingRestart: boolean } | null> {
  const manager = addonManager();
  const { promise, resolve, reject } = Promise.withResolvers<{ pendingRestart: boolean } | null>();
  let settled = false;
  let cancelRequested = false;
  let confirmed: { id: string; version: string; source: string } | null = null;
  const finish = (result: { pendingRestart: boolean } | null, error?: Error): void => {
    if (settled) return;
    settled = true;
    install.removeListener(listener);
    options.registerCancel(null);
    if (error) reject(error);
    else resolve(result);
  };
  const fail = (native: InstallLike): void =>
    finish(null, new Error(`Native plugin installation failed (${native.error ?? 'unknown'})`));
  const approve = (native: InstallLike): boolean => {
    if (cancelRequested) {
      finish(null);
      return false;
    }
    const addon = native.addon;
    const source = native.sourceURI?.spec;
    if (
      !addon ||
      addon.id !== options.id ||
      addon.type !== 'extension' ||
      addon.isCompatible !== true ||
      addon.appDisabled === true ||
      native.error ||
      !addon.version ||
      !source ||
      (confirmed &&
        (confirmed.id !== addon.id ||
          confirmed.version !== addon.version ||
          confirmed.source !== source))
    ) {
      finish(null, new Error('Downloaded plugin identity or compatibility validation failed'));
      return false;
    }
    if (confirmed) return true;
    try {
      if (!options.confirm({ name: addon.name || addon.id, version: addon.version, source })) {
        finish(null);
        return false;
      }
    } catch (error) {
      finish(null, new Error(String(error)));
      return false;
    }
    confirmed = { id: addon.id, version: addon.version, source };
    options.registerCancel(null);
    return true;
  };
  const listener: InstallListener = {
    onDownloadProgress: (native) => options.progress(native.progress ?? 0, native.maxProgress ?? 0),
    onDownloadEnded: (native) => {
      if (approve(native)) return true;
      try {
        native.cancel();
      } catch {}
      return false;
    },
    // ESR140 aborts and cleans up when this returns false; cancel() is not valid in STATE_INSTALLING.
    onInstallStarted: (native) => approve(native),
    onDownloadCancelled: () => finish(null),
    onInstallCancelled: () => finish(null),
    onDownloadFailed: fail,
    onInstallFailed: fail,
    onInstallPostponed: () => finish({ pendingRestart: true }),
    onInstallEnded: (_native, addon) =>
      finish({
        pendingRestart: !!(
          (addon.pendingOperations ?? 0) &
          (manager.PENDING_INSTALL | manager.PENDING_UPGRADE)
        ),
      }),
  };
  install.addListener(listener);
  options.registerCancel(() => {
    cancelRequested = true;
    try {
      install.cancel();
    } catch {
      // The native download may still reach onDownloadEnded after cancellation fails.
      // Keep the veto listeners until a terminal event or a pre-execution gate.
    }
  });
  if (settled) return promise;
  if (cancelRequested) {
    // Only an available install is known not to have started here. Other states
    // may still deliver a native continuation after cancel() throws.
    if (install.state === manager.STATE_AVAILABLE) finish(null);
    return promise;
  }
  // A cached download can proceed directly to a postponed upgrade, before onInstallStarted.
  if (install.state === manager.STATE_DOWNLOADED) {
    if (!approve(install)) {
      try {
        install.cancel();
      } catch {}
      return promise;
    }
  } else if (install.state !== manager.STATE_AVAILABLE) {
    finish(null, new Error('Native plugin installation is already in progress'));
    return promise;
  }
  try {
    const started = install.install();
    if (started) void started.catch((error: unknown) => finish(null, new Error(String(error))));
  } catch (error) {
    finish(null, new Error(String(error)));
  }
  return promise;
}

export async function installMainPlugin(
  url: string,
  options: MainPluginInstallOptions,
): Promise<{ pendingRestart: boolean } | null> {
  if (await addonManager().getAddonByID(options.id)) throw new Error('Plugin is already installed');
  return runPluginInstall(
    await addonManager().getInstallForURL(url, { hash: options.hash }),
    options,
  );
}

export async function updateMainPlugin(
  options: MainPluginInstallOptions,
): Promise<{ pendingRestart: boolean } | null | 'no-update'> {
  const manager = addonManager();
  const addon = await manager.getAddonByID(options.id);
  if (!addon || addon.type !== 'extension' || !addon.findUpdates)
    throw new Error('Plugin cannot be checked for updates');
  const { promise, resolve, reject } = Promise.withResolvers<InstallLike | null>();
  let update: InstallLike | null = null;
  addon.findUpdates(
    {
      onUpdateAvailable: (_addon, available) => {
        update = available;
      },
      onUpdateFinished: (_addon, error) => {
        if (error !== undefined && error !== manager.UPDATE_STATUS_NO_ERROR)
          reject(new Error(`Update check failed (${error})`));
        else resolve(update);
      },
    },
    manager.UPDATE_WHEN_USER_REQUESTED,
  );
  const install = await promise;
  return install ? runPluginInstall(install, options) : 'no-update';
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
