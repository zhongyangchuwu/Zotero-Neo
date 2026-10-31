import { describe, expect, it, vi } from 'vitest';
import { compareDocuments } from '../../src/document-analysis/compare';
import type { DocumentPage, DocumentSource } from '../../src/document-analysis/contracts';
import {
  nativeDocumentParser,
  nativeDocumentPages,
  nativeParsedDocument,
} from '../../src/document-analysis/native';
import {
  oxrDocumentParser,
  oxrMultipart,
  oxrParsedDocument,
  rasterPDFRect,
} from '../../src/document-analysis/oxr';

const page: DocumentPage = { pageIndex: 0, viewBox: [10, 20, 210, 120], rotation: 0 };
const source: DocumentSource = { fingerprint: 'original', fileName: 'owned.pdf', pages: [page] };
function response(
  pages: unknown[] = [
    {
      page_num: 0,
      page_size: { w: 400, h: 200 },
      blocks: [{ type: 'Text', bbox: [40, 20, 200, 100], content: 'We use flow.' }],
    },
  ],
) {
  return { code: 0, data: { result: { outputs: { json: { pages } } } } };
}
const nativeData = {
  metadata: { source: { hash: 'original' }, processor: { type: 'pdf', version: 14 } },
  catalog: { pages: [{ viewRect: page.viewBox }] },
  blocks: [
    {
      type: 'paragraph',
      anchor: { pageRects: [[0, 30, 70, 110, 110]] },
      content: [{ text: 'We ' }, { text: 'use flow.' }],
    },
  ],
};

describe('document parsing contracts', () => {
  it('keeps native text exact and requires the matching source revision', () => {
    expect(nativeDocumentPages(nativeData.catalog)).toEqual([page]);
    expect(nativeParsedDocument(source, nativeData).regions[0]).toMatchObject({
      text: 'We use flow.',
      rect: [30, 70, 110, 110],
      anchorPrecision: 'region',
    });
    expect(() => nativeParsedDocument({ ...source, fingerprint: 'changed' }, nativeData)).toThrow(
      'different PDF revision',
    );
    expect(() => nativeDocumentPages({ pages: [{ viewRect: [0, 0, 0, 100] }] })).toThrow(
      'geometry',
    );
  });

  it.each([
    [0, [30, 70, 110, 110]],
    [90, [30, 30, 110, 70]],
    [180, [110, 30, 190, 70]],
    [270, [110, 70, 190, 110]],
  ] as const)('inverts rotation %s with a nonzero CropBox origin', (rotation, expected) => {
    expect(rasterPDFRect([40, 20, 200, 100], 400, 200, { ...page, rotation })).toEqual(expected);
  });

  it('rejects raster boxes outside the source page instead of silently clamping', () => {
    expect(() => rasterPDFRect([-1, 0, 20, 20], 400, 200, page)).toThrow('outside');
    expect(() => rasterPDFRect([0, 0, 20, 20], Infinity, 200, page)).toThrow('dimensions');
  });

  it('admits region navigation without inventing character anchors or a model revision', () => {
    const parsed = oxrParsedDocument(source, response());
    expect(parsed.modelRevision).toBeNull();
    expect(parsed.regions[0]).toMatchObject({
      pageIndex: 0,
      rect: [30, 70, 110, 110],
      anchorPrecision: 'region',
    });
    expect(parsed.regions[0]).not.toHaveProperty('textMap');
  });

  it('uses shared semantic flow defaults for captions and formulas across providers', () => {
    const native = nativeParsedDocument(source, {
      ...nativeData,
      blocks: [{ ...nativeData.blocks[0], type: 'caption' }],
    });
    const cloud = oxrParsedDocument(
      source,
      response([
        {
          page_num: 0,
          page_size: { w: 400, h: 200 },
          blocks: [
            { type: 'Caption', bbox: [40, 20, 200, 100], content: 'Figure 1', format: 'text' },
          ],
        },
      ]),
    );
    expect(native.regions[0]?.flow).toBe('auxiliary');
    expect(cloud.regions[0]?.flow).toBe('auxiliary');
  });

  it('rejects incomplete, duplicate and mismatched cloud page identities', () => {
    expect(() => oxrParsedDocument(source, response([]))).toThrow('page set');
    expect(() => oxrParsedDocument(source, response([{ page_num: 2 }]))).toThrow('identity');
    const pageResult = { page_num: 0, page_size: { w: 400, h: 200 }, blocks: [] };
    expect(() =>
      oxrParsedDocument(
        { ...source, pages: [page, { ...page, pageIndex: 1 }] },
        response([pageResult, pageResult]),
      ),
    ).toThrow('identity');
    expect(() => oxrParsedDocument(source, { code: 500 })).toThrow('failed');
  });

  it('preserves binary file bytes in multipart rather than encoding them as text', () => {
    const body = oxrMultipart(new Uint8Array([0, 128, 255]), 'dummy', 'test-boundary');
    const decoded = new TextDecoder('latin1').decode(body);
    expect(decoded).toContain('name="output_formats"\r\n\r\njson');
    expect(decoded).toContain('name="keep_header_footer"\r\n\r\ntrue');
    expect(
      body.some(
        (value, index) => value === 0 && body[index + 1] === 128 && body[index + 2] === 255,
      ),
    ).toBe(true);
  });

  it('does not read or upload a cancelled request and discards late native results', async () => {
    const abort = new AbortController();
    abort.abort();
    const readPDF = vi.fn(),
      request = vi.fn();
    const cloud = oxrDocumentParser({
      baseURL: 'https://example.com/api/v1',
      apiKey: 'secret',
      readPDF,
      request,
    });
    await expect(cloud.parse(source, { signal: abort.signal })).rejects.toThrow('cancelled');
    expect(readPDF).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    const current = new AbortController();
    const native = nativeDocumentParser(async () => {
      current.abort();
      return nativeData;
    });
    await expect(native.parse(source, { signal: current.signal })).rejects.toThrow('cancelled');
  });

  it('distinguishes vocabulary diagnostics from an accuracy claim', () => {
    const native = nativeParsedDocument(source, nativeData);
    const cloud = oxrParsedDocument(source, response());
    expect(compareDocuments(native, cloud)).toMatchObject({
      nativeOnlyWords: [],
      cloudOnlyWords: [],
    });
    expect(() => compareDocuments(native, { ...cloud, sourceFingerprint: 'other' })).toThrow(
      'different PDF revisions',
    );
  });
});
