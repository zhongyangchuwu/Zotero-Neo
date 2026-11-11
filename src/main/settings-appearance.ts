import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
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
} from './interaction-appearance';
import { settingsText, type SettingsLanguage, type SettingsMessage } from './settings-i18n';
import type {
  AppearanceColor,
  AppearancePageCommand,
  AppearancePageModel,
  AppearancePaletteMode,
} from './settings-appearance-model';

const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME = /^[^\x00-\x1f\x7f]{1,100}$/;
const MODES = ['light', 'dark'] as const;
const COLORS: readonly AppearanceColor[] = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
];
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
  paletteMode: AppearancePaletteMode;
}

/** Appearance library and autosaving custom editor for one open Settings workspace. */
export class SettingsAppearance {
  readonly #window: MainWindow;
  readonly #preferences: PreferenceStore;
  readonly #appearance: InteractionAppearanceManager;
  readonly #state: SettingsAppearanceState;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #cleanups: Array<() => void> = [];
  #theme: CustomInteractionTheme | null = null;
  #isNew = false;
  #nameText = '';
  #hexText: Record<AppearancePaletteMode, Record<AppearanceColor, string>> | null = null;
  #confirmedDelete: string | null = null;
  #status = '';
  #writing = false;
  #disposed = false;

  constructor(
    window: MainWindow,
    preferences: PreferenceStore,
    appearance: InteractionAppearanceManager,
    state: SettingsAppearanceState,
    language: SettingsLanguage,
    changed: () => void,
  ) {
    this.#window = window;
    this.#preferences = preferences;
    this.#appearance = appearance;
    this.#state = state;
    this.#language = language;
    this.#changed = changed;
    this.#cleanups.push(appearance.observe(() => this.#refresh()));
    for (const key of [
      INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
      INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
    ]) {
      const cleanup = preferences.observe?.(key, () => this.#refresh());
      if (cleanup) this.#cleanups.push(cleanup);
    }
    if (state.view === 'editor' && state.editingThemeId) {
      const theme = findCustomInteractionTheme(this.#store(), state.editingThemeId);
      if (theme) this.#setEditor(theme, false);
      else this.#library();
    } else this.#library();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#isNew) {
      this.#state.view = 'library';
      this.#state.editingThemeId = null;
    }
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
  }

  model(): AppearancePageModel {
    const appearance = this.#appearance.appearance;
    const active = this.#activeId();
    const themes = [...INTERACTION_THEME_CATALOG, ...this.#store().themes].map((theme) => ({
      id: theme.id,
      name: theme.name,
      flavor: FLAVORS[theme.id] ?? this.#t('Custom'),
      custom: 'version' in theme,
      selected: theme.id === active,
      palette: { ...theme[appearance.theme] },
    }));
    let editor: AppearancePageModel['editor'] = null;
    if (this.#theme && this.#hexText) {
      const mode = this.#state.paletteMode;
      const resolved = resolveInteractionAppearance(
        this.#preferences,
        mode,
        this.#isNew ? this.#theme : null,
      );
      editor = {
        isNew: this.#isNew,
        name: this.#nameText,
        nameValid: NAME.test(this.#nameText.trim()),
        mode,
        colors: { ...this.#theme[mode] },
        hex: { light: { ...this.#hexText.light }, dark: { ...this.#hexText.dark } },
        canAdd: this.#valid(),
        preview: {
          background: resolved.colors.neutralStatusBackground,
          foreground: resolved.colors.neutralStatusForeground,
          border: resolved.colors.neutralStatusBorder,
          markerWidth: resolved.marker.width,
          selection: interactionStatusColors(resolved, 'selection'),
          visual: interactionStatusColors(resolved, 'visual'),
        },
      };
    }
    return {
      language: this.#language,
      view: this.#state.view,
      markerWidth: appearance.marker.width,
      statusStyle: appearance.statusStyle,
      themes,
      confirmedDelete: this.#confirmedDelete,
      status: this.#status,
      editor,
    };
  }

  dispatch(command: AppearancePageCommand): void {
    if (this.#disposed || !command || typeof command !== 'object') return;
    const library = this.#state.view === 'library';
    const ids = [...INTERACTION_THEME_CATALOG, ...this.#store().themes].map((theme) => theme.id);
    switch (command.type) {
      case 'marker-width':
        if (library && [1, 2, 3, 4].includes(command.value))
          this.#setAppearance(INTERACTION_MARKER_WIDTH_PREFERENCE_KEY, command.value);
        break;
      case 'status-style':
        if (library && (command.value === 'neutral' || command.value === 'tinted'))
          this.#setAppearance(INTERACTION_STATUS_STYLE_PREFERENCE_KEY, command.value);
        break;
      case 'select':
        if (library && ids.includes(command.id)) this.#select(command.id);
        break;
      case 'edit':
        if (library && findCustomInteractionTheme(this.#store(), command.id))
          this.#openEditor(command.id);
        break;
      case 'delete':
        if (library && findCustomInteractionTheme(this.#store(), command.id))
          this.#deleteTheme(command.id);
        break;
      case 'create':
        if (library) this.#createTheme(this.#activeId());
        break;
      case 'copy':
        if (library && ids.includes(command.id)) this.#createTheme(command.id);
        break;
      case 'back':
        if (!library) this.#library();
        break;
      case 'add':
        if (!library && this.#isNew && this.#valid()) this.#addTheme();
        break;
      case 'mode':
        if (!library && (command.value === 'light' || command.value === 'dark'))
          this.#state.paletteMode = command.value;
        break;
      case 'name':
        if (
          !library &&
          this.#theme &&
          typeof command.value === 'string' &&
          command.value.length <= 100
        ) {
          this.#nameText = command.value;
          const name = command.value.trim();
          if (!NAME.test(name)) this.#status = this.#t('Enter a name (1–100 characters).');
          else if (name !== this.#theme.name) this.#applyTheme({ ...this.#theme, name });
          else this.#status = '';
        }
        break;
      case 'hex':
      case 'picker':
        if (
          !library &&
          this.#theme &&
          this.#hexText &&
          COLORS.includes(command.key) &&
          typeof command.value === 'string' &&
          command.value.length <= 64
        ) {
          if (command.type === 'picker' && !HEX.test(command.value)) break;
          const mode = this.#state.paletteMode;
          if (command.type === 'hex') this.#hexText[mode][command.key] = command.value;
          if (HEX.test(command.value)) {
            const color = command.value.toUpperCase();
            if (color !== this.#theme[mode][command.key]) {
              if (
                this.#applyTheme({
                  ...this.#theme,
                  [mode]: { ...this.#theme[mode], [command.key]: color },
                }) &&
                command.type === 'picker'
              )
                this.#hexText[mode][command.key] = color;
            } else {
              if (command.type === 'picker') this.#hexText[mode][command.key] = color;
              this.#status = '';
            }
          }
        }
        break;
      case 'reset':
        if (!library && this.#theme) {
          const base = INTERACTION_THEME_CATALOG.find(
            (theme) => theme.id === DEFAULT_INTERACTION_COLOR_PRESET,
          )!;
          const next = { ...this.#theme, light: { ...base.light }, dark: { ...base.dark } };
          if (this.#applyTheme(next))
            this.#hexText = { light: { ...next.light }, dark: { ...next.dark } };
        }
        break;
    }
    this.#notify();
  }

  #t(message: SettingsMessage): string {
    return settingsText(this.#language, message);
  }
  #notify(): void {
    if (!this.#disposed && !this.#writing) this.#changed();
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
  #valid(): boolean {
    return (
      NAME.test(this.#nameText.trim()) &&
      !!this.#hexText &&
      MODES.every((mode) => COLORS.every((key) => HEX.test(this.#hexText![mode][key])))
    );
  }
  #library(): void {
    this.#state.view = 'library';
    this.#state.editingThemeId = null;
    this.#theme = null;
    this.#hexText = null;
    this.#isNew = false;
    this.#status = '';
  }
  #setEditor(theme: CustomInteractionTheme, isNew: boolean): void {
    this.#theme = theme;
    this.#isNew = isNew;
    this.#nameText = theme.name;
    this.#hexText = { light: { ...theme.light }, dark: { ...theme.dark } };
    this.#state.view = 'editor';
    this.#state.editingThemeId = isNew ? null : theme.id;
    this.#status = '';
  }
  #refresh(): void {
    if (this.#writing || this.#disposed) return;
    if (!this.#isNew && this.#state.view === 'editor') {
      const theme =
        this.#state.editingThemeId &&
        findCustomInteractionTheme(this.#store(), this.#state.editingThemeId);
      if (theme) {
        const previous = this.#theme;
        if (!previous || previous.name !== theme.name) this.#nameText = theme.name;
        if (!previous || !this.#hexText) {
          this.#hexText = { light: { ...theme.light }, dark: { ...theme.dark } };
        } else {
          for (const mode of MODES)
            for (const key of COLORS) {
              if (previous[mode][key] !== theme[mode][key])
                this.#hexText[mode][key] = theme[mode][key];
            }
        }
        this.#theme = theme;
      } else this.#library();
    }
    this.#notify();
  }
  #write(action: () => void): void {
    this.#writing = true;
    try {
      action();
    } finally {
      this.#writing = false;
    }
  }
  #setAppearance(key: string, value: number | 'neutral' | 'tinted'): void {
    try {
      this.#write(() => {
        this.#preferences.set(key, value);
        this.#appearance.refresh();
      });
      this.#status = '';
    } catch {
      this.#status = this.#t('Could not update appearance.');
    }
  }
  #select(id: string): void {
    try {
      this.#write(() => {
        this.#preferences.set(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, id);
        this.#appearance.refresh();
      });
      this.#status = '';
    } catch {
      this.#status = this.#t('Could not select theme.');
    }
  }
  #createTheme(source: string): void {
    const id = generateCustomInteractionThemeId(
      this.#store().themes.map((theme) => theme.id),
      () => {
        const uuid = this.#window.document.defaultView?.crypto?.randomUUID();
        return uuid ? `custom:${uuid}` : '';
      },
    );
    const theme = seedCustomInteractionTheme(this.#preferences, source, id, this.#t('New theme'));
    this.#state.paletteMode = this.#appearance.appearance.theme;
    this.#setEditor(theme, true);
  }
  #addTheme(): void {
    const theme = this.#theme;
    if (!theme) return;
    const original = this.#preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, '');
    try {
      this.#write(() => {
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
        this.#appearance.refresh();
      });
      this.#library();
    } catch {
      this.#status = this.#t('Could not add theme. Your edits are still here.');
    }
  }
  #deleteTheme(id: string): void {
    if (this.#confirmedDelete !== id) {
      this.#confirmedDelete = id;
      return;
    }
    this.#confirmedDelete = null;
    const original = this.#preferences.get(INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY, '');
    const active = this.#activeId() === id;
    try {
      this.#write(() => {
        this.#preferences.set(
          INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
          serializeCustomInteractionThemes(deleteCustomInteractionTheme(this.#store(), id)),
        );
        if (active) {
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
        this.#appearance.refresh();
      });
      this.#library();
    } catch {
      this.#status = this.#t('Could not delete theme.');
    }
  }
  #openEditor(id: string): void {
    const theme = findCustomInteractionTheme(this.#store(), id);
    if (!theme) return;
    try {
      this.#write(() => {
        if (this.#activeId() !== id)
          this.#preferences.set(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, id);
        this.#appearance.refresh();
      });
      this.#setEditor(theme, false);
    } catch {
      this.#status = this.#t('Could not activate theme for editing.');
    }
  }
  #applyTheme(theme: CustomInteractionTheme): boolean {
    if (this.#isNew) {
      this.#theme = theme;
      this.#status = '';
      return true;
    }
    try {
      this.#write(() => {
        this.#preferences.set(
          INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY,
          serializeCustomInteractionThemes(upsertCustomInteractionTheme(this.#store(), theme)),
        );
        this.#theme = theme;
        this.#appearance.refresh();
      });
      this.#status = this.#t('Saved');
      return true;
    } catch {
      this.#status = this.#t('Could not save change. Previous theme is still active.');
      return false;
    }
  }
}
