import type { PreferenceStore } from '../core/preference-store';
import { mineruDocumentCacheKey } from './mineru';
import { oxrDocumentCacheKey } from './oxr';
import { localDocumentCacheKey } from './local';
import type { DocumentCacheKey } from './contracts';
import { parseLocalRuleProfile, type LocalRuleProfile } from './local-rules';

export const DOCUMENT_PROVIDER_KEY = 'documentAnalysis.provider';
export const OXR_ENDPOINT_KEY = 'documentAnalysis.oxr.endpoint';
export const LOCAL_RULES_KEY = 'documentAnalysis.local.rules';
export const DEFAULT_OXR_ENDPOINT = 'https://free-oxr.somark.ai/api/v1';

export type DocumentProvider = 'local' | 'mineru' | 'oxr';

export function selectedDocumentProvider(preferences: PreferenceStore): DocumentProvider {
  const provider = preferences.get(DOCUMENT_PROVIDER_KEY, 'local');
  return provider === 'mineru' || provider === 'oxr' ? provider : 'local';
}

/** Configuration failure is not a cache miss and must not trigger native/default-layout fallback. */
export class LocalRuleConfigurationError extends Error {
  override name = 'LocalRuleConfigurationError';
}

const localProfiles = new WeakMap<
  PreferenceStore,
  {
    readonly text: string;
    readonly profile?: LocalRuleProfile;
    readonly error?: LocalRuleConfigurationError;
  }
>();

/** Resolve at the configuration boundary, not once per page or current-result check. */
export function selectedLocalRuleProfile(preferences: PreferenceStore): LocalRuleProfile {
  const text = preferences.get(LOCAL_RULES_KEY, '');
  let selected = localProfiles.get(preferences);
  if (!selected || selected.text !== text) {
    try {
      selected = { text, profile: parseLocalRuleProfile(text) };
    } catch (error) {
      selected = {
        text,
        error: new LocalRuleConfigurationError(
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
    localProfiles.set(preferences, selected);
  }
  if (!selected.profile) throw selected.error;
  return selected.profile;
}

/** Reading a non-secret cache identity never constructs a parser or initiates a service request. */
export function selectedDocumentCacheKey(preferences: PreferenceStore): DocumentCacheKey {
  const provider = selectedDocumentProvider(preferences);
  return provider === 'oxr'
    ? oxrDocumentCacheKey(preferences.get(OXR_ENDPOINT_KEY, DEFAULT_OXR_ENDPOINT))
    : provider === 'mineru'
      ? mineruDocumentCacheKey()
      : localDocumentCacheKey(selectedLocalRuleProfile(preferences));
}
