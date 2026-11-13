import {
  mainInstalledPlugins,
  setMainPluginEnabled,
  openMainPluginPreferences,
  launchMainURL,
} from '../../toolkit/main';
import {
  TRANSLATE_PLUGIN_ID as PROVIDER_ID,
  TRANSLATE_PLUGIN_INSTALL_URL,
} from '../translation/dependency';

export const ZOTERO_NEO_PLUGIN_ID = 'zotero-neo@zotero-neo';
export const TRANSLATE_PLUGIN_ID = PROVIDER_ID;
export const TRANSLATE_PLUGIN_URL = TRANSLATE_PLUGIN_INSTALL_URL;

export interface InstalledPlugin {
  readonly id: string;
  readonly installed?: boolean;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly pendingRestart?: boolean;
  readonly canEnable: boolean;
  readonly canDisable: boolean;
  readonly description: string;
  readonly homepageURL?: string;
  readonly repositoryURL?: string;
  readonly readmeURL?: string;
  readonly gitLogURL?: string;
  readonly preferencePaneID?: string;
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
  const plugins = await mainInstalledPlugins();
  const entries: InstalledPlugin[] = plugins.map((plugin) => ({
    ...plugin,
    installed: true,
    canDisable: plugin.id !== ZOTERO_NEO_PLUGIN_ID && plugin.canDisable,
    ...pluginInfoLinks(plugin.homepageURL),
  }));
  if (!entries.some((plugin) => plugin.id === TRANSLATE_PLUGIN_ID)) {
    const homepageURL = 'https://github.com/windingwind/zotero-pdf-translate';
    entries.push({
      id: TRANSLATE_PLUGIN_ID,
      name: 'Translate for Zotero',
      version: '',
      installed: false,
      enabled: false,
      canEnable: false,
      canDisable: false,
      description: 'Translate text in Zotero using Translate for Zotero.',
      preferencePaneID: undefined,
      ...pluginInfoLinks(homepageURL),
    });
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name, Zotero.locale));
}

export async function setPluginEnabled(pluginID: string, enabled: boolean): Promise<void> {
  if (!enabled && pluginID === ZOTERO_NEO_PLUGIN_ID) {
    throw new Error('Zotero Neo cannot disable itself from inside Plugin Manager');
  }

  await setMainPluginEnabled(pluginID, enabled);
}

export function openPluginPreferences(pluginID: string): boolean {
  return openMainPluginPreferences(pluginID);
}

export function openPluginInfoURL(url: string | undefined): boolean {
  const safe = safeHTTPURL(url);
  if (!safe) return false;
  return launchMainURL(safe);
}
