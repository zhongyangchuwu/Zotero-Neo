import type { DocumentHttpRequest } from '../document-analysis/oxr';
import { checkParseCurrent } from '../document-analysis/contracts';

export interface AnalysisPDF {
  readonly fileName: string;
  readonly fingerprint: string;
  read(): Promise<Uint8Array>;
  isCurrent(): Promise<boolean>;
}

/** Capture the explicitly resolved attachment, never Main selection or another Reader's item. */
export async function analysisPDF(itemID: number): Promise<AnalysisPDF> {
  const item = await Zotero.Items.getAsync(itemID);
  if (!item || !item.isPDFAttachment()) throw new Error('A PDF attachment is required');
  const path = await item.getFilePathAsync();
  if (!path) throw new Error('PDF file unavailable');
  const fingerprint = await Zotero.Utilities.Internal.md5Async(path);
  const isCurrent = async (): Promise<boolean> =>
    (await item.getFilePathAsync()) === path &&
    (await Zotero.Utilities.Internal.md5Async(path)) === fingerprint;
  return {
    fileName: path.split(/[\\/]/u).at(-1) ?? 'document.pdf',
    fingerprint,
    isCurrent,
    async read() {
      if (!(await isCurrent())) throw new Error('PDF changed; reopen the comparison');
      const binary = await Zotero.File.getBinaryContentsAsync(path);
      if (!(await isCurrent())) throw new Error('PDF changed during reading');
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    },
  };
}

/** Host HTTP owns cancellation and timeouts; request bodies and credentials are never logged. */
export async function requestDocumentJSON(request: DocumentHttpRequest): Promise<unknown> {
  checkParseCurrent(request.signal);
  let cancel: (() => void) | undefined;
  const abort = (): void => cancel?.();
  request.signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await Zotero.HTTP.request('POST', request.url, {
      body: request.body,
      headers: { 'Content-Type': request.contentType },
      responseType: 'text',
      timeout: 120_000,
      errorDelayMax: 0,
      logBodyLength: 0,
      debug: false,
      followRedirects: false,
      cancellerReceiver: (callback: () => void) => {
        cancel = callback;
        if (request.signal.aborted) abort();
      },
    });
    checkParseCurrent(request.signal);
    return JSON.parse(response.responseText) as unknown;
  } catch {
    checkParseCurrent(request.signal);
    throw new Error('Document service request failed; check the endpoint and credentials');
  } finally {
    request.signal.removeEventListener('abort', abort);
  }
}
