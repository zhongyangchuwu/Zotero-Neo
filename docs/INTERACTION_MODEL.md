# Library Interaction Model

This document is the current source-oriented interaction contract for the Library
and its related Main, Reader, and Note Surfaces. It preserves the useful Library
substrate from issue #55 while reconciling it to the implementation tracked by
issue #98. Conflicting proposal language in #55 and later historical notes is
not current behavior.

This document describes current source, not the shipped v0.1.0 contract. The
[Changelog](../CHANGELOG.md) separates unreleased work from published behavior;
the [Roadmap](ROADMAP.md) records integration and release gates. Source contracts
do not imply complete human acceptance. Exact action defaults and key grammars
are in the [Command Reference](COMMAND_REFERENCE.md).

The goal is not to reproduce Vim or Yazi mechanically. Neo fits Zotero's host
behavior while keeping navigation, selection, filtering, and object actions
predictable.

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
result-level options, and sort order. Scope is a separate native collection-tree
selection; see **Scope** below.

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

Local Find opens through its Main Normal binding and confirmed repeat action in
the current View; exact keys are in the Command Reference. Confirmed result jumps
are recorded in navigation history.

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
mode. Neo may snapshot native Scope IDs for navigation restoration, but Zotero
remains authoritative for their membership and meaning.

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
| Reader Open | No default Reader Open action; the historical Reader `o` binding is retired. |
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

Reader and Note `showInLibrary` resolves the active Surface item and selects it in
Zotero's library through `ZoteroPane.selectItem`. Reader and Note never borrow Main
Selection. Selection Panel Reveal uses the exact `ItemRef` chosen in that panel;
both paths use the same single-item host Operation.

Show in Library remains a separate, unbound action. After a successful
location-changing reveal, it records a history jump; missing targets,
unavailable host selection, failed/stale requests, and same-location opens do
not. Neither Show in Library nor Selection Panel Reveal captures or restores
Main Selection.

## Navigation jump history

Each Main window owns one stack-style ordered list of at most 100 locations and
a current position. The canonical actions are `navigateBack` and
`navigateForward`, shared by Main, Reader, and Note Normal; see the
[Command Reference](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist) for
their exact bindings. Counts traverse multiple locations; Command Palette
invocation is uncounted. Back/Forward never record themselves. Before traversal,
Neo refreshes the departing location when its contextual identity still matches,
so ordinary movement since the last recorded jump is preserved. A new
qualifying jump after Back truncates the forward suffix (`A → B → C`, Back, then
`D` gives `A → B → D`). Empty boundaries are safe no-ops. Disposing a Main
window discards its history; no session persistence is added.

The former `returnBookmark` / `mainReturnContext` and default `gr` return workflow
are historical, not current navigation behavior. The accepted model is shared
stack-style Back/Forward; Show in Library remains separate and unbound.

Record completed explicit jumps:

- Main first/last-Cursor jumps in Items and confirmed local-find result jumps;
- explicit Main Open and successful all-library, collection-scoped, or Note
  picker confirmation;
- successful Reader/Note Show in Library and Selection Panel Reveal;
- successful Neo tab switches and open-tab picker confirmation;
- Reader explicit page destinations, marks, annotation navigation,
  internal/citation links, native search-result navigation, and Zotero-native
  Outline destinations.

Reader page, annotation, internal/citation-link, and search destinations enter
the shared list only when producer-bound completion supplies a native-hard
receipt matching the exact current view and settled geometry. Zotero-native
Outline navigation follows native immediate controls and uses the existing
`reader-native.hard` observation; there is no Neo select-then-confirm step or
dedicated Outline confirmation event. A raw non-transient history save is not
an independent recording entrance. Marks instead record one managed final
destination. Tab switching and chooser confirmation follow the explicit
completion policy in the Command Reference.

Do not record continuous Main Cursor motion, ordinary Reader scrolling or
adjacent page turns, native tab clicks, or manual collection/filter edits.
Failed or no-op operations do not create locations.

Locations are DOM-free. Reader entries retain library/item identity, a tabID
lookup hint, and optional primary/secondary PDF page index and top/left
coordinates. Traversal reuses an open same-item tab or reopens the same readable
attachment, restores available PDF position, verifies the result, and returns
the actual tabID. It does not restore zoom or layout. A closed Reader tab is
therefore intentionally reopenable; a missing/deleted/trash/unreadable item or
missing required split reports partial/failure and leaves the history pointer
unchanged. A non-PDF Reader entry is identity-only and follows Zotero's retained
position rather than promising PDF geometry restoration. Standalone Note tabs
store tabID only and likewise follow native retained position. A context-pane
Note shares its library tab, so restoration returns the underlying Main View,
not Note editor focus or caret.

Main locations retain restorable library navigation state: native ScopeSet IDs,
Quick Search, tag predicates, Advanced Search state, Cursor item identity, and
Main panel/focus. View restoration applies scope and predicates before Cursor
and focus. Advanced Search absence can be reversed by closing the native editor;
a lost native condition set cannot be invented. Missing tabs/items/scopes or
partially restorable Views must be reported honestly and must not advance the
history pointer. Persistent Selection stays Main-owned, independent of history,
and is never copied into a location. Closing Reader/Note does not automatically
navigate Back.

Restoration is transactional for the history pointer, not atomic for the UI.
Scope, Quick Search, tags, Advanced Search, Cursor, and focus are applied in order
after selecting the target tab; a later failure or stale request leaves the pointer
unchanged but does not roll back earlier UI changes. A newly opened Reader is not
ready for Neo bindings until its session/view hooks install; Zotero's native reader
initialization flag alone is not sufficient. See the
[command reference](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist) for
the command-by-command recording and restoration boundaries.

The stack/forward-truncation and 100-location bound follow Neovim's
[jumplist-stack model](https://neovim.io/doc/user/motion/#jumplist-stack), not a
claim of full Neovim equivalence. Neovim's default `jumpoptions=clean` drops
unloaded buffers; Neo deliberately reopens a closed Reader location when the
same readable attachment remains available.

## Keymap direction

This section defines ownership, not a second shortcut inventory. Main, Reader,
and Note are interaction Surfaces; a Surface mode changes that Surface's
interaction grammar. The implemented modes are:

| Surface | Modes |
| --- | --- |
| Main | Normal, Visual |
| Reader | Normal, Visual |
| Note | Normal, Insert |

### Main

Main Visual is owned by one transient range in `MainItemSelect`. Main's active
mode is derived from whether that range exists; `main-select` is its exact
binding context, not a second Visual state store. Persistent Selection remains
independent and Main-owned. Visual motion changes only the range; explicit
commit changes Selection, while cancel or deactivation leaves it unchanged.

### Exact binding contexts

The binding engine has exactly 14 `BindingContext` values. Six are the Surface
mode contexts: `main-normal`, `main-select`, `reader-normal`, `reader-select`,
`note-normal`, and `note-insert`. The other eight are focused feature/list
contexts, not more Surface modes. The full inventory and capabilities stay in
the [Command Reference](COMMAND_REFERENCE.md#modes-focus-and-capabilities).

No binding context inherits from a sibling mode or a global fallback. Reusing an
Operation does not inherit or imply its binding. Current shortcut defaults,
overrides, and context-specific grammars are documented only in the Command
Reference; this document adds no binding contract.

### Input ownership

Input ownership is separate from Surface mode. When a feature captures input,
that feature owns its input for the defined target/lifetime; otherwise the
active Surface's exact mode applies. Feature-local owners include Selection
Actions, the Picker, Plugin Manager, Reader sidebar controls, and Annotation
Comment Editor; none adds another Surface mode.

Reader Surface modes remain Normal/Visual. The Annotation Comment Editor owns
the captured PDF view while open: Enter inserts a native newline, Escape saves
and closes, and edits autosave after two seconds. With its entry gate disabled,
`i` uses Reader-wide native passthrough ownership until Escape/deactivation; it
does not create Reader.Insert. Note Insert remains a Note Surface mode with
ordinary text owned by Zotero's native editor. See the
[Command Reference](COMMAND_REFERENCE.md#annotation-comment-editor) for the full
existing input behavior.

## Prefix Guide

The Prefix Guide projects the resolved bindings for the exact active
`BindingContext`. Its prefix nodes and action leaves come from the binding map;
the Guide is not a second command registry. Exact shortcuts and presentation
remain in the [Command Reference](COMMAND_REFERENCE.md).

## Host/state ownership

Current ownership is:

- **Zotero** owns Items, Notes, Annotations, Collections, the native View and
  Scope, tabs/focus, PDF position, and native Note document contents.
- **Main runtime** is composed per Zotero MainWindow. It owns ephemeral
  persistent Selection identities and that window's navigation history, while
  composing smaller input and feature runtimes. Selection is not a copy of
  TreeSelection or persisted library data.
- **MainItemSelect** owns the transient Main Visual range and visible native-tree
  projection/status UI; Main mode is derived from the range, while persistent
  workset identities remain in the session's SelectionStore.
- **Reader runtime** is per Zotero Reader `instanceID`. Its primary and
  secondary PDF views share one Reader Surface; Reader features retain their
  own input/lifecycle state.
- **Note runtime** tracks one active Note editor host and Note item identity.
  Zotero still owns the Note content; Neo mode, pending input, and yank register
  are interaction state.
- **Target resolution and Operations** remain separate. Each Surface resolves
  its own item target; reusable domain Operations do not turn Main into a shared
  executor or transfer Main Selection to Reader/Note.

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

## Implementation sequence

**Historical proposals only.** The phase checklists and dogfood scenarios formerly
listed here came from the original #55 substrate plan. They describe work since
implemented or superseded by #98; they are neither current requirements nor test
or GUI evidence. The current contracts above follow source, and the #98 issue
history distinguishes implementation from pending human acceptance. Historical
return-bookmark/`mainReturnContext`/`gr` behavior and the arbitrary-note-first
capture prototype are not current workflows. No new capture workflow, Note Vim
expansion, PDF expansion, or binding is proposed here.

## Evidence boundary

Source contracts and automated checks prove only the properties exercised;
native package/API evidence and human interaction are separate acceptance levels.
Physical OS IME candidate-window confirmation, composing Escape/Backspace, native
clipboard, and Outline human paths remain unperformed under
[#137](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137). Trusted DOM/Gecko
input is not a substitute for human PASS; documentation reconciliation cannot
close an unobserved criterion.

## Compatibility watch

Zotero host seams can be private and version-sensitive. Neo keeps Zotero's native
state authoritative and isolates required private focus/tree operations behind
the existing host adapters. This is a maintenance boundary, not a claim of
Zotero 11 Beta acceptance or a pending product workflow.
