# Development Guide

## Compatibility and verification

Official support covers the latest stable Zotero release at the time of a Zotero
Neo release. The manifest enforces that supported major instead of advertising
untested older Zotero majors. The current pre-release target is Zotero 10.
GitHub Actions proves packaging only; test a changed reader, main-window, note,
or preferences flow in the current stable Zotero host.

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

The old extension-proxy path is intentionally not used for fast iteration:
runtime acceptance on Zotero 10.0.3 did not discover a first-time proxy in a
fresh profile, while RDP temporary installation and `reload` both succeeded.

GitHub Actions runs the Linux and Windows builders on pushes and pull requests,
then uploads separate XPI artifacts. A version tag runs a guarded release job:
`tools/check-release.mjs` requires the tag, manifest version, compatibility
range, and prepared `updates.json` entry to agree before the Linux-built XPI is
published. Do not create a release tag until its update-feed entry exists.

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
resolution, and side-effect-free consumption prediction. Main and Reader sessions retain
event gates, timers, guides, focus decisions, and action execution.

`src/main/host.ts` is the narrow boundary for private main-window APIs: tabs, panes,
selected items, reader-tab context, and tag filtering. Main-window control flow should use
these named adapters rather than spreading structural casts through feature code.

`src/main/focus-ownership.ts` claims Zotero's initial Library Quick Search focus
only for `APP_STARTUP`. An empty search already focused when Neo attaches is
claimed on the next event-loop turn so direct user input can cancel. Otherwise
the one-shot gate waits for native Quick Search focus without an idle deadline;
direct input, another focus target, a tab change observed through focus, or
session cleanup ends it. `ADDON_INSTALL` also occurs on RDP hot reload, so
installation, reload, enable, upgrade, nonempty search, and unrelated editors
retain their focus. Zotero still owns Reader-to-Library tab focus restoration.

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
filter state; those effects belong to `TagActions`.

Reader outline and marks retain separate domain behavior. `src/reader/sidebar-overlay.ts`
coordinates only their view-local lifecycle: mutual exclusion, theme-root cleanup, PDF-view
replacement cleanup, and delayed focus restoration. Outline owns loading, tree navigation,
expansion, hints, and destination navigation; Marks owns persistence, jumping, and deletion.

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

Directional focus reuses the executable binding dispatcher. Reader split movement
calls `InternalReader.focusView(primary)` based on `splitType`; every Reader command
then resolves the same active view from the event source and Zotero's
`_lastViewPrimary` state before consulting Gecko focus. This keeps page turns,
scrolling, history, and link actions on the split most recently focused by mouse or
keyboard. Right-edge movement uses Zotero's context-pane focus callback. Main-window
movement ranks visible pane rectangles in the requested half-plane, prefers candidates
aligned on the movement axis, and never wraps. A directional key is prevented only
after a target is found.

`src/main/picker/` is a shared candidate resolver, not a domain-operation layer.
For ordinary item, current-collection, tab, and note choices, providers supply rows and preview
metadata only. The opening semantic action supplies `PickerOpenOptions.confirm`; Enter or an enabled
double-click resolves the highlighted candidate through that callback, and successful confirmation
closes the surface. A semantic action may intentionally request close-before-confirm, as Command
Palette does when the chosen action can open another chooser.

Shared Picker and TagPath fuzzy ranking goes through Neo's `fuzzyMatchScore()` adapter, backed by
the pinned, audited `fuzzysort` vendor snapshot. esbuild folds that ESM into the runtime IIFE; no
npm/CDN/native dependency is resolved at runtime. Keep consumers behind the adapter instead of
importing the vendor module throughout feature code.

The shell owns generic navigation: unmodified ArrowUp/ArrowDown when search/list owns interaction,
Ctrl+j/k (and Ctrl+n/p aliases), list-local j/k, `/` to return to search, Ctrl+d/u preview
scrolling, Enter confirmation, Escape cancellation, pointer selection when enabled, IME ownership,
and generation-based stale-work rejection. Ordinary sources must not duplicate this navigation or
claim domain mutation keys.

The command source is a finite projection of the active resolved `BindingMap`: it deduplicates
supported `ActionId` values, displays key hints separately from key-independent
`ACTION_LABELS`, and hides the launcher itself. The Main/Reader/Note owner provides the executor
through the invocation confirmation callback, so command execution remains in semantic dispatch
rather than provider activation. Reader contexts still revalidate session/view ownership before
execution.

Bibliographic candidate previews are deliberately bounded and synchronous: they retain title,
creator, year, and citation-key metadata, then add attachment and child-note counts plus up to six
safely accessible filenames/titles. The chooser does not render PDF pages; Zotero exposes no stable
add-on first-page thumbnail API, so progressive PDF preview remains deferred rather than relying on
private Reader/PDF.js internals.

Note candidates search normalized title and normalized HTML-stripped body from `getNote()` in the
same in-memory snapshot used for ordering. Current-item notes remain first. Zotero's native Search
query remains the library-scope loader and local matching covers body content consistently. Note
create/trash/restore operations are deliberately outside the chooser contract.

Tag candidate sources follow the same chooser contract as ordinary object sources. They may
project virtual namespaces, explicit create candidates, and action-specific metadata, but they do
not mutate item tags or Main filter state. `TagActions` owns tag candidate resolution and
persistent `ta/tr` item mutation. `MainViewActions` owns Main View mutation for Quick Search,
Advanced Search, and the tag-filter application behind `tf/tc`. These remain distinct from
persistent data mutation even when they reuse tag candidate-search primitives.

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
call `navigate({ position })` so Zotero records native history. Because the call crosses
from Bootstrap chrome into the reader content realm, clone the complete location payload
into `reader._iframeWindow` first. External targets call `_onOpenLink(url)` with a primitive
string. `ReaderLinkHints` owns hint badges, key-buffer filtering, viewport RAFs, and the
temporary destination cue; `ReaderSession` only orchestrates host/view boundaries. Do not
synthesize clicks or introduce Neo-owned link/history state. Missing or changed members
must fail closed with status and write the specific reason to both Zotero
debug output and the startup diagnostic log rather than leaving badges or input capture active.

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

## Reader sidebar ownership

`ReaderMarksExplorer` and `ReaderOutline` own their transient open/selection/DOM/theme state.
Every close path notifies `ReaderSidebarOverlay` so the shared coordinator never retains a stale
active kind. `ReaderOutline` also owns its cached tree, hint/command timers, and load-generation
token; closing or replacing a PDF view invalidates pending `getOutline()` work before it can
repaint a later overlay. `ReaderSessionState` must not mirror either sidebar's transient state.

## Annotation comment overlay

The operating-system keyboard focus remains in the PDF.js iframe in common reader states.
Programmatic focus on Zotero-native annotation editors is not a reliable text-input strategy and
interferes with Gecko/React focus handling.

`ReaderCommentEditor` owns the transient annotation-comment target, textarea DOM, IME state,
autosave/focus timers, popup guard, theme subscription, and Zotero's private
`_enableAnnotationDeletionFromComment` override. `ReaderSession` owns only Insert mode and the
persistent selected-annotation key. The feature resolves and snapshots its save target before
mounting so later annotation navigation cannot retarget an in-progress edit.

Neo renders the textarea in the PDF document, accepts native typing and IME composition, and saves
through the resolved annotation item with `saveTx()`. A generation token prevents stale async open
or focus work. PDF-view release and Reader disposal invalidate that work, stop the watchdog, remove
the overlay, disconnect the popup observer, and restore the host deletion flag. The
`_textAnnotationFocused` patch reports the Neo textarea as focused so Zotero's earlier Enter
handler cannot open a competing annotation popup. Native editor focus hands off by restoring host
behavior, saving, and closing the Neo overlay; it must never fight to reclaim focus.

## Source layout

```text
src/
  addon.ts                 controller composition and preference registration
  bootstrap.ts             global Gecko Bootstrap lifecycle entry
  input/                   canonical bindings, actions, and input matcher
  main/                    main-window controller and UI features
  main/host.ts              narrow private-Zotero main-window boundary
  reader/                  reader lifecycle, input, annotations, marks, outline
  preferences/index.ts     preference-pane behavior and localization
  platform/                narrow Gecko and optional-addon boundaries
  ui/theme.ts              shared appearance resolution and semantic palette
```

`src/input/` is the canonical source for executable bindings and bilingual
action labels. `key-guide-config.ts` contains only localized pending-prefix group
and display labels plus timing and sizing defaults; `key-guide.ts` projects currently valid
continuations from resolved bindings, so it never owns a second command map.
The preference pane imports this metadata directly. `tools/build.mjs` creates
deterministic ZIP bytes with the twelve packaged members verified by
`tools/check-package.mjs`.

`src/main/host.ts` owns the narrow structural boundary for private Zotero window, Reader,
tag, and item APIs used by main-window features. `src/main/picker/` owns the candidate
surface and finite sources; keep host casts in `main/host.ts` rather than picker UI/control-
flow code. Openings carry a generation token: close invalidates pending loads and queued
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
