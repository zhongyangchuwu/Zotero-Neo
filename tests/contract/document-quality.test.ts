import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const bytes = Buffer.from('%PDF-1.4\nfixture\n');
const hash = createHash('sha256').update(bytes).digest('hex');
const region = (
  id: string,
  kind: string,
  text: string,
  rect: number[],
  extra: { sourceObject?: { id: string; kind: string } } = {},
) => ({
  id,
  kind,
  text,
  rect,
  pageIndex: 0,
  format: 'text',
  flow: kind === 'text' ? 'body' : 'auxiliary',
  anchorPrecision: 'region',
  ...extra,
});
function fixture() {
  const checks = [
    { id: 't1', kind: 'text', pageIndex: 0, text: 'Alpha text' },
    { id: 't2', kind: 'text', pageIndex: 0, text: 'Alpha text' },
    {
      id: 'object',
      kind: 'object',
      objectKind: 'figure',
      pageIndex: 0,
      text: 'Figure 1: example',
      rect: [0, 40, 10, 50],
    },
    { id: 'unboxed', kind: 'object', objectKind: 'formula', pageIndex: 0, text: 'x = y' },
    { id: 'reference', kind: 'reference', pageIndex: 0, text: 'Author Paper', doi: '10.1/example' },
    { id: 'citation', kind: 'citation', pageIndex: 0, text: '[1]', doi: '10.1/example' },
    {
      id: 'order',
      kind: 'reading-order',
      pageIndex: 0,
      text: 'Alpha text',
      sequence: ['Alpha text', 'Beta text'],
    },
  ];
  const corpus = {
    schemaVersion: 1,
    description: 'test data',
    documents: [
      {
        id: 'doc',
        title: 'Example',
        pdf: {
          url: 'https://example.test/doc.pdf',
          sha256: hash,
          fileName: 'doc.pdf',
          license: 'not redistributed',
        },
        strata: ['example'],
        annotation: {
          kind: 'agent-source-verified',
          sources: ['https://example.test/source'],
          scope: 'selected checks',
        },
        checks,
      },
    ],
  };
  const parsed = {
    schemaVersion: 1,
    sourceFingerprint: 'pdf-fingerprint',
    backend: 'native',
    modelRevision: null,
    durationMs: 10,
    pages: [{ pageIndex: 0, viewBox: [0, 0, 100, 100], rotation: 0 }],
    regions: [
      region('t1', 'text', 'Alpha text', [0, 0, 10, 10]),
      region('duplicate', 'text', 'Alpha text', [0, 0, 10, 10]),
      region('t2', 'text', 'Beta text', [0, 15, 10, 25]),
      region('image', 'image', '', [0, 40, 10, 50], {
        sourceObject: { id: 'fig', kind: 'figure' },
      }),
      region('caption', 'caption', 'Figure 1: example', [0, 51, 10, 55], {
        sourceObject: { id: 'fig', kind: 'figure' },
      }),
      region('formula', 'formula', 'x = y', [0, 60, 10, 70]),
    ],
  };
  const references = {
    entries: [
      {
        id: 'r1',
        text: 'Author Paper',
        label: '',
        doi: '10.1/example',
        location: { pageIndex: 0, rects: [[0, 75, 10, 80]] },
      },
    ],
    occurrences: [
      {
        id: 'c1',
        text: '[1]',
        referenceIDs: ['r1'],
        location: { pageIndex: 0, rects: [[20, 0, 25, 5]] },
      },
    ],
  };
  const observation = {
    documentId: 'doc',
    backend: 'native',
    mode: 'cold',
    status: 'completed',
    pdfSha256: hash,
    adapterVersion: '1',
    modelRevision: null,
    parsed,
    references,
    taskOutcomes: [{ checkId: 't1', status: 'failed', detail: 'navigation failed' }],
  };
  return {
    corpus,
    observation,
    input: {
      schemaVersion: 1,
      run: { id: 'run', sourceCommit: 'abc', host: 'test', startedAt: '2026-01-01T00:00:00Z' },
      observations: [observation],
    },
  };
}
function withDirectory(run: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'neo-quality-test-'));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value));
}
function cli(script: string, args: string[]) {
  return spawnSync(process.execPath, [join(root, 'tools', script), ...args], { encoding: 'utf8' });
}
function evaluate(directory: string, corpus: unknown, input: unknown) {
  const corpusPath = join(directory, 'corpus.json'),
    inputPath = join(directory, 'input.json'),
    output = join(directory, 'report.json');
  writeJson(corpusPath, corpus);
  writeJson(inputPath, input);
  const result = cli('evaluate-document-quality.mjs', [
    '--corpus',
    corpusPath,
    '--observations',
    inputPath,
    '--output',
    output,
    '--markdown',
    join(directory, 'report.md'),
  ]);
  return { result, output };
}

async function captureWithFakeProfile(directory: string) {
  const { corpus } = fixture();
  const source = join(directory, 'corpus.json');
  const pdfs = join(directory, 'pdfs');
  const output = join(directory, 'capture.json');
  writeJson(source, corpus);
  mkdirSync(pdfs);
  writeFileSync(join(pdfs, 'doc.pdf'), bytes);
  const evaluations: string[] = [];
  const server = createServer((socket) => {
    const send = (message: unknown) => {
      const json = JSON.stringify(message);
      socket.write(`${Buffer.byteLength(json)}:${json}`);
    };
    send({ from: 'root' });
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const colon = buffer.indexOf(58);
        if (colon < 0) return;
        const length = Number(buffer.subarray(0, colon).toString());
        if (buffer.length < colon + 1 + length) return;
        const message = JSON.parse(buffer.subarray(colon + 1, colon + 1 + length).toString());
        buffer = buffer.subarray(colon + 1 + length);
        if (message.type === 'getProcess')
          send({ from: 'root', processDescriptor: { actor: 'process' } });
        else if (message.type === 'getTarget')
          send({ from: 'process', process: { consoleActor: 'console' } });
        else if (message.type === 'evaluateJSAsync') {
          evaluations.push(message.text);
          const resultID = `result-${evaluations.length}`;
          send({ from: 'console', resultID });
          send({
            from: 'console',
            type: 'evaluationResult',
            resultID,
            result: JSON.stringify(
              evaluations.length === 1
                ? { profile: '/tmp/quality', os: 'Linux', version: 'test' }
                : { error: 'Unexpected evaluation' },
            ),
          });
        }
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fake RDP address');
    const child = spawn(
      process.execPath,
      [
        join(root, 'tools/capture-document-quality.mjs'),
        '--corpus',
        source,
        '--directory',
        pdfs,
        '--profile',
        '/tmp/Quality',
        '--port',
        String(address.port),
        '--output',
        output,
      ],
      { cwd: root, timeout: 30000 },
    );
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text: string) => {
      stderr += text;
    });
    const [status] = (await once(child, 'close')) as [number | null];
    return { status, stderr, evaluations };
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
}

describe('document quality CLI', () => {
  it('rejects a case-different Linux profile before any import', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'neo-quality-capture-test-'));
    try {
      const result = await captureWithFakeProfile(directory);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('profile');
      expect(result.evaluations).toHaveLength(1);
      expect(result.evaluations.some((text) => text.includes('importFromFile'))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40000);

  it('separates selected static checks, actual tasks, overlap, mode and unavailable measurements', () =>
    withDirectory((directory) => {
      const { corpus, observation, input } = fixture();
      input.observations.push({
        ...observation,
        mode: 'warm',
        status: 'failed',
        failure: 'adapter error',
        parsed: undefined,
        references: undefined,
        taskOutcomes: undefined,
      } as unknown as typeof observation);
      const { result, output } = evaluate(directory, corpus, input);
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(readFileSync(output, 'utf8'));
      expect(report.summary.statuses).toMatchObject({ completed: 1, failed: 1 });
      expect(report.summary.selectedChecks.text).toMatchObject({
        passed: 1,
        measured: 2,
        notMeasured: 2,
      });
      expect(report.summary.selectedChecks.reference.passed).toBe(1);
      expect(report.summary.selectedChecks.citation.passed).toBe(1);
      expect(report.summary.selectedChecks['reading-order'].passed).toBe(1);
      expect(report.summary.objectIoU).toMatchObject({ measured: 1, notMeasured: 3, mean: 1 });
      expect(report.summary.actualTaskOutcomes.failed).toBe(1);
      expect(
        report.observations[0].checks.find((check: { checkId: string }) => check.checkId === 't1'),
      ).toMatchObject({ static: true, task: { status: 'failed' } });
      expect(
        report.groups.find((group: { mode: string }) => group.mode === 'cache').summary
          .observations,
      ).toBe(0);
      expect(readFileSync(join(directory, 'report.md'), 'utf8')).toContain('端到端');
    }));

  it('scores published body-caption geometry without requiring an exact caption transcription, but rejects a wrong caption box', () => {
    for (const correct of [true, false])
      withDirectory((directory) => {
        const { corpus, input } = fixture();
        corpus.documents[0]!.annotation.kind = 'dataset-ground-truth';
        const check = corpus.documents[0]!.checks.find((check) => check.id === 'object')!;
        Object.assign(check, {
          text: 'Figure 1: upstream partial transcription',
          captionRect: correct ? [0, 51, 10, 55] : [60, 51, 70, 55],
        });
        const { result, output } = evaluate(directory, corpus, input);
        expect(result.status, result.stderr).toBe(0);
        const report = JSON.parse(readFileSync(output, 'utf8'));
        const scored = report.observations[0].checks.find(
          (check: { checkId: string }) => check.checkId === 'object',
        );
        expect(scored.static).toBe(correct);
        if (correct) expect(scored).toMatchObject({ iou: 1, captionIoU: 1 });
      });
  });

  it('rejects wrong source, duplicate samples, invalid identities and empty corpora', () =>
    withDirectory((directory) => {
      const { corpus, input } = fixture();
      input.observations[0].pdfSha256 = '0'.repeat(64);
      expect(evaluate(directory, corpus, input).result.status).not.toBe(0);
      input.observations[0].pdfSha256 = hash;
      input.observations.push(input.observations[0]);
      expect(evaluate(directory, corpus, input).result.status).not.toBe(0);
      input.observations.pop();
      input.observations[0].parsed.backend = 'other';
      expect(evaluate(directory, corpus, input).result.status).not.toBe(0);
      corpus.documents = [];
      expect(evaluate(directory, corpus, input).result.status).not.toBe(0);
    }));

  it('accepts an empty author-year label but rejects empty reference identifiers', () =>
    withDirectory((directory) => {
      const { corpus, input } = fixture();
      const evaluated = evaluate(directory, corpus, input);
      expect(evaluated.result.status, evaluated.result.stderr).toBe(0);
      const report = JSON.parse(readFileSync(evaluated.output, 'utf8'));
      expect(report.summary.selectedChecks.reference.passed).toBe(1);
      input.observations[0].references.entries[0].doi = '';
      expect(evaluate(directory, corpus, input).result.status).not.toBe(0);
    }));

  it('reports an empty run as unobserved, not as a successful measurement', () =>
    withDirectory((directory) => {
      const { corpus, input } = fixture();
      input.observations = [];
      const { result, output } = evaluate(directory, corpus, input);
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(readFileSync(output, 'utf8'));
      expect(report.unobservedDocuments).toEqual(['doc']);
      expect(report.unobservedChecks.text).toBe(2);
      expect(report.summary.selectedChecks.text.measured).toBe(0);
    }));

  it('matches ordered nonoverlapping text within one region without reusing a repeated occurrence', () =>
    withDirectory((directory) => {
      const { corpus, input } = fixture();
      input.observations[0].parsed.regions[0].text = 'Alpha text Beta text';
      input.observations[0].parsed.regions.splice(1, 2);
      let evaluated = evaluate(directory, corpus, input);
      expect(evaluated.result.status, evaluated.result.stderr).toBe(0);
      let checks = JSON.parse(readFileSync(evaluated.output, 'utf8')).observations[0].checks;
      expect(checks.find((check: { checkId: string }) => check.checkId === 'order').static).toBe(
        true,
      );
      const order = corpus.documents[0].checks.find((check) => check.id === 'order');
      if (!order || !order.sequence) throw new Error('Missing order check');
      order.sequence = ['Alpha text', 'Alpha text'];
      evaluated = evaluate(directory, corpus, input);
      expect(evaluated.result.status, evaluated.result.stderr).toBe(0);
      checks = JSON.parse(readFileSync(evaluated.output, 'utf8')).observations[0].checks;
      expect(checks.find((check: { checkId: string }) => check.checkId === 'order').static).toBe(
        false,
      );
    }));

  it('counts distinct text spans in one region without double-counting overlapping duplicates', () =>
    withDirectory((directory) => {
      const { corpus, input } = fixture();
      corpus.documents[0].checks[1].text = 'Beta text';
      corpus.documents[0].checks.push({
        id: 'duplicate-alpha',
        kind: 'text',
        pageIndex: 0,
        text: 'Alpha text',
      });
      const regions = input.observations[0].parsed.regions;
      regions[0].text = 'Alpha text Beta text';
      regions[1].text = 'Alpha text Beta text';
      regions.splice(2, 1);
      const { result, output } = evaluate(directory, corpus, input);
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(readFileSync(output, 'utf8'));
      expect(report.summary.selectedChecks.text).toMatchObject({ passed: 2, measured: 3 });
      expect(
        report.observations[0].checks.find(
          (check: { checkId: string }) => check.checkId === 'duplicate-alpha',
        ).static,
      ).toBe(false);
    }));

  it('does not infer object links, citation identity or unperformed UI success', () =>
    withDirectory((directory) => {
      const { corpus, input } = fixture();
      input.observations[0].parsed.regions[3].sourceObject = { id: 'wrong', kind: 'figure' };
      input.observations[0].references.entries[0].doi = '10.1/wrong';
      input.observations[0].taskOutcomes = [];
      const { result, output } = evaluate(directory, corpus, input);
      expect(result.status, result.stderr).toBe(0);
      const checks = JSON.parse(readFileSync(output, 'utf8')).observations[0].checks;
      for (const id of ['object', 'reference', 'citation'])
        expect(checks.find((check: { checkId: string }) => check.checkId === id).static).toBe(
          false,
        );
      expect(
        checks.every(
          (check: { task: { status: string } }) => check.task.status === 'not-performed',
        ),
      ).toBe(true);
    }));

  it('uses actual geometry groups and retains legacy bibliography coverage as metadata', () =>
    withDirectory((directory) => {
      const { corpus, observation, input } = fixture();
      observation.parsed.regions[3].sourceObject = undefined;
      observation.parsed.regions[4].sourceObject = undefined;
      const extended = {
        ...input,
        observations: [
          {
            ...observation,
            references: { ...observation.references, bibliographyCoverage: 'complete' },
            objectGroups: [
              {
                id: 'group',
                kind: 'figure',
                label: '1',
                title: 'Figure 1: example',
                association: 'geometry',
                memberRegionIds: ['image', 'caption'],
                captionRegionIds: ['caption'],
              },
            ],
          },
        ],
      };
      const { result, output } = evaluate(directory, corpus, extended);
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(readFileSync(output, 'utf8'));
      expect(report.observations[0].bibliographyCoverage).toBe('complete');
      expect(
        report.observations[0].checks.find(
          (check: { checkId: string }) => check.checkId === 'object',
        ).static,
      ).toBe(true);
      extended.observations[0].objectGroups[0].association = 'ambiguous';
      const second = evaluate(directory, corpus, extended);
      expect(second.result.status, second.result.stderr).toBe(0);
      expect(
        JSON.parse(readFileSync(second.output, 'utf8')).observations[0].checks.find(
          (check: { checkId: string }) => check.checkId === 'object',
        ).static,
      ).toBe(false);
    }));

  it('accepts image table bodies only with an explicit table group or provider membership', () =>
    withDirectory((directory) => {
      const { corpus, observation, input } = fixture();
      const check = corpus.documents[0].checks.find((item) => item.id === 'object');
      if (!check) throw new Error('Missing object check');
      check.objectKind = 'table';
      check.text = 'Table 1: example';
      observation.parsed.regions[4].text = check.text;
      const grouped = {
        ...input,
        observations: [
          {
            ...observation,
            objectGroups: [
              {
                id: 'table',
                kind: 'table',
                label: '1',
                title: check.text,
                association: 'geometry',
                memberRegionIds: ['image', 'caption'],
                captionRegionIds: ['caption'],
              },
            ],
          },
        ],
      };
      let evaluated = evaluate(directory, corpus, grouped);
      expect(evaluated.result.status, evaluated.result.stderr).toBe(0);
      let checks = JSON.parse(readFileSync(evaluated.output, 'utf8')).observations[0].checks;
      expect(checks.find((item: { checkId: string }) => item.checkId === 'object')).toMatchObject({
        static: true,
        iou: 1,
      });
      evaluated = evaluate(directory, corpus, input);
      expect(evaluated.result.status, evaluated.result.stderr).toBe(0);
      checks = JSON.parse(readFileSync(evaluated.output, 'utf8')).observations[0].checks;
      expect(checks.find((item: { checkId: string }) => item.checkId === 'object').static).toBe(
        false,
      );
      observation.parsed.regions[3].sourceObject = { id: 'table', kind: 'table' };
      observation.parsed.regions[4].sourceObject = { id: 'table', kind: 'table' };
      evaluated = evaluate(directory, corpus, input);
      expect(evaluated.result.status, evaluated.result.stderr).toBe(0);
      checks = JSON.parse(readFileSync(evaluated.output, 'utf8')).observations[0].checks;
      expect(checks.find((item: { checkId: string }) => item.checkId === 'object')).toMatchObject({
        static: true,
        iou: 1,
      });
    }));

  it('rejects a nearby wrong object, retains its IoU, and selects the best eligible box', () =>
    withDirectory((directory) => {
      const { corpus, observation, input } = fixture();
      observation.parsed.regions[3].rect = [20, 40, 30, 50];
      const groups = [
        {
          id: 'wrong',
          kind: 'figure',
          label: '1',
          title: 'Figure 1: example',
          association: 'geometry',
          memberRegionIds: ['image', 'caption'],
          captionRegionIds: ['caption'],
        },
      ];
      const extended = { ...input, observations: [{ ...observation, objectGroups: groups }] };
      let evaluated = evaluate(directory, corpus, extended);
      expect(evaluated.result.status, evaluated.result.stderr).toBe(0);
      let report = JSON.parse(readFileSync(evaluated.output, 'utf8'));
      let checks = report.observations[0].checks;
      expect(report.objectIoUThreshold).toBe(0.5);
      expect(checks.find((check: { checkId: string }) => check.checkId === 'object')).toMatchObject(
        { static: false, iou: 0, iouReason: null, reason: 'object-iou-below-threshold' },
      );
      expect(
        checks.find((check: { checkId: string }) => check.checkId === 'unboxed'),
      ).toMatchObject({ static: true, iou: null, staticEvidence: 'localization-only' });
      expect(report.summary.objectIoU.measured).toBe(1);
      observation.parsed.regions.push(region('right', 'image', '', [0, 40, 5, 50]));
      groups.push({
        id: 'right-group',
        kind: 'figure',
        label: '1',
        title: 'Figure 1: example',
        association: 'geometry',
        memberRegionIds: ['right', 'caption'],
        captionRegionIds: ['caption'],
      });
      evaluated = evaluate(directory, corpus, extended);
      expect(evaluated.result.status, evaluated.result.stderr).toBe(0);
      report = JSON.parse(readFileSync(evaluated.output, 'utf8'));
      checks = report.observations[0].checks;
      expect(checks.find((check: { checkId: string }) => check.checkId === 'object')).toMatchObject(
        { static: true, iou: 0.5, iouReason: null },
      );
      expect(readFileSync(join(directory, 'report.md'), 'utf8')).toContain('0.5');
    }));

  it('publishes only hash-verified downloads and records a mismatch', () =>
    withDirectory((directory) => {
      const { corpus } = fixture();
      const source = join(directory, 'corpus.json'),
        output = join(directory, 'prepare.json'),
        pdfs = join(directory, 'pdfs'),
        preload = join(directory, 'fetch.mjs');
      writeJson(source, corpus);
      const run = (data: Buffer) => {
        writeFileSync(
          preload,
          `globalThis.fetch = async () => { const r = new Response(Buffer.from('${data.toString('base64')}', 'base64')); Object.defineProperty(r, 'url', { value: 'https://example.test/doc.pdf' }); return r; };`,
        );
        return spawnSync(
          process.execPath,
          [
            '--import',
            preload,
            join(root, 'tools/prepare-document-quality.mjs'),
            '--corpus',
            source,
            '--directory',
            pdfs,
            '--output',
            output,
            '--download',
            'yes',
          ],
          { encoding: 'utf8' },
        );
      };
      expect(run(Buffer.from('wrong')).status).not.toBe(0);
      expect(JSON.parse(readFileSync(output, 'utf8')).records[0]).toMatchObject({
        status: 'failed',
        actualSha256: expect.any(String),
        error: expect.any(String),
      });
      expect(run(bytes).status).toBe(0);
      expect(JSON.parse(readFileSync(output, 'utf8')).records[0].status).toBe('downloaded');
      expect(readFileSync(join(pdfs, 'doc.pdf'))).toEqual(bytes);
    }));

  it('reuses exact cached bytes and records corrupt existing files without replacing them', () =>
    withDirectory((directory) => {
      const { corpus } = fixture();
      const source = join(directory, 'corpus.json'),
        output = join(directory, 'prepare.json'),
        pdfs = join(directory, 'pdfs');
      writeJson(source, corpus);
      mkdirSync(pdfs);
      const pdf = join(pdfs, 'doc.pdf');
      writeFileSync(pdf, bytes);
      const args = [
        '--corpus',
        source,
        '--directory',
        pdfs,
        '--output',
        output,
        '--download',
        'yes',
      ];
      const first = cli('prepare-document-quality.mjs', args);
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(readFileSync(output, 'utf8')).records[0].status).toBe('reused');
      writeFileSync(pdf, 'corrupt');
      const second = cli('prepare-document-quality.mjs', args);
      expect(second.status).not.toBe(0);
      expect(JSON.parse(readFileSync(output, 'utf8')).records[0]).toMatchObject({
        status: 'failed',
        actualSha256: expect.any(String),
        error: expect.any(String),
      });
      expect(readFileSync(pdf, 'utf8')).toBe('corrupt');
      expect(cli('prepare-document-quality.mjs', args.slice(0, -2)).status).not.toBe(0);
    }));
});
