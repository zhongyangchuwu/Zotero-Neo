/** Plain-text fallback for PDF selections when Zotero's native copy command is unavailable. */
export function selectionClipboardText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}
