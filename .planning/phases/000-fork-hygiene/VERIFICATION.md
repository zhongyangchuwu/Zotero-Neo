# Phase 0 Verification

## Claims Checked

| Claim | Evidence | Status |
|---|---|---|
| Runtime uses `ZoteroNeo` and `[ZoteroNeo]` | AST/text searches plus successful syntax checks | Passed |
| Preferences and pane IDs are isolated | Source assertions for all three preference consumers and XHTML/runtime pane IDs | Passed statically |
| Manifest/update channel is Neo-owned | Parsed source and packaged manifest/update JSON | Passed statically |
| Both build scripts target `zotero-neo.xpi` | Source inspection; Unix build execution | Partial |
| XPI contains only intended source/assets | Python `zipfile` member-set comparison | Passed |
| Packaged files contain no collision-bearing upstream identity | Forbidden-token scan of every packaged text member | Passed |
| Localized documentation and lineage are correct | Required-string assertions for README variants and `AGENTS.md` | Passed |
| XPI installs, starts, and preserves baseline behavior | Requires Zotero runtime | Blocked |
| Upstream and Neo coexist without preference/update collision | Requires Zotero/upstream installation | Blocked |

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

## Coverage

### Passed

- JavaScript syntax
- Runtime/preferences binding synchronization
- Manifest/update JSON parsing
- Unix packaging
- Exact XPI payload
- Collision-string absence in packaged text
- Documentation identity and lineage
- Whitespace integrity

### Partial

- Windows builder: default output and packaging code inspected, but the script was not executed.
- Preference isolation: source wiring verified, persistence behavior not executed.

## Failed Checks

None.

## Skipped Checks

- `tools/build.ps1`: neither `pwsh` nor `powershell` is installed in WSL.
- Zotero install/startup: Zotero is not installed in WSL.
- GUI preference-pane and feature smoke tests: require a real Zotero host environment.

## Untested Claims

- Zotero accepts and displays the new installed identity.
- The preference pane opens repeatedly and persists Neo-only settings.
- Runtime logs use the new prefix/file in a real profile.
- Neo can coexist with the upstream add-on without overwriting settings or updates.
- Main navigation, PDF motions/search, Visual annotations, Insert/comment input, notes, pickers, tab cycling, and reader split retain baseline behavior.

## Gaps

The PRD Phase 0 acceptance criteria include installation, startup, and baseline runtime behavior. Static/package checks cannot prove those properties.

## Result

`blocked` — implementation and WSL-available verification passed; Windows PowerShell and Zotero runtime verification remain required before Phase 0 completion.
