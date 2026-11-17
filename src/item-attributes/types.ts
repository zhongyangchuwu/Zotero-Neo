export const ITEM_ATTRIBUTE_PREFERENCE = 'itemAttributes.fields.v1';

export type ItemAttributeType = 'text' | 'number';

/** Storage keys and column identities remain stable when a display label changes. */
export interface ItemAttributeDefinition {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly type: ItemAttributeType;
}

export interface ItemAttributeState {
  readonly value: string | null;
  readonly ambiguous: boolean;
}

export interface ItemAttributeSchema {
  readonly definitions: readonly ItemAttributeDefinition[];
  readonly revision: string;
}
