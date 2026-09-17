# Changelog

All notable changes to Zotero Neo are documented here.

## [0.1.0] - Unreleased

### Added

- Normal, Select, and Insert interaction states for keyboard-first Zotero Reader workflows.
- Flash-assisted visible PDF text selection with live literal matching, bounded hint rendering,
  range refinement, endpoint swapping, and direct selection actions.
- Unicode/CJK Flash targeting and browser-owned IME composition across Flash, Picker, and Tag
  Workspace text inputs without reconstructing query text from keydown events.
- Selection actions for copying, searching, coloured highlights, underline, annotation comments,
  and optional Translate for Zotero integration through its public API.
- A small public Reader selection/action seam through `Zotero.Neo.reader.getSelection()` and
  `Zotero.Neo.reader.registerSelectionAction(...)` for external workflows.
- Vim-style Reader navigation including page turns, scrolling, zoom, native reading history,
  marks, annotation navigation, and horizontal pan.
- `f` follow-link hints for visible internal, citation, and external PDF links, including a
  transient destination cue for internal jumps.
- Horizontal and vertical Reader split control plus directional `Ctrl+h/j/k/l` pane focus.
- Outline and marks explorers with keyboard navigation and view-local lifecycle ownership.
- A configurable Space-leader key guide generated from the active resolved keymap.
- Normal-mode `:` command palettes for Reader, Main, and Note contexts, including unbound but
  executable actions.
- A shared fuzzy picker for all-library items, current-collection items, notes, tabs, and tags,
  with responsive previews and optional mouse row selection for non-tag scopes.
- A keyboard-first tag-filter picker with List/Query modes, current-view/all-library scope,
  pinned active filters, AND semantics, and safe filter clearing without changing item tags.
- Main Item Select backed by Zotero's native `TreeSelection`, with `v`, count-aware `j/k`,
  `gg/G`, endpoint swapping, preserve-on-finish, and cancel-to-focused-item behavior.
- A persistent Tag Workspace on `<Space>ta` for Main/Reader/Note target sets, with all/mixed/none
  assignment state, explicit add/remove/create operations, and virtual separator-based tag-path
  completion while Zotero continues to store ordinary flat tag strings.
- Note search across normalized titles and note bodies, child-note creation, right-side editor
  opening, note-tab opening, trash, and restore workflows.
- Main-window item trash/restore, PDF opening, tab switching/closing, collection-tree navigation,
  and Better BibTeX citekey copying where available.
- Auto, Light, and Dark appearance modes across Neo-owned surfaces.
- Configurable shortcut editing with staged Apply, per-mode action filtering, duplicate blocking,
  prefix warnings, multiple bindings per action, and persistent unbinding.
- Snapshot and EPUB navigation/search support where Zotero exposes compatible Reader behavior.

### Changed

- Shared Picker and TagPath fuzzy matching now goes through the pinned `fuzzysort` 4.0.2 adapter
  instead of Neo's earlier ad-hoc fuzzy scorer; consumers remain behind `fuzzyMatchScore()`.
- Configurable binding scopes now name both surface and interaction state (`reader-normal`,
  `reader-select`, `reader-insert`, `main-normal`, `main-select`) instead of mixing Reader modes
  with a generic Main context. Development binding overrides migrate to the canonical schema.
- Main Item Select now uses the same resolved binding/input engine and semantic action dispatcher
  as the rest of Main; its feature module owns only Zotero `TreeSelection` operations and mode UI.
- Reader runtime state is independent from persisted binding scope instead of reusing one mixed
  `Mode` model.
- Reader and Main navigation use Zotero-native selection, scrolling, history, split, trash, and
  other host operations where stable host seams are available.
- Held `j/k` in Collections and Items delegates repeat/debounce behavior to Zotero's native tree
  selection path instead of Neo-side throttling.
- Multi-item tag mutation uses one Zotero DB transaction per semantic batch and saves only items
  that need the requested transition; successful Workspace edits avoid a full tag-catalog reload.
- Tag filtering (`<Space>fT`) and item-tag mutation (`<Space>ta`) are separate workflows rather
  than two modes of the same picker.
- PDF Select currently owns a DOM range and scoped native-style selection rendering rather than
  pretending it is synchronized with Zotero Reader's private semantic selection state; native
  semantic-selection integration is tracked separately in issue #20.
- Picker, Reader sidebar, comment editor, smooth scrolling, Flash, and other transient UI state
  use explicit per-window/per-view lifecycle ownership and cleanup.
- The 0.1.0 compatibility contract is the latest stable Zotero only; the current manifest targets
  Zotero 10 rather than advertising unsupported older major versions.

### Development

- Runtime source is strict TypeScript, bundled by esbuild into deterministic JavaScript/XPI
  artifacts with no runtime npm/CDN/native dependency resolution.
- The audited `fuzzysort` 4.0.2 ESM snapshot is vendored with its license/provenance and folded
  into the runtime bundle by esbuild.
- Focused Vitest contracts cover input matching, picker behavior, Reader state, selection text,
  host-boundary guards, preferences, tag target batching, virtual tag paths, and package behavior.
- GitHub Actions validates the native Ubuntu and Windows build wrappers, TypeScript/tests,
  deterministic XPI contents, and guarded release metadata.
- Startup diagnostics are bounded and reset with version metadata instead of growing during idle
  Reader rescans.
- Architecture ownership and remaining pre-release debt are documented in
  `docs/ARCHITECTURE.md`; Note-local grammar and Reader orchestration cleanup remain tracked in
  issue #29 before the final 0.1.0 keymap freeze.
