# Phase 0 Handoff

## Resume Goal

Complete the remaining host/manual verification for the Zotero Neo identity cutover, then close Phase 0 or route any observed failure back to the smallest owning change.

## Current State

- Branch: `feat/m0-fork-hygiene`
- Implementation: complete for M0 scope
- Static/Unix packaging verification: passed
- Phase status: blocked on external runtime verification
- Next milestone: M1 must not start yet

## Required Reading

- `.planning/phases/000-fork-hygiene/PLAN.md`
- `.planning/phases/000-fork-hygiene/SUMMARY.md`
- `.planning/phases/000-fork-hygiene/REVIEW.md`
- `.planning/phases/000-fork-hygiene/VERIFICATION.md`
- `AGENTS.md`

## Completed Work

- New extension/update/runtime/preference/pane/log/build identity.
- Clean Neo XPI packaging with no forbidden upstream collision strings.
- Localized README and contributor documentation updates.
- Changelog and planning evidence.

## Pending Work

1. Execute `powershell -ExecutionPolicy Bypass -File tools\build.ps1` on Windows and confirm `zotero-neo.xpi` is produced.
2. Install the XPI in Zotero and restart if prompted.
3. Confirm Add-ons and Preferences display Zotero Neo and the preference pane opens more than once.
4. Confirm the profile log is `zotero-neo-startup.log` and entries use `[ZoteroNeo]`.
5. Verify Neo preferences do not read or modify upstream settings; ideally test coexistence with Zotero Vim Plus.
6. Smoke main navigation, PDF hjkl/search, Visual annotation, Insert/comment input, notes, item/tab picker, tab cycling, and split reader.
7. Record observed pass/fail results in `VERIFICATION.md`.

## Blockers

The active environment is WSL without Zotero, `pwsh`, or Windows PowerShell. Installing Zotero through `paru` in WSL is not required and would not prove the Windows build path or the real host Zotero GUI/integration behavior. Do not add package-manager or GUI dependencies to the repository for this verification.

## Verification So Far

- Unix build, JavaScript syntax, binding sync, JSON parsing, XPI payload, packaged identity scan, documentation assertions, and whitespace checks passed.
- No static check failed.

## Next Action

On a Windows host with Zotero installed, run `tools\build.ps1`, install the generated `zotero-neo.xpi`, execute the seven pending checks above, and append the exact observations to `.planning/phases/000-fork-hygiene/VERIFICATION.md` before changing roadmap or requirement completion status.
