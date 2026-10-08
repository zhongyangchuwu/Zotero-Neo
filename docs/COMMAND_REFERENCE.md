# Command Reference

This is the detailed, source-oriented reference for Zotero Neo's current commands. It describes Neo's implemented behavior, not a promise of full Neovim compatibility. The User Guide remains the short workflow and setup guide; see [the User Guide](USER_GUIDE.md), [Input methods](INPUT_METHODS.md), [Selection and Tags](TAGS.md), and [Architecture](ARCHITECTURE.md) for those topics.

## Contents

- [Reading this reference](#reading-this-reference)
- [Modes, focus, and capabilities](#modes-focus-and-capabilities)
- [Key notation and input grammar](#key-notation-and-input-grammar)
- [Command Palette, remapping, and unbound actions](#command-palette-remapping-and-unbound-actions)
- [Navigation and the shared jumplist](#navigation-and-the-shared-jumplist)
- [Reader Normal](#reader-normal)
- [Reader Select and annotation actions](#reader-select-and-annotation-actions)
- [Main window](#main-window)
- [Note editor](#note-editor)
- [Temporary surfaces and chooser grammars](#temporary-surfaces-and-chooser-grammars)
- [Action ID index](#action-id-index)
- [Default binding index](#default-binding-index)
- [Neovim comparison and examples](#neovim-comparison-and-examples)

## Reading this reference

Each command table gives the canonical `ActionId`, its default binding(s), and the surface/mode where it is executable. Binding defaults are documented per mode; same key sequences can mean different things on different surfaces. Keybinding preferences can add alternatives or unbind defaults. A command being a valid ActionId does not imply that every mode can execute it.

“History” means Neo's shared Back/Forward jumplist, not Zotero's native PDF history. `recorded` means an eligible completed discrete location change can be added; it does not promise a node for a no-op, failed, cancelled, or duplicate destination. Continuous movement and transient state changes are not jumps. See [Navigation and the shared jumplist](#navigation-and-the-shared-jumplist) for exact classification and snapshots.

## Modes, focus, and capabilities

| Scope | Mode | Capability |
| --- | --- | --- |
| Reader | Normal (`reader-normal`) | Reading, page/view navigation, annotations, tabs, shared actions, and Normal command palette. |
| Reader | Select (`reader-select`, internal Visual) | Active PDF text-range refinement and selection actions. |
| Main | Normal (`main-normal`) | Zotero library tree/items, search, Selection workset, commands and palette. |
| Main | Select (`main-select`) | Temporary Visual range in the visible Main item rows. |
| Note | Normal (`note-normal`) | Note motions/operators and supported shared actions. |
| Note | Insert (`note-insert`) | Native note-editor text input plus the explicit directional pane-focus bindings. |

These mode scopes are distinct from runtime surface capability. Reader Select applies only when an eligible PDF text selection can be owned; Main Select operates on visible item rows, not the collection tree. A binding editor offers only actions in the selected mode's capability catalog. Reader has no Insert scope; comment and native input owners use fixed feature controls. Note Insert retains its explicit directional focus actions. Native editors, chooser inputs, and composition events are not silently converted to Neo Normal commands.

Reader `enterVisual` (`v`) starts/adopts a text selection; `enterInsert` (`i`) starts feature-owned comment input when eligible rather than entering another Reader mode. Opening it normalizes Select to Normal; other split views retain Surface grammar. Settings gates Select and Normal selected-annotation entry. When comment entry is disabled, `i` starts a Reader-wide native input owner until Escape. Main `mainEnterSelect` (`v`) starts a temporary item-row range, and its finish/cancel actions end it. Note `enterInsert` still begins Note Insert; Escape is its default exit. Note editor Vim mode remains independently configurable.

## Key notation and input grammar

- Printable keys are literal and case-sensitive: `g` differs from `G`; `gg` is two `g` presses. `<Space>` is the Space key, while `:` is a literal colon key. Symbolic keys use angle-bracket notation such as `<C-o>`, `<Enter>`, `<Return>`, `<Esc>`, and `<BS>`. `<Enter>` and `<Return>` are aliases where both appear in the table.
- Ctrl and Meta are normalized as Ctrl; `Ctrl`, `Alt`, and `Shift` modifiers combine with a key. For example `<C-d>` is Ctrl+d. Printable shifted symbols use their produced character (for example `+`); named keys can retain explicit Shift.
- A leading decimal count is buffered at the root only in modes whose executor enables counts. `0` starts a count only after a count digit has already started; otherwise it is a command token (for example Reader Select `0` means line start). The engine supplies the count to the action, but that action defines whether it repeats, chooses a position, or ignores it.
- If a sequence is both an action and a prefix of a longer binding, the exact action waits briefly for continuation; if no continuation arrives it executes. In the generic engine, exact-plus-prefix waits 800 ms and prefix-only waits 1200 ms. A nonmatching continuation resets the pending sequence and is retried as a fresh command; a Neo-owned surface may have its own grammar/timing.
- Escape cancels pending key sequences or exits the relevant temporary surface/mode. Backspace removes one pending sequence token (or returns to an earlier prefix) where the binding engine owns the sequence. The pure engine's cancel/backspace operations preserve a pending count; individual surface handlers determine whether/how pending count is cleared. A chooser/editor may use Escape and Backspace for its own query/input instead.
- Browser/Gecko owns actual text entry and IME composition. While composition is active, or a native editable control has focus, Neo does not reinterpret composition keystrokes as commands. `Dead`, unidentified, and modifier-only key events are not commands. See [Input methods](INPUT_METHODS.md).
- The bindings below are defaults from the canonical catalogs, not a guarantee that a host widget accepts every physical key. Unbound keys generally remain with Zotero/browser; explicit host bridges suppress Zotero's duplicate Reader handling only for keys Neo consumes.

Default `DEFAULT_PREFIX_BINDINGS` are non-executing namespaces; they accept only their listed descendants and never run an action by themselves. Reader Normal prefixes are `g` (Navigation), `d` (Delete), `z` (View), `Z` (Filters), `<Space>` (Commands), and nested `<Space>f` (Find), `<Space>t` (Tags), `<Space>c` (Collections), `<Space>p` (Neo), `<Space>y` (Citations). Reader Select has `z` (View). Main Normal has `g` (Navigation), `d` (Delete), `z` (View), `w` (Panes), `<Space>` (Commands), and nested `<Space>f/t/c/p/s/y` (Find/Tags/Collections/Neo/Selection/Citations). Main Select has `g` (Navigation). Note Normal has `g` (Navigation), `d` (Delete), `di` (Inner), `y` (Yank), `yi` (Inner), `c` (Change), `ci` (Inner), `<Space>` (Commands), and nested `<Space>f/t/p/y` (Find/Tags/Neo/Citations). These are the shipped namespaces; resolved remaps change the active guide. Prefix Guide is a continuation index, not another command map.

## Command Palette, remapping, and unbound actions

In Reader Normal, Main Normal, and Note Normal, `:` runs `openCommandPalette`. The palette is a query-only command list from the actions executable in that current context, including supported actions with no binding; it omits `openCommandPalette` itself. It does not parse counts, arguments, Ex commands, aliases, external registrations, or provider-local command grammars. A count before `:` can open it, but the selected action runs once with its ordinary semantics. `↑/↓`, `j/k` (outside query focus), and `Ctrl+j/Ctrl+k` select; Enter runs; Escape closes. It returns execution to the originating context. The palette's action set is broader than the defaults and is constrained to the executor's current capability; an action unavailable in this context is absent, not merely unbound.

Bindings are configurable by mode, case-sensitive, and may map several sequences to one action. An explicit removal persists as unbound. Duplicate complete sequences in one mode are rejected; prefix collisions are permitted with a warning and may incur the sequence timeout. The Prefix Guide reflects the active resolved keymap, including remaps. Apply is staged in Settings; invalid or mode-incompatible rows prevent Apply. See [customising bindings in the User Guide](USER_GUIDE.md#customising-keybindings).

Distinctions:

1. **Bound by default:** present in `DEFAULT_BINDINGS` / `NOTE_LOCAL_DEFAULT_BINDINGS`; tables below list each one.
2. **Supported but unbound:** included in an executor capability and reachable via the context's Command Palette (or the indicated temporary surface), but no shipped binding exists. Examples include Reader Normal `showInLibrary`, Reader Normal `scrollBottom`, Reader Select `underlineSelection`, and Note Normal `showInLibrary`.
3. **Not supported in that mode:** absent from that mode's capability set. A binding cannot make an unsupported action execute there. `NOTE_LOCAL_DEFAULT_BINDINGS` does not mean every Note action is global or bound in other modes.
4. **Temporary grammar / native input:** a chooser, marks explorer, selection panel, Plugin Manager, Settings, Flash, or editor may own keys while active; its controls are not ordinary action bindings.

## Navigation and the shared jumplist

### Commands and count behavior

`navigateBack` and `navigateForward` are available in Main Normal, Reader Normal, and Note Normal; defaults are `<C-o>` and `<C-i>` respectively. On these keyboard shortcuts a positive count traverses that many locations (for example `2<C-o>`). Palette invocation is uncounted. At either end, traversal is a safe no-op. Insert mode, native editable fields, and Neo-owned modal inputs keep their own input and do not invoke these commands.

The list is one per owning Main window and stores at most 100 locations. Its index identifies the current entry (or `-1` when empty); Back/Forward do not wrap and clamp a positive count to the available range. A new recorded jump after Back discards the forward suffix; equivalent consecutive destinations are not duplicated. Main Selection is never part of a location.

### Recording and exclusions

A successful host operation does not guarantee a history entry. Central typed rules
in [`history-policy.ts`](NAVIGATION_HISTORY_DESIGN.md#one-history-policy-source)
decide eligibility and required evidence; the navigation design documents the
coordinator and completion contract. A command may complete unchanged or without
history when no qualifying destination/evidence exists. The following examples
describe default eligibility, not a promise that every invocation appends:

| Surface/action | History behavior |
| --- | --- |
| Main item-row `gg`/`G` | Record only when the item Cursor actually changes to a qualifying row. Main `j`/`k` and collection-tree movement do not record. `G` with a positive count selects that one-based row; bare `G` selects last, while `gg` selects first. |
| Committed Main local-find `n`/`N` | Record a qualifying Cursor destination; a miss or unchanged Cursor does not. Editing/cancelling the prompt does not record. |
| Explicit Main Open / item activation | Queued operation records only a successful/current destination. Enter on a collection scope changes view/tree state and is not by itself a location entry. Opening an item does not batch-open Neo Selection. |
| Confirmed all-library/current-collection item chooser or Note chooser | Successful destination records. A Note result's library selection and Note opening are one queued request, not two entries. Opening chooser, typing, highlighting, cancelling, and failed resolution do not record. |
| Successful `showInLibrary` / Selection Panel Reveal | Queued Main Library reveal records only after success/current validation. Selection Panel closes only after successful/current reveal. |
| `H`/`L` previous/next tab or confirmed chooser (`switchTab`) | Successful selected-tab change records. Main prefers Zotero `selectPrev()`/`selectNext()` when available; the current host cycle wraps across all open tab types, including Library, and fallback enumeration uses modulo over tabs. Count is ignored (one operation). One-tab/no-change cycle and selecting current tab do not record. Native tab-bar changes/clicks are not directly recorded. |
| Reader PDF page destinations, including `gg`, `G`, and counted boundary jumps | When the host page-navigation API is supported, explicit page destinations may record only with a causally owned native hard receipt matching the exact current view and settled final geometry. Without the API, `gg/G` fall back to top/bottom scrolling and do not create a hard-jump entry. Positive count targets the one-based page; absent/zero count selects first/last. Ordinary scrolling and adjacent `h`/`l` page turns are excluded. |
| Reader marks, outline jumps, annotation navigation, internal/citation links, and native search-result navigation | Marks use one managed final destination; the other routes require an owned, exact-view native hard receipt under the central policy. They may complete without an entry when no qualifying hard point occurs. Outline selection is not a jump; Enter confirms. |
| External PDF link | Opens through Zotero's normal handler; not a Neo Reader history location. |
| Scroll/zoom/split layout, selection/caret movement, filters, manual collection edits, and other non-location state changes | Excluded. |
| Failure, no-op, stale async operation, cancelled chooser, or target that cannot be resolved/restored | No new location. `H/L` are the only shipped tab-cycle defaults; no `J/K` aliases exist. `H/L` ignore count and perform one native tab cycle. |

For Main-originating transitions, current/cursor state is captured only for supported locations; exact recording is performed through the existing navigation owners. Back/Forward is transactional for the history index, not atomic for UI state: restoration selects the target tab and applies scope, Quick Search, tags, Advanced Search, Cursor, and focus sequentially. If a later component is unavailable or stale, earlier UI changes are not rolled back, but the index remains unchanged. Host-native actions outside an observed Neo path (for example manually clicking tabs) are not directly recorded.

Reader recording is governed by the central cause/context policy and evidence rule,
not by an action whitelist or raw save kind alone. `native-hard` requires a causally
owned producer receipt matching the exact current view and settled final geometry;
the owning Reader tab must be selected, but the split need not be focused. Search,
annotation selection, and Outline can finish without such a receipt and therefore
without appending. Marks use `managed-final`; Main cursor and tab changes use their
configured `settled-change` evidence. Default-ignored motion does not capture a
history snapshot or allocate a Promise solely for recording. Ordinary Reader `h/l`
page turns remain excluded. Counts repeat host page-step calls, not a guaranteed
arithmetic change in the visible viewport's page number.

### Snapshots and restoration

- **Main location:** records the restorable view context, including available scope, Quick Search, tag filters, Advanced Search, Cursor, and panel/focus state. It does not serialize persistent Neo Selection; no traversal changes that workset.
- **Reader PDF:** records stable library/item identity, a tab ID hint, and available primary/secondary PDF page index plus top/left viewport position. Zoom and split layout are not restored. An available open same-item tab is reused; when closed, the same readable attachment can be reopened. Old tab IDs can be remapped to the actual reopened tab ID.
- **Other Reader tab types:** identity-only; native retained position is used instead of claiming PDF geometry.
- **Other tabs:** non-library/non-Reader/non-Note tab snapshots retain tab identity only. Native retained state remains host-owned; a missing ordinary tab cannot use the Reader attachment-reopen path.
- **Standalone Note tab:** tab identity only; restoration follows native retained position. A Note context pane restores the underlying Main View, not Note editor focus or caret.
- **Partial/missing state:** a missing/deleted/trashed/unreadable attachment, missing required split view, changed/stale target, or failed restoration reports failure/partial restoration as applicable and does not advance the jumplist index. Earlier UI restoration steps are not rolled back. A closed Reader tab by itself does not trigger Back; traversal can reopen a same-window readable attachment, restore its available position, and remap the old tab hint to the actual tab ID. Missing ordinary tabs do not have this attachment-reopen path.

Before traversal, Neo refreshes the departure snapshot when its contextual identity still matches, so ordinary movement since the last discrete jump becomes the return point. Reader native PDF history is observed through a bridge that records non-transient hard saves; managed restoration saves are suppressed and native saves continue even if capture/record diagnostics fail. Mark navigation records one completed source-to-destination excursion, not each intermediate scroll/annotation movement; stale or superseded work does not append. Back/Forward refreshes departure first and changes the index only after successful restoration. Closing a Reader/Note tab does not discard the shared list; closing the owning Main window discards that window's list.

Reader command routing for a newly opened Reader becomes active as Neo's Reader session/view hooks install. Zotero's native `_isReaderInitialized` flag alone does not mean Neo is already receiving input: a key pressed during this loading window is not guaranteed to be handled. Wait until the Reader's Neo interaction is present before expecting its bindings.
### Mixed navigation examples

- In one Reader PDF where the host page-navigation API is supported, `1gg`, `5gg`, `G` are separate completed destinations; `<C-o>` / `<C-i>` walk them in order. `4gg` means page four, whereas bare `gg` means first page; `G` means last page and a positive count with `G`/`gg` targets that one-based page number. Without that API, `gg/G` scroll to document boundaries instead of creating page-jump history. Invalid targets and no-ops do not create a successful destination.
- Reader A → `L` to Reader B → a mark jump in B creates a mixed surface sequence. Back traverses the mark, then the tab transition; Forward traverses them back. H/L are not exempt merely because they switch tabs.
- If a Reader tab represented by an older entry is closed, Back to it can reopen the attachment and map the former tab hint to the reopened tab. Closing it does not erase the old entry. If the file is no longer readable, restoration fails without consuming the entry.
- Back, then make a new qualifying jump: the old Forward branch is discarded. A failed target, native tab click, ordinary scroll, or chooser cancellation does not create that branch.

## Reader Normal

| ActionId | Default binding(s) | Meaning / count / history |
| --- | --- | --- |
| `scrollDown` / `scrollUp` | `j` / `k` | Scroll by configured step; counts multiply the step. Continuous scroll, not history. |
| `scrollLeft` / `scrollRight` | `zh` / `zl` | Horizontal pan by configured step; counts multiply the step. |
| `halfPageDown` / `halfPageUp` | `<C-d>` / `<C-u>` | Move half viewport per step; counts repeat. |
| `fullPageDown` / `fullPageUp` | `<C-f>` / `<C-b>` | Move a full viewport; counts repeat. |
| `prevPage` / `nextPage` | `h` / `l` | Repeat Zotero's previous/next-page host step `max(1,count)` times; this is page turning, not a jumplist destination. The host step's current location/viewport is authoritative. |
| `firstPage` / `lastPage` | `gg` / `G` | When page navigation is supported, positive count (`ngg` or `nG`) passes that one-based page start to Zotero. Absent/zero count means first page start for `gg`, document bottom for `G`. The uncounted `G` uses one native XYZ destination derived from the active last-page viewport, including rotation, without changing zoom. Neo does not clamp numeric pages; target validity is host-owned. Recording requires an owned native hard receipt matching the exact current view and settled final geometry. If page navigation is unsupported, Neo falls back to top/bottom scrolling, ignores count, and does not create a hard-jump history entry; missing required navigation or last-page geometry reports unsupported. |
| `zoomIn` / `zoomOut` | `+`, `zI` / `-`, `zO` | One Reader zoom step; count repeats. Not history. |
| `zoomReset` | `=`, `z0` | Reset/Fit page width once; count does not repeat. |
| `scrollTop` / `scrollCenter` / `scrollBottom` | `zt` / `zz` / unbound | Place current page at top/center/bottom of viewport; view position only, no history. `scrollBottom` has no default sequence. |
| `openSearch` / `findNext` / `findPrevious` / `clearSearch` | `/`, `n`, `N`, `<Esc>` | Open Reader's native PDF find bar; `n/N` each ask Zotero for one next/previous result regardless of count. A result may complete without an entry; only a qualifying owned native hard receipt records under the central policy. Query editing is not navigation history. |
| `followLink` | `f` | Start visible PDF link hints; count is ignored. Hint activation may navigate internal/citation links; recording requires a qualifying owned exact-view native hard receipt. External links open outside Neo Reader history. Escape cancels; see [link hints](#temporary-surfaces-and-chooser-grammars). |
| `prevAnnotation` / `nextAnnotation` | `[` / `]` | Select previous/next annotation, wrapping at the end; count is ignored. Selection alone can complete without an entry; recording requires a qualifying owned native hard receipt. |
| `editAnnotation` | `<Enter>`, `<Return>` | Open/focus the selected annotation comment's feature-owned input, displaying Insert; not jumplist. |
| `deleteAnnotation` | `dd` | Delete selected annotation after confirmation; cancellation leaves it unchanged. Not a navigation entry. |
| `yankAnnotation` / `yankAnnotationComment` | `y` / `Y` | Copy selected annotation text / comment. No target means no copy. |
| `recolorYellow/Red/Green/Blue/Purple` | `zy` / `zr` / `zg` / `zb` / `zp` | Recolor selected annotation. No selected annotation means no effect. |
| `filterYellow/Red/Green/Blue/Purple` / `filterClear` | `Zy` / `Zr` / `Zg` / `Zb` / `Zp` / `Za` | Filter/clear annotation sidebar color filter; not history. |
| `enterVisual` / `enterInsert` / `exitMode` | `v` / `i` / `<Esc>` in owned contexts | Enter Select, open eligible comment input, or leave the owned interaction. Settings gate Select and comment entry; disabled comment/Insert retains bare `i` native-pass-through compatibility. `exitMode` is unbound in Reader Normal. |
| `focusReaderSplitLeft/Down/Up/Right` | `<C-h>` / `<C-j>` / `<C-k>` / `<C-l>` | Focus nearest supported direction/split/context pane; no wrap. Missing target leaves focus unchanged. |
| `toggleReaderSidebarOutline` | `<Space>e` | Toggle custom outline explorer. Opening/selecting is not itself a history jump; a confirmed destination may record only when its owned native hard receipt qualifies. A successful jump without that receipt has no entry. |
| `toggleReaderSplitHorizontal` / `toggleReaderSplitVertical` | `<Space>-` / <code>&lt;Space&gt;&#124;</code> | Toggle Reader split layout; layout is not part of jumplist snapshot. |
| `findAllItems` / `findCollectionItems` / `findNotes` | `<Space>ff` / `<Space>fc` / `<Space>fn` | Shared item/note chooser. A successful confirmed destination can record under the central settled-change rule; chooser activity itself does not. Escape cancels. |
| `switchTab` / `previousTab` / `nextTab` / `closeCurrentTab` | `<Space>,` / `H` / `L` / `<Space>q` | Choose open tab, cycle tabs, or close current tab. Successful chooser/H/L changes record; H/L counts are ignored and each cycles once. Closing alone is not Back and does not delete older entries. |
| `navigateBack` / `navigateForward` | `<C-o>` / `<C-i>` | Shared history traversal; positive counts accepted on shortcut; palette execution is once. |
| `openCommandPalette` / `openNeoSettings` / `managePlugins` | `:` / `<Space>ps` / `<Space>pp` | Open query-only palette, Settings, or persistent Plugin Manager panel. Modal/surface transition, not history. |
| `addTag` / `removeTag` / `addToCollection` / `removeFromCollection` | `<Space>ta` / `<Space>tr` / `<Space>ca` / `<Space>cr` | Resolve active Reader bibliographic item and run chooser operation. Explicit user data operation, not a jump; failure/revalidation cancels whole action. |
| `mainYankCitekey` | `<Space>yy` | Copy active Reader item's citekey; does not use Main Selection. |
| `showInLibrary` | **Unbound** | Show active Reader item in Main Library; supported from Reader Normal palette. A successful changed reveal is eligible under the central settled-change rule. |
| `focusReaderSidebar` | **Unbound** | Focus/reopen custom outline surface where the Reader executor exposes it; does not jump until an outline destination is confirmed. |

Other Reader actions are Select-only; see [Reader Select](#reader-select-and-annotation-actions). Actual split focus direction may target another pane type, including a Note context pane; it does not promise pane creation.
Reader Normal counts are action-specific: step scroll, half/full viewport, `h/l` page turns, zoom in/out, and history traverse/repeat as their rows state; numeric `gg/G` is a single page target when supported. Search, annotation, tab-cycle, pane/layout, chooser, and other Reader Normal actions run once. Reader Select ignores counts for all its binding actions.

## Reader Select and annotation actions

Reader `v` enters Select and uses Flash to choose a text range (or adopts an existing native selection when available). Select action defaults:

| ActionId | Default binding(s) | Meaning |
| --- | --- | --- |
| `flashText` | `s` | Flash to choose the other endpoint while preserving the current anchor. Literal Unicode/IME query; Enter picks nearest labelled target, Escape cancels the Flash stage. |
| `extendDown` / `extendUp` | `j` / `k` | Extend active endpoint by a line. |
| `extendLeft` / `extendRight` | `h` / `l` | Extend by a character. |
| `extendWordForward` / `extendWordBackward` | `w` / `b` | Extend to next/previous word boundary. |
| `extendLineStart` / `extendLineEnd` | `0` / `$` | Extend to current line boundary. |
| `extendSentenceForward` / `extendSentenceBackward` | `)` / `(` | Extend by sentence boundary. |
| `extendParagraphForward` / `extendParagraphBackward` | `}` / `{` | Extend by paragraph boundary. |
| `swapVisualEnds` | `o` | Swap anchor and active endpoint. |
| `openSelectionActions` | `a`, `<Enter>`, `<Return>` | Open the Selection Actions temporary palette; cancelling preserves selection. |
| `highlightYellow/Red/Green/Blue/Purple` | `zy` / `zr` / `zg` / `zb` / `zp` | Create a colored annotation from current range. |
| `addNote` | `za`, `i` | Create an annotation and open its comment editor. This is distinct from Capture to note. |
| `copySelection` | `y` | Copy Neo-owned selected text, normalizing PDF line breaks/whitespace. |
| `searchSelection` | `#` | Open Reader search for selected text. |
| `exitMode` | `v`, `<Esc>` | Cancel Reader Select and return to Normal. |
| `underlineSelection` | **Unbound** | Supported Select action via Selection Actions when its built-in action is available; no default key. |

Flash labels disambiguate query typing from target selection. A label's exact completed prefix activates its target immediately; Enter activates the first/nearest current result. If many targets exist, Neo shows a match count before drawing per-target label geometry until the query narrows. Escape cancels and preserves the selection. Selection Actions built-ins include Capture to note, Underline, and Add note; colored highlights, copy, and search have direct bindings. Optional Translate appears only when Zotero Translate integration is available; its result is displayed in the action surface. Keyboard-created selection is copied through Neo's DOM range, not Zotero's separate native semantic range. See [Input methods](INPUT_METHODS.md) and the [User Guide selection workflow](USER_GUIDE.md#selection-workflow).
Annotation Comment Editor is a view-scoped Feature Input Owner, not a Reader mode. Pending/mounted ownership displays COMMENT; native text and IME remain browser-owned, Enter inserts a newline, and ordinary Escape saves/closes. Composing Escape stays with IME. Edits autosave after two seconds. Saving uses the captured annotation target; exit releases input synchronously and late completion cannot change a newer owner's focus/status. Missing targets cannot be saved. Disabled Normal entry retains Reader-wide NATIVE passthrough until Escape, not a Reader Insert mode. In Reader Select, counts are ignored: each motion extends once and each selection action runs once.

## Main window

Main Normal bindings depend on whether the collection tree, item rows, Quick Search, another editable field, or a Neo modal currently owns focus. Item Cursor, native multi-selection, Main Select transient range, and persistent Neo Selection are different target sources. Operations below re-resolve targets before mutation; stale/hidden/unavailable targets can be refused rather than applied to a different item.

### Main actions

| ActionId | Default binding(s) | Meaning / count / history |
| --- | --- | --- |
| `mainNavDown` / `mainNavUp` | `j` / `k` | Move Cursor down/up in tree or items; counts multiply row movement and clamp at visible list bounds. Continuous, excluded from history. |
| `mainNavFirst` / `mainNavLast` | `gg` / `G` | In Items or collection tree, `gg` always goes to first row and `G` to last, or to the positive count's one-based row. Only a changed qualifying Cursor in Items is recorded; tree movement does not create a jumplist entry. |
| `mainActivate` | `<Enter>`, `<Return>` | In the collection tree, activate the focused scope (not a jumplist location); in Items, open Cursor item/PDF through the queued Main-open path, recording only a successful/current destination. |
| `mainTreeCollapse` / `mainTreeExpand` | `h` / `l` | `h` while Items owns focus switches to Collections; otherwise it collapses the selected open collection or selects its parent. `l` expands a selected nonempty closed collection; if it is open or a leaf, it focuses Items. No history entry. |
| `mainTreeToggle` / `mainTreeOpenOnly` / `mainTreeCloseOnly` | `za` / `zo` / `zc` | Toggle, expand only, or collapse only selected collection row. |
| `mainTreeExpandAll` / `mainTreeCollapseAll` | `R` / `M` | Expand/collapse all collections in current library tree. |
| `mainTreeParent` | `<BS>` | Move ScopeCursor to parent collection. |
| `mainFocusTree` / `mainFocusLeft` / `mainFocusRight` / `mainFocusItems` | `e` / `wh` / `wl` / `ww` | Focus collection tree, left pane, right detail pane, or middle item list. Focus action is not location history. |
| `mainEnterSelect` | `v` | Begin transient Visual range in item rows. |
| `mainToggleSelection` | `s` | Toggle current target into/out of persistent Neo Selection; in collection tree it does not redefine native tree semantics. |
| `mainClearSelection` | `<Space>sc` | Explicitly clear persistent Selection. |
| `mainCancelTarget` | `<Esc>` | Cancel Visual/native multi CurrentTarget, not persistent Selection. |
| `mainSelectDown` / `mainSelectUp` | `j` / `k` in Main Select | Extend transient range by the count's row distance, clamped to visible list bounds. |
| `mainSelectFirst` / `mainSelectLast` | `gg` / `G` in Main Select | `gg` extends to first row regardless of count; `G` extends to last row or the positive count's one-based row. |
| `mainSelectSwapEnds` | `o` in Main Select | Swap range anchor and active end. |
| `mainSelectFinish` / `mainSelectCancel` | `s` / `v`, `<Esc>` in Main Select | Commit or cancel temporary range; cancellation does not clear persistent Selection. |
| `mainTrashItems` | `dd`, `x` | Trash persistent Selection if nonempty, else transient CurrentTarget; confirmation required. Hidden Selection members refuse operation; cancellation preserves it. |
| `mainRestoreTrashedItems` | `u` | Restore the last item batch trashed by Neo; unavailable batch is a no-op/failure. |
| `mainOpenPDF` | `o` | Open Cursor item/PDF only; does not batch-open persistent Selection/native multi-selection. |
| `mainYankCitekey` | `<Space>yy` | Copy citekeys for Main EffectiveSelection; refusal if any target cannot resolve a citekey leaves clipboard unchanged. |
| `openSearch` | `/` | Main Normal requires Items focus; it cancels a transient Visual range and opens Neo's local-find prompt over visible item rows. It is not Zotero Quick Search; use `mainQuickSearch` (`<Space>fq`) for that. |
| `findNext` / `findPrevious` | `n` / `N` | Main Normal requires Items focus; cancels a transient Visual range and repeats the committed local-find query once forward/backward (count is ignored). No query, a miss, or unavailable Cursor movement leaves location unchanged; a successful changed Cursor move is eligible under the central settled-change rule. |
| `mainQuickSearch` / `mainAdvancedSearch` | `<Space>fq` / `<Space>fa` | Focus native Quick Search or open Advanced Search; `fa` can convert existing Quick Search text. These alter Main View scope, not Reader page location. |
| `findAllItems` / `findCollectionItems` / `findNotes` | `<Space>ff` / `<Space>fc` / `<Space>fn` | Shared target chooser; a successful confirmed destination can record under the central settled-change rule. |
| `switchTab` / `previousTab` / `nextTab` / `closeCurrentTab` | `<Space>,` / `H` / `L` / `<Space>q` | Open-tab chooser, previous/next open tab, close active tab. Successful chooser/H/L changes record; H/L ignore counts. Closing alone is not recorded and does not delete older entries.
| `navigateBack` / `navigateForward` | `<C-o>` / `<C-i>` | Shared counted history traversal. |
| `addTag` / `removeTag` | `<Space>ta` / `<Space>tr` | Apply to revalidated Main target set; add can create explicit candidate; remove offers assigned tags. |
| `toggleTagFilter` / `clearTagFilters` | `<Space>tf` / `<Space>tc` | Main-only native AND tag filter toggle / clear all. Not jumplist entries. |
| `addToCollection` / `removeFromCollection` | `<Space>ca` / `<Space>cr` | Apply to Main EffectiveSelection/CurrentTarget in same-library collection chooser. Not a location jump. |
| `openCommandPalette` / `managePlugins` / `openNeoSettings` | `:` / `<Space>pp` / `<Space>ps` | Command Palette, persistent Plugin Manager, or Settings. |
| `focusReaderSplitLeft/Down/Up/Right` | `<C-h>` / `<C-j>` / `<C-k>` / `<C-l>` | Focus nearest eligible pane in direction; no wrap at boundaries. |
| `showInLibrary` | **Not supported** | Main Normal has no such capability. Reader Normal and Note Normal expose the action unbound in their Command Palettes; it resolves the active Reader or Note context item, never Main Selection. |

EffectiveSelection in Main resolves persistent Selection first; absent it, the current transient/native target resolution applies (including native multi-selection and Cursor according to the operation). Collection tree scope selection is Zotero-owned and is not Neo's item Selection. Collection/tag/citekey operations have operation-specific target requirements; see [Selection and Tags](TAGS.md).

Main counts are consumed only by `mainNavDown/Up`, `mainNavLast`, `mainSelectDown/Up`, `mainSelectLast`, and `navigateBack/Forward` as described above; `mainNavFirst` and `mainSelectFirst` always select the first row. Other Main actions perform one operation, and local `n/N` each perform one search step regardless of count.

### Main-only local find

When item-list focus and Main local find own the interaction, `/` opens a prompt; Enter commits a non-empty query and moves Cursor to the next visible match; Escape cancels without replacing the previous committed query. `n/N` each make one forward/backward search step regardless of count, wrapping once through visible rows. Search is case-insensitive over compact item metadata (display/title, first creator, year, citekey when available); no committed query, empty query, a miss, or unavailable Cursor movement leaves location unchanged and reports status. A successful changed Cursor move is eligible under the central settled-change rule. Local find is distinct from `ff/fc` fuzzy choosers and native `fq/fa` Quick/Advanced Search.

## Note editor

Note Vim editing is gated by **Note editor Vim mode**. With the gate off, Zotero/browser editor owns normal typing. With it on, Normal motions and operators edit through the Note editor integration; Insert text and IME are native. `Escape` exits Insert to Note Normal. Note actions are in `NOTE_ACTION_IDS`; each default comes from `NOTE_LOCAL_DEFAULT_BINDINGS` in `note-actions.ts`.

| ActionId | Default | Effect |
| --- | --- | --- |
| `noteMoveLeft` / `noteMoveDown` / `noteMoveUp` / `noteMoveRight` | `h` / `j` / `k` / `l` | Move caret by character/line. |
| `noteMoveWordForward` / `noteMoveWordBackward` | `w` / `b` | Move by word. |
| `noteMoveLineStart` / `noteMoveLineEnd` | `0` / `$` | Move within line. |
| `noteMoveDocumentStart` / `noteMoveDocumentEnd` | `gg` / `G` | Move to document boundary. |
| `noteDeleteChar` | `x` | Delete character at caret. |
| `noteAppendAfter` / `noteAppendLineEnd` / `noteInsertLineStart` | `a` / `A` / `I` | Enter Insert after caret, at line end, or line start. |
| `noteOpenLineBelow` / `noteOpenLineAbove` | `o` / `O` | Open line below/above and enter Insert. |
| `noteUndo` / `noteRedo` | `u` / `<C-r>` | Use the Note undo/redo bridge. |
| `notePutAfter` / `notePutBefore` | `p` / `P` | Put Neo's internal Note register after/before caret. |
| `noteDeleteLine` / `noteYankLine` | `dd` / `yy` | Delete/yank current line. |
| `noteDeleteLeft/Down/Up/Right` | `dh` / `dj` / `dk` / `dl` | Delete through the corresponding motion. |
| `noteDeleteWordForward/Backward` | `dw` / `db` | Delete through word motion. |
| `noteDeleteToLineStart/End` | `d0` / `d$` | Delete through line boundary. |
| `noteDeleteInnerWord` | `diw` | Delete current inner word. |
| `noteYankLeft/Down/Up/Right` | `yh` / `yj` / `yk` / `yl` | Yank through corresponding motion to internal register. |
| `noteYankWordForward/Backward` | `yw` / `yb` | Yank through word motion. |
| `noteYankToLineStart/End` | `y0` / `y$` | Yank through line boundary. |
| `noteYankInnerWord` | `yiw` | Yank current inner word. |
| `noteChangeLeft/Down/Up/Right` | `ch` / `cj` / `ck` / `cl` | Delete through corresponding motion and enter Insert. |
| `noteChangeWordForward/Backward` | `cw` / `cb` | Change through word motion and enter Insert. |
| `noteChangeToLineStart/End` | `c0` / `c$` | Change through line boundary and enter Insert. |
| `noteChangeInnerWord` | `ciw` | Change current inner word and enter Insert. |

Shared Note Normal bindings include `<C-o>/<C-i>` history, `i` Insert, `<Esc>` Normal exit, `:` palette, `<Space>ff/fc/fn`, `<Space>,`, `<Space>ta/tr`, `<Space>q`, `<Space>pp/ps`, `<Space>e`, `<Space>yy`, `<Space>o`, `H/L`, and `<C-h/j/k/l>`. Note does not expose collection-membership or Main tag-filter commands. `mainOpenPDF` (`<Space>o` in Note) resolves its Note context item; note target is captured before palette focus. Note chooser opens a Note result; it is not a second note create/delete grammar.

Note counts are command-specific: counts repeat `h/l/j/k/w/b/0/$` caret motions and `x` character deletion. `gg/G` go to document start/end once; `a/A/I`, `o/O`, `p/P`, and `u/<C-r>` each perform one operation regardless of count. All `d`, `y`, and `c` operator forms—including `dd/yy`, motion forms, and `iw` text objects—apply once; there is no operator-count multiplication or general Vim operator-pending algebra. `y` commands update Neo's internal Note register and the system clipboard; delete/change commands update the internal register, while `p/P` paste that register. Undo/redo use the editor's native `execCommand` bridge and consume the shortcut even when no history is available. Note standalone-tab history preserves identity/native retained position, not caret position. Context-pane history restores Main View rather than Note focus/caret.

## Temporary surfaces and chooser grammars

### Shared chooser

`ff`, `fc`, `fn`, `,`, tag actions, and collection actions invoke the shared chooser as described in their owning surface tables. It owns query text, fuzzy ranking, row focus, preview, confirmation, cancellation, and IME. `↑/↓` move the highlighted row; `j/k` do so when query input is not focused; `Ctrl+j/n` move down and `Ctrl+k/p` move up; `Ctrl+d/u` scroll the preview. `/` focuses/selects the query when focus is outside it. Enter confirms; Shift+Enter requests the alternate open-in-window presentation only when supported; Escape closes/cancels. Typing edits the focused query. Mouse row selection requires the preference to enable it; hover alone is inert. A chooser only resolves an action target; it does not add provider-local commands.

Tag behavior is operation-specific: Add Tag may expose an explicit create candidate; Remove Tag lists tags assigned to at least one target. Main `tf` toggles one Zotero-native tag filter; `tc` clears filters without a chooser. With a configured separator, a tag query is refined segment by segment: a non-terminal virtual namespace is not a tag mutation, and Enter on that candidate replaces the query with the namespace path while keeping the chooser open. A terminal tag is the candidate for the invoking action. Paths are a presentation over flat Zotero strings and never rewrite tag data. Collection actions require same-library targets, re-resolve before confirmation, and skip already-present/absent membership. A changed target/library or cancelled chooser refuses the whole operation.

### Flash and link hints

Flash runs under Reader Select `s` (or Select start entered by `v`). It uses a real browser input for literal query, with composition-aware IME; label characters are separate from committed query characters. Enter chooses nearest labelled target, Escape cancels, Backspace edits query/label according to focus. No match leaves selection unchanged. It does not synthesize Unicode from keydown data.

Reader Normal `f` enumerates visible internal, citation, and external PDF links in the active Reader view. Type hint characters to choose; matching is case-insensitive, Backspace removes a hint character, Escape cancels. Activation follows the Reader's PDF navigation handler; internal/citation jumps may record only when their owned exact-view native hard receipt qualifies, external links are not Neo history. Off-screen links and reference-preview overlays are not included.

### Outline explorer

`<Space>e` toggles the Reader outline overlay. While it owns input: `j/k`, `Ctrl+d/u`, `l/h`, `R/M`, and `gg/G` navigate/expand/collapse outline rows; counts are not forwarded as general movement counts. Hint letters select without jumping; Enter confirms the selected outline destination; Escape closes. Selection and navigation are separate. The overlay closes after a successful completed or unchanged host outcome, independently of whether the central history policy appends. A confirmed jump records only when its owned native hard receipt qualifies; a successful jump without that evidence has no entry. If current page cannot map reliably to an outline entry, explorer chooses a fallback rather than claiming exact location.

### Marks and Marks Explorer

The marks grammar is Reader-owned and not represented by `ActionId` entries. `m` then a lowercase letter or digit sets a viewport mark; backtick then a letter/digit jumps; `dm` then a mark deletes one; `dM` deletes all; `<Space>m` toggles Marks Explorer. The mark character after the prefix is a label, not a count (`4j` counts movement; `` `1 `` jumps to mark `1`). Mark jumps restore marked viewport and can restore selected annotation association; successful jumps record one completed excursion, not each intermediate scroll. Explorer accepts direct mark labels, `j/k`, `G` or End to go last, Enter to jump, `d` to delete, `x` to delete all, Escape to close. It has no Home/gg shortcut; marks `j`, `k`, `g`, `d`, and `x` are not direct-character shortcuts in the explorer (use list selection and Enter); uppercase letters are not mark labels. Mark persistence is governed by Preferences; not a second navigation stack.

### Annotation comment editor

Eligible Reader Normal `i` / Enter opens the selected annotation's floating comment
editor; Select `i` opens it for the newly created annotation. While that feature owns
input, ordinary typing and Enter newline remain native, non-composing Escape saves
the current draft and closes, and edits autosave after two seconds. These are feature
controls, not inherited Reader Normal actions. There is no cancel/rollback command:
Escape saves changes since the last autosave rather than discarding them. IME-owned
Escape remains native.

Settings → Reader → **Annotation comment editing** gates Normal-mode selected-annotation
entry (default On); it persists as `extensions.zotero-neo.annotationCommentEditor.enabled`.
Off preserves `i` native passthrough and its Escape exit without disabling Zotero-native
comments. Existing mode-preference true/false values migrate to this feature key;
an existing canonical value wins and the old key is removed. Schema 17 deletes the
inactive `reader-insert:` / legacy `insert:` mappings and null unbindings with owner
approval, without archiving, new shortcuts, or runtime aliases. Other contexts remain.
Select **Add note** still creates an annotation and opens its comment editor; it is
not gated by the Normal-mode entry switch.

### Selection Actions, Plugin Manager, Settings, and Selection Panel

Selection Actions (`a`/Enter in Reader Select) offers capture-to-note, underline, add note and optional Translate integration. Escape cancels; action availability depends on active Reader selection and optional integration. Capture-to-note opens the shared Notes chooser and appends quoted captured context only after target revalidation; it is distinct from adding an annotation comment.

Plugin Manager (`<Space>pp`) is persistent, unlike a chooser. It uses `j/k` or arrows, `Ctrl+d/u`, `gg/G`, `/` filter, `r` reload, Escape/`q` close. `e/d` enable/disable only if AddonManager grants that operation; `p` opens registered plugin settings; `o` opens homepage; `R` opens a mapped GitHub README; `L` opens repository commit history. Neo cannot disable itself through its own panel. Zotero AddonManager remains authoritative.

Settings (`<Space>ps`) is Neo-owned, with binding edits staged until Apply. Main Selection Panel is opened through `<Space>ss`; `j/k` move through entries, `Home`/`gg` go first, `End`/`G` go last, `Enter` reveals the selected item, `x` removes it from persistent Neo Selection, `c` clears that Selection, `r` refreshes, and Escape/`q` closes. Its list distinguishes visible, hidden, and unavailable items; an unavailable item cannot be revealed. Reveal is queued and the panel closes only after successful/current Library selection; failed reveal leaves it open. Selection Panel controls inspect/reveal/remove workset membership; they are not batch actions on Zotero items.

## Action ID index

This index covers all 179 canonical `ActionId`s in `ACTION_IDS`, including every `NOTE_ACTION_ID`. Defaults are the only shipped shortcuts; **unbound** means no shipped binding. Availability names identify the executor capability, not a guarantee a target exists at runtime. See the detailed mode tables above for semantics.

| ActionId | Default binding(s) | Capability / principal effect |
| --- | --- | --- |
| `scrollDown` | Reader Normal `j` | Reader Normal scroll |
| `scrollUp` | Reader Normal `k` | Reader Normal scroll |
| `scrollLeft` | Reader Normal `zh` | Reader Normal horizontal pan |
| `scrollRight` | Reader Normal `zl` | Reader Normal horizontal pan |
| `prevPage` | Reader Normal `h` | Reader Normal page turn |
| `nextPage` | Reader Normal `l` | Reader Normal page turn |
| `followLink` | Reader Normal `f` | Reader Normal visible PDF link hints |
| `flashText` | Reader Select `s` | Reader Select endpoint targeting |
| `firstPage` | Reader Normal `gg` | Reader Normal first/count page jump |
| `lastPage` | Reader Normal `G` | Reader Normal document-end/count page jump |
| `halfPageDown` | Reader Normal `<C-d>` | Reader Normal half viewport |
| `halfPageUp` | Reader Normal `<C-u>` | Reader Normal half viewport |
| `fullPageDown` | Reader Normal `<C-f>` | Reader Normal full viewport |
| `fullPageUp` | Reader Normal `<C-b>` | Reader Normal full viewport |
| `zoomIn` | Reader Normal `+`, `zI` | Reader Normal zoom |
| `zoomOut` | Reader Normal `-`, `zO` | Reader Normal zoom |
| `zoomReset` | Reader Normal `=`, `z0` | Reader Normal zoom reset |
| `scrollTop` | Reader Normal `zt` | Reader Normal viewport positioning |
| `scrollCenter` | Reader Normal `zz` | Reader Normal viewport positioning |
| `scrollBottom` | **unbound** | Reader-local viewport positioning capability |
| `openSearch` | Reader/Main Normal `/` | Reader search; Main native search/local-find dispatcher |
| `findNext` | Reader/Main Normal `n` | Reader/Main search result or Main local find |
| `findPrevious` | Reader/Main Normal `N` | Reader/Main search result or Main local find |
| `prevAnnotation` | Reader Normal `[` | Reader annotation navigation |
| `nextAnnotation` | Reader Normal `]` | Reader annotation navigation |
| `clearSearch` | Reader Normal `<Esc>` | Reader search clear/close |
| `enterVisual` | Reader Normal `v` | Reader Select entry |
| `openSelectionActions` | Reader Select `a`, `<Enter>`, `<Return>` | Selection Actions |
| `enterInsert` | Reader Normal `i`; Note Normal `i` | Reader feature/native input ownership; Note editor Insert transition |
| `exitMode` | Reader Select `<Esc>`/`v`; Note Normal `<Esc>`; Note Insert `<Esc>` | Surface mode exit; Reader feature Escape is fixed input-owner control, Main Select uses dedicated cancel |
| `extendDown` | Reader Select `j` | Reader Select range motion |
| `extendUp` | Reader Select `k` | Reader Select range motion |
| `extendLeft` | Reader Select `h` | Reader Select range motion |
| `extendRight` | Reader Select `l` | Reader Select range motion |
| `extendSentenceForward` | Reader Select `)` | Reader Select range motion |
| `extendSentenceBackward` | Reader Select `(` | Reader Select range motion |
| `extendParagraphForward` | Reader Select `}` | Reader Select range motion |
| `extendParagraphBackward` | Reader Select `{` | Reader Select range motion |
| `extendWordForward` | Reader Select `w` | Reader Select range motion |
| `extendWordBackward` | Reader Select `b` | Reader Select range motion |
| `extendLineStart` | Reader Select `0` | Reader Select range motion |
| `extendLineEnd` | Reader Select `$` | Reader Select range motion |
| `highlightYellow` | Reader Select `zy` | Reader Select annotation create |
| `highlightRed` | Reader Select `zr` | Reader Select annotation create |
| `highlightGreen` | Reader Select `zg` | Reader Select annotation create |
| `highlightBlue` | Reader Select `zb` | Reader Select annotation create |
| `highlightPurple` | Reader Select `zp` | Reader Select annotation create |
| `underlineSelection` | **unbound** | Reader Select Selection Actions capability |
| `addNote` | Reader Select `za`, `i` | Create annotation and comment editor |
| `copySelection` | Reader Select `y` | Copy selected text |
| `searchSelection` | Reader Select `#` | Search selected text |
| `swapVisualEnds` | Reader Select `o`; Main Select `o` maps to `mainSelectSwapEnds` | Reader Select endpoint swap |
| `editAnnotation` | Reader Normal `<Enter>`, `<Return>` | Annotation comment editor |
| `deleteAnnotation` | Reader Normal `dd` | Confirmed annotation deletion |
| `filterYellow` | Reader Normal `Zy` | Annotation color filter |
| `filterRed` | Reader Normal `Zr` | Annotation color filter |
| `filterGreen` | Reader Normal `Zg` | Annotation color filter |
| `filterBlue` | Reader Normal `Zb` | Annotation color filter |
| `filterPurple` | Reader Normal `Zp` | Annotation color filter |
| `filterClear` | Reader Normal `Za` | Clear annotation filter |
| `recolorYellow` | Reader Normal `zy` | Recolor annotation |
| `recolorRed` | Reader Normal `zr` | Recolor annotation |
| `recolorGreen` | Reader Normal `zg` | Recolor annotation |
| `recolorBlue` | Reader Normal `zb` | Recolor annotation |
| `recolorPurple` | Reader Normal `zp` | Recolor annotation |
| `yankAnnotation` | Reader Normal `y` | Copy annotation text |
| `yankAnnotationComment` | Reader Normal `Y` | Copy annotation comment |
| `openCommandPalette` | Reader/Main/Note Normal `:` | Context command palette |
| `openNeoSettings` | Reader/Main/Note Normal `<Space>ps` | Settings surface |
| `findAllItems` | Reader/Main/Note Normal `<Space>ff` | Shared library item chooser |
| `findCollectionItems` | Reader/Main/Note Normal `<Space>fc` | Shared collection item chooser |
| `findNotes` | Reader/Main/Note Normal `<Space>fn` | Shared Note chooser |
| `mainQuickSearch` | Main Normal `<Space>fq` | Native Quick Search focus |
| `mainAdvancedSearch` | Main Normal `<Space>fa` | Native Advanced Search |
| `managePlugins` | Reader/Main/Note Normal `<Space>pp` | Plugin Manager panel |
| `manageSelection` | Main Normal `<Space>ss` | Main Selection Panel |
| `navigateBack` | Reader/Main/Note Normal `<C-o>` | Shared jumplist Back |
| `navigateForward` | Reader/Main/Note Normal `<C-i>` | Shared jumplist Forward |
| `showInLibrary` | **unbound** | Reader Normal and Note Normal palette capability; unavailable in Main Normal. |
| `mainTrashItems` | Main Normal `dd`, `x` | Confirmed Main trash |
| `mainRestoreTrashedItems` | Main Normal `u` | Restore Neo's last trash batch |
| `mainFocusTree` | Main Normal `e`; Note Normal `<Space>e` | Focus Main collection tree |
| `mainFocusLeft` | Main Normal `wh` | Focus left pane |
| `mainFocusRight` | Main Normal `wl` | Focus detail pane |
| `mainFocusItems` | Main Normal `ww` | Focus item list |
| `mainYankCitekey` | Reader/Main/Note Normal `<Space>yy` | Copy context-sensitive citekeys |
| `mainOpenPDF` | Main Normal `o`; Note Normal `<Space>o` | Open Main Cursor / Note context item |
| `closeCurrentTab` | Reader/Main/Note Normal `<Space>q` | Close active tab |
| `addTag` | Reader/Main/Note Normal `<Space>ta` | Add tag to eligible target(s) |
| `removeTag` | Reader/Main/Note Normal `<Space>tr` | Remove tag from eligible target(s) |
| `toggleTagFilter` | Main Normal `<Space>tf` | Main native tag filter |
| `clearTagFilters` | Main Normal `<Space>tc` | Clear Main tag filters |
| `addToCollection` | Reader/Main Normal `<Space>ca` | Add item(s) to collection |
| `removeFromCollection` | Reader/Main Normal `<Space>cr` | Remove item(s) from collection |
| `mainEnterSelect` | Main Normal `v` | Begin Main item Visual range |
| `mainToggleSelection` | Main Normal `s` | Toggle persistent Neo Selection |
| `mainClearSelection` | Main Normal `<Space>sc` | Clear persistent Selection |
| `mainCancelTarget` | Main Normal `<Esc>` | Cancel transient target only |
| `mainSelectDown` | Main Select `j` | Extend Main Visual range |
| `mainSelectUp` | Main Select `k` | Extend Main Visual range |
| `mainSelectFirst` | Main Select `gg` | Extend to first item |
| `mainSelectLast` | Main Select `G` | Extend to last item |
| `mainSelectSwapEnds` | Main Select `o` | Swap range ends |
| `mainSelectFinish` | Main Select `s` | Commit Main Visual range |
| `mainSelectCancel` | Main Select `v`, `<Esc>` | Cancel Main Visual range |
| `mainNavDown` | Main Normal `j` | Move Main Cursor |
| `mainNavUp` | Main Normal `k` | Move Main Cursor |
| `mainNavFirst` | Main Normal `gg` | First Main row |
| `mainNavLast` | Main Normal `G` | Last Main row |
| `mainActivate` | Main Normal `<Enter>`, `<Return>` | Activate scope/open item |
| `switchTab` | Reader/Main/Note Normal `<Space>,` | Open-tab chooser |
| `previousTab` | Reader/Main/Note Normal `H` | Previous open tab |
| `nextTab` | Reader/Main/Note Normal `L` | Next open tab |
| `mainTreeToggle` | Main Normal `za` | Toggle collection row |
| `mainTreeOpenOnly` | Main Normal `zo` | Expand collection row |
| `mainTreeCloseOnly` | Main Normal `zc` | Collapse collection row |
| `mainTreeExpand` | Main Normal `l` | Expand/focus items |
| `mainTreeCollapse` | Main Normal `h` | Collapse/parent/focus tree |
| `mainTreeParent` | Main Normal `<BS>` | Parent collection |
| `mainTreeExpandAll` | Main Normal `R` | Expand all collections |
| `mainTreeCollapseAll` | Main Normal `M` | Collapse all collections |
| `focusReaderSplitLeft` | Reader/Note/Main Normal and Note Insert `<C-h>` | Directional pane focus |
| `focusReaderSplitDown` | Reader/Note/Main Normal and Note Insert `<C-j>` | Directional pane focus |
| `focusReaderSplitUp` | Reader/Note/Main Normal and Note Insert `<C-k>` | Directional pane focus |
| `focusReaderSplitRight` | Reader/Note/Main Normal and Note Insert `<C-l>` | Directional pane focus |
| `toggleReaderSplitHorizontal` | Reader Normal `<Space>-` | Toggle horizontal split |
| `toggleReaderSplitVertical` | Reader Normal <code>&lt;Space&gt;&#124;</code> | Toggle vertical split |
| `toggleReaderSidebarOutline` | Reader Normal `<Space>e` | Toggle outline explorer |
| `focusReaderSidebar` | **unbound** | Reader outline focus capability where exposed |
| `toggleMarksExplorer` | Reader Normal `<Space>m` | Toggle marks explorer |
| `noteMoveLeft` | Note Normal `h` | Note caret motion |
| `noteMoveDown` | Note Normal `j` | Note caret motion |
| `noteMoveUp` | Note Normal `k` | Note caret motion |
| `noteMoveRight` | Note Normal `l` | Note caret motion |
| `noteMoveWordForward` | Note Normal `w` | Note caret motion |
| `noteMoveWordBackward` | Note Normal `b` | Note caret motion |
| `noteMoveLineStart` | Note Normal `0` | Note caret motion |
| `noteMoveLineEnd` | Note Normal `$` | Note caret motion |
| `noteMoveDocumentStart` | Note Normal `gg` | Note caret motion |
| `noteMoveDocumentEnd` | Note Normal `G` | Note caret motion |
| `noteDeleteChar` | Note Normal `x` | Note edit |
| `noteAppendAfter` | Note Normal `a` | Enter Insert after caret |
| `noteAppendLineEnd` | Note Normal `A` | Enter Insert at line end |
| `noteInsertLineStart` | Note Normal `I` | Enter Insert at line start |
| `noteOpenLineBelow` | Note Normal `o` | Open line / Insert |
| `noteOpenLineAbove` | Note Normal `O` | Open line / Insert |
| `noteUndo` | Note Normal `u` | Note undo bridge |
| `noteRedo` | Note Normal `<C-r>` | Note redo bridge |
| `notePutAfter` | Note Normal `p` | Put internal register after |
| `notePutBefore` | Note Normal `P` | Put internal register before |
| `noteDeleteLine` | Note Normal `dd` | Delete line |
| `noteYankLine` | Note Normal `yy` | Yank line |
| `noteDeleteLeft` | Note Normal `dh` | Delete by motion |
| `noteDeleteDown` | Note Normal `dj` | Delete by motion |
| `noteDeleteUp` | Note Normal `dk` | Delete by motion |
| `noteDeleteRight` | Note Normal `dl` | Delete by motion |
| `noteDeleteWordForward` | Note Normal `dw` | Delete by motion |
| `noteDeleteWordBackward` | Note Normal `db` | Delete by motion |
| `noteDeleteToLineStart` | Note Normal `d0` | Delete by motion |
| `noteDeleteToLineEnd` | Note Normal `d$` | Delete by motion |
| `noteDeleteInnerWord` | Note Normal `diw` | Delete inner word |
| `noteYankLeft` | Note Normal `yh` | Yank by motion |
| `noteYankDown` | Note Normal `yj` | Yank by motion |
| `noteYankUp` | Note Normal `yk` | Yank by motion |
| `noteYankRight` | Note Normal `yl` | Yank by motion |
| `noteYankWordForward` | Note Normal `yw` | Yank by motion |
| `noteYankWordBackward` | Note Normal `yb` | Yank by motion |
| `noteYankToLineStart` | Note Normal `y0` | Yank by motion |
| `noteYankToLineEnd` | Note Normal `y$` | Yank by motion |
| `noteYankInnerWord` | Note Normal `yiw` | Yank inner word |
| `noteChangeLeft` | Note Normal `ch` | Change by motion / Insert |
| `noteChangeDown` | Note Normal `cj` | Change by motion / Insert |
| `noteChangeUp` | Note Normal `ck` | Change by motion / Insert |
| `noteChangeRight` | Note Normal `cl` | Change by motion / Insert |
| `noteChangeWordForward` | Note Normal `cw` | Change by motion / Insert |
| `noteChangeWordBackward` | Note Normal `cb` | Change by motion / Insert |
| `noteChangeToLineStart` | Note Normal `c0` | Change by motion / Insert |
| `noteChangeToLineEnd` | Note Normal `c$` | Change by motion / Insert |
| `noteChangeInnerWord` | Note Normal `ciw` | Change inner word / Insert |

## Default binding index

The table is the complete default lookup: each canonical `mode:sequence` is paired with its exact `ActionId`. It contains all 239 entries from `DEFAULT_BINDINGS`, including the spread `NOTE_LOCAL_DEFAULT_BINDINGS`; saved user remaps can replace defaults.

| Canonical binding | ActionId |
| --- | --- |
| `reader-normal:j` | `scrollDown` |
| `reader-normal:k` | `scrollUp` |
| `reader-normal:H` | `previousTab` |
| `reader-normal:L` | `nextTab` |
| `reader-normal:zh` | `scrollLeft` |
| `reader-normal:zl` | `scrollRight` |
| `reader-normal:h` | `prevPage` |
| `reader-normal:l` | `nextPage` |
| `reader-normal:gg` | `firstPage` |
| `reader-normal:G` | `lastPage` |
| `reader-normal:<C-d>` | `halfPageDown` |
| `reader-normal:<C-u>` | `halfPageUp` |
| `reader-normal:<C-f>` | `fullPageDown` |
| `reader-normal:<C-b>` | `fullPageUp` |
| `reader-normal:+` | `zoomIn` |
| `reader-normal:-` | `zoomOut` |
| `reader-normal:zI` | `zoomIn` |
| `reader-normal:zO` | `zoomOut` |
| `reader-normal:=` | `zoomReset` |
| `reader-normal:z0` | `zoomReset` |
| `reader-normal:<C-o>` | `navigateBack` |
| `reader-normal:<C-i>` | `navigateForward` |
| `reader-normal:f` | `followLink` |
| `reader-normal:/` | `openSearch` |
| `reader-normal::` | `openCommandPalette` |
| `reader-normal:n` | `findNext` |
| `reader-normal:N` | `findPrevious` |
| `reader-normal:[` | `prevAnnotation` |
| `reader-normal:]` | `nextAnnotation` |
| `reader-normal:<Enter>` | `editAnnotation` |
| `reader-normal:<Return>` | `editAnnotation` |
| `reader-normal:dd` | `deleteAnnotation` |
| `reader-normal:y` | `yankAnnotation` |
| `reader-normal:Y` | `yankAnnotationComment` |
| `reader-normal:zy` | `recolorYellow` |
| `reader-normal:zr` | `recolorRed` |
| `reader-normal:zg` | `recolorGreen` |
| `reader-normal:zb` | `recolorBlue` |
| `reader-normal:zp` | `recolorPurple` |
| `reader-normal:zt` | `scrollTop` |
| `reader-normal:zz` | `scrollCenter` |
| `reader-normal:Zy` | `filterYellow` |
| `reader-normal:Zr` | `filterRed` |
| `reader-normal:Zg` | `filterGreen` |
| `reader-normal:Zb` | `filterBlue` |
| `reader-normal:Zp` | `filterPurple` |
| `reader-normal:Za` | `filterClear` |
| `reader-normal:v` | `enterVisual` |
| `reader-normal:i` | `enterInsert` |
| `reader-normal:<C-h>` | `focusReaderSplitLeft` |
| `reader-normal:<C-j>` | `focusReaderSplitDown` |
| `reader-normal:<C-k>` | `focusReaderSplitUp` |
| `reader-normal:<C-l>` | `focusReaderSplitRight` |
| `reader-normal:<Esc>` | `clearSearch` |
| `reader-normal:<Space>e` | `toggleReaderSidebarOutline` |
| `reader-normal:<Space>-` | `toggleReaderSplitHorizontal` |
| `reader-normal:<Space>\|` | `toggleReaderSplitVertical` |
| `reader-normal:<Space>ff` | `findAllItems` |
| `reader-normal:<Space>fc` | `findCollectionItems` |
| `reader-normal:<Space>,` | `switchTab` |
| `reader-normal:<Space>q` | `closeCurrentTab` |
| `reader-normal:<Space>ta` | `addTag` |
| `reader-normal:<Space>tr` | `removeTag` |
| `reader-normal:<Space>ca` | `addToCollection` |
| `reader-normal:<Space>cr` | `removeFromCollection` |
| `reader-normal:<Space>fn` | `findNotes` |
| `reader-normal:<Space>pp` | `managePlugins` |
| `reader-normal:<Space>ps` | `openNeoSettings` |
| `reader-normal:<Space>yy` | `mainYankCitekey` |
| `reader-normal:<Space>m` | `toggleMarksExplorer` |
| `reader-select:s` | `flashText` |
| `reader-select:a` | `openSelectionActions` |
| `reader-select:<Enter>` | `openSelectionActions` |
| `reader-select:<Return>` | `openSelectionActions` |
| `reader-select:j` | `extendDown` |
| `reader-select:k` | `extendUp` |
| `reader-select:h` | `extendLeft` |
| `reader-select:l` | `extendRight` |
| `reader-select:)` | `extendSentenceForward` |
| `reader-select:(` | `extendSentenceBackward` |
| `reader-select:}` | `extendParagraphForward` |
| `reader-select:{` | `extendParagraphBackward` |
| `reader-select:w` | `extendWordForward` |
| `reader-select:b` | `extendWordBackward` |
| `reader-select:0` | `extendLineStart` |
| `reader-select:$` | `extendLineEnd` |
| `reader-select:zy` | `highlightYellow` |
| `reader-select:zr` | `highlightRed` |
| `reader-select:zg` | `highlightGreen` |
| `reader-select:zb` | `highlightBlue` |
| `reader-select:zp` | `highlightPurple` |
| `reader-select:za` | `addNote` |
| `reader-select:i` | `addNote` |
| `reader-select:y` | `copySelection` |
| `reader-select:#` | `searchSelection` |
| `reader-select:o` | `swapVisualEnds` |
| `reader-select:v` | `exitMode` |
| `reader-select:<Esc>` | `exitMode` |
| `main-normal:<C-o>` | `navigateBack` |
| `main-normal:<C-i>` | `navigateForward` |
| `main-normal:<Space>ff` | `findAllItems` |
| `main-normal:<Space>fq` | `mainQuickSearch` |
| `main-normal:<Space>fa` | `mainAdvancedSearch` |
| `main-normal:/` | `openSearch` |
| `main-normal:n` | `findNext` |
| `main-normal:N` | `findPrevious` |
| `main-normal::` | `openCommandPalette` |
| `main-normal:<Space>fc` | `findCollectionItems` |
| `main-normal:<Space>,` | `switchTab` |
| `main-normal:<Space>ta` | `addTag` |
| `main-normal:<Space>tr` | `removeTag` |
| `main-normal:<Space>ca` | `addToCollection` |
| `main-normal:<Space>cr` | `removeFromCollection` |
| `main-normal:<Space>tf` | `toggleTagFilter` |
| `main-normal:<Space>tc` | `clearTagFilters` |
| `main-normal:<Space>q` | `closeCurrentTab` |
| `main-normal:<Space>fn` | `findNotes` |
| `main-normal:<Space>pp` | `managePlugins` |
| `main-normal:<Space>ps` | `openNeoSettings` |
| `main-normal:<Space>ss` | `manageSelection` |
| `main-normal:<Space>sc` | `mainClearSelection` |
| `main-normal:e` | `mainFocusTree` |
| `main-normal:<Space>yy` | `mainYankCitekey` |
| `main-normal:o` | `mainOpenPDF` |
| `main-normal:wh` | `mainFocusLeft` |
| `main-normal:wl` | `mainFocusRight` |
| `main-normal:ww` | `mainFocusItems` |
| `main-normal:<C-h>` | `focusReaderSplitLeft` |
| `main-normal:<C-j>` | `focusReaderSplitDown` |
| `main-normal:<C-k>` | `focusReaderSplitUp` |
| `main-normal:<C-l>` | `focusReaderSplitRight` |
| `main-normal:dd` | `mainTrashItems` |
| `main-normal:x` | `mainTrashItems` |
| `main-normal:u` | `mainRestoreTrashedItems` |
| `main-normal:h` | `mainTreeCollapse` |
| `main-normal:l` | `mainTreeExpand` |
| `main-normal:j` | `mainNavDown` |
| `main-normal:k` | `mainNavUp` |
| `main-normal:za` | `mainTreeToggle` |
| `main-normal:zo` | `mainTreeOpenOnly` |
| `main-normal:zc` | `mainTreeCloseOnly` |
| `main-normal:R` | `mainTreeExpandAll` |
| `main-normal:M` | `mainTreeCollapseAll` |
| `main-normal:<BS>` | `mainTreeParent` |
| `main-normal:gg` | `mainNavFirst` |
| `main-normal:G` | `mainNavLast` |
| `main-normal:H` | `previousTab` |
| `main-normal:L` | `nextTab` |
| `main-normal:<Enter>` | `mainActivate` |
| `main-normal:<Return>` | `mainActivate` |
| `main-normal:s` | `mainToggleSelection` |
| `main-normal:<Esc>` | `mainCancelTarget` |
| `main-normal:v` | `mainEnterSelect` |
| `main-select:s` | `mainSelectFinish` |
| `main-select:j` | `mainSelectDown` |
| `main-select:k` | `mainSelectUp` |
| `main-select:gg` | `mainSelectFirst` |
| `main-select:G` | `mainSelectLast` |
| `main-select:o` | `mainSelectSwapEnds` |
| `main-select:v` | `mainSelectCancel` |
| `main-select:<Esc>` | `mainSelectCancel` |
| `note-normal:h` | `noteMoveLeft` |
| `note-normal:j` | `noteMoveDown` |
| `note-normal:k` | `noteMoveUp` |
| `note-normal:l` | `noteMoveRight` |
| `note-normal:w` | `noteMoveWordForward` |
| `note-normal:b` | `noteMoveWordBackward` |
| `note-normal:0` | `noteMoveLineStart` |
| `note-normal:$` | `noteMoveLineEnd` |
| `note-normal:gg` | `noteMoveDocumentStart` |
| `note-normal:G` | `noteMoveDocumentEnd` |
| `note-normal:x` | `noteDeleteChar` |
| `note-normal:a` | `noteAppendAfter` |
| `note-normal:A` | `noteAppendLineEnd` |
| `note-normal:I` | `noteInsertLineStart` |
| `note-normal:o` | `noteOpenLineBelow` |
| `note-normal:O` | `noteOpenLineAbove` |
| `note-normal:u` | `noteUndo` |
| `note-normal:<C-r>` | `noteRedo` |
| `note-normal:p` | `notePutAfter` |
| `note-normal:P` | `notePutBefore` |
| `note-normal:dd` | `noteDeleteLine` |
| `note-normal:yy` | `noteYankLine` |
| `note-normal:dh` | `noteDeleteLeft` |
| `note-normal:dj` | `noteDeleteDown` |
| `note-normal:dk` | `noteDeleteUp` |
| `note-normal:dl` | `noteDeleteRight` |
| `note-normal:dw` | `noteDeleteWordForward` |
| `note-normal:db` | `noteDeleteWordBackward` |
| `note-normal:d0` | `noteDeleteToLineStart` |
| `note-normal:d$` | `noteDeleteToLineEnd` |
| `note-normal:diw` | `noteDeleteInnerWord` |
| `note-normal:yh` | `noteYankLeft` |
| `note-normal:yj` | `noteYankDown` |
| `note-normal:yk` | `noteYankUp` |
| `note-normal:yl` | `noteYankRight` |
| `note-normal:yw` | `noteYankWordForward` |
| `note-normal:yb` | `noteYankWordBackward` |
| `note-normal:y0` | `noteYankToLineStart` |
| `note-normal:y$` | `noteYankToLineEnd` |
| `note-normal:yiw` | `noteYankInnerWord` |
| `note-normal:ch` | `noteChangeLeft` |
| `note-normal:cj` | `noteChangeDown` |
| `note-normal:ck` | `noteChangeUp` |
| `note-normal:cl` | `noteChangeRight` |
| `note-normal:cw` | `noteChangeWordForward` |
| `note-normal:cb` | `noteChangeWordBackward` |
| `note-normal:c0` | `noteChangeToLineStart` |
| `note-normal:c$` | `noteChangeToLineEnd` |
| `note-normal:ciw` | `noteChangeInnerWord` |
| `note-normal:<C-o>` | `navigateBack` |
| `note-normal:<C-i>` | `navigateForward` |
| `note-normal:i` | `enterInsert` |
| `note-normal:<Esc>` | `exitMode` |
| `note-normal::` | `openCommandPalette` |
| `note-normal:<Space>ff` | `findAllItems` |
| `note-normal:<Space>fc` | `findCollectionItems` |
| `note-normal:<Space>,` | `switchTab` |
| `note-normal:<Space>ta` | `addTag` |
| `note-normal:<Space>tr` | `removeTag` |
| `note-normal:<Space>q` | `closeCurrentTab` |
| `note-normal:<Space>fn` | `findNotes` |
| `note-normal:<Space>pp` | `managePlugins` |
| `note-normal:<Space>ps` | `openNeoSettings` |
| `note-normal:<Space>e` | `mainFocusTree` |
| `note-normal:<Space>yy` | `mainYankCitekey` |
| `note-normal:<Space>o` | `mainOpenPDF` |
| `note-normal:H` | `previousTab` |
| `note-normal:L` | `nextTab` |
| `note-normal:<C-h>` | `focusReaderSplitLeft` |
| `note-normal:<C-j>` | `focusReaderSplitDown` |
| `note-normal:<C-k>` | `focusReaderSplitUp` |
| `note-normal:<C-l>` | `focusReaderSplitRight` |
| `note-insert:<Esc>` | `exitMode` |
| `note-insert:<C-h>` | `focusReaderSplitLeft` |
| `note-insert:<C-j>` | `focusReaderSplitDown` |
| `note-insert:<C-k>` | `focusReaderSplitUp` |
| `note-insert:<C-l>` | `focusReaderSplitRight` |


## Neovim comparison and examples

Neo borrows familiar notation, counts, key sequences, Visual selection, and a bounded stack-style jumplist model. It is not Neovim and does not implement an Ex command line, buffers/windows/tabs as Neovim entities, arbitrary registers, full operator-pending grammar, or a universal motion/count algebra. Zotero owns documents, item scopes, tabs, text inputs and native PDF behavior. Neo's `:` is a query-only action palette, not `:` Ex; `H/L` mean adjacent Zotero tabs; `gg/G` are surface-specific; Note registers are internal to the Note editor. Counts are honored only by the actions that actually consume them. No default `J/K` tab grammar is provided.

Examples:

- Reader `3j`: three configured scroll steps; Reader `3l`: three adjacent page turns; neither is a jumplist boundary.
- Reader `3gg` or `3G`: target PDF page three, a discrete jump; bare `gg` / `G`: first / last page.
- Main `3j`: Cursor motion, not three Reader scrolls; Main `gg/G`: first/last row of its supported list.
- Note `3j`: counted caret motion where Note mode is active; `3x`: repeated character deletion where its command consumes count. Do not assume `3dw` equals a general Vim operator count form.
- Reader `2<C-o>` traverses two shared history entries; `2:` merely opens the palette and does not repeat the chosen action.
- Reader `L` followed by mark jump, then `<C-o>`: Back visits the mark's departure and then the prior tab destination, subject to successful snapshots/restoration.

When a key does not act as expected, check current surface and mode, focus owner (especially native text/IME or an open Neo panel), mode capability and feature gate, resolved custom binding, pending sequence/timeout, and whether the operation has a resolvable target. A missing/default-unbound command may still appear in the appropriate palette; a command outside the active mode's capability cannot be made available merely by assigning a key.
