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

The v0.2 Library substrate and its first end-to-end workflows are implemented.
The immediate work is consolidation, runtime acceptance, and safety rather than
adding another broad interaction layer.

1. **Finish the Settings/i18n integration** tracked by
   [#89](https://github.com/zhongyangchuwu/Zotero-Neo/issues/89),
   [#90](https://github.com/zhongyangchuwu/Zotero-Neo/issues/90), and
   [#91](https://github.com/zhongyangchuwu/Zotero-Neo/issues/91): merge the
   Neo Settings Center, custom interaction themes, launcher-only legacy
   Preferences bridge, and shared application-level locale catalogs; then run a
   dedicated-profile Zotero GUI smoke before closing the issues.
2. **Complete consolidated v0.2 runtime acceptance** for
   [#55](https://github.com/zhongyangchuwu/Zotero-Neo/issues/55) together with
   the Main -> Reader return-context loop (#84) and Reader selection -> existing
   note capture loop (#87). Automated tests cover state and target semantics; the
   remaining gate is real Zotero focus, native-tree projection, cross-context
   navigation, and note-mutation behavior.
3. **Make destructive action targets explicit** in
   [#88](https://github.com/zhongyangchuwu/Zotero-Neo/issues/88). Start with
   Trash as the first complete example: when Cursor sits outside a persistent
   Selection, require an explicit Cursor/Selection choice and surface hidden
   target counts. Keep this as a narrow action-target seam rather than a generic
   project-wide Target framework.
4. Keep the batteries-included workflow direction in
   [#49](https://github.com/zhongyangchuwu/Zotero-Neo/issues/49). Plugin Manager
   phases 1-3, Library Triage collection/citekey workflows, Research Reading,
   and the first Knowledge Capture loop are complete. After the acceptance and
   safety work above, choose the next concrete workflow from observed use rather
   than pre-building abstractions.
5. Continue tracking native Zotero Reader semantic-selection integration in
   [#20](https://github.com/zhongyangchuwu/Zotero-Neo/issues/20). The current
   DOM-selection compatibility path remains acceptable until Zotero exposes or
   documents a supported semantic-selection seam.

Longer-term candidates remain command-palette arguments/history, richer safe
tag operations, keymap import/export after the schema stabilizes in real use,
and an optional Spotlight adapter only if it adds material value beyond Neo's
existing pickers and Command Palette. Prefer native Reader/sidebar integration
only where Zotero exposes a supported extension seam.

## Deferred ideas

Whole-document Flash indexing, advanced character motions, richer Select text
objects, repeat/macro support, a full Ex-style command line, and deeper
EPUB/snapshot parity are not 0.1.0 commitments.
