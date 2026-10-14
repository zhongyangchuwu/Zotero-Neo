#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { validateRelease } from './check-release.mjs';
import { listZipMembers, readZipMember } from './zip.mjs';

const root = resolve(import.meta.dirname, '..');
const xpiName = 'zotero-neo.xpi';
const checksumName = `${xpiName}.sha256`;

function command(program, args, binary = false) {
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: binary ? null : 'utf8',
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${program} ${args[0]} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function remoteCommit(tag) {
  const ref = `refs/tags/${tag}`;
  const output = command('git', ['ls-remote', 'origin', ref, `${ref}^{}`]);
  let direct;
  let peeled;
  // ls-remote emits SHA then ref; peel annotated tags to their commit.
  for (const line of output.trim().split('\n').filter(Boolean)) {
    const [sha, name] = line.split(/\s+/);
    if (name === ref) direct = sha;
    if (name === `${ref}^{}`) peeled = sha;
  }
  return peeled || direct;
}

function requireCommit(tag, expected) {
  const actual = remoteCommit(tag);
  if (actual !== expected) {
    throw new Error(`tag ${tag} resolves to ${actual || 'no commit'}, expected ${expected}`);
  }
}

function packagedManifest(archive) {
  if (listZipMembers(archive).filter((name) => name === 'manifest.json').length !== 1) {
    throw new Error('XPI must contain exactly one manifest.json');
  }
  command('unzip', ['-t', archive]);
  return JSON.parse(readZipMember(archive, 'manifest.json').toString('utf8'));
}

function publish() {
  const [tag, expectedCommit, inputXpi] = process.argv.slice(2);
  if (!/^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$/.test(tag || '')) {
    throw new Error('expected a version tag');
  }
  if (!/^[0-9a-f]{40}$/.test(expectedCommit || '') || !inputXpi) {
    throw new Error('expected source commit SHA and canonical XPI path');
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) {
    throw new Error('GITHUB_REPOSITORY must identify the release repository');
  }
  if (command('git', ['rev-parse', 'HEAD']).trim() !== expectedCommit) {
    throw new Error('checked-out source does not match expected source commit');
  }

  const manifest = readJson(join(root, 'manifest.json'));
  const updates = readJson(join(root, 'updates.candidate.json'));
  const addonId = validateRelease(tag, manifest, updates);
  const directory = mkdtempSync(join(tmpdir(), 'zotero-neo-release-'));
  try {
    // Upload the exact snapshot whose digest was admitted by the prepared feed.
    const archive = join(directory, xpiName);
    const bytes = readFileSync(resolve(root, inputXpi));
    const digest = sha256(bytes);
    writeFileSync(archive, bytes);
    const packaged = packagedManifest(archive);
    if (validateRelease(tag, packaged, updates) !== addonId) {
      throw new Error('packaged extension identity differs from source manifest');
    }
    const entry = updates.addons[addonId].updates.find(
      (update) => update.version === manifest.version,
    );
    if (entry.update_hash !== `sha256:${digest}`) {
      throw new Error('prepared update_hash does not match canonical XPI SHA256');
    }
    const checksum = `${digest}  ${xpiName}\n`;
    const checksumPath = join(directory, checksumName);
    writeFileSync(checksumPath, checksum);

    const api = `repos/${repository}`;
    // The tag endpoint only finds published releases. Listing includes drafts
    // for this authenticated writer; require a unique exact match across pages.
    const getRelease = (id) => {
      const release = JSON.parse(command('gh', ['api', `${api}/releases/${id}`]));
      if (release.id !== id) throw new Error('release response does not match captured ID');
      return release;
    };
    const discoverRelease = () => {
      const releases = JSON.parse(
        command('gh', ['api', '--paginate', '--slurp', `${api}/releases?per_page=100`]),
      )
        .flat()
        .filter((release) => release.tag_name === tag);
      if (releases.length > 1) throw new Error('release tag is ambiguous; refusing mutation');
      return releases.length === 0 ? null : getRelease(releases[0].id);
    };
    const getAssets = (release) =>
      JSON.parse(
        command('gh', ['api', '--paginate', '--slurp', `${api}/releases/${release.id}/assets`]),
      ).flat();
    const checkRelease = (release) => {
      if (
        !release ||
        release.tag_name !== tag ||
        !Number.isSafeInteger(release.id) ||
        release.id <= 0 ||
        typeof release.draft !== 'boolean'
      ) {
        throw new Error('release identity is missing or inconsistent');
      }
    };
    const assetIdentity = (assets) =>
      assets
        .map(({ id, name, size, state }) => ({ id, name, size, state }))
        .sort((left, right) => left.name.localeCompare(right.name));
    const refresh = (release, expectedAssets) => {
      requireCommit(tag, expectedCommit);
      const current = getRelease(release.id);
      checkRelease(current);
      if (
        current.id !== release.id ||
        current.draft !== release.draft ||
        current.upload_url !== release.upload_url ||
        JSON.stringify(assetIdentity(getAssets(current))) !==
          JSON.stringify(assetIdentity(expectedAssets))
      ) {
        throw new Error('release changed before mutation or during verification');
      }
      return current;
    };
    const verifyAssets = (release) => {
      checkRelease(release);
      const assets = getAssets(release);
      if (
        assets.length !== 2 ||
        ![xpiName, checksumName].every(
          (name) =>
            assets.filter((asset) => asset.name === name && asset.state === 'uploaded').length ===
            1,
        )
      ) {
        throw new Error(
          'existing release must contain exactly the canonical XPI and checksum; refusing repair',
        );
      }
      const download = (name) => {
        const asset = assets.find((entry) => entry.name === name);
        if (!Number.isSafeInteger(asset.id) || asset.id <= 0) {
          throw new Error('release asset identity is invalid');
        }
        return command(
          'gh',
          ['api', `${api}/releases/assets/${asset.id}`, '-H', 'Accept: application/octet-stream'],
          true,
        );
      };
      const published = download(xpiName);
      if (
        sha256(published) !== digest ||
        !published.equals(bytes) ||
        download(checksumName).toString('utf8') !== checksum
      ) {
        throw new Error('existing release bytes or checksum differ; refusing overwrite');
      }
      refresh(release, assets);
      return assets;
    };

    let release = discoverRelease();
    const commit = remoteCommit(tag);
    if (commit && commit !== expectedCommit) {
      throw new Error(`tag ${tag} resolves to ${commit}, expected ${expectedCommit}`);
    }
    if (!commit) {
      if (
        release ||
        process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
        process.env.GITHUB_REF !== 'refs/heads/main'
      ) {
        throw new Error('release tag is absent; only manual main publication may create it');
      }
      command('git', ['tag', tag, expectedCommit]);
      command('git', ['push', 'origin', `refs/tags/${tag}`]);
    }
    requireCommit(tag, expectedCommit);

    if (!release) {
      requireCommit(tag, expectedCommit);
      // Creating through the API returns the new ID/upload URL directly; a
      // subsequent tag lookup could admit a replacement release instead.
      release = JSON.parse(
        command('gh', [
          'api',
          '--method',
          'POST',
          `${api}/releases`,
          '-f',
          `tag_name=${tag}`,
          '-f',
          `target_commitish=${expectedCommit}`,
          '-f',
          `name=Zotero Neo ${tag}`,
          '-F',
          'draft=true',
          '-F',
          'generate_release_notes=true',
        ]),
      );
      checkRelease(release);
      if (release.draft !== true) throw new Error('new release is not a draft; refusing upload');
      const uploadUrl = release.upload_url?.replace(/\{\?name,label\}$/, '');
      if (uploadUrl !== `https://uploads.github.com/${api}/releases/${release.id}/assets`) {
        throw new Error('release upload URL does not match admitted release identity');
      }
      const admittedAssets = [];
      // GitHub has no atomic draft-only upload precondition. Refresh the exact
      // ID and complete admitted asset state immediately before each mutation;
      // never resolve a tag again or claim protection from an external writer
      // publishing between this read and the server accepting the upload.
      for (const [name, file, mediaType, size] of [
        [xpiName, archive, 'application/zip', bytes.length],
        [checksumName, checksumPath, 'text/plain; charset=utf-8', Buffer.byteLength(checksum)],
      ]) {
        refresh(release, admittedAssets);
        const asset = JSON.parse(
          command('gh', [
            'api',
            '--method',
            'POST',
            `${uploadUrl}?name=${encodeURIComponent(name)}`,
            '--input',
            file,
            '-H',
            `Content-Type: ${mediaType}`,
            '-H',
            `Content-Length: ${size}`,
          ]),
        );
        if (
          !Number.isSafeInteger(asset.id) ||
          asset.id <= 0 ||
          asset.name !== name ||
          asset.state !== 'uploaded' ||
          asset.size !== size
        ) {
          throw new Error('uploaded asset identity or size does not match admitted bytes');
        }
        admittedAssets.push(asset);
      }
    }
    const verifiedAssets = verifyAssets(release);
    if (release.draft) {
      refresh(release, verifiedAssets);
      command('gh', [
        'api',
        '--method',
        'PATCH',
        `${api}/releases/${release.id}`,
        '-F',
        'draft=false',
      ]);
      console.log(`[release] published ${tag} at ${expectedCommit} (${digest})`);
    } else {
      console.log(`[release] ${tag} already contains identical verified assets; no changes`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

try {
  publish();
} catch (error) {
  console.error(`[release] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
