#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  admittedEntry,
  checksumName,
  command,
  manifestIdentity,
  mergePromotion,
  outputJson,
  publicDownload,
  requirePackagedIdentity,
  requireStableTag,
  sha256,
  xpiName,
} from './release-metadata.mjs';

const help = `Usage: node tools/promote-release.mjs <vX.Y.Z> <source SHA> --output <file|->
Read the exact public stable GitHub Release, tag source and downloaded assets.
Merge into the publicly served official feed, preserving its historical entries.
Write reviewable JSON to an explicit local path (or stdout with --output -).
Never pushes, publishes, uploads or overwrites updates.json/updates.candidate.json.
Requires GITHUB_REPOSITORY=owner/repo, git, gh, curl and unzip.
Concurrent identities are rechecked before output, not atomically locked by GitHub.\n`;

function promote() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(help);
    return;
  }
  if (args.length !== 4 || args[2] !== '--output' || !args[3]) throw new Error(help.trim());
  const [tag, expectedCommit, , output] = args;
  requireStableTag(tag);
  if (!/^[0-9a-f]{40}$/.test(expectedCommit || '')) throw new Error('expected source commit SHA');
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) {
    throw new Error('GITHUB_REPOSITORY must identify the release repository');
  }
  const remote = `https://github.com/${repository}.git`;
  const ref = `refs/tags/${tag}`;
  const captureTag = () => {
    const lines = command('git', ['ls-remote', remote, ref, `${ref}^{}`])
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort();
    const refs = new Map(lines.map((line) => line.split(/\s+/).reverse()));
    if (
      refs.size !== lines.length ||
      !refs.has(ref) ||
      (refs.get(`${ref}^{}`) || refs.get(ref)) !== expectedCommit
    )
      throw new Error('remote tag does not resolve to expected source commit');
    return lines.join('\n');
  };
  const capturedTag = captureTag();
  // Only local objects/FETCH_HEAD change. The remote repository is read-only.
  command('git', ['fetch', '--no-tags', remote, ref]);
  if (command('git', ['rev-parse', 'FETCH_HEAD^{commit}']).trim() !== expectedCommit) {
    throw new Error('fetched tag does not match expected source commit');
  }
  const sourceJson = (path) => JSON.parse(command('git', ['show', `${expectedCommit}:${path}`]));
  const manifest = sourceJson('manifest.json');
  const candidate = sourceJson('updates.candidate.json');
  const identity = manifestIdentity(tag, manifest, repository);
  const api = `repos/${repository}`;
  const get = (endpoint) => JSON.parse(command('gh', ['api', endpoint]));
  const getTaggedRelease = () => {
    const matches = JSON.parse(
      command('gh', ['api', '--paginate', '--slurp', `${api}/releases?per_page=100`]),
    )
      .flat()
      .filter((release) => release.tag_name === tag);
    if (matches.length !== 1) throw new Error('release tag is missing or ambiguous');
    const release = get(`${api}/releases/tags/${tag}`);
    if (release.id !== matches[0].id) throw new Error('release tag identity is inconsistent');
    return release;
  };
  const releaseIdentity = (release) => {
    if (
      !Number.isSafeInteger(release.id) ||
      release.id <= 0 ||
      release.tag_name !== tag ||
      release.draft !== false ||
      release.prerelease !== false ||
      !release.published_at ||
      release.html_url !== `https://github.com/${repository}/releases/tag/${tag}`
    )
      throw new Error('release must have an exact public non-draft non-prerelease identity');
    return JSON.stringify({
      id: release.id,
      node_id: release.node_id,
      tag_name: release.tag_name,
      draft: release.draft,
      prerelease: release.prerelease,
      published_at: release.published_at,
      updated_at: release.updated_at,
      html_url: release.html_url,
      target_commitish: release.target_commitish,
    });
  };
  const release = getTaggedRelease();
  const capturedRelease = releaseIdentity(release);
  if (releaseIdentity(get(`${api}/releases/${release.id}`)) !== capturedRelease) {
    throw new Error('release changed during discovery');
  }
  const getAssets = () =>
    JSON.parse(
      command('gh', ['api', '--paginate', '--slurp', `${api}/releases/${release.id}/assets`]),
    ).flat();
  const assets = getAssets();
  if (
    assets.length !== 2 ||
    ![xpiName, checksumName].every(
      (name) => assets.filter((asset) => asset.name === name).length === 1,
    ) ||
    new Set(assets.map((asset) => asset.id)).size !== 2 ||
    assets.some(
      (asset) =>
        !Number.isSafeInteger(asset.id) ||
        asset.id <= 0 ||
        asset.state !== 'uploaded' ||
        !Number.isSafeInteger(asset.size) ||
        asset.size <= 0 ||
        asset.browser_download_url !==
          `${identity.homepage}/releases/download/${tag}/${asset.name}`,
    )
  )
    throw new Error(
      'release must contain exactly the canonical XPI and checksum with consistent identities',
    );
  const assetIdentity = (values) =>
    JSON.stringify(
      values
        .map((asset) => ({
          id: asset.id,
          node_id: asset.node_id,
          name: asset.name,
          size: asset.size,
          state: asset.state,
          browser_download_url: asset.browser_download_url,
          digest: asset.digest,
          updated_at: asset.updated_at,
        }))
        .sort((left, right) => left.id - right.id),
    );
  const capturedAssets = assetIdentity(assets);
  const download = (name) => {
    const asset = assets.find((value) => value.name === name);
    const bytes = command(
      'gh',
      ['api', `${api}/releases/assets/${asset.id}`, '-H', 'Accept: application/octet-stream'],
      true,
    );
    if (bytes.length !== asset.size || !publicDownload(asset.browser_download_url).equals(bytes)) {
      throw new Error('public asset bytes or size differ from captured release asset');
    }
    return bytes;
  };
  const bytes = download(xpiName);
  const digest = sha256(bytes);
  if (download(checksumName).toString('utf8') !== `${digest}  ${xpiName}\n`) {
    throw new Error('release checksum does not match downloaded XPI SHA256');
  }
  const directory = mkdtempSync(join(tmpdir(), 'neo-promote-release-'));
  try {
    const archive = join(directory, xpiName);
    writeFileSync(archive, bytes);
    requirePackagedIdentity(tag, manifest, archive, repository);
    const { entry } = admittedEntry(tag, manifest, candidate, digest, repository);
    const officialBytes = publicDownload(identity.updateUrl);
    const next = mergePromotion(JSON.parse(officialBytes.toString('utf8')), identity, entry);
    // Optimistic read-back detects observed races only. GitHub offers no atomic
    // snapshot spanning refs, Release/assets and the independently served feed.
    if (
      captureTag() !== capturedTag ||
      releaseIdentity(getTaggedRelease()) !== capturedRelease ||
      releaseIdentity(get(`${api}/releases/${release.id}`)) !== capturedRelease ||
      assetIdentity(getAssets()) !== capturedAssets ||
      !publicDownload(identity.updateUrl).equals(officialBytes)
    )
      throw new Error('tag, release, assets or official feed changed during verification');
    outputJson(next, output === '-' ? undefined : output, [
      'manifest.json',
      'updates.json',
      'updates.candidate.json',
    ]);
    console.error(`[release] verified ${tag} at ${expectedCommit}; review JSON before applying`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

try {
  promote();
} catch (error) {
  console.error(`[release] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
