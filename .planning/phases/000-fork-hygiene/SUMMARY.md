# Phase 0 Summary

## Completed Changes

- Renamed the collision-bearing global controller from `ZoteroVim` to `ZoteroNeo` across bootstrap, core, reader, and main scripts.
- Replaced runtime diagnostics with `[ZoteroNeo]` and renamed the profile log to `zotero-neo-startup.log`.
- Changed the manifest to Zotero Neo `0.1.0` with extension ID `zotero-neo@zotero-neo`, the Neo repository, and a Neo-owned update URL.
- Replaced upstream update history with a new-ID feed whose updates list is empty until a release asset exists.
- Isolated runtime, preferences, and language settings under `extensions.zotero-neo`.
- Renamed the preference pane and markup identity to `zotero-neo-prefs` / Zotero Neo.
- Renamed both build outputs to `zotero-neo.xpi`.
- Renamed the vector source to `icons/zotero-neo.svg` and removed unreferenced legacy Vim icon assets.
- Updated English, Chinese, Spanish, contributor, diagnostic, and issue documentation.
- Added `CHANGELOG.md` with the unreleased 0.1.0 identity cutover.

## Files Changed

### Runtime and preferences

- `bootstrap.js`
- `content/zoteroVim.js`
- `content/zoteroVimReader.js`
- `content/zoteroVimMain.js`
- `content/prefs.js`
- `content/i18n.js`
- `content/preferences.xhtml`

### Metadata, build, and assets

- `manifest.json`
- `updates.json`
- `build.sh`
- `tools/build.ps1`
- `.gitignore`
- `icons/zotero-neo.svg`
- Removed `icons/zotero vim plus.svg`, `icons/vim.svg`, `icons/vim-48.png`, and `icons/vim-96.png`

### Documentation and planning

- `README.md`
- `README.zh-CN.md`
- `README.es-ES.md`
- `AGENTS.md`
- `PENDING_ISSUES.md`
- `CHANGELOG.md`
- `.planning/`

## Deviations

- No upstream preference migration or compatibility alias was added, as decided in the phase context.
- The active generic PNG icons were retained; only obsolete/old-named source assets were removed or renamed.
- Windows PowerShell and Zotero runtime checks could not be executed in the WSL environment.
- No M1 or later milestone behavior was implemented.

## Evidence

- `./build.sh` passed JavaScript syntax checks and binding synchronization.
- Binding counts remained unchanged: 122 runtime bindings, 122 preference bindings, 109 English labels, and 109 Chinese labels.
- `zotero-neo.xpi` was generated successfully.
- Archive inspection found exactly the expected 11 files, including only the two active PNGs and `icons/zotero-neo.svg`.
- Packaged text contains none of the forbidden upstream extension ID, preference root, update host, global, debug prefix, XPI, pane ID, or old log filename.
- Manifest archive values are Zotero Neo, version `0.1.0`, and identical new IDs/update URLs in both compatibility sections.
- Documentation identity assertions passed in all three README variants and `AGENTS.md`.
- `git diff --check` reported no whitespace errors.

## Unresolved Risks

- The XPI has not been installed or started in Zotero.
- The preference pane, log output, coexistence with upstream, and baseline reader/main/note behavior remain manually unverified.
- `tools/build.ps1` has not been executed because PowerShell is unavailable.
- Phase 0 therefore remains blocked at the manual verification gate and is not complete.
