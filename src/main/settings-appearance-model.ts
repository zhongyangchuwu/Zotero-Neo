import type {
  InteractionPalette8,
  InteractionStatusColors,
  InteractionStatusStyle,
} from './interaction-appearance';
import type { SettingsLanguage } from './settings-i18n';

export type AppearancePaletteMode = 'light' | 'dark';
export type AppearanceColor = keyof InteractionPalette8;
export interface AppearanceThemeModel {
  id: string;
  name: string;
  flavor: string;
  custom: boolean;
  selected: boolean;
  palette: InteractionPalette8;
}
export interface AppearancePageModel {
  language: SettingsLanguage;
  view: 'library' | 'editor';
  markerWidth: number;
  statusStyle: InteractionStatusStyle;
  themes: AppearanceThemeModel[];
  confirmedDelete: string | null;
  status: string;
  editor: null | {
    isNew: boolean;
    name: string;
    nameValid: boolean;
    mode: AppearancePaletteMode;
    colors: InteractionPalette8;
    hex: Record<AppearancePaletteMode, Record<AppearanceColor, string>>;
    canAdd: boolean;
    preview: {
      background: string;
      foreground: string;
      border: string;
      markerWidth: number;
      selection: InteractionStatusColors;
      visual: InteractionStatusColors;
    };
  };
}
export type AppearancePageCommand =
  | { type: 'marker-width'; value: number }
  | { type: 'status-style'; value: InteractionStatusStyle }
  | { type: 'select'; id: string }
  | { type: 'edit'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'create' }
  | { type: 'copy'; id: string }
  | { type: 'back' }
  | { type: 'add' }
  | { type: 'name'; value: string }
  | { type: 'mode'; value: AppearancePaletteMode }
  | { type: 'hex'; key: AppearanceColor; value: string }
  | { type: 'picker'; key: AppearanceColor; value: string }
  | { type: 'reset' };
