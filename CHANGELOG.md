# Changelog

All notable changes to Zotero Neo are documented here.

## [0.1.0] - Unreleased

### Added

- Normal, Select, and Insert interaction states for keyboard-first Zotero Reader workflows.
- Flash-assisted visible PDF text selection with live literal matching, bounded hint rendering,
  range refinement, endpoint swapping, and direct selection actions.
- Unicode/CJK Flash targeting and browser-owned IME composition across Flash, chooser/tag
  candidate inputs, and Note editing without reconstructing query text from keydown events.
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
- A shared fuzzy target chooser for all-library items, current-collection items, notes, tabs,
  and action-specific tag candidates, with responsive previews and optional mouse row selection.
- Explicit semantic tag actions: `<Space>ta` Add Tag, `<Space>tr` Remove Tag,
  Main-only `<Space>tf` Toggle Tag Filter, and `<Space>tc` Clear Tag Filters.
- Main Item Select backed by Zotero's native `TreeSelection`, with `v`, count-aware `j/k`,
  `gg/G`, endpoint swapping, preserve-on-finish, and cancel-to-focused-item behavior.
- Context-aware Main/Reader/Note tag target resolution with explicit add/remove semantics,
  multi-target assignment metadata, create candidates, and virtual separator-based tag-path
  refinement while Zotero continues to store ordinary flat tag strings.
- Note search across normalized titles and note bodies with chooser-based open behavior; Note
  editing itself uses the shared Normal/Insert binding engine rather than a picker-local CRUD grammar.
- Main-window item trash/restore, PDF opening, tab switching/closing, collection-tree navigation,
  and Better BibTeX citekey copying where available.
- Auto, Light, and Dark appearance modes across Neo-owned surfaces, with semantic mode/status
  surface-and-text pairs so light mode uses pale surfaces with dark text and dark mode keeps
  appropriately dark surfaces with light text.
- Configurable shortcut editing with staged Apply, per-mode action filtering, duplicate blocking,
  prefix warnings, multiple bindings per action, and persistent unbinding.
- Snapshot and EPUB navigation/search support where Zotero exposes compatible Reader behavior.

### Changed

- The 0.1.0 Reader yank defaults are prefix-unambiguous: annotation highlighted text remains on
  `y`, annotation comment text moves from `yy` to `Y`, and the stale Select `yy` /
  `yankParagraph` default is removed instead of freezing an action whose implementation did not
  match its advertised whole-paragraph semantics.
- Shared Picker and TagPath fuzzy matching now goes through the pinned `fuzzysort` 4.0.2 adapter
  instead of Neo's earlier ad-hoc fuzzy scorer; consumers remain behind `fuzzyMatchScore()`.
- Configurable binding scopes now name both surface and interaction state (`reader-normal`,
  `reader-select`, `reader-insert`, `main-normal`, `main-select`, `note-normal`,
  `note-insert`) instead of mixing Reader modes with host contexts. Development binding
  overrides migrate to the canonical schema, including Note-global customizations and explicit
  unbindings from the preceding pre-release schema.
- Main Item Select now uses the same resolved binding/input engine and semantic action dispatcher
  as the rest of Main; its feature module owns only Zotero `TreeSelection` operations and mode UI.
- Note Normal/Insert now use the shared sequence/count reducer, resolved bindings, capabilities,
  Key Guide, and Command Palette source instead of a parallel handwritten key grammar; Note DOM
  editing operations remain owned by `NoteEditor` and unbound Insert text remains Zotero/browser
  native.
- Reader runtime state is independent from persisted binding scope instead of reusing one mixed
  `Mode` model.
- Reader and Main navigation use Zotero-native selection, scrolling, history, split, trash, and
  other host operations where stable host seams are available.
- Held `j/k` in Collections and Items delegates repeat/debounce behavior to Zotero's native tree
  selection path instead of Neo-side throttling.
- Multi-item tag mutation uses one Zotero DB transaction per semantic batch and saves only items
  that need the requested transition.
- Tag filtering and item-tag mutation are explicit semantic actions rather than modes of a tag
  operation console: `ta/tr` mutate item data, while Main-only `tf/tc` change view state.
- Picker/chooser providers no longer own create/delete/yank/open mini-grammars; the invoking
  semantic action owns confirmation and host mutation.
- Space-leader defaults are organized around semantic namespaces: `ff/fc/fn` find targets,
  `<Space>,` switches tabs, `<Space>q` closes the current tab, and `t*` is reserved for Tags.
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
- Architecture ownership is documented in `docs/ARCHITECTURE.md`. Pre-0.1.0 Reader
  orchestration now has explicit owners for private key patches, PDF-view lifecycle, navigation
  host operations, and Neo's temporary Select DOM range; further annotation extraction was
  deliberately rejected where it would only replace coherent local ownership with reverse callbacks.
- The frozen default keymap is guarded by a contract test that rejects exact default commands which
  are also strict prefixes of longer defaults, including the effective Main Select fallback map.
