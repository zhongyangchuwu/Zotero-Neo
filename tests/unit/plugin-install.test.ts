import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compareMainPluginVersions,
  installMainPlugin,
  mainInstalledPlugins,
  MainPluginError,
  setMainPluginEnabled,
  uninstallMainPlugin,
  updateMainPlugin,
} from '../../src/toolkit/main/plugins';

const id = 'zoteropdftranslate@euclpts.com';
const neoId = 'zotero-neo@zotero-neo';
const url =
  'https://github.com/windingwind/zotero-pdf-translate/releases/latest/download/translate-for-zotero.xpi';

afterEach(() => vi.unstubAllGlobals());

function nativeInstall(addonID = id, compatible = true, cached = false) {
  let listener: Record<string, (...args: never[]) => unknown> = {};
  const addon = {
    id: addonID,
    name: 'Translate',
    version: '2.4.8',
    type: 'extension',
    isCompatible: compatible,
    appDisabled: false,
    embedderDisabled: false,
    blocklistState: 0,
    pendingOperations: 0,
  };
  const native = {
    addon,
    existingAddon: null as Pick<typeof addon, 'id' | 'version' | 'type'> | null,
    state: cached ? 3 : 0,
    sourceURI: { spec: url },
    error: 0,
    executed: false,
    postponed: false,
    beforeStart: null as (() => void) | null,
    beforeEnd: null as (() => void) | null,
    addListener(value: typeof listener) {
      listener = value;
    },
    removeListener(value: typeof listener) {
      if (listener === value) listener = {};
    },
    cancel: vi.fn(() => listener.onDownloadCancelled?.()),
    failDownload() {
      listener.onDownloadFailed?.(native as never);
    },
    resumeDownload() {
      native.state = 3;
      if (listener.onDownloadEnded?.(native as never) === false) return;
      native.startExecution();
    },
    startExecution() {
      if (native.postponed) {
        listener.onInstallPostponed?.();
        return;
      }
      native.state = 5;
      native.beforeStart?.();
      if (listener.onInstallStarted?.(native as never) === false) {
        native.state = 3;
        listener.onInstallCancelled?.();
        return;
      }
      native.executed = true;
      native.beforeEnd?.();
      listener.onInstallEnded?.(native as never, addon as never);
    },
    install: vi.fn(() => {
      if (native.state === 0) native.resumeDownload();
      else native.startExecution();
    }),
  };
  return native;
}

function host(install: ReturnType<typeof nativeInstall>, addon: unknown = null) {
  const manager = {
    PERM_CAN_UNINSTALL: 1,
    PERM_CAN_ENABLE: 2,
    PERM_CAN_DISABLE: 4,
    STATE_AVAILABLE: 0,
    STATE_DOWNLOADED: 3,
    UPDATE_WHEN_USER_REQUESTED: 1,
    UPDATE_STATUS_NO_ERROR: 0,
    UPDATE_STATUS_DOWNLOAD_ERROR: -2,
    UPDATE_STATUS_SECURITY_ERROR: -5,
    ERROR_NETWORK_FAILURE: -1,
    ERROR_INCORRECT_HASH: -2,
    ERROR_SIGNEDSTATE_REQUIRED: -5,
    ERROR_INCORRECT_ID: -7,
    ERROR_BLOCKLISTED: -10,
    ERROR_INCOMPATIBLE: -11,
    PENDING_ENABLE: 1,
    PENDING_DISABLE: 2,
    PENDING_UNINSTALL: 4,
    PENDING_INSTALL: 8,
    PENDING_UPGRADE: 16,
    isInstallEnabled: vi.fn(() => true),
    getAddonByID: vi.fn(async () => addon),
    getAddonsByTypes: vi.fn(async () => (addon ? [addon] : [])),
    getInstallForURL: vi.fn(async () => install),
  };
  vi.stubGlobal('ChromeUtils', { importESModule: () => ({ AddonManager: manager }) });
  vi.stubGlobal('Zotero', { PreferencePanes: {} });
  return manager;
}

function options(confirm = vi.fn(() => true)) {
  return { id, confirm, progress: vi.fn(), registerCancel: vi.fn() };
}

describe('native plugin installation', () => {
  it('rejects a downloaded package with a different identity or incompatible manifest before execution', async () => {
    for (const native of [nativeInstall('wrong@example.com'), nativeInstall(id, false)]) {
      host(native);
      const request = options();
      await expect(installMainPlugin(url, request)).rejects.toThrow('identity or compatibility');
      expect(request.confirm).not.toHaveBeenCalled();
      expect(native.cancel).toHaveBeenCalled();
    }
  });

  it('confirms parsed version and source before allowing install, and honors rejection', async () => {
    const native = nativeInstall();
    host(native);
    const request = options(vi.fn(() => false));
    await expect(installMainPlugin(url, request)).resolves.toBeNull();
    expect(request.confirm).toHaveBeenCalledWith({
      name: 'Translate',
      version: '2.4.8',
      source: url,
    });
    expect(native.cancel).toHaveBeenCalled();
  });

  it('cancels a pending native download without asking to install', async () => {
    const native = nativeInstall();
    native.install.mockImplementation(() => {});
    host(native);
    let cancel: (() => void) | null = null;
    const request = {
      ...options(),
      registerCancel: (value: (() => void) | null) => {
        cancel = value;
      },
    };
    const pending = installMainPlugin(url, request);
    await vi.waitFor(() => expect(cancel).not.toBeNull());
    (cancel as unknown as () => void)();
    await expect(pending).resolves.toBeNull();
    expect(native.cancel).toHaveBeenCalledOnce();
    expect(request.confirm).not.toHaveBeenCalled();
  });

  it('vetoes a late download after cancel throws and the panel is replaced', async () => {
    const native = nativeInstall();
    native.install.mockImplementation(() => {});
    native.cancel.mockImplementation(() => {
      throw new Error('channel already cleared');
    });
    host(native);
    const original = {};
    let overlay: object | null = original;
    let cancel: (() => void) | null = null;
    const confirm = vi.fn(() => overlay === original);
    const pending = installMainPlugin(url, {
      ...options(confirm),
      registerCancel: (value) => {
        cancel = value;
      },
    });
    await vi.waitFor(() => expect(cancel).not.toBeNull());
    overlay = null;
    (cancel as unknown as () => void)();
    overlay = {};
    native.resumeDownload();
    await expect(pending).resolves.toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    expect(native.executed).toBe(false);
    expect(native.cancel).toHaveBeenCalledTimes(2);
  });

  it('checks only the selected addon and reports no update', async () => {
    const findUpdates = vi.fn(
      (listener: { onUpdateFinished: (addon: unknown, status: number) => void }) =>
        listener.onUpdateFinished({}, 0),
    );
    const manager = host(nativeInstall(), { id, type: 'extension', findUpdates });
    await expect(updateMainPlugin(options())).resolves.toBe('no-update');
    expect(manager.getAddonByID).toHaveBeenCalledWith(id);
    expect(findUpdates).toHaveBeenCalledWith(expect.anything(), manager.UPDATE_WHEN_USER_REQUESTED);
  });

  it('validates cached updates before native install and refuses invalid or rejected packages', async () => {
    for (const [native, accepted] of [
      [nativeInstall('other@example.com', true, true), true],
      [nativeInstall(id, false, true), true],
      [nativeInstall(id, true, true), false],
    ] as const) {
      const addon = {
        id,
        type: 'extension',
        findUpdates(listener: {
          onUpdateAvailable: (addon: unknown, install: unknown) => void;
          onUpdateFinished: (addon: unknown, status: number) => void;
        }) {
          listener.onUpdateAvailable(addon, native);
          listener.onUpdateFinished(addon, 0);
        },
      };
      host(native, addon);
      const request = options(vi.fn(() => accepted));
      if (native.addon.id !== id || !native.addon.isCompatible)
        await expect(updateMainPlugin(request)).rejects.toThrow('identity or compatibility');
      else await expect(updateMainPlugin(request)).resolves.toBeNull();
      expect(native.executed).toBe(false);
      expect(native.install).not.toHaveBeenCalled();
      expect(native.cancel).toHaveBeenCalledOnce();
    }
  });

  it.each([false, true])('confirms a cached update once (postponed: %s)', async (postponed) => {
    const native = nativeInstall(id, true, true);
    native.postponed = postponed;
    const addon = {
      id,
      type: 'extension',
      findUpdates(listener: {
        onUpdateAvailable: (addon: unknown, install: unknown) => void;
        onUpdateFinished: (addon: unknown, status: number) => void;
      }) {
        listener.onUpdateAvailable(addon, native);
        listener.onUpdateFinished(addon, 0);
      },
    };
    host(native, addon);
    const request = options();
    await expect(
      updateMainPlugin({ ...request, reportMissingSource: true, requireHTTPS: true }),
    ).resolves.toEqual({
      id,
      version: '2.4.8',
      pendingRestart: postponed,
    });
    expect(request.confirm).toHaveBeenCalledOnce();
    expect(native.executed).toBe(!postponed);
  });

  it('does not start a cached install when its panel has already closed', async () => {
    const native = nativeInstall(id, true, true);
    host(native);
    const request = { ...options(), registerCancel: (cancel: (() => void) | null) => cancel?.() };
    await expect(installMainPlugin(url, request)).resolves.toBeNull();
    expect(native.install).not.toHaveBeenCalled();
    expect(request.confirm).not.toHaveBeenCalled();
    expect(native.executed).toBe(false);
  });

  it('blocks execution if parsed metadata changes after download confirmation', async () => {
    const native = nativeInstall();
    native.beforeStart = () => {
      native.addon.version = 'unconfirmed';
    };
    host(native);
    const request = options();
    await expect(installMainPlugin(url, request)).rejects.toThrow('identity or compatibility');
    expect(request.confirm).toHaveBeenCalledOnce();
    expect(native.executed).toBe(false);
    expect(native.cancel).not.toHaveBeenCalled();
  });

  it('installs the selected native update without changing disabled or auto-update preferences', async () => {
    const native = nativeInstall();
    const addon = {
      id,
      type: 'extension',
      userDisabled: true,
      applyBackgroundUpdates: 0,
      findUpdates(listener: {
        onUpdateAvailable: (addon: unknown, install: unknown) => void;
        onUpdateFinished: (addon: unknown, status: number) => void;
      }) {
        listener.onUpdateAvailable(addon, native);
        listener.onUpdateFinished(addon, 0);
      },
    };
    host(native, addon);
    await expect(updateMainPlugin(options())).resolves.toEqual({
      id,
      version: '2.4.8',
      pendingRestart: false,
    });
    expect(addon.userDisabled).toBe(true);
    expect(addon.applyBackgroundUpdates).toBe(0);
  });
});

describe('extension lifecycle guards', () => {
  it('uses native restart bits and does not expose Neo as removable or disableable', async () => {
    const manager = host(nativeInstall());
    const pendingMasks = [
      manager.PENDING_ENABLE,
      manager.PENDING_DISABLE,
      manager.PENDING_UNINSTALL,
      manager.PENDING_INSTALL,
      manager.PENDING_UPGRADE,
      0,
    ];
    manager.getAddonsByTypes.mockResolvedValueOnce([
      ...pendingMasks.map((pendingOperations, index) => ({
        id: `${index}@example.com`,
        type: 'extension',
        pendingOperations,
        permissions: manager.PERM_CAN_UNINSTALL,
      })),
      { id: neoId, type: 'extension', permissions: 7 },
      { id: 'theme@example.com', type: 'theme', pendingOperations: manager.PENDING_INSTALL },
    ]);

    const snapshots = await mainInstalledPlugins();
    expect(snapshots.map(({ pendingRestart }) => pendingRestart)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(snapshots[0]).toMatchObject({ canUninstall: true });
    expect(snapshots.at(-1)).toMatchObject({ id: neoId, canUninstall: false, canDisable: false });
  });

  it('leaves protected Neo and non-removable addons untouched', async () => {
    const uninstall = vi.fn();
    const disable = vi.fn();
    const manager = host(nativeInstall(), {
      id,
      type: 'extension',
      permissions: 4,
      uninstall,
      disable,
    });
    await expect(uninstallMainPlugin(id)).rejects.toMatchObject({ code: 'permission' });
    manager.getAddonByID.mockClear();
    await expect(uninstallMainPlugin(neoId)).rejects.toMatchObject({ code: 'protected' });
    await expect(setMainPluginEnabled(neoId, false)).rejects.toMatchObject({ code: 'protected' });
    expect(manager.getAddonByID).not.toHaveBeenCalled();
    expect(uninstall).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });

  it('uninstalls through AddonManager and requires restart only for a remaining pending uninstall', async () => {
    for (const pendingRestart of [false, true]) {
      const addon = {
        id,
        type: 'extension',
        permissions: 1,
        pendingOperations: 0,
        uninstall: vi.fn(),
      };
      const manager = host(nativeInstall(), addon);
      addon.uninstall.mockImplementation(async () => {
        addon.pendingOperations = manager.PENDING_UNINSTALL;
        if (!pendingRestart) manager.getAddonByID.mockResolvedValueOnce(null);
      });
      await expect(uninstallMainPlugin(id)).resolves.toEqual({ pendingRestart });
      expect(addon.uninstall).toHaveBeenCalledExactlyOnceWith();
    }
  });

  it('returns the actual manifest identity and version for a new package', async () => {
    const actualID = 'new@example.com';
    const native = nativeInstall(actualID);
    host(native);
    await expect(installMainPlugin(url, { ...options(), id: undefined })).resolves.toEqual({
      id: actualID,
      version: '2.4.8',
      pendingRestart: false,
    });
  });

  it('vetoes overwrites and Neo even when their actual IDs were not supplied', async () => {
    const existing = nativeInstall();
    existing.existingAddon = { ...existing.addon };
    for (const [native, code] of [
      [existing, 'already-installed'],
      [nativeInstall(neoId), 'protected'],
    ] as const) {
      host(native);
      const request = { ...options(), id: undefined };
      await expect(installMainPlugin(url, request)).rejects.toMatchObject({ code });
      expect(request.confirm).not.toHaveBeenCalled();
      expect(native.executed).toBe(false);
    }
    const manager = host(nativeInstall(neoId));
    await expect(
      installMainPlugin(url, { ...options(), id: neoId, upgrade: true }),
    ).rejects.toMatchObject({ code: 'protected' });
    expect(manager.getInstallForURL).not.toHaveBeenCalled();
  });

  it('upgrades only the expected installed ID and only to a strictly newer manifest version', async () => {
    const olderVersion = '2.4.7';
    const oldVersion = '2.4.8pre';
    const newVersion = '2.4.8';
    const versionOrder = [olderVersion, oldVersion, newVersion];
    const compare = vi.fn(
      (left: string, right: string) => versionOrder.indexOf(left) - versionOrder.indexOf(right),
    );
    vi.stubGlobal('Services', { vc: { compare } });
    expect(compareMainPluginVersions(oldVersion, newVersion)).toBe(-1);
    expect(compare).toHaveBeenCalledWith(oldVersion, newVersion);

    const installed = { id, type: 'extension', version: oldVersion };
    const request = { ...options(), upgrade: true } as const;
    for (const [packageId, packageVersion, code] of [
      [id, oldVersion, 'not-newer'],
      [id, olderVersion, 'not-newer'],
      ['other@example.com', newVersion, 'identity'],
      [id, newVersion, null],
    ] as const) {
      const native = nativeInstall(packageId);
      native.existingAddon = installed;
      native.addon.version = packageVersion;
      host(native, installed);
      const result = installMainPlugin(url, request);
      if (code) await expect(result).rejects.toMatchObject({ code });
      else
        await expect(result).resolves.toEqual({ id, version: newVersion, pendingRestart: false });
      expect(native.executed).toBe(!code);
    }
  });

  it('honors a native policy that disables XPI installation', async () => {
    const manager = host(nativeInstall());
    manager.isInstallEnabled.mockReturnValue(false);
    await expect(installMainPlugin(url, options())).rejects.toMatchObject({ code: 'permission' });
    expect(manager.getInstallForURL).not.toHaveBeenCalled();
  });

  it('does not check or replace a plugin when the host disallows upgrades', async () => {
    const findUpdates = vi.fn();
    const manager = host(nativeInstall(), { id, type: 'extension', permissions: 0, findUpdates });
    Object.assign(manager, { PERM_CAN_UPGRADE: 8 });
    await expect(updateMainPlugin(options())).rejects.toMatchObject({ code: 'permission' });
    await expect(installMainPlugin(url, { ...options(), upgrade: true })).rejects.toMatchObject({
      code: 'permission',
    });
    expect(findUpdates).not.toHaveBeenCalled();
    expect(manager.getInstallForURL).not.toHaveBeenCalled();
  });

  it('maps Gecko download errors without executing any failed package', async () => {
    const native = nativeInstall();
    const manager = host(native);
    for (const [error, code] of [
      [manager.ERROR_NETWORK_FAILURE, 'network'],
      [manager.ERROR_SIGNEDSTATE_REQUIRED, 'signature'],
      [manager.ERROR_BLOCKLISTED, 'blocked'],
      [manager.ERROR_INCOMPATIBLE, 'incompatible'],
      [manager.ERROR_INCORRECT_ID, 'identity'],
      [manager.ERROR_INCORRECT_HASH, 'invalid-package'],
    ] as const) {
      native.error = error;
      native.install.mockImplementation(() => native.failDownload());
      await expect(installMainPlugin(url, options())).rejects.toMatchObject({ code });
      expect(native.executed).toBe(false);
    }
  });

  it('rejects non-extensions, app-incompatible and embedder-disabled packages before execution', async () => {
    for (const [patch, code] of [
      [{ type: 'theme' }, 'invalid-package'],
      [{ appDisabled: true }, 'incompatible'],
      [{ embedderDisabled: true }, 'blocked'],
      [{ blocklistState: 2 }, 'blocked'],
    ] as const) {
      const native = nativeInstall();
      Object.assign(native.addon, patch);
      host(native);
      await expect(installMainPlugin(url, options())).rejects.toMatchObject({ code });
      expect(native.executed).toBe(false);
    }
  });

  it('does not report success when Zotero blocks the published addon', async () => {
    const native = nativeInstall();
    native.beforeEnd = () => {
      native.addon.blocklistState = 2;
    };
    host(native);
    await expect(installMainPlugin(url, options())).rejects.toMatchObject({ code: 'blocked' });
    expect(native.executed).toBe(true);
  });

  it('preserves a typed rejection from the synchronous trust guard', async () => {
    const native = nativeInstall();
    host(native);
    const rejection = new MainPluginError('invalid-package', 'Unexpected pinned version');
    const confirm = vi.fn(() => {
      throw rejection;
    });
    await expect(installMainPlugin(url, options(confirm))).rejects.toBe(rejection);
    expect(native.executed).toBe(false);
  });
});

describe('native-first update source discovery', () => {
  it('only falls back on a missing native source, not an actual address failing', async () => {
    const native = nativeInstall();
    let status = 0;
    const addon = {
      id,
      type: 'extension',
      updateURL: null as string | null,
      findUpdates: vi.fn(
        (listener: { onUpdateFinished: (addon: unknown, status: number) => void }) => {
          listener.onUpdateFinished(addon, status);
        },
      ),
    };
    const manager = host(native, addon);
    const request = { ...options(), reportMissingSource: true, requireHTTPS: true } as const;
    await expect(updateMainPlugin(request)).resolves.toBe('no-source');
    expect(addon.findUpdates).toHaveBeenCalledTimes(1);

    status = manager.UPDATE_STATUS_DOWNLOAD_ERROR;
    await expect(updateMainPlugin(options())).rejects.toMatchObject({ code: 'network' });
    await expect(updateMainPlugin(request)).resolves.toBe('no-source');

    vi.stubGlobal('Services', { prefs: { getCharPref: () => 'https://example.com/default' } });
    await expect(updateMainPlugin(request)).rejects.toMatchObject({ code: 'network' });
    status = 0;
    await expect(updateMainPlugin(request)).resolves.toBe('no-update');

    addon.updateURL = 'https://example.com/update';
    status = manager.UPDATE_STATUS_SECURITY_ERROR;
    await expect(updateMainPlugin(request)).rejects.toMatchObject({ code: 'signature' });
    status = 0;
    await expect(updateMainPlugin(request)).resolves.toBe('no-update');
    expect(manager.getInstallForURL).not.toHaveBeenCalled();
  });

  it('does not fetch a non-HTTPS source in the panel paths', async () => {
    const native = nativeInstall();
    const findUpdates = vi.fn(
      (listener: {
        onUpdateAvailable: (addon: unknown, install: unknown) => void;
        onUpdateFinished: (addon: unknown, status: number) => void;
      }) => {
        listener.onUpdateAvailable({}, native);
        listener.onUpdateFinished({}, 0);
      },
    );
    const addon = { id, type: 'extension', updateURL: 'http://example.com/update', findUpdates };
    const manager = host(native, addon);
    const request = { ...options(), requireHTTPS: true } as const;
    await expect(updateMainPlugin(request)).rejects.toMatchObject({ code: 'insecure-source' });
    expect(findUpdates).not.toHaveBeenCalled();

    const insecureXPI = 'http://example.com/addon.xpi';
    await expect(installMainPlugin(insecureXPI, request)).rejects.toMatchObject({
      code: 'insecure-source',
    });
    expect(manager.getInstallForURL).not.toHaveBeenCalled();

    addon.updateURL = 'https://example.com/update';
    native.sourceURI.spec = insecureXPI;
    await expect(updateMainPlugin(request)).rejects.toMatchObject({ code: 'insecure-source' });
    expect(findUpdates).toHaveBeenCalledOnce();
    expect(native.install).not.toHaveBeenCalled();
  });
});
