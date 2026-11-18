import type { Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { ItemAttributeType } from '../../item-attributes/types';

/** Business callbacks own Extra interpretation, target admission, and persistence. */
export interface NativeItemAttribute {
  readonly id: string;
  readonly label: string;
  readonly type: ItemAttributeType;
  /** For choices, returns the human-readable selection rather than the stored IDs. */
  read(item: Zotero.Item): string;
  canEdit(item: Zotero.Item): boolean;
  write(
    item: Zotero.Item,
    value: string,
    expectedExtra: string,
    isCurrent: () => boolean,
  ): Promise<void>;
}

export interface ItemAttributeNativeHost {
  replace(definitions: readonly NativeItemAttribute[]): void;
  attachWindow(window: MainWindow): Cleanup;
  dispose(): void;
}
