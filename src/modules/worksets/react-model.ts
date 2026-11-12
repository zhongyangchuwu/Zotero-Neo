export interface SelectionPanelReactModel {
  readonly entries: ReadonlyArray<{
    readonly title: string;
    readonly state: 'visible' | 'hidden' | 'unavailable';
    readonly libraryID: number;
    readonly itemID: number;
  }>;
  readonly selected: number;
  readonly footer: string;
}

// Keyboard and backdrop input remain owned by the native controller.
export type SelectionPanelReactCommand = never;
