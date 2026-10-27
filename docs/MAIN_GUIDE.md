# Work with items in the Zotero Library

Use the Library to choose a collection, browse papers, and open the item at the Cursor. Build a separate Selection when you want to organize a group of papers together.

## Try it

1. In Main Normal, press `e` to focus the collection tree. Use `j` / `k` to choose a library or collection, then press `Enter` to show its items.
2. Press `ww` to focus the item list. Move the Cursor with `j` / `k` and press `Enter` or `o` to open that item.
3. Press `<Space>ff` to find an item in the current library, or `<Space>fc` to find one in the current collection. Choose a result and confirm it.

## Add items by identifier

In Main Normal, press `<Space>ai`, or choose **Add Item by Identifier** in the Command Palette. Neo opens Zotero's native input; it does not read the clipboard or submit a lookup automatically.

1. Select one writable library or collections within that library. Cross-library and read-only scopes cannot open this action.
2. Enter ISBNs, DOIs, PubMed IDs, arXiv IDs, or ADS Bibcodes. For a batch, use one identifier type per submission and put each entry on its own line.
3. In a single-line entry, press Enter to submit or Shift+Enter to add a line. In multiline entry, Enter adds a line and Shift+Enter submits. These are Zotero's native controls.
4. Escape closes entry without submitting its draft. Closing after submission does not undo items already saved. Zotero owns lookup progress, failures, attachment preferences, and post-import selection.

Zotero's native parser chooses an identifier family for each submission; a mixed DOI/ISBN/arXiv batch is not a request to import every family. Submit mixed references in separate batches instead of relying on that parser priority.

The destination is the current native library and selected collections, not the Cursor item or Neo Selection. Multiple selected collections in one library are passed to Zotero together. Opening the action leaves persistent Selection unchanged; refocusing an already open input preserves its draft and caret.

The same `<Space>ai` action is available in Reader Normal. It brings the associated Library window forward and opens entry in its Library tab, retaining that window's current collection scope rather than using the Reader item's collections. A standalone Reader uses its own opener, not another Main window.

## Browse a library and its collections

The collection tree sets the scope for Main's item list. Focus it with `e`; `j` / `k` move between rows, and `Enter` activates the selected library or collection. `h` collapses an open collection or moves to its parent. `l` expands a closed collection; on an open collection or a leaf, it focuses the item list. Use `ww` to focus the middle item list, `wh` for the left pane, and `wl` for the right detail pane.

In the item list, `j` / `k` move the Cursor. `gg` and `G` move to the first and last row; a positive count with `G` chooses that one-based row. `Enter` or `o` opens the Cursor item.

Use the collection tree when you want to change which rows Main shows. Use [Search and navigation](SEARCH_GUIDE.md) when you need to locate an item without browsing the current rows, narrow Main's view, search within visible rows, or find text in a PDF.

## Keep opening and batch selection separate

Main has two different ways to gather items:

- **Persistent Selection:** in the item list, press `s` to add or remove the current target. Neo moves the Cursor to the next row, so you can keep browsing while the workset remains selected. `<Space>sc` clears it.
- **Visual:** press `v` to start a temporary row range, move its endpoint with `j` / `k`, and press `o` to swap the ends. Press `s` to commit the range to persistent Selection. If every row in the range was already selected, the commit removes that range; otherwise it adds the range. Press `Escape` or `v` to cancel Visual without changing persistent Selection.

Opening stays independent: `Enter` or `o` opens the Cursor item, not the persistent Selection. For Main batch actions, a nonempty persistent Selection takes priority. Otherwise, the action uses its applicable current target: Visual range, Zotero native multi-selection, or Cursor. The collection tree never adds a library or collection to item Selection.

### Review the Selection Panel

Press `<Space>ss` to inspect the persistent Selection. The panel marks each entry **visible** when it appears in the current Main rows, **hidden** when it is outside the current view, and **unavailable** when Zotero can no longer resolve it. `j` / `k` move through entries; `Enter` reveals the selected item in Main. An unavailable item cannot be revealed. Use `x` to remove the current entry from Selection, `c` to clear the workset, `r` to refresh the panel, and `Escape` or `q` to close it.

## Change collection membership

Use a collection to keep a reading list or project together:

1. Mark the papers with `s` and review the group in `<Space>ss`.
2. Press `<Space>ca`, choose a collection in the same library, and confirm. Papers already in the collection stay there.
3. To remove papers from a collection, use `<Space>cr` and choose that collection. The papers remain in the library.

Keep each batch within one Zotero library. A nonempty Selection supplies the group; clear it first when you want to work on the current item instead. Adding or removing collection membership keeps the Selection available for the next operation.

## Trash and restore items

In Main Normal, `dd` or `x` asks Zotero to trash the effective target after confirmation. A nonempty persistent Selection takes priority; otherwise the target is Visual, native multi-selection, or Cursor. Read the confirmation, which identifies the target source and item count. If any Selection member is hidden or unavailable, Neo refuses the operation instead of applying it to a partial set. Cancelling confirmation leaves the items and persistent Selection unchanged; after a successful trash, Neo removes those items from persistent Selection.

Press `u` to restore the last batch trashed by Neo in this Main window. Each later successful Neo trash replaces that remembered batch; `u` is not a general undo for unrelated changes in Zotero's Trash.

For complete defaults, remapping support, and action-specific target rules, see the [Command Reference](COMMAND_REFERENCE.md#main-window).