# Zotero Neo

Zotero Neo is an independently maintained, Neovim/LazyVim-inspired keyboard
interaction layer for Zotero's reader and main window.

> **Status:** Pre-release development. No public GitHub Release exists yet;
> build the XPI from source for development testing.

## Support

Officially supported: the latest stable Zotero release. Older Zotero versions
may continue to work, but they are not part of the compatibility guarantee or
release test matrix.

Zotero Neo targets macOS, Linux, and Windows. GitHub Actions validates XPI
packaging on Ubuntu and Windows; Zotero GUI behavior still requires manual
verification in the current stable host.

## Highlights

- Normal, Cursor, Visual, and Insert modes for PDF reading and annotation.
- Keyboard-first navigation for readers, collections, items, notes, tabs, and
  pickers.
- Vim-style marks, annotation navigation, highlighting, comment editing, and
  configurable bindings.
- Snapshot and EPUB navigation/search support where Zotero exposes compatible
  reader behavior.

## Build from source

```bash
git clone https://github.com/zhongyangchuwu/Zotero-Neo.git
cd Zotero-Neo
npm ci
./build.sh
```

The output is `zotero-neo.xpi`. On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

Install development builds in Zotero through **Tools → Plugins → Install Plugin
From File…** and restart when prompted.

## Documentation

- [User guide](docs/USER_GUIDE.md) — modes, bindings, workflows, and settings.
- [Development guide](docs/DEVELOPMENT.md) — architecture, build, CI, release,
  and debugging constraints.
- [Known issues](docs/KNOWN_ISSUES.md) — current shelved runtime issues.
- [Roadmap](docs/ROADMAP.md) — public project direction.
- [Changelog](CHANGELOG.md)

## Attribution and license

Zotero Neo is derived from [Zotero Vim Plus](https://github.com/ZorroStardust/zotero-vim-plus)
by ZorroStardust. Zotero Vim Plus includes earlier work from
[zotero-vim](https://codeberg.org/finktank/zotero-vim) by Alex Fink. Existing
copyright notices and AGPL-3.0 obligations are preserved.

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).
