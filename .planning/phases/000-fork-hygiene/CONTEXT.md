# Phase 0 Context: Fork Hygiene

## Goal

Create a collision-free Zotero Neo installed identity and release artifact while preserving current behavior.

## Constraints

- No feature/keymap changes in this phase.
- Preserve plain-JavaScript Bootstrap architecture and script load order.
- Rename only collision-bearing public/global identity; do not mechanically rename private helpers.
- Keep AGPL-3.0 and explicit attribution to `ZorroStardust/zotero-vim-plus` and `finktank/zotero-vim`.
- Do not retain aliases, re-exports, old update links, or a live shared preference branch.
- Verify both runtime and preference-pane consumers of identity values.

## Decisions

- Extension ID: `zotero-neo@zotero-neo`.
- First Neo version: `0.1.0`.
- Global controller: `ZoteroNeo`.
- Preference root: `extensions.zotero-neo`.
- Preference pane/DOM ID: `zotero-neo-prefs`.
- Debug prefix: `[ZoteroNeo]`.
- Diagnostic log: `zotero-neo-startup.log`.
- Artifact: `zotero-neo.xpi`.
- Repository/update host: `zhongyangchuwu/Zotero-Neo`.
- New update feed is keyed by the Neo ID and remains empty until a corresponding release asset is published.
- No automatic migration from the upstream preference branch in v0.1 M0.

## Rejected Options

- Keeping the upstream extension ID or update URL: unsafe overwrite/update collision.
- Keeping the upstream preference root for compatibility: prevents reliable coexistence.
- Providing old global aliases: preserves namespace collision and weakens the clean cutover.
- Renaming every `_zv*`/private helper solely for branding: large mechanical risk with no installed-identity benefit.
- Combining M1 history or M2 keymap changes into M0: violates milestone isolation and makes regression attribution harder.

## Open Questions

- Final artwork can replace the existing generic PNGs later, but no upstream-branded asset should remain in the shipped XPI.
- A future explicit migration tool may import selected upstream settings, but it is not part of M0.

## Canonical References

- `Zotero Neo — Product Requirements Document.md` §§6, 24, 29–30.
- `.planning/codebase/CONCERNS.md` release blockers.
- `manifest.json`, `bootstrap.js`, `content/zoteroVim.js`, preference scripts, build scripts, update feed, README variants.

## Verification Expectations

- Build/check output plus XPI content inspection.
- Manual Zotero install/startup and preference-pane check.
- Confirm no upstream update/pref/global collision.
- Smoke existing main, reader, note, picker, annotation, and split behavior; do not claim full regression coverage from build alone.
