/** Bootstrap has no DOM globals; keep cancellation independent of disposable Reader iframes. */
export function createReferenceAbortController(): AbortController {
  if (typeof AbortController === 'undefined')
    Components.utils.importGlobalProperties(['AbortController']);
  return new AbortController();
}

/** Import Gecko's inert XML parser only when an explicit metadata response needs decoding. */
export function parseReferenceXML(text: string): Document {
  if (typeof DOMParser === 'undefined') Components.utils.importGlobalProperties(['DOMParser']);
  return new DOMParser().parseFromString(text, 'application/xml');
}

export async function referenceRequest(
  url: string,
  key: string,
  signal: AbortSignal,
): Promise<{ status: number; text: string }> {
  if (signal.aborted) throw new Error('Reference lookup cancelled');
  let cancel: (() => void) | undefined;
  const limit = 2 * 1024 * 1024;
  let oversized = false;
  let observed: XMLHttpRequest | undefined;
  const stop = (): void => {
    if (!oversized) {
      oversized = true;
      observed?.abort();
    }
  };
  const checkState = (): void => {
    if (!observed || oversized) return;
    if (observed.readyState >= 2) {
      const length = observed.getResponseHeader('Content-Length');
      if (length && /^\d+$/u.test(length) && Number(length) > limit) {
        stop();
        return;
      }
    }
    if (observed.readyState >= 3 && observed.responseText.length > limit) stop();
  };
  const checkProgress = (event: ProgressEvent): void => {
    if (event.loaded > limit) stop();
    else checkState();
  };
  const abort = (): void => cancel?.();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await Zotero.HTTP.request('GET', url, {
      headers: key ? { 'x-api-key': key } : {},
      responseType: 'text',
      timeout: 20000,
      successCodes: false,
      errorDelayMax: 0,
      logBodyLength: 0,
      debug: false,
      followRedirects: false,
      requestObserver: (xhr: XMLHttpRequest) => {
        observed = xhr;
        xhr.addEventListener('readystatechange', checkState);
        xhr.addEventListener('progress', checkProgress);
      },
      cancellerReceiver: (callback: () => void) => {
        cancel = callback;
        if (signal.aborted) abort();
      },
    });
    if (signal.aborted) throw new Error('Reference lookup cancelled');
    if (oversized || response.responseText.length > limit)
      throw new Error('Reference response exceeds 2 MiB');
    return { status: response.status, text: response.responseText };
  } catch (error) {
    if (signal.aborted) throw new Error('Reference lookup cancelled');
    if (
      oversized ||
      (error instanceof Error && error.message === 'Reference response exceeds 2 MiB')
    )
      throw new Error('Reference response exceeds 2 MiB');
    throw new Error('Reference service request failed');
  } finally {
    observed?.removeEventListener('readystatechange', checkState);
    observed?.removeEventListener('progress', checkProgress);
    signal.removeEventListener('abort', abort);
  }
}
