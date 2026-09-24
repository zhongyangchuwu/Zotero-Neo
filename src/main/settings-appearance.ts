import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { THEME_VARS } from '../ui/theme';
import {
  DEFAULT_INTERACTION_COLOR_PRESET,
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
  INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
  INTERACTION_MARKER_WIDTH_PREFERENCE_KEY,
  INTERACTION_STATUS_STYLE_PREFERENCE_KEY,
  INTERACTION_THEME_CATALOG,
  deleteCustomInteractionTheme,
  findCustomInteractionTheme,
  generateCustomInteractionThemeId,
  interactionStatusColors,
  normalizeInteractionColorPreset,
  parseCustomInteractionThemes,
  resolveInteractionAppearance,
  seedCustomInteractionTheme,
  serializeCustomInteractionThemes,
  upsertCustomInteractionTheme,
  type CustomInteractionTheme,
  type InteractionAppearanceManager,
  type InteractionPalette8,
  type InteractionStatusStyle,
} from './interaction-appearance';
import { settingsButton, settingsChoices } from './settings-ui';

const H = 'http://www.w3.org/1999/xhtml';
const COLORS = [
  ['black', 'Black'],
  ['red', 'Red'],
  ['green', 'Green'],
  ['yellow', 'Yellow'],
  ['blue', 'Blue'],
  ['magenta', 'Magenta'],
  ['cyan', 'Cyan'],
  ['white', 'White'],
] as const;
type PaletteKey = keyof InteractionPalette8;
type PaletteMode = 'light' | 'dark';
const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME = /^[^\x00-\x1f\x7f]{1,100}$/;
const FLAVORS: Record<string, string> = {
  zotero: 'Snow / Dark',
  catppuccin: 'Latte / Mocha',
  'tokyo-night': 'Day / Night',
  gruvbox: 'Light / Dark',
};

/** Main-session navigation state; never persisted as a preference. */
export interface SettingsAppearanceState {
  view: 'library' | 'editor';
  editingThemeId: string | null;
  paletteMode: PaletteMode;
}

/** Appearance library and autosaving custom editor for one open Settings workspace. */
export class SettingsAppearance {
  readonly #document: Document;
  readonly #preferences: PreferenceStore;
  readonly #appearance: InteractionAppearanceManager;
  readonly #root: HTMLElement;
  readonly #state: SettingsAppearanceState;
  readonly #cleanups: Array<() => void> = [];
  #domCleanups: Array<() => void> = [];
  #theme: CustomInteractionTheme | null = null;
  #isNew = false;
  #nameText = '';
  #addButton: HTMLButtonElement | null = null;
  #hexText: Record<PaletteMode, Record<PaletteKey, string>> | null = null;
  #preview: HTMLElement | null = null;
  #status: HTMLElement | null = null;
  #confirmedDelete: string | null = null;

  constructor(
    window: MainWindow,
    root: HTMLElement,
    preferences: PreferenceStore,
    appearance: InteractionAppearanceManager,
    state: SettingsAppearanceState = {
      view: 'library',
      editingThemeId: null,
      paletteMode: 'light',
    },
  ) {
    this.#document = window.document;
    this.#root = root;
    this.#preferences = preferences;
    this.#appearance = appearance;
    this.#state = state;
    this.#cleanups.push(appearance.observe(() => this.#refresh()));
    for (const key of [
      INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
      INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
    ]) {
      const cleanup = preferences.observe?.(key, () => this.#refresh());
      if (cleanup) this.#cleanups.push(cleanup);
    }
    if (state.view === 'editor' && state.editingThemeId) {
      this.#theme = findCustomInteractionTheme(this.#store(), state.editingThemeId) ?? null;
    }
    if (this.#theme) this.#renderEditor();
    else this.#renderLibrary();
  }

  dispose(): void {
    if (this.#isNew) {
      this.#state.view = 'library';
      this.#state.editingThemeId = null;
    }
    this.#clearDom();
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#root.replaceChildren();
  }

  #create(tag: string, text?: string): HTMLElement {
    const node = this.#document.createElementNS(H, tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  #clearDom(): void {
    for (const cleanup of this.#domCleanups.splice(0)) cleanup();
    this.#root.replaceChildren();
    this.#preview = null;
    this.#status = null;
    this.#addButton = null;
  }

  #message(text: string): void {
    if (this.#status) this.#status.textContent = text;
  }

  #store() {
    return parseCustomInteractionThemes(
      this.#preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, ''),
    );
  }

  #activeId(): string {
    const id = this.#preferences.get(
      INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
      DEFAULT_INTERACTION_COLOR_PRESET,
    );
    return findCustomInteractionTheme(this.#store(), id) ? id : normalizeInteractionColorPreset(id);
  }

  #refresh(): void {
    if (this.#isNew) {
      this.#updatePreview();
      return;
    }
    if (this.#state.view === 'editor') {
      const theme =
        this.#state.editingThemeId &&
        findCustomInteractionTheme(this.#store(), this.#state.editingThemeId);
      if (!theme) {
        this.#renderLibrary();
        return;
      }
      this.#theme = theme;
      this.#updatePreview(); // Never replace a focused name/hex input on its own observer notification.
      return;
    }
    this.#renderLibrary();
  }

  #renderLibrary(): void {
    this.#state.view = 'library';
    this.#state.editingThemeId = null;
    this.#isNew = false;
    this.#theme = null;
    this.#hexText = null;
    this.#clearDom();
    this.#root.style.cssText = 'display:block;overflow:auto;padding:16px 20px';
    const title = this.#create('h2', 'Appearance');
    title.style.cssText = 'margin:0 0 0.55em;font-size:1.55em';
    const controls = this.#create('section');
    controls.style.cssText =
      'display:flex;flex-wrap:wrap;gap:18px;align-items:center;margin:0 0 18px';
    const marker = this.#create('div');
    marker.append(this.#create('span', 'Marker width (px) '));
    const widths = settingsChoices(
      this.#document,
      [1, 2, 3, 4].map((value) => ({ value, label: `${value}px` })),
      this.#appearance.appearance.marker.width,
      (value) => this.#setAppearance(INTERACTION_MARKER_WIDTH_PREFERENCE_KEY, value),
      this.#domCleanups,
    );
    marker.append(widths.element);
    const styles = this.#create('div');
    styles.append(this.#create('span', 'Status style '));
    const statusStyles = settingsChoices(
      this.#document,
      [
        { value: 'neutral', label: 'Neutral' },
        { value: 'tinted', label: 'Tinted' },
      ] as const,
      this.#appearance.appearance.statusStyle,
      (value) => this.#setAppearance(INTERACTION_STATUS_STYLE_PREFERENCE_KEY, value),
      this.#domCleanups,
    );
    styles.append(statusStyles.element);
    controls.append(marker, styles);
    const themesHeading = this.#create('h3', 'Themes');
    themesHeading.style.cssText = 'margin:0 0 0.6em;font-size:1.2em';
    const grid = this.#create('div');
    grid.style.cssText =
      'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:12px';
    const active = this.#activeId();
    const mode = this.#appearance.appearance.theme;
    for (const theme of [...INTERACTION_THEME_CATALOG, ...this.#store().themes]) {
      const selected = theme.id === active;
      const card = this.#create('div');
      card.dataset.themeId = theme.id;
      card.style.cssText = `padding:12px;border:2px solid ${selected ? THEME_VARS.accent : THEME_VARS.border};border-radius:7px;background:${selected ? THEME_VARS.selected : THEME_VARS.elevated};cursor:pointer`;
      if (selected) card.setAttribute('aria-current', 'true');
      const onCardClick = (event: MouseEvent): void => {
        if (!(event.target as Element).closest?.('button')) this.#select(theme.id);
      };
      card.addEventListener('click', onCardClick);
      this.#domCleanups.push(() => card.removeEventListener('click', onCardClick));
      const choice = settingsButton(
        this.#document,
        theme.name,
        () => this.#select(theme.id),
        this.#domCleanups,
      );
      choice.setAttribute('aria-label', `Select ${theme.name}`);
      choice.style.cssText += `;width:100%;justify-content:flex-start;text-align:left;font-weight:600;font-size:1.15em;border:0;background:transparent;color:${selected ? THEME_VARS.selectedText : THEME_VARS.text}`;
      const note = this.#create(
        'div',
        `${FLAVORS[theme.id] ?? 'Custom'}${selected ? ' · Active' : ''}`,
      );
      note.style.cssText = `font-size:0.95em;color:${THEME_VARS.muted}`;
      const swatches = this.#create('div');
      swatches.style.cssText =
        'display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:3px;margin:10px 0';
      for (const [key, label] of COLORS) {
        const swatch = this.#create('span');
        swatch.setAttribute('aria-label', `${label} ${theme[mode][key]}`);
        swatch.style.cssText = `height:24px;background:${theme[mode][key]};border:1px solid ${THEME_VARS.border};border-radius:3px`;
        swatches.append(swatch);
      }
      card.append(choice, note, swatches);
      if ('version' in theme) {
        const actions = this.#create('div');
        actions.style.cssText = 'display:flex;gap:6px';
        actions.append(
          settingsButton(
            this.#document,
            'Edit',
            () => this.#openEditor(theme.id),
            this.#domCleanups,
          ),
          settingsButton(
            this.#document,
            this.#confirmedDelete === theme.id ? 'Confirm delete' : 'Delete',
            () => this.#deleteTheme(theme.id),
            this.#domCleanups,
          ),
        );
        card.append(actions);
      }
      grid.append(card);
    }
    const add = settingsButton(
      this.#document,
      '+ Custom',
      () => this.#createTheme(),
      this.#domCleanups,
    );
    add.style.cssText +=
      ';min-height:5.5em;font-size:1.15em;text-align:left;justify-content:flex-start';
    grid.append(add);
    const status = this.#create('p');
    status.setAttribute('role', 'status');
    this.#status = status;
    this.#root.append(title, controls, themesHeading, grid, status);
  }

  #setAppearance(key: string, value: number | InteractionStatusStyle): boolean {
    try {
      this.#preferences.set(key, value);
      this.#appearance.refresh();
      this.#renderLibrary();
      return true;
    } catch {
      this.#message('Could not update appearance.');
      return false;
    }
  }

  #select(id: string): void {
    try {
      this.#preferences.set(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, id);
      this.#appearance.refresh();
      this.#renderLibrary();
    } catch {
      this.#message('Could not select theme.');
    }
  }

  #createTheme(): void {
    const store = this.#store();
    const id = generateCustomInteractionThemeId(
      store.themes.map((theme) => theme.id),
      () => {
        const uuid = this.#document.defaultView?.crypto?.randomUUID();
        return uuid ? `custom:${uuid}` : '';
      },
    );
    this.#theme = seedCustomInteractionTheme(this.#preferences, this.#activeId(), id, 'New theme');
    this.#isNew = true;
    this.#nameText = this.#theme.name;
    this.#hexText = { light: { ...this.#theme.light }, dark: { ...this.#theme.dark } };
    this.#state.paletteMode = this.#appearance.appearance.theme;
    this.#renderEditor();
  }

  /** Persists a valid new theme first, then activates it; failed activation restores the store. */
  #addTheme(): void {
    const theme = this.#theme;
    if (!this.#isNew || !theme || this.#addButton?.disabled) return;
    const original = this.#preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, '');
    try {
      const store = this.#store();
      if (findCustomInteractionTheme(store, theme.id)) throw new Error('Theme ID already exists');
      this.#preferences.set(
        INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
        serializeCustomInteractionThemes(upsertCustomInteractionTheme(store, theme)),
      );
      try {
        this.#preferences.set(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, theme.id);
      } catch (error) {
        try {
          this.#preferences.set(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, original);
        } catch {}
        throw error;
      }
      this.#isNew = false;
      this.#appearance.refresh();
      this.#renderLibrary();
    } catch {
      this.#message('Could not add theme. Your edits are still here.');
    }
  }

  #deleteTheme(id: string): void {
    if (this.#confirmedDelete !== id) {
      this.#confirmedDelete = id;
      this.#renderLibrary();
      return;
    }
    this.#confirmedDelete = null;
    const original = this.#preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, '');
    const wasActive = this.#activeId() === id;
    try {
      this.#preferences.set(
        INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
        serializeCustomInteractionThemes(deleteCustomInteractionTheme(this.#store(), id)),
      );
      if (wasActive) {
        try {
          this.#preferences.set(
            INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
            DEFAULT_INTERACTION_COLOR_PRESET,
          );
        } catch (error) {
          try {
            this.#preferences.set(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, original);
          } catch {}
          throw error;
        }
      }
      if (this.#state.editingThemeId === id) {
        this.#state.view = 'library';
        this.#state.editingThemeId = null;
      }
      this.#appearance.refresh();
      this.#renderLibrary();
    } catch {
      this.#renderLibrary();
      this.#message('Could not delete theme.');
    }
  }

  #openEditor(id: string): void {
    const theme = findCustomInteractionTheme(this.#store(), id);
    if (!theme) {
      this.#renderLibrary();
      return;
    }
    try {
      if (this.#activeId() !== id)
        this.#preferences.set(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, id);
      this.#appearance.refresh();
    } catch {
      this.#message('Could not activate theme for editing.');
      return;
    }
    this.#state.view = 'editor';
    this.#state.editingThemeId = id;
    this.#theme = theme;
    this.#isNew = false;
    this.#nameText = theme.name;
    this.#hexText = { light: { ...theme.light }, dark: { ...theme.dark } };
    this.#renderEditor();
  }

  #persist(theme: CustomInteractionTheme): boolean {
    try {
      this.#preferences.set(
        INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
        serializeCustomInteractionThemes(upsertCustomInteractionTheme(this.#store(), theme)),
      );
      this.#theme = theme;
      this.#appearance.refresh();
      this.#updatePreview();
      this.#message('Saved');
      return true;
    } catch {
      this.#message('Could not save change. Previous theme is still active.');
      return false;
    }
  }

  #applyThemeChange(theme: CustomInteractionTheme): boolean {
    if (!this.#isNew) return this.#persist(theme);
    this.#theme = theme;
    this.#updatePreview();
    this.#message('');
    return true;
  }

  #updateAddValidity(): void {
    if (!this.#addButton) return;
    const invalidHex = Object.values(this.#hexText ?? {}).some((palette) =>
      Object.values(palette).some((value) => !HEX.test(value)),
    );
    this.#addButton.disabled = !NAME.test(this.#nameText.trim()) || invalidHex;
  }

  #renderEditor(): void {
    const theme = this.#theme;
    if (!theme) {
      this.#renderLibrary();
      return;
    }
    this.#state.view = 'editor';
    this.#state.editingThemeId = this.#isNew ? null : theme.id;
    this.#hexText ??= { light: { ...theme.light }, dark: { ...theme.dark } };
    this.#clearDom();
    this.#root.style.cssText = 'display:block;overflow:auto;padding:16px 20px';
    const toolbar = this.#create('div');
    toolbar.style.cssText = 'display:flex;gap:0.5em;align-items:center';
    toolbar.append(
      settingsButton(
        this.#document,
        'Back to themes',
        () => this.#renderLibrary(),
        this.#domCleanups,
      ),
    );
    if (this.#isNew) {
      this.#addButton = settingsButton(
        this.#document,
        'Add',
        () => this.#addTheme(),
        this.#domCleanups,
      );
      toolbar.append(this.#addButton);
    }
    const title = this.#create('h2', 'Appearance');
    title.style.cssText = 'margin:0.6em 0;font-size:1.55em';
    const heading = this.#create('h3', 'Custom theme');
    heading.style.cssText = 'margin:0 0 0.6em;font-size:1.2em';
    const name = this.#create('input') as HTMLInputElement;
    name.type = 'text';
    name.value = theme.name;
    name.maxLength = 100;
    name.setAttribute('aria-label', 'Theme name');
    name.style.cssText = `width:min(100%,360px);padding:0.45em;font:inherit;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border}`;
    const onName = (): void => {
      this.#nameText = name.value;
      const normalized = this.#nameText.trim();
      const valid = NAME.test(normalized);
      name.setAttribute('aria-invalid', String(!valid));
      if (!valid) {
        this.#message('Enter a name (1–100 characters).');
        this.#updateAddValidity();
        return;
      }
      if (normalized !== this.#theme?.name)
        this.#applyThemeChange({ ...this.#theme!, name: normalized });
      else this.#message('');
      this.#updateAddValidity();
    };
    name.addEventListener('input', onName);
    this.#domCleanups.push(() => name.removeEventListener('input', onName));
    const nameLabel = this.#create('label', 'Theme name');
    nameLabel.style.cssText = 'display:grid;gap:4px;margin-bottom:14px';
    nameLabel.append(name);
    const modes = settingsChoices(
      this.#document,
      [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ] as const,
      this.#state.paletteMode,
      (mode) => {
        this.#state.paletteMode = mode;
        syncMode();
      },
      this.#domCleanups,
    );
    modes.element.style.cssText += ';margin-bottom:14px';
    const fields = this.#create('div');
    fields.style.cssText = 'display:grid;gap:5px;max-width:560px';
    const inputs = new Map<
      PaletteKey,
      { picker: HTMLInputElement; hex: HTMLInputElement; error: HTMLElement }
    >();
    for (const [key, label] of COLORS) {
      const row = this.#create('label');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;min-height:35px';
      const caption = this.#create('span', label);
      caption.style.width = '90px';
      const picker = this.#create('input') as HTMLInputElement;
      picker.type = 'color';
      picker.setAttribute('aria-label', `${label} color picker`);
      const hex = this.#create('input') as HTMLInputElement;
      hex.type = 'text';
      hex.setAttribute('aria-label', `${label} hex`);
      hex.style.cssText = `width:7em;padding:0.35em;font:inherit;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border}`;
      const error = this.#create('span');
      error.style.color = THEME_VARS.error;
      const onHex = (): void => {
        this.#hexText![this.#state.paletteMode][key] = hex.value;
        const valid = HEX.test(hex.value);
        hex.setAttribute('aria-invalid', String(!valid));
        error.textContent = valid ? '' : 'Use #RRGGBB';
        this.#updateAddValidity();
        if (!valid) return;
        const color = hex.value.toUpperCase();
        if (color === this.#theme![this.#state.paletteMode][key]) {
          this.#message('');
          return;
        }
        if (this.#saveColor(key, color)) picker.value = color;
        this.#updateAddValidity();
      };
      const onPicker = (): void => {
        const color = picker.value.toUpperCase();
        if (this.#saveColor(key, color)) {
          hex.value = color;
          this.#hexText![this.#state.paletteMode][key] = color;
          hex.setAttribute('aria-invalid', 'false');
          error.textContent = '';
        } else picker.value = this.#theme![this.#state.paletteMode][key];
        this.#updateAddValidity();
      };
      hex.addEventListener('input', onHex);
      picker.addEventListener('change', onPicker);
      this.#domCleanups.push(() => {
        hex.removeEventListener('input', onHex);
        picker.removeEventListener('change', onPicker);
      });
      inputs.set(key, { picker, hex, error });
      row.append(caption, picker, hex, error);
      fields.append(row);
    }
    const preview = this.#create('div');
    preview.setAttribute('aria-label', 'Theme preview');
    preview.style.cssText = 'padding:10px;margin:16px 0;border-radius:5px';
    this.#preview = preview;
    const status = this.#create('p');
    status.setAttribute('role', 'status');
    this.#status = status;
    this.#root.append(toolbar, title, heading, nameLabel, modes.element, fields, preview, status);
    const syncMode = (): void => {
      for (const [key, controls] of inputs) {
        controls.hex.value = this.#hexText![this.#state.paletteMode][key];
        controls.picker.value = this.#theme![this.#state.paletteMode][key];
        const valid = HEX.test(controls.hex.value);
        controls.hex.setAttribute('aria-invalid', String(!valid));
        controls.error.textContent = valid ? '' : 'Use #RRGGBB';
      }
      this.#updatePreview();
    };
    this.#updateAddValidity();
    syncMode();
  }

  #saveColor(key: PaletteKey, color: string): boolean {
    const theme = this.#theme;
    if (!theme) return false;
    const mode = this.#state.paletteMode;
    return this.#applyThemeChange({ ...theme, [mode]: { ...theme[mode], [key]: color } });
  }

  #updatePreview(): void {
    const theme = this.#theme;
    const preview = this.#preview;
    if (!theme || !preview) return;
    const mode = this.#state.paletteMode;
    const palette = theme[mode];
    const appearance = resolveInteractionAppearance(
      this.#preferences,
      mode,
      this.#isNew ? theme : null,
    );
    preview.style.background = appearance.colors.neutralStatusBackground;
    preview.style.color = appearance.colors.neutralStatusForeground;
    preview.style.border = `1px solid ${appearance.colors.neutralStatusBorder}`;
    preview.textContent = `${mode === 'light' ? 'Light' : 'Dark'} palette · Selection = Yellow ${palette.yellow} · Visual = Green ${palette.green}`;
    const samples = this.#create('div');
    samples.style.cssText = 'display:flex;gap:8px;margin-top:8px';
    for (const kind of ['selection', 'visual'] as const) {
      const status = interactionStatusColors(appearance, kind);
      const sample = this.#create('span', kind === 'selection' ? 'SEL' : 'VISUAL');
      sample.style.cssText = `padding:4px 8px;background:${status.background};color:${status.foreground};border:1px solid ${status.border};border-left:${appearance.marker.width}px solid ${kind === 'selection' ? palette.yellow : palette.green};border-radius:3px`;
      samples.append(sample);
    }
    preview.append(samples);
  }
}
