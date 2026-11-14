import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
export const shaPattern = /^[a-f0-9]{64}$/i;
export function assert(condition, message) {
  if (!condition) throw new Error(message);
}
export function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function options(args, repeated, single, required) {
  const result = Object.fromEntries(repeated.map((key) => [key, []]));
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    assert(
      key.startsWith('--') && (repeated.includes(key.slice(2)) || single.includes(key.slice(2))),
      `Unknown option: ${key}`,
    );
    const name = key.slice(2);
    const value = args[++i];
    assert(nonempty(value) && !value.startsWith('--'), `Missing value for ${key}`);
    if (repeated.includes(name)) result[name].push(value);
    else {
      assert(result[name] === undefined, `Duplicate option: ${key}`);
      result[name] = value;
    }
  }
  for (const key of required)
    assert(
      Array.isArray(result[key]) ? result[key].length : nonempty(result[key]),
      `Missing --${key}`,
    );
  return result;
}
export function protectOutputs(inputs, outputs) {
  const paths = outputs.filter(Boolean).map((path) => resolve(path));
  assert(new Set(paths).size === paths.length, 'Output paths must be distinct');
  const sources = new Set(inputs.map((path) => resolve(path)));
  for (const path of paths) assert(!sources.has(path), 'Output must not overwrite an input');
}
export function validRect(rect) {
  return (
    Array.isArray(rect) &&
    rect.length === 4 &&
    rect.every(Number.isFinite) &&
    rect[0] < rect[2] &&
    rect[1] < rect[3]
  );
}
export function loadCorpus(paths) {
  const documents = [];
  const ids = new Set();
  const hashes = new Set();
  for (const path of paths) {
    const corpus = json(path);
    assert(
      corpus &&
        corpus.schemaVersion === 1 &&
        nonempty(corpus.description) &&
        Array.isArray(corpus.documents),
      `Invalid corpus: ${path}`,
    );
    for (const doc of corpus.documents) {
      assert(
        doc &&
          nonempty(doc.id) &&
          /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(doc.id) &&
          nonempty(doc.title),
        'Invalid document identity',
      );
      assert(!ids.has(doc.id), `Duplicate document id: ${doc.id}`);
      ids.add(doc.id);
      assert(
        doc.pdf &&
          nonempty(doc.pdf.url) &&
          /^https:\/\//i.test(doc.pdf.url) &&
          shaPattern.test(doc.pdf.sha256) &&
          doc.pdf.fileName === `${doc.id}.pdf` &&
          nonempty(doc.pdf.license),
        `Invalid PDF source: ${doc.id}`,
      );
      assert(!hashes.has(doc.pdf.sha256.toLowerCase()), `Duplicate PDF hash: ${doc.id}`);
      hashes.add(doc.pdf.sha256.toLowerCase());
      assert(
        Array.isArray(doc.strata) && doc.strata.length > 0 && doc.strata.every(nonempty),
        `Invalid strata: ${doc.id}`,
      );
      assert(
        ['agent-source-verified', 'dataset-ground-truth'].includes(doc.annotation?.kind) &&
          Array.isArray(doc.annotation.sources) &&
          doc.annotation.sources.length > 0 &&
          doc.annotation.sources.every(nonempty) &&
          nonempty(doc.annotation.scope),
        `Invalid annotation: ${doc.id}`,
      );
      assert(Array.isArray(doc.checks) && doc.checks.length >= 2, `Insufficient checks: ${doc.id}`);
      const checks = new Set();
      for (const check of doc.checks) {
        assert(
          check &&
            nonempty(check.id) &&
            !checks.has(check.id) &&
            ['text', 'object', 'reference', 'citation', 'reading-order'].includes(check.kind) &&
            Number.isInteger(check.pageIndex) &&
            check.pageIndex >= 0 &&
            nonempty(check.text),
          `Invalid check in ${doc.id}`,
        );
        checks.add(check.id);
        if (check.kind === 'object')
          assert(
            ['figure', 'table', 'formula'].includes(check.objectKind),
            `Invalid object kind: ${doc.id}/${check.id}`,
          );
        if (check.rect !== undefined)
          assert(validRect(check.rect), `Invalid rectangle: ${doc.id}/${check.id}`);
        if (check.captionRect !== undefined)
          assert(validRect(check.captionRect), `Invalid caption rectangle: ${doc.id}/${check.id}`);
        for (const key of ['doi', 'arxivID', 'referenceText'])
          if (check[key] !== undefined)
            assert(nonempty(check[key]), `Invalid ${key}: ${doc.id}/${check.id}`);
        if (check.kind === 'reading-order')
          assert(
            Array.isArray(check.sequence) &&
              check.sequence.length >= 2 &&
              check.sequence.every(nonempty),
            `Invalid sequence: ${doc.id}/${check.id}`,
          );
      }
      documents.push(doc);
    }
  }
  assert(documents.length > 0, 'Corpus is empty');
  return documents;
}
