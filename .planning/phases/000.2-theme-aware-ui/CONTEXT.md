# Phase 0.2 Context: Theme-Aware UI

## Problem

Zotero Neo's custom surfaces are inconsistent with the host application:

- The preferences pane has light defaults but switches to dark through `prefers-color-scheme`, which follows the environment rather than a verified Zotero theme state.
- Runtime panels such as the fuzzy picker and outline explorer use hard-coded dark Catppuccin-style colors.
- Users cannot explicitly choose Light or Dark when automatic detection is wrong.

## Product Decision

Theme support covers every Zotero Neo-owned panel, not only the preferences pane:

- preferences pane;
- fuzzy item and tab picker;
- outline and marks explorers;
- notes-layout controls and future Which-Key panels;
- mode/status surfaces where foreground and background are theme-sensitive.

PDF content, Zotero-native widgets, annotation colors, and link-hint semantic colors are not recolored.

## Theme Modes

Add one setting with three values:

1. `auto` — default; follow Zotero's active application theme;
2. `light` — force the Neo light palette;
3. `dark` — force the Neo dark palette.

`auto` must use a verified Zotero-owned theme signal when available. `matchMedia('(prefers-color-scheme: dark)')` is only a fallback when the host exposes no usable state.

## Interaction Rules

- Changing the selector updates the preferences pane immediately.
- An already-open Neo panel should update without requiring a Zotero restart.
- Panels opened after a host-theme change must use the new palette.
- Theme changes must not alter keyboard capture, focus, selected rows, scroll position, or picker contents.
- Unknown or invalid preference values resolve to `auto`.

## Visual Rules

- Centralize semantic tokens: panel background, elevated background, text, muted text, border, input background, selected background, accent, success, warning, and error.
- Use CSS variables in the preferences pane and one shared runtime palette source for injected panels.
- Remove dark-only surface/text/border literals from migrated Neo panels.
- Preserve semantic annotation colors and keep readable contrast in both palettes.
- Focus and selected states must remain visible without relying on color alone where an outline or border is already available.

## Non-Goals

- Re-skinning Zotero itself.
- Changing PDF page rendering.
- Reworking panel layout or keybindings.
- Adding a general theming/plugin API.
