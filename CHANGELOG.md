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
- Added the full-resolution Neo icon source and README banner under
  `assets/branding/`, outside the packaged runtime asset set.
- Consolidated static XPI assets under `assets/package/` and colocated the POSIX
  build wrapper with the Windows wrapper under `tools/`.
- Added native reader history navigation on Normal-mode `Ctrl-o` / `Ctrl-i`,
  delegated to Zotero's per-view history with guarded private API access.
- Added Normal-mode Reader zoom family (`+`/`-`, `zI`/`zO`) plus reset-to-fit-width (`=`/`z0`), with count prefixes for step zoom.
- Added Normal-mode `f` follow-link hints for visible internal, citation, and external
  PDF links, using Zotero's native per-view navigation and safe link-opening callbacks.
- Added a transient Zotero-preview-style landing cue after internal and citation
  jumps: a red circle for point destinations and a red rectangle for area targets.
- Added a configurable, Space-only key guide for valid leader continuations in
  Reader, main-window, and Note Normal contexts; it derives rows from the
  active binding configuration and remains absent from native text input.
- Corrected Reader split shortcuts to call Zotero's current horizontal/vertical
  split APIs, preserved case in guide labels, and added a 12–24 px guide font setting.
- Consolidated main-window entity search under `<space>f`: all items (`ff`), current
  collection (`fc`), notes (`fn`), tabs (`ft`), and case-sensitive tag filters (`fT`);
  native Reader/PDF find remains `/`, `n`, and `N`, and tab close is `<space>td`.
- Added a one-time migration that removes unchanged retired leader defaults while
  preserving genuinely customized bindings.
- Fixed notes-layout loading and child-note creation by resolving the active Reader
  attachment parent, using supported Zotero Search conditions with a library-item
  fallback, and isolating malformed individual note payloads.
- Added non-wrapping `Ctrl+h/j/k/l` directional focus across main-window panes,
  Reader split views, and Reader/context-note transitions.
- Unified library, collection, tab, note, and tag find scopes behind one responsive
  LazyVim-style picker with title/tag fuzzy filtering, result counts, synchronized
  previews, and a single-column fallback for narrow windows.
- Moved note search to `<space>fn`; changed Notes controls to directional pane focus
  and preview scrolling; added recoverable note and main-item trash shortcuts backed
  by Zotero's native trash transaction and undo history, with Vim-style `u` for
  main-item restore.
- Replaced the native tag-selector shortcut with `<space>fT` Tag picker: immediate AND
  filtering, pinned active tags, current-view/all-library scope toggle, and safe in-picker
  removal or clearing of existing filters without altering tag data.
- Fixed an empty shared-picker regression by mounting the constructed list/preview grid into
  the modal, added a DOM-wiring regression check, and expanded bounded picker lifecycle/error
  diagnostics. The profile diagnostic log is now reset with version metadata on each add-on startup.
- Hardened picker lifecycle ownership: close invalidates pending loads and queued actions,
  dependent selection/open operations are serialized, closed picker state is reset, and
  picker-private Zotero structural guards now live in `src/main/host.ts`.
- Fixed Reader command ownership after split focus changes so page turns, scrolling,
  history, and other motions target the split last focused by mouse or keyboard.
- Enriched All-items and Collection picker previews with bounded bibliographic metadata,
  attachment filenames, and child-note titles/counts; first-page PDF rendering remains deferred
  because Zotero exposes no stable add-on thumbnail API.
- Extended note picker matching to normalized note body content without adding a persisted index,
  and added always-visible scope-aware picker shortcut guidance.
- Redesigned the `<space>fT` tag picker around explicit List and Query modes:
  List-mode Space/Enter toggles immediate native AND filters without closing, Query mode
  preserves literal text input, source snapshots remain stable, tag markers remain non-interactive,
  and failed native updates resynchronize without mutating tag data.
- Split Tag picker shortcut help between the search input and tag list so each location reflects
  the active Query or List controls.
- Made picker result rows keyboard-only by default so pointer hover/click cannot override keyboard selection.
- Added opt-in mouse selection and double-click confirmation for All, Collection, Tab, and Note
  picker rows through `picker.mouse.enabled`; Tag rows and markers remain keyboard-only.

### Removed

- Removed unused legacy Vim icon assets from the packaged source tree.
- Removed unpackaged legacy runtime/preference sources and migration-only
  characterization generators, fixtures, and synchronization tooling.
