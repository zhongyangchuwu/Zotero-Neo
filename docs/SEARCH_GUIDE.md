# Find items, narrow views, and navigate

Use a chooser to find a paper or note, Quick or Advanced Search to narrow the Library view, local find to move among visible rows, and Reader search to look inside a PDF. Tabs, Back/Forward history, and Reader marks give you different ways to return to that work.

## Try it

1. In Main, choose a library or collection, then use `<Space>ff` to find an item in the library or `<Space>fc` to find one in the current collection. Check the preview and confirm the result.
2. To search only the rows currently shown in Main, focus the item list, press `/`, type a title or creator query, and press `Enter`. Use `n` / `N` to move through later or earlier matches.
3. Open the item at Main's Cursor with `Enter` or `o`. In Reader, press `/` to find text within the current PDF; use `<C-o>` / `<C-i>` in Normal mode to revisit eligible destinations.

## Choose a search for the task

| What you want | Method | Where it searches or what it changes |
| --- | --- | --- |
| Locate an item in the current library | `<Space>ff` | Shared item chooser for the current library; confirm a result to go to it. |
| Locate an item in the current collection | `<Space>fc` | Shared item chooser scoped to the current collection. |
| Find a note | `<Space>fn` | Starts with notes belonging to the invoking item; choose **Browse library** to search notes across that library. |
| Narrow the Main item list with Zotero's search | `<Space>fq` or `<Space>fa` | Focuses Quick Search or opens Advanced Search; the visible Main view changes. |
| Jump among the rows already visible in Main | `/`, then `Enter`; `n` / `N` | Searches only current item rows, including the active collection, Quick/Advanced Search, and tag filters. |
| Find words in the open PDF | Reader `/`, then `n` / `N` | Uses Zotero's PDF text-search bar and its result navigation. |
| Return to a prior destination | `<C-o>` / `<C-i>` | Traverses Neo's shared Back/Forward history; it is not another search. |

Use [Library workflows](MAIN_GUIDE.md) for tree navigation and opening the Main Cursor item. Use [Tags](TAGS.md#filter-the-main-item-list) to narrow Main with tag filters; those filters change the view, not Zotero tags.

## Find and confirm a destination

Open `<Space>ff`, `<Space>fc`, or `<Space>fn` and type a query. Inspect the highlighted result and its preview, then press `Enter` to open it or `Escape` to cancel. Arrow keys or `Ctrl+j` / `Ctrl+k` move between results; `Ctrl+d` / `Ctrl+u` scroll the preview.

`<Space>ff` looks across the current library; `<Space>fc` uses the current collection. The chooser helps resolve an item, while opening the item at Main's Cursor is a separate action: in the item list, `Enter` or `o` opens that one item, not every item in persistent Selection. For Notes, `<Space>fn` starts with the invoking item's notes. In its chooser, **Browse library** expands the search to the same library, and **Current item** returns to the original note scope without losing the query. See the [Notes guide](NOTE_GUIDE.md) for note results and previews.

## Narrow Main's view

Choose a library or collection in the tree. Use `<Space>fq` for Quick Search or `<Space>fa` for Advanced Search, which can use existing Quick Search text. Add tag filters with `<Space>tf` or clear them with `<Space>tc`. See [Tags](TAGS.md#filter-the-main-item-list) for combined filters and [Library](MAIN_GUIDE.md) for batch worksets.

Narrow the view when you want to review a set of papers; use an item chooser when you want a particular destination. Once you have a useful view, `/` finds rows inside it without changing its filters. Review the [Selection Panel](MAIN_GUIDE.md#review-the-selection-panel) before a batch operation, because your workset can include papers outside the current view.

## Find within the visible Main rows

With Main's item list focused, press `/` to open Neo's local-find prompt. Type one or more terms and press `Enter`: a nonempty query is committed and Neo moves the Cursor to the next visible match. Search is case-insensitive across compact item metadata: display/title, first creator, year, and citekey when available. Multiple query terms may match different parts of that metadata.

Press `n` for the next match or `N` for the previous match. Each repeats one step, wraps through the visible rows, and ignores counts. The search does not change Quick Search, Advanced Search, tag filters, or collection scope. It searches the rows those view choices currently expose.

Press `Escape` to close the prompt and keep the previous query. If a new query has no match, the Cursor stays in place and you can revise the query with `/`. Use `n` / `N` to repeat the most recently committed search.

## Search text in a PDF

In Reader Normal, `/` opens Zotero's PDF text-search bar and `n` / `N` move between results. This searches the document's text, while Main local find searches the metadata of visible Library rows. Continue with the [Reader guide](READER_GUIDE.md) to combine text search, headings, figures, and bookmarks.

## Discover commands

Press `:` in Main, Reader, or Note Normal to open the Command Palette. Search for an action, select it, and press `Enter`. Results show actions available where you are working, including actions with no assigned key.

Pause after `<Space>` or another command prefix to see the Prefix Guide's next keys. The guide follows your saved bindings. Use [Shortcuts and settings](SETTINGS_GUIDE.md) to give a frequently used action its own key; use [Command Reference](COMMAND_REFERENCE.md) for the complete lookup.

## Switch open tabs

Use `<Space>,` to choose an open Zotero tab, or `H` / `L` to move to the previous or next tab, including the Library. Close a Reader or Note tab with `<Space>q`. Tab switching is useful when you want a particular open document rather than your previous navigation destination.

## Shared Back and Forward history

Press `Ctrl+o` to return through Neo's recorded destinations and `Ctrl+i` to move Forward. History connects Library item and note results, Selection Panel reveals, tab changes made with Neo, and Reader jumps that provide a restorable PDF position. Ordinary scrolling, zooming, filter edits, and typing do not add a stop for every key press.

Back can reopen a closed PDF attachment while the file is still readable. A Reader search or annotation move may not add a stop when Zotero does not provide a restorable position; use a Reader mark for a passage you deliberately want to revisit. History belongs to the current Main window. Turn on **Persist marks** in Settings for named reading positions you want to keep after restarting Zotero.

Your Main Selection stays unchanged as you go Back or Forward. See the [navigation reference](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist) for the full recording and restoration rules.

## Research and revisit workflow

Start in Main by choosing a library or collection. Use Quick Search, Advanced Search, or tag filters to narrow the rows when you want to change the view. Use `<Space>ff` or `<Space>fc` when you want to locate a specific item directly; check its preview before confirming. If the item is already among the visible rows, use `/` and then `n` / `N` to move the Cursor to the relevant record. Open the Cursor item with `Enter` or `o`.

In Reader, use `/` to find a phrase in the PDF and `n` / `N` to move between its results. Use Neo's Back/Forward shortcuts to revisit eligible Reader or Main destinations. If you need the Reader item's library row, open `:` and choose **Show current item in Library**; this action is available in Reader and Note palettes, is unbound by default, and uses the active Reader or Note item rather than Main Selection. See [Reader and capture workflows](READER_GUIDE.md) and [Capture to notes](CAPTURE_GUIDE.md) for continuing from selected PDF text.

When you want a different open tab rather than the prior navigation destination, use `<Space>,` or `H` / `L`. To find a note, use `<Space>fn`; start from the current item's notes and choose **Browse library** when you want to expand to library-wide notes. See the [Notes guide](NOTE_GUIDE.md) for opening and working with notes.
