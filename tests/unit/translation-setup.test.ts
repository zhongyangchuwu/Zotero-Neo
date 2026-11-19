import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { ZoteroPreferenceStore } from '../../src/core/preference-store';
import { SettingsExtras } from '../../src/main/settings-extras';
import { TRANSLATION_EXTRA_PREFERENCE } from '../../src/modules/translation/selection-action';
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
  const runtime = { api: { translate: vi.fn() } };
  const addon = {
    id: TRANSLATE_PLUGIN_ID,
    name: 'Translate',
    version: initial?.version ?? '2.4.8',
    type: 'extension',
    isCompatible: true,
    appDisabled: false,
    isActive: initial?.enabled ?? true,
    permissions: 3,
    pendingOperations: 0,
    enable: vi.fn(async () => {
      addon.isActive = true;
    }),
    disable: vi.fn(async () => {
      addon.isActive = false;
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
    prefs: {
      getPrefType: (key: string) => (preferences.has(key) ? 128 : 0),
      getBoolPref: (key: string) => preferences.get(key),
      setBoolPref: writes,
      prefHasUserValue: (key: string) => preferences.has(key),
      addObserver() {},
      removeObserver() {},
    },
  });
  vi.stubGlobal('Zotero', { Prefs: { set: writes }, PreferencePanes: {}, PDFTranslate: runtime });
  const confirmEnable = vi.fn(() => true);
  let cancel: (() => void) | null = null;
  const options = {
    isCurrent: () => current,
    confirmDownload: vi.fn(() => true),
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

  it('validates and installs the pinned official package without changing upstream preferences', async () => {
    const h = host();
    const { pending } = await startDownload(h);
    expect(h.manager.getInstallForURL).toHaveBeenCalledWith(TRANSLATE_PLUGIN_INSTALL_URL, {
      hash: TRANSLATE_PLUGIN_HASH,
    });
    h.native.download();
    await expect(pending).resolves.toMatchObject({
      installed: true,
      version: '2.4.8',
      saveSupported: true,
      selectionReady: true,
    });
    expect(h.writes).not.toHaveBeenCalled();
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

  it('does not write settings for an existing provider and requires consent to enable it', async () => {
    const h = host({ version: '2.4.8', enabled: false });
    h.confirmEnable.mockReturnValueOnce(false);
    await expect(prepareTranslationDependency(h.options)).resolves.toBeNull();
    expect(h.addon.enable).not.toHaveBeenCalled();
    await expect(prepareTranslationDependency(h.options)).resolves.toMatchObject({
      enabled: true,
      selectionReady: true,
    });
    expect(h.confirmEnable).toHaveBeenCalledWith('Translate', '2.4.8');
    expect(h.writes).not.toHaveBeenCalled();
    expect(h.manager.getInstallForURL).not.toHaveBeenCalled();
  });

  it('reuses other installed versions when the public API is ready, without allowing automatic saving', async () => {
    const h = host({ version: '2.5.0', enabled: true });
    await expect(prepareTranslationDependency(h.options)).resolves.toMatchObject({
      installed: true,
      saveSupported: false,
      selectionReady: true,
    });
    expect(h.manager.getInstallForURL).not.toHaveBeenCalled();
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('does not report selection translation ready without the public API', async () => {
    host({ version: '2.4.8', enabled: true });
    vi.stubGlobal('Zotero', { PreferencePanes: {} });
    await expect(readTranslationDependency()).resolves.toMatchObject({
      saveSupported: true,
      selectionReady: false,
    });
  });

  it('reports pending restart rather than an already loaded runtime as ready', async () => {
    const h = host({ version: '2.4.8', enabled: true });
    h.addon.pendingOperations = 8;
    await expect(readTranslationDependency()).resolves.toMatchObject({
      installed: true,
      saveSupported: true,
      pendingRestart: true,
      selectionReady: false,
    });
  });

  it('rejects an incompatible downloaded manifest before installation', async () => {
    const h = host();
    h.addon.isCompatible = false;
    const { pending } = await startDownload(h);
    h.native.download();
    await expect(pending).rejects.toThrow('identity or compatibility');
    expect(h.native.executed).toBe(false);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('rejects an unexpected version or source before installation', async () => {
    for (const invalid of ['version', 'source'] as const) {
      const h = host();
      if (invalid === 'version') h.addon.version = '2.5.0';
      else h.native.sourceURI.spec = 'https://example.com/plugin.xpi';
      const { pending } = await startDownload(h);
      h.native.download();
      await expect(pending).rejects.toThrow('version or source');
      expect(h.native.executed).toBe(false);
      expect(h.writes).not.toHaveBeenCalled();
    }
  });

  it('allows the download to be cancelled without activating the plugin', async () => {
    const cancelled = host();
    const first = await startDownload(cancelled);
    cancelled.cancel();
    await expect(first.pending).resolves.toBeNull();
    expect(cancelled.native.executed).toBe(false);
    expect(cancelled.writes).not.toHaveBeenCalled();
  });

  it('vetoes a download when the initiating settings page is retired before admission', async () => {
    const early = host();
    const first = await startDownload(early);
    early.retire();
    early.native.download();
    await expect(first.pending).resolves.toBeNull();
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

describe('Selection translation Extra', () => {
  const fullKey = `extensions.zotero-neo.${TRANSLATION_EXTRA_PREFERENCE}`;
  const toggle = (page: SettingsExtras, value: boolean) =>
    page.dispatch({ type: 'value', id: 'translation.extra.enabled', value });
  const button = (page: SettingsExtras, id: string) =>
    page.dispatch({ type: 'action', id: `translation.${id}` });
  async function open(confirm = vi.fn(() => true)) {
    const page = new SettingsExtras(
      { confirm } as unknown as MainWindow,
      new ZoteroPreferenceStore(),
      'en',
      () => {},
    );
    await vi.waitFor(() =>
      expect(
        page.model().groups[1]?.fields.find(({ id }) => id === 'translation.check'),
      ).toMatchObject({
        disabled: false,
      }),
    );
    return { page, confirm };
  }

  it('requests consent once and only enables the Extra after the verified install succeeds', async () => {
    const h = host();
    h.preferences.set('extensions.zotero.ZoteroPDFTranslate.enableAuto', false);
    const { page, confirm } = await open();
    try {
      toggle(page, true);
      await vi.waitFor(() => expect(h.native.install).toHaveBeenCalledOnce());
      expect(h.preferences.has(fullKey)).toBe(false);
      expect(confirm).toHaveBeenCalledOnce();
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining(TRANSLATE_PLUGIN_INSTALL_URL));
      h.native.download();
      await vi.waitFor(() => expect(h.preferences.get(fullKey)).toBe(true));
      expect(confirm).toHaveBeenCalledOnce();
      expect(h.writes.mock.calls).toEqual([[fullKey, true]]);

      toggle(page, false);
      expect(h.preferences.get(fullKey)).toBe(false);
      expect(h.addon.isActive).toBe(true);
      expect(h.addon.disable).not.toHaveBeenCalled();
    } finally {
      page.dispose();
    }
  });

  it('does not persist the Extra on decline, and installs only the provider on a separate request', async () => {
    const h = host();
    const { page, confirm } = await open(vi.fn(() => false));
    try {
      toggle(page, true);
      await vi.waitFor(() => expect(page.model().status?.text).toMatch(/cancelled/i));
      expect(h.manager.getInstallForURL).not.toHaveBeenCalled();
      expect(h.preferences.has(fullKey)).toBe(false);

      confirm.mockReturnValue(true);
      button(page, 'prepare');
      await vi.waitFor(() => expect(h.native.install).toHaveBeenCalledOnce());
      h.native.download();
      await vi.waitFor(() => expect(page.model().groups[1]?.description).toMatch(/ready for/i));
      expect(h.preferences.has(fullKey)).toBe(false);
    } finally {
      page.dispose();
    }
  });

  it('reuses the installed provider and leaves a requested Extra waiting after explicit provider disable', async () => {
    const h = host({ version: '2.5.0', enabled: true });
    const { page, confirm } = await open();
    try {
      toggle(page, true);
      await vi.waitFor(() => expect(h.preferences.get(fullKey)).toBe(true));
      expect(h.manager.getInstallForURL).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();

      button(page, 'disableProvider');
      await vi.waitFor(() =>
        expect(page.model().groups[1]?.description).toMatch(/disabled in zotero/i),
      );
      expect(h.preferences.get(fullKey)).toBe(true);
      expect(page.model().groups[0]?.fields[0]?.note).toMatch(/API is ready/);
      expect(confirm).toHaveBeenCalledOnce();
    } finally {
      page.dispose();
    }
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
