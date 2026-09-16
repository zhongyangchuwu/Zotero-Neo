# Roadmap

Zotero Neo is an independent project in pre-release development. Shipped
behavior is documented in the [user guide](USER_GUIDE.md); current bugs and
host/API limitations are tracked in GitHub Issues.

## Before 0.1.0

The first public release should prioritize complete, useful keyboard-first
workflows over broad Vim feature parity.

- Finish safe native tag assignment/removal for selected library items and the
  active Reader/Note context, reusing Zotero item APIs and Neo's existing picker
  surfaces rather than introducing a second tag UI.
- Extend Flash text targeting to Unicode/CJK input and IME composition while
  keeping literal visible-text matching and the existing bounded target model.
- Complete a final default-keymap review and latest-stable Zotero host regression
  pass across Reader, Main, Note, split views, pickers, restart/restore, and
  preference persistence.
- Prepare the first release metadata and update feed, then validate clean install
  and upgrade behavior before tagging `v0.1.0`.
- Continue tracking native Zotero Reader semantic-selection integration in
  [#20](https://github.com/zhongyangchuwu/Zotero-Neo/issues/20). The current
  DOM-selection compatibility path remains acceptable until Zotero exposes or
  documents a supported semantic-selection seam; this does not block 0.1.0.

## After 0.1.0

- Extend the command palette where concrete workflows justify it, such as count
  forwarding, bounded arguments/history, or external action registration.
- Add richer tag-management operations only where Zotero exposes safe native
  transactions and the operation has clear keyboard workflow value.
- Consider keymap import/export after the default schema has stabilized in real
  use.
- Evaluate an optional Spotlight adapter only if it adds material value beyond
  Neo's existing all-items, collection, note, tab, tag, and command pickers.
- Prefer native Reader/sidebar integration only where Zotero exposes a supported
  extension seam; keep Neo-owned overlays when private host behavior would make
  the integration fragile.

## Deferred ideas

Whole-document Flash indexing, advanced character motions, richer Select text
objects, repeat/macro support, a full Ex-style command line, and deeper
EPUB/snapshot parity are not 0.1.0 commitments.
