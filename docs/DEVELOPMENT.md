# Development Guide

## Compatibility and verification

Support is limited to the latest stable Zotero release at the time of a Neo
release. The candidate manifest and update entry constrain the tested minor
(`10.0.*`), rather than advertising unverified future Zotero 10 minors.
GitHub Actions verifies formatting, strict TypeScript, Node contracts, and XPI
packaging on Ubuntu; it does not prove Zotero GUI behavior. Exercise a changed
reader, main-window, note, or preferences flow in the current stable Zotero host.
Physical OS-IME candidate confirmation, composing Escape/Backspace, native
clipboard, and human Outline paths remain unperformed under #137; CI, contracts,
and API-driven fault injection do not count as those human acceptance paths.

## Build

```bash
./tools/build.sh
```

The Windows-native equivalent is:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

Both builders run the same `npm run verify` workflow: Prettier, strict
TypeScript checks, Vitest contracts, the esbuild package build, and the XPI
member check. Run `npm ci` before either builder.

### Local GUI iteration from WSL

Ordinary GUI work should not depend on a GitHub Actions artifact. Use a
dedicated Zotero development profile and a separate development data directory.

Zotero 7+ exposes Firefox's Remote Debugging Protocol (RDP), including
temporary add-on installation and add-on reload. Neo uses that development path
instead of relying on extension-proxy discovery or repeated XPI installation.

Configure the dedicated profile once while it is closed:

```bash
npm run dev:setup -- --profile /mnt/c/Users/YOU/AppData/Roaming/Zotero/Zotero/Profiles/DEV.default
```

The setup command enables local remote debugging in that profile, remembers the
profile name/path and Zotero binary in the ignored local file
`.zotero-neo-dev.json`, and mirrors the existing `build/addon/` tree to a
Windows-readable directory inside the development profile.

Start the development Zotero instance:

```bash
npm run dev:start
```

This launches only the configured development profile with a local RDP server
and installs Neo from the mirrored unpacked build as a temporary add-on. Leave
that Zotero instance running.

Use a development profile without a separately installed Neo XPI when validating
temporary-add-on changes. A packaged Neo with the same ID already present in the
profile can leave competing Main/Reader key handlers and an older Command Palette
visible even when the RDP actor reports the new temporary add-on. Verify new
interaction behavior in a clean profile rather than attributing that state to
the changed build.

The normal code-to-GUI loop is then:

```bash
npm run dev
```

This rebuilds Neo, refreshes the Windows-readable unpacked mirror, and asks
Zotero's add-on actor to reload Neo in place. A normal UI change therefore
requires no Zotero restart, XPI reinstall, browser artifact download, or GitHub
Actions run.

Inspect the configured development connection:

```bash
npm run dev:status
```

The startup diagnostic remains
`<profile>/zotero-neo-startup.log`; it is useful for confirming lifecycle and
reader injection after an RDP install/reload.

The RDP client in `tools/dev-rdp-client.mjs` is a small development-only
implementation adapted from `zotero-plugin-scaffold` / Mozilla `web-ext`.
Neo keeps its existing `tools/build.mjs`, XPI packaging, and release pipeline;
Scaffold does not own production builds.

Keep three test modes distinct:

1. **Fast GUI iteration:** `npm run dev`, unpacked temporary add-on hot reload
   over RDP in the dedicated dev profile.
2. **Clean-install test:** use a fresh/reset development profile or explicitly
   clear Neo preferences before validating defaults or preference migrations.
3. **Packaged acceptance:** install the CI/release XPI when packaging,
   install/update lifecycle, or release behavior changes.

Uninstalling Neo does not intentionally clear `extensions.zotero-neo.*`
preferences, and item mutations such as tags or persisted marks remain Zotero
data. Reinstalling the same XPI is therefore not a clean-install or upgrade
test.

Reader lifecycle changes require both unpacked and persistent-package acceptance
in isolated profiles/data directories. Run at least three same-path RDP reloads
and three replacements from different unpacked roots. In every cycle, check that
old native Reader callbacks and PDF key listeners are gone, queued old callbacks
cannot inject UI, pending comment work stays retired, and existing plus newly
opened Readers execute input only once. Also close a secondary PDF before
disable/enable, exercise native editable focus handoff, and check Reader
close/reopen. Separately install an XPI into a clean profile and update it to a
higher fixture version through the native Add-on Manager; temporary RDP install
does not prove persistent installation or upgrade. Fixture version changes belong
outside the repository, not in release metadata.

Unexpected live cleanup failures must not strand later owners: detach every Reader view,
restore native bridges, retire all Reader/Main sessions, and clear the Bootstrap controller
reference before propagating the first failure unchanged. Session retirement is one-shot;
a second disposal must not be needed to release a split pane. During fault-injection
acceptance, confirm that disabling Neo still removes Main command handling when a live
Reader sidebar removal throws.

Reader session timers retain only pending handles. Completion or cancellation removes
ownership before running consumer work; a queued old callback cannot refocus an editor
or save a newer draft. Disposal cancels the pending set once, not the timer history.

Pending Reader injection checks Zotero's `_isTabClosed` flag before reading any
PDF view or iframe. A closed Reader retires its pending identity and retry timer
without creating a session; queued ready callbacks cannot revive that identity.
Live delayed-injection failures still retain their native cause and propagate.
Acceptance must close an unready Reader through native Main-window retirement,
then exercise surviving and newly activated Readers after the retry interval.

PDF event callbacks must match their exact live view registration before entering Reader
features. A failed listener removal cannot consume keys or deliver late view events after
retirement, including when Zotero later reuses the same PDF window. Keep the original
cleanup failure observable; callback fencing does not make failed DOM removal succeed.

The old extension-proxy path is intentionally not used for fast iteration:
runtime acceptance on Zotero 10.0.3 did not discover a first-time proxy in a
fresh profile, while RDP temporary installation and `reload` both succeeded.

GitHub Actions runs the Ubuntu verify/package builder for `main` pushes,
pull requests targeting `main`, version tags, and manual dispatch, then uploads
one canonical XPI artifact. The guarded release job runs for a `v*` tag or a
manual dispatch from `main` with a non-empty `release_tag`.
`tools/check-release.mjs` requires the tag, manifest version, compatibility range,
and prepared entry in the root `updates.candidate.json` to agree before publication.
Prepare and validate release metadata in that candidate feed; do not add the
candidate release to root `updates.json`, the live `update_url` feed, until its
matching published assets are actually available and publication is explicitly
authorized. Until then, `updates.json` remains limited to the unchanged official
0.1.0 entry. Do not create a release tag until its candidate-feed entry exists.

A source merge does not complete the user's unified functional and documentation
acceptance; that review remains separate from source and release preparation.

The publisher in `tools/publish-release.mjs` reads the same candidate feed,
additionally reads the manifest from the actual canonical XPI, and requires the
prepared entry's `update_hash` to be `sha256:<that XPI's digest>`. Freeze this hash
from the canonical CI artifact; changing runtime or packaged files requires a new
hash and affected acceptance. Local and CI archives can have different compressed
bytes even when every extracted payload matches. Do not transfer an install/upgrade
receipt to another whole-archive digest. The feed is not packaged, so recording the
digest does not change the XPI.

Publication verifies the checkout and resolved remote tag commit, captures the
draft Release ID, uploads to that exact asset endpoint, and downloads by captured
asset IDs. Only verified `zotero-neo.xpi` and `zotero-neo.xpi.sha256` are published.
An identical published release is a read-only no-op; conflicting bytes, incomplete
drafts, missing/additional assets and moved tags are rejected without overwrite or
automatic repair. Resolve those failures explicitly, not by substituting another
package. Keep published assets available alongside their corresponding tagged source.

The release job serializes its own runs by tag and rechecks captured draft and
asset state immediately before mutation. GitHub has no atomic draft-only upload
precondition: an external writer can publish between a check and an accepted
upload. Keep one publishing owner. Detected interference stops further mutations,
but local checks cannot guarantee isolation from other writers or undo their actions.

All Actions dependencies are pinned to verified upstream commit SHAs. Default
permissions remain read-only; only the existing formatter and release jobs have
their required repository-write permission. No repository immutability setting or
release publication is changed by local verification.

## Branding assets

Repository visuals and static package files have separate ownership:

- `assets/branding/zotero-neo-icon.png` is the original full-resolution Neo artwork.
- `assets/branding/zotero-neo-banner.png` is the README hero banner.
- `assets/package/` is the static XPI skeleton copied into `build/addon/` before
  generated JavaScript and `manifest.json` are added.
- `assets/package/icons/icon-*.png` is the seven-size transparent runtime icon set.
- `assets/package/content/preferences/pane.xhtml` is the static Zotero preference
  pane markup; its behavior is generated from `src/preferences/index.ts`.

The full-resolution RGB branding images have white backgrounds and are for
repository presentation and future asset generation only. Do not copy
`assets/branding/` into the XPI; the exact-member package check enforces that
boundary. Paths inside the XPI remain `icons/*` and `content/preferences/*`.

## Runtime architecture

The ownership model and interaction-scope design are summarized in
[ARCHITECTURE.md](ARCHITECTURE.md). This guide documents lower-level host seams and
implementation constraints.

Zotero Neo is authored as strict TypeScript and bundled to plain JavaScript for
Gecko Bootstrap. `bootstrap.js` remains a global Bootstrap entry point; it loads
the IIFE runtime bundle at `content/zotero-neo.js`, which installs one
`ZoteroNeo` controller on its global. Preferences use a separate IIFE at
`content/preferences/pane.js`. The XPI contains generated JavaScript only.

The reader has three relevant document layers:

```text
Zotero chrome window
  └─ reader.html          (reader._iframeWindow)
       └─ PDF.js iframe   (reader._internalReader._primaryView._iframeWindow)
```

Reader state belongs to `ReaderController` sessions keyed by `instanceID`; do
not put reader-specific state at module scope. Objects crossing the
chrome/content boundary must use `Components.utils.cloneInto(value, targetWindow)`.

### Neo-owned appearance

`src/ui/theme.ts` owns Auto, Light, and Dark resolution and semantic panel
tokens. Auto reads Zotero's computed `--color-background` first and falls back
to the owner window's `prefers-color-scheme`. Each main window or reader
document owns its own `ThemeManager`; preference, media-query, and root-attribute
listeners are disposed with that session. Apply variables only to Neo roots —
never recolour Zotero documents, PDF pages, annotation colours, or link hints.

### Module ownership

`src/input/engine.ts` is a pure, stateless reducer for key normalization inputs:
matching, count/prefix transitions, leader cancellation/backspace transforms, timeout
resolution, and side-effect-free consumption prediction. Host consumers retain event
gates, timers, guides, focus decisions, and action execution; Reader sidebar, Picker,
and Plugin Manager instantiate the shared local binding runtime where applicable.

`src/toolkit/index.ts` is the unified host-capability entry and re-exports
`src/toolkit/main/index.ts` and `src/toolkit/reader/index.ts`, the Main and Reader
entries. Note-pane capabilities are exposed through Main; there is no separate
Note Toolkit entry. Business code uses these entries, not implementation modules,
native structural types, or private host selectors. Necessary private abilities
remain available behind the same capability contracts.

### Host capability Toolkit

The Toolkit is internal, bundled with Neo, and adds no runtime dependency. It is
not a generic private-method dispatcher and does not expose internal Reader,
PDF viewer, item-tree, context-editor, or preference-registry objects. Standard DOM
windows are allowed for own UI and listeners; native PDF view identity is an opaque
handle. Handles reuse host identity rather than allocating a wrapper per key event.

Prefer documented APIs when they satisfy the existing semantics. Underdocumented
outer methods, Proxy forwarding, or third-party wrappers are not proof of a stable
public contract. `getSelectedCollection()` is used only for exactly one native
scope selection: Zotero's singular API rejects zero/multiple selection. Those
cases retain the explicit outer plural method and legacy tree fallback; detached
Scope Cursor is not substituted for the selected collection.

The current capability/dependency inventory is:

| Capability | Toolkit owner | Current host dependency and update check |
| --- | --- | --- |
| Selected items/collection and item opening/reveal | `main/host.ts` | Public item/selection APIs where equivalent; preserve singular/plural preconditions, returned failure and native save/navigation receipts. |
| Main Cursor, ScopeSet, tree focus and generation | `main/host.ts`, `main/tree.ts` | Private tree rows, focus-only selection seam and deferred generation identity; observe settled row-provider updates (including sort without refresh), preserve stable Cursor for identity-preserving updates, adopt explicit native target selection, and retire callbacks before unregistering. |
| Main tabs and selected metadata | `main/host.ts` | `Zotero_Tabs` inventory/selection; selected-tab immutable projection is reused until metadata changes, without full-inventory allocation per key. |
| Quick/Advanced/tag View | `main/host.ts` | Native UI/filter APIs and DOM; use the rendered view's plural scope rows, including supported mixed/cross-library selection, and the native combined tag query. Empty active tags win over stale UI state; never broaden candidates to entire libraries. |
| Main row-state decoration | `main/rendered-items.ts` | Native rendered-row IDs and DOM observers; installation failure retires callbacks, releases acquired resources and preserves the original error. |
| Note context/editor discovery | `main/host.ts` | Published context object, editor iframe and DOM identification; keep Note identity independent of Main selection and rebind on Window/Document/item changes. |
| Plugin registry/preferences | `main/plugins.ts` | Mozilla AddonManager plus private Zotero preference registry/launcher; return metadata/capabilities, not the registry. URL and self-disable policy stay in Plugin Manager. |
| Reader registration/inventory/identity | `reader/host.ts` | Official Reader event registration; private inventory/instance/closed/owner fields for lifecycle. Only authoritative inventory permits absent-reader retirement. |
| Reader keyboard forwarding | `reader/input-bridge.ts` | Private `_onKeyDown`/`_textAnnotationFocused`; policy is injected, old callbacks retire before restoration, only still-owned methods are restored. |
| PDF view discovery/listeners | `reader/view-lifecycle.ts` | Private primary/secondary windows and internal scroll surface; exact registration fences late events, including reuse of the same Window. |
| Reader page/search/zoom/split/focus | `reader/navigation.ts` | Native Reader/PDF view APIs and viewport geometry; preserve exact view, captured Find document/window and payload cloning. Semantic traversal stays in `ReaderNavigation`. |
| Navigation capture/reopen/completion | `reader/jump-host.ts`, `reader/history-bridge.ts` | Private histories, Find/link producers, promises and native hard receipts; verify ownership/settlement, not merely that a save callback ran. Shared history policy stays outside Toolkit. |
| PDF text/selection/annotation geometry | `reader/pdf-text.ts`, `reader/selection-geometry.ts` | Private PDF text-layer/page structure and viewport conversion; preserve text-only clipped rectangles, full text, adjacent-page limits and fail-closed incomplete geometry. |
| PDF link hints | `reader/links.ts` | Private link overlay map, client rectangles and native link delegation; preserve exact source/destination, pane ownership and external native handling. |
| Native Sidebar | `reader/sidebar.ts` | Private state and Outline/Annotations/Thumbnails DOM; reversible decoration and focus/mutation mechanics only. Binding contexts and target choice stay in `ReaderNativeSidebar`. |
| Annotation selection/filter/comment protection | `reader/annotations.ts` | Private native selection/filter/deletion/popup seams; actual item mutation uses public item APIs. Release restores the captured native owner, not its replacement. |
| Bookmark geometry/Extra compatibility | `reader/marks.ts` | Private PDF page geometry and legacy Extra access; parent-versus-attachment storage target is chosen by `ReaderMarks`, not Toolkit. |
| Structured document blocks | `reader/structured-document.ts` | Underdocumented `Zotero.SDT` reader; native processing cannot be cancelled. Retire results without starting later stages; semantic caption/heading classification stays in `ReaderCaptionTargets`. |

All paths in the owner column are relative to `src/toolkit/`. Public Zotero item
operations and `platform/zotero-items.ts` remain usable directly; do not wrap every
public getter/save solely to make imports uniform. Do not replace Cursor with
`getSelectedItems()`, exact-view navigation with a default-view call, or a reliable
completion contract with an interface-presence check.

For a host update, inspect the affected capability's implementation and caller
invariants, then exercise its native workflow and lifecycle. Keep a small number
of high-consequence contracts for target identity, save admission, duplicate
commit, retirement and migration; reuse existing workflow coverage rather than
adding private-helper/source-text assertions. Node contracts and packaged-member
checks do not substitute for actual Zotero input/focus/save verification.

Context Note resolution reads the native `ZoteroContextPane.context.activeEditor`
inside Toolkit through `activeContextNoteItem()` and `mainNoteEditorWindow()`.
Zotero publishes `context` during initialization; its controller-level `activeEditor`
getter dereferences the not-yet-created inner pane when a new Main window first loads.
Missing context means no context Note is available yet, not a failed Main attachment. Re-read the
native context on every resolution so later initialization, editor replacement, and focused Note
precedence remain host-authoritative. Live getter failures are not hidden, and no retry or mirrored
readiness flag is introduced.

`src/main/focus-ownership.ts` claims Zotero's initial Library Quick Search focus
only for `APP_STARTUP`. An empty search already focused when Neo attaches is
claimed on the next event-loop turn so direct user input can cancel. Otherwise
the one-shot gate waits for native Quick Search focus without an idle deadline;
direct input, another focus target, a tab change observed through focus, or
session cleanup ends it. `ADDON_INSTALL` also occurs on RDP hot reload, so
installation, reload, enable, upgrade, nonempty search, and unrelated editors
retain their focus. Zotero still owns Reader-to-Library tab focus restoration.

History restoration focuses the rendered Items/Collections tree `_topDiv`
directly when available. Zotero's native tree/view `focus()` queues a callback;
it cannot prove focus synchronously and can outlive the restore attempt.

`src/main/settings-center.ts` owns one disposable page at a time. Appearance
retains its session-only editor state; `settings-interaction.ts` owns the live
Picker mouse and Note editor toggles; `settings-reader.ts` owns Reader modes,
scrolling, marks persistence, and default annotation colour;
`settings-keybindings.ts` owns Prefix Guide controls and the explicit-Apply
keybinding draft; `settings-advanced.ts` owns interface/command-language selection
and the virtual tag namespace separator. `src/i18n/` owns the application-level
English/Simplified-Chinese locale catalogs and shared action labels;
`settings-i18n.ts` is only the typed Settings compatibility adapter over that
shared layer. `SettingsCenter` remounts the active page when the configured
language changes. `settings-ui.ts` owns shared button,
field, choice, row, toggle, numeric-field, and text-field geometry, while
`src/core/preferences.ts` names the shared preference keys/defaults and resolves
language/tag policy. The keybinding editor state machine lives in
`src/input/binding-editor.ts`; its Settings view is Main-owned and does not
depend on Zotero Preferences/XUL controls. Zotero Preferences is now a
launcher-only compatibility bridge into Neo Settings; no editable Neo setting
is duplicated there.

Keyboard configuration has one shared source rather than parallel per-surface maps.
`src/input/bindings.ts` owns the exact `BindingContext` set, defaults, resolution,
and migration helpers; `actions.ts` is the canonical ActionId registry, and
`binding-capabilities.ts` delegates availability to each real owner executor.
`shortcut-catalog.ts` projects localized action/group/context metadata, effective
and default keys, origin, and separate native/read-only records. `binding-editor.ts`
is the pure draft/validation state machine; `settings-keybindings.ts` and its view
own interaction, serialization, and Apply. The Settings browser searches action
labels and IDs, assigned/default keys, groups, and contexts, and distinguishes
Default, Custom, and Unbound. Add/Record, Done/Cancel, and Apply are explicit:
Enter and Escape can be recorded tokens, not implicit recorder completion. Drafts
remain staged until Apply. On recorder exit, restore the edited action's summary
when it remains in the filtered results; otherwise return focus to Apply/search.
Keep the result/native region bounded so Apply remains reachable before results,
and keep Prefix Guide collapsed. Duplicate, malformed, incompatible, and
native-reserved bindings block Apply; strict prefixes warn without blocking.
Unbind/reset changes only one action in one context and preserves other rows.
Resolution retains only the latest serialized preference value; a different value
invalidates it immediately. Mode projections are cached only for frozen binding maps
using weak ownership. Mutable editor drafts are always projected afresh; there is no
inherited scope or extra preference observer.
Carried incompatible orphan rows can be deleted but are not presented as
executable actions.

Action choices come from owner capabilities, not from labels or default rows.
The local contracts that are easiest to misstate are:

| Context | Configurable contract and native ownership |
| --- | --- |
| `reader-outline` | Neo local next/previous, parent/child, confirm/cancel, panel focus and document heading actions; `uiConfirm` is default-unbound. Native arrows, Tab, and Enter/Return (including modified Enter) stay with Zotero. Caption controls reuse this context. |
| `reader-marks` | Neo list movement, first/last, confirm/cancel, delete/clear, panel focus and document heading actions. Native arrows and Tab stay with Zotero. |
| `reader-annotations`, `reader-thumbnails` | Neo movement, cancel, panel focus and document heading actions; native arrows and Tab stay with Zotero. |
| `picker-input`, `picker-list` | Separate query-input and list contexts; owner-supported movement/first/last, confirm/cancel, preview scrolling, and pane-switching actions are configurable, with `uiSearch` available on the list side. Text editing and native editor keys are never claimed. |
| `plugins-input` | Only `uiFocusList` is supported (Escape is the default); it does not support `uiNext`. |
| `plugins-list` | Owner-supported list navigation/search/cancel and actual Plugin Manager operations. |

Use the capability modules in `src/reader/action-capabilities.ts`,
`src/main/picker/action-capabilities.ts`, and
`src/main/plugin-manager-capabilities.ts` for any further context inventory.
`nativeShortcutCatalog()` is disclosure, not an editable binding map; native
records are read-only, context-labeled, and shown only when All groups is selected. Reservations
are checked at every token in a sequence. In particular, Picker/Plugin query
`Ctrl+Insert` and `Shift+Insert` remain native copy/paste, and a Neo remap never
claims to disable a host shortcut.

`LocalBindingRuntime` is instantiated by each owning surface with host-provided
timer adapters and action execution. The host qualifies target, context, editable
and composing input, and native reservations before invoking it. It resets on
context/target/binding changes and native handoff; the surface deactivates it on
focus or pointer transfer and disposes its timers/runtime on close or teardown.

#### Current Surface and runtime ownership

A Surface is distinct from its Zotero host, exact `BindingContext`, and any
feature input owner. `src/addon.ts` composes Main and Reader controllers and
passes Reader narrowly named Main-window capabilities. `src/main/window-runtime.ts`
owns services for the physical MainWindow; one `src/main/session.ts` composes
that host runtime with Main Surface state and feature runtimes. Its separate
`src/main/note-runtime.ts` owns Note mode, input, and register state for the
currently attached editor. `src/main/note-editor.ts` identifies Note interaction
by editor Window, Document and Note item ID and rebinds when any changes. Pending
operators/counts and old key callbacks belong to that exact attachment; retirement
fences input before independent host listener removal.
`src/main/active-surface.ts` derives context-pane Note, selected Note tab,
selected Reader tab, or Main from Zotero state; the Main controller invokes
explicit deactivation hooks rather than storing another mutable active-Surface flag.

`src/input/engine.ts` is the pure matcher/reducer. `src/input/runtime.ts`
(`InputRuntime`) owns pending sequence/count/timer/revision state per input
owner: Main and Note have separate instances in their Main-window session, and
each Reader session owns one. `src/ui/key-guide-runtime.ts`
(`PrefixGuideRuntime`) owns guide presentation and timers, not input state; Main
and Note share the Main-window guide, while each Reader session owns its guide.
`src/input/local-binding-runtime.ts` is reused by local controls such as Picker
and Plugin Manager; the host feature still qualifies input and owns focus/lifecycle.

`src/core/item-target.ts` defines the common `ItemTargetSet` shape;
`src/platform/zotero-items.ts` supplies Zotero item lookup, Note ownership keys,
and top-level normalization/deduplication. Surface choice stays in
`src/main/main-item-target.ts` (Main EffectiveSelection),
`src/reader/item-target.ts` (Reader item context), and
`src/main/note-item-target.ts` (active Note context). Consumers use the typed
Surface resolver directly; no shared compatibility dispatcher/re-export remains.
Concrete Operations under `src/operations/` implement actions over explicit resolved
items or IDs. `src/main/tag-actions.ts` and `src/main/collection-actions.ts`
own chooser/action orchestration; `item-tags.ts` and `item-collections.ts` own
the mutations.

`src/reader/controller.ts` owns Reader sessions keyed by Zotero `instanceID`.
Each session composes Reader-local owners, including `ReaderViewLifecycle`,
`ReaderNavigation`, `ReaderSelectionRange`, `ReaderMarks`, `ReaderNativeSidebar`,
`ReaderCommentEditor`, `ReaderNativeInput`, `ReaderFlash`, `ReaderLinkHints`, and
`ReaderSelectionActions`; these feature lifecycles do not become additional
Reader Surface modes or one generic overlay framework.

`migrateBindingPreferences()` in `src/core/preferences.ts` owns the binding schema
version (currently 18); `bindings.ts` provides the key/action transformations.
The schema-18 migration is repeat-safe, writes changed overrides before the
version, preserves non-null custom mappings, and moves an explicit-null
cancellation only when its destination has no override.

Reader preference policy is centralized in `src/core/preferences.ts`: Reader mode
flags, marks persistence, default annotation colour, scroll defaults/ranges, and
the legacy `smoothScroll` migration all resolve there. Reader runtime and
`settings-reader.ts` consume that same normalized configuration rather than
carrying separate scroll defaults or clamping rules.

`src/main/picker/` owns one shared candidate search/list/preview surface plus finite
sources for items, tabs, notes, tags, and commands. The shell owns lifecycle, rendering,
focus, queueing, confirmation/cancellation, and containment. Ordinary object sources own
only candidate loading and presentation; the semantic action that opens the surface injects
the confirmation callback and therefore owns the host operation. Command Palette reuses the
same surface to resolve an `ActionId`. Tag candidate sources may project namespaces,
create candidates, and action-specific metadata, but they do not mutate item tags or Main
filter state. `TagActions` owns candidate/action orchestration; `operations/item-tags.ts`
performs item mutation, while `MainViewActions` owns Main filter mutation.

Main View filtering follows the complete native rendered scope, not an arbitrary
first selected collection. Toolkit uses `CollectionTreeRow.getTagsAcrossRows()`
for multiple rows, matching Zotero's tag selector and respecting current search
and filter predicates. Active tags remain available for removal when a filter
produces no results. Matching item counts use native `objectRowCount`, excluding
library headers and spacers. Native selection normalization remains authoritative.


The native Reader Outline retains Zotero's rows and hosts bounded Neo caption and Bookmarks groups. `src/reader/native-sidebar.ts` owns reversible compact decoration and group DOM; `src/reader/outline-presentation.ts` derives kinds; `src/reader/caption-targets.ts` owns lazy native caption/heading data and PDF-position projection; `src/reader/marks.ts` owns persisted marks and managed jumps. Zotero remains authoritative for native Outline content, navigation, and sidebar state.

Reader panels and category navigation retain native ownership boundaries. The
Normal defaults `<Space>ro`, `<Space>rm`, `<Space>ra`, and `<Space>rt` focus/open
Outline, Bookmarks, Annotations, and Thumbnails directly; repeating a focus action
does not toggle the pane closed. Previous/next defaults are `[s` / `]s` for
the complete native heading hierarchy (including Section/Subsection), `[f` / `]f` for figures,
`[t` / `]t` for tables, `[a` / `]a` for annotations, and `[m` / `]m` for
bookmarks. Heading actions are also explicit defaults in all four sidebar contexts and
delegate to Reader navigation without moving sidebar focus. Candidate order/currentness
uses the exact PDF view's live geometry, never the active native row or expanded/filter subset.
Heading requests resolve unique genuine native heading geometry when an authored bookmark
precedes its printed heading, including a page break, without changing the native hierarchy.
Figure/Table requests merge explicit native targets with valid native SDT captions on demand;
Figures align trustworthy image regions above captions, while Tables retain caption positions.
Missing or ambiguous geometry retains its honest fallback. Bookmark traversal preserves
persisted/legacy marks and annotation links.
Panel focus creates no synthetic history route. Outline destinations use their
exact-view native-hard evidence; bookmark jumps are one managed-final excursion
through the shared navigation coordinator.

Native Outline arrow and Tab events pass through to Zotero. Default `j/k` bind
to configurable `uiNext` / `uiPrevious` aliases that dispatch native Up/Down,
preserving immediate row navigation; `h/l` bind to `uiParent` / `uiChild` and
dispatch native Left/Right. `uiConfirm` is remappable but default-unbound;
Enter/Return, including modified Enter, remains exclusively host-owned.

## Reader keyboard forwarding

Zotero forwards PDF keys through `PdfView._onKeyDown`, outside normal DOM event
propagation. `preventDefault()` alone cannot prevent reader shortcuts such as
Read Aloud or tool switching. The plugin wraps that forwarding callback and
uses `_readerConsumesKey()` to suppress only keys handled by Neo. Preserve the
pair whenever key handling or reader injection changes.

The patch is reapplied as reader views are recreated. Restored reader tabs need
the periodic discovery sweep because they can miss early toolbar events.

The default Reader Normal `H`/`L` tab actions and the `zh`/`zl` pan chord are consumed by
Neo's resolved `BindingMap` before Zotero forwarding; retired unbound `J`/`K` keys remain native.
Smooth-hold checks still consult the resolved action, so the default H/L tab actions cannot start
horizontal pan, while an explicit custom H/L scroll remap remains eligible.

Reader Normal `+`/`-` and `zI`/`zO` delegate to Zotero's `InternalReader.zoomIn()` /
`zoomOut()` on the active `_lastView`; `=`/`z0` delegate to `zoomReset()` for fit-page-width
semantics. Missing or throwing host methods fail closed with `Zoom unavailable`.

Reader `gg`, `G`, and counted page jumps share `ReaderNavigation.navigateBoundary()`:
it resolves a zero-based physical page index (`G` reads the active PDF viewer's
`pagesCount`) and calls `InternalReader.navigate()` with a cloned payload. Do not use
the host first/last-page event shortcuts: they do not save a hard history point.
All recording enters through `NavigationPort.execute()` or `observeNative()` and
commits through `NavigationCoordinator`. `NavigationHistoryState` owns the one
per-window stack. Main's `MainNavigationExecutor` in `main/jump-history.ts` builds
operations and supplies location capture/restore; do not append directly or create
a second Reader history owner.

Directional focus reuses the executable binding dispatcher. Reader split movement
calls `InternalReader.focusView(primary)` based on `splitType`; every Reader command
then resolves the same active view from the event source and Zotero's
`_lastViewPrimary` state before consulting Gecko focus. This keeps page turns,
scrolling, history, and link actions on the split most recently focused by mouse or
keyboard. Right-edge movement uses Zotero's context-pane focus callback. Main-window
movement ranks visible pane rectangles in the requested half-plane, prefers candidates
aligned on the movement axis, and never wraps. A directional key is prevented only
after a target is found.

`src/main/picker/` is the shared candidate search/list/preview surface, not a
domain-operation layer. Ordinary providers supply candidate data and presentation;
the opening semantic action supplies `PickerOpenOptions.confirm`. Confirmation
admission synchronously captures candidate ID/title, provider callback, picker
generation, and source revision before queueing. It is single-flight; before the
callback runs, the shell rechecks the same generation/source/provider and admitted
candidate, so Preview movement cannot retarget the operation. Failures expose an
accessible error naming the admitted target. Successful confirmation closes the
surface; an action may intentionally request close-before-confirm, as Command
Palette does when opening another chooser.

Shared Picker and TagPath fuzzy ranking goes through Neo's `fuzzyMatchScore()` adapter, backed by
the pinned, audited `fuzzysort` vendor snapshot. esbuild folds that ESM into the runtime IIFE; no
npm/CDN/native dependency is resolved at runtime. Keep consumers behind the adapter instead of
importing the vendor module throughout feature code.
Picker keeps only the best 100 ranked candidates, retaining source order for equal
scores and the full matched count. An empty query slices the source directly.
Keyboard row movement updates selection and Preview on the existing result DOM;
query/source changes still rebuild the candidate list.

The shell owns generic navigation: unmodified ArrowUp/ArrowDown when search/list owns interaction,
Ctrl+j/k (and Ctrl+n/p aliases), list-local j/k, `/` to return to search, Ctrl+d/u preview
scrolling, Enter confirmation, Escape cancellation before admission, pointer selection when enabled,
IME ownership, and generation/source-revision stale-work rejection. Escape/backdrop cannot undo an
admitted operation, but public close still releases lifecycle ownership immediately. Committed queries
survive initial/source-switch loading and exclude intermediate composition text. Optional source
switching is candidate data only and preserves invocation callbacks; ordinary sources must not add
domain mutation keys. Stable candidate `group` keys decorate existing rows with boundaries, never
extra selectable rows or display-name identities.

The command source is a finite projection of the active resolved `BindingMap`: it deduplicates
supported `ActionId` values, displays key hints separately from key-independent
`ACTION_LABELS`, and hides the launcher itself. The Main/Reader/Note owner provides the executor
through the invocation confirmation callback, so command execution remains in semantic dispatch
rather than provider activation. Reader contexts still revalidate session/view ownership before
execution.

Bibliographic candidate previews remain bounded and synchronous: title, creator, year, and citation-key metadata plus attachment and child-note counts and up to six safely accessible filenames/titles. The chooser does not render PDF pages. A Picker cover preview is separate future work and should be selected-attachment, asynchronous work. Zotero's live Reader has a thumbnail data-URL cache/`ReaderPreview` path, but that is not a ready-made closed-file image API; this change adds no Picker cover-preview service.

Notes default to the frozen invoking Item's child IDs (or the standalone Note
itself); a missing Item or zero child Notes stays honestly empty, with no Library
fallback. The explicit same-invocation Library switch uses Zotero Search and
preserves the original context, committed query, and confirmation callback.
Candidates search normalized title and HTML-stripped body from `getNote()`.
Library grouping uses stable library/owner IDs; current ownership is preferred
where ordering allows, while fuzzy-query relevance remains authoritative. Candidate
rows show titles only; owner boundaries are nonselectable decorations. Preview
resolves the selected Note's actual parent independently and preserves body
paragraph boundaries, including honest standalone and unavailable-source labels.
Citation-related text is not grounds for hiding a human Note. Note create,
trash, and restore remain outside the chooser contract.

Main freezes the Reader's DOM-free `ReaderSelectionContext` before opening the
Notes chooser, which confirms an existing Note in the captured library. It checks
that the target's `noteOwnerKey` still matches the admitted source before calling
the append/save primitive; a reparented Note must be refreshed before mutation.
A `ReaderNoteCaptureReceipt` with the saved note ID and title is returned only
after native save succeeds. Forced
chooser replacement waits for the admitted save's actual outcome and returns a
retired result carrying its receipt or null, suppressing stale Reader status and
focus without undoing a completed save. Failed appends restore only unchanged
in-memory content, never a concurrent native edit. Reader shows receipt status
only while its captured action generation and PDF view remain current.

Reader annotation geometry supports one page or two adjacent pages. More page groups,
non-adjacent groups, unmatched fragments, or incomplete PDF conversion cannot create
a partial annotation, even when native selection parameters are present. Select and
its full text remain available after rejection. Selection snapshots keep that full text
and the first readable page label, with `position: null` when geometry is unsupported
or incomplete. Bounds are measured once per visited page within one computation,
never cached across selection or viewport changes.
Cross-page rectangles come from text-node ranges clipped to the actual endpoints;
whole-page/canvas boxes returned by a broad DOM Range are not annotation rectangles.

Tag candidate sources follow the same chooser contract as ordinary object sources. They may
project virtual namespaces, explicit create candidates, and action-specific metadata, but they do
not mutate item tags or Main filter state. `src/main/tag-actions.ts` owns tag candidate/action
orchestration and passes explicit targets to `src/operations/item-tags.ts` for persistent item
mutation. `MainViewActions` owns Main View mutation for Quick Search, Advanced Search, and the
tag-filter application behind `tf/tc`; these remain distinct from persistent data mutation.

## Reader Flash visible-text targeting

`ReaderFlash` owns one active visible-text invocation: the PDF view, literal query, normalized text
index, stable label reuse, label buffer, prompt/badge DOM, and cleanup. `ReaderSessionState` must not
mirror any Flash state. The session only resolves Flash as Select-start or Select-end targeting. Normal `v` either adopts an
existing native selection or uses Flash to create the initial range; Select `s` moves the far endpoint
while preserving the anchor. There is no separate Cursor user mode.

Desktop Zotero has two distinct text-selection models. Its PDF stylesheet makes ordinary DOM
`::selection` transparent, while mouse selection is rendered from the private PDFView
`_selectionRanges` model. Neo currently owns a DOM range for keyboard Select and must not pretend that
range has been synchronized into Zotero's semantic model. While Select is active, a narrowly scoped
`::selection` rule mirrors Zotero/PDF.js's native-selection blue; it is inactive outside Select and does
not add an endpoint caret.

For the same reason, Select `y` must not call `document.execCommand('copy')`: Zotero's capture-phase
copy handler reads `PDFView._selectionRanges`, and a Neo-only DOM range leaves that array empty. Neo
copies its DOM Selection directly and collapses PDF layout whitespace to ordinary spaces. A future host
bridge may synchronize semantic ranges, but it must be implemented and verified explicitly rather than
assuming DOM Selection is authoritative. Keep direct high-frequency actions on bindings instead of
duplicating every command in Selection Actions; the palette is primarily for low-frequency and externally
registered operations.

The v1 index includes only currently visible `.textLayer span` text from the active PDF view. It
normalizes NFKC and whitespace, supports literal cross-node matching with ASCII smartcase, and ranks
labels by distance from the current caret/focus (or viewport center). Incremental query updates first
run the cheap in-memory matcher. When more than `FLASH_TARGET_LIMIT` (48) matches remain, Flash
updates only the prompt and intentionally performs no Range geometry or per-target DOM rendering.
At or below that limit it measures visible targets and reuses stable labels where possible.

The first character of every rendered label is excluded from the set of letters that can extend any
current match by one character. This mirrors Flash.nvim's continuation-safe label idea: continuing the
search and starting a jump cannot compete for the same key. Multi-character labels use a fixed width
after their safe first character. Enter selects the nearest currently labelled target; Flash never
auto-jumps merely because only one text match remains. Scroll, resize, split-view replacement, blur,
mode change, and disposal cancel the invocation instead of live-reindexing stale PDF.js text. Flash
query editing is hosted by a real focused HTML input, so Gecko/OS IME composition, Backspace,
and Unicode text editing remain browser-owned. Neo only consumes committed `input.value`, actual
Flash commands, and continuation-safe ASCII hint labels; fuzzy Flash search, regex,
transliteration, OCR, and whole-document indexing remain outside v1. See `INPUT_METHODS.md`.

Flash claims Zotero host forwarding only in the PDF view that owns its query. Native
focus transfer from the PDF body into that input is not a view exit: the captured
blur event's related target is compared by canonical native identity across Xrays.
Input and composition callbacks retain their invocation, so retired callbacks cannot
replace a newer query or its composition state. Cancellation retires ownership before
DOM cleanup and skips destroyed input/prompt/badge wrappers; unexpected live DOM
failures remain observable while the remaining input/prompt cleanup still runs.

## PDF text vertical motion

Visual `j` and `k` must not delegate to Gecko
`Selection.modify(..., 'line')`. PDF.js text layers are absolutely positioned
spans, so browser line granularity can jump across unrelated DOM positions. Neo
groups contiguous `.textLayer span` nodes into visual lines using client-rect
overlap while preserving PDF.js DOM reading order. A vertical step moves exactly
one such line and chooses the caret offset nearest the remembered horizontal X
coordinate. Non-vertical Select motions clear that preferred X. This keeps
ragged lines stable and lets column/page transitions follow the PDF text layer's
reading order without introducing Neo-owned text content or selection state.

## PDF link hints

Zotero does not expose its authoritative PDF links as ordinary `a[href]` nodes.
The active `PDFView` stores semantic and annotation fallbacks in the page-indexed
object map `_pdfPages`, with each loaded value exposing `overlays`. This host
container is not an Array; enumerate its values without requiring array identity.
Semantic and native fallbacks that share source geometry collapse to one hint.
Selectable targets are `internal-link`, `citation`, and `external-link`; standalone
`reference` preview overlays remain Zotero-owned.

Activation must stay on the same primary or secondary `PDFView`. Internal links use
their `destinationPosition`; citations use the first resolved reference position; both
call Zotero's native `navigate({ position })` API so Zotero owns actual PDF link
navigation. Because the call crosses from Bootstrap chrome into the reader content
realm, clone the complete location payload into `reader._iframeWindow` first.
External targets call `_onOpenLink(url)` with a primitive string.
`ReaderLinkHints` owns hint badges, key-buffer filtering, viewport RAFs, and the
temporary destination cue; `ReaderSession` orchestrates host/view boundaries.
Hint input belongs only to its captured PDF view: composing keys stay native,
and keys from another pane or an editable control cancel and yield to that context.
Badge/cue/RAF ownership retires before DOM cleanup; destroyed nodes/windows are
skipped while unexpected live failures remain observable. Queued RAF/timer callbacks
must still own their captured badges/cue before changing current state. New hint
invocations, cancellation, Reader deactivation, and exact-view release retire pending
activation receipts, so late navigation failures cannot affect a newer invocation.
The destination cue does not create a Reader Surface mode.

Main's jump-history adapter and the shared coordinator own qualifying Reader jumps
and cross-surface Back/Forward. The bridge in `src/toolkit/reader/history-bridge.ts`
observes native payloads to maintain actual hard/transient baselines, but a raw save
is never an append path. Its native-hard receipt must belong to the exact patched
view/window/history and producer, and its saved destination must match that producer's
settled final geometry. Eligibility follows `history-policy.ts`, not an action
whitelist or save-kind test alone. Completion remains independent: search, annotation
selection, and other paths can complete successfully without a hard point or history
entry when the configured evidence is absent.

The private transport is pinned to Zotero stable 10.0.5 and Reader SDK
`9d821fa2c1941bdfdd7bee3199936401b45be852`; revalidate every private seam on host
updates. The SDK's `_pushHistoryPoint()` awaits scroll settling, then performs its
terminal `_history.save()` immediately before the original Promise fulfills. The
bridge associates that save through the original producer's direct `.then` terminal
boundary and a PDF `queueMicrotask` emission/clear boundary. Preserve exact native
wrapper identity, original receiver/arguments/return value and Promise behavior;
producer identity comes from the scoped wrapper, exact window/history/view stamps,
and owned callback/request scope—not FIFO order, save cardinality, or matching
geometry. Callback bindings carry immutable operation ownership only for their
registered work. An owned scope that closes stays owned and rejected; it cannot be
reclassified as native. Truly detached native motion uses `observeNative()` only
when its selected Reader tab and exact-view receipt are current; focused-pane state
is not the eligibility test, and no synthetic Main token/history is made when a
navigation port is unavailable. Unsupported owned transport rejects rather than
falling through to a generic native recorder.

For `pageNumber` / `pageLabel`, the SDK awaits its own writable `_pageLabelsPromise`
once before moving and invoking the producer. The bridge temporarily tags that exact
await with a request-specific native-realm thenable (`cloneFunctions: true`), restores
the original field immediately, and publishes the immutable invocation only across
the PDF microtask that resumes the SDK. Exact patch/window/history/view stamps reject
retired continuations. Do not copy the label parser, patch global Promise behavior, or
assign delayed label work to whichever operation is latest. Revalidate the single-await
producer seam on host updates. Native Outline navigation uses Zotero's native controls and the existing `reader-native.hard` observation, not a separate Neo confirmation callback.

Managed marks report one final exact-view destination; their intermediate native
producers remain children. Restore producers are Traverse children and cannot
self-record. Preserve native history and hard/transient baselines even when Neo's
policy ignores recording. Reader capture/restore/reopen uses `cloneInto` for
cross-compartment payloads, restores the exact primary or secondary PDF view, and
reopens the same readable attachment when its tab is gone. Host patches are released
on view replacement or session disposal. Snapshots omit zoom and layout. Invoke
content callbacks through chrome's `Reflect.apply`: content `Function.apply` cannot
read a chrome argument-list array. Native navigation destinations and options still
require `cloneInto`.


After successful internal/citation navigation, Neo mirrors
`PDFRenderer.renderPreviewPage()` target semantics over the live PDF document:
`#f57b7b` with `multiply`, a 7-pixel-radius circle when either client dimension
is below 5 pixels, otherwise the client rectangle. Use
`getClientRectForPopup()` instead of invoking the preview renderer, which would
render and crop a separate canvas with coordinates unrelated to the live view.
The one cue follows scroll/resize and is owned by the view/session timeout;
never represent it as a Zotero annotation or DOM text selection.

## Reader smooth-scroll ownership

`ReaderSession` resolves bindings and count/chord state, but continuous scroll physics are owned by
`ReaderSmoothScroller`. The feature owns the physical hold key, active/releasing phase, axis,
direction, speed, timestamp, requestAnimationFrame ID, and the PDF view that scheduled the frame.
Normal-mode input hands it only an already-resolved scroll action. Counted motions and step mode stay
on the ordinary discrete action path.

The owning PDF view is part of the transient state: switching a hold to another split view cancels
the old view's frame before scheduling the new one, and view release/disposal cancels the frame on
that exact window rather than whichever Reader view happens to be active later. Follow mode stops on
keyup; trapezoid mode decelerates unless `smoothScroll.stopOnRelease` requests an immediate stop.
Reader session state must not mirror the continuous hold/RAF fields.

## Reader native sidebar ownership

Zotero's Reader document owns `_internalReader._state.sidebarOpen`, `sidebarView`, `outline`, and `pageLabels`; `setSidebarView(view)` and `toggleSidebar(open?)` control the native sidebar. `src/reader/native-sidebar.ts` adds reversible Neo-prefixed attributes/styles and bounded caption/Bookmarks sections inside the Outline wrapper. It does not replace React-owned titles, rows, or children. Native Annotations and Thumbnails remain independent Zotero views; `src/reader/marks.ts` remains the persisted marks and managed mark-jump owner.

`src/reader/outline-presentation.ts` derives kinds from title and hierarchy: every meaningful unnumbered root, including a leaf such as Introduction, is a Section; nested headings are Subsections, with authored numeric hints retained. Explicit numbered Figure/Fig/图 and Table/表 titles are separate kinds. The sidebar projects stable `1`, `2`, `3.1`, etc. from the whole tree, independent of expansion/filtering and excluding Figure/Table entries from heading counters. Compact colored icons/ordinals and numeric direct-child counts have localized accessible/hover descriptions. Native titles and numbering remain untouched; badges are presentation, not verified PDF semantics.

`ReaderCaptionTargets` calls `Zotero.SDT.getReader(itemID)` only for an explicit heading/Figure/Table request or caption-group expansion, sharing one single-flight session result. The installed SDK exposes no cache-only or cancellation option: a warm validated pack is reused; a missing/invalid source cache can queue native whole-file PDF text/layout/block processing. Reader open never starts this extra work; Neo adds no OCR engine, upload, or runtime dependency. A unique genuine `heading` block matching an authored title (with optional native numeric/appendix ordinal) on the authored or immediately following page supplies its printed geometry; unavailable/ambiguous matches retain the authored position. This changes destinations, not the native hierarchy or titles. Only labeled `caption` blocks with valid `anchor.pageRects` create Figure/Table identities. A Figure may use a single same-page image above its caption with compatible horizontal spans; only native excluded paragraphs geometrically contained within that image may intervene. A 0.01 PDF-point comparison tolerance accommodates native anchor precision without moving coordinates. Ambiguous images retain caption geometry; Tables remain caption-anchored. The cache publishes honest loading/ready/unavailable states, ignores retired results, and is released with the Reader. All projected positions are cloned into the Reader window for both native geometry and `navigate()` calls; native scrolling and zoom policies are unchanged.

The sidebar belongs to the Reader document, not a PDF view: PDF focus and split-pane changes do not mirror or transfer sidebar ownership. Zotero's native sidebar state remains authoritative. Keyboard forwarding qualifies the focused target in the Reader document's `#sidebarContainer`, then selects the exact Outline, Marks, Annotations, or Thumbnails context; visibility alone does not claim PDF commands. Native `focusin` and pointer handoff deactivate the sidebar matcher and retire pending PDF shortcut sequences.

The Normal defaults `<Space>ro`, `<Space>rm`, `<Space>ra`, and `<Space>rt` directly open/focus Outline, Bookmarks, Annotations, and Thumbnails; repeating a focus action does not close the pane. Toggle actions are separate. Schema 18 retires the old `<Space>e` / `<Space>m` and bare `[` / `]` defaults while preserving non-null custom overrides. In Outline, default `j/k/h/l` bind to `uiNext` / `uiPrevious` / `uiParent` / `uiChild` in `reader-outline` and dispatch the corresponding native arrows, preserving immediate native row/tree navigation; those Neo bindings are configurable. Physical arrow keys and Tab remain host-owned. Enter/Return, including modified Enter, is exclusively host-owned; `uiConfirm` remains available but default-unbound and remappable. Escape's default `uiCancel` closes the sidebar and focuses the active PDF.

Reader deactivation clears transient focus and pending local sequences without closing the native sidebar or erasing host sidebar state or stored marks. The Bookmarks group is not a fake PDF annotation; its list controls jump to or delete Neo's persisted marks, independently of native annotation and thumbnail surfaces.

## Annotation comment overlay

The operating-system keyboard focus remains in the PDF.js iframe in common reader states.
Programmatic focus on Zotero-native annotation editors is not a reliable text-input strategy and
interferes with Gecko/React focus handling.

`ReaderCommentEditor` owns pending and mounted input for one captured PDF view, the
annotation-comment target, textarea DOM, IME state, autosave/focus timers, popup guard,
theme subscription, and Zotero's private `_enableAnnotationDeletionFromComment` override.
It claims the view before asynchronous annotation lookup. `ReaderSession` retains
only Normal/Visual Surface state. `COMMENT` presents the view-owned editor;
`NATIVE` presents the separate Reader-wide `ReaderNativeInput` passthrough owner.
Other split views retain Surface grammar while comment input owns its captured view. `ReaderAnnotationNavigationState` owns the
remembered selection fallback and reads Zotero's exposed selection as authoritative.
The editor snapshots its save target so later annotation navigation cannot retarget a draft.

Neo renders the textarea in the PDF document, accepts native typing and IME composition,
and saves through the resolved annotation item with `saveTx()`. Enter inserts a newline;
ordinary Escape saves and closes; edits autosave after two seconds. Composing Escape,
`Process`, and keyCode 229 remain IME-owned. Disabling Normal comment entry retains
native `i` passthrough until Escape without creating a Reader Insert mode.

Phase 9.2 freezes this existing grammar, not the former Enter-save / Escape-cancel
proposal. There is no cancel action, alternate save policy, or configurable
autosave interval. Escape also saves edits made after an earlier autosave; it
does not restore the opening comment or undo an already committed save. This is
not a transaction/rollback or concurrent-edit merge interface.

Settings → Reader → **Annotation comment editing** exposes one boolean gate for
Normal-mode selected-annotation entry, stored as
`extensions.zotero-neo.annotationCommentEditor.enabled` (default `true`).
With it enabled, eligible Normal `i` / Enter opens the floating editor. With it
disabled, Enter does not open that editor and `i` gives `ReaderNativeInput` keyboard
ownership until Escape. This owner admits native keys/IME across that Reader's views
without running Neo commands, and releases on Reader deactivation/disposal. The
gate does not disable Zotero-native comment fields or remove saved comments.

Phase 5.7 migrates the effective `mode.insert.enabled` boolean to this feature key
only if the new key is absent; an existing canonical value wins. The old key is
cleared only after successful persistence. There is no runtime fallback to it.
Binding schema 17 deletes inactive `reader-insert:` / legacy `insert:` overrides,
including explicit null unbindings, without archiving or activating replacement
shortcuts. This deletion is owner-approved; unrelated bindings and unbindings are
preserved. Settings no longer exposes Reader Insert. Note Insert remains unchanged.
Select **Add note** is a separate annotation-creation operation and still opens
the new annotation's comment editor; this switch does not gate that creation path.

The view-owned Escape listener uses Gecko's privileged system event group because an
earlier normal-group host handler can swallow textarea Escape. `privilegedEventTarget()`
restores the native target's Xray wrapper so Gecko honors `mozSystemGroup`; options are
still cloned into the PDF realm. `nativeObjectIdentity()` compares the system event's
Xray target with the textarea's waived wrapper. The existing `_onKeyDown`/text-focus bridge
remains; no additional private `_handleKeyDown` patch is installed.

Generation, target, input, and draft guards contain stale opens, focus callbacks, and
autosave lookups. Exit captures the target/text and releases ownership, DOM, listeners,
timers, observer, theme, and deletion override synchronously before awaiting persistence.
Late save completion cannot change a newer input owner, Surface context, focus, or status;
an already-started native `saveTx()` is not cancellable. PDF-view release and Reader
disposal invalidate pending work and remove the editor's owned resources. The
`_textAnnotationFocused` patch reports the Neo textarea as focused so Zotero's earlier
Enter handler cannot open a competing annotation popup. Native editable focus saves,
closes, and hands off without fighting to reclaim focus.

## Source layout

```text
src/
  addon.ts                 controller composition and preference registration
  bootstrap.ts             global Gecko Bootstrap lifecycle entry
  input/                   canonical bindings, actions, and input matcher
  main/                    main-window controller and UI features
  toolkit/                 internal host-capability Toolkit (main/ and reader/)
  reader/                  reader lifecycle, input, annotations, marks, native sidebar
  preferences/index.ts     preference-pane behavior and localization
  platform/                narrow Gecko and optional-addon boundaries
  ui/theme.ts              shared appearance resolution and semantic palette
```

`src/input/` is the canonical source for executable bindings and bilingual
action labels. `key-guide-config.ts` contains only localized pending-prefix group
and display labels plus timing and sizing defaults; `key-guide.ts` projects currently valid
continuations from resolved bindings, so it never owns a second command map.
The preference pane imports this metadata directly. `tools/build.mjs` copies the
canonical project `LICENSE` and vendored MIT notice (`licenses/fuzzysort-LICENSE`)
into the XPI alongside generated JavaScript, markup, manifest and icons.
`tools/check-package.mjs` verifies all fourteen members and compares actual archive
license payloads byte-for-byte with their authoritative sources. Raw vendor modules,
TypeScript, tests and source maps remain excluded.

`src/toolkit/main/` owns the structural boundary for private Zotero window,
tree/tab/editor/filter and plugin APIs used by Main features. `src/main/picker/`
owns the candidate surface and finite sources; keep host casts/selectors in Toolkit,
not chooser control flow. Openings carry a generation token: close invalidates pending loads and queued
confirmation work, so stale host responses cannot repaint a later chooser. Domain operations
that need a selected candidate belong to the semantic invocation, not a provider-private key
grammar.

## Diagnostics

Use `Zotero.debug('[ZoteroNeo] ...')` for unexpected conditions. Each add-on startup truncates
`zotero-neo-startup.log` in the Zotero profile and writes the add-on/Zotero versions before
appending state-change diagnostics for Bootstrap, main-window attachment, Reader injection,
picker mount/load/close, tag-filter changes, and contextual failures. Idle reader discovery
must not append recurring rescan entries. Verify Reader injection with restored and newly opened
readers, and verify picker work against the mounted list/preview DOM rather than session fields alone.

`reportDiagnosticError()` reports native exception stacks and bounded `Error.cause` chains to
both Debug and the UTF-8 profile log. Unreadable error properties, cyclic causes, and failed
logging sinks must not produce a second exception. The sinks are independent; a failed profile
write is reported in Debug once per logger, and native streams are closed on failure.
If initialization or writing and stream closure both fail, that single Debug receipt retains
the primary failure/stack plus separately labelled close failure/stack. An uninitialized
converter is never closed; its raw output stream is closed instead.
Reader rescans attach the discovery/reconciliation/injection stage and cached session/pending
instance IDs without dereferencing failed DOM wrappers for diagnostics. Injection and disposal
failures retain the known Reader instance and original error as their cause; delayed injection
failures are reported before propagating. Main records the first failed scan in an episode and
one recovery, not every recurring failure or idle scan. These reports do not change retry,
inventory, cleanup, or input policy, and do not themselves fix an underlying lifecycle fault.


### Reader text selection and external actions

PDF text interaction is intentionally one workflow: Normal `v` opens `ReaderFlash` for a start
range unless a native selection already exists; successful targeting enters internal `visual` mode
(the UI calls it **SELECT**). Visual `s` reuses Flash for the far endpoint. Cursor mode no longer
exists. Flash owns only temporary query/index/label DOM; `ReaderSession` owns the persistent range
anchor and ordinary selection motions.

`ReaderSelectionActions` owns the keyboard action palette and result view. Its inputs are immutable
`ReaderSelectionContext` snapshots rather than DOM nodes. Built-ins remain Reader actions; Translate
for Zotero is discovered through its documented `Zotero.PDFTranslate.api.translate` API. A small public
extension seam is exposed as `Zotero.Neo.reader.getSelection()` and
`registerSelectionAction(...)`; integrations must use this contract instead of reaching into
`ReaderSession` or PDF.js private nodes.

The opening PDF window owns palette input, including Zotero's private key-forwarding claim;
an open palette must not suppress an unbound key in the other split pane. Check IME ownership
before consuming or cancelling a key. Async completion must match the invocation generation
and live owner window/root before rendering, status, or focus. Close retires ownership and
theme resources even when Gecko has already destroyed the content; do not hide live DOM failures.
