import type { DocumentHttpRequest, DocumentServiceTransport } from '../document-analysis/transport';
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
async function requestDocument(
  request: DocumentHttpRequest,
  responseType: 'text' | 'arraybuffer',
): Promise<XMLHttpRequest> {
  checkParseCurrent(request.signal);
  let cancel: (() => void) | undefined;
  const abort = (): void => cancel?.();
  request.signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await Zotero.HTTP.request(request.method ?? 'POST', request.url, {
      body: request.body,
      headers: {
        ...(request.contentType ? { 'Content-Type': request.contentType } : {}),
        ...request.headers,
      },
      responseType,
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
    return response;
  } catch {
    checkParseCurrent(request.signal);
    throw new Error('Document service request failed; check the endpoint and credentials');
  } finally {
    request.signal.removeEventListener('abort', abort);
  }
}

export async function requestDocumentJSON(request: DocumentHttpRequest): Promise<unknown> {
  const response = await requestDocument(request, 'text');
  try {
    return JSON.parse(response.responseText) as unknown;
  } catch {
    throw new Error('Document service returned invalid JSON');
  }
}

async function downloadDocument(request: DocumentHttpRequest): Promise<Uint8Array> {
  const response = await requestDocument(request, 'arraybuffer');
  const bytes = new Uint8Array(response.response as ArrayBuffer);
  if (bytes.byteLength > 128 * 1024 * 1024) throw new Error('Document archive exceeds 128 MiB');
  return bytes;
}

/** Read one bounded JSON member without extracting paths or loading executable archive content. */
export async function readDocumentArchive(
  bytes: Uint8Array,
  member: string,
  signal: AbortSignal,
): Promise<unknown> {
  checkParseCurrent(signal);
  if (bytes.byteLength > 128 * 1024 * 1024) throw new Error('Document archive exceeds 128 MiB');
  const file = Zotero.getTempDirectory().clone();
  file.append('neo-document.zip');
  file.createUnique(0, 0o600);
  const classes = Components.classes as unknown as Record<
    string,
    { createInstance(iid: unknown): unknown }
  >;
  const zip = classes['@mozilla.org/libjar/zip-reader;1'].createInstance(
    Components.interfaces.nsIZipReader,
  ) as nsIZipReader;
  let opened = false;
  try {
    if (typeof IOUtils === 'undefined') Components.utils.importGlobalProperties(['IOUtils']);
    await IOUtils.write(file.path, bytes);
    checkParseCurrent(signal);
    zip.open(file);
    opened = true;
    if (!zip.hasEntry(member) || zip.getEntry(member).realSize > 32 * 1024 * 1024)
      throw new Error('Document archive JSON is missing or exceeds 32 MiB');
    const input = classes['@mozilla.org/intl/converter-input-stream;1'].createInstance(
      Components.interfaces.nsIConverterInputStream,
    ) as nsIConverterInputStream;
    input.init(zip.getInputStream(member), 'UTF-8', 65536, 0);
    let text = '';
    try {
      const chunk = { value: '' };
      while (input.readString(65536, chunk)) {
        text += chunk.value;
        if (text.length > 32 * 1024 * 1024) throw new Error('Document archive JSON exceeds limit');
      }
    } finally {
      input.close();
    }
    checkParseCurrent(signal);
    return JSON.parse(text) as unknown;
  } finally {
    try {
      if (opened) zip.close();
    } finally {
      await Zotero.File.removeIfExists(file.path);
    }
  }
}

function waitForDocumentService(milliseconds: number, signal: AbortSignal): Promise<void> {
  checkParseCurrent(signal);
  const window = Zotero.getMainWindow();
  return new Promise((resolve, reject) => {
    const done = (): void => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = window.setTimeout(done, milliseconds);
    const abort = (): void => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new Error('Document analysis cancelled'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Zotero.HTTP adds a default Content-Type to bodies, invalidating signed uploads that omit it. */
async function uploadDocument(request: DocumentHttpRequest): Promise<void> {
  checkParseCurrent(request.signal);
  if (typeof XMLHttpRequest === 'undefined')
    Components.utils.importGlobalProperties(['XMLHttpRequest']);
  const xhr = new XMLHttpRequest();
  const abort = (): void => xhr.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      xhr.open(request.method ?? 'PUT', request.url);
      xhr.timeout = 120_000;
      for (const [name, value] of Object.entries(request.headers ?? {}))
        xhr.setRequestHeader(name, value);
      if (request.contentType) xhr.setRequestHeader('Content-Type', request.contentType);
      const fail = (): void => reject(new Error('Document upload failed'));
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : fail());
      xhr.onerror = xhr.ontimeout = xhr.onabort = fail;
      if (request.signal.aborted) {
        fail();
        return;
      }
      xhr.send(
        typeof request.body === 'string' ? request.body : (request.body?.slice().buffer ?? null),
      );
    });
    checkParseCurrent(request.signal);
  } catch {
    checkParseCurrent(request.signal);
    throw new Error('Document upload failed; check the connection and try again');
  } finally {
    request.signal.removeEventListener('abort', abort);
    xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
  }
}

export const documentServiceTransport: DocumentServiceTransport = {
  requestJSON: requestDocumentJSON,
  upload: uploadDocument,
  download: downloadDocument,
  readArchive: readDocumentArchive,
  wait: waitForDocumentService,
};
