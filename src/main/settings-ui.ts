import { THEME_VARS } from '../ui/theme';

const H = 'http://www.w3.org/1999/xhtml';

// Scoped to buttons created for Neo Settings; never changes Zotero's controls.
const BUTTON_STYLE = `appearance:none;-moz-appearance:none;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;box-sizing:border-box;min-height:2.5em;padding:0.35em 0.8em;font:inherit;font-size:0.95em;line-height:1.2;white-space:nowrap;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border};border-radius:5px;cursor:pointer`;
const FIELD_STYLE = `box-sizing:border-box;min-height:2.3em;padding:0.3em 0.55em;font:inherit;line-height:1.2;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border};border-radius:4px`;

/** Creates one Settings-styled button without imposing an event ownership model. */
export function settingsButtonElement(doc: Document, label: string): HTMLButtonElement {
  const button = doc.createElementNS(H, 'button') as HTMLButtonElement;
  button.type = 'button';
  button.tabIndex = -1;
  button.textContent = label;
  button.style.cssText = BUTTON_STYLE;
  return button;
}

/** Applies the shared host-font field geometry to Settings-owned inputs and selects. */
export function styleSettingsField(element: HTMLElement, width?: string): void {
  element.style.cssText = `${FIELD_STYLE}${width ? `;width:${width}` : ''}`;
}

/** Creates one mouse-first button and registers its listener with the owning Settings view. */
export function settingsButton(
  doc: Document,
  label: string,
  onClick: () => void,
  cleanups: Array<() => void>,
): HTMLButtonElement {
  const button = settingsButtonElement(doc, label);
  button.addEventListener('click', onClick);
  cleanups.push(() => button.removeEventListener('click', onClick));
  return button;
}

function setSelectedColors(button: HTMLButtonElement, selected: boolean): void {
  button.style.background = selected ? THEME_VARS.selected : THEME_VARS.input;
  button.style.color = selected ? THEME_VARS.selectedText : THEME_VARS.text;
  button.style.borderColor = selected ? THEME_VARS.accent : THEME_VARS.border;
}

export function setSettingsPressed(button: HTMLButtonElement, pressed: boolean): void {
  button.setAttribute('aria-pressed', String(pressed));
  setSelectedColors(button, pressed);
}

/** Builds a small choice group and returns its shared selected-state updater. */
export function settingsChoices<T extends string | number>(
  doc: Document,
  options: readonly { readonly value: T; readonly label: string }[],
  selected: T,
  onSelect: (value: T) => boolean | void,
  cleanups: Array<() => void>,
): { element: HTMLElement; select: (value: T) => void } {
  const element = doc.createElementNS(H, 'div') as HTMLElement;
  element.style.cssText = 'display:inline-flex;align-items:center;flex-wrap:wrap;gap:0.4em';
  const buttons = options.map(({ value, label }) => {
    const button = settingsButton(
      doc,
      label,
      () => {
        if (onSelect(value) !== false) select(value);
      },
      cleanups,
    );
    element.append(button);
    return { value, button };
  });
  const select = (value: T): void => {
    for (const option of buttons) setSettingsPressed(option.button, option.value === value);
  };
  select(selected);
  return { element, select };
}

/** Provides the same compact heading and description spacing for Settings pages. */
export function settingsGroup(doc: Document, heading: string, description?: string): HTMLElement {
  const group = doc.createElementNS(H, 'section') as HTMLElement;
  group.style.cssText = 'margin-bottom:1.5em';
  const title = doc.createElementNS(H, 'h3');
  title.style.cssText = 'margin:0 0 0.5em;font-size:1.2em';
  title.textContent = heading;
  group.append(title);
  if (description) {
    const help = doc.createElementNS(H, 'p');
    help.style.cssText = `margin:0 0 0.75em;color:${THEME_VARS.muted}`;
    help.textContent = description;
    group.append(help);
  }
  return group;
}

/** Builds the common label/description + control geometry used by Settings rows. */
export function settingsControlRow(
  doc: Document,
  label: string,
  control: HTMLElement,
  description?: string,
): HTMLElement {
  const row = doc.createElementNS(H, 'div') as HTMLElement;
  row.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:1em;padding:0.35em 0';
  const text = doc.createElementNS(H, 'div') as HTMLElement;
  const title = doc.createElementNS(H, 'span') as HTMLElement;
  title.textContent = label;
  text.append(title);
  if (description) {
    const help = doc.createElementNS(H, 'div') as HTMLElement;
    help.style.cssText = `font-size:0.9em;color:${THEME_VARS.muted}`;
    help.textContent = description;
    text.append(help);
  }
  row.append(text, control);
  return row;
}

export interface SettingsToggle {
  readonly element: HTMLElement;
  set(checked: boolean): void;
}

/** A pointer-first boolean control; the page owns persistence and can veto visual changes. */
export function settingsToggleRow(
  doc: Document,
  label: string,
  checked: boolean,
  onChange: (next: boolean) => boolean | void,
  cleanups: Array<() => void>,
  description?: string,
): SettingsToggle {
  const button = settingsButton(
    doc,
    '',
    () => {
      const next = !checked;
      if (onChange(next) !== false) set(next);
    },
    cleanups,
  );
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', label);
  const set = (value: boolean): void => {
    checked = value;
    button.setAttribute('aria-checked', String(value));
    button.textContent = value ? 'On' : 'Off';
    setSelectedColors(button, value);
  };
  set(checked);
  return { element: settingsControlRow(doc, label, button, description), set };
}

export interface SettingsNumberInput {
  readonly element: HTMLElement;
  set(value: number): void;
}

export interface SettingsNumberOptions {
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
}

/** A host-font numeric field; keyboard editing remains native while persistence stays page-owned. */
export function settingsNumberRow(
  doc: Document,
  label: string,
  value: number,
  options: SettingsNumberOptions,
  onChange: (next: number) => number | false | void,
  cleanups: Array<() => void>,
  description?: string,
): SettingsNumberInput {
  const input = doc.createElementNS(H, 'input') as HTMLInputElement;
  input.type = 'number';
  input.min = String(options.minimum);
  input.max = String(options.maximum);
  input.step = String(options.step);
  input.setAttribute('aria-label', label);
  styleSettingsField(input, '8.5em');
  let current = value;
  const set = (next: number): void => {
    current = next;
    input.value = String(next);
  };
  const commit = (): void => {
    const raw = Number.parseInt(input.value, 10);
    const result = onChange(raw);
    if (result === false) set(current);
    else if (typeof result === 'number') set(result);
    else if (Number.isFinite(raw)) set(raw);
    else set(current);
  };
  input.addEventListener('change', commit);
  cleanups.push(() => input.removeEventListener('change', commit));
  set(value);
  return { element: settingsControlRow(doc, label, input, description), set };
}

/** One inline failure region; successful writes leave it empty. */
export function settingsStatus(doc: Document): HTMLElement {
  const status = doc.createElementNS(H, 'p') as HTMLElement;
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = `margin:0;color:${THEME_VARS.error}`;
  return status;
}
