# Tag items and filter the Main view

Tag actions change Zotero tags on items; tag filters change which items Main displays. Mutation targets and filter candidates follow different rules.

## Add or remove tags

In Main, Reader, or Note Normal, press `<Space>ta` to add a tag or `<Space>tr` to remove one. Choose a tag in the chooser; the same chooser has different candidates for each action:

- **Add** searches tags in the target item's library and tags already assigned to the targets. If the query is not an existing tag, an explicit **+ Create** candidate can create it.
- **Remove** offers tags assigned to at least one target. If a tag is assigned to some but not all targets, the chooser can show that mixed state.
- Add ensures the chosen tag is present on every target; Remove ensures it is absent from every target. Items already in the requested state are not changed or saved.

A mutation needs at least one target, and every target must be available. Neo refuses the whole mutation if any target is missing rather than changing only the available items. All targets must belong to one library; a batch across libraries is refused.

### Which items are changed?

- **Main:** a non-empty persistent Neo Selection takes precedence. Otherwise, the current target is the temporary Visual range, Zotero native multi-selection, or item Cursor.
- **Reader:** the active Reader item's parent bibliographic item when it has one. Main Selection is not used.
- **Note:** the active note-context item's parent bibliographic item when it has one; otherwise the standalone note itself.

Before a batch tag change, review the effective target. In particular, a Main Selection can include items outside the current filtered rows; see [Library worksets and the Selection Panel](MAIN_GUIDE.md#keep-opening-and-batch-selection-separate).

## Filter the Main item list

From Main Normal, `<Space>tf` opens the tag chooser and toggles one tag filter. Candidates come from the current library or collection view plus active filters, not from the mutation target Selection. Confirming a tag changes the Main view and closes the chooser. Zotero combines active tag filters with **AND** semantics.

`<Space>tc` clears all Main tag filters without opening a chooser. With no filters active, it leaves the view unchanged. Reader and Note do not offer these filter commands. See [Search and navigation](SEARCH_GUIDE.md) for how tag filters combine with other Main view scopes.

## Virtual tag paths

Zotero tags remain flat strings. In a tag chooser, Neo can present matching prefixes as virtual folders to narrow the search. For example, with the default `/` separator, `method/diffusion-transformer` and `method/flow-matching` can offer `method/` as a namespace candidate. Choose one to narrow the query. A namespace candidate only refines the query; it never adds, removes, or filters a tag.

For Add Tag, choose a terminal existing tag or an explicit **+ Create** candidate. Remove Tag and Main filters use existing tags. The separator is configured in **Neo Settings → Advanced → Tag namespaces** and defaults to `/`; an empty value uses flat tag matching. Changing the separator changes how candidates are grouped, not stored tag names, and does not create parent tags. See [Tag namespace settings](SETTINGS_GUIDE.md#use-tag-namespaces).

For complete bindings and target-resolution behavior, see the [Command Reference: Main window](COMMAND_REFERENCE.md#main-window).
