# Architecture

Zotero Neo is an interaction layer over Zotero rather than a parallel document,
selection, or data model. The default design path is:

```text
Context -> Target / TargetSet -> Semantic Action -> Zotero host operation
```

Each layer should have one owner. New abstractions are introduced only when more
than one concrete workflow needs the same contract.

The [unified navigation execution and history policy](NAVIGATION_HISTORY_DESIGN.md)
documents the current shared navigation owners, recording rules, and Reader
transport constraints. The navigation implementation and document-bottom `G`
behavior have passed automated, supported-host, and owner acceptance; integration
is tracked in [PR #113](https://github.com/zhongyangchuwu/Zotero-Neo/pull/113).

## Layers

### 1. Input and interaction scope

`src/input/` owns key normalization, semantic key-token parsing, sequence/count matching,
resolved bindings, Key Guide projection, and composition boundaries. Named keys and modifier
chords are matched as tokens rather than raw string prefixes, so `e` is distinct from `enter`
and `escape`. The shared input engine is a pure reducer; each host consumer owns
event qualification/gating, timers, focus, and action execution. Sidebar, Picker,
and Plugin Manager local controls reuse the common binding runtime.

The runtime has 14 exact `BindingContext` identifiers. Six established contexts are
`reader-normal`, `reader-select`, `main-normal`, `main-select`, `note-normal`, and
`note-insert`; eight local interaction contexts are `reader-outline`, `reader-marks`,
`reader-annotations`, `reader-thumbnails`, `picker-input`, `picker-list`,
`plugins-input`, and `plugins-list`. A binding context selects the owner and its
capability set; it is not itself a Reader or Main Surface mode, and there is no
generic Reader-sidebar context.

Reader Surface state remains `normal | visual`, mapped at the input boundary to
`reader-normal` / `reader-select`. Contexts such as `main-select` and `note-insert`
name the owner-specific binding contract rather than create parallel domain state.
Annotation-comment input belongs to `ReaderCommentEditor` for its captured PDF
view; disabled-editor native passthrough belongs separately to `ReaderNativeInput`
for that Reader. Neither adds a Surface mode or configurable binding context. The
retired `reader-insert` scope has no runtime alias.

Historical binding keys migrate to their canonical contexts. Schema 17 deletes
obsolete `insert` / `reader-insert` rows; schema 18 owns the keyboard-system
override cutover in `src/core/preferences.ts`. It removes inherited Reader
`<Space>e` / `<Space>m` and bare `[` / `]` defaults, preserves non-null custom
overrides, and moves an explicit cancellation only when its destination has no
override. It also migrates the persisted outline-focus ActionId to
`focusReaderOutline`. The binding value is written before the schema version, and
the schema migration is repeat-safe.
Details are in the [development guide](DEVELOPMENT.md#runtime-architecture).

The v0.2 Main-library interaction contract is defined in
[INTERACTION_MODEL.md](INTERACTION_MODEL.md). In that model, Cursor, persistent
Selection, VisualTarget, View, and Scope are distinct concepts. `main-select` is
an active exact `BindingContext` for Visual range editing, not a temporary
compatibility scope or generic Selection mode. Selection itself has no mode.

Note Normal and Insert use the same reducer and binding source through explicit
`note-normal` and `note-insert` scopes. Note-local motions and operators are
semantic actions whose DOM editing operations remain owned by `NoteEditor`.
Insert text that is not bound to a Neo action stays browser/Zotero-owned. Earlier
development builds that exposed selected `main-normal` shortcuts inside Note
editors migrate those customizations and explicit unbindings into the Note scope.

Text-entry surfaces are a separate boundary. Flash and chooser/tag candidate
queries use real HTML inputs and browser/Gecko composition behavior; Neo consumes
committed values and does not reconstruct Unicode text from keydown events. See
[INPUT_METHODS.md](INPUT_METHODS.md).

### 2. Semantic actions and capabilities

`src/input/actions.ts` names executable semantic actions independently from their
keys. Feature capability modules define which actions are legal in a context;
controllers execute those actions after the binding engine resolves a sequence.

This separation lets the same semantic action be reached from a key binding or a
Command Palette without synthetic keyboard events. It also keeps Key Guide,
Binding Editor, and Command Palette projections tied to the same resolved source.

The shared keyboard architecture has separate owners: `actions.ts` is the
canonical `ActionId` registry; `binding-capabilities.ts` projects each surface's
actual executor-owned actions; `shortcut-catalog.ts` derives localized action,
group, context, editable-binding, and native/read-only projections from those
sources; and `binding-editor.ts` is the pure draft and validation state machine.
`LocalBindingRuntime` is the reusable per-surface sequence matcher. It owns no
focus or key-qualification policy: each host qualifies native/editable/composing
targets, supplies its own timer adapters and executor, and deactivates/disposes
its local matcher with that surface's focus and lifecycle.

Settings/catalog, Key Guide, command/shortcut hints, and matching derive from the
canonical ActionId registry, owner capabilities, and resolved bindings. Owners
contribute capabilities and executors, not competing action registries or
private default maps.

Cross-surface coordination uses a named capability or shared Operation, not
generic redispatch of another Surface's `ActionId`. Item Operations resolve
their targets through the initiating Surface's resolver.

Item-targeted actions also share a contextual target contract: Main resolves
EffectiveSelection (persistent Selection when non-empty, otherwise CurrentTarget),
Reader resolves the active Reader item (normally its parent bibliographic item),
and Note resolves its active note context. View actions and
Reader-local PDF actions remain surface-owned and do not use that resolver.

### 3. Feature owners

Feature modules should own one coherent state/lifecycle or one host operation
family. Controllers coordinate them; they should not mirror child feature state.

#### Main

- `main/controller.ts` — Main session orchestration and semantic action dispatch.
- `main/navigation.ts` — collection/item tree navigation operations; v0.2 item
  motion must preserve the Neo Selection workset and move Cursor independently.
- `main/item-select.ts` — transient Main Visual anchor/head state plus visible
  projection of Visual/Selection into Zotero's native item tree. Persistent
  Selection remains session-owned and is not defined by native row selection.
- `main/picker/` — shared candidate search/list/preview surface. Ordinary item,
  collection-item, note, and tab sources own candidate data/presentation only; the
  invoking semantic action owns confirmation and the resulting host operation.
  Command Palette reuses the same surface to choose an `ActionId`.
- `main/plugin-manager.ts` — persistent installed-plugin management surface. It owns
  Plugin Manager panel/filter/navigation lifecycle while `plugin-host.ts` projects
  authoritative Mozilla/Zotero AddonManager state.
- `main/tag-actions.ts` — semantic Add Tag / Remove Tag / Toggle Tag Filter /
  Clear Tag Filters orchestration; it invokes the shared chooser only when a tag
  target must be resolved.
- `main/item-targets.ts` — shared contextual item-target resolution for Main
  EffectiveSelection (Selection > CurrentTarget) and Reader/Note contextual items; item actions reuse this
  contract instead of borrowing another surface's selection.
- `main/tag-targets.ts` — batched item-tag mutation primitives.
- `main/note-capture.ts` — persistent Reader-selection capture mutation into an
  existing Zotero note. Reader supplies a DOM-free selection snapshot; Main owns
  note target resolution and persistence.
- `main/note-editor.ts` — note-editor Normal/Insert integration.
- `main/host.ts` — named adapters over private Main-window host seams.

The shared candidate surface is a **target resolver**, not an operation console.
For ordinary object choices its sources load/search/render candidates and return
one confirmed target to the invoking semantic action. Sources must not grow
private mutation grammars such as create/delete/yank/open variants.

Product semantics remain explicit even when implementation is shared: ordinary
object choosing, Command Palette action selection, Tag actions/filtering, and
Manager/Workspace surfaces may reuse search/ranking/rendering primitives without
becoming one universal Picker application. A Picker resolves one transient target
for an invoking action and normally closes; a Manager owns a bounded domain context
that can remain open across browsing and repeated operations. Plugin Manager is the
first concrete Manager surface. Do not extract a generic Manager framework until a
second real consumer demonstrates a stable shared contract. Tag candidate sources
may constrain or describe candidates. Persistent item-tag mutation remains in
`TagActions`; Quick Search, Advanced Search, and tag-predicate View mutation are
coordinated by `MainViewActions` through narrow `main/host.ts` seams.

#### Reader

`ReaderController` discovers and owns Reader sessions keyed by Zotero
`instanceID`. `ReaderSession` coordinates input and semantic execution, while
host/view lifecycle seams are owned separately:

- `host-key-bridge.ts` — installation/restoration of private Zotero
  `PdfView._onKeyDown` and `_textAnnotationFocused` patches; input policy remains
  in the session callbacks;
- `view-lifecycle.ts` — primary/secondary PDF-view discovery, periodic rescan,
  view-local DOM listeners, active-view fallback, and detached-view release;
- `navigation.ts` — zoom, page/search delegation, split control, directional
  focus, and active primary/secondary host-view resolution;
- `jump-host.ts` — attachment/XYZ capture, exact-pane restoration, and readable
  closed-attachment reopen;
- `jump-history-bridge.ts` — native producer/callback provenance and completion
  transport to the shared coordinator, not a separate Reader history stack;
- `selection-range.ts` — Neo's temporary DOM Selection compatibility range,
  Select anchor/preferred-X state, range motions, endpoint swaps, and view markers;
- `flash.ts` — visible-text targeting and hint lifecycle;
- `link-hints.ts` — PDF link targeting;
- `marks.ts` — persisted Reader marks and managed mark navigation;
- `native-sidebar.ts` — reversible compact native Outline decoration and bounded Neo caption/Bookmarks groups;
- `outline-presentation.ts` — derived Outline kinds; full-tree ordinals are projected by the sidebar;
- `caption-targets.ts` — session-owned, lazy single-flight Zotero SDT caption access, PDF-anchor projection, and result retirement;
- `comment-editor.ts` — transient annotation-comment editor state;
- `selection-actions.ts` — view-scoped selection action registry/palette and async
  result lifetime. It retires input/theme ownership before touching detached DOM.
  Cross-surface capture passes immutable selection context to its semantic owner
  and remains pending until the owner's chooser closes;
- `smooth-scroll.ts` — smooth-hold state;

The native sidebar is Reader-document-scoped; PDF focus and split changes do not select a sidebar owner. Editable and composing targets remain host-owned.

Reader panel focus uses the canonical `focusReaderOutline`, `focusReaderMarks`,
`focusReaderAnnotations`, and `focusReaderThumbnails` actions. They open/focus the
named native pane; repeating one does not close it. Toggle actions remain separate.
The four sidebar binding contexts are local execution contexts, not additional
Reader Surface modes. `ReaderNavigation.traverseOutline()` flattens the whole native
heading tree (including Sections/Subsections), independent of expansion, filtering,
the active Outline row, and sidebar state. `[s`/`]s` also delegate from the four exact
sidebar contexts. Live active-view geometry selects the next/previous target with
rounding/clamping tolerance and wrap; pending metadata work is fenced to its view/input owner.

Figure/Table requests additionally load genuine native SDT caption blocks via
`ReaderCaptionTargets`, preserving explicit native bookmark targets and deduplicating
matching identities. Caption DTO positions are cloned into Reader before native geometry
or navigation calls. The SDK validates/reuses its attachment cache; a cold call can
process the whole PDF locally and cannot be cancelled. Only an explicit category request
or caption-group expansion starts this work, never Reader open or heading traversal.
Unavailable/missing captions stay absent; Neo adds no OCR/network dependency and does not
invent image identities or alter the native Outline tree.

Bookmark traversal is owned by `ReaderMarks`, ordered by document position and
wrapping across persisted and legacy marks while retaining existing
bookmark/annotation-link semantics. Outline destinations retain native-hard
history evidence; bookmark jumps use the shared navigation path as one
managed-final excursion. Opening/focusing a panel creates no synthetic history
route.

When a native sidebar target receives focus or a pointer press, its owner retires
both the sidebar matcher and pending PDF shortcut sequence. Local matchers and
timers are also deactivated on native-key, editable/IME, context, target, and
binding changes, then disposed with their owning Reader/Pickers/Plugin Manager.

`ReaderController` owns the native Reader event registrations by event type and
callback identity; Zotero's registration API returns no listener handle. Shutdown
retires those callback fields before unregistering them, and each callback checks
that its own registration is still current. A queued callback from before shutdown
therefore cannot create a session or replace selection state after the same
controller restarts.

Closed Reader and split-view content can leave dead Gecko wrappers in session
state. Teardown checks the native `Cu.isDeadWrapper` boundary before touching a
retired PDF window, Select marker, scroll element, or indicator. Dead DOM does not stop view
release, remaining session cleanup, or Main shutdown; unexpected failures on live
objects are not hidden by this guard.
History scopes and patch records retain their PDF-window identity from creation.
Window release matches those captured identities instead of reading `_iframeWindow`
from a possibly destroyed native view, so history cleanup cannot strand the closed
Reader session in Main's next activation pass.

These modules should not be merged into a generic Reader widget framework. Their
state and host contracts differ and are already independently testable.

`reader/controller.ts` is still the largest orchestration boundary. Reader
discovery/session ownership remains there, and `ReaderSession` still combines input
routing, semantic dispatch, annotation operations, and scroll behavior. PDF-view
lifecycle, private key seams, navigation-oriented host operations, and Neo's temporary
Select DOM-range state/mutations have been extracted into the owners above. The
further cleanup under issue #98 should follow coherent responsibilities with
behavior contracts, not arbitrary file-size splitting.

#### Shared navigation history

`src/navigation/history.ts` owns the single per-Main-window `NavigationHistoryState`
stack and its append, refresh, move, equality, and Reader-tab remap behavior.
`src/navigation/history-policy.ts` is the sole typed source for action/event
eligibility and required completion evidence. `src/navigation/coordinator.ts`
owns admission, immutable cause/context stamping, inline/serial/traversal lanes,
currentness fences, completion, and the only history commit path.

`NavigationPort.execute()` and `NavigationPort.observeNative()` are the public
recording entrances. `MainNavigationExecutor` in `src/main/jump-history.ts` is
Main's host adapter/facade: it builds host operations and captures/restores
locations through the shared coordinator; callers do not append to history or
select a separate recorder. Reader commands use the same port. The Reader bridge
transports owned or genuinely detached native completion to it; owned work never
becomes a native root after it closes.

Recording policy is independent of successful host completion. The central rule
may require `native-hard`, `managed-final`, or `settled-change`; completion can
remain successful with no append when its evidence is ineligible or no location
changed. Reader native-hard eligibility requires a real producer receipt for the
exact view and settled final geometry, and the owning Reader tab must be selected
(the split view need not be focused). Default-ignored motion avoids history-only
capture and Promise work. Explicit Reader navigation establishes its launch
fence; Back/Forward waits for pending admitted navigation before traversing.
See the navigation design for private SDK transport details and the acceptance
status.

### 4. Zotero host adapters

Zotero state is authoritative wherever possible:

- Zotero owns Item data, native queries/result trees, and host operations.
- v0.2 Main Selection is an ephemeral Neo-owned set of stable item identities,
  because native `TreeSelection` stores row indexes in the current rendered View
  and cannot represent hidden workset members across filter/scope/sort changes.
  The visible tree may project the visible subset, but it is not the complete
  Selection source of truth. See [INTERACTION_MODEL.md](INTERACTION_MODEL.md).
- Item/tag mutations use Zotero item APIs and database transactions.
- Main private APIs are concentrated in `main/host.ts` where practical.
- Reader actions use stable native operations when available and guarded private
  seams only where Zotero currently exposes no public equivalent.

Neo must not duplicate Zotero domain data merely to make an abstraction look
uniform. Neo-owned interaction state is acceptable where the host cannot
represent the required interaction contract: v0.2 Main Selection stores only
stable item identities, and the current PDF keyboard Select compatibility layer
owns a temporary DOM range because Zotero's private semantic selection cannot
currently be updated through a supported API. Issue #20 tracks replacing the
Reader compatibility path when Zotero exposes a supported seam.

## Shared primitives, not generic frameworks

The following are appropriate shared primitives because multiple concrete
features already use them:

- binding/input reducer;
- semantic `ActionId` catalog and capability sets;
- composition/input guard;
- `fuzzyMatchScore()` adapter backed by pinned `fuzzysort`;
- theme tokens/managers;
- host adapters with a clear Zotero ownership boundary.
- `operations/show-in-library.ts` — select one explicit Zotero item; each caller owns target resolution and return-bookmark capture.

The following are intentionally **not** project-wide frameworks today:

- generic Target/TargetSet registry;
- generic Completion Engine;
- macro/multicursor system;
- one universal Picker/Workspace editor;
- generic Reader overlay state machine.

Create one only when a second real consumer demonstrates a stable shared
contract.

## Remaining interaction cleanup

The structural Reader cleanup for v0.1.0 is complete. Current ownership and
interaction follow-up is tracked in
[#98](https://github.com/zhongyangchuwu/Zotero-Neo/issues/98) and the
[roadmap](ROADMAP.md). Annotation Comment Editor ownership and its fixed key/save
contract are implemented. Phase 5.7 retires Reader Insert: schema 17 deletes its
inactive overrides/unbindings with owner approval, while the effective feature
boolean migrates to `annotationCommentEditor.enabled`. Remaining overlays and
Knowledge Capture are separate follow-up slices.

The Note input grammar is already on the shared sequence/count/binding machinery;
browser-native Insert editing remains outside Neo unless an explicit Note binding
consumes the key.

The goal is composability through explicit ownership, not maximum abstraction.
