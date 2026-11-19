import { translateForZoteroApi } from '../../platform/translate-for-zotero';
import { installMainPlugin, mainInstalledPlugins, setMainPluginEnabled } from '../../toolkit/main';
import {
  TRANSLATE_PLUGIN_ID,
  TRANSLATE_PLUGIN_HASH,
  TRANSLATE_PLUGIN_INSTALL_URL,
  TRANSLATE_SUPPORTED_VERSION,
} from './dependency';

export interface TranslationDependencySnapshot {
  readonly installed: boolean;
  readonly version: string | null;
  readonly enabled: boolean;
  readonly canEnable: boolean;
  readonly canDisable: boolean;
  readonly hasSettings: boolean;
  readonly pendingRestart: boolean;
  readonly saveSupported: boolean;
  readonly selectionReady: boolean;
}

export async function readTranslationDependency(): Promise<TranslationDependencySnapshot> {
  const plugin = (await mainInstalledPlugins()).find((entry) => entry.id === TRANSLATE_PLUGIN_ID);
  const saveSupported = plugin?.version === TRANSLATE_SUPPORTED_VERSION;
  return {
    installed: !!plugin,
    version: plugin?.version || null,
    enabled: plugin?.enabled ?? false,
    canEnable: plugin?.canEnable ?? false,
    canDisable: plugin?.canDisable ?? false,
    hasSettings: !!plugin?.preferencePaneID,
    pendingRestart: plugin?.pendingRestart ?? false,
    saveSupported,
    selectionReady: !!(plugin?.enabled && !plugin.pendingRestart && translateForZoteroApi()),
  };
}

export async function prepareTranslationDependency(options: {
  readonly isCurrent: () => boolean;
  readonly confirmDownload: () => boolean;
  readonly confirmEnable: (name: string, version: string) => boolean;
  readonly progress: (current: number, total: number) => void;
  readonly registerCancel: (cancel: (() => void) | null) => void;
}): Promise<TranslationDependencySnapshot | null> {
  if (!options.isCurrent()) return null;
  const plugin = (await mainInstalledPlugins()).find((entry) => entry.id === TRANSLATE_PLUGIN_ID);
  if (!options.isCurrent()) return null;

  if (!plugin) {
    if (!options.confirmDownload() || !options.isCurrent()) return null;
    const result = await installMainPlugin(TRANSLATE_PLUGIN_INSTALL_URL, {
      id: TRANSLATE_PLUGIN_ID,
      hash: TRANSLATE_PLUGIN_HASH,
      confirm: (details) => {
        if (!options.isCurrent()) return false;
        if (
          details.version !== TRANSLATE_SUPPORTED_VERSION ||
          details.source !== TRANSLATE_PLUGIN_INSTALL_URL
        )
          throw new Error('Downloaded translation provider version or source validation failed');
        return true;
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
    const snapshot = await readTranslationDependency();
    if (!options.isCurrent()) return null;
    return result.pendingRestart
      ? { ...snapshot, pendingRestart: true, selectionReady: false }
      : snapshot;
  }

  if (!plugin.pendingRestart && !plugin.enabled) {
    if (!plugin.canEnable) throw new Error('Zotero does not allow this plugin to be enabled');
    if (!options.confirmEnable(plugin.name, plugin.version)) return null;
    if (!options.isCurrent()) return null;
    await setMainPluginEnabled(TRANSLATE_PLUGIN_ID, true);
    if (!options.isCurrent()) return null;
  }
  const snapshot = await readTranslationDependency();
  return options.isCurrent() ? snapshot : null;
}
