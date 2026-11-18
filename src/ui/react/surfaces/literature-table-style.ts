export const LITERATURE_TABLE_CSS = `
.neo-literature-table { display: flex; flex-direction: column; gap: 9px; height: 100%; min-height: 0; padding: 12px; }
.neo-literature-table h1, .neo-literature-table p { margin: 0; }
.neo-literature-toolbar, .neo-literature-view-actions, .neo-literature-chips, .neo-literature-pages { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-width: 0; }
.neo-literature-toolbar select { max-inline-size: min(21rem, 100%); padding: 3px 6px; }
.neo-literature-toolbar [data-neo-ui-part="saved-view"] { font-weight: 600; }
.neo-literature-table button.neo-literature-control { min-height: 25px; padding: 2px 7px; border-color: transparent; background: transparent; white-space: nowrap; }
.neo-literature-table button.neo-literature-control:hover:not(:disabled), .neo-literature-table button.neo-literature-control[aria-expanded="true"] { background: var(--zotero-neo-elevated); border-color: var(--zotero-neo-border); }
.neo-literature-toolbar [data-neo-ui-part="view-actions"] { margin-inline-start: auto; }
.neo-literature-view-actions { padding: 6px 8px; border: 1px solid var(--zotero-neo-border); border-radius: 5px; }
.neo-literature-view-actions label { display: flex; align-items: center; gap: 6px; max-inline-size: 100%; }
.neo-literature-table [data-neo-ui-part="filter-count"] { margin-inline-start: auto; }
.neo-literature-chip { display: inline-flex; align-items: stretch; min-width: 0; max-width: 100%; border-radius: 5px; background: var(--zotero-neo-elevated); }
.neo-literature-chip button.neo-literature-control:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.neo-literature-chip[data-invalid] { border-inline-start: 2px solid var(--zotero-neo-status-error-text, currentColor); }
.neo-literature-grid { min-height: 0; overflow: auto; border: 1px solid var(--zotero-neo-border); border-radius: 5px; }
.neo-literature-grid table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; }
.neo-literature-grid th, .neo-literature-grid td { text-align: start; overflow-wrap: anywhere; border-block-end: 1px solid var(--zotero-neo-border); border-inline-end: 1px solid var(--zotero-neo-border); padding: 3px 7px; min-inline-size: 7rem; max-inline-size: 22rem; }
.neo-literature-grid tr > :last-child { border-inline-end: none; }
.neo-literature-grid tbody tr:last-child td { border-block-end: none; }
.neo-literature-grid thead { position: sticky; inset-block-start: 0; z-index: 2; background: var(--zotero-neo-elevated); }
.neo-literature-grid :is(th, td)[data-column-id="title"] { position: sticky; inset-inline-start: 0; min-inline-size: clamp(9rem, 28vw, 17rem); }
.neo-literature-grid th[data-column-id="title"] { z-index: 1; background: var(--zotero-neo-elevated); }
.neo-literature-grid td[data-column-id="title"] { z-index: 1; background: var(--zotero-neo-surface); font-weight: 600; }
.neo-literature-grid :is(th, td)[data-column-id="year"] { min-inline-size: 4.5rem; }
.neo-literature-grid th .neo-literature-control { display: flex; align-items: center; gap: 5px; width: 100%; text-align: start; }
.neo-literature-title-cell { display: flex; align-items: center; gap: 6px; max-inline-size: clamp(11rem, 45vw, 22rem); }
.neo-literature-title-name { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.neo-literature-title-cell button { flex: 0 0 auto; font-weight: 400; color: var(--zotero-neo-muted); }
.neo-literature-type-icon { min-inline-size: 14px; text-align: center; color: var(--zotero-neo-muted); font-size: .9em; font-weight: 600; }
.neo-literature-header-name { white-space: normal; }
.neo-literature-grid td:is([data-cell-state="missing"], [data-cell-state="ambiguous"]) { color: var(--zotero-neo-muted); }
.neo-literature-grid td[data-cell-state^="invalid"] span { text-decoration: underline dotted; }
.neo-literature-grid button.neo-literature-cell-trigger { display: flex; align-items: center; min-height: 24px; padding: 2px 4px; width: 100%; border: 1px solid transparent; text-align: start; background: transparent; }
.neo-literature-grid button.neo-literature-cell-trigger:hover:not(:disabled), .neo-literature-grid button.neo-literature-cell-trigger[aria-expanded="true"] { border-color: var(--zotero-neo-border); background: var(--zotero-neo-elevated); }
.neo-literature-grid button.neo-literature-cell-trigger:disabled { opacity: 1; }
.neo-literature-cell-values { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }
.neo-literature-native-tags { margin: 0; padding: 0; list-style: none; }
.neo-literature-tag { padding-inline: 5px; border-radius: 4px; background: var(--neo-literature-tag, var(--zotero-neo-elevated)); color: var(--zotero-neo-text); }
.neo-literature-tag[data-tone="0"] { --neo-literature-tag: color-mix(in srgb, var(--zotero-neo-surface) 82%, #3b8fcf); }
.neo-literature-tag[data-tone="1"] { --neo-literature-tag: color-mix(in srgb, var(--zotero-neo-surface) 82%, #61a25b); }
.neo-literature-tag[data-tone="2"] { --neo-literature-tag: color-mix(in srgb, var(--zotero-neo-surface) 82%, #be6aa9); }
.neo-literature-tag[data-tone="3"] { --neo-literature-tag: color-mix(in srgb, var(--zotero-neo-surface) 82%, #c78537); }
.neo-literature-tag[data-tone="4"] { --neo-literature-tag: color-mix(in srgb, var(--zotero-neo-surface) 82%, #856ed0); }
.neo-literature-tag[data-tone="5"] { --neo-literature-tag: color-mix(in srgb, var(--zotero-neo-surface) 82%, #479c98); }
.neo-literature-positioner { z-index: 5; }
.neo-literature-table [data-neo-ui-part="workbench-overlays"] { display: contents; }
.neo-literature-positioner:not(.neo-literature-editor-positioner)[data-anchor-hidden] { visibility: hidden; }
.neo-literature-popup { display: flex; flex-direction: column; align-items: stretch; gap: 6px; inline-size: max-content; min-inline-size: min(11rem, calc(100vw - 24px)); max-inline-size: min(24rem, calc(100vw - 24px)); max-block-size: min(var(--available-height, 55vh), 55vh); overflow: auto; padding: 7px; border: 1px solid var(--zotero-neo-border); border-radius: 7px; background: var(--zotero-neo-elevated); box-shadow: 0 7px 22px var(--zotero-neo-shadow); }
.neo-literature-popup h2, .neo-literature-popup p { margin: 0; }
.neo-literature-popup[data-closed] { visibility: hidden; }
.neo-literature-popup :is(input, select) { max-width: 100%; }
.neo-literature-popup button.neo-literature-option, .neo-literature-option { display: flex; align-items: center; gap: 7px; width: 100%; min-height: 26px; padding: 2px 5px; border: 0; border-radius: 4px; background: transparent; color: inherit; text-align: start; cursor: pointer; }
.neo-literature-popup [data-highlighted], .neo-literature-popup button.neo-literature-option:hover:not(:disabled) { background: var(--zotero-neo-selected); color: var(--zotero-neo-selected-text); }
.neo-literature-popup [data-disabled], .neo-literature-popup [aria-disabled="true"] { cursor: not-allowed; opacity: .55; }
.neo-literature-options { display: flex; flex-direction: column; gap: 2px; max-block-size: min(16rem, 33vh); min-height: 0; overflow-y: auto; }
.neo-literature-option [role="checkbox"], .neo-literature-option [role="radio"] { display: inline-grid; place-items: center; flex: 0 0 auto; width: 16px; height: 16px; border: 1px solid var(--zotero-neo-border); border-radius: 3px; background: var(--zotero-neo-input); }
.neo-literature-option [role="radio"] { border-radius: 50%; }
.neo-literature-option :is([role="checkbox"], [role="radio"])[data-checked] { border-color: var(--zotero-neo-accent); color: var(--zotero-neo-on-accent); background: var(--zotero-neo-accent); }
.neo-literature-popup .neo-literature-field { display: grid; gap: 3px; }
.neo-literature-edit-form { display: flex; flex-direction: column; gap: 6px; }
.neo-literature-popup .neo-literature-popup-actions { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.neo-literature-popup .neo-literature-sort-direction { width: auto; }
.neo-literature-popup .neo-button, .neo-literature-view-actions .neo-button, .neo-literature-pages .neo-button { min-height: 25px; padding: 2px 7px; }
@media (max-width: 470px) {
  .neo-literature-table { padding: 8px; }
  .neo-literature-toolbar select { max-inline-size: 100%; }
  .neo-literature-toolbar [data-neo-ui-part="view-actions"] { margin-inline-start: 0; }
}
`;
