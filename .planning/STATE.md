---
status: blocked
current_phase: 0.1
current_plan: 000.1-01
progress: 0/9
updated: 2026-09-08
---

# Project State

## Project Reference

See `.planning/PROJECT.md`.

**Core value:** Common Zotero intent should be expressible through a consistent, predictable, discoverable keyboard language.
**Current focus:** Install the CI-built XPI in Windows Zotero and verify bounded idle logging plus reader restoration.

## Current Position

- Phase: 0.1 — Release automation and diagnostics
- Plan: `000.1-01` — Windows/Linux CI, release artifact, startup-log fix
- Status: Blocked — source/CI verification passed; actual Windows Zotero retest requires the user host
- Last activity: Fixed state-change logging, passed Linux and Windows CI, and downloaded/compared both XPI artifacts
- Progress: 0 of 9 phases verified

## Accumulated Context

- M0 source and packaging identity use Zotero Neo `0.1.0`, ID `zotero-neo@zotero-neo`, and preference root `extensions.zotero-neo`.
- `./build.sh` passes with 122 runtime bindings, 122 preference bindings, 109 English labels, and 109 Chinese labels synchronized.
- The user installed the WSL-built XPI and reported no functional problem in the initial smoke.
- The supplied Windows log proves the old file growth was `rescan ... newlyInjected=0` every approximately five seconds; no recurring reinjection was observed.
- Commits `9453a25` and `3dd7364` implement state-change-only diagnostics plus Ubuntu/Windows build and guarded tag-release automation.
- GitHub Actions run `34189504069` passed both build jobs; its Linux and Windows XPI artifacts contain the same 11 normalized payload files and POSIX archive paths.
- Phase 0.2 adds Auto/Light/Dark theming across every Neo-owned panel; Auto follows Zotero before falling back to the OS media query.
- Phase 1 reader history follows theming; Phase 2 begins with a complete LazyVim keymap review centered on `Ctrl-h/j/k/l` pane focus.
- Primary later risks remain input capture, private Zotero APIs, read-only tag writes, main digit capture, and inherited ZV-001/ZV-002/ZV-004 behavior.

## Session Continuity

- Last session: 2026-09-08
- Stopped at: Phase 0.1 source and CI work passed; Windows Zotero post-fix smoke remains
- Resume from: `.planning/phases/000.1-release-diagnostics/VERIFICATION.md`
- Gate: Install the new XPI, leave Zotero idle with restored/open readers, confirm no recurring rescan lines and working injection, then close Phases 0/0.1 and start Phase 0.2.
