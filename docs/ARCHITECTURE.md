# Architecture

Zotero Neo adds interaction over Zotero rather than maintaining a parallel document, selection, or data model. The usual path is:

```text
Context -> Target / TargetSet -> Semantic Action -> Zotero host operation
```

Each layer has one owner. A shared abstraction belongs where multiple concrete workflows use the same contract.

The shared navigation stack and its recording/restoration policy are documented in [NAVIGATION_HISTORY_DESIGN.md](NAVIGATION_HISTORY_DESIGN.md). This guide describes runtime ownership; [INTERACTION_MODEL.md](INTERACTION_MODEL.md) defines Main interaction semantics, and [COMMAND_REFERENCE.md](COMMAND_REFERENCE.md) owns exact bindings.

## Layers

### 1. Input and interaction scope

`src/input/` owns key normalization, semantic tokens, sequence/count matching, resolved bindings, and the pure reducer in `src/input/engine.ts`. `src/input/runtime.ts` owns pending sequence/count/timer state per input owner. `src/ui/key-guide-runtime.ts` separately owns guide presentation; local controls use `src/input/local-binding-runtime.ts`.

Hosts qualify native, editable, and composing input and own focus, action execution, and lifecycle. A `BindingContext` names an exact owner/capability contract, not a Surface mode; contexts do not inherit bindings from another mode or a global fallback. Main and Reader have Normal/Visual interaction; Note has Normal/Insert. Main Visual's `main-select` context applies while its transient range exists, not to persistent Selection. Annotation-comment input and disabled-editor native passthrough are feature input owners, not additional Reader modes. See [INPUT_METHODS.md](INPUT_METHODS.md) for composition and text entry; the Command Reference owns the full context/key inventory.

Persisted binding migrations live in `src/core/preferences.ts`; they do not create runtime aliases or inherited keymaps.

### 2. Semantic actions and capabilities

`src/input/actions.ts` is the canonical `ActionId` registry. Feature capability modules define executable actions; controllers dispatch resolved semantic actions rather than synthesizing keyboard events. Settings, Key Guide, shortcut hints, and matching project the same registry, owner capabilities, and resolved bindings.

Item targets are resolved by the initiating Surface. `src/core/item-target.ts` defines the shared result shape; `src/platform/zotero-items.ts` owns Zotero lookup, normalization, and identity deduplication. `src/main/main-item-target.ts` resolves Main Selection before CurrentTarget; `src/reader/item-target.ts` resolves the active Reader item; `src/main/note-item-target.ts` resolves the active Note. Reader and Note never borrow Main Selection.

Concrete domain operations live in `src/operations/` and receive explicit items or IDs. Surface owners retain target choice, cardinality, confirmation, navigation, and status. Cross-surface coordination uses a named capability or shared Operation, not redispatch of another Surface's `ActionId`.

### 3. Feature owners

#### Main

`src/main/window-runtime.ts` owns services for one physical Zotero MainWindow. `src/main/session.ts` composes that host runtime with Main and feature state; `src/main/active-surface.ts` derives active Main, Reader, or Note interaction from Zotero focus, tabs, and editor state.

The Note surface is a separate interaction owner hosted by MainWindow. `src/main/note-editor.ts` identifies its attachment by editor Window, Document, and Note item ID; replacing any identity retires old input before listener cleanup. Zotero remains authoritative for Note content.

`src/main/controller.ts` coordinates Main actions; `src/main/navigation.ts` owns item/collection-tree motion; and `src/main/item-select.ts` owns the transient Visual range and its visible native-tree projection. Persistent Selection is session-owned and independent of native row selection. `src/main/picker/` resolves one transient candidate for the invoking action; the action owns confirmation and host mutation. Plugin Manager is a persistent surface with its own lifecycle. Shared mutations live in `src/operations/`; Main host capabilities live in `src/toolkit/main/`.

#### Reader

`src/reader/controller.ts` owns Reader sessions keyed by Zotero `instanceID`. Primary and secondary PDF views share one Reader Surface while retaining exact view identity for input, geometry, and navigation.

Reader feature modules own their state: `src/reader/navigation.ts` owns semantic traversal and feedback; `src/reader/selection-range.ts` owns the temporary keyboard Select range; `src/reader/flash.ts` and `src/reader/link-hints.ts` own targeting invocations; `src/reader/marks.ts` owns persisted marks; `src/reader/native-sidebar.ts` owns reversible Outline integration; `src/reader/caption-targets.ts` owns lazy caption/heading classification; `src/reader/comment-editor.ts` and `src/reader/native-input.ts` own feature input; `src/reader/selection-actions.ts` owns the view-scoped action palette. Feature input ownership does not create another Reader Surface mode.

Host capabilities are in `src/toolkit/reader/`; exact paths and private seams are listed in the [development guide](DEVELOPMENT.md#host-capability-toolkit). Reader lifecycle work is fenced to its live session and exact PDF view. Native event callbacks are retired by identity before unregistering, and only an authoritative Reader inventory permits retiring absent sessions. Teardown guards destroyed Gecko wrappers but keeps failures on live objects observable.

#### Shared navigation history

`src/navigation/history.ts` owns one per-MainWindow stack; `src/navigation/history-policy.ts` defines eligibility/evidence, and `src/navigation/coordinator.ts` owns admission, currentness, completion, and commits. `NavigationPort` is the recording entrance, with Main and Reader host adapters supplying native operations. Recording, restoration, and transport details belong in [NAVIGATION_HISTORY_DESIGN.md](NAVIGATION_HISTORY_DESIGN.md).

### 4. Host capability Toolkit

Zotero owns its domain data and native views. Neo owns interaction state only where the host cannot express the contract: Main persistent Selection stores stable item identities rather than rendered row indexes, and Reader keyboard Select uses a temporary DOM range because no supported host API currently updates Zotero's private PDF selection model.

`src/toolkit/index.ts`, `src/toolkit/main/index.ts`, and `src/toolkit/reader/index.ts` are the host-capability entries. Main includes Note-pane capabilities; there is no separate Note Toolkit. Toolkit contains native structural types, host lookup, callback patches, DOM integration, and resource retirement. Payloads crossing chrome/content compartments are cloned into the receiving window with `Components.utils.cloneInto`, centralized in `src/platform/cross-compartment.ts`. Feature owners—not Toolkit—choose targets, modes, bindings, history eligibility, confirmation, and feedback. Public item APIs and `src/platform/zotero-items.ts` stay directly usable when they satisfy the contract.

Required private abilities remain behind named capability contracts when a documented API cannot provide the same behavior; wrapping a private call does not make its dependency public. The [development guide](DEVELOPMENT.md#host-capability-toolkit) lists current owners and singular-versus-plural Scope preconditions.

## Shared primitives, not generic frameworks

Shared primitives are those already used across concrete owners: the input reducer and per-owner runtimes, semantic `ActionId`/capability projections, composition guard, typed item-target shape and Zotero normalization helpers, `fuzzyMatchScore()` adapter, theme managers, and concrete Operations. Picker, Plugin Manager, Reader overlays, and Surface target resolvers retain their own lifecycle and domain policy; sharing a primitive does not merge their contracts.
