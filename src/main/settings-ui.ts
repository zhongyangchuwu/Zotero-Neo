import { THEME_VARS } from '../ui/theme';

const H = 'http://www.w3.org/1999/xhtml';

// Scoped to buttons created for Neo Settings; never changes Zotero's controls.
const BUTTON_STYLE = `appearance:none;-moz-appearance:none;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;box-sizing:border-box;min-height:2.5em;padding:0.35em 0.8em;font:inherit;font-size:0.95em;line-height:1.2;white-space:nowrap;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border};border-radius:5px;cursor:pointer`;

/** Creates one mouse-first button and registers its listener with the owning Settings view. */
export function settingsButton(
  doc: Document,
  label: string,
  onClick: () => void,
  cleanups: Array<() => void>,
): HTMLButtonElement {
  const button = doc.createElementNS(H, 'button') as HTMLButtonElement;
  button.type = 'button';
  button.tabIndex = -1;
  button.textContent = label;
  button.style.cssText = BUTTON_STYLE;
  button.addEventListener('click', onClick);
  cleanups.push(() => button.removeEventListener('click', onClick));
  return button;
}

export function setSettingsPressed(button: HTMLButtonElement, pressed: boolean): void {
  button.setAttribute('aria-pressed', String(pressed));
  button.style.background = pressed ? THEME_VARS.selected : THEME_VARS.input;
  button.style.color = pressed ? THEME_VARS.selectedText : THEME_VARS.text;
  button.style.borderColor = pressed ? THEME_VARS.accent : THEME_VARS.border;
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
