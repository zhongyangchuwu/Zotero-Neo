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

## Find and organize collections

In Main Normal, press `:` and choose **Find and enter a collection** to search collection names or full paths in the current library. Full paths distinguish collections with the same name. Browsing or pressing `Escape` leaves Main's scope and tree expansion unchanged; confirming a result enters that collection and records a changed destination in shared history, so use `<C-o>` / `<C-i>` to go Back or Forward.

The same Palette offers **Add existing items to the current collection**, **Move current item target(s) to another collection**, **Move the current collection**, **Create a collection**, **Rename the current collection**, and **Delete the current collection (keep items)**. All seven collection actions are unbound. Finding works in a read-only library; membership and structure edits require a writable library and otherwise report `This library is read-only or unavailable`. Existing `e`, `j` / `k`, `h` / `l`, `<Space>ca`, `<Space>cr`, and `<Space>fc` keep their current meanings; Zotero's native tree, context-menu, and drag editing remain available. See [Search and navigation](SEARCH_GUIDE.md#find-a-collection) for collection search and the [Command Reference](COMMAND_REFERENCE.md#main-window) for action targets.

When the collection tree is focused, Move, Rename, and Delete require its Cursor to be an ordinary collection and use that collection even if Zotero has multiple collection scopes selected. When the tree is not focused, they require one active ordinary collection; multiple selected scopes or a library root are refused rather than guessed. Create uses the tree Cursor's library when the tree is focused, or one active library/collection scope otherwise, then asks you to choose a parent collection or the library root explicitly. Moving a collection carries its descendants and excludes itself and those descendants as destinations. Create and rename use Zotero's native name prompt; creation also requires native confirmation. Deleting a collection and its descendants keeps all items in the library; `u` restores an item-trash batch, not collection structure.

To add existing items one at a time, choose **Add existing items to the current collection** from `:`. It freezes the single active ordinary collection and searches for up to 100 same-library matches per query. Each `Enter` saves one addition and keeps the picker open; `Escape` ends the workflow without undoing earlier additions. Main filters and persistent Selection stay unchanged.

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
2. Press `<Space>ca` to add the effective item target(s) to a collection in the same library. Candidates show how many targets are directly assigned (`n/N`); already assigned items stay put, and only missing memberships are added. Choose **New collection…** to select a parent or library root, enter a name in Zotero's native prompt, and confirm. Creating the collection and adding the items is atomic; cancelling does not create an empty collection.
3. Press `<Space>cr` to remove membership. The picker lists the union of collections directly assigned to at least one target and shows the `n/N` coverage. Confirming removes only that collection membership from the items that have it; items and their other collection memberships remain. If none of the targets has a direct membership, the picker shows an empty state.
4. To move targets, open `:` and choose **Move current item target(s) to another collection**. This requires one active ordinary source collection and every target must be directly assigned to it. Choose a destination in the same library; Neo adds the destination and removes the source atomically, preserving other memberships. A library root, saved search, mixed source, or recursive-only visibility is not a source; use `<Space>ca` to add without removing.

Membership counts describe direct assignment, not items merely visible under a parent. Batch actions use a nonempty persistent Selection first; otherwise they use the applicable Visual range, Zotero native multi-selection, or Cursor. Keep batches within one library. Adding, removing, or moving collection membership leaves persistent Selection available for the next operation.

## Trash and restore items

In Main Normal, `dd` or `x` asks Zotero to trash the effective target after confirmation. A nonempty persistent Selection takes priority; otherwise the target is Visual, native multi-selection, or Cursor. Read the confirmation, which identifies the target source and item count. If any Selection member is hidden or unavailable, Neo refuses the operation instead of applying it to a partial set. Cancelling confirmation leaves the items and persistent Selection unchanged; after a successful trash, Neo removes those items from persistent Selection.

Press `u` to restore the last batch trashed by Neo in this Main window. Each later successful Neo trash replaces that remembered batch; `u` is not a general undo for unrelated changes in Zotero's Trash.

For complete defaults, remapping support, and action-specific target rules, see the [Command Reference](COMMAND_REFERENCE.md#main-window).