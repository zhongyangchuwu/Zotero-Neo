# Codebase Concerns

**Assessed:** 2026-09-08

## M0 verification blockers

1. **Zotero runtime unavailable.** Installation, startup, preference-pane behavior, coexistence, and baseline feature smoke tests require a host Zotero instance.
2. **Windows build unavailable.** `tools/build.ps1` is updated but cannot be executed without Windows PowerShell or `pwsh`.
3. **Release feed intentionally empty.** `updates.json` is collision-free but must receive a real release entry only after the matching asset is published.

## Input and focus risks

4. **Keyboard capture is load-bearing.** Main, reader.html, PDF.js, note editors, pickers, and Zotero's own `KeyboardManager` participate in one input path. New handlers must reuse the existing early editable guards.
5. **Private forwarding patches are required.** `_patchReaderKeyForwarding` and `_patchReaderTextAnnotationFocus` wrap private PdfView methods. Removing or bypassing them can reactivate Zotero shortcuts or break annotation input.
6. **IME-sensitive annotation editing.** `INSERT_MODE_DESIGN.md` documents prior focus loops, synthetic-event failures, and CJK input hazards. Tag, Spotlight, and which-key overlays must not reuse the annotation overlay blindly.
7. **Main numeric prefixes conflict with colored tags.** `content/zoteroVimMain.js` currently consumes item-list digits as counts, violating the PRD requirement to preserve Zotero's colored-tag shortcuts.

## API and state risks

8. **Private Zotero APIs vary by version.** Reader injection uses `_readers`, `_internalReader`, `_primaryView`, `_secondaryView`, `_iframeWindow`, and Zotero tab internals. Every new bridge needs feature detection and visible non-fatal fallback.
9. **Cross-compartment payloads must be cloned.** Objects and arrays passed into reader content require `Components.utils.cloneInto`; missed clones can fail silently behind catches.
10. **Reader-to-main delegation picks the first window.** `_delegateToMainWindow` does not resolve the reader's owning main window. Multi-window behavior remains uncertain and must not be widened casually.
11. **Tag write permissions are not centralized.** Existing mutations use `saveTx()`/`eraseTx()` but no shared read-only-library preflight exists. M4 must add one before batch writes.
12. **Batch mutation semantics are unproven.** The repository has single-item annotation and mark writes, not multi-item tag transactions or partial-failure reporting.

## Known inherited regressions

13. **ZV-004:** restored readers can appear unresponsive until PDF load completes; root cause remains unresolved.
14. **ZV-002:** note editor `o`/`O` can split trailing text in some DOM states.
15. **ZV-001:** collection `za`/`zo`/`zc` can move focus to the item list.
16. README describes an 800 ms reader-view sync interval, while source currently uses 250 ms.

## Verification limitations

17. There is no automated GUI test suite or CI configuration.
18. `build.sh` proves JavaScript syntax, binding-table synchronization, and XPI packaging only when Node is available.
19. `tools/check-sync.js` validates flat tables and labels; it does not prove dispatcher cases, runtime focus behavior, or optional integrations.
20. Zotero installation, restart, version compatibility, data mutation, input safety, and optional-plugin behavior require manual smoke testing.

## Planning consequences

- Finish M0 host verification before feature work.
- Keep M1 as a narrow native history bridge.
- Treat M2, M3, and M5 as input-regression-sensitive changes.
- Establish target resolution and write-safety boundaries before M4 picker UX.
- Use M6 to record observed manual evidence and inherited known failures; do not imply automation that does not exist.
