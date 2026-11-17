import type { SettingsAdapter } from './contracts';
import { BuiltinSettingsAdapter } from './adapters/adapter';

/** Construct without touching the native host or reading the addon version before initialization. */
export function createSettingsAdapters(neoVersion: () => string): readonly SettingsAdapter[] {
  return [
    new BuiltinSettingsAdapter('zotero', 'Zotero', neoVersion),
    new BuiltinSettingsAdapter('zotero-neo', 'Zotero Neo', neoVersion),
  ];
}
