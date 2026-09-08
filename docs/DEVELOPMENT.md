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

Both builders produce `zotero-neo.xpi`, syntax-check JavaScript when Node is
available, and run `tools/check-sync.js` to compare default bindings and action
labels.

GitHub Actions runs the Linux and Windows builders on pushes and pull requests,
then uploads separate XPI artifacts. A version tag runs a guarded release job:
`tools/check-release.js` requires the tag, manifest version, compatibility
range, and prepared `updates.json` entry to agree before the Linux-built XPI is
published. Do not create a release tag until its update-feed entry exists.

## Runtime architecture

Zotero Neo is plain JavaScript for Gecko Bootstrap. `bootstrap.js` loads the
base controller, then reader and main-window extensions into one `ZoteroNeo`
object before startup. Script order is a contract: the base controller must load
before extensions that call `Object.assign(ZoteroNeo, ...)`.

The reader has three relevant document layers:

```text
Zotero chrome window
  └─ reader.html          (reader._iframeWindow)
       └─ PDF.js iframe   (reader._internalReader._primaryView._iframeWindow)
```

Reader state is per instance ID in `_readerState`; do not put reader-specific
state at module scope. Objects crossing the chrome/content boundary must use
`Components.utils.cloneInto(value, targetWindow)`.

## Reader keyboard forwarding

Zotero forwards PDF keys through `PdfView._onKeyDown`, outside normal DOM event
propagation. `preventDefault()` alone cannot prevent reader shortcuts such as
Read Aloud or tool switching. The plugin wraps that forwarding callback and
uses `_readerConsumesKey()` to suppress only keys handled by Neo. Preserve the
pair whenever key handling or reader injection changes.

The patch is reapplied as reader views are recreated. Restored reader tabs need
the periodic discovery sweep because they can miss early toolbar events.

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

The runtime currently uses explicit script paths and no module system. Source
path migrations must update bootstrap, preference registration, both builders,
syntax checks, `tools/check-sync.js`, and documentation atomically. Keep
runtime script order explicit; do not auto-discover scripts.

Default bindings currently exist in both runtime and preferences tables. The
binding-sync tool protects parity. Consolidating them belongs to the approved
keymap phase, where a canonical keymap can also serve Which-Key.

## Diagnostics

Use `Zotero.debug('[ZoteroNeo] ...')` for unexpected conditions. Startup and
first-injection diagnostics are also written to `zotero-neo-startup.log` in the
Zotero profile. Logs are state-change based: idle reader discovery must not
append recurring rescan entries. Verify any change to reader injection with
restored and newly opened readers.
