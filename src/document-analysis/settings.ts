import type { PreferenceStore } from '../core/preference-store';
import { mineruDocumentCacheKey } from './mineru';
import { oxrDocumentCacheKey } from './oxr';
import type { DocumentCacheKey } from './contracts';

export const DOCUMENT_PROVIDER_KEY = 'documentAnalysis.provider';
export const OXR_ENDPOINT_KEY = 'documentAnalysis.oxr.endpoint';
export const DEFAULT_OXR_ENDPOINT = 'https://free-oxr.somark.ai/api/v1';

/** Reading a non-secret cache identity never constructs a parser or initiates a service request. */
export function selectedDocumentCacheKey(preferences: PreferenceStore): DocumentCacheKey {
  return preferences.get(DOCUMENT_PROVIDER_KEY, 'mineru') === 'oxr'
    ? oxrDocumentCacheKey(preferences.get(OXR_ENDPOINT_KEY, DEFAULT_OXR_ENDPOINT))
    : mineruDocumentCacheKey();
}
