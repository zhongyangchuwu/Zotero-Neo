import type { Cleanup } from '../core/cleanup';
import type { MainWindow } from '../core/contracts';
import type { KeyGuideLanguage } from '../input/key-guide-config';

export interface ItemAttributesPresentation {
  readonly window: MainWindow;
  readonly mode: 'definitions' | 'values';
  readonly items: readonly Zotero.Item[];
  readonly language: () => KeyGuideLanguage;
  readonly themeRoot: (root: HTMLElement) => Cleanup;
  readonly isCurrent: () => boolean;
}

export interface ItemAttributesPort {
  attachWindow(window: MainWindow): Cleanup;
  open(presentation: ItemAttributesPresentation): Cleanup | null;
  handleKey(event: KeyboardEvent): boolean;
  closeOwner(window: Window): void;
}
