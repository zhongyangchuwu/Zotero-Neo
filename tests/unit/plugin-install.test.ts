import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMainPlugin, updateMainPlugin } from '../../src/toolkit/main/plugins';

const id = 'zoteropdftranslate@euclpts.com';
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
    pendingOperations: 0,
  };
  const native = {
    addon,
    state: cached ? 3 : 0,
    sourceURI: { spec: url },
    error: 0,
    executed: false,
    beforeStart: null as (() => void) | null,
    addListener(value: typeof listener) {
      listener = value;
    },
    removeListener(value: typeof listener) {
      if (listener === value) listener = {};
    },
    cancel: vi.fn(() => listener.onDownloadCancelled?.()),
    resumeDownload() {
      native.state = 3;
      if (listener.onDownloadEnded?.(native as never) === false) return;
      native.startExecution();
    },
    startExecution() {
      native.state = 5;
      native.beforeStart?.();
      if (listener.onInstallStarted?.(native as never) === false) {
        native.state = 3;
        listener.onInstallCancelled?.();
        return;
      }
      native.executed = true;
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
    STATE_AVAILABLE: 0,
    STATE_DOWNLOADED: 3,
    UPDATE_WHEN_USER_REQUESTED: 1,
    UPDATE_STATUS_NO_ERROR: 0,
    PENDING_INSTALL: 8,
    PENDING_UPGRADE: 16,
    getAddonByID: vi.fn(async () => addon),
    getInstallForURL: vi.fn(async () => install),
  };
  vi.stubGlobal('ChromeUtils', { importESModule: () => ({ AddonManager: manager }) });
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

  it('confirms a cached update exactly once before it executes', async () => {
    const native = nativeInstall(id, true, true);
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
    await expect(updateMainPlugin(request)).resolves.toEqual({ pendingRestart: false });
    expect(request.confirm).toHaveBeenCalledOnce();
    expect(native.executed).toBe(true);
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
    await expect(updateMainPlugin(options())).resolves.toEqual({ pendingRestart: false });
    expect(addon.userDisabled).toBe(true);
    expect(addon.applyBackgroundUpdates).toBe(0);
  });
});
