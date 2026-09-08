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
- Updated English, Chinese, and Spanish documentation while preserving the
  `ZorroStardust/zotero-vim-plus` and `finktank/zotero-vim` lineage.
- Stopped periodic idle reader rescans from growing `zotero-neo-startup.log`.
- Added GitHub Actions validation for native Ubuntu and Windows XPI builds.
- Added independently named CI artifacts and guarded version-tag publication of
  one canonical `zotero-neo.xpi`.
- Added release metadata validation for manifest, compatibility, tag, and
  `updates.json` consistency.

### Removed

- Removed unused legacy Vim icon assets from the packaged source tree.
