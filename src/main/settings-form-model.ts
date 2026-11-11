export interface SettingsChoiceOption {
  readonly value: string;
  readonly label: string;
}
interface SettingsFieldBase {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly note?: string;
}
export type SettingsFormField = SettingsFieldBase &
  (
    | { readonly kind: 'boolean'; readonly value: boolean }
    | {
        readonly kind: 'number';
        readonly value: number;
        readonly minimum: number;
        readonly maximum: number;
        readonly step: number;
      }
    | {
        readonly kind: 'text';
        readonly value: string;
        readonly placeholder?: string;
        readonly multiline?: boolean;
        readonly commit?: 'input' | 'change';
        readonly invalid?: boolean;
      }
    | {
        readonly kind: 'choice';
        readonly value: string;
        readonly options: readonly SettingsChoiceOption[];
      }
    | { readonly kind: 'action'; readonly primary?: boolean }
  );
export interface SettingsFormGroup {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly fields: readonly SettingsFormField[];
}
export interface SettingsFormModel {
  readonly title: string;
  readonly description?: string;
  readonly groups: readonly SettingsFormGroup[];
  readonly status?: { readonly text: string; readonly error?: boolean };
}
export type SettingsFormCommand =
  | { readonly type: 'value'; readonly id: string; readonly value: boolean | number | string }
  | { readonly type: 'action'; readonly id: string };
