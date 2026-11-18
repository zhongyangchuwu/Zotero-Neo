import { mainInstalledPlugins } from './plugins';

export interface MainTemplatePlugin {
  readonly id: string;
  readonly label: string;
  readonly version: string;
  readonly available: boolean;
  readonly defaults: readonly { readonly source: string; readonly text: string }[];
  readonly panes: readonly { readonly source: string; readonly text: string }[];
  readonly issues: readonly string[];
  /** Exact app-owned defaults, independent of the supported snapshot fields; null fails closed. */
  readonly nativePreferenceKeys?: readonly string[] | null;
}

interface LoadedPane {
  readonly pluginID?: string;
  readonly src?: string;
  readonly loaded?: boolean;
  readonly container?: Element;
}

interface NativePreferences {
  readonly panes: ReadonlyMap<string, LoadedPane>;
  readonly _observerSymbols?: ReadonlyMap<Element, unknown>;
  navigateToPane(id: string): Promise<void>;
}

const PREFERENCES_URI = 'chrome://zotero/content/preferences/preferences.xhtml';

/** Open only the explicitly requested plugin's native panes. Return binding names, never values. */
export async function scanMainSettingsBindings(
  pluginID: string,
  current: () => boolean,
): Promise<ReadonlySet<string>> {
  const bindings = new Set<string>();
  const panes = Zotero.PreferencePanes.pluginPanes.flatMap(({ pluginID: owner, id, src }) =>
    owner === pluginID && id && src ? [{ id, src }] : [],
  );
  if (!panes.length || panes.length > 16 || !current()) return bindings;
  const internal = Zotero.Utilities.Internal as unknown as { openPreferences?(): Window };
  const mediator = Services.wm as unknown as { getMostRecentWindow(type: string): Window | null };
  const existing = mediator.getMostRecentWindow('zotero:pref');
  const win = existing ?? internal.openPreferences?.();
  if (!win) return bindings;
  const native = () => {
    if (win.closed || !current() || win.document.documentURI !== PREFERENCES_URI) return;
    return (win as Window & { Zotero_Preferences?: NativePreferences }).Zotero_Preferences;
  };
  const deadline = Date.now() + 6000;
  const controller = async (): Promise<NativePreferences | undefined> => {
    while (!win.closed && current() && Date.now() < deadline) {
      const host = native();
      if (host && panes.every((pane) => host.panes.has(pane.id))) return host;
      await Zotero.Promise.delay(25);
    }
  };
  try {
    const host = await controller();
    if (!host?._observerSymbols) throw new Error('The native settings window is unavailable');
    for (const pane of panes) {
      if (native() !== host) throw new Error('The settings scan was interrupted');
      const entry = host.panes.get(pane.id);
      if (entry?.pluginID !== pluginID || entry.src !== pane.src)
        throw new Error('The registered settings pane changed');
      if (!entry.loaded) {
        let result: 'loaded' | 'failed' | undefined;
        void host.navigateToPane(pane.id).then(
          () => {
            result = 'loaded';
          },
          () => {
            result = 'failed';
          },
        );
        while (!result && native() === host && Date.now() < deadline) {
          await Zotero.Promise.delay(25);
        }
        if (result !== 'loaded') throw new Error('The native settings pane did not load');
      }
      if (native() !== host || !entry.loaded || !entry.container?.isConnected)
        throw new Error('The native settings pane was closed or replaced');
      const controls = entry.container.querySelectorAll('[preference]');
      if (controls.length > 2048) throw new Error('The native settings pane has too many bindings');
      for (const node of controls) {
        if (node?.nodeType !== 1) continue;
        const control = node as Element;
        const key = control.getAttribute('preference');
        if (key && key.length <= 512 && host._observerSymbols.has(control)) bindings.add(key);
      }
      if (bindings.size > 2048) throw new Error('Too many native settings bindings');
    }
    return bindings;
  } finally {
    if (!existing && !win.closed) win.close();
  }
}
const MAX_SOURCE = 512 * 1024;
const MAX_PLUGINS = 256;
interface TemplateDOMHost {
  readonly TextEncoder: typeof TextEncoder;
  readonly TextDecoder: typeof TextDecoder;
  readonly fetch: typeof fetch;
  readonly closed?: boolean;
}
function templateDOMHost(): TemplateDOMHost {
  // Bootstrap has no DOM constructors; only an initialized, live Main window owns this boundary.
  const host = Zotero.getMainWindow() as unknown as Partial<TemplateDOMHost> | null;
  if (
    !host ||
    host.closed === true ||
    typeof host.TextEncoder !== 'function' ||
    typeof host.TextDecoder !== 'function' ||
    typeof host.fetch !== 'function'
  )
    throw new Error('An initialized Main window is required for plugin template discovery');
  return host as TemplateDOMHost;
}
interface BundleAddon {
  readonly id: string;
  readonly isCompatible?: boolean;
  readonly appDisabled?: boolean;
  getResourceURI(path: string): { readonly spec: string };
}
interface TemplateAddonManager {
  getAddonByID(id: string): Promise<BundleAddon | null>;
  addAddonListener(listener: object): void;
  removeAddonListener(listener: object): void;
}
function manager(): TemplateAddonManager {
  // Zotero's privileged module loader exposes this stable host boundary.
  const module = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs') as {
    AddonManager: TemplateAddonManager;
  };
  return module.AddonManager;
}
function resolvedLocalURI(source: string): string {
  let uri = Services.io.newURI(source);
  if (uri.scheme === 'chrome') {
    const factories = Components.classes as unknown as Record<
      string,
      { getService(iid: unknown): nsIChromeRegistry }
    >;
    const registry = factories['@mozilla.org/chrome/chrome-registry;1']!.getService(
      Components.interfaces.nsIChromeRegistry,
    );
    uri = registry.convertChromeURL(uri);
  }
  if (uri.scheme === 'resource') {
    const handler = Services.io.getProtocolHandler('resource');
    if (!handler.QueryInterface) throw new Error('Resource URL resolution is unavailable');
    const protocol = handler.QueryInterface(Components.interfaces.nsIResProtocolHandler);
    uri = Services.io.newURI(protocol.resolveURI(uri));
  }
  if (!/^(?:file:\/\/\/|jar:file:\/\/\/)/u.test(uri.spec))
    throw new Error('Not a local installed bundle');
  const decoded = decodeURIComponent(uri.spec);
  if (/(?:^|\/)\.\.(?:\/|$)|[\r\n\0]/u.test(decoded)) throw new Error('Unsafe bundled resource');
  return uri.spec;
}
async function sourceText(
  source: string,
  root: string,
): Promise<{ readonly text: string; readonly byteLength: number }> {
  const local = resolvedLocalURI(source);
  if (!local.startsWith(root.endsWith('/') ? root : `${root}/`))
    throw new Error('Preference source is not owned by the installed plugin');
  return boundedSourceText(local);
}
async function boundedSourceText(
  source: string,
): Promise<{ readonly text: string; readonly byteLength: number }> {
  const host = templateDOMHost();
  const response = await host.fetch(source);
  if (!response.ok) throw new Error('Bundled preference source is unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Bundled preference source cannot be read');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_SOURCE) throw new Error('Bundled preference source exceeds size limit');
      chunks.push(result.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { text: new host.TextDecoder('utf-8', { fatal: true }).decode(bytes), byteLength: length };
}
/** Tokenize trusted application defaults for names only; values are never evaluated. */
function nativePreferenceKeys(text: string): readonly string[] {
  const keys = new Set<string>();
  const tokens =
    /(?:\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*')|([A-Za-z_$][\w$]*)|([\s\S])/guy;
  const significant: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    tokens.lastIndex = offset;
    const token = tokens.exec(text);
    if (!token) throw new Error('Application defaults cannot be tokenized');
    offset = tokens.lastIndex;
    if (token[1] || token[2] || token[3]) {
      const value = token[1] ?? token[2] ?? token[3]!;
      // Unrecognized string syntax cannot safely establish a complete inventory.
      if (value === '"' || value === "'" || value === '`')
        throw new Error('Unsupported application defaults string');
      significant.push(value);
    }
  }
  for (let index = 0; index < significant.length; index++) {
    if (!['pref', 'sticky_pref', 'user_pref'].includes(significant[index]!)) continue;
    if (significant[index + 1] !== '(') continue;
    const key = significant[index + 2];
    if (
      !key ||
      !/^(?:"[A-Za-z0-9_@{}.-]+"|'[A-Za-z0-9_@{}.-]+')$/u.test(key) ||
      significant[index + 3] !== ','
    )
      throw new Error('Application preference name is not a static literal');
    keys.add(key.slice(1, -1));
  }
  if (![...keys].some((key) => key.startsWith('extensions.zotero.')))
    throw new Error('Application preference inventory is unavailable');
  return Object.freeze([...keys].sort());
}
/** Read only installed bundle sources, never instantiate a preference pane or read user values. */
export async function mainSettingsTemplatePlugins(): Promise<readonly MainTemplatePlugin[]> {
  const inventory = await mainInstalledPlugins();
  if (inventory.length > MAX_PLUGINS) throw new Error('Plugin inventory exceeds size limit');
  const panes = Zotero.PreferencePanes.pluginPanes ?? [];
  const result: MainTemplatePlugin[] = [];
  let totalBytes = 0;
  let nativeKeys: readonly string[] | null = null;
  try {
    // This fixed app URI is trusted, unlike plugin-authored resource references.
    const source = await boundedSourceText('resource://app/defaults/preferences/zotero.js');
    nativeKeys = nativePreferenceKeys(source.text);
  } catch {
    // Plugin namespaces under extensions.zotero remain unavailable without app ownership evidence.
  }
  for (const plugin of inventory) {
    const addon = await manager().getAddonByID(plugin.id);
    const defaults: { source: string; text: string }[] = [];
    const sources: { source: string; text: string }[] = [];
    let sourceBytes = 0;
    const issues: string[] = [];
    if (!nativeKeys) issues.push('Native preference ownership inventory is unavailable');
    const available =
      !!addon &&
      addon.isCompatible === true &&
      !addon.appDisabled &&
      plugin.enabled &&
      !plugin.pendingRestart &&
      !!plugin.version;
    if (addon) {
      try {
        const root = resolvedLocalURI(addon.getResourceURI('').spec);
        for (const path of ['prefs.js', 'defaults/preferences/prefs.js']) {
          try {
            const result = await sourceText(addon.getResourceURI(path).spec, root);
            sourceBytes += result.byteLength;
            defaults.push({ source: path, text: result.text });
          } catch {
            /* Optional conventional default files; absence grants no ownership. */
          }
        }
        const registered = panes.filter((pane) => pane.pluginID === plugin.id);
        if (registered.length > 16) throw new Error('Too many preference panes');
        for (const pane of registered) {
          if (!pane.src) {
            issues.push('A registered pane has no static source');
            continue;
          }
          try {
            const uri = /^[a-z][a-z0-9+.-]*:/iu.test(pane.src)
              ? pane.src
              : addon.getResourceURI(pane.src).spec;
            const result = await sourceText(uri, root);
            sourceBytes += result.byteLength;
            sources.push({
              source: resolvedLocalURI(uri).slice(root.length).replace(/^\//u, ''),
              text: result.text,
            });
          } catch {
            issues.push('A registered pane is unavailable or is not a local owned bundle source');
          }
        }
      } catch {
        issues.push('Plugin bundle metadata is unavailable');
      }
    }
    if (!defaults.length) issues.push('No supported static bundled preference defaults were found');
    if (!sources.length) issues.push('No readable registered bundled preference panes were found');
    totalBytes += sourceBytes;
    if (sourceBytes > 2 * 1024 * 1024 || totalBytes > 16 * 1024 * 1024)
      throw new Error('Plugin source inventory exceeds size limit');
    result.push({
      id: plugin.id,
      label: plugin.name,
      version: plugin.version,
      available,
      defaults,
      panes: sources,
      issues,
      nativePreferenceKeys: nativeKeys,
    });
  }
  return result;
}
export function mainSettingsTemplatePreferenceType(
  key: string,
  defaultOnly = false,
): 'boolean' | 'number' | 'string' | null {
  const prefs = defaultOnly ? Services.prefs.getDefaultBranch('') : Services.prefs;
  const type = prefs.getPrefType(key);
  return type === Services.prefs.PREF_BOOL
    ? 'boolean'
    : type === Services.prefs.PREF_INT
      ? 'number'
      : type === Services.prefs.PREF_STRING
        ? 'string'
        : null;
}
/** SHA-256 of exact UTF-8 identity/source, not a display-name slug. */
export function mainSettingsTemplateDigest(text: string): string {
  const factories = Components.classes as unknown as Record<
    string,
    { createInstance(iid: unknown): nsICryptoHash }
  >;
  const hash = factories['@mozilla.org/security/hash;1']!.createInstance(
    Components.interfaces.nsICryptoHash,
  );
  const algorithm = hash.SHA256;
  if (algorithm === undefined) throw new Error('Native SHA-256 hashing is unavailable');
  hash.init(algorithm);
  const host = templateDOMHost();
  const bytes = new host.TextEncoder().encode(text);
  hash.update(bytes, bytes.length);
  return Array.from(hash.finish(false), (character) =>
    character.charCodeAt(0).toString(16).padStart(2, '0'),
  ).join('');
}
export function observeMainSettingsTemplatePlugins(invalidate: () => void): () => void {
  const host = manager();
  const listener = {
    onInstalled: invalidate,
    onUninstalled: invalidate,
    onEnabled: invalidate,
    onDisabled: invalidate,
    onEnabling: invalidate,
    onDisabling: invalidate,
    onInstalling: invalidate,
    onUninstalling: invalidate,
    onPropertyChanged: invalidate,
  };
  host.addAddonListener(listener);
  return () => host.removeAddonListener(listener);
}
