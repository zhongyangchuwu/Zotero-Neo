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

## Next

- Establish the v0.2 Library interaction substrate in
  [#55](https://github.com/zhongyangchuwu/Zotero-Neo/issues/55), following
  [INTERACTION_MODEL.md](INTERACTION_MODEL.md): separate View, Cursor, Selection,
  VisualTarget, and Scope; make Selection a session-scoped stable-item workset;
  preserve it across filtering/sorting; migrate Main Space to Toggle Selection;
  generalize Key Guide into a pending-prefix guide; then audit action target
  contracts before layering local find, filtering, ScopeSet, and batch triage
  operations.
- Track the batteries-included workflow/distribution direction and the first persistent Plugin
  Manager surface in [#49](https://github.com/zhongyangchuwu/Zotero-Neo/issues/49). The initial
  panel is a read-only keyboard-first view over Zotero/Mozilla AddonManager state. It is deliberately
  separate from the shared picker: pickers resolve transient targets, while managers keep a bounded
  domain context open for repeated browsing and future lifecycle actions. Remote catalogs and
  arbitrary GitHub XPI installation remain out of scope.
- Continue tracking native Zotero Reader semantic-selection integration in
  [#20](https://github.com/zhongyangchuwu/Zotero-Neo/issues/20). The current
  DOM-selection compatibility path remains acceptable until Zotero exposes or
  documents a supported semantic-selection seam.

- Extend the command palette where concrete workflows justify it, such as count
  forwarding, bounded arguments/history, or external action registration.
- Add richer tag-management operations only where Zotero exposes safe native
  transactions and the operation has clear keyboard workflow value.
- Consider keymap import/export after the default schema has stabilized in real
  use.
- Evaluate an optional Spotlight adapter only if it adds material value beyond
  Neo's existing item/note/tab target choosers, tag candidate flows, and Command Palette.
- Prefer native Reader/sidebar integration only where Zotero exposes a supported
  extension seam; keep Neo-owned overlays when private host behavior would make
  the integration fragile.

## Deferred ideas

Whole-document Flash indexing, advanced character motions, richer Select text
objects, repeat/macro support, a full Ex-style command line, and deeper
EPUB/snapshot parity are not 0.1.0 commitments.
