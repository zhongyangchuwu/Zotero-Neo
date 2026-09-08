# Phase 0.1 Context: Release Automation and Diagnostics

## Position

The Zotero Neo identity cutover is implemented and the WSL build passes. The user installed the WSL-built XPI and reported no functional problem. M0 remains open for two engineering issues:

- the native Windows PowerShell build path has not been exercised;
- `zotero-neo-startup.log` appears to append a line approximately every second.

## Decision

Close these as one M0 follow-through phase before adding product behavior.

Use two atomic implementation commits inside the phase:

1. startup diagnostic behavior;
2. GitHub Actions build/release automation.

## CI Contract

- Pull requests and pushes run independent Ubuntu and Windows jobs.
- Ubuntu runs `./build.sh`; Windows runs `tools/build.ps1` under PowerShell.
- Each job uploads its XPI under a distinct workflow artifact name.
- Both jobs are required before release publication.
- The Ubuntu-built `zotero-neo.xpi` is the single canonical GitHub Release asset.
- A `v<manifest-version>` tag triggers release publication only after version and update-feed validation.
- Only the release job receives `contents: write`; build jobs remain read-only.
- `updates.json` is prepared in the release change before the tag rather than mutated after tagging.

## Logging Contract

- The startup log records startup, failures, first reader injection, and meaningful state transitions.
- An idle Zotero session does not append periodic steady-state lines.
- A rate limit is not sufficient if it still permits unbounded idle growth.
- If repeated entries show reader reinjection, repair reader lifecycle state instead of suppressing the evidence.

## Completion Gate

Phase 0 and Phase 0.1 close together when:

- Ubuntu and Windows Actions jobs pass;
- a CI artifact is downloadable;
- release workflow structure is validated without publishing an unintended release;
- the actual repeated log line is identified and fixed at its producer;
- a user runtime smoke confirms idle logging no longer grows periodically;
- the Phase 0 verification record contains the user's completed smoke evidence and remaining untested boundaries, if any.
