import { PREFERENCE_PREFIX } from '../core/preferences';

// Deliberately profile-local. A direct download URL may contain a signed query.
const SOURCE_PREF = `${PREFERENCE_PREFIX}.extensionSources`;

export function readProfileExtensionSources(): string | null {
  return Services.prefs.getPrefType(SOURCE_PREF) === 0
    ? null
    : Services.prefs.getStringPref(SOURCE_PREF);
}

export function writeProfileExtensionSources(value: string | null): void {
  if (value === null) Services.prefs.clearUserPref(SOURCE_PREF);
  else Services.prefs.setStringPref(SOURCE_PREF, value);
}

export function parseExtensionURL(value: string): URL {
  if (typeof URL === 'undefined') Components.utils.importGlobalProperties(['URL']);
  return new URL(value);
}

export function createExtensionAbortController(): AbortController {
  if (typeof AbortController === 'undefined')
    Components.utils.importGlobalProperties(['AbortController']);
  return new AbortController();
}

export function fetchExtensionRelease(url: string, init: RequestInit): Promise<Response> {
  if (typeof fetch === 'undefined') Components.utils.importGlobalProperties(['fetch']);
  return fetch(url, init);
}

export function scheduleExtensionTimeout(callback: () => void, milliseconds: number): () => void {
  if (typeof setTimeout === 'function') {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  }
  const timers = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const timer = timers.setTimeout(callback, milliseconds);
  return () => timers.clearTimeout(timer);
}
