# Roadmap

Zotero Neo is in pre-release development. Direction may change before the first
public release; shipped behavior is documented in the [user guide](USER_GUIDE.md).

## Current delivery work

- Complete release hygiene: cross-platform XPI builds, guarded releases,
  bounded startup diagnostics, and latest-stable Zotero host verification.
- Make all Neo-owned panels follow Zotero with Auto, Light, and Dark appearance
  modes.
- Add native reader history through `Ctrl-o` / `Ctrl-i`.
- Review the complete LazyVim-inspired keymap before changing defaults.

## Planned capabilities

- Optional Spotlight adapter with native fallbacks.
- Safe native tag management for main, reader, and note contexts.
- Which-Key discovery overlay based on the accepted keymap.
- Native reader sidebar integration where Zotero/PDF.js focus behavior permits.

## Deferred ideas

Command-line mode, advanced character motions, richer Visual text objects,
repeat/macro support, keymap import/export, and deeper EPUB/snapshot parity are
not current release commitments.
