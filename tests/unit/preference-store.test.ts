import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZoteroPreferenceStore } from '../../src/core/preference-store';
import {
  ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY,
  PREFERENCE_PREFIX,
  annotationCommentEditorEnabled,
  migrateReaderPreferences,
} from '../../src/core/preferences';

afterEach(() => vi.unstubAllGlobals());

describe('native Reader preference migration', () => {
  it('persists a disabled feature and clears its prefixed legacy user preference', () => {
    const legacyKey = `${PREFERENCE_PREFIX}.mode.insert.enabled`;
    const canonicalKey = `${PREFERENCE_PREFIX}.${ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY}`;
    const values = new Map<string, boolean>([[legacyKey, false]]);
    vi.stubGlobal('Services', {
      prefs: {
        getPrefType: (key: string) => (values.has(key) ? 128 : 0),
        getBoolPref: (key: string) => values.get(key),
        setBoolPref: (key: string, value: boolean) => values.set(key, value),
        clearUserPref: (key: string) => values.delete(key),
      },
    });
    const preferences = new ZoteroPreferenceStore();

    migrateReaderPreferences(preferences);

    expect(values.get(canonicalKey)).toBe(false);
    expect(values.has(legacyKey)).toBe(false);
    expect(annotationCommentEditorEnabled(preferences)).toBe(false);
    preferences.set(ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY, true);
    migrateReaderPreferences(preferences);
    expect(annotationCommentEditorEnabled(preferences)).toBe(true);
  });
});
