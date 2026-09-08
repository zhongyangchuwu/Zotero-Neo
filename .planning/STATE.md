---
status: ready
current_phase: 0.1
current_plan: 000.1-02
progress: 0/9
updated: 2026-09-08
---

# Project State

## Project Reference

See `.planning/PROJECT.md`.

**Core value:** Common Zotero intent should be expressible through a consistent, predictable, discoverable keyboard language.
**Current focus:** Reorganize repository documentation and assets while the post-fix Zotero smoke is deferred until a public release exists.

## Current Position

- Phase: 0.1 — Release automation and diagnostics
- Plan: `000.1-02` — Repository documentation hygiene
- Status: Ready for review — scope and file migration decisions recorded; no repository files moved yet
- Last activity: Inventoried root documents/media and planned a canonical `docs/` layout, support policy, and upstream attribution
- Progress: 0 of 9 phases verified

## Accumulated Context

- M0 source and packaging identity use Zotero Neo `0.1.0`, ID `zotero-neo@zotero-neo`, and preference root `extensions.zotero-neo`.
- `./build.sh` passes with 122 runtime bindings, 122 preference bindings, 109 English labels, and 109 Chinese labels synchronized.
- The user installed the WSL-built XPI and reported no functional problem in the initial smoke.
- The supplied Windows log proves the old file growth was `rescan ... newlyInjected=0` every approximately five seconds; no recurring reinjection was observed.
- Commits `9453a25` and `3dd7364` implement state-change-only diagnostics plus Ubuntu/Windows build and guarded tag-release automation.
- GitHub Actions run `34189504069` passed both build jobs; its Linux and Windows XPI artifacts contain the same 11 normalized payload files and POSIX archive paths.
- The current 91-second, 5.9 MB `BriefDemoVideo.gif` is inherited from Zotero Vim Plus and should be removed rather than presented as Neo behavior.
- Only root `README.md` remains a landing file; localized landing pages move under `docs/`, while detailed behavior and development material get one canonical source each.
- Official compatibility guarantees the latest stable Zotero only; broader manifest install bounds remain best-effort rather than a support promise.
- Zotero Vim Plus is the immediate upstream. `finktank/zotero-vim` remains historical attribution, not the displayed origin.
- Phase 0.2 adds Auto/Light/Dark theming across every Neo-owned panel; Auto follows Zotero before falling back to the OS media query.
- Phase 1 reader history follows theming; Phase 2 begins with a complete LazyVim keymap review centered on `Ctrl-h/j/k/l` pane focus.
- Primary later risks remain input capture, private Zotero APIs, read-only tag writes, main digit capture, and inherited ZV-001/ZV-002/ZV-004 behavior.

## Session Continuity

- Last session: 2026-09-08
- Stopped at: Documentation reorganization plan prepared for user review; Windows Zotero post-fix smoke remains deferred until a release exists
- Resume from: `.planning/phases/000.1-release-diagnostics/DOCS-PLAN.md`
- Gate: Accept or revise Plan 000.1-02 before moving/deleting documentation files; after implementation, return to the deferred host smoke when a release artifact is available.
