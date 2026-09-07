# Plan 000-01: Zotero Neo Identity Cutover

## Objective

Convert every collision-bearing installed, runtime, build, update, and documentation identity from Zotero Vim Plus to Zotero Neo without changing feature behavior.

## Scope

- Manifest/add-on/update identity.
- Shared runtime global and diagnostic identity.
- Preference storage and preference-pane identity.
- Unix/Windows artifact naming and ignore rules.
- Packaged icon/source asset identity.
- English, Chinese, Spanish, AGENTS, and changelog/release documentation.

## Non-Goals

History bindings, LazyVim keymap changes, Spotlight, tag management, which-key, inherited bug fixes, preference import/migration, or private-helper cosmetic renames.

## Inputs Read

- `Zotero Neo — Product Requirements Document.md`
- `AGENTS.md`, `README.md`, `FUTURE_FEATURES.md`, `PENDING_ISSUES.md`
- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/codebase/*`
- Identity-bearing source/build/update/preference files

## Tasks

### 1. Rename the shared collision-bearing runtime identity

**Files/symbols:** `bootstrap.js`, `content/zoteroVim.js`, `content/zoteroVimReader.js`, `content/zoteroVimMain.js`; global `ZoteroVim`.

- Use language-server references and rename when available so every cross-file declaration/use becomes `ZoteroNeo` atomically.
- Update file headers/product comments where they identify the product.
- Keep private helper names unchanged unless they are public/collision-bearing globals.
- Replace runtime/debug prefix strings with `[ZoteroNeo]` and rename the startup log to `zotero-neo-startup.log`.

**Acceptance:** Scripts still load in the same order; no `ZoteroVim` global or `[ZoteroVim]` diagnostic remains in packaged runtime files.

### 2. Cut over manifest and update identity

**Files:** `manifest.json`, `updates.json`.

- Set product name to `Zotero Neo`, version to `0.1.0`, homepage to the current Neo repository, and both manifest ID fields to `zotero-neo@zotero-neo`.
- Point both update URL fields to the Neo repository feed.
- Replace upstream history in `updates.json` with one new-ID entry and an empty updates array until a real Neo release asset exists.
- Keep Zotero `7.0`–`10.*` compatibility.

**Acceptance:** No upstream ID, homepage, update URL, release URL, or artifact remains in manifest/update metadata.

### 3. Isolate preferences and preference-pane identity

**Files/symbols:** `content/zoteroVim.js` `PREF_PREFIX` and `_registerPrefsPane`; `content/prefs.js` `ZV_PREFIX`; `content/i18n.js` `ZV_I18N_PREFIX`; `content/preferences.xhtml` root ID/CSS.

- Set all preference consumers to the new `extensions.zotero-neo` root.
- Rename pane registration and markup identity to `zotero-neo-prefs` and label it `Zotero Neo`.
- Do not read, write, copy, or clear the upstream branch.
- Keep existing preference keys and default behavior unchanged beneath the new root.

**Acceptance:** Runtime, language, bindings, and pane UI use one Neo branch; upstream and Neo settings can coexist independently.

### 4. Rename build output and clean packaged assets

**Files:** `build.sh`, `tools/build.ps1`, `.gitignore`, `icons/`, README build trees.

- Emit exactly `zotero-neo.xpi` from both builders and ignore that artifact.
- Remove stale unused artifact aliases.
- Keep generic active PNGs if no replacement artwork is supplied, but rename/remove upstream-branded SVG/legacy files so the XPI does not ship old product identity.
- Keep build payload structure unchanged.

**Acceptance:** Both build paths name the same XPI and the archive contains no upstream-branded asset filename.

### 5. Update user and contributor documentation

**Files:** `README.md`, `README.zh-CN.md`, `README.es-ES.md`, `AGENTS.md`, new `CHANGELOG.md` if release history is required by the PRD workflow.

- Update title, positioning, repository/clone path, install filename, build output, preference pane label, file tree, debug/log names, and current compatibility claims.
- State that Zotero Neo is based on `ZorroStardust/zotero-vim-plus`, itself based on `finktank/zotero-vim`; retain AGPL-3.0 and author attribution.
- Remove obsolete upstream update/install instructions without rewriting feature documentation.
- Record 0.1.0 identity cutover in the changelog when created.

**Acceptance:** All language variants direct users to Neo artifacts/repository and preserve complete lineage.

### 6. Verify the cutover

**Automated/static:**

1. Run `./build.sh` and require syntax plus binding-sync success.
2. Run `tools/build.ps1` on Windows/PowerShell or record that platform evidence as outstanding before phase completion.
3. Inspect `zotero-neo.xpi` contents.
4. Search source and packaged text for collision-bearing strings: old extension ID, upstream update host, old preference root, old global, old debug prefix, old XPI name, and old preference pane IDs. Attribution-only upstream names are allowed in lineage text.

**Manual Zotero:**

1. Install `zotero-neo.xpi` and restart if requested.
2. Confirm Add-ons and Preferences show Zotero Neo and the pane opens repeatedly.
3. Confirm startup logs use `[ZoteroNeo]` and the Neo log filename.
4. Confirm upstream settings are not read or changed; if upstream is installed, verify separate identity/preferences.
5. Smoke main navigation, PDF hjkl/search, Visual annotation, Insert/comment input, notes, item/tab picker, tab cycling, and split reader.
6. Confirm no uncaught startup errors.

## Failure Routing

- Any stale collision-bearing identifier: return to the owning task; do not waive.
- Build/sync failure: fix before installation testing.
- Startup or preference-pane failure: stop Phase 0; do not begin M1.
- Feature regression: revert the smallest identity slice causing it; do not mix in behavior changes.
- Missing Windows or Zotero runtime access: phase remains unverified with the exact evidence gap recorded.

## Completion Gate

Phase 0 completes only when the Neo XPI is collision-free, builds, installs, starts, preserves baseline behavior, retains attribution, and has no upstream auto-update path. Then update `ROADMAP.md`, `REQUIREMENTS.md`, and `STATE.md`; only afterward plan Phase 1 in detail.
