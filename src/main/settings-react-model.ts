import type { AppearancePageCommand, AppearancePageModel } from './settings-appearance-model';
import type { KeybindingsPageCommand, KeybindingsPageModel } from './settings-keybindings-model';
import type { ReaderPageCommand, ReaderPageModel } from './settings-reader-model';
import type { SettingsLanguage } from './settings-i18n';
import type { SettingsFormCommand, SettingsFormModel } from './settings-form-model';

export type SettingsSection =
  | 'Appearance'
  | 'Interaction'
  | 'Reader'
  | 'Keybindings'
  | 'Modules'
  | 'Advanced';
export type SettingsPagePresentation =
  | { readonly kind: 'appearance'; readonly model: AppearancePageModel }
  | { readonly kind: 'keybindings'; readonly model: KeybindingsPageModel }
  | { readonly kind: 'reader'; readonly model: ReaderPageModel }
  | { readonly kind: 'form'; readonly model: SettingsFormModel };
export interface SettingsReactModel {
  readonly generation: number;
  readonly language: SettingsLanguage;
  readonly title: string;
  readonly closeLabel: string;
  readonly navigationLabel: string;
  readonly section: SettingsSection;
  readonly sections: readonly { readonly id: SettingsSection; readonly label: string }[];
  readonly page: SettingsPagePresentation;
}
export type SettingsReactCommand = { readonly generation: number } & (
  | { readonly type: 'close' }
  | { readonly type: 'section'; readonly section: SettingsSection }
  | { readonly type: 'appearance'; readonly command: AppearancePageCommand }
  | { readonly type: 'keybindings'; readonly command: KeybindingsPageCommand }
  | { readonly type: 'reader'; readonly command: ReaderPageCommand }
  | { readonly type: 'form'; readonly command: SettingsFormCommand }
);
