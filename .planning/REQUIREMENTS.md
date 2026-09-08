# Requirements: Zotero Neo

**Defined:** 2026-09-08
**Core value:** See `.planning/PROJECT.md` — common Zotero intent must be expressible through a consistent, predictable, discoverable keyboard language.

## Milestone 0 — Identity

- [ ] **ID-01** Installed product, preference pane, and user-facing name are Zotero Neo.
- [ ] **ID-02** Extension ID, global controller, pane IDs, preference root, debug prefix, and diagnostic file cannot collide with upstream.
- [x] **ID-03** Unix and Windows builders emit exactly `zotero-neo.xpi`, and no upstream update channel remains active.
- [ ] **ID-04** English, Chinese, and Spanish documentation state the Neo repository, AGPL-3.0 license, and both upstream lineage hops.
- [ ] **ID-05** The Neo XPI installs and starts while the upstream major reader/main/note capabilities remain operational.

## Milestone 0.1 — Release Automation and Diagnostics

- [x] **OPS-01** Pull requests and pushes run native Ubuntu `build.sh` and Windows `build.ps1` jobs.
- [x] **OPS-02** Each platform exposes an independently named XPI artifact, with the Ubuntu XPI designated as the canonical release artifact.
- [x] **OPS-03** Release publication rejects tags that do not match `manifest.json` version or the prepared `updates.json` entry.
- [ ] **OPS-04** A valid version tag publishes exactly one `zotero-neo.xpi`, and only the release job receives repository write permission.
- [ ] **OPS-05** Startup diagnostics record lifecycle/failure/state-change events without periodic idle-session file growth.

## Phase 0.1 — Repository Documentation Hygiene

- [ ] **DOC-01** Root `README.md` is a concise English landing page that accurately states the pre-release installation status.
- [ ] **DOC-02** Chinese and Spanish landing pages live under `docs/` with valid relative navigation and no full-reference drift.
- [ ] **DOC-03** One canonical user guide and one canonical development guide own detailed behavior, settings, build, release, and architecture material.
- [ ] **DOC-04** Legacy root backlogs, mixed issue/design documents, and inherited demo media are consolidated, relocated, or removed without losing durable maintenance knowledge.
- [ ] **DOC-05** Active documentation guarantees compatibility only with the latest stable Zotero release and distinguishes that policy from manifest install bounds.
- [ ] **DOC-06** Zotero Vim Plus is named as the immediate upstream; historical zotero-vim attribution remains preserved but secondary.

## Milestone 0.2 — Theme-Aware UI

- [ ] **THEME-01** One preference provides `auto`, `light`, and `dark` appearance modes, with invalid values resolving to `auto`.
- [ ] **THEME-02** Auto follows a verified Zotero theme signal and uses the operating-system color scheme only as fallback.
- [ ] **THEME-03** Preferences, pickers, explorers, note surfaces, and theme-sensitive indicators share one semantic Light/Dark palette contract.
- [ ] **THEME-04** Open Neo panels update theme without losing focus, selection, scroll position, or content.
- [ ] **THEME-05** The theme cutover preserves keyboard behavior and semantic annotation/link-hint colors while keeping both palettes readable.

## Milestone 1 — Reading History

- [ ] **HIST-01** Reader Normal `Ctrl-o` invokes Zotero native back history.
- [ ] **HIST-02** Reader Normal `Ctrl-i` invokes Zotero native forward history.
- [ ] **HIST-03** Missing or changed history APIs produce `History unavailable` without an uncaught error.
- [ ] **HIST-04** History bindings remain inert in Insert mode and editable inputs, and work safely with empty history, reloads, and multiple tabs.

## Milestone 2 — Zotero Neo Keymap

- [ ] **KEY-01** Existing core reader motions/search (`j/k`, `Ctrl-d/u`, `gg/G`, `/`, `n/N`) remain functional.
- [ ] **KEY-02** `H/L` and `[b`/`]b` navigate previous/next Zotero tabs in Normal-style contexts.
- [ ] **KEY-03** Horizontal reader pan moves to `zh`/`zl` without retaining undocumented competing defaults.
- [ ] **KEY-04** `Ctrl-h/j/k/l` navigates relevant main, reader-split, and note panes without stealing editable input.
- [ ] **KEY-05** The Space leader exposes the PRD find, tab, tag, note, window, yank, explorer, search, command, and split hierarchy using current dispatcher semantics.
- [ ] **KEY-06** `<leader>yy`, `<leader>yc`, and `<leader>yb` provide citekey, citation, and bibliography behavior with graceful Better BibTeX absence.
- [ ] **KEY-07** Defaults remain remappable and runtime/prefs/English/Chinese binding metadata pass synchronization checks.

## Milestone 3 — Spotlight Integration

- [ ] **SPOT-01** One isolated adapter detects Spotlight at each invocation and contains all Spotlight coupling.
- [ ] **SPOT-02** Required global, tag, collection, annotation, PDF, full-text, command, and optional tab queries launch with the specified prefill.
- [ ] **SPOT-03** Without Spotlight, global and current-collection find actions fall back to Neo's existing item pickers.
- [ ] **SPOT-04** Spotlight-only searches report a concise installation message when unavailable instead of throwing.
- [ ] **SPOT-05** Spotlight input yields normal text entry, including when Spotlight is disabled or loaded after Neo.
- [ ] **SPOT-06** Neo startup and core behavior never depend on Spotlight and no Spotlight source is vendored.

## Milestone 4 — Native Tag Management

- [ ] **TAG-01** One context resolver maps main selections, attachments, active readers, and child notes to bibliographic target items.
- [ ] **TAG-02** `<leader>ta` fuzzy-filters library tags, selects or creates a Unicode manual tag, and adds it to every target.
- [ ] **TAG-03** `<leader>tr` shows only the target union of existing tags and removes the chosen tag wherever present.
- [ ] **TAG-04** `<leader>tt` removes a tag when every target has it and otherwise adds it to every target.
- [ ] **TAG-05** `<leader>tl` lists the current target tags without mutation.
- [ ] **TAG-06** Tag picker supports arrows, `Ctrl-j/k`, Enter, Escape, focus restoration, and immediate UI refresh.
- [ ] **TAG-07** Multi-selection scope and partial ownership are represented correctly and can support future `N/M` counts.
- [ ] **TAG-08** Mutations use Zotero Item APIs and transactions, reject read-only libraries before writes, report failures, and never touch SQLite.
- [ ] **TAG-09** Main item-list digits continue to reach Zotero colored-tag shortcuts while reader digits remain Vim count prefixes.

## Milestone 5 — Which-Key

- [ ] **WK-01** Space shows a configurable 300–500 ms delayed overlay in reader, main, and note Normal-style contexts.
- [ ] **WK-02** The overlay updates for nested prefixes and displays currently valid continuations.
- [ ] **WK-03** Escape cancels, completed actions close immediately, and the overlay never blocks the next key.
- [ ] **WK-04** Which-key stays hidden in Insert mode, arbitrary editables, picker inputs, and Spotlight.
- [ ] **WK-05** Display data derives from bindings plus one authoritative action/group metadata source without rewriting the dispatcher.

## Milestone 6 — QA and Documentation

- [ ] **QA-01** Unix and Windows build paths pass syntax, binding synchronization, and XPI packaging checks.
- [ ] **QA-02** Main-window regression matrix passes for collection tree, item list, detail/search focus, navigation, Enter, leader, and pane keys.
- [ ] **QA-03** Reader regression matrix passes for motions, search, history, modes, annotations, marks, outline, split, reload, and multiple tabs.
- [ ] **QA-04** Note regression matrix passes for Normal/Insert/Escape, motions, operators, paste, undo/redo, leader, and inherited known issues are recorded.
- [ ] **QA-05** Spotlight installed, missing, disabled, and load-after-Neo states are exercised.
- [ ] **QA-06** The PRD v0.1 end-to-end workflow completes without a mouse, ordinary inputs accept text, and normal use has no uncaught errors.
- [ ] **QA-07** README variants, architecture/testing notes, changelog, release metadata, compatibility claims, and manual verification record match observed behavior.

## Deferred / Future

PDF link hints, advanced Vim motions, command-line expansion, reverse Spotlight command registration, keymap presets/import-export, generic picker API, macros, full registers/operator engine, and other PRD v0.2 items are not current commitments.

## Out of Scope

Neovim RPC/embedding, external viewers, MCP, AI assistant, direct SQLite writes, a custom search index, copied Spotlight code, TypeScript/framework rewrite, modal dispatcher rewrite, and custom jump stack.

## Traceability

| Requirement | Phase | Status |
|---|---:|---|
| ID-01–ID-05 | 0 — Fork hygiene | Implemented; final verification in 0.1 |
| OPS-01–OPS-05 | 0.1 — Release automation and diagnostics | OPS-01–OPS-03 verified; tag publication and host log retest pending |
| DOC-01–DOC-06 | 0.1 — Repository documentation hygiene | Planned next |
| THEME-01–THEME-05 | 0.2 — Theme-aware UI | Planned second |
| HIST-01–HIST-04 | 1 — Reading history | Planned third |
| KEY-01–KEY-07 | 2 — Neo keymap | Pending design review |
| SPOT-01–SPOT-06 | 3 — Spotlight adapter | Planned |
| TAG-01–TAG-09 | 4 — Tag management | Planned |
| WK-01–WK-05 | 5 — Which-key | Planned |
| QA-01–QA-07 | 6 — QA and documentation | Planned |

## Coverage Summary

- Current requirements: 59
- Mapped to exactly one phase: 59
- Unmapped: 0
