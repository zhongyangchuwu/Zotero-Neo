export const NEO_APPEARANCE_ROOT = '.neo-appearance[data-zotero-neo-preset]';
export const NEO_CUSTOM_STYLE_ID = 'zotero-neo-custom-style';

// Rebind the tokens already used by Neo surfaces without changing their legacy (non-opted-in) palette.
const ALIASES = {
  surface: 'surface',
  elevated: 'surface-subtle',
  text: 'fg',
  muted: 'muted',
  border: 'border',
  input: 'input',
  accent: 'accent',
  'on-accent': 'on-accent',
  selected: 'selected-bg',
  'selected-text': 'selected-fg',
  'focus-ring': 'accent',
  'mode-normal': 'surface-subtle',
  'mode-normal-text': 'fg',
  'mode-main': 'surface-subtle',
  'mode-main-text': 'fg',
  'status-info': 'surface-subtle',
  'status-info-text': 'fg',
} as const;

/** Carry the resolved chrome palette into the exact owner document, including PDF iframes. */
export function appearanceHostPalette(palette: Readonly<Record<string, string>>) {
  return Object.fromEntries(
    Object.entries(palette).map(([name, value]) => [
      Object.hasOwn(ALIASES, name.slice('--zotero-neo-'.length))
        ? name.replace('--zotero-neo-', '--neo-host-')
        : name,
      value,
    ]),
  );
}

const ROOT = `:where(${NEO_APPEARANCE_ROOT})`;
export const NEO_APPEARANCE_CSS = `
${ROOT} {
  --neo-bg: var(--neo-host-surface);
  --neo-surface: var(--neo-bg);
  --neo-surface-subtle: var(--neo-host-elevated);
  --neo-border: var(--neo-host-border);
  --neo-fg: var(--neo-host-text);
  --neo-muted: var(--neo-host-muted);
  --neo-input: var(--neo-host-input);
  --neo-accent: #3568d4;
  --neo-on-accent: #fff;
  --neo-selected-bg: var(--neo-accent);
  --neo-selected-fg: var(--neo-on-accent);
  --neo-radius: 5px;
  --neo-radius-small: 4px;
  --neo-divider-width: 1px;
  --neo-shadow: 0 10px 28px var(--zotero-neo-shadow);
  --neo-font-ui: system-ui, sans-serif;
  --neo-font-mono: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-family: var(--neo-font-ui);
  ${Object.entries(ALIASES)
    .map(([from, to]) => `--zotero-neo-${from}: var(--neo-${to});`)
    .join('\n  ')}
}
${ROOT}:where([data-zotero-neo-theme='dark']) {
  --neo-accent: #8ab4f8;
  --neo-on-accent: #1e1e1e;
}
${ROOT}:where([data-zotero-neo-preset='terminal']) {
  --neo-bg: #f8fafc;
  --neo-surface-subtle: #eef2f6;
  --neo-border: #cbd5df;
  --neo-fg: #151922;
  --neo-muted: #46515f;
  --neo-input: var(--neo-bg);
  --neo-accent: #006663;
  --neo-on-accent: #fff;
  --neo-selected-bg: #c9f4ed;
  --neo-selected-fg: var(--neo-fg);
  --neo-radius: 0px;
  --neo-radius-small: 0px;
  --neo-shadow: none;
  --neo-font-ui: var(--neo-font-mono);
}
${ROOT}:where([data-zotero-neo-preset='terminal'][data-zotero-neo-theme='dark']) {
  --neo-bg: #111318;
  --neo-surface-subtle: #1b2028;
  --neo-border: #3e4857;
  --neo-fg: #f1f5f9;
  --neo-muted: #b5bfcd;
  --neo-accent: #68e4d5;
  --neo-on-accent: #111318;
  --neo-selected-bg: #244643;
}
${ROOT}:where([data-zotero-neo-preset='modern']) {
  --neo-accent: var(--neo-host-accent);
  --neo-on-accent: var(--neo-host-on-accent);
  --neo-surface-subtle: color-mix(in srgb, var(--neo-bg), var(--neo-host-elevated) 65%);
  --neo-selected-bg: color-mix(in srgb, var(--neo-bg), var(--neo-accent) 16%);
  --neo-selected-fg: var(--neo-fg);
  --neo-radius: 18px;
  --neo-radius-small: 10px;
  --neo-shadow: 0 22px 64px var(--zotero-neo-shadow);
}
`;
