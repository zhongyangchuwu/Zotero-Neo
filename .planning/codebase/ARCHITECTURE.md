# Architecture

**Mapped:** 2026-09-08

## Lifecycle and composition

`bootstrap.js` loads `content/zoteroVim.js`, then extends the same controller with `content/zoteroVimReader.js` and `content/zoteroVimMain.js`. The base declares `var ZoteroNeo = { ... }`; the other files use `Object.assign(ZoteroNeo, { ... })`.

Startup is two-phase: listeners/window injection are attempted before `Zotero.initializationPromise`, then repeated after initialization. This protects restored reader tabs whose render events occur early. Shutdown unregisters reader listeners, invokes per-reader cleanup, removes main-window injection, and clears state collections.

## State ownership

- `_readerState: Map<instanceID, state>` owns mode, count/key buffers, overlays, active PDF pane, listener maps, marks, and cleanup.
- `_readerStateByItemID` is a fallback for reader selection events, not a general current-item resolver.
- `_mainWindowState: Map<window, state>` owns main buffers, active panel, item/tab picker, notes layout, note-editor mode, status UI, and cleanup.
- Reader actions that need main-window behavior delegate through `_delegateToMainWindow` and `_executeMainAction`.

## Reader topology

The PDF reader spans three compartments:

```text
Zotero chrome window
  -> reader.html (`reader._iframeWindow`)
    -> PDF.js view (`reader._internalReader._primaryView._iframeWindow`)
```

The plugin attaches capture listeners to reader.html and every live primary/secondary PDF view. A 250 ms synchronization loop handles split/recreated views. Objects or arrays passed into reader content must use `Components.utils.cloneInto`.

## Input dispatch

Reader flow:

```text
keydown -> editable/overlay/mode guards -> `_keyString`
        -> count/prefix matching -> `_processBuffer`
        -> `_executeAction`
```

Main flow:

```text
chrome capture -> picker/notes/note guards -> editable guard
               -> reader forwarding or main prefix matching
               -> `_executeMainAction`
```

`_patchReaderKeyForwarding` wraps Zotero's private PdfView `_onKeyDown` because Zotero invokes its keyboard manager by direct function call; ordinary DOM propagation control is insufficient. `_readerConsumesKey` derives consumed exact keys and prefixes from the active binding map.

## Existing reusable seams

- `DEFAULT_BINDINGS` plus `getBindings()` — configurable mode/sequence-to-action mapping.
- `_executeAction` / `_executeMainAction` — canonical action dispatch boundaries.
- `_openFuzzyPicker` — reusable interaction pattern for focused keyboard overlays; tag UX should copy the pattern, not prematurely generalize the implementation.
- `_mainCycleTab`, `_toggleReaderSplit`, `_focusReaderSplit`, `_mainOpenPDF` — native bridges M2 should reuse.
- `_marksStoreItem` — reader attachment-to-parent resolution precedent for M4.
- `_showStatus` / `_mainShowStatus` — visible non-fatal failure reporting.

## Missing architectural pieces

- No native history actions.
- No isolated Spotlight adapter.
- No shared current-bibliographic-item resolver or tag mutation boundary.
- No which-key metadata/overlay.
- No general main-window pane-direction resolver beyond existing collection/item and reader-split focus helpers.

## Planning rule

Extend the current dispatcher and state ownership. Do not replace modal input, introduce a framework, or centralize mature picker implementations before three proven use cases justify it.
