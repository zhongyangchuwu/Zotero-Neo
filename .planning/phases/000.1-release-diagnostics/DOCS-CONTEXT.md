# Repository Documentation Hygiene Context

## Scope

Reorganize documentation and non-runtime media without changing plugin behavior, packaging, keybindings, or release metadata.

## Current Inventory

| Root path | Current role | Finding |
|---|---|---|
| `README.md` | English landing page plus complete user/developer reference | Approximately 41.5 KB and 940+ lines; mixes product pitch, installation, every binding, settings, TODOs, repository layout, and architecture internals. |
| `README.zh-CN.md` | Full Chinese README copy | Approximately 35.8 KB; already differs materially from the English behavior descriptions. |
| `README.es-ES.md` | Full Spanish README copy | Approximately 40.5 KB; another manually synchronized full copy. |
| `BriefDemoVideo.gif` | Inline README demo | Approximately 5.9 MB, 800×327, 91.49 seconds, 944 frames; inherited from the immediate upstream repository and demonstrates legacy UI/behavior. |
| `FUTURE_FEATURES.md` | Legacy feature backlog | Overlaps the accepted `.planning/ROADMAP.md` and PRD-derived requirements. |
| `PENDING_ISSUES.md` | Resolved and shelved investigations | Valuable maintenance evidence, but the name and root placement do not match its mixed contents. |
| `INSERT_MODE_DESIGN.md` | Chinese insert-mode architecture record | Durable maintainer knowledge; not a root landing document and its language is not identified by the filename. |
| `CHANGELOG.md` | Release history | Conventional root file; keep. |
| `LICENSE` | License text | Conventional root file; keep. |
| `AGENTS.md` | Harness/contributor instructions | Must remain at repository root. |
| `manifest.json`, `updates.json`, `bootstrap.js`, `build.sh` | Runtime/build entry points | Must remain at root for packaging, update hosting, and contributor commands. |
| `icons/` | Packaged runtime icons | Must remain in its packaging path; not documentation media. |

## Packaging Boundary

Both builders package only `manifest.json`, `bootstrap.js`, `content/`, and `icons/`. Moving or deleting README media and maintainer documents cannot alter the XPI payload.

## Link Boundary

Current relative links to localized READMEs and `BriefDemoVideo.gif` occur in all three README files. Any move must update links from both the root README and localized documents, whose relative base changes after relocation.

## Document Layout Decision

Use `docs/`, not a root `i18n/` directory. In this repository, i18n already means runtime UI strings (`content/i18n.js`); human-readable project documentation is a separate concern.

Recommended first layout:

```text
README.md
docs/
├── README.zh-CN.md
├── README.es-ES.md
├── USER_GUIDE.md
├── DEVELOPMENT.md
├── KNOWN_ISSUES.md
├── architecture/
│   └── insert-mode-design.zh-CN.md
└── assets/
```

- Keep only the canonical English landing page at the repository root.
- Move the Chinese and Spanish landing pages to `docs/README.<locale>.md`; this is simpler than `docs/locales/<locale>/` while only two translated landing pages exist.
- If full translated documentation is added later, migrate then to `docs/locales/<locale>/`; do not create that nesting in advance.
- Keep one authoritative detailed user guide and developer guide in English. Localized landing pages link to those canonical references rather than duplicating 900+ lines that already drift between languages.
- Root language links become `docs/README.zh-CN.md` and `docs/README.es-ES.md`; localized links back to English use `../README.md`.

## Demo and Asset Decision

- Remove `BriefDemoVideo.gif` from the root README and repository. It is a 91-second, 5.9 MB asset inherited from `ZorroStardust/zotero-vim-plus`, so it is neither concise nor reliable evidence of Zotero Neo's final UI/keymap.
- Do not keep a hidden legacy copy under `docs/assets/`; the immediate upstream repository remains the historical source, and retaining the binary adds weight without maintaining current documentation.
- Add a Neo-owned replacement only after theme and default-keymap behavior stabilizes. Store it as `docs/assets/neo-demo.gif` or another GitHub-renderable image format.
- Replacement target: 8–15 seconds, at most about 2 MB, one focused workflow, current Neo branding/theme, no personal library data, and a public-domain or synthetic sample document.
- Until that replacement exists, the README should omit the demo rather than show stale media or a placeholder.
- Keep `icons/` unchanged because those files are runtime package assets, not documentation media.

## Compatibility Wording Decision

Official support means the latest stable Zotero release available when a Zotero Neo release is published.

Canonical English wording:

> Officially supported: the latest stable Zotero release. Older Zotero versions may continue to work, but they are not part of the compatibility guarantee or release test matrix.

Canonical Chinese wording:

> 官方支持范围：Zotero Neo 发布时的最新版稳定版 Zotero。旧版 Zotero 可能仍可运行，但不属于兼容性保证或发布测试范围。

Rules:

- Remove active `Zotero 7–10`, `Zotero 7/8/9/10`, and `Zotero 7+` support claims from README files, contributor guidance, and current planning facts.
- Do not rewrite historical issue/design evidence that accurately records behavior observed on Zotero 9.
- Keep the manifest install range separate from the support promise. `strict_min_version` / `strict_max_version` describe what Zotero may install; they do not claim that every accepted historical version is actively tested.
- Do not narrow the manifest to one exact Zotero version in this documentation-only cleanup. Revisit manifest bounds during each release preparation when the actual latest stable version is known and tested.
- CI packaging on Windows/Linux proves packaging only, not Zotero runtime compatibility. Runtime support claims require manual verification on the latest stable Zotero.

## Upstream and Attribution Decision

Use precise Git terminology:

- This repository's Git `origin` remains `zhongyangchuwu/Zotero-Neo`.
- The immediate upstream project is `ZorroStardust/zotero-vim-plus`.
- `finktank/zotero-vim` is historical lineage, not Zotero Neo's displayed origin/immediate upstream.

Recommended README header wording:

> Zotero Neo is an independently maintained fork of [Zotero Vim Plus](https://github.com/ZorroStardust/zotero-vim-plus).

Move detailed lineage to the License / Attribution section:

> Zotero Neo is derived from Zotero Vim Plus by ZorroStardust. Zotero Vim Plus includes work originating in [zotero-vim](https://codeberg.org/finktank/zotero-vim) by Alex Fink. Existing copyright notices and AGPL-3.0 obligations are preserved.

Remove the prominent `Original project` / `原始项目` / `Proyecto original` banner from localized and English README headers. Do not remove the historical `finktank/zotero-vim` attribution entirely.

Do not change Git remotes or invent a new individual author identity. Any future `manifest.json` author change requires an explicit maintainer-name decision.
