# Library Interaction Model (v0.2)

This document defines the interaction contract for Zotero Neo's v0.2 Library
workflow. It is the design source of truth for issue #55 before further
selection/filter implementation is merged.

The goal is not to reproduce Vim or Yazi mechanically. Neo should expose a
keyboard-first model that fits Zotero's actual host behavior while keeping
navigation, selection, filtering, and object actions predictable.

## Core model

```text
View = Query + Sort
          |
          v
   visible ordered items
          |
        Cursor
          |
   +------+------+
   |             |
 VisualTarget   Selection
   |             |
   +------v------+
     Object Action
```

These concepts are related but must not be conflated.

### View

A View is the native Zotero result set and ordering produced by:

- one or more library / collection / saved-search scopes;
- Quick Search;
- tag predicates;
- Advanced Search;
- result-level options;
- sort order.

Neo should adapt these native mechanisms rather than introduce a parallel query
AST unless a future workflow demonstrates a concrete need.

Changing a View may make previously selected items invisible. It must not, by
itself, redefine Neo's persistent Selection.

### Cursor

Cursor is the currently focused item in the visible ordered View.

Cursor:

- belongs to the current View;
- is moved by ordinary navigation and local find;
- does not imply membership in Selection;
- is the target for single-item inspection/navigation commands;
- supplies the anchor when entering Visual.

Normal item navigation must therefore be focus-only. It must not call a host
operation that collapses Selection merely to move the focused row.

Where Zotero exposes only private focus-only seams, Neo should isolate them
behind a named host adapter.

### Selection

Selection is an ephemeral Neo-owned workset of stable item identities.

Conceptually:

```text
Selection = Set<{ libraryID, itemID }>
```

Selection is deliberately not identical to Zotero's current `TreeSelection`.
The latter stores row indexes in the current rendered result tree, so it cannot
represent items hidden by a changed filter/scope and is not stable across sort
or refresh.

Neo remains subordinate to Zotero's data model:

- Zotero Item objects and database state remain authoritative;
- Selection stores only identities, not duplicate item data;
- Selection is session interaction state, not persisted library data;
- mutations still use Zotero APIs and transactions.

The current visible Zotero tree may project visible members of Selection for
host/UI compatibility, but that projection is not the complete source of truth.

A minimal ambient indicator should eventually make this distinction visible,
for example:

```text
Selection 7 · 3 visible
```

### EffectiveSelection

Object actions that are defined as workset actions use:

```text
EffectiveSelection =
    Selection non-empty -> Selection
    Selection empty     -> { Cursor }
```

This gives ordinary single-item operation when no explicit workset exists,
without requiring every action to special-case a separate selection mode.

Not every action consumes EffectiveSelection. Target ownership remains
action-specific; see **Action target contracts** below.

### VisualTarget

Visual is a transient contiguous range-shaped Cursor.

It is not persistent Selection and it is not a generic "Target Edit" mode.

```text
Normal Cursor -> v -> VisualTarget(anchor, head)
```

While Visual is active:

- motion changes `head`;
- grow and shrink are both reversible;
- `o` may swap anchor/head;
- Selection is unchanged until an explicit selection operation commits the
  range;
- cancel discards the transient range without modifying Selection.

Visual must track stable item identities where needed. It must not implement
editable range semantics by repeatedly unioning native `shiftSelect(...,
augment=true)`, because shrinking such a range leaves the old tail selected.

## Selection operations

Selection operations act on the current CursorTarget:

```text
Normal Cursor -> CursorTarget = { cursor item }
Visual Cursor -> CursorTarget = contiguous visual range
```

The initial high-frequency operation is Toggle Selection.

For a target set `T`:

```text
if T is entirely contained in Selection:
    Selection = Selection - T
else:
    Selection = Selection union T
```

This all-or-none rule treats a Visual range as one target. It intentionally does
not use symmetric difference, which would create surprising holes when only
part of a range was already selected.

### Normal Cursor toggle

The proposed default interaction is Yazi-like:

```text
Space -> toggle item under Cursor -> move Cursor down
```

The move-after-toggle behavior is part of the workflow contract to dogfood, not
an incidental key implementation detail. At the end of the result set, Cursor
remains clamped to the last valid item.

### Visual toggle

In Visual:

```text
Space -> apply Toggle Selection to VisualTarget -> return to Normal
```

Visual commit does not require a second independent "finish selection mode"
concept.

## No Selection mode

Selection itself has no mode.

The existing `main-select` binding scope is an implementation/persisted-keymap
artifact from v0.1. It may temporarily remain while the code is migrated, but
its user-facing meaning in v0.2 is Visual range editing only.

Do not reintroduce a generic mode whose purpose is "editing the selected set".
Toggle/add/remove operations should instead operate on the target represented by
Cursor or Visual.

## Local find versus filter

Find and Filter are separate operations.

### Local find

Local find:

- searches only within the current visible ordered View;
- moves Cursor to a match;
- does not change Query, Sort, Selection, or scope;
- does not fall back to a global item chooser;
- does not clear filters when no match is found.

`/` with `n/N` is reserved as the leading candidate for this behavior because
it matches the existing Reader find grammar. The key is not frozen until the
interaction slice is dogfooded.

### Filter

Quick Search, Advanced Search, and tag predicates mutate View.

They may change which Selection members are visible but must not silently mutate
the complete Selection workset.

Tag actions such as `tf/tc` remain convenience operations over tag predicates;
they are not the complete filter model.

## Scope

The collection/library tree is a separate Scope layer.

Zotero can represent multiple selected collection/saved-search/library rows.
Neo should audit that capability as `ScopeSet`, but item Selection and ScopeSet
must remain distinct concepts.

Do not create a collection-selection mode merely for symmetry with item
selection.

## Action target contracts

There is intentionally no universal Target resolver for every command.

Each semantic action must document:

- owning surface/state;
- target kind;
- whether it changes View, Cursor, Selection, or Zotero data;
- behavior when Selection is non-empty;
- cardinality requirements;
- cancellation/restoration semantics;
- unavailable-target behavior.

Initial target policy:

| Action family | Target contract |
| --- | --- |
| `j/k/gg/G`, local find | Cursor only |
| inspect/open current item or PDF | Cursor |
| Add/Remove Tag | EffectiveSelection, then tag-specific parent normalization |
| Trash/restore batch operations | EffectiveSelection with destructive preflight policy |
| Add/remove collection membership | EffectiveSelection |
| Visual selection operation | VisualTarget -> Selection |
| Quick/Advanced/tag filtering, sort | View only |
| citekey/citation copy | explicitly support multiple items or reject unsupported cardinality; never silently use index 0 |

Action-specific normalization remains important. For example, tagging an
attachment may intentionally normalize to its parent while deleting an
attachment must not silently do so.

Code patterns such as `getSelectedItems()[0]` are not a valid implicit target
contract once Cursor can be detached from Selection.

## Hidden Selection safety

A persistent workset introduces hidden targets by design.

Until a dedicated Selection Panel and preflight UX exist:

- hidden Selection members must never silently receive an unexpected destructive
  operation;
- dangerous actions should refuse or explicitly surface hidden-target counts;
- non-destructive batch actions should still communicate total and visible
  counts where this materially changes user expectations.

A future Selection Panel is an inspector/manager for the workset:

- list members;
- show visible/hidden state;
- remove members;
- clear Selection;
- reveal a selected member.

It is not an operation console.

## Return context

"Reveal in Library" and "return to previous work context" are distinct actions.

Native Zotero item selection can clear Quick Search, tag filters, or Advanced
Search when an item is not found in the current result set. Therefore returning
from Reader/Note after a navigation excursion requires a separate context
contract that may include:

- originating View/query state;
- Cursor identity;
- Selection identities;
- scroll position;
- active Reader/Note context.

Do not claim that a native reveal operation preserves triage context unless that
behavior is explicitly verified.

## Keymap direction

### Main

The proposed Main grammar is:

```text
Space       Toggle Selection at Cursor / VisualTarget
j/k         move Cursor
gg/G        first/last Cursor
v           enter Visual
Visual j/k  move Visual head
Visual o    swap endpoints
Visual Space commit Toggle Selection and exit
Visual Esc/v cancel Visual and exit
```

`Ctrl+h/j/k/l` remains directional pane focus and is not reused for item
selection.

`Tab/Shift+Tab` is not a default selection proposal. Besides native focus
semantics, the current key-token representation does not encode Shift as an
independent modifier for keys such as Tab/Arrow.

### Releasing Space in Main

Current Main semantic commands such as:

```text
<Space>ff  <Space>fc  <Space>fn
<Space>ta  <Space>tr  <Space>tf  <Space>tc
<Space>pp
<Space>yy  <Space>o  <Space>q  <Space>,
<Space>e
<Space>wh  <Space>wl  <Space>ww
```

should be evaluated as direct Main prefixes without the leading Space:

```text
ff fc fn
ta tr tf tc
pp
yy o q ,
e
wh wl ww
```

Reader and Note do not need to lose their Space leader merely because Main uses
Space for Toggle Selection.

This migration must go through the binding engine and keymap migration machinery;
do not special-case raw Space in the Main controller.

## Prefix Guide, not Leader Guide

The current Key Guide is hard-coded to Space-prefixed sequences. If Main releases
Space, discoverability must be generalized to any pending binding prefix.

Examples:

```text
t
|- a  Add Tag
|- r  Remove Tag
|- f  Toggle Tag Filter
'- c  Clear Tag Filters

f
|- f  Find Items
|- c  Find Collection Items
'- n  Find Notes
```

The guide must remain a projection of the resolved binding map. It must not
create a second command registry.

Space-leader behavior may remain one instance of this more general Prefix Guide
on Reader/Note surfaces.

## Host/state ownership

The intended ownership boundary is:

```text
Zotero
  owns Item data, native queries, result trees, and host operations

Neo Main session
  owns ephemeral Selection identities

Neo Visual feature
  owns only transient anchor/head range state

Neo host adapter
  owns guarded private seams required for focus-only movement/projection
```

Avoid introducing a generic project-wide Target framework solely for this work.
Use narrow feature owners and action contracts.

## Implementation sequence

### Phase A - Freeze interaction contract

1. Persist this document.
2. Link it from Architecture/Roadmap.
3. Update #55 so its goal and phases no longer describe native TreeSelection as
   the complete persistent TargetSet.
4. Do not merge the old `feat/library-targeting-phase1` prototype as-is.

### Phase B - Selection and Cursor substrate

1. Add a session-scoped `SelectionStore<ItemRef>`.
2. Add host adapters for focus-only Cursor movement and visible item/row mapping.
3. Make normal Main navigation preserve Selection.
4. Project visible Selection members into the current tree only where required.
5. Track items by stable identity across sort/refresh.
6. Add minimal ambient Selection count feedback.

### Phase C - Main keymap and Prefix Guide

1. Migrate Main semantic Space-leader defaults to direct prefixes.
2. Bind Space to Toggle Selection.
3. Preserve `Ctrl+h/j/k/l` pane-focus grammar.
4. Generalize Key Guide from Space-only leader prefixes to arbitrary pending
   prefixes.
5. Add migration/override tests so existing user customizations are not silently
   re-enabled or reassigned.

### Phase D - Visual range

1. Rework the old Main Item Select feature into Visual range state.
2. Keep Selection unchanged while Visual moves.
3. Implement grow/shrink/swap by anchor/head, not accumulated native range
   union.
4. Commit Toggle Selection on Space.
5. Cancel on Esc/`v` without Selection mutation.

The persisted binding scope may temporarily remain `main-select`; renaming it
to `main-visual` is a separate schema-migration decision.

### Phase E - Action target audit

Start with actions that expose different target semantics:

1. Open PDF / inspect current item;
2. citekey/citation copy;
3. Trash/restore;
4. Add/Remove Tag.

Then extend the same explicit contract to collection membership and later batch
actions.

### Phase F - Selection inspection and safety

Add Selection Panel / hidden-target preflight once the substrate is stable.

### Phase G - Local find, View filters, ScopeSet

Only after Cursor/Selection/Visual semantics are stable:

1. add non-destructive local find;
2. unify Quick/Advanced/tag View actions;
3. audit multi-scope collection selection;
4. add return-context behavior.

## Acceptance scenarios

Before the model is considered stable, dogfood at least these scenarios:

1. Press Space repeatedly on adjacent rows: each item toggles and Cursor advances.
2. Selection contains A/C; move Cursor from C to F: A/C remains selected.
3. With Selection A/C and Visual B..E, grow, shrink, swap endpoints, then cancel:
   Selection remains A/C.
4. Commit the same Visual range with Space: the all-or-none target rule is
   applied.
5. Change a filter so only three of seven selected items remain visible:
   Selection still contains seven stable item identities and UI reports the
   visible subset.
6. Sort or refresh: Cursor and Selection recover by item identity, not stale row
   index.
7. Move focus to the collection tree and press Space: item Selection is not
   accidentally toggled.
8. Reader/Note Space leader, IME handling, and `Ctrl+h/j/k/l` focus behavior do
   not regress.
9. Selection A/B with Cursor on unselected C: inspect/open targets C while
   workset actions target A/B according to their explicit contracts.
10. A local find miss leaves Query/scope/filter/Selection untouched.

## Compatibility watch

Zotero host seams involved here are private and may change across rapid Zotero
major releases. In particular, before depending more deeply on private
TreeSelection/item-tree behavior, run this interaction slice against Zotero 11
Beta when it becomes available and keep version-sensitive operations behind
named adapters.
