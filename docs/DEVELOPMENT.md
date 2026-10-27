# Development Guide

## Compatibility and verification

The checked-in `manifest.json` supports Zotero `10.0.*` (`strict_min_version: 10.0`, `strict_max_version: 10.0.*`). When changing a host seam, run repository verification and exercise the affected workflow in Zotero.

Node.js 24 and npm are required. Use one repository-root checkout for both the plugin and VitePress site; the root `package.json` defines both command sets. Install the locked dependencies once from that root before running either set:

```bash
npm ci
```

If npm 12 rejects the locked Git dependency with `EALLOWGIT`, run `npm ci --allow-git=all --ignore-scripts` from the same root instead. This applies to the shared root install and does not change global npm policy.

Both XPI builders call `npm run verify`, which runs Prettier checks, strict TypeScript checks, Vitest, the package build, and the XPI member check.

## Build

Run either build entry point from the repository root:

```bash
./tools/build.sh
```

On Windows, use:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

### Documentation site

The repository root also contains the VitePress site. Its config is `.vitepress/config.ts`; Markdown sources include root pages and `docs/*.md`, and VitePress writes the static site to `.vitepress/dist/`.

Run these scripts from the repository root after the shared dependency install above:

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

Use `docs:dev` while editing. `docs:preview` serves the most recent static build; restart it after rebuilding so cached file metadata does not serve old HTML or asset names. Check the build under the GitHub Pages base path `/Zotero-Neo/`.

GitHub Pages uses `/Zotero-Neo/`; a repository administrator must enable Pages with GitHub Actions as its build source. Pull requests build/check the site but do not publish, and deployment is guarded to `main`. The generated site output is separate from the XPI package and plugin runtime. See [Documentation authoring](DOCUMENTATION_AUTHORING.md) for page and media conventions.

### Local GUI iteration from WSL

Use a dedicated Zotero development profile and keep its Zotero data directory separate from personal library data. The development tool selects a profile; it does not configure an isolated data directory.

Configure an existing development profile once while Zotero is closed:

```bash
npm run dev:setup -- --profile /mnt/c/Users/YOU/AppData/Roaming/Zotero/Zotero/Profiles/DEV.default
```

Setup enables local remote debugging, records the profile and Zotero executable in the ignored `.zotero-neo-dev.json`, and mirrors `build/addon/` into `zotero-neo-rdp` inside that profile. Close any running Zotero instance using this profile once after setup.

Start the development instance:

```bash
npm run dev:start
```

This launches the configured profile and installs Neo from the unpacked mirror as a temporary add-on. Keep a packaged Neo XPI with the same add-on ID out of this profile; both installations can leave competing Main/Reader handlers and an older Command Palette.

For the edit/build/reload loop, leave that Zotero instance running:

```bash
npm run dev
npm run dev:status
```

`dev` rebuilds and reloads the temporary add-on. `dev:status` reports the profile, RDP connection, mirror, and startup-log location. Preferences under `extensions.zotero-neo.*` and Zotero item changes such as tags or persisted marks are not cleared by uninstalling Neo; reinstalling is not a clean-preference test.

## Branding assets

`assets/branding/` contains repository artwork; `assets/package/` supplies the static XPI skeleton, runtime icons, and preference-pane markup. The preference pane is defined in `assets/package/content/preferences/pane.xhtml` and behavior is generated from `src/preferences/index.ts`. Branding originals are not copied into the XPI; package paths remain `icons/*` and `content/preferences/*`.

## Runtime architecture

The interaction model and feature ownership are described in [ARCHITECTURE.md](ARCHITECTURE.md). Neo is authored in strict TypeScript and bundled for Gecko Bootstrap. The internal Toolkit adds no runtime dependency.

`src/toolkit/main/private-types.ts` and `src/toolkit/reader/private-types.ts` keep structural host types inside the Toolkit. `src/toolkit/index.ts` re-exports `src/toolkit/main/index.ts` and `src/toolkit/reader/index.ts`; Main exposes context-pane Note capabilities, so there is no separate Note Toolkit entry. Feature code uses these capability entries rather than native structural types or implementation modules. Required private host abilities stay behind these contracts when no equivalent public API preserves the behavior.

Zotero remains authoritative for Items, views, tabs, Notes, and Reader state. Feature owners choose targets, cardinality, confirmation, and feedback; Toolkit owns host lookup, native protocols, DOM seams, cross-compartment payloads, and resource retirement. Use documented APIs when they preserve the same behavior, but do not replace a required private host ability with a facade that only hides its dependency. Public item APIs and `src/platform/zotero-items.ts` remain directly usable rather than gaining one-to-one wrappers.

### Host capability Toolkit

| Capability | Toolkit owner | Boundary and reason |
| --- | --- | --- |
| Main item, tab, Note-context, and view-filter APIs | `src/toolkit/main/host.ts` | Projects host data and operations without choosing Surface targets. `getSelectedCollection()` is used only for exactly one native Scope selection; zero or multiple rows use the outer plural API and then the legacy tree plural API. The detached Scope Cursor is not substituted for the selected collection. |
| Main tree focus, ScopeSet, and item-row cursor | `src/toolkit/main/tree.ts`, `src/toolkit/main/host.ts` | Preserves native Scope selection and focus-only item-row operations; generation tokens fence callbacks from replaced or unsettled row views. |
| Main collection identities, item search, and scope selection | `src/toolkit/main/collections.ts` | Projects stable collection IDs, paths, and library writability; bounds native item-search IDs before loading candidates; and waits for Zotero's `onCollectionSelected()` plus the Main item-view load, checking selected and rendered scope IDs before reporting completion. |
| Main collection transaction callback barrier | `src/toolkit/main/collection-transactions.ts` | Captures callback registrations only inside the entered transaction body and dispatches owned callbacks once with their actual owner ID. A scoped observer binds native 10.0.6's post-SQL `_commitCount` increment to that transaction before shared callbacks run, distinguishing SQL rollback from post-commit callback failure. It restores only its own temporary registrar and counter descriptor, leaves foreign replacements intact, and never clears shared queues or installs a host-lifetime patch. |
| Main rendered-item decoration | `src/toolkit/main/rendered-items.ts` | Owns row markers and observers; failed installation retires callbacks and releases resources while retaining the original error. |
| Installed-plugin inventory and host preferences | `src/toolkit/main/plugins.ts` | Projects Mozilla AddonManager and Zotero preference-registry data as metadata/capabilities; plugin policy stays with Plugin Manager. |
| Reader registration, inventory, and host identity | `src/toolkit/reader/host.ts` | Reader identity is the native handle; only an authoritative native inventory permits retiring absent Reader sessions. |
| Reader keyboard forwarding | `src/toolkit/reader/input-bridge.ts` | Wraps Zotero's private `PdfView._onKeyDown` and `_textAnnotationFocused` seams. Zotero forwards PDF keys outside ordinary DOM propagation, so `preventDefault()` alone cannot stop the native handler; Reader supplies exact-view input policy. |
| PDF view listeners and discovery | `src/toolkit/reader/view-lifecycle.ts` | Owns primary/secondary view attachment and release. Exact registration checks fence queued events after detach, including reuse of the same Window. |
| Reader native navigation, search, zoom, split, and focus | `src/toolkit/reader/navigation.ts` | Uses the active native view and clones request payloads into its realm; semantic action and traversal policy stay in Reader. |
| Jump capture, reopen, and native completion bridge | `src/toolkit/reader/jump-host.ts`, `src/toolkit/reader/history-bridge.ts` | Keeps captured view/history identity and producer completion at the host boundary; shared history policy stays in `src/navigation/`. |
| PDF text and selection geometry | `src/toolkit/reader/pdf-text.ts`, `src/toolkit/reader/selection-geometry.ts` | Reads PDF text-layer and viewport geometry; incomplete geometry fails closed rather than creating a partial annotation. |
| Visible identifier text and geometry | `src/toolkit/reader/identifier-text.ts` | Reads visible PDF.js text into source-preserving same-line runs and maps text ranges to viewport rectangles; it does not guess cross-line joins or use OCR. |
| PDF link overlays and native delegation | `src/toolkit/reader/links.ts` | Reads Zotero's overlay map and delegates activation to the captured native view. |
| Native Reader sidebar | `src/toolkit/reader/sidebar.ts` | Adds reversible presentation/listener mechanics around Zotero-owned panes and rows; binding and target policy stay in `src/reader/native-sidebar.ts`. |
| Annotation selection, filtering, and popup seams | `src/toolkit/reader/annotations.ts` | Adapts private Reader operations; item mutation remains with public Zotero item APIs. |
| Visible annotation target models and geometry | `src/toolkit/reader/annotation-targets.ts` | Admits native annotations from the current filtered Reader view and supported anchor geometry clipped to the visible viewport; hidden, filtered, off-screen, and unsupported targets are omitted. |
| Reader mark geometry and legacy storage access | `src/toolkit/reader/marks.ts` | Exposes host storage/geometry; `ReaderMarks` chooses parent-versus-attachment storage policy. |
| Zotero structured-document blocks | `src/toolkit/reader/structured-document.ts` | Native cold processing can cover the whole PDF and cannot be cancelled; requests remain explicit and semantic classification stays with `ReaderCaptionTargets`. |

Collection workflow decisions stay in Main: `src/main/collection-actions.ts` resolves Main `EffectiveSelection` or the existing Reader contextual target, fixes the source/library/item identities, and owns confirmation and workflow permissions. `src/operations/collections.ts` and `src/operations/item-collections.ts` receive explicit item objects and collection IDs; they revalidate identity, library, and editability before mutation. Collection Picker providers project same-library candidates and direct-membership coverage only; they do not choose operation targets or mutate data.

Neo collection mutations share a Toolkit admission barrier through owned callback completion and Operations-provided rollback recovery. Reload policy stays in Operations; a later Neo collection mutation cannot start while an earlier operation reloads cached memberships or collection state. On committed SQL, Operations does not run rollback recovery. If a foreign native callback fails but owned commit callbacks complete, the operation returns its actual saved receipt and reports the original error through the shared diagnostic logger. An owned commit-callback failure remains an observable rejection rather than claiming that cache updates completed; it still cannot unload committed objects or replay owned callbacks in a later transaction.

The collection-item provider requests at most 100 top-level item results per query through the Toolkit's native title/creator/year search. The Toolkit loads those bounded candidates' creators, item data, and memberships for row projection. Only after Enter does it fully hydrate the confirmed item with `loadAllData()`, which native Main rendering needs for child-item data. This path does not enumerate `Items.getAll()`.

Reader target discovery and interaction use the owners below; the Toolkit capabilities above provide host data and geometry.

| Owner | Responsibility |
| --- | --- |
| `src/identifiers/` | Pure DOI, arXiv, and HTTP(S) recognition with original source offsets. |
| `src/reader/identifier-targets.ts` | Merge recognized text with native links and keep copy values separate from follow destinations. |
| `src/reader/copy-targets.ts` | Add independent Excerpt/Comment roles, group them per annotation, and omit empty roles without deduplicating them against identifiers. |
| `src/reader/copy-hints.ts`, `src/reader/link-hints.ts` | Admit copy/follow actions in the exact live view; link following retains native destination and history semantics. |
| `src/reader/target-hints.ts` | Own temporary prompts, letter input, group layout, collision avoidance, and cleanup. |

Zotero 10.0.6's identifier utilities provide the DOI/arXiv matching and cleaning baseline, not Reader's scanning policy. Reader adds HTTP(S), preserves each visible occurrence and arXiv `vN` versions, and scans only visible same-line runs in the active PDF view; it does not guess ambiguous cross-line joins or use OCR. Annotation targets follow Zotero's visibility and filter state and require supported current-view geometry. A DOI inside an excerpt remains a separate copy intent. Following a bare DOI or arXiv ID builds its resolver URL; a literal HTTP(S) URL keeps its original path, query, fragment, and letter case even when recognized as an identifier.

Annotation geometry is converted by the native Reader one rectangle and page at a time, with payloads cloned into its owner realm. A union spanning off-screen fragments is not sufficient evidence of a visible anchor. Native model identity and field/filter/view snapshots are revalidated before confirmation. If the bounded label layout cannot find nonoverlapping slots, the interaction is retired rather than exposing obscured, selectable targets.

Binding schema 19 rewrites persisted `copyIdentifier` and `followIdentifier` ActionIds to `copyTarget` and `followLink` before canonical parsing. It preserves custom key positions and explicit-null overrides, including an explicit `reader-normal:y` binding to `yankAnnotation`; retired IDs are not runtime aliases.

Objects passed between Bootstrap chrome and Zotero content compartments must be cloned into the receiving window. `src/platform/cross-compartment.ts` centralizes `Components.utils.cloneInto` and wrapper-identity/dead-wrapper helpers; PDF view handles retain native identity rather than allocating a wrapper per event.

For asynchronous host work, keep the captured Reader/session/view identity and generation current before applying results. Teardown retires callbacks before listener removal, restores a patched method only while its wrapper is still owned, and guards already-destroyed Gecko wrappers. Failures on live host objects remain observable.

Tag filtering follows rows in the current rendered Scope, including native multi-row selection; it does not broaden candidates to entire libraries. Collection action targets and confirmation are described in the [Library Interaction Model](INTERACTION_MODEL.md#action-target-contracts).

## Diagnostics

Bootstrap writes `zotero-neo-startup.log` in the Zotero profile and reports runtime diagnostics through `Zotero.debug()`. `npm run dev:status` prints the configured log path.

## Reader selection API

`Zotero.Neo.reader.getSelection()` returns the current `ReaderSelectionContext` or `null`. `Zotero.Neo.reader.registerSelectionAction(action)` registers an extension action and returns a disposer. `src/addon.ts` exposes the API and `src/core/contracts.ts` types it; integrations should use it instead of reaching into Reader session or PDF.js internals.
