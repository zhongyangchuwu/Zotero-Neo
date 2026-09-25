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
Zotero's native item TreeSelection may also temporarily contain multiple visible
items from host gestures such as `Ctrl+A` or pointer selection. That native
selection is an immediate visible target, not a persistent Neo workset.

A minimal ambient indicator should eventually make this distinction visible,
for example:

```text
Selection 7 · 3 visible
```

### EffectiveSelection

Object actions that are defined as workset actions use:

```text
EffectiveSelection =
    Selection non-empty                 -> Selection
    Selection empty + native multi-set -> native selected items
    otherwise                           -> { Cursor }
```

This preserves ordinary single-item operation while interoperating with Zotero's
visible multi-selection. A native multi-set is intentionally ephemeral: Neo
navigation may collapse it back to Cursor, while `s` can promote it into the
persistent Selection workset.

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

Selection operations act on the current selection target:

```text
Normal + native multi-set -> SelectionTarget = native selected items
Normal otherwise          -> SelectionTarget = { cursor item }
Visual                     -> SelectionTarget = contiguous visual range
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

### Normal target toggle

The default persistent-set interaction accepts Zotero's current visible target:

```text
native multi-set present -> s toggles that whole target in Selection
otherwise                -> s toggles Cursor item in Selection
                            then moves Cursor down
```

This makes native gestures such as `Ctrl+A` composable with Neo: `Ctrl+A`, then
`s`, promotes the visible native selection into the persistent workset. The
all-or-none rule still applies when part of the target is already selected.
After a successful Normal toggle, Cursor advances and the transient native
multi-selection may collapse to the new Cursor anchor.

### Visual toggle

In Visual:

```text
s -> apply Toggle Selection to VisualTarget -> return to Normal
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
must remain distinct concepts. Native multi-scope views remain supported where
Zotero creates them, but Neo does not currently assign `s` a ScopeSet mutation
grammar. Collection-tree `s` is left to Zotero rather than being consumed by Neo.

Do not create a collection-selection mode merely for symmetry with item
selection.

## Action target contracts

Neo distinguishes **item actions** from View/local-surface actions.

Item actions share one contextual item-target resolver:

- Main -> EffectiveSelection (persistent Neo Selection, otherwise native visible multi-selection, otherwise Cursor);
- Reader -> the active Reader item, normalized to its parent bibliographic item when present;
- Note -> the active note-context item, with the same parent normalization.

The semantic action still owns cardinality, mutation safety, and any additional
preflight. Main View actions and Reader-local PDF actions do not use this item
resolver.

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
| Add/Remove Tag | shared contextual item target; Main may be batch, Reader/Note contextual single target |
| Trash/restore batch operations | EffectiveSelection with destructive preflight policy |
| Add/remove collection membership | shared contextual item target; Main batch or Reader contextual item |
| Visual selection operation | VisualTarget -> Selection |
| Quick/Advanced/tag filtering, sort | View only |
| citekey/citation copy | shared contextual item target; Main supports batches, Reader/Note remain contextual single-target |

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

## Knowledge capture

Reader text capture is a cross-surface workflow but not a cross-surface target
ambiguity. Reader owns the transient Visual selection and passes a DOM-free
`ReaderSelectionContext` snapshot to Main. Main owns the persistent Notes
picker and note mutation.

The initial capture contract is:

- snapshot selected text, Reader item identity, page label, and position before
  opening any chooser;
- resolve the Reader attachment to its bibliographic parent for note ranking and
  library scope;
- list existing notes from only that library, with current-item child notes
  first;
- re-resolve and validate the chosen note before mutation;
- append through Zotero-native `getNote()/setNote()/saveTx()`;
- keep annotation-comment creation (`Add note`) separate from persistent
  Zotero-note capture (`Capture to note`);
- cancellation or target invalidation performs no mutation.

Picker remains a target resolver. It does not own note creation, append
semantics, or Reader selection state.

## Return context

"Reveal in Library" and "return to previous work context" are distinct actions.

Native Zotero item selection can clear Quick Search, tag filters, or Advanced
Search when an item is not found in the current result set. Neo therefore keeps
one session-owned return bookmark for explicit reveal/navigation excursions.

The initial bookmark stores only restorable navigation state:

- native ScopeSet row identities;
- Quick Search text and tag predicates;
- whether Advanced Search was active;
- Cursor item identity;
- originating Main panel/focus and tab identity.

Neo Selection is **not** copied into the bookmark. It remains the same
session-owned workset across reveal and return.

Return restores in dependency order: scope, View predicates, visible Selection
projection/Cursor, then tab/focus context. Advanced Search absence is reversible
by closing the native editor. If a reveal destroys an existing Advanced Search
condition set, Neo reports a partial return rather than inventing conditions it
cannot reconstruct.

The bookmark is single-level, not a history stack. Main and Reader share
`gr` as explicit return navigation. Opening a Main item into Reader/Note captures
the bookmark only immediately before a real host navigation; failed opens restore
the previous bookmark. Reader `gr` returns to the originating Main tab/View but
does not close the Reader tab. Closing Reader/Note does not automatically restore it.

Do not claim that a native reveal operation preserves triage context unless that
behavior is explicitly verified.

## Keymap direction

### Main

The v0.2 Main grammar is:

```text
Space       command namespace / leader
s           item list: toggle current native target in Selection; collection tree: native Zotero behavior
j/k         move Cursor
<num>j/k    relative Cursor jump
gg/G        first/last Cursor
/ n N       local find/repeat without changing View
v           enter Visual
Visual j/k  move Visual head
Visual o    swap endpoints
Visual s    commit Toggle Selection and exit
Visual Esc/v cancel Visual and exit
```

The same Space-led semantic groups are used across Main, Reader, and Note where
the action exists. Main keeps navigation and activation direct: local find,
motions, pane/tree navigation, `o`, `gr`, `H/L`, and `:` do not require the
leader.

`Ctrl+h/j/k/l` remains directional pane focus and is not reused for item
selection.

`Tab/Shift+Tab` is not a default selection proposal. Besides native focus
semantics, the current key-token representation does not encode Shift as an
independent modifier for keys such as Tab/Arrow.

### Unified Space command namespace

Main semantic command groups use the same root as Reader/Note:

```text
<Space>ff  <Space>fc  <Space>fq  <Space>fa  <Space>fn
<Space>ta  <Space>tr  <Space>tf  <Space>tc
<Space>ca  <Space>cr
<Space>yy  <Space>pp
<Space>,   <Space>q
```

Space has no exact Main action. Persistent-set manipulation belongs to `s`, so
the leader never competes with Selection for timeout/prefix ownership.

This migration must go through the binding engine and keymap migration machinery;
do not special-case raw Space in the Main controller.

## Prefix Guide

The Prefix Guide is a projection of the resolved binding map. Space is the
default command root across Main, Reader, and Note, while the same guide engine
also supports non-Space pending prefixes such as `g` or `z`.

Examples:

```text
SPC › t
|- a  Add Tag
|- r  Remove Tag
|- f  Toggle Tag Filter
'- c  Clear Tag Filters

SPC › f
|- f  Find Items
|- c  Find Collection Items
|- q  Quick Search
|- a  Advanced Search
'- n  Find Notes
```

The guide must not create a second command registry.

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

1. Generalize Key Guide from a hard-coded leader UI to arbitrary pending prefixes.
2. Keep Space as the shared command namespace across Main/Reader/Note.
3. Bind Main persistent-set operations to `s` in Normal and Visual.
4. Preserve `Ctrl+h/j/k/l` pane-focus grammar and direct local navigation.
5. Add migration/override tests so existing user customizations are not silently
   re-enabled or reassigned.

### Phase D - Visual range

1. Rework the old Main Item Select feature into Visual range state.
2. Keep Selection unchanged while Visual moves.
3. Implement grow/shrink/swap by anchor/head, not accumulated native range
   union.
4. Commit Toggle Selection on `s`.
5. Cancel on Esc/`v` without Selection mutation.

The persisted binding scope may temporarily remain `main-select`; renaming it
to `main-visual` is a separate schema-migration decision.

### Phase E - Action target audit

Start with actions that expose different target semantics:

1. Open PDF / inspect current item;
2. citekey/citation copy;
3. Trash/restore;
4. Add/Remove Tag.

Main citekey copy is the second batch workflow built on the same target contract:
`<Space>yy` uses EffectiveSelection, normalizes through Zotero `Items.keepTopLevel()`,
deduplicates normalized targets, refuses stale or partially missing citekeys, and
copies raw Better BibTeX keys separated by one space. Reader/Note delegation
remains contextual single-target behavior.

Collection membership is the first batch workflow built on this contract:

- `<Space>ca` / `<Space>cr` operate on EffectiveSelection;
- normalize targets with Zotero's native `Items.keepTopLevel()`;
- require one library before resolving a collection target;
- Picker resolves one collection from that library but does not own mutation;
- confirmation re-resolves the item target signature so stale/changed worksets
  cannot receive a partial batch;
- add/remove skips existing no-op memberships and leaves Neo Selection unchanged.

Later batch actions should preserve the same owner/target/preflight separation.

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

1. Press `s` repeatedly on adjacent rows: each item toggles and Cursor advances.
2. Selection contains A/C; move Cursor from C to F: A/C remains selected.
3. With Selection A/C and Visual B..E, grow, shrink, swap endpoints, then cancel:
   Selection remains A/C.
4. Commit the same Visual range with `s`: the all-or-none target rule is
   applied.
5. Change a filter so only three of seven selected items remain visible:
   Selection still contains seven stable item identities and UI reports the
   visible subset.
6. Sort or refresh: Cursor and Selection recover by item identity, not stale row
   index.
7. Move focus to the collection tree and press `s`: Neo leaves the key to Zotero
   and does not mutate item Selection or invent ScopeSet semantics.
8. Reader/Main/Note Space leader, IME handling, and `Ctrl+h/j/k/l` focus behavior do
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
