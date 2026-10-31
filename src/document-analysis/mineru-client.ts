import { checkParseCurrent, record, type DocumentCacheKey } from './contracts';
import type { DocumentServiceTransport } from './transport';

const API = 'https://mineru.net/api/v4';
const SETTINGS = { model_version: 'vlm', enable_table: true, enable_formula: true, language: 'en' };
// The API overview and endpoint details disagree; use the narrower documented upload limit.
export const MINERU_MAX_FILES = 50;
export const MINERU_MAX_PAGES = 200;
export const MINERU_MAX_BYTES = 200 * 1024 * 1024;

export interface MinerUResult {
  readonly dataID: string;
  readonly state: 'waiting-file' | 'pending' | 'running' | 'converting' | 'done' | 'failed';
  readonly completedPages?: number;
  readonly totalPages?: number;
  /** Transient signed URL; never copy this result into a persistent task record. */
  readonly downloadURL?: string;
}

function storageURL(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid MinerU storage URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error('Invalid MinerU storage URL');
  return url.href;
}
function serviceData(payload: unknown): Readonly<Record<string, unknown>> {
  const envelope = record(payload),
    data = record(envelope?.data);
  if (envelope?.code !== 0 || !data)
    throw new Error('MinerU service rejected the request; check your token and quota');
  return data;
}
export function mineruDocumentCacheKey(): DocumentCacheKey {
  return {
    backend: 'mineru',
    adapterVersion: 1,
    configuration: JSON.stringify({ endpoint: API, ...SETTINGS }),
  };
}

/** Shared official protocol for single and multi-file workflows; storage never receives the bearer token. */
export function mineruClient(apiKey: string, transport: DocumentServiceTransport) {
  const headers = (): Readonly<Record<string, string>> => {
    if (!apiKey.trim() || /[\r\n]/u.test(apiKey)) throw new Error('MinerU API token required');
    return { Authorization: `Bearer ${apiKey.trim()}` };
  };
  return {
    async submit(dataIDs: readonly string[], signal: AbortSignal) {
      checkParseCurrent(signal);
      if (
        !dataIDs.length ||
        dataIDs.length > MINERU_MAX_FILES ||
        new Set(dataIDs).size !== dataIDs.length ||
        dataIDs.some((id) => !/^[\w.-]{1,128}$/u.test(id))
      )
        throw new Error('Invalid MinerU batch');
      const data = serviceData(
        await transport.requestJSON({
          url: `${API}/file-urls/batch`,
          contentType: 'application/json',
          body: JSON.stringify({
            files: dataIDs.map((data_id, index) => ({
              name: index ? `document-${index + 1}.pdf` : 'document.pdf',
              data_id,
            })),
            ...SETTINGS,
          }),
          headers: headers(),
          signal,
        }),
      );
      checkParseCurrent(signal);
      if (
        typeof data.batch_id !== 'string' ||
        !/^[\w.-]{1,256}$/u.test(data.batch_id) ||
        !Array.isArray(data.file_urls) ||
        data.file_urls.length !== dataIDs.length
      )
        throw new Error('Invalid MinerU upload receipt');
      return {
        batchID: data.batch_id,
        uploads: dataIDs.map((dataID, i) => ({
          dataID,
          url: storageURL((data.file_urls as unknown[])[i]),
        })),
      };
    },
    async upload(url: string, bytes: Uint8Array, signal: AbortSignal): Promise<void> {
      checkParseCurrent(signal);
      if (bytes.byteLength > MINERU_MAX_BYTES) throw new Error('MinerU PDF exceeds 200 MB');
      await transport.upload({ url: storageURL(url), method: 'PUT', body: bytes, signal });
      checkParseCurrent(signal);
    },
    async poll(batchID: string, signal: AbortSignal): Promise<readonly MinerUResult[]> {
      checkParseCurrent(signal);
      const data = serviceData(
        await transport.requestJSON({
          url: `${API}/extract-results/batch/${encodeURIComponent(batchID)}`,
          method: 'GET',
          headers: headers(),
          signal,
        }),
      );
      checkParseCurrent(signal);
      if (!Array.isArray(data.extract_result) || data.extract_result.length > MINERU_MAX_FILES)
        throw new Error('Invalid MinerU task receipt');
      const seen = new Set<string>();
      return data.extract_result.map((value) => {
        const entry = record(value),
          progress = record(entry?.extract_progress);
        if (
          !entry ||
          typeof entry.data_id !== 'string' ||
          !/^[\w.-]{1,128}$/u.test(entry.data_id) ||
          seen.has(entry.data_id) ||
          !['waiting-file', 'pending', 'running', 'converting', 'done', 'failed'].includes(
            String(entry.state),
          )
        )
          throw new Error('Unsupported MinerU task state or identity');
        seen.add(entry.data_id);
        const count = (value: unknown): number | undefined =>
          typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
        return {
          dataID: entry.data_id,
          state: entry.state as MinerUResult['state'],
          completedPages: count(progress?.extracted_pages),
          totalPages: count(progress?.total_pages),
          ...(entry.state === 'done' ? { downloadURL: storageURL(entry.full_zip_url) } : {}),
        };
      });
    },
    async layout(result: MinerUResult, signal: AbortSignal): Promise<unknown> {
      checkParseCurrent(signal);
      if (result.state !== 'done') throw new Error('MinerU result is not ready');
      const archive = await transport.download({
        url: storageURL(result.downloadURL),
        method: 'GET',
        signal,
      });
      checkParseCurrent(signal);
      const layout = await transport.readArchive(archive, 'layout.json', signal);
      checkParseCurrent(signal);
      return layout;
    },
  };
}
