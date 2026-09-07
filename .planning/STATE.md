---
status: blocked
current_phase: 0
current_plan: 000-01
progress: 0/7
updated: 2026-09-08
---

# Project State

## Project Reference

See `.planning/PROJECT.md`.

**Core value:** Common Zotero intent should be expressible through a consistent, predictable, discoverable keyboard language.
**Current focus:** Complete host verification for the implemented M0 identity cutover.

## Current Position

- Phase: 0 — Fork hygiene
- Plan: `000-01` — Identity cutover
- Status: Blocked — requires Windows/PowerShell and Zotero host verification
- Last activity: Implemented M0, passed WSL static/Unix packaging checks, and recorded handoff
- Progress: 0 of 7 phases verified

## Accumulated Context

- M0 source and packaging identity now use Zotero Neo `0.1.0`, ID `zotero-neo@zotero-neo`, and preference root `extensions.zotero-neo`.
- `./build.sh` passes with 122 runtime bindings, 122 preference bindings, 109 English labels, and 109 Chinese labels synchronized.
- `zotero-neo.xpi` contains the expected 11 files and no forbidden upstream collision strings.
- PowerShell and Zotero are unavailable in WSL; Windows build, installation, startup, preference, coexistence, and feature smoke checks remain blocked.
- M1, M3, M4, and M5 are missing; M2 is partial.
- Primary later risks remain input capture, private Zotero APIs, read-only tag writes, main digit capture, and inherited ZV-001/ZV-002/ZV-004 behavior.

## Session Continuity

- Last session: 2026-09-08
- Stopped at: M0 implementation complete; host verification blocked
- Resume from: `.planning/phases/000-fork-hygiene/HANDOFF.md`
- Gate: Complete and record Phase 0 host verification before planning/executing Phase 1 in detail.
