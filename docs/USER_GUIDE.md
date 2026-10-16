# Zotero Neo User Guide

This guide covers common workflows. For every command's ActionId, exact default binding, context, count behavior, and target limits, use the [Command Reference](COMMAND_REFERENCE.md). For tag mutations and filters, see [Selection and Tag Actions](TAGS.md). The [Input methods](INPUT_METHODS.md) guide explains native text entry and IME behavior. For shared project terms, see [Project terminology](INTERACTION_MODEL.md#terminology).

## Contents

- [Modes](#modes)
- [Quick navigation examples](#quick-navigation-examples)
- [Library tree navigation](#library-tree-navigation-left-pane)
- [Find items in Main](#main-local-find)
- [Reader sidebars and marks](#native-reader-outline-and-bookmarks)
- [Reader split view](#reader-split-view)
- [Edit notes](#note-editor-context-pane-and-standalone-note-tab)
- [Select text and annotate](#selection-workflow)
- [Capture selected text to a note](#knowledge-capture-workflow)
- [Edit or delete annotations](#annotation-workflow)
- [Plugin Manager](#plugin-manager-panel)
- [Customising keybindings](#customising-keybindings)
- [Settings](#settings)

## Modes

Reader has two modes: **Normal** for reading and navigation, and **Select** for choosing PDF text and applying selection actions. Press `v` in Reader Normal to start Select. If there is already a Zotero text selection, Neo can adopt it. The `SELECT` indicator shows that Reader Select is active. Flash is a targeting step within this workflow, not another mode.

The **Text Select mode** setting controls whether `v` and existing text selections can enter Reader Select. It is on by default.

Main uses Normal for library navigation and a temporary Select workflow for ranges in the item list. Press `v` to start a range, `s` to commit it to persistent Neo Selection, or `v` / `Escape` to cancel without changing that Selection.

Note editors use Normal and Insert when **Vim-style note editing** is enabled. The setting is on by default. In Insert, Zotero/browser owns ordinary typing and IME; `Escape` returns to Note Normal. With the setting off, typing stays in Zotero's editor.

Focus matters: the collection tree, item list, Reader pane, Note editor, picker input, and picker results do not all use the same commands. Native text fields and active IME composition keep their text-editing keys. See the [Command Reference](COMMAND_REFERENCE.md#modes-focus-and-capabilities) for the exact contexts and actions available in each.

## Quick navigation examples

A few examples show how the same key can have different jobs on each surface:

- In Reader Normal, `3j` scrolls three configured steps; `3l` requests three adjacent page turns.
- In Main, `3j` moves the item Cursor three rows; in Note Normal, it moves the caret three lines.
- Reader `gg` / `G` go to the document's first-page start / bottom. When Zotero supports numeric page navigation, `5gg` or `5G` targets page 5; otherwise those commands scroll to the corresponding document boundary.
- Reader `2<C-o>` traverses two shared-history locations. `2:` only opens the Command Palette; the chosen action runs once.

Counts are action-specific. For the complete default binding list and exact count behavior, see the [Command Reference](COMMAND_REFERENCE.md).

### Plugin Manager panel

Press `<Space>pp` in Reader, Main, or Note Normal to open the persistent Plugin Manager. Use `j` / `k` or the arrow keys to move through installed plugins, `/` to focus its filter, and `Escape` in the filter to return to the list. In the results list, `Escape` or `q` closes the panel.

The available actions depend on what Zotero's AddonManager permits for the selected plugin. For example, `e` and `d` enable or disable only when those actions are available. The full context and defaults are in the [Plugin Manager command entries](COMMAND_REFERENCE.md#selection-actions-plugin-manager-settings-and-selection-panel).

### Reading history

`<C-o>` goes Back and `<C-i>` goes Forward through the shared history in Main, Reader, and Note Normal. For example, after opening an item and then changing to another tab with `L`, Back returns through those completed locations. Ordinary scrolling and failed or cancelled actions do not create history entries. The [Command Reference](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist) lists which destinations can be recorded and what Back/Forward restores.

## Library tree navigation (left pane)

With the item list focused, `j` / `k` move the Cursor, `v` starts a temporary Visual range, and `s` toggles the current target in persistent Neo Selection, then advances the Cursor by one row when possible. If you commit a range with `s`, the whole range is added unless every item was already selected, in which case it is removed. `Escape` cancels a temporary target; it does not clear persistent Selection.

In the collection tree, `h` / `l` collapse or expand the selected collection, and `Enter` activates its scope. `j` / `k` navigate rows. The collection tree's scope selection is separate from item Selection.

`Enter` in the item list or `o` opens the Cursor item; neither batch-opens all selected items. `dd` or `x` sends the effective item target to Zotero Trash after confirmation. If persistent Selection is non-empty, it is the trash target; otherwise the transient target or Cursor is used. `u` restores the last batch trashed by Neo when it is still available. A hidden member in persistent Selection prevents the trash operation; inspect or adjust Selection before trying again.

Tag, collection, and citekey actions have their own target rules. See [Selection and Tag Actions](TAGS.md) for tag targets and filters, and the [Main command table](COMMAND_REFERENCE.md#main-window) for all Main bindings.

### Main local find

With the item list focused, `/` opens Main's local-find prompt. Enter commits a non-empty query and moves the Cursor to the next visible match; `n` and `N` repeat the last query forward and backward. Matching is case-insensitive over visible item metadata, including title/display text, first creator, year, and citekey when available. A miss leaves the Cursor and view unchanged. `Escape` closes the prompt without replacing the previous query.

Local find moves through the rows already visible in the current view. Use `<Space>fq` for Zotero Quick Search or `<Space>fa` for Advanced Search when you want to change that view. For counts and focus details, see the [Main local-find reference](COMMAND_REFERENCE.md#main-window).

## Native Reader Outline and Bookmarks

In Reader Normal, `<Space>ro`, `<Space>rm`, `<Space>ra`, and `<Space>rt` open or focus Outline, Bookmarks, Annotations, and Thumbnails. The same focus commands are available from Reader sidebars. `[s` / `]s` move through headings across the Outline, including collapsed branches; `[f` / `]f` and `[t` / `]t` move through figures and tables when the PDF has usable targets. The first explicit structural-navigation request may make Zotero process the PDF locally; later requests can reuse that work. When no structural target is available, use page navigation or PDF search.

### Marks

Reader marks are position shortcuts, not Zotero tags or PDF annotations:

- Press `m` followed by a lowercase letter or digit to set a mark at the current viewport position; press backtick followed by that label to return.
- Use `dm` followed by a label to delete one mark, or `dM` to delete all marks.
- `<Space>rm` opens or focuses the Bookmarks group. There, `j` / `k` move, `gg` / `G` go to the first / last mark, `Enter` jumps, `d` deletes the selected mark, and `x` clears marks.

Marks are temporary by default. To keep them across restarts, enable **Persist marks** in **Neo Settings → Reader → Marks**. If saving to Zotero's Extra field is unavailable, Neo falls back to a device-local preference; those fallback marks do not sync. See the [Command Reference](COMMAND_REFERENCE.md#temporary-surfaces-and-chooser-grammars) for the configurable Bookmark-list controls.

### Reader split view

`<Space>-` toggles horizontal split and `<Space>|` toggles vertical split. `Ctrl+h` / `Ctrl+j` / `Ctrl+k` / `Ctrl+l` move focus to the nearest eligible pane in the requested direction; movement does not wrap when no pane is available. These keys move focus, not create panes. See the [Reader command table](COMMAND_REFERENCE.md#reader-normal) for pane targets and contexts.

## Edit notes

### Note editor (context pane and standalone note tab)

The same Note commands work in Zotero's context-pane note editor and a standalone note tab when **Vim-style note editing** is enabled. In Normal, `i` enters Insert; `Escape` returns to Normal. In Insert, type and use IME as usual. With the setting off, Zotero/browser owns the editor's normal typing.

The Note register used by `p` / `P` is Neo's internal register, not a general Vim register collection. Counts are action-specific: `3j` repeats a motion and `3x` repeats character deletion, but operator commands such as `3dw` do not multiply the operator. See the [Note editor command table](COMMAND_REFERENCE.md#note-editor) for all available motions and operators.

## Select text and annotate

### Selection workflow

1. In Reader Normal, press `v`, then type visible text to find the start of a selection. Flash accepts Unicode text and system IME input. Choose the displayed label, or press `Enter` to choose the nearest match; the matched query becomes the initial selection.
2. Refine the selection with `h` / `l` (character), `w` / `b` (word), `j` / `k` (line), `0` / `$` (line boundary), `(` / `)` (sentence), or `{` / `}` (paragraph). Press `o` to swap the active end.
3. To choose a distant endpoint, press `s` and use Flash again. `Escape` cancels the current Flash step or exits Select without applying an action.
4. Press `a` or `Enter` to open Selection Actions. You can also apply a colored highlight directly with `zy`, `zr`, `zg`, `zb`, or `zp`; use `y` to copy the selected text or `#` to search for it.

Selection Actions includes **Capture to note**, **Underline**, and **Add note**. **Translate** appears only when the Zotero Translate integration is available. `za` or `i` creates an annotation and opens its comment editor; it is not Capture to note.

## Knowledge Capture workflow

While a Reader Select range is active, press `a` or `Enter` and choose **Capture to note**. The chooser starts with notes belonging to the current Reader item. If that list is empty or you want a different existing note, choose **Browse library**; **Current item** narrows it back to the starting item. The destination must be an existing note in the same library.

Rows show note titles; the preview identifies the actual note owner and body. Confirming appends the selected text as a blockquote, with the PDF page label when available, and preserves the note's existing content. Before confirmation, `Escape` closes without writing. Once a save is admitted, closing the chooser or pressing Escape does not cancel it. If the target or its ownership is no longer valid, the write is refused; choose or preview a valid note again. A save failure is shown and leaves the chooser available for another deliberate choice.

Capture writes to an existing note only; it does not create a note or add a source backlink. This differs from `za` / `i`, which creates a PDF annotation and opens its comment editor.

## Edit or delete annotations

### Annotation workflow

In Reader Normal, `[a` / `]a` move to the previous / next annotation. With an annotation selected:

- `y` copies its highlighted text and `Y` copies its comment.
- `i` or `Enter` opens the comment editor when **Annotation comment editing** is enabled.
- `dd` asks for confirmation before deleting the selected annotation. Deletion is permanent and cannot be undone.
- `zy`, `zr`, `zg`, `zb`, and `zp` change its color.

### Annotation comment input

The comment editor shows `COMMENT`. Ordinary typing and IME input enter the comment; `Enter` inserts a newline. During an active IME composition, the IME handles `Escape` first.

Edits autosave two seconds after the last input while the editor stays open. `Escape` saves the final draft and closes the editor. Neo also saves and closes it when Reader interaction is deactivated or input is handed to a native editor.

Press `Escape` to save before closing a view or Reader. Disposal itself does not save pending text or cancel an already-started native save.

The **Annotation comment editing** setting controls opening an existing annotation's comment from Reader Normal. When it is off, `i` gives native inputs keyboard ownership until `Escape`; `Enter` does not open Neo's editor. The setting does not disable Zotero's own comment fields, and **Add note** from Reader Select still opens the new annotation's editor.

## Customising keybindings

Open Neo Settings with `<Space>ps`, then choose **Keybindings**. Filter by action group or context, then search for a localized label, ActionId, current key, or default key. Select an action and context to add, record, unbind, or reset its binding. Changes remain staged until **Apply**.

While recording, `Enter` and `Escape` are keys you can bind, not recorder controls; use **Done** or **Cancel** to finish. Duplicate bindings, unsupported action/context pairs, and reserved native shortcuts prevent applying the changes. Native text entry and IME remain available to their editor; changing a Neo binding does not change those native editing keys.

The [Command Reference](COMMAND_REFERENCE.md#command-palette-remapping-and-unbound-actions) explains the difference between a default, custom, unbound, and unavailable action, and lists every default binding.

## Settings

Open Neo Settings with `<Space>ps` from Reader, Main, or Note Normal. These settings affect the workflows in this guide:

| Setting | Default | Effect |
| --- | --- | --- |
| **Text Select mode** | On | Allows `v` and existing PDF text selections to enter Reader Select. |
| **Annotation comment editing** | On | Allows `i` / `Enter` in Reader Normal to open a selected annotation's comment editor. |
| **Vim-style note editing** | On | Enables Note Normal and Insert commands in context-pane and standalone note editors. |
| **Scrolling mode** | **Constant** | Selects the Reader scrolling model for `j` / `k` / `zh` / `zl`; other choices are Step and Accelerating. |
| **Namespace separator** | `/` | Under Advanced → Tag namespaces, controls virtual tag-path suggestions; an empty value uses flat matching. |

These preferences save when changed; keybinding edits remain staged until **Apply**. For the full action catalog, contexts, and defaults, see the [Command Reference](COMMAND_REFERENCE.md).