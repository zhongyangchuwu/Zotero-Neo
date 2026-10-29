import { modulePreferenceKey, type ModuleFlags } from '../core/module-runtime';
import type { PreferenceReader } from '../core/preferences';
import { BUILTIN_MODULES } from '../modules';

const STARTUP_FLAGS = Symbol.for('zotero-neo.startup-module-flags');
type ModuleStartupHost = typeof Zotero & { readonly [STARTUP_FLAGS]?: string };

/**
 * Zotero's application object survives a Neo reload but not a Zotero restart.
 * Keep only a primitive snapshot across compartments; no window, listener or API survives.
 */
export function moduleStartupFlags(preferences: PreferenceReader): ModuleFlags {
  const host = Zotero as ModuleStartupHost;
  const saved = host[STARTUP_FLAGS];
  if (saved !== undefined) return Object.freeze(JSON.parse(saved) as ModuleFlags);
  const flags = Object.freeze(
    Object.fromEntries(
      BUILTIN_MODULES.map(({ id }) => [
        id,
        preferences.get(modulePreferenceKey(id), true) === true,
      ]),
    ) as ModuleFlags,
  );
  Object.defineProperty(host, STARTUP_FLAGS, { value: JSON.stringify(flags) });
  return flags;
}
