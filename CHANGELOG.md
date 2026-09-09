# Changelog

All notable changes to Zotero Neo are documented here.

## [0.1.0] - Unreleased

### Changed

- Established the independent Zotero Neo add-on identity.
- Changed the extension ID to `zotero-neo@zotero-neo`.
- Isolated preferences under `extensions.zotero-neo`.
- Renamed the runtime controller and diagnostics to `ZoteroNeo` / `[ZoteroNeo]`.
- Renamed the build artifact to `zotero-neo.xpi`.
- Replaced the upstream update feed with a Neo-owned, initially empty feed.
- Reorganized public documentation around an English landing page and canonical
  English guides; removed translated project documents and inherited demo media.
- Clarified latest-stable Zotero support and named Zotero Vim Plus as the
  immediate upstream while preserving historical attribution.
- Replaced the inherited ordered-global JavaScript runtime with strict TypeScript
  reader/main controllers, typed host boundaries, focused Vitest contracts, and
  deterministic esbuild bundles containing no runtime npm dependencies.
- Stopped periodic idle reader rescans from growing `zotero-neo-startup.log`.
- Added GitHub Actions validation for native Ubuntu and Windows XPI builds.
- Added independently named CI artifacts and guarded version-tag publication of
  one canonical `zotero-neo.xpi`.
- Added release metadata validation for manifest, compatibility, tag, and
  `updates.json` consistency.
- Added Auto, Light, and Dark appearance modes across Neo preferences, pickers,
  explorers, notes layout, annotation comments, and status/mode surfaces.
- Upgraded GitHub artifact actions to current Node 24 runtimes.
- Replaced the legacy HJKL/Visio icon artwork with a transparent Neo ribbon mark
  rendered at 16, 32, 48, 64, 96, 128, and 256 pixels.
- Added native reader history navigation on Normal-mode `Ctrl-o` / `Ctrl-i`,
  delegated to Zotero's per-view history with guarded private API access.

### Removed

- Removed unused legacy Vim icon assets from the packaged source tree.
- Removed unpackaged legacy runtime/preference sources and migration-only
  characterization generators, fixtures, and synchronization tooling.
