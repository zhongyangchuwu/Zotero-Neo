![Zotero Neo — Neovim-inspired keyboard layer for Zotero](assets/branding/zotero-neo-banner.png)

# Zotero Neo

Zotero Neo is an independent, Neovim-inspired keyboard interaction layer for
Zotero's main window and Reader. It works with Zotero's native library, PDF
reader, and note editor rather than replacing them.

> **Public release:** v0.1.0, released 2026-09-19. The only public XPI is the
> [v0.1.0 release download](https://github.com/zhongyangchuwu/Zotero-Neo/releases/download/v0.1.0/zotero-neo.xpi).
> The current source tree documents unreleased v0.2 work; it is not the public
> package, even where the source manifest still reports `0.1.0`.

Zotero Neo supports the latest stable Zotero release only (currently Zotero 10).
The current source and website work do not change the XPI runtime, update feed,
or public release. Physical OS-IME, clipboard, and native Outline acceptance
remains incomplete; see the [acceptance record](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137).

## Official documentation

- [Documentation homepage](index.md) — Chinese project overview and official site navigation source.
- [Getting started](docs/GETTING_STARTED.md) — install the published v0.1.0 XPI,
  first use, and the boundary between public release and current source.
- [User guide](docs/USER_GUIDE.md) — current-source workflows, modes, and settings.
- [Command reference](docs/COMMAND_REFERENCE.md) — the single complete current-source
  ActionId, default-key, context, and temporary-surface reference.
- [Interaction model](docs/INTERACTION_MODEL.md) — scopes, targets, and action ownership.
- [Selection and tags](docs/TAGS.md) — Main Selection/Visual and tag-action semantics.
- [Input methods](docs/INPUT_METHODS.md) — native text input, Unicode, and IME boundaries.
- [Architecture](docs/ARCHITECTURE.md) and [navigation history design](docs/NAVIGATION_HISTORY_DESIGN.md)
  — implementation ownership and host boundaries.
- [Development guide](docs/DEVELOPMENT.md) — extension build and the independent
  documentation-site workflow.
- [Roadmap](docs/ROADMAP.md), [v0.2 acceptance protocol](docs/V0_2_ACCEPTANCE.md),
  and [recording guide](docs/RECORDING_GUIDE.md) — unreleased-source status and
  truthful acceptance/recording boundaries.

The documentation links above describe one current source edition. The user guide
and command reference do not retroactively redefine the released v0.1.0 package;
use the [v0.1.0 release notes](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0)
for that release's exact behavior. No deployed documentation URL is claimed here.

## Support and issue tracking

- Supported host: latest stable Zotero only; older Zotero major versions are out
  of scope.
- [GitHub Releases](https://github.com/zhongyangchuwu/Zotero-Neo/releases) contains
  public packages. Do not use an unreleased source build as a public update.
- [Issue tracker](https://github.com/zhongyangchuwu/Zotero-Neo/issues) tracks bugs, host/API limitations, and acceptance work.
- [Source repository](https://github.com/zhongyangchuwu/Zotero-Neo) — runtime source, releases, and issues.

## Provenance and license

Zotero Neo is independently developed and is not maintained as an
upstream-compatible fork. Its history began from code in
[Zotero Vim Plus](https://github.com/ZorroStardust/zotero-vim-plus), which itself
incorporated work from [zotero-vim](https://codeberg.org/finktank/zotero-vim).
Historical copyright notices are preserved under the project license.

[GNU Affero General Public License v3.0](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/LICENSE) (AGPL-3.0).
