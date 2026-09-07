# Phase 0 Research: Current Identity

## Question

Which current repository identifiers can collide with Zotero Vim Plus, and what must change before feature work?

## Findings

| Surface | Current evidence | Required state |
|---|---|---|
| Product name | `manifest.json` and preference pane say Zotero Vim Plus | Zotero Neo |
| Extension ID | Both manifest locations use `zotero-vim-plus@zotero-vim` | New stable Neo ID |
| Update channel | Manifest and `updates.json` point to upstream releases | Neo-owned feed with no upstream records |
| Artifact | Both build scripts emit `zoetero-vim-plus.xpi` | `zotero-neo.xpi` |
| Global | `bootstrap.js`/content scripts share `ZoteroVim` | `ZoteroNeo` |
| Preferences | Runtime/prefs/i18n use `extensions.zotero-vim@zotero-vim` | `extensions.zotero-neo` |
| Pane identity | `zotero-vim-plus-prefs` registration and `zotero-vim-prefs` markup | `zotero-neo-prefs` consistently |
| Diagnostics | `[ZoteroVim]` and `zv-startup.log` | `[ZoteroNeo]` and Neo log filename |
| Repository docs | README clone/install/build paths target upstream | Current Neo repository/artifact |
| Attribution | Original finktank lineage present; immediate Vim Plus lineage incomplete | State both lineage hops and AGPL |
| Icons | Active PNG names are generic; packaged SVG/legacy assets retain Vim identity | Ship only Neo/generic active assets |

## Baseline Evidence

`./build.sh` passed before planning:

- JavaScript syntax checks passed.
- Runtime bindings: 122.
- Preference bindings: 122.
- English action labels: 109.
- Chinese action labels: 109.
- Binding synchronization passed.
- Generated artifact: `zoetero-vim-plus.xpi`.

The build proves packaging and static synchronization only. Zotero installation and startup were not available as automated evidence.

## Risks

- Shared ID/update URL can replace Neo with upstream or upstream with Neo.
- Shared preference storage makes two add-ons influence each other's keymaps and settings.
- Partial rename can break script composition or preference-pane restoration.
- Updating only English documentation leaves localized installation instructions unsafe.
- Removing/renaming global symbols manually can miss cross-file references; use language-server references/rename when available.

## Confidence

- High: repository identity locations, build behavior, binding sync, and absence of a current Neo cutover.
- Medium: Zotero's exact coexistence/update UI behavior until manually installed.
