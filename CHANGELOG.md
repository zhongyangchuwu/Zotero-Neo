# Changelog

All notable changes to Zotero Neo are documented here.

## [0.1.0] - Unreleased

### Added

- Normal, Select, and Insert interaction states for keyboard-first Zotero Reader workflows.
- Flash-assisted visible PDF text selection with live literal matching, bounded hint rendering,
  range refinement, endpoint swapping, and direct selection actions.
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
- Note search across normalized titles and note bodies, child-note creation, right-side editor
  opening, note-tab opening, trash, and restore workflows.
- Main-window item trash/restore, PDF opening, tab switching/closing, collection-tree navigation,
  and Better BibTeX citekey copying where available.
- Auto, Light, and Dark appearance modes across Neo-owned surfaces.
- Configurable shortcut editing with staged Apply, per-mode action filtering, duplicate blocking,
  prefix warnings, multiple bindings per action, and persistent unbinding.
- Snapshot and EPUB navigation/search support where Zotero exposes compatible Reader behavior.

### Changed

- Reader and Main navigation use Zotero-native selection, scrolling, history, split, trash, and
  other host operations where stable host seams are available.
- Held `j/k` in Collections and Items delegates repeat/debounce behavior to Zotero's native tree
  selection path instead of Neo-side throttling.
- PDF Select currently owns a DOM range and scoped native-style selection rendering rather than
  pretending it is synchronized with Zotero Reader's private semantic selection state; native
  semantic-selection integration is tracked separately in issue #20.
- Picker, Reader sidebar, comment editor, smooth scrolling, Flash, and other transient UI state
  use explicit per-window/per-view lifecycle ownership and cleanup.

### Development

- Runtime source is strict TypeScript, bundled by esbuild into deterministic JavaScript/XPI
  artifacts with no runtime npm dependencies.
- Focused Vitest contracts cover input matching, picker behavior, Reader state, selection text,
  host-boundary guards, preferences, and package behavior.
- GitHub Actions validates the native Ubuntu and Windows build wrappers, TypeScript/tests,
  deterministic XPI contents, and guarded release metadata.
- Startup diagnostics are bounded and reset with version metadata instead of growing during idle
  Reader rescans.
- Zotero Neo targets the latest stable Zotero release; GUI behavior remains part of the manual
  host acceptance matrix before release.
