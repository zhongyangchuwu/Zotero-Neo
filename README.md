![Zotero Neo — Neovim-inspired keyboard layer for Zotero](assets/branding/zotero-neo-banner.png)

# Zotero Neo

Zotero Neo adds keyboard controls to Zotero's Library, PDF Reader, and note editor.
Use it to find papers, select PDF text, make annotations, and collect passages in
existing notes.

The public release is [v0.1.0](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0).
The current source builds v0.2.0, which is unreleased.

## Support

Neo supports the latest stable Zotero release on macOS, Linux, and Windows.
Package compatibility is specified by the release manifest.

## Features

- Browse libraries and collections, keep a Selection workset, and apply tags or
  collection membership to a group of papers.
- Navigate PDF pages, headings, figures, tables, links, and bookmarks; compare
  positions in split views.
- Select visible PDF text with Flash, refine the range, and copy, highlight,
  underline, or comment on it.
- Find existing notes, preview a capture destination, and append PDF passages;
  use Vim-style controls to edit notes.
- Find items, notes, and tabs with shared choosers; use the Command Palette and
  Back/Forward history across the Library, Reader, and notes.
- Customize shortcuts, interaction themes, and language; inspect installed
  plugins and open their registered settings.

## Install

1. Download [`zotero-neo.xpi`](https://github.com/zhongyangchuwu/Zotero-Neo/releases/download/v0.1.0/zotero-neo.xpi) from the v0.1.0 release.
2. In Zotero, open **Tools → Plugins**, click the gear menu, and choose **Install Plugin From File…**.
3. Select the downloaded XPI and restart Zotero when prompted.

See the [v0.1.0 release page](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0) for release notes and the packaged asset.

## Build from source

Use Node.js 24 and npm. After cloning, run `npm ci` from the project root before building.

```bash
git clone https://github.com/zhongyangchuwu/Zotero-Neo.git
cd Zotero-Neo
npm ci
./tools/build.sh
```

The output is `zotero-neo.xpi`.

See the [Development guide](docs/DEVELOPMENT.md) for hot reload and tests.

On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

Install development builds in Zotero through **Tools → Plugins → Install Plugin
From File…** and restart when prompted.

## Documentation

- [User guide](docs/USER_GUIDE.md) — reading, annotation, note, and Library workflows.
- [Command reference](docs/COMMAND_REFERENCE.md) — actions, default keys, contexts,
  counts, and target behavior.
- [Selection and tags](docs/TAGS.md) — worksets, tag changes, and View filtering.
- [Development guide](docs/DEVELOPMENT.md) — build, local iteration, and tests.
- [Architecture](docs/ARCHITECTURE.md) and [interaction model](docs/INTERACTION_MODEL.md)
  — technical responsibilities and design decisions.
- [Changelog](CHANGELOG.md), [roadmap](docs/ROADMAP.md), and
  [issue tracker](https://github.com/zhongyangchuwu/Zotero-Neo/issues).

## License and provenance

The project began with code from
[Zotero Vim Plus](https://github.com/ZorroStardust/zotero-vim-plus), which incorporated
work from [zotero-vim](https://codeberg.org/finktank/zotero-vim).
Historical copyright notices are preserved under the project license.

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

The XPI includes the complete project license at `LICENSE` and the bundled
fuzzysort MIT notice at `licenses/fuzzysort-LICENSE`. Published binaries correspond
to the source available from the same release tag.
