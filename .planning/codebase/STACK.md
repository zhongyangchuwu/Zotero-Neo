# Technology Stack

**Mapped:** 2026-09-08

## Runtime

- Plain JavaScript executed inside Zotero's Firefox/Gecko chrome environment.
- Zotero Bootstrap API lifecycle through `bootstrap.js`.
- No ES modules, CommonJS, bundler, transpiler, TypeScript, or application framework.
- Shared scripts loaded with `Services.scriptloader.loadSubScript`.
- Zotero global APIs: `Zotero`, `Zotero.Reader`, `ZoteroPane`, `Zotero_Tabs`, `Zotero.Items`, `Zotero.PreferencePanes`.
- Gecko/XPCOM globals: `Components`, `Services`, clipboard helper, preferences service, file streams.
- Reader UI includes Zotero's React reader and PDF.js internally, but this repository does not build or own those frameworks.

## UI surfaces

- Zotero chrome/XUL main window.
- HTML elements created with the HTML namespace inside XUL documents.
- `reader.html` outer reader document.
- PDF.js iframe documents for primary and secondary reader views.
- Note editor iframe/contenteditable surfaces.
- Preference pane in `content/preferences.xhtml` with scripts `content/i18n.js` and `content/prefs.js`.

## Persistence and data

- Firefox preferences for configuration and local fallback state.
- Zotero Item API for annotations and persisted marks; transactions use `saveTx()`/`eraseTx()`.
- Parent-item Extra field stores optional persisted reader marks.
- No direct SQLite writes and no external database.

## Optional integrations

- Better BibTeX is feature-detected at call time for citekeys.
- Spotlight integration is absent and planned as optional.
- No runtime dependencies, CDN assets, or vendored third-party plugin code.

## Build

- `build.sh` requires `zip`; when Node exists it runs `node --check` and `node tools/check-sync.js`.
- `tools/build.ps1` uses .NET `System.IO.Compression` to produce Gecko-compatible POSIX archive paths.
- Current artifact is `zotero-neo.xpi`; the Unix build is verified and the Windows build awaits PowerShell execution.
- XPI payload: `manifest.json`, `bootstrap.js`, `content/`, and `icons/`.

## Compatibility contract

- Product target: Zotero 7–10 on Windows, macOS, and Linux.
- Primary APIs must be Gecko-compatible; no Node-only, Chromium-only, or Electron assumptions.
- Private Zotero/PDF.js shapes require feature detection and version-focused manual verification.
