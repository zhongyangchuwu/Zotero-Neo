import { modulePreferenceKey, type ModuleFlags } from '../core/module-runtime';
import type { PreferenceReader } from '../core/preferences';
import { OPTIONAL_MODULE_DEFAULTS, OPTIONAL_MODULE_IDS } from '../modules';

const STARTUP_FLAGS = Symbol.for('zotero-neo.startup-module-flags');
type ModuleStartupHost = typeof Zotero & { readonly [STARTUP_FLAGS]?: string };

/**
 * Zotero's application object survives a Neo reload but not a Zotero restart.
 * Keep only a primitive snapshot across compartments; no window, listener or API survives.
 */
export function moduleStartupFlags(preferences: PreferenceReader): ModuleFlags {
  const host = Zotero as ModuleStartupHost;
  const saved = host[STARTUP_FLAGS];
  const previous = saved === undefined ? undefined : (JSON.parse(saved) as Partial<ModuleFlags>);
  const flags = Object.freeze(
    Object.fromEntries(
      OPTIONAL_MODULE_IDS.map((id) => [
        id,
        (previous
          ? previous[id]
          : preferences.get(modulePreferenceKey(id), OPTIONAL_MODULE_DEFAULTS[id])) === true,
      ]),
    ) as ModuleFlags,
  );
  if (saved === undefined)
    Object.defineProperty(host, STARTUP_FLAGS, { value: JSON.stringify(flags) });
  return flags;
}
