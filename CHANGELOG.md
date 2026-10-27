# Changelog

## [0.2.0] - Release candidate (unreleased)

### Added

- Add seven default-unbound Main commands for collection finding, continuous addition of existing items, item/collection moves, and native-dialog create/rename/delete workflows. Reuse the existing Palette and Picker without new controls; preserve native collection editing, drag-and-drop, `<Space>fc`, and persistent item Selection.
- Add **Add Item by Identifier** to Main and Reader Normal, with configurable `<Space>ai` defaults and Command Palette discovery. Reuse Zotero's native input, batch lookup, saving, and errors; keep drafts and native IME/Enter/Escape ownership. Reader tabs and standalone windows return to their associated Library context without borrowing item Selection, and ambiguous or read-only library scopes are refused.
- Bind Reader Normal `y` to `copyTarget` for grouped, separate annotation Excerpt/Comment, DOI, arXiv, HTTP(S), and native external-link copy hints; extend `followLink` (`f`) to follow recognized DOI/arXiv/HTTP(S) text alongside native links. Select `y` and Normal `Y` remain unchanged; direct `yankAnnotation` is unbound. Binding schema 19 migrates persisted `copyIdentifier`/`followIdentifier` IDs to `copyTarget`/`followLink` while preserving custom key positions, explicit-null overrides, and a custom `reader-normal:y` → `yankAnnotation` binding. No `<Space>ya` default is added.
- Add a VitePress documentation site with local search and responsive light/dark navigation.
- Add contributor instructions for screenshots and videos with native playback controls and text alternatives.
- Reader and Note Command Palettes expose an unbound Show in Library action for the active surface item; it remains a distinct action from Back/Forward.
- Add per-Main-window stack-style navigation history with a 100-location bound and forward-suffix truncation. Canonical `navigateBack` / `navigateForward` actions default to `<C-o>` / `<C-i>` in Main, Reader, and Note Normal; shortcut counts traverse history, while palette actions remain uncounted.
- Add a help-style command reference for Main, Reader, Note, and modal surfaces, including shipped bindings, action IDs, counts, targets, feature dependencies, and the shared jumplist's recording, restoration, and failure boundaries.
- Add action-centric shortcut discovery and staged editing across all 14 binding contexts. Search covers localized labels, canonical ActionIds, current/default keys, groups, and contexts; results identify Default, Custom, or Unbound, while native shortcuts are disclosed separately as read-only.
- Add Reader navigation for headings, Figures, Tables, annotations, and Bookmarks, plus direct focus for Outline, Bookmarks, Annotations, and Thumbnails. Headings use the full native Outline; Figure/Table navigation also lazily reuses genuine Zotero structured-document captions with PDF anchors, without invented targets. A cold native cache may require local whole-PDF processing; no upload/new OCR dependency is added. Bookmark navigation follows document position and wraps.

### Changed

- Show direct-membership coverage in `<Space>ca` / `<Space>cr`, add only missing memberships, and offer explicit parent/name confirmation for atomic create-and-add. Item moves require one ordinary direct source and preserve other memberships; deleting a collection keeps every item.
- Keep plugin source, the VitePress site, and their shared Markdown guides in one checkout with one dependency lock; build and preview the site from the project root.
- Centralize required private Main/Note/Reader SDK and host-DOM capabilities in the internal `src/toolkit/` boundary. Keep target precedence, modes, workflows, bookmark storage choice and history policy in their business owners; public handles expose no native pane/tree/PDF/editor internals.
- Prefer the documented collection-selection API for its single-selection contract while preserving zero/multiple ScopeSet behavior. Cache only the selected tab's immutable metadata on Note key dispatch instead of copying the full tab inventory.

- Standardize Chinese UI and documentation terms for item worksets, visual ranges, text selections, and annotations; clarify comment saving and disposal boundaries.
- Remove the unused cross-Surface item-target dispatcher/re-exports and keep behavioral target contracts on the existing Main, Reader and Note resolvers. Persisted-preference migration helpers remain in use and are unchanged.
- Prune historical source-text, error-wording, CSS-spelling and duplicated default-table assertions while retaining preference migrations, native input boundaries, cleanup races and package-byte contracts.
- Keep unchanged serialized bindings and immutable mode projections off the per-key parsing path; preference edits and mutable editor drafts still take effect immediately.
- Bound Picker ranking to the displayed top 100 while preserving source order for equal scores, and move keyboard selection without rebuilding result rows.

- Notes and Reader capture now default to the current Item's notes, with an explicit Library source switch that retains the same query and confirmation. Rows show titles only, thin nonselectable boundaries separate Item owners, and Preview reports each note's actual parent or standalone/unavailable source. Human notes containing citation-tool terminology remain visible.

- Include Reader failure stages, exception stacks, and causes in Debug and the profile log; record first failures and recovery without recurring idle messages.

- Complete Reader view/session and composed Reader/Main retirement even when a live cleanup throws, preserving the original failure after all owners are released. Main UI/observer ownership retires before cleanup, and late callbacks cannot reattach it. Removed PDF views restore only still-owned native key bridges; retired wrappers delegate to the native Reader. Split-pane listeners and native bridges no longer require a second disposal; Bootstrap drops its retired controller before shutdown; profile-write diagnostics retain both primary and additional close failures.

- Keep annotation-comment input attached to its PDF view. Enter inserts a newline, Escape saves and closes, and edits autosave after two seconds. Retired callbacks cannot change a newer editor's focus or draft.
- Retire Reader Insert as a mode and binding context. Migrate the comment-editing preference to `annotationCommentEditor.enabled`, preserving an existing canonical value, and remove inactive Reader Insert bindings. Note Insert and unrelated custom bindings remain unchanged.

- Reader `gg`, `G`, and counted page jumps now use one native navigation path, so mixed first/last/numbered jumps retain the correct global history locations, including the active split view. Uncounted `G` reaches the document bottom rather than the last page's start; `nG` still targets the numbered page's start, without changing zoom.
- Centralize navigation recording across Main, Reader, and Note, using completed locations for history entries. Reader searches and annotation moves can finish without a history entry when Zotero provides no restorable position.
- Enhance the native Reader Outline with compact theme-aware color/icon badges, stable full-tree ordinals (including unnumbered Introduction as the first Section), numeric direct-child counts, and bounded Bookmarks/caption groups. Native titles/numbering and independent Annotations/Thumbnails views remain untouched.
- Replace the old Reader `<Space>e` / `<Space>m` and bare `[` / `]` defaults with direct panel focus (`<Space>ro/rm/ra/rt`) and categorized `[s` / `]s`, `[f` / `]f`, `[t` / `]t`, `[a` / `]a`, and `[m` / `]m` navigation. Direct focus opens/focuses a panel without toggling it closed.
- Make Neo-owned Reader panel, picker input/list, and Plugin Manager input/list controls configurable through the shared action/context catalogs. Native text and IME remain host-owned; native shortcuts are separate read-only disclosures.
- Migrate binding preferences at schema 18: preserve non-null custom exact overrides, move retired explicit-null cancellations only when the destination is absent, and migrate persisted `focusReaderSidebar` IDs to `focusReaderOutline` without a runtime alias. The override is written before the schema version and migration is idempotent.

- Main `o` / Enter opens the Cursor item. Note `<Space>o` opens the item associated with the active note. Both use their own current context rather than Main's marked Selection.

- Main Trash confirms the resolved target kind/count, refuses hidden Selection members, and preserves Selection/history on cancel or failure. Reader annotation deletion states its single target and permanent consequence; cancellation preserves the selected annotation. New confirmations and target feedback follow the UI language.
- Navigation history records explicit Main, Reader, and cross-surface jumps without capturing persistent Main Selection. It restores readable closed Reader attachments and available PDF position, but not zoom/layout or Note caret; unavailable or partially restorable destinations do not advance the history pointer. Zotero retains ownership of actual PDF link navigation.
- Library reveal treats Zotero selection failures as failures, orders overlapping requests without replacing newer navigation context, and preserves newer Visual/annotation selections after asynchronous Trash or deletion. Reader annotation cleanup uses a cloned host array, and Note deactivation resets its caret and key guide.
- Main item-list `h` now focuses the current selected collection without collapsing it or jumping to My Library; Note Normal `u` / `Ctrl+r` no longer enter literal text when native undo/redo reports no history.

### Fixed
- Record confirmed collection-tree Enter and Find collection destinations in existing Back/Forward history without recording tree motion; preserve the departure through branch expansion, bind queued Enter to its admitted scope ID, and restore native scope completion and focus before accepting a history location.
- Keep collection callbacks local to their actual SQL outcome, preserve saved receipts after foreign post-commit callback failure, and serialize later Neo collection mutations through rollback recovery. Failed writes cannot contaminate inverse caches on a later commit or erase a subsequent membership save. Hydrate only a confirmed continuous-add item before native rendering.
- Keep Main's startup focus claim until the item table is ready, then focus the first item in the current View. Handle background-window startup and empty Views without overriding deliberate search, later Reader returns, or add-on reloads.
- Read Main View state and Toggle Tag Filter candidates from the complete native rendered scope, including multiple collections and supported mixed/cross-library selections, without calling single-selection APIs or broadening tags to entire libraries.
- Report Tag Filter matches using native object rows, excluding multiselection library headers and spacers.
- Ship the complete project AGPL-3 license and fuzzysort MIT notice inside the XPI and validate the actual archived license payloads.
- Constrain the candidate to the tested Zotero minor (`10.0.*`). Preserve the published v0.1.0 update entry.
- Bind publication to the accepted XPI SHA256, packaged metadata and source/tag identity; publish only verified draft assets, make identical reruns read-only, and reject conflicting or incomplete releases instead of overwriting them.
- Pin all Actions dependencies to verified upstream commits while retaining existing triggers and least-privilege permissions.
- Keep Plugin Manager's current query/navigation selection when a pending refresh completes, so the next enable/disable action cannot target the plugin selected before that refresh.
- Reconcile Main Cursor identity after settled native row-provider updates, including sorting without a refresh event, while honoring explicit native selection of newly saved items.
- Retire Main view observers before unregistering so callbacks captured by an asynchronous native dispatch cannot restore an old Cursor into a replacement session.
- Rebind Note input when its Document changes even if Window and item identity stay the same; clear pending mode/chord state and fence old callbacks before independent listener cleanup.
- Release partially acquired Main row-decoration resources when initial observer/listener installation fails, keep retired callbacks inert, and preserve the original installation error.
- Use the initiating Reader/PDF view's current selection and geometry for annotations. Admitted saves survive view retirement, while stale continuations cannot clear/refocus newer selection or open a different annotation's comment.
- Reject annotation selections spanning more than two pages or non-adjacent pages instead of saving truncated geometry. Incomplete PDF coordinates fail closed without clearing Select or its text.
- Compute cross-page annotation rectangles from selected text nodes, excluding intervening PDF canvas/page boxes and preserving partial text endpoints.
- Retain only pending Reader timers; completed or cancelled callbacks cannot refocus an editor or save a newer draft.
- Keep native Find composition Enter native and fence delayed return-to-PDF focus to the same live input/view.
- Reject copy/follow targets in retained but hidden PDF frames, including Reading Mode's underlying view, and revalidate containing-frame visibility before confirmation without disabling visible native-link fallback.
- Main Notes now uses the focused Cursor item independently of native multi-selection and persistent Neo Selection.
- Restore only the explicit last Neo Trash batch, report the number of successfully persisted items and roll back the in-memory deleted flag after a failed save; never invoke parameterless native Undo.
- Replace each Main session's feedback deadline so older timers cannot erase newer messages.
- Lock Picker confirmation to the admitted candidate and make it single-flight across keyboard and pointer activation. Async loads preserve the committed query; source and generation fences discard stale work. Save failures remain visible, and Escape cannot pretend to cancel an admitted native operation.
- Settle Reader note capture from the actual native save even after forced teardown, preserve unchanged note contents on save failure, and show target-named success only after the Reader invocation/view guard.
- Correct `[s` / `]s` landing when an authored PDF bookmark points to the previous page's end: match a unique genuine native heading on the authored or next page and align its printed start, preserving the native hierarchy and honest fallback. Heading/Figure/Table requests share one explicit, cached native SDK load; Reader open still starts no extra processing.
- Align Figure navigation and caption choices to trustworthy native image regions above their genuine captions, including enclosed native chart-label text and anchor precision differences. Ambiguous associations retain the caption; Table positions, native scrolling, zoom, and other keys are unchanged.
- Make `[s` / `]s` Reader-wide from the PDF and all four focused sidebar contexts. Whole-tree traversal ignores collapse/filter/current-row state, uses live exact-view geometry with rounding/bottom-clamp tolerance, wraps across document boundaries, and fences delayed native work to the current input/view owner. Native text editing and IME retain ownership.
- Reserve native-owned keys at every token in a recorded sequence, including `<C-Insert>` / `<S-Insert>` in query editing and Outline `Enter` / `Return` with modifiers. Outline `uiConfirm` remains supported but default-unbound so confirmation can be remapped to another non-reserved key.
- Retire pending PDF commands and key guides when focus or pointer input hands ownership to the Reader sidebar or native editor, preventing a delayed Reader action after the input owner changes.
- Retire delayed chooser commands on accepted row click/double-click so pointer selection cannot trigger a pending confirmation.
- Restore connected Settings focus after recording, cancellation, unbind, or reset; label native rows by context, keep Apply reachable above bounded results, and offer only usable deletion for incompatible orphan bindings.
- Bookmark traversal preserves the deleted-annotation outcome and treats browser-rounded scroll offsets as the same visible destination, preventing repeated jumps to the current mark.

- Pending Reader injection now retires a natively closed Reader before accessing its PDF wrappers, preventing dead-object errors and ghost sessions after closing an unready Reader. Queued ready callbacks cannot revive the retired identity; live injection errors remain observable.

- Retired PDF view callbacks no longer consume native keys or deliver late blur/selection/viewport events when listener removal fails. Event ownership matches the exact registration, so reattaching the same PDF window does not reactivate an older listener; original cleanup failures remain observable.

- New Main windows no longer abort Neo attachment by reading the context Note getter before Zotero initializes its inner pane. Surface, Note target, and editor identity consumers now read the published native context through one host adapter, without suppressing live errors or changing Note precedence, bindings, or preferences.

- PDF link hints preserve native IME keys and claim input only in their captured pane. Dead badges/cues/windows no longer strand ownership; retired RAF/timer callbacks and late navigation failures cannot alter a newer invocation. Reader deactivation clears the transient cue and pending activation without changing link discovery, labels, geometry or native navigation.

- Flash no longer cancels itself when native focus moves into its query input, and claims host keys only in that PDF pane. Dead input/prompt/badges cannot strand ownership; retired input/composition callbacks cannot alter a newer query. Existing matching, labels, IME editing, and Select endpoint behavior remain unchanged.

- Reader history cleanup uses the PDF-window identity captured while each view is live. Destroyed view wrappers no longer interrupt session retirement and leave Main activation inspecting a closed Reader; pending exact-view work is retired without affecting surviving split views.

- Selection Actions leaves composing keys native and claims host forwarding only in its owning PDF pane. Closing a dead Reader/split view releases palette/theme ownership without interrupting cleanup; Select marker cleanup skips destroyed windows so it cannot block that release. Stale async results cannot repaint or refocus a later palette.

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
- Introduced keyboard navigation for PDF outlines and persisted marks through custom explorers; the native Reader Outline/Bookmarks integration is documented above as their current replacement.
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
