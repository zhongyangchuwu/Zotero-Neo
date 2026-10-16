# Command Reference

Look up an action, its default key, the place where it works, and its count or target behavior. For complete workflows, use the [User guide](USER_GUIDE.md).

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

Command tables give each canonical `ActionId`, its default binding(s), and the exact `BindingContext` where it is executable. The same sequence can mean different things in different contexts. Preferences may add alternatives or unbind defaults; a valid ActionId is not automatically supported everywhere.

“History” means Neo's shared Back/Forward jumplist. It records completed jumps to restorable locations; ordinary scrolling, selection changes, cancelled actions, and unchanged destinations do not add entries. See [Navigation and the shared jumplist](#navigation-and-the-shared-jumplist).

## Modes, focus, and capabilities

Main, Reader, and Note have their own command contexts. Sidebars, chooser fields, and plugin lists use the local contexts shown below.

| Owner | BindingContext | Capability |
| --- | --- | --- |
| Reader | `reader-normal` | Reading, page/view and category navigation, annotations, tabs, shared actions, and Normal command palette. |
| Reader | `reader-select` | Active PDF text-range refinement and selection actions. |
| Main | `main-normal` | Zotero library tree/items, search, Selection workset, commands and palette. |
| Main | `main-select` | Temporary Visual range in the visible Main item rows. |
| Note | `note-normal` | Note motions/operators and supported shared actions. |
| Note | `note-insert` | Native note-editor text input plus the explicit directional pane-focus bindings. |
| Reader Outline | `reader-outline` | Four panel-focus actions and global heading traversal; local next/previous, parent/child and cancel; `uiConfirm` is supported but default-unbound. Caption controls reuse this context. |
| Reader Bookmarks | `reader-marks` | Four panel-focus actions and global heading traversal; local next/previous/first/last/confirm/cancel/delete/clear. |
| Reader Annotations | `reader-annotations` | Four panel-focus actions and global heading traversal; local next/previous/cancel. |
| Reader Thumbnails | `reader-thumbnails` | Four panel-focus actions and global heading traversal; local next/previous/cancel. |
| Picker query field | `picker-input` | Local next/previous/confirm/cancel, preview movement, and next/previous pane actions. Query text and IME remain native. |
| Picker results | `picker-list` | Picker-input actions plus local query focus. |
| Plugin Manager filter | `plugins-input` | Only `uiFocusList`; its default `Escape` returns focus to the results. |
| Plugin Manager results | `plugins-list` | Local next/previous/first/last/page movement, search, cancel, and Plugin Manager operations. |

Reader Select works on PDF text; Main Select works on visible item rows. Text fields and IME composition keep their normal editing keys. Settings lists the actions available in each context.

Reader `v` starts or adopts a text selection. Reader `i` opens an annotation comment when one is selected and comment editing is enabled. When that setting is off, `i` gives input back to Zotero until Escape. In Main, `v` starts a temporary item range. In Note, `i` enters Insert and Escape returns to Normal when Vim-style note editing is enabled.

## Key notation and input grammar

- Printable keys are literal and case-sensitive: `g` differs from `G`; `gg` is two `g` presses. `<Space>` is the Space key, while `:` is a literal colon key. Symbolic keys use angle-bracket notation such as `<C-o>`, `<Enter>`, `<Return>`, `<Esc>`, and `<BS>`. `<Enter>` and `<Return>` are aliases where both appear in the table.
- Ctrl and Meta are normalized as Ctrl; `Ctrl`, `Alt`, and `Shift` modifiers combine with a key. For example `<C-d>` is Ctrl+d. Printable shifted symbols use their produced character (for example `+`); named keys can retain explicit Shift.
- A decimal prefix supplies a count to actions that support it. Each action defines whether the count repeats a motion or selects a numbered destination. `0` starts part of a count only after another count digit; otherwise it is a command, such as line start in Reader Select.
- A binding that also begins a longer sequence waits briefly for the next key. A matching continuation chooses the longer binding; a timeout runs the shorter one. An unmatched key starts a new sequence.
- Escape cancels a pending sequence or exits the current temporary interaction. Backspace removes a pending sequence key; inside a query or editor it edits the text instead.
- Text fields and active IME composition receive their normal typing, editing, Enter, and Escape keys.
- Unbound keys stay available to Zotero and the browser. Reserved native shortcuts appear as read-only entries in Settings.

Prefix Guide shows the continuations available after a key sequence. Reader and Main use prefixes such as `g` for navigation, `z` for view controls, and `<Space>` for grouped commands. Note adds `d`, `y`, and `c` for delete, yank, and change. The displayed guide follows your active context and saved bindings.

## Command Palette, remapping, and unbound actions

In Reader Normal, Main Normal, and Note Normal, `:` opens the Command Palette. Type an action name, choose a result with arrows or `Ctrl+j` / `Ctrl+k`, and press Enter to run it once. Escape closes the palette. Results include available actions that have no assigned shortcut. When the result list has focus, `j` / `k` also move the selection.

The Settings shortcut browser is action- and context-centric. Filter by action group or `BindingContext`; search matches localized labels, canonical ActionIds, current keys, default keys, groups, and contexts. Groups are Navigation, Reader, Annotations, Selection, Notes, Library, Interface, Plugins, and Commands. Results identify **Default**, **Custom**, or **Unbound**, including supported actions with no default.

Choose an action and context to add, record, unbind, or reset its bindings; per-action changes preserve unrelated rows. **Add** and **Record** are deliberate controls. While recording, `Enter` and `Escape` are key tokens, not finish/cancel commands; use **Done** or **Cancel**. Edits are staged until **Apply**. Duplicate bindings, unsupported action/context pairs, and reserved native keys block Apply. Strict-prefix pairs are allowed with a warning. Existing incompatible orphan rows are **Delete**-only, not inert or recordable.

Native shortcut records are independent, read-only, context-labeled, and shown only when the group filter is **All groups**. Reservations apply at every token in a sequence. Native query editing includes `<C-Insert>` and `<S-Insert>`; Outline `Enter` / `Return`, including modified Enter, is exclusively host-owned. `uiConfirm` is supported in Outline but has no default and can be remapped to another non-reserved key. Native text entry and IME remain host-authoritative. The result/native regions are bounded and **Apply** stays reachable before them; leaving the recorder restores the connected edited-action summary or, if filtered away, focus to Apply or search.

1. **Default:** an action has a shipped shortcut in that context.
2. **Unbound:** an available action has no assigned key; find it in the palette or add a binding in Settings.
3. **Unavailable in this context:** choose the Library, Reader, Note, or local control where the action is offered.
4. **Native text or editor control:** use the control's normal editing keys. Reserved shortcuts are shown read-only in Settings.

## Navigation and the shared jumplist

### Commands and count behavior

`navigateBack` and `navigateForward` are available in Main Normal, Reader Normal, and Note Normal; defaults are `<C-o>` and `<C-i>` respectively. On these keyboard shortcuts a positive count traverses that many locations (for example `2<C-o>`). Palette invocation is uncounted. At either end, traversal is a safe no-op. Insert mode, native editable fields, and Neo-owned modal inputs keep their own input and do not invoke these commands.

Each Main window keeps up to 100 locations. Back and Forward stop at the ends. Taking a new jump after going Back replaces the old Forward branch. Consecutive equivalent destinations are combined, and navigating history leaves Main Selection unchanged.

### Recording and exclusions

History records completed location changes, not every key press. The following table shows which actions can add a destination. Reader jumps need a final position reported by Zotero; a search or annotation action can finish without adding an entry if that position is unavailable.

| Surface/action | History behavior |
| --- | --- |
| Main item-row `gg`/`G` | Record only when the item Cursor actually changes to a qualifying row. Main `j`/`k` and collection-tree movement do not record. `G` with a positive count selects that one-based row; bare `G` selects last, while `gg` selects first. |
| Committed Main local-find `n`/`N` | Record a qualifying Cursor destination; a miss or unchanged Cursor does not. Editing/cancelling the prompt does not record. |
| Explicit Main Open / item activation | Queued operation records only a successful/current destination. Enter on a collection scope changes view/tree state and is not by itself a location entry. Opening an item does not batch-open Neo Selection. |
| Confirmed all-library/current-collection item chooser or Note chooser | Successful destination records. A Note result's library selection and Note opening are one queued request, not two entries. Opening chooser, typing, highlighting, cancelling, and failed resolution do not record. |
| Successful `showInLibrary` / Selection Panel Reveal | Queued Main Library reveal records only after success/current validation. Selection Panel closes only after successful/current reveal. |
| `H`/`L` previous/next tab or confirmed chooser (`switchTab`) | Record a change to another open tab, including Library. Each invocation cycles once; selecting the current tab or clicking a native tab directly does not add an entry. |
| Reader PDF page destinations, including `gg`, `G`, and counted boundary jumps | Can record a completed jump when Zotero provides a final PDF position. A positive count chooses a one-based page; bare `gg` goes to the first-page start and bare `G` to the document bottom. Scrolling and adjacent `h`/`l` page turns do not add entries. |
| Reader marks, Outline destinations, annotation navigation, internal/citation links, and search results | A completed mark jump records its destination. Other Reader actions can record when Zotero supplies a usable final position in the active document view. |
| External PDF link | Opens through Zotero's normal handler; not a Neo Reader history location. |
| Scroll/zoom/split layout, selection/caret movement, filters, manual collection edits, and other non-location state changes | Excluded. |
| Failure, unchanged destination, cancelled chooser, or an unavailable target | No new history location. |

Back and Forward restore the available tab, Library view, Cursor, or PDF position. If part of a destination is unavailable, the history position stays unchanged, although a tab or filter already restored may remain changed. Native tab clicks do not add entries to Neo's history.

### Snapshots and restoration

- **Main location:** restores the available collection/library view, Quick Search, tag filters, Advanced Search, Cursor, and focus. Your persistent Selection stays unchanged.
- **Reader PDF:** restores the attachment and available position in its primary or secondary view. Zoom and split layout stay as they are. A readable attachment can reopen if its Reader tab was closed.
- **Other Reader tabs:** return to the open tab and its retained Zotero position.
- **Other tabs:** return to the existing tab. Closed ordinary tabs cannot be reopened through attachment history.
- **Note:** returns to a standalone Note tab, or restores the Library view containing a context-pane note. It does not move the Note caret.
- **Unavailable destination:** deleted or unreadable attachments, missing required views, and failed restores leave the history position unchanged. Any tab or filter already restored may remain changed.

Before leaving a location, Neo updates its return position, so scrolling since the last jump can become the place Back returns to. Closing a Reader or Note tab keeps the shared history; closing its Main window clears that window's list.

Wait for a newly opened PDF to finish loading before using Reader commands.
### Mixed navigation examples

- In one Reader PDF where the host page-navigation API is supported, `1gg`, `5gg`, `G` are separate completed destinations; `<C-o>` / `<C-i>` walk them in order. `4gg` means page four, whereas bare `gg` means first-page start; uncounted `G` reaches the document bottom without changing zoom. A positive count with `G`/`gg` targets that one-based page start. Without that API, `gg/G` scroll to document boundaries instead of creating page-jump history. Invalid targets and no-ops do not create a successful destination.
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
| `firstPage` / `lastPage` | `gg` / `G` | Go to the first-page start or document bottom without changing zoom. A positive count (`ngg` or `nG`) targets that one-based page start when page navigation is available. Otherwise these commands scroll to the document boundary. A completed page jump can add history when Zotero provides its final position. |
| `zoomIn` / `zoomOut` | `+`, `zI` / `-`, `zO` | One Reader zoom step; count repeats. Not history. |
| `zoomReset` | `=`, `z0` | Reset/Fit page width once; count does not repeat. |
| `scrollTop` / `scrollCenter` / `scrollBottom` | `zt` / `zz` / unbound | Place current page at top/center/bottom of viewport; view position only, no history. `scrollBottom` has no default sequence. |
| `openSearch` / `findNext` / `findPrevious` / `clearSearch` | `/`, `n`, `N`, `<Esc>` | Open PDF search; choose the next or previous result once regardless of count; close or clear search. A result can add history when its final position is available. |
| `followLink` | `f` | Label the visible PDF links. Type a label to follow it, Backspace to edit the label, or Escape to cancel. Internal destinations can add history; external links open through Zotero. Count is ignored. |
| `prevHeading` / `nextHeading` | `[s` / `]s` | Move through the full Outline's headings in document order, wrapping at the ends. Works from the PDF and all Reader sidebars regardless of which branches are collapsed. |
| `prevFigure` / `nextFigure` | `[f` / `]f` | Move between figures identified by the PDF's structure or recognized captions. Land on an associated image when available, otherwise its caption. First use may require local document analysis. |
| `prevTable` / `nextTable` | `[t` / `]t` | Move between identified tables and their captions. First use may require local document analysis. |
| `prevAnnotation` / `nextAnnotation` | `[a` / `]a` | Select the previous or next annotation, wrapping at the ends. Count is ignored; a destination can add history when its final position is available. |
| `prevBookmark` / `nextBookmark` | `[m` / `]m` | Jump between Reader marks in document order, wrapping at the ends. |
| `editAnnotation` | `<Enter>`, `<Return>` | Open or focus the selected annotation comment. The editing indicator reads COMMENT. |
| `deleteAnnotation` | `dd` | Delete selected annotation after confirmation; cancellation leaves it unchanged. Not a navigation entry. |
| `yankAnnotation` / `yankAnnotationComment` | `y` / `Y` | Copy selected annotation text / comment. No target means no copy. |
| `recolorYellow/Red/Green/Blue/Purple` | `zy` / `zr` / `zg` / `zb` / `zp` | Recolor selected annotation. No selected annotation means no effect. |
| `filterYellow/Red/Green/Blue/Purple` / `filterClear` | `Zy` / `Zr` / `Zg` / `Zb` / `Zp` / `Za` | Filter/clear annotation sidebar color filter; not history. |
| `enterVisual` / `enterInsert` / `exitMode` | `v` / `i` / `<Esc>` in owned contexts | Enter Select, open eligible comment input, or leave the owned interaction. Settings gate Select and comment entry; disabled comment/Insert retains bare `i` native-pass-through compatibility. `exitMode` is unbound in Reader Normal. |
| `focusReaderSplitLeft/Down/Up/Right` | `<C-h>` / `<C-j>` / `<C-k>` / `<C-l>` | Focus nearest supported direction/split/context pane; no wrap. Missing target leaves focus unchanged. |
| `focusReaderOutline` / `focusReaderMarks` / `focusReaderAnnotations` / `focusReaderThumbnails` | `<Space>ro` / `<Space>rm` / `<Space>ra` / `<Space>rt` | Open or focus Outline, Bookmarks, Annotations, or Thumbnails. Repeating a command leaves that surface focused rather than toggling it closed; the same focus actions are available from every Reader local panel context. |
| `toggleReaderSplitHorizontal` / `toggleReaderSplitVertical` | `<Space>-` / <code>&lt;Space&gt;&#124;</code> | Toggle horizontal or vertical PDF split layout. Back/Forward does not change that layout. |
| `findAllItems` / `findCollectionItems` / `findNotes` | `<Space>ff` / `<Space>fc` / `<Space>fn` | Search and choose an item or note. Confirm to open the result, or Escape to cancel. Browsing results does not add history until you confirm a destination. |
| `switchTab` / `previousTab` / `nextTab` / `closeCurrentTab` | `<Space>,` / `H` / `L` / `<Space>q` | Choose open tab, cycle tabs, or close current tab. Successful chooser/H/L changes record; H/L counts are ignored and each cycles once. Closing alone is not Back and does not delete older entries. |
| `navigateBack` / `navigateForward` | `<C-o>` / `<C-i>` | Shared history traversal; positive counts accepted on shortcut; palette execution is once. |
| `openCommandPalette` / `openNeoSettings` / `managePlugins` | `:` / `<Space>ps` / `<Space>pp` | Open query-only palette, Settings, or persistent Plugin Manager panel. Modal/surface transition, not history. |
| `addTag` / `removeTag` / `addToCollection` / `removeFromCollection` | `<Space>ta` / `<Space>tr` / `<Space>ca` / `<Space>cr` | Resolve active Reader bibliographic item and run chooser operation. Explicit user data operation, not a jump; failure/revalidation cancels whole action. |
| `mainYankCitekey` | `<Space>yy` | Copy active Reader item's citekey; does not use Main Selection. |
| `showInLibrary` | **Unbound** | Show active Reader item in Main Library; supported from Reader Normal palette. A successful changed reveal is eligible under the central settled-change rule. |
| `toggleReaderSidebarOutline` | **Unbound** | Explicit toggle of Zotero's native Reader Outline sidebar; it has no shipped shortcut. |
| `toggleMarksExplorer` | **Unbound** | Explicit toggle of the Bookmarks view; it has no shipped shortcut. |

Reader Select actions are listed in [Reader Select](#reader-select-and-annotation-actions). Directional focus moves to an existing pane, which can include the Note pane.
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

Type a visible phrase into Flash and choose its completed hint, or press Enter for the nearest match. Narrow a broad query to reveal its labels. Escape cancels Flash while keeping the previous selection. Selection Actions offers **Capture to note**, **Underline**, and **Add note**; **Translate** appears when Translate for Zotero is installed. See [Select text and annotate](SELECTION_GUIDE.md#try-it).

Annotation comments accept ordinary text and IME input, save after two seconds of inactivity, and save and close on Escape. Enter inserts a new line. See [Annotation comment editor](#annotation-comment-editor). Reader Select motions and actions run once regardless of count.

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

Enable **Vim-style note editing** to use Normal motions and editing commands in notes. Press `i` for Insert and Escape for Normal. Insert accepts ordinary text and IME input. With the setting off, type directly in Zotero's editor.

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

Item, note, tab, tag, and collection choosers share query and result controls. Up/Down, `Ctrl+j/n`, and `Ctrl+k/p` move results; `Ctrl+d/u` scrolls the preview; Enter or Shift+Enter confirms; Escape cancels. In the result list, `j/k` move and `/` focuses the query. Query text and IME use normal editing keys. The `picker-input` and `picker-list` contexts can be customized separately. `uiNextPane` and `uiPreviousPane` are supported in the query context but have no default. Mouse row selection follows the Picker mouse preference; hovering does not change the selection.

Notes (`fn`) start with the current paper's notes. Choose **Browse library** for other existing notes in that library, or **Current item** to narrow the list again. Tab/Shift+Tab reaches the source button, and Enter/Space activates it. Preview shows the note's parent and body. Before confirmation, Escape cancels without a write. After confirming a capture, wait for the save result; closing the chooser does not undo that save. If the destination has moved or become unavailable, choose it again.

Tag behavior is operation-specific: Add Tag may expose an explicit create candidate; Remove Tag lists tags assigned to at least one target. Main `tf` toggles one Zotero-native tag filter; `tc` clears filters without a chooser. With a configured separator, a tag query is refined segment by segment: a non-terminal virtual namespace is not a tag mutation, and Enter on that candidate replaces the query with the namespace path while keeping the chooser open. A terminal tag is the candidate for the invoking action. Paths are a presentation over flat Zotero strings and never rewrite tag data. Collection actions require same-library targets, re-resolve before confirmation, and skip already-present/absent membership. A changed target/library or cancelled chooser refuses the whole operation.

### Flash and link hints

Reader Select `s`, or `v` when starting a selection, opens Flash. Type literal visible text, choose its hint, or press Enter for the nearest match. Escape cancels; Backspace edits the query or label. A miss leaves the existing selection unchanged.

Reader Normal `f` shows labels for visible PDF links. Type a case-insensitive label to follow a link, Backspace to edit it, or Escape to cancel. Internal and citation links stay in the PDF; external links use Zotero's normal handler. Internal destinations can add history when Zotero reports their final position.

### Native Reader Outline and Bookmarks

Reader Normal `<Space>ro`, `<Space>rm`, `<Space>ra`, and `<Space>rt` directly open or focus Outline, Bookmarks, Annotations, and Thumbnails. Repeating one leaves its target focused; it does not toggle the sidebar closed. The same four panel-focus actions are available in each Reader local panel context.

In `reader-outline`, Neo defaults `j/k` to immediate native row movement and `h/l` to parent/child; Escape is the local cancel default. Zotero's arrows, Tab/Shift+Tab, and Enter/Return remain native, including modified Enter. `uiConfirm` is supported in this context but unbound by default and can use another non-reserved key. In `reader-marks`, defaults are `j/k`, `gg/G`, Enter, Escape, `d`, and `x`; in `reader-annotations` and `reader-thumbnails`, defaults are `j/k` and Escape. These local Neo controls are configurable in their own contexts.

Neo decorates native Outline rows without changing their titles or authored numbering. Compact theme-aware icon/ordinal badges and numeric direct-child counts have localized accessible/hover labels. Full-tree numbering includes meaningful unnumbered roots such as Introduction as `1`, preserves `parent.child` ordinals across filtering/collapse, and excludes explicit Figure/Table entries from heading counters. Native Annotations and Thumbnails remain independent sidebar surfaces.

`[s` / `]s` traverse document headings from the PDF and all four sidebars. The Figure and Table groups use the Outline controls: `j/k` moves between visible entries and `h/l` closes or opens groups. Opening a group or requesting structural navigation can start local PDF analysis; later requests reuse the result. Figures use an associated image position when available, otherwise a caption; tables use their caption positions. A document without usable structure can be read using page navigation and PDF search.

### Marks and Bookmarks group

Press `m` then a lowercase letter or digit to set a Reader mark; press backtick then that label to return. `dm` then a label deletes one mark and `dM` clears all. `[m` / `]m` visits marks in document order with wrap. `<Space>rm` opens or focuses Bookmarks. A jump restores the marked position and its selected annotation when available, and adds one history destination.

The Bookmark list uses configurable `reader-marks` actions. Defaults are `j/k` to move, `gg/G` to reach first/last, Enter to jump, `d` to delete the selected mark, and `x` to clear marks. Assigned mark labels jump directly except `j`, `k`, `g`, `d`, and `x`, which are group controls; Home/End are not default list commands, and uppercase letters are not mark labels. These remain Reader marks, not PDF annotations; persistence follows the Marks preference.

### Annotation comment editor

Eligible Reader Normal `i` / Enter opens the selected annotation's floating comment
editor; Select `i` opens it for the newly created annotation. While that feature owns
input, ordinary typing and Enter newline remain native, non-composing Escape saves
the current draft and closes, and edits autosave after two seconds. These are feature
controls, not inherited Reader Normal actions. There is no cancel/rollback command:
Escape saves changes since the last autosave rather than discarding them. IME-owned
Escape remains native.

**Settings → Reader → Annotation comment editing** controls `i` / Enter entry to an existing annotation comment and is on by default. When off, `i` gives input to Zotero until Escape. Zotero's own comment fields remain available, and **Add note** from Reader Select can still create an annotation and open its comment editor.

### Selection Actions, Plugin Manager, Settings, and Selection Panel

Selection Actions (`a` / Enter in Reader Select) offers **Capture to note**, **Underline**, and **Add note**. **Translate** appears when Translate for Zotero is installed. Capture appends a quote to a chosen existing note; Add note creates a PDF annotation comment.

Use `j/k` or arrows to move, `Home` / `g` for the first action, `End` / `G` for the last, and `1–9` or Enter to run one. A displayed result uses `y` to copy and Enter/Escape to close. Escape closes the palette while keeping the PDF selection. IME composition keeps its typing keys. Input in a different PDF pane hands control to that pane and closes the palette.

Plugin Manager (`<Space>pp`) is persistent, unlike a chooser. Its Neo list actions are configurable in `plugins-list`; defaults are `j` / Down and `k` / Up for movement, `gg` / Home and `G` / End for first/last, `Ctrl+d/u` for page movement, `/` for filtering, and `Escape` / `q` to close. `r` reloads; `e/d` enable/disable only if AddonManager grants that operation; `p` opens registered plugin settings; `o` opens the homepage; `R` opens a mapped GitHub README; `L` opens repository commit history. `plugins-input` supports only `uiFocusList`, defaulted to Escape to return focus to results; ordinary filter text and IME remain native. Neo cannot disable itself through its own panel. Zotero AddonManager remains authoritative.

Settings (`<Space>ps`) is Neo-owned, with binding edits staged until Apply. Main Selection Panel is opened through `<Space>ss`; `j/k` move through entries, `Home`/`gg` go first, `End`/`G` go last, `Enter` reveals the selected item, `x` removes it from persistent Neo Selection, `c` clears that Selection, `r` refreshes, and Escape/`q` closes. Its list distinguishes visible, hidden, and unavailable items; an unavailable item cannot be revealed. Reveal is queued and the panel closes only after successful/current Library selection; failed reveal leaves it open. Selection Panel controls inspect/reveal/remove workset membership; they are not batch actions on Zotero items.

## Action ID index

Look up each action's ID, default keys, and available contexts. **Unbound** means the action has no default shortcut; assign one in Settings or find the action in the relevant Command Palette.

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
| `prevAnnotation` | Reader Normal `[a` | Reader annotation navigation |
| `nextAnnotation` | Reader Normal `]a` | Reader annotation navigation |
| `prevHeading` | Reader Normal and four sidebar contexts `[s` | Previous Section/Subsection in the whole native Outline; active PDF position, document order and wrap |
| `nextHeading` | Reader Normal and four sidebar contexts `]s` | Next Section/Subsection in the whole native Outline; active PDF position, document order and wrap |
| `prevFigure` | Reader Normal `[f` | Previous identified figure or figure caption; first use may analyse the PDF locally |
| `nextFigure` | Reader Normal `]f` | Next identified figure or figure caption; first use may analyse the PDF locally |
| `prevTable` | Reader Normal `[t` | Previous identified table caption; first use may analyse the PDF locally |
| `nextTable` | Reader Normal `]t` | Next identified table caption; first use may analyse the PDF locally |
| `prevBookmark` | Reader Normal `[m` | Previous Reader mark in document order; wraps at the start |
| `nextBookmark` | Reader Normal `]m` | Next Reader mark in document order; wraps at the end |
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
| `toggleReaderSidebarOutline` | **Unbound** | Explicit Reader Outline sidebar toggle; no shipped shortcut. |
| `focusReaderOutline` | Reader Normal / Outline / Marks / Annotations / Thumbnails `<Space>ro` | Open or focus Outline; repeating leaves it focused. |
| `toggleMarksExplorer` | **Unbound** | Explicit Bookmarks-view toggle; no shipped shortcut. |
| `focusReaderMarks` | Reader Normal / Outline / Marks / Annotations / Thumbnails `<Space>rm` | Open or focus Bookmarks; repeating leaves it focused. |
| `focusReaderAnnotations` | Reader Normal / Outline / Marks / Annotations / Thumbnails `<Space>ra` | Open or focus Annotations; repeating leaves it focused. |
| `focusReaderThumbnails` | Reader Normal / Outline / Marks / Annotations / Thumbnails `<Space>rt` | Open or focus Thumbnails; repeating leaves it focused. |
| `uiNext` | Reader Outline / Marks / Annotations / Thumbnails `j`; Picker Input `<C-j>`, `<C-n>`, `<Down>`; Picker List those plus `j`; Plugins List `j`, `<Down>` | Configurable next-item action in the listed contexts only. |
| `uiPrevious` | Reader Outline / Marks / Annotations / Thumbnails `k`; Picker Input `<C-k>`, `<C-p>`, `<Up>`; Picker List those plus `k`; Plugins List `k`, `<Up>` | Configurable previous-item action in the listed contexts only. |
| `uiFirst` | Reader Marks `gg`; Plugins List `gg`, `<Home>` | Configurable first-item action in the listed contexts only. |
| `uiLast` | Reader Marks `G`; Plugins List `G`, `<End>` | Configurable last-item action in the listed contexts only. |
| `uiParent` | Reader Outline `h` | Move to the parent in `reader-outline`. |
| `uiChild` | Reader Outline `l` | Move to the child in `reader-outline`. |
| `uiConfirm` | Reader Marks `<Enter>`; Picker Input/List `<Enter>`, `<S-Enter>`; Reader Outline **unbound** | Confirm in supported local contexts; Outline has no default because Enter/Return is host-owned. |
| `uiCancel` | Reader Outline/Marks/Annotations/Thumbnails `<Esc>`; Picker Input/List `<Esc>`; Plugins List `<Esc>`, `q` | Cancel or return in these local contexts; not supported in `plugins-input`. |
| `uiDelete` | Reader Marks `d` | Delete the selected bookmark in `reader-marks`. |
| `uiClear` | Reader Marks `x` | Clear bookmarks in `reader-marks`. |
| `uiSearch` | Picker List `/`; Plugins List `/` | Focus the query/filter from the results context. |
| `uiFocusList` | Plugins Input `<Esc>` | Return from the filter field to results; the only `plugins-input` ActionId. |
| `uiPreviewDown` | Picker Input/List `<C-d>` | Scroll the chooser preview down. |
| `uiPreviewUp` | Picker Input/List `<C-u>` | Scroll the chooser preview up. |
| `uiNextPane` | **Unbound** | Supported in `picker-input`; no default shortcut. |
| `uiPreviousPane` | **Unbound** | Supported in `picker-input`; no default shortcut. |
| `uiPageDown` | Plugins List `<C-d>` | Page down in the Plugin Manager results. |
| `uiPageUp` | Plugins List `<C-u>` | Page up in the Plugin Manager results. |
| `pluginsRefresh` | Plugins List `r` | Refresh Plugin Manager state. |
| `pluginsEnable` | Plugins List `e` | Enable when AddonManager permits. |
| `pluginsDisable` | Plugins List `d` | Disable when AddonManager permits. |
| `pluginsPreferences` | Plugins List `p` | Open registered plugin preferences. |
| `pluginsHomepage` | Plugins List `o` | Open the plugin homepage. |
| `pluginsReadme` | Plugins List `R` | Open the mapped GitHub README. |
| `pluginsGitLog` | Plugins List `L` | Open the mapped GitHub commit history. |
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

Each `BindingContext:sequence` below maps a default key sequence to its action ID. Saved custom bindings replace these defaults for their chosen context.

| Canonical `BindingContext:sequence` | ActionId |
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
| `reader-normal:[s` | `prevHeading` |
| `reader-normal:]s` | `nextHeading` |
| `reader-normal:[f` | `prevFigure` |
| `reader-normal:]f` | `nextFigure` |
| `reader-normal:[t` | `prevTable` |
| `reader-normal:]t` | `nextTable` |
| `reader-normal:[a` | `prevAnnotation` |
| `reader-normal:]a` | `nextAnnotation` |
| `reader-normal:[m` | `prevBookmark` |
| `reader-normal:]m` | `nextBookmark` |
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
| `reader-normal:<Space>ro` | `focusReaderOutline` |
| `reader-normal:<Space>rm` | `focusReaderMarks` |
| `reader-normal:<Space>ra` | `focusReaderAnnotations` |
| `reader-normal:<Space>rt` | `focusReaderThumbnails` |
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
| `reader-outline:[s` | `prevHeading` |
| `reader-outline:]s` | `nextHeading` |
| `reader-outline:<Space>ro` | `focusReaderOutline` |
| `reader-outline:<Space>rm` | `focusReaderMarks` |
| `reader-outline:<Space>ra` | `focusReaderAnnotations` |
| `reader-outline:<Space>rt` | `focusReaderThumbnails` |
| `reader-outline:j` | `uiNext` |
| `reader-outline:k` | `uiPrevious` |
| `reader-outline:h` | `uiParent` |
| `reader-outline:l` | `uiChild` |
| `reader-outline:<Esc>` | `uiCancel` |
| `reader-marks:[s` | `prevHeading` |
| `reader-marks:]s` | `nextHeading` |
| `reader-marks:<Space>ro` | `focusReaderOutline` |
| `reader-marks:<Space>rm` | `focusReaderMarks` |
| `reader-marks:<Space>ra` | `focusReaderAnnotations` |
| `reader-marks:<Space>rt` | `focusReaderThumbnails` |
| `reader-marks:j` | `uiNext` |
| `reader-marks:k` | `uiPrevious` |
| `reader-marks:gg` | `uiFirst` |
| `reader-marks:G` | `uiLast` |
| `reader-marks:<Enter>` | `uiConfirm` |
| `reader-marks:<Esc>` | `uiCancel` |
| `reader-marks:d` | `uiDelete` |
| `reader-marks:x` | `uiClear` |
| `reader-annotations:[s` | `prevHeading` |
| `reader-annotations:]s` | `nextHeading` |
| `reader-annotations:<Space>ro` | `focusReaderOutline` |
| `reader-annotations:<Space>rm` | `focusReaderMarks` |
| `reader-annotations:<Space>ra` | `focusReaderAnnotations` |
| `reader-annotations:<Space>rt` | `focusReaderThumbnails` |
| `reader-annotations:j` | `uiNext` |
| `reader-annotations:k` | `uiPrevious` |
| `reader-annotations:<Esc>` | `uiCancel` |
| `reader-thumbnails:[s` | `prevHeading` |
| `reader-thumbnails:]s` | `nextHeading` |
| `reader-thumbnails:<Space>ro` | `focusReaderOutline` |
| `reader-thumbnails:<Space>rm` | `focusReaderMarks` |
| `reader-thumbnails:<Space>ra` | `focusReaderAnnotations` |
| `reader-thumbnails:<Space>rt` | `focusReaderThumbnails` |
| `reader-thumbnails:j` | `uiNext` |
| `reader-thumbnails:k` | `uiPrevious` |
| `reader-thumbnails:<Esc>` | `uiCancel` |
| `picker-input:<C-j>` | `uiNext` |
| `picker-input:<C-n>` | `uiNext` |
| `picker-input:<Down>` | `uiNext` |
| `picker-input:<C-k>` | `uiPrevious` |
| `picker-input:<C-p>` | `uiPrevious` |
| `picker-input:<Up>` | `uiPrevious` |
| `picker-input:<C-d>` | `uiPreviewDown` |
| `picker-input:<C-u>` | `uiPreviewUp` |
| `picker-input:<Enter>` | `uiConfirm` |
| `picker-input:<S-Enter>` | `uiConfirm` |
| `picker-input:<Esc>` | `uiCancel` |
| `picker-list:<C-j>` | `uiNext` |
| `picker-list:<C-n>` | `uiNext` |
| `picker-list:<Down>` | `uiNext` |
| `picker-list:<C-k>` | `uiPrevious` |
| `picker-list:<C-p>` | `uiPrevious` |
| `picker-list:<Up>` | `uiPrevious` |
| `picker-list:<C-d>` | `uiPreviewDown` |
| `picker-list:<C-u>` | `uiPreviewUp` |
| `picker-list:<Enter>` | `uiConfirm` |
| `picker-list:<S-Enter>` | `uiConfirm` |
| `picker-list:<Esc>` | `uiCancel` |
| `picker-list:j` | `uiNext` |
| `picker-list:k` | `uiPrevious` |
| `picker-list:/` | `uiSearch` |
| `plugins-input:<Esc>` | `uiFocusList` |
| `plugins-list:<Esc>` | `uiCancel` |
| `plugins-list:q` | `uiCancel` |
| `plugins-list:/` | `uiSearch` |
| `plugins-list:j` | `uiNext` |
| `plugins-list:<Down>` | `uiNext` |
| `plugins-list:k` | `uiPrevious` |
| `plugins-list:<Up>` | `uiPrevious` |
| `plugins-list:gg` | `uiFirst` |
| `plugins-list:<Home>` | `uiFirst` |
| `plugins-list:G` | `uiLast` |
| `plugins-list:<End>` | `uiLast` |
| `plugins-list:<C-d>` | `uiPageDown` |
| `plugins-list:<C-u>` | `uiPageUp` |
| `plugins-list:r` | `pluginsRefresh` |
| `plugins-list:e` | `pluginsEnable` |
| `plugins-list:d` | `pluginsDisable` |
| `plugins-list:p` | `pluginsPreferences` |
| `plugins-list:o` | `pluginsHomepage` |
| `plugins-list:R` | `pluginsReadme` |
| `plugins-list:L` | `pluginsGitLog` |


## Neovim comparison and examples

Familiar keys have jobs suited to Zotero: `:` opens the Command Palette, `H` / `L` switch tabs, and `gg` / `G` move within the current Library list, PDF, or Note. The action tables specify count behavior and the Note editor's available motions and operators.

Examples:

- Reader `3j`: three configured scroll steps; Reader `3l`: three adjacent page turns; neither is a jumplist boundary.
- Reader `3gg` or `3G`: jump to page three; bare `gg`: first-page start; bare `G`: document bottom.
- Main `3j`: Cursor motion, not three Reader scrolls; Main `gg/G`: first/last row of its supported list.
- Note `3j`: move the caret three lines; `3x`: delete three characters. Note delete, yank, and change operators apply once, including when preceded by a count.
- Reader `2<C-o>` traverses two shared history entries; `2:` merely opens the palette and does not repeat the chosen action.
- Reader `L` followed by a mark jump, then `<C-o>`: go Back through the mark jump and the earlier tab change.

If a key does not act as expected, check focus and search for the action in **Settings → Keybindings**. Confirm its context and whether it is Default, Custom, or Unbound. See [Troubleshooting](TROUBLESHOOTING.md).
