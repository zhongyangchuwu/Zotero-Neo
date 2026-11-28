const CHINESE = '[零〇一二三四五六七八九十百千万两]+';
const NUMBER = `(?:[A-Z][.]?)?\\d+(?:[.-]\\d+)*|${CHINESE}(?:[.．-]${CHINESE})*`;
const END = '(?=$|[\\s:：.．、,，)\\]】\\-–—\\u3400-\\u9fff])';
const FIGURE = new RegExp(
  `^\\s*(?:fig(?:ure)?\\.?\\s*|图\\s*)(${NUMBER})(\\s*\\([a-z]\\)|[a-z])?${END}`,
  'iu',
);
const TABLE = new RegExp(`^\\s*(?:table\\s*|表\\s*)(${NUMBER})${END}`, 'iu');
// Roman labels are uppercase and canonical, not words such as "mix" or "civil".
const ROMAN_TABLE = /^\s*(?:table\s*|表\s*)([IVXLCDM]+)(?=$|[\s:：.．、,，)\]】\-–—])/u;
const ROMAN = /^(?=[IVXLCDM]+$)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/u;

export interface DocumentCaptionIdentity {
  readonly kind: 'figure' | 'table';
  readonly label: string;
}

/** Share authored caption identity across backend regions and native Outline entries. */
export function documentCaptionIdentity(title: string): DocumentCaptionIdentity | null {
  const figure = FIGURE.exec(title);
  if (figure) return { kind: 'figure', label: figure[1]! + (figure[2]?.trim() ?? '') };
  const table = TABLE.exec(title);
  if (table) return { kind: 'table', label: table[1]! };
  const roman = ROMAN_TABLE.exec(title.replace(/^\s*table/iu, 'table'));
  return roman && ROMAN.test(roman[1]!) ? { kind: 'table', label: roman[1]! } : null;
}

// "fig" is also the necessary prefix of "figure".
const CAPTION_PREFIXES = ['fig', 'table', '图', '表'].map((lead) =>
  Array.from(lead, (_, offset) => lead.slice(offset)),
);
const LABEL_EVIDENCE = new RegExp(`[\\dIVXLCDM]|${CHINESE}`, 'u');

/** Text-only admission. PDF.js chunks can split a lead and arrive out of visual order. */
export function mayContainDocumentCaption(chunks: Iterable<string>): boolean {
  const links = CAPTION_PREFIXES.map((prefixes) => new Uint8Array(prefixes.length));
  let hasLabel = false;
  for (const chunk of chunks) {
    if (documentCaptionIdentity(chunk)) return true;
    const token = chunk.replace(/\s+/gu, '').toLowerCase();
    if (!token) continue;
    hasLabel ||= LABEL_EVIDENCE.test(chunk);
    for (let index = 0; index < CAPTION_PREFIXES.length; index++) {
      const prefixes = CAPTION_PREFIXES[index]!;
      const edges = links[index]!;
      for (let offset = 0; offset < prefixes.length; offset++) {
        const remaining = prefixes[offset]!;
        if (token.startsWith(remaining)) edges[offset]! |= 1 << prefixes.length;
        else if (remaining.startsWith(token)) edges[offset]! |= 1 << (offset + token.length);
      }
    }
  }
  if (!hasLabel) return false;
  // Deliberately don't require adjacency or a specific label after the marker.
  // Clipping and visual line assembly can reorder or remove intervening chunks.
  return links.some((edges) => {
    let reachable = 1;
    for (let offset = 0; offset < edges.length; offset++)
      if (reachable & (1 << offset)) reachable |= edges[offset]!;
    return !!(reachable & (1 << edges.length));
  });
}
