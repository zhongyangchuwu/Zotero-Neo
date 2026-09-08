# Phase 0.1 Summary

## Delivered

- Changed reader startup diagnostics from periodic throttled logging to state-change-only logging.
- Kept the one-second reader discovery loop required for restored-reader injection.
- Added Ubuntu and Windows GitHub Actions build jobs for every push and pull request.
- Added independently named Linux and Windows XPI artifacts.
- Added a tag-only release job that depends on both builders and publishes one canonical Linux-built `zotero-neo.xpi`.
- Added `tools/check-release.js` to validate tag, manifest version, extension ID, Zotero compatibility, update-feed entry, and release URL.
- Scoped repository write permission to the release job.
- Updated build scripts to syntax-check the release validator.
- Updated contributor/build documentation, changelog, planning state, and runtime-log ignore rules.

## Root Cause

The supplied Windows log showed `rescan readers=<N> newlyInjected=0` every approximately five seconds. That interval matched `_lastRescanFileTS`; reader injection itself was stable. The previous throttle reduced the rate but still allowed indefinite idle file growth.

`_rescanSelectedReader` now writes diagnostics only when at least one new reader is discovered. `_onRenderToolbar` writes only when it initiates first-time injection.

## Commits Published

- `9453a25` — `fix: stop idle startup log growth`
- `3dd7364` — `ci: validate cross-platform XPI builds`

## Verification

- Focused VM smoke: zero file/debug writes for an idle already-injected reader.
- Focused VM smoke: new rescan and toolbar reader transitions still emit diagnostics.
- Local `./build.sh`: passed syntax, 122/122 binding sync, 109/109 labels, and XPI creation.
- GitHub Actions run `34189504069`: Ubuntu and Windows builds passed; release job skipped as expected on a branch push.
- Downloaded both CI artifacts: same 11 member paths, POSIX archive paths, and identical payload after CRLF/LF normalization.
- Release guard rejected the current empty feed and accepted a temporary valid release fixture.

## Remaining Gate

Install a newly built XPI in Windows Zotero and verify:

1. startup/restored reader injection still works;
2. opening additional readers still injects them;
3. an idle session no longer appends recurring `rescan ... newlyInjected=0` lines.

No version tag was created, so actual GitHub Release publication remains intentionally untested until release preparation populates `updates.json`.
