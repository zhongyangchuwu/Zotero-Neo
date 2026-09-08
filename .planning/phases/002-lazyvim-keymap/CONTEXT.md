# Phase 2 Context: LazyVim-Inspired Keymap

## Design Gate

Do not change the default keymap until the complete map and its conflict behavior have been reviewed as one system. This phase starts with a keymap design pass, not incremental remapping.

## Core Navigation Language

- `Ctrl-h/j/k/l`: move focus to the spatially adjacent Zotero pane, matching LazyVim window navigation.
- `H` / `L`: previous / next Zotero tab.
- `zh` / `zl`: horizontal PDF pan.
- `Ctrl-o` / `Ctrl-i`: reader location history, implemented in Phase 1 before this cutover.

## Pane Graphs

### Main window

Treat focus as a directional graph over visible panes:

- left: collection/library tree;
- center: item list;
- right: item details or note pane;
- vertical edges only when Zotero actually presents stacked panes.

### Reader

Treat visible reader surfaces as another directional graph:

- left: reader sidebar / outline;
- center: primary PDF view;
- right or below: split reader view;
- right: notes/context pane when present.

Direction is based on current geometry and visibility, not a fixed tab order. At a boundary, stay in place; do not wrap to the opposite side.

## Input Precedence

- Native text input and note Insert mode keep normal editing behavior.
- Picker-local `Ctrl-j/k` navigation wins while the picker owns focus.
- Modal/explorer-local keys win while that surface is active.
- Neo pane navigation only consumes a key after finding a valid target; otherwise Zotero/native behavior remains available when safe.
- Escape and focus-return behavior must be explicit for every temporary panel.

## Conflict Rules

- Moving `H/L` to tab navigation requires removing the old horizontal-pan bindings; there will be no compatibility aliases.
- `zh/zl` become the only default horizontal-pan bindings.
- Existing `Ctrl-h/j/k/l` reader split actions must be generalized rather than duplicated through a second dispatcher path.
- Main-window bindings and reader-forwarded bindings must resolve to the same directional intent.
- The preference binding table, action labels, Which-Key metadata, and dispatcher callsites change together.

## Review Deliverable Before Coding

Produce one table containing:

- context/mode;
- key sequence;
- action;
- current binding;
- proposed binding;
- conflict and precedence notes;
- behavior when the target pane is absent.

The user reviews that table before Phase 2 implementation. Phase 5 Which-Key consumes the accepted map; it does not define or reinterpret the map later.
