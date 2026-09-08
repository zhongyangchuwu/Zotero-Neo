# Phase 0.1 Plan: Release Automation and Diagnostics

## Objective

Close M0 with Windows-native build evidence, reusable XPI artifacts, tag-based release automation, and event-based startup diagnostics.

## Implementation Sequence

1. **Classify the repeated log line**
   - Capture several consecutive lines from `zotero-neo-startup.log` while Zotero is idle.
   - Map the repeating prefix to `_onRenderToolbar`, `_rescanSelectedReader`, `_waitAndInject`, or preferences initialization.
   - If the line is `inject reader`, inspect cleanup/state churn before changing logging.

2. **Remove steady-state file writes**
   - Log `renderToolbar` only when it initiates first-time reader injection.
   - Log a rescan only when it discovers and starts injection for at least one reader.
   - Remove obsolete timestamp/throttle fields once no periodic logging remains.
   - Retain failure and annotation-save diagnostics.

3. **Add cross-platform CI**
   - Add a workflow for pull requests, pushes, and manual dispatch.
   - Ubuntu job: checkout, pin a supported Node LTS, run `./build.sh`, upload `zotero-neo.xpi` as `zotero-neo-linux`.
   - Windows job: checkout, pin the same Node LTS, run `tools/build.ps1` under `pwsh`, upload `zotero-neo.xpi` as `zotero-neo-windows`.
   - Keep jobs independent so a platform-specific failure is visible.

4. **Add release publication**
   - Trigger on version tags matching `v*`.
   - Validate that the tag equals `v` plus `manifest.json` version.
   - Validate the release entry in `updates.json` before publication.
   - Require both platform jobs.
   - Download the Linux artifact and attach exactly one file named `zotero-neo.xpi` to the GitHub Release.
   - Scope `contents: write` to the release job.

5. **Verify and close M0**
   - Run the WSL build locally after source changes.
   - Push the branch and observe both Actions jobs.
   - Download and inspect the uploaded artifacts.
   - Exercise an idle Zotero reader session and confirm no periodic file growth after initial injection.
   - Update Phase 0 verification and project state with exact evidence.

## Acceptance Criteria

- Linux and Windows packaging paths both pass in GitHub Actions.
- Every CI run exposes independently named XPI artifacts.
- A release tag cannot publish when version/update metadata is inconsistent.
- A valid tag publishes one canonical `zotero-neo.xpi`.
- Idle readers create no recurring startup-log entries.
- Reader restoration/injection still works after logging changes.
- Phase 0 verification no longer claims that Zotero host smoke was unavailable.
