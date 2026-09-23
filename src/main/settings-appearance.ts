import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { THEME_VARS } from '../ui/theme';
import {
  DEFAULT_INTERACTION_COLOR_PRESET,
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
  INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
  deleteCustomInteractionTheme,
  findCustomInteractionTheme,
  generateCustomInteractionThemeId,
  parseCustomInteractionThemes,
  seedCustomInteractionTheme,
  serializeCustomInteractionThemes,
  upsertCustomInteractionTheme,
  type CustomInteractionPalette,
  type CustomInteractionTheme,
  type InteractionAppearanceManager,
  type InteractionStatusStyle,
} from './interaction-appearance';

const H = 'http://www.w3.org/1999/xhtml';
const BUILT_INS = [
  { id: 'primer-neutral', name: 'Primer Neutral' },
  { id: 'soft-academic', name: 'Soft Academic' },
  { id: 'yazi-like', name: 'Yazi-like' },
] as const;
const COLORS = [
  ['selection', 'Selection color'],
  ['visual', 'Visual color'],
  ['statusBackground', 'Status background'],
  ['statusForeground', 'Status foreground'],
  ['statusBorder', 'Status border'],
] as const;
type PaletteKey = keyof CustomInteractionPalette;
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
    return [...BUILT_INS].some((builtIn) => builtIn.id === id) ||
      findCustomInteractionTheme(this.#store(), id)
      ? id
      : DEFAULT_INTERACTION_COLOR_PRESET;
  }

  #renderLibrary(): void {
    if (this.#draft) return;
    this.#clearDom();
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
      card.style.cssText = `padding:10px;border:1px solid ${THEME_VARS.border};border-radius:6px;background:${THEME_VARS.elevated}`;
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
        ['Selection', palette.selection],
        ['Visual', palette.visual],
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
    this.#width = String(this.#draft.markerWidth);
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
    const title = this.#create('h3', 'Theme editor');
    title.style.cssText = 'margin:0 0 10px;font-size:15px';
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
    nameLabel.style.cssText = 'display:block;margin-bottom:10px';
    nameLabel.append(name);
    const modes = this.#create('div');
    modes.style.cssText = 'display:flex;gap:6px;margin-bottom:10px';
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
      row.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin:6px 0';
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
      if (this.#validWidth()) this.#updateDraft({ markerWidth: Number(this.#width) });
      this.#validate();
    };
    width.addEventListener('input', onWidth);
    this.#domCleanups.push(() => width.removeEventListener('input', onWidth));
    const widthLabel = this.#create('label', 'Marker width (1–4 CSS px) ');
    widthLabel.append(width);
    const styles = this.#create('div');
    styles.style.cssText = 'display:flex;align-items:center;gap:6px;margin:10px 0';
    styles.append(this.#create('span', 'Status style'));
    const styleButtons = (['neutral', 'tinted'] as const).map((style) =>
      this.#button(style === 'neutral' ? 'Neutral' : 'Tinted', () => {
        this.#updateDraft({ statusStyle: style });
        syncStyle();
      }),
    );
    const syncStyle = (): void =>
      styleButtons.forEach((button, index) =>
        button.setAttribute(
          'aria-pressed',
          String(this.#draft?.statusStyle === (index ? 'tinted' : 'neutral')),
        ),
      );
    styles.append(...styleButtons);
    const preview = this.#create('div');
    preview.setAttribute('aria-label', 'Theme preview');
    preview.style.cssText = 'padding:9px;margin:10px 0;border-radius:4px';
    this.#preview = preview;
    const footer = this.#create('div');
    footer.style.cssText = 'display:flex;gap:8px';
    const save = this.#button('Save', () => this.#saveTheme());
    this.#save = save;
    footer.append(
      save,
      this.#button('Cancel / Back', () => this.#cancel()),
    );
    const status = this.#create('p');
    status.setAttribute('role', 'status');
    this.#status = status;
    this.#root.append(title, nameLabel, modes, fields, widthLabel, styles, preview, footer, status);
    const syncStyleAndPalette = (): void => {
      modeButtons.forEach((button, index) =>
        button.setAttribute('aria-pressed', String(this.#mode === (index ? 'dark' : 'light'))),
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
    this.#preview.style.background = palette.statusBackground;
    this.#preview.style.color = palette.statusForeground;
    this.#preview.style.border = `1px solid ${palette.statusBorder}`;
    this.#preview.textContent = `${this.#mode === 'light' ? 'Light' : 'Dark'} · Selection ${palette.selection} · Visual ${palette.visual}`;
    const selection = this.#create('span', ' SEL ');
    selection.style.cssText = `border-left:${this.#draft.markerWidth}px solid ${palette.selection};margin-left:8px`;
    const visual = this.#create('span', ' VISUAL ');
    visual.style.cssText = `border-left:${this.#draft.markerWidth}px solid ${palette.visual};margin-left:8px`;
    this.#preview.append(selection, visual);
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
