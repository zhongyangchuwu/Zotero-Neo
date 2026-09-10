# Development Guide

## Compatibility and verification

Official support covers the latest stable Zotero release at the time of a Zotero
Neo release. The manifest's install bounds are not a promise that every older
accepted version is tested. GitHub Actions proves packaging only; test a changed
reader, main-window, note, or preferences flow in the current Zotero host.

## Build

```bash
./build.sh
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

## Reader keyboard forwarding

Zotero forwards PDF keys through `PdfView._onKeyDown`, outside normal DOM event
propagation. `preventDefault()` alone cannot prevent reader shortcuts such as
Read Aloud or tool switching. The plugin wraps that forwarding callback and
uses `_readerConsumesKey()` to suppress only keys handled by Neo. Preserve the
pair whenever key handling or reader injection changes.

The patch is reapplied as reader views are recreated. Restored reader tabs need
the periodic discovery sweep because they can miss early toolbar events.

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
string. Do not synthesize clicks or introduce Neo-owned link/history state. Missing or
changed members must fail closed with status and write the specific reason to both Zotero
debug output and the startup diagnostic log rather than leaving badges or input capture active.

## Annotation comment overlay

The operating-system keyboard focus remains in the PDF.js iframe in common
reader states. Programmatic focus on Zotero-native annotation editors is not a
reliable text-input strategy and interferes with Gecko/React focus handling.

Neo therefore renders its comment textarea in the PDF document. It accepts
native typing and IME composition, saves via the resolved annotation item using
`saveTx()`, and uses a session token to prevent stale async focus work. The
`_textAnnotationFocused` patch prevents Zotero's earlier Enter handler from
opening a competing annotation popup while that textarea is active. Native
editor focus hands off by saving and closing the Neo overlay; it must never
fight to reclaim focus.

## Source layout

```text
src/
  addon.ts                 controller composition and preference registration
  bootstrap.ts             global Gecko Bootstrap lifecycle entry
  input/                   canonical bindings, actions, and input matcher
  main/                    main-window controller and UI features
  reader/                  reader lifecycle, input, annotations, marks, outline
  preferences/index.ts     preference-pane behavior and localization
  platform/                narrow Gecko and optional-addon boundaries
  ui/theme.ts              shared appearance resolution and semantic palette
```

`src/input/` is the canonical source for bindings and bilingual action labels.
The preference pane imports that metadata directly; do not recreate a second
binding table. `tools/build.mjs` creates deterministic ZIP bytes with the eight
packaged members verified by `tools/check-package.mjs`.

## Diagnostics

Use `Zotero.debug('[ZoteroNeo] ...')` for unexpected conditions. Startup and
first-injection diagnostics are also written to `zotero-neo-startup.log` in the
Zotero profile. Logs are state-change based: idle reader discovery must not
append recurring rescan entries. Verify any change to reader injection with
restored and newly opened readers.
