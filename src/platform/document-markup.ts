/** Convert backend HTML to readable plain text without loading resources or inserting remote markup. */
export function documentMarkupText(value: string): string {
  const factory = Reflect.get(Components.classes, '@mozilla.org/parserutils;1') as {
    getService(iid: unknown): {
      convertToPlainText(value: string, flags: number, wrap: number): string;
    };
  };
  const parser = factory.getService(Components.interfaces.nsIParserUtils);
  return parser.convertToPlainText(value, 0, 0);
}

/** Rebuild only table cells as safe markup; do not insert or fetch the provider's HTML. */
export function documentTableClipboard(value: string): {
  readonly text: string;
  readonly html: string;
} {
  const entry = Reflect.get(Components.classes, '@mozilla.org/parserutils;1') as {
    getService(iid: unknown): nsIParserUtils;
  };
  const factory = entry.getService(Components.interfaces.nsIParserUtils);
  const flags =
    (Components.interfaces.nsIParserUtils.SanitizerDropForms ?? 16) |
    (Components.interfaces.nsIParserUtils.SanitizerDropMedia ?? 32) |
    (Components.interfaces.nsIParserUtils.SanitizerDropNonCSSPresentation ?? 8);
  const clean = factory.sanitize(value, flags);
  const window = Zotero.getMainWindow() as unknown as { readonly DOMParser: typeof DOMParser };
  const document = new window.DOMParser().parseFromString(clean, 'text/html');
  const table = document.querySelector('table');
  if (!table) throw new Error('Structured table unavailable');
  const lines: string[] = [],
    rows: string[] = [];
  for (const row of Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[]) {
    if (row.closest('table') !== table) continue;
    const text: string[] = [],
      cells: string[] = [];
    for (const cell of Array.from(row.children) as HTMLElement[]) {
      const tag = cell.tagName.toLowerCase();
      if (tag !== 'td' && tag !== 'th') continue;
      const content = (cell.textContent ?? '').replace(/\s+/gu, ' ').trim();
      text.push(content);
      let attributes = '';
      for (const key of ['colspan', 'rowspan']) {
        const count = Number(cell.getAttribute(key));
        if (Number.isInteger(count) && count > 1 && count <= 100)
          attributes += ` ${key}="${count}"`;
      }
      cells.push(`<${tag}${attributes}>${Zotero.Utilities.htmlSpecialChars(content)}</${tag}>`);
    }
    if (cells.length) {
      lines.push(text.join('\t'));
      rows.push(`<tr>${cells.join('')}</tr>`);
    }
  }
  if (!rows.length) throw new Error('Structured table has no cells');
  return { text: lines.join('\n'), html: `<table>${rows.join('')}</table>` };
}
