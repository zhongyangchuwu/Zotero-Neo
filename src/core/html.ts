/** Escape text, including attribute delimiters, before composing our own note markup. */
export function escapeHTML(text: string): string {
  return text.replace(
    /[&<>"']/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
