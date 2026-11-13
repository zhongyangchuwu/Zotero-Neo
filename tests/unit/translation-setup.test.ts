import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasTranslateForZoteroConfiguration } from '../../src/platform/translate-for-zotero-settings-v248';
import {
  prepareTranslationDependency,
  readTranslationDependency,
} from '../../src/modules/translation/setup';
import {
  TRANSLATE_PLUGIN_ID,
  TRANSLATE_PLUGIN_HASH,
  TRANSLATE_PLUGIN_INSTALL_URL,
} from '../../src/modules/translation/dependency';

afterEach(() => vi.unstubAllGlobals());

type Listener = Record<string, (...args: never[]) => unknown>;

function host(initial: { version: string; enabled: boolean } | null = null) {
  let listener: Listener = {};
  let current = true;
  const preferences = new Map<string, unknown>();
  const writes = vi.fn((key: string, value: unknown) => preferences.set(key, value));
  const runtime = { api: { getVersion: () => '2.4.8' }, data: { translate: { queue: [] } } };
  const addon = {
    id: TRANSLATE_PLUGIN_ID,
    name: 'Translate',
    version: initial?.version ?? '2.4.8',
    type: 'extension',
    isCompatible: true,
    appDisabled: false,
    isActive: initial?.enabled ?? true,
    permissions: 1,
    pendingOperations: 0,
    enable: vi.fn(async () => {
      addon.isActive = true;
    }),
  };
  let installed = !!initial;
  const native = {
    addon,
    state: 0,
    sourceURI: { spec: TRANSLATE_PLUGIN_INSTALL_URL },
    error: 0,
    executed: false,
    beforeStart: undefined as (() => void) | undefined,
    addListener(value: Listener) {
      listener = value;
    },
    removeListener(value: Listener) {
      if (listener === value) listener = {};
    },
    cancel: vi.fn(() => listener.onDownloadCancelled?.()),
    install: vi.fn(() => {}),
    download() {
      if (listener.onDownloadEnded?.(native as never) === false) return;
      native.beforeStart?.();
      if (listener.onInstallStarted?.(native as never) === false) return;
      native.executed = true;
      installed = true;
      listener.onInstallEnded?.(native as never, addon as never);
    },
  };
  const manager = {
    PERM_CAN_ENABLE: 1,
    PERM_CAN_DISABLE: 2,
    PENDING_INSTALL: 8,
    PENDING_UPGRADE: 16,
    STATE_AVAILABLE: 0,
    STATE_DOWNLOADED: 3,
    getAddonByID: vi.fn(async () => (installed ? addon : null)),
    getAddonsByTypes: vi.fn(async () => (installed ? [addon] : [])),
    getInstallForURL: vi.fn(async () => native),
  };
  vi.stubGlobal('ChromeUtils', { importESModule: () => ({ AddonManager: manager }) });
  vi.stubGlobal('Services', {
    prefs: { prefHasUserValue: (key: string) => preferences.has(key) },
  });
  vi.stubGlobal('Zotero', { Prefs: { set: writes }, PreferencePanes: {}, PDFTranslate: runtime });
  const confirmInstall = vi.fn(() => true);
  const confirmEnable = vi.fn(() => true);
  let cancel: (() => void) | null = null;
  const options = {
    language: 'zh-CN' as const,
    isCurrent: () => current,
    confirmDownload: vi.fn(() => true),
    confirmInstall,
    confirmEnable,
    progress: vi.fn(),
    registerCancel: (value: (() => void) | null) => {
      cancel = value;
    },
  };
  return {
    addon,
    native,
    manager,
    writes,
    preferences,
    options,
    confirmInstall,
    confirmEnable,
    retire: () => {
      current = false;
    },
    cancel: () => cancel?.(),
  };
}

async function startDownload(h: {
  options: Parameters<typeof prepareTranslationDependency>[0];
  native: { install: unknown };
}) {
  const pending = prepareTranslationDependency(h.options);
  await vi.waitFor(() => expect(h.native.install).toHaveBeenCalled());
  return { pending };
}

describe('translation dependency preparation', () => {
  it('does not contact the install source when download consent is declined', async () => {
    const h = host();
    h.options.confirmDownload.mockReturnValue(false);
    await expect(prepareTranslationDependency(h.options)).resolves.toBeNull();
    expect(h.manager.getInstallForURL).not.toHaveBeenCalled();
    expect(h.native.install).not.toHaveBeenCalled();
  });

  it('initializes an unset target even when provider startup writes its default language', async () => {
    const h = host();
    h.native.beforeStart = () =>
      h.preferences.set('extensions.zotero.ZoteroPDFTranslate.targetLanguage', 'en-US');
    const { pending } = await startDownload(h);
    expect(h.manager.getInstallForURL).toHaveBeenCalledWith(TRANSLATE_PLUGIN_INSTALL_URL, {
      hash: TRANSLATE_PLUGIN_HASH,
    });
    h.native.download();
    await expect(pending).resolves.toMatchObject({
      installed: true,
      version: '2.4.8',
      saveSupported: true,
      runtimeReady: true,
    });
    expect(h.confirmInstall).toHaveBeenCalledWith({
      name: 'Translate',
      version: '2.4.8',
      source: TRANSLATE_PLUGIN_INSTALL_URL,
    });
    expect(h.preferences.get('extensions.zotero.ZoteroPDFTranslate.enableAuto')).toBe(true);
    expect(h.preferences.get('extensions.zotero.ZoteroPDFTranslate.targetLanguage')).toBe('zh-CN');
  });

  it('preserves retained opt-out and target language when reinstalling an absent provider', async () => {
    const h = host();
    h.preferences.set('extensions.zotero.ZoteroPDFTranslate.enableAuto', false);
    h.preferences.set('extensions.zotero.ZoteroPDFTranslate.targetLanguage', 'fr-FR');
    const { pending } = await startDownload(h);
    h.native.download();
    await pending;
    expect(h.preferences.get('extensions.zotero.ZoteroPDFTranslate.enableAuto')).toBe(false);
    expect(h.preferences.get('extensions.zotero.ZoteroPDFTranslate.targetLanguage')).toBe('fr-FR');
  });

  it('initializes an unset target without reactivating retained automatic-translation opt-out', async () => {
    const h = host();
    h.preferences.set('extensions.zotero.ZoteroPDFTranslate.enableAuto', false);
    h.native.beforeStart = () =>
      h.preferences.set('extensions.zotero.ZoteroPDFTranslate.targetLanguage', 'en-US');
    const { pending } = await startDownload(h);
    h.native.download();
    await pending;
    expect(h.preferences.get('extensions.zotero.ZoteroPDFTranslate.enableAuto')).toBe(false);
    expect(h.preferences.get('extensions.zotero.ZoteroPDFTranslate.targetLanguage')).toBe('zh-CN');
  });

  it('does not write settings for an existing provider and requires consent to enable it', async () => {
    const h = host({ version: '2.4.8', enabled: false });
    h.confirmEnable.mockReturnValueOnce(false);
    await expect(prepareTranslationDependency(h.options)).resolves.toBeNull();
    expect(h.addon.enable).not.toHaveBeenCalled();
    await expect(prepareTranslationDependency(h.options)).resolves.toMatchObject({
      enabled: true,
      runtimeReady: true,
    });
    expect(h.confirmEnable).toHaveBeenCalledWith('Translate', '2.4.8');
    expect(h.writes).not.toHaveBeenCalled();
    expect(h.manager.getInstallForURL).not.toHaveBeenCalled();
  });

  it('does not replace an unsupported existing version or report its save capability', async () => {
    const h = host({ version: '2.5.0', enabled: true });
    await expect(prepareTranslationDependency(h.options)).resolves.toMatchObject({
      installed: true,
      saveSupported: false,
      runtimeReady: false,
    });
    expect(h.manager.getInstallForURL).not.toHaveBeenCalled();
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('never claims a native installation is ready without the supported runtime', async () => {
    host({ version: '2.4.8', enabled: true });
    vi.stubGlobal('Zotero', { PreferencePanes: {} });
    await expect(readTranslationDependency()).resolves.toMatchObject({
      saveSupported: true,
      runtimeReady: false,
    });
  });

  it('reports pending restart rather than an already loaded runtime as ready', async () => {
    const h = host({ version: '2.4.8', enabled: true });
    h.addon.pendingOperations = 8;
    await expect(readTranslationDependency()).resolves.toMatchObject({
      installed: true,
      saveSupported: true,
      pendingRestart: true,
      runtimeReady: false,
    });
  });

  it('initializes an English target only on successful new installation', async () => {
    const h = host();
    const pending = prepareTranslationDependency({ ...h.options, language: 'en' });
    await vi.waitFor(() => expect(h.native.install).toHaveBeenCalled());
    h.native.download();
    await pending;
    expect(h.preferences.get('extensions.zotero.ZoteroPDFTranslate.targetLanguage')).toBe('en-US');
  });

  it('rejects a manifest that is incompatible with the host before consent', async () => {
    const h = host();
    h.addon.isCompatible = false;
    const { pending } = await startDownload(h);
    h.native.download();
    await expect(pending).rejects.toThrow('identity or compatibility');
    expect(h.confirmInstall).not.toHaveBeenCalled();
    expect(h.native.executed).toBe(false);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('rejects wrong version or source before asking for consent', async () => {
    for (const invalid of ['version', 'source'] as const) {
      const h = host();
      if (invalid === 'version') h.addon.version = '2.5.0';
      else h.native.sourceURI.spec = 'https://example.com/plugin.xpi';
      const { pending } = await startDownload(h);
      h.native.download();
      await expect(pending).rejects.toThrow('version or source');
      expect(h.confirmInstall).not.toHaveBeenCalled();
      expect(h.native.executed).toBe(false);
      expect(h.writes).not.toHaveBeenCalled();
    }
  });

  it('cancels a download or declined consent without initializing', async () => {
    const cancelled = host();
    const first = await startDownload(cancelled);
    cancelled.cancel();
    await expect(first.pending).resolves.toBeNull();
    expect(cancelled.writes).not.toHaveBeenCalled();
    const declined = host();
    declined.confirmInstall.mockReturnValue(false);
    const second = await startDownload(declined);
    declined.native.download();
    await expect(second.pending).resolves.toBeNull();
    expect(declined.native.executed).toBe(false);
    expect(declined.writes).not.toHaveBeenCalled();
  });

  it('vetoes retired pre-consent UI but lets an admitted install finish without stale writes', async () => {
    const early = host();
    const first = await startDownload(early);
    early.retire();
    early.native.download();
    await expect(first.pending).resolves.toBeNull();
    expect(early.confirmInstall).not.toHaveBeenCalled();
    expect(early.native.executed).toBe(false);
    const admitted = host();
    const second = await startDownload(admitted);
    admitted.native.beforeStart = admitted.retire;
    admitted.native.download();
    await expect(second.pending).resolves.toBeNull();
    expect(admitted.native.executed).toBe(true);
    expect(admitted.writes).not.toHaveBeenCalled();
  });

  it('propagates enable failure and does not initialize existing settings', async () => {
    const h = host({ version: '2.4.8', enabled: false });
    h.addon.enable.mockRejectedValueOnce(new Error('enable failed'));
    await expect(prepareTranslationDependency(h.options)).rejects.toThrow('enable failed');
    expect(h.writes).not.toHaveBeenCalled();
  });
});

describe('retained upstream configuration', () => {
  it('detects only user-set values under the exact upstream namespace', () => {
    const keys = [
      'extensions.zotero.ZoteroPDFTranslate.enableAuto',
      'extensions.zotero.ZoteroPDFTranslate.targetLanguage',
    ];
    const prefHasUserValue = vi.fn(() => false);
    const getChildList = vi.fn(() => keys);
    vi.stubGlobal('Services', { prefs: { getChildList, prefHasUserValue } });
    expect(hasTranslateForZoteroConfiguration()).toBe(false);
    prefHasUserValue.mockReturnValueOnce(true);
    expect(hasTranslateForZoteroConfiguration()).toBe(true);
    expect(getChildList).toHaveBeenCalledWith('extensions.zotero.ZoteroPDFTranslate.');
  });
});
