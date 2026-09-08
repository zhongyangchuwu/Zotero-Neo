# Zotero Neo

## What This Is

Zotero Neo is a Neovim/LazyVim-inspired, keyboard-first interaction layer for the latest stable Zotero. It is an independently maintained fork of `ZorroStardust/zotero-vim-plus`, which contains earlier work from `finktank/zotero-vim`, and it preserves the existing Bootstrap/plain-JavaScript architecture rather than replacing Zotero or its reader.

## Core Value

A user should be able to express common Zotero intent through one consistent, predictable, discoverable keyboard language without leaving Zotero or reaching for the mouse.

## Requirements

### Validated

- The upstream code already provides Normal, Cursor, Visual, Insert, main-window, and note-editor keyboard contexts.
- Existing reader navigation, annotations, marks, notes, collection/item navigation, fuzzy item picker, tab picker, and split reader are reusable foundations.
- The current binding dispatcher supports configurable multi-key sequences and a Space leader.
- The repository builds successfully and its current binding/action-label tables are synchronized.
- Official compatibility targets the latest stable Zotero release; older versions and broader manifest install bounds are best-effort, not part of the release guarantee.

### Active

- Finish M0 with maintainable repository documentation while the post-fix host smoke is deferred until a public release exists.
- After M0 closure, add host-aware Light/Dark/Auto theming, then resume the PRD order: reader history, reviewed Neo keymap, optional Spotlight adapter, native tag management, which-key, and QA/documentation.
- Preserve upstream PDF Visual/annotation workflows and ordinary text input while changing global key behavior.
- Produce a releaseable `zotero-neo.xpi` with a distinct installed identity and update channel.

### Out of Scope

- Neovim RPC or embedding, external PDF viewers, macros, full registers/operator engine, MCP, AI features, direct SQLite mutation, a new search index, vendored Spotlight source, TypeScript/framework migration, a rewritten modal dispatcher, or a custom jump list.
- Deferred PRD v0.2 features such as PDF link hints, advanced motions, reverse Spotlight commands, keymap import/export, and a generic picker abstraction.

## Context

- Current implementation branch is `feat/m0-fork-hygiene`.
- Repository origin points to `https://github.com/zhongyangchuwu/Zotero-Neo.git`.
- The immediate upstream is `ZorroStardust/zotero-vim-plus`; `finktank/zotero-vim` is preserved as historical lineage rather than presented as Neo's origin.
- M0 source identity is implemented as Zotero Neo `0.1.0`; the user installed the WSL-built XPI and reported no functional problem in the initial smoke.
- `./build.sh` and the Windows-native `tools/build.ps1` pass through GitHub Actions; both upload `zotero-neo.xpi`, with Linux designated as the canonical release artifact.
- The supplied Windows log identified five-second steady-state rescan writes. Source diagnostics are now state-change-based and await a post-fix Zotero host smoke.
- There is no automated GUI suite. Installation, focus, input, mutation, theme, and optional integration behavior require manual Zotero verification.
- Reader behavior depends on private Zotero/PDF.js APIs, cross-compartment cloning, per-reader state, and key-forwarding wrappers documented in `README.md`.

## Constraints

- Plain JavaScript, two-space indentation, no runtime dependencies, no TypeScript, and Gecko-compatible APIs only.
- Reuse `DEFAULT_BINDINGS`, `_processBuffer`, `_executeAction`, `_executeMainAction`, and existing state ownership.
- Reader-local state stays in `_readerState`; main/note/picker state stays in `_mainWindowState`.
- Objects and arrays crossing into reader content must use `Components.utils.cloneInto`.
- Optional integrations must be detected at call time, never block startup, and fail with concise status.
- Zotero data mutations must use the Item API and transactions, respect read-only libraries, and never write SQLite directly.
- Complete and verify one milestone before implementing the next.

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Treat M0 as a release-blocking identity cutover. | Current ID, updates, prefs, pane, and globals collide with upstream. | No feature implementation starts before M0 verification. |
| Extend the existing dispatcher instead of redesigning it. | It already supports modes, prefixes, remapping, and Zotero key suppression. | New features add actions/bindings at existing seams. |
| Use a clean preference namespace with no automatic upstream-pref migration by default. | Coexistence and reproducibility are more important than silently sharing or copying upstream settings. | Neo starts with Neo defaults; migration requires a later explicit decision. |
| Keep Spotlight behind one adapter and re-detect it per invocation. | Plugin load order and optional availability are variable. | No cached startup dependency or vendored implementation. |
| Build a purpose-specific tag picker before any generic picker abstraction. | Tag creation, batch counts, and mutation semantics differ from item/tab selection. | Reuse interaction patterns, not a premature base class/API. |
| Manual runtime evidence is a release gate. | Build and sync checks cannot prove Zotero behavior. | Every phase records a Zotero smoke checklist and M6 records full results. |
| Validate both builders in GitHub Actions and publish one canonical Linux-built release XPI. | The target Windows build must be exercised without installing PowerShell inside WSL, while duplicate public artifacts add ambiguity. | Ubuntu and Windows are independent gates; a tag release attaches only `zotero-neo.xpi` from Ubuntu after both pass. |
| Treat startup-file logging as state-change diagnostics, not a periodic trace. | Time throttles still cause unbounded idle growth and hide whether reader lifecycle is stable. | Log startup, failures, and first injection; fix reinjection churn if present. |
| Theme every Neo-owned panel through Auto, Light, and Dark modes. | Existing preferences follow the OS media query while runtime overlays are hard-coded dark. | Auto follows verified Zotero theme state; all Neo panels share semantic palette tokens. |
| Review the full LazyVim-inspired map before changing defaults. | `Ctrl-h/j/k/l`, `H/L`, `zh/zl`, picker precedence, and input focus interact across contexts. | Phase 2 begins with a complete conflict/precedence table and user review, then performs one clean cutover. |
| Guarantee only the latest stable Zotero release. | Private Zotero/PDF.js APIs change faster than this project can honestly verify a broad historical matrix. | Active docs promise the latest stable release; older installable versions are best-effort. |
| Keep the root README concise and move human documentation under `docs/`. | Three 35–41 KB README copies already drift, while the root mixes landing, user, and maintainer concerns. | Root keeps one English landing page; localized landing pages and canonical detailed guides live under `docs/`. |
| Name Zotero Vim Plus as the immediate upstream. | Git `origin` belongs to Zotero Neo, while `finktank/zotero-vim` is an earlier lineage hop. | Header attribution points to Vim Plus; the older project remains in the detailed license/attribution section. |

## Release Contract Defaults

These planning defaults make M0 executable; change them only before the first Neo release:

- Extension ID: `zotero-neo@zotero-neo`
- Manifest version for the first release: `0.1.0`
- Preference root: `extensions.zotero-neo`
- Global controller: `ZoteroNeo`
- Preference pane ID: `zotero-neo-prefs`
- Debug prefix: `[ZoteroNeo]`
- Diagnostic file: `zotero-neo-startup.log`
- XPI: `zotero-neo.xpi`
- Update feed: current fork `updates.json`, keyed by the new ID; keep updates empty until a release asset exists.
