# Phase 0 Handoff

## Resume Goal

Close Phase 0 through `.planning/phases/000.1-release-diagnostics/PLAN.md`: eliminate recurring idle startup-log writes, prove both packaging paths in GitHub Actions, and retain the recorded user host smoke.

## Current State

- Branch: `feat/m0-fork-hygiene`
- Identity implementation: complete and committed as `29e10e6`
- Static/Unix packaging verification: passed
- User host smoke: WSL-built XPI installed; no functional problem reported
- Active defect: `zotero-neo-startup.log` appears to gain a line approximately every second
- Phase status: final verification moves through Phase 0.1
- Next feature work: Phase 0.2 theme-aware UI; M1 follows

## Required Reading

- `.planning/phases/000.1-release-diagnostics/CONTEXT.md`
- `.planning/phases/000.1-release-diagnostics/RESEARCH.md`
- `.planning/phases/000.1-release-diagnostics/PLAN.md`
- `.planning/phases/000-fork-hygiene/VERIFICATION.md`
- `AGENTS.md`

## Completed Work

- New extension/update/runtime/preference/pane/log/build identity.
- Clean Neo XPI packaging with no forbidden upstream collision strings.
- Localized README and contributor documentation updates.
- Changelog and planning evidence.
- Initial installation/startup/ordinary-use smoke by the user.

## Pending Work

1. Capture several consecutive repeated lines from `zotero-neo-startup.log` while Zotero is idle.
2. Fix the producing path so file diagnostics are state-change-based rather than periodic.
3. Add Ubuntu and Windows GitHub Actions build jobs and independently named artifacts.
4. Add version/update validation and tag-based publication of one canonical `zotero-neo.xpi`.
5. Confirm reader restoration/injection remains functional and idle logging stops growing.
6. Record Actions and runtime evidence in `VERIFICATION.md` and close Phases 0/0.1.
7. Keep upstream/Neo coexistence as an explicit untested boundary until exercised.

## Environment Constraint

The agent environment is WSL without a directly controllable Zotero GUI or Windows PowerShell. Do not install Zotero or PowerShell through `paru`; Windows packaging belongs in GitHub Actions, and host UI behavior remains manual Zotero evidence.

## Verification So Far

- Unix build, JavaScript syntax, binding sync, JSON parsing, XPI payload, packaged identity scan, documentation assertions, and whitespace checks passed.
- The user reports no functional problem with the installed WSL-built XPI.
- The real profile contains the Neo diagnostic filename, but its recurring cadence remains a release blocker.

## Next Action

Obtain the repeated log-line text, then execute `.planning/phases/000.1-release-diagnostics/PLAN.md`. Do not start theme implementation or M1 until Phase 0.1 passes.
