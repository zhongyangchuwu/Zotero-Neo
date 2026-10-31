import {
  checkParseCurrent,
  documentRect,
  documentRegionFlow,
  record,
  type DocumentParser,
  type DocumentCacheKey,
  type DocumentRegion,
  type DocumentRegionKind,
  type DocumentSource,
  type ParsedDocument,
} from './contracts';
import { rasterPDFRect } from './geometry';
import type { DocumentServiceTransport } from './transport';

const API = 'https://mineru.net/api/v4';
const SETTINGS = { model_version: 'vlm', enable_table: true, enable_formula: true, language: 'en' };
const KINDS: Readonly<Record<string, DocumentRegionKind>> = {
  text: 'text',
  title: 'heading',
  list: 'list',
  code: 'code',
  ref_text: 'references',
  image: 'image',
  image_body: 'image',
  chart: 'image',
  chart_body: 'image',
  table: 'table',
  table_body: 'table',
  table_caption: 'caption',
  image_caption: 'caption',
  chart_caption: 'caption',
  table_footnote: 'footnote',
  image_footnote: 'footnote',
  chart_footnote: 'footnote',
  interline_equation: 'formula',
  header: 'header',
  footer: 'footer',
  page_number: 'footer',
  page_footnote: 'footnote',
  aside_text: 'other',
};

export interface MinerUParserOptions {
  readonly apiKey: string;
  readonly readPDF: () => Promise<Uint8Array>;
  readonly transport: DocumentServiceTransport;
  readonly onProgress?: (state: string, completedPages?: number, totalPages?: number) => void;
}

function blockContent(
  block: Readonly<Record<string, unknown>>,
): Pick<DocumentRegion, 'text' | 'format'> {
  if (!Array.isArray(block.lines)) return { text: '', format: 'text' };
  let format: DocumentRegion['format'] = 'text';
  const text = block.lines
    .map((value) => {
      const spans = record(value)?.spans;
      if (!Array.isArray(spans)) throw new Error('Invalid MinerU text line');
      return spans
        .map((value) => {
          const span = record(value);
          if (!span) throw new Error('Invalid MinerU text span');
          if (typeof span.html === 'string') {
            format = 'html';
            return span.html;
          }
          if (typeof span.latex === 'string') {
            format = 'latex';
            return span.latex;
          }
          return typeof span.content === 'string' ? span.content : '';
        })
        .join('');
    })
    .join('\n');
  return { text, format };
}

/** Consume the official cloud's legacy layout.json; reject other schemas instead of guessing coordinates. */
export function mineruParsedDocument(
  source: DocumentSource,
  payload: unknown,
  durationMs = 0,
): ParsedDocument {
  const layout = record(payload);
  const pages = layout?.pdf_info;
  if (!Array.isArray(pages) || pages.length !== source.pages.length)
    throw new Error('MinerU returned an incomplete or unsupported page set');
  const regions: DocumentRegion[] = [];
  const seen = new Set<number>();
  for (const value of pages) {
    const page = record(value),
      pageIndex = page?.page_idx,
      size = page?.page_size;
    if (
      typeof pageIndex !== 'number' ||
      !Number.isInteger(pageIndex) ||
      seen.has(pageIndex) ||
      !source.pages[pageIndex]
    )
      throw new Error('Invalid MinerU page identity');
    seen.add(pageIndex);
    if (
      !Array.isArray(size) ||
      size.length !== 2 ||
      !size.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0) ||
      !Array.isArray(page?.para_blocks) ||
      !Array.isArray(page.discarded_blocks)
    )
      throw new Error('Invalid MinerU page geometry');
    const visit = (
      value: unknown,
      path: string,
      excluded: boolean,
      object?: DocumentRegion['sourceObject'],
    ): void => {
      const block = record(value),
        rect = documentRect(block?.bbox);
      if (!block || !rect || typeof block.type !== 'string')
        throw new Error('Invalid MinerU region');
      const mapped = rasterPDFRect(rect, size[0], size[1], source.pages[pageIndex]!);
      const id = `mineru:${pageIndex}:${path}`;
      const sourceObject =
        object ??
        (['table', 'image', 'chart'].includes(block.type)
          ? { id, kind: block.type === 'table' ? ('table' as const) : ('figure' as const) }
          : undefined);
      if (Array.isArray(block.blocks) && block.blocks.length) {
        block.blocks.forEach((child, index) =>
          visit(child, `${path}.${index}`, excluded, sourceObject),
        );
        return;
      }
      const kind = KINDS[block.type] ?? 'other';
      regions.push({
        id,
        sourceBlock: { id, order: regions.length },
        ...(sourceObject ? { sourceObject } : {}),
        kind,
        pageIndex,
        rect: mapped,
        ...blockContent(block),
        flow: excluded ? 'excluded' : sourceObject ? 'auxiliary' : documentRegionFlow(kind),
        anchorPrecision: 'region',
      });
    };
    page.para_blocks.forEach((block, index) => visit(block, String(index), false));
    page.discarded_blocks.forEach((block, index) => visit(block, `discarded.${index}`, true));
  }
  return {
    schemaVersion: 1,
    sourceFingerprint: source.fingerprint,
    backend: 'mineru',
    modelRevision: null,
    durationMs,
    pages: source.pages,
    regions,
  };
}

/** Signed storage URLs never receive API credentials, and are not included in results or errors. */
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

/** Non-secret identity is shared by cache consumers without constructing a network parser. */
export function mineruDocumentCacheKey(): DocumentCacheKey {
  return {
    backend: 'mineru',
    adapterVersion: 1,
    configuration: JSON.stringify({ endpoint: API, ...SETTINGS }),
  };
}

/** One PDF uses the batch upload protocol, so upload/task/normalization do not need a second implementation. */
export function mineruDocumentParser(options: MinerUParserOptions): DocumentParser {
  const { transport } = options;
  return {
    id: 'mineru',
    cacheKey: mineruDocumentCacheKey(),
    capabilities: ['layout', 'text', 'reading-order', 'tables'],
    async parse(source, { signal }) {
      checkParseCurrent(signal);
      if (!options.apiKey.trim() || /[\r\n]/u.test(options.apiKey))
        throw new Error('MinerU API token required');
      if (source.pages.length > 200)
        throw new Error('MinerU cloud supports up to 200 pages per PDF');
      const started = Date.now(),
        bytes = await options.readPDF();
      checkParseCurrent(signal);
      if (bytes.byteLength > 200 * 1024 * 1024) throw new Error('MinerU PDF exceeds 200 MB');
      const headers = { Authorization: `Bearer ${options.apiKey.trim()}` };
      const dataID = 'document';
      options.onProgress?.('uploading');
      const data = serviceData(
        await transport.requestJSON({
          url: `${API}/file-urls/batch`,
          body: JSON.stringify({ files: [{ name: 'document.pdf', data_id: dataID }], ...SETTINGS }),
          contentType: 'application/json',
          headers,
          signal,
        }),
      );
      checkParseCurrent(signal);
      if (
        typeof data.batch_id !== 'string' ||
        !data.batch_id ||
        !Array.isArray(data.file_urls) ||
        data.file_urls.length !== 1
      )
        throw new Error('Invalid MinerU upload receipt');
      await transport.upload({
        url: storageURL(data.file_urls[0]),
        method: 'PUT',
        body: bytes,
        signal,
      });
      checkParseCurrent(signal);
      for (let attempt = 0; attempt < 180; attempt++) {
        const status = serviceData(
          await transport.requestJSON({
            url: `${API}/extract-results/batch/${encodeURIComponent(data.batch_id)}`,
            method: 'GET',
            headers,
            signal,
          }),
        );
        checkParseCurrent(signal);
        const entries = status.extract_result;
        if (!Array.isArray(entries) || entries.length !== 1)
          throw new Error('Invalid MinerU task receipt');
        const entry = record(entries[0]);
        if (entry?.data_id !== dataID) throw new Error('MinerU returned a different document');
        if (entry.state === 'failed') throw new Error('MinerU could not parse this PDF');
        if (entry.state === 'done') {
          options.onProgress?.('downloading');
          const archive = await transport.download({
            url: storageURL(entry.full_zip_url),
            method: 'GET',
            signal,
          });
          checkParseCurrent(signal);
          const layout = await transport.readArchive(archive, 'layout.json', signal);
          checkParseCurrent(signal);
          return mineruParsedDocument(source, layout, Date.now() - started);
        }
        if (!['waiting-file', 'pending', 'running', 'converting'].includes(String(entry.state)))
          throw new Error('Unsupported MinerU task state');
        const progress = record(entry.extract_progress);
        options.onProgress?.(
          String(entry.state),
          typeof progress?.extracted_pages === 'number' ? progress.extracted_pages : undefined,
          typeof progress?.total_pages === 'number' ? progress.total_pages : undefined,
        );
        await transport.wait(3000, signal);
        checkParseCurrent(signal);
      }
      throw new Error('MinerU parsing timed out; the remote task may still finish');
    },
  };
}
