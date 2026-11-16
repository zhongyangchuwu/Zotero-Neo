export interface ReferenceLocalMatch {
  readonly itemID: number;
  readonly attachmentID: number | null;
  readonly title: string;
}

export interface ReferenceAdditionReceipt extends ReferenceLocalMatch {
  readonly reused: boolean;
}
