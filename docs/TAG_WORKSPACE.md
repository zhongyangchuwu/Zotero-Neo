# Item Select and Tag Workspace

Zotero Neo keeps item selection and tag mutation on Zotero's native data model.
Neo adds keyboard interaction and a persistent editing surface; it does not keep
a second item-selection set or a private tag database.

## Main item selection

With focus in Zotero's main item list:

- `v` enters `ITEM SELECT` from the currently focused item.
- `j` / `k` extend or shrink the native Zotero range; counts work (`5j`).
- `gg` / `G` extend to the first or last row.
- `o` swaps the active endpoint while keeping the same range.
- `v` finishes Item Select and preserves the native multi-selection.
- `Esc` cancels Item Select and collapses back to the focused item.

The selected rows remain Zotero's own `TreeSelection`. Commands such as tag
editing and trash therefore see the same selection that Zotero sees.

Item Select is intentionally limited to the main item list. The collection tree
is still a single active collection/navigation context rather than a
`TargetSet<Collection>` workflow.

## Open the Tag Workspace

Use `<Space>ta` from Main, Reader, or Note contexts.

Target normalization is context-aware:

- **Main**: all currently selected main-window items.
- **Reader**: the active attachment's parent bibliographic item when one exists.
- **Note**: a child note's parent bibliographic item when one exists; otherwise
  the standalone note itself.
- A focused Reader context-note editor owns the target while it has focus.

Child attachments/notes are normalized and deduplicated before mutation.
Cross-library target sets are rejected rather than silently mixing library tag
catalogues.

`<Space>fT` remains the separate tag **filter** picker. Filtering never mutates
item tags.

## Assignment state

For more than one target, each tag has one of three states:

- `[x]` — every target has the tag.
- `[-]` — only some targets have the tag.
- `[ ]` — no target has the tag.

The Workspace stays open after a mutation so several tags can be edited in one
session.

Keys:

- `Tab`: accept the highlighted completion.
- `Up` / `Down` or `Ctrl+k` / `Ctrl+j`: move through suggestions.
- `Enter`: enter a namespace, create a new manual tag, or add the selected tag
  to targets that do not already have it. On `[x]`, it is a no-op.
- `Shift+Enter`: remove the selected existing tag from targets that currently
  have it.
- `Esc`: clear a non-empty query; with an empty query, close the Workspace.

Add/remove is deliberately asymmetric: `Enter` is non-destructive, while
removal requires `Shift+Enter`.

## Virtual tag paths

Zotero still stores ordinary flat tag strings. Neo may interpret a configurable
separator as a virtual path only for input and browsing.

With the default `/` separator, existing tags such as:

```text
method/diffusion-transformer
method/flow-matching
dataset/libero
```

produce virtual namespaces such as `method/` and `dataset/`. Typing `me` can
suggest `method/`; after accepting it, child completion is scoped under that
namespace.

There are no parent tag objects, inheritance rules, or Neo-owned taxonomy data.
Changing the separator only changes Neo's interpretation. An empty separator
means completely flat tag matching.

The separator is currently read from the Neo preference key `tags.separator`
and defaults to `/`. A visible preference control is deferred until the input
model has had more real-world use.

## Persistence and performance

Tag mutations use Zotero `Item.addTag()` / `removeTag()` and saves inside one
`Zotero.DB.executeTransaction()` for the semantic batch. Neo does not write the
`itemTags` database table directly.

Only targets that need the requested transition are saved. Successful edits
reuse the Workspace's in-memory tag catalogue instead of reloading the full
library tag list after every mutation.

Library-wide rename/delete/color operations are intentionally outside this
workflow. Those are catalogue operations rather than item-tag assignment and
need separate semantics.
