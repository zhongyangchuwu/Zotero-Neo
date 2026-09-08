# Phase 0.2 Plan: Theme-Aware UI

## Objective

Provide Auto, Light, and Dark appearance modes for every Zotero Neo-owned panel, with Auto following Zotero rather than relying only on the operating-system media query.

## Implementation Sequence

1. **Verify the Zotero theme signal**
   - Inspect Zotero 7/8/9/10 chrome documents for the root attribute, class, preference, or CSS variable that represents the active host theme.
   - Record one ordered detection rule and a `matchMedia` fallback.
   - Avoid private APIs when an observable document signal is sufficient.

2. **Add the appearance preference**
   - Store `appearance.theme` as `auto`, `light`, or `dark`; default and invalid-value fallback are `auto`.
   - Add an Auto / Light / Dark selector to `content/preferences.xhtml`.
   - Add English and Chinese labels and immediate-save behavior in `content/prefs.js`.

3. **Centralize palette tokens**
   - Define light and dark semantic tokens once for runtime UI.
   - Convert the preferences pane to CSS variables keyed by the resolved theme.
   - Do not create separate per-panel color conventions.

4. **Migrate every Neo panel**
   - Preferences table and help text.
   - Fuzzy item/tab picker and notes-layout surfaces.
   - Outline and marks explorers.
   - Mode/status indicators whose foreground/background require theme-aware contrast.
   - Keep annotation, highlight, and link-hint semantic colors unchanged unless contrast requires a paired foreground token.

5. **Handle live changes**
   - Update open Neo panels when the explicit selector changes.
   - In Auto mode, observe the verified Zotero theme signal and refresh open panels without recreating their data or focus state.
   - Detach observers during panel/window cleanup.

6. **Verify the actual surface**
   - Run `./build.sh`.
   - Install the XPI in Zotero.
   - Exercise Auto under Zotero Light and Dark, then force Light and Dark against the opposite host theme.
   - Check preference pane, fuzzy picker, outline explorer, marks explorer, status/mode indicator, keyboard focus, selected row, and open-panel live switching.

## Acceptance Criteria

- Auto matches Zotero Light and Dark in the actual host.
- Forced Light and Dark override the host consistently.
- All Neo-owned panels use the same semantic palette contract.
- An open panel changes palette without losing focus, selection, or content.
- No panel remains dark-only because of hard-coded surface/text/border colors.
- Build and binding-sync checks pass; existing key behavior is unchanged.
