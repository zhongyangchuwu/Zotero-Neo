# Phase 0 Verification

## Claims Checked

| Claim | Evidence | Status |
|---|---|---|
| Runtime uses `ZoteroNeo` and `[ZoteroNeo]` | AST/text searches plus successful syntax checks | Passed |
| Preferences and pane IDs are isolated | Source assertions for all three preference consumers and XHTML/runtime pane IDs | Passed statically |
| Manifest/update channel is Neo-owned | Parsed source and packaged manifest/update JSON | Passed statically |
| Both build scripts target and produce `zotero-neo.xpi` | Local Unix build plus successful Ubuntu/Windows GitHub Actions jobs | Passed |
| XPI contains only intended source/assets | Python `zipfile` member-set comparison | Passed |
| Packaged files contain no collision-bearing upstream identity | Forbidden-token scan of every packaged text member | Passed |
| Localized documentation and lineage are correct | Required-string assertions for README variants and `AGENTS.md` | Passed |
| XPI installs, starts, and preserves baseline behavior | User installed the WSL-built XPI and reported no functional problem in the initial smoke | Partial — broad matrix not recorded |
| Upstream and Neo coexist without preference/update collision | Requires side-by-side Zotero/upstream installation | Blocked |

## Evidence Observed

- `./build.sh` completed successfully.
- `node --check` passed for bootstrap and all six content/preference JavaScript files.
- `tools/check-sync.js` reported:
  - runtime bindings: 122
  - preference bindings: 122
  - English action labels: 109
  - Chinese action labels: 109
  - result: OK
- Generated archive: `zotero-neo.xpi`.
- Archive member set exactly matched the expected 11 files.
- Packaged manifest values:
  - name: `Zotero Neo`
  - version: `0.1.0`
  - both IDs: `zotero-neo@zotero-neo`
  - both update URLs: identical Neo repository URL
- `updates.json` parses as a new-ID feed with an empty updates list.
- Packaged forbidden-token scan returned no matches.
- `git diff --check` returned no errors.
- User runtime evidence: the WSL-built XPI installed and showed no functional problem in the initial smoke.
- User runtime observation: `zotero-neo-startup.log` contains steady-state `rescan ... newlyInjected=0` entries every approximately five seconds; Phase 0.1 identified and removed that producer.
- GitHub Actions run `34189504069` passed both Ubuntu `build.sh` and Windows `build.ps1` jobs and uploaded independently named XPI artifacts.

## Coverage

### Passed

- JavaScript syntax
- Runtime/preferences binding synchronization
- Manifest/update JSON parsing
- Unix packaging
- Windows packaging through GitHub Actions
- Exact XPI payload
- Collision-string absence in packaged text
- Documentation identity and lineage
- Whitespace integrity

### Partial

- Host smoke: installation/startup and ordinary use passed by user report, but the detailed main/reader/note/coexistence matrix was not recorded.
- Diagnostics: the supplied Windows log confirms periodic five-second steady-state rescan writes; the source fix passes a focused VM smoke but awaits host retest.

## Failed Checks

None.

## Skipped Checks

- Agent-driven GUI checks: this WSL session cannot directly operate the user's Zotero host.
- Post-fix idle logging and reader restoration: require installing the newly built XPI.
- Side-by-side upstream/Neo coexistence: not yet exercised.

## Untested Claims

- Zotero displays every expected installed-identity field.
- The preference pane persists Neo-only settings across restart.
- Neo can coexist with the upstream add-on without overwriting settings or updates.
- Main navigation, PDF motions/search, Visual annotations, Insert/comment input, notes, pickers, tab cycling, and reader split each pass a recorded regression matrix.
- Idle logging remains bounded after reader restoration and normal toolbar activity.

## Gaps

The broad user smoke and Windows CI resolve the previous installation/build blockers. Phase 0 still requires a post-fix Zotero logging/injection smoke and side-by-side coexistence evidence.

## Result

`blocked` — implementation, Linux/Windows packaging, CI artifacts, release guards, and initial user host smoke pass; install the new XPI and verify bounded idle logging plus reader restoration before Phase 0 completion.
