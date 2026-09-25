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
./tools/build.sh
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
the esbuild package build, and the XPI member check. GitHub Actions runs the
repository CI workflow; inspect the current workflow definition rather than
assuming a fixed OS matrix.

### GitHub MCP development workflow

When development is performed through GitHub MCP rather than a local checkout,
keep repository writes, workflow execution, and CI diagnosis explicit and
SHA-guarded.

1. **Read before writing.**
   - Read the current PR/base/head state and the exact file SHA before updating a
     file.
   - Keep feature work on a branch; avoid writing directly to `main`.
   - Use the current PR head SHA as an optimistic-concurrency guard where the
     GitHub operation supports one.

2. **Use GitHub Actions MCP for workflow operations.**
   - Inspect workflow runs, jobs, and job logs before changing code in response
     to CI failure. A failed `Build XPI` step may actually be
     `npm run verify` failing on format, typecheck, tests, or packaging.
   - Do not infer a platform-specific bug merely because both Linux and Windows
     jobs fail at the same outer step; read the inner log first.

3. **Use the repository Format workflow instead of hand-formatting through MCP.**
   - The canonical formatter workflow is
     `.github/workflows/format.yml` (`Format branch`).
   - Dispatch the workflow definition from `main` with:
     - `target_ref`: the same-repository feature branch to format;
     - `expected_sha`: that branch's **current** HEAD.
   - The workflow runs `npm run format`, validates the diff, commits
     `style: apply prettier`, and pushes back to the target branch.
   - If any commit lands on the branch after reading its SHA, refresh the head
     and dispatch again with the new `expected_sha`; the workflow intentionally
     rejects stale SHAs.
   - Do not temporarily add Prettier writes, diagnostic `git diff`, or
     unconditional `exit 1` statements to `tools/build.sh` just to repair a
     formatting failure. Use the dedicated formatter or a dedicated diagnostic
     workflow.

4. **Keep CI topology internally consistent.**
   - If a platform job is temporarily disabled in `build.yml`, update
     downstream `needs` lists in the same change.
   - Treat this as a CI configuration change, not as evidence that the disabled
     platform was the cause of an unrelated failure.

5. **Handle PR branch rewrites carefully.**
   - Force-resetting an open PR branch exactly to its base can cause GitHub to
     auto-close the PR because it temporarily has no commits.
   - Prefer a normal rebase/update when practical. If a deliberate reset is
     needed, restore the feature commits and verify/reopen the PR before
     continuing.

6. **Merge only from a verified head.**
   - Re-read PR mergeability and the latest head SHA after formatter/CI commits.
   - Require the relevant CI jobs to pass and use `expected_head_sha` when
     merging so a concurrent push cannot be merged accidentally.

This workflow is the reference path for ChatGPT/GitHub-MCP changes in this
repository. Prefer existing repository workflows and narrow GitHub operations
over ad-hoc build-script edits.

Zotero GUI behavior still requires manual verification:
1. Configure the dedicated profile once with `npm run dev:setup`, then launch
   it with `npm run dev:start` as documented in `docs/DEVELOPMENT.md`.
2. For ordinary local iteration, run `npm run dev` to rebuild and hot-reload
   Neo over Firefox RDP without restarting Zotero.
3. Exercise the changed reader, main-window, or preference surface.
4. Use packaged XPI install/update testing separately when packaging or
   lifecycle behavior changes.

## Code Style

### Indentation
Use **2 spaces** for indentation. Do not use tabs.

### Source Layout

```text
assets/
  branding/                repository-only source artwork and README banner
  package/                 static XPI skeleton copied into build/addon
    content/preferences/   preference pane XHTML
    icons/                 seven-size transparent runtime PNGs
src/
  addon.ts                 composed add-on controller
  i18n/                    shared app localization and locale catalogs
  bootstrap.ts             global Gecko Bootstrap lifecycle entry
  input/                   canonical bindings, actions, and matcher
  main/                    main-window controller and UI features
  reader/                  reader lifecycle and features
  preferences/index.ts     legacy Preferences registration / Settings launcher
  platform/                narrow host-boundary adapters
vendor/                    pinned, licensed third-party source/build snapshots
```

### TypeScript Conventions

- Use strict TypeScript and `import type` for type-only dependencies.
- The packaged runtime has no dynamic npm/package-manager dependency. Development
  dependencies stay limited to build/test tooling; small audited zero-dependency
  libraries may be vendored and bundled by esbuild when their version, upstream
  source, and license are pinned under `vendor/`.
- Keep global Gecko and private Zotero APIs behind small structural guards or
  named platform adapters. Bootstrap globals do not provide DOM constructors;
  do not use cross-compartment `instanceof` checks.
- Use semicolons and 2-space indentation. Prettier is authoritative.
- Methods and variables use `camelCase`; internal fields use native `#private`
  fields. Constants use `SCREAMING_SNAKE_CASE`.
- Canonical binding examples are `reader-normal:j`, `reader-select:zy`, and `main-normal:<Space>ff`; Space is the default semantic command root across Reader/Main/Note.
- Do not conflate persisted/display key notation with runtime event tokens.
  `keyString(event)` currently returns lowercase named-key tokens such as
  `escape`, `enter`, `home`, and `arrowdown`; Neovim forms such as
  `<Esc>` and `<Enter>` belong to the binding grammar/display layer. Follow
  an existing runtime consumer such as Plugin Manager when handling raw key
  events.

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
(Read Aloud on `l`/`r`, tools on `h`/`s`). `ReaderHostKeyBridge` owns
installation/restoration of that private callback and the
`_textAnnotationFocused` seam; `ReaderSession.readerConsumesKey()` remains the
policy source. `ReaderViewLifecycle` owns primary/secondary PDF-window discovery,
the rescan timer, view-local DOM listeners, and detached-view release.
`ReaderNavigation` owns history/zoom/page/search/split/focus host delegation and
active Reader-view resolution. `ReaderSelectionRange` owns the temporary DOM Select
anchor/preferred-X state, range motions, endpoint swaps, and Select view markers.
Input policy, native popup geometry, annotation mutations, and smooth-scroll behavior
remain in their existing owners.

Main chooser ownership follows the same rule. `src/main/picker/` owns candidate search,
ranking, rendering, preview, focus, IME, confirmation/cancellation, and stale-work containment.
Ordinary item/note/tab candidate sources own data and presentation only; the semantic action that
opens the chooser injects what confirmation means. Do not add provider-local create/delete/yank/
open grammars or move domain mutation into Picker to save a dispatch step. Command Palette may
reuse the candidate surface to choose an `ActionId`. Tag sources may constrain/project candidates.
`TagActions` owns tag candidate choice and persistent item-tag mutation; `MainViewActions` owns
Main Quick/Advanced/tag View mutations while Zotero's native filter UIs remain authoritative.
Cross-context item actions should resolve targets through `main/item-targets.ts`:
Main uses EffectiveSelection, Reader uses the active Reader item, and Note uses
its active note context. Do not make Reader item actions borrow Main Selection.
Main View actions and Reader-local PDF actions remain surface-specific.
Cross-surface knowledge capture follows the same ownership rule: Reader owns the
transient text selection and passes a DOM-free `ReaderSelectionContext`
snapshot; Main owns the persistent Notes picker and Zotero note mutation. Keep
Picker providers candidate-only, and do not let Reader capture code borrow Main
Selection or mutate notes directly.

## Key Files

| File | Purpose |
|------|---------|
| `src/bootstrap.ts` | Gecko Bootstrap lifecycle entry point |
| `src/addon.ts` | Runtime composition and preference registration |
| `src/i18n/` | Shared application localization, action labels, and locale catalogs |
| `src/input/` | Canonical bindings and action metadata |
| `src/reader/controller.ts` | Reader session orchestration, input, actions, selection, annotation, and scroll behavior |
| `src/reader/host-key-bridge.ts` | Private PdfView key/focus patch lifecycle |
| `src/reader/view-lifecycle.ts` | Primary/secondary PDF-view discovery, listeners, and release |
| `src/reader/navigation.ts` | Reader history/zoom/page/search/split/focus host operations |
| `src/reader/selection-range.ts` | Temporary DOM Select range state, motions, and view markers |
| `src/main/controller.ts` | Main-window key dispatch and lifecycle |
| `src/preferences/index.ts` | Legacy Preferences registration and behavior |
| `tools/build.mjs` | esbuild/XPI package pipeline |
| `tools/check-package.mjs` | Generated-XPI member contract |
| `tools/check-release.mjs` | Release metadata validator |
| `.github/workflows/build.yml` | Ubuntu verification/build and guarded tag release |
| `docs/DEVELOPMENT.md` | Build, architecture, release, and maintenance constraints |
| `manifest.json` | Extension manifest |
| `tools/build.sh` / `tools/build.ps1` | POSIX and Windows verification/build wrappers |

## Important Constraints

- **Latest stable Zotero only.** Older versions may work but are outside the
  compatibility guarantee and release test matrix.
- **No dynamic runtime dependencies.** Do not load npm packages, CDN scripts,
  native helper binaries, or network-hosted libraries at runtime. A small
  third-party library may be included only as a pinned, licensed vendored
  snapshot that esbuild folds into the generated JavaScript.
- **TypeScript source, JavaScript XPI.** Package only generated JavaScript and
  static assets; never source maps, TypeScript, tests, `node_modules`, or raw
  vendor modules as separate XPI runtime files.
- **CI covers packaging and Node contracts.** Zotero GUI/runtime behavior still
  requires manual verification.
- **No pre-commit hooks.**
