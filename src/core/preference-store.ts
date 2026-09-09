import { PREFERENCE_PREFIX, type PreferenceReader } from './preferences';

export interface PreferenceStore extends PreferenceReader {
  has(key: string): boolean;
  set(key: string, value: boolean | number | string): void;
  observe?(key: string, listener: () => void): () => void;
}

export class ZoteroPreferenceStore implements PreferenceStore {
  readonly #prefix: string;

  constructor(prefix = PREFERENCE_PREFIX) {
    this.#prefix = prefix;
  }

  #fullKey(key: string): string {
    return `${this.#prefix}.${key}`;
  }

  has(key: string): boolean {
    try {
      return Services.prefs.getPrefType(this.#fullKey(key)) !== 0;
    } catch {
      return false;
    }
  }

  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string {
    try {
      const fullKey = this.#fullKey(key);
      const type = Services.prefs.getPrefType(fullKey);
      if (type === 0) return fallback;
      if (type === 128) return Services.prefs.getBoolPref(fullKey);
      if (type === 64) return Services.prefs.getIntPref(fullKey);
      return Services.prefs.getStringPref(fullKey);
    } catch {
      return fallback;
    }
  }

  set(key: string, value: boolean | number | string): void {
    const fullKey = this.#fullKey(key);
    if (typeof value === 'boolean') {
      Services.prefs.setBoolPref(fullKey, value);
    } else if (typeof value === 'number') {
      Services.prefs.setIntPref(fullKey, value);
    } else {
      Services.prefs.setStringPref(fullKey, value);
    }
  }

  observe(key: string, listener: () => void): () => void {
    const fullKey = this.#fullKey(key);
    const observer = {
      observe(): void {
        listener();
      },
    };
    Services.prefs.addObserver(fullKey, observer);
    return () => {
      try {
        Services.prefs.removeObserver(fullKey, observer);
      } catch {
        // The preference service may already be shutting down.
      }
    };
  }
}
