# Phase 0.1 Verification

## Claims Checked

| Claim | Evidence | Status |
|---|---|---|
| Idle rescan no longer writes diagnostics | VM smoke invoked `_rescanSelectedReader` with an already injected reader and observed zero file/debug writes | Passed locally |
| New-reader transitions remain logged | VM smoke observed one rescan log for one newly discovered reader and one toolbar-initiation log for a new toolbar reader | Passed locally |
| Unix build remains valid | `./build.sh` completed syntax, binding-sync, and XPI packaging checks | Passed |
| Windows-native builder works | GitHub Actions `windows-latest` job executed `tools/build.ps1` successfully | Passed |
| Both CI artifacts are usable | Downloaded Linux and Windows artifacts; both contain the same 11 member paths, use POSIX paths, and have identical payload after newline normalization | Passed |
| Invalid release metadata blocks publication | Empty current update feed caused `check-release.js v0.1.0` to exit 1 with the expected error | Passed |
| Valid release metadata is accepted | Temporary valid feed fixture passed `check-release.js v0.1.0` | Passed |
| Branch builds do not publish a release | Release job was skipped on the feature-branch push | Passed |
| Post-fix Zotero idle logging is bounded | Requires installation of a newly built XPI in the Windows Zotero host | Blocked |
| Reader restoration/injection still works in Zotero | Requires installation of a newly built XPI in the Windows Zotero host | Blocked |
| Version-tag publication creates one release asset | No release tag was created during this phase | Untested intentionally |

## Root Cause Evidence

The supplied Windows runtime log confirms that reader lifecycle state is stable and the file growth came from the diagnostic producer itself:

- recurring entries are `rescan readers=<N> newlyInjected=0`;
- intervals are approximately 5.0–5.3 seconds, matching `_lastRescanFileTS` throttling;
- `inject reader` appears only for genuinely new reader instances;
- `renderToolbar` is event-driven rather than periodic;
- timestamp resets mark separate Zotero/plugin startups in the append-only file.

The fix keeps the one-second reader discovery loop but writes rescan diagnostics only when `newlyInjected > 0`. Toolbar diagnostics are written only when that event initiates first-time injection.

## Automation Evidence

- Commit: `3dd7364cb98520c6e6a2fb9e9740b12eab23d522`
- Workflow run: https://github.com/zhongyangchuwu/Zotero-Neo/actions/runs/34189504069
- Ubuntu job: passed
- Windows job: passed
- Release job: skipped as expected for a branch push
- Downloaded artifacts:
  - `zotero-neo-linux/zotero-neo.xpi`
  - `zotero-neo-windows/zotero-neo.xpi`
- Both archives contain 11 files and no Windows backslash paths.
- Text payload differences are CRLF versus LF checkout normalization only; normalized contents match. The Linux artifact remains the canonical release asset.

## Local Build Evidence

- Runtime bindings: 122
- Preference bindings: 122
- English action labels: 109
- Chinese action labels: 109
- Binding-sync result: OK
- Generated archive: `zotero-neo.xpi`
- Packaged `content/zoteroVim.js` contains the state-change-only logging guards.

## Result

`partial` — source behavior, Linux/Windows builds, CI artifacts, and release guards pass. Phase 0.1 still requires a Windows Zotero retest of idle logging and reader restoration before Phase 0 and Phase 0.1 can close.
