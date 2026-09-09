#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

export function validateRelease(tag, manifest, updates) {
  if (!tag) throw new Error('expected a version tag argument such as v0.1.0');

  const expectedTag = `v${manifest.version}`;
  if (tag !== expectedTag) {
    throw new Error(`tag ${tag} does not match manifest version ${manifest.version}`);
  }

  const geckoId = manifest.browser_specific_settings?.gecko?.id;
  const zoteroId = manifest.applications?.zotero?.id;
  if (!geckoId || geckoId !== zoteroId) {
    throw new Error('manifest extension IDs are missing or inconsistent');
  }

  const updatesForAddon = updates.addons?.[geckoId]?.updates;
  if (!Array.isArray(updatesForAddon)) {
    throw new Error(`updates.json has no updates array for ${geckoId}`);
  }

  const matching = updatesForAddon.filter((entry) => entry?.version === manifest.version);
  if (matching.length !== 1) {
    throw new Error(`updates.json must contain exactly one entry for version ${manifest.version}`);
  }

  const homepage = String(manifest.homepage_url || '').replace(/\/+$/, '');
  const expectedLink = `${homepage}/releases/download/${expectedTag}/zotero-neo.xpi`;
  if (matching[0].update_link !== expectedLink) {
    throw new Error(`release link must be ${expectedLink}`);
  }

  const manifestApp = manifest.applications?.zotero;
  const updateApp = matching[0].applications?.zotero;
  if (
    !updateApp ||
    updateApp.strict_min_version !== manifestApp?.strict_min_version ||
    updateApp.strict_max_version !== manifestApp?.strict_max_version
  ) {
    throw new Error('update compatibility must match manifest Zotero compatibility');
  }

  return geckoId;
}

function runCli() {
  try {
    const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
    const addonId = validateRelease(tag, readJson('manifest.json'), readJson('updates.json'));
    console.log(`[release] validated ${tag} for ${addonId}`);
  } catch (error) {
    console.error(`[release] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) runCli();
