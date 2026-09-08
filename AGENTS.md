# Agent Guidelines for Zotero Neo

## Project Overview

Zotero Neo is a plugin for the latest stable Zotero release. It provides a
Neovim/LazyVim-inspired, keyboard-first interaction layer across the Zotero
reader and main window through the Firefox/Gecko Bootstrap API, plain
JavaScript, and direct XPI packaging.

## Build / Install / Test

### Building the plugin
```bash
./build.sh
```
On Windows (no bash needed): `powershell -ExecutionPolicy Bypass -File tools\build.ps1`
Creates `zotero-neo.xpi` — a zip of `manifest.json`, `bootstrap.js`, `content/`, and `icons/`.

### Installing
1. Open Zotero → Tools → Add-ons → Gear icon → "Install Add-on From File..."
2. Select `zotero-neo.xpi`
3. Restart Zotero

### Debugging
- Use `Zotero.debug('[ZoteroNeo] message')` for logging — output appears in Zotero's
  Error Console (Help → Developer → Developer Options → Error Console).
- For UI feedback, use `this._showStatus(state, 'message', durationMs)` on the current
  reader state object.

### Testing
There is **no automated Zotero runtime test suite**. GitHub Actions runs both
native builders and their syntax/binding checks. Test behavior changes by:
1. Building (`./build.sh`)
2. Re-installing the `.xpi` in Zotero
3. Restarting Zotero
4. Manually exercising the changed functionality in the relevant Zotero surface

## Code Style

### Indentation
Use **2 spaces** for indentation. Do not use tabs.

### File Structure
The codebase has several primary files:
- `bootstrap.js` — Zotero lifecycle entry point (install/uninstall hooks)
- `content/core.js` — Base controller: shared state, bindings, key handling, and dispatch
- `content/reader.js` — Reader-side methods
- `content/main.js` — Main-window methods
- `content/preferences/` — Preferences pane markup, behavior, and runtime localization

### JavaScript Conventions

**No ES6 classes.** Use object literals:
```js
var ZoteroNeo = {
    init({ id, version, rootURI }) { ... },
    shutdown() { ... },
    // methods here
};
```

**Use semicolons consistently** — the existing code uses semicolons at line ends;
match the surrounding file.

**Global declarations.** Every file must declare its globals at the top:
```js
/* global Zotero, Components, Services */
/* eslint-disable no-unused-vars */
```

**Naming:**
- Methods and variables: `camelCase` (e.g., `_executeAction`, `_readerState`)
- Private/internal methods: underscore prefix (e.g., `_waitAndInject`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `PREF_PREFIX`, `COLORS`)
- Binding mode prefixes: `'normal:j'`, `'visual:zy'`, `'main: ff'` (with a space before the key)

### Imports / Dependencies
There are no imports — no `require`, no `import`, no npm packages.
Global Zotero/Firefox APIs are accessed directly:
```js
Components.classes["@mozilla.org/preferences-service;1"]
    .getService(Components.interfaces.nsIPrefBranch);
```

### Formatting
- **Single quotes** preferred in runtime scripts; double quotes in preferences scripts —
  match the surrounding file.
- **Max line length:** ~100 characters. Use line breaks to stay readable.
- Use ASCII box-drawing comments as section dividers:
  ```js
  // ── Constants ────────────────────────────────────────────────────────────
  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ```

### Error Handling
- Silent catches (when error is expected/non-critical):
  ```js
  try { something(); } catch (_) {}
  ```
- Log unexpected errors with `Zotero.debug()`:
  ```js
  Zotero.debug('[ZoteroNeo] _executeAction error (' + action + '): ' + e);
  ```

### State Management
- Store per-reader state in a `Map` keyed by `instanceID`:
  ```js
  _readerState: new Map(),
  ```
- Never use module-level `let`/`var` for reader-specific state.

### Cross-Compartment Security (Chrome ↔ Content)
Objects and arrays passed across the chrome/content boundary **must** be cloned:
```js
Components.utils.cloneInto(value, targetWindow)
```
Failing to do this throws a security error.

### JSDoc
Add JSDoc-style block comments for non-obvious methods explaining parameters and side effects.
Inline comments are welcome for complex logic — use `//` style.

## Architecture Notes

The plugin operates across a **three-level iframe stack** in the Zotero PDF reader.
Architecture decisions are documented in `docs/DEVELOPMENT.md`. Read that guide
before changing annotation navigation, text selection, or iframe injection.

The plugin also patches Zotero's reader key-forwarding callback (`_onKeyDown`
on the PdfView instances) so keys consumed by Neo are not re-handled by Zotero
(Read Aloud on `l`/`r`, tools on `h`/`s`). Keep `_patchReaderKeyForwarding` /
`_readerConsumesKey` in mind when touching key handling or iframe injection.

## Key Files

| File | Purpose |
|------|---------|
| `bootstrap.js` | Zotero lifecycle hooks; loads runtime scripts in explicit order |
| `content/core.js` | Shared controller, bindings, lifecycle, reader injection, and dispatch |
| `content/reader.js` | Reader features: outline, visual/cursor mode, annotations, and marks |
| `content/main.js` | Main-window features: note editor, pickers, split views, and notes layout |
| `content/preferences/pane.xhtml` | Preferences panel markup and styles |
| `content/preferences/pane.js` | Preferences pane behavior, bindings, and English labels |
| `content/preferences/i18n.js` | Preferences pane runtime localization |
| `tools/check-sync.js` | Verifies preference binding tables match runtime defaults |
| `tools/build.ps1` | Windows-native XPI builder with POSIX archive entry paths |
| `tools/check-release.js` | Validates a release tag against manifest and update metadata |
| `.github/workflows/build.yml` | Ubuntu/Windows builds, XPI artifacts, and guarded tag releases |
| `docs/DEVELOPMENT.md` | Build, architecture, release, and maintenance constraints |
| `docs/KNOWN_ISSUES.md` | Current shelved runtime investigations |
| `docs/ROADMAP.md` | Public product direction |
| `manifest.json` | Extension manifest |
| `build.sh` | Builds the `.xpi` and runs available sanity checks |

## Important Constraints

- **Latest stable Zotero only.** Older versions may work but are outside the
  compatibility guarantee and release test matrix.
- **No external dependencies.** Do not add npm packages, CDN scripts, or external libraries.
- **No TypeScript.** The codebase is plain JavaScript.
- **CI covers packaging only.** GitHub Actions validates both builders, syntax, binding sync,
  release metadata, and artifacts; Zotero GUI/runtime behavior still requires manual verification.
- **No pre-commit hooks.** Linting is optional and manual.
