import { describe, expect, it, vi } from 'vitest';
import { mineruDocumentParser, mineruParsedDocument } from '../../src/document-analysis/mineru';
import { analyzeParsedDocument } from '../../src/document-analysis/analyze';
import { documentObjectLocation } from '../../src/document-analysis/object-groups';
import { documentCacheRecord, readDocumentCacheRecord } from '../../src/document-analysis/cache';
import type { DocumentSource } from '../../src/document-analysis/contracts';
import type { DocumentServiceTransport } from '../../src/document-analysis/transport';

const source: DocumentSource = {
  fingerprint: 'original',
  fileName: 'private-file-name.pdf',
  pages: [{ pageIndex: 0, viewBox: [10, 20, 610, 820], rotation: 0 }],
};
const span = (content: string) => [{ spans: [{ content }] }];
function layout() {
  return {
    _version_name: '3.4.4',
    pdf_info: [
      {
        page_idx: 0,
        page_size: [600, 800],
        discarded_blocks: [],
        para_blocks: [
          {
            type: 'table',
            bbox: [50, 100, 500, 300],
            blocks: [
              {
                type: 'table_body',
                bbox: [50, 100, 500, 250],
                lines: [{ spans: [{ html: '<table><tr><td>7</td></tr></table>' }] }],
              },
              // The backend can classify a real caption as a footnote. Object membership remains authoritative.
              {
                type: 'table_footnote',
                bbox: [50, 260, 500, 300],
                lines: span('Table 1Comparison'),
              },
            ],
          },
        ],
      },
    ],
  };
}
const receipt = (data: unknown) => ({ code: 0, data });
function transport() {
  return {
    requestJSON: vi
      .fn()
      .mockResolvedValueOnce(
        receipt({
          batch_id: 'batch',
          file_urls: ['https://storage.example/upload?signature=private'],
        }),
      )
      .mockResolvedValueOnce(
        receipt({ extract_result: [{ data_id: 'document', state: 'pending' }] }),
      )
      .mockResolvedValue(
        receipt({
          extract_result: [
            {
              data_id: 'document',
              state: 'done',
              full_zip_url: 'https://storage.example/result.zip?signature=private',
            },
          ],
        }),
      ),
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue(new Uint8Array([1, 2])),
    readArchive: vi.fn().mockResolvedValue(layout()),
    wait: vi.fn().mockResolvedValue(undefined),
  } satisfies DocumentServiceTransport;
}

describe('MinerU official cloud path', () => {
  it('uses the batch upload protocol, isolates authorization and polls before consuming the archive', async () => {
    const http = transport(),
      progress = vi.fn();
    const parser = mineruDocumentParser({
      apiKey: 'secret',
      readPDF: async () => new Uint8Array([0, 128, 255]),
      transport: http,
      onProgress: progress,
    });
    const parsed = await parser.parse(source, { signal: new AbortController().signal });
    const upload = http.upload.mock.calls[0]![0];
    expect(upload).toMatchObject({ method: 'PUT', body: new Uint8Array([0, 128, 255]) });
    expect(upload).not.toHaveProperty('headers');
    expect(upload).not.toHaveProperty('contentType');
    expect(http.download.mock.calls[0]![0]).not.toHaveProperty('headers');
    expect(http.requestJSON.mock.calls[0]![0].headers).toEqual({ Authorization: 'Bearer secret' });
    const body = JSON.parse(http.requestJSON.mock.calls[0]![0].body as string);
    expect(body).toMatchObject({
      files: [{ name: 'document.pdf', data_id: 'document' }],
      model_version: 'vlm',
      enable_table: true,
    });
    expect(JSON.stringify(body)).not.toContain(source.fileName);
    expect(http.wait).toHaveBeenCalledTimes(1);
    expect(progress.mock.calls.map(([s]) => s)).toEqual(['uploading', 'pending', 'downloading']);
    expect(parsed.backend).toBe('mineru');
    expect(parsed.modelRevision).toBeNull(); // Producer version is not a model revision.
    expect(JSON.stringify([parsed, parser.cacheKey])).not.toContain('secret');
    expect(JSON.stringify(parsed)).not.toContain('signature');
  });

  it('preserves table body and caption membership through normalization and persistent cache', () => {
    const parsed = mineruParsedDocument(source, layout());
    expect(parsed.regions[0]).toMatchObject({
      kind: 'table',
      rect: [60, 570, 510, 720],
      format: 'html',
      flow: 'auxiliary',
    });
    const analyzed = analyzeParsedDocument(parsed, source);
    expect(analyzed.objectGroups).toHaveLength(1);
    expect(analyzed.objectGroups[0]).toMatchObject({
      kind: 'table',
      association: 'backend',
      memberRegionIds: parsed.regions.map((r) => r.id),
    });
    expect(documentObjectLocation(parsed.regions, analyzed.objectGroups[0]!)).toEqual({
      pageIndex: 0,
      rects: [
        [60, 570, 510, 720],
        [60, 520, 510, 560],
      ],
    });
    const key = mineruDocumentParser({
      apiKey: '',
      readPDF: vi.fn(),
      transport: transport(),
    }).cacheKey!;
    const saved = documentCacheRecord(source, key, parsed);
    const restored = readDocumentCacheRecord(saved, source, key)!;
    expect(analyzeParsedDocument(restored.parsed, source).objectGroups).toEqual(
      analyzed.objectGroups,
    );
    expect(readDocumentCacheRecord(saved, { ...source, fingerprint: 'changed' }, key)).toBeNull();
    const invalid = JSON.parse(JSON.stringify(saved));
    invalid.parsed.regions[0].sourceObject.kind = 'text';
    expect(readDocumentCacheRecord(invalid, source, key)).toBeNull();
  });

  it('keeps an uncaptioned table navigable and does not merge it with adjacent objects', () => {
    const data = layout();
    data.pdf_info[0]!.para_blocks[0]!.blocks.splice(1);
    const table = data.pdf_info[0]!.para_blocks[0]!;
    data.pdf_info[0]!.para_blocks.push({
      ...table,
      blocks: [{ ...table.blocks[0]!, bbox: [50, 300, 500, 400] }],
      bbox: [50, 300, 500, 400],
    });
    const parsed = mineruParsedDocument(source, data);
    const groups = analyzeParsedDocument(parsed, source).objectGroups;
    expect(groups).toHaveLength(2);
    expect(
      groups.every(
        (g) =>
          g.kind === 'table' && g.captionRegionIds.length === 0 && g.memberRegionIds.length === 1,
      ),
    ).toBe(true);
  });

  it('rejects missing pages, invalid coordinates and future schemas rather than guessing', () => {
    expect(() => mineruParsedDocument(source, { pdf_info: [] })).toThrow('page set');
    expect(() => mineruParsedDocument(source, { schema: 'docvortex.middle', pages: [] })).toThrow(
      'unsupported',
    );
    const bad = layout();
    bad.pdf_info[0]!.page_idx = 2;
    expect(() => mineruParsedDocument(source, bad)).toThrow('identity');
    const outside = layout();
    outside.pdf_info[0]!.para_blocks[0]!.blocks[0]!.bbox = [-1, 0, 10, 10];
    expect(() => mineruParsedDocument(source, outside)).toThrow('outside');
    const mismatch = layout();
    mismatch.pdf_info.push(mismatch.pdf_info[0]!);
    expect(() =>
      mineruParsedDocument(
        { ...source, pages: [...source.pages, { ...source.pages[0]!, pageIndex: 1 }] },
        mismatch,
      ),
    ).toThrow('identity');
  });

  it('does no upload without a token and prevents cancelled polling or late downloads from being applied', async () => {
    const http = transport(),
      readPDF = vi.fn().mockResolvedValue(new Uint8Array([1]));
    await expect(
      mineruDocumentParser({ apiKey: '', readPDF, transport: http }).parse(source, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('token');
    expect(readPDF).not.toHaveBeenCalled();
    const abort = new AbortController();
    http.wait.mockImplementation(async () => {
      abort.abort();
    });
    await expect(
      mineruDocumentParser({ apiKey: 'secret', readPDF, transport: http }).parse(source, {
        signal: abort.signal,
      }),
    ).rejects.toThrow('cancelled');
    expect(http.download).not.toHaveBeenCalled();
    const second = transport(),
      cancelled = new AbortController();
    second.download.mockImplementation(async () => {
      cancelled.abort();
      return new Uint8Array([1]);
    });
    await expect(
      mineruDocumentParser({ apiKey: 'secret', readPDF, transport: second }).parse(source, {
        signal: cancelled.signal,
      }),
    ).rejects.toThrow('cancelled');
    expect(second.readArchive).not.toHaveBeenCalled();
  });

  it('contains service failures and mismatched results without leaking raw provider messages', async () => {
    for (const payload of [
      receipt({ extract_result: [{ data_id: 'other', state: 'done' }] }),
      receipt({ extract_result: [{ data_id: 'document', state: 'failed', err_msg: 'secret' }] }),
      { code: 401, msg: 'secret' },
    ]) {
      const http = transport();
      http.requestJSON.mockReset();
      http.requestJSON
        .mockResolvedValueOnce(
          receipt({ batch_id: 'batch', file_urls: ['https://storage.example/upload'] }),
        )
        .mockResolvedValue(payload);
      const parser = mineruDocumentParser({
        apiKey: 'secret',
        readPDF: async () => new Uint8Array([1]),
        transport: http,
      });
      let error = '';
      try {
        await parser.parse(source, { signal: new AbortController().signal });
      } catch (e) {
        error = String(e);
      }
      expect(error).toContain('MinerU');
      expect(error).not.toContain('secret');
      expect(http.download).not.toHaveBeenCalled();
    }
  });
});
