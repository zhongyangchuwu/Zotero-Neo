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
transport constraints. PR #113 was merged; its CI, supported-host, and owner
acceptance receipts apply to that recorded checkpoint, not automatically to later
source or every host path. This guide describes checked-in source after the
v0.1.0 release; it does not redefine what shipped in v0.1.0. Physical OS-IME
candidate confirmation, composing Escape/Backspace, native clipboard, and human
Outline paths remain unperformed under [#137](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137).
Contracts, CI, and API-driven receipts are not substitutes for those human paths.

## Layers

### 1. Input and interaction scope

`src/input/` owns key normalization, semantic key-token parsing, sequence/count matching,
resolved bindings, Key Guide projection, and composition boundaries. Named keys and modifier
chords are matched as tokens rather than raw string prefixes, so `e` is distinct from `enter`
and `escape`. `engine.ts` is the pure matcher/reducer. `InputRuntime` owns pending
sequence/count/timer/revision mechanics per input owner, not globally: Main and Note compose
separate instances in their Main-window session, and each Reader session owns one.
`PrefixGuideRuntime` owns guide presentation and timers separately; Main and Note use the
main-window guide while each Reader session has its own. Hosts qualify native, editable, and
composing input and own focus, action execution, and lifecycle. Sidebar, Picker, and Plugin
Manager local controls use `LocalBindingRuntime` where applicable.

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
their targets in the initiating Surface. `src/core/item-target.ts` defines only
the common result shape; `src/platform/zotero-items.ts` owns Zotero item lookup,
top-level normalization, and identity deduplication. Neither chooses a Surface.
`src/main/main-item-target.ts` resolves Main EffectiveSelection (Persistent
Selection before CurrentTarget); `src/reader/item-target.ts` resolves the active
Reader item; and `src/main/note-item-target.ts` resolves the active context-pane
Note or selected standalone Note tab. Reader and Note do not borrow Main Selection.
Current production call sites use their typed Surface resolver directly; the
obsolete cross-Surface dispatcher/re-export has been removed. View actions and
Reader-local PDF actions remain surface-owned.

Concrete item Operations live under `src/operations/` and receive explicit
resolved items or IDs. For example, `item-tags.ts`, `item-collections.ts`,
`citekeys.ts`, `open-item.ts`, `trash-items.ts`, and `show-in-library.ts` implement
domain actions; the initiating Surface retains target choice and any host-level
confirmation, navigation, and status policy.

### 3. Feature owners

Feature modules should own one coherent state/lifecycle or one host operation
family. Controllers coordinate them; they should not mirror child feature state.

#### Main

`ZoteroWindowRuntime` in `main/window-runtime.ts` is the lifecycle root for
services belonging to the physical Zotero MainWindow. `MainWindowSession` in
`main/session.ts` composes that host runtime with Main state and feature runtimes;
its `NoteSurfaceRuntime` is a distinct Note interaction owner for the currently
attached editor. `NoteEditor` identifies that attachment by editor Window,
Document and Note item ID; replacing any of them resets pending interaction and
retires the old key callback before listener removal. `main/active-surface.ts` derives
the active Surface from Zotero state (context-pane Note, selected Note tab,
selected Reader tab, otherwise Main); the controller runs explicit activation
and deactivation paths rather than storing a mutable global `currentSurface`.

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
  Plugin Manager panel/filter/navigation lifecycle while Toolkit projects authoritative
  Mozilla/Zotero AddonManager state and preference-entry capabilities.
- `main/tag-actions.ts` — tag candidate and action orchestration; item mutation
  is implemented by the shared `operations/item-tags.ts` Operation.
- `main/collection-actions.ts` — collection chooser/currentness orchestration;
  membership mutation is implemented by `operations/item-collections.ts`.
- `main/main-item-target.ts` — Main EffectiveSelection (Persistent Selection
  before CurrentTarget) resolver.
- `main/note-item-target.ts` — active Note-context target resolver.
- `main/note-capture.ts` — DOM-free Reader snapshot conversion and append/save
  primitive for an existing Zotero note. Main controller owns the Notes chooser,
  source/target revalidation, and capture receipt/current UI status.
- `main/note-editor.ts` / `main/note-runtime.ts` — Note editor input and its
  identity-scoped interaction state.
- `main/session.ts` — Main Surface composition for one MainWindow.
- `main/window-runtime.ts` — host-window theme, appearance, and Settings lifecycle.
- `main/active-surface.ts` — derived active Surface from Zotero focus/tab/editor state.
- `src/toolkit/main/` — Main tree/tab/filter, editor discovery, row-decoration and plugin host capabilities;
  private pane/tree/editor objects do not escape its public entry.

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
may constrain or describe candidates. `TagActions` owns tag candidate/action
orchestration; the shared `operations/item-tags.ts` Operation performs persistent
item-tag mutation. Quick Search, Advanced Search, and tag-predicate View mutation
are coordinated by `MainViewActions` through `src/toolkit/main` capabilities.

#### Reader

`ReaderController` discovers and owns Reader sessions keyed by Zotero
`instanceID`. Each `ReaderSession` is the composition/lifecycle boundary for one
Reader Surface and owns its own `InputRuntime` and `PrefixGuideRuntime`, while
feature state and host/view lifecycle seams remain in their dedicated owners:

- `src/toolkit/reader/input-bridge.ts` — installation/restoration of private Zotero
  `PdfView._onKeyDown` and `_textAnnotationFocused` patches; input policy remains
  in the session callbacks;
- `src/toolkit/reader/view-lifecycle.ts` — primary/secondary PDF-view discovery,
  periodic rescan, view-local DOM listeners, and detached-view release;
- `src/reader/navigation.ts` — semantic traversal, caption choice and user feedback;
  `src/toolkit/reader/navigation.ts` owns native zoom/page/search/split/focus and geometry;
- `src/toolkit/reader/jump-host.ts` — attachment/XYZ capture, exact-pane restoration,
  and readable closed-attachment reopen;
- `src/toolkit/reader/history-bridge.ts` — native producer/callback provenance and
  completion transport to the shared coordinator, not a separate Reader history stack;
- `selection-range.ts` — Neo's temporary DOM Selection compatibility range,
  Select anchor/preferred-X state, range motions, endpoint swaps, and view markers;
- `flash.ts` — visible-text targeting and hint lifecycle;
- `link-hints.ts` — PDF link targeting;
- `marks.ts` — persisted Reader marks and managed mark navigation;
- `native-sidebar.ts` — reversible compact native Outline decoration and bounded Neo caption/Bookmarks groups;
- `outline-presentation.ts` — derived Outline kinds; full-tree ordinals are projected by the sidebar;
- `caption-targets.ts` — session-owned, lazy single-flight Zotero SDT caption/heading access, genuine PDF-anchor projection, conservative Figure image association, and result retirement;
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

Explicit heading/Figure/Table requests share genuine native SDT blocks through
`ReaderCaptionTargets`. A unique matching heading on an authored bookmark's page or
its next page supplies the printed heading geometry, correcting page-broken bookmarks
without adding headings or changing the native hierarchy. Ambiguous/missing matches
retain the authored position. Figures retain caption-derived identities but align a
trustworthy same-page image above the caption; Tables retain caption positions.
Matching native Figure identities prefer an earlier supplied image region.
Projected positions are cloned into Reader before native geometry/navigation calls.
The SDK validates/reuses its attachment cache; a cold call can process the whole PDF
locally and cannot be cancelled. Only an explicit structural navigation request or
caption-group expansion starts this work, never Reader open. Unavailable/missing
captions stay absent; Neo adds no OCR/network dependency or invented image identities.

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

### 4. Host capability Toolkit

Zotero state is authoritative wherever possible:

- Zotero owns Item data, native queries/result trees, and host operations.
- v0.2 Main Selection is an ephemeral Neo-owned set of stable item identities,
  because native `TreeSelection` stores row indexes in the current rendered View
  and cannot represent hidden workset members across filter/scope/sort changes.
  The visible tree may project the visible subset, but it is not the complete
  Selection source of truth. See [INTERACTION_MODEL.md](INTERACTION_MODEL.md).
- Item/tag mutations use Zotero item APIs and database transactions.
- `src/toolkit/index.ts`, `src/toolkit/main/index.ts` and `src/toolkit/reader/index.ts` are the public capability
  entries for host interaction. Business modules must not import private implementation
  modules or discover Zotero's internal DOM/SDK structure themselves.
- Prefer documented APIs or semantically equivalent platform alternatives. Keep a
  required private implementation when no equivalent contract exists; moving a call
  to a facade or third-party wrapper does not make the underlying dependency public.
- Standard DOM windows and narrow Reader handles carry identity without per-key
  wrapping. PDF view handles are opaque; native structural types remain inside Toolkit.
- Target precedence, bookmark storage target choice, modes, bindings, history eligibility,
  workflow, confirmations and status belong to business owners. Toolkit owns host lookup,
  cloning, native protocol, patches, DOM seams and their resource retirement.
- Public Zotero item APIs and the existing `platform/zotero-items.ts` lookup/normalization
  remain directly usable; do not add one-to-one forwarding wrappers for uniformity.

The capability/dependency inventory and host-update checks live in
[DEVELOPMENT.md](DEVELOPMENT.md#host-capability-toolkit).

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

- binding engine and per-owner `InputRuntime` / `PrefixGuideRuntime` mechanisms;
- semantic `ActionId` catalog and capability sets;
- composition/input guard;
- the `core/item-target.ts` result shape and `platform/zotero-items.ts`
  identity/normalization helpers; neither selects a Surface target;
- `fuzzyMatchScore()` adapter backed by pinned `fuzzysort`;
- theme tokens/managers and host adapters with clear Zotero ownership boundaries;
- concrete Operations under `operations/`, such as `item-tags`,
  `item-collections`, `citekeys`, and `show-in-library`, after Surface target
  resolution. `show-in-library.ts` selects one explicit Zotero item; navigation
  history admission remains with its caller.

The following are intentionally **not** project-wide frameworks today:

- generic Target/TargetSet registry;
- generic Completion Engine;
- macro/multicursor system;
- one universal Picker/Workspace editor;
- generic Reader overlay state machine.

Create one only when a second real consumer demonstrates a stable shared
contract.

## Source and acceptance status

The v0.1.0 Reader architecture is a historical release checkpoint, not the
entirety of checked-in source. Current #98 work includes the fixed Annotation
Comment Editor contract, the Phase 5.7 persisted Reader Insert retirement,
feature-local Reader owners, and capture into existing Zotero notes. Schema
migration code that reads retired mappings remains persistence migration only;
it does not restore runtime aliases or keymap inheritance. These later source
contracts do not imply that they shipped in v0.1.0 or that historical CI/native
receipts prove every later host path. Physical OS-IME candidate confirmation,
composing Escape/Backspace, native clipboard, and human Outline paths remain
unperformed under #137. Phase 10 documentation/legacy reconciliation remains
tracked by [#98](https://github.com/zhongyangchuwu/Zotero-Neo/issues/98).

The Note input grammar is already on the shared sequence/count/binding machinery;
browser-native Insert editing remains outside Neo unless an explicit Note binding
consumes the key.

The goal is composability through explicit ownership, not maximum abstraction.
