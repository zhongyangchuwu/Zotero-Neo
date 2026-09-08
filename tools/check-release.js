#!/usr/bin/env node
/*
 * Validate the release tag and update feed before publishing zotero-neo.xpi.
 * Usage: node tools/check-release.js v0.1.0
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function fail(message) {
  console.error('[release] ' + message);
  process.exit(1);
}

function readJSON(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
  } catch (e) {
    fail('cannot read ' + relativePath + ': ' + e.message);
  }
}

const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
if (!tag) fail('expected a version tag argument such as v0.1.0');

const manifest = readJSON('manifest.json');
const updates = readJSON('updates.json');
const expectedTag = 'v' + manifest.version;
if (tag !== expectedTag) {
  fail('tag ' + tag + ' does not match manifest version ' + manifest.version);
}

const geckoID = manifest.browser_specific_settings?.gecko?.id;
const zoteroID = manifest.applications?.zotero?.id;
if (!geckoID || geckoID !== zoteroID) {
  fail('manifest extension IDs are missing or inconsistent');
}

const feed = updates.addons?.[geckoID]?.updates;
if (!Array.isArray(feed)) {
  fail('updates.json has no updates array for ' + geckoID);
}

const matching = feed.filter((entry) => entry?.version === manifest.version);
if (matching.length !== 1) {
  fail('updates.json must contain exactly one entry for version ' + manifest.version);
}

const homepage = String(manifest.homepage_url || '').replace(/\/+$/, '');
const expectedLink = homepage + '/releases/download/' + expectedTag + '/zotero-neo.xpi';
if (matching[0].update_link !== expectedLink) {
  fail('release link must be ' + expectedLink);
}

const manifestApp = manifest.applications?.zotero;
const updateApp = matching[0].applications?.zotero;
if (!updateApp ||
    updateApp.strict_min_version !== manifestApp.strict_min_version ||
    updateApp.strict_max_version !== manifestApp.strict_max_version) {
  fail('update compatibility must match manifest Zotero compatibility');
}

console.log('[release] validated ' + tag + ' for ' + geckoID);
