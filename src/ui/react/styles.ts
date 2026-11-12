export const NATIVE_UI_CSS = `
.neo-ui, .neo-ui * { box-sizing: border-box; }
.neo-ui { color: var(--zotero-neo-text); font: inherit; line-height: 1.5; min-width: 0; }
.neo-ui button, .neo-ui input, .neo-ui select, .neo-ui textarea { font: inherit; color: inherit; }
.neo-ui button, .neo-ui input, .neo-ui select, .neo-ui textarea { border: 1px solid var(--zotero-neo-border); border-radius: 5px; background: var(--zotero-neo-input); }
.neo-ui button { cursor: pointer; }
.neo-ui button:disabled, .neo-ui input:disabled, .neo-ui select:disabled, .neo-ui textarea:disabled { cursor: not-allowed; opacity: .55; }
.neo-ui :is(button, input, select, textarea, a, [tabindex]):focus-visible { outline: 2px solid var(--zotero-neo-focus-ring); outline-offset: 2px; }
.neo-ui input:not([type=checkbox]):not([type=radio]), .neo-ui select, .neo-ui textarea { min-width: 0; padding: 6px 9px; }
.neo-ui input[type=checkbox], .neo-ui input[type=radio] { accent-color: var(--zotero-neo-accent); }
.neo-ui h1, .neo-ui h2, .neo-ui h3, .neo-ui p { margin-top: 0; }
.neo-ui h1 { font-size: 1.45em; line-height: 1.3; }
.neo-ui h2 { font-size: 1.15em; line-height: 1.4; }
.neo-ui a { color: var(--zotero-neo-accent); }
.neo-button { min-height: 29px; padding: 5px 10px; white-space: nowrap; }
.neo-button:hover:not(:disabled) { border-color: var(--zotero-neo-accent); }
.neo-button-primary { border-color: var(--zotero-neo-accent) !important; background: var(--zotero-neo-accent) !important; color: var(--zotero-neo-surface) !important; }
.neo-muted { color: var(--zotero-neo-muted); font-size: .9em; }
.neo-field { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 11px 14px; border-bottom: 1px solid var(--zotero-neo-border); }
.neo-field:last-child { border-bottom: 0; }
.neo-field-caption { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.neo-field-label { font-weight: 600; }
.neo-field-control { display: flex; align-items: center; gap: 8px; flex: 0 1 auto; min-width: 0; }
.neo-status { padding: 8px 10px; color: var(--zotero-neo-muted); }
.neo-status-error { color: var(--zotero-neo-status-error-text); background: var(--zotero-neo-status-error); border-radius: 5px; }
.neo-kbd { font: .85em ui-monospace, SFMono-Regular, Consolas, monospace; padding: 1px 4px; border: 1px solid var(--zotero-neo-border); border-radius: 3px; color: var(--zotero-neo-muted); background: var(--zotero-neo-elevated); }
`;
