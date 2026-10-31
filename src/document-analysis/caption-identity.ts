const LABEL =
  '(\\d+(?:[.-]\\d+)*|[零〇一二三四五六七八九十百千万两]+(?:[.．-][零〇一二三四五六七八九十百千万两]+)*)';
const END = '(?=$|[\\s:：.．、,，)\\]】\\-–—\\u3400-\\u9fff])';
const FIGURE = new RegExp(`^\\s*(?:fig(?:ure)?\\.?\\s*|图\\s*)${LABEL}${END}`, 'iu');
const TABLE = new RegExp(`^\\s*(?:table\\s*|表\\s*)${LABEL}${END}`, 'iu');

/** Share authored caption identity across backend regions and native Outline entries. */
export function documentCaptionIdentity(
  title: string,
): { readonly kind: 'figure' | 'table'; readonly label: string } | null {
  const figure = FIGURE.exec(title);
  if (figure) return { kind: 'figure', label: figure[1]! };
  const table = TABLE.exec(title);
  return table ? { kind: 'table', label: table[1]! } : null;
}
