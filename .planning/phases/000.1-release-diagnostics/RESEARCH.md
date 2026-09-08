# Phase 0.1 Research: Release Automation and Startup Logging

## Question

How should Zotero Neo verify both build scripts, publish one canonical XPI, and stop steady-state startup-log growth?

## Sources Checked

- `build.sh`
- `tools/build.ps1`
- `bootstrap.js`
- `content/zoteroVim.js` `_onRenderToolbar`, `_rescanSelectedReader`, `_logRescan`
- `content/zoteroVimMain.js` reader scan timer
- GitHub Actions official documentation for hosted runners, artifacts, job handoff, token permissions, and tag-triggered releases
- User runtime observation and attached Windows log: the WSL-built XPI shows no functional problem, while `zotero-neo-startup.log` appends recurring rescan entries approximately every five seconds.

## Findings

### CI and release

- No `.github/` workflow currently exists.
- Both build scripts already run the same JavaScript syntax and binding-sync checks when Node is available.
- GitHub-hosted `ubuntu-latest` and `windows-latest` runners can execute the native build path for each platform.
- Build outputs should use separate workflow artifact names to avoid collisions, even though both contain `zotero-neo.xpi`.
- The Ubuntu-built XPI should be the single canonical GitHub Release asset; the Windows build is a compatibility gate, not a second public artifact.
- A release job should depend on both build jobs, download the canonical artifact, validate the tag against `manifest.json`, and receive `contents: write` only for release publication.
- `updates.json` should be populated in the release-preparation change before tagging; CI should validate its version and release URL instead of generating an uncommitted update feed after the tag.

### Startup logging

- `content/zoteroVimMain.js` runs `readerScanHandler` every 1000 ms.
- The supplied Windows log contains `rescan readers=<N> newlyInjected=0` every approximately 5.0–5.3 seconds, exactly matching `_lastRescanFileTS` throttling.
- `inject reader` entries occur only for genuinely new reader instances, so the evidence does not show reinjection churn.
- `renderToolbar` entries are event-driven and appear around new reader creation rather than on the recurring cadence.
- The root cause is steady-state logging inside `_rescanSelectedReader`: throttling reduced the original rate but still allowed unbounded idle growth.
- The correct fix is to keep periodic reader discovery while writing rescan diagnostics only when at least one reader is newly injected. Toolbar logging should likewise be conditional on initiating first-time injection.
- Timestamp resets in the supplied append-only file represent separate Zotero/plugin startups and are expected.
- The desired invariant is event-based diagnostics: startup, failures, first injection, and meaningful state transitions only. An idle Zotero session must not append periodic lines.

## Tradeoffs

- A Linux-only workflow is simpler but does not verify the Windows packaging implementation.
- Publishing both OS-built XPIs creates ambiguous release assets with the same product identity and no user benefit.
- Rate limiting periodic logs reduces volume but still creates unbounded growth; state-change-only logging removes the root maintenance cost.
- Deleting all file diagnostics would make restored-reader startup problems harder to investigate; retain sparse lifecycle and transition evidence.

## Confidence

- High: the supplied Windows log identifies the five-second rescan writer and rules out recurring reader injection in the observed sessions.
- High: current workflow absence, build-script behavior, scan cadence, and unthrottled toolbar logging.
- High: GitHub Actions can provide independent Ubuntu and Windows build gates and artifact-based release handoff.

## Primary References

- https://docs.github.com/en/actions/how-tos/manage-runners/github-hosted-runners/use-github-hosted-runners
- https://docs.github.com/en/actions/tutorials/store-and-share-data
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
