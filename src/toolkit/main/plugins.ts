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
  readonly embedderDisabled?: boolean;
  readonly blocklistState?: number;
  readonly updateURL?: string | null;
  readonly pendingOperations?: number;
  findUpdates?(listener: UpdateListener, reason: number): void;
  enable?(): Promise<void>;
  disable?(): Promise<void>;
  uninstall?(): Promise<void>;
};

type InstallLike = {
  readonly addon?: AddonLike | null;
  readonly existingAddon?: AddonLike | null;
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
  readonly PERM_CAN_UNINSTALL: number;
  readonly PERM_CAN_UPGRADE?: number;
  readonly UPDATE_WHEN_USER_REQUESTED: number;
  readonly UPDATE_STATUS_NO_ERROR: number;
  readonly UPDATE_STATUS_TIMEOUT: number;
  readonly UPDATE_STATUS_DOWNLOAD_ERROR: number;
  readonly UPDATE_STATUS_PARSE_ERROR: number;
  readonly UPDATE_STATUS_UNKNOWN_FORMAT: number;
  readonly UPDATE_STATUS_SECURITY_ERROR: number;
  readonly STATE_AVAILABLE: number;
  readonly STATE_DOWNLOADED: number;
  readonly ERROR_NETWORK_FAILURE: number;
  readonly ERROR_INCORRECT_HASH: number;
  readonly ERROR_CORRUPT_FILE: number;
  readonly ERROR_SIGNEDSTATE_REQUIRED: number;
  readonly ERROR_UNEXPECTED_ADDON_TYPE: number;
  readonly ERROR_INCORRECT_ID: number;
  readonly ERROR_INVALID_DOMAIN: number;
  readonly ERROR_UNEXPECTED_ADDON_VERSION: number;
  readonly ERROR_BLOCKLISTED: number;
  readonly ERROR_INCOMPATIBLE: number;
  readonly ERROR_UNSUPPORTED_ADDON_TYPE: number;
  readonly ERROR_ADMIN_INSTALL_ONLY: number;
  readonly ERROR_SOFT_BLOCKED: number;
  readonly PENDING_ENABLE: number;
  readonly PENDING_DISABLE: number;
  readonly PENDING_UNINSTALL: number;
  readonly PENDING_INSTALL: number;
  readonly PENDING_UPGRADE: number;
  isInstallEnabled?(mimeType: string): boolean;
  getInstallForURL(url: string, options?: { hash?: string }): Promise<InstallLike | null>;
  getAddonsByTypes(types: readonly string[]): Promise<readonly AddonLike[]>;
  getAddonByID(id: string): Promise<AddonLike | null>;
};

type PreferencePaneLike = {
  readonly id: string;
  readonly pluginID?: string;
  readonly parent?: string;
};

const NEO_ID = 'zotero-neo@zotero-neo';
const NATIVE_UPDATE_URL_PREF = 'extensions.update.url';

export type MainPluginErrorCode =
  | 'network'
  | 'signature'
  | 'blocked'
  | 'incompatible'
  | 'already-installed'
  | 'identity'
  | 'protected'
  | 'permission'
  | 'invalid-package'
  | 'unavailable'
  | 'not-newer'
  | 'insecure-source';

export class MainPluginError extends Error {
  constructor(
    readonly code: MainPluginErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MainPluginError';
  }
}

function operationError(error: unknown): MainPluginError {
  return error instanceof MainPluginError
    ? error
    : new MainPluginError('unavailable', String(error));
}

function addonManager(): AddonManagerLike {
  try {
    const module = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs') as {
      AddonManager?: AddonManagerLike;
    };
    if (module.AddonManager) return module.AddonManager;
  } catch (error) {
    throw operationError(error);
  }
  throw new MainPluginError('unavailable', 'Zotero AddonManager is unavailable');
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
  readonly canUninstall: boolean;
  readonly description: string;
  readonly homepageURL?: string;
  readonly preferencePaneID?: string;
}

function restartPending(addon: AddonLike, manager: AddonManagerLike): boolean {
  return !!(
    (addon.pendingOperations ?? 0) &
    (manager.PENDING_ENABLE |
      manager.PENDING_DISABLE |
      manager.PENDING_UNINSTALL |
      manager.PENDING_INSTALL |
      manager.PENDING_UPGRADE)
  );
}

/** Use the same version ordering as native AddonManager, including Gecko prerelease qualifiers. */
export function compareMainPluginVersions(left: string, right: string): number {
  // The Zotero ambient Services declaration does not expose Gecko's nsIVersionComparator.
  const { vc } = Services as unknown as { vc: { compare(a: string, b: string): number } };
  return vc.compare(left, right);
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
      pendingRestart: restartPending(addon, manager),
      canEnable: !!((addon.permissions ?? 0) & manager.PERM_CAN_ENABLE),
      canDisable: addon.id !== NEO_ID && !!((addon.permissions ?? 0) & manager.PERM_CAN_DISABLE),
      canUninstall:
        addon.id !== NEO_ID && !!((addon.permissions ?? 0) & manager.PERM_CAN_UNINSTALL),
      description: addon.description?.trim() || '',
      homepageURL: addon.homepageURL,
      preferencePaneID: preferencePaneForPlugin(addon.id)?.id,
    }));
}

export async function setMainPluginEnabled(pluginID: string, enabled: boolean): Promise<void> {
  if (!enabled && pluginID === NEO_ID)
    throw new MainPluginError('protected', 'Zotero Neo cannot be disabled');
  const manager = addonManager();
  try {
    const addon = await manager.getAddonByID(pluginID);
    if (!addon || addon.type !== 'extension')
      throw new MainPluginError('unavailable', 'Plugin is no longer installed');
    const permission = enabled ? manager.PERM_CAN_ENABLE : manager.PERM_CAN_DISABLE;
    if (!((addon.permissions ?? 0) & permission))
      throw new MainPluginError(
        'permission',
        `Plugin cannot be ${enabled ? 'enabled' : 'disabled'} by the user`,
      );
    const operation = enabled ? addon.enable : addon.disable;
    if (!operation)
      throw new MainPluginError(
        'unavailable',
        'Zotero AddonManager lifecycle operation is unavailable',
      );
    await operation.call(addon);
  } catch (error) {
    throw operationError(error);
  }
}

export async function uninstallMainPlugin(pluginID: string): Promise<{ pendingRestart: boolean }> {
  if (pluginID === NEO_ID)
    throw new MainPluginError('protected', 'Zotero Neo cannot be uninstalled');
  const manager = addonManager();
  try {
    const addon = await manager.getAddonByID(pluginID);
    if (!addon || addon.type !== 'extension')
      throw new MainPluginError('unavailable', 'Plugin is no longer installed');
    if (!((addon.permissions ?? 0) & manager.PERM_CAN_UNINSTALL))
      throw new MainPluginError('permission', 'Plugin cannot be uninstalled by the user');
    if (!addon.uninstall)
      throw new MainPluginError('unavailable', 'Zotero AddonManager uninstall is unavailable');
    await addon.uninstall();
    const remaining = await manager.getAddonByID(pluginID);
    return { pendingRestart: !!((remaining?.pendingOperations ?? 0) & manager.PENDING_UNINSTALL) };
  } catch (error) {
    throw operationError(error);
  }
}

export interface MainPluginInstallOptions {
  readonly id?: string;
  readonly upgrade?: true;
  readonly requireHTTPS?: true;
  readonly hash?: string;
  readonly confirm: (details: { name: string; version: string; source: string }) => boolean;
  readonly progress: (current: number, total: number) => void;
  readonly registerCancel: (cancel: (() => void) | null) => void;
}

export interface MainPluginInstallResult {
  readonly id: string;
  readonly version: string;
  readonly pendingRestart: boolean;
}

function isHTTPS(source: string): boolean {
  try {
    return new URL(source).protocol === 'https:';
  } catch {
    return false;
  }
}

function assertPluginInstallEnabled(manager: AddonManagerLike): void {
  if (manager.isInstallEnabled?.('application/x-xpinstall') === false)
    throw new MainPluginError('permission', 'Zotero does not allow plugin installation');
}

function assertPluginCanUpgrade(manager: AddonManagerLike, addon: AddonLike): void {
  const permission = manager.PERM_CAN_UPGRADE;
  if (permission && !((addon.permissions ?? 0) & permission))
    throw new MainPluginError('permission', 'Zotero does not allow this plugin to be updated');
}

function isBlocked(addon: AddonLike): boolean {
  // nsIBlocklistService.STATE_SOFTBLOCKED / STATE_BLOCKED are 1 / 2.
  return (
    addon.embedderDisabled === true || addon.blocklistState === 1 || addon.blocklistState === 2
  );
}

function installFailure(manager: AddonManagerLike, error?: number): MainPluginError {
  let code: MainPluginErrorCode = 'unavailable';
  switch (error ?? 0) {
    case manager.ERROR_NETWORK_FAILURE:
      code = 'network';
      break;
    case manager.ERROR_SIGNEDSTATE_REQUIRED:
      code = 'signature';
      break;
    case manager.ERROR_BLOCKLISTED:
    case manager.ERROR_SOFT_BLOCKED:
      code = 'blocked';
      break;
    case manager.ERROR_INCOMPATIBLE:
      code = 'incompatible';
      break;
    case manager.ERROR_INCORRECT_ID:
    case manager.ERROR_UNEXPECTED_ADDON_VERSION:
      code = 'identity';
      break;
    case manager.ERROR_ADMIN_INSTALL_ONLY:
    case manager.ERROR_INVALID_DOMAIN:
      code = 'permission';
      break;
    case manager.ERROR_CORRUPT_FILE:
    case manager.ERROR_INCORRECT_HASH:
    case manager.ERROR_UNEXPECTED_ADDON_TYPE:
    case manager.ERROR_UNSUPPORTED_ADDON_TYPE:
      code = 'invalid-package';
      break;
  }
  return new MainPluginError(code, `Native plugin installation failed (${error ?? 'unknown'})`);
}

const PACKAGE_VALIDATION_MESSAGE = 'Downloaded plugin identity or compatibility validation failed';

async function runPluginInstall(
  manager: AddonManagerLike,
  install: InstallLike,
  options: MainPluginInstallOptions,
  mode: 'install' | 'url-upgrade' | 'native-update',
): Promise<MainPluginInstallResult | null> {
  const { promise, resolve, reject } = Promise.withResolvers<MainPluginInstallResult | null>();
  let settled = false;
  let cancelRequested = false;
  let confirmed: { id: string; version: string; source: string } | null = null;
  const finish = (result: MainPluginInstallResult | null, error?: MainPluginError): void => {
    if (settled) return;
    settled = true;
    install.removeListener(listener);
    options.registerCancel(null);
    if (error) reject(error);
    else resolve(result);
  };
  const fail = (native: InstallLike): void => finish(null, installFailure(manager, native.error));
  const approve = (native: InstallLike): boolean => {
    if (cancelRequested) {
      finish(null);
      return false;
    }
    try {
      const addon = native.addon;
      const source = native.sourceURI?.spec;
      if (native.error) throw installFailure(manager, native.error);
      if (!addon?.id || !addon.version || addon.type !== 'extension' || !source)
        throw new MainPluginError('invalid-package', PACKAGE_VALIDATION_MESSAGE);
      if (mode !== 'native-update' && addon.id === NEO_ID)
        throw new MainPluginError(
          'protected',
          'Zotero Neo cannot be installed or upgraded from a URL',
        );
      if (
        (options.id !== undefined && addon.id !== options.id) ||
        (confirmed &&
          (confirmed.id !== addon.id ||
            confirmed.version !== addon.version ||
            confirmed.source !== source))
      )
        throw new MainPluginError('identity', PACKAGE_VALIDATION_MESSAGE);
      if (isBlocked(addon))
        throw new MainPluginError('blocked', 'Zotero or Gecko blocked the plugin');
      if (addon.isCompatible !== true || addon.appDisabled === true)
        throw new MainPluginError('incompatible', PACKAGE_VALIDATION_MESSAGE);
      if ((options.requireHTTPS || mode === 'url-upgrade' || !options.id) && !isHTTPS(source))
        throw new MainPluginError('insecure-source', 'Plugin package source must use HTTPS');

      // Gecko exposes the existing add-on for the actual manifest ID before either gate.
      // A caller-supplied ID alone cannot make an unknown package safe to install.
      const existing = native.existingAddon;
      if (mode === 'install' && existing)
        throw new MainPluginError('already-installed', 'Plugin is already installed');
      if (mode === 'url-upgrade') {
        if (
          !existing ||
          existing.id !== addon.id ||
          existing.type !== 'extension' ||
          !existing.version
        )
          throw new MainPluginError('identity', 'URL upgrade has no matching installed extension');
        assertPluginCanUpgrade(manager, existing);
        if (compareMainPluginVersions(addon.version, existing.version) <= 0)
          throw new MainPluginError('not-newer', 'Downloaded plugin version is not newer');
      }

      if (!confirmed) {
        if (!options.confirm({ name: addon.name || addon.id, version: addon.version, source })) {
          finish(null);
          return false;
        }
        confirmed = { id: addon.id, version: addon.version, source };
        options.registerCancel(null);
      }
      return true;
    } catch (error) {
      finish(null, operationError(error));
      return false;
    }
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
    onInstallPostponed: () => {
      if (!confirmed) {
        finish(null, new MainPluginError('identity', PACKAGE_VALIDATION_MESSAGE));
        return;
      }
      finish({ id: confirmed.id, version: confirmed.version, pendingRestart: true });
    },
    onInstallEnded: (_native, addon) => {
      // Zotero's onInstalled listener runs first and can set the public blocklist state
      // without reporting an install error. Do not treat inherited userDisabled as a block.
      if (isBlocked(addon)) {
        finish(null, new MainPluginError('blocked', 'Zotero or Gecko blocked the plugin'));
      } else if (!confirmed || addon.id !== confirmed.id || addon.version !== confirmed.version) {
        finish(null, new MainPluginError('identity', PACKAGE_VALIDATION_MESSAGE));
      } else if (addon.isCompatible !== true || addon.appDisabled === true) {
        finish(null, new MainPluginError('incompatible', PACKAGE_VALIDATION_MESSAGE));
      } else {
        finish({
          id: confirmed.id,
          version: confirmed.version,
          pendingRestart: restartPending(addon, manager),
        });
      }
    },
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
    if (install.error) fail(install);
    else
      finish(
        null,
        new MainPluginError('unavailable', 'Native plugin installation is already in progress'),
      );
    return promise;
  }
  try {
    const started = install.install();
    if (started)
      void started.catch((error: unknown) => {
        if (install.error) fail(install);
        else finish(null, operationError(error));
      });
  } catch (error) {
    if (install.error) fail(install);
    else finish(null, operationError(error));
  }
  return promise;
}

export async function installMainPlugin(
  url: string,
  options: MainPluginInstallOptions,
): Promise<MainPluginInstallResult | null> {
  if (options.id === NEO_ID)
    throw new MainPluginError('protected', 'Zotero Neo cannot be installed or upgraded from a URL');
  if (options.upgrade && !options.id)
    throw new MainPluginError('identity', 'URL upgrades require the installed plugin ID');
  if ((options.requireHTTPS || options.upgrade || !options.id) && !isHTTPS(url))
    throw new MainPluginError('insecure-source', 'Plugin installation source must use HTTPS');
  const manager = addonManager();
  try {
    assertPluginInstallEnabled(manager);
    if (options.id) {
      const existing = await manager.getAddonByID(options.id);
      if (options.upgrade && existing?.type !== 'extension')
        throw new MainPluginError('unavailable', 'Plugin is no longer installed');
      if (options.upgrade && existing) assertPluginCanUpgrade(manager, existing);
      if (!options.upgrade && existing)
        throw new MainPluginError('already-installed', 'Plugin is already installed');
    }
    const install = await manager.getInstallForURL(url, { hash: options.hash });
    if (!install)
      throw new MainPluginError('unavailable', 'AddonManager could not create the install');
    return await runPluginInstall(
      manager,
      install,
      options,
      options.upgrade ? 'url-upgrade' : 'install',
    );
  } catch (error) {
    throw operationError(error);
  }
}

type MainPluginUpdateOptions = MainPluginInstallOptions & {
  readonly id: string;
  readonly reportMissingSource?: true;
};
type MainPluginUpdateResult = MainPluginInstallResult | null | 'no-update';

function updateFailure(manager: AddonManagerLike, status: number): MainPluginError {
  let code: MainPluginErrorCode = 'unavailable';
  if (status === manager.UPDATE_STATUS_TIMEOUT || status === manager.UPDATE_STATUS_DOWNLOAD_ERROR)
    code = 'network';
  else if (status === manager.UPDATE_STATUS_SECURITY_ERROR) code = 'signature';
  else if (
    status === manager.UPDATE_STATUS_PARSE_ERROR ||
    status === manager.UPDATE_STATUS_UNKNOWN_FORMAT
  )
    code = 'invalid-package';
  return new MainPluginError(code, `Update check failed (${status})`);
}

export function updateMainPlugin(
  options: MainPluginUpdateOptions & { readonly reportMissingSource: true },
): Promise<MainPluginUpdateResult | 'no-source'>;
export function updateMainPlugin(
  options: MainPluginUpdateOptions & { readonly reportMissingSource?: undefined },
): Promise<MainPluginUpdateResult>;
export async function updateMainPlugin(
  options: MainPluginUpdateOptions,
): Promise<MainPluginUpdateResult | 'no-source'> {
  const manager = addonManager();
  try {
    const addon = await manager.getAddonByID(options.id);
    if (!addon || addon.type !== 'extension' || !addon.findUpdates)
      throw new MainPluginError('unavailable', 'Plugin cannot be checked for updates');
    assertPluginCanUpgrade(manager, addon);

    const declaredURL = addon.updateURL?.trim();
    // ESR uses this pref for a user-requested check when the manifest has no
    // update URL. Zotero leaves it empty by default; a configured URL is real.
    const nativeURL =
      declaredURL ||
      ((options.requireHTTPS || options.reportMissingSource) && typeof Services !== 'undefined'
        ? Services.prefs?.getCharPref?.(NATIVE_UPDATE_URL_PREF, '').trim()
        : '');
    if (options.requireHTTPS && nativeURL && !isHTTPS(nativeURL))
      throw new MainPluginError('insecure-source', 'Plugin update manifest must use HTTPS');

    const { promise, resolve, reject } = Promise.withResolvers<InstallLike | null>();
    let update: InstallLike | null = null;
    try {
      addon.findUpdates(
        {
          onUpdateAvailable: (_addon, available) => {
            update = available;
          },
          onUpdateFinished: (_addon, error) => {
            if (error !== undefined && error !== manager.UPDATE_STATUS_NO_ERROR)
              reject(updateFailure(manager, error));
            else resolve(update);
          },
        },
        manager.UPDATE_WHEN_USER_REQUESTED,
      );
    } catch (error) {
      reject(error);
    }
    const install = await promise.catch((error: unknown) => {
      if (options.reportMissingSource && !nativeURL) return null;
      throw error;
    });
    if (!install) return options.reportMissingSource && !nativeURL ? 'no-source' : 'no-update';
    assertPluginInstallEnabled(manager);
    if (options.requireHTTPS && !isHTTPS(install.sourceURI?.spec ?? ''))
      throw new MainPluginError('insecure-source', 'Plugin update source must use HTTPS');
    return await runPluginInstall(manager, install, options, 'native-update');
  } catch (error) {
    throw operationError(error);
  }
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
