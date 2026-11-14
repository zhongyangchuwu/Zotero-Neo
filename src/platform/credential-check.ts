export type CredentialProvider = 'mineru' | 'semanticScholar';
export type CredentialCheckResult =
  | 'valid'
  | 'invalid'
  | 'expired'
  | 'forbidden'
  | 'rateLimited'
  | 'unavailable'
  | 'cancelled';

export const CREDENTIAL_HELP_URLS: Readonly<Record<CredentialProvider, string>> = {
  mineru: 'https://mineru.net/apiManage/docs',
  semanticScholar: 'https://www.semanticscholar.org/product/api',
};

export function openCredentialHelp(provider: CredentialProvider): void {
  Zotero.launchURL(CREDENTIAL_HELP_URLS[provider]);
}

/** Bootstrap lacks DOM constructors; keep checks independent of disposable Reader windows. */
export function createCredentialAbortController(): AbortController {
  if (typeof AbortController === 'undefined')
    Components.utils.importGlobalProperties(['AbortController']);
  return new AbortController();
}

// The documented task-status route requires authentication. A well-formed absent task
// returns -60012 only after authentication; it never submits work or uploads a PDF.
// Official contract: https://mineru.net/apiManage/docs (task results / error codes).
const MINERU_CHECK_URL =
  'https://mineru.net/api/v4/extract/task/00000000-0000-0000-0000-000000000000';
const SCHOLAR_CHECK_URL =
  'https://api.semanticscholar.org/graph/v1/paper/CorpusId:215416146?fields=paperId';

/** Check only on explicit user action; never return response bodies, credentials or raw network errors. */
export async function checkCredential(
  provider: CredentialProvider,
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
    const response = await Zotero.HTTP.request(
      'GET',
      provider === 'mineru' ? MINERU_CHECK_URL : SCHOLAR_CHECK_URL,
      {
        headers:
          provider === 'mineru' ? { Authorization: `Bearer ${token}` } : { 'x-api-key': token },
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
      },
    );
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
    if (provider === 'mineru') {
      if (body?.code === 'A0211') return 'expired';
      if (body?.code === 'A0202') return 'invalid';
    }
    if (response.status === 401) return 'invalid';
    if (response.status === 403) return 'forbidden';
    if (response.status < 200 || response.status >= 300 || !body) return 'unavailable';
    if (provider === 'mineru')
      return body.code === 0 || body.code === -60012 ? 'valid' : 'unavailable';
    return typeof body.paperId === 'string' && /^[a-f\d]{40}$/iu.test(body.paperId)
      ? 'valid'
      : 'unavailable';
  } catch {
    return signal.aborted ? 'cancelled' : 'unavailable';
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
