import type { ItemAttributeDefinition, ItemAttributeType } from './types';

export interface ItemAttributesModel {
  readonly chinese: boolean;
  readonly mode: 'definitions' | 'values';
  readonly definitions: readonly ItemAttributeDefinition[];
  readonly available: boolean;
  readonly busy: boolean;
  readonly status: string;
  readonly error: boolean;
  readonly selectedID: string;
  readonly targets: readonly {
    readonly id: number;
    readonly title: string;
    readonly value: string | null;
    readonly ambiguous: boolean;
  }[];
  readonly mixed: boolean;
  readonly input: string;
  readonly canWrite: boolean;
  readonly review: { readonly value: string | null } | null;
  readonly draft: {
    readonly id: string | null;
    readonly key: string;
    readonly label: string;
    readonly type: ItemAttributeType;
  } | null;
  readonly removing: ItemAttributeDefinition | null;
  readonly discard: 'close' | ItemAttributesModel['mode'] | null;
}

export type ItemAttributesCommand =
  | {
      readonly type:
        | 'close'
        | 'keep-editing'
        | 'confirm-discard'
        | 'new-definition'
        | 'cancel-definition'
        | 'save-definition'
        | 'cancel-remove'
        | 'confirm-remove'
        | 'refresh-values'
        | 'set-value'
        | 'clear-value'
        | 'cancel-review'
        | 'confirm-values';
    }
  | { readonly type: 'mode'; readonly value: 'definitions' | 'values' }
  | { readonly type: 'select' | 'edit-definition' | 'remove-definition'; readonly id: string }
  | { readonly type: 'input' | 'draft-label' | 'draft-key'; readonly value: string }
  | { readonly type: 'draft-type'; readonly value: ItemAttributeType };
