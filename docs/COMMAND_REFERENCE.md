# Command Reference

Find a command's default binding, execution context, count behavior, and target conditions here. For workflows, see the [User Guide](USER_GUIDE.md); for tag actions and filters, see [Selection and Tag Actions](TAGS.md); for text entry and IME, see [Input methods](INPUT_METHODS.md).

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
- [Count examples](#count-examples)

## Reading this reference

Each command row gives its `ActionId`, shipped default binding(s), and the contexts where it is available. The same key can do different things in different contexts. Saved preferences can add or remove bindings; a command still requires a valid target to run.

“History” means Neo's shared Back/Forward list. A completed action adds a location only when it reaches a different restorable destination; scrolling and other view changes are not jumps. See [Navigation and the shared jumplist](#navigation-and-the-shared-jumplist) for the destinations and restoration limits.

## Modes, focus, and capabilities

Main, Reader, Note, sidebars, pickers, and the Plugin Manager use the binding contexts listed below. Focus determines which local commands are available.

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

Reader Select operates on an eligible PDF text selection; Main Select is a temporary range over visible item rows. Note Insert is the Note editor's text-entry context. Comment editing and native passthrough are input behaviors, not Reader modes. Text fields and active IME composition keep their native editing keys.

In Reader, `v` enters Select when **Text Select mode** is enabled. `i` / Enter opens an eligible selected annotation's comment editor when **Annotation comment editing** is enabled; the editor shows `COMMENT`, not a Reader Insert mode. If comment editing is off, `i` gives native inputs keyboard ownership until Escape. In Main, `v` starts a temporary item-row range. In Note, `i` enters Insert when **Vim-style note editing** is enabled; Escape returns to Normal.

## Key notation and input grammar

- Printable keys are literal and case-sensitive: `g` differs from `G`; `gg` is two `g` presses. `<Space>` is the Space key, while `:` is a literal colon key. Symbolic keys use angle-bracket notation such as `<C-o>`, `<Enter>`, `<Return>`, `<Esc>`, and `<BS>`. `<Enter>` and `<Return>` are aliases where both appear in the table.
- Ctrl and Meta are normalized as Ctrl; `Ctrl`, `Alt`, and `Shift` modifiers combine with a key. For example `<C-d>` is Ctrl+d. Printable shifted symbols use their produced character (for example `+`); named keys can retain explicit Shift.
- A leading decimal count is accepted in contexts that support counts. `0` starts a count only after another count digit; otherwise it is a command, such as Reader Select line-start. Each action defines whether a count repeats it, selects a numbered position, or has no effect.
- When a binding is also the start of a longer sequence, Neo waits briefly for the next key; a matching continuation selects the longer binding, while a timeout runs the shorter one. An unmatched key starts a new command.
- `Escape` cancels a pending sequence or exits the current temporary interaction. `Backspace` removes a pending sequence key where Neo owns the sequence; in a query or editor it edits text.
- Browser/Gecko owns actual text entry and IME composition. While composition is active, or a native editable control has focus, Neo does not reinterpret composition keystrokes as commands. `Dead`, unidentified, and modifier-only key events are not commands. See [Input methods](INPUT_METHODS.md).
- The tables show shipped defaults. A key that Neo does not use remains available to Zotero or the browser; native text entry and IME are described in [Input methods](INPUT_METHODS.md).

The Prefix Guide shows valid continuations for the active context and saved bindings.

## Command Palette, remapping, and unbound actions

In Reader Normal, Main Normal, or Note Normal, `:` opens the Command Palette. Search available actions, move with `↑` / `↓`, `j` / `k` when results have focus, or `Ctrl+j` / `Ctrl+k`, then press Enter to run or Escape to close. The palette includes available actions without a key binding, accepts no command arguments or counts, and runs the selected action once.

In Settings → Keybindings, filter by action group or context and search by localized label, ActionId, current key, or default key. Results identify **Default**, **Custom**, or **Unbound** actions, including supported actions without a shortcut.

Select an action and context to add, record, unbind, or reset its bindings. **Add** and **Record** are explicit controls; recorded `Enter` and `Escape` are key tokens, so use **Done** or **Cancel** to finish. Edits remain staged until **Apply**. Duplicate bindings, unsupported action/context pairs, and reserved native keys prevent applying changes; strict-prefix pairs are allowed with a warning.

Native shortcuts appear separately as read-only entries when **All groups** is selected. Reserved keys cannot be assigned to Neo, including when they occur within a sequence. Outline `Enter` / `Return` remains Zotero-owned; `uiConfirm` is supported there but unbound by default. Native text entry and IME remain available.

**Default** means the key ships with Neo; **Custom** means a saved preference changes the binding; **Unbound** means an available action has no key. An action unavailable in the current context cannot be made available by assigning it a key.

## Navigation and the shared jumplist

### Commands and count behavior

`navigateBack` and `navigateForward` work in Main Normal, Reader Normal, and Note Normal; their defaults are `<C-o>` and `<C-i>`. A positive shortcut count traverses that many locations, as in `2<C-o>`. The Command Palette action is uncounted. Back and Forward stop at either end.

Each Main window has one list of up to 100 locations. Counts stop at the available end; traversal does not wrap. A new jump after Back replaces the old Forward branch, and consecutive equivalent destinations are combined. Back/Forward does not change persistent Main Selection.

### Recording and exclusions

A location is added only when an action completes at a different restorable destination. No-op, failed, or cancelled actions do not add one.

| Surface/action | History behavior |
| --- | --- |
| Main item-row `gg` / `G` | A changed item Cursor can add a location. Main `j` / `k` and collection-tree movement do not. Positive `G` selects the one-based row; bare `G` selects the last row and `gg` the first. |
| Main local-find `n` / `N` | A committed search that moves the Cursor can add a location. A miss, unchanged Cursor, or cancelled prompt does not. |
| Main item open, item/note chooser, or Library reveal | A successful move to a different item, note, or tab can add a location. Activating a collection scope, opening or browsing a chooser, and native tab-bar clicks do not. |
| `H` / `L` or confirmed tab chooser | A change to another open tab can add a location. Each `H` / `L` press cycles once; counts are ignored. Selecting the current tab does not add one. |
| Reader PDF page destination | With Zotero page navigation available, `ngg` / `nG` targets one-based page `n`; bare `gg` goes to the first-page start and bare `G` to the document bottom. Without that API, `gg` / `G` scroll to the document boundaries and ignore counts. Ordinary scrolling and adjacent `h` / `l` page turns do not add locations. |
| Reader marks, Outline, annotation navigation, PDF search results, and internal/citation links | A completed move to a different Reader location can add one. Selecting or highlighting without a location change does not. |
| External PDF link | Opens through Zotero; it is not a Neo Reader history location. |
| Scroll, zoom, split layout, selection/caret movement, filters, and collection edits | These change view or selection state, not the history location. |
| Failed action, unchanged destination, cancelled chooser, or unavailable target | No new location is added. |

### Snapshots and restoration

- **Main:** Back/Forward restores the available library or collection view, Quick Search, tag and Advanced Search filters, Cursor, and focus. Persistent Neo Selection remains unchanged.
- **Reader PDF:** restores the same item and available page/viewport position in each PDF pane. Zoom and split layout stay as they are. If its Reader tab was closed, Neo can reopen the same attachment when it is still readable.
- **Other Reader tabs and ordinary tabs:** return to an open tab and its Zotero-retained position. A closed ordinary tab cannot be reopened through PDF attachment history.
- **Note:** a standalone Note returns to its tab and native retained position; a Note context pane restores the underlying Main view, not the Note caret or editor focus.
- **Unavailable destination:** if an attachment is missing, unreadable, or cannot be restored, the history position does not advance. A partial restore may leave an already-restored tab or view changed.

Before Back or Forward, Neo updates the departure location so movement since the previous jump can be the return point. Closing a Reader or Note tab does not erase history; closing its Main window clears that window's list. A newly opened Reader may need to finish loading before its commands are active.

### Mixed navigation examples

- In a PDF with numeric page navigation, `5gg` goes to page 5 and bare `gg` to its first-page start. Without that host support, `gg` scrolls to the document boundary instead.
- Open Reader A, press `L` to Reader B, then jump to a mark. Back visits the mark's departure and then the tab change; Forward returns through them.
- If a Reader tab in history has been closed, Back can reopen its readable attachment. An unreadable or unavailable target leaves the history position unchanged.
- After going Back, a new completed jump replaces the former Forward branch; scrolling or a cancelled chooser does not create that branch.

## Reader Normal

| ActionId | Default binding(s) | Meaning / count / history |
| --- | --- | --- |
| `scrollDown` / `scrollUp` | `j` / `k` | Scroll by the configured step; counts multiply the step. Continuous movement, not history. |
| `scrollLeft` / `scrollRight` | `zh` / `zl` | Pan horizontally by the configured step; counts multiply the step. |
| `halfPageDown` / `halfPageUp` | `<C-d>` / `<C-u>` | Move half a viewport per step; counts repeat. |
| `fullPageDown` / `fullPageUp` | `<C-f>` / `<C-b>` | Move a full viewport per step; counts repeat. |
| `prevPage` / `nextPage` | `h` / `l` | Repeat Zotero's previous/next-page step `max(1,count)` times; these adjacent page turns do not add history locations. |
| `firstPage` / `lastPage` | `gg` / `G` | When Zotero supports page navigation, a positive count (`ngg` or `nG`) targets that one-based page start; Zotero determines whether the requested page is valid. Without a count, `gg` goes to the first-page start and `G` to the document bottom. If page navigation is unavailable, both scroll to document boundaries and ignore counts. |
| `zoomIn` / `zoomOut` | `+`, `zI` / `-`, `zO` | One Reader zoom step; counts repeat. |
| `zoomReset` | `=`, `z0` | Reset/Fit page width once; count does not repeat. |
| `scrollTop` / `scrollCenter` / `scrollBottom` | `zt` / `zz` / unbound | Place the current page at the top, center, or bottom of the viewport. `scrollBottom` has no default binding. |
| `openSearch` / `findNext` / `findPrevious` / `clearSearch` | `/`, `n`, `N`, `<Esc>` | Open Reader's PDF find bar; `n` / `N` ask Zotero for one next/previous result regardless of count. A result that moves to a different Reader location can add history. |
| `followLink` | `f` | Show hints for visible internal, citation, or external links in the active PDF view. Type a hint to follow it, Backspace to edit, or Escape to cancel; count is ignored. Internal/citation destinations can add history; external links do not. |
| `copyIdentifier` | **Unbound** | Show hints for visible DOI/arXiv/HTTP(S) text and native external links in the active PDF view. Confirm a hint to copy a bare DOI/arXiv ID (keeping `vN`) or full URL; Escape or no candidates leaves the clipboard unchanged. Count is ignored. |
| `followIdentifier` | **Unbound** | Show hints for visible DOI/arXiv/HTTP(S) text and native PDF links. Bare DOI/arXiv text uses its resolver; literal HTTP(S) URLs keep their original destination, even when recognized as an identifier. Native links retain Zotero's behavior. Escape cancels; count is ignored. |
| `prevHeading` / `nextHeading` | `[s` / `]s` | Traverse headings in the native Outline, including Sections and Subsections, in document order with wrap. Available from Reader Normal and each Reader sidebar, independent of collapsed branches or the selected row. |
| `prevFigure` / `nextFigure` | `[f` / `]f` | Move between explicit Figure targets and recognized captions. Land on an associated image when available, otherwise on the caption. First use may require local PDF processing. |
| `prevTable` / `nextTable` | `[t` / `]t` | Move between explicit Table targets and recognized captions. First use may require local PDF processing. |
| `prevAnnotation` / `nextAnnotation` | `[a` / `]a` | Select the previous/next annotation, wrapping at either end; count is ignored. Moving to a different Reader location can add history. |
| `prevBookmark` / `nextBookmark` | `[m` / `]m` | Move between Reader marks in document order, wrapping at either end. A mark jump can add a history location. |
| `editAnnotation` | `<Enter>`, `<Return>` | Open/focus the selected annotation's comment editor. Its input indicator is `COMMENT`; Enter inserts a newline and Escape saves and closes. |
| `deleteAnnotation` | `dd` | Delete the selected annotation after confirmation. Cancellation leaves it unchanged. |
| `yankAnnotation` / `yankAnnotationComment` | `y` / `Y` | Copy the selected annotation text / comment. No target means no copy. |
| `recolorYellow/Red/Green/Blue/Purple` | `zy` / `zr` / `zg` / `zb` / `zp` | Recolor the selected annotation. No selected annotation means no effect. |
| `filterYellow/Red/Green/Blue/Purple` / `filterClear` | `Zy` / `Zr` / `Zg` / `Zb` / `Zp` / `Za` | Filter or clear the annotation sidebar's color filter. |
| `enterVisual` / `enterInsert` / `exitMode` | `v` / `i` / `<Esc>` in owned contexts | Enter Select, open an eligible annotation comment, or exit the current interaction. **Text Select mode** and **Annotation comment editing** control those Reader actions; `exitMode` has no Reader Normal binding. |
| `focusReaderSplitLeft/Down/Up/Right` | `<C-h>` / `<C-j>` / `<C-k>` / `<C-l>` | Focus the nearest eligible pane in that direction; movement does not wrap and does not create a pane. |
| `focusReaderOutline` / `focusReaderMarks` / `focusReaderAnnotations` / `focusReaderThumbnails` | `<Space>ro` / `<Space>rm` / `<Space>ra` / `<Space>rt` | Open or focus Outline, Bookmarks, Annotations, or Thumbnails. Repeating a command leaves that surface focused. |
| `toggleReaderSplitHorizontal` / `toggleReaderSplitVertical` | `<Space>-` / <code>&lt;Space&gt;&#124;</code> | Toggle Reader split layout. Back/Forward does not restore the split layout. |
| `findAllItems` / `findCollectionItems` / `findNotes` | `<Space>ff` / `<Space>fc` / `<Space>fn` | Open an item/note chooser. Confirm a result to open it; browsing or cancelling does not add a history location. |
| `mainAddByIdentifier` | `<Space>ai` | Bring the associated Library window forward and open native identifier entry without changing its collection scope. Uses that Main context, not the Reader item's collections; count is ignored. See [identifier entry](MAIN_GUIDE.md#add-items-by-identifier). |
| `switchTab` / `previousTab` / `nextTab` / `closeCurrentTab` | `<Space>,` / `H` / `L` / `<Space>q` | Choose an open tab, cycle to the previous/next tab, or close the current tab. A tab change can add history; `H` / `L` each cycle once regardless of count. Closing a tab does not erase older locations. |
| `navigateBack` / `navigateForward` | `<C-o>` / `<C-i>` | Traverse shared history; shortcut counts are accepted, while Command Palette actions run once. |
| `openCommandPalette` / `openNeoSettings` / `managePlugins` | `:` / `<Space>ps` / `<Space>pp` | Open the Command Palette, Settings, or persistent Plugin Manager. |
| `addTag` / `removeTag` / `addToCollection` / `removeFromCollection` | `<Space>ta` / `<Space>tr` / `<Space>ca` / `<Space>cr` | Apply tag or collection actions to the active Reader item. Tag candidates, target rules, and filters are described in [Selection and Tag Actions](TAGS.md). |
| `mainYankCitekey` | `<Space>yy` | Copy the active Reader item's citekey; Main Selection is not used. |
| `showInLibrary` | **Unbound** | From the Reader palette, show the active Reader item in Main Library. A successful change of location can add history. |
| `toggleReaderSidebarOutline` | **Unbound** | Toggle Zotero's native Reader Outline sidebar. No default binding is shipped. |
| `toggleMarksExplorer` | **Unbound** | Toggle the Bookmarks view. No default binding is shipped. |

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
| `copySelection` | `y` | Copy the selected PDF text, with line breaks and whitespace normalized. |
| `searchSelection` | `#` | Open Reader search for selected text. |
| `exitMode` | `v`, `<Esc>` | Cancel Reader Select and return to Normal. |
| `underlineSelection` | **Unbound** | Supported Select action via Selection Actions when its built-in action is available; no default key. |

Flash accepts visible text, including Unicode and IME input. Choose a displayed hint or press Enter for the nearest match; narrow broad queries to show labels. Escape cancels Flash and keeps the current selection. Selection Actions includes Capture to note, Underline, and Add note; **Translate** appears only when the Zotero Translate integration is available. See [Input methods](INPUT_METHODS.md) and the [Selection and annotation guide](SELECTION_GUIDE.md#try-it).
Reader Select ignores counts: each motion and selection action runs once. Comment-editor controls and save behavior are listed under [Annotation comment editor](#annotation-comment-editor).

## Main window

Main Normal commands depend on focus in the collection tree, item list, Quick Search, another editable field, or a Neo panel. The item Cursor, native multi-selection, temporary Visual range, and persistent Neo Selection are distinct targets. Some actions refuse hidden or unavailable targets rather than apply to a different item.

### Main actions

| ActionId | Default binding(s) | Meaning / count / history |
| --- | --- | --- |
| `mainNavDown` / `mainNavUp` | `j` / `k` | Move Cursor down/up in tree or items; counts multiply row movement and clamp at visible list bounds. Continuous, excluded from history. |
| `mainNavFirst` / `mainNavLast` | `gg` / `G` | In the item list or collection tree, `gg` goes to the first row and `G` to the last; a positive count with `G` selects that one-based row. Only a changed item Cursor can add history; tree movement does not. |
| `mainActivate` | `<Enter>`, `<Return>` | In the collection tree, activate its scope. In the item list, open the Cursor item/PDF; a changed destination can add history. |
| `mainTreeCollapse` / `mainTreeExpand` | `h` / `l` | `h` while Items owns focus switches to Collections; otherwise it collapses the selected open collection or selects its parent. `l` expands a selected nonempty closed collection; if it is open or a leaf, it focuses Items. No history entry. |
| `mainTreeToggle` / `mainTreeOpenOnly` / `mainTreeCloseOnly` | `za` / `zo` / `zc` | Toggle, expand only, or collapse only selected collection row. |
| `mainTreeExpandAll` / `mainTreeCollapseAll` | `R` / `M` | Expand/collapse all collections in current library tree. |
| `mainTreeParent` | `<BS>` | Move to the parent collection. |
| `mainFocusTree` / `mainFocusLeft` / `mainFocusRight` / `mainFocusItems` | `e` / `wh` / `wl` / `ww` | Focus collection tree, left pane, right detail pane, or middle item list. Focus action is not location history. |
| `mainEnterSelect` | `v` | Begin transient Visual range in item rows. |
| `mainToggleSelection` | `s` | Toggle the current item target in/out of persistent Neo Selection, then advance the Cursor one row when possible. In the collection tree, it does not redefine native scope selection. |
| `mainClearSelection` | `<Space>sc` | Explicitly clear persistent Selection. |
| `mainCancelTarget` | `<Esc>` | Cancel a temporary Visual range or native multi-selection without clearing persistent Neo Selection. |
| `mainSelectDown` / `mainSelectUp` | `j` / `k` in Main Select | Extend transient range by the count's row distance, clamped to visible list bounds. |
| `mainSelectFirst` / `mainSelectLast` | `gg` / `G` in Main Select | `gg` extends to first row regardless of count; `G` extends to last row or the positive count's one-based row. |
| `mainSelectSwapEnds` | `o` in Main Select | Swap range anchor and active end. |
| `mainSelectFinish` / `mainSelectCancel` | `s` / `v`, `<Esc>` in Main Select | Commit or cancel temporary range; cancellation does not clear persistent Selection. |
| `mainTrashItems` | `dd`, `x` | Trash persistent Selection when it is non-empty; otherwise trash the current temporary target or Cursor. Confirmation is required. Hidden Selection members prevent the operation; cancellation preserves Selection. |
| `mainRestoreTrashedItems` | `u` | Restore the last item batch trashed by Neo; unavailable batch is a no-op/failure. |
| `mainOpenPDF` | `o` | Open Cursor item/PDF only; does not batch-open persistent Selection/native multi-selection. |
| `mainYankCitekey` | `<Space>yy` | Copy citekeys for Main's effective item target. If any target is unavailable or has no citekey, the clipboard is left unchanged. |
| `openSearch` | `/` | Main Normal requires Items focus; it cancels a transient Visual range and opens Neo's local-find prompt over visible item rows. It is not Zotero Quick Search; use `mainQuickSearch` (`<Space>fq`) for that. |
| `findNext` / `findPrevious` | `n` / `N` | With the item list focused, repeat the committed local-find query once forward/backward; count is ignored. No query, a miss, or unchanged Cursor leaves location unchanged. A changed Cursor can add history. |
| `mainQuickSearch` / `mainAdvancedSearch` | `<Space>fq` / `<Space>fa` | Focus native Quick Search or open Advanced Search; `fa` can convert existing Quick Search text. These alter Main View scope, not Reader page location. |
| `mainAddByIdentifier` | `<Space>ai` | Open native identifier entry for one writable library and its selected collections, not an item target or Neo Selection. Cross-library/read-only scopes are unavailable; count is ignored. See [identifier entry](MAIN_GUIDE.md#add-items-by-identifier). |
| `findAllItems` / `findCollectionItems` / `findNotes` | `<Space>ff` / `<Space>fc` / `<Space>fn` | Open the shared item/note chooser. Confirming a result can add a history location; browsing or cancelling does not. |
| `switchTab` / `previousTab` / `nextTab` / `closeCurrentTab` | `<Space>,` / `H` / `L` / `<Space>q` | Open-tab chooser, previous/next open tab, close active tab. Successful chooser/H/L changes record; H/L ignore counts. Closing alone is not recorded and does not delete older entries.
| `navigateBack` / `navigateForward` | `<C-o>` / `<C-i>` | Shared counted history traversal. |
| `addTag` / `removeTag` | `<Space>ta` / `<Space>tr` | Apply to Main's current tag-action targets. See [Selection and Tag Actions](TAGS.md) for selection precedence, same-library limits, and candidates. |
| `toggleTagFilter` / `clearTagFilters` | `<Space>tf` / `<Space>tc` | Main-only native AND tag filter toggle / clear all. Not jumplist entries. |
| `addToCollection` / `removeFromCollection` | `<Space>ca` / `<Space>cr` | Add or remove the current item target(s) in a collection from the same library. |
| `openCommandPalette` / `managePlugins` / `openNeoSettings` | `:` / `<Space>pp` / `<Space>ps` | Command Palette, persistent Plugin Manager, or Settings. |
| `focusReaderSplitLeft/Down/Up/Right` | `<C-h>` / `<C-j>` / `<C-k>` / `<C-l>` | Focus nearest eligible pane in direction; no wrap at boundaries. |
| `showInLibrary` | **Not supported** | Main Normal has no such capability. Reader Normal and Note Normal expose the action unbound in their Command Palettes; it resolves the active Reader or Note context item, never Main Selection. |

Main item actions use persistent Neo Selection when it is non-empty; otherwise they use the current target, such as a Visual range, native multi-selection, or Cursor, according to the action. Collection-tree scope selection is separate from item Selection. See [Selection and Tag Actions](TAGS.md) for tag targeting.

Main counts repeat `mainNavDown/Up`, `mainNavLast`, `mainSelectDown/Up`, `mainSelectLast`, and `navigateBack/Forward`. `mainNavFirst` and `mainSelectFirst` always choose the first row. Other actions run once; local-find `n` / `N` each run one search step regardless of count.

### Main-only local find

With item-list focus, `/` opens a prompt; Enter commits a non-empty query and moves Cursor to the next visible match. Escape cancels without replacing the previous query. `n` / `N` each search one step, wrapping once through visible rows. Matching is case-insensitive over item display/title, first creator, year, and citekey when available. No query, a miss, or unavailable Cursor movement leaves the location unchanged. Local find differs from `ff` / `fc` chooser search and native `fq` / `fa` Quick/Advanced Search.

## Note editor

When **Vim-style note editing** is enabled, Note editors use Normal motions and editing commands; the setting is on by default. `i` enters Insert, where typing and IME go to Zotero/browser; `Escape` returns to Note Normal. With the setting off, typing stays in Zotero's editor.

| ActionId | Default | Effect |
| --- | --- | --- |
| `noteMoveLeft` / `noteMoveDown` / `noteMoveUp` / `noteMoveRight` | `h` / `j` / `k` / `l` | Move caret by character/line. |
| `noteMoveWordForward` / `noteMoveWordBackward` | `w` / `b` | Move by word. |
| `noteMoveLineStart` / `noteMoveLineEnd` | `0` / `$` | Move within line. |
| `noteMoveDocumentStart` / `noteMoveDocumentEnd` | `gg` / `G` | Move to document boundary. |
| `noteDeleteChar` | `x` | Delete character at caret. |
| `noteAppendAfter` / `noteAppendLineEnd` / `noteInsertLineStart` | `a` / `A` / `I` | Enter Insert after caret, at line end, or line start. |
| `noteOpenLineBelow` / `noteOpenLineAbove` | `o` / `O` | Open line below/above and enter Insert. |
| `noteUndo` / `noteRedo` | `u` / `<C-r>` | Undo or redo a Note editor change. |
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

Note Normal also offers shared history, the Command Palette, tab switches, item/note choosers, tag actions, Settings, Plugin Manager, and citekey copying. Note has no collection-membership or Main tag-filter commands. In Note Normal, `<Space>o` opens the Note-context item, not Main Selection. See the default binding index for their shortcuts.

Note counts repeat `h` / `l` / `j` / `k` / `w` / `b` / `0` / `$` motions and `x` character deletion. `gg` / `G`, Insert commands, `p` / `P`, undo/redo, and each `d` / `y` / `c` operator run once regardless of count. `y` updates the Note register and system clipboard; delete/change update the Note register, and `p` / `P` paste it.

## Temporary surfaces and chooser grammars

### Shared chooser

Item, note, tab, tag, and collection choosers share the same query and result controls. The query and results use `picker-input` and `picker-list` contexts, which can be remapped separately. Defaults include Up/Down, `Ctrl+j` / `Ctrl+n` and `Ctrl+k` / `Ctrl+p` to move, `Ctrl+d` / `Ctrl+u` to scroll the preview, Enter or Shift+Enter to confirm, and Escape to cancel. In the results list, `j` / `k` move and `/` focuses the query. `uiNextPane` and `uiPreviousPane` are supported in `picker-input` but unbound by default. Query typing and IME use native text input. A preference enables mouse row selection and double-click confirmation; hover alone does not select.

Notes (`fn`) start with notes for the current item. **Browse library** searches other existing notes in that library; **Current item** returns to the starting item. The preview shows the note's owner and body. Confirming a result from `fn` opens that note.

**Capture to note** is a separate Selection Actions workflow: it appends the selected text to an existing note in the same library. Before confirmation, Escape cancels without writing. After the save is admitted, closing the chooser or pressing Escape does not undo it. An unavailable or changed note target is refused; a save failure is shown.

Add Tag may offer an explicit create candidate; Remove Tag lists tags assigned to at least one target. A virtual namespace candidate refines the query and is not itself a tag action. Main `tf` toggles a tag filter from the current view and active filters; `tc` clears all filters without a chooser. See [Selection and Tag Actions](TAGS.md) for tag targets, same-library mutation limits, and flat tag storage. Collection membership actions require targets from one library and skip membership changes that are already satisfied.

### Flash and link hints

Reader Select `v` starts Flash for the selection start; Select `s` uses it for the other endpoint. Type visible text, including Unicode through IME, then choose a displayed hint or press Enter for the nearest match. Escape cancels and keeps the existing selection; Backspace edits the query or label according to focus.

Reader Normal `f` shows hints for visible internal, citation, and external links in the active PDF view. Type a hint to follow it, Backspace to edit it, or Escape to cancel. External links use Zotero's normal handler; off-screen links are not included.

### Native Reader Outline and Bookmarks

Reader Normal `<Space>ro`, `<Space>rm`, `<Space>ra`, and `<Space>rt` open or focus Outline, Bookmarks, Annotations, and Thumbnails. Repeating a command leaves that panel focused. The same panel-focus commands are available from each Reader sidebar.

In `reader-outline`, `j` / `k` move through rows and `h` / `l` move to parent/child; Escape cancels. Zotero's arrows, Tab/Shift+Tab, and Enter/Return remain native. `uiConfirm` is supported but unbound by default. In `reader-marks`, defaults are `j` / `k`, `gg` / `G`, Enter, Escape, `d`, and `x`. In `reader-annotations` and `reader-thumbnails`, defaults are `j` / `k` and Escape. These local controls can be remapped in their respective contexts.

`[s` / `]s` traverse headings across the Outline from Reader Normal and each sidebar, regardless of collapsed branches or the selected row. `[f` / `]f` and `[t` / `]t` move through Figures and Tables with usable PDF targets; associated figure images are used when available, otherwise navigation lands on the caption. The first explicit structural-navigation request may require local PDF processing. PDFs without recognizable targets cannot provide those destinations.

### Marks and Bookmarks group

Press `m` followed by a lowercase letter or digit to set a Reader mark; press backtick followed by that label to return. `dm` followed by a label deletes one mark, and `dM` deletes all marks. Reader Normal `[m` / `]m` moves between marks in document order with wrap. `<Space>rm` opens or focuses Bookmarks.

In the Bookmark list, `j` / `k` move, `gg` / `G` go to the first/last mark, Enter jumps, `d` deletes the selected mark, and `x` clears marks. Mark labels are lowercase letters or digits; `j`, `k`, `g`, `d`, and `x` are list controls. These are Reader position marks, not PDF annotations. Persistence follows the **Persist marks** preference.

### Annotation comment editor

When **Annotation comment editing** is enabled, Reader Normal `i` / Enter opens the selected annotation's comment editor. Select `i` opens it for the new annotation. The editor displays `COMMENT`; typing and IME edit the comment, Enter inserts a newline, and Escape saves and closes. Changes also autosave after two seconds. Escape is not cancel or undo; an active IME composition handles its own Escape. The editor remains associated with the annotation it opened, and an unavailable annotation cannot be saved. Closing Reader does not perform another save; only saved text is guaranteed on reopen.

When the setting is off, Reader Normal `i` gives native inputs keyboard ownership until Escape; Enter does not open Neo's editor. Zotero's own comment fields remain available, and Select **Add note** still opens the new annotation's editor.

### Selection Actions, Plugin Manager, Settings, and Selection Panel

Selection Actions opens with `a` / Enter in Reader Select. Use arrows or `j` / `k` to move, `Home` / `g` for the first result, `End` / `G` for the last, and `1`–`9` or Enter to run a result. Escape closes the palette and preserves the selection. **Capture to note**, **Underline**, and **Add note** are available; **Translate** appears when Zotero Translate is installed. A result can be copied with `y`.

Plugin Manager (`<Space>pp`) stays open while you browse. In `plugins-list`, defaults are `j` / Down and `k` / Up, `gg` / Home and `G` / End, `Ctrl+d` / `Ctrl+u` for page movement, `/` to filter, and Escape / `q` to close. `r` reloads the list; `e` / `d` enable or disable only when Zotero permits; `p` opens registered settings; `o` opens the homepage; `R` opens a mapped GitHub README; and `L` opens its commit history. Escape in `plugins-input` returns to the results. Zotero AddonManager determines which lifecycle actions are available; Neo cannot disable itself from its own panel.

Settings opens with `<Space>ps`; keybinding edits remain staged until Apply. Main Selection Panel opens with `<Space>ss`: `j` / `k` move, `Home` / `gg` and `End` / `G` go to the first/last entry, Enter reveals an item, `x` removes it from persistent Selection, `c` clears Selection, `r` refreshes, and Escape / `q` closes. An unavailable item cannot be revealed; a failed reveal leaves the panel open.

## Action ID index

The index lists each ActionId with its shipped default binding and available contexts. **Unbound** means the action is available without a shipped key; a command still needs a valid target to run.

| ActionId | Default binding(s) | Capability / principal effect |
| --- | --- | --- |
| `scrollDown` | Reader Normal `j` | Reader Normal scroll |
| `scrollUp` | Reader Normal `k` | Reader Normal scroll |
| `scrollLeft` | Reader Normal `zh` | Reader Normal horizontal pan |
| `scrollRight` | Reader Normal `zl` | Reader Normal horizontal pan |
| `prevPage` | Reader Normal `h` | Reader Normal page turn |
| `nextPage` | Reader Normal `l` | Reader Normal page turn |
| `followLink` | Reader Normal `f` | Reader Normal visible PDF link hints |
| `copyIdentifier` | **Unbound** | Reader Normal visible identifier/URL copy after hint confirmation |
| `followIdentifier` | **Unbound** | Reader Normal visible identifier or native PDF-link follow |
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
| `prevFigure` | Reader Normal `[f` | Previous Figure target or recognized caption; lands on associated image when available, otherwise the caption. First use may require local PDF processing. |
| `nextFigure` | Reader Normal `]f` | Next Figure target or recognized caption; lands on associated image when available, otherwise the caption. First use may require local PDF processing. |
| `prevTable` | Reader Normal `[t` | Previous explicit Table target or recognized caption; first use may require local PDF processing. |
| `nextTable` | Reader Normal `]t` | Next explicit Table target or recognized caption; first use may require local PDF processing. |
| `prevBookmark` | Reader Normal `[m` | Previous Reader mark in document order, wrapping at the beginning. |
| `nextBookmark` | Reader Normal `]m` | Next Reader mark in document order, wrapping at the end. |
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
| `mainAddByIdentifier` | Reader/Main Normal `<Space>ai` | Native Add Item by Identifier in the associated Library window; does not use item Selection |
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
| `noteUndo` | Note Normal `u` | Undo a Note editor change |
| `noteRedo` | Note Normal `<C-r>` | Redo a Note editor change |
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

Use this table to find the ActionId for a shipped `BindingContext:sequence`. Saved custom bindings can replace a default.

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
| `reader-normal:<Space>ai` | `mainAddByIdentifier` |
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
| `main-normal:<Space>ai` | `mainAddByIdentifier` |
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

## Count examples

- Reader `3j` scrolls three configured steps; `3l` requests three adjacent page turns.
- Reader `3gg` / `3G` targets page three when Zotero supports numeric page navigation. Bare `gg` / `G` goes to the first-page start / document bottom; without page navigation they scroll to the document boundaries.
- Main `3j` moves the Cursor three rows. `gg` / `G` goes to the first/last row; a positive count with `G` selects that one-based row.
- Note `3j` moves three lines and `3x` deletes three characters. An operator such as `3dw` runs once; the count does not multiply Note operators.
- Reader `2<C-o>` traverses two history locations. `2:` opens the Command Palette; the selected action runs once.
- Reader `L` followed by a mark jump, then `<C-o>`, goes Back through the mark and then the earlier tab change.

If a key does not run a command, check the focused context and mode, feature setting, and saved binding in Settings. An action also needs a valid target, such as a selected annotation or current item.
