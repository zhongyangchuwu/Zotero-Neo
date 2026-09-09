# Agent Guidelines for Zotero Neo

## Project Overview

Zotero Neo is a plugin for the latest stable Zotero release. It provides a
Neovim/LazyVim-inspired, keyboard-first interaction layer across the Zotero
reader and main window through the Firefox/Gecko Bootstrap API. Runtime source
is strict TypeScript, bundled by esbuild into plain JavaScript for direct XPI
packaging.

## Build / Install / Test

### Building the plugin
```bash
./build.sh
```
On Windows (no bash needed): `powershell -ExecutionPolicy Bypass -File tools\build.ps1`
Creates `zotero-neo.xpi` — a deterministic archive containing generated runtime
bundles, the preference pane markup, the manifest, and icons.

### Installing
1. Open Zotero → Tools → Add-ons → Gear icon → "Install Add-on From File..."
2. Select `zotero-neo.xpi`
3. Restart Zotero

### Debugging
- Use `Zotero.debug('[ZoteroNeo] message')` for logging — output appears in Zotero's
  Error Console (Help → Developer → Developer Options → Error Console).
- Startup and reader injection state changes are also written to
  `zotero-neo-startup.log` in the Zotero profile.

### Testing
`npm run verify` runs formatting, strict TypeScript checks, Vitest contracts,
the esbuild package build, and the XPI member check. GitHub Actions runs this
workflow through both native wrappers.

Zotero GUI behavior still requires manual verification:
1. Build (`npm ci && ./build.sh`)
2. Re-install the `.xpi` in Zotero
3. Restart Zotero
4. Exercise the changed reader, main-window, or preference surface

## Code Style

### Indentation
Use **2 spaces** for indentation. Do not use tabs.

### Source Layout

```text
src/
  addon.ts                 composed add-on controller
  bootstrap.ts             global Gecko Bootstrap lifecycle entry
  input/                   canonical bindings, actions, and matcher
  main/                    main-window controller and UI features
  reader/                  reader lifecycle and features
  preferences/index.ts     preference behavior and localization
  platform/                narrow host-boundary adapters
```

### TypeScript Conventions

- Use strict TypeScript and `import type` for type-only dependencies.
- The packaged runtime has no runtime npm dependencies. Development dependencies
  are limited to TypeScript, esbuild, Vitest, Prettier, Node types, and
  `zotero-types`.
- Keep global Gecko and private Zotero APIs behind small structural guards or
  named platform adapters. Bootstrap globals do not provide DOM constructors;
  do not use cross-compartment `instanceof` checks.
- Use semicolons and 2-space indentation. Prettier is authoritative.
- Methods and variables use `camelCase`; internal fields use native `#private`
  fields. Constants use `SCREAMING_SNAKE_CASE`.
- Binding mode prefixes remain `'normal:j'`, `'visual:zy'`, and `'main: ff'`.

### Formatting
- Use single quotes unless a host format requires otherwise.
- Prettier formats all TypeScript, test, and build-tool sources; do not hand-format.
- Keep lines readable; extract a named helper when a host boundary becomes dense.

### Error Handling
- Expected or non-critical host failures may use empty catches.
- Log unexpected errors with `Zotero.debug()` through the shared logger.

### State Management
- `ReaderController` owns reader sessions in a `Map` keyed by `instanceID`.
- `MainWindowController` owns main-window sessions in a `Map` keyed by window.
- Session cleanup owns listeners, timers, observers, DOM, and host patches.

### Cross-Compartment Security (Chrome ↔ Content)
Objects and arrays passed across the chrome/content boundary **must** be cloned:
```ts
Components.utils.cloneInto(value, targetWindow)
```
Failing to do this throws a security error.

### Documentation
Add JSDoc-style block comments for non-obvious methods explaining parameters and
side effects. Inline comments are welcome for host constraints and complex logic.

## Architecture Notes

The plugin operates across a **three-level iframe stack** in the Zotero PDF reader.
Architecture decisions are documented in `docs/DEVELOPMENT.md`. Read that guide
before changing annotation navigation, text selection, PDF link hints, or iframe injection.

The plugin patches Zotero's reader key-forwarding callback (`_onKeyDown` on
`PdfView` instances) so keys consumed by Neo are not re-handled by Zotero
(Read Aloud on `l`/`r`, tools on `h`/`s`). Keep
`ReaderSession.patchKeyForwarding()` and `readerConsumesKey()` together when
touching reader input or iframe injection.

## Key Files

| File | Purpose |
|------|---------|
| `src/bootstrap.ts` | Gecko Bootstrap lifecycle entry point |
| `src/addon.ts` | Runtime composition and preference registration |
| `src/input/` | Canonical bindings and bilingual action metadata |
| `src/reader/controller.ts` | Reader injection, input, forwarding patches, and cleanup |
| `src/main/controller.ts` | Main-window key dispatch and lifecycle |
| `src/preferences/index.ts` | Preferences behavior and localization |
| `tools/build.mjs` | esbuild/XPI package pipeline |
| `tools/check-package.mjs` | Generated-XPI member contract |
| `tools/check-release.mjs` | Release metadata validator |
| `.github/workflows/build.yml` | Linux/Windows build and guarded tag release |
| `docs/DEVELOPMENT.md` | Build, architecture, release, and maintenance constraints |
| `manifest.json` | Extension manifest |
| `build.sh` | POSIX verification/build wrapper |

## Important Constraints

- **Latest stable Zotero only.** Older versions may work but are outside the
  compatibility guarantee and release test matrix.
- **No runtime dependencies.** Do not add npm packages, CDN scripts, or external
  libraries to the generated add-on.
- **TypeScript source, JavaScript XPI.** Package only generated JavaScript and
  static assets; never source maps, TypeScript, tests, or `node_modules`.
- **CI covers packaging and Node contracts.** Zotero GUI/runtime behavior still
  requires manual verification.
- **No pre-commit hooks.**
