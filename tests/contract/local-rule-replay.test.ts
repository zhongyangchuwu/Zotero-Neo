import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it.each([
  { description: 'replays native geometry without a cache adapter', compare: false },
  { description: 'refuses a comparison against an empty baseline', compare: true },
])(
  '$description',
  ({ compare }) => {
    const directory = mkdtempSync(join(tmpdir(), 'neo-rule-replay-test-'));
    try {
      const geometry = join(directory, 'geometry');
      mkdirSync(geometry);
      const corpus = join(directory, 'corpus.json');
      const baseline = join(directory, 'baseline.json');
      const output = join(directory, 'output.json');
      const hash = 'a'.repeat(64);
      writeFileSync(
        corpus,
        JSON.stringify({
          schemaVersion: 1,
          description: 'Synthetic CLI comparison fixture; not a PDF quality measurement.',
          documents: [
            {
              id: 'synthetic',
              title: 'Synthetic geometry fixture',
              pdf: {
                url: 'https://fixture.test/synthetic.pdf',
                sha256: hash,
                fileName: 'synthetic.pdf',
                license: 'Synthetic fixture; no PDF bytes.',
              },
              strata: ['synthetic'],
              annotation: {
                kind: 'agent-source-verified',
                sources: ['Synthetic test fixture'],
                scope: 'Schema-valid test metadata only; not actual source annotations.',
              },
              checks: [
                { id: 'one', kind: 'text', pageIndex: 0, text: 'First text check' },
                { id: 'two', kind: 'text', pageIndex: 0, text: 'Second text check' },
              ],
            },
          ],
        }),
      );
      writeFileSync(
        join(geometry, 'synthetic.json'),
        JSON.stringify({
          documentId: 'synthetic',
          pdfSha256: hash,
          sourceFingerprint: 'synthetic-source',
          pages: [
            {
              pageIndex: 0,
              viewBox: [0, 0, 600, 800],
              text: [{ text: 'First text check', rect: [20, 300, 120, 312], fontSize: 12 }],
              graphics: [],
            },
          ],
        }),
      );
      writeFileSync(baseline, JSON.stringify({ observations: [] }));
      const root = resolve(import.meta.dirname, '../..');
      const run = spawnSync(
        process.execPath,
        [
          join(root, 'tools/replay-local-rules.mjs'),
          '--corpus',
          corpus,
          '--geometry',
          geometry,
          ...(compare ? ['--baseline', baseline] : []),
          '--output',
          output,
        ],
        { cwd: root, encoding: 'utf8', timeout: 20000 },
      );
      expect(run.error).toBeUndefined();
      if (compare) {
        expect(run.status).toBe(1);
        expect(existsSync(output)).toBe(false);
      } else {
        expect(run.status, run.stderr).toBe(0);
        const report = JSON.parse(readFileSync(output, 'utf8'));
        expect(report.observations).toHaveLength(1);
        expect(report.observations[0]).toMatchObject({
          backend: 'local-rules',
          status: 'completed',
          parsed: {
            sourceFingerprint: 'synthetic-source',
            regions: expect.arrayContaining([
              expect.objectContaining({ text: 'First text check' }),
            ]),
          },
        });
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  30000,
);
