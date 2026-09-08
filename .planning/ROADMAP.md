# Roadmap: Zotero Neo

## Overview

The repository begins as a working Zotero Vim Plus 1.8.2 codebase with a passing build but an unsafe upstream identity. Delivery isolates the fork identity first, closes release automation and diagnostics, adds host-aware theming, then resumes the PRD order: reader history, the default keyboard language, optional search integration, safe native tag mutation, discoverability, and final Zotero verification.

## Phases

- [ ] **Phase 0 — Fork hygiene**
- [ ] **Phase 0.1 — Release automation and diagnostics**
- [ ] **Phase 0.2 — Theme-aware UI**
- [ ] **Phase 1 — Reading history**
- [ ] **Phase 2 — Zotero Neo keymap**
- [ ] **Phase 3 — Spotlight adapter**
- [ ] **Phase 4 — Native tag management**
- [ ] **Phase 5 — Which-key**
- [ ] **Phase 6 — QA, documentation, and release readiness**

## Phase Details

### Phase 0 — Fork hygiene

**Goal:** Produce a collision-free Zotero Neo identity without changing feature behavior.
**Depends on:** None.
**Requirements:** ID-01–ID-05.
**Success Criteria:**

- Manifest, runtime global, preference storage, preference pane, logging, docs, and update feed use Neo identity.
- Both builders produce `zotero-neo.xpi`; no packaged file points to the upstream update channel.
- The XPI installs/starts and baseline reader/main/note functionality remains available.
- AGPL and both upstream lineage hops are explicit.

**Plans:** 1

- [x] `000-01` — `.planning/phases/000-fork-hygiene/PLAN.md`

**Status:** Identity implementation and initial user smoke complete; final verification closes with Phase 0.1.

### Phase 0.1 — Release automation and diagnostics

**Goal:** Prove both native build paths, publish reusable XPI artifacts, prepare safe tag releases, and stop idle startup-log growth.
**Depends on:** Phase 0 implementation.
**Requirements:** OPS-01–OPS-05.
**Success Criteria:**

- Ubuntu runs `./build.sh`; Windows runs `tools/build.ps1`; both upload independently named artifacts.
- A matching version tag publishes one canonical `zotero-neo.xpi` only after both builds and metadata checks pass.
- Release permissions are scoped to the publishing job.
- Idle Zotero sessions append no periodic startup-log entries while first injection and failures remain diagnosable.
- Phase 0 verification records the user smoke result and exact remaining boundaries.

**Plans:** 1

- [ ] `000.1-01` — `.planning/phases/000.1-release-diagnostics/PLAN.md`

**Status:** Implemented; Ubuntu/Windows CI passed. Awaiting post-fix Windows Zotero logging and reader-restoration smoke.

### Phase 0.2 — Theme-aware UI

**Goal:** Give every Neo-owned panel Auto, Light, and Dark appearance modes, with Auto following Zotero's active theme.
**Depends on:** Phase 0.1 verified.
**Requirements:** THEME-01–THEME-05.
**Success Criteria:**

- Auto follows a verified Zotero theme signal, using system color scheme only as a fallback.
- Forced Light and Dark override the host consistently.
- Preferences, pickers, explorers, notes surfaces, and theme-sensitive indicators share one semantic palette.
- Open panels update without losing focus, selection, scroll, or content.
- Existing key handling and semantic annotation/link-hint colors remain intact.

**Plans:** 1

- [ ] `000.2-01` — `.planning/phases/000.2-theme-aware-ui/PLAN.md`

**Status:** Planned; execute only after Phase 0.1 verification.

### Phase 1 — Reading history

**Goal:** Bridge `Ctrl-o`/`Ctrl-i` to Zotero native reader history.
**Depends on:** Phase 0.2 verified.
**Requirements:** HIST-01–HIST-04.
**Success Criteria:**

- Back and forward work after a reader link jump.
- Empty/missing history never crashes and missing APIs show status.
- Insert mode and editable inputs retain native behavior.
- Reloaded readers and multiple tabs keep independent behavior.

**Plans:** 1

- [ ] `001-01` — `.planning/phases/001-reading-history/PLAN.md`

### Phase 2 — Zotero Neo keymap

**Goal:** Establish the LazyVim-inspired default keyboard language on the existing dispatcher.
**Depends on:** Phase 1 verified.
**Requirements:** KEY-01–KEY-07.
**Success Criteria:**

- H/L and buffer aliases navigate tabs; zh/zl pan horizontally.
- Leader find/tab/note/window/yank/split routes are coherent across contexts.
- Ctrl-h/j/k/l navigates relevant panes and does not steal input.
- Custom bindings, reset-to-defaults, and table synchronization remain correct.

**Plans:** TBD

### Phase 3 — Spotlight adapter

**Goal:** Add optional, isolated Spotlight search/command launching with native fallbacks.
**Depends on:** Phase 2 verified and current Spotlight API research.
**Requirements:** SPOT-01–SPOT-06.
**Success Criteria:**

- Required mappings launch the intended prefilled query when Spotlight is available.
- `ff`/`fb` fall back to existing pickers when Spotlight is absent.
- Spotlight-only queries report availability status without startup/runtime errors.
- Spotlight text input is never intercepted, including load-order variants.

**Plans:** TBD

### Phase 4 — Native tag management

**Goal:** Add safe keyboard-first item tag add/remove/toggle/list workflows in main, reader, and note contexts.
**Depends on:** Phase 3 verified and Zotero Item/tag API research.
**Requirements:** TAG-01–TAG-09.
**Success Criteria:**

- Current-item resolution is correct for multi-select, attachment, reader, and child-note contexts.
- Add/remove/toggle/list behavior matches single- and multi-item semantics.
- Unicode/new manual tags save and refresh immediately.
- Read-only libraries and partial failures are reported without unintended writes.
- Main colored-tag digits and reader count prefixes coexist.

**Plans:** TBD

### Phase 5 — Which-key

**Goal:** Make the leader hierarchy discoverable without replacing the input engine.
**Depends on:** Phase 4 verified and stable final v0.1 bindings.
**Requirements:** WK-01–WK-05.
**Success Criteria:**

- Delayed overlays render in main, reader, and note Normal contexts.
- Prefix continuation, Escape, completion, and timeout behavior are correct.
- No overlay or key capture occurs in inputs, Insert mode, pickers, or Spotlight.
- Display data comes from bindings plus one authoritative metadata source.

**Plans:** TBD

### Phase 6 — QA, documentation, and release readiness

**Goal:** Prove the PRD v0.1 workflow, record known limitations, and align release documentation/metadata with observed behavior.
**Depends on:** Phases 0, 0.1, 0.2, and 1–5 verified individually.
**Requirements:** QA-01–QA-07.
**Success Criteria:**

- Build/package checks pass on supported build paths.
- Main, reader, note, input, optional-integration, and data-safety matrices are recorded.
- The full mouse-free v0.1 workflow succeeds without uncaught errors.
- Documentation, changelog, compatibility claims, update feed, and release artifact are ready to publish.

**Plans:** TBD

## Progress

| Phase | Plans complete | Status | Completed |
|---:|---:|---|---|
| 0 | 1/1 | Implementation complete; closure in 0.1 | - |
| 0.1 | 0/1 | Planned next | - |
| 0.2 | 0/1 | Planned second | - |
| 1 | 0/1 | Planned third | - |
| 2 | 0/TBD | Pending design review | - |
| 3 | 0/TBD | Pending | - |
| 4 | 0/TBD | Pending | - |
| 5 | 0/TBD | Pending | - |
| 6 | 0/TBD | Pending | - |
