# Roadmap

Zotero Neo is an independent project. The first public release, **v0.1.0**, was
published on 2026-09-19. Shipped behavior is documented in the
[user guide](USER_GUIDE.md); current bugs and host/API limitations are tracked
in GitHub Issues.

## v0.1.0

The first public release established the keyboard-first interaction model before
broader Vim feature parity.

Completed release gates:

- Item-tag assignment/removal is implemented through Main Item Select plus
  explicit [Tag actions](TAGS.md), using Zotero-native selection, item APIs, and
  batched transactions; Main-only `tf/tc` own view filtering (#22, #39).
- Flash, chooser/tag candidate inputs, and Note editing support Unicode/CJK and
  browser-owned IME composition on the current Zotero host (#23).
- Shared fuzzy matching uses the pinned `fuzzysort` adapter rather than a local
  ad-hoc scorer (#26).
- Pre-release interaction architecture is unified across Main Item Select and Note, while Reader
  orchestration has explicit host-key, PDF-view lifecycle, navigation, and Select-range owners
  (#29).
- The default 0.1.0 keymap is frozen with an automated no-exact-prefix-ambiguity guard; Reader
  annotation copy uses `y` / `Y` without timeout ambiguity (#24).

The v0.1.0 release gate (#24), update metadata, dual-platform build, and public
GitHub Release are complete.

## Current v0.2 work

The Library substrate and its first workflows are implemented. Settings, custom
interaction themes, and shared i18n were merged in
[#93](https://github.com/zhongyangchuwu/Zotero-Neo/pull/93); #89/#90/#91 are complete.
Issue #55 is closed as historical Library-substrate evidence, not the current
acceptance backlog. Current interaction ownership is defined by
[the interaction model](INTERACTION_MODEL.md) and
[#98](https://github.com/zhongyangchuwu/Zotero-Neo/issues/98).

The unified navigation history and document-bottom Reader `G` are implemented,
owner-accepted, and merged through
[#113](https://github.com/zhongyangchuwu/Zotero-Neo/pull/113).
The resulting `main` checkpoint passed CI and #112 is complete. Do not reimplement
Back/Forward or assign their defaults again; the
[command reference](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist)
owns the accepted behavior.

Existing-note capture is host-accepted and
[#85](https://github.com/zhongyangchuwu/Zotero-Neo/issues/85) is complete.
Disposable-data acceptance covered preserved HTML, immutable text/page snapshots,
child and other same-library notes, stale-target refusal, wrong-library exclusion,
cancel/no mutation, Reader focus return, and the separate annotation-comment action.

Destructive-target safety is host-accepted and
[#88](https://github.com/zhongyangchuwu/Zotero-Neo/issues/88) is complete.
Real confirmation messages and native buttons proved Cursor, persistent Selection,
and Zotero multi-selection targets; hidden-member refusal; cancellation preserving
Selection and prior Trash undo; and exactly-one permanent Reader annotation deletion.

Annotation Comment Editor input ownership is implemented and host-verified for
[#98 Phase 9.1](https://github.com/zhongyangchuwu/Zotero-Neo/issues/98), merged through
[#114](https://github.com/zhongyangchuwu/Zotero-Neo/pull/114). The resulting `main`
checkpoint passed CI. Pending and mounted input belong to the captured PDF view,
not a writable Reader mode flag.
Enter newline, ordinary Escape save/close, two-second autosave, IME ownership,
split-view isolation, native editable handoff, target snapshot, and close/reopen are
preserved. `reader-insert` and its preference/native-pass-through compatibility remain.

The separately observed mixed-generation Reader lifecycle gap
[#115](https://github.com/zhongyangchuwu/Zotero-Neo/issues/115) is resolved through
[PR #116](https://github.com/zhongyangchuwu/Zotero-Neo/pull/116), merged at `0c9833f`;
merged-main CI passed. Callback-identity unregistration and closed Reader/split-view
dead-wrapper teardown were repaired. Final Zotero 10.0.6 disposable-data acceptance
covered three same-root reloads, three different-root replacements, existing/reopened
Reader input, split/native handoff, disable/enable, and separate persistent XPI
install/update/restart.

For Phase 9.2, the owner selected the existing Enter-newline / Escape-save-close /
two-second-autosave contract. There is no cancel or alternate autosave/key policy.
The one **Annotation comment editing** entry switch remains backed by
`mode.insert.enabled`; Off retains bare Insert native pass-through. The current
User Guide, Command Reference, and Development Guide define these boundaries.

## Next

Prioritize narrow feature-input ownership before adding another broad interaction layer.

1. **Execute Phase 5.7 only through an independently approved compatibility migration.**
   Feature input ownership and the save/newline contract are settled; retiring
   `reader-insert` still requires preserving stored bindings, explicit unbindings,
   disabled-preference native-input intent, Settings, and exact input contexts.
   Do not silently discard configuration or leave runtime aliases. The Phase 9.2
   contract freeze does not authorize or implement this cutover.
2. **Keep physical OS IME acceptance explicit.** Trusted Gecko composition and
   composition-aware key contracts do not prove candidate-window selection on the
   operating system.
3. **Keep Phase 9.3 overlay review and Phase 9.4 Knowledge Capture separate.** Do not
   expand either workflow as a side effect of editor preference/binding migration.

Keep
[#49](https://github.com/zhongyangchuwu/Zotero-Neo/issues/49)
as the batteries-included workflow direction: Plugin Manager phases 1–3 are
accepted, and the next workflow should come from observed use after safety and
acceptance, not speculative provider/manager abstractions. Track
[#20](https://github.com/zhongyangchuwu/Zotero-Neo/issues/20)
for a supported Zotero semantic-selection seam; retain the current DOM
compatibility path until that external prerequisite exists.

## Release gate

The published release and manifest/package/update-feed versions remain v0.1.0;
the current v0.2 source work is not a published release. Before another release:

- complete the selected current-host acceptance and integration gates;
- verify packaged install/update behavior separately from RDP temporary loading,
  including binding/preference migration and single runtime ownership;
- prepare matching manifest/package version, update-feed asset entry, release
  notes, and installation links before tagging; use `tools/check-release.mjs`;
- describe actual CI coverage: the current workflow verifies/packages on Ubuntu.
  Do not claim Windows CI coverage without restoring that job and observing it pass.

Longer-term candidates remain command-palette arguments/history, richer safe
tag operations, keymap import/export after the schema stabilizes in real use,
and an optional Spotlight adapter only if it adds material value beyond Neo's
existing pickers and Command Palette. Prefer native Reader/sidebar integration
only where Zotero exposes a supported extension seam.

## Deferred ideas

Whole-document Flash indexing, advanced character motions, richer Select text
objects, repeat/macro support, a full Ex-style command line, and deeper
EPUB/snapshot parity are not 0.1.0 commitments.
