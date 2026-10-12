# Zotero Neo User Guide

For a complete command lookup, exact default bindings, count/input rules, and
navigation-history boundaries, see the [Command Reference](COMMAND_REFERENCE.md).

## Contents

- [Modes](#modes)
- [Default keybindings](#default-keybindings)
- [Annotation workflow](#annotation-workflow)
- [Customising keybindings](#customising-keybindings)
- [Settings](#settings)

---

## Modes

Reader has two Surface modes. Flash is a temporary targeting motion inside the
Select workflow; comment editing and native passthrough are feature input owners.

| Mode       | Indicator | Purpose |
| ---------- | --------- | ------- |
| **Normal** | _(hidden)_ | Reading, navigation, and existing-annotation commands |
| **Select** (internal name: Visual) | `SELECT · …` | Select PDF text, refine endpoints, and run actions |

`-- COMMENT --` / `-- NATIVE --` indicate feature-owned input, not additional modes.
They own the keyboard without becoming Surface modes; opening a comment normalizes Select to Normal.

Mode transitions:

```
Normal ──v──▶ Flash start ──target──▶ Select ──v/Escape──▶ Normal
                                      │
                                      └──s──▶ Flash endpoint ──target──▶ Select
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
| `gg`        | First-page start                                                          |
| `G`         | Document bottom                                                           |
| `H`         | Switch to previous open tab                                               |
| `L`         | Switch to next open tab                                                   |
| `<Space>,`  | Choose and switch to an open Zotero tab                                   |
| `<Space>q`  | Close the active Zotero tab                                               |
| `<Space>fn` | Search all notes in the shared picker (left: note titles, right: preview) |
| `<Space>pp` | Open the persistent Plugin Manager panel |
| `<Space>ps` | Open Neo Settings without leaving the Reader tab |

Counts repeat page turns (`3l` = three host page-turn steps). When numeric page navigation is supported, positive `nG` / `ngg` counts target that one-based page start (`5G` / `5gg` = page 5 start). Uncounted `gg` goes to the first-page start; uncounted `G` goes to the document bottom without changing zoom. Unsupported hosts fall back to top/bottom scrolling and ignore the count.

The shared jumplist records selected explicit navigation across Main, Reader, and Note,
including tab switches. Back/Forward use `<C-o>` / `<C-i>` in Normal modes.
For the complete recording/exclusion matrix, restoration limits, and examples,
see the [Command Reference: shared jumplist](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist).

### Prefix Guide

The guide follows any pending multi-key prefix in the active resolved keymap.
Reader, Main, and Note use Space as the default semantic command namespace.
Pause after Space (or any other pending prefix such as `g` / `z`) to show the
small bottom-center list of valid continuations. Remaps appear without a second
display-only keymap.

- The guide is enabled by default and appears after 200 ms; its delay and
  15 px default font size are configurable under **Preferences → Key guide**.
- Letter labels preserve case: `b` and `B` are distinct bindings.
- It updates after nested prefixes such as `<Space>f` or `<Space>t` on any surface where those groups are available.
- `Escape` cancels the pending sequence. `Backspace` returns to the previous
  pending prefix; at the root it closes the guide.
- It never appears while comment/native input, Note Insert, picker input, or
  another Neo-owned modal feature owns the keyboard.

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

Reader and Note Command Palettes include the unbound **Show current item in Library** action. It uses the active Reader item or Note-context item and does not borrow Main Selection. A successful location change is recorded in the shared history; see [Reading history](#reading-history) for Back/Forward keys and restoration limits.

- The initial palette is query-only: it accepts no command arguments, counts, scopes,
  history, Spotlight commands, or external registrations. `3:` may open it, but the
  selected action runs with its ordinary uncounted behavior.

When **Preferences → Picker → Enable mouse row selection and double-click confirmation**
is enabled, chooser and command rows also support pointer selection and double-click
confirmation.

#### Plugin Manager panel

Press `<Space>pp` in Reader, Main, or Note Normal to open Neo's persistent
Plugin Manager panel. Unlike a picker, this surface stays open while you browse installed
plugins and inspect their state. Zotero/Mozilla AddonManager remains the authoritative
source for plugin lifecycle state.

The configurable commands use `plugins-list` while the results are focused and
`plugins-input` while the filter field owns input. The filter's ordinary text
and IME remain native; `Escape` in that field returns focus to the list.

- `j` / `k` or `↑` / `↓`: move through installed plugins.
- `Ctrl+d` / `Ctrl+u`: move quickly through the list.
- `gg` / `G`: first / last plugin.
- `/`: focus the fuzzy filter field; `Escape` leaves the field without closing the panel.
- `r`: reload installed plugin state from AddonManager.
- In the results list, `Escape` / `q` close the panel and restore previous focus when possible; in the filter field, `Escape` returns focus to the list.

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

| Key      | Action                         |
| -------- | ------------------------------ |
| `Ctrl+o` | Navigate Back (`navigateBack`) |
| `Ctrl+i` | Navigate Forward (`navigateForward`) |

These canonical actions work in Main, Reader, and Note Normal. Shortcut counts
traverse that many history locations; the Command Palette action is uncounted.
Note Insert, comment/native input owners, editable controls, and Neo-owned modal
input do not invoke history. Zotero remains responsible for performing native link
navigation; Neo's history records and restores the explicit cross-surface
locations described above. Back/Forward are safe no-ops at either boundary.

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
or split PDF view through Zotero's native navigation API and are recorded in Neo's
Back/Forward history. Citation hints follow Zotero's first resolved bibliography
target. Native PDF search-result navigation is also recorded. External links open
through Zotero's normal link handler and do not become Neo history locations.
Reference-preview overlays, off-screen links, feature-owned input, and editable controls are not claimed.

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
| `<Space>ff` | Find and open an item in the current library |
| `<Space>fc` | Find and open an item in the current collection |
| `<Space>fn` | Find and open a note in the active library |
| `<Space>,` | Switch to an already-open Zotero tab |
| `<Space>ta` | Add one chosen tag to the current target(s) |
| `<Space>tr` | Remove one chosen tag from the current target(s) |
| `<Space>tf` | Main only: toggle one chosen tag filter |
| `<Space>tc` | Main only: clear all tag filters directly |
| `<Space>ca` | Main: add EffectiveSelection (Selection > CurrentTarget); Reader: add the active Reader item to one chosen collection |
| `<Space>cr` | Main: remove EffectiveSelection (Selection > CurrentTarget); Reader: remove the active Reader item from one chosen collection |

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

The Neo-owned movement, preview, confirmation, and cancellation actions are
configurable in `picker-input` and `picker-list`. Query typing and IME remain
browser/Gecko-owned; native editing shortcuts are disclosed separately in
Settings and are not disabled by changing a Neo binding.

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

##### Batch citekey copy

In Main, `yy` copies Better BibTeX citekeys from EffectiveSelection: explicit
Neo Selection first; otherwise the current Visual range, native multi-selection,
or Cursor. Targets are normalized with Zotero's top-level-item semantics and
duplicate normalized items are emitted once.

The shared citekey Operation copies raw keys: one target produces `Smith2026`,
and a batch produces `Smith2026 Jones2025`. If any target is unavailable or
lacks a citekey, the whole batch is refused and the clipboard is untouched.
Reader and Note resolve their own contextual single-item targets and never use
Main Selection. A Note command invoked from the palette retains the Note target
captured before the palette takes focus. This does not add a formatted citation
output command.

##### Collection membership

`<Space>ca` and `<Space>cr` are item actions shared by Main and Reader. In Main,
explicit Neo Selection wins; otherwise the current Visual range, native
multi-selection, or Cursor is targeted. In Reader, the target is the active
Reader item's parent bibliographic item when one exists; Main Selection is not
consulted.

Each Surface resolves its own target; the Main window hosts the chooser without
lending its Selection to Reader. The shared Collection Operation applies the
membership change in one Zotero transaction. Targets must resolve to one library,
and the chooser lists only collections from that library. Before confirmation,
Neo re-resolves the Surface target; a changed target or Reader tab refuses the
entire operation. Note has no collection membership binding.

`<Space>ca` skips items already in the destination and `<Space>cr` skips items already
absent. Membership changes do not redefine Neo Selection.

##### Notes

`fn` searches normalized note titles and note body content. Notes related
to the current item are grouped ahead of the remaining notes in the active
library. Confirming a note opens it through Zotero; `Shift+Enter` requests the
alternate window presentation.

Note creation, deletion, restore, yank, and editing are not a second grammar
inside the chooser. Note editor Normal/Insert operations use the shared binding
engine in the editor itself.

#### Native Reader Outline and Bookmarks

The native Reader sidebar has four direct focus commands in Reader Normal: `<Space>ro` for Outline, `<Space>rm` for Bookmarks, `<Space>ra` for Annotations, and `<Space>rt` for Thumbnails. They open or focus the named surface; repeating a command does not close it. The same panel-focus actions are available from each Reader panel's local binding context.

| Local context | Default Neo controls |
| --- | --- |
| `reader-outline` | `j` / `k` move, `h` / `l` parent / child, `Escape` cancel; `uiConfirm` is supported but unbound by default |
| `reader-marks` | `j` / `k` move, `gg` / `G` first / last, `Enter` confirm, `Escape` cancel, `d` delete, `x` clear |
| `reader-annotations` | `j` / `k` move, `Escape` cancel |
| `reader-thumbnails` | `j` / `k` move, `Escape` cancel |

These Neo-owned controls can be remapped in their matching contexts. Native arrows and `Tab` / `Shift+Tab` remain Zotero-owned; in Outline, `Enter` / `Return` (including modified Enter) is exclusively native. If you want a configurable confirmation in Outline, bind `uiConfirm` to another non-reserved key. Escape follows each surface's own return/cancel behavior.

Neo adds bounded Bookmarks and collapsible `▧ / ▤` caption groups to the native Outline without replacing its rows or titles. `[s` / `]s` traverse the whole native heading hierarchy, including Subsections, from the actual active PDF position; the same shortcuts work from Outline, Bookmarks, Annotations and Thumbnails. If an authored bookmark points to the previous page's end, a uniquely matching native heading supplies the printed title's actual position. Missing or ambiguous matches retain the authored destination. Collapse, search filtering, the active Outline row and sidebar visibility never scope traversal. Navigation follows document order and wraps; native editing/IME remains authoritative.

Figure `[f` / `]f` and Table `[t` / `]t` navigation reuse genuine Zotero structured-document caption blocks with valid PDF anchors. Figures align the top of a trustworthy associated native image above its caption, so the image is visible; ambiguous associations fall back to the caption. Tall images may extend below the viewport; navigation does not change zoom. Tables retain caption positions. Expand `▧ / ▤` to recognize and choose a caption, or request a category directly. Heading/Figure/Table recognition shares one lazy Reader cache: the first explicit request may require Zotero to process the whole PDF locally, but opening Reader does not start this extra work. No upload or new OCR dependency is added. Absent captions stay absent, and missing targets are reported honestly. Bookmark `[m` / `]m` navigation retains existing document-position ordering, jumps and annotation links.

Compact colored icons and derived tree ordinals replace long type labels: an unnumbered Introduction root is `1`, the next root is `2`, and child headings are `3.1`, `3.2`, etc. Numbering uses the full hierarchy, not only expanded/filtered rows; explicit Figure/Table entries do not increment heading counters. Meaningful unnumbered root leaves are Sections. Native titles and authored numbering remain unchanged; hover and accessible names explain the icons, and the separate number is a direct-child count. These presentation hints do not verify PDF semantics.

Inside Bookmarks, `j` / `k` move between marks; `gg` / `G` move to the first / last mark; `Enter` confirms; `d` deletes the selected mark; and `x` clears marks. Mark labels jump directly except `j`, `k`, `g`, `d`, and `x`, which are group controls. These are Neo Reader marks, not PDF annotations; their persistence follows the Marks preference.

#### Reader split view

| Key         | Action                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `<space>-`  | Toggle horizontal split (top/bottom)                                                                               |
| <code>&lt;Space&gt;&#124;</code> | Toggle vertical split (left/right) |
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
| `<Space>rm` | Focus the Bookmarks group in the native Outline sidebar |

Notes:

- Digits after a mark prefix are mark characters, not counts — `4j` still
  scrolls four steps, but `` `1 `` jumps to mark 1.
- A mark stores the viewport-centre position: whatever was in the middle of
  the screen when you pressed `m<x>` will be in the middle of the screen when
  you jump back — even mid-page.
- If an annotation is selected (via `[a`/`]a`), the mark also binds to it so
  follow-up commands (`[a`/`]a`, `zy`, `y`, …) work after a jump. Annotation
  navigation remains available alongside the other Reader category keys.
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
| `j` / `k`   | Move Cursor down / up; when Zotero has a native item multi-selection, move Cursor focus without collapsing it |
| `s`         | Item list: toggle CurrentTarget into persistent Selection; collection tree: leave to Zotero native behavior |
| `gg` / `G`  | Jump to the first / last row                                                                                         |
| `h`         | In item list, move focus back to collection tree; in collection tree, collapse selected collection or jump to parent |
| `l`         | In collection tree, expand selected collection; if already expanded or a leaf, move focus into item list             |
| `Enter`     | In collection tree, activate the focused scope and enter items; in item list, open the Cursor item/PDF               |
| `Backspace` | Jump to parent collection                                                                                            |
| `dd` / `x`  | Trash persistent Selection when non-empty; otherwise trash the current transient item target                       |
| `Esc`        | Cancel Visual/native multi CurrentTarget; does not clear persistent Selection                                      |
| `u`         | Restore the last item batch trashed by Neo                                                                           |
| `za`        | Toggle expand/collapse for the currently selected collection row                                                     |
| `zo`        | Expand the current collection row (if already open, keep it open)                                                    |
| `zc`        | Collapse the current collection row (if already closed, keep it closed)                                              |
| `R`         | Expand all collections in the current library tree                                                                   |
| `M`         | Collapse all collections in the current library tree                                                                 |

Before Trash, Neo asks for confirmation showing the resolved source and item count (for example, `Neo Selection · 7 items`) and notes Zotero Undo. Cancel leaves the workset unchanged. If Neo Selection contains hidden members, Trash is refused with the hidden/total count; open `<Space>ss` to inspect, reveal, or remove those members.

The collection tree keeps Zotero's native scope semantics. Neo does not assign
`s` a ScopeSet mutation grammar. Existing native multi-scope selections are
preserved by Cursor-only tree motion where Zotero supports it, and `Enter`
continues to activate the focused scope before entering the item list.

In Main Normal mode, `H` and `L` switch to the previous and next Zotero tabs.
`J` and `K` are not Neo defaults and remain available to native Zotero behavior.

#### Main window command prefixes

These bindings work in the main Zotero window, subject to the active capability
and focus context:

| Key | Action |
| --- | --- |
| `<Space>ff` | Find an item in the current library |
| `<Space>fc` | Find an item in the current collection |
| `<Space>fn` | Find and open a note |
| `<Space>fq` | Focus/select Zotero's native Quick Search field |
| `<Space>fa` | Open Zotero's native Advanced Search; convert current Quick Search text when present |
| `<Space>pp` | Open the persistent Plugin Manager panel |
| `<Space>ps` | Open Neo Settings |
| `<Space>,` | Choose and switch to an open Zotero tab |
| `<Space>q` | Close the active Zotero tab |
| `<Space>ta` | Add one tag to the current target(s) |
| `<Space>tr` | Remove one tag from the current target(s) |
| `<Space>tf` | Toggle one Main-window tag filter |
| `<Space>tc` | Clear all Main-window tag filters |
| `<Space>ca` | Add current item target(s) to a collection |
| `<Space>cr` | Remove current item target(s) from a collection |
| `<Space>yy` | Copy current target citekey(s) to the clipboard |
| `<Space>sc` | Clear persistent Neo Selection explicitly |
| `e` | Focus the collection tree |
| `o` | Open the focused Cursor item; persistent Selection and native multi-selection are not batch-opened |
| `wh` | Focus the collection tree (left pane) |
| `wl` | Focus the detail pane (right pane) |
| `ww` | Focus the item list (middle pane) |

#### Navigation history

Neo keeps one bounded jumplist per Main window. The shortcuts are `<C-o>` Back
and `<C-i>` Forward; H/L tab changes, Reader page jumps, marks, and other
qualifying explicit destinations participate. Ordinary movement and failed or
cancelled operations do not automatically become entries.

For the canonical entry matrix, count behavior, snapshot contents, closed Reader
attachment reopen/remapping, partial restoration, and Neovim differences, see
the [Command Reference: Navigation and the shared jumplist](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist).

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
different from `<Space>ff` / `<Space>fc`: those open a fuzzy target chooser, while local
find is relative, repeatable Cursor motion. It is also different from `<Space>fq` and
`<Space>fa`: those edit Zotero's actual View through its native Quick/Advanced Search
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

In Reader Normal, category navigation shares one bracket grammar. Each pair
moves to the previous / next matching target, follows document order, and wraps:

| Keys | Category |
| --- | --- |
| `[s` / `]s` | Headings, including Sections and Subsections |
| `[f` / `]f` | Figures from explicit native targets or recognized native captions |
| `[t` / `]t` | Tables from explicit native targets or recognized native captions |
| `[a` / `]a` | Annotations |
| `[m` / `]m` | Bookmarks, ordered by document position |

The selected annotation is highlighted in the PDF and scrolled to in the sidebar.

| Key | Action |
| --- | --- |
| `Enter` | Open the selected annotation's comment field for editing |
| `i` | Open the annotation comment editor with the Insert indicator |
| `y` | Copy the annotation's **highlighted text** to the clipboard |
| `Y` | Copy the annotation's **comment text** to the clipboard |
| `dd` | Confirm permanent deletion of the selected Reader annotation (not undoable) |
| `zy` | Change annotation colour → Yellow |
| `zr` | Change annotation colour → Red |
| `zg` | Change annotation colour → Green |
| `zb` | Change annotation colour → Blue |
| `zp` | Change annotation colour → Purple |

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
duplicate of every Select shortcut. Built-ins currently include **Capture to note**, **Underline**, and **Add note**;
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

### Annotation comment input

The annotation comment editor owns input independently of Reader Normal/Select;
`-- COMMENT --` identifies that feature, not a Reader command mode. Ordinary typing
and IME keep their native text behavior rather than invoking Reader shortcuts.
With comment entry disabled in Settings, `i` instead activates Reader-wide native
passthrough (`-- NATIVE --`): ordinary keys stay native until Escape exits it.

Press `i` in Normal while an annotation is selected via `[a`/`]a` to open Neo's floating
comment textarea inside that PDF view. The existing comment is pre-filled and the quoted
text is shown as context. Enter inserts a newline, and Escape saves and closes rather
than discarding the draft. Escape during active IME composition does not close the editor.

| Key      | Action                                                                      |
| -------- | --------------------------------------------------------------------------- |
| `Enter`  | New line in the comment                                                     |
| `Escape` | Save as the official annotation comment and close the overlay → Normal mode |

The comment is also autosaved 2 seconds after the last keystroke, and `visual i`
(Add note) opens the same overlay for the newly created annotation. This is an
annotation comment workflow; it is distinct from **Capture to note**.

There is no cancel command: Escape saves the current draft, including edits made
after the last autosave. It does not restore the comment from when the editor
opened or undo an earlier save. Closing the Reader is resource cleanup, not an
extra save command; only content already saved is guaranteed on reopen.

The **Annotation comment editing** switch under **Settings → Reader** gates editing
an existing selected annotation from Normal mode and is enabled by default. Off
prevents Normal `i` / Enter from opening Neo's floating editor; `i` still enters
the native input owner described above. Select **Add note**
remains a separate creation workflow and opens the new annotation's editor. This
switch does not disable Zotero's own comment fields. There are no separate
Enter-save, Escape-cancel, or autosave-policy switches.

The switch now persists as `extensions.zotero-neo.annotationCommentEditor.enabled`.
Existing true/false values migrate from the old mode preference; a value already
stored under the new key wins. The obsolete Reader Insert binding context is removed.
Its inactive custom bindings and explicit unbindings are deleted without an archive,
as approved for this cleanup; other Reader/Main/Note customizations remain intact.

The editor keeps the annotation it opened as its save target even if Zotero navigates to
another annotation. Its keys are scoped to that PDF view; another split view still accepts
Reader navigation. Closing the Reader releases the transient editor, and reopening starts
from the annotation's saved comment.

Zotero's own annotation popup and sidebar comment fields remain fully usable
for mouse editing: clicking into either while the overlay is open saves and
closes the overlay and hands over to the native editor (Escape inside native
editors keeps its Zotero behavior).

> **Note:** if pressing `i` shows a red `✗` status instead, the plugin writes
> detailed diagnostics to `zotero-neo-startup.log` in your Zotero profile directory
> (`%APPDATA%\Zotero\Zotero\Profiles\...` on Windows).

---

## Knowledge Capture workflow

While a Reader Visual selection is active, press `a` or `Enter` and choose
**Capture to note**. Neo snapshots the selected text and Reader item context,
then opens the shared Notes picker. Notes belonging to the current paper are
ranked first, followed by other notes in the same library.

Confirming a note appends a blockquote containing the captured text and the PDF
page label when available. Existing note content is preserved. The target note
is revalidated before writing; deleted, non-note, or cross-library targets are
refused. Cancelling the chooser leaves notes unchanged and returns focus to the
Reader.

The first v0.2 slice only captures into an existing note. It does not create a
new note automatically and does not redefine `visual i`, which still creates
a highlight and opens its annotation comment editor.

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

1. Press `]a` / `[a` to move to the next / previous annotation. The annotation
   is highlighted in the PDF viewer and the sidebar scrolls to its card.
2. Press `y` to copy the highlighted text, `Y` to copy the comment.
3. Press `i` (or `Enter`) to open the comment overlay and type a note.
   The plugin's own floating input box appears over the PDF with the comment
   pre-filled and the highlighted text quoted as context (Zotero's popup is
   not used). Press `Enter` for a new line, `Escape` to save and return to
   Normal mode.
4. Press `dd` and confirm to permanently delete the selected annotation; this deletion cannot be undone.

---

## Customising keybindings

Open Neo Settings with `<Space>ps` from Main, Reader, or Note Normal, then choose
**Keybindings**. The action browser spans the six Reader/Main/Note mode contexts
and eight focused local contexts: `reader-outline`, `reader-marks`,
`reader-annotations`, `reader-thumbnails`, `picker-input`, `picker-list`,
`plugins-input`, and `plugins-list`. Prefix Guide settings are collapsed by
default.

- Filter by action group and context. Search covers localized labels, canonical
  ActionIds, current keys, default keys, groups, and contexts. Results show
  **Default**, **Custom**, or **Unbound**, including supported unbound actions.
- Select an action and context to inspect or edit its bindings. **Add** adds a
  binding; **Record** captures a key sequence. Recorded `Enter` and `Escape` are
  tokens, not recorder completion/cancellation; use explicit **Done** or
  **Cancel** controls.
- **Unbind** or **Reset** affects one action in one context and preserves
  unrelated bindings. Edits remain staged until **Apply**.
- Exact duplicates, unsupported action/context pairs, and reserved native keys
  block Apply. Strict-prefix pairs are allowed with a warning because the
  shorter sequence may wait for a continuation. Incompatible carried-over rows
  remain **Delete**-only; they cannot be recorded or retained as inert commands.
- Key ownership is reserved across every token in a sequence. Native query
  editing includes `<C-Insert>` / `<S-Insert>`; Outline `Enter` / `Return`,
  including modified Enter, remains exclusively Zotero-owned. Outline
  `uiConfirm` is supported but unbound by default and can use another
  non-reserved key. Native text entry and IME remain host-authoritative.
- Native shortcuts are separate, read-only, and context-labeled; they appear
  only with the **All groups** filter. Changing a Neo binding does not disable
  its native counterpart. Result/native regions are bounded and **Apply** stays
  reachable before them.
- Leaving the recorder restores the edited action's connected summary; if it is
  filtered out, focus returns to Apply or search. A save failure keeps the
  staged draft and reports the failure.

Key notation remains Neovim-style. Printable keys preserve case (`b` differs
from `B`); symbolic tokens include `<C-d>`, `<Enter>`, `<Esc>`, `<S-Tab>`,
`<F1>`, and `<Space>`. Printable sequences such as `gg` are multi-key input;
`<C-d>g` composes symbolic and printable tokens, `<lt>` represents a literal
`<`, and `<f>` is invalid rather than another spelling of `f`.

Appearance, Prefix Guide, highlight colour, mode, marks, and scroll settings
save automatically. Note editor Vim mode remains independent.

The legacy Zotero Preferences pane remains a compatibility bridge for settings that
have not migrated yet. Init failures are reported to `zotero-neo-startup.log` in the profile directory with
`[prefs]`-prefixed lines.

### Action reference

For the complete action-ID lookup, capabilities across all binding contexts, unbound-action status, and canonical default binding map, see the [Command Reference](COMMAND_REFERENCE.md#action-id-index). This guide keeps the beginner workflow and quick default-key examples above; the command reference is the sole detailed action and history lookup.

## Settings

Open Neo Settings with `<Space>ps` from Main, Reader, or Note Normal mode. From Reader,
the Settings workspace opens in the owning Zotero window without switching back to Library.

| Setting                  | Default                  | Description                                                                                                                                           |
| ------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Appearance               | Auto                     | Auto follows Zotero's computed Light/Dark palette; Light and Dark force all Neo-owned panels without recolouring PDF pages or annotations             |
| Enable Select mode       | on                       | Allow entering Select mode with `v`                                                                                                                   |
| Annotation comment editing | on | Enable Normal `i` / Enter editing of a selected annotation; Off keeps `i` native passthrough until Escape |
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
| Key guide                | on                       | Show valid pending continuations; Space is the default semantic command root across Reader/Main/Note                                                                        |
| Key guide delay          | 200 ms                   | Delay before the continuation panel appears; configurable from 0 to 1000 ms                                                                           |
| Key guide font size      | 15 px                    | Continuation panel text size; configurable from 12 to 24 px                                                                                           |
| Picker mouse rows        | off                      | When enabled, single-click selects and double-click confirms chooser result rows; hover remains inert                                             |
| Interface + command language | Follow Zotero         | Localize the Neo Settings workspace plus command labels in Prefix Guide, Command Palette, and Keybindings; Follow Zotero derives English/Chinese from the host locale |
| Tag namespace separator  | `/`                      | Interpret flat Zotero tag strings as virtual Neo paths; an empty separator keeps tag matching completely flat                                    |

Appearance, Prefix Guide, picker, Reader, interface/command language, and tag namespace settings save automatically on change.
Keybinding edits remain staged until **Apply**.
The Zotero Preferences pane is now only a compatibility launcher for opening Neo Settings; it no longer contains duplicate editable controls.

- **Step scrolling** moves instantly by the scroll step per `j`/`k`/`zh`/`zl` press.
- **Constant-speed scrolling** glides at a fixed speed while a scroll key is
  held and stops immediately on release.
- **Accelerating (trapezoid curve) scrolling** ramps from `initial speed` to
  `max speed` while held, then decelerates after release (unless _stop on
  release_ is enabled). With `initial speed` and `max speed` both set to
  `2000`, it behaves like the constant-speed mode with a gentle glide on
  release.

---
