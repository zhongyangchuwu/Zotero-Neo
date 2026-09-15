# Development Guide

## Compatibility and verification

Official support covers the latest stable Zotero release at the time of a Zotero
Neo release. The manifest's install bounds are not a promise that every older
accepted version is tested. GitHub Actions proves packaging only; test a changed
reader, main-window, note, or preferences flow in the current Zotero host.

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

`src/main/picker/` owns one generic picker shell plus direct finite providers for items,
tabs, notes, tags, and commands. The shell owns lifecycle, rendering, focus, queueing, and
containment; providers own their scope-specific loading, previews, activation, and commands.
It has no generic fallback provider or module-global provider state.

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

`src/main/picker/` owns one search shell for library items, current-collection
items, tabs, notes, tags, and commands. Scope providers supply rows, preview content,
activation, and scope-only commands; they do not bypass the resolved `BindingMap`.
The internal fuzzy
ranker is a small allocation-conscious subsequence scorer with consecutive and
word-boundary bonuses. Do not import Zotero's private DevTools copy of
`fuzzaldrin-plus`: `resource://devtools/...` is not a stable add-on API, and adding an
npm fuzzy package would violate the zero-runtime-dependency XPI contract.
Picker result rows are keyboard-only by default; the shared shell reads the injected
`picker.mouse.enabled` preference at pointer-event time. When enabled, delegated click handling
selects ordinary item/collection/tab/note rows and delegated double-click handling confirms
through the existing provider activation queue; hover remains inert. Query focus and result or
preview scrolling remain pointer-enabled in both states. Tag rows and markers are hard-excluded
from pointer selection/toggling because Tag provider mutations are keyboard-only. Provider
`onKeyDown` still returns handled status before shell generic navigation and Enter handling, so
scope-specific commands retain precedence.

The shell owns unmodified ArrowUp/ArrowDown movement before provider callbacks when the
search or list pane is active, including Tag Query mode; it moves the highlight exactly once
like Ctrl+k/Ctrl+j without changing query focus or Tag mode. Providers must not duplicate this
movement. Tag Query keeps its deliberate Tab/Escape return-to-List transitions.

The command provider is a finite projection of the active resolved `BindingMap`: it
deduplicates bound `ActionId`s, displays key hints separately from key-independent
`ACTION_LABELS`, and hides the launcher itself. Its explicit context carries mode, language,
bindings, and an executor callback. The shell's `closeBeforeActivate` contract closes the
palette before invoking that callback, so an action can safely open another picker without a
second dispatcher, synthetic key event, or display-only command registry. Reader contexts
revalidate session/view ownership through their executor and never fall back to another window.

Bibliographic picker previews are deliberately bounded and synchronous: they retain the
existing title, creator, year, and citation-key metadata, then add attachment and child-note
counts plus up to six safely accessible filenames/titles. The picker does not render PDF pages;
Zotero exposes no stable add-on first-page thumbnail API, so progressive PDF preview remains
deferred rather than relying on private Reader/PDF.js internals.

Note rows search the normalized title and normalized HTML-stripped body from `getNote()` in the
same in-memory snapshot used for ordering. Current-item notes remain first. No persisted index or
runtime search dependency is required; Zotero's native Search query remains the library-scope
loader and local matching covers body content consistently.

The Tag provider reads the active collection row's `tags` set and `getTags()` scope,
then applies its own `Set<string>` through `itemsView.setFilter('tags', ...)`, matching
Zotero's native AND semantics. It mirrors selection to a live native tag selector only
after a successful native filter refresh, so failed updates resynchronize from the row
state and leave the picker open. Selected tags are pinned by tag identity above a stable picker snapshot; scope toggle is the only source reload. Tag input has explicit List and Query modes stored independently from physical DOM focus: focus events never change tag mode, while List `/`/`Tab` and explicit input clicks enter Query. Query preserves literal text input, and hover never moves the keyboard highlight. Picker-owned commands prevent default, stop propagation, and stop immediate propagation so host Tab traversal cannot run after Neo handles it. `x` and `C` alter only the filter, never tag data or item-tag links.

The Notes provider resolves reader context through the active Zotero tab and reader
attachment before consulting the main-window selection. Its primary note query uses
`Zotero.Search.addCondition()` after `schemaUpdatePromise`; a failed search falls back
to `Zotero.Items.getAll()` for that library, and malformed individual notes are skipped
rather than failing the picker. Note and main-item deletion use
`Zotero.Items.trashTx()` so Zotero stages native undo data; Neo tracks only the last ID
batch as a targeted restore fallback and never permanently erases these items.

## PDF text vertical motion

Cursor/Visual `j` and `k` must not delegate to Gecko
`Selection.modify(..., 'line')`. PDF.js text layers are absolutely positioned
spans, so browser line granularity can jump across unrelated DOM positions. Neo
groups contiguous `.textLayer span` nodes into visual lines using client-rect
overlap while preserving PDF.js DOM reading order. A vertical step moves exactly
one such line and chooses the caret offset nearest the remembered horizontal X
coordinate. Non-vertical Cursor/Visual motions clear that preferred X. This keeps
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
action labels. `key-guide-config.ts` contains only localized Space-leader group
and display labels plus timing and sizing defaults; `key-guide.ts` projects currently valid
continuations from resolved bindings, so it never owns a second command map.
The preference pane imports this metadata directly. `tools/build.mjs` creates
deterministic ZIP bytes with the twelve packaged members verified by
`tools/check-package.mjs`.

`src/main/host.ts` owns the narrow structural boundary for private Zotero window, Reader,
tag, and item APIs used by main-window features. `src/main/picker/` owns the picker shell
and direct scope providers; keep host casts in `main/host.ts` rather than picker UI/control-
flow code. Picker openings carry a generation token: close invalidates pending loads and
queued actions, so stale host responses cannot repaint a later picker. Actions that require
a selected item run through one per-session queue; activation completes before a dependent
command, such as `Ctrl+o`, reads Zotero's selected item.

## Diagnostics

Use `Zotero.debug('[ZoteroNeo] ...')` for unexpected conditions. Each add-on startup truncates
`zotero-neo-startup.log` in the Zotero profile and writes the add-on/Zotero versions before
appending state-change diagnostics for Bootstrap, main-window attachment, Reader injection,
picker mount/load/close, tag-filter changes, and contextual failures. Idle reader discovery
must not append recurring rescan entries. Verify Reader injection with restored and newly opened
readers, and verify picker work against the mounted list/preview DOM rather than session fields alone.
