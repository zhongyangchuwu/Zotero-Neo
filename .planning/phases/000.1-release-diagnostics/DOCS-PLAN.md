# Plan 000.1-02: Repository Documentation Hygiene

## Objective

Turn the repository root into a concise project landing surface, move detailed and localized documentation under `docs/`, remove stale inherited media, and align support/upstream wording without changing runtime behavior or the XPI payload.

## Files in Scope

- `README.md`
- `README.zh-CN.md`
- `README.es-ES.md`
- `BriefDemoVideo.gif`
- `FUTURE_FEATURES.md`
- `PENDING_ISSUES.md`
- `INSERT_MODE_DESIGN.md`
- `AGENTS.md`
- `CHANGELOG.md`
- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`
- `.planning/codebase/STRUCTURE.md`, `.planning/codebase/STACK.md`
- new `docs/` paths

`manifest.json`, `updates.json`, runtime source, packaged icons, and Git remotes are explicit non-goals.

## Implementation Sequence

### 1. Create the canonical document structure

Create:

```text
docs/
├── README.zh-CN.md
├── README.es-ES.md
├── USER_GUIDE.md
├── DEVELOPMENT.md
├── KNOWN_ISSUES.md
└── architecture/
    └── insert-mode-design.zh-CN.md
```

Do not create empty directories, placeholder documents, or a general documentation framework.

### 2. Reduce the root README to a landing page

Keep `README.md` focused on:

- product identity and one-sentence positioning;
- pre-release status: no public GitHub Release exists yet;
- latest-stable Zotero support policy;
- concise feature groups;
- source-build quick start;
- links to user guide, development guide, known issues, changelog, and localized landing pages;
- immediate-upstream attribution and AGPL license.

Move the complete mode descriptions, workflows, key tables, settings, and action reference to `docs/USER_GUIDE.md`. Move build internals, CI/release mechanics, repository tree, diagnostics, and architecture notes to `docs/DEVELOPMENT.md`.

Target a root README of roughly 150–250 lines. Do not advertise downloading from Releases until a release exists.

### 3. Move and narrow localized documents

- Move `README.zh-CN.md` to `docs/README.zh-CN.md`.
- Move `README.es-ES.md` to `docs/README.es-ES.md`.
- Convert both into translations of the concise landing page, not copies of the complete user/developer reference.
- Link to `USER_GUIDE.md` and `DEVELOPMENT.md` as canonical detailed English references.
- Correct all relative links for the new directory depth.

### 4. Consolidate maintainer documents

- Move only shelved/current issue material from `PENDING_ISSUES.md` into `docs/KNOWN_ISSUES.md`.
- Remove resolved issue narrative that merely duplicates Git history; preserve durable architectural conclusions in `docs/DEVELOPMENT.md` where needed.
- Move `INSERT_MODE_DESIGN.md` to `docs/architecture/insert-mode-design.zh-CN.md` without pretending it is an English document.
- Audit `FUTURE_FEATURES.md` against `.planning/ROADMAP.md`; migrate still-valid unique items into the deferred/future section, then remove the duplicate root backlog.

### 5. Remove stale inherited media

- Remove `BriefDemoVideo.gif` and all references to it.
- Do not replace it with a placeholder or archive copy.
- Defer a new `docs/assets/neo-demo.gif` until the theme and default keymap stabilize.

### 6. Align support and attribution language

Use the same policy in English, Chinese, contributor guidance, and current planning facts:

- officially support only the latest stable Zotero release at Neo release time;
- older Zotero versions are best-effort and outside the compatibility guarantee/test matrix;
- manifest install bounds are not an active support promise.

Use `ZorroStardust/zotero-vim-plus` as the immediate upstream. Keep `finktank/zotero-vim` only in the detailed historical attribution/license section. Do not change the current repository's Git `origin`.

### 7. Update references and release notes

- Update `AGENTS.md` key-file paths and compatibility policy.
- Update planning structure/stack facts and roadmap links.
- Add a changelog entry for documentation reorganization and clarified support policy.
- Update every relative link to moved documents; leave no stale root-path references.

### 8. Verify

- Run a local Markdown-link check over repository-relative links.
- Assert the root contains only the intended conventional documentation files.
- Search active docs for stale `README.zh-CN.md`, `README.es-ES.md`, `BriefDemoVideo.gif`, and broad `Zotero 7–10` support claims.
- Confirm historical Zotero-version evidence remains only where it describes an actual past investigation.
- Run `./build.sh` and confirm the packaged 11-file XPI payload is unchanged by documentation moves.
- Push and require both Ubuntu and Windows GitHub Actions jobs to pass.
- Inspect README rendering on the GitHub PR before merging.

## Commit Shape

1. `docs: reorganize repository documentation`
2. `docs: clarify compatibility and upstream attribution`

Keep file moves detectable as moves where practical; avoid mixing prose rewrites into the initial move commit unless a relative link must change with the move.

## Acceptance Criteria

- Only `README.md` remains as a localized landing file at repository root.
- Chinese and Spanish landing pages live under `docs/` and have valid navigation links.
- One canonical user guide and one canonical development guide own detailed content.
- `FUTURE_FEATURES.md`, `PENDING_ISSUES.md`, `INSERT_MODE_DESIGN.md`, and `BriefDemoVideo.gif` no longer clutter the root.
- No public-facing document promises Zotero 7–10 compatibility; latest stable Zotero is the only guaranteed target.
- Immediate upstream is Zotero Vim Plus; historical zotero-vim attribution remains preserved but secondary.
- No installation instruction claims that a public release currently exists.
- No stale relative links remain.
- Runtime source and XPI contents are unchanged.
