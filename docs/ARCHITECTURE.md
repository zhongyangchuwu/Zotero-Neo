# Architecture

Zotero Neo is an interaction layer over Zotero rather than a parallel document,
selection, or data model. The default design path is:

```text
Context -> Target / TargetSet -> Semantic Action -> Zotero host operation
```

Each layer should have one owner. New abstractions are introduced only when more
than one concrete workflow needs the same contract.

## Layers

### 1. Input and interaction scope

`src/input/` owns key normalization, semantic key-token parsing, sequence/count matching,
resolved bindings, Key Guide projection, and composition boundaries. Named keys and modifier
chords are matched as tokens rather than raw string prefixes, so `e` is distinct from `enter`
and `escape`. The shared input engine is a
pure reducer; Main and Reader still own event gating, timers, focus, and action
execution.

Configurable binding scopes are explicit about both surface and interaction
state:

```text
reader-normal
reader-select
reader-insert
main-normal
main-select
note-normal
note-insert
```

This is deliberately different from Reader runtime state. Reader still has the
runtime states `normal | visual | insert`; the Reader controller maps those to
binding scopes at the input boundary. This keeps a host-independent Reader state
model from being confused with the persisted keymap schema.

Development builds using the earlier `normal | visual | insert | main` binding
keys are migrated to the canonical scopes. Explicit unbindings remain explicit.

The v0.2 Main-library interaction contract is defined in
[INTERACTION_MODEL.md](INTERACTION_MODEL.md). In that model, Cursor, persistent
Selection, VisualTarget, View, and Scope are distinct concepts. The persisted
`main-select` binding scope may remain temporarily for compatibility, but its
user-facing meaning is Visual range editing rather than a generic selection mode.
Selection itself has no mode.

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

### 3. Feature owners

Feature modules should own one coherent state/lifecycle or one host operation
family. Controllers coordinate them; they should not mirror child feature state.

#### Main

- `main/controller.ts` — Main session orchestration and semantic action dispatch.
- `main/navigation.ts` — collection/item tree navigation operations; v0.2 item
  motion must preserve the Neo Selection workset and move Cursor independently.
- `main/item-select.ts` — current v0.1 native range implementation. In v0.2 this
  owner is being narrowed to transient Visual anchor/head behavior; Selection is
  session-owned and not defined by native range state.
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
- `main/tag-targets.ts` — Main/Reader/Note target normalization and batched
  item-tag mutation primitives.
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
may constrain or describe candidates, but item mutation and Main-view filter changes
remain in the invoking semantic action.

#### Reader

`ReaderController` discovers and owns Reader sessions keyed by Zotero
`instanceID`. `ReaderSession` coordinates input and semantic execution, while
host/view lifecycle seams are owned separately:

- `host-key-bridge.ts` — installation/restoration of private Zotero
  `PdfView._onKeyDown` and `_textAnnotationFocused` patches; input policy remains
  in the session callbacks;
- `view-lifecycle.ts` — primary/secondary PDF-view discovery, periodic rescan,
  view-local DOM listeners, active-view fallback, and detached-view release;
- `navigation.ts` — Reader history, zoom, page/search delegation, split control,
  directional focus, and active primary/secondary host-view resolution;
- `selection-range.ts` — Neo's temporary DOM Selection compatibility range,
  Select anchor/preferred-X state, range motions, endpoint swaps, and view markers;
- `flash.ts` — visible-text targeting and hint lifecycle;
- `link-hints.ts` — PDF link targeting;
- `marks.ts` / `marks-explorer.ts` — persisted marks and explorer behavior;
- `outline.ts` — outline tree/navigation;
- `comment-editor.ts` — transient annotation-comment editor state;
- `selection-actions.ts` — selection action registry/palette;
- `smooth-scroll.ts` — smooth-hold state;
- `sidebar-overlay.ts` — only the shared Outline/Marks overlay lifecycle.

These modules should not be merged into a generic Reader widget framework. Their
state and host contracts differ and are already independently testable.

`reader/controller.ts` is still the largest orchestration boundary. Reader
discovery/session ownership remains there, and `ReaderSession` still combines input
routing, semantic dispatch, annotation operations, and scroll behavior. PDF-view
lifecycle, private key seams, navigation-oriented host operations, and Neo's temporary
Select DOM-range state/mutations have been extracted into the owners above. The
remaining pre-release cleanup under issue #29 should continue along coherent
responsibilities with direct tests, not arbitrary file-size splitting.

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

The following are intentionally **not** project-wide frameworks today:

- generic Target/TargetSet registry;
- generic Completion Engine;
- macro/multicursor system;
- one universal Picker/Workspace editor;
- generic Reader overlay state machine.

Create one only when a second real consumer demonstrates a stable shared
contract.

## Remaining pre-release interaction cleanup

The structural Reader cleanup tracked by issue #29 is complete. Before the
v0.1.0 release candidate is frozen again, issues #42, #39, #40, and #43 tighten
the interaction vocabulary around target resolution, Tag actions, Tab actions,
and semantic leader namespaces. Issue #41 separately audits semantic light/dark
component tokens.

The Note input grammar is already on the shared sequence/count/binding machinery;
browser-native Insert editing remains outside Neo unless an explicit Note binding
consumes the key.

The goal is composability through explicit ownership, not maximum abstraction.
