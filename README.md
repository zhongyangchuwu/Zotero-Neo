![Zotero Neo — Neovim-inspired keyboard layer for Zotero](assets/branding/zotero-neo-banner.png)

# Zotero Neo

Zotero Neo is a standalone, Neovim/LazyVim-inspired keyboard interaction layer
for Zotero's reader and main window.

> **Status:** v0.1.0 released on 2026-09-19. Download the packaged XPI from
> [GitHub Releases](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0).

## Support

Zotero Neo supports the **latest stable Zotero release only**. The current
v0.1.0 target is Zotero 10; older Zotero major versions are outside the install
and test contract.

Zotero Neo targets macOS, Linux, and Windows. GitHub Actions validates XPI
packaging on Ubuntu and Windows; Zotero GUI behavior still requires manual
verification in the current stable host.

## Major features

### Library and Main window

- Keyboard navigation across collections, saved searches, feeds, item lists, and
  tabs, including Vim-style `j/k`, `gg/G`, tree expansion/collapse, pane focus,
  PDF opening, tab switching/closing, trash, and restore.
- Independent Main **Cursor** plus an ephemeral session **Selection** workset keyed by stable
  item identities. `Space` toggles the item under Cursor and advances; `v` opens a transient
  Visual range whose `Space` commit adds/removes the whole range.
- Better BibTeX citekey copying when Better BibTeX is available.

### Reader navigation

- Reader **Normal, Select, and Insert** interaction states.
- Page turns, scrolling, half/full-page movement, zoom, horizontal pan, native
  reading history, annotation navigation, and Zotero Reader search.
- Horizontal/vertical split control and directional pane focus.
- Link hints for visible internal, citation, and external PDF links.
- Keyboard explorers for PDF outline and persisted marks.
- Snapshot and EPUB navigation/search where Zotero exposes compatible Reader
  behavior.

### PDF text selection and actions

- Flash-assisted visible-text targeting for Select start/end with literal
  Unicode matching, CJK/IME input, bounded hint rendering, and stable labels.
- Range refinement by character/word/sentence/paragraph/line motions plus
  endpoint swapping.
- Copy, search, coloured highlight, underline, annotation comment, and Selection
  Actions workflows.
- Optional Translate for Zotero selection integration through its public API.

### Search, Picker, and commands

- Shared fuzzy chooser for all-library items, current-collection items, notes,
  tabs, and action-specific tag candidates, backed by the pinned `fuzzysort` matcher.
- Command Palette in Reader, Main, and Note Normal contexts, with actions projected
  from the active resolved binding map.
- Browser/Gecko-owned text input and IME composition for chooser queries, tag
  candidates, and Flash instead of reconstructing text from keydown events.

### Tags

- Main uses direct `ta` / `tr` for Add/Remove Tag; Reader and Note keep
  `<Space>ta` / `<Space>tr`.
- Main-only `tf` toggles one tag in Zotero's native AND-filter state and `tc` clears active
  tag filters without opening a chooser.
- Tag actions reuse the shared target chooser instead of exposing a persistent
  tag-operation console. Add Tag may offer an explicit create candidate.
- Optional virtual tag-path refinement such as `method/...` is presentation-only;
  Zotero keeps ordinary flat tag strings as the authoritative data model.

### Notes

- Note search across normalized titles and note bodies with chooser-based opening.
- Keyboard Normal/Insert handoff and Vim-style editing inside Zotero note editors.
- Note chooser results resolve a note target only; note editing/lifecycle behavior
  is not hidden behind a provider-local Picker command grammar.

### Keymaps and appearance

- Configurable Reader/Main/Note bindings with multiple bindings per action,
  duplicate blocking, prefix warnings, persistent unbinding, and staged Apply.
- Pending-prefix Key Guide derived from the active resolved keymap; Reader/Note Space-leader
  sequences remain one supported prefix family.
- Auto, Light, and Dark appearance modes on Neo-owned surfaces.

## Install

1. Download [`zotero-neo.xpi`](https://github.com/zhongyangchuwu/Zotero-Neo/releases/download/v0.1.0/zotero-neo.xpi) from the v0.1.0 release.
2. In Zotero, open **Tools → Plugins**, click the gear menu, and choose **Install Plugin From File…**.
3. Select the downloaded XPI and restart Zotero when prompted.

See the [v0.1.0 release page](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0) for release notes and the packaged asset.

## Build from source

```bash
git clone https://github.com/zhongyangchuwu/Zotero-Neo.git
cd Zotero-Neo
npm ci
./tools/build.sh
```

The output is `zotero-neo.xpi`. On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

Install development builds in Zotero through **Tools → Plugins → Install Plugin
From File…** and restart when prompted.

## Documentation

- [User guide](docs/USER_GUIDE.md) — modes, bindings, workflows, and settings.
- [Architecture](docs/ARCHITECTURE.md) — interaction scopes, feature ownership,
  semantic actions, and Zotero host boundaries.
- [Selection and Tags](docs/TAGS.md) — Main Cursor/Selection targeting, explicit tag actions,
  filtering, and virtual tag-path semantics.
- [Input methods](docs/INPUT_METHODS.md) — Unicode/IME ownership and composition
  boundaries.
- [Development guide](docs/DEVELOPMENT.md) — build, CI, release, host seams, and
  debugging constraints.
- [Roadmap](docs/ROADMAP.md) — work planned before and after the first release.
- [Issue tracker](https://github.com/zhongyangchuwu/Zotero-Neo/issues) — current bugs and tracked host/API limitations.
- [Changelog](CHANGELOG.md)

## License and provenance

Zotero Neo is independently developed and is not maintained as an upstream-compatible
fork. Its history began from code in
[Zotero Vim Plus](https://github.com/ZorroStardust/zotero-vim-plus), which itself
incorporated work from [zotero-vim](https://codeberg.org/finktank/zotero-vim).
Historical copyright notices are preserved under the project license.

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).
