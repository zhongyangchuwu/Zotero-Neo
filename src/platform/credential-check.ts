export type CredentialCheckResult =
  | 'valid'
  | 'invalid'
  | 'forbidden'
  | 'rateLimited'
  | 'unavailable'
  | 'cancelled';

export const SEMANTIC_SCHOLAR_CREDENTIAL_HELP_URL = 'https://www.semanticscholar.org/product/api';

export function openSemanticScholarCredentialHelp(): void {
  Zotero.launchURL(SEMANTIC_SCHOLAR_CREDENTIAL_HELP_URL);
}

/** Bootstrap lacks DOM constructors; keep checks independent of disposable Reader windows. */
export function createCredentialAbortController(): AbortController {
  if (typeof AbortController === 'undefined')
    Components.utils.importGlobalProperties(['AbortController']);
  return new AbortController();
}

const SCHOLAR_CHECK_URL =
  'https://api.semanticscholar.org/graph/v1/paper/CorpusId:215416146?fields=paperId';

/** Check only on explicit user action; never return response bodies, credentials or raw network errors. */
export async function checkSemanticScholarCredential(
  value: string,
  signal: AbortSignal,
): Promise<CredentialCheckResult> {
  if (signal.aborted) return 'cancelled';
  const token = value.trim();
  if (!token || token.length > 8192 || /[\r\n]/u.test(token)) return 'invalid';
  let cancel: (() => void) | undefined;
  const abort = (): void => cancel?.();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await Zotero.HTTP.request('GET', SCHOLAR_CHECK_URL, {
      headers: { 'x-api-key': token },
      responseType: 'text',
      successCodes: false,
      timeout: 10000,
      errorDelayMax: 0,
      logBodyLength: 0,
      debug: false,
      followRedirects: false,
      cancellerReceiver: (callback: () => void) => {
        cancel = callback;
        if (signal.aborted) abort();
      },
    });
    if (signal.aborted) return 'cancelled';
    if (response.status === 429) return 'rateLimited';
    let body: Record<string, unknown> | null = null;
    if (typeof response.responseText === 'string' && response.responseText.length <= 65536) {
      try {
        const parsed: unknown = JSON.parse(response.responseText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          body = parsed as Record<string, unknown>;
      } catch {
        // HTML proxy/login responses are not evidence that a credential is valid.
      }
    }
    if (response.status === 401) return 'invalid';
    if (response.status === 403) return 'forbidden';
    if (response.status < 200 || response.status >= 300 || !body) return 'unavailable';
    return typeof body.paperId === 'string' && /^[a-f\d]{40}$/iu.test(body.paperId)
      ? 'valid'
      : 'unavailable';
  } catch {
    return signal.aborted ? 'cancelled' : 'unavailable';
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
