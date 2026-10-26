# Library Interaction Model

This document defines the interaction contract for the Library and its related
Main, Reader, and Note Surfaces. The [Command Reference](COMMAND_REFERENCE.md)
owns exact shortcuts; the [navigation design](NAVIGATION_HISTORY_DESIGN.md) owns
history recording and restoration; [ARCHITECTURE.md](ARCHITECTURE.md) describes
runtime ownership.

## Terminology

Use these names in documentation and Chinese UI labels. The sections below define the interaction contracts; the [Command Reference](COMMAND_REFERENCE.md) owns exact keys and action availability.

| Term | Chinese name |
| --- | --- |
| Main | 主窗口 |
| Reader | 阅读器 |
| Note surface | 笔记编辑器 |
| Zotero note | 笔记 |
| Surface | 交互界面 |
| [View](#view) | 视图 |
| [Main Scope / ScopeSet](#filter) | 文库范围／范围选择 |
| [Cursor](#cursor) | 条目游标 |
| [Selection](#selection) | Neo 选择集 |
| [Main Visual range / `VisualTarget`](#visualtarget) | 可视范围 |
| Reader Select / text selection | 文本选择模式／文本选区 |
| Note caret | 文本光标 |
| Annotation / annotation comment | 批注／批注评论 |

Main Selection is a session-only workset, not a Reader text selection or temporary Main range. Reader's internal `visual` state is displayed as Select.

UI instructions use the label shown in the selected language. Code identifiers, binding contexts, commands, and configuration keys keep their exact spelling.

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

A View is Zotero's native result set and ordering within the current native
Scope. Zotero owns the item tree, native search/filter/sort state, and the
underlying Item data. Neo invokes those host mechanisms rather than maintaining a
parallel query AST or duplicate library state.

The View can be affected by Quick Search, tag predicates, Advanced Search,
result-level options, and sort order. Scope is the separate native collection-tree
selection described under [Filter](#filter).

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
selection is an immediate CurrentTarget, not a persistent Neo workset.

Main displays a persistent Selection badge with its total and visible count,
adding the hidden count when nonzero. Visible row decorations are a projection
for host/UI compatibility; the Main-owned Selection identities remain the
complete source of truth.

### EffectiveSelection

Main workset-style Operations resolve this target as:

```text
EffectiveSelection =
    Selection non-empty -> Selection
    Selection empty     -> CurrentTarget

CurrentTarget =
    Visual active       -> VisualTarget
    native multi-set    -> NativeTarget
    otherwise           -> { Cursor }
```

This keeps persistent workset semantics separate from transient targeting while
still composing with Zotero-native multi-selection. Single-item native selection
is simply Cursor host projection, not a fourth semantic state.

Not every action consumes EffectiveSelection. Target ownership remains
action-specific; see **Action target contracts** below.

### VisualTarget

Visual is a transient, contiguous range-shaped Main Cursor. Entering Visual
starts an anchor/head range; exact key sequences are specified in the Command
Reference.

While Visual is active:

- motion changes the range head;
- extending and shrinking are reversible;
- endpoint swap exchanges anchor and head;
- Selection is unchanged until an explicit Selection operation commits the
  range;
- cancel discards the transient range without modifying Selection.

Visual tracks stable item identities where needed. It does not implement an
editable range by repeatedly unioning native `shiftSelect(..., augment=true)`,
because shrinking such a range leaves the old tail selected.

## Selection operations

Selection operations act on CurrentTarget, not on an implied persistent-set
mode:

```text
Normal + native multi-set -> CurrentTarget = native selected items
Normal otherwise          -> CurrentTarget = { cursor item }
Visual                     -> CurrentTarget = contiguous visual range
```

Toggle Selection applies an all-or-none rule to its target set `T`:

```text
if T is entirely contained in Selection:
    Selection = Selection - T
else:
    Selection = Selection union T
```

This treats a Visual range as one target and avoids surprising holes from a
symmetric difference. In Normal, Toggle Selection acts on CurrentTarget; in
Visual, an explicit commit applies it to VisualTarget and returns to Normal.
The exact bindings remain in the Command Reference.

Visual commit does not require a second independent "finish selection mode"
concept.

## No Selection mode

Selection itself has no mode.

`main-select` is an exact `BindingContext`, not a Surface mode or temporary
compatibility artifact. Its owner accepts Visual range-editing actions while
Main's Visual state is active. Selection remains a distinct interaction workset;
the binding context does not define or persist Selection.

Persistent Selection itself has no mode. Main selection Operations act on
CurrentTarget or VisualTarget as specified above; no mode edits the stored
workset independently of those targets.

## Local find versus filter

Find and Filter are separate operations.

### Local find

Local find:

- searches only within the current visible ordered View;
- moves Cursor to a match;
- does not change Query, Sort, Selection, or scope;
- does not fall back to a global item chooser;
- does not clear filters when no match is found.

Local Find opens through its Main Normal binding and confirmed repeat action in the current View; it moves Cursor only. Exact keys are in the [Command Reference](COMMAND_REFERENCE.md).

### Filter

Quick Search, Advanced Search, and tag predicates mutate View.

They may change which Selection members are visible but must not silently mutate
the complete Selection workset.

Tag-filter actions operate on Zotero's native tag predicates; they are not the
complete filter model.

The collection/library tree is Zotero's native Scope layer. It may contain
multiple selected library, collection, or saved-search rows (`ScopeSet`); Neo
observes that host state rather than creating a second collection workset.

Item `Selection` and ScopeSet remain distinct. Collection-tree input remains
native to Zotero; Neo has no ScopeSet mutation grammar or collection-selection
mode. Zotero remains authoritative for Scope membership and meaning.

## Action target contracts

Neo resolves item targets per Surface; a shared Operation does not imply a
shared target resolver. Main View actions and Reader-local PDF actions do not
use an item target.

- **MainItemTarget**: persistent Main Selection when nonempty; otherwise
  CurrentTarget (Main Visual range, native item multi-selection, or Cursor, in
  that order). This is the target for ordinary Main item Operations.
- **ReaderItemTarget**: the active Reader item's context, normalized through
  Zotero's top-level item rules when an Operation needs a bibliographic item.
- **NoteItemTarget**: the active context-pane Note, or selected standalone Note
  tab, normalized to its bibliographic parent when present.

Reader and Note targets are contextual and never borrow Main Selection. The
Surface resolver supplies the target; each Operation still owns cardinality,
normalization, mutation safety, and preflight. There is no universal Target
resolver for every command and no silent Cursor fallback when a resolved target
is unavailable or has unsupported cardinality.

Current action-target policy:

| Action family | Target contract |
| --- | --- |
| Cursor motion and local find | Cursor only |
| Main Open/Activate in Items | Main Cursor only, regardless of persistent Selection or native multi-selection; missing Cursor fails closed. Items-pane Enter has the same rule; collection-pane Enter selects its native Scope cursor and moves focus to Items. |
| Note Open | Note-context item, normalized to its bibliographic parent when present; never Main Selection. |
| Show in Library | Reader/Note uses that Surface's contextual item; Selection Panel Reveal uses the exact ItemRef selected there. |
| Add/Remove Tag | Main uses MainItemTarget; Reader/Note use their contextual single-item targets. |
| Trash / restore | Trash uses MainItemTarget with target/count confirmation and hidden-member refusal; restore uses Neo's last Trash batch. |
| Reader annotation deletion | One selected Reader annotation; explicit permanent-delete confirmation. |
| Collection membership | Main may batch; Reader uses its contextual item; Note collection actions are unsupported. |
| Visual selection operation | VisualTarget mutates Main Selection; it is not an ordinary Main item Operation. |
| Quick/Advanced/tag filtering and sort | View only; these do not mutate Main Selection. |
| Citekey copy | Main may batch through MainItemTarget; Reader/Note remain contextual single-target. |

Main Open/Activate is the accepted Cursor-only exception to ordinary Main item
Operations: persistent Selection and native multi-selection do not replace
Cursor. If Cursor cannot resolve, fail closed; never open the first host-selected
item. Note Open uses its own context target. This is not a batch-open contract.

Action-specific normalization remains important. For example, tagging an
attachment may intentionally normalize to its parent while an action that
deletes that attachment must not silently do so.

Code patterns such as `getSelectedItems()[0]` are not a valid implicit target
contract once Cursor can be detached from Selection.

### Main batch-operation details

Main citekey copy uses MainItemTarget, normalizes through Zotero's
`Items.keepTopLevel()`, deduplicates, and fails closed for stale or partially
missing citekeys; the resulting raw Better BibTeX keys are space-separated.
Reader and Note copy remain contextual single-target Operations.

Main collection membership also uses MainItemTarget and supports a batch only
within one library. Its chooser resolves one collection but does not own the
mutation. Confirmation rechecks the item-target signature before applying the
batch; existing no-op memberships are skipped and Neo Selection is unchanged.
Reader membership is contextual single-target; Note collection actions are not
supported.

## Hidden Selection safety

A persistent workset introduces hidden targets by design.

High-impact mutations expose their actual resolved target before changing Zotero data:

- Main Trash refuses missing targets and persistent Neo Selection members hidden by the current View. Its status reports hidden/total counts and directs users to the Selection Panel for inspection, reveal, or removal.
- Visible Main Trash targets require confirmation naming Neo Selection, Visual range, Zotero native multi-selection, or Cursor and the item count. Cancel changes neither Zotero data, Selection, nor Trash history; completion feedback repeats the resolved target and count.
- Reader annotation deletion confirms exactly one selected annotation and states that deletion is permanent. Cancel preserves the annotation selection; Neo clears it only after Zotero deletion succeeds.

A Selection Panel is an inspector/manager for the workset:

- list members;
- show visible/hidden state;
- remove members;
- clear Selection;
- reveal a selected member.

It is not an operation console.

## Knowledge capture

Reader owns the transient Visual text selection and passes a DOM-free
`ReaderSelectionContext` (`text`, Reader `itemID`, page label, and position) to
Main. Main freezes the invocation snapshot, opens the existing-note picker, and
owns confirmation and Zotero note mutation. Capture does not create a Note or
add a Reader backlink; annotation-comment creation remains a separate action.

The Notes picker starts in **Current item** scope. For Reader capture, the Reader
attachment is resolved to its bibliographic parent before choosing notes and
before fixing the library scope. This scope lists only notes on that item; it
does not silently fall back to the library. If there is no current item, the
picker honestly reports that state and stays empty. **Browse library** explicitly
switches this same invocation to notes in that library; the source can be
switched back to Current item without reopening the picker.

In Library scope, notes are grouped by their actual parent item (or as standalone
notes); the current item's owner group ranks first, then groups and notes follow
their modification order. Result rows contain only note titles. A group boundary
is a non-selectable visual separator, not a candidate row. Preview names the
actual parent (or standalone/unavailable owner) and preserves paragraph breaks
in the note text.

Confirmation synchronously binds the chosen note ID, source revision, and picker
generation, then admits one confirmation at a time. Before mutation, Main
re-resolves that ID and checks the note's actual owner and library; a reparented
or changed target is refused before appending. Capture appends to the existing
note through Zotero-native `getNote()/setNote()/saveTx()` and never creates one.
Visible errors name the chosen note; success returns a receipt naming the note.
If the picker is forcibly replaced after a save is admitted, the save's actual
outcome is retained, but the retired Reader invocation does not reclaim status
or focus in the replacement context.

The picker resolves a target; it does not own note creation, append semantics,
or Reader selection state. Cancellation before admission performs no mutation;
invalidated targets reject before append. Closing after native save admission
cannot undo that operation.

## Show in Library

Reader and Note resolve the item from their own active Surface; they do not borrow Main Selection. Selection Panel Reveal uses the exact `ItemRef` selected in that panel. Both use the same single-item Zotero operation, and neither captures or restores Main Selection. History recording is covered by the navigation design.

## Navigation jump history

Each Main window owns one in-memory history stack shared by Main, Reader, and Note. Persistent Main Selection is not part of a history location. The [navigation design](NAVIGATION_HISTORY_DESIGN.md) defines which host operations record, the completion/currentness requirements, and restoration behavior; exact user commands are in the [Command Reference](COMMAND_REFERENCE.md).

## Keymap direction

Main and Reader have Normal/Visual interaction; Note has Normal/Insert. A `BindingContext` identifies an owner and its capability set, not a separate Surface mode or domain state. Exact contexts and bindings are in the [Command Reference](COMMAND_REFERENCE.md); modes do not inherit bindings from another mode or a global fallback.

Feature input owners take precedence only for their defined target and lifetime. The Annotation Comment Editor owns its captured PDF view. The Settings → Reader → **Annotation comment editing** preference gates entry; when it is disabled, `i` uses Reader-wide native passthrough until Escape or deactivation. Enter inserts a native newline. Escape or input handoff saves the final draft and closes the editor; edits also autosave after two seconds without input. Reader/view disposal releases the editor and its timers without starting another save. A save already in progress continues independently of disposal. This is not a Reader Insert mode. Note Insert leaves ordinary text to Zotero's native editor. See [INPUT_METHODS.md](INPUT_METHODS.md) for composition ownership.

## Runtime identity and activation

Active Surface is derived from Zotero focus/tab state, in this order: focused
context-pane Note, selected standalone Note tab, selected Reader tab, otherwise
Main. Neo does not keep a mutable global `currentSurface`. Changing the active
split PDF view does not change Reader Surface identity.

| Transition | Preserve | Clear, normalize, or dispose |
| --- | --- | --- |
| Main deactivation | Main Persistent Selection | Main Visual range, pending input, Prefix Guide; mode becomes Normal. |
| Reader deactivation | Reader session and Zotero PDF state | Reader activation-transient input/Visual; an active comment editor hands input back through its save/close path. |
| Note deactivation | Note identity and yank/register | Pending input and Insert mode; mode becomes Normal. |
| Note A → Note B or editor-host replacement | Zotero Note data | Rebind by Note item ID plus editor-host identity; reset Note mode, pending input, and yank/register. |
| Reader primary → secondary PDF view | Same Reader Surface/runtime | Only active view changes. |
| Reader A → Reader B | Both live `instanceID` runtimes | Deactivate the inactive Reader's transient interaction state. |
| Reader close | Zotero data | Reconcile and dispose that Reader runtime. |
| MainWindow close | Zotero application data | Dispose window-scoped Main, Note, and Reader runtimes. |

The context-pane Note is still Note interaction even though its editor DOM is
hosted by the MainWindow. A reused editor host showing another Note is an
identity transition, not continuation of the former Note's Neo input state.
