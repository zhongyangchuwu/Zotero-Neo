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
- Replaced inherited runtime filenames with `core.js`, `reader.js`, and
  `main.js`; grouped preference-pane sources under `content/preferences/`.
- Stopped periodic idle reader rescans from growing `zotero-neo-startup.log`.
- Added GitHub Actions validation for native Ubuntu and Windows XPI builds.
- Added independently named CI artifacts and guarded version-tag publication of
  one canonical `zotero-neo.xpi`.
- Added release metadata validation for manifest, compatibility, tag, and
  `updates.json` consistency.

### Removed

- Removed unused legacy Vim icon assets from the packaged source tree.
