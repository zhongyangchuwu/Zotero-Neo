import { modulePreferenceKey, type ModuleFlags } from '../core/module-runtime';
import type { PreferenceReader } from '../core/preferences';
import { OPTIONAL_MODULE_IDS } from '../modules';

const STARTUP_FLAGS = Symbol.for('zotero-neo.startup-module-flags');
type ModuleStartupHost = typeof Zotero & { readonly [STARTUP_FLAGS]?: string };

/**
 * Zotero's application object survives a Neo reload but not a Zotero restart.
 * Keep only a primitive snapshot across compartments; no window, listener or API survives.
 */
export function moduleStartupFlags(preferences: PreferenceReader): ModuleFlags {
  const host = Zotero as ModuleStartupHost;
  const saved = host[STARTUP_FLAGS];
  if (saved !== undefined) {
    const previous = JSON.parse(saved) as ModuleFlags;
    return Object.freeze({
      'reader-hints': previous['reader-hints'],
      extensions: previous.extensions,
    });
  }
  const flags = Object.freeze(
    Object.fromEntries(
      OPTIONAL_MODULE_IDS.map((id) => [
        id,
        preferences.get(modulePreferenceKey(id), true) === true,
      ]),
    ) as ModuleFlags,
  );
  Object.defineProperty(host, STARTUP_FLAGS, { value: JSON.stringify(flags) });
  return flags;
}
