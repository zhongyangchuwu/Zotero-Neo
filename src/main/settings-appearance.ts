import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { THEME_VARS } from '../ui/theme';
import {
  DEFAULT_INTERACTION_COLOR_PRESET,
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
  INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
  INTERACTION_MARKER_WIDTH_PREFERENCE_KEY,
  INTERACTION_STATUS_STYLE_PREFERENCE_KEY,
  deleteCustomInteractionTheme,
  INTERACTION_THEME_CATALOG,
  findCustomInteractionTheme,
  generateCustomInteractionThemeId,
  interactionStatusColors,
  normalizeInteractionColorPreset,
  parseCustomInteractionThemes,
  resolveInteractionAppearance,
  seedCustomInteractionTheme,
  serializeCustomInteractionThemes,
  upsertCustomInteractionTheme,
  type InteractionPalette8,
  type CustomInteractionTheme,
  type InteractionAppearanceManager,
  type InteractionStatusStyle,
} from './interaction-appearance';

const H = 'http://www.w3.org/1999/xhtml';
const BUILT_INS = INTERACTION_THEME_CATALOG;
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

/** Owns Appearance DOM and drafts independently of the modeless Settings shell. */
export class SettingsAppearance {
  readonly #document: Document;
  readonly #preferences: PreferenceStore;
  readonly #appearance: InteractionAppearanceManager;
  readonly #root: HTMLElement;
  readonly #cleanups: Array<() => void> = [];
  #domCleanups: Array<() => void> = [];
  #draft: CustomInteractionTheme | null = null;
  #mode: PaletteMode = 'light';
  #name = '';
  #width = '';
  #style: InteractionStatusStyle = 'neutral';
  #hexText: Record<PaletteMode, Record<PaletteKey, string>> | null = null;
  #status: HTMLElement | null = null;
  #preview: HTMLElement | null = null;
  #save: HTMLButtonElement | null = null;
  #confirmedDelete: string | null = null;

  constructor(
    window: MainWindow,
    root: HTMLElement,
    preferences: PreferenceStore,
    appearance: InteractionAppearanceManager,
  ) {
    this.#document = window.document;
    this.#root = root;
    this.#preferences = preferences;
    this.#appearance = appearance;
    this.#cleanups.push(
      appearance.observe(() => {
        if (!this.#draft) this.#renderLibrary();
      }),
    );
    for (const key of [
      INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
      INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
    ]) {
      const cleanup = preferences.observe?.(key, () => {
        if (!this.#draft) this.#renderLibrary();
      });
      if (cleanup) this.#cleanups.push(cleanup);
    }
    this.#renderLibrary();
  }

  dispose(): void {
    this.#appearance.clearDraft();
    this.#clearDom();
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#draft = null;
    this.#root.replaceChildren();
  }

  #create(tag: string, text?: string): HTMLElement {
    const node = this.#document.createElementNS(H, tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  #button(text: string, action: () => void): HTMLButtonElement {
    const button = this.#create('button', text) as HTMLButtonElement;
    button.type = 'button';
    button.style.cssText = `padding:5px 9px;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border};border-radius:4px;cursor:pointer`;
    button.addEventListener('click', action);
    this.#domCleanups.push(() => button.removeEventListener('click', action));
    return button;
  }

  #setPressed(button: HTMLButtonElement, pressed: boolean): void {
    button.setAttribute('aria-pressed', String(pressed));
    button.style.background = pressed ? THEME_VARS.selected : THEME_VARS.input;
    button.style.color = pressed ? THEME_VARS.selectedText : THEME_VARS.text;
    button.style.borderColor = pressed ? THEME_VARS.accent : THEME_VARS.border;
  }

  #clearDom(): void {
    for (const cleanup of this.#domCleanups.splice(0)) cleanup();
    this.#root.replaceChildren();
    this.#status = null;
    this.#preview = null;
    this.#save = null;
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
    if (
      BUILT_INS.some((builtIn) => builtIn.id === id) ||
      findCustomInteractionTheme(this.#store(), id)
    )
      return id;
    return normalizeInteractionColorPreset(id);
  }

  #renderLibrary(): void {
    if (this.#draft) return;
    this.#clearDom();
    this.#root.style.display = 'block';
    this.#root.style.overflow = 'auto';
    this.#root.style.padding = '12px 14px';
    const title = this.#create('h3', 'Interaction themes');
    title.style.cssText = 'margin:0 0 5px;font-size:15px';
    const description = this.#create(
      'p',
      "Cursor keeps Zotero's native selected style. Selection and Visual markers use this theme.",
    );
    description.style.cssText = 'margin:0 0 12px';
    const actions = this.#create('div');
    actions.style.cssText = 'display:flex;gap:8px;margin-bottom:14px';
    actions.append(
      this.#button('+ New theme', () => this.#openEditor(null, false)),
      this.#button('Duplicate current', () => this.#openEditor(null, true)),
    );
    const cards = this.#create('div');
    cards.style.cssText = 'display:grid;gap:8px';
    const active = this.#activeId();
    const themes = this.#store().themes;
    for (const { id, name } of [...BUILT_INS, ...themes]) {
      const custom = themes.find((theme) => theme.id === id);
      const card = this.#create('div');
      card.dataset.themeId = id;
      card.style.cssText = `padding:9px;border:2px solid ${id === active ? THEME_VARS.accent : THEME_VARS.border};border-radius:6px;background:${id === active ? THEME_VARS.selected : THEME_VARS.elevated};color:${id === active ? THEME_VARS.selectedText : THEME_VARS.text}`;
      const heading = this.#create('div', `${name}${id === active ? ' · Active' : ''}`);
      heading.style.fontWeight = 'bold';
      if (id === active) card.setAttribute('aria-current', 'true');
      const palette =
        custom?.[this.#appearance.appearance.theme] ??
        seedCustomInteractionTheme(this.#preferences, id, 'custom:preview', name)[
          this.#appearance.appearance.theme
        ];
      const swatches = this.#create('div');
      swatches.style.cssText = 'display:flex;gap:12px;margin:7px 0';
      for (const [label, color] of [
        ['Selection', palette.yellow],
        ['Visual', palette.green],
      ]) {
        const swatch = this.#create('span', `${label} ${color}`);
        swatch.style.cssText = `border-left:8px solid ${color};padding-left:5px`;
        swatches.append(swatch);
      }
      const controls = this.#create('div');
      controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
      const select = this.#button('Select', () => {
        this.#appearance.clearDraft();
        try {
          this.#preferences.set(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, id);
          this.#appearance.refresh();
          this.#renderLibrary();
        } catch {
          this.#message('Could not select theme.');
        }
      });
      select.setAttribute('aria-label', `Select ${name}`);
      if (id === active) {
        select.style.background = THEME_VARS.accent;
        select.style.color = THEME_VARS.onAccent;
        select.style.borderColor = THEME_VARS.accent;
      }
      controls.append(select);
      if (custom) {
        controls.append(this.#button('Edit', () => this.#openEditor(custom, false)));
        controls.append(
          this.#button(this.#confirmedDelete === id ? 'Confirm delete' : 'Delete', () => {
            if (this.#confirmedDelete !== id) {
              this.#confirmedDelete = id;
              this.#renderLibrary();
              return;
            }
            this.#confirmedDelete = null;
            const original = this.#preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, '');
            try {
              this.#preferences.set(
                INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
                serializeCustomInteractionThemes(deleteCustomInteractionTheme(this.#store(), id)),
              );
              if (active === id)
                this.#preferences.set(
                  INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
                  DEFAULT_INTERACTION_COLOR_PRESET,
                );
              this.#appearance.refresh();
              this.#renderLibrary();
            } catch {
              try {
                this.#preferences.set(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, original);
              } catch {}
              this.#appearance.refresh();
              this.#renderLibrary();
              this.#message('Could not delete theme.');
            }
          }),
        );
      }
      card.append(heading, swatches, controls);
      cards.append(card);
    }
    const status = this.#create('p');
    status.setAttribute('role', 'status');
    this.#status = status;
    this.#root.append(title, description, actions, cards, status);
  }

  #message(text: string): void {
    if (this.#status) this.#status.textContent = text;
  }

  #openEditor(existing: CustomInteractionTheme | null, duplicate: boolean): void {
    const store = this.#store();
    const sourceId = existing?.id ?? this.#activeId();
    const sourceName =
      existing?.name ??
      BUILT_INS.find((item) => item.id === sourceId)?.name ??
      findCustomInteractionTheme(store, sourceId)?.name ??
      'Theme';
    const id =
      existing && !duplicate
        ? existing.id
        : generateCustomInteractionThemeId(
            store.themes.map((theme) => theme.id),
            () => {
              const uuid = this.#document.defaultView?.crypto?.randomUUID();
              return uuid ? `custom:${uuid}` : '';
            },
          );
    this.#draft = seedCustomInteractionTheme(
      this.#preferences,
      sourceId,
      id,
      existing && !duplicate ? existing.name : duplicate ? `${sourceName} copy` : 'New theme',
    );
    this.#name = this.#draft.name;
    this.#width = String(this.#appearance.appearance.marker.width);
    this.#style = this.#appearance.appearance.statusStyle;
    this.#hexText = { light: { ...this.#draft.light }, dark: { ...this.#draft.dark } };
    this.#mode = this.#appearance.appearance.theme;
    this.#confirmedDelete = null;
    this.#renderEditor();
    this.#appearance.setDraft(this.#draft);
  }

  #renderEditor(): void {
    const draft = this.#draft;
    if (!draft) return;
    this.#clearDom();
    this.#root.style.display = 'flex';
    this.#root.style.flexDirection = 'column';
    this.#root.style.overflow = 'hidden';
    this.#root.style.padding = '0';
    const body = this.#create('div');
    body.style.cssText = 'flex:1;min-height:0;overflow:auto;padding:10px 14px 16px';
    const title = this.#create('h3', 'Theme editor');
    title.style.cssText = 'margin:0 0 5px;font-size:15px';
    const name = this.#create('input') as HTMLInputElement;
    name.type = 'text';
    name.value = this.#name;
    name.maxLength = 100;
    name.style.cssText = `width:100%;box-sizing:border-box;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border}`;
    const onName = (): void => {
      this.#name = name.value;
      if (this.#validName()) this.#updateDraft({ name: this.#name.trim() });
      this.#validate();
    };
    name.addEventListener('input', onName);
    this.#domCleanups.push(() => name.removeEventListener('input', onName));
    const nameLabel = this.#create('label', 'Theme name');
    nameLabel.style.cssText = 'display:block;margin-bottom:6px';
    nameLabel.append(name);
    const modes = this.#create('div');
    modes.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
    const modeButtons = (['light', 'dark'] as const).map((mode) =>
      this.#button(mode === 'light' ? 'Light' : 'Dark', () => {
        this.#mode = mode;
        this.#syncPalette();
      }),
    );
    modes.append(...modeButtons);
    const fields = this.#create('div');
    const inputs = new Map<
      PaletteKey,
      { picker: HTMLInputElement; hex: HTMLInputElement; error: HTMLElement }
    >();
    for (const [key, label] of COLORS) {
      const row = this.#create('div');
      row.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin:3px 0';
      const picker = this.#create('input') as HTMLInputElement;
      picker.type = 'color';
      picker.setAttribute('aria-label', `${label} color picker`);
      const hex = this.#create('input') as HTMLInputElement;
      hex.type = 'text';
      hex.setAttribute('aria-label', `${label} hex`);
      hex.style.cssText = `width:90px;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border}`;
      const caption = this.#create('span', label);
      caption.style.width = '126px';
      const error = this.#create('span');
      error.style.color = THEME_VARS.error;
      const onHex = (): void => {
        this.#hexText![this.#mode][key] = hex.value;
        if (HEX.test(hex.value)) {
          const color = hex.value.toUpperCase();
          picker.value = color;
          this.#updatePalette(key, color);
        }
        this.#validate();
      };
      const onPicker = (): void => {
        const color = picker.value.toUpperCase();
        hex.value = color;
        this.#hexText![this.#mode][key] = color;
        this.#updatePalette(key, color);
        this.#validate();
      };
      hex.addEventListener('input', onHex);
      picker.addEventListener('input', onPicker);
      this.#domCleanups.push(() => {
        hex.removeEventListener('input', onHex);
        picker.removeEventListener('input', onPicker);
      });
      inputs.set(key, { picker, hex, error });
      row.append(caption, picker, hex, error);
      fields.append(row);
    }
    const width = this.#create('input') as HTMLInputElement;
    width.type = 'number';
    width.min = '1';
    width.max = '4';
    width.step = '1';
    width.value = this.#width;
    width.style.width = '56px';
    const onWidth = (): void => {
      this.#width = width.value;
      if (this.#validWidth()) this.#updatePreview();
      this.#validate();
    };
    width.addEventListener('input', onWidth);
    this.#domCleanups.push(() => width.removeEventListener('input', onWidth));
    const widthLabel = this.#create('label', 'Marker width (1–4 CSS px) ');
    widthLabel.append(width);
    const styles = this.#create('div');
    styles.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:6px';
    styles.append(widthLabel, this.#create('span', 'Status style'));
    const styleButtons = (['neutral', 'tinted'] as const).map((style) =>
      this.#button(style === 'neutral' ? 'Neutral' : 'Tinted', () => {
        this.#style = style;
        this.#updatePreview();
        syncStyle();
      }),
    );
    const syncStyle = (): void =>
      styleButtons.forEach((button, index) =>
        this.#setPressed(button, this.#style === (index ? 'tinted' : 'neutral')),
      );
    styles.append(...styleButtons);
    const preview = this.#create('div');
    preview.setAttribute('aria-label', 'Theme preview');
    preview.style.cssText = 'padding:7px;margin:6px 0;border-radius:4px';
    this.#preview = preview;
    const footer = this.#create('div');
    footer.style.cssText = `position:sticky;bottom:0;z-index:1;flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 14px;background:${THEME_VARS.surface};border-top:1px solid ${THEME_VARS.border}`;
    const save = this.#button('Save', () => this.#saveTheme());
    this.#save = save;
    footer.append(
      save,
      this.#button('Cancel / Back', () => this.#cancel()),
    );
    const status = this.#create('p');
    status.setAttribute('role', 'status');
    status.style.cssText = 'margin:0;min-height:1em;flex-basis:100%';
    this.#status = status;
    footer.append(status);
    body.append(title, nameLabel, modes, preview, fields, styles);
    this.#root.append(body, footer);
    const syncStyleAndPalette = (): void => {
      modeButtons.forEach((button, index) =>
        this.#setPressed(button, this.#mode === (index ? 'dark' : 'light')),
      );
      for (const [key, controls] of inputs) {
        controls.hex.value = this.#hexText![this.#mode][key];
        controls.picker.value = this.#draft![this.#mode][key];
        controls.error.textContent = HEX.test(controls.hex.value) ? '' : 'Use #RRGGBB';
        controls.hex.setAttribute('aria-invalid', String(!!controls.error.textContent));
      }
      syncStyle();
      this.#updatePreview();
    };
    this.#syncPalette = syncStyleAndPalette;
    syncStyleAndPalette();
    this.#validate();
  }

  #syncPalette: () => void = () => {};

  #validName(): boolean {
    return NAME.test(this.#name.trim());
  }

  #validWidth(): boolean {
    return /^[1-4]$/.test(this.#width);
  }

  #validate(): void {
    const invalidHex = Object.values(this.#hexText ?? {}).some((palette) =>
      Object.values(palette).some((value) => !HEX.test(value)),
    );
    if (this.#save) this.#save.disabled = !this.#validName() || !this.#validWidth() || invalidHex;
    this.#message(
      !this.#validName()
        ? 'Enter a name (1–100 characters).'
        : !this.#validWidth()
          ? 'Marker width must be 1–4.'
          : invalidHex
            ? 'Use #RRGGBB for every color.'
            : '',
    );
    this.#syncPalette();
  }

  #updateDraft(changes: Partial<CustomInteractionTheme>): void {
    if (!this.#draft) return;
    this.#draft = { ...this.#draft, ...changes };
    this.#appearance.setDraft(this.#draft);
    this.#updatePreview();
  }

  #updatePalette(key: PaletteKey, value: string): void {
    if (!this.#draft) return;
    this.#updateDraft({ [this.#mode]: { ...this.#draft[this.#mode], [key]: value } });
  }

  #updatePreview(): void {
    if (!this.#preview || !this.#draft) return;
    const palette = this.#draft[this.#mode];
    const appearance = resolveInteractionAppearance(this.#preferences, this.#mode, this.#draft);
    this.#preview.style.background = appearance.colors.neutralStatusBackground;
    this.#preview.style.color = appearance.colors.neutralStatusForeground;
    this.#preview.style.border = `1px solid ${appearance.colors.neutralStatusBorder}`;
    this.#preview.textContent = `${this.#mode === 'light' ? 'Light' : 'Dark'} palette · Selection ${palette.yellow} · Visual ${palette.green}`;
    const samples = this.#create('div');
    samples.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:5px';
    for (const kind of ['selection', 'visual'] as const) {
      const status = interactionStatusColors({ ...appearance, statusStyle: this.#style }, kind);
      const marker = kind === 'selection' ? palette.yellow : palette.green;
      const sample = this.#create('span', kind === 'selection' ? 'SEL' : 'VISUAL');
      sample.style.cssText = `padding:2px 6px;background:${status.background};color:${status.foreground};border:1px solid ${status.border};border-left:${this.#width}px solid ${marker};border-radius:3px`;
      samples.append(sample);
    }
    this.#preview.append(samples);
  }

  #cancel(): void {
    this.#appearance.clearDraft();
    this.#draft = null;
    this.#renderLibrary();
  }

  #saveTheme(): void {
    if (!this.#draft || !this.#validName() || !this.#validWidth() || this.#save?.disabled) return;
    const previous = this.#preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, '');
    const theme = this.#draft;
    try {
      const store = upsertCustomInteractionTheme(this.#store(), theme);
      this.#preferences.set(
        INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
        serializeCustomInteractionThemes(store),
      );
      try {
        this.#preferences.set(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, theme.id);
        if (Number(this.#width) !== this.#appearance.appearance.marker.width)
          this.#preferences.set(INTERACTION_MARKER_WIDTH_PREFERENCE_KEY, Number(this.#width));
        if (this.#style !== this.#appearance.appearance.statusStyle)
          this.#preferences.set(INTERACTION_STATUS_STYLE_PREFERENCE_KEY, this.#style);
      } catch (error) {
        try {
          this.#preferences.set(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, previous);
        } catch {}
        throw error;
      }
      this.#appearance.clearDraft();
      this.#draft = null;
      this.#appearance.refresh();
      this.#renderLibrary();
    } catch {
      this.#message('Could not save theme. Your edits are still here.');
    }
  }
}
