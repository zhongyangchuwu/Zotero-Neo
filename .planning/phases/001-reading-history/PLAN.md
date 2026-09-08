# Phase 1 Plan: Reading History

## Objective

Expose Zotero's native reader location history through Normal-mode `Ctrl-o` and `Ctrl-i` without adding a custom jump stack or changing input behavior.

## Implementation Sequence

1. **Verify native history seams**
   - Inspect Zotero 7/8/9/10 reader objects and source for back/forward history methods and availability state.
   - Prefer an existing public or stable internal command over simulating toolbar clicks.
   - Record fallbacks only when they represent the same host-owned history.

2. **Add synchronized actions**
   - Add `historyBack` and `historyForward` actions to runtime defaults and preference defaults.
   - Add English and Chinese action labels.
   - Route both actions through the existing reader dispatcher and binding-sync checker.

3. **Implement guarded invocation**
   - Resolve the active reader and call its native history method.
   - Treat empty history as a safe no-op.
   - Show `History unavailable` for missing/incompatible APIs and log unexpected failures with `[ZoteroNeo]`.
   - Do not add reader history state to `_readerState`.

4. **Preserve input and forwarding behavior**
   - Confirm Insert mode and editable elements retain native `Ctrl-o`/`Ctrl-i` behavior.
   - Ensure successfully consumed reader keys are not forwarded back to Zotero.
   - Keep picker/explorer/modal precedence unchanged.

5. **Verify the actual surface**
   - Run `./build.sh` and the Phase 0.1 CI jobs.
   - In Zotero, follow a reader link, press `Ctrl-o`, then `Ctrl-i`.
   - Exercise empty history, reader reload, two reader tabs with different histories, Insert mode, and a focused editable field.

## Acceptance Criteria

- Back and forward traverse Zotero's native location history after a reader jump.
- Empty or unavailable history never causes an uncaught error.
- Multiple reader tabs retain independent host-owned history behavior.
- Insert mode and editable inputs are unchanged.
- Runtime/preference binding counts and English/Chinese labels remain synchronized.
