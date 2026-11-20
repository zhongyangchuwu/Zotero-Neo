export const PICKER_REACT_CSS = `
.picker-root {
  --picker-bg: var(--zotero-neo-surface);
  --picker-fg: var(--zotero-neo-text);
  --picker-muted: var(--zotero-neo-muted);
  --picker-border: var(--zotero-neo-border);
  --picker-accent: var(--zotero-neo-accent);
  --picker-match-fg: color-mix(in srgb, var(--picker-accent), var(--picker-fg) 25%);
  --picker-focus: var(--picker-accent);
  --picker-selected-bg: var(--zotero-neo-selected);
  --picker-selected-fg: var(--zotero-neo-selected-text);
  --picker-row-leading-border: 1px solid transparent;
  --picker-selected-left-border: 1px solid var(--picker-accent);
  --picker-preview-bg: var(--zotero-neo-elevated);
  --picker-card-bg: var(--picker-bg);
  --picker-font: system-ui, sans-serif;
  --picker-font-title: var(--picker-font);
  --picker-icon-size: 16px;
  --picker-icon-gap: 6px;
  --picker-row-height: 32px;
  --picker-row-radius: 0;
  --picker-row-padding: 10px;
  --picker-list-padding: 0;
  --picker-preview-padding: 16px;
  --picker-cell-gap: 10px;
  --picker-columns: minmax(0, 1fr) fit-content(min(25%, 16ch));
  --picker-panels: minmax(0, 1.4fr) minmax(0, 1fr);
  --picker-width: 1240px;
  --picker-height: 780px;
  --picker-header-height: 40px;
  --picker-footer-height: 22px;
  --picker-frame-width: 1px;
  --picker-divider-width: 1px;
  --picker-radius: 5px;
  --picker-card-radius: 4px;
  --picker-shadow: 0 10px 28px var(--zotero-neo-shadow);

  box-sizing: border-box;
  container: neo-picker / inline-size;
  width: min(var(--picker-width), 100%);
  height: min(var(--picker-height), 90vh);
  min-width: 0;
  overflow: hidden;
  background: var(--picker-bg);
  color: var(--picker-fg);
  font: 13px/1.4 var(--picker-font);
  border: var(--picker-frame-width) solid var(--picker-border);
  border-radius: var(--picker-radius);
  box-shadow: var(--picker-shadow);
}

.picker-root:where([data-picker-theme='classic']) {
  --picker-accent: #3568d4;
  --picker-selected-bg: var(--picker-accent);
  --picker-selected-fg: #fff;
  --picker-columns: minmax(0, 1fr) minmax(0, 24%) clamp(3em, 10%, 5em) minmax(0, 23%);
  --picker-cell-gap: 0px;
}

:where([data-zotero-neo-theme='dark']) .picker-root:where([data-picker-theme='classic']) {
  --picker-accent: #8ab4f8;
  --picker-selected-fg: #1e1e1e;
}

.picker-root:where([data-picker-theme='terminal']) {
  --picker-bg: #f8fafc;
  --picker-fg: #151922;
  --picker-muted: #46515f;
  --picker-accent: #006663;
  --picker-selected-bg: #c9f4ed;
  --picker-selected-fg: var(--picker-fg);
  --picker-preview-bg: var(--picker-bg);
  --picker-card-bg: var(--picker-preview-bg);
  --picker-font: ui-monospace, SFMono-Regular, Consolas, monospace;
  --picker-row-height: 28px;
  --picker-row-padding: 8px;
  --picker-columns: minmax(0, 1fr) fit-content(min(29%, 24ch)) fit-content(min(24%, 18ch));
  --picker-height: 860px;
  --picker-header-height: 34px;
  --picker-footer-height: 20px;
  --picker-frame-width: 0px;
  --picker-divider-width: 0px;
  --picker-radius: 0px;
  --picker-card-radius: 0px;
  --picker-shadow: none;
}

:where([data-zotero-neo-theme='dark']) .picker-root:where([data-picker-theme='terminal']) {
  --picker-bg: #111318;
  --picker-fg: #f1f5f9;
  --picker-muted: #b5bfcd;
  --picker-accent: #68e4d5;
  --picker-selected-bg: #244643;
}

.picker-root:where([data-picker-theme='modern']) {
  --picker-selected-bg: color-mix(in srgb, var(--picker-bg), var(--picker-accent) 16%);
  --picker-preview-bg: color-mix(in srgb, var(--picker-bg), var(--zotero-neo-elevated) 65%);
  --picker-row-height: 58px;
  --picker-row-radius: 10px;
  --picker-row-padding: 12px;
  --picker-list-padding: 8px;
  --picker-preview-padding: 22px;
  --picker-width: 1150px;
  --picker-height: 740px;
  --picker-header-height: 52px;
  --picker-footer-height: 24px;
  --picker-radius: 18px;
  --picker-card-radius: 12px;
  --picker-shadow: 0 22px 64px var(--zotero-neo-shadow);
}

.picker-container, :where(.picker-container) * { box-sizing: border-box; }
.picker-container {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
}
.picker-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: var(--picker-header-height);
  padding-inline: clamp(8px, 2%, 18px);
  border-block-end: 1px solid var(--picker-border);
}
.picker-input-wrapper:where(:has(.picker-query:focus-visible)) {
  border-block-end-color: var(--picker-focus);
}
.picker-prompt {
  flex: none;
  color: var(--picker-accent);
  font: 700 1.3em/1 ui-monospace, monospace;
}
.picker-query {
  appearance: none;
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  caret-color: var(--picker-accent);
  font: inherit;
  outline: none;
}
.picker-query::placeholder { color: var(--picker-muted); opacity: 1; }
.picker-source {
  appearance: none;
  max-width: min(32%, 17em);
  padding: 2px 6px;
  border: var(--picker-divider-width) solid var(--picker-border);
  border-radius: var(--picker-card-radius);
  background: var(--picker-preview-bg);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.picker-source:where(:disabled) { cursor: not-allowed; color: var(--picker-muted); }
.picker-scope {
  max-width: min(28%, 18ch);
  color: var(--picker-muted);
  font-size: .85em;
}
.picker-count {
  max-width: min(27%, 13em);
  color: var(--picker-muted);
  font-size: .9em;
  font-variant-numeric: tabular-nums;
}

.picker-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1.75fr) minmax(0, 1fr);
  min-height: 0;
}
.picker-list-container, .picker-preview-panel {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  outline: none;
}
.picker-list-container { padding: var(--picker-list-padding); }
.picker-preview-panel {
  padding: var(--picker-preview-padding);
  border-block-start: var(--picker-divider-width) solid var(--picker-border);
  background: var(--picker-preview-bg);
  overflow-wrap: anywhere;
}
@container neo-picker (min-width: 720px) {
  .picker-content { grid-template-columns: var(--picker-panels); grid-template-rows: minmax(0, 1fr); }
  .picker-preview-panel { border-block-start: 0; border-inline-start: var(--picker-divider-width) solid var(--picker-border); }
}
.picker-source:where(:focus-visible),
.picker-list-container:where(:focus-visible, [data-picker-focused]:focus),
.picker-preview-panel:where(:focus-visible, [data-picker-focused]:focus) {
  outline: 1px solid var(--picker-focus);
  outline-offset: -1px;
}

.picker-empty { padding: 10px var(--picker-row-padding); color: var(--picker-muted); overflow-wrap: anywhere; }
.picker-row {
  display: flex;
  align-items: center;
  min-width: 0;
  height: var(--picker-row-height);
  padding-inline: var(--picker-row-padding);
  border-inline-start: var(--picker-row-leading-border);
  border-radius: var(--picker-row-radius);
}
.picker-row:where([data-picker-clickable]) { cursor: pointer; }
.picker-row-bibliographic {
  display: grid;
  grid-template-columns: var(--picker-columns);
  column-gap: var(--picker-cell-gap);
}
.picker-row[selected] {
  --picker-muted: var(--picker-selected-fg);
  --picker-match-fg: currentColor;
  border-inline-start: var(--picker-selected-left-border);
  background: var(--picker-selected-bg);
  color: var(--picker-selected-fg);
}
.picker-cell-title {
  display: flex;
  align-items: center;
  gap: var(--picker-icon-gap);
  min-width: 0;
  font-family: var(--picker-font-title);
}
.picker-cell-title-text, .picker-row-text, .picker-cell-citekey, .picker-cell-author,
.picker-cell-year, .picker-cell-detail, .picker-source, .picker-scope, .picker-count,
.picker-status, .picker-shortcut-help {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker-row-text { display: block; }
.picker-item-icon {
  flex: 0 0 var(--picker-icon-size);
  width: var(--picker-icon-size);
  height: var(--picker-icon-size);
  object-fit: contain;
}
.picker-cell-meta {
  display: flex;
  align-items: center;
  gap: .6em;
  min-width: 0;
  color: var(--picker-muted);
  font-size: .9em;
}
.picker-cell-meta > :where(:empty) { display: none; }
.picker-cell-citekey {
  color: var(--picker-muted);
  font: .9em/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
}
.picker-match {
  background: transparent;
  color: var(--picker-match-fg);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: .13em;
}

:where(.picker-root[data-picker-theme='classic']) .picker-row {
  border-block-end: 1px solid var(--picker-border);
}
:where(.picker-root[data-picker-theme='classic']) .picker-row-bibliographic { padding-inline: 0; }
:where(.picker-root[data-picker-theme='classic'] .picker-row-bibliographic) .picker-cell-title {
  padding-inline: var(--picker-row-padding);
}
:where(.picker-root[data-picker-theme='classic']) .picker-cell-meta { display: contents; }
:where(.picker-root[data-picker-theme='classic']) :is(.picker-cell-author, .picker-cell-year, .picker-cell-citekey) {
  display: block;
  align-content: center;
  align-self: stretch;
  padding-inline: 6px;
  border-inline-start: 1px solid var(--picker-border);
}
:where(.picker-root[data-picker-theme='classic']) .picker-cell-detail { display: none; }
:where(.picker-root[data-picker-theme='classic']) .picker-row:where(:has(+ .picker-row.boundary)) {
  border-block-end-color: var(--picker-muted);
}

:where(.picker-root[data-picker-theme='terminal'], .picker-root[data-picker-theme='modern']) .picker-row:where(.boundary) {
  margin-block-start: 3px;
}

:where(.picker-root[data-picker-theme='modern']) .picker-row-bibliographic {
  grid-template-rows: auto auto;
  align-content: center;
  row-gap: 3px;
}
:where(.picker-root[data-picker-theme='modern'] .picker-row-bibliographic) .picker-cell-title {
  font-weight: 600;
}
:where(.picker-root[data-picker-theme='modern']) .picker-cell-meta {
  grid-area: 2 / 1;
  padding-inline-start: calc(var(--picker-icon-size) + var(--picker-icon-gap));
}
:where(.picker-root[data-picker-theme='modern']) .picker-cell-citekey { grid-area: 1 / 2 / span 2; }

.picker-preview-title { margin: 0 0 .7em; font: 650 1.08em/1.25 var(--picker-font-title); }
.picker-preview-bibliographic .picker-preview-title { margin-block-end: .45em; font-size: 1.62em; }
.picker-preview-body { white-space: pre-wrap; }
.picker-preview-meta { margin: 0 0 1.25em; color: var(--picker-muted); }
.picker-preview-meta:has(+ .picker-preview-citekey) { margin-block-end: .3em; }
.picker-preview-citekey {
  margin: 0 0 1.25em;
  color: var(--picker-muted);
  font: .9em/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
  overflow-wrap: anywhere;
}
.picker-preview-card {
  margin-block: .85em;
  padding: 10px 12px;
  background: var(--picker-card-bg);
  border: var(--picker-divider-width) solid var(--picker-border);
  border-radius: var(--picker-card-radius);
}
.picker-preview-card-title { margin: 0; font: 650 1em/1.4 var(--picker-font-title); }
.picker-preview-card-count { color: var(--picker-muted); font-weight: 400; font-variant-numeric: tabular-nums; }
.picker-preview-names { margin: .45em 0 0; padding-inline-start: 1.5em; }
.picker-preview-name { margin-block: .2em; }
.picker-preview-more { margin: .45em 0 0; color: var(--picker-muted); }

.picker-status-bar {
  display: flex;
  align-items: center;
  gap: .8em;
  min-width: 0;
  height: var(--picker-footer-height);
  padding-inline: clamp(8px, 2%, 18px);
  border-block-start: var(--picker-divider-width) solid var(--picker-border);
  font-size: .9em;
}
.picker-shortcut-help { margin-inline-start: auto; color: var(--picker-muted); }
.picker-status-bar:where([hidden]), .picker-source:where([hidden]) { display: none; }
`;
