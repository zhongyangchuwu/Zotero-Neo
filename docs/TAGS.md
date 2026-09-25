# Selection and Tag Actions

Zotero Neo keeps Zotero authoritative for Item data and mutations, while Main
interaction state separates Cursor, persistent Selection, and transient Visual
ranges. Selection stores only stable item identities for the current session;
Zotero's native TreeSelection is used as a visible projection rather than the
complete workset source of truth.

## Main Selection and Visual

With focus in Zotero's main item list:

- `j` / `k` move Cursor without changing Selection.
- `s` toggles the Cursor item in Selection, then advances Cursor down.
- `v` enters a transient Visual range anchored at Cursor.
- Visual `j` / `k` / `gg` / `G` move the range head.
- Visual `o` swaps anchor and head.
- Visual `s` commits the whole range to Selection and returns to Normal.
- Visual `v` / `Esc` cancel the range without modifying Selection.

Range commit is all-or-none: if every item in the Visual range is already in
Selection, the whole range is removed; otherwise the whole range is added.

Visual temporarily uses Zotero's native row selection to render the contiguous
range, then restores the visible Selection projection on commit/cancel.
Selection itself is a Neo-owned session workset of stable item identities, so
moving Cursor or editing a Visual range does not redefine it.

The collection tree remains a separate scope/navigation context. Pressing `s`
there never toggles item Selection; it operates on Zotero's native ScopeSet
instead. A sole selected scope is pinned and ScopeCursor advances, after which
`s` can add/remove native scope rows without introducing a second Neo-owned
scope store. Space remains the command leader in both item and collection panes.

## Tag action vocabulary

The default Tag namespace is explicit:

| Action | Main | Reader / Note |
| --- | --- | --- |
| Add one tag to the current target(s) | `<Space>ta` | `<Space>ta` |
| Remove one tag from the current target(s) | `<Space>tr` | `<Space>tr` |
| Toggle one Main-window tag filter | `<Space>tf` | — |
| Clear all Main-window tag filters | `<Space>tc` | — |

`<Space>ta` and `<Space>tr` use the same semantic item actions across Main,
Reader, and Note. `<Space>tf` and `<Space>tc` only change the
Main item View. Tag candidate choice remains in `TagActions`, while the actual
tag-predicate View mutation is delegated to `MainViewActions`. The filter
actions are Main-only so Reader/Note commands do not silently change an
off-screen Main filter.

## Target resolution for tag mutation

Add/Remove Tag are available from Main, Reader, and Note when Neo can resolve
a taggable target set:

- **Main**: EffectiveSelection (explicit Neo Selection, otherwise Cursor).
- **Reader**: the active Reader item's parent bibliographic item when one exists;
  Main Selection is never borrowed.
- **Note**: the active note-context item's parent bibliographic item when one
  exists; otherwise the standalone note itself.

These rules come from the shared contextual item-target resolver rather than a
Tag-specific context detector.

Child attachments/notes are normalized and deduplicated before mutation.
Cross-library target sets are rejected rather than silently mixing library tag
catalogues.

For multi-item targets, assignment state is presentation metadata rather than a
toggle rule. The chooser may show that a tag is assigned to all targets or only
some of them, but the action stays unambiguous:

- `ta` ensures the chosen tag is present on every target.
- `tr` ensures the chosen tag is absent from every target.

## Shared tag chooser

Actions that need a tag use the same narrow candidate surface as the other Neo
choosers. The surface owns query, ranking, highlight, preview, IME handling,
confirmation, and cancellation. It does not own a second Tag-specific command
grammar.

Common controls:

- type in the focused input to filter candidates;
- `Up` / `Down` or `Ctrl+k` / `Ctrl+j` move the highlighted row;
- `Ctrl+u` / `Ctrl+d` scroll the preview;
- `Enter` confirms one terminal tag candidate;
- `Escape` cancels.

Add Tag searches the current library tag catalogue plus tags already present on
the targets. If the query does not exactly match an existing tag, Neo offers an
explicit `+ Create "..."` candidate.

Remove Tag lists only tags currently present on at least one target.

`<Space>tf` lists tags relevant to the current Main collection/library view together
with already-active filters. Confirming one candidate toggles only that tag and
then closes the chooser. Active filters continue to use Zotero's native **AND**
semantics.

`<Space>tc` opens no chooser. It is safe when no tag filter is active.

## Virtual tag paths

Zotero still stores ordinary flat tag strings. Neo may interpret a configurable
separator as a virtual path only for candidate refinement.

With the default `/` separator, existing tags such as:

```text
method/diffusion-transformer
method/flow-matching
dataset/libero
```

produce virtual namespace candidates such as `method/` and `dataset/`.
Confirming a namespace candidate narrows the query; it does not mutate data.
A terminal existing/create candidate is still required before the semantic
action executes.

There are no parent tag objects, inheritance rules, or Neo-owned taxonomy data.
Changing the separator only changes Neo's interpretation. An empty separator
means completely flat tag matching.

The separator is configured in **Neo Settings → Advanced → Tag namespaces**,
is stored in the Neo preference key `tags.separator`, and defaults to `/`.

## Persistence and performance

Tag mutations use Zotero `Item.addTag()` / `removeTag()` and save inside one
`Zotero.DB.executeTransaction()` per semantic batch. Neo does not write the
`itemTags` database table directly.

Only targets that need the requested transition are saved.

Library-wide rename/delete/color operations remain outside this workflow. Those
are catalogue-management operations with different semantics. If repeated
high-volume tag management later justifies a persistent surface, it should be an
explicit Tag Manager rather than an expansion of the chooser contract.
