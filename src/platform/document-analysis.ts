export interface AnalysisPDF {
  readonly fingerprint: string;
  isCurrent(): Promise<boolean>;
}

/** Capture the explicitly resolved attachment, never Main selection or another Reader's item. */
export async function analysisPDF(itemID: number): Promise<AnalysisPDF> {
  const item = await Zotero.Items.getAsync(itemID);
  if (!item || !item.isPDFAttachment()) throw new Error('A PDF attachment is required');
  const path = await item.getFilePathAsync();
  if (!path) throw new Error('PDF file unavailable');
  const fingerprint = await Zotero.Utilities.Internal.md5Async(path);
  const isCurrent = async (): Promise<boolean> =>
    (await item.getFilePathAsync()) === path &&
    (await Zotero.Utilities.Internal.md5Async(path)) === fingerprint;
  return { fingerprint, isCurrent };
}
