# Zotero Neo User Guide

This guide documents the current shipped bindings and settings. The default
keymap will change only after the dedicated LazyVim keymap review; consult the
project [roadmap](ROADMAP.md) before relying on planned bindings.

## Contents

- [Modes](#modes)
- [Default keybindings](#default-keybindings)
- [Annotation workflow](#annotation-workflow)
- [Customising keybindings](#customising-keybindings)
- [Settings](#settings)

---

## Modes

The plugin operates in four modes, displayed in a small overlay in the
bottom-right corner of the PDF viewer:

| Mode       | Indicator      | Purpose                                      |
| ---------- | -------------- | -------------------------------------------- |
| **Normal** | _(hidden)_     | Default — navigation and annotation commands |
| **Cursor** | `-- CURSOR --` | Caret navigation without text selection      |
| **Visual** | `-- VISUAL --` | Text selection and annotation creation       |
| **Insert** | `-- INSERT --` | Passthrough — all keys go to Zotero          |

Mode transitions:

```
Normal ──c──▶ Cursor ──Escape────▶ Normal
Normal ──v──▶ Visual ──v/Escape──▶ Normal
Normal ──i──▶ Insert ──Escape────▶ Normal
Cursor ──v──▶ Visual ──v/Escape──▶ Normal
```

---

## Default keybindings

### Normal mode

#### Scrolling

| Key             | Action         |
| --------------- | -------------- |
| `j`             | Scroll down    |
| `k`             | Scroll up      |
| `Shift+h` (`H`) | Scroll left    |
| `Shift+l` (`L`) | Scroll right   |
| `Ctrl+d`        | Half-page down |
| `Ctrl+u`        | Half-page up   |
| `Ctrl+f`        | Full-page down |
| `Ctrl+b`        | Full-page up   |

Count prefixes multiply the step — `3j` scrolls three steps, `2ctrl+f` two full
pages, and so on.

#### Zoom

| Key                     | Action                      |
| ----------------------- | --------------------------- |
| `+` (`Shift+=`) or `zI` | Zoom in                     |
| `-` or `zO`             | Zoom out                    |
| `=` or `z0`             | Reset zoom / Fit page width |

Count prefixes repeat zoom in/out steps — `3+` and `3zI` zoom in three steps,
while reset always runs once, so `3=` and `3z0` each reset once.

#### Page navigation

| Key             | Action                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| `h`             | Previous page                                                             |
| `l`             | Next page                                                                 |
| `gg`            | First page                                                                |
| `G`             | Last page                                                                 |
| `Shift+J` (`J`) | Switch to previous open tab                                               |
| `Shift+K` (`K`) | Switch to next open tab                                                   |
| `<space>ft`     | Open tab picker                                                           |
| `<space>td`     | Close the active Zotero tab                                               |
| `<space>fn`     | Search all notes in the shared picker (left: note titles, right: preview) |

Count prefixes repeat the page turn (`3l` = three pages forward) and `gg`/`G`
with a count jump to that page number (`5G` / `5gg` = page 5).

### Space-leader key guide

In Reader Normal mode, main-window navigation, and Note Normal mode, pause after
pressing `Space` to show a small bottom-center list of valid next keys. It reads
the active keybinding configuration, so remapped Space-leader commands appear
without a second display-only keymap.

- The guide is enabled by default and appears after 200 ms; its delay and
  15 px default font size are configurable under **Preferences → Key guide**.
- Letter labels preserve case: `b` and `B` are distinct bindings.
- It updates after nested prefixes such as `<space>f`.
- `Escape` cancels the leader sequence. `Backspace` returns to the previous
  leader prefix; at the root it closes the guide.
- It never appears in Insert mode, native/editor text input, picker input, or
  other Neo-owned modal input.

Only working commands are shown; unsupported commands are omitted until their
owning features are available.

#### Directional pane focus

`Ctrl+h` / `Ctrl+j` / `Ctrl+k` / `Ctrl+l` move to the nearest visible pane in
the requested left/down/up/right half-plane. This works across the main library
panes, Reader split views, and note editors. Movement never wraps at a boundary,
and editable fields keep their native input when no pane accepts focus.

#### Reading history

| Key      | Action                                             |
| -------- | -------------------------------------------------- |
| `Ctrl+o` | Go back through Zotero's native reading history    |
| `Ctrl+i` | Go forward through Zotero's native reading history |

History and all Reader motions remain owned by Zotero and follow the last focused
primary or split reader view, whether focus changed by mouse or keyboard. Empty
history boundaries are safe no-ops. These bindings are active only in reader Normal
mode; Insert mode and editable controls retain native input.

#### Follow PDF links

| Key | Action                                                                                 |
| --- | -------------------------------------------------------------------------------------- |
| `f` | Label every visible internal, citation, or external PDF link in the active reader view |

Type the displayed hint letters to activate a link. Matching is case-insensitive;
`Backspace` removes one typed hint character and `Escape` cancels the hint mode.
Internal links, including figure/table references, navigate in the active primary
or split PDF view and become part of Zotero's native `Ctrl+o` / `Ctrl+i` reading
history. Citation hints follow Zotero's first resolved bibliography target.
External links open through Zotero's normal link handler. Reference-preview
overlays, off-screen links, Insert mode, and editable controls are not claimed.

After an internal or citation jump, Neo shows Zotero's preview-style target cue
for about two seconds: a red circle for point destinations or a red rectangle
when the PDF provides an area. The cue is transient and does not create an
annotation or modify text selection.

> **Note:** Zotero's built-in Read Aloud also listens for the `l`/`r` keys.
> The plugin blocks Zotero's reader key forwarding for keys vim consumes, so
> `l` (next page) never starts Read Aloud. To use Read Aloud, press `r`
> (unbound in vim by default) or click the Read Aloud toolbar button.

#### Unified fuzzy picker

| Key         | Scope                                        |
| ----------- | -------------------------------------------- |
| `<space>ff` | All items in the current library             |
| `<space>fc` | Items in the current collection              |
| `<space>fn` | All notes in the active library              |
| `<space>ft` | Currently open Zotero tabs                   |
| `<space>fT` | Tags for the current collection/library view |

All five scopes use the same picker shell: search prompt, result count, selected-row
highlight, result list, scope-specific preview, and an always-visible shortcut reference.
The default layout places results on the left and the preview on the right; narrow windows
stack them into a usable single-column layout. Matching is case-insensitive and fzf-style:
every query character must appear in order, with consecutive and word-boundary matches ranked
first. Enter applies the selected result in item, collection, tab, and note scopes. Tags use
an explicit List/Query model and remain open while each tag filter is toggled.

Result rows are keyboard-only: pointer hover, clicks, and double-clicks do not
change selection or activate results. Pointer remains usable for search-input focus
and result or preview scrolling.

| Key                    | Action                                                    |
| ---------------------- | --------------------------------------------------------- |
| `↑` / `↓` or `j` / `k` | Move selection up / down outside the search input         |
| `Ctrl+j` / `Ctrl+k`    | Move the selected row down / up                           |
| `Ctrl+d` / `Ctrl+u`    | Scroll the preview down / up                              |
| `Enter`                | Apply the selected result                                 |
| `Type`                 | Filter the picker query                                   |
| `Ctrl+o`               | Open the selected item's PDF (item scopes only)           |
| `y`                    | Copy the selected item's full citation (item scopes only) |
| `yy`                   | Copy the selected item's citekey (item scopes only)       |
| `Escape`               | Close the picker                                          |

Tab rows are selected by search, arrows, `j`/`k`, or `Ctrl+j`/`Ctrl+k`; there are no
alphabet hint labels. `y`/`yy` copying is not available in the tab scope.

#### Tag scope

`<space>fT` opens a keyboard-first tag picker in **List mode**. It starts with tags relevant
to the current collection/library view; `a` toggles to all tags in the current library.
The top visible row is highlighted after loading, even when it is already active. Selected
tags remain pinned above available tags and filters apply immediately with Zotero's native
**AND** semantics. The source snapshot remains stable while open; close and reopen it to
refresh the current scope.
The picker shows separate concise help below the search input for Query mode and below the
tag list for List mode; each location updates when the mode changes.

`/`, `Tab`, or clicking the input enters **Query mode**. Query text only filters picker rows:
Space, `x`, `C`, and `a` remain literal input there. `Escape` returns Query mode to List mode;
another `Escape` closes while retaining already-applied filters.

| Key                        | Action                                                          |
| -------------------------- | --------------------------------------------------------------- |
| `j` / `k` or `↑` / `↓`     | Move the highlighted tag in List mode                           |
| `Ctrl+j` / `Ctrl+k`        | Move the highlighted tag down / up                              |
| `/`, `Tab`, or input click | Enter Query mode                                                |
| `Space` / `Enter`          | Toggle the highlighted tag immediately and keep the picker open |
| `x`                        | Remove the highlighted tag only when it is active               |
| `C`                        | Clear all active tag filters and keep the picker open           |
| `a`                        | Toggle Current view / All library tag scope                     |
| `gg` / `G`                 | Jump to first / last visible tag                                |
| `Ctrl+d` / `Ctrl+u`        | Scroll the preview down / up                                    |
| `Escape`                   | Query → List; List → close                                      |

Result rows and their checkbox markers are not pointer actions. Use the keyboard
controls above to highlight and toggle tags; these controls only alter the current
filter. They never remove tag data or edit item-tag associations. Existing filters
made through Zotero's tag selector are shown when the picker opens and can be removed here.

#### Notes scope

Notes are filtered by display title and normalized note body content. Current-item notes are
marked in the shared result list, followed by the remaining notes from the active library. On
a PDF reader tab, current-item and library context come from the active reader attachment and
its parent rather than a stale main-window selection. Opening a note prefers Zotero's right-side
editor.

| Key                    | Action                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `j` / `k` or `↑` / `↓` | Move note selection up / down                                                                          |
| `Ctrl+j` / `Ctrl+k`    | Move the selected note down / up                                                                       |
| `Ctrl+d` / `Ctrl+u`    | Scroll the selected note preview down / up                                                             |
| `n`                    | Create a child note under the selected note's parent; with no row, use the active reader item's parent |
| `Shift+N`              | Create a child note under the active reader parent or current main-window item, then open a note tab   |
| `gg` / `G`             | Jump to first / last note                                                                              |
| `dd`, `x`, or `Delete` | Move the selected note to Zotero Trash                                                                 |
| `u`                    | Restore the last note deleted from this picker                                                         |
| `Enter`                | Open selected note in the right-side note editor                                                       |
| `Shift+Enter`          | Open selected note in a new note tab                                                                   |
| `Escape`               | Close the picker                                                                                       |

#### Outline explorer

| Key                 | Action                                                   |
| ------------------- | -------------------------------------------------------- |
| `<space>e`          | Toggle custom outline explorer overlay                   |
| `j` / `k`           | Move outline selection down / up                         |
| `Ctrl+d` / `Ctrl+u` | Fast move down / up                                      |
| `l`                 | Expand selected outline node                             |
| `h`                 | Collapse selected outline node                           |
| `R` / `M`           | Expand all / collapse all outline nodes                  |
| `gg` / `G`          | Jump to top / bottom outline item                        |
| Hint letters        | Select the hinted outline item without jumping           |
| `Enter`             | Jump to selected outline entry and return to Normal mode |
| `Escape`            | Close the outline explorer                               |

When the outline explorer opens, it will try to preselect the nearest/current
outline entry for your reading position; if the PDF metadata does not allow
reliable mapping, it falls back to the first visible outline item. Each visible
item also shows a hint label.
If the number of items is small the hints are single characters; otherwise they
expand to two-character hints. Typing a hint only changes the current selection;
you still press `Enter` to jump.

#### Reader split view

| Key         | Action                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `<space>-`  | Toggle horizontal split (top/bottom)                                                                               |
| `<space>\|` | Toggle vertical split (left/right)                                                                                 |
| `Ctrl+h`    | Return from the right-side note editor to the active reader pane, or focus the reader split pane to the left       |
| `Ctrl+j`    | Focus the reader split pane below when one exists                                                                  |
| `Ctrl+k`    | Focus the reader split pane above when one exists                                                                  |
| `Ctrl+l`    | Focus the reader split pane to the right, then move from the rightmost reader pane into Zotero's context note pane |

#### Marks

Vim-style position marks for quick jumps. `m<x>` sets a mark at the current
viewport position, `` `<x> `` jumps back to it. Mark characters can be `a`–`z`
or `0`–`9` (sioyek-style numbered tags).

| Key        | Action                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `m<x>`     | Set a mark at the current position (e.g. `ma`, `m1`)                                                                          |
| `` `<x> `` | Jump to the mark — instant page flip, reproducing the exact view that was marked (e.g. `` `a ``, `` `1 ``)                    |
| `dm<x>`    | Delete the mark (e.g. `dma`)                                                                                                  |
| `dM`       | Delete all marks                                                                                                              |
| `<space>m` | Toggle the marks explorer overlay (type a mark char to jump directly; `j`/`k` move, `Enter` jump, `d` delete, `x` delete all) |

Notes:

- Digits after a mark prefix are mark characters, not counts — `4j` still
  scrolls four steps, but `` `1 `` jumps to mark 1.
- A mark stores the viewport-centre position: whatever was in the middle of
  the screen when you pressed `m<x>` will be in the middle of the screen when
  you jump back — even mid-page.
- If an annotation is selected (via `[`/`]`), the mark also binds to it so
  follow-up commands (`[`/`]`, `zy`, `y`, …) work after a jump. `[`/`]`
  annotation navigation is unaffected.
- With **Persist marks** enabled (Preferences → Marks) the whole mark set is
  saved as a `zv-marks-<attachmentKey>:` line in the **parent item's Extra
  field** (syncs via Zotero sync — Zotero 9 attachments have no Extra field,
  so the parent item is used; multiple PDFs under one item get separate
  lines), falling back to a device-local pref. The status bar shows which
  backend was used (`· saved (extra)` / `· saved (local)`). Marks from the
  previous annotation-tag scheme are migrated automatically.
- Marks set with persistence disabled live for the current reader session only.

#### Note editor (context pane and standalone note tab)

When a Zotero note editor has focus (right-side context pane or a standalone
note tab), the plugin provides a minimal Vim-like layer.

| Key                       | Action                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `i`                       | Enter note Insert mode (pass through typing)                                                         |
| `a` / `A` / `I`           | Enter Insert mode at next char / line end / line start                                               |
| `o` / `O`                 | Open line below / above and enter Insert mode                                                        |
| `Escape`                  | Return to note Normal mode                                                                           |
| `h` / `l`                 | Move caret left / right                                                                              |
| `j` / `k`                 | Move caret down / up line                                                                            |
| `w` / `e` / `b`           | Move by word (forward start / forward end / backward)                                                |
| `W` / `E` / `B`           | Big-word variants                                                                                    |
| `0` / `^` / `$`           | Move to line start / first non-blank (approx) / line end                                             |
| `gg`                      | Jump to first line                                                                                   |
| `G`                       | Jump to last line                                                                                    |
| `3j` (example)            | Count prefix for motions (repeat 3 times)                                                            |
| `3G` / `12gg`             | Count prefix to jump to a specific line number                                                       |
| `x`                       | Delete character at caret                                                                            |
| `dd`                      | Delete current line                                                                                  |
| `yy`                      | Yank current line to clipboard                                                                       |
| `dw` / `de` / `db` / `d$` | Delete by motion (word/word-end/back-word/to line end)                                               |
| `yw` / `ye` / `yb` / `y$` | Yank by motion                                                                                       |
| `cw` / `ce` / `c$`        | Change by motion (delete range and enter Insert mode)                                                |
| `diw` / `yiw` / `ciw`     | Inner-word text object (delete/yank/change)                                                          |
| `p` / `P`                 | Paste last yanked/deleted text after / before caret                                                  |
| `u` / `Ctrl+r`            | Undo / redo bridge                                                                                   |
| `<space>...`              | Main-window leader bindings are available in note Normal mode (for example `<space>fn`, `<space>ff`) |
| `Shift+J` / `Shift+K`     | Switch to previous / next tab from note Normal mode                                                  |

`dd`, `yy`, and `x` support count prefixes (for example `3dd`, `5yy`, `4x`).
Operator+motion combos also support counts (for example `3dw`, `2y$`).
`p` and `P` use the plugin's internal note register (updated by `yy` and `dd`).

#### Library tree navigation (left pane)

These bindings act on Zotero's native left pane (collection tree and item
list) when that pane has focus.

| Key         | Action                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `j` / `k`   | Move selection down / up (collections tree and item list)                                                            |
| `gg` / `G`  | Jump to the first / last row                                                                                         |
| `h`         | In item list, move focus back to collection tree; in collection tree, collapse selected collection or jump to parent |
| `l`         | In collection tree, expand selected collection; if already expanded or a leaf, move focus into item list             |
| `Enter`     | In collection tree, move focus into item list; in item list, open the selected item/PDF                              |
| `Backspace` | Jump to parent collection                                                                                            |
| `dd` / `x`  | Move selected item rows to Zotero Trash                                                                              |
| `u`         | Restore the last item batch trashed by Neo                                                                           |
| `za`        | Toggle expand/collapse for the currently selected collection row                                                     |
| `zo`        | Expand the current collection row (if already open, keep it open)                                                    |
| `zc`        | Collapse the current collection row (if already closed, keep it closed)                                              |
| `R`         | Expand all collections in the current library tree                                                                   |
| `M`         | Collapse all collections in the current library tree                                                                 |

#### Main window `<space>` chords

These bindings work in the main Zotero window (not inside the reader), on
whatever has focus:

| Key         | Action                                                  |
| ----------- | ------------------------------------------------------- |
| `<space>ff` | Fuzzy picker over all items in the current library      |
| `<space>fc` | Fuzzy picker over items in the current collection       |
| `<space>fn` | Search all notes in the shared picker                   |
| `<space>ft` | Open tab picker                                         |
| `<space>fT` | Open tag picker for the current collection/library view |
| `<space>td` | Close the active Zotero tab                             |
| `<space>e`  | Focus the collection tree                               |
| `<space>yy` | Copy the selected item's citekey to the clipboard       |
| `<space>o`  | Open the selected item's PDF                            |
| `<space>wh` | Focus the collection tree (left pane)                   |
| `<space>wl` | Focus the detail pane (right pane)                      |
| `<space>ww` | Focus the item list (middle pane)                       |

#### Viewport positioning (like Vim's z commands)

| Key  | Action                                                      |
| ---- | ----------------------------------------------------------- |
| `zt` | Scroll so the current page is at the **top** of the view    |
| `zz` | Scroll so the current page is at the **centre** of the view |
| `zb` | Scroll so the current page is at the **bottom** of the view |

#### Search

| Key      | Action                            |
| -------- | --------------------------------- |
| `/`      | Open the PDF find bar             |
| `n`      | Jump to the next search match     |
| `N`      | Jump to the previous search match |
| `Escape` | Clear / close search              |

Search works like Vim: press `/` to open Zotero's find bar, type your query
(results highlight as you type), then press `Enter` — focus returns to the
PDF automatically and `n` / `N` cycle through the matches while the result
counter stays visible. Press `/` again to reopen the find bar with your
previous query selected. `Escape` closes the find bar and clears the
highlights. Pressing `n` / `N` without an active search shows a hint to
search first.

#### Sidebar filter by colour

| Key  | Action                                     |
| ---- | ------------------------------------------ |
| `Zy` | Filter sidebar → Yellow annotations only   |
| `Zr` | Filter sidebar → Red annotations only      |
| `Zg` | Filter sidebar → Green annotations only    |
| `Zb` | Filter sidebar → Blue annotations only     |
| `Zp` | Filter sidebar → Purple annotations only   |
| `Za` | Clear colour filter (show all annotations) |

> **Tip:** `z` (lowercase) acts _on_ an annotation (recolour). `Z` (uppercase) acts _on the sidebar view_ (filter).

#### Annotation navigation and editing

Use `[` and `]` to move between annotations. The selected annotation is
highlighted in the PDF and scrolled to in the sidebar.

| Key     | Action                                                       |
| ------- | ------------------------------------------------------------ |
| `[`     | Jump to previous annotation                                  |
| `]`     | Jump to next annotation                                      |
| `Enter` | Open the selected annotation's comment field for editing     |
| `i`     | Enter Insert mode **and** focus the annotation comment field |
| `y`     | Copy the annotation's **highlighted text** to the clipboard  |
| `yy`    | Copy the annotation's **comment text** to the clipboard      |
| `dd`    | Delete the selected annotation                               |
| `zy`    | Change annotation colour → Yellow                            |
| `zr`    | Change annotation colour → Red                               |
| `zg`    | Change annotation colour → Green                             |
| `zb`    | Change annotation colour → Blue                              |
| `zp`    | Change annotation colour → Purple                            |

> **Tip:** `y` vs `yy` — the plugin waits up to 800 ms for the second `y`
> before firing the single-`y` action. Typing `yy` quickly always wins.

#### Mode switches

| Key | Action            |
| --- | ----------------- |
| `v` | Enter Visual mode |
| `c` | Enter Cursor mode |
| `i` | Enter Insert mode |

---

### Cursor mode

Enter Cursor mode with `c` from Normal mode.
After pressing `c`, the plugin shows **hint badges** (yellow letter labels) at
sentence starts across the visible page. Picking a sentence badge opens
**word-level hints** inside that sentence: the sentence's own badge keeps its
label, so pressing the same label again places the caret exactly at the
sentence start, and every other label places the caret at that word.

#### Hint picking

- Labels are uppercase; you type lowercase keys (matched case-insensitively).
- With more candidates than letters, labels grow to two characters.
- As you type, the consumed letters dim and non-matching badges disappear;
  a complete label — or input that uniquely matches one badge — activates
  immediately.
- `Backspace` removes the last typed letter. `Escape` returns from word
  hints to sentence hints; another `Escape` exits to Normal mode.

#### Caret movement

| Key             | Action                                                 |
| --------------- | ------------------------------------------------------ |
| `j` / `k`       | Move caret down / up by one visual line                |
| `h` / `l`       | Move caret left / right by one character               |
| `w`             | Move caret forward by one word                         |
| `W`             | Move caret forward by one WORD (non-whitespace chunk)  |
| `b`             | Move caret backward by one word                        |
| `B`             | Move caret backward by one WORD (non-whitespace chunk) |
| `0` / `$`       | Move caret to line start / line end                    |
| `2w`, `3b`, ... | Count prefix repeats the motion                        |

> **Multi-column papers:** text flows column by column — `j` at the bottom
> of a column wraps to the next column's first line on the same page (`k`
> back the other way), then continues into the next page's first column.
> Page headers/footers are treated as decoration and skipped: a caret never
> lands on them, so `j`/`k` cannot stall there. `0`/`$` stay within the
> column; `h`/`l`/`w`/`b` follow the reading flow across column breaks.

#### Mode switches

| Key           | Action                                                              |
| ------------- | ------------------------------------------------------------------- |
| `a..z` (hint) | Pick a sentence hint, then a word hint inside it to place the caret |
| `v`           | Enter Visual mode from current caret                                |
| `Escape`      | Exit to Normal mode                                                 |

---

### Visual mode

Enter Visual mode with `v` from Normal mode. If there is no existing text
selection, the plugin shows **hint badges** (yellow letter labels) at sentence
starts across the visible page. Pressing a sentence label opens **word-level
hints** inside that sentence: the sentence's own badge keeps its label, so
pressing the same label again anchors the selection exactly at the sentence
start, while any other label anchors it at that word. The selection then
grows as you press movement keys.

Hint picking works like Cursor mode: uppercase labels (type lowercase),
two-character labels when needed, typed letters dim while non-matching badges
disappear, `Backspace` steps back, and `Escape` returns from word hints to
sentence hints (then to Normal mode).

#### Selection movement

| Key       | Action                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `j` / `k` | Extend selection down / up by one line                                                                                                                  |
| `h` / `l` | Extend selection left / right by one character                                                                                                          |
| `w` / `b` | Extend selection forward / backward by one word                                                                                                         |
| `0` / `$` | Extend selection to line start / line end                                                                                                               |
| `)` / `(` | Extend selection to next / previous sentence start                                                                                                      |
| `}` / `{` | Extend selection to paragraph end / start                                                                                                               |
| `o`       | **Swap anchor and focus** — jump to the opposite end of the selection (like Vim's `o` in Visual mode); subsequent movement keys extend from the new end |

#### Creating annotations

| Key  | Action                                                               |
| ---- | -------------------------------------------------------------------- |
| `zy` | Create a **yellow** highlight                                        |
| `zr` | Create a **red** highlight                                           |
| `zg` | Create a **green** highlight                                         |
| `zb` | Create a **blue** highlight                                          |
| `zp` | Create a **purple** highlight                                        |
| `za` | Add a **note** annotation (creates highlight + opens comment editor) |
| `i`  | Same as `za` (quick note + enter Insert on comment)                  |

#### Copying text

| Key  | Action                                                                 |
| ---- | ---------------------------------------------------------------------- |
| `y`  | Copy the **current selection** to the clipboard                        |
| `yy` | Copy the **whole paragraph** containing the selection to the clipboard |
| `#`  | Open the find bar and search for the **current selection**             |

All copy operations apply Unicode NFKC normalisation (resolves ligatures such
as `ﬁ` → `fi`) and collapse PDF line-break newlines into spaces.

#### Exiting Visual mode

| Key      | Action                                 |
| -------- | -------------------------------------- |
| `v`      | Exit to Normal mode (clears selection) |
| `Escape` | Exit to Normal mode (clears selection) |

---

### Insert mode

In Insert mode every key is passed through to Zotero unchanged. This is
useful when you need to type into Zotero's own UI elements without the vim
bindings intercepting your keystrokes.

When `i` is pressed in Normal mode while an annotation is selected (via `[`/`]`),
the plugin enters Insert mode and opens **its own comment overlay** over the
PDF — a floating input box rendered inside the PDF view (the only place that
receives the OS keyboard focus, so typing and IME composition work natively).
The annotation's existing comment is pre-filled; the quoted text is shown as
context. Zotero's own popup is not used at all.

| Key      | Action                                                                      |
| -------- | --------------------------------------------------------------------------- |
| `Enter`  | New line in the comment                                                     |
| `Escape` | Save as the official annotation comment and close the overlay → Normal mode |

The comment is also autosaved 2 seconds after the last keystroke, and `visual i`
(add note) opens the same overlay for the newly created annotation.

Zotero's own annotation popup and sidebar comment fields remain fully usable
for mouse editing: clicking into either while the overlay is open saves and
closes the overlay and hands over to the native editor (Escape inside native
editors keeps its Zotero behavior).

> **Note:** if pressing `i` shows a red `✗` status instead, the plugin writes
> detailed diagnostics to `zotero-neo-startup.log` in your Zotero profile directory
> (`%APPDATA%\Zotero\Zotero\Profiles\...` on Windows).

---

## Annotation workflow

### Creating a highlight from scratch

1. Press `v` to enter Visual mode.
2. Press the hint label shown at the desired sentence start — optionally
   refine with a second (word-level) label to anchor at an exact word —
   or press `j`/`k` to begin from the current position.
3. Extend the selection with `j`/`k`/`w`/`b`/`)`/`}`/`h`/`l`.
4. Use `o` to jump to the other end of the selection if you need to trim the
   start rather than extend the end.
5. Press `zy`/`zr`/`zg`/`zb`/`zp` to create a coloured highlight, or `za` to
   add a note.

### Navigating and editing existing annotations

1. Press `]` / `[` to move to the next / previous annotation. The annotation
   is highlighted in the PDF viewer and the sidebar scrolls to its card.
2. Press `y` to copy the highlighted text, `yy` to copy the comment.
3. Press `i` (or `Enter`) to open the comment overlay and type a note.
   The plugin's own floating input box appears over the PDF with the comment
   pre-filled and the highlighted text quoted as context (Zotero's popup is
   not used). Press `Enter` for a new line, `Escape` to save and return to
   Normal mode.
4. Press `dd` to delete the annotation.

---

## Customising keybindings

Open **Edit → Preferences** (macOS: **Zotero → Settings**) and navigate to the
**Zotero Neo** tab.

- Every row in the **Keybindings** table maps a _mode + key sequence_ to an
  _action_.
- Click the key sequence cell to edit it directly.
- Key sequences preserve case: `b` and `B` are different. Use prefixes such as
  `ctrl+` for modified keys.
- Multi-key sequences such as `gg`, `zy`, or `yy` are supported.
- Click **+ Add binding** to add a new row; click **×** to remove one.
- Click **Apply bindings** to save keybinding changes.
- Appearance, key guide, highlight colour, mode, marks and scroll settings save automatically on change.
- Note editor Vim mode can be turned on or off independently from the Preferences panel.
- Click **Reset to defaults** to restore all bindings to their defaults.

The preferences pane is registered with a stable pane id, so the panel opens
directly on the last-used section even after a restart, and its dropdowns use
native Zotero `menulist` controls to stay reliable on every open. Init
failures are reported to `zotero-neo-startup.log` in the profile directory with
`[prefs]`-prefixed lines.

### Action reference

| Action                        | Description                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `scrollDown`                  | Scroll down by the configured step                                                   |
| `scrollUp`                    | Scroll up by the configured step                                                     |
| `scrollLeft`                  | Scroll left by the configured step                                                   |
| `scrollRight`                 | Scroll right by the configured step                                                  |
| `zoomIn`                      | Zoom in one Zotero Reader step                                                       |
| `zoomOut`                     | Zoom out one Zotero Reader step                                                      |
| `zoomReset`                   | Reset zoom / fit page width                                                          |
| `halfPageDown`                | Scroll down half a viewport                                                          |
| `halfPageUp`                  | Scroll up half a viewport                                                            |
| `fullPageDown`                | Scroll down a full viewport                                                          |
| `fullPageUp`                  | Scroll up a full viewport                                                            |
| `scrollTop`                   | Reposition view so current page is at top                                            |
| `scrollCenter`                | Reposition view so current page is centred                                           |
| `scrollBottom`                | Reposition view so current page is at bottom                                         |
| `prevPage`                    | Previous page                                                                        |
| `nextPage`                    | Next page                                                                            |
| `firstPage`                   | First page                                                                           |
| `lastPage`                    | Last page                                                                            |
| `openSearch`                  | Open find bar                                                                        |
| `findNext`                    | Jump to next search match                                                            |
| `findPrevious`                | Jump to previous search match                                                        |
| `clearSearch`                 | Close / clear find bar                                                               |
| `prevAnnotation`              | Jump to previous annotation                                                          |
| `nextAnnotation`              | Jump to next annotation                                                              |
| `editAnnotation`              | Focus annotation comment field (Enter)                                               |
| `deleteAnnotation`            | Delete selected annotation                                                           |
| `filterYellow`                | Filter sidebar to Yellow annotations only                                            |
| `filterRed`                   | Filter sidebar to Red annotations only                                               |
| `filterGreen`                 | Filter sidebar to Green annotations only                                             |
| `filterBlue`                  | Filter sidebar to Blue annotations only                                              |
| `filterPurple`                | Filter sidebar to Purple annotations only                                            |
| `filterClear`                 | Clear colour filter (show all annotations)                                           |
| `recolorYellow`               | Change selected annotation colour to Yellow                                          |
| `recolorRed`                  | Change selected annotation colour to Red                                             |
| `recolorGreen`                | Change selected annotation colour to Green                                           |
| `recolorBlue`                 | Change selected annotation colour to Blue                                            |
| `recolorPurple`               | Change selected annotation colour to Purple                                          |
| `yankAnnotation`              | Copy annotation highlighted text                                                     |
| `yankAnnotationComment`       | Copy annotation comment text                                                         |
| `enterVisual`                 | Enter Visual mode                                                                    |
| `enterCursor`                 | Enter Cursor mode                                                                    |
| `enterInsert`                 | Enter Insert mode (also focuses comment if annotation selected)                      |
| `exitMode`                    | Return to Normal mode                                                                |
| `extendDown`                  | Extend selection down one line                                                       |
| `extendUp`                    | Extend selection up one line                                                         |
| `extendLeft`                  | Extend selection left one character                                                  |
| `extendRight`                 | Extend selection right one character                                                 |
| `extendWordForward`           | Extend selection to next word                                                        |
| `extendWordBackward`          | Extend selection to previous word                                                    |
| `extendLineStart`             | Extend selection to start of current line                                            |
| `extendLineEnd`               | Extend selection to end of current line                                              |
| `extendSentenceForward`       | Extend selection to next sentence start                                              |
| `extendSentenceBackward`      | Extend selection to previous sentence start                                          |
| `extendParagraphForward`      | Extend selection to end of current paragraph                                         |
| `extendParagraphBackward`     | Extend selection to start of current paragraph                                       |
| `highlightYellow`             | Create yellow highlight                                                              |
| `highlightRed`                | Create red highlight                                                                 |
| `highlightGreen`              | Create green highlight                                                               |
| `highlightBlue`               | Create blue highlight                                                                |
| `highlightPurple`             | Create purple highlight                                                              |
| `addNote`                     | Add note annotation                                                                  |
| `copySelection`               | Copy current selection to clipboard                                                  |
| `searchSelection`             | Open find bar and search for current selection                                       |
| `yankParagraph`               | Copy whole paragraph to clipboard                                                    |
| `swapVisualEnds`              | Swap selection anchor and focus                                                      |
| `cursorDown`                  | Move caret down one visual line (Cursor mode)                                        |
| `cursorUp`                    | Move caret up one visual line (Cursor mode)                                          |
| `cursorLeft`                  | Move caret left one character (Cursor mode)                                          |
| `cursorRight`                 | Move caret right one character (Cursor mode)                                         |
| `cursorWordForward`           | Move caret forward one word (Cursor mode)                                            |
| `cursorBigWordForward`        | Move caret forward one WORD (Cursor mode)                                            |
| `cursorWordBackward`          | Move caret backward one word (Cursor mode)                                           |
| `cursorBigWordBackward`       | Move caret backward one WORD (Cursor mode)                                           |
| `mainTabPick`                 | Open the shared picker for currently open Zotero tabs                                |
| `mainNotesLayout`             | Search notes in the shared list/preview picker                                       |
| `mainFuzzyAll`                | Open the shared picker over all items in the current library                         |
| `mainFuzzyCollection`         | Open the shared picker over items in the current collection                          |
| `mainYankCitekey`             | Copy the selected item's citekey to the clipboard                                    |
| `mainOpenPDF`                 | Open the selected item's PDF                                                         |
| `mainTrashItems`              | Move selected main item-list rows to Zotero Trash                                    |
| `mainRestoreTrashedItems`     | Restore the last item batch trashed by Neo                                           |
| `mainClosePDF`                | Close the active Zotero tab                                                          |
| `mainPrevTab`                 | Switch to the previous open tab                                                      |
| `mainNextTab`                 | Switch to the next open tab                                                          |
| `mainFocusTree`               | Focus the collection tree (left pane)                                                |
| `mainFocusItems`              | Focus the item list (middle pane)                                                    |
| `mainFocusLeft`               | Focus the collection tree (left pane)                                                |
| `mainFocusRight`              | Focus the detail pane (right pane)                                                   |
| `mainTagPicker`               | Open the shared tag filter picker                                                    |
| `mainNavDown`                 | Move selection down (collections tree / item list)                                   |
| `mainNavUp`                   | Move selection up (collections tree / item list)                                     |
| `mainNavFirst`                | Jump to the first row                                                                |
| `mainNavLast`                 | Jump to the last row                                                                 |
| `toggleReaderSidebarOutline`  | Toggle the custom outline explorer overlay                                           |
| `focusReaderSidebar`          | Focus or reopen the custom outline explorer overlay                                  |
| `toggleReaderSplitHorizontal` | Toggle reader horizontal split view                                                  |
| `toggleReaderSplitVertical`   | Toggle reader vertical split view                                                    |
| `focusReaderSplitLeft`        | Focus left split pane (or toggle in horizontal split)                                |
| `focusReaderSplitDown`        | Focus lower split pane (or toggle in vertical split)                                 |
| `focusReaderSplitUp`          | Focus upper split pane (or toggle in vertical split)                                 |
| `focusReaderSplitRight`       | Focus right split pane (or toggle in horizontal split)                               |
| `mainActivate`                | In collections, enter the item list; in items, open the selected item/PDF            |
| `mainTreeToggle`              | Toggle expand/collapse for the selected collection                                   |
| `mainTreeOpenOnly`            | Expand the selected collection without changing pane                                 |
| `mainTreeCloseOnly`           | Collapse the selected collection without moving to parent                            |
| `mainTreeExpand`              | Expand selected collection or move focus into the item list                          |
| `mainTreeCollapse`            | Collapse selected collection, move to parent, or return focus to the collection tree |
| `mainTreeParent`              | Move selection to parent collection                                                  |
| `mainTreeExpandAll`           | Expand all collections in the left tree                                              |
| `mainTreeCollapseAll`         | Collapse all collections in the left tree                                            |

---

## Settings

| Setting                  | Default                  | Description                                                                                                                               |
| ------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Appearance               | Auto                     | Auto follows Zotero's computed Light/Dark palette; Light and Dark force all Neo-owned panels without recolouring PDF pages or annotations |
| Enable Visual mode       | on                       | Allow entering Visual mode with `v`                                                                                                       |
| Enable Cursor mode       | on                       | Allow entering Cursor mode with `c`                                                                                                       |
| Enable Insert mode       | on                       | Allow entering Insert mode with `i`                                                                                                       |
| Note editor Vim mode     | on                       | Enable Vim-style editing in note editors (context pane and note tabs)                                                                     |
| Scroll mode              | Constant-speed scrolling | Step / Constant-speed / Accelerating — only the active mode's parameters are shown                                                        |
| Scroll step              | 60 px                    | Pixels scrolled per `j`/`k`/`H`/`L` keypress (step mode; count prefixes like `3j` always use this)                                        |
| Scroll speed             | 2000 px/s                | Constant hold-scroll speed (constant-speed mode)                                                                                          |
| Smooth initial speed     | 2000 px/s                | Starting speed for hold-based smooth scrolling (accelerating mode)                                                                        |
| Smooth max speed         | 2000 px/s                | Maximum hold-scroll speed (accelerating mode)                                                                                             |
| Smooth acceleration      | 2600 px/s²               | Speed increase while holding a scroll key (accelerating mode)                                                                             |
| Smooth deceleration      | 4200 px/s²               | Speed decrease after key release (accelerating mode)                                                                                      |
| Stop on release          | off                      | If enabled, stop immediately when key is released (accelerating mode)                                                                     |
| Persist marks            | off                      | Save marks in the parent item's Extra field (`zv-marks-<attachmentKey>`) so they survive restarts and sync                                |
| Default highlight colour | Yellow                   | Colour used when no explicit colour key is pressed                                                                                        |
| Key guide                | on                       | Show valid Space-leader continuations in Reader, Main, and Note Normal contexts                                                           |
| Key guide delay          | 200 ms                   | Delay before the continuation panel appears; configurable from 0 to 1000 ms                                                               |
| Key guide font size      | 15 px                    | Continuation panel text size; configurable from 12 to 24 px                                                                               |

Appearance, key guide, and scroll settings save automatically on change.

- **Step scrolling** moves instantly by the scroll step per `j`/`k`/`H`/`L` press.
- **Constant-speed scrolling** glides at a fixed speed while a scroll key is
  held and stops immediately on release.
- **Accelerating (trapezoid curve) scrolling** ramps from `initial speed` to
  `max speed` while held, then decelerates after release (unless _stop on
  release_ is enabled). With `initial speed` and `max speed` both set to
  `2000`, it behaves like the constant-speed mode with a gentle glide on
  release.

---
