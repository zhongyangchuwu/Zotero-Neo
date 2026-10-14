export type TreeView = {
  tree?: { focus?(): void; readonly _topDiv?: HTMLElement };
  domEl?: HTMLElement;
  rowCount?: number;
  selection?: {
    focused?: number;
    count?: number;
    selected?: Iterable<number>;
    select?(index: number, shouldDebounce?: boolean): void;
    toggleSelect?(index: number, shouldDebounce?: boolean): void;
  };
  focus?(): void;
  ensureRowIsVisible?(index: number): void;
  isContainer?(index: number): boolean;
  isContainerOpen?(index: number): boolean;
  isContainerEmpty?(index: number): boolean;
  toggleOpenState?(index: number): Promise<void> | void;
  getParentIndex?(index: number): number;
  getRow?(index: number): unknown;
  getSelectedCollections?(idOnly?: false): Zotero.Collection[];
  getSelectedCollections?(idOnly: true): number[];
  getRowIndexByID?(id: string): number;
};
