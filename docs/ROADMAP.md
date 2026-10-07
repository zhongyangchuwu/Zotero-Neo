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

The unified navigation history and document-bottom Reader `G` are implemented
and owner-accepted in
[#113](https://github.com/zhongyangchuwu/Zotero-Neo/pull/113), pending integration.
Do not reimplement Back/Forward or assign their defaults again; the
[command reference](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist)
owns the accepted behavior.

## Next

Prioritize integration, real-host mutation acceptance, and narrow ownership work
before adding another broad interaction layer.

1. **Integrate accepted navigation** through
   [#112](https://github.com/zhongyangchuwu/Zotero-Neo/issues/112) / PR #113.
   Merge only an authorized, verified head; verify the resulting `main` checkpoint
   before closing #112 and completing the navigation integration entries in #98.
   Navigation acceptance does not close unrelated mutation gates.
2. **Complete destructive-target GUI acceptance** in
   [#88](https://github.com/zhongyangchuwu/Zotero-Neo/issues/88).
   The safety implementation is already merged. Exercise actual target kind/count,
   native multi-selection, hidden persistent-Selection refusal, and cancellation
   without changing Selection or Trash history; verify Reader annotation deletion
   confirms exactly one target. Use disposable test data. Do not revive the
   superseded default Cursor-versus-Selection chooser proposal.
3. **Complete existing-note capture GUI acceptance** in
   [#85](https://github.com/zhongyangchuwu/Zotero-Neo/issues/85).
   The Reader snapshot -> Notes picker -> native note append path is implemented.
   Verify preserved note HTML, immutable text/page capture, same-library targets,
   stale/deleted/wrong-library refusal, cancel/no mutation, and Reader focus return
   on current Zotero. The historical PR #87 acceptance checklist is not proof that
   those GUI scenarios passed; do not reimplement the feature from an open issue.
4. **Take the next bounded architecture slice** from #98 Phase 9.1:
   prove Annotation Comment Editor feature-input ownership and explicitly settle
   save/cancel/newline semantics. Retain `reader-insert` until its replacement,
   existing behavior, and preference/keybinding migration are independently proven.
   Revisit other Reader overlays or Knowledge Capture only after that ownership is
   stable, not as a broad rewrite bundled with this slice.

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
