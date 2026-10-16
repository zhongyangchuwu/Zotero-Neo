# Selection and Tag Actions

Use the tag actions to add or remove tags from items, or to filter the Main item list by tag. Mutation targets and filter candidates have different rules.

## Add or remove tags

In Main, Reader, or Note Normal, press `<Space>ta` to add a tag or `<Space>tr` to remove one. The chooser asks which tag to use; it does not change the meaning of the action:

- **Add** searches tags in the target item's library and tags already assigned to the targets. If the query is not an existing tag, an explicit `+ Create "…"` candidate can create it.
- **Remove** offers only tags assigned to at least one target. If a tag is assigned to some but not all targets, the chooser can show that mixed state.
- Add ensures the chosen tag is present on every target; Remove ensures it is absent from every target. Items already in the requested state are not changed or saved.

A mutation needs at least one target, and every target must be available. If any target is missing, Neo refuses the whole mutation rather than changing only the available items. All targets must also belong to one library; targets from different libraries cannot be changed together.

### Which items are changed?

- **Main:** a non-empty persistent Neo Selection takes precedence. Otherwise the current target is used: a temporary Visual range, native multi-selection, or the item Cursor.
- **Reader:** the active Reader item's parent bibliographic item when it has one. Main Selection is not used.
- **Note:** the active note-context item's parent bibliographic item when it has one; otherwise the standalone note itself.

## Filter the Main item list

From Main Normal, `<Space>tf` opens the tag chooser and toggles one tag filter. Its candidates come from the current library/collection view plus active filters, not from the mutation target selection. Confirming a tag changes the Main view and closes the chooser; Zotero combines active tag filters with **AND** semantics.

`<Space>tc` clears all Main tag filters without opening a chooser. With no filters active, it leaves the view unchanged. Reader and Note do not offer these filter commands.

## Virtual tag paths

Zotero tags remain flat strings. In a tag chooser, Neo can present matching prefixes as virtual folders to narrow the search. For example, with the default `/` separator, these tags:

```text
method/diffusion-transformer
method/flow-matching
dataset/libero
```

can offer `method/` and `dataset/` as namespace candidates. Choose one to narrow the query. For Add Tag, choose a terminal existing tag or an explicit create candidate; Remove Tag and Main filters use existing tags. A namespace candidate only refines the query; it never adds, removes, or filters a tag by itself.

The separator is configured in **Neo Settings → Advanced → Tag namespaces** and defaults to `/`. An empty separator uses flat tag matching. Changing the separator changes only how tag candidates are grouped; it does not rewrite stored tags or create parent tags.