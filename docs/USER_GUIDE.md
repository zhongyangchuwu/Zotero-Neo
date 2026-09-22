# Zotero Neo User Guide

This guide describes the current candidate bindings and settings. Planned additions remain
unavailable until their owning feature is implemented and verified.

## Contents

- [Modes](#modes)
- [Default keybindings](#default-keybindings)
- [Annotation workflow](#annotation-workflow)
- [Customising keybindings](#customising-keybindings)
- [Settings](#settings)

---

## Modes

The plugin has three user-facing Reader states. Flash is a temporary targeting motion inside
the Select workflow rather than a separate mode.

| Mode       | Indicator | Purpose |
| ---------- | --------- | ------- |
| **Normal** | _(hidden)_ | Reading, navigation, and existing-annotation commands |
| **Select** (internal name: Visual) | `SELECT · …` | Select PDF text, refine endpoints, and run actions |
| **Insert** | `-- INSERT --` | Native/comment text input |

Mode transitions:

```
Normal ──v──▶ Flash start ──target──▶ Select ──v/Escape──▶ Normal
                                      │
                                      └──s──▶ Flash endpoint ──target──▶ Select
Normal ──i──▶ Insert ──Escape────────────────────────────▶ Normal
```

---

## Default keybindings

### Normal mode

#### Scrolling

| Key      | Action         |
| -------- | -------------- |
| `j`      | Scroll down    |
| `k`      | Scroll up      |
| `zh`     | Scroll left    |
| `zl`     | Scroll right   |
| `Ctrl+d` | Half-page down |
| `Ctrl+u` | Half-page up   |
| `Ctrl+f` | Full-page down |
| `Ctrl+b` | Full-page up   |

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

| Key         | Action                                                                    |
| ----------- | ------------------------------------------------------------------------- |
| `h`         | Previous page                                                             |
| `l`         | Next page                                                                 |
| `gg`        | First page                                                                |
| `G`         | Last page                                                                 |
| `H`         | Switch to previous open tab                                               |
| `L`         | Switch to next open tab                                                   |
| `,`  | Choose and switch to an open Zotero tab                                   |
| `q`  | Close the active Zotero tab                                               |
| `fn` | Search all notes in the shared picker (left: note titles, right: preview) |
| `pp` | Open the persistent Plugin Manager panel |

Count prefixes repeat the page turn (`3l` = three pages forward) and `gg`/`G`
with a count jump to that page number (`5G` / `5gg` = page 5).

### Prefix Guide

The guide follows any pending multi-key prefix in the active resolved keymap.
Reader and Note still use Space-led command groups, while Main uses direct
prefixes such as `f`, `t`, `p`, `w`, and `y`. Pause after the first key to
show the small bottom-center list of valid continuations. Remaps appear without a
second display-only keymap.

- The guide is enabled by default and appears after 200 ms; its delay and
  15 px default font size are configurable under **Preferences → Key guide**.
- Letter labels preserve case: `b` and `B` are distinct bindings.
- It updates after nested prefixes such as `<space>f` in Reader/Note or `f` / `t` in Main.
- `Escape` cancels the pending sequence. `Backspace` returns to the previous
  pending prefix; at the root it closes the guide.
- It never appears in Insert mode, native/editor text input, picker input, or
  other Neo-owned modal input.

Only working commands are shown; unsupported commands are omitted until their
owning features are available.

#### Normal command palette

Press `:` in Reader Normal, Main Normal, or Note Normal to open the command palette.
It uses the shared picker surface: a query field, filtered command rows, a preview, and
the current key hints. There is no `<space>:` alias.

- The palette lists every command that can execute in the current Reader, Main, or Note context, whether or not it has a key binding. Commands without a binding are labeled **Unbound** and remain executable from the palette.
- Key hints come only from the current resolved bindings, so custom remaps appear immediately; unbound commands have no key hint, and action descriptions do not contain stale shortcut text.
- Use `↑` / `↓`, `j` / `k`, or `Ctrl+j` / `Ctrl+k` to select, `Enter` to run, and
  `Escape` to close and restore the previous focus. A selected action runs in the
  originating Reader, Main, or Note context after the palette closes.
- The initial palette is query-only: it accepts no command arguments, counts, scopes,
  history, Spotlight commands, or external registrations. `3:` may open it, but the
  selected action runs with its ordinary uncounted behavior.

When **Preferences → Picker → Enable mouse row selection and double-click confirmation**
is enabled, chooser and command rows also support pointer selection and double-click
confirmation.

#### Plugin Manager panel

Press `pp` in Reader/Note Normal, or `pp` in Main Normal, to open Neo's persistent
Plugin Manager panel. Unlike a picker, this surface stays open while you browse installed
plugins and inspect their state. Zotero/Mozilla AddonManager remains the authoritative
source for plugin lifecycle state.

- `j` / `k` or `↑` / `↓`: move through installed plugins.
- `Ctrl+d` / `Ctrl+u`: move quickly through the list.
- `gg` / `G`: first / last plugin.
- `/`: focus the fuzzy filter field; `Escape` leaves the field without closing the panel.
- `r`: reload installed plugin state from AddonManager.
- `Escape` / `q`: close the panel and restore the previous focus when possible.

The panel shows plugin name, version, ID, enabled/disabled state, and the lifecycle actions
that Zotero currently allows for the selected plugin.

- `e`: enable the selected plugin when AddonManager exposes the enable permission.
- `d`: disable the selected plugin when AddonManager exposes the disable permission.
- `p`: open the selected plugin's Zotero settings pane when that plugin has registered one
  through `Zotero.PreferencePanes`.
- `o`: open the plugin homepage declared by AddonManager.
- `R`: open README when the declared homepage can be unambiguously mapped to a GitHub repository.
- `L`: open the GitHub commit history for that repository.
- Zotero Neo deliberately cannot disable itself from inside its own manager; use Zotero's native
  Plugins surface for that escape hatch.

The details pane also shows the description declared by the installed plugin plus available
Homepage / Repository / README / Git log links. Plugin Manager does not fetch README or commit
content when it opens; those links are opened explicitly in the external browser.

The panel always re-reads lifecycle state from AddonManager after a mutation. Update, local-XPI
install, uninstall, and remote plugin discovery remain follow-up work rather than picker commands.

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

#### Select text with Flash

| Key | Action |
| --- | ------ |
| `v` | Start a text selection; with no existing mouse selection this opens Flash for the start target |
| `s` in Select | Flash to a distant endpoint while preserving the current anchor |

Press `v`, type a literal query (including Unicode/CJK through the system IME), then choose the displayed label. The whole matched
query becomes the initial selection, so there is no intermediate caret mode. Flash updates the visible
match count on every keystroke. When at most 48 targets remain, labels appear immediately; larger
result sets show the count plus `type more` and skip per-target geometry until the query narrows.
Label first letters cannot be valid next characters of the current matches, so continuing the query and
choosing a label remain unambiguous. `Enter` chooses the nearest labelled target and `Escape` cancels.

Once Select is active, `h/l/w/b/j/k/0/$/(/)/{/}` refine the range and `o` swaps the active end.
Press `s` to use Flash for the other endpoint. Desktop Zotero keeps ordinary DOM selection
transparent because its mouse-selection renderer is driven by private semantic ranges. While Select
owns a keyboard-created DOM range, Neo enables the same blue selection colour used by Zotero/PDF.js
for native text selection, without adding a second endpoint caret. The persistent `SELECT` indicator
remains the mode cue and shows the selected character count plus direct-action hints.

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

#### Shared target chooser

Neo uses one narrow candidate surface for target resolution. The user intent is
chosen first; the chooser only answers which object/tag that action should use.

| Key | Intent |
| --- | --- |
| `ff` | Find and open an item in the current library |
| `fc` | Find and open an item in the current collection |
| `fn` | Find and open a note in the active library |
| `,` | Switch to an already-open Zotero tab |
| `ta` | Add one chosen tag to the current target(s) |
| `tr` | Remove one chosen tag from the current target(s) |
| `tf` | Main only: toggle one chosen tag filter |
| `tc` | Main only: clear all tag filters directly |
| `ca` | Main only: add EffectiveSelection (or Cursor fallback) to one chosen collection |
| `cr` | Main only: remove EffectiveSelection (or Cursor fallback) from one chosen collection |

The shared surface owns query input, fuzzy ranking, highlighted-row navigation,
preview, IME/composition handling, confirmation, and cancellation. It does not
provide provider-local create/delete/yank/open command grammars.

Common controls:

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move the highlighted result |
| `j` / `k` | Move the highlighted result while focus is outside the query input |
| `Ctrl+j` / `Ctrl+k` | Move the highlighted result down / up |
| `Ctrl+d` / `Ctrl+u` | Scroll the preview down / up |
| `Enter` | Confirm the highlighted terminal candidate |
| `Shift+Enter` | Confirm with the alternate open-in-window presentation when the invoking action supports it |
| Type | Edit/filter the focused query input |
| `Escape` | Close the chooser |

Result rows are keyboard-first by default. Enable **Preferences → Picker →
Enable mouse row selection and double-click confirmation** to let a single click
select a row and a double-click confirm it. Hover remains inert.

Item and collection-item choosers only resolve an item. PDF opening and citekey
copying remain separate semantic actions rather than hidden chooser commands.

##### Tag actions and tag candidates

`ta` and `tr` are available from Main, Reader, and Note when a
taggable target set can be resolved. `ta` searches existing tags and can offer
an explicit `+ Create "..."` candidate. `tr` lists only tags currently
assigned to at least one target. For multi-item targets the preview may show
all/mixed assignment metadata, but the action itself remains explicit: add means
ensure-present; remove means ensure-absent.

Main-only `tf` uses the same candidate surface to toggle one member of
Zotero's native tag-filter set, then closes. Active filters use Zotero's native
**AND** semantics. `tc` clears all filters without opening a chooser.

Virtual tag namespaces such as `method/` may appear as non-terminal refinement
candidates when `tags.separator` is configured. Confirming a namespace narrows
the query; it never mutates item data.

See [Selection and Tag Actions](TAGS.md) for target-resolution and persistence
semantics.

##### Collection membership

`ca` and `cr` use the Main EffectiveSelection contract: an explicit Neo
Selection wins; otherwise the current Cursor is the target. Child
attachments/notes are normalized with Zotero's native top-level-item semantics.

The target set must resolve to one library. Neo then opens the shared chooser
with only collections from that library. Before applying the confirmation, Neo
re-resolves the item identities; if the workset changed while the chooser was
open, the entire batch is refused.

`ca` skips items already in the destination and `cr` skips items already
absent. Membership changes do not redefine Neo Selection.

##### Notes

`fn` searches normalized note titles and note body content. Notes related
to the current item are grouped ahead of the remaining notes in the active
library. Confirming a note opens it through Zotero; `Shift+Enter` requests the
alternate window presentation.

Note creation, deletion, restore, yank, and editing are not a second grammar
inside the chooser. Note editor Normal/Insert operations use the shared binding
engine in the editor itself.

#### Outline explorer

| Key                 | Action                                                   |
| ------------------- | -------------------------------------------------------- |
| `e`          | Toggle custom outline explorer overlay                   |
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
  field** (syncs via Zotero sync — attachments do not expose the bibliographic Extra field used here,
  so the parent item is used; multiple PDFs under one item get separate
  lines), falling back to a device-local pref. The status bar shows which
  backend was used (`· saved (extra)` / `· saved (local)`). Marks from the
  previous annotation-tag scheme are migrated automatically.
- Marks set with persistence disabled live for the current reader session only.

#### Note editor (context pane and standalone note tab)

When a Zotero note editor has focus (right-side context pane or a standalone
note tab), Neo uses the same binding/count/sequence engine as Reader and Main.
Note DOM editing remains owned by the Note editor integration; unbound keys in
Note Insert stay native to Zotero/browser editing.

| Key | Action |
| --- | --- |
| `i` | Enter Note Insert; ordinary typing passes through natively |
| `a` / `A` / `I` | Enter Insert at next char / line end / line start |
| `o` / `O` | Open line below / above and enter Insert |
| `Escape` | Return to Note Normal |
| `h` / `l` | Move caret left / right |
| `j` / `k` | Move caret down / up one line |
| `w` / `b` | Move to next / previous word |
| `0` / `$` | Move to line start / line end |
| `gg` / `G` | Jump to document start / end |
| `3j` / `4x` (examples) | Counted motion / repeated character deletion |
| `x` | Delete character at caret |
| `dd` / `yy` | Delete / yank current line |
| `dh/dj/dk/dl` | Delete through the corresponding character/line motion |
| `dw` / `db` / `d0` / `d$` | Delete through word/back-word/line-start/line-end motion |
| `yh/yj/yk/yl` | Yank through the corresponding character/line motion |
| `yw` / `yb` / `y0` / `y$` | Yank through word/back-word/line-start/line-end motion |
| `ch/cj/ck/cl` | Change through the corresponding character/line motion and enter Insert |
| `cw` / `cb` / `c0` / `c$` | Change through word/back-word/line-start/line-end motion |
| `diw` / `yiw` / `ciw` | Delete / yank / change the current word |
| `p` / `P` | Paste the internal Note register after / before the caret |
| `u` / `Ctrl+r` | Undo / redo bridge |
| `<space>...` | Note Normal leader bindings; defaults mirror useful Main workflows such as `fn` and `ff` |
| `H` / `L` | Switch to previous / next tab |
| `Ctrl+h/j/k/l` | Directional pane/Reader focus when a target exists |
| `:` | Open the Note command palette |

Note bindings are independently configurable under the explicit `note-normal`
and `note-insert` scopes in **Preferences → Bindings**. Development builds from
the preceding binding schema migrate Note-visible Main shortcut overrides and
explicit unbindings into `note-normal`. Counts are currently applied to the
motions and repeated-character commands that consume them; line/operator count
semantics beyond that are not advertised as part of the 0.1.0 contract.
`p` and `P` use Neo's internal Note register, updated by yank/delete operations.

#### Library tree navigation (left pane)

These bindings act on Zotero's native left pane (collection tree and item
list) when that pane has focus.

| Key         | Action                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `j` / `k`   | Move Cursor down / up; single-scope collection navigation follows View, pinned/multi ScopeSet preserves its members |
| `gg` / `G`  | Jump to the first / last row                                                                                         |
| `h`         | In item list, move focus back to collection tree; in collection tree, collapse selected collection or jump to parent |
| `l`         | In collection tree, expand selected collection; if already expanded or a leaf, move focus into item list             |
| `Enter`     | In collection tree, collapse ScopeSet to ScopeCursor then enter items; in item list, open the Cursor item/PDF        |
| `Backspace` | Jump to parent collection                                                                                            |
| `dd` / `x`  | Move selected item rows to Zotero Trash                                                                              |
| `u`         | Restore the last item batch trashed by Neo                                                                           |
| `za`        | Toggle expand/collapse for the currently selected collection row                                                     |
| `zo`        | Expand the current collection row (if already open, keep it open)                                                    |
| `zc`        | Collapse the current collection row (if already closed, keep it closed)                                              |
| `R`         | Expand all collections in the current library tree                                                                   |
| `M`         | Collapse all collections in the current library tree                                                                 |

In the collection tree, `Space` builds Zotero's native ScopeSet without touching
Neo item Selection. With one selected scope it pins that scope and advances
ScopeCursor; subsequent Space presses toggle additional scope rows. While the
ScopeCursor is detached from ScopeSet or multiple scopes are selected,
`j/k/gg/G` move only ScopeCursor. `Enter` returns to a single scope at the
current ScopeCursor and enters the item list.

In Main Normal mode, `H` and `L` switch to the previous and next Zotero tabs.
`J` and `K` are not Neo defaults and remain available to native Zotero behavior.

#### Main window command prefixes

These bindings work in the main Zotero window, subject to the active capability
and focus context:

| Key | Action |
| --- | --- |
| `ff` | Find an item in the current library |
| `fc` | Find an item in the current collection |
| `fn` | Find and open a note |
| `fq` | Focus/select Zotero's native Quick Search field |
| `fa` | Open Zotero's native Advanced Search; convert current Quick Search text when present |
| `pp` | Open the persistent Plugin Manager panel |
| `,` | Choose and switch to an open Zotero tab |
| `q` | Close the active Zotero tab |
| `ta` | Add one tag to the current target(s) |
| `tr` | Remove one tag from the current target(s) |
| `tf` | Toggle one Main-window tag filter |
| `tc` | Clear all Main-window tag filters |
| `e` | Focus the collection tree |
| `yy` | Copy the selected item's citekey to the clipboard |
| `o` | Open the selected item's PDF |
| `wh` | Focus the collection tree (left pane) |
| `wl` | Focus the detail pane (right pane) |
| `ww` | Focus the item list (middle pane) |
| `gr` | Return to the last saved Main work context after an explicit reveal/navigation excursion |

#### Return context

Some explicit navigation actions, such as revealing a hidden Selection member
or choosing an item from the library-wide finder, may let Zotero change the
current scope or filters so the target becomes visible. Before those excursions,
Neo saves one Main return bookmark.

Press `gr` to restore the saved scope, Quick Search, tag predicates, Cursor,
tab, and pane focus where the corresponding host state remains available.
Selection itself is not replaced: the same Neo workset continues across reveal
and return.

This is a single-level bookmark, not a navigation history stack. If Zotero has
discarded an existing Advanced Search condition set, return reports partial
restoration instead of synthesizing a different query. Reader/Note close does
not trigger automatic return.

#### Main local find

Local find is Cursor navigation inside the item rows already visible in the
current Main View. It does not change Zotero Quick Search, tag filters,
collection scope, sort order, or Neo Selection.

| Key | Action |
| --- | --- |
| `/` | Open the local-find prompt for visible items |
| `n` | Repeat the last committed local find forward |
| `N` | Repeat the last committed local find backward |

Enter commits a non-empty query and moves Cursor to the next visible match,
wrapping once through the current row order. Matching is case-insensitive over
compact item metadata (title/display text, first creator, year, and citekey when
available). `Escape` cancels the prompt without replacing the previous query.
A miss leaves Cursor and the current View unchanged. This is deliberately
different from `ff` / `fc`: those open a fuzzy target chooser, while local
find is relative, repeatable Cursor motion. It is also different from `fq` and
`fa`: those edit Zotero's actual View through its native Quick/Advanced Search
interfaces, so they may change which item rows are visible.

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
| `Y`     | Copy the annotation's **comment text** to the clipboard      |
| `dd`    | Delete the selected annotation                               |
| `zy`    | Change annotation colour → Yellow                            |
| `zr`    | Change annotation colour → Red                               |
| `zg`    | Change annotation colour → Green                             |
| `zb`    | Change annotation colour → Blue                              |
| `zp`    | Change annotation colour → Purple                            |

#### Selection workflow

| Key | Action |
| --- | ------ |
| `v` | Start Select with Flash, or adopt an existing mouse selection |
| `s` | While selecting, Flash to the other endpoint |
| `Enter` / `a` | Open Selection Actions |
| `zy/zr/zg/zb/zp` | Create a coloured highlight directly |
| `za` / `i` | Create a highlight and open its comment editor |
| `y` | Copy the selected text |
| `#` | Search for the selected text |
| `o` | Swap selection anchor/focus |
| `v` / `Escape` | Cancel Select and return to Normal |

Selection Actions is a keyboard palette for lower-frequency or extensible operations rather than a
duplicate of every Select shortcut. Built-ins currently keep **Underline** and **Add note** in the palette;
coloured highlights stay on `zy/zr/zg/zb/zp`, copy stays on `y`, and search stays on `#`. If
**Translate for Zotero** is installed, **Translate** appears automatically and uses that plugin's public
translation API; its result stays in the palette and can be copied with `y`. Other plugins can add
actions through `Zotero.Neo.reader.registerSelectionAction(...)`, while custom scripts such as
Actions & Tags can read `Zotero.Neo.reader.getSelection()`.

Select `y` copies the Neo-owned DOM range directly. Desktop Zotero's native copy handler reads a
separate private semantic-range model, so invoking it for a keyboard-only DOM range would fail. Neo
therefore normalizes the selected text itself, converting PDF layout line breaks and other whitespace to
ordinary spaces before writing the clipboard.

The old PDF Cursor mode has been removed: a standalone caret had no useful PDF action surface, and
all text-oriented work now goes through one Select workflow.

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

1. Press `v` and type enough text to identify the selection start. Choose its Flash label; the whole
   matched query becomes selected immediately.
2. Refine locally with Select motions, or press `s` and Flash to the distant endpoint. Use `o` to
   swap which end is active.
3. Press `Enter`/`a` for Selection Actions, or use `zy`/`zr`/`zg`/`zb`/`zp` directly.
   Underline and translation are available from Selection Actions when supported.

### Navigating and editing existing annotations

1. Press `]` / `[` to move to the next / previous annotation. The annotation
   is highlighted in the PDF viewer and the sidebar scrolls to its card.
2. Press `y` to copy the highlighted text, `Y` to copy the comment.
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

- Every row in the **Keybindings** table maps a _mode + key sequence_ to an _action_. Multiple rows may bind keys to the same action.
- Edit the key sequence directly in its cell. Key sequences preserve case: `b` and `B` are different.
- Neo uses a Neovim-style notation for symbolic keys: `<C-d>`, `<Enter>`,
  `<Esc>`, `<S-Tab>`, `<F1>`, and `<Space>`. Printable characters remain
  literal, so `gg` is two `g` keys, `f1` is `f` then `1`, and the word
  `enter` is five printable letters. Only `<Enter>` means the Enter key.
- Symbolic tokens compose directly with printable sequences, for example
  `<C-d>g`. A literal `<` is written `<lt>`. Unmodified printable
  characters do not have an angle-bracket form, so `<f>` is intentionally
  invalid rather than becoming a second spelling of `f`.
- Click **+ Add binding** to insert a new row immediately below the table header. The row is visible at once, starts in Normal mode with an empty Key Sequence and no selected Action, and focuses/selects the Key Sequence field. Click **×** to remove a row; removing a row truly unbinds that mode-and-sequence once the change is applied.
- The native **Mode** menu is available on every row. Changing a row's Mode updates the Action choices to show only actions supported by that Mode.
- The Action selector is searchable by localized action label or action identifier (case-insensitive). Use `↑` / `↓`, `Enter`, or `Escape`, or click an option to choose it.
- An existing row whose Action is not supported by its selected Mode remains visible so it can be corrected. Such incompatible rows block **Apply bindings** until they are fixed; they are never removed automatically.
- Rows show visible selected and hover states, separators distinguish adjacent rows, and the table headings remain visible while the table is scrolled.
- Add, edit, and delete operations are drafts until you click **Apply bindings**. Closing Preferences without applying discards the draft and leaves the active bindings unchanged.
- Click **Reset to defaults** to stage the default bindings. Reset is also a draft operation: the defaults take effect only after **Apply bindings**, and closing without applying abandons the reset.
- **Apply bindings** checks all rows before saving. Empty or malformed rows, incompatible mode/action rows, and exact duplicate mode-and-sequence rows block Apply. A valid same-mode prefix pair such as `f` and `ff` is allowed but shows a warning because the shorter sequence may wait for a continuation and introduce a timeout delay.
- If saving fails, the draft remains in the table and the failure is reported; retry **Apply bindings** after addressing the reported failure.
- After a successful Apply, a deleted shortcut remains unbound after restart and no longer appears in the resolved Key Guide or Command Palette hints.
- Appearance, key guide, highlight colour, mode, marks and scroll settings save automatically on change.
- Note editor Vim mode can be turned on or off independently from the Preferences panel.

The preferences pane reopens on the last-used section after a restart. Init
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
| `enterVisual`                 | Enter Select mode                                                                    |
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
| `swapVisualEnds`              | Swap selection anchor and focus                                                      |
| `openCommandPalette`          | Open the command palette in the current Normal context                               |
| `switchTab`                   | Choose and switch to an open Zotero tab                                               |
| `findNotes`                   | Find and open a note                                                                  |
| `managePlugins`               | Open the persistent Plugin Manager panel                                              |
| `findAllItems`                | Find an item in the current library                                                   |
| `findCollectionItems`         | Find an item in the current collection                                                |
| `mainYankCitekey`             | Copy the selected item's citekey to the clipboard                                    |
| `mainOpenPDF`                 | Open the selected item's PDF                                                         |
| `mainTrashItems`              | Move selected main item-list rows to Zotero Trash                                    |
| `mainRestoreTrashedItems`     | Restore the last item batch trashed by Neo                                           |
| `closeCurrentTab`             | Close the active Zotero tab                                                           |
| `previousTab`                 | Switch to the previous open tab                                                       |
| `nextTab`                     | Switch to the next open tab                                                           |
| `mainFocusTree`               | Focus the collection tree (left pane)                                                |
| `mainFocusItems`              | Focus the item list (middle pane)                                                    |
| `mainFocusLeft`               | Focus the collection tree (left pane)                                                |
| `mainFocusRight`              | Focus the detail pane (right pane)                                                   |
| `addTag`                      | Add one tag to the current target(s)                                                  |
| `removeTag`                   | Remove one tag from the current target(s)                                             |
| `toggleTagFilter`             | Main only: toggle one tag filter                                                      |
| `clearTagFilters`             | Main only: clear all tag filters                                                      |
| `addToCollection`              | Main only: add EffectiveSelection/Cursor fallback to a chosen collection              |
| `removeFromCollection`         | Main only: remove EffectiveSelection/Cursor fallback from a chosen collection         |
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

| Setting                  | Default                  | Description                                                                                                                                           |
| ------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Appearance               | Auto                     | Auto follows Zotero's computed Light/Dark palette; Light and Dark force all Neo-owned panels without recolouring PDF pages or annotations             |
| Enable Select mode       | on                       | Allow entering Select mode with `v`                                                                                                                   |
| Enable Insert mode       | on                       | Allow entering Insert mode with `i`                                                                                                                   |
| Note editor Vim mode     | on                       | Enable Vim-style editing in note editors (context pane and note tabs)                                                                                 |
| Scroll mode              | Constant-speed scrolling | Step / Constant-speed / Accelerating — only the active mode's parameters are shown                                                                    |
| Scroll step              | 60 px                    | Pixels scrolled per `j`/`k`/`zh`/`zl` keypress (step mode; count prefixes like `3j` always use this)                                                  |
| Scroll speed             | 2000 px/s                | Constant hold-scroll speed (constant-speed mode)                                                                                                      |
| Smooth initial speed     | 2000 px/s                | Starting speed for hold-based smooth scrolling (accelerating mode)                                                                                    |
| Smooth max speed         | 2000 px/s                | Maximum hold-scroll speed (accelerating mode)                                                                                                         |
| Smooth acceleration      | 2600 px/s²               | Speed increase while holding a scroll key (accelerating mode)                                                                                         |
| Smooth deceleration      | 4200 px/s²               | Speed decrease after key release (accelerating mode)                                                                                                  |
| Stop on release          | off                      | If enabled, stop immediately when key is released (accelerating mode)                                                                                 |
| Persist marks            | off                      | Save marks in the parent item's Extra field (`zv-marks-<attachmentKey>`) so they survive restarts and sync                                            |
| Default highlight colour | Yellow                   | Colour used when no explicit colour key is pressed                                                                                                    |
| Key guide                | on                       | Show valid pending continuations; Reader/Note retain Space-led groups while Main uses direct prefixes                                                                       |
| Key guide delay          | 200 ms                   | Delay before the continuation panel appears; configurable from 0 to 1000 ms                                                                           |
| Key guide font size      | 15 px                    | Continuation panel text size; configurable from 12 to 24 px                                                                                           |
| Picker mouse rows        | off                      | When enabled, single-click selects and double-click confirms chooser result rows; hover remains inert                                             |

Appearance, key guide, picker, and scroll settings save automatically on change.

- **Step scrolling** moves instantly by the scroll step per `j`/`k`/`zh`/`zl` press.
- **Constant-speed scrolling** glides at a fixed speed while a scroll key is
  held and stops immediately on release.
- **Accelerating (trapezoid curve) scrolling** ramps from `initial speed` to
  `max speed` while held, then decelerates after release (unless _stop on
  release_ is enabled). With `initial speed` and `max speed` both set to
  `2000`, it behaves like the constant-speed mode with a gentle glide on
  release.

---
