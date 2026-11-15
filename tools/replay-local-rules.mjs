import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  assert,
  json,
  loadCorpus,
  nonempty,
  options,
  protectOutputs,
  validRect,
} from './document-quality-common.mjs';

const root = resolve(import.meta.dirname, '..');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** This capture format stores unrotated native PDF geometry, not rendered pixels or gold boxes. */
function capture(path, document) {
  const raw = json(path);
  assert(
    raw.documentId === document.id && raw.pdfSha256 === document.pdf.sha256,
    `Native input identity differs: ${document.id}`,
  );
  assert(nonempty(raw.sourceFingerprint), `Missing source fingerprint: ${document.id}`);
  assert(Array.isArray(raw.pages) && raw.pages.length > 0, `Missing pages: ${document.id}`);
  for (const [index, page] of raw.pages.entries()) {
    assert(
      page.pageIndex === index &&
        validRect(page.viewBox) &&
        (page.rotation === undefined || page.rotation === 0) &&
        Array.isArray(page.text) &&
        page.text.every(
          (text) =>
            typeof text.text === 'string' &&
            validRect(text.rect) &&
            Number.isFinite(text.fontSize) &&
            text.fontSize > 0,
        ) &&
        Array.isArray(page.graphics) &&
        page.graphics.every(validRect),
      `Invalid unrotated native page: ${document.id}/${index}`,
    );
  }
  return raw;
}

try {
  const args = options(
    process.argv.slice(2),
    ['corpus', 'geometry', 'baseline'],
    ['profile', 'output', 'diagnostics'],
    ['corpus', 'geometry', 'output'],
  );
  const documents = loadCorpus(args.corpus);
  const inputs = documents.map((document) => {
    assert(!/[\\/]/u.test(document.id), `Invalid document id: ${document.id}`);
    const paths = args.geometry
      .map((directory) => join(directory, `${document.id}.json`))
      .filter(existsSync);
    assert(
      paths.length === 1,
      `Expected one native capture for ${document.id}, found ${paths.length}`,
    );
    return { document, path: paths[0] };
  });
  const outputPaths = [args.output, args.diagnostics].filter(Boolean);
  protectOutputs(
    [...args.corpus, ...args.baseline, ...inputs.map(({ path }) => path), args.profile].filter(
      Boolean,
    ),
    outputPaths,
  );
  for (const path of outputPaths) assert(!existsSync(path), `Output already exists: ${path}`);
  const bundle = await build({
    absWorkingDir: root,
    stdin: {
      contents: [
        "export { localDocumentRegions, parseLocalRuleProfile } from './src/document-analysis/local-rules';",
        "export { documentObjectGroups } from './src/document-analysis/object-groups';",
        "export { localDocumentCacheKey } from './src/document-analysis/local';",
      ].join('\n'),
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const code = bundle.outputFiles[0].text;
  const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const profileText = args.profile ? readFileSync(args.profile, 'utf8') : '';
  const profile = api.parseLocalRuleProfile(profileText);
  const key = api.localDocumentCacheKey(profile);
  const baselines = new Map();
  for (const path of args.baseline) {
    const baseline = json(path);
    assert(Array.isArray(baseline.observations), `Invalid baseline: ${path}`);
    for (const observation of baseline.observations) {
      assert(
        !baselines.has(observation.documentId),
        `Duplicate baseline: ${observation.documentId}`,
      );
      baselines.set(observation.documentId, observation);
    }
  }
  const comparisonRequested = args.baseline.length > 0;
  if (comparisonRequested) {
    for (const { document } of inputs) {
      assert(
        baselines.get(document.id)?.pdfSha256 === document.pdf.sha256,
        `Missing/different baseline: ${document.id}`,
      );
    }
  }
  const report = {
    schemaVersion: 1,
    run: {
      id: `local-rule-replay-${Date.now()}-${sha256(profile.fingerprint).slice(0, 12)}`,
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      sourceTree: 'working-tree',
      sourceSha256: Object.fromEntries(
        Object.keys(bundle.metafile.inputs)
          .filter((path) => path.startsWith('src/'))
          .sort()
          .map((path) => [path, sha256(readFileSync(resolve(root, path)))]),
      ),
      bundleSha256: sha256(code),
      profile: { version: profile.version, rules: profile.rules, association: profile.association },
      profileFingerprint: profile.fingerprint,
      host: `Node ${process.version}; immutable native PDF text/graphics replay; no Zotero or DOM`,
      startedAt: new Date().toISOString(),
      protocol:
        'Production local rules and object grouping, full unrotated native capture. PDF identity is checked against capture metadata, not by rereading PDF bytes. Duration is grouping replay only, excluding native extraction, bundling and Reader initialization. Optional diagnostics add observer cost. No gold geometry is used as rule input. Selected checks do not measure exhaustive precision, complete crop fidelity or Zotero task success.',
    },
    observations: [],
    replay: { comparisonRequested, inputs: [], comparisons: [] },
  };
  const diagnostics = args.diagnostics
    ? { schemaVersion: 1, profileFingerprint: profile.fingerprint, documents: [] }
    : null;
  for (const { document, path } of inputs) {
    const raw = capture(path, document);
    const events = diagnostics ? [] : null;
    const started = performance.now();
    const observation = {
      documentId: document.id,
      pdfSha256: document.pdf.sha256,
      backend: key.backend,
      adapterVersion: String(key.adapterVersion),
      modelRevision: null,
      mode: 'cold',
      status: 'completed',
      durationMs: 0,
    };
    try {
      const regions = api.localDocumentRegions(
        raw.pages,
        profile,
        events ? (event) => events.push(event) : undefined,
      );
      const objectGroups = api.documentObjectGroups(regions);
      observation.durationMs = performance.now() - started;
      observation.parsed = {
        schemaVersion: 1,
        sourceFingerprint: raw.sourceFingerprint,
        backend: key.backend,
        modelRevision: null,
        durationMs: observation.durationMs,
        pages: raw.pages.map(({ pageIndex, viewBox }) => ({ pageIndex, viewBox, rotation: 0 })),
        regions,
      };
      observation.objectGroups = objectGroups;
    } catch (error) {
      observation.status = 'failed';
      observation.failure = error instanceof Error ? error.message : String(error);
      observation.durationMs = performance.now() - started;
    }
    if (comparisonRequested) {
      const baseline = baselines.get(document.id);
      report.replay.comparisons.push({
        documentId: document.id,
        regionsIdentical: isDeepStrictEqual(observation.parsed?.regions, baseline.parsed?.regions),
        objectGroupsIdentical: isDeepStrictEqual(observation.objectGroups, baseline.objectGroups),
        baselineStatus: baseline.status,
        status: observation.status,
      });
    }
    report.observations.push(observation);
    report.replay.inputs.push({
      documentId: document.id,
      path: resolve(path),
      sha256: sha256(readFileSync(path)),
      sourcePages: raw.pages.length,
      decoder: raw.decoder,
      captureHarnessSha256: raw.harnessSha256,
    });
    if (diagnostics) diagnostics.documents.push({ documentId: document.id, events });
  }
  report.run.finishedAt = new Date().toISOString();
  writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  if (diagnostics)
    writeFileSync(args.diagnostics, `${JSON.stringify(diagnostics, null, 2)}\n`, { flag: 'wx' });
  const failed = report.observations.filter(
    (observation) => observation.status !== 'completed',
  ).length;
  console.log(
    JSON.stringify({
      output: args.output,
      documents: report.observations.length,
      failed,
      profileFingerprint: profile.fingerprint,
      comparisonRequested,
      comparedDocuments: report.replay.comparisons.length,
      changedDocuments: comparisonRequested
        ? report.replay.comparisons
            .filter((entry) => !entry.regionsIdentical || !entry.objectGroupsIdentical)
            .map((entry) => entry.documentId)
        : null,
      diagnostics: args.diagnostics ?? null,
    }),
  );
  if (failed) process.exitCode = 1;
} catch (error) {
  console.error(`[local-rule-replay] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
