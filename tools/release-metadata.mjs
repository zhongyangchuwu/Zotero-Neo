import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { validateRelease } from './check-release.mjs';
import { listZipMembers, readZipMember } from './zip.mjs';

export const root = resolve(import.meta.dirname, '..');
export const xpiName = 'zotero-neo.xpi';
export const checksumName = `${xpiName}.sha256`;
const stableVersion = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export function requireStableTag(tag) {
  if (typeof tag !== 'string' || !tag.startsWith('v') || !stableVersion.test(tag.slice(1))) {
    throw new Error('expected a stable vX.Y.Z tag (no prerelease or leading zeros)');
  }
}

export function command(program, args, binary = false) {
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

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function manifestIdentity(tag, manifest, repository) {
  requireStableTag(tag);
  const homepage = manifest.homepage_url;
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/.exec(homepage || '');
  if (!match || (repository && repository !== match[1])) {
    throw new Error('manifest repository identity is missing or inconsistent');
  }
  const gecko = manifest.browser_specific_settings?.gecko;
  const zotero = manifest.applications?.zotero;
  const updateUrl = `https://raw.githubusercontent.com/${match[1]}/main/updates.json`;
  if (
    manifest.version !== tag.slice(1) ||
    !gecko?.id ||
    gecko.id !== zotero?.id ||
    gecko.update_url !== updateUrl ||
    zotero.update_url !== updateUrl ||
    typeof zotero.strict_min_version !== 'string' ||
    !zotero.strict_min_version ||
    typeof zotero.strict_max_version !== 'string' ||
    !zotero.strict_max_version
  ) {
    throw new Error(
      'manifest version, extension IDs, update URLs or compatibility are inconsistent',
    );
  }
  return {
    version: manifest.version,
    addonId: gecko.id,
    homepage,
    updateUrl,
    compatibility: {
      strict_min_version: zotero.strict_min_version,
      strict_max_version: zotero.strict_max_version,
    },
  };
}

export function readPackagedManifest(archive) {
  if (listZipMembers(archive).filter((name) => name === 'manifest.json').length !== 1) {
    throw new Error('XPI must contain exactly one manifest.json');
  }
  command('unzip', ['-t', archive]);
  return JSON.parse(readZipMember(archive, 'manifest.json').toString('utf8'));
}

export function requirePackagedIdentity(tag, source, archive, repository) {
  const identity = manifestIdentity(tag, source, repository);
  if (
    !isDeepStrictEqual(identity, manifestIdentity(tag, readPackagedManifest(archive), repository))
  ) {
    throw new Error('packaged manifest identity or compatibility differs from source');
  }
  return identity;
}

export function releaseEntry(identity, digest) {
  return {
    version: identity.version,
    update_link: `${identity.homepage}/releases/download/v${identity.version}/${xpiName}`,
    update_hash: `sha256:${digest}`,
    applications: { zotero: identity.compatibility },
  };
}

export function feedEntries(feed, identity) {
  if (
    !feed?.addons ||
    Object.keys(feed.addons).length !== 1 ||
    !Object.hasOwn(feed.addons, identity.addonId) ||
    !Array.isArray(feed.addons[identity.addonId]?.updates)
  ) {
    throw new Error('feed extension identity is unknown or inconsistent');
  }
  const entries = feed.addons[identity.addonId].updates;
  const versions = new Set();
  for (const entry of entries) {
    const compatibility = entry?.applications?.zotero;
    if (
      !stableVersion.test(entry?.version || '') ||
      versions.has(entry.version) ||
      entry.update_link !== `${identity.homepage}/releases/download/v${entry.version}/${xpiName}` ||
      typeof compatibility?.strict_min_version !== 'string' ||
      !compatibility.strict_min_version ||
      typeof compatibility?.strict_max_version !== 'string' ||
      !compatibility.strict_max_version ||
      (entry.update_hash !== undefined && !/^sha256:[0-9a-f]{64}$/.test(entry.update_hash))
    ) {
      throw new Error('feed history has conflicting versions, identity, compatibility or hash');
    }
    // Historical feeds (including 0.1.0) predate hashes; preserve them unchanged.
    versions.add(entry.version);
  }
  return entries;
}

export function admittedEntry(tag, manifest, candidate, digest, repository) {
  const identity = manifestIdentity(tag, manifest, repository);
  const entries = feedEntries(candidate, identity);
  validateRelease(tag, manifest, candidate);
  const entry = entries.find((value) => value.version === identity.version);
  if (entry.update_hash !== `sha256:${digest}`) {
    throw new Error('candidate update_hash does not match downloaded XPI SHA256');
  }
  return { identity, entry };
}

export function mergePromotion(feed, identity, entry) {
  const entries = feedEntries(feed, identity);
  for (const previous of entries) {
    const left = previous.version.split('.').map(BigInt);
    const right = identity.version.split('.').map(BigInt);
    const different = left.findIndex((value, index) => value !== right[index]);
    if (different >= 0 && left[different] > right[different]) {
      throw new Error('refusing feed downgrade');
    }
    if (previous.version === identity.version && !isDeepStrictEqual(previous, entry)) {
      throw new Error('same version conflicts with official feed');
    }
  }
  if (!entries.some((value) => value.version === identity.version)) entries.unshift(entry);
  return feed;
}

export function outputJson(value, output, protectedPaths = []) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (!output) process.stdout.write(json);
  else {
    const path = resolve(root, output);
    const outputStat = existsSync(path) ? statSync(path, { bigint: true }) : undefined;
    if (
      protectedPaths.some((input) => {
        const protectedPath = resolve(root, input);
        if (path === protectedPath) return true;
        if (!outputStat || !existsSync(protectedPath)) return false;
        const inputStat = statSync(protectedPath, { bigint: true });
        return outputStat.dev === inputStat.dev && outputStat.ino === inputStat.ino;
      })
    ) {
      throw new Error('output must not overwrite a source, asset or official feed input');
    }
    writeFileSync(path, json);
  }
}

export function publicDownload(url) {
  // gh api authenticates by default; a successful API download does not prove
  // Zotero can reach the public URL. curl runs without config, cookies or auth.
  return command(
    'curl',
    [
      '--disable',
      '--fail',
      '--location',
      '--silent',
      '--show-error',
      '--proto',
      '=https',
      '--proto-redir',
      '=https',
      '--max-time',
      '60',
      url,
    ],
    true,
  );
}
