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
