export const ITEM_ATTRIBUTE_PREFERENCE = 'itemAttributes.fields.v1';

export type ItemAttributeType = 'text' | 'number' | 'single-select' | 'multi-select';

export interface ItemAttributeOption {
  readonly id: string;
  readonly label: string;
}

export function isChoiceAttribute(
  type: ItemAttributeType,
): type is 'single-select' | 'multi-select' {
  return type === 'single-select' || type === 'multi-select';
}

export const MAX_ITEM_ATTRIBUTE_OPTIONS = 100;
export const ITEM_ATTRIBUTE_OPTION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;

/** Storage keys and column identities remain stable when a display label changes. */
export interface ItemAttributeDefinition {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly type: ItemAttributeType;
  readonly options?: readonly ItemAttributeOption[];
}

export interface ItemAttributeState {
  readonly value: string | null;
  readonly ambiguous: boolean;
}

export interface ItemAttributeSchema {
  readonly definitions: readonly ItemAttributeDefinition[];
  readonly revision: string;
}
