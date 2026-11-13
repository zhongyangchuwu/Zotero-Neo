#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  manifestIdentity,
  mergePromotion,
  outputJson,
  releaseEntry,
  requirePackagedIdentity,
  requireStableTag,
  root,
  sha256,
  xpiName,
} from './release-metadata.mjs';

const help = `Usage: node tools/prepare-release.mjs <vX.Y.Z> <XPI path> [--output <file>]
Validate the working source manifest and exact XPI, then emit candidate JSON.
Reads updates.json as the historical baseline; does not carry unpublished candidates.
Default output is JSON on stdout; --output explicitly writes a local file.
Never changes updates.json or writes to GitHub. Requires unzip.\n`;

function prepare() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(help);
    return;
  }
  if (
    ![2, 4].includes(args.length) ||
    args[0]?.startsWith('-') ||
    args[1]?.startsWith('-') ||
    (args.length === 4 && (args[2] !== '--output' || !args[3] || args[3].startsWith('-')))
  )
    throw new Error(help.trim());
  const [tag, input, , output] = args;
  requireStableTag(tag);
  const sourcePath = join(root, 'manifest.json');
  const officialPath = join(root, 'updates.json');
  const sourceBytes = readFileSync(sourcePath);
  const manifest = JSON.parse(sourceBytes.toString('utf8'));
  const identity = manifestIdentity(tag, manifest);
  const officialBytes = readFileSync(officialPath);
  const candidate = JSON.parse(officialBytes.toString('utf8'));
  const directory = mkdtempSync(join(tmpdir(), 'neo-prepare-release-'));
  try {
    const archive = join(directory, xpiName);
    const bytes = readFileSync(resolve(root, input));
    writeFileSync(archive, bytes);
    requirePackagedIdentity(tag, manifest, archive);
    const entry = releaseEntry(identity, sha256(bytes));
    mergePromotion(candidate, identity, entry);
    if (
      !readFileSync(sourcePath).equals(sourceBytes) ||
      !readFileSync(officialPath).equals(officialBytes)
    )
      throw new Error('source or official feed changed during preparation');
    outputJson(candidate, output, ['manifest.json', 'updates.json', input]);
    console.error(`[release] prepared ${tag}; official feed unchanged`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

try {
  prepare();
} catch (error) {
  console.error(`[release] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
