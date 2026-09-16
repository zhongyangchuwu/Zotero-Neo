/** Clipboard text for Neo-owned PDF DOM selections; PDF layout whitespace is not semantic. */
export function selectionClipboardText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}
