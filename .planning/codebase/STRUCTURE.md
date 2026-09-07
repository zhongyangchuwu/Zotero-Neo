# Repository Structure

**Mapped:** 2026-09-08

## Root

- `manifest.json` — installed add-on identity, Zotero compatibility range, icons, and update URL.
- `bootstrap.js` — Zotero Bootstrap API lifecycle; loads content scripts and manages main-window startup/shutdown.
- `build.sh` — Unix XPI packaging plus optional Node syntax and binding-sync checks.
- `updates.json` — add-on update feed; currently entirely upstream-branded.
- `README.md`, `README.zh-CN.md`, `README.es-ES.md` — user documentation and architecture notes.
- `AGENTS.md` — repository engineering and manual-test conventions.
- `FUTURE_FEATURES.md` — upstream feature backlog, including pending native reading history.
- `PENDING_ISSUES.md` — inherited unresolved and resolved runtime investigations.
- `INSERT_MODE_DESIGN.md` — annotation comment input/focus/IME design record.
- `Zotero Neo — Product Requirements Document.md` — Zotero Neo v0.1 product specification.

## Runtime content

- `content/zoteroVim.js` — shared plugin object, default bindings, preferences, reader lifecycle/state, key normalization, prefix engine, reader dispatcher, and reader-key forwarding patches.
- `content/zoteroVimReader.js` — reader-side outline, visual/cursor selection, annotations, marks, native sidebar bridges, and reader persistence helpers.
- `content/zoteroVimMain.js` — main-window capture, collection/item navigation, split focus, notes, item/tab pickers, open/close actions, and citekey integration.
- `content/preferences.xhtml` — Zotero preference pane markup and styles.
- `content/prefs.js` — preference pane behavior, mirrored default bindings, English action labels, and persistence.
- `content/i18n.js` — preference translations and Chinese action labels.

## Tooling and assets

- `tools/check-sync.js` — checks runtime/default binding parity, action-label coverage, modes, duplicate keys, and Chinese/English label parity.
- `tools/build.ps1` — Windows packaging equivalent of `build.sh`.
- `icons/` — active PNG icons and the `zotero-neo.svg` vector source.
- `zotero-neo.xpi` — generated, ignored build artifact; not source.

## Boundaries

- Runtime scripts share one global object; there is no module loader.
- Reader-specific state belongs in `_readerState` by reader instance.
- Main-window and note/picker state belongs in `_mainWindowState` by chrome window.
- Preference pane scripts execute separately and therefore mirror binding/label data.
- Build output contains only `manifest.json`, `bootstrap.js`, `content/`, and `icons/`.
