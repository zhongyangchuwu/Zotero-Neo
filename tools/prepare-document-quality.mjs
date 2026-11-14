#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  linkSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assert, loadCorpus, options, protectOutputs } from './document-quality-common.mjs';

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function prepare(doc, directory) {
  const destination = join(directory, doc.pdf.fileName);
  const expected = doc.pdf.sha256.toLowerCase();
  const record = {
    documentId: doc.id,
    url: doc.pdf.url,
    expectedSha256: expected,
    file: destination,
    status: 'failed',
    actualSha256: null,
    finalUrl: null,
    error: null,
  };
  let temporary;
  try {
    if (existsSync(destination)) {
      record.actualSha256 = await hashFile(destination);
      assert(record.actualSha256 === expected, 'Existing file SHA-256 mismatch; left untouched');
      record.status = 'reused';
      return record;
    }
    temporary = join(directory, `.${doc.id}.${randomUUID()}.part`);
    const response = await fetch(doc.pdf.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(120000),
    });
    record.finalUrl = response.url;
    assert(
      response.ok && response.body && /^https:\/\//i.test(response.url),
      `Download failed: HTTP ${response.status} or non-HTTPS redirect`,
    );
    const hash = createHash('sha256');
    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(chunk, _encoding, callback) {
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(temporary, { flags: 'wx' }),
    );
    record.actualSha256 = hash.digest('hex');
    assert(record.actualSha256 === expected, 'Downloaded file SHA-256 mismatch');
    // Exclusive atomic publication refuses to replace a concurrent destination.
    linkSync(temporary, destination);
    rmSync(temporary);
    temporary = undefined;
    record.status = 'downloaded';
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (temporary) rmSync(temporary, { force: true });
  }
  return record;
}
try {
  const args = options(
    process.argv.slice(2),
    ['corpus'],
    ['directory', 'output', 'download'],
    ['corpus', 'directory', 'output', 'download'],
  );
  assert(args.download === 'yes', 'Network access requires --download yes');
  protectOutputs(args.corpus, [args.output]);
  const docs = loadCorpus(args.corpus);
  const destinations = docs.map((doc) => join(args.directory, doc.pdf.fileName));
  protectOutputs([...args.corpus, ...destinations], [args.output]);
  mkdirSync(args.directory, { recursive: true });
  const records = [];
  for (const doc of docs) records.push(await prepare(doc, args.directory));
  writeFileSync(args.output, `${JSON.stringify({ schemaVersion: 1, records }, null, 2)}\n`);
  if (records.some((record) => record.status === 'failed')) process.exitCode = 1;
} catch (error) {
  console.error(
    `[document-quality-prepare] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
