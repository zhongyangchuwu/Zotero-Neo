import { captureTranslateForZotero248Initialization } from '../../platform/translate-for-zotero-settings-v248';
import { translateForZotero248 } from '../../platform/translate-for-zotero-v248';
import { installMainPlugin, mainInstalledPlugins, setMainPluginEnabled } from '../../toolkit/main';
import {
  TRANSLATE_PLUGIN_ID,
  TRANSLATE_PLUGIN_INSTALL_URL,
  TRANSLATE_SUPPORTED_VERSION,
} from './dependency';

export interface TranslationDependencySnapshot {
  readonly installed: boolean;
  readonly version: string | null;
  readonly enabled: boolean;
  readonly pendingRestart: boolean;
  readonly saveSupported: boolean;
  readonly runtimeReady: boolean;
}

export async function readTranslationDependency(): Promise<TranslationDependencySnapshot> {
  const plugin = (await mainInstalledPlugins()).find((entry) => entry.id === TRANSLATE_PLUGIN_ID);
  const saveSupported = plugin?.version === TRANSLATE_SUPPORTED_VERSION;
  return {
    installed: !!plugin,
    version: plugin?.version || null,
    enabled: plugin?.enabled ?? false,
    pendingRestart: plugin?.pendingRestart ?? false,
    saveSupported,
    runtimeReady: !!(
      saveSupported &&
      plugin?.enabled &&
      !plugin.pendingRestart &&
      translateForZotero248()
    ),
  };
}

export async function prepareTranslationDependency(options: {
  readonly language: 'en' | 'zh-CN';
  readonly isCurrent: () => boolean;
  readonly confirmInstall: (details: { name: string; version: string; source: string }) => boolean;
  readonly confirmEnable: (name: string, version: string) => boolean;
  readonly progress: (current: number, total: number) => void;
  readonly registerCancel: (cancel: (() => void) | null) => void;
}): Promise<TranslationDependencySnapshot | null> {
  if (!options.isCurrent()) return null;
  const plugin = (await mainInstalledPlugins()).find((entry) => entry.id === TRANSLATE_PLUGIN_ID);
  if (!options.isCurrent()) return null;

  if (!plugin) {
    const initialize = captureTranslateForZotero248Initialization(options.language);
    const result = await installMainPlugin(TRANSLATE_PLUGIN_INSTALL_URL, {
      id: TRANSLATE_PLUGIN_ID,
      confirm: (details) => {
        if (!options.isCurrent()) return false;
        if (
          details.version !== TRANSLATE_SUPPORTED_VERSION ||
          details.source !== TRANSLATE_PLUGIN_INSTALL_URL
        )
          throw new Error('Downloaded translation provider version or source validation failed');
        return options.confirmInstall(details);
      },
      progress: (current, total) => {
        if (options.isCurrent()) options.progress(current, total);
      },
      registerCancel: (cancel) => {
        if (options.isCurrent()) options.registerCancel(cancel);
        else cancel?.();
      },
    });
    if (!result || !options.isCurrent()) return null;
    initialize();
    const snapshot = await readTranslationDependency();
    if (!options.isCurrent()) return null;
    return result.pendingRestart
      ? { ...snapshot, pendingRestart: true, runtimeReady: false }
      : snapshot;
  }

  if (!plugin.enabled) {
    if (!options.confirmEnable(plugin.name, plugin.version)) return null;
    if (!options.isCurrent()) return null;
    await setMainPluginEnabled(TRANSLATE_PLUGIN_ID, true);
    if (!options.isCurrent()) return null;
  }
  const snapshot = await readTranslationDependency();
  return options.isCurrent() ? snapshot : null;
}
