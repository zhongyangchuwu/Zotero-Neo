import type { InteractionStatusColors } from '../../main/interaction-appearance';

export type ItemSelectStatus =
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'selection'; readonly total: number; readonly visible: number }
  | { readonly kind: 'visual'; readonly targetCount: number; readonly selectionCount: number };

export interface MainStatusReactModel {
  readonly status: ItemSelectStatus;
  readonly colors: InteractionStatusColors;
}
