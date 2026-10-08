# Changelog

All notable changes to Zotero Neo are documented here.

## [Unreleased]

### Added

- Reader and Note Command Palettes expose an unbound Show in Library action for the active surface item; it remains a distinct action from Back/Forward.
- Add per-Main-window stack-style navigation history with a 100-location bound and forward-suffix truncation. Canonical `navigateBack` / `navigateForward` actions default to `<C-o>` / `<C-i>` in Main, Reader, and Note Normal; shortcut counts traverse history, while palette actions remain uncounted.
- Add a help-style command reference for Main, Reader, Note, and modal surfaces, including shipped bindings, action IDs, counts, targets, feature dependencies, and the shared jumplist's recording, restoration, and failure boundaries.

### Changed

- Annotation Comment Editor now owns pending and mounted input per PDF view independently of the Reader Surface mode flag. Native typing, IME, Enter newline, two-second autosave, and Escape save/close remain unchanged; privileged system-group Escape now works despite earlier host interception and cross-compartment target wrappers. Closing/reopening, view release, native editable handoff, and stale asynchronous work cannot reset a newer input context. The existing `reader-insert` binding/preference contract and disabled-preference native-pass-through compatibility remain intact.
- Document the approved annotation-comment contract: Enter remains newline, Escape saves/closes rather than cancels, and two-second autosave stays fixed. The existing Annotation comment editing switch and disabled native-pass-through compatibility are unchanged; no alternate key/autosave preferences or `reader-insert` migration are introduced.

- Reader `gg`, `G`, and counted page jumps now use one native navigation path, so mixed first/last/numbered jumps retain the correct global history locations, including the active split view. Uncounted `G` reaches the document bottom rather than the last page's start; `nG` still targets the numbered page's start, without changing zoom.
- Navigation recording now uses one state, coordinator, and typed policy. Reader search, annotation, or Outline may complete without appending when no owned exact-view hard receipt qualifies; marks record one managed final, ignored motion has no history-only capture, and launch/Back fences protect currentness.

- Main `o` / Enter now open only the focused Cursor item, even when persistent Neo Selection or Zotero native multi-selection exists; they fail closed when Cursor cannot resolve. Note `o` now opens its own Note-context item instead of falling back to Main's selected row. This does not add batch-open or a Reader Open binding.

- Main Trash confirms the resolved target kind/count, refuses hidden Selection members, and preserves Selection/history on cancel or failure. Reader annotation deletion states its single target and permanent consequence; cancellation preserves the selected annotation. New confirmations and target feedback follow the UI language.
- Navigation history records explicit Main, Reader, and cross-surface jumps without capturing persistent Main Selection. It restores readable closed Reader attachments and available PDF position, but not zoom/layout or Note caret; unavailable or partially restorable destinations do not advance the history pointer. Zotero retains ownership of actual PDF link navigation.
- Library reveal treats Zotero selection failures as failures, orders overlapping requests without replacing newer navigation context, and preserves newer Visual/annotation selections after asynchronous Trash or deletion. Reader annotation cleanup uses a cloned host array, and Note deactivation resets its caret and key guide.
- Main item-list `h` now focuses the current selected collection without collapsing it or jumping to My Library; Note Normal `u` / `Ctrl+r` no longer enter literal text when native undo/redo reports no history.

### Fixed

- Reader teardown now unregisters native listeners by event type and callback identity and rejects queued callbacks from retired registrations. Closed Reader indicators and secondary PDF dead wrappers no longer interrupt the remaining Reader/Main cleanup, fixing old-generation input and editor ownership surviving reload, replacement, disable/enable, or XPI update.

## [0.1.0] - 2026-09-19

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
- Space-leader defaults are organized around semantic namespaces across Reader/Main/Note: `<Space>ff/fc/fn` find targets, `<Space>,` switches tabs, `<Space>q` closes the current tab, and `<Space>t*` is reserved for Tags.
- Main persistent-set operations use `s`: item Selection and native ScopeSet toggle/advance in Normal, and VisualTarget commit in Visual.
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
