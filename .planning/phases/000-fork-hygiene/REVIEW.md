# Phase 0 Review

## Scope Reviewed

The identity cutover across runtime globals, diagnostics, manifest/update metadata, preference isolation, preference-pane IDs, build outputs, packaged assets, localized documentation, and planning records.

## Findings

1. **Fixed during review:** Four reader debug literals containing embedded quotation marks were not matched by the first exact-literal codemod and still used `[ZoteroVim]`.
2. **Fixed during review:** Chinese and Spanish architecture notes still described the old 800 ms reader-view synchronization interval; source uses 250 ms.
3. **No remaining blocking static finding:** Repository and packaged-source searches found no collision-bearing upstream ID, preference root, update host, global, debug prefix, XPI name, pane ID, or log filename in active source.
4. **Accepted limitation:** The update feed is intentionally empty until a real `0.1.0` release asset exists.

## Fixes Applied

- Updated the four remaining reader debug literals to `[ZoteroNeo]`.
- Corrected localized reader-view synchronization documentation to 250 ms.
- Normalized manifest attribution spacing while retaining upstream authors.
- Removed unreferenced legacy icon files after confirming no active code reference.

## Waivers

- No automatic migration from `extensions.zotero-vim@zotero-vim`; this is an intentional clean-cutover decision.
- No old `ZoteroVim` alias; preserving it would retain a namespace collision.
- No GUI automated tests; the repository has no such harness.
- Windows and Zotero runtime verification are not waived for completion; they remain blockers.

## Remaining Risks

- Zotero may reject or expose an unexpected behavior for the new manifest/update identity until installed.
- Preference-pane registration and isolated preference persistence are unobserved at runtime.
- Removing legacy icon assets is statically safe but not proven in a Zotero installation.
- Baseline main, reader, note, picker, annotation, and split behavior is unobserved after the global rename.
- Phase is ready for host/manual verification, not release or M1 execution.
