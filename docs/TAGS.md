# Tag items and filter the Main view

Neo separates changing Zotero tags on items from filtering which items Main displays. Add and Remove work from Main, Reader, or Note; tag filters are Main-only and change the view without changing item tags.

## Try it

1. In Main's item list, put the Cursor on one item. If you want a single-item example, clear any persistent Neo Selection with `<Space>sc` first.
2. Press `<Space>ta`, type a tag name, and choose an existing tag. To make a new tag, select the explicit **+ Create** candidate and confirm.
3. Press `<Space>tf` and choose a tag to filter the Main list. Toggle a second tag to narrow the results further; press `<Space>tc` to clear all tag filters.

## Choose between tagging and filtering

| Goal | Use | What changes |
| --- | --- | --- |
| Add a Zotero tag to the current item or target set | `<Space>ta` from Main, Reader, or Note | Item tags; Add can create a tag with the explicit **+ Create** candidate. |
| Remove a tag from the current item or target set | `<Space>tr` from Main, Reader, or Note | Item tags; Remove does not delete the tag from Zotero's tag catalogue. |
| Show only items with a chosen tag | `<Space>tf` from Main | Main's tag-filter set; Zotero combines active tag filters with **AND**. |
| Return to the unfiltered tag view | `<Space>tc` from Main | Clears all active Main tag filters; it does not change item tags. |

The Tag Filter chooser lists tags from the current Main view and keeps active filters available to remove even when no rows match. When Zotero combines several collection or library scopes, the candidates reflect that combined view.

## Choose the items that receive a tag

Choose where to start according to the items you want to change:

- **Main:** a nonempty persistent Neo Selection takes priority. Otherwise, the action uses the current Visual range, Zotero native multi-selection, or Cursor.
- **Reader:** the active Reader item's parent bibliographic item when available. Main Selection is not used.
- **Note:** the active note-context item's parent bibliographic item when available, or the standalone note itself.

Keep a batch within one Zotero library. If Main shows items from several libraries, split them into separate worksets for tag changes. Attachments and child notes use their parent item where appropriate. Adding a tag to a group makes it present on every item; removing it makes it absent from every item.

In Main, a tag filter does not replace a nonempty persistent Selection as the target for a tag mutation. Review Selection separately from the filtered rows; [Library worksets and the Selection Panel](MAIN_GUIDE.md#keep-opening-and-batch-selection-separate) explains how persistent Selection and Visual targets differ.

## Choose, create, and remove tags

Type to filter the shared tag chooser, choose a result, and press `Enter` to confirm or `Escape` to cancel. [Search and navigation](SEARCH_GUIDE.md#find-and-confirm-a-destination) explains the shared chooser controls.

Add searches tags in the target's library and tags already assigned to the target. If the query does not exactly match an existing tag, choose **+ Create** to add that new Zotero tag to the target. Remove lists tags assigned to at least one target item; choosing one removes it from all target items. Remove never deletes or renames a tag in the Zotero catalogue.

## Filter with multiple tags

Press `<Space>tf` to toggle a tag filter on or off. With multiple active tags, Zotero's **AND** behavior shows only items carrying every chosen tag. Quick and Advanced Search stay in place. Use `<Space>tc` to clear the tag filters, or toggle one active tag off to broaden the results.

For example, turn on `needs-review`, then `method/diffusion`. The list narrows to items carrying both tags; no item tag is added or removed. Inspect the rows, and use `s` in the Main item list to collect chosen items into persistent Selection. The filter and Selection are separate: clearing filters keeps the workset, while `<Space>sc` clears the workset. Before a later batch tag action, check whether Selection is nonempty because it then takes priority over the Cursor and current filtered rows.

## Use virtual tag paths

Zotero tags remain flat strings. Neo can use a configurable separator to narrow long tag lists: with the default `/`, a tag such as `method/diffusion-transformer` can expose `method/` as a virtual namespace candidate. Confirming a namespace narrows the chooser; it does not add or remove a tag. Choose a final existing tag—or **+ Create** for Add—to apply the action.

Set **Namespace separator** under **Neo Settings → Advanced** to choose the delimiter, or leave it empty for flat matching. Stored Zotero tag names stay unchanged. See [Tag namespace settings](SETTINGS_GUIDE.md#use-tag-namespaces).

For complete bindings and target-resolution behavior, see the [Command Reference](COMMAND_REFERENCE.md#main-window).
