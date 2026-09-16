![Zotero Neo — Neovim-inspired keyboard layer for Zotero](assets/branding/zotero-neo-banner.png)

# Zotero Neo

Zotero Neo is a standalone, Neovim/LazyVim-inspired keyboard interaction layer
for Zotero's reader and main window.

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

- Normal, Select (Visual), and Insert modes, with Flash-assisted PDF text selection and actions.
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
- [Development guide](docs/DEVELOPMENT.md) — architecture, build, CI, release,
  and debugging constraints.
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
