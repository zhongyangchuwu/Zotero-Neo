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

`src/input/` owns key normalization, sequence/count matching, resolved bindings,
Key Guide projection, and composition boundaries. The shared input engine is a
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

Main Item Select also uses the shared input engine and resolved binding map. Its
`src/main/item-select.ts` module no longer parses keys or owns count/prefix state;
it is a thin feature/host adapter over Zotero's native `TreeSelection` plus its
transient status UI. While `main-select` is active, ordinary `main-normal`
bindings are available as fallbacks so operations such as Tag Workspace can act
on the preserved native selection.

Note Normal and Insert use the same reducer and binding source through explicit
`note-normal` and `note-insert` scopes. Note-local motions and operators are
semantic actions whose DOM editing operations remain owned by `NoteEditor`.
Insert text that is not bound to a Neo action stays browser/Zotero-owned. Earlier
development builds that exposed selected `main-normal` shortcuts inside Note
editors migrate those customizations and explicit unbindings into the Note scope.

Text-entry surfaces are a separate boundary. Flash, Picker, and Tag Workspace
use real HTML inputs and browser/Gecko composition behavior; Neo consumes
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
- `main/navigation.ts` — collection/item tree navigation operations.
- `main/item-select.ts` — native `TreeSelection` range operations and mode UI;
  shared input state stays in Main session/controller.
- `main/picker/` — generic search/choose shell plus finite providers for items,
  collection items, notes, tabs, tags, and commands.
- `main/tag-workspace.ts` — persistent item-tag mutation workspace.
- `main/tag-targets.ts` — Main/Reader/Note target normalization for item-tag
  operations.
- `main/note-editor.ts` — note-editor Normal/Insert integration.
- `main/host.ts` — named adapters over private Main-window host seams.

Picker and Tag Workspace intentionally remain separate. Picker is a
search/filter/choose interaction; Tag Workspace is persistent mutation state.
They may share primitives such as fuzzy matching or composition handling, but
not one generic editing framework.

#### Reader

`ReaderController` discovers and owns Reader sessions keyed by Zotero
`instanceID`. `ReaderSession` coordinates input and semantic execution, while
host/view lifecycle seams are owned separately:

- `host-key-bridge.ts` — installation/restoration of private Zotero
  `PdfView._onKeyDown` and `_textAnnotationFocused` patches; input policy remains
  in the session callbacks;
- `view-lifecycle.ts` — primary/secondary PDF-view discovery, periodic rescan,
  view-local DOM listeners, active-view fallback, and detached-view release;
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
routing, semantic dispatch, selection/range mutation, and navigation. PDF-view
discovery/listener ownership and the two private key seams have been extracted into
the owners above. The remaining pre-release cleanup under issue #29 should continue
along coherent responsibilities with direct tests, not arbitrary file-size splitting.

### 4. Zotero host adapters

Zotero state is authoritative wherever possible:

- Main multi-selection uses Zotero `TreeSelection`.
- Item/tag mutations use Zotero item APIs and database transactions.
- Main private APIs are concentrated in `main/host.ts` where practical.
- Reader actions use stable native operations when available and guarded private
  seams only where Zotero currently exposes no public equivalent.

Neo must not create a parallel source of truth merely to make an abstraction
look uniform. The current PDF keyboard Select compatibility layer is the notable
exception: Zotero's private semantic selection cannot currently be updated
through a supported API, so Neo owns a DOM range. Issue #20 tracks replacing
that compatibility path when Zotero exposes a supported seam.

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

## Remaining pre-release architecture work

Issue #29 owns the remaining structural cleanup before the 0.1.0 keymap freeze:

1. **Reader orchestration** — split the large Reader coordinator along existing
   ownership boundaries while preserving the independently owned feature
   modules above.
2. **Release freeze** — after that boundary is accepted, issue #24 freezes the
   default keymap and runs the full Zotero 10 host/release matrix.

The Note input grammar is already on the shared sequence/count/binding machinery;
browser-native Insert editing remains outside Neo unless an explicit Note binding
consumes the key.

The goal is composability through explicit ownership, not maximum abstraction.
